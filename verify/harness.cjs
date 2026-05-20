// ════════════════════════════════════════════════════════════════════════════
//  harness.cjs — single-process verify runner core
//  ────────────────────────────────────────────────────────────────────────────
//  Loads the bundled desktop + mobile builds once into memory, then exposes
//  factory functions that each suite calls to get a fresh jsdom Window.
//  Compared to the old per-file process model, this saves:
//    - ~0.5-1s of Node startup per suite × 10 suites = ~5-10s
//    - ~1-2s of esbuild + fs.readFile re-work per suite × 10 = ~10-20s
//    - Hot V8 JIT caches for jsdom/htmlparser2 across suites (cumulative)
//
//  Suites convert from standalone scripts to function-exporting modules:
//
//      module.exports = {
//        name: 'altlines',
//        async run(harness) {
//          const fails = [];
//          const assert = harness.createAssert(fails);
//          const { window, doc } = await harness.createDesktopWindow({
//            bs_mock: '1', bs_alt: '1'
//          });
//          // ... assertions ...
//          return { name: 'altlines', fails };
//        }
//      };
//
//  ════════════════════════════════════════════════════════════════════════════

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const PROJ = path.resolve(__dirname, '..');

let _cache = null;
function setup() {
  if (_cache) return _cache;
  _cache = {
    desktopHtml: fs.readFileSync(path.join(PROJ, 'index.html'), 'utf8'),
    mobileHtml:  fs.readFileSync(path.join(PROJ, 'index_mobile.html'), 'utf8'),
    mockJs:      fs.readFileSync(path.join(PROJ, 'public/mock_data.js'), 'utf8'),
    desktopBundle: fs.readFileSync(path.join(PROJ, 'verify', 'bundle.js'), 'utf8'),
    mobileBundle:  fs.readFileSync(path.join(PROJ, 'verify', 'bundle_mobile.js'), 'utf8'),
  };
  return _cache;
}

// Serialize a seed object into localStorage.setItem statements. null/undefined
// values map to .removeItem so suites can explicitly unset a key. JSON-encodes
// the value so structured strings (arrays-as-strings) survive intact.
function buildSeedScript(seeds, mockJs) {
  const stmts = Object.entries(seeds).map(([k, v]) => {
    if (v === null || v === undefined) return `localStorage.removeItem(${JSON.stringify(k)});`;
    return `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(String(v))});`;
  }).join(' ');
  return `try { ${stmts} } catch(e) {}\n${mockJs}`;
}

// JSDOM keeps internal timers + the Window VM context alive after script run.
// Track every dom we create so the orchestrator can closeAll() at the end
// and let the Node process exit.
const _openDoms = new Set();
function closeAll() {
  for (const d of _openDoms) {
    try { d.window.close(); } catch (e) { /* ignore */ }
  }
  _openDoms.clear();
}

// Internal: build a JSDOM and wait for app init (3 microtask ticks + the
// 80ms settle that every existing suite uses). Returns {window, doc, dom}.
async function _buildWindow(htmlBlob, mockScriptSelector, mainScriptSelector, bundle, seeds, mockJs, waitMs) {
  const seedScript = buildSeedScript(seeds, mockJs);
  const patched = htmlBlob
    .replace(mockScriptSelector, `<script>${seedScript}</script>`)
    .replace(mainScriptSelector, `<script>${bundle}</script>`);
  const dom = new JSDOM(patched, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, waitMs == null ? 80 : waitMs));
  _openDoms.add(dom);
  return { window: dom.window, doc: dom.window.document, dom };
}

async function createDesktopWindow(seeds = { bs_mock: '1' }, opts = {}) {
  const c = setup();
  // 2026-05-19: the 2026-05-18 work added a player login gate to init() that
  // blocks board rendering until localStorage.bs_player is set. Auto-seed it
  // so existing suites (which don't know about the gate) keep working. A
  // future "test the login splash" suite can opt out by passing
  // bs_player: null explicitly.
  if (!('bs_player' in seeds)) seeds = { bs_player: 'TEST01', ...seeds };
  return _buildWindow(
    c.desktopHtml,
    '<script src="/mock_data.js" onerror="window.__noMockData=true"></script>',
    '<script type="module" src="/src/main.js"></script>',
    c.desktopBundle, seeds, c.mockJs, opts.waitMs
  );
}

async function createMobileWindow(seeds = { bs_mock: '1', bs_bets: '[]', bs_bal: '1000' }, opts = {}) {
  const c = setup();
  return _buildWindow(
    c.mobileHtml,
    '<script src="/mock_data.js" onerror="window.__noMockData=true"></script>',
    '<script type="module" src="/src/mobile/main.js"></script>',
    c.mobileBundle, seeds, c.mockJs, opts.waitMs
  );
}

function createAssert(fails, opts = {}) {
  const log = opts.quiet ? () => {} : console.log.bind(console);
  return (cond, msg) => {
    if (!cond) { console.log(`  FAIL: ${msg}`); fails.push(msg); }
    else { log(`  ok: ${msg}`); }
  };
}

const tick = () => new Promise(r => setTimeout(r, 0));
const wait = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  setup,
  createDesktopWindow,
  createMobileWindow,
  createAssert,
  closeAll,
  tick,
  wait,
};
