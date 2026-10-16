/** Evaluate trusted client source for build checks, including optional TSX components.
 * This is a local developer/build operation, never an imported browser document.
 */
import {build} from 'esbuild';
import {mkdir,lstat,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {nodeValidationStyles} from './node-validation-styles.mjs';
let loads=0;
export async function loadClient(id){
  if(typeof id!=='string'||!/^[a-z][a-z0-9-]{0,59}$/.test(id))throw new Error('Invalid client id');
  const root=path.resolve('clients',id);if((await lstat(root)).isSymbolicLink())throw new Error('Symbolic client directory refused');
  await mkdir('.generated',{recursive:true});
  // One output file per process and call: test files run in parallel processes and may load the same client,
  // so a shared check-<id>.mjs could be rewritten by one process while another imports it.
  const file=path.resolve('.generated','check-'+id+'-'+process.pid+'-'+(++loads)+'.mjs');
  await build({entryPoints:[path.join(root,'app.ts')],outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',
    define:{__STUDIO_CHARTS__:'false',__STUDIO_3D__:'false',__STUDIO_STORIES__:'false',__STUDIO_ARCHITECTURE__:'false',__STUDIO_EXPLORER__:'false',__STUDIO_EXPLANATIONS__:'false',__STUDIO_REPLAY__:'false',__STUDIO_MOTION__:'false',__STUDIO_MODELS__:'false',__STUDIO_RUNS__:'false'},
    plugins:[nodeValidationStyles()],
    alias:{'@vizforge':path.resolve('.upstream/vizforge/src'),...Object.fromEntries(['core','svg','react'].map(name=>['@conceptmotion/'+name,path.resolve('.upstream/conceptmotion/project/conceptmotion_studio/packages',name,'src/index.ts')]))},logLevel:'warning'});
  try{return (await import(pathToFileURL(file).href+'?load='+Date.now())).default;}
  finally{await rm(file,{force:true});}
}
