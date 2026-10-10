// Regenerate tests/fixtures/artifact-corpus (every fixture is SYNTHETIC). node scripts/make-artifact-corpus.mjs [--check]
// The committed JSON files are the shared contract; this script only documents how each one was derived.
// tests/artifact-corpus.test.mjs and py/test_artifact_corpus.py decide every file with JSON Schema, the TypeScript
// validator and the Python mirror and compare the decisions (accept/reject, gate, JSON Pointer path) with manifest.json.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';

const root='tests/fixtures/artifact-corpus';
const checking=process.argv.includes('--check');
const SYN='SYNTHETIC fixture for the datapass.artifact differential corpus. Values are invented; not real data.';
const clone=v=>structuredClone(v);
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
/** Same canonical form as input_hash() in py/datapass_artifact.py. */
const inputHash=inputs=>sha(JSON.stringify([...inputs].map(i=>({id:i.id,value:i.value??null})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)));

const table=()=>({format:'datapass.artifact',version:1,id:'corpus-table',title:'Synthetic corpus table',
  provenance:{kind:'synthetic',source:SYN},
  payload:{kind:'table',rowKey:'id',columns:[{id:'id',label:'ID',type:'string'},{id:'value',label:'Value',type:'number',unit:'kW',nullable:true},{id:'time',label:'Time',type:'number',unit:'s'},{id:'flag',label:'Flag',type:'boolean'}],
    rows:[{id:'a',value:2,time:0,flag:true},{id:'b',value:3.5,time:1,flag:false},{id:'c',value:null,time:2,flag:true}]},
  representations:[{id:'table',title:'Rows',kind:'table'},{id:'curve',title:'Value over time',kind:'chart',chart:'line',x:'time',y:'value',unit:'kW'},{id:'first',title:'First value',kind:'metric',row:'a',column:'value',unit:'kW',digits:1},{id:'json',title:'JSON',kind:'json'}]});
const lineage=()=>{
  const a=table();a.id='corpus-lineage';a.title='Synthetic corpus table with lineage';
  const inputs=[{id:'gain',label:'Gain',value:2,unit:'x',evidence:[{path:'synthetic/producer.py',start:5,end:5,label:'Gain constant'}]},{id:'mode',label:'Mode',value:'fast'},{id:'enabled',label:'Enabled',value:true},{id:'note',label:'Declared without a value'}];
  a.provenance={kind:'computed',source:SYN,runId:'run-0001',producer:{kind:'script',name:'synthetic/producer.py',evidence:[{path:'synthetic/producer.py',start:1,end:20,label:'Producer'},{path:'synthetic/helpers/units.py',start:3,end:9,label:'Unit helper'}]},inputHash:inputHash(inputs),inputs,dependsOn:['corpus-upstream']};
  a.representations[1].inputs=['gain','mode'];a.representations[2].inputs=['gain'];
  return a;
};
const text=()=>({format:'datapass.artifact',version:1,id:'corpus-text',title:'Synthetic text artifact',provenance:{kind:'provided',source:SYN},payload:{kind:'text',text:'A short synthetic note. <b>Markup stays inert text.</b>'},representations:[{id:'text',title:'Text',kind:'text'},{id:'json',title:'JSON',kind:'json'}]});

/** Synthetic look-alike of a Contoso Data Studio Gold export (shape only: row key "row", units, lineage inputs, evidence). */
const contoso=()=>{
  const inputs=[
    {id:'scenario',label:'Scenario',value:'baseline'},{id:'seed',label:'Generator seed',value:7},{id:'scale',label:'Generated sales lines',value:1500,unit:'lines'},
    {id:'generatorRunId',label:'Generator run',value:'synthetic-run-0001'},{id:'generatorSha256',label:'Generator source sha256',value:sha('synthetic generator')},
    {id:'ducklakeSnapshot',label:'DuckLake snapshot at export',value:3},{id:'dbtInvocation',label:'dbt invocation (successful)',value:'00000000-0000-4000-8000-000000000001'},
    {id:'dbtModelChecksum',label:'dbt model checksum',value:sha('synthetic model'),evidence:[{path:'dbt/models/gold/monthly_sales.sql',start:1,end:24,label:'dbt model monthly_sales'}]},
    {id:'bronze-sales-sha256',label:'Staging sales.parquet sha256',value:sha('synthetic sales')},
  ];
  return {format:'datapass.artifact',version:1,id:'contoso-monthly-sales',title:'Contoso-shaped Gold monthly_sales (baseline, synthetic look-alike)',
    provenance:{kind:'synthetic',source:'SYNTHETIC look-alike of a Contoso Data Studio Gold export, written for the MosaicStudio corpus. Shape only; every value is invented. Not real business data.',runId:'run-synthetic-run-0001',
      producer:{kind:'service',name:'Synthetic look-alike of the Contoso export service'},inputs,inputHash:inputHash(inputs)},
    payload:{kind:'table',rowKey:'row',columns:[{id:'row',label:'Row (export order)',type:'string'},{id:'order_month',label:'order month',type:'string'},{id:'channel',label:'channel',type:'string'},{id:'revenue',label:'revenue',type:'number',unit:'USD'},{id:'units',label:'units',type:'number',unit:'units'},{id:'gross_margin_rate',label:'gross margin rate',type:'number',unit:'ratio',nullable:true}],
      rows:[{row:'r00001',order_month:'2026-01',channel:'ONLINE',revenue:1200.5,units:40,gross_margin_rate:0.31},{row:'r00002',order_month:'2026-01',channel:'NORD',revenue:830,units:22,gross_margin_rate:null},{row:'r00003',order_month:'2026-02',channel:'SOUTH',revenue:990.25,units:31,gross_margin_rate:0.27}]},
    representations:[{id:'table',title:'Gold rows',kind:'table'},{id:'chart',title:'revenue by order month',kind:'chart',chart:'bar',x:'order_month',y:'revenue',unit:'USD'},{id:'json',title:'JSON',kind:'json'}]};
};
const foilInputs=()=>[{id:'model',label:'Model',value:'synthetic-model'},{id:'modelVersion',label:'Model version',value:'0.0.0'},{id:'scenario',label:'Scenario',value:'synthetic-gusts'},{id:'seed',label:'Seed',value:11},{id:'durationS',label:'Duration',value:60,unit:'s'},{id:'samplePeriodS',label:'Sample period',value:1,unit:'s'}];
/** Synthetic look-alikes of a FOIL lab capture export: a series and a summary that dependsOn it (shape only). */
const foilSeries=()=>{const inputs=foilInputs();return {format:'datapass.artifact',version:1,id:'capture-20260101T000000-0000aaaa-series',title:'FOIL-shaped capture series (synthetic look-alike)',
  provenance:{kind:'synthetic',source:'SYNTHETIC look-alike of a FOIL lab capture export, written for the MosaicStudio corpus. Shape only; every value is invented. Not FOIL data.',runId:'capture-0000aaaa',producer:{kind:'service',name:'Synthetic look-alike of a lab capture export'},inputs,inputHash:inputHash(inputs)},
  payload:{kind:'table',rowKey:'t',columns:[{id:'t',label:'Time',type:'number',unit:'s'},{id:'windMs',label:'Wind speed',type:'number',unit:'m/s'},{id:'powerKw',label:'Power',type:'number',unit:'kW',nullable:true}],
    rows:Array.from({length:6},(_,i)=>({t:i,windMs:6+i*0.5,powerKw:i===3?null:100+i*12.5}))},
  representations:[{id:'table',title:'Samples',kind:'table'},{id:'wind',title:'Wind speed',kind:'chart',chart:'line',x:'t',y:'windMs',unit:'m/s'},{id:'power',title:'Power',kind:'chart',chart:'line',x:'t',y:'powerKw',unit:'kW'},{id:'json',title:'JSON',kind:'json'}]};};
const foilSummary=()=>{const inputs=foilInputs();return {format:'datapass.artifact',version:1,id:'capture-20260101T000000-0000aaaa-summary',title:'FOIL-shaped capture summary (synthetic look-alike)',
  provenance:{kind:'synthetic',source:'SYNTHETIC look-alike of a FOIL lab capture summary, written for the MosaicStudio corpus. Shape only; every value is invented. Not FOIL data.',runId:'capture-0000aaaa',producer:{kind:'service',name:'Synthetic look-alike of a lab capture export'},inputs,inputHash:inputHash(inputs),dependsOn:['capture-20260101T000000-0000aaaa-series']},
  payload:{kind:'table',rowKey:'metric',columns:[{id:'metric',label:'Metric',type:'string'},{id:'value',label:'Value',type:'number',nullable:true},{id:'unit',label:'Unit',type:'string'},{id:'samples',label:'Samples',type:'number'}],
    rows:[{metric:'meanWind',value:7.25,unit:'m/s',samples:6},{metric:'meanPower',value:131.25,unit:'kW',samples:5},{metric:'dropouts',value:1,unit:'samples',samples:6}]},
  representations:[{id:'table',title:'Summary',kind:'table'},{id:'mean-wind',title:'Mean wind',kind:'metric',row:'meanWind',column:'value',unit:'m/s',digits:2},{id:'mean-power',title:'Mean power',kind:'metric',row:'meanPower',column:'value',unit:'kW',digits:1}]};};
const foilCampaign=()=>{const inputs=[{id:'model',label:'Model',value:'synthetic-model'},{id:'machineSpec',label:'Machine spec',value:'synthetic-spec-a'},{id:'assumptionSet',label:'Assumption set',value:'synthetic-assumptions'},{id:'seed',label:'Seed',value:3}];
  return {format:'datapass.artifact',version:1,id:'campaign-0000bbbb-designs',title:'FOIL-shaped campaign designs (synthetic look-alike)',
    provenance:{kind:'synthetic',source:'SYNTHETIC look-alike of a FOIL lab campaign export, written for the MosaicStudio corpus. Shape only; every value is invented. Not FOIL data.',runId:'campaign-0000bbbb',producer:{kind:'service',name:'Synthetic look-alike of a lab campaign export'},inputs,inputHash:inputHash(inputs)},
    payload:{kind:'table',rowKey:'design',columns:[{id:'design',label:'Design',type:'string'},{id:'spanM',label:'Span',type:'number',unit:'m'},{id:'aepMwh',label:'Annual energy',type:'number',unit:'MWh'},{id:'capacityFactor',label:'Capacity factor',type:'number',unit:'ratio'}],
      rows:[{design:'d1',spanM:10,aepMwh:120.5,capacityFactor:0.21},{design:'d2',spanM:12,aepMwh:141,capacityFactor:0.24}]},
    representations:[{id:'table',title:'Designs',kind:'table'},{id:'aep',title:'Annual energy by design',kind:'chart',chart:'bar',x:'design',y:'aepMwh',unit:'MWh'},{id:'span',title:'Energy vs span',kind:'chart',chart:'scatter',x:'spanM',y:'aepMwh',unit:'MWh'},{id:'json',title:'JSON',kind:'json'}]};};

const valid=[];const invalid=[];const sets=[];
const ok=(file,note,make,raw)=>valid.push({file,note,make,raw});
const bad=(file,gate,pointer,note,mutate,base=lineage,raw)=>invalid.push({file,gate,path:pointer,note,make:()=>{const a=base();mutate(a);return a;},raw});

// ---- valid
ok('legacy-v1-wind-aep-6e97cae.json','Plain v1 file exactly as committed at 6e97cae (before lineage fields existed). Illustrative synthetic wind reference.',null);
ok('legacy-v1-table.json','Plain v1 table without any lineage field.',table);
ok('legacy-v1-text.json','Plain v1 text payload with text and JSON views.',text);
ok('lineage-full.json','producer + evidence, inputs (number/string/boolean/no value), inputHash, dependsOn, representation inputs.',lineage);
ok('contoso-shaped-gold-export.json','SYNTHETIC look-alike of a Contoso Gold export (service producer, units, nine lineage inputs, dbt evidence).',contoso);
ok('foil-shaped-capture-series.json','SYNTHETIC look-alike of a FOIL capture series (numeric row key, nullable power).',foilSeries);
ok('foil-shaped-capture-summary.json','SYNTHETIC look-alike of a FOIL capture summary that dependsOn the series.',foilSummary);
ok('foil-shaped-campaign-designs.json','SYNTHETIC look-alike of a FOIL campaign export (bar + scatter charts).',foilCampaign);
ok('edge-empty-rows.json','A table with zero rows and only table/JSON views.',()=>{const a=table();a.payload.rows=[];a.representations=[a.representations[0],a.representations[3]];return a;});
ok('edge-empty-text.json','An empty text payload is allowed (text is not required to be filled).',()=>{const a=text();a.payload.text='';return a;});
ok('edge-input-values.json','Input values 0, false and the empty string are declared values, not missing ones.',()=>{const a=lineage();a.provenance.inputs.push({id:'zero',label:'Zero',value:0},{id:'off',label:'Off',value:false},{id:'blank',label:'Blank',value:''});delete a.provenance.inputHash;return a;});
ok('edge-astral-title.json','160 astral characters (320 UTF-16 units): lengths are Unicode code points, as in JSON Schema.',()=>{const a=table();a.title='\u{1D538}'.repeat(160);return a;});
ok('edge-nel-title.json','U+0085 is not ECMAScript whitespace, so this title is not blank (Python str.isspace() disagrees).',()=>{const a=table();a.title='\u0085';return a;});
ok('edge-safe-paths.json','Evidence paths with "...", dot-files and dotted directory names are safe; a 260-character path is the limit.',()=>{const a=lineage();a.provenance.producer.evidence=[{path:'a/.../b.py',start:1,end:1,label:'Three dots'},{path:'.hidden/x.py',start:1,end:2,label:'Dot file'},{path:'dir.v2/file.name.py',start:2,end:2,label:'Dotted names'},{path:'p/'+'x'.repeat(258),start:1,end:100000,label:'Longest path, last line'}];return a;});
ok('edge-integral-floats.json','version 1.0, digits 1.0 and evidence line 5.0 are the same JSON numbers as 1, 1 and 5.',lineage,s=>s.replace('"version": 1,','"version": 1.0,').replace('"digits": 1','"digits": 1.0').replace('"start": 5,','"start": 5.0,'));
ok('edge-numeric-row-keys.json','Numeric row keys; metric rows use JavaScript String(): 2.0 -> "2", 1e-7 -> "1e-7".',()=>{const a=table();a.payload.rowKey='time';a.payload.rows=[{id:'a',value:1,time:2,flag:true},{id:'b',value:2,time:1e-7,flag:true},{id:'c',value:3,time:1e21,flag:false}];a.representations[2].row='2';a.representations.push({id:'tiny',title:'Tiny time',kind:'metric',row:'1e-7',column:'value'},{id:'huge',title:'Huge time',kind:'metric',row:'1e+21',column:'value'});return a;},s=>s.replace('"time": 2,','"time": 2.0,'));
ok('edge-bounds-max.json','Every list at its maximum: 12 representations, 40 columns, 24 inputs, 8 evidence links, 12 dependsOn, 24 representation inputs; title at 160.',()=>{
  const a=lineage();a.title='T'.repeat(160);
  a.payload.columns=a.payload.columns.concat(Array.from({length:36},(_,i)=>({id:'c'+i,label:'Column '+i,type:'number'})));
  a.payload.rows=a.payload.rows.map((r,j)=>({...r,...Object.fromEntries(Array.from({length:36},(_,i)=>['c'+i,i+j]))}));
  a.provenance.inputs=Array.from({length:24},(_,i)=>({id:'in'+i,label:'Input '+i,value:i}));a.provenance.inputHash=inputHash(a.provenance.inputs);
  a.provenance.producer.evidence=Array.from({length:8},(_,i)=>({path:'synthetic/producer.py',start:i+1,end:i+1,label:'Line '+(i+1)}));
  a.provenance.dependsOn=Array.from({length:12},(_,i)=>'up'+i);
  a.representations=[{id:'table',title:'Rows',kind:'table',inputs:a.provenance.inputs.map(i=>i.id)},...Array.from({length:10},(_,i)=>({id:'m'+i,title:'Metric '+i,kind:'metric',row:'a',column:'c'+i})),{id:'json',title:'JSON',kind:'json'}];
  return a;});

// ---- invalid: structure (exactly what JSON Schema can see)
bad('s-top-extra-field.json','structure','/eval','Unknown top-level command field.',a=>{a.eval='run()';});
bad('s-format.json','structure','/format','Wrong format.',a=>{a.format='datapass.result';});
bad('s-version-2.json','structure','/version','Unsupported version.',a=>{a.version=2;});
bad('s-version-true.json','structure','/version','true is not the number 1 (Python True == 1 used to pass).',a=>{a.version=true;});
bad('s-id-trailing-newline.json','structure','/id','"$" must not accept a trailing newline (Python re.match used to).',a=>{a.id='corpus-lineage\n';});
bad('s-id-reserved.json','structure','/id','Reserved prototype id.',a=>{a.id='constructor';});
bad('s-title-blank.json','structure','/title','Blank title.',a=>{a.title='   ';});
bad('s-title-js-whitespace.json','structure','/title','U+3000 and U+FEFF are ECMAScript whitespace (Python str.strip() kept U+FEFF).',a=>{a.title='\u3000\ufeff';});
bad('s-title-161-astral.json','structure','/title','161 code points exceed 160.',a=>{a.title='\u{1D538}'.repeat(161);});
bad('s-provenance-missing-source.json','structure','/provenance/source','source is required.',a=>{delete a.provenance.source;});
bad('s-provenance-kind.json','structure','/provenance/kind','Unknown provenance kind.',a=>{a.provenance.kind='observed';});
bad('s-provenance-extra.json','structure','/provenance/secret','Unknown provenance field.',a=>{a.provenance.secret='x';});
bad('s-run-id.json','structure','/provenance/runId','runId is an id.',a=>{a.provenance.runId='Run 1';});
bad('s-producer-kind.json','structure','/provenance/producer/kind','Unknown producer kind.',a=>{a.provenance.producer.kind='robot';});
bad('s-producer-extra.json','structure','/provenance/producer/extra','Unknown producer field.',a=>{a.provenance.producer.extra=1;});
bad('s-producer-missing-name.json','structure','/provenance/producer/name','Producer name is required.',a=>{delete a.provenance.producer.name;});
bad('s-input-hash-uppercase.json','structure','/provenance/inputHash','Hash syntax is lowercase hex.',a=>{a.provenance.inputHash=a.provenance.inputHash.toUpperCase();});
bad('s-input-hash-prefixed.json','structure','/provenance/inputHash','No algorithm prefix: exactly 64 hex characters.',a=>{a.provenance.inputHash='sha256:'+a.provenance.inputHash;});
bad('s-input-hash-63.json','structure','/provenance/inputHash','63 characters.',a=>{a.provenance.inputHash=a.provenance.inputHash.slice(1);});
bad('s-input-hash-newline.json','structure','/provenance/inputHash','Trailing newline (Python re.match used to accept it).',a=>{a.provenance.inputHash+='\n';});
bad('s-inputs-25.json','structure','/provenance/inputs','At most 24 inputs.',a=>{a.provenance.inputs=Array.from({length:25},(_,i)=>({id:'in'+i,label:'Input '+i}));a.representations.forEach(r=>delete r.inputs);});
bad('s-input-value-null.json','structure','/provenance/inputs/1/value','null is not a declared value (omit value instead).',a=>{a.provenance.inputs[1].value=null;});
bad('s-input-value-array.json','structure','/provenance/inputs/1/value','Arrays are not input values.',a=>{a.provenance.inputs[1].value=[1];});
bad('s-input-value-401.json','structure','/provenance/inputs/1/value','Input strings are at most 400 characters.',a=>{a.provenance.inputs[1].value='v'.repeat(401);});
bad('s-input-unit-41.json','structure','/provenance/inputs/0/unit','Units are at most 40 characters.',a=>{a.provenance.inputs[0].unit='u'.repeat(41);});
bad('s-input-extra.json','structure','/provenance/inputs/0/secret','Unknown input field.',a=>{a.provenance.inputs[0].secret='x';});
bad('s-input-label-blank.json','structure','/provenance/inputs/2/label','Input labels are filled.',a=>{a.provenance.inputs[2].label=' ';});
for(const [name,p,note] of [['dotdot','../secret.py','Parent traversal.'],['drive','C:/x.py','Drive letter.'],['absolute','/etc/x.py','Absolute path.'],['empty-segment','a//b.py','Empty segment.'],['backslash','a\\b.py','Backslash.'],['dot-segment','./a.py','"." segment.'],['control','a/b\u0007.py','Control character.'],['trailing-slash','a/b/','Trailing slash (empty last segment).'],['empty','','Empty path.'],['261','p/'+'x'.repeat(259),'261 characters.']])
  bad('s-evidence-path-'+name+'.json','structure','/provenance/inputs/0/evidence/0/path',note,a=>{a.provenance.inputs[0].evidence[0].path=p;});
bad('s-evidence-9.json','structure','/provenance/producer/evidence','At most 8 evidence links.',a=>{a.provenance.producer.evidence=Array.from({length:9},(_,i)=>({path:'x.py',start:i+1,end:i+1,label:'L'}));});
bad('s-evidence-start-0.json','structure','/provenance/producer/evidence/0/start','Lines start at 1.',a=>{a.provenance.producer.evidence[0].start=0;});
bad('s-evidence-start-fraction.json','structure','/provenance/producer/evidence/0/start','Lines are integers.',a=>{a.provenance.producer.evidence[0].start=1.5;});
bad('s-evidence-start-true.json','structure','/provenance/producer/evidence/0/start','true is not an integer.',a=>{a.provenance.producer.evidence[0].start=true;});
bad('s-evidence-end-100001.json','structure','/provenance/producer/evidence/0/end','Lines are at most 100000.',a=>{a.provenance.producer.evidence[0].end=100001;});
bad('s-evidence-missing-label.json','structure','/provenance/producer/evidence/1/label','Evidence label is required.',a=>{delete a.provenance.producer.evidence[1].label;});
bad('s-depends-on-duplicate.json','structure','/provenance/dependsOn','dependsOn is a set of ids (uniqueItems).',a=>{a.provenance.dependsOn=['up','up'];});
bad('s-depends-on-13.json','structure','/provenance/dependsOn','At most 12 dependencies.',a=>{a.provenance.dependsOn=Array.from({length:13},(_,i)=>'up'+i);});
bad('s-depends-on-bad-id.json','structure','/provenance/dependsOn/0','Dependencies are artifact ids.',a=>{a.provenance.dependsOn=['../up'];});
bad('s-representation-inputs-duplicate.json','structure','/representations/1/inputs','Representation inputs are a set.',a=>{a.representations[1].inputs=['gain','gain'];});
bad('s-representation-inputs-bad-id.json','structure','/representations/1/inputs/0','Representation inputs are ids.',a=>{a.representations[1].inputs=['Gain'];});
bad('s-representations-13.json','structure','/representations','At most 12 representations.',a=>{a.representations=Array.from({length:13},(_,i)=>({id:'t'+i,title:'T',kind:'table'}));});
bad('s-representations-empty.json','structure','/representations','At least one representation.',a=>{a.representations=[];});
bad('s-representation-kind.json','structure','/representations/0/kind','Unsupported representation kind.',a=>{a.representations[0].kind='html';});
bad('s-representation-extra.json','structure','/representations/0/onClick','No commands on representations.',a=>{a.representations[0].onClick='run()';});
bad('s-representation-chart-pie.json','structure','/representations/1/chart','Unsupported chart.',a=>{a.representations[1].chart='pie';});
bad('s-representation-chart-missing-y.json','structure','/representations/1/y','Chart needs y.',a=>{delete a.representations[1].y;});
bad('s-representation-metric-digits-7.json','structure','/representations/2/digits','digits is 0..6.',a=>{a.representations[2].digits=7;});
bad('s-representation-metric-digits-true.json','structure','/representations/2/digits','true is not an integer.',a=>{a.representations[2].digits=true;});
bad('s-representation-chart-unit-31.json','structure','/representations/1/unit','Chart units are at most 30 characters.',a=>{a.representations[1].unit='u'.repeat(31);});
bad('s-columns-41.json','structure','/payload/columns','At most 40 columns.',a=>{a.payload.columns=Array.from({length:41},(_,i)=>({id:'c'+i,label:'C',type:'number'}));},table);
bad('s-rows-10001.json','structure','/payload/rows','At most 10,000 rows.',a=>{a.payload.rows=Array.from({length:10001},(_,i)=>({id:'r'+i,value:i,time:i,flag:true}));},table);
bad('s-row-string-4001.json','structure','/payload/rows/0/id','Cell strings are at most 4000 characters.',a=>{a.payload.rows[0].id='x'.repeat(4001);},table);
bad('s-row-cell-object.json','structure','/payload/rows/0/value','Cells are scalars.',a=>{a.payload.rows[0].value={amount:2};},table);
bad('s-row-cell-name.json','structure','/payload/rows/0/Bad','Cell names are column ids.',a=>{a.payload.rows[0].Bad=1;},table);
bad('s-payload-kind.json','structure','/payload/kind','Unknown payload kind.',a=>{a.payload={kind:'sql',text:'select 1'};},text);
bad('s-payload-extra.json','structure','/payload/sql','No SQL on a table payload.',a=>{a.payload.sql='drop table x';},table);
bad('s-text-20001.json','structure','/payload/text','Text payload is at most 20000 characters.',a=>{a.payload.text='x'.repeat(20001);},text);
bad('s-column-type.json','structure','/payload/columns/1/type','Column types are string, number or boolean.',a=>{a.payload.columns[1].type='date';},table);
bad('s-column-label-blank.json','structure','/payload/columns/0/label','Column labels are filled.',a=>{a.payload.columns[0].label='';},table);

// ---- invalid: semantic (JSON Schema accepts these; the validators must refuse them)
bad('m-input-duplicate-id.json','semantic','/provenance/inputs/1/id','Duplicate input id.',a=>{a.provenance.inputs[1].id='gain';a.representations[1].inputs=['gain'];});
bad('m-evidence-end-before-start.json','semantic','/provenance/inputs/0/evidence/0/end','Line range ends before it starts.',a=>{a.provenance.inputs[0].evidence[0].start=9;a.provenance.inputs[0].evidence[0].end=3;});
bad('m-evidence-duplicate-range.json','semantic','/provenance/producer/evidence/1','Same path and range twice.',a=>{a.provenance.producer.evidence[1]={...a.provenance.producer.evidence[0],label:'Again'};});
bad('m-depends-on-self.json','semantic','/provenance/dependsOn/1','An artifact cannot depend on itself.',a=>{a.provenance.dependsOn=['corpus-upstream','corpus-lineage'];});
bad('m-representation-undeclared-input.json','semantic','/representations/1/inputs/1','Representation names an undeclared input.',a=>{a.representations[1].inputs=['gain','nope'];});
bad('m-representation-inputs-without-provenance-inputs.json','semantic','/representations/1/inputs/0','Representation inputs need provenance inputs.',a=>{delete a.provenance.inputs;delete a.provenance.inputHash;});
bad('m-representation-duplicate-id.json','semantic','/representations/3/id','Duplicate representation id.',a=>{a.representations[3].id='table';});
bad('m-column-duplicate-id.json','semantic','/payload/columns/2/id','Duplicate column id.',a=>{a.payload.columns[2].id='value';},table);
bad('m-row-key-undeclared.json','semantic','/payload/rowKey','rowKey must be a declared column.',a=>{a.payload.rowKey='missing';},table);
bad('m-row-missing-cell.json','semantic','/payload/rows/1/flag','Every row has every column.',a=>{delete a.payload.rows[1].flag;},table);
bad('m-row-undeclared-cell.json','semantic','/payload/rows/0/extra','No undeclared cells.',a=>{a.payload.rows[0].extra=1;},table);
bad('m-row-cell-type.json','semantic','/payload/rows/1/value','Cell type follows its column.',a=>{a.payload.rows[1].value='3.5';},table);
bad('m-row-null-not-nullable.json','semantic','/payload/rows/0/time','null needs a nullable column.',a=>{a.payload.rows[0].time=null;},table);
bad('m-row-key-duplicate.json','semantic','/payload/rows/2/id','Row keys are unique.',a=>{a.payload.rows[2].id='a';},table);
bad('m-row-key-boolean.json','semantic','/payload/rows/0/flag','Row keys are strings or numbers.',a=>{a.payload.rowKey='flag';a.payload.rows=[a.payload.rows[0]];a.representations=[a.representations[0]];},table);
bad('m-chart-unknown-x.json','semantic','/representations/1/x','Chart x names an unknown column.',a=>{a.representations[1].x='missing';},table);
bad('m-chart-y-not-number.json','semantic','/representations/1/y','Chart y must be a number column.',a=>{a.representations[1].y='id';},table);
bad('m-chart-line-x-string.json','semantic','/representations/1/x','Line chart x must be numeric.',a=>{a.representations[1].x='id';},table);
bad('m-metric-absent-row.json','semantic','/representations/2/row','Metric names an absent row.',a=>{a.representations[2].row='missing';},table);
bad('m-metric-unknown-column.json','semantic','/representations/2/column','Metric names an unknown column.',a=>{a.representations[2].column='missing';},table);
bad('m-text-representation-on-table.json','semantic','/representations/0/kind','Text view needs a text payload.',a=>{a.representations[0].kind='text';},table);
bad('m-table-representation-on-text.json','semantic','/representations/0/kind','Table view needs a table payload.',a=>{a.representations[0].kind='table';},text);

// ---- invalid: envelope (JSON Schema accepts these; the validators must refuse them)
bad('e-over-1-mib.json','envelope','','More than 1 MiB of compact UTF-8 although every list and string is within bounds.',a=>{a.payload.columns.push({id:'name',label:'Name',type:'string'});a.payload.rows=Array.from({length:9000},(_,i)=>({id:'r'+i,value:i,time:i,flag:true,name:'n'.repeat(100)}));},table);
bad('e-non-finite-number.json','envelope','','1e400 is a valid JSON number but not a finite double.',a=>{a.payload.rows[0].value=123456789;},table,s=>s.replace('123456789','1e400'));

// ---- sets (artifacts published together; TypeScript and Python only: JSON Schema has no set notion)
const setOf=(name,expect,members,gate,pointer,note)=>sets.push({name,expect,members,gate,path:pointer,note});
setOf('foil-shaped-capture-pair','accept',[foilSeries,foilSummary],null,null,'Summary dependsOn series inside one bundle (synthetic look-alike).');
setOf('depends-on-cycle','reject',[()=>{const a=table();a.id='cycle-a';a.provenance.dependsOn=['cycle-b'];return a;},()=>{const a=table();a.id='cycle-b';a.provenance.dependsOn=['corpus-outside','cycle-a'];return a;}],'semantic','/1/provenance/dependsOn/1','a -> b -> a.');
setOf('duplicate-id','reject',[table,table],'semantic','/1/id','Two members share one id.');

// ---- write
/** Large fixtures are written compact to keep the repository small; the others are indented for review. */
const stringify=(value,raw)=>{const big=(value.payload?.rows?.length??0)>100;const s=JSON.stringify(value,null,big?0:2)+'\n';return raw?raw(s):s;};
const files=new Map();
// The legacy file is the exact bytes committed at 6e97cae; a shallow clone (CI) falls back to the committed copy.
let legacy;
try{legacy=execFileSync('git',['show','6e97cae:clients/python-wind-reference/public/artifacts/wind-aep-weibull.json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}
catch{legacy=await readFile(path.join(root,'valid/legacy-v1-wind-aep-6e97cae.json'),'utf8');}
legacy=legacy.replace(/\r\n/g,'\n');
for(const f of valid)files.set('valid/'+f.file,f.make?stringify(f.make(),f.raw):legacy);
for(const f of invalid)files.set('invalid/'+f.file,stringify(f.make(),f.raw));
for(const s of sets)s.members.forEach((m,i)=>files.set('sets/'+s.name+'/'+i+'.json',stringify(m())));
const manifest={format:'datapass.artifact-corpus',version:1,
  note:'Every fixture is SYNTHETIC (invented values; Contoso/FOIL entries are look-alikes of the export shape only). Decisions are asserted for JSON Schema (docs/contracts/artifact.schema.json), the TypeScript validator and py/datapass_artifact.py. gate/path: which validator gate refuses the file and the JSON Pointer of the offending field. JSON Schema decides only the structure gate: it accepts envelope and semantic fixtures.',
  generator:'scripts/make-artifact-corpus.mjs',
  fixtures:[...valid.map(f=>({file:'valid/'+f.file,expect:'accept',note:f.note})),...invalid.map(f=>({file:'invalid/'+f.file,expect:'reject',gate:f.gate,path:f.path,note:f.note}))],
  sets:sets.map(s=>({name:s.name,files:s.members.map((_,i)=>'sets/'+s.name+'/'+i+'.json'),expect:s.expect,...(s.gate?{gate:s.gate,path:s.path}:{}),note:s.note}))};
files.set('manifest.json',JSON.stringify(manifest,null,2)+'\n');
if(checking){
  const listed=async dir=>(await readdir(dir,{recursive:true,withFileTypes:true})).filter(e=>e.isFile()).map(e=>path.relative(root,path.join(e.parentPath??e.path,e.name)).replace(/\\/g,'/'));
  const present=new Set(await listed(root));
  for(const [name,content] of files){if((await readFile(path.join(root,name),'utf8').catch(()=>'')).replace(/\r\n/g,'\n')!==content)throw new Error('Corpus drift: '+name+' (run node scripts/make-artifact-corpus.mjs)');present.delete(name);}
  if(present.size)throw new Error('Unlisted corpus files: '+[...present].join(', '));
  console.log('Artifact corpus matches its generator ('+files.size+' files).');
}else{
  await rm(root,{recursive:true,force:true});
  for(const [name,content] of files){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),content);}
  console.log('Wrote '+files.size+' corpus files to '+root);
}
