/**
 * Builds the standalone concept viewer: ONE self-contained HTML file (JS, CSS and Three.js inline) that opens by
 * double-click (file://) or from any static host, with no server and no network unless `?src=` asks for a URL.
 *
 *   npm run build:concept-standalone            -> dist-standalone/concept-viewer.html
 *   npm run build:concept-standalone -- --out <file>
 *
 * The file carries a provenance comment (source commit, build date) and a Content-Security-Policy whose script
 * hash is computed here. Rebuild and commit it whenever clients/concept-viewer or src/framework/concept change.
 */
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';

const repo=path.resolve(import.meta.dirname,'..');
const outIndex=process.argv.indexOf('--out');
const outFile=path.resolve(repo,outIndex>0?process.argv[outIndex+1]:'dist-standalone/concept-viewer.html');
const work=path.join(repo,'.generated','concept-standalone');
const git=(...args)=>{try{return execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();}catch{return '';}};

await rm(work,{recursive:true,force:true});
await build({
  configFile:false,logLevel:'warn',root:path.join(repo,'clients/concept-viewer/standalone'),base:'./',publicDir:false,
  plugins:[react()],
  resolve:{alias:[{find:'@vizforge',replacement:path.join(repo,'.upstream/vizforge/src')},...['core','svg','react'].map(name=>({find:'@conceptmotion/'+name,replacement:path.join(repo,'.upstream/conceptmotion/project/conceptmotion_studio/packages',name,'src/index.ts')}))],dedupe:['react','react-dom']},
  define:{'process.env.NODE_ENV':'"production"'},
  build:{outDir:work,emptyOutDir:true,target:'es2022',sourcemap:false,minify:'esbuild',cssCodeSplit:false,modulePreload:false,assetsInlineLimit:64*1024*1024,
    chunkSizeWarningLimit:4096,reportCompressedSize:false,rollupOptions:{output:{inlineDynamicImports:true}}}
});

let html=await readFile(path.join(work,'index.html'),'utf8');
const assets=path.join(work,'assets'),files=await readdir(assets);
const js=files.filter(f=>f.endsWith('.js')),css=files.filter(f=>f.endsWith('.css')),other=files.filter(f=>!f.endsWith('.js')&&!f.endsWith('.css'));
if(js.length!==1||css.length>1||other.length)throw new Error('Standalone build must be one script (+ at most one stylesheet), got: '+files.join(', '));
const script=(await readFile(path.join(assets,js[0]),'utf8')).replace(/<\/script/gi,'<\\/script').trim();
const style=css.length?(await readFile(path.join(assets,css[0]),'utf8')).replace(/<\/style/gi,'<\\/style').trim():'';
if(/\bimport\s*\(|from\s*["']\.\//.test(script.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g,'""')))console.warn('Note: the bundle text mentions import(); check that no chunk is loaded at runtime.');

html=html.replace(/<script type="module" crossorigin src="[^"]+"><\/script>\s*/,'')
  .replace(/<link rel="stylesheet" crossorigin href="[^"]+">\s*/,'');
if(/src="\.\/assets|href="\.\/assets/.test(html))throw new Error('An asset reference was not inlined');
const hash=createHash('sha256').update(script,'utf8').digest('base64');
const csp=["default-src 'none'",`script-src 'sha256-${hash}'`,"style-src 'unsafe-inline'","img-src data: blob:","font-src data:",
  "connect-src https: http://localhost:* http://127.0.0.1:*","base-uri 'none'","form-action 'none'"].join('; ');
const sha=git('rev-parse','HEAD')||'unknown',dirty=git('status','--porcelain','--','clients/concept-viewer','src/framework/concept','scripts/build-concept-standalone.mjs')?'-dirty':'';
const pkg=JSON.parse(await readFile(path.join(repo,'package.json'),'utf8'));
const {CONCEPT_SPEC_VERSION}=await import('../src/framework/concept/schema.ts');
const provenance=`<!--
  Concept Viewer (standalone) for concept spec ${CONCEPT_SPEC_VERSION}
  DataPass MosaicStudio ${pkg.version} · source commit ${sha}${dirty} · built ${new Date().toISOString()}
  Regenerate: npm run build:concept-standalone (scripts/build-concept-standalone.mjs)
  Source: https://github.com/julian-passebecq/datapass-mosaicstudio/tree/${sha==='unknown'?'main':sha}/clients/concept-viewer
  Bundles React, lucide-react, zod and Three.js (licenses: THIRD_PARTY_NOTICES.md in the repository).
-->`;
html=html.replace('<!doctype html>','<!doctype html>\n'+provenance)
  .replace('<meta charset="utf-8">',`<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">`)
  .replace('</head>',()=>(style?`<style>${style}</style>\n`:'')+'</head>')
  .replace('</body>',()=>`<script type="module">${script}</script>\n</body>`);
await mkdir(path.dirname(outFile),{recursive:true});
await writeFile(outFile,html);
const gz=(await import('node:zlib')).gzipSync(html).length;
console.log(`Standalone concept viewer: ${path.relative(repo,outFile)} · ${(Buffer.byteLength(html)/1024).toFixed(0)} KB (${(gz/1024).toFixed(0)} KB gzip) · commit ${sha.slice(0,12)}${dirty}`);
