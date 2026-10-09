// AUDIT M-1 (plan v4, authorized by the owner 9 Oct 2026: "I authorize M-1
// implementation"): IF M-1 IS ROLLED BACK, the journal keeps one trade.
//
// After M-1 a trade arrives with an id made from its fill pair ("...-p" + 32
// hex). A rollback returns the service to its old matcher, which re-sends
// the SAME fill pair under a random id. This proves that the app recognises
// the trade by its fill pair (Step D, byPair) before its id matters, so:
//   R1 a random-id arrival of a pair already on file adds no trade, changes
//      no id and none of his data, and is cleared from the queue;
//   R2 a stale second copy (another random id, fee blank) changes nothing
//      either -- the known fee is not replaced by the blank one;
//   R3 the same pair re-paired to a different shape is refused and recorded.
// Each case runs with Schwab activityIds and with uncertain "U-" ids. This
// file passes on the app before M-1 (the code a rollback returns to) and on
// the app with M-1; both runs are in the M-1 report.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser; const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : JSON.stringify(d).slice(0, 300)); } };
  const OCC = 'SPY   260609C00745000';
  const P_ID = OCC + '-09:31-09:36-p' + '3f9a1c2e7b4d6f8091a2b3c4d5e6f708';
  const T = (o) => Object.assign({ ticker:'SPY', dir:'Long', occ: OCC,
    entryDate:'2026-06-09', entryTime:'09:31', exitDate:'2026-06-09', exitTime:'09:36',
    optEntry:1.11, optExit:1.22, contracts:1, contractsOpened:1, closeQuantity:1,
    pnlDollar:11, fees:1.33, pnlNet:9.67, winLoss:'Win', ftfc:{}, notes:'', source:'schwab-auto', settled:true, fillAttempts:1 }, o);
  async function importInto(saved, arriving){
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [], cleared = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/api/trades/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/pending*', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p.route('**/api/trades/pending/**', r => { cleared.push(decodeURIComponent(r.request().url())); return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}); });
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => { localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})); localStorage.setItem('strat_backend_url','https://fake.example.com'); localStorage.setItem('strat_backfilled','1'); localStorage.setItem('strat_trades', JSON.stringify(ts)); }, saved);
    await p.reload(); await p.waitForTimeout(1000);
    const before = await p.evaluate(() => JSON.stringify(loadTrades()));
    const out = await p.evaluate(async (pend) => await autoImportPendingTrades('https://fake.example.com', pend), arriving);
    const stored = await p.evaluate(() => loadTrades());
    const refusals = await p.evaluate(() => JSON.parse(localStorage.getItem('strat_import_refusals') || '[]'));
    await p.close();
    return { out, stored, before: JSON.parse(before), errors, cleared, refusals };
  }
  // What a catch-up may add to a trade it recognises (refreshTradeFacts);
  // anything else changing is a failure.
  const CATCHUP = new Set(['fillAttempts', 'settled', 'replayMissingReason', 'replayData', 'lastRefreshAt', 'closeQuantity', 'contractsOpened']);
  const changedKeys = (a, b) => [...new Set(Object.keys(a || {}).concat(Object.keys(b || {})))]
    .filter(k => JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k]));
  const own = { notes:'my note', userSet:{ notes:true }, chartDrawings:[{type:'hline',price:600}] };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const [name, fills] of [['activityId fills', ['118000000001','118000000002']], ['uncertain U- fills', ['U-' + 'a'.repeat(32), 'U-' + 'b'.repeat(32)]]]) {
    console.log(`\n--- R1 (${name}): journal holds a "p" id; old matcher re-sends the same pair with a random id ---`);
    const saved = [T(Object.assign({ id: P_ID, fills }, own))];
    const r = await importInto(saved, [T({ id: OCC + '-09:31-09:36-k3j9x', fills })]);
    check('no duplicate: still one trade', r.stored.length === 1, r.stored.map(t => t.id));
    check('the existing "p" id is unchanged', r.stored[0] && r.stored[0].id === P_ID);
    check('his notes, userSet and drawings are unchanged', r.stored[0] && same(r.stored[0].notes, own.notes) && same(r.stored[0].userSet, own.userSet) && same(r.stored[0].chartDrawings, own.chartDrawings));
    const k1 = changedKeys(r.before[0], r.stored[0]);
    check(`the stored trade is byte-identical except catch-up fields (changed: ${k1.join(',') || 'nothing'})`, k1.every(k => CATCHUP.has(k)), k1);
    check('the arrival is cleared from the queue', r.cleared.length === 1 && r.cleared[0].includes('k3j9x'), r.cleared);
    check('no page errors', r.errors.length === 0, r.errors);

    console.log(`--- R2 (${name}): the queue also holds a STALE copy (another random id), and the catch-up copy is missing nothing ---`);
    const r2 = await importInto(saved, [T({ id: OCC + '-09:31-09:36-z1x2c', fills }), T({ id: OCC + '-09:31-09:36-q8w7e', fills, fees: null, pnlNet: null })]);
    check('still one trade', r2.stored.length === 1, r2.stored.map(t => t.id));
    check('id and his data unchanged; known fee not replaced by the blank copy', r2.stored[0].id === P_ID && r2.stored[0].fees === 1.33 && same(r2.stored[0].notes, own.notes) && same(r2.stored[0].chartDrawings, own.chartDrawings));
    const k2 = changedKeys(r2.before[0], r2.stored[0]);
    check(`byte-identical except catch-up fields (changed: ${k2.join(',') || 'nothing'})`, k2.every(k => CATCHUP.has(k)), k2);
    check('both copies cleared', r2.cleared.length === 2, r2.cleared);
    check('no page errors', r2.errors.length === 0, r2.errors);

    console.log(`--- R3 (${name}): the same pair re-paired to a DIFFERENT shape is refused and recorded ---`);
    const r3 = await importInto(saved, [T({ id: OCC + '-09:31-09:36-m4n5b', fills, contracts: 2, pnlDollar: 22 })]);
    check('still one trade, byte-identical', r3.stored.length === 1 && same(r3.stored, r3.before));
    const ref = r3.refusals[0] || {};
    check('one refusal, naming the arrival, its fills and the reason',
      r3.refusals.length === 1 && same(ref.fills, fills) && /x2 \[/.test(ref.what || '')
        && /already in your journal as a trade of a different shape -- the same fills paired up twice/.test(ref.reason || ''), r3.refusals);
    check('no page errors', r3.errors.length === 0, r3.errors);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); site.close && site.close(); process.exit(fail ? 1 : 0);
})();
