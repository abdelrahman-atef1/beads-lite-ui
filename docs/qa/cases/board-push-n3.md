# Board Web Push (ADR 0007 N3) + bell fill: test cases (company-1bo5.6.16)

Written blind from the bead, ADR 0007 N3/N4/N5/section 6 and the owner's complaint
(«مفيش تنبيهات بتوصل نهائي»), before reading push.js, its tests or the harness.
Under test: origin swe/board-v2 dedc629 (N3) + 7d556d8 (bell fix). Not covered by design:
delivery to a real phone / FCM (needs deploy + owner's subscribe tap).

## Bell (N5) fills for every project
- B1 Project = cwd project: a valid parked card (owner_decision, card_state parked, card_title) appears in the bell within 30 s.
- B2 Second project registered AT START: same.
- B3 Project registered LATER by POST /api/register-workspace (what start-beads-ui does for non-cwd projects): its parked card fills the bell within 30 s without anyone opening the bell first.
- B4 Invalid card (no card_q / not parked): nothing in the bell.
- B5 Project switched off: nothing, and no watcher.
- B6 Restart after downtime: one digest event, not one per bead.

## Subscribe / unsubscribe
- S1 push-key returns the public key only (never the private key), same key twice (stable), key generated lazily.
- S2 push-subscribe with a valid https push-service endpoint is stored; list shows it; subscribing the same endpoint twice does not duplicate.
- S3 push-unsubscribe removes it; unsubscribing an unknown endpoint is harmless.
- S4 Hostile endpoint refused: http://, file:, localhost/127.0.0.1/192.168.x/169.254.x (SSRF), unknown host, userinfo, huge string, wrong types, missing keys (p256dh/auth).
- S5 Max subscriptions bound (more than a handful refused or oldest evicted, never unbounded).
- S6 push-subscribe from a client without the board token / wrong Origin / phone door without identity is refused (mutation behind D8).
- S7 Client UI: bell panel shows "Turn on for this phone"; on denied/unsupported shows an honest note, not an error dead end.

## Sending and caps
- C1 Parked card in project A pushes once to each subscription.
- C2 Second and third card in project A within 2 min do not push individually; they fold into ONE "N decisions waiting in A" after the window.
- C3 Project B is not held back by project A's window.
- C4 51st push of the day: one "more on the board" notice, then silence until local midnight; next day pushes again; state survives a board restart (restart does not reset the 50).
- C5 Push service answers 404 or 410: that subscription is deleted; 201 keeps it; 500/timeout keeps it and does not crash or block the bell.
- C6 A throwing/hanging sender never breaks the bell or the notifier.
- C7 mute_until in the future: no push, bell still fills.
- C8 Switched-off project: no push.
- C9 `answer` event (card_state explained): pushes once, "Answer to your question: <title>".
- C10 Duplicate (project, bead, round) does not push twice, also after restart.

## Payload (leaves the PC through the browser's push service)
- P1 Payload keys are only: kind, project, bead, title(card_title), count, at. Verified on the real encrypted request body decrypted with the subscription key AND on the object handed to the sender.
- P2 Never contains card_q, options, comments, description, the owner's words, assignee, tokens, paths, VAPID private key.
- P3 Desk/labelled/unknown-class bead: title is null; text says a decision waits at the PC (project) only.
- P4 Hostile card_title (script tags, very long, control chars, newlines): service worker shows it as plain text, truncated, no injection.
- P5 Request to the push service carries a VAPID JWT whose audience is the endpoint origin, subject is not a personal email; headers contain no board token.

## Key file and secrets
- K1 vapid.json, push-subs.json, push-state.json live only under %USERPROFILE%/.codesters/board (BDUI_BOARD_HOME for tests); never in the repo tree, never in .gitignore-missing paths.
- K2 ACL of that folder and files: owner + SYSTEM only (icacls); inheritance off. If icacls fails, no key is written and push stays off (fail closed).
- K3 Private key never in git history, never in server logs/stdout/stderr, never in any socket reply, never in /api, sw.js, the shell cache.
- K4 vapid.json holds only publicKey/privateKey.
- K5 Subscriptions (endpoints are capabilities) never logged, never shown to the phone door beyond the caller's own.

## Tap opens the bead
- T1 notificationclick with an open board window: focuses it and navigates to /#/issues?issue=<id>.
- T2 With no window open: opens a new window at that URL on the phone door origin.
- T3 Click on a "more on the board"/folded notice opens the board (no bad id).
- T4 Hostile bead id in a payload does not navigate off-origin or inject.

## Regression / suite
- R1 Full vitest suite, via the heavy key: no new failure against base 59470c7 (known: detail.dates 7, db.test 2, notifier W3 on base).
- R2 Install piece (manifest, SW shell cache, "/" and /api never cached) still passes after SW gained push handlers.
- R3 SW update replaces the worker; push handlers present in the served /sw.js.
- R4 Payload size of the new client code (bytes added to main bundle / sw.js).
- R5 Degraded: 390x844 bell panel with push row has no overflow; slow link: push row does not block the bell.

## Addendum (from SEC's blocking conditions W1-W9 on company-1bo5.6.15, read after the first list; still written before any mapping)
- W1 Subscription: https only, allow-listed push hosts, no userinfo/port, <=1 KB, p256dh exactly 65 bytes and auth exactly 16 bytes base64url, max 5 (junk must not evict a real phone), re-checked on load.
- W3 Desk gate fails closed for both kinds: label-desk bead, card created by role sec, child of a parent labelled owner-pc-only: no title in bell or push.
- W6 Lost phone: Settings on the PC door lists subscriptions (label, created, last ok) with Remove; removal stops pushes to that phone.
- W9 Caps fail closed: unreadable counter file = no push; 5xx tried once, no loop, subscription kept.
- K6 Lost key (ADR: "re-subscribe once"): after the board's VAPID key changes, "Turn on" on a phone holding an old-key subscription must subscribe again.
