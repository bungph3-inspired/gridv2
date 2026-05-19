// ════════════════════════════════════════════════════════════════════════════
//  verify_mobile.cjs — module form, called by harness via run_all.cjs
//  ────────────────────────────────────────────────────────────────────────────
//  Was a standalone jsdom script. Now exports {name, run(harness)} so it
//  shares process with the other suites. JSDOM setup is delegated to
//  harness.createMobileWindow.
//  ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'mobile',
  async run(harness) {
    const { window } = await harness.createMobileWindow({ 'bs_mock': '1', 'bs_bets': '[]', 'bs_bal': '1000' });
    const fails = [];
    const assert = harness.createAssert(fails);
    const tick = harness.tick;

    await tick(); await tick(); await tick();
    await new Promise(r => setTimeout(r, 60));

    const w = window;
    const doc = window.document;

    // ── 1. Mobile board renders stacked cards ─────────────────────────────
    console.log('\n--- 1. Mobile board renders stacked cards ---');
    const cards = doc.querySelectorAll('.mob-gcard');
    console.log('  .mob-gcard count:', cards.length);
    assert(cards.length >= 1, 'at least one .mob-gcard rendered');
    const rows = doc.querySelectorAll('.mob-gcard-row');
    assert(rows.length >= 3, 'each card has header + 2 team rows');

    // ── 2. Tap a straight odds button ─────────────────────────────────────
    console.log('\n--- 2. Tap straight odds button ---');
    const oddsBtns = Array.from(doc.querySelectorAll('.mob-obtn')).filter(b => !b.disabled);
    console.log('  enabled .mob-obtn count:', oddsBtns.length);
    assert(oddsBtns.length > 0, 'at least one tappable .mob-obtn exists');
    oddsBtns[0].click();
    await tick();
    const selBtn = doc.querySelector('.mob-obtn.sel');
    assert(selBtn !== null, 'tapped button shows .sel state');
    const contBar = doc.getElementById('mob-continue-bar');
    assert(!contBar.classList.contains('hidden'), 'continue bar appears after slip add');
    const contCnt = doc.getElementById('mob-continue-cnt');
    assert(contCnt.textContent === '1', 'continue counter shows 1');

    // ── 3. Open review → place wager ──────────────────────────────────────
    console.log('\n--- 3. Open straight review → place ---');
    w.openReview();
    await tick();
    const rvOverlay = doc.getElementById('mob-review-overlay');
    assert(rvOverlay.classList.contains('open'), 'review overlay opens');
    const rvBody = doc.getElementById('mob-review-body');
    assert(rvBody.querySelector('.mob-rv-leg') !== null, 'review shows leg row');
    const winInp = rvBody.querySelector('input[data-role="win"]');
    assert(winInp !== null, 'review has win input');
    // bump it (default 50 already, ensure recompute happens)
    winInp.value = '50';
    winInp.dispatchEvent(new window.Event('input'));
    await tick();
    const confirm = doc.getElementById('mob-rv-confirm');
    assert(confirm && !confirm.disabled, 'confirm button enabled with valid win');
    const balBefore = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    confirm.click();
    await tick();
    assert(!rvOverlay.classList.contains('open'), 'review overlay closes after place');
    const balAfter = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    assert(balAfter < balBefore, `balance decreased (${balBefore} → ${balAfter})`);

    // ── 4. My Bets overlay shows the placed bet ───────────────────────────
    console.log('\n--- 4. Open My Bets ---');
    w.openBets();
    await tick();
    const betsOverlay = doc.getElementById('mob-bets-overlay');
    assert(betsOverlay.classList.contains('open'), 'bets overlay opens');
    const betCards = doc.querySelectorAll('.mob-betcard');
    assert(betCards.length === 1, '1 bet card rendered');
    const statusBadge = betCards[0].querySelector('.mob-betcard-st');
    assert(statusBadge && statusBadge.textContent.trim() === 'PENDING', 'bet status is PENDING');
    const settleBtns = betCards[0].querySelectorAll('.mob-settle-btn');
    assert(settleBtns.length === 3, '3 settle buttons (won/push/lost)');

    // ── 5. Settle as won ──────────────────────────────────────────────────
    console.log('\n--- 5. Settle won → balance credited ---');
    const balPreSettle = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    const wonBtn = betCards[0].querySelector('.mob-settle-btn.won');
    wonBtn.click();
    await tick();
    const balPostSettle = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    assert(balPostSettle > balPreSettle, `balance credited after won (${balPreSettle} → ${balPostSettle})`);
    const updatedCards = doc.querySelectorAll('.mob-betcard');
    const newStatus = updatedCards[0].querySelector('.mob-betcard-st');
    assert(newStatus && newStatus.textContent.trim() === 'WON', 'card now shows WON');
    // No settle buttons on settled card
    assert(updatedCards[0].querySelectorAll('.mob-settle-btn').length === 0, 'settle buttons removed on settled card');
    w.closeBets();

    // ── 6. Parlay flow: 2 picks → review → place ──────────────────────────
    console.log('\n--- 6. Parlay 2-leg place ---');
    w.setMode('parlay');
    await tick();
    const pBtns = Array.from(doc.querySelectorAll('.mob-obtn')).filter(b => !b.disabled);
    pBtns[0].click(); pBtns[3].click();  // 2 different buttons (different rows)
    await tick();
    const parBadge = doc.getElementById('par-badge');
    assert(parBadge.textContent === '2', 'par-badge shows 2 legs');
    const contBar2 = doc.getElementById('mob-continue-bar');
    assert(!contBar2.classList.contains('hidden'), 'continue bar appears with 2 parlay legs');
    w.openReview();
    await tick();
    assert(doc.getElementById('mob-review-overlay').classList.contains('open'), 'parlay review opens');
    const pmRisk = doc.getElementById('mob-pm-risk');
    assert(pmRisk !== null, 'parlay risk input exists');
    pmRisk.value = '50';
    pmRisk.dispatchEvent(new window.Event('input'));
    await tick();
    const pmConfirm = doc.getElementById('mob-rv-confirm');
    assert(!pmConfirm.disabled, 'parlay confirm enabled at $50 risk');
    const balPreP = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    pmConfirm.click();
    await tick();
    const balPostP = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    assert(balPostP === balPreP - 50, `parlay risk deducted ($50): ${balPreP} → ${balPostP}`);
    assert(doc.querySelectorAll('.mob-obtn.sel').length === 0, 'parlay legs cleared from board after place');

    // ── 7. If Bet flow ────────────────────────────────────────────────────
    console.log('\n--- 7. If Bet 2-leg place ---');
    w.setMode('ifbet');
    await tick();
    const ifBtns = Array.from(doc.querySelectorAll('.mob-obtn')).filter(b => !b.disabled);
    ifBtns[0].click(); ifBtns[3].click();
    await tick();
    assert(doc.getElementById('if-badge').textContent === '2', 'if-badge shows 2 legs');
    w.openReview();
    await tick();
    const ifConfirm = doc.getElementById('mob-rv-confirm');
    assert(ifConfirm && !ifConfirm.disabled, 'ifbet confirm enabled (default $50 win per leg)');
    const balPreI = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    ifConfirm.click();
    await tick();
    const balPostI = parseFloat(doc.getElementById('bal-disp').textContent.replace(/[^0-9.-]/g, ''));
    assert(balPostI < balPreI, `ifbet leg-1 risk deducted: ${balPreI} → ${balPostI}`);

    // Verify My Bets now has 3 bets (1 won, 1 parlay, 1 ifbet)
    w.openBets();
    await tick();
    const finalCards = doc.querySelectorAll('.mob-betcard');
    assert(finalCards.length === 3, `My Bets shows 3 cards (got ${finalCards.length})`);

    console.log('\n────────────────────────────────────────');
    console.log(`Total fails: ${fails.length}`);
    if (fails.length) {
      console.log('FAILED ASSERTIONS:');
      fails.forEach(f => console.log('  - ' + f));
    }
    console.log('All mobile assertions passed.');

    return { name: 'mobile', fails };
  }
};

