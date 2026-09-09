// What collecting his trades costs, and how far back the app asks.
//
// Two things he asked for on 2026-09-09, in one change, because both are
// about the same thing: his hosting was suspended for going over its free
// monthly data allowance and nothing could import at all.
//
//   "Stop the automatic catch-up asking for a full year and cut down how
//    much the app downloads so the allowance won't be a problem"
//
// The full year had to go for a second reason too. He had just said: "Let's
// keep the journal where it is as far as trades imported. We don't need
// anything past March." A flat 365 would have pulled January and February
// back in on its own the first time the connection returned -- the app
// quietly undoing his decision.
//
// And the download: the whole waiting queue arrived in ONE answer, every
// thirty seconds the app was open, with every trade's chart bars inside it.
// Measured on the real route, 100 waiting trades is 3,022KB an answer -- and
// during a re-import nearly every one of those trades is already on file, so
// the bars were downloaded and thrown away.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const bars = (n) => ({
    candles: Array.from({length:n}, (_,i) => ({ time: 1757000000 + i*60, open:601, high:602, low:600, close:601.5, volume:1 })),
    entryIndex: 2, exitIndex: 5,
  });

  // A trade as the server hands it over.
  const arriving = (i, o) => Object.assign({
    id: 'p' + i, ticker:'SPY', dir:'Long', occ:'SPY   260609C0074500' + (i % 10),
    entryDate:'2026-06-09',
    // Every one genuinely different. An earlier version of this repeated a
    // contract, both minutes, both prices and the size every twenty trades
    // -- which IS one trade seen twice, and the app was right to collapse
    // them. The test was wrong, not the app.
    entryTime: String(9 + Math.floor(i/60)).padStart(2,'0') + ':' + String(i % 60).padStart(2,'0'),
    exitDate:'2026-06-09',
    exitTime: String(10 + Math.floor(i/60)).padStart(2,'0') + ':' + String(i % 60).padStart(2,'0'),
    entryTimestamp: 1757000000000 + i*1000, exitTimestamp: 1757000300000 + i*1000,
    optEntry: 1.11 + i/100, optExit: 1.22 + i/100, contracts: 1, fees: 1.33, pnlDollar: 11, pnlNet: 9.67,
    undEntry: 601.2, undExit: 601.5, undEntrySource:'alpaca',
    ftfc:{'1D':'BULLISH'}, ftfcRun:4, ftfcConfirmed:true, ftfcDirection:'BULLISH',
    fills: ['b'+i, 's'+i],
  }, o);

  // The saved form of the same trade, as it would already sit in his journal.
  const saved = (i, o) => Object.assign({}, arriving(i), {
    winLoss:'Win', notes:'', source:'schwab-auto', settled:true, fillAttempts:1,
  }, o);

  // A phone talking to a server that understands the lighter requests.
  async function phone(journal, queue, opts){
    const o = opts || {};
    const ctx = await b.newContext({ viewport:{width:390,height:844} });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));

    const asked = { list: [], replay: [], backfill: [], deleted: [] };
    let left = queue.slice();

    // Broad rules FIRST, exact ones LAST -- the last-registered rule is the
    // one that runs, and getting this backwards once cost a whole run.
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/backfill', async r => {
      asked.backfill.push(JSON.parse(r.request().postData() || '{}'));
      return r.fulfill({status:200,contentType:'application/json',body:'{"started":true}'});
    });
    await p.route('**/api/trades/pending**', async r => {
      const u = new URL(r.request().url());
      if(/\/replay$/.test(u.pathname)){
        const id = u.pathname.split('/').slice(-2)[0];
        asked.replay.push(id);
        const t = queue.find(x => x.id === id);
        const has = t && t.__bars;
        return r.fulfill({status:200,contentType:'application/json',
          body: JSON.stringify({ id, replayData: has ? bars(300) : null,
                                 reason: has ? null : 'No chart bars were saved for this trade.' })});
      }
      if(r.request().method() === 'DELETE'){
        const id = decodeURIComponent(u.pathname.split('/').pop());
        asked.deleted.push(id);
        left = left.filter(x => x.id !== id);
        return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      }
      const slim = u.searchParams.get('slim') === '1';
      const limit = parseInt(u.searchParams.get('limit'), 10);
      asked.list.push({ slim, limit });
      // An OLDER server ignores both and hands everything over with the
      // bars inline, exactly as it always did.
      if(o.oldServer){
        const body = JSON.stringify({ pending: left.map(t => Object.assign({}, t, { replayData: t.__bars ? bars(300) : null })) });
        return r.fulfill({status:200,contentType:'application/json',body});
      }
      let out = Number.isFinite(limit) && limit > 0 ? left.slice(0, limit) : left.slice();
      if(slim) out = out.map(t => Object.assign({}, t, { replayData: null, replayWaiting: !!t.__bars }));
      return r.fulfill({status:200,contentType:'application/json',
        body: JSON.stringify({ pending: out, waiting: left.length })});
    });
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));

    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url','https://fake.example.com');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, journal);
    await p.reload(); await p.waitForTimeout(900);
    return { p, asked, errors, close: () => ctx.close() };
  }

  // ---- 1. It asks the lighter way ---------------------------------------
  {
    const { p, asked, errors, close } = await phone([], []);
    await p.evaluate(() => pollBackendOnce('https://fake.example.com', true));
    check(`it asks without the chart bars (${JSON.stringify(asked.list[0])})`, asked.list[0] && asked.list[0].slim === true);
    check('and for a page at a time, not the whole queue', asked.list[0] && asked.list[0].limit === 25);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ---- 2. Bars are fetched ONLY for trades it keeps ----------------------
  //
  // This is the whole point. A re-import hands back every trade he already
  // has; each of those used to arrive carrying 300 chart bars that were
  // read once and discarded.
  {
    const journal = Array.from({length: 12}, (_,i) => saved(i));
    const queue = Array.from({length: 12}, (_,i) => Object.assign(arriving(i), { __bars: true }));
    const { p, asked, errors, close } = await phone(journal, queue);
    await p.evaluate(() => pollBackendOnce('https://fake.example.com', true));
    const stored = await p.evaluate(() => loadTrades());
    check(`twelve trades he already has stay twelve (${stored.length})`, stored.length === 12);
    check(`and not one set of chart bars is downloaded (${asked.replay.length})`, asked.replay.length === 0);
    check(`every one is still cleared from the queue (${new Set(asked.deleted).size})`,
      new Set(asked.deleted).size === 12);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ---- 3. A new trade DOES get its chart ---------------------------------
  {
    const journal = Array.from({length: 12}, (_,i) => saved(i));
    const fresh = Array.from({length: 3}, (_,i) => Object.assign(arriving(50+i), { __bars: true }));
    const queue = Array.from({length: 12}, (_,i) => Object.assign(arriving(i), { __bars: true })).concat(fresh);
    const { p, asked, errors, close } = await phone(journal, queue);
    await p.evaluate(() => pollBackendOnce('https://fake.example.com', true));
    const stored = await p.evaluate(() => loadTrades());
    check(`the three new ones are added (${stored.length} trades now)`, stored.length === 15);
    check(`and exactly three sets of bars are asked for (${asked.replay.length})`, asked.replay.length === 3);
    check('for the new trades and nothing else',
      asked.replay.sort().join(',') === ['p50','p51','p52'].sort().join(','));
    const added = stored.filter(t => ['p50','p51','p52'].includes(t.id));
    check(`all three can be replayed (${added.filter(t => (t.replayData||{}).candles).length} of 3)`,
      added.length === 3 && added.every(t => ((t.replayData||{}).candles||[]).length === 300));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ---- 4. It works its way through a long queue --------------------------
  {
    const queue = Array.from({length: 60}, (_,i) => Object.assign(arriving(i), { __bars: false }));
    const { p, asked, errors, close } = await phone([], queue);
    await p.evaluate(() => pollBackendOnce('https://fake.example.com', true));
    const stored = await p.evaluate(() => loadTrades());
    check(`all sixty are collected in one check (${stored.length})`, stored.length === 60);
    check(`in pages, not one enormous answer (${asked.list.length} rounds)`, asked.list.length >= 3);
    check('and every page asked the lighter way', asked.list.every(a => a.slim === true && a.limit === 25));
    check(`the queue is emptied (${asked.deleted.length} cleared)`, asked.deleted.length === 60);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ---- 5. A server that has not been updated yet -------------------------
  //
  // It ignores both requests and hands everything over with the bars inside,
  // exactly as before. That must still work, or an app update would break
  // his import until the other half caught up.
  {
    const queue = Array.from({length: 4}, (_,i) => Object.assign(arriving(i), { __bars: true }));
    const { p, asked, errors, close } = await phone([], queue, { oldServer: true });
    await p.evaluate(() => pollBackendOnce('https://fake.example.com', true));
    const stored = await p.evaluate(() => loadTrades());
    check(`an older server still imports every trade (${stored.length})`, stored.length === 4);
    check('with their charts, straight from the list',
      stored.every(t => ((t.replayData||{}).candles||[]).length === 300));
    check(`and no extra requests are made for bars already in hand (${asked.replay.length})`, asked.replay.length === 0);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ---- 6. No chart bars must say WHY -------------------------------------
  {
    const queue = [Object.assign(arriving(1), { __bars: false })];
    const { p, errors, close } = await phone([], queue);
    await p.evaluate(() => pollBackendOnce('https://fake.example.com', true));
    const stored = await p.evaluate(() => loadTrades());
    check(`the trade still arrives (${stored.length})`, stored.length === 1);
    check('with no chart', !stored[0].replayData);
    check(`and a reason rather than a blank (${(stored[0].replayMissingReason||'').slice(0,40)})`,
      /no chart bars/i.test(stored[0].replayMissingReason || ''));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ---- 7. How far back it asks -------------------------------------------
  {
    const march = [
      saved(1, { id:'m1', entryDate:'2026-03-02', exitDate:'2026-03-02' }),
      saved(2, { id:'m2', entryDate:'2026-07-23', exitDate:'2026-07-23' }),
    ];
    const { p, asked, errors, close } = await phone(march, []);
    const days = await p.evaluate(() => historyDaysToAsk());
    const expected = Math.ceil((Date.now() - Date.parse('2026-03-02T00:00:00')) / 86400000) + 2;
    check(`it asks back to his oldest trade, not a flat year (${days} days, expected ${expected})`, days === expected);
    check(`which does not reach January or February (${days} days)`, days < 250);

    await p.evaluate(() => forceRemeasure());
    await p.waitForTimeout(400);
    check(`and the request it actually sends carries that (${JSON.stringify(asked.backfill[0])})`,
      asked.backfill.length === 1 && asked.backfill[0].daysBack === expected);
    check('nothing threw', errors.length === 0);
    await close();
  }

  {
    // An EMPTY journal is the exception: nothing of his to protect, and this
    // is the recovery path that brings his trades back. It asks for the year.
    const { p, errors, close } = await phone([], []);
    const days = await p.evaluate(() => historyDaysToAsk());
    check(`an empty journal still asks for a full year (${days})`, days === 365);
    check('nothing threw', errors.length === 0);
    await close();
  }

  {
    // A trade with no date must not silently become "ask for everything".
    const odd = [saved(1, { id:'x1', entryDate:'' }), saved(2, { id:'x2', entryDate:'2026-06-01' })];
    const { p, close } = await phone(odd, []);
    const days = await p.evaluate(() => historyDaysToAsk());
    const expected = Math.ceil((Date.now() - Date.parse('2026-06-01T00:00:00')) / 86400000) + 2;
    check(`a trade with no date is skipped, not treated as the oldest (${days}, expected ${expected})`, days === expected);
    await close();
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
