/** Cross-tab workspace conflict detection (F205). Two tabs never silently overwrite each other's workspace.
 * The `datapass.workspace` v1 document is unchanged: a revision lives in a sidecar key `datapass.workspace.revision`
 * = `{rev,tab,sha256}` (older studios ignore it). Before every save the guard compares the stored document with the
 * one this tab last loaded or wrote; any difference opens a conflict, and nothing is written while it is open.
 * The user resolves it explicitly: keep mine (overwrite), take theirs (validated through `validateWorkspace`) or export
 * both. Pure logic over a key-value port: no React, no timers, no network. */
import {strict} from '../framework/guards.ts';
import {saveWorkspace,validateWorkspace,WORKSPACE_KEY,WORKSPACE_REVISION_KEY,type StoragePort,type WorkspaceDoc} from './persist.ts';

export type WorkspaceRevision={rev:number;tab:string;sha256:string|null};
/** An open conflict. `theirsRaw` is the stored document another writer left (null: they reset the workspace). */
export type WorkspaceConflict={
  code:'DP-STO-001';
  theirsRaw:string|null;
  /** The other writer's sidecar, or null when it wrote without one (an older studio, a script) or the sidecar is unreadable. */
  theirs:WorkspaceRevision|null;
  /** False when the sidecar does not describe the stored document (DP-STO-002): the writer is unknown. */
  sidecarMatches:boolean;
  detectedAt:string;
};
export type SaveOutcome={status:'saved'}|{status:'unchanged'}|{status:'conflict';conflict:WorkspaceConflict}|{status:'error';message:string};
export type TakeTheirsResult={doc:WorkspaceDoc|null};

const TAB=/^tab-[0-9a-f]{16}$/,HEX=/^[0-9a-f]{64}$/;

/** Strict sidecar reader; anything else (absent, not JSON, extra fields, bad values) reads as "no sidecar". */
export function parseRevision(raw:string|null):WorkspaceRevision|null{
  if(raw===null||raw.length>300)return null;
  try{
    const v:unknown=JSON.parse(raw);
    strict(v,['rev','tab','sha256'],'workspace revision');
    if(!Number.isSafeInteger(v.rev)||(v.rev as number)<0)return null;
    if(typeof v.tab!=='string'||!TAB.test(v.tab))return null;
    if(v.sha256!==null&&(typeof v.sha256!=='string'||!HEX.test(v.sha256)))return null;
    return {rev:v.rev as number,tab:v.tab,sha256:v.sha256 as string|null};
  }catch{return null;}
}

export function newTabId(random:(bytes:Uint8Array)=>Uint8Array=b=>globalThis.crypto.getRandomValues(b)):string{
  return 'tab-'+[...random(new Uint8Array(8))].map(b=>b.toString(16).padStart(2,'0')).join('');
}

const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
/** Synchronous SHA-256 of the UTF-8 text, so the check-then-write before a save has no await between them. */
export function sha256HexSync(textValue:string):string{
  const data=new TextEncoder().encode(textValue),bitLength=data.length*8;
  const padded=new Uint8Array(((data.length+9+63)>>6)<<6);padded.set(data);padded[data.length]=0x80;
  const view=new DataView(padded.buffer);view.setUint32(padded.length-8,Math.floor(bitLength/0x100000000));view.setUint32(padded.length-4,bitLength>>>0);
  const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),w=new Uint32Array(64);
  const rotr=(x:number,n:number)=>(x>>>n)|(x<<(32-n));
  for(let off=0;off<padded.length;off+=64){
    for(let i=0;i<16;i++)w[i]=view.getUint32(off+i*4);
    for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10)))>>>0;}
    let [a,b,c,d,e,f,g,hh]=h;
    for(let i=0;i<64;i++){
      const t1=(hh+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=hh;
  }
  return [...h].map(x=>x.toString(16).padStart(8,'0')).join('');
}

/** One guard per tab. It remembers the stored document this tab last loaded or wrote (the baseline). */
export class WorkspaceRevisionGuard{
  readonly tab:string;
  private baselineRaw:string|null;
  private baselineRev:number;
  private open:WorkspaceConflict|null=null;
  private readonly storage:StoragePort|null;
  private readonly knownModules:readonly string[];
  private readonly now:()=>string;
  constructor(storage:StoragePort|null,knownModules:readonly string[],options:{tab?:string;now?:()=>string}={}){
    this.storage=storage;this.knownModules=knownModules;this.tab=options.tab??newTabId();this.now=options.now??(()=>new Date().toISOString());
    if(!TAB.test(this.tab))throw new Error('workspace revision: invalid tab id');
    // Read after loadWorkspace, which may already have moved a rejected document aside.
    this.baselineRaw=this.read(WORKSPACE_KEY);
    this.baselineRev=parseRevision(this.read(WORKSPACE_REVISION_KEY))?.rev??0;
  }
  get conflict():WorkspaceConflict|null{return this.open;}
  get revision():number{return this.baselineRev;}

  private read(key:string):string|null{try{return this.storage?.getItem(key)??null;}catch{return null;}}
  private writeSidecar(rev:number,raw:string|null):void{
    this.storage?.setItem(WORKSPACE_REVISION_KEY,JSON.stringify({rev,tab:this.tab,sha256:raw===null?null:sha256HexSync(raw)} satisfies WorkspaceRevision));
  }

  /** Compare the stored document with the baseline. A difference opens (or refreshes) the conflict; equal bytes are not one. */
  detect():WorkspaceConflict|null{
    if(!this.storage)return null;
    const raw=this.read(WORKSPACE_KEY);
    if(raw===this.baselineRaw){
      // Another tab wrote identical bytes: nothing is lost; adopt its revision so ours keeps increasing.
      if(!this.open)this.baselineRev=Math.max(this.baselineRev,parseRevision(this.read(WORKSPACE_REVISION_KEY))?.rev??0);
      return this.open;
    }
    const sidecar=parseRevision(this.read(WORKSPACE_REVISION_KEY));
    const matches=!!sidecar&&sidecar.sha256===(raw===null?null:sha256HexSync(raw));
    this.open={code:'DP-STO-001',theirsRaw:raw,theirs:matches?sidecar:null,sidecarMatches:matches,detectedAt:this.open?.detectedAt??this.now()};
    return this.open;
  }

  /** Save through the existing `saveWorkspace` (same bytes as before F205), then bump the sidecar. Refuses while a conflict is open. */
  save(doc:WorkspaceDoc):SaveOutcome{
    if(!this.storage)return {status:'error',message:'Browser storage is unavailable; changes are not saved.'};
    const conflict=this.detect();
    if(conflict)return {status:'conflict',conflict};
    // Same authored content as the stored document (only savedAt differs): no write, so merely opening or
    // re-rendering a tab never makes another tab see a conflict.
    if(this.baselineRaw!==null&&this.sameContent(doc,this.baselineRaw))return {status:'unchanged'};
    return this.write(doc);
  }
  private sameContent(doc:WorkspaceDoc,raw:string):boolean{
    try{
      const key=(d:WorkspaceDoc)=>JSON.stringify({...validateWorkspace(d,this.knownModules),savedAt:''});
      return key(doc)===key(JSON.parse(raw));
    }catch{return false;}
  }
  private write(doc:WorkspaceDoc):SaveOutcome{
    const problem=saveWorkspace(this.storage,doc,this.knownModules);
    if(problem)return {status:'error',message:problem};
    const raw=this.read(WORKSPACE_KEY);
    try{this.writeSidecar(this.baselineRev+1,raw);this.baselineRev+=1;}catch{/* the document is saved; the sidecar is advisory */}
    this.baselineRaw=raw;
    return {status:'saved'};
  }

  /** Keep mine: an explicit overwrite of the other writer's document, never a silent one. */
  keepMine(doc:WorkspaceDoc):SaveOutcome{
    const current=this.open??this.detect();
    if(!current)return this.save(doc);
    const rev=Math.max(this.baselineRev,current.theirs?.rev??parseRevision(this.read(WORKSPACE_REVISION_KEY))?.rev??0);
    const before={raw:this.baselineRaw,rev:this.baselineRev};
    this.baselineRev=rev;
    const outcome=this.write(doc);
    if(outcome.status==='saved')this.open=null;else{this.baselineRaw=before.raw;this.baselineRev=before.rev;}
    return outcome;
  }

  /** Take theirs: the other document is validated as a whole first; an invalid one leaves this tab and the conflict unchanged (DP-STO-003). */
  takeTheirs():TakeTheirsResult{
    const current=this.open??this.detect();
    if(!current)throw new Error('There is no workspace conflict to resolve.');
    // The latest stored bytes, in case the other tab saved again since the banner opened.
    this.detect();
    const raw=this.open!.theirsRaw;
    let doc:WorkspaceDoc|null=null;
    if(raw!==null){
      let json:unknown;try{json=JSON.parse(raw);}catch{throw new Error('The other tab\'s workspace is not valid JSON; nothing changed.');}
      try{doc=validateWorkspace(json,this.knownModules);}catch(error){throw new Error('The other tab\'s workspace was not loaded: '+(error as Error).message+' Nothing changed.');}
    }
    this.baselineRaw=raw;
    this.baselineRev=Math.max(this.baselineRev,this.open!.theirs?.rev??0);
    this.open=null;
    return {doc};
  }

  /** Reset the saved workspace (explicit user action). Refused while a conflict is open. */
  reset():SaveOutcome{
    if(!this.storage)return {status:'saved'};
    const conflict=this.detect();
    if(conflict)return {status:'conflict',conflict};
    try{this.storage.removeItem(WORKSPACE_KEY);}catch{/* nothing to reset */}
    try{this.writeSidecar(this.baselineRev+1,null);this.baselineRev+=1;}catch{/* advisory */}
    this.baselineRaw=null;
    return {status:'saved'};
  }
}
