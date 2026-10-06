"""Level 3 of the Python bridge: compute on demand, same `datapass.artifact` v1 contract.

PROTOTYPE, loopback only, no authentication. It binds 127.0.0.1, answers only
loopback Host headers (DNS-rebinding guard), allows CORS only from the Vite dev
origins and refuses request bodies above 2 KB. Do not expose it on a network.

    python py/service/app.py                 # http://127.0.0.1:8765
    python py/service/app.py --port 8766

Endpoints
    GET  /health                     liveness + model version
    GET  /artifacts/{id}             a precomputed artifact (clients/python-wind-reference/public/artifacts)
    POST /compute/wind-reference     {k, c, hubHeight} -> ILLUSTRATIVE artifact `wind-aep-live`

The numbers are ILLUSTRATIVE (generic power curve, Weibull wind, power-law shear,
no losses). Not FOIL data, not a site assessment.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.middleware.trustedhost import TrustedHostMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from pydantic import BaseModel, ConfigDict, Field  # noqa: E402

from datapass_artifact import ArtifactError, to_artifact, validate  # noqa: E402
from wind_reference_model import HOURS, RATED_KW, annual_energy_mwh  # noqa: E402

MODEL_VERSION = "wind-reference-live-1"
LIVE_ARTIFACT_ID = "wind-aep-live"
REFERENCE_HEIGHT_M = 100.0
SHEAR_EXPONENT = 0.14
SWEEP_HEIGHTS_M = tuple(range(60, 201, 20))
MAX_BODY_BYTES = 2048
DEFAULT_PORT = 8765
DEFAULT_ORIGINS = ("http://127.0.0.1:5173", "http://localhost:5173")
LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "[::1]", "::1")
ARTIFACT_DIR = HERE.parents[1] / "clients" / "python-wind-reference" / "public" / "artifacts"
_ID = re.compile(r"^[a-z][a-zA-Z0-9_-]{0,79}$")
SOURCE = ("py/service/app.py POST /compute/wind-reference. ILLUSTRATIVE: generic 3 MW-class power curve, "
          "Weibull wind with scale c given at 100 m, power-law shear 0.14, no losses. Not FOIL data, not a site assessment.")


class WindReferenceInputs(BaseModel):
    """Domain inputs, bounded so one request stays a few milliseconds of work."""
    model_config = ConfigDict(extra="forbid")
    k: float = Field(2.0, ge=1.0, le=4.0, strict=True, allow_inf_nan=False, description="Weibull shape k")
    c: float = Field(8.0, ge=3.0, le=15.0, strict=True, allow_inf_nan=False, description="Weibull scale c at 100 m (m/s)")
    hubHeight: float = Field(120.0, ge=40.0, le=250.0, strict=True, allow_inf_nan=False, description="Hub height (m)")


def run_id(inputs: WindReferenceInputs) -> str:
    """Deterministic: same model version + same inputs -> same runId."""
    canonical = json.dumps({"model": MODEL_VERSION, "inputs": inputs.model_dump()}, sort_keys=True, separators=(",", ":"))
    return "run-" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def _row(row_id: str, height: float, k: float, c_ref: float) -> dict[str, Any]:
    c_hub = c_ref * (height / REFERENCE_HEIGHT_M) ** SHEAR_EXPONENT
    mean = c_hub * math.gamma(1 + 1 / k)
    aep = annual_energy_mwh(mean, k)
    return {"id": row_id, "hubHeight": round(float(height), 1), "hubScale": round(c_hub, 3), "meanSpeed": round(mean, 3),
            "aep": round(aep, 1), "capacityFactor": round(100 * aep / (RATED_KW * HOURS / 1000.0), 2)}


def compute_wind_reference(inputs: WindReferenceInputs) -> dict[str, Any]:
    """AEP vs hub height for the requested Weibull; row `selected` is the requested hub height."""
    rows = [_row(f"h-{h:03d}", h, inputs.k, inputs.c) for h in SWEEP_HEIGHTS_M if abs(h - inputs.hubHeight) > 1e-9]
    rows.append(_row("selected", inputs.hubHeight, inputs.k, inputs.c))
    rows.sort(key=lambda r: r["hubHeight"])
    return to_artifact(
        rows, id=LIVE_ARTIFACT_ID, row_key="id", provenance="computed", source=SOURCE, run_id=run_id(inputs),
        title=f"ILLUSTRATIVE live AEP vs hub height (k={inputs.k:g}, c={inputs.c:g} m/s at 100 m, hub {inputs.hubHeight:g} m)",
        labels={"id": "Case", "hubHeight": "Hub height", "hubScale": "Weibull scale at hub", "meanSpeed": "Mean speed at hub",
                "aep": "Annual energy (gross)", "capacityFactor": "Capacity factor"},
        units={"hubHeight": "m", "hubScale": "m/s", "meanSpeed": "m/s", "aep": "MWh/yr", "capacityFactor": "%"},
        representations=[
            {"id": "aep", "title": "AEP at selected hub height", "kind": "metric", "row": "selected", "column": "aep", "unit": "MWh/yr", "digits": 0},
            {"id": "cf", "title": "Capacity factor at selected hub height", "kind": "metric", "row": "selected", "column": "capacityFactor", "unit": "%", "digits": 1},
            {"id": "table", "title": "AEP by hub height", "kind": "table"},
            {"id": "curve", "title": "AEP vs hub height", "kind": "chart", "chart": "line", "x": "hubHeight", "y": "aep", "unit": "MWh/yr"},
            {"id": "json", "title": "JSON", "kind": "json"},
        ],
    )


class _BodyLimit:
    """Pure ASGI guard: POST bodies need a Content-Length <= MAX_BODY_BYTES."""

    def __init__(self, app: Any, limit: int = MAX_BODY_BYTES) -> None:
        self.app, self.limit = app, limit

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] == "http" and scope["method"] in ("POST", "PUT", "PATCH"):
            headers = dict(scope.get("headers") or [])
            raw = headers.get(b"content-length")
            status, detail = None, ""
            if raw is None:
                status, detail = 411, "Content-Length required"
            elif not raw.isdigit() or int(raw) > self.limit:
                status, detail = 413, f"Request body above {self.limit} bytes"
            if status:
                await JSONResponse({"detail": detail}, status_code=status)(scope, receive, send)
                return
        await self.app(scope, receive, send)


def create_app(*, origins: tuple[str, ...] | None = None, allowed_hosts: tuple[str, ...] = LOOPBACK_HOSTS,
               artifact_dir: Path = ARTIFACT_DIR) -> FastAPI:
    env_origins = os.environ.get("DATAPASS_SERVICE_ORIGINS")
    origins = origins or (tuple(o.strip() for o in env_origins.split(",") if o.strip()) if env_origins else DEFAULT_ORIGINS)
    app = FastAPI(title="DataPass artifact service (prototype)", version=MODEL_VERSION, docs_url="/docs", redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=list(origins), allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type"], allow_credentials=False, max_age=600)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(allowed_hosts))
    app.add_middleware(_BodyLimit)

    @app.middleware("http")
    async def no_store(request: Any, call_next: Any) -> Any:
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "service": "datapass-artifact-service", "model": MODEL_VERSION, "illustrative": True}

    @app.get("/artifacts/{artifact_id}")
    def get_artifact(artifact_id: str) -> dict[str, Any]:
        if not _ID.match(artifact_id):
            raise HTTPException(status_code=422, detail="invalid artifact id")
        path = artifact_dir / f"{artifact_id}.json"
        if not path.is_file():
            raise HTTPException(status_code=404, detail=f"artifact {artifact_id} not found")
        try:
            artifact = validate(json.loads(path.read_text(encoding="utf-8")))
        except (ArtifactError, ValueError) as error:
            raise HTTPException(status_code=500, detail=f"stored artifact is invalid: {error}") from error
        if artifact["id"] != artifact_id:
            raise HTTPException(status_code=500, detail="stored artifact id mismatch")
        return artifact

    @app.post("/compute/wind-reference")
    def compute(inputs: WindReferenceInputs) -> dict[str, Any]:
        return compute_wind_reference(inputs)

    return app


app = create_app()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="DataPass live artifact service (loopback prototype)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("DATAPASS_SERVICE_PORT", DEFAULT_PORT)))
    args = parser.parse_args(argv)
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
