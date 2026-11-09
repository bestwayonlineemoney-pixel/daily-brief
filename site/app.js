/* The Daily Brief - front end. Reads data/today.json (written by the collector) and draws the whole day.
   Every picture is drawn here from data (globes, maps, charts, patterns). No news photos are used. */
'use strict';
(function () {
  /* ---------------- helpers ---------------- */
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, a, ...kids) {
    const n = document.createElement(tag);
    if (a) for (const [k, v] of Object.entries(a)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k === 'style') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) n.style.setProperty(sk, sv); else n.style[sk] = sv; } }
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) { if (k == null || k === false || k === '') continue; n.append(k.nodeType ? k : document.createTextNode(String(k))); }
    return n;
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  const S = { get(k, d) { try { const v = localStorage.getItem('db.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('db.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };
  const isNum = (x) => typeof x === 'number' && isFinite(x);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now() / 1000;
  const ago = (ts) => { const m = Math.max(1, Math.round((now() - ts) / 60)); return m < 60 ? m + ' min ago' : m < 60 * 36 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  const hm = (ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dshort = (ts) => new Date(ts * 1000).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rand(seed) { let a = hash(String(seed)); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function svg(vb, inner) { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', vb); s.setAttribute('preserveAspectRatio', 'xMidYMid slice'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = inner; return s; }
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2200); }

  /* ---------------- topics ---------------- */
  const CATS = ['world', 'war', 'economy', 'home', 'crypto', 'tech', 'science', 'sport'];
  const CAT = { world: ['World', '#7FB2FF'], war: ['War & conflict', '#FF6B5A'], economy: ['Economy & markets', '#FFD166'], crypto: ['Crypto', '#C6FF3D'],
    tech: ['Tech & AI', '#C59BFF'], science: ['Science & health', '#4FD1C5'], sport: ['Sport', '#FFA94D'], home: ['Home', '#FF8AD8'] };
  const SHORT = { world: 'World', war: 'War', economy: 'Economy', crypto: 'Crypto', tech: 'Tech & AI', science: 'Science', sport: 'Sport', home: 'Home' };
  const col = (c) => (CAT[c] || CAT.world)[1];
  const cname = (c) => (CAT[c] || CAT.world)[0];
  const TOP_CAP = { world: 4, war: 4, economy: 4, crypto: 3, tech: 3, science: 2, sport: 1, home: 2 };

  /* ---------------- state ---------------- */
  let LIVE = null, D = null, DAYS = [], DAY = null, MK = {}, BYID = {};
  let view = S.get('view', 'front'), query = '';
  let stars = S.get('stars', {}), watch = S.get('watch', null), alerts = S.get('alerts', false);
  const prevVisit = S.get('lastVisit', 0);
  let TOPO = null, FEATS = [], CENT = {}, MESH = null, GRAT = d3.geoGraticule10();
  const CENT_FIX = { 'United States of America': [-98, 39], France: [2.3, 46.6], Russia: [40, 56], Norway: [9, 61], Canada: [-98, 57], Netherlands: [5.3, 52.2], Denmark: [9.5, 56], Chile: [-71, -34], 'New Zealand': [172, -41], Indonesia: [113, -2], Malaysia: [102, 4] };

  /* ---------------- data ---------------- */
  async function getJSON(u) { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }
  function prepare(d) {
    d.stories = d.stories || [];
    BYID = {}; d.stories.forEach((s) => { BYID[s.id] = s; });
    if (!d.top || !d.top.length) { const per = {}; d.top = [];
      [...d.stories].sort((a, b) => (b.peak || b.score) - (a.peak || a.score)).forEach((s) => { if (d.top.length >= 12 || (per[s.cat] || 0) >= (TOP_CAP[s.cat] || 2)) return; d.top.push(s.id); per[s.cat] = (per[s.cat] || 0) + 1; }); }
    MK = {}; (d.markets || []).forEach((m) => { MK[m.k] = m; });
    CAT.home[0] = d.home_title || 'Home'; SHORT.home = d.home_title || 'Home';
    if (watch == null) watch = d.watchlist_default || [];
    return d;
  }
  const storiesOf = (c) => D.stories.filter((s) => c === 'home' ? s.home : s.cat === c).sort((a, b) => (b.peak || b.score) - (a.peak || a.score));
  const topStories = () => D.top.map((id) => BYID[id]).filter(Boolean);
  const watchRx = () => { const w = (watch || []).map((x) => x.trim()).filter(Boolean); return w.length ? new RegExp('\\b(' + w.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'i') : null; };
  let WRX = null;
  const watched = (s) => !!WRX && (WRX.test(s.title) || (s.reports || []).some((r) => WRX.test(r.t)));
  const isNew = (s) => !DAY && prevVisit > 0 && s.first > prevVisit;

  /* ---------------- pictures (all drawn from data) ---------------- */
  function marketFor(s) { for (const k of s.kw || []) { const m = MK[k]; if (m && m.spark && m.spark.length > 3) return m; } return null; }
  function fmtP(m, p) { p = isNum(p) ? p : m.p; if (!isNum(p)) return '—';
    const k = m.k; if (k === 'tnx') return p.toFixed(2) + '%'; if (k === 'spx' || k === 'ndx') return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (k === 'eur' || k === 'xrp') return (k === 'xrp' ? '$' : '') + p.toFixed(4); if (k === 'lkr' || k === 'dxy' || k === 'vix') return p.toFixed(2);
    return '$' + p.toLocaleString(undefined, { maximumFractionDigits: p >= 1000 ? 0 : 2 }); }
  const fmtC = (c) => isNum(c) ? (c >= 0 ? '+' : '') + c.toFixed(2) + '%' : '';
  function sparkPath(v, x0, x1, y0, y1) { v = (v || []).filter(isNum); if (v.length < 2) return ''; const mn = Math.min(...v), mx = Math.max(...v);
    return v.map((x, i) => (i ? 'L' : 'M') + (x0 + i / (v.length - 1) * (x1 - x0)).toFixed(1) + ' ' + (y1 - (x - mn) / (mx - mn || 1) * (y1 - y0)).toFixed(1)).join(' '); }
  let gid = 0;
  function stars_(r, n, w, h) { let o = ''; for (let i = 0; i < n; i++) o += `<circle cx="${(r() * w).toFixed(0)}" cy="${(r() * h).toFixed(0)}" r="${(r() * 1.3 + .3).toFixed(1)}" fill="#fff" opacity="${(r() * .5 + .1).toFixed(2)}"/>`; return o; }

  function artGlobe(s, big) {
    const W = 600, H = 600, c = col(s.cat), id = 'g' + (++gid), r = rand(s.id);
    const p0 = s.places[0], ll = p0.pt || CENT[p0.c] || [0, 20];
    const R = big ? 300 : 320, cx = 330 + (r() * 60 - 30), cy = big ? 300 : 270;
    const proj = d3.geoOrthographic().scale(R).translate([cx, cy]).rotate([-ll[0], -ll[1] * 0.85 + 6]).clipAngle(90).precision(.8);
    const path = d3.geoPath(proj), hot = new Set(s.places.map((p) => p.c));
    let land = '';
    FEATS.forEach((f) => { const d = path(f); if (!d) return; const h = hot.has(f.properties.name);
      land += `<path d="${d}" fill="${h ? c : '#353e52'}" fill-opacity="${h ? .88 : 1}" stroke="${h ? '#fff' : '#0b0f18'}" stroke-opacity="${h ? .55 : 1}" stroke-width="${h ? 1.4 : .6}"/>`; });
    let pins = '', arc = '';
    const vis = s.places.map((p) => ({ p, ll: p.pt || CENT[p.c] })).filter((x) => x.ll && d3.geoDistance(x.ll, ll) < 1.45);
    if (vis.length > 1) { const d = path({ type: 'LineString', coordinates: [vis[0].ll, vis[1].ll] }); if (d) arc = `<path d="${d}" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="2 7" stroke-linecap="round" opacity=".85"/>`; }
    vis.forEach((x, i) => { const [px, py] = proj(x.ll); const lab = esc(x.p.p.toUpperCase()), lw = lab.length * 11 + 20, lx = -lw / 2;
      pins += `<circle cx="${px}" cy="${py}" r="34" fill="none" stroke="${c}" stroke-opacity=".25" stroke-width="2"/><circle cx="${px}" cy="${py}" r="18" fill="none" stroke="${c}" stroke-opacity=".55" stroke-width="2"/>
        <circle cx="${px}" cy="${py}" r="7" fill="#fff"/><circle cx="${px}" cy="${py}" r="4" fill="${c}"/>
        ${i ? '' : `<g transform="translate(${px + lx},${py + 62})"><rect x="0" y="-22" width="${lw}" height="28" rx="6" fill="#0b0b0d" fill-opacity=".82" stroke="${c}" stroke-opacity=".6"/>
        <text x="10" y="-2" font-family="JetBrains Mono,monospace" font-size="15" font-weight="600" fill="#fff" letter-spacing="1">${lab}</text></g>`}`; });
    return svg(`0 0 ${W} ${H}`, `<defs><radialGradient id="${id}b" cx="60%" cy="40%" r="80%"><stop offset="0" stop-color="${c}" stop-opacity=".22"/><stop offset=".55" stop-color="#0c0e14"/><stop offset="1" stop-color="#060608"/></radialGradient>
      <radialGradient id="${id}o" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#22355c"/><stop offset=".7" stop-color="#0d1527"/><stop offset="1" stop-color="#070b14"/></radialGradient>
      <radialGradient id="${id}a" cx="50%" cy="50%" r="50%"><stop offset=".86" stop-color="${c}" stop-opacity=".45"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#${id}b)"/>${stars_(r, 70, W, H)}
      <circle cx="${cx}" cy="${cy}" r="${R * 1.1}" fill="url(#${id}a)"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${id}o)"/>
      <path d="${path(GRAT)}" fill="none" stroke="#fff" stroke-opacity=".07"/>${land}${arc}${pins}
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1.5"/>`);
  }
  function artMarket(s, m) {
    const c = col(s.cat), id = 'm' + (++gid), r = rand(s.id), d = sparkPath(m.spark, 0, 600, 150, 440), up = (m.chg || 0) >= 0;
    const v = m.spark.filter(isNum); void up; const mn = Math.min(...v), mx = Math.max(...v), ly = 440 - (v[v.length - 1] - mn) / (mx - mn || 1) * 290;
    let grid = ''; for (let i = 1; i < 12; i++) grid += `<line x1="0" y1="${i * 50}" x2="600" y2="${i * 50}" stroke="#fff" stroke-opacity=".045"/><line x1="${i * 50}" y1="0" x2="${i * 50}" y2="600" stroke="#fff" stroke-opacity=".045"/>`;
    let bars = ''; for (let i = 0; i < 30; i++) { const h = 20 + r() * 70; bars += `<rect x="${i * 20 + 3}" y="${600 - h}" width="12" height="${h}" fill="${c}" opacity=".08"/>`; }
    return svg('0 0 600 600', `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".45"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>
      <radialGradient id="${id}r" cx="80%" cy="20%" r="80%"><stop offset="0" stop-color="${c}" stop-opacity=".18"/><stop offset="1" stop-color="#0d0d10"/></radialGradient></defs>
      <rect width="600" height="600" fill="#0d0d10"/><rect width="600" height="600" fill="url(#${id}r)"/>${grid}${bars}
      <text x="-12" y="250" font-family="Anton,Impact" font-size="300" fill="${c}" opacity=".07">${esc(m.sym.replace(/[^A-Z0-9&]/gi, '').slice(0, 4))}</text>
      <path d="${d} L600 600 L0 600 Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${c}" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="598" cy="${ly}" r="22" fill="${c}" opacity=".2"/><circle cx="598" cy="${ly}" r="8" fill="${c}"/>`);
  }
  function artFlat(s) {
    const c = col(s.cat), id = 'f' + (++gid), home = s.cat === 'home', hot = new Set(home ? (D.home_countries || []) : []);
    const proj = home ? d3.geoMercator().center([66, 17]).scale(900).translate([300, 300]) : d3.geoNaturalEarth1().scale(165).translate([300, 330]);
    const path = d3.geoPath(proj); let land = '';
    FEATS.forEach((f) => { const d = path(f); if (d) land += `<path d="${d}" fill="${hot.has(f.properties.name) ? c : '#272c38'}" fill-opacity="${hot.has(f.properties.name) ? .8 : 1}" stroke="#0b0b0d" stroke-width=".6"/>`; });
    const r = rand(s.id); let dots = ''; for (let i = 0; i < 16; i++) { const x = 60 + r() * 480, y = 160 + r() * 300; dots += `<circle cx="${x}" cy="${y}" r="${3 + r() * 5}" fill="${c}" opacity="${.3 + r() * .6}"/>`; }
    return svg('0 0 600 600', `<defs><radialGradient id="${id}" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="${c}" stop-opacity=".16"/><stop offset="1" stop-color="#08090c"/></radialGradient></defs>
      <rect width="600" height="600" fill="#08090c"/><rect width="600" height="600" fill="url(#${id})"/><path d="${path(GRAT)}" fill="none" stroke="${c}" stroke-opacity=".1"/>${land}${home ? '' : dots}`);
  }
  function artPattern(s) {
    const c = col(s.cat), r = rand(s.id), id = 'p' + (++gid);
    if (s.cat === 'tech') { let o = ''; for (let i = 0; i < 46; i++) { const x = r() * 600, y = r() * 600, w = 30 + r() * 140, h = 20 + r() * 90, dir = r() > .5 ? 1 : -1;
        o += `<path d="M${x} ${y} h${w * dir} v${h}" fill="none" stroke="${c}" stroke-opacity="${.15 + r() * .3}" stroke-width="2"/><circle cx="${x + w * dir}" cy="${y + h}" r="4" fill="${c}" fill-opacity=".7"/>`; }
      const word = /\bai\b|artificial|openai|anthropic|chatgpt|gemini|model/i.test(s.title) ? 'AI' : /chip|nvidia|semiconductor/i.test(s.title) ? 'CHIP' : /cyber|hack/i.test(s.title) ? 'HACK' : /space|rocket|spacex/i.test(s.title) ? 'ORBIT' : 'TECH';
      return svg('0 0 600 600', `<defs><radialGradient id="${id}" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="${c}" stop-opacity=".25"/><stop offset="1" stop-color="#0b0912"/></radialGradient></defs>
        <rect width="600" height="600" fill="#0b0912"/><rect width="600" height="600" fill="url(#${id})"/>${o}
        <g transform="translate(300 270) rotate(${(r() * 16 - 8).toFixed(1)})"><rect x="-110" y="-110" width="220" height="220" rx="26" fill="#17112a" stroke="${c}" stroke-width="3"/>
        ${[-70, -25, 20, 65].map((k) => `<line x1="${k}" y1="-130" x2="${k}" y2="-110" stroke="${c}" stroke-width="4"/><line x1="${k}" y1="110" x2="${k}" y2="130" stroke="${c}" stroke-width="4"/><line x1="-130" y1="${k}" x2="-110" y2="${k}" stroke="${c}" stroke-width="4"/><line x1="110" y1="${k}" x2="130" y2="${k}" stroke="${c}" stroke-width="4"/>`).join('')}
        <text x="0" y="${word.length > 3 ? 22 : 34}" text-anchor="middle" font-family="Anton,Impact" font-size="${word.length > 3 ? 64 : 100}" fill="${c}">${word}</text></g>`); }
    if (s.cat === 'science' && /climate|cop\d|emission|warming|heat|carbon/i.test(s.title)) { const n = 40; let o = '';
      for (let i = 0; i < n; i++) { const t = i / (n - 1) + (r() - .5) * .25, cc = d3.interpolateRdBu(1 - Math.max(0, Math.min(1, t))); o += `<rect x="${i * 600 / n}" y="0" width="${600 / n + 1}" height="600" fill="${cc}"/>`; }
      return svg('0 0 600 600', o + '<rect width="600" height="600" fill="#000" opacity=".25"/>'); }
    if (s.cat === 'science' && /virus|dengue|disease|outbreak|vaccine|flu|covid|health|cancer|malaria|measles|cholera/i.test(s.title)) { let o = '';
      for (let k = 0; k < 7; k++) { const x = r() * 600, y = r() * 600, rr = 30 + r() * 70, sp = 14 + Math.floor(r() * 8); let sp2 = '';
        for (let j = 0; j < sp; j++) { const a = j / sp * Math.PI * 2; sp2 += `<line x1="${x + Math.cos(a) * rr}" y1="${y + Math.sin(a) * rr}" x2="${x + Math.cos(a) * rr * 1.28}" y2="${y + Math.sin(a) * rr * 1.28}" stroke="${c}" stroke-width="4"/><circle cx="${x + Math.cos(a) * rr * 1.3}" cy="${y + Math.sin(a) * rr * 1.3}" r="5" fill="${c}"/>`; }
        o += `<g opacity="${(.25 + r() * .6).toFixed(2)}"><circle cx="${x}" cy="${y}" r="${rr}" fill="#0d2a29" stroke="${c}" stroke-width="3"/>${sp2}</g>`; }
      return svg('0 0 600 600', `<rect width="600" height="600" fill="#061112"/>${o}`); }
    if (s.cat === 'sport' && /cricket|t20|odi|test match|wicket|ipl/i.test(s.title)) {
      return svg('0 0 600 600', `<defs><radialGradient id="${id}" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#1d3b1f"/><stop offset="1" stop-color="#0a160b"/></radialGradient></defs>
        <rect width="600" height="600" fill="#0a160b"/><ellipse cx="300" cy="300" rx="290" ry="250" fill="url(#${id})" stroke="#fff" stroke-opacity=".3" stroke-width="3"/>
        <ellipse cx="300" cy="300" rx="150" ry="125" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="2" stroke-dasharray="8 8"/>
        <rect x="282" y="200" width="36" height="200" fill="#c9b58a" opacity=".55"/>${[208, 392].map((y) => [-8, 0, 8].map((dx) => `<line x1="${300 + dx}" y1="${y - 14}" x2="${300 + dx}" y2="${y}" stroke="#fff" stroke-width="3"/>`).join('')).join('')}
        <circle cx="${330 + r() * 120}" cy="${170 + r() * 80}" r="16" fill="#D7263D"/>`); }
    if (s.cat === 'science') { let o = ''; const cx = 330 + r() * 80 - 40, cy = 260;
      for (let i = 0; i < 5; i++) { const rx = 70 + i * 52, ry = rx * (.3 + r() * .15), rot = r() * 60 - 30;
        o += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="none" stroke="${c}" stroke-opacity="${.5 - i * .07}" stroke-width="2"/>`;
        const a = r() * Math.PI * 2, px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry; o += `<circle cx="${px}" cy="${py}" r="${5 + r() * 9}" fill="${c}" transform="rotate(${rot} ${cx} ${cy})" opacity=".85"/>`; }
      return svg('0 0 600 600', `<defs><radialGradient id="${id}" cx="${cx / 6}%" cy="43%" r="40%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".12" stop-color="${c}" stop-opacity=".8"/><stop offset=".4" stop-color="${c}" stop-opacity=".12"/><stop offset="1" stop-color="#061112" stop-opacity="0"/></radialGradient></defs>
        <rect width="600" height="600" fill="#061112"/>${stars_(r, 120, 600, 600)}<rect width="600" height="600" fill="url(#${id})"/>${o}`); }
    if (s.cat === 'sport') { const a = r() * 10 - 5;
      return svg('0 0 600 600', `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1a10"/><stop offset="1" stop-color="#132a17"/></linearGradient></defs>
        <rect width="600" height="600" fill="url(#${id})"/>${Array.from({ length: 10 }, (_, i) => `<rect x="0" y="${i * 60}" width="600" height="30" fill="#fff" opacity=".018"/>`).join('')}
        <g transform="rotate(${a} 300 300)" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3"><rect x="40" y="70" width="520" height="460"/><line x1="300" y1="70" x2="300" y2="530"/><circle cx="300" cy="300" r="80"/>
        <rect x="40" y="200" width="90" height="200"/><rect x="470" y="200" width="90" height="200"/><circle cx="300" cy="300" r="4" fill="#fff"/></g>
        <circle cx="${380 + r() * 80}" cy="${210 + r() * 60}" r="30" fill="${c}"/><circle cx="${380 + r() * 80}" cy="${210 + r() * 60}" r="60" fill="${c}" opacity=".12"/>`); }
    if (s.cat === 'crypto') { const m = MK.btc; if (m && m.spark && m.spark.length > 3) return artMarket(s, m); }
    if (s.cat === 'economy') { const m = MK.spx; if (m && m.spark && m.spark.length > 3) return artMarket(s, m); }
    return artFlat(s);
  }
  function artMarketOf(s) { const m = marketFor(s); if (m && (s.cat === 'economy' || s.cat === 'crypto')) return m;
    if (s.places && s.places.length && FEATS.length && !['sport', 'tech', 'science'].includes(s.cat)) return null;
    if (s.cat === 'crypto' && MK.btc && (MK.btc.spark || []).length > 3) return MK.btc; if (s.cat === 'economy' && MK.spx && (MK.spx.spark || []).length > 3) return MK.spx; return null; }
  function mchip(m) { return el('span', { class: 'mchip' }, m.name + ' ', el('b', { text: fmtP(m) }), ' ', el('i', { class: (m.chg || 0) >= 0 ? 'u' : 'd', text: fmtC(m.chg) })); }
  function artFor(s, big) {
    const m = marketFor(s);
    if (m && (s.cat === 'economy' || s.cat === 'crypto')) return artMarket(s, m);
    if (s.places && s.places.length && FEATS.length && !['sport', 'tech', 'science'].includes(s.cat)) return artGlobe(s, big);
    if (s.places && s.places.length && FEATS.length && s.cat === 'science' && /quake|storm|flood|fire|hurricane|cyclone/i.test(s.title)) return artGlobe(s, big);
    return FEATS.length || !['world', 'war', 'home'].includes(s.cat) ? artPattern(s) : svg('0 0 600 600', '<rect width="600" height="600" fill="#101014"/>');
  }
  /* draw pictures only when they come near the screen (fast on phones) */
  const lazy = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { lazy.unobserve(e.target); paint(e.target); } }), { rootMargin: '400px' }) : null;
  function paint(box) { if (box.dataset.done) return; const s = BYID[box.dataset.id] || box._s; if (!s) return; box.dataset.done = 1; clear(box).append(artFor(s, box.dataset.big)); }
  function artBox(s, big) { const b = el('div', { class: 'art', 'data-id': s.id }); b._s = s; if (big) b.dataset.big = 1; if (lazy) lazy.observe(b); else paint(b); return b; }

  /* ---------------- small pieces ---------------- */
  function badges(s, light) {
    const out = [];
    if (s.breaking && !DAY) out.push(el('span', { class: 'badge brk', text: 'BREAKING' }));
    if (isNew(s)) out.push(el('span', { class: 'badge new', text: 'NEW' }));
    if (watched(s)) out.push(el('span', { class: 'badge watch', text: '★ WATCH' }));
    out.push(el('span', { class: 'badge ' + (s.status === 'VERIFIED' ? 'v' : s.status === 'OFFICIAL' ? 'o' : 's'), text: s.status === 'VERIFIED' ? '✓ ' + s.n + ' SOURCES' : s.status }));
    if (s.developing && !light) out.push(el('span', { class: 'badge devb', text: 'DEVELOPING · DAY ' + Math.max(2, Math.ceil((s.last - s.first) / 86400)) }));
    return out;
  }
  function card(s, cls) {
    const c = col(s.cat);
    return el('button', { class: 'card ' + (cls || '') + (watched(s) ? ' watched' : ''), style: { '--c': c }, onclick: () => openStory(s.id), 'aria-label': s.title },
      artBox(s, cls === 'lead'), el('div', { class: 'shade' }),
      el('div', { class: 'in' }, el('div', { class: 'tags' }, el('span', { class: 'cat', text: SHORT[s.cat] }), badges(s, true)),
        artMarketOf(s) ? mchip(artMarketOf(s)) : null, el('h2', { class: 'hl', text: s.title }),
        el('div', { class: 'cfoot' }, el('span', { class: 'src', text: (s.orgs || []).slice(0, 3).join(' · ') + (s.orgs.length > 3 ? ' +' + (s.orgs.length - 3) : '') + ' · ' + ago(s.last) }), el('span', { class: 'go', text: '→' }))));
  }
  function row(s) {
    return el('div', { class: 'it' + (watched(s) ? ' watched' : ''), role: 'button', tabindex: 0, onclick: () => openStory(s.id), onkeydown: (e) => { if (e.key === 'Enter') openStory(s.id); } },
      el('div', { class: 't', text: s.title }), el('div', { class: 'n' }, String(s.n || 1), el('small', { text: (s.n || 1) > 1 ? 'SOURCES' : 'SOURCE' })),
      el('div', { class: 'm' }, el('span', { class: 'dot', style: { '--c': col(s.cat) } }), SHORT[s.cat], badges(s, true), '·', ago(s.last), '·', (s.orgs || []).slice(0, 4).join(', ')));
  }
  function sec(title, c, sub, kids, more) {
    return el('section', { class: 'sec', style: { '--c': c } }, el('div', { class: 'sec-h' }, el('h2', { text: title }), sub ? el('span', { text: sub }) : null, more || null), kids);
  }

  /* ---------------- the live globe ---------------- */
  let GLOBE = null; const GROT = { r: null };
  function placeIndex(list) {
    const P = {};
    list.forEach((s) => (s.places || []).forEach((p) => { const ll = p.pt || CENT[p.c]; if (!ll) return; const k = p.p;
      const o = P[k] || (P[k] = { label: p.p, c: p.c, ll, n: 0, cats: {}, ids: [], score: 0 }); o.n++; o.cats[s.cat] = (o.cats[s.cat] || 0) + 1; o.ids.push(s.id); o.score += Math.max(1, s.score); }));
    return Object.values(P).map((o) => { o.cat = Object.entries(o.cats).sort((a, b) => b[1] - a[1])[0][0]; return o; }).sort((a, b) => b.score - a.score);
  }
  function mountGlobe(box, list) {
    if (GLOBE) GLOBE.stop();
    const cv = el('canvas', { 'aria-label': 'Globe showing where today\'s stories are happening' }); box.prepend(cv);
    const ctx = cv.getContext('2d'), P = placeIndex(list), hotC = {};
    P.forEach((p) => { const o = hotC[p.c] || (hotC[p.c] = { n: 0, cat: p.cat }); o.n += p.n; });
    const feats = FEATS.filter((f) => hotC[f.properties.name]);
    let W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = Math.min(devicePixelRatio || 1, 2);
    const proj = d3.geoOrthographic().clipAngle(90).precision(.7), path = d3.geoPath(proj, ctx);
    if (!GROT.r) { const f = P[0]; GROT.r = f ? [-f.ll[0] + 25, -Math.max(-40, Math.min(40, f.ll[1])) * .7] : [-30, -20]; }
    const rot = GROT.r; let hover = null, drag = null, idle = 0, raf = 0, last = 0, visible = true, spin = null;
    const mobile = () => W < 640;
    function size() { const b = box.getBoundingClientRect(); W = b.width; H = b.height; cv.width = W * dpr; cv.height = H * dpr;
      R = mobile() ? Math.min(W * .44, H * .36) : Math.min((W - 260) * .46, H * .42); cx = mobile() ? W / 2 : (W - 260) / 2 + 10; cy = mobile() ? H * .44 : H * .52; }
    size();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { size(); draw(performance.now()); }) : null; if (ro) ro.observe(box);
    function vis(ll) { return d3.geoDistance(ll, [-rot[0], -rot[1]]) < Math.PI / 2 - .05; }
    function draw(t) {
      proj.scale(R).translate([cx, cy]).rotate(rot);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      let g = ctx.createRadialGradient(cx, cy, R * .92, cx, cy, R * 1.3); g.addColorStop(0, 'rgba(127,178,255,.28)'); g.addColorStop(1, 'rgba(127,178,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.3, 0, 7); ctx.fill();
      g = ctx.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R); g.addColorStop(0, '#24395f'); g.addColorStop(.75, '#0e1729'); g.addColorStop(1, '#080c16');
      ctx.fillStyle = g; ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();
      ctx.beginPath(); path(GRAT); ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); FEATS.forEach((f) => path(f)); ctx.fillStyle = '#3a4459'; ctx.fill();
      feats.forEach((f) => { const o = hotC[f.properties.name]; ctx.beginPath(); path(f); ctx.globalAlpha = Math.min(.85, .3 + o.n * .08); ctx.fillStyle = col(o.cat); ctx.fill(); ctx.globalAlpha = 1; });
      ctx.beginPath(); path(MESH); ctx.strokeStyle = 'rgba(12,16,28,.85)'; ctx.lineWidth = .6; ctx.stroke();
      const ph = (t % 2400) / 2400; let labels = 0;
      P.forEach((p, i) => { if (!vis(p.ll)) { p.xy = null; return; } const [x, y] = proj(p.ll); p.xy = [x, y]; const c = col(p.cat), r0 = 3.5 + Math.sqrt(p.n) * 2.6; p.r = r0;
        ctx.beginPath(); ctx.arc(x, y, r0 + ph * 22, 0, 7); ctx.strokeStyle = c; ctx.globalAlpha = (1 - ph) * .7; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(x, y, r0 + 3, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r0, 0, 7); ctx.fillStyle = c; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r0 * .4, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
        if ((i < 5 || p === hover) && labels < 6) { labels++; ctx.font = '600 12px "JetBrains Mono",monospace'; const tw = ctx.measureText(p.label.toUpperCase()).width;
          ctx.fillStyle = 'rgba(10,10,12,.78)'; ctx.fillRect(x + r0 + 6, y - 10, tw + 12, 20); ctx.fillStyle = '#fff'; ctx.fillText(p.label.toUpperCase(), x + r0 + 12, y + 4); } });
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    function loop(t) { raf = requestAnimationFrame(loop); if (document.hidden || !visible || t - last < 33) return; const dt = Math.min(100, t - last); last = t;
      if (spin) { const k = Math.min(1, (t - spin.t0) / 900), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; rot[0] = spin.a[0] + (spin.b[0] - spin.a[0]) * e; rot[1] = spin.a[1] + (spin.b[1] - spin.a[1]) * e; if (k >= 1) spin = null; }
      else if (!drag && !hover && t > idle) rot[0] += dt * .0045;
      draw(t); }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) draw(0); else raf = requestAnimationFrame(loop);
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { visible = es[0].isIntersecting; }) : null; if (io) io.observe(box);
    const tip = $('tip');
    function pick(e) { const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; let best = null, bd = 1e9;
      P.forEach((p) => { if (!p.xy) return; const d = Math.hypot(p.xy[0] - x, p.xy[1] - y); if (d < p.r + 9 && d < bd) { bd = d; best = p; } }); return best; }
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, r: [...rot], moved: 0 }; spin = null; });
    window.addEventListener('pointerup', (e) => { if (!drag) return; const d = drag; drag = null; idle = performance.now() + 2500;
      if (d.moved < 6 && e.target === cv) { const p = pick(e); if (p) openPlace(p.label); } });
    cv.addEventListener('pointermove', (e) => {
      if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy)); rot[0] = drag.r[0] + dx * .32; rot[1] = Math.max(-70, Math.min(70, drag.r[1] - dy * .32)); if (still) draw(0); return; }
      const p = pick(e); hover = p; cv.style.cursor = p ? 'pointer' : 'grab';
      if (p) { const top = BYID[p.ids[0]]; tip.hidden = false; tip.innerHTML = `<b>${esc(p.label)}</b>${p.n} ${p.n > 1 ? 'stories' : 'story'} · ${esc(SHORT[p.cat])}<br><span style="color:#A6A7B1">${esc(top ? top.title : '')}</span>`;
        tip.style.left = Math.min(innerWidth - 310, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; } else tip.hidden = true; });
    cv.addEventListener('pointerleave', () => { hover = null; tip.hidden = true; });
    GLOBE = { stop() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); }, spinTo(ll) { spin = { t0: performance.now(), a: [...rot], b: [-ll[0], -Math.max(-60, Math.min(60, ll[1]))] }; idle = performance.now() + 4000; } };
    return P;
  }

  /* ---------------- page parts ---------------- */
  function renderTicker() {
    const order = ['btc', 'eth', 'sol', 'spx', 'ndx', 'gold', 'oil', 'dxy', 'tnx', 'vix', 'eur', 'lkr', 'xrp'];
    const items = order.map((k) => MK[k]).filter((m) => m && isNum(m.p)).map((m) => el('span', null, m.name, el('em', { text: fmtP(m) }), el('b', { class: (m.chg || 0) >= 0 ? 'u' : 'd', text: ((m.chg || 0) >= 0 ? '▲ ' : '▼ ') + fmtC(m.chg) })));
    if (D.fng) items.push(el('span', null, 'Crypto Fear & Greed', el('em', { text: D.fng.v + ' · ' + D.fng.label })));
    if (!items.length) items.push(el('span', null, 'Market numbers appear after the first update'));
    clear($('tick')).append(...items, ...items.map((n) => n.cloneNode(true)));
  }
  function renderNav() {
    const counts = {}; CATS.forEach((c) => { counts[c] = c === 'home' ? D.stories.filter((s) => s.home).length : D.stories.filter((s) => s.cat === c).length; });
    const nstar = Object.keys(stars).length;
    const btn = (k, label, c, n) => el('button', { class: view === k && !query ? 'on' : '', style: c ? { '--c': c } : null, onclick: () => go(k) }, c ? el('span', { class: 'sw', style: { '--c': c } }) : null, label, n ? el('span', { class: 'n', text: n }) : null);
    clear($('nav')).append(btn('front', 'Front page', null), ...CATS.map((c) => btn(c, SHORT[c], col(c), counts[c])), btn('saved', '☆ Saved', '#FFD166', nstar));
  }
  function renderBar() {
    const p = $('date'); clear(p).append(el('i'), DAY ? new Date(DAY + 'T12:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · archive'
      : new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · live');
    p.classList.toggle('arch', !!DAY);
    const m = $('meta'); clear(m);
    const f = D.feeds || {};
    m.append(`${D.stories.length ? (D.total || D.stories.length) : 0} stories · ${D.outlets || new Set(D.stories.flatMap((s) => s.orgs)).size} newsrooms & official sources` + (f.total ? ` · ${f.ok}/${f.total} sources reachable` : '') + (D.updated ? ' · updated ' + ago(D.updated) : ''));
    if (!DAY && location.protocol.startsWith('http')) m.append(' · ', el('a', { href: '#', style: { color: '#C6FF3D' }, onclick: (e) => { e.preventDefault(); refreshNow(); }, text: '↻ refresh' }));
    const i = DAYS.indexOf(DAY || (LIVE && LIVE.date));
    $('prevDay').disabled = !(DAYS.length && (DAY ? i < DAYS.length - 1 : DAYS.some((d) => d < LIVE.date)));
    $('nextDay').disabled = !DAY;
    const nn = D.stories.filter(isNew).length, chip = $('newChip');
    chip.hidden = !(nn && !DAY); if (nn) chip.textContent = `✦ ${nn} new since you were here ${ago(prevVisit)}`;
  }
  function renderBreaking() {
    const b = clear($('breaking')); if (DAY) return;
    const br = D.stories.filter((s) => s.breaking).sort((a, b) => b.n - a.n).slice(0, 2);
    br.forEach((s) => b.append(el('div', { class: 'breaking', onclick: () => openStory(s.id) }, el('span', { class: 'lbl', text: 'BREAKING' }), el('span', { class: 't', text: s.title }), el('small', { text: s.n + ' newsrooms · ' + ago(s.first) }))));
  }
  function briefBox() {
    const B = D.brief || { lines: [] };
    const box = el('div', { class: 'box brief' }, el('h3', { text: 'The day in 60 seconds' }),
      el('div', { class: 'sub', text: B.by === 'ai' ? 'Written by AI from today\'s top headlines · ' + ago(B.at) : 'The most important story in each area right now' }),
      el('span', { class: 'by', text: B.by === 'ai' ? 'AI SUMMARY' : 'AUTO' }));
    const ol = el('ol');
    (B.lines || []).forEach((L) => { const s = BYID[(L.ids || [])[0]]; const c = s ? col(s.cat) : '#C6FF3D';
      ol.append(el('li', { style: { '--c': c }, onclick: () => s && openStory(s.id) }, el('div', null, el('div', { class: 'tx', text: L.text }),
        s ? el('span', { class: 'who', text: SHORT[s.cat] + ' · ' + (s.n > 1 ? s.n + ' newsrooms' : s.status === 'OFFICIAL' ? 'official' : '1 source') + ' · ' + ago(s.last) }) : null))); });
    if (!(B.lines || []).length) ol.append(el('li', null, el('div', { class: 'tx', text: 'Waiting for the first stories…' })));
    box.append(ol); return box;
  }
  function globeBox(list) {
    const box = el('div', { class: 'box globe-box' });
    box.append(el('div', { class: 'gh' }, el('h3', { text: 'Where it\'s happening' }), el('div', { class: 'sub', text: 'Drag to turn · tap a dot for its stories' })));
    const lg = el('div', { class: 'legend' }); ['war', 'world', 'economy', 'crypto', 'tech', 'science', 'home'].forEach((c) => lg.append(el('span', null, el('i', { style: { '--c': col(c) } }), SHORT[c])));
    box.append(lg);
    const pl = el('div', { class: 'places' }, el('div', { class: 'ph', text: 'MOST NEWS TODAY' })); box.append(pl);
    requestAnimationFrame(() => { if (!FEATS.length) return; const P = mountGlobe(box, list);
      P.slice(0, 10).forEach((p) => pl.append(el('button', { style: { '--c': col(p.cat) }, onclick: () => { if (GLOBE) GLOBE.spinTo(p.ll); openPlace(p.label); } }, el('i'), p.label, el('b', { text: p.n })))); });
    return box;
  }
  function numsBox() {
    const box = el('div', { class: 'box' }, el('h3', { text: 'Numbers of the day' }), el('div', { class: 'sub', text: 'Last price · change on the day' }));
    const g = el('div', { class: 'nums' });
    ['btc', 'spx', 'gold', 'oil'].map((k) => MK[k]).filter(Boolean).forEach((m) => g.append(numTile(m)));
    box.append(g);
    if (D.fng) box.append(el('div', { style: { marginTop: '12px' } }, fngGauge(D.fng)));
    return box;
  }
  function numTile(m) {
    const up = (m.chg || 0) >= 0, c = up ? '#4ADE80' : '#F87171', d = sparkPath(m.spark, 0, 200, 4, 38);
    const t = el('div', { class: 'num', title: m.src ? 'Source: ' + m.src : '' }, el('div', { class: 'k', text: m.name }), el('div', { class: 'v', text: fmtP(m) }), el('div', { class: 'c', style: { color: c }, text: m.err ? 'not available now' : fmtC(m.chg) }));
    if (d) t.append(svg('0 0 200 40', `<path d="${d} L200 40 L0 40 Z" fill="${c}" fill-opacity=".1"/><path d="${d}" fill="none" stroke="${c}" stroke-width="1.6"/>`));
    t.querySelector('svg') && t.querySelector('svg').setAttribute('preserveAspectRatio', 'none');
    return t;
  }
  function fngGauge(f) {
    const a = Math.PI * (1 - f.v / 100), x = 60 + Math.cos(a) * 46, y = 62 - Math.sin(a) * 46;
    const c = f.v < 25 ? '#F87171' : f.v < 45 ? '#FFA94D' : f.v < 56 ? '#FFD166' : f.v < 76 ? '#A3E635' : '#4ADE80';
    return el('div', { class: 'gauge' }, svg('0 0 120 70', `<defs><linearGradient id="fg${++gid}"><stop offset="0" stop-color="#F87171"/><stop offset=".5" stop-color="#FFD166"/><stop offset="1" stop-color="#4ADE80"/></linearGradient></defs>
      <path d="M14 62 A46 46 0 0 1 106 62" fill="none" stroke="url(#fg${gid})" stroke-width="10" stroke-linecap="round"/><line x1="60" y1="62" x2="${x}" y2="${y}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="62" r="5" fill="#fff"/>`),
      el('div', null, el('div', { class: 'v', style: { color: c }, text: f.v }), el('div', { class: 'l', text: f.label }), el('small', { text: 'Crypto Fear & Greed index' })));
  }
  function developing(list) {
    const L = list.filter((s) => s.developing).sort((a, b) => b.score - a.score).slice(0, 8); if (!L.length) return null;
    return sec('Developing stories', '#FFD166', 'Still moving · started earlier, new reports today', el('div', { class: 'devrow' }, L.map((s) => {
      const span = Math.max(1, s.last - s.first), tl = el('div', { class: 'tl' });
      (s.reports || []).forEach((r) => tl.append(el('i', { style: { left: ((r.ts - s.first) / span * 100).toFixed(1) + '%' }, title: r.o + ' · ' + dshort(r.ts) + ' ' + hm(r.ts) })));
      tl.append(el('small', { style: { left: 0 }, text: dshort(s.first) }), el('small', { style: { right: 0 }, text: 'latest ' + hm(s.last) }));
      return el('button', { class: 'dev', onclick: () => openStory(s.id) }, el('div', { class: 'tags' }, el('span', { class: 'cat', style: { '--c': col(s.cat) }, text: SHORT[s.cat] }), badges(s)),
        el('div', { class: 't', text: s.title }), el('div', { class: 'kicker', text: s.n + ' newsrooms · ' + (s.reports || []).length + ' reports' }), tl);
    })));
  }
  function loudness() {
    const P = D.pulse; if (!P || !P.cats) return null;
    const W = 720, H = 220, pad = 26, bw = (W - pad) / 24, tot = Array.from({ length: 24 }, (_, i) => CATS.reduce((a, c) => a + ((P.cats[c] || [])[i] || 0), 0)), mx = Math.max(1, ...tot);
    let o = '';
    for (let i = 0; i < 24; i++) { let y = H - 24; CATS.forEach((c) => { const v = (P.cats[c] || [])[i] || 0; if (!v) return; const h = v / mx * (H - 50); y -= h;
        o += `<rect x="${pad + i * bw + 2}" y="${y.toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${col(c)}" opacity=".9"><title>${esc(SHORT[c])}: ${v} reports · ${hm(P.start + i * 3600)}</title></rect>`; });
      if (i % 3 === 0 || i === 23) o += `<text x="${pad + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#71727D" font-family="JetBrains Mono,monospace">${i === 23 ? 'now' : hm(P.start + i * 3600)}</text>`; }
    o += `<text x="0" y="14" font-size="11" fill="#71727D" font-family="JetBrains Mono,monospace">${mx}</text><line x1="${pad}" y1="${H - 24}" x2="${W}" y2="${H - 24}" stroke="#fff" stroke-opacity=".1"/>`;
    const s = svg(`0 0 ${W} ${H}`, o); s.setAttribute('preserveAspectRatio', 'none');
    const lg = el('div', { class: 'legend', style: { position: 'static', maxWidth: 'none', marginTop: '10px' } }); CATS.forEach((c) => lg.append(el('span', null, el('i', { style: { '--c': col(c) } }), SHORT[c])));
    const peak = tot.indexOf(mx);
    return el('div', { class: 'box loud' }, el('h3', { text: 'How loud the news was' }), el('div', { class: 'sub', text: `Reports per hour, last 24 hours · busiest hour ${hm(P.start + peak * 3600)}` }), s, lg);
  }
  function where(list) {
    const P = placeIndex(list).slice(0, 9); if (!P.length) return null; const mx = P[0].n;
    return el('div', { class: 'box where' }, el('h3', { text: 'Where the news is' }), el('div', { class: 'sub', text: 'Places named in today\'s stories' }),
      P.map((p, i) => el('div', { class: 'row', style: { '--c': col(p.cat) }, onclick: () => openPlace(p.label) }, el('span', { class: 'rk', text: i + 1 }), el('span', { text: p.label }), el('span', { class: 'kicker', text: p.n + (p.n > 1 ? ' stories' : ' story') }),
        el('div', { class: 'bar' }, el('i', { style: { width: (p.n / mx * 100) + '%' } })))));
  }
  function board() {
    const L = (D.markets || []).filter((m) => isNum(m.p)); if (!L.length) return null;
    const g = el('div', { class: 'board' }, L.map(numTile)); if (D.fng) g.append(el('div', { class: 'num fngt' }, fngGauge(D.fng)));
    return sec('Markets at a glance', '#F4F4F6', 'For the big picture, not for trading · CoinGecko & Yahoo Finance', g);
  }

  /* ---------------- views ---------------- */
  function viewFront(M) {
    const top = topStories(), used = new Set();
    if (!D.stories.length) { M.append(el('div', { class: 'empty', text: LIVE ? 'No stories in this file yet.' : 'Collecting the first news… this page fills itself in a minute.' })); return; }
    M.append(el('section', { class: 'hero' }, briefBox(), globeBox(D.stories)));
    const [a, b, c] = top; const rest = top.slice(3, 10); [a, b, c].forEach((x) => x && used.add(x.id));
    const fr = el('section', { class: 'front' }); if (a) fr.append(card(a, 'lead')); if (b) fr.append(card(b)); if (c) fr.append(card(c));
    fr.append(el('div', { class: 'side', style: { gridColumn: 'span 2' } }, el('div', { class: 'box also' }, el('h3', { text: 'Also today' }),
      el('ol', null, rest.map((x) => { used.add(x.id); return el('li', { onclick: () => openStory(x.id) }, el('div', null, el('div', { class: 't', text: x.title }),
        el('small', null, el('span', { class: 'dot', style: { '--c': col(x.cat) } }), SHORT[x.cat] + ' · ' + (x.n > 1 ? x.n + ' sources' : x.status === 'OFFICIAL' ? 'official' : '1 source') + ' · ' + ago(x.last)))); }))), numsBox()));
    M.append(fr);
    const W = D.stories.filter(watched).sort((a, b) => b.score - a.score).slice(0, 6);
    if (W.length) M.append(sec('Your watch words', '#FFD166', (watch || []).join(' · '), el('div', { class: 'list cols' }, W.map(row)),
      el('button', { class: 'more', onclick: editWatch, text: 'Edit words' })));
    const dv = developing(D.stories); if (dv) M.append(dv);
    const ld = loudness(), wh = where(D.stories); if (ld || wh) M.append(el('section', { class: 'sec two' }, ld || el('div'), wh || el('div')));
    CATS.forEach((k) => { const L = storiesOf(k).filter((s) => !used.has(s.id)); if (!L.length) return;
      const [x, y] = L, list = L.slice(2, 8);
      M.append(sec(cname(k), col(k), `${storiesOf(k).length} stories · most important first`, list.length ? el('div', { class: 'secgrid' }, card(x, 'sm'), y ? card(y, 'sm') : el('div'), el('div', { class: 'list' }, list.map(row))) : el('div', { class: 'secgrid fewer' }, L.slice(0, 3).map((z) => card(z, 'sm'))),
        el('button', { class: 'more', onclick: () => go(k), text: 'All ' + SHORT[k] + ' →' }))); });
    const bd = board(); if (bd) M.append(bd);
  }
  function viewCat(M, k) {
    const L = storiesOf(k);
    if (!L.length) { M.append(sec(cname(k), col(k), '', el('div', { class: 'empty', text: 'No ' + SHORT[k] + ' stories in the last 24 hours yet.' }))); return; }
    const g = el('section', { class: 'front' }); const [a, b, c] = L; if (a) g.append(card(a, 'lead')); if (b) g.append(card(b)); if (c) g.append(card(c));
    const nx = L.slice(3, 7); g.append(el('div', { class: 'side', style: { gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' } }, nx.map((s) => card(s, 'sm'))));
    M.append(sec(cname(k), col(k), `${L.length} stories in the last 24 hours · most important first`, g));
    if (k === 'economy' || k === 'crypto') { const ks = k === 'crypto' ? ['btc', 'eth', 'sol', 'xrp'] : ['spx', 'ndx', 'gold', 'oil', 'dxy', 'tnx', 'vix', 'lkr'];
      const ms = ks.map((x) => MK[x]).filter((m) => m && isNum(m.p)); if (ms.length) M.append(el('div', { class: 'board', style: { marginTop: '18px' } }, ms.map(numTile))); }
    if (L.length > 7) M.append(sec('More ' + SHORT[k], col(k), '', el('div', { class: 'list cols' }, L.slice(7).map(row))));
  }
  function viewList(M, title, c, L, sub, extra) {
    M.append(sec(title, c, sub, L.length ? el('div', { class: 'list cols' }, L.map(row)) : el('div', { class: 'empty', text: 'Nothing here yet.' }), extra));
  }
  function viewSaved(M) {
    const L = Object.values(stars).sort((a, b) => b.saved - a.saved);
    const copyAll = el('button', { class: 'more', onclick: () => copy(L), text: '⧉ Copy all' });
    const wrap = el('div', { class: 'list cols' }, L.map((s) => { const live = BYID[s.id]; const r = row(live || s); r.append(el('div', { class: 'm' }, 'saved ' + ago(s.saved / 1000), ' · ',
      el('a', { href: '#', onclick: (e) => { e.preventDefault(); e.stopPropagation(); delete stars[s.id]; S.set('stars', stars); render(); }, text: 'remove' }))); return r; }));
    M.append(sec('Saved stories', '#FFD166', 'Kept on this device · ' + L.length, L.length ? wrap : el('div', { class: 'empty', text: 'Open any story and press ☆ Save to keep it here.' }), L.length ? copyAll : null));
  }
  function render() {
    WRX = watchRx(); renderTicker(); renderNav(); renderBar(); renderBreaking();
    const M = clear($('main')); if (GLOBE && !(view === 'front' && !query)) { GLOBE.stop(); GLOBE = null; }
    if (query) { const q = query.toLowerCase(); const L = D.stories.filter((s) => (s.title + ' ' + (s.reports || []).map((r) => r.t + ' ' + r.o).join(' ') + ' ' + (s.places || []).map((p) => p.p).join(' ')).toLowerCase().includes(q)).sort((a, b) => b.score - a.score);
      viewList(M, 'Search', '#C6FF3D', L, `${L.length} stories match “${query}”`); }
    else if (view === 'front') viewFront(M);
    else if (CATS.includes(view)) viewCat(M, view);
    else if (view === 'saved') viewSaved(M);
    else if (view === 'new') viewList(M, 'New since your last visit', '#C6FF3D', D.stories.filter(isNew).sort((a, b) => b.score - a.score), 'since ' + ago(prevVisit));
    else { view = 'front'; viewFront(M); }
    renderFoot();
  }
  function renderFoot() {
    const f = D.feeds || {}, list = Object.entries(f.list || {});
    const det = list.length ? el('details', null, el('summary', { text: `Sources: ${f.ok}/${f.total} reachable on the last update` }),
      el('div', { class: 'fl' }, list.sort((a, b) => (a[1].ok === b[1].ok ? a[0].localeCompare(b[0]) : a[1].ok ? 1 : -1)).map(([n, h]) => el('span', { class: h.ok ? '' : 'bad', title: h.err || (h.n + ' headlines'), text: (h.ok ? '● ' : '○ ') + n + (h.ok ? ' · ' + h.n : ' · ' + (h.err || 'failed')) })))) : null;
    clear($('foot')).append(
      el('div', null, el('b', { text: 'How this page decides what matters. ' }), 'The same story from different newsrooms is grouped into one. ', el('b', { text: 'VERIFIED' }), ' = 2+ independent newsrooms · ', el('b', { text: 'OFFICIAL' }),
        ' = a government body, central bank, regulator, UN agency or scientific agency · ', el('b', { text: '1 SOURCE' }), ' = not confirmed yet. Importance = how many newsrooms carry it + official confirmation + big-event words + how fresh it is. ',
        'Only headlines and links are stored; read the full story at the source. Every picture on this page is drawn from data (globes, maps, charts), not news photos. ', det),
      el('div', null, el('b', { text: 'The Daily Brief' }), el('br'), 'Your own news desk. Saved stories and watch words stay on this device.', el('br'),
        el('a', { href: '#', style: { color: '#C6FF3D' }, onclick: (e) => { e.preventDefault(); editWatch(); }, text: 'Edit watch words' }), ' · ',
        el('a', { href: '#', style: { color: '#C6FF3D' }, onclick: (e) => { e.preventDefault(); scrollTo({ top: 0 }); }, text: 'Back to top' })));
  }

  /* ---------------- drawer: one story, all its reports ---------------- */
  function openDrawer(build) { const p = clear($('drPanel')); build(p); $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); document.body.classList.add('lock'); p.scrollTop = 0; setTimeout(() => { const x = p.querySelector('.dr-x'); if (x) x.focus(); }, 50); }
  function closeDrawer() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); document.body.classList.remove('lock'); if (location.hash.startsWith('#s=') || location.hash.startsWith('#p=')) history.replaceState(null, '', location.pathname + location.search); }
  function openStory(id) {
    const s = BYID[id] || stars[id]; if (!s) return;
    history.replaceState(null, '', '#s=' + id);
    openDrawer((p) => {
      const c = col(s.cat), saved = !!stars[s.id];
      const art = el('div', { class: 'dr-art' }, artFor(s, true)); p.append(art, el('button', { class: 'ib dr-x', onclick: closeDrawer, 'aria-label': 'Close', text: '✕' }));
      const sure = s.status === 'OFFICIAL' ? `Comes from an official source (${s.orgs.filter((o) => /SEC|Fed|ECB|Bank|BLS|IMF|United Nations|NASA|WHO|USGS/i.test(o)).join(', ') || s.orgs[0]})` + (s.n > 1 ? ` and is also reported by ${s.n - 1} more.` : '.')
        : s.status === 'VERIFIED' ? `Reported by ${s.n} independent newsrooms: ${s.orgs.join(', ')}.` : `Only ${s.orgs[0]} has reported this so far. Treat it as unconfirmed until others confirm it.`;
      const rel = D.stories.filter((x) => x.id !== s.id && ((x.places || []).some((pp) => (s.places || []).some((q) => q.c === pp.c)) || (x.kw || []).some((k) => (s.kw || []).includes(k)))).sort((a, b) => b.score - a.score).slice(0, 5);
      p.append(el('div', { class: 'dr-body', style: { '--c': c } },
        el('div', { class: 'tags' }, el('span', { class: 'cat', style: { '--c': c }, text: cname(s.cat) }), badges(s)),
        el('h2', { text: s.title }),
        el('div', { class: 'dr-meta' }, 'First report ' + dshort(s.first) + ' ' + hm(s.first), '·', 'latest ' + hm(s.last) + ' (' + ago(s.last) + ')', '·', s.n + (s.n > 1 ? ' newsrooms' : ' newsroom')),
        el('div', { class: 'dr-act' }, el('a', { class: 'btn pri', href: s.link, target: '_blank', rel: 'noopener noreferrer' }, 'Read the full story ↗'),
          el('button', { class: 'btn' + (saved ? ' on' : ''), onclick: (e) => { if (stars[s.id]) delete stars[s.id]; else stars[s.id] = Object.assign({}, s, { saved: Date.now() }); S.set('stars', stars); e.currentTarget.classList.toggle('on'); e.currentTarget.textContent = stars[s.id] ? '★ Saved' : '☆ Save'; renderNav(); }, text: saved ? '★ Saved' : '☆ Save' }),
          el('button', { class: 'btn', onclick: () => copy([s]), text: '⧉ Copy' }),
          navigator.share ? el('button', { class: 'btn', onclick: () => navigator.share({ title: s.title, url: s.link }).catch(() => {}), text: '↗ Share' }) : null),
        el('div', { class: 'dr-h', text: 'How sure is this?' }), el('div', { class: 'explain', text: sure }),
        (s.places || []).length ? [el('div', { class: 'dr-h', text: 'Where' }), el('div', { class: 'chips' }, s.places.map((pp) => el('span', { text: pp.p })))] : null,
        el('div', { class: 'dr-h', text: 'Every report, in order' }),
        (s.reports || []).map((r) => el('div', { class: 'rep' }, el('time', { text: (new Date(r.ts * 1000).toDateString() !== new Date().toDateString() ? dshort(r.ts) + ' ' : '') + hm(r.ts) }),
          el('div', null, el('b', { text: r.o }), el('a', { href: r.u, target: '_blank', rel: 'noopener noreferrer', text: r.t })))),
        rel.length ? [el('div', { class: 'dr-h', text: 'Related today' }), el('div', { class: 'list' }, rel.map(row))] : null));
    });
  }
  function openPlace(label) {
    const L = D.stories.filter((s) => (s.places || []).some((p) => p.p === label)).sort((a, b) => b.score - a.score); if (!L.length) return;
    history.replaceState(null, '', '#p=' + encodeURIComponent(label));
    const fake = { id: 'place-' + label, cat: L[0].cat, title: label, places: L[0].places.filter((p) => p.p === label).concat(L[0].places.filter((p) => p.p !== label)), kw: [] };
    openDrawer((p) => { p.append(el('div', { class: 'dr-art' }, artGlobe(fake, true)), el('button', { class: 'ib dr-x', onclick: closeDrawer, 'aria-label': 'Close', text: '✕' }),
      el('div', { class: 'dr-body' }, el('span', { class: 'kicker', text: 'PLACE' }), el('h2', { text: label }), el('div', { class: 'dr-meta', text: L.length + (L.length > 1 ? ' stories' : ' story') + ' today' }),
        el('div', { class: 'list', style: { marginTop: '14px' } }, L.map(row)))); });
  }
  function copy(L) {
    const txt = L.map((s) => `${s.title}\n${s.status === 'VERIFIED' ? 'Verified by ' + s.n + ' newsrooms' : s.status === 'OFFICIAL' ? 'Official' : 'One source so far'}: ${(s.orgs || []).join(', ')}\n${s.link}`).join('\n\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Copied ' + L.length + (L.length > 1 ? ' stories' : ' story')), () => { prompt('Copy:', txt); });
  }
  function editWatch() {
    openDrawer((p) => { const ta = el('textarea', { 'aria-label': 'Watch words, one per line' }); ta.value = (watch || []).join('\n');
      p.append(el('button', { class: 'ib dr-x', onclick: closeDrawer, 'aria-label': 'Close', text: '✕' }), el('div', { class: 'dr-body watchbox', style: { marginTop: '60px' } },
        el('span', { class: 'kicker', text: 'YOUR WATCH WORDS' }), el('h2', { text: 'What should jump out at you?' }),
        el('p', { class: 'meta', text: 'One word or name per line. Stories that mention them get a gold ★ and their own row on the front page. Turn on 🔔 to get a pop-up when a new one arrives.' }), ta,
        el('div', { class: 'dr-act' }, el('button', { class: 'btn pri', onclick: () => { watch = ta.value.split(/\n|,/).map((x) => x.trim()).filter(Boolean).slice(0, 40); S.set('watch', watch); closeDrawer(); render(); toast('Watch words saved'); }, text: 'Save' }),
          el('button', { class: 'btn', onclick: closeDrawer, text: 'Cancel' })))); });
  }

  /* ---------------- navigation, refresh, alerts ---------------- */
  function go(k) { view = k; query = ''; $('q').value = ''; S.set('view', k); render(); scrollTo({ top: 0, behavior: 'smooth' }); }
  async function loadDay(day) {
    if (!day || (LIVE && day === LIVE.date)) { DAY = null; D = prepare(LIVE); }
    else { try { DAY = day; D = prepare(await getJSON('data/archive/' + day + '.json')); } catch (e) { toast('That day is not saved'); DAY = null; D = prepare(LIVE); } }
    GROT.r = null; render();
  }
  $('prevDay').onclick = () => { const ref = DAY || LIVE.date, older = DAYS.filter((d) => d < ref); if (older.length) loadDay(older[0]); };
  $('nextDay').onclick = () => { const newer = DAYS.filter((d) => d > DAY).sort(); loadDay(newer[0] && newer[0] < LIVE.date ? newer[0] : null); };
  async function refreshNow() { try { await fetch('api/refresh', { method: 'POST' }); toast('Fetching the latest news…'); setTimeout(poll, 25000); } catch (e) { poll(); } }
  async function poll() {
    try { const d = await getJSON('data/today.json'); if (LIVE && d.updated === LIVE.updated) return;
      const oldIds = new Set(LIVE ? LIVE.stories.map((s) => s.id) : []); LIVE = d;
      if (!DAY) { const y = scrollY; D = prepare(LIVE); if (!$('drawer').classList.contains('open')) { render(); scrollTo(0, y); } else { renderTicker(); renderBar(); } }
      if (oldIds.size) { WRX = watchRx(); const fresh = d.stories.filter((s) => !oldIds.has(s.id) && (s.breaking || watched(s)));
        fresh.slice(0, 3).forEach((s) => { toast((s.breaking ? 'Breaking: ' : '★ ') + s.title.slice(0, 80));
          if (alerts && 'Notification' in window && Notification.permission === 'granted') { try { const n = new Notification(s.breaking ? 'Breaking · The Daily Brief' : '★ Watch word · The Daily Brief', { body: s.title + '\n' + s.orgs.slice(0, 3).join(', '), icon: 'icon-192.png', tag: s.id }); n.onclick = () => { focus(); openStory(s.id); }; } catch (e) { /* */ } } }); }
      getJSON('data/archive/index.json').then((x) => { DAYS = x.days || []; renderBar(); }).catch(() => {});
    } catch (e) { /* offline: keep showing what we have */ }
  }
  $('bell').classList.toggle('on', alerts);
  $('bell').onclick = async () => {
    if (!alerts && 'Notification' in window && Notification.permission !== 'granted') { try { await Notification.requestPermission(); } catch (e) { /* */ } }
    alerts = !alerts; S.set('alerts', alerts); $('bell').classList.toggle('on', alerts); toast(alerts ? 'Alerts on: breaking news and your watch words' : 'Alerts off');
  };
  $('watchBtn').onclick = editWatch;
  $('home').onclick = (e) => { e.preventDefault(); if (DAY) loadDay(null); go('front'); };
  $('newChip').onclick = () => go('new');
  $('drShade').onclick = closeDrawer;
  let qt = 0; $('q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { query = e.target.value.trim(); render(); }, 180); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if ($('drawer').classList.contains('open')) closeDrawer(); else if (query) { query = ''; $('q').value = ''; render(); } }
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); $('q').focus(); } });
  function markVisit() { S.set('lastVisit', now()); }
  setTimeout(markVisit, 20000); document.addEventListener('visibilitychange', () => { if (document.hidden) markVisit(); else poll(); });

  /* the map is simplified for speed: drop broken tiny rings and make every outline wind the way d3 expects */
  function fixShape(f) {
    const g = f.geometry; if (!g) return null;
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []).map((p) => p[0]).filter((r) => r && r.length >= 4)
      .map((r) => d3.geoArea({ type: 'Polygon', coordinates: [r] }) > 2 * Math.PI ? r.slice().reverse() : r).map((r) => [r]);
    if (!polys.length) return null;
    return { type: 'Feature', id: f.id, properties: f.properties, geometry: { type: 'MultiPolygon', coordinates: polys } };
  }
  /* ---------------- start ---------------- */
  async function start() {
    const mapP = fetch('vendor/world-lite.json').then((r) => r.json()).then((t) => { TOPO = t; const fc = topojson.feature(t, t.objects.countries); FEATS = fc.features.filter((f) => f.properties.name !== 'Antarctica').map(fixShape).filter(Boolean);
      FEATS.forEach((f) => { CENT[f.properties.name] = CENT_FIX[f.properties.name] || d3.geoCentroid(f); }); MESH = topojson.mesh(t, t.objects.countries, (a, b) => a !== b); }).catch(() => {});
    let tries = 0;
    for (;;) { try { LIVE = await getJSON('data/today.json'); break; } catch (e) { if (tries++ === 0) { D = prepare({ stories: [] }); render(); } await new Promise((r) => setTimeout(r, 8000)); } }
    await mapP; D = prepare(LIVE);
    try { DAYS = (await getJSON('data/archive/index.json')).days || []; } catch (e) { DAYS = []; }
    render();
    const h = location.hash; if (h.startsWith('#s=')) openStory(h.slice(3)); else if (h.startsWith('#p=')) openPlace(decodeURIComponent(h.slice(3)));
    setInterval(poll, 120000);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  start();
})();
