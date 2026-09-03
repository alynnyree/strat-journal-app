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
  (Pivot Machine Gun).

  **HE DOES NOT READ THEM BY THOSE NAMES** (confirmed 2026-08-31, his own
  words): *"I don't look at 2-2 as 2-2 reversals or 2-2 continuations, I
  look at them as 2U-2D (Bearish) or 2D-2U (Bullish). This applies to
  every combo."* His notation: **2U** = a directional bar that took out
  the previous bar's HIGH, **2D** = one that took out its LOW, **1** =
  inside bar, **3** = outside bar. So a bearish 2-2 reversal is 2U-2D and
  a bullish 2-1-2 continuation is 2U-1-2U. The AI reports the bar
  sequence it read in `notation`, and the card shows THAT with the combo
  name underneath — the nine names are kept only as the stable key his
  performance is grouped by, because renaming them would relabel every
  trade already in his journal. Each is usable Long or Short via the trade's own
  direction field, so there is no separate bullish/bearish variant of each.
  The authoritative copy of this list, with each pattern's full definition,
  lives in `aiClient.js`'s `STRATEGIES` array and must stay in sync with
  `index.html`'s Strat Setup cards (`data-v` values).
- **THREE PLAYS, alongside the nine combos — not instead of them**
  (confirmed 2026-08-29, in his own words: "These strategies are in
  conjunction with the 9 strat combos. Nothing should be disregarded").
  The combo is WHAT he saw; the play is HOW he chose the trade. A trade
  carries both, and each is classified separately.
  1. **Broadening Formation Scalp** — broadening formation on a higher
     timeframe, scalped on the 1m/5m from one edge to the other side.
  2. **FTFC Direction Play** — a Strat setup in the direction the
     timeframes already agree on. First target is completion of the
     setup, second is a gap or major pivot; once a pivot or its liquidity
     is taken out, looking to reverse.
  3. **2s Turning Into 3s** — a directional bar expanding into an outside
     bar.
  All three target reward at least 2x risk. The authoritative copy lives
  in `aiClient.js`'s `PLAYS` array and must stay in sync with the app's
  own picker (`data-v` on `.play-opt`).
- **FTFC and Broadening Formation are context, not setups of their own.**
  Any of the 9 combos above can be taken with FTFC aligned and/or off a
  Broadening Formation — that's still that combo, just with context worth
  recording. The app tracks these as separate fields (`ftfcConfirmed`,
  computed mechanically from Schwab candle data; `offBroadeningFormation`,
  his own manual toggle).

  **REVERSED 2026-08-31 — the AI now reads the Broadening Formation
  itself.** It was previously left to his toggle alone, on his earlier
  confirmation that it is a multi-step judgement call. He asked for the
  opposite, and his reasoning settles it: *"AI should spot broadening
  formation itself. It needs to know how to classify my trades when a
  trade gets automatically imported."* Without it the AI can never pick
  **Broadening Formation Scalp** as the play. Its reading is stored as
  `broadeningDetected` BESIDE his toggle, never over it — his answer is
  the truth, and the card marks the AI's as "read from the chart".

  **Alignment is supporting evidence now** for which combo it was, where
  the bars alone are genuinely ambiguous. The nine remain the only valid
  combo answers and alignment may never override what the bars plainly
  show.
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
- **De-duplication and REBUILDING pull in opposite directions.** A trade
  is identified by contract, entry minute, exit minute, both prices and
  size — and a rebuilt trade matches its saved self on every one of them,
  because that is what a rebuild is. So "Reset & Re-import" had its
  rebuilt copies thrown away as duplicates: an hour of work, nothing
  changed, reported as "no new trades". A repeat arrival must UPDATE the
  saved trade with what the server works out (fees, underlying price and
  its provenance, FTFC, replay, and a setup/play/stop only where he has
  none) and never touch his own — notes, screenshots, his own tag, his
  stop, his planned R:R. An empty answer must never overwrite a good one.
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
- **The underlying price is a RECONSTRUCTION, not a record.** Schwab's
  trade record never says where SPY was at the fill. `getUnderlyingPriceAt`
  takes the close of the last candle before the trade, cascading
  1m → 5m → 30m → daily as older data runs out, so an old trade's
  underlying can come from a 30-minute close or the previous day. Realized
  R:R is computed from it and inherits the error. Never describe it as
  exact.
- **Fees are derived from the CASH, not from Schwab's fee lines.** A buy
  pays the contracts' value plus fees, a sell brings in that value minus
  fees, so `|netAmount| − price×100×qty` is the fee — arithmetic verified
  on all 480 of his real fills. An unknown fee is stored as null, never 0,
  and a null on either side makes the trade's fee and net P&L null too.
- **The Schwab CSV export carries NO times.** Its columns are Date,
  Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount, and
  Date is "07/23/2026". It can confirm dates, prices, sizes and P&L — it
  can never confirm entry/exit times. Those are covered by direct checks
  on `toEasternParts` instead (summer/winter, both DST changeovers,
  midnight-as-24, and a late-evening trade that must not roll onto the
  next UTC day).
- **"Most recent" means most recently FINISHED, not most recently
  started.** Having given the Journal a sort, it sorted by entry — so a
  NIO position opened 24 June and closed 23 July sat below every trade
  opened in July, even though nothing had been closed since. He reported
  the order as wrong a second time and was right a second time. For a day
  trade the two are identical, which is exactly why it survives testing;
  the multi-day hold is the case that exposes it.
- **A list with no sort is not "in order", it is in write order — and
  fixing the one he reported is not fixing it.** The Journal drew trades
  in whatever order they sat in storage. Imports add
  at the front, so the January-to-April backfill — fetched last — landed
  ABOVE the May-to-July trades already there, and the owner reasonably
  reported the log as inaccurate. Any list shown to him needs an explicit
  order.
- **The same fault was still in three other lists a day later.** The
  Journal's ordering was fixed on 29 August; "Recent Trades" on the Home
  tab, the JSON export, the spreadsheet export and the trades handed to
  the AI Analyst were all still `loadTrades()` with no sort. So the Home
  tab showed four-month-old trades under the heading "Recent Trades"
  while his most recent sat further down, and he reported it. When a
  rule like this is learned, sweep EVERY reader of the data for it in
  the same change — `grep loadTrades()` took one minute and found all
  four.
- **A list must show the field it is SORTED by.** Recent Trades showed
  the entry date while being ordered by the close, so his NIO position
  (opened 24 June, closed 23 July) sat at the top displaying a June date
  and looked misplaced. It now shows "closed 2026-07-23" when the two
  differ, and just the date when they do not.
- **A comparator must answer "these two are equal" with 0.** The Schwab
  file reader sorted fills with `a.date === b.date ? (isBuy ? -1 : 1) : …`,
  so two same-day buys each compared as "me first". Six trades split
  differently out of the same file. Equal inputs return 0; the sort is
  stable and input order survives.

- **"Reset & Re-import" was maintenance the app made HIM perform.** Every
  time the server learned to work something out it could not before —
  fees, a real underlying price, alignment from minute data — the saved
  trades were stale and only that button fixed them. He cannot know when
  that happens, so it could only ever be a button he was told about
  afterwards, and he asked twice why he kept having to press it. The
  journal lives on the phone, so the server cannot refill it; the app now
  notices the gap itself and rebuilds. Anything that runs on its own needs
  bounds on every side — a rate limit, an attempt cap, a "not while one is
  already running" check, and a minimum worth doing.
- **A second answer added later is invisible to a check written for the
  first.** Reading a trade's setup asked "is the setup missing?" When the
  three plays were added as a second, separate answer, every trade that
  already had a setup was still "not missing" — so the play could never
  be filled in on any of them, however many times reading ran, and no
  error was ever raised. When a record gains a second field that the same
  job fills, every "is this done?" test written for the first one is now
  wrong.
- **"Out of allowance" is not "broken".** A free AI tier refuses once its
  per-minute or per-day ceiling is hit, and that refusal looked exactly
  like a trade that could not be read. A backlog would grind through three
  hundred identical refusals and mark every trade as already looked at,
  permanently. A rate refusal must be its own answer, must pause the run,
  and must not spend the item's retry.
- **Never invent the number you are comparing against.** Told July showed
  3 trades, I said roughly 24 were expected and called it an anomaly.
  Nothing had measured 24. His own broker export has exactly two option
  fills in July — the NIO closes — and none at all in August; he stopped
  trading on 23 July. Three was right, the alarm was mine, and the file
  that settles it was already on disk. Measure first, then compare.
- **A job nothing watches is a job he has to press a button for.** The
  5-minute cron only looked for NEW trades. A backfill Schwab blocked, or
  one killed mid-run by a Render restart (left marked "running" forever),
  had nothing watching it — so the only way out was a manual tap, and he
  reported having to tap repeatedly. Twice. Any long job that can be
  interrupted needs something that resumes it on a schedule, with a
  backoff and an attempt limit.
- **One unwrapped failure anywhere ended the ENTIRE server.** Render
  emailed him "Exited with status 1" — Node ends the whole process on an
  unhandled promise rejection or a throw inside an event handler, and
  there was no `process.on('unhandledRejection')` or `uncaughtException`
  anywhere in the backend. So a WebSocket that refused to open, or a
  `ws.send` on a socket that had just closed, took down the five-minute
  sync, the live stream, the history import and every route the phone
  talks to, all at once — and he found out hours later from an email he
  could do nothing with. Anything started and not waited on
  (`connectStreamer()`, `setTimeout(connectStreamer)`,
  `persistExistingFeedback()`, the cron callback) needs its own catch, a
  throw inside an event handler needs its own try, and the process needs
  a floor under it. Confirmed by test: without the guards a single
  `Promise.reject` exits with status 1; with them the process survives
  fifty in a row.
- **A timeframe's direction was read from the END of the bar the entry
  sat in.** "Bullish" was `candle.close > candle.open` on the candle
  CONTAINING the entry — and a candle's timestamp is its START, so the
  daily used the whole rest of the day and the monthly the rest of the
  month. Proven: a day that opened at 100, traded at 101.8 when he
  entered, and closed at 98 was reported BEARISH at entry. Every
  alignment figure he had been shown was partly measured from price
  action that happened after the trade, which flatters it. The rule is
  now the price at entry against the OPEN of the bar forming at that
  moment — what The Strat actually means — using nothing later than the
  fill. Any "was the market X at that time" question must be answered
  with data that existed at that time.
- **Grouping candles by position in the list is not a timeframe.**
  `aggregateCandles` built 3m/1H/2H/4H/3M/6M by taking N candles at a
  time from the array, so a "4-hour bar" opened Thursday afternoon and
  closed Friday morning, and each bar was stamped with its LAST
  sub-candle so the wrong one was selected. Intraday bars are anchored to
  that day's session open; quarters and half-years follow the calendar.
- **Two different rules across thirteen timeframes is worse than either.**
  Six timeframes used the previous completed bar, seven used the bar
  containing the entry — so a "run of 4 consecutive" could be four
  different questions. One rule, all thirteen.
- **"The timeframes agreed" and "they agreed with me" are not the same
  question.** The card said only "FTFC", so a Short taken into a fully
  BEARISH market — the setup he wants — looked identical to a Short taken
  into a fully BULLISH one, which is its opposite. He reported not being
  able to tell them apart. Worse, `isAligned` was `!!t.ftfcConfirmed`, so
  the Dashboard scored a trade taken straight against full agreement on
  the "timeframes agreed" side — the one number meant to tell him whether
  waiting for alignment pays was averaging the two together. `ftfcDirection`
  had been stored the whole time and nothing read it. Alignment is now
  four states: with, against, none, and unknown.
- **"Unknown" must not be folded into "no".** Trades enriched before the
  direction was stored have agreement on file with no direction. Counting
  those as "did not agree" states something untrue about them; counting
  them as aligned is a guess. They are excluded from the comparison and
  reported separately. Any new distinction drawn over old records needs
  this fourth answer, or the old records quietly become evidence for
  whichever side the code happens to default to.
- **A counter that only moves on success reads as "nothing is happening".**
  The setup reading advanced its progress figure only on a tagged or
  unclear answer, so twenty failed requests in a row displayed as "0 of
  20 looked at" — for ever, with no hint that anything was wrong. He was
  looking straight at a failure and could only tell me the number had not
  moved. A failure is still progress through the list, and the reason
  belongs on screen in the server's own words.
- **A hand-picked return list drops the answer added later.**
  `runClassification` returned `{strategy, confidence, reasoning,
  usedScreenshot}`. The PLAY was added to the schema on 29 August, the
  model answered it every time, and this threw it away every time — so
  `classifyStrategy` always saw `result.play` as undefined and always set
  it to null. Not one trade could ever have been given a play by the
  automatic reading. Return what the far end answered, not a list written
  before half of it existed.
- **A phone will not hold a connection open while a server thinks.**
  `/ai/classify` called Gemini and answered only when it came back — ten
  or twenty seconds, past a minute once its three retries and the
  bigger-budget retry are counted. Every one of his requests failed with
  Safari's "Load failed" and none of his 304 trades was ever read. It was
  never the size of the request; it was the WAIT. Anything that takes
  more than a few seconds must answer immediately and be collected later.
  Measured after: answered in under 800ms while the AI took 3000ms.
- **Three wrong guesses before measuring the right thing.** The oversized
  payload, an old server build, and a memory restart were all plausible
  and all wrong. What settled it was the Details block reporting the
  server as healthy, current and answering — which left only the one
  thing not yet ruled out. Rule out with evidence, not with plausibility.
- **Sending the whole record to use a fifteenth of it.** The AI
  classification posted the ENTIRE trade, and since Alpaca started
  working every trade carries up to 1,200 replay candles — while the
  classifier reads the last fifteen. Measured: 99KB sent where 2KB was
  needed, ~2MB per batch of twenty, up from a phone on mobile data. His
  Checks page reported "Could not reach the server: Load failed", which
  is what Safari says when a request like that does not survive. Send
  what the far end reads, not what happens to be on the object.
- **A step that must happen cannot sit downstream of one that can fail.**
  `maybeAutoRebuild` ran after `pollBackend` inside one shared try, so
  when his phone could not reach the server to collect trades, the
  rebuild was never even considered — and the page could only say "it has
  not been asked yet". It has its own try now. Anything that must happen
  regardless needs its own attempt and its own catch.
- **Every path that declines must say why it declined.** "It has not been
  asked yet" is the same dead end as a counter that will not move: it
  names the symptom and hides the cause. Each way out of
  `maybeAutoRebuild` now records its reason, and the Checks page prints
  it.
- **He must never have to DISCOVER silence.** Twice he reported figures
  that would not change, and both times the cause was something refusing
  quietly — a rebuild turned down by a spent limit, then every AI request
  failing. The Checks page now names what is outstanding, when it was
  last attempted, what the server said when it failed, and offers a
  forced re-measure. Anything that runs on its own must be able to say
  why it did not.
- **A limit meant for a GUESS must not block a certainty.** The
  timeframe reading was corrected and every trade needed measuring again
  — but `maybeAutoRebuild`'s three-attempt cap and twelve-hour cooldown
  had already been spent on earlier rebuilds for entirely different
  reasons, so the one rebuild that mattered was refused in silence and he
  saw the same figures and said so. Those limits exist to stop a
  heuristic ("these trades look short of something") looping for ever.
  A definite, one-off re-measure asked for by a corrected rule is a NEW
  reason: the history now records which rule version it belongs to, and a
  new version gets one fresh attempt immediately. Any future rule change
  needs the same, or it will not reach the trades already on file.
- **Two cards showing the same split will disagree.** "FTFC Timeframe Hit
  Rate" and "Does Alignment Pay?" both broke the trades into the same
  three groups — but one counted a win by the price move and the other by
  the money that actually arrived, so a trade whose fees turned a small
  win into a small loss was a win on one card and a loss on the other.
  Merged into the one that counts the money.
- **Memory a process CHURNS is memory the hosting company kills it for.**
  Reading the thirteen timeframes built a fresh `Intl.DateTimeFormat` on
  every call — once per candle per timeframe, about 23,000 per trade —
  and each of the eight intraday timeframes re-scanned the whole candle
  series. Measured across one batch of 25 trades: **+476MB of memory
  while only 27MB was ever held**. A process never hands churned memory
  back, so the peak is what gets it restarted. Building the formatter
  once and finding the session once took that step from +476MB to +16MB;
  the whole rebuild went from 595MB/633s to 110MB/4s. Never build an Intl
  formatter, a RegExp, or anything else expensive inside a per-item loop.
- **Fetching more than the answer needs is a memory bug.** The timeframe
  reading fetched four minute-series of ten days each when one series
  over two days answers all eight intraday timeframes — every intraday
  bar is anchored to the session open, so a 30-minute bar's open is just
  the open of the first 1-minute candle inside it. Twenty times less data
  for an identical answer.
- **Measure the process, not the code.** Three rounds of reasoning about
  what "looked heavy" got nowhere; instrumenting each enrichment step and
  printing RSS found it in one run. When memory is the complaint, run the
  real thing and watch it.
- **A cap on pages is not a cap on size.** `fetchBars` limited itself to
  200 pages of 10,000 candles — two million objects, measured at 274MB in
  one array, on a server whose whole allowance is a fraction of that.
  Render restarted it for "exceeded its memory limit". Capped at 150,000
  candles (72MB measured), and truncation is logged rather than quietly
  returning less than was asked for. Any accumulating list needs a
  ceiling on what it accumulates, not just on how many times it loops.
- **A process killed from outside leaves no record.** The crash log added
  after the "status 1" crash cannot catch a memory kill: nothing in the
  program runs. So `/health` reports memory in use and PEAK memory,
  sampled on a timer as well as on request, and the Checks page treats a
  very short uptime as the fingerprint of a restart nobody recorded.
- **A long job that saves only at the end loses everything to a restart.**
  `runBackfill` enriched all 300 trades and saved once. Every restart —
  and there were several — threw the whole run away. It saves every 25
  now.
- **A cache that empties on restart is not a place to keep an answer.**
  His Alpaca keys are typed into the app and kept in storage, but the
  gate deciding whether to use Alpaca called `isConfigured()`, which
  reads only the in-memory copy. That copy is empty after every restart,
  so the gate answered "no" while the keys sat in storage — and six
  paths silently fell back to Schwab: the underlying price (marked
  "approx." for weeks), Bar Replay, FTFC minute data and three in
  backtesting. `underlyingPriceAt` did load the keys, but the gate closed
  before it was reached. Use `alpaca.isReady()`, never `isConfigured()`;
  `guardCheck.js` now fails on the latter.
- **"Silently falls back" is the same as "quietly wrong".** Nothing was
  logged, nothing was flagged, every trade got a price, and the only
  visible sign was one small word — "approx." — that he had to notice
  himself. A fallback that changes the QUALITY of an answer must record
  that it happened, which is what `undPricedWithAlpaca` is for.
- **A rule nothing enforces is a rule that will be broken again.** After
  the crash, thirty-seven async routes needed wrapping — and the first
  hand-audit found only ten of them, because it looked for a missing
  try/catch instead of the real requirement. `guardCheck.js` now reads
  every file and fails on the three shapes that caused the crash, and a
  GitHub Action runs it on every push. It caught a real regression while
  being written (a route wrapped in `wrap()` in a file that never imported
  `wrap` — the server would not start at all).
- **A crash guard is a floor, not a substitute for the code being right.**
  That missing import was caught and survived by `installCrashGuards`, and
  the process stayed alive — but it never reached `app.listen`, so nothing
  answered. "Still running" is not "working". Every change to the server
  gets a smoke test that boots it for real and hits every route.
- **Express 4 does not understand a route handler that fails.** An
  `async (req, res) => {}` that throws produces a promise nobody is
  holding, which ended the whole process — checked directly, not assumed.
  Ten routes had nothing around them, including `/api/trades/pending`,
  which his phone polls every thirty seconds: one hiccup reaching storage
  while the app was open would have taken the server down. Every async
  handler goes through `wrap()` from `asyncRoute.js`, and `errorHandler`
  is mounted last so a failed request answers instead of hanging. Any new
  async route needs the same.
- **A crash nobody can read is the same as no crash report.** Render's
  logs age out and he cannot read them anyway. Each failure is now
  written to storage and reported by `/health` (`uptimeSeconds`,
  `startedAt`, `recentFailures`), and the app's Checks page says in plain
  words whether the server is up, how long it has been up, and whether it
  hit anything recently — so "why did my trades stop" is answered from
  evidence rather than guessed at.
- **A test that reads the source and matches text fails on a comment.**
  `resume-test.js` asserted `/cron\.schedule\([\s\S]{0,300}resumeBackfillIfNeeded/`.
  Adding a comment above the call broke it while the behaviour was
  untouched. The cron callback is now a named `runScheduledTick` the test
  actually runs. Prefer calling the thing over pattern-matching the file.
- **Never bake an instruction into an error message.** `plainErrorText`
  returned "…wait fifteen minutes and tap Get My Trades again" as part of
  the cause, so when the server gained the ability to retry by itself the
  message told him both "nothing for you to do" and "tap this". Errors
  describe what happened; only the caller knows whether he must act.
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
- **A diagnostic that lies is worse than none.** The Details block was
  built while the health check was still in flight, so it printed
  "server up 0m · mem ?MB" every single time, whatever the server had
  actually said. I read that as evidence his server was running old code
  and nearly told him so. Anything that reports a measurement must wait
  for the measurement, and must be able to say "not checked yet".
- **"Did not say" is not "said no".** Treating a missing
  `ftfcRuleVersion` as "the server is behind" would have blocked the
  re-measure for ever with no way out — a worse failure than asking for
  one that turns out not to help. Absent means unknown; only an explicit
  lower number means behind.
- **A warning only counts where he actually looks.** Schwab's seven-day
  sign-in has a countdown, a lapse check and a "Reconnect to Schwab"
  button — all of it on the Journal tab, which he opens roughly never,
  because the whole point of this app is that trades arrive on their own.
  So the first sign of a lapsed sign-in was still a quiet week with no
  trades in it. The countdown now sits at the top of the Home tab, the
  first thing on the first screen: one calm line above two days left, gold
  with a button under two days, red with a button once it has gone. A
  warning placed where the failure gets diagnosed is not a warning; it
  goes where the failure gets NOTICED.
- **A test must ask whether the information transferred, not whether the
  market obliged.** The full-test setup step failed whenever the AI named
  no combo — but at a random minute there may be no setup, and the AI
  honestly saying so is the transfer WORKING (candles in, a real answer
  back). "Reached the AI, not confident" and "could not reach the AI" had
  been folded into one null; a rehearsal has to tell them apart, because
  only the second is a fault. Reached-with-nothing is a pass, shown as a
  gold dash and said plainly not to be a fault — never a red cross that
  sends him chasing a bug that is not there.
- **An empty market is not a broken app, and he cannot tell them apart.**
  The rehearsal lets him pick any day, but Schwab throws away
  minute-by-minute data after about a month — so picking a day from
  January returns no timeframes and no replay, which looks exactly like
  two broken features. The choice is allowed and the reason is said up
  front, in the same breath as "that is not a fault". Any input that can
  produce an empty answer for reasons outside the app must say so before
  it runs, not leave him reading a failure.
- **A rehearsal must run the REAL thing, and be unable to reach his
  data.** The full test trade calls the actual matcher and the actual
  enrichment steps, which is how it found that the matcher reads
  `state.pending` as well as `state.openLegs` — a hand-written stand-in
  would have hidden that. And it is kept OUT of the journal rather than
  filtered out of it: 33 places read `loadTrades()`, and a rule needing
  all 33 to remember an exclusion is a rule that will be broken. Separate
  storage cannot be forgotten.
- **A test that can write into his journal is not a test.** The rehearsed
  trade produces real pictures through the real path, and his journal has
  already been polluted once — 161 contracts he never bought. The mark
  travels from the queued moment, through the upload, to the app, and
  every step was tested including that a REAL moment does NOT carry it.
  A label only means something if the other case is checked too.
- **A capture taken late is a capture of the wrong thing.** The laptop
  add-on photographs the screen when the server says a trade opened or
  closed — and stamps the picture with the TRADE's time, which is right.
  But the server holds that instruction for twenty minutes, so a browser
  that was closed at the fill and opened ten minutes later would
  photograph whatever happened to be on screen and file it against the
  trade. An unrelated picture that looks entirely real, with nothing
  anywhere saying so. It now refuses anything older than three minutes.
  A missing picture is recoverable; a wrong one is evidence.
- **Round a countdown DOWN, always.** 40 hours reads as "1 day", not
  "2 days". Overstating time left costs him a day of trades; understating
  it costs him one early sign-in.
- **Never show him a server's raw error text.** A lapsed sign-in reached
  the screen as `{"error":"unsupported_token_type","error_description":
  "400 Bad Request: ..."}`. The whole answer was in there and none of it
  was readable by the only kind of person who uses this app. Translate
  every failure into what happened, whether it is his fault, and what to
  tap.
- **A phone alert has to work with the setup he already has.** The
  sign-in reminder falls back to the notification name already set for
  closed trades rather than requiring a new one. A reminder that needs a
  setting added before it works is a reminder that never arrives — and
  he would never know it had not.
- **The `/media` and `/ai` routes require the app key.** The frontend has an
  "App Key" field on the Journal tab that must match the backend's
  `APP_SECRET`. A 403 on `/media/pending` means these don't match.

## What belongs on his screen

He is a discretionary trader, not a developer, and on 2026-08-31 he said
plainly: *"The app shouldn't contain writings that explain the technical
aspect of this app. Everything should be simplified."* He was right, and
the Checks page had become a diagnostics console built for my benefit —
three coloured boxes, memory figures, server uptime, and raw error text
from the server printed on his phone.

The rule from here:

- **One line tells him where he stands.** Up to date, catching up, or
  stuck. Nothing else at the top of a page.
- **Never these words on screen:** server, memory, MB, uptime, rebuild,
  attempt, cooldown, API, endpoint, cache, or any raw error text.
- **Never a number he did not ask for.** Memory in use, uptime and
  attempt counts are mine, not his.
- **"Nothing for you to do" is the default ending.** The app is supposed
  to be automatic; if he has to act, that is a failure worth naming, and
  it gets one button.
- **Technical detail still has to exist** — I need it to fix things — but
  it lives behind a "Details" tap he only opens when I ask, and it is
  written to be sent to me, not read by him.

Anything that fails this test is a bug, the same as a wrong number.

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
