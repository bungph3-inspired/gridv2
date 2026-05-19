// ════════════════════════════════════════════════════════════════════════════
//  verify_altlines_toggle.cjs — module form, called by harness via run_all.cjs
//  ────────────────────────────────────────────────────────────────────────────
//  Multi-scenario suite (builds 4 separate JSDOMs with different bs_alt seeds).
//  Each scenario calls harness.createDesktopWindow with its own seeds.
//  ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'altlines_toggle',
  async run(harness) {
    const fails = [];
    const assert = harness.createAssert(fails);
    const tick = harness.tick;
    const wait = harness.wait;

    // ── 1. Default (no localStorage) → no chevrons ─────────────────────────
    console.log('\n--- 1. Default state (no bs_alt key) ---');
    let dom = await harness.createDesktopWindow({ bs_mock: '1', bs_alt: null });
    let w = dom.window;
    let chev = w.document.querySelectorAll('.alt-chev');
    console.log('  .alt-chev count on first paint:', chev.length);
    assert(chev.length === 0, 'no chevrons rendered when bs_alt unset (hidden by default)');

    // ── 2. Settings checkbox + sync ────────────────────────────────────────
    console.log('\n--- 2. Settings checkbox + sync ---');
    const altCbx = w.document.getElementById('alt-cbx');
    assert(altCbx !== null, '#alt-cbx exists in settings modal');
    w.openSettings();
    await tick();
    assert(altCbx.checked === false, '#alt-cbx unchecked by default');
    const altStatus = w.document.getElementById('alt-status');
    assert(altStatus && altStatus.textContent.includes('Show'), '#alt-status shows opt-in message');

    // ── 3. Toggle ON → chevrons render + localStorage flips ────────────────
    console.log('\n--- 3. Toggle ON ---');
    altCbx.checked = true;
    w.toggleAltLines();
    await tick();
    chev = w.document.querySelectorAll('.alt-chev');
    console.log('  .alt-chev count after toggle ON:', chev.length);
    assert(chev.length > 0, 'chevrons appear after toggle ON');
    assert(w.localStorage.getItem('bs_alt') === '1', 'localStorage.bs_alt === "1" after ON');
    assert(altStatus.textContent.includes('Showing'), 'status text updates to "Showing"');

    // ── 4. Toggle OFF → chevrons gone, flag = "0" ──────────────────────────
    console.log('\n--- 4. Toggle OFF ---');
    altCbx.checked = false;
    w.toggleAltLines();
    await tick();
    chev = w.document.querySelectorAll('.alt-chev');
    console.log('  .alt-chev count after toggle OFF:', chev.length);
    assert(chev.length === 0, 'chevrons removed after toggle OFF');
    assert(w.localStorage.getItem('bs_alt') === '0', 'localStorage.bs_alt === "0" after OFF');

    // ── 5. Pre-seeded "1" → chevrons on first paint ────────────────────────
    console.log('\n--- 5. Pre-seed bs_alt="1" ---');
    dom = await harness.createDesktopWindow({ bs_mock: '1', bs_alt: '1' });
    w = dom.window;
    chev = w.document.querySelectorAll('.alt-chev');
    console.log('  .alt-chev count when seeded ON:', chev.length);
    assert(chev.length > 0, 'chevrons render on first paint when bs_alt seeded to "1"');

    // ── 6. With seed OFF → no chevrons in any mode ─────────────────────────
    console.log('\n--- 6. Modes consistency (OFF) ---');
    dom = await harness.createDesktopWindow({ bs_mock: '1', bs_alt: '0' });
    w = dom.window;
    for (const mode of ['straight', 'parlay', 'ifbet']) {
      w.setMode(mode);
      await tick();
      const c = w.document.querySelectorAll('.alt-chev').length;
      console.log(`  mode=${mode} chev count:`, c);
      assert(c === 0, `no chevrons in ${mode} when OFF`);
    }
    w.setMode('teaser'); await tick();
    const tmBtns = w.document.querySelectorAll('.tm-vbtn');
    const p6 = Array.from(tmBtns).find(b => b.textContent.includes('PRIME 6') && !b.textContent.includes('6.5'));
    if (p6) {
      p6.click(); await tick();
      const c = w.document.querySelectorAll('.alt-chev').length;
      console.log('  mode=teaser chev count:', c);
      assert(c === 0, 'no chevrons in teaser mode when OFF');
    } else {
      assert(false, 'PRIME 6 variant button found');
    }

    // ── 7. Prop alt chevrons also gated ────────────────────────────────────
    console.log('\n--- 7. Prop alt chevrons gated too ---');
    dom = await harness.createDesktopWindow({ bs_mock: '1', bs_alt: '0' });
    w = dom.window;
    const propsEntry = Array.from(w.document.querySelectorAll('.lg-item')).find(el => el.textContent.includes('Props'));
    if (propsEntry) {
      propsEntry.click();
      await wait(40);
      const propChev = w.document.querySelectorAll('.prop-alt-chev').length;
      console.log('  .prop-alt-chev count with OFF:', propChev);
      assert(propChev === 0, 'no .prop-alt-chev when bs_alt=0');

      w.document.getElementById('alt-cbx').checked = true;
      w.toggleAltLines();
      await tick();
      const propChev2 = w.document.querySelectorAll('.prop-alt-chev').length;
      console.log('  .prop-alt-chev count after ON:', propChev2);
      assert(propChev2 > 0, '.prop-alt-chev appear after toggle ON');
    } else {
      console.log('  (skip — no Props league entry found in sidebar)');
    }

    return { name: 'altlines_toggle', fails };
  }
};
