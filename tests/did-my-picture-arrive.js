// He built the iPhone Shortcut, tapped it, and nothing happened -- because
// the Shortcut had no action that SHOWS anything, which was my fault. But
// the deeper fault is that he had no way to ask the other end. "It sent"
// and "it arrived" are different claims, and only the second one settles
// whether a picture from his phone actually made it.
//
// So the app now writes down what the RECEIVING end saw on every check,
// including the cases that used to return in silence: a key that was not
// accepted, a service that could not be reached, and nothing waiting at
// all. Four answers that must never share one blank.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const BASE = 'https://fake.example.com';
  const entryMs = new Date('2026-06-09T09:31:00').getTime();
  const trade = () => ({
    id:'t1', ticker:'SPY', dir:'Long', entryDate:'2026-06-09', entryTime:'09:31',
    exitDate:'2026-06-09', exitTime:'09:36', optEntry:1.11, optExit:1.22, contracts:1,
    fees:1.33, pnlDollar:11, pnlNet:9.67, winLoss:'Win', notes:'', source:'schwab-auto',
    settled:true, strat:'2-1-2 Continuation',
  });
  const img = 'data:image/png;base64,' + 'A'.repeat(2048);

  async function phone(opts){
    const o = opts || {};
    const ctx = await b.newContext({ viewport:{width:390,height:844} });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    let shots = (o.shots || []).slice();
    let asks = 0;

    // Broad rules FIRST, exact ones LAST -- the last-registered rule wins.
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/media/**', async r => {
      const u = new URL(r.request().url());
      const seg = u.pathname.split('/').filter(Boolean);
      if(seg[1] === 'pending'){
        asks++;
        if(o.refuseKey) return r.fulfill({status:403,contentType:'text/plain',body:'Forbidden'});
        if(o.unreachable) return r.abort('failed');
        // A service that was asleep: the first ask pays for waking it, the
        // next one works. Nothing is wrong, and it must not read as though
        // something is.
        if(o.asleepForFirst && asks === 1) return r.abort('failed');
        return r.fulfill({status:200,contentType:'application/json',
          body: JSON.stringify({ screenshots: shots.map(s => Object.assign({}, s, {image:null, hasImage:true})),
                                 waiting: shots.length })});
      }
      if(seg[2] === 'image'){
        const s = shots.find(x => x.id === decodeURIComponent(seg[1]));
        return r.fulfill({status:200,contentType:'application/json',
          body: JSON.stringify({ id: seg[1], image: s ? s.image : null, timestamp: s && s.timestamp,
            reason: s && s.image ? null : 'That picture was stored without any image data.' })});
      }
      if(r.request().method() === 'DELETE'){
        shots = shots.filter(x => x.id !== decodeURIComponent(seg[1]));
        return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      }
      return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    });
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));

    await p.goto(site.base + '/index.html');
    await p.evaluate((args) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url', args.base);
      localStorage.setItem('strat_app_key', 'k');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(args.journal));
    }, { base: BASE, journal: o.journal || [trade()] });
    await p.reload(); await p.waitForTimeout(900);
    const seen = async () => (await p.evaluate(() => readProblem('shotsSeen')) || {}).text || null;
    return { p, errors, seen, asks: () => asks, close: () => ctx.close() };
  }

  // ------------------------------------------------------------------
  console.log('--- nothing waiting: the commonest answer, and it used to be silence ---');
  {
    const { p, errors, seen, close } = await phone({ shots: [] });
    await p.evaluate(() => matchPendingScreenshots());
    const t = await seen();
    check('it says it asked: ' + t, !!t && /asked/i.test(t));
    check('and that nothing was waiting', !!t && /no pictures were waiting/i.test(t));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- a picture arrived and landed on a trade ---');
  {
    const { p, errors, seen, close } = await phone({ shots: [{id:'e1', timestamp: entryMs, image: img}] });
    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(300);
    const t = await seen();
    check('it reports what arrived: ' + t, !!t && /1 waiting/.test(t));
    check('and that it went on a trade', !!t && /1 attached to a trade/.test(t));
    check('it really did', await p.evaluate(() => typeof loadTrades()[0].shotEntry === 'string'));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- a picture arrived but matches no trade: NOT a fault ---');
  {
    // This is exactly what his test picture from the Shortcut looks like.
    const { p, errors, seen, close } = await phone({
      shots: [{id:'s1', timestamp: new Date('2026-06-09T02:00:00').getTime(), image: img}] });
    await p.evaluate(() => matchPendingScreenshots());
    const t = await seen();
    check('it says the picture arrived: ' + t, !!t && /1 waiting/.test(t));
    check('and that it matched no trade', !!t && /1 matched no trade yet/.test(t));
    check('it is NOT counted as attached', !!t && /0 attached to a trade/.test(t));
    check('and it is left waiting, not thrown away',
      await p.evaluate(() => loadTrades()[0].shotEntry) === undefined);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- the key was not accepted ---');
  {
    const { p, errors, seen, close } = await phone({ refuseKey: true });
    await p.evaluate(() => matchPendingScreenshots());
    const t = await seen();
    check('it says so: ' + t, !!t && /App Key was not accepted/i.test(t));
    check('and does not read as "nothing was waiting"', !!t && !/no pictures were waiting/i.test(t));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- the service could not be reached at all ---');
  {
    const { p, errors, seen, close } = await phone({ unreachable: true });
    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(6000); // it asks again before giving up
    const t = await seen();
    check('it says so: ' + t, !!t && /could not reach/i.test(t));
    check('and says it was tried twice, so one blip is never reported as down',
      !!t && /tried twice/i.test(t));
    check('and does not read as a key problem', !!t && !/App Key/i.test(t));
    check('and does not read as "nothing was waiting"', !!t && !/no pictures were waiting/i.test(t));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- the service was asleep: NOT a fault, and must not read as one ---');
  {
    // His hosting sleeps the service when nothing has talked to it. The
    // first request afterwards is the one that pays for waking it. He read
    // one of those as a fault on 2026-09-16, and so did I.
    const { p, errors, seen, asks, close } = await phone({
      asleepForFirst: true, shots: [{id:'e1', timestamp: entryMs, image: img}] });
    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(6000); // past the retry and the fetch
    const t = await seen();
    check(`it asked twice (${asks()})`, asks() >= 2);
    check('and reports the picture, not a failure: ' + t, !!t && /1 waiting/.test(t));
    check('nothing is reported as unreachable', !!t && !/could not reach/i.test(t));
    check('the picture really landed', await p.evaluate(() => typeof loadTrades()[0].shotEntry === 'string'));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- a key that is refused is settled: asking again cannot change it ---');
  {
    const { p, errors, seen, asks, close } = await phone({ refuseKey: true });
    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(500);
    check(`it asks once, not twice (${asks()})`, asks() === 1);
    const t = await seen();
    check('and says so straight away: ' + t, !!t && /App Key was not accepted/i.test(t));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- and it is printed where I can read it ---');
  {
    const { p, errors, seen, close } = await phone({ shots: [{id:'e1', timestamp: entryMs, image: img}] });
    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(300);
    const txt = await p.evaluate(() => techText());
    check('the Details text carries it', /pictures waiting: 1 waiting/.test(txt));
    check('with a time against it', /pictures waiting: [^\n]*\(\d/.test(txt));
    // A count of what is on his TRADES is a different question from what
    // turned up, and both lines must be there.
    check('alongside the count already on his trades', /pictures \d+ · recordings \d+/.test(txt));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- which copy of the app he is running ---');
  {
    // He reloaded after an update, read a message back to me, and only the
    // WORDING told me he was still on the old copy. Without that accident I
    // would have gone hunting a fault that was already fixed.
    const { p, errors, close } = await phone({});
    const txt = await p.evaluate(() => techText());
    const line = (txt.split('\n')[0] || '');
    check('the very first line says which copy this is: ' + line, /^app build /.test(line));
    check('with a stamp I set by hand', /app build \d{4}-\d{2}-\d{2}/.test(line));
    check("and the file's own date, which cannot be forgotten", /file dated .+/.test(line));
    check('it is FIRST, above everything it would otherwise explain',
      txt.indexOf('app build') === 0);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- before any check has run ---');
  {
    const ctx = await b.newContext({ viewport:{width:390,height:844} });
    const p = await ctx.newPage();
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate(() => { localStorage.clear();
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})); });
    const txt = await p.evaluate(() => techText());
    // "Not checked yet" and "checked, nothing there" are different facts.
    check('it says not checked yet, rather than nothing', /pictures waiting: not checked yet/.test(txt));
    await ctx.close();
  }

  await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
