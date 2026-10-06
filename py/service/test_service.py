"""FastAPI TestClient checks for the level 3 service. Needs py/service/requirements.txt:

    .venv/Scripts/python -m unittest discover -s py/service -p "test_*.py"
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from fastapi.testclient import TestClient
except ImportError:  # pragma: no cover - service deps are optional
    TestClient = None  # type: ignore

if TestClient is not None:
    from app import LIVE_ARTIFACT_ID, MAX_BODY_BYTES, create_app
    from datapass_artifact import validate

ORIGIN = "http://127.0.0.1:5173"


@unittest.skipIf(TestClient is None, "fastapi not installed (pip install -r py/service/requirements.txt)")
class ServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(create_app(origins=(ORIGIN,), allowed_hosts=("testserver", "127.0.0.1")))

    def compute(self, body: dict):
        return self.client.post("/compute/wind-reference", json=body)

    def test_health(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_valid_compute_returns_a_valid_artifact(self) -> None:
        response = self.compute({"k": 2.0, "c": 8.0, "hubHeight": 120})
        self.assertEqual(response.status_code, 200, response.text)
        artifact = validate(response.json())
        self.assertEqual(artifact["id"], LIVE_ARTIFACT_ID)
        self.assertEqual(artifact["provenance"]["kind"], "computed")
        self.assertIn("ILLUSTRATIVE", artifact["provenance"]["source"])
        rows = {r["id"]: r for r in artifact["payload"]["rows"]}
        self.assertEqual(rows["selected"]["hubHeight"], 120.0)
        self.assertNotIn("h-120", rows)
        heights = [r["hubHeight"] for r in artifact["payload"]["rows"]]
        self.assertEqual(heights, sorted(heights))
        self.assertGreater(rows["selected"]["aep"], 0)

    def test_inputs_change_the_metric(self) -> None:
        low = self.compute({"k": 2.0, "c": 7.0, "hubHeight": 100}).json()
        high = self.compute({"k": 2.0, "c": 9.0, "hubHeight": 100}).json()
        aep = lambda a: next(r["aep"] for r in a["payload"]["rows"] if r["id"] == "selected")  # noqa: E731
        self.assertGreater(aep(high), aep(low))

    def test_run_id_is_deterministic_from_inputs(self) -> None:
        a = self.compute({"k": 2.5, "c": 8.5, "hubHeight": 140}).json()
        b = self.compute({"hubHeight": 140, "c": 8.5, "k": 2.5}).json()
        c = self.compute({"k": 2.5, "c": 8.5, "hubHeight": 141}).json()
        self.assertEqual(a["provenance"]["runId"], b["provenance"]["runId"])
        self.assertEqual(a, b)
        self.assertNotEqual(a["provenance"]["runId"], c["provenance"]["runId"])
        self.assertRegex(a["provenance"]["runId"], r"^run-[0-9a-f]{16}$")

    def test_invalid_inputs_are_422(self) -> None:
        for body in ({"k": 0.5}, {"c": 40}, {"hubHeight": 10}, {"k": "2"}, {"k": True}, {"extra": 1}, {"k": None}):
            with self.subTest(body=body):
                self.assertEqual(self.compute(body).status_code, 422)

    def test_body_size_and_host_guards(self) -> None:
        big = self.client.post("/compute/wind-reference", content=b"{" + b" " * (MAX_BODY_BYTES + 1) + b"}",
                               headers={"Content-Type": "application/json"})
        self.assertEqual(big.status_code, 413)
        foreign = self.client.get("/health", headers={"Host": "evil.example"})
        self.assertEqual(foreign.status_code, 400)

    def test_cors_only_for_dev_origin(self) -> None:
        ok = self.client.options("/compute/wind-reference", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST",
                                                                     "Access-Control-Request-Headers": "content-type"})
        self.assertEqual(ok.headers.get("access-control-allow-origin"), ORIGIN)
        other = self.client.get("/health", headers={"Origin": "http://evil.example"})
        self.assertIsNone(other.headers.get("access-control-allow-origin"))

    def test_precomputed_artifact_is_served(self) -> None:
        response = self.client.get("/artifacts/wind-aep-weibull")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(validate(response.json())["id"], "wind-aep-weibull")
        self.assertEqual(self.client.get("/artifacts/missing-one").status_code, 404)
        self.assertEqual(self.client.get("/artifacts/Bad..id").status_code, 422)


if __name__ == "__main__":
    unittest.main()
