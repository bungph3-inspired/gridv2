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
    reverseLegs: [],
    // 2-team Reverse Action: exactly 2 legs {key,gameId,teamName,sport,matchup,type,line,vig}
    reverseStake: 50,
    // per-play stake (each If chain risks this; total risk = 2 × stake)
    selCells: {},
    // map: betKey → true (which odds cells are visually "selected")
    // ── ui ─────────────────────────────────────────────────
    wagerMode: "straight",
    // 'straight' | 'parlay' | 'teaser' | 'ifbet' | 'reverse'
    activeLeague: "NBA \u2013 Playoffs",
    // Alt-line chevrons are hidden by default; user opts in via Settings.
    // Gates the ▼ buttons on spread/total/teamtotal/prop cells across
    // desktop + mobile. Persisted in localStorage as 'bs_alt' = '1' | '0'.
    altLinesEnabled: localStorage.getItem("bs_alt") === "1",
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
  function betStatusBadge(status, baseClass = "betst") {
    const s = String(status || "pending").toLowerCase();
    return `<span class="${baseClass} ${s}">${s.toUpperCase()}</span>`;
  }
  function emptyState({ icon = "\u2139", heading = "", sub = "", hint = "" }) {
    return `<div class="estate" data-icon="${escapeHtml(icon)}">` + (heading ? `<strong>${escapeHtml(heading)}</strong>` : "") + (sub ? `<span>${escapeHtml(sub)}</span>` : "") + (hint ? `<small>${escapeHtml(hint)}</small>` : "") + `</div>`;
  }

  // src/teams.js
  var TEAM_DATA = {
    NBA: [
      ["Atlanta Hawks", "atl", "ATL"],
      ["Boston Celtics", "bos", "BOS"],
      ["Brooklyn Nets", "bkn", "BKN"],
      ["Charlotte Hornets", "cha", "CHA"],
      ["Chicago Bulls", "chi", "CHI"],
      ["Cleveland Cavaliers", "cle", "CLE"],
      ["Dallas Mavericks", "dal", "DAL"],
      ["Denver Nuggets", "den", "DEN"],
      ["Detroit Pistons", "det", "DET"],
      ["Golden State Warriors", "gs", "GSW"],
      ["Houston Rockets", "hou", "HOU"],
      ["Indiana Pacers", "ind", "IND"],
      ["LA Clippers", "lac", "LAC"],
      ["Los Angeles Clippers", "lac", "LAC"],
      ["Los Angeles Lakers", "lal", "LAL"],
      ["Memphis Grizzlies", "mem", "MEM"],
      ["Miami Heat", "mia", "MIA"],
      ["Milwaukee Bucks", "mil", "MIL"],
      ["Minnesota Timberwolves", "min", "MIN"],
      ["New Orleans Pelicans", "no", "NOP"],
      ["New York Knicks", "ny", "NYK"],
      ["Oklahoma City Thunder", "okc", "OKC"],
      ["Orlando Magic", "orl", "ORL"],
      ["Philadelphia 76ers", "phi", "PHI"],
      ["Phoenix Suns", "phx", "PHX"],
      ["Portland Trail Blazers", "por", "POR"],
      ["Sacramento Kings", "sac", "SAC"],
      ["San Antonio Spurs", "sa", "SAS"],
      ["Toronto Raptors", "tor", "TOR"],
      ["Utah Jazz", "utah", "UTA"],
      ["Washington Wizards", "wsh", "WAS"]
    ],
    NFL: [
      ["Arizona Cardinals", "ari", "ARI"],
      ["Atlanta Falcons", "atl", "ATL"],
      ["Baltimore Ravens", "bal", "BAL"],
      ["Buffalo Bills", "buf", "BUF"],
      ["Carolina Panthers", "car", "CAR"],
      ["Chicago Bears", "chi", "CHI"],
      ["Cincinnati Bengals", "cin", "CIN"],
      ["Cleveland Browns", "cle", "CLE"],
      ["Dallas Cowboys", "dal", "DAL"],
      ["Denver Broncos", "den", "DEN"],
      ["Detroit Lions", "det", "DET"],
      ["Green Bay Packers", "gb", "GB"],
      ["Houston Texans", "hou", "HOU"],
      ["Indianapolis Colts", "ind", "IND"],
      ["Jacksonville Jaguars", "jax", "JAX"],
      ["Kansas City Chiefs", "kc", "KC"],
      ["Las Vegas Raiders", "lv", "LV"],
      ["Los Angeles Chargers", "lac", "LAC"],
      ["Los Angeles Rams", "lar", "LAR"],
      ["Miami Dolphins", "mia", "MIA"],
      ["Minnesota Vikings", "min", "MIN"],
      ["New England Patriots", "ne", "NE"],
      ["New Orleans Saints", "no", "NO"],
      ["New York Giants", "nyg", "NYG"],
      ["New York Jets", "nyj", "NYJ"],
      ["Philadelphia Eagles", "phi", "PHI"],
      ["Pittsburgh Steelers", "pit", "PIT"],
      ["San Francisco 49ers", "sf", "SF"],
      ["Seattle Seahawks", "sea", "SEA"],
      ["Tampa Bay Buccaneers", "tb", "TB"],
      ["Tennessee Titans", "ten", "TEN"],
      ["Washington Commanders", "wsh", "WAS"]
    ],
    MLB: [
      ["Arizona Diamondbacks", "ari", "ARI"],
      ["Atlanta Braves", "atl", "ATL"],
      ["Baltimore Orioles", "bal", "BAL"],
      ["Boston Red Sox", "bos", "BOS"],
      ["Chicago Cubs", "chc", "CHC"],
      ["Chicago White Sox", "chw", "CHW"],
      ["Cincinnati Reds", "cin", "CIN"],
      ["Cleveland Guardians", "cle", "CLE"],
      ["Colorado Rockies", "col", "COL"],
      ["Detroit Tigers", "det", "DET"],
      ["Houston Astros", "hou", "HOU"],
      ["Kansas City Royals", "kc", "KC"],
      ["Los Angeles Angels", "laa", "LAA"],
      ["Los Angeles Dodgers", "lad", "LAD"],
      ["Miami Marlins", "mia", "MIA"],
      ["Milwaukee Brewers", "mil", "MIL"],
      ["Minnesota Twins", "min", "MIN"],
      ["New York Mets", "nym", "NYM"],
      ["New York Yankees", "nyy", "NYY"],
      ["Oakland Athletics", "oak", "OAK"],
      ["Athletics", "oak", "ATH"],
      ["Philadelphia Phillies", "phi", "PHI"],
      ["Pittsburgh Pirates", "pit", "PIT"],
      ["San Diego Padres", "sd", "SD"],
      ["Seattle Mariners", "sea", "SEA"],
      ["San Francisco Giants", "sf", "SF"],
      ["St. Louis Cardinals", "stl", "STL"],
      ["St Louis Cardinals", "stl", "STL"],
      ["Tampa Bay Rays", "tb", "TB"],
      ["Texas Rangers", "tex", "TEX"],
      ["Toronto Blue Jays", "tor", "TOR"],
      ["Washington Nationals", "wsh", "WSH"]
    ],
    NHL: [
      ["Anaheim Ducks", "ana", "ANA"],
      ["Boston Bruins", "bos", "BOS"],
      ["Buffalo Sabres", "buf", "BUF"],
      ["Calgary Flames", "cgy", "CGY"],
      ["Carolina Hurricanes", "car", "CAR"],
      ["Chicago Blackhawks", "chi", "CHI"],
      ["Colorado Avalanche", "col", "COL"],
      ["Columbus Blue Jackets", "cbj", "CBJ"],
      ["Dallas Stars", "dal", "DAL"],
      ["Detroit Red Wings", "det", "DET"],
      ["Edmonton Oilers", "edm", "EDM"],
      ["Florida Panthers", "fla", "FLA"],
      ["Los Angeles Kings", "la", "LAK"],
      ["Minnesota Wild", "min", "MIN"],
      ["Montreal Canadiens", "mtl", "MTL"],
      ["Nashville Predators", "nsh", "NSH"],
      ["New Jersey Devils", "nj", "NJ"],
      ["New York Islanders", "nyi", "NYI"],
      ["New York Rangers", "nyr", "NYR"],
      ["Ottawa Senators", "ott", "OTT"],
      ["Philadelphia Flyers", "phi", "PHI"],
      ["Pittsburgh Penguins", "pit", "PIT"],
      ["San Jose Sharks", "sj", "SJ"],
      ["Seattle Kraken", "sea", "SEA"],
      ["St. Louis Blues", "stl", "STL"],
      ["St Louis Blues", "stl", "STL"],
      ["Tampa Bay Lightning", "tb", "TB"],
      ["Toronto Maple Leafs", "tor", "TOR"],
      ["Utah Hockey Club", "utah", "UTA"],
      ["Utah Mammoth", "utah", "UTA"],
      ["Vancouver Canucks", "van", "VAN"],
      ["Vegas Golden Knights", "vgs", "VGK"],
      ["Washington Capitals", "wsh", "WSH"],
      ["Winnipeg Jets", "wpg", "WPG"]
    ]
  };
  var _byKey = (() => {
    const m = /* @__PURE__ */ new Map();
    for (const [league, rows] of Object.entries(TEAM_DATA)) {
      const leagueLower = league.toLowerCase();
      for (const [name, slug, abbr] of rows) {
        m.set(`${league}|${name.toLowerCase()}`, { slug, abbr, league: leagueLower });
      }
    }
    return m;
  })();
  function lookupTeam(sport, name) {
    if (!sport || !name) return null;
    return _byKey.get(`${sport}|${String(name).toLowerCase()}`) || null;
  }
  function initialsOf(name) {
    return String(name || "").trim().split(/\s+/).map((w) => w[0] || "").join("").slice(0, 3).toUpperCase();
  }
  var VARIANT_CLASS = {
    "tlogo": "tlogo",
    // board row
    "sel-logo": "sel-logo",
    // selections panel
    "pmlogo": "pmlogo",
    // modal review
    "mob-tlogo": "mob-tlogo"
    // mobile board
  };
  function teamLogoImg(sport, team, variant = "tlogo") {
    if (!team) return "";
    const cls = VARIANT_CLASS[variant] || VARIANT_CLASS.tlogo;
    const found = lookupTeam(sport, team.name);
    const mono = escapeHtml(found?.abbr || team.abbr || initialsOf(team.name));
    if (!found) {
      return `<div class="${cls}" data-mono="${mono}">${mono}</div>`;
    }
    const src = `/teams/${found.league}/${found.slug}.png`;
    return `<img src="${src}" class="${cls}-img" data-mono="${mono}" data-variant="${cls}" alt="" onerror="window.__bsLogoFallback(this)">`;
  }
  if (typeof window !== "undefined" && !window.__bsLogoFallback) {
    window.__bsLogoFallback = function(img) {
      const variant = img.getAttribute("data-variant") || "tlogo";
      const mono = img.getAttribute("data-mono") || "?";
      const div = document.createElement("div");
      div.className = variant;
      div.setAttribute("data-mono", mono);
      div.textContent = mono;
      img.replaceWith(div);
    };
  }
  var _BASKETBALL = `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3v18M5.5 5.5c4 4 9 4 13 0M5.5 18.5c4-4 9-4 13 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`;
  var _FOOTBALL = `<ellipse cx="12" cy="12" rx="9" ry="5.5" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-30 12 12)"/><path d="M9 12h6M10 10v4M12 10v4M14 10v4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" transform="rotate(-30 12 12)"/>`;
  var _BASEBALL = `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 5.5c2.5 2 4 4.5 4 6.5s-1.5 4.5-4 6.5M18.5 5.5c-2.5 2-4 4.5-4 6.5s1.5 4.5 4 6.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`;
  var _PUCK = `<ellipse cx="12" cy="14.5" rx="8" ry="2.5" fill="currentColor" opacity="0.85"/><ellipse cx="12" cy="11.5" rx="8" ry="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 11.5v3M20 11.5v3" fill="none" stroke="currentColor" stroke-width="1.6"/>`;
  var LEAGUE_ICONS = {
    NBA: _BASKETBALL,
    NCAAB: _BASKETBALL,
    NFL: _FOOTBALL,
    NCAAF: _FOOTBALL,
    MLB: _BASEBALL,
    NHL: _PUCK
  };
  function leagueIconHtml(sportKey, sizePx = 14) {
    const inner = LEAGUE_ICONS[sportKey];
    if (!inner) return "";
    const s = Number(sizePx) || 14;
    return `<svg class="lg-icon" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" focusable="false">${inner}</svg>`;
  }

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
      let bm = ev.bookmakerOdds?.[state.prefBook];
      if ((!bm || !bm.bookmakerIsActive) && state.mockMode) {
        const books = ev.bookmakerOdds || {};
        for (const bk of Object.keys(books)) {
          if (books[bk]?.bookmakerIsActive) {
            bm = books[bk];
            break;
          }
        }
      }
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
    const el = document.getElementById("upd-btn") || document.getElementById("mob-upd-btn");
    if (el) el.classList.toggle("spinning", on);
  }
  function updateQuota() {
    const total = state.qUsed + state.qRem, pct = total > 0 ? Math.round(state.qUsed / total * 100) : 0;
    const cls = state.qRem < 50 ? "bad" : state.qRem < 150 ? "warn" : "ok";
    const q = document.getElementById("qtxt");
    if (q) q.innerHTML = ` | Quota: <span class="${cls}">${state.qRem}</span> left`;
    const bar = document.getElementById("qbar");
    if (bar) {
      bar.style.width = pct + "%";
      bar.className = "qbar-fill" + (state.qRem < 50 ? " bad" : state.qRem < 150 ? " warn" : "");
    }
    const eu = document.getElementById("q-used");
    if (eu) eu.textContent = state.qUsed + " used";
    const er = document.getElementById("q-rem");
    if (er) er.textContent = state.qRem + " remaining";
  }

  // src/mobile/main.js
  var SPORT_BY_KEY = Object.fromEntries(SPORT_CFG.map((c) => [c.key, c]));
  function showBoardMsg(type, msg = "") {
    const b = document.getElementById("board");
    if (!b) return;
    let html = "";
    if (type === "loading") html = `<div class="p-8 text-center text-bet-text-sm">Loading odds\u2026</div>`;
    else if (type === "err") html = `<div class="p-8 text-center"><div class="text-3xl mb-2">\u{1F4E1}</div><div class="text-bet-text font-medium">Could not load odds</div><div class="text-[11px] text-bet-text-xs mt-1">${escapeHtml(msg || "Check your API key in \u2630 Settings.")}</div></div>`;
    else if (type === "key") html = `<div class="p-8 text-center"><div class="text-3xl mb-2">\u{1F511}</div><div class="text-bet-text font-medium">API Key Required</div><div class="text-[11px] text-bet-text-xs mt-1">Tap \u2630 \u2192 Settings to add your free key.</div></div>`;
    else if (type === "none") html = `<div class="p-8 text-center text-bet-text-sm">No games available for this league.</div>`;
    b.innerHTML = html;
  }
  function renderBoard() {
    const b = document.getElementById("board");
    if (!b) return;
    if (state.wagerMode === "teaser" && !state.teaserVariant) {
      renderTeaserMenu();
      updateBadges();
      return;
    }
    const key = getActiveSportKey();
    const games = state.gamesCache[key]?.games || state.gamesCache[key] || [];
    if (!Array.isArray(games) || !games.length) {
      showBoardMsg("none");
      return;
    }
    b.innerHTML = "";
    games.forEach((g) => b.appendChild(buildGameCard(g)));
  }
  function buildGameCard(game) {
    const card = document.createElement("div");
    card.className = "mob-gcard";
    card.dataset.gameId = game.id;
    const propsOnly = /Player Props$/i.test(state.activeLeague || "");
    if (!propsOnly) {
      const hdr = document.createElement("div");
      hdr.className = "mob-gcard-hdr";
      hdr.innerHTML = `<span>${escapeHtml(game.date || "")}</span><span class="ml-auto">${escapeHtml(game.time || "")}</span>`;
      card.appendChild(hdr);
      const colHdr = document.createElement("div");
      colHdr.className = "mob-gcard-row text-[9px] font-display uppercase tracking-[0.5px] text-bet-text-xs bg-bet-alt";
      colHdr.innerHTML = `<div></div><div class="text-center">Spread</div><div class="text-center">ML</div><div class="text-center">Total</div>`;
      card.appendChild(colHdr);
      const teaserMode = state.wagerMode === "teaser" && state.teaserVariant;
      (game.teams || []).forEach((team) => {
        if (!team) return;
        const row = document.createElement("div");
        row.className = "mob-gcard-row";
        const tn = document.createElement("div");
        tn.className = "mob-teamname";
        tn.innerHTML = `${teamLogoImg(game.sport, team, "mob-tlogo")}<span class="mob-tname">${escapeHtml(team.name)}</span>`;
        row.appendChild(tn);
        if (teaserMode) {
          row.appendChild(buildTeaserCellMob(game, team, "spread"));
          row.appendChild(buildTeaserDashCell());
          row.appendChild(buildTeaserCellMob(game, team, "total"));
        } else {
          row.appendChild(buildOddsBtn(game, team, "spread"));
          row.appendChild(buildOddsBtn(game, team, "ml"));
          row.appendChild(buildOddsBtn(game, team, "total"));
        }
        card.appendChild(row);
      });
    }
    const key = getActiveSportKey();
    const games = state.gamesCache[key]?.games || state.gamesCache[key] || [];
    const gameIdx = Math.max(0, games.findIndex((g) => g.id === game.id));
    const propSec = buildPropSection(game, gameIdx);
    if (propSec) card.appendChild(propSec);
    return card;
  }
  function buildOddsBtn(game, team, mkey) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mob-obtn";
    let line = "", vig = "", alts = [];
    if (mkey === "spread") {
      line = team.spread;
      vig = team.spVig;
      alts = team.altSpreads || [];
    } else if (mkey === "ml") {
      line = team.ml;
      vig = "";
      alts = [];
    } else if (mkey === "total") {
      line = team.total;
      vig = team.totVig;
      alts = team.altTotals || [];
    }
    if (line == null || line === "") {
      btn.disabled = true;
      btn.innerHTML = `<span class="mob-oline text-bet-text-xs">\u2014</span>`;
      return btn;
    }
    const key = `${game.id}_${team.name}_${mkey}`;
    const isSel = !!state.selCells[key];
    if (isSel) btn.classList.add("sel");
    btn.innerHTML = `<span class="mob-oline">${escapeHtml(String(line))}</span>${vig ? `<span class="mob-ovig">${escapeHtml(String(vig))}</span>` : ""}`;
    btn.onclick = () => onOddsClick(game, team, mkey, line, vig, key);
    if (alts.length > 1 && state.altLinesEnabled) {
      const chev = document.createElement("span");
      chev.className = "mob-alt-chev";
      chev.textContent = "\u25BC";
      chev.onclick = (e) => {
        e.stopPropagation();
        openAltSheet({ game, team, mkey, mainLine: line, mainVig: vig, alts });
      };
      btn.appendChild(chev);
    }
    return btn;
  }
  function onOddsClick(game, team, mkey, line, vig, key) {
    const matchup = `${game.away} @ ${game.home}`;
    if (state.wagerMode === "straight") {
      const idx = state.slip.findIndex((s) => s.key === key);
      if (idx > -1) {
        delete state.selCells[key];
        state.slip.splice(idx, 1);
      } else {
        state.selCells[key] = true;
        state.slip.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup, type: mkey, line, vig: vig || line, win: 50 });
      }
      updateBadges();
    } else if (state.wagerMode === "parlay") {
      const idx = state.parlayLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        delete state.selCells[key];
        state.parlayLegs.splice(idx, 1);
      } else {
        state.selCells[key] = true;
        state.parlayLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup, type: mkey, line, vig: vig || line });
      }
      updateBadges();
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
        state.ifBetLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup, type: mkey, line, vig: vig || line, win: 50, fireRule: "win" });
      }
      updateBadges();
    } else if (state.wagerMode === "reverse") {
      const idx = state.reverseLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        delete state.selCells[key];
        state.reverseLegs.splice(idx, 1);
      } else {
        if (state.reverseLegs.length >= 2) {
          showToast("Reverse Action: exactly 2 teams");
          return;
        }
        state.selCells[key] = true;
        state.reverseLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup, type: mkey, line, vig: vig || line });
      }
      updateBadges();
    }
    renderBoard();
  }
  var PROP_DESC = {
    pts: "total points",
    reb: "total rebounds",
    ast: "total assists",
    "3pm": "total 3-pointers made",
    blk: "total blocks",
    stl: "total steals",
    pr: "total Pts + Reb",
    pa: "total Pts + Ast",
    ar: "total Ast + Reb",
    pra: "total Pts + Reb + Ast"
  };
  function propBetId(gameIndex, propIndex, side) {
    return 509e3 + gameIndex * 100 + (propIndex + 1) * 10 + (side === "O" ? 1 : 2);
  }
  function buildPropSection(game, gameIndex) {
    if (!game.props || !game.props.length) return null;
    if (state.wagerMode === "teaser") return null;
    const sec = document.createElement("div");
    sec.className = "mob-prop-section";
    const banner = document.createElement("div");
    banner.className = "mob-prop-banner";
    banner.textContent = `${game.away} @ ${game.home} \u2014 Player Props`;
    sec.appendChild(banner);
    game.props.forEach((prop, propIndex) => {
      sec.appendChild(buildPropCard(game, prop, propIndex, gameIndex));
    });
    return sec;
  }
  function buildPropCard(game, prop, propIndex, gameIndex) {
    const card = document.createElement("div");
    card.className = "mob-prop-card";
    const hdr = document.createElement("div");
    hdr.className = "mob-prop-card-hdr";
    const ptTag = (game.time || "").replace(/\s*PDT/i, " PT").replace(/\s*PST/i, " PT").replace(/ AM /, "a ").replace(/ PM /, "p ");
    const mktDesc = PROP_DESC[prop.mkt] || prop.mkt;
    hdr.innerHTML = `<span class="mob-prop-time">${escapeHtml(ptTag)}</span><span class="mob-prop-desc">${escapeHtml(prop.player)} ${escapeHtml(mktDesc)}</span>`;
    card.appendChild(hdr);
    card.appendChild(buildPropRow(game, prop, propIndex, gameIndex, "O", prop.player));
    card.appendChild(buildPropRow(game, prop, propIndex, gameIndex, "U", propMktLabel({ propMkt: prop.mkt })));
    return card;
  }
  function buildPropRow(game, prop, propIndex, gameIndex, side, label) {
    const row = document.createElement("div");
    row.className = "mob-prop-row";
    const betId = propBetId(gameIndex, propIndex, side);
    const info = document.createElement("div");
    info.className = "mob-prop-info";
    info.innerHTML = `<span class="mob-prop-id">${betId}</span><span class="mob-prop-name">${escapeHtml(label)}</span>`;
    row.appendChild(info);
    const cell = document.createElement("div");
    cell.className = "mob-prop-cell";
    const key = `prop_${game.id}_${prop.player}_${prop.mkt}_${side}`;
    const isSel = !!state.selCells[key];
    let lineStr = (side === "O" ? "o" : "u") + prop.line;
    let vig = side === "O" ? prop.overVig : prop.underVig;
    const legSrc = state.wagerMode === "straight" ? state.slip : state.wagerMode === "parlay" ? state.parlayLegs : state.wagerMode === "ifbet" ? state.ifBetLegs : null;
    if (legSrc) {
      const leg = legSrc.find((l) => l.key === key);
      if (leg) {
        lineStr = leg.line;
        vig = leg.vig;
      }
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mob-prop-btn" + (isSel ? " sel" : "");
    btn.innerHTML = `<span class="mob-prop-line">${escapeHtml(String(lineStr))}</span><span class="mob-prop-vig">${escapeHtml(String(vig || ""))}</span>`;
    btn.onclick = () => onPropClick(game, prop, side, key);
    cell.appendChild(btn);
    if (prop.alts && prop.alts.length && state.altLinesEnabled) {
      const chev = document.createElement("button");
      chev.type = "button";
      chev.className = "mob-alt-chev";
      chev.textContent = "\u25BC";
      chev.onclick = (e) => {
        e.stopPropagation();
        openPropAltSheet({ game, prop, propIndex, gameIndex });
      };
      cell.appendChild(chev);
    }
    row.appendChild(cell);
    return row;
  }
  function onPropClick(game, prop, side, key) {
    const lineStr = (side === "O" ? "o" : "u") + prop.line;
    const vig = side === "O" ? prop.overVig : prop.underVig;
    const teamName = prop.teamName || (prop.team === "home" ? game.home : game.away);
    const matchup = `${game.away} @ ${game.home}`;
    const mkey = `prop_${prop.mkt}`;
    const sport = game.sport;
    if (state.wagerMode === "teaser") {
      showToast("Props are not eligible for teasers");
      return;
    }
    if (state.wagerMode === "straight") {
      const idx = state.slip.findIndex((s) => s.key === key);
      if (idx > -1) {
        delete state.selCells[key];
        state.slip.splice(idx, 1);
      } else {
        state.selCells[key] = true;
        state.slip.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig, win: 50 });
      }
    } else if (state.wagerMode === "parlay") {
      const idx = state.parlayLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        delete state.selCells[key];
        state.parlayLegs.splice(idx, 1);
      } else {
        state.selCells[key] = true;
        state.parlayLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig });
      }
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
    } else if (state.wagerMode === "reverse") {
      const idx = state.reverseLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        delete state.selCells[key];
        state.reverseLegs.splice(idx, 1);
      } else {
        if (state.reverseLegs.length >= 2) {
          showToast("Reverse Action: exactly 2 teams");
          return;
        }
        state.selCells[key] = true;
        state.reverseLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig });
      }
    }
    updateBadges();
    renderBoard();
  }
  function openPropAltSheet({ game, prop, propIndex, gameIndex }) {
    const hdr = document.getElementById("mob-sheet-hdr");
    const body = document.getElementById("mob-sheet-body");
    hdr.textContent = `${prop.player} \xB7 ${propMktLabel({ propMkt: prop.mkt })}`;
    const overKey = `prop_${game.id}_${prop.player}_${prop.mkt}_O`;
    const underKey = `prop_${game.id}_${prop.player}_${prop.mkt}_U`;
    const findLeg = (k) => {
      if (state.wagerMode === "straight") return state.slip.find((s) => s.key === k);
      if (state.wagerMode === "parlay") return state.parlayLegs.find((s) => s.key === k);
      if (state.wagerMode === "ifbet") return state.ifBetLegs.find((s) => s.key === k);
      if (state.wagerMode === "reverse") return state.reverseLegs.find((s) => s.key === k);
      return null;
    };
    const stripPrefix = (v) => parseFloat(String(v).replace(/^[ou]/i, ""));
    const overLeg = findLeg(overKey);
    const underLeg = findLeg(underKey);
    const pickedOverLine = overLeg ? stripPrefix(overLeg.line) : null;
    const pickedUnderLine = underLeg ? stripPrefix(underLeg.line) : null;
    const allLines = [
      { line: prop.line, overVig: prop.overVig, underVig: prop.underVig, isMain: true },
      ...prop.alts.map((a) => ({ line: a.line, overVig: a.overVig, underVig: a.underVig, isMain: false }))
    ].sort((a, b) => a.line - b.line);
    body.innerHTML = "";
    const cols = document.createElement("div");
    cols.className = "mob-sheet-cols";
    cols.innerHTML = "<span>Line</span><span>Over</span><span>Under</span>";
    body.appendChild(cols);
    if (!allLines.length) {
      const empty = document.createElement("div");
      empty.className = "p-4 text-center text-bet-text-xs italic";
      empty.textContent = "No alt lines available";
      body.appendChild(empty);
    } else {
      allLines.forEach((rec) => {
        const row = document.createElement("div");
        row.className = "mob-sheet-prow" + (rec.isMain ? " main" : "");
        const lineCell = document.createElement("span");
        lineCell.className = "mob-sheet-line text-center font-display font-semibold text-[14px]";
        lineCell.textContent = String(rec.line);
        row.appendChild(lineCell);
        const overBtn = document.createElement("button");
        overBtn.type = "button";
        overBtn.className = "mob-sheet-vig-btn" + (pickedOverLine === rec.line ? " sel" : "");
        overBtn.textContent = rec.overVig;
        overBtn.onclick = (e) => {
          e.stopPropagation();
          setPropAltLine(game, prop, propIndex, gameIndex, "O", rec.line, rec.overVig);
          closeAltSheet();
        };
        row.appendChild(overBtn);
        const underBtn = document.createElement("button");
        underBtn.type = "button";
        underBtn.className = "mob-sheet-vig-btn" + (pickedUnderLine === rec.line ? " sel" : "");
        underBtn.textContent = rec.underVig;
        underBtn.onclick = (e) => {
          e.stopPropagation();
          setPropAltLine(game, prop, propIndex, gameIndex, "U", rec.line, rec.underVig);
          closeAltSheet();
        };
        row.appendChild(underBtn);
        body.appendChild(row);
      });
    }
    document.getElementById("mob-sheet-backdrop").classList.add("open");
    document.getElementById("mob-sheet").classList.add("open");
  }
  function setPropAltLine(game, prop, propIndex, gameIndex, side, newLine, newVig) {
    const key = `prop_${game.id}_${prop.player}_${prop.mkt}_${side}`;
    const teamName = prop.teamName || (prop.team === "home" ? game.home : game.away);
    const matchup = `${game.away} @ ${game.home}`;
    const mkey = `prop_${prop.mkt}`;
    const lineStr = (side === "O" ? "o" : "u") + newLine;
    const sport = game.sport;
    if (state.wagerMode === "teaser") {
      showToast("Props are not eligible for teasers");
      return;
    }
    if (state.wagerMode === "straight") {
      const idx = state.slip.findIndex((s) => s.key === key);
      if (idx > -1) {
        state.slip[idx].line = lineStr;
        state.slip[idx].vig = newVig;
      } else {
        state.selCells[key] = true;
        state.slip.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig: newVig, win: 50 });
      }
    } else if (state.wagerMode === "parlay") {
      const idx = state.parlayLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        state.parlayLegs[idx].line = lineStr;
        state.parlayLegs[idx].vig = newVig;
      } else {
        state.selCells[key] = true;
        state.parlayLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig: newVig });
      }
    } else if (state.wagerMode === "ifbet") {
      const idx = state.ifBetLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        state.ifBetLegs[idx].line = lineStr;
        state.ifBetLegs[idx].vig = newVig;
      } else {
        if (state.ifBetLegs.length >= 8) {
          showToast("Max 8 legs in an If Bet");
          return;
        }
        state.selCells[key] = true;
        state.ifBetLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig: newVig, win: 50, fireRule: "win" });
      }
    } else if (state.wagerMode === "reverse") {
      const idx = state.reverseLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        state.reverseLegs[idx].line = lineStr;
        state.reverseLegs[idx].vig = newVig;
      } else {
        if (state.reverseLegs.length >= 2) {
          showToast("Reverse Action: exactly 2 teams");
          return;
        }
        state.selCells[key] = true;
        state.reverseLegs.push({ key, gameId: game.id, teamName, sport, matchup, type: mkey, propPlayer: prop.player, propSide: side, propMkt: prop.mkt, line: lineStr, vig: newVig });
      }
    }
    updateBadges();
    renderBoard();
  }
  function renderTeaserMenu() {
    const b = document.getElementById("board");
    if (!b) return;
    b.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "mob-teaser-menu";
    wrap.id = "mob-teaser-menu";
    const hdr = document.createElement("div");
    hdr.className = "mob-tm-hdr";
    hdr.textContent = "Choose Teaser Variant";
    wrap.appendChild(hdr);
    TEASER_VARIANTS.forEach((v) => {
      const row = document.createElement("div");
      row.className = "mob-tm-row" + (v.enabled ? "" : " dis");
      row.dataset.variant = v.key;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mob-tm-vbtn";
      btn.textContent = v.label;
      btn.disabled = !v.enabled;
      btn.dataset.variant = v.key;
      if (v.enabled) btn.onclick = () => selectMobileTeaserVariant(v.key);
      row.appendChild(btn);
      const legsTxt = v.minLegs === v.maxLegs ? `${v.minLegs} legs` : `${v.minLegs}\u2013${v.maxLegs} legs`;
      const meta = document.createElement("div");
      meta.className = "mob-tm-meta";
      meta.textContent = `NBA + NFL \xB7 ${legsTxt} \xB7 ${v.ftbShift}pt FB / ${v.bbShift}pt BB`;
      row.appendChild(meta);
      wrap.appendChild(row);
    });
    b.appendChild(wrap);
  }
  function selectMobileTeaserVariant(variantKey) {
    state.teaserVariant = variantKey;
    state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
    state.teaserLegs = [];
    updateBadges();
    renderBoard();
    showToast(`Teaser: ${getVariant(variantKey).label} active`);
  }
  function buildTeaserDashCell() {
    const d = document.createElement("div");
    d.className = "mob-tcell-dash";
    d.textContent = "\u2014";
    return d;
  }
  function buildTeaserCellMob(game, team, mkey) {
    const v = getVariant(state.teaserVariant);
    const mainLine = mkey === "spread" ? team.spread : team.total;
    if (mainLine == null || mainLine === "") return buildTeaserDashCell();
    const key = `${game.id}_${team.name}_${mkey}_T`;
    const existing = state.teaserLegs.find((l) => l.key === key);
    const origLine = existing ? existing.origLine : String(mainLine);
    const shifted = teaserShift(origLine, mkey, v, game.sport);
    if (!shifted) return buildTeaserDashCell();
    const isSel = !!state.selCells[key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mob-tbtn" + (isSel ? " sel" : "");
    btn.dataset.tkey = key;
    btn.innerHTML = `<span class="mob-torig">${escapeHtml(String(origLine))}</span><span class="mob-tshift">${escapeHtml(String(shifted))}</span>`;
    btn.title = `${origLine} \u2192 ${shifted} (${v.label})`;
    btn.onclick = () => onTeaserCellClick(game, team, mkey, origLine, shifted, key);
    return btn;
  }
  function onTeaserCellClick(game, team, mkey, origLine, shiftedLine, key) {
    const v = getVariant(state.teaserVariant);
    if (!v) return;
    const idx = state.teaserLegs.findIndex((l) => l.key === key);
    if (idx > -1) {
      state.teaserLegs.splice(idx, 1);
      delete state.selCells[key];
    } else {
      if (state.teaserLegs.length >= v.maxLegs) {
        showToast(`Max ${v.maxLegs} legs for ${v.label}`);
        return;
      }
      state.teaserLegs.push({
        key,
        gameId: game.id,
        teamName: team.name,
        sport: game.sport,
        matchup: `${game.away} @ ${game.home}`,
        type: mkey,
        origLine,
        shiftedLine
      });
      state.selCells[key] = true;
    }
    updateBadges();
    renderBoard();
  }
  function openAltSheet({ game, team, mkey, mainLine, mainVig, alts }) {
    const hdr = document.getElementById("mob-sheet-hdr");
    const body = document.getElementById("mob-sheet-body");
    const labels = { spread: "Alt Spreads", total: "Alt Totals", tt: "Alt Team Totals", ml: "Moneyline" };
    hdr.textContent = `${labels[mkey] || "Alt Lines"} \xB7 ${team.name}`;
    const key = `${game.id}_${team.name}_${mkey}`;
    let currentLine = mainLine;
    const legSrc = state.wagerMode === "straight" ? state.slip : state.wagerMode === "parlay" ? state.parlayLegs : state.wagerMode === "ifbet" ? state.ifBetLegs : state.wagerMode === "reverse" ? state.reverseLegs : null;
    if (legSrc) {
      const leg = legSrc.find((l) => l.key === key);
      if (leg) currentLine = leg.line;
    }
    body.innerHTML = "";
    if (!alts.length) {
      body.innerHTML = '<div class="p-4 text-center text-bet-text-xs italic">No alt lines available</div>';
    } else {
      alts.forEach((alt) => {
        const row = document.createElement("div");
        row.className = "mob-sheet-row";
        if (alt.line === mainLine) row.classList.add("main");
        if (alt.line === currentLine) row.classList.add("sel");
        row.innerHTML = `<span class="mob-sheet-line">${escapeHtml(String(alt.line))}</span><span class="mob-sheet-vig">${escapeHtml(String(alt.vig))}</span>`;
        row.onclick = () => {
          setAltLine(game, team, mkey, alt.line, alt.vig);
          closeAltSheet();
        };
        body.appendChild(row);
      });
    }
    document.getElementById("mob-sheet-backdrop").classList.add("open");
    document.getElementById("mob-sheet").classList.add("open");
  }
  function closeAltSheet() {
    document.getElementById("mob-sheet-backdrop").classList.remove("open");
    document.getElementById("mob-sheet").classList.remove("open");
  }
  function setAltLine(game, team, mkey, line, vig) {
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
    } else if (state.wagerMode === "parlay") {
      const idx = state.parlayLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        state.parlayLegs[idx].line = line;
        state.parlayLegs[idx].vig = vig || line;
      } else {
        state.parlayLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup, type: mkey, line, vig: vig || line });
        state.selCells[key] = true;
      }
    } else if (state.wagerMode === "ifbet") {
      const idx = state.ifBetLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        state.ifBetLegs[idx].line = line;
        state.ifBetLegs[idx].vig = vig || line;
      } else {
        state.ifBetLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup, type: mkey, line, vig: vig || line, win: 50, fireRule: "win" });
        state.selCells[key] = true;
      }
    } else if (state.wagerMode === "reverse") {
      const idx = state.reverseLegs.findIndex((s) => s.key === key);
      if (idx > -1) {
        state.reverseLegs[idx].line = line;
        state.reverseLegs[idx].vig = vig || line;
      } else {
        if (state.reverseLegs.length >= 2) {
          showToast("Reverse Action: exactly 2 teams");
          return;
        }
        state.reverseLegs.push({ key, gameId: game.id, teamName: team.name, sport: game.sport, matchup, type: mkey, line, vig: vig || line });
        state.selCells[key] = true;
      }
    }
    updateBadges();
    renderBoard();
  }
  function isTeaserEligible(sportKey) {
    return teaserSportType(sportKey) !== null;
  }
  function updateTeaserGating() {
    const btn = document.getElementById("nav-teaser");
    if (!btn) return;
    btn.classList.toggle("disabled", !isTeaserEligible(state.activeLeague));
  }
  function setMode(mode) {
    if (!["straight", "parlay", "teaser", "ifbet", "reverse"].includes(mode)) return;
    if (mode === "teaser" && !isTeaserEligible(state.activeLeague)) {
      showToast(`Teasers are not available for ${state.activeLeague}`);
      return;
    }
    if (state.wagerMode === "teaser" && mode !== "teaser") {
      state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
      state.teaserLegs = [];
      state.teaserVariant = null;
    }
    if (state.wagerMode === "ifbet" && mode !== "ifbet") {
      state.ifBetLegs.forEach((l) => delete state.selCells[l.key]);
      state.ifBetLegs = [];
    }
    if (state.wagerMode === "reverse" && mode !== "reverse") {
      state.reverseLegs.forEach((l) => delete state.selCells[l.key]);
      state.reverseLegs = [];
    }
    state.wagerMode = mode;
    document.querySelectorAll(".mob-nbtn").forEach((b) => b.classList.remove("active"));
    document.getElementById("nav-" + mode)?.classList.add("active");
    updateBadges();
    renderBoard();
  }
  function setSport(sportKey) {
    state.activeLeague = sportKey;
    document.querySelectorAll(".mob-stab").forEach((t) => t.classList.toggle("active", t.dataset.sport === sportKey));
    const cfg = SPORT_BY_KEY[sportKey];
    document.getElementById("board-title").textContent = `${sportKey} \u2014 ${cfg?.label || ""}`;
    if (state.wagerMode === "teaser" && !isTeaserEligible(sportKey)) {
      state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
      state.teaserLegs = [];
      state.teaserVariant = null;
      state.wagerMode = "straight";
      document.querySelectorAll(".mob-nbtn").forEach((b) => b.classList.remove("active"));
      document.getElementById("nav-straight")?.classList.add("active");
      updateBadges();
    }
    updateTeaserGating();
    if (!state.gamesCache[sportKey]) {
      showBoardMsg("loading");
      fetchAndRender(sportKey, true);
    } else {
      renderBoard();
    }
  }
  function updateBadges() {
    const map = { "par-badge": state.parlayLegs.length, "tea-badge": state.teaserLegs.length, "if-badge": state.ifBetLegs.length, "rv-badge": state.reverseLegs.length, "bets-cnt": state.placedBets.filter((b) => b.status === "pending").length };
    Object.entries(map).forEach(([id, n]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = String(n);
      el.classList.toggle("hidden", n === 0);
    });
    updateContinueBar();
  }
  function updateContinueBar() {
    const bar = document.getElementById("mob-continue-bar");
    const cnt = document.getElementById("mob-continue-cnt");
    if (!bar || !cnt) return;
    let n = 0, ok = false;
    if (state.wagerMode === "straight") {
      n = state.slip.length;
      ok = n >= 1;
    } else if (state.wagerMode === "parlay") {
      n = state.parlayLegs.length;
      ok = n >= 2;
    } else if (state.wagerMode === "ifbet") {
      n = state.ifBetLegs.length;
      ok = n >= 2;
    } else if (state.wagerMode === "reverse") {
      n = state.reverseLegs.length;
      ok = n >= 2;
    } else if (state.wagerMode === "teaser") {
      n = state.teaserLegs.length;
      const v = state.teaserVariant ? getVariant(state.teaserVariant) : null;
      ok = !!(v && n >= v.minLegs);
    }
    cnt.textContent = String(n);
    bar.classList.toggle("hidden", !ok);
  }
  function openDrawer() {
    const mockCbx = document.getElementById("mock-cbx");
    if (mockCbx) mockCbx.checked = state.mockMode;
    const altCbx = document.getElementById("alt-cbx");
    if (altCbx) altCbx.checked = !!state.altLinesEnabled;
    const altStatus = document.getElementById("alt-status");
    if (altStatus) altStatus.textContent = state.altLinesEnabled ? "Showing alt-line chevrons" : "Show alt-line chevrons";
    const apiInp = document.getElementById("api-key-inp");
    if (apiInp) apiInp.value = state.apiKey || "";
    const bookSel = document.getElementById("book-sel");
    if (bookSel) bookSel.value = state.prefBook;
    document.getElementById("doverlay").classList.add("open");
    document.getElementById("drawer").classList.add("open");
  }
  function closeDrawer() {
    document.getElementById("doverlay").classList.remove("open");
    document.getElementById("drawer").classList.remove("open");
  }
  function saveApiKey() {
    const v = document.getElementById("api-key-inp").value.trim();
    if (!v) return;
    state.apiKey = v;
    localStorage.setItem("bs_key", v);
    closeDrawer();
    showToast("API key saved");
    fetchAndRender(state.activeLeague, true);
  }
  function saveBook() {
    state.prefBook = document.getElementById("book-sel").value;
    localStorage.setItem("bs_book", state.prefBook);
    state.gamesCache = {};
    fetchAndRender(state.activeLeague, true);
  }
  function toggleMockMode() {
    state.mockMode = document.getElementById("mock-cbx").checked;
    localStorage.setItem("bs_mock", state.mockMode ? "1" : "0");
    state.gamesCache = {};
    fetchAndRender(state.activeLeague, true);
  }
  function toggleAltLines() {
    const cbx = document.getElementById("alt-cbx");
    if (!cbx) return;
    state.altLinesEnabled = cbx.checked;
    localStorage.setItem("bs_alt", state.altLinesEnabled ? "1" : "0");
    const as = document.getElementById("alt-status");
    if (as) as.textContent = state.altLinesEnabled ? "Showing alt-line chevrons" : "Show alt-line chevrons";
    closeAltSheet();
    renderBoard();
    showToast(state.altLinesEnabled ? "Alt lines ON" : "Alt lines OFF");
  }
  function resetBalance() {
    if (!confirm("Reset balance to $1,000?")) return;
    state.balance = 1e3;
    localStorage.setItem("bs_bal", String(state.balance));
    updateBalDisp();
    showToast("Balance reset");
  }
  function updateBalDisp() {
    const f = fmtUSD(state.balance);
    const bd = document.getElementById("bal-disp");
    if (bd) bd.textContent = f;
    const sb = document.getElementById("set-bal");
    if (sb) sb.textContent = f;
  }
  function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
  }
  function openBets() {
    renderMobileBets();
    document.getElementById("mob-bets-overlay").classList.add("open");
  }
  function closeBets() {
    document.getElementById("mob-bets-overlay").classList.remove("open");
  }
  function renderMobileBets() {
    const body = document.getElementById("mob-bets-body");
    if (!body) return;
    body.innerHTML = "";
    if (!state.placedBets.length) {
      body.innerHTML = emptyState({
        icon: "\u{1F39F}",
        heading: "No bets placed yet",
        sub: "Place your first wager from the board.",
        hint: "Settled bets stay in your history."
      });
      return;
    }
    state.placedBets.map((b, i) => ({ b, i })).reverse().forEach(({ b, i }) => {
      body.appendChild(buildBetCard(b, i));
    });
  }
  function buildBetCard(b, idx) {
    const card = document.createElement("div");
    card.className = "mob-betcard";
    const stClass = b.status || "pending";
    let topName, metaTxt, legsHtml = "", riskLbl = "Risk", riskVal, winLbl = "To Win", winVal;
    if (b.type === "reverse") {
      topName = `\u21C4 2-Team Reverse Action`;
      metaTxt = `A\u2192B + B\u2192A \xB7 Stake ${fmtUSD(b.stake)}/play \xB7 ${b.placed || ""}`;
      legsHtml = (b.legs || []).map((l, j) => {
        const lblK = j === 0 ? "A" : "B";
        const label = isPropLeg(l) ? `${escapeHtml(l.propPlayer)} \u2014 ${escapeHtml(propMktLabel(l))} ${escapeHtml(propSide(l))} ${escapeHtml(propLineNum(l))}` : `${escapeHtml(l.teamName)} (${escapeHtml({ spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[l.type] || l.type)}: ${escapeHtml(String(l.line))})`;
        let outTag = "";
        if (b.legOutcomes && b.legOutcomes[lblK.toLowerCase()]) {
          const o = b.legOutcomes[lblK.toLowerCase()];
          outTag = ` [${o.toUpperCase()}]`;
        }
        return `<div class="mob-betcard-legrow"><b style="color:var(--color-bet-accent, #e87722)">${lblK}.</b> ${label}${outTag}</div>`;
      }).join("");
      riskLbl = "Total Risk";
      riskVal = b.risk;
      winLbl = b.status === "pending" ? "Max Win" : (b.netProfit || 0) >= 0 ? "Net Win" : "Net Loss";
      winVal = b.status === "pending" ? b.win : Math.abs(b.netProfit || 0);
    } else if (b.type === "ifbet") {
      const totWin = b.win || (b.legs || []).reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
      topName = `\u26D3 ${b.legCount}-Leg If Bet`;
      metaTxt = `Sequential \xB7 ${b.placed || ""}`;
      legsHtml = (b.legs || []).map((l, j) => {
        const rule = j === 0 ? "always" : l.fireRule === "winOrPush" ? "if win/push" : "if win";
        const label = isPropLeg(l) ? `${escapeHtml(l.propPlayer)} \u2014 ${escapeHtml(propMktLabel(l))} ${escapeHtml(propSide(l))} ${escapeHtml(propLineNum(l))} \xB7 win ${fmtUSD(parseFloat(l.win) || 0)} \xB7 ${rule}` : `${escapeHtml(l.teamName)} (${escapeHtml({ spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[l.type] || l.type)}: ${escapeHtml(String(l.line))}) \xB7 win ${fmtUSD(parseFloat(l.win) || 0)} \xB7 ${rule}`;
        return `<div class="mob-betcard-legrow"><b style="color:var(--color-bet-accent, #e87722)">${j + 1}.</b> ${label}</div>`;
      }).join("");
      riskLbl = "Risk (Leg 1)";
      riskVal = b.risk;
      winLbl = "Max Win";
      winVal = totWin;
    } else if (b.type === "teaser") {
      const win = b.win || calcWin(b.risk || 0, b.amOdds || "-110");
      topName = `\u{1F3AF} ${b.legCount}-Pick ${b.variant || "Teaser"}`;
      metaTxt = `Odds: ${b.amOdds || ""} \xB7 ${b.placed || ""}`;
      legsHtml = (b.legs || []).map((l, j) => {
        const tl = { spread: "Spread", total: "Total" }[l.type] || l.type;
        return `<div class="mob-betcard-legrow"><b style="color:var(--color-bet-brand, #2a6b75)">${j + 1}.</b> ${escapeHtml(l.teamName)} (${tl}: <s>${escapeHtml(String(l.origLine || ""))}</s> \u2192 ${escapeHtml(String(l.line))})</div>`;
      }).join("");
      riskVal = b.risk;
      winVal = win;
    } else if (b.type === "parlay" || b.legCount && b.legs) {
      const win = b.win || (b.decOdds - 1) * b.risk;
      topName = `\u{1F3B0} ${b.legCount}-Leg Parlay`;
      metaTxt = `Odds: ${b.amOdds || ""} (${parseFloat(b.decOdds || 1).toFixed(3)}x) \xB7 ${b.placed || ""}`;
      legsHtml = (b.legs || []).map((l, j) => {
        const label = isPropLeg(l) ? `${escapeHtml(l.propPlayer)} (${escapeHtml(propMktLabel(l))}: ${escapeHtml(propSide(l))} ${escapeHtml(propLineNum(l))})` : `${escapeHtml(l.teamName)} (${escapeHtml({ spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[l.type] || l.type)}: ${escapeHtml(String(l.line))})`;
        return `<div class="mob-betcard-legrow"><b style="color:var(--color-bet-brand, #2a6b75)">${j + 1}.</b> ${label}</div>`;
      }).join("");
      riskVal = b.risk;
      winVal = win;
    } else {
      const win = b.win || calcWin(b.risk || 0, b.vig || b.line);
      const risk = b.risk || calcRisk(b.win || 0, b.vig || b.line);
      if (isPropLeg(b)) {
        topName = `${b.propPlayer} \u2014 ${propMktLabel(b)}`;
        metaTxt = `${b.sport || ""} \xB7 ${propSide(b)} ${propLineNum(b)}${b.vig ? " (" + b.vig + ")" : ""} \xB7 ${b.placed || ""}`;
      } else {
        const tl = { spread: "Spread", ml: "Moneyline", total: "Total", tt: "Team Total" }[b.type] || b.type;
        topName = b.teamName || "";
        metaTxt = `${b.sport || ""} \xB7 ${tl}: ${b.line}${b.vig && b.vig !== b.line ? " (" + b.vig + ")" : ""} \xB7 ${b.placed || ""}`;
      }
      riskVal = risk;
      winVal = win;
    }
    card.innerHTML = `
    <div class="mob-betcard-top">
      <span class="mob-betcard-name">${escapeHtml(topName)}</span>
      ${betStatusBadge(b.status, "mob-betcard-st")}
    </div>
    <div class="mob-betcard-meta">${escapeHtml(metaTxt)}</div>
    ${legsHtml ? `<div class="mob-betcard-legs">${legsHtml}</div>` : ""}
    <div class="mob-betcard-amts">
      <div class="mob-betcard-amt"><label>${riskLbl}</label><div class="v r">${fmtUSD(riskVal || 0)}</div></div>
      <div class="mob-betcard-amt"><label>${winLbl}</label><div class="v g">${fmtUSD(winVal || 0)}</div></div>
    </div>
  `;
    if (b.status === "pending") {
      const sr = document.createElement("div");
      sr.className = "mob-betcard-settle";
      if (b.type === "reverse") {
        sr.innerHTML = `<button class="mob-settle-btn won" data-idx="${idx}" style="grid-column:1/-1">Settle Legs (A/B) \u2192</button>`;
        sr.querySelector(".mob-settle-btn").addEventListener("click", (e) => openRVSettleMobile(parseInt(e.currentTarget.dataset.idx, 10)));
        card.appendChild(sr);
        return card;
      }
      sr.innerHTML = `
      <button class="mob-settle-btn won"  data-idx="${idx}" data-outcome="won">\u2713 Won</button>
      <button class="mob-settle-btn push" data-idx="${idx}" data-outcome="push">\u21BA Push</button>
      <button class="mob-settle-btn lost" data-idx="${idx}" data-outcome="lost">\u2715 Lost</button>
    `;
      sr.querySelectorAll(".mob-settle-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => settleBetMobile(parseInt(e.currentTarget.dataset.idx, 10), e.currentTarget.dataset.outcome));
      });
      card.appendChild(sr);
    }
    return card;
  }
  function settleBetMobile(idx, outcome) {
    const b = state.placedBets[idx];
    if (!b || b.status !== "pending") return;
    if (outcome === "won") {
      state.balance += (b.risk || 0) + (b.win || 0);
    } else if (outcome === "push") {
      state.balance += b.risk || 0;
    }
    b.status = outcome;
    b.settled = (/* @__PURE__ */ new Date()).toLocaleString();
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", String(state.balance));
    updateBalDisp();
    updateBadges();
    renderMobileBets();
    showToast(`Bet marked as ${outcome.toUpperCase()}`);
  }
  var _rvSetIdxMob = -1;
  var _rvSetOutMob = { a: "won", b: "won" };
  function chainProfitMob(trigOut, nextOut, decTrig, decNext, stake) {
    if (trigOut === "lost") return -stake;
    const tp = trigOut === "won" ? (decTrig - 1) * stake : 0;
    if (nextOut === "won") return tp + (decNext - 1) * stake;
    if (nextOut === "lost") return tp - stake;
    return tp;
  }
  function computeRVNetMob(bet, outA, outB) {
    const [a, b] = bet.legs;
    const decA = toDec(a.vig || a.line);
    const decB = toDec(b.vig || b.line);
    return chainProfitMob(outA, outB, decA, decB, bet.stake) + chainProfitMob(outB, outA, decB, decA, bet.stake);
  }
  function openRVSettleMobile(idx) {
    const b = state.placedBets[idx];
    if (!b || b.type !== "reverse" || b.status !== "pending") return;
    _rvSetIdxMob = idx;
    _rvSetOutMob = { a: "won", b: "won" };
    document.getElementById("mob-review-title").textContent = "Settle Reverse";
    const body = document.getElementById("mob-review-body");
    body.innerHTML = "";
    const card = document.createElement("div");
    card.className = "mob-rv-card";
    b.legs.forEach((leg, i) => {
      const lblK = i === 0 ? "a" : "b";
      const lblD = lblK.toUpperCase();
      const teamLabel = isPropLeg(leg) ? `${leg.propPlayer} ${propSide(leg)} ${propLineNum(leg)}` : `${leg.teamName} (${leg.line})`;
      const row = document.createElement("div");
      row.className = "mob-rv-leg";
      row.innerHTML = `
      <div class="mob-rv-leg-num">${lblD}</div>
      <div class="mob-rv-leg-info"><div class="mob-rv-leg-team">${escapeHtml(teamLabel)}</div></div>`;
      const settleRow = document.createElement("div");
      settleRow.className = "mob-betcard-settle";
      settleRow.style.gridColumn = "1 / -1";
      settleRow.dataset.lbl = lblK;
      settleRow.innerHTML = `
      <button class="mob-settle-btn won active" data-outcome="won">\u2713 Won</button>
      <button class="mob-settle-btn push" data-outcome="push">\u21BA Push</button>
      <button class="mob-settle-btn lost" data-outcome="lost">\u2715 Lost</button>`;
      settleRow.querySelectorAll(".mob-settle-btn").forEach((btn2) => {
        btn2.addEventListener("click", (e) => {
          const lk = e.currentTarget.parentElement.dataset.lbl;
          _rvSetOutMob[lk] = e.currentTarget.dataset.outcome;
          e.currentTarget.parentElement.querySelectorAll(".mob-settle-btn").forEach((x) => x.classList.remove("active"));
          e.currentTarget.classList.add("active");
          updateRVPreviewMob();
        });
      });
      card.appendChild(row);
      card.appendChild(settleRow);
    });
    const preview = document.createElement("div");
    preview.className = "mob-rv-val";
    preview.id = "mob-rv-set-preview";
    card.appendChild(preview);
    body.appendChild(card);
    const btn = document.createElement("button");
    btn.className = "mob-rv-confirm";
    btn.textContent = "Settle \u2192";
    btn.onclick = confirmRVSettleMob;
    body.appendChild(btn);
    updateRVPreviewMob();
    document.getElementById("mob-review-overlay").classList.add("open");
  }
  function updateRVPreviewMob() {
    const b = state.placedBets[_rvSetIdxMob];
    if (!b) return;
    const net = computeRVNetMob(b, _rvSetOutMob.a, _rvSetOutMob.b);
    const sign = net >= 0 ? "+" : "\u2212";
    document.getElementById("mob-rv-set-preview").innerHTML = `Net P/L: <strong>${sign}${fmtUSD(Math.abs(net))}</strong> \xB7 Returned ${fmtUSD(b.risk + net)}`;
  }
  function confirmRVSettleMob() {
    const b = state.placedBets[_rvSetIdxMob];
    if (!b || b.status !== "pending") {
      closeReview();
      return;
    }
    const net = computeRVNetMob(b, _rvSetOutMob.a, _rvSetOutMob.b);
    state.balance += b.risk + net;
    b.status = net > 0 ? "won" : net < 0 ? "lost" : "push";
    b.legOutcomes = { ..._rvSetOutMob };
    b.netProfit = net;
    b.settled = (/* @__PURE__ */ new Date()).toLocaleString();
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", String(state.balance));
    updateBalDisp();
    updateBadges();
    renderMobileBets();
    closeReview();
    const sign = net >= 0 ? "+" : "\u2212";
    showToast(`Reverse settled: ${sign}${fmtUSD(Math.abs(net))}`);
  }
  function openReview() {
    const mode = state.wagerMode;
    if (mode === "straight") {
      if (!state.slip.length) {
        showToast("Add a wager first");
        return;
      }
      document.getElementById("mob-review-title").textContent = "Review \xB7 Straight";
      renderReviewStraight();
    } else if (mode === "parlay") {
      if (state.parlayLegs.length < 2) {
        showToast("Need at least 2 legs");
        return;
      }
      document.getElementById("mob-review-title").textContent = `${state.parlayLegs.length}-Leg Parlay`;
      renderReviewParlay();
    } else if (mode === "ifbet") {
      if (state.ifBetLegs.length < 2) {
        showToast("Need at least 2 legs");
        return;
      }
      document.getElementById("mob-review-title").textContent = `${state.ifBetLegs.length}-Leg If Bet`;
      renderReviewIfBet();
    } else if (mode === "reverse") {
      if (state.reverseLegs.length !== 2) {
        showToast("Reverse Action: exactly 2 teams");
        return;
      }
      document.getElementById("mob-review-title").textContent = "2-Team Reverse Action";
      renderReviewReverse();
    } else if (mode === "teaser") {
      const v = state.teaserVariant ? getVariant(state.teaserVariant) : null;
      if (!v || state.teaserLegs.length < v.minLegs) {
        showToast("Pick a teaser variant + legs");
        return;
      }
      document.getElementById("mob-review-title").textContent = `${state.teaserLegs.length}-Pick ${v.label}`;
      renderReviewTeaser();
    }
    document.getElementById("mob-review-overlay").classList.add("open");
  }
  function closeReview() {
    document.getElementById("mob-review-overlay").classList.remove("open");
  }
  function legRowHtml(leg, idxLabel, oddsTxt) {
    const titleTxt = isPropLeg(leg) ? leg.propPlayer : leg.teamName;
    let subTxt;
    if (isPropLeg(leg)) {
      subTxt = `${propMktLabel(leg)} \xB7 ${propSide(leg)} ${propLineNum(leg)}`;
    } else {
      const tl = { spread: "Spread", ml: "Moneyline", total: "Total", tt: "Team Total" }[leg.type] || leg.type;
      subTxt = `${tl} \xB7 ${leg.matchup || ""}`;
    }
    return `
    <div class="mob-rv-leg">
      <div class="mob-rv-leg-num">${idxLabel}</div>
      <div class="mob-rv-leg-info">
        <div class="mob-rv-leg-team">${escapeHtml(titleTxt)}</div>
        <div class="mob-rv-leg-sub">${escapeHtml(subTxt)}</div>
      </div>
      <div class="mob-rv-leg-odds">${escapeHtml(oddsTxt)}</div>
    </div>`;
  }
  function renderReviewStraight() {
    const body = document.getElementById("mob-review-body");
    body.innerHTML = "";
    if (!state.slip.length) {
      body.innerHTML = emptyState({
        icon: "\u{1F4CB}",
        heading: "Nothing to review",
        sub: "Add a wager from the board first."
      });
      return;
    }
    const card = document.createElement("div");
    card.className = "mob-rv-card";
    state.slip.forEach((s, i) => {
      const win = parseFloat(s.win) || 0;
      const risk = calcRisk(win, s.vig || s.line);
      const oddsTxt = isPropLeg(s) ? `${propSide(s)} ${propLineNum(s)}${s.vig ? " (" + s.vig + ")" : ""}` : `${s.line}${s.vig && s.vig !== s.line ? " (" + s.vig + ")" : ""}`;
      const titleTxt = isPropLeg(s) ? s.propPlayer : s.teamName;
      const subTxt = isPropLeg(s) ? `${propMktLabel(s)} \xB7 ${s.matchup || ""}` : `${{ spread: "Spread", ml: "Moneyline", total: "Total", tt: "Team Total" }[s.type] || s.type} \xB7 ${s.matchup || ""}`;
      const row = document.createElement("div");
      row.className = "mob-rv-leg";
      row.innerHTML = `
      <button class="mob-rv-leg-rm" data-key="${escapeHtml(s.key)}" title="Remove">\u2715</button>
      <div class="mob-rv-leg-info">
        <div class="mob-rv-leg-team">${escapeHtml(titleTxt)}</div>
        <div class="mob-rv-leg-sub">${escapeHtml(subTxt)}</div>
      </div>
      <div class="mob-rv-leg-odds">${escapeHtml(oddsTxt)}</div>
    `;
      card.appendChild(row);
      const winRow = document.createElement("div");
      winRow.className = "mob-rv-row";
      winRow.innerHTML = `
      <label>Win ($)</label>
      <input type="number" min="20" step="5" value="${win.toFixed(2)}" data-key="${escapeHtml(s.key)}" data-role="win">
    `;
      card.appendChild(winRow);
      const riskRow = document.createElement("div");
      riskRow.className = "mob-rv-row";
      riskRow.innerHTML = `<label>Risk</label><div class="v r">${fmtUSD(risk)}</div>`;
      card.appendChild(riskRow);
      if (win > 0 && win < 20) {
        const v = document.createElement("div");
        v.className = "mob-rv-val";
        v.textContent = "\u26A0 Min $20";
        card.appendChild(v);
      }
    });
    const valid = state.slip.filter((s) => (parseFloat(s.win) || 0) >= 20);
    const totWin = valid.reduce((a, s) => a + (parseFloat(s.win) || 0), 0);
    const totRisk = valid.reduce((a, s) => a + calcRisk(parseFloat(s.win) || 0, s.vig || s.line), 0);
    const summ = document.createElement("div");
    summ.className = "mob-rv-row";
    summ.style.borderTop = "1px solid var(--color-bet-border, #ccd0d4)";
    summ.style.paddingTop = "8px";
    summ.innerHTML = `<label>Total Win / Risk</label><div><span class="v g">${fmtUSD(totWin)}</span> / <span class="v r">${fmtUSD(totRisk)}</span></div>`;
    card.appendChild(summ);
    body.appendChild(card);
    const btn = document.createElement("button");
    btn.className = "mob-rv-confirm";
    btn.id = "mob-rv-confirm";
    btn.textContent = valid.length ? `Place ${valid.length} Wager${valid.length > 1 ? "s" : ""} \u2192` : "Enter win amount";
    btn.disabled = !valid.length || totRisk > state.balance;
    if (totRisk > state.balance) btn.textContent = "Insufficient balance";
    btn.onclick = confirmStraightMobile;
    body.appendChild(btn);
    card.querySelectorAll('input[data-role="win"]').forEach((inp) => {
      inp.addEventListener("input", (e) => {
        const key = e.currentTarget.dataset.key;
        const idx = state.slip.findIndex((s) => s.key === key);
        if (idx > -1) state.slip[idx].win = parseFloat(e.currentTarget.value) || 0;
        renderReviewStraight();
      });
    });
    card.querySelectorAll(".mob-rv-leg-rm").forEach((b) => {
      b.addEventListener("click", (e) => {
        const key = e.currentTarget.dataset.key;
        delete state.selCells[key];
        state.slip = state.slip.filter((s) => s.key !== key);
        if (!state.slip.length) {
          closeReview();
          renderBoard();
          updateBadges();
          return;
        }
        renderReviewStraight();
        renderBoard();
        updateBadges();
      });
    });
  }
  function confirmStraightMobile() {
    const valid = state.slip.filter((s) => (parseFloat(s.win) || 0) >= 20);
    if (!valid.length) {
      showToast("Minimum win amount is $20");
      return;
    }
    const totRisk = valid.reduce((a, s) => a + calcRisk(parseFloat(s.win) || 0, s.vig || s.line), 0);
    if (totRisk > state.balance) {
      showToast("Insufficient balance");
      return;
    }
    state.balance -= totRisk;
    const now = (/* @__PURE__ */ new Date()).toLocaleString();
    valid.forEach((s) => {
      const risk = calcRisk(parseFloat(s.win) || 0, s.vig || s.line);
      state.placedBets.push({ ...s, type: "straight", risk, placed: now, status: "pending" });
    });
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", String(state.balance));
    state.slip = [];
    state.selCells = {};
    updateBalDisp();
    updateBadges();
    renderBoard();
    closeReview();
    showToast("\u2713 Wager placed! Good luck.");
  }
  function renderReviewParlay() {
    const body = document.getElementById("mob-review-body");
    body.innerHTML = "";
    const card = document.createElement("div");
    card.className = "mob-rv-card";
    state.parlayLegs.forEach((leg, i) => {
      const oddsTxt = isPropLeg(leg) ? `${propSide(leg)} ${propLineNum(leg)}${leg.vig ? " (" + leg.vig + ")" : ""}` : `${leg.line}${leg.vig && leg.vig !== leg.line ? " (" + leg.vig + ")" : ""}`;
      card.insertAdjacentHTML("beforeend", legRowHtml(leg, String(i + 1), oddsTxt));
    });
    const dec = parlayDec(state.parlayLegs);
    const oddsRow = document.createElement("div");
    oddsRow.className = "mob-rv-row";
    oddsRow.innerHTML = `<label>Combined Odds</label><div class="v">${decToAm(dec)} (${dec.toFixed(3)}x)</div>`;
    card.appendChild(oddsRow);
    const riskRow = document.createElement("div");
    riskRow.className = "mob-rv-row";
    riskRow.innerHTML = `
    <label>Risk ($)</label>
    <input type="number" min="20" step="5" value="20" id="mob-pm-risk">
  `;
    card.appendChild(riskRow);
    const winRow = document.createElement("div");
    winRow.className = "mob-rv-row";
    winRow.innerHTML = `<label>To Win</label><div class="v g" id="mob-pm-win">${fmtUSD((dec - 1) * 20)}</div>`;
    card.appendChild(winRow);
    const valEl = document.createElement("div");
    valEl.className = "mob-rv-val";
    valEl.id = "mob-pm-val";
    card.appendChild(valEl);
    body.appendChild(card);
    const btn = document.createElement("button");
    btn.className = "mob-rv-confirm";
    btn.id = "mob-rv-confirm";
    btn.textContent = `Place ${state.parlayLegs.length}-Leg Parlay \u2192`;
    btn.onclick = confirmParlayMobile;
    body.appendChild(btn);
    const recalc = () => {
      const inp = document.getElementById("mob-pm-risk");
      const risk = parseFloat(inp.value) || 0;
      const win = (dec - 1) * risk;
      document.getElementById("mob-pm-win").textContent = fmtUSD(win);
      const valid = risk >= 20 && risk <= state.balance;
      valEl.textContent = risk < 20 ? "\u26A0 Min $20" : risk > state.balance ? "\u26A0 Insufficient balance" : "";
      btn.disabled = !valid;
      btn.textContent = risk > state.balance ? "Insufficient balance" : `Place ${state.parlayLegs.length}-Leg Parlay \u2192`;
    };
    document.getElementById("mob-pm-risk").addEventListener("input", recalc);
    recalc();
  }
  function confirmParlayMobile() {
    const risk = parseFloat(document.getElementById("mob-pm-risk").value) || 0;
    if (risk < 20) {
      showToast("Min $20");
      return;
    }
    if (risk > state.balance) {
      showToast("Insufficient balance");
      return;
    }
    const dec = parlayDec(state.parlayLegs);
    const win = (dec - 1) * risk;
    state.balance -= risk;
    state.placedBets.push({
      type: "parlay",
      legs: state.parlayLegs.map((l) => ({
        teamName: l.teamName,
        matchup: l.matchup,
        type: l.type,
        line: l.line,
        vig: l.vig,
        propPlayer: l.propPlayer,
        propSide: l.propSide,
        propMkt: l.propMkt
      })),
      legCount: state.parlayLegs.length,
      decOdds: dec,
      amOdds: decToAm(dec),
      risk,
      win,
      placed: (/* @__PURE__ */ new Date()).toLocaleString(),
      status: "pending"
    });
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", String(state.balance));
    state.parlayLegs.forEach((l) => delete state.selCells[l.key]);
    state.parlayLegs = [];
    updateBalDisp();
    updateBadges();
    renderBoard();
    closeReview();
    showToast(`\u2713 Parlay placed! To win ${fmtUSD(win)}`);
  }
  function renderReviewIfBet() {
    const body = document.getElementById("mob-review-body");
    body.innerHTML = "";
    const card = document.createElement("div");
    card.className = "mob-rv-card";
    state.ifBetLegs.forEach((leg, i) => {
      const win = parseFloat(leg.win) || 0;
      const risk = calcRisk(win, leg.vig || leg.line);
      const rule = i === 0 ? "always fires" : leg.fireRule === "winOrPush" ? "if win/push" : "if win";
      const oddsTxt = isPropLeg(leg) ? `${propSide(leg)} ${propLineNum(leg)}${leg.vig ? " (" + leg.vig + ")" : ""}` : `${leg.line}${leg.vig && leg.vig !== leg.line ? " (" + leg.vig + ")" : ""}`;
      const titleTxt = isPropLeg(leg) ? leg.propPlayer : leg.teamName;
      const subTxt = isPropLeg(leg) ? `${propMktLabel(leg)} \xB7 ${rule}` : `${{ spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[leg.type] || leg.type} \xB7 ${rule}`;
      const row = document.createElement("div");
      row.className = "mob-rv-leg";
      row.innerHTML = `
      <div class="mob-rv-leg-num">${i + 1}</div>
      <div class="mob-rv-leg-info">
        <div class="mob-rv-leg-team">${escapeHtml(titleTxt)}</div>
        <div class="mob-rv-leg-sub">${escapeHtml(subTxt)}</div>
      </div>
      <div class="mob-rv-leg-odds">${escapeHtml(oddsTxt)}</div>
    `;
      card.appendChild(row);
      const winRow = document.createElement("div");
      winRow.className = "mob-rv-row";
      winRow.innerHTML = `
      <label>Leg ${i + 1} Win ($)</label>
      <input type="number" min="20" step="5" value="${win.toFixed(2)}" data-idx="${i}" data-role="ifwin">
    `;
      card.appendChild(winRow);
      const riskRow = document.createElement("div");
      riskRow.className = "mob-rv-row";
      riskRow.innerHTML = `<label>Leg ${i + 1} Risk</label><div class="v r">${fmtUSD(risk)}</div>`;
      card.appendChild(riskRow);
    });
    const leg1 = state.ifBetLegs[0];
    const leg1Risk = calcRisk(parseFloat(leg1.win) || 0, leg1.vig || leg1.line);
    const totalWin = state.ifBetLegs.reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
    const totRow = document.createElement("div");
    totRow.className = "mob-rv-row";
    totRow.style.borderTop = "1px solid var(--color-bet-border, #ccd0d4)";
    totRow.style.paddingTop = "8px";
    totRow.innerHTML = `<label>Total Risk (Leg 1)</label><div class="v r" id="mob-if-totrisk">${fmtUSD(leg1Risk)}</div>`;
    card.appendChild(totRow);
    const winTot = document.createElement("div");
    winTot.className = "mob-rv-row";
    winTot.innerHTML = `<label>Max Win (all hit)</label><div class="v g" id="mob-if-totwin">${fmtUSD(totalWin)}</div>`;
    card.appendChild(winTot);
    const valEl = document.createElement("div");
    valEl.className = "mob-rv-val";
    valEl.id = "mob-if-val";
    card.appendChild(valEl);
    body.appendChild(card);
    const btn = document.createElement("button");
    btn.className = "mob-rv-confirm";
    btn.id = "mob-rv-confirm";
    btn.textContent = `Place ${state.ifBetLegs.length}-Leg If Bet \u2192`;
    btn.onclick = confirmIfBetMobile;
    body.appendChild(btn);
    const recalc = () => {
      const leg1b = state.ifBetLegs[0];
      const r = calcRisk(parseFloat(leg1b.win) || 0, leg1b.vig || leg1b.line);
      const w = state.ifBetLegs.reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
      document.getElementById("mob-if-totrisk").textContent = fmtUSD(r);
      document.getElementById("mob-if-totwin").textContent = fmtUSD(w);
      const minOk = state.ifBetLegs.every((l) => (parseFloat(l.win) || 0) >= 20);
      const balOk = r <= state.balance;
      valEl.textContent = !minOk ? "\u26A0 Each leg must win at least $20" : !balOk ? "\u26A0 Leg 1 risk exceeds balance" : "";
      btn.disabled = !minOk || !balOk;
      btn.textContent = !balOk ? "Insufficient balance" : `Place ${state.ifBetLegs.length}-Leg If Bet \u2192`;
    };
    card.querySelectorAll('input[data-role="ifwin"]').forEach((inp) => {
      inp.addEventListener("input", (e) => {
        const i = parseInt(e.currentTarget.dataset.idx, 10);
        if (!state.ifBetLegs[i]) return;
        state.ifBetLegs[i].win = parseFloat(e.currentTarget.value) || 0;
        recalc();
      });
    });
    recalc();
  }
  function confirmIfBetMobile() {
    const n = state.ifBetLegs.length;
    if (n < 2) {
      showToast("Min 2 legs");
      return;
    }
    if (!state.ifBetLegs.every((l) => (parseFloat(l.win) || 0) >= 20)) {
      showToast("Each leg must win at least $20");
      return;
    }
    const leg1Risk = calcRisk(parseFloat(state.ifBetLegs[0].win) || 0, state.ifBetLegs[0].vig || state.ifBetLegs[0].line);
    if (leg1Risk > state.balance) {
      showToast("Insufficient balance");
      return;
    }
    const totalWin = state.ifBetLegs.reduce((a, l) => a + (parseFloat(l.win) || 0), 0);
    state.balance -= leg1Risk;
    state.placedBets.push({
      type: "ifbet",
      legs: state.ifBetLegs.map((l) => ({
        teamName: l.teamName,
        matchup: l.matchup,
        type: l.type,
        line: l.line,
        vig: l.vig,
        win: l.win,
        fireRule: l.fireRule,
        sport: l.sport,
        propPlayer: l.propPlayer,
        propSide: l.propSide,
        propMkt: l.propMkt
      })),
      legCount: n,
      risk: leg1Risk,
      win: totalWin,
      placed: (/* @__PURE__ */ new Date()).toLocaleString(),
      status: "pending"
    });
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", String(state.balance));
    state.ifBetLegs.forEach((l) => delete state.selCells[l.key]);
    state.ifBetLegs = [];
    updateBalDisp();
    updateBadges();
    renderBoard();
    closeReview();
    showToast(`\u2713 ${n}-leg if bet placed! Risk ${fmtUSD(leg1Risk)}`);
  }
  function renderReviewReverse() {
    const body = document.getElementById("mob-review-body");
    body.innerHTML = "";
    const card = document.createElement("div");
    card.className = "mob-rv-card";
    state.reverseLegs.forEach((leg, i) => {
      const lblK = i === 0 ? "A" : "B";
      const oddsTxt = isPropLeg(leg) ? `${propSide(leg)} ${propLineNum(leg)}${leg.vig ? " (" + leg.vig + ")" : ""}` : `${leg.line}${leg.vig && leg.vig !== leg.line ? " (" + leg.vig + ")" : ""}`;
      const titleTxt = isPropLeg(leg) ? leg.propPlayer : leg.teamName;
      const subTxt = isPropLeg(leg) ? `${propMktLabel(leg)} \xB7 ${i === 0 ? "TRIGGER \u2192 B" : "TRIGGER \u2192 A"}` : `${{ spread: "Spread", ml: "ML", total: "Total", tt: "TT" }[leg.type] || leg.type} \xB7 ${i === 0 ? "TRIGGER \u2192 B" : "TRIGGER \u2192 A"}`;
      const row = document.createElement("div");
      row.className = "mob-rv-leg";
      row.innerHTML = `
      <div class="mob-rv-leg-num">${lblK}</div>
      <div class="mob-rv-leg-info">
        <div class="mob-rv-leg-team">${escapeHtml(titleTxt)}</div>
        <div class="mob-rv-leg-sub">${escapeHtml(subTxt)}</div>
      </div>
      <div class="mob-rv-leg-odds">${escapeHtml(oddsTxt)}</div>
    `;
      card.appendChild(row);
    });
    const stake = state.reverseStake || 50;
    const stakeRow = document.createElement("div");
    stakeRow.className = "mob-rv-row";
    stakeRow.innerHTML = `<label>Stake per play ($)</label><input type="number" min="20" step="5" value="${stake}" id="mob-rv-stake">`;
    card.appendChild(stakeRow);
    const riskRow = document.createElement("div");
    riskRow.className = "mob-rv-row";
    riskRow.innerHTML = `<label>Total Risk (2 \xD7 stake)</label><div class="v r" id="mob-rv-risk">${fmtUSD(2 * stake)}</div>`;
    card.appendChild(riskRow);
    const winRow = document.createElement("div");
    winRow.className = "mob-rv-row";
    winRow.innerHTML = `<label>Max Win</label><div class="v g" id="mob-rv-maxwin">${fmtUSD(0)}</div>`;
    card.appendChild(winRow);
    const valEl = document.createElement("div");
    valEl.className = "mob-rv-val";
    valEl.id = "mob-rv-val";
    card.appendChild(valEl);
    body.appendChild(card);
    const btn = document.createElement("button");
    btn.className = "mob-rv-confirm";
    btn.id = "mob-rv-place-btn";
    btn.textContent = `Place Reverse \u2192`;
    btn.onclick = confirmReverseMobile;
    body.appendChild(btn);
    const a = state.reverseLegs[0], b2 = state.reverseLegs[1];
    const recalc = () => {
      const s = parseFloat(document.getElementById("mob-rv-stake").value) || 0;
      const risk = 2 * s;
      const decA = toDec(a.vig || a.line), decB = toDec(b2.vig || b2.line);
      const maxWin = 2 * s * (decA - 1 + (decB - 1));
      document.getElementById("mob-rv-risk").textContent = fmtUSD(risk);
      document.getElementById("mob-rv-maxwin").textContent = fmtUSD(maxWin);
      const minOk = s >= 20;
      const balOk = risk <= state.balance;
      valEl.textContent = !minOk ? "\u26A0 Min $20 stake per play" : !balOk ? "\u26A0 Total risk exceeds balance" : "";
      btn.disabled = !minOk || !balOk;
      btn.textContent = !balOk ? "Insufficient balance" : `Place Reverse (Risk ${fmtUSD(risk)}) \u2192`;
    };
    document.getElementById("mob-rv-stake").addEventListener("input", recalc);
    recalc();
  }
  function confirmReverseMobile() {
    if (state.reverseLegs.length !== 2) {
      showToast("Reverse Action: exactly 2 teams");
      return;
    }
    const stake = parseFloat(document.getElementById("mob-rv-stake").value) || 0;
    if (stake < 20) {
      showToast("Min $20 stake per play");
      return;
    }
    const risk = 2 * stake;
    if (risk > state.balance) {
      showToast("Insufficient balance");
      return;
    }
    const decA = toDec(state.reverseLegs[0].vig || state.reverseLegs[0].line);
    const decB = toDec(state.reverseLegs[1].vig || state.reverseLegs[1].line);
    const maxWin = 2 * stake * (decA - 1 + (decB - 1));
    state.balance -= risk;
    state.reverseStake = stake;
    state.placedBets.push({
      type: "reverse",
      variant: "2team",
      legs: state.reverseLegs.map((l) => ({
        teamName: l.teamName,
        matchup: l.matchup,
        type: l.type,
        line: l.line,
        vig: l.vig,
        sport: l.sport,
        propPlayer: l.propPlayer,
        propSide: l.propSide,
        propMkt: l.propMkt
      })),
      stake,
      risk,
      win: maxWin,
      placed: (/* @__PURE__ */ new Date()).toLocaleString(),
      status: "pending"
    });
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", String(state.balance));
    state.reverseLegs.forEach((l) => delete state.selCells[l.key]);
    state.reverseLegs = [];
    updateBalDisp();
    updateBadges();
    renderBoard();
    closeReview();
    showToast(`\u2713 Reverse Action placed! Risk ${fmtUSD(risk)} \u2192 max ${fmtUSD(maxWin)}`);
  }
  function renderReviewTeaser() {
    const body = document.getElementById("mob-review-body");
    body.innerHTML = "";
    const v = getVariant(state.teaserVariant);
    if (!v) {
      body.innerHTML = emptyState({ icon: "\u{1F3AF}", heading: "Pick a teaser variant", sub: "Choose PRIME 6 / 6.5 / 7 or a sweetheart variant before reviewing." });
      return;
    }
    const card = document.createElement("div");
    card.className = "mob-rv-card";
    state.teaserLegs.forEach((leg, i) => {
      const tl = { spread: "Spread", total: "Total" }[leg.type] || leg.type;
      const oddsTxt = `${leg.origLine} \u2192 ${leg.shiftedLine}`;
      const row = document.createElement("div");
      row.className = "mob-rv-leg";
      row.innerHTML = `
    <div class="mob-rv-leg-num">${i + 1}</div>
    <div class="mob-rv-leg-info">
      <div class="mob-rv-leg-team">${escapeHtml(leg.teamName)}</div>
      <div class="mob-rv-leg-sub">${escapeHtml(tl)} \xB7 ${escapeHtml(leg.matchup || "")}</div>
    </div>
    <div class="mob-rv-leg-odds">${escapeHtml(oddsTxt)}</div>
  `;
      card.appendChild(row);
    });
    const n = state.teaserLegs.length;
    const am = v.payouts && v.payouts[n] ? v.payouts[n] : null;
    const oddsRow = document.createElement("div");
    oddsRow.className = "mob-rv-row";
    oddsRow.innerHTML = `<label>Payout Odds</label><div class="v">${escapeHtml(am || "\u2014")}</div>`;
    card.appendChild(oddsRow);
    const riskRow = document.createElement("div");
    riskRow.className = "mob-rv-row";
    riskRow.innerHTML = `
  <label>Risk ($)</label>
  <input type="number" min="20" step="5" value="20" id="mob-tm-risk">
`;
    card.appendChild(riskRow);
    const winRow = document.createElement("div");
    winRow.className = "mob-rv-row";
    winRow.innerHTML = `<label>To Win</label><div class="v g" id="mob-tm-win">${fmtUSD(am ? calcWin(20, am) : 0)}</div>`;
    card.appendChild(winRow);
    const valEl = document.createElement("div");
    valEl.className = "mob-rv-val";
    valEl.id = "mob-tm-val";
    card.appendChild(valEl);
    body.appendChild(card);
    const btn = document.createElement("button");
    btn.className = "mob-rv-confirm";
    btn.id = "mob-rv-confirm";
    btn.textContent = am ? `Place ${n}-Pick ${v.label} \u2192` : "Invalid leg count";
    btn.disabled = !am;
    btn.onclick = confirmTeaserMobile;
    body.appendChild(btn);
    const recalc = () => {
      const inp = document.getElementById("mob-tm-risk");
      const risk = parseFloat(inp.value) || 0;
      if (!am) {
        btn.disabled = true;
        return;
      }
      const win = calcWin(risk, am);
      document.getElementById("mob-tm-win").textContent = fmtUSD(win);
      const valid = risk >= 20 && risk <= state.balance;
      valEl.textContent = risk < 20 ? "\u26A0 Min $20" : risk > state.balance ? "\u26A0 Insufficient balance" : "";
      btn.disabled = !valid;
      btn.textContent = risk > state.balance ? "Insufficient balance" : `Place ${n}-Pick ${v.label} \u2192`;
    };
    document.getElementById("mob-tm-risk").addEventListener("input", recalc);
    recalc();
  }
  function confirmTeaserMobile() {
    const v = getVariant(state.teaserVariant);
    if (!v) return;
    const n = state.teaserLegs.length;
    const risk = parseFloat(document.getElementById("mob-tm-risk").value) || 0;
    const am = v.payouts && v.payouts[n] ? v.payouts[n] : null;
    if (!am) {
      showToast("Invalid leg count");
      return;
    }
    if (risk < 20) {
      showToast("Min $20");
      return;
    }
    if (risk > state.balance) {
      showToast("Insufficient balance");
      return;
    }
    const win = calcWin(risk, am);
    state.balance -= risk;
    state.placedBets.push({
      type: "teaser",
      variant: v.label,
      legs: state.teaserLegs.map((l) => ({ teamName: l.teamName, matchup: l.matchup, type: l.type, origLine: l.origLine, line: l.shiftedLine, sport: l.sport })),
      legCount: n,
      amOdds: am,
      risk,
      win,
      placed: (/* @__PURE__ */ new Date()).toLocaleString(),
      status: "pending"
    });
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
    localStorage.setItem("bs_bal", String(state.balance));
    state.teaserLegs.forEach((l) => delete state.selCells[l.key]);
    state.teaserLegs = [];
    updateBalDisp();
    updateBadges();
    renderBoard();
    closeReview();
    showToast(`\u2713 ${n}-pick ${v.label} placed! To win ${fmtUSD(win)}`);
  }
  setApiHooks({ renderBoard, showBoardMsg, showToast });
  function init() {
    if (window.MOCK_DATA && localStorage.getItem("bs_mock") !== "0") {
      state.mockMode = true;
    }
    state.activeLeague = "NBA";
    updateBalDisp();
    const mockCbx = document.getElementById("mock-cbx");
    if (mockCbx) {
      mockCbx.checked = state.mockMode;
      mockCbx.disabled = !window.MOCK_DATA;
    }
    const bookSel = document.getElementById("book-sel");
    if (bookSel) bookSel.value = state.prefBook;
    const apiInp = document.getElementById("api-key-inp");
    if (apiInp && state.apiKey && state.apiKey !== "YOUR_API_KEY_HERE") apiInp.value = state.apiKey;
    document.querySelectorAll(".mob-stab").forEach((t) => {
      const sport = t.dataset.sport;
      if (sport && !t.querySelector("svg")) {
        t.insertAdjacentHTML("afterbegin", leagueIconHtml(sport, 14));
      }
      t.classList.toggle("active", t.dataset.sport === "NBA");
    });
    const cfg0 = SPORT_BY_KEY[state.activeLeague] || SPORT_BY_KEY.NBA;
    document.getElementById("board-title").textContent = `${state.activeLeague} \u2014 ${cfg0?.label || ""}`;
    updateTeaserGating();
    if (state.mockMode || state.apiKey && state.apiKey !== "YOUR_API_KEY_HERE") {
      fetchAndRender(state.activeLeague, true);
      if (!state.mockMode) startAuto();
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
    localStorage.setItem("bs_bal", String(state.balance));
    localStorage.setItem("bs_bets", JSON.stringify(state.placedBets));
  });
  Object.assign(window, {
    setMode,
    setSport,
    manualRefresh,
    openDrawer,
    closeDrawer,
    saveApiKey,
    saveBook,
    toggleMockMode,
    toggleAltLines,
    resetBalance,
    openBets,
    closeBets,
    closeAltSheet,
    openReview,
    closeReview,
    selectMobileTeaserVariant,
    computeRVNetMob
  });
})();
