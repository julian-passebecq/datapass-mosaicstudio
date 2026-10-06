import {createHash} from 'node:crypto';

/** Original deterministic acceptance geometry. No external asset, dependency or decoder. */
export function syntheticModel() {
  const vertices=[],normals=[];
  const face=(a,b,c,d,n)=>{for(const p of [a,b,c,a,c,d]){vertices.push(...p);normals.push(...n);}};
  face([-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[0,0,1]);
  face([.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[0,0,-1]);
  face([-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-1,0,0]);
  face([.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[1,0,0]);
  face([-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5],[0,1,0]);
  face([-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[0,-1,0]);
  const positions=Buffer.from(new Float32Array(vertices).buffer),normalBytes=Buffer.from(new Float32Array(normals).buffer),binary=Buffer.concat([positions,normalBytes]);
  const doc={asset:{version:'2.0',generator:'DataPass synthetic static GLB fixture'},scene:0,scenes:[{nodes:[0]}],
    nodes:[
      {name:'assembly',children:[1,6,9,10,11]},
      {name:'frame',children:[2,3,4,5]},
      {name:'base',mesh:0,translation:[0,.25,0],scale:[6.5,.5,3]},
      {name:'left-support',mesh:0,translation:[-2.4,2,0],scale:[.3,3.4,.4]},
      {name:'right-support',mesh:0,translation:[2.4,2,0],scale:[.3,3.4,.4]},
      {name:'upper-rail',mesh:0,translation:[0,3.65,0],scale:[5.2,.22,.4]},
      {name:'carriage',translation:[0,2.8,.25],children:[7,8]},
      {name:'slider',mesh:1,scale:[3.8,.3,.6]},
      {name:'slider-attachment',mesh:1,translation:[0,.4,0],scale:[.4,.6,.4]},
      {name:'plate',mesh:2,translation:[0,4.25,.25],scale:[4.6,1.65,.18]},
      {name:'module',mesh:3,translation:[1.5,.85,.15],scale:[1.2,.7,1]},
      {name:'linkage',mesh:4,translation:[0,1.6,.25],scale:[.25,2.1,.3]}
    ],buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.length,target:34962},{buffer:0,byteOffset:positions.length,byteLength:normalBytes.length,target:34962}],
    accessors:[{bufferView:0,componentType:5126,count:36,type:'VEC3',min:[-.5,-.5,-.5],max:[.5,.5,.5]},{bufferView:1,componentType:5126,count:36,type:'VEC3'}],
    meshes:Array.from({length:5},(_,material)=>({primitives:[{attributes:{POSITION:0,NORMAL:1},material}]})),
    materials:[[.35,.43,.48,1],[.24,.57,.57,1],[.12,.5,.73,1],[.87,.62,.28,1],[.64,.56,.75,1]].map(baseColorFactor=>({pbrMetallicRoughness:{baseColorFactor,metallicFactor:.2,roughnessFactor:.45}}))};
  return {doc,binary,bytes:encodeGlb(doc,binary)};
}
export function encodeGlb(doc,binary) {
  let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const padded=Buffer.concat([Buffer.from(binary),Buffer.alloc((4-binary.length%4)%4)]),head=Buffer.alloc(20),binHeader=Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(28+json.length+padded.length,8);head.writeUInt32LE(json.length,12);head.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(padded.length,0);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([head,json,binHeader,padded]);
}
export function modelFixture(id,title) {
  const bytes=syntheticModel().bytes;
  const model={format:'datapass.model3d',version:1,title,note:'Synthetic plate assembly for viewer acceptance. This is not the actual Foil\'o device, a conventional turbine, a CAD measurement or a physical simulation.',provenance:'synthetic',credit:'Original DataPass acceptance geometry / CC0',
    asset:{path:`models/${id}/assembly.glb`,byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},
    parts:[
      {id:'frame',node:1,label:'Support frame',description:'Fixed reference structure containing four child meshes.',explode:[-2,0,-1.5],evidence:[]},
      {id:'carriage',node:6,label:'Carriage',description:'A two-mesh assembly controlled as one semantic part.',explode:[0,0,2],evidence:[]},
      {id:'plate',node:9,label:'Oscillating plate',description:'Illustrative plate, not a validated engineering profile.',explode:[0,1.5,.7],evidence:[{artifact:'design-note',start:2,end:3,label:'Read the geometry boundary'}]},
      {id:'module',node:10,label:'Conversion module',description:'Placeholder module without a scientific conversion model.',explode:[2,0,1],evidence:[]},
      {id:'linkage',node:11,label:'Linkage',description:'Illustrative link between subsystems; no mechanics is calculated.',explode:[-1.5,0,2],evidence:[]}
    ],
    annotations:[{part:'plate',label:'Plate',position:[0,.6,0]},{part:'module',label:'Module',position:[0,.65,0]},{part:'frame',label:'Frame',position:[-2.4,3.9,0]}],
    cameras:[{id:'overview',label:'Overview',position:[10,7.5,12],target:[0,2.5,0]},{id:'plate',label:'Plate focus',position:[3,5.5,8],target:[0,4,.25]},{id:'side',label:'Side',position:[11,4,1],target:[0,2.5,0]}],
    sources:[{id:'design-note',path:'assembly-notes.md',language:'markdown',title:'Geometry and semantics',text:'# Viewer acceptance\nThe plate is synthetic test geometry.\nIts appearance does not establish energy performance.\nOffsets are authored in the parent coordinate frame.',provenance:'synthetic'}]};
  return {bytes,model};
}
export function modelTemplate({id,title}) {
  const {bytes,model}=modelFixture(id,title);
  return {
    'model.ts':`import type {ModelSpec} from '../../src/framework/model-assets/model.ts';\nexport const model:ModelSpec=${JSON.stringify(model,null,2)};\n`,
    [`public/${model.asset.path}`]:bytes,
    'app.ts':`import {defineApp} from '../../src/framework/authoring.ts';\nimport {modelFields,modelBlock} from '../../src/framework/model-assets/index.ts';\nimport {model} from './model.ts';\nexport default defineApp({manifest:{format:'datapass.web-app',schemaVersion:1,id:${JSON.stringify(id)},version:'0.1.0',title:${JSON.stringify(title)},label:'Synthetic model acceptance',description:'A verified static asset, semantic parts and optional 3D.',theme:{accent:'#286f89',density:'compact'},fields:modelFields(model),datasets:[],tasks:[],pages:[{id:'overview',title:'Model explorer',description:'Inspect the outline first, then load approved geometry.',sections:[{id:'model',columns:1,blocks:[modelBlock('model','assembly')]}]}]},bindings:{},resources:{models:{assembly:model}}});\n`
  };
}
