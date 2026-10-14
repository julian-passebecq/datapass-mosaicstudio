"""foil-wind data step: runs, measurements, SQL results and run-vs-run comparison as datapass.artifact v1 files.

    python clients/foil-wind/py/build_data.py                      # hand-made placeholder -> clients/foil-wind/public/artifacts
    python clients/foil-wind/py/build_data.py --export DIR --out OUT   # local foil.export v1 bundle(s) -> OUT (never the repo)

FOIL_EXPORT_DIR is read when --export is not given. Without either, the committed hand-made placeholder is used.
Standard library only. SQL runs with sqlite3 over two in-memory tables (read-only after loading); the comparison
is computed here, in Python, for every ordered pair of runs, so the page only fetches and validates the result.
All values are SYNTHETIC; the capture power and energy figures are operational proxies of an invented surrogate,
not yield, not Foil'O physics and not validated.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
CLIENT = HERE.parent
REPO = CLIENT.parent.parent
sys.path.insert(0, str(REPO / "py"))
sys.path.insert(0, str(HERE))

from datapass_artifact import to_artifact  # noqa: E402
from foil_export_adapter import ExportError, load_export  # noqa: E402

PLACEHOLDER = CLIENT / "placeholder" / "foil-wind-placeholder.json"
QUERIES = CLIENT / "queries.json"
DEFAULT_OUT = CLIENT / "public" / "artifacts"
PREFIX = "foil-wind-"
MAX_RUNS = 8
MAX_BUCKETS = 240
MAX_SQL_ROWS = 500
PRODUCER = {"kind": "script", "name": "clients/foil-wind/py/build_data.py"}
PLACEHOLDER_LABEL = "HAND-MADE PLACEHOLDER (not FOIL output, not Foil'O physics, invented numbers)"
EXPORT_LABEL = "SYNTHETIC local foil.export v1 data (invented surrogate; power/energy are operational proxies, not yield; no Foil'O physics or validation claim)"


class DataError(ValueError):
    pass


def load_placeholder(path: Path = PLACEHOLDER) -> dict[str, Any]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("format") != "foil-wind.placeholder" or doc.get("version") != 1:
        raise DataError("placeholder: unexpected format or version")
    if "Hand-made placeholder" not in str(doc.get("label")):
        raise DataError("placeholder: the hand-made label is missing")
    return {"kind": "placeholder", "producer": "hand-made placeholder", "runs": doc["runs"], "measurements": doc["measurements"], "notices": []}


def check_tables(data: dict[str, Any]) -> None:
    """Shape check of the client schema (both sources) before anything is computed."""
    run_keys = {"run", "scenario", "seed", "state", "model", "samplePeriodS", "declaredMeanWindMs"}
    meas_keys = {"run", "i", "windMs", "powerKw", "state", "fault"}
    runs, rows = data.get("runs"), data.get("measurements")
    if not isinstance(runs, list) or not runs or not isinstance(rows, list):
        raise DataError("no runs to show")
    ids = set()
    for run in runs:
        if not isinstance(run, dict) or set(run) != run_keys:
            raise DataError(f"run fields must be exactly {sorted(run_keys)}")
        if run["run"] in ids:
            raise DataError(f"duplicate run {run['run']}")
        if not isinstance(run["samplePeriodS"], (int, float)) or run["samplePeriodS"] <= 0:
            raise DataError(f"run {run['run']}: samplePeriodS must be positive")
        ids.add(run["run"])
    for row in rows:
        if not isinstance(row, dict) or set(row) != meas_keys:
            raise DataError(f"measurement fields must be exactly {sorted(meas_keys)}")
        if row["run"] not in ids:
            raise DataError(f"measurement for unknown run {row['run']}")
        for key, nullable in (("windMs", True), ("powerKw", False)):
            value = row[key]
            if value is None and nullable:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise DataError(f"run {row['run']} sample {row['i']}: {key} is not a finite number")
        if not isinstance(row["fault"], bool) or not isinstance(row["state"], str):
            raise DataError(f"run {row['run']} sample {row['i']}: bad fault/state")
    for run_id in ids:
        if not any(r["run"] == run_id for r in rows):
            raise DataError(f"run {run_id} has no measurements")


def select_runs(data: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]], list[str]]:
    runs = sorted(data["runs"], key=lambda r: r["run"])
    notices = list(data["notices"])
    if len(runs) > MAX_RUNS:
        notices.append(f"{len(runs)} runs found; the first {MAX_RUNS} by run id are shown.")
        runs = runs[:MAX_RUNS]
    by_run: dict[str, list[dict[str, Any]]] = {r["run"]: [] for r in runs}
    for row in data["measurements"]:
        if row["run"] in by_run:
            by_run[row["run"]].append(row)
    for rows in by_run.values():
        rows.sort(key=lambda m: m["i"])
    for slot, run in enumerate(runs, 1):
        run["slot"] = f"run-{slot}"
    return runs, by_run, notices


def mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def summary(run: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    wind = [m["windMs"] for m in rows if m["windMs"] is not None]
    power = [m["powerKw"] for m in rows]
    return {
        "samples": len(rows),
        "missingWind": len(rows) - len(wind),
        "meanWindMs": mean(wind),
        "maxWindMs": max(wind) if wind else None,
        "meanPowerKw": mean(power),
        "energyProxyKwh": sum(power) * run["samplePeriodS"] / 3600.0,
        "faultSharePct": 100.0 * sum(1 for m in rows if m["fault"]) / len(rows),
    }


METRICS = [
    ("samples", "Samples", "rows"),
    ("missingWind", "Missing wind samples", "rows"),
    ("meanWindMs", "Mean wind", "m/s"),
    ("maxWindMs", "Max wind", "m/s"),
    ("meanPowerKw", "Mean power (proxy)", "kW"),
    ("energyProxyKwh", "Energy over run (proxy, not yield)", "kWh"),
    ("faultSharePct", "Samples with injected fault", "%"),
]


def r(value: float | None, digits: int = 4) -> float | None:
    return None if value is None else round(float(value), digits)


# Sign of B - A, written as text so the page never derives it. The chart draws `chartPct`: the
# percentage only for a real change (B higher or lower), so a no-change row (for example equal
# sample counts) is not drawn as a zero-length bar; the table keeps every row and `deltaPct`.
HIGHER, LOWER, SAME = "B higher", "B lower", "No change"


def change_direction(delta: float | None) -> str | None:
    if delta is None:
        return None
    return HIGHER if delta > 0 else LOWER if delta < 0 else SAME


def build(data: dict[str, Any], out_dir: Path) -> list[dict[str, Any]]:
    check_tables(data)
    runs, by_run, notices = select_runs(data)
    label = PLACEHOLDER_LABEL if data["kind"] == "placeholder" else EXPORT_LABEL
    inputs = [
        {"id": "dataSource", "label": "Data source", "value": "hand-made placeholder" if data["kind"] == "placeholder" else "local foil.export v1 bundle(s)"},
        {"id": "producer", "label": "Producer", "value": data["producer"]},
        {"id": "runs", "label": "Runs shown", "value": len(runs)},
    ]
    common = {"provenance": "synthetic", "producer": PRODUCER, "inputs": inputs}
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob(PREFIX + "*.json"):
        stale.unlink()
    written: list[dict[str, Any]] = []

    def emit(rows: Any = None, **kwargs: Any) -> None:
        written.append(to_artifact(rows, out_dir=out_dir, **common, **kwargs))

    total_rows = sum(len(v) for v in by_run.values())
    emit(text="\n".join([
        f"Data: {label}.",
        f"{len(runs)} run(s), {total_rows} measurement rows. Run slots (run-1 ... run-{len(runs)}) follow the sorted run ids.",
        *notices,
        "Python (clients/foil-wind/py/build_data.py) wrote every artifact of this page at build time: SQL through sqlite3, the comparison of every ordered pair of runs, and the time buckets. The browser only fetches and validates them.",
    ]), id=PREFIX + "source", title="Data source and limits", source=label,
        representations=[{"id": "text", "title": "Data source", "kind": "text"}])

    # Runs
    run_rows = []
    summaries = {}
    for run in runs:
        s = summary(run, by_run[run["run"]])
        summaries[run["slot"]] = s
        run_rows.append({"slot": run["slot"], "run": run["run"], "scenario": run["scenario"], "seed": run["seed"], "state": run["state"],
                         "samples": s["samples"], "missingWind": s["missingWind"], "meanWindMs": r(s["meanWindMs"]),
                         "meanPowerKw": r(s["meanPowerKw"]), "energyProxyKwh": r(s["energyProxyKwh"], 6), "faultSharePct": r(s["faultSharePct"], 2)})
    run_columns = [
        {"id": "slot", "label": "Slot", "type": "string"}, {"id": "run", "label": "Run", "type": "string"},
        {"id": "scenario", "label": "Scenario", "type": "string"}, {"id": "seed", "label": "Seed", "type": "number"},
        {"id": "state", "label": "State", "type": "string"}, {"id": "samples", "label": "Samples", "type": "number"},
        {"id": "missingWind", "label": "Missing wind", "type": "number"},
        {"id": "meanWindMs", "label": "Mean wind", "type": "number", "unit": "m/s", "nullable": True},
        {"id": "meanPowerKw", "label": "Mean power (proxy)", "type": "number", "unit": "kW"},
        {"id": "energyProxyKwh", "label": "Energy (proxy, not yield)", "type": "number", "unit": "kWh"},
        {"id": "faultSharePct", "label": "Fault samples", "type": "number", "unit": "%"},
    ]
    emit(run_rows, id=PREFIX + "runs", title="Runs", source=label, row_key="slot", columns=run_columns,
         representations=[{"id": "table", "title": "Runs", "kind": "table"},
                          {"id": "power", "title": "Mean power proxy per run", "kind": "chart", "chart": "bar", "x": "slot", "y": "meanPowerKw", "unit": "kW"},
                          {"id": "wind", "title": "Mean wind per run", "kind": "chart", "chart": "bar", "x": "slot", "y": "meanWindMs", "unit": "m/s"}])

    # Measurements: at most MAX_BUCKETS time buckets per run (means; missing wind is counted, never filled).
    bucket_columns = [
        {"id": "bucket", "label": "Bucket", "type": "string"}, {"id": "tS", "label": "Start", "type": "number", "unit": "s"},
        {"id": "samples", "label": "Samples", "type": "number"},
        {"id": "meanWindMs", "label": "Mean wind", "type": "number", "unit": "m/s", "nullable": True},
        {"id": "missingWind", "label": "Missing wind", "type": "number"},
        {"id": "meanPowerKw", "label": "Mean power (proxy)", "type": "number", "unit": "kW"},
        {"id": "faults", "label": "Fault samples", "type": "number"},
    ]
    for run in runs:
        rows = by_run[run["run"]]
        size = max(1, math.ceil(len(rows) / MAX_BUCKETS))
        buckets = []
        for start in range(0, len(rows), size):
            part = rows[start:start + size]
            wind = [m["windMs"] for m in part if m["windMs"] is not None]
            buckets.append({"bucket": f"b{start // size:03d}", "tS": r(part[0]["i"] * run["samplePeriodS"], 3), "samples": len(part),
                            "meanWindMs": r(mean(wind)), "missingWind": len(part) - len(wind),
                            "meanPowerKw": r(mean([m["powerKw"] for m in part])), "faults": sum(1 for m in part if m["fault"])})
        note = "one sample per point" if size == 1 else f"{size} samples per point"
        emit(buckets, id=PREFIX + "measurements-" + run["slot"], title=f"{run['slot']}: {run['run']} ({run['scenario']}, {note})",
             source=label, row_key="bucket", columns=bucket_columns, run_id=run["run"],
             representations=[{"id": "wind", "title": "Wind (gaps stay gaps)", "kind": "chart", "chart": "line", "x": "tS", "y": "meanWindMs", "unit": "m/s"},
                              {"id": "power", "title": "Power proxy", "kind": "chart", "chart": "line", "x": "tS", "y": "meanPowerKw", "unit": "kW"},
                              {"id": "table", "title": "Buckets", "kind": "table"}])

    # SQL
    queries = json.loads(QUERIES.read_text(encoding="utf-8"))
    db = sqlite3.connect(":memory:")
    try:
        db.execute("CREATE TABLE runs (slot TEXT PRIMARY KEY, run TEXT, scenario TEXT, seed INTEGER, state TEXT, model TEXT, sample_period_s REAL, declared_mean_wind_ms REAL)")
        db.execute("CREATE TABLE measurements (slot TEXT, i INTEGER, t_s REAL, wind_ms REAL, power_kw REAL, state TEXT, fault INTEGER)")
        db.executemany("INSERT INTO runs VALUES (?,?,?,?,?,?,?,?)", [(x["slot"], x["run"], x["scenario"], x["seed"], x["state"], x["model"], x["samplePeriodS"], x["declaredMeanWindMs"]) for x in runs])
        db.executemany("INSERT INTO measurements VALUES (?,?,?,?,?,?,?)", [(x["slot"], m["i"], m["i"] * x["samplePeriodS"], m["windMs"], m["powerKw"], m["state"], int(m["fault"])) for x in runs for m in by_run[x["run"]]])
        db.commit()
        db.execute("PRAGMA query_only = ON")
        for q in queries["queries"]:
            cursor = db.execute(q["sql"])
            names = [d[0] for d in cursor.description]
            rows = cursor.fetchmany(MAX_SQL_ROWS + 1)
            if len(rows) > MAX_SQL_ROWS:
                raise DataError(f"query {q['id']} returned more than {MAX_SQL_ROWS} rows")
            columns = [{"id": "row", "label": "#", "type": "string"}]
            for index, name in enumerate(names):
                values = [row[index] for row in rows if row[index] is not None]
                numeric = all(isinstance(v, (int, float)) for v in values)
                columns.append({"id": name, "label": name, "type": "number" if numeric else "string", "nullable": any(row[index] is None for row in rows)})
            records = [{"row": f"r{n:03d}", **{name: (None if v is None else (v if columns[i + 1]["type"] == "number" else str(v))) for i, (name, v) in enumerate(zip(names, row))}} for n, row in enumerate(rows, 1)]
            emit(records, id=PREFIX + "sql-" + q["id"], title=q["title"], source=label + "; SQL executed by sqlite3 at build time",
                 row_key="row", columns=columns, representations=[{"id": "table", "title": q["title"], "kind": "table"}])
    finally:
        db.close()

    # Run-vs-run comparison, every ordered pair (A, B), A != B.
    comparison = []
    for a in runs:
        for b in runs:
            if a is b:
                continue
            sa, sb = summaries[a["slot"]], summaries[b["slot"]]
            for key, metric_label, unit in METRICS:
                va, vb = sa[key], sb[key]
                delta = None if va is None or vb is None else vb - va
                pct = None if delta is None or va == 0 else 100.0 * delta / abs(va)
                direction = change_direction(r(delta, 6))
                comparison.append({"key": f"{a['slot']}.{b['slot']}.{key}", "runA": a["slot"], "runB": b["slot"], "metric": key, "label": metric_label, "unit": unit,
                                   "valueA": r(va, 6), "valueB": r(vb, 6), "delta": r(delta, 6), "deltaPct": r(pct, 2), "direction": direction,
                                   "chartPct": r(pct, 2) if direction in (HIGHER, LOWER) else None})
    if not comparison:
        comparison.append({"key": "none", "runA": "none", "runB": "none", "metric": "none", "label": "Only one run: nothing to compare", "unit": "",
                           "valueA": None, "valueB": None, "delta": None, "deltaPct": None, "direction": None, "chartPct": None})
    cmp_columns = [
        {"id": "key", "label": "Key", "type": "string"}, {"id": "runA", "label": "Run A", "type": "string"}, {"id": "runB", "label": "Run B", "type": "string"},
        {"id": "metric", "label": "Metric", "type": "string"}, {"id": "label", "label": "Label", "type": "string"}, {"id": "unit", "label": "Unit", "type": "string"},
        {"id": "valueA", "label": "A", "type": "number", "nullable": True}, {"id": "valueB", "label": "B", "type": "number", "nullable": True},
        {"id": "delta", "label": "B - A", "type": "number", "nullable": True}, {"id": "deltaPct", "label": "B vs A", "type": "number", "unit": "%", "nullable": True},
        {"id": "direction", "label": "Direction", "type": "string", "nullable": True},
        {"id": "chartPct", "label": "Charted change", "type": "number", "unit": "%", "nullable": True},
    ]
    emit(comparison, id=PREFIX + "comparison", title="Run-vs-run comparison (Python, every ordered pair)", source=label,
         row_key="key", columns=cmp_columns, depends_on=[PREFIX + "runs"], representations=[{"id": "table", "title": "All pairs", "kind": "table"}])
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--export", help="local foil.export v1 bundle or folder of bundles (default: FOIL_EXPORT_DIR, else the placeholder)")
    parser.add_argument("--out", help="output folder (default: clients/foil-wind/public/artifacts, placeholder only)")
    args = parser.parse_args(argv)
    export = args.export or os.environ.get("FOIL_EXPORT_DIR") or None
    out = Path(args.out).resolve() if args.out else DEFAULT_OUT
    if export and out == DEFAULT_OUT.resolve():
        print("foil-wind: refusing to write export-derived artifacts into the committed client folder; pass --out (build-export.mjs does).", file=sys.stderr)
        return 2
    try:
        data = load_export(export) if export else load_placeholder()
        written = build(data, out)
    except (ExportError, DataError) as error:
        print(f"foil-wind: export rejected: {error}", file=sys.stderr)
        return 1
    runs = len(data["runs"])
    rows = len(data["measurements"])
    print(f"foil-wind: {'local export' if export else 'hand-made placeholder'}: {runs} run(s), {rows} measurement rows, {len(written)} artifacts written.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
