"""
One place to talk to an AI model. Uses Google Gemini when GEMINI_API_KEY is set, otherwise Claude when ANTHROPIC_API_KEY is set.
Keys are read from the environment only (GitHub Secrets or brief.env); they are never written anywhere.
"""
import json
import os
import re
import urllib.error

NET = {}
GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"]


def setup(get, read=None, write=None, state=None, conf=None):
    NET.update(get=get, read=read, write=write, state=state, conf=conf or {})


def provider():
    if os.environ.get("GEMINI_API_KEY", "").strip():
        return "gemini"
    if os.environ.get("ANTHROPIC_API_KEY", "").strip():
        return "claude"
    return None


def _err_msg(e):
    """Google's short error text (never contains the key)."""
    try:
        j = json.loads(e.read().decode("utf-8", "replace"))
        er = j.get("error") or {}
        reason = next((d.get("reason") for d in er.get("details", []) if d.get("reason")), "")
        return (reason + " " + str(er.get("message", ""))).strip()[:160]
    except Exception:  # noqa
        return ""


def _discover(key):
    """Ask Google which Gemini models this key can use and pick the newest 'flash' ones (cached for a day)."""
    cache = NET["read"](NET["state"] / "ai_models_list.json", {}) if NET.get("read") else {}
    import time
    if cache.get("at", 0) > time.time() - 86400 and cache.get("models"):
        return cache["models"]
    names = []
    try:
        raw = NET["get"]("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", timeout=20,
                         headers={"x-goog-api-key": key, "Accept-Encoding": "identity"})
        for m in json.loads(raw).get("models", []):
            n = m.get("name", "").replace("models/", "")
            if "generateContent" not in (m.get("supportedGenerationMethods") or []) or not n.startswith("gemini"):
                continue
            if re.search(r"image|tts|audio|live|embed|thinking|robotics|computer|native", n):
                continue
            names.append(n)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Gemini model list refused (HTTP {e.code} {_err_msg(e)})")
    except Exception as e:  # noqa
        print("  Gemini model list skipped:", str(e)[:80])

    def rank(n):
        v = re.search(r"gemini-(\d+(?:\.\d+)?)", n)
        ver = float(v.group(1)) if v else (99 if "latest" in n else 0)
        return (("flash" in n) * 2 + ("lite" not in n), "preview" not in n and "exp" not in n, ver)
    names = sorted(set(names), key=rank, reverse=True)[:6]
    if names:
        print("  Gemini models available:", ", ".join(names), flush=True)
    if names and NET.get("write"):
        NET["write"](NET["state"] / "ai_models_list.json", {"at": int(time.time()), "models": names})
    return names


def _gemini(prompt, max_tokens):
    """Free Gemini keys have small per-minute and per-day limits, so: calls are spaced out, a daily budget is kept,
    and a model that hits its limit is rested while the next available model is tried."""
    import time
    key = os.environ["GEMINI_API_KEY"].strip()
    conf = NET.get("conf") or {}
    st = (NET["read"](NET["state"] / "ai_model.json", {}) if NET.get("read") else {}) or {}
    now = time.time()
    today = time.strftime("%Y-%m-%d", time.gmtime(now))
    if st.get("day") != today:
        st.update(day=today, n=0)
    if st.get("n", 0) >= int(conf.get("ai_daily_limit", 220)):
        raise RuntimeError("today's AI budget is used up (%d calls), back tomorrow" % st["n"])
    cool = {m: t for m, t in (st.get("cool") or {}).items() if t > now}
    good = st.get("gemini")
    found = _discover(key)
    models = [m for m in list(dict.fromkeys([m for m in [conf.get("gemini_model"), good] + found + GEMINI_MODELS if m])) if m not in cool][:6]
    if not models:
        raise RuntimeError("all Gemini models are resting after hitting Google's limits, will retry later")
    last, tried = None, []

    def save():
        st["cool"] = cool
        if NET.get("write"):
            NET["write"](NET["state"] / "ai_model.json", st)
    try:
        for model in models:
            for think in (True, False):           # 2.5 models accept a zero thinking budget (cheaper, faster); newer ones may not
                gap = time.time() - st.get("last", 0)
                if gap < 13:
                    time.sleep(13 - gap)              # stay under the free tier's per-minute limit
                old_gen = "gemini-2.5" in model
                gen = {"maxOutputTokens": max_tokens if old_gen else max_tokens + 6000, "temperature": 0.3, "responseMimeType": "application/json"}
                if think:                          # keep the model's hidden "thinking" short so the answer is not cut off
                    gen["thinkingConfig"] = {"thinkingBudget": 0} if old_gen else {"thinkingLevel": "low"}
                body = json.dumps({"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": gen}).encode()
                st["last"] = time.time()
                st["n"] = st.get("n", 0) + 1
                try:
                    raw = NET["get"](f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", timeout=90, data=body,
                                     headers={"x-goog-api-key": key, "Content-Type": "application/json", "Accept-Encoding": "identity"})
                    j = json.loads(raw)
                    txt = "".join(p.get("text", "") for c in j.get("candidates", [])[:1] for p in (c.get("content") or {}).get("parts", []))
                    fin = str((j.get("candidates") or [{}])[0].get("finishReason") or "")
                    if txt and fin == "MAX_TOKENS" and not re.search(r"\}\s*$", txt):
                        last = f"{model}: reply cut off (MAX_TOKENS)"
                        tried.append(f"{model}=cut")
                        break
                    if not txt:
                        last = "empty reply (" + str((j.get("candidates") or [{}])[0].get("finishReason") or j.get("promptFeedback")) + ")"
                        tried.append(f"{model}=empty")
                        break
                    st["gemini"] = model
                    return txt, "Gemini " + model
                except urllib.error.HTTPError as e:
                    msg = _err_msg(e)
                    last = f"{model}: HTTP {e.code} {msg[:90]}"
                    tried.append(f"{model}={e.code}")
                    if "API_KEY" in msg or "API key" in msg or e.code in (401, 403):
                        raise RuntimeError(f"Gemini key refused (HTTP {e.code} {msg}) - check the GEMINI_API_KEY secret")
                    if e.code == 429:              # rest this model: a day for a daily limit, 20 minutes otherwise
                        cool[model] = now + (6 * 3600 if re.search(r"per ?day|PerDay|daily", msg, re.I) else 20 * 60)
                        break
                    if e.code == 404:
                        cool[model] = now + 7 * 86400
                        break
                    if e.code >= 500:                # Google overloaded: rest the model briefly; two in a row means it is busy everywhere
                        cool[model] = now + 10 * 60
                        if sum(1 for t in tried if t.endswith(("=500", "=502", "=503", "=504"))) >= 2:
                            raise RuntimeError(f"Gemini is busy right now (HTTP {e.code}), will retry next run")
                        break
                    if e.code == 400 and think:
                        continue                    # retry the same model without the thinking setting
                    break
                except Exception as e:  # noqa
                    last = f"{model}: {str(e)[:80]}"
                    tried.append(f"{model}=err")
                    break
            if len(tried) >= 4 or sum(1 for t in tried if t.endswith("=429")) >= 2:
                break
    finally:
        save()
    raise RuntimeError("Gemini unavailable: " + str(last) + " · tried " + ", ".join(tried))


def _claude(prompt, max_tokens):
    key = os.environ["ANTHROPIC_API_KEY"].strip()
    model = (NET.get("conf") or {}).get("summary_model") or "claude-haiku-5-5"
    body = json.dumps({"model": model, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]}).encode()
    j = json.loads(NET["get"]("https://api.anthropic.com/v1/messages", timeout=60, data=body,
                              headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", "Accept-Encoding": "identity"}))
    return "".join(b.get("text", "") for b in j.get("content", [])), "Claude " + model


def ask_json(prompt, max_tokens=1200):
    """Ask the configured model; return (parsed JSON object, model label). Raises when no key or the call fails."""
    p = provider()
    if not p:
        raise RuntimeError("no AI key set")
    txt, label = (_gemini if p == "gemini" else _claude)(prompt, max_tokens)
    txt = re.sub(r"^```(?:json)?|```$", "", txt.strip(), flags=re.M).strip()
    m = re.search(r"\{.*\}", txt, re.S)
    if not m:
        raise RuntimeError("AI reply was not JSON (" + label + "): " + txt[:90].replace("\n", " "))
    try:
        return json.loads(m.group(0)), label
    except ValueError as e:
        raise RuntimeError(f"AI reply was not valid JSON ({label}): {e}")
