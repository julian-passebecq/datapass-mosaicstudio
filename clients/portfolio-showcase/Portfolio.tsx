/** Portfolio showcase: one editorial page. The "instrument strip" is drawn with the viz kit from
 * numbers read out of this repository at build time (stats.generated.ts). Theme is a view field
 * (auto follows the OS); motion runs on the viz motion clock (count-ups, bar transitions) and
 * settles at once under ?capture=1 or reduced motion.
 */
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {useRuntime,useSiteState} from '../../src/framework/ui';
import {VizRoot,Kpi,BarChart,useCountUp,settledAttr,type TokenOverrides} from '../../src/framework/viz/index.ts';
import {STATS} from './stats.generated.ts';
import {PERSON,STAGES,WORK,type Work} from './content.ts';
import './portfolio.css';

const THEMES:{light:TokenOverrides;dark:TokenOverrides}={
  light:{canvas:'#f3f0e8',surface:'#faf8f3',surfaceRaised:'#ede9df',surfaceHover:'#e6e1d5',border:'#d9d3c5',borderStrong:'#c4bcab',ink:'#1b1a17',inkSecondary:'#3d3a33',inkMuted:'#6c675c',grid:'#e3ded2',axis:'#c4bcab',accent:'#c8402a',accentInk:'#ffffff',accentSubtle:'#f6e0d9',selection:'#c8402a',tooltip:'#faf8f3',tooltipInk:'#1b1a17',focus:'#1b1a17'},
  dark:{canvas:'#121110',surface:'#1a1917',surfaceRaised:'#22201d',surfaceHover:'#2a2824',border:'#2e2b27',borderStrong:'#45413a',ink:'#f2eee5',inkSecondary:'#d4cfc4',inkMuted:'#9c968a',grid:'#2a2723',axis:'#45413a',accent:'#ff6b4f',accentInk:'#140a07',accentSubtle:'#3a1a12',selection:'#ff6b4f',tooltip:'#22201d',tooltipInk:'#f2eee5',focus:'#f2eee5'},
};
const MODES=['auto','light','dark'] as const;type ThemeChoice=typeof MODES[number];
const SHORT:Record<string,string>={'operations-reference':'Ops','wind-reference':'Wind','architecture-reference':'Arch','experience-reference':'Exp','energy-replay-reference':'Replay','motion-reference':'Motion','foundation-reference':'Found','model-reference':'Model'};
const asset=(p:string)=>(import.meta.env?.BASE_URL??'./')+p;

function useSystemDark(){
  const q=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
  const [dark,setDark]=useState(!!q?.matches);
  useEffect(()=>{if(!q)return;const on=(e:MediaQueryListEvent)=>setDark(e.matches);q.addEventListener('change',on);return()=>q.removeEventListener('change',on);},[q]);
  return dark;
}

export function Portfolio(){
  const runtime=useRuntime(),snapshot=useSiteState(),system=useSystemDark();
  const choice=(MODES as readonly string[]).includes(String(snapshot.values['pf-theme']))?snapshot.values['pf-theme'] as ThemeChoice:'auto';
  const mode=choice==='auto'?(system?'dark':'light'):choice;
  useEffect(()=>{document.documentElement.style.colorScheme=mode;document.documentElement.style.background=THEMES[mode].canvas!;},[mode]);
  const next=MODES[(MODES.indexOf(choice)+1)%MODES.length]!;
  const go=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  return <VizRoot mode={mode} overrides={THEMES[mode]} className="pf" data-testid="portfolio" data-theme-mode={mode}>
    <header className="pf-top">
      <span className="pf-mark" aria-hidden="true">JP</span>
      <nav aria-label="Sections" className="pf-nav">
        {[['work','Work'],['framework','Framework'],['contact','Contact']].map(([id,label])=><button type="button" key={id} onClick={()=>go(id!)}>{label}</button>)}
      </nav>
      <button type="button" className="pf-theme" data-testid="theme-toggle" onClick={()=>runtime.applyCue({'pf-theme':next})} aria-label={`Theme: ${choice}. Switch to ${next}`}>
        <span aria-hidden="true" className="pf-theme-dot" data-mode={mode}/>{choice==='auto'?'Auto':choice==='light'?'Light':'Dark'}
      </button>
    </header>

    <section className="pf-intro" aria-labelledby="pf-name">
      <div className="pf-intro-name"><p className="pf-eyebrow">{PERSON.role}</p><h1 id="pf-name">{PERSON.name}</h1></div>
      <div className="pf-intro-text"><p className="pf-lede">{PERSON.lede}</p><p className="pf-aside">{PERSON.aside}</p></div>
    </section>

    <Instruments/>

    <section id="work" className="pf-section" aria-labelledby="pf-work">
      <SectionHead id="pf-work" n="§1" title="Selected work" note={`${WORK.length} projects · prototypes and reference clients, synthetic or illustrative data throughout`}/>
      <ol className="pf-grid">{WORK.map((w,i)=><Card key={w.id} w={w} index={i}/>)}</ol>
    </section>

    <section id="framework" className="pf-section" aria-labelledby="pf-fw">
      <SectionHead id="pf-fw" n="§2" title="The framework" note={`DataPass Studio · ${STATS.framework.files} source files, ${STATS.framework.lines.toLocaleString('en-US')} lines under src/framework`}/>
      <ol className="pf-strip" data-testid="architecture-strip">{STAGES.map(s=><li key={s.n}><span className="pf-strip-n">{s.n}</span><h3>{s.title}</h3><p>{s.text}</p></li>)}</ol>
      <p className="pf-fine">Web-first: React, d3, Mosaic and SQLRooms for the workbench, three.js only where a client asks for space. Each client is built on its own, so one client never ships another&apos;s code or data.</p>
    </section>

    <section id="contact" className="pf-section pf-contact" aria-labelledby="pf-contact">
      <SectionHead id="pf-contact" n="§3" title="Contact"/>
      <p className="pf-contact-line">{PERSON.name} <span aria-hidden="true">—</span> <span className="pf-mono">{PERSON.github}</span></p>
      <p className="pf-fine">Plain text on purpose: no form, no tracking, nothing sent from this page.</p>
    </section>

    <footer className="pf-foot">
      <span>Built with DataPass Studio · selected-client static build</span>
      <span>Stats generated from the repository on {STATS.tests.run?.date??STATS.git.lastCommit}</span>
    </footer>
  </VizRoot>;
}

function SectionHead({id,n,title,note}:{id:string;n:string;title:string;note?:string}){
  return <header className="pf-head"><span className="pf-head-n" aria-hidden="true">{n}</span><h2 id={id}>{title}</h2>{note&&<p>{note}</p>}</header>;
}

/** The one bold idea: the framework measuring itself, drawn with its own viz kit. */
function Instruments(){
  const run=STATS.tests.run,kb=(b:number)=>Math.round(b/102.4)/10;
  const refs=STATS.bundles.reference;
  const categories=useMemo(()=>refs.map(r=>({key:r.id,label:SHORT[r.id]??r.id})),[refs]);
  const series=useMemo(()=>[{key:'js',label:'Gzipped JS',color:'var(--dp-viz-accent)'}],[]);
  const value=useMemo(()=>{const m=new Map(refs.map(r=>[r.id,kb(r.gzipBytes)]));return (c:string)=>m.get(c)??0;},[refs]);
  const activity=STATS.git.activity.map(a=>a.commits);
  return <section className="pf-instruments" aria-labelledby="pf-inst" data-testid="instruments">
    <header className="pf-inst-head"><h2 id="pf-inst">Read from the repo</h2><p>Numbers observed from files, git, esbuild and a local test run when this site was built. Nothing typed by hand.</p></header>
    <div className="pf-inst-grid">
      <div className="pf-cell"><Kpi testId="kpi-clients" label="Clients in the repo" value={STATS.clients.count} format={{compact:false}}/><Note>{STATS.clients.ids.filter(i=>i.endsWith('-reference')).length} reference clients, plus this portfolio</Note></div>
      <div className="pf-cell"><Kpi testId="kpi-tests" label="Unit tests passing" value={run?.pass??STATS.tests.declared} format={{compact:false}}/><Note>{run?`of ${run.total} on the last local run (${run.platform}, ${run.date})`:`${STATS.tests.declared} declared in ${STATS.tests.files} files`}</Note></div>
      <div className="pf-cell"><Kpi testId="kpi-commits" label="Commits" value={STATS.git.commits} format={{compact:false}} spark={activity}/><Note>sparkline: commits per day, last 28 days</Note></div>
      <div className="pf-cell"><Kpi testId="kpi-prs" label="Pull requests" value={STATS.prs??0} format={{compact:false}}/><Note>{STATS.prs===null?'not available offline':'opened on the framework repository'}</Note></div>
      <div className="pf-cell pf-cell-wide"><Budget bytes={STATS.bundles.vizCoreGzipBytes} budget={STATS.bundles.vizCoreBudgetBytes}/></div>
      <div className="pf-cell pf-cell-chart">
        <p className="pf-cell-label">Emitted JavaScript per reference client <span>gzip KB</span></p>
        <div className="pf-bars"><BarChart testId="chart-bundles" categories={categories} series={series} value={value} mode="grouped" format={{digits:0,unit:'KB',compact:false}} label="Gzipped emitted JavaScript per reference client build, KB"/></div>
        <Note>CI baselines from the selected-client build gate</Note>
      </div>
    </div>
  </section>;
}
function Note({children}:{children:ReactNode}){return <p className="pf-note">{children}</p>;}

/** Viz core size against its budget, counted up on the motion clock. */
function Budget({bytes,budget}:{bytes:number;budget:number}){
  const shown=useCountUp(bytes),pct=Math.min(1,shown.value/budget);
  return <div className="pf-budget" data-testid="viz-budget" data-viz-settled={settledAttr(shown.settled)} data-value={bytes}>
    <p className="pf-cell-label">Viz kit core <span>min + gzip</span></p>
    <p className="pf-budget-value"><strong>{(shown.value/1024).toFixed(1)}</strong> KB <span>of {(budget/1024).toFixed(0)} KB budget</span></p>
    <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" className="pf-meter"><rect x="0" y="0" width="100" height="6" className="pf-meter-track"/><rect x="0" y="0" width={pct*100} height="6" className="pf-meter-fill"/></svg>
    <Note>{(budget-bytes).toLocaleString('en-US')} bytes of headroom · d3 modules only, no barrel import</Note>
  </div>;
}

function Card({w,index}:{w:Work;index:number}){
  return <li className="pf-card" data-testid={'work-'+w.id} data-kind={w.kind}>
    <figure className="pf-still">
      {w.image?<img src={asset(w.image.src)} alt={w.image.alt} loading={index<2?'eager':'lazy'} decoding="async" width={1120} height={700}/>:w.schematic==='diagram'?<DiagramSketch/>:<PrivateSketch/>}
    </figure>
    <div className="pf-card-body">
      <p className="pf-card-meta"><span>{String(index+1).padStart(2,'0')}</span><span>{w.kind}</span></p>
      <h3>{w.title}</h3>
      <p className="pf-card-text">{w.summary}</p>
      <p className="pf-card-tags">{w.tags.map(t=><span key={t}>{t}</span>)}<span className="pf-card-ref">{w.refs}</span></p>
    </div>
  </li>;
}
/** Schematic, not a screenshot: a parent diagram with one component opened into its child. */
function DiagramSketch(){
  return <svg viewBox="0 0 320 200" role="img" aria-label="Schematic: a parent architecture diagram with one component opened into a child diagram below it" className="pf-sketch">
    <g className="pf-sk-line"><path d="M70 46H130M190 46H250M160 62V100"/><path d="M60 140H110M210 140H260" strokeDasharray="3 3"/></g>
    <g className="pf-sk-box"><rect x="20" y="30" width="50" height="32" rx="4"/><rect x="250" y="30" width="50" height="32" rx="4"/><rect x="20" y="124" width="40" height="32" rx="4"/><rect x="260" y="124" width="40" height="32" rx="4"/></g>
    <rect x="130" y="30" width="60" height="32" rx="4" className="pf-sk-hot"/>
    <rect x="110" y="100" width="100" height="80" rx="6" className="pf-sk-frame"/>
    <g className="pf-sk-box"><rect x="122" y="114" width="34" height="22" rx="3"/><rect x="164" y="114" width="34" height="22" rx="3"/><rect x="122" y="146" width="76" height="22" rx="3"/></g>
    <text x="160" y="196" textAnchor="middle" className="pf-sk-caption">schematic</text>
  </svg>;
}
function PrivateSketch(){
  return <div className="pf-private" role="img" aria-label="No image: private client work"><span>private</span><span>no data · no images</span></div>;
}
