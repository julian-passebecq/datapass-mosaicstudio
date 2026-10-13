import {defineConfig} from '@playwright/test';
// Smoke run against the selected-client build:
//   npm run build:client -- galaxy-finition
//   npx playwright test -c clients/galaxy-finition/qa/playwright.config.ts
// GF_PORT picks the preview port (default 21473, above the shared 4173/5173 range).
const PORT=Number(process.env.GF_PORT||21473);
export default defineConfig({testDir:'.',testMatch:'smoke.spec.ts',timeout:90000,expect:{timeout:20000},workers:1,retries:0,reporter:[['line']],
  use:{baseURL:`http://127.0.0.1:${PORT}`,viewport:{width:1440,height:960},screenshot:'only-on-failure'},
  webServer:{command:`npx vite preview --host 127.0.0.1 --strictPort --port ${PORT} --outDir dist-clients/galaxy-finition`,cwd:'../../..',url:`http://127.0.0.1:${PORT}`,reuseExistingServer:false,timeout:60000}});
