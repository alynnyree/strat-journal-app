// AUDIT H-2 (authorized by the owner 9 Oct 2026: "I authorize H-2
// implementation"): broker fills the service could not pair are recorded,
// and the app shows ONE line about them -- behind the Details tap only, never
// on his screen. Four different answers, never folded into one: not asked yet,
// could not reach the service, an older service that does not report it, and
// the count itself.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : JSON.stringify(d).slice(0, 300)); } };

  const LEDGER = {
    exceptions: [
      { kind: 'close-without-open', key: 'close-without-open:121568529022', fillId: '121568529022', status: 'open',
        ticker: 'SPY', occ: 'SPY   260610C00740000', date: '2026-06-10', timestamp: 2, reason: 'no purchase of this contract is on file' },
      { kind: 'open-retired', key: 'open-retired:1', fillId: '1', status: 'resolved', ticker: 'SPY', occ: 'X', date: '2026-06-01', timestamp: 1, reason: 'past expiry (no sale on file)' },
    ],
    counts: { open: 1, resolved: 1, byKind: { 'close-without-open': 1, 'open-retired': 1 } },
    openLegs: { held: 0, withoutAccountRef: 0 },
  };

  async function open(answer){
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/api/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/pending*', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p.route('**/api/trades/exceptions*', r => answer === 'network' ? r.abort('failed')
      : r.fulfill({ status: answer === 404 ? 404 : answer === 500 ? 500 : 200, contentType:'application/json', body: JSON.stringify(answer && answer.exceptions ? answer : {}) }));
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate(() => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url','https://fake.example.com');
      localStorage.setItem('strat_backfilled','1');
      // The Checks page draws Details only when the journal holds a trade.
      localStorage.setItem('strat_trades', JSON.stringify([{ id:'t1', ticker:'SPY', dir:'Long', occ:'SPY   260609C00745000',
        entryDate:'2026-06-09', entryTime:'09:31', exitDate:'2026-06-09', exitTime:'09:36', optEntry:1.11, optExit:1.22,
        contracts:1, pnlDollar:11, fees:1.33, pnlNet:9.67, winLoss:'Win', source:'schwab-auto', settled:true, fills:['a','b'] }]));
    });
    await p.reload(); await p.waitForTimeout(800);
    await p.evaluate(() => showView('checklist'));
    await p.waitForSelector('#techDetails', { state: 'attached', timeout: 15000 });
    await p.waitForTimeout(500);
    const hiddenBefore = await p.evaluate(() => {
      const d = document.getElementById('techDetails');
      const visible = document.body.innerText;
      return { detailsShown: d && d.style.display === 'block', onScreen: /broker fills not paired/.test(visible) };
    });
    await p.evaluate(() => toggleTechDetails());
    await p.waitForTimeout(300);
    const line = await p.evaluate(() => (document.getElementById('techDetails').textContent.split('\n').find(l => /^broker fills not paired/.test(l)) || null));
    await p.close();
    return { hiddenBefore, line, errors };
  }

  console.log('--- 1. the count, behind Details only ---');
  {
    const r = await open(LEDGER);
    check('not on his screen before Details is tapped', r.hiddenBefore.detailsShown === false && r.hiddenBefore.onScreen === false, r.hiddenBefore);
    check(`behind Details: "${r.line}"`, r.line && /broker fills not paired: 1 open · 1 resolved/.test(r.line)
      && /latest SPY SPY {3}260610C00740000 2026-06-10 \(no purchase of this contract is on file\)/.test(r.line) && /open legs held 0/.test(r.line), r.line);
    check('no page errors', r.errors.length === 0, r.errors);
  }

  console.log('\n--- 2. an older service that does not report it ---');
  {
    const r = await open(404);
    check(`says so: "${r.line}"`, r.line === 'broker fills not paired: not reported by this service (older build)', r.line);
    check('no page errors', r.errors.length === 0, r.errors);
  }

  console.log('\n--- 3. could not reach it, and a refusal, are not "none" ---');
  {
    const r = await open('network');
    check(`unreachable: "${r.line}"`, r.line && /^broker fills not paired: could not ask \(/.test(r.line) && !/0 open/.test(r.line), r.line);
    const r2 = await open(500);
    check(`refused: "${r2.line}"`, r2.line === 'broker fills not paired: could not ask (500)', r2.line);
    check('no page errors', r.errors.length === 0 && r2.errors.length === 0, [r.errors, r2.errors]);
  }

  console.log('\n--- 4. nothing on record ---');
  {
    const r = await open({ exceptions: [], counts: { open: 0, resolved: 0, byKind: {} }, openLegs: { held: 2, withoutAccountRef: 2 } });
    check(`"${r.line}"`, r.line === 'broker fills not paired: 0 open · 0 resolved · open legs held 2', r.line);
  }

  console.log('\n--- 5. conflicting evidence and unreadable records are said, not hidden ---');
  {
    const r = await open({ exceptions: [], counts: { open: 2, resolved: 0, conflicted: 1, malformed: 3, byKind: {} }, openLegs: { held: 0, withoutAccountRef: 0 } });
    check(`"${r.line}"`, r.line === 'broker fills not paired: 2 open · 0 resolved · 1 with conflicting evidence · 3 stored records unreadable · open legs held 0', r.line);
    const r2 = await open({ exceptions: [], counts: { open: 0, resolved: 0, conflicted: 0, malformed: 'the whole record', byKind: {} }, openLegs: { held: 0, withoutAccountRef: 0 } });
    check(`"${r2.line}"`, r2.line === 'broker fills not paired: 0 open · 0 resolved · the stored record is unreadable · open legs held 0', r2.line);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); if(site.close) site.close();
  process.exit(fail ? 1 : 0);
})();
