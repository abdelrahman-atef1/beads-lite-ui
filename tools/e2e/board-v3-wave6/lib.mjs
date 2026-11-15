import { chromium } from '@playwright/test';
import fs from 'node:fs'; import { spawnSync } from 'node:child_process';
import { SC, OUT, BD, CHROME } from './paths.mjs';
export { OUT };
export const E = JSON.parse(fs.readFileSync(SC + '/env.json'));
export const bd = (srv, args) => spawnSync(BD, args, { cwd: E[srv].proj, encoding: 'utf8', windowsHide: true, env: { ...process.env, BD_ACTOR: 'qa' } });
export const create = (srv, title, extra = []) => { const r = bd(srv, ['create', title, '-t', 'task', '-p', '3', '--json', ...extra]); return JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).id; };
export const launch = () => chromium.launch({ executablePath: CHROME, headless: true });
export const base = (srv, door) => door === 'phone' ? `http://127.0.0.1:${E[srv].px}` : `http://127.0.0.1:${E[srv].pc}`;
export const LOG = (f, s) => fs.appendFileSync(`${OUT}/${f}`, s + '\n');
export const SIZES = [320, 360, 390, 414];
export const FAST3G = { offline: false, latency: 562, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 };
export async function throttle(page, on = true) {
  const s = await page.context().newCDPSession(page);
  await s.send('Network.enable');
  await s.send('Network.emulateNetworkConditions', on ? FAST3G : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await s.send('Emulation.setCPUThrottlingRate', { rate: on ? 4 : 1 });
  return s;
}
