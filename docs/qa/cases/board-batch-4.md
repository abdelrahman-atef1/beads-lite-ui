# QA cases: board batch 4 (written from the bead requirements, before reading tests or code)

Beads: beads-lite-1bo5.13.29, .13.30, .13.31, .13.32, company-8ce8.17.13.
User: the owner on a phone (390 px), English and Arabic, board data from several projects.
Every UI case runs at 390 px in en and ar unless it says otherwise.

## 13.29 Cards without options
- C29-01 An owner_decision bead of type card that is NOT assigned to the owner shows on the Desk as a link to the task with a clear message saying why there are no options. It is not an empty card shell.
- C29-02 A card assigned to the owner with options still shows its options and can be answered (regression).
- C29-03 A card assigned to the owner with a free-text question still shows its text box (regression).
- C29-04 Every owner_decision bead is accounted for: Desk cards + Desk links = number of owner_decision beads.
- C29-05 Learner scan: a card whose text or title holds a bare file name (auth.json, config.php, tools.json, README.md-like names with non-domain extensions) is no longer hidden.
- C29-06 Learner scan still hides: example.com, evil.com/x.json, evil.com.json, http://x, www.x, a token-shaped string, a real user path (C:/Users/...).
- C29-07 The link message is readable in Arabic at 390 px (no clipping, RTL).

## 13.30 Blocked chip, header, author
- C30-01 A child of an open parent with no other dependency is NOT in the Blocked list and shows no Blocked chip.
- C30-02 A task with a real blocker (blocks dependency on an open bead) stays in Blocked and its card says "Waiting on <id>" (id of the blocker).
- C30-03 The task page lists only real blocking links, not the parent.
- C30-04 A task with no recorded time shows "not recorded" in the header, never "unknown", en and ar.
- C30-05 A comment written under the owner's git name but not posted through the board shows as "agent (no role)".
- C30-06 A comment posted through the board shows the owner's name.
- C30-07 A comment created before the guard date, or by another named author, is unchanged.
- C30-08 Boundary: task with two blockers (one closed, one open) names only the open one; task whose blocker closes leaves Blocked.

## 13.31 Back, list, filters
- C31-01 Open a task from a list scrolled down with filters set, press Back: same list, same filters, same scroll place.
- C31-02 Status Blocked + a Project filter shows the blocked tasks of that project when they exist; never "No tasks match" when data exists, also on a cold load and on a return.
- C31-03 Filter chips appear once (not twice), with data, with no match, and while loading.
- C31-04 Reload of the list keeps the filters.
- C31-05 A filter that truly matches nothing says so honestly (empty state, chips once).
- C31-06 Slow connection (throttled): the list stays usable, shows a loading state, not a false empty message.

## 13.32 Desk with project filter
- C32-01 With the connection on project A and Desk filtered to projects B and C, "moved today" and "active" show B and C's real numbers and items.
- C32-02 Desk with no filter counts all projects.
- C32-03 A filtered project with nothing moved today says so honestly.
- C32-04 Desk counts match the Tasks screen with the same filter.

## company-8ce8.17.13 Status chips on the owner report
- C17-01 A report with REACT 👀, 🛠️ and ✅ comments re: description shows the three chips under its description on the task page (en, ar, 390 px).
- C17-02 A report with only 👀 shows only that chip; none -> no chip row.
- C17-03 Waking-claim script posts 👀 on the report once; running it twice does not post a second.
- C17-04 The ON IT comment posted by the assignee leads to 🛠️ (hook run with the PostToolUse input shape).
- C17-05 Closing the report leads to ✅.
- C17-06 react.mjs onit emoji is 🛠️.
- C17-07 The hook ignores commands that are not bd comment/close, beads that are not owner reports, malformed or empty input; always exits 0 and never blocks the tool call.
- C17-08 The hook is not registered in any settings.json by this work (no harness config change).
- C17-09 Chips also show on the phone door.

## Degraded path (all UI cases)
- D-01 390 px: nothing clips or overflows on the Desk, Tasks, task page.
- D-02 Slow 3G: the Tasks list and Desk stay usable (covered by C31-06).
- D-03 Cold/empty: a project with no tasks.
- D-04 Payload: bytes shipped by the batch vs live b9e6cba (report the number).

## Mapping (added after the cases, run 2026-11-17 on aef36e4)
Scripts: qa/scan.test.mjs, qa/status-react.test.mjs (committed); ui-run.mjs, back*.mjs (.work/out/beads-lite-1bo5.13.31/qa/); vitest.
- C29-01..04, C29-07: ui-run (Desk en+ar) PASS. C29-05/06: qa/scan.test.mjs and ui-run PASS.
- C30-01, 02, 03, 05, 06, 07(other author), 08: ui-run PASS. C30-04: ui-run partial (no "unknown"); the "not recorded" text itself NOT COVERED live (needs a rollup row), vitest only. C30-07 older-than-guard comment: NOT COVERED live.
- C31-01: ui-run + back probes FAIL (first Back after a page load lands at the top). C31-02..06: ui-run PASS (3G: first card at 13.3 s).
- C32-01..03: ui-run PASS. C32-04 (equal to Tasks screen): NOT COVERED separately (counts compared with seed numbers: 4 active, 92 moved).
- C17-01/02: ui-run PASS (Description tab on phone). C17-03/04/05/06/07/08: status-react.test PASS. C17-05b DONE comment: FAIL (hook handles close only). C17-09 phone door: NOT COVERED.
- D-01 PASS (no overflow Desk/Tasks/task), D-02 PASS, D-03 NOT COVERED, D-04 +3.1 KB.
