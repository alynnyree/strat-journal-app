// HE ASKED WHETHER HIS NUMBERS CAN BE TRUSTED, AND NOTHING COULD ANSWER.
//
// His journal went 205 -> 211 -> 215 -> 234 -> 248 in four hours of an
// evening he did not trade. That is the same shape as the fault that once
// put 161 contracts in his journal he never bought, and the only evidence
// either of us had was a number going up.
//
// Reading the de-duplication cannot settle it. It looks right -- and it
// looked right the last three times too. What was missing is the thing this
// project keeps having to learn: an arrival that lands as NEW must say what
// it looked like and what it was compared against, AT THE MOMENT it lands.
//
// This proves it does, and that the near-miss it records is the saved trade
// it should have recognised -- which is what names the hole.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const saved = (o) => Object.assign({
    id:'saved1', ticker:'SPY', dir:'Long', entryDate:'2026-06-09', entryTime:'09:31',
    exitDate:'2026-06-09', exitTime:'09:36', optEntry:1.11, optExit:1.22, contracts:1,
    occ:'SPY   260609C00600000', fills:['f1','f2'],
    fees:1.33, pnlDollar:11, pnlNet:9.67, winLoss:'Win', source:'schwab-auto', settled:true,
  }, o);
  const arriving = (o) => Object.assign({
    id:'new1', ticker:'SPY', dir:'Long', entryDate:'2026-06-09', entryTime:'09:31',
    exitDate:'2026-06-09', exitTime:'09:36', optEntry:1.11, optExit:1.22, contracts:1,
    occ:'SPY   260609C00600000', fills:['f1','f2'],
    fees:1.33, pnlDollar:11,
  }, o);

  async function phone(journal, pending){
    const ctx = await b.newContext({ viewport:{width:390,height:844} });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((args) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url', 'https://fake.example.com');
      localStorage.setItem('strat_app_key', 'k');
      localStorage.setItem('strat_backfilled','1');
      localStorage.removeItem('strat_added_log');
      localStorage.setItem('strat_trades', JSON.stringify(args.journal));
    }, { journal });
    await p.reload(); await p.waitForTimeout(700);
    await p.evaluate(async (pend) => {
      await autoImportPendingTrades('https://fake.example.com', pend);
    }, pending);
    await p.waitForTimeout(200);
    return { p, errors, close: () => ctx.close() };
  }

  const log = p => p.evaluate(() => readAdded());
  const count = p => p.evaluate(() => loadTrades().length);

  // ------------------------------------------------------------------
  console.log('--- the same trade arriving again is NOT added, and not logged ---');
  {
    const { p, errors, close } = await phone([saved()], [arriving()]);
    check(`still one trade (${await count(p)})`, await count(p) === 1);
    check('and nothing was written down as new', (await log(p)).length === 0);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('--- a GENUINELY different trade is added, and says so ---');
  {
    const other = arriving({ id:'new2', entryTime:'10:15', exitTime:'10:22',
      optEntry:2.05, optExit:2.40, fills:['f9','f10'], occ:'SPY   260609C00610000' });
    const { p, errors, close } = await phone([saved()], [other]);
    check(`now two trades (${await count(p)})`, await count(p) === 2);
    const l = await log(p);
    check(`one addition written down (${l.length})`, l.length === 1);
    check('with what it looked like: ' + (l[0] && l[0].what), !!l[0] && /10:15->10:22/.test(l[0].what));
    check('its contract code', !!l[0] && /610000/.test(l[0].code));
    check('how many fills it cited', !!l[0] && l[0].fills === 2);
    check('and that there was no near miss', !!l[0] && l[0].nearMisses.length === 0);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('--- THE CASE THAT MATTERS: a near-copy slips through ---');
  {
    // Same contract, same day, same minutes, same prices -- but a different
    // SIZE, which is precisely the phantom shape: one real trade paired
    // twice. It cites different fills, so the fill check cannot catch it,
    // and the shape differs, so the shape check cannot either.
    const phantom = arriving({ id:'new3', contracts:2, fills:['f3','f4'] });
    const { p, errors, close } = await phone([saved()], [phantom]);
    const l = await log(p);
    check(`it was added (${await count(p)} trades) -- which is the thing to explain`, await count(p) === 2);
    check(`and it is written down (${l.length})`, l.length === 1);
    check('naming the saved trade it should have recognised: '
      + (l[0] && l[0].nearMisses[0]), !!l[0] && l[0].nearMisses.length >= 1);
    check('the near miss shows the difference -- x1 against x2',
      !!l[0] && /x1/.test(l[0].nearMisses[0]) && /x2/.test(l[0].what));
    check('and how many of his trades share that day and ticker',
      !!l[0] && l[0].sameDaySameTicker === 1);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('--- and I can read it without asking him for anything ---');
  {
    const phantom = arriving({ id:'new4', contracts:2, fills:['f3','f4'] });
    const { p, errors, close } = await phone([saved()], [phantom]);
    const txt = await p.evaluate(() => techText());
    check('the Details block carries it', /trades added as new \(last 1\)/.test(txt));
    check('with the near miss spelled out', /NEAR:/.test(txt));
    check('and says "none recorded yet" is a different answer from an empty list',
      !/trades added as new: none recorded yet/.test(txt));
    check('nothing threw', errors.length === 0);
    await close();
  }
  {
    const { p, errors, close } = await phone([saved()], []);
    const txt = await p.evaluate(() => techText());
    check('with nothing added, it says so plainly', /trades added as new: none recorded yet/.test(txt));
    check('nothing threw', errors.length === 0);
    await close();
  }

  await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
