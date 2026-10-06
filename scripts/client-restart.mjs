/** Serialises client:dev restarts against Vite's HMR hooks.
 * Vite's handleHMRUpdate snapshots `server.environments` before awaiting plugin hooks, and `server.restart()`
 * swaps those environments in place. A hook still awaiting when a restart lands resumes against the stale
 * snapshot (`hot.error`: Cannot set properties of undefined). Node 22's watcher also delivers duplicate change
 * events for one save; the duplicate must not report `ready` while the restart it belongs to is still pending.
 * Rules: a restart starts only once no hook is in flight; a hook arriving while a restart is pending never
 * awaits; a change requested during a restart triggers one more restart before `ready`.
 */
export function createRestartGate({restart,onReady,onError,isClosing,schedule=setImmediate}){
  let inflight=0,wanted=false,queued=false,running=false,task=Promise.resolve();const idle=[];
  const waitIdle=()=>inflight===0?Promise.resolve():new Promise(resolve=>idle.push(resolve));
  async function run(){
    try{
      while(wanted&&!isClosing()){
        await waitIdle();await new Promise(resolve=>schedule(resolve));if(isClosing())break;
        wanted=false;running=true;await restart();running=false;
      }
      running=false;if(!isClosing()&&!wanted)await onReady();
    }catch(error){wanted=false;running=false;if(!isClosing())await onError(error);}
    finally{running=false;queued=false;if(wanted&&!isClosing())start();}
  }
  function start(){queued=true;task=run();}
  return {
    /** A restart is requested, queued or running: HMR on this server is moot. */
    get pending(){return wanted||queued;},
    get running(){return running;},
    request(){wanted=true;if(!queued&&!isClosing())start();},
    /** Track a Vite hook invocation so no restart starts underneath it. */
    async hook(fn){inflight++;try{return await fn();}finally{inflight--;if(inflight===0)for(const resolve of idle.splice(0))resolve();}},
    settled(){return task;},
  };
}
