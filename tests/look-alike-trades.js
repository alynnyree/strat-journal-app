// STEP D of the audit's remediation (F2), authorized by the owner on
// 6 October 2026: "I authorize Step D implementation."
//
// Two genuine trades can look identical -- same contract, same minutes, same
// two prices, same size -- and still be two trades, because they are made of
// DIFFERENT broker fills. The import used to treat any arrival with the same
// SHAPE as a trade already in the journal, even when its fills were different,
// so the second one was folded into the first and lost. The audit traced 8 of
// his real trades lost that way (D2).
//
// Now a trade with a fill pair is recognised by that pair. A pair not in the
// journal is a new trade whatever its shape. The one guard: a new pair is
// refused if it would make a fill cover more contracts than it holds --
// which is what a re-matching of the same fills looks like. Consumption is
// each existing trade's own `contracts`, each distinct pair counted once, and
// the arrival's own contracts are included in the test.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const OCC = 'SPY   260609C00745000';
  let n = 0;
  // Every trade here has the SAME shape unless a case says otherwise.
  const T = (o) => Object.assign({
    id: 'id-' + (++n), ticker:'SPY', dir:'Long', occ: OCC,
    entryDate:'2026-06-09', entryTime:'09:31', exitDate:'2026-06-09', exitTime:'09:36',
    optEntry:1.11, optExit:1.22, contracts:1, contractsOpened:1, closeQuantity:1,
    pnlDollar:11, fees:1.33, pnlNet:9.67,
    winLoss:'Win', ftfc:{}, notes:'', source:'schwab-auto', settled:true, fillAttempts:1,
  }, o);
  const pairs = ts => ts.map(t => (t.fills || []).join('+')).sort();

  async function importInto(saved, arriving){
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [];
    const cleared = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/api/trades/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/pending*', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p.route('**/api/trades/pending/**', r => { cleared.push(r.request().url()); return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}); });
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url','https://fake.example.com');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, saved);
    await p.reload(); await p.waitForTimeout(1000);
    const out = await p.evaluate(async (pend) =>
      await autoImportPendingTrades('https://fake.example.com', pend), arriving);
    const stored = await p.evaluate(() => loadTrades());
    const refusals = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('strat_import_refusals') || '[]'); } catch(e){ return 'unreadable'; } });
    await p.close();
    return { out, stored, errors, cleared, refusals };
  }

  console.log('--- 1. a look-alike with different fills, arriving after its twin, is added ---');
  {
    const twin = T({ fills: ['buy-1', 'sell-1'] });
    const other = T({ fills: ['buy-2', 'sell-2'] });
    const r = await importInto([twin], [other]);
    check(`two trades (${r.stored.length})`, r.stored.length === 2);
    check('each keeps its own fills', JSON.stringify(pairs(r.stored)) === JSON.stringify(['buy-1+sell-1', 'buy-2+sell-2']));
    check('the queue item is cleared', r.cleared.length === 1);
  }

  console.log('\n--- 2. two look-alikes in one batch are both added ---');
  {
    const a = T({ fills: ['buy-3', 'sell-3'] });
    const c = T({ fills: ['buy-4', 'sell-4'] });
    const r = await importInto([], [a, c]);
    check(`both kept (${r.stored.length})`, r.stored.length === 2);
    check('both cleared from the queue', r.cleared.length === 2);
  }

  console.log('\n--- 3. the same pair arriving again refreshes, with no extra trade ---');
  {
    const saved = T({ fills: ['buy-5', 'sell-5'], fees: null, pnlNet: null, settled: false, notes: 'my note' });
    const again = T({ fills: ['buy-5', 'sell-5'], fees: 1.33, pnlNet: 9.67 });
    const r = await importInto([saved], [again]);
    check(`still one trade (${r.stored.length})`, r.stored.length === 1);
    check(`its missing fee is filled in (${r.stored[0] && r.stored[0].fees})`, r.stored[0] && r.stored[0].fees === 1.33);
    check('his note is untouched', r.stored[0] && r.stored[0].notes === 'my note');
  }

  console.log('\n--- 4. the same pair with a different shape is refused ---');
  {
    const saved = T({ fills: ['buy-6', 'sell-6'] });
    const phantom = T({ fills: ['buy-6', 'sell-6'], contracts: 2, contractsOpened: 2, closeQuantity: 2 });
    const r = await importInto([saved], [phantom]);
    check(`one trade (${r.stored.length})`, r.stored.length === 1);
    check('cleared from the queue', r.cleared.length === 1);
    check('and the refusal is recorded', Array.isArray(r.refusals) && r.refusals.length === 1);
  }

  console.log('\n--- 5. an over-capacity re-pairing is refused, recorded and cleared ---');
  {
    // A (1) and B (1) bought; C (1) and D (1) sold; saved as A+C and B+D.
    const ac = T({ fills: ['A', 'C'] });
    const bd = T({ fills: ['B', 'D'] });
    const ad = T({ fills: ['A', 'D'] });          // A: 1 + 1 > 1, D: 1 + 1 > 1
    const r = await importInto([ac, bd], [ad]);
    check(`still two trades (${r.stored.length})`, r.stored.length === 2);
    check('A+D is not in the journal', !pairs(r.stored).includes('A+D'));
    check('the refusal is recorded with its reason', Array.isArray(r.refusals) && r.refusals.length === 1
      && /more contracts than it holds/.test(JSON.stringify(r.refusals)));
    check('and it is cleared from the queue', r.cleared.length === 1);
  }

  console.log('\n--- 6. a partial close: one purchase of 2 sold in two 1-lot pieces, same shape ---');
  {
    const first = T({ fills: ['P2', 'S1'], contractsOpened: 2 });
    const second = T({ fills: ['P2', 'S2'], contractsOpened: 2 });   // P2: 1 + 1 = 2, not over 2
    const r = await importInto([first], [second]);
    check(`both kept (${r.stored.length})`, r.stored.length === 2);
    const third = T({ fills: ['P2', 'S3'], contractsOpened: 2 });    // P2: 2 + 1 = 3 > 2
    const r2 = await importInto([first, second], [third]);
    check(`a third piece the purchase cannot hold is refused (${r2.stored.length})`, r2.stored.length === 2);
  }

  console.log('\n--- 7. valid multi-purchase, single-sale allocation is retained ---');
  {
    // Purchases A (1) and B (1) closed by one sale S of 2.
    const aS = T({ fills: ['PA', 'S'], closeQuantity: 2 });
    const bS = T({ fills: ['PB', 'S'], closeQuantity: 2 });          // S: 1 + 1 = 2, not over 2
    const r = await importInto([aS], [bS]);
    check(`both kept (${r.stored.length})`, r.stored.length === 2);
    const cS = T({ fills: ['PC', 'S'], closeQuantity: 2 });          // S: 2 + 1 = 3 > 2
    const r2 = await importInto([aS, bS], [cS]);
    check(`a third claim on the sale is refused (${r2.stored.length})`, r2.stored.length === 2);
  }

  console.log('\n--- 8. duplicate saved copies do not cause a genuine arrival to be refused ---');
  {
    const dup1 = T({ fills: ['P8', 'S8a'], contractsOpened: 2 });
    const dup2 = T({ fills: ['P8', 'S8a'], contractsOpened: 2 });     // the same pair saved twice
    const fresh = T({ fills: ['P8', 'S8b'], contractsOpened: 2 });    // P8: 1 (counted once) + 1 = 2
    const r = await importInto([dup1, dup2], [fresh]);
    check(`the genuine second piece is added (${r.stored.length})`, r.stored.length === 3);
  }

  console.log('\n--- 9. a saved trade with no fill pair, same shape: the arrival refreshes it ---');
  {
    const old = T({ fills: undefined, fees: null, pnlNet: null, settled: false });
    delete old.fills;
    const arrival = T({ fills: ['buy-9', 'sell-9'] });
    const r = await importInto([old], [arrival]);
    check(`still one trade (${r.stored.length})`, r.stored.length === 1);
    check('its fee is filled in', r.stored[0] && r.stored[0].fees === 1.33);
  }

  console.log('\n--- 10. nothing threw in any case ---');
  {
    const r = await importInto([T({ fills: ['x1', 'y1'] })], [T({ fills: ['x2', 'y2'] })]);
    check(`no page errors (${r.errors.join(' | ') || 'none'})`, r.errors.length === 0);
  }

  await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
