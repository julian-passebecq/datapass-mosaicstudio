/** Projections of the one registry snapshot (the gn-view field). Order = button order. Presentation config. */
export const VIEWS=[
  {id:'galaxy3d',label:'3D Galaxy',hint:'Project groups as planes at their own heights over the commons (lazy 3D)'},
  {id:'iso',label:'Isometric',hint:'The same layering as a static, exportable SVG'},
  {id:'graph',label:'Graph',hint:'Cluster graph of apps, repos and contracts'},
  {id:'list',label:'List',hint:'Apps and repos sorted by links'},
  {id:'matrix',label:'Matrix',hint:'Apps x contracts: provides / consumes, coloured by status'},
  {id:'board',label:'Board',hint:'Contracts grouped by status'},
] as const;
export type ViewId=typeof VIEWS[number]['id'];
export const DEFAULT_VIEW:ViewId='graph';
export const asView=(x:unknown):ViewId=>VIEWS.some(v=>v.id===x)?x as ViewId:DEFAULT_VIEW;
