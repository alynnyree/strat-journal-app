// "Journal still doesn't match after clicking put this right a few times."
// -- 2026-09-28, with his journal exported straight afterwards.
//
// It was byte-for-byte identical. 160 trades, 219 contracts, $290.02 of
// fees, -$1,172.02 after fees, before and after several taps. Not one
// trade moved, and he was shown no reason he noticed.
//
// Reached by ELIMINATION rather than by guessing at it. The card offering
// the repair is only drawn when the plan holds something, so the plan was
// not empty. The journal did not change between the card being drawn and
// him tapping, so every trade the plan named was still there. That leaves
// exactly one way out of applyReconcilePlan: the COPY it keeps could not
// be written, so nothing was removed -- the safety net was the thing
// stopping the fix.
//
// This runs the REAL repair, out of the page that runs, against a stand-in
// for the phone's storage that refuses writes past a size, the way Safari
// does.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const grab = (name) => {
  const i = page.indexOf(`function ${name}(`);
  if (i < 0) throw new Error('not found: ' + name);
  let d = 0, started = false, j = i;
  for (; j < page.length; j++) {
    if (page[j] === '{') { d++; started = true; }
    else if (page[j] === '}') { d--; if (started && d === 0) { j++; break; } }
  }
  return page.slice(i, j);
};

// The phone's storage, with a wall in it.
let LIMIT = 5 * 1024 * 1024;
let store = new Map();
global.RECONCILE_ASIDE_KEY = 'strat_set_aside_extras';
global.lastProblems = {};
global.localStorage = {
  getItem: k => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => {
    let total = 0;
    for (const [kk, vv] of store) if (kk !== k) total += kk.length + vv.length;
    total += String(k).length + String(v).length;
    if (total > LIMIT) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
    store.set(k, String(v));
  },
  removeItem: k => store.delete(k),
  get length(){ return store.size; },
  key: i => [...store.keys()][i],
};
for (const n of ['loadTrades', 'saveTrades', 'noteProblem', 'applyReconcilePlan']) eval(grab(n));

// A journal with one real trade and one duplicate of it, plus chart bars
// on both so the copy has something worth not keeping.
const bars = { candles: Array.from({ length: 1200 }, (_, i) => ({ t: i, o: 1, h: 2, l: 0, c: 1 })) };
const trade = (id, source) => ({
  id, source, occ: 'SPY   260612C00746000', entryDate: '2026-06-11',
  contracts: 1, optEntry: 0.61, optExit: 0.9, fees: 1.32, pnlDollar: 29, pnlNet: 27.68,
  replayData: JSON.parse(JSON.stringify(bars)),
});
const plan = { remove: ['copy'], contracts: 1, days: [] };
const reset = (asideRaw) => {
  store = new Map();
  global.lastProblems = {};
  localStorage.setItem('strat_trades', JSON.stringify([trade('real', 'schwab-auto'), trade('copy', 'schwab-csv')]));
  if (asideRaw !== undefined) store.set(RECONCILE_ASIDE_KEY, asideRaw);
};

console.log('\n--- the ordinary case still works ---');
LIMIT = 5 * 1024 * 1024; reset();
let res = applyReconcilePlan(plan);
check('it removes the duplicate', res.ok === true && res.removed === 1);
check('the real trade stays', loadTrades().length === 1 && loadTrades()[0].id === 'real');
check('the duplicate is kept and can be put back',
  JSON.parse(localStorage.getItem(RECONCILE_ASIDE_KEY)).length === 1);

console.log('\n--- the copy it keeps carries no chart bars ---');
const kept = JSON.parse(localStorage.getItem(RECONCILE_ASIDE_KEY))[0];
check('no chart bars on the set-aside copy', kept.replayData === undefined);
check('everything else about it survives',
  kept.id === 'copy' && kept.fees === 1.32 && kept.pnlNet === 27.68 && kept.occ === 'SPY   260612C00746000');
const withBars = JSON.stringify([trade('copy', 'schwab-csv')]).length;
const without = localStorage.getItem(RECONCILE_ASIDE_KEY).length;
check(`and it is far smaller for it (${Math.round(withBars/1024)}k -> ${Math.round(without/1024)}k)`, without * 5 < withBars);

console.log('\n--- AN UNREADABLE OLD LIST NO LONGER REFUSES THE WHOLE THING ---');
reset('{not json at all');
res = applyReconcilePlan(plan);
check('the duplicate is still removed', res.ok === true && res.removed === 1);
check('the journal really changed', loadTrades().length === 1);
check('and it says the old list was started again', res.restarted === true);
check('the record behind Details says so too', /started again/i.test(lastProblems.reconcile.text));

console.log('\n--- a list holding the wrong sort of thing, same answer ---');
reset('"a string, not a list"');
res = applyReconcilePlan(plan);
check('still removed', res.ok === true && loadTrades().length === 1);

console.log('\n--- WHAT HE ACTUALLY HIT: no room to keep the copy ---');
LIMIT = 5 * 1024 * 1024; reset();
// Fill the phone so only a little is left.
const filler = 'x'.repeat(LIMIT - localStorage.getItem('strat_trades').length - 'other'.length - 20);
store.set('other', filler);
res = applyReconcilePlan(plan);
check('it refuses rather than removing', res.ok === false);
check('the journal is untouched, all trades still there', loadTrades().length === 2);
check('it says room is the reason, in words he can act on',
  /no room left on this phone/i.test(res.reason) && /none were removed/i.test(res.reason));
check('it never uses a word he would have to learn',
  !/\b(storage|quota|localStorage|MB|cache|API)\b/i.test(res.reason));

console.log('\n--- EVERY REFUSAL LEAVES A TRACE, which none did before ---');
check('the refusal was recorded for the Details tap', /Could not put it right/.test(lastProblems.reconcile.text));
global.lastProblems = {};
res = applyReconcilePlan({ remove: [], contracts: 0, days: [] });
check('an empty plan is recorded too', res.ok === false && /Could not put it right/.test(lastProblems.reconcile.text));
global.lastProblems = {};
reset();
res = applyReconcilePlan({ remove: ['gone'], contracts: 1, days: [] });
check('a plan naming trades that have gone is recorded too',
  res.ok === false && /no longer in your journal/i.test(lastProblems.reconcile.text));

console.log('\n--- and the old code would have failed these ---');
const oldShape = page.includes("return { ok:false, reason:'There was no room to set those trades aside, so none were removed.' }");
check('the old all-or-nothing refusal is gone from the page', !oldShape);
check('the page keeps the older set-aside trades rather than dropping them to make room',
  !/already\s*=\s*\[\]\s*;\s*\/\/\s*make room/i.test(page));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
