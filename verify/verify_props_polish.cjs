// ════════════════════════════════════════════════════════════════════════════
//  verify_props_polish.cjs — module form, called by harness via run_all.cjs
//  ────────────────────────────────────────────────────────────────────────────
//  Was a standalone jsdom script. Now exports {name, run(harness)} so it
//  shares process with the other suites. JSDOM setup is delegated to
//  harness.createDesktopWindow.
//  ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'props_polish',
  async run(harness) {
    const { window } = await harness.createDesktopWindow({ 'bs_mock': '1' });
    const fails = [];
    const assert = harness.createAssert(fails);
    const tick = harness.tick;

    await new Promise(r => setTimeout(r, 80));

    // Props are always visible now (LC797 layout, not collapsible) — no toggle needed.

    // ── 1. Selections rail (parlay) — player + market label ────────────────
    console.log('--- 1. Selections rail polish (parlay) ---');
    window.setMode('parlay'); await tick(); await new Promise(r => setTimeout(r, 30));
    const propBtns = window.document.querySelectorAll('.prop-card .prop-obtn');
    // Click LeBron's Over (first prop, Over button)
    propBtns[0].click(); await tick();
    // Click second prop's Under (LeBron Rebounds Under)
    propBtns[3].click(); await tick();
    const selLegs = window.document.querySelectorAll('#sel-legs .sel-leg');
    console.log('  rail legs:', selLegs.length);
    assert(selLegs.length === 2, 'rail has 2 prop legs');
    const firstSelText = selLegs[0].textContent;
    console.log('  first leg text:', firstSelText.replace(/\s+/g, ' ').trim());
    assert(firstSelText.includes('LeBron James'), 'first leg shows player name (LeBron James)');
    assert(firstSelText.includes('Points'), 'first leg shows market label (Points)');
    assert(firstSelText.includes('OVER'), 'first leg shows side (OVER)');
    assert(!firstSelText.includes('prop_pts'), 'first leg does NOT show raw type code');

    // ── 2. Parlay modal pmleg shows player + market label ──────────────────
    console.log('\n--- 2. Parlay modal pmleg ---');
    window.openParlayModal();
    await tick();
    const pmlegs = window.document.querySelectorAll('#pmlegs .pmleg');
    console.log('  pmlegs:', pmlegs.length);
    assert(pmlegs.length === 2, '2 pmlegs rendered');
    const pmText = pmlegs[0].textContent;
    console.log('  pmleg 1 text:', pmText.replace(/\s+/g,' ').trim());
    assert(pmText.includes('LeBron James'), 'pmleg shows player name');
    assert(pmText.includes('Points'), 'pmleg shows market label');
    assert(pmText.includes('OVER'), 'pmleg shows side');
    window.closePM();

    // ── 3. IF bet review modal renderIFLegs ────────────────────────────────
    console.log('\n--- 3. IF bet review modal renderIFLegs ---');
    window.setMode('ifbet'); await tick(); await new Promise(r => setTimeout(r, 30));
    const iPropBtns = window.document.querySelectorAll('.prop-card .prop-obtn');
    iPropBtns[0].click(); await tick();
    iPropBtns[2].click(); await tick();
    // Open ifbet review modal
    const ifContinue = window.document.getElementById('sel-continue');
    ifContinue.click(); await tick();
    const ifLegRows = window.document.querySelectorAll('#iflegs .if-leg');
    console.log('  if-leg rows:', ifLegRows.length);
    assert(ifLegRows.length === 2, '2 if-leg rows');
    const ifLegText = ifLegRows[0].textContent;
    console.log('  if-leg 1 text:', ifLegText.replace(/\s+/g,' ').trim());
    assert(ifLegText.includes('LeBron James'), 'if-leg shows player name');
    assert(ifLegText.includes('Points'), 'if-leg shows market label');
    window.closeIF();

    // ── 4. Straight review screen ──────────────────────────────────────────
    console.log('\n--- 4. Straight review screen ---');
    window.setMode('straight'); await tick(); await new Promise(r => setTimeout(r, 30));
    const sPropBtns = window.document.querySelectorAll('.prop-card .prop-obtn');
    sPropBtns[0].click(); await tick();
    // Click main CONTINUE — but in straight mode the click needs a positive win amount
    // The straight prop click defaults win to 50. Continue.
    window.onContinue(); await tick();
    const rvRows = window.document.querySelectorAll('#rv-body tr');
    console.log('  rv rows:', rvRows.length);
    assert(rvRows.length === 1, '1 review row');
    const rvText = rvRows[0].textContent;
    console.log('  rv row 1 text:', rvText.replace(/\s+/g,' ').trim().slice(0, 120));
    assert(rvText.includes('LeBron James'), 'review row title is player name');
    assert(rvText.includes('Points'), 'review row sub shows market label');
    assert(rvText.includes('OVER'), 'review row odds shows side');

    // ── 5. Place wager and verify My Bets card ─────────────────────────────
    console.log('\n--- 5. My Bets card (placed straight prop) ---');
    window.confirmWagers(); await tick();
    window.openBets(); await tick();
    const betCards = window.document.querySelectorAll('#bmodal-body .betcard');
    console.log('  bet cards:', betCards.length);
    assert(betCards.length >= 1, 'at least 1 bet card');
    if (betCards.length) {
      const cardText = betCards[0].textContent;
      console.log('  card text:', cardText.replace(/\s+/g,' ').trim().slice(0, 200));
      assert(cardText.includes('LeBron James'), 'card title shows player name');
      assert(cardText.includes('Points'), 'card shows market label');
      assert(cardText.includes('OVER'), 'card shows side');
      assert(!cardText.includes('prop_pts'), 'card does NOT show raw type code');
    }
    window.closeBets();

    // ── 6. My Bets card for prop parlay ────────────────────────────────────
    console.log('\n--- 6. My Bets card (placed prop parlay) ---');
    window.setMode('parlay'); await tick(); await new Promise(r => setTimeout(r, 30));
    const ppBtns = window.document.querySelectorAll('.prop-card .prop-obtn');
    ppBtns[0].click(); await tick();
    ppBtns[2].click(); await tick();
    window.openParlayModal(); await tick();
    window.confirmParlay(); await tick();
    window.openBets(); await tick();
    const cards2 = window.document.querySelectorAll('#bmodal-body .betcard');
    console.log('  bet cards now:', cards2.length);
    if (cards2.length) {
      // Newest card is at index 0 (renderBetsModal reverses)
      const newest = cards2[0].textContent;
      console.log('  newest card:', newest.replace(/\s+/g,' ').trim().slice(0, 240));
      assert(newest.includes('Parlay'), 'card titled Parlay');
      assert(newest.includes('LeBron James'), 'parlay leg list shows player name');
      assert(newest.includes('Points'), 'parlay leg list shows market label');
      assert(!newest.includes('prop_pts'), 'no raw type code in parlay card');
    }

    console.log('\n════════════════════════════════════════════════════════════');
    if (fails.length === 0) console.log('✓ ALL PASS');
    else { console.log(`✗ ${fails.length} FAIL:`); fails.forEach(f => console.log('  - '+f)); }
    console.log('════════════════════════════════════════════════════════════');

    return { name: 'props_polish', fails };
  }
};

