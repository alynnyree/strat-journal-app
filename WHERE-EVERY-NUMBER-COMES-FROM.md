# Where every number comes from, and what settles it

Written 2026-09-25, after the 5 and 15 minute bars turned out to have been
wrong for months. His question was the right one:

> "This app needs to be built off of facts. All the numbers that are built
> into the app are FACTS and should be pulled from somewhere else to be
> validated. How do we make sure that this is correct..now and moving
> forward?"

**Why those bars stayed wrong is precise, and it is the whole point of this
file: every check the app had compared the app against ITSELF.** Nothing
ever asked anyone outside whether a 5-minute bar was a 5-minute bar. The
money is the one number with a real outside referee — his broker's own
export — and the money is the one number that has not been wrong since.

So there are only two kinds of number in this app.

---

## Kind 1 — FACTS. Someone outside recorded them. They can be checked.

| Number | Who recorded it | What settles a dispute | Is that check running? |
|---|---|---|---|
| Time he entered / exited | Schwab's own fill record | Nothing — his export has no time columns | **No referee.** Covered instead by direct checks on the timezone maths (`times-fill-in`, 52 checks): both daylight-saving changeovers, midnight, and a late-evening trade that must not roll onto the next day |
| Contract price in / out | Schwab's own fill | His Schwab export | **Yes** — Checks page, and `import-exact` marks both real exports to the penny |
| Number of contracts | Schwab's own fill | His Schwab export | **Yes** — 306 and 253 contracts, exact |
| Fees | Derived from the CASH on Schwab's fill (`\|netAmount\| − price×100×qty`) | His Schwab export | **Yes** — $404.73 and $334.73, exact |
| Profit, before and after fees | Schwab's fills | His Schwab export | **Yes** — −$1,100.73 and −$1,603.73, exact |

**These five are settled.** They match his broker to the cent, in both of
his real exports, through the real pairing code. Any change to that path
must keep `tests/import-exact.js` green.

---

## Kind 2 — THE APP'S OWN WORK. Nobody outside recorded these.

They are *worked out* from something else. They can still be checked — but
only against a source that had no hand in making them.

| Number | How it is made | What can settle it | Is that check running? |
|---|---|---|---|
| **Underlying stock price at entry / exit** | **Reconstructed.** Schwab's trade record never says where SPY was at the fill | Alpaca's own trade print for that second | **Partly.** The card marks "exact" vs "approx.", but nothing compares the two sources against each other |
| 5m / 15m / 30m / 1H / 2H / 4H bars (Bar Replay) | Built from 1-minute bars | **Alpaca serves these sizes itself** | **NEW — `barAudit.js`.** This is what was missing and it is why the bars were wrong |
| The thirteen timeframes (FTFC) | The price at entry against the open of the bar forming then | Same — the provider's own bars | **NEW — same referee** |
| Realized reward-to-risk | Built on the reconstructed stock price above | Nothing; it inherits that price's error | **No referee, and cannot have one.** It is only ever as good as the stock price it is built on |
| Which setup / which play | The AI reading the chart | Him | **He is the referee.** The card shows what it read; his own tag always wins |

---

## HE GOT ONE WRONG, AND IT MATTERS

He listed *"underlying stock price at entry & exit"* among the facts. **It is
not one.** Schwab's trade record says what he paid for the contract; it never
says where SPY or IWM was at that moment. That price is reconstructed from
candle data, cascading 1-minute → 5-minute → 30-minute → daily as older data
runs out, so an old trade's "stock price at entry" can come from a
30-minute close or even the previous day.

This is not new — it has been on this project's record for weeks — but it
had never been said to him in a list next to the things that ARE facts.
**His realized reward-to-risk is computed from it and inherits every bit of
its error.** It must never be described as exact.

---

## The rule, for everything built from here

**A number the app works out must be checked against the same number
obtained a different way — or labelled as the app's own reconstruction.
There is no third option.**

Three specific habits that would each have caught the bar fault on their own:

1. **Ask what outside source could contradict this, before writing the
   code.** If the honest answer is "nothing", that number is a
   reconstruction and must be labelled as one on screen.
2. **When a rule is learned on one side, sweep the other side for it.**
   "Grouping candles by position in a list is not a timeframe" was found
   and fixed in `ftfcCheck.js` on the server a month before anyone looked
   at the identical fault in the chart. One `grep` would have found it.
3. **A check that only compares the app to itself proves nothing.** Two
   pieces of the app can agree perfectly and both be wrong — and were.

---

## What is still unchecked, plainly

- **Entry and exit TIMES have no outside referee at all.** His broker's
  export carries no time columns. The timezone maths is checked directly
  and heavily, but the times themselves are taken on trust from Schwab.
- **The underlying stock price has no running comparison** between
  Alpaca's answer and Schwab's, though both exist. That is the next gap
  worth closing.
- **The referee cannot run without market-data keys**, so it does not run
  in the test environment. It says so rather than passing quietly.
