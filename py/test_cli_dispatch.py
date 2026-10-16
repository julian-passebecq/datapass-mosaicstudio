"""F211: `python -m datapass_artifact validate FILE` gives the same decision as the bare-file form."""
import subprocess
import sys
import unittest
from pathlib import Path

PY = Path(__file__).resolve().parent
CORPUS = PY.parent / "tests" / "fixtures" / "artifact-corpus"


def run(*args):
    return subprocess.run([sys.executable, *args], cwd=PY, capture_output=True, text=True, encoding="utf-8", check=False)


class CliDispatchTests(unittest.TestCase):
    def test_validate_subcommand_matches_bare_form(self):
        for name in ("valid/contoso-shaped-gold-export.json", "invalid/e-non-finite-number.json"):
            path = str(CORPUS / name)
            sub = run("-m", "datapass_artifact", "validate", path)
            bare = run("datapass_artifact.py", path)
            self.assertEqual(sub.returncode, bare.returncode, name)
            self.assertEqual(sub.stdout, bare.stdout, name)
            self.assertEqual(sub.returncode, 0 if name.startswith("valid/") else 1, name)

    def test_validate_subcommand_set_and_usage(self):
        files = [str(CORPUS / "valid/contoso-shaped-gold-export.json")]
        self.assertEqual(run("-m", "datapass_artifact", "validate", "--set", *files).returncode, 0)
        usage = run("-m", "datapass_artifact", "validate")
        self.assertEqual(usage.returncode, 2)
        self.assertIn("validate", usage.stderr)


if __name__ == "__main__":
    unittest.main()
