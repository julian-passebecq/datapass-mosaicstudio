import {useEffect, useRef} from 'react';
import type {CompiledMotion} from './compile';
import {createMotionRenderer, type MotionRenderer, type MotionView} from './renderer';

export default function MotionViewport({compiled, view, onSelect}: {compiled: CompiledMotion; view: MotionView; onSelect(id: string): void}) {
  const host = useRef<SVGSVGElement>(null), renderer = useRef<MotionRenderer | null>(null), latest = useRef({view, onSelect});
  latest.current = {view, onSelect};
  useEffect(() => {
    const api = createMotionRenderer(host.current!, compiled, id => latest.current.onSelect(id)); renderer.current = api;
    api.update({...latest.current.view, advance: false});
    const hidden = () => {if (document.hidden) api.settle();}; document.addEventListener('visibilitychange', hidden);
    const observer = new IntersectionObserver(entries => {if (entries.every(e => !e.isIntersecting)) api.settle();}); observer.observe(host.current!);
    return () => {observer.disconnect(); document.removeEventListener('visibilitychange', hidden); renderer.current = null; api.dispose();};
  }, [compiled]);
  useEffect(() => {renderer.current?.update(view);}, [view.index, view.selection, view.projection, view.advance, view.reduced]);
  return <div className="motion-viewport"><svg ref={host} data-testid="motion-svg"/></div>;
}
