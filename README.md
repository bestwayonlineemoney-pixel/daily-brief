# The Daily Brief

The whole day, sorted and easy to read. Every few minutes it reads about 90 newsrooms and official sources (BBC, Al Jazeera, NYT, Guardian, DW, CNBC, CoinDesk, OilPrice, FXStreet, Mining.com, The Verge, NASA, WHO, the Fed, the SEC, the EIA, the UN, Ada Derana, EconomyNext, The National and others). It then:

- shows **only confirmed news**: a story appears only when 2 or more independent newsrooms report it, or when it comes straight from an official source. Single-source reports are kept out, and sites that mostly republish others never count as a confirmation. Crypto prices are checked against a second source
- opens with **While you were away**: what's new and what's been updated since your last visit, plus how prices moved since then
- sorts everything into chapters (World, War, Economy & stocks, Forex, Commodities, Energy, Crypto, your home region, Tech & AI, Science, Sport), each split into sub-topics such as Oil / Gas & LNG / Power, or Bitcoin / ETFs & regulators / Hacks
- has a **trader layer**: a market regime badge (risk-on / risk-off / chop), the 3 key drivers with why they matter, a "Why is it moving?" 24h BTC/ETH/SOL chart whose pins link price spikes to the confirmed news published around them, a derivatives panel (funding, open interest, long/short ratio and a positioning signal), a narrative heatmap, a session radar (Asia, London, New York, CME) and a high-impact events bar (FOMC from the Fed's calendar, official releases out today)
- tags every story with a tone (bullish / bearish / neutral, from a keyword list or AI when a key is set), an impact score from 1 to 10 and the assets it touches
- can send instant Telegram or Discord alerts for impact 8+/10 stories or watch words (add `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` or `DISCORD_WEBHOOK_URL` as GitHub secrets)
- has a **Macro** page with the latest official numbers (inflation, jobs, interest rates, growth for the US, euro area, UK and Japan) straight from the BLS, BEA, Federal Reserve, Treasury, ECB and others via the St. Louis Fed's FRED, plus an optional calendar of upcoming releases
- has a **5-minute brief**: a full-screen, swipe-through version of the day, one story per screen and chapter by chapter
- shows each story's one-line teaser from the outlet, every report in order, and a picture drawn from data (a globe with the place marked, a price chart and so on; no news photos)
- has a dark glass design with smooth animations, a live 3D globe and a bento layout
- lets you save stories, copy them with their sources, search, set watch words, get alerts, and look back at earlier days

It needs only Python. There's nothing to install with pip.

## Run it on your PC

1. Install Python 3.9 or newer from python.org. During setup, tick **Add python.exe to PATH**.
2. Double-click **start.bat**. Your browser opens at http://localhost:8900 and the page fills itself within about a minute.
3. Keep the black window open; you can minimise it. To start the app automatically with Windows, run **autostart.bat** once.

**On your phone:** if Tailscale is set up, run `tailscale serve --bg 8900` once on the PC, then open the address it prints on your phone. In the phone browser menu, choose **Add to Home screen** so it opens like an app.

## Run it 24/7 for free, with your PC off (GitHub)

1. Make a free account at github.com. Create a new **public** repository called `daily-brief` and upload everything in this folder. Don't upload `brief.env` or `state/`.
2. In the repository, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Open the **Actions** tab, select **Daily Brief**, and click **Run workflow**. After that it runs by itself every 15 minutes.
4. Your page is at `https://YOUR-NAME.github.io/daily-brief/`. Open it on your phone and add it to your home screen.

The page is public, so anyone with the link can see it. That's fine for news. Your saved stories and watch words stay in your own browser.

## Optional: AI-written "day in 60 seconds"

Without a key, the app shows the top story from each area. With a key, an AI writes 6–8 short lines from the day's headlines.

- **On your PC:** copy `brief.env.example` to `brief.env` and put your key after `ANTHROPIC_API_KEY=`.
- **On GitHub:** go to **Settings → Secrets and variables → Actions → New repository secret**. Name it `ANTHROPIC_API_KEY`.

To get the summary in another language, set `"summary_language"` in `config.json`, for example `"Sinhala"`. Never paste the key into a chat or put it in any other file.

## Optional: release calendar ("Coming up")

The macro numbers work without a key. To also see which official US data is due in the next week, get a free key at fred.stlouisfed.org (My Account → API Keys). On GitHub, add it as a repository secret named `FRED_API_KEY`; on your PC, put `FRED_API_KEY=...` in `brief.env`.

## Change sources or your region

Edit `config.json`:

- `feeds`: add or remove any RSS feed (`cat` is one of world, war, economy, crypto, tech, science, sport, home)
- `home_title` and `home_countries`: your home region
- `utc_offset_hours`: when your day starts (4 = Dubai, 5.5 = Sri Lanka)
- `watchlist_default`: your starting watch words

The footer of the page shows which sources were reachable on the last update.

## What is stored

Only each headline, the outlet, the time and the link are stored. The app never stores article text or photos; you read the full story on the outlet's own site. Prices come from CoinGecko and Yahoo Finance, and the Fear & Greed index from alternative.me. These numbers are for the big picture, not for trading.
