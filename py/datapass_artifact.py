"""Write `datapass.artifact` v1 JSON from Python. Standard library only.

The TypeScript validator (src/framework/foundation/artifact.ts, validateArtifact)
stays the source of truth. This module mirrors its rules so a notebook fails early
in Python instead of in the browser:

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
_KINDS = {"table", "chart", "metric", "text", "json"}
_REP_KEYS = {
    "table": {"id", "title", "kind", "inputs"},
    "text": {"id", "title", "kind", "inputs"},
    "json": {"id", "title", "kind", "inputs"},
    "chart": {"id", "title", "kind", "chart", "x", "y", "unit", "inputs"},
    "metric": {"id", "title", "kind", "row", "column", "unit", "digits", "inputs"},
}


class ArtifactError(ValueError):
    """The artifact would be rejected by the Studio validator."""


def _identifier(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _ID.match(value) or value in _RESERVED:
        raise ArtifactError(f"{label}: invalid id {value!r} (use ^[a-z][a-zA-Z0-9_-]{{0,79}}$)")
    return value


def _text(value: Any, label: str, max_len: int, required: bool = True) -> str:
    if not isinstance(value, str) or len(value) > max_len or (required and not value.strip()):
        raise ArtifactError(f"{label}: invalid text (string, <= {max_len} chars{', not blank' if required else ''})")
    return value


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


def _validate_table(row_key: str, columns: list[dict[str, Any]], rows: list[dict[str, Any]]) -> None:
    if not isinstance(columns, list) or not 1 <= len(columns) <= MAX_COLUMNS:
        raise ArtifactError(f"1..{MAX_COLUMNS} columns required")
    seen: set[str] = set()
    for c in columns:
        extra = set(c) - {"id", "label", "type", "unit", "nullable"}
        if extra:
            raise ArtifactError(f"column: unexpected fields {sorted(extra)}")
        _identifier(c.get("id"), "column.id")
        _text(c.get("label"), "column.label", 120)
        if c.get("type") not in ("string", "number", "boolean"):
            raise ArtifactError(f"column {c['id']}: type must be string, number or boolean")
        if "unit" in c:
            _text(c["unit"], "column.unit", 40, False)
        if "nullable" in c and not isinstance(c["nullable"], bool):
            raise ArtifactError("column.nullable must be a boolean")
        if c["id"] in seen:
            raise ArtifactError(f"duplicate column {c['id']}")
        seen.add(c["id"])
    _identifier(row_key, "rowKey")
    if row_key not in seen:
        raise ArtifactError("rowKey must be a declared column")
    if len(rows) > MAX_ROWS:
        raise ArtifactError(f"{len(rows)} rows exceed the {MAX_ROWS}-row limit; aggregate in Python first")
    keys = set()
    for i, row in enumerate(rows):
        if set(row) != seen:
            raise ArtifactError(f"row {i}: keys must equal the declared columns")
        for c in columns:
            v = row[c["id"]]
            if v is None and c.get("nullable"):
                continue
            if _cell_type(v) != c["type"]:
                raise ArtifactError(f"row {i}.{c['id']}: expected {c['type']}, got {v!r}")
            if isinstance(v, float) and not math.isfinite(v):
                raise ArtifactError(f"row {i}.{c['id']}: numbers must be finite")
            if isinstance(v, str) and len(v) > 4000:
                raise ArtifactError(f"row {i}.{c['id']}: string longer than 4000 chars")
        k = row[row_key]
        if not isinstance(k, (str, int, float)) or isinstance(k, bool) or k in keys:
            raise ArtifactError(f"row {i}: missing or duplicate row key {k!r}")
        keys.add(k)


def _safe_path(value: Any) -> bool:
    return (isinstance(value, str) and 0 < len(value) <= 260 and not re.search(r"[\\\0:\x00-\x1f\x7f]", value)
            and not value.startswith("/") and all(part not in ("", ".", "..") for part in value.split("/")))


def _id_list(value: Any, limit: int, label: str) -> list[str]:
    if not isinstance(value, list) or len(value) > limit:
        raise ArtifactError(f"{label}: list of at most {limit} ids")
    for item in value:
        _identifier(item, label)
    if len(set(value)) != len(value):
        raise ArtifactError(f"{label}: duplicate id")
    return value


def _validate_evidence(refs: Any, label: str) -> None:
    if refs is None:
        return
    if not isinstance(refs, list) or len(refs) > MAX_EVIDENCE:
        raise ArtifactError(f"{label}: at most {MAX_EVIDENCE} evidence links")
    seen = set()
    for ref in refs:
        if not isinstance(ref, Mapping) or set(ref) - {"path", "start", "end", "label"} or not {"path", "start", "end", "label"} <= set(ref):
            raise ArtifactError(f"{label} evidence: needs exactly path, start, end, label")
        if not _safe_path(ref["path"]):
            raise ArtifactError(f"{label} evidence: path must be a safe relative path (forward slashes, no ..)")
        start, end = ref["start"], ref["end"]
        if any(not isinstance(n, int) or isinstance(n, bool) for n in (start, end)) or not 1 <= start <= end <= MAX_LINE:
            raise ArtifactError(f"{label} evidence: invalid line range {start!r}..{end!r}")
        _text(ref["label"], f"{label} evidence label", 160)
        key = (ref["path"], start, end)
        if key in seen:
            raise ArtifactError(f"{label} evidence: duplicate range")
        seen.add(key)


def _validate_lineage(prov: Mapping[str, Any], artifact_id: str) -> set[str]:
    """Optional, additive lineage metadata (mirror of validateLineage in artifact.ts)."""
    if "producer" in prov:
        producer = prov["producer"]
        if not isinstance(producer, Mapping) or set(producer) - {"kind", "name", "evidence"}:
            raise ArtifactError("artifact producer: unexpected fields")
        if producer.get("kind") not in _PRODUCERS:
            raise ArtifactError("artifact producer kind must be script, notebook or service")
        _text(producer.get("name"), "artifact producer name", 160)
        _validate_evidence(producer.get("evidence"), "producer")
    if "inputHash" in prov and (not isinstance(prov["inputHash"], str) or not _HEX64.match(prov["inputHash"])):
        raise ArtifactError("artifact inputHash must be 64 lowercase hex characters (sha256)")
    ids: set[str] = set()
    if "inputs" in prov:
        inputs = prov["inputs"]
        if not isinstance(inputs, list) or len(inputs) > MAX_INPUTS:
            raise ArtifactError(f"artifact inputs: at most {MAX_INPUTS}")
        for item in inputs:
            if not isinstance(item, Mapping) or set(item) - {"id", "label", "value", "unit", "evidence"}:
                raise ArtifactError("artifact input: unexpected fields")
            _identifier(item.get("id"), "artifact input id")
            if item["id"] in ids:
                raise ArtifactError("artifact inputs: duplicate id")
            ids.add(item["id"])
            _text(item.get("label"), "artifact input label", 160)
            if "value" in item:
                v = item["value"]
                ok = isinstance(v, bool) or (isinstance(v, (int, float)) and math.isfinite(v)) or (isinstance(v, str) and len(v) <= 400)
                if not ok:
                    raise ArtifactError("artifact input value must be a finite number, boolean or short string")
            if "unit" in item:
                _text(item["unit"], "artifact input unit", 40, False)
            _validate_evidence(item.get("evidence"), f"input {item['id']}")
    if "dependsOn" in prov:
        _id_list(prov["dependsOn"], MAX_DEPENDS_ON, "artifact dependsOn")
        if artifact_id in prov["dependsOn"]:
            raise ArtifactError("artifact dependsOn: an artifact cannot depend on itself")
    return ids


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


def _validate_representations(reps: Any, payload: dict[str, Any], input_ids: set[str] | None = None) -> None:
    if not isinstance(reps, list) or not 1 <= len(reps) <= MAX_REPRESENTATIONS:
        raise ArtifactError(f"1..{MAX_REPRESENTATIONS} representations required")
    ids: set[str] = set()
    columns = {c["id"]: c for c in payload.get("columns", [])}
    for rep in reps:
        kind = rep.get("kind") if isinstance(rep, Mapping) else None
        if kind not in _KINDS:
            raise ArtifactError(f"unsupported representation kind {kind!r}")
        extra = set(rep) - _REP_KEYS[kind]
        if extra:
            raise ArtifactError(f"representation {rep.get('id')}: unexpected fields {sorted(extra)}")
        _identifier(rep.get("id"), "representation id")
        _text(rep.get("title"), "representation title", 160)
        if rep["id"] in ids:
            raise ArtifactError(f"duplicate representation id {rep['id']}")
        ids.add(rep["id"])
        if "inputs" in rep:
            for used in _id_list(rep["inputs"], MAX_INPUTS, "representation inputs"):
                if used not in (input_ids or set()):
                    raise ArtifactError(f"representation {rep['id']}: uses an undeclared input {used!r}")
        if kind == "text":
            if payload["kind"] != "text":
                raise ArtifactError("text representation needs a text payload")
            continue
        if kind == "json":
            continue
        if payload["kind"] != "table":
            raise ArtifactError(f"{kind} representation requires a table payload")
        if kind == "metric":
            col = columns.get(rep.get("column"))
            if col is None:
                raise ArtifactError(f"metric {rep['id']}: unknown column {rep.get('column')!r}")
            _text(rep.get("row"), "metric row", 160)
            if not any(str(r[payload["rowKey"]]) == rep["row"] for r in payload["rows"]):
                raise ArtifactError(f"metric {rep['id']}: references an absent row {rep['row']!r}")
            if "digits" in rep and (not isinstance(rep["digits"], int) or isinstance(rep["digits"], bool) or not 0 <= rep["digits"] <= 6):
                raise ArtifactError("metric digits must be an integer 0..6")
            if "unit" in rep:
                _text(rep["unit"], "metric unit", 40, False)
        if kind == "chart":
            if rep.get("chart") not in ("bar", "line", "scatter"):
                raise ArtifactError("chart must be bar, line or scatter")
            x, y = columns.get(rep.get("x")), columns.get(rep.get("y"))
            if not x or not y or y["type"] != "number" or (rep["chart"] != "bar" and x["type"] != "number"):
                raise ArtifactError(f"chart {rep['id']}: invalid x/y encoding")
            if "unit" in rep:
                _text(rep["unit"], "chart unit", 30, False)


def encode(artifact: Mapping[str, Any]) -> bytes:
    """Compact UTF-8 JSON, the encoding the 1 MB budget is measured on."""
    return json.dumps(artifact, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def validate(artifact: Mapping[str, Any]) -> dict[str, Any]:
    """Mirror of validateArtifact (structure, ids, budgets). Returns the artifact."""
    if set(artifact) != {"format", "version", "id", "title", "provenance", "payload", "representations"}:
        raise ArtifactError("artifact: unexpected or missing top-level fields")
    if artifact["format"] != FORMAT or artifact["version"] != VERSION:
        raise ArtifactError("unsupported artifact format")
    _identifier(artifact["id"], "artifact id")
    _text(artifact["title"], "artifact title", 160)
    prov = artifact["provenance"]
    if not isinstance(prov, Mapping) or set(prov) - {"kind", "source", "runId", "producer", "inputHash", "inputs", "dependsOn"}:
        raise ArtifactError("artifact provenance: unexpected fields")
    if prov.get("kind") not in ("synthetic", "provided", "computed"):
        raise ArtifactError("unknown artifact provenance")
    _text(prov.get("source"), "artifact source", 2000)
    if "runId" in prov:
        _identifier(prov["runId"], "artifact run")
    input_ids = _validate_lineage(prov, artifact["id"])
    payload = artifact["payload"]
    if payload.get("kind") == "table":
        if set(payload) != {"kind", "rowKey", "columns", "rows"}:
            raise ArtifactError("table payload: unexpected fields")
        _validate_table(payload["rowKey"], payload["columns"], payload["rows"])
    elif payload.get("kind") == "text" and set(payload) == {"kind", "text"}:
        _text(payload["text"], "text payload", 20000, False)
    else:
        raise ArtifactError("unknown payload kind")
    _validate_representations(artifact["representations"], payload, input_ids)
    size = len(encode(artifact))
    if size > ARTIFACT_BYTES:
        raise ArtifactError(f"artifact is {size} bytes; the browser budget is {ARTIFACT_BYTES}. Aggregate in Python or use parquet_sidecar for the full data")
    return dict(artifact)


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
        artifact = validate(json.loads(path.read_text(encoding="utf-8")))
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
