"""nbformat exchange and the durable result store (FR-02/FR-03). Synthetic fixtures only.

Needs py/service/requirements.txt and requirements-jupyter.txt (nbformat). Locally the tests skip when
nbformat is missing; CI sets DATAPASS_REQUIRE_JUPYTER=1 so a missing dependency fails instead.

    python -m unittest discover -s py/service -p "test_notebook.py"
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

try:
    import nbformat  # noqa: F401
    from fastapi.testclient import TestClient
    HAVE = True
except ImportError:  # pragma: no cover
    HAVE = False
    if os.environ.get("DATAPASS_REQUIRE_JUPYTER") == "1":
        raise

if HAVE:
    import app as service
    from notebook_io import NotebookError, export_notebook, import_notebook
    from result_store import ResultStore, StoreError, StoreFull, canonical, sha256

ORIGIN = "http://127.0.0.1:5173"
TOKEN = "notebook-test-token-0123456789"
API = "/api/notebook/v1"
H = {"X-Datapass-Token": TOKEN, "Origin": ORIGIN}


def synthetic_notebook() -> dict:
    """A small SYNTHETIC notebook: markdown, python with outputs, sql magic, raw, metadata."""
    return {
        "nbformat": 4, "nbformat_minor": 5,
        "metadata": {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
                     "language_info": {"name": "python"}, "custom_tool": {"x": 1}},
        "cells": [
            {"cell_type": "markdown", "id": "intro", "metadata": {}, "source": "# Synthetic demo\nNot real data."},
            {"cell_type": "code", "id": "make-rows", "metadata": {"tags": ["x"], "datapass": {"outputTable": "synthetic"}},
             "execution_count": 3, "source": ["rows = [{'k': 1}]\n", "print(len(rows))"],
             "outputs": [{"output_type": "stream", "name": "stdout", "text": "1\n"},
                         {"output_type": "display_data", "metadata": {}, "data": {"text/html": "<b>x</b><script>alert(1)</script>", "application/javascript": "alert(2)", "text/plain": "x"}}]},
            {"cell_type": "code", "id": "q", "metadata": {"datapass": {"dependsOn": ["make-rows", "nope"]}}, "execution_count": None,
             "source": "%%sql\nSELECT count(*) FROM synthetic", "outputs": []},
            {"cell_type": "raw", "id": "raw1", "metadata": {}, "source": "raw text kept"},
        ],
    }


@unittest.skipUnless(HAVE, "nbformat / fastapi not installed")
class NotebookIoTests(unittest.TestCase):
    def test_import_mapping_and_loss_report(self) -> None:
        out = import_notebook(json.dumps(synthetic_notebook()))
        kinds = [(c["id"], c["kind"]) for c in out["cells"]]
        self.assertEqual(kinds, [("intro", "note"), ("make-rows", "jupyter"), ("q", "sql"), ("raw1", "inert")])
        py, sql, raw = out["cells"][1], out["cells"][2], out["cells"][3]
        self.assertEqual(py["code"], "rows = [{'k': 1}]\nprint(len(rows))")
        self.assertEqual(py["outputTable"], "synthetic")
        self.assertEqual(sql["sql"], "SELECT count(*) FROM synthetic")
        self.assertEqual(sql["dependsOn"], ["make-rows"])
        self.assertEqual(json.loads(raw["original"])["source"], "raw text kept")
        self.assertEqual(len(out["outputs"]["make-rows"]), 2)  # untrusted, returned as data only
        details = " | ".join(f"{x['item']}: {x['detail']}" for x in out["loss"])
        for expected in ("custom_tool", "tags", "'nope'", "raw cell"):
            self.assertIn(expected, details)

    def test_corrupt_and_invalid_notebooks_are_rejected(self) -> None:
        with self.assertRaisesRegex(NotebookError, "not valid JSON"):
            import_notebook('{"cells": [')
        bad = synthetic_notebook()
        del bad["cells"][1]["source"]
        with self.assertRaisesRegex(NotebookError, "not validate"):
            import_notebook(json.dumps(bad))
        with self.assertRaises(NotebookError):
            import_notebook(json.dumps({"hello": "world"}))
        too_many = synthetic_notebook()
        too_many["cells"] = [{"cell_type": "markdown", "metadata": {}, "source": "x", "id": f"m{i}"} for i in range(51)]
        with self.assertRaisesRegex(NotebookError, "at most 50"):
            import_notebook(json.dumps(too_many))

    def test_round_trip_through_export(self) -> None:
        first = import_notebook(json.dumps(synthetic_notebook()))
        text = export_notebook({"cells": first["cells"], "outputs": first["outputs"], "executionCounts": first["executionCounts"], "results": {}})
        nb = json.loads(text)
        self.assertEqual(nb["nbformat"], 4)
        nbformat.validate(nbformat.reads(text, as_version=4))
        self.assertEqual([c["cell_type"] for c in nb["cells"]], ["markdown", "code", "code", "raw"])
        self.assertTrue("".join(nb["cells"][2]["source"]).startswith("%%sql\n"))
        self.assertEqual(nb["cells"][2]["metadata"]["datapass"]["kind"], "sql")
        self.assertEqual("".join(nb["cells"][3]["source"]), "raw text kept")  # inert cell exported verbatim
        again = import_notebook(text)
        self.assertEqual([(c["id"], c["kind"]) for c in again["cells"]], [(c["id"], c["kind"]) for c in first["cells"]])
        self.assertEqual(again["cells"][1]["code"], first["cells"][1]["code"])
        self.assertEqual(again["outputs"]["make-rows"], first["outputs"]["make-rows"])

    def test_nbformat_4_4_without_cell_ids_round_trips(self) -> None:
        old = {"nbformat": 4, "nbformat_minor": 4, "metadata": {}, "cells": [
            {"cell_type": "raw", "metadata": {}, "source": "legacy raw"},
            {"cell_type": "code", "metadata": {}, "execution_count": None, "source": "x = 1", "outputs": []}]}
        first = import_notebook(json.dumps(old))
        self.assertEqual([c["kind"] for c in first["cells"]], ["inert", "jupyter"])
        text = export_notebook({"cells": first["cells"], "outputs": {}, "executionCounts": {}, "results": {}})
        nbformat.validate(nbformat.reads(text, as_version=4))
        self.assertEqual("".join(json.loads(text)["cells"][0]["source"]), "legacy raw")

    def test_export_rejects_invalid_outputs(self) -> None:
        cell = {"id": "py-1", "kind": "jupyter", "title": "t", "code": "1", "dependsOn": []}
        with self.assertRaisesRegex(NotebookError, "not validate"):
            export_notebook({"cells": [cell], "outputs": {"py-1": [{"output_type": "nonsense"}]}, "executionCounts": {}, "results": {}})


def result_item(cell_id: str, rows: int, marker: str = "") -> dict:
    src = sha256(f"source-{cell_id}{marker}".encode())
    return {"cellId": cell_id, "cellKind": "jupyter", "sourceSha256": src, "run": {"executionCount": 1, "status": "succeeded"},
            "result": {"format": "datapass.cell-result", "version": 1, "cellId": cell_id, "sourceSha256": src,
                       "outputs": [{"output_type": "stream", "name": "stdout", "text": "SYNTHETIC\n"}],
                       "table": {"columns": [{"name": "step", "type": "number"}], "rows": [[i] for i in range(rows)]}}}


def nb_payload(cell_id: str) -> dict:
    return {"cells": [{"id": cell_id, "kind": "jupyter", "title": "synthetic", "code": "x = 1", "dependsOn": []}], "outputs": {}, "executionCounts": {}, "results": {}}


@unittest.skipUnless(HAVE, "nbformat / fastapi not installed")
class ResultStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = Path(tempfile.mkdtemp(prefix="datapass-store-test-"))

    def tearDown(self) -> None:
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_save_reopen_immutable_hashes(self) -> None:
        store = ResultStore(self.dir / "store")
        saved = store.save({"notebook": nb_payload("py-1"), "results": [result_item("py-1", 5)]}, export_notebook)
        sha = saved["results"][0]["resultSha256"]
        data = (self.dir / "store" / "results" / f"{sha}.json").read_bytes()
        self.assertEqual(sha256(data), sha)
        self.assertEqual(data, canonical(result_item("py-1", 5)["result"]))
        # A fresh store object (service restart) reads the same bytes back without recomputation.
        again = ResultStore(self.dir / "store")
        self.assertEqual(again.result_bytes(sha), data)
        text, nb_sha = again.notebook_text()
        self.assertEqual(json.loads(text)["cells"][0]["metadata"]["datapass"]["resultSha256"], sha)
        self.assertEqual(again.view()["workspace"]["notebookSha256"], nb_sha)

    def test_refuses_git_worktree_and_tiny_quota(self) -> None:
        (self.dir / "repo" / ".git").mkdir(parents=True)
        with self.assertRaisesRegex(StoreError, "outside Git"):
            ResultStore(self.dir / "repo" / "results")
        with self.assertRaises(StoreError):
            ResultStore(self.dir / "s", max_bytes=10)

    def test_storage_full_leaves_previous_state(self) -> None:
        store = ResultStore(self.dir / "store", max_bytes=200_000)
        store.save({"notebook": nb_payload("py-1"), "results": [result_item("py-1", 3)]}, export_notebook)
        before = (self.dir / "store" / "manifest.json").read_bytes()
        files_before = sorted(p.name for p in (self.dir / "store").rglob("*"))
        with self.assertRaises(StoreFull):
            store.save({"notebook": nb_payload("py-1"), "results": [result_item("py-1", 40000, "big")]}, export_notebook)
        self.assertEqual((self.dir / "store" / "manifest.json").read_bytes(), before)
        self.assertEqual(sorted(p.name for p in (self.dir / "store").rglob("*")), files_before)
        # Simulated disk full in the middle of the writes: temp files and new files are removed, manifest unchanged.
        store._fail_after_writes = 1
        with self.assertRaises(StoreFull):
            store.save({"notebook": nb_payload("py-2"), "results": [result_item("py-1", 4, "other")]}, export_notebook)
        self.assertEqual((self.dir / "store" / "manifest.json").read_bytes(), before)
        self.assertEqual(sorted(p.name for p in (self.dir / "store").rglob("*")), files_before)

    def test_user_driven_delete_and_missing(self) -> None:
        store = ResultStore(self.dir / "store")
        a = store.save({"notebook": nb_payload("py-1"), "results": [result_item("py-1", 2)]}, export_notebook)["results"][0]["resultSha256"]
        b = store.save({"notebook": nb_payload("py-1"), "results": [result_item("py-1", 3, "v2")]}, export_notebook)["results"][0]["resultSha256"]
        self.assertEqual(len(store.view()["entries"]), 2)  # never pruned automatically
        view = store.delete_result(a)
        self.assertEqual([e["resultSha256"] for e in view["entries"]], [b])
        with self.assertRaises(StoreError) as ctx:
            store.result_bytes(a)
        self.assertEqual(ctx.exception.status, 404)
        (self.dir / "store" / "results" / f"{b}.json").write_bytes(b"tampered")
        with self.assertRaises(StoreError) as ctx:
            store.result_bytes(b)
        self.assertEqual(ctx.exception.status, 409)

    def test_running_job_from_previous_process_is_unknown(self) -> None:
        store = ResultStore(self.dir / "store")
        job = store.start_job({"cellId": "py-1", "sourceSha256": "a" * 64, "runtime": "jupyter"})
        self.assertEqual(store.view()["jobs"][0]["status"], "running")
        done = store.start_job({"cellId": "py-2", "sourceSha256": "b" * 64, "runtime": "jupyter"})
        store.finish_job(done["jobId"], {"status": "interrupted"})
        restarted = ResultStore(self.dir / "store")
        jobs = {j["jobId"]: j for j in restarted.view()["jobs"]}
        self.assertEqual(jobs[job["jobId"]]["status"], "unknown")
        self.assertEqual(jobs[done["jobId"]]["status"], "interrupted")

    def test_token_never_stored(self) -> None:
        store = ResultStore(self.dir / "store")
        store.secrets = (TOKEN.encode(),)
        item = result_item("py-1", 1)
        item["result"]["outputs"][0]["text"] = "leak " + TOKEN
        with self.assertRaisesRegex(StoreError, "token"):
            store.save({"notebook": nb_payload("py-1"), "results": [item]}, export_notebook)
        self.assertFalse((self.dir / "store" / "manifest.json").exists())


@unittest.skipUnless(HAVE, "nbformat / fastapi not installed")
class NotebookRoutesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dir = Path(tempfile.mkdtemp(prefix="datapass-routes-test-"))
        self.app = service.create_app(origins=(ORIGIN,), token=TOKEN, results_dir=self.dir / "store", results_max_bytes=1_000_000)
        self.client = TestClient(self.app, base_url="http://127.0.0.1:8765")

    def tearDown(self) -> None:
        self.app.state.runs.shutdown()
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_guard_token_origin_host(self) -> None:
        self.assertEqual(self.client.get(API + "/status").status_code, 401)
        self.assertEqual(self.client.get(API + "/status", headers={"X-Datapass-Token": "wrong-token-0123456789"}).status_code, 401)
        self.assertEqual(self.client.get(API + "/status", headers={**H, "Origin": "http://evil.example"}).status_code, 403)
        self.assertEqual(self.client.get(API + "/status", headers={**H, "Host": "evil.example"}).status_code, 400)
        ok = self.client.get(API + "/status", headers=H).json()
        self.assertEqual(ok["service"], "datapass.notebook-service/1")
        self.assertEqual(ok["store"]["name"], "store")

    def test_routes_import_save_reopen_and_body_limits(self) -> None:
        imported = self.client.post(API + "/ipynb/import", headers=H, json={"name": "s.ipynb", "text": json.dumps(synthetic_notebook())})
        self.assertEqual(imported.status_code, 200, imported.text)
        bad = self.client.post(API + "/ipynb/import", headers=H, json={"name": "bad.ipynb", "text": "{"})
        self.assertEqual(bad.status_code, 422)
        saved = self.client.post(API + "/store/save", headers=H, json={"notebook": nb_payload("py-1"), "results": [result_item("py-1", 3)]})
        self.assertEqual(saved.status_code, 200, saved.text)
        sha = saved.json()["results"][0]["resultSha256"]
        got = self.client.get(f"{API}/store/results/{sha}", headers=H)
        self.assertEqual(sha256(got.content), sha)
        reopened = self.client.get(API + "/store/notebook", headers=H).json()
        self.assertEqual(reopened["import"]["results"], {"py-1": sha})
        full = self.client.post(API + "/store/save", headers=H, json={"notebook": nb_payload("py-1"), "results": [result_item("py-1", 200000, "huge")]})
        self.assertEqual(full.status_code, 507)
        for path in (self.dir / "store").rglob("*"):
            if path.is_file():
                self.assertNotIn(TOKEN.encode(), path.read_bytes())
        # The existing 2 KB body limit of the runtime routes is unchanged.
        big = self.client.post("/api/runtime/v1/runs", headers={"X-Datapass-Token": TOKEN, "Content-Type": "application/json"}, content=b"{" + b" " * 3000 + b"}")
        self.assertEqual(big.status_code, 413)

    def test_without_results_dir_store_routes_are_absent(self) -> None:
        plain = service.create_app(origins=(ORIGIN,), token=TOKEN)
        try:
            client = TestClient(plain, base_url="http://127.0.0.1:8765")
            self.assertIsNone(client.get(API + "/status", headers=H).json()["store"])
            self.assertEqual(client.get(API + "/store/manifest", headers=H).status_code, 404)
        finally:
            plain.state.runs.shutdown()


if __name__ == "__main__":
    unittest.main()
