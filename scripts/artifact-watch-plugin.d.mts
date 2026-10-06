import type {Plugin} from 'vite';
export declare const ARTIFACT_CHANGED_EVENT:'datapass:artifact-changed';
export declare function artifactIdForFile(file:string,dir:string):string|null;
export declare function sha256(bytes:Uint8Array|string):string;
export declare function createArtifactNotifier(options:{send:(change:{id:string;sha256:string})=>void;read?:(file:string)=>Promise<Uint8Array>;debounceMs?:number;timers?:Pick<typeof globalThis,'setTimeout'|'clearTimeout'>}):{seed(id:string,hash:string):void;notify(id:string,file:string):void;close():void};
export declare function artifactWatchPlugin(dir:string,options?:{debounceMs?:number}):Plugin;
