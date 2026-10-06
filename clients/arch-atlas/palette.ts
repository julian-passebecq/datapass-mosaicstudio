import type {LayerRole,NodeKind} from './spec.ts';

/** One calm, matte, editorial palette for 3D, flat and isometric outputs. */
export const INK='#24333d',MUTED='#6a7a84',PAPER='#f4f1ea',LINE='#c9c2b4';
export const LAYER_TINT:Record<LayerRole,string>={
  storage:'#7fa9b5',data:'#8fb2a6',compute:'#a7b98f',serving:'#d2b071',experience:'#d39a7c',delivery:'#a99bc0',users:'#8e9fb2'
};
export const KIND_COLOR:Record<NodeKind,string>={
  lake:'#7fb0bb',warehouse:'#b9a58a',lakehouse:'#c99a78',eventhouse:'#8d9fb6',database:'#9aa5ad',artifact:'#e3d7bd',repo:'#8f9b7a',
  pipeline:'#9bb0b8',notebook:'#ece5d3',stream:'#79a9b8',producer:'#b98f74',"semantic-model":'#c9a65f',library:'#a88f6e',
  report:'#6f8796',dashboard:'#6f8796',api:'#c2b49a',queue:'#a1907a',identity:'#d0a948',"ci-runner":'#8f9eab',"static-host":'#7e8b95',
  browser:'#8597a6',users:'#c48e6e',device:'#97a39a',alert:'#d17d5e'
};
