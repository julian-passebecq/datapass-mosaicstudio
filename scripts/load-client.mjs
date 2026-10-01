/** Evaluate trusted client source for build checks, including optional TSX components.
 * This is a local developer/build operation, never an imported browser document.
 */
import {build} from 'esbuild';
import {mkdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function loadClient(id){
  if(typeof id!=='string'||!/^[a-z][a-z0-9-]{0,59}$/.test(id))throw new Error('Invalid client id');
  const root=path.resolve('clients',id);if((await lstat(root)).isSymbolicLink())throw new Error('Symbolic client directory refused');
  await mkdir('.generated',{recursive:true});
  const file=path.resolve('.generated','check-'+id+'.mjs');
  await build({entryPoints:[path.join(root,'app.ts')],outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',
    define:{__STUDIO_CHARTS__:'false',__STUDIO_3D__:'false',__STUDIO_STORIES__:'false',__STUDIO_ARCHITECTURE__:'false'},
    alias:{'@vizforge':path.resolve('.upstream/vizforge/src')},logLevel:'warning'});
  return (await import(pathToFileURL(file).href+'?load='+Date.now())).default;
}
