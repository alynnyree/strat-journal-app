// TWO FAULTS HE FOUND BY LOOKING, on 2026-09-17.
//
// 1. THE SAME TRADE READ $12.00 ON ONE SCREEN AND $8.01 ON ANOTHER. Recent
//    Trades showed the profit BEFORE fees; the Journal card shows it AFTER,
//    labelled. Neither was wrong alone -- but one trade wearing two figures,
//    with only one screen saying which, is how he ends up unable to trust
//    either. Same fault as the two cards that split his trades the same way
//    and disagreed about which were wins.
//
// 2. THE BROKER COMPARISON MEASURED MY OWN CHANGE AND CALLED IT HIS FAULT.
//    His journal now starts 1 May, by his instruction. His broker's file
//    covers 2 January to 23 July. Compared whole, four months of fills his
//    journal is not supposed to hold came out as "Your journal does not
//    match Schwab", in red, with April days reading 0 against 4 -- at the
//    exact moment he was asking whether any of it could be trusted.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  // His two real NIO trades, exactly as his Journal shows them.
  const nio = (id, optExit, fees, pnlDollar, pnlNet) => ({
    id, ticker:'NIO', dir:'Short', entryDate:'2026-06-24', entryTime:'09:31',
    exitDate:'2026-07-23', exitTime:'15:55', optEntry:0.49, optExit, contracts:1,
    occ:'NIO   260723P00004000', fills:['n'+id+'a','n'+id+'b'],
    fees, pnlDollar, pnlNet, winLoss:'Win', source:'schwab-auto', settled:true,
  });

  const ctx = await b.newContext({ viewport:{width:390,height:844} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
    : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto(site.base + '/index.html');
  await p.evaluate(() => localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})));
  await p.reload(); await p.waitForTimeout(600);

  // ------------------------------------------------------------------
  console.log('--- one trade, one figure, on both screens ---');
  {
    const text = await p.evaluate((js) => {
      localStorage.setItem('strat_trades', JSON.stringify(js));
      renderDashboard();
      return document.getElementById('recentTrades').textContent;
    }, [nio('1', 0.53, 3.99, 12, 8.01), nio('2', 0.54, 1.32, 5, 3.68)]);

    check(`it shows the after-fee figure (${/8\.01/.test(text)})`, /8\.01/.test(text));
    check('and the second one too', /3\.68/.test(text));
    check('NOT the before-fee figure he was shown', !/\$12\.00/.test(text) && !/\$5\.00/.test(text));
    check('and it says which it is', /after fees/i.test(text));
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- a fee that is not known is never quietly swapped ---');
  {
    // The mixture that made his headline drift for weeks: a total labelled
    // "after fees" that silently used the before-fee figure wherever the
    // fee was missing.
    const text = await p.evaluate((js) => {
      localStorage.setItem('strat_trades', JSON.stringify(js));
      renderDashboard();
      return document.getElementById('recentTrades').textContent;
    }, [nio('3', 0.53, null, 12, null)]);
    check('it still shows a figure rather than a blank', /12\.00/.test(text));
    check('but says the fee is not known: ' + /fee not known/i.test(text), /fee not known/i.test(text));
    check('and does NOT claim it is after fees', !/after fees/i.test(text));
    check('nothing threw', errors.length === 0);
  }

  // ------------------------------------------------------------------
  console.log('\n--- the comparison only compares the window his journal keeps ---');
  {
    const fill = (date, symbol, isBuy, qty, price, fees, amount) =>
      ({ date, symbol, isBuy, qty, price, fees, amount });
    // Two April fills his journal is not supposed to hold, and one May pair.
    const fills = [
      fill('2026-04-23','SPY   260423C00710000', true,  2, 1.00, 1.30, -201.30),
      fill('2026-04-23','SPY   260423C00710000', false, 2, 1.20,  1.30,  238.70),
      fill('2026-05-04','SPY   260504C00723000', true,  6, 1.00, 2.00, -602.00),
      fill('2026-05-04','SPY   260504C00723000', false, 6, 1.10, 2.00,  658.00),
    ];
    const r = await p.evaluate((f) => compareJournalToBroker(loadTrades(), f), fills);
    check(`the April fills are left out (${r.broker.beforeFloor} of them)`, r.broker.beforeFloor === 2);
    check(`only May contracts are counted against him (${r.broker.contracts})`, r.broker.contracts === 6);
    check('so an April day cannot appear as a difference',
      !r.differences.some(d => String(d.date || d.day || '').startsWith('2026-04')));
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- and it says what it left out, rather than letting it look like a fault ---');
  {
    const html = await p.evaluate(() => renderBrokerCheck({
      everythingMatches: false, from:'2026-05-01', to:'2026-07-23',
      journal:{ trades: 110 }, broker:{ fills: 240, beforeFloor: 240, unpaired: 0 },
      outside: 0, nonTrading: 19, unreadable: 0, feesUnknown: 0,
      moneyComparable: true,
      money:{ afterFees:{journal:-768.92,broker:-768.92,ok:true},
              beforeFees:{journal:-565,broker:-565,ok:true},
              fees:{journal:203.92,broker:203.92,ok:true} },
      contracts:{ ok:true, journal:154, broker:154 }, differences: [],
    }));
    check('it names how many fills were left out', /240 fills in the file are from before/.test(html));
    check('and says outright that it is not a difference', /That is not a difference/.test(html));
    check('and tells him how to get a clean comparison', /export from Schwab starting/i.test(html));
    check('naming the date his journal starts', /1 May 2026/.test(html));
    check('nothing threw', errors.length === 0);
  }

  await ctx.close(); await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
