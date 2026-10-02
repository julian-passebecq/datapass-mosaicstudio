import {createContext, useContext, useEffect, useMemo, type ReactNode} from 'react';
import {useRuntime, useReducedMotion, useSiteState} from '../hooks';
import {createMotionController, type MotionController} from './controller';
import type {MotionBlock} from './model';

type ControlledMotion = MotionController & {binding: MotionBlock; synchronizing: boolean; setVisible(id: string, visible: boolean): void};
const Context = createContext<Map<string, ControlledMotion> | null>(null);
export const useMotionController = (resource: string): ControlledMotion => {
  const controller = useContext(Context)?.get(resource); if (!controller) throw new Error('Motion block requires a shared page controller'); return controller;
};
export function MotionScope({blocks, children}: {blocks: MotionBlock[]; children: ReactNode}) {
  const runtime = useRuntime(), snapshot = useSiteState(), reduced = useReducedMotion();
  const key = blocks.map(b => b.resource).sort().join('|');
  const controllers = useMemo(() => new Map([...new Map(blocks.map(b => [b.resource, b])).values()].map(binding => {
    const controller = createMotionController(runtime.definition.resources!.motions![binding.resource], reduced);
    controller.player.seek(Number(runtime.getSnapshot().values[binding.step]));
    const visible = new Set<string>();
    return [binding.resource, {...controller, binding, synchronizing: false, setVisible(id: string, active: boolean) {if (active) visible.add(id); else visible.delete(id); if (!visible.size) controller.player.pause();}} as ControlledMotion] as const;
  })), [runtime, key]);
  useEffect(() => {
    const cleanup = [...controllers.values()].map(controller => {
      let last = controller.player.getState().index;
      const off = controller.player.subscribe(() => {
        const index = controller.player.getState().index; if (index === last) return; last = index;
        if (!controller.synchronizing) runtime.patch({[controller.binding.step]: index, [controller.binding.selection]: controller.compiled.frames[index].focus});
      });
      return () => {off(); controller.player.pause();};
    });
    const hidden = () => {if (document.hidden) controllers.forEach(c => c.player.pause());};
    document.addEventListener('visibilitychange', hidden);
    return () => {cleanup.forEach(fn => fn()); document.removeEventListener('visibilitychange', hidden);};
  }, [controllers, runtime]);
  useEffect(() => {controllers.forEach(controller => {
    const index = Number(snapshot.values[controller.binding.step]);
    if (controller.player.getState().index !== index) {
      controller.synchronizing = true;
      try {controller.player.seek(index);} finally {controller.synchronizing = false;}
    }
  });}, [controllers, snapshot.values]);
  useEffect(() => {controllers.forEach(c => {c.player.setReducedMotion(reduced); if (reduced) c.player.pause();});}, [controllers, reduced]);
  useEffect(() => {controllers.forEach(c => c.player.pause());}, [controllers, snapshot.restoreEpoch]);
  return <Context.Provider value={controllers}>{children}</Context.Provider>;
}
