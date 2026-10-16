import {defineApp} from '../../src/framework/authoring.ts';
import {createRuntimeLink,createRuntimeTask} from '../../src/framework/compute/runtime-task.ts';
import type {RunResource} from '../../src/framework/foundation/index.ts';

/** contoso-shape-analytics (F212 consumer 1): a price/cost scenario over the SYNTHETIC Contoso-shape artifact
 * `orchard-monthly-yield` (data/contoso-shape.synthetic.artifact.json, a byte copy of the interop fixture).
 * The calculation runs on the approved local producer `py/serve.py` (the existing DataPass runtime with one more
 * allowlisted model); the page only sends the two declared inputs, follows the run and shows the validated result.
 * Saving a run, the A/B comparison of saved runs and the provenance bundle reuse the framework's durable runs. */
const MODEL='contoso-shape-scenario',MODEL_VERSION='contoso-shape-scenario-1';
const SYNTHETIC='SYNTHETIC, ILLUSTRATIVE data. The base rows are the invented Contoso-shape interop fixture (orchard-monthly-yield, 12 rows); the scenario is plain arithmetic on them. Not Contoso business data, not a forecast, not validated.';
const EXPLANATION='How a result is made: the local producer (python clients/contoso-shape-analytics/py/serve.py) multiplies each base row\'s revenue by (1 + price change) and its cost by (1 + cost change), then writes margin = revenue - cost and margin rate = margin / revenue, plus an "All orchards" total row. The artifact names the base artifact\'s SHA-256 in its source, so the lineage of every saved run points at the exact base bytes. Changing a view (table, chart, metric, JSON) never reruns the producer.';

function sessionPort(){try{return globalThis.sessionStorage??null;}catch{return null;}}
export const link=createRuntimeLink(sessionPort());
export const scenarioTask=createRuntimeTask({taskId:'scenario',model:MODEL,link});

export const runResource:RunResource={maxRecords:12,specs:[{format:'datapass.run-spec',version:1,taskId:'scenario',modelId:MODEL,modelVersion:MODEL_VERSION,providerId:'datapass-runtime',
  source:'Local DataPass runtime (datapass.runtime/1), model '+MODEL+', over the SYNTHETIC base artifact orchard-monthly-yield. ILLUSTRATIVE arithmetic, not a forecast.',provenance:'synthetic',representations:[
    {id:'table',title:'Scenario rows',kind:'table'},
    {id:'margin-chart',title:'Margin by row',kind:'chart',chart:'bar',x:'row',y:'margin',unit:'USD'},
    {id:'total-revenue',title:'Total revenue',kind:'metric',row:'total',column:'revenue',unit:'USD',digits:0},
    {id:'total-margin',title:'Total margin',kind:'metric',row:'total',column:'margin',unit:'USD',digits:0},
    {id:'margin-rate',title:'Margin rate',kind:'metric',row:'total',column:'marginRate',unit:'ratio',digits:3},
    {id:'json',title:'JSON',kind:'json'},
  ]}]};

export default defineApp({manifest:{format:'datapass.web-app',schemaVersion:1,id:'contoso-shape-analytics',version:'0.1.0',title:'Contoso-shape analytics',
  label:'SYNTHETIC, invented data',
  description:'Price and cost scenarios over a synthetic Contoso-shape artifact, run on the approved local DataPass producer, saved, compared and exported with provenance. Invented data, not a forecast.',
  theme:{accent:'#3b6b2f',density:'compact'},
  fields:[
    {id:'priceChangePct',label:'Price change (%)',type:'number',role:'input',min:-50,max:50,step:1,default:0},
    {id:'costChangePct',label:'Cost change (%)',type:'number',role:'input',min:-50,max:50,step:1,default:0},
  ],
  datasets:[{id:'scenario',title:'Scenario rows',layer:'Result',description:'Base rows after the price and cost change, plus an "All orchards" total row. Written by the local producer; validated before display.',source:'task',provenance:'synthetic',rowKey:'row',
    columns:[{id:'row',label:'Row',type:'string'},{id:'month',label:'Harvest month',type:'string'},{id:'orchard',label:'Orchard',type:'string'},
      {id:'revenue',label:'Revenue',type:'number',unit:'USD'},{id:'cost',label:'Cost',type:'number',unit:'USD'},{id:'margin',label:'Margin',type:'number',unit:'USD'},
      {id:'marginRate',label:'Margin rate',type:'number',unit:'ratio',nullable:true}],
    inputs:['priceChangePct','costChangePct'],dependsOn:[]}],
  tasks:[{id:'scenario',label:'Run the scenario on the local producer',output:'scenario',timeoutMs:20000}],
  pages:[{id:'loop',title:'Scenario',description:'Give the parameters, run on the local producer, inspect the result, save it, compare two saved results and export them with provenance.',sections:[
    {id:'note',columns:1,blocks:[{id:'synthetic',type:'text',tone:'note',text:SYNTHETIC},{id:'explanation',type:'text',text:EXPLANATION}]},
    {id:'runs',columns:1,blocks:[{id:'run-workbench',type:'runs',resource:'loop'}]},
  ]}]},
bindings:{tasks:{scenario:scenarioTask.handler}},resources:{runs:{loop:runResource}},durableRuns:{loop:{link,tasks:[scenarioTask]}}});
