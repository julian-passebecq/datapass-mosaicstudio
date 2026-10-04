import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {chapterAt} from './scroll-model';
/** Native scroll selects finite authored stops. No wheel cancellation or hidden animation clock. */
export function useScrollSteps(track:RefObject<HTMLElement|null>,stage:RefObject<HTMLElement|null>,stops:readonly string[],visit:(id:string)=>void,restoreEpoch:number,available:boolean){
  if(!stops.length||new Set(stops).size!==stops.length||stops.some(id=>!id||id.includes('|')))throw new Error('Scroll stops require nonempty unique IDs without |');
  const [guided,setGuided]=useState(false),[following,setFollowing]=useState(false),[chapter,setChapter]=useState(0);
  const latest=useRef({stops,visit});latest.current={stops,visit};
  const previous=useRef(-1),key=stops.join('|');
  const pause=useCallback(()=>{setFollowing(false);},[]);
  const disable=useCallback(()=>{setFollowing(false);setGuided(false);},[]);
  useEffect(()=>{setFollowing(false);},[restoreEpoch,key]);
  useEffect(()=>{if(!available)disable();},[available,disable]);
  useEffect(()=>{
    if(!guided||!following||!available)return;
    let frame=0;
    const update=()=>{frame=0;if(document.hidden||!track.current||!stage.current)return;
      const rect=track.current.getBoundingClientRect(),distance=rect.height-stage.current.getBoundingClientRect().height;
      if(distance<=0||rect.top>innerHeight*.6||rect.bottom<0)return;
      const next=chapterAt((16-rect.top)/distance,latest.current.stops.length);
      if(previous.current!==next){previous.current=next;setChapter(next);latest.current.visit(latest.current.stops[next]);}
    };
    const scroll=()=>{if(!frame)frame=requestAnimationFrame(update);};
    const keydown=(e:KeyboardEvent)=>{if(e.key==='Escape')setFollowing(false);};
    const visibility=()=>{if(document.hidden)setFollowing(false);};
    window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('resize',scroll);window.addEventListener('keydown',keydown);document.addEventListener('visibilitychange',visibility);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',scroll);window.removeEventListener('resize',scroll);window.removeEventListener('keydown',keydown);document.removeEventListener('visibilitychange',visibility);};
  },[guided,following,available,track,stage]);
  function start(){if(!available)return;previous.current=-1;setGuided(true);setFollowing(true);}
  return {guided,following,chapter,start,pause,disable};
}
