import path from 'node:path';
const out = process.env.QA_OUT;
export default {
  testDir: '.',
  testMatch: 'decisions.spec.mjs',
  workers: 1,
  timeout: 240000,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: path.join(out, 'playwright.json') }]],
  outputDir: path.join(out, 'pw-artifacts'),
  use: { baseURL: process.env.QA_URL, headless: true }
};
