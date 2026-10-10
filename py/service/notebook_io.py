"""Standard .ipynb exchange for the browser workbench, through the pinned `nbformat` package.

Pure functions, no execution: importing a notebook NEVER runs a cell. The mapping is explicit:

    .ipynb cell                                         workbench cell
    markdown (no attachments)                     <->   note
    code, kernel language python                  <->   jupyter   (trusted local Python, run explicitly)
    code with metadata.datapass.kind == "sql"     <->   sql       (DuckDB in the page)
      or a first line "%%sql"
    code with metadata.datapass.kind == "runtime-model" <-> python (allowlisted datapass.runtime/1 model)
    anything else (raw, other languages,          <->   inert     (original cell JSON kept verbatim, shown
      attachments, oversize source)                                read-only, exported back unchanged)

Outputs of imported code cells are returned separately as untrusted data for display; they are never
evaluated. Everything that is not carried over is listed in a loss report. A notebook that nbformat
cannot read or validate is rejected as a whole.
"""
from __future__ import annotations

import copy
import json
import re
from datetime import datetime, timezone
from typing import Any

import nbformat
from nbformat.validator import ValidationError

IMPORT_FORMAT = "datapass.ipynb-import"
MAX_NOTEBOOK_BYTES = 4 * 1024 * 1024
MAX_CELLS = 50
MAX_CODE = 20000
MAX_NOTE = 8000
MAX_TITLE = 120
MAX_INERT_JSON = 64 * 1024
MAX_OUTPUT_BYTES = 2 * 1024 * 1024
MAX_DEPS = 12
_WB_ID = re.compile(r"^[a-z][a-zA-Z0-9_-]{0,79}$")
_NB_ID = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
_TABLE = re.compile(r"^[a-z][a-z0-9_]{0,62}$")
_SHA = re.compile(r"^[0-9a-f]{64}$")
_RESERVED = {"constructor", "prototype", "__proto__"}
KINDS = ("sql", "jupyter", "note", "python", "inert")


class NotebookError(ValueError):
    """The notebook or the export request is refused; nothing was changed."""


def _source(cell: Any) -> str:
    src = cell.get("source", "")
    return "".join(src) if isinstance(src, list) else str(src)


def _title(text: str, fallback: str) -> str:
    for line in text.splitlines():
        line = line.strip().lstrip("#").strip().lstrip("-").strip()
        if line and not line.startswith("%%"):
            return line[:MAX_TITLE]
    return fallback


def _valid_id(value: Any) -> bool:
    return isinstance(value, str) and bool(_WB_ID.match(value)) and value not in _RESERVED


def read_notebook(text: str) -> Any:
    """nbformat read (upgrading v3 to v4) plus a strict schema validation. Raises NotebookError."""
    if not isinstance(text, str):
        raise NotebookError("The notebook must be text.")
    if len(text.encode("utf-8")) > MAX_NOTEBOOK_BYTES:
        raise NotebookError(f"The notebook is above {MAX_NOTEBOOK_BYTES // (1024 * 1024)} MB.")
    try:
        json.loads(text)
    except ValueError as error:
        raise NotebookError(f"The file is not valid JSON: {error.msg} (line {error.lineno}).") from None
    try:
        nb = nbformat.reads(text, as_version=4, capture_validation_error={})
    except Exception as error:  # nbformat raises several types for unreadable documents
        raise NotebookError(f"nbformat could not read the notebook: {str(error)[:300]}") from None
    try:
        nbformat.validate(nb)
    except ValidationError as error:
        raise NotebookError(f"The notebook does not validate against nbformat {nb.get('nbformat')}.{nb.get('nbformat_minor')}: {error.message[:300]}") from None
    return nb


def import_notebook(text: str) -> dict[str, Any]:
    nb = read_notebook(text)
    loss: list[dict[str, Any]] = []
    meta = nb.get("metadata", {}) or {}
    language = str(((meta.get("kernelspec") or {}).get("language")) or ((meta.get("language_info") or {}).get("name")) or "python").lower()
    dropped_meta = sorted(k for k in meta if k not in ("kernelspec", "language_info", "datapass"))
    if dropped_meta:
        loss.append({"cellId": None, "item": "notebook metadata", "detail": "Not kept: " + ", ".join(dropped_meta[:20])})
    cells_in = nb.get("cells", [])
    if len(cells_in) > MAX_CELLS:
        raise NotebookError(f"The notebook has {len(cells_in)} cells; the workbench accepts at most {MAX_CELLS}. Nothing was imported.")
    cells: list[dict[str, Any]] = []
    outputs: dict[str, list[Any]] = {}
    counts: dict[str, int] = {}
    results: dict[str, str] = {}
    used: set[str] = set()
    output_budget = MAX_OUTPUT_BYTES

    def new_id(preferred: Any, kind: str, index: int) -> str:
        candidates = [preferred] if _valid_id(preferred) else []
        if isinstance(preferred, str) and _NB_ID.match(preferred) and not _valid_id(preferred):
            candidates.append(("c-" + preferred)[:80])
        candidates.append(f"{kind}-{index + 1}")
        for c in candidates:
            if _valid_id(c) and c not in used:
                used.add(c)
                return c
        n = 2
        while f"{kind}-{index + 1}-{n}" in used:
            n += 1
        used.add(f"{kind}-{index + 1}-{n}")
        return f"{kind}-{index + 1}-{n}"

    def inert(cell: Any, index: int, reason: str) -> dict[str, Any]:
        original = json.dumps(cell, ensure_ascii=False, sort_keys=True)
        cid = new_id(cell.get("id"), "inert", index)
        if len(original) > MAX_INERT_JSON:
            loss.append({"cellId": cid, "item": "cell", "detail": f"{reason}; above {MAX_INERT_JSON // 1024} KB, so its outputs were dropped to keep it"})
            slim = {k: v for k, v in cell.items() if k not in ("outputs", "attachments")}
            if "outputs" in cell:
                slim["outputs"] = []
            original = json.dumps(slim, ensure_ascii=False, sort_keys=True)
            if len(original) > MAX_INERT_JSON:
                raise NotebookError(f"Cell {index + 1} is above {MAX_INERT_JSON // 1024} KB and cannot be kept inert. Nothing was imported.")
        loss.append({"cellId": cid, "item": "cell", "detail": reason + "; kept inert (not run, exported back unchanged)"})
        return {"id": cid, "kind": "inert", "title": _title(_source(cell), f"{cell.get('cell_type', 'cell')} cell")[:MAX_TITLE],
                "source": _source(cell)[:MAX_CODE], "original": original, "reason": reason[:200], "dependsOn": []}

    pending_deps: dict[str, list[Any]] = {}
    for index, cell in enumerate(cells_in):
        ctype = cell.get("cell_type")
        source = _source(cell)
        cmeta = cell.get("metadata", {}) or {}
        dp = cmeta.get("datapass") if isinstance(cmeta.get("datapass"), dict) else {}
        extra = sorted(k for k in cmeta if k != "datapass")
        if ctype == "markdown" and not cell.get("attachments") and len(source) <= MAX_NOTE:
            cid = new_id(dp.get("cellId", cell.get("id")), "note", index)
            cells.append({"id": cid, "kind": "note", "title": _title(source, "Note"), "text": source, "dependsOn": []})
        elif ctype == "code":
            kind = dp.get("kind")
            first = source.lstrip().split("\n", 1)[0].strip() if source.strip() else ""
            is_sql = kind == "sql" or first == "%%sql"
            if kind == "runtime-model" and _valid_id(dp.get("model")) and isinstance(dp.get("inputs"), dict):
                cid = new_id(dp.get("cellId", cell.get("id")), "python", index)
                inputs = {k: v for k, v in dp["inputs"].items() if _valid_id(k) and (isinstance(v, bool) or isinstance(v, (int, float)) and v == v and abs(v) != float("inf") or isinstance(v, str) and len(v) <= 400)}
                entry = {"id": cid, "kind": "python", "title": str(dp.get("title") or "Python model run")[:MAX_TITLE], "model": dp["model"], "inputs": dict(list(inputs.items())[:24]), "dependsOn": []}
                if isinstance(dp.get("outputTable"), str) and _TABLE.match(dp["outputTable"]):
                    entry["outputTable"] = dp["outputTable"]
            elif is_sql:
                sql = source.lstrip().split("\n", 1)[1] if first == "%%sql" and "\n" in source.lstrip() else ("" if first == "%%sql" else source)
                if len(sql) > MAX_CODE:
                    cells.append(inert(cell, index, "SQL above 20,000 characters"))
                    continue
                cid = new_id(dp.get("cellId", cell.get("id")), "sql", index)
                entry = {"id": cid, "kind": "sql", "title": str(dp.get("title") or _title(sql, "SQL query"))[:MAX_TITLE], "sql": sql, "dependsOn": []}
                chart = dp.get("chart")
                if isinstance(chart, dict) and chart.get("kind") in ("bar", "line", "scatter") and isinstance(chart.get("x"), str) and isinstance(chart.get("y"), str) and len(chart["x"]) <= 200 and len(chart["y"]) <= 200:
                    entry["chart"] = {"kind": chart["kind"], "x": chart["x"], "y": chart["y"]}
            elif language != "python":
                cells.append(inert(cell, index, f"code in kernel language '{language[:40]}' is not run by the workbench"))
                continue
            elif len(source) > MAX_CODE:
                cells.append(inert(cell, index, "Python source above 20,000 characters"))
                continue
            else:
                cid = new_id(dp.get("cellId", cell.get("id")), "jupyter", index)
                entry = {"id": cid, "kind": "jupyter", "title": str(dp.get("title") or _title(source, "Python cell"))[:MAX_TITLE], "code": source, "dependsOn": []}
                if isinstance(dp.get("outputTable"), str) and _TABLE.match(dp["outputTable"]):
                    entry["outputTable"] = dp["outputTable"]
            cells.append(entry)
            pending_deps[cid] = dp.get("dependsOn") if isinstance(dp.get("dependsOn"), list) else []
            if isinstance(dp.get("resultSha256"), str) and _SHA.match(dp["resultSha256"]):
                results[cid] = dp["resultSha256"]
            outs = cell.get("outputs") or []
            if outs and entry["kind"] == "jupyter":
                size = len(json.dumps(outs, ensure_ascii=False))
                if size <= output_budget:
                    outputs[cid] = copy.deepcopy(outs)
                    output_budget -= size
                else:
                    loss.append({"cellId": cid, "item": "outputs", "detail": f"{len(outs)} output(s) dropped: above the {MAX_OUTPUT_BYTES // (1024 * 1024)} MB imported-output budget"})
            elif outs:
                loss.append({"cellId": cid, "item": "outputs", "detail": f"{len(outs)} output(s) not kept: this cell kind recomputes its result in the workbench"})
            if isinstance(cell.get("execution_count"), int):
                counts[cid] = cell["execution_count"]
            if extra:
                loss.append({"cellId": cid, "item": "cell metadata", "detail": "Not kept: " + ", ".join(extra[:20])})
            continue
        else:
            reason = "raw cell" if ctype == "raw" else "markdown with attachments" if ctype == "markdown" and cell.get("attachments") else "markdown above 8,000 characters" if ctype == "markdown" else f"unsupported cell type {str(ctype)[:40]}"
            cells.append(inert(cell, index, reason))
            continue
        if extra:
            loss.append({"cellId": cells[-1]["id"], "item": "cell metadata", "detail": "Not kept: " + ", ".join(extra[:20])})

    ids = {c["id"] for c in cells}
    runnable = {c["id"] for c in cells if c["kind"] in ("sql", "jupyter", "python")}
    for c in cells:
        deps = pending_deps.get(c["id"], [])
        kept = []
        for d in deps[:MAX_DEPS]:
            if isinstance(d, str) and d in runnable and d != c["id"] and d not in kept:
                kept.append(d)
            else:
                loss.append({"cellId": c["id"], "item": "dependency", "detail": f"Dependency {str(d)[:80]!r} dropped: {'not a runnable cell of this notebook' if d not in ids else 'not runnable'}"})
        c["dependsOn"] = kept
    if _has_cycle(cells):
        for c in cells:
            c["dependsOn"] = []
        loss.append({"cellId": None, "item": "dependency", "detail": "The declared dependencies form a cycle; all dependencies were dropped."})
    return {"format": IMPORT_FORMAT, "version": 1, "nbformat": f"{nb.get('nbformat')}.{nb.get('nbformat_minor')}",
            "language": language[:40], "cells": cells, "outputs": outputs, "executionCounts": counts, "results": results, "loss": loss}


def _has_cycle(cells: list[dict[str, Any]]) -> bool:
    deps = {c["id"]: c["dependsOn"] for c in cells}
    state: dict[str, int] = {}

    def visit(i: str) -> bool:
        if state.get(i) == 2:
            return False
        if state.get(i) == 1:
            return True
        state[i] = 1
        if any(visit(d) for d in deps.get(i, [])):
            return True
        state[i] = 2
        return False
    return any(visit(c["id"]) for c in cells)


def _str(v: Any, label: str, max_len: int, required: bool = True) -> str:
    if not isinstance(v, str) or len(v) > max_len or (required and not v.strip()):
        raise NotebookError(f"{label}: invalid text")
    return v


def export_notebook(payload: Any) -> str:
    """Build a standard nbformat v4 notebook from workbench cells; validated by nbformat before it is returned."""
    if not isinstance(payload, dict) or set(payload) - {"cells", "outputs", "executionCounts", "results"}:
        raise NotebookError("export: expected {cells, outputs, executionCounts, results}")
    cells_in = payload.get("cells")
    if not isinstance(cells_in, list) or len(cells_in) > MAX_CELLS:
        raise NotebookError("export: cell budget")
    outputs = payload.get("outputs") or {}
    counts = payload.get("executionCounts") or {}
    results = payload.get("results") or {}
    if not all(isinstance(x, dict) for x in (outputs, counts, results)):
        raise NotebookError("export: outputs, executionCounts and results must be objects")
    if len(json.dumps(outputs, ensure_ascii=False)) > MAX_OUTPUT_BYTES:
        raise NotebookError(f"export: outputs above {MAX_OUTPUT_BYTES // (1024 * 1024)} MB")
    nb = nbformat.v4.new_notebook()
    nb.metadata = {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
                   "language_info": {"name": "python"},
                   "datapass": {"format": "datapass.notebook", "version": 1,
                                "exportedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")}}
    seen: set[str] = set()
    for raw in cells_in:
        if not isinstance(raw, dict) or raw.get("kind") not in KINDS:
            raise NotebookError("export: unknown cell kind")
        cid = raw.get("id")
        if not _valid_id(cid) or cid in seen:
            raise NotebookError("export: invalid or duplicate cell id")
        seen.add(cid)
        title = _str(raw.get("title"), "cell title", MAX_TITLE)
        deps = raw.get("dependsOn", [])
        if not isinstance(deps, list) or len(deps) > MAX_DEPS or not all(_valid_id(d) for d in deps):
            raise NotebookError(f"export: cell {cid} dependencies")
        nb_id = cid if _NB_ID.match(cid) else None
        dp: dict[str, Any] = {"cellId": cid, "title": title, "dependsOn": list(deps)}
        sha = results.get(cid)
        if sha is not None:
            if not isinstance(sha, str) or not _SHA.match(sha):
                raise NotebookError(f"export: cell {cid} result hash")
            dp["resultSha256"] = sha
        kind = raw["kind"]
        if kind == "note":
            cell = nbformat.v4.new_markdown_cell(_str(raw.get("text"), "note text", MAX_NOTE, False))
        elif kind == "sql":
            dp["kind"] = "sql"
            chart = raw.get("chart")
            if chart is not None:
                if not isinstance(chart, dict) or chart.get("kind") not in ("bar", "line", "scatter"):
                    raise NotebookError(f"export: cell {cid} chart")
                dp["chart"] = {"kind": chart["kind"], "x": _str(chart.get("x"), "chart x", 200), "y": _str(chart.get("y"), "chart y", 200)}
            cell = nbformat.v4.new_code_cell("%%sql\n" + _str(raw.get("sql"), "sql", MAX_CODE, False))
        elif kind == "jupyter":
            dp["kind"] = "python"
            if raw.get("outputTable") is not None:
                if not isinstance(raw["outputTable"], str) or not _TABLE.match(raw["outputTable"]):
                    raise NotebookError(f"export: cell {cid} output table")
                dp["outputTable"] = raw["outputTable"]
            outs = outputs.get(cid, [])
            if not isinstance(outs, list):
                raise NotebookError(f"export: cell {cid} outputs")
            count = counts.get(cid)
            try:
                cell = nbformat.v4.new_code_cell(_str(raw.get("code"), "python code", MAX_CODE, False),
                                                 outputs=[nbformat.from_dict(o) for o in outs],
                                                 execution_count=count if isinstance(count, int) and count >= 0 else None)
            except ValidationError as error:
                raise NotebookError(f"export: cell {cid} outputs do not validate: {error.message[:300]}") from None
        elif kind == "python":
            model = raw.get("model")
            inputs = raw.get("inputs")
            if not _valid_id(model) or not isinstance(inputs, dict):
                raise NotebookError(f"export: cell {cid} model")
            dp.update({"kind": "runtime-model", "model": model, "inputs": inputs})
            if raw.get("outputTable") is not None:
                dp["outputTable"] = raw["outputTable"]
            text = (f"# DataPass allowlisted runtime model (datapass.runtime/1), not Python code.\n"
                    f"# model: {model}\n# inputs: {json.dumps(inputs, sort_keys=True)}\n")
            cell = nbformat.v4.new_code_cell(text)
        else:  # inert: the original cell, verbatim
            original = _str(raw.get("original"), "inert original", MAX_INERT_JSON)
            try:
                cell = nbformat.from_dict(json.loads(original))
            except ValueError:
                raise NotebookError(f"export: cell {cid} original is not JSON") from None
            if not isinstance(cell.get("id"), str) or not _NB_ID.match(cell["id"]):
                cell["id"] = nb_id or f"inert-{len(nb.cells) + 1}"  # nbformat 4.5 requires ids (4.4 originals have none)
            nb.cells.append(cell)
            continue
        if nb_id:
            cell["id"] = nb_id
        cell.metadata["datapass"] = dp
        nb.cells.append(cell)
    try:
        nbformat.validate(nb)
    except ValidationError as error:
        raise NotebookError(f"export: the notebook does not validate: {error.message[:300]}") from None
    return nbformat.writes(nb)
