/** Real Vite startup/restart regression, isolated from the qualification process. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFile,readFile,rm} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

if(process.argv[2]!=='--owned'){
  // Keep the owned CLI's stdin open until completion, as a terminal host does.
  const child=spawn(process.execPath,['--experimental-strip-types',fileURLToPath(import.meta.url),'--owned'],{stdio:['pipe','inherit','inherit'],env:{...process.env,CI:'true'}});
  let timedOut=false;
  // Budget: preparation plus three cycles of three Vite restarts; Windows under load needs ~75 s.
  const timer=setTimeout(()=>{timedOut=true;console.error('engine-host-watch: timed out after 150 s');child.kill('SIGTERM');},150000);
  child.on('exit',(code)=>{clearTimeout(timer);child.stdin.destroy();process.exitCode=timedOut?1:code??1;});
  child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1;});
}else{
  const {scaffoldClient}=await import('../scripts/scaffold-client.mjs');
  const {startClientDev}=await import('../scripts/client-dev.mjs');
  const id='engine-watch-'+process.pid,root=path.resolve('clients',id);let host,owned=false;
  // The restart runs in this process and can starve the poll; always re-check after the last wait.
  const until=async predicate=>{const start=Date.now();while(Date.now()-start<30000){if(predicate())return;await delay(2);}if(predicate())return;throw new Error('Immediate edit was lost: '+JSON.stringify(host.getStatus()));};
  const publication=title=>JSON.stringify({format:'datapass.publication',version:1,visibility:'preview',language:'en',title});
  const assertArmed=()=>{const files=host.server.watcher.getWatched()[root]??[];assert.ok(files.includes('app.ts')&&files.includes('publication.json'),'ready must cover the selected source and metadata');};
  try{
    await scaffoldClient({id,family:'content',custom:true});owned=true;
    await writeFile(root+'/publication.json',publication('Before immediate save'));
    host=await startClientDev({id,port:5177,json:true});assertArmed();
    const initial=await readFile(root+'/app.ts','utf8');
    for(let index=0;index<3;index++){
      await writeFile(root+'/app.ts',initial.replace('clientNote:[]',"clientNote:['charts']"));
      await until(()=>host.getStatus().status==='ready'&&host.getStatus().capabilities.includes('charts'));assertArmed();
      const before=host.getStatus();
      await writeFile(root+'/publication.json',publication('Immediate save '+index));
      await until(()=>host.getStatus()!==before&&host.getStatus().status==='ready');assertArmed();
      const response=await fetch('http://127.0.0.1:5177/');assert.equal(response.status,200);
      assert.ok((await response.text()).includes('Immediate save '+index),'HTTP metadata must reflect the immediate saved publication');
      await writeFile(root+'/app.ts',initial);
      await until(()=>host.getStatus().status==='ready'&&!host.getStatus().capabilities.includes('charts'));assertArmed();
      console.log('PASS immediate capability/publication cycle '+index);
    }
  }catch(error){console.error(error);process.exitCode=1;}
  finally{await host?.stop();if(owned)await rm(root,{recursive:true,force:true});}
}
