#!/usr/bin/env node
/**
 * Static server for release QA: serves an installed (unzipped) workbench folder and applies the folder's own
 * `_headers` file the way Netlify / Cloudflare Pages do (path rules, `*` splat, headers of every matching rule
 * merged), so a journey runs under the shipped CSP rather than the vite preview copy.
 *
 *   node qa/REL-0.11.1/serve-with-headers.mjs --root <unzipped workbench> [--port 24341]
 *
 * Binds 127.0.0.1 only. Port must be above 20000. `_headers` itself is never served.
 */
import {createReadStream,existsSync,readFileSync,statSync} from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const args=process.argv.slice(2),opt={root:'',port:24341};
for(let i=0;i<args.length;i+=2){const k=args[i].replace(/^--/,'');if(!(k in opt)||args[i+1]===undefined){console.error('Usage: --root <dir> [--port N]');process.exit(2);}opt[k]=args[i+1];}
const port=Number(opt.port),root=path.resolve(opt.root);
if(!(port>20000))throw new Error('Use a port above 20000');
if(!existsSync(path.join(root,'index.html'))||!existsSync(path.join(root,'_headers')))throw new Error(root+' needs index.html and _headers');

/** `_headers` syntax: an unindented path rule, then indented `Name: value` lines; `#` comments. */
function parseHeadersFile(text){
  const rules=[];let current=null;
  for(const line of text.split(/\r?\n/)){
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    if(!/^\s/.test(line)){current={pattern:line.trim(),headers:{}};rules.push(current);continue;}
    const i=line.indexOf(':');if(!current||i<0)throw new Error('Malformed _headers line: '+line);
    current.headers[line.slice(0,i).trim()]=line.slice(i+1).trim();
  }
  return rules;
}
const rules=parseHeadersFile(readFileSync(path.join(root,'_headers'),'utf8')).map(r=>({...r,re:new RegExp('^'+r.pattern.split('*').map(s=>s.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$')}));
const headersFor=p=>Object.assign({},...rules.filter(r=>r.re.test(p)).map(r=>r.headers));

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.parquet':'application/octet-stream','.glb':'model/gltf-binary','.csv':'text/csv','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,`http://127.0.0.1:${port}`);
  let rel=decodeURIComponent(url.pathname);if(rel.endsWith('/'))rel+='index.html';
  const file=path.resolve(root,'.'+rel);
  if(!file.startsWith(root+path.sep)||!existsSync(file)||!statSync(file).isFile()||path.basename(file)==='_headers'){res.writeHead(404,headersFor(url.pathname));res.end();return;}
  res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]??'application/octet-stream',...headersFor(url.pathname),'Cache-Control':'no-store'});
  if(req.method==='HEAD'){res.end();return;}
  createReadStream(file).pipe(res);
});
server.listen(port,'127.0.0.1',()=>console.log(`serving ${root} with ${rules.length} _headers rule(s) on http://127.0.0.1:${port}`));
for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>server.close(()=>process.exit(0)));
