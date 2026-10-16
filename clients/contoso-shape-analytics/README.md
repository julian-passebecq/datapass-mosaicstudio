# Contoso-shape analytics (SYNTHETIC, prototype)

F212 consumer 1 of the V2 product loop. Price and cost scenarios over the SYNTHETIC Contoso-shape artifact
`orchard-monthly-yield` (`data/contoso-shape.synthetic.artifact.json`, a byte copy of
`tests/fixtures/interop/contoso-shape.synthetic.artifact.json`; a test checks the bytes). Invented data: not Contoso
business data, not a forecast, not validated.

## The loop

1. Start the approved local producer, with a result store outside Git:
   `python clients/contoso-shape-analytics/py/serve.py --port 24811 --results-dir <folder outside Git>`
   It is the unchanged runtime of `py/service/app.py` (token, CORS, run store, result store) with one more allowlisted
   model, `contoso-shape-scenario`. It prints the pairing link.
2. Build and preview the site: `npm run build:client -- contoso-shape-analytics`, then
   `STUDIO_CLIENT=contoso-shape-analytics npx vite preview --config vite.client.config.ts --strictPort --port 21491`
   (the CSP allows exactly `http://127.0.0.1:24811`). Start the producer with
   `DATAPASS_SERVICE_ORIGINS=http://127.0.0.1:21491`.
3. Open the printed link, press Connect (the token stays in this tab only), set the price and cost changes, run, inspect
   the table, chart, metrics and JSON (a view change never reruns), save the run, save a second one, compare A/B, export
   the provenance bundle after the sharing review. Closing the browser and restarting the producer keeps the saved
   results: Reopen shows them by hash, "Not recomputed".

`npm run test:product-loop` runs this journey (and the foil-wind one) and writes `qa/V2-LOOP/receipts.json`.

Check with `npm run client:check -- contoso-shape-analytics`. The default production workbench build includes reference
clients only; this prototype is built only on request and never published automatically.
