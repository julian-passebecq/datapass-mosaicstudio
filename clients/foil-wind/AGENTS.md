Read README.md first. This repository is public and the producer repository is private: never commit producer output,
fixtures, code, field values, schema copies or hashes. The committed data is the hand-made placeholder only; real
exports are read at build time from a folder outside the repo and land in dist-clients/ (git-ignored). Keep every
producer field name inside py/foil_export_adapter.py. Python computes (adapter, SQL through sqlite3, comparison); the
page fetches and validates artifacts and never calculates. Keep the synthetic / proxy / no-validation labels. No 3D,
no workbench, no service. Run tests/foil-wind.test.mjs and the qa/ Playwright smoke before delivery.
