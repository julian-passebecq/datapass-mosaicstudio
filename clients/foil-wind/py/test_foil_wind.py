"""Adapter and data-step tests. The bundles here are built BY HAND in a temp folder (invented values);
nothing is copied from the producer repository or its fixtures."""
from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_data  # noqa: E402
from foil_export_adapter import ExportError, load_export  # noqa: E402


def make_bundle(root: Path, name: str, run_id: str, winds: list[float | None], **overrides) -> Path:
    """A minimal hand-made foil.export v1 capture bundle with correct byte counts and sha256."""
    bundle = root / name
    (bundle / "source" / "raw").mkdir(parents=True)
    files = {
        "source/scenario.json": json.dumps({"scenario": "test-wave", "seed": 7, "sample_period_seconds": 2, "mean_wind_ms": 3.0}).encode(),
        "source/raw/part-000000.jsonl": "\n".join(json.dumps({
            "data_classification": "SYNTHETIC", "sample_index": i, "wind_speed_ms": w, "power_kw_proxy": 0.25 * (i + 1),
            "machine_state": "SPIN" if w else "HOLD", "fault_injected": w is None}) for i, w in enumerate(winds)).encode() + b"\n",
    }
    for rel, data in files.items():
        (bundle / rel).write_bytes(data)
    meta = {"format": "foil.export", "version": 1, "data_classification": "SYNTHETIC",
            "producer": {"name": "foil-wind-lab", "version": "9.9.9"},
            "model": {"id": "made-up", "version": "0.0.1"},
            "source": {"kind": "capture", "id": run_id, "state": "COMPLETED"},
            "files": [{"path": rel, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for rel, data in files.items()]}
    meta.update(overrides)
    (bundle / "export.json").write_text(json.dumps(meta), encoding="utf-8")
    return bundle


class AdapterTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_maps_hand_made_captures(self):
        make_bundle(self.root, "b1", "test-run-b", [2.0, None, 4.0])
        make_bundle(self.root, "b2", "test-run-a", [1.0, 1.5])
        data = load_export(self.root)
        self.assertEqual(sorted(r["run"] for r in data["runs"]), ["test-run-a", "test-run-b"])
        self.assertEqual(len(data["measurements"]), 5)
        gap = [m for m in data["measurements"] if m["windMs"] is None]
        self.assertEqual(len(gap), 1)
        self.assertTrue(gap[0]["fault"])
        run = next(r for r in data["runs"] if r["run"] == "test-run-b")
        self.assertEqual(run["samplePeriodS"], 2.0)
        self.assertEqual(run["model"], "made-up@0.0.1")

    def test_single_bundle_path(self):
        bundle = make_bundle(self.root, "only", "test-run-a", [1.0])
        self.assertEqual(len(load_export(bundle)["runs"]), 1)

    def test_rejects_unknown_version_and_classification(self):
        make_bundle(self.root, "v2", "test-run-a", [1.0], version=2)
        with self.assertRaisesRegex(ExportError, "version"):
            load_export(self.root)
        other = Path(self.tmp.name) / "c"
        other.mkdir()
        make_bundle(other, "real", "test-run-a", [1.0], data_classification="CLIENT")
        with self.assertRaisesRegex(ExportError, "data_classification"):
            load_export(other)

    def test_rejects_edited_file(self):
        bundle = make_bundle(self.root, "b1", "test-run-a", [1.0, 2.0])
        raw = bundle / "source" / "raw" / "part-000000.jsonl"
        raw.write_bytes(raw.read_bytes().replace(b"1.0", b"9.0"))
        with self.assertRaisesRegex(ExportError, "sha256"):
            load_export(self.root)

    def test_campaign_bundles_are_skipped_with_notice(self):
        make_bundle(self.root, "b1", "test-run-a", [1.0])
        make_bundle(self.root, "b2", "test-campaign", [1.0], source={"kind": "campaign", "id": "test-campaign", "state": "VERIFIED"})
        data = load_export(self.root)
        self.assertEqual(len(data["runs"]), 1)
        self.assertIn("campaign", data["notices"][0])

    def test_empty_folder_fails_clearly(self):
        with self.assertRaisesRegex(ExportError, "no foil.export bundle"):
            load_export(self.root)


class DataStepTest(unittest.TestCase):
    def test_placeholder_builds_every_artifact(self):
        with tempfile.TemporaryDirectory() as out:
            written = build_data.build(build_data.load_placeholder(), Path(out))
            ids = sorted(a["id"] for a in written)
            self.assertIn("foil-wind-comparison", ids)
            self.assertEqual(len([i for i in ids if i.startswith("foil-wind-measurements-")]), 3)
            comparison = next(a for a in written if a["id"] == "foil-wind-comparison")
            self.assertEqual(len(comparison["payload"]["rows"]), 3 * 2 * len(build_data.METRICS))
            for artifact in written:
                self.assertIn("HAND-MADE PLACEHOLDER", artifact["provenance"]["source"])
                self.assertEqual(artifact["provenance"]["kind"], "synthetic")

    def test_export_build_and_comparison_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_bundle(root / "in", "b1", "test-run-a", [2.0, 4.0])
            make_bundle(root / "in", "b2", "test-run-b", [3.0, None])
            written = build_data.build(load_export(root / "in"), root / "out")
            rows = next(a for a in written if a["id"] == "foil-wind-comparison")["payload"]["rows"]
            wind = next(r for r in rows if r["key"] == "run-1.run-2.meanWindMs")
            self.assertEqual((wind["valueA"], wind["valueB"], wind["delta"], wind["deltaPct"]), (3.0, 3.0, 0.0, 0.0))
            missing = next(r for r in rows if r["key"] == "run-1.run-2.missingWind")
            self.assertEqual((missing["delta"], missing["deltaPct"]), (1, None))
            self.assertEqual((wind["direction"], wind["chartPct"]), ("No change", None))
            self.assertEqual((missing["direction"], missing["chartPct"]), ("B higher", None))
            sql = next(a for a in written if a["id"] == "foil-wind-sql-per-run")["payload"]["rows"]
            self.assertEqual([r["missing_wind"] for r in sql], [0, 1])

    def test_negative_delta_is_kept_signed(self):
        # Hand-made pair where run B is lower than run A: the sign must survive to the artifact.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_bundle(root / "in", "b1", "test-run-a", [8.0, 6.0])
            make_bundle(root / "in", "b2", "test-run-b", [3.0, 3.0])
            written = build_data.build(load_export(root / "in"), root / "out")
            rows = next(a for a in written if a["id"] == "foil-wind-comparison")["payload"]["rows"]
            wind = next(r for r in rows if r["key"] == "run-1.run-2.meanWindMs")
            self.assertEqual((wind["valueA"], wind["valueB"], wind["delta"], wind["deltaPct"]), (7.0, 3.0, -4.0, -57.14))
            self.assertEqual((wind["direction"], wind["chartPct"]), ("B lower", -57.14))
            back = next(r for r in rows if r["key"] == "run-2.run-1.meanWindMs")
            self.assertEqual((back["delta"], back["deltaPct"], back["direction"], back["chartPct"]), (4.0, 133.33, "B higher", 133.33))

    def test_cli_refuses_export_into_committed_folder(self):
        self.assertEqual(build_data.main(["--export", "anything"]), 2)


if __name__ == "__main__":
    unittest.main()
