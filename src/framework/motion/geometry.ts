import type {MotionProjection, MotionEntity, MotionAnnotation, MotionAttach, MotionSpec, Point3} from './model.ts';
import {stationAnchor, settledDisplay, type CompiledMotion, type DisplayPose, type MotionDisplay, type MotionFrame} from './compile.ts';
import {glyphShapes, glyphPoints, shadeColor, type GlyphShape} from './glyphs.ts';

export type Point2 = [number, number];
export type MotionObject = {
  id: string; label: string; kind: MotionEntity['kind']; status: string; alpha: number; color: string;
  faces: Point2[][]; labelPosition: Point2; labelLines: string[]; center: Point2; depth: number; leader: Point2[];
  /** V2 glyph stations: projected shapes drawn instead of the faces (faces stay the hit/bounds box). */
  glyph?: GlyphShape[]; glyphName?: string; glyphFallback?: boolean;
  /** Index of the layer plane the object stands on (scenes with layers only). */
  layer?: number;
};
export type AnnotationDrawing = {id: string; entity: string; text: string; lines: string[]; box: Bounds; anchor: Point2; alpha: number};
export type PlaneDrawing = {id: string; label: string; color: string; texture: 'plain' | 'water'; polygon: Point2[]; labelPosition: Point2};
export type GroupDrawing = {id: string; label: string; layer: string; color: string; polygon: Point2[]; labelPosition: Point2};
export type MotionDrawing = {
  objects: MotionObject[];
  /** `layer` (scenes with layers): the lower endpoint's plane; the link is painted with that stratum. */
  links: {id: string; path: Point2[]; label: string; active: boolean; style?: 'solid' | 'dashed'; layer?: number}[];
  annotations: AnnotationDrawing[];
  /** V2 with `layers` only. Static: the same for every frame. */
  planes?: PlaneDrawing[]; groups?: GroupDrawing[];
};
export type Bounds = {x: number; y: number; width: number; height: number};

/** Orthographic projection only. Isometric SVG never creates a WebGL context. */
export function project(point: Point3, projection: MotionProjection): Point2 {
  if (projection !== 'diagram' && projection !== 'isometric') throw new Error('Unknown motion projection');
  const [x, y, z] = point;
  return projection === 'diagram' ? [x * 74, y * 58 - z * 28] : [(x - y) * 48, (x + y) * 25 - z * 48];
}
export const pathData = (points: readonly Point2[]): string => points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ');
/** Polyline with rounded corners (radius in px, clamped to half of each segment). Deterministic formatting. */
export function roundedPathData(points: readonly Point2[], radius: number): string {
  if (radius <= 0 || points.length < 3) return pathData(points);
  const f = (p: Point2) => p[0].toFixed(3) + ',' + p[1].toFixed(3);
  let d = 'M' + f(points[0]);
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]), k = Math.min(radius, l1 / 2, l2 / 2);
    if (!l1 || !l2) {d += ' L' + f(b); continue;}
    d += ' L' + f([b[0] + (a[0] - b[0]) / l1 * k, b[1] + (a[1] - b[1]) / l1 * k]) + ' Q' + f(b) + ' ' + f([b[0] + (c[0] - b[0]) / l2 * k, b[1] + (c[1] - b[1]) / l2 * k]);
  }
  return d + ' L' + f(points[points.length - 1]);
}
export const polygonData = (points: readonly Point2[]): string => points.map(p => p.map(v => v.toFixed(3)).join(',')).join(' ');
export const boundsText = (b: Bounds): string => [b.x, b.y, b.width, b.height].map(n => n.toFixed(3)).join(' ');
export const shade = shadeColor;
function lines(label: string): string[] {
  const words = label.split(/\s+/), result: string[] = [''];
  for (const word of words) {
    const i = result.length - 1;
    if (result[i].length + word.length > 22 && result.length < 2) result.push(word);
    else result[i] += (result[i] ? ' ' : '') + word;
  }
  return result.map(s => s.length > 27 ? s.slice(0, 26) + '…' : s);
}
function faces(position: Point3, size: Point3, mode: MotionProjection): Point2[][] {
  const [x, y, z] = position, [w, d, h] = size;
  const p = (a: number, b: number, c: number) => project([x + a, y + b, z + c], mode);
  const a = p(-w / 2, -d / 2, h), b = p(w / 2, -d / 2, h), c = p(w / 2, d / 2, h), e = p(-w / 2, d / 2, h);
  return mode === 'diagram' ? [[a, b, c, e]] : [[e, c, p(w / 2, d / 2, 0), p(-w / 2, d / 2, 0)], [b, p(w / 2, -d / 2, 0), p(w / 2, d / 2, 0), c], [a, b, c, e]];
}
/** Screen points that bound an object: its glyph when it has one, its box faces otherwise. */
export const objectPoints = (o: MotionObject): Point2[] => o.glyph ? glyphPoints(o.glyph) : o.faces.flat();
/** Index of the layer a height stands on (the highest plane at or below it). */
function layerIndex(spec: MotionSpec, z: number): number {
  let index = 0;
  spec.layers!.forEach((layer, i) => {if (layer.z <= z + 1e-6) index = i;});
  return index;
}
function linkAnchor(entity: MotionEntity, pose: DisplayPose, attach: MotionAttach, toward: Point3): Point3 {
  if (attach === 'top' || entity.kind !== 'station') return stationAnchor(entity, pose);
  const [x, y, z] = pose.position, [w, d, h] = entity.size;
  if (attach === 'base') return [x, y, z];
  const cx = Math.max(x - w / 2, Math.min(x + w / 2, toward[0])), cy = Math.max(y - d / 2, Math.min(y + d / 2, toward[1]));
  if (attach === 'surface') return [cx, cy, z + h];
  // `side`: push a point inside the footprint out to its nearest edge, at base height.
  const gaps = [cx - (x - w / 2), x + w / 2 - cx, cy - (y - d / 2), y + d / 2 - cy], edge = gaps.indexOf(Math.min(...gaps));
  return edge === 0 ? [x - w / 2, cy, z] : edge === 1 ? [x + w / 2, cy, z] : edge === 2 ? [cx, y - d / 2, z] : [cx, y + d / 2, z];
}
function baseDrawing(compiled: CompiledMotion, frame: MotionFrame, mode: MotionProjection, display: MotionDisplay): Omit<MotionDrawing, 'annotations'> {
  const spec = compiled.spec, entities = new Map(spec.entities.map(e => [e.id, e])), layered = !!spec.layers;
  const objects: MotionObject[] = spec.entities.map(entity => {
    const pose = display[entity.id], size: Point3 = entity.kind === 'station' ? entity.size : [entity.size, entity.size, entity.size];
    const polygons = faces(pose.position, size, mode), center = project(pose.position, mode);
    const glyph = entity.kind === 'station' && entity.glyph ? glyphShapes(entity.glyph, entity.color, pose.position, size, mode, project) : null;
    const bottom = Math.max(...(glyph ? glyphPoints(glyph.shapes) : polygons.flat()).map(p => p[1]));
    const depth = pose.position[0] + pose.position[1] + pose.position[2] * .001 + (entity.kind === 'token' ? .1 : 0);
    return {
      id: entity.id, label: pose.label ?? entity.label, kind: entity.kind, color: entity.color, status: pose.status, alpha: pose.alpha,
      faces: polygons, center, labelPosition: [center[0], entity.kind === 'station' ? bottom + 20 : Math.min(...polygons.flat().map(p => p[1])) - 24] as Point2,
      labelLines: lines(pose.label ?? entity.label), leader: [],
      // With layer planes the scene is stratified: everything on a lower plane is painted first.
      depth: layered ? layerIndex(spec, pose.position[2]) * 1e4 + depth : depth,
      ...(layered ? {layer: layerIndex(spec, pose.position[2])} : {}),
      ...(glyph ? {glyph: glyph.shapes, glyphName: entity.kind === 'station' ? entity.glyph : undefined, glyphFallback: glyph.fallback} : {}),
    };
  });
  // A token resting on a station's top face is drawn above that station even when the
  // station's centre is deeper than the token (x+y alone would paint the token underneath).
  for (const object of objects) {
    if (object.kind !== 'token') continue;
    const [tx, ty, tz] = display[object.id].position;
    for (const entity of spec.entities) {
      if (entity.kind !== 'station') continue;
      const [sx, sy, sz] = display[entity.id].position, [w, d, h] = entity.size;
      if (Math.abs(tx - sx) <= w / 2 + 1e-6 && Math.abs(ty - sy) <= d / 2 + 1e-6 && tz >= sz + h - 1e-6) {
        const below = objects.find(o => o.id === entity.id)!;
        object.depth = Math.max(object.depth, below.depth + .05);
      }
    }
  }
  objects.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id, 'en'));
  const links = spec.links.map(link => {
    const from = entities.get(link.from)!, to = entities.get(link.to)!, attach = link.attach ?? {from: 'top', to: 'top'};
    const start = linkAnchor(from, display[link.from], attach.from, link.via[0] ?? display[link.to].position);
    const end = linkAnchor(to, display[link.to], attach.to, link.via[link.via.length - 1] ?? start);
    return {
      id: link.id, label: link.label, active: frame.activeLinks.includes(link.id), ...(link.style ? {style: link.style} : {}),
      ...(layered ? {layer: Math.min(layerIndex(spec, display[link.from].position[2]), layerIndex(spec, display[link.to].position[2]))} : {}),
      path: [start, ...link.via, end].map(p => project(p, mode)),
    };
  });
  if (spec.scene?.labels === 'attached') attachLabels(objects, links.map(l => l.path));
  else positionLabels(objects);
  return layered ? {objects, links, ...ground(compiled, mode)} : {objects, links};
}

/* ---------- layer planes and domains (static) ---------- */
const groundCache = new WeakMap<CompiledMotion, Map<MotionProjection, Pick<MotionDrawing, 'planes' | 'groups'>>>();
function ground(compiled: CompiledMotion, mode: MotionProjection): Required<Pick<MotionDrawing, 'planes' | 'groups'>> {
  let cache = groundCache.get(compiled);
  if (!cache) {cache = new Map(); groundCache.set(compiled, cache);}
  const hit = cache.get(mode);
  if (hit) return hit as Required<Pick<MotionDrawing, 'planes' | 'groups'>>;
  const spec = compiled.spec, stations = spec.entities.filter(e => e.kind === 'station') as Extract<MotionEntity, {kind: 'station'}>[];
  // One shared extent keeps the planes stacked like shelves; it covers every station in every frame.
  const footprints = [compiled.initial, ...compiled.frames].flatMap(f => stations.map(s => {
    const [x, y] = f.poses[s.id].position; return [x - s.size[0] / 2, y - s.size[1] / 2, x + s.size[0] / 2, y + s.size[1] / 2];
  }));
  const pad = 1, shared: [number, number, number, number] = [
    Math.min(...footprints.map(f => f[0])) - pad, Math.min(...footprints.map(f => f[1])) - pad,
    Math.max(...footprints.map(f => f[2])) + pad, Math.max(...footprints.map(f => f[3])) + pad,
  ];
  const rect = ([x0, y0, x1, y1]: number[], z: number): Point2[] => ([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]] as Point3[]).map(p => project(p, mode));
  const planes = spec.layers!.map(layer => {
    const extent = layer.extent ?? shared, corner = project([extent[0], extent[3], layer.z], mode);
    return {id: layer.id, label: layer.label, color: layer.color, texture: layer.texture ?? 'plain', polygon: rect(extent, layer.z - .02), labelPosition: [corner[0] - 14, corner[1] + 4] as Point2};
  });
  const groups = (spec.groups || []).map(group => {
    const layer = spec.layers!.find(l => l.id === group.layer)!, members = stations.filter(s => group.members.includes(s.id));
    const box = members.map(s => {const [x, y] = compiled.initial.poses[s.id].position; return [x - s.size[0] / 2, y - s.size[1] / 2, x + s.size[0] / 2, y + s.size[1] / 2];});
    const gap = .42, extent = [Math.min(...box.map(b => b[0])) - gap, Math.min(...box.map(b => b[1])) - gap, Math.max(...box.map(b => b[2])) + gap, Math.max(...box.map(b => b[3])) + gap];
    // The label starts at the outline's far corner and reads above its far edge, clear of its members.
    const label = project([extent[0], extent[1], layer.z], mode);
    return {id: group.id, label: group.label ?? '', layer: group.layer, color: group.color, polygon: rect(extent, layer.z), labelPosition: [label[0] + 2, label[1] - 5] as Point2};
  });
  const result = {planes, groups};
  cache.set(mode, result);
  return result;
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
const pointBounds = (points: Point2[]): Bounds => {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return {x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys)};
};
function annotationLayout(annotations: MotionAnnotation[], objects: MotionObject[]): AnnotationLayout[] {
  const occupied = objects.filter(o => o.alpha > 0).flatMap(o => [labelBounds(o), pointBounds(objectPoints(o))]);
  return annotations.map(a => {
    const object = objects.find(o => o.id === a.entity)!;
    const lines = annotationLines(a.text), width = Math.max(120, ...lines.map(line => line.length * 7 + 22)), height = 20 + lines.length * 15;
    const box = {x: object.center[0] + a.offset[0] - width / 2, y: object.center[1] + a.offset[1] - height / 2, width, height};
    // Resolve away from the anchor, respecting the authored vertical side.
    // Always moving up can send a below-object note across the whole diagram.
    const direction = a.offset[1] < 0 ? -1 : 1;
    let tries = 0;
    while (occupied.some(b => overlaps(box, b, 10)) && tries++ < 16) box.y += direction * 26;
    if (occupied.some(b => overlaps(box, b, 10))) box.y = direction < 0
      ? Math.min(box.y, ...occupied.map(b => b.y)) - height - 14
      : Math.max(box.y, ...occupied.map(b => b.y + b.height)) + 14;
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
  const occupied: Bounds[] = objects.filter(o => o.alpha > 0).map(o => pointBounds(objectPoints(o)));
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
      object.leader = [[object.center[0], Math.min(...objectPoints(object).map(p => p[1])) - 4], [object.labelPosition[0], object.labelPosition[1] + 3]];
    }
    occupied.push(labelBounds(object));
  }
}
/** Liang-Barsky: does the segment a-b cross the box? */
function segmentHits(a: Point2, b: Point2, box: Bounds): boolean {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - box.x], [dx, box.x + box.width - a[0]], [-dy, a[1] - box.y], [dy, box.y + box.height - a[1]]]) {
    if (p === 0) {if (q < 0) return false; continue;}
    const t = q / p;
    if (p < 0) {if (t > t1) return false; if (t > t0) t0 = t;} else {if (t < t0) return false; if (t < t1) t1 = t;}
  }
  return true;
}
/**
 * `labels: 'attached'`: each label is placed against its own station (right, left, below, above,
 * then the four corners), never on another station or label and, when possible, off every link.
 * When no attached spot is free it moves outwards and keeps a leader to its station.
 * Greedy and deterministic: stations are visited top to bottom, then by id.
 */
function attachLabels(objects: MotionObject[], links: Point2[][]): void {
  const visible = objects.filter(o => o.alpha > 0);
  const shapes = new Map(visible.map(o => [o.id, pointBounds(objectPoints(o))]));
  const placedLabels: Bounds[] = [];
  const segments = links.flatMap(path => path.slice(1).map((b, i) => [path[i], b] as [Point2, Point2]));
  const ordered = [...visible].sort((a, b) => shapes.get(a.id)!.y - shapes.get(b.id)!.y || a.id.localeCompare(b.id, 'en'));
  for (const object of ordered) {
    const own = shapes.get(object.id)!, font = object.kind === 'station' ? 12 : 10;
    const width = Math.max(28, ...object.labelLines.map(line => line.length * font * .65)), height = object.labelLines.length * 15 + 3;
    // labelPosition is the first baseline at the horizontal centre: box = (x - w/2, y - 12, w, h).
    const at = (cx: number, top: number): Point2 => [cx, top + 12];
    const midY = own.y + own.height / 2 - height / 2, gap = 7;
    const near: Point2[] = [
      at(own.x + own.width + gap + width / 2, midY), at(own.x - gap - width / 2, midY),
      at(own.x + own.width / 2, own.y + own.height + gap - 2), at(own.x + own.width / 2, own.y - gap - height),
      at(own.x + own.width + gap / 2 + width / 2, own.y + own.height - height / 2), at(own.x - gap / 2 - width / 2, own.y + own.height - height / 2),
      at(own.x + own.width + gap / 2 + width / 2, own.y - height / 2), at(own.x - gap / 2 - width / 2, own.y - height / 2),
    ];
    const boxAt = (p: Point2): Bounds => ({x: p[0] - width / 2, y: p[1] - 12, width, height});
    // A station this one stands on (a lake, a floor) is ground, not an obstacle for its label.
    const inside = (b: Bounds, p: Point2) => p[0] > b.x && p[0] < b.x + b.width && p[1] > b.y && p[1] < b.y + b.height;
    const obstacles = visible.filter(o => o === object || !inside(shapes.get(o.id)!, [own.x + own.width / 2, own.y + own.height / 2])).map(o => shapes.get(o.id)!);
    const blocked = (box: Bounds, avoidLinks: boolean) =>
      obstacles.some(b => overlaps(box, b, 3)) || placedLabels.some(b => overlaps(box, b, 4)) ||
      avoidLinks && segments.some(([a, b]) => segmentHits(a, b, {x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4}));
    let chosen = near.find(p => !blocked(boxAt(p), true)) ?? near.find(p => !blocked(boxAt(p), false));
    let leader = false;
    if (!chosen) {
      outer: for (let ring = 1; ring <= 10; ring++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const p: Point2 = [near[0][0] + dx * ring * 26, near[0][1] + dy * ring * 18];
        if (!blocked(boxAt(p), false)) {chosen = p; leader = true; break outer;}
      }
    }
    if (!chosen) {chosen = at(own.x + own.width / 2, Math.min(...[...shapes.values(), ...placedLabels].map(b => b.y)) - height - 16); leader = true;}
    object.labelPosition = chosen;
    const box = boxAt(chosen);
    placedLabels.push(box);
    if (leader) {
      const target: Point2 = [Math.max(box.x, Math.min(box.x + box.width, own.x + own.width / 2)), box.y + box.height < own.y ? box.y + box.height : box.y];
      object.leader = [[own.x + own.width / 2, own.y + own.height / 2], target];
    }
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
    ...scene.objects.flatMap(o => [...objectPoints(o), [o.labelPosition[0] - 95, o.labelPosition[1] - 14] as Point2, [o.labelPosition[0] + 95, o.labelPosition[1] + o.labelLines.length * 16] as Point2]),
    ...scene.links.flatMap(l => l.path),
    ...scene.annotations.flatMap(a => [[a.box.x, a.box.y] as Point2, [a.box.x + a.box.width, a.box.y + a.box.height] as Point2, a.anchor]),
    ...(scene.planes || []).flatMap(p => [...p.polygon, [p.labelPosition[0] - 8 * p.label.length - 10, p.labelPosition[1]] as Point2]),
    ...(scene.groups || []).flatMap(g => g.polygon),
  ];
}
/** Stable extents across all frames avoid camera jumps and clipping a future transfer route. */
export function motionBounds(compiled: CompiledMotion, mode: MotionProjection): Bounds {
  const b = bounds([compiled.initial, ...compiled.frames].flatMap(frame => [
    ...drawingPoints(drawing(compiled, frame, mode)),
    ...Object.values(frame.routes).flat().map(p => project(p, mode)),
  ]));
  // A header reserves room above the scene for the title and description.
  return compiled.spec.scene?.header ? {...b, y: b.y - 64, height: b.height + 64} : b;
}
export const statusColor = (status: string): string => ({active: '#26748d', complete: '#268162', warning: '#a76d18', muted: '#8797a5', idle: '#b5c2cc'}[status] || '#b5c2cc');
