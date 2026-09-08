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

Two things they need, and say so when they are missing:

- **Playwright and a Chromium.** Looked for in the usual places; set
  `PLAYWRIGHT_DIR` to the folder holding it otherwise.
- **The owner's broker export** (private, not in this repository), and the
  backend checked out beside this one for its pairing code. Set
  `SCHWAB_EXPORT_DIR` and `BACKEND_DIR` if they live elsewhere.
