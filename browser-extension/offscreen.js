// Holds the actual screen recording. This page is never shown -- Chrome
// will not let the background part of an add-on record anything by itself,
// so the recording has to live on a page, and this is a page with nothing
// on it.
//
// It records CONTINUOUSLY into a rolling buffer, keeping the last
// twenty-five minutes, and cuts a trade's stretch out of it when the
// server says that trade has closed.
//
// Recording continuously rather than starting when a trade opens is the
// whole point: the server's signal arrives up to a minute after the fill,
// and a recording that starts a minute in has already missed the entry --
// which is the part he wants to look at. The footage is cut by real
// timestamps, so a clip can never contain the wrong moment.

const C = self.RecorderCore;

let recorder = null;
let stream = null;
let mime = null;
let pieces = [];      // {blob, at} -- `at` is the moment the piece arrived, which is the moment it ends
let sliceMs = 1000;
let startedAt = null;
let lastFault = null;

function pickMime(){
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for(const t of types){ if(MediaRecorder.isTypeSupported(t)) return t; }
  return '';
}

async function startRecording(streamId){
  if(recorder) return { ok: true, already: true };
  try{
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    });
  }catch(err){
    lastFault = 'Chrome would not hand over the tab to record: ' + err.message;
    return { ok: false, reason: lastFault };
  }
  mime = pickMime();
  try{
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  }catch(err){
    lastFault = 'This browser would not start a recording: ' + err.message;
    stopTracks();
    return { ok: false, reason: lastFault };
  }
  pieces = [];
  recorder.ondataavailable = (e) => {
    if(!e.data || !e.data.size) return;
    pieces.push({ blob: e.data, at: Date.now() });
    pieces = C.prunePieces(pieces, Date.now());
  };
  // The tab being closed, or him stopping the share, ends the stream --
  // which is a real stop, not a fault, and the state has to say so rather
  // than going on claiming it is recording.
  stream.getVideoTracks().forEach(t => { t.onended = () => { stopRecording(); }; });
  recorder.start(sliceMs);
  startedAt = Date.now();
  lastFault = null;
  return { ok: true };
}

function stopTracks(){
  if(stream){ stream.getTracks().forEach(t => { try{ t.stop(); }catch(e){} }); }
  stream = null;
}

function stopRecording(){
  try{ if(recorder && recorder.state !== 'inactive') recorder.stop(); }catch(e){}
  recorder = null;
  stopTracks();
  startedAt = null;
  pieces = [];
  return { ok: true };
}

// Cuts one trade's stretch out of the buffer and sends it.
//
// The first piece is always included: it carries the description of the
// recording, and without it the rest will not open at all. Measured in a
// real browser rather than assumed.
async function clipAndUpload({ entryAt, exitAt, uploadUrl }){
  const { from, to } = C.clipWindow(entryAt, exitAt);
  const cov = C.coverage(pieces, from, to);
  if(!cov.ok){ lastFault = cov.reason; return { ok: false, reason: cov.reason }; }

  const chosen = C.piecesInWindow(pieces, from, to, sliceMs);
  const blob = new Blob(chosen.map(p => p.blob), { type: mime || 'video/webm' });
  if(!blob.size){
    lastFault = 'The footage for this trade came out empty.';
    return { ok: false, reason: lastFault };
  }

  const form = new FormData();
  // Named for what it is, so a recording sitting on the server can be told
  // apart from any other at a glance.
  form.append('video', blob, 'trade-' + entryAt + '.webm');
  let res;
  try{
    res = await fetch(uploadUrl, { method: 'POST', body: form });
  }catch(err){
    lastFault = 'Could not reach the server to send the recording: ' + err.message;
    return { ok: false, reason: lastFault };
  }
  if(!res.ok){
    const said = await res.text().catch(() => '');
    lastFault = res.status === 503
      ? 'The server has nowhere to keep recordings yet, so it turned this one away.'
      : 'The server would not take the recording (it answered ' + res.status + ').' + (said ? ' ' + said.slice(0, 120) : '');
    return { ok: false, reason: lastFault };
  }
  lastFault = null;
  return { ok: true, bytes: blob.size, coveredFrom: cov.coveredFrom, coveredTo: cov.coveredTo, lateBy: cov.lateBy };
}

function state(){
  const body = pieces.slice(1);
  return {
    recording: !!recorder,
    startedAt,
    heldSeconds: body.length ? Math.round((body[body.length-1].at - (body[0].at - sliceMs)) / 1000) : 0,
    heldBytes: pieces.reduce((n, p) => n + p.blob.size, 0),
    lastFault,
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(!msg || msg.target !== 'strat-recorder') return false;
  if(msg.type === 'start'){ startRecording(msg.streamId).then(sendResponse); return true; }
  if(msg.type === 'stop'){ sendResponse(stopRecording()); return false; }
  if(msg.type === 'clip'){ clipAndUpload(msg).then(sendResponse); return true; }
  if(msg.type === 'state'){ sendResponse(state()); return false; }
  return false;
});
