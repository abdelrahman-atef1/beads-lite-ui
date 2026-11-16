// node --test test/scripts/ready-register.test.mjs : slow/timeout store must not drop a workspace (beads-lite-1bo5.6.59.38)
import { test } from "node:test";
import assert from "node:assert";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const script = path.resolve(import.meta.dirname, "../../scripts/bdui-ready-register.mjs");
const fwd = (p) => p.split(path.sep).join("/");
function run(slowFirst, alwaysSlow) {
  return new Promise((resolve) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "reg-"));
    for (const n of ["a", "b"]) fs.mkdirSync(path.join(root, n, ".beads"), { recursive: true });
    const seen = {};
    const srv = http.createServer((q, r) => {
      if (q.url === "/api/workspaces") { r.end("[]"); return; }
      let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => {
        const p = JSON.parse(b).path; seen[p] = (seen[p] || 0) + 1;
        if (p.endsWith("/b") && (alwaysSlow || seen[p] <= slowFirst)) return; // never answers: client times out
        r.end("{}");
      });
    }).listen(0, () => {
      const env = { ...process.env, BDUI_REG_TIMEOUT_MS: "150", BDUI_REG_BACKOFF_MS: "20", BDUI_REG_TRIES: "4" };
      const c = spawn("node", [script, `http://127.0.0.1:${srv.address().port}`, "5", fwd(root), "", fwd(root)], { env, windowsHide: true });
      let out = ""; c.stdout.on("data", (d) => (out += d));
      c.on("close", (code) => { srv.closeAllConnections(); srv.close(); fs.rmSync(root, { recursive: true, force: true }); resolve({ out, code, seen }); });
    });
  });
}
test("slow store: timeouts are retried until registered", async () => {
  const r = await run(2, false);
  assert.equal(r.code, 0); assert.match(r.out, /registered 2 workspaces/); assert.doesNotMatch(r.out, /FAILED/);
  assert.equal(Object.values(r.seen).sort().join(), "1,3");
});
test("store that never answers: bounded tries, failing workspace named", async () => {
  const r = await run(0, true);
  assert.equal(r.code, 0); assert.match(r.out, /register FAILED .*\/b status=0 after 4 tries/); assert.match(r.out, /registered 1 workspaces, FAILED 1/);
});
