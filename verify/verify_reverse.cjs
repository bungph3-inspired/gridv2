// ════════════════════════════════════════════════════════════════════════════
//  verify_reverse.cjs — Reverse Action wagering type (added 2026-05-15)
//  ────────────────────────────────────────────────────────────────────────────
//  Covers both desktop and mobile bundles:
//    1. Structural: tab-reverse / nav-reverse exist and sit between
//       teaser and ifbet (the order the user picked when shipping).
//    2. Required DOM nodes for the reverse modals exist on desktop.
//    3. Math: computeReverseNet / computeRVNetMob return the right net P/L
//       across all 9 (W/P/L)×(W/P/L) leg-outcome combos at -110/-110, $50.
//    4. Mobile interaction: setMode('reverse') activates nav-reverse; the
//       2-leg ceiling holds when a third odds button is clicked.
//
//  Reverse semantics under test (action-reverse, the only variant shipped):
//    Forward chain: trigger=A, next=B. Reverse chain: trigger=B, next=A.
//    Trigger 'lost'  → chain pays -stake (chain dead, next leg never fires)
//    Trigger 'push'  → chain profit 0 on the trigger, action passes to next
//    Trigger 'won'   → chain profit (decTrig-1)*stake, then next leg fires
//  Net P/L = forward + reverse chain returns.
//  ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'reverse',
  async run(harness) {
    const fails = [];
    const assert = harness.createAssert(fails);
    const tick = harness.tick;

    // ── Pure math expectations at -110/-110, stake $50 ────────────────────
    // decA = decB = 1 + 100/110 = 21/11. Per-leg win profit = 50 * 10/11 = 500/11.
    // chainProfit(trig, next):
    //   lost trigger        → -50
    //   push trigger        → 0 + nextProfit
    //   won  trigger        → 500/11 + nextProfit
    // nextProfit: won=+500/11, push=0, lost=-50.
    const W500 = 500 / 11;
    const expectedNet = {
      'won-won':   2 * (W500 + W500),                 //  ~ 181.8182  (max win)
      'won-push':  (W500 + 0) + (0 + W500),           //  ~  90.9091
      'won-lost':  (W500 - 50) + (-50),               //  ~ -54.5455
      'push-won':  (0 + W500) + (W500 + 0),           //  ~  90.9091
      'push-push': 0 + 0,                             //     0
      'push-lost': (0 - 50) + (-50),                  //   -100      (only push-side losses)
      'lost-won':  (-50) + (W500 - 50),               //  ~ -54.5455
      'lost-push': (-50) + (-50),                     //   -100
      'lost-lost': (-50) + (-50),                     //   -100      (max loss = total risk)
    };
    const close = (a, b) => Math.abs(a - b) < 0.0001;

    // ════════════════════════════════════════════════════════════════════════
    //  Part 1: structural checks on the raw HTML (no jsdom needed)
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- 1. Structural checks (HTML) ---');
    const cache = harness.setup();
    const dHtml = cache.desktopHtml;
    const mHtml = cache.mobileHtml;

    // Desktop: tab-reverse exists, sits between tab-teaser and tab-ifbet
    const dTeaserIdx = dHtml.indexOf('id="tab-teaser"');
    const dReverseIdx = dHtml.indexOf('id="tab-reverse"');
    const dIfbetIdx = dHtml.indexOf('id="tab-ifbet"');
    assert(dReverseIdx !== -1, 'desktop has #tab-reverse');
    assert(dTeaserIdx !== -1 && dIfbetIdx !== -1, 'desktop has #tab-teaser and #tab-ifbet anchors');
    assert(dTeaserIdx < dReverseIdx && dReverseIdx < dIfbetIdx,
      `desktop tab order: teaser(${dTeaserIdx}) < reverse(${dReverseIdx}) < ifbet(${dIfbetIdx})`);
    assert(dHtml.includes('id="rv-badge"'),    'desktop has #rv-badge');
    assert(dHtml.includes('id="rvoverlay"'),   'desktop has #rvoverlay review modal');
    assert(dHtml.includes('id="rvsetoverlay"'), 'desktop has #rvsetoverlay settle modal');

    // Mobile: nav-reverse exists, sits between nav-teaser and nav-ifbet
    const mTeaserIdx = mHtml.indexOf('id="nav-teaser"');
    const mReverseIdx = mHtml.indexOf('id="nav-reverse"');
    const mIfbetIdx = mHtml.indexOf('id="nav-ifbet"');
    assert(mReverseIdx !== -1, 'mobile has #nav-reverse');
    assert(mTeaserIdx !== -1 && mIfbetIdx !== -1, 'mobile has #nav-teaser and #nav-ifbet anchors');
    assert(mTeaserIdx < mReverseIdx && mReverseIdx < mIfbetIdx,
      `mobile nav order: teaser(${mTeaserIdx}) < reverse(${mReverseIdx}) < ifbet(${mIfbetIdx})`);
    assert(mHtml.includes('id="rv-badge"'), 'mobile has #rv-badge');

    // ════════════════════════════════════════════════════════════════════════
    //  Part 2: desktop math via window.computeReverseNet
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- 2. Desktop computeReverseNet — all 9 W/P/L combos at -110/-110, $50 ---');
    const desk = await harness.createDesktopWindow({ bs_mock: '1' });
    const dWin = desk.window;
    assert(typeof dWin.computeReverseNet === 'function', 'window.computeReverseNet exposed on desktop');
    const bet = {
      legs: [
        { vig: -110, line: -7.5, type: 'spread', teamName: 'A', matchup: 'X', sport: 'basketball_nba' },
        { vig: -110, line:  7.5, type: 'spread', teamName: 'B', matchup: 'X', sport: 'basketball_nba' },
      ],
      stake: 50,
    };
    const outs = ['won', 'push', 'lost'];
    for (const oA of outs) {
      for (const oB of outs) {
        const key = oA + '-' + oB;
        const got = dWin.computeReverseNet(bet, oA, oB);
        const exp = expectedNet[key];
        assert(close(got, exp), `desktop net(${oA},${oB}) = ${got.toFixed(4)} expected ${exp.toFixed(4)}`);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Part 3: mobile math via window.computeRVNetMob
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- 3. Mobile computeRVNetMob — same 9 combos ---');
    const mob = await harness.createMobileWindow({ bs_mock: '1', bs_bets: '[]', bs_bal: '1000' });
    const mWin = mob.window;
    const mDoc = mWin.document;
    assert(typeof mWin.computeRVNetMob === 'function', 'window.computeRVNetMob exposed on mobile');
    for (const oA of outs) {
      for (const oB of outs) {
        const key = oA + '-' + oB;
        const got = mWin.computeRVNetMob(bet, oA, oB);
        const exp = expectedNet[key];
        assert(close(got, exp), `mobile net(${oA},${oB}) = ${got.toFixed(4)} expected ${exp.toFixed(4)}`);
      }
    }

    // Sanity: desktop and mobile agree (they have separate implementations but
    // must produce identical numbers — that's the whole point of the parallel
    // chainProfit/chainProfitMob duplication noted in PROJECT.md).
    for (const oA of outs) {
      for (const oB of outs) {
        const a = dWin.computeReverseNet(bet, oA, oB);
        const b = mWin.computeRVNetMob(bet, oA, oB);
        assert(close(a, b), `desktop == mobile for (${oA},${oB}): ${a.toFixed(4)} == ${b.toFixed(4)}`);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  Part 4: mobile interaction — setMode('reverse'), 2-leg ceiling
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n--- 4. Mobile setMode("reverse") activates nav-reverse ---');
    const activeNavId = () => {
      const a = mDoc.querySelector('.mob-nbtn.active');
      return a ? a.id : null;
    };
    const rvBadgeCount = () => {
      const b = mDoc.getElementById('rv-badge');
      if (!b) return null;
      return b.classList.contains('hidden') ? 0 : parseInt(b.textContent || '0', 10);
    };
    mWin.setMode('reverse');
    await tick();
    assert(activeNavId() === 'nav-reverse', `nav-reverse is active (got '${activeNavId()}')`);
    assert(rvBadgeCount() === 0, `rv-badge starts at 0 (got ${rvBadgeCount()})`);

    // 2-leg ceiling: click 3 distinct mobile odds buttons; expect the 3rd to be
    // refused (badge stays at 2). Mobile odds buttons are .mob-obtn; each game
    // card shows ~6 of them (away/home × spread/ML/total).
    console.log('\n--- 5. Mobile 2-leg ceiling on reverse mode ---');
    const obtns = mDoc.querySelectorAll('.mob-obtn');
    assert(obtns.length >= 3, `at least 3 mobile odds buttons rendered (got ${obtns.length})`);
    // Pick buttons from different games to avoid same-game-block conflicts that
    // some bet types reject. We'll grab the first .mob-obtn of three different
    // .mob-gcard blocks if possible, else just three sequential buttons.
    const cards = mDoc.querySelectorAll('.mob-gcard');
    const picks = [];
    if (cards.length >= 3) {
      for (let i = 0; i < 3 && picks.length < 3; i++) {
        const b = cards[i].querySelector('.mob-obtn');
        if (b) picks.push(b);
      }
    }
    while (picks.length < 3 && picks.length < obtns.length) picks.push(obtns[picks.length]);
    assert(picks.length === 3, `picked 3 buttons from distinct cards (got ${picks.length})`);

    picks[0].click(); await tick();
    assert(rvBadgeCount() === 1, `after 1st click: rv-badge=1 (got ${rvBadgeCount()})`);
    picks[1].click(); await tick();
    assert(rvBadgeCount() === 2, `after 2nd click: rv-badge=2 (got ${rvBadgeCount()})`);
    picks[2].click(); await tick();
    assert(rvBadgeCount() === 2, `3rd click rejected — badge stays at 2 (got ${rvBadgeCount()})`);

    return { name: 'reverse', fails };
  }
};
