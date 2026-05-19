// ════════════════════════════════════════════════════════════════════════════
//  agent_mock.js — Mock dataset for the Agent section (bookie-side portal)
//  ────────────────────────────────────────────────────────────────────────────
//  Loaded as a sibling script (served at /agent_mock.js by Vite). Mirrors the
//  shape of LeftCoast797's agent portal data — see AGENT_RECON.md for the
//  source recon. Entertainment-only, no real data, no scoreboard.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  const SUFFIX = ['RG71','BU45','ZT98','ML90','VJ38','HO13','HX46','ZI92','DH03','JW21',
                  'LT34','OC45','WN66','QI02','ZI69','OF31','TX62','CY03','IH57','PU22',
                  'AI83','QA96','YV15','JV63','OU39','ID80','EY52','SU24','JL99','YT44',
                  'AV94','HK13','GL76','LV38','TT28','SQ30','IY21','WD09','PI49','OS56',
                  'DP72','TQ35','KT89','TD17','NT98','VE81','TM43','KM95','GW96','WO25'];

  // 50 mock players. Realistic-ish jitter: some recent, some dormant.
  const players = SUFFIX.map((pw, i) => {
    const balance = Math.round((Math.random() < 0.55 ? 0 : (Math.random()*2 - 1) * (50 + i*8)) * 100) / 100;
    const pending = Math.random() < 0.18 ? Math.floor(Math.random()*5 + 1) : 0;
    const lastWagerDays = Math.random() < 0.4 ? null : Math.floor(Math.random()*30);
    const lastLoginDays = Math.random() < 0.3 ? null : Math.floor(Math.random()*14);
    return {
      id: `NUB${400 + i}`,
      pw,
      credit: 500,
      wager: 100,
      parlay: 0,
      teaser: 100,
      casino: Math.random() < 0.15,
      racing: Math.random() < 0.85,
      settle: balance < -50 ? Math.abs(balance) : 0,
      lastWager: lastWagerDays === null ? null : daysAgo(lastWagerDays),
      lastLogin: lastLoginDays === null ? null : daysAgo(lastLoginDays),
      pending,
      balance,
    };
  });

  const activePlayers = players.filter(p => p.lastLogin && daysSince(p.lastLogin) <= 7).length;
  const sumBal = +players.reduce((s,p)=>s+p.balance,0).toFixed(2);

  window.AGENT_MOCK = {
    id: 'NUBI004',
    balance: sumBal,
    kpi: {
      active: activePlayers,
      yesterday: +randMoney(80, 350).toFixed(2),
      today: +randMoney(-200, 250).toFixed(2),
      weekly: +randMoney(-1200, 1800).toFixed(2),
    },
    players,
    recent: {
      wagers: sampleRecent(players, 'wager', 5),
      logins: sampleRecent(players, 'login', 5),
      changes: [
        { who: 'NUBI004', what: 'Updated credit limit', target: 'NUB407', when: daysAgo(0, true) },
        { who: 'NUBI004', what: 'Toggled racing OFF', target: 'NUB422', when: daysAgo(0, true) },
        { who: 'NUBI004', what: 'Settled $120', target: 'NUB401', when: daysAgo(1, true) },
      ],
    },
  };

  function daysAgo(d, withTime){
    const dt = new Date(Date.now() - d * 86400000);
    if (withTime) return dt.toISOString();
    return dt.toISOString().slice(0,10);
  }
  function daysSince(dateStr){
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  }
  function randMoney(min, max){ return min + Math.random() * (max - min); }
  function sampleRecent(list, kind, n){
    const eligible = list.filter(p => kind === 'wager' ? p.lastWager : p.lastLogin)
                         .sort((a,b)=> new Date(kind==='wager'?b.lastWager:b.lastLogin) - new Date(kind==='wager'?a.lastWager:a.lastLogin))
                         .slice(0, n);
    return eligible.map(p => ({
      id: p.id,
      pw: p.pw,
      when: kind === 'wager' ? p.lastWager : p.lastLogin,
      amount: kind === 'wager' ? +randMoney(20, 500).toFixed(2) : null,
    }));
  }
})();
