"""F212: the two client producers are the existing runtime plus one allowlisted model each (SYNTHETIC data).

Runs both models through the real runtime routes (FastAPI TestClient), checks the artifacts, the lineage
reference to the base bytes, the refusal of bad inputs, and that a saved site run survives a service restart
with the same hash (the result store is a temporary folder outside Git).
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "py" / "service"))
sys.path.insert(0, str(REPO / "py"))

from fastapi.testclient import TestClient  # noqa: E402

from datapass_artifact import validate  # noqa: E402

TOKEN = "producer-test-token-0123456789"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTOSO = _load("contoso_shape_serve", REPO / "clients" / "contoso-shape-analytics" / "py" / "serve.py")
FOIL = _load("foil_wind_serve", REPO / "clients" / "foil-wind" / "py" / "serve.py")


def _run(client: TestClient, model: str, inputs: dict) -> tuple[dict, bytes]:
    headers = {"X-Datapass-Token": TOKEN}
    response = client.post("/api/runtime/v1/runs", json={"model": model, "inputs": inputs}, headers=headers)
    assert response.status_code == 202, response.text
    run_id = response.json()["runId"]
    for _ in range(200):
        record = client.get(f"/api/runtime/v1/runs/{run_id}", headers=headers).json()
        if record["status"] in ("succeeded", "failed", "cancelled"):
            break
        time.sleep(0.02)
    if record["status"] != "succeeded":
        return record, b""
    data = client.get(f"/api/runtime/v1/runs/{run_id}/artifact", headers=headers).content
    assert hashlib.sha256(data).hexdigest() == record["artifactSha256"]
    return record, data


class ContosoShapeProducer(unittest.TestCase):
    def setUp(self) -> None:
        self.app = CONTOSO.create_app(token=TOKEN)
        self.client = TestClient(self.app, base_url="http://127.0.0.1")

    def tearDown(self) -> None:
        self.app.state.runs.shutdown()

    def test_base_is_a_byte_copy_of_the_interop_fixture(self) -> None:
        fixture = REPO / "tests" / "fixtures" / "interop" / "contoso-shape.synthetic.artifact.json"
        self.assertEqual(CONTOSO.BASE_PATH.read_bytes(), fixture.read_bytes())
        self.assertEqual(CONTOSO.BASE_SHA256, hashlib.sha256(fixture.read_bytes()).hexdigest())

    def test_model_is_added_to_the_unchanged_allowlist(self) -> None:
        models = {m["id"]: m for m in self.client.get("/api/runtime/v1/models", headers={"X-Datapass-Token": TOKEN}).json()["models"]}
        self.assertEqual(set(models), {"wind-reference", "wind-weibull-grid", "contoso-shape-scenario"})
        self.assertEqual([i["id"] for i in models["contoso-shape-scenario"]["inputs"]], ["priceChangePct", "costChangePct"])

    def test_scenario_rows_metrics_and_lineage(self) -> None:
        record, data = _run(self.client, "contoso-shape-scenario", {"priceChangePct": 10, "costChangePct": -5})
        self.assertEqual(record["status"], "succeeded")
        artifact = validate(json.loads(data))
        rows = {r["row"]: r for r in artifact["payload"]["rows"]}
        self.assertEqual(len(rows), 13)
        self.assertEqual(rows["r00001"]["revenue"], round(1702 * 1.1, 2))
        self.assertEqual(rows["r00001"]["cost"], round(851 * 0.95, 2))
        total = rows["total"]
        self.assertAlmostEqual(total["margin"], round(total["revenue"] - total["cost"], 2), places=2)
        self.assertIn("SYNTHETIC", artifact["title"])
        self.assertIn(CONTOSO.BASE_SHA256, artifact["provenance"]["source"])
        self.assertEqual({i["id"]: i["value"] for i in artifact["provenance"]["inputs"]}, {"priceChangePct": 10.0, "costChangePct": -5.0})
        self.assertEqual({r["id"] for r in artifact["representations"] if r["kind"] == "metric"}, {"total-revenue", "total-margin", "margin-rate"})

    def test_out_of_range_input_is_refused(self) -> None:
        response = self.client.post("/api/runtime/v1/runs", json={"model": "contoso-shape-scenario", "inputs": {"priceChangePct": 80}},
                                    headers={"X-Datapass-Token": TOKEN})
        self.assertEqual(response.status_code, 422)


class FoilWindProducer(unittest.TestCase):
    def setUp(self) -> None:
        self.app = FOIL.create_app(token=TOKEN)
        self.client = TestClient(self.app, base_url="http://127.0.0.1")

    def tearDown(self) -> None:
        self.app.state.runs.shutdown()

    def test_compare_reuses_the_build_step_rows(self) -> None:
        record, data = _run(self.client, "foil-wind-compare", {"runA": 1, "runB": 2})
        self.assertEqual(record["status"], "succeeded")
        artifact = validate(json.loads(data))
        committed = json.loads((REPO / "clients" / "foil-wind" / "public" / "artifacts" / "foil-wind-comparison.json").read_text(encoding="utf-8"))
        expected = [{k: r[k] for k in FOIL.COLUMNS} for r in committed["payload"]["rows"] if r["runA"] == "run-1" and r["runB"] == "run-2"]
        self.assertEqual(artifact["payload"]["rows"], expected)
        self.assertIn("HAND-MADE PLACEHOLDER", artifact["provenance"]["source"])
        self.assertIn(FOIL.PLACEHOLDER_SHA256, artifact["provenance"]["source"])

    def test_equal_or_missing_slots_fail_the_run(self) -> None:
        record, _ = _run(self.client, "foil-wind-compare", {"runA": 2, "runB": 2})
        self.assertEqual(record["status"], "failed")
        self.assertIn("two different runs", record["error"])
        record, _ = _run(self.client, "foil-wind-compare", {"runA": 1, "runB": 8})
        self.assertEqual(record["status"], "failed")
        self.assertIn("run-8", record["error"])


class SavedRunSurvivesRestart(unittest.TestCase):
    def test_saved_result_has_the_same_hash_after_restart(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="dp-f212-"))
        try:
            first = CONTOSO.create_app(token=TOKEN, results_dir=root)
            client = TestClient(first, base_url="http://127.0.0.1")
            _, data = _run(client, "contoso-shape-scenario", {"priceChangePct": 5, "costChangePct": 0})
            artifact = json.loads(data)
            cell = "site-contoso-shape-analytics-scenario"
            item = {"cellId": cell, "cellKind": "python", "sourceSha256": "0" * 64,
                    "result": {"format": "datapass.cell-result", "version": 1, "cellId": cell, "cellKind": "python", "sourceSha256": "0" * 64,
                               "outputs": [{"output_type": "display_data", "data": {"application/vnd.datapass.artifact+json": artifact}, "metadata": {}}],
                               "table": None, "executionCount": None, "finishedAt": "2026-10-16T00:00:00.000Z", "origin": "datapass.runtime/1"}}
            saved = client.post("/api/notebook/v1/store/results", json={"results": [item]}, headers={"X-Datapass-Token": TOKEN})
            self.assertEqual(saved.status_code, 200, saved.text)
            sha = saved.json()["results"][0]["resultSha256"]
            first.state.runs.shutdown()
            second = CONTOSO.create_app(token=TOKEN + "x", results_dir=root)
            again = TestClient(second, base_url="http://127.0.0.1").get(f"/api/notebook/v1/store/results/{sha}", headers={"X-Datapass-Token": TOKEN + "x"})
            second.state.runs.shutdown()
            self.assertEqual(again.status_code, 200)
            self.assertEqual(hashlib.sha256(again.content).hexdigest(), sha)
        finally:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
