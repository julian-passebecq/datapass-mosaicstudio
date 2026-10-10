"""Start YOUR installed Jupyter Server for the DataPass browser workbench, loopback only.

OPTIONAL and trusted-local: a Jupyter kernel runs Python with your user privileges. Loopback and a
temporary folder are not a sandbox. Nothing in the workbench launches this; you run it yourself:

    python -m pip install -r py/service/requirements-jupyter.txt      # into a venv you own
    python py/service/jupyter_local.py --port 28888 --workbench-origin http://127.0.0.1:5173

Then paste the printed URL and token into the workbench (Notebook > Jupyter kernel > Pair).

What this sets on the stock `jupyter_server` (no new executor, no patched server):
- binds 127.0.0.1 only, `allow_remote_access=False` (non-loopback Host headers are refused);
- `allow_origin` = the exact workbench origin, and an identity provider that keeps the Origin check
  on for token-authenticated requests and the kernel websocket (jupyter_strict_origin.py);
- token authentication on, the token passed through the JUPYTER_TOKEN environment variable (not
  the command line), terminals off, no browser opened;
- Jupyter's own runtime files (jpserver-<pid>.json, owner-only, contain the token while it runs)
  go to a temporary folder that this launcher removes on a normal exit.
DataPass never saves the token: not in the workspace, result store, exports, URLs or logs.
"""
from __future__ import annotations

import argparse
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
TOKEN_ENV = "DATAPASS_JUPYTER_TOKEN"
_TOKEN = re.compile(r"^[A-Za-z0-9_-]{16,256}$")
_ORIGIN = re.compile(r"^http://(127\.0\.0\.1|localhost):\d{1,5}$")


def resolve_token(explicit: str | None = None) -> str:
    chosen = explicit or os.environ.get(TOKEN_ENV)
    if chosen is None:
        return secrets.token_hex(24)
    if not _TOKEN.match(chosen):
        raise SystemExit(f"{TOKEN_ENV} must be 16-256 characters of A-Z, a-z, 0-9, '_' or '-'")
    return chosen


def check_origin(origin: str) -> str:
    parts = urlsplit(origin)
    if not _ORIGIN.match(origin) or parts.path or parts.query or parts.fragment:
        raise SystemExit(f"--workbench-origin must be an exact loopback origin such as http://127.0.0.1:5173, not {origin!r}")
    return origin


def server_args(port: int, workbench_origin: str, root_dir: Path) -> list[str]:
    """The jupyter_server command line. The token is NOT here: it travels in JUPYTER_TOKEN."""
    return [
        sys.executable, "-m", "jupyter_server",
        "--ServerApp.ip=127.0.0.1",
        f"--ServerApp.port={port}",
        "--ServerApp.port_retries=0",
        "--ServerApp.open_browser=False",
        "--ServerApp.allow_remote_access=False",
        f"--ServerApp.allow_origin={workbench_origin}",
        "--ServerApp.identity_provider_class=jupyter_strict_origin.StrictOriginIdentityProvider",
        "--ServerApp.terminals_enabled=False",
        f"--ServerApp.root_dir={root_dir}",
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Start your installed Jupyter Server for the DataPass workbench (loopback only)")
    parser.add_argument("--port", type=int, default=28888)
    parser.add_argument("--workbench-origin", default="http://127.0.0.1:5173")
    parser.add_argument("--root-dir", default=None, help="kernel working folder (default: a new temporary folder)")
    parser.add_argument("--no-print-token", action="store_true", help="do not print the token (when you supplied it via DATAPASS_JUPYTER_TOKEN)")
    args = parser.parse_args(argv)
    if not 1024 < args.port < 65536:
        raise SystemExit("--port must be between 1025 and 65535")
    origin = check_origin(args.workbench_origin)
    token = resolve_token()
    owned_root = args.root_dir is None
    root = Path(tempfile.mkdtemp(prefix="datapass-kernel-")) if owned_root else Path(args.root_dir).resolve()
    runtime_dir = Path(tempfile.mkdtemp(prefix="datapass-jupyter-runtime-"))
    env = dict(os.environ)
    env.pop(TOKEN_ENV, None)
    env["JUPYTER_TOKEN"] = token
    env["JUPYTER_RUNTIME_DIR"] = str(runtime_dir)
    env["PYTHONPATH"] = os.pathsep.join([str(HERE), *([env["PYTHONPATH"]] if env.get("PYTHONPATH") else [])])
    print(f"DataPass: starting your Jupyter Server at http://127.0.0.1:{args.port} for the workbench at {origin} (kernel folder {root}).",
          file=sys.stderr, flush=True)
    if args.no_print_token:
        print("DataPass: pair with the token you supplied.", file=sys.stderr, flush=True)
    else:
        print(f"DataPass: paste into the workbench -> URL http://127.0.0.1:{args.port}  token {token}", file=sys.stderr, flush=True)
    child = subprocess.Popen(server_args(args.port, origin, root), env=env)

    def stop_on_term(_signum, _frame):
        # SIGTERM to this launcher stops the server it started instead of orphaning it.
        raise KeyboardInterrupt

    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, stop_on_term)
    try:
        return child.wait()
    except KeyboardInterrupt:
        child.terminate()
        try:
            return child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            return child.wait()
    finally:
        shutil.rmtree(runtime_dir, ignore_errors=True)
        if owned_root:
            shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
