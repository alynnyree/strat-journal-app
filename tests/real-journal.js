// Builds the journal exactly as his phone would hold it: his own 480 real
// broker fills, through the REAL pairing code, in the batches a live sync
// uses, shaped the way the app stores a trade.
const fs = require('fs');
const path = require('path');
// The REAL pairing code from the backend, when both are checked out side by
// side. Without it there is nothing to build a real journal from.
let processFills = null;
for(const guess of [process.env.BACKEND_DIR, '/workspace/strat-journal-backend',
                    path.join(__dirname, '..', '..', 'strat-journal-backend')]){
  if(!guess) continue;
  try { processFills = require(path.join(guess, 'matcher')).processFills; break; } catch(e){ /* try the next */ }
}

// His own broker export, when it is on this machine. It is private data and
// is not in the repository, so a run without it says so rather than quietly
// testing something else.
const UP = process.env.SCHWAB_EXPORT_DIR || '/root/.claude/uploads/4bc092e0-d5e0-5924-af5c-c049e9563cea';
const FULL = fs.existsSync(UP)
  ? (fs.readdirSync(UP).filter(f => /Schwab_2\.csv$/i.test(f)).map(f => path.join(UP, f))[0] || null)
  : null;
const HAVE_HIS_FILLS = !!FULL;

function splitCsvLine(line){
  const out = []; let cur = ''; let q = false;
  for(let i = 0; i < line.length; i++){
    const c = line[i];
    if(q){ if(c === '"' && line[i+1] === '"'){ cur += '"'; i++; } else if(c === '"') q = false; else cur += c; }
    else if(c === '"') q = true;
    else if(c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out.map(s => s.trim());
}
const money = s => { const t = String(s||'').replace(/[$,]/g,'').trim(); return t ? Number(t) : 0; };
function occOf(sym){
  const m = sym.match(/^([A-Z.]{1,6}) (\d{2})\/(\d{2})\/(\d{4}) ([\d.]+) ([CP])$/);
  if(!m) return null;
  return m[1].padEnd(6,' ') + m[4].slice(2) + m[2] + m[3] + m[6] + String(Math.round(Number(m[5])*1000)).padStart(8,'0');
}
function fillsFromExport(file){
  const lines = fs.readFileSync(file,'utf8').split(/\r?\n/).filter(l => l.trim());
  const head = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const at = n => head.findIndex(h => h === n || h.startsWith(n));
  const iD = at('date'), iA = at('action'), iS = at('symbol'), iQ = at('quantity'),
        iP = at('price'), iF = at('fees'), iAmt = at('amount');
  const rows = [];
  for(let i = 1; i < lines.length; i++){
    const f = splitCsvLine(lines[i]);
    const action = f[iA];
    if(action !== 'Buy to Open' && action !== 'Sell to Close') continue;
    const m = f[iD].match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(!m) continue;
    rows.push({ date: `${m[3]}-${m[1]}-${m[2]}`, isBuy: action === 'Buy to Open',
                symbol: f[iS], qty: Number(f[iQ]), price: money(f[iP]),
                fees: iF >= 0 ? money(f[iF]) : 0, amount: money(f[iAmt]) });
  }
  rows.sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.isBuy === b.isBuy ? 0 : (a.isBuy ? -1 : 1)));
  let n = 0;
  return rows.map(r => {
    const ts = Date.parse(r.date + 'T14:30:00Z') + (n++) * 60000;
    return {
      occ: occOf(r.symbol), ticker: r.symbol.split(' ')[0],
      putCall: r.symbol.endsWith('P') ? 'PUT' : 'CALL',
      instruction: r.isBuy ? 'BUY_TO_OPEN' : 'SELL_TO_CLOSE',
      quantity: r.qty, price: r.price, fees: r.fees,
      date: r.date, time: new Date(ts).toISOString().slice(11,16), timestamp: ts,
      transactionId: 'csv' + n, _amount: r.amount,
    };
  });
}

// A paired trade, shaped as the app's own import writes it into storage.
function asStored(t){
  return {
    id: t.id,
    ticker: t.ticker, dir: t.dir, strat: null, play: null,
    entryDate: t.entryDate, entryTime: t.entryTime,
    exitDate: t.exitDate, exitTime: t.exitTime,
    occ: t.occ || '',
    entryTimestamp: t.entryTimestamp ?? null, exitTimestamp: t.exitTimestamp ?? null,
    optEntry: t.optEntry ?? 0, optExit: t.optExit ?? null, contracts: t.contracts || 1,
    undEntry: null, undExit: null, stop: null, rrPlanned: null,
    ftfc: {}, ftfcRun: 0, ftfcConfirmed: false, ftfcDirection: null, ftfcTimeframesInRun: [],
    replayData: null,
    pnlDollar: t.pnlDollar, pnlPercent: t.pnlPercent,
    fees: t.fees ?? null, pnlNet: t.pnlNet ?? null,
    winLoss: (t.pnlDollar || 0) >= 0 ? 'Win' : 'Loss',
    notes: '', source: 'schwab-auto', settled: true, fillAttempts: 1,
  };
}

// Null, with the reason, when this machine cannot build his real journal --
// never an empty list, which would read as "he has no trades".
function buildJournal(batch){
  if(!processFills) return { reason: 'the pairing code is not on this machine', trades: null, fills: null };
  if(!FULL) return { reason: 'his broker export is not on this machine', trades: null, fills: null };
  const fills = fillsFromExport(FULL);
  let state = { openLegs: [], pending: [], lastProcessedIds: [] };
  const trades = [];
  const step = batch || fills.length;
  for(let i = 0; i < fills.length; i += step){
    const out = processFills(fills.slice(i, i + step), state);
    trades.push(...out.newPending);
    state = { openLegs: out.updatedState.openLegs, pending: [], lastProcessedIds: [] };
  }
  return { reason: null, fills, trades: trades.map(asStored) };
}

module.exports = { buildJournal, fillsFromExport, FULL, HAVE_HIS_FILLS, splitCsvLine, money };
