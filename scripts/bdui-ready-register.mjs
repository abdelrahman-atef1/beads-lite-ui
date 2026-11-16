// Helper for start-beads-ui.sh (company-yhc8): one node process waits (wall-clock deadline) until the board answers,
// then registers every workspace. Replaces ~120 curl forks and ~13 cygpath+curl forks, each of which cost seconds under CPU load.
// usage: node bdui-ready-register.mjs <baseUrl> <deadlineSec> <here(posix)> <listFile|""> <newRoot(posix)|"">
import http from "node:http";
import fs from "node:fs";
const [url, deadlineSec, here, listFile, newRoot] = process.argv.slice(2);
const w = (p) => (/^\/[a-zA-Z]\//.test(p) ? p[1].toUpperCase() + ":" + p.slice(2) : p); // /e/x -> E:/x
const call = (method, path, body) => new Promise((res) => {
  const r = http.request(url + path, { method, timeout: Number(process.env.BDUI_REG_TIMEOUT_MS || 5000), headers: { "Content-Type": "application/json" } }, (x) => { x.resume(); x.on("end", () => res(x.statusCode)); });
  r.on("error", () => res(0)); r.on("timeout", () => { r.destroy(); res(0); });
  r.end(body);
});
const end = Date.now() + Number(deadlineSec) * 1000;
let up = false;
while (Date.now() < end) { if ((await call("GET", "/api/workspaces")) === 200) { up = true; break; } await new Promise((r) => setTimeout(r, 500)); }
if (!up) { console.log("not ready by deadline"); process.exit(2); }
console.log("ready after " + Math.round(Number(deadlineSec) - (end - Date.now()) / 1000) + " s");
let dirs = [];
if (newRoot) { const nr = w(newRoot); dirs = fs.readdirSync(nr, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => nr + "/" + d.name); }
else { dirs = [here]; if (listFile) for (const l of fs.readFileSync(listFile, "utf8").split(/\r?\n/)) { const t = l.trim(); if (t && !t.startsWith("#")) dirs.push(t); } }
// A register call that times out under boot load is retried with backoff (1,2,4,8 s; BDUI_REG_BACKOFF_MS scales it) up to
// BDUI_REG_TRIES (default 5) times. A workspace still failing is named on a "register FAILED" line; the board still starts (exit 0).
const tries = Number(process.env.BDUI_REG_TRIES || 5), base = Number(process.env.BDUI_REG_BACKOFF_MS || 1000);
let n = 0; const failed = [];
await Promise.all(dirs.map(async (p) => {
  const d = w(p); if (!fs.existsSync(d + "/.beads")) return;
  let st = 0;
  for (let i = 0; i < tries; i++) {
    st = await call("POST", "/api/register-workspace", JSON.stringify({ path: d, database: d + "/.beads" }));
    if (st >= 200 && st < 300) { n++; return; }
    if (i < tries - 1) { console.log("register retry " + (i + 1) + "/" + (tries - 1) + " " + d + " status=" + st); await new Promise((r) => setTimeout(r, base * 2 ** i)); }
  }
  failed.push(d); console.log("register FAILED " + d + " status=" + st + " after " + tries + " tries");
}));
console.log("registered " + n + " workspaces" + (failed.length ? ", FAILED " + failed.length + ": " + failed.join(", ") : ""));
