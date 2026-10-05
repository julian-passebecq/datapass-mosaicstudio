import {defineConfig} from '@playwright/test';
// Smoke run against a served client: npm run client:dev -- arch-atlas --port 5193, then
// npx playwright test -c clients/arch-atlas/qa/playwright.config.ts
export default defineConfig({testDir:'.',testMatch:'smoke.spec.ts',timeout:180000,expect:{timeout:30000},workers:1,retries:0,reporter:[['line']],
  use:{baseURL:process.env.ATLAS_URL??'http://127.0.0.1:5193',viewport:{width:1280,height:800},screenshot:'only-on-failure',launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}}});
