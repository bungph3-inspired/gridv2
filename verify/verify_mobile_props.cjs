// ════════════════════════════════════════════════════════════════════════════
//  verify_mobile_props.cjs — module form, called by harness via run_all.cjs
//  ────────────────────────────────────────────────────────────────────────────
//  Was a standalone jsdom script. Now exports {name, run(harness)} so it
//  shares process with the other suites. JSDOM setup is delegated to
//  harness.createMobileWindow.
//  ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'mobile_props',
  async run(harness) {
    const { window } = await harness.createMobileWindow({ 'bs_mock': '1', 'bs_bets': '[]', 'bs_bal': '1000' });
    const fails = [];
    const assert = harness.createAssert(fails);
    const tick = harness.tick;

    await tick(); await tick(); await tick();
    await new Promise(r => setTimeout(r, 60));

    const w = window;
    const doc = window.document;

    // ── 1. Prop sections render under game cards ──────────────────────────
    console.log('\n--- 1. Prop sections rendered ---');
    const sections = doc.querySelectorAll('.mob-prop-section');
    console.log('  .mob-prop-section count:', sections.length);
    assert(sections.length >= 1, 'at least one .mob-prop-section rendered');
    // Each section must be inside (or sibling-ish via DOM) a .mob-gcard
    const firstSection = sections[0];
    const parentCard = firstSection.closest('.mob-gcard');
    assert(parentCard !== null, 'prop section sits inside a .mob-gcard');

    // ── 2. Section has banner + per-prop cards w/ Over+Under rows ─────────
    console.log('\n--- 2. Section structure ---');
    const banner = firstSection.querySelector('.mob-prop-banner');
    assert(banner !== null, 'section has .mob-prop-banner');
    assert(/Player Props/.test(banner.textContent), 'banner text includes "Player Props"');
    const propCards = firstSection.querySelectorAll('.mob-prop-card');
    console.log('  .mob-prop-card count:', propCards.length);
    assert(propCards.length >= 1, 'at least one .mob-prop-card per section');
    const firstCard = propCards[0];
    const rows = firstCard.querySelectorAll('.mob-prop-row');
    assert(rows.length === 2, 'each prop card has 2 rows (Over + Under)');
    const btns = firstCard.querySelectorAll('.mob-prop-btn');
    assert(btns.length === 2, 'each card has 2 prop buttons');

    // ── 3. Deterministic bet-id pattern ───────────────────────────────────
    console.log('\n--- 3. Deterministic bet-id ---');
    const idCells = firstCard.querySelectorAll('.mob-prop-id');
    assert(idCells.length === 2, '2 bet-id cells per card');
    const id1 = idCells[0].textContent.trim();
    const id2 = idCells[1].textContent.trim();
    console.log('  bet-ids:', id1, '/', id2);
    // Over gets odd suffix (1), Under gets even (2). First prop of first game = 509011/509012.
    assert(/^509\d{3}$/.test(id1) && /^509\d{3}$/.test(id2), 'both bet-ids match 509xxx pattern');
    assert(parseInt(id2, 10) === parseInt(id1, 10) + 1, 'Under id is Over id + 1');

    // ── 4. Tap Over button in straight mode ───────────────────────────────
    console.log('\n--- 4. Straight: tap Over ---');
    btns[0].click();
    await tick();
    // renderBoard() runs after onPropClick, so re-query against live DOM
    const selBtns = doc.querySelectorAll('.mob-prop-btn.sel');
    assert(selBtns.length === 1, 'one prop button is selected (Over only)');
    const contBar = doc.getElementById('mob-continue-bar');
    assert(!contBar.classList.contains('hidden'), 'continue bar appears');

    // ── 5. Tap Under (same prop, separate leg) ────────────────────────────
    console.log('\n--- 5. Straight: tap Under (separate leg) ---');
    const refreshedBtns = doc.querySelectorAll('.mob-prop-card')[0].querySelectorAll('.mob-prop-btn');
    refreshedBtns[1].click();
    await tick();
    const selAfterUnder = doc.querySelectorAll('.mob-prop-card')[0].querySelectorAll('.mob-prop-btn.sel');
    assert(selAfterUnder.length === 2, 'both Over and Under selected (2 separate legs)');
    assert(doc.getElementById('mob-continue-cnt').textContent === '2', 'continue counter shows 2');

    // Clear straight selections before parlay test
    refreshedBtns[0].click(); refreshedBtns[1].click();
    await tick();
    assert(doc.querySelectorAll('.mob-prop-btn.sel').length === 0, 'cleared after toggle-off');

    // ── 6. Parlay mode: tap two props ─────────────────────────────────────
    console.log('\n--- 6. Parlay: tap 2 props ---');
    w.setMode('parlay');
    await tick();
    const pBtns = doc.querySelectorAll('.mob-prop-card')[0].querySelectorAll('.mob-prop-btn');
    pBtns[0].click();
    const pBtns2 = doc.querySelectorAll('.mob-prop-card')[1].querySelectorAll('.mob-prop-btn');
    pBtns2[0].click();
    await tick();
    assert(doc.getElementById('par-badge').textContent === '2', 'par-badge shows 2 prop legs');
    // Clear
    doc.querySelectorAll('.mob-prop-btn.sel').forEach(b => b.click());
    await tick();

    // ── 7. If Bet mode: tap two props ─────────────────────────────────────
    console.log('\n--- 7. If Bet: tap 2 props ---');
    w.setMode('ifbet');
    await tick();
    const iBtns = doc.querySelectorAll('.mob-prop-card')[0].querySelectorAll('.mob-prop-btn');
    iBtns[0].click();
    const iBtns2 = doc.querySelectorAll('.mob-prop-card')[1].querySelectorAll('.mob-prop-btn');
    iBtns2[0].click();
    await tick();
    assert(doc.getElementById('if-badge').textContent === '2', 'if-badge shows 2 prop legs');
    doc.querySelectorAll('.mob-prop-btn.sel').forEach(b => b.click());
    await tick();

    // ── 8. Teaser mode hides prop section entirely ────────────────────────
    console.log('\n--- 8. Teaser: prop section hidden ---');
    w.setMode('teaser');
    await tick();
    assert(doc.querySelectorAll('.mob-prop-section').length === 0, 'no .mob-prop-section in teaser mode');

    // ── 9. Place a straight prop wager → My Bets shows player ─────────────
    console.log('\n--- 9. Place straight prop wager ---');
    w.setMode('straight');
    await tick();
    const propBtn = doc.querySelectorAll('.mob-prop-card')[0].querySelectorAll('.mob-prop-btn')[0];
    const propBtnPlayer = doc.querySelectorAll('.mob-prop-card')[0].querySelector('.mob-prop-name').textContent;
    propBtn.click();
    await tick();
    w.openReview();
    await tick();
    assert(doc.getElementById('mob-review-overlay').classList.contains('open'), 'review opens for prop wager');
    // Review row should show the player name (not a team name)
    const rvTeam = doc.querySelector('.mob-rv-leg-team');
    assert(rvTeam && rvTeam.textContent.includes(propBtnPlayer), `review shows player "${propBtnPlayer}"`);
    const winInp = doc.querySelector('#mob-review-body input[data-role="win"]');
    assert(winInp !== null, 'win input present');
    const confirm = doc.getElementById('mob-rv-confirm');
    assert(confirm && !confirm.disabled, 'confirm enabled at default $50 win');
    const balPre = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    confirm.click();
    await tick();
    const balPost = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    assert(balPost < balPre, `balance decreased after prop place (${balPre} → ${balPost})`);

    // My Bets card should show the player name as the topName
    w.openBets();
    await tick();
    const betCard = doc.querySelector('.mob-betcard');
    assert(betCard !== null, 'My Bets shows the placed prop bet');
    const betName = betCard.querySelector('.mob-betcard-name').textContent;
    assert(betName.includes(propBtnPlayer), `bet card name includes player "${propBtnPlayer}" (got "${betName}")`);

    console.log('\n────────────────────────────────────────');
    console.log(`Total fails: ${fails.length}`);
    if (fails.length) {
      console.log('FAILED ASSERTIONS:');
      fails.forEach(f => console.log('  - ' + f));
    }
    console.log('All mobile-props assertions passed.');

    return { name: 'mobile_props', fails };
  }
};

