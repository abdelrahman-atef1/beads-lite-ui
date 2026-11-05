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
