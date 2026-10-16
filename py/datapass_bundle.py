"""Validate a `datapass.bundle` v1 (candidate) provenance export bundle. Standard library only.

Mirror of src/framework/foundation/bundle.ts (validateBundle), which stays the source of truth. A bundle is one JSON
document carrying a file set as exact strings: artifacts/<id>.json, runs.json, inputs.json, lineage.json and
SHA256SUMS. Every hash is the SHA-256 of a file's exact UTF-8 text as embedded; nothing is re-serialized to hash, so
both validators report the same hashes and the same bundle identity (the SHA-256 of SHA256SUMS).

Rules are checked in the same fixed order as TypeScript and every rejection carries the same stable DP-BUN-nnn code
(docs/DIAGNOSTIC_CODES.md). Validating runs nothing in the bundle. A bundle is not a signature, release or verified
lineage, and it never carries tokens: token-shaped keys are refused.

Command line:
    python py/datapass_bundle.py validate FILE...
prints one JSON decision per file ({"ok": true, "bundleSha256", "files"} or {"ok": false, "code", "gate", "where",
"message"}) and exits 1 when any file is refused.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
import datapass_artifact as _da  # noqa: E402

FORMAT = "datapass.bundle"
VERSION = 1
STATUS = "candidate"
SUMS_PATH = "SHA256SUMS"
LIMITS = {"files": 64, "fileBytes": 2097152, "totalBytes": 8388608, "textBytes": 12582912, "runs": 200,
          "values": 100, "valueText": 4000, "title": 160, "notice": 2000}
JSON_MEDIA = "application/json"
TEXT_MEDIA = "text/plain; charset=utf-8"
OUTCOMES = ("succeeded", "failed", "cancelled", "superseded", "timed-out", "unobserved")

# rule -> (code, gate); mirrors src/framework/diagnostics/bundle.ts (rows that list "py").
BUNDLE_CODES = {
    "bundle-envelope": ("DP-BUN-001", "envelope"),
    "file-entry": ("DP-BUN-002", "files"),
    "file-hash": ("DP-BUN-003", "hashes"),
    "sha256sums": ("DP-BUN-004", "hashes"),
    "missing-member": ("DP-BUN-005", "members"),
    "member-invalid": ("DP-BUN-006", "members"),
    "artifact-invalid": ("DP-BUN-007", "members"),
    "reference-broken": ("DP-BUN-008", "members"),
    "secret-key": ("DP-BUN-009", "secrets"),
}

_ENVELOPE_KEYS = ("format", "version", "status", "title", "createdAt", "notice", "files")
_FILE_KEYS = ("path", "mediaType", "bytes", "sha256", "text")
_PATH = re.compile(r"(SHA256SUMS|runs\.json|inputs\.json|lineage\.json|artifacts/[a-z][a-zA-Z0-9_-]{0,79}\.json)")
_SHA = re.compile(r"[0-9a-f]{64}")
_ID = re.compile(r"[a-z][a-zA-Z0-9_-]{0,79}")
_RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,159}")
_VALUE_KEY = re.compile(r"[A-Za-z_][A-Za-z0-9_-]{0,79}")
_TIME = re.compile(r"[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z")
_SECRET_KEY = re.compile(r"(token|secret|password|passwd|apikey|authorization|cookie|credential|credentials|privatekey)\Z")


class BundleError(ValueError):
    """The bundle would be refused by the Studio validator. `where` is the refused bundle file ("" = envelope)."""

    def __init__(self, rule: str, where: str, message: str, artifact_code: str | None = None):
        self.code, self.gate = BUNDLE_CODES[rule]
        self.rule, self.where, self.artifact_code = rule, where, artifact_code
        super().__init__(message)


def _fail(rule: str, where: str, message: str, artifact_code: str | None = None):
    raise BundleError(rule, where, message, artifact_code)


def _is_obj(value: Any) -> bool:
    return isinstance(value, dict)


def _exact(value: dict, keys: Sequence[str]) -> bool:
    return set(value) == set(keys)


def _surrogate(text: str) -> bool:
    return any(0xD800 <= ord(c) <= 0xDFFF for c in text)


def _short(value: Any, max_len: int) -> bool:
    return (isinstance(value, str) and _da._NON_BLANK.search(value) is not None and len(value) <= max_len
            and not _surrogate(value))


def _is_one(value: Any) -> bool:
    return _da._is_number(value) and value == 1


def _time(value: Any) -> bool:
    if not isinstance(value, str) or not _TIME.fullmatch(value):
        return False
    try:
        datetime.strptime(value[:-1], "%Y-%m-%dT%H:%M:%S.%f")
    except ValueError:
        return False
    return True


def _nullable_time(value: Any) -> bool:
    return value is None or _time(value)


def _match(rx: re.Pattern[str], value: Any) -> bool:
    return isinstance(value, str) and rx.fullmatch(value) is not None


def _utf8_len(text: str) -> int:
    return len(text.encode("utf-8"))


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _media_for(path: str) -> str:
    return TEXT_MEDIA if path == SUMS_PATH else JSON_MEDIA


def _sums_text(files: Sequence[dict]) -> str:
    by_path = {f["path"]: f for f in files}
    return "".join(f"{by_path[p]['sha256']}  {p}\n" for p in sorted(p for p in by_path if p != SUMS_PATH))


def is_secret_key(key: str) -> bool:
    return _SECRET_KEY.search(key.lower().replace("-", "").replace("_", "")) is not None


def _keys(value: Any):
    if isinstance(value, list):
        for item in value:
            yield from _keys(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield from _keys(item)


def _scalar(value: Any) -> bool:
    if value is None or isinstance(value, bool):
        return True
    if _da._is_number(value):
        return value == value and value not in (float("inf"), float("-inf"))
    return isinstance(value, str) and len(value) <= LIMITS["valueText"]


def _check_runs(doc: Any) -> list[dict]:
    def bad(message: str):
        _fail("member-invalid", "runs.json", "runs.json: " + message)

    if not (_is_obj(doc) and _exact(doc, ("format", "version", "runs")) and doc["format"] == "datapass.bundle-runs"
            and _is_one(doc["version"]) and isinstance(doc["runs"], list) and len(doc["runs"]) <= LIMITS["runs"]):
        bad('expected {format:"datapass.bundle-runs",version:1,runs:[...]}')
    for r in doc["runs"]:
        if not (_is_obj(r) and _exact(r, ("runId", "taskId", "appId", "appVersion", "model", "outcome", "startedAt",
                                          "finishedAt", "artifact", "resultSha256"))):
            bad("invalid run entry")
        if not (_match(_RUN_ID, r["runId"]) and _match(_ID, r["taskId"]) and _match(_ID, r["appId"])
                and _short(r["appVersion"], 80)):
            bad("invalid run identity")
        m = r["model"]
        if not (_is_obj(m) and _exact(m, ("id", "version", "provider")) and _match(_ID, m["id"])
                and _short(m["version"], 80) and _match(_ID, m["provider"])):
            bad("invalid declared model")
        if not (isinstance(r["outcome"], str) and r["outcome"] in OUTCOMES and _nullable_time(r["startedAt"])
                and _nullable_time(r["finishedAt"])):
            bad("invalid outcome or time")
        if r["outcome"] == "unobserved" and r["finishedAt"] is not None:
            bad("an unobserved run has no observed finish")
        a = r["artifact"]
        if a is not None and not (_is_obj(a) and _exact(a, ("id", "path", "sha256")) and _match(_ID, a["id"])
                                  and isinstance(a["path"], str) and _match(_SHA, a["sha256"])):
            bad("invalid artifact reference")
        if r["resultSha256"] is not None and not _match(_SHA, r["resultSha256"]):
            bad("invalid result hash")
    return doc["runs"]


def _check_inputs(doc: Any) -> list[dict]:
    def bad(message: str):
        _fail("member-invalid", "inputs.json", "inputs.json: " + message)

    if not (_is_obj(doc) and _exact(doc, ("format", "version", "note", "runs"))
            and doc["format"] == "datapass.bundle-inputs" and _is_one(doc["version"])
            and _short(doc["note"], LIMITS["notice"]) and isinstance(doc["runs"], list)
            and len(doc["runs"]) <= LIMITS["runs"]):
        bad('expected {format:"datapass.bundle-inputs",version:1,note,runs:[...]}')
    for entry in doc["runs"]:
        if not (_is_obj(entry) and _exact(entry, ("runId", "values")) and _match(_RUN_ID, entry["runId"])
                and _is_obj(entry["values"])):
            bad("invalid input set")
        values = entry["values"]
        if len(values) > LIMITS["values"] or any(not _match(_VALUE_KEY, k) or not _scalar(v) for k, v in values.items()):
            bad("invalid input value")
    return doc["runs"]


def _check_lineage(doc: Any) -> list[dict]:
    def bad(message: str):
        _fail("member-invalid", "lineage.json", "lineage.json: " + message)

    if not (_is_obj(doc) and _exact(doc, ("format", "version", "note", "artifacts"))
            and doc["format"] == "datapass.bundle-lineage" and _is_one(doc["version"])
            and _short(doc["note"], LIMITS["notice"]) and isinstance(doc["artifacts"], list)):
        bad('expected {format:"datapass.bundle-lineage",version:1,note,artifacts:[...]}')
    for e in doc["artifacts"]:
        if not (_is_obj(e) and _exact(e, ("id", "path", "sha256", "kind", "source", "runId", "inputHash", "dependsOn"))):
            bad("invalid lineage entry")
        if not (_match(_ID, e["id"]) and isinstance(e["path"], str) and _match(_SHA, e["sha256"])
                and isinstance(e["kind"], str) and e["kind"] in ("synthetic", "provided", "computed")
                and isinstance(e["source"], str)):
            bad("invalid lineage identity")
        if not ((e["runId"] is None or isinstance(e["runId"], str)) and (e["inputHash"] is None or isinstance(e["inputHash"], str))
                and isinstance(e["dependsOn"], list) and all(isinstance(d, str) for d in e["dependsOn"])):
            bad("invalid declared lineage")
    return doc["artifacts"]


def _reject_constant(name: str) -> Any:
    raise ValueError(f"{name} is not JSON")


def _parse(text: str) -> Any:
    """Parse like JSON.parse: NaN/Infinity literals are refused."""
    return json.loads(text, parse_constant=_reject_constant)


def validate(value: Any) -> dict[str, Any]:
    """Mirror of validateBundle. Returns {"bundleSha256", "files", "artifacts", "runs", "inputs", "lineage"}."""
    # 1. Envelope.
    if not (_is_obj(value) and _exact(value, _ENVELOPE_KEYS)):
        _fail("bundle-envelope", "", "bundle: expected exactly " + ", ".join(_ENVELOPE_KEYS))
    if value["format"] != FORMAT or not _is_one(value["version"]) or value["status"] != STATUS:
        _fail("bundle-envelope", "", "bundle: unsupported format, version or status (datapass.bundle v1, candidate)")
    if not (_short(value["title"], LIMITS["title"]) and _time(value["createdAt"]) and _short(value["notice"], LIMITS["notice"])):
        _fail("bundle-envelope", "", "bundle: invalid title, createdAt or notice")
    files = value["files"]
    if not isinstance(files, list) or not 2 <= len(files) <= LIMITS["files"]:
        _fail("bundle-envelope", "", f"bundle: files must hold 2 to {LIMITS['files']} entries")
    # 2. File entries.
    seen: set[str] = set()
    total = 0
    for i, f in enumerate(files):
        at = f"/files/{i}"
        if not (_is_obj(f) and _exact(f, _FILE_KEYS)):
            _fail("file-entry", at, at + ": expected exactly " + ", ".join(_FILE_KEYS))
        if not _match(_PATH, f["path"]):
            _fail("file-entry", at, at + ": unknown file path")
        path = f["path"]
        if path in seen:
            _fail("file-entry", path, path + ": duplicate path")
        seen.add(path)
        if f["mediaType"] != _media_for(path):
            _fail("file-entry", path, f"{path}: media type must be {_media_for(path)}")
        if not isinstance(f["text"], str) or _surrogate(f["text"]):
            _fail("file-entry", path, path + ": text must be a well-formed UTF-8 string")
        if not (_da._is_integer(f["bytes"]) and f["bytes"] >= 0 and _match(_SHA, f["sha256"])):
            _fail("file-entry", path, path + ": bytes must be an integer and sha256 64 lowercase hex digits")
        size = _utf8_len(f["text"])
        total += size
        if size > LIMITS["fileBytes"] or total > LIMITS["totalBytes"]:
            _fail("file-entry", path, path + ": file or bundle byte budget exceeded")
    # 3. Hashes over the exact embedded text.
    for f in files:
        if _sha(f["text"]) != f["sha256"] or _utf8_len(f["text"]) != f["bytes"]:
            _fail("file-hash", f["path"], f["path"] + ": declared sha256/bytes do not match the embedded text")
    sums = next((f for f in files if f["path"] == SUMS_PATH), None)
    if sums is None or sums["text"] != _sums_text(files):
        _fail("sha256sums", SUMS_PATH, "SHA256SUMS is missing or does not list exactly the other files")
    # 4. Members.
    by_path = {f["path"]: f for f in files}
    for name in ("runs.json", "inputs.json", "lineage.json"):
        if name not in by_path:
            _fail("missing-member", name, name + " is missing")
    artifact_files = sorted((f for f in files if f["path"].startswith("artifacts/")), key=lambda f: f["path"])
    if not artifact_files:
        _fail("missing-member", "artifacts/", "a bundle carries at least one artifact")
    parsed: dict[str, Any] = {}
    for name in ("runs.json", "inputs.json", "lineage.json"):
        try:
            parsed[name] = _parse(by_path[name]["text"])
        except ValueError:
            _fail("member-invalid", name, name + ": not JSON")
    for f in artifact_files:
        try:
            parsed[f["path"]] = _parse(f["text"])
        except ValueError:
            _fail("artifact-invalid", f["path"], f["path"] + ": not JSON", "DP-ART-001")
    # 5. Secret-shaped keys anywhere in a JSON member.
    for name in sorted(parsed):
        for key in _keys(parsed[name]):
            if is_secret_key(key):
                _fail("secret-key", name, f'{name}: token-shaped key "{key}" is not allowed in a bundle')
    runs = _check_runs(parsed["runs.json"])
    inputs = _check_inputs(parsed["inputs.json"])
    lineage = _check_lineage(parsed["lineage.json"])
    artifacts = []
    for f in artifact_files:
        try:
            artifact = _da.validate(parsed[f["path"]])
        except _da.ArtifactError as error:
            _fail("artifact-invalid", f["path"], f"{f['path']}: {error}", error.code)
        if f"artifacts/{artifact['id']}.json" != f["path"]:
            _fail("artifact-invalid", f["path"], f["path"] + ": file name must be the artifact id")
        artifacts.append({"path": f["path"], "sha256": f["sha256"], "artifact": artifact})
    # 6. References.
    def broken(where: str, message: str):
        _fail("reference-broken", where, f"{where}: {message}")

    run_ids: set[str] = set()
    for r in runs:
        if r["runId"] in run_ids:
            broken("runs.json", "duplicate run " + r["runId"])
        run_ids.add(r["runId"])
        ref = r["artifact"]
        if ref is not None:
            hit = next((a for a in artifacts if a["path"] == ref["path"]), None)
            if hit is None or hit["artifact"]["id"] != ref["id"] or hit["sha256"] != ref["sha256"]:
                broken("runs.json", f"run {r['runId']} names an artifact the bundle does not hold")
    input_ids: set[str] = set()
    for entry in inputs:
        if entry["runId"] not in run_ids or entry["runId"] in input_ids:
            broken("inputs.json", "input set for unknown or repeated run " + entry["runId"])
        input_ids.add(entry["runId"])
    if len(input_ids) != len(run_ids):
        broken("inputs.json", "every run needs exactly one captured input set")
    if len(lineage) != len(artifacts):
        broken("lineage.json", "every artifact needs exactly one lineage entry")
    for entry in lineage:
        hit = next((a for a in artifacts if a["path"] == entry["path"]), None)
        if hit is None or hit["artifact"]["id"] != entry["id"] or hit["sha256"] != entry["sha256"]:
            broken("lineage.json", "lineage names an artifact the bundle does not hold: " + entry["path"])
        p = hit["artifact"]["provenance"]
        if (entry["kind"] != p["kind"] or entry["source"] != p["source"] or entry["runId"] != p.get("runId")
                or entry["inputHash"] != p.get("inputHash") or entry["dependsOn"] != list(p.get("dependsOn", []))):
            broken("lineage.json", f"lineage of {entry['id']} differs from what the artifact declares")
    if len({entry["path"] for entry in lineage}) != len(lineage):
        broken("lineage.json", "repeated lineage entry")
    return {"bundleSha256": _sha(sums["text"]),
            "files": sorted(({"path": f["path"], "sha256": f["sha256"], "bytes": int(f["bytes"])} for f in files),
                            key=lambda f: f["path"]),
            "artifacts": artifacts, "runs": runs, "inputs": inputs, "lineage": lineage}


def validate_text(text: str) -> dict[str, Any]:
    """Bounded parse of a bundle file's text, then validate (mirror of readBundleText)."""
    if not isinstance(text, str) or _utf8_len_lenient(text) > LIMITS["textBytes"]:
        _fail("bundle-envelope", "", f"bundle: the file exceeds {LIMITS['textBytes']} bytes")
    try:
        value = _parse(text)
    except ValueError:
        _fail("bundle-envelope", "", "bundle: not JSON")
    return validate(value)


def _utf8_len_lenient(text: str) -> int:
    return len(text.encode("utf-8", "surrogatepass"))


def decide(text: str) -> dict[str, Any]:
    """Non-throwing decision (mirror of bundleDecision)."""
    try:
        result = validate_text(text)
    except BundleError as error:
        out = {"ok": False, "code": error.code, "gate": error.gate, "where": error.where, "message": str(error)}
        if error.artifact_code:
            out["artifactCode"] = error.artifact_code
        return out
    return {"ok": True, "bundleSha256": result["bundleSha256"], "files": result["files"]}


def main(argv: Sequence[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if args[:1] == ["validate"]:
        args = args[1:]
    if not args:
        print("usage: python py/datapass_bundle.py validate FILE...", file=sys.stderr)
        return 2
    results = []
    for name in args:
        try:
            text = Path(name).read_bytes().decode("utf-8")
        except (OSError, UnicodeDecodeError) as error:
            results.append({"file": name, "ok": False, "code": "DP-BUN-001", "gate": "envelope", "where": "",
                            "message": f"bundle: unreadable file: {error}"})
            continue
        results.append({"file": name, **decide(text)})
    for result in results:
        print(json.dumps(result, ensure_ascii=False))
    return 0 if all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
