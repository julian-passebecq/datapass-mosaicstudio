/** Optional consumer API over the one existing page-scoped replay controller. */
import {useSyncExternalStore} from 'react';
import {useSiteState} from '../hooks';
import {useReplay} from './Scope';
import {readReplayState,sampleValue} from './model';
export {useReplay} from './Scope';
export function useReplayTime(resourceId:string){
  const {controller,binding}=useReplay(resourceId),snapshot=useSiteState();
  const player=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
  const state=readReplayState(binding,snapshot.values),spec=controller.spec;
  return {...state,timeSeconds:spec.time[state.frame],playing:player.playing,controller,spec,
    sample:(entity:string,channel=state.channel)=>sampleValue(spec,entity,channel,state.frame)};
}
