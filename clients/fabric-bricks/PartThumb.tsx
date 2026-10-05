import {useEffect,useState,type CSSProperties} from 'react';
import {thumbKey,type BrickPart} from './kits';

/** Lazily rendered 3D thumbnail of a piece; shows the flat swatch until the (cached) render is ready or if WebGL is unavailable. */
const ready=new Map<string,string>();
let loader:Promise<typeof import('./partThumbs')>|null=null;
export function PartThumb({part}:{part:BrickPart}){
  const key=thumbKey(part),[src,setSrc]=useState(()=>ready.get(key));
  useEffect(()=>{
    const known=ready.get(key);if(known){setSrc(known);return;}
    let live=true;
    (loader??=import('./partThumbs')).then(m=>{const url=m.partThumbnail(part);ready.set(key,url);if(live)setSrc(url);}).catch(()=>{});
    return()=>{live=false;};
  },[key]);
  return src?<img className="fb-part-thumb" src={src} alt="" aria-hidden="true" draggable={false} data-thumb={part.lot}/>
    :<span className="fb-part-swatch" style={{'--brick-color':part.color} as CSSProperties}><i/><i/></span>;
}
