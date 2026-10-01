import {createContext,useContext,useEffect,useMemo,useSyncExternalStore,type ReactNode} from 'react';
import {StoryPlayer} from '@vizforge/core/player';
import {parseStory,type StorySpec} from '@vizforge/core/spec';
import {Figure} from '@vizforge/adapters/react';
import {useRuntime,useSiteState,useReducedMotion} from '../hooks';
import type {StoryResource,Block} from '../types';
type Controlled={player:StoryPlayer;story:StorySpec;resource:StoryResource};
const Context=createContext<Map<string,Controlled>|null>(null);
export function StoryScope({ids,children}:{ids:string[];children:ReactNode}){
  const runtime=useRuntime(),snapshot=useSiteState(),reduced=useReducedMotion();
  const key=ids.join(',');
  const controllers=useMemo(()=>new Map(ids.map(id=>{
    const resource=runtime.definition.resources!.stories![id],story=parseStory(resource.spec),field=runtime.manifest.fields.find(f=>f.id===resource.indexField)!;
    if(field.max!==story.scenes.length-1||!Number.isInteger(field.default))throw new Error('Story index bounds must match its scene count');
    for(const name of Object.keys(resource.cues))if(!story.scenes.some(s=>s.id===name))throw new Error('Cue references an unknown VizForge scene');
    const player=new StoryPlayer(story,reduced);player.seek(Number(snapshot.values[resource.indexField]));
    return [id,{player,story,resource}] as const;
  })),[runtime,key]);
  useEffect(()=>{
    const cleanup=[...controllers.values()].map(({player,story,resource})=>{
      let last=player.getState().index;
      const off=player.subscribe(()=>{const index=player.getState().index;if(index===last)return;last=index;runtime.applyCue({...resource.cues[story.scenes[index].id],[resource.indexField]:index});});
      return ()=>{off();player.pause();};
    });
    const hidden=()=>{if(document.hidden)controllers.forEach(c=>c.player.pause());};
    document.addEventListener('visibilitychange',hidden);
    return ()=>{cleanup.forEach(fn=>fn());document.removeEventListener('visibilitychange',hidden);};
  },[controllers,runtime]);
  useEffect(()=>{controllers.forEach(({player,resource})=>{const index=Number(snapshot.values[resource.indexField]);if(player.getState().index!==index){player.pause();player.seek(index);}});},[controllers,snapshot.values]);
  useEffect(()=>{controllers.forEach(c=>{c.player.setReducedMotion(reduced);if(reduced)c.player.pause();});},[controllers,reduced]);
  useEffect(()=>{controllers.forEach(c=>c.player.pause());},[controllers,snapshot.restoreEpoch]);
  return <Context.Provider value={controllers}>{children}</Context.Provider>;
}
export default function StoryBlock({block}:{block:Extract<Block,{type:'story-controls'|'story-figure'}>}){
  const controller=useContext(Context)?.get(block.resource),reduced=useReducedMotion();
  if(!controller)throw new Error('Story block has no shared controller');
  const {player,story}=controller,state=useSyncExternalStore(player.subscribe,player.getState,player.getState),scene=story.scenes[state.index],visual=story.visuals.find(v=>v.id===scene.visualId)!;
  if(block.type==='story-figure')return <div className="site-viz site-story-figure" data-scene={scene.id}><Figure spec={visual} scene={scene} options={{reducedMotion:reduced,animate:!reduced}}/></div>;
  return <div className="site-story-controls" tabIndex={0} aria-label={story.title+' controls'} onKeyDown={e=>{if((e.target as HTMLElement).closest('input,select,textarea,button'))return;if(e.key==='ArrowRight'){e.preventDefault();player.next();}if(e.key==='ArrowLeft'){e.preventDefault();player.previous();}}}><span className="site-kicker">{String(state.index+1).padStart(2,'0')} / {story.scenes.length} &middot; shared scene</span><div aria-live="polite"><h2>{scene.title}</h2><p>{scene.caption}</p></div><div className="site-playback"><button type="button" aria-label="Previous shared scene" disabled={state.index===0} onClick={()=>player.previous()}>Previous</button><button type="button" disabled={reduced||!state.playing&&state.index===story.scenes.length-1} onClick={()=>state.playing?player.pause():player.play()}>{state.playing?'Pause story':'Play story'}</button><button type="button" aria-label="Next shared scene" disabled={state.index===story.scenes.length-1} onClick={()=>player.next()}>Next</button></div><label>Scene<input type="range" aria-label="Shared story scene" min={0} max={story.scenes.length-1} step={1} value={state.index} onChange={e=>{player.pause();player.seek(Number(e.target.value));}}/></label>{reduced&&<small>Reduced motion: automatic playback is disabled; manual steps remain available.</small>}</div>;
}
