// Everything the store checks BEFORE it will even accept the upload.
//
// It refused the package once already, and it cost him a round: "The
// description field in manifest is too long: 181. It exceeds maximum size
// limit of 132 characters."
//
// The cause was that there are TWO descriptions and they are different
// fields with different limits -- the long one pasted into the store's own
// form, and a short one that lives INSIDE the package. I checked the first
// against its limit and never checked the second.
//
// A limit that is only known to the far end is a limit that gets broken. So
// every rule the store applies on upload is checked here, all of them
// together, rather than one per failed attempt.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXT = path.join(__dirname, '..', 'browser-extension');
const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));

let pass = 0, fail = 0;
const check = (l, c) => { if(c){ pass++; console.log('PASS:', l); } else { fail++; console.log('FAIL:', l); } };

console.log('--- what the store measures ---');
check('it is the current kind of add-on', m.manifest_version === 3);
check(`the name fits (${m.name.length} of 45)`, m.name.length <= 45);
// The one that actually bounced.
check(`the description INSIDE the package fits (${m.description.length} of 132)`, m.description.length <= 132);
check('...and is not empty, which is also refused', String(m.description).trim().length > 0);
check(`the version is a shape it accepts (${m.version})`, /^\d+(\.\d+){0,3}$/.test(m.version));
check('...with no number too large', m.version.split('.').every(n => Number(n) <= 65535));
check('there is no key of its own — the store assigns one', !('key' in m));
check('there is no update address — the store is the updater now', !('update_url' in m));
check('it has icons', !!m.icons && Object.keys(m.icons).length > 0);

console.log('\n--- everything it points at is actually there ---');
const refs = new Set([
  m.background.service_worker,
  m.action.default_popup,
  m.options_page,
  ...Object.values(m.icons),
  ...Object.values(m.action.default_icon),
]);
for(const r of [...refs].sort()){
  check(`${r} is in the folder`, fs.existsSync(path.join(EXT, r)));
}

console.log('\n--- and nothing in it that gets a package refused ---');
const walk = (dir, out = []) => {
  for(const e of fs.readdirSync(dir, { withFileTypes: true })){
    const p = path.join(dir, e.name);
    if(e.isDirectory()) walk(p, out); else out.push(path.relative(EXT, p));
  }
  return out;
};
const files = walk(EXT);
const junk = files.filter(f => /(^|\/)\.DS_Store$|__MACOSX|\.map$|(^|\/)\.git/.test(f));
check(`no stray files shipped (${files.length} files)`, junk.length === 0);

// Code fetched from the internet is a straight rejection, and it is easy to
// add one without noticing.
const remote = [];
for(const f of files.filter(f => /\.(js|html)$/.test(f))){
  const body = fs.readFileSync(path.join(EXT, f), 'utf8');
  for(const hit of body.matchAll(/<script[^>]+src=["']https?:\/\//g)) remote.push(`${f}`);
}
check('nothing loads code from the internet', remote.length === 0);

// Every file has to actually run.
let broke = null;
for(const f of files.filter(f => f.endsWith('.js'))){
  try { execSync(`node --check ${JSON.stringify(path.join(EXT, f))}`, { stdio: 'pipe' }); }
  catch(e){ broke = f; }
}
check(`every piece of it parses${broke ? ' — ' + broke + ' does not' : ''}`, broke === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
