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
    lines.push(`<div class="row err">Last error: ${lastError}</div>`);
  } else {
    lines.push(`<div class="row ok">Connected, no errors.</div>`);
  }
  if (lastEventCount != null) {
    lines.push(`<div class="row">Last check found <b>${lastEventCount}</b> trade event(s), captured <b>${lastCapturedCount ?? 0}</b>.</div>`);
  }
  content.innerHTML = lines.join('');
}

document.getElementById('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
