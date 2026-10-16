"""The Python artifact validator reports the same stable codes as the TypeScript one.

docs/contracts/diagnostic-codes.json is generated from src/framework/diagnostics (npm run contracts); the table inlined in
py/datapass_artifact.py (ARTIFACT_CODES, standard library only, works outside a checkout) must match its Python rows.
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import datapass_artifact as da  # noqa: E402

CONTRACT = json.loads((Path(__file__).resolve().parents[1] / "docs" / "contracts" / "diagnostic-codes.json")
                      .read_text(encoding="utf-8"))


class DiagnosticCodeTests(unittest.TestCase):
    def test_contract_shape(self):
        self.assertEqual((CONTRACT["format"], CONTRACT["version"]), ("datapass.diagnostic-codes", 1))
        self.assertEqual(sorted(CONTRACT["prefixes"]), ["DP-ART", "DP-BUN", "DP-CLI", "DP-ENV", "DP-STO"])
        codes = [row["code"] for row in CONTRACT["codes"]]
        self.assertEqual(len(codes), len(set(codes)))

    def test_python_table_matches_the_contract(self):
        expected = {row["rule"]: (row["code"], row["gate"]) for row in CONTRACT["codes"]
                    if row["code"].startswith("DP-ART-") and "py" in row["languages"]}
        self.assertEqual(da.ARTIFACT_CODES, expected)

    def test_typescript_only_codes_are_not_claimed_by_python(self):
        ts_only = {row["code"] for row in CONTRACT["codes"] if row["languages"] == ["ts"]}
        self.assertEqual(ts_only, {"DP-ART-059"})
        self.assertFalse(ts_only & {code for code, _ in da.ARTIFACT_CODES.values()})

    def test_structure_budget_code(self):
        deep = {}
        node = deep
        for _ in range(30):
            node["x"] = {}
            node = node["x"]
        with self.assertRaises(da.ArtifactError) as caught:
            da.check_envelope(deep)
        self.assertEqual((caught.exception.gate, caught.exception.code), ("envelope", "DP-ART-002"))

    def test_writer_side_errors_have_no_code(self):
        with self.assertRaises(da.ArtifactError) as caught:
            da.infer_columns([])
        self.assertIsNone(caught.exception.code)

    def test_message_text_is_unchanged(self):
        decision = da.decide({"format": "x"})
        self.assertEqual(decision, {"ok": False, "gate": "structure", "path": "/version", "code": "DP-ART-012",
                                    "message": "/version: artifact: missing required field version"})


if __name__ == "__main__":
    unittest.main()
