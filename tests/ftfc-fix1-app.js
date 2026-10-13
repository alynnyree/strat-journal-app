// FTFC Fix 1, the app half (13 Oct 2026; owner: "I authorize FTFC Fix 1
// implementation"). Consolidated spec sections C to G, and the four boundary
// checks in the auditor's pass note on plan v14. Runs the REAL app in a real
// browser. Every trade here is invented; none of his data is in this project.
//
// The readings it feeds in were produced by the SERVICE's own reading code
// (tests/vectors/ftfc-fix1-vectors.json, the same file in both projects), so
// a reading the service would send is exactly what is checked here.
const fs = require('fs');
const path = require('path');
const { launch, serve } = require('./browser.js');

const VEC = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors', 'ftfc-fix1-vectors.json'), 'utf8'));
const V = VEC.version;
const TF = ['6M','3M','1M','1W','1D','4H','2H','1H','30m','15m','5m','3m','1m'];
const clone = x => JSON.parse(JSON.stringify(x));
const vec = name => { const v = VEC.readings.find(r => r.name === name); if(!v) throw new Error('no vector ' + name); return clone(v); };
const FULL = vec('complete, exact print');
const ENTRY = FULL.entryMs;
const COMPLETE = FULL.reading;
// An incomplete but VALID reading: the complete one with these timeframes not
// in the data (the Alpaca free-plan shape).
function partial(missing, base = COMPLETE, flip = {}){
  const r = clone(base);
  for(const [tf, s] of Object.entries(flip)){ r.status[tf] = s; if(s === 'bull' || s === 'bear') r.grid[tf] = s; else delete r.grid[tf]; }
  for(const tf of missing){ r.status[tf] = 'missing'; r.missing[tf] = 'data did not contain this bar'; delete r.grid[tf]; }
  r.complete = !TF.some(tf => r.status[tf] === 'missing');
  if(!r.complete) Object.assign(r, { run: null, confirmed: null, direction: null, timeframesInRun: [] });
  return r;
}
const P6 = partial(['1H','30m','15m','5m','3m','1m']);      // 6M..2H measured: a screen recount would say "agreed"
const P3 = partial(['5m','3m','1m']);                       // a strict superset of P6
const P3_CONFLICT = partial(['5m','3m','1m'], COMPLETE, { '4H': 'bear' });
const P4 = partial(['15m','5m','3m','1m']);

const O = '7001', C = '7002';
const att = (seq, reading, v = V) => ({ seq, version: v, open: O, close: C, outcome: 'reading', reading });
const intr = (seq, v = V) => ({ seq, version: v, open: O, close: C, outcome: 'interrupted', reason: 'the service stopped during this attempt' });
const env = (kind, attempts, finalCode, over = {}) => Object.assign({ version: V, open: O, close: C, kind,
  highestSeq: attempts[attempts.length - 1].seq }, kind === 'final' ? { finalCode } : {}, { attempts }, over);
const live = e => ({ ftfcProtocol: 1, ftfcOrigin: 'live', ftfcEnvelope: e });
const hist = e => ({ ftfcProtocol: 1, ftfcOrigin: 'history', ftfcEnvelope: e });

const NONE_FTFC = { ftfc: {}, ftfcRun: null, ftfcConfirmed: null, ftfcDirection: null, ftfcTimeframesInRun: [] };
const base = (o = {}) => Object.assign({
  id: 900001, ticker: 'SPY', dir: 'Long', occ: 'SPY   261009C00570000',
  entryDate: '2026-10-09', entryTime: '10:31', exitDate: '2026-10-09', exitTime: '10:52',
  entryTimestamp: ENTRY, exitTimestamp: ENTRY + 21 * 60000,
  optEntry: 1.25, optExit: 1.80, contracts: 2, contractsOpened: 2,
  pnlDollar: 110, pnlPercent: 44, winLoss: 'Win', fees: 2.64, entryFees: 1.32, exitFees: 1.32, pnlNet: 107.36,
  undEntry: 570.1, undExit: 571.2, undEntrySource: 'alpaca-trade', undExitSource: 'alpaca-trade', undEntryExact: true, undExitExact: true, undPricedWithAlpaca: true,
  strat: '2-1-2 Continuation', play: 'FTFC Direction Play', notes: 'His own note', stop: 569.5,
  fills: [O, C], source: 'schwab-auto', fillStatus: 'Closed', settled: true, fillAttempts: 1,
}, NONE_FTFC, o);
// An arrival from the service: same trade, carrying a DIFFERENT legacy grid,
// to prove a marked arrival's legacy FTFC fields are never copied.
const arrival = (extra = {}, o = {}) => Object.assign({
  id: 'SPY-' + O + '-' + C, ticker: 'SPY', dir: 'Long', occ: 'SPY   261009C00570000',
  entryDate: '2026-10-09', entryTime: '10:31', exitDate: '2026-10-09', exitTime: '10:52',
  entryTimestamp: ENTRY, exitTimestamp: ENTRY + 21 * 60000,
  optEntry: 1.25, optExit: 1.80, contracts: 2, contractsOpened: 2,
  pnlDollar: 110, pnlPercent: 44, winLoss: 'Win', fees: 2.64, entryFees: 1.32, exitFees: 1.32, pnlNet: 107.36,
  undEntry: 570.1, undExit: 571.2, undEntrySource: 'alpaca-trade', undExitSource: 'alpaca-trade', undEntryExact: true, undExitExact: true,
  ftfc: { '1D': 'bear', '4H': 'bear', '2H': 'bear', '1H': 'bear' }, ftfcRun: 4, ftfcConfirmed: true, ftfcDirection: 'bear',
  ftfcTimeframesInRun: ['1D','4H','2H','1H'], ftfcVersion: V, ftfcPriceAtEntry: 1,
  fills: [O, C], source: 'schwab-auto', idBasis: 'fill-pair',
}, extra, o);
const FIX1_KEYS = ['ftfc','ftfcRun','ftfcConfirmed','ftfcDirection','ftfcTimeframesInRun','ftfcVersion','ftfcPriceAtEntry',
  'ftfcStatus','ftfcMissing','ftfcComplete','ftfcPriceSource','ftfcPriceTime','ftfcDiagnostics',
  'ftfcCycleVersion','ftfcReadingSeq','ftfcSeqSeen','ftfcFinal','ftfcFinalCode','userSet'];
const ftfcOf = t => Object.fromEntries(FIX1_KEYS.filter(k => Object.prototype.hasOwnProperty.call(t, k)).map(k => [k, t[k]]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : JSON.stringify(d).slice(0, 400)); } };

  // A fresh browser per case group, so no case can see another's storage.
  async function page(journal, routes = {}){
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const errors = [], asked = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => d.dismiss().catch(() => {}));
    await p.route('**/api/**', r => { asked.push(r.request().method() + ' ' + r.request().url().replace(/^https:\/\/fake\.example\.com/, '')); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await p.route('**/api/trades/pending*', r => { asked.push(r.request().method() + ' ' + r.request().url().replace(/^https:\/\/fake\.example\.com/, ''));
      const f = routes.pending; return f ? f(r) : r.fulfill({ status: 200, contentType: 'application/json', body: '{"pending":[]}' }); });
    await p.route('**/api/ftfc/updates*', r => { asked.push(r.request().method() + ' ' + r.request().url().replace(/^https:\/\/fake\.example\.com/, ''));
      const f = routes.updates; return f ? f(r) : r.fulfill({ status: 200, contentType: 'application/json', body: '{"updates":[],"waiting":0}' }); });
    await p.route(u => u.pathname === '/health', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ftfcRuleVersion: V }) }));
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({ on: false, motion: false }));
      localStorage.setItem('strat_backend_url', 'https://fake.example.com');
      localStorage.setItem('strat_backfilled', '1');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, journal);
    await p.reload(); await p.waitForTimeout(1200);
    asked.length = 0;
    return { p, ctx, errors, asked };
  }
  const read = p => p.evaluate(() => loadTrades());
  // One pure fold, applied to a copy, with everything a reader would ask.
  const F = (p, trade, item, appV) => p.evaluate(([t, i, a]) => {
    const c = JSON.parse(JSON.stringify(t));
    const r = ftfcFold(c, i, a || FTFC_RULE_VERSION);
    if(r.fields) ftfcWrite(c, r.fields);
    return { outcome: r.outcome, reason: r.reason, after: c, state: ftfcStateOf(c), unknown: isFtfcUnknown(c), align: alignmentOf(c) };
  }, [trade, item, appV || 0]);
  const diag = p => p.evaluate(() => JSON.parse(localStorage.getItem('strat_ftfc_diag') || '[]'));

  // ===================== PURE: states, checks, fold =====================
  const { p, ctx, errors } = await page([]);

  console.log('--- D. every trade is in exactly one state; anything else fails closed ---');
  {
    const S = t => p.evaluate(x => ftfcStateOf(x), t);
    check('NONE: no reading, no Fix-1 fields', await S(base()) === 'NONE');
    check('NONE also for an empty legacy reading (run 0, empty grid)', await S(base({ ftfcRun: 0 })) === 'NONE');
    check('LEGACY: a reading, no Fix-1 fields', await S(base({ ftfc: { '1D': 'bull' }, ftfcRun: 1 })) === 'LEGACY');
    check('HAND: userSet.ftfc and no Fix-1 fields', await S(base({ userSet: { ftfc: true }, ftfc: { '1D': 'bull' }, ftfcRun: 1 })) === 'HAND');
    check('HAND with Fix-1 metadata is INCONSISTENT', await S(base({ userSet: { ftfc: true }, ftfcCycleVersion: V, ftfcFinal: false })) === 'INCONSISTENT');
    check('PENDING: a cycle, no reading', await S(base({ ftfcCycleVersion: V, ftfcSeqSeen: 0, ftfcFinal: false })) === 'PENDING');
    const act = (await F(p, base(), live(env('retry', [att(0, P6)])))).after;
    check('ACTIVE after a first reading', await S(act) === 'ACTIVE');
    check('ENDED: final true with a code', await S(Object.assign(clone(act), { ftfcFinal: true, ftfcFinalCode: 'EXHAUSTED_READING' })) === 'ENDED');
    check('INCONSISTENT: final true without a code', await S(Object.assign(clone(act), { ftfcFinal: true })) === 'INCONSISTENT');
    check('INCONSISTENT: a code without final', await S(Object.assign(clone(act), { ftfcFinalCode: 'SUPERSEDED' })) === 'INCONSISTENT');
    check('INCONSISTENT: readingSeq above seqSeen', await S(Object.assign(clone(act), { ftfcReadingSeq: 2, ftfcSeqSeen: 1 })) === 'INCONSISTENT');
    check('INCONSISTENT: cycle version unlike the reading version', await S(Object.assign(clone(act), { ftfcCycleVersion: V + 1 })) === 'INCONSISTENT');
    check('INCONSISTENT: reading fields without a cycle version', await S(Object.assign(clone(act), { ftfcCycleVersion: undefined })) === 'INCONSISTENT');
    check('INCONSISTENT: seqSeen out of range', await S(Object.assign(clone(act), { ftfcSeqSeen: 4 })) === 'INCONSISTENT');
  }

  console.log('\n--- C4. the app accepts exactly the readings the service produces, and recomputes the verdict ---');
  {
    const probs = await p.evaluate(rs => rs.map(x => ({ name: x.name, p: ftfcReadingProblems(x.reading, x.entryMs) })), VEC.readings);
    check(`all ${probs.length} service readings pass the app's checks`, probs.every(x => x.p.length === 0), probs.filter(x => x.p.length));
    const vv = await p.evaluate(vs => vs.filter(v => { const a = computeFtfcRun(v.grid);
      return a.runLength !== v.runLength || a.confirmed !== v.confirmed || (a.direction ?? null) !== (v.direction ?? null) || JSON.stringify(a.timeframesInRun) !== JSON.stringify(v.timeframesInRun); }).length, VEC.verdicts);
    check(`the app's verdict equals the service's on all ${VEC.verdicts.length} shared vectors`, vv === 0, vv);
    const mut = (f, r = COMPLETE) => p.evaluate(([x, e]) => ftfcReadingProblems(x, e), [(() => { const c = clone(r); f(c); return c; })(), ENTRY]);
    const caught = async (label, f, r) => { const pr = await mut(f, r); check(label + ' is caught', pr.length > 0, pr); };
    await caught('a missing status', r => { delete r.status['1H']; });
    await caught('an unknown status ("by-design")', r => { r.status['1H'] = 'by-design'; });
    await caught('complete=true with a missing timeframe', r => { r.status['1H'] = 'missing'; r.missing['1H'] = 'data did not contain this bar'; delete r.grid['1H']; });
    await caught('a missing timeframe with no reason', r => { r.status['1H'] = 'missing'; r.complete = false; r.run = r.confirmed = r.direction = null; r.timeframesInRun = []; delete r.grid['1H']; });
    await caught('a reason for a measured timeframe', r => { r.missing['1H'] = 'x'; });
    await caught('an incomplete reading with a verdict', r => { r.status['1H'] = 'missing'; r.complete = false; r.missing['1H'] = 'data did not contain this bar'; delete r.grid['1H']; });
    await caught('a verdict unlike the app\'s own recount', r => { r.run = 4; });
    await caught('a direction unlike the app\'s own recount', r => { r.direction = 'bear'; });
    await caught('a grid unlike the statuses', r => { r.grid['1H'] = 'bear'; });
    await caught('a complete reading without a price', r => { r.priceAtEntry = r.priceSource = r.priceTime = null; });
    await caught('an exact print outside the entry second', r => { r.priceTime = ENTRY - 5000; });
    await caught('a prior minute that is not the minute before', r => { r.priceSource = 'prior-minute-close'; r.priceTime = ENTRY - 120000; });
    await caught('a daily-close price source (the hindsight fallback)', r => { r.priceSource = 'daily-close'; });
    await caught('"no price at entry" while a price exists', r => { r.status['1D'] = 'missing'; r.missing['1D'] = 'no price at entry'; }, P6);
    await caught('"before the session" for an entry that was not', r => { r.status['1D'] = 'missing'; r.missing['1D'] = 'entry before the session opened'; }, P6);
    await caught('a reason in no allowed form', r => { r.status['1D'] = 'missing'; r.missing['1D'] = 'who knows'; delete r.grid['1D']; }, P6);
    await caught('a reading with no rule version', r => { delete r.version; });
  }

  console.log('\n--- E. the fold: from NONE ---');
  {
    let r = await F(p, base(), live(env('retry', [att(0, COMPLETE)])));
    check('a complete first reading: ACTIVE, seq 0 kept and seen, not final', r.state === 'ACTIVE' && r.after.ftfcReadingSeq === 0 && r.after.ftfcSeqSeen === 0 && r.after.ftfcFinal === false, r.after);
    check('...the verdict is the reading\'s (run 13, bull, confirmed) and it is NOT unknown', r.after.ftfcRun === 13 && r.after.ftfcConfirmed === true && r.after.ftfcDirection === 'bull' && !r.unknown && r.align === 'with');
    check('...the arrival\'s legacy grid is NOT what was kept (it read bear)', r.after.ftfc['1D'] === 'bull');
    r = await F(p, base(), live(env('retry', [att(0, P6)])));
    check('an incomplete first reading: ACTIVE, ftfcComplete false, FTFC unknown, never "none"', r.state === 'ACTIVE' && r.after.ftfcComplete === false && r.unknown && r.align === 'unknown', r);
    check('...no verdict on the trade (run, confirmed, direction null; empty run list)', r.after.ftfcRun === null && r.after.ftfcConfirmed === null && r.after.ftfcDirection === null && r.after.ftfcTimeframesInRun.length === 0);
    check('...a reason kept for every missing timeframe', Object.keys(r.after.ftfcMissing).length === 6);
    r = await F(p, base(), live(env('retry', [intr(0)])));
    check('an interrupted attempt 0: PENDING, seq 0 seen, unknown', r.state === 'PENDING' && r.after.ftfcSeqSeen === 0 && !('ftfcReadingSeq' in r.after) && r.unknown, r.after);
    const bad = clone(P6); bad.status['1H'] = 'by-design';
    r = await F(p, base(), live(env('retry', [att(0, bad)])));
    check('only a malformed entry: the trade stays EXACTLY NONE', r.outcome === 'unchanged' && same(ftfcOf(r.after), ftfcOf(base())), r);
    check('...and the malformed entry is logged outside the journal', (await diag(p)).some(x => x.kind === 'malformed'));
  }

  console.log('\n--- E. the fold: later attempts, taken whole or not at all ---');
  {
    const a0 = (await F(p, base(), live(env('retry', [att(0, P6)])))).after;
    let r = await F(p, a0, live(env('retry', [att(0, P6), att(1, P3)])));
    check('a strict superset replaces the kept reading whole (seq 1 kept and seen)', r.outcome === 'applied' && r.after.ftfcReadingSeq === 1 && r.after.ftfcSeqSeen === 1 && Object.keys(r.after.ftfcMissing).length === 3, r.after);
    r = await F(p, a0, live(env('retry', [att(0, P6), att(1, P3_CONFLICT)])));
    check('a reading that disagrees on a measured timeframe is NOT taken; seq 1 is seen; the kept one stays',
      r.after.ftfcReadingSeq === 0 && r.after.ftfcSeqSeen === 1 && r.after.ftfcStatus['4H'] === 'bull', r.after);
    check('...and the disagreement is recorded', (await diag(p)).some(x => x.kind === 'conflict' && /4H/.test(x.text)));
    r = await F(p, a0, live(env('retry', [att(0, P6), att(1, COMPLETE)])));
    check('a complete reading replaces an incomplete one; FTFC no longer unknown', r.after.ftfcComplete === true && r.after.ftfcReadingSeq === 1 && !r.unknown && r.after.ftfcRun === 13);
    const done = r.after;
    r = await F(p, done, live(env('retry', [att(0, P6), att(1, COMPLETE), att(2, P3)])));
    check('an incomplete reading never replaces a complete one (seq 2 seen only)', r.after.ftfcComplete === true && r.after.ftfcReadingSeq === 1 && r.after.ftfcSeqSeen === 2);
    r = await F(p, done, live(env('retry', [att(0, P6), att(1, COMPLETE), att(2, vec('complete, mixed directions 1').reading)])));
    check('a second COMPLETE reading never replaces a kept complete one (seq 2 seen only)', r.after.ftfcReadingSeq === 1 && r.after.ftfcRun === 13 && r.after.ftfcSeqSeen === 2, r.after);
    r = await F(p, a0, live(env('retry', [att(0, P6), att(1, P6)])));
    check('an identical re-measure is not taken (nothing more measured); seq 1 seen', r.after.ftfcReadingSeq === 0 && r.after.ftfcSeqSeen === 1);
    const pen = (await F(p, base(), live(env('retry', [intr(0)])))).after;
    r = await F(p, pen, live(env('retry', [intr(0), att(1, P4)])));
    check('PENDING then a reading: ACTIVE with that reading', r.state === 'ACTIVE' && r.after.ftfcReadingSeq === 1);
    const bad = clone(P3); bad.grid['1D'] = 'bear';
    r = await F(p, a0, live(env('retry', [att(0, P6), att(1, bad)])));
    check('a malformed later entry is skipped WITHOUT advancing (seq stays 0)', r.outcome === 'unchanged' && r.after.ftfcSeqSeen === 0);
    r = await F(p, a0, live(env('retry', [att(0, P6)])));
    check('an envelope already fully seen changes nothing', r.outcome === 'unchanged');
    r = await F(p, a0, live(env('retry', [att(0, P6, V - 1)], null, { version: V - 1 })));
    check('an older rule\'s update is stale: nothing changes', r.outcome === 'stale' && same(ftfcOf(r.after), ftfcOf(a0)));
    r = await F(p, a0, live(env('retry', [att(0, P6, V + 1)], null, { version: V + 1 })));
    check('a NEWER rule\'s update is refused, not applied', r.outcome === 'newer-version' && same(ftfcOf(r.after), ftfcOf(a0)));
  }

  console.log('\n--- E4. finalisation ---');
  {
    const a2 = (await F(p, base(), live(env('retry', [att(0, P6), intr(1), intr(2)])))).after;
    let r = await F(p, a2, live(env('final', [att(0, P6), intr(1), intr(2), att(3, P4)], 'EXHAUSTED_READING')));
    check('EXHAUSTED_READING with attempt 3 newly folded: ENDED, code kept, the better reading taken', r.state === 'ENDED' && r.after.ftfcFinalCode === 'EXHAUSTED_READING' && r.after.ftfcReadingSeq === 3, r.after);
    check('...still unknown (the last reading was incomplete): Details says so', r.unknown && r.align === 'unknown');
    const ended = r.after;
    r = await F(p, a2, live(env('final', [att(0, P6), intr(1), intr(2), intr(3)], 'EXHAUSTED_INTERRUPTED')));
    check('EXHAUSTED_INTERRUPTED with attempt 3 newly folded: ENDED', r.state === 'ENDED' && r.after.ftfcFinalCode === 'EXHAUSTED_INTERRUPTED' && r.after.ftfcSeqSeen === 3);
    const seen3 = Object.assign(clone(a2), { ftfcSeqSeen: 3 });
    r = await F(p, seen3, live(env('final', [att(0, P6), intr(1), intr(2), att(3, P4)], 'EXHAUSTED_READING')));
    check('a final whose attempt 3 was ALREADY seen does not end the trade (seq 3 not newly processed)', r.after.ftfcFinal === false, r.after);
    r = await F(p, a2, live(env('final', [att(0, P6), intr(1)], 'SUPERSEDED')));
    check('SUPERSEDED always ends it, after its fold', r.after.ftfcFinal === true && r.after.ftfcFinalCode === 'SUPERSEDED');
    r = await F(p, ended, live(env('final', [att(0, P6), intr(1), intr(2), att(3, P4)], 'SUPERSEDED')));
    check('an ENDED trade never changes its final code', r.after.ftfcFinalCode === 'EXHAUSTED_READING');
    r = await F(p, Object.assign(clone(ended), { ftfcReadingSeq: 0, ftfcSeqSeen: 0, ftfcStatus: P6.status, ftfcMissing: P6.missing, ftfc: P6.grid }), live(env('final', [att(0, P6), att(1, COMPLETE), intr(2), intr(3)], 'EXHAUSTED_INTERRUPTED')));
    check('an ENDED trade still folds later entries (E5) but keeps final and code', r.after.ftfcComplete === true && r.after.ftfcFinalCode === 'EXHAUSTED_READING', r.after);
    r = await F(p, base(), live(env('final', [intr(0)], 'SUPERSEDED')));
    check('SUPERSEDED with nothing measured: no reading, ended, still FTFC unknown', r.state === 'PENDING' && r.after.ftfcFinal === true && r.unknown);
  }

  console.log('\n--- C2/C3 + v14 2. contradictory, malformed and version-mismatched envelopes change NOTHING ---');
  {
    const a0 = (await F(p, base(), live(env('retry', [att(0, P6)])))).after;
    const cases = [
      ['no envelope at all (a marked item queued before it was measured)', { ftfcProtocol: 1, ftfcOrigin: 'history' }, 'contradictory'],
      ['origin "history" with a "retry" envelope', hist(env('retry', [att(0, P3)])), 'contradictory'],
      ['origin "live" with a "single" envelope', live(env('single', [att(0, P3)])), 'contradictory'],
      ['an unknown origin', { ftfcProtocol: 1, ftfcOrigin: 'elsewhere', ftfcEnvelope: env('retry', [att(0, P3)]) }, 'contradictory'],
      ['a gap in the attempt numbers', live(env('retry', [att(0, P6), att(2, P3)])), 'contradictory'],
      ['a highestSeq unlike the list', live(env('retry', [att(0, P6), att(1, P3)], null, { highestSeq: 0 })), 'contradictory'],
      ['an attempt from another fill pair', live(env('retry', [att(0, P6), Object.assign(att(1, P3), { close: '9999' })])), 'contradictory'],
      ['a "retry" reaching attempt 3', live(env('retry', [att(0, P6), intr(1), intr(2), att(3, P3)])), 'contradictory'],
      ['EXHAUSTED_READING without a reading as attempt 3', live(env('final', [att(0, P6), intr(1), intr(2), intr(3)], 'EXHAUSTED_READING')), 'contradictory'],
      ['EXHAUSTED_INTERRUPTED with a reading as attempt 3', live(env('final', [att(0, P6), intr(1), intr(2), att(3, P3)], 'EXHAUSTED_INTERRUPTED')), 'contradictory'],
      ['a final with no allowed code', live(env('final', [att(0, P6)], 'DONE')), 'contradictory'],
      ['a "single" with two entries', hist(env('single', [att(0, P6), att(1, P3)])), 'contradictory'],
      ['a "single" with a final code', hist(env('single', [att(0, P6)], null, { finalCode: 'SUPERSEDED' })), 'contradictory'],
    ];
    for(const [label, item, want] of cases){
      for(const [name, t] of [['NONE', base()], ['ACTIVE', a0]]){
        const r = await F(p, t, item);
        check(`${label} (${name}): ${want}, every FTFC field byte-identical`, r.outcome === want && same(ftfcOf(r.after), ftfcOf(t)), { outcome: r.outcome, reason: r.reason });
      }
    }
    // v14 2: the three-way version check, for "single" AND "retry", each version differing ALONE.
    const vcases = [
      ['the envelope', k => env(k, [att(0, P3)], null, { version: V + 1, attempts: [Object.assign(att(0, P3), { version: V + 1 })] }), 0],
      ['the reading', k => env(k, [att(0, Object.assign(clone(P3), { version: V + 1 }))]), 0],
      ['the app', k => env(k, [att(0, P3)]), V + 1],
    ];
    for(const kind of ['single', 'retry']){
      for(const [which, mk, appV] of vcases){
        const item = kind === 'single' ? hist(mk('single')) : live(mk('retry'));
        const r = await F(p, base(), item, appV);
        check(`${kind}: ${which}'s version differing alone leaves the new trade in NONE, nothing copied (${r.outcome})`,
          r.state === 'NONE' && same(ftfcOf(r.after), ftfcOf(base())) && ['invalid', 'unchanged'].includes(r.outcome), r);
      }
    }
    let r = await F(p, base(), hist(env('single', [att(0, P3)])));
    check('single: all three versions equal -> ENDED with SINGLE_MEASUREMENT, seq 0', r.state === 'ENDED' && r.after.ftfcFinalCode === 'SINGLE_MEASUREMENT' && r.after.ftfcReadingSeq === 0 && r.after.ftfcCycleVersion === V);
    const badSingle = clone(P3); badSingle.missing['5m'] = 'who knows';
    r = await F(p, base(), hist(env('single', [att(0, badSingle)])));
    check('single with a malformed reading on a new trade: invalid, NONE, nothing copied', r.outcome === 'invalid' && r.state === 'NONE');
    const incons = Object.assign(clone(a0), { ftfcFinal: true });
    r = await F(p, incons, live(env('retry', [att(0, P6), att(1, COMPLETE)])));
    check('an INCONSISTENT trade is never changed (fails closed)', r.outcome === 'inconsistent' && same(ftfcOf(r.after), ftfcOf(incons)));
  }

  console.log('\n--- v14 1 + boundary 1. a valid "single" never starts or ends a retry cycle on a trade that has state ---');
  {
    const a0 = (await F(p, base(), live(env('retry', [att(0, P6)])))).after;
    const ended = (await F(p, base(), hist(env('single', [att(0, P3)])))).after;
    const pending = (await F(p, base(), live(env('retry', [intr(0)])))).after;
    const legacy = base({ ftfc: { '1D': 'bull', '4H': 'bull' }, ftfcRun: 2, ftfcConfirmed: false, ftfcVersion: 2 });
    const hand = base({ userSet: { ftfc: true }, ftfc: { '1D': 'bear' }, ftfcRun: 1, ftfcConfirmed: false });
    for(const [name, t] of [['FIX1-ACTIVE', a0], ['FIX1-ENDED', ended], ['FIX1-PENDING', pending], ['LEGACY', legacy], ['HAND', hand]]){
      const before = (await diag(p)).length;
      const r = await F(p, t, hist(env('single', [att(0, COMPLETE)])));
      check(`${name}: valid but not applicable, FTFC byte-identical, no error recorded`, r.outcome === 'not-applicable' && same(ftfcOf(r.after), ftfcOf(t)) && (await diag(p)).length === before, r.outcome);
    }
    const r = await F(p, a0, hist(env('single', [att(0, Object.assign(clone(COMPLETE), { run: 2 }))])));
    check('an INVALID single for an existing trade is recorded, FTFC unchanged', r.outcome === 'invalid' && same(ftfcOf(r.after), ftfcOf(a0)));
    check('a live retry never applies to his hand-set timeframes', (await F(p, hand, live(env('retry', [att(0, COMPLETE)])))).outcome === 'not-applicable');
  }
  check('nothing threw (pure cases)', errors.length === 0, errors);
  await ctx.close();

  // ===================== THE IMPORT PATH (W2, W3, boundaries 2-4) =====================
  console.log('\n--- W2. a NEW marked arrival ---');
  {
    const { p, ctx, errors } = await page([]);
    await p.evaluate(async a => await autoImportPendingTrades('https://fake.example.com', a), [arrival(live(env('retry', [att(0, P6)])))]);
    let t = (await read(p))[0];
    check('added, in FIX1-ACTIVE with the envelope\'s reading (FTFC unknown)', t && await p.evaluate(x => ftfcStateOf(x), t) === 'ACTIVE' && t.ftfcComplete === false && await p.evaluate(x => isFtfcUnknown(x), t));
    check('the arrival\'s own legacy grid (bear, run 4, confirmed) was NOT copied', t.ftfcRun === null && t.ftfcConfirmed === null && t.ftfc['1D'] === 'bull');
    check('money arrived as always (fee 2.64, after-fee 107.36)', t.fees === 2.64 && t.pnlNet === 107.36);
    check('nothing threw', errors.length === 0, errors);
    await ctx.close();
  }
  for(const [label, item] of [
    ['a contradictory envelope (history + retry)', arrival(hist(env('retry', [att(0, P6)])))],
    ['a marked item with NO envelope', arrival({ ftfcProtocol: 1, ftfcOrigin: 'history' })],
    ['a version-mismatched single', arrival(hist(env('single', [att(0, Object.assign(clone(P3), { version: V + 1 }))])))],
  ]){
    const { p, ctx, errors } = await page([]);
    await p.evaluate(async a => await autoImportPendingTrades('https://fake.example.com', a), [item]);
    const t = (await read(p))[0];
    check(`${label}: the trade IS added, in exactly NONE, no FTFC field copied`, t && await p.evaluate(x => ftfcStateOf(x), t) === 'NONE' && same(ftfcOf(t), NONE_FTFC), t && ftfcOf(t));
    check(`${label}: its other facts are handled as today (fee, stock price)`, t.fees === 2.64 && t.undEntry === 570.1);
    check(`${label}: the reason is recorded outside the journal`, (await diag(p)).some(x => ['contradictory', 'invalid'].includes(x.kind)));
    check(`${label}: shown as "FTFC unknown", not "did not agree"`, await p.evaluate(x => alignmentOf(x), t) === 'unknown');
    check(`${label}: nothing threw`, errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n--- boundary 4. an UNMARKED arrival keeps the legacy path exactly ---');
  {
    const { p, ctx, errors } = await page([]);
    await p.evaluate(async a => await autoImportPendingTrades('https://fake.example.com', a), [arrival()]);
    const t = (await read(p))[0];
    check('the legacy fields are copied as before (bear, run 4, confirmed)', t.ftfcRun === 4 && t.ftfcConfirmed === true && t.ftfcDirection === 'bear' && same(t.ftfc, arrival().ftfc));
    check('no Fix-1 field appears', !Object.keys(t).some(k => ['ftfcStatus','ftfcCycleVersion','ftfcSeqSeen','ftfcFinal','ftfcComplete'].includes(k)));
    check('LEGACY state, and read as before ("with"/"against" from the verdict)', await p.evaluate(x => ftfcStateOf(x), t) === 'LEGACY' && await p.evaluate(x => alignmentOf(x), t) === 'against');
    check('nothing threw', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n--- W3 + boundary 3. an EXISTING trade: FTFC only through its envelope; other facts refresh as today ---');
  {
    const a0 = await (async () => { const { p, ctx } = await page([]); const r = (await F(p, base(), live(env('retry', [att(0, P6)])))).after; await ctx.close(); return r; })();
    const legacy = base({ ftfc: { '1D': 'bull', '4H': 'bull' }, ftfcRun: 2, ftfcConfirmed: false, ftfcVersion: V });
    const hand = base({ userSet: { ftfc: true }, ftfc: { '1D': 'bear' }, ftfcRun: 1, ftfcConfirmed: false, ftfcVersion: V });
    const ended = Object.assign(clone(a0), { ftfcFinal: true, ftfcFinalCode: 'SUPERSEDED' });
    const short = t => Object.assign(clone(t), { fees: null, entryFees: null, exitFees: null, pnlNet: null, settled: false, fillAttempts: 0 });
    for(const [name, t] of [['FIX1-ACTIVE', a0], ['FIX1-ENDED', ended], ['LEGACY', legacy], ['HAND', hand]]){
      const saved = short(t);
      const { p, ctx, errors } = await page([saved]);
      const loaded = (await read(p))[0];
      await p.evaluate(async a => await autoImportPendingTrades('https://fake.example.com', a), [arrival(hist(env('single', [att(0, COMPLETE)])))]);
      const after = (await read(p))[0];
      check(`${name} + a valid history single: FTFC fields byte-identical`, same(ftfcOf(after), ftfcOf(loaded)), ftfcOf(after));
      check(`${name} + a valid history single: the missing fee IS filled in, exactly as today (2.64, after-fee 107.36)`, after.fees === 2.64 && after.pnlNet === 107.36, { fees: after.fees, pnlNet: after.pnlNet });
      check(`${name}: nothing threw`, errors.length === 0, errors);
      await ctx.close();
    }
    {
      const { p, ctx, errors } = await page([short(a0)]);
      const loaded = (await read(p))[0];
      await p.evaluate(async a => await autoImportPendingTrades('https://fake.example.com', a), [arrival(hist(env('single', [att(0, Object.assign(clone(COMPLETE), { run: 2 }))])))]);
      const after = (await read(p))[0];
      check('an INVALID single for an existing trade: FTFC unchanged, recorded, the fee still filled in', same(ftfcOf(after), ftfcOf(loaded)) && after.fees === 2.64 && (await diag(p)).some(x => x.kind === 'invalid'));
      check('nothing threw', errors.length === 0, errors);
      await ctx.close();
    }
    {
      const { p, ctx, errors } = await page([a0]);
      await p.evaluate(async a => await autoImportPendingTrades('https://fake.example.com', a), [arrival(live(env('retry', [att(0, P6), att(1, COMPLETE)])))]);
      const after = (await read(p))[0];
      check('a live arrival carrying a later attempt DOES move an ACTIVE trade on (complete now)', after.ftfcComplete === true && after.ftfcReadingSeq === 1 && after.ftfcRun === 13);
      check('nothing threw', errors.length === 0, errors);
      await ctx.close();
    }
    {
      // An existing trade read out of his broker's FILE (NONE, no minutes) meets the live arrival.
      const fileTrade = base({ id: 900077, source: 'schwab-csv', entryTime: '', exitTime: '', entryTimestamp: null, exitTimestamp: null,
        fills: ['csv|2026-10-09|SPY   261009C00570000|BUY|2|1.25|0', 'csv|2026-10-09|SPY   261009C00570000|SELL|2|1.80|0'], settled: false, fillAttempts: 0 });
      const { p, ctx, errors } = await page([fileTrade]);
      await p.evaluate(async a => await autoImportPendingTrades('https://fake.example.com', a), [arrival(live(env('retry', [att(0, COMPLETE)])))]);
      const all = await read(p);
      check('a file trade met by a live arrival is filled in, not duplicated', all.length === 1, all.length);
      check('...and takes its reading through the envelope (from NONE)', all[0] && all[0].ftfcCycleVersion === V && all[0].ftfcComplete === true, all[0] && ftfcOf(all[0]));
      check('nothing threw', errors.length === 0, errors);
      await ctx.close();
    }
  }

  console.log('\n--- B5/E6. the waiting updates: fold, ONE save, then the exact removal ---');
  {
    const pen = await (async () => { const { p, ctx } = await page([]); const r = (await F(p, base(), live(env('retry', [intr(0)])))).after; await ctx.close(); return r; })();
    const upd = env('retry', [intr(0), att(1, P3)]);
    const stray = Object.assign(env('retry', [att(0, P3)]), { open: '5551', close: '5552', attempts: [Object.assign(att(0, P3), { open: '5551', close: '5552' })] });
    const routes = { updates: r => r.request().method() === 'GET'
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(routes.armed ? { updates: [upd, stray], waiting: 2 } : { updates: [], waiting: 0 }) })
      : r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"removed":1}' }) };
    const { p, ctx, errors, asked } = await page([pen], routes);
    routes.armed = true;
    await p.evaluate(async () => await pollBackendOnce('https://fake.example.com', true));
    const after = (await read(p))[0];
    check('the update landed: PENDING -> ACTIVE with attempt 1', after.ftfcReadingSeq === 1 && after.ftfcSeqSeen === 1, ftfcOf(after));
    const dels = asked.filter(x => x.startsWith('DELETE /api/ftfc/updates'));
    check(`removal names version, pair and seq exactly (${dels.join(' | ')})`, dels.some(x => x === `DELETE /api/ftfc/updates?version=${V}&fills=${O}%2C${C}&seq=1`));
    check('the queue was read to the end first, so an update with no trade is cleared and recorded', dels.some(x => x.includes('5551')) && (await diag(p)).some(x => x.kind === 'no-trade'));
    check('the updates were asked for only AFTER the trade queue', asked.findIndex(x => x.startsWith('GET /api/trades/pending')) < asked.findIndex(x => x.startsWith('GET /api/ftfc/updates')));
    const lines = await p.evaluate(() => ftfcDetailsLines(loadTrades()).join('\n'));
    check('Details carries the summary and the updates line', /ftfc unknown 1 · retrying 1/.test(lines) && /ftfc updates: 2 waiting · 1 applied/.test(lines), lines);
    check('Details lists the unknown trade with its missing timeframes and reasons', /5m: data did not contain this bar/.test(lines) && /price exact-print/.test(lines), lines);
    check('nothing threw', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // A failed save applies nothing and clears nothing.
    const pen = base({ ftfcCycleVersion: V, ftfcSeqSeen: 0, ftfcFinal: false });
    const upd = env('retry', [intr(0), att(1, P3)]);
    const routes = { updates: r => r.request().method() === 'GET'
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(routes.armed ? { updates: [upd], waiting: 1 } : { updates: [], waiting: 0 }) })
      : r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"removed":1}' }) };
    const { p, ctx, errors, asked } = await page([pen], routes);
    const loaded = (await read(p))[0];
    routes.armed = true;
    await p.evaluate(async () => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v){ if(k === 'strat_trades') throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); return real.call(this, k, v); };
      try{ await pollBackendOnce('https://fake.example.com', true); } finally { Storage.prototype.setItem = real; }
    });
    const after = (await read(p))[0];
    check('a refused save: the trade is byte-identical', same(after, loaded));
    check('...and nothing was cleared on the service', !asked.some(x => x.startsWith('DELETE /api/ftfc/updates')), asked);
    check('nothing threw', errors.length === 0, errors);
    await ctx.close();
  }
  {
    // The trade queue failing: the updates are not even asked for.
    const routes = { pending: r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"stand-in"}' }) };
    const { p, ctx, errors, asked } = await page([base()], routes);
    await p.evaluate(async () => await pollBackendOnce('https://fake.example.com', true));
    check('a failed trade collection skips the updates stage', !asked.some(x => x.includes('/api/ftfc/updates')), asked);
    check('nothing threw', errors.length === 0, errors);
    await ctx.close();
  }
  {
    const routes = { updates: r => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not here' }) };
    const { p, ctx, errors } = await page([base()], routes);
    await p.evaluate(async () => await pollBackendOnce('https://fake.example.com', true));
    const lines = await p.evaluate(() => ftfcDetailsLines(loadTrades()).join('\n'));
    check('an older service (no updates route) is its own answer in Details', /older service build/.test(lines), lines);
    check('nothing threw', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n--- W1. editing: only a changed GRID makes the timeframes his (HAND cleanup); anything else keeps FTFC byte-identical ---');
  {
    const { p: q, ctx: c0 } = await page([]);
    const a0 = (await F(q, base(), live(env('retry', [att(0, P6)])))).after;   // 6M..2H all bull: a recount would say "agreed"
    await c0.close();
    {
      const { p, ctx, errors } = await page([a0]);
      const loaded = (await read(p))[0];
      await p.evaluate(() => editTrade(900001)); await p.waitForTimeout(400);
      await p.fill('#f_notes', 'A new note.');
      await p.evaluate(() => saveTrade()); await p.waitForTimeout(400);
      const after = (await read(p))[0];
      check('a note edit saved', after.notes === 'A new note.');
      check('...every FTFC field byte-identical (no claim, no recount)', same(ftfcOf(after), ftfcOf(loaded)), { before: ftfcOf(loaded), after: ftfcOf(after) });
      check('...still FIX1-ACTIVE and unknown', await p.evaluate(x => ftfcStateOf(x) === 'ACTIVE' && isFtfcUnknown(x), after));
      check('nothing threw', errors.length === 0, errors);
      await ctx.close();
    }
    {
      const { p, ctx, errors } = await page([a0]);
      await p.evaluate(() => editTrade(900001)); await p.waitForTimeout(400);
      await p.evaluate(() => { currentTf['1H'] = 'bull'; currentTf['30m'] = 'bull'; });
      await p.evaluate(() => saveTrade()); await p.waitForTimeout(400);
      const after = (await read(p))[0];
      check('changing the grid makes them his: userSet.ftfc set', after.userSet && after.userSet.ftfc === true);
      check('...in the SAME save every Fix-1 field is removed (HAND cleanup)', !['ftfcStatus','ftfcMissing','ftfcComplete','ftfcPriceSource','ftfcPriceTime','ftfcDiagnostics','ftfcCycleVersion','ftfcReadingSeq','ftfcSeqSeen','ftfcFinal','ftfcFinalCode'].some(k => k in after), Object.keys(after).filter(k => /^ftfc/.test(k)));
      check('...HAND, his grid, his verdict, and never "unknown"', await p.evaluate(x => ftfcStateOf(x) === 'HAND' && !isFtfcUnknown(x), after) && after.ftfc['1H'] === 'bull' && after.ftfcRun === 9);
      const r = await p.evaluate(([t, i]) => ftfcFold(t, i, FTFC_RULE_VERSION).outcome, [after, live(env('retry', [att(0, P6), att(1, COMPLETE)]))]);
      check('...and a later update cannot touch it', r === 'not-applicable');
      check('nothing threw', errors.length === 0, errors);
      await ctx.close();
    }
  }

  console.log('\n--- G. display ---');
  {
    const { p: q, ctx: c0 } = await page([]);
    const a0 = (await F(q, base(), live(env('retry', [att(0, P6)])))).after;
    const done = (await F(q, base({ id: 900002 }), live(env('retry', [att(0, COMPLETE)])))).after;
    await c0.close();
    const { p, ctx, errors } = await page([a0, done]);
    await p.click('.navbar .item[data-view="journal"]'); await p.waitForTimeout(600);
    const html = await p.evaluate(() => document.body.innerHTML);
    check('the card reads "FTFC unknown" for the incomplete reading', /FTFC unknown/.test(html));
    check('...and never "timeframes did not agree" for it', !/0\/4 — timeframes did not agree/.test(html));
    const csv = await p.evaluate(() => { const t = loadTrades(); return t.map(x => isFtfcUnknown(x) ? 'Unknown' : (x.ftfcConfirmed ? 'Yes' : 'No')); });
    check('the spreadsheet column reads Unknown / Yes', same(csv.sort(), ['Unknown', 'Yes']), csv);
    const dash = await p.evaluate(() => { const ts = loadTrades(); return ts.map(alignmentOf); });
    check('the Dashboard comparison leaves the unknown one out ("unknown", not "none")', dash.includes('unknown') && dash.includes('with') && !dash.includes('none'), dash);
    check('nothing threw', errors.length === 0, errors);
    await ctx.close();
  }

  console.log('\n--- F. the app writes FTFC fields only where the plan says ---');
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const FIX1_ONLY = /\b(ftfcStatus|ftfcMissing|ftfcComplete|ftfcPriceSource|ftfcPriceTime|ftfcDiagnostics|ftfcCycleVersion|ftfcReadingSeq|ftfcSeqSeen|ftfcFinal|ftfcFinalCode)\b\s*(=[^=]|:)/g;
    const ALL_FTFC = /(?:\.|\bdelete\s+\w+\.)(ftfc|ftfcRun|ftfcConfirmed|ftfcDirection|ftfcTimeframesInRun|ftfcVersion|ftfcPriceAtEntry|ftfcStatus|ftfcMissing|ftfcComplete|ftfcPriceSource|ftfcPriceTime|ftfcDiagnostics|ftfcCycleVersion|ftfcReadingSeq|ftfcSeqSeen|ftfcFinal|ftfcFinalCode)\s*=[^=]/g;
    const fnAt = i => { const before = src.slice(0, i); const m = [...before.matchAll(/\n(?:async\s+)?function\s+(\w+)\s*\(/g)]; return m.length ? m[m.length - 1][1] : '(top)'; };
    const sites = re => { const out = new Set(); for(const m of src.matchAll(re)) out.add(fnAt(m.index)); return [...out].sort(); };
    const fix1Sites = sites(FIX1_ONLY);
    const FIX1_ALLOWED = ['ftfcFieldsOf', 'ftfcFold', 'ftfcStateOf'];
    check(`Fix-1 fields are written only by the fold (${fix1Sites.join(', ')})`, fix1Sites.every(f => FIX1_ALLOWED.includes(f)), fix1Sites);
    const direct = sites(ALL_FTFC);
    // Legacy writers that existed before Fix 1 (refreshTradeFacts' legacy
    // block; the manual check's own form) plus the fold's one writer.
    // ftfcFold assigns only to its own in-memory result; markUserSet's
    // match is userSet.ftfc (his claim), not a trade field.
    const DIRECT_ALLOWED = ['ftfcWrite', 'ftfcFold', 'markUserSet', 'refreshTradeFacts', 'saveTrade', 'editTrade', 'runFtfcCheck'];
    check(`direct FTFC assignments sit only in known writers (${direct.join(', ')})`, direct.every(f => DIRECT_ALLOWED.includes(f)), direct);
    const cleanup = src.slice(src.indexOf('function saveTrade('), src.indexOf('function saveTrade(') + 12000);
    check('saveTrade\'s only removal of Fix-1 fields is the HAND cleanup', /for\(const k of FTFC_META_KEYS\.concat\(FTFC_READING_KEYS\)\) delete merged\[k\];/.test(cleanup));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); site.close && site.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL: the check itself crashed: ' + (e && e.stack || e)); process.exit(1); });
