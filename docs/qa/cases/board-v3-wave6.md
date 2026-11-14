# QA cases, board v3 wave 6 (written blind, before reading any test or code)

Build under test: swe/board-v3 at 87edf2d. Beads: .59.19 (payload and route split), .59.14 (top search at phone widths), .59 (v3 smoke, ready for ?ui=3 deploy).
Viewports: 320, 360, 390, 414, 1440; ar/en; dark/light.

## A. .59.19 Legacy board unchanged (no ?ui=3)
- A-1 Every legacy screen opens with data and no console error: decisions, board, issues list, epics, releases, outputs, settings, and a task detail.
- A-2 A decision card can be answered (option and free text); the answer is recorded and the card leaves "waiting".
- A-3 The bell opens, shows unread dot and the notification list; marking read works.
- A-4 Report: attach an image, draw on it with the editor, Done, send; a report bead exists with the attachment.
- A-5 The service worker registers on the legacy page; a new sw.js version installs and activates (update); precache list includes the shell and chunks without a 404.
- A-6 Offline: after one visit, going offline and refreshing shows the shell (not a browser error page); coming back online reconnects.
- A-7 No v3 element, v3 socket frame, or /chunks request on the old board.
- A-8 Hard refresh on each legacy route lands on the same route.

## B. .59.19 Cold load, desk
- B-1 Fast 3G + 4x CPU, 390x844, new profile each run, median of 5: time to the desk on screen for v3 and for legacy. Flag any slice more than 10% worse than the CTO's numbers (v3 2.51 s, legacy 2.24 s) or than the legacy number measured here.
- B-2 Gzip payload of first load (js + css) measured as the CTO did (scripts/payload-v3.mjs).
- B-3 Lazy screens (task, tasks, time) on first open on the throttled profile: no blank content longer than 1 s between click and the first paint of the screen.

## C. .59.14 Top search, no horizontal scroll
- C-1 Real shell, real top-bar icons, search open: scrollWidth <= innerWidth at 320, 360, 390, 414, in ar (RTL) and en (LTR).
- C-2 Every top-bar icon and the search field are inside the window and tappable (>= 28 px) with search open.
- C-3 Search still finds by title and by id and opens the task.
- C-4 Close search: bar returns to its normal state.

## S. Smoke of every v3 screen, 8 combos (390/1440 x ar/en x dark/light)
- S-1 desk, tasks list, board, epics, task page, swimlanes, bulk select bar, projects, search, releases, top bar, time, experiments, ask head (open only): each renders with data.
- S-2 No console error, page error or failed request; no horizontal scroll; rtl in ar; no raw keys; no invisible text.
- S-3 Lazy screens load on first open with no blank flash > 1 s on the throttled profile.
- S-4 Ask head opens without sending a question.
