/* holm-security-card — https://github.com/kaaribou/holm-security-card — licence MIT — v1.0.0 */
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
        return `<div class="cam ${anyOn ? "on" : ""}"><div class="cn"><ha-icon icon="${g.icon || "mdi:cctv"}"></ha-icon><div><div class="nm">${g.name}</div>
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
    let camHead = false;
    const rows = G.map((g) => {
      if (g.layout === "camera") {
        const head = camHead ? "" : `<div class="tg">Caméras</div>`; camHead = true;
        const n = g.E.reduce((a, e) => a + (H.seg[e.entity] || []).length, 0);
        return `${head}<div class="tr"><div class="tl"><ha-icon icon="${g.icon || "mdi:cctv"}"></ha-icon>${g.name}</div>
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
    if (!this.shadowRoot || !this._c || !this._hass) return;
    const c = this._c;
    const G = c.groups.map((g) => ({ ...g, E: (g.entities || []).map((e) => this._ent(e, g)) }));
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
      .cn { display:flex; align-items:center; gap:8px; min-width:0; } .cn > ha-icon { --mdc-icon-size:20px; color:var(--secondary-text-color); flex:none; }
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
      ${this._view === "timeline" ? this._timeline(G)
        : this._tiles(G.filter((g) => g.layout !== "camera")) + (G.some((g) => g.layout === "camera") ? `<div class="gh"><ha-icon icon="mdi:cctv"></ha-icon>Caméras</div><div class="cams">${this._tiles(G.filter((g) => g.layout === "camera"))}</div>` : "")}
    </ha-card>`;
    const sr = this.shadowRoot;
    sr.querySelectorAll("[data-e]").forEach((el) => el.addEventListener("click", () => {
      const e = new Event("hass-more-info", { bubbles: true, composed: true }); e.detail = { entityId: el.dataset.e }; this.dispatchEvent(e);
    }));
    sr.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { this._view = b.dataset.v; this._render(); if (this._view === "timeline") this._load(); }));
  }
  static getConfigElement() { return document.createElement("holm-security-card-editor"); }
  static getStubConfig() { return { title: "Sécurité", groups: [{ name: "Intérieur", icon: "mdi:home", entities: [] }] }; }
  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }
}

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

console.info("%c HOLM-SECURITY %c 1.0.0 ", "background:#e2702a;color:#111;border-radius:3px 0 0 3px", "background:#123;color:#fff;border-radius:0 3px 3px 0");
