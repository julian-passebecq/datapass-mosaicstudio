/** Trusted local authoring command. Reuses Vite; no IDE daemon, RPC or deployment. */
import {spawn} from 'node:child_process';
import net from 'node:net';
import {lstat,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {clientWatchFiles,waitForWatchedFiles} from './client-watch-ready.mjs';
// WHATWG Fetch 2.9, non-privileged bad ports (checked 2026-10-04). Never bypass browser blocking.
const badPorts=new Set([1719,1720,1723,2049,3659,4045,4190,5060,5061,6000,6566,6665,6666,6667,6668,6669,6679,6697,10080]);

export function parseDevArguments(args){
  const [id,...flags]=args;
  if(!id||!/^[a-z][a-z0-9-]{0,59}$/.test(id))throw new Error('Usage: client:dev -- <client-id> [--port 5173] [--json]. Use lowercase letters, numbers and hyphens.');
  const options={id,port:5173,json:false};const seen=new Set();
  for(let i=0;i<flags.length;i++){
    const flag=flags[i];if(seen.has(flag))throw new Error('Repeated option: '+flag);seen.add(flag);
    if(flag==='--json')options.json=true;
    else if(flag==='--port'){
      const value=flags[++i];if(!/^\d+$/.test(value||''))throw new Error('--port requires an integer from 1024 to 65535');
      options.port=Number(value);if(options.port<1024||options.port>65535)throw new Error('--port requires an integer from 1024 to 65535');
      if(badPorts.has(options.port))throw new Error('This port is blocked by browsers; use 5173 or another safe HTTP development port.');
    }else throw new Error('Unknown option: '+flag+'. The server is always loopback-only.');
  }
  return options;
}

/** Vite hands plugins POSIX-style ids (`D:/x/app.ts`) while `root` is native (`D:\x`) on Windows. */
export function isClientFile(file,root){
  const resolved=path.resolve(file),base=path.resolve(root);
  return resolved.startsWith(base+path.sep);
}

export async function startClientDev(options){
  const {id,port,json}=parseDevArguments([options.id,'--port',String(options.port??5173),...(options.json?['--json']:[])]);
  const root=path.resolve('clients',id),abort=new AbortController();
  let server,closing=false,stopped=false,restarting=false,restartQueued=false,descriptor,environmentKey='',lastPlan,refresh=Promise.resolve(),restartTask=Promise.resolve();
  // Process ownership stays with the caller. The descriptor is a status receipt, not a PID kill command.
  const descriptorPath=path.resolve('.generated','client-host-'+id+'-'+process.pid+'.json');
  let writes=Promise.resolve();
  function report(status,extra={}){
    descriptor={format:'datapass.client-host',version:1,clientId:id,pid:process.pid,status,
      url:status==='ready'?`http://127.0.0.1:${port}/?app=${id}`:null,
      descriptor:path.relative(process.cwd(),descriptorPath),capabilities:lastPlan?.capabilities??[],buildTarget:`dist-clients/${id}`,...extra};
    const copy=JSON.stringify(descriptor);
    console.log(copy);
    writes=writes.then(async()=>{await mkdir('.generated',{recursive:true});const temporary=descriptorPath+'.'+process.pid+'.tmp';await writeFile(temporary,copy+'\n');await rename(temporary,descriptorPath);});
    return writes;
  }
  const run=args=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{stdio:['ignore',2,2],signal:abort.signal});
    child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(`${args[0]} failed (${signal||code}); inspect the diagnostic above.`)));
  });
  async function environment(){
    const [{loadClient},{planCapabilities},{readPublication},{SiteRuntime},{checkModelAssets}]=await Promise.all([
      import('./load-client.mjs'),import('../src/framework/capabilities.ts'),import('./publication.mjs'),import('../src/framework/runtime.ts'),import('./model-assets.mjs')]);
    const definition=await loadClient(id);
    // Exporting a plain source object must not bypass semantic or asset validation on HMR.
    const runtime=new SiteRuntime(definition);runtime.review(JSON.stringify(runtime.save(runtime.manifest.pages[0].id)));
    await checkModelAssets(definition,root);
    if(definition.manifest.id!==id)throw new Error(`clients/${id}/app.ts: manifest.id must equal the folder name`);
    const publication=await readPublication(root,{title:definition.manifest.title,description:definition.manifest.description||'A DataPass client application.'});
    lastPlan=planCapabilities(definition);
    const next=JSON.stringify({capabilities:lastPlan.capabilities,publication});
    Object.assign(process.env,{STUDIO_CLIENT:id,STUDIO_CAPABILITIES:JSON.stringify(lastPlan.capabilities),STUDIO_PUBLICATION:JSON.stringify(publication)});
    return next;
  }
  async function watchReady(active){await waitForWatchedFiles(active.watcher,await clientWatchFiles(root),{signal:abort.signal});}
  function recordStop(){if(stopped)return writes;stopped=true;return report('stopped');}
  async function stop(){
    if(closing)return;closing=true;abort.abort();
    try{await refresh.catch(()=>{});await restartTask;await server?.close();await recordStop();}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);process.stdin.removeListener('end',stop);if(followStdin)process.stdin.pause();}
  }
  process.once('SIGINT',stop);process.once('SIGTERM',stop);process.stdin.once('end',stop);
  // A paused stdin never emits 'end'. The CLI follows an owner's pipe so closing it stops the host gracefully:
  // the only graceful stop on Windows, where SIGTERM cannot be caught. Never a TTY or an ignored stdin (that is EOF at once).
  // Followed only once ready, so a host that cannot start still reports its own error (port in use, invalid source).
  const followStdin=options.followStdin===true&&!process.stdin.isTTY&&process.stdin instanceof net.Socket;
  try{
    const stat=await lstat(root).catch(()=>null);
    if(!stat?.isDirectory()||stat.isSymbolicLink())throw new Error(`Unknown or symbolic client: clients/${id}. Run client:new first.`);
    await report('preparing');
    await run(['scripts/bootstrap-upstreams.mjs']);
    await run(['scripts/prepare-fluent-icons.mjs']);
    await run(['--experimental-strip-types','scripts/check-clients.mjs',id]);
    environmentKey=await environment();abort.signal.throwIfAborted();
    const {createServer}=await import('vite');
    server=await createServer({configFile:path.resolve('vite.client.config.ts'),logLevel:json?'silent':'info',clearScreen:false,
      server:{host:'127.0.0.1',port,strictPort:true,cors:false,open:false},
      plugins:[{name:'studio-client-authoring-status',enforce:'pre',
        // Vite installs its own SIGTERM exit handler. Its close hook must await our final receipt.
        async closeBundle(){if(closing&&!restarting)await recordStop();},
        async handleHotUpdate(context){
        if(!isClientFile(context.file,root))return;
        // Artifact data files are followed by artifact-watch-plugin (no client re-validation, no reload).
        if(path.dirname(path.resolve(context.file))===path.join(root,'public','artifacts'))return [];
        let restart=false,invalid=false;
        refresh=refresh.catch(()=>{}).then(async()=>{
          if(closing)return;
          try{
            const next=await environment();restart=next!==environmentKey;environmentKey=next;
            await report(restart?'restarting':'ready');
          }catch(error){invalid=true;await report('invalid',{message:String(error.message||error)});}
        });
        await refresh;
        // Vite owns HMR. Restart only when compile-time capabilities/publication change.
        // Defer restart until this hook returns, avoiding a restart waiting on its own transform.
        if(restart&&!closing){
          if(!restartQueued){restartQueued=true;setImmediate(()=>{
            if(closing){restartQueued=false;return;}
            restarting=true;restartTask=(async()=>{try{await context.server.restart();await watchReady(context.server);restarting=false;restartQueued=false;if(!closing)await report('ready');}catch(error){if(!closing)await report('invalid',{message:String(error.message||error)});}finally{restarting=false;restartQueued=false;}})();
          });}return [];
        }
        if(invalid)return; // Let Vite show its normal source error overlay; a later save can recover.
      }}]});
    abort.signal.throwIfAborted();await server.listen();await watchReady(server);abort.signal.throwIfAborted();
    if(!json)console.error(`Client ${id}: http://127.0.0.1:${port}/?app=${id}\nEdit clients/${id}/; stop with Ctrl+C. Local trusted source only, not a security boundary.`);
    await report('ready');if(followStdin)process.stdin.resume();
    return {server,stop,getStatus:()=>descriptor};
  }catch(error){
    await server?.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);process.stdin.removeListener('end',stop);if(followStdin)process.stdin.pause();
    if(closing){await writes;return null;}
    await report('error',{message:String(error.message||error)});throw error;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let options;
  try{options=parseDevArguments(process.argv.slice(2));await startClientDev({...options,followStdin:true});}
  catch(error){if(!options)console.log(JSON.stringify({format:'datapass.client-host',version:1,status:'error',message:String(error.message||error)}));console.error('client:dev: '+String(error.message||error));process.exitCode=1;}
}
