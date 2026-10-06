/** Parametric geometry for the ILLUSTRATIVE blade + hub model.
 * Pure, deterministic functions: same params -> same arrays -> same hash.
 * Runs in the Web Worker (browser) and in Node (tests). No DOM, no Three.js.
 *
 * Pipeline: params -> closed indexed meshes per solid (hub, blade k) whose
 * triangles carry a feature code -> boolean union in manifold-3d (faceIDs are
 * preserved by the kernel) -> render arrays + edges + metrics + hash.
 * Units: millimetres. X is the hub axis, blades are radial in the Y-Z plane.
 */
import {bladeFaceCode,bladeFeatureId,featureIdForCode,HUB_CODE} from './features.ts';
import {nacaCode,validateParams,type Params} from './params.ts';

export const SECTION_POINTS = 24;   // points per airfoil surface (cosine spacing)
export const SPAN_STATIONS = 16;    // sections from the hub surface to the tip
export const HUB_SEGMENTS = 48;     // segments around the hub axis

type Vec3 = [number, number, number];
export type SolidMesh = {positions: number[]; triangles: number[]; codes: number[]};
export type EdgeFeature = {id: string; closed: boolean; points: number[]};
export type KernelName = 'manifold-3d' | 'js-preview';
export type BuildResult = {
  kernel: KernelName; kernelNote: string; naca: string;
  /** Non-indexed render arrays: 9 floats per triangle. */
  positions: Float32Array; normals: Float32Array;
  /** One feature code per triangle (see features.ts). */
  faceCodes: Uint32Array;
  edges: EdgeFeature[];
  features: string[];
  metrics: {triangles: number; vertices: number; volume: number; area: number; bbox: [number, number, number, number, number, number]};
  hash: string;
};

/** Minimal structural view of the manifold-3d module, so this file stays testable without the bundler. */
export type ManifoldKernel = {
  Manifold: {union(list: unknown[]): KernelSolid; new (mesh: unknown): KernelSolid};
  Mesh: new (options: {numProp: number; vertProperties: Float32Array; triVerts: Uint32Array; faceID: Uint32Array}) => unknown;
};
type KernelSolid = {getMesh(): {numProp: number; vertProperties: Float32Array; triVerts: Uint32Array; faceID: Uint32Array}; volume(): number; surfaceArea(): number; delete(): void; status?(): unknown};

/* ------------------------------------------------------------------ section */

/** NACA 4-digit section with a closed trailing edge, as a ring of 2n points (chord units).
 * ring[0] = trailing edge, ring[1..n-1] = upper surface (TE -> LE), ring[n] = leading edge,
 * ring[n+1..2n-1] = lower surface (LE -> TE). Segment k -> k+1 is upper for k < n.
 */
export function nacaRing(camberPct: number, camberPos: number, thicknessPct: number, n = SECTION_POINTS): [number, number][] {
  const m = camberPct / 100, p = camberPos / 10, t = thicknessPct / 100;
  const upper: [number, number][] = [], lower: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos(Math.PI * i / n)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    let yc = 0, dyc = 0;
    if (m > 0) {
      if (x < p) { yc = m / (p * p) * (2 * p * x - x * x); dyc = 2 * m / (p * p) * (p - x); }
      else { yc = m / ((1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x); dyc = 2 * m / ((1 - p) ** 2) * (p - x); }
    }
    const th = Math.atan(dyc);
    upper.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]);
    lower.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]);
  }
  // Leading and trailing edges are shared points (yt = 0 there).
  const ring: [number, number][] = [];
  for (let i = n; i >= 0; i--) ring.push(upper[i]);
  for (let i = 1; i < n; i++) ring.push(lower[i]);
  return ring;
}

/* ------------------------------------------------------------------ blade */

type BladeFrame = {stations: number; ringSize: number; points: Vec3[]};

function bladeStations(P: Params) {
  const R = P['p-hub-radius'], span = P['p-span'];
  // Station 0 is buried inside the hub so the union has real overlap to resolve.
  const radii = [0.45 * R];
  for (let j = 0; j <= SPAN_STATIONS; j++) radii.push(R + span * j / SPAN_STATIONS);
  return radii.map(r => {
    const s = Math.max(0, (r - R) / span);
    const chord = P['p-chord'] * (1 + (P['p-taper'] - 1) * s);
    const angle = (P['p-pitch'] + P['p-twist'] * s) * Math.PI / 180;
    return {r, chord, angle};
  });
}

function bladeFrame(P: Params, blade: number): BladeFrame {
  const ring = nacaRing(P['p-camber'], P['p-camber-pos'], P['p-thickness']);
  const phi = 2 * Math.PI * blade / P['p-blades'] + Math.PI / 2;
  const er: Vec3 = [0, Math.cos(phi), Math.sin(phi)], et: Vec3 = [0, -Math.sin(phi), Math.cos(phi)];
  const points: Vec3[] = [];
  const stations = bladeStations(P);
  for (const {r, chord, angle} of stations) {
    const c = Math.cos(angle), s = Math.sin(angle);
    for (const [x, y] of ring) {
      const X = (x - 0.25) * chord, Y = y * chord;      // quarter-chord pivot
      const ax = X * c + Y * s, tg = -X * s + Y * c;    // pitch rotation in the axial/tangential plane
      points.push([ax + r * er[0] + tg * et[0], r * er[1] + tg * et[1], r * er[2] + tg * et[2]]);
    }
  }
  return {stations: stations.length, ringSize: ring.length, points};
}

export function bladeMesh(P: Params, blade: number): SolidMesh {
  const {stations, ringSize: R, points} = bladeFrame(P, blade), n = R / 2;
  const positions = points.flat(), triangles: number[] = [], codes: number[] = [];
  const up = bladeFaceCode(blade, 'upper-surface'), lo = bladeFaceCode(blade, 'lower-surface');
  for (let j = 0; j < stations - 1; j++) for (let k = 0; k < R; k++) {
    const a = j * R + k, b = j * R + (k + 1) % R, c = (j + 1) * R + (k + 1) % R, d = (j + 1) * R + k;
    const code = k < n ? up : lo;
    triangles.push(a, c, b, a, d, c); codes.push(code, code);
  }
  // Caps: x-monotone strips between the upper and lower point at the same chord station.
  const U = (i: number) => n - i, L = (i: number) => (i === 0 ? n : i === n ? 0 : n + i);
  const cap = (station: number, code: number, flip: boolean) => {
    const o = station * R;
    const tri = (a: number, b: number, c: number) => { if (flip) triangles.push(o + a, o + c, o + b); else triangles.push(o + a, o + b, o + c); codes.push(code); };
    for (let i = 0; i < n; i++) {
      if (i === 0) tri(U(0), U(1), L(1));
      else if (i === n - 1) tri(U(i), U(n), L(i));
      else { tri(U(i), U(i + 1), L(i + 1)); tri(U(i), L(i + 1), L(i)); }
    }
  };
  cap(0, bladeFaceCode(blade, 'root-face'), true);
  cap(stations - 1, bladeFaceCode(blade, 'tip-face'), false);
  return orient({positions, triangles, codes});
}

export function bladeEdges(P: Params, blade: number): EdgeFeature[] {
  const {stations, ringSize: R, points} = bladeFrame(P, blade), n = R / 2;
  const line = (k: number) => { const out: number[] = []; for (let j = 1; j < stations; j++) out.push(...points[j * R + k]); return out; };
  const tip: number[] = []; for (let k = 0; k < R; k++) tip.push(...points[(stations - 1) * R + k]);
  return [
    {id: bladeFeatureId(blade, 'leading-edge'), closed: false, points: line(n)},
    {id: bladeFeatureId(blade, 'trailing-edge'), closed: false, points: line(0)},
    {id: bladeFeatureId(blade, 'tip-edge'), closed: true, points: tip},
  ];
}

/* ------------------------------------------------------------------ hub */

export function hubMesh(P: Params): SolidMesh {
  const R = P['p-hub-radius'], L = P['p-hub-length'], M = HUB_SEGMENTS;
  // Profile rings (x, r) between the two apices; region = code of the band AFTER this ring.
  const rings: {x: number; r: number; code: number}[] = [];
  const NOSE = 8;
  for (let i = 1; i <= NOSE; i++) { const a = Math.PI / 2 * i / NOSE; rings.push({x: -L / 2 - 0.9 * R * Math.cos(a), r: R * Math.sin(a), code: i === NOSE ? HUB_CODE.body : HUB_CODE.nose}); }
  rings.push({x: L / 2, r: R, code: HUB_CODE.tail});
  rings.push({x: L / 2 + 0.8 * R, r: R / 2, code: HUB_CODE.tail});
  const positions: number[] = [-L / 2 - 0.9 * R, 0, 0], triangles: number[] = [], codes: number[] = [];
  for (const {x, r} of rings) for (let k = 0; k < M; k++) { const a = 2 * Math.PI * k / M; positions.push(x, r * Math.cos(a), r * Math.sin(a)); }
  const tail = 1 + rings.length * M; positions.push(L / 2 + 1.6 * R, 0, 0);
  const v = (ring: number, k: number) => 1 + ring * M + (k % M);
  for (let k = 0; k < M; k++) { triangles.push(0, v(0, k + 1), v(0, k)); codes.push(HUB_CODE.nose); }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < M; k++) {
    triangles.push(v(i, k), v(i, k + 1), v(i + 1, k + 1), v(i, k), v(i + 1, k + 1), v(i + 1, k)); codes.push(rings[i].code, rings[i].code);
  }
  const last = rings.length - 1;
  for (let k = 0; k < M; k++) { triangles.push(tail, v(last, k), v(last, k + 1)); codes.push(HUB_CODE.tail); }
  return orient({positions, triangles, codes});
}

/* ------------------------------------------------------------------ helpers */

function signedVolume(m: SolidMesh) {
  let v = 0; const p = m.positions, t = m.triangles;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}
/** Outward (CCW) winding regardless of blade direction/mirroring. */
function orient(m: SolidMesh): SolidMesh {
  if (signedVolume(m) >= 0) return m;
  const t = m.triangles.slice(); for (let i = 0; i < t.length; i += 3) [t[i + 1], t[i + 2]] = [t[i + 2], t[i + 1]];
  return {...m, triangles: t};
}

export function modelSolids(P: Params): SolidMesh[] {
  return [hubMesh(P), ...Array.from({length: P['p-blades']}, (_, b) => bladeMesh(P, b))];
}

type Indexed = {vert: Float32Array; tri: Uint32Array; code: Uint32Array};
function concat(solids: SolidMesh[]): Indexed {
  const nv = solids.reduce((s, m) => s + m.positions.length, 0), nt = solids.reduce((s, m) => s + m.triangles.length, 0);
  const vert = new Float32Array(nv), tri = new Uint32Array(nt), code = new Uint32Array(nt / 3);
  let vo = 0, to = 0, co = 0;
  for (const m of solids) {
    vert.set(m.positions, vo); for (let i = 0; i < m.triangles.length; i++) tri[to + i] = m.triangles[i] + vo / 3;
    code.set(m.codes, co); vo += m.positions.length; to += m.triangles.length; co += m.codes.length;
  }
  return {vert, tri, code};
}

/** Smoothing group: the upper and lower skins of one blade shade as one surface. */
function smoothGroup(code: number) { return code >= 10 && code % 10 <= 2 ? Math.floor(code / 10) * 10 : code; }

function renderArrays(mesh: Indexed) {
  const T = mesh.tri.length / 3, positions = new Float32Array(T * 9), normals = new Float32Array(T * 9);
  const acc = new Map<number, Vec3>(), faceN: Vec3[] = [];
  const key = (v: number, g: number) => v * 128 + g;
  for (let t = 0; t < T; t++) {
    const [a, b, c] = [mesh.tri[3 * t], mesh.tri[3 * t + 1], mesh.tri[3 * t + 2]], V = mesh.vert;
    const ux = V[3 * b] - V[3 * a], uy = V[3 * b + 1] - V[3 * a + 1], uz = V[3 * b + 2] - V[3 * a + 2];
    const vx = V[3 * c] - V[3 * a], vy = V[3 * c + 1] - V[3 * a + 1], vz = V[3 * c + 2] - V[3 * a + 2];
    const n: Vec3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; faceN.push(n); // area-weighted
    const g = smoothGroup(mesh.code[t]);
    for (const v of [a, b, c]) { const k = key(v, g), s = acc.get(k); if (s) { s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; } else acc.set(k, [...n]); }
    for (let i = 0; i < 3; i++) { const v = mesh.tri[3 * t + i]; positions.set([V[3 * v], V[3 * v + 1], V[3 * v + 2]], 9 * t + 3 * i); }
  }
  for (let t = 0; t < T; t++) {
    const g = smoothGroup(mesh.code[t]), f = faceN[t], fl = Math.hypot(...f) || 1;
    for (let i = 0; i < 3; i++) {
      const s = acc.get(key(mesh.tri[3 * t + i], g))!, l = Math.hypot(...s);
      // Keep a hard crease where the smoothed normal disagrees strongly with the face (e.g. trailing edge).
      const dot = l ? (s[0] * f[0] + s[1] * f[1] + s[2] * f[2]) / (l * fl) : 0;
      const n = dot > 0.5 ? [s[0] / l, s[1] / l, s[2] / l] : [f[0] / fl, f[1] / fl, f[2] / fl];
      normals.set(n, 9 * t + 3 * i);
    }
  }
  return {positions, normals};
}

function bbox(vert: Float32Array): BuildResult['metrics']['bbox'] {
  const b: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vert.length; i += 3) for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], vert[i + a]); b[a + 3] = Math.max(b[a + 3], vert[i + a]); }
  return b.map(v => Math.round(v * 100) / 100) as BuildResult['metrics']['bbox'];
}

function meshArea(m: Indexed) {
  let s = 0; const V = m.vert;
  for (let t = 0; t < m.tri.length; t += 3) {
    const a = 3 * m.tri[t], b = 3 * m.tri[t + 1], c = 3 * m.tri[t + 2];
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    s += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return s;
}

/** SHA-256 over the kernel output (positions, triangle indices, face codes). First 16 hex chars. */
export async function meshHash(kernel: string, mesh: {vert: Float32Array; tri: Uint32Array; code: Uint32Array}) {
  const header = new TextEncoder().encode(`param-lab/1|${kernel}|${mesh.vert.length}|${mesh.tri.length}|`);
  const parts = [header, new Uint8Array(mesh.vert.buffer, mesh.vert.byteOffset, mesh.vert.byteLength), new Uint8Array(mesh.tri.buffer, mesh.tri.byteOffset, mesh.tri.byteLength), new Uint8Array(mesh.code.buffer, mesh.code.byteOffset, mesh.code.byteLength)];
  const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', all));
  return [...digest.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------------ build */

/** Build the model. With a kernel: exact boolean union in manifold-3d. Without one
 * (e.g. WebAssembly blocked by a page CSP) the solids are only concatenated and the
 * result says so: overlapping volume is counted twice and the hash differs.
 */
export async function buildModel(input: Readonly<Record<string, unknown>>, kernel: ManifoldKernel | null, fallbackReason = 'No geometry kernel available.'): Promise<BuildResult> {
  const P = validateParams(input);
  const solids = modelSolids(P);
  let mesh: Indexed, volume: number, area: number, name: KernelName, note: string;
  if (kernel) {
    const parts = solids.map(s => new kernel.Manifold(new kernel.Mesh({numProp: 3, vertProperties: new Float32Array(s.positions), triVerts: new Uint32Array(s.triangles), faceID: new Uint32Array(s.codes)})));
    const union = kernel.Manifold.union(parts);
    try {
      const out = union.getMesh();
      if (out.numProp !== 3) throw new Error('Unexpected vertex properties from the kernel');
      mesh = {vert: out.vertProperties.slice(), tri: out.triVerts.slice(), code: out.faceID.slice()};
      volume = union.volume(); area = union.surfaceArea();
    } finally { union.delete(); for (const p of parts) p.delete(); }
    if (!mesh.tri.length) throw new Error('The kernel returned an empty solid for these parameters.');
    name = 'manifold-3d'; note = 'Exact boolean union (manifold-3d WebAssembly).';
  } else {
    mesh = concat(solids); volume = solids.reduce((s, m) => s + signedVolume(m), 0); area = meshArea(mesh);
    name = 'js-preview'; note = `Preview only, no boolean union: ${fallbackReason}`;
  }
  const {positions, normals} = renderArrays(mesh);
  const present = new Set<string>();
  for (const c of mesh.code) { const id = featureIdForCode(c); if (id) present.add(id); }
  const edges = Array.from({length: P['p-blades']}, (_, b) => bladeEdges(P, b)).flat();
  for (const e of edges) present.add(e.id);
  return {
    kernel: name, kernelNote: note, naca: nacaCode(P), positions, normals, faceCodes: mesh.code, edges,
    features: [...present].sort(),
    metrics: {triangles: mesh.tri.length / 3, vertices: mesh.vert.length / 3, volume: Math.round(volume * 10) / 10, area: Math.round(area * 10) / 10, bbox: bbox(mesh.vert)},
    hash: await meshHash(name, mesh),
  };
}

/** Binary STL from the render arrays (triangle soup, facet normal from the winding). */
export function toBinaryStl(result: Pick<BuildResult, 'positions'>, header = 'param-lab ILLUSTRATIVE blade+hub (not FOIL data)') {
  const T = result.positions.length / 9, buf = new ArrayBuffer(84 + 50 * T), view = new DataView(buf);
  const h = new TextEncoder().encode(header.slice(0, 80)); new Uint8Array(buf, 0, 80).set(h);
  view.setUint32(80, T, true);
  const p = result.positions;
  for (let t = 0; t < T; t++) {
    const o = 84 + 50 * t, i = 9 * t;
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2], vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(n[0], n[1], n[2]) || 1;
    for (let a = 0; a < 3; a++) view.setFloat32(o + 4 * a, n[a] / l, true);
    for (let a = 0; a < 9; a++) view.setFloat32(o + 12 + 4 * a, p[i + a], true);
  }
  return buf;
}
