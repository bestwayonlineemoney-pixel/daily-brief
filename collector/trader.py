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


def setup(get, get_json, read, write, state, arch=None):
    NET.update(get=get, get_json=get_json, read=read, write=write, state=state, arch=arch)


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
    (r"rate cut|cuts rates?|dovish", "Cheaper money tends to lift risk assets like crypto and stocks, and weaken the dollar."),
    (r"rate hike|hikes rates?|hawkish|not a done deal|cools.*cut", "Fewer or later rate cuts keep money tight: a headwind for crypto and stocks, support for the dollar."),
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
    """Optional: Claude reads the top headlines and refines sentiment and the one-line 'why it matters'. Cached per story."""
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return 0
    cache = NET["read"](NET["state"] / "ai_tags.json", {})
    cache = {k: v for k, v in cache.items() if v.get("at", 0) > now - 3 * 86400}
    todo = [s for s in stories[:40] if s["id"] not in cache][:25]
    if todo:
        lines = "\n".join(f'[{s["id"]}] {s["title"]}' + (f' — {s["dek"][:160]}' if s.get("dek") else "") for s in todo)
        prompt = ("For each confirmed news headline below, judge its likely effect on crypto and other risk assets today. Reply with JSON only: "
                  '{"items":[{"id":"...","sentiment":"BULLISH|BEARISH|NEUTRAL","why":"one plain sentence, max 18 words, on why it matters for prices"}]}. '
                  "Be neutral and factual; NEUTRAL when unclear.\n\n" + lines)
        body = json.dumps({"model": "claude-haiku-5-5", "max_tokens": 2000, "messages": [{"role": "user", "content": prompt}]}).encode()
        try:
            j = json.loads(_get("https://api.anthropic.com/v1/messages", timeout=60, data=body,
                                headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", "Accept-Encoding": "identity"}))
            txt = "".join(b.get("text", "") for b in j.get("content", []))
            m = re.search(r"\{.*\}", txt, re.S)
            for it in (json.loads(m.group(0)).get("items", []) if m else []):
                if it.get("id") and it.get("sentiment") in ("BULLISH", "BEARISH", "NEUTRAL"):
                    cache[str(it["id"])] = {"sentiment": it["sentiment"], "why": str(it.get("why", ""))[:200], "at": now}
        except Exception as e:  # noqa
            print("  AI tags skipped:", str(e)[:120])
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
    """15-minute closes for the last 24 hours: Coinbase Exchange (official exchange data), CoinGecko as backup."""
    try:
        rows = _json(f"https://api.exchange.coinbase.com/products/{product}/candles?granularity=900", timeout=20)
        pts = sorted((int(r[0]), float(r[4])) for r in rows if int(r[0]) >= now - 24 * 3600 - 900)
        if len(pts) > 40:
            return pts, "Coinbase"
    except Exception:  # noqa
        pass
    try:
        j = _json(f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart?vs_currency=usd&days=1", timeout=20)
        raw = [(int(t / 1000), float(p)) for t, p in j["prices"]]
        pts, last = [], 0
        for t, p in raw:                              # thin 5-minute points to 15 minutes
            if t - last >= 870:
                pts.append((t, p))
                last = t
        if len(pts) > 40:
            return pts, "CoinGecko"
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


def match_news(move, sym, stories):
    """The highest-impact confirmed story with a report within ±90 minutes of the move."""
    lo, hi = move["t0"] - 5400, move["t"] + 5400
    best, best_s = None, 0
    for s in stories:
        if s["cat"] not in ("crypto", "economy", "forex", "energy", "war", "world", "commodities"):
            continue
        rel = sym in s.get("assets", []) or s["cat"] == "crypto" or s.get("macro") or bool(set(s.get("assets", [])) & {"DXY", "SPX", "OIL"})
        if not rel:
            continue
        hits = [r["ts"] for r in s.get("reports", []) if lo <= r["ts"] <= hi]
        if not hits:
            continue
        near = min(abs(h - move["t"]) for h in hits)
        sc = s.get("impact", 1) * 2 + (3 if sym in s.get("assets", []) else 0) + (2 if s["cat"] == "crypto" else 0) - near / 3600 \
            + (1 if (s.get("sentiment") == "BULLISH") == (move["chg"] > 0) and s.get("sentiment") != "NEUTRAL" else 0)
        if sc > best_s:
            best, best_s = s, sc
    return best


def catalysts(stories, now):
    out = {}
    with ThreadPoolExecutor(3) as ex:
        res = list(ex.map(lambda c: (c, candles(c[1], c[1], c[2], now)), COINS))
    for (sym, _, _), (pts, src) in res:
        if not pts:
            continue
        moves = find_moves(pts)
        for m in moves:
            s = match_news(m, sym, stories)
            m["story"] = s["id"] if s else None
        out[sym] = {"src": src, "pts": [[t, round(p, 2 if p > 10 else 4)] for t, p in pts], "moves": moves,
                    "chg24": round((pts[-1][1] / pts[0][1] - 1) * 100, 2), "hi": max(p for _, p in pts), "lo": min(p for _, p in pts)}
    return out


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
    except Exception:  # noqa
        pass
    return d


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
    cat = catalysts(final_stories, now)
    der = derivatives(prices, chg24, now)
    out = {"regime": regime(mk, fng), "drivers": drivers(final_stories, now), "narratives": narratives(final_stories, now), "catalysts": cat,
           "derivatives": der, "events": events(final_stories, calendar, now), "ai_tags": ai}
    out["alerts_sent"] = alerts(final_stories, watch, prices.get("BTC"), now)
    if NET.get("arch"):
        out["logged"] = keylog(final_stories, out["drivers"], mk, now)
    srcs = {v.get("src") for v in der.values() if isinstance(v, dict) and v.get("src")}
    cs = ",".join(k + "=" + str(v["src"]) for k, v in cat.items()) or "none"
    print(f"  trader: candles {cs} · derivatives {','.join(sorted(srcs)) or 'none'}"
          f" · L/S {','.join(sorted({v.get('ls_src', '-') for v in der.values() if isinstance(v, dict)}))} · regime {out['regime']['label']}"
          f" · events {len(out['events']['upcoming'])} upcoming · alerts {out['alerts_sent']} · key events +{out.get('logged', 0)}", flush=True)
    errs = {k: v["err"] for k, v in der.items() if isinstance(v, dict) and v.get("err")}
    if errs:
        print("  derivatives errors:", errs, flush=True)
    return out
