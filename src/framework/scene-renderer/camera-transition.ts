import type {Vec3} from '../scene.ts';
export type CameraPose={position:Vec3;target:Vec3};
/** A finite transition sampled by the existing renderer loop, not another clock.
 * Pose/data updates may request the same camera repeatedly without restarting it.
 */
export class CameraTransition{
  private targetId:string;
  private tween:{from:CameraPose;to:CameraPose;start:number;duration:number}|null=null;
  constructor(initialId:string){this.targetId=initialId;}
  get active(){return this.tween!==null;}
  request(id:string,current:CameraPose,target:CameraPose,now:number,immediate=false){
    if(!Number.isFinite(now))throw new Error('Invalid camera timestamp');
    if(id!==this.targetId){this.targetId=id;this.tween={from:structuredClone(current),to:structuredClone(target),start:now,duration:immediate?0:420};}
    else if(immediate&&this.tween)this.tween.duration=0;
  }
  at(now:number):CameraPose|null{
    if(!Number.isFinite(now))throw new Error('Invalid camera timestamp');
    const tween=this.tween;if(!tween)return null;
    const raw=tween.duration?Math.max(0,Math.min(1,(now-tween.start)/tween.duration)):1,t=raw*raw*(3-2*raw);
    const blend=(a:Vec3,b:Vec3)=>a.map((v,i)=>v+(b[i]-v)*t) as Vec3;
    const result={position:blend(tween.from.position,tween.to.position),target:blend(tween.from.target,tween.to.target)};
    if(raw===1)this.tween=null;
    return result;
  }
  cancel(){this.tween=null;}
  reset(id:string){this.targetId=id;this.tween=null;}
}
