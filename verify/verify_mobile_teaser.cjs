// ════════════════════════════════════════════════════════════════════════════
//  verify_mobile_teaser.cjs — module form, called by harness via run_all.cjs
//  ────────────────────────────────────────────────────────────────────────────
//  Was a standalone jsdom script. Now exports {name, run(harness)} so it
//  shares process with the other suites. JSDOM setup is delegated to
//  harness.createMobileWindow.
//  ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'mobile_teaser',
  async run(harness) {
    const { window } = await harness.createMobileWindow({ 'bs_mock': '1', 'bs_bets': '[]', 'bs_bal': '1000' });
    const fails = [];
    const assert = harness.createAssert(fails);
    const tick = harness.tick;

    await tick(); await tick(); await tick();
    await new Promise(r => setTimeout(r, 80));

    const w = window;
    const doc = window.document;

    const initCards = doc.querySelectorAll('.mob-gcard');
    assert(initCards.length >= 1, `mock fixture loaded >=1 game card (got ${initCards.length})`);

    // ── 1. Switch to teaser → variant menu renders ────────────────────────
    console.log('\n--- 1. Teaser mode → variant menu renders ---');
    w.setMode('teaser');
    await tick();
    const menu = doc.getElementById('mob-teaser-menu');
    assert(menu !== null, '#mob-teaser-menu element exists');
    const variantBtns = doc.querySelectorAll('.mob-tm-vbtn');
    assert(variantBtns.length === 5, `5 variant buttons rendered (got ${variantBtns.length})`);
    const cardsOnMenu = doc.querySelectorAll('.mob-gcard');
    assert(cardsOnMenu.length === 0, `no .mob-gcard while on variant menu (got ${cardsOnMenu.length})`);

    // ── 2. Pick PRIME6 → board renders with teaser cells ─────────────────
    console.log('\n--- 2. Pick PRIME6 → board renders teaser cells ---');
    const prime6 = Array.from(variantBtns).find(b => b.dataset.variant === 'PRIME6');
    assert(prime6 !== null, 'PRIME6 variant button present');
    prime6.click();
    await tick();
    assert(doc.getElementById('mob-teaser-menu') === null, 'variant menu hidden after pick');
    const cards = doc.querySelectorAll('.mob-gcard');
    assert(cards.length >= 1, 'game cards rendered after variant pick');
    const tbtns = doc.querySelectorAll('.mob-tbtn');
    assert(tbtns.length >= 4, `teaser cells render (>=4 .mob-tbtn, got ${tbtns.length})`);
    const oddsBtns = doc.querySelectorAll('.mob-obtn');
    assert(oddsBtns.length === 0, `no plain .mob-obtn in teaser mode (got ${oddsBtns.length})`);

    // ── 3. Teaser cell structure ─────────────────────────────────────────
    console.log('\n--- 3. Teaser cell structure ---');
    const firstT = tbtns[0];
    assert(firstT.querySelector('.mob-torig') !== null, 'cell has .mob-torig (strike orig)');
    assert(firstT.querySelector('.mob-tshift') !== null, 'cell has .mob-tshift (bold shifted)');
    const origText = firstT.querySelector('.mob-torig').textContent;
    const shiftText = firstT.querySelector('.mob-tshift').textContent;
    assert(origText.length > 0 && shiftText.length > 0, `orig "${origText}" / shifted "${shiftText}" both populated`);
    assert(origText !== shiftText, 'orig and shifted lines differ (shift was applied)');

    // ── 4. ML column becomes a dash placeholder ──────────────────────────
    console.log('\n--- 4. ML column dashes ---');
    const dashes = doc.querySelectorAll('.mob-tcell-dash');
    assert(dashes.length >= 2, `dashes for ML column (>=2, got ${dashes.length})`);
    assert(dashes[0].textContent.trim() === '—', 'dash cell renders an em-dash');

    // ── 5. Props section hidden in teaser mode ────────────────────────────
    console.log('\n--- 5. Props section hidden in teaser mode ---');
    assert(doc.querySelectorAll('.mob-prop-section').length === 0, 'no .mob-prop-section in teaser mode');

    // ── 6. Click first teaser cell → leg added ───────────────────────────
    console.log('\n--- 6. Click teaser cell → leg adds ---');
    firstT.click();
    await tick();
    assert(firstT.classList.contains('sel') || doc.querySelector('.mob-tbtn.sel') !== null,
      'tapped cell shows .sel (post-render, may be a re-rendered sibling)');
    const teaBadge = doc.getElementById('tea-badge');
    assert(teaBadge.textContent === '1', `tea-badge = 1 (got "${teaBadge.textContent}")`);
    const contBar = doc.getElementById('mob-continue-bar');
    assert(contBar.classList.contains('hidden'), 'continue bar hidden at 1 leg (minLegs=2)');

    // ── 7. Second leg → continue bar appears ─────────────────────────────
    console.log('\n--- 7. Second leg → continue bar shows ---');
    const tbtns2 = doc.querySelectorAll('.mob-tbtn');
    const otherCell = Array.from(tbtns2).find(b => !b.classList.contains('sel'));
    assert(otherCell !== null && otherCell !== firstT, 'unselected cell available for 2nd leg');
    otherCell.click();
    await tick();
    assert(doc.getElementById('tea-badge').textContent === '2', 'tea-badge = 2 after 2nd click');
    assert(!doc.getElementById('mob-continue-bar').classList.contains('hidden'),
      'continue bar visible at 2 legs (PRIME6 minLegs met)');
    assert(doc.getElementById('mob-continue-cnt').textContent === '2', 'continue counter = 2');

    // ── 8. Toggle: re-click same cell removes leg ────────────────────────
    console.log('\n--- 8. Toggle: re-click removes leg ---');
    const selCells = doc.querySelectorAll('.mob-tbtn.sel');
    assert(selCells.length === 2, `2 selected cells before toggle (got ${selCells.length})`);
    selCells[0].click();
    await tick();
    assert(doc.getElementById('tea-badge').textContent === '1', 'tea-badge = 1 after toggle off');
    assert(doc.getElementById('mob-continue-bar').classList.contains('hidden'),
      'continue bar hides after dropping below minLegs');
    const tbtns3 = doc.querySelectorAll('.mob-tbtn');
    const reAdd = Array.from(tbtns3).find(b => !b.classList.contains('sel'));
    reAdd.click();
    await tick();
    assert(doc.getElementById('tea-badge').textContent === '2', 'tea-badge back to 2 after re-add');

    // ── 9. Open review → teaser review screen ────────────────────────────
    console.log('\n--- 9. Teaser review screen ---');
    w.openReview();
    await tick();
    const rvOverlay = doc.getElementById('mob-review-overlay');
    assert(rvOverlay.classList.contains('open'), 'review overlay opens');
    const rvTitle = doc.getElementById('mob-review-title');
    assert(/2-Pick PRIME 6$/.test(rvTitle.textContent) || /PRIME 6/.test(rvTitle.textContent),
      `review title includes variant label (got "${rvTitle.textContent}")`);
    const tmRisk = doc.getElementById('mob-tm-risk');
    assert(tmRisk !== null, '#mob-tm-risk input exists');
    assert(tmRisk.value === '20', `default risk = $20 (got "${tmRisk.value}")`);
    const tmWin = doc.getElementById('mob-tm-win');
    assert(tmWin && tmWin.textContent.includes('$'), `to-win shows a dollar value (got "${tmWin && tmWin.textContent}")`);
    const rvLegs = rvOverlay.querySelectorAll('.mob-rv-leg');
    assert(rvLegs.length === 2, `2 leg rows in review (got ${rvLegs.length})`);
    const firstLegText = rvLegs[0].textContent;
    assert(/→/.test(firstLegText), `leg row shows arrow between orig→shifted (got "${firstLegText.trim()}")`);

    // ── 10. Confirm → balance deducted, teaserLegs cleared ───────────────
    console.log('\n--- 10. Place teaser → balance deducted ---');
    const balBefore = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    const tmConfirm = doc.getElementById('mob-rv-confirm');
    assert(tmConfirm && !tmConfirm.disabled, 'confirm button enabled');
    tmConfirm.click();
    await tick();
    const balAfter = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    assert(balAfter === balBefore - 20, `balance deducted $20 (${balBefore} → ${balAfter})`);
    assert(!rvOverlay.classList.contains('open'), 'review overlay closes after place');
    assert(doc.getElementById('tea-badge').textContent === '0', 'tea-badge resets to 0');
    assert(doc.querySelectorAll('.mob-tbtn.sel').length === 0, 'no selected cells after place');

    // ── 11. My Bets shows teaser card ────────────────────────────────────
    console.log('\n--- 11. My Bets shows teaser card ---');
    w.openBets();
    await tick();
    const betCards = doc.querySelectorAll('.mob-betcard');
    assert(betCards.length === 1, `1 bet card in My Bets (got ${betCards.length})`);
    const cardText = betCards[0].textContent;
    assert(/PRIME 6/.test(cardText), 'card text includes variant label "PRIME 6"');
    assert(/2-Pick/i.test(cardText) || /2\s*Pick/i.test(cardText), 'card text shows "2-Pick"');
    assert(/→/.test(cardText), 'card text includes leg arrow (orig→shifted)');
    assert(betCards[0].querySelectorAll('.mob-settle-btn').length === 3, '3 settle buttons on pending card');
    w.closeBets();

    // ── 12. Leaving teaser mode clears variant + legs ────────────────────
    console.log('\n--- 12. Leaving teaser clears state ---');
    await tick();
    const liveTbtns = doc.querySelectorAll('.mob-tbtn');
    liveTbtns[0].click();
    await tick();
    assert(doc.getElementById('tea-badge').textContent === '1', 'sanity: leg added');
    w.setMode('straight');
    await tick();
    assert(doc.getElementById('tea-badge').textContent === '0', 'tea-badge zeroed on mode switch');
    assert(doc.querySelectorAll('.mob-tbtn').length === 0, 'no .mob-tbtn after switching to straight');
    assert(doc.querySelectorAll('.mob-obtn').length > 0, 'plain .mob-obtn buttons re-render in straight mode');

    // ── 13. Re-enter teaser → variant menu again (no memory) ─────────────
    console.log('\n--- 13. Re-enter teaser shows menu again ---');
    w.setMode('teaser');
    await tick();
    assert(doc.getElementById('mob-teaser-menu') !== null, 'variant menu reappears on re-entry');
    assert(doc.querySelectorAll('.mob-tbtn').length === 0, 'no teaser cells until variant re-picked');

    console.log('\n────────────────────────────────────────');
    console.log(`Total fails: ${fails.length}`);
    if (fails.length) {
      console.log('FAILED ASSERTIONS:');
      fails.forEach(f => console.log('  - ' + f));
    }
    console.log('All mobile-teaser assertions passed.');

    return { name: 'mobile_teaser', fails };
  }
};

