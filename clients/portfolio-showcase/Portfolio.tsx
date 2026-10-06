/** Portfolio showcase: one page drawn like an engineering sheet (fine grid, title block, dimension
 * lines, mono readouts). The readout panel is drawn with the viz kit from numbers read out of this
 * repository at build time (stats.generated.ts). Theme is a view field (auto follows the OS): blueprint
 * ink on drafting film by day, phosphor on an instrument panel by night. Motion runs on the viz motion
 * clock and settles at once under ?capture=1 or reduced motion. Demo videos are click-to-play only.
 */
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useRuntime,useSiteState} from '../../src/framework/ui';
import {VizRoot,Kpi,BarChart,useCountUp,settledAttr,type TokenOverrides} from '../../src/framework/viz/index.ts';
import {STATS} from './stats.generated.ts';
import {PERSON,STAGES,WORK,type Work} from './content.ts';
import './portfolio.css';

const THEMES:{light:TokenOverrides;dark:TokenOverrides}={
  light:{canvas:'#eceee9',surface:'#f6f7f3',surfaceRaised:'#e2e5df',surfaceHover:'#dde1da',border:'#cdd2ca',borderStrong:'#a9b0a6',ink:'#0f1419',inkSecondary:'#2c343c',inkMuted:'#5d6670',grid:'#d6dad3',axis:'#a9b0a6',accent:'#2638e8',accentInk:'#ffffff',accentSubtle:'#dfe2fb',selection:'#2638e8',tooltip:'#f6f7f3',tooltipInk:'#0f1419',focus:'#2638e8'},
  dark:{canvas:'#0b0e11',surface:'#11161a',surfaceRaised:'#171d22',surfaceHover:'#1d242a',border:'#232b31',borderStrong:'#3a454d',ink:'#e4e9e2',inkSecondary:'#bcc4bd',inkMuted:'#87918b',grid:'#1c2328',axis:'#3a454d',accent:'#c5f04a',accentInk:'#0b0e11',accentSubtle:'#26310f',selection:'#c5f04a',tooltip:'#171d22',tooltipInk:'#e4e9e2',focus:'#c5f04a'},
};
const MODES=['auto','light','dark'] as const;type ThemeChoice=typeof MODES[number];
const SHORT:Record<string,string>={'operations-reference':'Ops','wind-reference':'Wind','architecture-reference':'Arch','experience-reference':'Exp','energy-replay-reference':'Replay','motion-reference':'Motion','foundation-reference':'Found','model-reference':'Model','portfolio-showcase':'Folio','animated-coding-lab':'Lab'};
const NAV=[['work','Work'],['readout','Readout'],['framework','System'],['contact','Contact']] as const;
const asset=(p:string)=>(import.meta.env?.BASE_URL??'./')+p;
const pad=(n:number)=>String(n).padStart(2,'0');
const clock=(s:number)=>`${Math.floor(s/60)}:${pad(s%60)}`;

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
  const date=STATS.tests.run?.date??STATS.git.lastCommit;
  return <VizRoot mode={mode} overrides={THEMES[mode]} className="pf" data-testid="portfolio" data-theme-mode={mode}>
    <div className="pf-sheet">
    <header className="pf-top">
      <span className="pf-mark"><span aria-hidden="true" className="pf-mark-box">JP</span><span className="pf-mark-name">Julian Passebecq</span></span>
      <nav aria-label="Sections" className="pf-nav">
        {NAV.map(([id,label],i)=><button type="button" key={id} onClick={()=>go(id)}><span aria-hidden="true">{pad(i+1)}</span>{label}</button>)}
      </nav>
      <button type="button" className="pf-theme" data-testid="theme-toggle" onClick={()=>runtime.applyCue({'pf-theme':next})} aria-label={`Theme: ${choice}. Switch to ${next}`}>
        <span aria-hidden="true" className="pf-theme-dot" data-mode={mode}/>{choice==='auto'?'Auto':choice==='light'?'Light':'Dark'}
      </button>
    </header>

    <section className="pf-intro" aria-labelledby="pf-name">
      <span className="pf-reg pf-reg-tl" aria-hidden="true"/><span className="pf-reg pf-reg-tr" aria-hidden="true"/>
      <p className="pf-eyebrow"><span>Fig. 00</span>{PERSON.role}</p>
      <h1 id="pf-name"><span>Julian</span> <span>Passebecq</span></h1>
      <div className="pf-dim" aria-hidden="true"><span>source</span><span>pipeline</span><span>model</span><span>app</span></div>
      <div className="pf-intro-row">
        <div className="pf-intro-text"><p className="pf-lede">{PERSON.lede}</p><p className="pf-aside">{PERSON.aside}</p></div>
        <dl className="pf-titleblock" aria-label="Sheet details">
          <div><dt>Drawn by</dt><dd>J. Passebecq</dd></div>
          <div><dt>Discipline</dt><dd>Data engineering</dd></div>
          <div><dt>Sheet</dt><dd>{pad(WORK.length)} works · 1 system</dd></div>
          <div><dt>Revision</dt><dd>{STATS.git.commits} commits</dd></div>
          <div><dt>Date</dt><dd>{date}</dd></div>
          <div><dt>Source</dt><dd>read from repo</dd></div>
        </dl>
      </div>
    </section>

    <section id="work" className="pf-section" aria-labelledby="pf-work">
      <SectionHead id="pf-work" n="01" title="Selected work" note={`${WORK.length} projects · prototypes and reference clients, synthetic or illustrative data throughout. Four have a short muted demo.`}/>
      <ol className="pf-grid">{WORK.map((w,i)=><Card key={w.id} w={w} index={i}/>)}</ol>
    </section>

    <Instruments/>

    <section id="framework" className="pf-section" aria-labelledby="pf-fw">
      <SectionHead id="pf-fw" n="03" title="The system" note={`DataPass Studio · ${STATS.framework.files} source files, ${STATS.framework.lines.toLocaleString('en-US')} lines under src/framework`}/>
      <ol className="pf-strip" data-testid="architecture-strip">{STAGES.map(s=><li key={s.n}><span className="pf-strip-node" aria-hidden="true"/><span className="pf-strip-n">{s.n}</span><h3>{s.title}</h3><p>{s.text}</p></li>)}</ol>
      <p className="pf-fine">Web-first: React, d3, Mosaic and SQLRooms for the workbench, three.js only where a client asks for space. Each client is built on its own, so one client never ships another&apos;s code or data.</p>
    </section>

    <section id="contact" className="pf-section pf-contact" aria-labelledby="pf-contact">
      <SectionHead id="pf-contact" n="04" title="Contact"/>
      <p className="pf-contact-line"><span className="pf-contact-k">github</span><span className="pf-contact-v">{PERSON.github}</span></p>
      <p className="pf-fine">Plain text on purpose: no form, no tracking, nothing sent from this page.</p>
    </section>

    <footer className="pf-foot">
      <span>Built with DataPass Studio · selected-client static build</span>
      <span>Stats generated from the repository on {date}</span>
    </footer>
    </div>
  </VizRoot>;
}

function SectionHead({id,n,title,note}:{id:string;n:string;title:string;note?:string}){
  return <header className="pf-head"><span className="pf-head-n" aria-hidden="true">{n}</span><h2 id={id}>{title}</h2>{note&&<p>{note}</p>}</header>;
}

/** The framework measuring itself, drawn with its own viz kit. */
function Instruments(){
  const run=STATS.tests.run,kb=(b:number)=>Math.round(b/102.4)/10;
  const refs=STATS.bundles.reference;
  const categories=useMemo(()=>refs.map(r=>({key:r.id,label:SHORT[r.id]??r.id})),[refs]);
  const series=useMemo(()=>[{key:'js',label:'Gzipped JS',color:'var(--dp-viz-accent)'}],[]);
  const value=useMemo(()=>{const m=new Map(refs.map(r=>[r.id,kb(r.gzipBytes)]));return (c:string)=>m.get(c)??0;},[refs]);
  const activity=STATS.git.activity.map(a=>a.commits);
  return <section id="readout" className="pf-section" aria-labelledby="pf-inst">
    <SectionHead id="pf-inst" n="02" title="Read from the repo" note="Numbers observed from files, git, esbuild and a local test run when this site was built. Nothing typed by hand."/>
    <div className="pf-instruments" data-testid="instruments">
      <span className="pf-corner" aria-hidden="true"/><span className="pf-corner" aria-hidden="true"/><span className="pf-corner" aria-hidden="true"/><span className="pf-corner" aria-hidden="true"/>
      <div className="pf-inst-grid">
        <div className="pf-cell"><span className="pf-ch" aria-hidden="true">CH.1</span><Kpi testId="kpi-clients" label="Clients in the repo" value={STATS.clients.count} format={{compact:false}}/><Note>{STATS.clients.ids.filter(i=>i.endsWith('-reference')).length} reference clients, plus this portfolio</Note></div>
        <div className="pf-cell"><span className="pf-ch" aria-hidden="true">CH.2</span><Kpi testId="kpi-tests" label="Unit tests passing" value={run?.pass??STATS.tests.declared} format={{compact:false}}/><Note>{run?`of ${run.total} on the last local run (${run.platform}, ${run.date})`:`${STATS.tests.declared} declared in ${STATS.tests.files} files`}</Note></div>
        <div className="pf-cell"><span className="pf-ch" aria-hidden="true">CH.3</span><Kpi testId="kpi-commits" label="Commits" value={STATS.git.commits} format={{compact:false}} spark={activity}/><Note>trace: commits per day, last 28 days</Note></div>
        <div className="pf-cell"><span className="pf-ch" aria-hidden="true">CH.4</span><Kpi testId="kpi-prs" label="Pull requests" value={STATS.prs??0} format={{compact:false}}/><Note>{STATS.prs===null?'not available offline':'opened on the framework repository'}</Note></div>
        <div className="pf-cell pf-cell-wide"><Budget bytes={STATS.bundles.vizCoreGzipBytes} budget={STATS.bundles.vizCoreBudgetBytes}/></div>
        <div className="pf-cell pf-cell-chart">
          <p className="pf-cell-label">Emitted JavaScript per client build <span>gzip KB</span></p>
          <div className="pf-bars"><BarChart testId="chart-bundles" categories={categories} series={series} value={value} mode="grouped" format={{digits:0,unit:'KB',compact:false}} label="Gzipped emitted JavaScript per selected-client build, KB"/></div>
          <Note>CI baselines from the selected-client build gate</Note>
        </div>
      </div>
    </div>
  </section>;
}
function Note({children}:{children:ReactNode}){return <p className="pf-note">{children}</p>;}

/** Viz core size against its budget, as a ruler with 1 KB ticks; counted up on the motion clock. */
function Budget({bytes,budget}:{bytes:number;budget:number}){
  const shown=useCountUp(bytes),pct=Math.min(1,shown.value/budget),kbs=Math.round(budget/1024);
  const ticks=useMemo(()=>Array.from({length:kbs+1},(_,i)=>i),[kbs]);
  return <div className="pf-budget" data-testid="viz-budget" data-viz-settled={settledAttr(shown.settled)} data-value={bytes}>
    <p className="pf-cell-label">Viz kit core <span>min + gzip, against its budget</span></p>
    <p className="pf-budget-value"><strong>{(shown.value/1024).toFixed(1)}</strong> KB <span>/ {kbs} KB</span></p>
    <svg viewBox={`0 0 ${kbs*10} 26`} preserveAspectRatio="none" aria-hidden="true" className="pf-ruler">
      <rect x="0" y="0" width={kbs*10} height="10" className="pf-ruler-track"/>
      <rect x="0" y="0" width={pct*kbs*10} height="10" className="pf-ruler-fill"/>
      {ticks.map(i=><line key={i} x1={i*10} x2={i*10} y1={12} y2={i%5===0?26:18} className={i%5===0?'pf-tick pf-tick-major':'pf-tick'}/>)}
    </svg>
    <div className="pf-ruler-labels" aria-hidden="true">{ticks.filter(i=>i%10===0).map(i=><span key={i}>{i}</span>)}</div>
    <Note>{(budget-bytes).toLocaleString('en-US')} bytes of headroom · d3 modules only, no barrel import</Note>
  </div>;
}

function Card({w,index}:{w:Work;index:number}){
  return <li className="pf-card" data-testid={'work-'+w.id} data-kind={w.kind}>
    <figure className="pf-still" data-video={w.video?'true':undefined}>
      {w.video&&w.image?<Demo w={w} eager={index<2}/>:w.image?<img src={asset(w.image.src)} alt={w.image.alt} loading={index<2?'eager':'lazy'} decoding="async" width={1120} height={700}/>:w.schematic==='diagram'?<DiagramSketch/>:<PrivateSketch/>}
    </figure>
    <div className="pf-card-body">
      <p className="pf-card-meta"><span>Fig. {pad(index+1)}</span><span>{w.kind}</span></p>
      <h3>{w.title}</h3>
      <p className="pf-card-text">{w.summary}</p>
      <p className="pf-card-tags">{w.tags.map(t=><span key={t}>{t}</span>)}<span className="pf-card-ref">{w.refs}</span></p>
    </div>
  </li>;
}

/** Poster first; the muted inline video is created only when the visitor asks for it (no autoplay, no sound). */
function Demo({w,eager}:{w:Work;eager:boolean}){
  const [on,setOn]=useState(false),ref=useRef<HTMLVideoElement>(null);
  const video=w.video!,image=w.image!;
  useEffect(()=>{const v=ref.current;if(!on||!v)return;v.muted=true;v.play().catch(()=>{});},[on]);
  if(on)return <video ref={ref} className="pf-video" data-testid={'video-'+w.id} src={asset(video.src)} poster={asset(image.src)} muted playsInline loop controls preload="auto" width={1280} height={720} aria-label={`${w.title} demo, muted`}/>;
  return <button type="button" className="pf-play" data-testid={'play-'+w.id} onClick={()=>setOn(true)} aria-label={`Play the ${w.title} demo (${video.seconds} seconds, muted)`}>
    <img src={asset(image.src)} alt={image.alt} loading={eager?'eager':'lazy'} decoding="async" width={960} height={540}/>
    <span className="pf-play-chip" aria-hidden="true"><svg viewBox="0 0 10 10"><path d="M2 1L9 5L2 9Z"/></svg>Play<span>{clock(video.seconds)}</span></span>
  </button>;
}

/** Schematic, not a screenshot: a parent diagram with one component opened into its child. */
function DiagramSketch(){
  return <svg viewBox="0 0 320 200" role="img" aria-label="Schematic: a parent architecture diagram with one component opened into a child diagram below it" className="pf-sketch">
    <g className="pf-sk-line"><path d="M70 46H130M190 46H250M160 62V100"/><path d="M60 140H110M210 140H260" strokeDasharray="3 3"/></g>
    <g className="pf-sk-box"><rect x="20" y="30" width="50" height="32" rx="2"/><rect x="250" y="30" width="50" height="32" rx="2"/><rect x="20" y="124" width="40" height="32" rx="2"/><rect x="260" y="124" width="40" height="32" rx="2"/></g>
    <rect x="130" y="30" width="60" height="32" rx="2" className="pf-sk-hot"/>
    <rect x="110" y="100" width="100" height="80" rx="2" className="pf-sk-frame"/>
    <g className="pf-sk-box"><rect x="122" y="114" width="34" height="22" rx="1"/><rect x="164" y="114" width="34" height="22" rx="1"/><rect x="122" y="146" width="76" height="22" rx="1"/></g>
    <text x="160" y="196" textAnchor="middle" className="pf-sk-caption">schematic</text>
  </svg>;
}
function PrivateSketch(){
  return <div className="pf-private" role="img" aria-label="No image: private client work"><span>Private</span><span>no data · no images</span></div>;
}
