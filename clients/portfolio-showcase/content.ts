/** Client-owned copy for the portfolio. Every claim points at work that exists in this repository's
 * pull requests or in a named companion repository. No client data, no private engineering data.
 */
export const PERSON={
  name:'Julian Passebecq',
  role:'Data engineering & analytics apps',
  lede:'I build data engineering pipelines and the analytics apps that sit on top of them: lakehouse models, Python producers, dashboards you can actually explore.',
  aside:'This page is one of those apps. It is a DataPass Studio client, and the numbers in the strip below are read from the framework repository when the site is built.',
  github:'github.com/julian-passebecq',
};
export type Work={
  id:string;title:string;kind:'Studio client'|'Studio framework'|'Companion app'|'Private client';
  summary:string;tags:string[];refs:string;image?:{src:string;alt:string};schematic?:'diagram'|'private';
};
export const WORK:Work[]=[
  {id:'viz-2d',title:'Viz gallery, 2D',kind:'Studio client',summary:'A Fabric-style report built only from the Studio viz kit: KPI count-ups, stacked areas, donut, heatmap and a 120,000-point canvas scatter. Every visual filters the others.',tags:['d3','SVG + Canvas','crossfilter'],refs:'PR #15',image:{src:'work/viz-2d.webp',alt:'Dark analytics report with KPI cards, a stacked area chart by region and a donut chart'}},
  {id:'viz-3d',title:'Viz gallery, 3D explorer',kind:'Studio client',summary:'WebGL columns, a density surface and a 120,000-point cloud with a lasso, sharing the 2D page’s filters. three.js loads only when this page opens.',tags:['three.js','lazy chunk','motion clock'],refs:'PR #20',image:{src:'work/viz-3d.webp',alt:'3D column chart of revenue by region and month next to a wireframe density surface'}},
  {id:'fabric-bricks',title:'Fabric Bricks',kind:'Studio client',summary:'Data platform concepts as illustrative brick kits. The 126-piece Lakehouse assembles, explodes and isolates in 3D, with a parts list and an autoplay build film.',tags:['3D','film export','synthetic'],refs:'PR #14 · #18',image:{src:'work/fabric-bricks.webp',alt:'Exploded brick model of a lakehouse building above its base plate'}},
  {id:'python-bridge',title:'Python artifact bridge, live + lineage',kind:'Studio framework',summary:'Any Python producer writes a validated artifact; Studio renders it, refreshes it when the file changes, and traces each value back to the exact source lines it cites.',tags:['Python','contract','lineage'],refs:'PR #11 · #12 · #16 · #17',image:{src:'work/artifact-lineage.webp',alt:'Lineage graph from a displayed value to its producer inputs, with the cited Python lines highlighted'}},
  {id:'param-lab',title:'Param lab',kind:'Studio client',summary:'A parametric blade and hub (generic NACA section) rebuilt in a Web Worker. Click a face or edge to get its stable feature id and the parameters that drive it.',tags:['manifold-3d','WASM','illustrative'],refs:'PR #13',image:{src:'work/param-lab.webp',alt:'Three-blade parametric model with one blade surface selected and its driving parameters listed'}},
  {id:'contoso',title:'Contoso Data Studio',kind:'Companion app',summary:'A local-first synthetic retail lab: Parquet, DuckDB, DuckLake and dbt from Bronze to Gold, with guided projects that track progress from real workspace activity.',tags:['DuckLake','dbt','DuckDB'],refs:'separate repository',image:{src:'work/contoso-data-studio.webp',alt:'Guided project cards: Retail Sales 101, Online Channel Shift and Margin Crisis'}},
  {id:'diagramcloud',title:'DiagramCloud',kind:'Companion app',summary:'Architecture diagrams you can descend into: select a component, open its child diagram, then the task, table or code that backs it. Exports self-contained portfolio pages.',tags:['React','diagrams','evidence'],refs:'separate repository',schematic:'diagram'},
  {id:'engineering',title:'Engineering 2D/3D client',kind:'Private client',summary:'A 2D-first replay of supplied engineering samples, with an optional 3D view. Private work: shown here without data or images.',tags:['replay','2D first','private'],refs:'no public material',schematic:'private'},
];
export const STAGES=[
  {n:'01',title:'Produce',text:'Python scripts, notebooks or services write a datapass.artifact: rows, provenance, cited inputs.'},
  {n:'02',title:'Declare',text:'One validated manifest: fields, datasets, tasks and pages. Input state and view state stay separate.'},
  {n:'03',title:'Run',text:'SiteRuntime owns state. Tasks are bounded and cancellable; camera or selection never rerun a model.'},
  {n:'04',title:'Render',text:'Viz kit (SVG, Canvas, WebGL), VizForge stories, ConceptMotion explanations. 3D only on request.'},
  {n:'05',title:'Ship',text:'One client per static build, with a capability plan, JavaScript budgets and a strict CSP.'},
];
