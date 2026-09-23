// "The speed button of how fast I want the bars to play is no longer
// available" -- 2026-09-23.
//
// MEASURED FIRST. In a simulated phone the speed row fits at every height
// tried (844, 740, 664 and 600 tall): the chart shrinks and the row lands
// on screen with room to spare. So the layout arithmetic was never wrong,
// and repeating that measurement would have proved nothing.
//
// WHAT IS WRONG IS WHERE THE PANEL IS ANCHORED. The panel sits in a
// position:fixed layer, and on an iPhone that is laid out against the area
// the page THINKS it has -- which, while Safari's toolbar is on screen, is
// taller than what is actually visible. The layer was aligned to the
// BOTTOM of that taller area, so the panel's last row sat underneath the
// toolbar. The panel is overflow:hidden, so there was no way to scroll to
// it either: the speed buttons were simply gone.
//
// This is the same fault as the bottom row of buttons that floated in the
// middle of his screen, and it is fixed the same way -- by not positioning
// against the wrong edge, never by measuring the gap and nudging. That
// correction is what made the bar jitter and cost him a round.
//
// A simulated browser has no toolbar that slides away, so this file CANNOT
// reproduce his phone. What it can do is hold the two things that make the
// fault impossible: the panel is anchored to the TOP, and the speed row is
// inside the panel at every height. Stated plainly rather than dressed up
// as a reproduction.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const bars = (n) => {
    const out = []; let t = Date.UTC(2026,5,24,13,30), p = 4.80;
    for(let i=0;i<n;i++){
      out.push({ open:+p.toFixed(2), high:+(p+0.02).toFixed(2), low:+(p-0.02).toFixed(2),
                 close:+(p+0.01).toFixed(2), volume:2300, datetime:t });
      t += 60000; p += (i%7<4 ? 0.01 : -0.012);
    }
    return out;
  };
  const trade = (c) => ({
    id:'nio1', ticker:'NIO', dir:'Short', entryDate:'2026-06-24', entryTime:'09:31',
    exitDate:'2026-06-24', exitTime:'15:55', optEntry:0.49, optExit:0.53, contracts:1,
    occ:'NIO   260723P00004000', fills:['a','b'], fees:3.99, pnlDollar:12, pnlNet:8.01,
    winLoss:'Win', source:'schwab-auto', settled:true,
    replayData:{ candles:c, entryIndex:1, exitIndex:c.length-2 },
  });

  console.log('--- the panel is anchored to the TOP, which is what stops this ---');
  {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
    const p = await ctx.newPage();
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    const how = await p.evaluate(()=>{
      const o = document.getElementById('replayModal');
      o.classList.add('show');
      const align = getComputedStyle(o).alignItems;
      const box = o.querySelector('.modal-box.fs');
      const top = Math.round(box.getBoundingClientRect().top);
      o.classList.remove('show');
      return { align, top, hasClass: o.classList.contains('fs-overlay') };
    });
    // Aligned to the bottom, the panel's last row lands below the visible
    // bottom on a phone whose toolbar is showing. Aligned to the top it
    // cannot, whatever the toolbar is doing.
    check(`the full-screen panel is aligned to the top, not the bottom (${how.align})`, how.align === 'flex-start');
    check('and it starts at the very top of the screen (top=' + how.top + ')', how.top === 0);
    check('the panel carries the mark that does it, rather than a clever selector', how.hasClass === true);
    await ctx.close();
  }

  console.log('\n--- and the speed buttons are inside the panel at every height ---');
  {
    // Four heights, because his phone's visible area changes as Safari's
    // toolbar slides in and out, and the short one is the case that bites.
    for(const H of [844, 740, 664, 600]){
      const ctx = await b.newContext({ viewport:{width:390,height:H}, deviceScaleFactor:2 });
      const p = await ctx.newPage();
      const errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
        : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
      await p.goto(site.base + '/index.html');
      await p.evaluate(() => localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})));
      await p.reload(); await p.waitForTimeout(400);
      await p.evaluate((t)=>{ localStorage.setItem('strat_trades', JSON.stringify([t])); openReplay(t); }, trade(bars(200)));
      await p.waitForTimeout(1200);

      const r = await p.evaluate(()=>{
        const row = document.getElementById('replaySpeedRow');
        const box = document.querySelector('#replayModal .modal-box.fs');
        const rb = row.getBoundingClientRect(), bb = box.getBoundingClientRect();
        return {
          text: (row.textContent||'').trim(),
          rowBottom: Math.round(rb.bottom), rowTop: Math.round(rb.top),
          boxBottom: Math.round(bb.bottom),
          seen: document.documentElement.clientHeight,
          pills: row.querySelectorAll('.pill').length,
        };
      });
      // The BOTTOM of the buttons, not their top -- sitting at the bottom
      // is not the same as being all there, and the bottom is the part
      // that disappears first.
      check(`${H} tall: the speed buttons are fully on screen (bottom ${r.rowBottom} of ${r.seen})`,
        r.rowBottom <= r.seen && r.rowTop >= 0);
      check(`${H} tall: all four speeds are there (${r.text})`, r.pills === 4 && /0\.5x/.test(r.text) && /4x/.test(r.text));
      check(`${H} tall: nothing threw`, errors.length === 0);
      await ctx.close();
    }
  }

  console.log('\n--- selecting a line adds buttons, and must not push them off ---');
  {
    // The button row wraps onto a second line when Lock and Delete appear.
    // The chart is the only thing that may give up height for that -- the
    // speed buttons are not.
    const ctx = await b.newContext({ viewport:{width:390,height:664}, deviceScaleFactor:2 });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
      : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate(() => localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})));
    await p.reload(); await p.waitForTimeout(400);
    await p.evaluate((t)=>{ localStorage.setItem('strat_trades', JSON.stringify([t])); openReplay(t); }, trade(bars(200)));
    await p.waitForTimeout(1200);

    const box = await p.evaluate(()=>{ const c=document.getElementById('replayChartContainer');
      const r=c.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; });
    await p.evaluate(()=>setReplayDrawMode('ray'));
    await p.mouse.move(box.x + box.w*0.5, box.y + box.h*0.4);
    await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(250);
    await p.evaluate(()=>setReplayDrawMode(null));
    await p.evaluate(()=>{ replaySelectedDrawing = { drawing: replayDrawings[0], part:'ray-body' }; buildReplayDrawRow(); });
    await p.waitForTimeout(400);

    const r = await p.evaluate(()=>{
      const row = document.getElementById('replaySpeedRow');
      const draw = document.getElementById('replayDrawRow');
      const rb = row.getBoundingClientRect();
      return { rowBottom: Math.round(rb.bottom), seen: document.documentElement.clientHeight,
               drawHeight: Math.round(draw.getBoundingClientRect().height),
               hasLock: /Lock/.test(draw.textContent) };
    });
    check('the extra buttons really did appear', r.hasLock === true);
    check(`and the button row grew onto a second line (${r.drawHeight} tall)`, r.drawHeight > 40);
    check(`the speed buttons are still fully on screen (bottom ${r.rowBottom} of ${r.seen})`, r.rowBottom <= r.seen);
    check('nothing threw', errors.length === 0);
    await ctx.close();
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
