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
// Stills, kept beside the recording so a picture can be taken from the
// CHART rather than from whatever tab is on top of his screen.
let frames = [];          // {at, dataUrl, bytes}
let frameTimer = null;
let frameVideo = null;
let frameCanvas = null;

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
  startFrames(stream);
  startedAt = Date.now();
  lastFault = null;
  return { ok: true };
}

// A still every couple of seconds, taken from the same tab the recording is
// watching. This is what makes a picture of his chart possible while he is
// looking at Schwab.
function startFrames(src){
  frames = [];
  frameVideo = document.createElement('video');
  frameVideo.muted = true;
  frameVideo.playsInline = true;
  frameVideo.srcObject = src;
  frameVideo.play().catch(() => {});
  frameCanvas = document.createElement('canvas');
  frameTimer = setInterval(() => {
    try{
      const w = frameVideo.videoWidth, h = frameVideo.videoHeight;
      if(!w || !h) return; // nothing decoded yet; not a fault, just early
      frameCanvas.width = w; frameCanvas.height = h;
      frameCanvas.getContext('2d').drawImage(frameVideo, 0, 0, w, h);
      // A chart is flat colour and thin lines, which JPEG handles well at
      // this quality -- a picture he can read, without the weight of a
      // lossless one held two hundred times over.
      const dataUrl = frameCanvas.toDataURL('image/jpeg', 0.7);
      frames.push({ at: Date.now(), dataUrl, bytes: dataUrl.length });
      frames = C.pruneFrames(frames, Date.now());
    }catch(e){
      lastFault = 'A still could not be taken from the recording: ' + e.message;
    }
  }, C.FRAME_EVERY_MS);
}

function stopFrames(){
  if(frameTimer) clearInterval(frameTimer);
  frameTimer = null;
  if(frameVideo){ try{ frameVideo.pause(); }catch(e){} frameVideo.srcObject = null; }
  frameVideo = null; frameCanvas = null; frames = [];
}

// The chart as it was at one particular moment. Answers with a reason
// rather than an empty hand, and refuses a still too far from the moment
// instead of passing it off as the chart at his entry.
function pictureAt(atMs){
  const got = C.frameNearest(frames, atMs);
  if(!got.frame) return { image: null, reason: got.reason };
  return { image: got.frame.dataUrl, takenAt: got.frame.at, driftMs: got.drift, reason: null };
}

function stopTracks(){
  if(stream){ stream.getTracks().forEach(t => { try{ t.stop(); }catch(e){} }); }
  stream = null;
}

function stopRecording(){
  try{ if(recorder && recorder.state !== 'inactive') recorder.stop(); }catch(e){}
  recorder = null;
  stopFrames();
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
    frameCount: frames.length,
    frameBytes: frames.reduce((n, f) => n + f.bytes, 0),
    lastFault,
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(!msg || msg.target !== 'strat-recorder') return false;
  if(msg.type === 'start'){ startRecording(msg.streamId).then(sendResponse); return true; }
  if(msg.type === 'stop'){ sendResponse(stopRecording()); return false; }
  if(msg.type === 'clip'){ clipAndUpload(msg).then(sendResponse); return true; }
  if(msg.type === 'pictureAt'){ sendResponse(pictureAt(msg.atMs)); return false; }
  if(msg.type === 'state'){ sendResponse(state()); return false; }
  return false;
});
