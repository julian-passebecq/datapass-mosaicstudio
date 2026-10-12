# Captured runs and multiple result views

Start from `npm run client:new -- example --family analytics --foundation`, or add a `runs` block and a source-owned `resources.runs[id]` to an existing client. This is not another family or a notebook engine.

Declare a RunResource containing RunSpec profiles for existing task IDs. The profile names the declared model/version/provider and result representations; SiteRuntime still owns execution, timeout, cancellation and dependency invalidation. A profile is metadata, not proof that a remote provider or environment exists.

The optional RunScope observes real task lifecycle events for the lifetime of a StudioSite. History survives page switches within the app, not reload/closing the page, unless the client opts in to saved run references (below). Defaults: 20 records, 4 MiB. Limits/evictions and omitted outputs are visible. History is not put in saved UI inputs. Exports containing parameters AND result data are separate, deliberate actions.

A run contains exact declared inputs, local upstream dataset revisions, task outcome, timestamps/monotonic duration and one retained artifact when it fits the budget. Local revisions are not content hashes or reproducibility guarantees. If observation stops before completion, the record is unobserved, not falsely cancelled or completed. A failed/stale/cancelled run never inherits an earlier successful artifact.

Artifact representations reuse existing table/chart/metric/text/JSON blocks. Changing representation or selecting an older run does not execute the model again. Compare only matching declared app/task/model/provider versions; numerical metric differences require compatible columns, selectors and units. Missing values remain unavailable, not zero. No automatic unit conversion or model-validity claim is made.

A ViewProfile chooses representations only. It does NOT remove hidden rows or secure a public bundle. Static site content and run exports must be reviewed before sharing. No credential, source callback or arbitrary HTML is accepted by inert artifact/run JSON.

Read `docs/FOUNDATION_KIT.md` for semantic navigation, static knowledge, context and custom composition. Pure contracts are in `src/framework/foundation/index.ts`; UI imports are explicit from `foundation/react.ts`. For custom ArtifactView components declare `charts` when showing a chart. The built-in runs block derives chart capability from its profiles automatically.

## Optional: saved run references across reload (`runHistory`, opt-in)

By default history stays in memory. A client can opt in per run resource with trusted source code, never imported JSON:

```ts
const store:RunHistoryStore={getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v),removeItem:k=>localStorage.removeItem(k)};
defineApp({manifest,bindings,resources:{runs:{experiments:runResource}},runHistory:{experiments:{store,maxRefs:12}}});
```

- **References only.** Each saved `datapass.run-ref` v1 holds the run id, task id, app id/version, declared model/provider, captured input values, local dataset revisions, observed outcome, timestamps and an artifact id with its representation ids. Result rows, artifact payloads, task messages, source functions and secrets are never saved. Captured input values can still be sensitive: only opt in where the client approved that storage.
- **Restored means not rerun.** After a reload, references appear in a separate "Restored after reload" group with the badge "Restored reference, not rerun, result not kept". They have no result view, no comparison and no export. Nothing is executed when they load; run the task again explicitly for a new result.
- **Not observed is not success.** A run still running when the page closed is saved as `unobserved` and shown as "Outcome not observed (page reloaded)", never as completed or cancelled.
- **Format and refusal.** Envelope `datapass.run-history` v1 at key `datapass.run-history.<appId>.<resource>`. Only v1 is accepted. A newer or unknown version, another app id/version or resource, a task the app no longer observes, a different declared model/provider profile, or any invalid entry refuses the whole snapshot (no partial load). The raw value is copied to `<key>.rejected` (the copy is read back) and only then removed from the main key; a notice is shown and live history keeps working. Refused bytes are never overwritten or deleted by the framework: if storage refuses or cannot confirm that copy, or an earlier refused value already occupies `<key>.rejected`, the new one stays under the main key, saving is suspended for the session (no writes to that key, also after a remount) and the notice says so. A future v2 needs an explicit migrator; there is no silent upgrade.
- **Limits and reset.** At most `maxRefs` (default 20, max 100) newest references are saved; restored references share the journal record limit and are evicted first. "Reset saved run history" (Record tab) is the only way the main key is cleared: it removes the saved references (or a refused value left in place, which also resumes saving) and the restored references; it keeps `.rejected`, which the client or user clears deliberately. Runs already shown in that tab stay until reload but are no longer saved. If storage is unavailable, a notice says history stays in memory.

The default workbench and the other reference clients do not opt in. `foundation-reference` is the consumer that proves it.
