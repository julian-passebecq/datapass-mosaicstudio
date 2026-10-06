import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {checkConceptSpec,parseConceptSpec,parseConceptJson,ConceptSpecError,CONCEPT_KINDS,conceptSpecJsonSchema,
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
    [s=>{s.provenance='documented';},/nodes\[0\]\.sources: a documented spec needs at least one source ref per node/],
    [s=>{s.extra=1;},/unknown field "extra"/],
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
  assert.equal(conceptSpecJsonSchema.additionalProperties,false);
  assert.deepEqual(conceptSpecJsonSchema.required,['format','version','id','title','provenance','note','layers','domains','nodes','flows']);
  assert.equal(conceptSpecJsonSchema.properties.nodes.items.properties.label.maxLength,40);
  assert.equal(conceptSpecJsonSchema.properties.layers.maxItems,8);
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
