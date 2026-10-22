"""S07: the marimo example (py/notebooks/wind_reference.py) reuses the same producer functions as the Jupyter notebook
and the plain script (py/wind_reference_model.py), and, when marimo is importable, really runs and writes an artifact
that the current datapass.artifact/1 validator accepts.

Without marimo the execution test is skipped as "NOT_QUALIFIED: marimo not installed": an explicit non-qualification, not
a pass. The marimo file is never run against the repository's public artifact folder: build_artifact is redirected to a
temporary directory.
"""
from __future__ import annotations

import ast
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

PY = Path(__file__).resolve().parent
sys.path.insert(0, str(PY))

import datapass_artifact  # noqa: E402
import wind_reference_model  # noqa: E402

MARIMO = PY / "notebooks" / "wind_reference.py"
JUPYTER = PY / "notebooks" / "wind_reference.ipynb"
SCRIPT = PY / "wind_reference_model.py"


def model_calls(source: str) -> set[str]:
    """Names called as `model.<name>(...)` (the alias both notebooks use for wind_reference_model)."""
    calls = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) \
                and node.func.value.id == "model":
            calls.add(node.func.attr)
    return calls


def imports_model(source: str) -> bool:
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import) and any(a.name == "wind_reference_model" and a.asname == "model" for a in node.names):
            return True
    return False


def jupyter_source() -> str:
    notebook = json.loads(JUPYTER.read_text(encoding="utf-8"))
    return "\n".join("".join(c["source"]) for c in notebook["cells"] if c["cell_type"] == "code")


def script_main_calls() -> set[str]:
    tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
    main = [n for n in tree.body if isinstance(n, ast.If) and "__main__" in ast.unparse(n.test)]
    assert main, "wind_reference_model.py has no __main__ block"
    return {n.func.id for n in ast.walk(main[0]) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)}


class MarimoProducerParity(unittest.TestCase):
    def test_marimo_jupyter_and_script_call_the_same_model_functions(self):
        marimo_src, jupyter_src = MARIMO.read_text(encoding="utf-8"), jupyter_source()
        self.assertTrue(imports_model(marimo_src), "marimo app must import wind_reference_model as model")
        self.assertTrue(imports_model(jupyter_src), "Jupyter notebook must import wind_reference_model as model")
        marimo_calls, jupyter_calls = model_calls(marimo_src), model_calls(jupyter_src)
        self.assertEqual(marimo_calls, {"table", "build_artifact"})
        self.assertEqual(marimo_calls, jupyter_calls)
        self.assertLessEqual(marimo_calls, script_main_calls())
        for name in marimo_calls:
            self.assertTrue(callable(getattr(wind_reference_model, name)), name)

    def test_no_equation_is_copied_into_the_notebooks(self):
        # Calculations stay in the importable module: the notebooks define no function and use no math.
        for source in (MARIMO.read_text(encoding="utf-8"), jupyter_source()):
            tree = ast.parse(source)
            nested = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name != "_"]
            self.assertEqual(nested, [])
            self.assertFalse(any(isinstance(n, (ast.Import, ast.ImportFrom)) and "math" in ast.unparse(n) for n in ast.walk(tree)))


class MarimoExecution(unittest.TestCase):
    def run_at_shape(self, k=2.0, *, override=False):
        if importlib.util.find_spec("marimo") is None:
            self.skipTest("NOT_QUALIFIED: marimo not installed")
        import marimo  # import errors are failures, not skips, once marimo is present

        original = wind_reference_model.build_artifact
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "artifacts"
            seen: list[dict] = []

            def redirected(rows, out_dir=None, run_id=None, sources_dir=None, *, k=2.0):
                artifact = original(rows, out_dir=out, run_id=run_id, sources_dir=None, k=k)
                seen.append(artifact)
                return artifact

            wind_reference_model.build_artifact = redirected
            try:
                spec = importlib.util.spec_from_file_location("dp_marimo_wind_reference", MARIMO)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                # Public app.run(defs=...) executes the real dependent cells at a non-default UI value.
                # This is notebook execution, not browser interaction or reactive slider-gesture qualification.
                supplied = {"k": marimo.ui.slider(1.5, 3.0, step=0.1, value=k)} if override else {}
                _outputs, defs = module.app.run(defs=supplied)
            finally:
                wind_reference_model.build_artifact = original
            self.assertEqual(len(seen), 1, "the marimo app must call build_artifact exactly once")
            self.assertEqual(defs["rows"], wind_reference_model.table(k=k))
            written = out / (seen[0]["id"] + ".json")
            artifact = datapass_artifact.load(written)
            datapass_artifact.validate(artifact)
            self.assertEqual(artifact["payload"]["rows"], wind_reference_model.table(k=k))
            self.assertEqual(artifact["id"], "wind-aep-weibull")
            return artifact

    def test_marimo_app_runs_and_writes_a_valid_artifact(self):
        self.run_at_shape()

    def test_marimo_nondefault_shape_reaches_exported_artifact(self):
        artifact = self.run_at_shape(2.7, override=True)
        values = {item["id"]: item["value"] for item in artifact["provenance"]["inputs"]}
        self.assertEqual(values["k"], 2.7)
        self.assertIn("Weibull k=2.7", artifact["title"])
        self.assertIn("Weibull k=2.7", artifact["provenance"]["source"])
        default = wind_reference_model.build_artifact(wind_reference_model.table(), out_dir=None)
        self.assertNotEqual(artifact["provenance"]["inputHash"], default["provenance"]["inputHash"])


class WindParameterProvenance(unittest.TestCase):
    def test_changed_shape_is_preserved_in_artifact_inputs_and_description(self):
        for k in (1.5, 2.7, 3.0):
            with self.subTest(k=k):
                rows = wind_reference_model.table(k=k)
                artifact = wind_reference_model.build_artifact(rows, out_dir=None, k=k)
                values = {item["id"]: item["value"] for item in artifact["provenance"]["inputs"]}
                self.assertEqual(values["k"], k)
                self.assertEqual(artifact["payload"]["rows"], rows)
                self.assertIn(f"Weibull k={k:g}", artifact["title"])
                self.assertIn(f"Weibull k={k:g}", artifact["provenance"]["source"])
                datapass_artifact.validate(artifact)

    def test_parameter_change_updates_input_hash_without_recomputing_rows(self):
        artifacts = [wind_reference_model.build_artifact(wind_reference_model.table(k=k), out_dir=None, k=k)
                     for k in (2.0, 2.7)]
        self.assertNotEqual(artifacts[0]["provenance"]["inputHash"], artifacts[1]["provenance"]["inputHash"])
        self.assertNotEqual(artifacts[0]["payload"]["rows"], artifacts[1]["payload"]["rows"])
        # Observe original functions without replacing them: lineage cites their exact on-disk source.
        calls = []
        codes = {wind_reference_model.table.__code__, wind_reference_model.annual_energy_mwh.__code__}
        previous_profile = sys.getprofile()
        def record_call(frame, event, arg):
            if event == "call" and frame.f_code in codes:
                calls.append(frame.f_code.co_name)
        sys.setprofile(record_call)
        try:
            copied = wind_reference_model.build_artifact(artifacts[1]["payload"]["rows"], out_dir=None, k=2.7)
        finally:
            sys.setprofile(previous_profile)
        self.assertEqual(calls, [], "packaging a result must not rerun the calculation")
        self.assertEqual(copied["payload"]["rows"], artifacts[1]["payload"]["rows"])
        self.assertEqual(copied["provenance"]["inputHash"], artifacts[1]["provenance"]["inputHash"])

    def test_default_script_call_remains_compatible(self):
        rows = wind_reference_model.table()
        implicit = wind_reference_model.build_artifact(rows, out_dir=None)
        explicit = wind_reference_model.build_artifact(rows, out_dir=None, k=2.0)
        self.assertEqual(implicit, explicit)

    def test_invalid_shape_is_refused_before_any_output_is_written(self):
        rows = wind_reference_model.table()
        for k in (0.0, -2.0, float("nan"), float("inf"), True, "2.7"):
            with self.subTest(k=k), tempfile.TemporaryDirectory() as tmp:
                out = Path(tmp) / "artifacts"
                with self.assertRaises(ValueError):
                    wind_reference_model.build_artifact(rows, out_dir=out, k=k)
                self.assertFalse(out.exists())

    def test_notebook_producers_pass_the_same_shape_to_calculation_and_export(self):
        # Source-level wiring check, not marimo/Jupyter runtime qualification.
        for source in (MARIMO.read_text(encoding="utf-8"), jupyter_source()):
            tree = ast.parse(source)
            calls = {n.func.attr: n for n in ast.walk(tree)
                     if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
                     and isinstance(n.func.value, ast.Name) and n.func.value.id == "model"
                     and n.func.attr in {"table", "build_artifact"}}
            kwargs = {name: {kw.arg: ast.dump(kw.value) for kw in call.keywords}
                      for name, call in calls.items()}
            self.assertIn("k", kwargs["build_artifact"], "export must bind the parameter used by the calculation")
            self.assertEqual(kwargs["table"]["k"], kwargs["build_artifact"]["k"])


if __name__ == "__main__":
    unittest.main()
