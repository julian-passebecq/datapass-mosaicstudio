/** Chart block `renderer: 'viz'` path: contract validation, routing and render plans. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManifest} from '../src/framework/validate.ts';
import {chartUsesViz} from '../src/framework/blocks/chart-flag.ts';
import {planChart,ChartPlanError,extentDomain} from '../src/framework/viz/chart-plan.ts';

const columns=[{id:'id',label:'ID',type:'string'},{id:'region',label:'Region',type:'string'},{id:'product',label:'Product',type:'string'},{id:'month',label:'Month',type:'number'},{id:'revenue',label:'Revenue',type:'number',unit:'EUR'},{id:'margin',label:'Margin',type:'number',unit:'%'}];
const dataset={id:'sales',title:'Sales',layer:'Gold',description:'Synthetic',source:'inline',provenance:'synthetic',rowKey:'id',columns,inputs:[],dependsOn:[]};
const options=['North','South','A','B'].map(value=>({value,label:value}));
const manifest=chart=>({format:'datapass.web-app',schemaVersion:1,id:'chart-viz',version:'1.0.0',title:'Chart',description:'',label:'Test',theme:{accent:'#123456',density:'compact'},
  fields:[{id:'pick',label:'Pick',type:'multi',role:'view',default:'',options},{id:'one',label:'One',type:'select',role:'view',default:'North',options},{id:'range',label:'Range',type:'interval',role:'view',default:null,min:0,max:100},{id:'input',label:'Input',type:'select',role:'input',default:'North',options}],
  datasets:[dataset],tasks:[],pages:[{id:'p',title:'P',description:'',sections:[{id:'s',columns:1,blocks:[{id:'c',type:'chart',dataset:'sales',...chart}]}]}]});
const ok=chart=>validateManifest(manifest(chart));
const bad=(chart,pattern)=>assert.throws(()=>validateManifest(manifest(chart)),pattern);

test('chart renderer option: legacy blocks unchanged, viz-only options need renderer "viz"',()=>{
  ok({kind:'bar',x:'region',y:'revenue'});
  ok({kind:'bar',x:'region',y:'revenue',renderer:'vizforge'});
  ok({kind:'bar',x:'region',y:'revenue',renderer:'viz',series:'product',stack:'grouped',sort:'ascending',selection:'pick'});
  ok({kind:'line',x:'month',y:'revenue',renderer:'viz',y2:'margin'});
  ok({kind:'line',x:'month',y:'revenue',renderer:'viz',series:'region',selection:'one'});
  ok({kind:'scatter',x:'month',y:'revenue',renderer:'viz',selection:'range'});
  bad({kind:'bar',x:'region',y:'revenue',renderer:'svg'},/renderer: invalid choice/);
  bad({kind:'bar',x:'region',y:'revenue',series:'product'},/series needs renderer "viz"/);
  bad({kind:'bar',x:'region',y:'revenue',renderer:'vizforge',sort:'none'},/sort needs renderer "viz"/);
  bad({kind:'bar',x:'region',y:'revenue',renderer:'viz',series:'month'},/another string column/);
  bad({kind:'bar',x:'region',y:'revenue',renderer:'viz',y2:'margin'},/line chart/);
  bad({kind:'line',x:'month',y:'revenue',renderer:'viz',y2:'margin',series:'region'},/cannot be combined/);
  bad({kind:'line',x:'month',y:'revenue',renderer:'viz',sort:'descending'},/bar charts/);
  bad({kind:'bar',x:'region',y:'revenue',renderer:'viz',stack:'stacked'},/with a series/);
  bad({kind:'bar',x:'region',y:'revenue',renderer:'viz',selection:'range'},/view select\/multi/);
  bad({kind:'bar',x:'region',y:'revenue',renderer:'viz',selection:'input'},/view select\/multi/);
  bad({kind:'scatter',x:'month',y:'revenue',renderer:'viz',selection:'pick'},/view interval/);
  bad({kind:'line',x:'month',y:'revenue',renderer:'viz',selection:'pick'},/needs chart.series/);
});

test('a block renderer overrides the viz-chart flag; without it the flag decides',()=>{
  assert.equal(chartUsesViz({},()=>false),false);assert.equal(chartUsesViz({},()=>true),true);
  assert.equal(chartUsesViz({renderer:'viz'},()=>false),true);assert.equal(chartUsesViz({renderer:'vizforge'},()=>true),false);
});

const rows=[
  {id:'1',region:'North',product:'A',month:1,revenue:10,margin:20},{id:'2',region:'North',product:'B',month:2,revenue:30,margin:25},
  {id:'3',region:'South',product:'A',month:1,revenue:5,margin:12},{id:'4',region:'South',product:'B',month:2,revenue:-8,margin:9},
  {id:'5',region:'East',product:'A',month:3,revenue:null,margin:4},
];
const block=extra=>({id:'c',x:'region',y:'revenue',kind:'bar',renderer:'viz',...extra});

test('bar plan: series, stacked and grouped domains, sort and missing rows',()=>{
  const stacked=planChart(block({series:'product'}),dataset,rows);
  assert.equal(stacked.mark,'bar');assert.deepEqual(stacked.series.map(s=>s.key),['A','B']);
  assert.equal(stacked.marks,4);assert.equal(stacked.missing,1);
  assert.deepEqual(stacked.domains.y,[-8,40]);// positive stack North 10+30, negative stack South -8
  assert.deepEqual(stacked.categories.map(c=>c.key),['North','South']);// descending totals by default
  assert.equal(stacked.value('South','B'),-8);assert.ok(Number.isNaN(stacked.value('East','A')));
  const grouped=planChart(block({series:'product',stack:'grouped',sort:'ascending'}),dataset,rows);
  assert.deepEqual(grouped.domains.y,[-8,30]);assert.deepEqual(grouped.categories.map(c=>c.key),['South','North']);
  const unsorted=planChart(block({x:'id',sort:'none'}),dataset,rows.slice(0,3));
  assert.deepEqual(unsorted.categories.map(c=>c.key),['1','2','3']);assert.equal(unsorted.series.length,1);assert.deepEqual(unsorted.domains.y,[0,30]);
  assert.throws(()=>planChart(block({y:'region'}),dataset,rows),ChartPlanError);
});

test('bar plan keys rows by the row key without a series, like the VizForge ranking',()=>{
  const plan=planChart(block({x:'region'}),dataset,rows.slice(0,2));
  assert.deepEqual(plan.categories.map(c=>[c.key,c.label]),[['2','North'],['1','North']]);
  assert.throws(()=>planChart(block({series:'product'}),dataset,[...rows,{id:'6',region:'North',product:'A',month:4,revenue:1,margin:1}]),/Duplicate bar/);
});

test('line plan: series, dual axis and niced domains',()=>{
  const dual=planChart({id:'l',kind:'line',x:'month',y:'revenue',y2:'margin',renderer:'viz'},dataset,rows.filter(r=>r.region==='North'));
  assert.deepEqual(dual.series.map(s=>[s.key,s.axis]),[['revenue','y'],['margin','y2']]);
  assert.equal(dual.marks,4);assert.deepEqual(dual.domains.x,[1,2]);assert.deepEqual(dual.domains.y,[0,30]);assert.deepEqual(dual.domains.y2,[0,26]);
  const multi=planChart({id:'l',kind:'line',x:'month',y:'revenue',series:'region',renderer:'viz'},dataset,rows);
  assert.deepEqual(multi.lines.map(l=>[l.key,l.points.length]),[['North',2],['South',2]]);assert.equal(multi.missing,1);
  assert.deepEqual(multi.domains.y,[-10,30]);
  assert.throws(()=>planChart({id:'l',kind:'line',x:'month',y:'revenue',renderer:'viz'},dataset,rows.slice(0,3)),/two rows at X = 1/);
});

test('scatter plan and the VizForge domain rule for flat extents',()=>{
  const plan=planChart({id:'s',kind:'scatter',x:'month',y:'margin',renderer:'viz'},dataset,rows);
  assert.equal(plan.mark,'point');assert.equal(plan.marks,5);assert.deepEqual(plan.domains.x,[0,3]);assert.deepEqual(plan.domains.y,[0,26]);
  assert.deepEqual(extentDomain([5,5]),[4.5,5.5]);assert.deepEqual(extentDomain([0,0]),[-1,1]);assert.deepEqual(extentDomain([]),[0,1]);
  assert.throws(()=>planChart({id:'s',kind:'scatter',x:'region',y:'margin',renderer:'viz'},dataset,rows),/numeric X/);
});

test('bar orientation and ranking extras: horizontal ranking like VizForge, rank change against "previous"',()=>{
  ok({kind:'bar',x:'region',y:'revenue',renderer:'viz',orientation:'vertical',previous:'margin'});
  bad({kind:'bar',x:'region',y:'revenue',orientation:'vertical'},/orientation needs renderer "viz"/);
  bad({kind:'line',x:'month',y:'revenue',renderer:'viz',orientation:'horizontal'},/bar charts/);
  bad({kind:'bar',x:'region',y:'revenue',renderer:'viz',orientation:'diagonal'},/orientation: invalid choice/);
  bad({kind:'bar',x:'region',y:'revenue',renderer:'viz',previous:'region'},/previous must be another numeric column/);
  bad({kind:'bar',x:'region',y:'revenue',renderer:'viz',series:'product',previous:'margin'},/without a series/);
  const rows=[{id:'n',region:'North',revenue:30,margin:10},{id:'s',region:'South',revenue:50,margin:30},{id:'e',region:'East',revenue:20,margin:null},{id:'w',region:'West',revenue:40,margin:40}];
  const plain=planChart({id:'c',kind:'bar',x:'region',y:'revenue'},dataset,rows);
  assert.equal(plain.orientation,'horizontal');
  assert.deepEqual([...plain.ranks].map(([k,r])=>k+r.rank+r.delta),['s1—','w2—','n3—','e4—']);
  const ranked=planChart({id:'c',kind:'bar',x:'region',y:'revenue',previous:'margin'},dataset,rows);
  // Before: West 1, South 2, North 3, East none. Now: South 1, West 2, North 3, East 4.
  assert.deepEqual(Object.fromEntries([...ranked.ranks].map(([k,r])=>[k,r.delta])),{s:'↑1',w:'↓1',n:'·',e:'—'});
  assert.equal(planChart({id:'c',kind:'bar',x:'region',y:'revenue',orientation:'vertical'},dataset,rows).orientation,'vertical');
  const series=planChart({id:'c',kind:'bar',x:'region',y:'revenue',series:'product'},dataset,rows.map(r=>({...r,product:'A'})));
  assert.equal(series.orientation,'vertical');assert.equal(series.ranks,null);
});
