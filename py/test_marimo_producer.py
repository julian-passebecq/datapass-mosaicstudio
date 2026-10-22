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
    def test_marimo_app_runs_and_writes_a_valid_artifact(self):
        if importlib.util.find_spec("marimo") is None:
            self.skipTest("NOT_QUALIFIED: marimo not installed")
        import marimo  # noqa: F401  (import errors are failures, not skips, once marimo is present)

        original = wind_reference_model.build_artifact
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "artifacts"
            seen: list[dict] = []

            def redirected(rows, out_dir=None, run_id=None, sources_dir=None):
                artifact = original(rows, out_dir=out, run_id=run_id, sources_dir=None)
                seen.append(artifact)
                return artifact

            wind_reference_model.build_artifact = redirected
            try:
                spec = importlib.util.spec_from_file_location("dp_marimo_wind_reference", MARIMO)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                _outputs, defs = module.app.run()
            finally:
                wind_reference_model.build_artifact = original
            self.assertEqual(len(seen), 1, "the marimo app must call build_artifact exactly once")
            self.assertEqual(defs["rows"], wind_reference_model.table(k=2.0))
            written = out / (seen[0]["id"] + ".json")
            artifact = datapass_artifact.load(written)
            datapass_artifact.validate(artifact)
            self.assertEqual(artifact["payload"]["rows"], wind_reference_model.table(k=2.0))
            self.assertEqual(artifact["id"], "wind-aep-weibull")


if __name__ == "__main__":
    unittest.main()
