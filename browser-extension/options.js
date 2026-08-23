const backendUrlInput = document.getElementById('backendUrl');
const appKeyInput = document.getElementById('appKey');
const statusEl = document.getElementById('status');

async function load() {
  const { backendUrl, appKey } = await chrome.storage.local.get(['backendUrl', 'appKey']);
  if (backendUrl) backendUrlInput.value = backendUrl;
  if (appKey) appKeyInput.value = appKey;
}

document.getElementById('save').addEventListener('click', async () => {
  const backendUrl = backendUrlInput.value.trim();
  const appKey = appKeyInput.value.trim();
  await chrome.storage.local.set({ backendUrl, appKey });
  statusEl.textContent = 'Saved.';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
});

load();
