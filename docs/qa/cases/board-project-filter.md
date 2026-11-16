# Cases: no project picker, Project becomes a filter (beads-lite-1bo5.13.24 / .1 / .2)

Written from the approved spec and the owner wireframes, before looking at tests or code.
Phone 390x844 is the default; 1440x900 where noted. Each case runs in ar-dark and en-light (and the other two combos for visuals).
Data: scratch copy of ALL real stores (15 projects).

## A. Projects page (More > Projects)
- A1 Page lists every project with its task count and how many wait for the owner; no "All" row, no "Current" row, no radio/tick for a chosen project.
- A2 Tapping a project row opens Tasks with the Project filter = that project; only that project's tasks show; the chip says the project; the page did NOT reload.
- A3 Tapping a row does not change which project anything is written to behind the user's back (no switch): going to Desk afterwards still shows all projects.
- A4 Counts on the rows match the counts of the same project in Tasks (not "-" or 0 for real projects).
- A5 A project with zero tasks still has a row, still opens Tasks (empty state, not an error).
- A6 Phone 390: rows 44px+ tall, nothing clipped or scrolling sideways; Arabic RTL order right.
- A7 Back from Tasks returns to Projects.

## B. Desk
- B1 Desk shows all projects' decisions by default (as before the change), with Search, Filters button, Urgent chip, Project chip.
- B2 Filters sheet has Project, Assignee, Priority, Type, Label; it has NO Status section.
- B3 Choosing one project in the sheet narrows the cards to that project only; the count line/chips update; the Project chip shows the choice ("rayeh", "rayeh +1" for two).
- B4 Removable chips: tapping x on a chip removes that filter and widens the list; "Clear" removes all.
- B5 Filtering to a project with no decisions shows "No decisions match" with a way to clear; not blank, not an error.
- B6 Urgent chip narrows to urgent only and combines with Project.
- B7 Search box narrows decisions by text, combines with Project.
- B8 Desk filters are its own set: setting a Status or Project filter in Tasks does not empty or change Desk, and Desk's choice does not change Tasks.
- B9 Desk filter is remembered after a reload (same device) and is not put in the URL.
- B10 Only one project in the system: Project chip and section are hidden (checked by unit test; real data has many).
- B11 Phone 390: chips wrap, no horizontal scroll, buttons 44px+; sheet opens, scrolls, closes with "Done".
- B12 Answering a decision still works while filtered (a decision from another project than the last one used is answered in its own project).
- B13 Desk header stat chips (decisions / steps / busy) still present.

## C. Tasks
- C1 Tasks has a Project filter in the sheet and an open chip; multi-select (two projects) shows both projects' tasks, nothing else.
- C2 Group-by still works and the Project filter combines with other filters.
- C3 URL ?project=a,b style link preselects the projects (if 13.16 spec: check it works), shareable.
- C4 Tasks filters unchanged otherwise (Status etc. still present in Tasks, not removed by the Desk change).
- C5 Task detail opens for a task in a project other than "current" and shows its comments and fields; posting a comment goes to that task's own project (not another).
- C6 No filter match: friendly empty state with clear.

## D. New task
- D1 New task sheet has a Project field listing all projects.
- D2 Default: with exactly one project in the Project filter, that project is preselected; with none/many, the last project used on this device; with neither, nothing selected and Create is disabled until one is chosen.
- D3 New task opened from a task's detail defaults to that task's project.
- D4 Creating a task in project X puts it in project X (found there by id prefix and in the Tasks list), and does NOT appear in any other project.
- D5 After creating in a project other than the one you were viewing, the app ends on a consistent screen (no stale list, no wrong-project list), no manual refresh needed.
- D6 Creating with empty title is refused with a clear message; double-tap Create makes one task.
- D7 Bug report form still has its own project select and is unaffected.

## E. Stats
- E1 Stats default = all projects, numbers as before; a Project chip beside the period pills (hidden if one project).
- E2 Pick a project: every number card narrows to that project (summary finished-this-week, stuck, tokens per role, time, quality); numbers differ from "All" and equal the Tasks/closed data of that project.
- E3 "Tokens per project" card hides when a single project is chosen; shows again on All.
- E4 "All" in the chip clears the filter; choice remembered per device after reload.
- E5 Changing the period keeps the project; changing the project keeps the period.
- E6 Project with no data: honest empty/"too few" text, never 0 pretending to be known, no error.
- E7 Bad project key sent to the server (path characters, huge string, unknown name) is rejected or empty, never an error page, never reads another folder.
- E8 Server cost: repeated project picks use a bounded cache; no polling started; idle cost unchanged (no timer).
- E9 Machine wake latency stays global (declared) under a project filter; the card says so or is clearly not project-scoped.
- E10 Phone 390: chip + period pills fit one row or wrap cleanly; no overflow; 44px targets; 1440: layout sane.

## F. Everywhere / unchanged
- F1 No workspace/project switch control anywhere in the app (More, header, settings).
- F2 Releases, Notices (push on/off per project), Report form, task link / notice tap opening a task by id: all still work.
- F3 Opening a task link for a task of a project different from the last one works (loads that task, comments).
- F4 After a full reload no stale "saved project" forces a different project than the open task.
- F5 Both languages: no missing/English-in-Arabic strings in the new surfaces; digits Western as in the rest; RTL chips ordered correctly.
- F6 Light and dark: contrast of new chips/sheet readable; no invisible text.
- F7 No console/page errors in any of the flows.
- F8 Degraded: slow 3G profile: Projects->Tasks and Desk filter stay usable (filters are client side, no extra round trip per tap); server filter on Stats shows loading state not a dead spinner; offline: filters still work on loaded data.
- F9 Payload: bundle size change vs board-batch-2 reported.
- F10 Merge: branch merges onto swe/board-batch-2 (conflicts reported); merged result passes the app and server test suites.
- F11 Real stores untouched: server and tests only ever use scratch paths; marker task created during the run is not found in any real store.
