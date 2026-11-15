import { launch, base, E } from './lib.mjs';
const ID = process.argv[2];
const b = await launch();
for (const srv of ['new', 'base']) for (const theme of ['light', 'dark']) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  await c.addInitScript(([t]) => { try { localStorage.setItem('beads-ui.lang', 'en'); localStorage.setItem('beads-ui.theme', t); } catch {} }, [theme]);
  const p = await c.newPage(); const bad = [];
  p.on('response', (r) => { if (r.status() >= 400 && /local-img/.test(r.url())) bad.push(r.url().replace(/^.*local-img/, '')); });
  await p.goto(base(srv) + '/?ui=3#/'); await p.waitForSelector('.dk3-h'); await p.waitForTimeout(2500);
  await p.evaluate((h) => { location.hash = h; }, `/issues?issue=${ID}`); await p.waitForTimeout(3000);
  console.log(srv, theme, 'local-img 404s:', bad.length);
  await c.close();
}
await b.close();
