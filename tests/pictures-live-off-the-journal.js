// MEASURED, not assumed. The journal's own store gives one site about
// 4.9MB, and a chart picture costs 35-67KB. Three a trade across 234
// trades is far past that -- his journal would have stopped being able to
// save within weeks. The other store his browser offers measured 829MB
// offered and 195MB of real picture-sized pieces written without complaint.
//
// So the picture moves there and the TRADE keeps only a mark. Twenty-five
// places ask "has this trade got a picture?" and a truthy mark leaves every
// one of them working as written -- but the three places that SHOW or SEND
// a picture had to change, and this is what proves they did.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const entryMs = new Date('2026-06-09T09:31:00').getTime();
  const BIG = 'data:image/jpeg;base64,' + 'A'.repeat(60 * 1024);
  const trade = (o) => Object.assign({
    id:'t1', ticker:'SPY', dir:'Long', entryDate:'2026-06-09', entryTime:'09:31',
    exitDate:'2026-06-09', exitTime:'09:36', optEntry:1.11, optExit:1.22, contracts:1,
    fees:1.33, pnlDollar:11, pnlNet:9.67, winLoss:'Win', source:'schwab-auto', settled:true,
    strat:'2-2 Continuation', play:'FTFC Direction Play',
  }, o);

  async function phone(o){
    o = o || {};
    const ctx = await b.newContext({ viewport:{width:390,height:844} });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    const sent = [];
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/ai/classify*', async r => {
      sent.push(JSON.parse(r.request().postData() || '{}'));
      return r.fulfill({status:200,contentType:'application/json',body:'{"queued":true}'});
    });
    await p.route('**/media/**', async r => {
      const u = new URL(r.request().url());
      const seg = u.pathname.split('/').filter(Boolean);
      if(seg[1] === 'pending') return r.fulfill({status:200,contentType:'application/json',
        body: JSON.stringify({ screenshots: o.shots || [] })});
      if(seg[2] === 'image') return r.fulfill({status:200,contentType:'application/json',
        body: JSON.stringify({ id:'e1', image:BIG, timestamp:entryMs, reason:null })});
      return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    });
    await p.goto(site.base + '/index.html');
    await p.evaluate((args) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url', 'https://fake.example.com');
      localStorage.setItem('strat_app_key', 'k');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(args.journal));
    }, { journal: o.journal || [trade()] });
    await p.reload(); await p.waitForTimeout(900);
    return { p, errors, sent, close: () => ctx.close() };
  }

  const journalBytes = p => p.evaluate(() => (localStorage.getItem('strat_trades') || '').length);

  // ------------------------------------------------------------------
  console.log('--- a picture arrives: the journal must not grow by its size ---');
  {
    const { p, errors, close } = await phone({ shots:[{id:'e1', timestamp:entryMs, image:null, hasImage:true}] });
    const before = await journalBytes(p);
    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(600);
    const after = await journalBytes(p);

    check(`the journal barely moves (${before} -> ${after} bytes)`, after - before < 2000);
    check('but the trade is marked as having one',
      await p.evaluate(() => !!loadTrades()[0].shotEntry));
    check('and the mark is NOT the picture',
      await p.evaluate(() => !String(loadTrades()[0].shotEntry).startsWith('data:')));

    const got = await p.evaluate(async () => (await pictureOn(loadTrades()[0], 'shotEntry')).image);
    check(`the picture itself comes back whole (${got ? got.length : 0} chars)`,
      typeof got === 'string' && got.length > 60000);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- pictures already in his journal are moved across once ---');
  {
    const old = trade({ shotEntry: BIG, shotExit: BIG });
    const { p, errors, close } = await phone({ journal:[old] });
    await p.waitForTimeout(900); // the move runs on its own at startup
    const after = await journalBytes(p);
    check(`the journal shrank to almost nothing (${after} bytes)`, after < 3000);
    check('both marks are still there', await p.evaluate(() =>
      !!loadTrades()[0].shotEntry && !!loadTrades()[0].shotExit));
    const both = await p.evaluate(async () => {
      const t = loadTrades()[0];
      return [(await pictureOn(t,'shotEntry')).image, (await pictureOn(t,'shotExit')).image];
    });
    check('and both pictures survived the move', both[0] && both[1] &&
      both[0].length > 60000 && both[1].length > 60000);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- the AI is still given the picture, not the mark ---');
  {
    const { p, errors, sent, close } = await phone({ journal:[trade({ shotEntry: BIG, strat:null, play:null })] });
    await p.waitForTimeout(900);
    await p.evaluate(() => classifyOneTrade(loadTrades()[0]));
    await p.waitForTimeout(400);
    check(`one request was made (${sent.length})`, sent.length === 1);
    const t = sent[0] && sent[0].trade;
    check('it carries the picture itself', !!t && typeof t.shotEntry === 'string'
      && t.shotEntry.startsWith('data:') && t.shotEntry.length > 60000);
    check('and never the bare mark', !!t && t.shotEntry !== 'kept');
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- his export is his one way back, so it must carry them ---');
  {
    const { p, errors, close } = await phone({ journal:[trade({ shotEntry: BIG })] });
    await p.waitForTimeout(900);
    const exported = await p.evaluate(async () => {
      let captured = null;
      const realCreate = URL.createObjectURL;
      URL.createObjectURL = (blob) => { captured = blob; return 'blob:stub'; };
      const realClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function(){};
      await exportDataAsync();
      URL.createObjectURL = realCreate;
      HTMLAnchorElement.prototype.click = realClick;
      return captured ? JSON.parse(await captured.text()) : null;
    });
    check('the export was produced', Array.isArray(exported) && exported.length === 1);
    check('and carries the whole picture, not the mark',
      exported && typeof exported[0].shotEntry === 'string'
      && exported[0].shotEntry.startsWith('data:') && exported[0].shotEntry.length > 60000);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- a trade with no picture is not given one ---');
  {
    const { p, errors, close } = await phone({ journal:[trade()] });
    await p.waitForTimeout(900);
    const got = await p.evaluate(async () => await pictureOn(loadTrades()[0], 'shotEntry'));
    check('it answers with no picture', got && got.image === null);
    check('and says why rather than handing back a blank: ' + (got && got.reason),
      !!(got && got.reason) && /no picture/i.test(got.reason));
    check('nothing threw', errors.length === 0);
    await close();
  }

  await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
