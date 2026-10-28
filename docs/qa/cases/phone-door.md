# Phone door cases (company-1bo5.6.5)

Written from the bead and SEC conditions B2-B4, before reading tests or harness.
Door = second loopback listener (default 3001) reached only through `tailscale serve`; PC door = 3000.

## Identity and access (B2)
- C01 Phone request with the owner's Tailscale-User-Login and tailnet Host: 200.
- C02 Same request, no identity header: 403.
- C03 Same request, a different login: 403.
- C04 Owner login in different case / with spaces: decide and record (case-insensitive ok).
- C05 Identity header sent twice (repeated): refused.
- C06 No phone.json and no env owner login: every request 403 (fail closed), including / and /att.
- C07 phone.json malformed / owner_login not a string / empty: 403.
- C08 Right identity but Host 127.0.0.1 or localhost or evil.example: 403.
- C09 Right identity, tailnet Host, Origin http:// (not https) or foreign Origin: 403 on POST and on WS upgrade.
- C10 WS upgrade without identity / wrong token / PC token on the phone door / phone token on the PC door: refused.
- C11 Phone token differs from PC token; reading the page via phone door gives phone token only.
- C12 Phone door binds loopback only, not 0.0.0.0; PHONE_PORT=0/off disables; busy port does not kill the PC door.
- C13 /api/workspaces and /api/register-workspace are not available on the phone door.

## Allowlist of messages (B3)
- C20 ping, subscribe-list, unsubscribe-list, get-comments, add-comment, create-issue work for a normal bead.
- C21 delete-issue (any delete type) refused with an error, bead still exists after.
- C22 Label add/remove (esp. removing a desk label from a desk bead) refused; labels unchanged after.
- C23 Edit title/description/status/priority/assignee refused; bead unchanged after.
- C24 set-workspace, register, any unknown type, any feature type not opted in: refused.
- C25 Malformed JSON, missing type, huge frame, wrong payload types: refused without crashing the process.
- C26 get-comments / add-comment on a desk bead: refused, nothing written.
- C27 get-comments on a bead that does not exist or cannot be read: refused (fail closed).
- C28 create-issue with labels / assignee / created_by tricks in payload (labels:["owner-pc-only"], assignee:"sec"): extra fields ignored; cannot create a desk-looking bead, cannot spoof.
- C29 Bead id injection in get-comments (flags like --help, spaces, path chars): refused.

## Desk beads are pointers (B4)
- C40 Bead with desk label (each of the R18 labels), card_class=desk, created_by sec/legal, assigned sec/legal: delivered as pointer only (no title, description, design, notes, acceptance, comments).
- C41 Same bead nested inside another bead's dependencies/dependents/children: also a pointer.
- C42 Desk bead appears in snapshot, in later upsert (after an edit on PC), in detail subscription: always pointer.
- C43 Non-desk bead is delivered in full on the phone.
- C44 A bead turning desk after being sent (label added at PC): next frame is a pointer.
- C45 Error replies on phone carry no stderr/details/paths.
- C46 Every outbound frame type on the phone is on the allowlist; unknown types dropped.
- C47 Pointer still lets the owner see id, status, priority; says to answer at the PC.

## Attachments
- C50 /att/<project>/... for a non-desk bead's screenshot opens on the phone door (right bytes, image content type).
- C51 /att for a desk bead's screenshot: 404.
- C52 /att for an orphan file (no owning bead): 404; path traversal: 404/403.
- C53 /att without identity: 403.

## Report flow (owner's top ask)
- C60 From the phone door (identity, tailnet Host, https Origin, phone token): filing a report with text works; a bead is created.
- C61 Report with a screenshot attached: bead created, image saved, response has image path.
- C62 The /att link in that bead opens the screenshot through the phone door.
- C63 Report with PC token on the phone door / no token / no custom header / wrong content-type: 403.
- C64 Oversized image / non-image bytes: refused with an honest message, no bead half-created.

## Reading the board
- C70 Phone socket subscribes to the board lists (ready/blocked/in-progress/closed) and receives snapshots; update pushes arrive live.
- C71 list-workspaces / get-workspace work.

## PC door unchanged
- C80 PC door at its port: no identity needed, loopback Host OK, PC token works, delete/label/edit still work, all message types, /api/workspaces works.
- C81 A phone client and a PC client at the same time: PC sees full desk text; phone sees pointer; broadcasts do not leak to the phone unredacted.
- C82 Running with no PHONE_PORT leaves the PC door behaviour identical.

## Degraded / cheap device
- C90 Phone page load payload size over the phone door (bytes of index + snapshot) recorded.
- C91 Socket drops mid-report: no half-bead; retry gives clear result.
- C92 Phone door error text is plain and honest (says why: not allowed / answer at PC).

## Mapping (added after the cases; run 2026-10-28 on 3e96b76, real process, ports 3957/3958)
Automated by docs/qa/e2e/phone-door-e2e.mjs (needs the worktree path and bd.exe path edited; log in phone-door-e2e.run8.log) and server/phone.test.js (15 unit tests, pass).
- C01-C05, C08-C11, C13, C06/C07: e2e, PASS. C12a/b/c: PASS. C12d (busy phone port): FAIL, process crashes (EADDRINUSE unhandled on WebSocketServer).
- C20-C29: e2e, PASS. C40-C47: e2e. C40/C41/C42c FAIL: desk title leaks in blocked_by_detail of a non-desk bead. Others PASS.
- C50-C53: PASS. C60-C64: PASS (C63e gives 400 not 415, same on PC door).
- C70-C71, C80-C82: PASS except C82 (default PHONE_PORT 3001 with no env) NOT COVERED: would bind the real 3001.
- C90: index 4010 B, 5-bead snapshot about 2-4 KB. C91 (drop mid-report) NOT COVERED.
- N8 (Tailscale serve strips client-sent identity header): NOT COVERED, needs real serve (SRE .6).
