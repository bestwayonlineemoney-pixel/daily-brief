"""Probe: print the shape of the APIs the new trader features use. No secrets."""
import gzip, json, time, urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=25) as r:
        b = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            b = gzip.decompress(b)
        return b


def show(name, url, fn=None, n=1200):
    print("=" * 20, name)
    try:
        t = time.time()
        b = get(url)
        j = json.loads(b)
        out = fn(j) if fn else j
        print(f"[{time.time() - t:.1f}s]", json.dumps(out)[:n])
    except Exception as e:
        print("ERR", repr(e)[:300])


now = int(time.time())
show("okx liq BTC-USDT", "https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&instFamily=BTC-USDT&state=filled&limit=100",
     lambda j: {"code": j.get("code"), "msg": j.get("msg"), "n_data": len(j.get("data", [])),
                "keys": list(j["data"][0].keys()) if j.get("data") else None,
                "n_details": len(j["data"][0].get("details", [])) if j.get("data") else None,
                "first": j["data"][0]["details"][:2] if j.get("data") else None,
                "last_ts": j["data"][0]["details"][-1]["ts"] if j.get("data") and j["data"][0].get("details") else None})
show("okx liq page2", "https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&instFamily=BTC-USDT&state=filled&limit=100&after=" + str((now - 3600) * 1000),
     lambda j: {"code": j.get("code"), "msg": j.get("msg"), "n_details": len(j["data"][0].get("details", [])) if j.get("data") else None,
                "first_ts": j["data"][0]["details"][0]["ts"] if j.get("data") and j["data"][0].get("details") else None,
                "last_ts": j["data"][0]["details"][-1]["ts"] if j.get("data") and j["data"][0].get("details") else None})
show("okx instruments", "https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=BTC-USDT-SWAP",
     lambda j: {k: j["data"][0].get(k) for k in ("instId", "ctVal", "ctValCcy", "ctMult")})
show("okx taker-volume-contract", "https://www.okx.com/api/v5/rubik/stat/taker-volume-contract?instId=BTC-USDT-SWAP&period=1H&unit=2&limit=3")
show("okx taker-volume", "https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BTC&instType=CONTRACTS&period=1H", lambda j: {"code": j.get("code"), "n": len(j.get("data", [])), "first": j.get("data", [])[:2]})
show("okx oi-volume", "https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=1H", lambda j: {"n": len(j.get("data", [])), "first": j.get("data", [])[:2]})
show("ff thisweek", "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
     lambda j: {"n": len(j), "keys": list(j[0].keys()), "high": [x for x in j if x.get("impact") == "High"][:6], "impacts": sorted({x.get("impact") for x in j})}, 2500)
show("coingecko global", "https://api.coingecko.com/api/v3/global",
     lambda j: {"btc_dom": j["data"]["market_cap_percentage"].get("btc"), "eth_dom": j["data"]["market_cap_percentage"].get("eth"),
                "mcap": j["data"]["total_market_cap"].get("usd"), "chg": j["data"].get("market_cap_change_percentage_24h_usd")})
show("coingecko top100", "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h",
     lambda j: {"n": len(j), "sample": [{k: x.get(k) for k in ("id", "symbol", "current_price", "price_change_percentage_24h", "market_cap_rank")} for x in j[:12]]}, 2000)
show("yahoo TNX daily", "https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=1mo&interval=1d",
     lambda j: {"meta_price": j["chart"]["result"][0]["meta"].get("regularMarketPrice"), "last_closes": j["chart"]["result"][0]["indicators"]["quote"][0]["close"][-3:]})
show("yahoo GC 15m", "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?range=5d&interval=15m",
     lambda j: {"n": len(j["chart"]["result"][0]["timestamp"]), "quote_keys": list(j["chart"]["result"][0]["indicators"]["quote"][0].keys()),
                "last": {k: v[-2:] for k, v in j["chart"]["result"][0]["indicators"]["quote"][0].items()}})
show("yahoo SPX 15m", "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=15m",
     lambda j: {"n": len(j["chart"]["result"][0]["timestamp"]), "vol_last": j["chart"]["result"][0]["indicators"]["quote"][0]["volume"][-5:]})
show("coinbase candles", "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900", lambda j: {"n": len(j), "first": j[0], "last": j[-1]})
