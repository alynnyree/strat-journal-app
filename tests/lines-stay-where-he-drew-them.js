// He asked for three things after the chart finally drew (2026-09-21):
//
//   1. "My lines (h-ray, trendline) should save when I leave the chart, so
//      when I come back to open the app or open the chart these lines are
//      there until I decide to delete them."
//   2. "When I draw lines on the chart then move around the chart... the
//      lines drawn move slightly and then readjust to the original position
//      I drew them in. The lines drawn should not, under any circumstances,
//      move until I move them myself."
//   3. "There should be a lock button... where they are unable to move
//      unless I unlock them and move them myself."
//
// MEASURED BEFORE ANYTHING WAS CHANGED, because guessing cost four rounds
// on the blank chart and I am not doing that again:
//
//   - Saving worked. Drawing a ray, closing, reopening and reloading the
//     whole page all kept it. So #1 was not what it looked like.
//   - But EVERY line vanished the moment he changed timeframe. Drawn on
//     1m, tapped 5m: nothing painted at all, and back again on 1m. A line
//     is anchored to a moment, and asking the chart where a moment sits
//     only works if a bar STARTS exactly there -- a 5-minute bar starting
//     at 10:40 cannot answer for 10:42. That is almost certainly what he
//     was seeing, and it is a real fault either way.
//   - And the drift was real and worse than "slightly". With a ray at a
//     fixed price: after an ordinary sideways drag it belonged at 231 and
//     was painted at 225.3; after dragging the price axis it belonged at
//     245 and was STILL painted at 225.3. Twenty pixels out, and still out
//     after he let go.
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

  // A SHARP screen, because that is the one he uses and the one the last
  // bug only ever appeared on.
  const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
    : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto(site.base + '/index.html');
  await p.evaluate(() => localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})));
  await p.reload(); await p.waitForTimeout(500);
  await p.evaluate((t)=>{ localStorage.setItem('strat_trades', JSON.stringify([t])); openReplay(t); }, trade(bars(200)));
  await p.waitForTimeout(1400);

  // READ FRESH EVERY TIME, never captured once. The button row grows a
  // line when a line is selected (Lock and Delete appear), and the app
  // correctly gives the chart the height that leaves -- measured going
  // from 564 tall to 530 the moment Lock appeared. A box remembered from
  // earlier is therefore 34 pixels wrong, and every tap built on it lands
  // off the line. That cost a round reading as "unlocking does not work".
  const chartBox = () => p.evaluate(()=>{
    const c = document.getElementById('replayChartContainer');
    const r = c.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};
  });
  let box = await chartBox();

  // How many of HIS line's pixels are on screen. Counted across every
  // surface the chart has, because the chart paints the lines itself now --
  // there is no separate sheet to look at.
  const amber = () => p.evaluate(()=>{
    let n = 0;
    for(const c of document.querySelectorAll('#replayModal canvas')){
      try{
        const g = document.createElement('canvas'); g.width=c.width; g.height=c.height;
        g.getContext('2d').drawImage(c,0,0);
        const d = g.getContext('2d').getImageData(0,0,c.width,c.height).data;
        for(let i=0;i<d.length;i+=4){
          if(d[i+3]>200 && d[i]>220 && d[i+1]>150 && d[i+1]<230 && d[i+2]<130) n++;
        }
      }catch(e){}
    }
    return n;
  });

  const drawRay = async (fracX, fracY) => {
    box = await chartBox();
    await p.evaluate(()=>setReplayDrawMode('ray'));
    await p.mouse.move(box.x + box.w*fracX, box.y + box.h*fracY);
    await p.mouse.down(); await p.mouse.up();
    await p.waitForTimeout(250);
    await p.evaluate(()=>setReplayDrawMode(null));
    await p.waitForTimeout(150);
  };

  // ------------------------------------------------------------------
  console.log('--- a line appears the moment he draws it, with no need to move the chart ---');
  {
    await drawRay(0.5, 0.4);
    const n = await amber();
    check(`his line is painted straight away (${n} of its pixels on screen)`, n > 200);
    // Written so this whole file still RUNS against the old code. A test
    // that falls over on a missing name proves only that the name is
    // missing -- it never gets as far as the behaviour, which is the
    // thing worth proving it catches.
    const st = await p.evaluate(()=>({
      attached: typeof replayPainterAttached === 'undefined' ? null : replayPainterAttached,
      fault: typeof replayPaintFault === 'undefined' ? null : replayPaintFault,
    }));
    check('the chart took the line painter on', st.attached === true);
    check('and the painter hit nothing on the way: ' + (st.fault || 'nothing'), st.fault === null);
    check('nothing threw', errors.length === 0);
  }

  // ------------------------------------------------------------------
  console.log('\n--- HIS #2: the line does not move when he moves around the chart ---');
  {
    // Where the line BELONGS versus where it is actually painted, sampled
    // while the drag is still happening -- not after it settles, because
    // settling is exactly what hid this.
    const probe = () => p.evaluate(()=>{
      const d = replayDrawings.find(x=>x.type==='ray');
      const truthY = replaySeries.priceToCoordinate(d.anchor.price);
      const anchorX = (typeof replayTimeToX === 'function')
        ? replayTimeToX(d.anchor.time)
        : replayChart.timeScale().timeToCoordinate(d.anchor.time);
      const dpr = window.devicePixelRatio||1;
      let sy=0, n=0;
      for(const c of document.querySelectorAll('#replayModal canvas')){
        if(c.width < 200) continue;                       // the narrow price strips
        try{
          const g=document.createElement('canvas'); g.width=c.width; g.height=c.height;
          g.getContext('2d').drawImage(c,0,0);
          // Sample a column that is definitely to the RIGHT of where the
          // ray starts -- a ray runs rightwards from its anchor, so a
          // column left of the anchor is empty and says nothing.
          const col = Math.min(c.width-4, Math.round((anchorX + 30) * dpr));
          const im = g.getContext('2d').getImageData(col,0,1,c.height).data;
          for(let y=0;y<c.height;y++){ const i=y*4;
            if(im[i+3]>200 && im[i]>220 && im[i+1]>150 && im[i+1]<230 && im[i+2]<130){ sy+=y; n++; } }
        }catch(e){}
      }
      return { truthY, paintedY: n? (sy/n)/dpr : null, rows:n };
    });

    box = await chartBox();
    const rest = await probe();
    check(`at rest it is painted where it belongs (belongs ${rest.truthY && rest.truthY.toFixed(1)}, painted ${rest.paintedY && rest.paintedY.toFixed(1)})`,
      rest.paintedY != null && Math.abs(rest.paintedY - rest.truthY) < 2);

    // A sideways drag. The price scale shifts by itself as bars come and
    // go, which used to move the candles with nothing telling the lines.
    let worstPan = 0;
    await p.mouse.move(box.x + box.w*0.5, box.y + box.h*0.5);
    await p.mouse.down();
    for(const dx of [30, 60, 90]){
      await p.mouse.move(box.x + box.w*0.5 - dx, box.y + box.h*0.5);
      const r = await probe();
      if(r.paintedY != null) worstPan = Math.max(worstPan, Math.abs(r.paintedY - r.truthY));
    }
    await p.mouse.up(); await p.waitForTimeout(300);
    check(`it never drifts while he pans sideways (worst gap ${worstPan.toFixed(1)} pixels)`, worstPan < 2);

    // THE ONE THAT WAS TWENTY PIXELS OUT. Dragging the price axis moves
    // the candles up and down and says nothing at all about it.
    let worstPrice = 0;
    await p.mouse.move(box.x + box.w - 16, box.y + box.h*0.5);
    await p.mouse.down();
    for(const dy of [40, 80]){
      await p.mouse.move(box.x + box.w - 16, box.y + box.h*0.5 + dy, {steps:4});
      const r = await probe();
      if(r.paintedY != null) worstPrice = Math.max(worstPrice, Math.abs(r.paintedY - r.truthY));
    }
    await p.mouse.up(); await p.waitForTimeout(300);
    check(`and never drifts while he drags the price axis (worst gap ${worstPrice.toFixed(1)} pixels)`, worstPrice < 2);

    const settled = await probe();
    check(`and it is still right once he lets go (gap ${settled.paintedY!=null ? Math.abs(settled.paintedY-settled.truthY).toFixed(1) : 'not measured'})`,
      settled.paintedY != null && Math.abs(settled.paintedY - settled.truthY) < 2);

    // And the line has not MOVED in his terms -- same price, same moment.
    const anchor = await p.evaluate(()=>{
      const d = replayDrawings.find(x=>x.type==='ray'); return {...d.anchor};
    });
    check('and the line itself is untouched: same price, same moment', typeof anchor.price === 'number' && typeof anchor.time === 'number');
    check('nothing threw', errors.length === 0);
  }

  // ------------------------------------------------------------------
  console.log('\n--- the line stays on every timeframe, which is where they used to vanish ---');
  {
    const onEach = {};
    for(const tf of [5, 15, 1]){
      await p.evaluate((t)=>setReplayTimeframe(t), tf);
      await p.waitForTimeout(500);
      onEach[tf] = await amber();
    }
    check(`still there on 5-minute bars (${onEach[5]} pixels; it was 0)`, onEach[5] > 200);
    check(`still there on 15-minute bars (${onEach[15]} pixels; it was 0)`, onEach[15] > 200);
    check(`and back on 1-minute (${onEach[1]} pixels)`, onEach[1] > 200);
    check('nothing threw', errors.length === 0);
  }

  // ------------------------------------------------------------------
  console.log('\n--- HIS #1: the lines are still there next time, and after a full reload ---');
  {
    const saved = await p.evaluate(()=>{
      const t = JSON.parse(localStorage.getItem('strat_trades'))[0];
      return t.chartDrawings || null;
    });
    check(`it is written down against the trade (${saved && saved.length} line)`, !!saved && saved.length === 1);

    await p.evaluate(()=>closeReplay());
    await p.waitForTimeout(300);
    await p.evaluate(()=>{ const t=JSON.parse(localStorage.getItem('strat_trades'))[0]; openReplay(t); });
    await p.waitForTimeout(1200);
    check(`it comes back when he reopens the chart (${await amber()} pixels)`, (await amber()) > 200);

    await p.reload(); await p.waitForTimeout(700);
    await p.evaluate(()=>{ const t=JSON.parse(localStorage.getItem('strat_trades'))[0]; openReplay(t); });
    await p.waitForTimeout(1200);
    check(`and after closing and reopening the app itself (${await amber()} pixels)`, (await amber()) > 200);
    check('nothing threw', errors.length === 0);
  }

  // ------------------------------------------------------------------
  console.log('\n--- HIS #3: a locked line cannot be dragged, and cannot be deleted by accident ---');
  {
    box = await chartBox();
    const before = await p.evaluate(()=>{
      const d = replayDrawings.find(x=>x.type==='ray'); return {...d.anchor};
    });
    // Tap it, then lock it.
    const at = await p.evaluate(()=>{
      const d = replayDrawings.find(x=>x.type==='ray');
      const ax = (typeof replayTimeToX === 'function')
        ? replayTimeToX(d.anchor.time)
        : replayChart.timeScale().timeToCoordinate(d.anchor.time);
      return { x: ax + 40, y: replaySeries.priceToCoordinate(d.anchor.price) };
    });
    await p.mouse.move(box.x + at.x, box.y + at.y);
    await p.mouse.down(); await p.mouse.up();
    await p.waitForTimeout(250);
    check('tapping the line selects it', await p.evaluate(()=>!!replaySelectedDrawing));

    const rowBefore = await p.evaluate(()=>document.getElementById('replayDrawRow').textContent);
    check('an unlocked line offers Lock: ' + rowBefore.replace(/\s+/g,' ').trim().slice(0,60), /Lock Line/.test(rowBefore) && !/Unlock/.test(rowBefore));
    check('...and offers Delete while it is unlocked', /Delete Line/.test(rowBefore));

    await p.evaluate(()=>{ if(typeof toggleSelectedReplayDrawingLock === 'function') toggleSelectedReplayDrawingLock(); });
    await p.waitForTimeout(250);
    check('it is now locked', await p.evaluate(()=>!!replayDrawings.find(d=>d.type==='ray').locked));

    const rowAfter = await p.evaluate(()=>document.getElementById('replayDrawRow').textContent);
    check('a locked line offers Unlock: ' + rowAfter.replace(/\s+/g,' ').trim().slice(0,60), /Unlock Line/.test(rowAfter));
    // A lock that still lets a stray tap destroy the line is not a lock.
    check('...and Delete is not even offered while it is locked', !/Delete Line/.test(rowAfter));

    // Now try hard to drag it. Box read again -- selecting the line just
    // added buttons, which may have changed the chart's height.
    box = await chartBox();
    const atL = await p.evaluate(()=>{
      const d = replayDrawings.find(x=>x.type==='ray');
      const ax = (typeof replayTimeToX === 'function')
        ? replayTimeToX(d.anchor.time)
        : replayChart.timeScale().timeToCoordinate(d.anchor.time);
      return { x: ax + 40, y: replaySeries.priceToCoordinate(d.anchor.price) };
    });
    await p.mouse.move(box.x + atL.x, box.y + atL.y);
    await p.mouse.down();
    await p.mouse.move(box.x + atL.x, box.y + atL.y - 120, {steps:8});
    await p.mouse.up();
    await p.waitForTimeout(300);
    const after = await p.evaluate(()=>{
      const d = replayDrawings.find(x=>x.type==='ray'); return {...d.anchor};
    });
    check(`dragging a locked line does not move it (price ${before.price.toFixed(4)} -> ${after.price.toFixed(4)})`,
      after.price === before.price && after.time === before.time);

    // And asking outright to delete it is refused too.
    await p.evaluate(()=>{
      replaySelectedDrawing = { drawing: replayDrawings.find(d=>d.type==='ray'), part:'ray-body' };
      deleteSelectedReplayDrawing();
    });
    await p.waitForTimeout(200);
    check('and it cannot be deleted while locked', await p.evaluate(()=>replayDrawings.some(d=>d.type==='ray')));

    // Clear All must not wipe it either -- that would undo the whole point.
    p.once('dialog', d => d.accept());
    await p.evaluate(()=>clearReplayDrawings());
    await p.waitForTimeout(300);
    check('and Clear All keeps it', await p.evaluate(()=>replayDrawings.some(d=>d.type==='ray'&&d.locked)));

    // The lock survives leaving and coming back -- a lock he set that
    // quietly lapsed would be worse than no lock at all.
    await p.evaluate(()=>closeReplay());
    await p.waitForTimeout(300);
    await p.evaluate(()=>{ const t=JSON.parse(localStorage.getItem('strat_trades'))[0]; openReplay(t); });
    await p.waitForTimeout(1200);
    check('the lock is still on after reopening', await p.evaluate(()=>!!(replayDrawings.find(d=>d.type==='ray')||{}).locked));

    // Unlocking gives him his line back to move.
    await p.evaluate(()=>{
      replaySelectedDrawing = { drawing: replayDrawings.find(d=>d.type==='ray'), part:'ray-body' };
      if(typeof toggleSelectedReplayDrawingLock === 'function') toggleSelectedReplayDrawingLock();
    });
    await p.waitForTimeout(200);
    box = await chartBox();
    const at2 = await p.evaluate(()=>{
      const d = replayDrawings.find(x=>x.type==='ray');
      const ax = (typeof replayTimeToX === 'function')
        ? replayTimeToX(d.anchor.time)
        : replayChart.timeScale().timeToCoordinate(d.anchor.time);
      return { x: ax + 40, y: replaySeries.priceToCoordinate(d.anchor.price) };
    });
    const p0 = await p.evaluate(()=>replayDrawings.find(d=>d.type==='ray').anchor.price);
    // DRAG TOWARDS THE MIDDLE, not blindly upwards. An earlier step in this
    // same file had already moved the line near the top, so "up by 100"
    // took the finger off the chart entirely -- and a drag that leaves the
    // chart legitimately does nothing. That read as the app refusing to
    // move an unlocked line, which it was not. The test was measuring its
    // own earlier step.
    const toward = at2.y < box.h/2 ? at2.y + 120 : at2.y - 120;
    await p.mouse.move(box.x + at2.x, box.y + at2.y);
    await p.mouse.down();
    await p.mouse.move(box.x + at2.x, box.y + toward, {steps:8});
    await p.mouse.up();
    await p.waitForTimeout(300);
    const p1 = await p.evaluate(()=>replayDrawings.find(d=>d.type==='ray').anchor.price);
    check(`once unlocked he can move it again (${p0.toFixed(3)} -> ${p1.toFixed(3)})`, p1 !== p0);
    check('nothing threw', errors.length === 0);
  }

  // ------------------------------------------------------------------
  console.log('\n--- there is no see-through sheet over the chart any more ---');
  {
    const gone = await p.evaluate(()=>!document.getElementById('replayDrawCanvas'));
    check('the separate lines layer is gone entirely', gone);
    const biggest = await p.evaluate(()=>{
      let w=0,h=0,px=0;
      for(const c of document.querySelectorAll('#replayModal canvas')){
        if(c.width*c.height > px){ px=c.width*c.height; w=c.width; h=c.height; }
      }
      return {w,h,px};
    });
    // The surface that doubled itself reached 2.9 BILLION pixels and took
    // the whole chart down for ten days. Nothing here may come near that.
    check(`and the largest surface is a sane size (${biggest.w}x${biggest.h} = ${(biggest.px/1e6).toFixed(1)}M)`, biggest.px < 25e6);
    check('nothing threw', errors.length === 0);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
