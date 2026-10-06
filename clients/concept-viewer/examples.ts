/** Bundled example files (served from public/examples) and the three renderings of one spec. */
export const EXAMPLES=[
  {path:'examples/forecast-app.concept.json',label:'Forecasting app',provenance:'synthetic'},
  {path:'examples/cloud-data-platform.concept.json',label:'Cloud data platform',provenance:'synthetic'},
  {path:'examples/datapass-stack.concept.json',label:'DataPass stack',provenance:'documented'}
] as const;
export const RENDERINGS=[
  {id:'isometric',label:'Isometric 2D'},
  {id:'layered',label:'Layer cake 2D'},
  {id:'3d',label:'3D scene'}
] as const;
export type Rendering=typeof RENDERINGS[number]['id'];
/** Same-origin relative paths only (no scheme, no protocol-relative URL, no parent traversal). */
export function safeSpecPath(value:string|null):string|null{
  if(!value||value.length>200||!/^[a-zA-Z0-9._\-/]+\.json$/.test(value)||value.startsWith('/')||value.split('/').includes('..'))return null;
  return value;
}
