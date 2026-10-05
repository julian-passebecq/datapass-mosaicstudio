import {defineConfig} from '@playwright/test';
import path from 'node:path';
export default defineConfig({testDir:'.',testMatch:'visual.spec.ts',timeout:120000,expect:{timeout:30000},workers:1,retries:0,reporter:[['list'],['json',{outputFile:path.resolve('clients/fabric-bricks/qa/browser-results.json')}]],
 use:{baseURL:process.env.FABRIC_URL??'http://127.0.0.1:5178',viewport:{width:1280,height:800},screenshot:'only-on-failure',launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}}});
