/* holm-security-card — https://github.com/kaaribou/holm-security-card — licence MIT — v1.1.1 */
// holm-security-card — détecteurs de mouvement, ouvertures et détections caméra en un seul endroit
// Deux vues : Tuiles (état + « il y a ») et Chronologie (activité des 24 dernières heures).
// type: custom:holm-security-card
// title: Sécurité
// hours: 24            view: tiles | timeline      show_frame: true
// groups:
//   - name: Intérieur   icon: mdi:home
//     entities: [{ entity: binary_sensor.x, name: Bureau, icon: mdi:desk, on_label: ouvert }]
//   - name: Allée        icon: mdi:cctv   layout: camera   (une ligne compacte : Personne / Véhicule / Animal)
//     entities: [...]
(() => {
// Garde la position de défilement pendant un nouveau rendu complet de la carte (iPhone / iPad : WebKit n'a pas de
// « scroll anchoring » et la page remontait d'un coup). On fige la hauteur de la carte et on remet le défilement en place.
const keepScroll = (host, fn) => {
  const saved = [];
  let n = host;
  while (n) {
    n = n.assignedSlot || n.parentNode || n.host;
    if (n && n.nodeType === 1 && n.scrollHeight > n.clientHeight) saved.push([n, n.scrollTop]);
  }
  const se = document.scrollingElement;
  if (se) saved.push([se, se.scrollTop]);
  const h = host.offsetHeight;
  if (h) host.style.minHeight = `${h}px`;
  try { return fn(); } finally {
    const restore = () => saved.forEach(([el, t]) => { if (Math.abs(el.scrollTop - t) > 1) el.scrollTop = t; });
    restore();
    requestAnimationFrame(() => { restore(); host.style.minHeight = ""; requestAnimationFrame(restore); });
    setTimeout(() => { host.style.minHeight = ""; }, 500);   // page en arrière-plan : pas d'image affichée, donc pas de requestAnimationFrame
  }
};
const ACT = "#e2702a", RECENT = "#0abfbf";
const COLORS = ["#e2702a", "#4a90d9", "#9b6fd6", "#1fce8a", "#e3a21a", "#e05a8a"];
const KIND = (e) => (/person|humain|personne/i.test(e.entity + " " + (e.name || "")) ? ["Personne", "#e05a8a"] : /vehic/i.test(e.entity + " " + (e.name || "")) ? ["Véhicule", "#4a90d9"] : /anim|pet|dog|chien|chat/i.test(e.entity + " " + (e.name || "")) ? ["Animal", "#9b6fd6"] : [e.name, "#e3a21a"]);
const rel = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`; }
  const d = Math.round(s / 86400); return `${d} j`;
};
const hm = (t) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

class HolmSecurityCard extends HTMLElement {
  setConfig(c) {
    if (!c || !Array.isArray(c.groups) || !c.groups.length) throw new Error("holm-security-card : 'groups' est requis");
    this._c = { title: "Sécurité", hours: 24, view: "tiles", show_frame: true, ...c };
    this._view = this._c.view; this._hist = null; this._sig = null;
    if (this._hass) { this._render(); this._load(); }
  }
  _ids() { return this._c.groups.flatMap((g) => (g.entities || []).map((e) => (typeof e === "string" ? e : e.entity))).filter(Boolean); }
  set hass(h) {
    const first = !this._hass; this._hass = h;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const sig = this._ids().map((i) => h.states[i]?.state + (h.states[i]?.last_changed || "")).join("|");
    if (sig !== this._sig) {
      const changed = this._sig !== null; this._sig = sig; this._render();
      if (first) this._load(); else if (changed && this._view === "timeline") { clearTimeout(this._deb); this._deb = setTimeout(() => this._load(), 20000); }
    }
  }
  connectedCallback() { clearInterval(this._tk); this._tk = setInterval(() => { this._render(); if (this._view === "timeline") this._load(); }, 60000); }
  disconnectedCallback() { clearInterval(this._tk); clearTimeout(this._deb); }
  async _load() {
    if (!this._hass) return;
    const hours = Number(this._c.hours) || 24, start = new Date(Date.now() - hours * 3600000);
    try {
      const r = await this._hass.callWS({ type: "history/history_during_period", start_time: start.toISOString(), entity_ids: this._ids(),
        minimal_response: true, no_attributes: true, significant_changes_only: false });
      const out = {};
      for (const [id, arr] of Object.entries(r || {})) {
        const seg = []; let on = null;
        for (const x of arr) {
          const t = (x.lu || x.lc) * 1000, st = x.s;
          if (st === "on" && on === null) on = Math.max(t, +start);
          else if (st !== "on" && on !== null) { seg.push([on, t]); on = null; }
        }
        if (on !== null) seg.push([on, Date.now()]);
        out[id] = seg;
      }
      this._hist = { start: +start, end: Date.now(), seg: out };
    } catch (e) { this._hist = { err: e?.message || String(e) }; }
    this._render();
  }
  _ent(e, g) {
    const o = typeof e === "string" ? { entity: e } : e;
    const s = this._hass.states[o.entity];
    return { ...o, s, name: o.name || s?.attributes.friendly_name || o.entity, on: s?.state === "on", t: s ? new Date(s.last_changed).getTime() : 0,
      icon: o.icon || (g.layout === "camera" ? (/person|humain/i.test(o.entity) ? "mdi:account" : /vehic/i.test(o.entity) ? "mdi:car" : /anim/i.test(o.entity) ? "mdi:dog" : "mdi:motion-sensor") : "mdi:motion-sensor"),
      unavailable: !s || s.state === "unavailable" || s.state === "unknown" };
  }
  _tiles(G) {
    return G.map((g) => {
      if (g.layout === "camera") {
        const last = g.E.reduce((a, e) => (e.t > a.t ? e : a), { t: 0 });
        const anyOn = g.E.some((e) => e.on);
        return `<div class="cam ${anyOn ? "on" : ""}"><div class="cn" data-g="${g._i}"><ha-icon icon="${g.icon || "mdi:cctv"}"></ha-icon><div><div class="nm">${g.name}</div>
            <div class="sub">${anyOn ? `<b>Détection en cours</b>` : last.t ? `${last.name} · il y a ${rel(last.t)}` : "—"}</div></div></div>
          <div class="ci">${g.E.map((e) => `<button class="dot ${e.on ? "on" : ""} ${Date.now() - e.t < 900000 && !e.on ? "rc" : ""} ${e.unavailable ? "na" : ""}" data-e="${e.entity}" title="${e.name} : ${e.on ? "en cours" : "il y a " + rel(e.t)}">
            <ha-icon icon="${e.icon}"></ha-icon><span>${e.on ? "maint." : rel(e.t)}</span></button>`).join("")}</div></div>`;
      }
      return `<div class="grp"><div class="gh"><ha-icon icon="${g.icon || "mdi:home"}"></ha-icon>${g.name}<span>${g.E.filter((e) => e.on).length ? `${g.E.filter((e) => e.on).length} actif${g.E.filter((e) => e.on).length > 1 ? "s" : ""}` : ""}</span></div>
        <div class="tiles">${g.E.map((e) => `<button class="tile ${e.on ? "on" : ""} ${Date.now() - e.t < 900000 && !e.on ? "rc" : ""} ${e.unavailable ? "na" : ""}" data-e="${e.entity}"
          title="${e.t ? new Date(e.t).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}">
          <ha-icon icon="${e.icon}"></ha-icon><div class="tn">${e.name}</div><div class="tt">${e.unavailable ? "indisponible" : e.on ? (e.on_label || "détection") : rel(e.t)}</div></button>`).join("")}</div></div>`;
    }).join("");
  }
  // respecte l'ordre des groupes ; les groupes caméra qui se suivent forment un bloc « Caméras »
  _runs(G) {
    const runs = [];
    G.forEach((g, i) => {
      const cam = g.layout === "camera", last = runs[runs.length - 1];
      if (cam && last && last.cam) last.items.push({ g, i }); else runs.push({ cam, items: [{ g, i }] });
    });
    return runs;
  }
  _tilesOrdered(G) {
    return this._runs(G).map((r) => r.cam
      ? `<div class="grp"><div class="gh"><ha-icon icon="mdi:cctv"></ha-icon>Caméras</div><div class="cams">${this._tiles(r.items.map((x) => x.g))}</div></div>`
      : this._tiles(r.items.map((x) => x.g))).join("");
  }
  _timeline(G) {
    const H = this._hist;
    if (!H) return `<div class="empty">Chargement de l'historique…</div>`;
    if (H.err) return `<div class="err">Erreur : ${H.err}</div>`;
    const span = H.end - H.start, pct = (t) => (((t - H.start) / span) * 100).toFixed(3);
    const hours = Number(this._c.hours) || 24, step = hours <= 12 ? 2 : hours <= 24 ? 3 : 12;
    const ticks = [];
    const t0 = new Date(H.start); t0.setMinutes(0, 0, 0); t0.setHours(t0.getHours() + 1);
    for (let t = +t0; t < H.end; t += 3600000) if (new Date(t).getHours() % step === 0) ticks.push(t);
    const bar = (segs, color) => segs.map(([a, b]) => `<i style="left:${pct(a)}%;width:max(2px,${(((b - a) / span) * 100).toFixed(3)}%);background:${color}"></i>`).join("");
    const grid = ticks.map((t) => `<u style="left:${pct(t)}%"></u>`).join("");
    let prevCam = false;
    const rows = G.map((g, gi) => {
      const isCam = g.layout === "camera", wasCam = prevCam; prevCam = isCam;
      if (isCam) {
        const head = wasCam ? "" : `<div class="tg">Caméras</div>`;
        const n = g.E.reduce((a, e) => a + (H.seg[e.entity] || []).length, 0);
        return `${head}<div class="tr" data-g="${gi}"><div class="tl"><ha-icon icon="${g.icon || "mdi:cctv"}"></ha-icon>${g.name}</div>
          <div class="tb tbc">${grid}${g.E.map((e) => bar(H.seg[e.entity] || [], KIND(e)[1])).join("")}</div><div class="tc">${n || ""}</div></div>`;
      }
      return `<div class="tg">${g.name}</div>` + g.E.map((e) => {
        const s = H.seg[e.entity] || [];
        return `<div class="tr" data-e="${e.entity}"><div class="tl"><ha-icon icon="${e.icon}"></ha-icon>${e.name}</div><div class="tb">${grid}${bar(s, ACT)}</div><div class="tc">${s.length || ""}</div></div>`;
      }).join("");
    }).join("");
    const camLegend = [...new Map(G.filter((g) => g.layout === "camera").flatMap((g) => g.E.map((e) => KIND(e))).map((k) => [k[0], k[1]])).entries()]
      .map(([n, col]) => `<span><b style="background:${col}"></b>${n}</span>`).join("");
    return `<div class="tlw">${rows}<div class="tr ax"><div class="tl"></div><div class="tb">${ticks.map((t) => `<em style="left:${pct(t)}%">${new Date(t).getHours()}h</em>`).join("")}</div><div class="tc"></div></div></div>
      ${camLegend ? `<div class="lg"><span><b style="background:${ACT}"></b>Mouvement</span>${camLegend}</div>` : ""}`;
  }
  _render() {
    return keepScroll(this, () => this._renderNow());
  }
  _renderNow() {
    if (!this.shadowRoot || !this._c || !this._hass) return;
    const c = this._c;
    const G = c.groups.map((g, i) => ({ ...g, _i: i, E: (g.entities || []).map((e) => this._ent(e, g)) }));
    this._G = G;
    const all = G.flatMap((g) => g.E.map((e) => ({ ...e, g: g.name, cam: g.layout === "camera" })));
    const active = all.filter((e) => e.on);
    const last = all.filter((e) => e.t && !e.unavailable).sort((a, b) => b.t - a.t)[0];
    const n1h = all.filter((e) => Date.now() - e.t < 3600000).length;
    const status = active.length
      ? `<div class="stt al"><ha-icon icon="mdi:motion-sensor"></ha-icon><div><b>Détection en cours</b><span>${active.map((e) => (e.cam ? `${e.g} (${e.name.toLowerCase()})` : e.name)).join(" · ")}</span></div></div>`
      : `<div class="stt ok"><ha-icon icon="mdi:shield-check"></ha-icon><div><b>Tout est calme</b><span>${last ? `Dernière activité : ${last.cam ? `${last.g} (${last.name.toLowerCase()})` : last.name}, il y a ${rel(last.t)} (${hm(last.t)})` : ""}</span></div></div>`;
    this.shadowRoot.innerHTML = `
    <style>
      :host { display:block; }
      ha-card { display:block; padding:14px 16px 12px; box-sizing:border-box; height:100%; container-type:inline-size; }
      ha-card.noframe { background:none !important; box-shadow:none !important; border:none !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }
      ha-card.noframe::before, ha-card.noframe::after { content:none !important; display:none !important; }
      .hd { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
      .tt0 { font-size:16px; font-weight:600; color:var(--primary-text-color); }
      .seg { display:flex; background:color-mix(in srgb, var(--primary-text-color) 6%, transparent); border-radius:10px; padding:2px; }
      .seg button { border:none; background:none; color:var(--secondary-text-color); font:inherit; font-size:12px; padding:4px 10px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:4px; }
      .seg button ha-icon { --mdc-icon-size:15px; }
      .seg button.on { background:color-mix(in srgb, var(--primary-color, #0abfbf) 25%, transparent); color:var(--primary-text-color); font-weight:600; }
      .stt { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:14px; margin-bottom:12px; }
      .stt ha-icon { --mdc-icon-size:26px; flex:none; }
      .stt b { display:block; font-size:15px; color:var(--primary-text-color); }
      .stt span { font-size:12px; color:var(--secondary-text-color); }
      .stt.ok { background:color-mix(in srgb, #1fce8a 10%, transparent); } .stt.ok ha-icon { color:#1fce8a; }
      .stt.al { background:color-mix(in srgb, ${ACT} 16%, transparent); box-shadow:0 0 0 1px color-mix(in srgb, ${ACT} 50%, transparent); animation:halo 2s ease-in-out infinite alternate; }
      .stt.al ha-icon { color:${ACT}; }
      @keyframes halo { from { box-shadow:0 0 0 1px color-mix(in srgb, ${ACT} 40%, transparent); } to { box-shadow:0 0 16px 1px color-mix(in srgb, ${ACT} 55%, transparent); } }
      .kp { font-size:12px; color:var(--secondary-text-color); margin:-6px 0 10px 2px; } .kp b { color:var(--primary-text-color); }
      .grp { margin-bottom:12px; }
      .gh { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.6px; margin:0 0 6px 2px; }
      .gh ha-icon { --mdc-icon-size:15px; } .gh span { margin-left:auto; color:${ACT}; text-transform:none; letter-spacing:0; }
      .tiles { display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:6px; }
      button { font:inherit; color:inherit; }
      .tile { all:unset; box-sizing:border-box; cursor:pointer; border-radius:12px; padding:8px 8px 7px; display:flex; flex-direction:column; align-items:flex-start; gap:2px; min-width:0;
              background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); border:1px solid transparent; transition:background .3s, border-color .3s; }
      .tile:hover { background:color-mix(in srgb, var(--primary-text-color) 9%, transparent); }
      .tile:focus-visible, .dot:focus-visible { outline:2px solid var(--primary-color, #0abfbf); }
      .tile ha-icon { --mdc-icon-size:20px; color:var(--secondary-text-color); margin-bottom:2px; }
      .tn { font-size:12.5px; font-weight:600; color:var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
      .tt { font-size:11px; color:var(--secondary-text-color); font-variant-numeric:tabular-nums; }
      .tile.rc { border-color:color-mix(in srgb, ${RECENT} 45%, transparent); } .tile.rc ha-icon { color:${RECENT}; }
      .tile.on { background:color-mix(in srgb, ${ACT} 18%, transparent); border-color:${ACT}; animation:halo 2s ease-in-out infinite alternate; }
      .tile.on ha-icon, .tile.on .tt { color:${ACT}; } .tile.on .tt { font-weight:700; }
      .tile.na, .dot.na { opacity:.4; }
      .cams { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:6px; }
      .cam { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border-radius:12px; background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); border:1px solid transparent; }
      .cam.on { border-color:${ACT}; background:color-mix(in srgb, ${ACT} 12%, transparent); }
      .cn { display:flex; align-items:center; gap:8px; min-width:0; cursor:pointer; } .cn > ha-icon { --mdc-icon-size:20px; color:var(--secondary-text-color); flex:none; }
      .cn .nm { font-size:13px; font-weight:600; color:var(--primary-text-color); } .cn .sub { font-size:11px; color:var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .cn .sub b { color:${ACT}; }
      .ci { display:flex; gap:4px; flex:none; }
      .dot { all:unset; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:1px; width:42px; padding:4px 0; border-radius:10px; background:color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
      .dot ha-icon { --mdc-icon-size:17px; color:var(--secondary-text-color); } .dot span { font-size:9.5px; color:var(--secondary-text-color); white-space:nowrap; }
      .dot.rc ha-icon { color:${RECENT}; }
      .dot.on { background:color-mix(in srgb, ${ACT} 25%, transparent); } .dot.on ha-icon, .dot.on span { color:${ACT}; font-weight:700; }
      .tlw { display:flex; flex-direction:column; gap:3px; }
      .tg { font-size:11px; font-weight:700; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.6px; margin:8px 0 2px 2px; }
      .tr { display:grid; grid-template-columns:118px 1fr 22px; gap:8px; align-items:center; cursor:pointer; }
      .tl { font-size:12px; color:var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:5px; }
      .tl ha-icon { --mdc-icon-size:14px; color:var(--secondary-text-color); flex:none; }
      .tb { position:relative; height:14px; border-radius:4px; background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); overflow:hidden; }
      .tb.tbc { height:18px; }
      .tb i { position:absolute; top:0; bottom:0; border-radius:2px; opacity:.9; }
      .tb u { position:absolute; top:0; bottom:0; width:1px; background:color-mix(in srgb, var(--primary-text-color) 8%, transparent); text-decoration:none; }
      .tc { font-size:11px; color:var(--secondary-text-color); text-align:right; font-variant-numeric:tabular-nums; }
      .tr.ax { cursor:default; } .tr.ax .tb { background:none; height:14px; overflow:visible; }
      .tr.ax em { position:absolute; transform:translateX(-50%); font-style:normal; font-size:10px; color:var(--secondary-text-color); }
      .lg { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:11px; color:var(--secondary-text-color); margin-top:8px; }
      .lg span { display:flex; align-items:center; gap:4px; } .lg b { width:9px; height:9px; border-radius:3px; display:inline-block; }
      .empty { color:var(--secondary-text-color); font-size:13px; padding:20px 0; text-align:center; }
      .err { color:var(--error-color); font-size:12px; }
      @container (max-width: 420px) { .tr { grid-template-columns:86px 1fr 18px; } .tiles { grid-template-columns:repeat(3, 1fr); } }
      @media (prefers-reduced-motion: reduce) { .tile.on, .stt.al { animation:none; } }
    </style>
    <ha-card class="${c.show_frame === false ? "noframe" : ""}">
      <div class="hd"><div class="tt0">${c.title || ""}</div>
        <div class="seg">${[["tiles", "mdi:view-grid-outline", "Tuiles"], ["timeline", "mdi:chart-timeline", `${c.hours} h`]].map(([k, ic, l]) => `<button data-v="${k}" class="${this._view === k ? "on" : ""}"><ha-icon icon="${ic}"></ha-icon>${l}</button>`).join("")}</div></div>
      ${status}
      <div class="kp"><b>${n1h}</b> capteur${n1h > 1 ? "s" : ""} actif${n1h > 1 ? "s" : ""} dans la dernière heure</div>
      ${this._view === "timeline" ? this._timeline(G) : this._tilesOrdered(G)}
    </ha-card>`;
    const sr = this.shadowRoot;
    sr.querySelectorAll("[data-e]").forEach((el) => el.addEventListener("click", (ev) => { ev.stopPropagation(); this._popup(el.dataset.e, null); }));
    sr.querySelectorAll("[data-g]").forEach((el) => el.addEventListener("click", () => this._popup(null, Number(el.dataset.g))));
    sr.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { this._view = b.dataset.v; this._render(); if (this._view === "timeline") this._load(); }));
  }
  _moreInfo(id) { const e = new Event("hass-more-info", { bubbles: true, composed: true }); e.detail = { entityId: id }; this.dispatchEvent(e); }
  _popup(entity, gi) {
    const G = this._G || [];
    let lanes, title, icon;
    if (gi != null && G[gi]) {
      const g = G[gi]; title = g.name; icon = g.icon || (g.layout === "camera" ? "mdi:cctv" : "mdi:home");
      lanes = g.E.map((e) => ({ entity: e.entity, name: g.layout === "camera" ? KIND(e)[0] : e.name, icon: e.icon, color: g.layout === "camera" ? KIND(e)[1] : ACT, label: e.on_label }));
    } else {
      for (const g of G) for (const e of g.E) if (e.entity === entity && !lanes) {
        const cam = g.layout === "camera";
        title = cam ? `${g.name} · ${KIND(e)[0]}` : e.name; icon = e.icon;
        lanes = [{ entity: e.entity, name: cam ? KIND(e)[0] : e.name, icon: e.icon, color: cam ? KIND(e)[1] : ACT, label: e.on_label }];
      }
    }
    if (!lanes) return;
    let dlg = document.querySelector("holm-security-timeline");
    if (!dlg) { dlg = document.createElement("holm-security-timeline"); document.body.appendChild(dlg); }
    dlg.open(this, this._hass, { title, icon, lanes });
  }
  static getConfigElement() { return document.createElement("holm-security-card-editor"); }
  static getStubConfig() { return { title: "Sécurité", groups: [{ name: "Intérieur", icon: "mdi:home", entities: [] }] }; }
  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }
}

// ---------------- Popup : chronologie d'une journée ----------------
const DAY = 86400000;
const dur = (ms) => { const s = Math.round(ms / 1000); if (s < 60) return `${s} s`; const m = Math.round(s / 60); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${String(r).padStart(2, "0")}` : `${h} h`; };
const dayLabel = (t, d) => d === 0 ? "Aujourd'hui" : d === 1 ? "Hier" : new Date(t).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase());
class HolmSecurityTimeline extends HTMLElement {
  open(card, hass, opts) {
    this._card = card; this._hass = hass; this._o = opts; this._d = 0; this._data = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    if (!this._esc) { this._esc = (e) => { if (e.key === "Escape") this.close(); if (e.key === "ArrowLeft") this._go(1); if (e.key === "ArrowRight") this._go(-1); }; }
    window.addEventListener("keydown", this._esc);
    this.style.display = "block"; this._render(); this._load();
  }
  close() { this.style.display = "none"; window.removeEventListener("keydown", this._esc); }
  _go(delta) { const d = Math.max(0, Math.min(30, this._d + delta)); if (d === this._d) return; this._d = d; this._data = null; this._render(); this._load(); }
  _range() { const s = new Date(); s.setHours(0, 0, 0, 0); const start = s.getTime() - this._d * DAY; return { start, end: start + DAY }; }
  async _load() {
    const { start, end } = this._range(), stop = Math.min(end, Date.now()), d = this._d;
    try {
      const r = await this._hass.callWS({ type: "history/history_during_period", start_time: new Date(start).toISOString(), end_time: new Date(stop).toISOString(),
        entity_ids: this._o.lanes.map((l) => l.entity), minimal_response: true, no_attributes: true, significant_changes_only: false });
      const seg = {};
      for (const l of this._o.lanes) {
        const out = []; let on = null;
        for (const x of (r || {})[l.entity] || []) {
          const t = Math.max((x.lu || x.lc) * 1000, start);
          if (x.s === "on" && on === null) on = t; else if (x.s !== "on" && on !== null) { out.push([on, t]); on = null; }
        }
        if (on !== null) out.push([on, stop, true]);
        seg[l.entity] = out;
      }
      if (d === this._d) { this._data = { start, end, stop, seg }; this._render(); }
    } catch (e) { if (d === this._d) { this._data = { err: e?.message || String(e) }; this._render(); } }
  }
  _render() {
    const o = this._o, D = this._data, { start, end } = this._range();
    const pct = (t) => (((t - start) / DAY) * 100).toFixed(3);
    let body;
    if (!D) body = `<div class="msg">Chargement…</div>`;
    else if (D.err) body = `<div class="msg err">Erreur : ${D.err}</div>`;
    else {
      const all = o.lanes.flatMap((l) => (D.seg[l.entity] || []).map((s) => ({ a: s[0], b: s[1], live: !!s[2], l })));
      const total = all.reduce((x, e) => x + (e.b - e.a), 0);
      const first = all.length ? Math.min(...all.map((e) => e.a)) : null, last = all.length ? Math.max(...all.map((e) => e.a)) : null;
      const hist = Array.from({ length: 24 }, () => new Map()); all.forEach((e) => { const m = hist[new Date(e.a).getHours()]; m.set(e.l, (m.get(e.l) || 0) + 1); });
      const hsum = hist.map((m) => [...m.values()].reduce((a, b) => a + b, 0)), hmax = Math.max(1, ...hsum);
      const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 24];
      const now = this._d === 0 ? `<div class="now" style="left:${pct(Date.now())}%"><span>${hm(Date.now())}</span></div>` : "";
      const future = this._d === 0 ? `<div class="fut" style="left:${pct(Date.now())}%"></div>` : "";
      const lanes = o.lanes.map((l) => `<div class="ln"><div class="lb"><ha-icon icon="${l.icon || "mdi:motion-sensor"}"></ha-icon><span>${l.name}</span></div>
        <div class="trk" data-l="${l.entity}">${ticks.slice(1, -1).map((h) => `<u style="left:${(h / 24) * 100}%"></u>`).join("")}${future}
          ${(D.seg[l.entity] || []).map(([a, b, live]) => `<i class="${live ? "live" : ""}" style="left:${pct(a)}%;width:max(3px,${(((b - a) / DAY) * 100).toFixed(3)}%);--c:${l.color}"></i>`).join("")}${now}</div></div>`).join("");
      const axis = `<div class="ln ax"><div class="lb"></div><div class="trk">${ticks.map((h) => `<em class="${h % 6 ? "o" : ""}" style="left:${(h / 24) * 100}%">${h}h</em>`).join("")}</div></div>`;
      const bars = `<div class="ln hs"><div class="lb"><span>Par heure</span></div><div class="bars">${hist.map((m, h) => { const n = hsum[h];
        return `<b title="${h}h – ${h + 1}h : ${n} détection${n > 1 ? "s" : ""}" style="height:${n ? Math.max(8, (n / hmax) * 100) : 0}%">${o.lanes.filter((l) => m.get(l)).map((l) => `<s style="flex:${m.get(l)};--c:${l.color}"></s>`).join("")}</b>`; }).join("")}</div></div>`;
      const multi = o.lanes.length > 1;
      const list = all.sort((x, y) => y.a - x.a).slice(0, 80).map((e) => `<div class="ev"><span class="t">${hm(e.a)}</span><span class="pill" style="--c:${e.l.color}"></span>
        <span class="n">${multi ? e.l.name : (e.l.label || "Détection")}${e.live ? ` <b>en cours</b>` : ""}</span><span class="d">${dur(e.b - e.a)}</span></div>`).join("");
      body = `<div class="kpi"><div><b>${all.length}</b><span>détection${all.length > 1 ? "s" : ""}</span></div><div><b>${all.length ? dur(total) : "—"}</b><span>actif au total</span></div>
          <div><b>${first ? hm(first) : "—"}</b><span>première</span></div><div><b>${last ? hm(last) : "—"}</b><span>dernière</span></div></div>
        <div class="chart">${lanes}${axis}${bars}<div class="tip"></div></div>
        <div class="lst">${list || `<div class="msg">Aucune activité ${this._d === 0 ? "aujourd'hui" : "ce jour-là"}.</div>`}</div>`;
    }
    this.shadowRoot.innerHTML = `<style>
      :host { position:fixed; inset:0; z-index:9999; display:block; font-family:var(--paper-font-body1_-_font-family, Roboto, sans-serif); }
      .bd { position:absolute; inset:0; background:rgba(4,10,16,.55); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); animation:fi .2s; }
      .dlg { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(780px, 94vw); max-height:90vh; overflow:auto; box-sizing:border-box; padding:18px 20px 16px;
        background:var(--ha-card-background, var(--card-background-color, #1c2430)); color:var(--primary-text-color, #e8eef3); border-radius:22px;
        box-shadow:0 20px 60px rgba(0,0,0,.5), 0 0 0 1px color-mix(in srgb, var(--primary-text-color, #fff) 8%, transparent); animation:pop .22s cubic-bezier(.2,.9,.3,1.2); }
      @keyframes fi { from { opacity:0 } } @keyframes pop { from { opacity:0; transform:translate(-50%,-46%) scale(.97) } }
      .hd { display:flex; align-items:center; gap:12px; }
      .ic { width:42px; height:42px; border-radius:14px; display:grid; place-items:center; background:color-mix(in srgb, ${ACT} 16%, transparent); color:${ACT}; flex:none; }
      .ic ha-icon { --mdc-icon-size:24px; }
      .ti { flex:1; min-width:0; } .ti b { display:block; font-size:18px; } .ti span { font-size:12.5px; color:var(--secondary-text-color, #9aa7b2); }
      button { font:inherit; color:inherit; cursor:pointer; border:none; background:color-mix(in srgb, var(--primary-text-color, #fff) 7%, transparent); border-radius:12px; height:36px; min-width:36px; display:inline-grid; place-items:center; padding:0 10px; }
      button:hover { background:color-mix(in srgb, var(--primary-text-color, #fff) 13%, transparent); } button:disabled { opacity:.3; cursor:default; }
      button ha-icon { --mdc-icon-size:20px; }
      .nav { display:flex; align-items:center; justify-content:center; gap:10px; margin:14px 0 12px; }
      .nav .day { min-width:210px; text-align:center; font-weight:600; font-size:14px; }
      .kpi { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:14px; }
      .kpi div { background:color-mix(in srgb, var(--primary-text-color, #fff) 5%, transparent); border-radius:14px; padding:10px 12px; }
      .kpi b { display:block; font-size:19px; font-variant-numeric:tabular-nums; } .kpi span { font-size:11.5px; color:var(--secondary-text-color, #9aa7b2); }
      .chart { position:relative; display:flex; flex-direction:column; gap:6px; }
      .ln { display:grid; grid-template-columns:112px 1fr; gap:10px; align-items:center; }
      .lb { display:flex; align-items:center; gap:6px; font-size:12.5px; min-width:0; } .lb span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .lb ha-icon { --mdc-icon-size:16px; color:var(--secondary-text-color, #9aa7b2); flex:none; }
      .trk { position:relative; height:34px; border-radius:10px; background:color-mix(in srgb, var(--primary-text-color, #fff) 5%, transparent); cursor:crosshair; }
      .trk u { position:absolute; top:0; bottom:0; width:1px; background:color-mix(in srgb, var(--primary-text-color, #fff) 7%, transparent); }
      .trk i { position:absolute; top:5px; bottom:5px; border-radius:6px; background:linear-gradient(180deg, color-mix(in srgb, var(--c) 85%, #fff), var(--c));
        box-shadow:0 0 10px color-mix(in srgb, var(--c) 55%, transparent); animation:grow .5s ease-out both; transform-origin:left; }
      .trk i.live { animation:grow .5s ease-out both, pulse 1.6s ease-in-out .5s infinite alternate; }
      @keyframes grow { from { transform:scaleX(0); opacity:0 } } @keyframes pulse { to { box-shadow:0 0 18px var(--c); } }
      .fut { position:absolute; top:0; bottom:0; right:0; border-radius:0 10px 10px 0; background:repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--primary-text-color, #fff) 4%, transparent) 6px 12px); }
      .now { position:absolute; top:-3px; bottom:-3px; width:2px; margin-left:-1px; background:${RECENT}; border-radius:2px; box-shadow:0 0 8px ${RECENT}; }
      .now span { display:none; }
      .ax .trk { background:none; height:16px; cursor:default; } .ax em { position:absolute; transform:translateX(-50%); font-style:normal; font-size:10.5px; color:var(--secondary-text-color, #9aa7b2); }
      .ax em:first-child { transform:none; } .ax em:last-child { transform:translateX(-100%); }
      .hs .lb span { font-size:11px; color:var(--secondary-text-color, #9aa7b2); text-transform:uppercase; letter-spacing:.5px; }
      .bars { height:46px; display:grid; grid-template-columns:repeat(24, 1fr); gap:3px; align-items:end; }
      .bars b { display:flex; flex-direction:column-reverse; gap:1px; border-radius:4px 4px 2px 2px; overflow:hidden; animation:rise .5s ease-out both; }
      .bars s { display:block; text-decoration:none; background:linear-gradient(180deg, var(--c), color-mix(in srgb, var(--c) 50%, transparent)); }
      @keyframes rise { from { transform:scaleY(0); transform-origin:bottom } }
      .tip { position:absolute; pointer-events:none; opacity:0; transform:translate(-50%, -100%); background:rgba(10,16,24,.92); color:#fff; font-size:12px; padding:5px 9px; border-radius:8px; white-space:nowrap; transition:opacity .1s; }
      .lst { margin-top:14px; max-height:230px; overflow:auto; display:flex; flex-direction:column; gap:2px; }
      .ev { display:grid; grid-template-columns:48px 10px 1fr auto; gap:10px; align-items:center; padding:6px 8px; border-radius:10px; font-size:13px; }
      .ev:nth-child(odd) { background:color-mix(in srgb, var(--primary-text-color, #fff) 3%, transparent); }
      .ev .t { font-variant-numeric:tabular-nums; font-weight:600; } .ev .d { color:var(--secondary-text-color, #9aa7b2); font-variant-numeric:tabular-nums; }
      .ev .n b { color:${ACT}; font-weight:600; }
      .pill { width:10px; height:10px; border-radius:4px; background:var(--c); box-shadow:0 0 6px var(--c); }
      .msg { color:var(--secondary-text-color, #9aa7b2); text-align:center; padding:26px 0; font-size:13px; } .err { color:var(--error-color, #e05a5a); }
      .ft { display:flex; justify-content:flex-end; margin-top:12px; } .ft button { gap:6px; display:inline-flex; align-items:center; font-size:13px; }
      @media (max-width: 560px) { .kpi { grid-template-columns:repeat(2, 1fr); } .ln { grid-template-columns:78px 1fr; } .ax em.o { display:none; } .dlg { padding:14px; } .nav .day { min-width:0; } }
      @media (prefers-reduced-motion: reduce) { .trk i, .bars b, .dlg, .bd { animation:none !important; } }
    </style>
    <div class="bd"></div>
    <div class="dlg" role="dialog" aria-label="${o.title}">
      <div class="hd"><div class="ic"><ha-icon icon="${o.icon || "mdi:motion-sensor"}"></ha-icon></div>
        <div class="ti"><b>${o.title}</b><span>Chronologie de la journée</span></div><button class="x" aria-label="Fermer"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="nav"><button class="prev" aria-label="Jour précédent" ${this._d >= 30 ? "disabled" : ""}><ha-icon icon="mdi:chevron-left"></ha-icon></button>
        <div class="day">${dayLabel(start, this._d)}${this._d > 1 ? "" : ` · ${new Date(start).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`}</div>
        <button class="next" aria-label="Jour suivant" ${this._d === 0 ? "disabled" : ""}><ha-icon icon="mdi:chevron-right"></ha-icon></button></div>
      ${body}
      <div class="ft">${o.lanes.length === 1 ? `<button class="mi"><ha-icon icon="mdi:information-outline"></ha-icon>Détails du capteur</button>` : ""}</div>
    </div>`;
    const sr = this.shadowRoot;
    sr.querySelector(".bd").onclick = () => this.close();
    sr.querySelector(".x").onclick = () => this.close();
    sr.querySelector(".prev").onclick = () => this._go(1);
    sr.querySelector(".next").onclick = () => this._go(-1);
    const mi = sr.querySelector(".mi"); if (mi) mi.onclick = () => { const id = o.lanes[0].entity; this.close(); this._card?._moreInfo(id); };
    const tip = sr.querySelector(".tip"), chart = sr.querySelector(".chart");
    if (tip && D && !D.err) sr.querySelectorAll(".trk[data-l]").forEach((trk) => {
      trk.addEventListener("mousemove", (ev) => {
        const r = trk.getBoundingClientRect(), c = chart.getBoundingClientRect(), x = Math.min(Math.max(ev.clientX - r.left, 0), r.width);
        const t = start + (x / r.width) * DAY, tol = (6 / r.width) * DAY;
        const hit = (D.seg[trk.dataset.l] || []).find(([a, b]) => t >= a - tol && t <= b + tol);
        tip.textContent = hit ? `${hm(hit[0])} → ${hit[2] ? "en cours" : hm(hit[1])} · ${dur(hit[1] - hit[0])}` : t > Date.now() ? hm(t) : `${hm(t)} · calme`;
        tip.style.left = `${ev.clientX - c.left}px`; tip.style.top = `${r.top - c.top - 6}px`; tip.style.opacity = 1;
      });
      trk.addEventListener("mouseleave", () => (tip.style.opacity = 0));
    });
  }
}
if (!customElements.get("holm-security-timeline")) customElements.define("holm-security-timeline", HolmSecurityTimeline);

// ---------------- Éditeur visuel ----------------
const L = { title: "Titre", hours: "Durée de la chronologie (heures)", view: "Vue par défaut", show_frame: "Afficher le cadre de la carte",
  name: "Nom du groupe", icon: "Icône", layout: "Présentation", entities: "Capteurs (binary_sensor)" };
const GEN = [ { name: "title", selector: { text: {} } }, { type: "grid", name: "", schema: [
  { name: "view", selector: { select: { mode: "dropdown", options: [{ value: "tiles", label: "Tuiles" }, { value: "timeline", label: "Chronologie" }] } } },
  { name: "hours", selector: { number: { min: 6, max: 168, mode: "box" } } }, { name: "show_frame", selector: { boolean: {} } } ] } ];
const GRP = [ { type: "grid", name: "", schema: [ { name: "name", selector: { text: {} } }, { name: "icon", selector: { icon: {} } },
  { name: "layout", selector: { select: { mode: "dropdown", options: [{ value: "tiles", label: "Tuiles" }, { value: "camera", label: "Caméra (ligne compacte)" }] } } } ] },
  { name: "entities", selector: { entity: { multiple: true, domain: ["binary_sensor"] } } } ];
class HolmSecurityCardEditor extends HTMLElement {
  setConfig(c) { const j = JSON.stringify(c); this._config = JSON.parse(j); if (j === this._last && this._built) return; this._build(); }
  set hass(h) { this._hass = h; if (!this._built) this._build(); else this.querySelectorAll("ha-form").forEach((f) => (f.hass = h)); }
  _emit() { this._last = JSON.stringify(this._config); this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: JSON.parse(this._last) }, bubbles: true, composed: true })); }
  _form(schema, data, cb) { const f = document.createElement("ha-form"); f.hass = this._hass; f.schema = schema; f.data = data; f.computeLabel = (s) => L[s.name] || s.name;
    f.addEventListener("value-changed", (ev) => { ev.stopPropagation(); cb(ev.detail.value); }); return f; }
  _build() {
    if (!this._hass || !this._config) return;
    this._built = true; const c = this._config; c.groups = c.groups || [];
    this.innerHTML = `<style>.it{border:1px solid var(--divider-color);border-radius:12px;padding:8px 12px 4px;margin:10px 0}.ih{display:flex;justify-content:space-between;font-weight:600;margin-bottom:4px}
      .ih span{display:flex;gap:4px} button{cursor:pointer;background:none;border:1px solid var(--divider-color);color:var(--primary-text-color);border-radius:8px;padding:4px 8px}.add{width:100%;padding:8px}
      .hint{font-size:12px;color:var(--secondary-text-color);margin:4px 0}</style><div class="gen"></div><div class="items"></div><button class="add">+ Ajouter un groupe</button>`;
    this.querySelector(".gen").appendChild(this._form(GEN, { hours: 24, view: "tiles", show_frame: true, ...c }, (v) => {
      Object.assign(this._config, v); if (v.hours === 24) delete this._config.hours; if (v.view === "tiles") delete this._config.view; if (v.show_frame !== false) delete this._config.show_frame; this._emit(); }));
    const box = this.querySelector(".items");
    c.groups.forEach((g, i) => {
      const w = document.createElement("div"); w.className = "it";
      w.innerHTML = `<div class="ih">${g.name || "Groupe " + (i + 1)}<span><button data-a="up">▲</button><button data-a="down">▼</button><button data-a="del">✕</button></span></div>
        <div class="hint">Les noms et icônes de chaque capteur se règlent en YAML (name / icon), sinon le nom du capteur est utilisé.</div>`;
      const ents = (g.entities || []).map((e) => (typeof e === "string" ? e : e.entity));
      w.appendChild(this._form(GRP, { layout: "tiles", ...g, entities: ents }, (v) => {
        const prev = Object.fromEntries((g.entities || []).map((e) => (typeof e === "string" ? [e, { entity: e }] : [e.entity, e])));
        const o = { ...g, name: v.name, icon: v.icon, entities: (v.entities || []).map((id) => prev[id] || { entity: id }) };
        if (v.layout === "camera") o.layout = "camera"; else delete o.layout;
        if (!o.icon) delete o.icon;
        this._config.groups[i] = o; this._emit(); }));
      w.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { const a = b.dataset.a, arr = this._config.groups;
        if (a === "del") arr.splice(i, 1); if (a === "up" && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; if (a === "down" && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
        this._emit(); this._build(); }));
      box.appendChild(w);
    });
    this.querySelector(".add").addEventListener("click", () => { this._config.groups.push({ name: "", entities: [] }); this._emit(); this._build(); });
  }
}
if (!customElements.get("holm-security-card-editor")) customElements.define("holm-security-card-editor", HolmSecurityCardEditor);
if (!customElements.get("holm-security-card")) customElements.define("holm-security-card", HolmSecurityCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "holm-security-card", name: "HOLM – Sécurité", description: "Mouvements, ouvertures et détections caméra : tuiles en direct et chronologie 24 h", preview: false });
})();

console.info("%c HOLM-SECURITY %c 1.1.1 ", "background:#e2702a;color:#111;border-radius:3px 0 0 3px", "background:#123;color:#fff;border-radius:0 3px 3px 0");
