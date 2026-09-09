// Why "Get My Trades" imported nothing, over and over.
//
// The server keeps a record of the LAST import and hands that same record
// out until a new run replaces it. Asking for a new import answers
// instantly and starts the work a moment later — so the first look
// afterwards gets the PREVIOUS run's record, marked finished. The app
// stopped the moment it saw "finished", having collected nothing, and
// reported the old run's conclusion as though it were this one's.
//
// The server here behaves exactly like the real one: it holds the old
// record for a beat after being asked, then writes its own.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const TRADE = (n) => ({
    id: 'srv-' + n, ticker:'SPY', dir:'Long', occ:'SPY   260604C0075500' + n,
    entryDate:'2026-06-04', entryTime:'10:2'+n, exitDate:'2026-06-04', exitTime:'10:4'+n,
    optEntry:0.55, optExit:0.71, contracts:1, pnlDollar:16, fees:1.32, pnlNet:14.68,
    winLoss:'Win', ftfc:{}, source:'schwab-auto', fills:['b'+n,'s'+n],
  });

  // holdOldRecordMs: how long the server keeps handing out the previous
  // run's record after being asked for a new import. The real one does
  // this because the request is answered before the work begins.
  async function phone({ saved = [], willFind = [], holdOldRecordMs = 4000,
                         reportsStartTimes = true, neverStarts = false } = {}){
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    let askedAt = null;
    let queue = [];
    const OLD = { status:'done', phase:'done', startedAt:'2026-09-09T04:00:00.000Z',
                  finishedAt:'2026-09-09T04:03:00.000Z', windowsAsked:12, windowsOk:12,
                  windowsFailed:0, failures:[], oldestWindowWithData:'2025-10-14' };
    const record = () => {
      if(askedAt === null) return OLD;
      const since = Date.now() - askedAt;
      if(since < holdOldRecordMs || neverStarts) return OLD;      // the stale one
      if(since < holdOldRecordMs + 2500){
        queue = willFind.slice();
        return { ...OLD, status:'running', phase:'asking-schwab',
                 startedAt:'2026-09-09T05:00:00.000Z', finishedAt:null, oldestWindowWithData:null };
      }
      return { ...OLD, startedAt:'2026-09-09T05:00:00.000Z', finishedAt:'2026-09-09T05:02:00.000Z' };
    };
    const strip = (r) => { if(!reportsStartTimes){ const c = {...r}; delete c.startedAt; return c; } return r; };
    await p.route('**/api/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/reset', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/backfill', r => { askedAt = Date.now();
      return r.fulfill({status:200,contentType:'application/json',body:'{"started":true}'}); });
    await p.route('**/api/trades/backfill/status', r => r.fulfill({status:200,contentType:'application/json',
      body: JSON.stringify({ backfill: strip(record()) })}));
    await p.route('**/api/trades/pending', r => { const out = queue; queue = [];
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({pending: out})}); });
    await p.route('**/api/trades/pending/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url','https://fake.example.com');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, saved);
    await p.reload(); await p.waitForTimeout(1000);
    return { p, errors };
  }

  const tap = async (p) => {
    await p.click('.navbar .item[data-view="journal"]'); await p.waitForTimeout(300);
    await p.click('#btnGetTrades');
    // Generous: the empty-journal case runs the whole collect twice.
    await p.waitForFunction(() => !document.getElementById('btnGetTrades').disabled,
      null, { timeout: 180000, polling: 500 });
    await p.waitForTimeout(400);
    return await p.evaluate(() => ({
      said: (document.getElementById('syncStatus')||{}).textContent || '',
      trades: loadTrades().length,
    }));
  };

  {
    // His exact case: empty journal, the server holding the old "finished"
    // record for four seconds before starting for real.
    const { p, errors } = await phone({ saved: [], willFind: [1,2,3].map(TRADE) });
    const r = await tap(p);
    check(`the trades arrive instead of nothing (${r.trades} of 3)`, r.trades === 3);
    check(`and it does not report the old run's conclusion (${r.said.slice(0,55)})`,
      !/Nothing new/.test(r.said) && !/already in your journal/.test(r.said));
    check('nothing threw', errors.length === 0);
    await p.close();
  }

  {
    // A journal that already has trades, and a real new one waiting.
    const { p } = await phone({ saved: [1,2].map(TRADE), willFind: [3].map(TRADE) });
    const r = await tap(p);
    check(`an existing journal still gains its new trade (${r.trades})`, r.trades === 3);
    await p.close();
  }

  {
    // The server takes a long time to start. It must WAIT rather than
    // reading the old record and declaring the import finished.
    const { p } = await phone({ saved: [], willFind: [1].map(TRADE), holdOldRecordMs: 9000 });
    const t0 = Date.now();
    const r = await tap(p);
    check(`a slow start is waited out, not mistaken for finished (${r.trades} trade, ${Math.round((Date.now()-t0)/1000)}s)`,
      r.trades === 1);
    await p.close();
  }

  {
    // A server whose record never changes cannot be told apart, so it must
    // stop on its own rather than hang for ever.
    const { p, errors } = await phone({ saved: [], willFind: [], neverStarts: true });
    const t0 = Date.now();
    const r = await tap(p);
    const secs = Math.round((Date.now() - t0) / 1000);
    check(`a record that never changes gives up rather than hanging (${secs}s)`, secs < 100);
    check(`and says the journal is empty rather than "nothing new" (${r.said.slice(0,45)})`,
      /journal is empty/.test(r.said));
    check('nothing threw', errors.length === 0);
    await p.close();
  }

  {
    // An older server that reports no start time at all is taken at face
    // value exactly as before -- no worse than it was.
    const { p, errors } = await phone({ saved: [1].map(TRADE), willFind: [], reportsStartTimes: false });
    const r = await tap(p);
    check(`a server that reports no start time still answers (${r.said.slice(0,40)})`, r.said.length > 0);
    check('and does not throw', errors.length === 0);
    await p.close();
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
