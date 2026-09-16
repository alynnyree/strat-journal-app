// The picture has to be of his CHART, not of whatever is on his screen.
//
// His own words, 2026-09-15: "I start out on Charles Schwab website to
// execute the trade and then switch my screen to Tradingview."
//
// So at the instant a picture is due -- up to a minute after his fill --
// Schwab is what is on screen. Before Sunday that filed his ORDER TICKET as
// his chart at entry, stamped with the trade's own time and looking
// entirely real. After Sunday it refused and he lost the entry picture.
// Both are wrong, and the second is only less wrong.
//
// The recording follows the TradingView TAB, not his screen, so it is
// watching the chart the whole time he is on Schwab. The picture comes from
// there now.
const path = require('path');
const C = require(path.join(__dirname, '..', 'browser-extension', 'recorder-core.js'));

let pass = 0, fail = 0;
const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };
const T = 1757000000000;

const stills = (fromMs, toMs, every) => {
  const out = [];
  for(let at = fromMs; at <= toMs; at += (every || C.FRAME_EVERY_MS)){
    out.push({ at, dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(60000), bytes: 60000 });
  }
  return out;
};

console.log('--- finding the chart as it was at that moment ---');
{
  const held = stills(T - 3*60*1000, T + 60*1000);
  // The fill. The check that asks for it lands up to a minute later, but the
  // moment asked about is the FILL, which is the whole point.
  const got = C.frameNearest(held, T);
  check('there is a picture of the chart at his entry', !!got.frame);
  check('...and it is from within a couple of seconds of the fill', got.drift <= C.FRAME_EVERY_MS);
  check('...with no invented reason attached', got.reason === null);
}
{
  // A minute after the fill is when the check actually lands. The picture
  // it returns must still be of the FILL, not of a minute later.
  const held = stills(T - 3*60*1000, T + 60*1000);
  const atFill = C.frameNearest(held, T);
  const aMinuteLater = C.frameNearest(held, T + 60*1000);
  check('asking for the fill and asking for a minute later give DIFFERENT pictures',
    atFill.frame.at !== aMinuteLater.frame.at);
  check('...which is the point: the picture is of the moment, not of the check',
    Math.abs(atFill.frame.at - T) < 3000);
}

console.log('\n--- and it refuses rather than passing off the wrong moment ---');
{
  const none = C.frameNearest([], T);
  check('nothing recorded is refused', none.frame === null);
  check('...and says nothing was being recorded', /Nothing was being recorded/i.test(none.reason));
}
{
  // Recording started after the trade. There ARE stills, just not from then.
  const late = stills(T + 5*60*1000, T + 8*60*1000);
  const got = C.frameNearest(late, T);
  check('a recording that holds nothing from that moment is refused', got.frame === null);
  check('...and says how far off the closest one is', /seconds away/i.test(got.reason));
  check('...which is a DIFFERENT reason from nothing being recorded',
    got.reason !== C.frameNearest([], T).reason);
  // A picture five minutes from his entry is not his entry. Handing it over
  // is the wrong-picture fault this project already has on its record.
  check('...and the refusal is the point, not a shortfall', got.drift > C.FRAME_MAX_DRIFT_MS);
}
{
  // Just inside the tolerance: a real picture of that moment, still sent.
  const held = stills(T - 3*60*1000, T - 15*1000);
  const got = C.frameNearest(held, T);
  check('fifteen seconds off is still his chart at that moment', !!got.frame);
  check('...and says how far off it was rather than hiding it', got.drift >= 15000 && got.drift < 20000);
}

console.log('\n--- what it costs to hold them ---');
{
  const now = T;
  // A whole session's worth, far more than is kept.
  const held = stills(now - 25*60*1000, now);
  const kept = C.pruneFrames(held, now);
  const keptMb = kept.reduce((n,f)=>n+f.bytes,0) / 1024 / 1024;
  const allMb = held.reduce((n,f)=>n+f.bytes,0) / 1024 / 1024;
  console.log(`  (25 minutes of stills would be ${allMb.toFixed(0)}MB; ${keptMb.toFixed(1)}MB is kept)`);
  check('only the last four minutes are held', kept.every(f => f.at > now - C.FRAME_HOLD_MS));
  check(`and that is a fraction of the whole session (${keptMb.toFixed(1)}MB of ${allMb.toFixed(0)}MB)`,
    keptMb < allMb / 4);
  check('four minutes covers the minute it waits and the three it gives up at',
    C.FRAME_HOLD_MS > 3 * 60 * 1000);

  // A ceiling on WHAT accumulates, not only on how long. A bigger screen
  // makes each still heavier and a count alone would never notice.
  const fat = stills(now - 4*60*1000, now).map(f => ({ ...f, bytes: 400000 }));
  const capped = C.pruneFrames(fat, now);
  const cappedMb = capped.reduce((n,f)=>n+f.bytes,0) / 1024 / 1024;
  console.log(`  (on a much larger screen: ${cappedMb.toFixed(1)}MB after the ceiling)`);
  check(`a heavier screen is capped by weight, not just by age (${cappedMb.toFixed(1)}MB)`,
    cappedMb <= C.FRAME_MAX_BYTES / 1024 / 1024 + 0.5);
  check('...and it still holds the most recent ones, not the oldest',
    capped[capped.length - 1].at === fat[fat.length - 1].at);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
