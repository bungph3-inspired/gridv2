// ════════════════════════════════════════════════════════════════════════════
//  agent_mock.js — Mock dataset for the Agent section (bookie-side portal)
//  ────────────────────────────────────────────────────────────────────────────
//  Loaded as a sibling script (served at /agent_mock.js by Vite). Mirrors the
//  shape of LeftCoast797's agent portal data — see AGENT_RECON.md for the
//  source recon. Entertainment-only, no real data, no scoreboard.
//
//  v2 (2026-05-18): expanded each player with detail-view fields and 0-5
//  sample wagers so the Customer Detail Personal/Limits/Wager tabs can render
//  realistic content.
// ════════════════════════════════════════════════════════════════════════════
(function(){
  const SUFFIX = ['RG71','BU45','ZT98','ML90','VJ38','HO13','HX46','ZI92','DH03','JW21',
                  'LT34','OC45','WN66','QI02','ZI69','OF31','TX62','CY03','IH57','PU22',
                  'AI83','QA96','YV15','JV63','OU39','ID80','EY52','SU24','JL99','YT44',
                  'AV94','HK13','GL76','LV38','TT28','SQ30','IY21','WD09','PI49','OS56',
                  'DP72','TQ35','KT89','TD17','NT98','VE81','TM43','KM95','GW96','WO25'];

  const FIRST = ['James','Mary','Robert','Patricia','John','Jennifer','Michael','Linda',
                 'David','Barbara','William','Susan','Richard','Jessica','Joseph','Sarah',
                 'Thomas','Karen','Charles','Nancy','Christopher','Lisa','Daniel','Margaret',
                 'Matthew','Sandra','Anthony','Ashley','Mark','Dorothy','Donald','Kimberly',
                 'Steven','Emily','Paul','Donna','Andrew','Michelle','Joshua','Carol'];
  const LAST  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
                 'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson',
                 'Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White',
                 'Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young',
                 'Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores'];
  const CITIES = [
    ['Los Angeles','CA'], ['San Diego','CA'], ['San Francisco','CA'], ['Phoenix','AZ'],
    ['Las Vegas','NV'], ['Denver','CO'], ['Seattle','WA'], ['Portland','OR'],
    ['Houston','TX'], ['Dallas','TX'], ['Miami','FL'], ['Tampa','FL'],
    ['Chicago','IL'], ['New York','NY'], ['Boston','MA'], ['Atlanta','GA'],
  ];
  const BETTOR = ['NEW PLAYER NED','SHARP STEVE','SQUARE SAM','GRINDER GRACE','WHALE WILLIE'];
  const REP    = ['NEW','OK','GOOD','SHARP','SLOW PAY'];
  const SPORTS = ['NBA','MLB','NHL','NFL'];
  const TYPES  = ['Spread','Moneyline','Total','Team Total'];

  const players = SUFFIX.map((pw, i) => {
    const fn = pick(FIRST), ln = pick(LAST);
    const [city, state] = pick(CITIES);
    const balance = Math.round((Math.random() < 0.55 ? 0 : (Math.random()*2 - 1) * (50 + i*8)) * 100) / 100;
    const pending = Math.random() < 0.18 ? Math.floor(Math.random()*5 + 1) : 0;
    const lastWagerDays = Math.random() < 0.4 ? null : Math.floor(Math.random()*30);
    const lastLoginDays = Math.random() < 0.3 ? null : Math.floor(Math.random()*14);

    return {
      id: `NUB${400 + i}`,
      pw,
      // identity
      website: 'LeftCoast797',
      firstName: fn,
      lastName: ln,
      nickname: '',
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.test`,
      phone: `(${randDig(3)}) ${randDig(3)}-${randDig(4)}`,
      referredBy: '',
      notes: '',
      city,
      state,
      bettorType: pick(BETTOR),
      reputation: REP[Math.min(REP.length-1, Math.floor(Math.random()*REP.length))],
      status: Math.random() < 0.92 ? 'ACTIVE' : 'SUSPENDED',
      racebook: Math.random() < 0.85,
      mailbox: true,
      mainCasino: Math.random() < 0.15,
      // limits
      credit: 500,
      wager: 100,
      parlay: 0,
      teaser: 100,
      tempCredit: 0,
      maxRisk: 0,
      inetMinimum: 20,
      // figure totals
      casino: Math.random() < 0.15,
      racing: Math.random() < 0.85,
      settle: balance < -50 ? Math.abs(balance) : 0,
      lastWager: lastWagerDays === null ? null : daysAgo(lastWagerDays),
      lastLogin: lastLoginDays === null ? null : daysAgo(lastLoginDays),
      pending,
      balance,
      freeplay: Math.random() < 0.1 ? Math.round(Math.random()*50) : 0,
      // wager history
      wagers: makeWagers(i, pending),
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

  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function randDig(n){ let s=''; for(let i=0;i<n;i++) s+=Math.floor(Math.random()*10); return s; }
  function daysAgo(d, withTime){
    const dt = new Date(Date.now() - d * 86400000);
    if (withTime) return dt.toISOString();
    return dt.toISOString().slice(0,10);
  }
  function daysSince(dateStr){
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  }
  function randMoney(min, max){ return min + Math.random() * (max - min); }
  function makeWagers(seed, pendingCount){
    const out = [];
    // pending wagers
    for (let i = 0; i < pendingCount; i++) {
      out.push(makeWager(seed*100 + i, 'PENDING', false));
    }
    // historical (settled) wagers
    const histCount = Math.floor(Math.random() * 4);
    for (let i = 0; i < histCount; i++) {
      out.push(makeWager(seed*100 + pendingCount + i, Math.random() < 0.5 ? 'WIN' : 'LOSS', true));
    }
    return out;
  }
  function makeWager(seed, result, settled){
    const sport = SPORTS[seed % SPORTS.length];
    const type = TYPES[seed % TYPES.length];
    const risk = [20, 50, 100, 200][seed % 4];
    const win = result === 'WIN' ? +(risk * 0.91).toFixed(2) : result === 'LOSS' ? -risk : 0;
    const days = settled ? Math.floor(Math.random()*30 + 1) : -Math.floor(Math.random()*3 + 1);
    const dt = new Date(Date.now() - days * 86400000);
    return {
      ticket: `T${100000 + seed}`,
      sport,
      type,
      line: type === 'Total' ? `o${(200 + (seed%30)).toFixed(1)}` : (seed % 2 ? `+${(seed%9 + 1) * 0.5}` : `-${(seed%9 + 1) * 0.5}`),
      placed: dt.toISOString(),
      risk,
      toWin: result === 'WIN' ? +(risk * 0.91).toFixed(2) : risk,
      result,
      net: win,
    };
  }
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
