# Task List

Status key: **Open** (not started) · **Blocked** (waiting on the owner) ·
**Needs proposal first** (do not start building — propose an approach and
get sign-off) · **Fixed, unconfirmed on phone** · **Done**

Reordered 2026-08-17 to put the fix that unblocks other work first, and the
fix that would actually tell the owner whether his trading edge is real
ahead of chart/review-tool work. Original order is preserved in git history
via the `TASKS.md` commit log.

**Parked, to come back to (owner's own call, 2026-08-27):**
- **Rolling the app out to the public.** Discussed at length; the owner
  asked to park it and return later. The one thing worth carrying
  forward: what exists today is a single-person app (his Schwab login,
  his one password, trades in his phone's own storage). Serving strangers
  needs accounts, isolated data, payment, a company, and confirmation
  that Schwab's developer terms permit acting for other people's
  accounts — more work than everything built so far combined. The cheap
  step that should come FIRST is a one-page site to see whether 100 Strat
  traders will give an email address, before any of that is built.
- **A "which method do you trade" pack**, rather than a Strat on/off
  toggle (owner's idea, reshaped 2026-08-27). Only three things are
  method-specific: the setup list, the stop rule, and which context gets
  computed. All three already live in one place each, so the door is
  open. **Deliberately NOT built** — it only has value once a
  non-Strat user exists, and building it now would mean every future
  feature has to work twice for a customer who does not exist.

**Standing reminders from the owner — check before ever calling this
project "complete":**
- Install and live-test the browser extension (task 12) on a real
  computer — owner said "make sure to remind me of this build out before
  we call this project complete" (2026-08-23), and on 2026-08-26 asked
  to be reminded to finish it *that day*; a reminder was scheduled for
  that afternoon. Not yet done as of this note.
- Upload a real iPhone screen recording into Test Classification and
  confirm the AI actually reads it (task 21). Built 2026-08-26 but never
  tried against the live service.
- Revisit capturing entry/exit moments when trading from a laptop, not
  just a phone (task 12) — originally asked 2026-08-22, before the
  browser extension existed; now superseded by task 12 itself, kept here
  only as the origin of that request.

1. **Fix 403 error on `/media/pending`.**
   **Status: Done (2026-08-19).** Owner confirmed: pasted the real
   `APP_SECRET` value into the App Key box, "Not connected" turned to a
   green "Connected," and "Check for New Trades" now works with no error.
   Unblocks task 6 (screenshot pipeline).

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

   Also re-ran the candle-width-stays-constant check from task 9 inside
   this same real render (not just reading the chart's internal numbers)
   — confirmed stable through several playback steps.

   NOT verified: the owner's own hands on his own phone — worth a quick
   real check next time the app's open, though the two-tap bug above was
   likely the actual cause of any past frustration trying to draw a
   Trend Line by tapping rather than dragging.

6. **Complete the screenshot capture pipeline.**
   **Status: Automatic phone pictures (Path 1) fully built, fixed, and
   verified against real image content (2026-08-23) — only a real live
   trade left to confirm the whole pipeline end to end. Automatic video
   (Path 2) confirmed impossible via Shortcuts, split out to task 13 as
   its own native-app effort.** (Original 2026-08-19 status line below
   kept for history; superseded by everything after it in this section.)

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

   **Video storage — built and tested (2026-08-22).** The owner created a
   free Cloudflare R2 account and a storage "bucket" named
   `strat-journal-videos`. The backend now talks to it using the same
   toolkit Amazon's own cloud storage uses (R2 speaks the identical
   protocol), added as new files/routes rather than reusing the
   screenshot-database approach — a video is far too big for that. New:
   `videoStorage.js` (upload a video, and hand out a temporary link to
   watch one — the storage is private, not a public web address, so
   nothing can play a video without one of these short-lived links), plus
   three new addresses on the backend: one for the phone to upload a
   video to, one for the app to check what's waiting to be matched to a
   trade, one to fetch a watch-link. Tested with a stand-in (fake) version
   of the storage connection — wrong key, storage not yet configured,
   missing file, missing timestamp, a real upload going through
   correctly, and the watch-link request all checked out; 14/14 passed.
   NOT verified against the owner's real Cloudflare account — the code
   never touches real cloud storage during automated testing, on purpose,
   so this still needs a real phone test once the Shortcuts below exist.

   **Real-device finding 2026-08-22 that changed the plan: iOS does not
   allow Shortcuts to start or stop screen recording at all**, confirmed
   by the owner's own phone (neither action exists in the Shortcuts
   action picker, even after adding Screen Recording to Control Center).
   This is a deliberate Apple privacy restriction, not a settings problem
   — no amount of searching or configuring unlocks it. That means true
   automatic *video* capture is not achievable through Pushcut+Shortcuts
   at all; it needs a real, separately-installed iPhone app with its own
   one-time recording permission (see task 13, newly split out below).
   The video storage/backend pieces above stay built and untouched —
   they're exactly what that future app will use once it exists.

   **The good news: `Take Screenshot` (a single instant picture, as
   opposed to continuous recording) IS available** — confirmed on the
   owner's phone. That means the *photo* half of the owner's original ask
   (a picture at entry, one at the 15-minute mark for a longer trade, and
   the existing exit picture) can be made fully automatic — zero taps —
   using only what's already built, no native app required. This is now
   the active build.

   Also found and fixed while wiring this up: not every iOS version
   offers "Unix Time" in the Shortcuts date-format list (the owner's
   didn't) — `/media/upload` and `/media/upload-video` now also accept
   an ISO 8601 date string as the timestamp, so the Shortcut isn't
   fighting whatever format list happens to be on screen. Tested (9/9
   checks): Unix-seconds timestamps still work exactly as before, ISO
   8601 now also works and stores the identical value, invalid/missing
   timestamps are still rejected.

   **What's left needs the owner's phone and Render's settings — not more
   code:**
   1. On **Render**, add four new settings (same place `APP_SECRET` etc.
      already live): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
      `R2_SECRET_ACCESS_KEY` (the three values from creating the storage
      key), and `R2_BUCKET_NAME` set to `strat-journal-videos`. (Done by
      the owner — R2 storage itself confirmed working from the code side;
      not yet confirmed with a real phone upload.)
   2. Two more Pushcut notifications beyond the original one from earlier
      in this task (one for "trade opened," one for "still open after 15
      minutes"), plus two more Render settings so the backend knows their
      exact names: `PUSHCUT_NOTIFICATION_NAME_OPENED` and
      `PUSHCUT_NOTIFICATION_NAME_STILL_OPEN` (pick any names — whatever's
      set here must exactly match the notification names created in the
      Pushcut app, same rule as the original). Done by the owner.
   3. Two new Shortcuts to build (in progress with the owner
      2026-08-22): "Trade Opened" and "Trade Still Open," each just
      `Take Screenshot` followed by uploading it to the existing
      `/media/upload` address. The existing "Trade Closed" Shortcut from
      earlier in this task needs no changes at all. Owner ran "Trade
      Opened" once by hand on 2026-08-23 (screen visibly flashed as
      expected) but had no way to see whether the picture actually
      arrived, since a manual test has no real trade to auto-attach to
      inside the Journal itself. **Confirmed working 2026-08-23** — owner
      checked the new preview page below and the picture was there and
      accurate. "Trade Opened" is done.

      **Pushcut connection quirk found 2026-08-23**: Pushcut's own
      "Run Shortcut" picker (Default Action → Shortcut → pick from list)
      did not list "Trade opened" at all, even after fully closing and
      reopening Pushcut, even though the shortcut existed, was saved, and
      already worked when run by hand. Cause not confirmed (Pushcut's
      internal shortcut list appears to go stale for newly-created
      shortcuts). **Fix that worked:** set the Default Action's type to
      "URL" instead of "Shortcut," with the address
      `shortcuts://run-shortcut?name=Trade%20opened` (iOS's own built-in
      "run a shortcut by name" address — %20 stands in for the space).
      Confirmed working end-to-end: tapping the Pushcut notification
      opened Shortcuts and ran "Trade opened" (spinner then a screen
      flash). Same fix needed for "Trade Still Open" once that shortcut
      exists — same URL pattern with its own name.

      **Full end-to-end confirmed working 2026-08-23.** After the URL fix
      above, real testing (screen recording reviewed frame-by-frame)
      turned up two more real bugs, not phone user error — both are
      known iOS/Pushcut flakiness where a setting silently doesn't save:
      (1) the Default Action URL from the fix above had reverted to "No
      action" on its own after being set and closed out of — re-set it
      and confirmed by fully backing out and back in before it stuck; (2)
      the "Current Date" timestamp chip's format had separately reverted
      away from ISO 8601, causing the server's "Missing or invalid
      timestamp" error — reset back to ISO 8601 fixed it. Also found and
      fixed along the way: the shortcut's `key=` was still the literal
      placeholder text `YOUR_APP_KEY` rather than the owner's real App
      Key (`Jesus`), which was silently rejected by the server as
      "Forbidden" until corrected. **Lesson for building "Trade Still
      Open" and any future Pushcut-triggered shortcut:** after wiring up
      Default Action and any date-format chip, close fully out and back
      in to *re-check* both settings actually stuck before trusting a
      test — don't assume a save was permanent just because it showed
      correctly right after setting it. Final proof: the shortcut's own
      alert showed the real server response, `{"ok":true,"id":"..."}`,
      confirming the picture was accepted.

      **"Trade Still Open" built and confirmed working 2026-08-23,
      same session** — duplicated from "Trade opened," Pushcut's Default
      Action set to the URL-scheme fix the same way, worked on the first
      try (`{"ok":true,...}`). Both automatic-photo Shortcuts are now
      built and proven.

      **Turned out the pre-existing "Trade Closed" Shortcut ("Take Trade
      Screenshot") did need changes after all** — the "needs no changes"
      assumption above was wrong. Two real problems found and fixed
      2026-08-23: (1) it had no Default Action at all (relied on
      expanding the notification and tapping a separate button — an
      extra step, inconsistent with the other two and with the owner's
      zero-friction goal), fixed the same way as the other two
      (`shortcuts://run-shortcut?name=Take%20Trade%20Screenshot`); (2)
      its timestamp was wired to "Shortcut Input" (expecting something
      handed in from outside) instead of generating its own "Current
      Date" like the other two — swapped to match.

      **Second real bug found across all three Shortcuts, same day:**
      the "Current Date" chip has its own separate **"ISO 8601 Time"**
      toggle, off by default — with it off, the timestamp sent is a bare
      date with no time of day (e.g. "2026-09-15"), which would silently
      break the app's 10-minute entry/exit matching window for every
      screenshot. Confirmed and turned ON for all three Shortcuts. Worth
      remembering for any future Shortcut that sends a timestamp this
      way: always check this toggle specifically, it's easy to miss.

      What's left for Path 1 (automatic photos): all three Shortcuts are
      now built, fixed, and individually test-confirmed.

      **UX polish added 2026-08-23:** tapping any of these three
      notifications necessarily switches away from whatever app the
      owner was looking at (opening a `shortcuts://` address always
      switches to the Shortcuts app — a hard iOS limit, not something
      that can be configured around) — the owner was previously left
      sitting in the Shortcuts app afterward and had to manually swipe
      back. Fixed by removing the temporary debug step (Show Alert /
      Stop and Output — each required a manual "OK" tap and would have
      interrupted every real trade) from all three Shortcuts and adding
      an **"Open App" → TradingView** step at the end of each instead.
      Confirmed working on all three: notification tap → brief flash →
      automatically lands back on the TradingView chart, no manual
      swipe-back needed. (One-time "Allow to output 1 app?" permission
      popup appears the first time each shortcut runs this new step —
      tap Always Allow, doesn't ask again.)

      **Real bug found right after the above, same day — the captured
      pictures didn't actually show TradingView.** Every test up to this
      point had only confirmed the server accepted the upload, never
      actually looked at the image content. Owner checked the preview
      page and none of the pictures showed TradingView — they showed the
      Shortcuts/Pushcut screen instead. Root cause: opening a
      `shortcuts://` address always switches the foreground app to
      Shortcuts *before* any of the shortcut's own steps run, so "Take
      Screenshot" — sitting near the start of each shortcut — was
      capturing that switch-over screen, not TradingView. The end-of-
      shortcut "Open App" from the earlier polish fix only returned to
      TradingView *after* the (wrong) picture was already taken.

      **Fix:** reordered all three Shortcuts to open TradingView *first*,
      wait 2 seconds for it to fully render, then take the screenshot —
      instead of taking the screenshot first and returning to TradingView
      after. Final order in all three: Open App (TradingView) → Wait (2s)
      → Take Screenshot → Get Contents of URL (upload). Also removed the
      "Show Alert"/"Stop and Output" debug steps that were still present
      on "Trade opened" (missed in the earlier cleanup pass). **Confirmed
      2026-08-23 by directly inspecting the uploaded images on the
      preview page** (not just a success response) — all three now show
      the actual TradingView chart. Lesson: a server "ok:true" response
      only proves the upload worked, never proves the picture shows the
      right thing — always check the actual image content after any
      change to what app is on screen when a Shortcut runs.

      Path 1 (automatic photos) is now fully built, fixed, polished, and
      verified against actual image content. All that's left is a real
      live trade to confirm the whole pipeline end to end outside of
      manual testing.

   Added 2026-08-23 to make that checkable: a plain read-only web page,
   `GET /media/preview?key=...` (same App Key as everywhere else in the
   app), that shows every screenshot/video still waiting to be matched —
   newest first, pictures shown directly, nothing technical to read. Lets
   the owner check "did my Shortcut actually upload something" straight
   from Safari, on demand, without waiting for a real trade or reading
   raw data. Doesn't delete or change anything. Tested (11/11 checks):
   right/wrong/missing key, correct page shows up, screenshot and video
   counts, images render, video "Play" links work, newest-first order,
   and a deliberately malicious stored value can't break the page.

7. **Add daily/weekly risk-rule tracking** — a fixed risk-% per trade and a
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

8. **Backtesting, including improving Bar Replay's underlying data
   quality — combined into one task 2026-08-23, previously tracked as two
   separate items** (hypothetical entries/stops/targets run against
   historical replay data).
   **Status: Needs proposal first.** Owner pointed out these aren't
   actually separate efforts: Bar Replay's reconstructed candle data is
   the same raw material backtesting would need to run hypothetical
   entries/stops/targets against, so "improve Bar Replay data quality"
   (the old task 6) was really a prerequisite piece of backtesting, not
   its own independent task. Merged so they get proposed and built
   together.

   Also confirmed 2026-08-23, from an earlier conversation not visible in
   this codebase (predates this Claude Code project): Bar Replay was
   originally built as a substitute for automatic screen recording,
   before real automatic picture/video capture existed for either the
   phone or a computer — the code comments describing it that way were
   the actual evidence for this, not a guess. Discussed and decided to
   keep it anyway even now that real automatic capture exists (see task
   6 for phone, task 12 for computer): screenshots/video show what the
   owner actually saw (his own drawings, indicators, decision-making at
   the time); Bar Replay/backtesting works from precise, scrubbable
   market data and doesn't depend on a screenshot having been captured
   correctly at all — a real, independent safety net given how many
   genuine capture bugs were found and fixed the same night this
   decision was made. Worth the owner honestly checking whether he
   actually opens Bar Replay in practice before investing further in it,
   but the technical case for keeping it stands on its own regardless.

   Propose an approach and get sign-off before writing any code — nothing
   here is built yet.

9. **Fix candle-shrinking during playback.** The chart view was re-fitting
    itself every single frame, so candles got thinner and thinner as more
    of them appeared during Play.
    **Status: Fixed, unconfirmed on real phone.** Fixed and saved
    permanently on 2026-08-17 (commit `2f707e6` in `strat-journal-app`).
    Originally verified only against the chart's internal numbers, since
    the screenshot came back blank at the time (see task 4). Re-verified
    2026-08-21 by actually looking at the rendered chart (now that task 4
    is fixed) through several playback steps — candle width visibly held
    steady. Not yet confirmed on a real iPhone with real trade data.

10. **Replace the 3 broad Strat Setup labels with the owner's real combo
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
    captured at trade execution (task 6's screenshot pipeline, and
    eventually task 13's video), not just candle price data — both to help
    the AI decide, and for the owner's own later review. Sequenced after
    task 6's remaining phone-side setup at the time. The screenshot half of
    this is now built — see task 11.

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

11. **Have the AI look at a trade's actual screenshot as extra evidence
    when auto-tagging its Strat Setup**, once one exists (added 2026-08-21,
    a promised follow-up from task 2/10).
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
    phone once task 6's remaining setup step is done, and whether the
    screenshot genuinely improves the AI's accuracy in practice (only
    something a real run over time can show).

12. **Capture the exact entry/exit moment when trading from a laptop, not
    just a phone** (added 2026-08-22, owner's own note to revisit).
    **Status: Built 2026-08-23, not yet installed/tested on a real
    computer.** Phone and laptop are different problems: everything task 6
    relies on (Pushcut notifications, iOS Shortcuts, screen recording) is
    iPhone-only and has no equivalent trigger mechanism on a computer.

    Key advantage over the phone: unlike iOS, a computer does NOT have
    Apple's restriction requiring a person to physically tap something
    before a screenshot can be taken — true zero-click automatic capture
    is genuinely possible here, not just a nicer manual step.

    First design (a background helper program installed on the owner's
    specific MacBook) was **dropped 2026-08-23 — owner does not always
    trade from the same computer, and travels between locations/machines
    a lot**, so anything tied to one specific computer's operating system
    is the wrong shape. Built instead as a **browser extension**, since it
    works identically across Windows/Mac/Linux (any Chrome-based browser)
    rather than being tied to macOS specifically — a much better fit for
    someone who switches computers, even though it still requires
    installing it once on each computer actually used for this (no way to
    add automation to a machine never set up in advance — e.g. a
    public/borrowed computer still couldn't get this).

    **Backend half — built, tested, merged (PR #13 on strat-journal-
    backend):** a new `browserEvents.js` queue (`GET`/`DELETE
    /browser/events`), wired into `cron.js` at the exact same three points
    the Pushcut notifications already fire (trade opened / still open
    after 15 min / closed), using the trade's real timestamp, not "now."
    Tested (21/21 checks total): the queue routes directly, and the
    `cron.js` wiring end-to-end with the real matcher and every other
    dependency mocked (including intercepting the 15-minute safety-net
    timer so the test doesn't wait 15 real minutes).

    **Extension half — built, not yet installed anywhere real:** lives in
    the frontend repo under `browser-extension/`. A small Chrome extension
    (Manifest V3) with:
    - `background.js` — once a minute (Chrome's alarm system won't go
      faster than that), polls `/browser/events`, and for each one
      captures whatever browser tab is currently active and uploads it to
      the same `/media/upload` endpoint the phone already uses, then
      deletes the event so it isn't captured twice.
    - `options.html`/`options.js` — a settings page for the same Backend
      URL and App Key the Journal app itself uses.
    - `popup.html`/`popup.js` — a small toolbar-icon status view (last
      checked, last error, how many events were found/captured) so the
      owner can see it's working without needing developer tools.
    - Icons generated from the app's own existing icon.
    Tested (6/6 checks) on the pure address-building logic (the pieces
    with no dependency on an actual browser); the browser-specific parts
    (`chrome.tabs.captureVisibleTab`, `chrome.alarms`, the install flow
    itself) **cannot be tested from here — no browser available** and
    need real-device verification the same way the phone Shortcuts did.

    **Honest limits to know before testing:**
    - Requires the **`<all_urls>`** permission (needed so the extension
      can capture a tab automatically, without a click, regardless of
      what site is showing) — Chrome will show a broad-sounding warning
      ("Read and change all your data on all websites") when installing.
      Expected for what this needs to do, not a red flag.
    - Captures **whatever tab is currently active** — same requirement as
      the phone had with TradingView needing to be the on-screen app.
    - Up to about a **minute of lag** between the real trade event and the
      extension noticing it (Chrome's alarm system's fastest setting),
      versus the phone's near-instant push notification.
    - Only works while that **browser window is open** on that computer —
      expected, not a bug.
    - Only exists on computers where it's been installed ahead of time —
      cannot add itself to an unfamiliar/borrowed machine.

    **Not yet done:** loading it into a real browser (`chrome://extensions`
    → Developer mode → "Load unpacked" → select the `browser-extension`
    folder), entering the Backend URL/App Key in its settings, granting
    the one-time permission, and a live test to confirm a real capture
    actually works end to end.

13. **Build a real iPhone app for automatic video recording — combined
    2026-08-23 with the earlier "native app for zero-tap session
    recording" idea, previously tracked as two separate items.** First
    proposed 2026-08-19 and left deferred at the time (after that session
    spent significant effort on iOS's home-screen web-app limitations —
    see task 3 — since a real, separately-installed app sidesteps those
    entirely), then independently split out again on 2026-08-22 from
    task 6, once real-device testing confirmed iOS Shortcuts cannot start
    or stop screen recording at all — a deliberate Apple privacy
    restriction, not something more configuration fixes. Both entries
    were the same underlying idea described at two different points;
    merged into one.
    **Status: Not started — this is the "native iOS app" idea noted in
    CLAUDE.md's Feature Status section (Control Center tile, ReplayKit
    consent, Personal Team signing re-signs roughly weekly), now
    confirmed to be the only real path to automatic video** (the
    automatic-photo half of the original ask doesn't need this — see
    task 6). The mechanism: a real, separately-installed app (not a
    website) can ask the owner once, ever, for permission to record the
    screen; after that one-time consent, the app can start and stop
    recording in code on its own, woken by a signal from the backend
    using the same trade-open/close detection already built for task 6.
    The finished recording would upload to the same R2 video storage
    already built and tested. Real scope, not to be underestimated: a
    separate codebase in Swift/Xcode on the owner's Mac, a decision on
    paying Apple's $99/year developer fee vs. re-signing a free app
    roughly weekly, setting up push notifications so the backend can wake
    the app, and live testing to confirm the wake-and-record step is
    actually reliable. Owner's own sequencing: get task 6's automatic
    photos fully working and confirmed first, then start this as its own
    dedicated effort.

14. **Track stock share trades (buying/selling shares of a company), not
    just options** (added 2026-08-23, owner's own question). **Status: Not
    started — real gap confirmed by reading the actual code, not yet
    designed.** Right now, share trades are completely invisible to this
    app — not mismatched, simply thrown away before they're ever stored.
    Confirmed in `schwabClient.js`'s `extractOptionFills()`: every fill
    from Schwab is checked with `if (ti.instrument?.assetType !== 'OPTION')
    continue;`, which silently skips anything that isn't an options
    contract. Buying shares today produces no trade in the Journal, no
    matching, no automatic pictures — nothing.

    This is a real feature to design, not a quick fix, because several of
    the app's core rules are built specifically around how options work
    and don't have a share-trading equivalent yet:
    - **Direction (Long/Short)**: currently comes from call vs. put
      (`dirFromPutCall` in `matcher.js`). Shares have no call/put — would
      need to come from buy vs. sell instead (buy shares = Long, short
      shares = Short).
    - **Profit calculation**: the app currently never needs to flip the
      sign because the owner always buys options to open. That same
      shortcut only holds for shares if the owner never shorts stock; if
      short-selling shares is ever done, profit calculation needs its own
      sign-flip logic, same as options already have for Short bets.
    - **Realized R:R math**: built around "the option's price vs. the
      underlying stock's price" being two separate things. For a share
      trade, the position *is* the underlying — this calculation needs
      its own version rather than reusing the options one.
    - **`isOpen`/`isClose` in `matcher.js`** currently key off
      options-specific instruction strings (`BUY_TO_OPEN`, etc.) that
      Schwab may not report the same way for equities — needs checking
      against real Schwab data before writing the matching logic.

    Not blocking any current work — flagged here so it isn't forgotten,
    to be scoped and built as its own dedicated effort when prioritized.

15. **Record the actual Stop Loss *rule*, not just a dollar price** (Gap 2
    from a spreadsheet-vs-app comparison done in a separate conversation,
    surfaced back into this project 2026-08-23 after being found
    untracked here). Owner's spreadsheet writes out the real stop rule in
    words ("30% against trade," "682.67 (50% of mark of trigger candle),"
    "10%-15% stop"); the app's Stop field only holds a single number, with
    nowhere to record *why* that's the stop. **Status: BUILT AND TESTED
    2026-08-27 (strat-journal-backend PR #26, strat-journal-app PR #36) —
    30 + 25 backend checks, 21 browser checks. Not yet run against live
    Schwab data or a real trade.**

    Built larger than the task as written. The owner offered his own
    rules, which turned out to be ONE rule rather than nine: the stop is
    the bottom of the candle before the entry (the top, if Short), or the
    halfway point of that candle when it was a large one. So the app does
    not merely record the rule — it applies it and works the stop out
    itself.

    Why that matters more than the original task: Schwab cannot supply a
    Strat stop, because it is a line drawn on the underlying's chart and
    never an order sent to the broker. Every auto-imported trade has
    therefore arrived with the stop blank — and since realized R:R is
    computed from the entry-to-stop distance, **realized R:R has been
    empty on essentially every automatically synced trade.** That is the
    single most useful number in the journal, missing from almost all of
    it. This fills it in.

    Decisions taken, each flagged to the owner rather than buried:
    - **Short mirrors Long** (bottom becomes top). He described the long
      side only; this is an assumption, not his words.
    - **"Large" is measured against the MEDIAN range of the previous 20
      bars**, not the mean — one freak candle would drag a mean up and
      make everything after it look normal. Threshold starts at 1.5x and
      is a setting, because "rather large" is his judgement and no number
      chosen here would be his.
    - **His timeframe varies**, so resolution runs most-specific first:
      a timeframe set on the trade, then one set for that setup, then his
      general default. Per-setup defaults exist because the timeframe
      plausibly varies WITH the setup rather than at random.
    - Bars group against the 9:30 ET session open, so an hourly bar runs
      9:30-10:30 the way a charting app draws it.
    - Never overwrites a stop he typed himself.

    Still open: he has not yet checked a computed stop against a trade he
    remembers. That is the next thing, and it is his call whether the
    1.5x threshold is right.

16. **Show trade Notes on the main trade list, not just inside the Edit
    screen** (Gap 3, same source as task 15). Owner's spreadsheet has
    Notes as a column visible at a glance; the app saves Notes but only
    shows them after tapping into a trade's Edit screen. **Status: Not
    started.**

    (Gap 1 from that same comparison — strategy labels too broad, no way
    to note which timeframe a setup happened on — was already the exact
    thing that became task 10's 9-pattern combo rebuild, done and tested
    2026-08-21, before this conversation surfaced the other two gaps.)

17. **Let FTFC alignment and Broadening Formation genuinely factor into
    how a trade gets classified, not just sit as separate disconnected
    data** (added 2026-08-23, owner's own clarification). **Status: Needs
    a decision before building — flagged, not started.** Two related but
    different asks, worth telling apart:

    (a) **Record whether each classified combo was taken with FTFC
    aligned and/or off a Broadening Formation, together with the pattern
    name** — not as two separate unconnected summaries the way the
    Dashboard shows them today (confirmed by reading `index.html`: setup
    performance and FTFC performance are computed as two independent
    breakdowns with no combined view). This part is straightforward:
    `ftfcConfirmed`/`ftfcDirection` are already computed per trade, and
    the Broadening Formation toggle already exists on the trade form —
    they just need combining into one view/analysis instead of staying
    separate.

    (b) **Whether the AI should be allowed to use FTFC/Broadening as
    evidence when deciding *which* of the 9 patterns a trade was** — this
    is a real change to `aiClient.js`'s prompt, which currently tells the
    model explicitly "FTFC alignment... should not affect which pattern
    you pick," a deliberate choice made in task 10 after the owner
    confirmed FTFC/Broadening aren't real pattern types of their own.
    Loosening that to "use as supporting evidence" is a reasonable
    reading of the owner's ask and doesn't have to contradict task 10 (the
    9 patterns stay the only valid output either way) — but it directly
    runs into a SEPARATE, already-settled finding from that same task 10:
    the owner himself confirmed Broadening Formation is "a genuine
    multi-step judgment call" (a compound outside bar, drawn right-to-
    left, redrawn as new candles form, tied to a timeframe's color
    flipping) that the app deliberately does NOT try to auto-detect —
    only a manual yes/no toggle exists. Before building (b), needs the
    owner to confirm: is the AI meant to now attempt recognizing a
    Broadening Formation itself from the candles/screenshot as supporting
    evidence (reversing that earlier decision), or only ever use the
    owner's own manual toggle (already set by hand) as the FTFC/Broadening
    context it's allowed to weigh?

18. **"Test Classification" tool — try the AI classifier against a
    made-up chart (drawn, AI-generated, pulled from the internet, or just
    described) without it needing to be a real trade, and give feedback
    on whether it got it right** (added 2026-08-23, owner's own request,
    to sanity-check/improve the classifier while not currently in any
    real trades). **Status: Built and tested 2026-08-23.**

    **Backend (PR #14 on strat-journal-backend):** new `POST
    /ai/test-classify` reuses the real classifier's prompt-building via a
    shared `runClassification()` — refactored out of `aiClient.js` so the
    real automatic tagging (`classifyStrategy`, behavior unchanged) and
    this new sandbox path (`testClassifyStrategy`) share one prompt
    instead of two copies. Unlike real auto-tagging, the sandbox version
    always returns the model's actual answer — even "unclear" or low
    confidence — instead of hiding it, since the point is to see what the
    AI actually thinks. New `aiTestFeedback.js` stores correct/incorrect
    feedback (with the image) via `POST`/`GET /ai/test-classify-feedback`
    for later review. Two real bugs fixed along the way: the prompt
    claimed Broadening Formation status was "included below as context"
    but never actually included it, and FTFC confirmed printed the
    literal word "undefined" when missing. Tested (33/33 checks):
    `classifyStrategy`'s existing behavior fully unchanged, the new
    sandbox function's different behavior, both new routes' auth/
    validation/round-tripping.

    **Frontend (PR #21 on strat-journal-app):** new "Test Classification"
    card on the AI Analyst tab — picture upload, typed description,
    Direction/FTFC/Broadening Formation, a Classify button showing
    strategy/confidence/reasoning, Correct/Incorrect feedback (Incorrect
    prompts for the real pattern + notes), and a "Past Test Feedback"
    history list. Tested in a real browser via Playwright (19/19 checks):
    empty-input validation, correct request payload, result rendering,
    the feedback flow end to end, and the history view.

    **Corrected same day, right after the above shipped:** owner clarified
    the actual point is to classify **strictly from the picture (or a
    typed description), with zero other hints** — no direction, no FTFC,
    no Broadening Formation — the same way he's testing his own eye, not
    handing the AI answer-adjacent context a real trade wouldn't give it
    for free. Those three fields were pure Claude-added scope creep beyond
    what was actually asked for. Removed (strat-journal-app PR #22) —
    the tool is now just picture-or-description, then Classify. Also
    fixed a real related bug on the backend (strat-journal-backend PR
    #15): `ftfcConfirmed: !!body.ftfcConfirmed` turned "not provided" into
    an explicit `false` claim rather than genuinely absent (n/a) — didn't
    matter before since real trades always have this field, but would
    have quietly broken the "zero hints" guarantee here. Tested (5/5 +
    10/10 checks): omitted fields stay `null`/absent from the request
    entirely, an explicitly-sent `false` is still respected as a real
    false, and the simplified UI no longer sends `dir`/`ftfcConfirmed`/
    `offBroadeningFormation` at all.

    **First real-phone test 2026-08-23 failed** — a real annotated
    screenshot (with a hand-drawn trend line) returned a generic
    "Classification failed — check server logs" error, which the owner
    has no way to act on. Found two real, likely-related gaps (PR #16 on
    strat-journal-backend), neither ever caught before because every test
    up to this point used a short, hand-written stand-in Gemini response,
    never a real call analyzing a real photo: (1) the classify call's
    output-token budget (300) was likely too tight for a real image plus
    a full written "reasoning" explanation, risking a cut-off, invalid-
    JSON response; raised to 800, and a JSON-parse failure now throws a
    specific, readable error (with a snippet of what Gemini actually
    said) instead of a generic one. (2) the error message shown to the
    owner literally told him to check server logs — something he cannot
    do — now replaced with the real underlying error text so a failure is
    diagnosable from the app itself, without needing me to have server
    access I don't have anyway. Tested (8/8 checks): a real success case
    still works at the higher budget, a simulated truncated response now
    surfaces a specific useful error, and `classifyStrategy` (real
    automatic tagging) is confirmed unaffected — still returns `null` on
    any error, same as before.

    **Two more real, live-only findings from that same retry attempt
    (2026-08-23), each only discoverable by actually trying it — not
    something testing from here could have caught:**
    1. `GEMINI_API_KEY` was never actually set on Render at all, despite
       being listed in CLAUDE.md's expected environment variables — every
       AI feature (this tool, AI Analyst, real auto-classification) has
       likely been silently unable to reach Gemini this whole time. Owner
       created a real key via Google AI Studio and added it to Render.
    2. Once the key worked, Gemini rejected the hardcoded model name,
       `gemini-2.5-flash`, as "no longer available to new users" — Google's
       own error named `gemini-3.6-flash` as the replacement. Updated
       (PR #17 on strat-journal-backend) — one shared constant, so this
       fixes all three AI features at once. Not testable from here (no
       outbound access to the real Gemini API from this environment).

    **Retry after the model-name fix (2026-08-23) got a genuinely
    different response: "This model is currently experiencing high
    demand... try again later."** Not a bug — confirms the key and model
    name are both correct now, since the request reached Gemini and got a
    real (if temporary) capacity response, not a code/auth/name error.
    Google's side, not ours. Owner told to wait a minute and retry.

    **First successful real classification 2026-08-23** — the retry went
    through, confirming the whole chain (key, model name, image upload,
    Gemini call, response rendering) works end to end. The answer itself
    was "unclear," and the model's stated reason exposed a real design
    mistake of mine, not a model failure: *"No trade direction, entry
    markers, or explicit candle numbers/sequence data were provided...
    Without knowing which specific bar triggered the entry, the setup is
    ambiguous."* The test tool had been reusing the REAL TRADE
    classifier's prompt, which asks "what setup was this trade?" and leans
    on knowing the entry bar — but in this tool there is no trade and no
    entry bar, only a picture, so that question was unanswerable by
    construction. Stripping the context fields out (per the owner's
    "strictly from the picture" correction) made this worse, not better,
    because the underlying question was still trade-shaped.

    **Rebuilt as a chart-reading tool with three layered answers**
    (strat-journal-backend PR #18, strat-journal-app PR #23), which is
    also what the owner asked for directly: combo, FTFC, and Broadening
    Formation each judged independently, each allowed to be "unclear" on
    its own. The prompt now asks the answerable question ("read this
    chart and tell me what you see"), states plainly there's no trade or
    entry marker and not to assume one, and defines the Strat 1/2/3
    candle numbering (inside/directional/outside bar) inline rather than
    assuming the model knows it. Guardrails: don't infer FTFC from a
    single timeframe (usually correctly "unclear" from one image); only
    say yes to Broadening when the widening/megaphone structure is
    genuinely visible. The correction form is layered to match — combo
    dropdown plus a toggle each for FTFC and Broadening, every control
    seeded from what the AI guessed so correcting one thing doesn't
    overwrite the two it got right. Tested 27/27 backend (including
    regressions proving the real trade classifier is untouched) and 27/27
    in a real browser.

    **This resolves the open question in task 17(b)** — the owner's
    request that FTFC/Broadening factor into classification. The answer
    that emerged: in this sandbox the AI reads all three from the picture
    (there is no Schwab data to compute from), while real trades keep the
    existing split — FTFC computed mechanically, Broadening a manual
    toggle, per task 10's finding that it's a genuine judgment call.

    NOT yet confirmed: whether the AI actually reads a Broadening
    **CONFIRMED WORKING 2026-08-23** — after the fixes below, a real
    annotated chart classified successfully with all three layers:
    combo "2-2 Continuation" (high confidence), FTFC "unclear" (correctly
    refusing to infer it from a single 1W chart), and **Broadening
    Formation "yes"** with the reasoning *"Dashed white lines explicitly
    trace expanding higher highs and lower lows, forming a clear
    megaphone pattern."* That was the specific thing the owner wanted it
    to catch, and it caught it including his own hand-drawn annotation.

    **Interface pass 2026-08-23 (PR #26), four items the owner asked
    for:** the feedback buttons now visibly acknowledge a tap ("Saving…"
    plus disabling); a successful save clears the whole run (picture,
    description, classification detail) leaving a confirmation and a
    section ready for the next chart; the same classification can no
    longer be saved twice (blocks rapid double-taps AND "All Correct"
    followed by "Something's Wrong" — a failed save deliberately
    re-enables the buttons rather than stranding the result); and Past
    Test Feedback is now a scannable log rather than a wall of pictures
    — one compact line per test, tapped to expand into full detail
    including the chart image, held in memory so expanding is instant.
    Tested 19/19 in a real browser.

    **Reliability pass 2026-08-23, after the owner hit "Load failed" and
    asked how to stop having to manually retry.** "Load failed" is the
    phone giving up before any answer arrives — different from the
    earlier Google-side errors. Root cause is two slow things stacking:
    Render's free tier sleeps when idle (30-60s to wake) and a real chart
    analysis takes another 10-30s on top. Fixed in two layers:
    - **Backend (PR #19):** `callGemini` now retries transient failures
      itself — 429/503 (the "high demand" case), Google-side 5xx, and raw
      network failures — 3 attempts, 1s/2.5s backoff, plus a 60s timeout
      so a stalled connection can't hang. Deliberately does NOT retry a
      bad key, malformed request, or unknown model, since those fail
      identically every time and retrying would only delay showing the
      real reason (which mattered: the last two real bugs were exactly a
      missing key and a wrong model name). Benefits all three AI features.
      Tested 13/13, including fail-fast on 400/401/403/404 and a hard stop
      at 3 attempts rather than looping.
    - **Frontend (PR #24):** pings `/health` first so the cold start
      doesn't eat the real request's patience, then retries the classify
      call up to 3 times (3s/8s backoff) showing which attempt it's on.
      403/400 still fail immediately with the real cause named. The final
      error now says retries already happened rather than telling the
      owner to "try again" after he just watched it try three times, and
      offers a Try Again button so the picture doesn't need re-uploading.
      Tested 14/14 in a real browser, asserting wake-before-classify
      ordering (not just call count — the app has its own separate
      periodic health check, which is why a naive count read as 2).

    Between both layers there are now ~9 real attempts before the owner
    sees any failure at all.

    **Real root cause of the cut-off answers, found 2026-08-23 (PR #20 on
    strat-journal-backend).** The next run got far enough to show the
    actual problem: the model DID answer — `{"strategy": "2-1-2
    Reversal", "confidence": "high", "reasoning": "The green ` — and then
    stopped mid-word, roughly 20 visible tokens out of a 1200-token
    budget. **Newer Gemini models "think" before answering, and that
    internal reasoning is billed against the SAME `maxOutputTokens`
    budget as the visible answer.** The budget was being consumed almost
    entirely by thinking. Every earlier "raise the token limit" fix was
    treating the symptom.

    Fixed properly:
    - `thinkingConfig: { thinkingBudget: 0 }` on these calls — they're
      structured classifications with a schema already enforcing the
      shape, so chain-of-thought buys nothing. Includes an automatic
      fallback that drops the parameter and retries if a model rejects it.
    - Budgets raised anyway as headroom (2000 real / 3000 test+analysis),
      and the prompt now asks for one-to-two-sentence reasoning.
    - **Truncation is now detected rather than surfaced**: Gemini's own
      `finishReason: MAX_TOKENS` triggers one automatic retry at double
      the budget. An unparseable body is treated the same way, since
      schema-enforced JSON mode makes "complete but malformed" unlikely.
      An empty response now reports its finish reason (e.g. SAFETY)
      instead of crashing on `JSON.parse`.
    - New `callGeminiJson` centralizes call+parse+recover so all three AI
      features get this instead of each repeating it.
    Tested 19/19, including regressions proving network retries and
    fail-fast-on-403 still behave as before, and that `classifyStrategy`
    still returns `null` rather than throwing.

    Also fixed a small readability bug the same screenshot exposed
    (strat-journal-app PR #25): a server error ending mid-sentence ran
    straight into the appended retry hint, reading as one garbled
    sentence. The hint now renders on its own line.

    **The thinkingConfig fix broke it again — my own bug (PR #21).** The
    fallback added alongside `thinkingConfig` only triggered when the
    error text contained the word "thinking". `gemini-3.6-flash` rejects
    it with a generic **"Request contains an invalid argument"** that
    never mentions thinking, so the fallback never fired and the whole
    call failed. Conclusive that `thinkingConfig` was the cause: the run
    immediately before PR #20 produced a real (if truncated) answer from
    the same image, and it was the only thing that changed.

    Fixed: drop `thinkingConfig` and retry on **any** 400 while it's set,
    instead of pattern-matching error text — the rest of the request is
    unchanged from calls that already worked, and if the real cause were
    something else the retry fails identically and surfaces the same
    message, so nothing is hidden. Also: the config correction no longer
    consumes a transient-retry slot, and budgets were raised again (6000
    real / 8000 test+analysis) so the call still completes even when
    thinking CAN'T be disabled and eats part of the budget — which is the
    likely path on this model. Tested 15/15, including a test
    reproducing the exact error shape from the phone.

    **Lesson worth keeping:** four separate "fixes" here (bigger token
    limit → retries → disable thinking → fix the fallback) were aimed at
    symptoms, largely because the model's own error text kept being
    discarded before it reached the owner. Every real diagnosis in this
    sequence came from finally seeing the raw response or raw error.
    Surfacing real error detail to the screen was worth more than any
    amount of defensive guessing. Second lesson, more specific: **don't
    pattern-match on a third-party error's wording** — match on the
    status code plus what the request actually contained. The narrow
    string check here is precisely what turned a working fallback into
    a hard failure.

19. **Feed Test Classification corrections back into real trade
    classification ("the journal studies off its own test material")**
    (added 2026-08-23, owner's own idea). **Status: BUILT AND TESTED
    2026-08-23 (PR #22 on strat-journal-backend) — 20/20 checks. Not yet
    proven to improve real-world accuracy, which needs corrections
    accumulating over real use.**

    The owner's framing was that the journal should "update/upgrade
    itself + its memory" from what gets uploaded into Test
    Classification, so real auto-imported trades get classified using
    that accumulated knowledge. **Important correction made to that
    framing, and worth keeping straight:** the AI model itself cannot
    learn or retain anything between calls — every classification starts
    from zero, and nothing we send changes the model. Actual fine-tuning
    is a separate, expensive process not in scope here.

    What genuinely achieves the same outcome: **the journal remembers,
    and re-teaches the model on every single call.** Each classification
    request would include the accumulated corrections as worked examples
    ("here is a chart, here is what the AI guessed, here is what the
    trader said it actually was"). The model reads them fresh each time.
    Practical effect matches the owner's goal — the more he corrects in
    Test Classification, the better real trades get classified — and it
    is especially valuable because the corrections encode HIS
    interpretations, which generic prompt instructions can't. The
    `userNotes` field carries the most teaching value since it explains
    *why* something was wrong.

    What was actually built (2026-08-23):
    - `aiTestFeedback.js` gained `getTeachingExamples()`, which reads
      the correction log and picks which entries travel with the next
      classification. Entries marked WRONG get most of the budget
      (newest first) because they show exactly where the model's
      reading diverges from the owner's; a few confirmed-correct ones
      ride along so the model also sees what it already reads right.
      Hard cap of 20 total (15 wrong + up to 5 right).
    - `aiClient.js` gained `formatTeachingExamples()` and
      `loadTeachingBlock()`, which turn those entries into a plain-text
      "THE TRADER'S OWN PAST CORRECTIONS — study these before
      answering" block, spelling out for each one what the AI read, what
      the owner said it actually was, across all three layers (combo,
      FTFC, Broadening) plus his typed notes.
    - That block is appended to BOTH prompts: `runClassification()`
      (the real auto-imported trades) and `testClassifyStrategy()` (the
      sandbox tool), so the tool visibly improves as it's fed and real
      trades inherit the same accumulated knowledge.
    - Loading is fault-tolerant: if the correction log can't be read,
      classification still runs, just without the examples, rather than
      failing the trade.

    Two real cautions raised with the owner (both still apply):
    - **A wrong correction propagates.** Because corrections ride along
      with every future request, one bad correction is not one bad
      trade — it's one bad lesson repeated on every classification until
      removed. Task 18's clickable log exists partly to make
      reviewing/auditing these practical.
    - **Including chart IMAGES as examples is the expensive part**, and
      the owner reasonably asked why, given he already uploaded the
      picture once. The answer: uploading is one-time storage, but
      examples are *re-sent to the model on every single call* — 20
      example images would mean 20 images transmitted and processed
      every time a trade closes, not once. **Resolved 2026-08-26**: the
      owner said pictures are how he best gets the point across, so
      they now travel — see task 21 for the budget that keeps them from
      slowing anything down.

    Still open on this task: nobody has yet proven it measurably
    improves accuracy. That needs real corrections accumulating over
    real use, then comparing classifications before and after.

20. **Let the Test Classification tool do the REAL 13-timeframe FTFC
    lookup instead of reading FTFC visually** (added 2026-08-23, from
    the owner's question about how FTFC should be determined).
    **Status: Offered, awaiting the owner's go-ahead — not built.**

    Worth recording clearly because it was asked directly: **for real
    trades, FTFC is already determined exactly the way the owner
    described.** `ftfcCheck.js`'s `getFtfcForTrade()` takes the trade's
    exact entry timestamp, pulls real Schwab candle data for all 13
    timeframes (6M, 3M, 1M, 1W, 1D, 4H, 2H, 1H, 30m, 15m, 5m, 3m, 1m) as
    they stood at that moment, marks each bull or bear, then
    `computeFtfcConfirmation()` finds the longest unbroken run of
    same-direction timeframes and confirms FTFC at 4+ consecutive — with
    the run allowed to start anywhere in the ladder, not just the top.
    It also records WHICH timeframes formed the run, which indicates
    suggested hold length. No AI involved in that calculation at all.

    The gap is only in the sandbox test tool, which has a picture but no
    ticker and no timestamp, so it has nothing to look up and correctly
    answers "unclear" rather than guessing FTFC from one visible
    timeframe. Proposed (not built): optional ticker + date/time fields
    on the test tool; when filled, run the same real Schwab lookup
    instead of the visual read; left blank, behave exactly as now.
    Caveat to mention if built: Schwab retains minute-level data only
    ~30-35 days, so older test dates would get daily-and-above only.
    Deliberately NOT built yet — this tool has already been over-scoped
    once (see task 18's removed direction/FTFC/Broadening inputs), so it
    waits for an explicit yes.

21. **Correction charts travel with classifications, on a budget; and
    the test tool accepts short clips** (added and built 2026-08-26,
    from the owner's three questions: does a growing correction list
    slow classification down, can videos be uploaded, and how do we
    keep pictures from slowing it down). **Status: BUILT AND TESTED
    2026-08-26 (strat-journal-backend PR #23, strat-journal-app PR #27)
    — 22 backend checks, 30 browser checks. Not confirmed on a real
    phone, and the live AI service has not been asked to read a real
    iPhone clip yet.**

    Answering the first question plainly, since it drove the design:
    **no, the correction list does not grow without limit.** It was
    already capped at 20 written examples, so past 20 corrections the
    request stops getting bigger — new corrections displace old ones
    rather than piling on. Roughly a second of extra thinking time at
    the cap, on a call that already takes 10-30 seconds. Pictures are
    the part that would genuinely have hurt, hence the budget below.

    What was built:
    - **The shrunk teaching copy.** When feedback is saved, the phone
      makes a small 512px copy of the picture and sends it alongside
      the full-size one. The full one is kept for the owner to look at
      in the log; ONLY the small one is ever re-sent to the AI. A chart
      pattern is shapes — candle bodies, wicks, drawn lines — and
      shapes survive shrinking, so a small copy still shows what a
      correction meant.
    - **A deliberately narrow picture budget**, separate from the text
      budget: only CORRECTIONS carry a picture (a confirmed-correct
      read teaches little its text doesn't already say), at most 4 of
      them, newest first, under a combined 600KB ceiling. An entry that
      misses the picture budget still teaches through its words, so
      nothing is lost, only deferred.
    - **Labels on every attachment.** Several pictures in one request
      are otherwise an unlabelled pile with no way to tell which one
      the question is about. Each attachment now gets a short text
      label immediately before it, and the past-correction charts say
      outright "reference only — do NOT classify this one." This was
      the real risk in attaching examples at all.
    - **Short clips in the test tool.** The picker takes video as well
      as stills, previews it playable, and refuses anything over 10MB
      up front with a plain reason rather than letting a long upload
      die. The prompt tells the AI to judge the combo from the last
      completed candles at the END of the clip. Real auto-imported
      trades stay stills-only — a clip is far too heavy to re-send as a
      teaching example, so a corrected clip teaches through its written
      correction instead.
    - iOS hands .mov files over as "video/quicktime", which is renamed
      to the "video/mov" the AI's list names — same container, so this
      is a rename, not a conversion.

    Left unverified, deliberately stated rather than glossed: nobody
    has yet uploaded a real iPhone screen recording and watched the AI
    read it. That is the one thing worth doing first, since a rejection
    there would show up as a failed classification rather than anything
    subtler.

22. **Every correction is kept forever, and every one keeps teaching**
    (added and built 2026-08-26, from the owner's objection: "if this is
    capped at 20 and starts replacing entries at 21, then the previous/
    old uploads aren't saved. We need every entry to be remembered by the
    journal therefore it just continues to improve based on past
    uploads"). **Status: BUILT AND TESTED 2026-08-26
    (strat-journal-backend PR #24) — 21 checks, plus the 22 from PR #23
    still passing.**

    **A correction I owe the record here.** I told him the 20-cap did not
    delete anything and that everything was stored. The cap itself
    genuinely doesn't delete — but checking turned up a separate, real
    deletion I had not accounted for: saved feedback carried a 90-day
    expiry, so a lesson taught in the test tool would have quietly
    stopped existing after three months. He was right that entries were
    not being kept; I was wrong about why.

    Two things fixed:

    - **Nothing expires any more.** Feedback records are stored
      permanently. The one exception is the full-size picture, which is
      the only part big enough to fill the storage plan — it is now held
      separately so it can age out on its own without taking the lesson
      with it, and the small teaching copy is permanent, so an old entry
      still shows a chart in the log and still teaches. A one-time pass
      at server start strips the old expiry from entries already saved,
      so the existing history becomes permanent rather than the memory
      effectively restarting from today.

    - **The whole history now influences every classification**, via a
      running summary sent alongside the 20 recent verbatim examples:
      misreadings that recur (counted, each with the most recent
      explanation he gave for that kind of mistake), per-combo track
      record weakest-first, and recurring FTFC / Broadening biases.

    Why a summary rather than simply sending everything: sending all of
    them grows without limit and would eventually make every
    classification slow — the exact problem he asked about earlier the
    same day. **The summary's size grows with the number of DISTINCT
    KINDS of mistake, not the number of uploads.** There are only nine
    combos, so it is bounded by construction. Measured: 302 entries
    produce a 781-character summary; 1002 entries produce 790 — and the
    lesson from the very first upload still reaches the AI at 1002.

    Standing consequence worth remembering: **a wrong correction now
    lasts forever rather than ageing out**, and a repeated one gets
    counted and reported as a pattern. The clickable log (task 18) is
    the place to review them. Deleting a single bad correction was the
    obvious gap here and is now built — see task 23.

23. **Delete individual log entries, view pictures full size, and read
    partial timeframe continuity** (added and built 2026-08-26, from the
    owner: five junk entries he could not remove, no way to see an
    uploaded picture properly, and — the substantive one — "I need it to
    be able to recognize broadening formations, Strat combos, FTFC and
    also timeframe continuity that is not completely aligned in the same
    direction"). **Status: BUILT AND TESTED 2026-08-26
    (strat-journal-backend PR #25, strat-journal-app PR #28) — 20 backend
    checks, 27 browser checks, earlier suites still green.**

    - **Delete.** Each expanded log entry has a Delete button behind a
      confirm step. It removes the entry, its full-size picture, and its
      place in the index, and the lesson stops counting immediately.
      Confirm step kept deliberately: corrections are permanent and each
      shapes every future classification, so this both fixes a bad
      lesson and can lose a good one.
    - **Full-size view.** Any entry with a picture or clip gets a "View
      full size" button filling the screen. Tapping the picture itself
      deliberately does NOT close it — on a phone that would make
      pinch-zooming to inspect candles nearly impossible.
    - **Timeframe continuity is no longer yes/no.** This was the real
      request. The owner's own rule confirms continuity at any 4+
      CONSECUTIVE timeframes agreeing anywhere in the 13-timeframe
      ladder, so a run of two or three is a genuine, readable state that
      a yes/no answer was throwing away. Now **Confirmed / Partial /
      None / Unclear**, with a new per-timeframe read alongside it
      ("1D up, 4H up, 1H down") so a correction can land on the specific
      timeframe misread rather than only on the verdict. The correction
      form has a free-text box for that read, which is the highest-value
      thing he can correct — it teaches how HE reads a split ladder.
    - The prompt now teaches that rule explicitly, names the full ladder,
      and stops treating a single-timeframe screenshot as automatically
      "unclear": larger timeframes covered by the visible range can
      usually be read off it, so it is told to try before giving up
      while not inventing timeframes it cannot see.
    - **Broadening Formation reading strengthened**: lines the owner has
      drawn diverging on the chart are him marking the formation
      himself and weigh heavily; asymmetric widening still counts.
    - **Backwards compatibility mattered here.** Entries already saved
      used yes/no/true/false. Both ends translate those, so the existing
      back-history keeps teaching instead of reading as unrecognised
      values and silently dropping out.
