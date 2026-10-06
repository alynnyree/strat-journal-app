// STEP A of the audit's remediation (F5), authorized by the owner on
// 6 October 2026: "I authorize Step A implementation."
//
// Two controls could take trades out of his journal by how they LOOK:
// "Check for Duplicate Trades" -> "Remove the N extra copies" (a permanent
// delete), and "Put this right" after a Schwab-file comparison. Look-alike
// trades can be genuine -- the audit found 8 real ones lost that way -- so
// both are switched off until the journal is rebuilt from his broker's own
// records (Step E).
//
// The rule this checks, as the auditor wrote it: no user-facing handler or
// reachable path may cause saveTrades() to run as part of either path; the
// controls are gone, and the two actions refuse on their own so an old page
// still showing a button cannot use it.
const fs = require('fs');
const path = require('path');
const { launch, serve } = require('./browser.js');

(async () => {
  let pass = 0, fail = 0;
  const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  // ---- No handler anywhere in the page names either path ---------------
  // Read straight from the file, so a button added in any template string
  // is caught, not only the ones drawn on first load.
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const NAMES = 'removeDuplicateTrades|putItRight|applyReconcilePlan|findDuplicateTrades';
    const inHandler = src.match(new RegExp(`\\bon[a-z]+\\s*=\\s*["'\`][^"'\`]*\\b(${NAMES})\\b`, 'g')) || [];
    check(`no on-tap handler names either path (found ${inHandler.length})`, inHandler.length === 0);
    const inListener = src.match(new RegExp(`addEventListener\\([^)]*\\b(${NAMES})\\b`, 'g')) || [];
    check(`no event listener names either path (found ${inListener.length})`, inListener.length === 0);
    // applyReconcilePlan is the one that writes. Its only caller left in the
    // app is putItRight, which refuses before reaching it.
    const calls = (src.match(/\bapplyReconcilePlan\(/g) || []).length;
    check(`applyReconcilePlan is defined once and called only from putItRight (${calls} mentions)`, calls === 2);
  }

  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
  const b = started.browser;
  const site = await serve();

  const OCC = 'SPY   260504C00723000';
  const SYM = 'SPY 05/04/2026 723.00 C';
  // Two trades with the same contract, minutes, prices and size, but
  // DIFFERENT broker fills: exactly the genuine look-alike the shape check
  // cannot tell apart. Plus one more on the same day.
  const trade = (id, fills) => ({
    id, ticker:'SPY', dir:'Long', entryDate:'2026-05-04', entryTime:'09:31',
    exitDate:'2026-05-04', exitTime:'09:45', optEntry:1.00, optExit:1.10, contracts:3,
    occ: OCC, fills, fees:1.32, pnlDollar:30, pnlNet:28.68, winLoss:'Win',
    source:'schwab-auto', settled:true,
  });
  const JOURNAL = [ trade('1', ['b1','s1']), trade('2', ['b2','s2']), trade('3', ['b3','s3']) ];
  const ASIDE = [ Object.assign(trade('old'), { fills:['bo','so'] }) ];

  const ctx = await b.newContext({ viewport:{ width:390, height:844 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
    : r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' }));
  await p.goto(site.base + '/index.html');
  await p.evaluate(([j, a]) => {
    localStorage.setItem('strat_intro', JSON.stringify({ on:false, motion:false }));
    localStorage.setItem('strat_trades', JSON.stringify(j));
    localStorage.setItem('strat_set_aside_extras', JSON.stringify(a));
  }, [JOURNAL, ASIDE]);
  await p.reload(); await p.waitForTimeout(800);

  // Every call to saveTrades is counted from here on.
  await p.evaluate(() => {
    window.__saves = 0;
    const real = saveTrades;
    saveTrades = function(){ window.__saves++; return real.apply(this, arguments); };
  });
  const stored = () => p.evaluate(() => ({
    trades: JSON.parse(localStorage.getItem('strat_trades') || 'null'),
    aside: JSON.parse(localStorage.getItem('strat_set_aside_extras') || 'null'),
    saves: window.__saves,
  }));

  console.log('--- the controls are gone ---');
  {
    const buttons = await p.evaluate(() => [...document.querySelectorAll('button')].map(x => x.textContent.trim()));
    check('no "Check for Duplicate Trades" button', !buttons.some(t => /Check for Duplicate Trades/i.test(t)));
    check('no "Remove the N extra copies" button', !buttons.some(t => /extra cop(y|ies)/i.test(t)));
    check('no "Put this right" button on the page', !buttons.some(t => /Put this right/i.test(t)));
    check('Export and Erase are still there',
      buttons.some(t => /Export All Trades/i.test(t)) && buttons.some(t => /Erase All Trades/i.test(t)));
  }

  console.log('\n--- the Schwab-file comparison still shows a mismatch, but offers no removal ---');
  {
    const html = await p.evaluate(() => renderBrokerCheck({
      everythingMatches:false, from:'2026-05-01', to:'2026-07-23',
      journal:{trades:3}, broker:{fills:4, beforeFloor:0, unpaired:0},
      outside:0, nonTrading:0, unreadable:0, feesUnknown:0, moneyComparable:true,
      money:{afterFees:{journal:0,broker:0,ok:true},beforeFees:{journal:0,broker:0,ok:true},fees:{journal:0,broker:0,ok:true}},
      contracts:{ok:false, journal:9, broker:6},
      differences:[{ symbol:'SPY 05/04/2026 723.00 C', date:'2026-05-04', broker:6, journal:9, kind:'too many' }],
    }));
    check('the mismatched day is still shown', /Days that do not match/.test(html) && /SPY 05\/04\/2026 723\.00 C/.test(html));
    check('no "Put this right" is offered', !/Put this right/.test(html));
  }

  console.log('\n--- an old page still showing a button cannot use it ---');
  {
    const before = await stored();
    // As the old duplicate check would have left it: one look-alike marked
    // for removal.
    const msg1 = await p.evaluate(() => {
      pendingDupeRemoval = { dupeGroups:[], keep:new Set(['1']), dropIds:new Set(['2']), removing:1 };
      removeDuplicateTrades();
      const el = document.getElementById('syncStatus');
      return el ? el.textContent : '';
    });
    const mid = await stored();
    check('removeDuplicateTrades: saveTrades never ran', mid.saves === 0);
    check('removeDuplicateTrades: the journal is unchanged', JSON.stringify(mid.trades) === JSON.stringify(before.trades));
    check('removeDuplicateTrades: the set-aside list is unchanged', JSON.stringify(mid.aside) === JSON.stringify(before.aside));
    check(`removeDuplicateTrades: it says so ("${msg1}")`, /turned off for now\. Nothing was changed/i.test(msg1));

    // As the old comparison would have left it: a plan naming a trade.
    const msg2 = await p.evaluate(() => {
      lastReconcilePlan = { remove:['3'], contracts:3, days:[] };
      putItRight();
      const el = document.getElementById('syncStatus');
      return el ? el.textContent : '';
    });
    const after = await stored();
    check('putItRight: saveTrades never ran', after.saves === 0);
    check('putItRight: the journal is unchanged', JSON.stringify(after.trades) === JSON.stringify(before.trades));
    check('putItRight: the set-aside list is unchanged', JSON.stringify(after.aside) === JSON.stringify(before.aside));
    check(`putItRight: it says so ("${msg2}")`, /turned off for now\. Nothing was changed/i.test(msg2));
    check('all three trades are still in the journal', after.trades && after.trades.length === 3);
  }

  check(`nothing on the page threw (${errors.join(' | ') || 'none'})`, errors.length === 0);

  await ctx.close(); await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
