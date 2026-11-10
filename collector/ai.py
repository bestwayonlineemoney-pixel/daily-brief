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


def _gemini(prompt, max_tokens):
    key = os.environ["GEMINI_API_KEY"].strip()
    conf = NET.get("conf") or {}
    good = (NET["read"](NET["state"] / "ai_model.json", {}) if NET.get("read") else {}).get("gemini")
    models = [m for m in [conf.get("gemini_model"), good] + GEMINI_MODELS if m]
    models = list(dict.fromkeys(models))
    last = None
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
                last = f"{model}: HTTP {e.code}"
                if e.code == 400 and think:
                    continue                    # retry the same model without the thinking setting
                if e.code in (401, 403):
                    raise RuntimeError("Gemini key refused (HTTP %d) - check the GEMINI_API_KEY secret" % e.code)
                if e.code == 429:
                    raise RuntimeError("Gemini rate limit reached (HTTP 429), will retry next run")
                break                           # 404 model not found etc: try the next model
            except Exception as e:  # noqa
                last = f"{model}: {str(e)[:80]}"
                break
    raise RuntimeError("Gemini unavailable: " + str(last))


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
