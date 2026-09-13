// The add-on may photograph ONE site, and must SAY SO when it cannot.
//
// It used to be allowed every website he has ever visited. Three things
// wrong with that, and they are different problems:
//
//   1. A trade closing while his email was on screen filed a picture of his
//      email against that trade, stamped with the trade's own time and
//      looking entirely real. A missing picture is recoverable; a wrong one
//      is evidence.
//   2. Chrome told him, on installing his OWN tool, that it could "read and
//      change all your data on all websites".
//   3. Since 1 August 2026 the store requires permissions to be the minimum
//      the stated purpose needs, so it would have been rejected.
//
// The guard is kept in the code as well as in the manifest, so the reason
// can be said. Chrome simply refuses the call otherwise, and a refusal
// nobody can read is the dead end this project keeps hitting.
const path = require('path');
const bg = require(path.join(__dirname, '..', 'browser-extension', 'background.js'));
const manifest = require(path.join(__dirname, '..', 'browser-extension', 'manifest.json'));

let pass = 0, fail = 0;
const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

console.log('--- what the add-on asks Chrome for ---');
check('it no longer asks for every website',
  !JSON.stringify(manifest.host_permissions).includes('all_urls'));
check(`it asks for TradingView and nothing else (${JSON.stringify(manifest.host_permissions)})`,
  manifest.host_permissions.length === 1 && manifest.host_permissions[0] === 'https://*.tradingview.com/*');
// activeTab covers the tab he is looking at AT THE MOMENT HE PRESSES A
// BUTTON, which is what starting a recording is.
check('it asks for the tab he is on when he presses a button',
  manifest.permissions.includes('activeTab'));
check('it still asks to record a tab', manifest.permissions.includes('tabCapture'));
check('the version moved, so he can see the new copy landed', /^1\.[3-9]|^[2-9]\./.test(manifest.version));

// THE STORE REFUSED THE PACKAGE OVER THIS, and it cost him a round.
//
// There are TWO descriptions and they are different fields with different
// limits: the long one pasted into the store's own form, and this one,
// which lives INSIDE the package. I checked the first against its limit and
// never checked the second, so he uploaded it and was handed
// "The description field in manifest is too long: 181. It exceeds maximum
// size limit of 132 characters."
//
// A limit that is only known to the far end is a limit that gets broken.
check(`the description inside the package fits the store's limit (${manifest.description.length} of 132)`,
  manifest.description.length <= 132);
check('...and is not empty, which the store also refuses',
  typeof manifest.description === 'string' && manifest.description.trim().length > 0);
// The name has its own, much shorter limit.
check(`the name fits too (${manifest.name.length} of 45)`, manifest.name.length <= 45);
// A version the store will accept: up to four whole numbers, dots between.
check(`the version is a shape the store accepts (${manifest.version})`,
  /^\d+(\.\d+){0,3}$/.test(manifest.version));

console.log('\n--- which pages count as his chart ---');
const yes = [
  'https://www.tradingview.com/chart/abc123/',
  'https://tradingview.com/chart/',
  'https://uk.tradingview.com/chart/xyz/',
  'https://www.tradingview.com/chart/?symbol=SPY',
];
for(const u of yes) check(`his chart: ${u}`, bg.isChartTab(u) === true);

const no = [
  'https://mail.google.com/mail/u/0/',
  'https://client.schwab.com/app/trade',
  'https://www.tradingview.com.evil.example.com/chart/',  // not TradingView at all
  'http://www.tradingview.com/chart/',                     // not the secure address
  'https://nottradingview.com/chart/',
  'chrome://extensions/',
  '',
  undefined,
  null,
];
for(const u of no) check(`not his chart: ${JSON.stringify(u)}`, bg.isChartTab(u) === false);

console.log('\n--- and it says so, rather than coming up empty ---');
(async () => {
  // Stands in for the browser. The only thing being checked here is what
  // comes back when the tab on screen is not his chart.
  let currentTab = { id: 1, windowId: 1, url: 'https://mail.google.com/' };
  global.chrome = {
    tabs: {
      query: async () => [currentTab],
      captureVisibleTab: async () => { throw new Error('Chrome would have refused this'); },
    },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: { sendMessage: async () => ({ ok: true }) },
    tabCapture: { getMediaStreamId: async () => 'stream-1' },
    offscreen: { hasDocument: async () => true, createDocument: async () => {}, closeDocument: async () => {} },
    // The file wires itself up to the browser when it loads. None of that
    // is what is being checked here, so it is stood in for and ignored.
    alarms: { create(){}, get: async () => ({}), onAlarm: { addListener(){} } },
  };
  global.chrome.runtime.onMessage = { addListener(){} };
  global.chrome.runtime.onInstalled = { addListener(){} };
  global.chrome.runtime.onStartup = { addListener(){} };

  // Re-read the file with chrome in place, the way it runs for real.
  delete require.cache[require.resolve(path.join(__dirname, '..', 'browser-extension', 'background.js'))];
  const live = require(path.join(__dirname, '..', 'browser-extension', 'background.js'));

  let said = null;
  try { await live.startRecording(); } catch (e) { said = e.message; }
  check('recording on the wrong tab is refused', said !== null);
  check(`...and names WHICH tab to open (${said})`, /TradingView/i.test(said || ''));
  check('...in plain words, with nothing raw from Chrome in it',
    !/(undefined|null|Error:|permission|manifest)/i.test(said || ''));

  currentTab = { id: 1, windowId: 1, url: 'https://www.tradingview.com/chart/abc/' };
  let ok = null;
  try { await live.startRecording(); ok = 'started'; } catch (e) { ok = e.message; }
  check(`recording on his chart is allowed (${ok})`, ok === 'started');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
