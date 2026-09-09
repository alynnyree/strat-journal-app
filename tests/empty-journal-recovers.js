// "Nothing new. Schwab served history back to 2025-10-14 and every trade in
// it is already in your journal — still 0."
//
// He photographed that on 2026-09-09 with an empty journal, after I told him
// to erase it. Every word was produced correctly and the sentence was untrue.
//
// The cause: the server keeps its own list of which of Schwab's fills it has
// already turned into trades, so a second look finds nothing new. Erasing
// the journal on the phone never told it to forget that list. So his trades
// could not be brought back at all by the button he was pointed at, and the
// app reported it as an all-clear.
//
// These cases stand the phone and the server out of step on purpose.
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

  // A server that behaves like his did: it has already handed everything
  // over, so its queue is empty until its memory is cleared.
  async function phone({ saved = [], heldBack = [], resetWorks = true } = {}){
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    let memoryCleared = false;
    let resetCalls = 0;
    const queue = () => memoryCleared ? heldBack : [];
    // Playwright checks the LAST-registered match first, so the broad rules
    // go first and the exact ones last. Getting this backwards made every
    // narrow rule dead and cost a whole run.
    await p.route('**/api/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/backfill', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    // The app reads the progress from inside a "backfill" wrapper.
    await p.route('**/api/trades/backfill/status', r => r.fulfill({status:200,contentType:'application/json',
      body: JSON.stringify({ backfill: { status:'done', windowsAsked:12, windowsOk:12, windowsFailed:0,
                             failures:[], oldestWindowWithData:'2025-10-14' } })}));
    await p.route('**/api/trades/pending', r => r.fulfill({status:200,contentType:'application/json',
      body: JSON.stringify({ pending: queue() })}));
    await p.route('**/api/trades/pending/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/reset', r => {
      resetCalls++;
      if(!resetWorks) return r.fulfill({status:500,contentType:'application/json',body:'{"error":"no"}'});
      memoryCleared = true;
      return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    });
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url','https://fake.example.com');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, saved);
    await p.reload(); await p.waitForTimeout(1000);
    return { p, errors, resets: () => resetCalls };
  }

  const tap = async (p) => {
    await p.click('.navbar .item[data-view="journal"]'); await p.waitForTimeout(300);
    await p.click('#btnGetTrades');
    await p.waitForFunction(() => !document.getElementById('btnGetTrades').disabled, { timeout: 60000 });
    await p.waitForTimeout(400);
    return await p.evaluate(() => ({
      said: (document.getElementById('syncStatus')||{}).textContent || '',
      trades: loadTrades().length,
    }));
  };

  {
    // Exactly his situation: journal erased, server still holding all of it.
    const held = [1,2,3].map(TRADE);
    const { p, errors, resets } = await phone({ saved: [], heldBack: held });
    const r = await tap(p);
    check(`his trades come back on ONE tap (${r.trades} of 3)`, r.trades === 3);
    check(`and it cleared the server's memory to do it (${resets()} time)`, resets() === 1);
    check(`it never claims they are "already in your journal" (${r.said.slice(0,60)})`,
      !/already in your journal/.test(r.said));
    check('nothing threw', errors.length === 0);
    await p.close();
  }

  {
    // The same, but clearing the memory fails. It must say which part
    // refused -- never fall through to a cheerful all-clear.
    const { p, errors, resets } = await phone({ saved: [], heldBack: [1].map(TRADE), resetWorks: false });
    const r = await tap(p);
    check(`when that cannot be done it says so (${r.said.slice(0,70)})`,
      /could not be brought back/.test(r.said));
    check('and does not call an empty journal fine', !/already in your journal/.test(r.said));
    check(`it tried exactly once, not in a loop (${resets()})`, resets() === 1);
    check('nothing threw', errors.length === 0);
    await p.close();
  }

  {
    // A journal that already has trades and genuinely has nothing new must
    // be left completely alone -- rebuilding it underneath him would be a
    // far worse fault than the one being fixed.
    const { p, resets } = await phone({ saved: [1,2].map(TRADE), heldBack: [3].map(TRADE) });
    const r = await tap(p);
    check(`a journal with trades is not rebuilt (${resets()} resets)`, resets() === 0);
    check(`and keeps its trades (${r.trades})`, r.trades === 2);
    check(`and is told plainly there was nothing new (${r.said.slice(0,50)})`,
      /Nothing new/.test(r.said) && /already in your journal/.test(r.said));
    await p.close();
  }

  {
    // Erasing the journal must clear the server's memory THEN, so this
    // situation cannot arise in the first place.
    const { p, resets } = await phone({ saved: [1,2].map(TRADE), heldBack: [1,2].map(TRADE) });
    await p.click('.navbar .item[data-view="journal"]'); await p.waitForTimeout(300);
    p.on('dialog', d => d.accept());
    await p.evaluate(async () => { await wipeData(); });
    await p.waitForTimeout(600);
    const after = await p.evaluate(() => ({ trades: loadTrades().length,
      said: (document.getElementById('syncStatus')||{}).textContent || '' }));
    check(`erasing empties the journal (${after.trades})`, after.trades === 0);
    check(`and clears the server's memory at the same time (${resets()})`, resets() === 1);
    check(`and says how to get them back (${after.said.slice(0,50)})`, /Get My Trades/.test(after.said));
    const r = await tap(p);
    check(`so one tap brings them straight back (${r.trades})`, r.trades === 2);
    await p.close();
  }

  {
    // A run still going must never trigger any of this.
    const p2 = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    let resetCalls = 0;
    await p2.route('**/api/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p2.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p2.route('**/api/trades/pending', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p2.route('**/api/trades/backfill/status', r => r.fulfill({status:200,contentType:'application/json',
      body: '{"backfill":{"status":"running","windowsAsked":12,"windowsOk":3,"windowsFailed":0,"failures":[],"oldestWindowWithData":"2025-10-14"}}'}));
    await p2.route('**/api/trades/reset', r => { resetCalls++; return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}); });
    await p2.goto(site.base + '/index.html');
    await p2.evaluate(() => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url','https://fake.example.com');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades','[]');
    });
    await p2.reload(); await p2.waitForTimeout(900);
    await p2.click('.navbar .item[data-view="journal"]'); await p2.waitForTimeout(300);
    await p2.click('#btnGetTrades');
    await p2.waitForTimeout(6000);
    check(`a run still going is never interrupted (${resetCalls} resets)`, resetCalls === 0);
    await p2.close();
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
