// QA company-8ce8.17.13: status chips on the owner report. Scratch bd stores only; the hook is run directly, never registered.
// COMPANY_WT = company worktree on swe/8ce8.17.13. Run: COMPANY_WT=... node --test qa/status-react.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const W = process.env.COMPANY_WT; if (!W) throw new Error('set COMPANY_WT');
const S = path.join(W, 'scripts');
fs.mkdirSync(path.join(W, '.work', 'scratch'), { recursive: true });
const base = fs.mkdtempSync(path.join(W, '.work', 'scratch', 'qa-1713-'));
after(() => fs.rmSync(base, { recursive: true, force: true }));
const sh = (cmd, args, cwd, extra = {}, input) => spawnSync(cmd, args, { cwd, env: { ...process.env, BD_ACTOR: 'qa', BEADS_DIR: path.join(cwd, '.beads'), ...extra }, encoding: 'utf8', windowsHide: true, input, shell: cmd === 'bd' && process.platform === 'win32' });
const store = path.join(base, 'qaproj'); fs.mkdirSync(store);
sh('git', ['init', '-q', '.'], store); sh('bd', ['init', '--prefix', 'qa', '--quiet'], store);
assert.ok(fs.existsSync(path.join(store, '.beads')), 'scratch store created');
const mk = (labels, title = 'report') => JSON.parse(sh('bd', ['create', title, '-t', 'task', ...(labels ? ['-l', labels] : []), '--description', 'x', '--json'], store).stdout).id;
const texts = (id) => JSON.parse(sh('bd', ['comments', id, '--json'], store).stdout).map((c) => c.text);
const count = (id, e) => texts(id).filter((t) => t === `REACT: ${e} re: description`).length;
const hook = (input, cwd = store) => sh(process.execPath, [path.join(S, 'status-react-hook.mjs')], cwd, {}, typeof input === 'string' ? input : JSON.stringify(input));
const ev = (command, extra = {}) => ({ session_id: 's', cwd: store, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, tool_response: { stdout: '', stderr: '', interrupted: false }, ...extra });
const wakeEnv = (tag) => { const list = path.join(base, `projects-${tag}.list`); fs.writeFileSync(list, store.split(path.sep).join('/') + '\n'); return { WAKE_ROOT: path.join(base, 'q-' + tag), WAKE_PROJECTS_LIST: list, WAKE_POLL_MS: '200', WAKE_MAX_MS: '5000' }; };
const wake = path.join(S, 'wake', 'wake.mjs');
const emit = (id, e) => sh(process.execPath, [wake, 'emit', '--kind', 'report', '--repo', 'qaproj', '--bead', id, '--role', 'swe', '--via', 'pc'], store, e);
const claim = (e) => sh(process.execPath, [wake, 'wait', '--project', 'qaproj'], store, e);

test('C17-06 react.mjs onit emoji is the hammer-and-wrench', () => {
  const src = fs.readFileSync(path.join(S, 'react.mjs'), 'utf8');
  assert.match(src, /onit: '🛠️'/);
  assert.doesNotMatch(src, /onit: '🔨'/);
});
test('C17-03 wake claim posts 👀 once on a report; a second wake does not duplicate; non-report bead not marked', () => {
  const id = mk('owner-report'); const e = wakeEnv('a');
  for (let i = 0; i < 2; i++) { assert.equal(emit(id, e).status, 0); assert.match(claim(e).stdout, /WAKE report qaproj/); }
  assert.equal(count(id, '👀'), 1);
  assert.equal(count(id, '🛠️'), 0);
  const plain = mk('', 'plain');
  assert.equal(emit(plain, e).status, 0); claim(e);
  // observation only: board reports always carry the label, so an unlabelled report wake is synthetic
  console.log('INFO unlabelled bead on a report wake got eyes:', count(plain, '👀'));
});
test('C17-04/05 ON IT -> 🛠️ then close -> ✅, in order, idempotent, via hook with PostToolUse input', () => {
  const id = mk('owner-report'); const e = wakeEnv('b');
  emit(id, e); claim(e);
  sh('bd', ['comments', 'add', id, 'ON IT: checking the report first'], store);
  assert.equal(hook(ev(`bd comments add ${id} "ON IT: checking the report first"`)).status, 0);
  assert.equal(hook(ev(`bd comments add ${id} "ON IT: checking the report first"`)).status, 0);
  assert.equal(count(id, '🛠️'), 1, 'one hammer-wrench after two hook runs');
  assert.equal(count(id, '✅'), 0);
  sh('bd', ['close', id, '--reason', 'qa'], store);
  assert.equal(hook(ev(`bd close ${id} --reason qa`)).status, 0);
  assert.equal(hook(ev(`bd close ${id} --reason qa`)).status, 0);
  assert.equal(count(id, '✅'), 1);
  const order = texts(id).filter((t) => /^REACT: .* re: description$/.test(t)).map((t) => t.split(' ')[1]);
  assert.deepEqual(order, ['👀', '🛠️', '✅']);
});
test('C17-04b hook with -C and a cwd that is NOT the project still finds the bead', () => {
  const id = mk('owner-report');
  const r = hook(ev(`bd -C ${store.split(path.sep).join('/')} comments add ${id} "ON IT: x"`, { cwd: base }), base);
  assert.equal(r.status, 0);
  assert.equal(count(id, '🛠️'), 1);
});
test('C17-07 hook ignores other commands, other beads, bad input; always exit 0, silent', () => {
  const id = mk('owner-report'), other = mk('', 'notareport');
  const n0 = texts(id).length;
  const cases = [
    ev('git status'), ev(`git commit -m "bd close ${id}"`), ev(`echo bd comments add ${id} "ON IT"`),
    ev(`bd comments add ${id} "just a note"`), ev(`bd show ${id}`), ev(`bd comments add ${other} "ON IT: x"`), ev(`bd close ${other}`),
    ev(`bd close ${id}`, { tool_response: { is_error: true } }), ev(`bd close ${id}`, { tool_response: { success: false } }),
    ev(''), { tool_name: 'Bash' }, { tool_input: null }, 'not json', '', '{"tool_input":{"command":123}}', '[]', 'null'
  ];
  for (const c of cases) {
    const r = hook(c);
    assert.equal(r.status, 0, 'exit 0 for ' + JSON.stringify(c).slice(0, 60));
    assert.equal(r.stdout.trim() + r.stderr.trim(), '', 'silent for ' + JSON.stringify(c).slice(0, 60));
  }
  assert.equal(texts(id).length, n0, 'no comment added on the report');
  assert.equal(texts(other).filter((t) => t.startsWith('REACT')).length, 0);
});
test('C17-07b nonexistent / hostile bead ids do not crash or run a command', () => {
  for (const cmd of ['bd close nope-999', 'bd comments add x";touch pwned;" "ON IT: x"', 'bd close $(touch pwned2)', 'bd close a-1 && bd close b-2']) {
    assert.equal(hook(ev(cmd)).status, 0);
  }
  assert.ok(!fs.existsSync(path.join(store, 'pwned')) && !fs.existsSync(path.join(store, 'pwned2')));
});
test('C17-05b a DONE comment (not a close) -> ✅ ? (bead text: "the bead closed or a done comment")', () => {
  const id = mk('owner-report');
  hook(ev(`bd comments add ${id} "DONE: fixed and deployed"`));
  assert.equal(count(id, '✅'), 1, 'a DONE comment should also mark ✅ per the bead text');
});
test('C17-08 no settings.json registers the hook', () => {
  for (const f of [path.join(process.env.USERPROFILE || process.env.HOME, '.claude', 'settings.json'), path.join(W, '.claude', 'settings.json'), path.join(W, '.claude', 'settings.local.json')]) {
    if (fs.existsSync(f)) assert.ok(!fs.readFileSync(f, 'utf8').includes('status-react-hook'), f);
  }
});
