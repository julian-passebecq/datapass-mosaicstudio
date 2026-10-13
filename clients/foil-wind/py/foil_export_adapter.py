"""Read local `foil.export` v1 bundles (FOIL Native foil-wind-lab capture exports) into the client's own tables.

This is the ONLY file of the client that knows the producer's field names. It maps the documented export
layout (export.json, source/scenario.json, source/raw/*.jsonl) to the client-owned schema used by
build_data.py:

    run:         {run, scenario, seed, state, model, samplePeriodS, declaredMeanWindMs}
    measurement: {run, i, windMs (or None), powerKw, state, fault}

Nothing is fetched and nothing is written here. The bundles stay on the local disk of whoever builds;
the repository never contains producer output. Every file read is checked against the byte count and
sha256 listed in export.json. Anything unexpected raises ExportError with a readable message, so a bad
export leaves the build failing instead of half-rendering (AGENTS.md rule 8).
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any

EXPORT_FORMAT = "foil.export"
EXPORT_VERSION = 1
CLASSIFICATION = "SYNTHETIC"
PRODUCER = "foil-wind-lab"
SEALED_STATES = {"COMPLETED", "STOPPED", "INTERRUPTED"}
MAX_EXPORT_JSON_BYTES = 2 * 1024 * 1024
MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_ROWS_PER_RUN = 100_000
RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class ExportError(ValueError):
    """A local export that this client refuses to read."""


def _fail(where: str, message: str) -> None:
    raise ExportError(f"{where}: {message}")


def _number(value: Any, where: str, *, nullable: bool = False) -> float | None:
    if value is None and nullable:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        _fail(where, f"expected a finite number, got {value!r}")
    return float(value)


def _text(value: Any, where: str, max_len: int = 80) -> str:
    if not isinstance(value, str) or not value or len(value) > max_len:
        _fail(where, f"expected a non-empty string of at most {max_len} characters")
    return value


def _listed_files(meta: dict[str, Any], where: str) -> dict[str, tuple[int, str]]:
    files = meta.get("files")
    if not isinstance(files, list) or not files:
        _fail(where, "export.json has no files list")
    listed: dict[str, tuple[int, str]] = {}
    for entry in files:
        if not isinstance(entry, dict):
            _fail(where, "files entry is not an object")
        rel, size, digest = entry.get("path"), entry.get("bytes"), entry.get("sha256")
        if not isinstance(rel, str) or rel.startswith(("/", "\\")) or ".." in rel.replace("\\", "/").split("/") or ":" in rel:
            _fail(where, f"unsafe file path {rel!r}")
        if not isinstance(size, int) or isinstance(size, bool) or size < 0 or size > MAX_FILE_BYTES:
            _fail(where, f"bad byte count for {rel}")
        if not isinstance(digest, str) or not SHA256.match(digest):
            _fail(where, f"bad sha256 for {rel}")
        listed[rel] = (size, digest)
    return listed


def _read_listed(bundle: Path, rel: str, listed: dict[str, tuple[int, str]], where: str) -> bytes:
    if rel not in listed:
        _fail(where, f"{rel} is not listed in export.json")
    path = bundle.joinpath(*rel.split("/"))
    if not path.is_file() or path.is_symlink():
        _fail(where, f"{rel} is missing")
    data = path.read_bytes()
    size, digest = listed[rel]
    if len(data) != size or hashlib.sha256(data).hexdigest() != digest:
        _fail(where, f"{rel} does not match the bytes/sha256 declared in export.json (edited or truncated bundle)")
    return data


def read_meta(bundle: Path) -> dict[str, Any]:
    """Parse and gate export.json: format, version and classification are checked before anything else."""
    where = bundle.name
    path = bundle / "export.json"
    if not path.is_file():
        _fail(where, "no export.json")
    if path.stat().st_size > MAX_EXPORT_JSON_BYTES:
        _fail(where, "export.json is too large")
    try:
        meta = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        _fail(where, f"export.json is not valid JSON ({error})")
    if not isinstance(meta, dict):
        _fail(where, "export.json is not an object")
    if meta.get("format") != EXPORT_FORMAT:
        _fail(where, f"unsupported format {meta.get('format')!r}; expected {EXPORT_FORMAT!r}")
    if meta.get("version") != EXPORT_VERSION or isinstance(meta.get("version"), bool):
        _fail(where, f"unsupported {EXPORT_FORMAT} version {meta.get('version')!r}; this client reads version {EXPORT_VERSION} only")
    if meta.get("data_classification") != CLASSIFICATION:
        _fail(where, f"refused data_classification {meta.get('data_classification')!r}; only {CLASSIFICATION} exports are accepted")
    producer = meta.get("producer")
    if not isinstance(producer, dict) or producer.get("name") != PRODUCER:
        _fail(where, f"unexpected producer; expected {PRODUCER}")
    source = meta.get("source")
    if not isinstance(source, dict) or source.get("kind") not in {"capture", "campaign"}:
        _fail(where, "source.kind must be capture or campaign")
    return meta


def read_capture(bundle: Path, meta: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Map one capture bundle to (run, measurements) in the client schema."""
    where = bundle.name
    source = meta["source"]
    run_id = source.get("id")
    if not isinstance(run_id, str) or not RUN_ID.match(run_id):
        _fail(where, "source.id is not a safe run id")
    if source.get("state") not in SEALED_STATES:
        _fail(where, f"run state {source.get('state')!r} is not a sealed state")
    model = meta.get("model") if isinstance(meta.get("model"), dict) else {}
    listed = _listed_files(meta, where)

    try:
        scenario = json.loads(_read_listed(bundle, "source/scenario.json", listed, where).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        _fail(where, f"source/scenario.json is not valid JSON ({error})")
    if not isinstance(scenario, dict):
        _fail(where, "source/scenario.json is not an object")
    period = _number(scenario.get("sample_period_seconds"), where + " sample_period_seconds")
    if period is None or period <= 0:
        _fail(where, "sample_period_seconds must be positive")
    seed = scenario.get("seed")
    if not isinstance(seed, int) or isinstance(seed, bool):
        _fail(where, "seed must be an integer")
    run = {
        "run": run_id,
        "scenario": _text(scenario.get("scenario"), where + " scenario", 40),
        "seed": seed,
        "state": source["state"],
        "model": _text(f"{model.get('id', 'unknown')}@{model.get('version', '?')}", where + " model", 80),
        "samplePeriodS": period,
        "declaredMeanWindMs": _number(scenario.get("mean_wind_ms"), where + " mean_wind_ms"),
    }

    raw_files = sorted(rel for rel in listed if rel.startswith("source/raw/") and rel.endswith(".jsonl"))
    if not raw_files:
        _fail(where, "no source/raw/*.jsonl measurement files listed")
    measurements: list[dict[str, Any]] = []
    seen: set[int] = set()
    for rel in raw_files:
        text = _read_listed(bundle, rel, listed, where).decode("utf-8")
        for number, line in enumerate(text.splitlines(), 1):
            if not line.strip():
                continue
            at = f"{where} {rel}:{number}"
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                _fail(at, f"invalid JSON ({error})")
            if not isinstance(row, dict):
                _fail(at, "row is not an object")
            if row.get("data_classification") != CLASSIFICATION:
                _fail(at, "row is not classified SYNTHETIC")
            index = row.get("sample_index")
            if not isinstance(index, int) or isinstance(index, bool) or index < 0:
                _fail(at, "sample_index must be a non-negative integer")
            if index in seen:
                _fail(at, f"duplicate sample_index {index}")
            seen.add(index)
            fault = row.get("fault_injected")
            if not isinstance(fault, bool):
                _fail(at, "fault_injected must be a boolean")
            measurements.append({
                "run": run_id,
                "i": index,
                "windMs": _number(row.get("wind_speed_ms"), at + " wind_speed_ms", nullable=True),
                "powerKw": _number(row.get("power_kw_proxy"), at + " power_kw_proxy"),
                "state": _text(row.get("machine_state"), at + " machine_state", 40),
                "fault": fault,
            })
            if len(measurements) > MAX_ROWS_PER_RUN:
                _fail(where, f"more than {MAX_ROWS_PER_RUN} measurement rows")
    if not measurements:
        _fail(where, "the capture has no measurement rows")
    measurements.sort(key=lambda m: m["i"])
    return run, measurements


def bundle_dirs(root: Path) -> list[Path]:
    """A single bundle (root/export.json) or a folder of bundles (one level, hidden .partial-* folders ignored)."""
    if not root.is_dir():
        raise ExportError(f"export folder not found: {root.name or root}")
    if (root / "export.json").is_file():
        return [root]
    found = sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith(".") and (p / "export.json").is_file())
    if not found:
        raise ExportError("no foil.export bundle (folder with export.json) found in the given folder")
    return found


def load_export(root: str | Path) -> dict[str, Any]:
    """Read every capture bundle under `root`. Campaign bundles are counted and skipped (not shown by this client)."""
    runs: list[dict[str, Any]] = []
    measurements: list[dict[str, Any]] = []
    notices: list[str] = []
    seen_runs: set[str] = set()
    skipped_campaigns = duplicates = 0
    producer_versions: set[str] = set()
    for bundle in bundle_dirs(Path(root)):
        meta = read_meta(bundle)
        version = meta["producer"].get("version")
        if isinstance(version, str) and len(version) <= 20:
            producer_versions.add(version)
        if meta["source"]["kind"] == "campaign":
            skipped_campaigns += 1
            continue
        run, rows = read_capture(bundle, meta)
        if run["run"] in seen_runs:
            duplicates += 1
            continue
        seen_runs.add(run["run"])
        runs.append(run)
        measurements.extend(rows)
    if skipped_campaigns:
        notices.append(f"{skipped_campaigns} campaign bundle(s) skipped: this client shows capture runs only.")
    if duplicates:
        notices.append(f"{duplicates} repeated export(s) of an already read run skipped.")
    if not runs:
        raise ExportError("the folder holds no capture bundle; nothing to show")
    producer = PRODUCER + (" " + ", ".join(sorted(producer_versions)) if producer_versions else "")
    return {"kind": "export", "producer": producer, "runs": runs, "measurements": measurements, "notices": notices}
