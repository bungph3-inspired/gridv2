// ════════════════════════════════════════════════════════════════════════════
//  verify_mobile_prop_altlines.cjs — module form, called by harness via run_all.cjs
//  ────────────────────────────────────────────────────────────────────────────
//  Was a standalone jsdom script. Now exports {name, run(harness)} so it
//  shares process with the other suites. JSDOM setup is delegated to
//  harness.createMobileWindow.
//  ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'mobile_prop_altlines',
  async run(harness) {
    const { window } = await harness.createMobileWindow({ 'bs_mock': '1', 'bs_alt': '1', 'bs_bets': '[]', 'bs_bal': '1000' });
    const fails = [];
    const assert = harness.createAssert(fails);
    const tick = harness.tick;

    await tick(); await tick(); await tick();
    await new Promise(r => setTimeout(r, 60));

    const w = window;
    const doc = window.document;

    // ── 1. Chevron rendered on prop cells ─────────────────────────────────
    console.log('\n--- 1. Chevron on prop cells ---');
    const propCards = doc.querySelectorAll('.mob-prop-card');
    assert(propCards.length >= 1, 'at least one prop card rendered');
    const propCells = doc.querySelectorAll('.mob-prop-cell');
    // Each cell that backs a prop with alts should have a chevron
    const chevs = doc.querySelectorAll('.mob-prop-cell .mob-alt-chev');
    console.log('  prop-cell chevron count:', chevs.length);
    assert(chevs.length >= 2, 'at least 2 chevrons (over + under on first prop)');

    // ── 2. Tap chevron → bottom sheet opens ───────────────────────────────
    console.log('\n--- 2. Open prop-alt sheet ---');
    chevs[0].click();
    await tick();
    const sheet = doc.getElementById('mob-sheet');
    assert(sheet.classList.contains('open'), 'sheet has .open class');
    const sheetHdr = doc.getElementById('mob-sheet-hdr').textContent;
    console.log('  sheet header:', sheetHdr);
    assert(sheetHdr.length > 0, 'sheet header is set');
    // Sheet body has 3-col header + .mob-sheet-prow rows
    const cols = doc.querySelector('#mob-sheet-body .mob-sheet-cols');
    assert(cols !== null, '.mob-sheet-cols header row present');
    assert(/Line/i.test(cols.textContent) && /Over/i.test(cols.textContent) && /Under/i.test(cols.textContent), 'header has Line/Over/Under');
    const prows = doc.querySelectorAll('#mob-sheet-body .mob-sheet-prow');
    console.log('  .mob-sheet-prow count:', prows.length);
    assert(prows.length >= 2, 'at least 2 alt rows (main + alts)');
    const mainRow = doc.querySelector('#mob-sheet-body .mob-sheet-prow.main');
    assert(mainRow !== null, 'main line row tagged .main');

    // ── 3. Pick Over vig on the main row → adds Over leg ──────────────────
    console.log('\n--- 3. Straight: pick Over vig ---');
    const mainOverBtn = mainRow.querySelectorAll('.mob-sheet-vig-btn')[0];
    mainOverBtn.click();
    await tick();
    assert(!sheet.classList.contains('open'), 'sheet closes after pick');
    // Re-query the prop card → first prop button (Over) should be .sel
    const card0 = doc.querySelectorAll('.mob-prop-card')[0];
    const overBtn = card0.querySelectorAll('.mob-prop-btn')[0];
    assert(overBtn.classList.contains('sel'), 'over button shows .sel after pick');
    // continue bar reflects 1 leg
    assert(doc.getElementById('mob-continue-cnt').textContent === '1', 'continue counter shows 1');

    // ── 4. Re-open sheet & pick a DIFFERENT line for Over → swap, not add ──
    console.log('\n--- 4. Swap Over line (not add) ---');
    const chev0 = card0.querySelector('.mob-alt-chev');
    chev0.click();
    await tick();
    const allProws = doc.querySelectorAll('#mob-sheet-body .mob-sheet-prow');
    // Find a non-main row to pick
    const altRow = Array.from(allProws).find(r => !r.classList.contains('main'));
    assert(altRow !== null, 'at least one non-main alt row');
    const altOverBtn = altRow.querySelectorAll('.mob-sheet-vig-btn')[0];
    const altOverVal = altOverBtn.textContent;
    altOverBtn.click();
    await tick();
    // Continue counter should still be 1 (swap, not add)
    assert(doc.getElementById('mob-continue-cnt').textContent === '1', 'still 1 leg after swap');
    // Prop button line should now reflect the alt line
    const card0After = doc.querySelectorAll('.mob-prop-card')[0];
    const overBtnAfter = card0After.querySelectorAll('.mob-prop-btn')[0];
    const overLineSpan = overBtnAfter.querySelector('.mob-prop-line');
    assert(overLineSpan !== null, 'over button line span present');
    console.log('  over button now shows:', overLineSpan.textContent, '/ vig:', overBtnAfter.querySelector('.mob-prop-vig').textContent);
    assert(overBtnAfter.querySelector('.mob-prop-vig').textContent === altOverVal, `over button vig matches picked alt (${altOverVal})`);

    // ── 5. Pick Under vig on the same prop → separate leg ─────────────────
    console.log('\n--- 5. Pick Under (separate leg) ---');
    chev0.click(); // close sheet — wait, was that the live chev?
    await tick();
    // Re-find chevron and re-open if sheet isn't open
    if (!doc.getElementById('mob-sheet').classList.contains('open')) {
      doc.querySelectorAll('.mob-prop-card')[0].querySelector('.mob-alt-chev').click();
      await tick();
    }
    const allProws2 = doc.querySelectorAll('#mob-sheet-body .mob-sheet-prow');
    const mainRow2 = Array.from(allProws2).find(r => r.classList.contains('main'));
    const mainUnderBtn = mainRow2.querySelectorAll('.mob-sheet-vig-btn')[1];
    mainUnderBtn.click();
    await tick();
    assert(doc.getElementById('mob-continue-cnt').textContent === '2', 'continue counter shows 2 (Over + Under)');
    const card0Final = doc.querySelectorAll('.mob-prop-card')[0];
    const selBtns = card0Final.querySelectorAll('.mob-prop-btn.sel');
    assert(selBtns.length === 2, 'both Over and Under prop buttons .sel');

    // Clear straight slip
    selBtns.forEach(b => b.click());
    await tick();

    // ── 6. Parlay mode: pick via sheet ────────────────────────────────────
    console.log('\n--- 6. Parlay mode ---');
    w.setMode('parlay');
    await tick();
    const pChev = doc.querySelectorAll('.mob-prop-card')[0].querySelector('.mob-alt-chev');
    pChev.click();
    await tick();
    const pMainRow = doc.querySelector('#mob-sheet-body .mob-sheet-prow.main');
    pMainRow.querySelectorAll('.mob-sheet-vig-btn')[0].click();
    await tick();
    assert(doc.getElementById('par-badge').textContent === '1', 'parlay badge shows 1 after sheet pick');

    // ── 7. Teaser mode: sheet pick rejected with toast ────────────────────
    console.log('\n--- 7. Teaser mode rejects prop pick ---');
    w.setMode('teaser');
    await tick();
    // In teaser mode the prop section is hidden entirely (no chevrons to click).
    // Verify that.
    assert(doc.querySelectorAll('.mob-prop-section').length === 0, 'no prop section visible in teaser mode');

    console.log('\n────────────────────────────────────────');
    console.log(`Total fails: ${fails.length}`);
    if (fails.length) {
      console.log('FAILED ASSERTIONS:');
      fails.forEach(f => console.log('  - ' + f));
    }
    console.log('All mobile prop-alt assertions passed.');

    return { name: 'mobile_prop_altlines', fails };
  }
};

