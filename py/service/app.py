"""Levels 3 and 4 of the Python bridge: compute on demand, same `datapass.artifact` v1 contract.

PROTOTYPE, loopback only. The level 3 endpoints below have no authentication; the
level 4 runs API (`/api/runtime/v1/*`, see runtime.py) needs the X-Datapass-Token header. It binds 127.0.0.1, answers only
loopback Host headers (DNS-rebinding guard), allows CORS only from the Vite dev
origins and refuses request bodies above 2 KB. Do not expose it on a network.

    python py/service/app.py                 # http://127.0.0.1:8765
    python py/service/app.py --port 8766

Endpoints
    GET  /health                     liveness + model version
    GET  /artifacts/{id}             a precomputed artifact (clients/python-wind-reference/public/artifacts)
    POST /compute/wind-reference     {k, c, hubHeight} -> ILLUSTRATIVE artifact `wind-aep-live`
    /api/runtime/v1/...              token-protected runs of allowlisted models (`datapass.runtime/1`)

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
from urllib.parse import quote

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.middleware.trustedhost import TrustedHostMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from pydantic import BaseModel, ConfigDict, Field, model_validator  # noqa: E402

from datapass_artifact import ArtifactError, to_artifact, validate  # noqa: E402
from wind_reference_model import HOURS, RATED_KW, annual_energy_mwh, power_kw  # noqa: E402
from result_store import (DEFAULT_MAX_BYTES as DEFAULT_RESULTS_MAX_BYTES, MAX_BODY_BYTES as NOTEBOOK_BODY_BYTES,  # noqa: E402
                          NOTEBOOK_PREFIX, NotebookGuard, ResultStore, StoreError, create_notebook_router)
from runtime import (Cancelled, InputSpec, ModelResult, RunStore, RuntimeGuard, RuntimeModel,  # noqa: E402
                     ShouldCancel, create_router, resolve_token)

MODEL_VERSION = "wind-reference-live-1"
SERVICE_NAME = "datapass-artifact-service"
SERVICE_VERSION = "0.4.0"
LIVE_ARTIFACT_ID = "wind-aep-live"
REFERENCE_HEIGHT_M = 100.0
SHEAR_EXPONENT = 0.14
SWEEP_HEIGHTS_M = tuple(range(60, 201, 20))
MAX_BODY_BYTES = 2048
DEFAULT_PORT = 8765
DEFAULT_ORIGINS = ("http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173", "http://localhost:4173")
DEFAULT_WORKBENCH_ORIGIN = "http://127.0.0.1:5173"
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


# --- Level 4 runtime models (allowlist). Inputs are validated by their pydantic class; nothing else runs. ---

RUNTIME_SOURCE = ("py/service/app.py runtime model {model}. ILLUSTRATIVE: generic 3 MW-class power curve, Weibull wind, "
                  "no losses. Not FOIL data, not a site assessment.")


def runtime_wind_reference(inputs: BaseModel, should_cancel: ShouldCancel) -> ModelResult:
    """Same computation as POST /compute/wind-reference, one should_cancel() check per row."""
    assert isinstance(inputs, WindReferenceInputs)
    rows = []
    for h in SWEEP_HEIGHTS_M:
        if should_cancel():
            raise Cancelled()
        if abs(h - inputs.hubHeight) > 1e-9:
            rows.append(_row(f"h-{h:03d}", h, inputs.k, inputs.c))
    rows.append(_row("selected", inputs.hubHeight, inputs.k, inputs.c))
    rows.sort(key=lambda r: r["hubHeight"])
    return ModelResult(
        rows=rows,
        title=f"ILLUSTRATIVE run: AEP vs hub height (k={inputs.k:g}, c={inputs.c:g} m/s at 100 m, hub {inputs.hubHeight:g} m)",
        labels={"id": "Case", "hubHeight": "Hub height", "hubScale": "Weibull scale at hub", "meanSpeed": "Mean speed at hub",
                "aep": "Annual energy (gross)", "capacityFactor": "Capacity factor"},
        units={"hubHeight": "m", "hubScale": "m/s", "meanSpeed": "m/s", "aep": "MWh/yr", "capacityFactor": "%"},
        representations=[
            {"id": "aep", "title": "AEP at selected hub height", "kind": "metric", "row": "selected", "column": "aep", "unit": "MWh/yr", "digits": 0,
             "inputs": ["k", "c", "hubHeight"]},
            {"id": "cf", "title": "Capacity factor at selected hub height", "kind": "metric", "row": "selected", "column": "capacityFactor", "unit": "%", "digits": 1,
             "inputs": ["k", "c", "hubHeight"]},
            {"id": "table", "title": "AEP by hub height", "kind": "table"},
            {"id": "curve", "title": "AEP vs hub height", "kind": "chart", "chart": "line", "x": "hubHeight", "y": "aep", "unit": "MWh/yr"},
            {"id": "json", "title": "JSON", "kind": "json"},
        ],
    )


GRID_STEP = 0.01  # m/s, same trapezoid step as wind_reference_model.annual_energy_mwh
GRID_MAX_RESOLUTION = 80  # 6 400 rows (< 10 000) and about 0.6 MB (< 1 MB); roughly 2 s of real work on a laptop
_GRID_CURVE = tuple((i * GRID_STEP, power_kw(i * GRID_STEP)) for i in range(int(round(30 / GRID_STEP)) + 1))
_GRID_CURVE = tuple((v, p) for v, p in _GRID_CURVE if p > 0)  # zero-power points add nothing to the integral


class WindWeibullGridInputs(BaseModel):
    """A k x c grid; resolution^2 rows, bounded so the artifact stays under the browser budget."""
    model_config = ConfigDict(extra="forbid")
    kMin: float = Field(1.5, ge=1.0, le=4.0, strict=True, allow_inf_nan=False, description="Weibull shape k, lowest")
    kMax: float = Field(3.0, ge=1.0, le=4.0, strict=True, allow_inf_nan=False, description="Weibull shape k, highest")
    cMin: float = Field(5.0, ge=3.0, le=15.0, strict=True, allow_inf_nan=False, description="Weibull scale c, lowest (m/s)")
    cMax: float = Field(11.0, ge=3.0, le=15.0, strict=True, allow_inf_nan=False, description="Weibull scale c, highest (m/s)")
    resolution: int = Field(20, ge=2, le=GRID_MAX_RESOLUTION, strict=True, description="Grid points per axis")

    @model_validator(mode="after")
    def _ordered(self) -> "WindWeibullGridInputs":
        if self.kMin >= self.kMax:
            raise ValueError("kMin must be below kMax")
        if self.cMin >= self.cMax:
            raise ValueError("cMin must be below cMax")
        return self


def grid_aep_mwh(k: float, c: float) -> float:
    """Trapezoid integral of power x Weibull(k, c) density over 0..30 m/s, times 8760 h (power is 0 at both ends)."""
    exp, km1 = math.exp, k - 1
    total = 0.0
    for v, p in _GRID_CURVE:
        x = v / c
        total += p * x ** km1 * exp(-(x ** k))
    return total * (k / c) * GRID_STEP * HOURS / 1000.0


def runtime_wind_weibull_grid(inputs: BaseModel, should_cancel: ShouldCancel) -> ModelResult:
    """Real AEP for every (k, c) of the grid; checks should_cancel() before each row."""
    assert isinstance(inputs, WindWeibullGridInputs)
    n = inputs.resolution
    rated_mwh = RATED_KW * HOURS / 1000.0
    rows = []
    for i in range(n):
        k = inputs.kMin + (inputs.kMax - inputs.kMin) * i / (n - 1)
        for j in range(n):
            if should_cancel():
                raise Cancelled()
            c = inputs.cMin + (inputs.cMax - inputs.cMin) * j / (n - 1)
            aep = grid_aep_mwh(k, c)
            rows.append({"id": f"k{i}-c{j}", "k": round(k, 4), "c": round(c, 4), "meanSpeed": round(c * math.gamma(1 + 1 / k), 3),
                         "aep": round(aep, 1), "capacityFactor": round(100 * aep / rated_mwh, 2)})
    best = max(rows, key=lambda r: r["aep"])
    return ModelResult(
        rows=rows,
        title=f"ILLUSTRATIVE run: AEP over a {n} x {n} Weibull grid (k {inputs.kMin:g}..{inputs.kMax:g}, c {inputs.cMin:g}..{inputs.cMax:g} m/s)",
        labels={"id": "Cell", "k": "Weibull shape k", "c": "Weibull scale c", "meanSpeed": "Mean speed",
                "aep": "Annual energy (gross)", "capacityFactor": "Capacity factor"},
        units={"c": "m/s", "meanSpeed": "m/s", "aep": "MWh/yr", "capacityFactor": "%"},
        representations=[
            {"id": "best-aep", "title": "Highest AEP in the grid", "kind": "metric", "row": best["id"], "column": "aep", "unit": "MWh/yr", "digits": 0,
             "inputs": ["kMin", "kMax", "cMin", "cMax", "resolution"]},
            {"id": "best-cf", "title": "Highest capacity factor in the grid", "kind": "metric", "row": best["id"], "column": "capacityFactor", "unit": "%", "digits": 1},
            {"id": "table", "title": "AEP by Weibull k and c", "kind": "table"},
            {"id": "aep-vs-mean", "title": "AEP vs mean speed", "kind": "chart", "chart": "scatter", "x": "meanSpeed", "y": "aep", "unit": "MWh/yr"},
            {"id": "json", "title": "JSON", "kind": "json"},
        ],
    )


RUNTIME_MODELS: dict[str, RuntimeModel] = {
    "wind-reference": RuntimeModel(
        id="wind-reference", version=MODEL_VERSION, title="ILLUSTRATIVE wind reference (AEP vs hub height)",
        description="Gross AEP of a generic 3 MW-class turbine for a Weibull wind (c at 100 m, shear 0.14) across hub heights. "
                    "ILLUSTRATIVE, not FOIL data.",
        artifact_id="wind-reference-run", source=RUNTIME_SOURCE.format(model="wind-reference"),
        inputs_class=WindReferenceInputs,
        inputs=(InputSpec("k", "Weibull shape k", "", 0.1), InputSpec("c", "Weibull scale c at 100 m", "m/s", 0.1),
                InputSpec("hubHeight", "Hub height", "m", 5)),
        compute=runtime_wind_reference,
    ),
    "wind-weibull-grid": RuntimeModel(
        id="wind-weibull-grid", version="wind-weibull-grid-1", title="ILLUSTRATIVE Weibull grid (AEP over k x c)",
        description=f"Gross AEP of a generic 3 MW-class turbine for every Weibull (k, c) of a grid, up to "
                    f"{GRID_MAX_RESOLUTION} x {GRID_MAX_RESOLUTION} cells. ILLUSTRATIVE, not FOIL data.",
        artifact_id="wind-weibull-grid-run", source=RUNTIME_SOURCE.format(model="wind-weibull-grid"),
        inputs_class=WindWeibullGridInputs,
        inputs=(InputSpec("kMin", "Weibull shape k, lowest", "", 0.1), InputSpec("kMax", "Weibull shape k, highest", "", 0.1),
                InputSpec("cMin", "Weibull scale c, lowest", "m/s", 0.1), InputSpec("cMax", "Weibull scale c, highest", "m/s", 0.1),
                InputSpec("resolution", "Grid points per axis", "", 1)),
        compute=runtime_wind_weibull_grid,
    ),
}


class _BodyLimit:
    """Pure ASGI guard: POST bodies need a Content-Length <= MAX_BODY_BYTES."""

    def __init__(self, app: Any, limit: int = MAX_BODY_BYTES, prefixes: dict[str, int] | None = None) -> None:
        self.app, self.limit, self.prefixes = app, limit, dict(prefixes or {})

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] == "http" and scope["method"] in ("POST", "PUT", "PATCH"):
            headers = dict(scope.get("headers") or [])
            raw = headers.get(b"content-length")
            path = scope.get("path", "")
            limit = next((n for p, n in self.prefixes.items() if path == p or path.startswith(p + "/")), self.limit)
            status, detail = None, ""
            if raw is None:
                status, detail = 411, "Content-Length required"
            elif not raw.isdigit() or int(raw) > limit:
                status, detail = 413, f"Request body above {limit} bytes"
            if status:
                await JSONResponse({"detail": detail}, status_code=status)(scope, receive, send)
                return
        await self.app(scope, receive, send)


def create_app(*, origins: tuple[str, ...] | None = None, allowed_hosts: tuple[str, ...] = LOOPBACK_HOSTS,
               artifact_dir: Path = ARTIFACT_DIR, models: dict[str, RuntimeModel] | None = None,
               token: str | None = None, results_dir: Path | str | None = None,
               results_max_bytes: int = DEFAULT_RESULTS_MAX_BYTES) -> FastAPI:
    """`results_dir` (opt-in) enables the durable result store; the nbformat routes need `nbformat` installed."""
    env_origins = os.environ.get("DATAPASS_SERVICE_ORIGINS")
    origins = origins or (tuple(o.strip() for o in env_origins.split(",") if o.strip()) if env_origins else DEFAULT_ORIGINS)
    app = FastAPI(title="DataPass artifact service (prototype)", version=MODEL_VERSION, docs_url="/docs", redoc_url=None)
    runtime_token = resolve_token(token)
    store = RunStore(RUNTIME_MODELS if models is None else models)
    app.state.runtime_token = runtime_token
    app.state.runs = store
    app.add_middleware(RuntimeGuard, token=runtime_token, origins=tuple(origins))
    app.add_middleware(NotebookGuard, token=runtime_token, origins=tuple(origins))
    app.add_middleware(CORSMiddleware, allow_origins=list(origins), allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type", "X-Datapass-Token"], allow_credentials=False, max_age=600)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(allowed_hosts))
    app.add_middleware(_BodyLimit, prefixes={NOTEBOOK_PREFIX: NOTEBOOK_BODY_BYTES})

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

    app.include_router(create_router(store, SERVICE_NAME, SERVICE_VERSION))
    # Optional notebook routes (FR-02/FR-03): .ipynb exchange through nbformat, and the result store only
    # when a folder was chosen. Missing nbformat leaves the routes out; the runtime above is unchanged.
    result_store = None
    if results_dir is not None:
        result_store = ResultStore(results_dir, results_max_bytes)
        result_store.secrets = (runtime_token.encode("utf-8"),)
    app.state.result_store = result_store
    try:
        app.include_router(create_notebook_router(result_store))
        app.state.notebook_routes = True
    except ImportError:
        if result_store is not None:
            raise
        app.state.notebook_routes = False
    return app


app = create_app()


def connect_line(port: int, token: str, workbench_origin: str = DEFAULT_WORKBENCH_ORIGIN) -> str:
    runtime_url = quote(f"http://127.0.0.1:{port}", safe="")
    return (f"DataPass runtime ready. Open the workbench with: {workbench_origin.rstrip('/')}/?workspace=blank"
            f"#runtime={runtime_url}&token={quote(token, safe='')}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="DataPass live artifact service and runtime runs API (loopback prototype)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("DATAPASS_SERVICE_PORT", DEFAULT_PORT)))
    parser.add_argument("--workbench-origin", default=DEFAULT_WORKBENCH_ORIGIN,
                        help=f"origin printed in the connect line (default {DEFAULT_WORKBENCH_ORIGIN})")
    parser.add_argument("--results-dir", default=None,
                        help="OPT-IN durable result store: a folder you choose, outside any version-controlled work tree")
    parser.add_argument("--results-max-bytes", type=int, default=DEFAULT_RESULTS_MAX_BYTES,
                        help=f"bound for the result store (default {DEFAULT_RESULTS_MAX_BYTES} bytes)")
    args = parser.parse_args(argv)
    import uvicorn
    application = app
    if args.results_dir is not None:
        try:
            application = create_app(token=app.state.runtime_token, results_dir=args.results_dir, results_max_bytes=args.results_max_bytes)
        except StoreError as error:
            raise SystemExit(f"Result store refused: {error}") from None
        app.state.runs.shutdown()  # the default app is replaced, not served
        print(f"Result store: {application.state.result_store.root} (limit {args.results_max_bytes:,} bytes).", file=sys.stderr, flush=True)
    print(connect_line(args.port, application.state.runtime_token, args.workbench_origin), file=sys.stderr, flush=True)
    try:
        uvicorn.run(application, host="127.0.0.1", port=args.port, log_level="warning")
    finally:
        application.state.runs.shutdown()


if __name__ == "__main__":
    main()
