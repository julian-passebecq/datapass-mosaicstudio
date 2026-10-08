#!/usr/bin/env node
/**
 * Pack the DataPass MosaicStudio SDK surface of the current commit into a verifiable release folder.
 * This is a local release artifact only: no npm publication, no tag, no upload, no deployment.
 *
 *   node scripts/sdk-pack.mjs [--out dist-sdk] [--allow-dirty]
 *
 * Writes <out>/datapass-mosaicstudio-sdk-<version>.tar.gz (git archive of HEAD, SDK paths only),
 * <out>/concept-viewer.html (the committed standalone viewer) and <out>/sdk-release.json (hashes of everything).
 * Content always comes from the HEAD commit, never from uncommitted files, so the manifest is deterministic for a
 * commit. A dirty working tree is refused (exit 1) unless --allow-dirty, which records sourceTreeClean:false.
 * Check a release with scripts/sdk-verify.mjs. Consumption and upgrade steps: docs/CONSUMING.md.
 */
import {execFileSync} from 'node:child_process';
import {mkdir,rm,writeFile,readdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {archiveFiles,sha256,SDK_RELEASE_FORMAT} from './sdk-verify.mjs';

const repo=path.resolve(import.meta.dirname,'..');
/** Paths of the SDK surface (git pathspecs, relative to the repository root). */
export const SDK_SURFACE=Object.freeze([
  'AGENTS.md','README.md','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','upstreams.lock.json','tsconfig.json',
  'vite.client.config.ts','index.html','.gitignore','.gitattributes',
  'docs','spec','scripts',
  // Framework source and the selected-client entry with everything it imports (src/workbench files are excluded).
  'src/framework','src/core','src/architecture','src/panels/Architecture.tsx','src/client-main.tsx','src/ClientRouter.tsx','src/fluent.ts','src/dom-compat.d.ts',
]);
/** Excluded inside the surface: recorded workbench media is not part of the SDK. */
export const SDK_EXCLUDE=Object.freeze(['docs/media']);
/** Paths that must never appear in a release (dependencies, upstream checkouts, client sources/data, builds, secrets). */
export const SDK_FORBIDDEN=Object.freeze([/(^|\/)node_modules\//,/^\.upstream\//,/^\.tmp-upstream\//,/^\.generated\//,/^clients\//,/^dist(-[a-z]+)?\//,/^qa\//,/^py\//,
  /(^|\/)\.env(\.(?!example$)[^/]*)?$/,/\.(pem|key|p12|pfx|keystore)$/i,/(^|\/)id_(rsa|ed25519|ecdsa)/,/(^|\/)\.npmrc$/,/(^|\/)credentials?(\.[a-z]+)?$/i]);
export const SDK_LICENSE=Object.freeze({spdx:null,statement:'No open-source license file is present; private repository, all rights reserved by the owner. Third-party notices: THIRD_PARTY_NOTICES.md.'});
export const SDK_STANDALONE=Object.freeze([{source:'dist-standalone/concept-viewer.html',path:'concept-viewer.html'}]);
export const SDK_CONTRACTS=Object.freeze([
  {id:'datapass.concept-spec/1',path:'spec/concept/v1/concept-spec.schema.json'},
  {id:'datapass.artifact/1',path:'src/framework/foundation/artifact.ts'},
  {id:'datapass.preview/1',path:'spec/preview/v1/preview.schema.json'},
]);

const git=(args,options={})=>execFileSync('git',args,{cwd:options.cwd??repo,maxBuffer:1024*1024*1024,...(options.buffer?{}:{encoding:'utf8'})});

export async function packSdk({out=path.join(repo,'dist-sdk'),allowDirty=false,cwd=repo}={}){
  const dirty=git(['status','--porcelain'],{cwd}).trim()!=='';
  if(dirty&&!allowDirty)throw Object.assign(new Error('Working tree is dirty: commit first, or pass --allow-dirty (recorded as sourceTreeClean:false). The archive always holds HEAD.'),{code:'DIRTY'});
  const sourceCommit=git(['rev-parse','HEAD'],{cwd}).trim(),commitDate=git(['show','-s','--format=%cI','HEAD'],{cwd}).trim();
  const pkg=JSON.parse(git(['show','HEAD:package.json'],{cwd}));
  if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version??''))throw new Error('package.json has no usable version');
  const missing=SDK_SURFACE.filter(p=>git(['ls-tree','--name-only','HEAD','--',p],{cwd}).trim()==='');
  if(missing.length)throw new Error('SDK surface paths missing from HEAD: '+missing.join(', '));
  const base=`datapass-mosaicstudio-sdk-${pkg.version}`;
  const tar=git(['-c','core.autocrlf=false','archive','--format=tar','--prefix='+base+'/','HEAD','--',...SDK_SURFACE,...SDK_EXCLUDE.map(p=>':(exclude)'+p)],{cwd,buffer:true});
  const gz=gzipSync(tar,{level:9}); // Node writes a zero mtime: the same commit gives the same bytes on this Node/zlib.
  const {root,files}=archiveFiles(gz);
  if(root!==base)throw new Error('Unexpected archive root '+root);
  const forbidden=files.filter(f=>SDK_FORBIDDEN.some(r=>r.test(f.path)));
  if(forbidden.length)throw new Error('Forbidden paths in the SDK archive: '+forbidden.slice(0,10).map(f=>f.path).join(', '));
  const byPath=new Map(files.map(f=>[f.path,f]));
  const contracts=SDK_CONTRACTS.map(c=>{const f=byPath.get(c.path);if(!f)throw new Error('Contract file missing from the archive: '+c.path);return {id:c.id,path:c.path,sha256:f.sha256};});
  await mkdir(out,{recursive:true});
  for(const name of await readdir(out))if(/^datapass-mosaicstudio-sdk-.*\.tar\.gz$|^sdk-release\.json$/.test(name)||SDK_STANDALONE.some(s=>s.path===name))await rm(path.join(out,name),{force:true});
  const archiveName=base+'.tar.gz';
  await writeFile(path.join(out,archiveName),gz);
  const standalone=[];
  for(const s of SDK_STANDALONE){const bytes=git(['show','HEAD:'+s.source],{cwd,buffer:true});await writeFile(path.join(out,s.path),bytes);standalone.push({path:s.path,bytes:bytes.length,sha256:sha256(bytes)});}
  const manifest={format:SDK_RELEASE_FORMAT,version:1,sdkVersion:pkg.version,sourceCommit,sourceTreeClean:!dirty,commitDate,license:SDK_LICENSE,
    archive:{name:archiveName,bytes:gz.length,sha256:sha256(gz)},files,standalone,contracts,upgrade:'docs/CONSUMING.md'};
  await writeFile(path.join(out,'sdk-release.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);let out=path.join(repo,'dist-sdk'),allowDirty=false;
  for(let i=0;i<args.length;i++){if(args[i]==='--allow-dirty')allowDirty=true;else if(args[i]==='--out'&&args[i+1])out=path.resolve(args[++i]);else{console.error('Usage: node scripts/sdk-pack.mjs [--out <dir>] [--allow-dirty]');process.exit(2);}}
  try{
    const m=await packSdk({out,allowDirty});
    console.log(`SDK ${m.sdkVersion} packed: ${path.relative(process.cwd(),path.join(out,m.archive.name))} · ${m.files.length} files · ${(m.archive.bytes/1024).toFixed(0)} KB · sha256 ${m.archive.sha256.slice(0,16)}… · commit ${m.sourceCommit.slice(0,12)}${m.sourceTreeClean?'':' (dirty tree: archive holds HEAD only)'}. Nothing was published.`);
  }catch(e){console.error(e.message);process.exit(1);}
}
