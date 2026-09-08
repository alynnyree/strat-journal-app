// The bottom row of buttons floating in the middle of the screen.
//
// He photographed it on 2026-09-08 with the trade list carrying on above AND
// below it. The bar is pinned to the bottom of the page, and on an iPhone
// that is not the same edge as the bottom of what he is looking at: pinching
// to zoom, and Safari's toolbar sliding in and out, move one without the
// other. These cases stand both apart on purpose and check the bar ends up
// on the edge he can see -- and, just as importantly, that it is left
// completely alone when the two agree.
const { launch, serve } = require('./browser.js');

(async () => {
  const started = await launch();
  if(!started.browser){ console.log('SKIPPED: ' + started.reason); process.exit(0); }
  const b = started.browser;
  const site = await serve();
  let pass = 0, fail = 0;
  const check = (l, c) => { if (c) { pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

  // A phone whose visible area disagrees with the page's own idea of it.
  // `seen` is what Safari says is actually on show; null means a browser
  // that cannot answer at all.
  async function phone(seen){
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript((s) => {
      if(s === null){
        Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
        return;
      }
      const listeners = { resize: [], scroll: [] };
      const fake = {
        width: s.width, height: s.height, offsetLeft: s.offsetLeft, offsetTop: s.offsetTop, scale: s.scale,
        addEventListener: (n, f) => { (listeners[n] || (listeners[n] = [])).push(f); },
        removeEventListener: () => {},
      };
      // So a case can move the visible area afterwards and see the bar follow.
      window.__moveVisible = (next) => {
        Object.assign(fake, next);
        (listeners.resize || []).forEach(f => f());
      };
      Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true });
    }, seen === null ? null : Object.assign({ width: 390, height: 844, offsetLeft: 0, offsetTop: 0, scale: 1 }, seen));
    await p.route('**/api/trades/pending', r => r.fulfill({status:200,contentType:'application/json',body:'{"pending":[]}'}));
    await p.route('**/api/trades/**', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.route(u => u.pathname === '/health', r => r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
    await p.goto(site.base + '/index.html');
    await p.evaluate(() => {
      localStorage.setItem('strat_intro', JSON.stringify({on:false,motion:false}));
      localStorage.setItem('strat_backfilled','1');
    });
    await p.reload(); await p.waitForTimeout(900);
    return { p, errors };
  }

  // Where the bar's bottom edge actually lands, and where the page thinks
  // its own bottom edge is.
  const barBottom = (p) => p.evaluate(() => {
    const bar = document.querySelector('.navbar');
    return { bottom: Math.round(bar.getBoundingClientRect().bottom),
             pageBottom: document.documentElement.clientHeight,
             moved: bar.style.transform || '(not moved)' };
  });

  {
    // The two agree. Nothing must be touched -- a fix that fidgets with a
    // bar that is already right is a new bug.
    const { p, errors } = await phone({ height: 844 });
    const r = await barBottom(p);
    check(`agreeing screen: the bar is left alone (${r.moved})`, r.moved === '(not moved)');
    check(`agreeing screen: it sits on the bottom edge (${r.bottom} of ${r.pageBottom})`, r.bottom === r.pageBottom);
    check('agreeing screen: nothing threw', errors.length === 0);
    await p.close();
  }

  {
    // What he photographed: the page believes it has more room below than is
    // really on show, so a bar on the page's bottom edge floats up the screen.
    // Here the visible area is 180 TALLER than the page's own idea, which
    // strands the bar 180 above where he can see.
    const { p, errors } = await phone({ height: 1024 });
    const r = await barBottom(p);
    check(`stranded bar: it is moved back down (${r.moved})`, /translateY\(180px\)/.test(r.moved));
    check(`stranded bar: it lands on the edge he can see (${r.bottom}, visible bottom 1024)`, r.bottom === 1024);
    check('stranded bar: nothing threw', errors.length === 0);
    await p.close();
  }

  {
    // Safari's toolbar sliding in: less is on show than the page thinks, so
    // the bar would otherwise hide underneath it.
    const { p } = await phone({ height: 700 });
    const r = await barBottom(p);
    check(`toolbar showing: the bar is lifted above it (${r.moved})`, /translateY\(-144px\)/.test(r.moved));
    check(`toolbar showing: it sits on the visible edge (${r.bottom})`, r.bottom === 700);
    await p.close();
  }

  {
    // Pinched in: the visible area is both smaller and offset down the page.
    const { p } = await phone({ height: 500, offsetTop: 200, scale: 2 });
    const r = await barBottom(p);
    check(`pinched in: the bar follows to ${r.bottom} (visible bottom 700)`, r.bottom === 700);
    await p.close();
  }

  {
    // It has to keep following, not just be right once.
    const { p } = await phone({ height: 1024 });
    await p.evaluate(() => window.__moveVisible({ height: 620, offsetTop: 0 }));
    await p.waitForTimeout(150);
    const r = await barBottom(p);
    check(`the bar follows when the visible area changes (${r.bottom})`, r.bottom === 620);
    await p.close();
  }

  {
    // A nonsense answer must never be able to throw the bar off the screen.
    // Refused outright rather than clamped: a clamp worked out from the very
    // figure being doubted lets a nonsense answer set its own limit.
    const { p, errors } = await phone({ height: 999999 });
    const r = await barBottom(p);
    check(`a nonsense figure is refused, not acted on (${r.moved})`, r.moved === '(not moved)');
    check(`and the bar stays on the page's bottom edge (${r.bottom})`, r.bottom === r.pageBottom);
    check('a nonsense figure does not throw', errors.length === 0);
    const why = await p.evaluate(() => techText().split('\n').find(l => /^screen:/.test(l)) || '');
    check(`Details says why it was left alone (${why.slice(-60)})`, /left alone — the visible bottom came back as 999999/.test(why));
    await p.close();
  }

  {
    // A browser that cannot say. Leave everything exactly as it was.
    const { p, errors } = await phone(null);
    const r = await barBottom(p);
    check(`a browser that cannot say: the bar is left alone (${r.moved})`, r.moved === '(not moved)');
    check(`a browser that cannot say: it still sits on the bottom edge (${r.bottom})`, r.bottom === r.pageBottom);
    check('a browser that cannot say: nothing threw', errors.length === 0);
    await p.close();
  }

  {
    // And the numbers reach me without reaching him: behind Details, never
    // on the page itself.
    const { p } = await phone({ height: 1024 });
    const shown = await p.evaluate(() => document.body.innerText);
    check('the screen figures are not on the page itself', !/visible 390x1024/.test(shown));
    const details = await p.evaluate(() => typeof techText === 'function' ? techText() : '');
    check(`Details reports what the screen said (${(details.split('\n').find(l=>/^screen:/.test(l))||'').slice(0,80)})`,
      /^screen: page 390x844 · visible 390x1024/m.test(details));
    check('Details says what was done about it', /bottom bar: moved 180px/.test(details));
    await p.close();
  }

  site.stop();
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
