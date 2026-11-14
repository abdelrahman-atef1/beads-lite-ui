# QA cases, board v3 wave 5 (written blind, before reading any test or code)

Beads: .59.13 (@ picker), .64.1 (wake failed), .59.4 (steps wording), .59.11 (alert after Keep first 50), .59.12 (in progress count), .59.21 (bd lookup), .16.1 (push log), .66.7 (experiments, digest, weekly push, sw.js), old board, v3 smoke.
Viewports: 390 RTL phone, 1440 PC; dark/light; ar/en.

## L. Lows batch
- L-1 (.59.13) At 1440, open a task, type @ in the comment box: the picker opens and its FIRST row is fully visible inside the window (not above the top edge, not under the top bar). Same at 390.
- L-2 (.59.13) Arrow-down/up and Enter pick a name; Escape closes; a chip appears.
- L-3 (.64.1) A wake that fails to emit (wake binary exits non-zero) shows "failed, retry" (ar equivalent), not "limit"; a retry control exists; a real limit still says limit.
- L-4 (.59.4) A steps item with no label shows the steps wording, not a blank or generic word; a labelled one keeps its label.
- L-5 (.59.11) Select 51 tasks: red alert; press "Keep first 50": count 50 and the red alert is gone; actions still work.
- L-6 (.59.12) "N in progress" (desk/role/time) equals the number of in_progress beads of that scope, and excludes open, deferred, test, merge, owner_decision, blocked.

## B. bd lookup (.59.21)
- B-1 Server started with NO BD_BIN, PATH has the npm shim dir first: it starts, prints exactly one "bd: using <path>" line, serves a list.
- B-2 BD_BIN set: used as before, no lookup line.
- B-3 Failure: if bd cannot be found the server says so plainly, does not hang.

## P. Push log (.16.1), spot check
- P-1 A push attempt writes one line to the log with no secret, no endpoint, no subscriber id; an error label is from a short fixed list.
- P-2 No send happens in the test (fake sender).

## X. Experiments, digest, weekly push (.66.7)
- X-1 Experiment view lists each experiment with arms (before/during), n per arm, time (median), quality counters, and the verdict pill with the script's reason. No adopt/roll-back button, no input.
- X-2 Digest card is exactly 5 lines, bead link opens the bead; empty state when there is no digest.
- X-3 Weekly push goes through a FAKE sender: one on a new week file; repeated trigger sends none; a second file inside 6 days sends none; a digest with no findings sends none; files older than 8 days send none; payload has no digest text; a muted subscriber gets none.
- X-4 sw.js shows a flow-specific title/body for kind flow (not the generic "More on the board") and opens the time/experiments screen, not decisions.
- X-5 Uses the real rollup.mjs output on db copies; 390 no horizontal scroll, RTL, no console errors.

## O. Old board
- O-1 Without ?ui=3 the old board renders and works as before; no v3 element, no v3 request (flow, mention).

## S. Smoke of every v3 screen: desk, tasks list, task page, swimlanes, bulk bar, projects, search, releases, top bar, time, experiments
- S-1 Each screen renders in 8 combos (390/1440 x ar/en x dark/light) with data.
- S-2 No console error, no page error, no failed request that is not an intended 4xx.
- S-3 No horizontal scroll at 390; RTL dir=rtl in ar; nothing clipped or untappable (targets >= ~32px) at 390.
- S-4 Text contrast readable in light and dark (no invisible text); Arabic shows Arabic labels, no raw keys.
- S-5 Cold/empty state: a project with no tasks shows a sentence, not a blank.
