// "Only 1m, 5m, 15m timeframes are available. Every timeframe that I gave
// you in the beginning of this project needs to be available for
// playback." -- 2026-09-25.
//
// His thirteen are 6M, 3M, 1M, 1W, 1D, 4H, 2H, 1H, 30m, 15m, 5m, 3m, 1m.
// A trade carries roughly four hours of minute bars, so the eight up to
// 4H can be built from it and the five from 1D upwards cannot -- a day is
// longer than the whole recording. Raised with him rather than quietly
// dropped; he chose the eight.
//
// AND THE BARS HE ALREADY HAD WERE BUILT WRONG. Measured before anything
// was changed, by running the old code directly:
//
//   window starts 09:30 -> "5-minute bars" stamped 09:34 09:39 09:44
//   window starts 10:17 -> "5-minute bars" stamped 10:21 10:26 10:31
//
// Two faults. They were cut every 5 candles from wherever the recording
// began, so a window centred on a trade produced bars nobody else's chart
// has; and each was stamped with its LAST minute, so every bar was named
// one period late. This is the same fault the timeframe reading had on
// the server -- "grouping candles by position in the list is not a
// timeframe" is already on this project's record -- and it was never
// fixed here.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  // Minute bars starting at a given New York time, for a given count.
  // June, so New York is four hours behind UTC.
  const barsFrom = (etHour, etMin, n, dayOffset) => {
    const out = [];
    let t = Date.UTC(2026, 5, 24 + (dayOffset||0), etHour + 4, etMin);
    let p = 4.80;
    for(let i=0;i<n;i++){
      out.push({ open:+p.toFixed(2), high:+(p+0.02).toFixed(2), low:+(p-0.02).toFixed(2),
                 close:+(p+0.01).toFixed(2), volume:10, datetime:t });
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

  const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => r.request().url().startsWith(site.base) ? r.continue()
    : r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
  await p.goto(site.base + '/index.html');
  await p.evaluate(() => localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false})));
  await p.reload(); await p.waitForTimeout(500);

  // Reads the app's REAL bar builder and says what time each bar starts,
  // in New York, which is the only way to tell whether it sits on the clock.
  const stamps = (candles, group, howMany) => p.evaluate(({candles, group, howMany}) => {
    const bars = aggregateReplayCandles(candles, group);
    const f = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour12:false,
      hour:'2-digit', minute:'2-digit' });
    return { count: bars.length, at: bars.slice(0, howMany).map(x => f.format(new Date(x.datetime))) };
  }, {candles, group, howMany});

  // ------------------------------------------------------------------
  console.log('--- a 5-minute bar starts on a 5-minute mark, whenever the recording begins ---');
  {
    const onOpen = await stamps(barsFrom(9,30,40), 5, 4);
    check(`starting 09:30 -> ${onOpen.at.join('  ')}`,
      onOpen.at.join(',') === '09:30,09:35,09:40,09:45');

    // THE CASE THAT EXPOSED IT. A window centred on a trade starts at an
    // ordinary awkward minute, and the old code gave 10:21 10:26 10:31.
    const awkward = await stamps(barsFrom(10,17,40), 5, 4);
    check(`starting 10:17 -> ${awkward.at.join('  ')}`,
      awkward.at.join(',') === '10:15,10:20,10:25,10:30');
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- and every one of his eight does the same ---');
  {
    // WORKED OUT FROM FIRST PRINCIPLES, not copied off what the app said.
    // My first three of these were simply wrong -- written as though the
    // session began at 10:15 when the data below starts at 09:30 -- and
    // they reported working code as broken. Every bar starts at the
    // session open plus a whole number of periods, and that is all this
    // table is.
    const want = {
      3:   ['09:30','09:33','09:36','09:39'],
      15:  ['09:30','09:45','10:00','10:15'],
      30:  ['09:30','10:00','10:30','11:00'],
      60:  ['09:30','10:30','11:30','12:30'],
      120: ['09:30','11:30','13:30','15:30'],
      240: ['09:30','13:30'],
    };
    // A full session's worth so the bigger ones have something to make.
    const session = barsFrom(9,30,390);
    for(const g of [3,15,30,60,120,240]){
      const r = await stamps(session, g, want[g].length);
      check(`${g<60?g+'m':(g/60)+'H'} bars start ${r.at.join('  ')}`, r.at.join(',') === want[g].join(','));
    }
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- a bar may never run from one day into the next ---');
  {
    // His NIO position ran 24 June to 23 July, so a multi-day recording is
    // a real case. A 4-hour bar that opens Thursday afternoon and closes
    // Friday morning is the fault the server-side version had.
    const twoDays = barsFrom(13,0,180).concat(barsFrom(9,30,180,1));
    const r = await p.evaluate((c)=>{
      const bars = aggregateReplayCandles(c, 240);
      const f = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour12:false,
        month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
      return bars.map(x => f.format(new Date(x.datetime)));
    }, twoDays);
    const days = new Set(r.map(x => x.split(',')[0]));
    check(`each day gets its own bars (${r.join('  |  ')})`, days.size === 2);
    check('and the second day opens a fresh bar at 09:30, not mid-afternoon',
      r.some(x => /09:30/.test(x)));
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- all eight are offered, named the way he reads them ---');
  {
    await p.evaluate((t)=>{ localStorage.setItem('strat_trades', JSON.stringify([t])); openReplay(t); },
      trade(barsFrom(9,30,300)));
    await p.waitForTimeout(1400);
    const row = await p.evaluate(()=>{
      const r = document.getElementById('replayTfRow');
      return { text: (r.textContent||'').trim(), pills: [...r.querySelectorAll('.pill')].map(x=>x.textContent) };
    });
    check(`eight timeframes are on offer (${row.pills.join(' ')})`, row.pills.length === 8);
    check('and they are his: 1m 3m 5m 15m 30m 1H 2H 4H',
      row.pills.join(',') === '1m,3m,5m,15m,30m,1H,2H,4H');
    check('named 1H rather than 60m', /1H/.test(row.text) && !/60m/.test(row.text));
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- the entry and exit arrows land on the right bar on every one ---');
  {
    // Placed by the MOMENT he traded. The old code divided the minute
    // candle's POSITION by the group size, which only worked while bars
    // were cut every N in the list.
    for(const tf of [1,3,5,15,30,60,120,240]){
      await p.evaluate((t)=>setReplayTimeframe(t), tf);
      await p.waitForTimeout(250);
      const r = await p.evaluate(()=>{
        const raw = replayRaw.candles;
        const entryMs = raw[replayRaw.entryIndex].datetime;
        const exitMs = raw[replayRaw.exitIndex].datetime;
        const eb = replayAggregated[replayEntryIdx], xb = replayAggregated[replayExitIdx];
        const period = replayTf * 60000;
        return {
          entryOk: !!eb && entryMs >= eb.datetime && entryMs < eb.datetime + period,
          exitOk:  !!xb && exitMs  >= xb.datetime && exitMs  < xb.datetime + period,
          bars: replayAggregated.length,
        };
      });
      check(`${tf<60?tf+'m':(tf/60)+'H'}: both arrows sit on the bar that contains the moment (${r.bars} bars)`,
        r.entryOk && r.exitOk);
    }
    check('nothing threw', errors.length === 0);
  }

  console.log('\n--- a timeframe with only a handful of bars says so, and says it is not a fault ---');
  {
    // Four hours of recording cannot make many 4-hour bars. He must not
    // read that as something broken.
    await p.evaluate((t)=>{ localStorage.setItem('strat_trades', JSON.stringify([t])); closeReplay(); openReplay(t); },
      trade(barsFrom(10,0,240)));
    await p.waitForTimeout(1200);
    await p.evaluate(()=>setReplayTimeframe(240));
    await p.waitForTimeout(900);
    const said = await p.evaluate(()=>{
      const el = document.getElementById('replayWhyEmpty');
      return el && el.style.display !== 'none' ? el.textContent : null;
    });
    check('it says something: ' + (said ? said.slice(0,80) : 'nothing'), !!said);
    check('...naming how much price movement the trade actually has', !!said && /hours of price movement/.test(said));
    check('...and saying outright that it is not a fault', !!said && /not a fault/.test(said));

    // And the short timeframes stay silent, because nothing is wrong there.
    await p.evaluate(()=>setReplayTimeframe(1));
    await p.waitForTimeout(900);
    const quiet = await p.evaluate(()=>{
      const el = document.getElementById('replayWhyEmpty');
      return el && el.style.display !== 'none' ? el.textContent : null;
    });
    check('and on 1m it says nothing at all: ' + (quiet || 'silent'), quiet === null);
    check('nothing threw', errors.length === 0);
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
