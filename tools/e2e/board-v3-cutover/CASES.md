# QA wave 6 cases: board v3 becomes the default (beads-lite-1bo5.6.59.17)

Written from the requirement and the owner's point of view BEFORE reading the tests or the harness.
Owner = a person on a phone (390 wide, Arabic RTL, dark) or on a PC (1440, dark or light) who opens the board link he already has.
Requirement: opening the board with no flag shows the new board; every old link still works; nothing of the old board is left; nothing got heavier or broke.

## A. Default and no legacy
- A1 Opening `/` with no query shows the new shell (top bar, nav) at 390 ar dark, 1440 ar dark, 1440 en light.
- A2 No legacy DOM (`#shell`, legacy classes), no request to a legacy asset (styles.css, legacy views), no `?ui` in the final URL needed.
- A3 `?ui=3`, `?ui=2`, stored `bl.ui` = 2 or 3 in localStorage: all land on the new board without a blank page or error.
- A4 First load total (index + js + css) gzip over the wire at or under 131,064 B; number reported.
- A5 Service worker registers, precaches a shell where every listed URL answers 200, nothing legacy listed; offline reload still opens the shell.

## B. Every screen (390 ar dark, 1440 ar dark, 1440 en light)
- B1 Stats home (`#/`, empty hash): blocks render, no raw keys, no horizontal scroll.
- B2 Desk / decisions (`#/decisions`): list, a waiting card visible, count matches.
- B3 Tasks: list, board, epics; filters (status, project, assignee/search) change the list and survive refresh; clearing restores; bulk bar opens (enter, select one, cancel).
- B4 Task page for a bead: title, description, comments, jump targets; ask head opens (nothing sent).
- B5 Releases: list from the seeded store; open one (reader with tasks); link of a deploy is shown and safe; download of a build returns the file with the right bytes and a safe name.
- B6 Time screen (with and without flow data).
- B7 Projects screen lists the three registered projects; opening one filters tasks.
- B8 Settings: language and theme switch persist across refresh; push section shows an honest state.
- B9 Notifications bell: opens, lists items, marks read, closes; at 390 does not clip.
- B10 Search: type a word, hits, tap a hit opens the task (also after visiting another screen first).
- B11 Digits are Western in Arabic; ids monospace; text direction per block.
- B12 No console errors or page errors, no 4xx/5xx except expected, no horizontal scroll, controls inside the window, tap targets >= 28 px.

## C. Old links
- C1 `#/issues?issue=<id>&at=` each of c-last, c-1, description, design, notes, acceptance, card: opens the task and scrolls/highlights the target.
- C2 `?ui=3#/issues?issue=<id>` opens the same task.
- C3 `#/issue/<id>` (older form) opens the task.
- C4 `#/`, `#/decisions`, `#/board`, `#/epics`, `#/issues`, `#/releases`, `#/time`, `#/projects`, `#/settings`: each opens the right screen; refresh keeps it; back button returns.
- C5 Unknown id: honest "not found", no crash. Old company id that moved: opens the new bead with a moved note.
- C6 A push link and a card link (as the service worker builds them) open the card on the task page.
- C7 Unknown hash lands on a usable screen.

## D. Owner decision card (test bead in the scratch store)
- D1 A waiting card shows on Desk and on its task page with options.
- D2 Pick an option then Confirm: the record is written once (comment, status moves back, assignee back), the card leaves Desk, the screen says answered.
- D3 Exactly one wake event is queued, with no free text; the card shows the wake state.
- D4 Double tap on Confirm, or answering a stale card (already answered in another tab): honest refusal, no second record.
- D5 Offline at Confirm: honest message, selection kept, no loss; online again: retry works.
- D6 Same flow through the phone door (Tailscale host) at 390.
- D7 A typed-answer card (text) works and is limited in length.
- D8 Attachments (`card_att`): thumbnails render (image loads, size > 0), tap enlarges or opens; a link item is shown but never fetched; an item outside the allowed shape never renders; no external image request.
- D9 Push: a new waiting card with one subscription writes one push-log line (bead id, result, short sub id), no endpoint or key in the file; the same card does not push twice.

## E. Doors and headers
- E1 PC door answers on localhost only; a foreign Host gets 403 on page and API.
- E2 Phone door: right tailnet host plus owner login header opens the board; wrong host, missing login, foreign Origin on the socket are refused.
- E3 Frame headers on every response (frame-ancestors / X-Frame-Options).
- E4 Server starts with BD_BIN unset and logs the bd path line; board lists beads.

## F. Degraded path
- F1 Slow 3G + 4x CPU: stats home first content time; lazy screens (tasks, task, time) blank flash <= 1 s.
- F2 Cold state: no flow data, no push subscription, no attachments: empty states are readable, no error toasts.
- F3 Quota/limit: push cap and card round cap give an honest text, not a dead end (covered by live-contract rows LB02/LB14).
- F4 390 wide: every screen has no sideways scroll; 320 and 360 spot check on Desk and Tasks.

## G. Regression memory
- G1 Wave 6 F1 (lazy first open blank <= 1 s), F2 (bulk bar 390 EN long column), F3 (search tap pageerror) stay fixed.
- G2 SRE defect from deploy 1: Stats names read "name - title" in the right order.
- G3 Mention picker opens in a comment box and inserts a role; nothing sent.

## H. Gates
- H1 live-contract `--ui 3` all rows pass. H2 Full unit suite green (MENTION_TEST_STRICT=1). H3 Every live commit is an ancestor of the tested commit.
