"""Bridge level 2.5 demo: a plain Python loop rewrites one artifact; the Studio dev page follows it live.

    npm run client:dev -- python-wind-reference        # 1. open the page, choose "Live file"
    python py/examples/live_slider.py                   # 2. rewrites wind-aep-live-file.json every second

No framework: any producer (script, Jupyter cell, marimo slider, job) that calls
`watch_write(path, artifact)` gets the same live update. ILLUSTRATIVE values only
(generic power curve, Weibull wind); not FOIL data, not a site assessment.
"""
from __future__ import annotations

import argparse
import itertools
import sys
import time
from pathlib import Path

PY = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PY))
from datapass_artifact import to_artifact, watch_write  # noqa: E402
import wind_reference_model as model  # noqa: E402

ARTIFACT_ID = "wind-aep-live-file"
DEFAULT_OUT = model.DEFAULT_OUT


def artifact_for(k: float) -> dict:
    """One validated artifact for Weibull shape k (no file written)."""
    return to_artifact(
        model.table(k=k), id=ARTIFACT_ID, row_key="id", provenance="computed",
        run_id="run-k" + f"{k:.2f}".replace(".", "-"),
        source=f"py/examples/live_slider.py (Weibull k={k:.2f}). ILLUSTRATIVE: generic 3 MW-class power curve, no losses. Not FOIL data.",
        title=f"ILLUSTRATIVE live file: annual energy vs mean wind speed (Weibull k={k:.2f})",
        labels={"id": "Case", "meanSpeed": "Mean wind speed", "weibullScale": "Weibull scale c",
                "aep": "Annual energy (gross)", "capacityFactor": "Capacity factor"},
        units={"meanSpeed": "m/s", "weibullScale": "m/s", "aep": "MWh/yr", "capacityFactor": "%"},
        representations=[
            {"id": "aep-8", "title": "AEP at 8 m/s mean", "kind": "metric", "row": "mean-8-0", "column": "aep", "unit": "MWh/yr", "digits": 0},
            {"id": "table", "title": "Weibull AEP table", "kind": "table"},
            {"id": "curve", "title": "AEP vs mean speed", "kind": "chart", "chart": "line", "x": "meanSpeed", "y": "aep", "unit": "MWh/yr"},
        ],
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="artifacts folder (default: the python-wind-reference client)")
    parser.add_argument("--values", default="1.6,2.0,2.4,2.8", help="comma-separated Weibull k values to cycle through")
    parser.add_argument("--interval", type=float, default=1.0, help="seconds between writes")
    parser.add_argument("--count", type=int, default=0, help="number of writes (0 = until Ctrl+C)")
    args = parser.parse_args(argv)
    values = [float(v) for v in args.values.split(",") if v.strip()]
    if not values or any(not 1.0 <= v <= 4.0 for v in values):
        parser.error("--values: k must be within 1..4")
    target = args.out / f"{ARTIFACT_ID}.json"
    try:
        for i, k in enumerate(itertools.cycle(values)):
            if args.count and i >= args.count:
                break
            if i:
                time.sleep(args.interval)
            watch_write(target, artifact_for(k))
            print(f"wrote {target.name} k={k:.2f}", flush=True)
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
