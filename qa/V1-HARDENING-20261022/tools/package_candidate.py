"""Package an already-built clean candidate; never deploy, execute it, or overwrite a candidate."""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import zipfile

repo, output = (pathlib.Path(arg).resolve() for arg in sys.argv[1:])
source = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
if subprocess.check_output(["git", "status", "--porcelain"], cwd=repo, text=True).strip():
    raise SystemExit("Refusing a dirty source tree")
output.mkdir(parents=True, exist_ok=False)
for folder in ("dist-sdk", "dist-runtime"):
    shutil.copytree(repo / folder, output / folder)
archive = output / "datapass-mosaicstudio-workbench-0.13.0-hardening.zip"
files = sorted((repo / "dist").rglob("*"))
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for file in files:
        if file.is_symlink():
            raise SystemExit("Refusing a symlink")
        if file.is_file():
            info = zipfile.ZipInfo(file.relative_to(repo / "dist").as_posix(), (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, file.read_bytes(), compresslevel=9)
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    for name in bundle.namelist():
        assert bundle.read(name) == (repo / "dist" / name).read_bytes(), name
records = [{"path": f.relative_to(output).as_posix(), "bytes": f.stat().st_size,
            "sha256": hashlib.sha256(f.read_bytes()).hexdigest()}
           for f in sorted(output.rglob("*")) if f.is_file()]
manifest = {"format": "datapass.local-hardening-candidate/1", "sourceCommit": source,
            "sourceTreeClean": True, "publicPublication": False, "ga": False,
            "workbenchFiles": sum(f.is_file() for f in files), "files": records}
(output / "candidate.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
(output / "SHA256SUMS").write_text("".join(f"{f['sha256']}  {f['path']}\n" for f in records), encoding="utf-8")
print(json.dumps(manifest, indent=2))
