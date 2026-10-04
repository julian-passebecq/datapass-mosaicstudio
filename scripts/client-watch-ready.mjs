/** Observe the existing Vite watcher; never create another watcher or dev server. */
import {readdir} from 'node:fs/promises';
import path from 'node:path';
export async function clientWatchFiles(root){
  const files=[];
  for(const entry of await readdir(root,{withFileTypes:true})){
    // These trees are ignored by the pinned Vite watch configuration as well.
    if(['.git','node_modules','test-results'].includes(entry.name))continue;
    const file=path.join(root,entry.name);
    if(entry.isDirectory())files.push(...await clientWatchFiles(file));
    else if(entry.isFile())files.push(file);
  }
  return files;
}
export function waitForWatchedFiles(watcher,files,{signal,timeoutMs=10000}={}){
  const expected=files.map(file=>path.resolve(file));
  return new Promise((resolve,reject)=>{
    let timer,poll,done=false;
    const cleanup=()=>{clearTimeout(timer);clearTimeout(poll);for(const event of ['ready','add','change'])watcher.off(event,check);watcher.off('error',fail);signal?.removeEventListener('abort',abort);};
    const finish=error=>{if(done)return;done=true;cleanup();error?reject(error):resolve();};
    const missing=()=>{const watched=watcher.getWatched();return expected.filter(file=>!watched[path.dirname(file)]?.includes(path.basename(file)));};
    // Coverage can appear after the native ready event without an add event
    // (ignoreInitial). Poll only during this bounded startup/restart barrier.
    const check=()=>{clearTimeout(poll);if(done)return;try{if(missing().length===0)finish();else poll=setTimeout(check,25);}catch(error){finish(error);}};
    const fail=error=>finish(error),abort=()=>finish(signal.reason??new Error('Client watch preparation aborted'));
    for(const event of ['ready','add','change'])watcher.on(event,check);
    watcher.on('error',fail);signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{try{const absent=missing();finish(absent.length?new Error('Vite has not armed the selected client files: '+absent.join(', ')):null);}catch(error){finish(error);}},timeoutMs);
    if(signal?.aborted)abort();else check();
  });
}
