// Finds Playwright and the Chromium that is already on the machine.
//
// These tests drive the real page in a real browser, which is the only way to
// check what the app actually does. Playwright is not part of this project, so
// it is looked for in a few likely places and the reason is said plainly when
// it is not there -- never a stack trace, and never a silent pass.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHROMIUM = ['/opt/pw-browsers/chromium', process.env.CHROMIUM_PATH].filter(Boolean);

function findPlaywright(){
  const tried = [];
  const guesses = [];
  if(process.env.PLAYWRIGHT_DIR) guesses.push(path.join(process.env.PLAYWRIGHT_DIR, 'playwright'));
  guesses.push('playwright');
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
    if(root) guesses.push(path.join(root, 'playwright'));
  } catch(e){ /* no npm on the path is not fatal */ }
  for(const g of guesses){
    tried.push(g);
    try { return { playwright: require(g), from: g, tried }; } catch(e){ /* try the next */ }
  }
  return { playwright: null, from: null, tried };
}

// Either a launched browser, or the reason there isn't one.
async function launch(){
  const found = findPlaywright();
  if(!found.playwright){
    return { browser: null, reason: `Playwright is not on this machine (looked in: ${found.tried.join(', ')}). `
      + `Install it, or set PLAYWRIGHT_DIR to the folder holding it.` };
  }
  const exe = CHROMIUM.find(p => { try { return fs.existsSync(p); } catch(e){ return false; } });
  try {
    const browser = await found.playwright.chromium.launch(exe ? { executablePath: exe } : {});
    return { browser, reason: null };
  } catch(e){
    return { browser: null, reason: `Playwright is here but the browser would not start: ${e.message}` };
  }
}

// Serves the app off disk so a test does not depend on something already
// running. Returns the address to open and a way to stop it.
function serve(){
  const http = require('http');
  const root = path.join(__dirname, '..');
  const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml',
                  '.woff2':'font/woff2', '.ico':'image/x-icon' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(String(req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if(!file.startsWith(root)){ res.writeHead(403); res.end('no'); return; }
    fs.readFile(file, (err, body) => {
      if(err){ res.writeHead(404); res.end('not here'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    resolve({ base: `http://127.0.0.1:${server.address().port}`, stop: () => server.close() });
  }));
}

module.exports = { launch, serve };
