/** Stable semantic feature ids. A feature id is a design intent ("blade-2.leading-edge"),
 * never a triangle index, a mesh node name or a renderer-local id, so it survives
 * every parameter change that keeps the feature present.
 */
export type FeatureKind = 'face' | 'edge';
export type FeatureSpec = {id: string; kind: FeatureKind; label: string; owner: string; drivenBy: readonly string[]; note: string};

export const MAX_BLADES = 4;
const SECTION = ['p-camber', 'p-camber-pos', 'p-thickness'];
const PLANFORM = ['p-span', 'p-chord', 'p-taper', 'p-pitch', 'p-twist'];

/** Per-blade feature templates, in a fixed order. The order defines the numeric face code. */
const BLADE_FEATURES = [
  {key:'upper-surface',kind:'face',label:'Upper (suction) surface',drivenBy:[...SECTION,...PLANFORM],note:'Lofted from NACA sections; camber and thickness shape it.'},
  {key:'lower-surface',kind:'face',label:'Lower (pressure) surface',drivenBy:[...SECTION,...PLANFORM],note:'Lofted from NACA sections; camber and thickness shape it.'},
  {key:'tip-face',kind:'face',label:'Tip cap',drivenBy:['p-span','p-chord','p-taper','p-pitch','p-twist','p-thickness','p-camber','p-camber-pos'],note:'Flat cap at the tip section.'},
  {key:'root-face',kind:'face',label:'Root cap',drivenBy:['p-hub-radius','p-chord','p-pitch'],note:'Normally buried in the hub by the boolean union.'},
  {key:'leading-edge',kind:'edge',label:'Leading edge',drivenBy:['p-span','p-chord','p-taper','p-pitch','p-twist','p-hub-radius'],note:'Polyline through the section leading-edge points (x/c = 0).'},
  {key:'trailing-edge',kind:'edge',label:'Trailing edge',drivenBy:['p-span','p-chord','p-taper','p-pitch','p-twist','p-hub-radius'],note:'Polyline through the closed section trailing-edge points (x/c = 1).'},
  {key:'tip-edge',kind:'edge',label:'Tip outline',drivenBy:['p-span','p-chord','p-taper','p-twist','p-thickness','p-camber','p-camber-pos'],note:'Closed outline of the tip section.'},
] as const;
const HUB_FEATURES = [
  {key:'nose',kind:'face',label:'Hub nose',drivenBy:['p-hub-radius','p-hub-length'],note:'Half-ellipsoid nose, length 0.9 x hub radius.'},
  {key:'body',kind:'face',label:'Hub body',drivenBy:['p-hub-radius','p-hub-length','p-blades'],note:'Cylinder; the blade roots are united into it.'},
  {key:'tail',kind:'face',label:'Hub tail cone',drivenBy:['p-hub-radius','p-hub-length'],note:'Cone, length 1.6 x hub radius.'},
] as const;

export function bladeFeatureId(blade: number, key: string) { return `blade-${blade + 1}.${key}`; }

export const FEATURES: readonly FeatureSpec[] = Object.freeze([
  ...HUB_FEATURES.map(f => ({id:`hub.${f.key}`,kind:f.kind,label:f.label,owner:'hub',drivenBy:f.drivenBy,note:f.note})),
  ...Array.from({length:MAX_BLADES}, (_, b) => BLADE_FEATURES.map(f => ({id:bladeFeatureId(b, f.key),kind:f.kind,label:`Blade ${b + 1} ${f.label.toLowerCase()}`,owner:`blade-${b + 1}`,drivenBy:f.drivenBy,note:f.note}))).flat(),
]);

/** Numeric face codes carried through the kernel as Manifold faceIDs. 0 is reserved. */
export const HUB_CODE: Record<string, number> = {nose: 1, body: 2, tail: 3};
export function bladeFaceCode(blade: number, key: 'upper-surface' | 'lower-surface' | 'tip-face' | 'root-face') {
  return 10 * (blade + 1) + ['upper-surface', 'lower-surface', 'tip-face', 'root-face'].indexOf(key) + 1;
}
export function featureIdForCode(code: number): string | null {
  for (const [key, value] of Object.entries(HUB_CODE)) if (value === code) return `hub.${key}`;
  const blade = Math.floor(code / 10) - 1, slot = code % 10 - 1;
  if (blade < 0 || blade >= MAX_BLADES || slot < 0 || slot > 3) return null;
  return bladeFeatureId(blade, ['upper-surface', 'lower-surface', 'tip-face', 'root-face'][slot]);
}
export function featureById(id: string) { return FEATURES.find(f => f.id === id); }
export function selectionOptions() {
  return [{value:'none',label:'Nothing selected'}, ...FEATURES.map(f => ({value:f.id,label:f.label}))];
}
