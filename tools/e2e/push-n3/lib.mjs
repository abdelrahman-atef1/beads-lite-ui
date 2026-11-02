// QA harness helpers for company-1bo5.6.16 (board Web Push N3). Test code only.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const OUT = process.env.QA_OUT || path.resolve('.work/out/company-1bo5.6.16/qa');
fs.mkdirSync(OUT, { recursive: true });

/** Recorder: check(id, text, pass, detail). pass === null -> NOT EXERCISED. */
export function recorder(part) {
  const rows = [];
  const t0 = Date.now();
  return {
    rows,
    check(id, text, pass, detail = '') {
      const status = pass === null ? 'NOT EXERCISED' : pass ? 'PASS' : 'FAIL';
      rows.push({ id, text, status, detail: String(detail).slice(0, 400) });
      console.log(`${status.padEnd(13)} ${id} ${text}${detail ? '  :: ' + String(detail).slice(0, 200) : ''}`);
    },
    save() {
      fs.writeFileSync(path.join(OUT, `${part}.json`), JSON.stringify({ part, ms: Date.now() - t0, rows }, null, 1));
    }
  };
}

const b64u = (b) => Buffer.from(b).toString('base64url');
export const fromB64u = (s) => Buffer.from(s, 'base64url');

/** A fake browser subscription whose keys WE hold, so we can decrypt what the board sends. */
export function makeSub(endpoint) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    subscription: { endpoint, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } },
    ecdh,
    auth
  };
}

/** RFC 8291 / 8188 aes128gcm decrypt of a web-push body. Returns the plaintext string. */
export function decryptPush(body, sub) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPub = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const uaPub = sub.ecdh.getPublicKey();
  const secret = sub.ecdh.computeSecret(asPub);
  const hk = (ikm, s, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, s, info, len));
  const prk = hk(secret, sub.auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const cek = hk(prk, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hk(prk, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = pt.length - 1;
  while (end > 0 && pt[end] === 0) end--; // padding
  return pt.subarray(0, end).toString('utf8'); // pt[end] is the 0x02 delimiter
}

export function decodeVapid(authHeader) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(authHeader || '');
  if (!m) return null;
  const [h, p] = m[1].split('.');
  return { jwtHeader: JSON.parse(fromB64u(h)), claims: JSON.parse(fromB64u(p)), k: m[2] };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
