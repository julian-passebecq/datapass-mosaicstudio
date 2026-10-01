import {useState} from 'react';
import {StoryView} from '@vizforge/adapters/react';
import {catalog} from '@vizforge/examples/v1';
import {gallery} from '@vizforge/examples/gallery';
import {Header} from './Common';
const entries=[...catalog,...gallery];
export default function Stories(){const [selected,setSelected]=useState('ranking');const item=entries.find(x=>x.id===selected)||entries[0];return <section className="panel-content"><Header eyebrow="Explain / original VizForge engine" title="A visual laboratory, not another chart library" detail="Recovered DataPass D3 stories: stable entity identity, narrated steps, meaningful transitions and reduced-motion support."/><div className="story-layout"><nav className="story-catalog" aria-label="Visual story catalog">{entries.map(v=><button key={v.id} onClick={()=>setSelected(v.id)} className={item.id===v.id?'active':''}><strong>{v.name}</strong><small>{v.tag}</small></button>)}</nav><div className="story-stage"><StoryView key={item.id} story={item.story}/><details className="details"><summary>Story specification / reuse</summary><p>This is the original VizForge StoryPlayer and D3 renderer from the commit-pinned Fluent2_J_Viz repository. The application shell has not been copied.</p><pre>{JSON.stringify(item.story,null,2)}</pre></details></div></div></section>;}
