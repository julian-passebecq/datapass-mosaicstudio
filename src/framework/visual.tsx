/** Lightweight custom SVG/Canvas/React host helpers. No renderer, store or scheduler. */
import {useCallback,useEffect,useState} from 'react';
import {useRuntime,useSiteState} from './hooks';
import {readSelection} from './selection';
export {useReducedMotion} from './hooks';

export function useSelection(fieldId:string,onManualSelection?:()=>void){
  const runtime=useRuntime(),snapshot=useSiteState();
  const selected=readSelection(runtime.manifest,snapshot.values,fieldId);
  const select=useCallback((id:string)=>{
    // Existing runtime validates the entire view patch before publishing. No silent coercion.
    runtime.applyCue({[fieldId]:id});
    onManualSelection?.(); // Typically pauses the EXISTING Story/replay/scroll controller.
  },[runtime,fieldId,onManualSelection]);
  return {selected,select};
}

/** Observe only the owned container. Replacing/unmounting it disconnects the observer.
 * A zero-size hidden container is not ready; no fake default dimensions or idle RAF.
 */
export function useElementSize<T extends HTMLElement=HTMLDivElement>(){
  const [element,setElement]=useState<T|null>(null),[size,setSize]=useState({width:0,height:0});
  const ref=useCallback((node:T|null)=>setElement(node),[]);
  useEffect(()=>{
    if(!element)return;
    let alive=true;
    const update=(width:number,height:number)=>{if(alive)setSize(old=>old.width===width&&old.height===height?old:{width,height});};
    const rect=element.getBoundingClientRect();update(rect.width,rect.height);
    if(typeof ResizeObserver==='undefined')return()=>{alive=false;};
    const observer=new ResizeObserver(entries=>{const entry=entries[0];if(entry)update(entry.contentRect.width,entry.contentRect.height);});
    observer.observe(element);
    return()=>{alive=false;observer.disconnect();};
  },[element]);
  return {ref,...size,ready:!!element&&size.width>0&&size.height>0};
}
