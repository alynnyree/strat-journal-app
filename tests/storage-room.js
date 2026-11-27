// The journal's room on this phone (owner, 27 Nov 2026: "I authorize the
// storage detail line, the Safari keep request, and the error message fix";
// "Yes to the home warning line").
//
// On 20 Nov 2026 Safari refused to save his journal: the site's saved items
// had reached 2,577k characters, and the message on screen blamed the
// service, which was fine. Checked here:
//   1. Details names every saved item and its size, largest first -- and
//      never shows a value (his app key least of all);
//   2. the app asks Safari to keep its data, records the answer, and a "no",
//      a missing feature or a failure never stops the journal;
//   3. the Home line appears only past 70%, and says "full" when a save was
//      refused for room;
//   4. a failed collection says WHICH part failed and never guesses.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if (!started.browser) { console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : JSON.stringify(d).slice(0, 300)); } };
  const BANNED = /\b(server|memory|MB|uptime|rebuild|attempt|cooldown|API|endpoint|cache)\b/i;
  const TRADE = { id: 900001, ticker: 'SPY', dir: 'Long', occ: 'SPY   260604C00755000', entryDate: '2026-06-04', entryTime: '10:20', exitDate: '2026-06-04', exitTime: '10:44',
    entryTimestamp: 1780000000000, exitTimestamp: 1780001440000, optEntry: 0.55, optExit: 0.71, contracts: 2, pnlDollar: 32, winLoss: 'Win', fees: 2.66, pnlNet: 29.34,
    fills: ['111111111111', '111111111112'], settled: true, source: 'schwab-auto' };

  // storage: { persisted, persist } behaviour, or null for "no navigator.storage"
  async function open({ extra = {}, storage = { persisted: false, persist: true }, routes } = {}) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(st => {
      window.__persistAsked = 0;
      if (st === null) { try { Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true }); } catch (e) {} return; }
      const fake = {
        estimate: async () => ({ usage: 123456, quota: 999999999 }),
        persisted: async () => st.persisted,
        persist: async () => { window.__persistAsked++; if (st.persist === 'throw') throw new Error('refused to ask'); return st.persist; },
      };
      Object.defineProperty(navigator, 'storage', { value: fake, configurable: true });
    }, storage);
    await p.route(u => u.hostname === 'fake.example.com', async route => {
      const u = new URL(route.request().url());
      if (routes && routes(u, route)) return;
      if (u.pathname.startsWith('/api/trades/pending')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"pending":[]}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await p.goto(site.base + '/index.html');
    await p.evaluate(({ t, extra }) => {
      localStorage.clear();
      localStorage.setItem('strat_intro', JSON.stringify({ on: false, motion: false }));
      localStorage.setItem('strat_backend_url', 'https://fake.example.com');
      localStorage.setItem('strat_app_key', 'SECRETWORD');
      localStorage.setItem('strat_backfilled', '1');
      localStorage.setItem('strat_trades', JSON.stringify([t]));
      for (const [k, n] of Object.entries(extra)) localStorage.setItem(k, 'x'.repeat(n));
    }, { t: TRADE, extra });
    await p.reload(); await p.waitForTimeout(1200);
    return { p, ctx, errors };
  }
  const K = 1024;

  // ===== 1. the Details line =============================================
  {
    const { p, ctx, errors } = await open({ extra: { strat_before_may: 300 * K, strat_set_aside_extras: 120 * K } });
    const line = await p.evaluate(() => storageLine());
    check('1 Details names each saved item with its size, largest first', /saved items, largest first: strat_before_may 300k · strat_set_aside_extras 120k/.test(line), line);
    check('1 and the room used against the 2,577k at which Safari refused a save', /room used \d+k of 2577k \(\d+%; Safari refused a save at 2577k on 20 Nov\)/.test(line), line);
    check('1 a value is never shown (the app key least of all)', !/SECRETWORD/.test(line));
    check('1 Safari\'s answer is on the line', /kept by Safari: yes/.test(line) && /Safari's own count for this site: 121k used/.test(line), line);
    check('no page errors', errors.length === 0, errors);
    await ctx.close();
  }

  // ===== 2. the Safari keep request ======================================
  {
    let { p, ctx, errors } = await open({ storage: { persisted: false, persist: true } });
    check('2 the app asks Safari to keep its data, once, at start', await p.evaluate(() => window.__persistAsked) === 1);
    check('2 a yes is recorded', await p.evaluate(() => keepState.result) === 'yes');
    await ctx.close();
    ({ p, ctx, errors } = await open({ storage: { persisted: true, persist: true } }));
    check('2 already kept: not asked again', await p.evaluate(() => window.__persistAsked) === 0 && await p.evaluate(() => keepState.result) === 'yes');
    await ctx.close();
    ({ p, ctx, errors } = await open({ storage: { persisted: false, persist: false } }));
    const no = await p.evaluate(() => keepState);
    check('2 a no is recorded with why, and is not a fault', no.result === 'no' && /Home Screen/.test(no.why) && errors.length === 0, no);
    await ctx.close();
    ({ p, ctx, errors } = await open({ storage: { persisted: false, persist: 'throw' } }));
    const threw = await p.evaluate(() => keepState);
    const trades = await p.evaluate(() => loadTrades().length);
    check('2 a failure to ask is recorded in its own words, and the journal still works', threw.result === 'could not ask' && /refused to ask/.test(threw.why) && trades === 1 && errors.length === 0, { threw, errors });
    await ctx.close();
    ({ p, ctx, errors } = await open({ storage: null }));
    const none = await p.evaluate(() => keepState);
    check('2 a browser that cannot be asked says so, and nothing breaks', none.result === 'cannot be asked' && errors.length === 0, { none, errors });
    await ctx.close();
  }

  // ===== 3. the Home line ================================================
  {
    let { p, ctx } = await open({ extra: { strat_before_may: 1000 * K } });
    check('3 under 70%: no line on Home', await p.$eval('#storageWarning', e => e.style.display === 'none'));
    await ctx.close();
    ({ p, ctx } = await open({ extra: { strat_before_may: 1950 * K } }));
    const t = await p.$eval('#storageWarning', e => e.style.display !== 'none' ? e.textContent : null);
    check('3 past 70%: one line, with the share', /The journal's space on this phone is 7\d% full/.test(t || ''), t);
    check('3 and it says nothing is lost', /Nothing is lost, and nothing for you to do\./.test(t || ''));
    check('3 in plain words', t && !BANNED.test(t), t);
    // A save refused for room.
    await p.evaluate(() => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'strat_trades') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return real.call(this, k, v); };
      const live = loadTrades(); live[0].notes = 'x'; saveTrades(live); renderDashboard();
    });
    const full = await p.$eval('#storageWarning', e => ({ text: e.textContent, cls: e.className }));
    check('3 a save refused for room: "full", in red, and his trades are safe', /space on this phone is full/.test(full.text) && /waiting safely/.test(full.text) && /stop/.test(full.cls) && !BANNED.test(full.text), full);
    await ctx.close();
  }

  // ===== 4. a failed collection names the part that failed ===============
  const WAITING = { ...TRADE, id: 900002, fills: ['222222222221', '222222222222'], entryTimestamp: 1780100000000, exitTimestamp: 1780101000000, entryTime: '11:00', exitTime: '11:20' };
  const statusAfterGet = async p => { await p.evaluate(() => pollBackend(false)); await p.waitForTimeout(600); return p.$eval('#syncStatus', e => e.textContent); };
  {
    const deletes = [];
    let offer = false;   // the trade is offered only once the phone is full (the app also collects by itself on opening)
    const { p, ctx } = await open({ routes: (u, route) => {
      if (u.pathname.startsWith('/api/trades/pending/')) { deletes.push(u.pathname); route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); return true; }
      if (u.pathname.startsWith('/api/trades/pending')) { route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pending: offer ? [WAITING] : [] }) }); return true; }
      return false;
    } });
    await p.evaluate(() => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'strat_trades') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return real.call(this, k, v); };
    });
    offer = true;
    const msg = await statusAfterGet(p);
    check('4 the phone is full: says so, and that the trades wait safely', /^New trades were not added: There is no room left on this phone/.test(msg) && /waiting safely on your journal's service and arrive once there is room/.test(msg), msg);
    check('4 and never blames the service', !/backend|actually running|URL/.test(msg), msg);
    check('4 nothing was released from the service', deletes.length === 0, deletes);
    check('4 and the trade is not in the journal yet (it waits)', await p.evaluate(() => loadTrades().length) === 1);
    await ctx.close();
  }
  {
    const { p, ctx } = await open({ routes: (u, route) => { if (u.pathname.startsWith('/api/trades/pending')) { route.abort('connectionrefused'); return true; } return false; } });
    const msg = await statusAfterGet(p);
    check('4 the service cannot be reached: says exactly that', /^Could not reach your journal's service \(/.test(msg) && !/actually running/.test(msg), msg);
    await ctx.close();
  }
  {
    const { p, ctx } = await open({ routes: (u, route) => { if (u.pathname.startsWith('/api/trades/pending')) { route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); return true; } return false; } });
    const msg = await statusAfterGet(p);
    check('4 the service answers with a fault: says it did not hand them over, and its answer', /^Your journal's service did not hand over the waiting trades \(it answered 500\)\./.test(msg), msg);
    await ctx.close();
  }

  await b.close(); site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASHED', e); process.exit(1); });
