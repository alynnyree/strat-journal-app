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
  const { backendUrl, appKey, lastPollAt, lastError, lastEventCount, lastCapturedCount } =
    await chrome.storage.local.get(['backendUrl', 'appKey', 'lastPollAt', 'lastError', 'lastEventCount', 'lastCapturedCount']);

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
  });
}

wire('testShot', 'testShot', 'Taking a picture…', 'Sent. It will not attach to a trade — that is expected.');
wire('checkNow', 'checkNow', 'Checking…', 'Checked.');

document.getElementById('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
