import test from 'node:test';
import assert from 'node:assert/strict';
import {chartSpecSchema} from '../src/framework/viz/spec-schema.ts';
import {checkSpecShape} from '../src/framework/viz/spec-shape.ts';

/* The hot-path checker (no zod) must accept and reject exactly what the zod schema does, and return
 * the same data. A deterministic fuzz walks valid specs and applies one mutation at a time. */
const valid=[
  {id:'bars',mark:'bar',encoding:{x:{field:'region'},y:{field:'revenue',title:'Revenue',format:'.2s'}},stack:'stacked',sort:'descending',format:{unit:'EUR',digits:2,compact:true},selection:{field:'pick',mode:'multi',on:'region'},renderer:'svg'},
  {id:'k',title:'KPI',mark:'kpi',encoding:{y:{field:'v'},tooltip:[{field:'a'},{field:'b',title:'B'}]}},
  {id:'cloud',mark:'point3d',encoding:{x:{field:'x'},y:{field:'y'},z:{field:'z'},size:{field:'s'},series:{field:'g'},theta:{field:'t'},color:{field:'c'}},renderer:'webgl'},
  {id:'u',mark:'line',title:undefined,encoding:{x:{field:'m'},y:{field:'v'}},format:undefined},
];
const badValues=[undefined,null,0,1.5,-1,7,NaN,Infinity,'',' ','x','Bad',"a".repeat(81),"t".repeat(201),true,false,[],[{}],{},{field:'ok'},{field:'Bad'},{field:'ok',extra:1},new Date(0),Array(9).fill({field:'a'})];
let seed=7;const rnd=n=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed%n;};
function paths(o,prefix=[]){const out=[];if(o&&typeof o==='object')for(const k of Object.keys(o)){out.push([...prefix,k]);out.push(...paths(o[k],[...prefix,k]));}return out;}
function mutate(spec){
  const copy=structuredClone(spec),ps=paths(copy),kind=rnd(3);
  const target=ps.length?ps[rnd(ps.length)]:[];
  let parent=copy;for(const k of target.slice(0,-1))parent=parent[k];
  const key=target.at(-1);
  if(kind===0&&key!==undefined)parent[key]=badValues[rnd(badValues.length)];
  else if(kind===1&&key!==undefined)delete parent[key];
  else{const host=parent[key]&&typeof parent[key]==='object'&&!Array.isArray(parent[key])?parent[key]:parent;host[['script','extra','encoding','title','w','field','mode','digits'][rnd(8)]]=badValues[rnd(badValues.length)];}
  return copy;
}
function same(input){
  const z=chartSpecSchema.safeParse(input),s=checkSpecShape(input);
  assert.equal(s.success,z.success,'accept/reject differs for '+JSON.stringify(input,(k,v)=>v===undefined?'<undef>':Number.isNaN(v)?'<NaN>':v));
  if(z.success){assert.deepEqual(s.data,z.data);assert.notEqual(s.data,input,'checker must return a copy');}
  return z.success;
}
test('zod-free checker matches chartSpecSchema on valid specs and top-level junk',()=>{
  for(const spec of valid)assert.equal(same(spec),true);
  for(const v of badValues)same(v);
  same({id:'x',mark:'pie',encoding:{}});same({id:'x',mark:'bar',encoding:{},script:'alert(1)'});
  same({id:'x',mark:'bar',encoding:{tooltip:[undefined]}});same({id:'x',mark:'bar',encoding:{x:undefined}});
});
test('zod-free checker matches chartSpecSchema on 4000 single and double mutations',()=>{
  let accepted=0,rejected=0;
  for(let i=0;i<4000;i++){
    let spec=mutate(valid[i%valid.length]);if(i%3===0)spec=mutate(spec);
    if(same(spec))accepted++;else rejected++;
  }
  assert.ok(accepted>100&&rejected>1000,`corpus covers both outcomes (${accepted}/${rejected})`);
});
