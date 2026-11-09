"""
The Daily Brief - collector.

Reads ~80 RSS feeds from newsrooms and official bodies, groups the same story told by different outlets into one,
ranks the day's stories, tags where in the world they happen, adds market numbers, and writes:
  site/data/today.json             what the page shows
  site/data/archive/YYYY-MM-DD.json  one file per day (kept forever)
  site/data/archive/index.json     list of days
Only headline, outlet, time and link are stored - never article text or photos.
Standard library only: runs with any Python 3.9+, no pip installs.

Run once:   python collector/collect.py
"""
import gzip
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import geo  # noqa: E402

HOME = Path(__file__).resolve().parent.parent
SITE = HOME / "site"
DATA = SITE / "data"
ARCH = DATA / "archive"
STATE = HOME / "state"
MAP = SITE / "vendor" / "countries.json"   # every country name on the map, with its centre
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
KEEP_H = 72          # items kept for grouping / developing stories
GROUP_GAP = 18 * 3600
CATS = ["world", "war", "economy", "forex", "commodities", "energy", "crypto", "home", "tech", "science", "sport"]
TOP_CAP = {"world": 3, "war": 3, "economy": 3, "forex": 2, "commodities": 2, "energy": 2, "crypto": 2, "home": 2, "tech": 2, "science": 1, "sport": 1}
MARKET_CATS = ["energy", "commodities", "forex", "crypto", "economy"]
# sites that mostly republish other newsrooms' stories: shown, but never counted as an independent confirmation
AGGREGATORS = {"Yahoo Finance", "Investing.com"}
TIER_RANK = {"official": 0, "major": 1, "news": 2, "regional": 3}

RX = {
    "energy": re.compile(r"\b(oil|crude|brent|wti|opec\+?|natural gas|lng|gasoline|petrol|diesel|refiner(y|ies)|pipelines?|tankers?|barrels?|oilfield|"
                         r"shale|power grid|electricity prices?|power prices?|energy prices?|energy crisis|nuclear power|coal|renewables?|solar power|wind power|hormuz)\b", re.I),
    "commodities": re.compile(r"\b(gold|silver|platinum|palladium|copper|iron ore|aluminium|aluminum|nickel|lithium|zinc|cobalt|rare earths?|wheat|corn|soybeans?|"
                              r"coffee|cocoa|sugar|cotton|palm oil|rice prices?|commodit(y|ies)|metals?|bullion|mining)\b", re.I),
    "forex": re.compile(r"\b(forex|fx|currenc(y|ies)|exchange rates?|dollar|greenback|euro|sterling|pound|yen|yuan|renminbi|rupee|rupiah|lira|peso|rand|ruble|rouble|"
                        r"franc|dirham|riyal|dxy|eur/usd|usd/jpy|gbp/usd|devaluation|peg|intervention)\b", re.I),
    "war": re.compile(r"\b(war|wars|airstrikes?|air strikes?|missiles?|drones?|troops|soldiers|army|military|ceasefire|truce|invasion|invade[sd]?|offensive|shelling|"
                      r"bombs?|bombing|bombard\w*|killed in|hostages?|militants?|rebels?|frontline|front line|artillery|warships?|navy|idf|hamas|hezbollah|houthis?|"
                      r"gaza|kyiv|kharkiv|donbas|hormuz|nato|insurgents?|massacre|shot down|strikes? on)\b", re.I),
    "economy": re.compile(r"\b(fed|federal reserve|central bank|ecb|bank of england|boj|interest rates?|rate cut|rate hike|inflation|cpi|ppi|gdp|recession|tariffs?|"
                          r"stocks?|shares|stock market|markets?|wall street|s&p|nasdaq|dow|oil prices?|crude|brent|opec|earnings|economy|economic|jobs report|payrolls?|"
                          r"unemployment|bonds?|yields?|treasur(y|ies)|currency|dollar|imf|world bank|budget|deficit|debt|trade deal|exports?|imports?|gold price)\b", re.I),
    "crypto": re.compile(r"\b(bitcoin|btc|crypto\w*|ethereum|ether|solana|stablecoins?|blockchain|binance|coinbase|tether|xrp|defi|token)\b", re.I),
    "tech": re.compile(r"\b(ai|a\.i\.|artificial intelligence|openai|anthropic|chatgpt|gemini|nvidia|chips?|semiconductors?|apple|google|microsoft|meta|amazon|tesla|"
                       r"spacex|software|cyber\w*|hack(er|ers|ed)?|robots?|smartphones?|iphone|tiktok|data cent(er|re)s?)\b", re.I),
    "science": re.compile(r"\b(nasa|space|rocket|satellite|moon|mars|planet|asteroid|climate|scientists?|researchers|study finds|vaccines?|virus|outbreak|pandemic|"
                          r"disease|cancer|health|hospital|species|fossil|heatwave|emissions)\b", re.I),
    "sport": re.compile(r"\b(football|soccer|cricket|premier league|champions league|world cup|olympics?|tennis|formula 1|f1|grand prix|nba|nfl|golf|rugby|"
                        r"match|tournament|goal|striker|coach|test series|t20|odi)\b", re.I),
}
AUTO_ORDER = ["war", "crypto", "energy", "commodities", "forex", "economy", "tech", "science", "sport"]
REFINE = ["crypto", "energy", "commodities", "forex"]
HOT = {"breaking": 3, "killed": 3, "dead": 2, "earthquake": 3, "tsunami": 4, "attack": 2, "strike": 2, "missile": 2, "invasion": 4, "ceasefire": 3, "nuclear": 3,
       "election": 2, "resign": 3, "impeach": 3, "arrest": 2, "verdict": 2, "coup": 4, "assassinat": 4, "hurricane": 3, "typhoon": 3, "cyclone": 3, "flood": 2,
       "wildfire": 2, "pandemic": 3, "outbreak": 2, "fed ": 3, "rate cut": 4, "rate hike": 4, "inflation": 3, "cpi": 4, "jobs report": 4, "recession": 3,
       "tariff": 3, "default": 3, "shutdown": 3, "oil": 2, "opec": 3, "hormuz": 4, "sanction": 2, "etf": 3, "sec ": 2, "hack": 3, "bankrupt": 4, "crash": 3,
       "plunge": 3, "soar": 2, "record": 2, "all-time high": 3, "surge": 2, "liquidat": 3, "historic": 2, "first time": 2, "talks": 1, "deal": 1}
STOP = set("""a an the and or but of to in on at for from by with into over after before about as is are was were be been has have had will would can could
may might says say said new news live latest update updates report reports amid than that this these those its it his her their they who what when where why
how not more most first last day days week year years today here heres more just get gets got make makes made video watch photos analysis opinion""".split())
KW = [("btc", r"\bbitcoin|\bbtc\b"), ("eth", r"\bether(eum)?\b|\beth\b"), ("sol", r"\bsolana\b"), ("xrp", r"\bxrp\b|\bripple\b"),
      ("oil", r"\boil\b|\bcrude\b|\bbrent\b|\bopec\b"), ("gold", r"\bgold\b"), ("spx", r"s&p|\bstocks?\b|wall street|\bdow\b|nasdaq|\bshares\b"),
      ("wti", r"\bwti\b"), ("gas", r"natural gas|\blng\b"), ("silver", r"\bsilver\b"), ("copper", r"\bcopper\b"), ("wheat", r"\bwheat\b"),
      ("jpy", r"\byen\b"), ("gbp", r"\bsterling\b|\bpound\b"), ("eur", r"\beuro\b"), ("cny", r"\byuan\b"), ("inr", r"indian rupee|\brupee\b.*india"),
      ("dxy", r"\bdollar\b"), ("tnx", r"\byields?\b|\btreasur(y|ies)\b|\bbonds?\b"), ("vix", r"\bvolatility\b|\bvix\b"), ("lkr", r"\brupee\b")]
KW = [(k, re.compile(p, re.I)) for k, p in KW]
SUFFIX = re.compile(r"\s+[-|–—]\s+(BBC News|Reuters|AP News|Al Jazeera|The Guardian|CNBC|Bloomberg|Fox News|CNN|NPR|DW|France 24|Sky News|ABC News|CBS News|"
                    r"The New York Times|Washington Post|Yahoo Finance|MarketWatch|Financial Times|Euronews)\s*$", re.I)


def cfg():
    return json.loads((HOME / "config.json").read_text(encoding="utf-8"))


def read(p, default):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:  # noqa
        return default


def write(p, obj):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, p)


# ---------------- downloading ----------------
def get(url, timeout=20, headers=None, data=None):
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Encoding": "gzip"}
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h, data=data)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read(15_000_000)
        if r.headers.get("Content-Encoding") == "gzip":
            body = gzip.decompress(body)
        return body


def get_json(url, **kw):
    return json.loads(get(url, **kw).decode("utf-8", "replace"))


_TAG = re.compile(r"<[^>]+>")


def clean(s):
    s = html.unescape(_TAG.sub(" ", s or ""))
    s = re.sub(r"\s+", " ", s).strip()
    return SUFFIX.sub("", s)


def when(s):
    s = (s or "").strip()
    if not s:
        return None
    for f in (parsedate_to_datetime, lambda x: datetime.fromisoformat(x.replace("Z", "+00:00"))):
        try:
            dt = f(s)
            if dt.tzinfo is None:          # no time zone given (or "-0000") = UTC
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
        except Exception:  # noqa
            continue
    return None


JUNK = re.compile(r"(The post .{0,200} appeared first on .*$|Continue reading.*$|Read more.*$|Read full story.*$|\[…\]|\[\.\.\.\]|…\s*$|Click here.*$|Sign up for .*$)", re.I)


def dek(raw, title):
    """The outlet's own one or two line teaser from its feed, cleaned and kept short (never the article)."""
    t = clean(raw or "")
    t = JUNK.sub("", t).strip(" -–—|·")
    t = re.sub(r"^(VIDEO|WATCH|LIVE|PHOTOS|LISTEN)\s*[:|-]\s*", "", t, flags=re.I)
    if len(t) < 40:
        return ""
    a, b = tokens(title), tokens(t[:len(title) + 40])
    if a and len(a & b) / len(a) > 0.8 and len(t) < len(title) + 30:
        return ""                      # just repeats the headline
    if t.lower().startswith(title.lower()[:60]):
        t = t[len(title):].lstrip(" .:-–—")
        if len(t) < 40:
            return ""
    if len(t) > 240:
        cut = t[:240]
        end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
        t = cut[:end + 1] if end > 110 else cut[:cut.rfind(" ")].rstrip(",;:") + "…"
    return t


def parse_feed(body):
    body = re.sub(rb"^\s+", b"", body)
    root = ET.fromstring(body)
    out = []
    for el in root.iter():
        t = el.tag.rsplit("}", 1)[-1].lower()
        if t not in ("item", "entry"):
            continue
        d = {}
        for c in el:
            ct = c.tag.rsplit("}", 1)[-1].lower()
            if ct == "title" and "title" not in d:
                d["title"] = clean("".join(c.itertext()))[:260]
            elif ct == "link":
                href = c.get("href") or (c.text or "").strip()
                if href and c.get("rel") in (None, "alternate"):
                    d.setdefault("link", href.strip())
            elif ct in ("pubdate", "published", "updated", "date", "issued") and "ts" not in d:
                d["ts"] = when(c.text)
            elif ct in ("description", "summary") and "desc" not in d:
                d["desc"] = "".join(c.itertext())
            elif ct == "encoded" and "enc" not in d:
                d["enc"] = "".join(c.itertext())[:3000]
            elif ct == "guid" and "link" not in d and (c.text or "").strip().startswith("http") and c.get("isPermaLink") != "false":
                d["link"] = c.text.strip()
        if d.get("title") and str(d.get("link", "")).startswith(("http://", "https://")) and len(d["title"]) > 12:
            d["desc"] = dek(d.get("desc") or d.pop("enc", ""), d["title"])
            d.pop("enc", None)
            out.append(d)
    return out


def fetch(feed):
    t0 = time.time()
    try:
        items = parse_feed(get(feed["url"]))
        return feed, items, None, round(time.time() - t0, 1)
    except urllib.error.HTTPError as e:
        return feed, [], f"HTTP {e.code}", round(time.time() - t0, 1)
    except Exception as e:  # noqa
        return feed, [], (type(e).__name__ + ": " + str(e))[:120], round(time.time() - t0, 1)


# ---------------- understanding ----------------
def classify(title, feed_cat):
    if feed_cat == "economy":            # business feeds: put oil, metals, currencies and crypto in their own chapters
        for k in REFINE:
            if RX[k].search(title):
                return k
        return "economy"
    if feed_cat not in ("world", "auto"):
        return feed_cat
    for k in AUTO_ORDER:
        if RX[k].search(title):
            if k == "economy" and feed_cat == "world" and len(RX["economy"].findall(title)) < 1:
                continue
            return k
    return "world"


def tokens(title):
    out = set()
    for w in re.findall(r"[a-z0-9$][a-z0-9$'\-.&]+", title.lower().replace("’", "'")):
        w = w.strip("'-.")
        if w.endswith("'s"):
            w = w[:-2]
        if len(w) < 3 or w in STOP:
            continue
        if len(w) > 4 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        out.add(w)
    return out


def group(items):
    """Same story told by different outlets -> one story (they share enough distinctive words)."""
    items = sorted(items, key=lambda x: x["ts"])
    stories = []
    for it in items:
        tok = tokens(it["title"])
        if not tok:
            continue
        best, best_s = None, 0
        for s in stories[-900:]:
            if it["ts"] - s["last"] > GROUP_GAP:
                continue
            shared = len(tok & s["tok"])
            if shared < 3:
                continue
            sc = shared / max(1, min(len(tok), len(s["core"])))
            if sc >= 0.5 and sc > best_s:
                best, best_s = s, sc
        if best is None:
            stories.append({"tok": set(tok), "core": set(tok), "items": [it], "first": it["ts"], "last": it["ts"]})
        else:
            best["items"].append(it)
            best["tok"] |= tok
            best["last"] = max(best["last"], it["ts"])
    return stories


def hot_of(text):
    t = " " + text.lower() + " "
    return min(8, sum(w for k, w in HOT.items() if k in t))


def kw_of(text):
    return [k for k, rx in KW if rx.search(text)][:2]


def build(stories, conf, now):
    homes = set(conf.get("home_countries") or [])
    out = []
    for s in stories:
        its = s["items"]
        orgs = sorted({i["org"] for i in its})
        official = any(i["tier"] == "official" for i in its)
        major = any(i["tier"] == "major" for i in its)
        votes = {}
        for i in its:
            votes[i["cat"]] = votes.get(i["cat"], 0) + (2 if i["fcat"] not in ("world", "auto") else 1)
        cat = max(votes.items(), key=lambda kv: (kv[1], -CATS.index(kv[0])))[0]
        recent = [i for i in its if i["ts"] >= s["last"] - 12 * 3600] or its
        lead = sorted(recent, key=lambda i: (TIER_RANK.get(i["tier"], 3), -i["ts"]))[0]
        text = " ".join(i["title"] for i in its)
        dk = next((i.get("d") for i in [lead] + sorted(recent, key=lambda i: (TIER_RANK.get(i["tier"], 3), -i["ts"]))
                   + sorted(its, key=lambda i: (TIER_RANK.get(i["tier"], 3), -i["ts"])) if i.get("d")), "")
        h = hot_of(text)
        pl = geo.places(lead["title"] + " · " + " · ".join(i["title"] for i in its[:6]), MAP)
        indep = sorted({i["org"] for i in its if i["org"] not in AGGREGATORS})
        n = len(indep)                     # independent newsrooms (the two-source rule)
        status = "OFFICIAL" if official else "VERIFIED" if n >= 2 else "UNCONFIRMED"
        age_h = (now - s["last"]) / 3600
        developing = s["first"] < now - 24 * 3600 and s["last"] >= now - 8 * 3600 and status != "UNCONFIRMED"
        breaking = (n >= 3 and s["first"] >= now - 3 * 3600) or (official and h >= 4 and s["first"] >= now - 2 * 3600)
        score = n * 3 + (4 if official else 0) + (1 if major else 0) + h - age_h * 0.35 + (1.5 if developing else 0)
        seen_org, reports = set(), []
        for i in sorted(its, key=lambda i: i["ts"]):
            if i["org"] in seen_org and len(its) > 10:
                continue
            seen_org.add(i["org"])
            reports.append({"o": i["org"], "t": i["title"], "u": i["link"], "ts": int(i["ts"])})
        sid = hashlib.sha1(sorted(its, key=lambda i: i["ts"])[0]["link"].encode()).hexdigest()[:10]
        out.append({"id": sid, "cat": cat, "title": lead["title"], "dek": dk, "link": lead["link"], "orgs": orgs, "indep": indep, "n": n, "status": status,
                    "first": int(s["first"]), "last": int(s["last"]), "score": round(score, 2), "hot": h,
                    "places": pl, "home": cat == "home" or any(p["c"] in homes for p in pl), "kw": kw_of(text),
                    "also": [k for k in MARKET_CATS if k != cat and RX[k].search(text)][:3],
                    "developing": developing, "breaking": breaking, "reports": reports[-10:]})
    return out


# ---------------- market numbers ----------------
YAHOO = [("spx", "^GSPC", "S&P 500", "stocks"), ("ndx", "^IXIC", "Nasdaq", "stocks"), ("dji", "^DJI", "Dow Jones", "stocks"), ("tnx", "^TNX", "US 10Y yield", "stocks"),
         ("vix", "^VIX", "VIX fear gauge", "stocks"),
         ("dxy", "DX-Y.NYB", "Dollar index", "forex"), ("eur", "EURUSD=X", "EUR/USD", "forex"), ("gbp", "GBPUSD=X", "GBP/USD", "forex"), ("jpy", "JPY=X", "USD/JPY", "forex"),
         ("cny", "CNY=X", "USD/CNY", "forex"), ("inr", "INR=X", "USD/INR", "forex"), ("lkr", "LKR=X", "USD/LKR", "forex"),
         ("gold", "GC=F", "Gold", "commodities"), ("silver", "SI=F", "Silver", "commodities"), ("copper", "HG=F", "Copper", "commodities"), ("wheat", "ZW=F", "Wheat", "commodities"),
         ("oil", "BZ=F", "Brent oil", "energy"), ("wti", "CL=F", "WTI oil", "energy"), ("gas", "NG=F", "Natural gas", "energy")]
COINS = [("btc", "bitcoin", "Bitcoin"), ("eth", "ethereum", "Ethereum"), ("sol", "solana", "Solana"), ("xrp", "ripple", "XRP")]


def thin(v, n=48):
    v = [x for x in v if isinstance(x, (int, float))]
    if len(v) <= n:
        return [round(x, 6) for x in v]
    step = len(v) / n
    return [round(v[int(i * step)], 6) for i in range(n)] + [round(v[-1], 6)]


def yahoo(item):
    key, sym, name, grp = item
    for host in ("query1", "query2"):
        try:
            j = get_json(f"https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(sym)}?range=1mo&interval=1d", timeout=15)
            r = j["chart"]["result"][0]
            closes = [x for x in r["indicators"]["quote"][0]["close"] if x is not None]
            price = r["meta"].get("regularMarketPrice") or closes[-1]
            prev = closes[-2] if len(closes) > 1 else None
            return {"k": key, "name": name, "sym": sym, "p": price, "chg": (price / prev - 1) * 100 if prev else None, "spark": thin(closes), "src": "Yahoo Finance", "g": grp}
        except Exception:  # noqa
            continue
    return {"k": key, "name": name, "sym": sym, "p": None, "err": True, "g": grp}


def markets():
    out = []
    try:
        ids = ",".join(c[1] for c in COINS)
        rows = get_json(f"https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids={ids}&sparkline=true&price_change_percentage=24h", timeout=20)
        by = {r["id"]: r for r in rows}
        for k, cid, name in COINS:
            r = by.get(cid)
            if r:
                out.append({"k": k, "name": name, "sym": r["symbol"].upper(), "p": r["current_price"], "chg": r.get("price_change_percentage_24h"),
                            "spark": thin((r.get("sparkline_in_7d") or {}).get("price") or []), "src": "CoinGecko", "g": "crypto"})
    except Exception:  # noqa
        out += [{"k": k, "name": n, "sym": k.upper(), "p": None, "err": True, "g": "crypto"} for k, _, n in COINS]
    for m in out:                       # second opinion on crypto prices
        if m.get("p"):
            try:
                cb = float(get_json(f"https://api.coinbase.com/v2/prices/{m['sym']}-USD/spot", timeout=10)["data"]["amount"])
                m["chk"] = {"src": "Coinbase", "p": cb, "diff": round((m["p"] / cb - 1) * 100, 3)}
                m["ok"] = abs(m["chk"]["diff"]) < 1.0
            except Exception:  # noqa
                pass
    with ThreadPoolExecutor(6) as ex:
        out += list(ex.map(yahoo, YAHOO))
    for m in out:                       # sanity checks: no zero, negative or wildly jumping prices
        if m.get("p") is not None and (m["p"] <= 0 or (m.get("chg") is not None and abs(m["chg"]) > 40)):
            m.update(p=None, err=True)
    fng = None
    try:
        d = get_json("https://api.alternative.me/fng/?limit=8", timeout=15)["data"]
        fng = {"v": int(d[0]["value"]), "label": d[0]["value_classification"], "hist": [int(x["value"]) for x in reversed(d)], "src": "alternative.me"}
    except Exception:  # noqa
        pass
    return out, fng


# ---------------- macro numbers (official statistics via the St. Louis Fed's FRED) ----------------
# (key, FRED series, name, region, group, how to show it, original source)
MACRO = [
    ("us_cpi", "CPIAUCSL", "Inflation (CPI)", "United States", "Inflation", "yoy", "US BLS"),
    ("us_core", "CPILFESL", "Core inflation", "United States", "Inflation", "yoy", "US BLS"),
    ("us_pce", "PCEPILFE", "Core PCE (Fed's gauge)", "United States", "Inflation", "yoy", "US BEA"),
    ("us_unemp", "UNRATE", "Unemployment rate", "United States", "Jobs", "level%", "US BLS"),
    ("us_nfp", "PAYEMS", "Jobs added (payrolls)", "United States", "Jobs", "diffk", "US BLS"),
    ("us_claims", "ICSA", "Weekly jobless claims", "United States", "Jobs", "levelk", "US Dept. of Labor"),
    ("us_fed", "DFF", "Fed funds rate", "United States", "Rates", "level%", "Federal Reserve"),
    ("us_10y", "DGS10", "10-year Treasury yield", "United States", "Rates", "level%", "US Treasury"),
    ("us_2y", "DGS2", "2-year Treasury yield", "United States", "Rates", "level%", "US Treasury"),
    ("us_curve", "T10Y2Y", "Yield curve (10y − 2y)", "United States", "Rates", "levelpt", "Federal Reserve"),
    ("us_gdp", "A191RL1Q225SBEA", "GDP growth (annualised)", "United States", "Growth", "level%", "US BEA"),
    ("us_retail", "RSAFS", "Retail sales (month)", "United States", "Growth", "mom", "US Census Bureau"),
    ("us_sent", "UMCSENT", "Consumer sentiment", "United States", "Growth", "level", "Univ. of Michigan"),
    ("ea_rate", "ECBDFR", "ECB deposit rate", "Euro area", "Rates", "level%", "ECB"),
    ("ea_cpi", "CP0000EZ19M086NEST", "Inflation (HICP)", "Euro area", "Inflation", "yoy", "Eurostat"),
    ("ea_unemp", "LRHUTTTTEZM156S", "Unemployment rate", "Euro area", "Jobs", "level%", "OECD / Eurostat"),
    ("uk_rate", "BOERUKM", "Bank of England rate", "United Kingdom", "Rates", "level%", "Bank of England"),
    ("uk_cpi", "GBRCPIALLMINMEI", "Inflation (CPI)", "United Kingdom", "Inflation", "yoy", "ONS via OECD"),
    ("jp_cpi", "JPNCPIALLMINMEI", "Inflation (CPI)", "Japan", "Inflation", "yoy", "Statistics Japan via OECD"),
]
IMPORTANT_RELEASES = re.compile(r"consumer price index|employment situation|gross domestic product|personal income|producer price|retail|"
                                r"jobless|unemployment insurance|job openings|fomc|h\.15|industrial production|housing starts|consumer sentiment|durable goods", re.I)


def fred_csv(series, start):
    raw = get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={start}", timeout=25).decode("utf-8", "replace")
    rows = []
    for line in raw.strip().splitlines()[1:]:
        parts = line.split(",")
        if len(parts) >= 2 and parts[1] not in (".", ""):
            try:
                rows.append((parts[0], float(parts[1])))
            except ValueError:
                pass
    return rows


def macro_one(spec):
    key, sid, name, region, group, how, src = spec
    try:
        rows = fred_csv(sid, (datetime.now(timezone.utc) - timedelta(days=365 * 4)).strftime("%Y-%m-%d"))
        if len(rows) < 3:
            raise ValueError("no data")
        dates, vals = [r[0] for r in rows], [r[1] for r in rows]
        if how == "yoy":                       # index -> % change on a year earlier
            step = 12 if len(dates) > 13 and dates[-1][5:7] != dates[-2][5:7] else 4
            series = [(dates[i], (vals[i] / vals[i - step] - 1) * 100) for i in range(step, len(vals))]
            unit = "%"
        elif how == "mom":
            series = [(dates[i], (vals[i] / vals[i - 1] - 1) * 100) for i in range(1, len(vals))]
            unit = "%"
        elif how == "diffk":                   # thousands of jobs added in the month
            series = [(dates[i], vals[i] - vals[i - 1]) for i in range(1, len(vals))]
            unit = "k"
        elif how == "levelk":
            series = [(d, v / 1000) for d, v in zip(dates, vals)]
            unit = "k"
        else:
            series = list(zip(dates, vals))
            unit = "%" if how == "level%" else " pts" if how == "levelpt" else ""
        if how in ("level%",) and sid in ("DFF", "DGS10", "DGS2"):   # daily series: keep one point a week for the line
            series = series[-260 * 2:]
        last, prev = series[-1], series[-2]
        spark = [round(v, 3) for _, v in series[-36:]] if len(series) < 400 else [round(v, 3) for _, v in series[-520::10]] + [round(series[-1][1], 3)]
        return {"k": key, "id": sid, "name": name, "region": region, "group": group, "v": round(last[1], 2), "prev": round(prev[1], 2), "date": last[0], "prev_date": prev[0],
                "unit": unit, "spark": spark, "src": src, "via": "FRED (St. Louis Fed)", "url": f"https://fred.stlouisfed.org/series/{sid}"}
    except Exception as e:  # noqa
        return {"k": key, "id": sid, "name": name, "region": region, "group": group, "err": str(e)[:80], "src": src}


def upcoming_releases(now):
    key = os.environ.get("FRED_API_KEY", "").strip()
    if not key:
        return None
    a = datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%d")
    b = (datetime.fromtimestamp(now, timezone.utc) + timedelta(days=8)).strftime("%Y-%m-%d")
    try:
        j = get_json(f"https://api.stlouisfed.org/fred/releases/dates?api_key={key}&file_type=json&realtime_start={a}&realtime_end={b}"
                     f"&include_release_dates_with_no_data=true&sort_order=asc&limit=1000", timeout=25)
        out, seen = [], set()
        for r in j.get("release_dates", []):
            n = r.get("release_name", "")
            if IMPORTANT_RELEASES.search(n) and (n, r["date"]) not in seen:
                seen.add((n, r["date"]))
                out.append({"name": n, "date": r["date"]})
        return out[:30]
    except Exception as e:  # noqa
        print("  release calendar skipped:", str(e)[:100])
        return None


def macro(now):
    """Official statistics change monthly or weekly, so fetch them at most every 3 hours."""
    cache = read(STATE / "macro.json", {})
    if cache.get("at", 0) > now - 3 * 3600 and cache.get("rows"):
        return cache
    with ThreadPoolExecutor(6) as ex:
        rows = list(ex.map(macro_one, MACRO))
    old = {r["k"]: r for r in cache.get("rows", []) if not r.get("err")}
    rows = [old.get(r["k"], r) if r.get("err") else r for r in rows]     # a source is down: keep the last good number
    out = {"at": int(now), "rows": rows, "calendar": upcoming_releases(now) or cache.get("calendar")}
    write(STATE / "macro.json", out)
    return out


# ---------------- the day in 60 seconds ----------------
def ai_brief(top, conf):
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return None
    lang = conf.get("summary_language") or "English"
    lines = "\n".join(f'[{s["id"]}] ({s["cat"]}, {s["status"]}, {s["n"]} outlets) {s["title"]}' for s in top[:25])
    prompt = ("Below are today's most important news headlines, already ranked. Write 'The day in 60 seconds': 6 to 8 short lines that together give a busy "
              "reader the overall picture of the day across world, war, economy and markets, crypto, tech and anything else big. One line per story or theme, "
              "most important first, plain neutral language, no opinions, no predictions, and nothing that is not in the headlines. Every story here is already "
              f"confirmed by two or more newsrooms or an official source. Write in {lang}. Reply with JSON only: {{\"lines\":[{{\"text\":\"...\",\"ids\":[\"story id\"]}}]}}\n\n" + lines)
    body = json.dumps({"model": conf.get("summary_model") or "claude-haiku-5-5", "max_tokens": 900, "messages": [{"role": "user", "content": prompt}]}).encode()
    try:
        j = json.loads(get("https://api.anthropic.com/v1/messages", timeout=60, data=body,
                           headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", "Accept-Encoding": "identity"}))
        txt = "".join(b.get("text", "") for b in j.get("content", []))
        m = re.search(r"\{.*\}", txt, re.S)
        got = json.loads(m.group(0))["lines"] if m else []
        got = [{"text": str(x["text"])[:300], "ids": [str(i) for i in (x.get("ids") or [])][:3]} for x in got if x.get("text")][:8]
        return {"by": "ai", "lines": got} if got else None
    except Exception as e:  # noqa
        print("  AI summary skipped:", str(e)[:140])
        return None


def auto_brief(stories):
    lines, used = [], set()
    for s in stories:
        if s["cat"] in used or s["n"] < 1:
            continue
        used.add(s["cat"])
        lines.append({"text": s["title"], "ids": [s["id"]], "cat": s["cat"]})
        if len(lines) == 7:
            break
    return {"by": "auto", "lines": lines}


# ---------------- run ----------------
def run(verbose=True):
    conf = cfg()
    now = time.time()
    off = timedelta(hours=float(conf.get("utc_offset_hours", 0)))
    feeds = conf["feeds"]
    store = read(STATE / "items.json", {})
    health = {}
    with ThreadPoolExecutor(12) as ex:
        for feed, items, err, secs in ex.map(fetch, feeds):
            health[feed["name"]] = {"ok": not err, "n": len(items), "err": err, "s": secs, "cat": feed.get("cat"), "org": feed.get("org")}
            for it in items:
                old = store.get(it["link"])
                seen = old["seen"] if old else now
                ts = it.get("ts")
                if not ts or ts > now + 900:
                    ts = old["ts"] if old else seen
                if ts < now - KEEP_H * 3600:
                    continue
                fcat = feed.get("cat", "world")
                store[it["link"]] = {"title": it["title"], "d": it.get("desc", ""), "link": it["link"], "ts": ts, "seen": seen, "src": feed["name"], "org": feed.get("org") or feed["name"],
                                     "tier": feed.get("tier", "news"), "fcat": fcat, "cat": classify(it["title"], fcat)}
    store = {k: v for k, v in store.items() if v["ts"] >= now - KEEP_H * 3600}
    write(STATE / "items.json", store)

    stories = build(group(list(store.values())), conf, now)
    day = [s for s in stories if s["last"] >= now - 24 * 3600]
    unconfirmed = sum(1 for s in day if s["status"] == "UNCONFIRMED")
    if conf.get("verified_only", True):   # only stories confirmed by 2+ independent newsrooms, or from an official source
        day = [s for s in day if s["status"] != "UNCONFIRMED"]
    day.sort(key=lambda s: -s["score"])
    by = {k: [s for s in day if s["cat"] == k] for k in CATS}
    keep = []
    for k in CATS:
        keep += by[k][:40]
    keep += [s for s in day if s["home"] and s["cat"] != "home"][:20]
    seen_ids, final = set(), []
    for s in sorted(keep, key=lambda s: -s["score"]):
        if s["id"] not in seen_ids:
            seen_ids.add(s["id"])
            final.append(s)
    top, per = [], {}
    for s in day:
        if per.get(s["cat"], 0) >= TOP_CAP.get(s["cat"], 2):
            continue
        top.append(s["id"])
        per[s["cat"]] = per.get(s["cat"], 0) + 1
        if len(top) == 12:
            break

    # how loud each topic was, hour by hour (local time)
    h0 = int((now // 3600) * 3600) - 23 * 3600
    pulse = {k: [0] * 24 for k in CATS}
    for v in store.values():
        i = int((v["ts"] - h0) // 3600)
        if 0 <= i < 24:
            pulse[v["cat"]][i] += 1

    mk, fng = markets()
    mac = macro(now)

    # summary: AI when a key is set (refreshed at most every 45 min or when the top changes), otherwise built from the top stories
    prev = read(DATA / "today.json", {})
    pm = {m["k"]: m for m in prev.get("markets") or [] if m.get("p") is not None}
    mk = [pm.get(m["k"], m) if m.get("p") is None else m for m in mk]   # a price source is down: keep the last good number
    fng = fng or prev.get("fng")
    pb = prev.get("brief") or {}
    top_s = [s for s in final if s["id"] in top]
    top_s.sort(key=lambda s: top.index(s["id"]))
    brief = None
    if os.environ.get("ANTHROPIC_API_KEY"):
        if pb.get("by") == "ai" and now - pb.get("at", 0) < 45 * 60 and set(pb.get("top", [])) & set(top[:5]) == set(top[:5]):
            brief = pb
        else:
            brief = ai_brief(top_s + [s for s in day if s["id"] not in top][:13], conf)
    brief = brief or auto_brief(day)
    brief.setdefault("at", int(now))
    brief["top"] = top[:5]

    ok = sum(1 for h in health.values() if h["ok"])
    local_date = (datetime.fromtimestamp(now, timezone.utc) + off).strftime("%Y-%m-%d")
    out = {"updated": int(now), "date": local_date, "utc_offset_hours": float(conf.get("utc_offset_hours", 0)), "home_title": conf.get("home_title", "Home"),
           "home_countries": conf.get("home_countries", []), "watchlist_default": conf.get("watchlist_default", []),
           "stories": final, "top": top, "counts": {k: len(by[k]) for k in CATS}, "total": len(day), "unconfirmed_hidden": unconfirmed if conf.get("verified_only", True) else 0,
           "rule": "Shown only when 2+ independent newsrooms report it, or it comes from an official source",
           "outlets": len({o for s in day for o in s["orgs"]}), "reports": sum(len(s["reports"]) for s in day),
           "brief": brief, "markets": mk, "fng": fng, "macro": mac.get("rows", []), "calendar": mac.get("calendar"), "pulse": {"start": h0, "cats": pulse},
           "feeds": {"ok": ok, "total": len(feeds), "list": health}}
    write(DATA / "today.json", out)

    # archive: one file per local day, the best stories of that day
    day_start = (datetime.fromtimestamp(now, timezone.utc) + off).replace(hour=0, minute=0, second=0, microsecond=0) - off
    ds = day_start.timestamp()
    af = ARCH / f"{local_date}.json"
    old = read(af, {})
    keep_a = {s["id"]: s for s in old.get("stories", [])}
    for s in final:
        if s["last"] >= ds:
            o = keep_a.get(s["id"])
            if not o or s["score"] >= o.get("peak", o["score"]) - 0.01 or s["n"] >= o["n"]:
                s2 = dict(s)
                s2["peak"] = max(s["score"], (o or {}).get("peak", 0))
                keep_a[s["id"]] = s2
    arch_stories = sorted(keep_a.values(), key=lambda s: -s.get("peak", s["score"]))[:120]
    write(af, {"date": local_date, "updated": int(now), "stories": arch_stories, "brief": brief, "markets": mk, "fng": fng,
               "counts": {k: len([s for s in arch_stories if s["cat"] == k]) for k in CATS}, "home_title": out["home_title"], "home_countries": out["home_countries"]})
    days = sorted((p.stem for p in ARCH.glob("20??-??-??.json")), reverse=True)
    write(ARCH / "index.json", {"days": days})

    msg = f"{len(day)} stories today from {out['outlets']} outlets · {ok}/{len(feeds)} sources OK · summary: {brief['by']}"
    if verbose:
        print(time.strftime("%H:%M:%S"), msg, flush=True)
        bad = [n for n, h in health.items() if not h["ok"]]
        if bad:
            print("  not reachable now:", ", ".join(bad[:12]) + (" ..." if len(bad) > 12 else ""), flush=True)
    return msg


if __name__ == "__main__":
    run()
