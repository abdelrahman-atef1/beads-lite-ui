// Headless-browser check of the multi-question card (beads-lite-1bo5.13.12.1.4).
// Bundles the real card view + CSS with a mock board client, drives a 3-question
// card on the desk list, the task-page comment slot and the phone width, in
// ar/en and dark/light, checks with DOM asserts, saves screenshots + summary.md.
// usage: node scripts/qa-multi-card.mjs <out-dir>
// Chrome is started and stopped here by its own PID (no shared browser).
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, '.work/out/qa'));
const tmp = path.join(out, '_harness');
fs.mkdirSync(tmp, { recursive: true });
const CHROME =
  process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

fs.writeFileSync(
  path.join(tmp, 'entry.js'),
  `import { render } from 'lit-html';
import { renderCard, setCardClient } from '${path.join(root, 'app/ui/views/card.js').split(path.sep).join('/')}';
const q = new URLSearchParams(location.search);
const lang = q.get('lang'), surface = q.get('surface'), stop = q.get('stop');
const T = {
  ar: { head: '٣ قرارات عن لوحة الكروت؟', qs: ['نغيّر لون زرار الإرسال؟', 'نعرض شريط التقدم فوق ولا تحت؟', 'اكتب اسم الصفحة الجديدة'], o: [['أه، للأزرق', 'لأ، سيبه'], ['فوق', 'تحت']], eff: 'الزرار هيبقى أوضح على الموبايل.' },
  en: { head: '3 decisions about the card board?', qs: ['Change the send button colour?', 'Show the progress bar on top or bottom?', 'Type the name of the new page'], o: [['Yes, to blue', 'No, keep it'], ['Top', 'Bottom']], eff: 'The button gets clearer on a phone.' }
}[lang];
const done = new Map();
function state() {
  const n = done.size;
  const qs = [1, 2, 3].map((k) => ({
    n: k, class: k === 3 ? 'type' : 'tap', q: T.qs[k - 1], effect: k === 1 ? T.eff : '', show: '',
    opts: k === 3 ? [] : T.o[k - 1].map((l, i) => ({ n: i + 1, l, rec: i === 0 && k === 1 })),
    att: [], sha: 'x' + k, stale: false,
    answered: done.get(k) ? { n: k === 3 ? 0 : done.get(k), label: k === 3 ? '' : T.o[k - 1][done.get(k) - 1], text: k === 3 ? done.get(k) : undefined, via: 'phone', at: new Date(Date.now() - 60000).toISOString() } : null
  }));
  return { id: 'qa-1', state: n >= 3 ? 'answered' : 'waiting', sha: 'f', max_rounds: 3, thread: [], wake: { state: 'none' },
    card: { cls: 'tap', lang, q: T.head, opts: [] }, questions: qs, answeredCount: n, total: 3,
    decision: n >= 3 ? { via: 'phone', answer: '', at: new Date().toISOString(), answers: [1,2,3].map((k) => ({ q: k, answer: String(done.get(k)) })) } : null };
}
setCardClient({ send: async (type, p) => {
  if (type === 'card-state') return state();
  if (type === 'card-answer') { done.set(p.q, p.text ?? p.option); return { code: 'answered-partial', wake: 'none' }; }
  return { code: 'ok' };
} });
const el = document.getElementById('slot');
render(renderCard({ id: 'qa-1', title: 'x', questions: 3, project: { name: 'beads-lite' } }, { now: Date.now() }), el);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
window.run = async () => {
  const log = [];
  const ok = (name, v) => log.push({ name, ok: !!v });
  await wait(150);
  ok('progress 0 of 3', /0/.test(el.querySelector('[data-prog] b').textContent) && el.querySelectorAll('.u3-cq__segs i.on').length === 0);
  ok('no horizontal overflow at start', document.documentElement.scrollWidth <= window.innerWidth + 1 && el.getBoundingClientRect().right <= window.innerWidth + 1);
  ok('only q1 has current border', el.querySelectorAll('.u3-cq--cur').length === 1 && el.querySelector('.u3-cq--cur').dataset.q === '1');
  ok('chip shows 3 questions', /3/.test(el.querySelector('.u3-chip, .u3-cd__head').textContent));
  const cur = getComputedStyle(el.querySelector('.u3-cq--cur'));
  ok('current block: 2px border', cur.borderTopWidth === '2px');
  ok('later block 1px', getComputedStyle(el.querySelector('[data-q="2"]')).borderTopWidth === '1px');
  const opt = el.querySelector('[data-q="1"] [data-opt="1"]');
  const oc = getComputedStyle(opt);
  ok('option not a pill, >=48px', oc.borderRadius === '12px' && opt.getBoundingClientRect().height >= 48);
  opt.click(); await wait(50);
  ok('picked option has aria-pressed + blue 2px border', el.querySelector('[data-q="1"] [data-opt="1"]').getAttribute('aria-pressed') === 'true' && getComputedStyle(el.querySelector('[data-q="1"] .is-picked')).borderTopWidth === '2px');
  const go = el.querySelector('[data-q="1"] [data-act="confirm"]');
  ok('confirm >=44px', go.getBoundingClientRect().height >= 44);
  window.shot1 = true;
  if (stop === 'picked') return log;
  go.click(); await wait(250);
  ok('q1 collapsed to one green line', el.querySelectorAll('[data-answered]').length === 1 && !el.querySelector('[data-q="1"] [data-opt]'));
  ok('progress 1 of 3', /1/.test(el.querySelector('[data-prog] b').textContent));
  ok('q2 now current', el.querySelector('.u3-cq--cur').dataset.q === '2');
  if (stop === 'one') return log;
  el.querySelector('[data-q="2"] [data-opt="2"]').click(); await wait(50);
  el.querySelector('[data-q="2"] [data-act="confirm"]').click(); await wait(250);
  const ta = el.querySelector('[data-q="3"] [data-type]');
  ta.value = 'x'; ta.dispatchEvent(new Event('input'));
  el.querySelector('[data-q="3"] [data-act="send"]').click(); await wait(300);
  ok('all answered line, no controls', !!el.querySelector('[data-all]') && !el.querySelector('[data-opt]') && el.querySelectorAll('[data-answered]').length === 3);
  ok('no horizontal overflow', document.documentElement.scrollWidth <= window.innerWidth + 1);
  return log;
};
`
);
fs.writeFileSync(
  path.join(tmp, 'page.html'),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
${['tokens', 'base', 'icons', 'shell', 'card', 'desk', 'task']
  .map((c) => `<link rel="stylesheet" href="./u3-${c}.css">`)
  .join('\n')}
</head><body class="u3"><main id="host"></main>
<script type="module" src="./bundle.js"></script></body></html>`
);
for (const c of ['tokens', 'base', 'icons', 'shell', 'card', 'desk', 'task'])
  fs.copyFileSync(
    path.join(root, `app/css/u3-${c}.css`),
    path.join(tmp, `u3-${c}.css`)
  );
await build({
  entryPoints: [path.join(tmp, 'entry.js')],
  bundle: true,
  format: 'esm',
  outfile: path.join(tmp, 'bundle.js'),
  logLevel: 'error'
});

const cases = [];
for (const lang of ['ar', 'en'])
  for (const theme of ['dark', 'light'])
    for (const [surface, w, h] of [
      ['phone', 390, 1700],
      ['desk', 1100, 1500],
      ['task', 1100, 1500]
    ])
      cases.push({ lang, theme, surface, w, h });

/** one page per case; the surface wrapper mimics where the card lives */
function pageFor(c) {
  const src = fs.readFileSync(path.join(tmp, 'page.html'), 'utf8');
  const wrap =
    c.surface === 'task'
      ? '<div class="u3-ts__c u3-ts__c--decision"><div id="slot"></div></div>'
      : c.surface === 'desk'
        ? '<div class="dk3-list"><div id="slot"></div></div>'
        : '<div id="slot"></div>';
  const f = path.join(tmp, `${c.surface}-${c.lang}-${c.theme}.html`);
  fs.writeFileSync(
    f,
    src
      .replace('<main id="host"></main>', `<main id="host">${wrap}</main>`)
      .replace('<html>', `<html data-theme="${c.theme}">`)
      .replace(
        '<body class="u3">',
        `<body class="u3" style="margin:0;padding:12px"><script>window.__q=${JSON.stringify(c)}</script>`
      )
      .replace('</body>', '</body>')
  );
  return f;
}

const srv = http.createServer((req, res) => {
  const f = path.join(tmp, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(tmp) || !fs.existsSync(f)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const t = f.endsWith('.js')
    ? 'text/javascript'
    : f.endsWith('.css')
      ? 'text/css'
      : 'text/html';
  res.writeHead(200, { 'content-type': t + '; charset=utf-8' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/`;
const results = [];
let chrome = null;
const pids = [];
function runChrome(args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const prof = path.join(tmp, 'profile');
    const p = spawn(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        `--user-data-dir=${prof}`,
        ...args
      ],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      }
    );
    pids.push(p.pid);
    let buf = '';
    p.stdout.on('data', (d) => (buf += d));
    const t = setTimeout(() => {
      try {
        process.kill(p.pid);
      } catch {
        /* gone */
      }
    }, timeoutMs);
    p.on('exit', () => {
      clearTimeout(t);
      resolve(buf);
    });
  });
}

// The page runs window.run() itself and writes the log into the DOM. The
// phone case runs inside a 390px iframe (Chrome headless cannot make a window
// narrower than ~500px, so media queries need a real 390px viewport).
const driver = `<script type="module">
if (window.parent === window) {
  await new Promise((r) => setTimeout(r, 300));
  const log = await window.run();
  const pre = document.createElement('pre'); pre.id = '__log'; pre.style.display = 'none'; pre.textContent = JSON.stringify(log); document.body.append(pre);
}
</script>`;
const wrapperDriver = `<script type="module">
const fr = document.getElementById('f');
await new Promise((r) => { fr.onload = r; fr.src = fr.dataset.src + location.search; });
await new Promise((r) => setTimeout(r, 300));
const log = await fr.contentWindow.run();
const pre = document.createElement('pre'); pre.id = '__log'; pre.style.display = 'none'; pre.textContent = JSON.stringify(log); document.body.append(pre);
</script>`;
for (const c of cases) {
  if (
    process.env.ONLY &&
    !`${c.surface}-${c.lang}-${c.theme}`.includes(process.env.ONLY)
  )
    continue;
  const f = pageFor(c);
  const html = fs.readFileSync(f, 'utf8');
  const q = `?lang=${c.lang}&surface=${c.surface}`;
  fs.writeFileSync(f, html.replace('</body>', driver + '</body>'));
  let url = base + path.basename(f) + q;
  let win = c.w;
  if (c.surface === 'phone') {
    const wf = path.join(tmp, `w-${path.basename(f)}`);
    fs.writeFileSync(
      wf,
      `<!doctype html><html data-theme="${c.theme}"><body style="margin:0;background:${c.theme === 'dark' ? '#0e121b' : '#f6f7fb'}"><iframe id="f" data-src="${path.basename(f)}" style="width:390px;height:${c.h}px;border:0;display:block"></iframe>${wrapperDriver}</body></html>`
    );
    url = base + path.basename(wf) + q;
    win = 500;
  }
  const dom = await runChrome([
    `--window-size=${win},${c.h}`,
    '--virtual-time-budget=6000',
    '--dump-dom',
    url + '&stop=all'
  ]);
  let log = [];
  const m = /<pre id="__log"[^>]*>([\s\S]*?)<\/pre>/.exec(dom);
  if (m) {
    try {
      log = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    } catch {
      /* shown as fail */
    }
  }
  const name = `${c.surface}-${c.lang}-${c.theme}`;
  const bad = log.filter((x) => !x.ok).map((x) => x.name);
  results.push({
    name,
    checks: log.length,
    failed: m ? bad : ['page did not run']
  });
  // screenshot of the final state (all answered)
  for (const st of ['picked', 'all'])
    await runChrome([
      `--window-size=${win},${c.h}`,
      '--virtual-time-budget=6000',
      `--screenshot=${path.join(out, `${name}-${st}.png`)}`,
      url + '&stop=' + st
    ]);
  console.log(
    name,
    log.length,
    'checks',
    bad.length ? 'FAIL ' + bad.join('; ') : 'ok'
  );
}
const failed = results.filter((r) => r.failed.length || r.checks === 0);
fs.writeFileSync(
  path.join(out, 'summary.md'),
  `# Multi-question card, headless Chrome\n\n${results.length} cases (desk/task/phone x ar/en x dark/light), ${failed.length} failed.\n\n` +
    results
      .map(
        (r) =>
          `- ${r.name}: ${r.checks} checks, ${r.failed.length ? 'FAIL ' + r.failed.join('; ') : 'ok'}`
      )
      .join('\n') +
    '\n'
);
fs.writeFileSync(
  path.join(out, 'results.json'),
  JSON.stringify(results, null, 2)
);
srv.close();
fs.rmSync(path.join(tmp, 'profile'), { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
