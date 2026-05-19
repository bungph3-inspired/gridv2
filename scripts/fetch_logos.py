#!/usr/bin/env python3
"""Download all pro-league team logos from ESPN CDN into BetSimV2/public/teams/{league}/{slug}.png."""
import os, sys, json, urllib.request, urllib.error

import pathlib
ROOT = str(pathlib.Path(__file__).resolve().parent.parent / "public" / "teams")

# Each entry: full_name, slug (ESPN's URL slug), abbr (display)
TEAMS = {
    "nba": [
        ("Atlanta Hawks", "atl", "ATL"),
        ("Boston Celtics", "bos", "BOS"),
        ("Brooklyn Nets", "bkn", "BKN"),
        ("Charlotte Hornets", "cha", "CHA"),
        ("Chicago Bulls", "chi", "CHI"),
        ("Cleveland Cavaliers", "cle", "CLE"),
        ("Dallas Mavericks", "dal", "DAL"),
        ("Denver Nuggets", "den", "DEN"),
        ("Detroit Pistons", "det", "DET"),
        ("Golden State Warriors", "gs", "GSW"),
        ("Houston Rockets", "hou", "HOU"),
        ("Indiana Pacers", "ind", "IND"),
        ("LA Clippers", "lac", "LAC"),
        ("Los Angeles Clippers", "lac", "LAC"),  # alt name
        ("Los Angeles Lakers", "lal", "LAL"),
        ("Memphis Grizzlies", "mem", "MEM"),
        ("Miami Heat", "mia", "MIA"),
        ("Milwaukee Bucks", "mil", "MIL"),
        ("Minnesota Timberwolves", "min", "MIN"),
        ("New Orleans Pelicans", "no", "NOP"),
        ("New York Knicks", "ny", "NYK"),
        ("Oklahoma City Thunder", "okc", "OKC"),
        ("Orlando Magic", "orl", "ORL"),
        ("Philadelphia 76ers", "phi", "PHI"),
        ("Phoenix Suns", "phx", "PHX"),
        ("Portland Trail Blazers", "por", "POR"),
        ("Sacramento Kings", "sac", "SAC"),
        ("San Antonio Spurs", "sa", "SAS"),
        ("Toronto Raptors", "tor", "TOR"),
        ("Utah Jazz", "utah", "UTA"),
        ("Washington Wizards", "wsh", "WAS"),
    ],
    "nfl": [
        ("Arizona Cardinals", "ari", "ARI"),
        ("Atlanta Falcons", "atl", "ATL"),
        ("Baltimore Ravens", "bal", "BAL"),
        ("Buffalo Bills", "buf", "BUF"),
        ("Carolina Panthers", "car", "CAR"),
        ("Chicago Bears", "chi", "CHI"),
        ("Cincinnati Bengals", "cin", "CIN"),
        ("Cleveland Browns", "cle", "CLE"),
        ("Dallas Cowboys", "dal", "DAL"),
        ("Denver Broncos", "den", "DEN"),
        ("Detroit Lions", "det", "DET"),
        ("Green Bay Packers", "gb", "GB"),
        ("Houston Texans", "hou", "HOU"),
        ("Indianapolis Colts", "ind", "IND"),
        ("Jacksonville Jaguars", "jax", "JAX"),
        ("Kansas City Chiefs", "kc", "KC"),
        ("Las Vegas Raiders", "lv", "LV"),
        ("Los Angeles Chargers", "lac", "LAC"),
        ("Los Angeles Rams", "lar", "LAR"),
        ("Miami Dolphins", "mia", "MIA"),
        ("Minnesota Vikings", "min", "MIN"),
        ("New England Patriots", "ne", "NE"),
        ("New Orleans Saints", "no", "NO"),
        ("New York Giants", "nyg", "NYG"),
        ("New York Jets", "nyj", "NYJ"),
        ("Philadelphia Eagles", "phi", "PHI"),
        ("Pittsburgh Steelers", "pit", "PIT"),
        ("San Francisco 49ers", "sf", "SF"),
        ("Seattle Seahawks", "sea", "SEA"),
        ("Tampa Bay Buccaneers", "tb", "TB"),
        ("Tennessee Titans", "ten", "TEN"),
        ("Washington Commanders", "wsh", "WAS"),
    ],
    "mlb": [
        ("Arizona Diamondbacks", "ari", "ARI"),
        ("Atlanta Braves", "atl", "ATL"),
        ("Baltimore Orioles", "bal", "BAL"),
        ("Boston Red Sox", "bos", "BOS"),
        ("Chicago Cubs", "chc", "CHC"),
        ("Chicago White Sox", "chw", "CHW"),
        ("Cincinnati Reds", "cin", "CIN"),
        ("Cleveland Guardians", "cle", "CLE"),
        ("Colorado Rockies", "col", "COL"),
        ("Detroit Tigers", "det", "DET"),
        ("Houston Astros", "hou", "HOU"),
        ("Kansas City Royals", "kc", "KC"),
        ("Los Angeles Angels", "laa", "LAA"),
        ("Los Angeles Dodgers", "lad", "LAD"),
        ("Miami Marlins", "mia", "MIA"),
        ("Milwaukee Brewers", "mil", "MIL"),
        ("Minnesota Twins", "min", "MIN"),
        ("New York Mets", "nym", "NYM"),
        ("New York Yankees", "nyy", "NYY"),
        ("Oakland Athletics", "oak", "OAK"),
        ("Athletics", "oak", "ATH"),  # post-rebrand
        ("Philadelphia Phillies", "phi", "PHI"),
        ("Pittsburgh Pirates", "pit", "PIT"),
        ("San Diego Padres", "sd", "SD"),
        ("Seattle Mariners", "sea", "SEA"),
        ("San Francisco Giants", "sf", "SF"),
        ("St. Louis Cardinals", "stl", "STL"),
        ("St Louis Cardinals", "stl", "STL"),  # alt punctuation
        ("Tampa Bay Rays", "tb", "TB"),
        ("Texas Rangers", "tex", "TEX"),
        ("Toronto Blue Jays", "tor", "TOR"),
        ("Washington Nationals", "wsh", "WSH"),
    ],
    "nhl": [
        ("Anaheim Ducks", "ana", "ANA"),
        ("Boston Bruins", "bos", "BOS"),
        ("Buffalo Sabres", "buf", "BUF"),
        ("Calgary Flames", "cgy", "CGY"),
        ("Carolina Hurricanes", "car", "CAR"),
        ("Chicago Blackhawks", "chi", "CHI"),
        ("Colorado Avalanche", "col", "COL"),
        ("Columbus Blue Jackets", "cbj", "CBJ"),
        ("Dallas Stars", "dal", "DAL"),
        ("Detroit Red Wings", "det", "DET"),
        ("Edmonton Oilers", "edm", "EDM"),
        ("Florida Panthers", "fla", "FLA"),
        ("Los Angeles Kings", "la", "LAK"),
        ("Minnesota Wild", "min", "MIN"),
        ("Montreal Canadiens", "mtl", "MTL"),
        ("Nashville Predators", "nsh", "NSH"),
        ("New Jersey Devils", "nj", "NJ"),
        ("New York Islanders", "nyi", "NYI"),
        ("New York Rangers", "nyr", "NYR"),
        ("Ottawa Senators", "ott", "OTT"),
        ("Philadelphia Flyers", "phi", "PHI"),
        ("Pittsburgh Penguins", "pit", "PIT"),
        ("San Jose Sharks", "sj", "SJ"),
        ("Seattle Kraken", "sea", "SEA"),
        ("St. Louis Blues", "stl", "STL"),
        ("St Louis Blues", "stl", "STL"),
        ("Tampa Bay Lightning", "tb", "TB"),
        ("Toronto Maple Leafs", "tor", "TOR"),
        ("Utah Hockey Club", "utah", "UTA"),
        ("Utah Mammoth", "utah", "UTA"),  # rumored 2026 rebrand fallback
        ("Vancouver Canucks", "van", "VAN"),
        ("Vegas Golden Knights", "vgs", "VGK"),
        ("Washington Capitals", "wsh", "WSH"),
        ("Winnipeg Jets", "wpg", "WPG"),
    ],
}


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "skip"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = r.read()
        if len(data) < 200:
            return f"too-small ({len(data)}B)"
        with open(dest, "wb") as f:
            f.write(data)
        return f"ok ({len(data)}B)"
    except urllib.error.HTTPError as e:
        return f"http-{e.code}"
    except Exception as e:
        return f"err: {e}"


def main():
    results = {"ok": 0, "skip": 0, "fail": []}
    seen = set()
    for league, teams in TEAMS.items():
        league_dir = os.path.join(ROOT, league)
        os.makedirs(league_dir, exist_ok=True)
        for name, slug, abbr in teams:
            key = (league, slug)
            if key in seen:
                continue  # skip duplicate slugs from alt names
            seen.add(key)
            url = f"https://a.espncdn.com/i/teamlogos/{league}/500/{slug}.png"
            dest = os.path.join(league_dir, f"{slug}.png")
            status = download(url, dest)
            tag = "OK" if status.startswith(("ok", "skip")) else "FAIL"
            print(f"  [{tag}] {league}/{slug}.png ({name}) -> {status}")
            if status.startswith("ok"):
                results["ok"] += 1
            elif status == "skip":
                results["skip"] += 1
            else:
                results["fail"].append((league, slug, name, status))
    print()
    print(f"=== summary: {results['ok']} downloaded, {results['skip']} skipped, {len(results['fail'])} failed ===")
    for f in results["fail"]:
        print(" FAIL:", f)
    return 0 if not results["fail"] else 2


if __name__ == "__main__":
    sys.exit(main())
