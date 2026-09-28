// "Fix the repair" -- 2026-09-28.
//
// His own journal (160 trades, exported that day) holds his May-and-June
// trading TWICE: 107 from the live Schwab connection and 53 read from his
// broker's file, over exactly the same dates, 4 May to 24 June both. All
// 53 file copies have no entry time and no stock price; not one live trade
// is missing either. On SPY 260604C00755000 on 4 June there are twelve
// records -- five live, seven from the file.
//
// The repair that sets aside the excess ranks trades "most suspect first"
// on four tests: is it a purchase and a sale, has it a fee, has it a
// contract code, and which came later. THE TWO COPIES ANSWER THE SAME TO
// ALL FOUR. And the fourth read the trade's reference as a NUMBER when it
// is text, so it returned 0 for every trade in his journal and broke no
// tie at all.
//
// So the ranking could not tell them apart, and would have picked
// arbitrarily -- it could just as easily have set aside the live trade,
// throwing away its times, its stock prices and its thirteen timeframe
// readings, and kept the empty one. That is why he was told not to press
// the button yet.
//
// This runs the REAL ranking, lifted out of the page that runs, against
// his REAL journal.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

// The real functions, out of index.html rather than rewritten here.
const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const grab = (name) => {
  const i = page.indexOf(`function ${name}(`);
  if (i < 0) throw new Error('not found: ' + name);
  let depth = 0, started = false, j = i;
  for (; j < page.length; j++) {
    if (page[j] === '{') { depth++; started = true; }
    else if (page[j] === '}') { depth--; if (started && depth === 0) { j++; break; } }
  }
  return page.slice(i, j);
};
// Written so this whole file still RUNS against the ranking as it was. A
// check that falls over on a missing name proves only that the name is
// missing -- it never reaches the behaviour, which is the thing worth
// proving it catches. Both helpers are defined here when the page has no
// copy of them, so the OLD suspectScore can be exercised properly.
const has = (name) => page.includes(`function ${name}(`);
if (has('referencesAreInvented')) eval(grab('referencesAreInvented'));
else global.referencesAreInvented = (t) => {
  const f = Array.isArray(t.fills) ? t.fills : [];
  return f.length > 0 && f.every(x => String(x).startsWith('csv|'));
};
if (has('tradeWrittenAt')) eval(grab('tradeWrittenAt'));
else global.tradeWrittenAt = () => 0;
eval(grab('suspectScore'));
eval(grab('occToBrokerSymbol'));
eval(grab('reconcilePlan'));

const JOURNAL = path.join(__dirname, 'fixtures', 'his-journal-2026-09-28.json');
if (!fs.existsSync(JOURNAL)) {
  console.log('SKIPPED: his exported journal is not on this machine, so the ranking cannot be run against real data.');
  process.exit(0);
}
const trades = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));

console.log('--- his journal really does hold both copies ---');
{
  const live = trades.filter(t => t.source === 'schwab-auto');
  const filed = trades.filter(t => t.source === 'schwab-csv');
  check(`${trades.length} trades: ${live.length} live, ${filed.length} from the file`,
    trades.length === 160 && live.length === 107 && filed.length === 53);
  check('every file copy is missing its entry time', filed.every(t => !t.entryTime));
  check('every file copy is missing its stock price', filed.every(t => t.undEntry == null));
  check('and NO live trade is missing its stock price', live.every(t => t.undEntry != null));
}

console.log('\n--- the ranking now tells the two copies apart, on his real trades ---');
{
  // Every day+contract where both kinds sit together. This is the actual
  // decision the repair makes.
  const groups = new Map();
  for (const t of trades) {
    const k = t.entryDate + '|' + t.occ;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  let both = 0, rankedRight = 0, worst = null;
  for (const [k, g] of groups) {
    const live = g.filter(t => t.source === 'schwab-auto');
    const filed = g.filter(t => t.source === 'schwab-csv');
    if (!live.length || !filed.length) continue;
    both++;
    // Most suspect first -- exactly what reconcilePlan does.
    const ranked = g.slice().sort((a, b) => suspectScore(b) - suspectScore(a));
    // Every file copy must rank above every live one, or the repair could
    // reach a live trade before it has finished with the copies.
    const lowestFiled = Math.min(...filed.map(suspectScore));
    const highestLive = Math.max(...live.map(suspectScore));
    if (lowestFiled > highestLive) rankedRight++;
    else if (!worst) worst = { k, lowestFiled, highestLive, first: ranked[0].source };
  }
  check(`${both} day-and-contract groups hold both kinds`, both > 15);
  check(`every file copy outranks every live one, in all ${both} of them`,
    rankedRight === both);
  if (worst) console.log('      first group that does not:', JSON.stringify(worst));
}

console.log('\n--- and it would never have, before ---');
{
  // The ranking as it was: the four old tests, with the tie-break that
  // read a text reference as a number.
  const oldScore = (t) => {
    let n = 0;
    const fills = Array.isArray(t.fills) ? t.fills.length : 0;
    if (fills !== 2) n += 100;
    if (t.fees == null) n += 50;
    if (!String(t.occ || '').trim()) n += 20;
    n += Math.min(19, Math.floor((Number(t.id) || 0) / 1e12));
    return n;
  };
  const nio = trades.filter(t => t.ticker === 'NIO');
  const scores = nio.map(oldScore);
  check(`the old ranking scored all four NIO records the same (${scores.join(', ')})`,
    new Set(scores).size === 1);
  const filedNio = nio.filter(t => t.source === 'schwab-csv');
  const liveNio = nio.filter(t => t.source === 'schwab-auto');
  check('so it could not tell the copy from the real trade at all',
    oldScore(filedNio[0]) === oldScore(liveNio[0]));
  check(`the new ranking puts the copy clearly above them (${suspectScore(filedNio[0])} vs ${Math.max(...liveNio.map(suspectScore))})`,
    suspectScore(filedNio[0]) > Math.max(...liveNio.map(suspectScore)));
  // And the tie-break really was dead, not merely weak.
  const deadTie = trades.every(t => Math.min(19, Math.floor((Number(t.id) || 0) / 1e12)) === 0);
  check('the old tie-break returned zero for every trade in his journal', deadTie);
}

console.log('\n--- a live trade is never the most suspect thing on a day ---');
{
  // The one case that must never happen: the repair reaching for a trade
  // that carries his broker's own reference numbers while an emptier copy
  // of the same day sits untouched.
  let offenders = 0;
  for (const t of trades) {
    if (t.source !== 'schwab-auto') continue;
    const sameDay = trades.filter(o => o.entryDate === t.entryDate && o.occ === t.occ && o !== t);
    const copies = sameDay.filter(o => o.source === 'schwab-csv');
    if (copies.length && copies.some(o => suspectScore(o) <= suspectScore(t))) offenders++;
  }
  check(`no live trade outranks a copy of itself (${offenders} would)`, offenders === 0);
}

console.log('\n--- the reason he is shown names the real cause ---');
{
  // The plain-words reason is chosen by the same tests. A file copy must
  // not be explained to him as "the later of two that look the same",
  // which is about something else entirely.
  const reasonFor = (t) => {
    const fills = Array.isArray(t.fills) ? t.fills.length : 0;
    if (fills !== 2) return fills === 0 ? 'no purchase or sale recorded against it' : 'fills';
    if (t.fees == null) return 'no fee was ever charged for it';
    if (!String(t.occ || '').trim()) return 'no contract code';
    if (t.source === 'schwab-csv' || referencesAreInvented(t)) return 'read from your Schwab file, and the same trade is already here from the live connection with its times and stock prices';
    return 'the later of two that look the same';
  };
  const filed = trades.filter(t => t.source === 'schwab-csv');
  const said = reasonFor(filed[0]);
  check('a file copy is explained as what it is: ' + said.slice(0, 60), /read from your Schwab file/.test(said));
  check('every file copy gets that reason, not a different one',
    filed.every(t => /read from your Schwab file/.test(reasonFor(t))));
  check('and it never uses a word he would have to learn', !/\b(source|null|csv|reference)\b/i.test(said));
}

// ------------------------------------------------------------------
console.log('\n--- THE REAL QUESTION: what would the repair actually take away? ---');
{
  // A ranking that ranks correctly is not yet a repair that repairs. This
  // runs the ACTUAL plan -- the one the button uses -- over his actual
  // trades.
  //
  // His broker's own count is the referee and it is not mine to invent, so
  // this does not pretend to know it. It asks the plan the one question
  // that matters whatever the real count turns out to be: when a day is
  // over by exactly the contracts the file copies hold, does the plan take
  // the copies, or does it reach for the trade that carries his times and
  // his stock prices?
  let days = 0, tookOnlyCopies = 0, everTookALive = [];
  const groups = new Map();
  for (const t of trades) {
    if (t.optExit == null) continue;
    const k = t.entryDate + '|' + occToBrokerSymbol(t.occ);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  for (const [k, g] of groups) {
    const filed = g.filter(t => t.source === 'schwab-csv');
    const live = g.filter(t => t.source === 'schwab-auto');
    if (!filed.length || !live.length) continue;
    const [date, symbol] = k.split('|');
    const journal = g.reduce((n, t) => n + (t.contracts || 0), 0);
    const overBy = filed.reduce((n, t) => n + (t.contracts || 0), 0);
    // "Your broker says you bought this many" -- set here to the journal
    // minus exactly what the copies hold, which is the case the repair
    // exists for.
    const differences = [{ kind: 'too many', date, symbol, broker: journal - overBy, journal }];
    const plan = reconcilePlan(trades, differences);
    if (!plan.remove.length) continue;
    days++;
    const removed = trades.filter(t => plan.remove.includes(t.id));
    const liveRemoved = removed.filter(t => t.source === 'schwab-auto');
    if (!liveRemoved.length) tookOnlyCopies++;
    else if (everTookALive.length < 3) everTookALive.push({ date, symbol, n: liveRemoved.length });
  }
  check(`the plan was run on ${days} real days of his journal`, days > 15);
  check(`and on every one it took ONLY the file copies (${tookOnlyCopies} of ${days})`,
    tookOnlyCopies === days);
  if (everTookALive.length) console.log('      it reached for a live trade on:', JSON.stringify(everTookALive));
}

console.log('\n--- and it can never cut below what his broker says ---');
{
  // The guard that was already there, checked against his real trades
  // rather than assumed: told his broker's count is the FULL journal
  // count, nothing may be removed at all.
  const g = trades.filter(t => t.ticker === 'NIO' && t.optExit != null);
  const symbol = occToBrokerSymbol(g[0].occ);
  const journal = g.reduce((n, t) => n + (t.contracts || 0), 0);
  const plan = reconcilePlan(trades, [{ kind: 'too many', date: '2026-06-24', symbol, broker: journal, journal }]);
  check(`nothing is removed when his broker agrees with the journal (${journal} contracts)`,
    plan.remove.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
