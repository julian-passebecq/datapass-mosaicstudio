"""Python leg of the datapass.artifact differential corpus (tests/fixtures/artifact-corpus, all SYNTHETIC).

The same manifest is asserted for JSON Schema and the TypeScript validator by tests/artifact-corpus.test.mjs.
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import datapass_artifact as da  # noqa: E402

CORPUS = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "artifact-corpus"
MANIFEST = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))


def decide_file(name):
    try:
        return da.decide(da.load(CORPUS / name))
    except da.ArtifactError as error:
        return {"ok": False, "gate": error.gate, "path": error.path, "message": str(error)}


class CorpusTests(unittest.TestCase):
    def test_manifest_lists_every_file(self):
        listed = {f["file"] for f in MANIFEST["fixtures"]} | {n for s in MANIFEST["sets"] for n in s["files"]}
        present = {p.relative_to(CORPUS).as_posix() for p in CORPUS.rglob("*.json") if p.name != "manifest.json"}
        self.assertEqual(listed, present)
        self.assertGreaterEqual(sum(f["expect"] == "accept" for f in MANIFEST["fixtures"]), 10)
        self.assertGreaterEqual(sum(f["expect"] == "reject" for f in MANIFEST["fixtures"]), 60)

    def test_every_fixture_decision_gate_and_path(self):
        for fixture in MANIFEST["fixtures"]:
            with self.subTest(fixture["file"]):
                got = decide_file(fixture["file"])
                if fixture["expect"] == "accept":
                    self.assertEqual(got, {"ok": True}, got.get("message"))
                else:
                    self.assertFalse(got["ok"])
                    self.assertEqual((got["gate"], got["path"]), (fixture["gate"], fixture["path"]), got["message"])
                    self.assertTrue(got["message"].startswith((fixture["path"] or "/") + ": "))

    def test_sets(self):
        for entry in MANIFEST["sets"]:
            with self.subTest(entry["name"]):
                members = [da.load(CORPUS / name) for name in entry["files"]]
                if entry["expect"] == "accept":
                    self.assertEqual(len(da.validate_set(members)), len(members))
                else:
                    with self.assertRaises(da.ArtifactError) as caught:
                        da.validate_set(members)
                    self.assertEqual((caught.exception.gate, caught.exception.path), (entry["gate"], entry["path"]))

    def test_cli_reports_json_decisions(self):
        import contextlib
        import io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = da.main([str(CORPUS / "valid/legacy-v1-table.json"), str(CORPUS / "invalid/s-format.json")])
        lines = [json.loads(line) for line in out.getvalue().splitlines()]
        self.assertEqual(code, 1)
        self.assertEqual([line["ok"] for line in lines], [True, False])
        self.assertEqual(lines[1]["path"], "/format")

    def test_js_number_formatting_matches_string(self):
        cases = {2.0: "2", 2.5: "2.5", 1e-7: "1e-7", 1e21: "1e+21", 123456.789: "123456.789", 0.000001: "0.000001",
                 -0.0: "0", 1e20: "100000000000000000000", 5e-324: "5e-324", 1.5e300: "1.5e+300", 7: "7"}
        for value, expected in cases.items():
            self.assertEqual(da._js_number(value), expected, value)

    def test_nan_and_infinity_literals_are_not_json(self):
        with self.assertRaises(da.ArtifactError):
            da.loads('{"x": NaN}')


if __name__ == "__main__":
    unittest.main()
