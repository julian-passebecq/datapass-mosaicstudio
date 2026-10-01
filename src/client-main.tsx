import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {FluentProvider,webLightTheme} from './fluent';
import ClientRouter from './ClientRouter';
import {SiteBoundary} from './framework/Site';
document.body.classList.add('studio-client');
createRoot(document.getElementById('root')!).render(<StrictMode><FluentProvider theme={webLightTheme}><SiteBoundary><ClientRouter/></SiteBoundary></FluentProvider></StrictMode>);
