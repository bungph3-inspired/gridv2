// ════════════════════════════════════════════════════════════════════════════
//  verify_props.cjs — module form, called by harness via run_all.cjs
//  ────────────────────────────────────────────────────────────────────────────
//  Was a standalone jsdom script. Now exports {name, run(harness)} so it
//  shares process with the other suites. JSDOM setup is delegated to
//  harness.createDesktopWindow.
//  ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'props',
  async run(harness) {
    const { window } = await harness.createDesktopWindow({ 'bs_mock': '1' });
    const fails = [];
    const assert = harness.createAssert(fails);
    const tick = harness.tick;

    await new Promise(r => setTimeout(r, 80));

    // ── 1. Game banners ────────────────────────────────────────────────────
    console.log('--- 1. Game banners ---');
    const banners = window.document.querySelectorAll('.prop-banner');
    console.log('  banner count:', banners.length);
    assert(banners.length === 3, '3 banners (one per game)');
    if (banners.length) assert(banners[0].textContent.includes('Player Props'), 'banner contains "Player Props"');

    // ── 2. Prop cards ──────────────────────────────────────────────────────
    console.log('\n--- 2. Prop card count ---');
    const cards = window.document.querySelectorAll('.prop-card');
    console.log('  card count:', cards.length);
    assert(cards.length === 54, '54 cards total (3 games × 18 props each)');

    // ── 3. Card structure ──────────────────────────────────────────────────
    console.log('\n--- 3. Card header + 2 rows ---');
    const firstCard = cards[0];
    const cardHdr = firstCard.querySelector('.prop-card-hdr');
    const betRows = firstCard.querySelectorAll('.prop-bet-row');
    assert(cardHdr !== null, 'card has header');
    if (cardHdr) {
      console.log('  hdr text:', cardHdr.textContent.replace(/\s+/g, ' ').trim());
      assert(/AM|PM|UTC|PT/i.test(cardHdr.textContent), 'header has time tag (AM/PM/PT/UTC)');
      assert(/total\s+points/i.test(cardHdr.textContent), 'header describes the prop (total points)');
    }
    assert(betRows.length === 2, 'card has exactly 2 bet rows (Over + Under)');

    // ── 4. Bet IDs ─────────────────────────────────────────────────────────
    console.log('\n--- 4. Bet IDs ---');
    const firstBetIds = Array.from(firstCard.querySelectorAll('.prop-bet-id')).map(el => el.textContent);
    console.log('  first card ids:', firstBetIds);
    assert(firstBetIds.length === 2, 'first card has 2 bet-ids');
    assert(firstBetIds[0] === '509011', 'Over bet-id is 509011 (game 0, prop 0, side O)');
    assert(firstBetIds[1] === '509012', 'Under bet-id is 509012');

    // ── 5. Straight mode shape: input + odds button ────────────────────────
    console.log('\n--- 5. Straight mode row shape ---');
    const firstBetRow = betRows[0];
    const inp = firstBetRow.querySelector('input.wager-inp');
    const btn = firstBetRow.querySelector('.prop-obtn');
    assert(inp !== null, 'row has wager input');
    assert(btn !== null, 'row has prop-obtn');
    console.log('  btn text:', btn.textContent.trim());
    assert(/^o\d/.test(btn.textContent.trim()), 'Over button shows o-prefixed line');

    // ── 6. Click toggles selection ─────────────────────────────────────────
    console.log('\n--- 6. Click toggle ---');
    btn.click(); await tick();
    assert(btn.classList.contains('sel'), 'btn has .sel after click');
    const contCnt = window.document.getElementById('continue-cnt');
    assert(contCnt.textContent === '(1)', 'continue count = 1');
    btn.click(); await tick();
    assert(!btn.classList.contains('sel'), 'btn loses .sel after second click');
    assert(contCnt.textContent === '(0)', 'continue count back to 0');

    // ── 7. Parlay mode ─────────────────────────────────────────────────────
    console.log('\n--- 7. Parlay mode (no input, click-to-add) ---');
    window.setMode('parlay'); await tick(); await new Promise(r => setTimeout(r, 30));
    const pCards = window.document.querySelectorAll('.prop-card');
    const pFirstRow = pCards[0].querySelector('.prop-bet-row');
    const pInp = pFirstRow.querySelector('input.wager-inp');
    const pBtn = pFirstRow.querySelector('.prop-obtn');
    assert(pInp === null, 'no wager input in parlay mode');
    assert(pBtn !== null, 'still has prop-obtn');
    pBtn.click(); await tick();
    // Add a second prop pick
    const pBtn2 = pCards[1].querySelector('.prop-bet-row .prop-obtn');
    pBtn2.click(); await tick();
    const parBadge = window.document.getElementById('par-badge');
    assert(parBadge.textContent === '2', 'parlay badge = 2 after 2 prop picks');

    // ── 8. If Bet mode ─────────────────────────────────────────────────────
    console.log('\n--- 8. IfBet mode ---');
    window.setMode('ifbet'); await tick(); await new Promise(r => setTimeout(r, 30));
    const iCards = window.document.querySelectorAll('.prop-card');
    iCards[0].querySelector('.prop-obtn').click(); await tick();
    iCards[1].querySelector('.prop-obtn').click(); await tick();
    const ifBadge = window.document.getElementById('if-badge');
    assert(ifBadge.textContent === '2', 'if-badge = 2 after 2 prop picks');

    // ── 9. Teaser mode hides prop sections ─────────────────────────────────
    console.log('\n--- 9. Teaser mode hides props ---');
    window.setMode('teaser'); await tick(); await new Promise(r => setTimeout(r, 30));
    // Pick variant to get past the menu
    const tmBtn = Array.from(window.document.querySelectorAll('.tm-vbtn')).find(b => b.textContent.includes('PRIME 6') && !b.textContent.includes('6.5'));
    if (tmBtn) {
      tmBtn.click(); await tick(); await new Promise(r => setTimeout(r, 30));
      const tCards = window.document.querySelectorAll('.prop-card');
      console.log('  prop cards in teaser mode:', tCards.length);
      assert(tCards.length === 0, 'no prop cards rendered in teaser mode');
    }

    // ── Final ──────────────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════════════════════════');
    if (fails.length === 0) console.log('✓ ALL PASS');
    else { console.log(`✗ ${fails.length} FAIL:`); fails.forEach(f => console.log('  - '+f)); }
    console.log('════════════════════════════════════════════════════════════');

    return { name: 'props', fails };
  }
};

