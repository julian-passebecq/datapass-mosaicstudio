import {defineConfig} from '@playwright/test';
// F212 product loop on two consumers, against their selected-client builds (build them first):
//   npm run build:client -- contoso-shape-analytics && npm run build:client -- foil-wind
//   npm run test:product-loop
// Ports are fixed because each client's CSP names its exact runtime origin (connect-src, no wildcard):
// contoso-shape-analytics 21491 -> runtime 24811, foil-wind 21481 -> runtime 24812. The spec starts and stops the
// runtimes itself; the previews below are stopped by Playwright.
// vite.client.config.ts serves dist-clients/<id> with the client's own CSP header (the policy of its _headers).
const preview=(id:string,port:number)=>({command:`npx vite preview --config vite.client.config.ts --strictPort --port ${port}`,env:{STUDIO_CLIENT:id},cwd:'../..',url:`http://127.0.0.1:${port}`,reuseExistingServer:false,timeout:60000});
export default defineConfig({testDir:'.',testMatch:'loop.spec.ts',timeout:180000,expect:{timeout:20000},workers:1,retries:0,
  reporter:[['list']],
  use:{viewport:{width:1440,height:960},screenshot:'only-on-failure',trace:'retain-on-failure',acceptDownloads:true,
    launchOptions:{...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{})}},
  webServer:[preview('contoso-shape-analytics',21491),preview('foil-wind',21481)]});
