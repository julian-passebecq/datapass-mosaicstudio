import type {Plugin} from 'vite';
import {existsSync,readdirSync,lstatSync} from 'node:fs';
import path from 'node:path';
const references=['wind-reference','operations-reference','architecture-reference','experience-reference','energy-replay-reference'];
export function validClientId(id:string){return /^[a-z][a-z0-9-]{0,59}$/.test(id);}
export function clientDirectory(id:string){if(!validClientId(id))throw new Error('Invalid client id');const dir=path.resolve('clients',id);if(!existsSync(path.join(dir,'app.ts'))||lstatSync(dir).isSymbolicLink())throw new Error('Client does not exist or is a symlink: '+id);return dir;}
/** Dev sees local clients; the review build allows references only; target builds one client. */
export function clientRegistryPlugin(selected:string|undefined):Plugin{
  let command='build';
  if(selected)clientDirectory(selected);
  return {name:'datapass-client-registry',configResolved(config){command=config.command;},resolveId(id){if(id==='virtual:studio-clients')return '\0studio-clients';},load(id){if(id!=='\0studio-clients')return;
    const names=selected?[selected]:command==='serve'?readdirSync('clients',{withFileTypes:true}).filter(d=>d.isDirectory()&&validClientId(d.name)&&existsSync(path.resolve('clients',d.name,'app.ts'))).map(d=>d.name).sort():references;
    names.forEach(clientDirectory);
    return `export const clientIds=${JSON.stringify(names)};export const selectedClient=${JSON.stringify(selected||null)};export const clients={${names.map(name=>JSON.stringify(name)+':()=>import('+JSON.stringify(path.resolve('clients',name,'app.ts').replace(/\\/g,'/'))+')').join(',')}};`;
  }};
}
