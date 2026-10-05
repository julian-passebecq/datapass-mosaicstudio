import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell
def _():
    import sys
    from pathlib import Path

    import marimo as mo

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import wind_reference_model as model

    return mo, model


@app.cell
def _(mo):
    k = mo.ui.slider(1.5, 3.0, step=0.1, value=2.0, label="Weibull shape k")
    mo.vstack([
        mo.md("## ILLUSTRATIVE wind AEP table\nGeneric 3 MW-class power curve, Weibull wind. **Not FOIL data, not a site assessment.**"),
        k,
    ])
    return (k,)


@app.cell
def _(k, mo, model):
    rows = model.table(k=k.value)
    mo.ui.table(rows)
    return (rows,)


@app.cell
def _(mo, model, rows):
    # Writes clients/python-wind-reference/public/artifacts/wind-aep-weibull.json + manifest.json
    artifact = model.build_artifact(rows)
    mo.md(f"Wrote artifact `{artifact['id']}` ({len(artifact['payload']['rows'])} rows). Open `?app=python-wind-reference`.")
    return


if __name__ == "__main__":
    app.run()
