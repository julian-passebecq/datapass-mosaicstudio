import {useEffect,useState} from 'react';
import {roomStore} from '../store';
export type QueryView={rows:Record<string,unknown>[];columns:string[];loading:boolean;error:string|null;duration:number;};
/** A request-scoped handle prevents an old page's response being applied to a new view. */
export function useLocalQuery(query:string,enabled=true,version=0):QueryView {
  const [result,setResult]=useState<QueryView>({rows:[],columns:[],loading:false,error:null,duration:0});
  useEffect(()=>{
    if(!enabled){setResult({rows:[],columns:[],loading:false,error:null,duration:0});return;}
    let active=true;const controller=new AbortController(),start=performance.now();
    const timer=setTimeout(()=>controller.abort(),30000);
    setResult({rows:[],columns:[],loading:true,error:null,duration:0});
    const handle=roomStore.getState().db.connector.query(query,{signal:controller.signal});
    Promise.resolve(handle).then(table=>{if(active)setResult({rows:table.toArray().map(row=>row.toJSON()),columns:table.schema.fields.map(f=>f.name),loading:false,error:null,duration:performance.now()-start});})
      .catch(error=>{if(active)setResult({rows:[],columns:[],loading:false,error:String(error),duration:performance.now()-start});}).finally(()=>clearTimeout(timer));
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  },[query,enabled,version]);
  return result;
}
