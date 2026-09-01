// Runs quietly in the background the whole time the browser is open. Once a
// minute (Chrome's alarms API won't go faster than that), it asks the
// backend "did a trade just open, hit the 15-minute still-open mark, or
// close?" — the same three moments the phone already reacts to via Pushcut
// — and if so, snaps a picture of whatever tab is currently active and
// uploads it to the exact same /media/upload endpoint the phone uses.
//
// Pure/testable pieces (no chrome.* APIs) are kept as plain functions and
// exported at the bottom for a Node test script to exercise directly. The
// chrome.* glue around them can only be verified by actually running this
// in a real browser — see TASKS.md.

const POLL_ALARM_NAME = 'strat-journal-poll';
const POLL_PERIOD_MINUTES = 1; // Chrome's minimum alarm granularity

// A picture is only worth taking while the moment it belongs to is still
// on screen. The server keeps an event for twenty minutes, which is right
// for the server -- but if this browser was CLOSED when the trade
// happened and opens ten minutes later, capturing now would photograph
// whatever is on screen and stamp it with the trade's time, quietly
// attaching an unrelated picture to that trade. This checks once a
// minute, so anything older than a few minutes means nobody was here.
// A missing picture is recoverable; a wrong one looks real for ever.
const MAX_EVENT_AGE_MS = 3 * 60 * 1000;

// The other side of the same coin. A moment can carry a time that has not
// arrived yet -- the middle of a trade, or the later steps of a rehearsal
// -- and capturing it early photographs the wrong thing just as surely as
// capturing it late. Left in place, not cleared, so it is picked up when
// its moment comes.
const EARLY_TOLERANCE_MS = 20 * 1000;

function isNotDueYet(event, now = Date.now()) {
  if (!event || typeof event.timestamp !== 'number') return false;
  return event.timestamp > (now + EARLY_TOLERANCE_MS);
}

function isTooOldToCapture(event, now = Date.now()) {
  if (!event || typeof event.timestamp !== 'number') return false; // no time on it: leave the decision to the server
  return (now - event.timestamp) > MAX_EVENT_AGE_MS;
}

// Builds the address the extension uploads a captured picture to. Reuses
// the exact same route/params the phone Shortcuts already send —
// timestampMs comes from the trade event itself (the real open/close time),
// not "now", so a delayed poll doesn't throw off the app's 10-minute
// entry/exit matching window.
function buildUploadUrl(backendUrl, appKey, timestampMs, opts = {}) {
  const base = backendUrl.replace(/\/+$/, '');
  const timestampSeconds = Math.round(timestampMs / 1000);
  let url = `${base}/media/upload?key=${encodeURIComponent(appKey)}&timestamp=${timestampSeconds}`;
  // A rehearsal says so all the way through, so nothing it produces can
  // ever be filed against a real trade.
  if (opts.test) url += '&test=1';
  if (opts.moment) url += `&moment=${encodeURIComponent(opts.moment)}`;
  return url;
}

function buildTestTradeUrl(backendUrl, appKey) {
  const base = backendUrl.replace(/\/+$/, '');
  return `${base}/browser/test-trade?key=${encodeURIComponent(appKey)}`;
}

function buildEventsUrl(backendUrl, appKey) {
  const base = backendUrl.replace(/\/+$/, '');
  return `${base}/browser/events?key=${encodeURIComponent(appKey)}`;
}

function buildDeleteEventUrl(backendUrl, appKey, eventId) {
  const base = backendUrl.replace(/\/+$/, '');
  return `${base}/browser/events/${encodeURIComponent(eventId)}?key=${encodeURIComponent(appKey)}`;
}

async function getSettings() {
  const { backendUrl, appKey } = await chrome.storage.local.get(['backendUrl', 'appKey']);
  return { backendUrl: backendUrl || '', appKey: appKey || '' };
}

async function setStatus(fields) {
  await chrome.storage.local.set(fields);
}

// Grabs whatever tab is currently on screen, as a PNG data: URL — this is
// what actually becomes the uploaded picture. Requires host_permissions
// covering the tab's site (see manifest.json) since this runs from a timer,
// not a user click.
async function captureActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error('No active tab found to capture.');
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  return dataUrl;
}

async function uploadCapture(backendUrl, appKey, event) {
  const dataUrl = await captureActiveTab();
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append('image', blob, 'capture.png');

  const uploadUrl = buildUploadUrl(backendUrl, appKey, event.timestamp, { test: event.test, moment: event.type });
  const res = await fetch(uploadUrl, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
}

async function pollAndCapture() {
  const { backendUrl, appKey } = await getSettings();
  if (!backendUrl || !appKey) {
    await setStatus({ lastError: 'Not configured yet — set Backend URL and App Key in the extension options.', lastPollAt: Date.now() });
    return;
  }

  try {
    const res = await fetch(buildEventsUrl(backendUrl, appKey));
    if (!res.ok) throw new Error(`Could not check for trade events (${res.status}).`);
    const { events } = await res.json();

    let captured = 0;
    let skippedTooOld = 0;
    let failed = 0;
    let waiting = 0;
    for (const event of events || []) {
      if (isNotDueYet(event)) {
        // Its moment has not come. Left alone on purpose.
        waiting++;
        continue;
      }
      if (isTooOldToCapture(event)) {
        // Cleared rather than left: otherwise it is offered again every
        // minute until it expires, and each attempt is another chance to
        // attach the wrong picture.
        skippedTooOld++;
        await fetch(buildDeleteEventUrl(backendUrl, appKey, event.id), { method: 'DELETE' }).catch(() => {});
        continue;
      }
      try {
        await uploadCapture(backendUrl, appKey, event);
        await fetch(buildDeleteEventUrl(backendUrl, appKey, event.id), { method: 'DELETE' });
        captured++;
      } catch (err) {
        // Counted, not just logged. A failure that only reaches a log
        // nobody reads is indistinguishable from nothing having happened.
        failed++;
        console.log(`Strat Journal: capture failed for event ${event.id}:`, err.message);
      }
    }

    await setStatus({
      lastPollAt: Date.now(),
      lastError: failed
        ? `${failed} picture${failed === 1 ? '' : 's'} could not be sent. Check the address and key in Settings.`
        : null,
      lastEventCount: (events || []).length,
      lastCapturedCount: captured,
      lastSkippedCount: skippedTooOld,
      lastWaitingCount: waiting,
    });
  } catch (err) {
    await setStatus({ lastPollAt: Date.now(), lastError: err.message });
  }
}

// Rehearses a whole trade rather than taking one picture. The three
// moments a real trade produces -- opened, still open, closed -- are
// queued a minute and a half apart, and the ordinary once-a-minute check
// picks each one up as its time arrives. So what gets exercised is the
// real path, in the real order, end to end: permission to photograph the
// tab, the address, the key, the upload, and the app noticing.
//
// Every picture it produces is labelled a rehearsal and never attaches to
// a real trade.
async function startTestTrade() {
  const { backendUrl, appKey } = await getSettings();
  if (!backendUrl || !appKey) throw new Error('Fill in the address and key in Settings first.');
  const res = await fetch(buildTestTradeUrl(backendUrl, appKey), { method: 'POST' });
  if (!res.ok) {
    if (res.status === 403) throw new Error('The key does not match. Check it in Settings.');
    throw new Error(`Could not start the test (${res.status}).`);
  }
  const body = await res.json().catch(() => ({}));
  // The first moment is due immediately -- take it now rather than making
  // him wait up to a minute for the next scheduled check.
  await pollAndCapture();
  return body;
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  // Asked for from the small window behind the toolbar icon.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'testTrade') {
      startTestTrade()
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true; // the answer comes later
    }
    if (msg && msg.type === 'checkNow') {
      pollAndCapture()
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
    }
    return false;
  });
  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(POLL_ALARM_NAME, { periodInMinutes: POLL_PERIOD_MINUTES });
  });
  chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create(POLL_ALARM_NAME, { periodInMinutes: POLL_PERIOD_MINUTES });
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM_NAME) pollAndCapture();
  });
  // Belt and braces. The two listeners above only fire on install and on
  // the browser starting; if the once-a-minute check is ever missing for
  // any other reason, nothing above would ever put it back and the whole
  // add-on would sit there doing nothing, silently.
  chrome.alarms.get(POLL_ALARM_NAME).then((existing) => {
    if (!existing) chrome.alarms.create(POLL_ALARM_NAME, { periodInMinutes: POLL_PERIOD_MINUTES });
  }).catch(() => {});
}

// Node-testable exports — chrome.* dependent functions are intentionally
// left out, since those can only be exercised in a real browser.
if (typeof module !== 'undefined') {
  module.exports = { buildUploadUrl, buildEventsUrl, buildDeleteEventUrl, buildTestTradeUrl,
    isTooOldToCapture, isNotDueYet, MAX_EVENT_AGE_MS, EARLY_TOLERANCE_MS };
}
