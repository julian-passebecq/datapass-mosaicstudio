import type {MotionProjection, MotionEntity, MotionAnnotation, Point3} from './model.ts';
import {stationAnchor, settledDisplay, type CompiledMotion, type MotionDisplay, type MotionFrame} from './compile.ts';

export type Point2 = [number, number];
export type MotionObject = {
  id: string; label: string; kind: MotionEntity['kind']; status: string; alpha: number; color: string;
  faces: Point2[][]; labelPosition: Point2; labelLines: string[]; center: Point2; depth: number; leader: Point2[];
};
export type AnnotationDrawing = {id: string; entity: string; text: string; lines: string[]; box: Bounds; anchor: Point2; alpha: number};
export type MotionDrawing = {
  objects: MotionObject[];
  links: {id: string; path: Point2[]; label: string; active: boolean}[];
  annotations: AnnotationDrawing[];
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
function baseDrawing(compiled: CompiledMotion, frame: MotionFrame, mode: MotionProjection, display: MotionDisplay): Omit<MotionDrawing, 'annotations'> {
  const entities = new Map(compiled.spec.entities.map(e => [e.id, e]));
  const objects: MotionObject[] = compiled.spec.entities.map(entity => {
    const pose = display[entity.id], size: Point3 = entity.kind === 'station' ? entity.size : [entity.size, entity.size, entity.size];
    const polygons = faces(pose.position, size, mode), center = project(pose.position, mode);
    const bottom = Math.max(...polygons.flat().map(p => p[1]));
    return {
      id: entity.id, label: entity.label, kind: entity.kind, color: entity.color, status: pose.status, alpha: pose.alpha,
      faces: polygons, center, labelPosition: [center[0], entity.kind === 'station' ? bottom + 20 : Math.min(...polygons.flat().map(p => p[1])) - 24] as Point2,
      labelLines: lines(entity.label), leader: [], depth: pose.position[0] + pose.position[1] + pose.position[2] * .001 + (entity.kind === 'token' ? .1 : 0),
    };
  }).sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id, 'en'));
  const links = compiled.spec.links.map(link => ({
    id: link.id, label: link.label, active: frame.activeLinks.includes(link.id),
    path: [stationAnchor(entities.get(link.from)!, display[link.from]), ...link.via, stationAnchor(entities.get(link.to)!, display[link.to])].map(p => project(p, mode)),
  }));
  positionLabels(objects);
  return {objects, links};
}
type AnnotationLayout = Omit<AnnotationDrawing, 'anchor' | 'alpha'>;
const annotationCache = new WeakMap<CompiledMotion, Map<string, AnnotationLayout[]>>();
function annotationLines(text: string): string[] {
  // Split long words too; all authored text remains available, without ellipses.
  const words = text.trim().split(/\s+/).flatMap(word => word.match(/.{1,28}/g) || []), result = [''];
  for (const word of words) {
    const last = result.length - 1;
    if (result[last] && result[last].length + word.length + 1 > 28) result.push(word);
    else result[last] += (result[last] ? ' ' : '') + word;
  }
  return result;
}
function annotationLayout(annotations: MotionAnnotation[], objects: MotionObject[]): AnnotationLayout[] {
  const occupied = objects.filter(o => o.alpha > 0).flatMap(o => {
    const points = o.faces.flat(), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return [labelBounds(o), {x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys)}];
  });
  return annotations.map(a => {
    const object = objects.find(o => o.id === a.entity)!;
    const lines = annotationLines(a.text), width = Math.max(120, ...lines.map(line => line.length * 7 + 22)), height = 20 + lines.length * 15;
    const box = {x: object.center[0] + a.offset[0] - width / 2, y: object.center[1] + a.offset[1] - height / 2, width, height};
    let tries = 0;
    while (occupied.some(b => overlaps(box, b, 10)) && tries++ < 16) box.y -= 26;
    if (occupied.some(b => overlaps(box, b, 10))) box.y = Math.min(box.y, ...occupied.map(b => b.y)) - height - 14;
    occupied.push(box);
    return {id: a.id, entity: a.entity, text: a.text, lines, box};
  });
}
/** Callout boxes are laid out once against the target; only their semantic leaders move. */
export function drawing(compiled: CompiledMotion, frame: MotionFrame, mode: MotionProjection, display: MotionDisplay = settledDisplay(frame)): MotionDrawing {
  const scene = baseDrawing(compiled, frame, mode, display), annotations = compiled.spec.steps[frame.index]?.annotations || [];
  if (!annotations.length) return {...scene, annotations: []};
  let cache = annotationCache.get(compiled);
  if (!cache) {cache = new Map(); annotationCache.set(compiled, cache);}
  const key = frame.index + ':' + mode;
  let layout = cache.get(key);
  if (!layout) {layout = annotationLayout(annotations, baseDrawing(compiled, frame, mode, settledDisplay(frame)).objects); cache.set(key, layout);}
  return {...scene, annotations: layout.map(a => ({...a, box: {...a.box}, lines: [...a.lines], anchor: project(display[a.entity].position, mode), alpha: display[a.entity].alpha}))};
}
/** Conservative text boxes shared by live and exported geometry. No DOM measurement. */
export function labelBounds(object: MotionObject): Bounds {
  const font = object.kind === 'station' ? 12 : 10;
  const width = Math.max(28, ...object.labelLines.map(line => line.length * font * .65));
  return {x: object.labelPosition[0] - width / 2, y: object.labelPosition[1] - 12, width, height: object.labelLines.length * 15 + 3};
}
function overlaps(a: Bounds, b: Bounds, padding = 6): boolean {
  return a.x < b.x + b.width + padding && a.x + a.width + padding > b.x && a.y < b.y + b.height + padding && a.y + a.height + padding > b.y;
}
/** Prefer nearby free labels, with a small leader when displaced. This is not graph layout. */
function positionLabels(objects: MotionObject[]): void {
  const occupied: Bounds[] = objects.filter(o => o.alpha > 0).map(o => {
    const points = o.faces.flat(), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return {x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys)};
  });
  // Fixed component labels are placed before moving token labels.
  const ordered = [...objects].sort((a, b) => Number(a.kind === 'token') - Number(b.kind === 'token') || a.id.localeCompare(b.id, 'en'));
  for (const object of ordered) {
    if (object.alpha === 0) continue;
    const original = [...object.labelPosition] as Point2;
    const candidates: Point2[] = [[0, 0]];
    for (let ring = 1; ring <= 8; ring++) for (const [x, y] of [[0, -22], [0, 22], [32, 0], [-32, 0], [24, -18], [-24, -18], [24, 18], [-24, 18]]) candidates.push([x * ring, y * ring]);
    let placed = false;
    for (const [dx, dy] of candidates) {
      object.labelPosition = [original[0] + dx, original[1] + dy];
      if (!occupied.some(box => overlaps(labelBounds(object), box))) {placed = true; break;}
    }
    if (!placed) object.labelPosition = [original[0], Math.min(...occupied.map(box => box.y)) - object.labelLines.length * 15 - 16];
    if (object.labelPosition[0] !== original[0] || object.labelPosition[1] !== original[1]) {
      object.leader = [[object.center[0], Math.min(...object.faces.flat().map(p => p[1])) - 4], [object.labelPosition[0], object.labelPosition[1] + 3]];
    }
    occupied.push(labelBounds(object));
  }
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
    ...scene.annotations.flatMap(a => [[a.box.x, a.box.y] as Point2, [a.box.x + a.box.width, a.box.y + a.box.height] as Point2, a.anchor]),
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
