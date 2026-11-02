// Preload (node --require): the LAST network hop of web-push. Logs what would leave the PC and
// answers a fake push-service status. No packet is sent to any real push service.
// Status by endpoint path: contains /gone410 -> 410, /gone404 -> 404, /err500 -> 500, else 201.
const https = require('node:https');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const LOG = process.env.QA_PUSH_LOG;
const real = https.request;
https.request = function (opts, cb) {
  const host = (opts && (opts.hostname || opts.host)) || '';
  if (!LOG || !/(googleapis\.com|mozilla\.com|push\.apple\.com|notify\.windows\.com)$/.test(host)) {
    return real.apply(this, arguments);
  }
  const req = new EventEmitter();
  const chunks = [];
  req.write = (c) => chunks.push(Buffer.from(c));
  req.setTimeout = () => req;
  req.destroy = () => {};
  req.end = (c) => {
    if (c) chunks.push(Buffer.from(c));
    const p = opts.path || '';
    const status = /gone410/.test(p) ? 410 : /gone404/.test(p) ? 404 : /err500/.test(p) ? 500 : 201;
    fs.appendFileSync(LOG, JSON.stringify({ at: Date.now(), host, path: p, method: opts.method, headers: opts.headers, body: Buffer.concat(chunks).toString('base64'), status }) + '\n');
    const res = new EventEmitter();
    res.statusCode = status;
    res.headers = {};
    setImmediate(() => { cb(res); res.emit('data', ''); res.emit('end'); });
  };
  return req;
};
