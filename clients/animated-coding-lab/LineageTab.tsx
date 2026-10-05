import {useEffect, useState} from 'react';
import {useArtifactSource} from '../../src/framework/foundation/ArtifactSource.tsx';
import {LineageExplorer} from '../../src/framework/foundation/lineage/LineageExplorer.tsx';
import {loadEvidenceSources} from '../../src/framework/foundation/lineage/sources.ts';
import type {SourceArtifact} from '../../src/framework/evidence/model.ts';

/** The trace artifact's declared chain: trace table -> artifact (run, producer, input hash) -> inputs -> cited lines. */
export function LineageTab() {
  const state = useArtifactSource({kind: 'static', id: 'coding-lab-trace'});
  const artifact = state.status === 'ready' ? state.result.artifact : null;
  const [sources, setSources] = useState<{sources: SourceArtifact[]; missing: string[]} | null>(null);
  useEffect(() => {
    if (!artifact) return;
    const abort = new AbortController();
    loadEvidenceSources(artifact, {base: document.baseURI, signal: abort.signal}).then(setSources, error => {if ((error as Error)?.name !== 'AbortError') setSources({sources: [], missing: [String((error as Error)?.message || error)]});});
    return () => abort.abort();
  }, [artifact]);
  if (state.status === 'error') return <div role="alert" data-testid="artifact-error" data-capture-state="error">Artifact unavailable. {state.message}</div>;
  if (!artifact || !sources) return <p role="status" data-testid="lineage-loading" data-capture-state="busy">Loading lineage...</p>;
  return <div data-capture-state="ready"><LineageExplorer artifact={artifact} sources={sources.sources} missing={sources.missing}/></div>;
}
