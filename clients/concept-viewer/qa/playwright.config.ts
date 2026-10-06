import {defineConfig} from '@playwright/test';
// Smoke run against a served client: npm run client:dev -- concept-viewer --port 5194, then
// VIEWER_URL=http://127.0.0.1:5194 npx playwright test -c clients/concept-viewer/qa/playwright.config.ts
// Captures of the three renderings for each example land in clients/concept-viewer/qa/captures/.
export default defineConfig({testDir:'.',testMatch:'smoke.spec.ts',timeout:240000,expect:{timeout:30000},workers:1,retries:0,reporter:[['line']],
  use:{baseURL:process.env.VIEWER_URL??'http://127.0.0.1:5194',viewport:{width:1440,height:900},screenshot:'only-on-failure',launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}}});
