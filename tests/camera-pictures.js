// THE CHART CAMERA'S PICTURES IN THE JOURNAL, in the real app, in a real
// browser. The camera labels each picture with its moment (entry, during,
// exit) and may add a note ("taken 3 s after your entry: the chart was
// switching to IWM").
//
// The fault this prevents: pictures used to be filed by TIME alone, so a
// picture from five minutes into a trade lands in the ENTRY slot whenever
// the real entry picture is missing -- a picture labelled "entry" showing
// something else. Shown below with an unlabelled picture, then checked
// with the camera's.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c, d) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l, d === undefined ? '' : JSON.stringify(d).slice(0, 300)); } };
  const BASE = 'https://fake.example.com';
  const at = s => new Date('2026-06-09T' + s).getTime();      // local time, the way the app reads a trade
  const img = c => 'data:image/png;base64,' + Buffer.from('picture-' + c).toString('base64');

  const trade = (o) => Object.assign({
    id:'t1', ticker:'IWM', dir:'Short', entryDate:'2026-06-09', entryTime:'09:31',
    exitDate:'2026-06-09', exitTime:'09:53', optEntry:1.11, optExit:1.22, contracts:1,
    fees:1.33, pnlDollar:11, pnlNet:9.67, winLoss:'Win', notes:'', source:'schwab-auto', settled:true, strat:'2-1-2 Continuation',
  }, o);
  const cam = (id, moment, time, o) => Object.assign({ id, timestamp: at(time), image: img(id), moment, source:'camera' }, o);

  async function phone(journal, shots){
    const ctx = await b.newContext({ viewport:{width:390,height:844}, acceptDownloads:true });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    const asked = { image: [], deleted: [] };
    let queue = shots.slice();
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route('**/media/**', async r => {
      const u = new URL(r.request().url());
      const seg = u.pathname.split('/').filter(Boolean);
      if(seg[1] === 'pending'){
        const out = queue.map(s => Object.assign({}, s, { image:null, hasImage:true }));
        return r.fulfill({status:200,contentType:'application/json',body: JSON.stringify({ screenshots: out, waiting: queue.length })});
      }
      if(seg[1] === 'pending-videos') return r.fulfill({status:200,contentType:'application/json',body:'{"videos":[]}'});
      if(seg[2] === 'image'){
        const id = decodeURIComponent(seg[1]); asked.image.push(id);
        const s = queue.find(x => x.id === id);
        return r.fulfill({status:200,contentType:'application/json',body: JSON.stringify({ id, image: s ? s.image : null, timestamp: s && s.timestamp, reason: s ? null : 'gone' })});
      }
      if(r.request().method() === 'DELETE'){
        const id = decodeURIComponent(seg[1]); asked.deleted.push(id);
        queue = queue.filter(x => x.id !== id);
        return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      }
      return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    });
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate((args) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backend_url', args.base);
      localStorage.setItem('strat_app_key', 'k');
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(args.journal));
    }, { base: BASE, journal });
    await p.reload(); await p.waitForTimeout(900);
    const offer = more => { queue = queue.concat(more); };
    const match = async () => { await p.evaluate(() => matchPendingScreenshots()); await p.waitForTimeout(200); };
    const trades = () => p.evaluate(() => loadTrades());
    return { p, asked, errors, offer, match, trades, queue: () => queue, close: () => ctx.close() };
  }

  console.log('--- the fault, shown: an UNLABELLED picture from five minutes in, with no entry picture yet ---');
  {
    const ph = await phone([trade()], [{ id:'u1', timestamp: at('09:36:00'), image: img('u1') }]);
    await ph.match();
    const t = (await ph.trades())[0];
    check('filed by time alone, a picture from 09:36 lands in the ENTRY slot (the danger)', !!t.shotEntry, t);
    await ph.close();
  }

  console.log('\n--- the camera\'s pictures, filed by what they are ---');
  {
    const ph = await phone([trade()], [cam('d1', 'during', '09:36:12')]);
    await ph.match();
    let t = (await ph.trades())[0];
    check('a camera "during" picture with no entry picture yet goes to During, NEVER the entry slot', !t.shotEntry && Array.isArray(t.shotsDuring) && t.shotsDuring.length === 1 && t.shotsDuring[0].at === at('09:36:12'), t);
    ph.offer([cam('e1', 'entry', '09:31:12', { note: 'taken 3 s after your entry at 09:31:09: the chart was switching to IWM' }), cam('d2', 'during', '09:41:12'), cam('x1', 'exit', '09:53:40')]);
    await ph.match();
    t = (await ph.trades())[0];
    check('the entry picture goes to the entry slot', !!t.shotEntry);
    check('the exit picture goes to the exit slot', !!t.shotExit);
    check('the during pictures are kept in time order', (t.shotsDuring || []).map(d => d.at).join() === [at('09:36:12'), at('09:41:12')].join());
    check('the camera\'s note is kept with the entry picture', t.shotNotes && /switching to IWM/.test(t.shotNotes.entry));
    check('nothing went to the mid-trade slot', !t.shotMid);
    check('every picture was taken off the queue once kept', ph.queue().length === 0 && ['d1', 'e1', 'd2', 'x1'].every(id => ph.asked.deleted.includes(id)));
    const stored = await ph.p.evaluate(async () => { const t = loadTrades()[0]; return (await getPicture(t.id, duringSlot(t.shotsDuring[0].at))).image; });
    check('the during picture itself is kept on the phone, whole', stored === img('d1'));

    // The same picture offered again: recognised, cleared, not fetched again.
    const fetched = ph.asked.image.length;
    ph.offer([cam('d1-again', 'during', '09:36:12')]);
    await ph.match();
    t = (await ph.trades())[0];
    check('a during picture offered again is NOT added twice', t.shotsDuring.length === 2);
    check('...and is cleared from the queue without being fetched again', ph.asked.deleted.includes('d1-again') && ph.asked.image.length === fetched);

    // What he sees: the edit screen.
    await ph.p.evaluate(() => editTrade('t1'));
    await ph.p.waitForTimeout(500);
    const view = await ph.p.evaluate(() => ({
      shown: getComputedStyle(document.getElementById('shotDuringWrap')).display !== 'none',
      figures: [...document.querySelectorAll('#shotDuringStrip figure')].map(f => ({ cap: f.querySelector('figcaption').textContent, src: f.querySelector('img').getAttribute('src') })),
      notes: document.getElementById('shotNotes').textContent,
    }));
    check(`the trade shows a "During the trade" row with both pictures, in order (${view.figures.map(f => f.cap).join(' | ')})`,
      view.shown && view.figures.length === 2 && view.figures[0].cap.startsWith('09:36:12') && view.figures[1].cap.startsWith('09:41:12') && view.figures.every(f => f.src && f.src.startsWith('data:image')), view);
    check(`and the camera's note under the pictures: "${view.notes}"`, /Entry picture: taken 3 s after your entry/.test(view.notes));

    // Editing and saving the trade keeps them.
    await ph.p.evaluate(() => { document.getElementById('f_notes').value = 'a note of mine'; saveTrade(); });
    await ph.p.waitForTimeout(400);
    t = (await ph.trades())[0];
    check('editing the trade and saving keeps the during pictures and the note', t.notes === 'a note of mine' && (t.shotsDuring || []).length === 2 && t.shotNotes && t.shotNotes.entry, t);
    await ph.p.evaluate(() => renderDuringShots(null));
    check('a trade with none shows no row', await ph.p.evaluate(() => getComputedStyle(document.getElementById('shotDuringWrap')).display === 'none'));

    // The export carries them.
    const exported = await ph.p.evaluate(async () => {
      let captured = null; const orig = URL.createObjectURL;
      URL.createObjectURL = blob => { captured = blob; return orig.call(URL, blob); };
      await exportDataAsync(); URL.createObjectURL = orig;
      return captured ? JSON.parse(await captured.text()) : null;
    });
    const ex = exported && exported[0];
    check('the export carries the during pictures, with their images', ex && ex.shotsDuring && ex.shotsDuring.length === 2 && ex.shotsDuring.every(d => d.image && d.image.startsWith('data:image')), ex && ex.shotsDuring);
    check('nothing threw', ph.errors.length === 0, ph.errors);
    await ph.close();
  }

  console.log('\n--- two trades minutes apart ---');
  {
    const t1 = trade({ id:'a', entryTime:'09:31', exitTime:'09:40' });
    const t2 = trade({ id:'b', entryTime:'09:42', exitTime:'09:58', ticker:'SPY' });
    const ph = await phone([t1, t2], [cam('e-b', 'entry', '09:42:05'), cam('d-b', 'during', '09:47:05'), cam('x-a', 'exit', '09:40:20'), cam('d-a', 'during', '09:36:00')]);
    await ph.match();
    const list = await ph.trades();
    const ta = list.find(t => t.id === 'a'), tb = list.find(t => t.id === 'b');
    check('each entry and exit picture goes to its own trade', !!tb.shotEntry && !ta.shotEntry && !!ta.shotExit && !tb.shotExit, { ta, tb });
    check('each during picture goes to the trade it falls inside', (ta.shotsDuring || []).map(d => d.at).join() === String(at('09:36:00')) && (tb.shotsDuring || []).map(d => d.at).join() === String(at('09:47:05')));
    await ph.close();
  }

  console.log('\n--- a picture he put in by hand is never replaced ---');
  {
    const ph = await phone([trade({ shotExit: 'data:image/png;base64,' + Buffer.from('his-own').toString('base64') })], [cam('x-cam', 'exit', '09:53:40')]);
    await ph.match();
    const kept = await ph.p.evaluate(async () => (await pictureOn(loadTrades()[0], 'shotExit')).image);
    check('the exit slot keeps his own picture', kept === 'data:image/png;base64,' + Buffer.from('his-own').toString('base64'));
    check('the camera\'s exit picture is left waiting, not thrown away', ph.queue().some(s => s.id === 'x-cam') && !ph.asked.deleted.includes('x-cam'));
    await ph.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); site.close && site.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL: crashed', e && e.stack || e); process.exit(1); });
