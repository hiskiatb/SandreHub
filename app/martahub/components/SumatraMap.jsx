"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { parseGeoFile, sanitizeSumatra, esc, idbAll, idbPut, idbDelete, idbClear } from "../../../lib/geoImport";
import { uploadTerritory, uploadSites, listTerritory, fetchTerritoryGeojson, signedUrl, removeTerritory } from "../../../lib/territoryStore";
import { parseSiteFile, idbAllSites, idbPutSite, idbClearSites } from "../../../lib/siteImport";
import "leaflet/dist/leaflet.css";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const C = { success: "#2E7D32", warning: "#F57F17", error: "#C62828", errorL: "#FFEBEE" };

// ── Data pin aktivitas (contoh) ───────────────────────────────────────────────
const MAP_PINS = [
  { name: "Medan", lat: 3.5952, lng: 98.6722, count: 8, level: "high" },
  { name: "Binjai", lat: 3.6001, lng: 98.4854, count: 3, level: "medium" },
  { name: "Deli Serdang", lat: 3.4200, lng: 98.6700, count: 5, level: "high" },
  { name: "Langkat", lat: 3.9000, lng: 98.2900, count: 2, level: "low" },
  { name: "Serdang Bedagai", lat: 3.3600, lng: 99.0600, count: 6, level: "high" },
  { name: "Kabanjahe (Karo)", lat: 3.1000, lng: 98.4900, count: 4, level: "medium" },
  { name: "Sidikalang (Dairi)", lat: 2.7430, lng: 98.3120, count: 1, level: "low" },
  { name: "Pematang Siantar", lat: 2.9600, lng: 99.0600, count: 7, level: "high" },
  { name: "Simalungun", lat: 2.9000, lng: 99.2000, count: 3, level: "medium" },
  { name: "Kisaran (Asahan)", lat: 2.9830, lng: 99.6200, count: 2, level: "high" },
];
const LEVEL_COLOR = { high: C.success, medium: C.warning, low: C.error };
const SUMATRA_BOUNDS = [[-6.6, 94.4], [6.7, 107.1]]; // seluruh Pulau Sumatera

// ── Choropleth helpers ────────────────────────────────────────────────────────
const CHORO = ["#7C9CF2", "#63D3A6", "#F6C650", "#EE8C6B", "#9C7BE0", "#67C6E3", "#E38FC0", "#59B89B", "#EAA15C", "#8FB4D6"];
const CAT_KEYS = ["WADMKK", "KABKOT", "KAB_KOTA", "KABUPATEN", "NAME_2", "REGION", "Region", "region", "AREA", "Area", "BRANCH", "Branch", "branch", "WADMPR", "PROVINSI", "Provinsi", "NAME_1"];
const NAME_KEYS = ["WADMKC", "KECAMATAN", "NAMOBJ", "WADMKK", "KABKOT", "KABUPATEN", "NAME_2", "NAME_3", "NAME", "name", "MC_CLUSTER", "mc_cluster", "BRANCH", "DESA"];
function detectCatKey(features) {
  const p = (features.find((f) => f && f.properties) || {}).properties || {};
  const keys = Object.keys(p);
  for (const k of CAT_KEYS) if (keys.includes(k)) return k;
  return keys[0] || null;
}
function hashIdx(str, n) { let h = 0; const s = String(str); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % n; }
function choroColor(f, key) { return CHORO[hashIdx(key ? (f.properties?.[key] ?? "") : "x", CHORO.length)]; }
function featTitle(props) { for (const k of NAME_KEYS) if (props[k]) return String(props[k]); const v = Object.values(props).find((x) => typeof x === "string" && x.trim()); return v || "Wilayah"; }
function tooltipHtml(props) {
  const title = featTitle(props);
  const rows = Object.entries(props).filter(([, v]) => v !== "" && v != null).slice(0, 7)
    .map(([k, v]) => `<div style="display:flex;gap:14px;justify-content:space-between"><span style="opacity:.55">${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  return `<div style="font:11.5px ${FONT};min-width:160px;max-width:280px"><div style="font-weight:800;font-size:12.5px;margin-bottom:5px">${esc(title)}</div>${rows || '<span style="opacity:.6">(tanpa atribut)</span>'}</div>`;
}

// Tunggu sampai kontainer benar-benar punya ukuran (hindari peta ter-render 0×0
// saat layout dashboard belum settle).
function waitForSize(el, tries = 90) {
  return new Promise((res) => {
    const check = () => {
      if (!el || !el.isConnected) return res(false);
      if (el.clientWidth > 0 && el.clientHeight > 0) return res(true);
      if (tries-- <= 0) return res(true);
      requestAnimationFrame(check);
    };
    check();
  });
}

async function buildBaseMap(el, { dark, expanded, interactive = expanded }) {
  const L = (await import("leaflet")).default;
  if (!el || el._leaflet_id != null) return null; // hindari "already initialized"
  await waitForSize(el);
  if (el._leaflet_id != null) return null; // cek ulang setelah tunggu (StrictMode)
  const map = L.map(el, {
    preferCanvas: true, attributionControl: false,
    zoomControl: expanded, scrollWheelZoom: expanded, dragging: interactive,
    doubleClickZoom: interactive, boxZoom: interactive, keyboard: interactive, touchZoom: interactive,
    minZoom: 5, maxZoom: 14, maxBoundsViscosity: 1.0,
  });
  map.setMaxBounds(SUMATRA_BOUNDS);   // bisa jelajah seluruh Sumatera
  if (expanded) { map.fitBounds(SUMATRA_BOUNDS, { animate: false }); L.control.zoom({ position: "topright" }).addTo(map); }
  else map.setView([3.0, 98.9], 7);   // idle awal: Sumatera Utara (lokasi aktivitas)
  const tiles = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  L.tileLayer(tiles, { subdomains: "abcd", maxZoom: 18 }).addTo(map);
  MAP_PINS.forEach((p) => {
    const c = LEVEL_COLOR[p.level]; const sz = expanded ? 30 : 26;
    const icon = L.divIcon({ className: "", html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${c}26;border:2px solid ${c};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px ${c}66;font:800 ${expanded ? 12 : 11}px ${FONT};color:${c}">${p.count}</div>`, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
    const m = L.marker([p.lat, p.lng], { icon, pane: "markerPane" }).addTo(map).bindTooltip(`${p.name} · ${p.count} aktivitas`, { direction: "top", offset: [0, -sz / 2] });
    if (expanded) m.openTooltip();
  });
  const inval = () => { try { if (map._container && map._container.isConnected) map.invalidateSize({ animate: false }); } catch { /* removed */ } };
  [60, 200, 400, 700, 1100, 1700].forEach((ms) => setTimeout(inval, ms));
  requestAnimationFrame(() => requestAnimationFrame(inval));
  // Recalibrate saat ukuran kontainer berubah…
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => inval());
    try { ro.observe(el); } catch { /* noop */ }
    map.on("unload", () => { try { ro.disconnect(); } catch { /* noop */ } });
  }
  // …dan saat kartu peta masuk ke viewport (kasus di dashboard yang kompleks).
  if (typeof IntersectionObserver !== "undefined") {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) inval(); }, { threshold: 0.01 });
    try { io.observe(el); } catch { /* noop */ }
    map.on("unload", () => { try { io.disconnect(); } catch { /* noop */ } });
  }
  return map;
}

// Kumpulkan cincin luar poligon (untuk mask "lubang Sumatera")
function outerRings(geom) {
  const out = [];
  if (!geom) return out;
  if (geom.type === "Polygon") out.push(geom.coordinates[0]);
  else if (geom.type === "MultiPolygon") geom.coordinates.forEach((poly) => out.push(poly[0]));
  return out;
}
async function paintOverlays(map, fgRef, layers, { expanded, appBg }) {
  if (!map || !map._container) return;
  const L = (await import("leaflet")).default;
  if (fgRef.current) { try { map.removeLayer(fgRef.current); } catch { /* noop */ } fgRef.current = null; }
  const visible = (layers || []).filter((l) => l.visible !== false && l.geojson?.features?.length);
  if (!visible.length) return;
  const fg = L.featureGroup();
  const HOVER = { weight: 2, color: "#111", fillOpacity: 0.72 };

  // Mask: tutup semua di luar wilayah (sembunyikan pulau lain) dengan warna latar.
  if (appBg) {
    const world = [[-190, 85], [190, 85], [190, -85], [-190, -85], [-190, 85]];
    const holes = [];
    visible.forEach((l) => l.geojson.features.forEach((f) => outerRings(f.geometry).forEach((r) => { if (r && r.length > 3) holes.push(r); })));
    if (holes.length) {
      const maskFeature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...holes] } };
      L.geoJSON(maskFeature, { renderer: L.canvas({ padding: 0.5 }), interactive: false, style: { stroke: false, fill: true, fillColor: appBg, fillOpacity: 1, fillRule: "evenodd" } }).addTo(fg);
    }
  }

  const choros = [];
  visible.forEach((l) => {
    const key = detectCatKey(l.geojson.features);
    const gj = L.geoJSON(l.geojson, {
      renderer: L.canvas({ padding: 0.3 }),
      style: (f) => ({ color: "#ffffff", weight: expanded ? 0.5 : 0.3, opacity: 0.55, fillColor: choroColor(f, key), fillOpacity: expanded ? 0.55 : 0.42 }),
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 3, color: "#fff", weight: 0.8, fillColor: choroColor(f, key), fillOpacity: 0.85 }),
      onEachFeature: (f, layer) => {
        layer.bindTooltip(tooltipHtml(f.properties || {}), { sticky: true, direction: "top", opacity: 0.97 });
        if (expanded) {
          layer.on("mouseover", () => { try { layer.setStyle(HOVER); layer.bringToFront?.(); } catch { /* canvas */ } });
          layer.on("mouseout", () => { try { gj.resetStyle(layer); } catch { /* noop */ } });
        }
      },
    });
    fg.addLayer(gj);
    choros.push(gj);
  });
  fg.addTo(map);
  fgRef.current = fg;
  // Fit HANYA ke wilayah (bukan mask dunia) agar tidak bentrok dengan maxBounds.
  if (expanded) {
    try {
      let b = null;
      choros.forEach((g) => { try { const gb = g.getBounds(); if (gb && gb.isValid()) b = b ? b.extend(gb) : gb; } catch { /* noop */ } });
      if (b && b.isValid()) map.fitBounds(b, { padding: [26, 26], animate: false });
    } catch { /* noop */ }
  }
}

// ── Site (titik) ──────────────────────────────────────────────────────────────
const SITE_COLOR = "#EC008C";
// Ukuran titik menyesuaikan zoom: kecil & tanpa garis saat jauh (agar tidak
// menumpuk jadi gumpalan), sedikit membesar + garis tipis saat mendekat.
// Titik site = lapisan REFERENSI latar (bukan fokus utama; fokus nanti = event
// aktivitas). Jadi sangat kecil & samar saat jauh, baru sedikit menonjol saat dekat.
function siteStyleForZoom(z) {
  if (z <= 6)  return { radius: 0.7, weight: 0,   fillOpacity: 0.5 };
  if (z <= 7)  return { radius: 0.9, weight: 0,   fillOpacity: 0.55 };
  if (z <= 8)  return { radius: 1.2, weight: 0,   fillOpacity: 0.6 };
  if (z <= 9)  return { radius: 1.6, weight: 0,   fillOpacity: 0.68 };
  if (z <= 11) return { radius: 2.3, weight: 0.4, fillOpacity: 0.8 };
  return { radius: 3.2, weight: 0.5, fillOpacity: 0.9 };
}
const rp = (v) => (v == null || v === "" || isNaN(+v)) ? null : "Rp " + Number(v).toLocaleString("id-ID");
function siteRingkasHtml(s) {
  const p = s.props || {};
  const rows = [
    ["Branch", p["BRANCH"]], ["MC", p["MC"]], ["Tipe", p["Site Type"]],
    ["Category", p["CATEGORY (June'26)"] || p["CATEGORY"]], ["Traffic", p["Traffic Category"]],
    ["Target Rev", rp(p["TARGET SITE REVENUE IOH"])],
  ].filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<div style="display:flex;gap:12px;justify-content:space-between"><span style="opacity:.55">${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  return `<div style="font:11.5px ${FONT};min-width:200px;max-width:280px">
    <div style="font-weight:800;font-size:12.5px">${esc(s.name || s.id || "Site")}</div>
    ${s.id ? `<div style="opacity:.55;margin-bottom:6px">${esc(s.id)}</div>` : ""}
    ${rows}
    <button class="mh-site-more" style="margin-top:8px;width:100%;border:none;border-radius:7px;background:linear-gradient(135deg,#ED1C24,#C6168D);color:#fff;font:700 11px ${FONT};padding:6px;cursor:pointer">Lihat semua atribut</button>
  </div>`;
}
function siteFullHtml(s) {
  const p = s.props || {};
  const rows = Object.entries(p).filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<div style="display:flex;gap:12px;justify-content:space-between;padding:2px 0;border-top:1px solid rgba(0,0,0,.06)"><span style="opacity:.55">${esc(k)}</span><b style="text-align:right">${esc(v)}</b></div>`).join("");
  return `<div style="font:11px ${FONT};min-width:220px;max-width:300px">
    <div style="font-weight:800;font-size:12.5px;margin-bottom:6px">${esc(s.name || s.id || "Site")}</div>
    <div style="max-height:260px;overflow:auto">${rows}</div>
  </div>`;
}

// ── Filter facet site (dibangun dari data yang di-load) ───────────────────────
const SITE_FACET_DEFS = [
  { id: "region", label: "Region", cands: ["Region New", "REGION", "Region"] },
  { id: "area", label: "Area", cands: ["Area", "AREA"] },
  { id: "branch", label: "Branch", cands: ["BRANCH", "Branch"] },
  { id: "mc", label: "MC", cands: ["MC"] },
  { id: "type", label: "Tipe", cands: ["Site Type", "SITE TYPE", "Tipe"] },
  { id: "traffic", label: "Traffic", cands: ["Traffic Category", "TRAFFIC CATEGORY", "Traffic"], rx: /traffic.*categ/i },
  { id: "category", label: "Category", cands: ["CATEGORY (June'26)", "CATEGORY", "Category"], rx: /^category/i },
];
function resolveFacetKey(sample, def) {
  for (const c of def.cands) if (sample && c in sample) return c;
  if (def.rx && sample) { const k = Object.keys(sample).find((x) => def.rx.test(x)); if (k) return k; }
  return null;
}
// Bangun daftar facet + opsi (hanya facet yang punya ≥2 nilai berbeda).
function buildSiteFacets(siteArr) {
  if (!siteArr || !siteArr.length) return [];
  const sample = siteArr.find((s) => s.props)?.props || {};
  const out = [];
  for (const def of SITE_FACET_DEFS) {
    const key = resolveFacetKey(sample, def);
    if (!key) continue;
    const counts = new Map();
    for (const s of siteArr) {
      const v = s.props?.[key];
      if (v == null || v === "") continue;
      const sv = String(v).trim(); if (!sv) continue;
      counts.set(sv, (counts.get(sv) || 0) + 1);
    }
    if (counts.size < 2) continue;
    const options = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "id"));
    out.push({ id: def.id, label: def.label, key, options });
  }
  return out;
}
// Sebuah site lolos bila untuk SETIAP facet aktif, nilainya termasuk yang dipilih.
function siteMatchesFilters(s, facets, filters) {
  for (const f of facets) {
    const sel = filters[f.id];
    if (!sel || !sel.length) continue;
    const v = s.props?.[f.key];
    if (v == null || !sel.includes(String(v).trim())) return false;
  }
  return true;
}
// Convex hull (monotone chain) untuk outline area titik terfilter.
function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = []; for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

async function paintSites(map, ref, siteArr, { outline = false } = {}) {
  if (!map || !map._container) return;
  const L = (await import("leaflet")).default;
  if (ref.current) { try { map.removeLayer(ref.current); } catch { /* noop */ } ref.current = null; }
  if (!siteArr || !siteArr.length) return;
  if (!map.getPane("sitesPane")) { map.createPane("sitesPane"); map.getPane("sitesPane").style.zIndex = 640; }
  if (!map.getPane("siteOutlinePane")) { map.createPane("siteOutlinePane"); map.getPane("siteOutlinePane").style.zIndex = 635; }
  const renderer = L.canvas({ padding: 0.4, pane: "sitesPane" });
  const grp = L.layerGroup();
  // Outline area titik terfilter (dibuat dari convex hull) — hanya saat filter aktif.
  if (outline && siteArr.length >= 3) {
    const hull = convexHull(siteArr.map((s) => [s.lng, s.lat]));
    if (hull.length >= 3) {
      grp.addLayer(L.polygon(hull.map(([lng, lat]) => [lat, lng]), {
        pane: "siteOutlinePane", color: SITE_COLOR, weight: 1.5, dashArray: "5 5",
        fillColor: SITE_COLOR, fillOpacity: 0.05, interactive: false,
      }));
    }
  }
  const st0 = siteStyleForZoom(map.getZoom());
  const markers = [];
  siteArr.forEach((s) => {
    const m = L.circleMarker([s.lat, s.lng], {
      renderer, pane: "sitesPane", radius: st0.radius, color: "#fff",
      weight: st0.weight, fillColor: SITE_COLOR, fillOpacity: st0.fillOpacity,
    });
    m.bindTooltip(esc(s.name || s.id || "Site"), { direction: "top" });
    m.bindPopup(siteRingkasHtml(s), { maxWidth: 300, minWidth: 200 });
    m.on("popupopen", (e) => {
      const el = e.popup.getElement(); const btn = el && el.querySelector(".mh-site-more");
      if (btn) btn.onclick = () => { e.popup.setContent(siteFullHtml(s)); e.popup.update(); };
    });
    markers.push(m);
    grp.addLayer(m);
  });
  grp.addTo(map);
  ref.current = grp;

  // Perbarui ukuran titik saat zoom berubah (hindari gumpalan saat jauh,
  // tetap mudah diklik saat dekat). Ganti handler lama bila ada.
  if (map._mhSiteZoom) { map.off("zoomend", map._mhSiteZoom); map._mhSiteZoom = null; }
  const onZoom = () => {
    const st = siteStyleForZoom(map.getZoom());
    for (const m of markers) { m.setRadius(st.radius); m.setStyle({ weight: st.weight, fillOpacity: st.fillOpacity }); }
  };
  map._mhSiteZoom = onZoom;
  map.on("zoomend", onZoom);
}

function I({ name, size = 15, color = "currentColor" }) {
  const s = { width: size, height: size, flexShrink: 0 };
  const p = { fill: "none", stroke: color, strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
  const icons = {
    expand: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>,
    close: <svg style={s} viewBox="0 0 24 24" {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
    check: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M20 6 9 17l-5-5" /></svg>,
    upload: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
    trash: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>,
    layers: <svg style={s} viewBox="0 0 24 24" {...p}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
    download: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
    show: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
    shield: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
    plus: <svg style={s} viewBox="0 0 24 24" {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
    minus: <svg style={s} viewBox="0 0 24 24" {...p}><line x1="5" y1="12" x2="19" y2="12" /></svg>,
    fit: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></svg>,
  };
  return icons[name] || null;
}

function MapLegend({ t }) {
  return (
    <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 500, background: t.card, borderRadius: 10, padding: "9px 13px", display: "flex", flexDirection: "column", gap: 5, border: `1px solid ${t.line}`, boxShadow: "0 4px 16px rgba(0,0,0,0.14)" }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>Produktivitas</div>
      {[["Tinggi", C.success], ["Sedang", C.warning], ["Rendah", C.error]].map(([l, c]) => (
        <div key={l} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
          <span style={{ fontSize: 10.5, color: t.mid }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

// ── Hook: kelola layer batas wilayah ──────────────────────────────────────────
// Render dari cache lokal (IndexedDB) untuk cepat; SUMBER AMAN = Supabase Storage
// privat (khusus spm_sumatera, signed-URL, audit). Berkas asli tersimpan utuh.
export function useGeoLayers() {
  const fileRef = useRef(null);
  const [layers, setLayers] = useState([]);      // yang ditampilkan (parsed, cache lokal)
  const [serverFiles, setServerFiles] = useState([]); // daftar aman di server
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const siteFileRef = useRef(null);
  const [sites, setSites] = useState([]);         // record { id,name,period,sites:[],count,total,visible,ts }
  const [serverSites, setServerSites] = useState([]);

  const refreshServer = () => listTerritory("territory").then(setServerFiles).catch(() => {});
  const refreshServerSites = () => listTerritory("sites").then(setServerSites).catch(() => {});

  useEffect(() => {
    (async () => {
      // 1) Muat cache lokal (kalau ada) — cepat, tampil instan.
      let localLayers = [];
      try {
        const rows = await idbAll();
        for (const r of rows) {
          if (r.geojson?.features?.length) {
            const s = sanitizeSumatra(r.geojson);
            if (s && s.count !== r.count) { const nr = { ...r, ...s }; try { await idbPut(nr); } catch { /* quota */ } localLayers.push(nr); continue; }
          }
          localLayers.push(r);
        }
        localLayers.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        setLayers(localLayers);
      } catch { /* noop */ }
      let localSites = [];
      try { localSites = (await idbAllSites() || []).sort((a, b) => (b.ts || 0) - (a.ts || 0)); setSites(localSites); } catch { /* noop */ }

      // 2) Ambil daftar server. Bila lokal kosong (mis. user LAIN yang tidak
      //    mengunggah), otomatis muat data TERBARU dari server agar peta tetap tampil.
      try {
        const files = await listTerritory("territory");
        setServerFiles(files);
        if (!localLayers.length && files.length) loadFromServer(files[0]);
      } catch { /* noop */ }
      try {
        const sfiles = await listTerritory("sites");
        setServerSites(sfiles);
        if (!localSites.length && sfiles.length) loadSitesFromServer(sfiles[0]);
      } catch { /* noop */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Site (titik) ──
  async function onPickSite(ev) {
    const file = ev.target.files?.[0];
    if (ev.target) ev.target.value = "";
    if (!file) return;
    setBusy(true); setErr(""); setStatus(""); setProgress(1);
    try {
      const parsed = await parseSiteFile(file, (p) => setProgress(Math.min(80, p)));
      const rec = { id: (crypto?.randomUUID?.() || String(Date.now())), name: parsed.name, period: null, sites: parsed.sites, count: parsed.count, total: parsed.total, visible: true, ts: Date.now() };
      await idbClearSites(); await idbPutSite(rec); setSites([rec]);
      setStatus("Menyimpan site aman ke server…"); setProgress(90);
      try { await uploadSites({ fileName: file.name, sites: parsed.sites, count: parsed.count, total: parsed.total }); await refreshServerSites(); setStatus("Site tersimpan aman."); }
      catch (se) { setErr("Titik tampil, tapi gagal simpan ke server: " + se.message); }
      setProgress(100);
    } catch (e) { setErr(e.message || "Gagal membaca berkas site."); }
    finally { setTimeout(() => { setBusy(false); setProgress(0); }, 600); }
  }
  async function removeServerSite(rec) {
    setBusy(true); setErr("");
    try { await removeTerritory(rec); await refreshServerSites(); } catch (e) { setErr("Gagal hapus: " + (e.message || e)); }
    finally { setBusy(false); }
  }
  const clearSites = async () => { await idbClearSites(); setSites([]); };

  // Render GeoJSON hasil parse ke peta + cache lokal (ganti data lama).
  async function renderParsed({ name, period, geojson, count, total }) {
    const rec = { id: (crypto?.randomUUID?.() || String(Date.now())), name, period, geojson, count, total, visible: true, ts: Date.now() };
    await idbClear(); await idbPut(rec); setLayers([rec]);
  }

  async function onPick(ev) {
    const file = ev.target.files?.[0];
    if (ev.target) ev.target.value = "";
    if (!file) return;
    setBusy(true); setErr(""); setStatus(""); setProgress(1);
    try {
      const parsed = await parseGeoFile(file, (p) => setProgress(Math.min(80, p)));
      await renderParsed(parsed);                 // tampil di peta (cache lokal)
      setStatus("Menyimpan aman ke server…"); setProgress(90);
      try {
        await uploadTerritory({ fileName: file.name, period: parsed.period, geojson: parsed.geojson, count: parsed.count, total: parsed.total });
        await refreshServer();
        setStatus("Tersimpan aman di server.");
      } catch (se) {
        setErr("Peta tampil, tapi gagal simpan ke server: " + se.message);
      }
      setProgress(100);
    } catch (e) { setErr(e.message || "Gagal membaca berkas."); }
    finally { setTimeout(() => { setBusy(false); setProgress(0); }, 600); }
  }

  // Muat data dari server → tampilkan di peta.
  async function loadFromServer(rec) {
    setBusy(true); setErr(""); setStatus("Mengambil dari server…"); setProgress(40);
    try {
      const geojson = await fetchTerritoryGeojson(rec);
      setProgress(85);
      await renderParsed({ name: (rec.file_name || "territory").replace(/\.[^.]+$/, ""), period: rec.period, geojson, count: rec.feature_sumatra || geojson.features?.length || 0, total: rec.feature_total });
      setStatus("Dimuat ke peta.");
    } catch (e) { setErr("Gagal memuat dari server: " + (e.message || e)); }
    finally { setTimeout(() => { setBusy(false); setProgress(0); }, 500); }
  }
  // Muat titik site dari server → tampilkan di peta (untuk user yang tidak mengunggah).
  async function loadSitesFromServer(rec) {
    setBusy(true); setErr(""); setStatus("Mengambil site dari server…"); setProgress(40);
    try {
      const payload = await fetchTerritoryGeojson(rec); // JSON generik → { type:"sites", sites:[...] }
      const arr = Array.isArray(payload?.sites) ? payload.sites : (Array.isArray(payload) ? payload : []);
      setProgress(85);
      const localRec = { id: (crypto?.randomUUID?.() || String(Date.now())), name: (rec.file_name || "sites").replace(/\.[^.]+$/, ""), period: rec.period || null, sites: arr, count: arr.length, total: rec.feature_total, visible: true, ts: Date.now() };
      try { await idbClearSites(); await idbPutSite(localRec); } catch { /* quota */ }
      setSites([localRec]);
      setStatus("Site dimuat ke peta.");
    } catch (e) { setErr("Gagal memuat site dari server: " + (e.message || e)); }
    finally { setTimeout(() => { setBusy(false); setProgress(0); }, 500); }
  }
  async function downloadServer(rec) {
    try { const url = await signedUrl(rec, 120); window.open(url, "_blank", "noopener"); }
    catch (e) { setErr("Gagal membuat tautan unduh: " + (e.message || e)); }
  }
  async function removeServer(rec) {
    setBusy(true); setErr("");
    try { await removeTerritory(rec); await refreshServer(); }
    catch (e) { setErr("Gagal hapus: " + (e.message || e)); }
    finally { setBusy(false); }
  }

  const toggleLayer = async (id) => {
    setLayers((ls) => ls.map((l) => l.id === id ? { ...l, visible: !l.visible } : l));
    const l = layers.find((x) => x.id === id); if (l) await idbPut({ ...l, visible: !l.visible });
  };
  const removeLayer = async (id) => { await idbDelete(id); setLayers((ls) => ls.filter((l) => l.id !== id)); };
  const clearAll = async () => { await idbClear(); setLayers([]); };
  // Titik site yang ditampilkan (flatten dari record aktif)
  const siteData = sites.flatMap((r) => (r.visible !== false ? (r.sites || []) : []));
  return {
    fileRef, layers, serverFiles, busy, progress, status, err, onPick, toggleLayer, removeLayer, clearAll, loadFromServer, downloadServer, removeServer,
    siteFileRef, sites, siteData, serverSites, onPickSite, removeServerSite, clearSites,
  };
}

// ── Panel kelola layer (dipakai modal & halaman penuh) ────────────────────────
export function LayerPanel({ t, geo, style, canManage = false }) {
  const { fileRef, layers, serverFiles, busy, progress, status, err, onPick, removeServer,
    siteFileRef, sites, serverSites, onPickSite, removeServerSite } = geo;
  const siteCount = sites.reduce((n, r) => n + (r.count || (r.sites || []).length || 0), 0);
  const iconBtn = { display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, border: `1px solid ${t.line}`, background: t.hover, cursor: "pointer" };
  const mb = (b) => b ? `${(b / 1048576).toFixed(1)} MB` : "";
  const fmtUpdate = (d) => { if (!d) return ""; const x = new Date(d); return isNaN(x) ? "" : x.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.16)", padding: 14, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <I name="layers" size={15} color={t.hi} />
        <div style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Batas Wilayah</div>
      </div>
      {canManage ? (<>
        <input ref={fileRef} type="file" accept=".zip,.kml,.kmz,.geojson,.json" onChange={onPick} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 38, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#ED1C24,#C6168D)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.85 : 1, fontFamily: FONT }}>
          <I name="upload" size={15} color="#fff" /> {busy ? `Memproses… ${progress}%` : (serverFiles.length ? "Perbarui data bulan ini" : "Unggah batas (SHP / KML)")}
        </button>
        {busy && (
          <div style={{ height: 6, borderRadius: 99, background: t.hover, overflow: "hidden", marginTop: 8 }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#ED1C24,#C6168D)", borderRadius: 99, transition: "width .2s ease" }} />
          </div>
        )}
        {status && !err && <div style={{ fontSize: 10.5, color: C.success, marginTop: 8 }}>{status}</div>}
        <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, margin: "10px 0" }}>
          <I name="shield" size={11} color={C.success} /> Disimpan aman di <b>server privat</b> (khusus SPM Sumatera, terenkripsi, unduh via tautan singkat, ada audit). Peta menampilkan wilayah <b>Sumatera</b>; berkas asli tersimpan utuh. Upload baru <b>mengganti</b> data bulan sebelumnya. Format: .zip (SHP), .kml, .kmz, .geojson · maks 200 MB.
        </div>
      </>) : (
        <div style={{ fontSize: 10.5, color: t.lo, lineHeight: 1.55, margin: "2px 0 10px", display: "flex", alignItems: "flex-start", gap: 6 }}>
          <I name="shield" size={12} color={C.success} />
          <span>Mode <b>lihat saja</b>. Data batas wilayah & titik site dikelola oleh SPM Sumatera; Anda dapat menjelajah peta secara penuh.</span>
        </div>
      )}
      {err && <div style={{ fontSize: 11, color: C.error, background: C.errorL, border: `1px solid ${C.error}30`, borderRadius: 8, padding: "7px 9px", marginBottom: 8 }}>{err}</div>}

      <div style={{ fontSize: 10, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.05em", margin: "4px 0 6px" }}>Tersimpan di server</div>
      {serverFiles.length === 0 ? (
        <div style={{ fontSize: 11, color: t.lo, padding: "2px 0 4px" }}>{canManage ? "Belum ada. Unggah untuk menyimpan aman." : "Belum ada data batas wilayah."}</div>
      ) : (
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {serverFiles.map((f) => {
            const active = layers.some((l) => l.period === f.period && l.name === (f.file_name || "").replace(/\.[^.]+$/, ""));
            return (
              <div key={f.id} style={{ padding: "8px 0", borderTop: `1px solid ${t.line}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {f.file_name}{active && <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 800, color: "#fff", background: C.success, borderRadius: 999, padding: "1px 6px" }}>DI PETA</span>}
                    </div>
                    <div style={{ fontSize: 9.5, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {f.period ? `${f.period} · ` : ""}{f.feature_sumatra ? `${f.feature_sumatra.toLocaleString("id-ID")} wil · ` : ""}{mb(f.size_bytes)}
                    </div>
                    <div style={{ fontSize: 9.5, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      Update: {fmtUpdate(f.created_at)}{f.uploaded_by_email ? ` · ${f.uploaded_by_email.split("@")[0]}` : ""}
                    </div>
                  </div>
                  {canManage && <button onClick={() => removeServer(f)} disabled={busy} title="Hapus dari server" style={{ ...iconBtn, borderColor: `${C.error}40` }}><I name="trash" size={13} color={C.error} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Titik Site ─────────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${t.line}`, margin: "14px 0 10px" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span style={{ width: 11, height: 11, borderRadius: 99, background: SITE_COLOR, flexShrink: 0, boxShadow: `0 0 0 3px ${SITE_COLOR}25` }} />
        <div style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Titik Site</div>
        {siteCount > 0 && <span style={{ fontSize: 9.5, fontWeight: 800, color: SITE_COLOR }}>{siteCount.toLocaleString("id-ID")} titik</span>}
      </div>
      {canManage && (<>
        <input ref={siteFileRef} type="file" accept=".xlsb,.xlsx,.xls,.csv" onChange={onPickSite} style={{ display: "none" }} />
        <button onClick={() => siteFileRef.current?.click()} disabled={busy}
          style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 38, borderRadius: 10, border: `1px solid ${SITE_COLOR}`, background: "transparent", color: SITE_COLOR, fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.85 : 1, fontFamily: FONT }}>
          <I name="upload" size={15} color={SITE_COLOR} /> {busy ? `Memproses… ${progress}%` : (serverSites.length ? "Perbarui daftar site" : "Unggah daftar site (Excel)")}
        </button>
        <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, margin: "8px 0" }}>
          Excel (.xlsb / .xlsx / .csv) berisi koordinat site. Titik di luar Sumatera diabaikan. Klik titik di peta untuk melihat detailnya. Upload baru <b>mengganti</b> daftar sebelumnya.
        </div>
      </>)}
      {serverSites.length === 0 && (
        <div style={{ fontSize: 11, color: t.lo, padding: "2px 0 4px" }}>{canManage ? "Belum ada. Unggah daftar site." : "Belum ada titik site."}</div>
      )}
      {serverSites.length > 0 && (
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {serverSites.map((f) => (
            <div key={f.id} style={{ padding: "8px 0", borderTop: `1px solid ${t.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.file_name}</div>
                  <div style={{ fontSize: 9.5, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {f.feature_sumatra ? `${f.feature_sumatra.toLocaleString("id-ID")} titik · ` : ""}{mb(f.size_bytes)}
                  </div>
                  <div style={{ fontSize: 9.5, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    Update: {fmtUpdate(f.created_at)}{f.uploaded_by_email ? ` · ${f.uploaded_by_email.split("@")[0]}` : ""}
                  </div>
                </div>
                {canManage && <button onClick={() => removeServerSite(f)} disabled={busy} title="Hapus dari server" style={{ ...iconBtn, borderColor: `${C.error}40` }}><I name="trash" size={13} color={C.error} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Kartu peta (dashboard): preview → modal ───────────────────────────────────
export function MapCard({ t, dark, height = 260, canManage = false }) {
  const boxRef = useRef(null), mapRef = useRef(null), fgRef = useRef(null), sitesFgRef = useRef(null);
  const bigRef = useRef(null), bigMapRef = useRef(null), bigFgRef = useRef(null), bigSitesFgRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [boot, setBoot] = useState(0);
  const geo = useGeoLayers();
  const { layers, siteData } = geo;
  const layersRef = useRef(layers); layersRef.current = layers; // selalu terbaru (hindari race saat build async)
  const siteRef = useRef(siteData); siteRef.current = siteData;

  // Bangun ulang sekali setelah layout dashboard benar-benar settle (meniru efek
  // toggle tema) — memastikan peta tampil di render pertama tanpa perlu di-toggle.
  useEffect(() => {
    const id = setTimeout(() => setBoot((b) => b + 1), 350);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!boxRef.current || mapRef.current) return;
      const map = await buildBaseMap(boxRef.current, { dark, expanded: false, interactive: true });
      if (!map) return; if (cancelled) { map.remove(); return; }
      mapRef.current = map; fgRef.current = null; sitesFgRef.current = null;
      await paintOverlays(map, fgRef, layersRef.current, { expanded: false, appBg: t.appBg });
      paintSites(map, sitesFgRef, siteRef.current);
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; fgRef.current = null; sitesFgRef.current = null; } };
  }, [dark, boot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintOverlays(mapRef.current, fgRef, layers, { expanded: false, appBg: t.appBg }); }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintSites(mapRef.current, sitesFgRef, siteData); }, [siteData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    const onKey = (e) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    (async () => {
      if (!bigRef.current || bigMapRef.current) return;
      const map = await buildBaseMap(bigRef.current, { dark, expanded: true });
      if (!map) return; if (cancelled) { map.remove(); return; }
      bigMapRef.current = map; bigFgRef.current = null; bigSitesFgRef.current = null;
      await paintOverlays(map, bigFgRef, layersRef.current, { expanded: true, appBg: t.appBg });
      paintSites(map, bigSitesFgRef, siteRef.current);
    })();
    return () => { cancelled = true; window.removeEventListener("keydown", onKey); if (bigMapRef.current) { bigMapRef.current.remove(); bigMapRef.current = null; bigFgRef.current = null; bigSitesFgRef.current = null; } };
  }, [expanded, dark]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bigMapRef.current) paintOverlays(bigMapRef.current, bigFgRef, layers, { expanded: true, appBg: t.appBg }); }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bigMapRef.current) paintSites(bigMapRef.current, bigSitesFgRef, siteData); }, [siteData]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div style={{ position: "relative", width: "100%", height, borderRadius: 12, overflow: "hidden", border: `1px solid ${t.line}`, isolation: "isolate" }}>
        <div ref={boxRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />
        <MapLegend t={t} />
        {layers.length > 0 && (
          <div style={{ position: "absolute", top: 10, left: 10, zIndex: 650, fontSize: 10, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#ED1C24,#C6168D)", borderRadius: 999, padding: "3px 9px" }}>{layers.length} batas wilayah</div>
        )}
        {/* Toolbar: perbesar · zoom · full Sumatera */}
        <div style={{ position: "absolute", top: 10, right: 10, zIndex: 650, display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { ic: "expand", title: "Perbesar (layar penuh)", on: () => setExpanded(true) },
            { ic: "plus", title: "Perbesar peta", on: () => mapRef.current?.zoomIn() },
            { ic: "minus", title: "Perkecil peta", on: () => mapRef.current?.zoomOut() },
            { ic: "fit", title: "Tampilkan seluruh Sumatera", on: () => mapRef.current?.fitBounds(SUMATRA_BOUNDS, { animate: true }) },
          ].map((b) => (
            <button key={b.ic} onClick={b.on} title={b.title}
              style={{ width: 30, height: 30, borderRadius: 8, background: t.card, border: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", cursor: "pointer" }}>
              <I name={b.ic} size={15} color={t.mid} />
            </button>
          ))}
        </div>
      </div>

      {expanded && (
        <div onClick={() => setExpanded(false)} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "min(1120px,96vw)", height: "min(740px,88vh)", background: t.card, borderRadius: 16, overflow: "hidden", border: `1px solid ${t.line}`, boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 700, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 16px", background: `linear-gradient(${t.card},${t.card}00)` }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>Activity Map · Sumatera</div>
              <button onClick={() => setExpanded(false)} title="Tutup" style={{ width: 32, height: 32, borderRadius: 9, background: t.hover, border: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}><I name="close" size={16} color={t.mid} /></button>
            </div>
            <div ref={bigRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />
            <MapLegend t={t} />
            <LayerPanel t={t} geo={geo} canManage={false} style={{ position: "absolute", top: 56, right: 14, zIndex: 700, width: 264, maxHeight: "calc(100% - 76px)", overflowY: "auto" }} />
          </div>
        </div>
      )}
    </>
  );
}

// ── Peta penuh (halaman Map Intelligence) ─────────────────────────────────────
export default function MapFull({ t, dark, canManage = false }) {
  const boxRef = useRef(null), mapRef = useRef(null), fgRef = useRef(null), sitesFgRef = useRef(null);
  const geo = useGeoLayers();
  const { layers, siteData } = geo;
  const layersRef = useRef(layers); layersRef.current = layers;
  const siteRef = useRef(siteData); siteRef.current = siteData;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!boxRef.current || mapRef.current) return;
      const map = await buildBaseMap(boxRef.current, { dark, expanded: true });
      if (!map) return; if (cancelled) { map.remove(); return; }
      mapRef.current = map; fgRef.current = null; sitesFgRef.current = null;
      await paintOverlays(map, fgRef, layersRef.current, { expanded: true, appBg: t.appBg });
      paintSites(map, sitesFgRef, siteRef.current);
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; fgRef.current = null; sitesFgRef.current = null; } };
  }, [dark]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintOverlays(mapRef.current, fgRef, layers, { expanded: true, appBg: t.appBg }); }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintSites(mapRef.current, sitesFgRef, siteData); }, [siteData]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0, borderRadius: 14, overflow: "hidden", border: `1px solid ${t.line}`, isolation: "isolate" }}>
      <div ref={boxRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />
      <MapLegend t={t} />
      <LayerPanel t={t} geo={geo} canManage={false} style={{ position: "absolute", top: 14, right: 14, zIndex: 700, width: 280, maxHeight: "calc(100% - 28px)", overflowY: "auto" }} />
    </div>
  );
}
