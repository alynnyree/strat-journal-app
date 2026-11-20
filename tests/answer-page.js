// Step 1B: the "Strat Setups" answer page (answer/). Plan v4 acceptance
// tests B6 (phone and laptop), B8/B23 (lost reply: the retry is the SAME
// answer, also after a reload), B9 (a failed save is never shown as saved),
// B10 (his other device answered first: shown, and replaced only on a tap),
// B12 (the page never asks for, collects or removes a trade).
// The service is a stand-in in this file that follows the real answer rules.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if (!started.browser) { console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : JSON.stringify(d).slice(0, 300)); } };

  // ---- the stand-in service: same verdicts as purchases.js -------------
  function service() {
    const s = { history: {}, current: {}, sigs: {}, requests: [], dropNextReply: false, failNext: 0 };
    s.waiting = [{ fillId: '133716429407', occ: 'IWM   261120P00269000', ticker: 'IWM', dir: 'Short', openTimestamp: Date.UTC(2026, 10, 16, 16, 8, 34), confirmedAt: 'x' }];
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

  async function open(svc, { width = 390, height = 844, key = 'k', url = '/answer/index.html' } = {}) {
    const ctx = await b.newContext({ viewport: { width, height } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route(u => u.hostname === 'fake.example.com', async route => {
      const req = route.request();
      const u = new URL(req.url());
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      svc.requests.push({ method: req.method(), path: u.pathname, body });
      if (svc.failNext) { svc.failNext--; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }); }
      if (u.pathname === '/purchases/waiting') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ waiting: svc.waiting.filter(w => !svc.current[w.fillId]) }) });
      if (u.pathname === '/purchases/answer') {
        const [code, out] = svc.answer(body);
        if (svc.dropNextReply) { svc.dropNextReply = false; return route.abort('connectionreset'); }   // stored, reply lost
        return route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(out) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await p.goto(site.base + url);
    await p.evaluate(k => { localStorage.setItem('strat_answer_service', 'https://fake.example.com'); if (k) localStorage.setItem('strat_answer_key', k); }, key);
    await p.reload();
    await p.waitForTimeout(400);
    return { p, ctx, errors };
  }
  const PLAY_NAMES = ['Broadening Formation Scalp', 'FTFC Direction Play', '2s Turning Into 3s', 'None of these'];
  // Each choice is clicked inside ITS OWN row: "1H" is both an entry and a formation timeframe.
  const pick = async (p, label, where) => { await p.click(`${where || (PLAY_NAMES.includes(label) ? '#plays' : '#timeframes')} .chip[data-v="${label}"]`); };
  const status = p => p.$eval('#status', e => e.textContent);
  const answerCalls = svc => svc.requests.filter(r => r.path === '/purchases/answer');

  // ===== B6 phone and laptop: the ordinary save ==========================
  for (const [name, w, h] of [['phone', 390, 844], ['laptop', 1366, 800]]) {
    const svc = service();
    const { p, ctx, errors } = await open(svc, { width: w, height: h });
    await p.click('.row');
    await pick(p, 'Broadening Formation Scalp'); await pick(p, '5m');
    const saveDisabled = await p.$eval('#save', e => e.disabled);
    check(`B6 ${name}: a Broadening Formation Scalp needs its formation timeframe before Save`, saveDisabled === true);
    const offered = await p.$$eval('#formations .chip', els => els.map(e => e.dataset.v));
    check(`B6 ${name}: only LARGER timeframes are offered for the formation`, offered[0] === '15m' && !offered.includes('5m') && !offered.includes('1m'), offered);
    await pick(p, '1H', '#formations');
    await p.click('#save'); await p.waitForTimeout(300);
    check(`B6 ${name}: Saved, naming what was saved`, /^Saved: Broadening Formation Scalp on the 5m \(formation 1H\)/.test(await status(p)), await status(p));
    check(`B6 ${name}: one answer stored`, svc.history['133716429407'].length === 1);
    check(`B6 ${name}: no page errors`, errors.length === 0, errors);
    await ctx.close();
  }

  // ===== B8 / B23 a lost reply; the retry is the same answer ============
  {
    const svc = service();
    const { p, ctx } = await open(svc);
    await p.click('.row'); await pick(p, 'FTFC Direction Play'); await pick(p, '15m');
    svc.dropNextReply = true;
    await p.click('#save'); await p.waitForTimeout(300);
    check('B8 the reply is lost: the page says Not saved (never Saved)', /^Not saved/.test(await status(p)), await status(p));
    check('B8 though the service did store it', svc.history['133716429407'].length === 1);
    const firstId = answerCalls(svc)[0].body.answerId;
    // B23: a reload in between still retries with the same id.
    const keep = svc.history['133716429407'][0];
    delete svc.current['133716429407'];               // keep it listed so he can reopen it after the reload
    await p.reload(); await p.waitForTimeout(400);
    await p.click('.row');
    const restored = await p.$$eval('.chip.sel', els => els.map(e => e.dataset.v));
    check('B23 after a reload his choices are still there', restored.includes('FTFC Direction Play') && restored.includes('15m'), restored);
    svc.current['133716429407'] = keep.answerId;                                    // the service still has it
    await p.click('#save'); await p.waitForTimeout(300);
    const second = answerCalls(svc)[1].body;
    check('B23 the retry carries the SAME answer id and the same contents', second.answerId === firstId && second.play === 'FTFC Direction Play' && second.timeframe === '15m', { firstId, second });
    check('B23 and is confirmed: Saved', /^Saved/.test(await status(p)), await status(p));
    check('B23 still exactly one answer stored', svc.history['133716429407'].length === 1);
    await ctx.close();
  }

  // ===== B9 a failed save is never shown as saved =======================
  {
    const svc = service();
    const { p, ctx } = await open(svc);
    await p.click('.row'); await pick(p, '2s Turning Into 3s'); await pick(p, '3m');
    svc.failNext = 1;
    await p.click('#save'); await p.waitForTimeout(300);
    check('B9 service error: "Not saved", never "Saved"', /^Not saved/.test(await status(p)) && !/Saved:/.test(await status(p)), await status(p));
    const kept = await p.$$eval('.chip.sel', els => els.map(e => e.dataset.v));
    check('B9 his choices are kept', kept.includes('2s Turning Into 3s') && kept.includes('3m'), kept);
    check('B9 nothing stored', !(svc.history['133716429407'] || []).length);
    await ctx.close();
  }

  // ===== B10 his other device answered first ============================
  {
    const svc = service();
    svc.answer({ fillId: '133716429407', answerId: 'laptopL0001', play: 'FTFC Direction Play', timeframe: '5m' });
    svc.waiting[0] = { ...svc.waiting[0] };
    const realCurrent = svc.current['133716429407']; delete svc.current['133716429407'];
    const { p, ctx } = await open(svc);
    svc.current['133716429407'] = realCurrent;
    await p.click('.row'); await pick(p, 'None of these'); await pick(p, '30m');
    await p.click('#save'); await p.waitForTimeout(300);
    check('B10 refused, and shown the other device\'s answer', /Already answered on your other device: FTFC Direction Play on the 5m/.test(await status(p)), await status(p));
    check('B10 nothing changed on the service', svc.history['133716429407'].length === 1);
    check('B10 a Replace button is offered (nothing replaced without a tap)', await p.$eval('#replace', e => !e.hidden));
    await p.click('#replace'); await p.waitForTimeout(300);
    const last = answerCalls(svc).slice(-1)[0].body;
    check('B10 Replace names the answer it replaces', last.replaces === 'laptopL0001', last);
    check('B10 replaced: Saved, and history keeps both', /^Saved: None of these on the 30m/.test(await status(p)) && svc.history['133716429407'].length === 2, await status(p));
    await ctx.close();
  }

  // ===== B12 the page never takes a trade ================================
  {
    const svc = service();
    const all = [];
    const { p, ctx } = await open(svc);
    p.on('request', r => all.push({ method: r.method(), url: r.url() }));
    await p.click('.row'); await pick(p, 'FTFC Direction Play'); await pick(p, '1m');
    await p.click('#save'); await p.waitForTimeout(1800);
    const touched = [...svc.requests, ...all.map(r => ({ method: r.method, path: new URL(r.url).pathname }))]
      .filter(r => /\/api\/|trades|pending/.test(r.path) || r.method === 'DELETE');
    check('B12 never asks for, collects or removes a trade (no /api/, no DELETE)', touched.length === 0, touched);
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'answer', 'answer.js'), 'utf8');
    check('B12 the page\'s code has no trade-queue address in it', !/\/api\/trades|pending|DELETE/.test(src));
    await ctx.close();
  }

  // ===== first run asks for the connection, once ========================
  {
    const svc = service();
    const { p, ctx } = await open(svc, { key: null });
    check('a first visit asks for the service address and app key', await p.$eval('#setupView', e => !e.hidden));
    await p.fill('#key', 'k'); await p.click('#saveSetup'); await p.waitForTimeout(400);
    check('and then lists what is waiting', await p.$eval('#listView', e => !e.hidden) && (await p.$$('.row')).length === 1);
    await ctx.close();
  }

  await b.close(); site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASHED', e); process.exit(1); });
