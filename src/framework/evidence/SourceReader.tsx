import {useEffect, useRef, type ReactNode} from 'react';
import {createBrowserHost} from '../../core/host';
import {sourceLines, type SourceArtifact, type EvidenceRef} from './model';
import './source-reader.css';

/** Optional per-line presentation for an interactive reader. Text stays read-only; nothing is executed. */
export type SourceLineInfo = {disabled?: boolean; badge?: string; label?: string};
export type SourceReaderProps = {
  sources: readonly SourceArtifact[]; selected: string; onSelect(id: string): void; highlights?: readonly EvidenceRef[];
  /** When set, each line becomes a button; the callback receives the one-based line and the artifact id. */
  onLineClick?(line: number, artifact: string): void;
  /** One-based line marked `aria-current` and kept in view inside the reader (the page itself never scrolls). */
  currentLine?: number;
  /** Badge, accessible label or disabled state per line (one-based). */
  lineInfo?(line: number): SourceLineInfo | undefined;
  /** Custom rendering of a line's text, e.g. client syntax tokens. Must return React text/elements, never HTML. */
  renderLine?(text: string, line: number): ReactNode;
  /** Hide the file picker, download button and footer when the reader shows one fixed file. */
  compact?: boolean;
};

/** Scroll `container` (not the page) so the one-based `line` is visible. Returns false when the line is absent. */
export function scrollToSourceLine(container: HTMLElement, line: number, margin = 24): boolean {
  const row = container.querySelector<HTMLElement>(`li[data-line="${Math.trunc(line)}"]`);
  if (!row) return false;
  const top = row.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop, bottom = top + row.offsetHeight;
  if (top - margin < container.scrollTop) container.scrollTop = Math.max(0, top - margin);
  else if (bottom + margin > container.scrollTop + container.clientHeight) container.scrollTop = bottom + margin - container.clientHeight;
  return true;
}

export function SourceReader({sources, selected, onSelect, highlights = [], onLineClick, currentLine, lineInfo, renderLine, compact = false}: SourceReaderProps) {
  const artifact = sources.find(s => s.id === selected), scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {if (scroller.current && currentLine !== undefined) scrollToSourceLine(scroller.current, currentLine);}, [currentLine, artifact?.id]);
  return <section className="source-reader" data-compact={compact || undefined} aria-label="Read-only source excerpts">
    {!compact && <header><label>Source file<select aria-label="Source file" value={selected} onChange={e => onSelect(e.target.value)}><option value="none">Choose an excerpt</option>{sources.map(s => <option key={s.id} value={s.id}>{s.path}</option>)}</select></label>
      {artifact && <button type="button" onClick={() => createBrowserHost().saveDownload(artifact.path.split('/').at(-1)!, new Blob([artifact.text], {type: 'text/plain;charset=utf-8'}))}>Download source text</button>}
    </header>}
    {!artifact ? <div className="source-empty"><h3>Source-owned evidence</h3><p>{sources.length ? 'Select a supplied excerpt or follow an evidence link from the context panel.' : 'This scene has no source excerpts. A diagram does not prove implementation.'}</p></div> : <>
      {!compact && <div className="source-file-title"><strong>{artifact.title}</strong><span>{artifact.language} / {artifact.provenance} / {sourceLines(artifact).length} lines</span></div>}
      <div ref={scroller} className="source-lines" data-interactive={onLineClick ? true : undefined} tabIndex={0} aria-label={artifact.path + ' source text'}><ol>{sourceLines(artifact).map((line, index) => {
        const number = index + 1, info = lineInfo?.(number), current = number === currentLine;
        const marked = highlights.some(ref => ref.artifact === artifact.id && number >= ref.start && number <= ref.end);
        const body = <><span className="source-line-number" aria-hidden="true">{number}</span><code>{line ? (renderLine ? renderLine(line, number) : line) : ' '}</code>{info?.badge && <span className="source-line-badge" aria-hidden="true">{info.badge}</span>}</>;
        return <li key={index} data-line={number} data-highlight={marked} data-current={current || undefined} aria-current={!onLineClick && current ? 'step' : undefined}>
          {onLineClick ? <button type="button" className="source-line-button" disabled={info?.disabled} aria-current={current ? 'step' : undefined} aria-label={info?.label} onClick={() => onLineClick(number, artifact.id)}>{body}</button> : body}
        </li>;
      })}</ol></div>
      {!compact && <footer>{artifact.path} is a supplied excerpt, not a fetched repository file or an execution receipt. Text stays read-only.</footer>}
    </>}
  </section>;
}
