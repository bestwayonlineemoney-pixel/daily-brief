/* The Daily Brief - front end. Reads data/today.json (written by the collector) and lays the day out for reading.
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

  /* ---------------- pictures (all drawn from data) ---------------- */
  function marketFor(s) { for (const k of s.kw || []) { const m = MK[k]; if (m && m.spark && m.spark.length > 3) return m; } return null; }
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
    const c = col(s.cat), id = 'm' + (++gid), r = rand(s.id), d = sparkPath(m.spark, 0, 600, 205, 420), up = (m.chg || 0) >= 0;
    const v = m.spark.filter(isNum); void up; const mn = Math.min(...v), mx = Math.max(...v), ly = 420 - (v[v.length - 1] - mn) / (mx - mn || 1) * 215;
    let grid = ''; for (let i = 1; i < 12; i++) grid += `<line x1="0" y1="${i * 50}" x2="600" y2="${i * 50}" stroke="#fff" stroke-opacity=".045"/><line x1="${i * 50}" y1="0" x2="${i * 50}" y2="600" stroke="#fff" stroke-opacity=".045"/>`;
    let bars = ''; for (let i = 0; i < 30; i++) { const h = 20 + r() * 70; bars += `<rect x="${i * 20 + 3}" y="${600 - h}" width="12" height="${h}" fill="${c}" opacity=".08"/>`; }
    return svg('0 0 600 600', `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".45"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>
      <radialGradient id="${id}r" cx="80%" cy="20%" r="80%"><stop offset="0" stop-color="${c}" stop-opacity=".18"/><stop offset="1" stop-color="#0d0d10"/></radialGradient></defs>
      <rect width="600" height="600" fill="#0d0d10"/><rect width="600" height="600" fill="url(#${id}r)"/>${grid}${bars}
      <text x="300" y="330" text-anchor="middle" font-family="Anton,Impact" font-size="170" fill="${c}" opacity=".08">${esc(m.name.split(/[ /]/)[0].toUpperCase().slice(0, 7))}</text>
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
  /* draw pictures only when they come near the screen (fast on phones) */
  const lazy = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { lazy.unobserve(e.target); paint(e.target); } }), { rootMargin: '400px' }) : null;
  function paint(box) { if (box.dataset.done) return; const s = BYID[box.dataset.id] || box._s; if (!s) return; box.dataset.done = 1; clear(box).append(artFor(s, box.dataset.big)); }
  function artBox(s, big) { const b = el('div', { class: 'art', 'data-id': s.id }); b._s = s; if (big) b.dataset.big = 1; if (lazy) lazy.observe(b); else paint(b); return b; }

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
    /* glowing arcs between places named in the same story */
    const ARCS = []; list.slice(0, 40).forEach((s) => { const L = (s.places || []).map((p) => p.pt || CENT[p.c]).filter(Boolean); if (L.length > 1 && d3.geoDistance(L[0], L[1]) > .05) ARCS.push({ a: L[0], b: L[1], c: col(s.cat) }); });
    let W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = Math.min(devicePixelRatio || 1, 2);
    const proj = d3.geoOrthographic().clipAngle(90).precision(.7), path = d3.geoPath(proj, ctx);
    if (!GROT.r) { const f = P[0]; GROT.r = f ? [-f.ll[0] + 25, -Math.max(-40, Math.min(40, f.ll[1])) * .7] : [-30, -20]; }
    const rot = GROT.r; let hover = null, drag = null, idle = 0, raf = 0, last = 0, visible = true, spin = null;
    const mobile = () => W < 640;
    function size() { const b = box.getBoundingClientRect(); W = b.width; H = b.height; cv.width = W * dpr; cv.height = H * dpr;
      R = Math.min(W, H) * .40; cx = W / 2; cy = H / 2; }
    size();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { size(); draw(performance.now()); }) : null; if (ro) ro.observe(box);
    function vis(ll) { return d3.geoDistance(ll, [-rot[0], -rot[1]]) < Math.PI / 2 - .05; }
    function draw(t) {
      proj.scale(R).translate([cx, cy]).rotate(rot);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      let g = ctx.createRadialGradient(cx, cy, R * .9, cx, cy, R * 1.24); g.addColorStop(0, 'rgba(99,102,241,.38)'); g.addColorStop(.5, 'rgba(34,211,238,.10)'); g.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.24, 0, 7); ctx.fill();
      g = ctx.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R); g.addColorStop(0, '#1d2a52'); g.addColorStop(.7, '#0b1022'); g.addColorStop(1, '#05070f');
      ctx.fillStyle = g; ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();
      ctx.beginPath(); path(GRAT); ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); FEATS.forEach((f) => path(f)); ctx.fillStyle = '#2b3656'; ctx.fill();
      feats.forEach((f) => { const o = hotC[f.properties.name]; ctx.beginPath(); path(f); ctx.globalAlpha = Math.min(.85, .3 + o.n * .08); ctx.fillStyle = col(o.cat); ctx.fill(); ctx.globalAlpha = 1; });
      ctx.beginPath(); path(MESH); ctx.strokeStyle = 'rgba(12,16,28,.85)'; ctx.lineWidth = .6; ctx.stroke();
      ctx.save(); ctx.lineWidth = 1.8; ctx.setLineDash([3, 7]); ctx.lineDashOffset = -t / 40;
      ARCS.forEach((a) => { ctx.beginPath(); path({ type: 'LineString', coordinates: [a.a, a.b] }); ctx.strokeStyle = a.c; ctx.globalAlpha = .9; ctx.stroke(); }); ctx.restore(); ctx.globalAlpha = 1;
      const ph = (t % 2400) / 2400; let labels = 0; const placed = [], jobs = [];
      P.forEach((p, i) => { if (!vis(p.ll)) { p.xy = null; return; } const [x, y] = proj(p.ll); p.xy = [x, y]; const c = col(p.cat), r0 = 3.5 + Math.sqrt(p.n) * 2.6; p.r = r0;
        ctx.beginPath(); ctx.arc(x, y, r0 + ph * 22, 0, 7); ctx.strokeStyle = c; ctx.globalAlpha = (1 - ph) * .7; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(x, y, r0 + 3, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r0, 0, 7); ctx.fillStyle = c; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r0 * .4, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
        if ((i < 5 || p === hover) && labels < 6) { labels++; jobs.push([p, x, y, r0]); } });
      jobs.forEach(([p, x, y, r0]) => { ctx.font = '600 12px "JetBrains Mono",monospace'; const tw = ctx.measureText(p.label.toUpperCase()).width;
          const lx = x + r0 + 6 + tw + 12 > W - 4 ? x - r0 - 6 - tw - 12 : x + r0 + 6, box = [lx - 2, y - 12, lx + tw + 14, y + 12];
          if (!placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) { placed.push(box); ctx.fillStyle = 'rgba(10,10,12,.82)'; ctx.fillRect(lx, y - 10, tw + 12, 20); ctx.fillStyle = '#fff'; ctx.fillText(p.label.toUpperCase(), lx + 6, y + 4); } });
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

  /* ================= topics ================= */
  const CATS = ['world', 'war', 'economy', 'forex', 'commodities', 'energy', 'crypto', 'home', 'tech', 'science', 'sport'];
  const CAT = { world: 'World', war: 'War & conflict', economy: 'Economy & stocks', forex: 'Forex', commodities: 'Commodities', energy: 'Energy',
    crypto: 'Crypto', home: 'Home', tech: 'Tech & AI', science: 'Science & health', sport: 'Sport' };
  const SHORT = { world: 'World', war: 'War', economy: 'Economy', forex: 'Forex', commodities: 'Commodities', energy: 'Energy', crypto: 'Crypto', home: 'Home',
    tech: 'Tech & AI', science: 'Science', sport: 'Sport' };
  const ICON = { world: '◍', war: '⚑', economy: '▤', forex: '⇄', commodities: '◆', energy: '⚡', crypto: '₿', home: '⌂', tech: '⌘', science: '✚', sport: '◎' };
  /* colours for drawn pictures (always on dark backgrounds) */
  const DARK = { world: '#7FB2FF', war: '#FF6B5A', economy: '#A5B4FC', forex: '#5EEAD4', commodities: '#FFD166', energy: '#FF9F43', crypto: '#C6FF3D',
    home: '#FF8AD8', tech: '#C59BFF', science: '#67E8F9', sport: '#86EFAC' };
  const col = (c) => DARK[c] || DARK.world;
  const cv = (c) => 'var(--k-' + (DARK[c] ? c : 'world') + ')';
  const cname = (c) => CAT[c] || 'World';
  const TOP_CAP = { world: 3, war: 3, economy: 3, forex: 2, commodities: 2, energy: 2, crypto: 2, home: 2, tech: 2, science: 1, sport: 1 };
  const MKT = { crypto: ['btc', 'eth', 'sol', 'xrp'], forex: ['dxy', 'eur', 'gbp', 'jpy', 'cny', 'inr', 'lkr'], commodities: ['gold', 'silver', 'copper', 'wheat'],
    energy: ['oil', 'wti', 'gas'], economy: ['spx', 'ndx', 'dji', 'tnx', 'vix'] };
  const MKT_NAME = { crypto: 'Crypto', forex: 'Forex', commodities: 'Commodities', energy: 'Energy', economy: 'Stocks & rates' };
  const DEFAULT_MK = { crypto: 'btc', economy: 'spx', energy: 'oil', commodities: 'gold', forex: 'dxy' };

  /* sub-topics inside each chapter */
  const ME = new Set(['Israel', 'Palestine', 'Lebanon', 'Syria', 'Jordan', 'Iraq', 'Iran', 'Yemen', 'Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Oman', 'Kuwait', 'Bahrain', 'Turkey', 'Egypt']);
  function region(s) {
    const p = (s.places || [])[0]; if (!p) return 'Global';
    if (ME.has(p.c)) return 'Middle East';
    const ll = p.pt || CENT[p.c]; if (!ll) return 'Global'; const [x, y] = ll;
    if (x < -30) return 'Americas'; if (y > 35 && x < 60) return 'Europe'; if (x > -20 && x < 52 && y < 37) return 'Africa'; return 'Asia & Pacific';
  }
  const has = (s, c) => (s.places || []).some((p) => c.includes(p.c));
  const SUB = {
    war: [['Israel, Gaza & Lebanon', (s) => has(s, ['Israel', 'Palestine', 'Lebanon', 'Syria'])], ['Iran, Yemen & the Gulf', (s) => has(s, ['Iran', 'Yemen', 'Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Oman', 'Iraq'])],
      ['Russia & Ukraine', (s) => has(s, ['Russia', 'Ukraine', 'Belarus'])], ['Africa', (s) => region(s) === 'Africa'], ['Asia', (s) => region(s) === 'Asia & Pacific']],
    economy: [['Central banks & interest rates', /\bfed\b|federal reserve|\becb\b|central bank|rate cut|rate hike|interest rate|powell|lagarde|\bboj\b|bank of england|monetary/i],
      ['Inflation, jobs & growth', /inflation|\bcpi\b|\bppi\b|jobs|payroll|unemployment|wages|\bgdp\b|recession|growth|economy grew|shrank/i],
      ['Stocks & companies', /stocks?|shares|s&p|nasdaq|\bdow\b|wall street|earnings|\bipo\b|profit|revenue/i], ['Trade & tariffs', /tariff|trade|export|import|sanction/i],
      ['Debt, bonds & budgets', /debt|deficit|budget|bonds?|yields?|treasur/i]],
    forex: [['US dollar', /dollar|\bdxy\b|greenback/i], ['Euro & pound', /\beuro\b|\becb\b|sterling|pound|\bgbp\b|\beur\b/i], ['Asian currencies', /\byen\b|yuan|renminbi|rupee|\bwon\b|rupiah|ringgit|baht|\bboj\b/i],
      ['Emerging markets', /lira|peso|\brand\b|\breal\b|naira|ruble|rouble|emerging|devaluation|\bpeg\b/i]],
    commodities: [['Gold & silver', /gold|silver|platinum|palladium|bullion/i], ['Metals & mining', /copper|iron ore|alumin|nickel|lithium|zinc|cobalt|rare earth|steel|mining|miner/i],
      ['Farm & food', /wheat|corn|soy|coffee|cocoa|sugar|cotton|palm oil|rice|grain|food/i]],
    energy: [['Oil', /\boil\b|crude|brent|\bwti\b|opec|barrel|tanker|refin|shale|hormuz/i], ['Gas & LNG', /\bgas\b|\blng\b/i], ['Power & renewables', /power|electric|grid|solar|wind|renewable|nuclear|coal|batter/i]],
    crypto: [['Bitcoin', /bitcoin|\bbtc\b/i], ['ETFs, rules & regulators', /\betfs?\b|\bsec\b|regulat|\blaws?\b|\bbill\b|licen|cftc|\bban\b|\btax/i],
      ['Ethereum & altcoins', /ether|\beth\b|solana|\bxrp\b|ripple|cardano|token|altcoin|memecoin|dogecoin/i], ['Hacks & scams', /hack|exploit|stolen|scam|fraud|breach|drain/i],
      ['Companies & stablecoins', /coinbase|binance|tether|stablecoin|exchange|strategy|blackrock|circle/i]],
    tech: [['AI', /\bai\b|artificial intelligence|openai|anthropic|chatgpt|gemini|llm|\bmodels?\b/i], ['Big tech', /apple|google|microsoft|\bmeta\b|amazon|nvidia|tesla|samsung/i],
      ['Cyber & security', /cyber|hack|breach|ransom|malware/i], ['Space', /space|rocket|satellite|spacex|nasa/i], ['Chips & gadgets', /chip|semiconductor|phone|iphone|device|laptop/i]],
    science: [['Health', /health|virus|disease|vaccine|cancer|hospital|\bwho\b|outbreak|dengue|drug|patients?/i], ['Climate & environment', /climate|cop\d|emission|warming|flood|heat|storm|wildfire|environment|species|ocean/i],
      ['Space', /space|nasa|moon|mars|planet|rocket|asteroid|artemis|telescope/i]],
    sport: [['Cricket', /cricket|\bt20\b|\bodi\b|test match|wicket|\bipl\b/i], ['Football', /football|soccer|premier league|champions league|fifa|uefa|la liga|arsenal|chelsea|madrid/i],
      ['Formula 1 & motor', /formula|\bf1\b|grand prix|motogp/i], ['Tennis', /tennis|wimbledon|\batp\b|\bwta\b/i]],
    home: [['Sri Lanka', (s) => has(s, ['Sri Lanka']) || /sri lanka|colombo|lankan|cbsl/i.test(s.title)], ['UAE', (s) => has(s, ['United Arab Emirates']) || /\buae\b|dubai|abu dhabi|emirat/i.test(s.title)]],
  };
  const OTHER = { war: 'Other conflicts', economy: 'More business', forex: 'More currency news', commodities: 'More commodities', energy: 'More energy', crypto: 'More crypto',
    tech: 'More tech', science: 'Discoveries', sport: 'More sport', home: 'Gulf & region' };
  function subOf(s, c) {
    if (c === 'world') return region(s);
    const txt = s.title + ' ' + (s.dek || '');
    for (const [name, t] of SUB[c] || []) { if (typeof t === 'function' ? t(s) : t.test(txt)) return name; }
    return OTHER[c] || 'More';
  }

  /* ================= state ================= */
  let LIVE = null, D = null, DAYS = [], DAY = null, MK = {}, BYID = {};
  let view = 'front', query = '';
  let stars = S.get('stars', {}), watch = S.get('watch', null), alerts = S.get('alerts', false), seen = new Set(S.get('seen', []));
  /* "since you were last here" = the start of your last real visit (a reload a few minutes later keeps the same point) */
  let since = (() => { const last = S.get('lastVisit', 0); let anchor = S.get('anchor', 0); if (!anchor || (last && now() - last > 20 * 60)) { anchor = last; S.set('anchor', anchor); } return anchor; })();
  let snapPrev = S.get('snap', null), hiddenAt = 0;
  let TOPO = null, FEATS = [], CENT = {}, MESH = null; const GRAT = d3.geoGraticule10();
  const CENT_FIX = { 'United States of America': [-98, 39], France: [2.3, 46.6], Russia: [40, 56], Norway: [9, 61], Canada: [-98, 57], Netherlands: [5.3, 52.2], Denmark: [9.5, 56], Chile: [-71, -34], 'New Zealand': [172, -41], Indonesia: [113, -2], Malaysia: [102, 4] };
  let WRX = null;
  const sinceMode = () => !DAY && since > 0 && now() - since < 36 * 3600 && now() - since > 10 * 60;
  const isNew = (s) => sinceMode() && s.first > since;
  const isUpd = (s) => sinceMode() && !isNew(s) && s.n >= 2 && (s.reports || []).some((r) => r.ts > since);
  const newReports = (s) => (s.reports || []).filter((r) => r.ts > since).length;
  const watched = (s) => !!WRX && (WRX.test(s.title) || WRX.test(s.dek || ''));
  const quality = (s) => s.n >= 2 || s.status === 'OFFICIAL';
  const imp = (s) => s.peak || s.score;
  function markSeen(id) { if (seen.has(id)) return; seen.add(id); S.set('seen', [...seen].slice(-800)); }

  /* ================= numbers ================= */
  function fmtP(m, p) {
    p = isNum(p) ? p : m.p; if (!isNum(p)) return '—'; const k = m.k;
    if (k === 'tnx') return p.toFixed(2) + '%';
    if (['spx', 'ndx', 'dji'].includes(k)) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (['eur', 'gbp'].includes(k)) return p.toFixed(4); if (k === 'xrp') return '$' + p.toFixed(3);
    if (['lkr', 'dxy', 'vix', 'jpy', 'cny', 'inr'].includes(k)) return p.toFixed(2);
    if (k === 'copper' || k === 'gas') return '$' + p.toFixed(3); if (k === 'wheat') return p.toFixed(1) + '¢';
    return '$' + p.toLocaleString(undefined, { maximumFractionDigits: p >= 1000 ? 0 : 2 });
  }
  const fmtC = (c) => isNum(c) ? (c >= 0 ? '+' : '−') + Math.abs(c).toFixed(2) + '%' : '';
  const sinceChg = (m) => { if (!snapPrev || !snapPrev.p || !isNum(snapPrev.p[m.k]) || !isNum(m.p)) return null; return (m.p / snapPrev.p[m.k] - 1) * 100; };
  function saveSnap() { const p = {}; (LIVE && LIVE.markets || []).forEach((m) => { if (isNum(m.p)) p[m.k] = m.p; }); if (Object.keys(p).length) S.set('snap', { t: now(), p }); }

  /* ================= pictures: which one a story gets ================= */
  function marketArt(s) {
    const m = marketFor(s); if (m && ['economy', 'crypto', 'forex', 'commodities', 'energy'].includes(s.cat)) return m;
    if (s.places && s.places.length && FEATS.length && !['crypto', 'forex', 'commodities', 'energy'].includes(s.cat)) return null;
    const d = MK[DEFAULT_MK[s.cat]]; return d && (d.spark || []).length > 3 ? d : null;
  }
  function artFor(s, big) {
    const m = marketArt(s); if (m) return artMarket(s, m);
    if (s.places && s.places.length && FEATS.length && !['sport', 'tech', 'science'].includes(s.cat)) return artGlobe(s, big);
    if (s.places && s.places.length && FEATS.length && s.cat === 'science' && /quake|storm|flood|fire|hurricane|cyclone/i.test(s.title)) return artGlobe(s, big);
    if (['tech', 'science', 'sport'].includes(s.cat)) return artPattern(s);
    return FEATS.length ? artFlat(s) : svg('0 0 600 600', '<rect width="600" height="600" fill="#101014"/>');
  }

  /* ================= data ================= */
  async function getJSON(u) { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }
  function prepare(d) {
    d.stories = d.stories || []; BYID = {}; d.stories.forEach((s) => { s.cat = CAT[s.cat] ? s.cat : 'world'; s.also = s.also || []; BYID[s.id] = s; });
    if (!d.top || !d.top.length) { const per = {}; d.top = [];
      [...d.stories].filter(quality).sort((a, b) => imp(b) - imp(a)).forEach((s) => { if (d.top.length >= 12 || (per[s.cat] || 0) >= (TOP_CAP[s.cat] || 2)) return; d.top.push(s.id); per[s.cat] = (per[s.cat] || 0) + 1; }); }
    MK = {}; (d.markets || []).forEach((m) => { MK[m.k] = m; });
    CAT.home = d.home_title || 'Home'; SHORT.home = d.home_title || 'Home';
    if (watch == null) watch = d.watchlist_default || [];
    const w = (watch || []).map((x) => x.trim()).filter(Boolean);
    WRX = w.length ? new RegExp('\\b(' + w.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'i') : null;
    return d;
  }
  const inCat = (s, c) => c === 'home' ? (s.cat === 'home' || s.home) : s.cat === c;
  const storiesOf = (c) => D.stories.filter((s) => inCat(s, c)).sort((a, b) => imp(b) - imp(a));
  const alsoOf = (c) => D.stories.filter((s) => !inCat(s, c) && s.also.includes(c) && quality(s)).sort((a, b) => imp(b) - imp(a));
  const chapterOrder = () => CATS.filter((c) => storiesOf(c).length).sort((a, b) => {
    const A = storiesOf(a).filter(quality)[0], B = storiesOf(b).filter(quality)[0]; return (B ? imp(B) : -99) - (A ? imp(A) : -99); });

  /* ================= motion helpers ================= */
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rvObs = 'IntersectionObserver' in window && !still ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); rvObs.unobserve(e.target); runCounts(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  function rv(node, i) { node.classList.add('rv'); node.style.setProperty('--d', ((i || 0) * 70) + 'ms'); if (rvObs) rvObs.observe(node); else { node.classList.add('in'); runCounts(node); } return node; }
  const LASTNUM = {};
  function cnt(value, fmt, key) { const s = el('span', { class: 'cnt', text: fmt(value) }); s._to = value; s._fmt = fmt; s._from = key && isNum(LASTNUM[key]) ? LASTNUM[key] : (Math.abs(value) > 50 ? value * 0.96 : 0); if (key) LASTNUM[key] = value; return s; }
  function runCounts(root) {
    (root.classList && root.classList.contains('cnt') ? [root] : [...root.querySelectorAll('.cnt')]).forEach((n) => {
      if (n._done || !isNum(n._to)) return; n._done = 1; if (still || n._from === n._to) { n.textContent = n._fmt(n._to); return; }
      const a = n._from, b = n._to, t0 = performance.now(), dur = 900;
      const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); n.textContent = n._fmt(a + (b - a) * e); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }
  document.addEventListener('pointermove', (e) => { const g = e.target.closest && e.target.closest('.spot'); if (!g) return; const b = g.getBoundingClientRect(); g.style.setProperty('--mx', (e.clientX - b.left) + 'px'); g.style.setProperty('--my', (e.clientY - b.top) + 'px'); }, { passive: true });

  /* ================= small pieces ================= */
  function badge(s) {
    return s.status === 'OFFICIAL' ? el('span', { class: 'vb o', title: 'Comes from an official source' }, el('i', { text: '◆' }), 'Official source')
      : el('span', { class: 'vb v', title: 'Reported by ' + s.n + ' independent newsrooms' }, el('i', { text: '✓' }), 'Confirmed · ' + s.n + ' newsrooms');
  }
  function kicker(s, opt) {
    opt = opt || {};
    const k = el('div', { class: 'kick' });
    if (!opt.noCat) k.append(el('span', { class: 'kc', style: { '--c': cv(s.cat) } }, el('i'), SHORT[s.cat]));
    if (s.breaking && !DAY) k.append(el('span', { class: 'tag brk', text: 'Breaking' }));
    if (isNew(s)) k.append(el('span', { class: 'tag new', text: 'New' }));
    else if (isUpd(s)) k.append(el('span', { class: 'tag upd', text: '+' + newReports(s) + ' update' + (newReports(s) > 1 ? 's' : '') }));
    if (watched(s)) k.append(el('span', { class: 'tag watch', text: '★' }));
    k.append(badge(s), el('span', { class: 'tm', text: ago(s.last) }));
    return k;
  }
  const srcLine = (s) => el('div', { class: 'srcs', text: (s.orgs || []).slice(0, 4).join(' · ') + (s.orgs.length > 4 ? '  +' + (s.orgs.length - 4) : '') });
  function act(node, id) { node.tabIndex = 0; node.setAttribute('role', 'button'); node.onclick = () => openStory(id); node.onkeydown = (e) => { if (e.key === 'Enter') openStory(id); }; return node; }
  function item(s, opt) {
    opt = opt || {};
    const a = act(el('article', { 'data-sid': s.id, class: 'item spot' + (seen.has(s.id) ? ' read' : '') }), s.id);
    if (opt.thumb !== false) { const t = el('div', { class: 'th' }); t.append(artBox(s)); a.append(t); }
    a.append(el('div', { class: 'body' }, kicker(s, opt), el('h3', { text: s.title }), s.dek && !opt.noDek ? el('p', { class: 'dek', text: s.dek }) : null, opt.noSig ? null : sigRow(s), opt.noSrc ? null : srcLine(s)));
    return a;
  }
  function tileB(s, size) {
    const a = act(el('article', { 'data-sid': s.id, class: 'bt glass spot ' + (size || '') + (seen.has(s.id) ? ' read' : ''), style: { '--c': cv(s.cat) } }), s.id);
    const art = el('div', { class: 'bt-art' }); art.append(artBox(s, size === 'xl'));
    const m = marketArt(s); if (m) art.append(el('span', { class: 'mchip' }, m.name + ' ', el('b', { text: fmtP(m) }), ' ', el('i', { class: (m.chg || 0) >= 0 ? 'u' : 'd', text: fmtC(m.chg) })));
    a.append(art, el('div', { class: 'bt-body' }, kicker(s), el('h3', { text: s.title }), s.dek && (size === 'xl' || size === 'lg') ? el('p', { class: 'dek', text: s.dek }) : null, sigRow(s), srcLine(s)));
    return a;
  }
  function sec(title, opt, ...kids) {
    opt = opt || {};
    return rv(el('section', { class: 'sec ' + (opt.cls || ''), id: opt.id || null, style: opt.c ? { '--c': opt.c } : null },
      el('div', { class: 'sec-h' }, opt.eyebrow ? el('div', { class: 'eyebrow', text: opt.eyebrow }) : null, el('h2', { text: title }), opt.sub ? el('p', { class: 'sub', text: opt.sub }) : null, opt.more || null), kids));
  }
  function tile(m, big, mode) {
    const sc = sinceChg(m), useSince = mode === 'since' && sc !== null, chg = useSince ? sc : m.chg, up = (chg || 0) >= 0, d = sparkPath(m.spark, 0, 120, 4, 30);
    const t = el('div', { class: 'mt glass spot' + (big ? ' big' : ''), title: (m.src ? 'Source: ' + m.src : '') + (m.chk ? ' · checked against ' + m.chk.src + ' (' + (m.chk.diff >= 0 ? '+' : '') + m.chk.diff + '%)' : '') },
      el('div', { class: 'mt-n' }, m.name, m.ok ? el('span', { class: 'ck', title: 'Price confirmed by a second source', text: '✓' }) : null),
      el('div', { class: 'mt-v' }, isNum(m.p) ? cnt(m.p, (v) => fmtP(m, v), 'p_' + m.k) : '—'),
      el('div', { class: 'mt-c ' + (up ? 'u' : 'd') }, m.err ? 'not available' : (up ? '▲ ' : '▼ ') + fmtC(chg).replace(/^[+−]/, '') + (useSince ? ' since visit' : ' today')));
    if (d) { const g = svg('0 0 120 34', `<defs><linearGradient id="sg${++gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up ? '#34D399' : '#F87171'}" stop-opacity=".35"/><stop offset="1" stop-color="${up ? '#34D399' : '#F87171'}" stop-opacity="0"/></linearGradient></defs>
      <path d="${d} L120 34 L0 34 Z" fill="url(#sg${gid})"/><path class="draw" d="${d}" fill="none" stroke="${up ? '#34D399' : '#F87171'}" stroke-width="1.6" stroke-linejoin="round" pathLength="1"/>`); g.setAttribute('preserveAspectRatio', 'none'); g.classList.add('mt-s'); t.append(g); }
    return t;
  }
  function fngGauge(f) {
    const a = Math.PI * (1 - f.v / 100), x = 60 + Math.cos(a) * 46, y = 62 - Math.sin(a) * 46;
    const c = f.v < 25 ? '#F87171' : f.v < 45 ? '#FB923C' : f.v < 56 ? '#FACC15' : f.v < 76 ? '#A3E635' : '#34D399';
    return el('div', { class: 'mt glass spot gauge' }, svg('0 0 120 70', `<defs><linearGradient id="fg${++gid}"><stop offset="0" stop-color="#F87171"/><stop offset=".5" stop-color="#FACC15"/><stop offset="1" stop-color="#34D399"/></linearGradient></defs>
      <path d="M14 62 A46 46 0 0 1 106 62" fill="none" stroke="url(#fg${gid})" stroke-width="9" stroke-linecap="round"/><line x1="60" y1="62" x2="${x}" y2="${y}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="62" r="5" fill="#fff"/>`),
      el('div', null, el('div', { class: 'mt-n', text: 'Crypto Fear & Greed' }), el('div', { class: 'mt-v', style: { color: c } }, cnt(f.v, (v) => String(Math.round(v)), 'fng')), el('div', { class: 'mt-c', text: f.label })));
  }
  function stat(v, label, key) { return el('div', { class: 'stat' }, el('b', null, cnt(v, (x) => Math.round(x).toLocaleString(), key)), el('span', { text: label })); }


  /* ================= macro (official statistics) ================= */
  const MACRO_HOME = ['us_cpi', 'us_core', 'us_unemp', 'us_nfp', 'us_fed', 'us_10y'];
  function mval(x, v) { v = isNum(v) ? v : x.v; if (!isNum(v)) return '—';
    if (x.unit === 'k') return (x.k === 'us_nfp' && v > 0 ? '+' : '') + Math.round(v).toLocaleString() + 'k';
    if (x.unit === '%') return v.toFixed(x.group === 'Rates' ? 2 : 1) + '%'; if (x.unit === ' pts') return (v >= 0 ? '+' : '') + v.toFixed(2); return v.toFixed(1); }
  function mdate(d) { if (!d) return ''; const t = new Date(d + 'T12:00:00'); return d.slice(8) === '01' ? t.toLocaleDateString([], { month: 'short', year: 'numeric' }) : t.toLocaleDateString([], { day: 'numeric', month: 'short' }); }
  function mchg(x) { if (!isNum(x.v) || !isNum(x.prev)) return ''; const d = x.v - x.prev, u = x.unit === 'k' ? 'k' : x.unit === '%' || x.unit === ' pts' ? ' pts' : '';
    const n = x.unit === 'k' ? Math.round(Math.abs(d)).toLocaleString() : Math.abs(d).toFixed(x.group === 'Rates' ? 2 : 1); return (!parseFloat(n.replace(/,/g, '')) ? '= unchanged' : (d > 0 ? '▲ ' : '▼ ') + n + u) + ' vs ' + mdate(x.prev_date); }
  function macroTile(x) {
    const d = sparkPath(x.spark, 0, 120, 4, 30);
    const t = el('a', { class: 'mt mac glass spot', href: x.url || '#', target: '_blank', rel: 'noopener noreferrer', title: 'Official source: ' + x.src + (x.via ? ' · via ' + x.via : '') + ' · tap to see the full series' },
      el('div', { class: 'mt-n' }, x.name), el('div', { class: 'mt-v' }, isNum(x.v) ? cnt(x.v, (v) => mval(x, v), 'm_' + x.k) : '—'),
      el('div', { class: 'mt-c' }, x.err ? 'not available now' : mchg(x)), el('div', { class: 'mt-f' }, (x.region === 'United States' ? '' : x.region + ' · ') + mdate(x.date) + ' · ' + x.src));
    if (d) { const g = svg('0 0 120 34', `<path class="draw" d="${d}" fill="none" stroke="#A5B4FC" stroke-width="1.6" stroke-linejoin="round" pathLength="1"/>`); g.setAttribute('preserveAspectRatio', 'none'); g.classList.add('mt-s'); t.append(g); }
    return t;
  }
  function calBox(cal) {
    if (!cal || !cal.length) return null;
    const by = {}; cal.forEach((r) => { (by[r.date] = by[r.date] || []).push(r.name); });
    return el('div', { class: 'cal glass' }, Object.entries(by).slice(0, 6).map(([d, L]) => el('div', { class: 'cal-d' },
      el('div', { class: 'cal-day' }, el('b', { text: new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short' }) }), el('span', { text: new Date(d + 'T12:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' }) })),
      el('ul', null, L.slice(0, 5).map((n) => el('li', { text: n }))))));
  }
  function viewMacro(M) {
    const rows = (D.macro || []).filter((x) => isNum(x.v));
    M.append(el('section', { class: 'chero', style: { '--c': '#A5B4FC' } }, rv(el('div', { class: 'eyebrow' }, el('span', { class: 'ci', text: '∿' }), 'Official statistics'), 0),
      rv(el('h1', { class: 'grad-c', text: 'Macro' }), 1),
      rv(el('p', { class: 'lede', text: 'The latest official numbers on inflation, jobs, interest rates and growth, straight from the statistics offices and central banks. Each one shows the newest release, the change from the one before, and its source.' }), 2)));
    if (D.calendar && D.calendar.length) M.append(sec('Coming up', { eyebrow: 'Release calendar', sub: 'Official US data due in the next week' }, calBox(D.calendar)));
    if (!rows.length) { M.append(el('div', { class: 'empty glass', text: 'The macro numbers appear after the next update.' })); return; }
    ['United States', 'Euro area', 'United Kingdom', 'Japan'].forEach((rg) => { const L = rows.filter((x) => x.region === rg); if (!L.length) return;
      const groups = ['Inflation', 'Jobs', 'Rates', 'Growth'].map((g) => [g, L.filter((x) => x.group === g)]).filter(([, l]) => l.length);
      M.append(sec(rg, { eyebrow: rg === 'United States' ? 'The biggest economy' : 'Region' }, groups.map(([g, l]) => el('div', { class: 'mgrp' }, el('div', { class: 'grp-h', style: { '--c': '#A5B4FC' } }, el('i'), g),
        el('div', { class: 'mts' }, l.map((x, i) => rv(macroTile(x), i))))))); });
  }


  /* ================= trader layer: signals on stories ================= */
  const TR = () => D.trader || {};
  function sentPill(s) {
    if (!s.sentiment) return null;
    const k = s.sentiment === 'BULLISH' ? 'bull' : s.sentiment === 'BEARISH' ? 'bear' : 'neu';
    return el('span', { class: 'sp ' + k, title: (s.ai ? 'Tone judged by AI from the headlines' : 'Tone from a financial keyword list') + ' · not advice' },
      el('i', { text: k === 'bull' ? '▲' : k === 'bear' ? '▼' : '●' }), s.sentiment);
  }
  function impactMeter(s) {
    if (!isNum(s.impact)) return null;
    const lv = s.impact >= 8 ? 'hi' : s.impact >= 5 ? 'mid' : 'lo', bars = el('span', { class: 'im-b' });
    for (let i = 1; i <= 10; i++) bars.append(el('i', { class: i <= s.impact ? 'on' : '' }));
    return el('span', { class: 'im ' + lv, title: 'Impact score: who reported it, how many, how fast, and what it is about' }, '⚡ ', el('b', { text: s.impact }), '/10', bars);
  }
  function sigRow(s) {
    if (!s.sentiment && !(s.assets || []).length) return null;
    return el('div', { class: 'sig' }, sentPill(s), impactMeter(s), (s.assets || []).map((a) => el('span', { class: 'tk', text: a })));
  }

  /* ================= session radar (computed in the browser, any time zone) ================= */
  const SESS = [
    { name: 'Asia', city: 'Tokyo', tz: 'Asia/Tokyo', o: 9 * 60, c: 18 * 60 },
    { name: 'London', city: 'Europe', tz: 'Europe/London', o: 8 * 60, c: 16 * 60 + 30 },
    { name: 'New York', city: 'US equities 9:30 ET', tz: 'America/New_York', o: 9 * 60 + 30, c: 16 * 60 },
  ];
  function tzParts(date, tz) {
    const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date).forEach((x) => { p[x.type] = x.value; });
    return { wd: p.weekday, min: (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10) };
  }
  const isOpenAt = (s, d) => { const p = tzParts(d, s.tz); return !['Sat', 'Sun'].includes(p.wd) && p.min >= s.o && p.min < s.c; };
  function nextFlip(s, d) { for (let m = 5; m <= 4 * 1440; m += 5) { const t = new Date(d.getTime() + m * 60000); if (isOpenAt(s, t) !== isOpenAt(s, d)) return m; } return null; }
  const dur = (m) => m == null ? '' : m >= 1440 ? Math.floor(m / 1440) + 'd ' + Math.floor((m % 1440) / 60) + 'h' : m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm';
  function cmeOpen(d) { const p = tzParts(d, 'America/Chicago'); if (p.wd === 'Sat') return false; if (p.wd === 'Sun') return p.min >= 17 * 60; if (p.wd === 'Fri') return p.min < 16 * 60; return !(p.min >= 16 * 60 && p.min < 17 * 60); }
  function renderRadar() {
    const box = $('radar'); if (!box) return; const d = new Date(); clear(box);
    const open = SESS.map((s) => isOpenAt(s, d));
    SESS.forEach((s, i) => {
      const m = nextFlip(s, d), p = tzParts(d, s.tz), pct = open[i] ? Math.round((p.min - s.o) / (s.c - s.o) * 100) : 0;
      box.append(el('div', { class: 'rs' + (open[i] ? ' on' : ''), title: s.city + ' · ' + String(Math.floor(p.min / 60)).padStart(2, '0') + ':' + String(p.min % 60).padStart(2, '0') + ' local' },
        el('i'), el('b', { text: s.name }), el('span', { text: open[i] ? 'open · closes in ' + dur(m) : 'opens in ' + dur(m) }), open[i] ? el('u', { style: { width: pct + '%' } }) : null));
    });
    if (open[1] && open[2]) box.append(el('div', { class: 'rs ov on', title: 'London and New York are both open: usually the most liquid hours' }, el('i'), el('b', { text: 'Overlap' }), el('span', { text: 'London + New York' })));
    box.append(el('div', { class: 'rs' + (cmeOpen(d) ? ' on' : ''), title: 'CME crypto futures: Sunday 5pm to Friday 4pm Chicago time, with a daily 1-hour break' }, el('i'), el('b', { text: 'CME' }), el('span', { text: cmeOpen(d) ? 'crypto futures open' : 'closed' })));
    const nx = !DAY && typeof calGroups === 'function' ? calGroups().find((g) => g.t > now() && g.t - now() < 24 * 3600) : null;
    if (nx) box.prepend(el('button', { class: 'rs evc' + (nx.t - now() < 3600 ? ' soon' : ''), title: nx.where + ' · ' + nx.name + ' at ' + hm(nx.t) + ' · tap for the calendar',
      onclick: () => { const go2 = () => { const e = $('events'); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'center' }); }; if (view !== 'front' || query) { go('front'); setTimeout(go2, 150); } else go2(); } },
      el('i', { text: '⚡' }), el('b', { text: nx.cur + ' ' + nx.lead.title }), el('span', { class: 'cd', 'data-cd': nx.t, 'data-short': 1, text: cdShort(nx.t - now()) })));
    box.append(el('div', { class: 'rs me' }, el('b', { text: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }), el('span', { text: 'your time' })));
  }
  setInterval(renderRadar, 30000);

  /* ================= economic calendar: countdown to the next high-impact release ================= */
  const CURC = { USD: '#7FB2FF', EUR: '#A5B4FC', GBP: '#F9A8D4', JPY: '#FCA5A5', CNY: '#FCD34D', CAD: '#FB923C', AUD: '#5EEAD4', NZD: '#86EFAC', CHF: '#C4B5FD' };
  function calGroups() {
    const out = [];
    (TR().cal || []).forEach((e) => { const g = out.find((x) => x.t === e.t && x.cur === e.cur); if (g) g.items.push(e); else out.push({ t: e.t, cur: e.cur, where: e.where, items: [e] }); });
    out.forEach((g) => { g.lead = g.items.find((e) => e.f && !/^core /i.test(e.title)) || g.items.find((e) => e.f) || g.items[0]; g.name = g.items.map((e) => e.title).join(' · '); g.short = g.items.length > 1 ? g.lead.title + ' + ' + (g.items.length - 1) + ' more' : g.lead.title; });
    return out;
  }
  const cdText = (s) => { if (s <= 0) return 'out now'; const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60);
    return d ? d + 'd ' + h + 'h ' + String(m).padStart(2, '0') + 'm' : h ? h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(x).padStart(2, '0') + 's' : m + 'm ' + String(x).padStart(2, '0') + 's'; };
  const cdShort = (s) => s <= 0 ? 'now' : s >= 86400 ? Math.floor(s / 86400) + 'd ' + Math.floor(s % 86400 / 3600) + 'h' : s >= 3600 ? Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm' : Math.max(1, Math.ceil(s / 60)) + 'm';
  const whenTxt = (t) => { const d = new Date(t * 1000), td = new Date(), tm = new Date(Date.now() + 86400000);
    const day = d.toDateString() === td.toDateString() ? 'Today' : d.toDateString() === tm.toDateString() ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }); return day + ' ' + hm(t); };
  const curTag = (c) => el('span', { class: 'cur', style: { '--c': CURC[c] || '#B4B8C7' }, text: c });
  setInterval(() => { const n = now(); document.querySelectorAll('[data-cd]').forEach((x) => { const left = +x.dataset.cd - n; x.textContent = x.dataset.short ? cdShort(left) : cdText(left); x.classList.toggle('soon', left > 0 && left < 3600); }); }, 1000);
  function fillEvents(box) {
    clear(box); const G = calGroups(), n = now();
    const next = G.find((g) => g.t > n), just = G.filter((g) => g.t <= n && g.t > n - 90 * 60).pop();
    const later = G.filter((g) => g.t > n && g !== next && g.t < n + 3 * 86400).slice(0, 6);
    const E = TR().events || {}, rel = (E.released || []).map((id) => BYID[id]).filter(Boolean).slice(0, 2);
    if (!next && !just && !rel.length) { box.hidden = true; return; } box.hidden = false;
    const main = el('div', { class: 'evx-main' });
    if (just) main.append(el('div', { class: 'evx-just' }, el('span', { class: 'evx-k hot' }, el('i'), 'Just released'), curTag(just.cur), el('b', { text: just.where + ' ' + just.short }),
      el('span', { class: 'fine', text: hm(just.t) + (just.lead.f ? ' · forecast ' + just.lead.f : '') + (just.lead.p ? ' · previous ' + just.lead.p : '') + ' · expect fast moves for the next hour' })));
    if (next) {
      const soon = next.t - n < 3600;
      main.append(el('div', { class: 'evx-next' + (soon ? ' soon' : '') },
        el('span', { class: 'evx-k' }, el('i'), 'Next high-impact'),
        el('div', { class: 'evx-what' }, curTag(next.cur), el('b', { text: next.where + ' · ' + next.items.map((e) => e.title).join(' + ') }),
          el('span', { class: 'evx-when', text: whenTxt(next.t) })),
        el('div', { class: 'evx-cd' }, el('span', { class: 'evx-cl', text: 'in' }), el('span', { class: 'cd', 'data-cd': next.t, text: cdText(next.t - n) })),
        next.lead.f || next.lead.p ? el('div', { class: 'evx-fp' }, next.lead.f ? el('span', null, 'Forecast ', el('b', { text: next.lead.f })) : null, next.lead.p ? el('span', null, 'Previous ', el('b', { text: next.lead.p })) : null) : null));
    }
    box.append(main);
    if (later.length || rel.length) box.append(el('div', { class: 'evx-row' }, el('span', { class: 'evx-l', text: 'Coming up' }),
      rel.map((s) => act(el('span', { class: 'ev out' }, el('b', { text: 'Out today' }), s.title.length > 64 ? s.title.slice(0, 62) + '…' : s.title), s.id)),
      later.map((g) => el('span', { class: 'ev', title: g.name + (g.lead.f ? ' · forecast ' + g.lead.f : '') + (g.lead.p ? ' · previous ' + g.lead.p : '') + ' · source: ' + g.lead.src },
        curTag(g.cur), el('b', { text: g.short }), el('em', { text: whenTxt(g.t) })))));
    box.append(el('div', { class: 'evx-src fine', text: 'Times in your time zone · high-impact releases from the Forex Factory calendar, FOMC checked against the Federal Reserve' }));
  }
  function eventsBar() {
    if (DAY || !(TR().cal || []).length && !((TR().events || {}).released || []).length) return null;
    const box = el('div', { class: 'evx glass', id: 'events' }); fillEvents(box);
    clearInterval(eventsBar.t); eventsBar.t = setInterval(() => { if (box.isConnected) fillEvents(box); else clearInterval(eventsBar.t); }, 30000);
    return box.hidden ? null : rv(box, 0);
  }

  /* ================= live prices: Coinbase feed straight into the browser ================= */
  let LC_SYM = 'BTC', LC_RANGE = S.get('lcRange', 24), LC_MODE = S.get('lcMode', 'candles'), LC_OPT = S.get('lcOpt', { vwap: true, lv: true });
  const LC_NAME = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', GOLD: 'Gold', SPX: 'S&P 500', OIL: 'Brent oil' };
  const LC_TAB = { BTC: 'BTC', ETH: 'ETH', SOL: 'SOL', GOLD: 'Gold', SPX: 'S&P 500', OIL: 'Oil' };
  const LIVEPX = {}; let LCREF = null, LCDRAW = null; const PB = {}, PBT = {};
  const fmtLc = (sym, v) => !isNum(v) ? '—' : sym === 'SPX' ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '$' + v.toLocaleString(undefined, { minimumFractionDigits: v < 1000 ? 2 : 0, maximumFractionDigits: v >= 1000 ? 0 : 2 });
  const fmtUsd = (v) => !isNum(v) ? '—' : v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + Math.round(v);
  function liveSocket() {
    if (liveSocket.ws || !('WebSocket' in window)) return;
    try {
      const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com'); liveSocket.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD', 'ETH-USD', 'SOL-USD'], channels: ['ticker'] }));
      ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.type !== 'ticker') return; const sym = m.product_id.split('-')[0], p = parseFloat(m.price); if (!isNum(p)) return;
        const old = LIVEPX[sym]; LIVEPX[sym] = p; const t = performance.now();
        if (t - (PBT[sym] || 0) > 700) { PBT[sym] = t; pbTick(sym, p, PB[sym] && PB[sym].shown); if (LCREF && LCREF.sym === sym) LCREF.tick(p, old); } } catch (e) { /* */ } };
      ws.onclose = () => { liveSocket.ws = null; setTimeout(liveSocket, 15000); };
      ws.onerror = () => { try { ws.close(); } catch (e) { /* */ } };
    } catch (e) { liveSocket.ws = null; }
  }

  /* ================= the live price bar (header) ================= */
  const PB_KEYS = [['btc', 'BTC', 'BTC'], ['eth', 'ETH', 'ETH'], ['sol', 'SOL', 'SOL'], ['gold', 'Gold', 'GOLD'], ['oil', 'Brent', 'OIL'], ['spx', 'S&P 500', 'SPX'], ['dxy', 'DXY', 'DXY'], ['tnx', 'US 10Y', 'TNX']];
  function renderPriceBar() {
    const box = $('pbar'); if (!box) return; clear(box); const SP = TR().sparks || {};
    PB_KEYS.forEach(([k, label, sym]) => {
      const m = MK[k]; if (!m || !isNum(m.p)) return;
      const live = ['btc', 'eth', 'sol'].includes(k) && !DAY, base = isNum(m.chg) ? m.p / (1 + m.chg / 100) : null;
      const p = live && LIVEPX[sym] ? LIVEPX[sym] : m.p, chg = base && live && LIVEPX[sym] ? (p / base - 1) * 100 : m.chg;
      const bp = k === 'tnx' && isNum(m.bp), up = bp ? m.bp >= 0 : (chg || 0) >= 0;
      const sp = (SP[sym] && SP[sym].length > 3 ? SP[sym] : m.spark) || [], d = sparkPath(sp, 1, 55, 2, 18);
      const pEl = el('b', { class: 'pb-p', text: fmtP(m, p) }), cEl = el('i', { class: 'pb-c ' + (up ? 'u' : 'd'), text: bp ? (m.bp >= 0 ? '+' : '−') + Math.abs(m.bp).toFixed(1) + ' bp' : fmtC(chg) });
      const g = d ? svg('0 0 56 20', `<path d="${d}" fill="none" stroke="${up ? '#34D399' : '#F87171'}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`) : null;
      if (g) { g.setAttribute('preserveAspectRatio', 'none'); g.classList.add('pb-s'); }
      const chartable = ['BTC', 'ETH', 'SOL', 'GOLD', 'SPX', 'OIL'].includes(sym);
      box.append(el('button', { class: 'pb' + (live ? ' lv' : ''), title: m.name + (live ? ' · live from Coinbase' : ' · ' + (m.src || '') + ', about 15 min delayed') + (bp ? ' · change in basis points (0.01%)' : '') + (chartable ? ' · tap for the chart' : ''),
        onclick: () => chartable ? jumpChart(sym) : (k === 'tnx' ? go('macro') : null) },
      el('span', { class: 'pb-n' }, live ? el('span', { class: 'pb-live', 'aria-label': 'live' }) : null, label), pEl, cEl, g));
      PB[sym] = { m, pEl, cEl, base, shown: p };
    });
    if (!box.children.length) box.append(el('span', { class: 'fine', text: 'Prices appear after the first update' }));
  }
  function pbTick(sym, p) {
    const r = PB[sym]; if (!r || DAY || !r.pEl.isConnected) return;
    const old = r.shown; r.shown = p; r.pEl.textContent = fmtP(r.m, p);
    if (r.base) { const c = (p / r.base - 1) * 100; r.cEl.textContent = fmtC(c); r.cEl.className = 'pb-c ' + (c >= 0 ? 'u' : 'd'); }
    if (old && p !== old) { r.pEl.classList.remove('fu', 'fd'); void r.pEl.offsetWidth; r.pEl.classList.add(p > old ? 'fu' : 'fd'); }
  }
  function jumpChart(sym) {
    LC_SYM = sym;
    const show = () => { const c = $('charts'); if (!c) return; if (LCDRAW) LCDRAW(); c.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' }); };
    if (view !== 'front' || query || DAY) { if (DAY) { DAY = null; D = prepare(LIVE); } go('front'); setTimeout(show, 120); } else show();
  }

  /* ================= price × news chart: candles, volume, VWAP, key levels, sessions and the news pinned where it broke ================= */
  function liveChart() {
    const C = TR().catalysts || {}; const syms = ['BTC', 'GOLD', 'SPX', 'OIL', 'ETH', 'SOL'].filter((k) => C[k] && (C[k].pts || []).length > 10);
    if (!syms.length) return null;
    const card = el('div', { class: 'lc glass' });
    function draw() {
      if (!syms.includes(LC_SYM)) LC_SYM = syms[0];
      clear(card); LCREF = null;
      const sym = LC_SYM, X = C[sym], live = X.live && !DAY, LV = X.lv || {};
      const all = X.pts.map((p) => ({ t: p[0], c: p[1], o: isNum(p[2]) ? p[2] : p[1], h: isNum(p[3]) ? p[3] : p[1], l: isNum(p[4]) ? p[4] : p[1], v: isNum(p[5]) ? p[5] : 0 }));
      const tEnd = all[all.length - 1].t, cut = tEnd - LC_RANGE * 3600;
      let P = all.filter((b) => b.t >= cut); if (P.length < 8) P = all;
      const candles = LC_MODE === 'candles' && P.some((b) => b.h !== b.l), upd = X.chg24 >= 0, c1 = upd ? '#34D399' : '#F87171';
      /* running VWAP over the 24h window */
      let cpv = 0, cv_ = 0; const vw = all.map((b) => { cpv += (b.h + b.l + b.c) / 3 * b.v; cv_ += b.v; return cv_ > 0 ? cpv / cv_ : null; });
      const vwVis = all.map((b, i) => [b.t, vw[i]]).filter((x) => x[0] >= P[0].t && isNum(x[1])), hasVol = all.some((b) => b.v > 0);
      /* header */
      const tabs = el('div', { class: 'lc-tabs' }, syms.map((k) => el('button', { class: k === sym ? 'on' : '', onclick: () => { LC_SYM = k; draw(); } },
        el('b', { text: LC_TAB[k] }), el('i', { class: C[k].chg24 >= 0 ? 'u' : 'd', text: (C[k].chg24 >= 0 ? '+' : '') + C[k].chg24.toFixed(2) + '%' }))));
      const priceEl = el('span', { class: 'lc-p', text: fmtLc(sym, live && LIVEPX[sym] ? LIVEPX[sym] : P[P.length - 1].c) });
      const head = el('div', { class: 'lc-h' }, el('div', null, el('div', { class: 'lc-name' }, LC_NAME[sym], live ? el('span', { class: 'live' }, el('i'), 'LIVE') : el('span', { class: 'delay', text: '15-min delay' })),
        el('div', { class: 'lc-pr' }, priceEl, el('span', { class: 'chg ' + (upd ? 'u' : 'd'), text: (upd ? '▲ ' : '▼ ') + Math.abs(X.chg24).toFixed(2) + '%' }),
          el('span', { class: 'hl', text: '24h H ' + fmtLc(sym, LV.hi24 || X.hi) + '   L ' + fmtLc(sym, LV.lo24 || X.lo) }))), tabs);
      const seg = (opts, cur, set) => el('div', { class: 'seg' }, opts.map(([v, t]) => el('button', { class: v === cur ? 'on' : '', onclick: () => { set(v); draw(); }, text: t })));
      const tgl = (k, t, c) => el('button', { class: 'tgl' + (LC_OPT[k] ? ' on' : ''), style: { '--c': c }, onclick: () => { LC_OPT[k] = !LC_OPT[k]; S.set('lcOpt', LC_OPT); draw(); } }, el('i'), t);
      const stat = (k, v, cls) => el('span', { class: 'lst' }, el('em', { text: k }), el('b', { class: cls || '', text: v }));
      const lastP = P[P.length - 1].c, vwNow = vw[vw.length - 1];
      const ctl = el('div', { class: 'lc-ctl' },
        seg([[6, '6H'], [12, '12H'], [24, '24H']], LC_RANGE, (v) => { LC_RANGE = v; S.set('lcRange', v); }),
        seg([['candles', 'Candles'], ['line', 'Line']], LC_MODE, (v) => { LC_MODE = v; S.set('lcMode', v); }),
        hasVol ? tgl('vwap', 'VWAP', '#FACC15') : null, tgl('lv', 'Levels', '#A5B4FC'),
        el('div', { class: 'lc-stats' }, isNum(LV.rng) ? stat('24h range', LV.rng.toFixed(2) + '%' + (isNum(LV.prng) ? ' (prev ' + LV.prng.toFixed(1) + '%)' : '')) : null,
          isNum(vwNow) ? stat('VWAP', fmtLc(sym, vwNow), lastP >= vwNow ? 'u' : 'd') : null,
          isNum(LV.pdh) ? stat('Prev H / L', fmtLc(sym, LV.pdh) + ' / ' + fmtLc(sym, LV.pdl)) : null));
      /* geometry */
      const W = innerWidth < 720 ? 560 : innerWidth < 1120 ? 1000 : 880, H = innerWidth < 720 ? 520 : 540, pl = 6, pr = innerWidth < 720 ? 104 : 80, pt = 62, xb = 20, rib = 14, volH = hasVol ? 64 : 0, gap = hasVol ? 10 : 4;
      const yBot = H - xb - rib - volH - gap, vTop = yBot + gap, vBot = vTop + volH, rTop = vBot + 3;
      const t0 = P[0].t, t1 = P[P.length - 1].t, n = P.length, plotW = W - pl - pr;
      let lo = Math.min(...P.map((b) => candles ? b.l : b.c)), hi = Math.max(...P.map((b) => candles ? b.h : b.c));
      if (LC_OPT.vwap && vwVis.length) { lo = Math.min(lo, ...vwVis.map((x) => x[1])); hi = Math.max(hi, ...vwVis.map((x) => x[1])); }
      const pad = (hi - lo) * 0.08 || hi * 0.002, y0 = lo - pad, y1 = hi + pad;
      const xs = (t) => pl + (t - t0) / (t1 - t0 || 1) * plotW, ys = (v) => pt + (1 - (v - y0) / (y1 - y0)) * (yBot - pt);
      const bw = Math.max(1.2, plotW / n * 0.62);
      const fmtAx = (v) => v >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(v > 10 ? 1 : 3);
      let G = '';
      for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4, y = ys(v); G += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="#fff" stroke-opacity=".05"/><text x="${W - pr + 10}" y="${y + 4}" font-size="11" fill="#6B7080" font-family="JetBrains Mono,monospace">${fmtAx(v)}</text>`; }
      const span = t1 - t0, step = span > 20 * 3600 ? 4 * 3600 : span > 8 * 3600 ? 2 * 3600 : 3600;
      for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) G += `<line x1="${xs(t)}" x2="${xs(t)}" y1="${pt - 8}" y2="${yBot}" stroke="#fff" stroke-opacity=".03"/><text x="${xs(t)}" y="${H - 5}" font-size="11" fill="#6B7080" text-anchor="middle" font-family="JetBrains Mono,monospace">${hm(t)}</text>`;
      /* key levels */
      const LVL = [];
      if (LC_OPT.lv) { [['hi24', '24h H', '#94A3B8'], ['lo24', '24h L', '#94A3B8'], ['pdh', 'Prev H', '#A5B4FC'], ['pdl', 'Prev L', '#A5B4FC'], ['open24', '24h open', '#64748B']].forEach(([k, lab, col]) => { if (isNum(LV[k])) LVL.push({ v: LV[k], lab, col }); }); }
      LVL.forEach((L) => { if (L.v < y0 || L.v > y1) return; const y = ys(L.v); G += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="${L.col}" stroke-opacity=".55" stroke-dasharray="6 5"/><text x="${W - pr - 6}" y="${y - 5}" font-size="10.5" fill="${L.col}" text-anchor="end" font-family="Inter,sans-serif" font-weight="700">${L.lab} ${esc(fmtLc(sym, L.v))}</text>`; });
      /* price */
      let body = '';
      if (candles) P.forEach((b) => { const x = xs(b.t), up = b.c >= b.o, col = up ? '#34D399' : '#F87171', yo = ys(b.o), yc = ys(b.c);
        body += `<line x1="${x}" x2="${x}" y1="${ys(b.h)}" y2="${ys(b.l)}" stroke="${col}" stroke-width="1.1" opacity=".9"/><rect x="${(x - bw / 2).toFixed(2)}" y="${Math.min(yo, yc).toFixed(2)}" width="${bw.toFixed(2)}" height="${Math.max(1, Math.abs(yc - yo)).toFixed(2)}" fill="${col}" fill-opacity="${up ? .85 : .9}" rx="${bw > 4 ? 1 : 0}"/>`; });
      else { const line = P.map((b, i) => (i ? 'L' : 'M') + xs(b.t).toFixed(1) + ' ' + ys(b.c).toFixed(1)).join(' ');
        body = `<path d="${line} L${xs(t1)} ${yBot} L${xs(t0)} ${yBot} Z" fill="url(#lcg${++gid})"/><path class="draw" d="${line}" fill="none" stroke="${c1}" stroke-width="2.2" stroke-linejoin="round" pathLength="1" filter="url(#lcf${gid})"/>`; }
      if (LC_OPT.vwap && vwVis.length > 1) body += `<path d="${vwVis.map((x, i) => (i ? 'L' : 'M') + xs(x[0]).toFixed(1) + ' ' + ys(x[1]).toFixed(1)).join(' ')}" fill="none" stroke="#FACC15" stroke-width="1.6" stroke-opacity=".9" stroke-dasharray="1 0"/>`;
      /* volume */
      if (hasVol) { const mv = Math.max(...P.map((b) => b.v)) || 1; P.forEach((b) => { const h = b.v / mv * volH, x = xs(b.t); body += `<rect x="${(x - bw / 2).toFixed(2)}" y="${(vBot - h).toFixed(2)}" width="${bw.toFixed(2)}" height="${Math.max(.5, h).toFixed(2)}" fill="${b.c >= b.o ? '#34D399' : '#F87171'}" fill-opacity=".32"/>`; });
        G += `<text x="${W - pr + 10}" y="${vTop + 10}" font-size="10" fill="#555A6B" font-family="Inter,sans-serif">VOL</text>`; }
      /* sessions ribbon */
      const SC = ['#FCD34D', '#7FB2FF', '#34D399'], cw = Math.max(1, plotW / n);
      SESS.forEach((s, si) => { let run = null; const flush = (end) => { if (run) { body += `<rect x="${(run - cw / 2).toFixed(1)}" y="${rTop + si * 4}" width="${(end - run + cw).toFixed(1)}" height="3" rx="1.5" fill="${SC[si]}" fill-opacity=".75"/>`; run = null; } };
        P.forEach((b, i) => { const on = isOpenAt(s, new Date(b.t * 1000)), x = xs(b.t); if (on && run === null) run = x; if (!on) flush(xs(P[Math.max(0, i - 1)].t)); }); flush(xs(t1)); });
      /* news markers */
      const N = (X.news || []).map((x) => Object.assign({}, x, { s: BYID[x.story] })).filter((x) => x.s && x.t >= t0 - 900);
      let vlines = ''; N.forEach((x) => { const xx = xs(x.t); vlines += `<line x1="${xx}" x2="${xx}" y1="${pt - 26}" y2="${ys(x.p)}" stroke="${x.s.sentiment === 'BULLISH' ? '#34D399' : x.s.sentiment === 'BEARISH' ? '#F87171' : '#A5B4FC'}" stroke-opacity=".4" stroke-dasharray="2 4"/>`; });
      const g = svg(`0 0 ${W} ${H}`, `<defs><linearGradient id="lcg${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}" stop-opacity=".22"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></linearGradient>
        <filter id="lcf${gid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        ${G}${vlines}${body}<line class="xh" x1="0" x2="0" y1="${pt - 30}" y2="${vBot}" stroke="#fff" stroke-opacity=".25" stroke-dasharray="3 4" visibility="hidden"/><line class="yh" x1="${pl}" x2="${W - pr}" y1="0" y2="0" stroke="#fff" stroke-opacity=".18" stroke-dasharray="3 4" visibility="hidden"/>`);
      g.setAttribute('preserveAspectRatio', 'none'); g.classList.add('lc-svg');
      const wrap = el('div', { class: 'lc-chart' }, g), tip = el('div', { class: 'cc-tip lc-tip', hidden: true }), pop = el('div', { class: 'cc-pop lc-pop', hidden: true });
      /* levels outside the visible range: an arrow tag at the edge */
      LVL.filter((L) => L.v > y1 || L.v < y0).forEach((L) => wrap.append(el('span', { class: 'lvo ' + (L.v > y1 ? 't' : 'b'), style: { '--c': L.col }, text: (L.v > y1 ? '↑ ' : '↓ ') + L.lab + ' ' + fmtLc(sym, L.v) })));
      const lastB = P[P.length - 1], pY = (v) => Math.max(pt, Math.min(yBot, ys(v))) / H * 100;
      const nowDot = el('span', { class: 'nowdot', style: { left: (xs(lastB.t) / W * 100) + '%', top: pY(lastB.c) + '%', '--c': c1 } });
      const pline = el('div', { class: 'pline', style: { top: pY(live && LIVEPX[sym] ? LIVEPX[sym] : lastB.c) + '%', '--c': c1 } }, el('span', { text: fmtLc(sym, live && LIVEPX[sym] ? LIVEPX[sym] : lastB.c) }));
      wrap.append(pline, nowDot, tip, pop);
      const flags = [];
      N.forEach((x, i) => {
        const k = x.s.sentiment === 'BULLISH' ? 'up' : x.s.sentiment === 'BEARISH' ? 'dn' : 'nu', lvl = i % 2;
        const dot = el('span', { class: 'ndot ' + k, style: { left: (xs(x.t) / W * 100) + '%', top: (ys(x.p) / H * 100) + '%' } });
        const flag = el('button', { class: 'nflag ' + k + (lvl ? ' lv2' : ''), style: { left: (xs(x.t) / W * 100) + '%', '--d': (i * 110 + 400) + 'ms' }, 'aria-label': x.s.title,
          onclick: (e) => { e.stopPropagation(); select(i); } }, el('i', { text: x.s.impact || '•' }));
        flag.addEventListener('pointerenter', () => { tip.hidden = false; tip.textContent = hm(x.t) + ' · ' + x.s.title; tip.style.left = Math.max(0, Math.min(wrap.clientWidth - 300, xs(x.t) / W * wrap.clientWidth - 60)) + 'px'; });
        flag.addEventListener('pointerleave', () => { tip.hidden = true; });
        wrap.append(dot, flag); flags.push([flag, dot]);
      });
      (X.moves || []).filter((m) => !m.story && m.t >= t0).forEach((m) => wrap.append(el('span', { class: 'mvl ' + (m.chg > 0 ? 'u' : 'd'), style: { left: (xs(m.t) / W * 100) + '%', top: (ys(m.p) / H * 100) + '%' }, title: 'Move without confirmed news nearby: likely flows or technicals', text: (m.chg > 0 ? '+' : '') + m.chg.toFixed(1) + '%' })));
      const list = el('div', { class: 'lc-list' });
      function select(i) {
        flags.forEach(([f, d], j) => { f.classList.toggle('act', j === i); d.classList.toggle('act', j === i); });
        [...list.children].forEach((r, j) => r.classList.toggle('act', j === N.length - 1 - i));
        const x = N[i], st = x.s; clear(pop); pop.hidden = false;
        pop.append(el('div', { class: 'cp-h' }, el('b', { text: hm(x.t) }), ' · ' + dshort(x.t), el('button', { class: 'ib sm', onclick: (e) => { e.stopPropagation(); pop.hidden = true; flags.forEach(([f, d]) => { f.classList.remove('act'); d.classList.remove('act'); }); }, text: '✕' })),
          sigRow(st), el('div', { class: 'cp-t', text: st.title }), st.why ? el('div', { class: 'cp-w', text: st.why }) : null,
          el('div', { class: 'cp-r' }, el('span', null, 'When it broke ', el('b', { text: fmtLc(sym, x.p) })), isNum(x.chg1h) ? el('span', null, '1h later ', el('b', { class: x.chg1h >= 0 ? 'u' : 'd', text: fmtLc(sym, x.p1h) + ' (' + (x.chg1h >= 0 ? '+' : '') + x.chg1h.toFixed(2) + '%)' })) : null,
            isNum(x.move) ? el('span', null, 'Big move ', el('b', { class: x.move >= 0 ? 'u' : 'd', text: (x.move >= 0 ? '+' : '') + x.move.toFixed(1) + '%' })) : null),
          el('button', { class: 'btn sm', onclick: (e) => { e.stopPropagation(); openStory(st.id); }, text: 'Open story →' }));
      }
      N.slice().reverse().forEach((x, ri) => { const i = N.length - 1 - ri, k = x.s.sentiment === 'BULLISH' ? 'u' : x.s.sentiment === 'BEARISH' ? 'd' : '';
        list.append(el('button', { class: 'lr', onclick: () => select(i) }, el('span', { class: 'lr-t', text: hm(x.t) }), el('div', null, el('div', { class: 'lr-h' }, el('i', { class: 'sd ' + k }), x.s.title),
          el('div', { class: 'lr-m' }, '⚡ ' + (x.s.impact || '-') + '/10', isNum(x.chg1h) ? el('span', { class: x.chg1h >= 0 ? 'u' : 'd', text: '  ·  1h after ' + (x.chg1h >= 0 ? '+' : '') + x.chg1h.toFixed(2) + '%' }) : null)))); });
      const hover = (e) => { if (e.target.closest('.nflag')) return; const b = wrap.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * W, yy = (e.clientY - b.top) / b.height * H;
        const t = t0 + (x - pl) / plotW * (t1 - t0); let best = P[0]; P.forEach((p) => { if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p; });
        const xh = g.querySelector('.xh'), yh = g.querySelector('.yh'); xh.setAttribute('x1', xs(best.t)); xh.setAttribute('x2', xs(best.t)); xh.setAttribute('visibility', 'visible');
        if (yy >= pt && yy <= yBot) { yh.setAttribute('y1', yy); yh.setAttribute('y2', yy); yh.setAttribute('visibility', 'visible'); } else yh.setAttribute('visibility', 'hidden');
        tip.hidden = false; const ch = (best.c / best.o - 1) * 100;
        tip.textContent = dshort(best.t) + ' ' + hm(best.t) + '   ' + (candles ? 'O ' + fmtAx(best.o) + '  H ' + fmtAx(best.h) + '  L ' + fmtAx(best.l) + '  C ' + fmtAx(best.c) + '  ' + (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%' : fmtLc(sym, best.c))
          + (best.v && hasVol ? '   Vol ' + (best.v >= 1e6 ? (best.v / 1e6).toFixed(1) + 'M' : best.v >= 1e3 ? (best.v / 1e3).toFixed(1) + 'K' : best.v.toFixed(1)) : '');
        tip.style.left = Math.min(b.width - tip.offsetWidth - 4, Math.max(0, e.clientX - b.left - tip.offsetWidth / 2)) + 'px'; };
      wrap.addEventListener('pointermove', hover); wrap.addEventListener('pointerdown', hover);
      wrap.addEventListener('pointerleave', () => { tip.hidden = true; g.querySelector('.xh').setAttribute('visibility', 'hidden'); g.querySelector('.yh').setAttribute('visibility', 'hidden'); });
      const legend = el('div', { class: 'lc-leg' }, el('span', null, el('i', { style: { background: SC[0] } }), 'Asia'), el('span', null, el('i', { style: { background: SC[1] } }), 'London'), el('span', null, el('i', { style: { background: SC[2] } }), 'New York'),
        LC_OPT.vwap && vwVis.length ? el('span', null, el('i', { class: 'ln', style: { background: '#FACC15' } }), 'VWAP (24h)') : null, LC_OPT.lv ? el('span', null, el('i', { class: 'ln dash', style: { borderColor: '#A5B4FC' } }), 'Key levels') : null);
      card.append(head, ctl, el('div', { class: 'lc-body' }, el('div', { class: 'lc-main' }, wrap, legend,
        el('div', { class: 'fine lc-src' }, X.src + ' · 15-minute candles · flags = confirmed news, placed when it broke (number = impact) · tap one for the story and what price did next')),
        el('aside', { class: 'lc-side' }, el('div', { class: 'eyebrow', text: 'News on this chart' }), N.length ? list : el('p', { class: 'fine', text: 'No major confirmed news for this market in this window.' }))));
      if (live) {
        LCREF = { sym, tick(p, old) { priceEl.textContent = fmtLc(sym, p); priceEl.classList.remove('fu', 'fd'); void priceEl.offsetWidth; if (old) priceEl.classList.add(p >= old ? 'fu' : 'fd');
          nowDot.style.top = pY(p) + '%'; pline.style.top = pY(p) + '%'; pline.firstChild.textContent = fmtLc(sym, p); } };
        liveSocket(); if (LIVEPX[sym]) LCREF.tick(LIVEPX[sym]);
      }
    }
    LCDRAW = draw; draw(); return card;
  }

  /* ================= regime + key drivers ================= */
  function regimeBadge() {
    const R = TR().regime; if (!R) return null;
    const k = R.label === 'RISK-ON' ? 'on' : R.label === 'RISK-OFF' ? 'off' : 'chop';
    return el('div', { class: 'regime ' + k }, el('div', { class: 'rg-l' }, el('span', { class: 'rg-dot' }), el('span', { class: 'rg-k', text: 'Market regime' }), el('b', { text: R.label })),
      el('div', { class: 'rg-why' }, (R.why || []).map(([s, t]) => el('span', { class: s === '+' ? 'u' : 'd', text: (s === '+' ? '+ ' : '− ') + t }))));
  }
  function driversBox() {
    const ids = (TR().drivers || []).map((id) => BYID[id]).filter(Boolean); if (!ids.length) return null;
    return el('div', { class: 'drivers' }, el('div', { class: 'eyebrow', text: 'The 3 key drivers · last 8 hours' }),
      ids.map((s, i) => act(el('div', { class: 'drv spot', style: { '--c': cv(s.cat) } }, el('span', { class: 'drv-n', text: i + 1 }),
        el('div', null, sigRow(s), el('div', { class: 'drv-t', text: s.title }), s.why ? el('div', { class: 'drv-w', text: s.why }) : null)), s.id)));
  }

  /* ================= derivatives & orderflow ================= */
  const miniLine = (v, col, w, h) => { const d = sparkPath(v, 1, w - 1, 2, h - 2); if (!d) return null; const g = svg(`0 0 ${w} ${h}`, `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`); g.setAttribute('preserveAspectRatio', 'none'); g.classList.add('mini'); return g; };
  function splitBar(a, b, la, lb, ca, cb) {
    const tot = (a || 0) + (b || 0); if (!tot) return null; const pa = a / tot * 100;
    return el('div', { class: 'sbar', style: { '--a': ca, '--b': cb } }, el('i', { class: 'a', style: { width: pa + '%' } }, la), el('i', { class: 'b', style: { width: (100 - pa) + '%' } }, lb));
  }
  function derivCard(sym, d, lq) {
    const sigk = /squeeze risk|pressing/i.test(d.signal || '') ? 'bear' : /short squeeze|healthy/i.test(d.signal || '') ? 'bull' : /leverage/i.test(d.signal || '') ? 'warn' : 'neu';
    const f = d.funding, fk = !isNum(f) ? '' : f >= 0.05 ? 'hot' : f >= 0.02 ? 'warm' : f <= -0.01 ? 'cold' : 'calm';
    const fpos = isNum(f) ? Math.max(0, Math.min(100, 50 + f / 0.1 * 50)) : 50;
    const ls = d.ls, lp = isNum(ls) ? ls / (1 + ls) * 100 : null;
    const oiu = d.oi_usd, oiTxt = isNum(oiu) ? fmtUsd(oiu) : isNum(d.oi_coin) ? Math.round(d.oi_coin).toLocaleString() + ' ' + sym : '—';
    const nx = d.next ? Math.max(0, Math.round((d.next - now()) / 60)) : null, fl = d.flow;
    const bs = fl && fl.buy + fl.sell ? fl.buy / (fl.buy + fl.sell) * 100 : null, cvdUp = fl && fl.cvd && fl.cvd.length ? fl.cvd[fl.cvd.length - 1] >= 0 : true;
    const L = lq && !lq.err ? lq : null;
    return el('div', { class: 'dc glass spot' },
      el('div', { class: 'dc-h' }, el('b', { text: sym }), el('span', { class: 'dsig ' + sigk, text: d.signal || '—' })),
      el('div', { class: 'dc-why', text: d.why || '' }),
      el('div', { class: 'dc-row' }, el('span', { class: 'dk', text: 'Funding (8h)' }), el('span', null, el('span', { class: 'fh ' + fk, text: isNum(f) ? (f >= 0 ? '+' : '') + f.toFixed(4) + '%' : '—' }),
        isNum(f) ? el('em', { class: 'ann', text: ' ≈ ' + (f * 3 * 365).toFixed(1) + '%/yr' }) : null)),
      el('div', { class: 'fbar' }, el('i', { style: { left: fpos + '%' } }), el('span', { text: 'shorts pay' }), el('span', { text: 'longs pay' })),
      lp !== null ? [el('div', { class: 'dc-row' }, el('span', { class: 'dk', text: 'Long / short accounts' }), el('span', { class: 'mono', text: ls.toFixed(2) })),
        el('div', { class: 'lsbar' }, el('i', { class: 'l', style: { width: lp + '%' } }, Math.round(lp) + '% long'), el('i', { class: 's', style: { width: (100 - lp) + '%' } }, Math.round(100 - lp) + '% short'))] : null,
      el('div', { class: 'dc-row' }, el('span', { class: 'dk', text: 'Open interest' }), el('span', { class: 'mono oi' }, d.oi_spark ? miniLine(d.oi_spark, (d.oi_chg || 0) >= 0 ? '#A5B4FC' : '#F87171', 64, 18) : null, oiTxt,
        isNum(d.oi_chg) ? el('em', { class: d.oi_chg >= 0 ? 'u' : 'd', text: ' ' + (d.oi_chg >= 0 ? '+' : '') + d.oi_chg.toFixed(1) + '% 24h' }) : null)),
      bs !== null ? [el('div', { class: 'dc-row' }, el('span', { class: 'dk', title: 'Market orders that bought vs sold on OKX perpetuals in the last ' + fl.h + ' hours (taker volume)' }, 'Taker buys vs sells · 24h'),
        el('span', { class: 'mono oi' }, fl.cvd ? miniLine(fl.cvd, cvdUp ? '#34D399' : '#F87171', 64, 18) : null, el('em', { class: (fl.buy1h >= fl.sell1h) ? 'u' : 'd', text: '1h ' + (fl.buy1h >= fl.sell1h ? 'buyers' : 'sellers') }))),
      splitBar(fl.buy, fl.sell, Math.round(bs) + '% buy · ' + fmtUsd(fl.buy), fmtUsd(fl.sell) + ' sell', 'rgba(16,185,129,.5)', 'rgba(239,68,68,.5)')] : null,
      L && L.long + L.short > 0 ? [el('div', { class: 'dc-row' }, el('span', { class: 'dk', title: 'Positions force-closed by the exchange (OKX USDT perpetuals)' }, 'Liquidations · ' + (L.cover_h >= 23.5 ? '24h' : 'last ' + Math.max(1, Math.round(L.cover_h)) + 'h')),
        el('span', { class: 'mono', text: fmtUsd(L.long + L.short) })),
      splitBar(L.long, L.short, 'Longs ' + fmtUsd(L.long), 'Shorts ' + fmtUsd(L.short), 'rgba(239,68,68,.55)', 'rgba(16,185,129,.5)')] : null,
      el('div', { class: 'fine dc-src', text: d.src + (d.ls_src && d.ls_src.split(' ')[0] !== d.src ? ' · ratio ' + d.ls_src : '') + (d.note ? ' · ' + d.note : '') + (nx !== null ? ' · next funding in ' + dur(nx) : '') }));
  }
  function derivSummary(X, Q, L) {
    const oi = L.reduce((a, k) => a + (isNum(X[k].oi_usd) ? X[k].oi_usd : 0), 0), oiPrev = L.reduce((a, k) => a + (isNum(X[k].oi_usd) && isNum(X[k].oi_chg) ? X[k].oi_usd / (1 + X[k].oi_chg / 100) : 0), 0);
    const qs = ['BTC', 'ETH', 'SOL'].map((k) => Q[k]).filter((q) => q && !q.err), lg = qs.reduce((a, q) => a + q.long, 0), sh = qs.reduce((a, q) => a + q.short, 0);
    const hrs = Array.from({ length: 24 }, (_, i) => qs.reduce((a, q) => [a[0] + ((q.hours || [])[i] || [0, 0])[0], a[1] + ((q.hours || [])[i] || [0, 0])[1]], [0, 0]));
    const fb = L.reduce((a, k) => a + ((X[k].flow || {}).buy || 0), 0), fs = L.reduce((a, k) => a + ((X[k].flow || {}).sell || 0), 0), bsh = fb + fs ? fb / (fb + fs) * 100 : null;
    const tiles = [];
    if (oi) tiles.push(el('div', { class: 'dsum-t' }, el('span', { class: 'dk', text: 'Open interest · BTC + ETH + SOL' }), el('b', { text: fmtUsd(oi) }),
      oiPrev ? el('em', { class: oi >= oiPrev ? 'u' : 'd', text: (oi >= oiPrev ? '▲ ' : '▼ ') + Math.abs((oi / oiPrev - 1) * 100).toFixed(1) + '% in 24h · ' + (oi >= oiPrev ? 'leverage building' : 'leverage leaving') }) : null));
    if (lg + sh > 0) { const mx = Math.max(1, ...hrs.map((h) => Math.max(h[0], h[1]))); let bars = '';
      hrs.forEach((h, i) => { const x = i * 10 + 1, a = h[0] / mx * 22, b = h[1] / mx * 22; bars += `<rect x="${x}" y="${24 - b}" width="7" height="${Math.max(.5, b)}" rx="1" fill="#34D399" fill-opacity=".8"/><rect x="${x}" y="25" width="7" height="${Math.max(.5, a)}" rx="1" fill="#F87171" fill-opacity=".85"/>`; });
      const g = svg('0 0 240 48', bars); g.setAttribute('preserveAspectRatio', 'none'); g.classList.add('liqh');
      const cover = Math.min(...qs.map((q) => q.cover_h || 24));
      tiles.push(el('div', { class: 'dsum-t wide' }, el('span', { class: 'dk', text: 'Liquidations · ' + (cover >= 23.5 ? 'last 24h' : 'last ' + Math.max(1, Math.round(cover)) + 'h') + ' · OKX' }),
        el('div', { class: 'liq-v' }, el('b', { text: fmtUsd(lg + sh) }), el('span', { class: 'd', text: 'Longs ' + fmtUsd(lg) }), el('span', { class: 'u', text: 'Shorts ' + fmtUsd(sh) })),
        g, el('div', { class: 'fine', text: lg > sh * 1.8 ? 'Longs got flushed: falling prices forced leveraged buyers out' : sh > lg * 1.8 ? 'Shorts got squeezed: rising prices forced leveraged sellers out' : 'Both sides hit about evenly' })));
    }
    if (bsh !== null) tiles.push(el('div', { class: 'dsum-t' }, el('span', { class: 'dk', text: 'Taker flow · 24h · OKX perps' }), el('b', { class: bsh >= 52 ? 'u' : bsh <= 48 ? 'd' : '', text: Math.round(bsh) + '% buy' }),
      el('em', { text: bsh >= 52 ? 'Buyers hitting the market' : bsh <= 48 ? 'Sellers hitting the market' : 'Balanced' }), splitBar(fb, fs, '', '', 'rgba(16,185,129,.6)', 'rgba(239,68,68,.6)')));
    if (D.fng) { const v = D.fng.v, c = v < 25 ? '#F87171' : v < 45 ? '#FB923C' : v < 56 ? '#FACC15' : v < 76 ? '#A3E635' : '#34D399';
      tiles.push(el('div', { class: 'dsum-t' }, el('span', { class: 'dk', text: 'Fear & Greed' }), el('b', { style: { color: c }, text: v }), el('em', { text: D.fng.label }),
        el('div', { class: 'fgbar' }, el('i', { style: { left: v + '%' } })))); }
    return tiles.length ? el('div', { class: 'dsum glass' }, tiles) : null;
  }
  function derivSection() {
    const X = TR().derivatives, Q = TR().liqs || {}; if (!X) return null; const L = ['BTC', 'ETH', 'SOL'].filter((k) => X[k] && !X[k].err); if (!L.length) return null;
    return sec('Derivatives & orderflow', { id: 'deriv', eyebrow: 'Positioning', sub: 'Who is leveraged and which way, who is hitting the market, and who got forced out. A crowded side is where squeezes come from' },
      derivSummary(X, Q, L), el('div', { class: 'dcs' }, L.map((k, i) => rv(derivCard(k, X[k], Q[k]), i))));
  }

  /* ================= crypto market breadth ================= */
  function breadthSection() {
    const B = TR().breadth; if (!B || DAY) return null;
    const row = (x) => el('div', { class: 'brr' }, el('b', { text: x.sym }), el('span', { text: x.name }), el('em', { class: x.chg >= 0 ? 'u' : 'd', text: (x.chg >= 0 ? '+' : '') + x.chg.toFixed(1) + '%' }));
    return sec('Crypto market', { eyebrow: 'Breadth', sub: 'Is it just bitcoin, or the whole market? Top 100 coins by value, without stablecoins' },
      el('div', { class: 'bd glass' },
        el('div', { class: 'bd-l' },
          el('div', { class: 'bd-stats' }, el('div', null, el('span', { class: 'dk', text: 'Bitcoin dominance' }), el('b', { text: B.dom_btc.toFixed(1) + '%' }), el('em', { text: 'Ether ' + B.dom_eth.toFixed(1) + '%' })),
            el('div', null, el('span', { class: 'dk', text: 'Total crypto value' }), el('b', { text: fmtUsd(B.mcap) }), el('em', { class: B.mcap_chg >= 0 ? 'u' : 'd', text: (B.mcap_chg >= 0 ? '▲ ' : '▼ ') + Math.abs(B.mcap_chg).toFixed(2) + '% 24h' })),
            el('div', null, el('span', { class: 'dk', text: 'Typical coin' }), el('b', { class: B.median >= 0 ? 'u' : 'd', text: (B.median >= 0 ? '+' : '') + B.median.toFixed(2) + '%' }), el('em', { text: 'median 24h change' }))),
          el('div', { class: 'dk', style: { marginTop: '16px' }, text: B.up + ' up · ' + B.down + ' down of ' + B.n + ' coins' }),
          splitBar(B.up, B.down, Math.round(B.up / B.n * 100) + '% up', Math.round(B.down / B.n * 100) + '% down', 'rgba(16,185,129,.55)', 'rgba(239,68,68,.55)'),
          el('p', { class: 'fine', text: B.up / B.n >= 0.65 ? 'Broad rally: most coins are rising together.' : B.up / B.n <= 0.35 ? 'Broad sell-off: most coins are falling together.' : 'Mixed market: no clear direction across coins.' })),
        el('div', { class: 'bd-m' }, el('div', null, el('div', { class: 'eyebrow', text: 'Top gainers · 24h' }), B.gainers.slice(0, 5).map(row)),
          el('div', null, el('div', { class: 'eyebrow', text: 'Top losers · 24h' }), B.losers.slice(0, 5).map(row)))),
      el('div', { class: 'fine', style: { marginTop: '8px' }, text: B.src }));
  }

  /* ================= the trader's brief: the day in a few lines ================= */
  function tradersBrief() {
    if (DAY) return null;
    const T = TR(), AI = T.ai_brief, n = now(), ICO = { mood: '◐', event: '⏱', positioning: '⚖', levels: '⌖', news: '⚑', breadth: '▦', liq: '⚡' };
    let items = [], by = '';
    const nextG = calGroups().find((g) => g.t > n);
    if (AI && AI.bullets && AI.bullets.length) { items = AI.bullets.map((b) => ({ k: b.k, node: b.text })); by = 'Written by AI (' + (AI.by || 'AI') + ') from the numbers on this page · ' + ago(AI.at); }
    else {
      const R = T.regime; if (R) items.push({ k: 'mood', node: [el('b', { text: R.label.charAt(0) + R.label.slice(1).toLowerCase() }), (R.why || []).length ? ': ' + R.why.slice(0, 2).map((w) => w[1]).join(', ') + '.' : '.'] });
      if (nextG && nextG.t - n < 36 * 3600) items.push({ k: 'event', node: [el('b', { text: nextG.where + ' ' + nextG.lead.title }), nextG.items.length > 1 ? ' (with ' + nextG.items.filter((e) => e !== nextG.lead).map((e) => e.title).join(', ') + ')' : '', ' at ' + hm(nextG.t) + ' (in ', el('span', { class: 'cd', 'data-cd': nextG.t, 'data-short': 1, text: cdShort(nextG.t - n) }), ')',
        nextG.lead.f ? ', forecast ' + nextG.lead.f + (nextG.lead.p ? ' vs ' + nextG.lead.p + ' before' : '') : '', '. Expect fast moves around the release.'] });
      const X = T.derivatives || {}, hot = ['BTC', 'ETH', 'SOL'].filter((k) => X[k] && !X[k].err && !/neutral/i.test(X[k].signal || ''));
      if (hot.length) { const k = hot[0], d = X[k]; items.push({ k: 'positioning', node: [el('b', { text: k + ': ' + d.signal }), ' — funding ' + (d.funding >= 0 ? '+' : '') + (d.funding || 0).toFixed(3) + '%' + (isNum(d.ls) ? ', ' + Math.round(d.ls / (1 + d.ls) * 100) + '% of accounts long' : '') + '.'] }); }
      else if (Object.keys(X).length) items.push({ k: 'positioning', node: [el('b', { text: 'Leverage looks balanced' }), ': funding and long/short ratios are not stretched on BTC, ETH or SOL.'] });
      const Q = T.liqs || {}, qs = Object.values(Q).filter((q) => q && !q.err), lg = qs.reduce((a, q) => a + q.long, 0), sh = qs.reduce((a, q) => a + q.short, 0);
      if (lg + sh > 0) items.push({ k: 'liq', node: [el('b', { text: fmtUsd(lg + sh) + ' liquidated' }), ' on OKX (longs ' + fmtUsd(lg) + ', shorts ' + fmtUsd(sh) + ')' + (lg > sh * 1.8 ? ': longs got flushed.' : sh > lg * 1.8 ? ': shorts got squeezed.' : '.')] });
      const B = (T.catalysts || {}).BTC; if (B && B.lv) { const last = LIVEPX.BTC || B.pts[B.pts.length - 1][1], v = B.lv.vwap, nearHi = last >= B.lv.hi24 * 0.995, nearLo = last <= B.lv.lo24 * 1.005;
        items.push({ k: 'levels', node: [el('b', { text: 'Bitcoin ' + fmtLc('BTC', last) }), isNum(v) ? (last >= v ? ' is above' : ' is below') + ' its 24h VWAP (' + fmtLc('BTC', v) + ')' : '', nearHi ? ', testing its 24h high' : nearLo ? ', testing its 24h low' : '', '; 24h range ' + fmtLc('BTC', B.lv.lo24) + '–' + fmtLc('BTC', B.lv.hi24) + '.'] }); }
      const BR = T.breadth; if (BR) items.push({ k: 'breadth', node: [el('b', { text: BR.up + ' of ' + BR.n + ' top coins up' }), ', bitcoin dominance ' + BR.dom_btc.toFixed(1) + '%, total crypto value ' + (BR.mcap_chg >= 0 ? '+' : '') + BR.mcap_chg.toFixed(1) + '%.'] });
      by = 'Built automatically from the numbers on this page' + (T.ai_tags === 0 || !AI ? ' · add an AI key for a written brief' : '');
    }
    if (!items.length) return null;
    return rv(el('section', { class: 'tb glass', id: 'brief' }, el('div', { class: 'tb-h' }, el('div', { class: 'eyebrow', text: "Trader's brief" }), AI && AI.bullets ? el('span', { class: 'ai-tag', text: 'AI' }) : null, el('span', { class: 'fine', text: by + ' · not advice' })),
      el('div', { class: 'tb-g' }, items.slice(0, 6).map((it) => el('div', { class: 'tb-i k-' + it.k }, el('span', { class: 'tb-ic', text: ICO[it.k] || '•' }), el('p', null, it.node))))), 1);
  }

  /* ================= narrative velocity heatmap ================= */
  function narrSection() {
    const N = TR().narratives; if (!N || !N.length) return null;
    const tiles = N.map((n, i) => rv(el('button', { class: 'nt glass spot', style: { '--h': (n.pct / 100).toFixed(2) }, onclick: () => openNarr(n) },
      el('div', { class: 'nt-h' }, el('b', { text: n.name }), i === 0 ? el('span', { class: 'hot', text: 'HOTTEST' }) : null),
      el('div', { class: 'nt-v' }, el('span', { class: 'nt-big', text: n.recent }), el('span', { text: ' reports in 6h' })),
      el('div', { class: 'nt-f' }, el('span', { class: n.vel >= 0 ? 'u' : 'd', text: (n.vel >= 0 ? '▲ accelerating' : '▼ cooling') }), el('span', { text: '·' }), el('span', { text: n.stories + (n.stories === 1 ? ' story' : ' stories') }), el('span', { text: '·' }),
        el('span', { class: n.tone > 0 ? 'u' : n.tone < 0 ? 'd' : '', text: n.tone > 0 ? 'bullish tone' : n.tone < 0 ? 'bearish tone' : 'mixed' })),
      el('div', { class: 'nt-bar' }, el('i', { style: { width: n.pct + '%' } }))), i));
    return sec('Narrative heatmap', { eyebrow: 'Momentum', sub: 'Which story is the market talking about most right now' }, el('div', { class: 'nts' }, tiles));
  }
  function openNarr(n) {
    const L = n.ids.map((id) => BYID[id]).filter(Boolean);
    openDrawer((p) => p.append(el('button', { class: 'ib dr-x', onclick: closeDrawer, 'aria-label': 'Close', text: '✕' }), el('div', { class: 'dr-body', style: { marginTop: '64px' } },
      el('div', { class: 'eyebrow', text: 'Narrative' }), el('h2', { text: n.name }), el('p', { class: 'dek big', text: `${n.recent} reports in the last 6 hours across ${n.stories} confirmed stories.` }),
      el('div', { class: 'list glass' }, L.map((s) => item(s, { noDek: true }))))));
  }

  /* ================= globe section ================= */
  function globeSection() {
    const G = el('div', { class: 'globe-hero' }, el('div', { class: 'gh-cap' }, el('span', { class: 'dot' }), 'Drag to turn · tap a dot'));
    const P = placeIndex(D.stories).slice(0, 8), mx = P.length ? P[0].n : 1;
    const list = el('div', { class: 'gl-list' }, P.map((p, i) => el('button', { class: 'gl-row', style: { '--c': cv(p.cat) }, onclick: () => { if (GLOBE) GLOBE.spinTo(p.ll); openPlace(p.label); } },
      el('span', { class: 'rk', text: i + 1 }), el('span', { text: p.label }), el('em', { text: p.n + (p.n > 1 ? ' stories' : ' story') }), el('u', null, el('i', { style: { width: (p.n / mx * 100) + '%' } })))));
    requestAnimationFrame(() => { if (FEATS.length) mountGlobe(G, D.stories); });
    return sec('Where it\'s happening', { eyebrow: 'World map', sub: 'Places named in today\'s confirmed stories' }, el('div', { class: 'gl-wrap' }, rv(G, 0), rv(list, 1)));
  }


  /* ================= key events log (kept for 120 days) ================= */
  let LOG = null, LOGF = { cat: 'all', min: 7 };
  const LOGBY = {};
  async function loadLog() { try { LOG = await getJSON('data/archive/keylog.json'); (LOG.events || []).forEach((e) => { LOGBY[e.id] = e; }); } catch (e) { LOG = { events: [] }; } return LOG; }
  function reaction(e) {
    const pick = (e.assets || []).map((a) => ({ BTC: 'btc', ETH: 'eth', SOL: 'sol', GOLD: 'gold', OIL: 'oil', SPX: 'spx', DXY: 'dxy' }[a])).filter(Boolean);
    const keys = [...new Set(pick.concat(['btc']))].slice(0, 3);
    return keys.map((k) => { const then = (e.px || {})[k], m = MK[k]; if (!isNum(then) || !m || !isNum(m.p)) return null; const ch = (m.p / then - 1) * 100;
      return el('span', { class: 'rx ' + (ch >= 0 ? 'u' : 'd'), title: m.name + ': ' + fmtP(m, then) + ' when this broke, ' + fmtP(m) + ' now' }, el('b', { text: m.name.replace(' oil', '').replace(' index', '') }),
        fmtP(m, then) + ' → ' + fmtP(m), el('em', { text: ' ' + (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%' })); }).filter(Boolean);
  }
  function logCard(e) {
    const a = act(el('article', { class: 'lg glass spot', style: { '--c': cv(e.cat) } }), e.id);
    a.append(el('div', { class: 'lg-t' }, el('b', { text: hm(e.first) }), el('span', { text: dshort(e.first) })),
      el('div', { class: 'lg-b' }, el('div', { class: 'kick' }, el('span', { class: 'kc', style: { '--c': cv(e.cat) } }, el('i'), SHORT[e.cat] || e.cat),
        e.status === 'OFFICIAL' ? el('span', { class: 'vb o' }, el('i', { text: '◆' }), 'Official source') : el('span', { class: 'vb v' }, el('i', { text: '✓' }), 'Confirmed · ' + e.n + ' newsrooms'),
        e.reason === 'breaking' ? el('span', { class: 'tag brk', text: 'Was breaking' }) : null),
        el('h3', { text: e.title }), sigRow(e), e.why ? el('p', { class: 'dek', text: e.why }) : null,
        reaction(e).length ? el('div', { class: 'rxs' }, el('span', { class: 'rx-l', text: 'Since it broke' }), reaction(e)) : null,
        el('div', { class: 'srcs', text: (e.indep && e.indep.length ? e.indep : e.orgs || []).slice(0, 5).join(' · ') })));
    return a;
  }
  function viewLog(M) {
    M.append(el('section', { class: 'chero', style: { '--c': '#F472B6' } }, rv(el('div', { class: 'eyebrow' }, el('span', { class: 'ci', text: '◉' }), 'Saved automatically'), 0),
      rv(el('h1', { class: 'grad-c', text: 'Key events' }), 1),
      rv(el('p', { class: 'lede', text: 'Every high-impact story is saved here the moment it breaks and stays for 120 days, even after newer news pushes it off the front page. Each one shows what prices were when it broke and where they are now.' }), 2)));
    const box = el('div', { class: 'sec first' }); M.append(box);
    const draw = () => {
      clear(box); const E = (LOG && LOG.events) || [];
      const cats = ['all', ...CATS.filter((c) => E.some((e) => e.cat === c))];
      box.append(el('div', { class: 'lg-f' }, el('div', { class: 'chips' }, cats.map((c) => el('button', { class: LOGF.cat === c ? 'on' : '', style: c !== 'all' ? { '--c': cv(c) } : null, onclick: () => { LOGF.cat = c; draw(); } }, c !== 'all' ? el('i') : null, c === 'all' ? 'All' : SHORT[c]))),
        el('div', { class: 'chips' }, [6, 7, 8, 9].map((v) => el('button', { class: LOGF.min === v ? 'on' : '', onclick: () => { LOGF.min = v; draw(); } }, '⚡ ' + v + '+')))));
      const L = E.filter((e) => (LOGF.cat === 'all' || e.cat === LOGF.cat) && (e.impact >= LOGF.min || e.reason === 'breaking'));
      if (!L.length) { box.append(el('div', { class: 'empty glass', text: E.length ? 'Nothing at this level yet. Try a lower impact filter.' : 'The log fills itself as high-impact stories arrive.' })); return; }
      const days = {}; L.forEach((e) => { const k = new Date(e.first * 1000).toDateString(); (days[k] = days[k] || []).push(e); });
      Object.entries(days).forEach(([k, list], i) => { const d = new Date(k), today = new Date().toDateString(), yest = new Date(Date.now() - 86400000).toDateString();
        box.append(rv(el('div', { class: 'lg-day' }, el('div', { class: 'lg-dh' }, el('b', { text: k === today ? 'Today' : k === yest ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) }), el('span', { text: list.length + (list.length > 1 ? ' events' : ' event') })),
          el('div', { class: 'lg-list' }, list.map(logCard))), i)); });
    };
    if (LOG) draw(); else { box.append(el('div', { class: 'empty glass', text: 'Loading…' })); loadLog().then(() => { if (view === 'log') draw(); }); }
  }

  /* ================= the overview page ================= */
  function greet() { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function viewHome(M) {
    if (!D.stories.length) { M.append(el('section', { class: 'hero' }, el('div', { class: 'hero-l' }, el('h1', { class: 'grad', text: LIVE ? 'No confirmed stories yet.' : 'Collecting the first news…' }),
      el('p', { class: 'lede', text: 'This page fills itself in a minute.' })), el('div', { class: 'globe-hero skel' }))); return; }
    const nNew = D.stories.filter(isNew).length, nUpd = D.stories.filter(isUpd).length, nBrk = DAY ? 0 : D.stories.filter((s) => s.breaking).length;
    /* high-impact events */
    const ev = eventsBar(); if (ev) M.append(ev);
    /* hero: the morning trader's brief */
    const lede = DAY ? 'The confirmed stories of ' + new Date(DAY + 'T12:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) + '.'
      : sinceMode() ? null : `${D.stories.length} confirmed stories today, each reported by two or more independent newsrooms or an official source.`;
    const L = el('div', { class: 'hero-l' },
      rv(el('div', { class: 'eyebrow live' }, DAY ? el('span', { class: 'dot off' }) : el('span', { class: 'dot' }), DAY ? 'Archive' : 'Morning brief · live', ' · ', new Date(DAY ? DAY + 'T12:00:00' : Date.now()).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }), D.updated ? ' · updated ' + ago(D.updated) : ''), 0),
      rv(el('h1', { class: 'grad', text: DAY ? 'From the archive.' : greet() + '.' }), 1),
      rv(lede ? el('p', { class: 'lede', text: lede }) : el('p', { class: 'lede' }, `While you were away (${ago(since).replace(' ago', '')}), `, el('b', { text: nNew + ' new ' + (nNew === 1 ? 'story' : 'stories') }), ' broke', nUpd ? [' and ', el('b', { text: nUpd + ' moved forward' })] : '', nBrk ? [' — ', el('b', { class: 'red', text: nBrk + ' breaking' })] : '', '.'), 2),
      regimeBadge() ? rv(regimeBadge(), 3) : null,
      rv(el('div', { class: 'cta' }, el('button', { class: 'btn grad-btn big', onclick: () => openBrief() }, el('span', { class: 'play' }, '▶'), 'Play the 5-minute brief'),
        el('button', { class: 'btn ghost big', onclick: () => { const t = $('charts') || $('top'); if (t) t.scrollIntoView({ behavior: 'smooth' }); } }, 'Live charts ↓')), 5));
    const DR = driversBox();
    M.append(el('section', { class: 'hero trader' }, L, el('div', { class: 'hero-r' }, DR ? rv(el('div', { class: 'glass drv-card' }, DR), 2) : null)));
    const TB = tradersBrief(); if (TB) M.append(TB);
    const LC = liveChart();
    const CC = LC;
    /* breaking */
    if (!DAY) D.stories.filter((s) => s.breaking).sort((a, b) => b.n - a.n).slice(0, 2).forEach((s, i) => M.append(rv(act(el('div', { class: 'breaking glass' },
      el('span', { class: 'bl' }, el('i'), 'Breaking'), el('span', { class: 'btx', text: s.title }), el('span', { class: 'fine', text: s.n + ' newsrooms · ' + ago(s.first) })), s.id), i)));
    /* live charts: price × news, then positioning */
    if (LC) M.append(sec('Price × news', { id: 'charts', eyebrow: 'Live charts', sub: 'Bitcoin, gold, the S&P 500 and oil in 15-minute candles, with the confirmed news pinned where it broke, key levels and the trading sessions' }, LC));
    const dsec = derivSection(); if (dsec) M.append(dsec);
    const bsec = breadthSection(); if (bsec) M.append(bsec);
    /* while you were away */
    const shown = new Set();
    if (sinceMode()) {
      const A = D.stories.filter((s) => isNew(s) || isUpd(s)).sort((a, b) => imp(b) - imp(a)).slice(0, 8);
      if (A.length) { A.forEach((s) => shown.add(s.id)); M.append(sec('While you were away', { id: 'away', eyebrow: 'Since ' + hm(since), sub: 'New and updated stories, most important first' },
        el('div', { class: 'list glass' }, A.map((s) => item(s))))); }
    }
    /* top stories - bento */
    const top = D.top.map((id) => BYID[id]).filter((s) => s && !shown.has(s.id)).slice(0, 6);
    if (top.length) { top.forEach((s) => shown.add(s.id));
      const sizes = { 1: ['wide'], 2: ['lg', 'lg'], 3: ['xl', 'md', 'md'], 4: ['xl', 'md', 'md', 'wide'], 5: ['xl', 'md', 'md', 'lg', 'lg'], 6: ['xl', 'md', 'md', 'sm', 'sm', 'sm'] }[top.length];
      M.append(sec(DAY ? 'Top stories of the day' : 'Top stories', { id: 'top', eyebrow: 'The day', sub: 'In order of importance' }, el('div', { class: 'bento' }, top.map((s, i) => rv(tileB(s, sizes[i]), i))))); }
    /* market pulse */
    const order = ['btc', 'eth', 'spx', 'ndx', 'gold', 'oil', 'gas', 'dxy', 'eur', 'jpy', 'lkr'];
    const ms = order.map((k) => MK[k]).filter((m) => m && isNum(m.p));
    if (ms.length) M.append(sec('Market pulse', { cls: 'pulse', eyebrow: 'Numbers', sub: sinceMode() && snapPrev ? 'Change today · tap a chapter for more' : 'Change today', more: el('span', { class: 'fine', text: 'For the big picture, not trading' }) },
      el('div', { class: 'mts' }, ms.map((m, i) => rv(tile(m, false, 'today'), i)), D.fng ? rv(fngGauge(D.fng), ms.length) : null)));
    /* macro snapshot */
    const mh = MACRO_HOME.map((k) => (D.macro || []).find((x) => x.k === k)).filter((x) => x && isNum(x.v));
    if (mh.length) M.append(sec('Macro snapshot', { eyebrow: 'Official statistics', sub: 'Latest releases from the BLS, BEA, Federal Reserve and ECB', more: el('button', { class: 'btn ghost sm', onclick: () => go('macro'), text: 'All macro →' }) },
      el('div', { class: 'mts' }, mh.map((x, i) => rv(macroTile(x), i))), calBox((D.calendar || []).slice(0, 8))));
    /* narratives */
    const nsec = narrSection(); if (nsec) M.append(nsec);
    /* globe */
    void CC; if (D.stories.some((s) => (s.places || []).length)) M.append(globeSection());
    /* every area */
    const cards = chapterOrder().map((c, i) => {
      const Ls = storiesOf(c), pick = Ls.slice(0, 3), mk = (MKT[c] || []).map((k) => MK[k]).filter((m) => m && isNum(m.p)).slice(0, 2);
      return rv(el('div', { class: 'area glass spot', style: { '--c': cv(c) }, role: 'button', tabindex: 0, onclick: () => go(c), onkeydown: (e) => { if (e.key === 'Enter') go(c); } },
        el('div', { class: 'ah' }, el('span', { class: 'ai', text: ICON[c] }), el('b', { text: cname(c) }), el('span', { class: 'an', text: Ls.length + (Ls.length === 1 ? ' story' : ' stories') })),
        mk.length ? el('div', { class: 'am' }, mk.map((m) => el('span', null, m.name.replace(' oil', '').replace(' index', ''), el('b', { text: fmtP(m) }), el('i', { class: (m.chg || 0) >= 0 ? 'u' : 'd', text: fmtC(m.chg) })))) : null,
        el('ul', null, pick.map((s) => el('li', { class: seen.has(s.id) ? 'read' : '' }, s.title))), el('span', { class: 'go' }, 'Open ' + SHORT[c], el('i', { text: '→' }))), i);
    });
    M.append(sec('Every area', { eyebrow: 'Chapters', sub: 'The whole day, sorted. Tap one to read it' }, el('div', { class: 'areas' }, cards)));
    /* developing */
    const dv = D.stories.filter((s) => s.developing && !shown.has(s.id)).sort((a, b) => imp(b) - imp(a)).slice(0, 6);
    if (dv.length) M.append(sec('Still developing', { eyebrow: 'Ongoing', sub: 'Started earlier, still getting new reports' }, el('div', { class: 'devs' }, dv.map((s, i) => {
      const span = Math.max(1, s.last - s.first), tl = el('div', { class: 'tl' });
      (s.reports || []).forEach((x) => tl.append(el('i', { style: { left: ((x.ts - s.first) / span * 100).toFixed(1) + '%' }, title: x.o + ' · ' + dshort(x.ts) + ' ' + hm(x.ts) })));
      return rv(act(el('div', { class: 'dev glass spot', style: { '--c': cv(s.cat) } }, kicker(s), el('h3', { text: s.title }), tl,
        el('div', { class: 'fine', text: 'Since ' + dshort(s.first) + ' · ' + (s.reports || []).length + ' reports · latest ' + hm(s.last) })), s.id), i);
    }))));
    /* watch words */
    const W = D.stories.filter((s) => watched(s) && !shown.has(s.id)).sort((a, b) => imp(b) - imp(a)).slice(0, 6);
    if (W.length) M.append(sec('Your watch words', { eyebrow: '★ Watching', sub: (watch || []).join(' · '), more: el('button', { class: 'btn ghost sm', onclick: editWatch, text: 'Edit' }) }, el('div', { class: 'list glass' }, W.map((s) => item(s)))));
  }

  /* ================= a chapter ================= */
  function viewCat(M, c) {
    const Ls = storiesOf(c), A = alsoOf(c);
    const ms = (MKT[c] || []).map((k) => MK[k]).filter((m) => m && isNum(m.p));
    M.append(el('section', { class: 'chero', style: { '--c': cv(c) } }, rv(el('div', { class: 'eyebrow' }, el('span', { class: 'ci', text: ICON[c] }), 'Chapter'), 0),
      rv(el('h1', { class: 'grad-c', text: cname(c) }), 1),
      rv(el('p', { class: 'lede', text: Ls.length ? `${Ls.length} confirmed ${Ls.length === 1 ? 'story' : 'stories'} in the last 24 hours, each reported by two or more newsrooms or an official source.` : 'No confirmed stories in the last 24 hours yet.' }), 2),
      ms.length ? rv(el('div', { class: 'mts' }, ms.map((m) => tile(m, true, 'today')), c === 'crypto' && D.fng ? fngGauge(D.fng) : null), 3) : null,
      c === 'economy' && (D.macro || []).some((x) => isNum(x.v)) ? rv(el('div', { class: 'mts', style: { marginTop: '12px' } }, ['us_cpi', 'us_unemp', 'us_fed', 'us_gdp'].map((k) => (D.macro || []).find((x) => x.k === k)).filter((x) => x && isNum(x.v)).map(macroTile)), 3) : null,
      Ls.length ? rv(el('div', { class: 'cta' }, el('button', { class: 'btn grad-btn', onclick: () => openBrief(c) }, el('span', { class: 'play' }, '▶'), 'Play this chapter')), 4) : null));
    if (!Ls.length) return;
    const [first, ...rest] = Ls;
    const head = el('div', { class: 'bento' }, rv(tileB(first, 'xl'), 0)); rest.slice(0, 2).forEach((s, i) => head.append(rv(tileB(s, 'md'), i + 1)));
    M.append(el('section', { class: 'sec' }, head));
    const groups = {}; rest.slice(2).forEach((s) => { const g = subOf(s, c); (groups[g] = groups[g] || []).push(s); });
    const G = Object.entries(groups).sort((a, b) => imp(b[1][0]) - imp(a[1][0]));
    if (G.length) M.append(el('section', { class: 'sec groups' }, G.map(([g, list], i) => rv(el('div', { class: 'grp glass', style: { '--c': cv(c) } }, el('div', { class: 'grp-h' }, el('i'), g, el('span', { text: list.length })),
      el('div', { class: 'list' }, list.map((s) => item(s, { noCat: true })))), i))));
    if (A.length) M.append(sec('Also moving ' + SHORT[c].toLowerCase(), { eyebrow: 'From other chapters', c: cv(c) }, el('div', { class: 'list glass' }, A.slice(0, 5).map((s) => item(s, { noDek: true })))));
  }
  function viewList(M, title, Ls, sub, extra) {
    M.append(sec(title, { eyebrow: 'The Daily Brief', sub, more: extra, cls: 'first' }, Ls.length ? el('div', { class: 'list glass' }, Ls.map((s) => item(s))) : el('div', { class: 'empty glass', text: 'Nothing here yet.' })));
  }
  function viewSaved(M) {
    const Ls = Object.values(stars).sort((a, b) => b.saved - a.saved).map((s) => BYID[s.id] || s);
    viewList(M, 'Saved stories', Ls, 'Kept on this device · ' + Ls.length, Ls.length ? el('button', { class: 'btn ghost sm', onclick: () => copy(Ls), text: '⧉ Copy all' }) : null);
  }

  /* ================= header + footer ================= */
  function renderChapters() {
    const nav = clear($('nav'));
    const b = (k, label, c) => el('button', { class: view === k && !query ? 'on' : '', style: c ? { '--c': c } : null, onclick: () => go(k) }, c ? el('i') : null, label);
    nav.append(b('front', 'Overview', null), b('log', '◉ Key events', '#F472B6')); if ((D.macro || []).length) nav.append(b('macro', 'Macro', '#A5B4FC'));
    CATS.forEach((c) => { if (storiesOf(c).length) nav.append(b(c, SHORT[c], cv(c))); });
    if (Object.keys(stars).length) nav.append(b('saved', '☆ Saved', null));
    const on = nav.querySelector('.on'); if (on) requestAnimationFrame(() => { const l = on.offsetLeft - nav.clientWidth / 2 + on.clientWidth / 2; nav.scrollTo({ left: l, behavior: still ? 'auto' : 'smooth' }); });
  }
  function renderTop() {
    renderRadar();
    renderPriceBar();
    const ref = DAY || (LIVE && LIVE.date); $('prevDay').disabled = !DAYS.some((d) => d < ref); $('nextDay').disabled = !DAY;
    $('dayTxt').textContent = DAY ? new Date(DAY + 'T12:00:00').toLocaleDateString([], { day: 'numeric', month: 'short' }) : 'Today';
  }
  function renderFoot() {
    const f = D.feeds || {}, list = Object.entries(f.list || {});
    clear($('foot')).append(el('div', { class: 'foot-in glass' },
      el('div', null, el('div', { class: 'f-brand' }, el('span', { class: 'logo' }), 'Trading Desk Daily Brief'),
        el('p', null, el('b', { text: 'Only confirmed news. ' }), 'A story appears here only when two or more independent newsrooms report it, or when it comes straight from an official source (a government body, central bank, regulator or agency). ',
          'Single-source reports are kept out' + (D.unconfirmed_hidden ? ` (${D.unconfirmed_hidden} right now)` : '') + '. Sites that mostly republish others are never counted as a confirmation. ',
          'Crypto prices are checked against a second source (✓). Headlines and short teasers come from each outlet\'s own feed; tap through to read the full story. Pictures are drawn from data, not news photos.')),
      el('div', null, list.length ? el('details', null, el('summary', { text: `Sources · ${f.ok} of ${f.total} reachable` }),
        el('div', { class: 'fl' }, list.sort((a, b) => (a[1].ok === b[1].ok ? a[0].localeCompare(b[0]) : a[1].ok ? 1 : -1)).map(([n, h]) => el('span', { class: h.ok ? '' : 'bad', title: h.err || (h.n + ' headlines'), text: (h.ok ? '● ' : '○ ') + n })))) : null,
        el('p', { class: 'fine' }, 'Saved stories, watch words and what you have read stay on this device. ', el('button', { class: 'lnk', onclick: editWatch, text: 'Edit watch words' })))));
  }
  function render() {
    renderTop(); renderChapters();
    const M = clear($('main')); if (GLOBE) { GLOBE.stop(); GLOBE = null; } GROT.r = null;
    M.classList.remove('swap'); void M.offsetWidth; M.classList.add('swap');
    if (query) { const qq = query.toLowerCase(); const Ls = D.stories.filter((s) => (s.title + ' ' + (s.dek || '') + ' ' + s.orgs.join(' ') + ' ' + (s.places || []).map((p) => p.p).join(' ')).toLowerCase().includes(qq)).sort((a, b) => imp(b) - imp(a));
      viewList(M, 'Search', Ls, `${Ls.length} ${Ls.length === 1 ? 'story matches' : 'stories match'} “${query}”`); }
    else if (view === 'front') viewHome(M);
    else if (CATS.includes(view)) viewCat(M, view);
    else if (view === 'saved') viewSaved(M);
    else if (view === 'macro') viewMacro(M);
    else if (view === 'log') viewLog(M);
    else { view = 'front'; viewHome(M); }
    renderFoot();
  }

  /* ================= one story ================= */
  function openDrawer(build) { const p = clear($('drPanel')); build(p); runCounts(p); $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); document.body.classList.add('lock'); p.scrollTop = 0; setTimeout(() => { const x = p.querySelector('.dr-x'); if (x) x.focus(); }, 60); }
  function closeDrawer() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); if (!$('bm').classList.contains('open')) document.body.classList.remove('lock'); if (/^#(s|p)=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); }
  function saveBtn(s) {
    return el('button', { class: 'btn' + (stars[s.id] ? ' on' : ''), onclick: (e) => { e.stopPropagation(); if (stars[s.id]) delete stars[s.id]; else stars[s.id] = Object.assign({}, s, { saved: Date.now() }); S.set('stars', stars);
      e.currentTarget.classList.toggle('on', !!stars[s.id]); e.currentTarget.textContent = stars[s.id] ? '★ Saved' : '☆ Save'; renderChapters(); }, text: stars[s.id] ? '★ Saved' : '☆ Save' });
  }
  function openStory(id) {
    const s = BYID[id] || stars[id] || LOGBY[id]; if (!s) return; markSeen(s.id); s.reports = s.reports || []; s.orgs = s.orgs || [];
    history.replaceState(null, '', '#s=' + id);
    openDrawer((p) => {
      p.append(el('div', { class: 'dr-art' }, artFor(s, true)), el('button', { class: 'ib dr-x', onclick: closeDrawer, 'aria-label': 'Close', text: '✕' }));
      const off = s.orgs.filter((o) => /SEC|Fed|ECB|Bank|BLS|IMF|United Nations|NASA|WHO|USGS|EIA/i.test(o)), ind = s.indep || s.orgs;
      const sure = s.status === 'OFFICIAL' ? `Comes from an official source (${off.join(', ') || s.orgs[0]})` + (s.n > 1 ? `, and ${s.n - 1} more outlet${s.n > 2 ? 's' : ''} report it too.` : '.')
        : `Confirmed by ${s.n} independent newsrooms: ${ind.join(', ')}.` + (s.orgs.length > ind.length ? ` Also carried by ${s.orgs.filter((o) => !ind.includes(o)).join(', ')}, which mostly republish others and are not counted.` : '');
      const rel = D.stories.filter((x) => x.id !== s.id && quality(x) && ((x.places || []).some((pp) => (s.places || []).some((q) => q.c === pp.c)) || (x.kw || []).some((k) => (s.kw || []).includes(k)))).sort((a, b) => imp(b) - imp(a)).slice(0, 4);
      const m = marketArt(s);
      p.append(el('div', { class: 'dr-body' }, kicker(s), el('h2', { text: s.title }), s.dek ? el('p', { class: 'dek big', text: s.dek }) : null, sigRow(s),
        s.why ? el('div', { class: 'whybox' }, el('b', { text: 'Why it matters' }), s.why, el('span', { class: 'fine', text: s.ai ? ' · AI reading of the headlines, not advice' : ' · rule-based reading, not advice' })) : null,
        el('div', { class: 'fine', text: (s.dek ? 'Teaser from ' + (s.reports.find((r) => r.u === s.link) || {}).o + '. ' : '') + 'First reported ' + dshort(s.first) + ', ' + hm(s.first) + ' · latest ' + hm(s.last) }),
        m ? el('div', { class: 'mts one', style: { marginTop: '16px' } }, tile(m, true, 'today')) : null,
        el('div', { class: 'dr-act' }, el('a', { class: 'btn pri', href: s.link, target: '_blank', rel: 'noopener noreferrer' }, 'Read the full story ↗'), saveBtn(s),
          el('button', { class: 'btn', onclick: () => copy([s]), text: '⧉ Copy' }), navigator.share ? el('button', { class: 'btn', onclick: () => navigator.share({ title: s.title, url: s.link }).catch(() => {}), text: '↗ Share' }) : null),
        el('h5', { text: 'How sure is this?' }), el('div', { class: 'explain', text: sure }),
        (s.places || []).length ? [el('h5', { text: 'Where' }), el('div', { class: 'chips' }, s.places.map((pp) => el('button', { onclick: () => openPlace(pp.p), text: pp.p })))] : null,
        el('h5', { text: 'Every report, in order' }),
        (s.reports || []).map((r) => el('div', { class: 'rep' + (sinceMode() && r.ts > since ? ' fresh' : '') }, el('time', { text: (new Date(r.ts * 1000).toDateString() !== new Date().toDateString() ? dshort(r.ts) + ' ' : '') + hm(r.ts) }),
          el('div', null, el('b', { text: r.o }), el('a', { href: r.u, target: '_blank', rel: 'noopener noreferrer', text: r.t })))),
        rel.length ? [el('h5', { text: 'Related' }), el('div', { class: 'list' }, rel.map((x) => item(x, { noDek: true })))] : null));
    });
    document.querySelectorAll('[data-sid="' + s.id + '"]').forEach((n) => n.classList.add('read'));
  }
  function openPlace(label) {
    const L = D.stories.filter((s) => (s.places || []).some((p) => p.p === label)).sort((a, b) => imp(b) - imp(a)); if (!L.length) return;
    history.replaceState(null, '', '#p=' + encodeURIComponent(label));
    const fake = { id: 'place-' + label, cat: L[0].cat, title: label, places: L[0].places.filter((p) => p.p === label).concat(L[0].places.filter((p) => p.p !== label)), kw: [] };
    openDrawer((p) => p.append(el('div', { class: 'dr-art' }, artGlobe(fake, true)), el('button', { class: 'ib dr-x', onclick: closeDrawer, 'aria-label': 'Close', text: '✕' }),
      el('div', { class: 'dr-body' }, el('div', { class: 'fine', text: 'PLACE' }), el('h2', { text: label }), el('p', { class: 'dek', text: L.length + (L.length > 1 ? ' stories' : ' story') + ' in the last 24 hours' }),
        el('div', { class: 'list' }, L.map((s) => item(s, { noDek: true }))))));
  }
  function copy(L) {
    const txt = L.map((s) => `${s.title}${s.dek ? '\n' + s.dek : ''}\n${s.status === 'VERIFIED' ? 'Confirmed by ' + s.n + ' newsrooms' : s.status === 'OFFICIAL' ? 'Official' : 'One source so far'}: ${(s.orgs || []).join(', ')}\n${s.link}`).join('\n\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Copied ' + L.length + (L.length > 1 ? ' stories' : ' story')), () => { prompt('Copy:', txt); });
  }
  function editWatch() {
    openDrawer((p) => { const ta = el('textarea', { 'aria-label': 'Watch words, one per line' }); ta.value = (watch || []).join('\n');
      p.append(el('button', { class: 'ib dr-x', onclick: closeDrawer, 'aria-label': 'Close', text: '✕' }), el('div', { class: 'dr-body', style: { marginTop: '64px' } },
        el('div', { class: 'fine', text: 'YOUR WATCH WORDS' }), el('h2', { text: 'What should jump out at you?' }),
        el('p', { class: 'dek', text: 'One word or name per line. Stories that mention them get a ★ and their own section on the overview. Turn on 🔔 to get a pop-up when a new one arrives.' }), ta,
        el('div', { class: 'dr-act' }, el('button', { class: 'btn pri', onclick: () => { watch = ta.value.split(/\n|,/).map((x) => x.trim()).filter(Boolean).slice(0, 40); S.set('watch', watch); D = prepare(D); closeDrawer(); render(); toast('Watch words saved'); }, text: 'Save' }),
          el('button', { class: 'btn', onclick: closeDrawer, text: 'Cancel' })))); });
  }

  /* ================= the 5-minute brief (swipe mode) ================= */
  let BM = null;
  function briefSlides() {
    const S2 = [{ t: 'intro' }];
    chapterOrder().forEach((c) => {
      const L = storiesOf(c).filter(quality), pick = L.slice(0, c === 'science' || c === 'sport' ? 1 : c === 'world' || c === 'war' || c === 'economy' ? 3 : 2);
      if (!pick.length) return; S2.push({ t: 'chapter', c, n: L.length }); pick.forEach((s) => S2.push({ t: 'story', c, s }));
    });
    S2.push({ t: 'outro' }); return S2;
  }
  function openBrief(startChapter) {
    const slides = briefSlides(); let i = 0;
    if (startChapter) { const k = slides.findIndex((x) => x.t === 'chapter' && x.c === startChapter); if (k > 0) i = k; }
    BM = { slides, i }; $('bm').classList.add('open'); $('bm').setAttribute('aria-hidden', 'false'); document.body.classList.add('lock'); showSlide();
  }
  function closeBrief() { $('bm').classList.remove('open'); $('bm').setAttribute('aria-hidden', 'true'); document.body.classList.remove('lock'); BM = null; render(); }
  function step(d) { if (!BM) return; const n = BM.i + d; if (n < 0) return; if (n >= BM.slides.length) { closeBrief(); return; } BM.i = n; showSlide(d); }
  function chapterBounds() { const sl = BM.slides; let a = BM.i; while (a > 0 && sl[a].t !== 'chapter' && sl[a].t !== 'intro') a--; let b = BM.i + 1; while (b < sl.length && sl[b].t !== 'chapter' && sl[b].t !== 'outro') b++; return [a, b]; }
  function showSlide(dir) {
    const sl = BM.slides, x = sl[BM.i], stage = clear($('bmStage')), c = x.c;
    $('bm').style.setProperty('--c', c ? cv(c) : '#818CF8');
    const [a, b] = chapterBounds(); const bars = clear($('bmBars'));
    for (let k = a; k < b; k++) bars.append(el('i', { class: k < BM.i ? 'done' : k === BM.i ? 'now' : '' }));
    const stories = sl.filter((y) => y.t === 'story'), sn = sl.slice(0, BM.i + 1).filter((y) => y.t === 'story').length;
    $('bmWhere').textContent = c ? cname(c) : x.t === 'intro' ? 'The 5-minute brief' : 'Done';
    $('bmCount').textContent = stories.length ? `${sn} / ${stories.length}` : '';
    const card = el('div', { class: 'slide ' + x.t + (dir ? (dir > 0 ? ' in-r' : ' in-l') : '') });
    if (x.t === 'intro') {
      const mv = (D.markets || []).filter((m) => isNum(m.p) && isNum(m.chg)).sort((p, q) => Math.abs(q.chg) - Math.abs(p.chg)).slice(0, 4);
      card.append(el('div', { class: 'sl-in' }, el('div', { class: 'big-hi', text: greet() + '.' }), regimeBadge(),
        el('p', { class: 'lede', text: `Here is ${DAY ? 'that day' : 'the world right now'} in ${stories.length} stories across ${sl.filter((y) => y.t === 'chapter').length} areas. About ${Math.max(2, Math.round(stories.length * 0.25))} minutes.` }),
        sinceMode() ? el('p', { class: 'fine', text: 'Last visit: ' + ago(since) }) : null,
        mv.length ? el('div', { class: 'mts' }, mv.map((m) => tile(m, false, 'today'))) : null,
        el('div', { class: 'chips big' }, sl.filter((y) => y.t === 'chapter').map((y) => el('button', { style: { '--c': cv(y.c) }, onclick: (e) => { e.stopPropagation(); BM.i = sl.indexOf(y); showSlide(1); } }, el('i'), SHORT[y.c]))),
        el('button', { class: 'btn pri big', onclick: (e) => { e.stopPropagation(); step(1); } }, 'Start  →')));
    } else if (x.t === 'chapter') {
      const L = storiesOf(c), ms = (MKT[c] || []).map((k) => MK[k]).filter((m) => m && isNum(m.p)).slice(0, 4);
      card.append(el('div', { class: 'sl-in center' }, el('div', { class: 'ch-ic', text: ICON[c] }), el('h1', { text: cname(c) }),
        el('p', { class: 'lede', text: `${x.n} confirmed ${x.n === 1 ? 'story' : 'stories'} today · ${L.length} in total` }),
        ms.length ? el('div', { class: 'mts' }, ms.map((m) => tile(m, false, 'today'))) : null,
        el('ul', { class: 'ch-list' }, L.filter(quality).slice(0, 4).map((s) => el('li', { text: s.title })))));
    } else if (x.t === 'story') {
      const s = x.s; markSeen(s.id);
      const art = el('div', { class: 'sl-art' }, artFor(s, true)); const m = marketArt(s);
      if (m) art.append(el('span', { class: 'mchip' }, m.name + ' ', el('b', { text: fmtP(m) }), ' ', el('i', { class: (m.chg || 0) >= 0 ? 'u' : 'd', text: fmtC(m.chg) })));
      card.append(art, el('div', { class: 'sl-in' }, kicker(s), el('h2', { text: s.title }), sigRow(s), s.dek ? el('p', { class: 'dek', text: s.dek }) : null,
        s.why ? el('div', { class: 'whybox' }, el('b', { text: 'Why it matters' }), s.why) : null, srcLine(s),
        el('div', { class: 'dr-act' }, el('a', { class: 'btn pri', href: s.link, target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() }, 'Read full story ↗'), saveBtn(s),
          el('button', { class: 'btn', onclick: (e) => { e.stopPropagation(); openStory(s.id); }, text: 'All reports' }))));
    } else {
      card.append(el('div', { class: 'sl-in center' }, el('div', { class: 'ch-ic', text: '✓' }), el('h1', { text: 'You\'re up to date.' }),
        el('p', { class: 'lede', text: 'That\'s the big picture. Open any area for the full story list, or come back later. The brief updates every few minutes.' }),
        el('div', { class: 'dr-act center' }, el('button', { class: 'btn pri big', onclick: (e) => { e.stopPropagation(); closeBrief(); }, text: 'Back to the overview' }),
          el('button', { class: 'btn big', onclick: (e) => { e.stopPropagation(); BM.i = 0; showSlide(-1); }, text: 'Start again' }))));
    }
    stage.append(card);
    paintAll(card);
    $('bmPrev').disabled = BM.i === 0;
  }
  function paintAll(root) { root.querySelectorAll('.art').forEach((b) => paint(b)); runCounts(root); }
  (function wireBrief() {
    const st = $('bmStage'); let sx = 0, sy = 0, t0 = 0;
    st.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; t0 = Date.now(); });
    st.addEventListener('pointerup', (e) => {
      if (e.target.closest('a,button,.mchip')) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { step(dx < 0 ? 1 : -1); return; }
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - t0 < 500) { const b = st.getBoundingClientRect(); step(e.clientX - b.left < b.width * 0.3 ? -1 : 1); }
    });
    $('bmClose').onclick = closeBrief; $('bmPrev').onclick = () => step(-1); $('bmNext').onclick = () => step(1);
    $('bmSkip').onclick = () => { if (!BM) return; const [, b] = chapterBounds(); BM.i = Math.min(BM.slides.length - 1, b); showSlide(1); };
  })();

  /* ================= navigation, refresh, alerts ================= */
  function go(k) { view = k; query = ''; $('q').value = ''; S.set('view', k); render(); scrollTo({ top: 0, behavior: 'smooth' }); }
  async function loadDay(day) {
    if (!day || (LIVE && day === LIVE.date)) { DAY = null; D = prepare(LIVE); }
    else { try { DAY = day; D = prepare(await getJSON('data/archive/' + day + '.json')); } catch (e) { toast('That day is not saved'); DAY = null; D = prepare(LIVE); } }
    render();
  }
  $('prevDay').onclick = () => { const ref = DAY || LIVE.date, older = DAYS.filter((d) => d < ref); if (older.length) loadDay(older[0]); };
  $('nextDay').onclick = () => { const newer = DAYS.filter((d) => d > DAY).sort(); loadDay(newer[0] && newer[0] < LIVE.date ? newer[0] : null); };
  async function poll() {
    try { const d = await getJSON('data/today.json'); if (LIVE && d.updated === LIVE.updated) return;
      const old = new Set(LIVE ? LIVE.stories.map((s) => s.id) : []); LIVE = d;
      if (!DAY) { const y = scrollY; D = prepare(LIVE); if (!$('drawer').classList.contains('open') && !BM) { render(); scrollTo(0, y); } else renderTop(); }
      if (old.size) { const fresh = d.stories.filter((s) => !old.has(s.id) && (s.breaking || watched(s)));
        fresh.slice(0, 3).forEach((s) => { toast((s.breaking ? 'Breaking: ' : '★ ') + s.title.slice(0, 80));
          if (alerts && 'Notification' in window && Notification.permission === 'granted') { try { const n = new Notification(s.breaking ? 'Breaking · Trading Desk Daily Brief' : '★ Watch word · Trading Desk Daily Brief', { body: s.title + '\n' + s.orgs.slice(0, 3).join(', '), icon: 'icon-192.png', tag: s.id }); n.onclick = () => { focus(); openStory(s.id); }; } catch (e) { /* */ } } }); }
      getJSON('data/archive/index.json').then((x) => { DAYS = x.days || []; renderTop(); }).catch(() => {});
    } catch (e) { /* offline: keep what we have */ }
  }
  $('bell').classList.toggle('on', alerts);
  $('bell').onclick = async () => {
    if (!alerts && 'Notification' in window && Notification.permission !== 'granted') { try { await Notification.requestPermission(); } catch (e) { /* */ } }
    alerts = !alerts; S.set('alerts', alerts); $('bell').classList.toggle('on', alerts); toast(alerts ? 'Alerts on: breaking news and your watch words' : 'Alerts off');
  };
  $('watchBtn').onclick = editWatch; $('playBtn').onclick = () => openBrief();
  $('home').onclick = (e) => { e.preventDefault(); if (DAY) loadDay(null); go('front'); };
  $('drShade').onclick = closeDrawer;
  $('searchBtn').onclick = () => { document.body.classList.toggle('searching'); if (document.body.classList.contains('searching')) $('q').focus(); };
  let qt = 0; $('q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { query = e.target.value.trim(); render(); }, 180); });
  document.addEventListener('keydown', (e) => {
    if (BM) { if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'Escape') { if ($('drawer').classList.contains('open')) closeDrawer(); else closeBrief(); } return; }
    if (e.key === 'Escape') { if ($('drawer').classList.contains('open')) closeDrawer(); else if (query) { query = ''; $('q').value = ''; render(); } }
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); document.body.classList.add('searching'); $('q').focus(); }
  });
  function leave() { S.set('lastVisit', now()); saveSnap(); hiddenAt = now(); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) leave();
    else if (hiddenAt && now() - hiddenAt > 30 * 60) { since = S.get('lastVisit', since); S.set('anchor', since); snapPrev = S.get('snap', snapPrev); poll().then(() => { if (!BM) render(); }); }
    else poll();
  });
  setTimeout(() => { S.set('lastVisit', now()); saveSnap(); }, 30000);
  /* on phones, fold away the price and session rows once you are well down the page. Hysteresis (fold after 320px,
     unfold only near the top) so folding can never bounce the page back and forth. */
  let compact = false, ticking = false;
  function onScroll() {
    ticking = false;
    if (innerWidth > 720) { if (compact) { document.body.classList.remove('compact'); compact = false; } return; }
    const y = scrollY;
    if (!compact && y > 320) { compact = true; document.body.classList.add('compact'); }
    else if (compact && y < 30) { compact = false; document.body.classList.remove('compact'); }
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  function measureHeader() { if (compact) return; const h = document.querySelector('.nav-wrap').offsetHeight; document.body.style.setProperty('--hdr', (h + 4) + 'px'); }
  addEventListener('resize', measureHeader); setTimeout(measureHeader, 50); setTimeout(measureHeader, 1500);

  /* ================= start ================= */
  async function start() {
    /* world-atlas 110m: the standard map for d3 globes (outlines stay correct at every angle); centres of all 241 countries come from the detailed map */
    const centP = fetch('vendor/countries.json').then((r) => r.json()).then((c) => { Object.entries(c).forEach(([n, ll]) => { CENT[n] = CENT_FIX[n] || ll; }); }).catch(() => {});
    const mapP = fetch('vendor/world-110m.json').then((r) => r.json()).then((t) => { TOPO = t; FEATS = topojson.feature(t, t.objects.countries).features.filter((f) => f.properties.name !== 'Antarctica');
      FEATS.forEach((f) => { if (!CENT[f.properties.name]) CENT[f.properties.name] = CENT_FIX[f.properties.name] || d3.geoCentroid(f); }); MESH = topojson.mesh(t, t.objects.countries, (a, b) => a !== b); }).catch(() => {});
    let tries = 0;
    for (;;) { try { LIVE = await getJSON('data/today.json'); break; } catch (e) { if (tries++ === 0) { D = prepare({ stories: [] }); render(); } await new Promise((r) => setTimeout(r, 8000)); } }
    await Promise.all([mapP, centP]); D = prepare(LIVE);
    try { DAYS = (await getJSON('data/archive/index.json')).days || []; } catch (e) { DAYS = []; }
    render(); liveSocket();
    const h = location.hash; if (h.startsWith('#s=')) openStory(h.slice(3)); else if (h.startsWith('#p=')) openPlace(decodeURIComponent(h.slice(3)));
    else if (h === '#brief') openBrief();
    setInterval(poll, 120000);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  start();
})();
