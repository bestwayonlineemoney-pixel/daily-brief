import sys, json
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
sys.path.insert(0, "collector")
import collect
conf = json.load(open("config.json"))
def one(f):
    feed, items, err, s = collect.fetch(f)
    n = len(items); w = [i for i in items if i.get("img")]
    return f["name"], n, len(w), err, (w[0]["img"][:110] if w else "")
with ThreadPoolExecutor(12) as ex:
    rows = list(ex.map(one, conf["feeds"]))
tot = sum(r[1] for r in rows); wi = sum(r[2] for r in rows)
print(f"TOTAL items {tot}, with image {wi}")
for r in sorted(rows, key=lambda r: -r[2] / max(1, r[1])):
    print(f"{r[0]:28} {r[2]:3}/{r[1]:3} {r[3] or ''} {r[4]}")
cs = [f for f in conf["feeds"] if f["name"] == "CryptoSlate"][0]
_, items, _, _ = collect.fetch(cs)
for i in items[:4]:
    print("CS:", i["title"][:80], "|", i.get("desc", "")[:80], "|", i.get("img"), "|", i.get("ts"))
