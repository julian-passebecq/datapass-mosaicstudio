# Release notes

## Unreleased (after 0.10.0)

- **F07 Saved run references (opt-in).** `AppDefinition.runHistory[resource]` lets a client supply approved storage for run references (`datapass.run-history` v1, `datapass.run-ref` v1). References only: no result rows, artifact payloads, task messages or secrets. Restored references are labelled "Restored reference, not rerun, result not kept"; a run in flight at reload is restored as "Outcome not observed (page reloaded)". Unknown versions and incompatible snapshots are refused whole and kept aside under `<key>.rejected`; an explicit reset removes the saved key. Default off: only `foundation-reference` opts in. See `docs/recipes/runs.md`.
- **Workbench run references after reload.** A saved notebook run reference that was queued or running when the page closed is displayed as "not observed since reload" instead of its stale status. `datapass.workspace` stays v1; the stored value is unchanged.
