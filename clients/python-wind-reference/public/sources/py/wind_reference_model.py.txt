"""ILLUSTRATIVE wind-energy table for the Python bridge proof. Standard library only.

Generic, made-up 3 MW-class power curve and textbook Weibull wind statistics.
Not FOIL data, not a real turbine, not a site assessment.

    python py/wind_reference_model.py            # writes the Studio artifact
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from datapass_artifact import cite, cite_lines, to_artifact, write_manifest, write_sources  # noqa: E402

ARTIFACT_ID = "wind-aep-weibull"
RATED_KW = 3000.0
CUT_IN, RATED, CUT_OUT = 3.0, 12.0, 25.0
HOURS = 8760.0
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "clients" / "python-wind-reference" / "public" / "artifacts"
DEFAULT_SOURCES = DEFAULT_OUT.parent / "sources"
MODEL_PATH = "py/wind_reference_model.py"
SOURCE = ("py/wind_reference_model.py (run as a script, from Jupyter or from marimo). ILLUSTRATIVE: generic 3 MW-class "
          "power curve, Rayleigh-like Weibull k=2, no losses. Not FOIL data, not a site assessment.")


def power_kw(v: float) -> float:
    """Generic power curve: cubic ramp from cut-in to rated, flat to cut-out."""
    if v < CUT_IN or v >= CUT_OUT:
        return 0.0
    if v >= RATED:
        return RATED_KW
    return RATED_KW * (v ** 3 - CUT_IN ** 3) / (RATED ** 3 - CUT_IN ** 3)


def weibull_pdf(v: float, k: float, c: float) -> float:
    if v <= 0:
        return 0.0
    return (k / c) * (v / c) ** (k - 1) * math.exp(-((v / c) ** k))


def scale_for_mean(mean: float, k: float) -> float:
    return mean / math.gamma(1 + 1 / k)


def annual_energy_mwh(mean: float, k: float = 2.0, step: float = 0.01) -> float:
    """Trapezoid integral of power x Weibull density over 0..30 m/s, times 8760 h."""
    c = scale_for_mean(mean, k)
    n = int(30 / step)
    total = 0.0
    for i in range(n):
        a, b = i * step, (i + 1) * step
        total += 0.5 * step * (power_kw(a) * weibull_pdf(a, k, c) + power_kw(b) * weibull_pdf(b, k, c))
    return total * HOURS / 1000.0


def table(k: float = 2.0, means: tuple[float, ...] = tuple(5 + 0.5 * i for i in range(11))) -> list[dict]:
    rows = []
    for mean in means:
        aep = annual_energy_mwh(mean, k)
        rows.append({
            "id": "mean-" + f"{mean:.1f}".replace(".", "-"),
            "meanSpeed": round(mean, 2),
            "weibullScale": round(scale_for_mean(mean, k), 3),
            "aep": round(aep, 1),
            "capacityFactor": round(100 * aep / (RATED_KW * HOURS / 1000.0), 2),
        })
    return rows


def lineage(k: float = 2.0) -> tuple[dict, list[dict]]:
    """Producer and declared inputs, each citing the exact lines of this file (deterministic)."""
    producer = {"kind": "script", "name": MODEL_PATH, "evidence": [
        cite(annual_energy_mwh, "Trapezoid AEP integral", ROOT),
        cite(table, "Table of cases", ROOT),
    ]}
    inputs = [
        {"id": "k", "label": "Weibull shape k", "value": k, "evidence": [cite(weibull_pdf, "Weibull density", ROOT)]},
        {"id": "ratedPower", "label": "Rated power", "value": RATED_KW, "unit": "kW",
         "evidence": [cite_lines(MODEL_PATH, r"^RATED_KW =", "Rated power constant", ROOT), cite(power_kw, "Generic power curve", ROOT)]},
        {"id": "speeds", "label": "Cut-in / rated / cut-out", "value": f"{CUT_IN:g} / {RATED:g} / {CUT_OUT:g}", "unit": "m/s",
         "evidence": [cite_lines(MODEL_PATH, r"^CUT_IN, RATED, CUT_OUT =", "Power curve speeds", ROOT)]},
        {"id": "hours", "label": "Hours per year", "value": HOURS, "unit": "h",
         "evidence": [cite_lines(MODEL_PATH, r"^HOURS =", "Hours per year", ROOT)]},
        {"id": "means", "label": "Mean wind speeds", "value": "5.0 .. 10.0 step 0.5", "unit": "m/s",
         "evidence": [cite(scale_for_mean, "Weibull scale from mean", ROOT)]},
    ]
    return producer, inputs


def build_artifact(rows: list[dict], out_dir: Path | None = DEFAULT_OUT, run_id: str | None = None,
                   sources_dir: Path | None = None) -> dict:
    producer, inputs = lineage()
    artifact = to_artifact(
        rows, id=ARTIFACT_ID, row_key="id", provenance="computed", source=SOURCE, run_id=run_id,
        title="ILLUSTRATIVE annual energy vs mean wind speed (Weibull k=2)",
        labels={"id": "Case", "meanSpeed": "Mean wind speed", "weibullScale": "Weibull scale c",
                "aep": "Annual energy (gross)", "capacityFactor": "Capacity factor"},
        units={"meanSpeed": "m/s", "weibullScale": "m/s", "aep": "MWh/yr", "capacityFactor": "%"},
        representations=[
            {"id": "aep-8", "title": "AEP at 8 m/s mean", "kind": "metric", "row": "mean-8-0", "column": "aep", "unit": "MWh/yr", "digits": 0,
             "inputs": ["k", "ratedPower", "speeds", "hours"]},
            {"id": "cf-8", "title": "Capacity factor at 8 m/s mean", "kind": "metric", "row": "mean-8-0", "column": "capacityFactor", "unit": "%", "digits": 1,
             "inputs": ["k", "ratedPower", "speeds", "hours"]},
            {"id": "table", "title": "Weibull AEP table", "kind": "table"},
            {"id": "curve", "title": "AEP vs mean speed", "kind": "chart", "chart": "line", "x": "meanSpeed", "y": "aep", "unit": "MWh/yr",
             "inputs": ["k", "ratedPower", "speeds", "hours", "means"]},
            {"id": "json", "title": "JSON", "kind": "json"},
        ],
        producer=producer, inputs=inputs,
        out_dir=out_dir,
    )
    if out_dir is not None:
        write_manifest(out_dir)
    if sources_dir is not None:
        write_sources(artifact, ROOT, sources_dir)
    return artifact


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    sources = DEFAULT_SOURCES if out == DEFAULT_OUT else out / "sources"
    result = build_artifact(table(), out, sources_dir=sources)
    print(f"Wrote {out / (ARTIFACT_ID + '.json')} ({len(result['payload']['rows'])} rows, ILLUSTRATIVE)")
