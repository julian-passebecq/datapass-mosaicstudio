import {useId, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import './workspace.css';

export type WorkspaceTab = {id: string; label: string};
export type WorkspaceShellProps = {
  title: string;
  rail?: ReactNode;
  sidebar?: ReactNode;
  sidebarLabel?: string;
  inspector?: ReactNode;
  inspectorLabel?: string;
  tabs: readonly WorkspaceTab[];
  activeTab: string;
  onTab(id: string): void;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

/** Optional compositional shell. No file system, editor, execution engine or data store. */
export function WorkspaceShell({title, rail, sidebar, sidebarLabel = 'Objects', inspector, inspectorLabel = 'Context', tabs, activeTab, onTab, status, actions, children}: WorkspaceShellProps) {
  const uid = useId(), buttons = useRef(new Map<string, HTMLButtonElement>());
  const [left, setLeft] = useState(() => typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches), [right, setRight] = useState(true);
  if (!tabs.length || new Set(tabs.map(t => t.id)).size !== tabs.length || !tabs.some(t => t.id === activeTab)) throw new Error('Workspace tabs require unique IDs and a valid active tab');
  const columns = [(sidebar && left) ? '176px' : '', 'minmax(0,1fr)', (inspector && right) ? '260px' : ''].filter(Boolean).join(' ');
  function activate(index: number) {const tab = tabs[(index + tabs.length) % tabs.length]; onTab(tab.id); buttons.current.get(tab.id)?.focus();}
  return <section className="studio-workspace" aria-label={title}>
    <header className="workspace-heading"><strong>{title}</strong><span className="workspace-spacer"/>{actions}
      {sidebar && <button type="button" aria-expanded={left} aria-controls={uid + '-outline'} onClick={() => setLeft(v => !v)}>{left ? 'Hide objects' : 'Show objects'}</button>}
      {inspector && <button type="button" aria-expanded={right} aria-controls={uid + '-inspector'} onClick={() => setRight(v => !v)}>{right ? 'Hide context' : 'Show context'}</button>}
    </header>
    <div className={'workspace-frame' + (rail ? ' has-rail' : '')}>
      {rail && <div className="workspace-rail">{rail}</div>}
      <div className="workspace-columns" data-inspector={!!inspector && right} style={{'--workspace-columns': columns} as CSSProperties}>
        {sidebar && <aside hidden={!left} id={uid + '-outline'} className="workspace-sidebar" aria-label={sidebarLabel}>{sidebar}</aside>}
        <div className="workspace-center">
          <div className="workspace-tabs" role="tablist" aria-label={title + ' views'}>{tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={uid + '-tab-' + tab.id} aria-selected={tab.id === activeTab} aria-controls={uid + '-panel'} tabIndex={tab.id === activeTab ? 0 : -1} ref={el => {if (el) buttons.current.set(tab.id, el); else buttons.current.delete(tab.id);}} onClick={() => onTab(tab.id)} onKeyDown={e => {
            if (e.key === 'ArrowRight') {e.preventDefault(); activate(index + 1);}
            else if (e.key === 'ArrowLeft') {e.preventDefault(); activate(index - 1);}
            else if (e.key === 'Home') {e.preventDefault(); activate(0);}
            else if (e.key === 'End') {e.preventDefault(); activate(tabs.length - 1);}
          }}>{tab.label}</button>)}</div>
          <div id={uid + '-panel'} className="workspace-panel-content" role="tabpanel" aria-labelledby={uid + '-tab-' + activeTab} tabIndex={0}>{children}</div>
        </div>
        {inspector && <aside hidden={!right} id={uid + '-inspector'} className="workspace-inspector" aria-label={inspectorLabel}>{inspector}</aside>}
      </div>
    </div>
    {status && <footer className="workspace-status">{status}</footer>}
  </section>;
}
