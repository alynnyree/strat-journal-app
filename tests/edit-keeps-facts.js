// What happens to an auto-imported trade when he opens it and saves a note.
//
// The save built a brand-new trade out of the boxes on the screen and put it
// where the old one was -- so every fact the screen has no box for was thrown
// away: the fee Schwab charged, the after-fee figure, the exact instants of
// both fills, where the stock price came from, and the mark saying the trade
// was finished with. A trade missing its fee asks to be caught up again, which
// is why his figures kept moving after he had corrected something by hand.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  // An auto-imported trade, complete, exactly as the import writes it.
  const imported = {
    id: 900001, ticker: 'SPY', dir: 'Long', occ: 'SPY   260604C00755000',
    entryDate: '2026-06-04', entryTime: '10:20', exitDate: '2026-06-04', exitTime: '10:44',
    entryTimestamp: 1780000000000, exitTimestamp: 1780001440000,
    optEntry: 0.55, optExit: 0.71, contracts: 2,
    pnlDollar: 32, pnlPercent: 29.1, winLoss: 'Win',
    fees: 2.66, entryFees: 1.33, exitFees: 1.33, pnlNet: 29.34,
    undEntry: 601.23, undExit: 602.10,
    undEntrySource: 'alpaca-trade', undEntryExact: true, undPricedWithAlpaca: true,
    undExitSource: 'alpaca-trade', undExitExact: true,
    ftfc: { '1D': 'Bullish', '1H': 'Bullish' }, ftfcRun: 5, ftfcConfirmed: true,
    ftfcDirection: 'Bullish', ftfcTimeframesInRun: ['1D','4H','1H','30m','15m'],
    ftfcVersion: 2, ftfcPriceAtEntry: 601.23,
    strat: '2-1-2 Continuation', stratConfidence: 'high',
    stratNotation: '2U-1-2U', broadeningDetected: false,
    replayData: { candles: [{t:1,o:1,h:1,l:1,c:1}], entryIndex: 0, exitIndex: 0 },
    contractsOpened: 2, fillStatus: 'Closed',
    settled: true, fillAttempts: 1, notes: '', source: 'schwab-auto',
  };

  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/api/trades/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.route('**/api/trades/pending', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
  await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto(site.base + '/index.html');
  await p.evaluate((t) => {
    localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
    localStorage.setItem('strat_backend_url','https://fake.example.com');
    localStorage.setItem('strat_backfilled','1');
    localStorage.setItem('strat_trades', JSON.stringify([t]));
  }, imported);
  await p.reload(); await p.waitForTimeout(1200);

  // Open it the way he does -- the Edit button on the trade -- add a note, save.
  await p.click('.navbar .item[data-view="journal"]'); await p.waitForTimeout(400);
  const opened = await p.evaluate(() => { editTrade(900001); return true; });
  check('the trade opens for editing', opened);
  await p.waitForTimeout(500);
  await p.fill('#f_notes', 'Took the pullback into the 1H open.');
  await p.evaluate(() => saveTrade());
  await p.waitForTimeout(600);

  const after = await p.evaluate(() => loadTrades().find(t => t.id === 900001) || loadTrades()[0]);

  check('his note is saved', after && /pullback/.test(after.notes || ''));
  check(`the fee Schwab charged survives (got ${after && after.fees})`, after && after.fees === 2.66);
  check(`the after-fee figure survives (got ${after && after.pnlNet})`, after && after.pnlNet === 29.34);
  check('the two fee halves survive', after && after.entryFees === 1.33 && after.exitFees === 1.33);
  check('the exact instant of the entry fill survives', after && after.entryTimestamp === 1780000000000);
  check('the exact instant of the exit fill survives', after && after.exitTimestamp === 1780001440000);
  check('where the entry stock price came from survives', after && after.undEntrySource === 'alpaca-trade');
  check('where the exit stock price came from survives', after && after.undExitSource === 'alpaca-trade');
  check('the mark saying the trade is finished with survives', after && after.settled === true);
  check('the count of catch-up passes survives', after && after.fillAttempts === 1);
  check('the timeframe rule version survives', after && after.ftfcVersion === 2);
  check('the bar sequence the AI read survives', after && after.stratNotation === '2U-1-2U');
  check('the AI’s reading of the formation survives', after && after.broadeningDetected === false);
  check('how many contracts were opened survives', after && after.contractsOpened === 2);
  check('the contract code survives', after && after.occ === 'SPY   260604C00755000');
  check('and the trade is not asking to be caught up again',
    after && after.fees != null && after.undEntrySource != null);
  check('nothing on the page threw', errors.length === 0);

  // Merging must not make a box he CAN see unclearable.
  await p.evaluate(() => editTrade(900001));
  await p.waitForTimeout(400);
  await p.fill('#f_notes', '');
  await p.fill('#f_stop', '');
  await p.evaluate(() => saveTrade());
  await p.waitForTimeout(600);
  const cleared = await p.evaluate(() => loadTrades().find(t => t.id === 900001));
  check('clearing his note still clears it', cleared && !String(cleared.notes || '').trim());
  check('clearing the stop still clears it', cleared && (cleared.stop == null || cleared.stop === ''));
  check('and the fee is still there afterwards', cleared && cleared.fees === 2.66);

  // A hand correction still becomes his and still locks.
  await p.evaluate(() => editTrade(900001));
  await p.waitForTimeout(400);
  await p.fill('#f_undEntry', '600.00');
  await p.evaluate(() => saveTrade());
  await p.waitForTimeout(600);
  const corrected = await p.evaluate(() => loadTrades().find(t => t.id === 900001));
  check(`his corrected stock price is kept (got ${corrected && corrected.undEntry})`,
    corrected && Math.abs(corrected.undEntry - 600) < 0.005);
  check('and is marked as his, so nothing may write over it',
    corrected && corrected.userSet && corrected.userSet.undEntry === true);
  check('the fee survived a third save too', corrected && corrected.fees === 2.66);

  // An empty contract-code box must not erase the code.
  await p.evaluate(() => editTrade(900001));
  await p.waitForTimeout(400);
  await p.fill('#f_occ', '');
  await p.evaluate(() => saveTrade());
  await p.waitForTimeout(600);
  const kept = await p.evaluate(() => loadTrades().find(t => t.id === 900001));
  check('an empty contract-code box does not erase the code',
    kept && kept.occ === 'SPY   260604C00755000');

  await p.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  site.stop();
  await b.close();
  process.exit(fail ? 1 : 0);
})();
