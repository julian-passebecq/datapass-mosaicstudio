/** Isometric 2D view (lazy chunk): the framework Motion v2 SVG of the layered world, static and exportable.
 * Clicking a station focuses it (same selection field as every other view). */
import {useMemo} from 'react';
import {isometricSvg} from './iso.ts';
import type {StatusFilter} from './registry.ts';

export default function IsoView({filter,focus,onSelect,svgText}:{filter:StatusFilter;focus:string|null;onSelect(id:string|null):void;svgText?(text:string):void}){
  const svg=useMemo(()=>isometricSvg(filter,focus??'none'),[filter,focus]);
  svgText?.(svg);
  const click=(e:React.MouseEvent)=>{const id=(e.target as Element).closest('[data-entity]')?.getAttribute('data-entity');onSelect(id?(id===focus?null:id):null);};
  return <div className="gn-iso" data-testid="gn-iso" onClick={click} dangerouslySetInnerHTML={{__html:svg}}/>;
}
