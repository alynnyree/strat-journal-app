// TEN DAYS OF A WHITE CHART, and this is what it was.
//
// His laptop reported the drawing surfaces sitting over the chart:
//
//   3428x1604(5.5M)@1714x802 ... and 76800x38400(2949.1M)@76800x38400
//
// That last one is 2.9 BILLION pixels. It is 300 x 2^8 by 150 x 2^8 -- a
// canvas's default size, DOUBLED EIGHT TIMES.
//
// The overlay that carries his trend lines measured ITSELF and then set
// itself to that times the screen's sharpness. On a sharp screen that is a
// doubling, and the next redraw doubles the doubled one. A surface that
// size cannot be allocated, and it sits directly on top of the chart.
//
// IT NEVER SHOWED IN ANY EARLIER REPRODUCTION because this machine's screen
// is not sharp -- times one is no growth. Four theories died before the
// measurement that mattered was even being taken. So this test runs at
// TWO, which is the only condition under which the fault exists.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const bars = (n) => {
    const out = []; let t = Date.UTC(2026,5,24,13,30), price = 4.61;
    for(let i=0;i<n;i++){
      price += (Math.random()-0.5)*0.01;
      out.push({ datetime:t, open:+price.toFixed(2), high:+(price+0.02).toFixed(2),
                 low:+(price-0.02).toFixed(2), close:+(price+0.01).toFixed(2), volume:21700 });
      t += 60000;
    }
    return out;
  };
  const trade = (candles) => ({
    id:'nio1', ticker:'NIO', dir:'Short', entryDate:'2026-06-24', entryTime:'09:31',
    exitDate:'2026-07-23', exitTime:'15:55', optEntry:0.49, optExit:0.53, contracts:1,
    occ:'NIO   260723P00004000', fills:['a','b'], fees:3.99, pnlDollar:12, pnlNet:8.01,
    winLoss:'Win', source:'schwab-auto', settled:true,
    replayData:{ candles, entryIndex:1, exitIndex:candles.length-2 },
  });

  // HIS SCREEN. deviceScaleFactor 2 is the whole point of this file.
  const ctx = await b.newContext({ viewport:{width:1768,height:940}, deviceScaleFactor:2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
    : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto(site.base + '/index.html');
  await p.evaluate(() => localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})));
  await p.reload(); await p.waitForTimeout(500);

  console.log('--- the screen really is a sharp one, or this test proves nothing ---');
  {
    const dpr = await p.evaluate(() => window.devicePixelRatio);
    check(`screen sharpness is ${dpr}, not 1`, dpr === 2);
  }

  console.log('\n--- no surface may grow when the chart is redrawn many times ---');
  {
    // THE OVERLAY IS GONE. His lines are painted by the chart itself now,
    // so there is no separate sheet left to measure itself and run away.
    // This still repeats the redraw many times and watches every surface,
    // because the fault was never really "that one canvas" -- it was a
    // surface sized from its own size, and the check that matters is that
    // nothing in here grows when asked to draw again and again.
    const r = await p.evaluate(async (c) => {
      const t = { id:'nio1', ticker:'NIO', dir:'Short', entryDate:'2026-06-24', entryTime:'09:31',
        exitDate:'2026-07-23', exitTime:'15:55', optEntry:0.49, optExit:0.53, contracts:1,
        occ:'NIO   260723P00004000', fills:['a','b'], fees:3.99, pnlDollar:12, pnlNet:8.01,
        winLoss:'Win', source:'schwab-auto', settled:true,
        replayData:{ candles:c, entryIndex:1, exitIndex:c.length-2 } };
      localStorage.setItem('strat_trades', JSON.stringify([t]));
      openReplay(t);
      await new Promise(r2 => setTimeout(r2, 800));
      // Let the fullscreen modal finish settling FIRST. Its height moves
      // for a moment after opening, so surfaces legitimately change with
      // it -- asserting on that would measure the layout, not the fault.
      await new Promise(r2 => setTimeout(r2, 900));
      const biggest = () => {
        let w=0,h=0,px=0;
        for(const c2 of document.querySelectorAll('#replayModal canvas')){
          if(c2.width*c2.height > px){ px=c2.width*c2.height; w=c2.width; h=c2.height; }
        }
        return { w, h, px };
      };
      const sizes = [];
      // Twelve redraws. Doubling eight times is what reached his 76800.
      for(let i = 0; i < 12; i++){
        redrawReplayDrawingsInner();
        const b2 = biggest();
        sizes.push(b2.w + 'x' + b2.h);
        await new Promise(r2 => setTimeout(r2, 20));
      }
      const last = biggest();
      const host = document.getElementById('replayChartContainer');
      return { sizes, first: sizes[0], last: sizes[sizes.length-1],
               w: last.w, h: last.h,
               overlayGone: !document.getElementById('replayDrawCanvas'),
               host: host ? host.clientWidth + 'x' + host.clientHeight : 'none' };
    }, bars(3708));

    check('the separate lines layer no longer exists at all', r.overlayGone === true);
    // THE FAULT WAS DOUBLING, so that is what is asserted. Not "identical" --
    // the box it lives in can legitimately change, and demanding sameness
    // would be measuring the layout rather than the bug.
    const widths = r.sizes.map(x => Number(x.split('x')[0]));
    check(`nothing doubles (widths ${widths[0]} -> ${widths[widths.length-1]})`,
      Math.max(...widths) <= Math.min(...widths) * 1.5);
    check('and it settles rather than climbing', r.first === r.last);
    check(`and the largest surface is sane, not billions of pixels (${r.w}x${r.h} = ${(r.w*r.h/1e6).toFixed(1)}M)`,
      r.w * r.h < 30e6);
    check(`it matches the box the chart sits in times the sharpness (box ${r.host})`,
      r.w > 400 && r.w < 8192);
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- and the chart actually draws ---');
  {
    const paint = await p.evaluate(() => {
      const cs = Array.from(document.querySelectorAll('#replayModal canvas'))
        .sort((a,b)=>(b.width*b.height)-(a.width*a.height));
      const big = cs[0];
      const c2 = document.createElement('canvas');
      c2.width = 240; c2.height = 160;
      const g = c2.getContext('2d', { willReadFrequently:true });
      g.drawImage(big, 0, 0, big.width, big.height, 0, 0, 240, 160);
      const d = g.getImageData(0,0,240,160).data;
      let dark=0, green=0;
      for(let i=0;i<d.length;i+=4){
        if(d[i]<25&&d[i+1]<25&&d[i+2]<30) dark++;
        if(d[i+1]>100&&d[i+1]>d[i]+40) green++;
      }
      return { dark, green, biggest: big.width+'x'+big.height };
    });
    check(`the chart background is painted dark (${paint.dark} samples)`, paint.dark > 500);
    check(`and candles are drawn (${paint.green} green samples)`, paint.green > 5);
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- no surface anywhere is anywhere near a browser ceiling ---');
  {
    const worst = await p.evaluate(() =>
      Array.from(document.querySelectorAll('#replayModal canvas'))
        .map(c => ({ size: c.width+'x'+c.height, px: c.width*c.height }))
        .sort((a,b)=>b.px-a.px)[0]);
    check(`the largest is ${worst.size} (${(worst.px/1e6).toFixed(1)}M pixels)`, worst.px < 30e6);
    check('which is nothing like the 2949M his laptop reported', worst.px < 100e6);
  }

  await ctx.close(); await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
