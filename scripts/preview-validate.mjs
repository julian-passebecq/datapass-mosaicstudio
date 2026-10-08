#!/usr/bin/env node
/**
 * datapass.preview/1: validator, file re-hash and writer (dependency-free; mirrors spec/preview/v1/preview.schema.json).
 *
 *   node scripts/preview-validate.mjs <preview.json> [--check-files] [--json]
 *
 * Exit 0 valid, 1 invalid (or a file differs with --check-files), 2 bad usage. --check-files re-hashes every listed
 * file relative to the preview's directory and reports missing, changed and unlisted files.
 * The descriptor is inert metadata for any viewer; it carries no credentials and grants no access.
 */
import {createHash} from 'node:crypto';
import {lstat,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PREVIEW_FORMAT='datapass.preview';
export const PREVIEW_FILE='preview.json';
export const PREVIEW_LIMITS=Object.freeze({files:2000,artifacts:200,capabilities:32,path:260,title:160,csp:4096,fileBytes:1073741824});
export const PREVIEW_PATTERNS=Object.freeze({
  appId:/^[a-z][a-z0-9-]{0,59}$/,
  path:/^(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._~@+-]+(?:\/[A-Za-z0-9._~@+-]+)*$/,
  sha256:/^[0-9a-f]{64}$/,
  sdkVersion:/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/,
  commit:/^[0-9a-f]{40}([0-9a-f]{24})?$/,
  capability:/^[a-z][a-z0-9-]{0,39}$/,
  artifactId:/^[a-z][a-zA-Z0-9_-]{0,79}$/,
  noControl:/^[^\u0000-\u001f]*$/,
});
const KEYS={root:['$schema','format','version','app','entry','sdkVersion','sourceCommit','publication','capabilities','files','artifacts','open','csp'],
  required:['format','version','app','entry','sdkVersion','sourceCommit','publication','capabilities','files','artifacts','open','csp'],
  app:['id','title','variant'],publication:['mode','noindex'],file:['path','bytes','sha256'],artifact:['id','path','sha256','provenance'],open:['file','httpLoopback']};
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

/** Structural + cross-reference validation. Returns {ok, issues:[{path, message}]}; never throws. */
export function validatePreview(doc){
  const issues=[],bad=(p,message)=>{if(issues.length<200)issues.push({path:p,message});};
  const object=(v,p,allowed,required=allowed)=>{
    if(!isObject(v)){bad(p,'expected an object');return false;}
    for(const k of Object.keys(v))if(!allowed.includes(k))bad(p+'/'+k,'unknown field');
    for(const k of required)if(!Object.hasOwn(v,k))bad(p+'/'+k,'required');
    return true;
  };
  const str=(v,p,re,max,min=1)=>{if(typeof v!=='string')return bad(p,'expected a string');if(v.length<min||v.length>max)return bad(p,`length must be ${min}-${max}`);if(re&&!re.test(v))bad(p,'invalid format');};
  const bool=(v,p)=>{if(typeof v!=='boolean')bad(p,'expected a boolean');};
  const relPath=(v,p)=>str(v,p,PREVIEW_PATTERNS.path,PREVIEW_LIMITS.path);
  const hash=(v,p)=>str(v,p,PREVIEW_PATTERNS.sha256,64,64);
  if(!object(doc,'',KEYS.root,KEYS.required))return {ok:false,issues};
  if(doc.$schema!==undefined)str(doc.$schema,'/$schema',null,300);
  if(doc.format!==PREVIEW_FORMAT)bad('/format','must be "datapass.preview"');
  if(doc.version!==1)bad('/version','must be 1');
  if(object(doc.app,'/app',KEYS.app)){
    str(doc.app.id,'/app/id',PREVIEW_PATTERNS.appId,60);
    str(doc.app.title,'/app/title',PREVIEW_PATTERNS.noControl,PREVIEW_LIMITS.title);
    if(!['client','workbench','standalone'].includes(doc.app.variant))bad('/app/variant','must be client, workbench or standalone');
  }
  relPath(doc.entry,'/entry');
  str(doc.sdkVersion,'/sdkVersion',PREVIEW_PATTERNS.sdkVersion,64);
  if(doc.sourceCommit!==null)str(doc.sourceCommit,'/sourceCommit',PREVIEW_PATTERNS.commit,64,40);
  if(object(doc.publication,'/publication',KEYS.publication)){
    if(!['preview','public'].includes(doc.publication.mode))bad('/publication/mode','must be preview or public');
    bool(doc.publication.noindex,'/publication/noindex');
  }
  if(!Array.isArray(doc.capabilities))bad('/capabilities','expected an array');
  else{
    if(doc.capabilities.length>PREVIEW_LIMITS.capabilities)bad('/capabilities','too many items');
    doc.capabilities.forEach((c,i)=>str(c,'/capabilities/'+i,PREVIEW_PATTERNS.capability,40));
    if(new Set(doc.capabilities).size!==doc.capabilities.length)bad('/capabilities','items must be unique');
  }
  const files=new Map();
  if(!Array.isArray(doc.files))bad('/files','expected an array');
  else{
    if(doc.files.length<1||doc.files.length>PREVIEW_LIMITS.files)bad('/files',`must hold 1-${PREVIEW_LIMITS.files} items`);
    doc.files.slice(0,PREVIEW_LIMITS.files+1).forEach((f,i)=>{const p='/files/'+i;if(!object(f,p,KEYS.file))return;relPath(f.path,p+'/path');hash(f.sha256,p+'/sha256');
      if(!Number.isSafeInteger(f.bytes)||f.bytes<0||f.bytes>PREVIEW_LIMITS.fileBytes)bad(p+'/bytes','expected an integer 0-'+PREVIEW_LIMITS.fileBytes);
      if(typeof f.path==='string'){if(files.has(f.path))bad(p+'/path','duplicate path');files.set(f.path,f);}});
  }
  if(!Array.isArray(doc.artifacts))bad('/artifacts','expected an array');
  else{
    if(doc.artifacts.length>PREVIEW_LIMITS.artifacts)bad('/artifacts','too many items');
    const ids=new Set();
    doc.artifacts.slice(0,PREVIEW_LIMITS.artifacts+1).forEach((a,i)=>{const p='/artifacts/'+i;if(!object(a,p,KEYS.artifact))return;
      str(a.id,p+'/id',PREVIEW_PATTERNS.artifactId,80);relPath(a.path,p+'/path');hash(a.sha256,p+'/sha256');
      if(!['synthetic','provided','computed'].includes(a.provenance))bad(p+'/provenance','must be synthetic, provided or computed');
      if(ids.has(a.id))bad(p+'/id','duplicate artifact id');ids.add(a.id);
      const f=files.get(a.path);if(Array.isArray(doc.files)&&typeof a.path==='string'&&!f)bad(p+'/path','not listed in files');else if(f&&f.sha256!==a.sha256)bad(p+'/sha256','differs from the files entry');});
  }
  if(typeof doc.entry==='string'&&Array.isArray(doc.files)&&!files.has(doc.entry))bad('/entry','not listed in files');
  if(object(doc.open,'/open',KEYS.open)){bool(doc.open.file,'/open/file');bool(doc.open.httpLoopback,'/open/httpLoopback');}
  str(doc.csp,'/csp',PREVIEW_PATTERNS.noControl,PREVIEW_LIMITS.csp);
  return {ok:issues.length===0,issues};
}

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Regular files under dir as sorted POSIX paths (the descriptor itself excluded). Symbolic links are refused. */
export async function listAppFiles(dir,prefix=''){
  const out=[];
  for(const entry of await readdir(path.join(dir,prefix),{withFileTypes:true})){
    const rel=prefix?prefix+'/'+entry.name:entry.name;
    if(entry.isSymbolicLink())throw new Error('Symbolic link in app folder: '+rel);
    if(entry.isDirectory())out.push(...await listAppFiles(dir,rel));
    else if(entry.isFile()&&rel!==PREVIEW_FILE)out.push(rel);
  }
  return out.sort((a,b)=>a<b?-1:a>b?1:0);
}
/** Re-hash the listed files relative to dir; reports missing, changed and unlisted files. */
export async function checkPreviewFiles(doc,dir){
  const issues=[],listed=new Set();
  for(const [i,f] of doc.files.entries()){
    listed.add(f.path);
    try{const st=await lstat(path.join(dir,...f.path.split('/')));if(!st.isFile()){issues.push({path:'/files/'+i,message:'not a regular file: '+f.path});continue;}
      const bytes=await readFile(path.join(dir,...f.path.split('/')));
      if(bytes.length!==f.bytes||sha256(bytes)!==f.sha256)issues.push({path:'/files/'+i,message:'content differs: '+f.path});}
    catch{issues.push({path:'/files/'+i,message:'missing file: '+f.path});}
  }
  for(const rel of await listAppFiles(dir))if(!listed.has(rel))issues.push({path:'/files',message:'unlisted file: '+rel});
  return issues;
}
/** Hash the folder and write <dir>/preview.json. Throws (nothing written) if the result does not validate. */
export async function writePreview(dir,{app,entry='index.html',sdkVersion,sourceCommit=null,publication,capabilities=[],artifacts=[],open,csp}){
  const names=await listAppFiles(dir);
  if(names.length>PREVIEW_LIMITS.files)throw new Error(`App folder has ${names.length} files; datapass.preview/1 allows ${PREVIEW_LIMITS.files}`);
  const files=[];for(const rel of names){const bytes=await readFile(path.join(dir,...rel.split('/')));files.push({path:rel,bytes:bytes.length,sha256:sha256(bytes)});}
  const byPath=new Map(files.map(f=>[f.path,f]));
  const doc={format:PREVIEW_FORMAT,version:1,app,entry,sdkVersion,sourceCommit,publication,capabilities:[...capabilities],files,
    artifacts:artifacts.map(a=>({id:a.id,path:a.path,sha256:byPath.get(a.path)?.sha256??'',provenance:a.provenance})),open,csp};
  const r=validatePreview(doc);
  if(!r.ok)throw new Error('Generated preview.json is invalid:\n'+r.issues.map(i=>`- ${i.path||'/'}: ${i.message}`).join('\n'));
  await writeFile(path.join(dir,PREVIEW_FILE),JSON.stringify(doc,null,2)+'\n');
  return doc;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),checkFiles=args.includes('--check-files'),json=args.includes('--json'),files=args.filter(a=>!a.startsWith('--'));
  if(files.length!==1||args.some(a=>a.startsWith('--')&&!['--check-files','--json'].includes(a))){console.error('Usage: node scripts/preview-validate.mjs <preview.json> [--check-files] [--json]');process.exit(2);}
  let doc,issues;
  try{doc=JSON.parse(await readFile(files[0],'utf8'));issues=validatePreview(doc).issues;}catch(e){issues=[{path:'',message:e.message}];}
  if(!issues.length&&checkFiles)issues=await checkPreviewFiles(doc,path.dirname(path.resolve(files[0])));
  if(json)console.log(JSON.stringify({file:files[0],ok:!issues.length,issues},null,2));
  else if(issues.length)for(const i of issues)console.error(`${files[0]}: ${i.path||'/'}: ${i.message}`);
  else console.log(`${files[0]}: valid datapass.preview/1 · ${doc.app.id} (${doc.app.variant}) · ${doc.files.length} files · ${doc.artifacts.length} artifacts${checkFiles?' · all files re-hashed':''}`);
  process.exit(issues.length?1:0);
}
