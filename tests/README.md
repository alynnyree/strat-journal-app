# Checks that run the real app in a real browser

Each file here opens the actual app the way the phone does, does the thing a
person would do, and then looks at what is written down. They exist because
the faults they cover were all invisible to reading the code.

Run one with `node tests/<name>.js`. Each says plainly when it cannot run
rather than passing quietly:

- **edit-keeps-facts.js** — opens an imported trade, adds a note, saves, and
  checks that every fact the edit screen has no box for is still there: the
  fee the broker charged, the after-fee figure, the exact instants of both
  fills, where each stock price came from, and the mark saying the trade is
  finished with. Before this, adding a note destroyed thirteen of them, and
  the trade then asked to be caught up again — which is what made the totals
  move after a hand correction.

- **duplicate-blind-spot.js** — builds the journal from the owner's own
  broker export through the real pairing code, adds second copies of fifty
  trades, and checks they are found. A copy that recorded no contract code
  used to be completely invisible, both to "Check for Duplicate Trades" and to the
  import, so it was written down again on every pass.

- **bottom-bar-stays-put.js** — scrolls a long trade list the way he does
  and checks the bottom row of buttons does not move a single pixel through
  any of it, on every tab; that the page itself cannot scroll (which is what
  starts the phone's toolbar sliding and brought the problem back); that no
  card below the fold is left invisible now the scrolling has moved inside a
  box; and that Bar Replay still covers the whole screen.

- **what-a-trade-is-worth.js** — the Home line giving average win, average
  loss and what an average trade is worth. Built from the owner's own broker
  fills through the real pairing code, so the bar is that it reproduces his
  real total to the penny; plus hand-worked figures, a break-even trade
  landing on the win side, all-wins, all-losses, a trade with no fee left
  out, and an empty journal showing nothing rather than a zero.

- **phantom-trades.js** — the four trades in his journal that do not exist,
  each sharing its purchase and its sale with a real one but carrying a
  different size, because the same broker fills were paired twice. Uses his
  real 9 June figures: the phantom is refused, sharing a single fill is
  enough, a genuinely new trade still gets in, two copies in one batch
  import once, and older trades carrying no references neither block
  anything nor become invisible.

- **empty-journal-recovers.js** — the state that lost his whole journal:
  the phone erased, the server still believing it had handed every trade
  over, and "Get My Trades" reporting an all-clear over an empty journal.
  Stands the two out of step on purpose and checks the trades come back on
  ONE tap; that a journal which still has trades is never rebuilt
  underneath him; that a run still going is never interrupted; that erasing
  clears both sides at once; and that when the recovery itself fails it
  says which part refused instead of falling through to "nothing new".

- **reads-this-runs-answer.js** — the reason the button imported nothing
  over and over: the server hands out the PREVIOUS import's record until a
  new run replaces it, so the first look after asking said "finished" and
  the app stopped there. The stubbed server behaves exactly like the real
  one — holding the old record for a beat, then writing its own — and the
  checks cover a slow start being waited out, a record that never changes
  giving up rather than hanging, and an older server that reports no start
  time being taken at face value.

- **import-from-the-file.js** — importing straight from the Schwab file with
  no server at all, the path that matters when the service is suspended. The
  bar is the broker's own arithmetic: 254 trades, $404.73 of fees,
  −$1,100.73, 306 contracts, and the phone's pairing matching the server's
  trade for trade. Also checks it reaches out to nothing, invents no times
  or prices, says so on screen, and that importing the same file twice
  changes not one cent.

- **times-fill-in.js** — his question after importing his broker's file:
  will the minute he entered and left fill in by itself? It could not, and
  worse: the file's trades and the same trades arriving from the live
  connection could not be recognised as the same, so his whole journal
  would have been written down a second time the moment the connection came
  back. Covers the plain case, three trades that differ only in the minute
  staying three, only two of the three coming back, a genuinely new trade
  still getting in, a repeat in one batch, a minute he typed himself
  standing untouched, the money never moving, and both directions over his
  real 254 trades — 306 contracts, $404.73, −$1,100.73, every one of them
  gaining its minute.

- **lighter-collection.js** — the two things he asked for on 2026-09-09
  after his hosting was suspended for going over its free data allowance:
  stop asking for a whole year of history, and cut down what the app
  downloads. Checks that it asks back to his oldest trade rather than a flat
  year (and still asks for the year on an empty journal, which is a
  recovery), that chart bars are downloaded ONLY for trades it is going to
  keep — none at all for the twelve it already has, exactly three for three
  new ones — that a long queue is collected in pages in one check, that a
  server which has not been updated still works unchanged, and that a trade
  with no chart says WHY rather than being a blank.

Two things they need, and say so when they are missing:

- **Playwright and a Chromium.** Looked for in the usual places; set
  `PLAYWRIGHT_DIR` to the folder holding it otherwise.
- **The owner's broker export** (private, not in this repository), and the
  backend checked out beside this one for its pairing code. Set
  `SCHWAB_EXPORT_DIR` and `BACKEND_DIR` if they live elsewhere.
