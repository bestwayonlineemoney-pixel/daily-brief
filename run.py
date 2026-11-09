"""
The Daily Brief - run it on your own computer.

  python run.py            collects news every few minutes and opens http://localhost:8900
  python run.py --once     collect one time and stop

Your optional AI key goes in brief.env (never in this file):  ANTHROPIC_API_KEY=...
"""
import http.server
import json
import os
import socketserver
import sys
import threading
import time
import webbrowser
from functools import partial
from pathlib import Path

HOME = Path(__file__).resolve().parent
sys.path.insert(0, str(HOME / "collector"))


def load_env():
    f = HOME / "brief.env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
import collect  # noqa: E402

CONF = json.loads((HOME / "config.json").read_text(encoding="utf-8"))
PORT = int(CONF.get("port", 8900))
EVERY = max(3, int(CONF.get("refresh_minutes", 10))) * 60
kick = threading.Event()


def worker():
    while True:
        try:
            collect.run()
        except Exception as e:  # noqa
            print("Collector error:", e, flush=True)
        kick.wait(EVERY)
        kick.clear()


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.startswith("/data/") or self.path.endswith((".html", "/", ".js", ".css", ".webmanifest")):
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def do_POST(self):
        if self.path == "/api/refresh":
            kick.set()
            self.send_response(202)
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        else:
            self.send_error(404)

    def log_message(self, *a):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    if "--once" in sys.argv:
        collect.run()
        return
    try:
        srv = Server(("127.0.0.1", PORT), partial(Handler, directory=str(HOME / "site")))
    except OSError:
        print(f"Port {PORT} is already in use - The Daily Brief may already be running. Open http://localhost:{PORT}")
        webbrowser.open(f"http://localhost:{PORT}")
        return
    threading.Thread(target=worker, daemon=True).start()
    url = f"http://localhost:{PORT}"
    print(f"\n  THE DAILY BRIEF is running at {url}\n  New news every {EVERY // 60} minutes. Keep this window open (minimise it). Ctrl+C to stop.\n", flush=True)
    if "--no-browser" not in sys.argv:
        threading.Timer(2.5, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
