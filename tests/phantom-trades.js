// The four trades in his journal that do not exist.
//
// Measured from his own export (2026-09-09). Two of them read:
//     09:31 -> 09:36   1 contract    1.11 -> 1.22   fee $1.33
//     09:31 -> 09:36   2 contracts   1.11 -> 1.22   fee none
// Same purchase, same sale, same two prices, a different SIZE. One real
// trade, paired twice, because the same broker fills went through the
// matcher again and came out matched up differently.
//
// Every check the app had identified a trade by its SHAPE, and a different
// pairing has a different shape -- so the phantom read as brand new. It
// arrived with no fee, because the fee had already gone to the real trade,
// which is why four trades sat waiting for a fee that was never coming.
//
// A purchase is a purchase whichever sale it is matched to. These cases use
// his real 9 June figures.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const OCC = 'SPY   260609C00745000';
  const T = (o) => Object.assign({
    id: 'id-' + Math.random().toString(36).slice(2), ticker:'SPY', dir:'Long', occ: OCC,
    entryDate:'2026-06-09', entryTime:'09:31', exitDate:'2026-06-09', exitTime:'09:36',
    optEntry:1.11, optExit:1.22, contracts:1, pnlDollar:11, fees:1.33, pnlNet:9.67,
    winLoss:'Win', ftfc:{}, notes:'', source:'schwab-auto', settled:true, fillAttempts:1,
  }, o);

  async function importInto(saved, arriving){
    const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
    const errors = [];
    const cleared = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/api/trades/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/api/trades/pending', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p.route('**/api/trades/pending/**', r => { cleared.push(r.request().url()); return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}); });
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((ts) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url','https://fake.example.com');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, saved);
    await p.reload(); await p.waitForTimeout(1000);
    const out = await p.evaluate(async (pend) =>
      await autoImportPendingTrades('https://fake.example.com', pend), arriving);
    const stored = await p.evaluate(() => loadTrades());
    await p.close();
    return { out, stored, errors, cleared };
  }

  {
    // The exact phantom from his journal: same purchase and sale, different
    // size, no fee. Under the old shape test this walked straight in.
    const real = T({ fills: ['buy-1', 'sell-2'] });
    const phantom = T({ contracts: 2, pnlDollar: 22, fees: null, pnlNet: null, fills: ['buy-1', 'sell-2'] });
    const { out, stored, errors, cleared } = await importInto([real], [phantom]);
    check(`the phantom is refused (${out.imported} imported)`, out.imported === 0);
    check(`the journal still holds one trade (${stored.length})`, stored.length === 1);
    check(`and one contract, not three (${stored.reduce((s,t)=>s+t.contracts,0)})`,
      stored.reduce((s,t)=>s+t.contracts,0) === 1);
    check('no trade is left waiting for a fee', stored.every(t => t.fees != null));
    check(`the queue is cleared so it is not offered for ever (${cleared.length})`, cleared.length === 1);
    check('nothing threw', errors.length === 0);
  }

  {
    // CORRECTED 2026-09-09. This case used to assert that sharing ONE fill
    // was enough to refuse a trade, and that was wrong -- it was asserting
    // the bug, not the behaviour.
    //
    // A position bought in one go and sold in three pieces is THREE real
    // trades, and all three cite the same purchase. Measured on his own
    // file: the "share one fill" rule threw away 24 of his 254 trades, and
    // it was live on the real import path too, so every partial close he
    // had ever made was being lost.
    //
    // A trade is named by the PAIR -- purchase AND sale together.
    const open = T({ exitTime: '09:36', optExit: 1.22, fills: ['buy-1', 'sell-1'] });
    const secondPiece = T({ exitTime: '09:38', optExit: 1.43, fills: ['buy-1', 'sell-2'] });
    const thirdPiece  = T({ exitTime: '09:41', optExit: 1.50, fills: ['buy-1', 'sell-3'] });
    const { out, stored } = await importInto([open], [secondPiece, thirdPiece]);
    check(`the other pieces of a part-sold position still get in (${out.imported} imported)`, out.imported === 2);
    check(`leaving all three (${stored.length})`, stored.length === 3);
    check('and each keeps its own sale', new Set(stored.map(t => (t.fills||[]).join('+'))).size === 3);
  }

  {
    // The reverse: one sale closing two separate purchases. Two real trades
    // sharing a sale, which must also both survive.
    const first = T({ entryTime: '09:20', optEntry: 1.05, fills: ['buy-a', 'sell-9'] });
    const second = T({ entryTime: '09:31', optEntry: 1.11, fills: ['buy-b', 'sell-9'] });
    const { out, stored } = await importInto([first], [second]);
    check(`two purchases closed by one sale both survive (${out.imported} imported)`, out.imported === 1);
    check(`leaving two (${stored.length})`, stored.length === 2);
  }

  {
    // A genuinely different trade, built from fills nobody has claimed,
    // must still get in -- this is the half that would break his journal
    // if the refusal were too eager.
    const real = T({ fills: ['buy-1', 'sell-2'] });
    const fresh = T({ entryTime:'10:05', exitTime:'10:20', optEntry:0.90, optExit:1.05,
                      occ:'SPY   260609C00750000', fills: ['buy-9', 'sell-9'] });
    const { out, stored } = await importInto([real], [fresh]);
    check(`a real new trade still gets in (${out.imported} imported)`, out.imported === 1);
    check(`leaving him with two (${stored.length})`, stored.length === 2);
  }

  {
    // Two copies inside ONE batch, which is how a queue re-sent mid-import
    // could sneak one past.
    const a = T({ fills: ['buy-7', 'sell-7'] });
    const b2 = T({ contracts: 2, fees: null, pnlNet: null, fills: ['buy-7', 'sell-7'] });
    const { out, stored } = await importInto([], [a, b2]);
    check(`two copies in one batch import once (${out.imported})`, out.imported === 1);
    check(`one trade stored (${stored.length})`, stored.length === 1);
    check('and it is the one with a fee', stored[0].fees != null);
  }

  {
    // Trades already on file from before this existed carry no references
    // at all. They must not become invisible, and they must not block
    // everything else.
    const old1 = T({ fills: undefined });
    const arriving = T({ entryTime:'11:00', exitTime:'11:10', optEntry:0.5, optExit:0.6, fills: ['buy-5','sell-5'] });
    const { out, stored, errors } = await importInto([old1], [arriving]);
    check(`an older trade with no references does not block a new one (${out.imported})`, out.imported === 1);
    check(`both are on file (${stored.length})`, stored.length === 2);
    check('and nothing threw on the missing references', errors.length === 0);
  }

  {
    // And the shape check still does its own job for trades that carry no
    // references on either side.
    const old1 = T({ fills: undefined });
    const sameAgain = T({ fills: undefined });
    const { out, stored } = await importInto([old1], [sameAgain]);
    check(`the shape check still catches a plain repeat (${out.imported} imported)`, out.imported === 0);
    check(`still one trade (${stored.length})`, stored.length === 1);
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
