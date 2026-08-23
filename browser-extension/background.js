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

// Builds the address the extension uploads a captured picture to. Reuses
// the exact same route/params the phone Shortcuts already send —
// timestampMs comes from the trade event itself (the real open/close time),
// not "now", so a delayed poll doesn't throw off the app's 10-minute
// entry/exit matching window.
function buildUploadUrl(backendUrl, appKey, timestampMs) {
  const base = backendUrl.replace(/\/+$/, '');
  const timestampSeconds = Math.round(timestampMs / 1000);
  return `${base}/media/upload?key=${encodeURIComponent(appKey)}&timestamp=${timestampSeconds}`;
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

  const uploadUrl = buildUploadUrl(backendUrl, appKey, event.timestamp);
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
    for (const event of events || []) {
      try {
        await uploadCapture(backendUrl, appKey, event);
        await fetch(buildDeleteEventUrl(backendUrl, appKey, event.id), { method: 'DELETE' });
        captured++;
      } catch (err) {
        console.log(`Strat Journal: capture failed for event ${event.id}:`, err.message);
      }
    }

    await setStatus({
      lastPollAt: Date.now(),
      lastError: null,
      lastEventCount: (events || []).length,
      lastCapturedCount: captured,
    });
  } catch (err) {
    await setStatus({ lastPollAt: Date.now(), lastError: err.message });
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(POLL_ALARM_NAME, { periodInMinutes: POLL_PERIOD_MINUTES });
  });
  chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create(POLL_ALARM_NAME, { periodInMinutes: POLL_PERIOD_MINUTES });
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM_NAME) pollAndCapture();
  });
}

// Node-testable exports — chrome.* dependent functions are intentionally
// left out, since those can only be exercised in a real browser.
if (typeof module !== 'undefined') {
  module.exports = { buildUploadUrl, buildEventsUrl, buildDeleteEventUrl };
}
