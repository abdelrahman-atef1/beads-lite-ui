import { launch, base } from './lib.mjs';
const b = await launch(); const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
const errs = []; p.on('console', m => m.type()==='error' && errs.push(m.text().slice(0,120))); p.on('pageerror', e => errs.push('PE '+e.message));
for (const h of ['#/', '#/issues', '#/epics', '#/board', '#/releases', '#/issues?issue=beads-lite-1bo5.6.24']) {
  await p.goto(base('new') + '/' + h); await p.waitForTimeout(2500);
  const r = await p.evaluate(() => ({ ids: [...document.querySelectorAll('[id]')].map(e=>e.id).slice(0,25), btns: [...document.querySelectorAll('nav a, nav button, header button, header a')].map(e=>(e.id||e.className)+':'+(e.innerText||e.getAttribute('aria-label')||'').slice(0,18)).slice(0,25), len: document.body.innerText.length, v3: document.querySelectorAll('.u3').length }));
  console.log(h, JSON.stringify(r));
}
console.log(errs); await b.close();
