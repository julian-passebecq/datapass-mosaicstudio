import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',timeout:90000,expect:{timeout:20000},workers:1,retries:0,maxFailures:2,
 reporter:[['list'],['json',{outputFile:'qa/browser-results.json'}],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:960},trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:process.env.CI_BROWSER_PATH?{executablePath:process.env.CI_BROWSER_PATH}:{}},
 webServer:{command:'npm run preview -- --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:60000},
});
