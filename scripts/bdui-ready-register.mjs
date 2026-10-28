// Helper for start-beads-ui.sh (company-yhc8): one node process waits (wall-clock deadline) until the board answers,
// then registers every workspace. Replaces ~120 curl forks and ~13 cygpath+curl forks, each of which cost seconds under CPU load.
// usage: node bdui-ready-register.mjs <baseUrl> <deadlineSec> <here(posix)> <listFile|""> <newRoot(posix)|"">
import http from "node:http";
import fs from "node:fs";
const [url, deadlineSec, here, listFile, newRoot] = process.argv.slice(2);
const w = (p) => (/^\/[a-zA-Z]\//.test(p) ? p[1].toUpperCase() + ":" + p.slice(2) : p); // /e/x -> E:/x
const call = (method, path, body) => new Promise((res) => {
  const r = http.request(url + path, { method, timeout: 5000, headers: { "Content-Type": "application/json" } }, (x) => { x.resume(); x.on("end", () => res(x.statusCode)); });
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
let n = 0;
await Promise.all(dirs.map(async (p) => { const d = w(p); if (!fs.existsSync(d + "/.beads")) return; await call("POST", "/api/register-workspace", JSON.stringify({ path: d, database: d + "/.beads" })); n++; }));
console.log("registered " + n + " workspaces");
