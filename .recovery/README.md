# Interrupted pass recovery — 2026-10-02

Base branch head at interruption: `b1546c04413b71a574c84870960c9842f3c19c3d`.

Two binary Git objects were created immediately before the session failed and were not attached to a tree/commit. This recovery branch makes them reachable so they are not garbage-collected:

- `interrupted-pass-20261002-part1.bin` — original blob `8da37192da2a17145c5b651540958c517759ed6a`, 8000 bytes.
- `interrupted-pass-20261002-part2.bin` — original blob `13a36ab0a36887fb27bec83f8e68e3f8058714c7`, 8000 bytes.

The interrupted pass had reported 266 unit tests passing and work around a read-only project viewer, source/notebook/document presentation, D3 explanatory animation, publication/projection and optional worker-side computation. Those changes were not committed to the feature branch before interruption, so this branch is a preservation checkpoint, not a qualified implementation.

Do not merge these opaque `.bin` files. Recover/inspect them first, reconstruct source changes from the session evidence as needed, then create a normal source commit and run the full browser/build gate.
