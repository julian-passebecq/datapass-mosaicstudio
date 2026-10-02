import {createContext,useContext,useEffect,useState,useSyncExternalStore} from 'react';
import {SiteRuntime} from './runtime';
export const RuntimeContext=createContext<SiteRuntime|null>(null);
export function useRuntime(){const value=useContext(RuntimeContext);if(!value)throw new Error('Studio block requires a SiteRuntime');return value;}
export function useSiteState(){const runtime=useRuntime();return useSyncExternalStore(runtime.subscribe,runtime.getSnapshot,runtime.getSnapshot);}
export function useReducedMotion(){const [reduced,setReduced]=useState(()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(q.matches);q.addEventListener('change',update);update();return()=>q.removeEventListener('change',update);},[]);return reduced;}
export function useDataset(id:string){const runtime=useRuntime();useSiteState();try{return {rows:runtime.dataset(id),error:null};}catch(e){return {rows:null,error:e instanceof Error?e.message:String(e)};}}

export const NavigationContext=createContext<((page:string)=>void)|null>(null);
export function useNavigatePage(){const navigate=useContext(NavigationContext);if(!navigate)throw new Error('Page navigation requires a StudioSite');return navigate;}
