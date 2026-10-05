import test from 'node:test';
import assert from 'node:assert/strict';
import {Motion,VirtualClock,cubicBezier,detectCapture,DURATIONS} from '../src/framework/viz/motion.ts';
import {parseChartSpec,fromLegacyChart,specFromTable,missingEncoded,ChartSpecError} from '../src/framework/viz/spec.ts';
import {chooseRenderer,routeSpec,estimateMarks,RENDER_LIMITS} from '../src/framework/viz/route.ts';
import {vizTokens,tokenVars,lightTokens,darkTokens} from '../src/framework/viz/tokens.ts';
import {crossfilter,groupSum} from '../src/framework/viz/crossfilter.ts';
import {parseMulti,encodeMulti,toggleMulti,parseInterval,encodeInterval,readMulti,readSelection} from '../src/framework/selection.ts';
import {validateManifest,parseSavedState} from '../src/framework/validate.ts';
import {SiteRuntime} from '../src/framework/runtime.ts';

/* ---- motion clock ---- */
function run(clockFactory){
  const clock=clockFactory(),motion=new Motion({clock}),frames=[];
  motion.tween({duration:'normal',onFrame:t=>frames.push([clock.now(),Number(t.toFixed(6))])});
  clock.settle();return {frames,settled:motion.settled};
}
test('virtual clock tweens are deterministic frame by frame',()=>{
  const a=run(()=>new VirtualClock()),b=run(()=>new VirtualClock());
  assert.deepEqual(a.frames,b.frames);assert.equal(a.settled,true);
  assert.equal(a.frames[0][1],0);assert.equal(a.frames.at(-1)[1],1);
  assert.equal(a.frames.at(-1)[0],Math.ceil(DURATIONS.normal/16)*16);
  for(let i=1;i<a.frames.length;i++)assert.ok(a.frames[i][1]>=a.frames[i-1][1],'eased progress is monotonic');
});
test('reduced motion and capture finish synchronously with no scheduled frame',()=>{
  for(const options of [{reduced:true},{capture:true}]){
    const clock=new VirtualClock(),motion=new Motion({...options,clock}),seen=[];let done=false;
    motion.tween({duration:'slow',onFrame:t=>seen.push(t),onDone:()=>{done=true;}});
    assert.deepEqual(seen,[1]);assert.equal(done,true);assert.equal(clock.pending,0);assert.equal(motion.settled,true);assert.equal(motion.duration('slow'),0);
  }
});
test('settled signal tracks active tweens and cancellation',()=>{
  const clock=new VirtualClock(),motion=new Motion({clock}),states=[];motion.subscribe(s=>states.push(s));
  const tween=motion.tween({onFrame:()=>{}});assert.equal(motion.settled,false);tween.cancel();assert.equal(motion.settled,true);assert.deepEqual(states,[false,true]);assert.equal(clock.pending,0);
});
test('cubic bezier curves hit their endpoints and Fluent decelerate front-loads progress',()=>{
  const f=cubicBezier([0.1,0.9,0.2,1]);assert.equal(f(0),0);assert.equal(f(1),1);assert.ok(f(0.25)>0.6);
  const linear=cubicBezier([0,0,1,1]);assert.ok(Math.abs(linear(0.37)-0.37)<1e-4);
});
test('capture mode comes from ?capture=1 or data-capture only',()=>{
  assert.equal(detectCapture({search:'?capture=1'},{dataset:{}}),true);
  assert.equal(detectCapture({search:'?app=x'},{dataset:{capture:''}}),true);
  assert.equal(detectCapture({search:'?capture=0'},{dataset:{}}),false);
});

/* ---- spec ---- */
const table={columns:[{id:'region',label:'Region',type:'string'},{id:'month',label:'Month',type:'number'},{id:'revenue',label:'Revenue',type:'number'},{id:'ok',label:'OK',type:'boolean'}],rows:[{region:'a',month:1,revenue:3,ok:true},{region:'b',month:2,revenue:null,ok:false}]};
test('chart specs validate structure, references and column types',()=>{
  const spec=parseChartSpec({id:'bars',mark:'bar',encoding:{x:{field:'region'},y:{field:'revenue'},color:{field:'region'}},stack:'stacked',selection:{field:'pick',mode:'multi'}},table);
  assert.equal(spec.stack,'stacked');
  assert.throws(()=>parseChartSpec({id:'bars',mark:'bar',encoding:{x:{field:'region'},y:{field:'region'}}},table),/must be numeric/);
  assert.throws(()=>parseChartSpec({id:'bars',mark:'bar',encoding:{x:{field:'nope'},y:{field:'revenue'}}},table),/unknown column/);
  assert.throws(()=>parseChartSpec({id:'bars',mark:'bar',encoding:{x:{field:'region'}}},table),/needs encoding.y/);
  assert.throws(()=>parseChartSpec({id:'bars',mark:'bar',encoding:{x:{field:'region'},y:{field:'revenue'}},stack:'stacked'},table),/stack needs/);
  assert.throws(()=>parseChartSpec({id:'x',mark:'pie',encoding:{}},table),ChartSpecError);
  assert.throws(()=>parseChartSpec({id:'x',mark:'bar',encoding:{x:{field:'region'},y:{field:'revenue'}},script:'alert(1)'},table),ChartSpecError);
});
test('legacy chart blocks translate and default specs come from the table',()=>{
  assert.deepEqual(fromLegacyChart({id:'c',x:'month',y:'revenue',kind:'scatter'}).encoding,{x:{field:'month'},y:{field:'revenue'}});
  assert.equal(fromLegacyChart({id:'c',x:'month',y:'revenue',kind:'scatter'}).mark,'point');
  const spec=specFromTable(table,{id:'auto'});assert.equal(spec.mark,'bar');assert.equal(spec.encoding.x.field,'region');assert.equal(spec.encoding.y.field,'month');
  assert.equal(missingEncoded(spec,table.rows),0);assert.equal(missingEncoded(fromLegacyChart({id:'m',x:'month',y:'revenue',kind:'line'}),table.rows),1);
});

/* ---- renderer routing ---- */
test('renderer selection follows estimated marks',()=>{
  assert.equal(chooseRenderer(48),'svg');assert.equal(chooseRenderer(RENDER_LIMITS.svg),'svg');assert.equal(chooseRenderer(RENDER_LIMITS.svg+1),'canvas');
  assert.equal(chooseRenderer(50000),'canvas');assert.equal(chooseRenderer(RENDER_LIMITS.canvas+1),'lazy-webgl');
  assert.equal(chooseRenderer(10,'canvas'),'canvas');assert.equal(chooseRenderer(9000,'svg'),'canvas');
  assert.throws(()=>chooseRenderer(-1));
  const point=parseChartSpec({id:'p',mark:'point',encoding:{x:{field:'month'},y:{field:'revenue'}}},table);
  assert.deepEqual(routeSpec(point,{length:50000}),{marks:50000,renderer:'canvas'});
  const arc=parseChartSpec({id:'a',mark:'arc',encoding:{theta:{field:'revenue'},color:{field:'region'}}},table);
  assert.equal(estimateMarks(arc,[{region:'a'},{region:'a'},{region:'b'}]),2);
});

/* ---- tokens ---- */
test('tokens expose light and dark sets as CSS variables and validate overrides',()=>{
  const vars=tokenVars(darkTokens);assert.equal(vars['--dp-viz-surface'],darkTokens.surface);assert.equal(vars['--dp-viz-categorical-8'],darkTokens.categorical[7]);
  assert.notEqual(lightTokens.surface,darkTokens.surface);
  assert.equal(vizTokens('light',{accent:'#123456'}).accent,'#123456');
  assert.throws(()=>vizTokens('light',{accent:'red'}),/#rrggbb/);
  assert.throws(()=>vizTokens('dark',{nope:'#ffffff'}),/Unknown viz token/);
});

/* ---- selection fields ---- */
const multi={id:'pick',options:[{value:'a',label:'A'},{value:'b',label:'B'},{value:'c',label:'C'}]},interval={id:'brush',min:0,max:40};
test('multi selections are canonical, declared and toggleable',()=>{
  assert.deepEqual(parseMulti(multi,''),[]);assert.deepEqual(parseMulti(multi,'a|c'),['a','c']);
  assert.throws(()=>parseMulti(multi,'c|a'),/declared order/);assert.throws(()=>parseMulti(multi,'a|a'),/unique/);assert.throws(()=>parseMulti(multi,'z'),/unknown option/);
  assert.equal(encodeMulti(multi,['c','a']),'a|c');
  assert.equal(toggleMulti(multi,'','b'),'b');assert.equal(toggleMulti(multi,'b','a'),'a|b');assert.equal(toggleMulti(multi,'a|b','a'),'b');
  assert.equal(toggleMulti(multi,'a|b','c',false),'c');assert.equal(toggleMulti(multi,'c','c',false),'');
});
test('interval selections are bounded, ordered and clamped when encoded',()=>{
  assert.equal(parseInterval(interval,null),null);assert.deepEqual(parseInterval(interval,'2.5:10'),[2.5,10]);
  assert.throws(()=>parseInterval(interval,'10:2'),/bounds/);assert.throws(()=>parseInterval(interval,'-1:5'),/bounds/);assert.throws(()=>parseInterval(interval,'1,5'),/lo:hi/);
  assert.equal(encodeInterval(interval,[12.3456789,-3]),'0:12.3457');assert.equal(encodeInterval(interval,null),null);
});
const manifest=()=>({format:'datapass.web-app',schemaVersion:1,id:'viz-test',version:'1.0.0',title:'Viz',description:'',label:'Test',theme:{accent:'#123456',density:'compact'},
  fields:[{id:'single',label:'Single',type:'select',role:'view',default:'a',options:multi.options},{id:'pick',label:'Pick',type:'multi',role:'view',default:'',options:multi.options},{id:'brush',label:'Brush',type:'interval',role:'view',default:null,min:0,max:40}],
  datasets:[],tasks:[],pages:[{id:'p',title:'P',description:'',sections:[{id:'s',columns:1,blocks:[{id:'t',type:'text',text:'x'}]}]}]});
test('manifests accept multi and interval view fields and reject invalid ones',()=>{
  validateManifest(manifest());
  const bad=manifest();bad.fields[1].role='input';assert.throws(()=>validateManifest(bad),/view fields/);
  const bad2=manifest();bad2.fields[2].step=1;assert.throws(()=>validateManifest(bad2),/bounds only/);
  const bad3=manifest();bad3.fields[1].options=[{value:'a|b',label:'x'}];assert.throws(()=>validateManifest(bad3),/cannot contain/);
  const bad4=manifest();bad4.fields[1].default='z';assert.throws(()=>validateManifest(bad4),/unknown option/);
  const bad5=manifest();bad5.pages[0].sections[0].blocks.push({id:'i',type:'input',field:'pick'});assert.throws(()=>validateManifest(bad5),/set by visuals/);
});
test('runtime applies multi and interval cues atomically; single select keeps working',()=>{
  const runtime=new SiteRuntime({manifest:manifest(),bindings:{}});
  runtime.applyCue({pick:'a|b',brush:'1:5',single:'c'});
  const values=runtime.getSnapshot().values;assert.deepEqual(readMulti(runtime.manifest,values,'pick'),['a','b']);assert.equal(readSelection(runtime.manifest,values,'single'),'c');
  assert.throws(()=>runtime.applyCue({pick:'b|a',brush:'2:3'}));
  assert.equal(runtime.getSnapshot().values.brush,'1:5','a rejected patch leaves state unchanged');
  const saved=runtime.save('p');assert.equal(parseSavedState(JSON.stringify(saved),runtime.manifest).values.pick,'a|b');
});

/* ---- crossfilter ---- */
test('crossfilter applies every filter except the visual\'s own dimension',()=>{
  const rows=[{r:'a',v:1},{r:'b',v:5},{r:'a',v:9},{r:'c',v:20}];
  const filters=[{id:'r',kind:'multi',accessor:x=>x.r,values:new Set(['a'])},{id:'v',kind:'interval',accessor:x=>x.v,interval:[0,10]}];
  assert.deepEqual([...crossfilter(rows,filters)],[0,2]);
  assert.deepEqual([...crossfilter(rows,filters,['r'])],[0,1,2]);
  assert.deepEqual([...crossfilter(rows,[{id:'r',kind:'multi',accessor:x=>x.r,values:new Set()}])],[0,1,2,3]);
  assert.deepEqual(Object.fromEntries(groupSum(rows,crossfilter(rows,filters,['r']),x=>x.r,x=>x.v)),{a:10,b:5});
});
