# Nothing of his goes in here

`alynnyree/strat-journal-app` is a **PUBLIC** repository — it has to be, for
GitHub Pages to serve the app on a free account. Checked, not assumed
(2026-09-28): the repository reports `"private": false`.

So his exported journal must never be committed. It is his complete trading
record — every entry and exit price, every profit and loss, on every trade
he has made — and a public repository publishes it to anyone, permanently,
because git keeps everything that was ever in it.

`the-repair-keeps-the-real-trade.js` is written to run against that export
when it is present on the machine and to **SKIP, saying why, when it is
not**. That is deliberate: the check is worth having, and the data is not
worth publishing.

To run it against his real journal, put the export here as
`his-journal-2026-09-28.json`. It is ignored by git and stays on this
machine.
