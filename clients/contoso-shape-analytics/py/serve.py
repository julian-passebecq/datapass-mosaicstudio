"""contoso-shape-analytics producer: the existing DataPass runtime (py/service/app.py) with one more allowlisted model.

    python clients/contoso-shape-analytics/py/serve.py --port 24811 --results-dir <folder outside Git>

`contoso-shape-scenario` applies a price change and a cost change (percent) to the committed SYNTHETIC base artifact
(clients/contoso-shape-analytics/data/contoso-shape.synthetic.artifact.json, a byte copy of the interop fixture
`orchard-monthly-yield`) and returns revenue, cost and margin per row plus an "all orchards" total row. The runtime,
its token, CORS, run store and result store are the unchanged `create_app` of py/service/app.py: this file adds a
model to the allowlist, it is not a new engine. Every value is SYNTHETIC and ILLUSTRATIVE; nothing here is Contoso
business data, a forecast or a validated model.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

HERE = Path(__file__).resolve().parent
CLIENT = HERE.parent
REPO = CLIENT.parent.parent
sys.path.insert(0, str(REPO / "py" / "service"))
sys.path.insert(0, str(REPO / "py"))

from pydantic import BaseModel, ConfigDict, Field  # noqa: E402

from datapass_artifact import validate  # noqa: E402
import app as service  # noqa: E402  (py/service/app.py)
from runtime import Cancelled, InputSpec, ModelResult, RuntimeModel, ShouldCancel  # noqa: E402

BASE_PATH = CLIENT / "data" / "contoso-shape.synthetic.artifact.json"
BASE_ID = "orchard-monthly-yield"
MODEL_ID = "contoso-shape-scenario"
MODEL_VERSION = "contoso-shape-scenario-1"
DEFAULT_PORT = 24811
DEFAULT_SITE = "http://127.0.0.1:21491"


def load_base(path: Path = BASE_PATH) -> tuple[dict[str, Any], str]:
    """The validated base artifact and the SHA-256 of its exact bytes (its lineage reference)."""
    data = path.read_bytes()
    artifact = validate(json.loads(data.decode("utf-8")))
    if artifact["id"] != BASE_ID or artifact["provenance"]["kind"] != "synthetic" or artifact["payload"]["kind"] != "table":
        raise ValueError(f"{path.name}: expected the synthetic {BASE_ID} table")
    return artifact, hashlib.sha256(data).hexdigest()


BASE, BASE_SHA256 = load_base()
SOURCE = (f"clients/contoso-shape-analytics/py/serve.py model {MODEL_ID} over the SYNTHETIC base artifact {BASE_ID} "
          f"(sha256 {BASE_SHA256}). ILLUSTRATIVE scenario arithmetic on invented rows: not Contoso business data, "
          "not a forecast, not validated.")


class ScenarioInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    priceChangePct: float = Field(0.0, ge=-50.0, le=50.0, strict=True, allow_inf_nan=False, description="Price change (%)")
    costChangePct: float = Field(0.0, ge=-50.0, le=50.0, strict=True, allow_inf_nan=False, description="Cost change (%)")


def _money(value: float) -> float:
    return round(value, 2)


def scenario(inputs: BaseModel, should_cancel: ShouldCancel) -> ModelResult:
    price = 1 + inputs.priceChangePct / 100.0
    cost = 1 + inputs.costChangePct / 100.0
    rows: list[dict[str, Any]] = []
    for base in BASE["payload"]["rows"]:
        if should_cancel():
            raise Cancelled()
        revenue, spend = base["revenue"] * price, base["cost"] * cost
        rows.append({"row": base["row"], "month": base["harvest_month"], "orchard": base["orchard"],
                     "revenue": _money(revenue), "cost": _money(spend), "margin": _money(revenue - spend),
                     "marginRate": round((revenue - spend) / revenue, 4) if revenue else None})
    revenue = sum(r["revenue"] for r in rows)
    spend = sum(r["cost"] for r in rows)
    rows.append({"row": "total", "month": "all", "orchard": "All orchards", "revenue": _money(revenue), "cost": _money(spend),
                 "margin": _money(revenue - spend), "marginRate": round((revenue - spend) / revenue, 4) if revenue else None})
    return ModelResult(
        rows=rows, row_key="row",
        title=(f"ILLUSTRATIVE, SYNTHETIC scenario: price {inputs.priceChangePct:+g}%, cost {inputs.costChangePct:+g}% "
               f"on {BASE_ID}"),
        labels={"row": "Row", "month": "Harvest month", "orchard": "Orchard", "revenue": "Revenue", "cost": "Cost",
                "margin": "Margin", "marginRate": "Margin rate"},
        units={"revenue": "USD", "cost": "USD", "margin": "USD", "marginRate": "ratio"},
        representations=[
            {"id": "table", "title": "Scenario rows", "kind": "table"},
            {"id": "margin-chart", "title": "Margin by row", "kind": "chart", "chart": "bar", "x": "row", "y": "margin", "unit": "USD"},
            {"id": "total-revenue", "title": "Total revenue", "kind": "metric", "row": "total", "column": "revenue", "unit": "USD", "digits": 0,
             "inputs": ["priceChangePct"]},
            {"id": "total-margin", "title": "Total margin", "kind": "metric", "row": "total", "column": "margin", "unit": "USD", "digits": 0,
             "inputs": ["priceChangePct", "costChangePct"]},
            {"id": "margin-rate", "title": "Margin rate", "kind": "metric", "row": "total", "column": "marginRate", "unit": "ratio", "digits": 3},
            {"id": "json", "title": "JSON", "kind": "json"},
        ],
    )


MODEL = RuntimeModel(
    id=MODEL_ID, version=MODEL_VERSION, title="ILLUSTRATIVE Contoso-shape price/cost scenario (SYNTHETIC)",
    description=f"Revenue, cost and margin of the SYNTHETIC {BASE_ID} rows after a price and a cost change. "
                "Invented data, not a forecast.",
    artifact_id="contoso-shape-scenario-run", source=SOURCE, inputs_class=ScenarioInputs,
    inputs=(InputSpec("priceChangePct", "Price change", "%", 1), InputSpec("costChangePct", "Cost change", "%", 1)),
    compute=scenario,
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
    print(f"SYNTHETIC producer {MODEL_ID} over {BASE_ID} (sha256 {BASE_SHA256[:12]}).", file=sys.stderr, flush=True)
    print("Pair the site with: " + pairing_link(args.site, args.port, application.state.runtime_token), file=sys.stderr, flush=True)
    try:
        uvicorn.run(application, host="127.0.0.1", port=args.port, log_level="warning")
    finally:
        application.state.runs.shutdown()


if __name__ == "__main__":
    main()
