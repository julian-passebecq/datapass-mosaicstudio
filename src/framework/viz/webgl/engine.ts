/** Lazy WebGL engine for 3D marks (three.js). Loaded only through `import('./engine.ts')` from
 * the 3D React wrappers, so three.js never enters the viz core bundle.
 * Coordinates arrive normalised to [0,1]^3 and map onto a fixed world box. The engine renders on
 * demand (no animation loop): every state change renders synchronously, so a screenshot taken
 * after a virtual-clock step always sees a complete frame. OrbitControls run without damping,
 * which keeps pointer-driven orbits deterministic for capture.
 */
import {
  BoxGeometry,BufferAttribute,BufferGeometry,Color,DirectionalLight,DoubleSide,Group,HemisphereLight,InstancedMesh,LineBasicMaterial,LineSegments,
  Matrix4,Mesh,MeshStandardMaterial,NoToneMapping,PerspectiveCamera,PlaneGeometry,Points,Raycaster,Scene,ShaderMaterial,SRGBColorSpace,Vector2,Vector3,WebGLRenderer,
} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {DEFAULT_POSE,type Pose} from './pose.ts';
export type {Pose};

export type Kind='columns'|'surface'|'points';
/** Token colours resolved from CSS variables (#rrggbb). */
export type Theme3D={background:string;floor:string;grid:string;axis:string;ink:string;muted:string;accent:string;categorical:readonly string[];sequential:readonly string[]};
export type Label={id:string;text:string;at:readonly [number,number,number];kind?:'tick'|'title'|'value';anchor?:'start'|'middle'|'end'};
export type ColumnsState={rows:number;cols:number;heights:ArrayLike<number>;colors:readonly string[];emphasis:ArrayLike<number>;hover:number};
export type SurfaceState={nx:number;ny:number;z:ArrayLike<number>;colors:ArrayLike<number>;wireframe:boolean};
export type PointsState={x:ArrayLike<number>;y:ArrayLike<number>;z:ArrayLike<number>;rgba:Float32Array;order?:Uint32Array;size:number};
export interface Engine {
  readonly kind:Kind;readonly canvas:HTMLCanvasElement;
  resize(width:number,height:number,dpr:number):void;
  setTheme(theme:Theme3D):void;
  setPose(pose:Pose):void;getPose():Pose;
  setOrbit(enabled:boolean):void;
  setLabels(labels:readonly Label[]):void;
  setColumns(state:ColumnsState):void;setSurface(state:SurfaceState):void;setPoints(state:PointsState):void;
  /** Instance / grid vertex / point index under a client position, or -1. */
  pick(clientX:number,clientY:number):number;
  /** Client coordinates of a normalised point (for tests, lasso and tooltips). */
  toClient(at:readonly [number,number,number]):{x:number;y:number;visible:boolean};
  /** Canvas-relative CSS pixel positions of every point (points kind). */
  projectPoints():Float32Array;
  onCamera(listener:()=>void):()=>void;
  render():void;
  readonly frames:number;
  dispose():void;
}
/** World box: x across, z depth, y up. */
export const BOX=Object.freeze({w:10,d:6,h:4.2});
const TARGET=new Vector3(0,BOX.h*0.32,0);

const toWorld=(at:readonly [number,number,number],out=new Vector3())=>out.set((at[0]-0.5)*BOX.w,at[1]*BOX.h,(at[2]-0.5)*BOX.d);
function srgb(hex:string):[number,number,number]{const n=parseInt(hex.replace('#','').slice(0,6),16);return Number.isFinite(n)?[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]:[0.5,0.5,0.5];}

const POINT_VERTEX=`attribute vec4 rgba;uniform float size;uniform float scale;varying vec4 vColor;
void main(){vColor=rgba;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=max(1.0,size*scale/-mv.z);}`;
const POINT_FRAGMENT=`varying vec4 vColor;
void main(){vec2 c=gl_PointCoord-0.5;float d=dot(c,c);if(d>0.25)discard;gl_FragColor=vec4(vColor.rgb,vColor.a*smoothstep(0.25,0.14,d));}`;

export function createEngine(host:HTMLElement,kind:Kind):Engine{
  const canvas=document.createElement('canvas');
  canvas.className='viz3d-canvas';canvas.setAttribute('aria-hidden','true');
  const context=canvas.getContext('webgl2',{antialias:true,preserveDrawingBuffer:true,alpha:false})||canvas.getContext('webgl',{antialias:true,preserveDrawingBuffer:true,alpha:false});
  if(!context)throw new Error('WebGL is unavailable');
  const renderer=new WebGLRenderer({canvas,context:context as WebGL2RenderingContext,antialias:true,preserveDrawingBuffer:true});
  renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=NoToneMapping;
  const labelLayer=document.createElement('div');labelLayer.className='viz3d-labels';labelLayer.setAttribute('aria-hidden','true');
  host.append(canvas,labelLayer);
  const scene=new Scene(),camera=new PerspectiveCamera(30,1,0.1,200),controls=new OrbitControls(camera,canvas);
  controls.enableDamping=false;controls.enablePan=false;controls.enableZoom=false;controls.target.copy(TARGET);
  controls.minPolarAngle=0.12;controls.maxPolarAngle=Math.PI/2-0.04;
  const hemi=new HemisphereLight('#ffffff','#808080',1.6),sun=new DirectionalLight('#ffffff',1.7),fill=new DirectionalLight('#ffffff',0.55);
  sun.position.set(6,14,9);fill.position.set(-9,6,-4);scene.add(hemi,sun,fill);
  const frame=new Group();scene.add(frame);
  const owned:{dispose():void}[]=[];
  const own=<T extends {dispose():void}>(x:T)=>{owned.push(x);return x;};
  let theme:Theme3D|null=null,labels:readonly Label[]=[],frames=0,width=1,height=1;
  const listeners=new Set<()=>void>();
  const labelNodes=new Map<string,HTMLSpanElement>();

  /* ---- frame: floor, back walls, grid lines ---- */
  const floorMat=own(new MeshStandardMaterial({color:'#ffffff',roughness:1,metalness:0,side:DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
  const floor=new Mesh(own(new PlaneGeometry(BOX.w,BOX.d)),floorMat);floor.rotation.x=-Math.PI/2;frame.add(floor);
  const gridMat=own(new LineBasicMaterial({color:'#888888',transparent:true,opacity:1}));
  const gridGeo=own(new BufferGeometry());const grid=new LineSegments(gridGeo,gridMat);frame.add(grid);
  function buildGrid(xs:number[],zs:number[],ys:number[]){
    const v:number[]=[],p=new Vector3(),q=new Vector3(),seg=(a:[number,number,number],b:[number,number,number])=>{toWorld(a,p);toWorld(b,q);v.push(p.x,p.y,p.z,q.x,q.y,q.z);};
    for(const x of xs)seg([x,0,0],[x,0,1]);for(const z of zs)seg([0,0,z],[1,0,z]);
    for(const y of ys){seg([0,y,0],[1,y,0]);seg([0,y,0],[0,y,1]);}
    seg([0,0,0],[0,1,0]);seg([1,0,0],[1,1,0]);seg([0,0,1],[0,1,1]);
    gridGeo.setAttribute('position',new BufferAttribute(new Float32Array(v),3));gridGeo.computeBoundingSphere();
  }
  buildGrid([0,0.25,0.5,0.75,1],[0,0.5,1],[0.25,0.5,0.75,1]);

  /* ---- columns: one instanced box per cell ---- */
  let columns:InstancedMesh|null=null,columnShape={rows:0,cols:0};
  const columnMat=own(new MeshStandardMaterial({roughness:0.5,metalness:0.04}));
  const box=own(new BoxGeometry(1,1,1));box.translate(0,0.5,0);
  const m4=new Matrix4(),tmpColor=new Color(),bg=new Color(),hi=new Color();
  /* ---- surface ---- */
  let surface:Mesh|null=null,surfaceLines:LineSegments|null=null,surfaceShape={nx:0,ny:0};
  const surfaceMat=own(new MeshStandardMaterial({vertexColors:true,roughness:0.62,metalness:0.02,side:DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
  const lineMat=own(new LineBasicMaterial({vertexColors:true,transparent:true,opacity:0.55}));
  /* ---- points ---- */
  let points:Points|null=null,pointCount=0,pointOrder:Uint32Array|null=null,projected:Float32Array|null=null;
  const pointMat=own(new ShaderMaterial({vertexShader:POINT_VERTEX,fragmentShader:POINT_FRAGMENT,transparent:true,depthWrite:false,uniforms:{size:{value:3},scale:{value:60}}}));

  const ray=new Raycaster(),ndc=new Vector2();
  function toNdc(clientX:number,clientY:number){const r=canvas.getBoundingClientRect();ndc.set(((clientX-r.left)/r.width)*2-1,-((clientY-r.top)/r.height)*2+1);return r;}
  function setPose(pose:Pose){
    const el=Math.max(0.08,Math.min(Math.PI/2-0.05,pose.elevation)),d=Math.max(6,Math.min(60,pose.distance));
    camera.position.set(TARGET.x+d*Math.cos(el)*Math.sin(pose.azimuth),TARGET.y+d*Math.sin(el),TARGET.z+d*Math.cos(el)*Math.cos(pose.azimuth));
    camera.lookAt(TARGET);controls.update();
  }
  function getPose():Pose{
    const o=camera.position.clone().sub(TARGET),d=o.length();
    return {azimuth:Math.atan2(o.x,o.z),elevation:Math.asin(Math.max(-1,Math.min(1,o.y/d))),distance:d};
  }
  function toClient(at:readonly [number,number,number]){
    const p=toWorld(at).project(camera),r=canvas.getBoundingClientRect();
    return {x:r.left+(p.x+1)/2*r.width,y:r.top+(1-p.y)/2*r.height,visible:p.z>-1&&p.z<1};
  }
  function placeLabels(){
    const seen=new Set<string>(),p=new Vector3();
    for(const label of labels){
      seen.add(label.id);let node=labelNodes.get(label.id);
      if(!node){node=document.createElement('span');labelNodes.set(label.id,node);labelLayer.append(node);}
      if(node.textContent!==label.text)node.textContent=label.text;
      node.className='viz3d-label viz3d-'+(label.kind||'tick');
      toWorld(label.at,p).project(camera);
      const x=(p.x+1)/2*width,y=(1-p.y)/2*height,shift=label.anchor==='start'?'0%':label.anchor==='end'?'-100%':'-50%';
      node.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(${shift},-50%)`;
      node.style.visibility=p.z<1&&x>-40&&x<width+40&&y>-20&&y<height+20?'visible':'hidden';
    }
    for(const[id,node]of labelNodes)if(!seen.has(id)){node.remove();labelNodes.delete(id);}
  }
  function render(){renderer.render(scene,camera);placeLabels();frames++;}
  controls.addEventListener('change',()=>{projected=null;render();for(const l of [...listeners])l();});

  const engine:Engine={
    kind,canvas,
    get frames(){return frames;},
    resize(w,h,dpr){width=Math.max(1,w);height=Math.max(1,h);renderer.setPixelRatio(Math.max(1,Math.min(2,dpr)));renderer.setSize(width,height,false);canvas.style.width=width+'px';canvas.style.height=height+'px';camera.aspect=width/height;camera.updateProjectionMatrix();pointMat.uniforms.scale!.value=height*renderer.getPixelRatio()/22;projected=null;render();},
    setTheme(next){
      theme=next;renderer.setClearColor(next.background,1);bg.set(next.background);
      floorMat.color.set(next.floor);gridMat.color.set(next.grid);
      hemi.groundColor.set(next.background);render();
    },
    setPose(p){setPose(p);projected=null;render();},getPose,
    setOrbit(enabled){controls.enabled=enabled;canvas.style.cursor=enabled?'grab':'crosshair';},
    setLabels(next){labels=next;placeLabels();},
    setColumns(s){
      const count=s.rows*s.cols;
      if(!columns||columnShape.rows!==s.rows||columnShape.cols!==s.cols){
        if(columns){frame.remove(columns);columns.dispose();}
        columns=new InstancedMesh(box,columnMat,count);columns.frustumCulled=false;columnShape={rows:s.rows,cols:s.cols};frame.add(columns);
      }
      const cw=BOX.w/s.cols,cd=BOX.d/s.rows,sx=cw*0.62,sz=cd*0.56,dim=theme?0.72:0;
      for(let r=0;r<s.rows;r++)for(let c=0;c<s.cols;c++){
        const i=r*s.cols+c,h=Math.max(0.002,(s.heights[i]||0)*BOX.h),e=s.emphasis[i]??1;
        m4.makeScale(sx,h,sz).setPosition(-BOX.w/2+cw*(c+0.5),0,-BOX.d/2+cd*(r+0.5));
        columns.setMatrixAt(i,m4);
        tmpColor.set(s.colors[i]||s.colors[r]||'#888888');
        if(e===0)tmpColor.lerp(bg,dim);
        if(i===s.hover)tmpColor.lerp(hi.set('#ffffff'),0.22);
        columns.setColorAt(i,tmpColor);
      }
      columns.instanceMatrix.needsUpdate=true;if(columns.instanceColor)columns.instanceColor.needsUpdate=true;
      columns.computeBoundingSphere();render();
    },
    setSurface(s){
      if(!surface||surfaceShape.nx!==s.nx||surfaceShape.ny!==s.ny){
        if(surface){frame.remove(surface);surface.geometry.dispose();}
        if(surfaceLines){frame.remove(surfaceLines);surfaceLines.geometry.dispose();}
        const geo=new BufferGeometry(),n=s.nx*s.ny,idx:number[]=[];
        geo.setAttribute('position',new BufferAttribute(new Float32Array(n*3),3));geo.setAttribute('color',new BufferAttribute(new Float32Array(n*3),3));
        for(let j=0;j<s.ny-1;j++)for(let i=0;i<s.nx-1;i++){const a=j*s.nx+i,b=a+1,c=a+s.nx,d=c+1;idx.push(a,c,b,b,c,d);}
        geo.setIndex(idx);surface=new Mesh(geo,surfaceMat);frame.add(surface);
        const lines=new BufferGeometry(),li:number[]=[];
        for(let j=0;j<s.ny;j++)for(let i=0;i<s.nx-1;i++){const a=j*s.nx+i;li.push(a,a+1);}
        for(let i=0;i<s.nx;i++)for(let j=0;j<s.ny-1;j++){const a=j*s.nx+i;li.push(a,a+s.nx);}
        lines.setAttribute('position',geo.getAttribute('position'));lines.setAttribute('color',new BufferAttribute(new Float32Array(n*3),3));lines.setIndex(li);
        surfaceLines=new LineSegments(lines,lineMat);frame.add(surfaceLines);surfaceShape={nx:s.nx,ny:s.ny};
      }
      const pos=surface.geometry.getAttribute('position') as BufferAttribute,col=surface.geometry.getAttribute('color') as BufferAttribute,lcol=surfaceLines!.geometry.getAttribute('color') as BufferAttribute,p=new Vector3();
      for(let j=0;j<s.ny;j++)for(let i=0;i<s.nx;i++){
        const k=j*s.nx+i;toWorld([i/(s.nx-1),Math.max(0,s.z[k]||0),j/(s.ny-1)],p);pos.setXYZ(k,p.x,p.y+0.025,p.z);
        tmpColor.setRGB(s.colors[k*3]!,s.colors[k*3+1]!,s.colors[k*3+2]!,SRGBColorSpace);col.setXYZ(k,tmpColor.r,tmpColor.g,tmpColor.b);
        if(s.wireframe)lcol.setXYZ(k,tmpColor.r,tmpColor.g,tmpColor.b);else{hi.set(theme?.ink||'#000000');lcol.setXYZ(k,hi.r,hi.g,hi.b);}
      }
      pos.needsUpdate=true;col.needsUpdate=true;lcol.needsUpdate=true;
      surface.geometry.computeVertexNormals();surface.geometry.computeBoundingSphere();surfaceLines!.geometry.computeBoundingSphere();
      surface.visible=!s.wireframe;lineMat.opacity=s.wireframe?0.95:0.14;render();
    },
    setPoints(s){
      const n=s.x.length;
      if(!points||pointCount!==n){
        if(points){frame.remove(points);points.geometry.dispose();}
        const geo=new BufferGeometry();geo.setAttribute('position',new BufferAttribute(new Float32Array(n*3),3));geo.setAttribute('rgba',new BufferAttribute(new Float32Array(n*4),4));
        points=new Points(geo,pointMat);points.frustumCulled=false;frame.add(points);pointCount=n;
      }
      const pos=points.geometry.getAttribute('position') as BufferAttribute,col=points.geometry.getAttribute('rgba') as BufferAttribute,pa=pos.array as Float32Array,ca=col.array as Float32Array;
      const order=s.order;
      for(let k=0;k<n;k++){
        const i=order?order[k]!:k;
        pa[k*3]=(s.x[i]!-0.5)*BOX.w;pa[k*3+1]=s.y[i]!*BOX.h;pa[k*3+2]=(s.z[i]!-0.5)*BOX.d;
        ca[k*4]=s.rgba[i*4]!;ca[k*4+1]=s.rgba[i*4+1]!;ca[k*4+2]=s.rgba[i*4+2]!;ca[k*4+3]=s.rgba[i*4+3]!;
      }
      pointOrder=order||null;pos.needsUpdate=true;col.needsUpdate=true;pointMat.uniforms.size!.value=s.size;projected=null;render();
    },
    pick(clientX,clientY){
      if(kind==='points'){
        const r=canvas.getBoundingClientRect(),px=clientX-r.left,py=clientY-r.top,pr=engine.projectPoints();let best=-1,bd=64;
        for(let i=0;i<pointCount;i++){const dx=pr[i*2]!-px,dy=pr[i*2+1]!-py,d=dx*dx+dy*dy;if(d<bd){bd=d;best=i;}}
        return best;
      }
      toNdc(clientX,clientY);ray.setFromCamera(ndc,camera);
      if(kind==='columns'&&columns){const hit=ray.intersectObject(columns,false)[0];return hit?.instanceId??-1;}
      if(kind==='surface'&&surface){
        const hit=ray.intersectObject(surface.visible?surface:surfaceLines!,false)[0];if(!hit)return -1;
        const i=Math.round((hit.point.x/BOX.w+0.5)*(surfaceShape.nx-1)),j=Math.round((hit.point.z/BOX.d+0.5)*(surfaceShape.ny-1));
        return Math.max(0,Math.min(surfaceShape.ny-1,j))*surfaceShape.nx+Math.max(0,Math.min(surfaceShape.nx-1,i));
      }
      return -1;
    },
    toClient,
    /** Point i (data order) → [x,y] canvas CSS px; NaN when behind the camera. Cached until the camera or data moves. */
    projectPoints(){
      if(projected&&projected.length===pointCount*2)return projected;
      const out=new Float32Array(pointCount*2);if(!points)return out;
      const pa=(points.geometry.getAttribute('position') as BufferAttribute).array as Float32Array;
      camera.updateMatrixWorld();const m=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).elements;
      for(let k=0;k<pointCount;k++){
        const x=pa[k*3]!,y=pa[k*3+1]!,z=pa[k*3+2]!,w=m[3]!*x+m[7]!*y+m[11]!*z+m[15]!,i=pointOrder?pointOrder[k]!:k;
        if(w<=0){out[i*2]=NaN;out[i*2+1]=NaN;continue;}
        out[i*2]=((m[0]!*x+m[4]!*y+m[8]!*z+m[12]!)/w+1)/2*width;out[i*2+1]=(1-(m[1]!*x+m[5]!*y+m[9]!*z+m[13]!)/w)/2*height;
      }
      return projected=out;
    },
    onCamera(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
    render,
    dispose(){
      controls.dispose();columns?.dispose();surface?.geometry.dispose();surfaceLines?.geometry.dispose();points?.geometry.dispose();
      for(const x of owned)x.dispose();renderer.dispose();canvas.remove();labelLayer.remove();listeners.clear();
    },
  };
  setPose(DEFAULT_POSE);
  return engine;
}
export {srgb};
