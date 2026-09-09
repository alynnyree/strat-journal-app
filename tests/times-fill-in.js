// Will the journal fill in the minute he entered and left?
//
// His own question (2026-09-09), after importing his broker's file: "It also
// says that it doesn't have time so the minute I entered and exited is left
// blank. Will the journal automatically upload my times for entries and
// exits?"
//
// The answer had to be no, and worse than no. The file carries no times, so
// a trade imported from it has both left blank on purpose. The SAME trade
// arriving from Schwab later carries real times and Schwab's own reference
// numbers for its two fills -- so neither check that stops a trade being
// written down twice could recognise it:
//   * the reference check compares the two fills, and the file had to invent
//     its own references, which Schwab's do not match;
//   * the shape check includes both TIMES, and one copy has none.
// So every one of his 254 trades would have been written down a second time
// the moment the connection came back, fee and all.
//
// The rule this follows is already on the record: an identity must never be
// asked about a field deliberately left blank. When one copy has no times,
// the two are compared on everything else -- contract, both dates, both
// prices, size -- and the times are FILLED IN rather than a second trade
// being added.
//
// The hard part, and the reason this cannot simply drop the times from the
// comparison for everyone: three separate trades on one contract, on one
// day, at the same two prices, for the same size, differ ONLY in the minute.
// Ignoring the minute for those collapses three real trades into one, which
// is exactly the fault that cost 24 of his trades a day earlier. So a
// blank-times match is one-to-one: each arrival fills in a DIFFERENT saved
// copy, and never one that already has its times.
const { launch, serve } = require('./browser.js');
const fs = require('fs');
const { FULL, HAVE_HIS_FILLS } = require('./real-journal.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const OCC = 'SPY   260609C00745000';

  // A trade as the FILE leaves it: no times, no stock prices, no timeframes,
  // and references it had to invent for itself.
  const fromFile = (o) => Object.assign({
    id: 'csv-' + Math.random().toString(36).slice(2), ticker:'SPY', dir:'Long', occ: OCC,
    entryDate:'2026-06-09', entryTime:null, exitDate:'2026-06-09', exitTime:null,
    entryTimestamp:null, exitTimestamp:null,
    optEntry:1.11, optExit:1.22, contracts:1, pnlDollar:11, fees:1.33, pnlNet:9.67,
    winLoss:'Win', undEntry:null, undExit:null, ftfc:{}, ftfcRun:null, notes:'',
    source:'schwab-csv', settled:false, fillAttempts:0,
    fills:['csv|2026-06-09|'+OCC+'|B|1|1.11|#1', 'csv|2026-06-09|'+OCC+'|S|1|1.22|#1'],
  }, o);

  // The same trade as SCHWAB delivers it: real times, real references, and
  // the extras only the live connection can work out.
  const fromSchwab = (o) => Object.assign({
    id: 'sch-' + Math.random().toString(36).slice(2), ticker:'SPY', dir:'Long', occ: OCC,
    entryDate:'2026-06-09', entryTime:'09:31', exitDate:'2026-06-09', exitTime:'09:36',
    entryTimestamp: Date.parse('2026-06-09T13:31:00Z'), exitTimestamp: Date.parse('2026-06-09T13:36:00Z'),
    optEntry:1.11, optExit:1.22, contracts:1, fees:1.33,
    undEntry:601.22, undExit:601.55, undEntrySource:'alpaca', undExitSource:'alpaca',
    undEntryExact:true, undExitExact:true, undPricedWithAlpaca:true,
    ftfc:{'1D':'BULLISH','1H':'BULLISH','30m':'BULLISH','15m':'BULLISH'}, ftfcRun:4,
    ftfcConfirmed:true, ftfcDirection:'BULLISH', ftfcVersion:2,
    fills:['9001', '9002'],
  }, o);

  async function importInto(saved, arriving){
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/api/trades/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/pending*', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p.route('**/api/trades/pending/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url','https://fake.example.com');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, saved);
    await p.reload(); await p.waitForTimeout(900);
    const out = await p.evaluate(async (pend) =>
      await autoImportPendingTrades('https://fake.example.com', pend), arriving);
    const stored = await p.evaluate(() => loadTrades());
    await p.close();
    return { out, stored, errors };
  }

  // ---- 1. The plain case: one trade from the file, the same one from Schwab.
  {
    const { out, stored, errors } = await importInto([fromFile({})], [fromSchwab({})]);
    check(`nothing is added (${out.imported} imported)`, out.imported === 0);
    check(`he still has one trade, not two (${stored.length})`, stored.length === 1);
    check(`one contract, not two (${stored.reduce((s,t)=>s+(t.contracts||0),0)})`,
      stored.reduce((s,t)=>s+(t.contracts||0),0) === 1);
    check(`the fee is still $1.33, charged once ($${stored.reduce((s,t)=>s+(t.fees||0),0)})`,
      stored.reduce((s,t)=>s+(t.fees||0),0) === 1.33);
    const t = stored[0];
    check(`the entry minute is filled in (${t.entryTime})`, t.entryTime === '09:31');
    check(`and the exit minute (${t.exitTime})`, t.exitTime === '09:36');
    check('and the exact instants, so it can be replayed', t.entryTimestamp != null && t.exitTimestamp != null);
    check(`the stock price arrives with them (${t.undEntry})`, t.undEntry === 601.22);
    check(`and the timeframe reading (run of ${t.ftfcRun})`, t.ftfcRun === 4 && t.ftfcDirection === 'BULLISH');
    check('it now carries Schwab\'s own references, not the file\'s',
      (t.fills||[]).join('+') === '9001+9002');
    check(`it reads as a Schwab trade from now on (${t.source})`, t.source === 'schwab-auto');
    check(`counted as brought up to date (${out.refreshed})`, out.refreshed === 1);
    check('nothing threw', errors.length === 0);
  }

  // ---- 2. Three trades that differ ONLY in the minute.
  //
  // This is the case that must not collapse. From the file they are three
  // saved copies with no times at all; from Schwab they are three arrivals
  // with three different minutes. Each must fill in a DIFFERENT one.
  {
    const saved = [fromFile({}), fromFile({}), fromFile({})];
    const arriving = [
      fromSchwab({ entryTime:'09:31', exitTime:'09:36', fills:['9001','9002'] }),
      fromSchwab({ entryTime:'10:02', exitTime:'10:09', fills:['9003','9004'] }),
      fromSchwab({ entryTime:'14:15', exitTime:'14:20', fills:['9005','9006'] }),
    ];
    const { out, stored, errors } = await importInto(saved, arriving);
    check(`three real trades stay three (${stored.length})`, stored.length === 3);
    check(`nothing was added (${out.imported} imported)`, out.imported === 0);
    check('each one got its own minute',
      new Set(stored.map(t => t.entryTime + '-' + t.exitTime)).size === 3);
    check('none is left blank', stored.every(t => t.entryTime && t.exitTime));
    check(`three contracts, not six (${stored.reduce((s,t)=>s+(t.contracts||0),0)})`,
      stored.reduce((s,t)=>s+(t.contracts||0),0) === 3);
    check(`$3.99 of fees, not $7.98 ($${stored.reduce((s,t)=>s+(t.fees||0),0).toFixed(2)})`,
      Math.round(stored.reduce((s,t)=>s+(t.fees||0),0)*100) === 399);
    check('nothing threw', errors.length === 0);
  }

  // ---- 3. Only two of the three came back from Schwab.
  {
    const saved = [fromFile({}), fromFile({}), fromFile({})];
    const arriving = [
      fromSchwab({ entryTime:'09:31', exitTime:'09:36', fills:['9001','9002'] }),
      fromSchwab({ entryTime:'10:02', exitTime:'10:09', fills:['9003','9004'] }),
    ];
    const { out, stored } = await importInto(saved, arriving);
    check(`still three trades (${stored.length})`, stored.length === 3);
    check(`two now have their minutes (${stored.filter(t=>t.entryTime).length})`,
      stored.filter(t => t.entryTime).length === 2);
    check('and the third simply still waits', stored.filter(t => !t.entryTime).length === 1);
    check(`nothing added (${out.imported})`, out.imported === 0);
  }

  // ---- 4. A genuinely different trade still gets in.
  {
    const { out, stored } = await importInto([fromFile({})], [
      fromSchwab({ occ:'SPY   260609C00750000', optEntry:0.90, optExit:1.05, fills:['9101','9102'] }),
    ]);
    check(`a real new trade is not swallowed (${out.imported} imported)`, out.imported === 1);
    check(`leaving two (${stored.length})`, stored.length === 2);
  }

  // ---- 5. Same trade from Schwab TWICE.
  {
    const { out, stored } = await importInto([fromFile({})], [fromSchwab({}), fromSchwab({})]);
    check(`a repeat in the same batch adds nothing (${out.imported} imported)`, out.imported === 0);
    check(`one trade (${stored.length})`, stored.length === 1);
    check(`one contract (${stored.reduce((s,t)=>s+(t.contracts||0),0)})`,
      stored.reduce((s,t)=>s+(t.contracts||0),0) === 1);
  }

  // ---- 6. An arrival with no times of its own must not claim a blank one.
  //
  // Two trades that both know nothing about the minute are only the same
  // trade if their shapes agree, which is the check that was already there.
  // Nothing here may let a blank arrival adopt a blank saved copy and then
  // report that as a repair.
  {
    const { out, stored } = await importInto([fromFile({})], [fromFile({ fills:['csv|other|#1','csv|other|#2'] })]);
    check(`a second timeless copy is still refused as a repeat (${out.imported})`, out.imported === 0);
    check(`one trade (${stored.length})`, stored.length === 1);
    check('and it is still waiting for its minute', !stored[0].entryTime);
  }

  // ---- 7. A trade whose minutes he typed in HIMSELF is never overwritten.
  {
    const mine = fromFile({ entryTime:'09:00', exitTime:'09:45' });
    const { stored } = await importInto([mine], [fromSchwab({})]);
    check(`his own entry minute stands (${stored[0].entryTime})`, stored[0].entryTime === '09:00');
    check(`and his exit minute (${stored[0].exitTime})`, stored[0].exitTime === '09:45');
    check(`without a second trade appearing (${stored.length})`, stored.length === 1);
    // The minute and the exact instant are one answer: taking the instant
    // while leaving his minute would have the card say 09:00 while Bar Replay
    // and the timeframes used 09:31.
    check('and the exact instant is not taken either', stored[0].entryTimestamp == null);
  }

  // ---- 8. The money never moves.
  {
    const { out, stored } = await importInto([fromFile({})], [fromSchwab({ fees: 9.99 })]);
    check(`nothing added (${out.imported})`, out.imported === 0 && stored.length === 1);
    check(`the fee his broker charged is untouched ($${stored[0].fees})`, stored[0].fees === 1.33);
    check(`and the after-fee figure ($${stored[0].pnlNet})`, stored[0].pnlNet === 9.67);
    check('the disagreement is recorded rather than applied', !!(stored[0].moneyDisagreement||{}).fees);
  }

  // ---- 8b. A trade read out of his broker's file is not one he typed in.
  //
  // Eight separate places asked "did this come from the broker?" by testing
  // for the ONE way in that existed at the time. Reading his file is a second
  // way in, so all eight quietly answered "he typed this by hand" for every
  // trade in it -- a plainly wrong label on 205 cards, those trades left out
  // of the count of what is still filling in, and a duplicate check that
  // would prefer one of them over the real thing.
  {
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue() : r.abort());
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backfilled','1');
      localStorage.removeItem('strat_backend_url');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, [fromFile({})]);
    await p.reload(); await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const t = loadTrades()[0];
      return {
        card: document.getElementById('journalList').textContent,
        broker: fromBroker(t),
        stale: tradeIsStale(t),
        handTypedWins: false,
      };
    });
    check('the card does not call it "Added by hand"', !/Added by hand/.test(r.card));
    check('it counts as having come from his broker', r.broker === true);
    check('and as still waiting for the rest of its details', r.stale === true);
    check('nothing threw', errors.length === 0);
    await p.close();
  }

  // ---- 9. The other direction: Schwab first, then he imports the file.
  //
  // Just as bad, and live right now: the file's trades carry references no
  // saved trade claims, and the shape check is not even asked because they
  // have references -- so every trade in the file would be added on top of
  // the ones already there.
  const CSV = [
    'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount',
    '06/09/2026,Buy to Open,SPY 06/09/2026 745.00 C,CALL SPY,1,$1.11,$0.66,-$111.66',
    '06/09/2026,Sell to Close,SPY 06/09/2026 745.00 C,CALL SPY,1,$1.22,$0.67,$121.33',
  ].join('\n');

  const importFile = async (saved, text) => {
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue() : r.abort());
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backfilled','1');
      localStorage.removeItem('strat_backend_url');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, saved);
    await p.reload(); await p.waitForTimeout(900);
    const before = await p.evaluate(() => document.getElementById('csvLog').children.length);
    await p.evaluate(async (t) => {
      const dt = new DataTransfer();
      dt.items.add(new File([t], 'Schwab.csv', { type: 'text/csv' }));
      const el = document.getElementById('csvInput');
      el.files = dt.files;
      el.dispatchEvent(new Event('change'));
    }, text);
    await p.waitForFunction((n) => {
      const el = document.getElementById('csvLog');
      return el && el.children.length > n;
    }, before, { timeout: 60000 });
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => ({
      said: (document.getElementById('csvLog').firstChild || {}).textContent || '',
      trades: loadTrades(),
    }));
    await p.close();
    return { said: r.said, trades: r.trades, errors };
  };

  {
    const already = Object.assign(fromSchwab({}), {
      pnlDollar: 11, pnlNet: 9.67, winLoss:'Win', notes:'my note', source:'schwab-auto',
    });
    const { said, trades, errors } = await importFile([already], CSV);
    check(`the file does not add a trade he already has (${trades.length})`, trades.length === 1);
    check(`and says so (${said.slice(0,60)})`, /already in your journal/.test(said));
    check(`one contract (${trades.reduce((s,t)=>s+(t.contracts||0),0)})`,
      trades.reduce((s,t)=>s+(t.contracts||0),0) === 1);
    check(`the fee is charged once ($${trades.reduce((s,t)=>s+(t.fees||0),0)})`,
      trades.reduce((s,t)=>s+(t.fees||0),0) === 1.33);
    check('his own note survives', trades[0].notes === 'my note');
    check('and his minutes are untouched', trades[0].entryTime === '09:31');
    check('nothing threw', errors.length === 0);
  }

  {
    // And a trade in the file he does NOT have must still arrive.
    const other = Object.assign(fromSchwab({
      occ:'SPY   260609C00750000', optEntry:0.90, optExit:1.05, fills:['9101','9102'],
    }), { pnlDollar: 15, pnlNet: 13.67, winLoss:'Win', source:'schwab-auto' });
    const { trades } = await importFile([other], CSV);
    check(`a trade the file has and the journal does not is added (${trades.length})`, trades.length === 2);
  }

  // ---- 10. His own 254 real trades, both ways round.
  if(HAVE_HIS_FILLS){
    const text = fs.readFileSync(FULL, 'utf8');
    const cents = n => Math.round((n||0)*100);
    const total = (a, f) => a.reduce((s,x)=>s+cents(f(x)),0)/100;

    const first = await importFile([], text);
    check(`his file still imports 254 trades (${first.trades.length})`, first.trades.length === 254);

    // Now the same trades as SCHWAB would deliver them once the connection
    // is back: same contract, same dates, same prices, same size, plus the
    // minute and its own reference numbers. Distinct minutes throughout, so
    // trades that differ only in the minute have to be matched one to one.
    const arrivals = first.trades.map((t, i) => Object.assign({}, t, {
      id: 'sch-' + i,
      entryTime: String(9 + (i % 6)).padStart(2,'0') + ':' + String(i % 60).padStart(2,'0'),
      exitTime:  String(9 + (i % 6)).padStart(2,'0') + ':' + String((i % 60 + 1) % 60).padStart(2,'0'),
      entryTimestamp: Date.parse(t.entryDate + 'T14:00:00Z') + i * 1000,
      exitTimestamp:  Date.parse(t.exitDate  + 'T14:05:00Z') + i * 1000,
      undEntry: 600 + (i % 20), undExit: 601 + (i % 20),
      undEntrySource: 'alpaca', undExitSource: 'alpaca', undPricedWithAlpaca: true,
      ftfc: {'1D':'BULLISH'}, ftfcRun: 4, ftfcConfirmed: true, ftfcDirection: 'BULLISH', ftfcVersion: 2,
      fills: ['sch-buy-' + i, 'sch-sell-' + i],
      source: undefined,
    }));
    const { out, stored, errors } = await importInto(first.trades, arrivals);
    check(`the connection coming back adds nothing (${out.imported} imported)`, out.imported === 0);
    check(`he still has 254 trades, not 508 (${stored.length})`, stored.length === 254);
    check(`306 contracts, as his broker bought (${stored.reduce((s,t)=>s+(t.contracts||0),0)})`,
      stored.reduce((s,t)=>s+(t.contracts||0),0) === 306);
    check(`$404.73 of fees, to the penny ($${total(stored,t=>t.fees).toFixed(2)})`,
      total(stored, t=>t.fees) === 404.73);
    check(`-$1100.73 after fees, to the penny ($${total(stored,t=>t.pnlNet).toFixed(2)})`,
      total(stored, t=>t.pnlNet) === -1100.73);
    check(`every one of them now knows the minute (${stored.filter(t=>t.entryTime).length} of ${stored.length})`,
      stored.every(t => t.entryTime && t.exitTime));
    check('and no two share a minute they should not',
      new Set(stored.map(t => [t.occ,t.entryDate,t.entryTime,t.exitTime,t.optEntry,t.optExit,t.contracts].join('|'))).size === 254);
    check(`all 254 brought up to date (${out.refreshed})`, out.refreshed === 254);
    check('nothing threw', errors.length === 0);

    // And the reverse: his 254 Schwab trades, then the file on top.
    const back = await importFile(stored, text);
    check(`the file on top of the real trades adds nothing (${back.trades.length})`, back.trades.length === 254);
    check(`the money did not move ($${total(back.trades,t=>t.pnlNet).toFixed(2)})`,
      total(back.trades, t=>t.pnlNet) === -1100.73);
  } else {
    console.log('NOTE: his real broker file is not on this machine — the 254-trade check was skipped.');
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
