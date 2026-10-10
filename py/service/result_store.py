"""Durable, user-selected result store and the notebook routes of the local service (`/api/notebook/v1`).

OPT-IN: the store exists only when the service starts with `--results-dir DIR`. DIR is chosen by the
user, must be outside any Git work tree and is bounded (`--results-max-bytes`). Layout:

    DIR/manifest.json              the commit point (written last, temp file + os.replace)
    DIR/results/<sha256>.json      immutable cell results, named by the SHA-256 of their bytes
    DIR/notebooks/<sha256>.ipynb   the saved notebook (nbformat), content-addressed too

A save writes new immutable files first and the manifest last, so a failure (quota, disk full, crash)
leaves the previous manifest, and therefore the previous saved state, intact. Results are never
pruned automatically: deletion is an explicit user request. The superseded notebook snapshot is
replaced by a newer explicit save. No token or secret is accepted into any stored file: the service
only stores the notebook, cell sources, outputs, bounded tables and run references it is given, and
refuses payloads that contain its own runtime token.

Re-opening reads the files back and verifies their hashes; nothing is recomputed and no kernel state
(heap, variables) is restored. A run that was still `running` when a previous service process ended
is reported as `unknown`: its outcome was never observed.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import JSONResponse, Response

NOTEBOOK_PREFIX = "/api/notebook/v1"
SERVICE_FORMAT = "datapass.notebook-service/1"
MANIFEST_FORMAT = "datapass.result-store"
RESULT_FORMAT = "datapass.cell-result"
DEFAULT_MAX_BYTES = 256 * 1024 * 1024
MAX_RESULT_BYTES = 8 * 1024 * 1024
MAX_BODY_BYTES = 16 * 1024 * 1024
MAX_ENTRIES = 500
MAX_JOBS = 200
_SHA = re.compile(r"^[0-9a-f]{64}$")
_WB_ID = re.compile(r"^[a-z][a-zA-Z0-9_-]{0,79}$")
_JOB = re.compile(r"^job-[0-9a-f]{16}$")
JOB_FINAL = ("succeeded", "failed", "interrupted", "cancelled", "disconnected", "unknown")
CELL_KINDS = ("sql", "jupyter", "python")


class StoreError(Exception):
    def __init__(self, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.status = status


class StoreFull(StoreError):
    def __init__(self, message: str) -> None:
        super().__init__(message, 507)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def canonical(value: Any) -> bytes:
    """Deterministic ASCII JSON: identical content always hashes identically (and text == bytes)."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def inside_git_worktree(path: Path) -> Path | None:
    for parent in (path, *path.parents):
        if (parent / ".git").exists():
            return parent
    return None


class ResultStore:
    def __init__(self, root: Path | str, max_bytes: int = DEFAULT_MAX_BYTES, *, allow_git: bool = False) -> None:
        root = Path(root).expanduser().resolve()
        if not root.parent.is_dir():
            raise StoreError(f"The parent folder of the result store does not exist: {root.parent}")
        repo = None if allow_git else inside_git_worktree(root)
        if repo is not None:
            raise StoreError(f"The result store must be outside Git; {root} is inside the work tree {repo}.")
        if max_bytes < 1024:
            raise StoreError("--results-max-bytes must be at least 1024")
        root.mkdir(exist_ok=True)
        (root / "results").mkdir(exist_ok=True)
        (root / "notebooks").mkdir(exist_ok=True)
        self.root, self.max_bytes = root, int(max_bytes)
        self.instance = secrets.token_hex(8)
        self.secrets: tuple[bytes, ...] = ()
        self._fail_after_writes: int | None = None  # test hook: simulate a full disk after N file writes

    # --- files -----------------------------------------------------------------------------------------
    def used_bytes(self) -> int:
        total = 0
        for path in (self.root / "manifest.json", *self.root.glob("results/*.json"), *self.root.glob("notebooks/*.ipynb")):
            try:
                total += path.stat().st_size
            except OSError:
                pass
        return total

    def _write_atomic(self, path: Path, data: bytes, created: list[Path]) -> None:
        if self._fail_after_writes is not None:
            if self._fail_after_writes <= 0:
                raise OSError(28, "No space left on device (simulated)")
            self._fail_after_writes -= 1
        fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=path.parent)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            for attempt in range(20):
                try:
                    os.replace(tmp, path)
                    break
                except PermissionError:  # Windows: a scanner/indexer briefly holds the target open
                    if attempt == 19:
                        raise
                    time.sleep(0.05)
            created.append(path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def _check_secrets(self, data: bytes) -> None:
        for secret in self.secrets:
            if secret and secret in data:
                raise StoreError("Refused: the payload contains the service token. Tokens are never stored.", 422)

    # --- manifest --------------------------------------------------------------------------------------
    def manifest(self) -> dict[str, Any]:
        path = self.root / "manifest.json"
        if not path.exists():
            return {"format": MANIFEST_FORMAT, "version": 1, "updatedAt": None, "workspace": None, "entries": [], "jobs": []}
        try:
            doc = json.loads(path.read_text(encoding="ascii"))
        except (OSError, ValueError) as error:
            raise StoreError(f"The store manifest cannot be read ({error}); it was left untouched.", 409) from None
        if not isinstance(doc, dict) or doc.get("format") != MANIFEST_FORMAT or doc.get("version") != 1:
            raise StoreError("The store manifest is not a datapass.result-store v1 document; it was left untouched.", 409)
        return doc

    def view(self) -> dict[str, Any]:
        """The manifest as reported to the browser: jobs left `running` by an earlier process are `unknown`."""
        doc = self.manifest()
        jobs = []
        for job in doc.get("jobs", []):
            job = dict(job)
            if job.get("status") == "running" and job.get("instance") != self.instance:
                job["status"] = "unknown"
                job["detail"] = "The service stopped before this run's outcome was observed."
            jobs.append(job)
        present = {p.stem for p in self.root.glob("results/*.json")}
        entries = [{**e, "present": e.get("resultSha256") in present} for e in doc.get("entries", [])]
        return {**doc, "entries": entries, "jobs": jobs, "store": self.describe()}

    def describe(self) -> dict[str, Any]:
        return {"name": self.root.name, "maxBytes": self.max_bytes, "usedBytes": self.used_bytes()}

    def _commit(self, doc: dict[str, Any], created: list[Path]) -> None:
        doc["updatedAt"] = _now()
        self._write_atomic(self.root / "manifest.json", canonical(doc), created)

    # --- results ---------------------------------------------------------------------------------------
    @staticmethod
    def _validate_result(item: Any) -> tuple[dict[str, Any], bytes, str]:
        if not isinstance(item, dict) or set(item) - {"cellId", "cellKind", "sourceSha256", "result", "run"}:
            raise StoreError("result entry: expected {cellId, cellKind, sourceSha256, result, run}")
        if not isinstance(item.get("cellId"), str) or not _WB_ID.match(item["cellId"]):
            raise StoreError("result entry: invalid cell id")
        if item.get("cellKind") not in CELL_KINDS:
            raise StoreError("result entry: unknown cell kind")
        if not isinstance(item.get("sourceSha256"), str) or not _SHA.match(item["sourceSha256"]):
            raise StoreError("result entry: invalid source hash")
        result = item.get("result")
        if not isinstance(result, dict) or result.get("format") != RESULT_FORMAT or result.get("version") != 1:
            raise StoreError("result entry: the result must be a datapass.cell-result v1 object")
        if result.get("cellId") != item["cellId"] or result.get("sourceSha256") != item["sourceSha256"]:
            raise StoreError("result entry: the result does not belong to this cell source")
        run = item.get("run") or {}
        if not isinstance(run, dict) or len(canonical(run)) > 4096:
            raise StoreError("result entry: run reference above 4 KB")
        try:
            data = canonical(result)
        except ValueError as error:
            raise StoreError(f"result entry: not JSON-serialisable ({error})") from None
        if len(data) > MAX_RESULT_BYTES:
            raise StoreError(f"result for {item['cellId']} is above {MAX_RESULT_BYTES // (1024 * 1024)} MB; aggregate it first")
        return item, data, sha256(data)

    def save(self, payload: Any, export: Any) -> dict[str, Any]:
        """Save results + the notebook. `export(nb_payload) -> str` is notebook_io.export_notebook."""
        if not isinstance(payload, dict) or set(payload) - {"notebook", "results"}:
            raise StoreError("save: expected {notebook, results}")
        items = payload.get("results") or []
        if not isinstance(items, list) or len(items) > 100:
            raise StoreError("save: at most 100 results per save")
        prepared = [self._validate_result(i) for i in items]
        nb_payload = payload.get("notebook")
        if not isinstance(nb_payload, dict):
            raise StoreError("save: notebook payload missing")
        nb_payload = {**nb_payload, "results": {**(nb_payload.get("results") or {}), **{i["cellId"]: sha for i, _, sha in prepared}}}
        notebook_bytes = export(nb_payload).encode("utf-8")
        for _, data, _ in prepared:
            self._check_secrets(data)
        self._check_secrets(notebook_bytes)
        notebook_sha = sha256(notebook_bytes)
        old = self.manifest()
        old_nb = (old.get("workspace") or {}).get("notebookSha256")
        entries = list(old.get("entries", []))
        known = {(e.get("cellId"), e.get("resultSha256")) for e in entries}
        now = _now()
        new_files: list[tuple[Path, bytes]] = []
        for item, data, sha in prepared:
            path = self.root / "results" / f"{sha}.json"
            if path.exists():
                if sha256(path.read_bytes()) != sha:
                    raise StoreError(f"Stored result {sha[:12]} is corrupt on disk; it was not overwritten. Delete it explicitly.", 409)
            elif all(p != path for p, _ in new_files):
                new_files.append((path, data))
            if (item["cellId"], sha) not in known:
                entries.append({"cellId": item["cellId"], "cellKind": item["cellKind"], "sourceSha256": item["sourceSha256"],
                                "resultSha256": sha, "bytes": len(data), "run": item.get("run") or {}, "savedAt": now})
                known.add((item["cellId"], sha))
        if len(entries) > MAX_ENTRIES:
            raise StoreFull(f"The store holds {MAX_ENTRIES} results; delete some explicitly before saving more. Nothing was changed.")
        nb_path = self.root / "notebooks" / f"{notebook_sha}.ipynb"
        if not nb_path.exists():
            new_files.append((nb_path, notebook_bytes))
        cells = nb_payload.get("cells") or []
        doc = {**old, "workspace": {"notebookSha256": notebook_sha, "savedAt": now,
                                    "cells": [{"cellId": c.get("id"), "kind": c.get("kind")} for c in cells if isinstance(c, dict)]},
               "entries": entries}
        manifest_bytes = len(canonical({**doc, "updatedAt": now}))
        old_nb_bytes = 0
        if old_nb and old_nb != notebook_sha:
            try:
                old_nb_bytes = (self.root / "notebooks" / f"{old_nb}.ipynb").stat().st_size
            except OSError:
                old_nb_bytes = 0
        try:
            current_manifest = (self.root / "manifest.json").stat().st_size
        except OSError:
            current_manifest = 0
        needed = self.used_bytes() - current_manifest + manifest_bytes + sum(len(d) for _, d in new_files)
        if needed > self.max_bytes:
            raise StoreFull(f"The result store is full: this save needs {needed:,} bytes and the limit is {self.max_bytes:,}. "
                            "Nothing was changed; delete saved results explicitly or raise --results-max-bytes.")
        created: list[Path] = []
        try:
            for path, data in new_files:
                self._write_atomic(path, data, created)
            self._commit(doc, created)
        except OSError as error:
            for path in created:
                if path.name != "manifest.json":
                    try:
                        path.unlink()
                    except OSError:
                        pass
            raise StoreFull(f"Writing to the result store failed ({error.strerror or error}). The previous saved state is unchanged.") from None
        if old_nb and old_nb != notebook_sha and old_nb_bytes:
            try:
                (self.root / "notebooks" / f"{old_nb}.ipynb").unlink()
            except OSError:
                pass
        return {"notebookSha256": notebook_sha, "results": [{"cellId": i["cellId"], "resultSha256": sha} for i, _, sha in prepared],
                "store": self.describe()}

    def result_bytes(self, sha: str) -> bytes:
        if not _SHA.match(sha):
            raise StoreError("invalid result hash")
        path = self.root / "results" / f"{sha}.json"
        if not path.is_file():
            raise StoreError(f"Result {sha[:12]} is not in the store.", 404)
        data = path.read_bytes()
        if sha256(data) != sha:
            raise StoreError(f"Result {sha[:12]} is corrupt on disk (hash mismatch); it is not shown.", 409)
        return data

    def notebook_text(self) -> tuple[str, str]:
        nb_sha = (self.manifest().get("workspace") or {}).get("notebookSha256")
        if not nb_sha:
            raise StoreError("Nothing has been saved in this store yet.", 404)
        path = self.root / "notebooks" / f"{nb_sha}.ipynb"
        if not path.is_file():
            raise StoreError("The saved notebook file is missing from the store.", 404)
        data = path.read_bytes()
        if sha256(data) != nb_sha:
            raise StoreError("The saved notebook is corrupt on disk (hash mismatch).", 409)
        return data.decode("utf-8"), nb_sha

    def delete_result(self, sha: str) -> dict[str, Any]:
        """Explicit user retention: drop every manifest entry for this result, then its file."""
        if not _SHA.match(sha):
            raise StoreError("invalid result hash")
        doc = self.manifest()
        entries = [e for e in doc.get("entries", []) if e.get("resultSha256") != sha]
        path = self.root / "results" / f"{sha}.json"
        if len(entries) == len(doc.get("entries", [])) and not path.exists():
            raise StoreError(f"Result {sha[:12]} is not in the store.", 404)
        created: list[Path] = []
        try:
            self._commit({**doc, "entries": entries}, created)
        except OSError as error:
            raise StoreFull(f"Deleting failed ({error.strerror or error}); nothing was changed.") from None
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        return self.view()

    # --- jobs ------------------------------------------------------------------------------------------
    def start_job(self, payload: Any) -> dict[str, Any]:
        if not isinstance(payload, dict) or set(payload) - {"cellId", "sourceSha256", "runtime"}:
            raise StoreError("job: expected {cellId, sourceSha256, runtime}")
        if not isinstance(payload.get("cellId"), str) or not _WB_ID.match(payload["cellId"]):
            raise StoreError("job: invalid cell id")
        if not isinstance(payload.get("sourceSha256"), str) or not _SHA.match(payload["sourceSha256"]):
            raise StoreError("job: invalid source hash")
        if payload.get("runtime") not in ("jupyter", "duckdb", "datapass.runtime/1"):
            raise StoreError("job: unknown runtime")
        doc = self.manifest()
        job = {"jobId": "job-" + secrets.token_hex(8), "cellId": payload["cellId"], "sourceSha256": payload["sourceSha256"],
               "runtime": payload["runtime"], "status": "running", "startedAt": _now(), "finishedAt": None, "instance": self.instance}
        jobs = [*doc.get("jobs", []), job]
        if len(jobs) > MAX_JOBS:  # oldest FINISHED run records beyond the bound are dropped; results never are
            finished = [j for j in jobs if j.get("status") != "running"]
            drop = {id(j) for j in finished[: len(jobs) - MAX_JOBS]}
            jobs = [j for j in jobs if id(j) not in drop]
        created: list[Path] = []
        try:
            self._commit({**doc, "jobs": jobs}, created)
        except OSError as error:
            raise StoreFull(f"Recording the run failed ({error.strerror or error}).") from None
        return job

    def finish_job(self, job_id: str, payload: Any) -> dict[str, Any]:
        if not _JOB.match(job_id):
            raise StoreError("invalid job id")
        if not isinstance(payload, dict) or payload.get("status") not in JOB_FINAL or set(payload) - {"status"}:
            raise StoreError("job: status must be one of " + ", ".join(JOB_FINAL))
        doc = self.manifest()
        jobs = [dict(j) for j in doc.get("jobs", [])]
        for job in jobs:
            if job.get("jobId") == job_id:
                job["status"], job["finishedAt"] = payload["status"], _now()
                created: list[Path] = []
                try:
                    self._commit({**doc, "jobs": jobs}, created)
                except OSError as error:
                    raise StoreFull(f"Recording the run outcome failed ({error.strerror or error}).") from None
                return job
        raise StoreError("unknown job", 404)


class NotebookGuard:
    """Pure ASGI guard for NOTEBOOK_PREFIX: allowed Origin (when present) and a valid X-Datapass-Token."""

    def __init__(self, app: Any, *, token: str, origins: tuple[str, ...]) -> None:
        self.app, self.token, self.origins = app, token.encode("utf-8"), frozenset(origins)

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        path = scope.get("path", "") if scope["type"] == "http" else ""
        if path == NOTEBOOK_PREFIX or path.startswith(NOTEBOOK_PREFIX + "/"):
            headers = dict(scope.get("headers") or [])
            origin = headers.get(b"origin")
            status, detail = None, ""
            if origin is not None and origin.decode("latin-1") not in self.origins:
                status, detail = 403, "origin not allowed"
            elif not hmac.compare_digest(headers.get(b"x-datapass-token", b""), self.token):
                status, detail = 401, "missing or invalid X-Datapass-Token"
            if status:
                await JSONResponse({"detail": detail}, status_code=status)(scope, receive, send)
                return
        await self.app(scope, receive, send)


def create_notebook_router(store: ResultStore | None) -> APIRouter:
    import nbformat

    from notebook_io import NotebookError, export_notebook, import_notebook

    router = APIRouter(prefix=NOTEBOOK_PREFIX)

    def fail(error: Exception) -> HTTPException:
        status = error.status if isinstance(error, StoreError) else 422
        return HTTPException(status_code=status, detail=str(error)[:600])

    def need_store() -> ResultStore:
        if store is None:
            raise HTTPException(status_code=404, detail="No result store: start the service with --results-dir <folder outside Git>.")
        return store

    @router.get("/status")
    def status() -> dict[str, Any]:
        return {"service": SERVICE_FORMAT, "nbformat": nbformat.__version__, "store": store.describe() if store else None}

    @router.post("/ipynb/import")
    def ipynb_import(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
        if set(body) - {"name", "text"} or not isinstance(body.get("text"), str):
            raise HTTPException(status_code=422, detail="expected {name, text}")
        try:
            return import_notebook(body["text"])
        except NotebookError as error:
            raise fail(error) from None

    @router.post("/ipynb/export")
    def ipynb_export(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
        try:
            text = export_notebook(body)
        except NotebookError as error:
            raise fail(error) from None
        return {"text": text, "sha256": sha256(text.encode("utf-8"))}

    @router.get("/store/manifest")
    def manifest() -> dict[str, Any]:
        try:
            return need_store().view()
        except StoreError as error:
            raise fail(error) from None

    @router.post("/store/save")
    def save(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
        try:
            return need_store().save(body, export_notebook)
        except (StoreError, NotebookError) as error:
            raise fail(error) from None

    @router.get("/store/results/{sha}")
    def result(sha: str) -> Response:
        try:
            return Response(need_store().result_bytes(sha), media_type="application/json")
        except StoreError as error:
            raise fail(error) from None

    @router.post("/store/results/{sha}/delete")
    def delete(sha: str) -> dict[str, Any]:
        try:
            return need_store().delete_result(sha)
        except StoreError as error:
            raise fail(error) from None

    @router.get("/store/notebook")
    def notebook() -> dict[str, Any]:
        s = need_store()
        try:
            text, nb_sha = s.notebook_text()
            return {"sha256": nb_sha, "import": import_notebook(text), "manifest": s.view()}
        except (StoreError, NotebookError) as error:
            raise fail(error) from None

    @router.post("/store/jobs")
    def start_job(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
        try:
            return need_store().start_job(body)
        except StoreError as error:
            raise fail(error) from None

    @router.post("/store/jobs/{job_id}/finish")
    def finish_job(job_id: str, body: dict[str, Any] = Body(...)) -> dict[str, Any]:
        try:
            return need_store().finish_job(job_id, body)
        except StoreError as error:
            raise fail(error) from None

    return router
