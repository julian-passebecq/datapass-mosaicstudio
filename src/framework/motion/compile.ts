import {timingProgress} from './timing.ts';
import {validateMotion, type MotionSpec, type Point3, type MotionStatus, type MotionEntity, type MotionTiming} from './model.ts';

export type EntityPose = {position: Point3; visible: boolean; status: MotionStatus};
export type MotionFrame = {
  index: number; id: string; focus: string;
  poses: Record<string, EntityPose>;
  activeLinks: string[];
  routes: Record<string, Point3[]>;
  version: 1 | 2; transitionMs: number;
  timings: Record<string, Partial<Record<'position' | 'state' | 'visibility', MotionTiming>>>;
};
export type CompiledMotion = {spec: MotionSpec; initial: MotionFrame; frames: MotionFrame[]};
const distance = (a: Point3, b: Point3) => Math.hypot(...a.map((n, i) => n - b[i]));
const equal = (a: Point3, b: Point3) => distance(a, b) < 1e-6;

export function stationAnchor(entity: MotionEntity, pose: EntityPose): Point3 {
  if (entity.kind !== 'station') throw new Error('Only stations anchor transfers');
  return [pose.position[0], pose.position[1], pose.position[2] + entity.size[2] + .28];
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {Object.freeze(value); Object.values(value).forEach(freeze);}
  return value;
}

/** Compile once. Seeking never replays side effects or relies on a previously visited frame. */
export function compileMotion(input: unknown): CompiledMotion {
  const spec = validateMotion(input), entities = new Map(spec.entities.map(e => [e.id, e]));
  const poses: Record<string, EntityPose> = {};
  for (const e of spec.entities) if (e.kind === 'station') poses[e.id] = {position: [...e.position], visible: true, status: 'idle'};
  for (const e of spec.entities) if (e.kind === 'token') poses[e.id] = {position: stationAnchor(entities.get(e.at)!, poses[e.at]), visible: true, status: 'idle'};
  const initial: MotionFrame = {index: -1, id: 'initial', focus: 'none', poses: structuredClone(poses), activeLinks: [], routes: {}, version: spec.version, transitionMs: 0, timings: {}};
  const frames: MotionFrame[] = [];
  for (const [index, step] of spec.steps.entries()) {
    const routes: Record<string, Point3[]> = {}, timings: MotionFrame['timings'] = {};
    // A transfer endpoint cannot be moved in the same authored step: its route would be ambiguous.
    const moved = new Set(step.commands.filter(c => c.type === 'move').map(c => c.entity));
    for (const command of step.commands) {
      const pose = poses[command.entity];
      if (spec.version === 2) {
        const property = command.type === 'move' || command.type === 'transfer' ? 'position' : command.type;
        (timings[command.entity] ||= {})[property] = command.timing ? {...command.timing} : {startMs: 0, endMs: step.transitionMs, easing: 'cubic-in-out'};
      }
      switch (command.type) {
        case 'move': routes[command.entity] = [[...pose.position], [...command.position]]; pose.position = [...command.position]; break;
        case 'state': pose.status = command.value; break;
        case 'visibility': pose.visible = command.visible; break;
        case 'transfer': {
          const link = spec.links.find(l => l.id === command.link)!;
          if (moved.has(link.from) || moved.has(link.to)) throw new Error('Moving a transfer endpoint in the same step is ambiguous');
          const from = stationAnchor(entities.get(link.from)!, poses[link.from]), to = stationAnchor(entities.get(link.to)!, poses[link.to]);
          if (!equal(pose.position, from)) throw new Error('Token is not at the declared transfer origin: ' + command.entity + ' in ' + step.id);
          const path: Point3[] = [from, ...link.via.map(p => [...p] as Point3), to];
          if (path.every(p => equal(p, from))) throw new Error('Transfer has no physical path');
          routes[command.entity] = path; pose.position = to;
          break;
        }
      }
    }
    frames.push({index, id: step.id, focus: step.focus, poses: structuredClone(poses), activeLinks: [...step.activeLinks], routes, version: spec.version, transitionMs: step.transitionMs, timings});
  }
  return freeze({spec, initial, frames});
}
export function motionFrame(compiled: CompiledMotion, index: number): MotionFrame {
  if (!Number.isSafeInteger(index) || index < 0 || index >= compiled.frames.length) throw new Error('Motion frame is out of range');
  return compiled.frames[index];
}

/** Arc-length interpolation on the declared world polyline. No generated simulation data. */
export function pointAlong(path: readonly Point3[], fraction: number): Point3 {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1 || path.length < 1) throw new Error('Invalid path interpolation');
  if (path.some(p => p.length !== 3 || p.some(n => !Number.isFinite(n)))) throw new Error('Invalid path point');
  const lengths = path.slice(1).map((p, i) => distance(path[i], p)), total = lengths.reduce((a, b) => a + b, 0);
  if (!total || fraction === 0) return [...path[0]];
  if (fraction === 1) return [...path[path.length - 1]];
  let remaining = total * fraction;
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] > 0 && remaining <= lengths[i]) {
      const t = remaining / lengths[i]; return path[i].map((a, k) => a + (path[i + 1][k] - a) * t) as Point3;
    }
    remaining -= lengths[i];
  }
  return [...path[path.length - 1]];
}
export type DisplayPose = EntityPose & {alpha: number};
export type MotionDisplay = Record<string, DisplayPose>;
export function settledDisplay(frame: MotionFrame): MotionDisplay {
  return Object.fromEntries(Object.entries(frame.poses).map(([id, p]) => [id, {...p, position: [...p.position], alpha: p.visible ? 1 : 0}])) as MotionDisplay;
}
export function interpolateFrame(from: MotionFrame, to: MotionFrame, fraction: number): MotionDisplay {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error('Invalid motion progress');
  return Object.fromEntries(Object.entries(to.poses).map(([id, pose]) => {
    const start = from.poses[id]; if (!start) throw new Error('Motion identity changed between steps');
    const route = to.routes[id] || [start.position, pose.position];
    // V1 retains its historical eased progress; V2 receives wall-progress from D3
    // and samples each authored property window without timers or callbacks.
    const progress = (property: 'position' | 'state' | 'visibility') => to.version === 2 && to.timings[id]?.[property]
      ? timingProgress(to.timings[id][property]!, fraction * to.transitionMs) : fraction;
    const positionProgress = progress('position'), visibilityProgress = progress('visibility'), stateProgress = progress('state');
    return [id, {
      position: pointAlong(route, positionProgress),
      visible: visibilityProgress === 1 ? pose.visible : start.visible || pose.visible,
      alpha: Number(start.visible) + (Number(pose.visible) - Number(start.visible)) * visibilityProgress,
      status: stateProgress === 1 ? pose.status : start.status,
    }];
  }));
}
