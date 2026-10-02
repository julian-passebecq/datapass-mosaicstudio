import type {MotionProjection, MotionEntity, Point3} from './model.ts';
import {stationAnchor, settledDisplay, type CompiledMotion, type MotionDisplay, type MotionFrame} from './compile.ts';

export type Point2 = [number, number];
export type MotionObject = {
  id: string; label: string; kind: MotionEntity['kind']; status: string; alpha: number; color: string;
  faces: Point2[][]; labelPosition: Point2; labelLines: string[]; center: Point2; depth: number;
};
export type MotionDrawing = {
  objects: MotionObject[];
  links: {id: string; path: Point2[]; label: string; active: boolean}[];
};
export type Bounds = {x: number; y: number; width: number; height: number};

/** Orthographic projection only. Isometric SVG never creates a WebGL context. */
export function project(point: Point3, projection: MotionProjection): Point2 {
  if (projection !== 'diagram' && projection !== 'isometric') throw new Error('Unknown motion projection');
  const [x, y, z] = point;
  return projection === 'diagram' ? [x * 74, y * 58 - z * 28] : [(x - y) * 48, (x + y) * 25 - z * 48];
}
export const pathData = (points: readonly Point2[]): string => points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ');
export const polygonData = (points: readonly Point2[]): string => points.map(p => p.map(v => v.toFixed(3)).join(',')).join(' ');
export const boundsText = (b: Bounds): string => [b.x, b.y, b.width, b.height].map(n => n.toFixed(3)).join(' ');
export function shade(color: string, amount: number): string {
  if (!/^#[a-fA-F0-9]{6}$/.test(color)) throw new Error('Invalid face color');
  return '#' + [1, 3, 5].map(i => {
    const c = parseInt(color.slice(i, i + 2), 16);
    return Math.round(Math.max(0, Math.min(255, amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)))).toString(16).padStart(2, '0');
  }).join('');
}
function lines(label: string): string[] {
  const words = label.split(/\s+/), result: string[] = [''];
  for (const word of words) {
    const i = result.length - 1;
    if (result[i].length + word.length > 22 && result.length < 2) result.push(word);
    else result[i] += (result[i] ? ' ' : '') + word;
  }
  return result.map(s => s.length > 27 ? s.slice(0, 26) + '\u2026' : s);
}
function faces(position: Point3, size: Point3, mode: MotionProjection): Point2[][] {
  const [x, y, z] = position, [w, d, h] = size;
  const p = (a: number, b: number, c: number) => project([x + a, y + b, z + c], mode);
  const a = p(-w / 2, -d / 2, h), b = p(w / 2, -d / 2, h), c = p(w / 2, d / 2, h), e = p(-w / 2, d / 2, h);
  return mode === 'diagram' ? [[a, b, c, e]] : [[e, c, p(w / 2, d / 2, 0), p(-w / 2, d / 2, 0)], [b, p(w / 2, -d / 2, 0), p(w / 2, d / 2, 0), c], [a, b, c, e]];
}
export function drawing(compiled: CompiledMotion, frame: MotionFrame, mode: MotionProjection, display: MotionDisplay = settledDisplay(frame)): MotionDrawing {
  const entities = new Map(compiled.spec.entities.map(e => [e.id, e]));
  const objects = compiled.spec.entities.map(entity => {
    const pose = display[entity.id], size: Point3 = entity.kind === 'station' ? entity.size : [entity.size, entity.size, entity.size];
    const polygons = faces(pose.position, size, mode), center = project(pose.position, mode);
    const bottom = Math.max(...polygons.flat().map(p => p[1]));
    return {
      id: entity.id, label: entity.label, kind: entity.kind, color: entity.color, status: pose.status, alpha: pose.alpha,
      faces: polygons, center, labelPosition: [center[0], entity.kind === 'station' ? bottom + 20 : Math.min(...polygons.flat().map(p => p[1])) - 24] as Point2,
      labelLines: lines(entity.label), depth: pose.position[0] + pose.position[1] + pose.position[2] * .001 + (entity.kind === 'token' ? .1 : 0),
    };
  }).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id, 'en'));
  const links = compiled.spec.links.map(link => ({
    id: link.id, label: link.label, active: frame.activeLinks.includes(link.id),
    path: [stationAnchor(entities.get(link.from)!, display[link.from]), ...link.via, stationAnchor(entities.get(link.to)!, display[link.to])].map(p => project(p, mode)),
  }));
  return {objects, links};
}
function bounds(points: readonly Point2[]): Bounds {
  const minX = Math.min(...points.map(p => p[0])) - 35, maxX = Math.max(...points.map(p => p[0])) + 35;
  const minY = Math.min(...points.map(p => p[1])) - 35, maxY = Math.max(...points.map(p => p[1])) + 35;
  const width = Math.max(460, maxX - minX), height = Math.max(260, maxY - minY);
  return {x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height};
}
export function drawingPoints(scene: MotionDrawing): Point2[] {
  return [
    ...scene.objects.flatMap(o => [...o.faces.flat(), [o.labelPosition[0] - 95, o.labelPosition[1] - 14] as Point2, [o.labelPosition[0] + 95, o.labelPosition[1] + o.labelLines.length * 16] as Point2]),
    ...scene.links.flatMap(l => l.path),
  ];
}
/** Stable extents across all frames avoid camera jumps and clipping a future transfer route. */
export function motionBounds(compiled: CompiledMotion, mode: MotionProjection): Bounds {
  return bounds([compiled.initial, ...compiled.frames].flatMap(frame => [
    ...drawingPoints(drawing(compiled, frame, mode)),
    ...Object.values(frame.routes).flat().map(p => project(p, mode)),
  ]));
}
export const statusColor = (status: string): string => ({active: '#26748d', complete: '#268162', warning: '#a76d18', muted: '#8797a5', idle: '#b5c2cc'}[status] || '#b5c2cc');
