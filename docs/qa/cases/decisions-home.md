# Decisions home: cases (beads-lite-1bo5.6.26), written from the requirement before reading code/tests

Owner: Decisions screen opens with All projects selected; multi-select dropdown at top filters by project; works at phone width (RTL) and desktop.

D1 Open the Decisions screen fresh: selected projects = All; list shows pending decisions from every registered project.
D2 Each row shows a project chip and a priority symbol (no "P0-P4" text/emoji); order: pending first, higher priority first.
D3 Dropdown at top of screen; opening it lists every project plus an All entry, each with a checkbox; All is checked on load.
D4 Pick one project: only that project's cards show. Pick a second: union of both. Uncheck all / re-check All: back to all projects.
D5 Reload page: opens on All again (default, not a stale filter) .
D6 Tap an option on a cross-project card, confirm: answer is recorded as a comment on the bead in ITS project db (not the current workspace), assignee/status updated there; card leaves the list; other project's db untouched.
D7 Desk cards (human/desk type) and invalid-card beads are shown as pointer only or not at all; never answerable.
D8 A card containing a secret-like string is not exposed.
D9 Empty state: no pending decisions (and filter yielding none) shows a clear message, not a blank.
D10 Keys 1-9 pick the option; Confirm needed to send.
D11 Phone 390x844 RTL Arabic: no horizontal overflow, dropdown usable, tap targets >=44px, text Arabic.
D12 Desktop 1280 LTR English, dark and light.
D13 Idle: no timer-driven bd spawn; change in a project db pushes an updated list to an open client without reload.
D14 Feed failure (cards core missing/unreachable): screen degrades (falls back, honest message), does not crash/blank.
D15 Registered workspace whose db is missing/broken does not take down the whole feed.
D16 Answer twice / already-answered card (race): second attempt is rejected cleanly.
D17 Regression: existing single-project views (board, detail) still load; full unit suite passes; lint/tsc not worse than base.
D18 Payload: bytes added to client bundle (report number).
