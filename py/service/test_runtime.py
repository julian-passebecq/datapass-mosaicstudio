"""TestClient checks for the level 4 runs API (`datapass.runtime/1`). Needs py/service/requirements.txt:

    python -m unittest discover -s py/service -p "test_*.py"
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import threading
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

try:
    from fastapi.testclient import TestClient
except ImportError:  # pragma: no cover - service deps are optional
    TestClient = None  # type: ignore

if TestClient is not None:
    from pydantic import BaseModel, ConfigDict, Field

    import app as service
    from datapass_artifact import encode, validate
    from runtime import Cancelled, InputSpec, ModelResult, RuntimeModel

ORIGIN = "http://127.0.0.1:5173"
TOKEN = "test-token-0123456789"
API = "/api/runtime/v1"
NODE = shutil.which("node")
NODE_VALIDATE = (
    "import {validateArtifact} from " + json.dumps((ROOT / "src/framework/foundation/artifact.ts").as_uri()) + ";"
    "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{validateArtifact(JSON.parse(s));console.log('ok');});"
)


def _model(model_id: str, compute, version: str = "test-1") -> "RuntimeModel":
    return RuntimeModel(id=model_id, version=version, title=f"ILLUSTRATIVE {model_id}", description="test model",
                        artifact_id=f"{model_id}-run", source="test model. ILLUSTRATIVE, not FOIL data.",
                        inputs_class=TestInputs, inputs=(InputSpec("n", "Rows", "", 1),), compute=compute)


if TestClient is not None:
    class TestInputs(BaseModel):
        model_config = ConfigDict(extra="forbid")
        n: int = Field(3, ge=1, le=50, strict=True)

    def _rows(n: int) -> ModelResult:
        return ModelResult(rows=[{"id": f"r{i}", "value": float(i)} for i in range(n)], title="test rows",
                           labels={"id": "Row", "value": "Value"}, units={},
                           representations=[{"id": "table", "title": "Rows", "kind": "table"}])


class Gate:
    """A model that blocks (checking should_cancel) until released; lets tests hold runs queued or running."""

    def __init__(self) -> None:
        self.release, self.started = threading.Event(), threading.Event()

    def __call__(self, inputs, should_cancel):
        self.started.set()
        while not self.release.wait(0.005):
            if should_cancel():
                raise Cancelled()
        return _rows(inputs.n)


@unittest.skipIf(TestClient is None, "fastapi not installed (pip install -r py/service/requirements.txt)")
class RuntimeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.gate = Gate()
        models = dict(service.RUNTIME_MODELS)
        models["gate"] = _model("gate", self.gate)
        models["boom"] = _model("boom", self._boom)
        self.app = service.create_app(origins=(ORIGIN,), allowed_hosts=("testserver", "127.0.0.1"), models=models, token=TOKEN)
        self.client = TestClient(self.app)
        self.client.headers.update({"X-Datapass-Token": TOKEN})

    def tearDown(self) -> None:
        self.gate.release.set()
        self.app.state.runs.shutdown()

    @staticmethod
    def _boom(inputs, should_cancel):
        raise RuntimeError("model exploded " + "x" * 2000 + "\nTraceback line")

    def submit(self, model: str, inputs: dict | None = None):
        return self.client.post(f"{API}/runs", json={"model": model, "inputs": inputs or {}})

    def wait(self, run_id: str, statuses=("succeeded", "failed", "cancelled"), timeout: float = 20.0) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            record = self.client.get(f"{API}/runs/{run_id}").json()
            if record["status"] in statuses:
                return record
            time.sleep(0.01)
        self.fail(f"run {run_id} did not reach {statuses}")

    # -- security --------------------------------------------------------------------------------
    def test_token_required_on_every_runtime_route(self) -> None:
        for method, path in (("get", "/health"), ("get", "/models"), ("get", "/runs"), ("get", "/runs/run-0123456789abcdef"),
                             ("post", "/runs/run-0123456789abcdef/cancel")):
            with self.subTest(path=path):
                missing = getattr(self.client, method)(API + path, headers={"X-Datapass-Token": ""})
                self.assertEqual(missing.status_code, 401)
                self.assertIn("detail", missing.json())
                wrong = getattr(self.client, method)(API + path, headers={"X-Datapass-Token": TOKEN + "x"})
                self.assertEqual(wrong.status_code, 401)
        self.assertEqual(self.client.get("/health", headers={"X-Datapass-Token": ""}).status_code, 200)  # level 3 unchanged

    def test_origin_guard_and_cors(self) -> None:
        bad = self.client.get(f"{API}/health", headers={"Origin": "http://evil.example"})
        self.assertEqual(bad.status_code, 403)
        ok = self.client.get(f"{API}/health", headers={"Origin": ORIGIN})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.headers.get("access-control-allow-origin"), ORIGIN)
        preflight = self.client.options(f"{API}/runs", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST",
                                                                "Access-Control-Request-Headers": "content-type,x-datapass-token"})
        self.assertEqual(preflight.status_code, 200)
        self.assertIn("x-datapass-token", preflight.headers.get("access-control-allow-headers", "").lower())
        self.assertIsNone(preflight.headers.get("access-control-allow-credentials"))

    def test_host_guard_and_no_store(self) -> None:
        self.assertEqual(self.client.get(f"{API}/health", headers={"Host": "evil.example"}).status_code, 400)
        response = self.client.get(f"{API}/health")
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_default_token_is_random_and_origins_include_preview(self) -> None:
        a, b = service.create_app(models={}), service.create_app(models={})
        try:
            self.assertGreaterEqual(len(a.state.runtime_token), 40)
            self.assertNotEqual(a.state.runtime_token, b.state.runtime_token)
        finally:
            a.state.runs.shutdown(); b.state.runs.shutdown()
        self.assertIn("http://localhost:4173", service.DEFAULT_ORIGINS)
        line = service.connect_line(8765, "tok")
        self.assertEqual(line, "DataPass runtime ready. Open the workbench with: "
                               "http://127.0.0.1:5173/?workspace=blank#runtime=http%3A%2F%2F127.0.0.1%3A8765&token=tok")

    # -- discovery -------------------------------------------------------------------------------
    def test_health_and_models(self) -> None:
        health = self.client.get(f"{API}/health").json()
        self.assertEqual(health["runtime"], "datapass.runtime/1")
        self.assertEqual(health["service"], "datapass-artifact-service")
        self.assertTrue(health["illustrative"])
        self.assertIn("wind-weibull-grid", health["models"])
        models = {m["id"]: m for m in self.client.get(f"{API}/models").json()["models"]}
        wind = models["wind-reference"]
        self.assertEqual(wind["artifactId"], "wind-reference-run")
        self.assertTrue(wind["illustrative"])
        k = next(i for i in wind["inputs"] if i["id"] == "k")
        self.assertEqual((k["type"], k["min"], k["max"], k["default"]), ("number", 1.0, 4.0, 2.0))
        res = next(i for i in models["wind-weibull-grid"]["inputs"] if i["id"] == "resolution")
        self.assertEqual(res["max"], service.GRID_MAX_RESOLUTION)

    # -- runs ------------------------------------------------------------------------------------
    def test_submit_poll_succeeded_artifact_validates(self) -> None:
        response = self.submit("wind-reference", {"k": 2.0, "c": 8.0, "hubHeight": 120})
        self.assertEqual(response.status_code, 202, response.text)
        record = response.json()
        self.assertRegex(record["runId"], r"^run-[0-9a-f]{16}$")
        self.assertEqual(record["status"], "queued")
        canonical = json.dumps({"model": "wind-reference", "version": service.MODEL_VERSION, "inputs": record["inputs"]},
                               sort_keys=True, separators=(",", ":"))
        self.assertEqual(record["inputHash"], hashlib.sha256(canonical.encode()).hexdigest())
        done = self.wait(record["runId"])
        self.assertEqual(done["status"], "succeeded", done)
        self.assertTrue(done["startedAt"] and done["finishedAt"] and done["submittedAt"].endswith("Z"))
        served = self.client.get(f"{API}/runs/{record['runId']}/artifact")
        self.assertEqual(served.status_code, 200)
        self.assertEqual(hashlib.sha256(served.content).hexdigest(), done["artifactSha256"])
        artifact = validate(served.json())
        prov = artifact["provenance"]
        self.assertEqual((artifact["id"], prov["kind"], prov["runId"]), ("wind-reference-run", "computed", record["runId"]))
        self.assertIn("ILLUSTRATIVE", artifact["title"])
        self.assertEqual(prov["inputHash"], record["inputHash"])
        self.assertEqual(prov["producer"], {"kind": "service", "name": "py/service runtime: wind-reference"})
        self.assertEqual({i["id"]: i["value"] for i in prov["inputs"]}, {"k": 2.0, "c": 8.0, "hubHeight": 120.0})
        legacy = self.client.post("/compute/wind-reference", json={"k": 2.0, "c": 8.0, "hubHeight": 120}).json()
        self.assertEqual(artifact["payload"]["rows"], legacy["payload"]["rows"])  # same computation as level 3
        self.assertEqual(self.client.get(f"{API}/runs").json()["runs"][0]["runId"], record["runId"])
        if NODE:
            node = subprocess.run([NODE, "--experimental-strip-types", "--input-type=module", "-e", NODE_VALIDATE],
                                  input=served.content, capture_output=True, cwd=ROOT, timeout=60)
            self.assertEqual(node.returncode, 0, node.stderr.decode(errors="replace")[-800:])

    def test_grid_model_runs_and_validates(self) -> None:
        record = self.submit("wind-weibull-grid", {"kMin": 1.5, "kMax": 3.0, "cMin": 5, "cMax": 11, "resolution": 6}).json()
        done = self.wait(record["runId"])
        self.assertEqual(done["status"], "succeeded", done)
        artifact = validate(self.client.get(f"{API}/runs/{record['runId']}/artifact").json())
        self.assertEqual(len(artifact["payload"]["rows"]), 36)
        self.assertEqual({r["kind"] for r in artifact["representations"]}, {"metric", "table", "chart", "json"})
        rows = artifact["payload"]["rows"]
        self.assertGreater(rows[-1]["aep"], rows[0]["aep"])  # larger k and c -> more energy in this range

    def test_grid_max_resolution_stays_inside_budgets(self) -> None:
        inputs = service.WindWeibullGridInputs(resolution=service.GRID_MAX_RESOLUTION)
        result = service.runtime_wind_weibull_grid(inputs, lambda: False)
        self.assertLessEqual(len(result.rows), 10000)
        rows_bytes = len(json.dumps(result.rows, separators=(",", ":")))
        self.assertLess(rows_bytes, 1048576 - 8192)

    def test_bad_inputs_422_unknown_model_404(self) -> None:
        for inputs in ({"k": 0.5}, {"k": "2"}, {"k": True}, {"extra": 1}):
            with self.subTest(inputs=inputs):
                self.assertEqual(self.submit("wind-reference", inputs).status_code, 422)
        self.assertEqual(self.submit("wind-weibull-grid", {"kMin": 3, "kMax": 2}).status_code, 422)
        self.assertEqual(self.submit("wind-weibull-grid", {"resolution": service.GRID_MAX_RESOLUTION + 1}).status_code, 422)
        self.assertEqual(self.client.post(f"{API}/runs", json={"model": "wind-reference", "inputs": {}, "x": 1}).status_code, 422)
        self.assertEqual(self.client.post(f"{API}/runs", json={"model": "wind-reference"}).status_code, 422)
        self.assertEqual(self.submit("os.system", {"cmd": "calc"}).status_code, 404)
        self.assertEqual(self.client.get(f"{API}/runs/run-0123456789abcdef").status_code, 404)
        self.assertEqual(self.client.get(f"{API}/runs/../../health").status_code, 404)
        self.assertEqual(self.client.get(f"{API}/runs/run-XYZ").status_code, 422)
        self.assertEqual(self.client.post(f"{API}/runs/bad/cancel").status_code, 422)

    def test_cancel_queued_running_and_terminal(self) -> None:
        first = self.submit("gate").json()
        second = self.submit("gate").json()  # two workers: both start
        self.assertTrue(self.gate.started.wait(5))
        queued = self.submit("gate").json()
        self.assertEqual(self.client.get(f"{API}/runs/{queued['runId']}").json()["status"], "queued")
        cancelled = self.client.post(f"{API}/runs/{queued['runId']}/cancel")
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.json()["status"], "cancelled")
        self.assertIsNotNone(cancelled.json()["finishedAt"])
        self.wait(first["runId"], ("running",))
        running = self.client.post(f"{API}/runs/{first['runId']}/cancel").json()
        self.assertIn(running["status"], ("running", "cancelled"))
        self.assertEqual(self.wait(first["runId"])["status"], "cancelled")
        self.assertEqual(self.client.get(f"{API}/runs/{first['runId']}/artifact").json(), {"detail": "run is cancelled"})
        self.gate.release.set()
        done = self.wait(second["runId"])
        self.assertEqual(done["status"], "succeeded")
        again = self.client.post(f"{API}/runs/{second['runId']}/cancel").json()
        self.assertEqual(again, done)  # terminal: unchanged, not pretended cancelled
        self.assertEqual(self.wait(queued["runId"])["status"], "cancelled")  # never started afterwards
        self.assertIsNone(self.client.get(f"{API}/runs/{queued['runId']}").json()["startedAt"])

    def test_failing_model_reports_bounded_error(self) -> None:
        record = self.submit("boom").json()
        done = self.wait(record["runId"])
        self.assertEqual(done["status"], "failed")
        self.assertLessEqual(len(done["error"]), 500)
        self.assertTrue(done["error"].startswith("RuntimeError: model exploded"))
        self.assertNotIn("\n", done["error"])
        self.assertNotIn("Traceback (most recent call last)", done["error"])
        self.assertEqual(self.client.get(f"{API}/runs/{record['runId']}/artifact").status_code, 409)

    def test_artifact_409_while_queued_or_running(self) -> None:
        record = self.submit("gate").json()
        self.assertTrue(self.gate.started.wait(5))
        response = self.client.get(f"{API}/runs/{record['runId']}/artifact")
        self.assertEqual((response.status_code, response.json()), (409, {"detail": "run is running"}))

    def test_too_many_active_runs_429(self) -> None:
        ids = [self.submit("gate").json()["runId"] for _ in range(8)]
        refused = self.submit("gate")
        self.assertEqual(refused.status_code, 429)
        self.assertIn("detail", refused.json())
        self.client.post(f"{API}/runs/{ids[-1]}/cancel")
        self.assertEqual(self.submit("gate").status_code, 202)

    def test_retention_keeps_newest_fifty(self) -> None:
        store = self.app.state.runs
        first = None
        for index in range(60):
            record = self.submit("wind-reference").json()
            first = first or record["runId"]
            self.wait(record["runId"])
        runs = self.client.get(f"{API}/runs").json()["runs"]
        self.assertEqual(len(runs), 50)
        self.assertEqual(runs[0]["runId"], record["runId"])  # newest first
        self.assertEqual(self.client.get(f"{API}/runs/{first}").status_code, 404)
        self.assertEqual(store.retained, 50)

    def test_artifact_bytes_are_compact_encoding(self) -> None:
        record = self.submit("gate", {"n": 4}).json()
        self.gate.release.set()
        done = self.wait(record["runId"])
        data = self.client.get(f"{API}/runs/{record['runId']}/artifact").content
        self.assertEqual(data, encode(json.loads(data)))
        self.assertEqual(done["artifactSha256"], hashlib.sha256(data).hexdigest())


if __name__ == "__main__":
    unittest.main()


class TokenPolicyTest(unittest.TestCase):
    def test_short_or_unsafe_tokens_are_refused(self):
        from runtime import resolve_token
        for bad in ("short", "x" * 129, "has space in it!!"):
            with self.assertRaises(ValueError):
                resolve_token(bad)
        self.assertEqual(resolve_token("a" * 16), "a" * 16)
        self.assertGreaterEqual(len(resolve_token()), 16)
