import {defineConfig} from '@playwright/test';
// PW_PORT moves the preview server (default 4173). Several specs assert that requests stay on http://127.0.0.1:4173,
// so use another port only for specs that do not hard-code that origin (e.g. while another local session holds 4173).
const port=Number(process.env.PW_PORT||4173);
export default defineConfig({
 testDir:'./tests/browser',timeout:90000,expect:{timeout:20000},workers:1,retries:0,
 reporter:[['list'],['json',{outputFile:'qa/browser-results.json'}],['html',{open:'never'}]],
 use:{baseURL:`http://127.0.0.1:${port}`,viewport:{width:1440,height:960},trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 webServer:{command:`npm run preview -- --port ${port}`,url:`http://127.0.0.1:${port}`,reuseExistingServer:process.env.PW_REUSE_SERVER==='1',timeout:60000},
});
