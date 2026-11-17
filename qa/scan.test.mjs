// QA beads-lite-1bo5.13.29: learner card scan, C29-05 / C29-06. CARDS_DIR = learner worktree scripts/cards
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = process.env.CARDS_DIR;
if (!dir) throw new Error('set CARDS_DIR to the learner worktree scripts/cards');
const { scanText } = await import(pathToFileURL(path.join(dir, 'rules.mjs')).href);
const hit = (s, r) => scanText(s).includes(r);
test('C29-05 bare file names do not fire url', () => {
  for (const s of ['Rotate auth.json now?', 'edit config.php', 'tools.json is rewritten', 'AUTH.JSON', 'see (package.json) and app.js', 'logo.png and notes.txt', 'build app.apk', 'a.yaml, b.toml; c.csv', 'main.dart', 'run setup.ps1', 'x.env']) {
    assert.ok(!hit(s, 'url'), `should pass: ${s} -> ${scanText(s)}`);
  }
});
test('C29-06 real hosts, schemes, tokens, paths still fire', () => {
  for (const s of ['open example.com', 'evil.com/x.json', 'evil.com.json', 'http://x', 'www.x', 'visit auth.json.evil.com', 'file.json,evil.com', 'go to evil.com, then config.php', 'README.md', 'setup.sh', 'a.py', 'x.zip', 'host.io', '10.0.0.1', 'sub.evil.org/auth.json', 'auth.json?x=evil.com', 'evil.com:8080', 'EVIL.COM', 'auth.json@evil.com', 'tg://resolve']) {
    assert.ok(hit(s, 'url') || hit(s, 'email'), `should fire: ${s} -> ${scanText(s)}`);
  }
  assert.ok(hit(String.raw`C:\Users\bob\x`, 'user-path'));
  assert.ok(hit('see /home/bob/x', 'user-path'));
  assert.ok(hit('key sk-abc123def456ghi789', 'key-prefix'));
  assert.ok(hit('token: abcdef', 'credential-pair'));
  assert.ok(hit('mail me a@b.co', 'email'));
});
test('C29-06b file name next to a secret still fires the secret rule', () => {
  assert.ok(hit('auth.json password: hunter2', 'credential-pair'));
  assert.ok(hit('auth.json ghp_abcdefghijklmnopqrstuvwxyz0123', 'key-prefix'));
});
