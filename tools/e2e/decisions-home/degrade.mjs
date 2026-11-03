// D14 (card rules missing) and D15 (broken registered workspaces) on a second server, port 3948.
// usage: node degrade.mjs <worktree> <scratch> <outdir>   (needs BD_BIN)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import WebSocket from 'ws';

const [, , wt, scratch, out] = process.argv;
const PORT = 3948;
const home2 = path.join(scratch, 'home2');
const ids = JSON.parse(fs.readFileSync(path.join(scratch, 'ids.json'), 'utf8'));
fs.mkdirSync(path.join(home2, '.beads'), { recursive: true });
const empty = path.join(scratch, 'empty-no-beads');
fs.mkdirSync(empty, { recursive: true });
const reg = [ids.ws.A, ids.ws.C, path.join(scratch, 'does-not-exist'), empty].map((p) => ({
  workspace_path: p, socket_path: '', database_path: path.join(p, '.beads'), pid: 0, version: 'qa', started_at: new Date().toISOString()
}));
fs.writeFileSync(path.join(home2, '.beads', 'registry.json'), JSON.stringify(reg));
const res = [];
const log = (k, v) => { res.push({ k, v }); console.log(k, JSON.stringify(v)); };

async function phase(name, cardsDir) {
  const logf = fs.openSync(path.join(out, `degrade-${name}.server.log`), 'w');
  const child = spawn(process.execPath, [path.join(wt, 'server/index.js'), '--port', String(PORT), '--host', '127.0.0.1', '--debug'], {
    cwd: ids.ws.C, stdio: ['ignore', logf, logf], windowsHide: true,
    env: { ...process.env, HOME: home2, USERPROFILE: home2, PORT: String(PORT), PHONE_PORT: '0', BEADS_DIR: '', CARDS_DIR: cardsDir }
  });
  try {
    for (let i = 0; i < 90; i++) {
      try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* not up */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    // warm the feed cache first (cold race F1 would otherwise mask the state under test)
    await new Promise((resolve) => {
      fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.text()).then((html) => {
        const tok = /name="board-token" content="([^"]*)"/.exec(html)[1];
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?t=${encodeURIComponent(tok)}`, { headers: { Origin: `http://127.0.0.1:${PORT}` } });
        ws.on('open', () => ws.send(JSON.stringify({ id: 'w', type: 'list-decisions-all', payload: {} })));
        ws.on('message', (m) => { const d = JSON.parse(m); if (d.id === 'w') { log(name + '-warm', { items: d.payload?.items?.length, projects: d.payload?.projects, rules_ok: d.payload?.rules_ok, err: d.error }); ws.close(); resolve(); } });
        setTimeout(resolve, 60000);
      });
    });
    const b = await chromium.launch({ headless: true });
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.addInitScript(() => { localStorage.setItem('beads-ui.view', 'decisions'); localStorage.setItem('beads-ui.lang', 'en'); });
    const t0 = Date.now();
    await p.goto(`http://127.0.0.1:${PORT}/#/decisions`);
    // wait until the skeleton is gone and a settled state is shown (max 90 s)
    await p.waitForFunction(() => !document.querySelector('.decisions .skeleton') && (document.querySelector('.qcard') || document.querySelector('.empty')), null, { timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(2500);
    const state = {
      ms: Date.now() - t0,
      cards: await p.locator('.qcard').count(),
      empty: await p.locator('.empty').count(),
      notes: await p.locator('.dnote').allInnerTexts(),
      crash: await p.locator('[role=alertdialog]').allInnerTexts(),
      summary: await p.locator('.dfilter summary').allInnerTexts(),
      projects: await p.locator('.dfilter__row').allInnerTexts()
    };
    log(name, state);
    await p.screenshot({ path: path.join(out, `D${name === 'no-rules' ? 14 : 15}-${name}.png`) });
    await b.close();
  } finally {
    try { process.kill(child.pid); } catch { /* gone */ }
  }
}
await phase('no-rules', path.join(scratch, 'no-such-cards-dir'));
await phase('broken-workspaces', 'E:/Projects/learner/scripts/cards');
fs.writeFileSync(path.join(out, 'degrade.json'), JSON.stringify(res, null, 1));
