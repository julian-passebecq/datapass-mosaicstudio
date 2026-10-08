import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validatePreview,checkPreviewFiles,writePreview,PREVIEW_PATTERNS} from '../scripts/preview-validate.mjs';

const schema=JSON.parse(await readFile('spec/preview/v1/preview.schema.json','utf8'));

/** Minimal JSON Schema 2020-12 evaluator for exactly the keywords this schema uses (unknown keywords fail the test). */
const KNOWN=new Set(['$schema','$id','title','description','type','additionalProperties','required','properties','$defs','$ref','const','enum','pattern','minLength','maxLength','minItems','maxItems','uniqueItems','items','minimum','maximum','anyOf']);
function keywords(node){if(Array.isArray(node))return node.flatMap(keywords);if(!node||typeof node!=='object')return [];
  return Object.entries(node).flatMap(([k,v])=>[...(KNOWN.has(k)?[]:[k]),...(k==='properties'||k==='$defs'?Object.values(v).flatMap(keywords):k==='enum'||k==='const'||k==='required'?[]:keywords(v))]);}
const typeOf=v=>v===null?'null':Array.isArray(v)?'array':Number.isInteger(v)?'integer':typeof v;
function schemaValid(value,node=schema){
  if(node.$ref)return schemaValid(value,schema.$defs[node.$ref.replace('#/$defs/','')]);
  if(node.anyOf&&!node.anyOf.some(s=>schemaValid(value,s)))return false;
  if(node.type&&typeOf(value)!==node.type&&!(node.type==='number'&&typeof value==='number'))return false;
  if('const' in node&&value!==node.const)return false;
  if(node.enum&&!node.enum.includes(value))return false;
  if(typeof value==='string'){const n=[...value].length;if(node.minLength!==undefined&&n<node.minLength||node.maxLength!==undefined&&n>node.maxLength)return false;if(node.pattern&&!new RegExp(node.pattern,'u').test(value))return false;}
  if(typeof value==='number'&&(node.minimum!==undefined&&value<node.minimum||node.maximum!==undefined&&value>node.maximum))return false;
  if(Array.isArray(value)){if(node.minItems!==undefined&&value.length<node.minItems||node.maxItems!==undefined&&value.length>node.maxItems)return false;
    if(node.uniqueItems&&new Set(value.map(v=>JSON.stringify(v))).size!==value.length)return false;if(node.items&&!value.every(v=>schemaValid(v,node.items)))return false;}
  if(typeOf(value)==='object'){if(node.required?.some(k=>!Object.hasOwn(value,k)))return false;
    for(const [k,v] of Object.entries(value)){if(node.properties?.[k]){if(!schemaValid(v,node.properties[k]))return false;}else if(node.additionalProperties===false)return false;}}
  return true;
}

const H='a'.repeat(64),H2='b'.repeat(64);
const good=()=>({format:'datapass.preview',version:1,app:{id:'motion-reference',title:'Motion / reference app',variant:'client'},entry:'index.html',sdkVersion:'0.8.1',
  sourceCommit:'8b22d9c121743d8cd5e78ca74098c5e332e4e45c',publication:{mode:'preview',noindex:true},capabilities:['motion','charts'],
  files:[{path:'index.html',bytes:10,sha256:H},{path:'artifacts/trace.json',bytes:20,sha256:H2},{path:'assets/app-B3hJ2Smf.js',bytes:0,sha256:H}],
  artifacts:[{id:'coding-lab-trace',path:'artifacts/trace.json',sha256:H2,provenance:'computed'}],open:{file:false,httpLoopback:true},
  csp:"default-src 'self'; script-src 'self'"});
const variants={
  'null commit':d=>{d.sourceCommit=null;},'standalone variant':d=>{d.app.variant='standalone';d.open.file=true;},'public mode':d=>{d.publication={mode:'public',noindex:false};},
  'no artifacts':d=>{d.artifacts=[];},'no capabilities':d=>{d.capabilities=[];},'pre-release sdk':d=>{d.sdkVersion='0.9.0-rc.1';},'$schema field':d=>{d.$schema=schema.$id;},
  'underscore and dotfile paths':d=>{d.files.push({path:'_headers',bytes:1,sha256:H},{path:'.well-known/x.txt',bytes:1,sha256:H});},
};
const broken={
  'wrong format':d=>{d.format='datapass.previews';},'version 2':d=>{d.version=2;},'unknown root field':d=>{d.token='x';},'unknown app field':d=>{d.app.url='https://x';},
  'missing csp':d=>{delete d.csp;},'missing files':d=>{delete d.files;},'bad app id':d=>{d.app.id='Motion';},'long title':d=>{d.app.title='x'.repeat(161);},'empty title':d=>{d.app.title='';},
  'control char in title':d=>{d.app.title='a\nb';},'bad variant':d=>{d.app.variant='site';},'absolute entry':d=>{d.entry='/index.html';},'dotdot path':d=>{d.files[2].path='assets/../../etc/passwd';},
  'dot segment':d=>{d.files[2].path='./index.js';},'backslash path':d=>{d.files[2].path='assets\\app.js';},'drive path':d=>{d.files[2].path='C:/x.js';},'empty segment':d=>{d.files[2].path='assets//app.js';},
  'space in path':d=>{d.files[2].path='my app.js';},'long path':d=>{d.files[2].path='a'.repeat(261);},'uppercase hash':d=>{d.files[0].sha256='A'.repeat(64);},'short hash':d=>{d.files[0].sha256='abc';},
  'negative bytes':d=>{d.files[0].bytes=-1;},'fractional bytes':d=>{d.files[0].bytes=1.5;},'no files':d=>{d.files=[];d.artifacts=[];},
  'too many files':d=>{d.files=Array.from({length:2001},(_,i)=>({path:'f'+i+'.js',bytes:1,sha256:H}));d.entry='f0.js';d.artifacts=[];},
  'bad provenance':d=>{d.artifacts[0].provenance='validated';},'bad artifact id':d=>{d.artifacts[0].id='1x';},'duplicate capability':d=>{d.capabilities=['motion','motion'];},
  'bad capability':d=>{d.capabilities=['Motion'];},'bad commit':d=>{d.sourceCommit='HEAD';},'bad sdk version':d=>{d.sdkVersion='latest';},'noindex string':d=>{d.publication.noindex='yes';},
  'bad mode':d=>{d.publication.mode='private';},'open missing key':d=>{delete d.open.httpLoopback;},'csp newline':d=>{d.csp='a\nb';},'csp too long':d=>{d.csp='x'.repeat(4097);},
  'files not array':d=>{d.files={};},'document is array':d=>[d],
};
const crossReference={
  'entry not listed':d=>{d.entry='main.html';},'artifact path not listed':d=>{d.artifacts[0].path='artifacts/other.json';},
  'artifact hash differs from file':d=>{d.artifacts[0].sha256=H;},'duplicate file path':d=>{d.files.push({...d.files[0]});},'duplicate artifact id':d=>{d.artifacts.push({...d.artifacts[0]});},
};
const make=patch=>{const d=good(),r=patch(d);return r===undefined?d:r;};

test('the evaluator covers every keyword of the published schema',()=>{assert.deepEqual(keywords(schema),[]);assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');});
test('schema and validator accept the same good documents',()=>{
  for(const [name,patch] of Object.entries({base:()=>{},...variants})){const d=make(patch);assert.equal(schemaValid(d),true,'schema: '+name);assert.deepEqual(validatePreview(d).issues,[],'validator: '+name);}
});
test('schema and validator reject the same structurally bad documents',()=>{
  for(const [name,patch] of Object.entries(broken)){const d=make(patch);assert.equal(schemaValid(d),false,'schema should reject: '+name);assert.equal(validatePreview(d).ok,false,'validator should reject: '+name);}
});
test('cross-reference rules are enforced by the validator beyond the schema',()=>{
  for(const [name,patch] of Object.entries(crossReference)){const d=make(patch);assert.equal(validatePreview(d).ok,false,name);}
});
test('validator patterns are the schema patterns',()=>{
  assert.equal(PREVIEW_PATTERNS.path.source,schema.$defs.path.pattern.replaceAll('/','\\/'));
  assert.equal(PREVIEW_PATTERNS.appId.source,schema.properties.app.properties.id.pattern);
  assert.equal(PREVIEW_PATTERNS.sha256.source,schema.$defs.sha256.pattern);
  assert.equal(PREVIEW_PATTERNS.artifactId.source,schema.properties.artifacts.items.properties.id.pattern);
});
test('validator returns issues and never throws on hostile input',()=>{for(const v of [null,1,'x',[],{},{format:'datapass.preview',version:1,files:new Array(5000).fill(null)}])assert.equal(validatePreview(v).ok,false);});

test('writePreview hashes a folder and --check-files detects changed, missing and unlisted files',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'preview-'));
  try{
    await mkdir(path.join(dir,'assets'));await mkdir(path.join(dir,'artifacts'));
    await writeFile(path.join(dir,'index.html'),'<!doctype html>');await writeFile(path.join(dir,'assets/app.js'),'console.log(1)');await writeFile(path.join(dir,'artifacts/a.json'),'{}');
    const doc=await writePreview(dir,{app:{id:'demo',title:'Demo',variant:'client'},sdkVersion:'0.8.1',publication:{mode:'preview',noindex:true},capabilities:['charts'],
      artifacts:[{id:'a',path:'artifacts/a.json',provenance:'synthetic'}],open:{file:false,httpLoopback:true},csp:"default-src 'self'"});
    assert.deepEqual(doc.files.map(f=>f.path),['artifacts/a.json','assets/app.js','index.html']);
    assert.deepEqual(await checkPreviewFiles(doc,dir),[]);
    const cli=()=>spawnSync(process.execPath,['scripts/preview-validate.mjs',path.join(dir,'preview.json'),'--check-files'],{encoding:'utf8'});
    assert.equal(cli().status,0);
    await writeFile(path.join(dir,'assets/app.js'),'console.log(2)');
    assert.match((await checkPreviewFiles(doc,dir))[0].message,/content differs: assets\/app.js/);
    assert.equal(cli().status,1);
    await writeFile(path.join(dir,'extra.js'),'');await rm(path.join(dir,'index.html'));
    const messages=(await checkPreviewFiles(doc,dir)).map(i=>i.message).join('\n');
    assert.match(messages,/missing file: index.html/);assert.match(messages,/unlisted file: extra.js/);
    await assert.rejects(writePreview(dir,{app:{id:'demo',title:'Demo',variant:'client'},sdkVersion:'0.8.1',publication:{mode:'preview',noindex:true},artifacts:[],open:{file:false,httpLoopback:true},csp:'x'}),/entry.*not listed/s);
    assert.equal(spawnSync(process.execPath,['scripts/preview-validate.mjs'],{encoding:'utf8'}).status,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});

const built='dist-clients/motion-reference/preview.json';
test('an actual build:client output validates with re-hashed files',{skip:!existsSync(built)&&'run npm run build:client -- motion-reference first'},async()=>{
  const doc=JSON.parse(await readFile(built,'utf8'));
  assert.deepEqual(validatePreview(doc).issues,[]);assert.equal(schemaValid(doc),true);
  assert.deepEqual(await checkPreviewFiles(doc,path.dirname(built)),[]);
  assert.equal(doc.app.id,'motion-reference');assert.ok(doc.capabilities.includes('motion'));assert.ok(doc.files.some(f=>f.path==='studio-build.json'));
});
