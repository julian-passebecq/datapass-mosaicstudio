import type * as THREE from 'three';
import type {SceneSpec,Vec3} from '../scene';
/** Owned content adapter. All GPU work stays in the shared demand-rendered viewport. */
export type SceneContent={
  root:THREE.Object3D;
  items:Map<string,THREE.Object3D>;
  meshes:THREE.Mesh[];
  geometries:Set<THREE.BufferGeometry>;
  materials:Set<THREE.Material>;
  anchors?:Map<string,{object:THREE.Object3D;position:Vec3}>;
  sectionBounds?:[number,number];
  dispose():void;
};
export type LoadedScene={scene:SceneSpec;content:SceneContent};
