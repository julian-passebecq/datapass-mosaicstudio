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
from datapass_artifact import to_artifact, write_manifest  # noqa: E402

ARTIFACT_ID = "wind-aep-weibull"
RATED_KW = 3000.0
CUT_IN, RATED, CUT_OUT = 3.0, 12.0, 25.0
HOURS = 8760.0
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "clients" / "python-wind-reference" / "public" / "artifacts"
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


def build_artifact(rows: list[dict], out_dir: Path | None = DEFAULT_OUT, run_id: str | None = None) -> dict:
    artifact = to_artifact(
        rows, id=ARTIFACT_ID, row_key="id", provenance="computed", source=SOURCE, run_id=run_id,
        title="ILLUSTRATIVE annual energy vs mean wind speed (Weibull k=2)",
        labels={"id": "Case", "meanSpeed": "Mean wind speed", "weibullScale": "Weibull scale c",
                "aep": "Annual energy (gross)", "capacityFactor": "Capacity factor"},
        units={"meanSpeed": "m/s", "weibullScale": "m/s", "aep": "MWh/yr", "capacityFactor": "%"},
        representations=[
            {"id": "aep-8", "title": "AEP at 8 m/s mean", "kind": "metric", "row": "mean-8-0", "column": "aep", "unit": "MWh/yr", "digits": 0},
            {"id": "table", "title": "Weibull AEP table", "kind": "table"},
            {"id": "curve", "title": "AEP vs mean speed", "kind": "chart", "chart": "line", "x": "meanSpeed", "y": "aep", "unit": "MWh/yr"},
            {"id": "json", "title": "JSON", "kind": "json"},
        ],
        out_dir=out_dir,
    )
    if out_dir is not None:
        write_manifest(out_dir)
    return artifact


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    result = build_artifact(table(), out)
    print(f"Wrote {out / (ARTIFACT_ID + '.json')} ({len(result['payload']['rows'])} rows, ILLUSTRATIVE)")
