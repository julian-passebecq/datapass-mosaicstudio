/** Bridge level 2.5 (docs/PYTHON_BRIDGE.md): any producer rewrites clients/<id>/public/artifacts/<artifact>.json;
 * the dev server pushes `datapass:artifact-changed {id, sha256}` and the page refetches + re-validates.
 * Dev only (`apply:'serve'`): nothing of this reaches a production build. Producer-agnostic: it watches files only.
 */
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';

export const ARTIFACT_CHANGED_EVENT='datapass:artifact-changed';
const FILE=/^([a-z][a-zA-Z0-9_-]{0,79})\.json$/;
const RESERVED=new Set(['manifest','constructor','prototype','__proto__']);

/** `<dir>/<id>.json` -> id; temp files, the manifest and anything outside `dir` -> null. */
export function artifactIdForFile(file,dir){
  const resolved=path.resolve(file);
  if(path.dirname(resolved)!==path.resolve(dir))return null;
  const match=FILE.exec(path.basename(resolved));
  return match&&!RESERVED.has(match[1])?match[1]:null;
}
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

/**
 * Per-id debounce (a producer may write several times quickly) + sha256 dedupe (a rewrite with
 * identical bytes, or a duplicate watcher event, sends nothing). Unreadable files are skipped;
 * the next event retries. `seed(id, sha)` records what the page already has.
 */
export function createArtifactNotifier({send,read=file=>readFile(file),debounceMs=60,timers=globalThis}){
  const pending=new Map(),last=new Map();
  return {
    seed(id,hash){last.set(id,hash);},
    notify(id,file){
      timers.clearTimeout(pending.get(id));
      pending.set(id,timers.setTimeout(async()=>{
        pending.delete(id);
        let hash;
        try{hash=sha256(await read(file));}catch{return;}
        if(last.get(id)===hash)return;
        last.set(id,hash);send({id,sha256:hash});
      },debounceMs));
    },
    close(){for(const timer of pending.values())timers.clearTimeout(timer);pending.clear();},
  };
}

/** Vite plugin: watch one artifacts folder and push a custom HMR event per changed artifact. */
export function artifactWatchPlugin(dir,{debounceMs=60}={}){
  const folder=path.resolve(dir);
  return {
    name:'datapass-artifact-watch',apply:'serve',
    async configureServer(server){
      const notifier=createArtifactNotifier({debounceMs,send:data=>server.ws.send({type:'custom',event:ARTIFACT_CHANGED_EVENT,data})});
      for(const name of await readdir(folder).catch(()=>[])){
        const id=artifactIdForFile(path.join(folder,name),folder);
        if(id)try{notifier.seed(id,sha256(await readFile(path.join(folder,name))));}catch{/* raced with a writer */}
      }
      // Adding a missing folder to the shared chokidar watcher stalls its initial scan on Windows,
      // so clients without public/artifacts never reach the client:dev "armed" barrier.
      if(existsSync(folder))server.watcher.add(folder);
      const onFile=file=>{const id=artifactIdForFile(file,folder);if(id)notifier.notify(id,file);};
      server.watcher.on('add',onFile);server.watcher.on('change',onFile);
      server.httpServer?.once('close',()=>notifier.close());
    },
  };
}
