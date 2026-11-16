# QA cases: board polish (beads-lite-1bo5.6.59.33)
Written from the bead text and the owner's point of view before reading the code or tests.
Owner = a person on a phone (390, ar, dark) or a PC (1440). Server started like production, scratch seeded store.

- P1 A one-option typed card (class type) opens on its task page and shows an answer text box there (not only on Desk).
- P2 Typing an answer and sending it on the task page records it: ONE comment, status leaves owner_decision, card leaves Desk, screen says answered.
- P3 Typed answer is length-limited; empty answer cannot be sent.
- P4 A tap card with 2 options still shows its option buttons on the task page (regression).
- P5 Offline at Confirm (network blocked): within a few seconds a message says waiting for the connection and the answer is kept; selection stays; no record written; no fake "answered".
- P6 After the connection returns, Confirm works again once, record written once, message cleared.
- P7 Stats screen rows read "name - title" (name first), in ar and en, at 390 and 1440, no clipping.
- P8 Settings is not in the top nav / sidebar nor in the More sheet at 390 or 1440; the other nav items remain.
- P9 `#/settings` still loads (no blank page, no console error).
- P10 Neighbours: Desk, Tasks, Releases, Time, Projects still open; no console/page errors; no horizontal scroll at 390.
- P11 npm test passes; scripts/v3-guard.mjs passes; routes-e2e desk check status is no worse than on base c1627f6.
