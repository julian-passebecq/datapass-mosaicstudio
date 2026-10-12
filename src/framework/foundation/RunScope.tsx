import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {useRuntime} from '../hooks';
import {RunJournal,validateRunResource,type RunResource} from './journal';
import {bindRunHistory,type RunHistoryController} from './run-history';
/** `saved` is present only when the client supplied `definition.runHistory[id]` (opt-in, references only). */
export type SavedRunHistory={notice:string|null;reset():void};
type Entry={journal:RunJournal;resource:RunResource};
const Context=createContext<Map<string,Entry>|null>(null);
const SavedContext=createContext<Readonly<Record<string,SavedRunHistory>>>({});
export function useRunJournal(resource:string){
  const value=useContext(Context)?.get(resource);if(!value)throw new Error('Run views require the app run scope');return value;
}
export function useSavedRunHistory(resource:string):SavedRunHistory|null{return useContext(SavedContext)[resource]??null;}
/** App lifetime, not page lifetime. Records survive switching pages within a StudioSite.
 * Reload survival exists only for references, and only when the client opts in with `runHistory`. */
export function RunScope({ids,children}:{ids:string[];children:ReactNode}){
  const runtime=useRuntime(),key=[...ids].sort().join('|');
  const journals=useMemo(()=>new Map(ids.map(id=>{
    const resource=validateRunResource(runtime.definition.resources?.runs?.[id],runtime);
    const options={...(resource.maxRecords===undefined?{}:{maxRecords:resource.maxRecords}),...(resource.maxBytes===undefined?{}:{maxBytes:resource.maxBytes})};
    return [id,{resource,journal:new RunJournal(runtime,resource.specs,options)}] as const;
  })),[runtime,key]);
  const [saved,setSaved]=useState<Record<string,SavedRunHistory>>({});
  useEffect(()=>{
    // Load and validate the whole stored snapshot before attaching; restoring never reruns or schedules a task.
    const controllers:RunHistoryController[]=[];
    for(const [id,{journal,resource}] of journals){
      const controller=bindRunHistory(journal,runtime.definition.runHistory?.[id],{manifest:runtime.manifest,resource:id,specs:resource.specs},
        notice=>setSaved(s=>({...s,[id]:{...s[id]!,notice}})));
      if(!controller)continue;
      controllers.push(controller);
      setSaved(s=>({...s,[id]:{notice:controller.notice??s[id]?.notice??null,reset:()=>controller.reset()}}));
    }
    const off=[...journals.values()].map(v=>v.journal.attach());
    return()=>{controllers.forEach(c=>c.dispose());off.forEach(fn=>fn());};
  },[journals,runtime]);
  return <Context.Provider value={journals}><SavedContext.Provider value={saved}>{children}</SavedContext.Provider></Context.Provider>;
}
