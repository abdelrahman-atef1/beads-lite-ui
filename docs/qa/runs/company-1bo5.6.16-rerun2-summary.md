# QA summary: board Web Push N3 (company-1bo5.6.16)

Totals: PASS 146, FAIL 3, NOT EXERCISED 2

## unit (1 s)

| id | result | case | detail |
|---|---|---|---|
| S4 | PASS | hostile endpoints refused (http, file, loopback, lan, link-local, evil host, suffix trick, userinfo, port, huge, non-string) |  |
| S4b | PASS | real push services accepted (FCM, Mozilla, Apple, WNS) |  |
| S4c | PASS | missing / wrong-type / oversize / non-base64 keys refused |  |
| S4d | PASS | allow-list is exact push services only (storage.googleapis.com must be refused) |  |
| S5 | PASS | subscriptions bounded at 5: the sixth phone is REFUSED (too_many) and the first five stay (no eviction) | kept 5, sixth -> too_many |
| S2 | PASS | same endpoint twice does not duplicate |  |
| S3 | PASS | unsubscribe removes; unknown endpoint harmless |  |
| S3b | PASS | unsubscribe with a non-string is a clean error |  |
| S1 | PASS | push-key returns the public key, stable across calls and equal to vapid.json publicKey |  |
| K4 | PASS | vapid.json holds only publicKey + privateKey |  |
| K4b | PASS | restart reuses the same key (no rotation) |  |
| K2b | PASS | ACL lock fails -> no key generated, push-key errors, no vapid.json written |  |
| K2c | PASS | ACL lock fails -> send degrades silently (nothing posted) | none |
| K2 | PASS | icacls: board folder, vapid.json, push-subs.json grant only the owner and SYSTEM (inheritance off) | NT AUTHORITY\SYSTEM / ABDELRAHMAN\abduu |
| C1 | PASS | one decision event -> one push per subscription (2 subs -> 2 pushes) | sent 2 |
| P1 | PASS | decrypted payload keys are exactly kind, project, bead, title, count, at | {"kind":"decision","project":"alpha","bead":"alpha-1","title":"Pick a colour","count":1,"at":"2026-11-02T10:00:00.000Z"} |
| P2 | PASS | no card_q / options / comments / description / assignee / token / path / private key in payload, headers or URL |  |
| P5 | PASS | VAPID JWT: ES256, aud = push-service origin, exp <= 24h, sub mailto/https | {"aud":"https://fcm.googleapis.com","exp":1793667418,"sub":"mailto:board@codesters-inc.com"} |
| P5b | PASS | TTL <= 1h, Content-Encoding aes128gcm, only expected header names | TTL,Content-Length,Content-Type,Content-Encoding,Authorization,Urgency |
| P3 | PASS | desk / no-title bead -> title null in payload (pointer only), also if a desk event carried a title | ///// |
| P4a | PASS | long hostile title truncated to <= 80 in the payload | 80 |
| C7 | PASS | muted -> no push | muted |
| C7b | PASS | degraded event is never pushed |  |
| P6 | PASS | invalid project key is not pushed | bad-project |
| C2a | PASS | 1st pushes now; 2nd + 3rd within 2 min are held (no push yet) | sent,folded,folded pushes=2 |
| C3 | PASS | project B is not held back by project A window |  |
| C2b | PASS | one timer, set for the end of the 2 min window | [120000] |
| C2c | PASS | after the window ONE digest: kind digest, count 2, no title, no bead | [{"kind":"digest","project":"alpha","bead":null,"title":null,"count":2,"at":"2026-11-02T08:02:00.000Z"}] |
| C2d | PASS | a single held event goes as itself (bead + title), not as a digest | [{"kind":"decision","project":"alpha","bead":"alpha-2","title":"Two","count":1,"at":"2026-11-02T10:00:00.000Z"}] |
| C2e | PASS | 2+ min after the last push a new event pushes immediately | sent |
| C4a | PASS | exactly 50 real pushes then ONE "more" notice then silence (53 events) | real=50 more=1 tail=sent,noticed,capped,capped |
| C4b | PASS | "more" payload carries no project / bead / title | {"kind":"more","project":"","bead":null,"title":null,"count":0,"at":"2026-11-02T10:00:00.000Z"} |
| C4c | PASS | board restart the same day does not reset the 50 (still silent) | capped |
| C4d | PASS | after local midnight pushes resume | sent |
| W1a | PASS | SEC W1: keys.p256dh must be 65 bytes and keys.auth 16 bytes (a 5-byte / 3-byte key pair must be refused) |  |
| W1b | PASS | five junk (short-key) subscriptions: none stored, the real phone stays | kept 1 |
| W1d | PASS | key sizes are exact: 65/16 accepted; 64/16, 66/16, 65/15, 65/17 refused | true,false,false,false,false |
| W1e | PASS | only fcm.googleapis.com is accepted of the Google hosts (storage / www / bare / sub / look-alikes refused) |  |
| W1f | PASS | sixth phone with valid-shaped keys is refused (too_many) and NONE of the five is evicted | code too_many, kept 5 |
| W1g | PASS | a full list still accepts a repeat of an existing phone (no lock-out of the real one) |  |
| W1c | PASS | SEC W1 re-check: an evil endpoint written into push-subs.json is dropped at load (1 of 2 kept) | 1 |
| W9c | PASS | corrupt push-subs.json does not crash the board (no subscribers) |  |
| W9 | PASS | SEC W9 fail closed: unreadable push-state.json -> NO push (two projects, same day), bell only | send results: state-unreadable / state-unreadable |
| W9d | PASS | the unreadable push-state.json is NOT overwritten while it fails closed (evidence kept) | "{{{ corrupt" |
| W9e | PASS | next local day pushes resume with a fresh counter (state file rewritten as valid json) | result sent |
| W9f-array | PASS | push-state.json holding [] fails closed (no push) | result state-unreadable |
| W9f-null | PASS | push-state.json holding null fails closed (no push) | result state-unreadable |
| W9f-string | PASS | push-state.json holding "x" fails closed (no push) | result state-unreadable |
| W9g | PASS | no push-state.json at all (first run) still pushes | result sent |
| W9b | PASS | SEC W9: a 5xx answer is tried once, subscription kept, no retry loop | attempts 1 |
| K6 | PASS | lost key: phone holds a subscription made with the OLD key; "Turn on" drops it and subscribes again with the NEW key | result on; unsubscribe 1x; subscribe 1x (new key: true); sent push-key,push-key,push-unsubscribe,push-subscribe |
| K6b | PASS | the stale endpoint is also told to the board (push-unsubscribe with the old endpoint) so it stops being tried | ["push-key","push-key","push-unsubscribe","push-subscribe"] |
| K6c | PASS | panel status reads off (not on) while the phone holds an old-key subscription, on after Turn on | before off |
| K6d | PASS | same key: Turn on does NOT drop and re-create the subscription (no churn) | unsubscribe 0x subscribe 0x |
| K6e | PASS | old-key drop while the board answers an error on push-unsubscribe: still re-subscribes and says on | result on |
| K6f | PASS | no subscription at all (first Turn on): subscribes once with the board key |  |
| C5 | PASS | 404 and 410 delete only that subscription (memory + file); 201 and 500 keep theirs | https://fcm.googleapis.com/fcm/send/live1,https://fcm.googleapis.com/fcm/send/err500 |
| C6 | PASS | a sender that throws synchronously does not make send() throw |  |
| C6b | PASS | a hung push service (no answer) leaves other sends unaffected; web-push timeout (10 s) bounds it |  |
| F1 | PASS | atomic file writes (tmp + rename) never fail with EPERM on this PC | EPERM on rename: 0 times during the run (harness retried) |
| W6a | PASS | list() returns id / label / created / last_ok per phone and nothing else | ["id","label","created","last_ok"] |
| W6b | PASS | list() never carries an endpoint, p256dh or auth value (a lost phone list must not leak them) | [{"id":"a9d6499df9bc311b","label":"Android Chrome","created":"2026-11-02T08:00:00.000Z","last_ok":null},{"id":"768f161cf3dde7c2","label":"Windows Edge","created |
| W6c | PASS | labels are kept for good names and sanitised for hostile ones (no < or >, <= 200 chars) | img src=x onerror=alert(1) LLLLLLLLLLLLL |
| W6d | PASS | created is an ISO time; last_ok is null before any delivery |  |
| W6e | PASS | after a delivery every phone shows last_ok (ISO time) | ["2026-11-02T08:00:00.000Z","2026-11-02T08:00:00.000Z","2026-11-02T08:00:00.000Z"] |
| W6f | PASS | remove(id) deletes exactly that phone, in memory and on disk | ["w6-1","w6-h"] |
| W6g | PASS | after Remove no push reaches the removed phone; the two others still get it | w6-1,w6-h removed w6-0 |
| W6h | PASS | remove: non-string / over-long / missing id -> clean bad_payload error; unknown id harmless; list intact | ["bad_payload","bad_payload","bad_payload",true] |
| W6i | PASS | a removed phone can Turn on again later (slot freed, not blocklisted) |  |
| W6j | PASS | labels + created survive a board restart |  |
| WIRE | FAIL | the browser ws client can send every push type (push-key / subscribe / unsubscribe / list / remove are in app/protocol.js MESSAGE_TYPES) | NOT in MESSAGE_TYPES: push-key, push-subscribe, push-unsubscribe, push-list, push-remove -> createWsClient().send() rejects "unknown message type", so Turn on and the Phones list can never reach the board from a real bro |

## phones-ui (1 s)

| id | result | case | detail |
|---|---|---|---|
| W6w | PASS | PHONE door: push-list is refused -> no Phones list, no Remove button, no error text, the Turn on row still shows | {"calls":["notify-list","notify-list","push-list"],"rows":[]} |
| W6x | PASS | PC door: two phones listed (label or "Phone" fallback + a date), each with Remove | ["Android Chrome 2026-11-01Remove","Phone 2026-11-02Remove"] |
| W6y | PASS | PC door: Remove asks the board for push-remove with that id only, then the list shows the other phone | {"calls":["notify-list","notify-list","push-list","push-remove","push-list"],"rows":["Phone 2026-11-02Remove"]} |
| W6z | PASS | PC door: a failed Remove keeps both rows listed and says so (no silent success) | {"rows":["Android Chrome 2026-11-01Remove","Phone 2026-11-02Remove"],"text":"NotificationsMark all read×Nothing needs you. We will tell you when something does.Notify me for decisions inCould not change the phone alerts. |

## sw (27 s)

| id | result | case | detail |
|---|---|---|---|
| R3 | PASS | served /sw.js contains the push and notificationclick handlers, placeholders filled, parses | 5626 bytes; content-type application/javascript; charset=utf-8; cache-control no-cache |
| R4 | PASS | payload size: served sw.js and main bundle (bytes) recorded | sw.js 5626 B; main.bundle.js 1869977 B (base 59470c7 sw.js ~2.9 KB) |
| T0 | PASS | push event -> showNotification(project, body "Decision needed: <title>", tap url /#/issues?issue=<bead>) | {"title":"alpha","options":{"body":"Decision needed: Pick a colour","icon":"/icons/icon-192.png","badge":"/icons/icon-192.png","tag":"bead-alpha-1.2-decision","data":{"url":"/#/issues?issue=alpha-1.2"}}} |
| P3s | PASS | desk payload (title null) -> text "A decision waits at the PC", no title shown | A decision waits at the PC |
| T3 | PASS | digest -> "3 decisions waiting in alpha", tap opens the decisions list (no bead) | {"body":"3 decisions waiting in alpha","icon":"/icons/icon-192.png","badge":"/icons/icon-192.png","tag":"board-digest-alpha","data":{"url":"/#/decisions"}} |
| T3b | PASS | "more" -> "More on the board", title falls back to Board | {"title":"Board","options":{"body":"More on the board","icon":"/icons/icon-192.png","badge":"/icons/icon-192.png","tag":"board-more-","data":{"url":"/#/decisions"}}} |
| T4 | PASS | hostile payload (proto kind, array project, traversal bead id, 500-char title) -> notification still shown, tap url stays /#/decisions, text <= 80 + prefix | {"title":"Board","options":{"body":"More on the board","icon":"/icons/icon-192.png","badge":"/icons/icon-192.png","tag":"board-more-","data":{"url":"/#/decisions"}}} |
| P4 | PASS | garbage / empty push still shows something (userVisibleOnly) and does not throw | shown 7 |
| P7 | PASS | Arabic phone language -> Arabic text | قرار مطلوب: اختبار |
| T1 | PASS | tap with the board open: that window is focused and navigated to the bead (no second window) | {"nav":["https://abdelrahman.tail8a4e50.ts.net/#/issues?issue=alpha-1.2"],"opened":[]} |
| T2 | PASS | tap with no window: opens a new window at the bead on the phone-door origin | ["https://abdelrahman.tail8a4e50.ts.net/#/issues?issue=alpha-1.2"] |
| T2b | PASS | a window of another origin is never navigated; a board window is opened instead | {"nav":[],"opened":["https://abdelrahman.tail8a4e50.ts.net/#/issues?issue=alpha-1.2"]} |
| T2c | PASS | focus refused by the browser -> falls back to openWindow (tap is not lost) | ["https://abdelrahman.tail8a4e50.ts.net/#/issues?issue=alpha-1.2"] |
| T4b | PASS | a push payload cannot set the tap URL (url / data.url fields in the payload are ignored) | {"url":"/#/issues?issue=alpha-1"} |
| T4c | NOT EXERCISED | INFO: sw notificationclick given an absolute foreign data.url opens it (only reachable if our own SW set it; payload cannot) | ["https://evil.example.com/steal"] |
| R3b | PASS | real Chrome: SW registers and activates, PushManager present, notification permission granted for the origin | {"scope":"http://127.0.0.1:3450/","state":"activated","push":true,"perm":"granted"} |
| T5 | PASS | real Chrome worker running the served sw.js: a PushEvent with the real payload shape calls showNotification(project, body, tap url). (CDP deliverPushMessage without a real subscription: 0 call(s), Chrome drops it; headless keeps no visible notification, so the call is observed inside the worker) | [{"title":"gamma","body":"Decision needed: Real Chrome push","tag":"bead-whisper-flow-l8t.15-decision","data":{"url":"/#/issues?issue=whisper-flow-l8t.15"},"icon":"/icons/icon-192.png"}]"" |
| T1e | PASS | tap url from the real notification opens the board on that bead (detail shows its title) | hash #/issues?issue=whisper-flow-l8t.15; text has title: true |
| R5 | PASS | bell panel at 390x844 shows the push row and nothing overflows horizontally | {"bellOpen":"clicked","pv":{"has":true,"sw":390,"cw":390,"snippet":"Turn on for this phone"}} |
| W6u | FAIL | PC door, 390x844: bell panel lists the subscribed phone (label + date) with a Remove button, no overflow, no endpoint text on screen | {"rows":[],"removeText":[],"heading":false,"tap":null,"sw":390,"cw":390,"leak":false} |
| W6v | FAIL | tap Remove: the row disappears and push-subs.json no longer holds the phone | rows 0, subs file 1 |
| R2 | PASS | install piece intact after the SW gained push handlers: Page.getInstallabilityErrors is empty | {"installabilityErrors":[]} |
| R2b | PASS | SW cache still holds only static shell URLs (no "/", /api, ws, /att) | 16 entries |

## board (273 s)

| id | result | case | detail |
|---|---|---|---|
| B6a | PASS | cold start: the one pre-existing parked card of the cwd project gives exactly one bell event | [["alpha","decision",1]] |
| S6 | PASS | ws refused: bad token, foreign Origin, phone door without identity / wrong identity / PC token | [403,403,403,403,403] |
| S1 | PASS | push-key over the phone door and the PC door returns the PUBLIC key only (equal to vapid.json publicKey) | {"id":"q1","ok":true,"type":"push-key","payload":{"key":"BFVFZdbqP6VznO8TbqC5RKcEOPRBEvoVKx_WmJuH54z5X8bid03WLmrWr7MUIZu3JB-2tuk9J64qHdN17jIdb5I","subscribers": |
| S4e | PASS | evil host / loopback endpoint / empty payload refused over the real socket and nothing stored | ["bad_payload","bad_payload","bad_payload"] |
| S2e | PASS | valid subscription stored over the phone door; repeat does not duplicate | ["https://fcm.googleapis.com/fcm/send/live-e2e"] |
| S3e | PASS | unsubscribe removes it; second unsubscribe is harmless |  |
| W1h | PASS | real socket, phone door: five phones stored, the sixth is refused (too_many) and nothing is evicted | [5,{"code":"too_many","message":"too many phones; remove one on the PC"}] |
| W6k | PASS | push-list answers on the PC door with 5 phones (ids only). INFO: the phone door answers too (full control since company-1bo5.6.38), so the Phones list is not hidden there | {"pc":true,"phone":true,"phoneRefused":false} |
| W6l | PASS | both list replies carry label / created / last_ok / id only; no endpoint, no key, no private key | {"id":"q4","ok":true,"type":"push-list","payload":{"subscriptions":[{"id":"7ca3325b2c305330","label":"Android Chrome","created":"2026-11-02T12:47:13.860Z","last_ok":null},{"id":"ad0094acd23296b8","lab |
| W6m | PASS | push-remove over the PC door deletes that phone (reply, list and push-subs.json agree); a malformed id is a clean error | [true,"bad_payload",4] |
| W6n | PASS | cleanup through the PC list leaves no subscriptions |  |
| FIX-whisper-flow-4a2 | PASS | fixture Pick a colour is a VALID card per the real card core |  |
| B1 | PASS | cwd project: valid parked card -> bell event within 30 s | bell event 5.6s after the card was written |
| C1e | PASS | same card -> one push to the subscription within 30 s of the bell event | push 5.5s after the card was written |
| P1e | PASS | real decrypted payload: only kind/project/bead/title/count/at, title = card_title, bead = the card | {"kind":"decision","project":"alpha","bead":"whisper-flow-4a2","title":"Pick a colour","count":1,"at":"2026-11-02T12:47:19.863Z"} |
| P2e | PASS | nothing of the question / options / show text or the private key anywhere in the request (plain + headers + url) |  |
| P5e | PASS | VAPID: public key in the request equals the board key, aud = fcm origin | {"aud":"https://fcm.googleapis.com","exp":1793666839,"sub":"mailto:board@codesters-inc.com"} |
| FIX-fatura-oux | PASS | fixture Beta decision is a VALID card per the real card core |  |
| B3 | PASS | project registered later by POST /api/register-workspace: its parked card fills the bell within 30 s WITHOUT anyone opening the bell first (no notify-list call in between) | after 5.6s |
| B3p | PASS | and it pushes, project beta, title from the card | {"kind":"decision","project":"beta","bead":"fatura-oux","title":"Beta decision","count":1,"at":"2026-11-02T12:47:28.881Z"} |
| C3e | PASS | beta push was not held by alpha window (different project, within 2 min of the alpha push) | 9s apart |
| FIX-whisper-flow-7p6 | PASS | fixture Invalid one is an INVALID card per the real card core | ["card_class must be tap or type","card_back must be the role to return the bead to (for example swe)","card_q is missing","card_effect is missing","card_blocks is missing"] |
| B4 | PASS | invalid card (no card fields) in gamma: no bell event, no push | events 0 pushes 0 |
| FIX-whisper-flow-hsl | PASS | fixture TOP SECRET DESK TITLE is a VALID card per the real card core |  |
| P3e | PASS | desk-label bead (deploy): bell event and push carry NO title (pointer only) | {"bell":null,"push":{"kind":"decision","project":"gamma","bead":"whisper-flow-hsl","title":null,"count":1,"at":"2026-11-02T12:47:55.514Z"}} |
| FIX-whisper-flow-7nb | PASS | fixture Fold two is a VALID card per the real card core |  |
| FIX-whisper-flow-2r5 | PASS | fixture Fold three is a VALID card per the real card core |  |
| C2e2 | PASS | two more alpha cards inside the 2 min window: bell has both, push not sent individually | alpha pushes since first: 0 |
| C2f | PASS | at the end of the 2 min window ONE digest push: "2 decisions waiting in alpha" (kind digest, count 2, no title) | {"kind":"digest","project":"alpha","bead":null,"title":null,"count":2,"at":"2026-11-02T12:49:19.874Z"} at +120s |
| FIX-fatura-awa | PASS | fixture While muted is a VALID card per the real card core |  |
| C7e | PASS | mute on: bell still fills, no push | new pushes 0 |
| C5pre | PASS | second subscription (will answer 410) stored |  |
| FIX-whisper-flow-to6 | PASS | fixture Clean up gone is a VALID card per the real card core |  |
| C5e | PASS | real run: push service answers 410 -> that subscription is removed from push-subs.json; the healthy one stays | https://fcm.googleapis.com/fcm/send/live-e2e |
| FIX-fatura-fmv | PASS | fixture Switched off is a VALID card per the real card core |  |
| B5 | PASS | project switched off: new card -> no bell event and no push | events +0 pushes +0 |
| FIX-whisper-flow-fit | PASS | fixture SEC MADE SECRET TITLE is a VALID card per the real card core |  |
| W3b | PASS | SEC W3: card created by role sec (no label) -> bell carries no title, any push has none (push may be held by the 2 min window, so it can be absent) | {"bell":null,"push":null} |
| FIX-whisper-flow-t1p.1 | PASS | fixture PARENT LABEL SECRET TITLE is a VALID card per the real card core |  |
| W3c | NOT EXERCISED | SEC W3/N7: child of a parent labelled owner-pc-only -> no title in bell, any push has none (push may be held by the 2 min window) | {"bell":"PARENT LABEL SECRET TITLE","push":null} |
| K1 | PASS | key/subs/state files exist only under BDUI_BOARD_HOME; no push file appeared in the real ~/.codesters/board | notified.json,notify.json,push-state.json,push-subs.json,vapid.json |
| K3a | PASS | board stdout/stderr (debug on) never contains the private key | log 3151 bytes |
| K5 | PASS | board log never contains a subscription endpoint, p256dh or auth secret |  |
| K3b | PASS | no socket reply (push-key, subscribe, unsubscribe, notify-list) contains the private key or an endpoint |  |
| K3c | PASS | sw.js, index, bundle, /api/workspaces (both doors) never contain the private key or an endpoint | 6 bodies |
| K3d | PASS | private key not in git history or tracked files |  |
| K1b | PASS | no vapid.json / push-subs.json / push-state.json tracked in the repo |  |
| K2e | PASS | real board run: icacls on the live board folder and vapid.json = owner + SYSTEM only | NT AUTHORITY\SYSTEM / ABDELRAHMAN\abduu |
| FIX-whisper-flow-8nd | PASS | fixture Down one is a VALID card per the real card core |  |
| FIX-whisper-flow-cwj | PASS | fixture Down two is a VALID card per the real card core |  |
| B6 | PASS | restart after downtime with 2 new alpha cards: exactly ONE new digest event (count 2), nothing re-announced for the already-notified cards | [["alpha","digest",2,null]] |
| B6p | PASS | and that digest is pushed once (or folded by the persisted 2 min window) with no card text | 1 push(es) {"kind":"digest","project":"alpha","bead":null,"title":null,"count":2,"at":"2026-11-02T12:51:26.777Z"} |
| C10 | PASS | duplicate protection: notified.json keys survive restart and no event repeats |  |
