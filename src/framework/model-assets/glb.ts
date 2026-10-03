import {strict, text} from '../guards.ts';
import {boundedJson, integerRange} from '../foundation/safety.ts';
import {MODEL_LIMITS as L, modelVector, type ModelSpec} from './model.ts';

// An intentionally narrow import profile, NOT a general glTF validator or decoder.
export type GlbNode={name?:string;mesh?:number;children?:number[];translation?:[number,number,number];rotation?:[number,number,number,number];scale?:[number,number,number]};
type BufferView={buffer:number;byteOffset?:number;byteLength:number;byteStride?:number;target?:number};
type Accessor={bufferView:number;byteOffset?:number;componentType:number;count:number;type:'SCALAR'|'VEC3';min?:number[];max?:number[]};
type Primitive={attributes:{POSITION:number;NORMAL?:number};indices?:number;material?:number;mode?:number};
export type GlbDocument={asset:{version:'2.0';generator?:string;copyright?:string};scene?:number;scenes:{nodes:number[];name?:string}[];nodes:GlbNode[];buffers:{byteLength:number}[];bufferViews:BufferView[];accessors:Accessor[];meshes:{primitives:Primitive[];name?:string}[];materials?:Record<string,unknown>[]};
export type InspectedGlb={document:GlbDocument;binary:Uint8Array;parents:number[];vertices:number;triangles:number};
function index(value:unknown,length:number,label:string):asserts value is number {integerRange(value,0,length-1,label);}
function array(value:unknown,max:number,label:string,min=0):asserts value is unknown[]{if(!Array.isArray(value)||value.length<min||value.length>max)throw new Error('GLB '+label+' budget');}
function optionalName(value:Record<string,unknown>){if(value.name!==undefined)text(value.name,'GLB name',200,false);}
function finiteList(value:unknown,count:number,min:number,max:number,label:string):asserts value is number[]{if(!Array.isArray(value)||value.length!==count||value.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<min||n>max))throw new Error('Invalid GLB '+label);}
export function inspectGlb(bytes:Uint8Array):InspectedGlb {
  if(bytes.byteLength<28||bytes.byteLength>L.bytes)throw new Error('GLB byte budget');
  const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==bytes.byteLength)throw new Error('Invalid GLB header or length');
  let offset=12,json:unknown,binary:Uint8Array|undefined;
  while(offset<bytes.length){
    if(offset+8>bytes.length)throw new Error('Truncated GLB chunk');
    const length=header.getUint32(offset,true),type=header.getUint32(offset+4,true);offset+=8;
    if(length%4||offset+length>bytes.length)throw new Error('Invalid GLB chunk length');
    const chunk=bytes.subarray(offset,offset+length);
    if(type===0x4e4f534a&&offset===20&&json===undefined){if(length>L.jsonBytes)throw new Error('GLB JSON budget');json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(chunk));}
    else if(type===0x004e4942&&json!==undefined&&!binary)binary=chunk;
    else throw new Error('Unsupported or repeated GLB chunk');
    offset+=length;
  }
  if(!json||!binary)throw new Error('GLB needs JSON and one embedded binary chunk');
  boundedJson(json,L.jsonBytes);
  strict(json,['asset','scene','scenes','nodes','buffers','bufferViews','accessors','meshes','materials'],'static GLB root');
  strict(json.asset,['version','generator','copyright'],'GLB asset');if(json.asset.version!=='2.0')throw new Error('Only GLB 2.0 is supported');
  for(const key of ['generator','copyright'])if(json.asset[key]!==undefined)text(json.asset[key],'GLB '+key,1000,false);
  array(json.buffers,1,'buffers',1);strict(json.buffers[0],['byteLength'],'embedded GLB buffer');
  integerRange(json.buffers[0].byteLength,1,binary.length,'GLB buffer size');
  if(binary.length-json.buffers[0].byteLength>3)throw new Error('Unexpected GLB binary padding');
  array(json.bufferViews,1024,'buffer views',1);array(json.accessors,1024,'accessors',1);array(json.meshes,L.meshes,'meshes',1);array(json.nodes,L.nodes,'nodes',1);array(json.scenes,1,'scenes',1);
  if(json.scene!==undefined&&json.scene!==0)throw new Error('Only a single GLB scene is supported');
  for(const raw of json.bufferViews){
    strict(raw,['buffer','byteOffset','byteLength','byteStride','target'],'GLB buffer view');if(raw.buffer!==0)throw new Error('External GLB buffer refused');
    integerRange(raw.byteOffset??0,0,binary.length,'buffer offset');integerRange(raw.byteLength,1,binary.length,'view length');
    if(Number(raw.byteOffset??0)+raw.byteLength>json.buffers[0].byteLength)throw new Error('GLB view exceeds binary buffer');
    if(raw.byteStride!==undefined){integerRange(raw.byteStride,4,252,'stride');if(raw.byteStride%4)throw new Error('Unaligned GLB stride');}
    if(raw.target!==undefined&&raw.target!==34962&&raw.target!==34963)throw new Error('Unknown GLB buffer target');
  }
  const views=json.bufferViews as BufferView[], accessors=json.accessors as Accessor[];
  const accessorValues:number[][]=[];let decodedElements=0;const binaryView=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
  for(const raw of json.accessors){
    strict(raw,['bufferView','byteOffset','componentType','count','type','min','max'],'static GLB accessor');index(raw.bufferView,views.length,'accessor buffer');
    integerRange(raw.count,1,L.vertices*3,'accessor count');integerRange(raw.byteOffset??0,0,binary.length,'accessor offset');
    if(raw.type!=='SCALAR'&&raw.type!=='VEC3')throw new Error('Unsupported static GLB accessor type');
    if(raw.type==='VEC3'?raw.componentType!==5126:![5121,5123,5125].includes(Number(raw.componentType)))throw new Error('Unsupported accessor component');
    const width=raw.type==='VEC3'?3:1,component=raw.componentType===5121?1:raw.componentType===5123?2:4;
    const view=views[raw.bufferView],start=(view.byteOffset??0)+Number(raw.byteOffset??0),stride=view.byteStride??width*component;
    if(start%component||stride<width*component||Number(raw.byteOffset??0)+(raw.count-1)*stride+width*component>view.byteLength)throw new Error('GLB accessor out of bounds/alignment');
    if(raw.type==='SCALAR'&&view.byteStride!==undefined)throw new Error('Strided indices are not supported');
    decodedElements+=raw.count*width;if(decodedElements>2000000)throw new Error('GLB decoded accessor budget');
    const values:number[]=[];
    for(let i=0;i<raw.count;i++)for(let c=0;c<width;c++){
      const at=start+i*stride+c*component;
      const n=raw.type==='VEC3'?binaryView.getFloat32(at,true):component===1?binary[at]:component===2?binaryView.getUint16(at,true):binaryView.getUint32(at,true);
      if(!Number.isFinite(n)||(raw.type==='VEC3'&&Math.abs(n)>10000))throw new Error('Non-finite or excessive GLB coordinate');values.push(n);
    }
    for(const k of ['min','max'])if(raw[k]!==undefined)finiteList(raw[k],width,-10000,raw.type==='SCALAR'?L.vertices:10000,'accessor bounds');
    // Bounding metadata drives culling in Three; validate it against the actual bytes.
    if(raw.type==='VEC3'&&(raw.min!==undefined||raw.max!==undefined)){
      for(let axis=0;axis<3;axis++){let lo=Infinity,hi=-Infinity;for(let i=axis;i<values.length;i+=3){lo=Math.min(lo,values[i]);hi=Math.max(hi,values[i]);}
        if(raw.min!==undefined&&Math.abs((raw.min as number[])[axis]-lo)>1e-4||raw.max!==undefined&&Math.abs((raw.max as number[])[axis]-hi)>1e-4)throw new Error('GLB bounds disagree with geometry');}
    }
    accessorValues.push(values);
  }
  if(json.materials!==undefined){array(json.materials,L.materials,'materials');for(const material of json.materials){
    strict(material,['name','pbrMetallicRoughness','emissiveFactor','doubleSided','alphaMode'],'static GLB material');optionalName(material);
    if(material.alphaMode!==undefined&&material.alphaMode!=='OPAQUE')throw new Error('Only opaque materials are supported');
    if(material.doubleSided!==undefined&&typeof material.doubleSided!=='boolean')throw new Error('Invalid material sides');
    if(material.emissiveFactor!==undefined)finiteList(material.emissiveFactor,3,0,1,'emissive color');
    if(material.pbrMetallicRoughness!==undefined){const p=material.pbrMetallicRoughness;strict(p,['baseColorFactor','metallicFactor','roughnessFactor'],'static PBR material');if(p.baseColorFactor!==undefined){finiteList(p.baseColorFactor,4,0,1,'base color');if(p.baseColorFactor[3]!==1)throw new Error('Translucent assets are outside this profile');}for(const k of ['metallicFactor','roughnessFactor'])if(p[k]!==undefined&&(typeof p[k]!=='number'||p[k]<0||p[k]>1))throw new Error('Invalid PBR factor');}
  }}
  let vertices=0,triangles=0,primitives=0;
  for(const mesh of json.meshes){strict(mesh,['name','primitives'],'static GLB mesh');optionalName(mesh);array(mesh.primitives,L.primitives,'primitives',1);
    for(const p of mesh.primitives){strict(p,['attributes','indices','material','mode'],'static GLB primitive');strict(p.attributes,['POSITION','NORMAL'],'static GLB attributes');index(p.attributes.POSITION,accessors.length,'position accessor');const pos=accessors[p.attributes.POSITION];
      if(pos.type!=='VEC3'||!pos.min||!pos.max)throw new Error('Positions require VEC3 and verified bounds');
      if(p.mode!==undefined&&p.mode!==4)throw new Error('Only triangle meshes are supported');
      if(p.attributes.NORMAL!==undefined){index(p.attributes.NORMAL,accessors.length,'normal accessor');const n=accessors[p.attributes.NORMAL];if(n.type!=='VEC3'||n.count!==pos.count)throw new Error('Normal/position count mismatch');}
      if(p.material!==undefined)index(p.material,(json.materials as unknown[]|undefined)?.length??0,'material');
      let count=pos.count;if(p.indices!==undefined){index(p.indices,accessors.length,'indices');const a=accessors[p.indices];if(a.type!=='SCALAR')throw new Error('Indices must be scalar');if(accessorValues[p.indices].some(n=>n>=pos.count))throw new Error('Index exceeds vertices');count=a.count;}
      if(count%3)throw new Error('Triangle index count must be divisible by three');
      vertices+=pos.count;triangles+=count/3;primitives++;
    }
  }
  if(vertices>L.vertices||triangles>L.triangles||primitives>L.primitives)throw new Error('GLB geometry budget');
  const parents=Array.from({length:json.nodes.length},()=>-1);
  for(const [i,n] of json.nodes.entries()){
    strict(n,['name','mesh','children','translation','rotation','scale'],'static GLB node');optionalName(n);
    if(n.mesh!==undefined)index(n.mesh,json.meshes.length,'node mesh');
    if(n.translation!==undefined)modelVector(n.translation,'translation',100);
    if(n.scale!==undefined){finiteList(n.scale,3,.001,100,'scale');}
    if(n.rotation!==undefined){finiteList(n.rotation,4,-1,1,'quaternion');if(Math.abs(Math.hypot(...n.rotation)-1)>1e-4)throw new Error('GLB quaternion must be normalized');}
    if(n.children!==undefined){array(n.children,L.nodes,'children');for(const child of n.children){index(child,json.nodes.length,'child');if(child===i||parents[child]!==-1)throw new Error('GLB nodes must form a tree');parents[child]=i;}}
  }
  strict(json.scenes[0],['name','nodes'],'GLB scene');optionalName(json.scenes[0]);array(json.scenes[0].nodes,L.nodes,'root nodes',1);
  const visited=new Set<number>();
  const walk=(i:number,depth:number)=>{index(i,parents.length,'scene root');if(visited.has(i)||depth>12)throw new Error('GLB cycle, duplicate or excessive depth');visited.add(i);for(const child of (json.nodes as GlbNode[])[i].children??[])walk(child,depth+1);};
  for(const root of json.scenes[0].nodes){index(root,json.nodes.length,'root');if(parents[root]!==-1)throw new Error('GLB scene root has a parent');walk(root,0);}
  if(visited.size!==json.nodes.length)throw new Error('Detached GLB nodes are outside this profile');
  // Repeated mesh instances count toward rendered geometry budgets too.
  let renderedVertices=0,renderedTriangles=0;
  for(const node of json.nodes as GlbNode[])if(node.mesh!==undefined)for(const p of (json.meshes as {primitives:Primitive[]}[])[node.mesh].primitives){renderedVertices+=accessors[p.attributes.POSITION].count;renderedTriangles+=(p.indices===undefined?accessors[p.attributes.POSITION].count:accessors[p.indices].count)/3;}
  if(renderedVertices>L.vertices||renderedTriangles>L.triangles)throw new Error('Instanced GLB geometry budget');
  return {document:json as GlbDocument,binary,parents,vertices:renderedVertices,triangles:renderedTriangles};
}
export function validatePartBindings(spec:ModelSpec,asset:InspectedGlb):void {
  const nodes=asset.document.nodes,mapped=new Set(spec.parts.map(p=>p.node));
  for(const part of spec.parts){index(part.node,nodes.length,'part binding');let parent=asset.parents[part.node];while(parent!==-1){if(mapped.has(parent))throw new Error('Nested semantic part bindings are ambiguous');parent=asset.parents[parent];}
    const hasMesh=(i:number):boolean=>nodes[i].mesh!==undefined||(nodes[i].children??[]).some(hasMesh);if(!hasMesh(part.node))throw new Error('Part binding contains no geometry');}
  for(let i=0;i<nodes.length;i++)if(nodes[i].mesh!==undefined){let j=i;while(j!==-1&&!mapped.has(j))j=asset.parents[j];if(j===-1)throw new Error('Every mesh needs a semantic part owner');}
}
