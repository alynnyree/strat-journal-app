# Task List

Status key: **Open** (not started) · **Blocked** (waiting on the owner) ·
**Needs proposal first** (do not start building — propose an approach and
get sign-off) · **Fixed, unconfirmed on phone** · **Done**

Reordered 2026-08-17 to put the fix that unblocks other work first, and the
fix that would actually tell the owner whether his trading edge is real
ahead of chart/review-tool work. Original order is preserved in git history
via the `TASKS.md` commit log.

1. **Fix 403 error on `/media/pending`.**
   **Status: Blocked on owner (2026-08-18).** Diagnosed: both sides of the
   code are correct (the app sends the App Key correctly; the server's
   check is a correct exact match) — this is purely two settings not
   matching, not a code bug. Only the owner has the Render login where the
   real `APP_SECRET` value lives, so this can't be fixed from here. Fix:
   Render dashboard → strat-journal-backend service → Environment →
   `APP_SECRET` → copy its value → paste into the App Key box on the
   Journal tab in the app → save. Once done, blocks on task 6 (screenshot
   pipeline) are cleared.

2. **Build AI strategy auto-classification.**
   **Status: Fixed, unconfirmed on phone (2026-08-18).** Correction: the
   classifier itself, and the Dashboard's "which setup makes money"
   breakdown, already existed in the code (since 2026-08-09) — this
   list's "not built" note was stale, not accurate. The real gap was that
   it only ran automatically on trades synced *after* it existed, so the
   ~199 already-logged trades from before that never got tagged. Added:
   a "Classify Trades" button on the Dashboard (only appears when trades
   are untagged) that sends each untagged trade to a new backend route
   (`POST /ai/classify`) one at a time, tags it if the AI is highly
   confident, and leaves it as "Needs Setup" otherwise. Verified: the new
   backend route was tested with a stand-in (fake) AI response and
   correctly handles a wrong App Key, a missing trade, a confident match,
   an unsure match, and a server error — and the app's on-page code was
   checked for typos/syntax errors. NOT verified: an actual classification
   run against his real ~199 trades, or how it looks/behaves on his
   iPhone — both need the owner to tap the new button and check results.

3. **Fix blank Bar Replay chart.**
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

4. **Test and fix drawing tools** (Trend Line, H-Ray, Magnet).
   **Status: Open.**

5. **Improve Bar Replay data quality.**
   **Status: Blocked.** Owner needs to describe what he actually wants
   before this is scoped or started.

6. **Complete the screenshot capture pipeline.**
   **Status: Open.** Depends on task 1 (403 fix) above.

7. **Add daily/weekly risk-rule tracking** — a fixed risk-% per trade and a
   max-loss limit, written down and enforced/tracked in the journal.
   **Status: Open.** Not urgent, but currently nothing in the journal
   enforces or even records a risk-per-trade or max-loss rule — a real gap
   in knowing whether the overall system is sound, separate from whether
   any one setup is profitable.

8. **Build backtesting** (hypothetical entries/stops/targets run against
   historical replay data).
   **Status: Needs proposal first.** Propose an approach and get sign-off
   before writing any code.

9. **Build native iOS app for zero-tap session recording.**
   **Status: Open.** See CLAUDE.md's Feature Status section for the
   existing design notes (Control Center tile, ReplayKit consent, Personal
   Team signing re-signs roughly weekly).

10. **Fix candle-shrinking during playback.** The chart view was re-fitting
    itself every single frame, so candles got thinner and thinner as more
    of them appeared during Play.
    **Status: Fixed, unconfirmed on phone.** Fixed and saved permanently on
    2026-08-17 (commit `2f707e6` in `strat-journal-app`). Verified against
    the chart's internal numbers (not by looking at the picture — the
    screenshot came back blank at the time, see task 3 above): candle
    width stays constant during Play/step/scrub and only changes once when
    the timeframe is switched. Not yet confirmed by actually looking at
    the chart, on desktop or on a real iPhone with real trade data.
