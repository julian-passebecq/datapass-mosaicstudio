/** Machine-readable AI feature inventory. Registry and manifest validation are checked against this list. */
export const componentCatalog=[
  {type:'text',purpose:'Safe title, lead or explanatory text',required:['id','type','text'],engine:'React text nodes',limits:'No HTML or executable markdown'},
  {type:'metric',purpose:'Literal, state-bound or dataset-cell KPI',required:['id','type','value'],engine:'React',limits:'Finite scalar values; missing is not zero'},
  {type:'input',purpose:'Validated numeric, select or boolean field',required:['id','type','field'],engine:'Native accessible form controls',limits:'Must reference a declared field'},
  {type:'table',purpose:'Typed bounded data table, sort, pagination and CSV',required:['id','type','dataset'],engine:'React / existing DataPass CSV escaping',limits:'10,000-row client contract; not a large-data grid'},
  {type:'chart',purpose:'Translate small datasets into analytical visuals',required:['id','type','dataset','x','y','kind'],engine:'Existing VizForge Figure / D3',limits:'Bar adapter: at most 30 nonnegative categories; line/scatter numeric X; nulls are not bridged'},
  {type:'task',purpose:'Explicit bounded computation with cancel/stale state',required:['id','type','task'],engine:'Trusted app source handler',limits:'No arbitrary code or model in imported JSON'},
  {type:'catalog',purpose:'Display dataset layers, provenance and dependencies',required:['id','type'],engine:'Manifest metadata',limits:'Not a DuckLake catalog or automatic lineage analysis'},
  {type:'code',purpose:'Read-only source explanation',required:['id','type','text','language'],engine:'Escaped React text',limits:'No editor or execution'},
  {type:'scene3d',purpose:'Reusable interactive primitive assembly',required:['id','type','resource','explode','phase','camera','selection'],engine:'Three.js / OrbitControls / WebGL2',limits:'128 parts, 64 entities; no GLTF, CAD, physics, video encoding or remote model loading'},
  {type:'story-controls',purpose:'Control one shared timeline and publish view-only cues',required:['id','type','resource'],engine:'Original VizForge StoryPlayer',limits:'Step-based story; autoplay pauses when hidden or reduced motion is requested'},
  {type:'story-figure',purpose:'Display the original figure for the shared story frame',required:['id','type','resource'],engine:'Original VizForge Figure',limits:'Uses the pinned upstream StorySpec, no second story schema'},
  {type:'architecture',purpose:'Reuse the existing architecture review with client-owned data',required:['id','type','resource'],engine:'Existing architecture module / React Flow',limits:'Static artifact; not a live analyzer or orchestrator'},
  {type:'custom',purpose:'Client-owned React component registered in trusted source',required:['id','type','resource'],engine:'Client component',limits:'Source binding only; imported JSON cannot provide components or code'},
] as const;
