import {defineConfig} from '@playwright/test';
import path from 'node:path';
// REL-0.11.1 JOURNEY-01 under the shipped _headers. Not part of the repo suite (playwright.config.ts uses tests/browser).
// The installed workbench (unzipped release zip, JOURNEY_WORKBENCH) is served by serve-with-headers.mjs, which applies
// that folder's own _headers file. Ports above 20000.
const PORT=Number(process.env.JOURNEY_PORT||24341);
const HERE=path.resolve(process.env.JOURNEY_QA_DIR||'qa/REL-0.11.1');
export default defineConfig({
 testDir:HERE,testMatch:'journey01-headers.spec.ts',timeout:900000,expect:{timeout:30000},workers:1,retries:0,
 reporter:[['line']],outputDir:path.join(process.env.JOURNEY_TMP||'test-results','pw-output'),
 use:{baseURL:`http://127.0.0.1:${PORT}`,viewport:{width:1440,height:960},trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 webServer:{command:`node "${path.join(HERE,'serve-with-headers.mjs')}" --root "${process.env.JOURNEY_WORKBENCH}" --port ${PORT}`,url:`http://127.0.0.1:${PORT}/index.html`,reuseExistingServer:false,timeout:30000},
});
