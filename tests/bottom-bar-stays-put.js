// The bottom row of buttons moving as he scrolls.
//
// He reported it twice. First floating in the middle of the screen with the
// trade list carrying on above and below it; then, after a first attempt at
// fixing it, still moving whenever he scrolled.
//
// The first attempt measured the gap between the phone's two ideas of where
// the page ends and nudged the bar back. That left the bar chasing a moving
// number, which is the moving he reported the second time. It is not pinned
// to anything now: the app is one box exactly the height of the screen, the
// trades scroll inside it, and the bar is simply its last row.
//
// So these check the property that actually matters -- the bar does not move,
// while the trades underneath it do -- rather than any particular arithmetic.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const trade = (i) => ({
    id: 'n'+i, ticker:'NIO', dir:'Short', occ:'NIO   260723P0000500'+(i%10),
    entryDate:'2026-06-24', entryTime:'15:5'+(i%10), exitDate:'2026-07-23', exitTime:'12:32',
    optEntry:0.49, optExit:0.53, contracts:2, undEntry:4.92, undExit:4.62,
    fees:2.65, pnlDollar:8, pnlNet:5.35, pnlPercent:8.2, winLoss:'Win',
    ftfc:{}, ftfcRun:4, ftfcConfirmed:true, ftfcDirection:'Bearish',
    notes:'', source:'schwab-auto', settled:true, fillAttempts:1,
  });

  // A phone with enough trades on it that the list is far longer than the
  // screen -- the only condition under which any of this can be seen.
  async function phone(opts){
    const o = opts || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    if(o.motion){
      // With the fade-in effect ON, a card only appears once something says
      // it is on screen. The page itself no longer scrolls, so this is the
      // case that would leave the Journal blank if the effect were still
      // listening in the wrong place.
      await p.addInitScript(() => localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:true})));
    }
    await p.route('**/api/trades/pending', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p.route('**/api/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate(({ts, motion}) => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false, motion:!!motion}));
      localStorage.setItem('strat_backfilled','1');
      localStorage.setItem('strat_trades', JSON.stringify(ts));
    }, { ts: Array.from({length: 40}, (_, i) => trade(i)), motion: !!o.motion });
    await p.reload(); await p.waitForTimeout(1100);
    return { p, errors };
  }

  const where = (p) => p.evaluate(() => {
    const bar = document.querySelector('.navbar').getBoundingClientRect();
    const box = document.getElementById('appScroll');
    const seen = document.documentElement.clientHeight;
    return { top: Math.round(bar.top), bottom: Math.round(bar.bottom),
             scrolled: Math.round(box.scrollTop), seen,
             canScroll: box.scrollHeight - box.clientHeight };
  });
  const scrollBy = (p, n) => p.evaluate((n) => {
    document.getElementById('appScroll').scrollTop += n;
  }, n);

  {
    const { p, errors } = await phone();
    await p.click('.navbar .item[data-view="journal"]'); await p.waitForTimeout(500);

    const start = await where(p);
    check(`there is more list than screen, so this can actually be seen (${start.canScroll}px of it)`, start.canScroll > 800);
    check(`the bar ends on the bottom edge of the screen (${start.bottom} of ${start.seen})`, start.bottom === start.seen);

    // Scroll the way he does, in stages, and watch the bar.
    const seenAt = [start.bottom];
    for(const step of [200, 400, 350, 900, -600]){
      await scrollBy(p, step); await p.waitForTimeout(180);
      seenAt.push((await where(p)).bottom);
    }
    const after = await where(p);
    check(`the trades really did move underneath it (scrolled to ${after.scrolled})`, after.scrolled > 0);
    check(`the bar never moved through any of it (${[...new Set(seenAt)].join(', ')})`,
      new Set(seenAt).size === 1 && seenAt[0] === start.seen);
    check('nothing on the page threw', errors.length === 0);
    await p.close();
  }

  {
    // The page itself must not scroll at all -- if it does, the phone's
    // toolbar starts sliding and the whole problem comes back.
    const { p } = await phone();
    const pageScrolls = await p.evaluate(() => {
      const d = document.documentElement;
      return { canScroll: d.scrollHeight - d.clientHeight, wide: d.scrollWidth - d.clientWidth };
    });
    check(`the page itself cannot scroll (${pageScrolls.canScroll}px)`, pageScrolls.canScroll <= 0);
    check(`and nothing sticks out sideways (${pageScrolls.wide}px)`, pageScrolls.wide <= 0);
    await p.close();
  }

  {
    // Every tab, not just the one he happened to photograph.
    const { p } = await phone();
    for(const tab of ['journal','new','ai','checklist','dashboard']){
      await p.click(`.navbar .item[data-view="${tab}"]`).catch(()=>{});
      await p.waitForTimeout(300);
      const r = await where(p);
      check(`${tab}: the bar ends on the bottom edge (${r.bottom} of ${r.seen})`, r.bottom === r.seen);
    }
    await p.close();
  }

  {
    // The fade-in effect used to be told about scrolling by the PAGE. With
    // the page no longer scrolling, a card below the fold would have stayed
    // invisible for ever -- this app has already shown him a blank Journal
    // holding 233 trades once.
    const { p, errors } = await phone({ motion: true });
    await p.click('.navbar .item[data-view="journal"]'); await p.waitForTimeout(500);
    await scrollBy(p, 3000); await p.waitForTimeout(900);
    const shown = await p.evaluate(() => {
      const seen = document.documentElement.clientHeight;
      const onScreen = [...document.querySelectorAll('#view-journal .card')]
        .filter(c => { const r = c.getBoundingClientRect(); return r.top < seen && r.bottom > 0; });
      return { onScreen: onScreen.length,
               // Released, not merely finished fading -- asking for the
               // animation to be over measures the clock, not the app.
               stranded: onScreen.filter(c => c.classList.contains('reveal') && !c.classList.contains('in')).length,
               // But a card sitting at nothing IS the blank-Journal fault,
               // whatever it is marked, so that is checked too.
               invisible: onScreen.filter(c => Number(getComputedStyle(c).opacity) < 0.5).length };
    });
    check(`with the fade-in on, no card below the fold is stranded (${shown.onScreen} on screen, ${shown.stranded} stranded)`,
      shown.onScreen > 0 && shown.stranded === 0);
    check(`and none of them is sitting at nothing (${shown.invisible} invisible)`, shown.invisible === 0);
    check('and nothing threw', errors.length === 0);
    await p.close();
  }

  {
    // Bar Replay covers the whole screen. It must still do that from inside
    // the scrolling box.
    const { p, errors } = await phone();
    await p.click('.navbar .item[data-view="journal"]'); await p.waitForTimeout(500);
    const modal = await p.evaluate(() => {
      const m = document.getElementById('replayModal');
      if(!m) return null;
      m.style.display = 'flex';
      const r = m.getBoundingClientRect();
      const out = { top: Math.round(r.top), left: Math.round(r.left),
                    width: Math.round(r.width), height: Math.round(r.height),
                    seenW: document.documentElement.clientWidth, seenH: document.documentElement.clientHeight };
      m.style.display = 'none';
      return out;
    });
    check(`Bar Replay still covers the whole screen (${modal && modal.width}x${modal && modal.height})`,
      modal && modal.top === 0 && modal.left === 0 && modal.width === modal.seenW && modal.height === modal.seenH);
    check('and nothing threw', errors.length === 0);
    await p.close();
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
