// scripts/fetch_logos.mjs — Download all pro-league team logos from ESPN's
// CDN into ../public/teams/{league}/{slug}.png. Run from the project root:
//     node scripts/fetch_logos.mjs
// or via the npm alias:
//     npm run logos
//
// No dependencies — uses Node's built-in fetch + fs. Skips files that
// already exist on disk so re-runs are idempotent / fast.
//
// If you want to re-download everything, delete public/teams/ first.

import { writeFile, mkdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "public", "teams");

// Each entry: [fullName, slug, abbr]. Aliases (multiple names → same slug)
// are filtered to a single download per slug. Mirror of src/teams.js mapping.
const TEAMS = {
  nba: [
    ["Atlanta Hawks", "atl"], ["Boston Celtics", "bos"], ["Brooklyn Nets", "bkn"],
    ["Charlotte Hornets", "cha"], ["Chicago Bulls", "chi"], ["Cleveland Cavaliers", "cle"],
    ["Dallas Mavericks", "dal"], ["Denver Nuggets", "den"], ["Detroit Pistons", "det"],
    ["Golden State Warriors", "gs"], ["Houston Rockets", "hou"], ["Indiana Pacers", "ind"],
    ["LA Clippers", "lac"], ["Los Angeles Lakers", "lal"], ["Memphis Grizzlies", "mem"],
    ["Miami Heat", "mia"], ["Milwaukee Bucks", "mil"], ["Minnesota Timberwolves", "min"],
    ["New Orleans Pelicans", "no"], ["New York Knicks", "ny"], ["Oklahoma City Thunder", "okc"],
    ["Orlando Magic", "orl"], ["Philadelphia 76ers", "phi"], ["Phoenix Suns", "phx"],
    ["Portland Trail Blazers", "por"], ["Sacramento Kings", "sac"], ["San Antonio Spurs", "sa"],
    ["Toronto Raptors", "tor"], ["Utah Jazz", "utah"], ["Washington Wizards", "wsh"],
  ],
  nfl: [
    ["Arizona Cardinals", "ari"], ["Atlanta Falcons", "atl"], ["Baltimore Ravens", "bal"],
    ["Buffalo Bills", "buf"], ["Carolina Panthers", "car"], ["Chicago Bears", "chi"],
    ["Cincinnati Bengals", "cin"], ["Cleveland Browns", "cle"], ["Dallas Cowboys", "dal"],
    ["Denver Broncos", "den"], ["Detroit Lions", "det"], ["Green Bay Packers", "gb"],
    ["Houston Texans", "hou"], ["Indianapolis Colts", "ind"], ["Jacksonville Jaguars", "jax"],
    ["Kansas City Chiefs", "kc"], ["Las Vegas Raiders", "lv"], ["Los Angeles Chargers", "lac"],
    ["Los Angeles Rams", "lar"], ["Miami Dolphins", "mia"], ["Minnesota Vikings", "min"],
    ["New England Patriots", "ne"], ["New Orleans Saints", "no"], ["New York Giants", "nyg"],
    ["New York Jets", "nyj"], ["Philadelphia Eagles", "phi"], ["Pittsburgh Steelers", "pit"],
    ["San Francisco 49ers", "sf"], ["Seattle Seahawks", "sea"], ["Tampa Bay Buccaneers", "tb"],
    ["Tennessee Titans", "ten"], ["Washington Commanders", "wsh"],
  ],
  mlb: [
    ["Arizona Diamondbacks", "ari"], ["Atlanta Braves", "atl"], ["Baltimore Orioles", "bal"],
    ["Boston Red Sox", "bos"], ["Chicago Cubs", "chc"], ["Chicago White Sox", "chw"],
    ["Cincinnati Reds", "cin"], ["Cleveland Guardians", "cle"], ["Colorado Rockies", "col"],
    ["Detroit Tigers", "det"], ["Houston Astros", "hou"], ["Kansas City Royals", "kc"],
    ["Los Angeles Angels", "laa"], ["Los Angeles Dodgers", "lad"], ["Miami Marlins", "mia"],
    ["Milwaukee Brewers", "mil"], ["Minnesota Twins", "min"], ["New York Mets", "nym"],
    ["New York Yankees", "nyy"], ["Oakland Athletics", "oak"], ["Philadelphia Phillies", "phi"],
    ["Pittsburgh Pirates", "pit"], ["San Diego Padres", "sd"], ["Seattle Mariners", "sea"],
    ["San Francisco Giants", "sf"], ["St. Louis Cardinals", "stl"], ["Tampa Bay Rays", "tb"],
    ["Texas Rangers", "tex"], ["Toronto Blue Jays", "tor"], ["Washington Nationals", "wsh"],
  ],
  nhl: [
    ["Anaheim Ducks", "ana"], ["Boston Bruins", "bos"], ["Buffalo Sabres", "buf"],
    ["Calgary Flames", "cgy"], ["Carolina Hurricanes", "car"], ["Chicago Blackhawks", "chi"],
    ["Colorado Avalanche", "col"], ["Columbus Blue Jackets", "cbj"], ["Dallas Stars", "dal"],
    ["Detroit Red Wings", "det"], ["Edmonton Oilers", "edm"], ["Florida Panthers", "fla"],
    ["Los Angeles Kings", "la"], ["Minnesota Wild", "min"], ["Montreal Canadiens", "mtl"],
    ["Nashville Predators", "nsh"], ["New Jersey Devils", "nj"], ["New York Islanders", "nyi"],
    ["New York Rangers", "nyr"], ["Ottawa Senators", "ott"], ["Philadelphia Flyers", "phi"],
    ["Pittsburgh Penguins", "pit"], ["San Jose Sharks", "sj"], ["Seattle Kraken", "sea"],
    ["St. Louis Blues", "stl"], ["Tampa Bay Lightning", "tb"], ["Toronto Maple Leafs", "tor"],
    ["Utah Hockey Club", "utah"], ["Vancouver Canucks", "van"], ["Vegas Golden Knights", "vgs"],
    ["Washington Capitals", "wsh"], ["Winnipeg Jets", "wpg"],
  ],
};

async function exists(p) {
  try { const s = await stat(p); return s.size > 200; } catch { return false; }
}

async function downloadOne(league, slug, name) {
  const dest = join(ROOT, league, `${slug}.png`);
  if (await exists(dest)) return { status: "skip", name };
  const url = `https://a.espncdn.com/i/teamlogos/${league}/500/${slug}.png`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return { status: `http-${r.status}`, name };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 200) return { status: `too-small-${buf.length}B`, name };
    await writeFile(dest, buf);
    return { status: `ok-${buf.length}B`, name };
  } catch (e) {
    return { status: `err: ${e.message}`, name };
  }
}

async function main() {
  let ok = 0, skip = 0;
  const fails = [];
  for (const [league, rows] of Object.entries(TEAMS)) {
    await mkdir(join(ROOT, league), { recursive: true });
    const seen = new Set();
    // Run downloads for this league in parallel (max ~30 in flight)
    const tasks = rows
      .filter(([, slug]) => { if (seen.has(slug)) return false; seen.add(slug); return true; })
      .map(([name, slug]) => downloadOne(league, slug, name).then(r => ({ league, slug, ...r })));
    const results = await Promise.all(tasks);
    for (const r of results) {
      const tag = r.status.startsWith("ok") ? "OK" : r.status === "skip" ? "--" : "FAIL";
      console.log(`  [${tag}] ${r.league}/${r.slug}.png  ${r.name}  ${r.status}`);
      if (r.status.startsWith("ok")) ok++;
      else if (r.status === "skip") skip++;
      else fails.push(r);
    }
  }
  console.log(`\n=== ${ok} downloaded, ${skip} already present, ${fails.length} failed ===`);
  if (fails.length) {
    console.log("\nFailures (the page will still work — these teams render the monogram fallback):");
    for (const f of fails) console.log(`  ${f.league}/${f.slug}.png  ${f.name}  ->  ${f.status}`);
    process.exit(2);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
