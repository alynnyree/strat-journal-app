// A background job that waits on the server must never put his journal back
// the way it was when the job started.
//
// Measured 2026-09-30. He tapped "Put this right", 50 duplicate trades were
// set aside and his contracts matched Schwab at 151. Two days later the same
// 50 were back, with the same ids. The trade collector read the journal,
// waited on the server, and wrote that old list back over the repair.
// Reproduced in a real browser before anything was changed.
//
// Each case below makes a change DURING a slow server reply and checks the
// change survives -- and that the job's own work still lands. Shown to fail
// on the code before the fix.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : '-> ' + JSON.stringify(d)); } };
  const BASE = 'https://fake.example.com';
  const SLOW = 1500, DURING = 300;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const trade = (id, time, o) => Object.assign({
    id, ticker:'SPY', dir:'Long', occ:'SPY   260609C00740000', entryDate:'2026-06-09', entryTime:time,
    exitDate:'2026-06-09', exitTime:time.replace(/:(\d\d)$/, (m, mm) => ':' + String(+mm + 5).padStart(2, '0')),
    optEntry:1.11, optExit:1.22, contracts:1, fees:1.33, pnlDollar:11, pnlNet:9.67, winLoss:'Win',
    notes:'', source:'schwab-auto', settled:true, strat:'2-1-2 Continuation', fills:['o'+id, 'c'+id],
    replayData:{ candles:[], entryIndex:0, exitIndex:0 },
  }, o || {});

  async function phone(journal, handle){
    const ctx = await b.newContext({ viewport:{width:390,height:844} });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', async r => {
      const u = r.request().url();
      if(u.startsWith(site.base)) return r.continue();
      const answered = handle ? await handle(r, new URL(u), p) : null;
      if(answered) return;
      return r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' });
    });
    await p.goto(site.base + '/index.html');
    await p.evaluate(a => {
      localStorage.setItem('strat_intro', JSON.stringify({ on:false, motion:false }));
      localStorage.setItem('strat_backend_url', a.base);
      localStorage.setItem('strat_app_key', 'k');
      localStorage.setItem('strat_backfilled', '1');
      localStorage.setItem('strat_trades', JSON.stringify(a.journal));
    }, { base: BASE, journal });
    await p.reload(); await p.waitForTimeout(1200);
    return { p, errors, close: () => ctx.close() };
  }
  const ids = p => p.evaluate(() => loadTrades().map(t => String(t.id)));

  // ---------------------------------------------------------------------
  console.log('--- the trade collector, while he repairs, types a note, and a trade arrives ---');
  {
    const cleared = [];   // [id, was it already in the journal when cleared?]
    const { p, errors, close } = await phone(
      [trade('A', '09:31', { fees:null, pnlNet:null, settled:false }), trade('B', '10:00'), trade('DUP', '11:00')],
      async (r, u, page) => {
        if(/\/api\/trades\/pending\/[^/]+\/replay$/.test(u.pathname)){
          await sleep(SLOW);
          await r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ replayData:{ candles:[], entryIndex:0, exitIndex:0 } }) });
          return true;
        }
        if(r.request().method() === 'DELETE' && u.pathname.startsWith('/api/trades/pending/')){
          const id = decodeURIComponent(u.pathname.split('/').pop());
          const inJournal = await page.evaluate(() => loadTrades().map(t => t.fills && t.fills[0]));
          cleared.push([id, inJournal]);
          await r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' });
          return true;
        }
      });
    const out = await p.evaluate(async (base) => {
      const rebuiltA = Object.assign({}, loadTrades().find(t => t.id === 'A'), { id:'srv-A', fees:1.33, pnlNet:9.67 });
      delete rebuiltA.replayData;
      const brandNew = { id:'srv-N', ticker:'SPY', dir:'Long', occ:'SPY   260609C00741000', entryDate:'2026-06-09',
        entryTime:'12:00', exitDate:'2026-06-09', exitTime:'12:05', optEntry:2, optExit:2.5, contracts:1,
        fees:1.33, fills:['oN','cN'], replayWaiting:true };
      let done = false;
      const running = autoImportPendingTrades(base, [rebuiltA, brandNew]).then(g => { done = true; return g; });
      await new Promise(r => setTimeout(r, 300));
      const duringWait = !done;
      // During the wait: the repair, and a note typed on the edit screen.
      const repair = applyReconcilePlan({ remove:['DUP'], contracts:1 });
      const list = loadTrades(); list.find(t => t.id === 'B').notes = 'mine'; saveTrades(list);
      const got = await running;
      return { repair: repair.ok, got, duringWait };
    }, BASE);
    const now = await p.evaluate(() => loadTrades());
    const byId = Object.fromEntries(now.map(t => [String(t.id), t]));
    check('the repair and the note really were made while the collector was waiting', out.duringWait === true);
    check('the repair happened', out.repair === true);
    check('the repaired-away trade STAYS away after the collector finishes', !byId.DUP, now.map(t => t.id));
    check('the note typed during the wait survives', byId.B && byId.B.notes === 'mine', byId.B && byId.B.notes);
    check('the collector\'s own work still lands (fee filled in on A)', byId.A && byId.A.fees === 1.33, byId.A && byId.A.fees);
    check('...and its catch-up is counted', byId.A && byId.A.fillAttempts === 1, byId.A && byId.A.fillAttempts);
    check('the new trade is added, once', now.filter(t => t.fills && t.fills[0] === 'oN').length === 1, now.map(t => t.id));
    check('the collector reports it added one', out.got.imported === 1, out.got);
    const newClear = cleared.find(c => c[0] === 'srv-N');
    check('the server is told "taken" only AFTER the journal holds the trade', newClear && newClear[1].includes('oN'), cleared);
    check('every item handed over was cleared from the server', ['srv-A', 'srv-N'].every(id => cleared.some(c => c[0] === id)), cleared.map(c => c[0]));
    check('no errors on the page', errors.length === 0, errors);
    await close();
  }

  // ---------------------------------------------------------------------
  console.log('--- the trade collector, when the save is refused ---');
  {
    const cleared = [];
    const { p, errors, close } = await phone([trade('A', '09:31')], async (r, u) => {
      if(r.request().method() === 'DELETE'){ cleared.push(u.pathname); await r.fulfill({ status:200, contentType:'application/json', body:'{}' }); return true; }
    });
    const out = await p.evaluate(async (base) => {
      const before = localStorage.getItem('strat_trades');
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v){ if(k === 'strat_trades') throw Object.assign(new Error('full'), { name:'QuotaExceededError' }); return real.call(this, k, v); };
      const got = await autoImportPendingTrades(base, [{ id:'srv-N', ticker:'SPY', dir:'Long', occ:'X', entryDate:'2026-06-09',
        entryTime:'12:00', exitDate:'2026-06-09', exitTime:'12:05', optEntry:2, optExit:2.5, contracts:1, fees:1, fills:['oN','cN'],
        replayData:{ candles:[], entryIndex:0, exitIndex:0 } }]);
      Storage.prototype.setItem = real;
      return { got, same: localStorage.getItem('strat_trades') === before };
    }, BASE);
    check('a refused save is reported back, in plain words', out.got.failed && /no room left/.test(out.got.failed), out.got);
    check('...nothing is cleared from the server, so it is offered again', cleared.length === 0, cleared);
    check('...and the journal is exactly as it was', out.same);
    check('no errors on the page', errors.length === 0, errors);
    await close();
  }

  // ---------------------------------------------------------------------
  console.log('--- an unreadable journal is never saved over ---');
  {
    const { p, errors, close } = await phone([trade('A', '09:31')], async (r, u) => {
      if(/\/replay$/.test(u.pathname)){ await sleep(SLOW); await r.fulfill({ status:200, contentType:'application/json', body:'{}' }); return true; }
    });
    const out = await p.evaluate(async (base) => {
      let done = false;
      const running = autoImportPendingTrades(base, [{ id:'srv-N', ticker:'SPY', dir:'Long', occ:'X', entryDate:'2026-06-09',
        entryTime:'12:00', exitDate:'2026-06-09', exitTime:'12:05', optEntry:2, optExit:2.5, contracts:1, fees:1, fills:['oN','cN'],
        replayWaiting:true }]).then(g => { done = true; return g; });
      await new Promise(r => setTimeout(r, 300));
      const duringWait = !done;
      localStorage.setItem('strat_trades', '{"this is not a list');
      const got = await running;
      return { got, duringWait, stored: localStorage.getItem('strat_trades') };
    }, BASE);
    check('the journal was broken while the collector was waiting', out.duringWait === true);
    check('the collector refuses to save onto a journal it cannot read', !!out.got.failed, out.got);
    check('...and does not replace it with just the new trade', out.stored === '{"this is not a list', out.stored.slice(0, 60));
    check('no errors on the page', errors.length === 0, errors);
    await close();
  }

  // ---------------------------------------------------------------------
  console.log('--- a picture arriving while he repairs ---');
  {
    const img = 'data:image/png;base64,' + 'A'.repeat(2000);
    const shotTs = new Date('2026-06-09T09:31:00').getTime();
    const { p, errors, close } = await phone([trade('T1', '09:31'), trade('DUP', '11:00')], async (r, u) => {
      const seg = u.pathname.split('/').filter(Boolean);
      if(seg[0] !== 'media') return false;
      if(seg[1] === 'pending'){
        await r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ screenshots:[{ id:'s1', timestamp: shotTs, moment:'entry', image:null, hasImage:true }], waiting:1 }) });
        return true;
      }
      if(seg[2] === 'image'){
        await sleep(SLOW);
        await r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ id:'s1', image: img, timestamp: shotTs }) });
        return true;
      }
      return false;
    });
    const during = await p.evaluate(async () => {
      let done = false;
      const running = matchPendingScreenshots().then(() => { done = true; });
      await new Promise(r => setTimeout(r, 300));
      const duringWait = !done;
      applyReconcilePlan({ remove:['DUP'], contracts:1 });
      await running;
      return duringWait;
    });
    check('the repair really was made while the job was waiting', during === true);
    const now = await p.evaluate(() => loadTrades());
    check('the repaired-away trade stays away after a picture is attached', !now.some(t => t.id === 'DUP'), now.map(t => t.id));
    check('the picture is still attached', now.find(t => t.id === 'T1') && now.find(t => t.id === 'T1').shotEntry === 'kept', now.find(t => t.id === 'T1'));
    check('no errors on the page', errors.length === 0, errors);
    await close();
  }

  // ---------------------------------------------------------------------
  console.log('--- two recordings arriving while he repairs ---');
  {
    const ts = t => new Date('2026-06-09T' + t + ':00').getTime();
    const { p, errors, close } = await phone([trade('T1', '09:31'), trade('T2', '10:00'), trade('DUP', '11:00')], async (r, u) => {
      const seg = u.pathname.split('/').filter(Boolean);
      if(seg[0] !== 'media') return false;
      if(seg[1] === 'pending-videos'){
        await r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ videos:[
          { id:'v1', r2Key:'k1', timestamp: ts('09:31') }, { id:'v2', r2Key:'k2', timestamp: ts('10:00') } ], waiting:2 }) });
        return true;
      }
      if(seg[1] === 'video' && r.request().method() === 'DELETE'){
        if(seg[2] === 'v1') await sleep(SLOW);
        await r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' });
        return true;
      }
      return false;
    });
    const during = await p.evaluate(async () => {
      let done = false;
      const running = matchPendingVideos().then(() => { done = true; });
      await new Promise(r => setTimeout(r, 300));
      const duringWait = !done;
      applyReconcilePlan({ remove:['DUP'], contracts:1 });
      await running;
      return duringWait;
    });
    check('the repair really was made while the job was waiting', during === true);
    const now = await p.evaluate(() => loadTrades());
    const got = id => now.find(t => t.id === id) || {};
    check('the repaired-away trade stays away after recordings are attached', !now.some(t => t.id === 'DUP'), now.map(t => t.id));
    check('both recordings are attached', got('T1').video && got('T2').video && got('T1').video.id === 'v1' && got('T2').video.id === 'v2', [got('T1').video, got('T2').video]);
    check('no errors on the page', errors.length === 0, errors);
    await close();
  }

  // ---------------------------------------------------------------------
  console.log('--- the one-off move of pictures off the journal ---');
  {
    const img = 'data:image/png;base64,' + 'B'.repeat(2000);
    const { p, errors, close } = await phone([trade('T1', '09:31', { shotEntry: img }), trade('DUP', '11:00')]);
    const out = await p.evaluate(async (img) => {
      const real = putPicture;
      window.putPicture = async (...a) => { await new Promise(r => setTimeout(r, 1500)); return real(...a); };
      // The move already ran when the page opened; put an old-style picture
      // back on the trade so there is something to move.
      const list = loadTrades(); list.find(t => t.id === 'T1').shotEntry = img; saveTrades(list);
      picMoveDone = false;
      let done = false;
      const running = movePicturesOffTheJournal().then(g => { done = true; return g; });
      await new Promise(r => setTimeout(r, 300));
      const duringWait = !done;
      applyReconcilePlan({ remove:['DUP'], contracts:1 });
      const got = await running;
      window.putPicture = real;
      return Object.assign({ duringWait }, got);
    }, img);
    const now = await p.evaluate(() => loadTrades());
    check('the repair really was made while the move was waiting', out.duringWait === true);
    check('the move reports what it moved', out.moved === 1, out);
    check('the repaired-away trade stays away after the move', !now.some(t => t.id === 'DUP'), now.map(t => t.id));
    check('the picture is marked as moved', (now.find(t => t.id === 'T1') || {}).shotEntry === 'kept');
    check('no errors on the page', errors.length === 0, errors);
    await close();
  }

  await b.close(); site.close && site.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASHED:', e); process.exit(1); });
