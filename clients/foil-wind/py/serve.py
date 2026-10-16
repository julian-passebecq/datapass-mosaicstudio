"""foil-wind producer: the existing DataPass runtime (py/service/app.py) with one more allowlisted model.

    python clients/foil-wind/py/serve.py --port 24812 --results-dir <folder outside Git>

`foil-wind-compare` compares two run slots (1-8) of the committed HAND-MADE PLACEHOLDER
(clients/foil-wind/placeholder/foil-wind-placeholder.json) with the same comparison code as the build step
(build_data.compare_pair), one row per metric. It always reads the placeholder: FOIL_EXPORT_DIR and local
foil.export bundles are never read here. The runtime, its token, CORS, run store and result store are the
unchanged `create_app` of py/service/app.py: this file adds a model to the allowlist, it is not a new engine.
SYNTHETIC, invented numbers: not FOIL output, not Foil'O physics, not validated. The static site (no Python)
keeps working without this service.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "py" / "service"))
sys.path.insert(0, str(REPO / "py"))
sys.path.insert(0, str(HERE))

from pydantic import BaseModel, ConfigDict, Field  # noqa: E402

import app as service  # noqa: E402  (py/service/app.py)
import build_data  # noqa: E402
from runtime import Cancelled, InputSpec, ModelResult, RuntimeModel, ShouldCancel  # noqa: E402

MODEL_ID = "foil-wind-compare"
MODEL_VERSION = "foil-wind-compare-1"
DEFAULT_PORT = 24812
DEFAULT_SITE = "http://127.0.0.1:21481"
PLACEHOLDER_SHA256 = hashlib.sha256(build_data.PLACEHOLDER.read_bytes()).hexdigest()
SOURCE = (f"clients/foil-wind/py/serve.py model {MODEL_ID}: build_data.compare_pair over the "
          f"{build_data.PLACEHOLDER_LABEL} (sha256 {PLACEHOLDER_SHA256}). SYNTHETIC: power and energy are operational "
          "proxies of invented numbers, not yield, not Foil'O physics, not validated.")
COLUMNS = ("metric", "label", "unit", "valueA", "valueB", "delta", "deltaPct", "direction", "chartPct")


class CompareInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    runA: int = Field(1, ge=1, le=build_data.MAX_RUNS, strict=True, description="Run A slot")
    runB: int = Field(2, ge=1, le=build_data.MAX_RUNS, strict=True, description="Run B slot")


def _summaries() -> dict[str, dict[str, Any]]:
    data = build_data.load_placeholder()
    build_data.check_tables(data)
    runs, by_run, _ = build_data.select_runs(data)
    return {run["slot"]: build_data.summary(run, by_run[run["run"]]) for run in runs}


def compare(inputs: BaseModel, should_cancel: ShouldCancel) -> ModelResult:
    a, b = f"run-{inputs.runA}", f"run-{inputs.runB}"
    if a == b:
        raise ValueError("Choose two different runs.")
    summaries = _summaries()
    missing = [slot for slot in (a, b) if slot not in summaries]
    if missing:
        raise ValueError(f"{', '.join(missing)} is not in the placeholder ({len(summaries)} runs).")
    if should_cancel():
        raise Cancelled()
    rows = [{k: row[k] for k in COLUMNS} for row in build_data.compare_pair(a, b, summaries[a], summaries[b])]
    return ModelResult(
        rows=rows, row_key="metric",
        title=f"ILLUSTRATIVE, SYNTHETIC comparison: {b} against {a} (hand-made placeholder)",
        labels={"metric": "Key", "label": "Metric", "unit": "Unit", "valueA": "A", "valueB": "B", "delta": "B - A",
                "deltaPct": "B vs A", "direction": "Direction", "chartPct": "Charted change"},
        units={"deltaPct": "%", "chartPct": "%"},
        representations=[
            {"id": "table", "title": "B against A", "kind": "table"},
            {"id": "change-chart", "title": "B vs A, % of A", "kind": "chart", "chart": "bar", "x": "metric", "y": "chartPct", "unit": "%"},
            {"id": "power-delta", "title": "Mean power proxy, B - A", "kind": "metric", "row": "meanPowerKw", "column": "delta", "unit": "kW", "digits": 3,
             "inputs": ["runA", "runB"]},
            {"id": "wind-delta", "title": "Mean wind, B - A", "kind": "metric", "row": "meanWindMs", "column": "delta", "unit": "m/s", "digits": 3},
            {"id": "json", "title": "JSON", "kind": "json"},
        ],
    )


MODEL = RuntimeModel(
    id=MODEL_ID, version=MODEL_VERSION, title="ILLUSTRATIVE foil-wind run comparison (SYNTHETIC placeholder)",
    description="Run B against run A over the hand-made placeholder, one row per metric. Invented numbers, not FOIL output.",
    artifact_id="foil-wind-compare-run", source=SOURCE, inputs_class=CompareInputs,
    inputs=(InputSpec("runA", "Run A slot", "", 1), InputSpec("runB", "Run B slot", "", 1)),
    compute=compare,
)
MODELS: dict[str, RuntimeModel] = {**service.RUNTIME_MODELS, MODEL_ID: MODEL}


def create_app(**kwargs: Any):
    """The unchanged runtime app with this client's model added to the allowlist."""
    return service.create_app(models=MODELS, **kwargs)


def pairing_link(site: str, port: int, token: str, page: str = "loop") -> str:
    return f"{site.rstrip('/')}/?page={page}#runtime={quote(f'http://127.0.0.1:{port}', safe='')}&token={quote(token, safe='')}"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--site", default=os.environ.get("DATAPASS_SITE_ORIGIN", DEFAULT_SITE), help="client site origin printed in the pairing link")
    parser.add_argument("--results-dir", default=None, help="OPT-IN result store folder, outside any Git work tree")
    parser.add_argument("--results-max-bytes", type=int, default=service.DEFAULT_RESULTS_MAX_BYTES)
    args = parser.parse_args(argv)
    import uvicorn
    service.app.state.runs.shutdown()  # the module's default app is not served
    try:
        application = create_app(results_dir=args.results_dir, results_max_bytes=args.results_max_bytes)
    except service.StoreError as error:
        raise SystemExit(f"Result store refused: {error}") from None
    print(f"SYNTHETIC producer {MODEL_ID} over the hand-made placeholder (sha256 {PLACEHOLDER_SHA256[:12]}).", file=sys.stderr, flush=True)
    print("Pair the site with: " + pairing_link(args.site, args.port, application.state.runtime_token), file=sys.stderr, flush=True)
    try:
        uvicorn.run(application, host="127.0.0.1", port=args.port, log_level="warning")
    finally:
        application.state.runs.shutdown()


if __name__ == "__main__":
    main()
