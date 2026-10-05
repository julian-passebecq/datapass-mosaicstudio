import {symlink,rm,rename} from 'node:fs/promises';
import path from 'node:path';
/**
 * Windows without Developer Mode refuses symbolic links (EPERM). Directory links fall back to a junction,
 * which lstat also reports as symbolic, so the guards under test see the same thing on every platform.
 * Returns false when a file link is impossible; callers then link a parent directory instead.
 */
export async function portableSymlink(target,link,type='file'){
  try{await symlink(target,link,type);return true;}
  catch(error){
    if(error.code!=='EPERM'&&error.code!=='EACCES')throw error;
    if(type==='dir'){await symlink(target,link,'junction');return true;}
    return false;
  }
}
/** Makes `file` resolve through a symbolic path: the file itself when allowed, else its parent folder as a junction. */
export async function symbolicFilePath(target,file){
  await rm(file,{force:true});
  if(await portableSymlink(target,file,'file'))return;
  const parent=path.dirname(file),real=parent+'-real';
  await rename(parent,real);await symlink(real,parent,'junction');
}
