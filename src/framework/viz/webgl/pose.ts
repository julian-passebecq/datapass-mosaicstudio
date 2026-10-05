/** Camera poses for the 3D marks (no three.js import: safe for the main chunk). */
export type Pose={azimuth:number;elevation:number;distance:number};
export const DEFAULT_POSE:Readonly<Pose>=Object.freeze({azimuth:0.62,elevation:0.48,distance:19});
/** Shortest-path interpolation between two poses (azimuth wraps). */
export function mixPose(a:Pose,b:Pose,t:number):Pose{
  let da=b.azimuth-a.azimuth;while(da>Math.PI)da-=2*Math.PI;while(da<-Math.PI)da+=2*Math.PI;
  return {azimuth:a.azimuth+da*t,elevation:a.elevation+(b.elevation-a.elevation)*t,distance:a.distance+(b.distance-a.distance)*t};
}
/** Pose along a keyframe path at progress t in [0,1]; keyframes are evenly spaced in time. */
export function poseAt(keys:readonly Pose[],t:number):Pose{
  if(!keys.length)return {...DEFAULT_POSE};
  if(keys.length===1||t<=0)return {...keys[0]!};
  if(t>=1)return {...keys[keys.length-1]!};
  const span=t*(keys.length-1),i=Math.floor(span);return mixPose(keys[i]!,keys[i+1]!,span-i);
}
/** A product orbit that stays in the front quadrant (axis labels stay readable): swing right
 * and low, rise to a top-down read, swing back, settle on the default view. */
export const TOUR:readonly Pose[]=Object.freeze([
  DEFAULT_POSE,{azimuth:1.2,elevation:0.28,distance:17.5},{azimuth:0.18,elevation:0.78,distance:20.5},{azimuth:0.95,elevation:0.4,distance:18},DEFAULT_POSE,
]);
