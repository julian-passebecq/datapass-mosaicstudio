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
/** A slow product orbit: sweep around the chart and dip, then settle back to the default view. */
export const TOUR:readonly Pose[]=Object.freeze([
  DEFAULT_POSE,{azimuth:1.35,elevation:0.36,distance:18},{azimuth:2.1,elevation:0.66,distance:20},{azimuth:-0.4,elevation:0.42,distance:18.5},DEFAULT_POSE,
]);
