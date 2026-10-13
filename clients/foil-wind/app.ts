import {defineApp} from '../../src/framework/authoring.ts';
import {artifactSource} from '../../src/framework/foundation/ArtifactSource.tsx';
import {loadArtifact} from '../../src/framework/foundation/artifact-loader.ts';
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
  return rows.map(row=>({metric:row.metric,label:row.label,unit:row.unit,valueA:row.valueA,valueB:row.valueB,delta:row.delta,deltaPct:row.deltaPct}));
}

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
  datasets:[{id:'comparison',title:'Run B against run A',layer:'Result',description:'Rows of the Python-written comparison for the chosen pair. Deltas are B minus A; the percentage is relative to |A| and empty when A is zero.',source:'task',provenance:'synthetic',rowKey:'metric',
    columns:[{id:'metric',label:'Metric',type:'string'},{id:'label',label:'Label',type:'string'},{id:'unit',label:'Unit',type:'string'},
      {id:'valueA',label:'A',type:'number',nullable:true},{id:'valueB',label:'B',type:'number',nullable:true},{id:'delta',label:'B - A',type:'number',nullable:true},{id:'deltaPct',label:'B vs A',type:'number',unit:'%',nullable:true}],
    inputs:['runA','runB'],dependsOn:[]}],
  tasks:[{id:'compare',label:'Compare the two runs',output:'comparison',timeoutMs:15000}],
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
      {id:'task',columns:1,blocks:[{id:'compare-task',type:'task',task:'compare'},{id:'compare-note',type:'text',tone:'note',text:'Changing a run marks the result stale until you compare again. Differences between synthetic runs describe the generator inputs, not a machine.'}]},
      {id:'result',columns:2,blocks:[{id:'compare-chart',type:'chart',dataset:'comparison',kind:'bar',x:'metric',y:'deltaPct',unit:'%',renderer:'viz',sort:'none'},{id:'compare-table',type:'table',dataset:'comparison'}]},
    ]},
  ]},
  bindings:{tasks:{compare:compareRuns}},
  components:{source:artifactSource('foil-wind-source',['text']),runs:artifactSource('foil-wind-runs',['table','power','wind']),measurements:Measurements,...sqlComponents},
  customCapabilities:{source:[],runs:['charts'],measurements:['charts'],...Object.fromEntries(Object.keys(sqlComponents).map(k=>[k,[]]))},
});
