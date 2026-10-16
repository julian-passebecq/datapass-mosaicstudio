/** Tier 1 backends: the browser's localStorage (when usable) or an in-memory map (tests, embeds). */
import type {KeyValuePort,StorageBackend} from './ports.ts';

export type PreferencesSource={port:KeyValuePort|null;backend:StorageBackend;reason:string|null};
const UNAVAILABLE='Browser storage is unavailable; preferences will not survive a reload.';

/** Probe localStorage exactly like the workspace store always did (write and remove one probe key). */
export function browserPreferences(probeKey='datapass.workspace.probe'):PreferencesSource{
  try{
    const s=globalThis.localStorage;
    s.setItem(probeKey,'1');s.removeItem(probeKey);
    return {port:s,backend:'localStorage',reason:null};
  }catch{return {port:null,backend:'none',reason:UNAVAILABLE};}
}

export type MemoryKeyValue=KeyValuePort&{readonly size:number;keys():string[]};
export function memoryKeyValue(initial:Record<string,string>={}):MemoryKeyValue{
  const map=new Map(Object.entries(initial));
  return {
    getItem:key=>map.has(key)?map.get(key)!:null,
    setItem:(key,value)=>{map.set(String(key),String(value));},
    removeItem:key=>{map.delete(key);},
    get size(){return map.size;},
    keys:()=>[...map.keys()],
  };
}
export function memoryPreferences(initial?:Record<string,string>):PreferencesSource{return {port:memoryKeyValue(initial),backend:'memory',reason:null};}

/** A trusted key-value object supplied by source code (never imported JSON). */
export function isKeyValuePort(v:unknown):v is KeyValuePort{
  return !!v&&typeof v==='object'&&['getItem','setItem','removeItem'].every(k=>typeof (v as Record<string,unknown>)[k]==='function');
}
