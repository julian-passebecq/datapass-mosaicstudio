"""Record a real line-by-line execution trace of a small Python snippet. Standard library only.

    python py/coding_lab_trace.py            # writes clients/animated-coding-lab/public/artifacts

The snippet (py/examples/normalize_rows.py) really runs under sys.settrace. Every completed line,
every call and every return of a function defined in that file becomes one row of a
`datapass.artifact` table: step, line number, the exact source text, the variables visible in the
frame AFTER the line ran, which names changed, and the returned value. Studio animates these rows;
it never runs Python and never invents a step. Values are ILLUSTRATIVE readings, not client data.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from datapass_artifact import cite, cite_lines, input_hash, to_artifact, write_manifest, write_sources  # noqa: E402

ARTIFACT_ID = "coding-lab-trace"
ROOT = Path(__file__).resolve().parents[1]
SNIPPET_PATH = "py/examples/normalize_rows.py"
DEFAULT_OUT = ROOT / "clients" / "animated-coding-lab" / "public" / "artifacts"
DEFAULT_SOURCES = DEFAULT_OUT.parent / "sources"
MAX_STEPS = 64  # Studio's motion budget; a longer program is refused instead of truncated.
_SCALARS = (bool, int, float, str, type(None))


def _visible(value: Any) -> bool:
    if isinstance(value, _SCALARS):
        return True
    return isinstance(value, (list, tuple)) and len(value) <= 32 and all(isinstance(v, _SCALARS) for v in value)


def _snapshot(namespace: dict[str, Any]) -> dict[str, Any]:
    """JSON-safe copy of the plain data names in a frame (functions, modules and dunders are skipped)."""
    return {name: (list(value) if isinstance(value, (list, tuple)) else value) for name, value in namespace.items()
            if not name.startswith("__") and _visible(value)}


def record_trace(path: Path) -> list[dict[str, Any]]:
    """Execute `path` under sys.settrace and return one dict per completed line / call / return."""
    filename = str(path.resolve())
    code = compile(path.read_text(encoding="utf-8"), filename, "exec")
    lines = path.read_text(encoding="utf-8").splitlines()
    steps: list[dict[str, Any]] = []
    pending: dict[int, int] = {}
    last: dict[int, dict[str, Any]] = {}

    def emit(frame: Any, line: int, event: str, returned: Any = None) -> None:
        now = _snapshot(frame.f_locals)
        before = last.get(id(frame), {})
        changed = [name for name in now if name not in before or before[name] != now[name]]
        last[id(frame)] = now
        steps.append({"line": line, "event": event, "scope": frame.f_code.co_name, "code": lines[line - 1].strip(),
                      "changed": changed, "vars": now, "returned": returned})

    def local(frame: Any, event: str, arg: Any):
        if event == "line":
            if id(frame) in pending:
                emit(frame, pending.pop(id(frame)), "line")
            pending[id(frame)] = frame.f_lineno
        elif event == "return":
            if id(frame) in pending:
                kind = "line" if frame.f_code.co_name == "<module>" else "return"
                emit(frame, pending.pop(id(frame)), kind, arg if kind == "return" else None)
            last.pop(id(frame), None)
        return local

    def tracer(frame: Any, event: str, arg: Any):
        if frame.f_code.co_filename != filename:
            return None
        if event == "call" and frame.f_code.co_name != "<module>":
            emit(frame, frame.f_code.co_firstlineno, "call")
        return local

    namespace: dict[str, Any] = {"__name__": "__coding_lab__"}
    previous = sys.gettrace()
    sys.settrace(tracer)
    try:
        exec(code, namespace)  # noqa: S102 - the repository's own approved snippet, never user input
    finally:
        sys.settrace(previous)
    if not steps or len(steps) > MAX_STEPS:
        raise ValueError(f"{len(steps)} trace steps; the lab accepts 1..{MAX_STEPS}")
    return steps


def trace_rows(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flatten to artifact rows (scalars only; structured values as compact JSON text)."""
    dump = lambda value: json.dumps(value, separators=(",", ":"), allow_nan=False)  # noqa: E731
    return [{"step": index, "line": s["line"], "event": s["event"], "scope": s["scope"], "code": s["code"],
             "changed": ",".join(s["changed"]), "vars": dump(s["vars"]),
             "returned": None if s["event"] != "return" else dump(s["returned"])}
            for index, s in enumerate(steps)]


def lineage(rows_value: str) -> tuple[dict, list[dict]]:
    producer = {"kind": "script", "name": "py/coding_lab_trace.py (sys.settrace recorder)", "evidence": [
        cite(record_trace, "Line tracer (sys.settrace)", ROOT),
        cite_lines(SNIPPET_PATH, r"^def normalize", "Traced function", ROOT),
    ]}
    inputs = [
        {"id": "rows", "label": "Input readings", "value": rows_value,
         "evidence": [cite_lines(SNIPPET_PATH, r"^rows =", "Input list", ROOT)]},
        {"id": "program", "label": "Traced program", "value": SNIPPET_PATH,
         "evidence": [cite_lines(SNIPPET_PATH, r"^for item in rows", "Loop over rows", ROOT),
                      cite_lines(SNIPPET_PATH, r"^mean =", "Aggregate", ROOT)]},
    ]
    return producer, inputs


def build_artifact(out_dir: Path | None = DEFAULT_OUT, sources_dir: Path | None = None) -> dict:
    steps = record_trace(ROOT / SNIPPET_PATH)
    rows_value = ", ".join(str(v) for v in next(s["vars"]["rows"] for s in steps if "rows" in s["vars"]))
    producer, inputs = lineage(rows_value)
    run_id = "trace-" + input_hash(inputs)[:12]  # deterministic: same program + inputs -> same run id
    columns = [
        {"id": "step", "label": "Step", "type": "number"},
        {"id": "line", "label": "Source line", "type": "number"},
        {"id": "event", "label": "Event", "type": "string"},
        {"id": "scope", "label": "Frame", "type": "string"},
        {"id": "code", "label": "Source text", "type": "string"},
        {"id": "changed", "label": "Changed names", "type": "string"},
        {"id": "vars", "label": "Variables after (JSON)", "type": "string"},
        {"id": "returned", "label": "Returned value (JSON)", "type": "string", "nullable": True},
    ]
    artifact = to_artifact(
        trace_rows(steps), id=ARTIFACT_ID, row_key="step", columns=columns, provenance="computed", run_id=run_id,
        title="Execution trace of normalize_rows.py (ILLUSTRATIVE readings)",
        source=(f"{SNIPPET_PATH} executed by py/coding_lab_trace.py under sys.settrace (CPython "
                f"{sys.version_info.major}.{sys.version_info.minor}). ILLUSTRATIVE readings, not client data."),
        representations=[{"id": "trace", "title": "Execution trace", "kind": "table", "inputs": ["rows", "program"]},
                         {"id": "json", "title": "JSON", "kind": "json"}],
        producer=producer, inputs=inputs, out_dir=out_dir,
    )
    if out_dir is not None:
        write_manifest(out_dir)
    if sources_dir is not None:
        write_sources(artifact, ROOT, sources_dir)
    return artifact


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    sources = DEFAULT_SOURCES if out == DEFAULT_OUT else out / "sources"
    result = build_artifact(out, sources_dir=sources)
    print(f"Wrote {out / (ARTIFACT_ID + '.json')} ({len(result['payload']['rows'])} trace steps, ILLUSTRATIVE)")
