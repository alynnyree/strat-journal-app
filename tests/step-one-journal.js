// Step 1 in the journal itself (plan v4, authorised 15 Nov 2026).
//   A10-1 his "Yes" on the measured setup is stored as his (confirmed-by-owner)
//   A10-9 a confirmation that could not be saved says "Not saved", never "Saved"
//   A12   what the app hands over to be read holds no bar from the entry minute on
//   A13   his confirmation survives a catch-up that brings another reading
//   B11   an answer that differs from a value he set by hand: his value kept,
//         the difference recorded (behind Details)
//   B15   a trade with no pop-up answer asks on the card; the answer is stored
//         under the purchase's fill id, and a lost reply is retried with the
//         SAME answer id
//   B16   the Home line: the right count, hidden when none or when the service
//         cannot be asked
//   D1    a trade from before the switch-on looks and stays exactly as before
//   D2    old trades are not sent to be read again
// The service is a stand-in in this file, following the real answer rules.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if (!started.browser) { console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : JSON.stringify(d).slice(0, 400)); } };

  const ENTRY = Date.UTC(2026, 10, 16, 16, 8, 34);          // 11:08:34 New York
  const MINUTE = Math.floor(ENTRY / 60000) * 60000;
  // A replay window like the real ones: 20 minutes before the entry and 20 after.
  const candles = [];
  for (let m = -20; m <= 20; m++) candles.push({ datetime: MINUTE + m * 60000, open: 269 + m / 100, high: 269.2 + m / 100, low: 268.8 + m / 100, close: 269.1 + m / 100, volume: 100 });

  const reading = (extra) => Object.assign({
    ruleVersion: 1, at: '2026-11-16T16:30:00.000Z', outcome: null, pendingOwner: true, ownerTimeframe: '5m',
    candidates: [
      { timeframe: '5m', direction: 'bearish', combo: '2-2 Continuation', notation: '2D-2D', length: 2, borderline: false, orderUnknown: false, confirmed: true },
      { timeframe: '15m', direction: 'bearish', combo: '2-2 Reversal', notation: '2U-2D', length: 2, borderline: false, orderUnknown: false, confirmed: true },
    ],
    timeframes: { '5m': { status: 'confirmed', bars: [], candidates: [], why: null }, '15m': { status: 'confirmed', bars: [], candidates: [], why: null } },
    aiChoice: null, reasoning: null, dataNotes: [],
  }, extra || {});

  // A trade from long before the switch-on, exactly as his journal holds them.
  const OLD = {
    id: 600001, ticker: 'SPY', dir: 'Long', occ: 'SPY   260604C00755000',
    entryDate: '2026-06-04', entryTime: '10:20', exitDate: '2026-06-04', exitTime: '10:44',
    entryTimestamp: 1780000000000, exitTimestamp: 1780001440000,
    optEntry: 0.55, optExit: 0.71, contracts: 2, pnlDollar: 32, pnlPercent: 29.1, winLoss: 'Win',
    fees: 2.66, entryFees: 1.33, exitFees: 1.33, pnlNet: 29.34, fills: ['111111111111', '111111111112'],
    replayData: { candles: candles.slice(0, 5) }, settled: true, source: 'schwab-auto', notes: '',
  };
  // A trade read under the new rule, with his timeframe from the pop-up.
  const NEW = {
    id: 700001, ticker: 'IWM', dir: 'Short', occ: 'IWM   261120P00269000',
    entryDate: '2026-11-16', entryTime: '11:08', exitDate: '2026-11-16', exitTime: '11:20',
    entryTimestamp: ENTRY, exitTimestamp: ENTRY + 729000,
    optEntry: 1.02, optExit: 1.05, contracts: 1, pnlDollar: 3, pnlPercent: 2.9, winLoss: 'Win',
    fees: 0.66, entryFees: 0.33, exitFees: 0.33, pnlNet: 2.34, fills: ['133716429407', '133716430001'],
    replayData: { candles }, settled: true, source: 'schwab-auto', notes: '',
    play: 'FTFC Direction Play', entryTimeframe: '5m', userSet: { play: true, entryTimeframe: true }, answerId: 'aAnswer0001',
    setupReading: reading(),
  };
  // A new-rule trade whose reading could not finish (the AI was unreachable),
  // with no answer from the pop-up.
  const RETRY = Object.assign({}, NEW, {
    id: 700002, fills: ['133716500001', '133716500002'], play: null, entryTimeframe: null, userSet: {}, answerId: null,
    setupReading: reading({ pendingOwner: false, ownerTimeframe: undefined, outcome: 'unreachable' }),
  });

  function service() {
    const s = { history: {}, current: {}, sigs: {}, requests: [], classify: [], dropNextReply: false, failWaiting: false, waiting: [], answers: {} };
    s.answer = a => {
      const f = a.fillId, sig = [a.play, a.timeframe, a.formationTimeframe || '', a.replaces || ''].join('|');
      const h = s.history[f] = s.history[f] || [];
      const known = h.find(e => e.answerId === a.answerId);
      if (known) return s.sigs[a.answerId] === sig ? [200, { verdict: 'ALREADY', entry: known }] : [409, { verdict: 'REUSED', entry: known }];
      const cur = s.current[f] || '';
      if (cur !== (a.replaces || '')) return [409, { verdict: 'REFUSED', entry: h.find(e => e.answerId === cur) || null }];
      const entry = { answerId: a.answerId, fillId: f, play: a.play, timeframe: a.timeframe, formationTimeframe: a.formationTimeframe || null, replaces: a.replaces || null };
      h.push(entry); s.current[f] = a.answerId; s.sigs[a.answerId] = sig;
      return [200, { verdict: 'ACCEPTED', entry }];
    };
    return s;
  }

  async function open(svc, trades, { width = 390, height = 844, before } = {}) {
    const ctx = await b.newContext({ viewport: { width, height } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route(u => u.hostname === 'fake.example.com', async route => {
      const req = route.request();
      const u = new URL(req.url());
      let body = null; try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch (e) { body = null; }
      svc.requests.push({ method: req.method(), path: u.pathname, query: u.search, body, auth: req.headers().authorization || null });
      const json = (code, o) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(o) });
      if (u.pathname === '/purchases/waiting') return svc.failWaiting ? json(500, { error: 'x' }) : json(200, { waiting: svc.waiting.filter(w => !svc.current[w.fillId]) });
      if (u.pathname === '/purchases/' || u.pathname === '/purchases') {
        const out = {};
        for (const f of (u.searchParams.get('fills') || '').split(',').filter(Boolean)) out[f] = { answer: svc.answers[f] || null, known: true };
        return json(200, { answers: out });
      }
      if (u.pathname === '/purchases/answer') {
        const [code, out] = svc.answer(body);
        if (svc.dropNextReply) { svc.dropNextReply = false; return route.abort('connectionreset'); }
        return json(code, out);
      }
      if (u.pathname === '/ai/classify' && req.method() === 'POST') { svc.classify.push(body); return json(200, { accepted: true, queued: true }); }
      if (u.pathname === '/ai/classify/results') return json(200, { results: {} });
      if (u.pathname.startsWith('/api/trades/pending')) return json(200, { pending: [] });
      if (u.pathname === '/health') return json(200, { ok: true });
      return json(200, { ok: true });
    });
    await p.goto(site.base + '/index.html');
    await p.evaluate(t => {
      localStorage.setItem('strat_intro', JSON.stringify({ on: false, motion: false }));
      localStorage.setItem('strat_backend_url', 'https://fake.example.com');
      localStorage.setItem('strat_app_key', 'k');
      localStorage.setItem('strat_backfilled', '1');
      localStorage.setItem('strat_trades', JSON.stringify(t));
    }, trades);
    if (before) await before(p);
    await p.reload(); await p.waitForTimeout(1200);
    return { p, ctx, errors };
  }
  const stored = (p, id) => p.evaluate(i => JSON.parse(localStorage.getItem('strat_trades')).find(t => t.id === i), id);
  const journal = async p => { await p.click('.navbar .item[data-view="journal"]'); await p.waitForTimeout(400); };
  const cardOf = (p, id) => p.evaluateHandle(i => [...document.querySelectorAll('.trade-card')].find(c => c.innerHTML.includes(`editTrade(${i})`) || c.innerHTML.includes(`'${i}'`)) || null, id);

  // ===== A10-1 / D1 the confirm box, and an old trade beside it =========
  {
    const svc = service();
    const { p, ctx, errors } = await open(svc, [OLD, NEW]);
    await journal(p);
    const boxes = await p.$$eval('.s1box', els => els.map(e => e.textContent.replace(/\s+/g, ' ')));
    check('A10-1 one confirm box, on the new-rule trade only', boxes.length === 1, boxes);
    check('A10-1 it names his timeframe and the combo measured there', /On your 5m chart, the bars into your entry read 2D-2D: a 2-2 Continuation \(bearish\)\. Right\?/.test(boxes[0] || ''), boxes[0]);
    check('A10-1 it says where the prices came from', /Cboe One/.test(boxes[0] || ''));
    const badges = await p.$$eval('.trade-card', cs => cs.map(c => (c.querySelector('.tc-badges') || {}).textContent || ''));
    check('the timeframe label is on the new trade', badges.some(t => /⏱ 5m/.test(t)), badges);
    check('D1 the old trade shows no timeframe label and no box', badges.filter(t => /⏱/.test(t)).length === 1);
    const oldBefore = JSON.stringify(await stored(p, 600001));
    await p.click('.s1box button:has-text("Yes")'); await p.waitForTimeout(300);
    const t = await stored(p, 700001);
    check('A10-1 stored as his: confirmed-by-owner', t.setupReading.outcome === 'confirmed-by-owner' && t.setupReading.pendingOwner === false, t.setupReading);
    check('A10-1 the setup shown is his, marked as set by him', t.strat === '2-2 Continuation' && t.stratConfidence === 'his' && t.userSet.strat === true && t.stratTimeframe === '5m' && t.stratNotation === '2D-2D', t);
    check('A10-1 the measured evidence is kept beside his answer', t.setupReading.candidates.length === 2 && t.setupReading.ownerChoice.measured === true);
    const after = await p.$$eval('.s1box', els => els.map(e => e.textContent));
    check('A10-1 "Saved" is shown only after the save landed', after.length === 1 && /Saved: 2-2 Continuation\./.test(after[0]), after);
    check('D1 the old trade is byte-for-byte unchanged', JSON.stringify(await stored(p, 600001)) === oldBefore);
    check('no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ===== A10-1 "Pick another" ===========================================
  {
    const svc = service();
    const { p, ctx } = await open(svc, [NEW]);
    await journal(p);
    await p.click('.s1box button:has-text("Pick another")'); await p.waitForTimeout(200);
    await p.click('.s1box button:has-text("3-2-2 Reversal")'); await p.waitForTimeout(300);
    const t = await stored(p, 700001);
    check('Pick another: his choice is stored as his, with no measured evidence claimed', t.strat === '3-2-2 Reversal' && t.setupReading.outcome === 'confirmed-by-owner' && t.setupReading.ownerChoice.measured === false && t.stratNotation === null, t);
    await ctx.close();
  }

  // ===== A10-9 the journal cannot be written ============================
  {
    const svc = service();
    const { p, ctx } = await open(svc, [NEW]);
    await journal(p);
    await p.evaluate(() => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'strat_trades') throw new Error('refused'); return real.call(this, k, v); };
    });
    await p.click('.s1box button:has-text("Yes")'); await p.waitForTimeout(300);
    const msg = await p.$eval('.s1box', e => e.textContent);
    check('A10-9 a failed save says "Not saved"', /Not saved/.test(msg), msg);
    check('A10-9 and never "Saved:"', !/Saved:/.test(msg), msg);
    const t = await stored(p, 700001);
    check('A10-9 nothing was claimed: the trade is as it was', !t.strat && t.setupReading.pendingOwner === true, t.setupReading);
    await ctx.close();
  }
  {
    const svc = service();
    const { p, ctx } = await open(svc, [NEW]);
    await journal(p);
    await p.evaluate(() => { Storage.prototype.setItem.call(localStorage, 'strat_trades', '{not a list'); });
    await p.click('.s1box button:has-text("Yes")'); await p.waitForTimeout(300);
    const msg = await p.$eval('.s1box', e => e.textContent);
    check('A10-9 an unreadable journal: "Not saved", saying it could not be read', /Not saved -- The journal on this phone could not be read/.test(msg), msg);
    check('A10-9 and the unreadable journal is not replaced', await p.evaluate(() => localStorage.getItem('strat_trades')) === '{not a list');
    await ctx.close();
  }

  // ===== A13 his confirmation survives a catch-up ========================
  {
    const svc = service();
    const { p, ctx } = await open(svc, [NEW]);
    await journal(p);
    await p.click('.s1box button:has-text("Yes")'); await p.waitForTimeout(300);
    const before = await stored(p, 700001);
    const after = await p.evaluate(fresh => {
      const live = loadTrades();
      const saved = live.find(t => t.id === 700001);
      refreshTradeFacts(saved, fresh);
      return saved;
    }, Object.assign({}, NEW, { strat: '2-2 Reversal', stratConfidence: 'high', stratNotation: '2U-2D',
      setupReading: reading({ pendingOwner: false, outcome: 'tagged-by-ai', aiChoice: { combo: '2-2 Reversal', timeframe: '15m' } }) }));
    check('A13 a catch-up with another reading changes neither his setup nor his reading', after.strat === before.strat && JSON.stringify(after.setupReading) === JSON.stringify(before.setupReading), { strat: after.strat, outcome: after.setupReading.outcome });
    await ctx.close();
  }

  // ===== D2 / A12 what is sent to be read ===============================
  {
    const svc = service();
    const OLD_UNTAGGED = Object.assign({}, OLD, { id: 600002, strat: null, play: null, fills: ['111111111121', '111111111122'] });
    const { p, ctx } = await open(svc, [OLD_UNTAGGED, RETRY]);
    await p.evaluate(() => autoClassifyLoop()); await p.waitForTimeout(800);
    const ids = svc.classify.map(c => c.trade && c.trade.id);
    check('D2 an old untagged trade is not sent to be read again', !ids.includes(600002), ids);
    check('a new-rule trade whose reading could not finish is retried', ids.includes(700002), ids);
    const sent = (svc.classify.find(c => c.trade && c.trade.id === 700002) || {}).trade || {};
    const bars = ((sent.replayData || {}).candles) || [];
    check('A12 the payload carries bars from before the entry', bars.length > 0, bars.length);
    check('A12 and not one bar from the entry minute or after', bars.every(c => c.datetime < MINUTE), bars.filter(c => c.datetime >= MINUTE).length);
    await ctx.close();
  }

  // ===== B15 the card asks, when no pop-up answer arrived ================
  {
    const svc = service();
    svc.waiting = [];
    const { p, ctx, errors } = await open(svc, [RETRY]);
    await journal(p);
    const q = await p.$eval('.s1box', e => e.textContent);
    check('B15 the card asks for the play and the timeframe', /Which play, and which timeframe did you enter on\?/.test(q), q);
    await p.click('.s1box button:has-text("FTFC Direction Play")'); await p.waitForTimeout(150);
    await p.click('.s1box button:has-text("15m")'); await p.waitForTimeout(150);
    svc.dropNextReply = true;
    await p.click('.s1box button:has-text("Save")'); await p.waitForTimeout(400);
    const lost = await p.$eval('.s1box', e => e.textContent);
    check('B15 a lost reply shows "Not saved"', /Not saved/.test(lost) && !/Saved:/.test(lost), lost);
    await p.click('.s1box button:has-text("Save")'); await p.waitForTimeout(400);
    const calls = svc.requests.filter(r => r.path === '/purchases/answer');
    check('B15 the retry carries the SAME answer id', calls.length === 2 && calls[0].body.answerId === calls[1].body.answerId, calls.map(c => c.body.answerId));
    check('B15 stored under the purchase\'s fill id, with what to create it from', calls[0].body.fillId === '133716500001' && calls[0].body.createFrom && calls[0].body.createFrom.occ === RETRY.occ, calls[0].body);
    check('B15 the app key travels with it', calls.every(c => c.auth === 'Bearer k'));
    check('B15 exactly one answer on the service', svc.history['133716500001'].length === 1);
    const t = await stored(p, 700002);
    check('B15 the answer is on the trade, as his', t.play === 'FTFC Direction Play' && t.entryTimeframe === '15m' && t.userSet.play && t.userSet.entryTimeframe && t.answerId === calls[0].body.answerId, t);
    const now = await p.$eval('.s1box', e => e.textContent);
    check('B15 the card now confirms the setup on his timeframe instead', /On your 15m chart/.test(now), now);
    check('no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ===== B11 his hand edits win =========================================
  {
    const svc = service();
    const HAND = Object.assign({}, RETRY, { id: 700003, fills: ['133716600001', '133716600002'], play: '2s Turning Into 3s', userSet: { play: true }, answerId: null, entryTimeframe: null });
    svc.answers['133716600001'] = { answerId: 'aPopup00001', fillId: '133716600001', play: 'FTFC Direction Play', timeframe: '5m', formationTimeframe: null };
    const { p, ctx } = await open(svc, [HAND]);
    await p.evaluate(() => joinPurchaseAnswers()); await p.waitForTimeout(300);
    const t = await stored(p, 700003);
    check('B11 the play he set by hand is kept', t.play === '2s Turning Into 3s', t.play);
    check('B11 the difference is recorded', t.answerDifference && t.answerDifference.play === 'FTFC Direction Play', t.answerDifference);
    check('B11 the timeframe he had not set is filled from his answer', t.entryTimeframe === '5m' && t.userSet.entryTimeframe === true && t.answerId === 'aPopup00001', t);
    const line = await p.evaluate(() => stepOneLine());
    check('B11 the difference shows behind Details', /differs from his hand-set value 1/.test(line), line);
    await p.evaluate(() => joinPurchaseAnswers()); await p.waitForTimeout(200);
    check('B11 a joined trade is not asked about again', svc.requests.filter(r => r.path === '/purchases/' || r.path === '/purchases').length === 1);
    await ctx.close();
  }

  // ===== B16 the Home line ==============================================
  for (const [label, waiting, failing, expect] of [
    ['two waiting', 2, false, /2 purchases waiting for your play and timeframe/],
    ['none waiting', 0, false, null],
    ['service cannot be asked', 2, true, null],
  ]) {
    const svc = service();
    svc.waiting = Array.from({ length: waiting }, (_, i) => ({ fillId: '13371670000' + i, occ: 'IWM   261120P00269000', ticker: 'IWM', dir: 'Short', openTimestamp: ENTRY }));
    svc.failWaiting = failing;
    const { p, ctx } = await open(svc, [OLD]);
    await p.evaluate(() => refreshPurchasesWaiting(true)); await p.waitForTimeout(300);
    const shown = await p.$eval('#purchasesWaiting', e => e.style.display !== 'none' ? e.textContent : null);
    check(`B16 ${label}`, expect ? expect.test(shown || '') : shown === null, shown);
    if (expect) check('B16 the line opens the answer page', await p.$eval('#purchasesWaiting a', a => a.getAttribute('href')) === 'answer/');
    await ctx.close();
  }

  // ===== the edit screen keeps his timeframe ============================
  {
    const svc = service();
    const { p, ctx } = await open(svc, [Object.assign({}, OLD, { strat: '2-1-2 Continuation' })]);
    await journal(p);
    await p.evaluate(() => editTrade(600001)); await p.waitForTimeout(400);
    await p.selectOption('#f_entryTimeframe', '15m');
    await p.selectOption('#f_formationTimeframe', '1H');
    await p.evaluate(() => saveTrade()); await p.waitForTimeout(400);
    const t = await stored(p, 600001);
    check('edit screen: his entry and formation timeframes are saved as his', t.entryTimeframe === '15m' && t.formationTimeframe === '1H' && t.userSet && t.userSet.entryTimeframe, t);
    await ctx.close();
  }

  await b.close(); site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASHED', e); process.exit(1); });
