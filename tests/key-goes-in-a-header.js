// The App Key leaves the phone in a header, on EVERY request to his trade
// service, and on nothing else. Security repair, Phase 1 (30 Sept 2026).
//
// Checked on the real page, by watching what the browser actually sends --
// not by reading the code -- because the whole point is that no request can
// forget it, including ones added later.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : '-> ' + JSON.stringify(d)); } };

  const BASE = 'https://fake.example.com';
  const OTHER = 'https://elsewhere.example.org';

  async function phone(refuse){
    const ctx = await b.newContext({ viewport:{width:390,height:844} });
    const p = await ctx.newPage();
    const errors = [], seen = [];
    p.on('pageerror', e => errors.push(e.message));
    // Broad rule first; Playwright checks the last-registered route first.
    await p.route('**/*', r => {
      const u = r.request().url();
      if(u.startsWith(site.base)) return r.continue();
      seen.push({ url: u, auth: r.request().headers()['authorization'] || null, type: r.request().headers()['content-type'] || null });
      if(refuse && u.startsWith(BASE)) return r.fulfill({ status: 403, contentType:'text/plain', body:'Forbidden' });
      return r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' });
    });
    await p.goto(site.base + '/index.html');
    await p.evaluate((base) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url', base + '/');
      localStorage.setItem('strat_app_key', 'the-key');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', '[]');
    }, BASE);
    await p.reload(); await p.waitForTimeout(1500);
    return { p, errors, seen, close: () => ctx.close() };
  }

  console.log('--- every request to his service carries the key in a header ---');
  {
    const { p, errors, seen, close } = await phone(false);
    // A few more of the app's own requests, made the way the app makes them.
    await p.evaluate(async (other) => {
      await fetch(backendUrl() + '/api/trades/pending?slim=1&limit=25');
      await fetch(backendUrl() + '/ai/classify?key=' + encodeURIComponent(appKey()), { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
      await fetch(other + '/something');
    }, OTHER);
    await p.waitForTimeout(300);
    const toService = seen.filter(s => s.url.startsWith(BASE));
    const toOthers = seen.filter(s => !s.url.startsWith(BASE));
    check('the app talked to his service (' + toService.length + ' requests)', toService.length >= 3, toService.length);
    const missing = toService.filter(s => s.auth !== 'Bearer the-key');
    check('EVERY one of them carried the key in the header', missing.length === 0, missing.map(m => m.url));
    const posted = toService.find(s => s.url.includes('/ai/classify?'));
    check('the header did not replace the request\'s own headers (Content-Type kept)',
      posted && /application\/json/.test(posted.type || ''), posted);
    check('nothing outside his service was ever sent the key', toOthers.every(s => s.auth === null), toOthers);
    check('no errors on the page', errors.length === 0, errors);
    await close();
  }

  console.log('--- a refused key is written down, in its own words, and cleared ---');
  {
    const { p, errors, close } = await phone(true);
    const r = await p.evaluate(async () => (await fetch(backendUrl() + '/api/trades/pending')).status);
    check('the refusal reaches the app unchanged (403)', r === 403, r);
    const noted = await p.evaluate(() => readProblem('appKey'));
    check('it is recorded as a key refusal', !!noted && /does not match/.test(noted.text), noted);
    const details = await p.evaluate(() => { try{ return techText(); }catch(e){ return 'THREW ' + e.message; } });
    check('the Details block says so', /app key refused/.test(details), (details.match(/app key[^\n]*/) || [])[0]);
    await p.evaluate(() => pollBackendOnce(backendUrl(), false));
    await p.waitForTimeout(300);
    const status = await p.evaluate(() => (document.getElementById('syncStatus') || {}).textContent || '');
    check('Get My Trades says the key does not match, not "check the backend is running"',
      /App Key does not match/.test(status) && !/backend is actually running/.test(status), status);
    // Now the service accepts it again.
    await p.unroute('**/*');
    await p.route('**/*', rt => rt.request().url().startsWith(BASE)
      ? rt.fulfill({ status:200, contentType:'application/json', body:'{"pending":[]}' }) : rt.continue());
    await p.evaluate(async () => { await fetch(backendUrl() + '/api/trades/pending'); });
    const after = await p.evaluate(() => readProblem('appKey'));
    check('the next request that gets through clears it', after === null, after);
    check('no errors on the page', errors.length === 0, errors);
    await close();
  }

  await b.close(); site.close && site.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASHED:', e); process.exit(1); });
