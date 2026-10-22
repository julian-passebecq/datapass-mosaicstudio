#!/usr/bin/env node
/**
 * Verify a DataPass MosaicStudio SDK release directory written by scripts/sdk-pack.mjs.
 *
 *   node scripts/sdk-verify.mjs <dir>        (dir holds sdk-release.json, the .tar.gz and the standalone files)
 *
 * Re-hashes the archive, every file inside it, every standalone file and every contract entry, and fails
 * (exit 1) on any difference: missing, extra or changed file, wrong size or hash, unsafe path. Exit 2 = bad usage.
 * Dependency-free (node:zlib + a minimal ustar/pax reader), so a consumer can run it before installing anything.
 */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const SDK_RELEASE_FORMAT='datapass.sdk-release';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Portable relative path: no traversal, Windows aliases/devices or alternate data streams. */
export function safeRelativePath(p){
  return typeof p==='string'&&p.length>0&&p.length<=400&&!/[\\<>:"|?*\u0000-\u001f\u007f]/.test(p)
    &&p.split('/').every(s=>s!==''&&s!=='.'&&s!=='..'&&!/[. ]$/.test(s)
      &&!/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(s));
}

const field=(buf,offset,length)=>{const raw=buf.subarray(offset,offset+length),end=raw.indexOf(0);return raw.subarray(0,end<0?length:end).toString('utf8');};
const octal=(buf,offset,length)=>{const s=field(buf,offset,length).trim();return s?parseInt(s,8):0;};
function paxRecords(data){
  // Each record is "<decimal byte length> <key>=<value>\n"; the length counts bytes, including itself.
  const out=Object.create(null);let i=0;
  while(i<data.length){const space=data.indexOf(0x20,i);if(space<0)throw new Error('Corrupt pax header');
    const digits=data.subarray(i,space).toString('latin1'),len=Number(digits);
    if(!/^[0-9]+$/.test(digits)||!Number.isSafeInteger(len)||len<=space-i+1||i+len>data.length||data[i+len-1]!==10)throw new Error('Corrupt pax header');
    const body=data.subarray(space+1,i+len-1).toString('utf8'),eq=body.indexOf('=');if(eq<=0)throw new Error('Corrupt pax header');
    out[body.slice(0,eq)]=body.slice(eq+1);i+=len;}
  return out;
}
/**
 * Read a gzip'd tar (as written by `git archive`) into [{path, type, data}]. Handles ustar prefixes and pax
 * `path` records and git's global `comment`. Other pax metadata is refused so extraction cannot interpret
 * paths or sizes differently from verification. Types: 'file', 'dir', 'symlink', 'other'.
 */
export function readTarGz(gz){
  const buf=gunzipSync(gz),entries=[];let offset=0,pax=null;
  while(offset+512<=buf.length){
    const header=buf.subarray(offset,offset+512);if(header.every(b=>b===0))break;
    const sum=octal(header,148,8);let check=0;for(let i=0;i<512;i++)check+=i>=148&&i<156?32:header[i];if(sum!==check)throw new Error('Tar header checksum mismatch at byte '+offset);
    const size=octal(header,124,12),flag=String.fromCharCode(header[156]||48),prefix=field(header,345,155),name=field(header,0,100);
    const data=buf.subarray(offset+512,offset+512+size);if(data.length!==size)throw new Error('Truncated tar entry');
    offset+=512+Math.ceil(size/512)*512;
    if(flag==='g'||flag==='x'){
      if(pax!==null)throw new Error('Redundant metadata after per-entry pax header');
      const records=paxRecords(data),allowed=flag==='g'?'comment':'path';
      if(Object.keys(records).some(key=>key!==allowed))throw new Error('Unsupported pax metadata');
      if(flag==='x')pax=records;
      continue;
    }
    const full=pax?.path??(prefix?prefix+'/'+name:name);pax=null;
    entries.push({path:full,type:flag==='0'||flag==='\0'||flag==='7'?'file':flag==='5'?'dir':flag==='2'?'symlink':'other',data});
  }
  if(pax!==null)throw new Error('Orphan per-entry pax header');
  return entries;
}
/** Files of an SDK archive: strips the single top-level folder, rejects symlinks, unsafe or duplicate paths. */
export function archiveFiles(gz){
  const entries=readTarGz(gz),files=[],paths=new Map(),declared=new Set();let root=null;
  for(const e of entries){
    const cut=e.type==='dir'?e.path.replace(/\/$/,''):e.path;
    // Check the complete path, including the root and directory records, before stripping anything.
    if(!safeRelativePath(cut))throw new Error('Unsafe archive path: '+e.path);
    if(e.type!=='dir'&&e.type!=='file')throw new Error('Archive entry is not a regular file: '+e.path);
    const slash=cut.indexOf('/'),top=slash<0?cut:cut.slice(0,slash);
    root??=top;if(top!==root)throw new Error('Archive has more than one top-level folder: '+e.path);
    const segments=cut.split('/');
    for(let i=1;i<=segments.length;i++){
      const name=segments.slice(0,i).join('/'),key=name.toLowerCase(),type=i<segments.length?'dir':e.type,prior=paths.get(key);
      if(prior&&(prior.path!==name||prior.type!==type))throw new Error('Archive path collision or file/directory conflict: '+e.path);
      paths.set(key,{path:name,type});
    }
    if(declared.has(cut))throw new Error('Duplicate archive path: '+e.path);declared.add(cut);
    if(e.type==='dir')continue;
    const rel=cut.slice(slash+1);if(slash<0||!safeRelativePath(rel))throw new Error('Unsafe archive path: '+e.path);
    files.push({path:rel,bytes:e.data.length,sha256:sha256(e.data)});
  }
  if(!files.length)throw new Error('Archive has no regular files');
  files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  for(let i=1;i<files.length;i++)if(files[i].path===files[i-1].path)throw new Error('Duplicate archive path: '+files[i].path);
  return {root,files};
}

const HEX=/^[0-9a-f]{64}$/;
/** Verify a release directory; returns {ok, problems[], manifest}. Never throws for content problems. */
export async function verifySdkRelease(dir){
  const problems=[];let manifest;
  try{manifest=JSON.parse(await readFile(path.join(dir,'sdk-release.json'),'utf8'));}catch(e){return {ok:false,problems:['sdk-release.json: '+e.message]};}
  const m=manifest;
  if(m?.format!==SDK_RELEASE_FORMAT||m.version!==1)problems.push('sdk-release.json: unsupported format/version');
  if(typeof m?.sdkVersion!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(m.sdkVersion))problems.push('sdkVersion: invalid');
  if(typeof m?.sourceCommit!=='string'||!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(m.sourceCommit))problems.push('sourceCommit: invalid');
  if(typeof m?.sourceTreeClean!=='boolean')problems.push('sourceTreeClean: expected a boolean');
  for(const key of ['files','standalone','contracts'])if(!Array.isArray(m?.[key]))problems.push(key+': expected an array');
  if(problems.length)return {ok:false,problems,manifest};
  const a=m.archive;
  if(!a||typeof a.name!=='string'||!safeRelativePath(a.name)||a.name.includes('/')||!HEX.test(a.sha256??''))return {ok:false,problems:['archive: invalid entry'],manifest};
  let gz;try{gz=await readFile(path.join(dir,a.name));}catch(e){return {ok:false,problems:['archive: '+e.message],manifest};}
  if(gz.length!==a.bytes)problems.push(`archive: ${gz.length} bytes, manifest says ${a.bytes}`);
  if(sha256(gz)!==a.sha256)problems.push('archive: sha256 mismatch');
  let actual=[];try{actual=archiveFiles(gz).files;}catch(e){problems.push('archive: '+e.message);}
  const declared=new Map();for(const f of m.files){if(!safeRelativePath(f?.path)||!HEX.test(f?.sha256??'')||!Number.isSafeInteger(f?.bytes)){problems.push('files: invalid entry '+JSON.stringify(f).slice(0,120));continue;}if(declared.has(f.path))problems.push('files: duplicate '+f.path);declared.set(f.path,f);}
  const seen=new Set();
  for(const f of actual){seen.add(f.path);const d=declared.get(f.path);
    if(!d)problems.push('extra file in archive: '+f.path);
    else if(d.bytes!==f.bytes||d.sha256!==f.sha256)problems.push('changed file: '+f.path);}
  if(actual.length)for(const p of declared.keys())if(!seen.has(p))problems.push('missing file in archive: '+p);
  for(const s of m.standalone){
    if(!safeRelativePath(s?.path)||!HEX.test(s?.sha256??'')){problems.push('standalone: invalid entry');continue;}
    try{const b=await readFile(path.join(dir,...s.path.split('/')));if(b.length!==s.bytes||sha256(b)!==s.sha256)problems.push('changed standalone file: '+s.path);}
    catch{problems.push('missing standalone file: '+s.path);}
  }
  for(const c of m.contracts){const d=declared.get(c?.path);if(!d)problems.push('contract not in archive: '+c?.id);else if(d.sha256!==c.sha256)problems.push('contract hash mismatch: '+c.id);}
  return {ok:problems.length===0,problems,manifest};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const dir=process.argv[2];
  if(!dir||process.argv.length!==3){console.error('Usage: node scripts/sdk-verify.mjs <dist-sdk directory>');process.exit(2);}
  const r=await verifySdkRelease(path.resolve(dir));
  if(!r.ok){for(const p of r.problems.slice(0,50))console.error('FAIL '+p);if(r.problems.length>50)console.error(`… ${r.problems.length-50} more`);process.exit(1);}
  const m=r.manifest;
  console.log(`SDK ${m.sdkVersion} verified: ${m.archive.name} (${m.files.length} files), ${m.standalone.length} standalone file(s), ${m.contracts.length} contract(s); commit ${m.sourceCommit.slice(0,12)}${m.sourceTreeClean?'':' (packed from a dirty tree)'}.`);
}
