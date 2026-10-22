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

Additive `datapass.runtime/1` wire (frozen in spec/engineering/v1/README.md):
- `Idempotency-Key` header on POST /runs: same key + same payload (datapass-c14n/1 digest) returns the first
  record (200, no new run); same key + another payload answers 409 `DP-RT-IDEMPOTENCY-CONFLICT`. The window is a
  bounded LRU of IDEMPOTENCY_WINDOW keys, in memory.
- `cancelRequested` on every record: cancelling a running run sets it while `status` stays `running` until the
  model observes the cancel; `cancelled` is only reported once the worker confirmed it.
- GET /ready: `{live, ready, checks: [{id, ok, detail}]}`; no secrets, no paths.
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

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from datapass_artifact import encode, to_artifact, validate
from datapass_engineering import EngineeringError, canonical_bytes

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
IDEMPOTENCY_HEADER = "Idempotency-Key"
IDEMPOTENCY_WINDOW = 256
_IDEMPOTENCY_KEY = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")
CODE_IDEMPOTENCY_CONFLICT = "DP-RT-IDEMPOTENCY-CONFLICT"
CODE_IDEMPOTENCY_KEY = "DP-RT-IDEMPOTENCY-KEY"
CODE_PATH = "DP-RT-PATH"
# Literal or encoded dot segments, encoded slashes/backslashes: never a valid runtime path (traversal attempts).
_TRAVERSAL = re.compile(rb"(^|/)\.\.?(/|$)|%2e|%2f|%5c|\\", re.IGNORECASE)

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


_TOKEN = re.compile(r"^[A-Za-z0-9_-]{16,128}$")


def resolve_token(token: str | None = None) -> str:
    """An explicit or env token must be 16-128 URL-safe characters (what the browser accepts); else a random one."""
    chosen = token or os.environ.get(TOKEN_ENV)
    if chosen is None:
        return secrets.token_urlsafe(32)
    if not _TOKEN.match(chosen):
        raise ValueError(f"{TOKEN_ENV} must be 16-128 characters of A-Z, a-z, 0-9, '_' or '-'")
    return chosen


class SafeJSONResponse(JSONResponse):
    """JSON with `<`, `>` and `&` written as \\u escapes: echoed text can never form markup, even if sniffed."""

    def render(self, content: Any) -> bytes:
        text = json.dumps(content, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        return text.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026").encode("utf-8")


def error_response(status: int, detail: Any, code: str | None = None) -> SafeJSONResponse:
    return SafeJSONResponse({"detail": detail, **({"code": code} if code else {})}, status_code=status)


class IdempotencyConflict(Exception):
    """Same Idempotency-Key, different payload."""


def payload_digest(payload: Any) -> str:
    """sha256 of the datapass-c14n/1 bytes of the submitted {model, inputs}."""
    return hashlib.sha256(canonical_bytes(payload)).hexdigest()


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
                 max_active: int = MAX_ACTIVE_RUNS, retained: int = RETAINED_RUNS,
                 idempotency_window: int = IDEMPOTENCY_WINDOW) -> None:
        self.models = dict(models)
        self.max_active, self.retained, self.max_workers = max_active, retained, max_workers
        self.idempotency_window = idempotency_window
        self._runs: OrderedDict[str, _Run] = OrderedDict()
        self._keys: OrderedDict[str, tuple[str, str]] = OrderedDict()  # key -> (payload digest, runId), LRU
        self._lock = threading.Lock()
        self._closed = False
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

    def capacity(self) -> dict[str, Any]:
        with self._lock:
            active = sum(1 for run in self._runs.values() if run.record["status"] not in TERMINAL)
            return {"active": active, "maxActive": self.max_active, "workers": self.max_workers, "closed": self._closed}

    def replay(self, key: str, digest: str) -> dict[str, Any] | None:
        """The record first submitted under `key` with the same payload digest; None when the key is unknown or its
        run was evicted. Raises IdempotencyConflict when the key was used with another payload."""
        with self._lock:
            return self._replay_locked(key, digest)

    def _replay_locked(self, key: str, digest: str) -> dict[str, Any] | None:
        known = self._keys.get(key)
        if known is None:
            return None
        if known[0] != digest:
            raise IdempotencyConflict()
        run = self._runs.get(known[1])
        if run is None:  # evicted: the key no longer names a record
            del self._keys[key]
            return None
        self._keys.move_to_end(key)
        return dict(run.record)

    # -- commands ------------------------------------------------------------------------------
    def submit(self, model: RuntimeModel, inputs: BaseModel, *, idempotency: tuple[str, str] | None = None
               ) -> dict[str, Any] | None:
        """A new queued run, or None when max_active runs are queued or running.

        With `idempotency=(key, digest)`, an earlier run under the same key and digest is returned instead, marked
        with a private `_replayed` key the caller removes; IdempotencyConflict when the digest differs."""
        normalized = inputs.model_dump()
        with self._lock:
            if idempotency is not None:
                earlier = self._replay_locked(*idempotency)
                if earlier is not None:
                    return {**earlier, "_replayed": True}
            active = sum(1 for run in self._runs.values() if run.record["status"] not in TERMINAL)
            if active >= self.max_active:
                return None
            run_id = "run-" + secrets.token_hex(8)
            while run_id in self._runs:
                run_id = "run-" + secrets.token_hex(8)
            record = {"runId": run_id, "model": model.id, "modelVersion": model.version, "status": "queued",
                      "inputs": normalized, "inputHash": input_hash(model, normalized), "submittedAt": _now(),
                      "startedAt": None, "finishedAt": None, "error": None, "artifactId": None, "artifactSha256": None,
                      "cancelRequested": False}
            self._runs[run_id] = _Run(record=record, model=model, inputs=inputs)
            self._evict()
            if idempotency is not None:
                self._keys[idempotency[0]] = (idempotency[1], run_id)
                while len(self._keys) > self.idempotency_window:
                    self._keys.popitem(last=False)
            snapshot = dict(record)
        self._executor.submit(self._execute, run_id)
        return snapshot

    def cancel(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                return None
            status = run.record["status"]
            if status == "queued":  # never started: the cancel is confirmed at once
                run.cancel.set()
                run.record.update(status="cancelled", cancelRequested=True, finishedAt=_now())
            elif status == "running":
                run.cancel.set()  # cooperative: the model sees it at its next should_cancel() check
                run.record["cancelRequested"] = True  # status stays running until the worker confirms
            return dict(run.record)

    def shutdown(self) -> None:
        with self._lock:
            self._closed = True
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


ReadyCheck = dict[str, Any]


def ready_check(check_id: str, ok: bool, detail: str) -> ReadyCheck:
    return {"id": check_id, "ok": bool(ok), "detail": detail[:200]}


def runtime_checks(store: RunStore) -> list[ReadyCheck]:
    cap = store.capacity()
    return [
        ready_check("workers", not cap["closed"], f"{cap['workers']} worker threads" + (" (shut down)" if cap["closed"] else "")),
        ready_check("run-capacity", cap["active"] < cap["maxActive"], f"{cap['active']} of {cap['maxActive']} runs queued or running"),
        ready_check("models", bool(store.models), f"{len(store.models)} allowlisted models"),
    ]


def create_router(store: RunStore, service: str, version: str, *,
                  extra_checks: Callable[[], list[ReadyCheck]] | None = None,
                  optional_checks: frozenset[str] = frozenset()) -> APIRouter:
    """`extra_checks` adds readiness checks (no secrets, no paths); ids in `optional_checks` never make ready false."""
    router = APIRouter(prefix=PREFIX, default_response_class=SafeJSONResponse)

    @router.get("/health")
    def health() -> dict[str, Any]:
        return {"runtime": RUNTIME_FORMAT, "service": service, "version": version,
                "models": list(store.models), "illustrative": True}

    @router.get("/ready")
    def ready() -> dict[str, Any]:
        checks = runtime_checks(store) + (extra_checks() if extra_checks else [])
        return {"live": True, "ready": all(c["ok"] for c in checks if c["id"] not in optional_checks), "checks": checks}

    @router.get("/models")
    def models() -> dict[str, Any]:
        return {"models": [model.describe() for model in store.models.values()]}

    def conflict() -> SafeJSONResponse:
        return error_response(409, f"{IDEMPOTENCY_HEADER} already used with another payload; use a new key for a new run",
                              CODE_IDEMPOTENCY_CONFLICT)

    @router.post("/runs", status_code=202)
    def submit(body: RunRequest, idempotency_key: str | None = Header(None, alias=IDEMPOTENCY_HEADER)) -> Any:
        idempotency = None
        if idempotency_key is not None:
            if not _IDEMPOTENCY_KEY.match(idempotency_key):
                return error_response(422, f"{IDEMPOTENCY_HEADER} must be 8-128 characters of A-Z, a-z, 0-9, '.', '_', ':' or '-'",
                                      CODE_IDEMPOTENCY_KEY)
            try:
                digest = payload_digest({"model": body.model, "inputs": body.inputs})
            except EngineeringError:
                return error_response(422, "inputs are not canonical JSON (datapass-c14n/1)", CODE_IDEMPOTENCY_KEY)
            idempotency = (idempotency_key, digest)
            try:
                earlier = store.replay(*idempotency)
            except IdempotencyConflict:
                return conflict()
            if earlier is not None:
                return SafeJSONResponse(earlier, status_code=200)
        model = store.models.get(body.model)
        if model is None:
            raise HTTPException(status_code=404, detail=f"unknown model {body.model[:80]!r}")
        try:
            inputs = model.inputs_class.model_validate(body.inputs)
        except ValidationError as error:
            raise HTTPException(status_code=422, detail=error.errors(include_url=False, include_context=False,
                                                                     include_input=False)) from None
        try:
            record = store.submit(model, inputs, idempotency=idempotency)
        except IdempotencyConflict:
            return conflict()
        if record is None:
            raise HTTPException(status_code=429, detail=f"more than {store.max_active} runs queued or running")
        if record.pop("_replayed", False):  # a concurrent request with the same key was first
            return SafeJSONResponse(record, status_code=200)
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
    """Pure ASGI guard for PREFIX: allowed Origin (when present), a valid X-Datapass-Token, then no traversal path.

    The token is read from the header only: a token in the query string is ignored (401)."""

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
            elif _TRAVERSAL.search(scope.get("raw_path") or b"") or _TRAVERSAL.search(path.encode("utf-8")):
                await error_response(422, "invalid run id or path", CODE_PATH)(scope, receive, send)
                return
            if status:
                await SafeJSONResponse({"detail": detail}, status_code=status)(scope, receive, send)
                return
        await self.app(scope, receive, send)
