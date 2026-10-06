import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inspectGlb} from '../src/framework/model-assets/glb.ts';
const file=process.argv[2];
if(!file||process.argv.length!==3)throw new Error('Usage: npm run model:inspect -- path/to/model.glb');
const bytes=await readFile(file),result=inspectGlb(bytes);
console.log(JSON.stringify({profile:'datapass.static-glb.v1',byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),vertices:result.vertices,triangles:result.triangles,nodes:result.document.nodes.map((node,index)=>({index,name:node.name??null,parent:result.parents[index],mesh:node.mesh??null,children:node.children??[]})),note:'Map semantic parts explicitly by node index. This inspection does not establish units, engineering accuracy or asset rights.'},null,2));
