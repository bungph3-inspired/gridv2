// ════════════════════════════════════════════════════════════════════════════
//  run_all.cjs — single-process verify pipeline
//  ────────────────────────────────────────────────────────────────────────────
//  Stage 1: integrity preflight (sequential, fast — bails on any flagged file)
//  Stage 2: build both bundles ONCE (desktop + mobile) unless SKIP_BUNDLE=1
//  Stage 3: load each verify suite as a module + call .run(harness) in order
//
//  All suites share ONE Node process + ONE in-memory copy of every input
//  file. Per-suite cost drops from ~9-15s (process startup + bundle parse)
//  to ~0.7-1.5s (just jsdom build + assertions). Full pipeline runs in
//  ~7-12s end-to-end on a 2-core sandbox.
//
//  Env knobs:
//    SKIP_BUNDLE=1            — skip the bundle stage, reuse existing bundles
//    ESBUILD_BIN=/path        — override esbuild binary (sandbox: use the
//                               standalone Linux build, not the project's
//                               win32-only node_modules copy)
//    ONLY=altlines,props      — run only these suites by name (comma-sep)
//  ════════════════════════════════════════════════════════════════════════════

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const proj = path.resolve(__dirname, '..');

// ─── Stage 1: integrity preflight ───────────────────────────────────────
console.log('Preflight: integrity check');
const pre = spawnSync('node', [path.join(__dirname, 'check_integrity.cjs')], { stdio: 'inherit' });
if (pre.status !== 0) {
  console.log('Preflight FAILED — aborting before bundling.');
  process.exit(1);
}

// ─── Stage 2: build both bundles once ───────────────────────────────────
if (process.env.SKIP_BUNDLE === '1') {
  console.log('\nSKIP_BUNDLE=1 — reusing existing verify/bundle*.js');
} else {
  const esbuildBin = process.env.ESBUILD_BIN || null;
  function bundle(entry, out) {
    const outPath = path.join(__dirname, out);
    const entryPath = path.join(proj, ...entry.split('/'));
    let cmd;
    if (esbuildBin) {
      cmd = '"' + esbuildBin + '" "' + entryPath + '" --bundle --format=iife --loader:.css=empty --outfile="' + outPath + '" --target=es2020 --log-level=warning';
    } else {
      const esbuild = path.join(proj, 'node_modules', 'esbuild', 'bin', 'esbuild');
      cmd = 'node "' + esbuild + '" "' + entryPath + '" --bundle --format=iife --loader:.css=empty --outfile="' + outPath + '" --target=es2020 --log-level=warning';
    }
    execSync(cmd, { stdio: 'inherit' });
  }
  console.log('\nBundling src/main.js → bundle.js');
  bundle('src/main.js', 'bundle.js');
  console.log('Bundling src/mobile/main.js → bundle_mobile.js');
  bundle('src/mobile/main.js', 'bundle_mobile.js');
  console.log('Bundling src/agent-main.js → bundle_agent.js');
  bundle('src/agent-main.js', 'bundle_agent.js');
}

// ─── Stage 3: load + run each suite ─────────────────────────────────────
const harness = require('./harness.cjs');
const suites = [
  './verify_altlines.cjs',
  './verify_altlines_toggle.cjs',
  './verify_props.cjs',
  './verify_props_polish.cjs',
  './verify_prop_altlines.cjs',
  './verify_mobile.cjs',
  './verify_mobile_props.cjs',
  './verify_mobile_prop_altlines.cjs',
  './verify_mobile_teaser.cjs',
  './verify_mobile_teaser_gating.cjs',
  './verify_reverse.cjs',
  './verify_agent.cjs',
];

const only = process.env.ONLY ? process.env.ONLY.split(',').map(s => s.trim()) : null;

(async () => {
  const t0 = Date.now();
  harness.setup();
  console.log('\nLoaded harness in', (Date.now() - t0) + 'ms');

  const results = [];
  for (const modPath of suites) {
    const mod = require(modPath);
    if (only && !only.includes(mod.name)) continue;
    console.log('\n=== ' + mod.name + ' ===');
    const t = Date.now();
    try {
      const r = await mod.run(harness);
      const ms = Date.now() - t;
      results.push({ name: mod.name, fails: r.fails || [], ms });
      console.log(`  → ${(r.fails || []).length === 0 ? 'ALL PASS' : (r.fails.length + ' FAIL')} (${ms}ms)`);
    } catch (e) {
      const ms = Date.now() - t;
      results.push({ name: mod.name, fails: ['CRASH: ' + e.message], ms });
      console.error('  CRASH in ' + mod.name + ':', e.message);
    }
  }

  // Close all jsdom windows so the process can exit cleanly.
  harness.closeAll();

  // ─── Summary ────────────────────────────────────────────────────────
  const totalMs = Date.now() - t0;
  let totalFails = 0;
  console.log('\n────────────────────────');
  for (const r of results) {
    const status = r.fails.length === 0 ? 'PASS' : (r.fails.length + ' FAIL');
    console.log(`  ${r.name.padEnd(28)} ${status.padEnd(12)} ${r.ms}ms`);
    totalFails += r.fails.length;
  }
  console.log('────────────────────────');
  console.log(`Total: ${totalMs}ms across ${results.length} suite(s) — ${totalFails === 0 ? 'ALL SUITES PASS' : (totalFails + ' assertion failure(s)')}`);
  process.exit(totalFails === 0 ? 0 : 1);
})().catch(err => {
  console.error('Orchestrator crash:', err);
  process.exit(2);
});
