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

   **Extended 2026-08-21 — automatic capture at both ends of a trade,
   video for short ones:** the owner's real ask was bigger than a single
   screenshot at exit — a picture at entry AND exit (plus maybe one in
   between) for longer trades, and a full screen recording for short ones
   (his cutoff: under 15 minutes). Backend groundwork for this is built
   and tested:
   - The backend now notices the moment a position *opens*, not just when
     one closes, and fires a new notification for it (`notifyTradeOpened`
     in `pushcut.js`) — this didn't exist before; only closes were ever
     detected.
   - A one-time check fires automatically 15 minutes after a position
     opens: if it's still open at that point, a second notification
     (`notifyTradeStillOpen`) prompts stopping and discarding the
     recording — this is the manual "stop recording" safety net the owner
     agreed to, since a fully automatic timer on the phone itself
     couldn't be verified as reliable from here.
   - The existing close notification now carries a `video` vs
     `screenshot` flag based on how long the trade was actually held
     (matches the 15-minute cutoff), so one Shortcut can branch instead of
     needing a separate notification for the close event.
   - Confirmed while building this: the backend's real-time connection to
     Schwab already reacts to a fill within ~2 seconds, not the slower
     5-minute check — meaning the exit-side timing is already fast enough
     for this to work well on a short trade. Tested with a mocked
     Schwab/Pushcut layer end-to-end: open → quick close correctly fires
     video mode; open → never closes correctly fires the 15-minute
     safety net and no close notification; a historical backfill never
     triggers any of this (would otherwise flood notifications for old
     trades).

   **Deliberately not built yet: the actual video upload/storage.** A
   screenshot is small and already has a home (the same fast database
   used for everything else); a video is far too big for that same
   approach. This needs a real file-storage service — recommended
   Cloudflare R2 (10GB free, no time limit, plenty for a personal trade
   archive) — which needs the owner to create a free account and provide
   an API key, same pattern as Schwab/Gemini. Waiting on that before
   finishing the upload side.

   **New phone-side setup this adds, once the storage question is
   settled:** two more Pushcut notifications (open, still-open) beyond
   the original one from earlier in this task, each pointing to its own
   Shortcut step (start recording; stop-and-discard-then-screenshot), plus
   two new environment variables to set on Render:
   `PUSHCUT_NOTIFICATION_NAME_OPENED` and
   `PUSHCUT_NOTIFICATION_NAME_STILL_OPEN` (pick any names, same rule as
   the original — whatever's set here must exactly match the notification
   names created in the Pushcut app).

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

12. **Replace the 3 broad Strat Setup labels with the owner's real combo
    list, and separate FTFC/Broadening Formation from being "strategies"
    of their own** (added 2026-08-21, from a full spreadsheet-vs-app
    comparison the owner asked for).
    **Status: Built and tested (2026-08-21).** The app previously had
    exactly 3 tags — "2-2 Reversal," "FTFC Continuation," "Broadening
    Reversal" — and the first of those was wrong: what it described (one
    candle retracing to the previous candle's 50% level, then reversing)
    is actually called a "1 Bar Rev Strat." FTFC and Broadening Formation
    were never their own strategies either — they're context that can
    apply on top of any real pattern.

    Replaced the picker with the owner's real 9-pattern combo list:
    2-1-2 Continuation, 2-1-2 Reversal, 3-1-2 Reversal, 2-2 Continuation,
    2-2 Reversal, 3-2-2 Reversal, 1-2-2 Rev Strat, 1 Bar Rev Strat, and
    PMG (Pivot Machine Gun) — each usable Long or Short via the trade's
    existing direction field, so no separate "Bullish"/"Bearish" version
    of each was needed. The automatic AI tagging (task 2) was updated to
    match — same conservative "only tag when confident" behavior, just
    against the real pattern list and told explicitly that FTFC/Broadening
    are context, not choices to pick from.

    Added a new, separate **Broadening Formation** yes/no toggle on the
    trade form — a simple manual toggle, not AI-detected. The owner
    walked through the real mechanics in detail (a Broadening Formation is
    a compound outside bar, drawn right-to-left off the previous range,
    redrawn as new candles form, tied to a timeframe's color flipping) —
    confirmed this is a genuine multi-step judgment call, not something
    with a hard number the app could check on its own, so automatic
    detection is intentionally NOT attempted here. Teaching the app to
    actually draw and detect these on its own is a real, separate future
    project, not part of this change.

    A related, bigger idea surfaced along the way and was deliberately
    NOT built: the owner's source material describes FTFC in more depth
    than the app currently uses — a "Control" hierarchy (monthly = biggest
    picture, weekly, daily, down to the 60-minute candle for "right now"),
    "Conflict" (when 1-2 timeframes disagree), and "Change/Override" (a
    timeframe's color flipping, sometimes overriding a bigger timeframe
    temporarily). The app's FTFC check today is simpler (any 4+ consecutive
    timeframes aligned). Left as-is for now — flagged as its own possible
    future task rather than folded in silently.

    Also confirmed and NOT yet built at the time: the owner wants the AI's
    auto-tagging to eventually also look at the actual screenshot/video
    captured at trade execution (task 7's screenshot pipeline, and
    eventually task 10's video), not just candle price data — both to help
    the AI decide, and for the owner's own later review. Sequenced after
    task 7's remaining phone-side setup at the time. The screenshot half of
    this is now built — see task 13.

    Tested end-to-end in an automated browser: all 9 patterns render and
    are individually selectable, the Broadening toggle can be turned on
    and off without accidentally clearing whichever pattern is selected
    (a real bug caught and fixed while building this — both controls
    share the same visual styling and almost shared the same
    "clear selection" logic), a full save saves both fields correctly, the
    Journal shows a new "📐 Broadening" badge on tagged trades, and
    reopening a saved trade for editing correctly re-shows both the
    right pattern and the right toggle state. The stand-in (fake) AI
    response test also confirmed the classifier now accepts the new
    pattern names and still correctly rejects anything not on the list or
    below high confidence. NOT verified: how the new picker actually looks
    and feels tapping through it on a real phone.

13. **Have the AI look at a trade's actual screenshot as extra evidence
    when auto-tagging its Strat Setup**, once one exists (added 2026-08-21,
    a promised follow-up from task 2/12).
    **Status: Built and tested (2026-08-21).** Only reaches trades the
    frontend already holds a screenshot for locally (`shotEntry`, or
    `shotExit` as a fallback if no entry shot exists) — the backend's own
    fully-automatic tagging that runs the instant a trade closes (task 2)
    still can't use this, since a screenshot only exists after the owner's
    phone actually captures and uploads one, which can take anywhere from
    seconds to several minutes after the trade closes. Two places now use
    it, both already screenshot-aware without needing to be told to look:

    1. **The manual "Classify Trades" button** (task 2) — was already
       sending the whole trade to the AI, so once a trade has a screenshot
       attached, this automatically includes it now with no separate
       change needed there.
    2. **New:** the moment a screenshot lands and gets auto-attached to a
       trade that's still "Needs Setup," the app now immediately asks the
       AI to try again with that screenshot included — rather than the
       owner having to notice and tap "Classify Trades" themselves.
       Skipped while a manual bulk classification is already running, so
       the two never overlap on the same trade.

    On the AI side: when a screenshot is present, it's sent to Gemini
    alongside the candle-price data as a real image, with instructions to
    treat it as supporting visual evidence (the pattern's shape, any lines
    the owner drew) rather than something that overrides the candle data.
    Same conservative rule as always — only tags when confident. A trade
    tagged this way now shows a small camera icon next to its Setup badge
    in the Journal, so it's visible after the fact which tags had a real
    screenshot behind them versus candle data alone.

    Tested with a stand-in (fake) AI response and a stand-in (fake)
    backend server: confirmed the image actually reaches the request in
    the right format when a screenshot exists, confirmed the request
    correctly has no image and says so in the prompt when one doesn't,
    confirmed the entry-screenshot-preferred / exit-screenshot-fallback
    logic, confirmed a malformed screenshot value is skipped rather than
    crashing the request, and ran the full path end-to-end in an automated
    browser (screenshot arrives → gets attached → AI re-tries and tags it
    using that screenshot → Journal badge shows the camera icon) — all
    checks passed. NOT verified: a real screenshot from the owner's actual
    phone once task 7's remaining setup step is done, and whether the
    screenshot genuinely improves the AI's accuracy in practice (only
    something a real run over time can show).
