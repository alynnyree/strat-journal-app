// The FTFC v3 re-measure, on a synthetic journal (his request, 11 Oct 2026):
// "Please add the missing synthetic-journal safety test for the FTFC v3
// re-measure."
//
// FTFC_RULE_VERSION 3 corrects the timeframe reading (a fill's seconds no
// longer push every intraday bar's open a minute late) and asks every trade
// measured under 2 to be measured once more. This proves, in a real browser
// on the real app, that the re-measure:
//   T  actually starts for a journal of finished (settled) trades;
//   1  changes ONLY the approved FTFC fields (plus the catch-up's own
//      bookkeeping, fillAttempts and settled, which every catch-up writes);
//   2  never touches timeframes he set by hand;
//   3  never touches money or anything else of his;
//   4  never replaces a good reading with blanks -- not when the rebuild
//      fails, not when it answers with nothing, not when it answers with
//      fewer timeframes than the trade already has.
// Every trade here is invented; none of his data is in this project.
const { launch, serve } = require('./browser.js');

const APPROVED = ['ftfc', 'ftfcRun', 'ftfcVersion', 'ftfcPriceAtEntry', 'ftfcConfirmed', 'ftfcDirection', 'ftfcTimeframesInRun'];
const BOOKKEEPING = ['fillAttempts', 'settled'];
const URL_ = 'https://fake.example.com';

// A finished trade measured under rule 2, as the journal holds it.
const OLD_GRID = { '6M':'BULLISH','3M':'BULLISH','1M':'BULLISH','1W':'BULLISH','1D':'BULLISH','4H':'BULLISH','2H':'BULLISH','1H':'BULLISH','30m':'BEARISH','15m':'BEARISH' };
const saved = (i, o = {}) => Object.assign({
  id: 'T:' + i, ticker:'SPY', dir:'Long', occ:'SPY   260604C0075' + i + '000',
  entryDate:'2026-06-04', entryTime:'10:3' + i, exitDate:'2026-06-04', exitTime:'11:0' + i,
  entryTimestamp: Date.parse('2026-06-04T14:3' + i + ':30Z'), exitTimestamp: Date.parse('2026-06-04T15:0' + i + ':45Z'),
  optEntry:0.55, optExit:0.71, contracts:2, contractsOpened:2,
  pnlDollar:32, pnlPercent:29.1, winLoss:'Win', fees:2.66, entryFees:1.33, exitFees:1.33, pnlNet:29.34,
  undEntry:601.23, undExit:602.10, undEntrySource:'alpaca-trade', undExitSource:'alpaca-trade',
  undEntryExact:true, undExitExact:true, undPricedWithAlpaca:true,
  ftfc: OLD_GRID, ftfcRun:8, ftfcConfirmed:true, ftfcDirection:'BULLISH',
  ftfcTimeframesInRun:['6M','3M','1M','1W','1D','4H','2H','1H'], ftfcVersion:2, ftfcPriceAtEntry:601.2,
  strat:'2-1-2 Continuation', stratConfidence:'high', play:'FTFC Direction Play', playConfidence:'high',
  stratNotation:'2U-1-2U', broadeningDetected:false, offBroadeningFormation:true,
  stop:600.5, rrPlanned:2, notes:'His own note ' + i, shotEntry:'data:image/png;base64,AAAA',
  replayData:{ candles:[{time:1,open:1,high:1,low:1,close:1}], entryIndex:0, exitIndex:0 },
  fills:['910' + i, '920' + i], source:'schwab-auto', settled:true, fillAttempts:1, fillStatus:'Closed',
}, o);

// The same trade as the server re-measures it under rule 3 -- with DIFFERENT
// money, notes, setup, play and stop, to prove none of those are taken.
const NEW_GRID = { '6M':'BULLISH','3M':'BULLISH','1M':'BULLISH','1W':'BULLISH','1D':'BULLISH','4H':'BULLISH','2H':'BULLISH','1H':'BULLISH','30m':'BULLISH','15m':'BULLISH','5m':'BULLISH','3m':'BULLISH' };
const fresh = (i, o = {}) => Object.assign({}, freshDifferentMoney(i), {
  pnlDollar:32, pnlPercent:29.1, winLoss:'Win', fees:2.66, entryFees:1.33, exitFees:1.33, pnlNet:29.34,
}, o);
// The arrival with DIFFERENT money, notes, setup, play, stop and stock
// prices -- used where the point is that none of those are taken.
const freshDifferentMoney = (i, o = {}) => Object.assign({
  id: 'SPY-1030-1100-p' + String(i).repeat(32).slice(0, 32), ticker:'SPY', dir:'Long', occ:'SPY   260604C0075' + i + '000',
  entryDate:'2026-06-04', entryTime:'10:3' + i, exitDate:'2026-06-04', exitTime:'11:0' + i,
  entryTimestamp: Date.parse('2026-06-04T14:3' + i + ':30Z'), exitTimestamp: Date.parse('2026-06-04T15:0' + i + ':45Z'),
  optEntry:0.55, optExit:0.71, contracts:2, contractsOpened:2,
  pnlDollar:999, pnlPercent:99, winLoss:'Loss', fees:9.99, entryFees:5, exitFees:4.99, pnlNet:-1,
  undEntry:700, undExit:701, undEntrySource:'schwab-candle', undExitSource:'schwab-candle', undEntryExact:false, undExitExact:false,
  ftfc: NEW_GRID, ftfcRun:12, ftfcConfirmed:true, ftfcDirection:'BULLISH',
  ftfcTimeframesInRun:['6M','3M','1M','1W','1D','4H','2H','1H','30m','15m','5m','3m'], ftfcVersion:3, ftfcPriceAtEntry:601.25,
  strat:'PMG', stratConfidence:'high', play:'2s Turning Into 3s', playConfidence:'high', stop:590, notes:'',
  fills:['910' + i, '920' + i], source:'schwab-auto', idBasis:'fill-pair',
}, o);

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : JSON.stringify(d).slice(0, 300)); } };

  // A fresh browser per case, so no case can see another's storage.
  async function page(journal, { backfillStatus = 200 } = {}){
    const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
    const p = await ctx.newPage();
    const errors = [], asked = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/api/**', r => { asked.push(r.request().method() + ' ' + new URL(r.request().url()).pathname); return r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' }); });
    await p.route('**/api/trades/pending*', r => r.fulfill({ status:200, contentType:'application/json', body:'{"pending":[]}' }));
    await p.route('**/api/trades/backfill*', r => {
      const m = r.request().method(); asked.push(m + ' /api/trades/backfill');
      if (m === 'GET') return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ backfill:{ status:'done', startedAt:'2026-10-01T00:00:00Z' } }) });
      return r.fulfill({ status: backfillStatus, contentType:'application/json', body: backfillStatus === 200 ? '{"started":true}' : '{"error":"stand-in failure"}' });
    });
    await p.route(u => u.pathname === '/health', r => r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true,"ftfcRuleVersion":3}' }));
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({ on:false, motion:false }));
      localStorage.setItem('strat_backend_url', 'https://fake.example.com');
      localStorage.setItem('strat_backfilled', '1');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, journal);
    await p.reload(); await p.waitForTimeout(1200);
    // The baseline is the journal AS LOADED: on start-up the app moves
    // pictures out of the journal into their own store (shotEntry becomes
    // "kept"). That is not the re-measure, so it is not compared.
    const loaded = await p.evaluate(() => loadTrades());
    return { p, ctx, errors, asked, loaded };
  }
  const read = p => p.evaluate(() => loadTrades());
  const byId = (list, id) => list.find(t => t.id === id);
  const changedKeys = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
  const pick = (t, keys) => Object.fromEntries(keys.map(k => [k, t[k]]));

  console.log('--- T. the re-measure actually starts for a journal of FINISHED trades ---');
  {
    const journal = [1, 2, 3, 4, 5, 6].map(i => saved(i));
    const { p, ctx, errors, asked } = await page(journal);
    const stale = await p.evaluate(() => loadTrades().filter(tradeIsStale).length);
    check(`every finished trade measured under rule 2 asks to be measured again (${stale} of 6)`, stale === 6);
    // Nothing is pressed: the app's own start-up check asks for the rebuild.
    check('the app asks for the rebuild BY ITSELF when it opens (POST backfill)', asked.includes('POST /api/trades/backfill'), asked);
    const hist = await p.evaluate(() => JSON.parse(localStorage.getItem('strat_auto_rebuild') || 'null'));
    check(`and records it as the rule-3 attempt (${JSON.stringify(hist && { forVersion: hist.forVersion, attempts: hist.attempts })})`, hist && hist.forVersion === 3 && hist.attempts === 1);
    check('nothing threw', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n--- 1 & 3. only the approved FTFC fields change; money and everything of his stay ---');
  {
    const { p, ctx, errors, loaded } = await page([saved(1), saved(2), saved(3), saved(4), saved(5)]);
    const before = byId(loaded, 'T:1');
    const out = await p.evaluate(async (a) => await autoImportPendingTrades('https://fake.example.com', a), [fresh(1)]);
    const after = byId(await read(p), 'T:1');
    const changed = changedKeys(before, after);
    const unexpected = changed.filter(k => !APPROVED.includes(k) && !BOOKKEEPING.includes(k));
    check(`the trade was re-measured (${out.refreshed} brought up to date, ${out.imported} added)`, out.refreshed === 1 && out.imported === 0, out);
    check(`changed fields are only the approved FTFC ones (+ bookkeeping): ${changed.join(', ')}`, unexpected.length === 0, unexpected);
    check('the new reading landed: run 12, version 3, the new grid',
      after.ftfcRun === 12 && after.ftfcVersion === 3 && JSON.stringify(after.ftfc) === JSON.stringify(NEW_GRID) && after.ftfcPriceAtEntry === 601.25);
    const MONEY = ['optEntry','optExit','contracts','contractsOpened','pnlDollar','pnlPercent','winLoss','fees','entryFees','exitFees','pnlNet'];
    check('money fields are byte-identical (the arrival carried different ones)', JSON.stringify(pick(after, MONEY)) === JSON.stringify(pick(before, MONEY)), pick(after, MONEY));
    const HIS = ['notes','shotEntry','strat','stratConfidence','play','playConfidence','stop','rrPlanned','offBroadeningFormation','entryTime','exitTime','entryTimestamp','exitTimestamp','undEntry','undExit','undEntrySource','undExitSource','replayData','fills','id','source'];
    check('notes, picture, setup, play, stop, times, stock prices, replay, fills and id are byte-identical', JSON.stringify(pick(after, HIS)) === JSON.stringify(pick(before, HIS)), changedKeys(pick(before, HIS), pick(after, HIS)));
    const others = (await read(p)).filter(t => t.id !== 'T:1');
    check('the four other trades are byte-identical', JSON.stringify(others) === JSON.stringify(loaded.filter(t => t.id !== 'T:1')));
    check('direction, verdict and run list taken whole from the new reading', after.ftfcDirection === 'BULLISH' && after.ftfcConfirmed === true && after.ftfcTimeframesInRun.length === 12);
    check('nothing threw', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n--- 3b. an arrival with DIFFERENT money, stock prices, notes, setup, play and stop takes none of them ---');
  {
    const { p, ctx, errors, loaded } = await page([saved(1), saved(2), saved(3), saved(4), saved(5)]);
    const before = byId(loaded, 'T:1');
    await p.evaluate(async (a) => await autoImportPendingTrades('https://fake.example.com', a), [freshDifferentMoney(1)]);
    const after = byId(await read(p), 'T:1');
    const MONEY = ['optEntry','optExit','contracts','contractsOpened','pnlDollar','pnlPercent','winLoss','fees','entryFees','exitFees','pnlNet'];
    check('money byte-identical (offered $999 / $9.99 fees / a Loss)', JSON.stringify(pick(after, MONEY)) === JSON.stringify(pick(before, MONEY)), pick(after, MONEY));
    check('the exact stock prices stay (offered rougher candle closes 700 / 701)', after.undEntry === 601.23 && after.undExit === 602.10 && after.undEntryExact === true && after.undEntrySource === 'alpaca-trade');
    check('notes, setup, play and stop stay his', after.notes === before.notes && after.strat === before.strat && after.play === before.play && after.stop === before.stop);
    check('the disagreement is RECORDED, not applied (moneyDisagreement, by design)', !!(after.moneyDisagreement && after.moneyDisagreement.fees && after.moneyDisagreement.fees.kept === 2.66 && after.moneyDisagreement.fees.offered === 9.99));
    const unexpected = changedKeys(before, after).filter(k => !APPROVED.includes(k) && !BOOKKEEPING.includes(k) && k !== 'moneyDisagreement');
    check(`nothing else changed (${unexpected.join(', ') || 'none'})`, unexpected.length === 0, unexpected);
    check('nothing threw', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n--- 2. timeframes he set by hand are never touched ---');
  {
    const { p, ctx, errors, loaded } = await page([saved(1, { userSet:{ ftfc:true }, ftfc:{ '1D':'BEARISH','4H':'BEARISH' }, ftfcRun:2, ftfcConfirmed:false, ftfcDirection:'BEARISH', ftfcTimeframesInRun:[] }), saved(2), saved(3), saved(4), saved(5)]);
    const before = byId(loaded, 'T:1');
    check('his hand-set trade does not ask to be re-measured', await p.evaluate(() => !tradeIsStale(loadTrades().find(t => t.id === 'T:1'))));
    await p.evaluate(async (a) => await autoImportPendingTrades('https://fake.example.com', a), [fresh(1)]);
    const after = byId(await read(p), 'T:1');
    check('his FTFC reading is byte-identical (grid, run, verdict, direction, version)', JSON.stringify(pick(after, APPROVED)) === JSON.stringify(pick(before, APPROVED)), pick(after, APPROVED));
    check('his hand-set mark is still there', after.userSet && after.userSet.ftfc === true);
    const unexpected = changedKeys(before, after).filter(k => !BOOKKEEPING.includes(k));
    check(`nothing else changed either (${unexpected.join(', ') || 'none'})`, unexpected.length === 0, unexpected);
    check('nothing threw', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n--- 4. a failed or empty re-measure never replaces a good reading with blanks ---');
  {
    // 4a. The rebuild request itself fails.
    const journal = [1, 2, 3, 4, 5, 6].map(i => saved(i));
    const { p, ctx, errors, loaded, asked } = await page(journal, { backfillStatus: 500 });
    check('4a. the rebuild WAS asked for at start-up (and refused by the stand-in)', asked.includes('POST /api/trades/backfill'), asked);
    await p.waitForTimeout(1500);
    check('4a. the rebuild request failed: every trade byte-identical to the journal as loaded', JSON.stringify(await read(p)) === JSON.stringify(loaded));
    check('4a. nothing threw', errors.length === 0, errors);
    await ctx.close();
  }
  const blankCases = [
    ['4b. the answer has no reading at all (run null, no grid)', { ftfc:{}, ftfcRun:null, ftfcConfirmed:null, ftfcDirection:null, ftfcTimeframesInRun:[], ftfcPriceAtEntry:null }],
    ['4c. the answer is an empty reading (run 0, empty grid) -- no market data reached the server', { ftfc:{}, ftfcRun:0, ftfcConfirmed:false, ftfcDirection:null, ftfcTimeframesInRun:[], ftfcPriceAtEntry:null }],
    ['4d. the answer is PARTIAL: only the daily-and-up timeframes (no minute data, e.g. Alpaca not connected)', { ftfc:{ '6M':'BULLISH','3M':'BULLISH','1M':'BULLISH','1W':'BULLISH','1D':'BULLISH' }, ftfcRun:5, ftfcConfirmed:true, ftfcDirection:'BULLISH', ftfcTimeframesInRun:['6M','3M','1M','1W','1D'] }],
  ];
  blankCases.push(['4e. CONTROL: a full new reading whose only blank is the 1-minute IS taken (1m is blank by design)', null]);
  for (const [label, over] of blankCases) {
    if (over === null) {
      const { p, ctx, errors } = await page([saved(1, { ftfc: Object.assign({ '1m':'BULLISH' }, OLD_GRID) }), saved(2), saved(3), saved(4), saved(5)]);
      await p.evaluate(async (a) => await autoImportPendingTrades('https://fake.example.com', a), [fresh(1)]);
      const after = byId(await read(p), 'T:1');
      check(label, after.ftfcVersion === 3 && after.ftfcRun === 12 && !after.ftfc['1m'], pick(after, APPROVED));
      check(`${label}: nothing threw`, errors.length === 0, errors);
      await ctx.close();
      continue;
    }
    const { p, ctx, errors, loaded } = await page([saved(1), saved(2), saved(3), saved(4), saved(5)]);
    const before = byId(loaded, 'T:1');
    await p.evaluate(async (a) => await autoImportPendingTrades('https://fake.example.com', a), [fresh(1, over)]);
    const after = byId(await read(p), 'T:1');
    check(`${label}: the FTFC reading on file is byte-identical`, JSON.stringify(pick(after, APPROVED)) === JSON.stringify(pick(before, APPROVED)), pick(after, APPROVED));
    check(`${label}: it is still marked rule 2, so it can be measured again when data is there`, after.ftfcVersion === 2);
    const unexpected = changedKeys(before, after).filter(k => !BOOKKEEPING.includes(k));
    check(`${label}: nothing else changed (${unexpected.join(', ') || 'none'})`, unexpected.length === 0, unexpected);
    if (over.ftfcRun != null) {
      const held = await p.evaluate(() => JSON.parse(localStorage.getItem('strat_ftfc_held') || 'null'));
      check(`${label}: the hold is recorded with its reason, outside the journal (${held && held.last && held.last.reason})`, !!(held && held.ids && held.ids['T:1'] && /came back/.test(held.ids['T:1'].reason)));
    }
    check(`${label}: nothing threw`, errors.length === 0, errors);
    await ctx.close();
  }

  await b.close(); site.close && site.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
