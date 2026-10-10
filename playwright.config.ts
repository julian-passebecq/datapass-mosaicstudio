import {defineConfig} from '@playwright/test';
// PW_PORT lets a local run use a free port (parallel sessions collide on 4173); CI keeps the default.
const PORT=Number(process.env.PW_PORT||4173);
export default defineConfig({
 testDir:'./tests/browser',timeout:90000,expect:{timeout:20000},workers:1,retries:0,
 reporter:[['list'],['json',{outputFile:'qa/browser-results.json'}],['html',{open:'never'}]],
 use:{baseURL:`http://127.0.0.1:${PORT}`,viewport:{width:1440,height:960},trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{...(process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 webServer:{command:`npm run preview -- --port ${PORT}`,url:`http://127.0.0.1:${PORT}`,reuseExistingServer:process.env.PW_REUSE_SERVER==='1',timeout:60000},
});
