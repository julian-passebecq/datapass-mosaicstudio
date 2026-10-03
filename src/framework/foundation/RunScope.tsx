import {createContext,useContext,useEffect,useMemo,type ReactNode} from 'react';
import {useRuntime} from '../hooks';
import {RunJournal,validateRunResource,type RunResource} from './journal';
const Context=createContext<Map<string,{journal:RunJournal;resource:RunResource}>|null>(null);
export function useRunJournal(resource:string){
  const value=useContext(Context)?.get(resource);if(!value)throw new Error('Run views require the app run scope');return value;
}
/** App lifetime, not page lifetime. Records survive switching pages within a StudioSite. */
export function RunScope({ids,children}:{ids:string[];children:ReactNode}){
  const runtime=useRuntime(),key=[...ids].sort().join('|');
  const journals=useMemo(()=>new Map(ids.map(id=>{
    const resource=validateRunResource(runtime.definition.resources?.runs?.[id],runtime);
    const options={...(resource.maxRecords===undefined?{}:{maxRecords:resource.maxRecords}),...(resource.maxBytes===undefined?{}:{maxBytes:resource.maxBytes})};
    return [id,{resource,journal:new RunJournal(runtime,resource.specs,options)}] as const;
  })),[runtime,key]);
  useEffect(()=>{const off=[...journals.values()].map(v=>v.journal.attach());return()=>off.forEach(fn=>fn());},[journals]);
  return <Context.Provider value={journals}>{children}</Context.Provider>;
}
