import { defineConfig } from '@playwright/test';
const OUT = 'E:/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/.work/out/beads-lite-1bo5.6.59/qa-wave5';
const spec = process.env.SPEC || 'bulk.spec.mjs';
export default defineConfig({
  testDir: '.', outputDir: OUT + '/pw-results', testMatch: [spec], timeout: 180000, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: OUT + '/' + spec.replace('.spec.mjs', '') + (process.env.TAG || '') + '.json' }]],
  use: { launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } }
});
