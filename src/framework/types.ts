/** Source SDK v0.2. The manifest is inert; executable bindings remain trusted source. */
export type Scalar = string | number | boolean | null;
export type Values = Readonly<Record<string, Scalar>>;
export type Row = Readonly<Record<string, Scalar>>;
export type Rows = readonly Row[];
export type Field = {
  id: string; label: string; type: 'number' | 'select' | 'toggle' | 'multi' | 'interval'; role: 'input' | 'view';
  default: Scalar; min?: number; max?: number; step?: number; unit?: string;
  options?: {value: string; label: string}[];
};
export type Column = {id: string; label: string; type: 'string' | 'number' | 'boolean'; unit?: string; nullable?: boolean};
export type Dataset = {
  id: string; title: string; layer: string; description: string;
  source: 'inline' | 'derived' | 'task'; provenance: 'synthetic' | 'user-provided' | 'derived';
  rowKey: string; columns: Column[]; inputs: string[]; dependsOn: string[];
};
export type TaskSpec = {id: string; label: string; output: string; timeoutMs: number};
export type ValueRef = {literal: Scalar} | {field: string} | {dataset: string; row: string; column: string};
export type Block = {id: string; span?: number; title?: string} & (
  | {type: 'text'; text: string; tone?: 'lead' | 'body' | 'note'}
  | {type: 'metric'; value: ValueRef; unit?: string; digits?: number; note?: string}
  | {type: 'input'; field: string; control?: 'field' | 'slider'}
  | {type: 'table'; dataset: string; pageSize?: number}
  | ({type: 'chart'; dataset: string; x: string; y: string; kind: 'bar' | 'line' | 'scatter'; unit?: string} & ChartVizOptions)
  | {type: 'task'; task: string}
  | {type: 'catalog'}
  | {type: 'code'; text: string; language: string}
  | {type: 'scene3d'; resource: string; explode: string; phase: string; camera: string; selection: string}
  | {type: 'story-controls'; resource: string}
  | {type: 'story-figure'; resource: string}
  | {type: 'architecture'; resource: string; selection?: string}
  | {type: 'explorer'; resource: string; focus: string; facet: string; view: string; level: string; group: string; document: string; scroll?: boolean}
  | {type: 'explanation'; resource: string}
  | {type: 'replay'; resource: string; frame: string; selection: string; channel: string; view: string; speed: string}
  | {type: 'motion'; resource: string; step: string; selection: string; projection: string; panel: string; source: string}
  | {type: 'model3d'; resource: string; selection: string; camera: string; mode: string; explode: string; section: string; view: string; annotations: string; source: string}
  | {type: 'runs'; resource: string}
  | {type: 'custom'; resource: string}
);
/** Chart renderer choice and viz-kit-only options. Without `renderer` the build default applies
 * (the viz kit; `renderer: 'vizforge'` or the global `viz-chart=0` opt-out keeps VizForge). The other options need `renderer: 'viz'`: the
 * VizForge adapter cannot draw them, so they are rejected rather than silently dropped. */
export type ChartVizOptions = {
  renderer?: 'viz' | 'vizforge';
  /** String column: one series per value (long format). Colour follows the series. */
  series?: string;
  /** Numeric column on a second (right) axis. Line charts only. */
  y2?: string;
  /** Bar category order. The viz path defaults to descending, like the VizForge ranking. */
  sort?: 'none' | 'ascending' | 'descending';
  /** Bars with a series: stacked (default) or grouped. */
  stack?: 'stacked' | 'grouped';
  /** Bar direction. Default: horizontal for a ranking (bars without a series, like VizForge),
   * vertical with a series. */
  orientation?: 'horizontal' | 'vertical';
  /** Ranking bars only (no series): numeric column with each bar's prior value. The rank change
   * against it is shown next to each bar (↑2, ↓1, ·); without it the change reads "—", as in VizForge. */
  previous?: string;
  /** One view field, as for other blocks: select/multi over bar categories or line series,
   * interval over scatter X. Values are semantic keys (category/series values), never indexes. */
  selection?: string;
};
export type Section = {id: string; title?: string; columns: number; blocks: Block[]};
export type Page = {id: string; title: string; description: string; sections: Section[]};
export type Manifest = {
  format: 'datapass.web-app'; schemaVersion: 1; id: string; version: string;
  title: string; description: string; label: string; theme: {accent: string; density: 'compact' | 'comfortable'; mode?: 'light' | 'dark'};
  fields: Field[]; datasets: Dataset[]; tasks: TaskSpec[]; pages: Page[];
};
export type DeriveContext = {values: Values; datasets: Readonly<Record<string, Rows>>};
export type TaskContext = DeriveContext & {signal: AbortSignal; report(progress: number): void};
export type Bindings = {
  /** Trusted source-only invariant. Never serialized in an imported manifest. */
  validateViewState?: (values: Values) => void;
  inline?: Record<string, Rows>;
  derive?: Record<string, (context: DeriveContext) => Rows>;
  tasks?: Record<string, (context: TaskContext) => Promise<Rows>>;
};
/** StorySpec is validated by the pinned VizForge parser in the adapter, not by a clone. */
export type StoryResource = {indexField: string; spec: unknown; cues: Record<string, Record<string, Scalar>>};
export type Resources = {scenes?: Record<string, unknown>; stories?: Record<string, StoryResource>; architectures?: Record<string, unknown>; explorers?: Record<string, unknown>; explanations?: Record<string, unknown>; replays?: Record<string, unknown>; motions?: Record<string, unknown>; runs?: Record<string, unknown>; models?: Record<string, unknown>};
export type AppDefinition = {manifest: Manifest; bindings: Bindings; resources?: Resources; components?: Record<string, unknown>; customCapabilities?: Record<string, import('./capabilities.ts').CapabilityId[]>; limits?: import('./scene.ts').SceneLimits};
export type TaskState = {status: 'idle' | 'running' | 'ready' | 'stale' | 'cancelled' | 'error'; progress: number; message: string};
export type Snapshot = {values: Values; revision: number; restoreEpoch: number; tasks: Readonly<Record<string, TaskState>>};
export type SavedState = {format: 'datapass.web-state'; version: 1; appId: string; appVersion: string; page: string; values: Record<string, Scalar>};
