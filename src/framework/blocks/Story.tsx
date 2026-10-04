import {Figure} from '@vizforge/adapters/react';
import {useReducedMotion} from '../hooks';
import {useStory} from '../stories/react';
import type {Block} from '../types';
export {StoryScope} from '../stories/react';
export default function StoryBlock({block}:{block:Extract<Block,{type:'story-controls'|'story-figure'}>}){
  const {player,story,state,scene}=useStory(block.resource),reduced=useReducedMotion();
  const visual=story.visuals.find(v=>v.id===scene.visualId)!;
  if(block.type==='story-figure')return <div className="site-viz site-story-figure" data-scene={scene.id}><Figure spec={visual} scene={scene} options={{reducedMotion:reduced,animate:!reduced}}/></div>;
  return <div className="site-story-controls" tabIndex={0} aria-label={story.title+' controls'} onKeyDown={e=>{if((e.target as HTMLElement).closest('input,select,textarea,button'))return;if(e.key==='ArrowRight'){e.preventDefault();player.next();}if(e.key==='ArrowLeft'){e.preventDefault();player.previous();}}}><span className="site-kicker">{String(state.index+1).padStart(2,'0')} / {story.scenes.length} &middot; shared scene</span><div aria-live="polite"><h2>{scene.title}</h2><p>{scene.caption}</p></div><div className="site-playback"><button type="button" aria-label="Previous shared scene" disabled={state.index===0} onClick={()=>player.previous()}>Previous</button><button type="button" disabled={reduced||!state.playing&&state.index===story.scenes.length-1} onClick={()=>state.playing?player.pause():player.play()}>{state.playing?'Pause story':'Play story'}</button><button type="button" aria-label="Next shared scene" disabled={state.index===story.scenes.length-1} onClick={()=>player.next()}>Next</button></div><label>Scene<input type="range" aria-label="Shared story scene" min={0} max={story.scenes.length-1} step={1} value={state.index} onChange={e=>{player.pause();player.seek(Number(e.target.value));}}/></label>{reduced&&<small>Reduced motion: automatic playback is disabled; manual steps remain available.</small>}</div>;
}
