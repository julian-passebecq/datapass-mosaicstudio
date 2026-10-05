"""python -m unittest discover -s py -p "test_*.py" """
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import datapass_artifact as da  # noqa: E402
import wind_reference_model as wind  # noqa: E402

ROWS = [{"id": "a", "x": 1, "y": 2.5, "ok": True}, {"id": "b", "x": 2, "y": None, "ok": False}]
REPS = [{"id": "table", "title": "Rows", "kind": "table"},
        {"id": "m", "title": "Metric", "kind": "metric", "row": "a", "column": "y", "digits": 1}]


def make(**kw):
    rows = kw.pop("rows", ROWS)
    args = dict(id="demo", title="Demo", source="unit test", representations=REPS)
    args.update(kw)
    return da.to_artifact(rows, **args)


class ArtifactTests(unittest.TestCase):
    def test_shape_and_inferred_columns(self):
        a = make(run_id="run-1")
        self.assertEqual(a["format"], "datapass.artifact")
        self.assertEqual(a["provenance"], {"kind": "computed", "source": "unit test", "runId": "run-1"})
        cols = {c["id"]: c for c in a["payload"]["columns"]}
        self.assertEqual(cols["x"]["type"], "number")
        self.assertEqual(cols["ok"]["type"], "boolean")
        self.assertTrue(cols["y"]["nullable"])
        self.assertEqual(a["payload"]["rowKey"], "id")

    def test_id_rules_match_typescript(self):
        for bad in ["Demo", "1x", "", "constructor", "a" * 81, "a b"]:
            with self.assertRaises(da.ArtifactError):
                make(id=bad)
        make(id="a_B-9")

    def test_rejections(self):
        with self.assertRaises(da.ArtifactError):
            make(representations=[{"id": "m", "title": "M", "kind": "metric", "row": "zz", "column": "y"}])
        with self.assertRaises(da.ArtifactError):
            make(representations=[{"id": "c", "title": "C", "kind": "chart", "chart": "line", "x": "id", "y": "x"}])
        with self.assertRaises(da.ArtifactError):
            make(representations=[{"id": "t", "title": "T", "kind": "table", "onClick": "x"}])
        with self.assertRaises(da.ArtifactError):
            make(rows=[{"id": "a", "x": 1}, {"id": "a", "x": 2}], representations=None)
        with self.assertRaises(da.ArtifactError):
            make(rows=[{"id": "a", "x": float("inf")}], representations=None)
        with self.assertRaises(da.ArtifactError):
            make(source=" ")
        with self.assertRaises(da.ArtifactError):
            make(provenance="measured")

    def test_byte_budget(self):
        rows = [{"id": f"r{i}", "s": "x" * 3000} for i in range(400)]
        with self.assertRaisesRegex(da.ArtifactError, "bytes"):
            da.to_artifact(rows, id="big", title="Big", source="test")

    def test_text_payload(self):
        a = da.to_artifact(id="note", title="Note", source="test", text="<b>inert</b>")
        self.assertEqual(a["payload"], {"kind": "text", "text": "<b>inert</b>"})

    def test_write_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            make(out_dir=tmp, parquet_sidecar=True)
            written = json.loads((Path(tmp) / "demo.json").read_text(encoding="utf-8"))
            self.assertEqual(written["id"], "demo")
            manifest = json.loads(da.write_manifest(tmp).read_text(encoding="utf-8"))
            self.assertEqual(manifest["format"], "datapass.artifact-manifest")
            self.assertEqual([e["id"] for e in manifest["artifacts"]], ["demo"])
            self.assertEqual(len(manifest["artifacts"][0]["sha256"]), 64)


class WindModelTests(unittest.TestCase):
    def test_power_curve_and_aep_are_monotonic(self):
        self.assertEqual(wind.power_kw(2.9), 0.0)
        self.assertEqual(wind.power_kw(13), wind.RATED_KW)
        self.assertEqual(wind.power_kw(25), 0.0)
        rows = wind.table()
        aeps = [r["aep"] for r in rows]
        self.assertEqual(aeps, sorted(aeps))
        self.assertTrue(all(0 < r["capacityFactor"] < 100 for r in rows))

    def test_weibull_density_integrates_to_one(self):
        c = wind.scale_for_mean(8.0, 2.0)
        total = sum(wind.weibull_pdf(i * 0.01 + 0.005, 2.0, c) * 0.01 for i in range(6000))
        self.assertAlmostEqual(total, 1.0, places=3)

    def test_build_artifact_in_memory(self):
        a = wind.build_artifact(wind.table(), out_dir=None)
        self.assertIn("ILLUSTRATIVE", a["provenance"]["source"])
        self.assertEqual(a["provenance"]["kind"], "computed")


if __name__ == "__main__":
    unittest.main()
