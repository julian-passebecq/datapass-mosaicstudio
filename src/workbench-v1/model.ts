/** Portable notebook source contract. Import validates data; it never executes a cell. */
export const FORMAT = 'datapass.workbench.notebook';
export const VERSION = 1;
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const MAX_CELLS = 128;
export const LANGUAGES = ['sql', 'python', 'markdown', 'yaml', 'hcl', 'dbt'] as const;
export type CellLanguage = typeof LANGUAGES[number];
export interface Cell {
  id: string;
  language: CellLanguage;
  title: string;
  source: string;
  dependsOn: string[];
}
export interface Notebook {
  format: typeof FORMAT;
  version: typeof VERSION;
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  cells: Cell[];
}
export interface CellResult {
  cellId: string;
  requestId: string;
  source: string;
  status: 'running' | 'success' | 'error' | 'cancelled' | 'stale';
  engine: string;
  startedAt: string;
  elapsedMs?: number;
  columns?: string[];
  rows?: Record<string, unknown>[];
  stdout?: string;
  error?: string;
  truncated?: boolean;
}
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/;
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value as Record<string, unknown>;
}
function string(value: unknown, name: string, maximum: number, empty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!empty && !value.trim())) throw new Error(`${name} must be ${empty ? 'at most' : 'between 1 and'} ${maximum} characters.`);
  return value;
}
function id(value: unknown, name: string): string {
  const result = string(value, name, 96);
  if (!ID.test(result)) throw new Error(`${name} is not a safe identifier.`);
  return result;
}
function iso(value: unknown, name: string): string {
  const result = string(value, name, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error(`${name} is not an ISO date.`);
  return result;
}
/** Project only known fields; untrusted imports cannot smuggle runtime state or permissions. */
export function validateNotebook(raw: unknown): Notebook {
  const value = object(raw, 'Notebook');
  if (value.format !== FORMAT || value.version !== VERSION) throw new Error('Unsupported notebook format/version. The current workspace has not changed.');
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw new Error('Invalid notebook revision.');
  if (!Array.isArray(value.cells) || value.cells.length > MAX_CELLS) throw new Error(`A notebook supports at most ${MAX_CELLS} cells.`);
  const cells = value.cells.map((rawCell, index): Cell => {
    const cell = object(rawCell, `Cell ${index + 1}`);
    if (!LANGUAGES.includes(cell.language as CellLanguage)) throw new Error(`Unsupported language in cell ${index + 1}.`);
    if (!Array.isArray(cell.dependsOn) || cell.dependsOn.length > MAX_CELLS) throw new Error('Invalid dependencies.');
    const dependencies = cell.dependsOn.map((v) => id(v, 'Dependency'));
    if (new Set(dependencies).size !== dependencies.length) throw new Error('Duplicate dependency.');
    return {
      id: id(cell.id, 'Cell ID'), language: cell.language as CellLanguage,
      title: string(cell.title, 'Cell title', 160, true),
      source: string(cell.source, 'Cell source', 100_000, true), dependsOn: dependencies
    };
  });
  const notebook: Notebook = {
    format: FORMAT, version: VERSION, id: id(value.id, 'Notebook ID'),
    title: string(value.title, 'Notebook title', 160), revision: Number(value.revision),
    createdAt: iso(value.createdAt, 'Created date'), updatedAt: iso(value.updatedAt, 'Updated date'), cells
  };
  executionOrder(cells);
  if (new TextEncoder().encode(JSON.stringify(notebook)).length > MAX_DOCUMENT_BYTES) throw new Error('Notebook exceeds the 2 MiB source limit.');
  return notebook;
}
export function parseNotebook(text: string): Notebook {
  if (new TextEncoder().encode(text).length > MAX_DOCUMENT_BYTES) throw new Error('Notebook exceeds the 2 MiB import limit.');
  return validateNotebook(JSON.parse(text));
}
export function createCell(language: CellLanguage = 'sql', cellId = `cell-${crypto.randomUUID()}`): Cell {
  return {id: cellId, language, title: '', source: '', dependsOn: []};
}
export function createNotebook(title = 'Untitled notebook', now = new Date().toISOString(), notebookId = `notebook-${crypto.randomUUID()}`): Notebook {
  return validateNotebook({format: FORMAT, version: VERSION, id: notebookId, title, revision: 0, createdAt: now, updatedAt: now, cells: []});
}
export function editNotebook(notebook: Notebook, patch: Partial<Pick<Notebook, 'title' | 'cells'>>, now = new Date().toISOString()): Notebook {
  return validateNotebook({...notebook, ...patch, revision: notebook.revision + 1, updatedAt: now});
}
export function removeCell(notebook: Notebook, cellId: string): Notebook {
  return editNotebook(notebook, {cells: notebook.cells.filter(c => c.id !== cellId).map(c => ({...c, dependsOn: c.dependsOn.filter(d => d !== cellId)}))});
}
/** Stable topological order. No dependency means visual/source order, not parallel execution. */
export function executionOrder(cells: readonly Cell[]): Cell[] {
  const byId = new Map(cells.map(c => [c.id, c]));
  if (byId.size !== cells.length) throw new Error('Duplicate cell IDs.');
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const result: Cell[] = [];
  const visit = (cell: Cell) => {
    if (visited.has(cell.id)) return;
    if (visiting.has(cell.id)) throw new Error('The dependency graph contains a cycle.');
    visiting.add(cell.id);
    for (const dependency of cell.dependsOn) {
      const parent = byId.get(dependency);
      if (!parent) throw new Error(`Missing dependency: ${dependency}`);
      if (parent.language === 'markdown' || parent.language === 'yaml' || parent.language === 'hcl') throw new Error('Only executable cells can be dependencies.');
      visit(parent);
    }
    visiting.delete(cell.id); visited.add(cell.id); result.push(cell);
  };
  cells.forEach(visit);
  return result;
}
export function dependentIds(cells: readonly Cell[], changedId: string): Set<string> {
  const affected = new Set([changedId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const cell of cells) if (!affected.has(cell.id) && cell.dependsOn.some(d => affected.has(d))) {affected.add(cell.id); changed = true;}
  }
  return affected;
}
export function resultMatches(cell: Cell, result: CellResult | undefined): boolean {
  return !!result && cell.id === result.cellId && cell.source === result.source;
}
/** Notebook interchange contains source only. Output data needs a separate explicit export. */
export function toIpynb(notebook: Notebook): object {
  return {
    nbformat: 4, nbformat_minor: 5,
    metadata: {kernelspec: {name: 'python3', display_name: 'Python 3', language: 'python'}, datapass: {id: notebook.id, title: notebook.title, source_only: true}},
    cells: notebook.cells.map(cell => ({
      id: cell.id, cell_type: cell.language === 'markdown' ? 'markdown' : 'code',
      metadata: {datapass: {language: cell.language, title: cell.title, dependsOn: cell.dependsOn}},
      source: cell.source, ...(cell.language === 'markdown' ? {} : {execution_count: null, outputs: []})
    }))
  };
}
export function fromIpynb(raw: unknown): Notebook {
  const value = object(raw, 'Jupyter notebook');
  if (value.nbformat !== 4 || !Array.isArray(value.cells) || value.cells.length > MAX_CELLS) throw new Error('Only bounded nbformat 4 notebooks are supported.');
  const notebook = createNotebook('Imported notebook');
  const cells = value.cells.map((item, index): Cell => {
    const cell = object(item, 'Jupyter cell');
    if (cell.cell_type !== 'code' && cell.cell_type !== 'markdown') throw new Error('Unsupported Jupyter cell type.');
    const metadata = cell.metadata && typeof cell.metadata === 'object' ? cell.metadata as Record<string, unknown> : {};
    const dp = metadata.datapass && typeof metadata.datapass === 'object' ? metadata.datapass as Record<string, unknown> : {};
    const source = Array.isArray(cell.source) && cell.source.every(v => typeof v === 'string') ? cell.source.join('') : cell.source;
    return {
      id: typeof cell.id === 'string' && ID.test(cell.id) ? cell.id : `imported-${index}`,
      language: cell.cell_type === 'markdown' ? 'markdown' : LANGUAGES.includes(dp.language as CellLanguage) ? dp.language as CellLanguage : 'python',
      title: typeof dp.title === 'string' ? dp.title : '', source: string(source, 'Source', 100_000, true),
      dependsOn: Array.isArray(dp.dependsOn) ? dp.dependsOn.map(v => id(v, 'Dependency')) : []
    };
  });
  return editNotebook(notebook, {cells});
}
