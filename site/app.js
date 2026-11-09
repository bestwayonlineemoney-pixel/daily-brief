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
  let since = S.get('lastVisit', 0), snapPrev = S.get('snap', null), hiddenAt = 0;
  let TOPO = null, FEATS = [], CENT = {}, MESH = null; const GRAT = d3.geoGraticule10();
  const CENT_FIX = { 'United States of America': [-98, 39], France: [2.3, 46.6], Russia: [40, 56], Norway: [9, 61], Canada: [-98, 57], Netherlands: [5.3, 52.2], Denmark: [9.5, 56], Chile: [-71, -34], 'New Zealand': [172, -41], Indonesia: [113, -2], Malaysia: [102, 4] };
  let WRX = null;
  const sinceMode = () => !DAY && since > 0 && now() - since < 36 * 3600;
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

  /* ================= small pieces ================= */
  function kicker(s, opt) {
    opt = opt || {};
    const k = el('div', { class: 'kick' });
    if (!opt.noCat) k.append(el('span', { class: 'kc', style: { '--c': cv(s.cat) } }, el('i'), SHORT[s.cat]));
    if (s.breaking && !DAY) k.append(el('span', { class: 'tag brk', text: 'Breaking' }));
    if (isNew(s)) k.append(el('span', { class: 'tag new', text: 'New' }));
    else if (isUpd(s)) k.append(el('span', { class: 'tag upd', text: 'Updated · ' + newReports(s) + ' new' }));
    if (watched(s)) k.append(el('span', { class: 'tag watch', text: '★ Watch' }));
    k.append(el('span', { class: 'st ' + (s.status === 'VERIFIED' ? 'v' : s.status === 'OFFICIAL' ? 'o' : 's'), title: s.status === '1 SOURCE' ? 'Only one outlet so far' : '',
      text: s.status === 'VERIFIED' ? '✓ ' + s.n + ' sources' : s.status === 'OFFICIAL' ? '◆ Official' : '1 source' }));
    k.append(el('span', { class: 'tm', text: ago(s.last) }));
    if (s.developing && !opt.light) k.append(el('span', { class: 'tag dev', text: 'Developing · day ' + Math.max(2, Math.ceil((s.last - s.first) / 86400)) }));
    return k;
  }
  const srcLine = (s) => el('div', { class: 'srcs', text: (s.orgs || []).slice(0, 4).join(' · ') + (s.orgs.length > 4 ? ' +' + (s.orgs.length - 4) : '') });
  function item(s, opt) {
    opt = opt || {};
    const a = el('article', { 'data-sid': s.id, class: 'item' + (seen.has(s.id) ? ' read' : '') + (opt.num ? ' numd' : '') + (opt.thumb ? ' has-th' : ''), tabindex: 0, role: 'button',
      onclick: () => openStory(s.id), onkeydown: (e) => { if (e.key === 'Enter') openStory(s.id); } });
    if (opt.num) a.append(el('span', { class: 'num', style: { '--c': cv(s.cat) }, text: opt.num }));
    a.append(el('div', { class: 'body' }, kicker(s, opt), el('h3', { text: s.title }), s.dek && !opt.noDek ? el('p', { class: 'dek', text: s.dek }) : null, opt.noSrc ? null : srcLine(s)));
    if (opt.thumb) { const t = el('div', { class: 'th' }); t.append(artBox(s)); a.append(t); }
    return a;
  }
  function lead(s) {
    const a = el('article', { class: 'lead', tabindex: 0, role: 'button', onclick: () => openStory(s.id), onkeydown: (e) => { if (e.key === 'Enter') openStory(s.id); } });
    const b = el('div', { class: 'banner' }); b.append(artBox(s, true));
    const m = marketArt(s); if (m) b.append(el('span', { class: 'mchip' }, m.name + ' ', el('b', { text: fmtP(m) }), ' ', el('i', { class: (m.chg || 0) >= 0 ? 'u' : 'd', text: fmtC(m.chg) })));
    a.append(b, el('div', { class: 'body' }, kicker(s), el('h2', { text: s.title }), s.dek ? el('p', { class: 'dek', text: s.dek }) : null, srcLine(s)));
    return a;
  }
  function sec(title, opt, ...kids) {
    opt = opt || {};
    return el('section', { class: 'sec ' + (opt.cls || ''), id: opt.id || null, style: opt.c ? { '--c': opt.c } : null },
      el('div', { class: 'sec-h' }, el('h2', { text: title }), opt.sub ? el('span', { class: 'sub', text: opt.sub }) : null, opt.more || null), kids);
  }
  function tile(m, big, mode) {
    const sc = sinceChg(m), useSince = mode === 'since' && sc !== null, up = ((useSince ? sc : m.chg) || 0) >= 0, d = sparkPath(m.spark, 0, 120, 3, 27);
    const t = el('div', { class: 'tile' + (big ? ' big' : ''), title: m.src ? 'Source: ' + m.src : '' }, el('div', { class: 'tn', text: m.name }), el('div', { class: 'tv', text: fmtP(m) }),
      el('div', { class: 'tc ' + (up ? 'u' : 'd'), text: m.err ? 'not available' : useSince ? fmtC(sc) + ' since visit' : fmtC(m.chg) + ' today' }),
      !mode && sc !== null && Math.abs(sc) >= 0.01 && sinceMode() ? el('div', { class: 'ts ' + (sc >= 0 ? 'u' : 'd'), text: fmtC(sc) + ' since visit' }) : null);
    if (d) { const g = svg('0 0 120 30', `<path d="${d}" fill="none" stroke="${up ? '#22C55E' : '#EF4444'}" stroke-width="1.6" stroke-linejoin="round"/>`); g.setAttribute('preserveAspectRatio', 'none'); g.classList.add('tsp'); t.append(g); }
    return t;
  }
  function mrow(m) {
    const up = (m.chg || 0) >= 0, d = sparkPath(m.spark, 0, 60, 2, 18);
    const g = d ? svg('0 0 60 20', `<path d="${d}" fill="none" stroke="${up ? '#22C55E' : '#EF4444'}" stroke-width="1.4"/>`) : el('span');
    if (d) g.setAttribute('preserveAspectRatio', 'none');
    return el('div', { class: 'mrow', title: m.src || '' }, el('span', { class: 'mn', text: m.name }), g, el('span', { class: 'mv', text: fmtP(m) }), el('span', { class: 'mc ' + (up ? 'u' : 'd'), text: fmtC(m.chg) }));
  }
  function fngGauge(f) {
    const a = Math.PI * (1 - f.v / 100), x = 60 + Math.cos(a) * 46, y = 62 - Math.sin(a) * 46;
    const c = f.v < 25 ? '#EF4444' : f.v < 45 ? '#F97316' : f.v < 56 ? '#EAB308' : f.v < 76 ? '#84CC16' : '#22C55E';
    return el('div', { class: 'gauge' }, svg('0 0 120 70', `<defs><linearGradient id="fg${++gid}"><stop offset="0" stop-color="#EF4444"/><stop offset=".5" stop-color="#EAB308"/><stop offset="1" stop-color="#22C55E"/></linearGradient></defs>
      <path d="M14 62 A46 46 0 0 1 106 62" fill="none" stroke="url(#fg${gid})" stroke-width="10" stroke-linecap="round"/><line x1="60" y1="62" x2="${x}" y2="${y}" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="62" r="5" fill="currentColor"/>`),
      el('div', null, el('div', { class: 'gv', style: { color: c }, text: f.v }), el('div', { class: 'gl', text: f.label }), el('small', { text: 'Crypto Fear & Greed' })));
  }

  /* ================= right rail ================= */
  function rail(focus) {
    const r = el('aside', { class: 'rail' });
    const groups = focus && MKT[focus] ? [focus] : ['crypto', 'forex', 'commodities', 'energy', 'economy'];
    const box = el('div', { class: 'card mk' }, el('h4', { text: focus && MKT[focus] ? MKT_NAME[focus] + ' now' : 'Markets now' }));
    groups.forEach((g) => { const L = MKT[g].map((k) => MK[k]).filter((m) => m && isNum(m.p)); if (!L.length) return; if (groups.length > 1) box.append(el('div', { class: 'mg', text: MKT_NAME[g] })); L.forEach((m) => box.append(mrow(m))); });
    if (D.fng && (!focus || focus === 'crypto')) box.append(fngGauge(D.fng));
    box.append(el('div', { class: 'fine', text: 'Change on the day · for the big picture, not trading' }));
    r.append(box);
    const g = el('div', { class: 'card globe-box' }, el('h4', { text: 'Where it\'s happening' }), el('div', { class: 'fine', text: 'Drag to turn · tap a dot' }));
    r.append(g);
    const list = focus ? storiesOf(focus) : D.stories.filter(quality);
    requestAnimationFrame(() => { if (FEATS.length && list.some((s) => (s.places || []).length)) mountGlobe(g, list); else g.remove(); });
    const dv = D.stories.filter((s) => s.developing && (!focus || inCat(s, focus))).sort((a, b) => imp(b) - imp(a)).slice(0, 5);
    if (dv.length) r.append(el('div', { class: 'card dv' }, el('h4', { text: 'Developing' }), dv.map((s) => {
      const span = Math.max(1, s.last - s.first), tl = el('div', { class: 'tl' });
      (s.reports || []).forEach((x) => tl.append(el('i', { style: { left: ((x.ts - s.first) / span * 100).toFixed(1) + '%', '--c': cv(s.cat) } })));
      return el('div', { class: 'dvi', onclick: () => openStory(s.id) }, el('div', { class: 'dvt', text: s.title }), tl, el('div', { class: 'fine', text: 'since ' + dshort(s.first) + ' · ' + (s.reports || []).length + ' reports' }));
    })));
    return r;
  }

  /* ================= the overview page ================= */
  function greet() { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function viewHome(M) {
    const content = el('div', { class: 'col' }); M.append(el('div', { class: 'grid' }, content, rail()));
    const q = D.stories.filter(quality);
    if (!D.stories.length) { content.append(el('div', { class: 'empty', text: LIVE ? 'No stories yet.' : 'Collecting the first news… this page fills itself in a minute.' })); return; }
    /* hello */
    const nNew = D.stories.filter((s) => isNew(s) && quality(s)).length, nUpd = D.stories.filter(isUpd).length, nBrk = DAY ? 0 : D.stories.filter((s) => s.breaking).length;
    const moves = (D.markets || []).filter((m) => isNum(m.p) && isNum(m.chg)).map((m) => ({ m, c: sinceMode() && isNum(sinceChg(m)) ? sinceChg(m) : m.chg }))
      .sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, 4);
    const hello = el('section', { class: 'hello' },
      el('div', { class: 'hi' }, DAY ? 'From the archive' : greet() + '.'),
      el('p', { class: 'lede', text: DAY ? 'The biggest stories of ' + new Date(DAY + 'T12:00:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) + '.'
        : sinceMode() ? `Since you were last here ${ago(since).replace(' ago', '')} ago: ${nNew} new ${nNew === 1 ? 'story' : 'stories'} worth knowing${nUpd ? ', ' + nUpd + ' updated' : ''}${nBrk ? ', ' + nBrk + ' breaking' : ''}.`
          : `Here is the day so far: ${q.length} stories confirmed by two or more newsrooms or by official sources.` }),
      el('div', { class: 'hello-act' }, el('button', { class: 'btn pri big', onclick: () => openBrief() }, '▶  Play the 5-minute brief'),
        el('span', { class: 'fine', text: (D.feeds ? D.feeds.ok + ' of ' + D.feeds.total + ' sources · ' : '') + 'updated ' + (D.updated ? ago(D.updated) : '—') })));
    if (moves.length) hello.append(el('div', { class: 'moves' }, el('div', { class: 'mg', text: sinceMode() && snapPrev ? 'Biggest moves since you left' : 'Biggest moves today' }),
      el('div', { class: 'tiles' }, moves.map(({ m }) => tile(m, false, sinceMode() && snapPrev ? 'since' : 'today')))));
    content.append(hello);
    /* breaking */
    if (!DAY) D.stories.filter((s) => s.breaking).sort((a, b) => b.n - a.n).slice(0, 2).forEach((s) => content.append(el('div', { class: 'breaking', onclick: () => openStory(s.id) },
      el('span', { class: 'bl', text: 'Breaking' }), el('span', { class: 'bt', text: s.title }), el('span', { class: 'fine', text: s.n + ' newsrooms · ' + ago(s.first) }))));
    /* since you were away */
    const shown = new Set();
    if (sinceMode()) {
      const L = D.stories.filter((s) => (isNew(s) && (quality(s) || watched(s) || s.home)) || isUpd(s)).sort((a, b) => imp(b) - imp(a)).slice(0, 8);
      if (L.length) { L.forEach((s) => shown.add(s.id)); content.append(sec('While you were away', { sub: 'New and updated, most important first', c: 'var(--accent)' }, el('div', { class: 'list' }, L.map((s) => item(s, { thumb: true }))))); }
    }
    /* top stories */
    const top = D.top.map((id) => BYID[id]).filter((s) => s && !shown.has(s.id)).slice(0, 7);
    if (top.length) { top.forEach((s) => shown.add(s.id)); content.append(sec(DAY ? 'Top stories of the day' : 'Today\'s top stories', { sub: 'The day in order of importance' },
      lead(top[0]), el('div', { class: 'list' }, top.slice(1).map((s, i) => item(s, { num: i + 2, thumb: false }))))); }
    /* every area */
    const cards = chapterOrder().map((c) => {
      const L = storiesOf(c), Q = L.filter(quality), pick = (Q.length ? Q : L).slice(0, 3), ms = (MKT[c] || []).map((k) => MK[k]).filter((m) => m && isNum(m.p)).slice(0, 3);
      return el('div', { class: 'area', style: { '--c': cv(c) }, role: 'button', tabindex: 0, onclick: () => go(c), onkeydown: (e) => { if (e.key === 'Enter') go(c); } },
        el('div', { class: 'ah' }, el('span', { class: 'ai', text: ICON[c] }), el('b', { text: cname(c) }), el('span', { class: 'an', text: L.length })),
        ms.length ? el('div', { class: 'am' }, ms.map((m) => el('span', null, m.name.replace(' oil', '').replace(' index', ''), ' ', el('b', { text: fmtP(m) }), ' ', el('i', { class: (m.chg || 0) >= 0 ? 'u' : 'd', text: fmtC(m.chg) })))) : null,
        el('ul', null, pick.map((s) => el('li', { class: seen.has(s.id) ? 'read' : '' }, s.title))), el('span', { class: 'ago', text: 'Open ' + SHORT[c] + ' →' }));
    });
    content.append(sec('Every area at a glance', { sub: 'Tap an area to read it' }, el('div', { class: 'areas' }, cards)));
    /* watch words */
    const W = D.stories.filter((s) => watched(s) && !shown.has(s.id)).sort((a, b) => imp(b) - imp(a)).slice(0, 6);
    if (W.length) content.append(sec('Your watch words', { sub: (watch || []).join(' · '), more: el('button', { class: 'lnk', onclick: editWatch, text: 'Edit' }) }, el('div', { class: 'list' }, W.map((s) => item(s)))));
  }

  /* ================= a chapter ================= */
  function viewCat(M, c) {
    const content = el('div', { class: 'col' }); M.append(el('div', { class: 'grid' }, content, rail(c)));
    const L = storiesOf(c), Q = L.filter(quality), single = L.filter((s) => !quality(s)), A = alsoOf(c);
    const head = el('header', { class: 'ch', style: { '--c': cv(c) } }, el('div', { class: 'chk', text: ICON[c] + '  Chapter' }), el('h1', { text: cname(c) }),
      el('p', { class: 'lede', text: L.length ? `${Q.length} confirmed ${Q.length === 1 ? 'story' : 'stories'}${single.length ? ' and ' + single.length + ' single-source headlines' : ''} in the last 24 hours.` : 'Nothing in the last 24 hours yet.' }));
    const ms = (MKT[c] || []).map((k) => MK[k]).filter((m) => m && isNum(m.p));
    if (ms.length) head.append(el('div', { class: 'tiles' }, ms.map((m) => tile(m, true))));
    content.append(head);
    if (!L.length) return;
    const main = Q.length ? Q : L.slice(0, 6), first = main[0];
    content.append(lead(first));
    const groups = {}; main.slice(1).forEach((s) => { const g = subOf(s, c); (groups[g] = groups[g] || []).push(s); });
    Object.entries(groups).sort((a, b) => imp(b[1][0]) - imp(a[1][0])).forEach(([g, list]) =>
      content.append(sec(g, { cls: 'sub-sec', c: cv(c) }, el('div', { class: 'list' }, list.map((s) => item(s, { noCat: true, thumb: list.length < 4 && s === list[0] }))))));
    if (A.length) content.append(sec('Also moving ' + SHORT[c].toLowerCase(), { cls: 'sub-sec', sub: 'From other chapters', c: cv(c) }, el('div', { class: 'list' }, A.slice(0, 5).map((s) => item(s, { noDek: true })))));
    const rest = Q.length ? single : L.slice(6);
    if (rest.length) content.append(el('details', { class: 'more' }, el('summary', null, `More headlines (${rest.length}) · reported by one outlet so far`),
      el('div', { class: 'list tight' }, rest.slice(0, 40).map((s) => item(s, { noCat: true, noDek: true })))));
  }
  function viewList(M, title, L, sub, extra) {
    const content = el('div', { class: 'col' }); M.append(el('div', { class: 'grid' }, content, rail()));
    content.append(sec(title, { sub, more: extra }, L.length ? el('div', { class: 'list' }, L.map((s) => item(s))) : el('div', { class: 'empty', text: 'Nothing here yet.' })));
  }
  function viewSaved(M) {
    const L = Object.values(stars).sort((a, b) => b.saved - a.saved).map((s) => BYID[s.id] || s);
    viewList(M, 'Saved stories', L, 'Kept on this device · ' + L.length, L.length ? el('button', { class: 'lnk', onclick: () => copy(L), text: '⧉ Copy all' }) : null);
  }

  /* ================= header + chapters bar ================= */
  function renderChapters() {
    const nav = clear($('nav'));
    const b = (k, label, c, n) => el('button', { class: view === k && !query ? 'on' : '', style: c ? { '--c': c } : null, onclick: () => go(k) }, c ? el('i') : null, label, n ? el('small', { text: n }) : null);
    nav.append(b('front', 'Overview', null));
    CATS.forEach((c) => { const n = storiesOf(c).filter(quality).length; if (storiesOf(c).length) nav.append(b(c, SHORT[c], cv(c), n || null)); });
    const ns = Object.keys(stars).length; nav.append(b('saved', '☆ Saved', null, ns || null));
  }
  function renderTop() {
    const t = DAY ? new Date(DAY + 'T12:00:00') : new Date();
    clear($('dateTxt')).append(t.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), DAY ? el('em', { text: ' · archive' }) : el('em', { class: 'live', text: ' · live' }));
    const ref = DAY || (LIVE && LIVE.date); $('prevDay').disabled = !DAYS.some((d) => d < ref); $('nextDay').disabled = !DAY;
    const items = ['btc', 'eth', 'spx', 'gold', 'oil', 'gas', 'dxy', 'eur', 'jpy', 'lkr', 'tnx', 'vix', 'silver', 'copper', 'sol'].map((k) => MK[k]).filter((m) => m && isNum(m.p))
      .map((m) => el('span', null, m.name, el('em', { text: fmtP(m) }), el('b', { class: (m.chg || 0) >= 0 ? 'u' : 'd', text: fmtC(m.chg) })));
    if (!items.length) items.push(el('span', null, 'Prices appear after the first update'));
    clear($('tick')).append(...items, ...items.map((n) => n.cloneNode(true)));
  }
  function renderFoot() {
    const f = D.feeds || {}, list = Object.entries(f.list || {});
    clear($('foot')).append(el('div', null, el('b', { text: 'How it works. ' }), 'The same story from different newsrooms is grouped into one. ', el('b', { text: '✓ sources' }), ' = confirmed by 2 or more independent newsrooms · ',
      el('b', { text: '◆ Official' }), ' = a government body, central bank, regulator or agency · ', el('b', { text: '1 source' }), ' = not confirmed yet (kept under "More headlines"). ',
      'Headlines and the short teaser come from each outlet\'s own feed; tap through to read the full story there. Pictures are drawn from data (globes, maps, charts), not news photos.',
      list.length ? el('details', null, el('summary', { text: `Sources: ${f.ok} of ${f.total} reachable on the last update` }),
        el('div', { class: 'fl' }, list.sort((a, b) => (a[1].ok === b[1].ok ? a[0].localeCompare(b[0]) : a[1].ok ? 1 : -1)).map(([n, h]) => el('span', { class: h.ok ? '' : 'bad', title: h.err || (h.n + ' headlines'), text: (h.ok ? '● ' : '○ ') + n })))) : null),
      el('div', null, el('b', { text: 'The Daily Brief' }), el('br'), 'Saved stories, watch words and what you have read stay on this device. ',
        el('button', { class: 'lnk', onclick: editWatch, text: 'Edit watch words' })));
  }
  function render() {
    renderTop(); renderChapters();
    const M = clear($('main')); if (GLOBE) { GLOBE.stop(); GLOBE = null; } GROT.r = null;
    if (query) { const qq = query.toLowerCase(); const L = D.stories.filter((s) => (s.title + ' ' + (s.dek || '') + ' ' + s.orgs.join(' ') + ' ' + (s.places || []).map((p) => p.p).join(' ')).toLowerCase().includes(qq)).sort((a, b) => imp(b) - imp(a));
      viewList(M, 'Search', L, `${L.length} ${L.length === 1 ? 'story matches' : 'stories match'} “${query}”`); }
    else if (view === 'front') viewHome(M);
    else if (CATS.includes(view)) viewCat(M, view);
    else if (view === 'saved') viewSaved(M);
    else { view = 'front'; viewHome(M); }
    renderFoot();
  }

  /* ================= one story ================= */
  function openDrawer(build) { const p = clear($('drPanel')); build(p); $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); document.body.classList.add('lock'); p.scrollTop = 0; setTimeout(() => { const x = p.querySelector('.dr-x'); if (x) x.focus(); }, 60); }
  function closeDrawer() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); if (!$('bm').classList.contains('open')) document.body.classList.remove('lock'); if (/^#(s|p)=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); }
  function saveBtn(s) {
    return el('button', { class: 'btn' + (stars[s.id] ? ' on' : ''), onclick: (e) => { e.stopPropagation(); if (stars[s.id]) delete stars[s.id]; else stars[s.id] = Object.assign({}, s, { saved: Date.now() }); S.set('stars', stars);
      e.currentTarget.classList.toggle('on', !!stars[s.id]); e.currentTarget.textContent = stars[s.id] ? '★ Saved' : '☆ Save'; renderChapters(); }, text: stars[s.id] ? '★ Saved' : '☆ Save' });
  }
  function openStory(id) {
    const s = BYID[id] || stars[id]; if (!s) return; markSeen(s.id);
    history.replaceState(null, '', '#s=' + id);
    openDrawer((p) => {
      p.append(el('div', { class: 'dr-art' }, artFor(s, true)), el('button', { class: 'ib dr-x', onclick: closeDrawer, 'aria-label': 'Close', text: '✕' }));
      const off = s.orgs.filter((o) => /SEC|Fed|ECB|Bank|BLS|IMF|United Nations|NASA|WHO|USGS|EIA/i.test(o));
      const sure = s.status === 'OFFICIAL' ? `Comes from an official source (${off.join(', ') || s.orgs[0]})` + (s.n > 1 ? `, and ${s.n - 1} more outlet${s.n > 2 ? 's' : ''} report it too.` : '.')
        : s.status === 'VERIFIED' ? `Confirmed by ${s.n} independent newsrooms: ${s.orgs.join(', ')}.` : `Only ${s.orgs[0]} has reported this so far. Treat it as unconfirmed until others confirm it.`;
      const rel = D.stories.filter((x) => x.id !== s.id && quality(x) && ((x.places || []).some((pp) => (s.places || []).some((q) => q.c === pp.c)) || (x.kw || []).some((k) => (s.kw || []).includes(k)))).sort((a, b) => imp(b) - imp(a)).slice(0, 4);
      const m = marketArt(s);
      p.append(el('div', { class: 'dr-body' }, kicker(s), el('h2', { text: s.title }), s.dek ? el('p', { class: 'dek big', text: s.dek }) : null,
        el('div', { class: 'fine', text: (s.dek ? 'Teaser from ' + (s.reports.find((r) => r.u === s.link) || {}).o + '. ' : '') + 'First reported ' + dshort(s.first) + ', ' + hm(s.first) + ' · latest ' + hm(s.last) }),
        m ? el('div', { class: 'tiles', style: { marginTop: '14px' } }, tile(m, true)) : null,
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
    $('bm').style.setProperty('--c', c ? cv(c) : 'var(--accent)');
    const [a, b] = chapterBounds(); const bars = clear($('bmBars'));
    for (let k = a; k < b; k++) bars.append(el('i', { class: k < BM.i ? 'done' : k === BM.i ? 'now' : '' }));
    const stories = sl.filter((y) => y.t === 'story'), sn = sl.slice(0, BM.i + 1).filter((y) => y.t === 'story').length;
    $('bmWhere').textContent = c ? cname(c) : x.t === 'intro' ? 'The 5-minute brief' : 'Done';
    $('bmCount').textContent = stories.length ? `${sn} / ${stories.length}` : '';
    const card = el('div', { class: 'slide ' + x.t + (dir ? (dir > 0 ? ' in-r' : ' in-l') : '') });
    if (x.t === 'intro') {
      const mv = (D.markets || []).filter((m) => isNum(m.p) && isNum(m.chg)).sort((p, q) => Math.abs(q.chg) - Math.abs(p.chg)).slice(0, 4);
      card.append(el('div', { class: 'sl-in' }, el('div', { class: 'big-hi', text: greet() + '.' }),
        el('p', { class: 'lede', text: `Here is ${DAY ? 'that day' : 'the world right now'} in ${stories.length} stories across ${sl.filter((y) => y.t === 'chapter').length} areas. About ${Math.max(2, Math.round(stories.length * 0.25))} minutes.` }),
        sinceMode() ? el('p', { class: 'fine', text: 'Last visit: ' + ago(since) }) : null,
        mv.length ? el('div', { class: 'tiles' }, mv.map((m) => tile(m, false, 'today'))) : null,
        el('div', { class: 'chips big' }, sl.filter((y) => y.t === 'chapter').map((y) => el('button', { style: { '--c': cv(y.c) }, onclick: (e) => { e.stopPropagation(); BM.i = sl.indexOf(y); showSlide(1); } }, el('i'), SHORT[y.c]))),
        el('button', { class: 'btn pri big', onclick: (e) => { e.stopPropagation(); step(1); } }, 'Start  →')));
    } else if (x.t === 'chapter') {
      const L = storiesOf(c), ms = (MKT[c] || []).map((k) => MK[k]).filter((m) => m && isNum(m.p)).slice(0, 4);
      card.append(el('div', { class: 'sl-in center' }, el('div', { class: 'ch-ic', text: ICON[c] }), el('h1', { text: cname(c) }),
        el('p', { class: 'lede', text: `${x.n} confirmed ${x.n === 1 ? 'story' : 'stories'} today · ${L.length} in total` }),
        ms.length ? el('div', { class: 'tiles' }, ms.map((m) => tile(m, false, 'today'))) : null,
        el('ul', { class: 'ch-list' }, L.filter(quality).slice(0, 4).map((s) => el('li', { text: s.title })))));
    } else if (x.t === 'story') {
      const s = x.s; markSeen(s.id);
      const art = el('div', { class: 'sl-art' }, artFor(s, true)); const m = marketArt(s);
      if (m) art.append(el('span', { class: 'mchip' }, m.name + ' ', el('b', { text: fmtP(m) }), ' ', el('i', { class: (m.chg || 0) >= 0 ? 'u' : 'd', text: fmtC(m.chg) })));
      card.append(art, el('div', { class: 'sl-in' }, kicker(s), el('h2', { text: s.title }), s.dek ? el('p', { class: 'dek', text: s.dek }) : null, srcLine(s),
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
  function paintAll(root) { root.querySelectorAll('.art').forEach((b) => paint(b)); }
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
          if (alerts && 'Notification' in window && Notification.permission === 'granted') { try { const n = new Notification(s.breaking ? 'Breaking · The Daily Brief' : '★ Watch word · The Daily Brief', { body: s.title + '\n' + s.orgs.slice(0, 3).join(', '), icon: 'icon-192.png', tag: s.id }); n.onclick = () => { focus(); openStory(s.id); }; } catch (e) { /* */ } } }); }
      getJSON('data/archive/index.json').then((x) => { DAYS = x.days || []; renderTop(); }).catch(() => {});
    } catch (e) { /* offline: keep what we have */ }
  }
  function applyTheme(t) { document.documentElement.dataset.theme = t; $('theme').textContent = t === 'dark' ? '☀' : '☾'; const mt = document.querySelector('meta[name=theme-color]'); if (mt) mt.content = t === 'dark' ? '#0C0D10' : '#F6F4EF'; }
  let theme = S.get('theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); applyTheme(theme);
  $('theme').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; S.set('theme', theme); applyTheme(theme); };
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
    else if (hiddenAt && now() - hiddenAt > 30 * 60) { since = S.get('lastVisit', since); snapPrev = S.get('snap', snapPrev); poll().then(() => { if (!BM) render(); }); }
    else poll();
  });
  setTimeout(() => { S.set('lastVisit', now()); saveSnap(); }, 30000);

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
    render();
    const h = location.hash; if (h.startsWith('#s=')) openStory(h.slice(3)); else if (h.startsWith('#p=')) openPlace(decodeURIComponent(h.slice(3)));
    else if (h === '#brief') openBrief();
    setInterval(poll, 120000);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  start();
})();
