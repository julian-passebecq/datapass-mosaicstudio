import {createContext,useContext,useEffect,useMemo,type ReactNode} from 'react';
import {useRuntime,useSiteState,useReducedMotion} from '../hooks';
import {createReplayController,type ReplayController} from './controller';
import {readReplayState,validateReplay,type ReplayBlock} from './model';
type Shared={controller:ReplayController;binding:ReplayBlock};
const Context=createContext<Map<string,Shared>|null>(null);
export function useReplay(resource:string){const shared=useContext(Context)?.get(resource);if(!shared)throw new Error('Replay requires the page replay scope');return shared;}
export function ReplayScope({blocks,children}:{blocks:ReplayBlock[];children:ReactNode}){
  const runtime=useRuntime(),snapshot=useSiteState(),reduced=useReducedMotion(),key=blocks.map(b=>b.resource).sort().join('|');
  const shared=useMemo(()=>new Map([...new Map(blocks.map(b=>[b.resource,b])).values()].map(binding=>{
    const spec=validateReplay(runtime.definition.resources!.replays![binding.resource]),state=readReplayState(binding,runtime.getSnapshot().values),controller=createReplayController(spec,reduced);
    controller.seek(state.frame);controller.setSpeed(state.speed);return [binding.resource,{controller,binding}] as const;
  })),[runtime,key]);
  useEffect(()=>{
    const off=[...shared.values()].map(({controller,binding})=>controller.subscribe(()=>{
      const index=controller.getSnapshot().index;
      if(runtime.getSnapshot().values[binding.frame]!==index)runtime.set(binding.frame,index);
    }));
    const hide=()=>{if(document.hidden)shared.forEach(s=>s.controller.pause());};document.addEventListener('visibilitychange',hide);
    // Pause rather than dispose: React StrictMode replays this effect with the same controller.
    return()=>{off.forEach(f=>f());shared.forEach(s=>s.controller.pause());document.removeEventListener('visibilitychange',hide);};
  },[runtime,shared]);
  useEffect(()=>{shared.forEach(({controller,binding})=>{const state=readReplayState(binding,snapshot.values);if(controller.getSnapshot().index!==state.frame)controller.seek(state.frame);controller.setSpeed(state.speed);});},[shared,snapshot.values]);
  useEffect(()=>{shared.forEach(s=>s.controller.setReducedMotion(reduced));},[shared,reduced]);
  useEffect(()=>{shared.forEach(s=>s.controller.pause());},[shared,snapshot.restoreEpoch]);
  return <Context.Provider value={shared}>{children}</Context.Provider>;
}
