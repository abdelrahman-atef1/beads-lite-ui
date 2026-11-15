import { defineConfig } from '@playwright/test';
import { OUT, CHROME } from './paths.mjs';
const spec = process.env.SPEC || 'legacy.spec.mjs';
export default defineConfig({
  testDir: '.', outputDir: OUT + '/pw-results', testMatch: [spec], timeout: 240000, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: OUT + '/' + spec.replace('.spec.mjs', '') + (process.env.TAG || '') + '.json' }]],
  use: { launchOptions: { executablePath: CHROME } }
});
