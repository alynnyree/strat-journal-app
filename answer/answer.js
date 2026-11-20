// Strat Setups: his play and timeframe, the moment he buys (Step 1B,
// authorised 15 Nov 2026). This page talks ONLY to /purchases on his
// journal's service: it never asks for, collects or removes a trade.
//
// One logical answer has ONE answer id, kept as a draft on this device until
// the service confirms it -- so a reply lost on the way back, or a reload,
// retries the SAME answer rather than creating a second one (plan v4, B2).
// A different choice is a different answer and gets a new id. "Saved" is
// shown only when the service has confirmed this exact answer.
//
// The journal itself loads this file too, to save an answer asked on a trade
// card the same way (configure() hands it the journal's connection).
(function () {
  const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', 'Daily', 'Weekly', 'Monthly', '3 Month', '6 Month', 'Yearly'];
  const PLAYS = ['Broadening Formation Scalp', 'FTFC Direction Play', '2s Turning Into 3s', 'None of these'];
  const BF = 'Broadening Formation Scalp';
  const LS = { url: 'strat_answer_service', key: 'strat_answer_key', device: 'strat_answer_device', drafts: 'strat_answer_drafts' };
  const DEFAULT_URL = 'https://strat-journal-backend.onrender.com';
  const TIMEOUT_MS = 15000;

  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode: still works for this visit */ } },
  };
  // The journal uses the same saving code with ITS connection (configure).
  // On the same site as his journal, the journal's own saved connection is
  // used when this page has none of its own (opened from the journal's Home
  // line, nothing has to be typed in again).
  let over = null;
  const serviceUrl = () => ((over && over.url && over.url()) || ls.get(LS.url) || ls.get('strat_backend_url') || DEFAULT_URL).replace(/\/+$/, '');
  const appKey = () => (over && over.key && over.key()) || ls.get(LS.key) || ls.get('strat_app_key') || '';
  function configure(o) { over = o || null; }

  function newId() {
    const a = new Uint8Array(14);
    (self.crypto || window.crypto).getRandomValues(a);
    return 'a' + Array.from(a, b => (b % 36).toString(36)).join('');
  }
  function deviceId() {
    let d = ls.get(LS.device);
    if (!d) { d = 'd' + newId().slice(1); ls.set(LS.device, d); }
    return d;
  }
  const deviceLabel = () => (/iPhone|iPad|Android/i.test(navigator.userAgent) ? 'phone' : 'laptop');

  function drafts() { try { return JSON.parse(ls.get(LS.drafts) || '{}') || {}; } catch (e) { return {}; } }
  function setDraft(fill, d) { const all = drafts(); all[fill] = d; ls.set(LS.drafts, JSON.stringify(all)); }
  function clearDraft(fill) { const all = drafts(); delete all[fill]; ls.set(LS.drafts, JSON.stringify(all)); }
  const sigOf = c => [c.play, c.timeframe, c.formationTimeframe || '', c.replaces || ''].join('|');

  // One request. Never throws: a failure comes back as { ok:false, why }.
  async function call(path, { method = 'GET', body } = {}) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetch(serviceUrl() + path, {
        method, signal: ctl ? ctl.signal : undefined,
        headers: Object.assign({ Authorization: 'Bearer ' + appKey() }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      return { ok: res.ok, status: res.status, body: data };
    } catch (e) {
      return { ok: false, status: 0, body: null, why: 'could not reach your journal\'s service' };
    } finally { if (timer) clearTimeout(timer); }
  }

  // The one way an answer is saved. -> { state: 'saved'|'conflict'|'not-saved', entry, current, why }
  async function saveAnswer(fill, choices, replaces) {
    const c = { play: choices.play, timeframe: choices.timeframe, formationTimeframe: choices.play === BF ? (choices.formationTimeframe || null) : null, replaces: replaces || null };
    const sig = sigOf(c);
    let d = drafts()[fill];
    if (!d || d.sig !== sig) { d = { answerId: newId(), sig, c }; }
    setDraft(fill, d);
    const r = await call('/purchases/answer', { method: 'POST', body: {
      fillId: fill, answerId: d.answerId, play: c.play, timeframe: c.timeframe,
      formationTimeframe: c.formationTimeframe, replaces: c.replaces, device: deviceId(), deviceLabel: deviceLabel(),
      createFrom: choices.createFrom || undefined,
    } });
    const b = r.body || {};
    if (r.ok && b.entry && b.entry.answerId === d.answerId) { clearDraft(fill); return { state: 'saved', entry: b.entry }; }
    if (r.status === 409 && b.verdict === 'REFUSED') return { state: 'conflict', current: b.entry || null };
    if (r.status === 409 && b.verdict === 'REUSED') { clearDraft(fill); return { state: 'not-saved', why: 'that answer changed while it was being saved' }; }
    if (r.status === 400) return { state: 'not-saved', why: (b.reason || 'the service refused that answer') };
    if (r.status === 404) return { state: 'not-saved', why: 'your journal\'s service does not know this purchase' };
    return { state: 'not-saved', why: r.why || 'your journal\'s service did not confirm it' };
  }

  // ---- pop-ups on this device (Web Push) --------------------------------
  function urlB64ToBytes(s) {
    const pad = '='.repeat((4 - s.length % 4) % 4);
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, ch => ch.charCodeAt(0));
  }
  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
      return { ok: false, why: 'this browser cannot show pop-ups from a web page (on an iPhone: open this page from its icon on your home screen)' };
    }
    const k = await call('/purchases/push/key');
    if (!k.ok || !k.body || !k.body.publicKey) return { ok: false, why: (k.body && k.body.reason) || k.why || 'your journal\'s service did not hand over its pop-up key' };
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, why: 'pop-ups were not allowed on this device' };
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(k.body.publicKey) });
    const r = await call('/purchases/push/subscribe', { method: 'POST', body: { device: deviceId(), deviceLabel: deviceLabel(), subscription: sub.toJSON() } });
    return r.ok ? { ok: true } : { ok: false, why: r.why || 'your journal\'s service did not keep it' };
  }

  function contractLabel(p) {
    const occ = String(p.occ || '');
    const m = occ.match(/^(\S+)\s*(\d{6})([CP])(\d{8})$/);
    if (!m) return (p.ticker || occ || 'Purchase') + (p.dir ? ' · ' + p.dir : '');
    const strike = Number(m[4]) / 1000;
    return `${m[1]} ${strike % 1 ? strike.toFixed(1) : strike} ${m[3] === 'C' ? 'Call' : 'Put'}${p.dir ? ' · ' + p.dir : ''}`;
  }
  const whenLabel = ms => Number.isFinite(Number(ms))
    ? 'Bought ' + new Date(Number(ms)).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

  // ---- the screen --------------------------------------------------------
  const $ = id => document.getElementById(id);
  let current = null, picked = {}, conflictWith = null;

  function show(view) { ['setupView', 'listView', 'formView'].forEach(v => { $(v).hidden = v !== view; }); }
  function say(text, kind) { const s = $('status'); s.textContent = text || ''; s.className = 'status ' + (kind || ''); }

  function chips(el, list, selected, onPick) {
    el.innerHTML = '';
    for (const v of list) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (v === selected ? ' sel' : ''); b.dataset.v = v; b.textContent = v;
      b.addEventListener('click', () => onPick(v));
      el.appendChild(b);
    }
  }
  function drawForm() {
    chips($('plays'), PLAYS, picked.play, v => { picked.play = v; conflictWith = null; $('replace').hidden = true; drawForm(); });
    chips($('timeframes'), TIMEFRAMES, picked.timeframe, v => {
      picked.timeframe = v;
      if (picked.formationTimeframe && TIMEFRAMES.indexOf(picked.formationTimeframe) <= TIMEFRAMES.indexOf(v)) picked.formationTimeframe = null;
      conflictWith = null; $('replace').hidden = true; drawForm();
    });
    const bf = picked.play === BF;
    $('formationWrap').hidden = !bf;
    // The formation is drawn on a LARGER timeframe than the one he entered on.
    if (bf) chips($('formations'), TIMEFRAMES.slice(Math.max(1, TIMEFRAMES.indexOf(picked.timeframe) + 1)), picked.formationTimeframe, v => { picked.formationTimeframe = v; drawForm(); });
    $('save').disabled = !(picked.play && picked.timeframe && (!bf || picked.formationTimeframe));
  }
  function openForm(p) {
    current = p; conflictWith = null;
    const d = drafts()[p.fillId];
    picked = d && d.c ? { play: d.c.play, timeframe: d.c.timeframe, formationTimeframe: d.c.formationTimeframe } : {};
    $('tradeLine').textContent = contractLabel(p);
    $('tradeWhen').textContent = whenLabel(p.openTimestamp);
    $('replace').hidden = true;
    say('');
    show('formView');
    drawForm();
  }
  async function drawList() {
    show('listView');
    const list = $('list');
    list.innerHTML = '<div class="dim">Looking…</div>';
    const r = await call('/purchases/waiting');
    if (!r.ok) { list.innerHTML = ''; const d = document.createElement('div'); d.className = 'dim'; d.textContent = 'Could not ask your journal\'s service what is waiting (' + (r.why || 'it answered ' + r.status) + ').'; list.appendChild(d); return []; }
    const items = (r.body && r.body.waiting) || [];
    list.innerHTML = '';
    if (!items.length) { list.innerHTML = '<div class="dim">Nothing waiting. Every purchase has its answer.</div>'; return items; }
    for (const p of items) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'row';
      b.innerHTML = '<b></b><span></span>';
      b.querySelector('b').textContent = contractLabel(p);
      b.querySelector('span').textContent = whenLabel(p.openTimestamp);
      b.addEventListener('click', () => openForm(p));
      list.appendChild(b);
    }
    return items;
  }
  async function onSave(replaces) {
    if (!current) return;
    $('save').disabled = true; $('replace').hidden = true;
    say('Saving…', 'warn');
    const r = await saveAnswer(current.fillId, picked, replaces);
    drawForm();
    if (r.state === 'saved') {
      const e = r.entry;
      say(`Saved: ${e.play} on the ${e.timeframe}${e.formationTimeframe ? ` (formation ${e.formationTimeframe})` : ''}.`, 'ok');
    } else if (r.state === 'conflict') {
      conflictWith = r.current;
      const c = r.current || {};
      say(`Already answered on your other device: ${c.play || '?'} on the ${c.timeframe || '?'}${c.formationTimeframe ? ` (formation ${c.formationTimeframe})` : ''}. Nothing was changed. Tap "Replace it" to use this answer instead.`, 'warn');
      $('replace').hidden = !(c && c.answerId);
    } else {
      say(`Not saved -- ${r.why}. Your choices are kept; tap Save again.`, 'bad');
    }
  }

  async function start() {
    if (!appKey()) {
      $('svc').value = serviceUrl();
      show('setupView');
      return;
    }
    const fill = new URLSearchParams(location.search).get('fill');
    const items = await drawList();
    if (fill) {
      const p = items.find(x => x.fillId === fill);
      if (p) openForm(p);
      else {
        const a = await call('/purchases/?fills=' + encodeURIComponent(fill));
        const got = a.ok && a.body && a.body.answers && a.body.answers[fill];
        if (got && got.answer) say(`That purchase already has an answer: ${got.answer.play} on the ${got.answer.timeframe}.`, 'ok');
      }
    }
    $('pushRow').hidden = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  }

  function wire() {
    $('save').addEventListener('click', () => onSave(null));
    $('replace').addEventListener('click', () => onSave(conflictWith && conflictWith.answerId));
    $('notNow').addEventListener('click', drawList);
    $('skip').addEventListener('click', async () => {
      const r = await call('/purchases/skip', { method: 'POST', body: { fillId: current.fillId } });
      if (r.ok) drawList(); else say('Not skipped -- could not reach your journal\'s service.', 'bad');
    });
    $('saveSetup').addEventListener('click', () => {
      ls.set(LS.url, $('svc').value.trim() || DEFAULT_URL);
      ls.set(LS.key, $('key').value.trim());
      start();
    });
    $('enablePush').addEventListener('click', async () => {
      $('pushMsg').textContent = 'Turning on…';
      const r = await enablePush().catch(e => ({ ok: false, why: e.message }));
      $('pushMsg').textContent = r.ok ? 'Pop-ups are on for this device.' : 'Not turned on: ' + r.why;
      if (r.ok) $('pushRow').hidden = true;
    });
  }

  self.StratAnswer = { saveAnswer, sigOf, newId, drafts, deviceId, TIMEFRAMES, PLAYS, start, call, configure, contractLabel };
  // Only the answer page itself starts the screen; the journal just borrows
  // the saving code.
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('formView')) { wire(); start(); } });
  }
})();
