# Mapping (written after the cases): beads-lite-1bo5.6.26
Run: `BD_BIN=<bd.exe> bash tools/e2e/decisions-home/run.sh <worktree>` (reseeds) or `rerun.sh` (no reseed); `node tools/e2e/decisions-home/degrade.mjs ...`; `cold.mjs`; `npx vitest run server/features/decisions-feed.test.js app/views`.
D1-D3,D12 decisions.spec.mjs "D1-D3 D12"; D4,D5 "D4 D5"; D12 dark "D12 desktop dark"; D11 "D11" + "D11b"; D10 "D10"; D13 "D13"; D6,D9,D16 "D6 D9"; D6 typed "D6b"; D7,D8 "D7 D8" (id-level gate; list-level gate also in D1-D3 hidden ids).
D14 degrade.mjs phase no-rules; D15 degrade.mjs phase broken-workspaces. Cold start (F1) cold.mjs + probe2 (concurrent list).
D17 vitest affected (166 tests) + eslint on changed files + tsc (no new error in changed files). D18 gzip byte count by script.
NOT COVERED: phone door transport itself (tailnet Host / https Origin / redacting send; needs tailscale), slow-3G throttle, offline/reconnect refetch, real (non-copy) projects at scale (~15 workspaces), full vitest suite.
