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
   are now showing up. NOT yet verified: the owner tapping "Classify
   Trades" itself and checking the results make sense.

3. **Get the App Key/Backend URL to stay saved on the iPhone home-screen
   icon specifically** (added 2026-08-19, mid-investigation).
   **Status: Open, evidence gathered, one attempt not yet confirmed.**
   The home-screen icon kept losing its saved settings while a regular
   Safari tab of the same page never did. Found and fixed a real bug
   along the way: `manifest.json` and the icon PNG files that
   `index.html` has always linked to didn't exist in this repo at all —
   they'd been committed to the sibling `strat-journal-backend` repo by
   mistake in an earlier session. Without a real, reachable manifest,
   iOS had no reliable way to treat "Add to Home Screen" as a genuine
   installed app. Fixed by moving those files to this repo.
   Also confirmed directly (via an on-screen diagnostic line added to
   `index.html`, screenshotted by the owner): the home-screen icon *is*
   now correctly recognized as standalone/installed (`mode: standalone`)
   — but iOS strips `?backend=...&key=...` query parameters when it
   captures a home-screen icon, so a link-based auto-fill can never reach
   it; that whole approach (several attempts) was chasing something
   structurally impossible on iOS, not a bug to keep patching. Current
   recommendation, not yet confirmed by the owner: type the two values in
   directly, once, on the icon's own screen (not Safari, not a link) —
   should now actually persist since the underlying "not a real installed
   app" problem is fixed. If it doesn't hold, the fallback discussed is
   hard-coding the real App Key into the app's public code for 100%
   reliability, at the cost of that key being visible to anyone who views
   the page's source (flagged to the owner, not yet decided).

4. **Fix blank Bar Replay chart.**
   **Status: Open, but weakened by new evidence.** Originally: reproduces
   in Claude Code's own automated preview at `localhost:8934` — the chart
   area rendered as a blank white rectangle in a screenshot taken there,
   which was assumed at the time to be a quirk of the automated screenshot
   tool rather than a real bug. New evidence (2026-08-17): the owner opened
   that same address, with the same leftover test data, directly in his
   own Chrome browser — and saw real candles render correctly. That
   suggests the blank screenshot probably was a testing-tool artifact, not
   an app bug, at least on desktop with this test data. Still open: this
   does not confirm or rule out the original phone report with real trade
   data — that's a different browser, different device, different data.

5. **Test and fix drawing tools** (Trend Line, H-Ray, Magnet).
   **Status: Open.**

6. **Improve Bar Replay data quality.**
   **Status: Blocked.** Owner needs to describe what he actually wants
   before this is scoped or started.

7. **Complete the screenshot capture pipeline.**
   **Status: Open, unblocked (2026-08-19).** Task 1 (403 fix) is now done,
   so nothing is blocking this one from starting.

8. **Add daily/weekly risk-rule tracking** — a fixed risk-% per trade and a
   max-loss limit, written down and enforced/tracked in the journal.
   **Status: Open.** Not urgent, but currently nothing in the journal
   enforces or even records a risk-per-trade or max-loss rule — a real gap
   in knowing whether the overall system is sound, separate from whether
   any one setup is profitable.

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
    **Status: Fixed, unconfirmed on phone.** Fixed and saved permanently on
    2026-08-17 (commit `2f707e6` in `strat-journal-app`). Verified against
    the chart's internal numbers (not by looking at the picture — the
    screenshot came back blank at the time, see task 4 above): candle
    width stays constant during Play/step/scrub and only changes once when
    the timeframe is switched. Not yet confirmed by actually looking at
    the chart, on desktop or on a real iPhone with real trade data.
