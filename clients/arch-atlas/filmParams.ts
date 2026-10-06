import {FILM_DURATION} from '../../src/framework/concept/navigation.ts';
/** ?film=1&t=<seconds>&paused=1&chrome=0 opens the film at an exact frame (deterministic captures). */
export function parseFilmParams(search:string){
  const q=new URLSearchParams(search);
  return {open:q.get('film')==='1',t:Math.max(0,Math.min(FILM_DURATION,Number(q.get('t')??0)||0)),paused:q.get('paused')==='1',chrome:q.get('chrome')!=='0',spec:q.get('spec')};
}
