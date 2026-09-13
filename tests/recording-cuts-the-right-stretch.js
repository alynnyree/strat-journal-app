// What a screen recording of a trade actually contains.
//
// Two separate questions, both answered by running the real thing:
//
//   1. Does a stretch cut out of a rolling recording PLAY? Answered in a
//      real browser, because nothing short of that can tell you.
//   2. Does the right stretch get cut, and does a stretch that would be
//      misleading get refused? Answered against the real decision code the
//      add-on runs.
//
// The second matters as much as the first. A missing recording is
// recoverable; a recording of the wrong five minutes, stamped with a
// trade's own time, is evidence -- the same fault that made the picture
// path refuse anything older than three minutes.
const path = require('path');
const { launch } = require('./browser.js');
const C = require(path.join(__dirname, '..', 'browser-extension', 'recorder-core.js'));
const bg = require(path.join(__dirname, '..', 'browser-extension', 'background.js'));

let pass = 0, fail = 0;
const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

// ---------------------------------------------------------------
// Part one: the decisions, against the real code
// ---------------------------------------------------------------
const T0 = 1757000000000; // an arbitrary fixed moment; nothing depends on which
function buffer(fromMs, toMs){
  // One piece a second, each stamped with the moment it ARRIVED, which is
  // the moment it ends -- exactly as MediaRecorder hands them over.
  const out = [];
  for(let at = fromMs + 1000; at <= toMs; at += 1000) out.push({ at, blob: { size: 20000 } });
  return out;
}

console.log('--- what stretch gets cut ---');
{
  const w = C.clipWindow(T0, T0 + 5*60*1000);
  check('a clip starts before the entry, not at it', w.from === T0 - 30*1000);
  check('...and runs a little past the exit', w.to === T0 + 5*60*1000 + 15*1000);
}
{
  // The fifteen-minute mark is where a trade stops being recorded and
  // starts being photographed. A clip never runs past it.
  const w = C.clipWindow(T0, T0 + 40*60*1000);
  check('a long trade is cut off at fifteen minutes', w.to === T0 + 15*60*1000);
  const still = C.clipWindow(T0, null);
  check('a trade still running is cut at the same fifteen minutes', still.to === T0 + 15*60*1000);
}
{
  const pieces = buffer(T0 - 10*60*1000, T0 + 10*60*1000);
  const w = C.clipWindow(T0, T0 + 60*1000);
  const chosen = C.piecesInWindow(pieces, w.from, w.to, 1000);
  // 30s before + 60s of trade + 15s after = 105 seconds, plus the first
  // piece, which is always carried whatever its time.
  check('the cut is the length of the window, not the whole recording', chosen.length === 106);
  check('the very first piece is always carried', chosen[0] === pieces[0]);
  const body = chosen.slice(1);
  check('nothing from before the window is carried', body.every(p => p.at > w.from));
  check('nothing from after the window is carried', body.every(p => (p.at - 1000) < w.to));
  check('a twenty-minute recording is much longer than the cut', pieces.length > chosen.length * 10);
}

console.log('\n--- what gets refused, and whether it says why ---');
{
  const none = C.coverage([], T0 - 30000, T0 + 60000);
  check('nothing recorded is refused', none.ok === false);
  check('...and says nothing was being recorded', /Nothing was being recorded/i.test(none.reason));
}
{
  // Recording that stopped long before the trade.
  const old = buffer(T0 - 60*60*1000, T0 - 50*60*1000);
  const v = C.coverage(old, T0 - 30000, T0 + 60000);
  check('footage that does not reach the trade is refused', v.ok === false);
  check('...and says so differently from "nothing was recorded"', /none of it covers this trade/i.test(v.reason));
  check('...which is a DIFFERENT reason, not one shared answer', v.reason !== C.coverage([], T0, T0+1).reason);
}
{
  // Started ten minutes into the trade: real footage, but not of the entry.
  const late = buffer(T0 + 10*60*1000, T0 + 14*60*1000);
  const w = C.clipWindow(T0, T0 + 14*60*1000);
  const v = C.coverage(late, w.from, w.to);
  check('a recording that began well after the entry is refused', v.ok === false);
  check('...and says how late it began', /only began 1[01] minutes/i.test(v.reason));
  check('...and says plainly that nothing was sent', /Nothing was sent/i.test(v.reason));
}
{
  // Started forty seconds in. Late, but well inside the three-minute
  // cushion a picture gets -- this is a real recording of the trade.
  const slightly = buffer(T0 + 40*1000, T0 + 5*60*1000);
  const w = C.clipWindow(T0, T0 + 5*60*1000);
  const v = C.coverage(slightly, w.from, w.to);
  check('a recording that began forty seconds in is still sent', v.ok === true);
  check('...and carries no invented reason', v.reason === null);
  check('...and says how late it was, rather than hiding it', v.lateBy > 60000 && v.lateBy < 2*60*1000);
}

console.log('\n--- what is thrown away as it ages ---');
{
  const now = T0;
  const pieces = buffer(now - 40*60*1000, now);
  const kept = C.prunePieces(pieces, now);
  check('only the last twenty-five minutes are held', kept.length - 1 === 25*60);
  check('the first piece survives the pruning', kept[0] === pieces[0]);
  check('a forty-minute recording is not held whole', kept.length < pieces.length / 1.5);
}

// ---------------------------------------------------------------
// Part two: the bookkeeping, with the real background code
// ---------------------------------------------------------------
console.log('\n--- matching a close back to the entry it belongs to ---');
(async () => {
  // Stands in for the browser's own storage and its message passing --
  // the two things the add-on cannot bring with it into Node.
  const store = {};
  const sent = [];
  let recorderAnswer = () => ({ ok: true, bytes: 12345 });
  global.chrome = {
    storage: { local: {
      get: async (keys) => { const o = {}; for(const k of [].concat(keys)) if(k in store) o[k] = store[k]; return o; },
      set: async (fields) => { Object.assign(store, fields); },
    } },
    runtime: { sendMessage: async (msg) => { sent.push(msg); return recorderAnswer(msg); } },
  };

  const URL_ = 'https://example.invalid';
  const KEY = 'k';

  // A trade that opens and closes across two checks.
  let out = await bg.noteMomentsForRecording([
    { id:'a', type:'opened', ticker:'SPY', timestamp: T0 },
  ], URL_, KEY, T0 + 1000);
  check('an opening on its own cuts nothing yet', out.clipped === 0 && sent.length === 0);
  check('...but is remembered', !!store.openTrades[String(T0)]);

  out = await bg.noteMomentsForRecording([
    { id:'b', type:'closed', ticker:'SPY', timestamp: T0 + 4*60*1000 },
  ], URL_, KEY, T0 + 5*60*1000);
  check('the close cuts one recording', out.clipped === 1);
  check('...cut from the ENTRY, not from when the signal arrived', sent[0].entryAt === T0);
  check('...to the exit', sent[0].exitAt === T0 + 4*60*1000);
  check('...and sent stamped with the entry time, which is what the journal matches on',
    sent[0].uploadUrl.includes('timestamp=' + Math.round(T0/1000)));
  check('the open trade is no longer held once it is cut', !store.openTrades[String(T0)]);

  // A trade that opens and closes inside ONE check. Handed over in the
  // wrong order on purpose: the list is not guaranteed to be in time order.
  sent.length = 0;
  out = await bg.noteMomentsForRecording([
    { id:'d', type:'closed', ticker:'IWM', timestamp: T0 + 2*60*1000 },
    { id:'c', type:'opened', ticker:'IWM', timestamp: T0 },
  ], URL_, KEY, T0 + 3*60*1000);
  check('a trade that opens and closes in one check is still cut', out.clipped === 1);
  check('...from its real entry, despite arriving out of order', sent[0] && sent[0].entryAt === T0);

  // A close for a trade this browser never saw open.
  sent.length = 0;
  out = await bg.noteMomentsForRecording([
    { id:'e', type:'closed', ticker:'SPY', timestamp: T0 + 9*60*1000 },
  ], URL_, KEY, T0 + 9*60*1000);
  check('a close with no entry on file cuts nothing', out.clipped === 0 && sent.length === 0);
  check('...and says why rather than passing in silence', /never saw open/i.test(out.lastReason || ''));

  // The fifteen-minute mark: recording stops, pictures take over.
  sent.length = 0;
  await bg.noteMomentsForRecording([{ id:'f', type:'opened', ticker:'SPY', timestamp: T0 }], URL_, KEY, T0);
  out = await bg.noteMomentsForRecording([
    { id:'g', type:'stillOpen', ticker:'SPY', timestamp: T0 + 15*60*1000 },
  ], URL_, KEY, T0 + 15*60*1000);
  check('the fifteen-minute mark cuts the recording so far', out.clipped === 1);
  check('...with no exit, so it simply stops at the cap', sent[0].exitAt === null);

  // A rehearsal produces no recording. His journal has already held 161
  // contracts he never bought.
  sent.length = 0;
  await bg.noteMomentsForRecording([
    { id:'h', type:'opened', ticker:'SPY', timestamp: T0, test: true },
    { id:'i', type:'closed', ticker:'SPY', timestamp: T0 + 60000, test: true },
  ], URL_, KEY, T0 + 60000);
  check('a rehearsal is never recorded', sent.length === 0);

  // An entry whose footage has aged out is let go rather than promising a
  // clip that can no longer be cut.
  store.openTrades = { [String(T0)]: { entryAt: T0, ticker: 'SPY' } };
  await bg.noteMomentsForRecording([], URL_, KEY, T0 + 30*60*1000);
  check('an entry older than the footage is let go', Object.keys(store.openTrades).length === 0);

  // A refusal from the recorder is reported, not swallowed.
  sent.length = 0;
  recorderAnswer = () => ({ ok: false, reason: 'The recording was running but none of it covers this trade.' });
  await bg.noteMomentsForRecording([{ id:'j', type:'opened', ticker:'SPY', timestamp: T0 }], URL_, KEY, T0);
  out = await bg.noteMomentsForRecording([{ id:'k', type:'closed', ticker:'SPY', timestamp: T0 + 60000 }], URL_, KEY, T0 + 60000);
  check('a refusal is counted, not swallowed', out.refused === 1 && out.clipped === 0);
  check('...and the reason is carried back in the recorder\'s own words', /none of it covers/i.test(out.lastReason));

  // ---------------------------------------------------------------
  // Part three: does a cut stretch actually PLAY?
  // ---------------------------------------------------------------
  console.log('\n--- does a stretch cut out of a recording actually play? ---');
  const { browser, reason } = await launch();
  if(!browser){
    console.log('SKIPPED (no browser here):', reason);
    console.log('\nThis is the part that cannot be reasoned about — it has to be run.');
    fail++; // not silently passed
  } else {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setContent('<canvas id="c" width="320" height="240"></canvas>');
    const r = await page.evaluate(async () => {
      const mime = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
        .find(t => MediaRecorder.isTypeSupported(t));
      const c = document.getElementById('c');
      const g = c.getContext('2d');
      let n = 0;
      const draw = setInterval(() => { n++; g.fillStyle = n % 2 ? '#0f0' : '#00f'; g.fillRect(0,0,320,240);
        g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText(String(n), 20, 120); }, 100);
      const chunks = [];
      const rec = new MediaRecorder(c.captureStream(10), { mimeType: mime });
      rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
      rec.start(1000);
      await new Promise(r2 => setTimeout(r2, 9000));
      await new Promise(r2 => { rec.onstop = r2; rec.stop(); });
      clearInterval(draw);

      async function probe(blob){
        const v = document.createElement('video');
        v.muted = true; v.preload = 'auto';
        const url = URL.createObjectURL(blob);
        const res = await new Promise(resolve => {
          let done = false;
          const finish = o => { if(!done){ done = true; resolve(o); } };
          v.oncanplay = () => finish({ ok:true, w:v.videoWidth, h:v.videoHeight });
          v.onerror = () => finish({ ok:false, err: v.error ? v.error.message || ('code ' + v.error.code) : 'unknown' });
          setTimeout(() => finish({ ok:false, err:'never became playable' }), 6000);
          v.src = url; v.load();
        });
        if(res.ok){
          try{ await v.play(); await new Promise(r2 => setTimeout(r2, 600)); res.advanced = v.currentTime; v.pause(); }
          catch(e){ res.playErr = e.message; }
        }
        URL.revokeObjectURL(url);
        return res;
      }

      return {
        count: chunks.length,
        whole: await probe(new Blob(chunks, {type:mime})),
        // Exactly what the add-on sends: the first piece, plus a later run.
        cutWithFirst: await probe(new Blob([chunks[0], ...chunks.slice(4)], {type:mime})),
        // The same run WITHOUT the first piece, which is the mistake this
        // design exists to avoid.
        cutWithout: await probe(new Blob(chunks.slice(4), {type:mime})),
      };
    });
    await browser.close();

    check('a whole recording plays', r.whole.ok === true);
    check('A STRETCH CUT OUT OF IT PLAYS, when the first piece is carried', r.cutWithFirst.ok === true);
    check('...at the right size, so it is a real picture and not a fragment', r.cutWithFirst.w === 320 && r.cutWithFirst.h === 240);
    check('...and actually advances when played', r.cutWithFirst.advanced > 0.1);
    // This is the measurement the whole design rests on. Without it there
    // would have been nothing but a guess that carrying the first piece
    // mattered.
    check('THE SAME STRETCH WITHOUT THE FIRST PIECE WILL NOT OPEN AT ALL', r.cutWithout.ok === false);
    console.log(`  (the stretch without its first piece failed with: ${r.cutWithout.err})`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
