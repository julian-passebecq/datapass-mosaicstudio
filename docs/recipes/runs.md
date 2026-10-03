# Captured runs and multiple result views

Start from `npm run client:new -- example --family analytics --foundation`, or add a `runs` block and a source-owned `resources.runs[id]` to an existing client. This is not another family or a notebook engine.

Declare a RunResource containing RunSpec profiles for existing task IDs. The profile names the declared model/version/provider and result representations; SiteRuntime still owns execution, timeout, cancellation and dependency invalidation. A profile is metadata, not proof that a remote provider or environment exists.

The optional RunScope observes real task lifecycle events for the lifetime of a StudioSite. History survives page switches within the app, not reload/closing the page. Defaults: 20 records, 4 MiB. Limits/evictions and omitted outputs are visible. History is not put in saved UI inputs. Exports containing parameters AND result data are separate, deliberate actions.

A run contains exact declared inputs, local upstream dataset revisions, task outcome, timestamps/monotonic duration and one retained artifact when it fits the budget. Local revisions are not content hashes or reproducibility guarantees. If observation stops before completion, the record is unobserved, not falsely cancelled or completed. A failed/stale/cancelled run never inherits an earlier successful artifact.

Artifact representations reuse existing table/chart/metric/text/JSON blocks. Changing representation or selecting an older run does not execute the model again. Compare only matching declared app/task/model/provider versions; numerical metric differences require compatible columns, selectors and units. Missing values remain unavailable, not zero. No automatic unit conversion or model-validity claim is made.

A ViewProfile chooses representations only. It does NOT remove hidden rows or secure a public bundle. Static site content and run exports must be reviewed before sharing. No credential, source callback or arbitrary HTML is accepted by inert artifact/run JSON.

Read `docs/FOUNDATION_KIT.md` for semantic navigation, static knowledge, context and custom composition. Pure contracts are in `src/framework/foundation/index.ts`; UI imports are explicit from `foundation/react.ts`. For custom ArtifactView components declare `charts` when showing a chart. The built-in runs block derives chart capability from its profiles automatically.
