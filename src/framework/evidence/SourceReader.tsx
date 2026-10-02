import {createBrowserHost} from '../../core/host';
import {sourceLines, type SourceArtifact, type EvidenceRef} from './model';
import './source-reader.css';

export function SourceReader({sources, selected, onSelect, highlights = []}: {sources: readonly SourceArtifact[]; selected: string; onSelect(id: string): void; highlights?: readonly EvidenceRef[]}) {
  const artifact = sources.find(s => s.id === selected);
  return <section className="source-reader" aria-label="Read-only source excerpts">
    <header><label>Source file<select aria-label="Source file" value={selected} onChange={e => onSelect(e.target.value)}><option value="none">Choose an excerpt</option>{sources.map(s => <option key={s.id} value={s.id}>{s.path}</option>)}</select></label>
      {artifact && <button type="button" onClick={() => createBrowserHost().saveDownload(artifact.path.split('/').at(-1)!, new Blob([artifact.text], {type: 'text/plain;charset=utf-8'}))}>Download source text</button>}
    </header>
    {!artifact ? <div className="source-empty"><h3>Source-owned evidence</h3><p>{sources.length ? 'Select a supplied excerpt or follow an evidence link from the context panel.' : 'This scene has no source excerpts. A diagram does not prove implementation.'}</p></div> : <>
      <div className="source-file-title"><strong>{artifact.title}</strong><span>{artifact.language} / {artifact.provenance} / {sourceLines(artifact).length} lines</span></div>
      <div className="source-lines" tabIndex={0} aria-label={artifact.path + ' source text'}><ol>{sourceLines(artifact).map((line, index) => {
        const marked = highlights.some(ref => ref.artifact === artifact.id && index + 1 >= ref.start && index + 1 <= ref.end);
        return <li key={index} data-line={index + 1} data-highlight={marked}><span className="source-line-number" aria-hidden="true">{index + 1}</span><code>{line || ' '}</code></li>;
      })}</ol></div>
      <footer>{artifact.path} is a supplied excerpt, not a fetched repository file or an execution receipt. Text stays read-only.</footer>
    </>}
  </section>;
}
