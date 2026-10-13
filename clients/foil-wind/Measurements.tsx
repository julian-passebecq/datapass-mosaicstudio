import {useSiteState} from '../../src/framework/ui.ts';
import {ArtifactSource} from '../../src/framework/foundation/ArtifactSource.tsx';

/** Shows the Python-written measurement buckets of the run slot chosen in the `measureRun` view field.
 * Choosing a run only changes which static artifact is fetched; nothing is recomputed. */
export function Measurements(){
  const {values}=useSiteState();
  const slot=String(values.measureRun??'run-1');
  return <div data-testid="foil-wind-measurements" data-slot={slot}>
    <ArtifactSource key={slot} id={'foil-wind-measurements-'+slot} show={['wind','power','table']}/>
  </div>;
}
