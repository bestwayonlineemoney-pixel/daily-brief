"""
The Daily Brief - trader layer.

Adds, on top of the news collector:
  * sentiment / impact score / affected assets for every story (keyword rules; Claude refines it when a key is set)
  * "Why is it moving?": 15-minute candles for BTC, ETH, SOL, big moves found, and the news published around each move
  * derivatives pulse: funding, open interest (and its 24h change), long/short ratio, a positioning signal
  * market regime (risk-on / risk-off / chop), the 3 key drivers, narrative velocity
  * high-impact events: upcoming FOMC meetings (Federal Reserve calendar) and official releases out today
  * optional Telegram / Discord alerts for high-impact stories
Standard library only. Every source is optional: when one is down the rest still works.
"""
import json
import os
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

NET = {}


def setup(get, get_json, read, write, state, arch=None, lang=None):
    NET.update(get=get, get_json=get_json, read=read, write=write, state=state, arch=arch, lang=lang)


def _get(url, **kw):
    return NET["get"](url, **kw)


def _json(url, **kw):
    return NET["get_json"](url, **kw)


# ---------------- sentiment, impact, assets ----------------
BULL = {"surge": 2, "soar": 2, "rall": 2, "record high": 2, "all-time high": 3, "approv": 3, "inflow": 2, "adopt": 2, "beat": 1, "upgrade": 1,
        "rate cut": 2, "cuts rate": 2, "eases": 1, "stimulus": 2, "ceasefire": 2, "peace": 1, "deal": 1, "jump": 1, "rebound": 2, "gain": 1, "climb": 1,
        "tops $": 1, "above $": 1, "breaks out": 2, "buy": 1, "accumulat": 2, "reserve": 1, "green light": 2, "wins": 1, "launch": 1, "partnership": 1}
BEAR = {"plunge": 3, "crash": 3, "slump": 2, "tumble": 2, "falls": 1, "drop": 1, "slide": 1, "hack": 3, "exploit": 3, "stolen": 3, "drain": 2,
        "ban": 2, "lawsuit": 2, "sues": 2, "probe": 1, "investigat": 1, "outflow": 2, "liquidat": 2, "sell-off": 2, "selloff": 2, "rate hike": 2,
        "hikes rate": 2, "hotter": 2, "tariff": 1, "sanction": 1, "war ": 1, "missile": 2, "airstrike": 1, "drone strike": 1, "attack": 2, "default": 3, "bankrupt": 3,
        "fraud": 2, "arrest": 1, "delay": 1, "reject": 2, "warns": 1, "fear": 1, "recession": 2, "shutdown": 1, "halt": 1, "closure": 1, "escalat": 2, "below $": 1}
HAWK = re.compile(r"not a done deal|cools? .*cut|fewer (rate )?cuts|no rush|pushes? back .*cut|delay\w* .*cut|trim\w* (bets on )?.*cut|hawkish|higher for longer", re.I)
CRITICAL = re.compile(r"\b(etfs?|hack|exploit|rate cut|rate hike|cpi|inflation data|fomc|fed decision|liquidation|sec|ban|approv\w*|default|"
                      r"bankrupt\w*|jobs report|payrolls|nonfarm|tariffs?|hormuz|invasion|nuclear|emergency)\b", re.I)
ASSETS = [("BTC", r"\bbitcoin|\bbtc\b"), ("ETH", r"\bether(eum)?\b|\beth\b"), ("SOL", r"\bsolana\b|\bsol\b"), ("XRP", r"\bxrp\b|\bripple\b"),
          ("OIL", r"\boil\b|\bcrude\b|\bbrent\b|\bopec|\bhormuz|\btanker"), ("GAS", r"natural gas|\blng\b"), ("GOLD", r"\bgold\b|\bbullion\b"),
          ("DXY", r"\bdollar\b|\bfed\b|federal reserve|\btreasur|\byields?\b|\bpowell"), ("SPX", r"\bstocks?\b|s&p|nasdaq|wall street|\bdow\b|\bequit"),
          ("EUR", r"\beuro\b|\becb\b"), ("JPY", r"\byen\b|\bboj\b"), ("LKR", r"sri lanka.*(rupee|cbsl|imf)|\brupee\b")]
ASSETS = [(k, re.compile(p, re.I)) for k, p in ASSETS]
MACRO_HIT = re.compile(r"\b(cpi|inflation|fomc|fed|federal reserve|rate decision|interest rates?|payrolls|jobs report|nonfarm|unemployment|gdp|ecb|bank of england|boj|powell|lagarde)\b", re.I)

WHY = [  # (pattern, the one-line "why it matters")
    (r"etf.*(inflow|record|approv)|(inflow|approv).*etf", "ETF demand means fresh spot buying, usually supportive for price."),
    (r"etf.*outflow|outflow.*etf", "ETF outflows mean funds are selling, a drag on price."),
    (r"\bapprov\w*\b.*\b(sec|etf)|\bsec\b.*\bapprov", "A regulator's approval opens the door to new money from funds and institutions."),
    (r"hack|exploit|stolen|drain", "Hacks hit confidence and can trigger quick sell-offs in the affected tokens."),
    (r"rate hike|hikes rates?|hawkish|not a done deal|cools.*cut|fewer (rate )?cuts|no rush|pushes? back|delay\w* .*cut|trim\w* .*cut", "Fewer or later rate cuts keep money tight: a headwind for crypto and stocks, support for the dollar."),
    (r"rate cut|cuts rates?|dovish", "Cheaper money tends to lift risk assets like crypto and stocks, and weaken the dollar."),
    (r"\bcpi\b|inflation", "Inflation data moves rate expectations, which move the dollar, yields and crypto."),
    (r"payrolls|jobs report|unemployment|jobless", "Jobs data shapes the Fed's next move, so markets swing on surprises."),
    (r"hormuz|tanker|oil.*(jump|surge|soar)|opec", "Higher oil can revive inflation fears and lift the dollar, a headwind for risk assets."),
    (r"ceasefire|peace talks|talks", "Progress toward peace lowers risk premiums and usually helps risk assets."),
    (r"earthquake|tsunami|hurricane|typhoon|cyclone|flood|wildfire", "Natural disasters can disrupt local economies, supply chains and insurers."),
    (r"missile|airstrike|air strike|drone strike|military|attack|invasion|escalat|\bwar\b", "Escalation pushes money to safety (dollar, gold) and away from risk."),
    (r"tariff|trade war|sanction", "Trade barriers raise costs and uncertainty, usually weighing on risk assets."),
    (r"liquidat", "Forced liquidations add to the move and show how crowded positioning was."),
    (r"\bsec\b|lawsuit|sues|regulat|ban\b", "Regulatory action changes who can buy and hold, so it moves prices."),
    (r"stablecoin|tether|circle", "Stablecoin supply is the cash on the sidelines of crypto: growth means more buying power."),
    (r"strategy|microstrategy|treasury company|buys .*bitcoin|reserve", "Corporate and government buying removes coins from the market."),
    (r"gold", "Gold reflects the mood on safety, the dollar and real interest rates."),
    (r"dollar|yields?|treasur", "A stronger dollar and higher yields usually press on crypto and gold."),
    (r"nvidia|\bai\b|chip", "AI and chip news drives tech stocks, which crypto often trades alongside."),
    (r"election|coalition|congress|senate", "Politics shapes future rules for taxes, spending and crypto."),
]
WHY = [(re.compile(p, re.I), t) for p, t in WHY]


def tag_story(s):
    text = (s["title"] + " " + (s.get("dek") or "") + " " + " ".join(r["t"] for r in s.get("reports", [])[:6])).lower()
    b = sum(w for k, w in BULL.items() if k in text)
    br = sum(w for k, w in BEAR.items() if k in text)
    if HAWK.search(text):            # "rate cut is not a done deal", "traders trim bets on a cut": tighter money, not looser
        b -= BULL["rate cut"] if "rate cut" in text else 0
        br += 3
    sent = "BULLISH" if b - br >= 2 else "BEARISH" if br - b >= 2 else "NEUTRAL"
    # impact 1..10: who (official), how many, how fast, what (critical words), how big (hot words)
    n = s.get("n", 1)
    first_hour = sum(1 for r in s.get("reports", []) if r["ts"] <= s["first"] + 3600)
    crit = len(set(m.group(0).lower() for m in CRITICAL.finditer(text)))
    imp = 1 + (3 if s.get("status") == "OFFICIAL" else 0) + min(3, n - 1) + (1 if first_hour >= 3 else 0) + min(2, crit) + (1 if s.get("hot", 0) >= 5 else 0)
    if s.get("breaking"):
        imp += 1
    assets = [k for k, rx in ASSETS if rx.search(text)][:4]
    why = next((t for rx, t in WHY if rx.search(text)), "")
    s.update(sentiment=sent, impact=max(1, min(10, imp)), assets=assets, why=why, macro=bool(MACRO_HIT.search(text)))
    return s


def ai_tags(stories, now):
    """Optional: an AI model (Gemini or Claude) reads the top headlines and refines sentiment and the one-line 'why it matters'. Cached per story."""
    try:
        import ai
    except Exception:  # noqa
        return 0
    if not ai.provider():
        return 0
    cache = NET["read"](NET["state"] / "ai_tags.json", {})
    last_call = cache.pop("__last", {}).get("at", 0) if isinstance(cache.get("__last"), dict) else 0
    cache = {k: v for k, v in cache.items() if isinstance(v, dict) and v.get("at", 0) > now - 3 * 86400}
    todo = [s for s in stories[:40] if s["id"] not in cache][:25]
    if todo and (len(todo) >= 5 or now - last_call > 30 * 60):        # batch new stories: at most one call per run, small ones every 30 min
        cache["__last"] = {"at": now}
        lines = "\n".join(f'[{s["id"]}] {s["title"]}' + (f' — {s["dek"][:160]}' if s.get("dek") else "") for s in todo)
        prompt = ("For each confirmed news headline below, judge its likely effect on crypto and other risk assets today. Reply with JSON only: "
                  '{"items":[{"id":"...","sentiment":"BULLISH|BEARISH|NEUTRAL","why":"one plain sentence, max 18 words, on why it matters for prices"}]}. '
                  "Be neutral and factual; NEUTRAL when unclear.\n\n" + lines)
        try:
            j, label = ai.ask_json(prompt, 2500)
            print("  AI tags by", label, flush=True)
            for it in j.get("items", []):
                if it.get("id") and it.get("sentiment") in ("BULLISH", "BEARISH", "NEUTRAL"):
                    cache[str(it["id"])] = {"sentiment": it["sentiment"], "why": str(it.get("why", ""))[:200], "at": now}
        except Exception as e:  # noqa
            print("  AI tags skipped:", str(e)[:240])
        NET["write"](NET["state"] / "ai_tags.json", cache)
    else:
        cache["__last"] = {"at": last_call}
        NET["write"](NET["state"] / "ai_tags.json", cache)
    used = 0
    for s in stories:
        c = cache.get(s["id"])
        if c:
            s["sentiment"] = c["sentiment"]
            if c.get("why"):
                s["why"] = c["why"]
            s["ai"] = True
            used += 1
    return used


# ---------------- price candles + "why is it moving?" ----------------
COINS = [("BTC", "BTC-USD", "bitcoin"), ("ETH", "ETH-USD", "ethereum"), ("SOL", "SOL-USD", "solana")]


def candles(sym, product, cg_id, now):
    """15-minute candles (time, close, open, high, low, volume) for the last ~3 days: Coinbase Exchange, CoinGecko as backup."""
    try:
        rows = _json(f"https://api.exchange.coinbase.com/products/{product}/candles?granularity=900", timeout=20)
        bars = sorted((int(r[0]), float(r[4]), float(r[3]), float(r[2]), float(r[1]), float(r[5])) for r in rows)
        if len([b for b in bars if b[0] >= now - 24 * 3600]) > 40:
            return bars, "Coinbase"
    except Exception:  # noqa
        pass
    try:
        j = _json(f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart?vs_currency=usd&days=2", timeout=20)
        raw = [(int(t / 1000), float(p)) for t, p in j["prices"]]
        bars, last = [], 0
        for t, p in raw:                              # thin 5-minute points to 15 minutes
            if t - last >= 870:
                bars.append((t, p, p, p, p, 0.0))
                last = t
        if len(bars) > 40:
            return bars, "CoinGecko"
    except Exception:  # noqa
        pass
    return [], None


def find_moves(pts):
    """Big moves: 1-hour change >= 1.5% or 4-hour change >= 3%; when the day is calm, the 3 largest 1-hour moves >= 0.6%."""
    moves = []
    for i in range(len(pts)):
        for bars, lim in ((4, 1.5), (16, 3.0)):
            if i - bars < 0:
                continue
            ch = (pts[i][1] / pts[i - bars][1] - 1) * 100
            if abs(ch) >= lim:
                moves.append({"t": pts[i][0], "t0": pts[i - bars][0], "chg": round(ch, 2), "p": pts[i][1], "w": bars // 4})
    if not moves:
        cand = []
        for i in range(4, len(pts)):
            ch = (pts[i][1] / pts[i - 4][1] - 1) * 100
            if abs(ch) >= 0.6:
                cand.append({"t": pts[i][0], "t0": pts[i - 4][0], "chg": round(ch, 2), "p": pts[i][1], "w": 1, "minor": True})
        moves = sorted(cand, key=lambda m: -abs(m["chg"]))[:8]
    # keep the strongest move in each 2-hour window
    moves.sort(key=lambda m: -abs(m["chg"]))
    kept = []
    for m in moves:
        if all(abs(m["t"] - k["t"]) > 7200 for k in kept):
            kept.append(m)
    return sorted(kept[:6], key=lambda m: m["t"])


def relevant(s, sym):
    """Is this story the kind that moves this market?"""
    a = set(s.get("assets", []))
    if sym in ("BTC", "ETH", "SOL"):
        return sym in a or s["cat"] == "crypto" or bool(a & {"BTC", "DXY", "SPX"}) or (s.get("macro") and s.get("impact", 0) >= 6)
    if sym == "GOLD":
        return "GOLD" in a or bool(a & {"DXY", "OIL"}) or s["cat"] in ("war", "commodities") or s.get("macro")
    if sym == "SPX":
        return "SPX" in a or "DXY" in a or s.get("macro") or (s["cat"] in ("tech", "economy", "war", "energy") and s.get("impact", 0) >= 6)
    if sym == "OIL":
        return bool(a & {"OIL", "GAS"}) or s["cat"] == "energy" or (s["cat"] == "war" and s.get("impact", 0) >= 5) or (s.get("macro") and s.get("impact", 0) >= 7)
    return False


def match_news(move, sym, stories):
    """The highest-impact confirmed story with a report within ±90 minutes of the move."""
    lo, hi = move["t0"] - 5400, move["t"] + 5400
    best, best_s = None, 0
    for s in stories:
        if not relevant(s, sym):
            continue
        hits = [r["ts"] for r in s.get("reports", []) if lo <= r["ts"] <= hi]
        if not hits:
            continue
        near = min(abs(h - move["t"]) for h in hits)
        sc = s.get("impact", 1) * 2 + (3 if sym in s.get("assets", []) else 0) - near / 3600 \
            + (1 if (s.get("sentiment") == "BULLISH") == (move["chg"] > 0) and s.get("sentiment") != "NEUTRAL" else 0)
        if sc > best_s:
            best, best_s = s, sc
    return best


def yahoo_intraday(sym, now):
    """15-minute candles from Yahoo Finance (exchange data, about 15 minutes delayed), last 5 days: (time, close, open, high, low, volume)."""
    for host in ("query1", "query2"):
        try:
            j = _json(f"https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(sym)}?range=5d&interval=15m", timeout=20)
            r = j["chart"]["result"][0]
            q = r["indicators"]["quote"][0]
            n = len(r["timestamp"])
            col = lambda k: (q.get(k) or [None] * n) + [None] * max(0, n - len(q.get(k) or []))  # noqa
            bars = []
            for t, c, o, h, lo, v in zip(r["timestamp"], col("close"), col("open"), col("high"), col("low"), col("volume")):
                if c is None:
                    continue
                o, h, lo = (o if o is not None else c), (h if h is not None else c), (lo if lo is not None else c)
                bars.append((int(t), float(c), float(o), float(max(h, o, c)), float(min(lo, o, c)), float(v or 0)))
            if bars:
                return bars, "Yahoo Finance · 15-min delay"
        except Exception:  # noqa
            continue
    return [], None


def day_window(bars, now):
    """The last 24 hours; for markets that were shut (weekends, stocks overnight), the last 60 bars."""
    day = [b for b in bars if b[0] >= now - 24 * 3600]
    return day if len(day) >= 24 else bars[-60:]


def levels(day, prev):
    """Key levels traders watch: 24h high/low and open, the previous window's high/low/close, the volume-weighted average price, ranges."""
    hi, lo, op = max(b[3] for b in day), min(b[4] for b in day), day[0][2]
    vol = sum(b[5] for b in day)
    out = {"hi24": hi, "lo24": lo, "open24": op, "rng": round((hi - lo) / op * 100, 2) if op else None}
    if vol > 0:
        out["vwap"] = sum((b[3] + b[4] + b[1]) / 3 * b[5] for b in day) / vol
    if len(prev) >= 8:
        ph, pl = max(b[3] for b in prev), min(b[4] for b in prev)
        out.update(pdh=ph, pdl=pl, pdc=prev[-1][1], prng=round((ph - pl) / prev[0][2] * 100, 2) if prev[0][2] else None)
    nd = 2 if day[-1][1] > 10 else 4
    return {k: (round(v, nd) if isinstance(v, float) and k not in ("rng", "prng") else v) for k, v in out.items()}


def price_at(pts, t):
    best = None
    for p in pts:
        if p[0] <= t:
            best = p[1]
        else:
            break
    return best if best is not None else (pts[0][1] if pts else None)


def markers(sym, pts, moves, stories):
    """News pins for the chart: the important confirmed stories for this market, placed when they broke."""
    if not pts:
        return []
    t0, t1 = pts[0][0], pts[-1][0]
    cand = {}
    for m in moves:                                  # stories that came out around a big move
        st = next((s for s in stories if s["id"] == m.get("story")), None)
        if st:
            near = min((r["ts"] for r in st.get("reports", []) if t0 <= r["ts"] <= t1), key=lambda ts: abs(ts - m["t"]), default=None)
            if near:
                cand[st["id"]] = (st, near, m)
    for st in stories:                               # plus the big stories of the day for this market
        if st["id"] in cand or st.get("impact", 0) < 6 or not relevant(st, sym):
            continue
        ts = [r["ts"] for r in st.get("reports", []) if t0 <= r["ts"] <= t1]
        if ts:
            cand[st["id"]] = (st, min(ts), None)
    chosen = sorted(cand.values(), key=lambda x: -(x[0].get("impact", 0) + (3 if x[2] else 0)))
    keep = []
    for st, t, m in chosen:
        if all(abs(t - k[1]) > 40 * 60 for k in keep):
            keep.append((st, t, m))
        if len(keep) == 8:
            break
    out = []
    for st, t, m in sorted(keep, key=lambda k: k[1]):
        p0, p1 = price_at(pts, t), price_at(pts, t + 3600)
        out.append({"t": t, "story": st["id"], "p": p0, "p1h": p1 if t + 3600 <= t1 else None,
                    "chg1h": round((p1 / p0 - 1) * 100, 2) if p0 and p1 and t + 3600 <= t1 else None, "move": m["chg"] if m else None})
    return out


def thin(v, n=48):
    if len(v) <= n:
        return v
    step = len(v) / n
    return [v[int(i * step)] for i in range(n)] + [v[-1]]


def catalysts(stories, now):
    """Price x news for each chart: 15-minute candles, key levels, big moves and the confirmed news around them.
    Also returns 24h sparklines for the price bar (including the dollar index and the 10-year yield)."""
    out, sparks = {}, {}
    jobs = [(c[0], (lambda c=c: candles(c[1], c[1], c[2], now))) for c in COINS] + \
           [("GOLD", lambda: yahoo_intraday("GC=F", now)), ("SPX", lambda: yahoo_intraday("^GSPC", now)), ("OIL", lambda: yahoo_intraday("BZ=F", now)),
            ("DXY", lambda: yahoo_intraday("DX-Y.NYB", now)), ("TNX", lambda: yahoo_intraday("^TNX", now))]
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(lambda j: (j[0], j[1]()), jobs))
    for sym, (bars, src) in res:
        if not bars or len(bars) < 12:
            continue
        day = day_window(bars, now)
        sparks[sym] = [round(b[1], 4) for b in thin(day)]
        if sym in ("DXY", "TNX"):
            continue
        prev = [b for b in bars if b[0] < day[0][0]][-len(day):]
        pts = [(b[0], b[1]) for b in day]
        moves = find_moves(pts) if sym in ("BTC", "ETH", "SOL") else [m for m in find_moves(pts) if abs(m["chg"]) >= 0.4]
        for m in moves:
            st = match_news(m, sym, stories)
            m["story"] = st["id"] if st else None
        nd = 2 if pts[-1][1] > 10 else 4
        vd = 4 if sym in ("BTC", "ETH") else 2
        out[sym] = {"src": src, "pts": [[b[0], round(b[1], nd), round(b[2], nd), round(b[3], nd), round(b[4], nd), round(b[5], vd)] for b in day],
                    "moves": moves, "news": markers(sym, pts, moves, stories),
                    "chg24": round((day[-1][1] / (prev[-1][1] if prev and sym in ("GOLD", "SPX", "OIL") else day[0][2]) - 1) * 100, 2),
                    "hi": max(b[3] for b in day), "lo": min(b[4] for b in day), "lv": levels(day, prev), "live": sym in ("BTC", "ETH", "SOL")}
    return out, sparks


# ---------------- derivatives & positioning ----------------
def _okx(sym):
    inst = f"{sym}-USDT-SWAP"
    fr = _json(f"https://www.okx.com/api/v5/public/funding-rate?instId={inst}", timeout=15)["data"][0]
    oi = _json(f"https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId={inst}", timeout=15)["data"][0]
    d = {"funding": float(fr["fundingRate"]) * 100, "next": int(fr.get("nextFundingTime") or fr.get("fundingTime") or 0) // 1000, "oi_coin": float(oi["oiCcy"]),
         "src": "OKX"}
    try:
        ls = _json(f"https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy={sym}&period=1H", timeout=15)["data"]
        d["ls"] = float(ls[0][1])
        d["ls_src"] = "OKX accounts"
    except Exception:  # noqa
        pass
    try:
        h = _json(f"https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy={sym}&period=1H", timeout=15)["data"]
        if len(h) > 24:
            d["oi_chg"] = (float(h[0][1]) / float(h[24][1]) - 1) * 100
            d["oi_spark"] = [round(float(x[1]) / 1e6, 1) for x in reversed(h[:25])]       # USD millions, oldest first
        if len(h) > 168:
            d["oi_chg7"] = (float(h[0][1]) / float(h[168][1]) - 1) * 100
    except Exception:  # noqa
        pass
    try:   # orderflow: who is hitting the market - taker buys vs taker sells, USD, hourly, last 24h
        tv = _json(f"https://www.okx.com/api/v5/rubik/stat/taker-volume-contract?instId={inst}&period=1H&unit=2&limit=24", timeout=15)["data"]
        rows = sorted((int(r[0]) // 1000, float(r[1]), float(r[2])) for r in tv)          # (ts, sell, buy)
        if rows:
            cvd, acc = [], 0.0
            for _, s, b in rows:
                acc += b - s
                cvd.append(round(acc / 1e6, 1))
            d["flow"] = {"buy": round(sum(r[2] for r in rows)), "sell": round(sum(r[1] for r in rows)), "buy1h": round(rows[-1][2]), "sell1h": round(rows[-1][1]),
                         "cvd": cvd, "h": len(rows), "src": "OKX taker volume"}
    except Exception:  # noqa
        pass
    return d


LIQ_CT = {}


def _okx_liqs(sym, db, now):
    """Liquidations on OKX USDT perpetuals, kept in our own 24h memory (OKX serves the last day page by page)."""
    fam = f"{sym}-USDT"
    if sym not in LIQ_CT:
        LIQ_CT[sym] = float(_json(f"https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId={fam}-SWAP", timeout=15)["data"][0]["ctVal"])
    ct = LIQ_CT[sym]
    rec = db.get(sym) or {}
    ev = rec.get("ev", [])
    seen = {(e[0], e[3], e[2]) for e in ev}
    newest = max((e[0] for e in ev), default=0)
    cutoff = int((now - 24 * 3600) * 1000)
    after, pages, oldest_fetched, reached = None, 0, None, False
    max_pages = 40 if not ev else 12
    while pages < max_pages:
        url = f"https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&instFamily={fam}&state=filled&limit=100" + (f"&after={after}" if after else "")
        data = _json(url, timeout=15).get("data") or []
        det = data[0].get("details", []) if data else []
        if not det:
            reached = True
            break
        stop = False
        for x in det:
            ts = int(x["ts"])
            if ts <= newest or ts < cutoff:
                stop = True
                continue
            px, sz = float(x.get("bkPx") or 0), float(x.get("sz") or 0)
            usd = round(sz * ct * px)
            ps = x.get("posSide")
            side = "L" if ps == "long" or (ps not in ("long", "short") and x.get("side") == "sell") else "S"
            k = (ts, px, usd)
            if k not in seen and usd > 0:
                seen.add(k)
                ev.append([ts, side, usd, px])
        after = det[-1]["ts"]
        oldest_fetched = int(after)
        pages += 1
        if stop or int(after) < cutoff:
            reached = True
            break
    ev = sorted((e for e in ev if e[0] >= cutoff), key=lambda e: e[0])[-20000:]
    since = rec.get("since")
    if not since or not rec.get("ev"):
        since = cutoff // 1000 if reached else (oldest_fetched or int(now * 1000)) // 1000
    since = max(since, cutoff // 1000)
    db[sym] = {"ev": ev, "since": since}
    t1h = int((now - 3600) * 1000)
    hours = [[0, 0] for _ in range(24)]
    for e in ev:
        i = min(23, max(0, int((e[0] / 1000 - (now - 24 * 3600)) // 3600)))
        hours[i][0 if e[1] == "L" else 1] += e[2]
    big = max(ev, key=lambda e: e[2]) if ev else None
    return {"long": sum(e[2] for e in ev if e[1] == "L"), "short": sum(e[2] for e in ev if e[1] == "S"), "n": len(ev),
            "long1h": sum(e[2] for e in ev if e[1] == "L" and e[0] >= t1h), "short1h": sum(e[2] for e in ev if e[1] == "S" and e[0] >= t1h),
            "big": {"usd": big[2], "side": big[1], "px": big[3], "t": big[0] // 1000} if big else None,
            "hours": hours, "cover_h": round(min(24, (now - since) / 3600), 1), "src": "OKX USDT perps", "pages": pages}


def liquidations(now):
    db = NET["read"](NET["state"] / "liqs.json", {})
    out = {}

    def one(sym):
        try:
            return sym, _okx_liqs(sym, db, now)
        except Exception as e:  # noqa
            return sym, {"err": str(e)[:80]}
    with ThreadPoolExecutor(3) as ex:
        for sym, r in ex.map(one, ("BTC", "ETH", "SOL")):
            out[sym] = r
    NET["write"](NET["state"] / "liqs.json", db)
    return out


def _binance(sym):
    s = f"{sym}USDT"
    pi = _json(f"https://fapi.binance.com/fapi/v1/premiumIndex?symbol={s}", timeout=12)
    oi = _json(f"https://fapi.binance.com/fapi/v1/openInterest?symbol={s}", timeout=12)
    d = {"funding": float(pi["lastFundingRate"]) * 100, "next": int(pi["nextFundingTime"]) // 1000, "oi_coin": float(oi["openInterest"]), "src": "Binance"}
    try:
        ls = _json(f"https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol={s}&period=1h&limit=1", timeout=12)
        d["ls"] = float(ls[-1]["longShortRatio"])
        d["ls_src"] = "Binance accounts"
        hist = _json(f"https://fapi.binance.com/futures/data/openInterestHist?symbol={s}&period=1h&limit=25", timeout=12)
        d["oi_chg"] = (float(hist[-1]["sumOpenInterest"]) / float(hist[0]["sumOpenInterest"]) - 1) * 100
    except Exception:  # noqa
        pass
    return d


def _bybit(sym):
    t = _json(f"https://api.bybit.com/v5/market/tickers?category=linear&symbol={sym}USDT", timeout=12)["result"]["list"][0]
    d = {"funding": float(t["fundingRate"]) * 100, "next": int(t["nextFundingTime"]) // 1000, "oi_coin": float(t["openInterest"]), "src": "Bybit"}
    try:
        r = _json(f"https://api.bybit.com/v5/market/account-ratio?category=linear&symbol={sym}USDT&period=1h&limit=1", timeout=12)["result"]["list"][0]
        d["ls"] = float(r["buyRatio"]) / max(1e-9, float(r["sellRatio"]))
        d["ls_src"] = "Bybit accounts"
    except Exception:  # noqa
        pass
    return d


_HL = {}


def _hyperliquid(sym):
    if "ctx" not in _HL:
        req = urllib.request.Request("https://api.hyperliquid.xyz/info", data=json.dumps({"type": "metaAndAssetCtxs"}).encode(),
                                     headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            meta, ctxs = json.loads(r.read())
        _HL["ctx"] = {u["name"]: c for u, c in zip(meta["universe"], ctxs)}
    c = _HL["ctx"][sym]
    return {"funding": float(c["funding"]) * 100 * 8, "oi_coin": float(c["openInterest"]), "src": "Hyperliquid", "note": "hourly funding ×8"}


def _kraken(sym):
    if "k" not in _HL:
        _HL["k"] = {t["symbol"]: t for t in _json("https://futures.kraken.com/derivatives/api/v3/tickers", timeout=15)["tickers"]}
    t = _HL["k"]["PF_" + {"BTC": "XBT"}.get(sym, sym) + "USD"]
    fr = float(t.get("fundingRate", 0)) / max(1e-9, float(t.get("markPrice", 1))) * 100 * 8   # Kraken quotes funding in USD per contract per hour
    return {"funding": fr, "oi_coin": float(t.get("openInterest", 0)), "src": "Kraken Futures", "note": "hourly funding ×8"}


def derivatives(prices, chg24, now):
    hist = NET["read"](NET["state"] / "oi_hist.json", {})
    out, srcs = {}, set()
    for sym in ("BTC", "ETH", "SOL"):
        d, errs = None, []
        for f in (_okx, _binance, _bybit, _hyperliquid, _kraken):
            try:
                d = f(sym)
                break
            except Exception as e:  # noqa
                errs.append(f"{f.__name__[1:]}: {str(e)[:40]}")
        if not d:
            out[sym] = {"err": "; ".join(errs)[:200]}
            continue
        if "ls" not in d:                                # long/short ratio from a second venue when the first has none
            for f in (_okx, _binance, _bybit):
                try:
                    x = f(sym)
                    if "ls" in x:
                        d["ls"], d["ls_src"] = x["ls"], x["ls_src"]
                        break
                except Exception:  # noqa
                    continue
        p = prices.get(sym)
        d["oi_usd"] = d["oi_coin"] * p if p else None
        h = [x for x in hist.get(sym, []) if x[0] > now - 30 * 3600] + [[int(now), d["oi_coin"], d["src"]]]
        hist[sym] = h[-200:]
        if "oi_chg" not in d:                            # 24h change from our own snapshots, same venue only
            old = [x for x in h if x[2] == d["src"] and now - 26 * 3600 <= x[0] <= now - 22 * 3600]
            if old:
                d["oi_chg"] = (d["oi_coin"] / old[0][1] - 1) * 100
        d["signal"], d["why"] = signal(d, chg24.get(sym))
        out[sym] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in d.items()}
        srcs.add(d["src"])
    NET["write"](NET["state"] / "oi_hist.json", hist)
    return out


def signal(d, px):
    f, ls, oi = d.get("funding"), d.get("ls"), d.get("oi_chg")
    px = px or 0
    if f is not None and f >= 0.03 and (ls or 0) >= 1.8:
        return "Crowded longs · squeeze risk", "Longs pay high funding and outnumber shorts; a dip can force them to sell."
    if f is not None and f <= -0.01 and (ls is None or ls <= 1.0):
        return "Short squeeze setup", "Shorts are paying to hold; a push higher can force them to buy back."
    if px >= 2 and (oi is None or oi <= 3) and (f is None or f < 0.02):
        return "Healthy spot-driven trend", "Price is rising without a build-up of leverage."
    if px <= -2 and (oi or 0) >= 3:
        return "Shorts pressing", "Price is falling while new positions open: sellers are adding leverage."
    if (oi or 0) >= 8:
        return "Leverage building", "Open interest jumped; expect bigger moves either way."
    return "Neutral · balanced", "Funding and positioning are not stretched."


# ---------------- market regime, drivers, narratives ----------------
def regime(mk, fng):
    m = {x["k"]: x for x in mk if x.get("p") is not None}
    sc, why = 0, []

    def add(cond_pos, cond_neg, txt_pos, txt_neg):
        nonlocal sc
        if cond_pos:
            sc += 1
            why.append(["+", txt_pos])
        elif cond_neg:
            sc -= 1
            why.append(["-", txt_neg])
    b, d, s, v = (m.get(k, {}).get("chg") for k in ("btc", "dxy", "spx", "vix"))
    if b is not None:
        add(b >= 2, b <= -2, f"Bitcoin {b:+.1f}% in 24h", f"Bitcoin {b:+.1f}% in 24h")
    if fng:
        add(fng["v"] >= 60, fng["v"] <= 40, f"Fear & Greed {fng['v']} ({fng['label']})", f"Fear & Greed {fng['v']} ({fng['label']})")
    if d is not None:
        add(d <= -0.25, d >= 0.25, f"Dollar weaker ({d:+.2f}%)", f"Dollar stronger ({d:+.2f}%)")
    if s is not None:
        add(s >= 0.5, s <= -0.5, f"S&P 500 {s:+.2f}%", f"S&P 500 {s:+.2f}%")
    if v is not None:
        add(v <= -5, v >= 5, f"VIX falling ({v:+.1f}%)", f"VIX rising ({v:+.1f}%)")
    label = "RISK-ON" if sc >= 2 else "RISK-OFF" if sc <= -2 else "CHOP / CONSOLIDATION"
    return {"label": label, "score": sc, "why": why}


NARR = [("Bitcoin & ETFs", r"bitcoin|\bbtc\b|\betfs?\b|strategy|microstrategy|blackrock"), ("AI & Tech", r"\bai\b|artificial intelligence|nvidia|openai|anthropic|chip|semiconductor"),
        ("DeFi & Altcoins", r"defi|ether|\beth\b|solana|\bxrp\b|altcoin|token|memecoin|stablecoin"), ("Regulation & SEC", r"\bsec\b|regulat|\blaw\b|\bbill\b|lawsuit|licen|\bban\b|cftc"),
        ("Macro & Rates", r"\bfed\b|rate cut|rate hike|inflation|\bcpi\b|jobs|payroll|yields?|treasur|ecb|recession|gdp|dollar"),
        ("Geopolitics & Oil", r"oil|hormuz|opec|war\b|missile|strike|ceasefire|sanction|tariff|iran|ukraine|russia|israel|gaza")]
NARR = [(n, re.compile(p, re.I)) for n, p in NARR]


def narratives(stories, now):
    out = []
    for name, rx in NARR:
        L = [s for s in stories if rx.search(s["title"] + " " + (s.get("dek") or ""))]
        recent = sum(1 for s in L for r in s.get("reports", []) if r["ts"] >= now - 6 * 3600)
        older = sum(1 for s in L for r in s.get("reports", []) if now - 24 * 3600 <= r["ts"] < now - 6 * 3600)
        vel = recent / 6 - older / 18                      # reports per hour now vs earlier today
        heat = recent * 1.0 + sum(s.get("impact", 1) for s in L) * 0.5
        sent = sum(1 if s.get("sentiment") == "BULLISH" else -1 if s.get("sentiment") == "BEARISH" else 0 for s in L)
        out.append({"name": name, "stories": len(L), "recent": recent, "vel": round(vel, 2), "heat": round(heat, 1), "tone": sent,
                    "ids": [s["id"] for s in sorted(L, key=lambda s: -s.get("impact", 1))][:8]})
    mx = max([n["heat"] for n in out] + [1])
    for n in out:
        n["pct"] = round(n["heat"] / mx * 100)
    return sorted(out, key=lambda n: -n["heat"])


def drivers(stories, now):
    recent = [s for s in stories if s["last"] >= now - 8 * 3600] or stories
    L = sorted(recent, key=lambda s: (-s.get("impact", 1), -s["score"]))
    out, cats = [], {}
    for s in L:
        if cats.get(s["cat"], 0) >= 2:
            continue
        out.append(s["id"])
        cats[s["cat"]] = cats.get(s["cat"], 0) + 1
        if len(out) == 3:
            break
    return out


# ---------------- high-impact events ----------------
MONTHS = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])}


def fomc_dates(now):
    """Upcoming FOMC meetings, read from the Federal Reserve's own calendar page (cached 12 hours)."""
    cache = NET["read"](NET["state"] / "fomc.json", {})
    if cache.get("at", 0) > now - 12 * 3600 and cache.get("dates"):
        return cache["dates"]
    try:
        html = _get("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", timeout=25).decode("utf-8", "replace")
        dates = []
        for blk in re.split(r"(?=<h4[^>]*>\s*<a[^>]*>\s*\d{4} FOMC Meetings)|(?=\d{4} FOMC Meetings)", html):
            ym = re.search(r"(\d{4}) FOMC Meetings", blk)
            if not ym:
                continue
            yr = int(ym.group(1))
            for mo, dd in re.findall(r'fomc-meeting__month[^>]*>\s*<strong>([A-Za-z/]+)</strong>.*?fomc-meeting__date[^>]*>([^<]+)<', blk, re.S):
                mon = MONTHS.get(mo.split("/")[-1].lower())
                last = re.findall(r"\d+", dd)
                if mon and last:
                    day = int(last[-1])
                    mon2 = mon if int(last[-1]) >= int(last[0]) or "/" not in mo else MONTHS.get(mo.split("/")[-1].lower())
                    dates.append({"date": f"{yr}-{mon2:02d}-{day:02d}", "label": f"FOMC decision ({mo} {dd.strip().rstrip('*')})" + (" · with projections" if "*" in dd else ""), "sep": "*" in dd})
        dates = sorted({d["date"]: d for d in dates}.values(), key=lambda d: d["date"])
        if dates:
            NET["write"](NET["state"] / "fomc.json", {"at": int(now), "dates": dates})
            return dates
    except Exception as e:  # noqa
        print("  FOMC calendar skipped:", str(e)[:100])
    return cache.get("dates", [])


CUR_NAME = {"USD": "US", "EUR": "Euro area", "GBP": "UK", "JPY": "Japan", "CNY": "China", "CAD": "Canada", "AUD": "Australia", "NZD": "New Zealand", "CHF": "Switzerland"}


def econ_calendar(now):
    """High-impact economic events with exact times, forecast and previous: the Forex Factory weekly calendar (refreshed hourly),
    with FOMC decisions confirmed against the Federal Reserve's own calendar. Times are UTC seconds; the page shows your local time."""
    cache = NET["read"](NET["state"] / "ffcal.json", {})
    rows = cache.get("rows") or []
    if cache.get("at", 0) < now - 3600 or not rows:
        try:
            j = _json("https://nfs.faireconomy.media/ff_calendar_thisweek.json", timeout=20)
            if isinstance(j, list) and j:
                rows = j
                NET["write"](NET["state"] / "ffcal.json", {"at": int(now), "rows": rows})
        except Exception as e:  # noqa
            print("  economic calendar skipped:", str(e)[:100])
    out = []
    for r in rows:
        if r.get("impact") != "High":
            continue
        try:
            t = int(datetime.fromisoformat(r["date"]).timestamp())
        except Exception:  # noqa
            continue
        if now - 12 * 3600 <= t <= now + 8 * 86400:
            out.append({"t": t, "title": r.get("title", ""), "cur": r.get("country", ""), "where": CUR_NAME.get(r.get("country", ""), r.get("country", "")),
                        "f": r.get("forecast") or "", "p": r.get("previous") or "", "src": "Forex Factory"})
    # FOMC decisions from the Fed (2:00 pm New York time): confirms the calendar, and fills in weeks the weekly calendar does not cover yet
    try:
        from zoneinfo import ZoneInfo
        ny = ZoneInfo("America/New_York")
        for d in fomc_dates(now):
            y, m, dd = (int(x) for x in d["date"].split("-"))
            t = int(datetime(y, m, dd, 14, 0, tzinfo=ny).timestamp())
            if not (now - 12 * 3600 <= t <= now + 45 * 86400):
                continue
            same = [e for e in out if e["cur"] == "USD" and abs(e["t"] - t) <= 3600 and re.search(r"federal funds|fomc", e["title"], re.I)]
            if same:
                for e in same:
                    e["src"] = "Forex Factory · ✓ Federal Reserve calendar"
            else:
                out.append({"t": t, "title": "FOMC rate decision" + (" + projections" if d.get("sep") else ""), "cur": "USD", "where": "US", "f": "", "p": "", "src": "Federal Reserve"})
    except Exception as e:  # noqa
        print("  FOMC times skipped:", str(e)[:80])
    out.sort(key=lambda e: e["t"])
    return out[:40]


RELEASE = re.compile(r"\b(cpi|consumer price|inflation rate|fomc|rate decision|interest rate decision|keeps rates|holds rates|cuts rates|raises rates|"
                     r"payrolls|jobs report|nonfarm|unemployment rate|gdp|pce)\b", re.I)


def events(stories, calendar, now):
    today = datetime.fromtimestamp(now, timezone.utc).date()
    up = []
    for d in fomc_dates(now):
        dt = datetime.strptime(d["date"], "%Y-%m-%d").date()
        if 0 <= (dt - today).days <= 45:
            up.append({"date": d["date"], "name": d["label"], "kind": "FOMC", "src": "Federal Reserve", "days": (dt - today).days})
    for r in calendar or []:
        n = r["name"]
        kind = "CPI" if "consumer price" in n.lower() else "NFP" if "employment situation" in n.lower() else "GDP" if "gross domestic" in n.lower() else \
            "PCE" if "personal income" in n.lower() else "PPI" if "producer price" in n.lower() else "DATA"
        if kind == "DATA":
            continue
        dt = datetime.strptime(r["date"], "%Y-%m-%d").date()
        up.append({"date": r["date"], "name": n, "kind": kind, "src": "FRED release calendar", "days": (dt - today).days})
    up.sort(key=lambda e: e["date"])
    out_today = [s["id"] for s in stories if RELEASE.search(s["title"]) and s["last"] >= now - 18 * 3600 and (s.get("status") == "OFFICIAL" or s.get("n", 1) >= 3)][:4]
    return {"upcoming": up[:8], "released": out_today}


# ---------------- crypto market breadth ----------------
STABLE = {"usdt", "usdc", "dai", "fdusd", "usde", "tusd", "pyusd", "usds", "usdd", "frax", "busd", "usd1", "rlusd", "bsc-usd", "usdtb", "susde", "susds", "gusd", "usdp",
          "lusd", "eurc", "buidl", "usyc", "ustb", "usdf", "usdg", "usd0", "usdx", "crvusd", "gho", "dola", "usdy", "ousg", "syrupusdc", "bfusd", "usdai", "usdb", "eurs"}
SKIP_NAME = re.compile(r"wrapped|staked|bridged|restak|liquid staking|tokenized|\bheloc\b|binance-peg|\bjito\b|\bweth\b", re.I)
SKIP_SYM = {"wbtc", "weth", "steth", "wsteth", "weeth", "reth", "cbbtc", "cbeth", "wbeth", "jitosol", "msol", "bnsol", "lbtc", "solvbtc", "meth", "ezeth", "rseth",
            "xaut", "paxg", "bsol", "tbtc", "clbtc", "wbnb", "figr_heloc", "lseth", "oseth", "sweth", "kbtc", "fbtc", "unibtc", "pumpbtc", "eeth"}


def breadth():
    """How the whole crypto market is doing, not just bitcoin: dominance, total value, how many of the top coins are up, biggest movers."""
    try:
        rows = _json("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h", timeout=20)
        g = _json("https://api.coingecko.com/api/v3/global", timeout=20)["data"]
    except Exception as e:  # noqa
        print("  breadth skipped:", str(e)[:100])
        return None
    L = []
    for r in rows:
        sym, ch, p = (r.get("symbol") or "").lower(), r.get("price_change_percentage_24h"), r.get("current_price")
        if ch is None or not p or sym in STABLE or sym in SKIP_SYM or SKIP_NAME.search(r.get("name") or "") or SKIP_NAME.search(r.get("id") or ""):
            continue
        if 0.97 <= p <= 1.03 and abs(ch) < 1:            # anything else that behaves like a dollar stablecoin
            continue
        L.append({"sym": sym.upper(), "name": r.get("name", ""), "chg": round(ch, 2), "p": p, "rank": r.get("market_cap_rank")})
    if len(L) < 20:
        return None
    up = sum(1 for x in L if x["chg"] > 0)
    srt = sorted(L, key=lambda x: -x["chg"])
    chs = sorted(x["chg"] for x in L)
    mp = g.get("market_cap_percentage") or {}
    return {"n": len(L), "up": up, "down": len(L) - up, "median": round(chs[len(chs) // 2], 2), "gainers": srt[:5], "losers": srt[::-1][:5],
            "dom_btc": round(mp.get("btc", 0), 2), "dom_eth": round(mp.get("eth", 0), 2), "mcap": (g.get("total_market_cap") or {}).get("usd"),
            "mcap_chg": round(g.get("market_cap_change_percentage_24h_usd") or 0, 2), "src": "CoinGecko · top 100 by value, stablecoins and wrapped tokens left out"}


# ---------------- AI trader brief (Gemini or Claude, when a key is set) ----------------
def ai_trader_brief(out, mk, stories, now):
    """A short neutral read of the trading day written by AI from the numbers on the page. Refreshed hourly; never advice."""
    try:
        import ai
    except Exception:  # noqa
        return None
    if not ai.provider():
        return None
    prev = NET["read"](NET["state"] / "ai_trader.json", {})
    drv = out.get("drivers") or []
    if prev.get("bullets") and now - prev.get("at", 0) < 3600 and prev.get("drivers") == drv:
        return prev
    by = {s["id"]: s for s in stories}
    m = {x["k"]: x for x in mk if x.get("p") is not None}
    data = {
        "regime": (out.get("regime") or {}).get("label"), "regime_reasons": [w[1] for w in (out.get("regime") or {}).get("why", [])],
        "prices_24h_change_pct": {k: round(m[k]["chg"], 2) for k in ("btc", "eth", "sol", "gold", "oil", "spx", "dxy", "tnx", "vix") if k in m and m[k].get("chg") is not None},
        "key_news": [{"title": by[i]["title"], "why": by[i].get("why", ""), "tone": by[i].get("sentiment")} for i in drv if i in by],
        "events_next_24h": [{"event": e["where"] + " " + e["title"], "hours_from_now": round((e["t"] - now) / 3600, 1), "forecast": e["f"], "previous": e["p"]}
                            for e in (out.get("cal") or []) if now - 2 * 3600 <= e["t"] <= now + 24 * 3600][:6],
        "derivatives": {k: {"signal": v.get("signal"), "funding_8h_pct": v.get("funding"), "long_short": v.get("ls"), "oi_24h_pct": v.get("oi_chg")}
                        for k, v in (out.get("derivatives") or {}).items() if isinstance(v, dict) and not v.get("err")},
        "liquidations_24h_usd": {k: {"longs": v.get("long"), "shorts": v.get("short")} for k, v in (out.get("liqs") or {}).items() if isinstance(v, dict) and not v.get("err")},
        "levels": {k: {kk: v["lv"].get(kk) for kk in ("hi24", "lo24", "vwap", "pdh", "pdl")} | {"last": v["pts"][-1][1]} for k, v in (out.get("catalysts") or {}).items() if v.get("lv")},
        "breadth": {k: (out.get("breadth") or {}).get(k) for k in ("up", "down", "dom_btc", "mcap_chg")} if out.get("breadth") else None,
    }
    prompt = ("You are writing the 'Trader's brief' box of a personal market dashboard. From the JSON below only, write 4 or 5 bullets that give a trader "
              "the picture of the day: market mood, event risk, positioning and leverage, key price levels, and the news that matters. Rules: plain English, "
              "max 24 words per bullet, neutral and factual, no advice, no buy/sell calls, no price predictions, never invent numbers, never mention clock times "
              "(the page shows times and countdowns), round prices sensibly. Reply with JSON only: "
              '{"bullets":[{"k":"mood|event|positioning|levels|news|breadth","text":"..."}]}\n\n' + json.dumps(data, default=str))
    try:
        j, label = ai.ask_json(prompt, 900)
        bl = [{"k": str(b.get("k", "news"))[:12], "text": str(b.get("text", ""))[:240]} for b in j.get("bullets", []) if b.get("text")][:5]
        if bl:
            res = {"bullets": bl, "at": int(now), "by": label, "drivers": drv}
            NET["write"](NET["state"] / "ai_trader.json", res)
            return res
    except Exception as e:  # noqa
        print("  AI trader brief skipped:", str(e)[:240])
    return prev if prev.get("bullets") and now - prev.get("at", 0) < 4 * 3600 else None


def ai_impact(stories, mk, out, now):
    """Gemini reads ALL of today's confirmed news (not just the top) plus the prices and writes the possible impact on each market.
    Refreshed every 2 hours, or sooner when the key drivers change. Neutral, never advice."""
    try:
        import ai
    except Exception:  # noqa
        return None
    if not ai.provider():
        return None
    prev = NET["read"](NET["state"] / "ai_impact.json", {})
    drv = out.get("drivers") or []
    age = now - prev.get("at", 0)
    if prev.get("assets") and (age < 100 * 60 and (prev.get("drivers") == drv or age < 50 * 60)):
        return prev
    m = {x["k"]: x for x in mk if x.get("p") is not None}
    L = sorted(stories, key=lambda s: (-s.get("impact", 1), -s["score"]))[:90]
    lines = "\n".join(f'[{s["id"]}] ({s["cat"]}, {"official" if s["status"] == "OFFICIAL" else str(s["n"]) + " newsrooms"}, impact {s.get("impact", "?")}/10, '
                      f'{round((now - s["first"]) / 3600, 1)}h ago) {s["title"]}' + (f' — {s["dek"][:140]}' if s.get("dek") else "") for s in L)
    px = {k: {"price": m[k]["p"], "chg_24h_pct": round(m[k]["chg"], 2) if m[k].get("chg") is not None else None}
          for k in ("btc", "eth", "sol", "gold", "oil", "spx", "ndx", "dxy", "tnx", "vix", "eur", "jpy") if k in m}
    ev = [{"event": e["where"] + " " + e["title"], "hours_from_now": round((e["t"] - now) / 3600, 1), "forecast": e["f"], "previous": e["p"]}
          for e in (out.get("cal") or []) if now - 3 * 3600 <= e["t"] <= now + 36 * 3600][:8]
    der = {k: {"signal": v.get("signal"), "funding_8h_pct": v.get("funding"), "long_short": v.get("ls"), "oi_24h_pct": v.get("oi_chg")}
           for k, v in (out.get("derivatives") or {}).items() if isinstance(v, dict) and not v.get("err")}
    liq = {k: {"longs_usd": v.get("long"), "shorts_usd": v.get("short")} for k, v in (out.get("liqs") or {}).items() if isinstance(v, dict) and not v.get("err")}
    lv = {k: {kk: v["lv"].get(kk) for kk in ("hi24", "lo24", "vwap", "pdh", "pdl")} | {"last": v["pts"][-1][1]} for k, v in (out.get("catalysts") or {}).items() if v.get("lv")}
    br = {k: (out.get("breadth") or {}).get(k) for k in ("up", "n", "dom_btc", "mcap_chg")} if out.get("breadth") else None
    lang = NET.get("lang") or "English"
    prompt = ("You are the market analyst of a personal trading dashboard. Read ALL of today's confirmed news below (each item is confirmed by 2+ newsrooms "
              "or an official source) together with the market numbers, and explain the POSSIBLE impact on markets. Think across all news: wars, politics, "
              "central banks, data, energy, crypto, tech. Rules: plain simple English, neutral, factual, no advice, no buy/sell calls, describe what the news "
              "could mean (possible impact), not certainties; use only the data given; cite story ids. Reply with JSON only:\n"
              '{"headline":"one sentence overall read of the day for markets",'
              '"mood":"RISK-ON|RISK-OFF|MIXED",'
              '"assets":[{"k":"BTC|ETH|GOLD|OIL|SPX|USD|BONDS","dir":"UP|DOWN|MIXED","strength":1,"why":"max 22 words","ids":["story id"]}],'
              '"themes":[{"name":"2-4 words","impact":"max 26 words on what it means for markets","ids":["story id"]}],'
              '"watch":["max 18 words: a risk or event to watch next"],'
              '"lines":[{"text":"max 25 words","ids":["story id"]}],'
              '"bullets":[{"k":"mood|event|positioning|levels|news|breadth","text":"max 24 words"}]}\n'
              "assets: all 7 keys, strength 1 (slight) to 3 (strong). themes: the 3 biggest. watch: 2 or 3 items.\n"
              f"lines = 'The day in 60 seconds' for a busy reader, written in {lang}: 6 to 8 lines covering the whole day across world, war, economy, "
              "markets, crypto, tech and anything else big, most important first, plain neutral language, one story or theme per line.\n"
              "bullets = the trader's brief: 4 or 5 bullets on market mood, event risk, positioning and leverage (from DERIVATIVES and LIQUIDATIONS), "
              "key price levels (from LEVELS, round sensibly) and breadth; never mention clock times (the page shows them).\n\n"
              "MARKET NUMBERS: " + json.dumps(px) + "\nUPCOMING HIGH-IMPACT EVENTS: " + json.dumps(ev) +
              "\nDERIVATIVES: " + json.dumps(der, default=str) + "\nLIQUIDATIONS 24H (OKX): " + json.dumps(liq) + "\nLEVELS (15-min data): " + json.dumps(lv, default=str) +
              "\nCRYPTO BREADTH: " + json.dumps(br) +
              "\nREGIME (from prices): " + str((out.get("regime") or {}).get("label")) + "\n\nTODAY'S CONFIRMED NEWS:\n" + lines)
    try:
        j, label = ai.ask_json(prompt, 4000)
        ids = {s["id"] for s in stories}
        assets = []
        for a in j.get("assets", []):
            k = str(a.get("k", "")).upper()
            if k in ("BTC", "ETH", "GOLD", "OIL", "SPX", "USD", "BONDS") and str(a.get("dir", "")).upper() in ("UP", "DOWN", "MIXED"):
                assets.append({"k": k, "dir": a["dir"].upper(), "s": max(1, min(3, int(a.get("strength") or 1))), "why": str(a.get("why", ""))[:220],
                               "ids": [i for i in (a.get("ids") or []) if i in ids][:3]})
        if assets:
            res = {"headline": str(j.get("headline", ""))[:260], "mood": str(j.get("mood", "MIXED")).upper()[:10], "assets": assets,
                   "themes": [{"name": str(t.get("name", ""))[:40], "impact": str(t.get("impact", ""))[:240], "ids": [i for i in (t.get("ids") or []) if i in ids][:4]}
                              for t in j.get("themes", [])[:3] if t.get("name")],
                   "watch": [str(w)[:160] for w in j.get("watch", [])[:3]], "n": len(L), "at": int(now), "by": label, "drivers": drv,
                   "lines": [{"text": str(x.get("text", ""))[:300], "ids": [i for i in (x.get("ids") or []) if i in ids][:3]} for x in j.get("lines", []) if x.get("text")][:8],
                   "bullets": [{"k": str(b.get("k", "news"))[:12], "text": str(b.get("text", ""))[:240]} for b in j.get("bullets", []) if b.get("text")][:5]}
            NET["write"](NET["state"] / "ai_impact.json", res)
            return res
    except Exception as e:  # noqa
        print("  AI impact skipped:", str(e)[:240])
    return prev if prev.get("assets") and age < 8 * 3600 else None


# ---------------- alerts (Telegram / Discord) ----------------
def alerts(stories, watch, btc_price, now):
    tok, chat, hook = (os.environ.get(k, "").strip() for k in ("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "DISCORD_WEBHOOK_URL"))
    if not ((tok and chat) or hook):
        return 0
    sent_db = NET["read"](NET["state"] / "alerted.json", {})
    sent_db = {k: v for k, v in sent_db.items() if v > now - 4 * 86400}
    first_run = not sent_db
    wrx = re.compile(r"\b(" + "|".join(re.escape(w) for w in watch) + r")", re.I) if watch else None
    n = 0
    for s in sorted(stories, key=lambda s: -s.get("impact", 1)):
        if s["id"] in sent_db:
            continue
        hot = s.get("impact", 0) >= 8
        wmatch = bool(wrx and wrx.search(s["title"])) and s.get("sentiment") in ("BULLISH", "BEARISH")
        if not (hot or wmatch):
            continue
        sent_db[s["id"]] = now
        if first_run or s["first"] < now - 45 * 60 or n >= 5:      # only fresh stories, never a flood of old ones
            continue
        icon = "🟢" if s["sentiment"] == "BULLISH" else "🔴" if s["sentiment"] == "BEARISH" else "⚪"
        lines = [f"{icon} {s['sentiment']} · ⚡ IMPACT {s['impact']}/10" + (" · ★ watch word" if wmatch and not hot else ""), s["title"]]
        if s.get("why"):
            lines.append(s["why"])
        lines.append(("✓ Official source" if s["status"] == "OFFICIAL" else f"✓ Confirmed by {s['n']} newsrooms") + ": " + ", ".join(s.get("indep") or s["orgs"])[:120])
        if s.get("assets"):
            lines.append("Assets: " + " ".join(s["assets"]))
        if btc_price:
            lines.append(f"BTC ${btc_price:,.0f}")
        lines.append(s["link"])
        text = "\n".join(lines)
        try:
            if tok and chat:
                _get(f"https://api.telegram.org/bot{tok}/sendMessage", timeout=15, data=json.dumps({"chat_id": chat, "text": text, "disable_web_page_preview": True}).encode(),
                     headers={"Content-Type": "application/json", "Accept-Encoding": "identity"})
            if hook:
                _get(hook, timeout=15, data=json.dumps({"content": text[:1900]}).encode(), headers={"Content-Type": "application/json", "Accept-Encoding": "identity"})
            n += 1
        except Exception as e:  # noqa
            print("  alert not sent:", str(e)[:100])
    NET["write"](NET["state"] / "alerted.json", sent_db)
    return n


# ---------------- key events log (kept for 120 days, never pushed out by newer news) ----------------
LOG_KEYS = ["btc", "eth", "sol", "gold", "oil", "spx", "dxy"]


def keylog(stories, driver_ids, mk, now):
    path = NET["arch"] / "keylog.json"
    log = NET["read"](path, {"events": []})
    by = {e["id"]: e for e in log.get("events", [])}
    px = {m["k"]: m["p"] for m in mk if m.get("p") is not None and m["k"] in LOG_KEYS}
    added = 0
    for s in stories:
        qualifies = s.get("impact", 0) >= 7 or s.get("breaking") or s["id"] in driver_ids or (s.get("status") == "OFFICIAL" and s.get("impact", 0) >= 6)
        e = by.get(s["id"])
        if not e and not qualifies:
            continue
        reps = [{"o": r["o"], "t": r["t"], "u": r["u"], "ts": r["ts"]} for r in s.get("reports", [])][-8:]
        if not e:
            e = {"id": s["id"], "logged": int(now), "first": s["first"], "px": px, "reason": "breaking" if s.get("breaking") else "driver" if s["id"] in driver_ids and s.get("impact", 0) < 7 else "impact"}
            by[s["id"]] = e
            added += 1
        e.update(title=s["title"], dek=s.get("dek", ""), link=s["link"], cat=s["cat"], status=s["status"], n=max(e.get("n", 0), s.get("n", 1)), orgs=s.get("orgs", []),
                 indep=s.get("indep", []), sentiment=s.get("sentiment"), impact=max(e.get("impact", 0), s.get("impact", 0)), assets=s.get("assets", []), why=s.get("why", ""),
                 last=s["last"], places=s.get("places", []), kw=s.get("kw", []), reports=reps)
    events = sorted((e for e in by.values() if e["logged"] >= now - 120 * 86400), key=lambda e: -e["first"])[:3000]
    NET["write"](path, {"updated": int(now), "events": events})
    return added


def run(day_stories, final_stories, mk, fng, calendar, watch, now):
    """Enrich stories in place and return the trader block for today.json."""
    for s in final_stories:
        tag_story(s)
    ai = ai_tags(sorted(final_stories, key=lambda s: -s["score"]), now)
    prices = {x["k"].upper(): x["p"] for x in mk if x.get("p") is not None}
    chg24 = {x["k"].upper(): x.get("chg") for x in mk}
    def safe(name, f, default=None):
        try:
            return f()
        except Exception as e:  # noqa  - one broken source never stops the rest
            print(f"  {name} error:", repr(e)[:160], flush=True)
            return default
    cat, sparks = safe("charts", lambda: catalysts(final_stories, now), ({}, {}))
    der = safe("derivatives", lambda: derivatives(prices, chg24, now), {})
    liq = safe("liquidations", lambda: liquidations(now), {})
    out = {"regime": regime(mk, fng), "drivers": drivers(final_stories, now), "narratives": narratives(final_stories, now), "catalysts": cat, "sparks": sparks,
           "derivatives": der, "liqs": liq, "events": events(final_stories, calendar, now), "cal": safe("calendar", lambda: econ_calendar(now), []),
           "breadth": safe("breadth", breadth), "ai_tags": ai}
    out["impact"] = safe("AI impact", lambda: ai_impact(final_stories, mk, out, now))      # one AI call: impact + day in 60 seconds + trader's brief
    imp_ = out["impact"] or {}
    out["ai_brief"] = {"bullets": imp_["bullets"], "at": imp_["at"], "by": imp_.get("by")} if imp_.get("bullets") else None
    out["alerts_sent"] = alerts(final_stories, watch, prices.get("BTC"), now)
    if NET.get("arch"):
        out["logged"] = keylog(final_stories, out["drivers"], mk, now)
    srcs = {v.get("src") for v in der.values() if isinstance(v, dict) and v.get("src")}
    cs = ",".join(k + "=" + str(v["src"]).split(" ")[0] for k, v in cat.items()) or "none"
    lq = ",".join(f"{k}=${(v.get('long', 0) + v.get('short', 0)) / 1e6:.1f}M/{v.get('cover_h')}h/{v.get('pages')}p" if not v.get("err") else f"{k}=ERR {v['err']}" for k, v in liq.items())
    fl = ",".join(k for k, v in der.items() if isinstance(v, dict) and v.get("flow"))
    nxt = next((e for e in out["cal"] if e["t"] > now), None)
    br = out.get("breadth") or {}
    print(f"  trader: candles {cs} · derivatives {','.join(sorted(srcs)) or 'none'} · flow {fl or 'none'} · liqs {lq or 'none'}"
          f" · L/S {','.join(sorted({v.get('ls_src', '-') for v in der.values() if isinstance(v, dict)}))} · regime {out['regime']['label']}"
          f" · calendar {len(out['cal'])} high-impact" + (f" (next {nxt['cur']} {nxt['title']} in {(nxt['t'] - now) / 3600:.1f}h)" if nxt else "") +
          f" · breadth {br.get('up', '-')}/{br.get('n', '-')} up · AI brief {(out['ai_brief'] or {}).get('by', 'off')} · AI impact {(out['impact'] or {}).get('by', 'off')}"
          f" · alerts {out['alerts_sent']} · key events +{out.get('logged', 0)}", flush=True)
    errs = {k: v["err"] for k, v in der.items() if isinstance(v, dict) and v.get("err")}
    if errs:
        print("  derivatives errors:", errs, flush=True)
    return out
