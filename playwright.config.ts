import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',fullyParallel:false,use:{baseURL:'http://localhost:3000',headless:true,reducedMotion:'reduce',screenshot:'only-on-failure'},webServer:{command:'pnpm start',url:'http://localhost:3000',reuseExistingServer:true,timeout:120000},projects:[{name:'chromium',use:{browserName:'chromium',channel:'chrome'}}]});
