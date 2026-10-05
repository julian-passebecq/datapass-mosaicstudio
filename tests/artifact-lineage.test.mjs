import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateArtifact} from '../src/framework/foundation/artifact.ts';
import {artifactLineage,lineagePath,layoutLineage,artifactEvidence} from '../src/framework/foundation/lineage/model.ts';
import {loadEvidenceSources} from '../src/framework/foundation/lineage/sources.ts';

const committed='clients/python-wind-reference/public/artifacts/wind-aep-weibull.json';
const load=async()=>JSON.parse(await readFile(committed,'utf8'));
const legacy=a=>{const {producer,inputs,inputHash,dependsOn,...provenance}=a.provenance;return {...a,provenance,representations:a.representations.map(({inputs,...r})=>r)};};

test('old artifacts (no lineage fields) stay valid; the committed artifact carries lineage',async()=>{
  const a=await load();
  const old=validateArtifact(legacy(a));assert.equal(old.provenance.producer,undefined);
  const now=validateArtifact(a);
  assert.equal(now.provenance.producer.kind,'script');assert.match(now.provenance.inputHash,/^[0-9a-f]{64}$/);
  assert.deepEqual(now.provenance.inputs.map(i=>i.id),['k','ratedPower','speeds','hours','means']);
  const graph=artifactLineage(old);
  assert.deepEqual(graph.nodes.filter(n=>n.kind==='input'||n.kind==='evidence'||n.kind==='producer'),[]);
  assert.ok(graph.nodes.some(n=>n.id==='value:aep-8'));
});

test('new lineage fields are validated',async()=>{
  const a=await load();
  const variant=(edit)=>{const copy=structuredClone(a);edit(copy);return copy;};
  const cases=[
    [c=>{c.provenance.producer.kind='robot';},/producer kind/],
    [c=>{c.provenance.producer.extra=1;},/unexpected fields/],
    [c=>{c.provenance.inputHash='ABC';},/inputHash/],
    [c=>{c.provenance.inputs[0].evidence[0].path='../secret.py';},/safe relative path/],
    [c=>{c.provenance.inputs[0].evidence[0].path='C:/x.py';},/safe relative path/],
    [c=>{c.provenance.inputs[0].evidence[0].start=9;c.provenance.inputs[0].evidence[0].end=3;},/line range/],
    [c=>{c.provenance.inputs[0].evidence[0].start=1.5;},/line range/],
    [c=>{c.provenance.inputs.push({...c.provenance.inputs[0]});},/duplicate id/],
    [c=>{c.provenance.inputs[0].value=Number.NaN;},/finite number/],
    [c=>{c.provenance.inputs[0].secret='x';},/unexpected fields/],
    [c=>{c.provenance.dependsOn=['wind-aep-weibull'];},/depend on itself/],
    [c=>{c.provenance.dependsOn=['a','a'];},/duplicate id/],
    [c=>{c.representations[0].inputs=['nope'];},/undeclared input/],
    [c=>{delete c.provenance.inputs;},/undeclared input/],
  ];
  for(const [edit,error] of cases)assert.throws(()=>validateArtifact(variant(edit)),error);
  assert.equal(validateArtifact(variant(c=>{c.provenance.dependsOn=['power-curve'];})).provenance.dependsOn[0],'power-curve');
});

test('lineage graph: value -> representation -> artifact -> producer/inputs -> evidence; paths respect declared inputs',async()=>{
  const artifact=validateArtifact(await load()),graph=artifactLineage(artifact);
  const kinds=Object.fromEntries(graph.nodes.map(n=>[n.id,n.kind]));
  assert.equal(kinds['value:aep-8'],'value');assert.equal(kinds['rep:aep-8'],'representation');assert.equal(kinds['artifact:wind-aep-weibull'],'artifact');
  assert.equal(kinds['producer'],'producer');assert.equal(kinds['input:k'],'input');
  for(const e of graph.edges)assert.ok(kinds[e.from]&&kinds[e.to],'dangling edge '+e.from+'>'+e.to);
  const aep=lineagePath(graph,'value:aep-8');
  for(const id of ['value:aep-8','rep:aep-8','artifact:wind-aep-weibull','producer','input:k','input:hours'])assert.ok(aep.has(id),id);
  assert.ok(!aep.has('input:means'),'aep-8 does not use the mean-speed list');assert.ok(!aep.has('value:cf-8'));assert.ok(!aep.has('rep:table'));
  const k=graph.nodes.find(n=>n.kind==='evidence'&&n.label==='Weibull density');
  assert.ok(aep.has(k.id));
  const means=graph.nodes.find(n=>n.kind==='evidence'&&n.label==='Weibull scale from mean');
  const up=lineagePath(graph,means.id);
  assert.ok(up.has('input:means')&&up.has('rep:curve')&&up.has('rep:table'),'curve uses means; table declares no inputs');
  assert.ok(!up.has('rep:aep-8')&&!up.has('value:aep-8'));
  const seen=new Set(artifactEvidence(artifact).map(r=>r.path+':'+r.start+'-'+r.end));
  assert.equal(graph.nodes.filter(n=>n.kind==='evidence').length,seen.size);
});

test('layout is deterministic, left-to-right and non-overlapping',async()=>{
  const graph=artifactLineage(validateArtifact(await load()));
  const one=layoutLineage(graph),two=layoutLineage(structuredClone(graph));
  assert.deepEqual(one,two);
  assert.deepEqual(one.layers.map(l=>graph.nodes.find(n=>n.id===l[0]).rank),[0,1,2,3,4]);
  for(const e of graph.edges)assert.ok(one.points[e.to].x>one.points[e.from].x,'edge goes right: '+e.from);
  for(const layer of one.layers){const ys=layer.map(id=>one.points[id].y);for(let i=1;i<ys.length;i++)assert.ok(ys[i]>=ys[i-1]+one.nodeHeight);}
  assert.equal(one.points['artifact:wind-aep-weibull'].x,2*(one.nodeWidth+40));
  assert.deepEqual(one.layers[3].slice(0,2),['producer','input:k']);
  assert.equal(one.edges.length,graph.edges.length);
});

test('committed source copy matches the producer file and every citation points at real lines',async()=>{
  const artifact=validateArtifact(await load());
  const file=(await readFile('py/wind_reference_model.py','utf8')).replace(/\r\n/g,'\n');
  const copy=(await readFile('clients/python-wind-reference/public/sources/py/wind_reference_model.py.txt','utf8')).replace(/\r\n/g,'\n');
  assert.equal(copy,file,'stale source copy; rerun python py/wind_reference_model.py');
  const lines=file.split('\n');
  for(const ref of artifactEvidence(artifact)){assert.equal(ref.path,'py/wind_reference_model.py');assert.ok(ref.end<=lines.length);}
  const find=label=>artifactEvidence(artifact).find(r=>r.label===label);
  assert.match(lines[find('Trapezoid AEP integral').start-1],/^def annual_energy_mwh/);
  assert.match(lines[find('Rated power constant').start-1],/^RATED_KW =/);
  let requested=[];
  const result=await loadEvidenceSources(artifact,{base:'http://h/app/index.html',fetch:async url=>{requested.push(url);return {ok:true,status:200,text:async()=>copy};}});
  assert.deepEqual(requested,['http://h/app/sources/py/wind_reference_model.py.txt']);
  assert.equal(result.sources[0].language,'python');assert.deepEqual(result.missing,[]);
  const gone=await loadEvidenceSources(artifact,{base:'http://h/app/',fetch:async()=>({ok:false,status:404,text:async()=>''})});
  assert.deepEqual(gone,{sources:[],missing:['py/wind_reference_model.py']});
});
