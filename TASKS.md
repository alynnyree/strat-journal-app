# Task List

Status key: **Open** (not started) · **Blocked** (waiting on the owner) ·
**Needs proposal first** (do not start building — propose an approach and
get sign-off) · **Fixed, unconfirmed on phone** · **Done**

Reordered 2026-08-17 to put the fix that unblocks other work first, and the
fix that would actually tell the owner whether his trading edge is real
ahead of chart/review-tool work. Original order is preserved in git history
via the `TASKS.md` commit log.

1. **Fix 403 error on `/media/pending`.**
   **Status: Done (2026-08-19).** Owner confirmed: pasted the real
   `APP_SECRET` value into the App Key box, "Not connected" turned to a
   green "Connected," and "Check for New Trades" now works with no error.
   Unblocks task 7 (screenshot pipeline).

2. **Build AI strategy auto-classification.**
   **Status: Fixed, unconfirmed on phone (2026-08-19).** Correction: the
   classifier itself, and the Dashboard's "which setup makes money"
   breakdown, already existed in the code (since 2026-08-09) — this
   list's original "not built" note was stale, not accurate. The real gap
   was that it only ran automatically on trades synced *after* it
   existed, so the ~199 already-logged trades from before that never got
   tagged. Added: a "Classify Trades" button on the Dashboard (only
   appears when trades are untagged) that sends each untagged trade to a
   new backend route (`POST /ai/classify`) one at a time, tags it if the
   AI is highly confident, and leaves it as "Needs Setup" otherwise.
   Verified: the new backend route was tested with a stand-in (fake) AI
   response and correctly handles a wrong App Key, a missing trade, a
   confident match, an unsure match, and a server error — and the app's
   on-page code was checked for typos/syntax errors.

   Separately hit and fixed while getting trades to show up at all
   (2026-08-19): after reconnecting Schwab, the backend's own memory of
   "transactions already handled" was stale relative to what was actually
   in the owner's Journal (from a device/browser that had already
   imported them earlier), so backfill kept finding 0 new trades even
   though Schwab genuinely had 188 real fills in the last 90 days.
   "Reset & Re-import Trades" clears that memory and fixed it — trades
   are now showing up. First real run: 0 of 103 tagged — expected, not a
   bug, since most of those 103 trades predate Schwab's ~30-35 day
   minute-data window (see task 4's note below) and the classifier
   deliberately won't guess without that candle data to look at.

   Owner also corrected the AI's setup definitions to match his actual
   rules (2026-08-19): the "2-2 Reversal" description now spells out the
   real mechanics (a candle breaks one side of the *previous* candle's
   range, fails, retraces to that candle's 50% level, then is expected to
   reverse and take out the opposite side); "FTFC Continuation" now
   states its target types (setup completion/gap fill/pivot) and defines
   FTFC itself (4+ consecutive timeframes aligned) directly in the
   prompt instead of leaving the model to infer it. "Broadening Reversal"
   confirmed accurate as-is, left unchanged. NOT yet verified: how this
   changes the tag rate/accuracy on a real run — needs trades with actual
   candle data to test against (see task 4).

3. **Get the App Key/Backend URL to stay saved on the iPhone home-screen
   icon specifically** (added 2026-08-19, mid-investigation).
   **Status: Done — confirmed by owner (2026-08-19).** The home-screen
   icon kept losing its saved settings while a regular Safari tab of the
   same page never did. Found and fixed a real bug along the way:
   `manifest.json` and the icon PNG files that `index.html` has always
   linked to didn't exist in this repo at all — they'd been committed to
   the sibling `strat-journal-backend` repo by mistake in an earlier
   session. Without a real, reachable manifest, iOS had no reliable way
   to treat "Add to Home Screen" as a genuine installed app. Fixed by
   moving those files to this repo. Also confirmed directly (via an
   on-screen diagnostic line added to `index.html`) that iOS strips
   `?backend=...&key=...` query parameters when it captures a home-screen
   icon, so the several earlier link-based auto-fill attempts were
   chasing something structurally impossible on iOS, not a bug to keep
   patching. Fix: typed the two values in directly, once, on the icon's
   own screen (not Safari, not a link) — owner confirmed it held after
   fully closing and reopening the app.

4. **Fix blank Bar Replay chart.**
   **Status: Closed — chart confirmed rendering correctly (2026-08-21).**
   Originally: reproduced in Claude Code's own automated preview at
   `localhost:8934` — the chart area rendered as a blank white rectangle
   in a screenshot taken there. New evidence (2026-08-17): the owner
   opened the same address directly in his own Chrome browser and saw
   real candles render correctly, suggesting the blank screenshot was a
   testing-tool artifact, not an app bug.

   Root cause of that artifact found and fixed (2026-08-21): the earlier
   automated screenshots were blank because the chart library itself
   (loaded from `unpkg.com`) couldn't reach this environment's network —
   nothing to do with the app's own code. Downloaded the identical file
   through npm instead (a channel that *is* reachable here) and now
   loads it from this repo directly rather than that outside address —
   this also means the live app no longer depends on that outside address
   being reachable at all, one less thing that could ever go wrong for
   real users. With the chart able to load, ran it end-to-end in an
   automated phone-sized (390×844-ish) browser window: seeded a fake
   3-hour trade and opened its replay — candles, the volume bars
   underneath, the price scale, and the time axis all drew correctly on
   the first try, confirmed both by reading the picture the browser
   actually drew (not just checking for errors) and by a saved screenshot.
   This directly answers the original phone report: the chart does draw
   candles correctly; it was never structurally broken. NOT verified: the
   owner's exact real trade data or his physical phone, which still can't
   be reached from here — but the mechanism that made this untestable
   before is now fixed, so this can be re-checked instantly if a similar
   report ever comes up again.

   Related, separate fix (2026-08-19): the Replay button was silently
   missing on a real trade the owner held 29 days (a legitimate hold, not
   a mismatch — confirmed via the OCC symbol's real, not-yet-expired
   expiration date). Cause: `getReplayCandles` only ever requested a
   single 10-day window and additionally capped any request at 4 hours,
   both meant to guard against a *different*, now-fixed bug (a mis-paired
   trade producing a multi-week replay) — but they also blocked any
   genuinely long real hold. Rewrote it to walk backward in 10-day pages
   (same chunking pattern already used for pulling trade fills) and
   stitch them into the full entry-to-exit window, however long. Tested
   with a mocked Schwab response covering the owner's exact 29-day
   scenario plus edge cases (trade entirely past Schwab's ~30-35 day
   1-minute-data retention, a hold straddling that retention edge, a
   still-open trade) — 11/11 checks passed. NOT verified against a real
   Schwab response, since the owner has no trade within the last 30 days
   to test against right now — will self-confirm the next time he logs
   one within that window.

5. **Test and fix drawing tools** (Trend Line, H-Ray, Magnet).
   **Status: Done — actually drawn and tested on screen, two real bugs
   found and fixed (2026-08-21).** Previously this could only be checked
   by reading the code, because the chart library it depends on couldn't
   load here (see task 4) — that's now fixed, which made real, on-screen
   testing possible for the first time.

   Drove the actual drawing tools in an automated browser exactly the way
   a finger would: pressed and dragged out a Trend Line, tapped once to
   place an H-Ray, tapped an existing line to select it, and tapped
   "Delete Line" to remove it — all confirmed both by checking the app's
   own saved state and by looking at the resulting picture, which showed
   the H-Ray's price line and label drawn exactly where placed.

   Found and fixed two real bugs this way:
   - The H-Ray button's label always showed a checkmark ("H-Ray ✓") even
     when the tool was off, unlike the Trend Line button next to it —
     now matches that pattern (found 2026-08-19 by reading the code).
   - A genuine, previously un-findable bug: placing a Trend Line by
     *tapping twice* (tap to start, tap again to finish — what the
     button itself instructs, "tap 2nd point") never actually completed
     the line. The second tap silently moved the starting point instead
     of finishing it, forever. Dragging one continuous motion (press,
     drag, release) already worked fine and was the only way a Trend
     Line could actually be placed. Fixed so a second tap now correctly
     finishes the line where the two-tap flow was always meant to.

   Also re-ran the candle-width-stays-constant check from task 11 inside
   this same real render (not just reading the chart's internal numbers)
   — confirmed stable through several playback steps.

   NOT verified: the owner's own hands on his own phone — worth a quick
   real check next time the app's open, though the two-tap bug above was
   likely the actual cause of any past frustration trying to draw a
   Trend Line by tapping rather than dragging.

6. **Improve Bar Replay data quality.**
   **Status: Blocked.** Owner needs to describe what he actually wants
   before this is scoped or started.

7. **Complete the screenshot capture pipeline.**
   **Status: All code done and tested; one phone-side setup step left
   for the owner (2026-08-19).**

   Found the backend's upload/pending/delete side (`media.js`) was
   already fully built and correct — functionally tested (mocked Redis,
   no real network call): wrong key, missing timestamp, missing image,
   a valid upload round-tripping through to `/pending` and then
   deleting cleanly, multiple screenshots at once. 12/12 checks passed.

   Found and built the actual missing piece: `PUSHCUT_NOTIFICATION_NAME`
   and `PUSHCUT_API_KEY` were sitting configured as environment variables
   with nothing in the code ever using them — the connection between "a
   trade closes" and "phone gets told to screenshot it" didn't exist.
   Added `pushcut.js` (`notifyTradeClosed`), wired into the *live*
   5-minute auto-sync only — never into a historical backfill, which
   would otherwise fire a notification for every one of 100+ old trades
   at once. Functionally tested (mocked network call): correct
   URL/headers/title, win/loss P&L formatting, doesn't crash on a
   still-open trade, and a failed Pushcut call is caught rather than
   breaking the sync it runs from. 10/10 checks passed.

   **What's left needs the owner's phone specifically — not more code:**
   1. In the **Pushcut** app: create a notification named *exactly*
      whatever `PUSHCUT_NOTIFICATION_NAME` is set to on Render, and set
      its default action to run the Shortcut from step 2 (Pushcut's own
      UI handles this — nothing to configure here).
   2. In the **Shortcuts** app: build a Shortcut that grabs the most
      recent screenshot (Photos → Screenshots album, most recent item)
      and uploads it with:
      `POST {backendUrl}/media/upload?key=YOUR_APP_KEY&timestamp=<unix seconds, e.g. "Now" converted to Unix Time>`,
      as a Form-type request body with one File field named exactly
      `image` set to the screenshot.
   3. Take a screenshot near a trade's entry/exit as normal (side +
      volume-up button) — that's the "one tap" this pipeline was always
      going to need (confirmed not zero-tap, per the existing note
      below); the notification should follow within 5 minutes of the
      trade closing.

   Not verified: whether Pushcut's actual notification delivery and the
   Shortcut itself work end-to-end — needs the owner's phone and his own
   Pushcut/Shortcuts accounts, which aren't reachable from here.

8. **Add daily/weekly risk-rule tracking** — a fixed risk-% per trade and a
   max-loss limit, written down and enforced/tracked in the journal.
   **Status: Built and tested (2026-08-19).** New "Risk Rules" card on
   the Journal tab (Account Size, Max Risk % Per Trade, Daily Max Loss,
   Weekly Max Loss). The New Trade form now shows a live defined-risk
   check as Contracts/Option Entry Price are filled in — contracts × 100
   × entry price is always the exact worst-case loss here, since every
   trade is bought to open, never sold to open, so this needed no live
   options data to be accurate. Dashboard has a new "Risk Rules" card
   showing today's and this week's net P&L against the configured
   limits, flagging "AT/OVER LIMIT" when hit (Monday-based week).
   Also fixed a small pre-existing crash risk found along the way: the
   FTFC ladder would throw (and silently kill the rest of the Dashboard
   render) if the most recent trade was ever missing its `ftfc` object.
   Verified with a full browser test: settings round-trip, per-trade
   banner math for over/within-limit/empty cases, Dashboard tracking
   under and over the daily limit with exact dollar totals, and the
   empty-state when no limits are set — 21/21 checks passed, zero
   uncaught errors. NOT verified: how it actually looks/feels on a real
   phone — worth a glance next time the app's open.

9. **Build backtesting** (hypothetical entries/stops/targets run against
   historical replay data).
   **Status: Needs proposal first.** Propose an approach and get sign-off
   before writing any code.

10. **Build native iOS app for zero-tap session recording.**
    **Status: Open, explicitly deferred (2026-08-19).** Owner chose to
    leave this as a future task for now rather than start it, after this
    session spent significant effort on iOS's home-screen web-app
    limitations (see task 3) — a real native app would sidestep those
    entirely. See CLAUDE.md's Feature Status section for the existing
    design notes (Control Center tile, ReplayKit consent, Personal Team
    signing re-signs roughly weekly).

11. **Fix candle-shrinking during playback.** The chart view was re-fitting
    itself every single frame, so candles got thinner and thinner as more
    of them appeared during Play.
    **Status: Fixed, unconfirmed on real phone.** Fixed and saved
    permanently on 2026-08-17 (commit `2f707e6` in `strat-journal-app`).
    Originally verified only against the chart's internal numbers, since
    the screenshot came back blank at the time (see task 4). Re-verified
    2026-08-21 by actually looking at the rendered chart (now that task 4
    is fixed) through several playback steps — candle width visibly held
    steady. Not yet confirmed on a real iPhone with real trade data.
