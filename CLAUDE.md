# Strat Trading Journal — Project Context

> **Before doing anything else, check `TASKS.md`** in this same folder for
> the current task list, their status, and any blockers.

## Who you're working with

The owner is a discretionary options trader, **not a developer**. Assume no
coding background. Explain things in plain language and avoid jargon unless
you define it. He does not want to read code to understand what changed —
tell him what it does and what to check.

He primarily uses the app on an **iPhone in Safari**. He has a MacBook Pro
(16-inch 2019, Intel i7, 16GB, macOS Tahoe) available for development, but
the app itself is used on the phone. Anything that only works on desktop is
not a fix.

## Working rules (these matter — they came from real failures)

1. **Verify before reporting.** Do not say something works until you have
   actually checked it. Run the code, run tests, check syntax. "It should
   work" is not acceptable. If you cannot verify something (visual
   appearance on a phone, real Schwab data), say so explicitly.

2. **Full review over one-at-a-time patching.** When debugging, read all
   relevant code first and report every problem found together. Do not
   fix one error, ship it, wait for a bug report, fix the next. That
   pattern has burned a lot of time on this project.

3. **Change one thing at a time when the cause is unclear.** Several
   past sessions shipped multiple simultaneous changes and made it
   impossible to tell which one broke things.

4. **Diagnose from evidence, not inference.** Browser console output and
   actual data beat guessing from screenshots. Ask for real error output
   before theorising.

5. **Say when you're wrong.** If a previous fix was aimed at the wrong
   cause, name that plainly rather than quietly moving on.

6. **The entire response must be understandable with zero coding or
   computer background — not just a trailing section.** Owner confirmed
   (2026-08-17) he has no technical or computer terminology knowledge at
   all, so this applies throughout a response, not only below a divider.
   When a technical detail genuinely has to come up, explain what it means
   in plain terms in that same sentence rather than assuming familiarity.
   Avoid the words commit, repo, function, variable, parameter, syntax,
   console, deploy, or any filename ending in .js/.html without explaining
   it in plain terms right there.

   Still end every response with an "In plain English" section containing:
   what was done (1-2 sentences), what he should do next (numbered steps),
   and anything he needs to click, tap, or check — but the rest of the
   response should already meet the same bar, not require translating.

## Architecture

**Frontend** — repo `alynnyree/strat-journal-app`, hosted on GitHub Pages at
`https://alynnyree.github.io/strat-journal-app/` (note the repo name in the
path; the bare domain 404s). A single `index.html`: vanilla JS, no build
step, no framework, dark theme, PWA-installable. Trades are stored in the
browser's localStorage under `strat_trades`.

**Backend** — repo `alynnyree/strat-journal-backend`, hosted on Render at
`strat-journal-backend.onrender.com`. Node/Express with Upstash Redis for
storage.

Backend files and what they do:
- `server.js` — Express app entry
- `auth.js` — Schwab OAuth, token refresh
- `api.js` — trade/pending/backfill/enrich routes
- `cron.js` — 5-minute auto-sync, historical backfill, runs all enrichment
- `schwabClient.js` — Schwab API calls
- `schwabStreamer.js` — persistent WebSocket to Schwab's real-time streamer
  (ACCT_ACTIVITY), auto-reconnect with backoff, rotates every 25 min before
  token expiry
- `matcher.js` — pairs opening/closing option fills into completed trades
- `tokenStore.js` / `tradeStore.js` — Redis persistence
- `ftfcCheck.js` — Full Time Frame Continuity across 13 timeframes,
  underlying price lookup, shared `fetchCandles`
- `replayData.js` — pulls the 1-minute candle window for Bar Replay
- `media.js` — screenshot upload/pending/delete (multipart, multer)
- `aiClient.js` / `aiRoutes.js` — Gemini API calls, `/ai/analyze` and
  `/ai/classify` routes

**Environment variables on Render:** `SCHWAB_CLIENT_ID`, `SCHWAB_SECRET`,
`SCHWAB_REDIRECT_URI`, `FRONTEND_ORIGIN`, `APP_SECRET`, `SYNC_CRON`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`PUSHCUT_NOTIFICATION_NAME`, `PUSHCUT_API_KEY`, `GEMINI_API_KEY`.

AI features use **Google Gemini's free tier** (gemini-2.5-flash, schema-
enforced JSON), not Anthropic's API — chosen to avoid ongoing API cost.
Browsers cannot call these APIs directly (CORS), so all AI calls are
server-side.

## The trading methodology (needed to reason about features correctly)

Uses **The Strat**. Key concepts the code implements:

- **FTFC (Full Time Frame Continuity)** — timeframes aligned in the same
  direction. Implemented across 13 timeframes (6M, 3M, 1M, 1W, 1D, 4H, 2H,
  1H, 30m, 15m, 5m, 3m, 1m). Confirmed when **any 4+ consecutive**
  timeframes agree — the run can start anywhere in the sequence, not just
  at the largest timeframe.
- **Setups traded — the owner's own 9-combo list** (corrected 2026-08-21,
  task 10; this section previously listed "2→3 Reversal, FTFC Continuation,
  Broadening Formation Reversal," which was **wrong** and stayed stale here
  for two days after the app itself was fixed — do not reintroduce it):
  2-1-2 Continuation, 2-1-2 Reversal, 3-1-2 Reversal, 2-2 Continuation,
  2-2 Reversal, 3-2-2 Reversal, 1-2-2 Rev Strat, 1 Bar Rev Strat, and PMG
  (Pivot Machine Gun). Each is usable Long or Short via the trade's own
  direction field, so there is no separate bullish/bearish variant of each.
  The authoritative copy of this list, with each pattern's full definition,
  lives in `aiClient.js`'s `STRATEGIES` array and must stay in sync with
  `index.html`'s Strat Setup cards (`data-v` values).
- **FTFC and Broadening Formation are context, not setups of their own.**
  Any of the 9 combos above can be taken with FTFC aligned and/or off a
  Broadening Formation — that's still that combo, just with context worth
  recording. The app tracks these as separate fields (`ftfcConfirmed`,
  computed mechanically from Schwab candle data; `offBroadeningFormation`,
  a manual toggle, since the owner confirmed a Broadening Formation is a
  multi-step judgment call the app does not auto-detect for real trades).
  The one deliberate exception is the sandbox Test Classification tool,
  which has no Schwab data to compute from and so reads all three visually
  from the picture.
- **Instruments:** SPY and IWM options, 0DTE–3DTE. Occasionally others.
- **Always buys to open** (calls or puts), never sells to open. This is why
  P&L needs no sign flip: a rising option price is always profit,
  regardless of whether the underlying bet is Long or Short. Long/Short is
  derived from CALL vs PUT, not from buy/sell instruction.
- **Stops** are drawn on the **underlying's chart** (a price level on
  SPY/IWM), not on the option premium. Realized R:R is therefore computed
  from the underlying's move, not the option's:
  `(undExit − undEntry) / |undEntry − stop|`, sign-flipped for Short.

## Feature status

**Working:**
- Schwab OAuth and auto-sync of trades directly into the Journal
- Real-time Schwab streaming (verified live)
- FTFC calculation, underlying price at entry/exit
- Bar Replay (candle-by-candle playback via TradingView Lightweight Charts)
- Realized R:R calculation
- AI Analyst (server-side, Gemini)
- PWA install
- **AI strategy auto-classification (server-side, Gemini)** — corrected
  2026-08-18: this was already built (since 2026-08-09) and runs
  automatically on newly-synced trades via `cron.js`'s
  `enrichWithStrategy`; the "not built" note below was stale. What was
  actually missing — and was added 2026-08-18 — was a way to run it
  against trades logged *before* that existed: a "Classify Trades" button
  on the Dashboard (shows only when trades are untagged) sends each one
  to a new `POST /ai/classify` backend route, one trade per request so no
  single phone request runs long. Deliberately conservative: only tags a
  trade when the model itself reports high confidence, so some trades
  will keep showing "Needs Setup" — that's expected, not a bug. Not yet
  confirmed against real trade data or on a real phone.

**Not working / not built:**
- **Screenshot capture pipeline** — Pushcut → iOS Shortcut → backend →
  auto-attach by timestamp. Owner confirmed this is NOT complete. Note it
  is inherently one-tap-per-trade, not zero-tap.
- **Backtesting** — never started.
- **Native iOS app** for zero-tap session recording — fully scoped, not
  started. Needs Xcode + free Apple ID (Personal Team signing avoids the
  $99/yr fee but requires re-signing roughly every 7 days). Design: one tap
  to start a session via Control Center tile, one-time ReplayKit consent,
  records through multiple trades, backend auto-clips each trade from the
  session recording using the same timestamp-matching approach as
  screenshots.

## Known traps (hard-won — do not re-learn these)

- **Lightweight Charts positions by candle SLOT, not by real time.** Adding
  a drawing as a data series with a far-future timestamp does NOT stretch
  it across the chart — it collapses into one slot, and inserting a
  non-candle timestamp physically shifts every candle. User-drawn lines are
  therefore painted on a **separate transparent canvas overlaid on the
  chart**, never added as chart series.
- **Forcing `barSpacing`/`minBarSpacing` while removing `fitContent()`
  blanked the chart entirely** (no candles, no gridlines, no price scale,
  and no console error). Candle size is fixed by limiting how much data is
  loaded, not by fighting the chart's layout.
- **Schwab retains 1-minute candle data for only ~30–35 days.** Older
  trades legitimately have no replay data. `ftfcCheck.js` cascades
  1m → 5m → 30m → daily so older trades still get an underlying price.
- **Expired options never produce a closing fill.** Their open legs used to
  sit in the matcher forever, so re-trading the same contract weeks later
  paired the new close against the ancient open — producing "trades"
  spanning a month and replays with thousands of candles. `matcher.js` now
  purges dead legs and prefers same-day matches.
- **iOS Safari measures container size before a fullscreen modal finishes
  laying out.** Chart sizing needs a short delayed re-measure.
- **A fade-in-on-scroll effect hid the entire Journal.** Sections were
  bound to the effect while their tab was still hidden, so they were set
  to invisible and then waited on a visibility notification that never
  arrived for them. Result: a Journal holding 233 trades, every one
  stored and every one rendered, displaying as a blank page — and the
  owner reasonably concluding his trades had never imported. **Rule: a
  visual effect may never be the only thing standing between the user
  and their content.** Anything already on screen is revealed
  immediately with no animation; only things genuinely below the fold
  are hidden; and there is a second, independent sweep on scroll so a
  missed notification cannot strand a section. Applies to any future
  animation, not just this one.
- **A record must be identified by what it IS, never by the reference
  number it was handed.** Imported trades were de-duplicated on their
  internal id. "Reset & Re-import" reissues the same trades with fresh
  ids, so every re-import wrote them all down again — 161 contracts in
  the journal that were never bought, across 52 contract-days, some
  trades stored character-for-character five times. It survived months
  unnoticed because duplicated wins and duplicated losses cancelled out
  and left total P&L looking nearly right (−$1,116 journal vs −$1,101
  real) while win rate, average win/loss and the per-setup breakdown were
  all quietly wrong. Identity for a trade is: contract, entry minute,
  exit minute, both fill prices, size. Applies to any future import path.
- **Never report an outcome for work that has not finished, and never
  dress a guess as a finding.** The import button waited seven seconds,
  then said "Schwab had nothing new — it may be older than the history
  Schwab will hand back." The server answers the moment the import
  STARTS; a year of history takes minutes. So the all-clear was reported
  over a job still running, and the retention line was invented — nothing
  had measured it. Worse, the loop stopped as soon as a round brought
  nothing, so a slow background job exited it after one round. If a job
  is asynchronous, follow its actual state; if the state is unknown, say
  it is unknown.
- **A caught-and-logged failure inside a loop is an invisible failure.**
  `getOptionFills` skips any 30-day window Schwab refuses, logging to a
  server log nobody reads. Twelve refused windows and twelve empty ones
  give an identical answer: no trades. Any loop that swallows per-item
  errors must count them and hand the count back to the caller.
- **A default date range is silent data loss.** Backfill defaulted to 90
  days on BOTH sides — and the frontend passed its own hardcoded 90, so
  raising only the server's default would have changed nothing. A journal
  that should have started 2 January started in mid-May, and nothing
  anywhere said "there is more history I did not ask for." When a range
  is bounded, either cover the whole plausible history or say on screen
  what was left out — and check both ends for a second hardcoded copy of
  the same number.
- **An edit that fails partway can write nothing while its follow-up
  edits succeed.** A Python replace script hit an assertion on its third
  substitution and so never wrote the file, but the next script added
  calls to the function that first script was supposed to define. The
  app threw on startup and sat on the opening screen forever —
  completely unusable — and no test caught it because none of them
  watched for errors on the page. **Always check the page for thrown
  errors in browser tests**, and re-verify that a multi-part edit
  actually landed rather than assuming it did.
- **Schwab's sign-in lasts SEVEN DAYS and cannot be extended.** The login
  flow has to be repeated by hand every week. When it lapses,
  `getValidAccessToken()` throws and every sync, history import and the
  live stream all fail at that one point — and because `runBackfill` is
  fired and forgotten by its route, the throw went to a `.catch` that
  logged and returned. The owner spent weeks being told "Schwab had
  nothing new" when nothing had been able to reach Schwab at all. The app
  now has a "Reconnect to Schwab" button; `/auth/status` reports whether
  the SERVER can reach Schwab, which is a different question from whether
  the app can reach the server.
- **Never show him a server's raw error text.** A lapsed sign-in reached
  the screen as `{"error":"unsupported_token_type","error_description":
  "400 Bad Request: ..."}`. The whole answer was in there and none of it
  was readable by the only kind of person who uses this app. Translate
  every failure into what happened, whether it is his fault, and what to
  tap.
- **The `/media` and `/ai` routes require the app key.** The frontend has an
  "App Key" field on the Journal tab that must match the backend's
  `APP_SECRET`. A 403 on `/media/pending` means these don't match.

## Testing expectations

There is no test suite. Before claiming a change works:
- Run a real JavaScript syntax check on `index.html`'s script block
  (extract it and parse it — brace counting is not sufficient).
- For backend logic changes (matching, date/window math), write a throwaway
  Node script that exercises the actual edge cases and print the results.
  Past bugs would have been caught this way.
- State plainly what you could NOT verify — anything about how the app
  looks or behaves on a physical iPhone is unverifiable from here.

## Deployment

Both repos deploy on commit to `main`:
- Frontend → GitHub Pages (takes a minute or two; verify via the Actions
  tab, not the Settings→Pages "last deployed" text, which caches badly)
- Backend → Render (auto-redeploys)

After backend matching/enrichment changes, the owner needs to tap
**"Reset & Re-import Trades"** on the Journal tab to rebuild existing
trades — old trades keep their stale data otherwise.
