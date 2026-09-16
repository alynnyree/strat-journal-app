// Twenty-one lines on his screen on 2026-09-16, every one of them saying
// his money was in dispute:
//
//   2026-04-09 pnlPercent kept 16.666666666666682 offered 16.7
//
// That is one number written twice. This app works the percentage out in
// two places and ROUNDS IT TO ONE DECIMAL PLACE in one of them, so it was
// arguing with itself -- and the comparison was half a cent, which is right
// for money and far too fine for a figure only ever written to a tenth.
//
// Worse than clutter: this list exists so a REAL argument about his money
// cannot be missed, and a page of rounding noise is how one gets missed.
//
// Money must stay untouched at half a cent, where two cents is a genuine
// difference and hiding it would be the opposite mistake. Both sides are
// checked here.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const trade = (o) => Object.assign({
    id:'t1', ticker:'SPY', dir:'Long', entryDate:'2026-04-09', entryTime:'09:31',
    exitDate:'2026-04-09', exitTime:'09:36', optEntry:1.11, optExit:1.22, contracts:1,
    fees:1.33, pnlDollar:11, pnlNet:9.67, winLoss:'Win', source:'schwab-auto', settled:true,
  }, o);

  const ctx = await b.newContext({ viewport:{width:390,height:844} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
    : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto(site.base + '/index.html');
  await p.evaluate(() => localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})));
  await p.reload(); await p.waitForTimeout(600);

  // ------------------------------------------------------------------
  console.log('--- what was actually on his screen ---');
  {
    const shown = await p.evaluate((t) => {
      localStorage.setItem('strat_trades', JSON.stringify([t]));
      return moneyDisagreements().map(d => d.key);
    }, trade({ moneyDisagreement: {
      pnlPercent: { kept: 16.666666666666682, offered: 16.7, seenAt: '2026-09-16T22:00:00Z' } } }));
    check(`his exact case is no longer reported (${JSON.stringify(shown)})`, shown.length === 0);
  }
  {
    // The other seven from that screen, every one a rounding artefact.
    const pairs = [[-16.129032258064512,-16.1],[-13.215859030837008,-13.2],
                   [-4.081632653061227,-4.1],[-4.494382022471914,-4.5],
                   [-0.5747126436781614,-0.6],[-16.517857142857146,-16.5],
                   [-7.936507936507932,-7.9]];
    const shown = await p.evaluate((args) => {
      localStorage.setItem('strat_trades', JSON.stringify(args.pairs.map(([kept, offered], i) =>
        Object.assign({}, args.t, { id:'t'+i,
          moneyDisagreement: { pnlPercent: { kept, offered, seenAt:'x' } } }))));
      return moneyDisagreements().length;
    }, { t: trade({}), pairs });
    check(`all seven others are silent too (${shown} shown)`, shown === 0);
  }

  // ------------------------------------------------------------------
  console.log('\n--- a percentage that REALLY differs still speaks up ---');
  {
    const shown = await p.evaluate((t) => {
      localStorage.setItem('strat_trades', JSON.stringify([t]));
      return moneyDisagreements();
    }, trade({ moneyDisagreement: {
      pnlPercent: { kept: 16.7, offered: 21.4, seenAt: 'x' } } }));
    check(`a real gap is still reported (${shown.length})`, shown.length === 1);
    check('and carries both figures', shown[0] && shown[0].kept === 16.7 && shown[0].offered === 21.4);
  }

  // ------------------------------------------------------------------
  console.log('\n--- MONEY is untouched: two cents is a real difference ---');
  {
    const shown = await p.evaluate((t) => {
      localStorage.setItem('strat_trades', JSON.stringify([t]));
      return moneyDisagreements().map(d => d.key);
    }, trade({ moneyDisagreement: {
      fees: { kept: 1.32, offered: 1.30, seenAt: 'x' },
      pnlNet: { kept: 9.67, offered: 9.69, seenAt: 'x' },
    } }));
    check(`a two-cent fee is STILL a disagreement (${JSON.stringify(shown)})`, shown.includes('fees'));
    check('and so is a two-cent after-fee figure', shown.includes('pnlNet'));
  }
  {
    // ...but a sub-cent one is not, exactly as before.
    const shown = await p.evaluate((t) => {
      localStorage.setItem('strat_trades', JSON.stringify([t]));
      return moneyDisagreements().length;
    }, trade({ moneyDisagreement: {
      fees: { kept: 1.3300001, offered: 1.33, seenAt: 'x' } } }));
    check(`a sub-cent difference is still silent (${shown})`, shown === 0);
  }

  // ------------------------------------------------------------------
  console.log('\n--- a difference that is not a number at all ---');
  {
    const shown = await p.evaluate((t) => {
      localStorage.setItem('strat_trades', JSON.stringify([t]));
      return moneyDisagreements().map(d => d.key);
    }, trade({ moneyDisagreement: {
      winLoss: { kept: 'Win', offered: 'Loss', seenAt: 'x' } } }));
    check('a win turning into a loss is always reported', shown.includes('winLoss'));
  }

  // ------------------------------------------------------------------
  console.log('\n--- and the Details block is readable again ---');
  {
    const txt = await p.evaluate((t) => {
      localStorage.setItem('strat_trades', JSON.stringify([t]));
      return techText();
    }, trade({ moneyDisagreement: {
      pnlPercent: { kept: 16.666666666666682, offered: 16.7, seenAt: 'x' } } }));
    check('it says none refused: ' + (txt.match(/money refused[^\n]*/) || [''])[0],
      /money refused 0/.test(txt));
    check('the long number is nowhere on the page', !/16\.666666666666/.test(txt));
    check('nothing threw', errors.length === 0);
  }

  await ctx.close(); await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
