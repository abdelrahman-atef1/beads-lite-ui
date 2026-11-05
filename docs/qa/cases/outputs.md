# Cases: Board Outputs panel (beads-lite-1bo5.6.18) — written blind from the success condition and SEC O1-O4

Success: a story's panel shows children's commits (id in subject, landed flag, remote link), OUTPUT v1 records, deduped mentioned https links, report images; rollup capped at 50 beads; reopening with no DB change spawns no bd; git read incremental; links safe (https only, noopener).

## Content
- C1 Story with children and commits: panel lists each child's commits whose subject contains the child id; each shows short sha, subject, which bead.
- C2 Landed flag: a commit reachable from the integration branch shows landed; one only on a side branch shows not landed.
- C3 Remote link: commit has a link to https://github.com/<owner>/<repo>/commit/<sha> when remote is github.com; no link when remote is another form.
- C4 Valid OUTPUT v1 comment line shows as an output record (kind, label, ref/commit).
- C5 Invalid OUTPUT v1 line (bad kind, >1 KB, bad commit hex, label >80, unknown field, secret-like value) is NOT a record; shown as a plain comment.
- C6 Mentioned https links in comments/description appear once each (dedupe, also same URL in several comments).
- C7 Report image attachment/reference renders as an image (or a link) and does not break layout.
- C8 Bead with no outputs: calm empty state, no error.
- C9 Rollup of an epic/story with >50 descendants: capped at 50 beads, says so, no hang.
- C10 Project Outputs view from the header lists outputs across the project, capped, opens.

## Safety (SEC)
- O1 A phone/any comment carrying a forged OUTPUT line with bad fields fails closed (plain comment); validator missing => panel says some outputs hidden, no crash.
- O2 Links with javascript:, data:, file:, vbscript:, http: (non-local host) are refused (text only); https and http to 127.0.0.1/localhost allowed; every anchor has rel noopener noreferrer; a path ref is text only and the server has no endpoint serving a file by ref (probe /api/outputs/... with ../ and absolute paths).
- O3 Phone door: a desk child's commit subjects, outputs, links never appear in a non-desk parent's rollup; PC door shows them (per ADR full-control note).
- O4 Remote with token userinfo (https://TOKEN@github.com/o/r.git) yields link without token; ssh/other forms yield no link; raw remote URL appears nowhere in the response or DOM.

## Performance / behaviour
- P1 Reopen the same bead with no DB change: zero bd spawns.
- P2 After a new commit lands, git read is incremental (not a full log of all history); unchanged => only a cheap ref check.
- P3 First card time vs live cf9c608 not meaningfully slower (panel loads after card).
- P4 Concurrent identical requests share one read.

## Surfaces
- S1 PC 1440 and phone 360: no horizontal overflow, nothing untappable, panel readable.
- S2 EN and AR (RTL): layout mirrored, text not clipped, shas/URLs stay LTR.
- S3 Phone door socket end to end: panel data arrives via the phone socket, with O3 applied.
- R1 Regression: header, folded comments, decision card, live Decisions view still work.

## Mapping (added after the cases above were committed; QA 2026-11-05, build e04e2b7)
Scripts live in `.work/scratch/beads-lite-1bo5.6.18-qa/` (server.qa.test.mjs = node --test, ui.spec.mjs / ux2.spec.mjs = Playwright, timing.mjs, cold.mjs, remotes.mjs); reports in `.work/out/beads-lite-1bo5.6.18/qa/`.
- C1 C1b -> server.qa.test C1, C1b, R-real | C2 -> C2, R-real | C3 O4 -> C3/O4 + remotes.mjs (20 remote forms) + U1 (link in DOM)
- C4 C5 O1 -> C4/C5/O1, O1b | C6 -> C6 | C7 -> C7, U1 (image loads) | C8 -> C8, C8b, U3 | C9 -> C9, U4 | C10 -> C10, U2
- O2 -> O2 hrefs, O2 no endpoint, U1/U2 anchors, U5 (hostile server data, client defence) | O3 -> O3, O3b | O4 -> as C3
- P1 -> P1 (bd shim log) | P2 -> P2, P2b, P2c, P2d | P3 -> timing.mjs, cold.mjs | P4 -> P4
- S1 -> U1/U2 pc 1440 + phone 360 | S2 -> same, ar | S3 -> S3, O3 (socket on the phone door, own server) | R1 -> R1, D3
- Degraded: D1 slow 3G, D2 failed request, D3 idle cost.
- NOT EXERCISED: phone door rendered in a browser (door needs an https Origin on a tailnet host; socket-level only); validator-missing degraded banner (swe unit test only); live production data (db copy only).
