import { chromium } from '@playwright/test';
import fs from 'node:fs'; import { spawnSync } from 'node:child_process';
export const E = JSON.parse(fs.readFileSync('E:/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/.work/scratch/qa5/env.json'));
export const BD = 'C:/Users/abduu/AppData/Roaming/npm/node_modules/@beads/bd/bin/bd.exe';
export const OUT = 'E:/Projects/beads-lite-ui/.work/wt/qa-beads-lite-1bo5-6-59-21/.work/out/beads-lite-1bo5.6.59/qa-wave5';
export const bd = (args) => spawnSync(BD, args, { cwd: E.proj, encoding: 'utf8', windowsHide: true, env: { ...process.env, BD_ACTOR: 'qa' } });
export const show = (id) => { const r = bd(['show', id, '--json']); return JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0]; };
export const create = (title, extra = []) => { const r = bd(['create', title, '-t', 'task', '-p', '3', '--json', ...extra]); return JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))).id; };
export const launch = () => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
export const base = (door) => door === 'phone' ? `http://127.0.0.1:${E.px}` : `http://127.0.0.1:${E.pc}`;
export async function ctx(browser, { w, lang = 'ar', theme = 'dark', door = 'pc', cpu } = {}) {
  const c = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, hasTouch: w < 500, isMobile: false, locale: lang === 'ar' ? 'ar-EG' : 'en-US' });
  await c.addInitScript(([l, t]) => { try { localStorage.setItem('beads-ui.lang', l); localStorage.setItem('beads-ui.theme', t); } catch {} }, [lang, theme]);
  return c;
}
