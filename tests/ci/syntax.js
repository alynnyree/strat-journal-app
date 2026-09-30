// Every script in the app must at least PARSE, checked by the real parser.
//
// Brace counting is not a check (project notes, "Testing expectations"). This
// compiles each inline <script> block in index.html and every file of the
// laptop add-on, and fails naming the one that does not parse.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
let bad = 0, ok = 0;

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
blocks.forEach((code, i) => {
  try { new vm.Script(code, { filename: `index.html script block ${i + 1}` }); ok++; }
  catch(e){ bad++; console.log(`FAIL: index.html script block ${i + 1} does not parse: ${e.message}`); }
});
if(!blocks.length){ bad++; console.log('FAIL: found no script blocks in index.html at all'); }

const ext = path.join(root, 'browser-extension');
for(const f of fs.readdirSync(ext).filter(f => f.endsWith('.js'))){
  try { execFileSync(process.execPath, ['--check', path.join(ext, f)], { stdio: 'pipe' }); ok++; }
  catch(e){ bad++; console.log(`FAIL: browser-extension/${f} does not parse: ${String(e.stderr || e.message).split('\n').slice(0, 4).join(' ')}`); }
}

console.log(`\n${ok} parsed, ${bad} failed`);
process.exit(bad ? 1 : 0);
