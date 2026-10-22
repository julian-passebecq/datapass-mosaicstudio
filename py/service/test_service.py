"""FastAPI TestClient checks for the level 3 service. Needs py/service/requirements.txt:

    .venv/Scripts/python -m unittest discover -s py/service -p "test_*.py"
"""
from __future__ import annotations

import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from fastapi.testclient import TestClient
except ImportError:  # pragma: no cover - service deps are optional
    TestClient = None  # type: ignore

if TestClient is not None:
    from app import (ARTIFACT_DIR_ENV, CHECKOUT_ARTIFACT_DIR, LIVE_ARTIFACT_ID, MAX_BODY_BYTES, PROFILE_ENV, PROFILES,
                     SERVICE_NAME, SERVICE_VERSION, create_app, resolve_artifact_dir, resolve_profile)
    from datapass_artifact import validate

ORIGIN = "http://127.0.0.1:5173"
TOKEN = "service-test-token-0123456789"


@unittest.skipIf(TestClient is None, "fastapi not installed (pip install -r py/service/requirements.txt)")
class ServiceTest(unittest.TestCase):
    """Level 3 routes: they exist in the `demo` profile only (S02)."""

    def setUp(self) -> None:
        self.client = TestClient(create_app(origins=(ORIGIN,), allowed_hosts=("testserver", "127.0.0.1"), profile="demo"))

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


    def test_artifact_dir_from_env_outside_a_checkout(self) -> None:
        """F201: the runtime companion points DATAPASS_ARTIFACT_DIR at its own folder; a missing folder answers 404."""
        source = CHECKOUT_ARTIFACT_DIR / "wind-aep-weibull.json"
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "artifacts"
            with mock.patch.dict(os.environ, {ARTIFACT_DIR_ENV: str(folder)}):
                self.assertEqual(resolve_artifact_dir(), folder)
                client = TestClient(create_app(origins=(ORIGIN,), allowed_hosts=("testserver",), profile="demo"))
                self.assertEqual(client.get("/artifacts/wind-aep-weibull").status_code, 404)  # folder missing
                folder.mkdir()
                self.assertEqual(client.get("/artifacts/wind-aep-weibull").status_code, 404)  # folder empty
                (folder / "wind-aep-weibull.json").write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
                response = client.get("/artifacts/wind-aep-weibull")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["id"], "wind-aep-weibull")
                validate(response.json())
            with mock.patch.dict(os.environ, {ARTIFACT_DIR_ENV: "  "}):
                self.assertEqual(resolve_artifact_dir(), CHECKOUT_ARTIFACT_DIR)  # blank means unset
        env = {k: v for k, v in os.environ.items() if k != ARTIFACT_DIR_ENV}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(resolve_artifact_dir(), CHECKOUT_ARTIFACT_DIR)

    def test_demo_legacy_routes_keep_the_origin_and_host_guards(self) -> None:
        body = {"k": 2.0, "c": 8.0, "hubHeight": 120}
        foreign = self.client.post("/compute/wind-reference", json=body, headers={"Origin": "http://evil.example"})
        self.assertEqual(foreign.status_code, 403)
        self.assertEqual(self.client.get("/artifacts/wind-aep-weibull", headers={"Origin": "http://evil.example"}).status_code, 403)
        self.assertEqual(self.client.post("/compute/wind-reference", json=body, headers={"Origin": ORIGIN}).status_code, 200)
        self.assertEqual(self.client.post("/compute/wind-reference", json=body, headers={"Host": "evil.example"}).status_code, 400)
        self.assertEqual(self.client.get("/health").json()["profile"], "demo")
        self.assertEqual(self.client.get("/openapi.json").status_code, 200)
        self.assertEqual(self.client.get("/docs").status_code, 200)


@unittest.skipIf(TestClient is None, "fastapi not installed (pip install -r py/service/requirements.txt)")
class SafeProfileTest(unittest.TestCase):
    """S02: the default `safe` profile serves no unauthenticated computation, artifact or OpenAPI route."""

    def setUp(self) -> None:
        env = {k: v for k, v in os.environ.items() if k != PROFILE_ENV}
        with mock.patch.dict(os.environ, env, clear=True):
            self.app = create_app(origins=(ORIGIN,), allowed_hosts=("testserver", "127.0.0.1"), token=TOKEN)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.app.state.runs.shutdown()

    def test_safe_is_the_default(self) -> None:
        self.assertEqual(self.app.state.profile, "safe")
        with mock.patch.dict(os.environ, {PROFILE_ENV: ""}):
            self.assertEqual(resolve_profile(), "safe")

    def test_legacy_and_openapi_routes_are_404(self) -> None:
        for method, path in (("get", "/artifacts/wind-aep-weibull"), ("post", "/compute/wind-reference"), ("get", "/docs"),
                             ("get", "/redoc"), ("get", "/openapi.json"), ("get", "/docs/oauth2-redirect")):
            with self.subTest(path=path):
                kwargs = {"json": {"k": 2.0, "c": 8.0, "hubHeight": 120}} if method == "post" else {}
                for token in ("", TOKEN):  # not even with the runtime token
                    response = getattr(self.client, method)(path, headers={"X-Datapass-Token": token}, **kwargs)
                    self.assertEqual(response.status_code, 404, (path, response.text))
                    self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_health_is_minimal_liveness(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "service": SERVICE_NAME, "version": SERVICE_VERSION, "profile": "safe"})
        self.assertNotIn(TOKEN, response.text)
        self.assertEqual(SERVICE_VERSION, "0.5.0")

    def test_profile_from_env_and_refusals(self) -> None:
        with mock.patch.dict(os.environ, {PROFILE_ENV: "demo"}):
            self.assertEqual(resolve_profile(), "demo")
            self.assertEqual(resolve_profile("safe"), "safe")  # explicit wins over the env
        with mock.patch.dict(os.environ, {PROFILE_ENV: "  "}):
            self.assertEqual(resolve_profile(), "safe")
        self.assertEqual(PROFILES, ("safe", "demo"))
        for bad in ("open", "DEMO", "all"):
            with self.subTest(profile=bad), self.assertRaises(ValueError):
                resolve_profile(bad)
        with mock.patch.dict(os.environ, {PROFILE_ENV: "everything"}):
            with self.assertRaises(ValueError):
                create_app(token=TOKEN)

    def test_cli_profile_flag(self) -> None:
        import app as service
        quiet = mock.patch("sys.stderr", new_callable=io.StringIO)  # the connect line carries the token: never print it
        with quiet, mock.patch.object(service, "app", self.app), mock.patch("uvicorn.run") as run:
            service.main(["--port", "24391", "--profile", "demo"])
            served = run.call_args.args[0]
            self.assertEqual(served.state.profile, "demo")
            self.assertEqual(served.state.runtime_token, TOKEN)
            served.state.runs.shutdown()
        with quiet, mock.patch.object(service, "app", create_app(token=TOKEN)), mock.patch("uvicorn.run") as run:
            service.main(["--port", "24391"])
            self.assertEqual(run.call_args.args[0].state.profile, "safe")
            run.call_args.args[0].state.runs.shutdown()
        with quiet, self.assertRaises(SystemExit):
            service.main(["--profile", "open"])


if __name__ == "__main__":
    unittest.main()
