import {StrictMode,Suspense,lazy} from 'react';
import {createRoot} from 'react-dom/client';
import {FluentProvider,webLightTheme} from './fluent';
import {ThemeProvider} from '@sqlrooms/ui';
import {PanelBoundary} from './panels/Common';
import './styles.css';
import '@xyflow/react/dist/style.css';
// Narrative and architecture embeds do not create a RoomStore or initialize a database.
const params=new URLSearchParams(location.search);
const independent={stories:lazy(()=>import('./panels/Stories')),explain:lazy(()=>import('./panels/Concepts')),architecture:lazy(()=>import('./panels/Architecture'))};
const module=params.get('module')||'';
const standalone=params.get('embed')==='1'&&Object.hasOwn(independent,module);
const View=standalone?independent[module as keyof typeof independent]:lazy(()=>import('./App'));
createRoot(document.getElementById('root')!).render(<StrictMode><ThemeProvider defaultTheme="light" storageKey="datapass-studio2-theme"><FluentProvider theme={webLightTheme} className="fluent-root"><Suspense fallback={<div className="empty" role="status">Preparing the workspace</div>}>{standalone?<main className="workspace-panel"><PanelBoundary><View/></PanelBoundary></main>:<View/>}</Suspense></FluentProvider></ThemeProvider></StrictMode>);
