import {StrictMode,Suspense,lazy} from 'react';
import {createRoot} from 'react-dom/client';
import {FluentProvider,webLightTheme} from './fluent';
import {ThemeProvider} from '@sqlrooms/ui';
import './styles.css';
import '@xyflow/react/dist/style.css';
// Narrative embeds do not create a RoomStore or initialize a database. Ordinary
// workbench/data modules still share the actual SQLRooms host and connector.
const params=new URLSearchParams(location.search);
const standalone=params.get('embed')==='1'&&['stories','explain'].includes(params.get('module')||'');
const View=standalone
 ?params.get('module')==='stories'?lazy(()=>import('./panels/Stories')):lazy(()=>import('./panels/Concepts'))
 :lazy(()=>import('./App'));
createRoot(document.getElementById('root')!).render(<StrictMode><ThemeProvider defaultTheme="light" storageKey="datapass-studio2-theme"><FluentProvider theme={webLightTheme} className="fluent-root"><Suspense fallback={<div className="empty" role="status">Preparing the workspace</div>}>{standalone?<main className="workspace-panel"><View/></main>:<View/>}</Suspense></FluentProvider></ThemeProvider></StrictMode>);
