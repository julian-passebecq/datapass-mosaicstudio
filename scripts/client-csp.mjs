import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
/**
 * Per-client Content-Security-Policy opt-ins, declared in clients/<id>/client.config.json as
 *   "csp": {"wasm": true, "connect": ["http://127.0.0.1:8000", "https://api.example.org"]}
 * Without "csp" the policy is byte-for-byte the historical default. Opt-ins only widen script-src
 * ('wasm-unsafe-eval', never 'unsafe-eval') and connect-src (exact loopback http or https origins).
 */
export const MAX_CONNECT_ORIGINS=8;
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]']);
export function validateClientCsp(value){
  if(value===undefined)return {wasm:false,connect:[]};
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['wasm','connect'].includes(k)))throw new Error('Invalid client csp: only "wasm" and "connect" are allowed');
  const wasm=value.wasm===undefined?false:value.wasm;if(typeof wasm!=='boolean')throw new Error('Invalid client csp.wasm: expected a boolean');
  const connect=value.connect===undefined?[]:value.connect;
  if(!Array.isArray(connect)||connect.length>MAX_CONNECT_ORIGINS)throw new Error(`Invalid client csp.connect: expected at most ${MAX_CONNECT_ORIGINS} origins`);
  for(const origin of connect){
    let url;try{url=typeof origin==='string'?new URL(origin):null;}catch{url=null;}
    if(!url||url.origin!==origin||url.hostname.includes('*'))throw new Error('Invalid client csp.connect origin (exact scheme://host[:port], no path or wildcard): '+origin);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&LOOPBACK.has(url.hostname)))throw new Error('Client csp.connect allows https origins or http loopback only: '+origin);
  }
  if(new Set(connect).size!==connect.length)throw new Error('Duplicate client csp.connect origin');
  return {wasm,connect:[...connect]};
}
export function clientCsp(options={wasm:false,connect:[]}){
  const script=["'self'",...(options.wasm?["'wasm-unsafe-eval'"]:[])].join(' '),connect=["'self'",...options.connect].join(' ');
  return `default-src 'self'; script-src ${script}; connect-src ${connect}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'`;
}
/** Synchronous read for the Vite config; a missing profile means the default policy. */
export function clientCspFor(clientDir){
  const file=path.join(clientDir,'client.config.json');
  if(!existsSync(file))return clientCsp();
  return clientCsp(validateClientCsp(JSON.parse(readFileSync(file,'utf8')).csp));
}
/**
 * Client status (F213): every clients/<id>/client.config.json declares "status". It labels the client in
 * the ?sites catalog only; it never changes capability plans, CSP or which clients a build includes.
 */
export const CLIENT_STATUSES=Object.freeze(['reference','prototype','draft','frozen']);
export const CLIENT_STATUS_MISSING='DP-CLI-001';
export const CLIENT_STATUS_INVALID='DP-CLI-002';
const statusFix=id=>`Fix: add "status": "prototype" (one of ${CLIENT_STATUSES.join(', ')}) to clients/${id}/client.config.json; a client without that file needs {"format":"datapass.client-profile","version":1,"family":"content","status":"prototype"} (choose its family).`;
export function validateClientStatus(value,id='<id>'){
  if(value===undefined)throw new Error(`${CLIENT_STATUS_MISSING} Client ${id} declares no status. ${statusFix(id)}`);
  if(typeof value!=='string'||!CLIENT_STATUSES.includes(value))throw new Error(`${CLIENT_STATUS_INVALID} Client ${id} has an unknown status ${JSON.stringify(value)}. ${statusFix(id)}`);
  return value;
}
/** Synchronous read for the client registry; a missing profile is refused like a missing status. */
export function clientStatusFor(clientDir){
  const id=path.basename(clientDir),file=path.join(clientDir,'client.config.json');
  if(!existsSync(file))return validateClientStatus(undefined,id);
  return validateClientStatus(JSON.parse(readFileSync(file,'utf8')).status,id);
}
