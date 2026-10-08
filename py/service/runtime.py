"""Level 4 of the Python bridge: a token-protected runs API (`datapass.runtime/1`).

The browser workbench submits a run of an ALLOWLISTED model, polls its status,
cancels it and fetches the resulting `datapass.artifact` v1 document. Nothing here
executes user text: a run names a registered model id and passes inputs that the
model's pydantic class validates. There is no eval, exec, shell or subprocess.

PROTOTYPE, loopback only. Every `/api/runtime/v1/*` route needs the
`X-Datapass-Token` header (compared with hmac.compare_digest); a request with an
`Origin` header must come from an allowed origin. Runs live in memory only
(at most RETAINED_RUNS records, MAX_ACTIVE_RUNS queued or running at once) and
are lost when the service stops. Results are ILLUSTRATIVE, not FOIL data.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Mapping

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from datapass_artifact import encode, to_artifact, validate

RUNTIME_FORMAT = "datapass.runtime/1"
PREFIX = "/api/runtime/v1"
TOKEN_HEADER = "X-Datapass-Token"
TOKEN_ENV = "DATAPASS_RUNTIME_TOKEN"
MAX_ACTIVE_RUNS = 8
RETAINED_RUNS = 50
MAX_WORKERS = 2
MAX_ERROR_CHARS = 500
TERMINAL = frozenset({"succeeded", "failed", "cancelled"})
_RUN_ID = re.compile(r"^run-[0-9a-f]{16}$")

ShouldCancel = Callable[[], bool]


class Cancelled(Exception):
    """Raised by a model when should_cancel() turned true; the run ends as `cancelled`."""


@dataclass(frozen=True)
class InputSpec:
    """Presentation of one input; min, max and default come from the pydantic field."""
    id: str
    label: str
    unit: str = ""
    step: float = 0.1


@dataclass(frozen=True)
class ModelResult:
    """What a model returns; the runtime adds provenance, lineage and validation."""
    rows: list[dict[str, Any]]
    title: str
    labels: Mapping[str, str]
    units: Mapping[str, str]
    representations: list[dict[str, Any]]
    row_key: str = "id"


@dataclass(frozen=True)
class RuntimeModel:
    """One allowlisted computation. `compute(inputs, should_cancel)` must check should_cancel between rows."""
    id: str
    version: str
    title: str
    description: str
    artifact_id: str
    source: str
    inputs_class: type[BaseModel]
    inputs: tuple[InputSpec, ...]
    compute: Callable[[BaseModel, ShouldCancel], ModelResult]

    def describe(self) -> dict[str, Any]:
        props = self.inputs_class.model_json_schema().get("properties", {})
        described = []
        for spec in self.inputs:
            prop = props[spec.id]
            described.append({"id": spec.id, "label": spec.label, "unit": spec.unit, "type": "number",
                              "min": prop.get("minimum"), "max": prop.get("maximum"), "default": prop.get("default"),
                              "step": spec.step})
        return {"id": self.id, "version": self.version, "title": self.title, "description": self.description,
                "illustrative": True, "artifactId": self.artifact_id, "inputs": described}


def resolve_token(token: str | None = None) -> str:
    return token or os.environ.get(TOKEN_ENV) or secrets.token_urlsafe(32)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def input_hash(model: RuntimeModel, inputs: Mapping[str, Any]) -> str:
    canonical = json.dumps({"model": model.id, "version": model.version, "inputs": dict(inputs)},
                           sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _bounded_error(error: BaseException) -> str:
    message = f"{type(error).__name__}: {error}".replace("\r", " ").replace("\n", " ")
    return message[:MAX_ERROR_CHARS]


@dataclass
class _Run:
    record: dict[str, Any]
    model: RuntimeModel
    inputs: BaseModel
    cancel: threading.Event = field(default_factory=threading.Event)
    artifact: bytes | None = None


class RunStore:
    """In-memory runs, executed by a bounded thread pool. All record changes happen under one lock."""

    def __init__(self, models: Mapping[str, RuntimeModel], *, max_workers: int = MAX_WORKERS,
                 max_active: int = MAX_ACTIVE_RUNS, retained: int = RETAINED_RUNS) -> None:
        self.models = dict(models)
        self.max_active, self.retained = max_active, retained
        self._runs: OrderedDict[str, _Run] = OrderedDict()
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="datapass-run")

    # -- queries -------------------------------------------------------------------------------
    def list(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(run.record) for run in reversed(self._runs.values())]

    def get(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            run = self._runs.get(run_id)
            return dict(run.record) if run else None

    def artifact(self, run_id: str) -> tuple[str, bytes | None] | None:
        with self._lock:
            run = self._runs.get(run_id)
            return (run.record["status"], run.artifact) if run else None

    # -- commands ------------------------------------------------------------------------------
    def submit(self, model: RuntimeModel, inputs: BaseModel) -> dict[str, Any] | None:
        normalized = inputs.model_dump()
        with self._lock:
            active = sum(1 for run in self._runs.values() if run.record["status"] not in TERMINAL)
            if active >= self.max_active:
                return None
            run_id = "run-" + secrets.token_hex(8)
            while run_id in self._runs:
                run_id = "run-" + secrets.token_hex(8)
            record = {"runId": run_id, "model": model.id, "modelVersion": model.version, "status": "queued",
                      "inputs": normalized, "inputHash": input_hash(model, normalized), "submittedAt": _now(),
                      "startedAt": None, "finishedAt": None, "error": None, "artifactId": None, "artifactSha256": None}
            self._runs[run_id] = _Run(record=record, model=model, inputs=inputs)
            self._evict()
            snapshot = dict(record)
        self._executor.submit(self._execute, run_id)
        return snapshot

    def cancel(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                return None
            status = run.record["status"]
            if status == "queued":
                run.cancel.set()
                run.record.update(status="cancelled", finishedAt=_now())
            elif status == "running":
                run.cancel.set()  # cooperative: the model sees it at its next should_cancel() check
            return dict(run.record)

    def shutdown(self) -> None:
        with self._lock:
            for run in self._runs.values():
                run.cancel.set()
        self._executor.shutdown(wait=False, cancel_futures=True)

    # -- internals -----------------------------------------------------------------------------
    def _evict(self) -> None:
        while len(self._runs) > self.retained:
            oldest = next((rid for rid, run in self._runs.items() if run.record["status"] in TERMINAL), None)
            if oldest is None:
                return
            del self._runs[oldest]

    def _finish(self, run_id: str, **changes: Any) -> None:
        with self._lock:
            run = self._runs.get(run_id)
            if run is not None:
                run.record.update(finishedAt=_now(), **{k: v for k, v in changes.items() if k != "artifact"})
                if "artifact" in changes:
                    run.artifact = changes["artifact"]

    def _execute(self, run_id: str) -> None:
        with self._lock:
            run = self._runs.get(run_id)
            if run is None or run.record["status"] != "queued":
                return  # cancelled (or evicted) while queued
            run.record.update(status="running", startedAt=_now())
            model, inputs, event, record = run.model, run.inputs, run.cancel, dict(run.record)
        try:
            result = model.compute(inputs, event.is_set)
            if event.is_set():
                raise Cancelled()
            artifact = self._artifact(model, record, result)
            data = encode(artifact)
        except Cancelled:
            self._finish(run_id, status="cancelled")
            return
        except Exception as error:  # noqa: BLE001 - a model failure is a run outcome, never a crash
            self._finish(run_id, status="failed", error=_bounded_error(error))
            return
        self._finish(run_id, status="succeeded", artifactId=artifact["id"],
                     artifactSha256=hashlib.sha256(data).hexdigest(), artifact=data)

    @staticmethod
    def _artifact(model: RuntimeModel, record: Mapping[str, Any], result: ModelResult) -> dict[str, Any]:
        title = result.title if "ILLUSTRATIVE" in result.title else f"ILLUSTRATIVE {result.title}"
        units = {spec.id: spec.unit for spec in model.inputs}
        lineage_inputs = []
        for key, value in record["inputs"].items():
            spec = next((s for s in model.inputs if s.id == key), None)
            item: dict[str, Any] = {"id": key, "label": spec.label if spec else key, "value": value}
            if units.get(key):
                item["unit"] = units[key]
            lineage_inputs.append(item)
        artifact = to_artifact(
            result.rows, id=model.artifact_id, title=title[:160], source=model.source, row_key=result.row_key,
            labels=result.labels, units=result.units, representations=result.representations,
            provenance="computed", run_id=record["runId"],
            producer={"kind": "service", "name": f"py/service runtime: {model.id}"},
            inputs=lineage_inputs, input_hash_value=record["inputHash"],
        )
        return validate(artifact)


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str = Field(min_length=1, max_length=80)
    inputs: dict[str, Any]


def _check_run_id(run_id: str) -> None:
    if not _RUN_ID.match(run_id):
        raise HTTPException(status_code=422, detail="invalid run id")


def create_router(store: RunStore, service: str, version: str) -> APIRouter:
    router = APIRouter(prefix=PREFIX)

    @router.get("/health")
    def health() -> dict[str, Any]:
        return {"runtime": RUNTIME_FORMAT, "service": service, "version": version,
                "models": list(store.models), "illustrative": True}

    @router.get("/models")
    def models() -> dict[str, Any]:
        return {"models": [model.describe() for model in store.models.values()]}

    @router.post("/runs", status_code=202)
    def submit(body: RunRequest) -> dict[str, Any]:
        model = store.models.get(body.model)
        if model is None:
            raise HTTPException(status_code=404, detail=f"unknown model {body.model[:80]!r}")
        try:
            inputs = model.inputs_class.model_validate(body.inputs)
        except ValidationError as error:
            raise HTTPException(status_code=422, detail=error.errors(include_url=False, include_context=False,
                                                                     include_input=False)) from None
        record = store.submit(model, inputs)
        if record is None:
            raise HTTPException(status_code=429, detail=f"more than {store.max_active} runs queued or running")
        return record

    @router.get("/runs")
    def runs() -> dict[str, Any]:
        return {"runs": store.list()}

    @router.get("/runs/{run_id}")
    def run(run_id: str) -> dict[str, Any]:
        _check_run_id(run_id)
        record = store.get(run_id)
        if record is None:
            raise HTTPException(status_code=404, detail="run not found")
        return record

    @router.post("/runs/{run_id}/cancel")
    def cancel(run_id: str) -> dict[str, Any]:
        _check_run_id(run_id)
        record = store.cancel(run_id)
        if record is None:
            raise HTTPException(status_code=404, detail="run not found")
        return record

    @router.get("/runs/{run_id}/artifact")
    def artifact(run_id: str) -> Response:
        _check_run_id(run_id)
        found = store.artifact(run_id)
        if found is None:
            raise HTTPException(status_code=404, detail="run not found")
        status, data = found
        if status != "succeeded" or data is None:
            raise HTTPException(status_code=409, detail=f"run is {status}")
        return Response(content=data, media_type="application/json")

    return router


class RuntimeGuard:
    """Pure ASGI guard for PREFIX: allowed Origin (when present) and a valid X-Datapass-Token."""

    def __init__(self, app: Any, *, token: str, origins: tuple[str, ...]) -> None:
        self.app, self.token, self.origins = app, token.encode("utf-8"), frozenset(origins)

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        path = scope.get("path", "") if scope["type"] == "http" else ""
        if path == PREFIX or path.startswith(PREFIX + "/"):
            headers = dict(scope.get("headers") or [])
            origin = headers.get(b"origin")
            status, detail = None, ""
            if origin is not None and origin.decode("latin-1") not in self.origins:
                status, detail = 403, "origin not allowed"
            elif not hmac.compare_digest(headers.get(b"x-datapass-token", b""), self.token):
                status, detail = 401, f"missing or invalid {TOKEN_HEADER}"
            if status:
                await JSONResponse({"detail": detail}, status_code=status)(scope, receive, send)
                return
        await self.app(scope, receive, send)
