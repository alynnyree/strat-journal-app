// Runs EVERY check in tests/ and decides, in one place, whether the app may
// go live. Used by the automatic checks on GitHub (Blocker 1, 30 Sept 2026).
//
// A run fails when:
//   - a check reports a FAIL line that is not on known-failures.json
//   - a check on that list has a failure that has STOPPED happening
//     (take it off the list in the same change, so the list stays true)
//   - a check crashes, or ends badly with no FAIL line to say why
//   - a check stalls past its time limit
//   - a check SKIPS because there is no browser. On this project most
//     checks print "SKIPPED" and end as a success when the browser is
//     missing, so without this rule a machine with no browser would pass
//     every check while testing nothing.
// Skipping the checks that need HIS real data is expected and allowed: that
// data is never put in this public project.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TESTS = path.join(__dirname, '..');
const known = JSON.parse(fs.readFileSync(path.join(__dirname, 'known-failures.json'), 'utf8'));
const LIMIT_MS = 10 * 60 * 1000;
const REAL_DATA_SKIP = /real[- ]data|is not on this machine, so|broker export is not on this machine|exported journal is not on this machine/i;
// A failure's own words, without the FAIL marker. A known failure is matched
// on how it STARTS, because what follows (a figure in brackets, ": null",
// "-> ...") varies with the date and the data.
const text = line => line.replace(/^(FAIL|✗):?\s*/, '').trim();
const isKnown = (line, k) => { const t = text(line); return t === k || t.startsWith(k + ' ') || t.startsWith(k + ':'); };

function run(file){
  return new Promise(resolve => {
    const child = spawn(process.execPath, [file], { cwd: path.join(TESTS, '..'), env: process.env });
    let out = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => out += d);
    const timer = setTimeout(() => { out += '\nSTALLED past the time limit'; child.kill('SIGKILL'); }, LIMIT_MS);
    child.on('close', code => { clearTimeout(timer); resolve({ code, out }); });
  });
}

(async () => {
  const only = process.argv.slice(2);
  const files = fs.readdirSync(TESTS)
    .filter(f => f.endsWith('.js') && f !== 'browser.js')
    .filter(f => !only.length || only.includes(f.replace(/\.js$/, '')))
    .sort();
  const problems = [];
  for(const f of files){
    const name = f.replace(/\.js$/, '');
    const t0 = Date.now();
    const { code, out } = await run(path.join(TESTS, f));
    const lines = out.split('\n');
    const fails = lines.filter(l => /^(FAIL|✗)/.test(l));
    const skips = lines.filter(l => /^SKIPPED/.test(l) && !REAL_DATA_SKIP.test(l));
    const expected = known[name] || [];
    const unexpected = fails.filter(l => !expected.some(k => isKnown(l, k)));
    const gone = expected.filter(k => !fails.some(l => isKnown(l, k)));
    const mine = [];
    unexpected.forEach(l => mine.push('new failure: ' + l.slice(0, 200)));
    gone.forEach(k => mine.push(`listed as a known failure but it now PASSES -- take it off tests/ci/known-failures.json: "${k}"`));
    skips.forEach(l => mine.push('did not run: ' + l.slice(0, 200)));
    if(/STALLED past the time limit/.test(out)) mine.push('stalled past ' + LIMIT_MS / 60000 + ' minutes');
    if(/TEST CRASHED/.test(out)) mine.push('crashed: ' + (lines.find(l => /TEST CRASHED/.test(l)) || '').slice(0, 200));
    if(code !== 0 && !fails.length) mine.push(`ended badly (exit ${code}) with no FAIL line to say why: ` + lines.filter(Boolean).slice(-3).join(' | ').slice(0, 300));
    const total = (lines.find(l => /\d+ passed/.test(l)) || '').trim();
    const secs = Math.round((Date.now() - t0) / 1000);
    console.log(`${mine.length ? 'PROBLEM' : 'ok     '}  ${name.padEnd(42)} ${total}${expected.length ? `  (known failures: ${expected.length})` : ''}  ${secs}s`);
    mine.forEach(m => console.log('           ' + m));
    if(mine.length) problems.push(name);
  }
  console.log(`\n${files.length} check files run; ${problems.length} with problems${problems.length ? ': ' + problems.join(', ') : ''}`);
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.log('RUNNER CRASHED:', e); process.exit(1); });
