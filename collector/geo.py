"""Find the places a headline is about. Names match the country names in site/vendor/world-lite.json."""
import json
import re
from pathlib import Path

# word in a headline -> country (as named on the map)
ALIAS = {
    "u.s.": "United States of America", "us": "United States of America", "usa": "United States of America", "america": "United States of America",
    "american": "United States of America", "washington": "United States of America", "white house": "United States of America", "pentagon": "United States of America",
    "congress": "United States of America", "fed": "United States of America", "fed's": "United States of America", "powell": "United States of America", "senate": "United States of America", "wall street": "United States of America", "new york": "United States of America",
    "california": "United States of America", "texas": "United States of America", "florida": "United States of America", "federal reserve": "United States of America",
    "uk": "United Kingdom", "u.k.": "United Kingdom", "britain": "United Kingdom", "british": "United Kingdom", "england": "United Kingdom", "london": "United Kingdom",
    "scotland": "United Kingdom", "wales": "United Kingdom", "downing street": "United Kingdom",
    "russian": "Russia", "moscow": "Russia", "kremlin": "Russia", "ukrainian": "Ukraine", "kyiv": "Ukraine", "kiev": "Ukraine", "kharkiv": "Ukraine", "odesa": "Ukraine",
    "zaporizhzhia": "Ukraine", "donbas": "Ukraine", "donetsk": "Ukraine", "crimea": "Ukraine", "zhytomyr": "Ukraine", "dnipro": "Ukraine",
    "israeli": "Israel", "jerusalem": "Israel", "tel aviv": "Israel", "idf": "Israel", "knesset": "Israel", "netanyahu": "Israel",
    "gaza": "Palestine", "palestinian": "Palestine", "west bank": "Palestine", "hamas": "Palestine", "rafah": "Palestine",
    "iranian": "Iran", "tehran": "Iran", "hormuz": "Iran", "lebanese": "Lebanon", "beirut": "Lebanon", "hezbollah": "Lebanon",
    "syrian": "Syria", "damascus": "Syria", "iraqi": "Iraq", "baghdad": "Iraq", "yemeni": "Yemen", "houthi": "Yemen", "houthis": "Yemen", "red sea": "Yemen",
    "saudi": "Saudi Arabia", "riyadh": "Saudi Arabia", "emirati": "United Arab Emirates", "uae": "United Arab Emirates", "dubai": "United Arab Emirates",
    "abu dhabi": "United Arab Emirates", "qatari": "Qatar", "doha": "Qatar", "omani": "Oman", "muscat": "Oman", "kuwaiti": "Kuwait", "bahraini": "Bahrain",
    "jordanian": "Jordan", "amman": "Jordan", "egyptian": "Egypt", "cairo": "Egypt", "suez": "Egypt", "turkish": "Turkey", "turkiye": "Turkey", "türkiye": "Turkey",
    "ankara": "Turkey", "istanbul": "Turkey",
    "chinese": "China", "beijing": "China", "shanghai": "China", "xi jinping": "China", "hong kong": "Hong Kong", "taiwanese": "Taiwan", "taipei": "Taiwan",
    "japanese": "Japan", "tokyo": "Japan", "korean": "South Korea", "seoul": "South Korea", "north korean": "North Korea", "pyongyang": "North Korea",
    "indian": "India", "delhi": "India", "new delhi": "India", "mumbai": "India", "modi": "India", "pakistani": "Pakistan", "islamabad": "Pakistan", "karachi": "Pakistan",
    "afghan": "Afghanistan", "kabul": "Afghanistan", "taliban": "Afghanistan", "bangladeshi": "Bangladesh", "dhaka": "Bangladesh", "nepali": "Nepal", "kathmandu": "Nepal",
    "sri lankan": "Sri Lanka", "colombo": "Sri Lanka", "lankan": "Sri Lanka", "maldivian": "Maldives", "male": None,
    "myanmar's": "Myanmar", "burma": "Myanmar", "thai": "Thailand", "bangkok": "Thailand", "vietnamese": "Vietnam", "hanoi": "Vietnam", "filipino": "Philippines",
    "manila": "Philippines", "indonesian": "Indonesia", "jakarta": "Indonesia", "malaysian": "Malaysia", "kuala lumpur": "Malaysia", "singaporean": "Singapore",
    "australian": "Australia", "sydney": "Australia", "canberra": "Australia", "new zealander": "New Zealand",
    "canadian": "Canada", "ottawa": "Canada", "toronto": "Canada", "mexican": "Mexico", "mexico city": "Mexico", "brazilian": "Brazil", "brasilia": "Brazil",
    "argentine": "Argentina", "argentinian": "Argentina", "buenos aires": "Argentina", "venezuelan": "Venezuela", "caracas": "Venezuela", "colombian": "Colombia",
    "bogota": "Colombia", "chilean": "Chile", "peruvian": "Peru", "cuban": "Cuba", "haitian": "Haiti",
    "french": "France", "paris": "France", "elysee": "France", "german": "Germany", "berlin": "Germany", "italian": "Italy", "rome": "Italy", "spanish": "Spain",
    "madrid": "Spain", "dutch": "Netherlands", "amsterdam": "Netherlands", "belgian": "Belgium", "brussels": "Belgium", "polish": "Poland", "warsaw": "Poland",
    "swiss": "Switzerland", "geneva": "Switzerland", "swedish": "Sweden", "norwegian": "Norway", "danish": "Denmark", "finnish": "Finland", "greek": "Greece",
    "athens": "Greece", "hungarian": "Hungary", "budapest": "Hungary", "romanian": "Romania", "serbian": "Serbia", "moldovan": "Moldova", "belarusian": "Belarus",
    "minsk": "Belarus", "georgian": "Georgia", "armenian": "Armenia", "azerbaijani": "Azerbaijan", "irish": "Ireland", "dublin": "Ireland", "portuguese": "Portugal",
    "austrian": "Austria", "vienna": "Austria", "czech": "Czechia",
    "sudanese": "Sudan", "khartoum": "Sudan", "darfur": "Sudan", "el fasher": "Sudan", "south sudan": "S. Sudan", "ethiopian": "Ethiopia", "addis ababa": "Ethiopia",
    "somali": "Somalia", "mogadishu": "Somalia", "kenyan": "Kenya", "nairobi": "Kenya", "nigerian": "Nigeria", "lagos": "Nigeria", "abuja": "Nigeria",
    "south african": "South Africa", "johannesburg": "South Africa", "pretoria": "South Africa", "congolese": "Dem. Rep. Congo", "drc": "Dem. Rep. Congo", "dr congo": "Dem. Rep. Congo",
    "goma": "Dem. Rep. Congo", "libyan": "Libya", "tripoli": "Libya", "tunisian": "Tunisia", "algerian": "Algeria", "moroccan": "Morocco", "malian": "Mali",
    "ghanaian": "Ghana", "ugandan": "Uganda", "rwandan": "Rwanda", "zimbabwean": "Zimbabwe", "mozambican": "Mozambique", "eritrean": "Eritrea",
    "greenland": "Greenland", "vatican": "Vatican", "pope": "Vatican", "eu": "Belgium", "european union": "Belgium", "nato": "Belgium",
}
# a few places worth their own pin (lon, lat)
POINTS = {
    "hormuz": ("Strait of Hormuz", 56.4, 26.6), "red sea": ("Red Sea", 39.5, 18.5), "gaza": ("Gaza", 34.45, 31.45), "west bank": ("West Bank", 35.25, 31.95),
    "taiwan strait": ("Taiwan Strait", 119.5, 24.3), "south china sea": ("South China Sea", 114.0, 12.0), "black sea": ("Black Sea", 34.0, 43.4),
    "kyiv": ("Kyiv", 30.52, 50.45), "kharkiv": ("Kharkiv", 36.23, 49.99), "odesa": ("Odesa", 30.72, 46.48), "crimea": ("Crimea", 34.1, 45.0),
    "beirut": ("Beirut", 35.5, 33.89), "tehran": ("Tehran", 51.39, 35.69), "jerusalem": ("Jerusalem", 35.21, 31.77), "dubai": ("Dubai", 55.27, 25.2),
    "abu dhabi": ("Abu Dhabi", 54.37, 24.45), "colombo": ("Colombo", 79.86, 6.93), "wall street": ("Wall Street", -74.01, 40.71), "washington": ("Washington", -77.04, 38.9),
    "brussels": ("Brussels", 4.35, 50.85), "eu": ("European Union", 4.35, 50.85), "european union": ("European Union", 4.35, 50.85), "nato": ("NATO", 4.35, 50.85),
    "london": ("London", -0.12, 51.5), "hong kong": ("Hong Kong", 114.17, 22.32), "el fasher": ("El Fasher", 25.35, 13.63), "darfur": ("Darfur", 24.9, 13.5),
}

_NAMES = None
_RX = None


def _load(map_file):
    global _NAMES, _RX
    names = {}
    try:
        topo = json.loads(Path(map_file).read_text(encoding="utf-8"))
        for g in topo["objects"]["countries"]["geometries"]:
            n = (g.get("properties") or {}).get("name")
            if n and len(n) > 3 and "." not in n:
                names[n.lower()] = n
    except Exception:  # noqa
        pass
    for k, v in ALIAS.items():
        if v:
            names[k] = v
    for k in ("united states", "united arab emirates", "south korea", "north korea", "saudi arabia", "sri lanka", "south africa", "new zealand"):
        names.setdefault(k, {"united states": "United States of America"}.get(k, k.title()))
    names["guinea"] = "Guinea"
    keys = sorted(names, key=len, reverse=True)
    _NAMES = names
    _RX = re.compile(r"(?<![\w.])(" + "|".join(re.escape(k) for k in keys) + r")(?![\w])", re.I)


def places(text, map_file):
    """Return up to 3 places: [{"c": country name on the map, "p": label, "pt": [lon, lat] or None}]"""
    if _RX is None:
        _load(map_file)
    found, seen = [], set()
    for m in _RX.finditer(text or ""):
        raw = m.group(1)
        key = raw.lower()
        if key == "us" and raw != "US":   # "us" the word, not the country
            continue
        if key in ("turkey", "chad", "jordan", "georgia", "niger") and raw[0].islower():
            continue
        country = _NAMES.get(key)
        if not country:
            continue
        pt = POINTS.get(key)
        label = pt[0] if pt else country.replace("United States of America", "United States")
        tag = label
        if tag in seen:
            continue
        seen.add(tag)
        found.append({"c": country, "p": label, "pt": [pt[1], pt[2]] if pt else None})
    # count: most mentioned first, keep 3
    return found[:3]
