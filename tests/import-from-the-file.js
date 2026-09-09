// Importing straight from the Schwab file, with no server at all.
//
// The button offering this did NOTHING. It counted the rows, printed
// "Parsed 499 rows", and stopped — while calling itself "fallback, no
// backend needed" on his screen the whole time. On 2026-09-09 the service
// the app talks to was suspended for going over its free allowance, which
// stops every import, and this was the one path that needed none of it.
//
// The bar is his broker's own arithmetic: 254 trades, $404.73 of fees,
// −$1,100.73 after fees, 306 contracts. Anything less is not an import.
const { launch, serve } = require('./browser.js');
const fs = require('fs');
const path = require('path');
const { FULL, HAVE_HIS_FILLS } = require('./real-journal.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  async function phone(saved){
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    // Nothing here may reach out. That is the whole point of this path.
    let reachedOut = 0;
    await p.route('**/*', r => {
      const u = r.request().url();
      if(u.startsWith(site.base)) return r.continue();
      reachedOut++;
      return r.abort();
    });
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backfilled','1');
      localStorage.removeItem('strat_backend_url');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, saved || []);
    await p.reload(); await p.waitForTimeout(900);
    return { p, errors, reachedOut: () => reachedOut };
  }

  // Feeds the file in exactly as choosing it on the phone would.
  const importFile = async (p, text) => {
    const before = await p.evaluate(() => document.getElementById('csvLog').children.length);
    await p.evaluate(async (t) => {
      const dt = new DataTransfer();
      dt.items.add(new File([t], 'Schwab.csv', { type: 'text/csv' }));
      const el = document.getElementById('csvInput');
      el.files = dt.files;
      el.dispatchEvent(new Event('change'));
    }, text);
    // The log box PREPENDS each line and keeps the earlier ones, so the
    // answer is the newest line, not the whole box. Waiting on the whole
    // box could never come true, which is what my first version did.
    await p.waitForFunction((n) => {
      const el = document.getElementById('csvLog');
      return el && el.children.length > n;
    }, before, { timeout: 60000 });
    await p.waitForTimeout(300);
    return await p.evaluate(() => ({
      said: (document.getElementById('csvLog').firstChild || {}).textContent || '',
      trades: loadTrades(),
    }));
  };

  const cents = n => Math.round((n||0)*100);
  const total = (a, f) => a.reduce((s,x)=>s+cents(f(x)),0)/100;

  if(HAVE_HIS_FILLS){
    const text = fs.readFileSync(FULL, 'utf8');
    const { p, errors, reachedOut } = await phone([]);
    const r = await importFile(p, text);

    check(`his real file imports 254 trades (${r.trades.length})`, r.trades.length === 254);
    check(`306 contracts, as his broker bought (${r.trades.reduce((s,t)=>s+t.contracts,0)})`,
      r.trades.reduce((s,t)=>s+t.contracts,0) === 306);
    check(`$404.73 of fees, to the penny ($${total(r.trades,t=>t.fees).toFixed(2)})`,
      total(r.trades, t=>t.fees) === 404.73);
    check(`-$1100.73 after fees, to the penny ($${total(r.trades,t=>t.pnlNet).toFixed(2)})`,
      total(r.trades, t=>t.pnlNet) === -1100.73);
    check(`-$696.00 before fees ($${total(r.trades,t=>t.pnlDollar).toFixed(2)})`,
      total(r.trades, t=>t.pnlDollar) === -696.00);
    check('every trade has a fee — none left waiting', r.trades.every(t => t.fees != null));
    check('every trade knows which fills it came from', r.trades.every(t => (t.fills||[]).length === 2));
    check('every trade carries its contract code', r.trades.every(t => /^[A-Z.]/.test(t.occ||'')));

    // The honest part: no times, and nothing pretending otherwise.
    check('no trade invents an entry time', r.trades.every(t => t.entryTime == null));
    check('no trade invents an exit time', r.trades.every(t => t.exitTime == null));
    check('no trade invents a stock price', r.trades.every(t => t.undEntry == null && t.undExit == null));
    check('and it says so on screen', /carries no times/.test(r.said));

    check(`it never reached out to anything (${reachedOut()} attempts)`, reachedOut() === 0);
    check('nothing on the page threw', errors.length === 0);

    // Importing the same file twice must change nothing at all.
    const again = await importFile(p, text);
    check(`the same file a second time adds nothing (${again.trades.length} trades)`, again.trades.length === 254);
    check(`and says so plainly (${again.said.slice(0,52)})`, /already in your journal/.test(again.said));
    check(`the money did not move ($${total(again.trades,t=>t.pnlNet).toFixed(2)})`,
      total(again.trades, t=>t.pnlNet) === -1100.73);
    await p.close();

    // The two copies of the pairing must not drift apart.
    const { processFills } = require('/workspace/strat-journal-backend/matcher.js');
    const { buildJournal } = require('./real-journal.js');
    const server = buildJournal(37).trades;
    if(server){
      const shape = t => [t.occ, t.entryDate, t.exitDate, t.optEntry, t.optExit, t.contracts, t.fees].join('|');
      const { p: p2 } = await phone([]);
      const mine = (await importFile(p2, text)).trades;
      const a = mine.map(shape).sort(), c = server.map(shape).sort();
      check(`the phone's pairing matches the server's, trade for trade (${a.length} vs ${c.length})`,
        a.length === c.length && a.every((x,i) => x === c[i]));
      await p2.close();
    }
    // HE IMPORTED BOTH OF HIS EXPORTS (2026-09-09) and his journal went to
    // 459 trades and -$2,704.46 against a real -$1,100.73 -- his loss nearly
    // tripled. He has a January-to-July export and a shorter March-to-July
    // one, and the reference built for each row ended in the row's POSITION,
    // which differs between the two. So the same fill got a different
    // reference in each file and the check never saw them as the same trade.
    //
    // Either order, both files, must land on his broker's own figures.
    const SHORT = path.join(path.dirname(FULL), 'b4dfe218-Schwab_.csv');
    if(fs.existsSync(SHORT)){
      const shortText = fs.readFileSync(SHORT, 'utf8');
      for(const [label, order] of [['the long file then the short one', [text, shortText]],
                                   ['the short file then the long one', [shortText, text]]]){
        const { p: p3 } = await phone([]);
        let last;
        for(const t of order) last = await importFile(p3, t);
        check(`${label}: 254 trades, not one more (${last.trades.length})`, last.trades.length === 254);
        check(`${label}: 306 contracts (${last.trades.reduce((s,t)=>s+t.contracts,0)})`,
          last.trades.reduce((s,t)=>s+t.contracts,0) === 306);
        check(`${label}: $404.73 of fees ($${total(last.trades,t=>t.fees).toFixed(2)})`,
          total(last.trades, t=>t.fees) === 404.73);
        check(`${label}: -$1100.73 after fees ($${total(last.trades,t=>t.pnlNet).toFixed(2)})`,
          total(last.trades, t=>t.pnlNet) === -1100.73);
        await p3.close();
      }
    }
  } else {
    console.log('SKIPPED the real-data checks: his broker export is not on this machine.');
  }

  {
    // A file that is not a Schwab transactions file.
    const { p } = await phone([]);
    const r = await importFile(p, 'name,age\nbob,4\n');
    check(`a file that is not his transactions says which columns are missing (${r.said.slice(0,44)})`,
      /does not look like a Schwab transactions file/.test(r.said));
    check('and adds nothing', r.trades.length === 0);
    await p.close();
  }

  {
    // A real Schwab file with no option trades in it — transfers and fees.
    const { p } = await phone([]);
    const r = await importFile(p,
      '"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"\n' +
      '"08/25/2026","Wire Sent","","WIRED FUNDS","","","","-$20.00"\n');
    check(`a file with no trades says that, not "nothing to do" (${r.said.slice(0,40)})`,
      /No option trades in that file/.test(r.said));
    check('and adds nothing', r.trades.length === 0);
    await p.close();
  }

  {
    // An empty file.
    const { p, errors } = await phone([]);
    const r = await importFile(p, '');
    check(`an empty file says so (${r.said})`, /empty/.test(r.said));
    check('and does not throw', errors.length === 0);
    await p.close();
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
