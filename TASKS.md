# Task List

Status key: **Open** (not started) · **Blocked** (waiting on the owner) ·
**Needs proposal first** (do not start building — propose an approach and
get sign-off) · **Fixed, unconfirmed on phone** · **Done**

Reordered 2026-08-17 to put the fix that unblocks other work first, and the
fix that would actually tell the owner whether his trading edge is real
ahead of chart/review-tool work. Original order is preserved in git history
via the `TASKS.md` commit log.

50. **The app now says why nothing is happening** (2026-08-31).
    **Status: BUILT AND TESTED (12 new browser checks plus every app suite
    re-run). The underlying AI failure is NOT yet diagnosed — this is what
    makes it visible.**

    He sent the Dashboard again: the two cards were correctly merged, but
    the alignment figures were still 174 / 53 / 77, and the setup reading
    read "0 of 20 looked at".

    **What that "0 of 20" actually meant.** The progress figure only moved
    on a successful read. So twenty requests failing one after another
    displayed as "0 of 20" indefinitely, with nothing anywhere saying a
    single one had failed. He was looking directly at a broken thing and
    the only symptom available to him was a number that would not move.
    Every trade in his journal still showing "Unclassified" is the same
    fact from the other side — this is not a regression, they have never
    been classified, and now we can find out why.

    Three changes, none of them a guess about the cause:
    - a failed read counts as progress through the list, so a failing run
      no longer looks like a stalled one
    - the server's OWN words are captured and shown, instead of a silent
      `return 'error'`
    - the Checks page gained a section that names what is outstanding,
      when it was last attempted, what came back, and a button to force
      the re-measure when the automatic path has not managed it

    **What is still unknown:** why every AI read is failing on his server.
    This environment cannot reach it and cannot call Gemini, so it cannot
    be diagnosed from here — which is exactly why the reason now has to
    reach his screen.

49. **Why his numbers did not change, and one card instead of two**
    (2026-08-31). **Status: BUILT AND TESTED (3 new browser checks on the
    cause, plus every app suite re-run). Not confirmed on his phone.**

    He said the numbers were still the same. They were, and this is why.

    **The re-measure was refused in silence.** The timeframe reading was
    corrected and every trade needed measuring again — but the app allows
    only three automatic rebuilds and only one every twelve hours, and
    BOTH had already been spent earlier the same day on unrelated
    rebuilds. So the one that actually mattered was turned down, quietly,
    and he saw exactly what he saw before.

    Those two limits exist to stop a guess — "these trades look short of
    something" — running in circles. A corrected rule is not a guess; it
    is a definite, one-off reason. The record of past rebuilds now says
    which version of the rule it belongs to, and a new version gets one
    fresh attempt straight away. After that the ordinary limits apply
    again, so it still cannot loop.

    **Two cards became one.** "FTFC Timeframe Hit Rate" broke the trades
    into the same three groups as "Does Alignment Pay?", showing two of
    the same four columns — and it counted a win by the price move while
    the other counts the money that actually arrived, so a trade whose
    fees turned a small win into a small loss showed as a win on one card
    and a loss on the other. Now one card, counting the money.

48. **The re-measure ran the server out of memory, and this is what was
    doing it** (2026-08-31). **Status: BUILT AND TESTED (6 new measured
    server checks, every suite in both repos re-run). Not verified on the
    live server.**

    He forwarded another "exceeded its memory limit" alert, sent the
    moment the re-measure from task 47 started. Measured by running the
    real rebuild over 304 trades and watching the process:

    | | peak memory | time |
    |---|---|---|
    | before | 595 MB | 633 seconds |
    | after | 110 MB | 4 seconds |

    It was over the limit inside the FIRST batch of twenty-five trades.

    **What was doing it.** Not anything being kept — anything being
    churned. Reading the timeframes built a brand-new date formatter for
    every single candle, roughly 23,000 per trade, and each of the eight
    intraday timeframes scanned the whole candle list again to find the
    entry day. Across one batch that threw away 476 MB while only ever
    holding 27 MB — and a program never gives that memory back to the
    machine, so the hosting company sees the peak and restarts it.

    Two more reductions found while in there: the reading was fetching
    four sets of minute data covering ten days each, when one set over
    two days answers all eight intraday timeframes; and a replay had no
    ceiling, so the position held from 24 June to 23 July was pulling
    28,000 one-minute candles. A replay now steps up to a bigger candle
    for a longer hold and stays under 1,200 bars, and the whole journal
    as stored dropped from 11 MB to 3 MB.

    **The lesson worth keeping:** three rounds of reasoning about what
    looked heavy found nothing. Instrumenting each step and printing the
    memory found it in one run.

47. **The alignment figures were measured with hindsight** (2026-08-30).
    **Status: BUILT AND TESTED (24 new server checks, 4 new app checks,
    every suite in both repos re-run). HIS NUMBERS WILL CHANGE.**

    He asked how we can be sure the "Does Alignment Pay?" figures are
    accurate. They were not. Two faults, both proven by running the real
    code against made-up price data where the right answer is known.

    **It used price action from after the trade.** A timeframe was called
    bullish if its candle finished above where it started — using the
    candle the entry fell inside. So "was the daily bullish when I
    entered at 12:32?" was answered with the day's four-o'clock close,
    and the monthly with the close weeks later. Shown plainly: a day that
    opened at 100, was trading at 101.8 when he entered, and closed at 98
    was reported BEARISH at entry. It was bullish at that moment. This
    flatters alignment, because part of what it "predicted" had already
    happened by the time it was measured.

    **The built-up timeframes were not timeframes.** 3m, 1H, 2H, 4H, 3M
    and 6M were made by taking candles N at a time from a list, so a
    "4-hour bar" could open on Thursday afternoon and close on Friday
    morning, straight across the night. Shown with real grouping output.

    Together these meant six of the thirteen timeframes answered a
    different question from the other seven, and a "run of four in a row"
    could be four different questions.

    **One rule now, for all thirteen:** the price at the moment he
    entered, against the open of the bar forming at that moment — which
    is what The Strat means — and never anything later than the fill.
    Intraday bars start when the session starts; quarters and half-years
    follow the calendar. The price used is the actual trade that printed
    at his fill second when Alpaca can supply it, otherwise the last
    minute that had finished.

    **He must be told his numbers will change.** The 174 / 53 / 77 split
    came from the faulty reading.

46. **"Recent Trades" was not showing his recent trades** (2026-08-30).
    **Status: BUILT AND TESTED (10 new browser checks plus every app
    suite re-run). Not confirmed on a real phone.**

    He reported that the Recent Trades panel on the Home tab was not
    showing his most recent trades — his NIO trades were missing from it.
    He was right.

    **The cause.** That panel had no ordering at all. It drew whatever
    order the trades happened to sit in storage, and imports add at the
    front — so the January-to-April history, fetched last, sat at the top
    under a heading saying "Recent". His NIO position, closed 23 July and
    genuinely his most recent, was pushed below trades from four months
    earlier.

    **This is the second time.** The identical fault was found in the
    Journal on 29 August and fixed there, and CLAUDE.md has said since
    then that a list with no sort is not in order. It was never applied
    beyond the list that had been reported. Checking every place the
    trades are read took one minute and found **four** still wrong: this
    panel, the JSON export, the spreadsheet export, and the trades handed
    to the AI Analyst — so any observation it made about "lately" was
    drawn from write order. All four now use the same ordering the
    Journal does.

    **One more thing that made it look wrong.** The panel showed each
    trade's ENTRY date while being ordered by the close. His NIO trade
    opened 24 June and closed 23 July, so even once sorted correctly it
    would have sat at the top showing a June date and looked misplaced
    again. It now shows "closed 2026-07-23" whenever the two differ.

45. **Bullish or bearish alignment, on the card and in the numbers**
    (2026-08-30). **Status: BUILT AND TESTED (30 new browser checks, plus
    every app suite re-run). Not confirmed on a real phone.**

    He asked for the trade card to say whether the timeframe alignment was
    bullish or bearish, because he could not tell.

    **What the card now says.** The direction is spelled out — `✅ FTFC ▼
    BEARISH` or `⚠ FTFC ▲ BULLISH` — in words with an arrow, never colour
    alone. Underneath, what that meant for the trade he actually took:
    "you went Short — with it" or "— against it", the box green for with
    and amber for against. A trade where the timeframes did not agree now
    says so in words instead of showing a bare "2/4".

    **The bigger thing his question uncovered.** The Dashboard counted a
    trade as aligned whenever the timeframes agreed AT ALL, in either
    direction. So a Short taken straight into full bullish agreement was
    being scored on the "timeframes agreed" side — and "Does Alignment
    Pay?", the one number meant to tell him whether waiting for alignment
    is worth it, was averaging trades taken with the market and against it
    into a single figure. The direction had been recorded on every trade
    since the FTFC work was built; nothing ever read it.

    Alignment is now four answers everywhere — with, against, no
    agreement, and agreed-but-direction-never-recorded. That last one is
    for trades enriched before the direction was stored: they are counted
    on their own and kept out of the comparison, because calling them
    "did not agree" would state something untrue and calling them aligned
    would be a guess. They sort themselves out on the next refresh.

44. **The server ran out of memory, and it was one request doing it**
    (2026-08-30). **Status: BUILT AND TESTED (7 new measured server
    checks, 5 new app checks, every suite in both repos re-run). Not
    verified against the live server — this environment cannot reach it.**

    Render alerted that the server exceeded its memory limit and was
    restarted automatically. He asked whether this affected the Alpaca
    work. It did, in two different ways, and one of them was the whole
    reason his prices said "approx.".

    **Measured, not guessed.** Fetching candles from Alpaca limited
    itself to 200 pages but not to a SIZE, so one request could build a
    list of two million candles. Measured on the real data shape: **274MB
    in a single array**, on a server whose entire allowance is a fraction
    of that. Capped at 150,000 candles — over a year of every trading
    minute — and measured again after: 72MB.

    **How it touched Alpaca.** Every restart wiped the copy of his Alpaca
    keys held in memory, and until task 43 that silently switched Alpaca
    off. So these memory restarts were not merely near the "approx."
    problem, they were causing it. That link is now broken: the keys are
    re-read from storage.

    **What still connects them.** A restart part-way through a rebuild
    used to throw the entire run away, because it saved only at the end.
    The rebuild is what replaces an estimated price with a real one, so a
    restart could stop the fix ever landing. It now saves every 25
    trades, so a restart costs one batch.

    **And it is visible now.** A server killed from outside for using too
    much memory never runs any of its own code, so the crash log from
    task 40 cannot catch it — there is nothing to catch. `/health` now
    reports memory in use and the highest reached, sampled on a timer as
    well as when asked, and the Checks page treats a very short time
    since starting as the fingerprint of a restart nobody recorded.

43. **Alpaca was never actually being used for stock prices** (2026-08-30).
    **Status: BUILT AND TESTED (13 new server checks, 12 new app checks,
    plus every suite in both repos re-run). Not verified against the live
    Alpaca service — this environment cannot reach it.**

    He asked whether the Alpaca work had failed, because his trades still
    said "approx." He was right. It had.

    **The cause.** The decision "should we use Alpaca?" was made by
    reading a copy of the keys held in the server's memory. His keys are
    typed into the app and kept in storage — and memory is wiped every
    time the server restarts, which the hosting company does on its own,
    and which certainly happened when the server crashed. So the answer
    was "no Alpaca keys" while the keys sat in storage the whole time,
    and every price quietly fell back to a reconstructed Schwab candle.

    Nothing was logged and nothing failed. Every trade still got a price.
    The only visible sign was one small word on the card that he had to
    spot himself.

    **It was worse than the price.** Six places asked the same question
    the same wrong way, so Alpaca was also silently switched off for Bar
    Replay (back to ~35 days instead of years), the FTFC timeframe check,
    and three paths in backtesting.

    **Fixed** with a single way of asking that loads the saved keys
    first, used at all six. Trades now also record whether Alpaca was
    genuinely available when they were priced — without that, a price
    Alpaca could not improve looks identical to one it was never asked
    about.

    **And the app now notices.** Its "is this trade up to date?" test
    asked only "is anything missing?" — and these trades had a price, so
    they counted as finished and the automatic rebuild would never have
    touched them again. It now also asks "has this price ever been looked
    up with Alpaca available?", but only while Alpaca really is
    connected, so it cannot chase an exactness it can never reach.

    **Prevention:** the automatic check now fails on any file asking the
    question the wrong way, and a test boots a cold server with the keys
    only in storage and proves the price comes back exact.

42. **Something that stops the crash coming back, rather than a promise
    to remember** (2026-08-30). **Status: BUILT AND TESTED (37 routes
    wrapped, an automatic check, a live all-routes smoke test, every
    backend suite re-run).**

    He asked the right question: how do we stop this happening again?

    A promise to be careful is not an answer, so this is the answer.
    `guardCheck.js` reads every file on the server and fails if any of
    the shapes that caused the crash come back: an unwrapped request
    handler, a job handed to something that will never notice it failed,
    the missing safety floor, or a file using the wrapper without
    importing it. A GitHub Action runs it on every single change, before
    it can reach the live server.

    **Writing it immediately found 27 more unwrapped routes** than the
    hand-audit in task 41 had — 37 in total. The hand-audit had looked
    for a missing try/catch, which is not the same requirement, and so
    passed over routes that were still capable of ending the server. That
    is exactly why this is a check and not a habit.

    **And the check caught a real break while being written:** a route
    wrapped in a file that had not imported the wrapper. The server would
    not have started at all. Worth noting what happened there — the crash
    floor from task 40 DID keep the program alive, but it never got as
    far as answering anything. "Still running" is not "working", so every
    change now also gets a smoke test that boots the real server with
    nothing configured and hits all 15 routes: all 15 answer, none hang,
    and it is still running afterwards.

41. **The route his phone polls every 30 seconds could kill the server**
    (2026-08-30). **Status: BUILT AND TESTED (10 new server checks plus
    every existing backend suite re-run). Not confirmed on his live
    server — this environment cannot reach it.**

    Following on from task 40. Express, the piece that answers requests,
    is on version 4, and version 4 does not understand a request handler
    that fails: the failure becomes a promise nobody is holding, which
    ends the whole program. Checked directly here rather than assumed.

    **Ten routes had nothing around them** — including
    `/api/trades/pending`, the one his phone asks for new trades every
    thirty seconds. One hiccup reaching storage while the app was open on
    his phone would have taken the entire server down. That makes this
    the most likely explanation for the alert he received, though the
    actual log is unreadable from here so it stays unproven.

    Every one now goes through a wrapper, and a final handler turns a
    failed request into a plain answer — "Something went wrong on the
    server. Nothing you saved is affected." — instead of a hung phone or
    a wall of raw error text. Checked: ten failing requests in a row now
    leave the server running and answering, and it recovers by itself the
    moment storage comes back.

40. **The server was dying outright, and he found out by email**
    (2026-08-30). **Status: BUILT AND TESTED (19 new server checks, 12
    new app checks, plus every existing suite in both repos re-run).
    Not yet confirmed on his live server.**

    He forwarded a notification from the hosting company: *"Server
    failure detected on strat-journal-backend: Exited with status 1."*

    **What that means.** Node ends the entire program the moment any
    background job fails without something wrapping it — and there was
    nothing anywhere in this backend to stop that. Confirmed by test, not
    inferred: a single stray failure exits with status 1.

    So one failure in one background job took down *everything at once* —
    the five-minute check for new trades, the live connection to Schwab,
    the history import, and every request the phone makes. And the only
    sign was an email hours later that he can do nothing with.

    **The specific unwrapped paths found** (any one of them fatal):
    - `connectStreamer()` was started and not waited on, from both
      `startStreamer()` and the reconnect timer. Opening the WebSocket
      itself sits outside that function's own try, so a bad address from
      Schwab escaped and ended the process.
    - Two `ws.send(...)` calls inside socket handlers. Sending on a
      socket that closed a moment earlier throws, and a throw inside a
      handler like that is caught by nothing.
    - `persistExistingFeedback()` at startup, started and not waited on.
    - `await runSyncCheck()` in the five-minute job with nothing around
      it. It guards itself today, but nothing held the promise, so
      anything that ever escaped it would end the server rather than skip
      one tick — and its own catch read `err.message`, which throws again
      if the failure carries something that is not an error.

    **Fixed on three levels:** every one of those paths wrapped; a floor
    under the whole process (`crashGuard.js`) so an unhandled failure is
    logged loudly and the server carries on; and each failure written to
    storage and reported by `/health`, because a crash nobody can read is
    the same as no crash report.

    **And he can now see it himself.** The Checks page says whether his
    server is answering, how long it has been running, and whether it hit
    anything recently — in plain words, with no raw failure text.

    **What could not be checked:** his live server. This environment is
    blocked from reaching it, so the actual crash log was never readable
    and the specific cause is unproven. What is proven is that all four
    paths above could have caused exactly this, and that none of them can
    end the server any more.

39. **Reading the setup happens on its own; a Checks page; and July
    2026 was right all along** (2026-08-30).
    **Status: BUILT AND TESTED (41 + 29 new browser checks, 12 new
    server checks, plus thirteen existing suites re-run). Not yet
    confirmed on the phone or against a live AI.**

    **First, a correction.** Looking at his screenshot I said July 2026
    showing only 3 trades looked wrong and that roughly 24 were expected.
    That number was invented — nothing had measured it. His own broker
    export settles it: in July 2026 his account has exactly **two option
    fills**, both closing the NIO puts he bought on 24 June (3 contracts
    at $0.53 and 1 at $0.54). Everything else in July, and every single
    line in August, is money moving in and out — wires and transfers, not
    trades. The buy was 4 contracts at $0.49, so the month comes to
    **+$17.00 before fees** and **+$11.69 after** — and the journal shows
    $17.00 on the before-fees view, exactly right. July is not missing
    anything. He stopped trading on 23 July.

    **Reading the setup no longer needs him.** It was a button on the
    Home tab saying "Classify 304 Trades with AI" — maintenance the app
    was making him perform, when he cannot know that trades have arrived
    unread and has said plainly he does not want to keep tapping things.
    It now happens by itself whenever the app is open: twenty trades at a
    time, one question every two and a half seconds, saving after each so
    closing the app loses nothing, and picking up where it left off.

    Bounded on every side, the same way the automatic rebuild is: twenty
    per batch, two looks per trade and then it stops asking, never two
    runs at once, and it stops the moment the AI says it is out of
    allowance rather than burning the rest of the list against a wall.

    **A real bug found on the way.** Reading only ever looked for a
    missing *setup*. The three plays were added on 29 August, so every
    trade that already carried a setup was treated as finished and could
    never have a play put on it — however many times reading ran. A trade
    now carries two answers, asked and written separately.

    **The AI saying "not now" is now its own answer.** Google's free
    allowance has a ceiling per minute and per day. Hitting it used to
    look identical to a broken trade, so a backlog would grind through
    three hundred refusals and mark every trade as already looked at. The
    server now reports it separately, the app pauses for an hour, and the
    Home tab says so in words — with nothing for him to tap.

    **A "Checks" page on the bottom bar.** He asked for his list
    somewhere he could pull up instead of scrolling back through a chat.
    Every line on it is *counted from the trades on his phone at the
    moment he opens it* — not a claim written down weeks ago. Prices,
    stock prices (and how many are exact rather than reconstructed),
    times, dates, pictures, video, setups and plays, timeframe alignment,
    backtesting, fees. The three that are not finished say so plainly:
    pictures still need a tap per trade and have never run through a live
    trade, video needs an iPhone app that has not been started, and
    backtesting has never been run over real market history.

    **What could not be checked from here:** the live AI (the tests use a
    stand-in), anything about how it looks on his actual phone, and the
    server — his backend cannot be reached from this environment, so
    nothing here has been run against his real 304 trades.

25. **Stop the journal recording the same trade twice, and fetch a full
    year of history** (2026-08-29).
    **Status: BUILT AND TESTED (strat-journal-app PR #42,
    strat-journal-backend PR #28) — 32 new browser checks plus all
    fourteen existing suites. Not yet confirmed on the phone or against
    real broker data.**

    Found by checking the owner's own broker export against his journal:
    **161 contracts were recorded that he never bought**, spread across
    52 contract-days, with some trades stored character-for-character
    five times over. Separately, **108 trading days of real history were
    missing entirely** — 19 in January, 19 in February, 34 in March, 33
    in April, 2 in May, 1 in June.

    It went unnoticed for months because his total profit and loss looked
    almost right: −$1,116 in the journal against −$1,101 in reality.
    That closeness was an accident. Duplicated wins and duplicated losses
    happened to cancel each other out. Every other number — win rate,
    average win, average loss, which setup makes money — was being
    computed off a journal that was substantially wrong.

    Two separate causes, both fixed:
    - **The repeats.** When trades came in from the broker, the app
      decided whether it already had one by comparing the internal
      reference number the trade had been given. "Reset & Re-import"
      hands the same trades back with brand-new reference numbers, so
      every one of them looked new and was written down again — and the
      owner had been told to press that button after backend changes, so
      it kept happening. Trades are now recognised by what they *are*:
      the contract, the minute in, the minute out, both fill prices, and
      the size.
    - **The missing months.** Both the app and the server only ever asked
      the broker for the last 90 days. His trading began 2 January, which
      is exactly why the journal began in mid-May. Both now ask for a
      year, and the server accepts up to three years if asked.

    Also added: a **"Check for Duplicate Trades"** action on the Journal
    tab under "Settings, import & export". Deliberately two steps — it
    reports what it found and waits for a second tap before deleting
    anything. Where copies differ, the one carrying his own work is kept:
    his notes, his setup tag, his screenshots, his stop, and his own
    typed entry ahead of the broker feed's copy. Anything the machine
    computed is rebuilt on the next sync, so nothing of value is lost.

    Tested against his real 4 June case (ten journal entries for seven
    actual trades, three of them recorded twice), plus: checking alone
    deletes nothing; genuinely different trades are left alone (a minute
    apart, a different exit price, a different size, a put instead of a
    call, a different day); re-importing adds no second copy while a
    genuinely new trade still comes in; an empty journal doesn't fall
    over; and no errors are thrown on the page in any scenario.

    **First real run on his phone, 2026-08-29:** 85 trades recorded more
    than once, 132 extra copies, leaving 101. Checked against his broker
    export before he removed anything: his real completed trades from
    early May to 23 July number between 98 and 106 depending on exactly
    where the journal starts, so 101 lands dead centre. Also confirmed
    that **no two of his 248 real trades are identical** even comparing
    only by day — a stricter test than the app's own rule, which compares
    the exact minute in and minute out too — so no real trade was ever at
    risk of being merged away.

    That run also exposed a reporting fault, fixed in PR #43: the summary
    line showed the exit *time* but not the exit *date*, so his NIO
    position opened 24 June and closed 23 July read as "15:55 → 12:32",
    as though sold before it was bought. And it left out the contract and
    the size, so two genuinely different trades (3 contracts and 1, on
    the same contract at nearly the same prices) printed as identical
    lines. The line now names the contract in full, says how many, and
    shows the exit date on anything not closed the same day.

    **Duplicates removed on his phone 2026-08-29: 233 down to 101.**

26. **Make the history import say what it is actually doing** (2026-08-29).
    **Status: BUILT AND TESTED (strat-journal-app PR #44,
    strat-journal-backend PR #29) — 19 + 16 checks. Not yet run against
    the live Schwab connection.**

    Straight after the duplicates were cleaned, he tapped "Get My Trades"
    to pull January through April in and was told, seven seconds later,
    "Schwab had nothing new — if you know a trade is missing, it may be
    older than the history Schwab will hand back."

    The app could not know either half of that. The server replies the
    instant the import *starts*; a year of history is a dozen requests to
    Schwab followed by working out the timeframes, prices, setup and stop
    for every trade found — minutes. So the all-clear was announced over
    a job still running, and the retention line was a guess presented as
    a finding. The loop also stopped as soon as a round brought nothing,
    which for a slow background job meant it exited after one round.

    Underneath that sat a second blind spot: any 30-day window Schwab
    refuses is caught, written to a server log nobody reads, and skipped.
    Twelve refused windows and twelve genuinely empty ones produce an
    identical answer. "Schwab would not give me this" and "you have no
    trades from then" are completely different things and nothing
    distinguished them.

    Fixed on both sides. The server now records what really happened —
    windows asked, answered and refused, the reason Schwab gave, and the
    oldest date it actually served data for — and reports its progress as
    it goes. The app follows that and reports only what the server says.
    Matched trades are also queued *before* the slow detail-gathering, so
    they show up in seconds rather than minutes.

    **Still unanswered, and the point of all this:** whether January to
    April can be fetched at all. The next real run will now say which
    windows Schwab refused and how far back it truly served, instead of
    leaving it to guesswork.

    **Answer came back 2026-08-29, and it was not about his trades at
    all:** "Refresh token is invalid, expired or revoked". His Schwab
    sign-in had run out. Schwab's sign-in lasts seven days and cannot be
    extended, and when it lapses every sync, every history import and the
    live stream all stop at that one point. So the missing January-April
    history was never actually attempted -- the import was dying before it
    ever reached Schwab. Whether that history can be fetched is still
    open. See task 27.

27. **A way to sign back in to Schwab, in words he can act on**
    (2026-08-29). **Status: BUILT AND TESTED (strat-journal-app PR #45,
    strat-journal-backend PR #30) — 27 checks. Not yet confirmed on his
    phone.**

    Two failures, both mine.

    The error reached his screen as raw text: `{"error":"unsupported_
    token_type","error_description":"400 Bad Request: ...}`. The entire
    answer was buried in it and none of it was readable by someone
    without a technical background, which is the only kind of person who
    uses this app. It now says: his Schwab sign-in has run out, Schwab
    forces this every 7 days, nothing is wrong with his trades, and which
    button to tap. Unrelated failures keep their own reason rather than
    being mislabelled as a sign-in problem.

    And there was no way to act on it. Signing back in was only possible
    by typing a web address by hand -- the app had no button for it
    anywhere, despite Schwab forcing it weekly. There is now a "Reconnect
    to Schwab" button, shown only when the connection has actually
    lapsed.

    The connection indicator was also answering the wrong question. It
    meant "the app can reach my server", which stayed true and green
    while the server's own Schwab connection had been dead long enough
    for a month of trades to go unfetched. It now asks both.

    **Confirmed working on his phone 2026-08-29:** he reconnected, tapped
    "Get My Trades", and 90 trades came in — 101 to 191, with January to
    April finally arriving. The history WAS fetchable all along; the
    lapsed sign-in was the whole obstacle.

28. **Newest trade first, a sign-in warning, and a way to check the
    numbers** (2026-08-29). **Status: BUILT AND TESTED (strat-journal-app
    PR #46, strat-journal-backend PR #31) — 44 checks. Not yet confirmed
    on his phone.** Three things he raised on seeing the import land.

    **The trade list was in no order at all.** He said his most recent
    trades were NIO but a 4 May trade sat at the top. Worse than a wrong
    sort: the list was drawn in the order trades happened to be written
    down, with no sorting anywhere. New trades go in at the front, so the
    January-to-April import — which arrived LAST — went in ABOVE the
    May-to-July trades already there. Now sorted by when the trade was
    entered, newest first.

    **A warning before the sign-in lapses**, which he asked for directly.
    The connection line carries a countdown; inside two days it offers
    the Reconnect button early and says plainly that nothing is broken
    yet. The seven days run from when he last signed in, not from the
    last automatic renewal — renewing does not restart Schwab's clock.
    Where the server cannot say, nothing is claimed.

    **"How are we sure the prices and P&L are correct?"** Assurance is
    not evidence, so this adds the evidence: a "Check My Numbers" tool
    that reads his Schwab transactions spreadsheet, rebuilds the
    completed trades from it with the same first-in-first-out matching a
    broker uses, and compares every one — contract, both dates, both fill
    prices, size and profit. Matching is on contract, dates and size and
    deliberately NOT on price, since a wrong price is the thing being
    hunted. Read-only; the file never leaves the phone.

    Tested against his real export: 248 trades rebuilt, same tickers in
    the same numbers, same total to the penny as an independent pass. A
    wrong price, a missing trade and an extra trade are each caught; a
    rounding-level difference is not; the wrong file is refused with a
    reason.

    Found while testing: the fill sort answered "same date?" with -1
    rather than 0 — not a consistent answer — and same-day fills paired
    arbitrarily, splitting six trades differently out of the same file.

    **What this tool cannot check:** underlying stock prices are not in
    the Schwab export. Those are looked up afterwards from candle data,
    and for trades older than about 35 days the minute-by-minute data is
    gone, so they show as blank. That is the "Under: — / —" on his older
    trades — expected, not a fault. Fees are also not counted on either
    side, so both are compared on the same basis.

    **Still to do on his phone:** tap "Check My Numbers" with the Schwab
    export and report what it says.

31. **Count Schwab's fees** (2026-08-29). **Status: BUILT AND TESTED
    (strat-journal-app PR #49, strat-journal-backend PR #32) — 18 + 24
    checks against his own account statement. Not yet confirmed on his
    phone, and needs a re-import to reach the 299 trades already logged.**

    He asked for this directly after being told fees were nowhere in the
    journal. The import read the option lines out of each Schwab record
    and skipped the fee lines entirely, so every figure on screen was
    before fees: $696 of losses shown against $1,100.73 actually gone
    from the account. $404.73 across the year, and 37% of his losses.

    Fees are worked out from the CASH, not from Schwab's fee lines,
    because the cash can be checked: a buy pays out the contracts' value
    plus fees, a sell brings in that value minus fees. That arithmetic
    had already been verified against all 480 fills in his statement.
    Falls back to Schwab's itemised fees, refuses a gap larger than a
    fifth of the trade, and returns "unknown" rather than a guess —
    an unknown fee must never be recorded as a fee of zero.

    **This changes what counts as a win.** A trade that gained $1.00 and
    cost $1.63 in fees lost money, and is now shown, coloured and counted
    as a loss. Win rate, month summaries and the per-setup breakdown all
    follow the money rather than the price move. On his real history one
    trade flips (45% to 44%).

    Trades imported before this read "Fees: not recorded", never $0.00,
    and keep their before-fees figure without an "after fees" label they
    have not earned. Every total says how many trades it covers, so the
    numbers stay honest partway through a re-import.

    Verified: the fee on all 480 of his real fills is worked out exactly,
    and the year totals to the $404.73 his statement gives. A split fill
    divides the opening fee without losing or doubling it.

    **Follow-up, same day (PR #50):** he asked to see both figures rather
    than choose between them. The trade card already showed both; the
    Dashboard and month summaries showed only the after-fees one. Every
    headline figure now carries its opposite directly beneath it,
    including win rate — which genuinely differs, since a trade that
    gained $1.00 and cost $1.63 in fees is a win on price and a loss in
    the account. Deliberately not a toggle: a setting he has to remember
    he changed is worse than two numbers on screen. With no fees imported
    yet the tiles read "before fees" rather than implying a comparison
    that does not exist.

32. **Underlying stock price: Alpaca instead of reconstructing it**
    (2026-08-29). **Status: BUILT AND TESTED (strat-journal-app PR #51,
    strat-journal-backend PR #33) — 22 + 19 checks. NOT yet run against
    the live Alpaca service, and needs ALPACA_KEY_ID and ALPACA_SECRET_KEY
    on Render before it does anything at all.**

    The underlying price was the one imported figure that was never a
    record. Schwab says what was paid for the option, never where SPY was
    at that instant, so it was reconstructed as the close of the last
    candle before the fill, cascading 1m to 5m to 30m to daily. Realized
    R:R is computed from it and inherited the error.

    Alpaca's free tier fixes both halves: minute data going back years
    rather than Schwab's ~35 days (the bigger win — it is why OLDER
    trades were worst), and the individual exchange prints, so the price
    at the actual second of the fill can be read rather than inferred.

    Alpaca is tried first and Schwab is unchanged beneath it, so a
    missing key or a refusal costs accuracy and never correctness.
    Nothing is asked for inside the 15 minutes the free plan holds back.
    Every price now records how it was obtained and whether it is exact,
    and the trade card says "exact" or "approx." accordingly — half-exact
    is not called exact.

    **Still open:** Schwab's own timestamp precision. If Schwab reports
    fills only to the minute, the minute is the ceiling however good
    Alpaca is. Worth checking against a real record before promising
    second-level accuracy.

36. **Alpaca keys typed into the app, not the hosting dashboard**
    (2026-08-29). **Status: BUILT AND TESTED (strat-journal-app PR #53,
    strat-journal-backend PR #35) — 24 checks. Waiting on him to create a
    free Alpaca account and paste the two keys in.**

    He went looking for how to switch Alpaca on and landed on
    docs.alpaca.markets — the developer documentation, which is the wrong
    page. The right one is the sign-up form at alpaca.markets. But the
    step AFTER that was worse: adding two settings to the Render
    dashboard by hand, which is not a reasonable thing to ask of him.

    The keys now go in the app under Connection settings, beside the
    Backend URL and App Key he already filled in once. Secret typed
    hidden, cleared from the screen after saving, never written to the
    phone — the server holds it. Status shows only the last four
    characters of the key ID. The server's own settings still win where
    present, so nothing existing changes.

    **A real bug found while testing:** the storage client was built at
    module load, which made every module that pulls in alpacaClient
    depend on storage being constructible — it took down the unrelated
    stop-rule route suite outright. Built on first use now.

37. **Alpaca as the history source for backtesting, Bar Replay and the
    timeframe check** (2026-08-29). **Status: BUILT AND TESTED
    (strat-journal-backend PR #38) — 21 checks. Not yet run against the
    live Alpaca service.** Three features were limited by one fact:
    Schwab keeps about 35 days of minute data.

    Backtesting could only look at the last month — not long enough to
    say anything about a strategy. Bar Replay came back empty for any
    trade older than five weeks, which after a year-long import is most
    of them. And timeframe alignment on an older trade was decided on the
    daily and above ALONE, because the intraday timeframes came back
    empty — a materially weaker answer than a recent trade gets, with
    nothing on screen saying so, and it is the very field the new
    alignment breakdown groups by.

    All three now use Alpaca first and fall back to Schwab, so without
    keys nothing changes. Daily and longer stay with Schwab, which
    already serves years of those.

38. **Fees did not reach the existing trades — my instruction was wrong**
    (2026-08-29). Only 6 of 304 trades have fees, hours after the fee
    work shipped. Cause: `runBackfill` skips any fill already in
    `lastProcessedIds`, so re-running it can NEVER redo an existing
    trade. Only "Reset & Re-import" clears that list. I told him to tap
    "Get My Trades", which correctly finds nothing new. Nothing is broken
    — he needs Reset & Re-import, which is now safe to press because the
    duplicate fix means a rebuild cannot double anything.

    Confirmed correct in the same screenshot: deleting the fake 6 August
    trade moved his before-fees total from −$451 to −$511, exactly the
    $60 that trade claimed.

35. **Stop him having to tap "Get My Trades" repeatedly** (2026-08-29).
    **Status: BUILT AND TESTED (strat-journal-app PR #52,
    strat-journal-backend PR #34) — 16 + 3 checks. Not yet confirmed on
    his phone.** He asked why he keeps having to tap, and he had asked
    once before. The honest answer had two halves.

    What already worked: the 5-minute job pulls new trades, and the app
    collects on opening AND every 30 seconds while open. Day-to-day
    trading genuinely needs no tap.

    What did not: `runBackfill` — the history import, and the same path
    that attaches fees to existing trades — only ever ran when a human
    triggered it, and NOTHING watched it afterwards. Schwab blocks a
    year-long import reliably (its rate gate is what produced the "Access
    Denied" page), and a Render restart kills one mid-run leaving it
    marked "running" forever with nothing running. Both states waited for
    a tap. That is why only 6 of his 305 trades had fees.

    The scheduled job now resumes an unfinished import by itself: waits
    16 minutes for Schwab's block to lift, resumes the span originally
    asked for, treats a "running" job older than 25 minutes as dead, and
    stops after 8 attempts rather than hammering Schwab.

    Also fixed: "Schwab token refresh failed" was not matched by any of
    the lapsed-sign-in phrases, so the ONE failure only he can fix would
    have been handed to the server to retry silently forever. And the
    error text had "tap Get My Trades again" baked into the cause, so the
    new message contradicted itself.

33. **The 6 August SPY trade is confirmed NOT a real trade** (2026-08-29).
    He asked for this to be checked against the conversation rather than
    assumed. Three independent pieces of evidence:
    - His Schwab export covers 2 January to **25 August** and contains
      **zero** option trades in August. The last real option trade
      anywhere in it is 23 July. There is no SPY 770 contract in his
      entire year.
    - This project's conversation began **17 August** — after 6 August —
      so the trade was not created during any work here.
    - It is tagged "FTFC Continuation", one of the three placeholder
      setups task 10 recorded as WRONG and replaced on 21 August, and
      carries a $0.00 stop and an R:R plan of 0.0.

    It predates this project, from the earlier work on the app. It is
    also the ONLY trade in his journal carrying a setup at all, so the
    entire "Setup Performance" panel is currently that one fake trade.
    Safe to delete; it should carry the "Added by hand" mark from task 29.

34. **A blocked Schwab request reached the screen as raw web code**
    (2026-08-29). Fixed in PR #51. The import failed and put
    "<HTML><HEAD><TITLE>Access Denied" and a server path in front of him
    — the second time raw server text has reached his screen. Schwab's
    gatekeeper refuses requests after too many in a short window, which a
    full year-long re-import can trigger. Now reads as what happened,
    that nothing is lost, and to wait fifteen minutes. Rate limits,
    dropped connections and any other page of markup are covered the same
    way, with a final guard: anything still containing tags, escaped
    entities, braces or a web address is replaced wholesale rather than
    trimmed and shown.

    Also fixed: the "Fees paid" line was pulled up four pixels to sit
    closer to the figures and ended up ON TOP of the two lower tiles,
    cutting itself off. It has its own strip now, and the test measures
    the gap rather than trusting the eye.

30. **A month menu instead of one endless list; the numbers button
    removed** (2026-08-29). **Status: BUILT AND TESTED (strat-journal-app
    PR #48) — 28 + 11 checks. Not yet confirmed on his phone.**

    He asked for both directly. The Journal drew every trade at once; at
    299 trades that is four months of scrolling to reach last week. It
    now opens on the newest month and offers a menu of every month with
    trades in it, each with its count, plus an "All months" choice. Each
    month carries its own line — profit, won and lost, win rate — so a
    month can be read without adding it up by eye. A trade held across a
    month end is filed under the month it CLOSED in, matching the list's
    order.

    "Check My Numbers" is gone, at his request. A button nobody presses
    verifies nothing.

    **He also asked whether timestamps can be checked against his Schwab
    file. They cannot, and this is settled, not an opinion:** the file's
    columns are Date, Action, Symbol, Description, Quantity, Price, Fees
    & Comm, Amount — and the Date column holds "07/23/2026" with no clock
    time anywhere in the file. Dates it can confirm; times are not in the
    data. Schwab's website may offer a different report that includes
    times; worth checking if this ever matters again.

    So the clock conversion got its own checks instead, which is more
    durable anyway: 11 hand-worked cases over `toEasternParts` covering
    summer and winter, BOTH daylight-saving changeovers, midnight (which
    some systems report as hour 24), a 21:30 Eastern trade that is 01:30
    UTC the next day and must roll back to the right day, and all 1440
    minutes of a trading day converting back exactly. All pass. That
    closes the one gap the spreadsheet never could.

    Five checks in the ordering suite now ask for "All months" first,
    since they compare order across months and would otherwise read one
    month and report an ordering fault that is not there.

29. **Order by when a trade CLOSED; mark trades Schwab did not send**
    (2026-08-29). **Status: BUILT AND TESTED (strat-journal-app PR #47) —
    10 checks. Not yet confirmed on his phone.**

    He reported the order still wrong after task 28, and was right again.
    Task 28 sorted by when a trade was OPENED. His NIO position was
    opened 24 June and closed 23 July, and he has closed nothing since —
    so it is his most recent trade, yet it sat below every trade opened
    in July. Now ordered by when the trade finished, falling back to the
    entry for anything still open. For a day trade the two dates are the
    same, which is precisely why this survived the first round of
    testing; only a position held across days exposes it.

    Also in his screenshot: a SPY trade dated 2026-08-06 sitting above
    everything, after his Schwab export ends and after the date he
    confirmed he last traded, carrying a $0.00 stop, an R:R plan of 0.0,
    round numbers, and a setup labelled "FTFC Continuation" — one of the
    three placeholder setups task 10 recorded as WRONG and replaced. It
    reads as a sample entry from early in the project. Rather than assert
    that from a picture, any trade not sent by Schwab now carries an
    "Added by hand" mark so he can tell them apart himself.

    A line above the list now states the order and the span it covers
    ("299 trades, newest first · 2026-08-06 back to 2025-10-03"), so the
    order is checkable rather than something to trust, and a date outside
    his real trading is obvious without scrolling.

    Confirmed while doing this: Edit, Delete and Replay all address a
    trade by its own reference rather than its position in the list, so
    sorting cannot point an action at the wrong trade.

    **Still to do on his phone:** confirm NIO now leads, and check whether
    the 2026-08-06 trade is marked as added by hand — if so it is sample
    data and can be deleted.

24. **One button to import, trades always present on open, and the fix
    for a Journal that displayed as a blank page** (2026-08-27).
    **Status: BUILT AND TESTED (strat-journal-app PRs #38, #39) — 22 + 12
    browser checks.**

    The owner: "This page is too confusing. I want to be able to just tap
    one button... They should just always be there when I open the app."
    Then, after the first attempt: "I know for a fact that I have past
    trades that can be logged but they are not showing up... It's
    unacceptable."

    He was right on both counts, and the second was my bug. Reproduced
    with his 233 trades: all stored, all rendered, and the All Trades
    section sitting at opacity 0 — see CLAUDE.md's Known Traps, where the
    lesson is now recorded.

    What the Journal tab now does:
    - Collects trades **automatically on every app open**, so in normal
      use there is nothing to press.
    - **One button**, "Get My Trades", which genuinely FORCES: it re-asks
      Schwab every single time. The first version pulled the history once
      and then refused ever to do it again, leaving no way to recover
      missed trades except a Reset button hidden in settings — the exact
      opposite of what a force button is for.
    - Setup (address, key, and the destructive Reset) tucked behind
      "Connection settings", which opens itself only when nothing is
      connected.
    - The leftover diagnostic line removed from every screen, and the two
      contradicting connection indicators merged into one.

    Still open, and asked of the owner: whether trades are genuinely
    missing after all this. If the count is still short once the app is
    reliably showing what it holds, the gap is on the server side — how
    far back Schwab will hand history over — and needs chasing
    separately from anything in the app.

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
   **Status: BUILT AND TESTED 2026-08-28 (strat-journal-backend PR #27,
   strat-journal-app PR #40) — the full update is further down this entry.
   The "needs proposal first" note below is the ORIGINAL framing, kept for
   context; it was overtaken when he asked for it outright.**
   Owner pointed out these aren't
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

   **Status update 2026-08-28: BUILT (strat-journal-backend PR #27,
   strat-journal-app PR #40) — 41 + 26 + 25 checks.** The owner asked for
   it outright, which overtook the proposal step. Built deliberately as
   two separate halves: the computer finds every occurrence of a chosen
   setup in real past price data and counts what actually happened next
   — how often it won, how often it lost, how big each was, and which
   timeframe it did best on — and only then does the AI read those
   finished numbers and describe the patterns in them. The AI is not
   permitted to produce a figure of its own, so nothing it reports can
   be invented. The screen sits at the top of the AI tab: pick a ticker,
   one or more setups, one or more timeframes, how far back, and a
   target.

   **Not yet run against real market data.** And the multi-timeframe ask
   — broadening formation drawn on the 30-minute chart, entry taken off
   its bottom on the 5-minute — is designed but not built. It is limited
   by how far back the broker keeps minute-by-minute price data, roughly
   a month, which is why a cheaper outside source of history was
   researched (Alpaca's free tier gives seven-plus years of
   minute-by-minute stock data at no cost, which is what this needs —
   stock data for SPY and IWM, not expensive options data).

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
    just options** (added 2026-08-23, owner's own question). **Status: CANCELLED by the
    owner 2026-08-28 — "we don't need share tracking. I won't be
    purchasing shares with this particular brokerage." Kept here because
    the gap below is real, and would apply again if he ever changes
    brokerage or starts buying shares.**
    Right now, share trades are completely invisible to this
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
    shows them after tapping into a trade's Edit screen. **Status: BUILT
    AND TESTED 2026-08-27 (strat-journal-app PR #37) — 15 browser
    checks.**

    Notes now sit on the trade card, in the reading typeface rather than
    the monospaced one the figures use, with the trader's own line breaks
    kept. Trimmed to three lines and tapped to open, so one long note
    cannot push every other trade off screen.

    Two things worth remembering from building it:
    - The trim must be applied to the TEXT, not to the padded box. Clamp
      the box and a sliver of the next line shows through inside its own
      padding, which reads as a rendering fault. Found by looking at a
      screenshot, then pinned by a check asserting the trimmed height is
      exactly three lines.
    - Notes are free text and were about to be dropped into the page
      unescaped — a note containing "<" would have silently swallowed the
      rest of the card. There was no escaping helper anywhere in the
      frontend before this.

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
    **Status: BUILT AND TESTED 2026-08-29 (strat-journal-app PR #54,
    strat-journal-backend PR #36) — 23 checks. Not yet confirmed on his
    phone.** He answered it on 2026-08-29: "Every part about
    classification should use both the real market data from Alpaca +
    reading it off the picture."

    Real trades already used both — the classifier gets the 13-timeframe
    alignment from real candles, the underlying prices and the trade's
    own screenshot, with the prompt telling it to weigh the picture
    "together with the candle data, not in place of it." The test tool
    was the half that did not.

    The ticker and date/time boxes he paused are now back, but OPTIONAL —
    which honours both the earlier pause and the instruction. Filled in,
    the alignment is measured from real candles and handed to the model
    as fact; blank, it reads visually exactly as before. The answer says
    which parts were measured and which were read, and a failed lookup
    gives a plain reason rather than a silent fallback.

    **Two bugs caught before merge, both of which would have been
    invisible:** the alignment field is `runLength`, not `run`, so the
    measured data would never have reached the model with nothing saying
    so; and the app discarded everything but the classification from the
    answer, throwing the measured data away on arrival.

    ORIGINAL NOTE BELOW:

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
