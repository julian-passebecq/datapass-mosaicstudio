"""TEST FIXTURE producer for tests/runtime-lifecycle.test.mjs (S03). Not a product model, not FOIL physics.

A GENUINE DataPass runtime: the unchanged `create_app` of py/service/app.py (safe profile by default, token, CORS, run
store, Idempotency-Key, cancelRequested, /ready) with a fixture allowlist instead of the wind models:

    fixture-slow   cooperative and slow on purpose: `steps` rows, sleeping `stepMs` between them and checking
                   should_cancel() before each row, so a cancel is observed mid-run.
    fixture-fail   fails deterministically with a fixed message (every run), so a failed outcome is reproducible.

Every value is SYNTHETIC (row index arithmetic). It prints the runtime's own connect line on stderr, like
`python py/service/app.py`:

    python tests/fixtures/runtime-lifecycle/fixture_producer.py --port 24871
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "py" / "service"))
sys.path.insert(0, str(REPO / "py"))

from pydantic import BaseModel, ConfigDict, Field  # noqa: E402

import app as service  # noqa: E402  (py/service/app.py)
from runtime import Cancelled, InputSpec, ModelResult, RuntimeModel, ShouldCancel  # noqa: E402

FAIL_MESSAGE = "fixture-fail always fails (deterministic test fixture)"
SOURCE = "tests/fixtures/runtime-lifecycle/fixture_producer.py: SYNTHETIC TEST FIXTURE rows (index arithmetic). Not a model, not FOIL data."


class SlowInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    steps: int = Field(3, ge=1, le=400, strict=True, description="Rows to produce")
    stepMs: int = Field(10, ge=0, le=200, strict=True, description="Sleep between rows (ms)")
    scale: float = Field(1.0, ge=-1000.0, le=1000.0, strict=True, allow_inf_nan=False, description="Row value scale")


class FailInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    seed: int = Field(1, ge=0, le=1000, strict=True, description="Ignored; the model always fails")


def slow(inputs: BaseModel, should_cancel: ShouldCancel) -> ModelResult:
    assert isinstance(inputs, SlowInputs)
    rows: list[dict[str, Any]] = []
    for i in range(inputs.steps):
        if should_cancel():
            raise Cancelled()
        if inputs.stepMs:
            time.sleep(inputs.stepMs / 1000.0)
        rows.append({"id": f"r{i:03d}", "index": i, "value": round(inputs.scale * i, 6)})
    return ModelResult(rows=rows, title=f"SYNTHETIC TEST FIXTURE: {inputs.steps} rows", labels={"id": "Row", "index": "Index", "value": "Value"},
                       units={"value": "m/s"},
                       representations=[{"id": "table", "title": "Rows", "kind": "table"},
                                        {"id": "last", "title": "Last value", "kind": "metric", "row": rows[-1]["id"], "column": "value", "unit": "m/s"}])


def fail(inputs: BaseModel, should_cancel: ShouldCancel) -> ModelResult:
    raise ValueError(FAIL_MESSAGE)


MODELS: dict[str, RuntimeModel] = {
    "fixture-slow": RuntimeModel(
        id="fixture-slow", version="fixture-slow-1", title="TEST FIXTURE slow cooperative model (SYNTHETIC)",
        description="Test fixture: sleeps between rows and honours cancel. Not a product model.",
        artifact_id="fixture-slow-run", source=SOURCE, inputs_class=SlowInputs,
        inputs=(InputSpec("steps", "Rows", "", 1), InputSpec("stepMs", "Sleep between rows", "ms", 1), InputSpec("scale", "Row value scale", "m/s", 0.1)),
        compute=slow),
    "fixture-fail": RuntimeModel(
        id="fixture-fail", version="fixture-fail-1", title="TEST FIXTURE failing model (SYNTHETIC)",
        description="Test fixture: every run fails with the same message. Not a product model.",
        artifact_id="fixture-fail-run", source=SOURCE, inputs_class=FailInputs,
        inputs=(InputSpec("seed", "Seed (ignored)", "", 1),), compute=fail),
}


def create_app(**kwargs: Any):
    """The unchanged runtime app (safe profile unless `profile` says otherwise) with the fixture allowlist."""
    return service.create_app(models=MODELS, **kwargs)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="DataPass runtime TEST FIXTURE producer (slow + failing models)")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args(argv)
    import uvicorn
    service.app.state.runs.shutdown()  # the module's default app is not served
    application = create_app()
    print(f"Profile: {application.state.profile} (TEST FIXTURE producer)", file=sys.stderr, flush=True)
    print(service.connect_line(args.port, application.state.runtime_token), file=sys.stderr, flush=True)
    try:
        uvicorn.run(application, host="127.0.0.1", port=args.port, log_level="warning")
    finally:
        application.state.runs.shutdown()


if __name__ == "__main__":
    main()
