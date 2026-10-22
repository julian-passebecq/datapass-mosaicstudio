"""Verify candidate hashes, then unpack its own SDK/workbench into a new review directory."""
import hashlib
import json
import pathlib
import subprocess
import sys
import tarfile
import zipfile

candidate, review = (pathlib.Path(arg).resolve() for arg in sys.argv[1:])
manifest = json.loads((candidate / "candidate.json").read_text(encoding="utf-8"))
for item in manifest["files"]:
    file = (candidate / item["path"]).resolve()
    assert file.is_relative_to(candidate)
    data = file.read_bytes()
    assert len(data) == item["bytes"] and hashlib.sha256(data).hexdigest() == item["sha256"], item["path"]
review.mkdir(parents=True, exist_ok=False)
with tarfile.open(candidate / "dist-sdk/datapass-mosaicstudio-sdk-0.13.0.tar.gz", "r:gz") as archive:
    archive.extractall(review, filter="data")
sdk = review / "datapass-mosaicstudio-sdk-0.13.0"
subprocess.run(["node", str(sdk / "scripts/sdk-verify.mjs"), str(candidate / "dist-sdk")], check=True)
subprocess.run(["node", str(sdk / "scripts/runtime-verify.mjs"), str(candidate / "dist-runtime"), "--no-start"], check=True)
with zipfile.ZipFile(candidate / "datapass-mosaicstudio-workbench-0.13.0-hardening.zip") as archive:
    archive.extractall(review / "workbench")
print(json.dumps({"filesVerified": len(manifest["files"]), "sourceCommit": manifest["sourceCommit"],
                  "shippedSdkVerifier": "PASS", "shippedRuntimeVerifierStatic": "PASS",
                  "workbenchFiles": sum(f.is_file() for f in (review / "workbench").rglob("*"))}, indent=2))
