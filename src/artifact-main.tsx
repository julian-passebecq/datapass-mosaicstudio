import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {FluentProvider,webLightTheme} from './fluent';
import {SiteBoundary} from './framework/Site';
import ArtifactFileViewer from './ArtifactFileViewer';
// `?artifact=1`: the artifact file viewer only. No workbench, database, Python service or 3D is loaded.
document.body.classList.add('studio-client');
createRoot(document.getElementById('root')!).render(<StrictMode><FluentProvider theme={webLightTheme}><SiteBoundary><ArtifactFileViewer/></SiteBoundary></FluentProvider></StrictMode>);
