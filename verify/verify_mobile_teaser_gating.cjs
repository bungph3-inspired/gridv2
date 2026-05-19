// ════════════════════════════════════════════════════════════════════════════
//  verify_mobile_teaser_gating.cjs — module form, called by harness via run_all.cjs
//  ────────────────────────────────────────────────────────────────────────────
//  Was a standalone jsdom script. Now exports {name, run(harness)} so it
//  shares process with the other suites. JSDOM setup is delegated to
//  harness.createMobileWindow.
//  ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'mobile_teaser_gating',
  async run(harness) {
    const { window } = await harness.createMobileWindow({ 'bs_mock': '1', 'bs_bets': '[]', 'bs_bal': '1000' });
    const fails = [];
    const assert = harness.createAssert(fails);
    const tick = harness.tick;

    // Helpers (were module-scope const in the standalone version)
    const activeMode = (doc) => {
      const a = doc.querySelector('.mob-nbtn.active');
      if (!a) return null;
      return (a.id || '').replace(/^nav-/, '');
    };
    const teaBadgeCount = (doc) => {
      const b = doc.getElementById('tea-badge');
      if (!b) return null;
      return b.classList.contains('hidden') ? 0 : parseInt(b.textContent || '0', 10);
    };

    const w = window;
    const doc = window.document;

    const teaserBtn = doc.getElementById('nav-teaser');
    assert(teaserBtn !== null, '#nav-teaser button exists');

    // ── 1. Init (NBA) → Teaser tab is NOT disabled ────────────────────────
    console.log('\n--- 1. Init on NBA — Teaser enabled ---');
    assert(!teaserBtn.classList.contains('disabled'), '#nav-teaser is not .disabled on NBA');
    assert(activeMode(doc) === 'straight', `init mode is straight (got '${activeMode(doc)}')`);

    // ── 2. Switch to MLB → Teaser tab gains .disabled ──────────────────────
    console.log('\n--- 2. setSport(MLB) — Teaser disabled ---');
    w.setSport('MLB');
    await tick();
    assert(teaserBtn.classList.contains('disabled'), '#nav-teaser is .disabled on MLB');

    // ── 3. setMode('teaser') on MLB → rejected (still on straight) ────────
    console.log('\n--- 3. setMode("teaser") on MLB → rejected ---');
    w.setMode('teaser');
    await tick();
    assert(activeMode(doc) === 'straight', `Straight tab stays active (got '${activeMode(doc)}')`);
    assert(doc.getElementById('mob-teaser-menu') === null, 'no #mob-teaser-menu rendered');
    assert(doc.querySelectorAll('.mob-tbtn').length === 0, 'no .mob-tbtn teaser cells rendered');

    // ── 4. Back to NBA → Teaser re-enabled ────────────────────────────────
    console.log('\n--- 4. setSport(NBA) — Teaser re-enabled ---');
    w.setSport('NBA');
    await tick();
    assert(!teaserBtn.classList.contains('disabled'), '#nav-teaser .disabled removed on NBA');

    // ── 5. NHL → disabled ─────────────────────────────────────────────────
    console.log('\n--- 5. setSport(NHL) — Teaser disabled ---');
    w.setSport('NHL');
    await tick();
    assert(teaserBtn.classList.contains('disabled'), '#nav-teaser is .disabled on NHL');

    // ── 6. NCAAB → enabled (basketball college) ───────────────────────────
    console.log('\n--- 6. setSport(NCAAB) — Teaser enabled ---');
    w.setSport('NCAAB');
    await tick();
    assert(!teaserBtn.classList.contains('disabled'), '#nav-teaser enabled on NCAAB');

    // ── 7. NCAAF → enabled (football college) ─────────────────────────────
    console.log('\n--- 7. setSport(NCAAF) — Teaser enabled ---');
    w.setSport('NCAAF');
    await tick();
    assert(!teaserBtn.classList.contains('disabled'), '#nav-teaser enabled on NCAAF');

    // ── 8. Enter teaser on NBA → switch to MLB → falls back to Straight ───
    console.log('\n--- 8. Teaser on NBA → switch to MLB → falls back to Straight ---');
    w.setSport('NBA');
    await tick();
    await new Promise(r => setTimeout(r, 40));
    w.setMode('teaser');
    await tick();
    assert(activeMode(doc) === 'teaser', `teaser is active on NBA (got '${activeMode(doc)}')`);
    assert(doc.getElementById('mob-teaser-menu') !== null, 'variant menu present on NBA');
    // Pick PRIME6 to clear menu and render teaser cells
    w.selectMobileTeaserVariant('PRIME6');
    await tick();
    assert(doc.getElementById('mob-teaser-menu') === null, 'variant menu hidden after pick');
    const tbtns = doc.querySelectorAll('.mob-tbtn');
    assert(tbtns.length > 0, `teaser cells rendered (>0, got ${tbtns.length})`);
    // Add a leg so we can verify it's cleared on sport switch
    tbtns[0].click();
    await tick();
    assert(teaBadgeCount(doc) === 1, `1 teaser leg added (badge=${teaBadgeCount(doc)})`);
    // Now switch to MLB while in teaser mode
    w.setSport('MLB');
    await tick();
    assert(activeMode(doc) === 'straight', `wagerMode falls back to 'straight' on MLB (got '${activeMode(doc)}')`);
    assert(teaBadgeCount(doc) === 0, `teaserLegs cleared (badge=${teaBadgeCount(doc)})`);
    assert(doc.querySelectorAll('.mob-tbtn.sel').length === 0, 'no selected teaser cells after fallback');
    assert(doc.getElementById('mob-teaser-menu') === null, 'no variant menu after fallback');
    assert(teaserBtn.classList.contains('disabled'), 'Teaser tab is .disabled on MLB');

    // ── 9. setMode('parlay') still works on MLB (non-teaser modes ungated) ─
    console.log('\n--- 9. setMode("parlay") still allowed on MLB ---');
    w.setMode('parlay');
    await tick();
    assert(activeMode(doc) === 'parlay', `parlay mode allowed on MLB (got '${activeMode(doc)}')`);

    // ── 10. Re-enter teaser on a later eligible sport (NCAAB) ─────────────
    console.log('\n--- 10. Re-enter teaser on NCAAB after MLB detour ---');
    w.setSport('NCAAB');
    await tick();
    await new Promise(r => setTimeout(r, 40));
    assert(!teaserBtn.classList.contains('disabled'), 'Teaser tab enabled on NCAAB');
    w.setMode('teaser');
    await tick();
    assert(activeMode(doc) === 'teaser', `teaser mode entered on NCAAB (got '${activeMode(doc)}')`);
    // Variant menu re-appears (no stale variant carried over)
    assert(doc.getElementById('mob-teaser-menu') !== null, 'variant menu shown again on NCAAB');
    assert(doc.querySelectorAll('.mob-tbtn').length === 0, 'no teaser cells until variant picked');

    return { name: 'mobile_teaser_gating', fails };
  }
};
