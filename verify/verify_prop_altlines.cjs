// ════════════════════════════════════════════════════════════════════════════
//  verify_prop_altlines.cjs — module form, called by harness via run_all.cjs
//  ────────────────────────────────────────────────────────────────────────────
//  Was a standalone jsdom script. Now exports {name, run(harness)} so it
//  shares process with the other suites. JSDOM setup is delegated to
//  harness.createDesktopWindow.
//  ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'prop_altlines',
  async run(harness) {
    const { window } = await harness.createDesktopWindow({ 'bs_mock': '1', 'bs_alt': '1' });
    const fails = [];
    const assert = harness.createAssert(fails);
    const tick = harness.tick;

    await new Promise(r => setTimeout(r, 80));
    const w = window, doc = window.document;

    // ── 1. Chevrons on prop buttons ────────────────────────────────────────
    console.log('--- 1. Chevron presence on prop buttons ---');
    const propChevs = doc.querySelectorAll('.prop-alt-chev');
    console.log('  .prop-alt-chev count:', propChevs.length);
    assert(propChevs.length > 0, 'prop alt-line chevrons rendered on board');
    // All 54 cards × 2 sides each = 108 buttons, all with alts in mock fixture, so 108 chevrons
    assert(propChevs.length === 108, 'one chevron per prop button (54 cards × 2 sides = 108)');

    // ── 2. Open popover on first chevron ───────────────────────────────────
    console.log('\n--- 2. Open prop alt popover ---');
    propChevs[0].click(); await tick();
    let pop = doc.querySelector('.prop-alt-pop');
    assert(pop !== null, 'prop-alt-pop appears after chevron click');
    if (pop) {
      const cols = pop.querySelector('.prop-alt-pop-cols');
      assert(cols !== null, 'has 3-col column header');
      if (cols) assert(cols.textContent.includes('Line') && cols.textContent.includes('Over') && cols.textContent.includes('Under'), 'col header shows Line/Over/Under');
      const rows = pop.querySelectorAll('.prop-alt-pop-row');
      console.log('  popover rows:', rows.length);
      assert(rows.length >= 2, 'popover has multiple line rows');
      const mainRow = pop.querySelector('.prop-alt-pop-row.main');
      assert(mainRow !== null, 'one row marked as main');
    }

    // ── 3. Pick over vig from a non-main alt in straight mode ──────────────
    console.log('\n--- 3. Pick over alt in straight mode ---');
    if (pop) {
      const rows = Array.from(pop.querySelectorAll('.prop-alt-pop-row'));
      const nonMain = rows.find(r => !r.classList.contains('main'));
      assert(nonMain !== null, 'found a non-main row to pick');
      if (nonMain) {
        const pickedLine = nonMain.querySelector('.prop-alt-pop-line').textContent;
        const overCell = nonMain.querySelectorAll('.prop-alt-pop-vig')[0]; // first vig = Over
        const pickedVig = overCell.textContent;
        console.log(`  picking Over line=${pickedLine} vig=${pickedVig}`);
        overCell.click(); await tick();
        assert(doc.querySelector('.prop-alt-pop') === null, 'popover closes after pick');
        // Find the now-selected prop button — its text should start with o{pickedLine}
        const selProp = doc.querySelector('.prop-obtn.sel');
        assert(selProp !== null, 'a .prop-obtn.sel exists after Over alt pick');
        if (selProp) {
          const btnTxt = selProp.textContent;
          console.log('  selected prop btn text:', btnTxt);
          assert(btnTxt.startsWith('o' + pickedLine), `selected btn starts with "o${pickedLine}"`);
          assert(btnTxt.includes(pickedVig), `selected btn includes vig "${pickedVig}"`);
        }
      }
    }

    // ── 4. Pick under vig in straight mode (separate leg) ──────────────────
    console.log('\n--- 4. Pick under alt in straight mode (separate leg) ---');
    const chev2 = doc.querySelectorAll('.prop-alt-chev')[1]; // second chevron = Under side of same prop
    chev2.click(); await tick();
    const pop2 = doc.querySelector('.prop-alt-pop');
    assert(pop2 !== null, 'popover reopens on Under chevron');
    if (pop2) {
      const rows = Array.from(pop2.querySelectorAll('.prop-alt-pop-row'));
      const nonMain = rows.find(r => !r.classList.contains('main'));
      if (nonMain) {
        const pickedLine = nonMain.querySelector('.prop-alt-pop-line').textContent;
        const underCell = nonMain.querySelectorAll('.prop-alt-pop-vig')[1]; // second vig = Under
        const pickedVig = underCell.textContent;
        console.log(`  picking Under line=${pickedLine} vig=${pickedVig}`);
        underCell.click(); await tick();
        // After pick + renderBoard, both O and U should be selected (separate keys)
        const selCount = doc.querySelectorAll('.prop-obtn.sel').length;
        console.log('  selected prop-obtns after both picks:', selCount);
        assert(selCount === 2, '2 separate selections (O and U sides)');
      }
    }

    // ── 5. Switch to parlay mode, pick alt over ────────────────────────────
    console.log('\n--- 5. Pick alt in parlay mode ---');
    // Clear straight selections first via re-clicking buttons would be complex; just switch mode.
    w.setMode('parlay'); await tick();
    // Selections survive mode switch as state.selCells map but state.parlayLegs is separate.
    // Find a fresh chevron (one whose prop has no leg yet)
    const pChevs = doc.querySelectorAll('.prop-alt-chev');
    // Use chevron index 4 (a different prop card) to avoid sel-state from straight mode
    pChevs[4].click(); await tick();
    const pop3 = doc.querySelector('.prop-alt-pop');
    assert(pop3 !== null, 'popover opens in parlay mode');
    if (pop3) {
      const rows = Array.from(pop3.querySelectorAll('.prop-alt-pop-row'));
      const nonMain = rows.find(r => !r.classList.contains('main'));
      if (nonMain) {
        const pickedLine = nonMain.querySelector('.prop-alt-pop-line').textContent;
        nonMain.querySelectorAll('.prop-alt-pop-vig')[0].click(); await tick();
        const parBadge = doc.getElementById('par-badge');
        assert(parBadge && parseInt(parBadge.textContent) >= 1, `par-badge shows ≥1 leg (got ${parBadge.textContent})`);
      }
    }

    // ── 6. Switch to ifbet mode, pick alt over ─────────────────────────────
    console.log('\n--- 6. Pick alt in ifbet mode ---');
    w.setMode('ifbet'); await tick();
    const iChevs = doc.querySelectorAll('.prop-alt-chev');
    iChevs[6].click(); await tick();
    const pop4 = doc.querySelector('.prop-alt-pop');
    assert(pop4 !== null, 'popover opens in ifbet mode');
    if (pop4) {
      const rows = Array.from(pop4.querySelectorAll('.prop-alt-pop-row'));
      const nonMain = rows.find(r => !r.classList.contains('main'));
      if (nonMain) {
        nonMain.querySelectorAll('.prop-alt-pop-vig')[0].click(); await tick();
        const ifBadge = doc.getElementById('if-badge');
        assert(ifBadge && parseInt(ifBadge.textContent) >= 1, `if-badge shows ≥1 leg (got ${ifBadge.textContent})`);
      }
    }

    // ── 7. Click-outside closes popover ────────────────────────────────────
    console.log('\n--- 7. Click-outside closes popover ---');
    w.setMode('parlay'); await tick();
    const chevs7 = doc.querySelectorAll('.prop-alt-chev');
    chevs7[10].click(); await tick();
    assert(doc.querySelector('.prop-alt-pop') !== null, 'popover open');
    const btitle = doc.getElementById('board-title');
    if (btitle) { btitle.click(); await tick(); }
    assert(doc.querySelector('.prop-alt-pop') === null, 'popover closed by outside click');

    // ── 8. Idempotent re-pick (parlay) ─────────────────────────────────────
    console.log('\n--- 8. Idempotent re-pick ---');
    const chevs8 = doc.querySelectorAll('.prop-alt-chev');
    chevs8[12].click(); await tick();
    const pop8 = doc.querySelector('.prop-alt-pop');
    if (pop8) {
      const target = Array.from(pop8.querySelectorAll('.prop-alt-pop-row')).find(r => !r.classList.contains('main'));
      const line = target.querySelector('.prop-alt-pop-line').textContent;
      target.querySelectorAll('.prop-alt-pop-vig')[0].click(); await tick();
      const beforeBadge = parseInt(doc.getElementById('par-badge').textContent);
      // Re-open + re-pick same row/side
      const chevs8b = doc.querySelectorAll('.prop-alt-chev');
      chevs8b[12].click(); await tick();
      const pop8b = doc.querySelector('.prop-alt-pop');
      const sameRow = Array.from(pop8b.querySelectorAll('.prop-alt-pop-row')).find(r => r.querySelector('.prop-alt-pop-line').textContent === line);
      sameRow.querySelectorAll('.prop-alt-pop-vig')[0].click(); await tick();
      const afterBadge = parseInt(doc.getElementById('par-badge').textContent);
      assert(afterBadge === beforeBadge, `parlay leg count stable (${beforeBadge} → ${afterBadge}); re-pick is a no-op swap`);
    }

    return { name: 'prop_altlines', fails };
  }
};

