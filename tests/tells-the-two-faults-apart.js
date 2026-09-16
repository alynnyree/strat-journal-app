// Two things read straight off his own screen on 2026-09-16.
//
// 1. The corner badge said "Not connected" -- in exactly the same words and
//    the same red as a service that cannot be reached -- when what had
//    actually happened was that his Schwab sign-in ran out. One needs ONE
//    tap from him and is why trades stop arriving every seventh day; the
//    other needs nothing from him at all. He would have had to open the
//    Journal tab to tell them apart, and the whole point of this app is
//    that he does not open it.
//
// 2. The Details block was baked in when the Checks page was drawn and
//    never touched again, so "pictures waiting: not checked yet" went on
//    saying that however many checks had run since. I read one of those and
//    started reasoning from it.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const BASE = 'https://fake.example.com';
  const trade = () => ({
    id:'t1', ticker:'SPY', dir:'Long', entryDate:'2026-06-09', entryTime:'09:31',
    exitDate:'2026-06-09', exitTime:'09:36', optEntry:1.11, optExit:1.22, contracts:1,
    fees:1.33, pnlDollar:11, pnlNet:9.67, winLoss:'Win', notes:'', source:'schwab-auto', settled:true,
  });

  async function phone(o){
    const ctx = await b.newContext({ viewport:{width:390,height:844} });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/auth/status*', r => r.fulfill({status:200,contentType:'application/json',
      body: JSON.stringify(o.auth || {})}));
    await p.route('**/media/pending*', r => r.fulfill({status:200,contentType:'application/json',
      body: JSON.stringify({ screenshots: o.shots || [], waiting: (o.shots||[]).length })}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((args) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url', args.base);
      localStorage.setItem('strat_app_key', 'k');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify([args.trade]));
    }, { base: BASE, trade: trade() });
    await p.reload(); await p.waitForTimeout(700);
    const badge = async () => await p.evaluate(() => {
      const el = document.getElementById('connBadge');
      const dot = el && el.querySelector('.conn-dot');
      return { text: el ? el.textContent.trim() : null,
               dot: dot ? dot.className : null,
               colour: el ? el.style.color : null };
    });
    return { p, errors, badge, close: () => ctx.close() };
  }

  // ------------------------------------------------------------------
  console.log('--- the sign-in has run out: ONE tap from him fixes it ---');
  {
    const { p, errors, badge, close } = await phone({});
    await p.evaluate(() => setConnState(false, 'Schwab sign-in has run out · 205 trades saved here', 'signin'));
    const bd = await badge();
    check('the badge says what is actually wrong: ' + bd.text, /sign-in needed/i.test(bd.text));
    check('and does NOT say "not connected"', !/not connected/i.test(bd.text));
    check('it is not marked the same as unreachable', !/\boff\b/.test(bd.dot));
    check('it is marked as needing him', /needsyou/.test(bd.dot));
    check('and coloured as a warning, not a failure', /gold/.test(bd.colour || ''));
    // The Journal tab's fuller line must still carry the detail.
    const line = await p.evaluate(() => document.getElementById('connStateText').textContent);
    check('the fuller line still says his trades are safe: ' + line, /205 trades saved here/.test(line));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- the service cannot be reached: nothing for him to do ---');
  {
    const { p, errors, badge, close } = await phone({});
    await p.evaluate(() => setConnState(false, 'Not connected — your 205 saved trades are still here'));
    const bd = await badge();
    check('the badge says not connected: ' + bd.text, /not connected/i.test(bd.text));
    check('and does NOT claim a sign-in problem', !/sign-in/i.test(bd.text));
    check('marked as a failure, not as needing him', /\boff\b/.test(bd.dot) && !/needsyou/.test(bd.dot));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- connected ---');
  {
    const { p, errors, badge, close } = await phone({});
    await p.evaluate(() => setConnState(true, 'Connected · 205 trades in your journal'));
    const bd = await badge();
    check('says connected: ' + bd.text, /^connected$/i.test(bd.text));
    check('and is marked as good', /\bon\b/.test(bd.dot));
    check('with no warning colour', !/gold/.test(bd.colour || ''));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- the Details block keeps up, instead of freezing at "not checked yet" ---');
  {
    const { p, errors, close } = await phone({ shots: [] });
    // The block only exists once the Checks page has been drawn.
    await p.evaluate(() => renderChecklist());
    await p.waitForTimeout(400);
    // Open it BEFORE any picture check has run -- his exact situation.
    await p.evaluate(() => {
      const el = document.getElementById('techDetails');
      if(el) el.style.display = 'none';
      toggleTechDetails();
    });
    const first = await p.evaluate(() => document.getElementById('techDetails').textContent);
    check('it starts by saying it has not checked: ' + /not checked yet/.test(first),
      /pictures waiting: not checked yet/.test(first));

    // Now a check runs, exactly as the thirty-second one does.
    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(6000); // past one refresh

    const second = await p.evaluate(() => document.getElementById('techDetails').textContent);
    check('and then it updates itself: ' + (second.match(/pictures waiting: [^\n]*/) || [''])[0],
      /pictures waiting: Asked, and no pictures were waiting/.test(second));
    check('the old line is gone', !/pictures waiting: not checked yet/.test(second));

    // Closing it must stop the refreshing, or it runs for ever.
    await p.evaluate(() => toggleTechDetails());
    const stopped = await p.evaluate(() => techTimer === null);
    check('closing it stops the refreshing', stopped === true);
    check('nothing threw', errors.length === 0);
    await close();
  }

  await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
