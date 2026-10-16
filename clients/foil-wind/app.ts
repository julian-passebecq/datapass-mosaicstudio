import {defineApp} from '../../src/framework/authoring.ts';
import {artifactSource} from '../../src/framework/foundation/ArtifactSource.tsx';
import {loadArtifact} from '../../src/framework/foundation/artifact-loader.ts';
import {createRuntimeLink,createRuntimeTask} from '../../src/framework/compute/runtime-task.ts';
import type {RunResource} from '../../src/framework/foundation/index.ts';
import type {Block,Rows,TaskContext} from '../../src/framework/types.ts';
import queries from './queries.json' with {type:'json'};
import {Measurements} from './Measurements.tsx';

/** foil-wind: runs, measurements, SQL and a run-vs-run comparison over SYNTHETIC foil-wind-lab capture exports.
 * Every number on the page comes from datapass.artifact files written by clients/foil-wind/py/build_data.py:
 * the committed ones from a hand-made placeholder, a local build from a foil.export v1 bundle (build-export.mjs). */
const MAX_RUNS=8;
const slots=Array.from({length:MAX_RUNS},(_,i)=>({value:'run-'+(i+1),label:'Run '+(i+1)}));
const SYNTHETIC='SYNTHETIC data. The committed build shows a HAND-MADE PLACEHOLDER (invented numbers, not FOIL output). A local build can read a foil.export v1 bundle of the foil-wind-lab synthetic producer: an invented surrogate whose power and energy are operational proxies, not yield. No Foil\'O physics, no model accuracy and no validation is claimed.';

/** Explicit task: fetch the Python-written comparison and keep the chosen pair. No calculation runs here. */
async function compareRuns({values,signal,report}:TaskContext):Promise<Rows>{
  const a=String(values.runA),b=String(values.runB);
  if(a===b)throw new Error('Choose two different runs.');
  report(0.25);
  const {artifact}=await loadArtifact('foil-wind-comparison',{base:document.baseURI,signal});
  if(signal.aborted)throw new Error('Task cancelled');
  if(artifact.payload.kind!=='table')throw new Error('The comparison artifact is not a table');
  const rows=artifact.payload.rows.filter(row=>row.runA===a&&row.runB===b);
  if(!rows.length)throw new Error(`${a} or ${b} is not in this build. Check the Runs page for the available slots.`);
  report(1);
  return rows.map(row=>({metric:row.metric,label:row.label,unit:row.unit,valueA:row.valueA,valueB:row.valueB,delta:row.delta,deltaPct:row.deltaPct,direction:row.direction??null,chartPct:row.chartPct??null}));
}

/** F212 loop (optional): the same comparison computed on the approved local producer clients/foil-wind/py/serve.py
 * (the existing DataPass runtime plus model foil-wind-compare over the committed hand-made placeholder), so a run can
 * be saved, reopened by hash, compared A/B and exported with provenance. Visitors without Python keep the static pages. */
const LOOP_MODEL='foil-wind-compare',LOOP_MODEL_VERSION='foil-wind-compare-1';
function sessionPort(){try{return globalThis.sessionStorage??null;}catch{return null;}}
export const link=createRuntimeLink(sessionPort());
const slotNumber=(value:unknown)=>{const n=Number(/^run-([1-8])$/.exec(String(value))?.[1]);if(!n)throw new Error('Choose run slots run-1 to run-'+MAX_RUNS+'.');return n;};
export const compareRuntimeTask=createRuntimeTask({taskId:'compareRuntime',model:LOOP_MODEL,link,inputs:values=>({runA:slotNumber(values.runA),runB:slotNumber(values.runB)})});
const comparisonColumns=[{id:'label',label:'Metric',type:'string'},{id:'direction',label:'Direction',type:'string',nullable:true},{id:'deltaPct',label:'B vs A',type:'number',unit:'%',nullable:true},
  {id:'delta',label:'B - A',type:'number',nullable:true},{id:'valueA',label:'A',type:'number',nullable:true},{id:'valueB',label:'B',type:'number',nullable:true},{id:'unit',label:'Unit',type:'string'},
  {id:'metric',label:'Key',type:'string'},{id:'chartPct',label:'Charted change',type:'number',unit:'%',nullable:true}] as const;
export const loopResource:RunResource={maxRecords:12,specs:[{format:'datapass.run-spec',version:1,taskId:'compareRuntime',modelId:LOOP_MODEL,modelVersion:LOOP_MODEL_VERSION,providerId:'datapass-runtime',
  source:'Local DataPass runtime (datapass.runtime/1), model '+LOOP_MODEL+', over the HAND-MADE PLACEHOLDER (SYNTHETIC, invented numbers, not FOIL output).',provenance:'synthetic',representations:[
    {id:'table',title:'B against A',kind:'table'},
    {id:'change-chart',title:'B vs A, % of A',kind:'chart',chart:'bar',x:'metric',y:'chartPct',unit:'%'},
    {id:'power-delta',title:'Mean power proxy, B - A',kind:'metric',row:'meanPowerKw',column:'delta',unit:'kW',digits:3},
    {id:'wind-delta',title:'Mean wind, B - A',kind:'metric',row:'meanWindMs',column:'delta',unit:'m/s',digits:3},
    {id:'json',title:'JSON',kind:'json'},
  ]}]};

const sqlBlocks:Block[]=queries.queries.flatMap(q=>[
  {id:'sql-'+q.id+'-text',type:'code',title:q.title,language:'sql',text:q.sql} as Block,
  {id:'sql-'+q.id+'-result',type:'custom',resource:'sql-'+q.id} as Block,
]);
const sqlComponents=Object.fromEntries(queries.queries.map(q=>['sql-'+q.id,artifactSource('foil-wind-sql-'+q.id,['table'])]));

export default defineApp({manifest:{format:'datapass.web-app',schemaVersion:1,id:'foil-wind',version:'0.1.0',title:'Foil Wind runs',
  label:'SYNTHETIC, invented data',
  description:'Runs, measurements, SQL results and a run-vs-run comparison over synthetic foil-wind-lab capture exports, written by Python at build time. Invented surrogate data: not FOIL client data, not Foil\'O physics, not validated.',
  theme:{accent:'#286b7d',density:'compact'},
  fields:[
    {id:'measureRun',label:'Run to inspect',type:'select',role:'view',default:'run-1',options:slots},
    {id:'runA',label:'Run A (reference)',type:'select',role:'input',default:'run-1',options:slots},
    {id:'runB',label:'Run B',type:'select',role:'input',default:'run-2',options:slots},
  ],
  datasets:[{id:'comparison',title:'Run B against run A',layer:'Result',description:'Rows of the Python-written comparison for the chosen pair. Deltas are B minus A; the percentage is relative to |A| and empty when A is zero. Direction is the sign of B minus A, written by Python. The charted change is the percentage only when B differs from A.',source:'task',provenance:'synthetic',rowKey:'metric',
    // Sign first: on a phone the table scrolls sideways, so the direction and the signed percentage lead.
    columns:[{id:'label',label:'Metric',type:'string'},{id:'direction',label:'Direction',type:'string',nullable:true},{id:'deltaPct',label:'B vs A',type:'number',unit:'%',nullable:true},
      {id:'delta',label:'B - A',type:'number',nullable:true},{id:'valueA',label:'A',type:'number',nullable:true},{id:'valueB',label:'B',type:'number',nullable:true},{id:'unit',label:'Unit',type:'string'},
      {id:'metric',label:'Key',type:'string'},{id:'chartPct',label:'Charted change',type:'number',unit:'%',nullable:true}],
    inputs:['runA','runB'],dependsOn:[]},
    {id:'runtimeComparison',title:'Run B against run A (local producer)',layer:'Result',description:'The same comparison rows, computed by the local producer for the chosen pair (F212 loop). SYNTHETIC placeholder data.',source:'task',provenance:'synthetic',rowKey:'metric',
      columns:comparisonColumns.map(c=>({...c})),inputs:['runA','runB'],dependsOn:[]}],
  tasks:[{id:'compare',label:'Compare the two runs',output:'comparison',timeoutMs:15000},{id:'compareRuntime',label:'Compare on the local producer',output:'runtimeComparison',timeoutMs:20000}],
  pages:[
    {id:'runs',title:'Runs',description:'One row per capture run, summarised by Python from its measurements.',sections:[
      {id:'note',columns:1,blocks:[{id:'synthetic',type:'text',tone:'note',text:SYNTHETIC},{id:'source',type:'custom',resource:'source'}]},
      {id:'runs',columns:1,blocks:[{id:'runs-table',type:'custom',resource:'runs'}]},
    ]},
    {id:'measurements',title:'Measurements',description:'Time series of one run (at most 240 points; a point averages several samples on long runs). Missing wind stays missing.',sections:[
      {id:'pick',columns:1,blocks:[{id:'measure-run',type:'input',field:'measureRun'}]},
      {id:'series',columns:1,blocks:[{id:'measurements',type:'custom',resource:'measurements'}]},
    ]},
    {id:'sql',title:'SQL',description:'Committed queries over the tables runs and measurements, executed by Python sqlite3 at build time. The page shows the query and its result; it does not run SQL.',sections:[
      {id:'tables',columns:1,blocks:[{id:'sql-tables',type:'text',tone:'note',text:'Tables: runs ('+queries.tables.runs+'); measurements ('+queries.tables.measurements+'). Free-form SQL over larger data belongs to the separate SQLRooms workbench, which this selected-client build does not include.'}]},
      {id:'queries',columns:1,blocks:sqlBlocks},
    ]},
    {id:'compare',title:'Comparison',description:'Run B against run A. Python computed every ordered pair at build time; the button fetches and validates the result for the chosen pair.',sections:[
      {id:'inputs',columns:2,blocks:[{id:'run-a',type:'input',field:'runA'},{id:'run-b',type:'input',field:'runB'}]},
      {id:'task',columns:1,blocks:[{id:'compare-task',type:'task',task:'compare'},{id:'compare-note',type:'text',tone:'note',text:'Changing a run marks the result stale until you compare again. Differences between synthetic runs describe the generator inputs, not a machine. The chart draws signed changes (bars left of zero: B lower than A); rows with no change or no percentage stay in the table only.'}]},
      {id:'result',columns:2,blocks:[{id:'compare-chart',type:'chart',title:'B vs A, % of A (left of zero: B lower)',dataset:'comparison',kind:'bar',x:'metric',y:'chartPct',unit:'%',renderer:'viz',series:'direction',orientation:'horizontal',sort:'none'},{id:'compare-table',type:'table',dataset:'comparison'}]},
    ]},
    {id:'loop',title:'Saved runs',description:'Optional: compare on the local producer (python clients/foil-wind/py/serve.py), save results, reopen them by hash, compare two saved results and export them with provenance. Without the producer the other pages are unchanged.',sections:[
      {id:'note',columns:1,blocks:[{id:'loop-synthetic',type:'text',tone:'note',text:SYNTHETIC},{id:'loop-explanation',type:'text',text:'How a result is made: the local producer reads the committed hand-made placeholder, summarises each run and writes B minus A per metric with the same Python code as the build step (build_data.compare_pair). The page sends only the two run slots, follows the run and validates the artifact. Changing a view never reruns the producer.'}]},
      {id:'runs',columns:1,blocks:[{id:'loop-runs',type:'runs',resource:'loop'}]},
    ]},
  ]},
  bindings:{tasks:{compare:compareRuns,compareRuntime:compareRuntimeTask.handler}},
  resources:{runs:{loop:loopResource}},durableRuns:{loop:{link,tasks:[compareRuntimeTask]}},
  components:{source:artifactSource('foil-wind-source',['text']),runs:artifactSource('foil-wind-runs',['table','power','wind']),measurements:Measurements,...sqlComponents},
  customCapabilities:{source:[],runs:['charts'],measurements:['charts'],...Object.fromEntries(Object.keys(sqlComponents).map(k=>[k,[]]))},
});
