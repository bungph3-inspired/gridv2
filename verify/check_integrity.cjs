// ════════════════════════════════════════════════════════════════════════════
//  check_integrity.cjs — preflight sanity check
//  ────────────────────────────────────────────────────────────────────────────
//  Walks the canonical project file list and flags:
//    1. Files shorter than a known floor (suggests truncation/clobber)
//    2. JS/CJS files that fail node --check (syntax error)
//    3. Files whose last non-whitespace line doesn't end with a valid closer
//       — } ; ) ] > */ for code / HTML, sentence-punct for markdown — which
//       catches the "ended mid-statement / mid-word" pattern that the
//       Edit-tool truncation produces.
//
//  Exit 0 if all clean, 1 if any issue. Run before run_all.cjs:
//
//      node verify/check_integrity.cjs
//
//  Or as part of run_all.cjs (added as a preflight).
//  ════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJ = path.resolve(__dirname, '..');

// (path, minBytes, jsCheck). minBytes is a "should be at least this big"
// floor — catches truncation when a file shrinks dramatically. Tune these
// upward as the project grows.
const FILES = [
  ['src/state.js',         5000,  true],
  ['src/utils.js',         3000,  true],
  ['src/teams.js',         8000,  true],
  ['src/api.js',          15000,  true],
  ['src/bets.js',         30000,  true],
  ['src/main.js',         30000,  true],
  ['src/mobile/main.js',  40000,  true],
  ['src/style.css',       40000,  false],
  ['index.html',           8000,  false],
  ['index_mobile.html',    5000,  false],
  ['PROJECT.md',          30000,  false],
  ['verify/run_all.cjs',   2000,  true],
  ['verify/harness.cjs',   2000,  true],
  ['verify/verify_altlines.cjs',           8000, true],
  ['verify/verify_altlines_toggle.cjs',    5000, true],
  ['verify/verify_props.cjs',              5000, true],
  ['verify/verify_props_polish.cjs',       6000, true],
  ['verify/verify_prop_altlines.cjs',      7000, true],
  ['verify/verify_mobile.cjs',             8000, true],
  ['verify/verify_mobile_props.cjs',       7000, true],
  ['verify/verify_mobile_prop_altlines.cjs', 7000, true],
  ['verify/verify_mobile_teaser.cjs',     10000, true],
  ['verify/verify_mobile_teaser_gating.cjs', 6000, true],
  ['verify/verify_reverse.cjs',           10000, true],
];

// A "valid closer" for the last non-whitespace line of code / HTML. Liberal
// pattern: any closing bracket, semicolon, HTML closing tag, JSDoc terminator,
// or }) wrap.
const CLOSER_RE = /[\};\)\]]\s*[\);]?\s*$|\*\/\s*$|>\s*$/;

// Markdown tail check: a "completed" line ends in sentence punctuation, a
// closing bracket, an emphasis marker (*), a code-span backtick, a quote, or
// a colon/semicolon. Catches the mid-word truncations the mount cap leaves
// behind (e.g. "John flagged mid-session neve") without false-positiving on
// normal prose, bullets ending in code spans, or trailing emphasis.
const MD_CLOSER_RE = /[\.!?\)\]\}>\*`'":;_]\s*$/;

function closerReFor(file) {
  return file.endsWith('.md') ? MD_CLOSER_RE : CLOSER_RE;
}

let problems = 0;

function check(file, minBytes, jsCheck) {
  const abs = path.join(PROJ, file);
  if (!fs.existsSync(abs)) {
    console.log(`MISSING  ${file}`);
    problems++;
    return;
  }
  const stat = fs.statSync(abs);
  const bytes = stat.size;
  const raw = fs.readFileSync(abs, 'utf8');
  const lines = raw.split('\n');
  // Last non-whitespace line
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && !lines[lastIdx].trim()) lastIdx--;
  const lastLine = lastIdx >= 0 ? lines[lastIdx] : '';
  const tailOk = closerReFor(file).test(lastLine);

  let issues = [];
  if (bytes < minBytes) issues.push(`size ${bytes} < floor ${minBytes}`);
  if (!tailOk) issues.push(`last line doesn't close cleanly: "${lastLine.slice(0, 60)}"`);
  if (jsCheck) {
    try {
      execSync(`node --check "${abs}"`, { stdio: 'pipe' });
    } catch (e) {
      const msg = (e.stderr ? e.stderr.toString() : e.message).split('\n')[0];
      issues.push(`node --check fail: ${msg}`);
    }
  }
  if (issues.length) {
    problems++;
    console.log(`FAIL     ${file}  (${bytes}b)`);
    issues.forEach(i => console.log(`         - ${i}`));
  } else {
    console.log(`ok       ${file}  (${bytes}b, ${lines.length} lines)`);
  }
}

console.log('Project integrity check\n────────────────────────');
FILES.forEach(([f, m, j]) => check(f, m, j));
console.log('────────────────────────');
if (problems) {
  console.log(`${problems} file(s) flagged. Fix before running verify suites.`);
  process.exit(1);
} else {
  console.log('All files clean.');
}
