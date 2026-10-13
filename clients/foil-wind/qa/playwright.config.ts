import {defineConfig} from '@playwright/test';
// Smoke run against the selected-client build (placeholder or local export):
//   npm run build:client -- foil-wind
//   npx playwright test -c clients/foil-wind/qa/playwright.config.ts
// FW_PORT picks the preview port (default 21481, above the shared 4173/5173 range). FW_SHOTS saves screenshots (not committed).
const PORT=Number(process.env.FW_PORT||21481);
export default defineConfig({testDir:'.',testMatch:'smoke.spec.ts',timeout:90000,expect:{timeout:20000},workers:1,retries:0,reporter:[['line']],
  use:{baseURL:`http://127.0.0.1:${PORT}`,viewport:{width:1440,height:960},screenshot:'only-on-failure'},
  webServer:{command:`npx vite preview --host 127.0.0.1 --strictPort --port ${PORT} --outDir dist-clients/foil-wind`,cwd:'../../..',url:`http://127.0.0.1:${PORT}`,reuseExistingServer:false,timeout:60000}});
