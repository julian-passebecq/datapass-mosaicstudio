"""Write `datapass.artifact` v1 JSON from Python. Standard library only.

The TypeScript validator (src/framework/foundation/artifact.ts, validateArtifact)
stays the source of truth. This module mirrors its three gates so a notebook fails
early in Python instead of in the browser:

    envelope   inert finite JSON, depth, 1 MiB compact UTF-8      (check_envelope)
    structure  exactly docs/contracts/artifact.schema.json        (check_structure)
    semantic   references, duplicate ids, self-reference, rows    (check_semantics)

A rejection is an ArtifactError with .gate and .path (JSON Pointer of the offending
field). tests/fixtures/artifact-corpus is decided identically by JSON Schema, the
TypeScript validator and this module (tests/artifact-corpus.test.mjs).
Command line: python py/datapass_artifact.py [--set] FILE... (JSON lines, exit 1 on reject).

    from datapass_artifact import to_artifact, write_manifest
    to_artifact(rows, id="wind-aep", title="...", source="py/notebooks/x.py",
                representations=[{"id": "table", "title": "Rows", "kind": "table"}],
                out_dir="clients/<client>/public/artifacts")
    write_manifest("clients/<client>/public/artifacts")

Bounded results only: 1 MB (UTF-8, compact JSON), 10 000 rows, 40 columns.
Heavy data stays in Python; an optional Parquet sidecar (pyarrow) is for
downstream tools, the Studio page never reads it.
"""
from __future__ import annotations

import hashlib
import inspect
import json
import math
import os
import re
import tempfile
import time
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

FORMAT = "datapass.artifact"
VERSION = 1
ARTIFACT_BYTES = 1048576
MAX_ROWS = 10000
MAX_COLUMNS = 40
MAX_REPRESENTATIONS = 12
MANIFEST_NAME = "manifest.json"
_ID = re.compile(r"^[a-z][a-zA-Z0-9_-]{0,79}$")
_RESERVED = {"constructor", "prototype", "__proto__"}
_HEX64 = re.compile(r"^[0-9a-f]{64}$")
_PRODUCERS = {"script", "notebook", "service"}
MAX_INPUTS = 24
MAX_EVIDENCE = 8
MAX_DEPENDS_ON = 12
MAX_LINE = 100000
MAX_PATH = 260
_KINDS = {"table", "chart", "metric", "text", "json"}
_REP_KEYS = {
    "table": {"id", "title", "kind", "inputs"},
    "text": {"id", "title", "kind", "inputs"},
    "json": {"id", "title", "kind", "inputs"},
    "chart": {"id", "title", "kind", "chart", "x", "y", "unit", "inputs"},
    "metric": {"id", "title", "kind", "row", "column", "unit", "digits", "inputs"},
}


class ArtifactError(ValueError):
    """The artifact would be rejected by the Studio validator.

    gate: "envelope" | "structure" | "semantic" (None for writer-side errors such as column inference).
    path: JSON Pointer of the offending field ("" = the whole document), as reported by the TypeScript validator.
    """

    def __init__(self, message: str, gate: str | None = None, path: str | None = None):
        self.gate, self.path, self.detail = gate, path, message
        super().__init__(message if path is None else f"{path or '/'}: {message}")


_RESERVED_KEYS = {"__proto__", "prototype", "constructor"}
# ECMAScript WhiteSpace + LineTerminator (String.prototype.trim and RegExp \s); str.isspace() differs.
_NON_BLANK = re.compile("[^\t\n\x0b\x0c\r    -     　﻿]")
_UNSAFE_PATH_CHAR = re.compile(r"[\\:\x00-\x1f\x7f]")
_REP_FIELDS = {"table": (), "text": (), "json": (), "chart": ("chart", "x", "y", "unit"),
               "metric": ("row", "column", "unit", "digits")}
_REP_REQUIRED = {"table": (), "text": (), "json": (), "chart": ("chart", "x", "y"), "metric": ("row", "column")}


def _fail(gate: str, path: str, message: str):
    raise ArtifactError(message, gate, path)


def _ptr(base: str, key: Any) -> str:
    return base + "/" + str(key).replace("~", "~0").replace("/", "~1")


def _is_id(value: Any) -> bool:
    return isinstance(value, str) and _ID.fullmatch(value) is not None and value not in _RESERVED


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_integer(value: Any) -> bool:
    """JSON integer: 3 and 3.0 are the same JSON number (JavaScript parses both to 3)."""
    return (isinstance(value, int) and not isinstance(value, bool)) or (isinstance(value, float) and value.is_integer())


def _js_number(value: int | float) -> str:
    """Number formatting of ECMAScript Number::toString (String(n) and JSON.stringify)."""
    if isinstance(value, int):
        return str(value)
    if value == 0:
        return "0"
    sign = "-" if value < 0 else ""
    digits_t, exponent = Decimal(repr(abs(value))).normalize().as_tuple()[1:]
    digits = "".join(map(str, digits_t))
    k, n = len(digits), len(digits) + exponent
    if k <= n <= 21:
        body = digits + "0" * (n - k)
    elif 0 < n <= 21:
        body = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        body = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        body = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + ("+" if e > 0 else "-") + str(abs(e))
    return sign + body


def _js_string(value: Any) -> str:
    """String(value) in JavaScript for a row key (string or number)."""
    return _js_number(value) if _is_number(value) else str(value)


def _identifier(value: Any, label: str) -> str:
    if not _is_id(value):
        raise ArtifactError(f"{label}: invalid id {value!r} (use ^[a-z][a-zA-Z0-9_-]{{0,79}}$)")
    return value


def _text(value: Any, label: str, max_len: int, required: bool = True) -> str:
    if not isinstance(value, str) or len(value) > max_len or (required and not _NON_BLANK.search(value)):
        raise ArtifactError(f"{label}: invalid text (string, <= {max_len} chars{', not blank' if required else ''})")
    return value


# ---- Gate 1: envelope ------------------------------------------------------------------------------------------
def _js_json(value: Any) -> Any:
    if isinstance(value, float) and _is_integer(value) and abs(value) < 1e21:
        return int(value)
    if isinstance(value, Mapping):
        return {k: _js_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_js_json(v) for v in value]
    return value


def encode(artifact: Mapping[str, Any]) -> bytes:
    """Compact UTF-8 JSON, the encoding the 1 MiB budget is measured on (numbers formatted like JSON.stringify)."""
    try:
        text = json.dumps(_js_json(artifact), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as error:
        raise ArtifactError(f"JSON requires finite numbers and inert values: {error}", "envelope", "") from error
    return text.encode("utf-8", "surrogatepass")


def check_envelope(artifact: Any) -> None:
    """Mirror of boundedJson: inert JSON values, finite numbers, depth <= 24, <= 500 000 nodes, no prototype keys, 1 MiB."""
    nodes = 0

    def walk(value: Any, depth: int) -> None:
        nonlocal nodes
        nodes += 1
        if nodes > 500000 or depth > 24:
            _fail("envelope", "", "JSON structure budget exceeded")
        if value is None or isinstance(value, (bool, str)):
            return
        if _is_number(value):
            if isinstance(value, float) and not math.isfinite(value):
                _fail("envelope", "", "JSON requires finite numbers")
            return
        if isinstance(value, Mapping):
            for key, entry in value.items():
                if not isinstance(key, str):
                    _fail("envelope", "", "Expected inert JSON values")
                if key in _RESERVED_KEYS:
                    _fail("envelope", "", "Unsafe JSON property")
                walk(entry, depth + 1)
            return
        if isinstance(value, list):
            for entry in value:
                walk(entry, depth + 1)
            return
        _fail("envelope", "", "Expected inert JSON values")

    walk(artifact, 0)
    size = len(encode(artifact))
    if size > ARTIFACT_BYTES:
        _fail("envelope", "", f"artifact byte budget exceeded ({size} > {ARTIFACT_BYTES} bytes, compact UTF-8). "
                              "Aggregate in Python or use parquet_sidecar for the full data")


# ---- Gate 2: structure (exactly docs/contracts/artifact.schema.json) ------------------------------------------
def _shape(value: Any, path: str, label: str, allowed: Sequence[str], required: Sequence[str] | None = None) -> None:
    if not isinstance(value, Mapping):
        _fail("structure", path, f"{label}: expected an object")
    for key in value:
        if key not in allowed:
            _fail("structure", _ptr(path, key), f"{label}: unexpected fields ({key})")
    for key in (allowed if required is None else required):
        if key not in value:
            _fail("structure", _ptr(path, key), f"{label}: missing required field {key}")


def _s_id(value: Any, path: str, label: str) -> None:
    if not _is_id(value):
        _fail("structure", path, f"{label}: invalid id {value!r} (^[a-z][a-zA-Z0-9_-]{{0,79}}$, not reserved)")


def _s_text(value: Any, path: str, label: str, max_len: int, filled: bool) -> None:
    if not isinstance(value, str) or len(value) > max_len or (filled and not _NON_BLANK.search(value)):
        _fail("structure", path, f"{label}: invalid text (string, at most {max_len} characters{', not blank' if filled else ''})")


def _s_int(value: Any, path: str, label: str, low: int, high: int) -> None:
    if not _is_integer(value) or not low <= value <= high:
        _fail("structure", path, f"{label}: integer {low}..{high} required")


def _s_enum(value: Any, path: str, label: str, choices: Sequence[str]) -> None:
    if not isinstance(value, str) or value not in choices:
        _fail("structure", path, f"{label}: must be one of {', '.join(choices)}")


def _s_list(value: Any, path: str, label: str, high: int, low: int = 0) -> None:
    if not isinstance(value, list):
        _fail("structure", path, f"{label}: expected an array")
    if not low <= len(value) <= high:
        _fail("structure", path, f"{label}: list budget ({low}..{high} items)")


def _s_id_array(value: Any, path: str, label: str, high: int) -> None:
    _s_list(value, path, label, high)
    for i, item in enumerate(value):
        _s_id(item, _ptr(path, i), label)
    if len(set(value)) != len(value):
        _fail("structure", path, f"{label}: duplicate id")


def _safe_path(value: Any) -> bool:
    return (isinstance(value, str) and 0 < len(value) <= MAX_PATH and not _UNSAFE_PATH_CHAR.search(value)
            and all(part not in ("", ".", "..") for part in value.split("/")))


def _s_evidence(refs: Any, path: str, label: str) -> None:
    _s_list(refs, path, f"{label} evidence", MAX_EVIDENCE)
    for i, ref in enumerate(refs):
        at = _ptr(path, i)
        _shape(ref, at, f"{label} evidence", ("path", "start", "end", "label"))
        if not _safe_path(ref["path"]):
            _fail("structure", _ptr(at, "path"), f"{label} evidence: path must be a safe relative path "
                                                 f"(forward slashes, no drive, no '..', at most {MAX_PATH} characters)")
        _s_int(ref["start"], _ptr(at, "start"), f"{label} evidence: invalid line range start", 1, MAX_LINE)
        _s_int(ref["end"], _ptr(at, "end"), f"{label} evidence: invalid line range end", 1, MAX_LINE)
        _s_text(ref["label"], _ptr(at, "label"), f"{label} evidence label", 160, True)


def _s_provenance(prov: Any, path: str) -> None:
    _shape(prov, path, "artifact provenance", ("kind", "source", "runId", "producer", "inputHash", "inputs", "dependsOn"),
           ("kind", "source"))
    _s_enum(prov["kind"], _ptr(path, "kind"), "unknown artifact provenance kind", ("synthetic", "provided", "computed"))
    _s_text(prov["source"], _ptr(path, "source"), "artifact source", 2000, True)
    if "runId" in prov:
        _s_id(prov["runId"], _ptr(path, "runId"), "artifact run")
    if "producer" in prov:
        at = _ptr(path, "producer")
        _shape(prov["producer"], at, "artifact producer", ("kind", "name", "evidence"), ("kind", "name"))
        _s_enum(prov["producer"]["kind"], _ptr(at, "kind"), "artifact producer kind", sorted(_PRODUCERS))
        _s_text(prov["producer"]["name"], _ptr(at, "name"), "artifact producer name", 160, True)
        if "evidence" in prov["producer"]:
            _s_evidence(prov["producer"]["evidence"], _ptr(at, "evidence"), "producer")
    if "inputHash" in prov and (not isinstance(prov["inputHash"], str) or not _HEX64.fullmatch(prov["inputHash"])):
        _fail("structure", _ptr(path, "inputHash"), "artifact inputHash must be 64 lowercase hex characters (sha256)")
    if "inputs" in prov:
        at = _ptr(path, "inputs")
        _s_list(prov["inputs"], at, "artifact inputs", MAX_INPUTS)
        for i, item in enumerate(prov["inputs"]):
            ip = _ptr(at, i)
            _shape(item, ip, "artifact input", ("id", "label", "value", "unit", "evidence"), ("id", "label"))
            _s_id(item["id"], _ptr(ip, "id"), "artifact input id")
            _s_text(item["label"], _ptr(ip, "label"), "artifact input label", 160, True)
            if "value" in item:
                v = item["value"]
                if not (isinstance(v, bool) or _is_number(v) or (isinstance(v, str) and len(v) <= 400)):
                    _fail("structure", _ptr(ip, "value"), "artifact input value must be a finite number, boolean or short string (at most 400 characters)")
            if "unit" in item:
                _s_text(item["unit"], _ptr(ip, "unit"), "artifact input unit", 40, False)
            if "evidence" in item:
                _s_evidence(item["evidence"], _ptr(ip, "evidence"), "input")
    if "dependsOn" in prov:
        _s_id_array(prov["dependsOn"], _ptr(path, "dependsOn"), "artifact dependsOn", MAX_DEPENDS_ON)


def _s_payload(payload: Any, path: str) -> None:
    if not isinstance(payload, Mapping):
        _fail("structure", path, "artifact payload: expected an object")
    kind = payload.get("kind")
    if kind == "table":
        _shape(payload, path, "table payload", ("kind", "rowKey", "columns", "rows"))
        _s_id(payload["rowKey"], _ptr(path, "rowKey"), "rowKey")
        cp = _ptr(path, "columns")
        _s_list(payload["columns"], cp, "columns", MAX_COLUMNS, 1)
        for i, c in enumerate(payload["columns"]):
            at = _ptr(cp, i)
            _shape(c, at, "column", ("id", "label", "type", "unit", "nullable"), ("id", "label", "type"))
            _s_id(c["id"], _ptr(at, "id"), "column.id")
            _s_text(c["label"], _ptr(at, "label"), "column.label", 120, True)
            _s_enum(c["type"], _ptr(at, "type"), "column.type", ("string", "number", "boolean"))
            if "unit" in c:
                _s_text(c["unit"], _ptr(at, "unit"), "column.unit", 40, False)
            if "nullable" in c and not isinstance(c["nullable"], bool):
                _fail("structure", _ptr(at, "nullable"), "column.nullable must be a boolean")
        rp = _ptr(path, "rows")
        _s_list(payload["rows"], rp, "rows", MAX_ROWS)
        for i, row in enumerate(payload["rows"]):
            at = _ptr(rp, i)
            if not isinstance(row, Mapping):
                _fail("structure", at, "row: expected an object")
            if len(row) > MAX_COLUMNS:
                _fail("structure", at, f"row: more than {MAX_COLUMNS} cells")
            for key, v in row.items():
                if not _is_id(key):
                    _fail("structure", _ptr(at, key), "row: cell name must be a column id")
                if not (v is None or isinstance(v, bool) or _is_number(v) or (isinstance(v, str) and len(v) <= 4000)):
                    _fail("structure", _ptr(at, key), "row: cells are null, boolean, finite number or string (at most 4000 characters)")
        return
    if kind == "text":
        _shape(payload, path, "text payload", ("kind", "text"))
        _s_text(payload["text"], _ptr(path, "text"), "text payload", 20000, False)
        return
    _fail("structure", _ptr(path, "kind"), "unknown payload kind (table or text)")


def _s_representations(reps: Any, path: str) -> None:
    _s_list(reps, path, "artifact representation budget", MAX_REPRESENTATIONS, 1)
    for i, rep in enumerate(reps):
        at = _ptr(path, i)
        if not isinstance(rep, Mapping):
            _fail("structure", at, "representation: expected an object")
        kind = rep.get("kind")
        if not isinstance(kind, str) or kind not in _REP_FIELDS:
            _fail("structure", _ptr(at, "kind"), f"unsupported representation kind {kind!r}")
        _shape(rep, at, "representation", ("id", "title", "kind", "inputs", *_REP_FIELDS[kind]),
               ("id", "title", "kind", *_REP_REQUIRED[kind]))
        _s_id(rep["id"], _ptr(at, "id"), "representation id")
        _s_text(rep["title"], _ptr(at, "title"), "representation title", 160, True)
        if "inputs" in rep:
            _s_id_array(rep["inputs"], _ptr(at, "inputs"), "representation inputs", MAX_INPUTS)
        if kind == "chart":
            _s_enum(rep["chart"], _ptr(at, "chart"), "chart", ("bar", "line", "scatter"))
            _s_id(rep["x"], _ptr(at, "x"), "chart x")
            _s_id(rep["y"], _ptr(at, "y"), "chart y")
            if "unit" in rep:
                _s_text(rep["unit"], _ptr(at, "unit"), "chart unit", 30, False)
        if kind == "metric":
            _s_text(rep["row"], _ptr(at, "row"), "metric row", 160, True)
            _s_id(rep["column"], _ptr(at, "column"), "metric column")
            if "unit" in rep:
                _s_text(rep["unit"], _ptr(at, "unit"), "metric unit", 40, False)
            if "digits" in rep:
                _s_int(rep["digits"], _ptr(at, "digits"), "metric digits", 0, 6)


def check_structure(artifact: Any) -> None:
    """Gate 2: the exact JSON Schema structure (types, required/unknown fields, enums, lengths, patterns, list bounds)."""
    _shape(artifact, "", "artifact", ("format", "version", "id", "title", "provenance", "payload", "representations"))
    if artifact["format"] != FORMAT:
        _fail("structure", "/format", "unsupported artifact format")
    if not _is_number(artifact["version"]) or artifact["version"] != VERSION:
        _fail("structure", "/version", "unsupported artifact version")
    _s_id(artifact["id"], "/id", "artifact id")
    _s_text(artifact["title"], "/title", "artifact title", 160, True)
    _s_provenance(artifact["provenance"], "/provenance")
    _s_payload(artifact["payload"], "/payload")
    _s_representations(artifact["representations"], "/representations")


# ---- Gate 3: semantics ------------------------------------------------------------------------------------------
def _m_evidence(refs: Any, path: str, label: str) -> None:
    seen = set()
    for i, ref in enumerate(refs or []):
        if ref["end"] < ref["start"]:
            _fail("semantic", _ptr(_ptr(path, i), "end"), f"{label} evidence: invalid line range (end before start)")
        key = (ref["path"], ref["start"], ref["end"])
        if key in seen:
            _fail("semantic", _ptr(path, i), f"{label} evidence: duplicate range")
        seen.add(key)


def check_semantics(artifact: Mapping[str, Any]) -> None:
    """Gate 3: references, duplicate ids, self-reference, payload/representation compatibility and row typing."""
    prov = artifact["provenance"]
    _m_evidence(prov.get("producer", {}).get("evidence"), "/provenance/producer/evidence", "producer")
    input_ids: set[str] = set()
    for i, item in enumerate(prov.get("inputs", [])):
        at = _ptr("/provenance/inputs", i)
        if item["id"] in input_ids:
            _fail("semantic", _ptr(at, "id"), f"artifact inputs: duplicate id {item['id']}")
        input_ids.add(item["id"])
        _m_evidence(item.get("evidence"), _ptr(at, "evidence"), f"input {item['id']}")
    for i, dep in enumerate(prov.get("dependsOn", [])):
        if dep == artifact["id"]:
            _fail("semantic", _ptr("/provenance/dependsOn", i), "artifact dependsOn: an artifact cannot depend on itself")
    payload = artifact["payload"]
    columns: dict[str, Mapping[str, Any]] = {}
    if payload["kind"] == "table":
        for i, c in enumerate(payload["columns"]):
            if c["id"] in columns:
                _fail("semantic", _ptr(_ptr("/payload/columns", i), "id"), f"duplicate column {c['id']}")
            columns[c["id"]] = c
        if payload["rowKey"] not in columns:
            _fail("semantic", "/payload/rowKey", "rowKey must be a declared column")
        keys: set[Any] = set()
        for i, row in enumerate(payload["rows"]):
            at = _ptr("/payload/rows", i)
            for key in row:
                if key not in columns:
                    _fail("semantic", _ptr(at, key), f"row: undeclared cell {key}")
            for c in columns.values():
                if c["id"] not in row:
                    _fail("semantic", _ptr(at, c["id"]), f"row: missing cell {c['id']}")
                v = row[c["id"]]
                if v is None and c.get("nullable"):
                    continue
                if _cell_type(v) != c["type"]:
                    _fail("semantic", _ptr(at, c["id"]), f"invalid cell: expected {c['type']}" + (" (column is not nullable)" if v is None else ""))
            k = row[payload["rowKey"]]
            if not (isinstance(k, str) or _is_number(k)) or k in keys:
                _fail("semantic", _ptr(at, payload["rowKey"]), f"missing/duplicate row key {k!r}")
            keys.add(k)
    rep_ids: set[str] = set()
    for i, rep in enumerate(artifact["representations"]):
        if rep["id"] in rep_ids:
            _fail("semantic", _ptr(_ptr("/representations", i), "id"), f"duplicate id {rep['id']}")
        rep_ids.add(rep["id"])
    for i, rep in enumerate(artifact["representations"]):
        at = _ptr("/representations", i)
        for j, used in enumerate(rep.get("inputs", [])):
            if used not in input_ids:
                _fail("semantic", _ptr(_ptr(at, "inputs"), j), f"representation {rep['id']} uses an undeclared input {used!r}")
        kind = rep["kind"]
        if kind == "json":
            continue
        if kind == "text":
            if payload["kind"] != "text":
                _fail("semantic", _ptr(at, "kind"), "text representation needs a text payload")
            continue
        if payload["kind"] != "table":
            _fail("semantic", _ptr(at, "kind"), f"{kind} representation requires a table payload")
        if kind == "chart":
            x, y = columns.get(rep["x"]), columns.get(rep["y"])
            if x is None:
                _fail("semantic", _ptr(at, "x"), "invalid chart encoding: unknown x column")
            if y is None or y["type"] != "number":
                _fail("semantic", _ptr(at, "y"), "invalid chart encoding: y must be a number column")
            if rep["chart"] != "bar" and x["type"] != "number":
                _fail("semantic", _ptr(at, "x"), "invalid chart encoding: line/scatter x must be a number column")
        if kind == "metric":
            if rep["column"] not in columns:
                _fail("semantic", _ptr(at, "column"), f"metric {rep['id']}: unknown column {rep['column']!r}")
            if not any(_js_string(r[payload["rowKey"]]) == rep["row"] for r in payload["rows"]):
                _fail("semantic", _ptr(at, "row"), f"metric {rep['id']}: references an absent row {rep['row']!r}")


def validate(artifact: Any) -> dict[str, Any]:
    """Mirror of validateArtifact: envelope, structure, then semantic gate. Returns the artifact."""
    check_envelope(artifact)
    check_structure(artifact)
    check_semantics(artifact)
    return dict(artifact)


def decide(artifact: Any) -> dict[str, Any]:
    """Non-throwing decision: {"ok": True} or {"ok": False, "gate", "path", "message"} (mirror of artifactDecision)."""
    try:
        validate(artifact)
    except ArtifactError as error:
        return {"ok": False, "gate": error.gate, "path": error.path, "message": str(error)}
    return {"ok": True}


def validate_set(artifacts: Sequence[Any]) -> list[dict[str, Any]]:
    """Mirror of validateArtifactSet: every member valid, unique ids, no dependsOn cycle among members."""
    for i, artifact in enumerate(artifacts):
        try:
            validate(artifact)
        except ArtifactError as error:
            raise ArtifactError(error.detail, error.gate, f"/{i}{error.path or ''}") from error
    index: dict[str, int] = {}
    for i, artifact in enumerate(artifacts):
        if artifact["id"] in index:
            _fail("semantic", f"/{i}/id", f"duplicate artifact id {artifact['id']} in the set")
        index[artifact["id"]] = i
    state: dict[int, int] = {}

    def visit(i: int) -> None:
        state[i] = 1
        for k, dep in enumerate(artifacts[i]["provenance"].get("dependsOn", [])):
            j = index.get(dep)
            if j is None:
                continue
            if state.get(j) == 1:
                _fail("semantic", f"/{i}/provenance/dependsOn/{k}", f"artifact dependsOn cycle through {artifacts[i]['id']} -> {dep}")
            if j not in state:
                visit(j)
        state[i] = 2

    for i in range(len(artifacts)):
        if i not in state:
            visit(i)
    return [dict(a) for a in artifacts]


def _reject_constant(name: str) -> Any:
    raise ArtifactError(f"{name} is not JSON", "envelope", "")


def loads(text: str | bytes) -> Any:
    """Parse JSON like JSON.parse: NaN/Infinity literals are rejected (1e400 still parses to inf, refused by the envelope)."""
    return json.loads(text, parse_constant=_reject_constant)


def load(path: str | os.PathLike[str]) -> Any:
    return loads(Path(path).read_text(encoding="utf-8"))


def _cell_type(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    raise ArtifactError(f"Unsupported cell value {value!r}; use str, int, float, bool or None")


def _records(data: Any) -> list[dict[str, Any]]:
    """Accept a list of dicts, or anything with to_dict(orient='records') (pandas)."""
    if hasattr(data, "to_dict") and not isinstance(data, Mapping):
        data = data.to_dict(orient="records")
    if not isinstance(data, Sequence) or isinstance(data, (str, bytes)):
        raise ArtifactError("rows must be a list of dicts or a DataFrame")
    rows = []
    for row in data:
        if not isinstance(row, Mapping):
            raise ArtifactError("every row must be a mapping")
        clean = {}
        for key, value in row.items():
            if hasattr(value, "item") and not isinstance(value, (str, bytes)):
                value = value.item()  # numpy scalar -> Python scalar
            if isinstance(value, float) and math.isnan(value):
                value = None
            clean[str(key)] = value
        rows.append(clean)
    return rows


def infer_columns(rows: Sequence[Mapping[str, Any]], labels: Mapping[str, str] | None = None,
                  units: Mapping[str, str] | None = None) -> list[dict[str, Any]]:
    """Column declarations from the first row's keys; nullable when a None appears."""
    if not rows:
        raise ArtifactError("columns cannot be inferred from zero rows; pass columns=")
    labels, units = labels or {}, units or {}
    columns = []
    for key in rows[0].keys():
        types = {_cell_type(r.get(key)) for r in rows} - {None}
        if len(types) != 1:
            raise ArtifactError(f"column {key!r}: needs exactly one non-null type, found {sorted(types) or 'only nulls'}")
        column: dict[str, Any] = {"id": key, "label": labels.get(key, key), "type": types.pop()}
        if key in units:
            column["unit"] = units[key]
        if any(r.get(key) is None for r in rows):
            column["nullable"] = True
        columns.append(column)
    return columns


def input_hash(inputs: Iterable[Mapping[str, Any]]) -> str:
    """sha256 of the canonical [{id, value}] list sorted by id (compact UTF-8 JSON)."""
    canonical = sorted(({"id": i["id"], "value": i.get("value")} for i in inputs), key=lambda i: i["id"])
    try:
        data = json.dumps(canonical, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as error:
        raise ArtifactError(f"input values must be JSON scalars: {error}") from error
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def cite(obj: Any, label: str, root: str | os.PathLike[str]) -> dict[str, Any]:
    """Evidence link to the exact source lines of a function or class (inspect), relative to `root`."""
    lines, start = inspect.getsourcelines(obj)
    path = Path(inspect.getsourcefile(obj) or "").resolve().relative_to(Path(root).resolve()).as_posix()
    return {"path": path, "start": start, "end": start + len(lines) - 1, "label": label}


def cite_lines(path: str | os.PathLike[str], pattern: str, label: str, root: str | os.PathLike[str]) -> dict[str, Any]:
    """Evidence link to the first line of `path` (relative to root) matching the regex `pattern`."""
    source = Path(root) / path
    for number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), start=1):
        if re.search(pattern, line):
            return {"path": Path(path).as_posix(), "start": number, "end": number, "label": label}
    raise ArtifactError(f"{path}: no line matches {pattern!r}")


def write_sources(artifact: Mapping[str, Any], root: str | os.PathLike[str], out_dir: str | os.PathLike[str]) -> list[Path]:
    """Copy every file cited by the artifact's evidence links to `<out_dir>/<path>.txt` (public, inert excerpts).

    Only cite files that are approved for publication. Line ranges are checked against the copied text.
    """
    prov = artifact["provenance"]
    refs = list(prov.get("producer", {}).get("evidence", []))
    for item in prov.get("inputs", []):
        refs.extend(item.get("evidence", []))
    written = []
    for path in sorted({ref["path"] for ref in refs}):
        text = (Path(root) / path).read_text(encoding="utf-8")
        count = len(text.splitlines())
        for ref in refs:
            if ref["path"] == path and ref["end"] > count:
                raise ArtifactError(f"{path}: evidence {ref['start']}..{ref['end']} is beyond its {count} lines")
        target = Path(out_dir) / (path + ".txt")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8", newline="\n")
        written.append(target)
    return written


def to_artifact(rows: Any = None, *, id: str, title: str, source: str,
                representations: Iterable[Mapping[str, Any]] | None = None,
                row_key: str | None = None, columns: list[dict[str, Any]] | None = None,
                labels: Mapping[str, str] | None = None, units: Mapping[str, str] | None = None,
                provenance: str = "computed", run_id: str | None = None, text: str | None = None,
                producer: Mapping[str, Any] | None = None, inputs: Iterable[Mapping[str, Any]] | None = None,
                depends_on: Iterable[str] | None = None, input_hash_value: str | None = None,
                out_dir: str | os.PathLike[str] | None = None, parquet_sidecar: bool = False) -> dict[str, Any]:
    """Build (and optionally write `<out_dir>/<id>.json`) one validated artifact.

    rows: list of dicts or a DataFrame (table payload); or pass text= for a text payload.
    row_key defaults to the first column. representations default to table + JSON.
    Optional lineage (additive): producer={"kind": "script"|"notebook"|"service", "name", "evidence"?},
    inputs=[{"id", "label", "value"?, "unit"?, "evidence"?}] (inputHash is computed from them unless
    input_hash_value is given), depends_on=[upstream artifact ids]. Evidence: cite() / cite_lines().
    """
    if text is not None:
        payload: dict[str, Any] = {"kind": "text", "text": text}
        reps = list(representations or [{"id": "text", "title": "Text", "kind": "text"}])
    else:
        records = _records(rows)
        cols = columns if columns is not None else infer_columns(records, labels, units)
        payload = {"kind": "table", "rowKey": row_key or cols[0]["id"], "columns": cols, "rows": records}
        reps = list(representations or [{"id": "table", "title": "Rows", "kind": "table"}, {"id": "json", "title": "JSON", "kind": "json"}])
    prov: dict[str, Any] = {"kind": provenance, "source": source}
    if run_id is not None:
        prov["runId"] = run_id
    if producer is not None:
        prov["producer"] = dict(producer)
    if inputs is not None:
        prov["inputs"] = [dict(i) for i in inputs]
        prov["inputHash"] = input_hash_value or input_hash(prov["inputs"])
    elif input_hash_value is not None:
        prov["inputHash"] = input_hash_value
    if depends_on is not None:
        prov["dependsOn"] = list(depends_on)
    artifact = validate({"format": FORMAT, "version": VERSION, "id": id, "title": title,
                         "provenance": prov, "payload": payload, "representations": [dict(r) for r in reps]})
    if out_dir is not None:
        write_artifact(artifact, out_dir)
        if parquet_sidecar and payload["kind"] == "table":
            write_parquet_sidecar(artifact, out_dir)
    return artifact


def write_artifact(artifact: Mapping[str, Any], out_dir: str | os.PathLike[str]) -> Path:
    """Write `<id>.json` atomically (pretty-printed; size checked on the compact form)."""
    return watch_write(Path(out_dir) / f"{artifact['id']}.json", artifact)


def watch_write(path: str | os.PathLike[str], artifact: Mapping[str, Any]) -> Path:
    """Validate, then atomically replace `path` (temp file in the same folder + os.replace).

    Safe for live watchers (bridge level 2.5, `npm run client:dev`): a reader sees the old
    file or the new one, never a partial write. Any producer may call it in a loop.
    The file name must be `<artifact id>.json`. On Windows a reader holding the target open
    can briefly block the rename; it is retried for about one second.
    """
    validate(artifact)
    target = Path(path)
    if target.name != f"{artifact['id']}.json":
        raise ArtifactError(f"{target.name}: file name must equal the artifact id {artifact['id']}.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(artifact, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    fd, temporary = tempfile.mkstemp(prefix=f".{artifact['id']}.", suffix=".tmp", dir=target.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o644)  # mkstemp creates 0600; served files stay readable
        for attempt in range(20):
            try:
                os.replace(temporary, target)
                break
            except PermissionError:
                if attempt == 19:
                    raise
                time.sleep(0.05)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise
    return target


def write_parquet_sidecar(artifact: Mapping[str, Any], out_dir: str | os.PathLike[str]) -> Path | None:
    """`<id>.parquet` beside the JSON when pyarrow is installed; None otherwise."""
    try:
        import pyarrow as pa  # type: ignore
        import pyarrow.parquet as pq  # type: ignore
    except ImportError:
        return None
    payload = artifact["payload"]
    table = pa.Table.from_pylist(list(payload["rows"]))
    target = Path(out_dir) / f"{artifact['id']}.parquet"
    pq.write_table(table, target)
    return target


def write_manifest(out_dir: str | os.PathLike[str]) -> Path:
    """Index every valid `<id>.json` in out_dir as `manifest.json` (sha256, bytes, provenance)."""
    folder = Path(out_dir)
    entries = []
    for path in sorted(folder.glob("*.json")):
        if path.name == MANIFEST_NAME:
            continue
        artifact = validate(load(path))
        if path.stem != artifact["id"]:
            raise ArtifactError(f"{path.name}: file name must equal the artifact id {artifact['id']}")
        raw = path.read_bytes()
        entry: dict[str, Any] = {"id": artifact["id"], "title": artifact["title"], "file": path.name,
                                 "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
                                 "provenance": artifact["provenance"]}
        sidecar = path.with_suffix(".parquet")
        if sidecar.exists():
            entry["parquet"] = sidecar.name
        entries.append(entry)
    target = folder / MANIFEST_NAME
    target.write_text(json.dumps({"format": "datapass.artifact-manifest", "version": 1, "artifacts": entries},
                                 ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    return target


def main(argv: Sequence[str] | None = None) -> int:
    """Validate artifact files; print one JSON decision per file (or one for the whole --set). Exit 1 on any rejection."""
    import sys
    args = list(sys.argv[1:] if argv is None else argv)
    as_set = "--set" in args
    files = [a for a in args if a != "--set"]
    if not files:
        print("usage: python py/datapass_artifact.py [--set] FILE...", file=sys.stderr)
        return 2
    results = []
    loaded = []
    for name in files:
        try:
            loaded.append(load(name))
            results.append({"file": name, **({"ok": True} if as_set else decide(loaded[-1]))})
        except ArtifactError as error:
            loaded.append(None)
            results.append({"file": name, "ok": False, "gate": error.gate, "path": error.path, "message": str(error)})
        except ValueError as error:
            loaded.append(None)
            results.append({"file": name, "ok": False, "gate": "envelope", "path": "", "message": f"not JSON: {error}"})
    if as_set:
        if all(r["ok"] for r in results):
            try:
                validate_set(loaded)
                results = [{"set": files, "ok": True}]
            except ArtifactError as error:
                results = [{"set": files, "ok": False, "gate": error.gate, "path": error.path, "message": str(error)}]
        else:
            results = [{"set": files, "ok": False, **{k: v for k, v in next(r for r in results if not r["ok"]).items() if k != "file"}}]
    for result in results:
        print(json.dumps(result, ensure_ascii=False))
    return 0 if all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
