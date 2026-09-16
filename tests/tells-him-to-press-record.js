// He cannot be made to stop forgetting, so he is told instead.
//
// His words, 2026-09-16: "The point is to make this as automatic as
// possible so i don't forget to take videos and or pictures of my trades."
//
// Chrome will not let anything start recording without a press from him, so
// the press cannot be removed. What is removed here is having to REMEMBER
// it, which is the part that actually costs him a trade's video.
//
// The hard part is not showing a box. It is showing it few enough times
// that he still reads it. A reminder he swipes away without looking is
// worse than none, because it feels handled.
const path = require('path');
const C = require(path.join(__dirname, '..', 'browser-extension', 'recorder-core.js'));
const manifest = require(path.join(__dirname, '..', 'browser-extension', 'manifest.json'));

let pass = 0, fail = 0;
const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

// A fixed New York clock, so this does not pass or fail depending on where
// the machine running it happens to be.
const ny = (day, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  // 2026-09-14 is a Monday; the offset walks to the day wanted.
  const base = Date.UTC(2026, 8, 14 + day, h + 4, m); // New York is UTC-4 in September
  return base;
};
const MON = 0, TUE = 1, SAT = 5, SUN = 6;

console.log('--- when he is at his desk ---');
check('nine in the morning, before the bell: yes', C.isTradingTime(ny(MON, '09:00')) === true);
check('half past nine, the open: yes', C.isTradingTime(ny(MON, '09:30')) === true);
check('midday: yes', C.isTradingTime(ny(TUE, '12:00')) === true);
check('one minute before the close: yes', C.isTradingTime(ny(TUE, '15:59')) === true);
check('the close itself: no', C.isTradingTime(ny(TUE, '16:00')) === false);
check('eight in the morning, too early: no', C.isTradingTime(ny(MON, '08:00')) === false);
check('eight in the evening: no', C.isTradingTime(ny(MON, '20:00')) === false);
check('the middle of the night: no', C.isTradingTime(ny(TUE, '03:00')) === false);
check('Saturday midday: no', C.isTradingTime(ny(SAT, '12:00')) === false);
check('Sunday midday: no', C.isTradingTime(ny(SUN, '12:00')) === false);
// It reminds him BEFORE the bell on purpose: a recording has to already be
// running to catch an entry, so a reminder at 09:30 is already late.
check('it starts half an hour before the open, not at it', C.NUDGE_FROM_MINUTE === 9 * 60);

console.log('\n--- when it says nothing at all ---');
const at = (o) => C.nudgeToShow(Object.assign({ recording:false, tradeOpened:false, now: ny(MON,'10:00'), lastQuietAt:0, lastUrgentAt:0 }, o));
check('recording already on: silent', at({ recording:true }) === null);
check('recording on AND a trade opens: still silent', at({ recording:true, tradeOpened:true }) === null);
check('outside trading hours: silent', at({ now: ny(MON,'22:00') }) === null);
check('a weekend: silent', at({ now: ny(SAT,'12:00') }) === null);

console.log('\n--- the quiet one, at most once a day ---');
{
  const first = at({});
  check('it speaks when recording is off during the day', !!first);
  check('...quietly', first.kind === 'quiet');
  check('...and tells him exactly what to press', /Start recording/.test(first.message));
  check('...and says one press covers the day, so he does not expect to repeat it',
    /covers every trade today/i.test(first.message));

  const again = at({ lastQuietAt: ny(MON,'09:05') });
  check('it does not say it again an hour later', again === null);
  const tomorrow = at({ now: ny(TUE,'10:00'), lastQuietAt: ny(MON,'09:05') });
  check('but it does say it again the next day', !!tomorrow && tomorrow.kind === 'quiet');
}

console.log('\n--- the urgent one: a real trade is going unrecorded ---');
{
  const urgent = at({ tradeOpened:true });
  check('a trade opening unrecorded is said louder', urgent && urgent.kind === 'urgent');
  check('...and says a trade JUST OPENED, not something vague', /trade just opened/i.test(urgent.title));
  // Honest about what he can still save. The entry is already gone by the
  // time this fires; saying otherwise would be a promise it cannot keep.
  check('...and promises only the exit, which is all that is left',
    /still catch the exit/i.test(urgent.message));

  const stillQuietToday = at({ tradeOpened:true, lastQuietAt: ny(MON,'09:05') });
  check('THE URGENT ONE IS NOT SILENCED BY THE QUIET ONE having gone already',
    !!stillQuietToday && stillQuietToday.kind === 'urgent');
}

console.log('\n--- and it must not become wallpaper ---');
{
  // The real risk. He takes a run of trades; without a limit that is a box
  // per trade, and a box he swipes away unread is worse than no box, because
  // it feels handled.
  const five = at({ tradeOpened:true, lastUrgentAt: ny(MON,'09:58') });
  check('a second trade two minutes later says nothing', five === null);
  const later = at({ now: ny(MON,'10:25'), tradeOpened:true, lastUrgentAt: ny(MON,'09:58') });
  check('but after twenty minutes it speaks again', !!later && later.kind === 'urgent');

  // Counted over a realistic morning rather than reasoned about.
  let shown = 0, lastQ = 0, lastU = 0;
  for (let min = 9 * 60; min < 16 * 60; min++) {
    const now = ny(MON, String(Math.floor(min/60)).padStart(2,'0') + ':' + String(min%60).padStart(2,'0'));
    // A trade every fifteen minutes, all day, none of them recorded.
    const say = C.nudgeToShow({ recording:false, tradeOpened: (min % 15 === 0), now, lastQuietAt:lastQ, lastUrgentAt:lastU });
    if (!say) continue;
    shown++;
    if (say.kind === 'urgent') lastU = now; else lastQ = now;
  }
  console.log(`  (a whole day, a trade every fifteen minutes, none recorded: ${shown} boxes)`);
  check(`a whole unrecorded day is bounded, not one per trade (${shown} boxes for 29 trades)`,
    shown <= 16 && shown >= 2);
  check('...and that is far fewer than one per trade', shown < 29 / 1.8);
}

console.log('\n--- what the add-on asks Chrome for ---');
check('it asks to show him notifications', manifest.permissions.includes('notifications'));
check(`the version is past the one he is running (${manifest.version} > 1.3)`,
  manifest.version.localeCompare('1.3', undefined, { numeric: true }) > 0);
check('it still asks for nothing beyond TradingView',
  manifest.host_permissions.length === 1 && /tradingview/.test(manifest.host_permissions[0]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
