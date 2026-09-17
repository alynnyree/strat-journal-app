// Two things, in the real app, in a real browser.
//
// 1. A PICTURE THAT MATCHES NO TRADE WAS DOWNLOADED AGAIN ON EVERY CHECK.
//    One is up to 3MB, the app checks every thirty seconds it is open, and
//    a picture is kept for thirty days. His hosting was suspended for going
//    over its free allowance. The list now comes WITHOUT the pictures, and
//    only the ones actually being kept are fetched.
//
// 2. A RECORDING NOW REACHES THE JOURNAL. Nothing in the app had ever asked
//    for one: a recording could sit on the server for ever and the journal
//    would never fetch it, never attach it, never play it.
//
// The cost is measured across REPEATED checks, which is the only way the
// first fault shows itself -- one check looks fine either way.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const BASE = 'https://fake.example.com';

  // A REAL playable recording, made here rather than checked in -- pointing
  // the player at a URL with nothing behind it proves nothing except that
  // the app notices, which is a different check.
  const clip = await (async () => {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    await p.setContent('<canvas id="c" width="160" height="120"></canvas>');
    const b64 = await p.evaluate(async () => {
      const mime = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
        .find(t => MediaRecorder.isTypeSupported(t));
      const c = document.getElementById('c'); const g = c.getContext('2d');
      let n = 0; const draw = setInterval(() => { n++; g.fillStyle = n%2?'#0f0':'#00f'; g.fillRect(0,0,160,120); }, 100);
      const parts = [];
      const rec = new MediaRecorder(c.captureStream(10), { mimeType: mime });
      rec.ondataavailable = e => { if(e.data && e.data.size) parts.push(e.data); };
      rec.start(500);
      await new Promise(r => setTimeout(r, 1500));
      await new Promise(r => { rec.onstop = r; rec.stop(); });
      clearInterval(draw);
      const buf = await new Blob(parts, {type:mime}).arrayBuffer();
      let s2 = ''; const u8 = new Uint8Array(buf);
      for(let i = 0; i < u8.length; i++) s2 += String.fromCharCode(u8[i]);
      return btoa(s2);
    });
    await ctx.close();
    return Buffer.from(b64, 'base64');
  })();
  // 2026-06-09 09:31 and 09:36 local, the way the app reads a trade's own
  // date and time fields.
  const entryMs = new Date('2026-06-09T09:31:00').getTime();
  const exitMs  = new Date('2026-06-09T09:36:00').getTime();

  const trade = (o) => Object.assign({
    id:'t1', ticker:'SPY', dir:'Long', entryDate:'2026-06-09', entryTime:'09:31',
    exitDate:'2026-06-09', exitTime:'09:36', optEntry:1.11, optExit:1.22, contracts:1,
    fees:1.33, pnlDollar:11, pnlNet:9.67, winLoss:'Win', notes:'', source:'schwab-auto',
    settled:true, strat:'2-1-2 Continuation',
  }, o);

  const bigImage = 'data:image/png;base64,' + 'A'.repeat(300 * 1024);

  // A phone talking to a server, with every request it makes counted.
  async function phone(journal, opts){
    const o = opts || {};
    // A fresh context per case: pages in one context share storage, and a
    // previous case's trades being there when the next one loads has
    // produced two false failures on this project already.
    const ctx = await b.newContext({ viewport:{width:390,height:844} });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));

    const asked = { pending: [], image: [], deleted: [], videos: 0, videoDeleted: [], videoUrl: [] };
    let shots = (o.shots || []).slice();
    let videos = (o.videos || []).slice();

    // Broad rules FIRST, exact ones LAST -- the last-registered rule wins,
    // and getting this backwards once cost a whole run.
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));

    await p.route('**/media/**', async r => {
      const u = new URL(r.request().url());
      const seg = u.pathname.split('/').filter(Boolean); // ['media', ...]

      if(seg[1] === 'pending'){
        const slim = u.searchParams.get('slim') === '1';
        asked.pending.push({ slim });
        // An OLDER server ignores slim=1 and hands every picture over in
        // full, exactly as it always did. The app must still work.
        const out = (o.oldServer || !slim)
          ? shots
          : shots.map(s => Object.assign({}, s, { image:null, hasImage: !!s.image, bytes: s.image ? s.image.length : 0 }));
        return r.fulfill({status:200,contentType:'application/json',
          body: JSON.stringify({ screenshots: out, waiting: shots.length })});
      }
      if(seg[1] === 'pending-videos'){
        asked.videos++;
        return r.fulfill({status:200,contentType:'application/json',
          body: JSON.stringify({ videos, waiting: videos.length })});
      }
      if(seg[1] === 'video-url'){
        asked.videoUrl.push(u.searchParams.get('r2Key'));
        if(o.noVideoStorage) return r.fulfill({status:503,contentType:'application/json',body:'{"error":"no storage"}'});
        return r.fulfill({status:200,contentType:'application/json',
          body: JSON.stringify({ url: site.base + '/clip.webm' })});
      }
      if(seg[1] === 'video' && r.request().method() === 'DELETE'){
        const id = decodeURIComponent(seg[2]);
        asked.videoDeleted.push(id);
        videos = videos.filter(v => v.id !== id);
        return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      }
      if(seg[2] === 'image'){
        const id = decodeURIComponent(seg[1]);
        asked.image.push(id);
        const s = shots.find(x => x.id === id);
        if(!s) return r.fulfill({status:404,contentType:'application/json',
          body: JSON.stringify({ id, image:null, reason:'That picture is no longer waiting to be collected.' })});
        return r.fulfill({status:200,contentType:'application/json',
          body: JSON.stringify({ id, image: s.image || null, timestamp: s.timestamp,
            reason: s.image ? null : 'That picture was stored without any image data.' })});
      }
      if(r.request().method() === 'DELETE'){
        const id = decodeURIComponent(seg[1]);
        asked.deleted.push(id);
        shots = shots.filter(x => x.id !== id);
        return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
      }
      return r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    });
    await p.route('**/clip.webm', r => r.fulfill({status:200, contentType:'video/webm', body: clip}));
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
    return { p, asked, errors, close: () => ctx.close() };
  }

  // =====================================================================
  // 1. A picture that matches nothing
  // =====================================================================
  console.log('--- a picture that matches no trade ---');
  {
    // Stamped in the middle of the night: it will never match anything.
    const stray = { id:'stray1', timestamp: new Date('2026-06-09T02:00:00').getTime(), image: bigImage, moment:'entry' };
    const { p, asked, errors, close } = await phone([trade()], { shots: [stray] });
    for(let i = 0; i < 10; i++) await p.evaluate(() => matchPendingScreenshots());

    check(`it asks ten times (${asked.pending.length})`, asked.pending.length >= 10);
    check('and asks WITHOUT the pictures every time', asked.pending.every(a => a.slim === true));
    // This is the fault. Ten checks used to mean ten full pictures.
    check(`the picture itself is never fetched (${asked.image.length})`, asked.image.length === 0);
    check('it is left waiting, not thrown away', asked.deleted.length === 0);
    check('nothing threw', errors.length === 0);
    await close();
  }

  console.log('\n--- a picture that DOES match ---');
  {
    const shot = { id:'e1', timestamp: entryMs, image: bigImage, moment:'entry' };
    const { p, asked, errors, close } = await phone([trade()], { shots: [shot] });
    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(300);

    check(`its picture IS fetched, once (${asked.image.length})`, asked.image.length === 1);
    check('...and it is the one that matched', asked.image[0] === 'e1');
    // Asserts what the READERS get, not where it happens to be kept. The
    // picture now lives in the store with room for it and the trade keeps a
    // mark -- so "is it on the trade object" was a check on the old design,
    // and a test that describes the plumbing rather than the result fails
    // the moment the plumbing is improved.
    const marked = await p.evaluate(() => !!loadTrades()[0].shotEntry);
    check('the trade is marked as having one', marked);
    const stored = await p.evaluate(async () => (await pictureOn(loadTrades()[0], 'shotEntry')).image);
    check('and the picture itself comes back whole', typeof stored === 'string' && stored.length > 300000);
    check('while the journal itself stays small',
      (await p.evaluate(() => (localStorage.getItem('strat_trades')||'').length)) < 5000);
    check('and is cleared from the queue', asked.deleted.includes('e1'));

    // Asking again must not fetch it again.
    await p.evaluate(() => matchPendingScreenshots());
    check(`asking again fetches nothing more (${asked.image.length})`, asked.image.length === 1);
    check('nothing threw', errors.length === 0);
    await close();
  }

  console.log('\n--- a server too old to understand the lighter request ---');
  {
    const shot = { id:'e2', timestamp: entryMs, image: bigImage, moment:'entry' };
    const { p, asked, errors, close } = await phone([trade()], { shots: [shot], oldServer: true });
    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(300);
    const stored = await p.evaluate(async () => (await pictureOn(loadTrades()[0], 'shotEntry')).image);
    check('the picture still lands, with the old server', typeof stored === 'string' && stored.length > 300000);
    check(`and nothing extra is asked for (${asked.image.length})`, asked.image.length === 0);
    check('nothing threw', errors.length === 0);
    await close();
  }

  console.log('\n--- the picture cannot be collected ---');
  {
    // On the list, but gone by the time it is asked for. The old code had
    // no way to even express this; the new one must say which part refused.
    const ghost = { id:'ghost', timestamp: entryMs, image: null, moment:'entry' };
    const { p, asked, errors, close } = await phone([trade()], { shots: [ghost] });
    await p.evaluate(() => matchPendingScreenshots());
    await p.waitForTimeout(300);
    const stored = await p.evaluate(() => loadTrades()[0].shotEntry);
    check('nothing is attached', !stored);
    const why = await p.evaluate(() => readProblem('shots'));
    check('the reason is kept, rather than a silent blank', !!(why && why.text));
    check(`...and names the fault (${why && why.text})`, /without any image data/i.test((why && why.text) || ''));
    // The rebuild's own reason must not have been overwritten by this --
    // the old store was two variables and an if/else with no third slot.
    const other = await p.evaluate(() => readProblem('rebuild'));
    check('it did not overwrite what the rebuild had said', !other || other.text !== why.text);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // =====================================================================
  // 2. Recordings
  // =====================================================================
  console.log('\n--- a recording reaches the journal ---');
  {
    const vid = { id:'v1', r2Key:'videos/v1.webm', timestamp: entryMs, sizeBytes: 4_500_000 };
    const { p, asked, errors, close } = await phone([trade()], { videos: [vid] });
    await p.evaluate(() => matchPendingVideos());
    await p.waitForTimeout(300);

    const saved = await p.evaluate(() => loadTrades()[0].video);
    check('it is attached to the trade', !!(saved && saved.r2Key === 'videos/v1.webm'));
    check('...with when it was taken', saved && saved.takenAt === entryMs);
    // The recording itself must NEVER be in the journal: one is tens of
    // megabytes and the journal lives in the phone's own small storage.
    const stored = await p.evaluate(() => localStorage.getItem('strat_trades'));
    check(`the journal holds a pointer, not the recording (${stored.length} characters)`, stored.length < 4000);
    check('and no video data is anywhere in it', !/base64|webm;/.test(stored));
    check('it is cleared from the queue', asked.videoDeleted.includes('v1'));

    // A button he can actually press.
    await p.evaluate(() => { showView('journal'); renderJournal(); });
    await p.waitForTimeout(200);
    const btn = await p.locator('.trade-card button.tc-video').count();
    check(`a Recording button appears on the card (${btn})`, btn === 1);

    // Pressing it asks for a FRESH link -- the stored place is private and
    // a link expires, so one cannot be kept.
    await p.locator('.trade-card button.tc-video').first().click();
    await p.waitForTimeout(400);
    check('...which fetches a fresh link', asked.videoUrl.length === 1 && asked.videoUrl[0] === 'videos/v1.webm');
    const open = await p.locator('#videoModal.show').count();
    check('the player opens', open === 1);
    const player = await p.locator('#videoModal video').count();
    check('with a real player in it', player === 1);
    // Not just present: it has to actually open the recording. A player
    // sitting on a black rectangle is what a broken one looks like.
    const playable = await p.evaluate(() => new Promise(res => {
      const v = document.querySelector('#videoModal video');
      if(!v) return res({ ok:false, why:'no player' });
      if(v.readyState >= 2) return res({ ok:true, w:v.videoWidth, h:v.videoHeight });
      v.oncanplay = () => res({ ok:true, w:v.videoWidth, h:v.videoHeight });
      v.onerror = () => res({ ok:false, why: v.error ? v.error.message : 'unknown' });
      setTimeout(() => res({ ok:false, why:'never became playable' }), 5000);
    }));
    check(`the recording actually opens and plays (${JSON.stringify(playable)})`, playable.ok === true);
    check('...at a real size, so it is a picture and not a fragment', playable.w > 0 && playable.h > 0);

    await p.evaluate(() => closeVideo());
    await p.waitForTimeout(150);
    check('closing it empties the player rather than leaving it downloading',
      (await p.locator('#videoModal video').count()) === 0);

    // Asking again must not attach it a second time.
    await p.evaluate(() => matchPendingVideos());
    await p.waitForTimeout(200);
    const again = await p.evaluate(() => loadTrades().filter(t => t.video).length);
    check('asking again does not attach it twice', again === 1);
    check('nothing threw', errors.length === 0);
    await close();
  }

  console.log('\n--- a recording that matches no trade ---');
  {
    const stray = { id:'v9', r2Key:'videos/v9.webm', timestamp: new Date('2026-06-09T02:00:00').getTime(), sizeBytes: 1000 };
    const { p, asked, errors, close } = await phone([trade()], { videos: [stray] });
    for(let i = 0; i < 5; i++){ await p.evaluate(() => matchPendingVideos()); await p.waitForTimeout(80); }
    const saved = await p.evaluate(() => loadTrades()[0].video);
    check('nothing is attached', !saved);
    // Left on purpose: the trade may not have reached the journal yet, and
    // this costs almost nothing because it is a pointer, not a recording.
    check('it is left waiting rather than thrown away', asked.videoDeleted.length === 0);
    check('and no button appears', (await p.locator('.trade-card button.tc-video').count()) === 0);
    check('nothing threw', errors.length === 0);
    await close();
  }

  console.log('\n--- the same recording offered twice ---');
  {
    // The clearing failed last time, so it comes back. Left alone it would
    // eventually be filed against a SECOND trade -- one recording in two
    // places. The same fault the picture queue had.
    const vid = { id:'v1', r2Key:'videos/v1.webm', timestamp: entryMs, sizeBytes: 4_500_000 };
    const second = trade({ id:'t2', entryTime:'09:33', exitTime:'09:38' });
    const held = trade({ video: { id:'v1', r2Key:'videos/v1.webm', takenAt: entryMs, sizeBytes: 4_500_000 } });
    const { p, asked, errors, close } = await phone([held, second], { videos: [vid] });
    await p.evaluate(() => matchPendingVideos());
    await p.waitForTimeout(300);
    const withVideo = await p.evaluate(() => loadTrades().filter(t => t.video).length);
    check('it is not filed against a second trade', withVideo === 1);
    check('and it IS cleared this time, so it stops coming back', asked.videoDeleted.includes('v1'));
    check('nothing threw', errors.length === 0);
    await close();
  }

  console.log('\n--- the recording cannot be fetched ---');
  {
    const held = trade({ video: { id:'v1', r2Key:'videos/v1.webm', takenAt: entryMs, sizeBytes: 4_500_000 } });
    const { p, errors, close } = await phone([held], { noVideoStorage: true });
    await p.evaluate(() => { showView('journal'); renderJournal(); });
    await p.waitForTimeout(150);
    await p.locator('.trade-card button.tc-video').first().click();
    await p.waitForTimeout(400);
    const said = await p.locator('#videoState').textContent();
    check(`it says what went wrong (${said})`, /not switched on for storage/i.test(said || ''));
    check('...in plain words, with nothing raw from the server in it',
      !/\b(error|API|endpoint|503|null|undefined)\b/i.test(said || ''));
    check('nothing threw', errors.length === 0);
    await close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); site.stop();
  process.exit(fail ? 1 : 0);
})();
