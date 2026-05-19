(() => {
  // src/state.js
  var HARDCODED_KEY = "8d38ac97-93db-4baa-9123-bf8c210ff695";
  var SPORT_CFG = [
    { key: "NBA", label: "NBA", sportId: 11, tournamentId: 132 },
    { key: "MLB", label: "MLB", sportId: 13, tournamentId: null },
    { key: "NHL", label: "NHL", sportId: 15, tournamentId: null },
    { key: "NFL", label: "NFL", sportId: 14, tournamentId: null },
    { key: "NCAAB", label: "NCAAB", sportId: 11, tournamentId: null, tournamentMatch: /NCAA|college/i },
    { key: "NCAAF", label: "NCAAF", sportId: 14, tournamentId: null, tournamentMatch: /NCAA|college/i }
  ];
  var BASE = "https://api.oddspapi.io/v4";
  var AUTO_MS = 2 * 60 * 1e3;
  var TEASER_VARIANTS = [
    {
      key: "PRIME3T",
      label: "PRIME 3T 10-8",
      ftbShift: 10,
      bbShift: 8,
      minLegs: 3,
      maxLegs: 3,
      enabled: true,
      payouts: { 3: "+180" }
    },
    {
      key: "PRIME4T",
      label: "PRIME 4T 12-9",
      ftbShift: 12,
      bbShift: 9,
      minLegs: 4,
      maxLegs: 4,
      enabled: true,
      payouts: { 4: "+250" }
    },
    {
      key: "PRIME6",
      label: "PRIME 6",
      ftbShift: 6,
      bbShift: 5.5,
      minLegs: 2,
      maxLegs: 8,
      enabled: true,
      payouts: { 2: "-120", 3: "+150", 4: "+220", 5: "+340", 6: "+550", 7: "+700", 8: "+800" }
    },
    {
      key: "PRIME65",
      label: "PRIME 6.5",
      ftbShift: 6.5,
      bbShift: 6,
      minLegs: 2,
      maxLegs: 8,
      enabled: true,
      payouts: { 2: "-130", 3: "+135", 4: "+200", 5: "+300", 6: "+450", 7: "+600", 8: "+750" }
    },
    {
      key: "PRIME7",
      label: "PRIME 7",
      ftbShift: 7,
      bbShift: 6.5,
      minLegs: 2,
      maxLegs: 8,
      enabled: true,
      payouts: { 2: "-140", 3: "+120", 4: "+180", 5: "+260", 6: "+400", 7: "+550", 8: "+700" }
    }
  ];
  var getVariant = (k) => TEASER_VARIANTS.find((v) => v.key === k);
  var teaserSportType = (sport) => ({ NBA: "bb", NCAAB: "bb", NFL: "ftb", NCAAF: "ftb" })[sport] || null;
  function teaserShift(line, mkey, variant, sport) {
    const type = teaserSportType(sport);
    if (!type) return null;
    const shift = type === "ftb" ? variant.ftbShift : variant.bbShift;
    const n = parseFloat(line);
    if (isNaN(n)) return null;
    if (mkey === "spread") {
      return n >= 0 ? `+${(n + shift).toFixed(1).replace(/\.0$/, "")}` : `${(n + shift).toFixed(1).replace(/\.0$/, "")}`;
    }
    return (n - shift).toFixed(1).replace(/\.0$/, "");
  }
  var teaserPayout = (variant, n) => variant.payouts && variant.payouts[n] ? variant.payouts[n] : null;
  var LEAGUES_LIST = [
    { sport: "NBA", name: "NBA \u2013 Playoffs" },
    { sport: "NBA", name: "NBA \u2013 Series" },
    { sport: "NBA", name: "NBA 1st Half" },
    { sport: "NBA", name: "NBA Game & Player Props" },
    { sport: "MLB", name: "MLB" },
    { sport: "MLB", name: "MLB 1st 5 Innings" },
    { sport: "MLB", name: "MLB \u2013 Props" },
    { sport: "MLB", name: "MLB \u2013 Alternate Lines" },
    { sport: "NHL", name: "NHL \u2013 Playoffs" },
    { sport: "NHL", name: "NHL \u2013 Stanley Cup" },
    { sport: "NFL", name: "NFL \u2013 Preseason" },
    { sport: "NFL", name: "NFL \u2013 Regular Season" },
    { sport: "NCAAB", name: "NCAAB \u2013 Regular Season" },
    { sport: "NCAAB", name: "NCAAB \u2013 March Madness" },
    { sport: "NCAAF", name: "NCAAF \u2013 Regular Season" },
    { sport: "NCAAF", name: "NCAAF \u2013 Bowl Games" }
  ];
  var BS_GAME_META = {
    "Los Angeles Lakers @ Oklahoma City Thunder": {
      badge: "Playoffs",
      seedAway: 5,
      seedHome: 1,
      network: "TNT",
      series: "OKC leads 2-1",
      maxWager: 1e3,
      injury: "LAL: L. James (questionable)"
    },
    "New York Knicks @ Philadelphia 76ers": {
      badge: "Playoffs",
      seedAway: 3,
      seedHome: 2,
      network: "ESPN",
      series: "Tied 2-2",
      maxWager: 1e3
    },
    "San Antonio Spurs @ Minnesota Timberwolves": {
      badge: "Reg Season",
      network: "NBA TV",
      maxWager: 500
    }
  };
  function getGameMeta(g) {
    return BS_GAME_META[`${g.away} @ ${g.home}`] || {};
  }
  var state = {
    // ── auth + book preference ─────────────────────────────
    apiKey: localStorage.getItem("bs_key") || HARDCODED_KEY,
    // Mock Mode default: ON when fixture available and user hasn't opted out.
    mockMode: !!window.MOCK_DATA && localStorage.getItem("bs_mock") !== "0",
    prefBook: localStorage.getItem("bs_book") || "draftkings",
    // ── money + bets ────────────────────────────────────────
    balance: parseFloat(localStorage.getItem("bs_bal") || "1000"),
    placedBets: JSON.parse(localStorage.getItem("bs_bets") || "[]"),
    // ── bet builders (per-mode work-in-progress) ────────────
    slip: [],
    // straight: {key,gameId,teamName,sport,matchup,type,line,vig,win}
    parlayLegs: [],
    teaserLegs: [],
    // {key,gameId,teamName,sport,matchup,type,origLine,shiftedLine}
    teaserVariant: null,
    // null = on menu screen, 'PRIME6' etc. = on board
    ifBetLegs: [],
    // {key,gameId,teamName,sport,matchup,type,line,vig,win,fireRule}
    selCells: {},
    // map: betKey → true (which odds cells are visually "selected")
    // ── ui ─────────────────────────────────────────────────
    wagerMode: "straight",
    // 'straight' | 'parlay' | 'teaser' | 'ifbet'
    activeLeague: "NBA \u2013 Playoffs",
    // ── data caches ─────────────────────────────────────────
    gamesCache: {},
    // sport key → normalized games array
    marketMetaCache: {},
    // sportId → market metadata index (shared per sportId)
    participantCache: {},
    // participantId → team name
    prevOdds: {},
    // betKey → previous line+vig string (for move detection)
    // ── quota / loaders ─────────────────────────────────────
    qUsed: parseInt(localStorage.getItem("bs_qu") || "0"),
    qRem: parseInt(localStorage.getItem("bs_qr") || "500"),
    autoTimer: null,
    cdownTimer: null,
    cdownSec: 0,
    isLoading: false
  };

  // src/utils.js
  var toDec = (am) => {
    const n = parseFloat(String(am).replace("+", ""));
    if (isNaN(n)) return 1;
    return n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
  };
  var calcRisk = (win, am) => {
    const d = toDec(am);
    return d <= 1 ? 0 : win / (d - 1);
  };
  var calcWin = (risk, am) => (toDec(am) - 1) * risk;
  var parlayDec = (legs) => legs.reduce((a, l) => a * toDec(l.vig || l.line), 1);
  var decToAm = (dec) => dec >= 2 ? "+" + Math.round((dec - 1) * 100) : String(Math.round(-100 / (dec - 1)));
  var ensureSign = (v) => {
    if (v == null || v === "") return "";
    const s = String(v).trim().replace(/^\+/, "");
    const n = parseFloat(s);
    if (isNaN(n)) return s;
    return n > 0 ? "+" + s : s;
  };
  var fmtUSD = (n) => "$" + Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  var fmtLine = (pt) => {
    if (pt == null || pt === "") return "";
    const n = Number(pt);
    if (isNaN(n)) return String(pt);
    const abs = Math.abs(n);
    const whole = Math.floor(abs);
    const isHalf = abs - whole === 0.5;
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    return sign + (isHalf ? whole > 0 ? whole + "\xBD" : "\xBD" : String(abs));
  };
  var fmtTotalLine = (pt) => {
    if (pt == null || pt === "") return "";
    const n = Math.abs(Number(pt));
    if (isNaN(n)) return String(pt);
    const whole = Math.floor(n);
    const isHalf = n - whole === 0.5;
    return isHalf ? whole > 0 ? whole + "\xBD" : "\xBD" : String(n);
  };
  var _escDiv = document.createElement("div");
  var escapeHtml = (s) => {
    _escDiv.textContent = s == null ? "" : String(s);
    return _escDiv.innerHTML;
  };
  var PROP_LABEL = {
    pts: "Points",
    reb: "Rebounds",
    ast: "Assists",
    "3pm": "3-Pointers Made",
    blk: "Blocks",
    stl: "Steals",
    pr: "Pts + Reb",
    pa: "Pts + Ast",
    ar: "Ast + Reb",
    pra: "Pts + Reb + Ast"
  };
  var isPropLeg = (leg) => !!(leg && leg.propPlayer);
  var propMkt = (leg) => {
    if (!leg) return "";
    if (leg.propMkt) return leg.propMkt;
    if (leg.propPlayer && typeof leg.type === "string" && leg.type.startsWith("prop_")) return leg.type.slice(5);
    return "";
  };
  var propMktLabel = (leg) => {
    const m = propMkt(leg);
    return PROP_LABEL[m] || m.toUpperCase();
  };
  var propInitials = (leg) => {
    const n = leg && leg.propPlayer ? String(leg.propPlayer) : "";
    if (!n) return "?";
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  var propSide = (leg) => {
    if (!leg) return "";
    if (leg.propSide) return leg.propSide === "O" ? "OVER" : "UNDER";
    const ch = (leg.line || "").toString().charAt(0).toLowerCase();
    return ch === "o" ? "OVER" : ch === "u" ? "UNDER" : "";
  };
  var propLineNum = (leg) => {
    const l = (leg && leg.line || "").toString();
    return /^[ou]/i.test(l) ? l.slice(1) : l;
  };

  // src/api.js
  var _renderBoard = () => {
  };
  var _showBoardMsg = () => {
  };
  var _showToast = () => {
  };
  function setApiHooks({ renderBoard: renderBoard2, showBoardMsg: showBoardMsg2, showToast: showToast2 }) {
    if (renderBoard2) _renderBoard = renderBoard2;
    if (showBoardMsg2) _showBoardMsg = showBoardMsg2;
    if (showToast2) _showToast = showToast2;
  }
  function mockResolve(path) {
    const M = window.MOCK_DATA;
    if (!M) return void 0;
    if (path.startsWith("/tournaments?")) {
      const sid = parseInt(new URLSearchParams(path.split("?")[1]).get("sportId"));
      return sid === M.sportId ? [{ tournamentId: M.tournamentId, tournamentName: "NBA", upcomingFixtures: 1, liveFixtures: 1, categorySlug: "usa", categoryName: "USA" }] : [];
    }
    if (path.startsWith("/markets?")) {
      const sid = parseInt(new URLSearchParams(path.split("?")[1]).get("sportId"));
      return sid === M.sportId ? M.markets : [];
    }
    if (path.startsWith("/odds-by-tournaments?")) {
      const tids = (new URLSearchParams(path.split("?")[1]).get("tournamentIds") || "").split(",").map((s) => parseInt(s));
      return tids.includes(M.tournamentId) ? M.odds : [];
    }
    if (path.startsWith("/participants?")) return M.participants;
    return void 0;
  }
  async function apiFetch(path) {
    if (state.mockMode && window.MOCK_DATA) {
      const r = mockResolve(path);
      if (r !== void 0) return Promise.resolve(r);
    }
    if (!state.apiKey || state.apiKey === "") {
      _showBoardMsg("key");
      return null;
    }
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${BASE}${path}${sep}apiKey=${state.apiKey}`);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error?.message || `HTTP ${res.status}`);
    }
    return res.json();
  }
  async function resolveParticipants(ids, sportId) {
    const missing = ids.filter((id) => !state.participantCache[id]);
    if (!missing.length) return;
    const data = await apiFetch(`/participants?participantIds=${missing.join(",")}&sportId=${sportId}`);
    if (Array.isArray(data)) {
      data.forEach((p) => {
        state.participantCache[p.participantId] = p.participantName || p.shortName || String(p.participantId);
      });
    } else if (data && typeof data === "object") {
      Object.keys(data).forEach((id) => {
        state.participantCache[id] = typeof data[id] === "string" ? data[id] : data[id]?.participantName || data[id]?.shortName || String(id);
      });
    }
  }
  async function fetchMarketMeta(sportId) {
    if (state.marketMetaCache[sportId]) return;
    const data = await apiFetch(`/markets?sportId=${sportId}`);
    if (!Array.isArray(data)) return;
    const byId = {};
    data.forEach((m) => {
      byId[m.marketId] = m;
    });
    state.marketMetaCache[sportId] = byId;
  }
  async function fetchOdds(sportKey) {
    if (!state.mockMode && (!state.apiKey || state.apiKey === "YOUR_API_KEY_HERE")) {
      _showBoardMsg("key");
      return null;
    }
    const cfg = SPORT_CFG.find((s) => s.key === sportKey);
    if (!cfg) return null;
    const sportId = cfg.sportId;
    if (!cfg.tournamentId) {
      const tours = await apiFetch(`/tournaments?sportId=${sportId}`);
      if (Array.isArray(tours)) {
        const candidates = tours.filter((t) => t.upcomingFixtures > 0 || t.liveFixtures > 0);
        const active = cfg.tournamentMatch ? candidates.find((t) => cfg.tournamentMatch.test(t.tournamentName || "")) : candidates.find((t) => t.categorySlug === "usa" || t.categoryName === "USA" || t.tournamentName?.includes("MLB") || t.tournamentName?.includes("NBA") || t.tournamentName?.includes("NHL") || t.tournamentName?.includes("NFL"));
        if (active) cfg.tournamentId = active.tournamentId;
      }
      if (!cfg.tournamentId) {
        _showBoardMsg("err", "No active tournaments found for " + cfg.label);
        return null;
      }
    }
    await fetchMarketMeta(sportId);
    const data = await apiFetch(`/odds-by-tournaments?bookmaker=${state.prefBook}&tournamentIds=${cfg.tournamentId}&oddsFormat=american`);
    if (!Array.isArray(data)) return null;
    const pids = [...new Set(data.flatMap((g) => [g.participant1Id, g.participant2Id]))];
    await resolveParticipants(pids, sportId);
    updateQuota();
    return data;
  }
  function normalizeProps(fixtureId, homeName, awayName) {
    const props = window.MOCK_DATA?.props?.[fixtureId];
    if (!Array.isArray(props)) return [];
    return props.map((p) => ({
      player: p.player,
      team: p.team,
      teamName: p.team === "home" ? homeName : awayName,
      mkt: p.mkt,
      line: p.line,
      overVig: ensureSign(p.overVig),
      underVig: ensureSign(p.underVig),
      alts: (p.alts || []).map((a) => ({
        line: a.line,
        overVig: ensureSign(a.overVig),
        underVig: ensureSign(a.underVig)
      }))
    }));
  }
  function normalizeGames(data, label, sportKey) {
    if (!Array.isArray(data)) return [];
    const cfg = SPORT_CFG.find((s) => s.key === sportKey);
    const meta = cfg && state.marketMetaCache[cfg.sportId] || {};
    return data.map((ev) => {
      const bm = ev.bookmakerOdds?.[state.prefBook];
      if (!bm || !bm.bookmakerIsActive) return null;
      const mkts = bm.markets || {};
      const p1name = state.participantCache[ev.participant1Id] || `Team ${ev.participant1Id}`;
      const p2name = state.participantCache[ev.participant2Id] || `Team ${ev.participant2Id}`;
      let mlMkt = null, spMkt = null, spMeta = null, totMkt = null, totMeta = null;
      let tt1Mkt = null, tt1Meta = null, tt2Mkt = null, tt2Meta = null;
      let tt1Fb = null, tt2Fb = null;
      const spAll = [], totAll = [], tt1All = [], tt2All = [];
      for (const id in mkts) {
        const md = meta[id];
        if (!md || md.period !== "result" || md.playerProp || md.marketLength !== 2) continue;
        const m = mkts[id];
        const o1id = md.outcomes[0].outcomeId;
        const p1 = m.outcomes?.[o1id]?.players?.[0];
        if (!p1) continue;
        if (md.marketType === "moneyline" && !mlMkt) {
          mlMkt = { market: m, meta: md };
        } else if (md.marketType === "spreads") {
          spAll.push({ market: m, meta: md });
          if (p1.mainLine === true && !spMkt) {
            spMkt = { market: m, meta: md };
            spMeta = md;
          }
        } else if (md.marketType === "totals") {
          totAll.push({ market: m, meta: md });
          if (p1.mainLine === true && !totMkt) {
            totMkt = { market: m, meta: md };
            totMeta = md;
          }
        } else if (md.marketType === "teamtotals-team1") {
          tt1All.push({ market: m, meta: md });
          if (p1.mainLine === true && !tt1Mkt) {
            tt1Mkt = { market: m, meta: md };
            tt1Meta = md;
          } else if (!tt1Fb) {
            tt1Fb = { market: m, meta: md };
          }
        } else if (md.marketType === "teamtotals-team2") {
          tt2All.push({ market: m, meta: md });
          if (p1.mainLine === true && !tt2Mkt) {
            tt2Mkt = { market: m, meta: md };
            tt2Meta = md;
          } else if (!tt2Fb) {
            tt2Fb = { market: m, meta: md };
          }
        }
      }
      if (!tt1Mkt && tt1Fb) {
        tt1Mkt = tt1Fb;
        tt1Meta = tt1Fb.meta;
      }
      if (!tt2Mkt && tt2Fb) {
        tt2Mkt = tt2Fb;
        tt2Meta = tt2Fb.meta;
      }
      const getVig = (pair, idx) => {
        if (!pair) return "";
        const oid = pair.meta.outcomes[idx].outcomeId;
        const p = pair.market.outcomes?.[oid]?.players?.[0];
        return p?.active && p.priceAmerican ? p.priceAmerican : "";
      };
      const mlP1 = getVig(mlMkt, 0);
      const mlP2 = getVig(mlMkt, 1);
      const spP1Line = spMeta ? fmtLine(spMeta.handicap) : "";
      const spP2Line = spMeta ? fmtLine(-spMeta.handicap) : "";
      const spP1Vig = getVig(spMkt, 0);
      const spP2Vig = getVig(spMkt, 1);
      const totLine = totMeta ? fmtTotalLine(totMeta.handicap) : "";
      const totOverVig = getVig(totMkt, 0);
      const totUnderVig = getVig(totMkt, 1);
      const tt1Line = tt1Meta ? fmtTotalLine(tt1Meta.handicap) : "";
      const tt1Vig = getVig(tt1Mkt, 0);
      const tt2Line = tt2Meta ? fmtTotalLine(tt2Meta.handicap) : "";
      const tt2Vig = getVig(tt2Mkt, 0);
      const numHc = (pair) => parseFloat(pair.meta.handicap);
      const altSpHome = spAll.map((pair) => ({ line: fmtLine(pair.meta.handicap), vig: ensureSign(getVig(pair, 0)), raw: numHc(pair) })).filter((e) => e.vig).sort((a, b) => a.raw - b.raw);
      const altSpAway = spAll.map((pair) => ({ line: fmtLine(-pair.meta.handicap), vig: ensureSign(getVig(pair, 1)), raw: -numHc(pair) })).filter((e) => e.vig).sort((a, b) => a.raw - b.raw);
      const altTotOver = totAll.map((pair) => ({ line: "o" + fmtTotalLine(pair.meta.handicap), vig: ensureSign(getVig(pair, 0)), raw: numHc(pair) })).filter((e) => e.vig).sort((a, b) => a.raw - b.raw);
      const altTotUnder = totAll.map((pair) => ({ line: "u" + fmtTotalLine(pair.meta.handicap), vig: ensureSign(getVig(pair, 1)), raw: numHc(pair) })).filter((e) => e.vig).sort((a, b) => a.raw - b.raw);
      const altTT1 = tt1All.map((pair) => ({ line: "o" + fmtTotalLine(pair.meta.handicap), vig: ensureSign(getVig(pair, 0)), raw: numHc(pair) })).filter((e) => e.vig).sort((a, b) => a.raw - b.raw);
      const altTT2 = tt2All.map((pair) => ({ line: "o" + fmtTotalLine(pair.meta.handicap), vig: ensureSign(getVig(pair, 0)), raw: numHc(pair) })).filter((e) => e.vig).sort((a, b) => a.raw - b.raw);
      const gt = new Date(ev.startTime);
      const isLive = ev.statusId === 1 || gt < /* @__PURE__ */ new Date();
      return {
        id: ev.fixtureId,
        sport: label,
        isLive,
        date: gt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
        time: gt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
        home: p1name,
        away: p2name,
        props: normalizeProps(ev.fixtureId, p1name, p2name),
        teams: [
          // Away team (p2)
          {
            name: p2name,
            abbr: p2name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase(),
            spread: spP2Line,
            spVig: ensureSign(spP2Vig),
            ml: ensureSign(mlP2),
            total: totLine ? "o" + totLine : "",
            totVig: ensureSign(totOverVig),
            tt: tt2Line ? "o" + tt2Line : "",
            ttVig: ensureSign(tt2Vig),
            altSpreads: altSpAway,
            // p2 sees -handicap variants
            altTotals: altTotOver,
            // away row carries the OVER variants
            altTT: altTT2
            // away team's own total OVER variants
          },
          // Home team (p1)
          {
            name: p1name,
            abbr: p1name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase(),
            spread: spP1Line,
            spVig: ensureSign(spP1Vig),
            ml: ensureSign(mlP1),
            total: totLine ? "u" + totLine : "",
            totVig: ensureSign(totUnderVig),
            tt: tt1Line ? "o" + tt1Line : "",
            ttVig: ensureSign(tt1Vig),
            altSpreads: altSpHome,
            // p1 sees +handicap variants
            altTotals: altTotUnder,
            // home row carries the UNDER variants
            altTT: altTT1
            // home team's own total OVER variants
          }
        ]
      };
    }).filter(Boolean);
  }
  async function fetchAndRender(sportKey, loader = true) {
    if (state.isLoading) return;
    state.isLoading = true;
    setSpinner(true);
    if (loader && !state.gamesCache[sportKey]) _showBoardMsg("load");
    try {
      const raw = await fetchOdds(sportKey);
      if (!raw) {
        state.isLoading = false;
        setSpinner(false);
        return;
      }
      const label = SPORT_CFG.find((s) => s.key === sportKey)?.label || sportKey;
      const games = normalizeGames(raw, label, sportKey);
      const moved = detectMoved(games);
      state.gamesCache[sportKey] = games;
      const sc = SPORT_CFG.find((s) => s.key === sportKey);
      const activeSportKey = getActiveSportKey();
      if (sc && sportKey === activeSportKey) _renderBoard(moved);
      document.getElementById("lupd").textContent = "Updated " + (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      setOnline(true);
      if (moved.size) _showToast(`\u{1F4C8} ${moved.size} line${moved.size > 1 ? "s" : ""} moved`);
    } catch (e) {
      setOnline(false);
      if (!Object.keys(state.gamesCache).length) _showBoardMsg("err", e.message);
      else _showToast("\u26A0 Refresh failed");
    }
    state.isLoading = false;
    setSpinner(false);
  }
  function detectMoved(games) {
    const moved = /* @__PURE__ */ new Map();
    games.forEach((g) => g.teams.forEach((t) => {
      ["spread", "ml", "total", "tt"].forEach((mk) => {
        const line = mk === "spread" ? t.spread : mk === "ml" ? t.ml : mk === "total" ? t.total : t.tt;
        const vig = mk === "spread" ? t.spVig : mk === "ml" ? "" : mk === "total" ? t.totVig : t.ttVig;
        const key = `${g.id}_${t.name}_${mk}`;
        const prev = state.prevOdds[key], curr = line + vig;
        if (prev && prev !== curr && line) {
          const prevLineMatch = String(prev).match(/-?\d+(\.\d+)?/);
          const prevLineNum = prevLineMatch ? parseFloat(prevLineMatch[0]) : NaN;
          const currLineNum = parseFloat(line);
          if (!isNaN(prevLineNum) && !isNaN(currLineNum) && prevLineNum !== currLineNum) {
            moved.set(key, currLineNum > prevLineNum ? "up" : "dn");
          }
        }
        if (line) state.prevOdds[key] = curr;
      });
    }));
    return moved;
  }
  async function manualRefresh() {
    await fetchAndRender(getActiveSportKey(), false);
    resetAuto();
  }
  function getActiveSportKey() {
    if (state.activeLeague.startsWith("NCAAB")) return "NCAAB";
    if (state.activeLeague.startsWith("NCAAF")) return "NCAAF";
    if (state.activeLeague.startsWith("NBA")) return "NBA";
    if (state.activeLeague.startsWith("MLB")) return "MLB";
    if (state.activeLeague.startsWith("NHL")) return "NHL";
    if (state.activeLeague.startsWith("NFL")) return "NFL";
    return SPORT_CFG[0].key;
  }
  function startAuto() {
    clearInterval(state.autoTimer);
    clearInterval(state.cdownTimer);
    state.cdownSec = AUTO_MS / 1e3;
    state.cdownTimer = setInterval(() => {
      state.cdownSec--;
      const m = Math.floor(state.cdownSec / 60), s = String(state.cdownSec % 60).padStart(2, "0");
      document.getElementById("auto-timer").textContent = ` | Auto: ${m}:${s}`;
      if (state.cdownSec <= 0) state.cdownSec = AUTO_MS / 1e3;
    }, 1e3);
    state.autoTimer = setInterval(() => {
      fetchAndRender("NBA", false);
      setTimeout(() => fetchAndRender("MLB", false), 1500);
    }, AUTO_MS);
  }
  function resetAuto() {
    clearInterval(state.autoTimer);
    clearInterval(state.cdownTimer);
    startAuto();
  }
  function setOnline(ok) {
    const d = document.getElementById("ldot"), t = document.getElementById("api-status");
    d.className = ok ? "ldot live" : "ldot off";
    t.textContent = state.mockMode ? "\u{1F3AD} Mock Mode" : ok ? "Live" : "Offline";
  }
  function setSpinner(on) {
    document.getElementById("upd-btn").classList.toggle("spinning", on);
  }
  function updateQuota() {
    const total = state.qUsed + state.qRem, pct = total > 0 ? Math.round(state.qUsed / total * 100) : 0;
    const cls = state.qRem < 50 ? "bad" : state.qRem < 150 ? "warn" : "ok";
    document.getElementById("qtxt").innerHTML = ` | Quota: <span class="${cls}">${state.qRem}</span> left`;
    const bar = document.getElementById("qbar");
    bar.style.width = pct + "%";
    bar.className = "qbar-fill" + (state.qRem < 50 ? " bad" : state.qRem < 150 ? " warn" : "");
    const eu = document.getElementById("q-used");
    if (eu) eu.textContent = state.qUsed + " used";
    const er = document.getElementById("q-rem");
    if (er) er.textContent = state.qRem + " remaining";
  }

  // src/bets.js
  var _renderBoard2 = () => {
  };
  var _buildGameBlock = (g) => document.createElement("div");
  var _showBoardMsg2 = () => {
  };
  var _showToast2 = () => {
  };
  var _updateBalDisp = () => {
  };
  var _buildAltChevron = null;
  function setBetsHooks({ renderBoard: renderBoard2, buildGameBlock: buildGameBlock2, showBoardMsg: showBoardMsg2, showToast: showToast2, updateBalDisp: updateBalDisp2, buildAltChevron: buildAltChevron2 }) {
    if (renderBoard2) _renderBoard2 = renderBoard2;
    if (buildGameBlock2) _buildGameBlock = buildGameBlock2;
    if (showBoardMsg2) _showBoardMsg2 = showBoardMsg2;
    if (showToast2) _showToast2 = showToast2;
    if (updateBalDisp2) _updateBalDisp = updateBalDisp2;
    if (buildAltChevron2) _buildAltChevron = buildAltChevron2;
  }
  function setMode(mode) {
    state.wagerMode = mode;
    document.getElementById("tab-straight").classList.toggle("active", mode === "straight");
    document.getElementById("tab-parlay").classList.toggle("active", mode === "parlay");
    document.getElementById("tab-teaser").classList.toggle("active", mode === "teaser");
    document.getElementById("tab-ifbet").classList.toggle("active", mode === "ifbet");
    document.getElementById("sel-panel").style.display = mode === "parlay" || mode === "teaser" || mode === "ifbet" ? "flex" : "none";
    if (mode !== "straight") {
      state.slip.forEach((s) => delete state.selCells[s.key]);
      state.slip = [];
    }
    if (mode !== "parlay") {
      state.parlayLegs.forEach((l) => delete state.selCells[l.key]);
      state.parlayLegs = [];
    }
    if (mode !== "teaser") {
      state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
      state.teaserLegs = [];
      state.teaserVariant = null;
    }
    if (mode !== "ifbet") {
      state.ifBetLegs.forEach((l) => delete state.selCells[l.key]);
      state.ifBetLegs = [];
    }
    ["par-badge", "tea-badge", "if-badge"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = "0";
        el.classList.add("h");
      }
    });
    document.getElementById("sel-combined").className = "sel-combined h";
    document.getElementById("sel-legs").innerHTML = "";
    const sc = document.getElementById("sel-continue");
    sc.textContent = "(0) CONTINUE \u2192";
    sc.className = "sel-continue h";
    const isP = mode === "parlay", isT = mode === "teaser", isI = mode === "ifbet";
    document.getElementById("lim-spread").textContent = isP || isT || isI ? "$100" : "$1000";
    document.getElementById("lim-ml").textContent = isP || isI ? "$100" : isT ? "\u2014" : "$500";
    document.getElementById("lim-total").textContent = isP || isT || isI ? "$100" : "$1000";
    document.getElementById("lim-tt").textContent = isP || isI ? "$100" : isT ? "\u2014" : "$1000";
    document.getElementById("ch-ml").classList.toggle("disabled", isT);
    document.getElementById("ch-tt").classList.toggle("disabled", isT);
    const onTeaserMenu = isT && !state.teaserVariant;
    document.getElementById("teaser-menu").style.display = onTeaserMenu ? "block" : "none";
    document.getElementById("col-hdrs").style.display = onTeaserMenu ? "none" : "grid";
    document.getElementById("board").style.display = onTeaserMenu ? "none" : "";
    if (onTeaserMenu) renderTeaserMenu();
    if (mode === "parlay") updateParlaySelections();
    if (mode === "teaser" && state.teaserVariant) updateTeaserSelections();
    if (mode === "ifbet") updateIfBetSelections();
    updateContinueBtn();
    _renderBoard2();
  }
  function renderTeaserMenu() {
    const body = document.getElementById("tm-body");
    body.innerHTML = "";
    TEASER_VARIANTS.forEach((v) => {
      const row = document.createElement("div");
      row.className = "tm-row" + (v.enabled ? "" : " dis");
      const btn = document.createElement("button");
      btn.className = "tm-vbtn";
      btn.textContent = v.label;
      btn.disabled = !v.enabled;
      if (v.enabled) btn.onclick = () => selectTeaserVariant(v.key);
      const payLink = document.createElement("button");
      payLink.className = "tm-link" + (v.enabled && v.payouts ? "" : " dim");
      payLink.textContent = "PAYOUTS";
      if (v.enabled && v.payouts) payLink.onclick = () => showTeaserPayouts(v.key);
      const sportsLink = document.createElement("button");
      sportsLink.className = "tm-link dim";
      const legsTxt = v.minLegs === v.maxLegs ? `${v.minLegs} legs` : `${v.minLegs}\u2013${v.maxLegs} legs`;
      sportsLink.textContent = `NBA + NFL \xB7 ${legsTxt}`;
      row.appendChild(btn);
      row.appendChild(payLink);
      row.appendChild(sportsLink);
      body.appendChild(row);
    });
  }
  function selectTeaserVariant(variantKey) {
    state.teaserVariant = variantKey;
    state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
    state.teaserLegs = [];
    document.getElementById("teaser-menu").style.display = "none";
    document.getElementById("col-hdrs").style.display = "grid";
    document.getElementById("board").style.display = "";
    updateTeaserSelections();
    updateContinueBtn();
    _renderBoard2();
    _showToast2(`Teaser: ${getVariant(variantKey).label} active`);
  }
  function setContinueState(n, minLegs, handler) {
    const sc = document.getElementById("sel-continue");
    const cnt = document.getElementById("sel-continue-cnt");
    if (cnt) cnt.textContent = n;
    sc.classList.toggle("dim", n < minLegs);
    sc.onclick = handler;
  }
  function updateParlaySelections() {
    const n = state.parlayLegs.length;
    const badge = document.getElementById("par-badge");
    badge.textContent = n;
    badge.classList.toggle("h", n === 0);
    setContinueState(n, 2, () => openParlayModal());
    updateContinueBtn();
    const combined = document.getElementById("sel-combined");
    combined.classList.toggle("show", n >= 2);
    if (n >= 2) {
      const dec = parlayDec(state.parlayLegs);
      document.getElementById("sc-odds").textContent = dec.toFixed(3);
      document.getElementById("sc-am").textContent = `${decToAm(dec)} American`;
    }
    const legsCont = document.getElementById("sel-legs");
    legsCont.innerHTML = "";
    if (n === 0) {
      legsCont.innerHTML = '<div class="sel-empty"><strong>No legs yet</strong><span>Tap any odds on the board to start your parlay</span><small>Minimum 2 legs to place</small></div>';
      return;
    }
    state.parlayLegs.forEach((leg) => {
      const d = document.createElement("div");
      d.className = "sel-leg";
      let logoHtml, titleHtml, subHtml;
      if (isPropLeg(leg)) {
        const side = propSide(leg);
        const ln = propLineNum(leg);
        logoHtml = `<div class="sel-logo">${escapeHtml(propInitials(leg))}</div>`;
        titleHtml = `<div class="sel-team">${escapeHtml(leg.propPlayer)}</div>`;
        subHtml = `<div class="sel-sub">${escapeHtml(propMktLabel(leg))} \xB7 <strong>${escapeHtml(side)} ${escapeHtml(ln)}</strong>${leg.vig ? ` <span class="text-bet-text-xs">(${escapeHtml(leg.vig)})</span>` : ""}</div>`;
      } else {
        const tl = { spread: "Spread", ml: "Moneyline", total: "Total", tt: "Team Total" }[leg.type] || leg.type;
        const initials = leg.teamName.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase();
        const oddsTxt = leg.vig && leg.vig !== leg.line ? `${escapeHtml(leg.line)} <span class="text-bet-text-xs">(${escapeHtml(leg.vig)})</span>` : escapeHtml(leg.line);
        logoHtml = `<div class="sel-logo">${escapeHtml(initials)}</div>`;
        titleHtml = `<div class="sel-team">${escapeHtml(leg.teamName)}</div>`;
        subHtml = `<div class="sel-sub">${tl} \xB7 <strong>${oddsTxt}</strong></div>`;
      }
      d.innerHTML = `
      ${logoHtml}
      <div class="sel-info">
        ${titleHtml}
        ${subHtml}
      </div>
      <button class="sel-rm" data-key="${escapeHtml(leg.key)}" title="Remove leg">\u2715</button>`;
      d.querySelector(".sel-rm").addEventListener("click", (e) => removeParlayLeg(e.currentTarget.dataset.key));
      legsCont.appendChild(d);
    });
  }
  function clearParlay() {
    state.parlayLegs.forEach((l) => delete state.selCells[l.key]);
    state.parlayLegs = [];
    updateParlaySelections();
    _renderBoard2();
  }
  function removeParlayLeg(key) {
    delete state.selCells[key];
    state.parlayLegs = state.parlayLegs.filter((l) => l.key !== key);
    updateParlaySelections();
    _renderBoard2();
  }
  function clearSelections() {
    if (state.wagerMode === "teaser") clearTeaser();
    else if (state.wagerMode === "ifbet") clearIfBet();
    else clearParlay();
  }
  function onIfBetClick(game, team, mkey, line, vig, key, blockEl, gameObj) {
    const idx = state.ifBetLegs.findIndex((l) => l.key === key);
    if (idx > -1) {
      state.ifBetLegs.splice(idx, 1);
      delete state.selCells[key];
    } else {
      if (state.ifBetLegs.length >= 8) {
        _showToast2("Max 8 legs in an If Bet");
        return;
      }
      state.ifBetLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup: `${game.away} @ ${game.home}`, type: mkey, line, vig: vig || line, win: 50, fireRule: "win" });
      state.selCells[key] = true;
    }
    updateIfBetSelections();
    const nb = _buildGameBlock(gameObj);
    blockEl.replaceWith(nb);
  }
  function clearIfBet() {
    state.ifBetLegs.forEach((l) => delete state.selCells[l.key]);
    state.ifBetLegs = [];
    updateIfBetSelections();
    _renderBoard2();
  }
  function removeIfBetLeg(key) {
    delete state.selCells[key];
    state.ifBetLegs = state.ifBetLegs.filter((l) => l.key !== key);
    updateIfBetSelections();
    _renderBoard2();
  }
  function updateIfBetSelections() {
    const n = state.ifBetLegs.length;
    const ifBadge = document.getElementById("if-badge");
    ifBadge.textContent = n;
    ifBadge.classList.toggle("h", n === 0);
    setContinueState(n, 2, () => openIfBetModal());
    document.getElementById("sel-combined").classList.remove("show");
    const legsCont = document.getElementById("sel-legs");
    legsCont.innerHTML = "";
    if (n === 0) {
      legsCont.innerHTML = '<div class="sel-empty"><strong>If Bet builder</strong><span>Tap any odds to add legs in sequence</span><small>Each leg fires only if the previous one wins \xB7 Min 2 legs</small></div>';
      updateContinueBtn();
      return;
    }
    state.ifBetLegs.forEach((leg, i) => {
      const d = document.createElement("div");
      d.className = "sel-leg";
      let titleHtml, subHtml;
      if (isPropLeg(leg)) {
        const side = propSide(leg), ln = propLineNum(leg);
        titleHtml = `<div class="sel-team">${escapeHtml(leg.propPlayer)}</div>`;
        subHtml = `<div class="sel-sub">${escapeHtml(propMktLabel(leg))} \xB7 <strong>${escapeHtml(side)} ${escapeHtml(ln)}</strong>${leg.vig ? ` <span class="text-bet-text-xs">(${escapeHtml(leg.vig)})</span>` : ""}</div>`;
      } else {
        const tl = { spread: "Spread", ml: "Moneyline", total: "Total", tt: "Team Total" }[leg.type] || leg.type;
        const oddsTxt = leg.vig && leg.vig !== leg.line ? `${escapeHtml(leg.line)} <span class="text-bet-text-xs">(${escapeHtml(leg.vig)})</span>` : escapeHtml(leg.line);
        titleHtml = `<div class="sel-team">${escapeHtml(leg.teamName)}</div>`;
        subHtml = `<div class="sel-sub">${tl} \xB7 <strong>${oddsTxt}</strong></div>`;
      }
      d.innerHTML = `
      <div class="sel-logo numbered">${i + 1}</div>
      <div class="sel-info">
        ${titleHtml}
        ${subHtml}
      </div>
      <button class="sel-rm" data-key="${escapeHtml(leg.key)}" title="Remove leg">\u2715</button>`;
      d.querySelector(".sel-rm").addEventListener("click", (e) => removeIfBetLeg(e.currentTarget.dataset.key));
      legsCont.appendChild(d);
    });
    updateContinueBtn();
  }
  function openIfBetModal() {
    const n = state.ifBetLegs.length;
    if (n < 2) {
      _showToast2("Min 2 legs for an If Bet");
      return;
    }
    document.getElementById("iftitle").textContent = `${n}-Leg If Bet`;
    renderIFLegs();
    document.getElementById("ifoverlay").classList.add("open");
  }
  function closeIF() {
    document.getElementById("ifoverlay").classList.remove("open");
  }
  function renderIFLegs() {
    const cont = document.getElementById("iflegs");
    cont.innerHTML = "";
    state.ifBetLegs.forEach((leg, i) => {
      const win = parseFloat(leg.win) || 0;
      const risk = calcRisk(win, leg.vig || leg.line);
      const row = document.createElement("div");
      row.className = "if-leg";
      const ruleLabel = leg.fireRule === "winOrPush" ? "IF WIN/PUSH" : "IF WIN";
      const ruleTitle = i === 0 ? "Leg 1 always fires" : `Fires only if leg ${i} ${leg.fireRule === "winOrPush" ? "wins or pushes" : "wins"}`;
      let teamHtml;
      if (isPropLeg(leg)) {
        const side = propSide(leg), ln = propLineNum(leg);
        teamHtml = `${escapeHtml(leg.propPlayer)} <span style="color:var(--text-xs);font-weight:400">${escapeHtml(propMktLabel(leg))} ${escapeHtml(side)} ${escapeHtml(ln)}${leg.vig ? " (" + escapeHtml(leg.vig) + ")" : ""}</span>`;
      } else {
        const tl = { spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[leg.type] || leg.type;
        teamHtml = `${escapeHtml(leg.teamName)} <span style="color:var(--text-xs);font-weight:400">${tl} ${escapeHtml(leg.line)}${leg.vig && leg.vig !== leg.line ? " (" + escapeHtml(leg.vig) + ")" : ""}</span>`;
      }
      row.innerHTML = `
      <div class="if-leg-num">${i + 1}</div>
      <div class="if-leg-info">
        <div class="if-leg-team">${teamHtml}</div>
        <div class="if-leg-sub">${escapeHtml(leg.matchup)} \xB7 Risk ${fmtUSD(risk)} \xB7 ${i === 0 ? "Leg 1 always fires" : ruleTitle}</div>
      </div>
      <input class="rv-win-inp" type="number" value="${win.toFixed(2)}" min="20" step="5" data-idx="${i}" style="width:70px;text-align:right;font-family:var(--fh);font-weight:700">
      ${i === 0 ? '<div style="text-align:center;font-size:9px;color:var(--text-xs)">FIRST LEG</div>' : `<button class="if-leg-rule" data-idx="${i}" title="Toggle fire rule">${ruleLabel}</button>`}
      <button class="if-leg-rm" data-idx="${i}">\u2715</button>`;
      row.querySelector(".rv-win-inp").addEventListener("input", (e) => updateIFLegWin(parseInt(e.currentTarget.dataset.idx), e.currentTarget.value));
      if (i > 0) row.querySelector(".if-leg-rule").addEventListener("click", (e) => toggleIFLegRule(parseInt(e.currentTarget.dataset.idx)));
      row.querySelector(".if-leg-rm").addEventListener("click", (e) => removeIFLegFromModal(parseInt(e.currentTarget.dataset.idx)));
      cont.appendChild(row);
    });
    updateIFTotals();
  }
  function updateIFLegWin(idx, val) {
    if (!state.ifBetLegs[idx]) return;
    state.ifBetLegs[idx].win = parseFloat(val) || 0;
    updateIFTotals();
  }
  function toggleIFLegRule(idx) {
    if (!state.ifBetLegs[idx]) return;
    state.ifBetLegs[idx].fireRule = state.ifBetLegs[idx].fireRule === "winOrPush" ? "win" : "winOrPush";
    renderIFLegs();
  }
  function removeIFLegFromModal(idx) {
    if (!state.ifBetLegs[idx]) return;
    delete state.selCells[state.ifBetLegs[idx].key];
    state.ifBetLegs.splice(idx, 1);
    if (state.ifBetLegs.length < 2) {
      closeIF();
      updateIfBetSelections();
      _renderBoard2();
      return;
    }
    renderIFLegs();
    updateIfBetSelections();
    _renderBoard2();
  }
  function updateIFTotals() {
    if (!state.ifBetLegs.length) {
      document.getElementById("if-totrisk").textContent = "$0.00";
      document.getElementById("if-totwin").textContent = "$0.00";
      return;
    }
    const leg1 = state.ifBetLegs[0];
    const leg1Risk = calcRisk(parseFloat(leg1.win) || 0, leg1.vig || leg1.line);
    const totalWin = state.ifBetLegs.reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
    document.getElementById("if-totrisk").textContent = fmtUSD(leg1Risk);
    document.getElementById("if-totwin").textContent = fmtUSD(totalWin);
    const valEl = document.getElementById("if-val");
    const minOk = state.ifBetLegs.every((l) => (parseFloat(l.win) || 0) >= 20);
    const balOk = leg1Risk <= state.balance;
    valEl.textContent = !minOk ? "\u26A0 Each leg must win at least $20" : !balOk ? "\u26A0 Leg 1 risk exceeds state.balance" : "";
    const btn = document.getElementById("if-confirm");
    btn.disabled = !minOk || !balOk;
    btn.textContent = !balOk ? "Insufficient state.balance" : `Place ${state.ifBetLegs.length}-Leg If Bet \u2192`;
  }
  function confirmIfBet() {
    const n = state.ifBetLegs.length;
    if (n < 2) {
      _showToast2("Min 2 legs");
      return;
    }
    if (!state.ifBetLegs.every((l) => (parseFloat(l.win) || 0) >= 20)) {
      _showToast2("Each leg must win at least $20");
      return;
    }
    const leg1Risk = calcRisk(parseFloat(state.ifBetLegs[0].win) || 0, state.ifBetLegs[0].vig || state.ifBetLegs[0].line);
    if (leg1Risk > state.balance) {
      _showToast2("Insufficient state.balance");
      return;
    }
    const totalWin = state.ifBetLegs.reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
    state.balance -= leg1Risk;
    state.placedBets.push({ type: "ifbet", legs: state.ifBetLegs.map((l) => ({ teamName: l.teamName, matchup: l.matchup, type: l.type, line: l.line, vig: l.vig, win: l.win, fireRule: l.fireRule, sport: l.sport, propPlayer: l.propPlayer, propSide: l.propSide, propMkt: l.propMkt })), legCount: n, risk: leg1Risk, win: totalWin, placed: (/* @__PURE__ */ new Date()).toLocaleString(), status: "pending" });
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", state.balance);
    state.ifBetLegs.forEach((l) => delete state.selCells[l.key]);
    state.ifBetLegs = [];
    updateIfBetSelections();
    _updateBalDisp();
    updateBetsBtn();
    _renderBoard2();
    closeIF();
    _showToast2(`\u2713 ${n}-leg if bet placed! Risk ${fmtUSD(leg1Risk)} \u2192 potential win ${fmtUSD(totalWin)}`);
  }
  function buildTeaserCell(game, team, mkey, line, blockEl, gameObj) {
    const cell = document.createElement("div");
    cell.className = "tcell";
    if (!line) {
      cell.innerHTML = '<span class="odash">\u2014</span>';
      return cell;
    }
    const v = getVariant(state.teaserVariant);
    const key = `${game.id}_${team.name}_${mkey}_T`;
    const existing = state.teaserLegs.find((l) => l.key === key);
    const origLine = existing ? existing.origLine : line;
    const shifted = teaserShift(origLine, mkey, v, game.sport);
    if (!shifted) {
      cell.innerHTML = '<span class="odash">\u2014</span>';
      return cell;
    }
    const isSel = !!state.selCells[key];
    const btn = document.createElement("button");
    btn.className = "tbtn" + (isSel ? " sel" : "");
    btn.innerHTML = `<span class="torig">${escapeHtml(origLine)}</span> <strong>${escapeHtml(shifted)}</strong>`;
    btn.title = `Original ${origLine} \u2192 teased ${shifted} (${v.label})`;
    btn.onclick = () => onTeaserClick(game, team, mkey, origLine, shifted, key, blockEl, gameObj);
    cell.appendChild(btn);
    const altsKey = mkey === "spread" ? "altSpreads" : mkey === "total" ? "altTotals" : null;
    const alts = altsKey ? team[altsKey] || [] : [];
    if (alts.length > 1 && _buildAltChevron) {
      cell.classList.add("relative");
      cell.appendChild(_buildAltChevron(game, team, mkey, origLine, "", alts, blockEl, gameObj));
    }
    return cell;
  }
  function onTeaserClick(game, team, mkey, origLine, shiftedLine, key, blockEl, gameObj) {
    const v = getVariant(state.teaserVariant);
    const idx = state.teaserLegs.findIndex((l) => l.key === key);
    if (idx > -1) {
      state.teaserLegs.splice(idx, 1);
      delete state.selCells[key];
    } else {
      if (state.teaserLegs.length >= v.maxLegs) {
        _showToast2(`Max ${v.maxLegs} legs for ${v.label}`);
        return;
      }
      state.teaserLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup: `${game.away} @ ${game.home}`, type: mkey, origLine, shiftedLine });
      state.selCells[key] = true;
    }
    updateTeaserSelections();
    const nb = _buildGameBlock(gameObj);
    blockEl.replaceWith(nb);
  }
  function updateTeaserSelections() {
    const n = state.teaserLegs.length;
    const v = state.teaserVariant ? getVariant(state.teaserVariant) : null;
    const teaBadge = document.getElementById("tea-badge");
    teaBadge.textContent = n;
    teaBadge.classList.toggle("h", n === 0);
    const minLegs = v ? v.minLegs : 2;
    setContinueState(n, minLegs, () => openTeaserModal());
    document.getElementById("sel-combined").classList.remove("show");
    const legsCont = document.getElementById("sel-legs");
    legsCont.innerHTML = "";
    if (n === 0) {
      legsCont.innerHTML = `<div class="sel-empty"><strong>${v ? escapeHtml(v.label) : "Teaser"} builder</strong><span>Tap any spread or total to add legs</span><small>Lines shift in your favor \xB7 Min ${minLegs} legs</small></div>`;
      updateContinueBtn();
      return;
    }
    state.teaserLegs.forEach((leg) => {
      const tl = { spread: "Spread", total: "Total" }[leg.type] || leg.type;
      const d = document.createElement("div");
      d.className = "sel-leg";
      const initials = leg.teamName.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase();
      d.innerHTML = `
      <div class="sel-logo">${escapeHtml(initials)}</div>
      <div class="sel-info">
        <div class="sel-team">${escapeHtml(leg.teamName)}</div>
        <div class="sel-sub">${tl}: <span class="torig">${escapeHtml(leg.origLine)}</span> \u2192 <strong>${escapeHtml(leg.shiftedLine)}</strong></div>
      </div>
      <button class="sel-rm" data-key="${escapeHtml(leg.key)}" title="Remove leg">\u2715</button>`;
      d.querySelector(".sel-rm").addEventListener("click", (e) => removeTeaserLeg(e.currentTarget.dataset.key));
      legsCont.appendChild(d);
    });
    updateContinueBtn();
  }
  function removeTeaserLeg(key) {
    delete state.selCells[key];
    state.teaserLegs = state.teaserLegs.filter((l) => l.key !== key);
    updateTeaserSelections();
    _renderBoard2();
  }
  function clearTeaser() {
    state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
    state.teaserLegs = [];
    updateTeaserSelections();
    _renderBoard2();
  }
  function setAltLineTeaser(game, team, mkey, line) {
    if (!state.teaserVariant) return;
    const v = getVariant(state.teaserVariant);
    const shifted = teaserShift(line, mkey, v, game.sport);
    if (!shifted) return;
    const key = `${game.id}_${team.name}_${mkey}_T`;
    const idx = state.teaserLegs.findIndex((l) => l.key === key);
    if (idx > -1) {
      state.teaserLegs[idx].origLine = line;
      state.teaserLegs[idx].shiftedLine = shifted;
    } else {
      if (state.teaserLegs.length >= v.maxLegs) {
        _showToast2(`Max ${v.maxLegs} legs for ${v.label}`);
        return;
      }
      state.teaserLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup: `${game.away} @ ${game.home}`, type: mkey, origLine: line, shiftedLine: shifted });
      state.selCells[key] = true;
    }
    updateTeaserSelections();
  }
  function showTeaserPayouts(variantKey) {
    const v = getVariant(variantKey);
    if (!v || !v.payouts) return;
    document.getElementById("tpay-title").textContent = v.label;
    const legsTxt = v.minLegs === v.maxLegs ? `${v.minLegs} legs (fixed)` : `${v.minLegs}\u2013${v.maxLegs} legs`;
    document.getElementById("tpay-sub").textContent = `${v.ftbShift} pt Football & ${v.bbShift} pt Basketball \xB7 ${legsTxt}`;
    const body = document.getElementById("tpay-body");
    body.innerHTML = "";
    Object.keys(v.payouts).forEach((legCount) => {
      const am = v.payouts[legCount];
      const dec = toDec(am);
      const risk = am.startsWith("-") ? Math.abs(parseFloat(am)) : 100;
      const win = am.startsWith("-") ? 100 : parseFloat(am.replace("+", ""));
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${legCount}</td><td>${legCount}</td><td>${risk}</td><td>${win}</td>`;
      body.appendChild(tr);
    });
    document.getElementById("tpay-overlay").classList.add("open");
  }
  function closeTeaserPayouts() {
    document.getElementById("tpay-overlay").classList.remove("open");
  }
  function openTeaserModal() {
    const v = getVariant(state.teaserVariant);
    const n = state.teaserLegs.length;
    if (n < v.minLegs) {
      _showToast2(`Min ${v.minLegs} legs for ${v.label}`);
      return;
    }
    document.getElementById("tmtitle").textContent = `${n}-Pick Teaser \xB7 ${v.label}`;
    const am = teaserPayout(v, n);
    document.getElementById("tm-am").textContent = am || "\u2014";
    const lc = document.getElementById("tmlegs");
    lc.innerHTML = "";
    state.teaserLegs.forEach((leg) => {
      const tl = { spread: "Spread", total: "Total" }[leg.type] || leg.type;
      const initials = leg.teamName.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase();
      const d = document.createElement("div");
      d.className = "pmleg";
      d.innerHTML = `<div class="pmlogo">${escapeHtml(initials)}</div><div class="pmteam">${escapeHtml(leg.teamName)} <span style="font-size:10px;color:var(--text-xs);font-weight:400">${tl}</span></div><div class="pmodds"><span style="text-decoration:line-through;color:var(--text-xs);font-size:11px;font-weight:400">${escapeHtml(leg.origLine)}</span> ${escapeHtml(leg.shiftedLine)}</div>`;
      lc.appendChild(d);
    });
    document.getElementById("tm-risk").value = "20";
    updateTMCalc();
    document.getElementById("tmoverlay").classList.add("open");
  }
  function closeTM() {
    document.getElementById("tmoverlay").classList.remove("open");
  }
  function updateTMCalc() {
    const v = getVariant(state.teaserVariant);
    const n = state.teaserLegs.length;
    const inp = document.getElementById("tm-risk");
    const risk = parseFloat(inp.value) || 0;
    const am = teaserPayout(v, n);
    if (!am || n < v.minLegs) {
      document.getElementById("tm-win").textContent = "$0.00";
      return;
    }
    const win = calcWin(risk, am);
    document.getElementById("tm-win").textContent = fmtUSD(win);
    const invalid = risk < 20 || risk > state.balance;
    inp.classList.toggle("invalid", invalid && inp.value !== "");
    document.getElementById("tm-val").textContent = risk < 20 ? "\u26A0 Minimum wager is $20" : risk > state.balance ? "\u26A0 Exceeds state.balance" : "";
    const btn = document.getElementById("tm-confirm");
    btn.disabled = n < v.minLegs || risk < 20 || risk > state.balance;
    btn.textContent = risk > state.balance ? "Insufficient state.balance" : `Place ${n}-Pick Teaser \u2192`;
  }
  function confirmTeaser() {
    const v = getVariant(state.teaserVariant);
    const n = state.teaserLegs.length;
    const risk = parseFloat(document.getElementById("tm-risk").value) || 0;
    const am = teaserPayout(v, n);
    if (!am) {
      _showToast2("Invalid leg count for variant");
      return;
    }
    if (risk < 20) {
      _showToast2("Min $20");
      return;
    }
    if (risk > state.balance) {
      _showToast2("Insufficient state.balance");
      return;
    }
    const win = calcWin(risk, am);
    state.balance -= risk;
    state.placedBets.push({ type: "teaser", variant: v.label, legs: state.teaserLegs.map((l) => ({ teamName: l.teamName, matchup: l.matchup, type: l.type, origLine: l.origLine, line: l.shiftedLine, sport: l.sport })), legCount: n, amOdds: am, risk, win, placed: (/* @__PURE__ */ new Date()).toLocaleString(), status: "pending" });
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", state.balance);
    state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
    state.teaserLegs = [];
    updateTeaserSelections();
    _updateBalDisp();
    updateBetsBtn();
    _renderBoard2();
    closeTM();
    _showToast2(`\u2713 ${n}-pick ${v.label} teaser placed! To win ${fmtUSD(win)}`);
  }
  function onContinue() {
    if (state.wagerMode === "parlay") {
      openParlayModal();
      return;
    }
    if (state.wagerMode === "teaser") {
      if (!state.teaserVariant) {
        _showToast2("Pick a teaser variant from the menu first");
        return;
      }
      openTeaserModal();
      return;
    }
    if (state.wagerMode === "ifbet") {
      openIfBetModal();
      return;
    }
    const valid = state.slip.filter((s) => s.win > 0);
    if (!valid.length) {
      _showToast2("Enter a win amount for at least one wager");
      return;
    }
    renderReview();
    document.getElementById("main-layout").style.display = "none";
    document.getElementById("review-screen").classList.add("active");
  }
  function closeReview() {
    document.getElementById("main-layout").style.display = "flex";
    document.getElementById("review-screen").classList.remove("active");
  }
  function renderReview() {
    const tbody = document.getElementById("rv-body");
    tbody.innerHTML = "";
    let totWin = 0, totRisk = 0;
    state.slip.filter((s) => s.win > 0).forEach((s) => {
      const win = parseFloat(s.win) || 0;
      const risk = calcRisk(win, s.vig || s.line);
      totWin += win;
      totRisk += risk;
      let titleHtml, subHtml, oddsHtml;
      if (isPropLeg(s)) {
        const side = propSide(s), ln = propLineNum(s);
        titleHtml = escapeHtml(s.propPlayer);
        subHtml = `${escapeHtml(s.matchup)} \xB7 ${escapeHtml(propMktLabel(s))}`;
        oddsHtml = `${escapeHtml(side)} ${escapeHtml(ln)}${s.vig ? " (" + escapeHtml(s.vig) + ")" : ""}`;
      } else {
        const tl = { spread: "Spread", ml: "Moneyline", total: "Total/OU", tt: "Team Total" }[s.type] || s.type;
        titleHtml = escapeHtml(s.teamName);
        subHtml = `${escapeHtml(s.matchup)} \xB7 ${tl}`;
        oddsHtml = `${escapeHtml(s.line)}${s.vig && s.vig !== s.line ? " (" + escapeHtml(s.vig) + ")" : ""}`;
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
      <td class="rv-td"><div class="rv-team"><button class="rv-rm" data-key="${escapeHtml(s.key)}">\u2715</button>${titleHtml}</div><div style="font-size:10px;color:var(--text-xs)">${subHtml}</div></td>
      <td class="rv-td"><select class="rv-odds-sel"><option>${oddsHtml}</option></select></td>
      <td class="rv-td" style="text-align:right"><input class="rv-win-inp" type="number" value="${win.toFixed(2)}" min="20" step="5" data-key="${escapeHtml(s.key)}"><div class="rv-val">${win < 20 ? "\u26A0 Min $20" : ""}</div></td>
      <td class="rv-td"><div class="rv-risk">${fmtUSD(risk)}</div></td>`;
      tr.querySelector(".rv-rm").addEventListener("click", (e) => removeFromSlip(e.currentTarget.dataset.key));
      tr.querySelector(".rv-win-inp").addEventListener("input", (e) => updateSlipWin(e.currentTarget.dataset.key, e.currentTarget.value));
      tbody.appendChild(tr);
    });
    document.getElementById("rv-summary").innerHTML = `Total Win: <span>${fmtUSD(totWin)}</span> &nbsp;|&nbsp; Total Risk: <span style="color:var(--red)">${fmtUSD(totRisk)}</span> &nbsp;|&nbsp; Balance After: <span>${fmtUSD(state.balance - totRisk)}</span>`;
  }
  function updateSlipWin(key, val) {
    const idx = state.slip.findIndex((s) => s.key === key);
    if (idx > -1) {
      state.slip[idx].win = parseFloat(val) || 0;
      renderReview();
    }
  }
  function removeFromSlip(key) {
    delete state.selCells[key];
    state.slip = state.slip.filter((s) => s.key !== key);
    if (!state.slip.length) {
      closeReview();
      _renderBoard2();
      return;
    }
    renderReview();
    _renderBoard2();
  }
  function confirmWagers() {
    const valid = state.slip.filter((s) => (parseFloat(s.win) || 0) >= 20);
    if (!valid.length) {
      _showToast2("Minimum win amount is $20");
      return;
    }
    const totRisk = valid.reduce((a, s) => a + calcRisk(parseFloat(s.win) || 0, s.vig || s.line), 0);
    if (totRisk > state.balance) {
      _showToast2("Insufficient state.balance");
      return;
    }
    state.balance -= totRisk;
    const now = (/* @__PURE__ */ new Date()).toLocaleString();
    valid.forEach((s) => {
      const risk = calcRisk(parseFloat(s.win) || 0, s.vig || s.line);
      state.placedBets.push({ ...s, type: "straight", risk, placed: now, status: "pending" });
    });
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", state.balance);
    state.slip = [];
    state.selCells = {};
    updateContinueBtn();
    _updateBalDisp();
    updateBetsBtn();
    _renderBoard2();
    closeReview();
    _showToast2("\u2713 Wager placed! Good luck.");
  }
  function openParlayModal() {
    if (state.parlayLegs.length < 2) {
      _showToast2("Select at least 2 legs");
      return;
    }
    const n = state.parlayLegs.length;
    document.getElementById("pmtitle").textContent = `${n} Team \u2013 Parlay`;
    const lc = document.getElementById("pmlegs");
    lc.innerHTML = "";
    state.parlayLegs.forEach((leg) => {
      const d = document.createElement("div");
      d.className = "pmleg";
      let logoHtml, teamHtml, oddsHtml;
      if (isPropLeg(leg)) {
        const side = propSide(leg), ln = propLineNum(leg);
        logoHtml = `<div class="pmlogo">${escapeHtml(propInitials(leg))}</div>`;
        teamHtml = `<div class="pmteam">${escapeHtml(leg.propPlayer)} <span style="font-size:10px;color:var(--text-xs);font-weight:400">${escapeHtml(propMktLabel(leg))}</span></div>`;
        oddsHtml = `<div class="pmodds">${escapeHtml(side)} ${escapeHtml(ln)}${leg.vig ? " (" + escapeHtml(leg.vig) + ")" : ""}</div>`;
      } else {
        const initials = leg.teamName.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase();
        logoHtml = `<div class="pmlogo">${escapeHtml(initials)}</div>`;
        teamHtml = `<div class="pmteam">${escapeHtml(leg.teamName)}</div>`;
        oddsHtml = `<div class="pmodds">${escapeHtml(leg.line)}${leg.vig && leg.vig !== leg.line ? " (" + escapeHtml(leg.vig) + ")" : ""}</div>`;
      }
      d.innerHTML = `${logoHtml}${teamHtml}${oddsHtml}`;
      lc.appendChild(d);
    });
    const gids = state.parlayLegs.map((l) => l.gameId);
    document.getElementById("corr").classList.toggle("h", gids.length === new Set(gids).size);
    document.getElementById("pm-risk").value = "20";
    updatePMCalc();
    document.getElementById("pmoverlay").classList.add("open");
  }
  function closePM() {
    document.getElementById("pmoverlay").classList.remove("open");
  }
  function updatePMCalc() {
    const inp = document.getElementById("pm-risk");
    const risk = parseFloat(inp.value) || 0;
    const n = state.parlayLegs.length;
    if (n < 2) {
      document.getElementById("pm-win").textContent = "$0.00";
      return;
    }
    const dec = parlayDec(state.parlayLegs);
    const win = (dec - 1) * risk;
    document.getElementById("pm-win").textContent = fmtUSD(win);
    const invalid = risk < 20 || risk > state.balance;
    inp.classList.toggle("invalid", invalid && inp.value !== "");
    document.getElementById("pm-val").textContent = risk < 20 ? "\u26A0 Minimum wager is $20" : risk > state.balance ? "\u26A0 Exceeds state.balance" : "";
    const btn = document.getElementById("pm-confirm");
    btn.disabled = n < 2 || risk < 20 || risk > state.balance;
    btn.textContent = risk > state.balance ? "Insufficient state.balance" : `Place ${n}-Leg Parlay \u2192`;
  }
  function confirmParlay() {
    const risk = parseFloat(document.getElementById("pm-risk").value) || 0;
    if (risk < 20) {
      _showToast2("Min $20");
      return;
    }
    if (risk > state.balance) {
      _showToast2("Insufficient state.balance");
      return;
    }
    const dec = parlayDec(state.parlayLegs), win = (dec - 1) * risk;
    state.balance -= risk;
    state.placedBets.push({ type: "parlay", legs: state.parlayLegs.map((l) => ({ teamName: l.teamName, matchup: l.matchup, type: l.type, line: l.line, vig: l.vig, propPlayer: l.propPlayer, propSide: l.propSide, propMkt: l.propMkt })), legCount: state.parlayLegs.length, decOdds: dec, amOdds: decToAm(dec), risk, win, placed: (/* @__PURE__ */ new Date()).toLocaleString(), status: "pending" });
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", state.balance);
    state.parlayLegs.forEach((l) => delete state.selCells[l.key]);
    state.parlayLegs = [];
    updateParlaySelections();
    _updateBalDisp();
    updateBetsBtn();
    _renderBoard2();
    closePM();
    _showToast2(`\u2713 ${state.placedBets[state.placedBets.length - 1].legCount}-leg parlay placed! To win ${fmtUSD(win)}`);
  }
  function updateBetsBtn() {
    const n = state.placedBets.filter((b) => b.status === "pending").length;
    const cnt = document.getElementById("bets-cnt");
    cnt.style.display = n ? "inline" : "none";
    cnt.textContent = n;
    const ps = document.getElementById("pend-stat");
    if (ps) ps.style.display = n ? "block" : "none";
    const pd = document.getElementById("pend-disp");
    if (pd) pd.textContent = n;
  }
  function openBets() {
    renderBetsModal();
    document.getElementById("bmodal-overlay").classList.add("open");
  }
  function closeBets() {
    document.getElementById("bmodal-overlay").classList.remove("open");
  }
  function renderBetsModal() {
    const body = document.getElementById("bmodal-body");
    body.innerHTML = "";
    if (!state.placedBets.length) {
      body.innerHTML = '<div style="text-align:center;color:var(--text-xs);padding:40px">No bets placed yet.</div>';
      return;
    }
    state.placedBets.map((b, i) => ({ b, i })).reverse().forEach(({ b, i }) => {
      const card = document.createElement("div");
      card.className = "betcard";
      if (b.type === "ifbet") {
        const totWin = b.win || (b.legs || []).reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
        const ifLegsHtml = (b.legs || []).map((l, i2) => {
          const rule = i2 === 0 ? "always" : l.fireRule === "winOrPush" ? "if win/push" : "if win";
          let label;
          if (isPropLeg(l)) {
            label = `${escapeHtml(l.propPlayer)} <span style="color:var(--text-xs)">(${escapeHtml(propMktLabel(l))}: ${escapeHtml(propSide(l))} ${escapeHtml(propLineNum(l))} \xB7 win ${fmtUSD(parseFloat(l.win) || 0)} \xB7 ${rule})</span>`;
          } else {
            const tl = { spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[l.type] || l.type;
            label = `${escapeHtml(l.teamName)} <span style="color:var(--text-xs)">(${tl}: ${escapeHtml(l.line)} \xB7 win ${fmtUSD(parseFloat(l.win) || 0)} \xB7 ${rule})</span>`;
          }
          return `<div class="plegprevrow"><b style="color:var(--orange)">${i2 + 1}.</b> ${label}</div>`;
        }).join("");
        card.innerHTML = `<div class="bettop"><span class="bettnm">\u26D3 ${b.legCount}-Leg If Bet</span><span class="betst ${b.status}">${escapeHtml(b.status.toUpperCase())}</span></div><div class="betmeta">Sequential \xB7 ${escapeHtml(b.placed || "")}</div><div class="plegprev">${ifLegsHtml}</div><div class="betamts"><div class="betamt"><label>Risk (Leg 1)</label><div class="bamt r">${fmtUSD(b.risk)}</div></div><div class="betamt"><label>Max Win</label><div class="bamt g">${fmtUSD(totWin)}</div></div></div>`;
      } else if (b.type === "teaser") {
        const win = b.win || calcWin(b.risk || 0, b.amOdds || "-110");
        card.innerHTML = `<div class="bettop"><span class="bettnm">\u{1F3AF} ${b.legCount}-Pick ${escapeHtml(b.variant || "Teaser")}</span><span class="betst ${b.status}">${escapeHtml(b.status.toUpperCase())}</span></div><div class="betmeta">Odds: ${escapeHtml(b.amOdds || "")} \xB7 ${escapeHtml(b.placed || "")}</div><div class="plegprev">${(b.legs || []).map((l, i2) => {
          const tl = { spread: "Spread", total: "Total" }[l.type] || l.type;
          return `<div class="plegprevrow"><b style="color:var(--teal)">${i2 + 1}.</b> ${escapeHtml(l.teamName)} <span style="color:var(--text-xs)">(${tl}: <span style="text-decoration:line-through">${escapeHtml(l.origLine || "")}</span> \u2192 ${escapeHtml(l.line)})</span></div>`;
        }).join("")}</div><div class="betamts"><div class="betamt"><label>Risk</label><div class="bamt r">${fmtUSD(b.risk)}</div></div><div class="betamt"><label>To Win</label><div class="bamt g">${fmtUSD(win)}</div></div></div>`;
      } else if (b.type === "parlay" || b.legCount) {
        const win = b.win || (b.decOdds - 1) * b.risk;
        const parLegsHtml = (b.legs || []).map((l, i2) => {
          let label;
          if (isPropLeg(l)) {
            label = `${escapeHtml(l.propPlayer)} <span style="color:var(--text-xs)">(${escapeHtml(propMktLabel(l))}: ${escapeHtml(propSide(l))} ${escapeHtml(propLineNum(l))}${l.vig ? " " + escapeHtml(l.vig) : ""})</span>`;
          } else {
            const tl = { spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[l.type] || l.type;
            label = `${escapeHtml(l.teamName)} <span style="color:var(--text-xs)">(${tl}: ${escapeHtml(l.line)}${l.vig && l.vig !== l.line ? " " + escapeHtml(l.vig) : ""})</span>`;
          }
          return `<div class="plegprevrow"><b style="color:var(--teal)">${i2 + 1}.</b> ${label}</div>`;
        }).join("");
        card.innerHTML = `<div class="bettop"><span class="bettnm">\u{1F3B0} ${b.legCount}-Leg Parlay</span><span class="betst ${b.status}">${escapeHtml(b.status.toUpperCase())}</span></div><div class="betmeta">Odds: ${escapeHtml(b.amOdds)} (${parseFloat(b.decOdds).toFixed(3)}x) \xB7 ${escapeHtml(b.placed || "")}</div><div class="plegprev">${parLegsHtml}</div><div class="betamts"><div class="betamt"><label>Risk</label><div class="bamt r">${fmtUSD(b.risk)}</div></div><div class="betamt"><label>To Win</label><div class="bamt g">${fmtUSD(win)}</div></div></div>`;
      } else {
        const win = b.win || calcWin(b.risk || 0, b.vig || b.line);
        const risk = b.risk || calcRisk(b.win || 0, b.vig || b.line);
        let titleHtml, metaHtml;
        if (isPropLeg(b)) {
          const sideTxt = propSide(b), lnTxt = propLineNum(b);
          titleHtml = `${escapeHtml(b.propPlayer)} <span style="color:var(--text-xs);font-weight:400">${escapeHtml(propMktLabel(b))}</span>`;
          metaHtml = `${escapeHtml(b.sport)} \xB7 ${escapeHtml(sideTxt)} ${escapeHtml(lnTxt)}${b.vig ? " (" + escapeHtml(b.vig) + ")" : ""} \xB7 ${escapeHtml(b.placed || "")}`;
        } else {
          const tl = { spread: "Spread", ml: "Moneyline", total: "Total/OU", tt: "Team Total" }[b.type] || b.type;
          titleHtml = escapeHtml(b.teamName);
          metaHtml = `${escapeHtml(b.sport)} \xB7 ${tl}: ${escapeHtml(b.line)}${b.vig && b.vig !== b.line ? " (" + escapeHtml(b.vig) + ")" : ""} \xB7 ${escapeHtml(b.placed || "")}`;
        }
        card.innerHTML = `<div class="bettop"><span class="bettnm">${titleHtml}</span><span class="betst ${b.status}">${escapeHtml(b.status.toUpperCase())}</span></div><div class="betmeta">${metaHtml}</div><div class="betamts"><div class="betamt"><label>Risk</label><div class="bamt r">${fmtUSD(risk)}</div></div><div class="betamt"><label>To Win</label><div class="bamt g">${fmtUSD(win)}</div></div></div>`;
      }
      if (b.status === "pending") {
        const sr = document.createElement("div");
        sr.className = "settle-row";
        sr.innerHTML = `<button class="settle-btn won" data-idx="${i}" data-outcome="won">\u2713 Won</button><button class="settle-btn push" data-idx="${i}" data-outcome="push">\u21BA Push</button><button class="settle-btn lost" data-idx="${i}" data-outcome="lost">\u2715 Lost</button>`;
        sr.querySelectorAll(".settle-btn").forEach((btn) => {
          btn.addEventListener("click", (e) => settleBet(parseInt(e.currentTarget.dataset.idx, 10), e.currentTarget.dataset.outcome));
        });
        card.appendChild(sr);
      }
      body.appendChild(card);
    });
  }
  function settleBet(idx, outcome) {
    const b = state.placedBets[idx];
    if (!b || b.status !== "pending") return;
    if (outcome === "won") {
      state.balance += b.risk + b.win;
    } else if (outcome === "push") {
      state.balance += b.risk;
    }
    b.status = outcome;
    b.settled = (/* @__PURE__ */ new Date()).toLocaleString();
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", state.balance);
    _updateBalDisp();
    updateBetsBtn();
    renderBetsModal();
    _showToast2(`Bet marked as ${outcome.toUpperCase()}`);
  }
  function updateContinueBtn() {
    let n = 0;
    if (state.wagerMode === "parlay") n = state.parlayLegs.length;
    else if (state.wagerMode === "teaser") n = state.teaserLegs.length;
    else if (state.wagerMode === "ifbet") n = state.ifBetLegs.length;
    else n = state.slip.filter((s) => s.win > 0).length;
    const top = document.getElementById("continue-cnt");
    const brd = document.getElementById("brd-continue-cnt");
    top.textContent = `(${n})`;
    brd.textContent = `(${n})`;
    top.classList.toggle("h", n === 0);
    brd.classList.toggle("h", n === 0);
    const cb = document.getElementById("continue-btn");
    cb.style.opacity = n > 0 ? "1" : "0.5";
  }
  function onOddsClickParlay(game, team, mkey, line, vig, key, blockEl, gameObj) {
    const idx = state.parlayLegs.findIndex((l) => l.key === key);
    if (idx > -1) {
      state.parlayLegs.splice(idx, 1);
      delete state.selCells[key];
    } else {
      state.parlayLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup: `${game.away} @ ${game.home}`, type: mkey, line, vig: vig || line });
      state.selCells[key] = true;
    }
    updateParlaySelections();
    const nb = _buildGameBlock(gameObj);
    blockEl.replaceWith(nb);
  }

  // src/main.js
  function renderSidebar() {
    const sports = [...new Set(LEAGUES_LIST.map((l) => l.sport))];
    const c = document.getElementById("sidebar-leagues");
    c.innerHTML = "";
    sports.forEach((sport) => {
      const leagues = LEAGUES_LIST.filter((l) => l.sport === sport);
      const grp = document.createElement("div");
      grp.className = "lg-group";
      const hdr = document.createElement("div");
      hdr.className = "lg-hdr";
      hdr.dataset.sport = sport;
      hdr.innerHTML = `${sport} <span class="chev">\u25BE</span>`;
      hdr.onclick = () => {
        hdr.classList.toggle("collapsed");
        items.classList.toggle("hidden");
      };
      const items = document.createElement("div");
      items.className = "lg-items";
      leagues.forEach((l) => {
        const item = document.createElement("div");
        item.className = "lg-item" + (l.name === state.activeLeague ? " active" : "");
        item.innerHTML = `<input type="checkbox" ${l.name === state.activeLeague ? "checked" : ""}> ${l.name}`;
        item.onclick = () => {
          state.activeLeague = l.name;
          document.getElementById("board-title").textContent = l.name;
          document.querySelectorAll(".lg-item").forEach((i) => i.classList.remove("active"));
          item.classList.add("active");
          const sportKey = getActiveSportKey();
          const sc = SPORT_CFG.find((s) => s.key === sportKey);
          if (sc && state.gamesCache[sc.key]) renderBoard();
          else if (sc) fetchAndRender(sc.key, true);
        };
        items.appendChild(item);
      });
      grp.appendChild(hdr);
      grp.appendChild(items);
      c.appendChild(grp);
    });
  }
  function showBoardMsg(type, msg = "") {
    const b = document.getElementById("board");
    if (type === "load") b.innerHTML = `<div class="ldstate"><div class="spinner"></div><div>Fetching live odds\u2026</div></div>`;
    else if (type === "err") b.innerHTML = `<div class="errstate"><div style="font-size:36px">\u{1F4E1}</div><div class="errmsg">Could not load odds</div><div class="errhint">${msg || "Check your API key in \u2699 Settings."}</div><button class="retrybtn" onclick="manualRefresh()">Retry</button></div>`;
    else if (type === "key") b.innerHTML = `<div class="errstate"><div style="font-size:36px">\u{1F511}</div><div class="errmsg">API Key Required</div><div class="errhint">Click \u2699 Settings in the header to add your free key from the-odds-api.com</div></div>`;
  }
  function renderBoard(moved = /* @__PURE__ */ new Map()) {
    const b = document.getElementById("board");
    b.innerHTML = "";
    const activeSportKey = getActiveSportKey();
    const sc = SPORT_CFG.find((s) => s.key === activeSportKey);
    if (!sc) {
      b.innerHTML = '<div class="ldstate" style="color:var(--text-xs)">Select a league from the sidebar.</div>';
      return;
    }
    const games = state.gamesCache[sc.key] || [];
    if (!games.length) {
      b.innerHTML = '<div class="ldstate" style="color:var(--text-xs)">No upcoming games for this league.</div>';
      return;
    }
    let lastDate = "";
    games.forEach((g) => {
      if (g.date !== lastDate) {
        lastDate = g.date;
        const d = document.createElement("div");
        d.className = "dsep";
        d.textContent = g.date;
        b.appendChild(d);
      }
      b.appendChild(buildGameBlock(g, moved));
    });
  }
  function buildGameBlock(game, moved = /* @__PURE__ */ new Map()) {
    const block = document.createElement("div");
    block.className = "gblock";
    const m = getGameMeta(game);
    const info = document.createElement("div");
    info.className = "ginfo";
    const timeHtml = `<span class="gtime-lbl${game.isLive ? " live" : ""}">${game.isLive ? "\u25CF LIVE" : escapeHtml(game.time)}</span>`;
    const isPlayoffs = m.badge && /playoff|finals|conference|championship/i.test(m.badge);
    const badgeHtml = m.badge ? `<span class="gbadge${isPlayoffs ? "" : " alt"}">${escapeHtml(m.badge)}</span>` : "";
    const awaySeed = m.seedAway ? `<span class="gseed">#${m.seedAway}</span>` : "";
    const homeSeed = m.seedHome ? `<span class="gseed">#${m.seedHome}</span>` : "";
    const netHtml = m.network ? `<span class="gnet">(${escapeHtml(m.network)})</span>` : "";
    const descHtml = `<span class="gdesc">${awaySeed}${escapeHtml(game.away)}<span class="vs">vs</span>${homeSeed}${escapeHtml(game.home)}${netHtml}</span>`;
    const seriesHtml = m.series ? `<span class="gseries">${escapeHtml(m.series)}</span>` : "";
    const maxWHtml = m.maxWager ? `<span class="gmaxw">Max ${fmtUSD(m.maxWager)}</span>` : "";
    const metaHtml = seriesHtml || maxWHtml ? `<span class="ginfo-meta">${seriesHtml}${maxWHtml}</span>` : "";
    info.innerHTML = `${timeHtml}${badgeHtml}${descHtml}${metaHtml}`;
    block.appendChild(info);
    if (m.injury) {
      const inj = document.createElement("div");
      inj.className = "ginjury";
      inj.textContent = m.injury;
      block.appendChild(inj);
    }
    game.teams.forEach((team) => {
      const row = document.createElement("div");
      row.className = "trow-g";
      const logo = `<div class="tlogo">${escapeHtml(team.abbr)}</div>`;
      row.innerHTML = `<div class="tname-g">${logo}${escapeHtml(team.name)}</div>`;
      if (state.wagerMode === "teaser" && state.teaserVariant) {
        row.appendChild(buildTeaserCell(game, team, "spread", team.spread, block, game));
        const mlEmpty = document.createElement("div");
        mlEmpty.className = "tcell";
        mlEmpty.innerHTML = '<span class="odash">\u2014</span>';
        row.appendChild(mlEmpty);
        row.appendChild(buildTeaserCell(game, team, "total", team.total, block, game));
        const ttEmpty = document.createElement("div");
        ttEmpty.className = "tcell";
        ttEmpty.innerHTML = '<span class="odash">\u2014</span>';
        row.appendChild(ttEmpty);
      } else {
        row.appendChild(buildOddsCell(game, team, "spread", team.spread, team.spVig, moved, block, game));
        row.appendChild(buildOddsCell(game, team, "ml", team.ml, "", moved, block, game));
        row.appendChild(buildOddsCell(game, team, "total", team.total, team.totVig, moved, block, game));
        row.appendChild(buildOddsCell(game, team, "tt", team.tt, team.ttVig, moved, block, game));
      }
      block.appendChild(row);
    });
    const propSec = buildPropSection(game);
    if (propSec) block.appendChild(propSec);
    return block;
  }
  function buildOddsCell(game, team, mkey, line, vig, moved, blockEl, gameObj) {
    const cell = document.createElement("div");
    cell.className = "ocell";
    if (!line) {
      cell.innerHTML = '<span class="odash">\u2014</span>';
      return cell;
    }
    const key = `${game.id}_${team.name}_${mkey}`;
    const isSel = !!state.selCells[key];
    const moveDir = moved.get(key);
    const existingPick = state.wagerMode === "straight" ? state.slip.find((s) => s.key === key) : state.wagerMode === "parlay" ? state.parlayLegs.find((s) => s.key === key) : state.wagerMode === "ifbet" ? state.ifBetLegs.find((s) => s.key === key) : null;
    if (existingPick) {
      line = existingPick.line;
      vig = existingPick.vig === existingPick.line ? "" : existingPick.vig;
    }
    const altsKey = mkey === "spread" ? "altSpreads" : mkey === "total" ? "altTotals" : mkey === "tt" ? "altTT" : null;
    const alts = altsKey ? team[altsKey] || [] : [];
    const hasAlts = alts.length > 1;
    if (state.wagerMode === "straight") {
      const winVal = state.slip.find((s) => s.key === key)?.win || "";
      const movCls = moveDir && !isSel ? moveDir === "up" ? " mup" : " mdn" : "";
      const inp = document.createElement("input");
      inp.className = "wager-inp";
      inp.type = "number";
      inp.value = winVal;
      inp.min = "20";
      inp.step = "5";
      inp.title = "Enter win amount";
      inp.addEventListener("input", (e) => onWinInput(key, game.id, team.name, game.sport, `${game.away} @ ${game.home}`, mkey, line, vig || "", e.target.value));
      cell.appendChild(inp);
      const arrowHtml = moveDir && !isSel ? `<span class="marr ${moveDir}">${moveDir === "up" ? "\u25B2" : "\u25BC"}</span>` : "";
      const btn = document.createElement("button");
      btn.className = "obtn" + (isSel ? " sel" : "") + movCls;
      btn.innerHTML = `${arrowHtml}<span class="onum">${escapeHtml(line)}</span>${vig ? `<span class="ovig">(${escapeHtml(vig)})</span>` : ""}`;
      btn.onclick = () => onOddsClickStraight(game, team, mkey, line, vig, key, blockEl, gameObj);
      cell.appendChild(btn);
      if (hasAlts) cell.appendChild(buildAltChevron(game, team, mkey, line, vig, alts, blockEl, gameObj));
    } else {
      const btn = document.createElement("button");
      btn.className = "pbtn" + (isSel ? " sel" : "");
      btn.textContent = `${line}${vig ? " (" + vig + ")" : ""}`;
      if (state.wagerMode === "ifbet") btn.onclick = () => onIfBetClick(game, team, mkey, line, vig, key, blockEl, gameObj);
      else btn.onclick = () => onOddsClickParlay(game, team, mkey, line, vig, key, blockEl, gameObj);
      cell.appendChild(btn);
      if (hasAlts) cell.appendChild(buildAltChevron(game, team, mkey, line, vig, alts, blockEl, gameObj));
    }
    return cell;
  }
  function onWinInput(key, gameId, teamName, sport, matchup, mkey, line, vig, winVal) {
    const win = parseFloat(winVal) || 0;
    const idx = state.slip.findIndex((s) => s.key === key);
    if (idx > -1) {
      state.slip[idx].win = win;
    } else {
      state.selCells[key] = true;
      state.slip.push({ key, gameId, teamName, sport, matchup, type: mkey, line, vig: vig || line, win });
    }
    if (win === 0) {
      delete state.selCells[key];
      state.slip = state.slip.filter((s) => s.key !== key);
    }
    updateContinueBtn();
  }
  function onOddsClickStraight(game, team, mkey, line, vig, key, blockEl, gameObj) {
    if (state.selCells[key]) {
      delete state.selCells[key];
      state.slip = state.slip.filter((s) => s.key !== key);
    } else {
      state.selCells[key] = true;
      if (!state.slip.find((s) => s.key === key)) state.slip.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup: `${game.away} @ ${game.home}`, type: mkey, line, vig: vig || line, win: 50 });
    }
    updateContinueBtn();
    const nb = buildGameBlock(gameObj);
    blockEl.replaceWith(nb);
  }
  var _altPop = null;
  var _altPopDoc = null;
  function closeAltPopover() {
    if (_altPop && _altPop.parentNode) _altPop.parentNode.removeChild(_altPop);
    if (_altPopDoc) document.removeEventListener("click", _altPopDoc, true);
    _altPop = null;
    _altPopDoc = null;
    document.querySelectorAll(".alt-chev.open").forEach((c) => c.classList.remove("open"));
  }
  function buildAltChevron(game, team, mkey, line, vig, alts, blockEl, gameObj) {
    const chev = document.createElement("button");
    chev.className = "alt-chev";
    chev.type = "button";
    chev.textContent = "\u25BC";
    chev.title = `${alts.length} alt lines`;
    chev.addEventListener("click", (e) => {
      e.stopPropagation();
      if (_altPop && _altPop.dataset.anchorKey === `${game.id}_${team.name}_${mkey}`) {
        closeAltPopover();
        return;
      }
      closeAltPopover();
      openAltPopover(chev, game, team, mkey, line, vig, alts, blockEl, gameObj);
    });
    return chev;
  }
  function openAltPopover(anchorEl, game, team, mkey, mainLine, mainVig, alts, blockEl, gameObj) {
    const key = `${game.id}_${team.name}_${mkey}`;
    let currentLine = mainLine;
    if (state.wagerMode === "straight") {
      const e = state.slip.find((s) => s.key === key);
      if (e) currentLine = e.line;
    } else if (state.wagerMode === "parlay") {
      const e = state.parlayLegs.find((s) => s.key === key);
      if (e) currentLine = e.line;
    } else if (state.wagerMode === "ifbet") {
      const e = state.ifBetLegs.find((s) => s.key === key);
      if (e) currentLine = e.line;
    }
    const pop = document.createElement("div");
    pop.className = "alt-pop";
    pop.dataset.anchorKey = key;
    const labels = { spread: "Alt Spreads", total: "Alt Totals", tt: "Alt Team Totals" };
    const hdr = document.createElement("div");
    hdr.className = "alt-pop-hdr";
    hdr.innerHTML = `<span>${escapeHtml(labels[mkey] || "Alt Lines")} \xB7 ${escapeHtml(team.name)}</span>`;
    const closeBtn = document.createElement("button");
    closeBtn.className = "alt-pop-close";
    closeBtn.type = "button";
    closeBtn.textContent = "\u2715";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAltPopover();
    });
    hdr.appendChild(closeBtn);
    pop.appendChild(hdr);
    const list = document.createElement("div");
    list.className = "alt-pop-list";
    if (!alts.length) {
      list.innerHTML = '<div class="alt-pop-empty">No alt lines available</div>';
    } else {
      alts.forEach((alt) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "alt-pop-row";
        if (alt.line === mainLine) row.classList.add("main");
        if (alt.line === currentLine) row.classList.add("sel");
        row.innerHTML = `<span class="alt-pop-line">${escapeHtml(alt.line)}</span><span class="alt-pop-vig">${escapeHtml(alt.vig)}</span>`;
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          setAltLine(game, team, mkey, alt.line, alt.vig, blockEl, gameObj);
          closeAltPopover();
        });
        list.appendChild(row);
      });
    }
    pop.appendChild(list);
    anchorEl.parentNode.appendChild(pop);
    anchorEl.classList.add("open");
    _altPop = pop;
    _altPopDoc = (e) => {
      if (!pop.contains(e.target) && e.target !== anchorEl) closeAltPopover();
    };
    setTimeout(() => document.addEventListener("click", _altPopDoc, true), 0);
  }
  function setAltLine(game, team, mkey, line, vig, blockEl, gameObj) {
    const key = `${game.id}_${team.name}_${mkey}`;
    const matchup = `${game.away} @ ${game.home}`;
    if (state.wagerMode === "straight") {
      const idx = state.slip.findIndex((s) => s.key === key);
      if (idx > -1) {
        state.slip[idx].line = line;
        state.slip[idx].vig = vig || line;
      } else {
        state.slip.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup, type: mkey, line, vig: vig || line, win: 50 });
        state.selCells[key] = true;
      }
      updateContinueBtn();
    } else if (state.wagerMode === "parlay") {
      const idx = state.parlayLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        state.parlayLegs[idx].line = line;
        state.parlayLegs[idx].vig = vig || line;
      } else {
        state.parlayLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup, type: mkey, line, vig: vig || line });
        state.selCells[key] = true;
      }
      updateParlaySelections();
    } else if (state.wagerMode === "ifbet") {
      const idx = state.ifBetLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        state.ifBetLegs[idx].line = line;
        state.ifBetLegs[idx].vig = vig || line;
      } else {
        state.ifBetLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup, type: mkey, line, vig: vig || line, win: 50, fireRule: "win" });
        state.selCells[key] = true;
      }
      updateIfBetSelections();
    } else if (state.wagerMode === "teaser") {
      setAltLineTeaser(game, team, mkey, line);
    }
    const nb = buildGameBlock(gameObj);
    blockEl.replaceWith(nb);
  }
  var PROP_LABEL2 = {
    pts: "Points",
    reb: "Rebounds",
    ast: "Assists",
    "3pm": "3-Pointers Made",
    blk: "Blocks",
    stl: "Steals",
    pr: "Pts + Reb",
    pa: "Pts + Ast",
    ar: "Ast + Reb",
    pra: "Pts + Reb + Ast"
  };
  function buildPropSection(game) {
    if (!game.props || !game.props.length) return null;
    const sec = document.createElement("div");
    sec.className = "prop-section";
    const startOpen = (state.activeLeague || "").toLowerCase().includes("prop");
    if (startOpen) sec.classList.add("open");
    const hdr = document.createElement("div");
    hdr.className = "prop-section-hdr";
    hdr.innerHTML = `<span class="chev">\u25BC</span><span>PLAYER PROPS</span><span class="text-bet-text-xs ml-1 font-normal lowercase tracking-normal">(${game.props.length})</span>`;
    hdr.onclick = () => sec.classList.toggle("open");
    sec.appendChild(hdr);
    const body = document.createElement("div");
    body.className = "prop-section-body";
    game.props.forEach((p) => body.appendChild(buildPropRow(game, p)));
    sec.appendChild(body);
    return sec;
  }
  function buildPropRow(game, prop) {
    const row = document.createElement("div");
    row.className = "prop-row";
    const info = document.createElement("div");
    info.className = "prop-info";
    info.innerHTML = `<span class="prop-player">${escapeHtml(prop.player)}</span><span class="prop-mkt">${escapeHtml(PROP_LABEL2[prop.mkt] || prop.mkt.toUpperCase())}</span>`;
    row.appendChild(info);
    row.appendChild(buildPropBtn(game, prop, "O"));
    row.appendChild(buildPropBtn(game, prop, "U"));
    return row;
  }
  function buildPropBtn(game, prop, side) {
    const key = `prop_${game.id}_${prop.player}_${prop.mkt}_${side}`;
    const isSel = !!state.selCells[key];
    const vig = side === "O" ? prop.overVig : prop.underVig;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "prop-btn" + (isSel ? " sel" : "");
    btn.innerHTML = `<span class="prop-btn-side">${side === "O" ? "OVER" : "UNDER"}</span><span class="prop-btn-line">${prop.line}</span><span class="prop-btn-vig">${escapeHtml(vig)}</span>`;
    btn.onclick = () => onPropClick(game, prop, side, key, btn);
    return btn;
  }
  function onPropClick(game, prop, side, key, btnEl) {
    const lineStr = `${side === "O" ? "o" : "u"}${prop.line}`;
    const vig = side === "O" ? prop.overVig : prop.underVig;
    const teamName = prop.teamName || (prop.team === "home" ? game.home : game.away);
    const matchup = `${game.away} @ ${game.home}`;
    const mkey = `prop_${prop.mkt}`;
    const sport = game.sport;
    if (state.wagerMode === "straight") {
      const idx = state.slip.findIndex((s) => s.key === key);
      if (idx > -1) {
        delete state.selCells[key];
        state.slip.splice(idx, 1);
      } else {
        state.selCells[key] = true;
        state.slip.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig, win: 50 });
      }
      updateContinueBtn();
    } else if (state.wagerMode === "parlay") {
      const idx = state.parlayLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        delete state.selCells[key];
        state.parlayLegs.splice(idx, 1);
      } else {
        state.selCells[key] = true;
        state.parlayLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig });
      }
      updateParlaySelections();
    } else if (state.wagerMode === "ifbet") {
      const idx = state.ifBetLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        delete state.selCells[key];
        state.ifBetLegs.splice(idx, 1);
      } else {
        if (state.ifBetLegs.length >= 8) {
          showToast("Max 8 legs in an If Bet");
          return;
        }
        state.selCells[key] = true;
        state.ifBetLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig, win: 50, fireRule: "win" });
      }
      updateIfBetSelections();
    } else if (state.wagerMode === "teaser") {
      showToast("Teasers only support spreads and totals");
      return;
    }
    btnEl.classList.toggle("sel");
  }
  function openSettings() {
    const inp = document.getElementById("api-key-inp");
    if (inp) inp.value = state.apiKey || "";
    const sel = document.getElementById("book-sel");
    if (sel) sel.value = state.prefBook;
    const cbx = document.getElementById("mock-cbx");
    if (cbx) {
      cbx.checked = state.mockMode;
      cbx.disabled = !window.MOCK_DATA;
      const ms = document.getElementById("mock-status");
      if (ms) ms.textContent = window.MOCK_DATA ? state.mockMode ? "Active \u2014 using captured fixture" : "Use captured fixture data \u2014 no API calls" : "Fixture (mock_data.js) not loaded";
    }
    const sb = document.getElementById("set-bal");
    if (sb) sb.textContent = fmtUSD(state.balance);
    const qbar = document.getElementById("qbar");
    const qu = document.getElementById("q-used"), qr = document.getElementById("q-rem");
    if (qbar) {
      const pct = state.qRem ? Math.min(100, state.qUsed / (state.qUsed + state.qRem) * 100) : 0;
      qbar.style.width = pct + "%";
    }
    if (qu) qu.textContent = `${state.qUsed} used`;
    if (qr) qr.textContent = `${state.qRem} remaining`;
    document.getElementById("set-overlay").classList.add("open");
  }
  function closeSettings() {
    document.getElementById("set-overlay").classList.remove("open");
  }
  function saveApiKey() {
    const v = document.getElementById("api-key-inp").value.trim();
    state.apiKey = v;
    localStorage.setItem("bs_key", v);
    if (v) {
      setOnline(true);
      showToast("API key saved");
      fetchAndRender();
    } else {
      setOnline(false);
      showToast("API key cleared");
    }
    closeSettings();
  }
  function saveBook() {
    state.prefBook = document.getElementById("book-sel").value;
    localStorage.setItem("bs_book", state.prefBook);
    state.gamesCache = {};
    fetchAndRender();
    showToast(`Bookmaker: ${state.prefBook}`);
  }
  function toggleMockMode() {
    const cbx = document.getElementById("mock-cbx");
    if (!cbx) return;
    if (cbx.checked && !window.MOCK_DATA) {
      cbx.checked = false;
      showToast("Mock data not available");
      return;
    }
    state.mockMode = cbx.checked;
    localStorage.setItem("bs_mock", state.mockMode ? "1" : "0");
    state.gamesCache = {};
    setOnline(state.mockMode || !!state.apiKey);
    fetchAndRender();
    showToast(state.mockMode ? "Mock Mode ON" : "Mock Mode OFF");
  }
  function resetBalance() {
    if (!confirm("Reset virtual state.balance to $1,000? This does not affect placed bets.")) return;
    state.balance = 1e3;
    localStorage.setItem("bs_bal", state.balance);
    updateBalDisp();
    const sb = document.getElementById("set-bal");
    if (sb) sb.textContent = fmtUSD(state.balance);
    showToast("Balance reset to $1,000");
  }
  function updateBalDisp() {
    const el = document.getElementById("bal-disp");
    if (el) el.textContent = fmtUSD(state.balance);
  }
  var _toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }
  function filterSport(sport) {
    document.querySelectorAll(".lg-group").forEach((g) => {
      const hdr = g.querySelector(".lg-hdr");
      const s = hdr ? hdr.dataset.sport : "";
      g.classList.toggle("hidden", sport !== "all" && s !== sport);
    });
    if (sport !== "all" && state.activeLeague && !state.activeLeague.startsWith(sport)) {
      const firstLeague = LEAGUES_LIST.find((l) => l.sport === sport);
      if (firstLeague) {
        state.activeLeague = firstLeague.name;
        document.getElementById("board-title").textContent = firstLeague.name;
        const sportKey = getActiveSportKey();
        const sc = SPORT_CFG.find((s) => s.key === sportKey);
        if (sc && state.gamesCache[sc.key]) renderBoard();
        else if (sc) fetchAndRender(sc.key, true);
      }
    }
  }
  setApiHooks({ renderBoard, showBoardMsg, showToast });
  setBetsHooks({ renderBoard, buildGameBlock, showBoardMsg, showToast, updateBalDisp, buildAltChevron });
  function init() {
    updateBalDisp();
    updateBetsBtn();
    renderSidebar();
    setMode("straight");
    setOnline(state.mockMode || !!state.apiKey);
    if (state.mockMode || state.apiKey) {
      fetchAndRender(getActiveSportKey());
      startAuto();
    } else {
      showBoardMsg("key");
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  window.addEventListener("beforeunload", () => {
    localStorage.setItem("bs_bal", state.balance);
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
  });
  Object.assign(window, {
    setMode,
    onContinue,
    closeReview,
    confirmWagers,
    manualRefresh,
    filterSport,
    clearSelections,
    openParlayModal,
    closePM,
    updatePMCalc,
    confirmParlay,
    closeIF,
    confirmIfBet,
    closeTM,
    updateTMCalc,
    confirmTeaser,
    closeTeaserPayouts,
    openBets,
    closeBets,
    settleBet,
    openSettings,
    closeSettings,
    saveApiKey,
    saveBook,
    resetBalance,
    toggleMockMode
  });
})();
