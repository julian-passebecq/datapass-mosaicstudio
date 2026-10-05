import {useEffect,useRef} from 'react';
import {sourceLines,type SourceArtifact} from '../../evidence/model';
import type {EvidenceLink} from '../artifact';
import './lineage.css';

/**
 * Citation source panel: the cited file with the exact line range highlighted and scrolled into view.
 * Plain navigation over supplied, inert text (AGENTS rule 28): not a live repository or an execution receipt.
 */
export function SourcePanel({sources,focus,onClose}:{sources:readonly SourceArtifact[];focus:EvidenceLink|null;onClose?():void}){
  const source=focus?sources.find(s=>s.path===focus.path):undefined;
  const scroller=useRef<HTMLDivElement>(null);
  const lines=source?sourceLines(source):[];
  const outside=!!focus&&!!source&&focus.end>lines.length;
  useEffect(()=>{
    const box=scroller.current,first=box?.querySelector<HTMLElement>('li[data-highlight="true"]');
    if(box&&first)box.scrollTop=Math.max(0,first.offsetTop-box.clientHeight/3);
  },[source,focus?.start,focus?.end]);
  if(!focus)return <aside className="lineage-source" data-testid="source-panel" data-state="empty" aria-label="Citation source"><p>Select a value or an evidence chip to open the cited source lines.</p></aside>;
  const range=focus.start===focus.end?`line ${focus.start}`:`lines ${focus.start}-${focus.end}`;
  return <aside className="lineage-source" data-testid="source-panel" data-state={source?(outside?'outside':'open'):'missing'} data-path={focus.path} data-start={focus.start} data-end={focus.end} aria-label="Citation source">
    <header><div><strong>{focus.label}</strong><code>{focus.path} / {range}</code></div>{onClose?<button type="button" onClick={onClose} aria-label="Close source panel">Close</button>:null}</header>
    {!source?<p role="status">Source text for {focus.path} was not supplied with this page.</p>
      :<>{outside?<p role="alert">The cited range is outside this copy of the file ({lines.length} lines); it may be stale.</p>:null}
        <div className="lineage-source-lines" ref={scroller} tabIndex={0} aria-label={`${focus.path}, ${range} highlighted`}><ol>{lines.map((line,index)=>{
          const n=index+1,mark=n>=focus.start&&n<=focus.end;
          return <li key={n} data-line={n} data-highlight={mark} data-testid={mark?'source-line-highlight':undefined}><span aria-hidden="true">{n}</span><code>{line||' '}</code></li>;
        })}</ol></div></>}
    <footer>Supplied copy of {focus.path}, published beside the page. Read-only; it does not prove this code ran.</footer>
  </aside>;
}
