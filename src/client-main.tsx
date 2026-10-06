import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {FluentProvider,webLightTheme} from './fluent';
import ClientRouter from './ClientRouter';
import {SiteBoundary} from './framework/Site';
import './framework/blocks/scene3d.css';
document.body.classList.add('studio-client');
createRoot(document.getElementById('root')!).render(<StrictMode><FluentProvider theme={webLightTheme}><SiteBoundary><ClientRouter/></SiteBoundary></FluentProvider></StrictMode>);
