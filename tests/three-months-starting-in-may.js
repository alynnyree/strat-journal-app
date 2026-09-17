// HIS INSTRUCTION, and he had to give it twice: "all these months in the
// journal was unnecessary and to build it out for only 3 months back
// starting in May."
//
// Why it never held: the range asked of his broker was read from his own
// journal -- back to the OLDEST trade it held. His journal holds 2025
// trades, so it asked for eleven months, so eleven months came back, and
// anything that slipped the duplicate check was written down, which made
// the journal older, which made the next request reach further back.
//
// A LOOP. 205 trades to 248 in four hours of an evening he did not trade,
// while his broker's own file for SEVEN months rebuilds to 254.
//
// The floor is a date now, and it binds in three places at once -- what is
// asked for, what is accepted, and what is kept. A rule enforced in one of
// those is a rule that leaks; the old 90-day default leaked exactly that
// way because the app passed its own hardcoded copy.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const t = (id, entryDate, o) => Object.assign({
    id, ticker:'SPY', dir:'Long', entryDate, entryTime:'09:31',
    exitDate: entryDate, exitTime:'09:36', optEntry:1.11, optExit:1.22, contracts:1,
    occ:'SPY   '+id+'C00600000', fills:['f'+id+'a','f'+id+'b'],
    fees:1.33, pnlDollar:11, pnlNet:9.67, winLoss:'Win', source:'schwab-auto', settled:true,
  }, o || {});

  async function phone(journal){
    const ctx = await b.newContext({ viewport:{width:390,height:844} });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    const deleted = [];
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/pending/**', r => {
      if(r.request().method() === 'DELETE') deleted.push(decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop()));
      return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    });
    await p.goto(site.base + '/index.html');
    await p.evaluate((args) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url', 'https://fake.example.com');
      localStorage.setItem('strat_app_key', 'k');
      localStorage.setItem('strat_backfilled','1');
      localStorage.removeItem('strat_before_may');
      localStorage.setItem('strat_trades', JSON.stringify(args.journal));
    }, { journal });
    await p.reload(); await p.waitForTimeout(900);   // the trim runs at startup
    return { p, errors, deleted, close: () => ctx.close() };
  }

  // ------------------------------------------------------------------
  console.log('--- the journal is put back to May onwards ---');
  {
    const journal = [
      t('a', '2025-10-14'), t('b', '2025-12-02'),   // last year
      t('c', '2026-01-15'), t('d', '2026-04-09'),   // this year, too early
      t('e', '2026-05-01'), t('f', '2026-06-09'), t('g', '2026-07-23'),
    ];
    const { p, errors, close } = await phone(journal);
    const left = await p.evaluate(() => loadTrades().map(x => x.entryDate).sort());
    check(`three kept, four set aside (${JSON.stringify(left)})`, left.length === 3);
    check('the first of May is KEPT -- the floor is inclusive', left.includes('2026-05-01'));
    check('nothing from before it survives', !left.some(d => d < '2026-05-01'));

    // Destructive, so nothing is destroyed.
    const aside = await p.evaluate(() => JSON.parse(localStorage.getItem('strat_before_may') || '[]'));
    check(`the four are set aside, not deleted (${aside.length})`, aside.length === 4);
    check('and can be handed straight back', aside.every(x => x.id && x.entryDate && x.optEntry != null));

    const said = await p.evaluate(() => (readProblem('trim') || {}).text || null);
    check('it says what it removed: ' + said, !!said && /4 trades from before 2026-05-01/.test(said));
    check('over what dates', !!said && /2025-10-14 to 2026-04-09/.test(said));
    check('and what they were worth', !!said && /\$/.test(said));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- THE LOOP: what is asked for can no longer be dragged back ---');
  {
    // A journal still holding a 2025 trade would have asked for eleven
    // months. This is the line that breaks it.
    const { p, errors, close } = await phone([t('a','2025-10-14'), t('f','2026-06-09')]);
    const days = await p.evaluate(() => historyDaysToAsk([
      { entryDate: '2025-10-14' }, { entryDate: '2026-06-09' }
    ]));
    const sinceMay = Math.ceil((Date.now() - Date.parse('2026-05-01T00:00:00')) / 86400000) + 2;
    check(`it asks back to May, not to last year (${days} days, May is ~${sinceMay})`,
      Math.abs(days - sinceMay) <= 2);
    check('which is far less than the eleven months it used to ask for', days < 200);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- and an older trade arriving is refused, not compared ---');
  {
    const { p, errors, deleted, close } = await phone([t('f','2026-06-09')]);
    const before = await p.evaluate(() => loadTrades().length);
    await p.evaluate(async () => {
      await autoImportPendingTrades('https://fake.example.com', [
        { id:'old1', ticker:'SPY', dir:'Long', entryDate:'2026-02-14', entryTime:'09:31',
          exitDate:'2026-02-14', exitTime:'09:36', optEntry:1.5, optExit:1.9, contracts:3,
          occ:'SPY   260214C00600000', fills:['z1','z2'], fees:2, pnlDollar:120 },
      ]);
    });
    await p.waitForTimeout(300);
    check(`the journal did not grow (${before} -> ${await p.evaluate(() => loadTrades().length)})`,
      await p.evaluate(() => loadTrades().length) === before);
    check(`and it was cleared from the queue rather than offered for ever (${JSON.stringify(deleted)})`,
      deleted.includes('old1'));
    // It must NOT be recorded as an addition -- it was never added.
    check('it is not written down as a new trade', (await p.evaluate(() => readAdded())).length === 0);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- a trade inside the three months still lands ---');
  {
    const { p, errors, close } = await phone([t('f','2026-06-09')]);
    await p.evaluate(async () => {
      await autoImportPendingTrades('https://fake.example.com', [
        { id:'new1', ticker:'SPY', dir:'Long', entryDate:'2026-07-02', entryTime:'10:15',
          exitDate:'2026-07-02', exitTime:'10:22', optEntry:2.0, optExit:2.5, contracts:1,
          occ:'SPY   260702C00600000', fills:['y1','y2'], fees:1.3, pnlDollar:50 },
      ]);
    });
    await p.waitForTimeout(300);
    check(`it lands (${await p.evaluate(() => loadTrades().length)} trades)`,
      await p.evaluate(() => loadTrades().length) === 2);
    check('the floor blocks the past, not the present', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- a trade with no date at all is never thrown away ---');
  {
    // No date is not a reason to destroy one of his trades.
    const { p, errors, close } = await phone([t('f','2026-06-09'), t('x', '', { entryDate: null })]);
    check('it survives the trim', await p.evaluate(() => loadTrades().length) === 2);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- and it is said on screen, not left to be discovered ---');
  {
    const { p, errors, close } = await phone([t('c','2026-01-15'), t('f','2026-06-09')]);
    const txt = await p.evaluate(() => techText());
    check('the Details block says where the journal starts', /journal starts 2026-05-01/.test(txt));
    check('and what was set aside', /1 trade from before 2026-05-01/.test(txt));
    check('nothing threw', errors.length === 0);
    await close();
  }

  await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
