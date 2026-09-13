// All three plays — and all nine combos — appear, traded or not.
//
// He reported this on 2026-09-13 with a photo of his Home tab: "I dont see
// Broadening Formation in the FTFC & Play Performance box."
//
// He was right. The card was built ONLY from the trades in his journal, so a
// play he had not taken had no row at all and simply vanished. Two of his
// three plays showed; the third was absent. On screen that reads as "the app
// is not tracking it", not as "you have not taken one" -- two completely
// different things sharing one answer, which is the fault this project keeps
// finding in new places.
//
// The SETUP card had the identical fault: seven of his nine combos were
// missing from it for the same reason. He settled it in one line -- "Yes, show
// all nine combos the same way" -- so both cards are checked here together,
// because they are one rule and must not drift apart.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const T = (i, o) => Object.assign({
    id: 'p' + i, ticker: 'SPY', dir: 'Long', occ: 'SPY   260609C0074500' + (i % 10),
    entryDate: '2026-06-09', entryTime: '09:' + String(10 + i).padStart(2,'0'),
    exitDate: '2026-06-09', exitTime: '09:' + String(40 + i).padStart(2,'0'),
    optEntry: 1.11, optExit: 1.22, contracts: 1,
    pnlDollar: 11, fees: 1.33, pnlNet: 9.67, winLoss: 'Win',
    ftfcConfirmed: true, ftfcDirection: 'BULLISH', ftfcRun: 4,
    notes: '', source: 'schwab-auto', settled: true,
  }, o);

  async function home(trades){
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue() : r.abort());
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backfilled','1');
      localStorage.removeItem('strat_backend_url');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, trades);
    await p.reload(); await p.waitForTimeout(900);
    const out = await p.evaluate(() => {
      const el = document.getElementById('playBreakdown');
      const sel = document.getElementById('setupBreakdown');
      return { text: el ? el.textContent : null, html: el ? el.innerHTML : null,
               setup: sel ? sel.textContent : null,
               picker: Array.from(document.querySelectorAll('.play-opt')).map(o=>o.getAttribute('data-v')),
               combos: Array.from(document.querySelectorAll('.combo-opt')).map(o=>o.getAttribute('data-v')) };
    });
    return { p, out, errors, close: async () => p.close() };
  }

  // ---- His exact situation: two plays used, the third never taken -------
  {
    const trades = [
      T(1, { play: 'FTFC Direction Play' }),
      T(2, { play: 'FTFC Direction Play' }),
      T(3, { play: '2s Turning Into 3s', pnlDollar: -5, pnlNet: -6.32, winLoss: 'Loss' }),
      T(4, {}), T(5, {}),
    ];
    const { out, errors, close } = await home(trades);
    check('Broadening Formation Scalp is on the card', /Broadening Formation Scalp/.test(out.text));
    check('so is FTFC Direction Play', /FTFC Direction Play/.test(out.text));
    check('so is 2s Turning Into 3s', /2s Turning Into 3s/.test(out.text));
    check('and the untagged trades still get their own line', /No play recorded/.test(out.text));
    check('the untaken play says "no trades yet", not a score of zero',
      /Broadening Formation Scalp[\s\S]{0,40}no trades yet/.test(out.text));
    check('it shows a dash rather than $0.00, which would read as break-even',
      !/Broadening Formation Scalp[\s\S]{0,80}\$0\.00/.test(out.text));
    check('and never prints a percentage of nothing', !/NaN/.test(out.text));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ---- The untaken play must not float above a real losing one ---------
  {
    const trades = [
      T(1, { play: '2s Turning Into 3s', pnlDollar: -50, pnlNet: -51.33, winLoss: 'Loss' }),
      T(2, { play: 'FTFC Direction Play' }),
    ];
    const { out, close } = await home(trades);
    const order = ['FTFC Direction Play', '2s Turning Into 3s', 'Broadening Formation Scalp']
      .map(k => out.text.indexOf(k));
    check(`plays he has taken come first, best to worst (${order.join(' < ')})`,
      order[0] < order[1] && order[1] < order[2]);
    check('a row worth nothing does not outrank a real losing play',
      out.text.indexOf('Broadening Formation Scalp') > out.text.indexOf('2s Turning Into 3s'));
    await close();
  }

  // ---- No play tagged at all: still show all three, and say why ---------
  {
    const { out, errors, close } = await home([T(1, {}), T(2, {})]);
    check('with nothing tagged, all three are still listed',
      /Broadening Formation Scalp/.test(out.text) && /FTFC Direction Play/.test(out.text)
      && /2s Turning Into 3s/.test(out.text));
    check('and it says plainly there is nothing to compare yet',
      /nothing to compare/.test(out.text));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ---- An empty journal says what it always said ------------------------
  {
    const { out, close } = await home([]);
    check('an empty journal keeps its own message', /Once your trades carry a play/.test(out.text));
    await close();
  }

  // ---- The three names come from his own picker, not a fourth copy ------
  {
    const { out, close } = await home([T(1, {})]);
    check(`the picker is the source of the three names (${out.picker.join(' · ')})`,
      out.picker.length === 3 && out.picker.every(k => out.text.includes(k)));
    await close();
  }

  // ---- And the same for all nine combos ---------------------------------
  //
  // "Yes, show all nine combos the same way" (2026-09-13).
  {
    const trades = [
      T(1, { strat: '2-1-2 Continuation' }),
      T(2, { strat: '2-2 Continuation', pnlDollar: -13, pnlNet: -14.33, winLoss: 'Loss' }),
      T(3, {}),
    ];
    const { out, errors, close } = await home(trades);
    const missing = out.combos.filter(k => !out.setup.includes(k));
    check(`all nine combos are on the card (${out.combos.length - missing.length} of ${out.combos.length})`,
      out.combos.length === 9 && missing.length === 0);
    check('including the seven he has never traded',
      /3-1-2 Reversal/.test(out.setup) && /1 Bar Rev Strat/.test(out.setup) && /PMG/.test(out.setup));
    check('an untraded combo says "no trades yet"',
      /PMG[\s\S]{0,40}no trades yet/.test(out.setup));
    check('untagged trades still get their own line', /Unclassified \(needs setup\)/.test(out.setup));
    check('and no percentage of nothing is printed', !/NaN/.test(out.setup));
    check('nothing threw', errors.length === 0);

    // A combo worth nothing must not outrank a real losing one.
    check('traded combos come first, best to worst',
      out.setup.indexOf('2-1-2 Continuation') < out.setup.indexOf('2-2 Continuation')
      && out.setup.indexOf('2-2 Continuation') < out.setup.indexOf('PMG'));
    check('a row worth nothing does not outrank a real losing setup',
      out.setup.indexOf('PMG') > out.setup.indexOf('2-2 Continuation'));
    await close();
  }

  {
    // The nine names come from his own Strat Setup cards -- one list, no
    // second copy to drift. And an empty journal keeps its own message.
    const { out, close } = await home([]);
    check('an empty journal keeps the setup card\'s own message',
      /Log trades to see which Strat setups/.test(out.setup));
    await close();
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
