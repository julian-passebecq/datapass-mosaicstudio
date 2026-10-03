/** Inert bounded values only. This is validation, not a sandbox for trusted source code. */
export function freezeValue<T>(value:T):T {
  if(value && typeof value==='object' && !Object.isFrozen(value)){
    Object.freeze(value);Object.values(value).forEach(freezeValue);
  }
  return value;
}
export function jsonBytes(value:unknown):number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
export function boundedJson(value:unknown,maxBytes:number):void {
  let nodes=0;const seen=new Set<object>();
  const walk=(v:unknown,depth:number):void=>{
    if(++nodes>500000||depth>24)throw new Error('JSON structure budget exceeded');
    if(v===null||typeof v==='boolean'||typeof v==='string')return;
    if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('JSON requires finite numbers');return;}
    if(!v||typeof v!=='object'||(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype))throw new Error('Expected inert JSON values');
    if(seen.has(v))throw new Error('Cyclic or shared JSON object');seen.add(v);
    for(const [key,entry] of Object.entries(v)){
      if(['__proto__','prototype','constructor'].includes(key))throw new Error('Unsafe JSON property');
      walk(entry,depth+1);
    }
    seen.delete(v);
  };
  walk(value,0);
  if(jsonBytes(value)>maxBytes)throw new Error('JSON byte budget exceeded');
}
export function integerRange(value:unknown,min:number,max:number,label:string):asserts value is number{
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new Error('Invalid '+label);
}
