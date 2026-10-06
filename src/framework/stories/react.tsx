import {createContext,useContext,useEffect,useMemo,useSyncExternalStore,type ReactNode} from 'react';
import {StoryPlayer} from '@vizforge/core/player';
import {parseStory,type StorySpec} from '@vizforge/core/spec';
import {useRuntime,useSiteState,useReducedMotion} from '../hooks';
import type {StoryResource} from '../types';
type Controlled={player:StoryPlayer;story:StorySpec;resource:StoryResource;synchronizing:boolean};
const Context=createContext<Map<string,Controlled>|null>(null);
export function StoryScope({ids,children}:{ids:string[];children:ReactNode}){
  const runtime=useRuntime(),snapshot=useSiteState(),reduced=useReducedMotion();
  const key=ids.join(',');
  const controllers=useMemo(()=>new Map(ids.map(id=>{
    const resource=runtime.definition.resources!.stories![id],story=parseStory(resource.spec),field=runtime.manifest.fields.find(f=>f.id===resource.indexField)!;
    if(field.max!==story.scenes.length-1||!Number.isInteger(field.default))throw new Error('Story index bounds must match its scene count');
    for(const name of Object.keys(resource.cues))if(!story.scenes.some(s=>s.id===name))throw new Error('Cue references an unknown VizForge scene');
    const player=new StoryPlayer(story,reduced);player.seek(Number(snapshot.values[resource.indexField]));
    return [id,{player,story,resource,synchronizing:false} as Controlled] as const;
  })),[runtime,key]);
  useEffect(()=>{
    const cleanup=[...controllers.values()].map(controller=>{
      const {player,story,resource}=controller;
      let last=player.getState().index,applyingCue=false,previous=runtime.getSnapshot();
      const fields=new Set(Object.values(resource.cues).flatMap(cue=>Object.keys(cue)));
      const off=player.subscribe(()=>{
        const index=player.getState().index;if(index===last)return;last=index;if(controller.synchronizing)return;
        applyingCue=true;
        try{runtime.applyCue({...resource.cues[story.scenes[index].id],[resource.indexField]:index});}finally{applyingCue=false;}
      });
      // A manual change to a cue-owned field yields to exploration. The original player
      // remains the only clock; its own atomic cue must never pause itself.
      const offView=runtime.subscribe(()=>{
        const next=runtime.getSnapshot(),changed=[...fields].some(field=>next.values[field]!==previous.values[field]);
        previous=next;if(changed&&!applyingCue)player.pause();
      });
      return ()=>{off();offView();player.pause();};
    });
    const hidden=()=>{if(document.hidden)controllers.forEach(c=>c.player.pause());};
    document.addEventListener('visibilitychange',hidden);
    return ()=>{cleanup.forEach(fn=>fn());document.removeEventListener('visibilitychange',hidden);};
  },[controllers,runtime]);
  useEffect(()=>{controllers.forEach(controller=>{const {player,resource}=controller;const index=Number(snapshot.values[resource.indexField]);if(player.getState().index!==index){player.pause();controller.synchronizing=true;try{player.seek(index);}finally{controller.synchronizing=false;}}});},[controllers,snapshot.values]);
  useEffect(()=>{controllers.forEach(c=>{c.player.setReducedMotion(reduced);if(reduced)c.player.pause();});},[controllers,reduced]);
  useEffect(()=>{controllers.forEach(c=>c.player.pause());},[controllers,snapshot.restoreEpoch]);
  return <Context.Provider value={controllers}>{children}</Context.Provider>;
}

/** Consume the existing page-scoped player; never creates a second controller. */
export function useStory(resourceId:string){
  const controller=useContext(Context)?.get(resourceId);
  if(!controller)throw new Error('Story consumer requires a story-controls or story-figure block for the same resource on this page.');
  const state=useSyncExternalStore(controller.player.subscribe,controller.player.getState,controller.player.getState);
  return {...controller,state,scene:controller.story.scenes[state.index]};
}
