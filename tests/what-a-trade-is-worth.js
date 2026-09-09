// The line on the Home screen that says what an average trade is worth.
//
// He asked for it by name (2026-09-08): average win, average loss, and the
// two put together. It is the one figure that explains a whole year, so the
// bar is that it must reproduce his real total EXACTLY -- built from his own
// broker fills through the real pairing code, not from made-up trades.
const { launch, serve } = require('./browser.js');
const { buildJournal } = require('./real-journal.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  async function home(trades){
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/api/trades/pending*', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p.route('**/api/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, trades);
    await p.reload(); await p.waitForTimeout(1100);
    const line = await p.evaluate(() => (document.getElementById('statEdgeNote')||{}).textContent || '');
    return { p, line, errors };
  }

  const T = (o) => Object.assign({
    id: 'x'+Math.random().toString(36).slice(2), ticker:'SPY', dir:'Long',
    occ:'SPY   260604C00755000', entryDate:'2026-06-04', entryTime:'10:20',
    exitDate:'2026-06-04', exitTime:'10:44', optEntry:0.55, optExit:0.71,
    contracts:1, ftfc:{}, notes:'', source:'schwab-auto', settled:true, fillAttempts:1,
  }, o);
  const money = (d, fee) => ({ pnlDollar: d + fee, fees: fee, pnlNet: d });

  const built = buildJournal(37);
  if(built.trades){
    const { p, line, errors } = await home(built.trades);
    console.log('   ' + line);
    check(`his own 254 trades are on file (${built.trades.length})`, built.trades.length === 254);
    check('the line names the average win ($29.31)', /Average win \$29\.31/.test(line));
    check('and the average loss ($30.87)', /average loss \$30\.87/.test(line));
    check('and what an average trade is worth (-$4.33)', /an average trade is worth -\$4\.33/.test(line));
    // The whole point: it has to multiply back up to the real total, which
    // his broker's own file says is -$1,100.73.
    check('and it multiplies back to his real total (-$1100.73)', /across 254 trades that is -\$1100\.73/.test(line));
    check('nothing on the page threw', errors.length === 0);
    await p.close();
  } else {
    console.log(`SKIPPED the real-data checks: ${built.reason}.`);
  }

  {
    // Two wins and two losses, worked by hand: wins 100 and 50, losses 20
    // and 30. Average win 75, average loss 25, average trade (100+50-20-30)/4 = 25.
    const { p, line } = await home([
      T(money(100, 1)), T(money(50, 1)), T(money(-20, 1)), T(money(-30, 1)),
    ]);
    check(`hand-worked: average win $75.00 (${line.slice(0,40)})`, /Average win \$75\.00/.test(line));
    check('hand-worked: average loss $25.00', /average loss \$25\.00/.test(line));
    check('hand-worked: an average trade is worth $25.00', /an average trade is worth \$25\.00/.test(line));
    check('hand-worked: across 4 trades that is $100.00', /across 4 trades that is \$100\.00/.test(line));
    await p.close();
  }

  {
    // A break-even trade counts as a WIN -- his choice (2026-09-08) -- so it
    // must land in the win side of this line too, or this and the win rate
    // above it would disagree.
    const { p, line } = await home([ T(money(100, 1)), T(money(0, 1)) ]);
    check(`break-even counts as a win, so the average win is $50.00 (${line.slice(0,36)})`,
      /Average win \$50\.00/.test(line));
    check('and with no losing trade it says so', /no losses yet/.test(line));
    await p.close();
  }

  {
    const { p, line } = await home([ T(money(-40, 1)), T(money(-60, 1)) ]);
    check('all losses: it says there are no wins yet', /No wins yet/.test(line));
    check('all losses: average loss $50.00', /average loss \$50\.00/.test(line));
    await p.close();
  }

  {
    // A trade whose fee is not known has no after-fee figure, so it is left
    // out here exactly as it is left out of the win rate and the total.
    const { p, line } = await home([
      T(money(100, 1)), T(money(-50, 1)),
      T({ pnlDollar: 999, fees: null, pnlNet: null }),
    ]);
    check(`a trade with no fee is left out, so it is 2 trades not 3 (${line.slice(-30)})`,
      /across 2 trades that is \$50\.00/.test(line));
    await p.close();
  }

  {
    const { p, line, errors } = await home([]);
    check('an empty journal shows nothing at all rather than a zero', line.trim() === '');
    check('and does not throw', errors.length === 0);
    await p.close();
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
