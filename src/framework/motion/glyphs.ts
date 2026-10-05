import type {MotionProjection, Point3} from './model.ts';

/**
 * Isometric glyph registry. A glyph is a pure function that describes a small 3D object in the
 * station's local frame (footprint [-w/2, w/2] x [-d/2, d/2], height upwards; one unit = the shorter
 * footprint side). The framework projects it with the scene projection, so the same glyph reads in
 * the isometric and the diagram projection, in the live renderer and in the exported SVG.
 * Parts are painted in authored order: author them back to front. No DOM, no randomness.
 */
export type Point2 = [number, number];
export type GlyphPart =
  | {shape: 'poly'; points: Point3[]; fill: string; stroke?: string; opacity?: number}
  /** Convex hull of the projected points: the silhouette of a cylinder, cone or frustum side. */
  | {shape: 'hull'; points: Point3[]; fill: string; stroke?: string}
  | {shape: 'line'; points: Point3[]; stroke: string; width?: number; dash?: boolean; opacity?: number}
  /** The near half of a horizontal circle (a band around a cylinder). */
  | {shape: 'arc'; center: Point3; r: number; stroke: string; width?: number}
  | {shape: 'sphere'; center: Point3; r: number; fill: string; stroke?: string};
/** Projected, ready-to-draw shapes, shared by the D3 renderer and the SVG exporter. */
export type GlyphShape =
  | {kind: 'polygon'; points: Point2[]; fill: string; stroke: string; width: number; opacity: number}
  | {kind: 'polyline'; points: Point2[]; stroke: string; width: number; dash: boolean; opacity: number}
  | {kind: 'circle'; center: Point2; r: number; fill: string; stroke: string; width: number};
export type GlyphKit = {
  /** Station colour, footprint in local units (one of them is 1), the authored box height in local units, and world units per local unit. */
  color: string; w: number; d: number; h: number; unit: number;
  shade(color: string, amount: number): string;
  /** An axis-aligned block: the visible side faces then the top. */
  box(x: number, y: number, z: number, w: number, d: number, h: number, color: string): GlyphPart[];
  /** Upright cylinder or frustum: side silhouette then top cap. */
  frustum(x: number, y: number, z: number, r0: number, r1: number, h: number, color: string): GlyphPart[];
  /** Points of a circle in the horizontal plane (`xy`) or an upright plane facing the viewer (`xz`). */
  circle(x: number, y: number, z: number, r: number, plane?: 'xy' | 'xz', n?: number): Point3[];
};
export type MotionGlyph = (kit: GlyphKit) => GlyphPart[];

const HEX = /^#[a-fA-F0-9]{6}$/;
export function shadeColor(color: string, amount: number): string {
  if (!HEX.test(color)) throw new Error('Invalid face color');
  return '#' + [1, 3, 5].map(i => {
    const c = parseInt(color.slice(i, i + 2), 16);
    return Math.round(Math.max(0, Math.min(255, amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)))).toString(16).padStart(2, '0');
  }).join('');
}
function circle(x: number, y: number, z: number, r: number, plane: 'xy' | 'xz' = 'xy', n = 20): Point3[] {
  return [...Array(n)].map((_, i) => {
    const a = i / n * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
    return (plane === 'xy' ? [x + c, y + s, z] : [x + c, y, z + s]) as Point3;
  });
}
function box(x: number, y: number, z: number, w: number, d: number, h: number, color: string): GlyphPart[] {
  const [x0, x1, y0, y1, z1] = [x - w / 2, x + w / 2, y - d / 2, y + d / 2, z + h];
  return [
    {shape: 'poly', points: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z], [x0, y1, z]], fill: shadeColor(color, -.12)},
    {shape: 'poly', points: [[x1, y0, z1], [x1, y0, z], [x1, y1, z], [x1, y1, z1]], fill: shadeColor(color, -.28)},
    {shape: 'poly', points: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], fill: shadeColor(color, .3)},
  ];
}
function frustum(x: number, y: number, z: number, r0: number, r1: number, h: number, color: string): GlyphPart[] {
  return [
    {shape: 'hull', points: [...circle(x, y, z, r0), ...circle(x, y, z + h, r1)], fill: shadeColor(color, -.16)},
    {shape: 'poly', points: circle(x, y, z + h, r1), fill: shadeColor(color, .3)},
  ];
}
const kitTools = {shade: shadeColor, box, frustum, circle};

const INK = '#3b4a54', WATER = '#7fb0bb';
const wave = (x0: number, x1: number, y: number, z: number, amp: number): Point3[] =>
  [...Array(9)].map((_, i) => [x0 + (x1 - x0) * i / 8, y + Math.sin(i / 8 * Math.PI * 2) * amp, z] as Point3);
/** Gable roof along x: back slope, front slope, right gable end. */
function roof(w: number, d: number, z: number, rise: number, color: string): GlyphPart[] {
  const [x0, x1, y0, y1] = [-w / 2, w / 2, -d / 2, d / 2];
  return [
    {shape: 'poly', points: [[x0, y0, z], [x1, y0, z], [x1, 0, z + rise], [x0, 0, z + rise]], fill: shadeColor(color, .12)},
    {shape: 'poly', points: [[x0, y1, z], [x1, y1, z], [x1, 0, z + rise], [x0, 0, z + rise]], fill: shadeColor(color, -.06)},
    {shape: 'poly', points: [[x1, y0, z], [x1, y1, z], [x1, 0, z + rise]], fill: shadeColor(color, -.3)},
  ];
}

/** Built-in natural metaphors. Names are generic concepts, not products. */
export const BUILTIN_GLYPHS: Readonly<Record<string, MotionGlyph>> = Object.freeze({
  box: k => k.box(0, 0, 0, k.w, k.d, k.h, k.color),
  /** Water surface: a thin slab (the authored height) with ripples spaced in world units, so it scales to any width. */
  lake: k => {
    const m = 1 / k.unit, parts: GlyphPart[] = [...k.box(0, 0, -k.h, k.w, k.d, k.h, k.color)];
    const rows = Math.max(1, Math.floor(k.d * k.unit / 1.4));
    for (let r = 0; r < rows; r++) {
      const y = -k.d / 2 + k.d * (r + .5) / rows, shift = (r % 2) * 1.1 * m;
      for (let x = -k.w / 2 + .5 * m + shift; x + .8 * m < k.w / 2 - .3 * m; x += 2.2 * m) parts.push({shape: 'line', points: wave(x, x + .8 * m, y, .002, .05 * m), stroke: '#ffffff', width: 1.1, opacity: .75});
    }
    return parts;
  },
  warehouse: k => [
    ...k.box(0, 0, 0, .9, .72, .42, k.color), ...roof(.9, .72, .42, .24, shadeColor(k.color, -.25)),
    {shape: 'poly', points: [[-.12, .361, 0], [.12, .361, 0], [.12, .361, .26], [-.12, .361, .26]], fill: shadeColor(k.color, -.5)},
    ...[.12, .26].map(z => ({shape: 'line' as const, points: [[-.4, .362, z], [-.17, .362, z]] as Point3[], stroke: INK, width: .9})),
    ...[.12, .26].map(z => ({shape: 'line' as const, points: [[.17, .362, z], [.4, .362, z]] as Point3[], stroke: INK, width: .9})),
  ],
  lakehouse: k => [
    {shape: 'poly', points: circle(0, 0, 0, .52), fill: WATER},
    {shape: 'line', points: wave(-.4, .1, .32, .01, .03), stroke: '#ffffff', width: 1, opacity: .8},
    ...[[-.2, -.15], [.2, -.15], [-.2, .15], [.2, .15]].map(([x, y]) => ({shape: 'line' as const, points: [[x, y, 0], [x, y, .14]] as Point3[], stroke: '#8a7a66', width: 1.4})),
    ...k.box(0, 0, .14, .5, .42, .28, k.color), ...roof(.5, .42, .42, .2, shadeColor(k.color, -.3)),
    {shape: 'poly', points: [[-.07, .211, .14], [.07, .211, .14], [.07, .211, .32], [-.07, .211, .32]], fill: shadeColor(k.color, -.5)},
  ],
  pipeline: k => [
    ...k.box(0, 0, .12, 1, .18, .18, '#9bb0b8'),
    ...k.box(-.44, 0, .08, .08, .26, .26, '#7d939c'), ...k.box(.44, 0, .08, .08, .26, .26, '#7d939c'),
    ...k.frustum(0, 0, 0, .2, .2, .5, k.color),
    {shape: 'line', points: [[0, 0, .5], [0, 0, .62]], stroke: INK, width: 1.4},
    {shape: 'line', points: [...circle(0, 0, .62, .18), [.18, 0, .62]], stroke: '#d9774f', width: 2},
    {shape: 'line', points: [[-.18, 0, .62], [.18, 0, .62]], stroke: '#d9774f', width: 1.2},
    {shape: 'line', points: [[0, -.18, .62], [0, .18, .62]], stroke: '#d9774f', width: 1.2},
  ],
  notebook: k => {
    const page = (s: number): Point3[] => [[0, -.32, .1], [0, .32, .1], [s * .46, .32, .22], [s * .46, -.32, .22]];
    const at = (u: number, v: number): Point3 => [u, v, .1 + Math.abs(u) / .46 * .12 + .004];
    return [
      ...k.box(0, 0, 0, 1, .7, .08, shadeColor(k.color, -.45)),
      {shape: 'poly', points: page(-1), fill: shadeColor(k.color, .2)}, {shape: 'poly', points: page(1), fill: k.color},
      ...[-.18, -.04, .1, .22].flatMap((v, i) => [
        {shape: 'line' as const, points: [at(-.38, v), at(i % 2 ? -.16 : -.08, v)], stroke: '#5f7f9a', width: 1.2},
        {shape: 'line' as const, points: [at(.08, v), at(i % 3 ? .38 : .26, v)], stroke: i === 1 ? '#c27a4f' : '#5f7f9a', width: 1.2},
      ]),
      {shape: 'line', points: [[0, -.32, .1], [0, .32, .1]], stroke: INK, width: .8},
    ];
  },
  stream: k => {
    const edge = (z: number) => [...Array(11)].map((_, i) => [-.5 + i / 10, Math.sin(i / 10 * Math.PI * 2) * .14, z] as Point3);
    return [
      {shape: 'poly', points: circle(0, 0, 0, .42), fill: shadeColor(k.color, .55)},
      {shape: 'line', points: [[-.5, 0, 0], [-.5, 0, .5]], stroke: INK, width: 1.2},
      {shape: 'poly', points: [...edge(.48), ...edge(.26).reverse()], fill: k.color, stroke: shadeColor(k.color, -.3)},
      ...[.1, .5, .9].map(t => ({shape: 'sphere' as const, center: [-.5 + t, Math.sin(t * Math.PI * 2) * .14, .37] as Point3, r: .045, fill: '#ffffff'})),
    ];
  },
  'semantic-model': k => {
    const c: Point3 = [0, 0, .48];
    const satellites: [Point3, string][] = [[[-.34, -.2, .62], '#8fb2c6'], [[.3, -.3, .4], '#a7b98f'], [[-.3, .3, .34], '#d39a7c'], [[.34, .26, .66], '#9aa5c8']];
    const sorted = [...satellites].sort((a, b) => a[0][0] + a[0][1] - b[0][0] - b[0][1]);
    const back = sorted.filter(([p]) => p[0] + p[1] < 0), front = sorted.filter(([p]) => p[0] + p[1] >= 0);
    return [
      {shape: 'poly', points: circle(0, 0, 0, .3), fill: shadeColor(k.color, .55)},
      {shape: 'line', points: [[0, 0, 0], c], stroke: INK, width: 1.4},
      ...satellites.map(([p]) => ({shape: 'line' as const, points: [c, p], stroke: INK, width: 1.1})),
      ...back.map(([p, f]) => ({shape: 'sphere' as const, center: p, r: .085, fill: f})),
      {shape: 'sphere', center: c, r: .16, fill: k.color},
      ...front.map(([p, f]) => ({shape: 'sphere' as const, center: p, r: .085, fill: f})),
    ];
  },
  report: k => {
    const y = .02, face = (u0: number, u1: number, z0: number, z1: number): Point3[] => [[u0, y + .041, z0], [u1, y + .041, z0], [u1, y + .041, z1], [u0, y + .041, z1]];
    return [
      ...k.box(0, -.05, 0, .36, .26, .05, '#7e8b95'), ...k.box(0, -.05, .05, .07, .07, .16, '#7e8b95'),
      ...k.box(0, y, .2, .92, .08, .56, '#3d4d58'),
      {shape: 'poly', points: face(-.42, .42, .24, .72), fill: '#eef3f5'},
      ...[[-.32, .38], [-.18, .55], [-.04, .45], [.1, .66], [.24, .52]].map(([u, top]) => ({shape: 'poly' as const, points: face(u, u + .09, .29, top), fill: k.color})),
    ];
  },
  api: k => {
    const arch = [...Array(9)].map((_, i) => {const a = Math.PI * i / 8; return [Math.cos(a) * .2, .151, .36 + Math.sin(a) * .16] as Point3;});
    return [
      ...k.box(-.33, 0, 0, .18, .3, .58, k.color), ...k.box(.33, 0, 0, .18, .3, .58, k.color),
      ...k.box(0, 0, .58, .88, .34, .14, shadeColor(k.color, -.15)),
      {shape: 'poly', points: [[-.24, .151, .58], [.24, .151, .58], [.24, .151, .36], ...arch, [-.24, .151, .36]], fill: shadeColor(k.color, -.05)},
      {shape: 'line', points: arch, stroke: INK, width: 1},
    ];
  },
  queue: k => [
    ...[-.4, .4].flatMap(x => k.box(x, 0, 0, .06, .3, .12, '#7d6f60')),
    ...k.box(0, 0, .12, 1, .34, .06, '#5d6a72'),
    ...[-.32, -.02, .28].flatMap((x, i) => k.box(x, 0, .18, .2, .2, i === 1 ? .2 : .16, i === 2 ? shadeColor(k.color, .2) : k.color)),
  ],
  identity: k => {
    const bow = circle(-.2, 0, .44, .19, 'xz', 24), hole = circle(-.2, .001, .44, .07, 'xz', 16);
    return [
      ...k.box(0, 0, 0, .7, .4, .12, shadeColor(k.color, -.35)),
      {shape: 'line', points: [[-.2, 0, .12], [-.2, 0, .25]], stroke: INK, width: 1.6},
      ...k.box(.16, 0, .41, .5, .07, .07, k.color),
      ...k.box(.3, 0, .3, .05, .07, .11, k.color), ...k.box(.38, 0, .33, .05, .07, .08, k.color),
      {shape: 'poly', points: bow.map(([x, , z]) => [x, .035, z] as Point3), fill: k.color, stroke: shadeColor(k.color, -.35)},
      {shape: 'poly', points: hole.map(([x, , z]) => [x, .036, z] as Point3), fill: shadeColor(k.color, -.45)},
    ];
  },
  database: k => [
    ...k.frustum(0, 0, 0, .36, .36, .7, k.color),
    {shape: 'arc', center: [0, 0, .24], r: .36, stroke: shadeColor(k.color, -.45), width: 1},
    {shape: 'arc', center: [0, 0, .47], r: .36, stroke: shadeColor(k.color, -.45), width: 1},
  ],
  users: k => {
    const figure = (x: number, y: number, s: number, color: string): GlyphPart[] => [
      ...k.frustum(x, y, 0, .17 * s, .1 * s, .36 * s, color),
      {shape: 'sphere', center: [x, y, .48 * s], r: .1 * s, fill: shadeColor(color, .25)},
    ];
    return [...figure(.18, -.18, .85, shadeColor(k.color, -.15)), ...figure(-.12, .14, 1, k.color)];
  },
});

const registry = new Map<string, MotionGlyph>(Object.entries(BUILTIN_GLYPHS));
/**
 * Clients extend the registry at module load (e.g. `registerMotionGlyphs({rack: k => ...})`).
 * Names are unique: a second, different definition throws, so output never depends on import order.
 */
export function registerMotionGlyphs(glyphs: Record<string, MotionGlyph>): void {
  for (const [name, glyph] of Object.entries(glyphs)) {
    if (!/^[a-z][a-zA-Z0-9_-]{0,79}$/.test(name) || typeof glyph !== 'function') throw new Error('Invalid motion glyph: ' + name);
    const existing = registry.get(name);
    if (existing && existing !== glyph) throw new Error('Motion glyph already registered: ' + name);
    registry.set(name, glyph);
  }
}
export const motionGlyphNames = (): string[] => [...registry.keys()].sort();
export const hasMotionGlyph = (name: string): boolean => registry.has(name);

function hull(points: Point2[]): Point2[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point2, a: Point2, b: Point2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point2[] = [], upper: Point2[] = [];
  for (const q of p) {while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q);}
  for (const q of p.reverse()) {while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q);}
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
/**
 * Projects a registered glyph for one station. An unknown name falls back to the plain box
 * (`fallback: true`) so a live scene never breaks on a glyph its client did not register.
 */
export function glyphShapes(name: string, color: string, position: Point3, size: Point3, mode: MotionProjection, project: (p: Point3, mode: MotionProjection) => Point2): {shapes: GlyphShape[]; fallback: boolean} {
  const glyph = registry.get(name), unit = Math.min(size[0], size[1]);
  const kit: GlyphKit = {color, w: size[0] / unit, d: size[1] / unit, h: size[2] / unit, unit, ...kitTools};
  const parts = (glyph || BUILTIN_GLYPHS.box)(kit);
  const world = (p: Point3): Point3 => [position[0] + p[0] * unit, position[1] + p[1] * unit, position[2] + p[2] * unit];
  const at = (p: Point3) => project(world(p), mode);
  const origin = at([0, 0, 0]), scale = ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Point3[]).reduce((sum, axis) => {
    const q = at(axis); return sum + Math.hypot(q[0] - origin[0], q[1] - origin[1]);
  }, 0) / 3;
  const edge = (fill: string) => shadeColor(fill, -.32);
  const shapes = parts.map((part): GlyphShape => {
    switch (part.shape) {
      case 'poly': return {kind: 'polygon', points: part.points.map(at), fill: part.fill, stroke: part.stroke ?? edge(part.fill), width: .8, opacity: part.opacity ?? 1};
      case 'hull': return {kind: 'polygon', points: hull(part.points.map(at)), fill: part.fill, stroke: part.stroke ?? edge(part.fill), width: .8, opacity: 1};
      case 'line': return {kind: 'polyline', points: part.points.map(at), stroke: part.stroke, width: part.width ?? 1, dash: !!part.dash, opacity: part.opacity ?? 1};
      case 'sphere': return {kind: 'circle', center: at(part.center), r: part.r * scale, fill: part.fill, stroke: part.stroke ?? edge(part.fill), width: .8};
      case 'arc': {
        const center = at(part.center), ring = circle(...part.center, part.r, 'xy', 32).map(at);
        // Keep the near half: the points drawn below the centre in both projections.
        const start = ring.findIndex((p, i) => p[1] >= center[1] && ring[(i + ring.length - 1) % ring.length][1] < center[1]);
        const near: Point2[] = [];
        for (let i = 0; i < ring.length; i++) {const p = ring[(start + i) % ring.length]; if (p[1] >= center[1] - 1e-9) near.push(p); else if (near.length) break;}
        return {kind: 'polyline', points: near, stroke: part.stroke, width: part.width ?? 1, dash: false, opacity: 1};
      }
      default: throw new Error('Unknown glyph part');
    }
  });
  return {shapes, fallback: !glyph};
}
export function glyphPoints(shapes: readonly GlyphShape[]): Point2[] {
  return shapes.flatMap(s => s.kind === 'circle' ? [[s.center[0] - s.r, s.center[1] - s.r], [s.center[0] + s.r, s.center[1] + s.r]] as Point2[] : s.points);
}
