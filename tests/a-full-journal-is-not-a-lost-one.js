// MEASURED, NOT ASSUMED. In a real browser: one site is given about 4.9MB,
// and a chart picture costs 35-67KB stored. Three pictures a trade means
// the wall arrives within weeks of the pictures starting to work.
//
// Two things happened when it did, and both were silent.
//
// 1. saveTrades was a bare write with nothing around it. A refused write
//    THROWS, out through whatever was rendering. This app has already shown
//    him a blank Journal holding 233 trades once.
//
// 2. A picture was deleted from the service the INSTANT it was put on the
//    trade, and the journal was only written at the end of the loop. So a
//    write refused for want of room threw the picture away at both ends at
//    once -- gone from the queue, absent from the trade, nothing said.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const entryMs = new Date('2026-06-09T09:31:00').getTime();
  const trade = () => ({
    id:'t1', ticker:'SPY', dir:'Long', entryDate:'2026-06-09', entryTime:'09:31',
    exitDate:'2026-06-09', exitTime:'09:36', optEntry:1.11, optExit:1.22, contracts:1,
    fees:1.33, pnlDollar:11, pnlNet:9.67, winLoss:'Win', source:'schwab-auto', settled:true,
  });
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(50 * 1024); // a real picture's weight

  async function phone(o){
    o = o || {};
    const ctx = await b.newContext({ viewport:{width:390,height:844} });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    const deleted = [];
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/media/**', async r => {
      const u = new URL(r.request().url());
      const seg = u.pathname.split('/').filter(Boolean);
      if(seg[1] === 'pending') return r.fulfill({status:200,contentType:'application/json',
        body: JSON.stringify({ screenshots:[{id:'e1', timestamp:entryMs, image:null, hasImage:true}] })});
      if(seg[2] === 'image') return r.fulfill({status:200,contentType:'application/json',
        body: JSON.stringify({ id:'e1', image:img, timestamp:entryMs, reason:null })});
      if(r.request().method() === 'DELETE'){ deleted.push(decodeURIComponent(seg[1]));
        return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}); }
      return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    });
    await p.goto(site.base + '/index.html');
    await p.evaluate((args) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url', 'https://fake.example.com');
      localStorage.setItem('strat_app_key', 'k');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify([args.trade]));
    }, { trade: trade() });
    await p.reload(); await p.waitForTimeout(800);
    return { p, errors, deleted, close: () => ctx.close() };
  }

  // Fills the remaining room so the very next write is refused -- the real
  // condition, not a stubbed-out one.
  const fillUp = async (p) => await p.evaluate(() => {
    // Coarse first, then finer and finer, so what is left over is bytes
    // rather than a spare block a picture could still slip into. A fill
    // that leaves headroom is not a full journal, and the first version of
    // this test proved the point by passing when it should not have.
    let n = 0;
    for(const size of [128 * 1024, 8 * 1024, 512, 32]){
      const chunk = 'x'.repeat(size);
      try{ for(let i = 0; i < 4000; i++){ localStorage.setItem(`ballast${size}_${i}`, chunk); n++; } }
      catch(e){ /* that size no longer fits; try a smaller one */ }
    }
    return n;
  });

  // ------------------------------------------------------------------
  console.log('--- the journal is full and a picture arrives ---');
  {
    const { p, errors, deleted, close } = await phone();
    const chunks = await fillUp(p);
    check(`the room really did run out (${chunks} blocks written)`, chunks > 0);
    // Proves the fill is TIGHT: even a tiny extra write is refused now.
    const tight = await p.evaluate(() => {
      try{ localStorage.setItem('probe', 'y'.repeat(4096)); localStorage.removeItem('probe'); return false; }
      catch(e){ return true; }
    });
    check('and there is not even room for a small write', tight === true);

    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(400);

    check('nothing threw on the page', errors.length === 0);
    const still = await p.evaluate(() => loadTrades().length);
    check(`his trades are still there (${still})`, still === 1);
    check('the picture is NOT left looking attached',
      await p.evaluate(() => loadTrades()[0].shotEntry) === undefined);
    // The fault that would have lost it for ever.
    check(`and it was NOT cleared from the queue (${JSON.stringify(deleted)})`, deleted.length === 0);

    const said = await p.evaluate(() => (readProblem('shots') || {}).text || null);
    check('it says why, in plain words: ' + said, !!said && /no room left/i.test(said));
    check('and never shows him raw wording from the browser',
      !!said && !/quota|exceeded|DOMException/i.test(said));
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- there is room: nothing changes ---');
  {
    const { p, errors, deleted, close } = await phone();
    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(400);
    check('the picture lands', await p.evaluate(() => typeof loadTrades()[0].shotEntry === 'string'));
    check(`and IS cleared from the queue (${JSON.stringify(deleted)})`, deleted.includes('e1'));
    check('no saving problem is invented',
      await p.evaluate(() => readProblem('saving')) === null);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- saving a trade when the room has gone ---');
  {
    const { p, errors, close } = await phone();
    await fillUp(p);
    const r = await p.evaluate(() => {
      const t = loadTrades();
      t.push(Object.assign({}, t[0], { id:'t2', notes:'x'.repeat(200000) }));
      return saveTrades(t);
    });
    check('it answers, rather than throwing', r && r.ok === false);
    check('it knows the room ran out', r.full === true);
    check('with a reason in plain words: ' + r.reason, /no room left/i.test(r.reason));
    check('his saved trades are untouched', await p.evaluate(() => loadTrades().length) === 1);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- and the room is reported before it runs out ---');
  {
    const { p, errors, close } = await phone();
    const txt = await p.evaluate(() => techText());
    const line = (txt.match(/room used[^\n]*/) || [''])[0];
    check('the Details block says how much room is used: ' + line, /room used \d+k/.test(line));
    check('and how much of it is the journal', /journal \d+k/.test(line));
    check('and how many trades carry a picture', /trades with a picture \d+/.test(line));
    check('with no saving problem when there is none', /no saving problem/.test(txt));
    check('nothing threw', errors.length === 0);
    await close();
  }

  await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
