// The decisions a screen recording needs, kept away from anything a browser
// has to supply -- so they can be exercised directly in Node rather than
// only by watching a real recording and hoping.
//
// Nothing in here touches chrome.*, a camera, a microphone or a clock it
// was not handed.

// A recording is held for this long and no longer. Twenty-five minutes is
// comfortably past the fifteen at which a trade stops being recorded and
// starts being photographed, with room for a late signal.
const HOLD_MS = 25 * 60 * 1000;

// Everything before the entry that is worth keeping. He decides to take a
// trade before he takes it, and the half-minute before the fill is often
// the part worth looking at again.
const PRE_ROLL_MS = 30 * 1000;

// And a little after the exit, for the same reason in reverse.
const POST_ROLL_MS = 15 * 1000;

// Fifteen minutes in, a trade stops being recorded and starts being
// photographed -- the same fifteen minutes the app and the server already
// use for the mid-trade picture. A clip never runs past it.
const CLIP_CAP_MS = 15 * 60 * 1000;

// A clip stamped with the entry time but actually starting well after it is
// not a recording of that entry. Three minutes, the same cushion a picture
// gets: past that, nothing is uploaded and the reason is said, because a
// missing recording is recoverable and a misleading one is evidence.
const MAX_LATE_START_MS = 3 * 60 * 1000;

// The stretch of real time a clip should cover. `exitAt` may be null for a
// trade still running.
function clipWindow(entryAt, exitAt){
  const from = entryAt - PRE_ROLL_MS;
  const hardStop = entryAt + CLIP_CAP_MS;
  const to = exitAt == null ? hardStop : Math.min(exitAt + POST_ROLL_MS, hardStop);
  return { from, to };
}

// Which pieces of the rolling buffer belong in that stretch.
//
// A piece is stamped with the moment it ARRIVED, which is the moment it
// ends -- so a one-second piece stamped 10:00:05 covers 10:00:04 to
// 10:00:05. A piece counts if any part of it falls inside the window.
//
// THE FIRST PIECE IS ALWAYS INCLUDED, wherever it sits in time. It carries
// the description of the recording itself, and without it the rest is not a
// video at all -- measured in a real browser: the same pieces without it
// would not open, with the player reporting it could not be read.
function piecesInWindow(pieces, from, to, sliceMs){
  if(!pieces.length) return [];
  const span = sliceMs || 1000;
  const body = pieces.filter((p, i) => i > 0 && p.at > from && (p.at - span) < to);
  return [pieces[0], ...body];
}

// Anything older than the hold, except the first piece, which is kept for
// as long as the recording runs.
function prunePieces(pieces, now){
  if(pieces.length < 2) return pieces;
  const cutoff = now - HOLD_MS;
  return [pieces[0], ...pieces.slice(1).filter(p => p.at > cutoff)];
}

// How much of the asked-for stretch the buffer can actually answer for, and
// whether that is enough to be worth sending.
//
// Three different answers, never one blank: nothing was being recorded, the
// recording began too late to be this trade's entry, or it is good.
function coverage(pieces, from, to){
  if(!pieces.length){
    return { ok: false, reason: 'Nothing was being recorded at the time, so there is no footage of this trade.' };
  }
  const body = pieces.slice(1);
  const inside = body.filter(p => p.at > from && (p.at - 1000) < to);
  if(!inside.length){
    return { ok: false, reason: 'The recording was running but none of it covers this trade — it either started after the trade finished or stopped before it began.' };
  }
  const coveredFrom = Math.min(...inside.map(p => p.at - 1000));
  const coveredTo = Math.max(...inside.map(p => p.at));
  const lateBy = coveredFrom - from;
  if(lateBy > MAX_LATE_START_MS){
    return {
      ok: false, coveredFrom, coveredTo, lateBy,
      reason: 'The recording only began ' + Math.round(lateBy / 60000) +
              ' minutes into this trade, so it would not show the entry. Nothing was sent rather than filing a recording of the wrong moment.',
    };
  }
  return { ok: true, coveredFrom, coveredTo, lateBy, reason: null };
}

// ==== Stills kept alongside the recording ====
//
// He executes on Schwab and THEN switches to TradingView. So at the instant
// the picture is taken -- up to a minute after his fill -- Schwab is what is
// on screen, and photographing the screen either refuses (now) or files a
// picture of his order ticket as his chart (before). Both are wrong.
//
// The recording does not have this problem: it follows the TradingView TAB,
// not his screen, so it is watching the chart the whole time he is on
// Schwab. So the picture is taken FROM the recording.
//
// A still every two seconds, held four minutes. Four minutes because the
// picture is asked for within a minute of the fill and given up on at three;
// holding the full twenty-five would be twelve times the memory for nothing.
const FRAME_EVERY_MS = 2000;
const FRAME_HOLD_MS = 4 * 60 * 1000;
// A ceiling on what accumulates, not only on how long it is kept -- a
// higher-resolution screen makes each still bigger and the count alone would
// not notice. This project has already had a process killed for churning
// memory nobody was counting.
const FRAME_MAX_BYTES = 12 * 1024 * 1024;

function pruneFrames(frames, now){
  const cutoff = now - FRAME_HOLD_MS;
  const kept = frames.filter(f => f.at > cutoff);
  let total = kept.reduce((n, f) => n + f.bytes, 0);
  // Oldest first if it is still too heavy.
  while (kept.length > 1 && total > FRAME_MAX_BYTES) total -= kept.shift().bytes;
  return kept;
}

// The still closest to the moment asked about -- and a REASON when there
// isn't one, never an empty hand.
//
// A still too far from the moment is refused rather than passed off as the
// chart at his entry. That is the same rule as the capture-taken-late guard:
// a missing picture is recoverable, a wrong one looks real for ever.
const FRAME_MAX_DRIFT_MS = 20 * 1000;

function frameNearest(frames, atMs){
  if(!frames.length){
    return { frame: null, reason: 'Nothing was being recorded at that moment, so there is no picture of the chart to take.' };
  }
  let best = null;
  for(const f of frames){
    const drift = Math.abs(f.at - atMs);
    if(!best || drift < best.drift) best = { frame: f, drift };
  }
  if(best.drift > FRAME_MAX_DRIFT_MS){
    return {
      frame: null, drift: best.drift,
      reason: 'The recording holds nothing from within ' + Math.round(FRAME_MAX_DRIFT_MS / 1000)
            + ' seconds of that moment — the closest is ' + Math.round(best.drift / 1000)
            + ' seconds away, which is not a picture of the chart at that moment.',
    };
  }
  return { frame: best.frame, drift: best.drift, reason: null };
}

// ==== When he needs telling ====
//
// Chrome will not let anything start recording without a press from him --
// the same wall Apple has. So the press cannot be removed. What CAN be
// removed is having to REMEMBER it, which is the thing that actually costs
// him a trade's video.
//
// Nudged BEFORE the bell rather than at it: a recording has to already be
// running when he enters, because it works by reaching backwards.
const NUDGE_FROM_MINUTE = 9 * 60;        // 09:00 in New York
const NUDGE_UNTIL_MINUTE = 16 * 60;      // 16:00, the close

// Built ONCE. Building an Intl formatter inside anything that runs
// repeatedly is on this project's own record as the cause of half a
// gigabyte of churned memory.
const NY_TIME = (typeof Intl !== 'undefined')
  ? new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false,
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    })
  : null;

// Trading hours in NEW YORK, whatever his laptop's clock is set to. A
// laptop on the wrong timezone would otherwise nudge him at midnight or
// not at all.
function isTradingTime(now, formatter){
  const f = formatter || NY_TIME;
  if (!f) return true; // cannot tell: better to nudge than to stay silent
  const parts = {};
  for (const p of f.formatToParts(new Date(now))) parts[p.type] = p.value;
  if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  return minute >= NUDGE_FROM_MINUTE && minute < NUDGE_UNTIL_MINUTE;
}

// What, if anything, to say -- and it must not become wallpaper.
//
// Three outcomes, never one blank: nothing to say; the quiet start-of-day
// reminder, at most once a day; and the urgent one, when a trade has
// ACTUALLY opened and is going unrecorded. The urgent one is allowed
// through even if the quiet one already went, because it means a real
// trade is being lost right now.
function nudgeToShow({ recording, tradeOpened, now, lastQuietAt, lastUrgentAt }, formatter){
  if (recording) return null;
  if (!isTradingTime(now, formatter)) return null;

  const DAY = 24 * 60 * 60 * 1000;
  if (tradeOpened) {
    // Not more than once every twenty minutes, so a run of trades does not
    // produce a run of boxes he starts swiping away without reading.
    if (lastUrgentAt && (now - lastUrgentAt) < 20 * 60 * 1000) return null;
    return {
      kind: 'urgent',
      title: 'A trade just opened and is not being recorded',
      message: 'Click the Strat Journal icon and press Start recording. You will still catch the exit.',
    };
  }
  if (lastQuietAt && (now - lastQuietAt) < DAY) return null;
  return {
    kind: 'quiet',
    title: 'Your charts are not being recorded',
    message: 'Click the Strat Journal icon and press Start recording. One press covers every trade today.',
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { clipWindow, piecesInWindow, prunePieces, coverage,
    isTradingTime, nudgeToShow, pruneFrames, frameNearest,
    FRAME_EVERY_MS, FRAME_HOLD_MS, FRAME_MAX_BYTES, FRAME_MAX_DRIFT_MS,
    NUDGE_FROM_MINUTE, NUDGE_UNTIL_MINUTE,
    HOLD_MS, PRE_ROLL_MS, POST_ROLL_MS, CLIP_CAP_MS, MAX_LATE_START_MS };
}
if (typeof self !== 'undefined') {
  self.RecorderCore = { clipWindow, piecesInWindow, prunePieces, coverage,
    isTradingTime, nudgeToShow, pruneFrames, frameNearest,
    FRAME_EVERY_MS, FRAME_HOLD_MS, FRAME_MAX_DRIFT_MS,
    HOLD_MS, PRE_ROLL_MS, POST_ROLL_MS, CLIP_CAP_MS, MAX_LATE_START_MS };
}
