import {StoryPlayer,type Scheduler} from '@vizforge/core/player';
import {parseStory} from '@vizforge/core/spec';
import {validateReplay,type ReplaySpec,REPLAY_SPEEDS} from './model';
/** Adapter around the original discrete player. There is exactly one timer per resource.
 * Sample timestamps drive scheduler delays; no new RAF/autoplay engine is introduced.
 */
export function createReplayController(input:ReplaySpec,reduced=false,scheduler:Scheduler={set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id as ReturnType<typeof setTimeout>)}){
  const spec=validateReplay(input);let speed=1;
  const story=parseStory({id:'sampled-replay',version:'1.0',title:spec.title,description:spec.description,intervalMs:2500,
    visuals:[{id:'sample-index',version:'1.0',type:'time-series',title:'Sample index',subtitle:'Internal clock positions, not a measured channel',takeaway:'Each state refers to an actual supplied sample.',source:spec.source,note:'No interpolated measurements.',accessibility:{summary:'Supplied replay samples in time order'},
      data:spec.time.map((time,i)=>({id:'samples',label:'Sample',time,value:i})),encodings:{id:'id',label:'label',time:'time',value:'value'}}],
    scenes:spec.time.map((time,i)=>({id:'sample-'+i,visualId:'sample-index',title:'Sample '+(i+1),caption:time+' seconds',state:{time},transition:{intent:'morph-update',durationMs:0}}))});
  const player:StoryPlayer=new StoryPlayer(story,reduced,{
    set:(fn,_delay)=>{const index=player.getState().index,next=Math.min(index+1,spec.time.length-1);return scheduler.set(fn,(spec.time[next]-spec.time[index])*1000/speed);},
    clear:handle=>scheduler.clear(handle),
  });
  return {
    spec,player,getSnapshot:player.getState,subscribe:player.subscribe,
    play(){if(!player.getState().reducedMotion)player.play();},pause:player.pause,
    seek(index:number){player.seek(index);},next:player.next,previous:player.previous,
    setSpeed(value:string){if(!REPLAY_SPEEDS.includes(value as typeof REPLAY_SPEEDS[number]))throw new Error('Unsupported replay speed');const next=Number(value);if(next===speed)return;const playing=player.getState().playing;player.pause();speed=next;if(playing&&!player.getState().reducedMotion)player.play();},
    setReducedMotion(value:boolean){if(value)player.pause();player.setReducedMotion(value);},
    dispose:player.dispose,
  };
}
export type ReplayController=ReturnType<typeof createReplayController>;
