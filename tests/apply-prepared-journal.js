// AUDIT STEP E, part E2: applying a prepared journal, and putting it back.
// Authorized by the owner on 7 October 2026 ("I authorize Step E
// implementation"); plan v7, accepted by the auditor. Synthetic trades only.
//
// The cases are the plan's E2 tests 1-6 and 7a-7r. Two pages in one browser
// context share storage and Web Locks exactly as two tabs do. "An older
// copy" is a page writing "strat_trades" directly with no lock, which is all
// the version before this one can do.
const crypto = require('crypto');
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : '-> ' + JSON.stringify(d).slice(0, 400)); } };

  // ---- The fingerprint and file format, as tools/stepE-prepare.js makes them --
  const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']'
    : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
    : JSON.stringify(v);
  const sha = s => crypto.createHash('sha256').update(s).digest('hex');
  const PICS = ['shotEntry', 'shotMid', 'shotExit'];
  const fp = trades => sha(canonical(trades.map(t => { const o = Object.assign({}, t); for (const f of PICS) if (f in o) o[f] = !!o[f]; return o; })
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0))));
  const cents = x => (x == null ? null : Math.round(Number(x) * 100));
  const totals = ts => ts.reduce((a, t) => ({ trades: a.trades + 1, contracts: a.contracts + (Number(t.contracts) || 0),
    grossCents: a.grossCents + (cents(t.pnlDollar) || 0), feeCents: a.feeCents + (cents(t.fees) || 0), netCents: a.netCents + (cents(t.pnlNet) || 0) }),
    { trades: 0, contracts: 0, grossCents: 0, feeCents: 0, netCents: 0 });
  const seal = body => Object.assign({}, body, { checksum: sha(canonical(body)) });
  const prepared = (R, P) => seal({ kind: 'strat-journal-stepE-prepared-v1', rule: 'fifo-v1', ownerDecision: 'test', engine: 'test',
    basedOn: fp(R), fingerprint: fp(P), range: { from: '2026-06-01' }, totals: totals(P), trades: P });
  const restoreFile = R => seal({ kind: 'strat-journal-stepE-restore-v1', fingerprint: fp(R), totals: totals(R), trades: R });

  let n = 0;
  const T = o => Object.assign({ id: 'id-' + (++n), ticker: 'SPY', dir: 'Long', occ: 'SPY   260609C00745000',
    entryDate: '2026-06-09', entryTime: '09:31', exitDate: '2026-06-09', exitTime: '09:36', optEntry: 1.11, optExit: 1.22,
    contracts: 1, contractsOpened: 1, closeQuantity: 1, pnlDollar: 11, fees: 1.32, pnlNet: 9.68, winLoss: 'Win',
    source: 'schwab-auto', settled: true, fillAttempts: 1, notes: '', ftfc: {} }, o);
  // R: the journal before. P: the prepared one (one kept, one removed, one added).
  const R0 = [T({ id: 'k1', fills: ['101', '102'], notes: 'keep me', shotEntry: 'kept' }), T({ id: 'gone', fills: ['csv|a', 'csv|b'], source: 'schwab-csv' })];
  const P0 = [T({ id: 'k1', fills: ['101', '102'], notes: 'keep me', shotEntry: 'kept', fees: 1.33, pnlNet: 9.67 }), T({ id: 'T:aaaaaaaaaaaaaaaaaaaaaaaa', fills: ['103', '104'] })];

  // A copy is ready once it holds its lock AND has settled which journal is
  // current (since the correction: read once from IndexedDB).
  const ready = (p, t = 20000) => p.waitForFunction(() => typeof journalLockState !== 'undefined' && journalLockState === 'shared'
    && typeof stepEState !== 'undefined' && stepEState.phase !== 'loading' && stepEState.phase !== 'waiting', null, { timeout: t });
  // ---- A fresh browser context per case (shared storage between its pages) --
  async function ctx(R, opts = {}){
    const c = await b.newContext({ viewport: { width: 390, height: 844 } });
    if(opts.init) await c.addInitScript(opts.init);
    const errors = [];
    const cleared = [];
    const open = async () => {
      const p = await c.newPage();
      p.on('pageerror', e => errors.push(e.message));
      await p.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
      await p.route('**/api/trades/pending*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"pending":[]}' }));
      await p.route('**/api/trades/pending/**', r => { cleared.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
      await p.route(u => u.pathname === '/health', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
      await p.goto(site.base + '/index.html');
      return p;
    };
    const p = await open();
    await p.evaluate(({ R, backend }) => {
      localStorage.setItem('strat_intro', JSON.stringify({ on: false, motion: false }));
      if(backend) localStorage.setItem('strat_backend_url', 'https://fake.example.com');
      localStorage.setItem('strat_backfilled', '1');
      if(R) localStorage.setItem('strat_trades', JSON.stringify(R));
    }, { R, backend: !!opts.backend });
    await p.reload(); await ready(p);
    return { c, p, open, errors, cleared, close: () => c.close() };
  }
  const state = p => p.evaluate(async () => ({
    stored: await readStepEStateFromStore().catch(() => 'unreadable'),
    phase: stepEState.phase,
    record: localStorage.getItem('strat_stepE_applied'),
    legacy: localStorage.getItem('strat_trades'),
    items: Object.keys(localStorage).filter(k => /^strat_trades_e\d+$/.test(k)).sort(),
    key: journalKey(),
    current: loadTrades(),
    problem: (readProblem('stepE') || {}).text || null,
  }));
  const apply = (p, file) => p.evaluate(f => applyPreparedJournal(f), file);
  const putBack = (p, file) => p.evaluate(f => putBackJournal(f || null), file || null);
  const RTEXT = JSON.stringify(R0);

  console.log('--- 1. applies only on a matching fingerprint ---');
  {
    const k = await ctx(R0);
    const out = await apply(k.p, prepared(R0, P0));
    const s = await state(k.p);
    check(`applied (${out.reason || 'ok'})`, out.ok === true, out);
    check('the record names a new item and the journal is the prepared one', s.key === 'strat_trades_e1' && fp(s.current) === fp(P0));
    check('"strat_trades" is untouched, exactly as before', s.legacy === RTEXT);
    await k.close();
    const k2 = await ctx(R0);
    await k2.p.evaluate(() => { const j = JSON.parse(localStorage.getItem('strat_trades')); j[0].notes = 'typed after the export'; localStorage.setItem('strat_trades', JSON.stringify(j)); });
    const out2 = await apply(k2.p, prepared(R0, P0));
    const s2 = await state(k2.p);
    check('a journal changed since the export is refused', out2.ok === false && /changed since the export/.test(out2.reason), out2);
    check('nothing written: no record, no new item, the journal unchanged', s2.stored === null && s2.record === null && s2.items.length === 0 && s2.current[0].notes === 'typed after the export');
    await k2.close();
  }

  console.log('\n--- 2. bad kind, checksum or totals are refused ---');
  {
    const good = prepared(R0, P0);
    const cases = {
      'wrong kind': Object.assign({}, good, { kind: 'something-else' }),
      'damaged (checksum)': Object.assign({}, good, { trades: good.trades.concat([T({ id: 'sneaked-in' })]) }),
      'totals that do not match': seal(Object.assign({}, (() => { const x = Object.assign({}, good); delete x.checksum; return x; })(), { totals: Object.assign({}, good.totals, { contracts: 999 }) })),
    };
    for(const [name, file] of Object.entries(cases)){
      const k = await ctx(R0);
      const out = await apply(k.p, file);
      const s = await state(k.p);
      check(`${name}: refused, nothing written`, out.ok === false && s.stored === null && s.record === null && s.items.length === 0 && s.legacy === RTEXT, out);
      await k.close();
    }
  }

  console.log('\n--- 3. pictures by id survive ---');
  {
    const R = [T({ id: 'pic', fills: ['201', '202'], shotEntry: 'kept', shotExit: 'data:image/png;base64,iVBORw0KGgo=' })];
    const P = [T({ id: 'pic', fills: ['201', '202'], shotEntry: 'kept', shotExit: 'kept', fees: 1.31, pnlNet: 9.69 })];
    const k = await ctx(R);
    await k.p.evaluate(() => putPicture('pic', 'entry', 'data:image/png;base64,ZW50cnk='));
    // The app may already have moved the inline picture into its store and
    // left a mark; whatever is stored just before the apply is what must stay.
    const storedBefore = (await state(k.p)).current[0];
    const out = await apply(k.p, prepared(R, P));
    const s = await state(k.p);
    const t = s.current[0];
    check('applied', out.ok === true, out);
    check(`each picture field keeps exactly the value stored on that trade (${storedBefore.shotEntry}, ${String(storedBefore.shotExit).slice(0, 12)})`,
      t && t.shotEntry === storedBefore.shotEntry && t.shotExit === storedBefore.shotExit && !!t.shotExit);
    const pic = await k.p.evaluate(async () => (await getPicture('pic', 'entry')).image);
    check('the picture itself is still in its store', pic === 'data:image/png;base64,ZW50cnk=');
    await k.close();
  }

  console.log('\n--- 4. put back returns the exact original ---');
  {
    const k = await ctx(R0);
    await apply(k.p, prepared(R0, P0));
    const out = await putBack(k.p);
    const s = await state(k.p);
    check(`put back (${out.reason || 'ok'})`, out.ok === true, out);
    check('the journal is exactly the one from before', fp(s.current) === fp(R0) && s.stored && s.stored.kind === 'put back');
    check('in a new item; "strat_trades" untouched; the replaced item kept, unused', s.key === 'strat_trades_e2' && s.legacy === RTEXT && s.items.join() === 'strat_trades_e1,strat_trades_e2');
    await k.close();
  }

  console.log('\n--- 5. an arrival after the apply ---');
  {
    const k = await ctx(R0, { backend: true });
    await apply(k.p, prepared(R0, P0));
    const same = T({ id: 'srv-1', fills: ['103', '104'], fees: 1.32, pnlNet: 9.68 });
    const other = T({ id: 'srv-2', fills: ['101', '104'], contracts: 1 });
    await k.p.evaluate(async (pend) => autoImportPendingTrades('https://fake.example.com', pend), [same, other]);
    const s = await state(k.p);
    check('the same pair refreshes; no extra trade', s.current.filter(t => (t.fills || []).join('+') === '103+104').length === 1);
    check('a different pair over a used fill is refused', !s.current.some(t => t.id === 'srv-2'));
    await k.close();
  }

  console.log('\n--- 6. no page errors; nothing new outside Details ---');
  {
    const k = await ctx(R0);
    const visible = await k.p.evaluate(() => [...document.querySelectorAll('button')].filter(x => /prepared journal|Put back/i.test(x.textContent) && x.offsetParent !== null).length);
    check('no new control is visible on any screen until Details is opened', visible === 0, visible);
    check('no page errors', k.errors.length === 0, k.errors);
    await k.close();
  }

  console.log('\n--- 7. concurrency ---');
  // a. a second copy of this version is open
  {
    const k = await ctx(R0);
    const p2 = await k.open();
    await p2.waitForFunction(() => journalLockState === 'shared');
    const out = await apply(k.p, prepared(R0, P0));
    const s = await state(k.p);
    check('7a. another copy open: refused before anything', out.ok === false && /open somewhere else/.test(out.reason), out);
    check('7a. nothing written; no record', s.stored === null && s.record === null && s.items.length === 0 && s.legacy === RTEXT);
    await k.close();
  }
  // b. an older copy writes after the fingerprint check, before the commit
  {
    const k = await ctx(R0);
    const older = JSON.stringify(R0.concat([T({ id: 'older-copy-trade', fills: ['301', '302'] })]));
    await k.p.evaluate(v => { window.__stepEHooks = { afterNewItem: () => localStorage.setItem('strat_trades', v) }; }, older);
    const out = await apply(k.p, prepared(R0, P0));
    const s = await state(k.p);
    check('7b. refused at the final check', out.ok === false && /Another copy of the app changed your journal/.test(out.reason), out);
    check('7b. no record; the new item removed; "strat_trades" is exactly the older copy\'s', s.stored === null && s.record === null && s.items.length === 0 && s.legacy === older);
    check('7b. the refusal is behind Details', /not applied/.test(s.problem || ''), s.problem);
    await k.close();
  }
  // c. the instant after the final check: the commit stands
  {
    const k = await ctx(R0);
    const older = JSON.stringify(R0.concat([T({ id: 'late', fills: ['311', '312'] })]));
    await k.p.evaluate(v => { window.__stepEHooks = { betweenCheckAndCommit: () => localStorage.setItem('strat_trades', v) }; }, older);
    const out = await apply(k.p, prepared(R0, P0));
    const s = await state(k.p);
    check('7c. the commit stands; the new journal is untouched', out.ok === true && fp(s.current) === fp(P0), out);
    check('7c. the older copy\'s write is kept in "strat_trades"', s.legacy === older);
    await k.close();
  }
  // d. an older copy writes after the apply completes
  {
    const k = await ctx(R0, { backend: true });
    await apply(k.p, prepared(R0, P0));
    const added = T({ id: 'from-older-copy', fills: ['401', '402'] });
    await k.p.evaluate(v => localStorage.setItem('strat_trades', v), JSON.stringify(R0.concat([added])));
    await k.p.evaluate(() => checkRetiredJournal());
    const s = await state(k.p);
    check('7d. reported', /older copy of the app changed the journal kept from before/.test(s.problem || ''), s.problem);
    check('7d. its genuine-pair trade is taken in by the usual rules', s.current.some(t => (t.fills || []).join('+') === '401+402'));
    check('7d. the rest of the new journal is untouched', s.current.some(t => t.id === 'k1' && t.fees === 1.33) && !s.current.some(t => t.id === 'gone'));
    await k.close();
  }
  // e. a collection during the apply
  {
    const k = await ctx(R0, { backend: true });
    const arrival = T({ id: 'srv-e', fills: ['501', '502'] });
    await k.p.evaluate(a => { window.__stepEHooks = { afterRead: async () => { window.__during = await autoImportPendingTrades('https://fake.example.com', [a]); } }; }, arrival);
    const out = await apply(k.p, prepared(R0, P0));
    const clearedDuring = k.cleared.length;
    let s = await state(k.p);
    check('7e. the apply completed', out.ok === true, out);
    check('7e. the collection during it saved nothing and cleared nothing on the server', !s.current.some(t => t.id === 'srv-e') && clearedDuring === 0, { clearedDuring });
    await k.p.evaluate(a => { window.__stepEHooks = null; return autoImportPendingTrades('https://fake.example.com', [a]); }, arrival);
    s = await state(k.p);
    check('7e. it arrives later, into the new journal', s.current.some(t => (t.fills || []).join('+') === '501+502') && k.cleared.length === 1);
    await k.close();
  }
  // f. no room for the second copy
  {
    const k = await ctx(R0);
    await k.p.evaluate(() => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, v){ if(/^strat_trades_e\d+$/.test(key)){ const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return real.call(this, key, v); };
    });
    const out = await apply(k.p, prepared(R0, P0));
    const s = await state(k.p);
    check('7f. no room: refused, nothing changed, no record', out.ok === false && /no room/.test(out.reason) && s.stored === null && s.record === null && s.legacy === RTEXT, out);
    await k.close();
  }
  // h. a copy opening during the apply waits, then reads the new journal
  {
    const k = await ctx(R0);
    await k.p.evaluate(() => { window.__stepEHooks = { afterRead: () => new Promise(r => { window.__go = r; }) }; });
    const running = k.p.evaluate(f => applyPreparedJournal(f), prepared(R0, P0));
    await k.p.waitForFunction(() => typeof window.__go === 'function');
    const p2 = await k.c.newPage();
    p2.on('pageerror', e => k.errors.push(e.message));
    await p2.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await p2.goto(site.base + '/index.html');
    await p2.waitForTimeout(800);
    const waiting = await p2.evaluate(() => journalLockState);
    check(`7h. the new copy waits at start-up (${waiting})`, waiting === 'waiting');
    await k.p.evaluate(() => window.__go());
    const out = await running;
    await p2.waitForFunction(() => journalLockState === 'shared', null, { timeout: 10000 });
    const its = await p2.evaluate(() => ({ key: journalKey(), ids: loadTrades().map(t => String(t.id)).sort() }));
    // Once started it runs its own catch-up, which may legitimately add
    // facts, so the test is WHICH journal it reads, not every byte of it.
    check(`7h. then it starts and reads the new journal (${its.key}: ${its.ids.join(', ')})`, out.ok === true && its.key === 'strat_trades_e1'
      && its.ids.join() === P0.map(t => String(t.id)).sort().join(), out);
    await k.close();
  }
  // s. found in testing: a copy starting the moment an update finishes may
  // not yet see the update's last save. It must never lose the new journal.
  // The apply is held until the new copy is waiting at start-up, so the new
  // copy starts the instant the update lets go -- the timing that failed.
  // (7l and 7m pin the same fault down deterministically: a journal item
  // with no record is never deleted.)
  {
    let lost = 0, runs = 0;
    for(let rep = 0; rep < 20; rep++){
      const k = await ctx(R0);
      await k.p.evaluate(() => { window.__stepEHooks = { afterRead: () => new Promise(r => { window.__go = r; }) }; });
      const running = k.p.evaluate(f => applyPreparedJournal(f), prepared(R0, P0));
      await k.p.waitForFunction(() => typeof window.__go === 'function');
      const p2 = await k.c.newPage();
      await p2.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
      await p2.goto(site.base + '/index.html');
      await p2.waitForFunction(() => typeof journalLockState !== 'undefined' && journalLockState === 'waiting');
      await k.p.evaluate(() => window.__go());
      const out = await running;
      await p2.waitForFunction(() => journalLockState === 'shared', null, { timeout: 15000 });
      await p2.waitForTimeout(300);
      const seen = await p2.evaluate(() => ({ key: journalKey(), items: Object.keys(localStorage).filter(x => /^strat_trades_e\d+$/.test(x)) }));
      runs++;
      if(!(out.ok && seen.key === 'strat_trades_e1' && seen.items.includes('strat_trades_e1'))) lost++;
      await k.close();
    }
    check(`7s. a copy starting as an update finishes never loses the new journal (${lost} of ${runs} lost)`, lost === 0);
  }
  // t. THE RACE, simulated deliberately (auditor's correction, 7 Oct 2026).
  // A copy starts right after a commit with a STALE view: localStorage shows
  // it neither the commit record's copy nor (at first) the new journal item.
  // The view is controlled by hiding those two entries from this one page's
  // reads, so the race happens every time rather than one run in ten.
  {
    const k = await ctx(R0);
    const out = await apply(k.p, prepared(R0, P0));
    const e1Before = await k.p.evaluate(() => localStorage.getItem('strat_trades_e1'));
    // an uncommitted leftover, which must never become current
    await k.p.evaluate(v => localStorage.setItem('strat_trades_e2', v), JSON.stringify([T({ id: 'never-current' })]));
    await k.p.close();
    const p2 = await k.c.newPage();
    p2.on('pageerror', e => k.errors.push(e.message));
    await p2.addInitScript(() => {
      window.__hideRecord = true; window.__hideItem = true;
      const get = Storage.prototype.getItem;
      Storage.prototype.getItem = function(key){
        if(window.__hideRecord && key === 'strat_stepE_applied') return null;
        if(window.__hideItem && key === 'strat_trades_e1') return null;
        return get.call(this, key);
      };
    });
    await p2.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await p2.goto(site.base + '/index.html');
    await p2.waitForTimeout(1500);
    const hidden = await p2.evaluate(() => ({ key: journalKey(), n: loadTrades().length, save: saveTrades([{ id: 'written-while-stale' }]),
      phase: typeof stepEState !== 'undefined' ? stepEState.phase : 'n/a', details: techText().split('\n').find(l => /^journal:/.test(l)) || '' }));
    check('7t. the commit itself succeeded', out.ok === true, out);
    check(`7t(1). a stale copy does not select "strat_trades" (${hidden.key})`, hidden.key !== 'strat_trades');
    check(`7t(4). it does not report the old journal as current (${hidden.n} trades shown)`, hidden.n === 0);
    check('7t(3). it does not write: the save is refused', hidden.save.ok === false);
    check(`7t(5). it is in a safe, stated state (${hidden.phase}; "${hidden.details}")`, hidden.phase === 'waiting' && /not settled yet/.test(hidden.details));
    const raw = await p2.evaluate(() => ({ e1: Storage.prototype.getItem.call(localStorage, 'strat_trades_e1'), legacy: Storage.prototype.getItem.call(localStorage, 'strat_trades') }));
    // read without the hiding, by a third page
    const p3 = await k.c.newPage();
    await p3.goto(site.base + '/privacy.html');
    const truth = await p3.evaluate(() => ({ e1: localStorage.getItem('strat_trades_e1'), legacy: localStorage.getItem('strat_trades') }));
    check('7t(2)(6). the new journal is not deleted or changed, and stays recoverable', truth.e1 === e1Before);
    check('7t. "strat_trades" was not written either', truth.legacy === RTEXT);
    // The transition becomes visible: the new item appears (the record's copy
    // stays hidden; nothing decides from it).
    await p2.evaluate(() => { window.__hideItem = false; });
    await ready(p2);
    const after = await p2.evaluate(() => ({ key: journalKey(), ids: loadTrades().map(t => String(t.id)).sort() }));
    check(`7t(7). once visible it resolves to the new journal (${after.key})`, after.key === 'strat_trades_e1' && after.ids.join() === P0.map(t => String(t.id)).sort().join());
    check('7t(8). the uncommitted leftover never became current', after.key !== 'strat_trades_e2' && !after.ids.includes('never-current'));
    await k.close();
  }
  // i. put back; the retired item changed -> the restore file
  {
    const k = await ctx(R0);
    await apply(k.p, prepared(R0, P0));
    await k.p.evaluate(() => localStorage.setItem('strat_trades', '[]'));      // an older copy emptied it
    const refused = await putBack(k.p);
    let s = await state(k.p);
    check('7i. retired item changed: put back from it refuses, pointing to the restore file', refused.ok === false && refused.needRestoreFile === true && s.key === 'strat_trades_e1', refused);
    const out = await putBack(k.p, restoreFile(R0));
    s = await state(k.p);
    check('7i. the restore file restores exactly the journal from before', out.ok === true && fp(s.current) === fp(R0) && s.key === 'strat_trades_e2', out);
    check('7i. "strat_trades" was not written by either', s.legacy === '[]');
    await k.close();
  }
  // j. throughout the apply and the put back, "strat_trades" receives no write
  {
    const k = await ctx(R0);
    await k.p.evaluate(() => {
      window.__legacyWrites = 0;
      const set = Storage.prototype.setItem, del = Storage.prototype.removeItem;
      Storage.prototype.setItem = function(key, v){ if(key === 'strat_trades') window.__legacyWrites++; return set.call(this, key, v); };
      Storage.prototype.removeItem = function(key){ if(key === 'strat_trades') window.__legacyWrites++; return del.call(this, key); };
    });
    const a = await apply(k.p, prepared(R0, P0));
    const pb = await putBack(k.p);
    const writes = await k.p.evaluate(() => window.__legacyWrites);
    check(`7j. no write at all to "strat_trades" (${writes})`, a.ok && pb.ok && writes === 0, { a, pb, writes });
    await k.close();
  }
  // k. the commit write fails
  {
    const k = await ctx(R0);
    // The commit is the IndexedDB transaction; make it fail.
    await k.p.evaluate(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(v, key){ if(this.name === 'state') throw new Error('refused'); return put.call(this, v, key); }; });
    const out = await apply(k.p, prepared(R0, P0));
    const s = await state(k.p);
    check('7k. refused, never reported as applied; no record; the journal as before; leftover removed',
      out.ok === false && !out.unconfirmed && s.stored === null && s.record === null && s.key === 'strat_trades' && fp(s.current) === fp(R0) && s.items.length === 0, { out, s: { stored: s.stored, record: s.record, items: s.items } });
    await k.close();
  }
  // l. interrupted after the new item was written (page closed before the commit)
  {
    const k = await ctx(R0);
    await k.p.evaluate(v => localStorage.setItem('strat_trades_e1', v), JSON.stringify(P0));
    await k.p.reload(); await ready(k.p);
    await k.p.waitForTimeout(300);
    const s = await state(k.p);
    check('7l. on reopening: the journal is "strat_trades", unchanged; no record', s.key === 'strat_trades' && s.legacy === RTEXT && s.stored === null && s.record === null);
    check('7l. the leftover is kept, never used, and the interruption is said behind Details', s.items.join() === 'strat_trades_e1' && /did not finish and was not applied/.test(s.problem || ''), s.problem);
    await k.close();
  }
  // m. nothing tries to delete a leftover (deleting is made to fail here)
  {
    const k = await ctx(R0, { init: () => { const del = Storage.prototype.removeItem; Storage.prototype.removeItem = function(key){ if(/^strat_trades_e\d+$/.test(key)) throw new Error('refused'); return del.call(this, key); }; } });
    await k.p.evaluate(v => localStorage.setItem('strat_trades_e1', v), JSON.stringify(P0));
    await k.p.reload(); await ready(k.p);
    await k.p.waitForTimeout(300);
    const s = await state(k.p);
    check('7m. the journal is still "strat_trades"; the leftover stays, reported, never current; no page errors',
      s.key === 'strat_trades' && fp(s.current) === fp(R0) && s.items.join() === 'strat_trades_e1' && /kept, never used/.test(s.problem || '') && k.errors.length === 0, s.problem);
    await k.close();
  }
  // n. a damaged, dangling or contradicted record
  for(const [name, setup, waitMs] of [
    ['malformed', p => p.evaluate(() => writeStepEStateToStore('not a record')), 0],
    ['naming an item that never appears', p => p.evaluate(() => writeStepEStateToStore({ item: 'strat_trades_e9', rFp: 'x', kind: 'apply' })), 16500],
    ['contradicted (a copy in localStorage, nothing in the store)', p => p.evaluate(() => localStorage.setItem('strat_stepE_applied', JSON.stringify({ item: 'strat_trades_e1', rFp: 'x' }))), 0],
  ]){
    const k = await ctx(R0);
    await setup(k.p);
    await k.p.reload();
    if(waitMs){
      await k.p.waitForTimeout(1500);
      const during = await k.p.evaluate(() => ({ key: journalKey(), n: loadTrades().length, save: saveTrades([{ id: 'x' }]).ok, phase: stepEState.phase }));
      check(`7n. ${name}: while waiting, it neither reads nor writes, and is never "strat_trades"`, during.key === null && during.n === 0 && during.save === false && during.phase === 'waiting', during);
      await k.p.waitForTimeout(waitMs);
    } else await k.p.waitForTimeout(1200);
    const s = await state(k.p);
    const saved = await k.p.evaluate(() => saveTrades([{ id: 'x' }]));
    await k.p.evaluate(() => renderAppStatus());
    const status = await k.p.evaluate(() => (document.getElementById('appStatus') || {}).textContent || '');
    check(`7n. ${name}: RECOVERY-REQUIRED, never silently "strat_trades"`, s.phase === 'damaged' && s.key === null && s.current.length === 0 && s.legacy === RTEXT, s.phase);
    check(`7n. ${name}: every writer refuses`, saved.ok === false && saved.blocked === true);
    check(`7n. ${name}: the Checks page says so`, /needs attention/.test(status), status);
    await k.close();
  }
  // o. the read-back after the commit fails
  {
    const k = await ctx(R0);
    // The commit completes; the read-back of it fails once.
    await k.p.evaluate(() => {
      const put = IDBObjectStore.prototype.put, get = IDBObjectStore.prototype.get;
      let committed = false;
      IDBObjectStore.prototype.put = function(v, key){ if(this.name === 'state') committed = true; return put.call(this, v, key); };
      IDBObjectStore.prototype.get = function(key){ if(committed && this.name === 'state' && !window.__readBackDone){ window.__readBackDone = true; throw new Error('unreadable'); } return get.call(this, key); };
    });
    const out = await apply(k.p, prepared(R0, P0));
    check('7o. "outcome not confirmed"', out.ok === false && out.unconfirmed === true && /could not be confirmed/.test(out.reason), out);
    await k.p.reload(); await ready(k.p);
    const s = await state(k.p);
    check('7o. on reopening, the stored record decides', s.key === 'strat_trades_e1' && fp(s.current) === fp(P0));
    await k.close();
  }
  // p. put back's commit write fails
  {
    const k = await ctx(R0);
    await apply(k.p, prepared(R0, P0));
    await k.p.evaluate(() => { const put = IDBObjectStore.prototype.put; window.__failOnce = true; IDBObjectStore.prototype.put = function(v, key){ if(this.name === 'state' && window.__failOnce){ window.__failOnce = false; throw new Error('refused'); } return put.call(this, v, key); }; });
    const first = await putBack(k.p);
    let s = await state(k.p);
    check('7p. still applied and unchanged; reported', first.ok === false && s.key === 'strat_trades_e1' && fp(s.current) === fp(P0), first);
    const second = await putBack(k.p);
    s = await state(k.p);
    check('7p. a second try succeeds', second.ok === true && fp(s.current) === fp(R0));
    await k.close();
  }
  // q. an older copy writes "strat_trades" during put back
  {
    const older = JSON.stringify([T({ id: 'older-q' })]);
    // (1) before put back reads it
    let k = await ctx(R0);
    await apply(k.p, prepared(R0, P0));
    await k.p.evaluate(v => localStorage.setItem('strat_trades', v), older);
    let out = await putBack(k.p);
    let s = await state(k.p);
    check('7q(1). changed before put back reads it: refused, points to the restore file, nothing written',
      out.ok === false && out.needRestoreFile === true && s.key === 'strat_trades_e1' && s.items.join() === 'strat_trades_e1', out);
    await k.close();
    for(const [label, hook] of [['(2) between the read and the commit', 'afterRead'], ['(3) immediately after the commit', 'afterCommit']]){
      k = await ctx(R0);
      await apply(k.p, prepared(R0, P0));
      await k.p.evaluate(({ v, hook }) => { window.__stepEHooks = { [hook]: () => localStorage.setItem('strat_trades', v) }; }, { v: older, hook });
      out = await putBack(k.p);
      await k.p.evaluate(() => { window.__stepEHooks = null; });
      s = await state(k.p);
      check(`7q${label}: the current journal is exactly R`, out.ok === true && fp(s.current) === fp(R0), out);
      check(`7q${label}: the older copy's text is untouched in "strat_trades" and never current`, s.legacy === older && s.key !== 'strat_trades');
      await k.p.evaluate(() => checkRetiredJournal());
      s = await state(k.p);
      check(`7q${label}: reported; still exactly R`, /older copy/.test(s.problem || '') && fp(s.current) === fp(R0), s.problem);
      await k.close();
    }
  }
  // r. lock lifetime
  {
    const k = await ctx(R0);
    await apply(k.p, prepared(R0, P0));
    const p2 = await k.open();
    await p2.waitForFunction(() => journalLockState === 'shared');
    const pb = await putBack(k.p);
    check('7r. a second copy open: put back refuses too', pb.ok === false && /open somewhere else/.test(pb.reason), pb);
    await k.close();
    const k2 = await ctx(R0);
    await k2.p.evaluate(() => { window.__stepEHooks = { beforeExclusive: () => new Promise(granted => {
      navigator.locks.request('strat-journal', { mode: 'shared' }, () => { granted(); return new Promise(() => {}); });
    }) }; });
    const out = await apply(k2.p, prepared(R0, P0));
    const s = await state(k2.p);
    check('7r. a copy arriving in the release-then-exclusive instant: refused rather than written', out.ok === false && /open somewhere else/.test(out.reason) && s.stored === null && s.record === null && s.items.length === 0, out);
    await k2.close();
  }

  await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASHED:', e); process.exit(1); });
