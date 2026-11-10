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
    if names and NET.get("write"):
        NET["write"](NET["state"] / "ai_models_list.json", {"at": int(time.time()), "models": names})
    return names


def _gemini(prompt, max_tokens):
    key = os.environ["GEMINI_API_KEY"].strip()
    conf = NET.get("conf") or {}
    good = (NET["read"](NET["state"] / "ai_model.json", {}) if NET.get("read") else {}).get("gemini")
    models = [m for m in [conf.get("gemini_model"), good] + _discover(key) + GEMINI_MODELS if m]
    models = list(dict.fromkeys(models))[:7]
    last, tried = None, []
    for model in models:
        for think in (True, False):           # 2.5 models accept a zero thinking budget (cheaper, faster); newer ones may not
            gen = {"maxOutputTokens": max_tokens, "temperature": 0.3, "responseMimeType": "application/json"}
            if think:
                gen["thinkingConfig"] = {"thinkingBudget": 0}
            body = json.dumps({"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": gen}).encode()
            try:
                raw = NET["get"](f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", timeout=60, data=body,
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json", "Accept-Encoding": "identity"})
                j = json.loads(raw)
                txt = "".join(p.get("text", "") for c in j.get("candidates", [])[:1] for p in (c.get("content") or {}).get("parts", []))
                if not txt:
                    last = "empty reply (" + str((j.get("candidates") or [{}])[0].get("finishReason") or j.get("promptFeedback")) + ")"
                    break
                if NET.get("write") and good != model:
                    NET["write"](NET["state"] / "ai_model.json", {"gemini": model})
                return txt, "Gemini " + model
            except urllib.error.HTTPError as e:
                msg = _err_msg(e)
                last = f"{model}: HTTP {e.code} {msg}"
                tried.append(f"{model}{'' if think else '(plain)'}={e.code}")
                if "API_KEY" in msg or "API key" in msg or e.code in (401, 403):
                    raise RuntimeError(f"Gemini key refused (HTTP {e.code} {msg}) - check the GEMINI_API_KEY secret")
                if e.code == 429:
                    raise RuntimeError(f"Gemini rate limit reached (HTTP 429 {msg[:80]}), will retry next run")
                if e.code == 400 and think:
                    continue                    # retry the same model without the thinking setting
                break                           # 404 model not found etc: try the next model
            except Exception as e:  # noqa
                last = f"{model}: {str(e)[:80]}"
                tried.append(f"{model}=err")
                break
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
        raise RuntimeError("AI reply was not JSON")
    return json.loads(m.group(0)), label
