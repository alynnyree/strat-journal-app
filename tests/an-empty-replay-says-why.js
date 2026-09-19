// He has been looking at a blank white replay chart since 9 September, and
// neither of us could tell which of three things it was: the bars never
// arrived, they arrived unreadable, or they arrived and failed to draw.
//
// Reproducing it in the real app answered half of that immediately -- with
// good bars it renders correctly, dark background and green candles, so the
// month-long hold is NOT the cause -- and found a worse bug on the way.
//
// A CANDLE WITH NO USABLE TIME FROZE THE WHOLE APP. Math.floor(undefined/1000)
// is NaN; the first such candle was stored as NaN, the second found NaN
// taken, and `t++` on NaN is NaN -- so the de-dupe loop spun for ever.
// Proven: ten million turns, no escape. My own reproduction hit it and hung.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  const bars = (n, field) => {
    const out = [];
    let t = Date.UTC(2026, 5, 24, 13, 30), price = 4.80;
    for(let i = 0; i < n; i++){
      const c = { open:+price.toFixed(2), high:+(price+0.02).toFixed(2),
                  low:+(price-0.02).toFixed(2), close:+(price+0.01).toFixed(2), volume:2300 };
      if(field === 'datetime') c.datetime = t;
      else if(field === 'seconds') c.time = Math.floor(t/1000);
      else if(field === 'none') { /* deliberately timeless */ }
      out.push(c); t += 60000; price += 0.01;
    }
    return out;
  };
  const trade = (candles) => ({
    id:'nio1', ticker:'NIO', dir:'Short', entryDate:'2026-06-24', entryTime:'09:31',
    exitDate:'2026-07-23', exitTime:'15:55', optEntry:0.49, optExit:0.53, contracts:1,
    occ:'NIO   260723P00004000', fills:['a','b'], fees:3.99, pnlDollar:12, pnlNet:8.01,
    winLoss:'Win', source:'schwab-auto', settled:true,
    replayData: { candles, entryIndex:1, exitIndex: Math.max(1, candles.length-2) },
  });

  const ctx = await b.newContext({ viewport:{width:900,height:700} });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
    : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto(site.base + '/index.html');
  await p.evaluate(() => localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})));
  await p.reload(); await p.waitForTimeout(500);

  const open = async (candles) => {
    await p.evaluate((t) => {
      localStorage.setItem('strat_trades', JSON.stringify([t]));
      const el = document.getElementById('replayWhyEmpty');
      if(el){ el.style.display = 'none'; el.textContent = ''; }
      openReplay(t);
    }, trade(candles));
    await p.waitForTimeout(1400);   // the paint verdict arrives after a deliberate wait
    return await p.evaluate(() => {
      const el = document.getElementById('replayWhyEmpty');
      return { why: el && el.style.display !== 'none' ? el.textContent : null,
               format: lastChartFormat };
    });
  };
  const close = () => p.evaluate(() => closeReplay());

  // ------------------------------------------------------------------
  console.log('--- TIMELESS BARS: this used to freeze the whole app ---');
  {
    // If the old loop were still here this would never return and the test
    // would hang -- which is exactly what happened to my first reproduction.
    const r = await Promise.race([
      open(bars(40, 'none')),
      new Promise(res => setTimeout(() => res({ why:'HUNG', format:null }), 8000)),
    ]);
    check('it does not hang', r.why !== 'HUNG');
    check(`all of them are refused (${r.format && r.format.used} used of ${r.format && r.format.got})`,
      !!r.format && r.format.got === 40 && r.format.used === 0 && r.format.noTime === 40);
    check('and the screen says so rather than going white: ' + (r.why || '').slice(0, 70),
      !!r.why && /none of them carried a time/.test(r.why));
    check('naming what they arrived with', !!r.why && /"neither"/.test(r.why));
    check('and asking him to send it to me', !!r.why && /without guessing/.test(r.why));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- GOOD BARS: it renders, and says nothing at all ---');
  {
    const r = await open(bars(120, 'datetime'));
    check(`every bar is used (${r.format.used} of ${r.format.got})`, r.format.used === 120 && r.format.noTime === 0);
    check('the box stays hidden — a working chart says nothing', r.why === null);

    // And it really is painting, not just claiming to.
    const painted = await p.evaluate(() => {
      const cs = Array.from(document.querySelectorAll('#replayModal canvas'))
        .sort((a,b) => (b.width*b.height)-(a.width*a.height));
      const big = cs[0];
      if(!big) return null;
      const c2 = document.createElement('canvas');
      c2.width = big.width; c2.height = big.height;
      c2.getContext('2d').drawImage(big, 0, 0);
      const d = c2.getContext('2d').getImageData(0,0,big.width,big.height).data;
      let dark = 0, green = 0;
      for(let i = 0; i < d.length; i += 4*37){
        if(d[i]<20 && d[i+1]<20 && d[i+2]<25) dark++;
        if(d[i+1] > 100 && d[i+1] > d[i]+40) green++;
      }
      return { dark, green };
    });
    check(`the background really is dark, not white (${painted && painted.dark} samples)`,
      !!painted && painted.dark > 50);
    check(`and candles really are drawn (${painted && painted.green} green samples)`,
      !!painted && painted.green > 5);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- SECONDS instead of milliseconds are read, not misread ---');
  {
    // Reading the wrong field silently would put every bar in 1970. Worse
    // than refusing them, because it looks like it worked.
    const r = await open(bars(60, 'seconds'));
    check(`they are used (${r.format.used} of ${r.format.got})`, r.format.used === 60);
    check('and land in 2026, not 1970: ' + r.format.first, /^2026-06-24/.test(r.format.first || ''));
    check('the box stays hidden', r.why === null);
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- SOME bars timeless: it shows the rest and says how many went ---');
  {
    const mixed = bars(50, 'datetime').concat(bars(10, 'none'));
    const r = await open(mixed);
    check(`the good ones are shown (${r.format.used})`, r.format.used === 50);
    check(`and the bad ones counted (${r.format.noTime})`, r.format.noTime === 10);
    check('with both numbers on screen: ' + (r.why || '').slice(0, 60),
      !!r.why && /10 of 60 bars had no usable time/.test(r.why));
    check('nothing threw', errors.length === 0);
    await close();
  }

  // ------------------------------------------------------------------
  console.log('\n--- HIS CASE: good bars, right version, and NOTHING drawn ---');
  {
    // Every check I added came back clean on his machine and the chart was
    // still white. So the box now asks the only honest question -- did
    // pixels reach the screen -- and this proves it can answer it even when
    // the data is perfect. The chart is blanked deliberately here.
    await open(bars(200, 'datetime'));
    const r = await p.evaluate(() => {
      // Wipe what was drawn, exactly as a broken drawing library would.
      document.querySelectorAll('#replayModal canvas').forEach(c => {
        const g = c.getContext('2d');
        if(g){ g.clearRect(0,0,c.width,c.height); g.fillStyle='#ffffff'; g.fillRect(0,0,c.width,c.height); }
      });
      reportReplayState();
      return null;
    });
    await p.waitForTimeout(1200);   // the paint verdict is deliberately late
    const r2 = await p.evaluate(() => {
      const el = document.getElementById('replayWhyEmpty');
      return el && el.style.display !== 'none' ? el.textContent : null;
    });
    check('it notices nothing was drawn: ' + (r2 || '').slice(0, 60),
      !!r2 && /NOTHING was drawn/.test(r2));
    check('and says the chart is showing as white',
      !!r2 && /showing as white/.test(r2));
    check('and names the drawing code version, which is what I need',
      !!r2 && /Drawing code on this device: 4\./.test(r2));
    check('and how many bars it had', !!r2 && /Bars: 200 of 200/.test(r2));
    check('nothing threw', errors.length === 0);
    await close();
  }

  console.log('\n--- a chart that IS drawing still says nothing ---');
  {
    // A FRESH PAGE. The case above deliberately wiped the shared chart's
    // drawing surface, and reusing it here would test my vandalism rather
    // than the app -- a harness carrying state between cases has already
    // produced two false failures on this project.
    await p.reload(); await p.waitForTimeout(600);
    const r = await open(bars(200, 'datetime'));
    check('silent when it works: ' + (r.why || 'silent'), r.why === null);
    check('nothing threw', errors.length === 0);
    await close();
  }

  console.log('\n--- the drawing code cannot be served from an old copy ---');
  {
    const tagged = await p.evaluate(() => {
      const el = Array.from(document.querySelectorAll('script'))
        .find(s => (s.src || '').includes('lightweight-charts'));
      return el ? el.getAttribute('src') : null;
    });
    // A page refresh does not touch this file's own cache entry, so without
    // a version in the address a browser keeps an old copy for ever.
    check('its address carries a version: ' + tagged, !!tagged && /\?v=/.test(tagged));
  }

  await ctx.close(); await b.close(); await site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
