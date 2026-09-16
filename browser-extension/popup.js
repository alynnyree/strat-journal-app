// Whatever the far end said arrives as plain text and must stay plain
// text. Dropped straight into the page it can break the display, and the
// display is the only way to see what went wrong.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function timeAgo(ms) {
  if (!ms) return 'never';
  const diffSec = Math.round((Date.now() - ms) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  return `${diffMin}m ago`;
}

async function render() {
  const { backendUrl, appKey, lastPollAt, lastError, lastEventCount, lastCapturedCount, lastWaitingCount } =
    await chrome.storage.local.get(['backendUrl', 'appKey', 'lastPollAt', 'lastError',
      'lastEventCount', 'lastCapturedCount', 'lastWaitingCount']);

  const content = document.getElementById('content');

  if (!backendUrl || !appKey) {
    content.innerHTML = `<div class="row err">Not set up yet — click Settings below.</div>`;
    return;
  }

  const lines = [];
  lines.push(`<div class="row">Last checked: <b>${timeAgo(lastPollAt)}</b></div>`);
  if (lastError) {
    lines.push(`<div class="row err">${escapeHtml(lastError)}</div>`);
  } else {
    lines.push(`<div class="row ok">Connected, no errors.</div>`);
  }
  if (lastWaitingCount) {
    lines.push(`<div class="row"><b>${lastWaitingCount}</b> moment(s) waiting for their time.</div>`);
  }
  if (lastEventCount != null) {
    lines.push(`<div class="row">Last check found <b>${lastEventCount}</b> trade moment(s), captured <b>${lastCapturedCount ?? 0}</b>.</div>`);
  }
  content.innerHTML = lines.join('');
}

// Proves the whole path in one click: permission to photograph the tab,
// the address, the key, and the upload. The picture will not attach to any
// trade -- it is stamped with now, not with a trade's time -- which is
// exactly why it is safe to send.
function wire(id, message, busyText, doneText) {
  const btn = document.getElementById(id);
  const out = document.getElementById('testResult');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    out.className = 'row';
    out.textContent = busyText;
    try {
      const res = await chrome.runtime.sendMessage({ type: message });
      if (res && res.ok) { out.className = 'row ok'; out.textContent = doneText; }
      else { out.className = 'row err'; out.textContent = (res && res.error) || 'It did not work.'; }
    } catch (err) {
      out.className = 'row err';
      out.textContent = err.message || 'It did not work.';
    }
    btn.disabled = false;
    render();
    renderRecording();
  });
}

wire('testTrade', 'testTrade',
  'Starting a test trade…',
  'Started. Three pictures over the next 90 seconds — opening, middle, close. They are marked as a test and will not touch your real trades.');
wire('checkNow', 'checkNow', 'Checking…', 'Checked.');

// Recording is one press for the whole session, not one per trade. While
// it is on, every trade that opens and closes is cut out of it and sent on
// its own -- he does nothing.
async function renderRecording() {
  const btn = document.getElementById('recordToggle');
  const out = document.getElementById('recordResult');
  let state = { recording: false };
  try { state = await chrome.runtime.sendMessage({ type: 'recorderState' }) || state; } catch (e) {}
  const { lastClippedCount, lastRecorderFault } = await chrome.storage.local.get(['lastClippedCount', 'lastRecorderFault']);
  if (state.recording) {
    btn.textContent = 'Stop recording';
    const held = state.heldSeconds ? `${Math.round(state.heldSeconds / 60)} min held` : 'just started';
    out.className = 'row ok';
    out.textContent = `Recording this tab — ${held}.`;
  } else {
    btn.textContent = 'Start recording my charts';
    out.className = 'row';
    out.textContent = 'Not recording. Open your chart, then press this once — it covers every trade until you stop it.';
  }
  // A reason, never a blank. If a clip was turned away, that is said here
  // rather than left to be noticed by a recording never appearing.
  const fault = lastRecorderFault || state.lastFault;
  if (fault) {
    out.className = 'row err';
    out.textContent = fault;
  } else if (lastClippedCount) {
    out.textContent += ` ${lastClippedCount} recording(s) sent on the last check.`;
  }
}

document.getElementById('recordToggle').addEventListener('click', async () => {
  const btn = document.getElementById('recordToggle');
  const out = document.getElementById('recordResult');
  let state = { recording: false };
  try { state = await chrome.runtime.sendMessage({ type: 'recorderState' }) || state; } catch (e) {}
  btn.disabled = true;
  out.className = 'row';
  out.textContent = state.recording ? 'Stopping…' : 'Starting…';
  try {
    const res = await chrome.runtime.sendMessage({ type: state.recording ? 'stopRecording' : 'startRecording' });
    if (!res || !res.ok) { out.className = 'row err'; out.textContent = (res && res.error) || 'It did not work.'; }
  } catch (err) {
    out.className = 'row err';
    out.textContent = err.message || 'It did not work.';
  }
  // The mark on the icon is refreshed straight away rather than left
  // stale until the next check a minute later.
  try { await chrome.runtime.sendMessage({ type: 'nudgeNow' }); } catch (e) {}
  btn.disabled = false;
  renderRecording();
});

document.getElementById('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
renderRecording();
