// ════════════════════════════════════════════════════════════════════════════
//  verify_agent.cjs — Agent portal verify suite
//  ────────────────────────────────────────────────────────────────────────────
//  Covers everything shipped in the 2026-05-18/19 agent portal work:
//   1. Login splash gate (visible without bs_agent, hidden with it)
//   2. Dashboard render (KPI strip + 11 tiles + agent ID in header)
//   3. Tile routing for each of the 6 real subviews:
//        weekly / pending / ticker / tx / position / ipcheck
//      (asserts crumb breadcrumb + the subview's table renders)
//   4. Customer Detail nav: Management tile → row click → 11 tabs visible
//      → PERSONAL active by default → LIMITS tab swap renders ag-lim-table
//   5. Mailbox interactions: AI chat send (greeting + user bubble + bot
//      reply with "deposit" keyword), tab switch to Email, form submit
//      flips to success card, "Send another" reset restores form.
//
//  Coverage tier: mid — exercises every shipped surface without exhaustive
//  data assertions. Skips logout (calls confirm() + location.reload, both
//  awkward in jsdom).
// ════════════════════════════════════════════════════════════════════════════

module.exports = {
  name: 'agent',
  async run(harness) {
    const fails = [];
    const assert = harness.createAssert(fails);

    // ── 1. Login gate ──────────────────────────────────────────────────────
    console.log('\n--- 1. Login splash gate ---');
    {
      const { doc } = await harness.createAgentWindow({ bs_agent: null });
      const splash = doc.getElementById('login-splash');
      const agentView = doc.getElementById('agent-view');
      assert(!!splash, 'login-splash element exists');
      assert(splash && splash.classList.contains('show'), 'splash has .show class without bs_agent');
      assert(agentView && agentView.children.length === 0,
             'agent-view empty without bs_agent (got ' + (agentView ? agentView.children.length : 'NO VIEW') + ' children)');
    }

    // ── 2. Dashboard render with bs_agent seeded ───────────────────────────
    console.log('\n--- 2. Dashboard render with bs_agent ---');
    {
      const { doc } = await harness.createAgentWindow({ bs_agent: 'TEST_AGENT' });
      const splash = doc.getElementById('login-splash');
      const tiles = doc.querySelectorAll('.ag-tile');
      const kpis = doc.querySelectorAll('.ag-kpi-cell');
      const headerId = doc.querySelector('.ag-id')?.textContent;
      assert(splash && !splash.classList.contains('show'), 'splash .show removed after login');
      assert(tiles.length === 11, '11 dashboard tiles rendered (got ' + tiles.length + ')');
      assert(kpis.length === 4, '4 KPI cells rendered (got ' + kpis.length + ')');
      assert(headerId === 'TEST_AGENT', 'header shows seeded agent ID (got "' + headerId + '")');
    }

    // ── 3. Tile routing for each real subview ──────────────────────────────
    console.log('\n--- 3. Tile routing for 6 real subviews ---');
    const subviewChecks = [
      { slug: 'weekly',  crumb: 'Weekly',       table: '.ag-weekly-table' },
      { slug: 'pending', crumb: 'Pending',      table: '.ag-pending-table' },
      { slug: 'ticker',  crumb: 'Bet Ticker',   table: '.ag-ticker-table' },
      { slug: 'tx',      crumb: 'Transactions', table: '.ag-tx-table' },
      { slug: 'position',crumb: 'Position',     table: '.ag-position-table' },
      { slug: 'ip',      crumb: 'IP Checker',   table: '.ag-ipcheck-table' },
    ];
    for (const sv of subviewChecks) {
      const { doc } = await harness.createAgentWindow({ bs_agent: 'T' });
      const tile = doc.querySelector('.ag-tile[data-tile="' + sv.slug + '"]');
      assert(!!tile, sv.slug + ' tile present in dashboard');
      if (tile) {
        tile.click();
        await harness.tick();
        const crumbText = doc.querySelector('.ag-crumb-sub')?.textContent || '';
        assert(crumbText.includes(sv.crumb), sv.slug + ' subview crumb includes "' + sv.crumb + '" (got "' + crumbText + '")');
        const table = doc.querySelector(sv.table);
        // Position table may be absent if zero PENDING wagers, IPcheck if zero lastLogin players.
        // The mock generator usually produces both, but accept either table OR the empty-state div.
        const empty = doc.querySelector('.ag-wager-empty');
        assert(!!table || !!empty, sv.slug + ' subview renders table or empty-state');
      }
    }

    // ── 4. Customer Detail navigation ──────────────────────────────────────
    console.log('\n--- 4. Customer Detail nav (Management → row → tab switch) ---');
    {
      const { doc } = await harness.createAgentWindow({ bs_agent: 'T' });
      const mgmtTile = doc.querySelector('.ag-tile[data-tile="mgmt"]');
      assert(!!mgmtTile, 'Management tile present');
      mgmtTile.click();
      await harness.tick();
      const rows = doc.querySelectorAll('.ag-prow');
      assert(rows.length > 0, 'Management table has player rows (got ' + rows.length + ')');
      if (rows.length > 0) {
        rows[0].click();
        await harness.tick();
        const tabs = doc.querySelectorAll('.ag-cust-tab');
        assert(tabs.length === 11, 'Customer Detail has 11 tabs (got ' + tabs.length + ')');
        const activeTab = doc.querySelector('.ag-cust-tab.active');
        assert(activeTab && activeTab.dataset.tab === 'personal',
               'PERSONAL tab active by default (got "' + (activeTab && activeTab.dataset.tab) + '")');
        const limitsBtn = doc.querySelector('.ag-cust-tab[data-tab="limits"]');
        assert(!!limitsBtn, 'LIMITS tab button present');
        if (limitsBtn) {
          limitsBtn.click();
          await harness.tick();
          const limTable = doc.querySelector('.ag-lim-table');
          assert(!!limTable, 'LIMITS tab renders ag-lim-table');
        }
      }
    }

    // ── 5. Mailbox interactions ────────────────────────────────────────────
    console.log('\n--- 5. Mailbox (chat send + email submit) ---');
    {
      const { doc, window } = await harness.createAgentWindow({ bs_agent: 'T' });
      const mailTile = doc.querySelector('.ag-tile[data-tile="mail"]');
      assert(!!mailTile, 'Mailbox tile present');
      mailTile.click();
      await harness.tick();

      const mbTabs = doc.querySelectorAll('.ag-mb-tab');
      assert(mbTabs.length === 2, '2 mailbox tabs (got ' + mbTabs.length + ')');
      const activeMb = doc.querySelector('.ag-mb-tab.active');
      assert(activeMb && activeMb.dataset.mbTab === 'ai',
             'AI tab active by default (got "' + (activeMb && activeMb.dataset.mbTab) + '")');

      // Chat log starts with the greeting bubble only
      const initialBubbles = doc.querySelectorAll('.ag-mb-bubble');
      assert(initialBubbles.length === 1, 'chat starts with 1 greeting bubble (got ' + initialBubbles.length + ')');

      // Type and send
      const input = doc.getElementById('ag-mb-input');
      const sendBtn = doc.getElementById('ag-mb-send');
      assert(!!input, 'chat input present');
      assert(!!sendBtn, 'chat send button present');
      input.value = 'how do I deposit';
      sendBtn.click();
      // 250ms bot reply delay + buffer
      await harness.wait(350);
      const afterBubbles = doc.querySelectorAll('.ag-mb-bubble');
      assert(afterBubbles.length === 3,
             'after send: 3 bubbles (greeting + user + bot) (got ' + afterBubbles.length + ')');
      if (afterBubbles.length === 3) {
        const last = afterBubbles[afterBubbles.length - 1];
        assert(last.classList.contains('ag-mb-bot'), 'last bubble is bot reply');
        assert(last.textContent.toLowerCase().includes('deposit'),
               'bot reply mentions "deposit" (got "' + last.textContent.slice(0, 60) + '...")');
      }

      // Switch to Email tab
      const emailTabBtn = doc.querySelector('.ag-mb-tab[data-mb-tab="email"]');
      assert(!!emailTabBtn, 'Email tab button present');
      emailTabBtn.click();
      await harness.tick();
      let emForm = doc.getElementById('ag-mb-email-form');
      assert(!!emForm, 'email form rendered after tab switch');

      // Fill + submit
      const sub = doc.getElementById('ag-mb-email-sub');
      const body = doc.getElementById('ag-mb-email-body');
      assert(!!sub && !!body, 'subject + body fields present');
      if (sub && body) {
        sub.value = 'Test subject';
        body.value = 'Test body';
        emForm.dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));
        await harness.tick();
        const success = doc.querySelector('.ag-mb-email-success');
        assert(!!success, 'success card visible after submit');
        const resetBtn = doc.getElementById('ag-mb-email-reset');
        assert(!!resetBtn, 'reset button present in success card');
        if (resetBtn) {
          resetBtn.click();
          await harness.tick();
          const formAgain = doc.getElementById('ag-mb-email-form');
          assert(!!formAgain, 'email form back after Send another reset');
        }
      }
    }

    return { name: 'agent', fails };
  },
};
