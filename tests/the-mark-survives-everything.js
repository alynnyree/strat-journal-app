// HE REPORTED SEEING NO MARK ON THE ICON, AND HE WAS RIGHT TO.
//
// The red "!" exists for exactly one purpose: to say "your trades are not
// being filmed". It was set inside maybeNudge, which is only reached after
// the settings have been read AND the server has answered. So it went
// SILENT precisely when something else was wrong too -- an address not
// filled in, a service asleep, no connection at all. The one mark meant to
// survive a bad day was the first thing a bad day removed.
//
// Whether a recording is running is a purely local fact. It needs no
// address, no key and no server.
//
// This runs the REAL pollAndCapture out of background.js against a
// stand-in Chrome, down every way out of it, and asserts the mark was set
// before anything could fail.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

const EXT = path.join(__dirname, '..', 'browser-extension');
const coreSrc = fs.readFileSync(path.join(EXT, 'recorder-core.js'), 'utf8');
const bgSrc = fs.readFileSync(path.join(EXT, 'background.js'), 'utf8');

// One run of the real code, with everything it touches replaced by a
// stand-in that records what was asked of it.
async function run(opts){
  const o = opts || {};
  const badge = [];          // every text the icon was given, in order
  const notifications = [];
  const stored = { openTrades: {} };
  let settingsRead = false, fetched = 0;

  const chrome = {
    action: {
      setBadgeText: async ({ text }) => {
        if (o.badgeThrows) throw new Error('no badge on this browser');
        badge.push(text);
      },
      setBadgeBackgroundColor: async () => {},
    },
    notifications: { create: async (id, n) => { notifications.push(n); } },
    storage: { local: {
      get: async (keys) => {
        const out = {};
        for (const k of [].concat(keys)) if (k in stored) out[k] = stored[k];
        return out;
      },
      set: async (obj) => { Object.assign(stored, obj); },
    }},
    alarms: { create(){}, get: async () => null, onAlarm: { addListener(){} } },
    runtime: { onInstalled:{addListener(){}}, onStartup:{addListener(){}},
               onMessage:{addListener(){}}, sendMessage: async () => ({ ok:false }) },
    tabs: { query: async () => [] },
    offscreen: { hasDocument: async () => o.recording === true, createDocument: async () => {},
                 closeDocument: async () => {} },
    tabCapture: {},
    scripting: {},
  };

  const sandbox = {
    chrome, console: { log(){}, warn(){}, error(){} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextDecoder, TextEncoder, Date, Math, JSON,
    fetch: async () => {
      fetched++;
      if (o.unreachable) throw new Error('Load failed');
      if (o.serverStatus && o.serverStatus !== 200) return { ok:false, status:o.serverStatus };
      return { ok:true, status:200, json: async () => ({ events: o.events || [] }) };
    },
    FormData: class { append(){} },
    Blob: class { constructor(){ this.size = 1; } },
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(coreSrc, sandbox, { filename: 'recorder-core.js' });
  vm.runInContext(bgSrc, sandbox, { filename: 'background.js' });

  // The settings the add-on reads. Overridden after load so the real
  // getSettings is exercised.
  stored.backendUrl = o.backendUrl === undefined ? 'https://example.test' : o.backendUrl;
  stored.appKey = o.appKey === undefined ? 'k' : o.appKey;

  // A recorder that says it is running, when the case wants one.
  sandbox.chrome.runtime.sendMessage = async (msg) =>
    msg && msg.type === 'state' ? { recording: o.recording === true } : { ok:true };

  try { await sandbox.pollAndCapture(); } catch (e) { /* the point is what the icon says */ }
  return { badge, notifications, fetched, stored };
}

(async () => {

  console.log('--- his exact case: the add-on has no address yet ---');
  {
    // A freshly installed copy from the store, options never filled in.
    // This is the likeliest reason he saw nothing, and it is the case where
    // the mark matters MOST -- nothing at all is being captured.
    const r = await run({ backendUrl: '', appKey: '', recording: false });
    check(`the mark is still set (${JSON.stringify(r.badge)})`, r.badge.includes('!'));
    check('and nothing was even asked of the service', r.fetched === 0);
  }

  console.log('\n--- the service cannot be reached ---');
  {
    const r = await run({ unreachable: true, recording: false });
    check(`the mark is still set (${JSON.stringify(r.badge)})`, r.badge.includes('!'));
  }

  console.log('\n--- the service refuses the key ---');
  {
    const r = await run({ serverStatus: 403, recording: false });
    check(`the mark is still set (${JSON.stringify(r.badge)})`, r.badge.includes('!'));
  }

  console.log('\n--- everything working, nothing recording ---');
  {
    const r = await run({ recording: false, events: [] });
    check(`the mark is set (${JSON.stringify(r.badge)})`, r.badge.includes('!'));
  }

  console.log('\n--- everything working, and it IS recording ---');
  {
    const r = await run({ recording: true, events: [] });
    check(`the mark is CLEARED, not left on (${JSON.stringify(r.badge)})`,
      r.badge.length > 0 && r.badge.every(t => t === ''));
    check('no reminder is shown while it is recording', r.notifications.length === 0);
  }

  console.log('\n--- the mark comes FIRST, before anything that can fail ---');
  {
    // The whole point: it must not be the last thing in a chain of things
    // that can each go wrong.
    const r = await run({ unreachable: true, recording: false });
    check('it was set even though the very next step threw', r.badge[0] === '!');
  }

  console.log('\n--- and the quiet reminder survives a missing address too ---');
  {
    // Not the urgent one -- that genuinely needs the service to know a
    // trade opened. But "you are not recording and the market is open" is
    // knowable with nothing but a clock.
    const r = await run({ backendUrl: '', appKey: '', recording: false });
    const ok = r.notifications.length === 0 || r.notifications.length === 1;
    check(`at most one box, never a pile (${r.notifications.length})`, ok);
  }

  console.log('\n--- what it was asked to show is written down ---');
  {
    // He reported a bare icon and there was no way to tell whether the mark
    // had never been asked for, been asked for and refused, or been put
    // there and not noticed. Three faults, and finding out cost an upload
    // and a store review each time.
    const r = await run({ backendUrl: '', appKey: '', recording: false });
    check(`it records what it asked for (${r.stored.lastBadge})`, r.stored.lastBadge === '!');
    check('and when', typeof r.stored.lastBadgeAt === 'number' && r.stored.lastBadgeAt > 0);
    check('and no fault, because there was none', r.stored.lastBadgeFault === null);
  }
  {
    const r = await run({ recording: true, events: [] });
    check(`recording is recorded as clear (${r.stored.lastBadge})`, r.stored.lastBadge === 'clear');
  }

  console.log('\n--- a mark the browser refuses is not a silent one ---');
  {
    const r = await run({ recording: false, badgeThrows: true });
    check('the refusal is written down: ' + r.stored.lastBadgeFault,
      !!r.stored.lastBadgeFault && /could not be put on the icon/i.test(r.stored.lastBadgeFault));
    check('and it did not take the rest of the check down with it', r.fetched > 0);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
