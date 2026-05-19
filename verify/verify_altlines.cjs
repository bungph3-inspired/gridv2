// ════════════════════════════════════════════════════════════════════════════
//  verify_altlines.cjs — module form, called by harness via run_all.cjs
//  ────────────────────────────────────────────────────────────────────────────
//  Was a standalone jsdom script. Now exports {name, run(harness)} so it
//  shares process with the other suites. JSDOM setup is delegated to
//  harness.createDesktopWindow.
//  ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'altlines',
  async run(harness) {
    const { window } = await harness.createDesktopWindow({ bs_mock: '1', bs_alt: '1' });
    const fails = [];
    const assert = harness.createAssert(fails);
    const tick = harness.tick;

    const w = window;
    console.log('Has setMode:', typeof w.setMode);
    console.log('Has openSettings:', typeof w.openSettings);

    // ── 1. Alt-line presence in board DOM ──────────────────────────────────
    console.log('\n--- 1. Alt-line data + chevron presence ---');
    // Wait extra time for the mock router → normalizeGames pipeline
    await new Promise(r => setTimeout(r, 50));
    const chevrons = window.document.querySelectorAll('.alt-chev:not(.prop-alt-chev)');
    console.log('  game-line .alt-chev count after init (excludes prop-alt-chev):', chevrons.length);
    assert(chevrons.length > 0, '.alt-chev rendered on board (game-line only)');

    // Find a Lakers spread chevron specifically
    const board = window.document.getElementById('board');
    const trows = board.querySelectorAll('.trow-g');
    console.log('  team rows on board:', trows.length);
    assert(trows.length >= 6, 'at least 6 team rows (3 games × 2 teams)');

    // ── 2. Open popover on first chevron ───────────────────────────────────
    console.log('\n--- 2. Open popover ---');
    const firstChev = chevrons[0];
    firstChev.click();
    await tick();
    const pop = window.document.querySelector('.alt-pop');
    assert(pop !== null, 'popover element appears after chevron click');
    if (pop) {
      const rows = pop.querySelectorAll('.alt-pop-row');
      console.log('  popover rows:', rows.length);
      assert(rows.length > 1, 'popover has multiple alt-line rows');
      const mainRow = pop.querySelector('.alt-pop-row.main');
      assert(mainRow !== null, 'one row marked as main');
    }

    // ── 3. Pick an alt in straight mode ────────────────────────────────────
    console.log('\n--- 3. Pick alt in straight mode ---');
    // Initial mode is straight. Click the second-to-last row to get a non-main alt.
    if (pop) {
      const rows = Array.from(pop.querySelectorAll('.alt-pop-row'));
      const nonMain = rows.find(r => !r.classList.contains('main'));
      const pickedLine = nonMain.querySelector('.alt-pop-line').textContent;
      const pickedVig = nonMain.querySelector('.alt-pop-vig').textContent;
      console.log('  picking line:', pickedLine, 'vig:', pickedVig);
      nonMain.click();
      await tick();
      // Popover should close
      assert(window.document.querySelector('.alt-pop') === null, 'popover closes after pick');
      // Find the new selected odds button on the board — it should display the picked line
      const selBtn = board.querySelector('.obtn.sel');
      if (selBtn) {
        const onumEl = selBtn.querySelector('.onum');
        const renderedLine = onumEl ? onumEl.textContent : '';
        console.log('  selected button .onum:', renderedLine);
        assert(renderedLine === pickedLine, `selected button shows picked line (${pickedLine})`);
      } else {
        assert(false, 'a .obtn.sel exists after alt pick (straight)');
      }
    }

    // ── 4. Switch to parlay mode, pick alt ─────────────────────────────────
    console.log('\n--- 4. Pick alt in parlay mode ---');
    w.setMode('parlay');
    await tick();
    const pChevrons = window.document.querySelectorAll('.alt-chev:not(.prop-alt-chev)');
    assert(pChevrons.length > 0, 'chevrons still present in parlay mode');
    if (pChevrons.length) {
      pChevrons[0].click(); await tick();
      const pop2 = window.document.querySelector('.alt-pop');
      assert(pop2 !== null, 'popover opens in parlay mode');
      if (pop2) {
        const rows = Array.from(pop2.querySelectorAll('.alt-pop-row'));
        const target = rows.find(r => !r.classList.contains('main'));
        const pickedLine = target.querySelector('.alt-pop-line').textContent;
        console.log('  picking parlay alt:', pickedLine);
        target.click(); await tick();
        const selPbtn = window.document.querySelector('.pbtn.sel');
        assert(selPbtn !== null, 'parlay button selected after pick');
        if (selPbtn) {
          assert(selPbtn.textContent.startsWith(pickedLine), `pbtn shows picked line (${pickedLine}) in "${selPbtn.textContent}"`);
        }
        const parBadge = window.document.getElementById('par-badge');
        assert(parBadge.textContent === '1', 'par-badge shows 1 leg');
      }
    }

    // ── 5. Switch to ifbet mode, pick alt ──────────────────────────────────
    console.log('\n--- 5. Pick alt in ifbet mode ---');
    w.setMode('ifbet');
    await tick();
    const iChevrons = window.document.querySelectorAll('.alt-chev:not(.prop-alt-chev)');
    assert(iChevrons.length > 0, 'chevrons present in ifbet mode');
    if (iChevrons.length) {
      iChevrons[0].click(); await tick();
      const pop3 = window.document.querySelector('.alt-pop');
      assert(pop3 !== null, 'popover opens in ifbet mode');
      if (pop3) {
        const target = Array.from(pop3.querySelectorAll('.alt-pop-row')).find(r => !r.classList.contains('main'));
        target.click(); await tick();
        const ifBadge = window.document.getElementById('if-badge');
        assert(ifBadge.textContent === '1', 'if-badge shows 1 leg');
      }
    }

    // ── 6. Teaser mode: pick variant first, then alt ──────────────────────
    console.log('\n--- 6. Pick alt in teaser mode ---');
    w.setMode('teaser');
    await tick();
    // Variant menu is up. Pick PRIME 6.
    const tmBtns = window.document.querySelectorAll('.tm-vbtn');
    console.log('  teaser variant buttons:', tmBtns.length);
    const p6 = Array.from(tmBtns).find(b => b.textContent.includes('PRIME 6') && !b.textContent.includes('6.5'));
    if (p6) {
      p6.click(); await tick();
      const tChevrons = window.document.querySelectorAll('.alt-chev:not(.prop-alt-chev)');
      console.log('  chevrons after variant pick:', tChevrons.length);
      assert(tChevrons.length > 0, 'chevrons present in teaser board mode');
      if (tChevrons.length) {
        tChevrons[0].click(); await tick();
        const pop4 = window.document.querySelector('.alt-pop');
        assert(pop4 !== null, 'popover opens in teaser mode');
        if (pop4) {
          const target = Array.from(pop4.querySelectorAll('.alt-pop-row')).find(r => !r.classList.contains('main'));
          target.click(); await tick();
          const teaBadge = window.document.getElementById('tea-badge');
          assert(teaBadge.textContent === '1', 'tea-badge shows 1 leg');
          // Teaser cell should display orig→shifted on the chosen alt
          const selT = window.document.querySelector('.tbtn.sel');
          assert(selT !== null, 'teaser button selected after alt pick');
          if (selT) {
            const origEl = selT.querySelector('.torig');
            assert(origEl && origEl.textContent.length > 0, 'teaser button has .torig original line');
          }
        }
      }
    } else {
      console.log('  PRIME 6 button not found — variant menu state?');
    }

    // ── 7. Click-outside closes popover ────────────────────────────────────
    console.log('\n--- 7. Click-outside closes popover ---');
    w.setMode('parlay'); await tick();
    const chevs = window.document.querySelectorAll('.alt-chev:not(.prop-alt-chev)');
    if (chevs.length) {
      chevs[0].click(); await tick();
      assert(window.document.querySelector('.alt-pop') !== null, 'popover open');
      // Click somewhere unrelated (board-title element)
      const btitle = window.document.getElementById('board-title');
      btitle.click(); await tick();
      assert(window.document.querySelector('.alt-pop') === null, 'popover closed by outside click');
    }

    // ── 8. Re-pick same alt: idempotent (still 1 leg in parlay) ────────────
    console.log('\n--- 8. Idempotent re-pick ---');
    const chevs2 = window.document.querySelectorAll('.alt-chev:not(.prop-alt-chev)');
    if (chevs2.length) {
      chevs2[0].click(); await tick();
      const pop = window.document.querySelector('.alt-pop');
      if (pop) {
        const target = Array.from(pop.querySelectorAll('.alt-pop-row')).find(r => !r.classList.contains('main'));
        const line = target.querySelector('.alt-pop-line').textContent;
        target.click(); await tick();
        // Re-open + re-pick same row
        const chevs3 = window.document.querySelectorAll('.alt-chev:not(.prop-alt-chev)');
        chevs3[0].click(); await tick();
        const pop2 = window.document.querySelector('.alt-pop');
        const sameRow = Array.from(pop2.querySelectorAll('.alt-pop-row')).find(r => r.querySelector('.alt-pop-line').textContent === line);
        sameRow.click(); await tick();
        const parBadge = window.document.getElementById('par-badge');
        assert(parBadge.textContent === '1', 'parlay still 1 leg after re-picking same alt (idempotent swap, not stack)');
      }
    }

    // ── Final report ───────────────────────────────────────────────────────
    console.log('\n============================================================');
    if (fails.length === 0) console.log('ALL PASS');
    else { console.log(`${fails.length} FAIL:`); fails.forEach(f => console.log('  - '+f)); }
    return { name: 'altlines', fails };
  }
};
