/** WebGL availability, probed once. `?webgl=0` (or data-webgl="off" on <html>) forces the 2D
 * fallback so it can be tested and demoed on machines that do have a GPU.
 */
let cached:boolean|undefined;
export function webglAvailable():boolean{
  if(cached!==undefined)return cached;
  try{
    const query=new URLSearchParams(globalThis.location?.search||'').get('webgl');
    if(query==='0'||query==='off'||globalThis.document?.documentElement.dataset.webgl==='off')return cached=false;
    const canvas=document.createElement('canvas');
    cached=!!(canvas.getContext('webgl2')||canvas.getContext('webgl'));
  }catch{cached=false;}
  return cached;
}
/** Tests only: forget the probe result. */
export function resetWebglProbe(){cached=undefined;}
