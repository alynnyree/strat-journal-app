// His journal has more trades and more fees in it than his broker ever
// charged. This asks the one question that decides whether he can find them
// himself: with a second copy of a trade sitting in the journal, does the
// "Find Duplicate Trades" answer see it?
//
// Built from HIS OWN 480 broker fills, through the real pairing code, so the
// journal under test is the one his phone actually holds.
const { launch, serve } = require('./browser.js');
const { buildJournal } = require('./real-journal.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const built = buildJournal(37);
  if(!built.trades){
    console.log(`SKIPPED: ${built.reason}, so the duplicate checks cannot run against his real trades.`);
    site.stop();
  await b.close();
    process.exit(0);
  }
  const real = built.trades;
  check(`his own broker file rebuilds to 254 trades (got ${real.length})`, real.length === 254);
  const feeTotal = t => Math.round(t.reduce((s, x) => s + (x.fees || 0) * 100, 0)) / 100;
  check(`and to $404.73 of fees (got $${feeTotal(real).toFixed(2)})`, feeTotal(real) === 404.73);

  // A second copy of a trade, handed a fresh reference number the way a
  // re-import hands one out.
  const copyOf = (t, tweak) => Object.assign(JSON.parse(JSON.stringify(t)),
    { id: 'copy-' + Math.random().toString(36).slice(2) }, tweak || {});

  async function journalWith(seed){
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/api/trades/pending', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p.route('**/api/trades/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((s) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url','https://fake.example.com');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(s));
    }, seed);
    await p.reload(); await p.waitForTimeout(1200);
    return { p, errors };
  }

  // What the app itself reports when asked to find duplicates.
  async function findDupes(p){
    return await p.evaluate(() => {
      findDuplicateTrades();
      const el = document.getElementById('dupeOut');
      const txt = el ? el.textContent : '';
      return { text: txt, extras: (typeof pendingDupeRemoval !== 'undefined' && pendingDupeRemoval) ? pendingDupeRemoval.removing : 0 };
    });
  }

  const cases = [
    ['a plain second copy',                 {}],
    ['a copy with no contract code',        { occ: '' }],
    ['a copy whose contract code is absent',{ occ: undefined }],
  ];

  for(const [name, tweak] of cases){
    const extras = real.slice(0, 50).map(t => copyOf(t, tweak));
    const { p, errors } = await journalWith(real.concat(extras));
    const stored = await p.evaluate(() => loadTrades().length);
    check(`${name}: the journal holds all 304 (got ${stored})`, stored === 304);
    const got = await findDupes(p);
    check(`${name}: all 50 extra copies are found (found ${got.extras})`, got.extras === 50);
    check(`${name}: nothing on the page threw`, errors.length === 0);
    await p.close();
  }

  // The other direction, which matters more than the first: a clean journal
  // must not have a single real trade called a duplicate.
  {
    const { p, errors } = await journalWith(real);
    const got = await findDupes(p);
    check(`his 254 real trades: none is called a duplicate (${got.extras} flagged)`, got.extras === 0);
    check(`his 254 real trades: it says so plainly`, /No duplicates found/.test(got.text));
    check(`his 254 real trades: nothing threw`, errors.length === 0);
    await p.close();
  }

  // Removing them has to land him back on his broker's own figures, not just
  // on a smaller number.
  {
    const extras = real.slice(0, 50).map(t => copyOf(t, { occ: '' }));
    const { p } = await journalWith(real.concat(extras));
    await findDupes(p);
    const after = await p.evaluate(() => { removeDuplicateTrades(); const t = loadTrades();
      return { n: t.length, fees: Math.round(t.reduce((s,x)=>s+(x.fees||0)*100,0))/100 }; });
    check(`after removing them he is back to 254 trades (got ${after.n})`, after.n === 254);
    check(`and back to $404.73 of fees (got $${after.fees.toFixed(2)})`, after.fees === 404.73);
    await p.close();
  }

  // The import path, which is what let them build up in the first place.
  async function importInto(seed, pending){
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    const deleted = [];
    // Playwright checks the LAST-registered match first, so the narrow one goes last.
    await p.route('**/api/trades/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/pending', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p.route('**/api/trades/pending/**', r => { deleted.push(r.request().url()); return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}); });
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((s) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url','https://fake.example.com');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(s));
    }, seed);
    await p.reload(); await p.waitForTimeout(1200);
    const out = await p.evaluate(async (pend) =>
      await autoImportPendingTrades('https://fake.example.com', pend), pending);
    const stored = await p.evaluate(() => loadTrades());
    await p.close();
    return { out, stored, errors, deleted };
  }

  {
    // Fifty of his trades saved WITHOUT a contract code, and the server
    // handing those same fifty trades back with their codes. Before this was
    // fixed, all fifty were written down a second time -- every pass.
    const codeless = real.slice(0, 50).map(t => copyOf(t, { occ: '' }));
    const rest = real.slice(50);
    const arriving = real.slice(0, 50).map(t => copyOf(t));
    const { out, stored, errors, deleted } = await importInto(rest.concat(codeless), arriving);
    check(`a codeless saved trade coming back is not written down again (${out.imported} imported)`, out.imported === 0);
    check(`the journal still holds 254 trades (got ${stored.length})`, stored.length === 254);
    check(`the fees are still $404.73 (got $${(Math.round(stored.reduce((s,x)=>s+(x.fees||0)*100,0))/100).toFixed(2)})`,
      Math.round(stored.reduce((s,x)=>s+(x.fees||0)*100,0))/100 === 404.73);
    check(`every trade now records its contract code`, stored.every(t => String(t.occ||'').trim()));
    check(`the server's copy of all fifty was cleared (${deleted.length})`, deleted.length === 50);
    check(`nothing threw`, errors.length === 0);
  }

  {
    // A genuinely NEW trade must still get in.
    const fresh = copyOf(real[0], { occ: 'IWM   260710C00230000', ticker: 'IWM' });
    const { out, stored } = await importInto(real, [fresh]);
    check(`a trade he really did take is still imported (${out.imported})`, out.imported === 1);
    check(`leaving him with 255 (got ${stored.length})`, stored.length === 255);
  }

  {
    // Two DIFFERENT contracts that happen to share every other detail must
    // never be merged, and a codeless copy that could belong to either is
    // left alone rather than guessed at.
    const base = real[0];
    const a = copyOf(base, { occ: 'SPY   260710C00640000' });
    const bb = copyOf(base, { occ: 'SPY   260710C00641000' });
    const blank = copyOf(base, { occ: '' });
    const { p } = await journalWith([a, bb, blank]);
    const got = await findDupes(p);
    check(`two different contracts sharing every detail are not merged (${got.extras} flagged)`, got.extras === 0);
    check(`and a codeless copy that could be either is left alone`, /No duplicates found/.test(got.text));
    await p.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  site.stop();
  await b.close();
  process.exit(fail ? 1 : 0);
})();
