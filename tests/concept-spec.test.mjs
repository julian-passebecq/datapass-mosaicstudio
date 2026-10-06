import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {checkConceptSpec,parseConceptSpec,parseConceptJson,readConceptJson,ConceptSpecError,CONCEPT_KINDS,conceptSpecJsonSchema,CONCEPT_SPEC_VERSION,CONCEPT_SCHEMA_URL,
  layerCakeSvg,isometricSvg,toMotion,KINDS,FLAT_GLYPHS,CONCEPT_GLYPHS,registerConceptGlyphs,grid,flatCard,flatHead,cardText,textWidth,fitText,layerY,FLAT,
  filmFrame,FILM_DURATION} from '../src/framework/concept/index.ts';
import {ICON_NAMES} from '../src/framework/concept/three/icons.ts';
import {hasMotionGlyph} from '../src/framework/motion/glyphs.ts';
import {validateMotion} from '../src/framework/motion/model.ts';
import {safeSpecPath} from '../clients/concept-viewer/examples.ts';
import {loadClient} from '../scripts/load-client.mjs';
import {SiteRuntime} from '../src/framework/runtime.ts';

const EX='clients/concept-viewer/public/examples/';
const files=(await readdir(EX)).filter(f=>f.endsWith('.concept.json')).sort();
const examples=await Promise.all(files.map(async f=>parseConceptJson(await readFile(EX+f,'utf8'))));
const byId=id=>examples.find(s=>s.id===id);
const minimal=()=>({format:'datapass.concept-spec',version:1,id:'mini',title:'Mini',provenance:'synthetic',note:'Synthetic.',
  layers:[{id:'data',label:'Data',height:0},{id:'apps',label:'Apps',height:1}],domains:[{id:'main',label:'Main'}],
  nodes:[{id:'db',kind:'sql-db',layer:'data',domain:'main',label:'DB'},{id:'ui',kind:'web-app',layer:'apps',domain:'main',label:'UI'}],
  flows:[{id:'f',from:'db',to:'ui',kind:'data',label:'Rows'}]});
const issues=input=>{const r=checkConceptSpec(input);assert.equal(r.ok,false);return r.issues.map(i=>i.path+': '+i.message).join('\n');};

test('the three examples validate and cover the required kinds, flows and side bands',()=>{
  assert.deepEqual(files,['cloud-data-platform.concept.json','datapass-stack.concept.json','forecast-app.concept.json']);
  const app=byId('forecast-app');
  for(const k of ['web-app','api','semantic-model','sql-db','stream','endpoint','report','identity','lake'])assert.ok(app.nodes.some(n=>n.kind===k),k);
  assert.ok(app.domains.some(d=>d.placement==='side'));
  assert.deepEqual([...new Set(app.flows.map(f=>f.kind))].sort(),['auth','control','data']);
  assert.ok(app.flows.some(f=>f.direction==='both')&&app.nodes.some(n=>n.status==='planned')&&app.annotations.length>0);
  assert.equal(byId('datapass-stack').provenance,'documented');
  for(const s of examples)assert.ok(s.provenance==='documented'||/SYNTHETIC/.test(s.note),s.id+' is labelled synthetic');
});

test('minimal spec: defaults are filled and the input is not mutated',()=>{
  const input=minimal(),before=structuredClone(input),s=parseConceptSpec(input);
  assert.deepEqual(input,before);
  assert.equal(s.nodes[0].status,'active');assert.equal(s.flows[0].direction,'forward');assert.equal(s.domains[0].placement,'main');
  assert.deepEqual(s.annotations,[]);assert.equal(s.subtitle,'');
  assert.match(layerCakeSvg(s),/data-node="ui"/);assert.match(isometricSvg(s),/data-entity="db"/);
});

test('validation fails closed with a path and a clear message for each problem',()=>{
  const cases=[
    [s=>{s.nodes[0].kind='spaceship';},/nodes\[0\]\.kind: unknown node kind "spaceship"; expected one of: app, web-app/],
    [s=>{s.nodes[0].layer='nowhere';},/nodes\[0\]\.layer: unknown layer "nowhere"; declared layers: data, apps/],
    [s=>{s.nodes[1].domain='x';},/nodes\[1\]\.domain: unknown domain "x"/],
    [s=>{s.nodes[1].id='db';},/nodes\[1\]\.id: duplicate id "db" \(already used at nodes\[0\]\.id\)/],
    [s=>{s.flows[0].to='ghost';},/flows\[0\]\.to: unknown node "ghost"/],
    [s=>{s.flows[0].to='db';},/flows\[0\]: a flow must join two distinct nodes/],
    [s=>{s.flows.push({...s.flows[0],id:'g'});},/duplicate flow db → ui/],
    [s=>{s.flows[0].kind='magic';},/flows\[0\]\.kind: unknown flow kind "magic"; expected one of: data, control, auth/],
    [s=>{s.layers[1].height=.3;},/layers\[1\]\.height: must be at least 0\.6 above "data"/],
    [s=>{s.layers[0].height=-1;},/layers\[0\]\.height: must be ≥ 0/],
    [s=>{s.nodes.push({id:'lake',kind:'lake',layer:'apps',domain:'main',label:'Lake'});},/the lake lies on the bottom layer "data"/],
    [s=>{s.provenance='documented';},/nodes\[0\]\.sources: a documented spec needs at least one source or evidence ref per node/],
    [s=>{s.specVersion='2.0.0';},/specVersion: must be a 1\.x semver version/],
    [s=>{s.specVersion=1;},/specVersion: must be a semver string/],
    [s=>{s.nodes[0].evidence=[{kind:'Source',ref:'a.ts'}];},/nodes\[0\]\.evidence\[0\]\.kind: must be a lowercase evidence kind/],
    [s=>{s.flows[0].evidence=[{kind:'url',ref:''}];},/flows\[0\]\.evidence\[0\]\.ref: must not be empty/],
    [s=>{s.flows[0].evidence=[{kind:'url'}];},/flows\[0\]\.evidence\[0\]\.ref: is required/],
    [s=>{s.nodes[0].label='x'.repeat(41);},/nodes\[0\]\.label: must be at most 40 characters/],
    [s=>{s.nodes[0].label='  ';},/nodes\[0\]\.label: must not be blank/],
    [s=>{s.format='datapass.arch-atlas';},/format: must be "datapass.concept-spec"/],
    [s=>{s.domains.unshift({id:'auth',label:'Auth',placement:'side'});},/side domains must come after every main domain|needs at least one main domain/],
    [s=>{for(let i=0;i<3;i++)s.nodes.push({id:'n'+i,kind:'api',layer:'data',domain:'main',label:'N'});},/cell data \/ main holds more than 3 nodes/],
    [s=>{s.annotations=[{id:'a',target:'ghost',text:'x'}];},/annotations\[0\]\.target: unknown node "ghost"/],
  ];
  for(const [mutate,pattern] of cases){const s=minimal();mutate(s);assert.match(issues(s),pattern);}
  const multi=minimal();multi.nodes[0].layer='a';multi.flows[0].to='b';
  assert.equal(checkConceptSpec(multi).issues.length,2,'every issue is reported, not only the first');
  assert.throws(()=>parseConceptSpec(multi),e=>e instanceof ConceptSpecError&&e.issues.length===2&&/Concept spec is invalid:\n- nodes\[0\]\.layer/.test(e.message));
  assert.throws(()=>parseConceptJson('{nope'),/not valid JSON/);
  assert.throws(()=>parseConceptJson(' '.repeat(300*1024)),/larger than/);
});

test('JSON Schema export matches the zod schema and the committed contract',async()=>{
  const committed=JSON.parse(await readFile('docs/contracts/concept-spec.schema.json','utf8'));
  assert.deepEqual(committed,JSON.parse(JSON.stringify(conceptSpecJsonSchema)));
  assert.deepEqual(conceptSpecJsonSchema.properties.nodes.items.properties.kind.enum,[...CONCEPT_KINDS]);
  assert.equal(conceptSpecJsonSchema.additionalProperties,true,"unknown fields are allowed (readers ignore them with a warning)");
  assert.deepEqual(conceptSpecJsonSchema.required,['format','version','id','title','provenance','note','layers','domains','nodes','flows']);
  assert.equal(conceptSpecJsonSchema.properties.nodes.items.properties.label.maxLength,40);
  assert.equal(conceptSpecJsonSchema.properties.layers.maxItems,8);
});

test('unknown fields are ignored with a warning; specVersion is checked; evidence is normalized on nodes and flows',()=>{
  const input={...minimal(),specVersion:'1.0.0',extra:1};input.nodes[0].lable='typo';input.flows[0].evidence=[{kind:'source',ref:'src/q.ts',label:'Query',color:'x'}];
  const r=checkConceptSpec(input);assert.equal(r.ok,true);
  assert.deepEqual(r.warnings.map(w=>w.path).sort(),['extra','flows[0].evidence[0].color','nodes[0].lable']);
  assert.match(r.warnings.find(w=>w.path==='extra').message,/unknown field "extra" ignored/);
  assert.equal('extra' in r.spec,false,'unknown fields never reach the normalized spec');
  assert.deepEqual(r.spec.flows[0].evidence,[{kind:'source',ref:'src/q.ts',label:'Query'}]);
  assert.deepEqual(r.spec.nodes[0].evidence,[]);
  assert.match(checkConceptSpec(minimal()).warnings[0].message,/specVersion|missing; read as 1\.0\.0/);
  assert.match(checkConceptSpec({...minimal(),specVersion:'1.4.0'}).warnings[0].message,/file is 1\.4\.0, this reader knows 1\.0\.0/);
  assert.equal(checkConceptSpec({...minimal(),specVersion:CONCEPT_SPEC_VERSION}).warnings.length,0);
  const documented={...minimal(),provenance:'documented'};
  documented.nodes[0].evidence=[{kind:'source',ref:'db.sql'}];documented.nodes[1].sources=[{path:'ui.tsx'}];
  assert.equal(checkConceptSpec(documented).ok,true,'a documented node may cite evidence instead of sources');
  const {spec,warnings}=readConceptJson(JSON.stringify({...minimal(),specVersion:'1.0.0',future:{x:1}}));
  assert.equal(spec.id,'mini');assert.equal(warnings.length,1);
  assert.throws(()=>readConceptJson('{}'),ConceptSpecError);
});

test('published contract spec/concept/v1: schema matches zod, carries $id and version; examples validate without warnings',async()=>{
  const published=JSON.parse(await readFile('spec/concept/v1/concept-spec.schema.json','utf8'));
  assert.deepEqual(published,JSON.parse(JSON.stringify(conceptSpecJsonSchema)),'Published schema drifted from zod: run npm run contracts');
  assert.equal(published.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(published.$id,'https://raw.githubusercontent.com/julian-passebecq/datapass-mosaicstudio/main/spec/concept/v1/concept-spec.schema.json');
  assert.equal(published.$id,CONCEPT_SCHEMA_URL);
  assert.equal(published.version,CONCEPT_SPEC_VERSION);assert.match(CONCEPT_SPEC_VERSION,/^1\.\d+\.\d+$/);
  assert.ok(published.properties.specVersion.pattern.startsWith('^1\\.'));
  for(const where of [published.properties.nodes.items,published.properties.flows.items]){
    const ev=where.properties.evidence;assert.equal(ev.type,'array');assert.deepEqual(ev.items.required,['kind','ref']);assert.equal(ev.maxItems,12);
  }
  const names=(await readdir('spec/concept/v1')).sort();
  assert.deepEqual(names,['README.md','concept-spec.schema.json','example.forecast-app.concept.json','example.minimal.concept.json']);
  for(const name of names.filter(n=>n.endsWith('.concept.json'))){
    const raw=JSON.parse(await readFile('spec/concept/v1/'+name,'utf8')),r=checkConceptSpec(raw);
    assert.equal(r.ok,true,name);assert.deepEqual(r.warnings,[],name);assert.equal(raw.specVersion,'1.0.0');assert.equal(raw.$schema,'./concept-spec.schema.json');
  }
  const minimalEx=JSON.parse(await readFile('spec/concept/v1/example.minimal.concept.json','utf8'));
  assert.ok(minimalEx.nodes.every(n=>n.evidence?.length)&&minimalEx.flows.every(f=>f.evidence?.length),'the minimal example shows evidence on nodes and flows');
  const viewer=JSON.parse(await readFile(EX+'forecast-app.concept.json','utf8')),pub=JSON.parse(await readFile('spec/concept/v1/example.forecast-app.concept.json','utf8'));
  delete viewer.$schema;delete pub.$schema;assert.deepEqual(pub,viewer,'the published forecast example is the viewer example');
  const readme=await readFile('spec/concept/v1/README.md','utf8');
  for(const topic of ['specVersion','backward compatible','evidence','ignored','Required','exporter'])assert.ok(readme.toLowerCase().includes(topic.toLowerCase()),topic);
});

test('validator CLI: exit 0 on valid files, 1 with path: message on invalid ones, --strict fails on warnings',async()=>{
  const {spawnSync}=await import('node:child_process'),{mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),path=await import('node:path');
  const dir=await mkdtemp(path.join(tmpdir(),'concept-cli-'));
  try{
    const bad={...minimal(),specVersion:'1.0.0'};bad.flows[0].to='ghost';
    const warn={...minimal(),specVersion:'1.0.0',extra:true};
    await writeFile(path.join(dir,'bad.json'),JSON.stringify(bad));await writeFile(path.join(dir,'warn.json'),JSON.stringify(warn));
    const run=(...a)=>spawnSync(process.execPath,['scripts/concept-validate.mjs',...a],{encoding:'utf8'});
    const ok=run('spec/concept/v1/example.minimal.concept.json');assert.equal(ok.status,0,ok.stderr);assert.match(ok.stdout,/^OK {3}spec\/concept\/v1\/example\.minimal\.concept\.json {2}minimal-orders/);
    const fail=run(path.join(dir,'bad.json'));assert.equal(fail.status,1);assert.match(fail.stdout,/FAIL[^\n]*bad\.json\n {2}error {3}flows\[0\]\.to: unknown node "ghost"/);
    assert.equal(run(path.join(dir,'warn.json')).status,0);
    const strict=run('--strict',path.join(dir,'warn.json'));assert.equal(strict.status,1);assert.match(strict.stdout,/warning extra: unknown field "extra" ignored/);
    const json=JSON.parse(run('--json',path.join(dir,'bad.json')).stdout);assert.equal(json.results[0].ok,false);assert.equal(json.specVersion,CONCEPT_SPEC_VERSION);
    assert.equal(run().status,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('standalone viewer: ?src= accepts https (and local http) only, and reads with no credentials and a size bound',async()=>{
  const {checkSpecUrl,fetchSpecText}=await import('../clients/concept-viewer/standalone/source.ts');
  for(const ok of ['https://raw.githubusercontent.com/o/r/main/a.concept.json','http://localhost:8080/a.json','http://127.0.0.1/a.json'])assert.equal(checkSpecUrl(ok).ok,true,ok);
  for(const [bad,msg] of [['file:///C:/a.json',/must use https/],['http://example.com/a.json',/must use https/],['javascript:alert(1)',/must use https/],['data:application/json,{}',/must use https/],
    ['https://user:pw@example.com/a.json',/user name or password/],['examples/a.json',/absolute URL/],['',/empty/],[null,/empty/],['https://x/'+'a'.repeat(2001),/longer than/]])
    assert.match(checkSpecUrl(bad).message??'',msg,String(bad));
  let init;const text=await fetchSpecText('https://x.test/a.json',async(_u,i)=>{init=i;return new Response('{"a":1}');});
  assert.equal(text,'{"a":1}');assert.equal(init.credentials,'omit');assert.equal(init.referrerPolicy,'no-referrer');
  await assert.rejects(fetchSpecText('https://x.test/a.json',async()=>{throw new TypeError('Failed to fetch');}),/Access-Control-Allow-Origin/);
  await assert.rejects(fetchSpecText('https://x.test/a.json',async()=>new Response('',{status:404})),/HTTP 404/);
  await assert.rejects(fetchSpecText('https://x.test/a.json',async()=>new Response('x',{headers:{'content-length':String(300*1024)}})),/larger than 256 KB/);
});

test('standalone embed API: only the exact load type is read; the spec is turned into bounded JSON text',async()=>{
  const {embeddedSpecText,readyMessage,EMBED_LOAD,EMBED_READY}=await import('../clients/concept-viewer/standalone/embed.ts');
  assert.equal(EMBED_LOAD,'datapass.concept-spec/load');assert.equal(EMBED_READY,'datapass.concept-spec/ready');
  for(const ignored of [null,'datapass.concept-spec/load',42,{},{type:'datapass.concept-spec/ready'},{type:'DATAPASS.CONCEPT-SPEC/LOAD',spec:{}},{kind:EMBED_LOAD}])assert.equal(embeddedSpecText(ignored),null);
  assert.equal(embeddedSpecText({type:EMBED_LOAD,spec:{id:'x'}}),'{"id":"x"}');
  assert.equal(embeddedSpecText({type:EMBED_LOAD,spec:'{"id":"y"}'}),'{"id":"y"}');
  assert.equal(embeddedSpecText({type:EMBED_LOAD}),'null');
  assert.throws(()=>parseConceptJson(embeddedSpecText({type:EMBED_LOAD,spec:{pad:'x'.repeat(300*1024)}})),/larger than 256 KB/);
  assert.deepEqual(readyMessage(),{type:EMBED_READY,specVersion:CONCEPT_SPEC_VERSION});
  assert.deepEqual(readyMessage({ok:true,id:'a'}),{type:EMBED_READY,specVersion:CONCEPT_SPEC_VERSION,result:{ok:true,id:'a'}});
});

test('standalone embed API: load options are optional and only valid values are kept',async()=>{
  const {embedOptions,EMBED_LOAD}=await import('../clients/concept-viewer/standalone/embed.ts');
  for(const none of [null,{type:EMBED_LOAD},{type:EMBED_LOAD,options:null},{type:EMBED_LOAD,options:[1]},{type:EMBED_LOAD,options:'embed'}])assert.deepEqual(embedOptions(none),{});
  assert.deepEqual(embedOptions({type:EMBED_LOAD,options:{view:'layered',fit:true,chrome:'embed',theme:'auto'}}),{view:'layered',fit:true,chrome:'embed',theme:'auto'});
  assert.deepEqual(embedOptions({type:EMBED_LOAD,options:{view:'globe',fit:'yes',chrome:'none',theme:'dark',extra:1}}),{theme:'dark'});
});

test('every kind has a label, a color, a flat glyph, an isometric glyph and a 3D icon',()=>{
  registerConceptGlyphs();
  for(const k of CONCEPT_KINDS){
    const info=KINDS[k];assert.ok(info.label&&/^#[0-9a-f]{6}$/.test(info.color),k);
    assert.ok(FLAT_GLYPHS.includes(info.flat),k+' flat');assert.ok(hasMotionGlyph(info.iso),k+' iso '+info.iso);
    assert.ok(k==='lake'||ICON_NAMES.includes(info.icon),k+' icon');
  }
  assert.ok(Object.keys(CONCEPT_GLYPHS).every(n=>n.startsWith('concept-')));
});

test('one spec, three renderings with the same ids; layer heights drive the 3D and isometric elevation',()=>{
  for(const s of examples){
    const flat=layerCakeSvg(s),iso=isometricSvg(s),m=toMotion(s);
    assert.doesNotThrow(()=>validateMotion(m));
    assert.ok(!iso.includes('data-glyph-fallback'),s.id+' uses no fallback glyph');
    for(const n of s.nodes){assert.ok(flat.includes(`data-node="${n.id}"`));assert.ok(iso.includes(`data-entity="${n.id}" data-glyph="${KINDS[n.kind].iso}"`));}
    for(const f of s.flows){assert.ok(flat.includes(`data-flow="${f.id}"`));assert.ok(iso.includes(`data-link="${f.id}"`));}
    const g=grid(s);s.layers.forEach((l,i)=>{assert.equal(m.layers[i].z,(l.height-s.layers[0].height)*3.1);assert.equal(layerY(g,i),(l.height-s.layers[0].height)*4.2);});
    assert.equal(layerCakeSvg(s),layerCakeSvg(parseConceptSpec(structuredClone(s))),'deterministic');
  }
  const app=byId('forecast-app'),flat=layerCakeSvg(app),iso=isometricSvg(app);
  assert.match(flat,/data-domain="access" data-placement="side"/);
  assert.match(flat,/data-flow="f-id-api"[^>]*data-kind="auth"><title>[^<]*<\/title><path [^>]*stroke="#7d68a8"[^>]*stroke-dasharray="1.5 3.5"/);
  assert.match(flat,/data-flow="f-ui-api"[^]*?marker-start="url\(#arrow-data\)"/);
  assert.match(flat,/data-node="variance-alert"[^>]*data-status="planned"/);
  assert.equal((flat.match(/data-annotation=/g)||[]).length,app.annotations.length);
  assert.match(iso,/<g data-link="f-id-api" data-kind="auth"/);assert.match(iso,/data-legend-auth/);
  assert.match(iso,/data-link="f-api-db"[^]*?marker-start=/);
  assert.equal((iso.match(/data-annotation=/g)||[]).length,app.annotations.length);
});

test('labels never clip: fitted text stays inside its card, the gutter, the header and the canvas (estimated metrics)',()=>{
  const card=FLAT.card.w-64-8;
  for(const label of ['DB','Sales lakehouse','SQL analytics endpoint','A very long node label that wraps around','Supercalifragilisticexpialidocious']){
    const t=cardText(label,'External system');
    assert.ok(t.name.lines.length<=3,label);
    for(const line of t.name.lines)assert.ok(textWidth(line,t.name.size,{bold:true})<=card,label+' / '+line);
    assert.ok(textWidth(t.kind.text,t.kind.size,{letterSpacing:.6})<=card);
  }
  const long=parseConceptSpec({...minimal(),title:'A '+'very '.repeat(21)+'long title',subtitle:'S '.repeat(110).trim(),
    domains:[{id:'main',label:'A rather long domain label for one column'}],layers:[{id:'data',label:'A very long layer label that must wrap in the gutter',height:0},{id:'apps',label:'Apps',height:1}]});
  const head=flatHead(long),inner=head.W-2*FLAT.margin;
  for(const line of head.title.lines)assert.ok(textWidth(line,head.title.size,{bold:true})<=inner);
  for(const line of head.subtitle.lines)assert.ok(textWidth(line,head.subtitle.size)<=inner);
  const svg=layerCakeSvg(long),H=Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)[1]);
  const ys=[...svg.matchAll(/<text [^>]*y="([\d.]+)"/g)].map(m=>Number(m[1]));
  assert.ok(Math.max(...ys)<H&&Math.min(...ys)>0);
  assert.ok(flatCard(long,grid(long),'db').y>head.domains.y,'cards start below the header');
  const fit=fitText('word '.repeat(30),100,12,10,2);assert.ok(fit.size===10&&fit.lines.length>2,'falls back to more lines, never clips');
});

test('the film is a pure function of its virtual clock for every example',()=>{
  for(const s of examples){
    assert.deepEqual(filmFrame(s,7.5),filmFrame(s,7.5));
    assert.ok(filmFrame(s,FILM_DURATION).diagram>.99);
    for(const t of [0,5,13,21.5,27])assert.ok(filmFrame(s,t).pose.target.every(Number.isFinite));
  }
});

test('concept viewer: only the rendering is view state; ?spec= accepts relative same-site .json paths only',async()=>{
  const runtime=new SiteRuntime(await loadClient('concept-viewer'));
  assert.deepEqual(runtime.manifest.fields.map(f=>f.id),['concept-rendering']);
  assert.throws(()=>runtime.set('concept-rendering','vr'));
  for(const ok of ['examples/forecast-app.concept.json','my-spec.json'])assert.equal(safeSpecPath(ok),ok);
  for(const bad of ['https://evil.example/x.json','//evil/x.json','/abs.json','../secret.json','a/../../b.json','x.js','javascript:alert(1).json',null])assert.equal(safeSpecPath(bad),null,String(bad));
});
