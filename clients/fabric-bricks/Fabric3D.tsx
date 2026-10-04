import {useRuntime,useSiteState} from '../../src/framework/ui';
import SceneViewport from '../../src/framework/scene-renderer/SceneViewport';
import {cameraForSelection} from './fixture';
import {fabricScene} from './scene';

type Props={selectionField:string;cameraField:string;explodeField:string;levelField:string};

export default function Fabric3D({selectionField,cameraField,explodeField,levelField}:Props){
  const runtime=useRuntime(),snapshot=useSiteState();
  const selection=String(snapshot.values[selectionField]);
  const camera=String(snapshot.values[cameraField]);
  const explode=Number(snapshot.values[explodeField]);
  const onSelect=(id:string)=>runtime.applyCue({
    [selectionField]:id,
    [cameraField]:cameraForSelection(id),
    [levelField]:'detail'
  });
  return <div className="fabric-3d" data-testid="fabric-3d" data-selection={selection} data-camera={camera}>
    <SceneViewport
      scene={fabricScene}
      view={{selection,camera,explode,phase:0}}
      onSelect={onSelect}
      title="Provisional 3D assembly"
      fileName="fabric-bricks-provisional"
    />
  </div>;
}
