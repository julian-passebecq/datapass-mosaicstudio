import {validateExplorerState, type ExplorerSpec, type ExplorerState, type ExplorerDocument, type ExplorerItem, EXPLORER_KEYS} from './model.ts';

export type ExplorerAction =
  | {type:'select'; id:string} | {type:'overview'} | {type:'facet'; id:string}
  | {type:'view'; value:ExplorerState['view']} | {type:'level'; value:ExplorerState['level']}
  | {type:'group'; id:string} | {type:'document'; id:string};
/** Every transition returns one coherent state; callers publish it in a single runtime.patch. */
export function navigateExplorer(spec: ExplorerSpec, current: ExplorerState, action: ExplorerAction): ExplorerState {
  const next = {...current};
  switch (action.type) {
    case 'select': {
      const item = spec.items.find(i => i.id === action.id); if (!item) throw new Error('Unknown selected item');
      next.focus = item.id; next.level = 'focus'; next.document = 'none';
      if (next.group !== 'all' && next.group !== item.group) next.group = 'all';
      break;
    }
    case 'overview': next.focus = 'overview'; next.level = 'overview'; next.document = 'none'; break;
    case 'facet': next.facet = action.id; next.document = 'none'; break;
    case 'view': next.view = action.value; break;
    case 'level':
      if (action.value === 'overview') {next.focus = 'overview'; next.document = 'none';}
      else if (next.focus === 'overview') throw new Error('Select a component before opening its detail');
      next.level = action.value;
      if (action.value !== 'evidence') next.document = 'none';
      break;
    case 'group':
      next.group = action.id;
      if (action.id !== 'all' && spec.items.find(i => i.id === next.focus)?.group !== action.id) {
        next.focus = 'overview'; next.level = 'overview'; next.document = 'none';
      }
      break;
    case 'document': {
      const doc = spec.documents.find(d => d.id === action.id); if (!doc) throw new Error('Unknown selected document');
      next.focus = doc.item; next.facet = doc.facet; next.level = 'evidence'; next.document = doc.id; next.view = 'library';
      const item = spec.items.find(i => i.id === doc.item)!;
      if (next.group !== 'all' && next.group !== item.group) next.group = 'all';
      break;
    }
  }
  validateExplorerState(spec, next);
  return next;
}
export function ancestors(spec: ExplorerSpec, id: string): ExplorerItem[] {
  const chain: ExplorerItem[] = [], seen = new Set<string>(); let item = spec.items.find(i => i.id === id);
  while (item) {
    if (seen.has(item.id)) throw new Error('Cyclic explorer hierarchy'); seen.add(item.id); chain.unshift(item);
    item = item.parent ? spec.items.find(i => i.id === item!.parent) : undefined;
  }
  return chain;
}
export function isInBranch(spec: ExplorerSpec, id: string, parent: string): boolean {
  return parent === 'overview' || ancestors(spec, id).some(i => i.id === parent);
}
export function contextDocuments(spec: ExplorerSpec, state: ExplorerState): ExplorerDocument[] {
  return spec.documents.filter(d => d.facet === state.facet && isInBranch(spec, d.item, state.focus) &&
    (state.group === 'all' || spec.items.find(i => i.id === d.item)!.group === state.group));
}
export function explorerCamera(spec: ExplorerSpec, state: ExplorerState): string | null {
  if (!spec.scene) return null;
  const mapping = spec.items.find(i => i.id === state.focus)?.scene;
  return mapping?.facetCameras?.[state.facet] || mapping?.camera || spec.overviewCamera!;
}
export function journeyStops(spec: ExplorerSpec, group = 'all'): string[] {
  return ['overview', ...spec.journey.filter(id => group === 'all' || spec.items.find(i => i.id === id)!.group === group)];
}
export function chapterAt(progress: number, count: number): number {
  if (!Number.isFinite(progress) || !Number.isInteger(count) || count < 1) throw new Error('Invalid scroll chapter input');
  return Math.min(count - 1, Math.max(0, Math.round(Math.max(0, Math.min(1, progress)) * (count - 1))));
}
const normalized = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export type ExplorerHit = {kind:'item'|'document'; id:string; item:string; label:string; detail:string; score:number};
/** Local bounded search. No regex from users, index service, embedding model or remote fetch. */
export function searchExplorer(spec: ExplorerSpec, query: string, group = 'all', limit = 30): ExplorerHit[] {
  if (typeof query !== 'string' || query.length > 160 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Search limit');
  if (group !== 'all' && !spec.groups.some(g => g.id === group)) throw new Error('Unknown search group');
  const terms = normalized(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const eligible = (i: ExplorerItem) => group === 'all' || i.group === group;
  const hits: ExplorerHit[] = [];
  const add = (kind: ExplorerHit['kind'], id: string, item: string, label: string, detail: string, content: string) => {
    const haystack = normalized(label+' '+detail+' '+content), title = normalized(label);
    if (terms.every(t => haystack.includes(t))) hits.push({kind,id,item,label,detail,score:terms.reduce((n,t) => n + (title.includes(t) ? 5 : 1),0)});
  };
  for (const item of spec.items.filter(eligible)) add('item',item.id,item.id,item.label,item.summary,item.description+' '+item.tags.join(' '));
  for (const doc of spec.documents) if (eligible(spec.items.find(i => i.id === doc.item)!)) {
    add('document',doc.id,doc.item,doc.title,doc.summary,doc.sections.map(s => s.title+' '+s.text+' '+(s.code||'')).join(' '));
  }
  return hits.sort((a,b) => b.score-a.score || a.label.localeCompare(b.label,'en')).slice(0,limit);
}
export function explorerLink(base: string, blockId: string, spec: ExplorerSpec, state: ExplorerState): string {
  validateExplorerState(spec,state);
  const url = new URL(base); if (!['http:','https:'].includes(url.protocol)||url.username||url.password) throw new Error('View links require an HTTP origin without credentials');
  const route=new URLSearchParams();
  for(const key of ['app','page']){const value=url.searchParams.get(key);if(value&&/^[a-z][a-zA-Z0-9_-]{0,79}$/.test(value))route.set(key,value);}
  url.search=route.toString();url.hash='';
  const prefix = 'view-'+blockId+'-';
  EXPLORER_KEYS.forEach(k => url.searchParams.set(prefix+k,state[k]));
  return url.toString();
}
export function readExplorerLink(base: string, blockId: string, spec: ExplorerSpec, fallback: ExplorerState): ExplorerState | null {
  const url = new URL(base), prefix = 'view-'+blockId+'-';
  if (!EXPLORER_KEYS.some(k => url.searchParams.has(prefix+k))) return null;
  const next = {...fallback};
  for (const k of EXPLORER_KEYS) {
    const values = url.searchParams.getAll(prefix+k);
    if (values.length > 1) throw new Error('Ambiguous explorer link');
    if (values.length) Object.assign(next,{[k]:values[0]});
  }
  validateExplorerState(spec,next);
  return next;
}
