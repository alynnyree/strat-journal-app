// AUDIT M-1 (plan v4, authorized by the owner 9 Oct 2026: "I authorize M-1
// implementation"), the app half.
//   C1 an arrival whose id is already in the journal with a DIFFERENT fill
//      pair is refused and recorded; both trades byte-identical; one entry.
//   C2 the same collision seen five times: still ONE entry, detections 5.
//   C3 the same against a Step E "T:" id.
//   C4 the same id with the SAME pair is the same trade arriving again: its
//      catch-up still lands (a skip on the id would stop every catch-up).
//   C5 a removal names its pair (?fills=open,close); a 409 from the service
//      (a different pair kept under that id) is recorded, nothing else.
//   C6 importing a new trade leaves every existing trade, and every field of
//      his data, byte-identical.
// Nothing here is on his screen: the record is the refusals list on the phone
// and a line behind Details.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser; const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : JSON.stringify(d).slice(0, 400)); } };
  const OCC = 'SPY   260609C00745000';
  const P_ID = OCC + '-09:31-09:36-p' + '3f9a1c2e7b4d6f8091a2b3c4d5e6f708';
  const T = (o) => Object.assign({ ticker:'SPY', dir:'Long', occ: OCC,
    entryDate:'2026-06-09', entryTime:'09:31', exitDate:'2026-06-09', exitTime:'09:36',
    optEntry:1.11, optExit:1.22, contracts:1, contractsOpened:1, closeQuantity:1,
    pnlDollar:11, fees:1.33, pnlNet:9.67, winLoss:'Win', ftfc:{}, notes:'', source:'schwab-auto', settled:true, fillAttempts:1 }, o);
  const own = { notes:'my note', userSet:{ notes:true }, chartDrawings:[{type:'hline',price:600}] };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  async function importInto(saved, rounds, { deleteAnswer } = {}){
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [], cleared = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/api/trades/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/pending*', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p.route('**/api/trades/pending/**', r => {
      cleared.push(decodeURIComponent(r.request().url()));
      const a = deleteAnswer || { status: 200, body: { ok: true } };
      return r.fulfill({ status: a.status, contentType:'application/json', body: JSON.stringify(a.body) });
    });
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => { localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})); localStorage.setItem('strat_backend_url','https://fake.example.com'); localStorage.setItem('strat_backfilled','1'); localStorage.setItem('strat_trades', JSON.stringify(ts)); }, saved);
    await p.reload(); await p.waitForTimeout(1000);
    const before = await p.evaluate(() => loadTrades());
    for (const arriving of rounds) await p.evaluate(async (pend) => await autoImportPendingTrades('https://fake.example.com', pend), arriving);
    const stored = await p.evaluate(() => loadTrades());
    const refusals = await p.evaluate(() => JSON.parse(localStorage.getItem('strat_import_refusals') || '[]'));
    const problems = await p.evaluate(() => { try { return JSON.stringify(localStorage); } catch (e) { return ''; } });
    await p.close();
    return { stored, before, errors, cleared, refusals, problems };
  }

  const A = ['118000000001', '118000000002'], B = ['118000000003', '118000000004'];

  console.log('--- C1. the same id, a different pair: refused, recorded, both unchanged ---');
  {
    const saved = [T(Object.assign({ id: P_ID, fills: A }, own))];
    const r = await importInto(saved, [[T({ id: P_ID, fills: B })]]);
    check('the journal is byte-identical (one trade, its id, its pair, his data)', same(r.stored, r.before) && r.stored.length === 1);
    const e = r.refusals[0] || {};
    check('one entry: kind id-collision, both pairs, detectedBy "app", detections 1',
      r.refusals.length === 1 && e.kind === 'id-collision' && same(e.pairs, [A.join('+'), B.join('+')].sort())
        && e.detectedBy === 'app' && e.detections === 1 && e.id === P_ID, r.refusals);
    check('its key is "id-collision:" + id + ":" + 64 hex', /^id-collision:.+:[0-9a-f]{64}$/.test(e.key || ''), e.key);
    check('the arrival is cleared from the queue by ITS OWN pair', r.cleared.length === 1 && r.cleared[0].endsWith('?fills=' + B.join(',')), r.cleared);
    check('no page errors', r.errors.length === 0, r.errors);
  }

  console.log('\n--- C2. the same collision five times: one entry, detections 5 ---');
  {
    const saved = [T(Object.assign({ id: P_ID, fills: A }, own))];
    const arrival = [T({ id: P_ID, fills: B })];
    const r = await importInto(saved, [arrival, arrival, arrival, arrival, arrival]);
    check('still one entry, detections 5, journal byte-identical',
      r.refusals.length === 1 && r.refusals[0].detections === 5 && same(r.stored, r.before), r.refusals);
  }

  console.log('\n--- C3. against a Step E "T:" id ---');
  {
    const TID = 'T:' + 'c'.repeat(32);
    const saved = [T(Object.assign({ id: TID, fills: A }, own)), T({ id: 'other', fills: ['118000000009', '118000000010'], entryTime: '10:00', exitTime: '10:05' })];
    const r = await importInto(saved, [[T({ id: TID, fills: B })]]);
    check('refused: both trades byte-identical, one entry naming the "T:" id',
      same(r.stored, r.before) && r.refusals.length === 1 && r.refusals[0].id === TID && r.refusals[0].kind === 'id-collision', r.refusals);
  }

  console.log('\n--- C4. the same id, the SAME pair, arriving with a fee the journal lacks: the catch-up lands ---');
  {
    const saved = [T(Object.assign({ id: P_ID, fills: A, fees: null, pnlNet: null, entryFees: null, exitFees: null, settled: false, fillAttempts: 0 }, own))];
    const r = await importInto(saved, [[T({ id: P_ID, fills: A, fees: 1.33, pnlNet: 9.67, entryFees: 0.66, exitFees: 0.67 })]]);
    check('still one trade, the same id', r.stored.length === 1 && r.stored[0].id === P_ID);
    check('the fee filled in (1.33) -- the id did not stop the catch-up', r.stored[0].fees === 1.33, r.stored[0]);
    check('his notes and drawings unchanged', same(r.stored[0].notes, own.notes) && same(r.stored[0].chartDrawings, own.chartDrawings));
    check('nothing refused', r.refusals.length === 0, r.refusals);
    check('cleared by its pair', r.cleared.length === 1 && r.cleared[0].endsWith('?fills=' + A.join(',')), r.cleared);
  }

  console.log('\n--- C5. the removal names its pair; a 409 is recorded, nothing else ---');
  {
    const saved = [T(Object.assign({ id: 'older-1', fills: ['118000000020', '118000000021'] }, own))];
    const arriving = T({ id: P_ID, fills: A, entryTime: '11:00', exitTime: '11:05', entryDate: '2026-06-10', exitDate: '2026-06-10' });
    const r = await importInto(saved, [[arriving]], { deleteAnswer: { status: 409, body: { error: 'kept', removed: 1, queuedPairs: [B] } } });
    check('the new trade is added (the journal holds it once)', r.stored.length === 2 && r.stored.filter(t => t.id === P_ID).length === 1);
    check('the removal carried ?fills=open,close', r.cleared.length === 1 && r.cleared[0].endsWith('?fills=' + A.join(',')), r.cleared);
    const e = r.refusals[0] || {};
    check('the 409 is recorded as ONE collision naming both pairs', r.refusals.length === 1 && e.kind === 'id-collision'
      && same(e.pairs, [A.join('+'), B.join('+')].sort()), r.refusals);
    check('nothing else cleared or retried', r.cleared.length === 1);
    check('no page errors', r.errors.length === 0, r.errors);
  }

  console.log('\n--- C6. a new trade arriving leaves every existing trade byte-identical ---');
  {
    const saved = [
      T(Object.assign({ id: 'T:' + 'd'.repeat(32), fills: ['118000000030', '118000000031'] }, own)),
      T({ id: OCC + '-09:31-09:36-ab1cd', fills: ['118000000032', '118000000033'], entryTime: '12:00', exitTime: '12:05', notes: 'keep' }),
      T({ id: 'manual-1', fills: [], source: 'manual', entryTime: '13:00', exitTime: '13:05', notes: 'typed by hand' }),
    ];
    const r = await importInto(saved, [[T({ id: P_ID, fills: A, entryDate: '2026-06-11', exitDate: '2026-06-11' })]]);
    const kept = r.stored.filter(t => t.id !== P_ID);
    check('three existing trades, byte-identical, ids included', kept.length === 3 && same(kept, r.before), kept.map(t => t.id));
    check('the new one added with its "p" id', r.stored.some(t => t.id === P_ID));
    check('no page errors', r.errors.length === 0, r.errors);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); site.close && site.close(); process.exit(fail ? 1 : 0);
})();
