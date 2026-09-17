// "How do we fix the duplicate trades forever so this is never a problem?"
//
// Every duplicate check on this project has been the app judging ITSELF --
// his trades against his other trades, by rules I wrote. That has failed
// four times: blind to a copy with no contract code, blind to the same
// fills paired twice, and once so strict it threw away 24 real trades.
//
// So this stops judging and starts COUNTING. His broker's file says how
// many contracts he bought, of what, on which day. The app had no hand in
// that number. His journal may never hold more.
//
// HIS OWN RULE is what tells a real trade from a phantom: "for every buy
// there should be a sell unless I'm still in the trade. There should be two
// trades for one card." A card is one purchase and one sale.
//
// Built from his real 4 May row: journal 9, Schwab 6.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  // The contract code as it sits on a trade, and as SCHWAB'S OWN FILE
  // spells it -- which is what the comparison keys on, and what his
  // screenshot shows. My first version of this test used the raw code for
  // both and matched nothing, which made a working reconciler look broken.
  const OCC = 'SPY   260504C00723000';
  const SYM = 'SPY 05/04/2026 723.00 C';
  const real = (id, contracts, o) => Object.assign({
    id, ticker:'SPY', dir:'Long', entryDate:'2026-05-04', entryTime:'09:31',
    exitDate:'2026-05-04', exitTime:'09:45', optEntry:1.00, optExit:1.10, contracts,
    occ: OCC, fills:['b'+id, 's'+id],
    fees:1.32, pnlDollar:10*contracts, pnlNet:10*contracts-1.32, winLoss:'Win',
    source:'schwab-auto', settled:true,
  }, o || {});

  const ctx = await b.newContext({ viewport:{width:390,height:844} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
    : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto(site.base + '/index.html');
  await p.evaluate(() => localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})));
  await p.reload(); await p.waitForTimeout(600);

  const plan = (journal, diffs) => p.evaluate(([j, d]) => {
    localStorage.setItem('strat_trades', JSON.stringify(j));
    localStorage.removeItem('strat_set_aside_extras');
    return reconcilePlan(loadTrades(), d);
  }, [journal, diffs]);

  const DIFF9v6 = [{ symbol: SYM, date:'2026-05-04', broker:6, journal:9, kind:'too many' }];

  // ------------------------------------------------------------------
  console.log('--- his real 4 May row: 9 in the journal, 6 at Schwab ---');
  {
    // Six real contracts, plus a three-contract phantom with no fee: the
    // fee had already been drawn down and given to the real trade, which is
    // exactly how the four phantoms in his journal were found.
    const journal = [
      real('1', 3), real('2', 3),
      real('3', 3, { fees: null, pnlNet: null, fills: ['b1'] }),
    ];
    const r = await plan(journal, DIFF9v6);
    check(`it removes exactly the excess (${r.contracts} contracts)`, r.contracts === 3);
    check('one trade, not three', r.remove.length === 1);
    check('and it is the phantom, not a real one', r.remove[0] === '3');
    check('nothing is left over', r.days[0] && r.days[0].stillOver === 0);
    check('and it says why: ' + (r.days[0] && r.days[0].why[0]),
      !!r.days[0] && /not a purchase and a sale|no fee/.test(r.days[0].why[0]));
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- HIS RULE decides which one goes ---');
  {
    // Two identical-looking trades. One is a proper card -- one purchase,
    // one sale. The other cites three fills, which is not a card.
    const journal = [
      real('1', 3), real('2', 3),
      real('9', 3, { fills: ['b1','s1','s2'] }),
    ];
    const r = await plan(journal, DIFF9v6);
    check('the one that is not a purchase and a sale goes', r.remove[0] === '9');
    check('and the two proper cards stay', r.remove.length === 1);
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- it can NEVER take him below what Schwab charged him for ---');
  {
    // The only trade big enough to remove is bigger than the excess.
    // Removing it would take away contracts he really did buy, so it must
    // refuse rather than overshoot.
    const journal = [ real('1', 9, { fees: null }) ];
    const r = await plan(journal, DIFF9v6);
    check(`it removes nothing (${r.contracts} contracts)`, r.contracts === 0);
    check('rather than cutting into real trades', r.remove.length === 0);
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- a day that MATCHES is never touched ---');
  {
    const r = await plan([real('1', 3), real('2', 3)], []);
    check('no days to put right', r.days.length === 0);
    check('and nothing to remove', r.remove.length === 0);
    check('nothing threw', errors.length === 0);
  }
  {
    // Too FEW is the opposite problem and must not trigger a removal.
    const r = await plan([real('1', 3)],
      [{ symbol: SYM, date:'2026-05-04', broker:6, journal:3, kind:'too few' }]);
    check('too few never removes anything', r.remove.length === 0);
  }

  console.log('\n--- carrying it out sets them aside, never deletes ---');
  {
    const journal = [ real('1', 3), real('2', 3), real('3', 3, { fees: null, fills: ['b1'] }) ];
    const res = await p.evaluate(([j, d]) => {
      localStorage.setItem('strat_trades', JSON.stringify(j));
      localStorage.removeItem('strat_set_aside_extras');
      const pl = reconcilePlan(loadTrades(), d);
      const out = applyReconcilePlan(pl);
      return { out, left: loadTrades().length,
               aside: JSON.parse(localStorage.getItem('strat_set_aside_extras') || '[]') };
    }, [journal, DIFF9v6]);
    check('it reports what it did', res.out.ok === true && res.out.removed === 1);
    check(`two trades left (${res.left})`, res.left === 2);
    check(`and the third is set aside whole (${res.aside.length})`, res.aside.length === 1);
    check('with everything on it, so it can be put back',
      res.aside[0] && res.aside[0].id === '3' && res.aside[0].optEntry === 1);
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- and the button only exists when there is something to fix ---');
  {
    // The journal is set again HERE. The case above removed the phantom, so
    // reusing what it left means there is nothing to put right and a working
    // button looks broken. A harness that carries state between cases tests
    // the wrong thing -- twice on this project now.
    await p.evaluate((j) => localStorage.setItem('strat_trades', JSON.stringify(j)),
      [real('1', 3), real('2', 3), real('3', 3, { fees: null, fills: ['b1'] })]);
    const withFix = await p.evaluate((d) => renderBrokerCheck({
      everythingMatches:false, from:'2026-05-01', to:'2026-07-23',
      journal:{trades:3}, broker:{fills:6, beforeFloor:0, unpaired:0},
      outside:0, nonTrading:0, unreadable:0, feesUnknown:0, moneyComparable:true,
      money:{afterFees:{journal:0,broker:0,ok:true},beforeFees:{journal:0,broker:0,ok:true},fees:{journal:0,broker:0,ok:true}},
      contracts:{ok:false, journal:9, broker:6}, differences:d,
    }), DIFF9v6);
    check('it offers to put it right', /Put this right/.test(withFix));
    check('naming how many contracts he was never charged for', /3 contracts Schwab never charged you for/.test(withFix));
    check('showing its working first', /you have 9, Schwab charged you for 6/.test(withFix));
    check('and saying nothing is deleted', /set aside and can be put back/.test(withFix));

    const clean = await p.evaluate(() => renderBrokerCheck({
      everythingMatches:true, from:'2026-05-01', to:'2026-07-23',
      journal:{trades:2}, broker:{fills:4, beforeFloor:0, unpaired:0},
      outside:0, nonTrading:0, unreadable:0, feesUnknown:0, moneyComparable:true,
      money:{afterFees:{journal:0,broker:0,ok:true},beforeFees:{journal:0,broker:0,ok:true},fees:{journal:0,broker:0,ok:true}},
      contracts:{ok:true, journal:6, broker:6}, differences:[],
    }));
    check('and no button at all when it already matches', !/Put this right/.test(clean));
    check('nothing threw', errors.length === 0);
  }

  await ctx.close(); await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
