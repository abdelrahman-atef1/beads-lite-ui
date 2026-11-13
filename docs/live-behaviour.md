# Live behaviours the redesign must not break

Bead beads-lite-1bo5.6.59.1. Baseline: board-v2 a1bf92c. Every row has a passing
test; the runner is `node scripts/live-contract.mjs --ui 2` (writes
.work/out/<bead>/qa/summary.md). `--ui 3` lists the same rows as pending until
the v3 shell reaches cutover (task 17), where the rows are re-run against it.
The list here and scripts/live-rows.mjs are kept equal by test/live-doc.test.js.

Adding a behaviour: add a row in scripts/live-rows.mjs and in the table below
with the test that covers it. Gap tests are test/live-\*.test.js (node --test
style fixtures under vitest: real http + ws, real handlers, no bd, no card CLI).

| Row  | Behaviour                                                                                          | Tests                                                                                                     | Notes                                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| LB01 | Card state: waiting / asked / answered / none, with sha; a card with a secret is hidden            | server/features/cards.test.js                                                                             |                                                                                                                      |
| LB02 | Card answer (option or text): one CLI record, one wake, refusals leave no wake                     | server/features/cards.test.js                                                                             |                                                                                                                      |
| LB03 | Card ask before answering: thread, round, wake kind asked                                          | server/features/cards.test.js, server/features/cards.inline.real.test.js                                  |                                                                                                                      |
| LB04 | Wake state: queued / listening / delivered / none                                                  | server/features/cards.test.js                                                                             |                                                                                                                      |
| LB05 | Card CLI end to end (real card core, test home)                                                    | server/features/cards.real.test.js, server/features/cards.inline.real.test.js                             |                                                                                                                      |
| LB06 | Decisions feed: valid cards only, priority order, cached, pushed on change                         | server/features/decisions-feed.test.js                                                                    |                                                                                                                      |
| LB07 | Every feature socket type the UI sends is registered with the right mutating flag                  | test/live-wire.test.js                                                                                    |                                                                                                                      |
| LB08 | A socket without the board token, or from a foreign origin, never connects                         | test/live-wire.test.js, server/guard.test.js                                                              |                                                                                                                      |
| LB09 | Card handlers answer on the real socket with bad_input, not a crash                                | test/live-wire.test.js                                                                                    |                                                                                                                      |
| LB10 | Outputs list: per-bead and per-project outputs, rollup cap, bad input refused                      | server/features/outputs.test.js                                                                           |                                                                                                                      |
| LB11 | Outputs open: local image and report attachment served with safe headers, uniform 404              | server/features/local-img.test.js, test/report.test.js                                                    |                                                                                                                      |
| LB12 | Releases list and reader: newest first, paging, filters, read-only git                             | server/features/releases.test.js                                                                          |                                                                                                                      |
| LB13 | Notifier: decision and release events fire once, mute, mark-read, restart digest                   | server/features/notifier.test.js                                                                          |                                                                                                                      |
| LB14 | Push subscribe / list / remove, send rules (one per project per 2 min)                             | server/features/push.test.js                                                                              |                                                                                                                      |
| LB15 | Service worker: shell list and push handling                                                       | server/sw.test.js, server/sw.push.test.js, app/push-client.test.js                                        |                                                                                                                      |
| LB16 | Page: index with this launch token, hashed css and bundle, sw.js, manifest, healthz                | test/live-http.test.js, server/features/perf.test.js                                                      |                                                                                                                      |
| LB17 | Foreign Host or Origin gets 403 on the page and the API; phone door needs the owner identity       | test/live-http.test.js, server/phone.test.js                                                              |                                                                                                                      |
| LB18 | Frame headers on every response (frame-ancestors / X-Frame-Options)                                | test/live-http.test.js                                                                                    | pending .62 (not on board-v2 a1bf92c): the test self-skips with that reason and runs for real once the header exists |
| LB19 | Deep links open the right thing: #/issues?issue=<id>&at=<target>, #/decisions, #/board, #/releases | app/router.test.js, app/main.deep-link.test.js, app/utils/anchor.test.js, app/views/detail.anchor.test.js |                                                                                                                      |

## Not covered here

- Write paths against real bd (a card answer through the real card CLI is LB05;
  bd mutations are covered by server/ws.mutations\*.test.js).
- Visual layout: each screen task runs its own headless screenshots.
- The phone door over Tailscale itself: server/phone.test.js covers the identity
  rules; the tailnet hop is checked at deploy.
