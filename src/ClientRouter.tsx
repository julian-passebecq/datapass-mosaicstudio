import {useEffect,useState} from 'react';
import {clientIds,clients,selectedClient} from 'virtual:studio-clients';
import {StudioSite,SiteBoundary} from './framework/Site';
import type {AppDefinition} from './framework/types';
export default function ClientRouter(){
  const id=new URLSearchParams(location.search).get('app')||selectedClient;
  const [definition,setDefinition]=useState<AppDefinition|null>(null),[error,setError]=useState('');
  const load=id&&Object.hasOwn(clients,id)?clients[id]:null; // New identity after HMR re-evaluates the virtual module, so edited app.ts is imported again.
  useEffect(()=>{if(!load)return;let active=true;load().then(module=>{if(active){setDefinition(module.default);setError('');}}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[load]);
  if(definition)return <SiteBoundary key={definition.manifest.id}><StudioSite definition={definition}/></SiteBoundary>;
  if(id&&Object.hasOwn(clients,id)&&!error)return <div className="studio-site"><div className="site-loading" role="status">Loading client application...</div></div>;
  return <div className="studio-site"><main id="site-main"><header className="site-page-heading"><span className="site-kicker">DataPass / framework kit</span><h1>{id?'Application unavailable':'Reference applications'}</h1><p>{error||'These are acceptance clients built from the same framework. They are not final client websites.'}</p></header><div className="site-catalog">{clientIds.map(name=><article key={name}><a href={'?app='+name}>{name.replace(/-/g,' ')}</a></article>)}</div>{!selectedClient&&<p><a href="?">Return to the workbench</a></p>}</main></div>;
}
