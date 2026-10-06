import {Component,Suspense,useEffect,useMemo,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import type {AppDefinition,SavedState} from './types';
import {SiteRuntime} from './runtime';
import {updateSiteMetadata} from './site-metadata';
import {RuntimeContext,NavigationContext} from './hooks';
import {RenderBlock,SharedStoryScope,SharedReplayScope,SharedMotionScope,SharedRunScope} from './registry';
import {createBrowserHost} from '../core/host';
import {LIMITS} from './validate';
import './site.css';
import './visual-theme.css';
export class SiteBoundary extends Component<{children:ReactNode},{error:string|null}>{
  state={error:null as string|null};
  static getDerivedStateFromError(e:Error){return {error:e.message};}
  componentDidCatch(e:Error){console.error('Studio site failed',e);}
  render(){return this.state.error?<div className="site-notice" role="alert"><h2>Site component unavailable</h2><p>{this.state.error}</p><button type="button" onClick={()=>this.setState({error:null})}>Retry component</button></div>:this.props.children;}
}
function Review({pending,onApply,onClose}:{pending:SavedState;onApply():void;onClose():void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current!;d.showModal();return()=>d.close();},[]);
  return <dialog ref={ref} className="site-review" onCancel={onClose}><h2>Review saved inputs</h2><p>This restores {Object.keys(pending.values).length} input/view values for <strong>{pending.appId}</strong> and opens <strong>{pending.page}</strong>. Data files and task results are not imported. No computation task is started.</p><div className="site-table-scroll"><table><thead><tr><th>Field</th><th>Saved value</th></tr></thead><tbody>{Object.entries(pending.values).map(([key,value])=><tr key={key}><th>{key}</th><td>{String(value)}</td></tr>)}</tbody></table></div><div><button type="button" onClick={onClose}>Cancel</button><button type="button" className="site-primary" onClick={onApply}>Apply saved inputs</button></div></dialog>;
}
/** Capture runs only (`?capture=1`, the deterministic-clock mode) may force the theme with
 * `&theme=light|dark`, so one client can be captured in both modes. Ignored otherwise. */
function captureTheme(definition:AppDefinition):AppDefinition{
  const q=new URLSearchParams(globalThis.location?.search),mode=q.get('theme'),capture=q.get('capture');
  if((capture!=='1'&&capture!=='true')||(mode!=='light'&&mode!=='dark'))return definition;
  return {...definition,manifest:{...definition.manifest,theme:{...definition.manifest.theme,mode}}};
}
export function StudioSite({definition}:{definition:AppDefinition}){
  const runtime=useMemo(()=>new SiteRuntime(captureTheme(definition)),[definition]),manifest=runtime.manifest;
  const [pageId,setPageId]=useState(()=>{const id=new URLSearchParams(location.search).get('page');return manifest.pages.some(p=>p.id===id)?id!:manifest.pages[0].id;});
  const [pending,setPending]=useState<SavedState|null>(null),[error,setError]=useState('');
  const file=useRef<HTMLInputElement>(null),heading=useRef<HTMLHeadingElement>(null),sessionMenu=useRef<HTMLDetailsElement>(null);
  function closeSession(){if(sessionMenu.current)sessionMenu.current.open=false;}
  const page=manifest.pages.find(p=>p.id===pageId)||manifest.pages[0];
  const stories=[...new Set(page.sections.flatMap(s=>s.blocks).filter(b=>b.type==='story-controls'||b.type==='story-figure').map(b=>(b as {resource:string}).resource))];
  useEffect(()=>()=>runtime.cancelAll(),[runtime]);
  useEffect(()=>{updateSiteMetadata(document,manifest,page.title);},[page.title,manifest]);
  useEffect(()=>{const pop=()=>{const id=new URLSearchParams(location.search).get('page');setPageId(manifest.pages.some(p=>p.id===id)?id!:manifest.pages[0].id);};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[manifest]);
  function navigate(id:string){if(!manifest.pages.some(p=>p.id===id))throw new Error('Unknown site page');const url=new URL(location.href);url.searchParams.set('page',id);history.pushState(null,'',url);setPageId(id);requestAnimationFrame(()=>heading.current?.focus());}
  function save(){createBrowserHost().saveDownload(manifest.id+'-inputs.json',new Blob([JSON.stringify(runtime.save(page.id),null,2)],{type:'application/json'}));}
  const replays=page.sections.flatMap(s=>s.blocks).filter((b):b is import('./replay/model').ReplayBlock=>b.type==='replay');
  const motions=page.sections.flatMap(s=>s.blocks).filter((b):b is import('./motion/model').MotionBlock=>b.type==='motion');
  const contents=<div className="site-sections">{page.sections.map(section=><section className="site-section" key={section.id} aria-label={section.title||section.id}>{section.title&&<h2 className="site-section-heading">{section.title}</h2>}<div className="site-grid" style={{'--site-columns':section.columns} as CSSProperties}>{section.blocks.map(block=><div className={'site-block site-block-'+block.type} key={block.id} data-block={block.id} style={{'--site-span':block.span||1} as CSSProperties}><SiteBoundary key={block.id}><Suspense fallback={<div className="site-loading" role="status">Loading {block.type}...</div>}><RenderBlock block={block}/></Suspense></SiteBoundary></div>)}</div></section>)}</div>;
  const motionContent=motions.length?<SharedMotionScope blocks={motions}>{contents}</SharedMotionScope>:contents;
  const replayContent=replays.length?<SharedReplayScope blocks={replays}>{motionContent}</SharedReplayScope>:motionContent;
  const runIds=[...new Set(manifest.pages.flatMap(p=>p.sections.flatMap(s=>s.blocks)).filter(b=>b.type==='runs').map(b=>(b as {resource:string}).resource))];
  const site=<NavigationContext.Provider value={navigate}><div className={'studio-site '+manifest.theme.density+' '+(manifest.theme.mode||'light')} style={{'--site-accent':manifest.theme.accent} as CSSProperties} data-app-id={manifest.id}><a className="site-skip" href="#site-main">Skip to content</a><header className="site-header"><a className="site-brand" href={'?app='+manifest.id}><span className="site-logo">dp</span><span><strong>{manifest.title}</strong><small>{manifest.label}</small></span></a><nav aria-label="Site pages">{manifest.pages.map(p=><button type="button" key={p.id} aria-current={page.id===p.id?'page':undefined} onClick={()=>navigate(p.id)}>{p.title}</button>)}</nav><details className="site-session" ref={sessionMenu} onKeyDown={e=>{if(e.key==='Escape')closeSession();}}><summary>Session</summary><div><p>Inputs remain in this tab. Export before closing. Saved JSON includes your input values; review before sharing.</p><button type="button" onClick={save}>Export inputs</button><button type="button" onClick={()=>{closeSession();file.current?.click();}}>Restore inputs</button><button type="button" onClick={()=>runtime.reset()}>Reset inputs</button></div></details></header>
    <main id="site-main"><header className="site-page-heading"><span className="site-kicker">{manifest.label}</span><h1 ref={heading} tabIndex={-1}>{page.title}</h1><p>{page.description}</p></header>{error&&<div className="site-notice error" role="alert">{error}<button type="button" onClick={()=>setError('')}>Dismiss</button></div>}<SiteBoundary key={page.id}><Suspense fallback={<div className="site-loading" role="status">Preparing the story...</div>}>{stories.length?<SharedStoryScope ids={stories}>{replayContent}</SharedStoryScope>:replayContent}</Suspense></SiteBoundary></main>
    <footer className="site-footer"><span>Built with DataPass Studio</span><span>{manifest.label} / v{manifest.version}</span><span>No automatic publishing</span></footer>
    <input ref={file} hidden type="file" accept=".json,application/json" aria-label="Restore saved site inputs" onChange={async e=>{closeSession();const selected=e.target.files?.[0];e.target.value='';if(!selected)return;try{if(selected.size>LIMITS.stateBytes)throw new Error('Saved inputs are limited to 64 KiB');setPending(runtime.review(await selected.text()));setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}}/>
    {pending&&<Review pending={pending} onClose={()=>setPending(null)} onApply={()=>{try{navigate(runtime.restore(pending));setPending(null);}catch(e){setError(String(e));}}}/>}
  </div></NavigationContext.Provider>;
  return <RuntimeContext.Provider value={runtime}><Suspense fallback={<div className="site-loading" role="status">Preparing result history...</div>}>{runIds.length?<SharedRunScope ids={runIds}>{site}</SharedRunScope>:site}</Suspense></RuntimeContext.Provider>;
}
