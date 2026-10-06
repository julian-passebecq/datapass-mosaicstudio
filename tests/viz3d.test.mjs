import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseChartSpec,ChartSpecError} from '../src/framework/viz/spec.ts';
import {routeSpec,fallback2D,is3D} from '../src/framework/viz/route.ts';
import {insidePolygon,lassoSelect,boundsOf,ramp,niceMax} from '../src/framework/viz/webgl/geometry.ts';
import {poseAt,mixPose,TOUR,DEFAULT_POSE} from '../src/framework/viz/webgl/pose.ts';
import {Motion,VirtualClock} from '../src/framework/viz/motion.ts';
import {vizChartEnabled} from '../src/framework/blocks/chart-flag.ts';

const table={columns:[{id:'region',label:'Region',type:'string'},{id:'month',label:'Month',type:'number'},{id:'revenue',label:'Revenue',type:'number'},{id:'discount',label:'Discount',type:'number'},{id:'margin',label:'Margin',type:'number'}]};
const bar3d={id:'cols',mark:'bar3d',encoding:{x:{field:'month'},y:{field:'region'},z:{field:'revenue'}},selection:{field:'fg-region',mode:'multi'}};
const surface={id:'surf',mark:'surface',encoding:{x:{field:'discount'},y:{field:'margin'},z:{field:'revenue'}}};
const cloud={id:'cloud',mark:'point3d',encoding:{x:{field:'discount'},y:{field:'margin'},z:{field:'revenue'}},selection:{field:'fg-discount',mode:'interval',on:'discount'}};

test('3D specs validate their z channel and column types',()=>{
  assert.equal(parseChartSpec(bar3d,table).mark,'bar3d');parseChartSpec(surface,table);parseChartSpec(cloud,table);
  assert.throws(()=>parseChartSpec({...bar3d,encoding:{x:{field:'month'},y:{field:'region'}}},table),/needs encoding.z/);
  assert.throws(()=>parseChartSpec({...bar3d,encoding:{...bar3d.encoding,z:{field:'region'}}},table),/must be numeric/);
  assert.throws(()=>parseChartSpec({...surface,encoding:{...surface.encoding,x:{field:'region'}}},table),/must be numeric/);
  assert.throws(()=>parseChartSpec({id:'b',mark:'bar',encoding:{x:{field:'region'},y:{field:'revenue'}},renderer:'webgl'},table),/webgl renderer is for 3D/);
  assert.throws(()=>parseChartSpec({...cloud,encoding:{...cloud.encoding,w:{field:'month'}}},table),ChartSpecError);
});
test('3D marks route to the lazy webgl renderer; without WebGL to their 2D equivalent',()=>{
  for(const s of [bar3d,surface,cloud])assert.equal(is3D(s.mark),true);
  assert.equal(is3D('bar'),false);
  assert.deepEqual(routeSpec(parseChartSpec(bar3d,table),{length:48}),{marks:48,renderer:'webgl'});
  assert.equal(routeSpec(parseChartSpec(cloud,table),{length:120000}).renderer,'webgl');
  const cols=routeSpec(parseChartSpec(bar3d,table),{length:48},{webgl:false});
  assert.equal(cols.renderer,'svg');assert.equal(cols.fallback.mark,'rect');assert.deepEqual(cols.fallback.encoding.color,{field:'revenue'});assert.equal(cols.fallback.encoding.z,undefined);
  const surf=routeSpec(parseChartSpec(surface,table),{length:525},{webgl:false});assert.equal(surf.fallback.mark,'rect');assert.equal(surf.renderer,'svg');
  const pts=routeSpec(parseChartSpec(cloud,table),{length:120000},{webgl:false});
  assert.equal(pts.renderer,'canvas');assert.equal(pts.fallback.mark,'point');assert.deepEqual(pts.fallback.encoding.size,{field:'revenue'});assert.deepEqual(pts.fallback.selection,cloud.selection);
  // Fallbacks are themselves valid 2D specs.
  parseChartSpec(cols.fallback,table);parseChartSpec(pts.fallback,table);
  const flat=parseChartSpec({id:'b',mark:'bar',encoding:{x:{field:'region'},y:{field:'revenue'}}},table);
  assert.equal(fallback2D(flat),flat);assert.equal(routeSpec(flat,{length:12},{webgl:false}).renderer,'svg');
  assert.equal(fallback2D(parseChartSpec({...cloud,renderer:'webgl'},table)).renderer,'auto');
});
test('screen-space lasso selects kept points inside the polygon and ignores points behind the camera',()=>{
  const square=[[0,0],[10,0],[10,10],[0,10]];
  assert.equal(insidePolygon(5,5,square),true);assert.equal(insidePolygon(11,5,square),false);
  const concave=[[0,0],[10,0],[10,10],[5,4],[0,10]];assert.equal(insidePolygon(5,8,concave),false);assert.equal(insidePolygon(2,2,concave),true);
  const projected=new Float32Array([1,1, 5,5, 20,20, NaN,NaN, 9,9]);
  assert.deepEqual([...lassoSelect(projected,square,()=>true)],[0,1,4]);
  assert.deepEqual([...lassoSelect(projected,square,i=>i!==1)],[0,4]);
  assert.equal(lassoSelect(projected,[[0,0],[1,1]],()=>true).length,0);
  assert.deepEqual(boundsOf(Uint32Array.from([0,2]),[3,9,1],[5,0,-2]),{x:[1,3],y:[-2,5]});assert.equal(boundsOf([],[],[]),null);
});
test('colour ramps sample token stops; axis maxima are nice',()=>{
  assert.deepEqual(ramp(['#000000','#ffffff'],0),[0,0,0]);assert.deepEqual(ramp(['#000000','#ffffff'],1),[1,1,1]);
  assert.ok(Math.abs(ramp(['#000000','#ffffff'],0.5)[0]-0.5)<1e-9);assert.deepEqual(ramp(['#ff0000'],0.3),[1,0,0]);
  assert.equal(niceMax(3.2e6),5e6);assert.equal(niceMax(2400),2500);assert.equal(niceMax(0),1);
});
test('camera keyframes interpolate on the shortest arc and replay identically on a virtual clock',()=>{
  const a={azimuth:3,elevation:0.2,distance:10},b={azimuth:-3,elevation:0.4,distance:20},m=mixPose(a,b,0.5);
  assert.ok(Math.abs(Math.abs(m.azimuth)-Math.PI)<0.01,'wraps through pi, not through 0');
  assert.deepEqual(poseAt(TOUR,0),{...DEFAULT_POSE});assert.deepEqual(poseAt(TOUR,1),{...DEFAULT_POSE});
  const path=()=>{const clock=new VirtualClock(),motion=new Motion({clock}),seen=[];motion.tween({duration:1600,curve:'standard',onFrame:t=>seen.push(poseAt(TOUR,t).azimuth.toFixed(6))});clock.settle();return seen;};
  const p1=path(),p2=path();assert.deepEqual(p1,p2);assert.ok(p1.length>90);
  // Capture / reduced motion: the tour lands on its last keyframe at once.
  const seen=[];new Motion({capture:true}).tween({duration:1600,onFrame:t=>seen.push(t)});assert.deepEqual(seen,[1]);
});
test('the chart block routes through viz by default; the flag is now an opt-out',()=>{
  assert.equal(vizChartEnabled({},{search:''},{dataset:{}}),true);
  assert.equal(vizChartEnabled(undefined,undefined,undefined),true);
  assert.equal(vizChartEnabled({},{search:'?viz-chart=1'},{dataset:{}}),true);
  assert.equal(vizChartEnabled({VITE_DP_VIZ_CHART:'1'},{search:''},{dataset:{}}),true);
  assert.equal(vizChartEnabled({},{search:''},{dataset:{vizChart:'on'}}),true);
  // Opt-outs: build, document, page; the page wins over the document, the document over the build.
  assert.equal(vizChartEnabled({VITE_DP_VIZ_CHART:'0'},{search:''},{dataset:{}}),false);
  assert.equal(vizChartEnabled({},{search:''},{dataset:{vizChart:'off'}}),false);
  assert.equal(vizChartEnabled({},{search:'?viz-chart=0'},{dataset:{}}),false);
  assert.equal(vizChartEnabled({VITE_DP_VIZ_CHART:'0'},{search:'?viz-chart=1'},{dataset:{vizChart:'off'}}),true);
  assert.equal(vizChartEnabled({},{search:'?viz-chart=0'},{dataset:{vizChart:'on'}}),false);
  assert.equal(vizChartEnabled({VITE_DP_VIZ_CHART:'0'},{search:''},{dataset:{vizChart:'on'}}),true);
});
test('the viz core never imports the WebGL chunk',async()=>{
  const index=await readFile('src/framework/viz/index.ts','utf8');assert.doesNotMatch(index,/webgl|three/);
  const wrapper=await readFile('src/framework/viz/webgl/Chart3D.tsx','utf8');
  assert.doesNotMatch(wrapper,/^import[^;]*from 'three'/m);assert.match(wrapper,/import\('\.\/engine\.ts'\)/);assert.match(wrapper,/import type \{[^}]*\} from '\.\/engine\.ts'/);
});
