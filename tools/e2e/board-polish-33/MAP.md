Case to test map (beads-lite-1bo5.6.59.33). Run: node env.mjs (server, seeded scratch stores), node run.mjs, node stop.mjs. Paths in paths.mjs point at the QA worktree.
P1-P3 run.mjs P1-P3-pc / P1-P3-phone; P2b Desk; P4 run.mjs P4; P5-P6 run.mjs P5-P6-390-ar-dark, 390-en-dark; P7 run.mjs P7-*; P8-P9 run.mjs P8-P9-*; P10 run.mjs P10-*; P11 npm test (vitest), scripts/v3-guard.mjs, app/ui/e2e/routes-e2e.mjs on base and branch.
NOT COVERED: offline card message text in English on an English card (message is in the card's own language; unit test in card.test.js covers en).
