"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { parseGeoFile, sanitizeSumatra, esc, idbAll, idbPut, idbDelete, idbClear, ALLOWED as TERRITORY_EXT, periodFromName, periodKeyFromName } from "../../../lib/geoImport";
import { getMapLayerStatus, setMapLayerStatus } from "../../../lib/territoryStore";
import { parseSiteFile, idbAllSites, idbPutSite, idbClearSites, ALLOWED as SITE_EXT } from "../../../lib/siteImport";
import { supabase } from "../../../lib/supabase";
import {
  supportsFolderLink, saveFolderHandle, getFolderHandle, clearFolderHandle,
  setLastFile, ensurePermission, checkPermission, listMatchingFiles,
} from "../../../lib/folderHandles";
import "leaflet/dist/leaflet.css";

// Email sesi (SandraHub, sama seperti gerbang akses MartaHub §0.1) - dipakai
// hanya untuk mencatat SIAPA terakhir memproses file lokal (audit ringan di
// status metadata), bukan untuk otentikasi ke project MartaHub.
async function currentEmail() {
  try { const { data: { user } } = await supabase.auth.getUser(); return user?.email || null; }
  catch { return null; }
}

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const C = { success: "#2E7D32", warning: "#F57F17", error: "#C62828", errorL: "#FFEBEE" };

// Warna titik Activity Map, by status mh_activities (BUKAN pin contoh lagi -
// data selalu dioper dari luar via prop `activityPoints`, dari mh_activities
// asli). Dipertahankan longgar (fallback abu) supaya status baru/tak dikenal
// tidak pernah bikin titik hilang dari peta.
const ACTIVITY_STATUS_COLOR = { approved: C.success, submitted: C.warning, plan_submitted: "#0277BD", revision_needed: C.error, rejected: C.error, draft: "#7B8BAD" };
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

// ── Activity Map - titik ASLI dari mh_activities (evidence, §0.2) ────────────
// Dioper dari luar via prop `activityPoints` (page.jsx query mh_activities
// terscope TMV) - komponen ini TIDAK query apa pun sendiri, murni render.
async function paintActivities(map, ref, points, { expanded } = {}) {
  if (!map || !map._container) return;
  const L = (await import("leaflet")).default;
  if (ref.current) { try { map.removeLayer(ref.current); } catch { /* noop */ } ref.current = null; }
  if (!points || !points.length) return;
  if (!map.getPane("activityPane")) { map.createPane("activityPane"); map.getPane("activityPane").style.zIndex = 660; }
  const grp = L.layerGroup();
  const sz = expanded ? 22 : 18;
  points.forEach((p) => {
    const c = p.color || ACTIVITY_STATUS_COLOR[p.statusKey] || "#455A64";
    const icon = L.divIcon({ className: "", html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${c}26;border:2px solid ${c}"></div>`, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
    const m = L.marker([p.lat, p.lng], { icon, pane: "activityPane" });
    const label = [esc(p.name || "Activity"), p.branch, p.status].filter(Boolean).join(" · ");
    m.bindTooltip(label, { direction: "top", offset: [0, -sz / 2] });
    grp.addLayer(m);
  });
  grp.addTo(map);
  ref.current = grp;
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
  // Outline area titik terfilter (dibuat dari convex hull) - hanya saat filter aktif.
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
    folder: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></svg>,
    calendar: <svg style={s} viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
    refresh: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>,
  };
  return icons[name] || null;
}

// Legend Activity Map - status asli mh_activities (ganti "Produktivitas
// Tinggi/Sedang/Rendah" lama yang cuma cocok utk 10 pin contoh yang sudah
// dihapus). Disembunyikan otomatis kalau tidak ada titik activity sama sekali
// supaya tidak menampilkan legend kosong/menyesatkan.
function MapLegend({ t, show = true }) {
  if (!show) return null;
  return (
    <div style={{ position: "absolute", bottom: 12, left: 12, zIndex: 500, background: t.card, borderRadius: 10, padding: "9px 13px", display: "flex", flexDirection: "column", gap: 5, border: `1px solid ${t.line}`, boxShadow: "0 4px 16px rgba(0,0,0,0.14)" }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>Status Activity</div>
      {[["Approved", C.success], ["Menunggu", C.warning], ["Ditolak/Revisi", C.error]].map(([l, c]) => (
        <div key={l} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
          <span style={{ fontSize: 10.5, color: t.mid }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

// ── Hook: kelola layer batas wilayah ──────────────────────────────────────────
// Sumber tampilan = cache lokal (IndexedDB), 100% di device ini. TIDAK ADA lagi
// payload (geojson/koordinat site) yang tersimpan di server mana pun - hanya
// STATUS metadata (nama file, periode, jumlah fitur, siapa/kapan) yang dicatat
// di project MartaHub (mh_map_layer_status) supaya perangkat lain tahu file
// mana yang perlu di-connect ulang secara lokal. Lihat lib/territoryStore.js.
//
// TIDAK ADA tombol "upload" - dua jalur pengisian data, keduanya 100% lokal:
//  1. "Hubungkan Folder" (File System Access API, Chrome/Edge) - user pilih
//     folder SEKALI, browser mengingat *referensi* foldernya (bukan isinya)
//     di IndexedDB perangkat ini. Sesi berikutnya (mis. setelah logout/login)
//     tinggal klik "Berikan Izin Ulang" kalau browser sudah lupa izinnya -
//     tidak pernah otomatis/silent, selalu perlu klik eksplisit user.
//  2. Fallback file-picker biasa (browser yang tidak dukung File System Access
//     API, mis. Firefox/Safari) - pilih file manual tiap sesi, seperti semula.
// Di KEDUA jalur: isi file (geojson/koordinat) diproses di browser & disimpan
// HANYA di IndexedDB lokal - tidak pernah dikirim ke server mana pun (§0.2).
export function useGeoLayers() {
  const fileRef = useRef(null);
  const [layers, setLayers] = useState([]);      // yang ditampilkan (parsed, cache lokal)
  const [layerStatus, setLayerStatus] = useState([]); // status organisasi (metadata saja), dari DB
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const siteFileRef = useRef(null);
  const [sites, setSites] = useState([]);         // record { id,name,period,sites:[],count,total,visible,ts }

  // ── Folder link - HANYA referensi folder (FileSystemDirectoryHandle) di
  // IndexedDB perangkat ini, TIDAK PERNAH isinya. Lihat lib/folderHandles.js.
  const territoryHandleRef = useRef(null);
  const sitesHandleRef = useRef(null);
  const [territoryFolder, setTerritoryFolder] = useState(null); // { name, needsPermission, files, activeFile } | null
  const [sitesFolder, setSitesFolder] = useState(null);

  const refreshStatus = () => getMapLayerStatus().then(setLayerStatus).catch(() => {});

  // Render GeoJSON/site hasil parse ke peta + cache lokal (ganti data lama).
  async function renderParsed({ name, period, geojson, count, total }) {
    const rec = { id: (crypto?.randomUUID?.() || String(Date.now())), name, period, geojson, count, total, visible: true, ts: Date.now() };
    await idbClear(); await idbPut(rec); setLayers([rec]);
  }
  async function renderParsedSite({ name, sites: arr, count, total }) {
    const rec = { id: (crypto?.randomUUID?.() || String(Date.now())), name, period: null, sites: arr, count, total, visible: true, ts: Date.now() };
    await idbClearSites(); await idbPutSite(rec); setSites([rec]);
  }

  // Satu jalur proses File, dipakai baik dari folder-link maupun fallback
  // <input type=file> - supaya perilaku (parsing, simpan lokal, catat status)
  // konsisten dari mana pun File-nya berasal.
  async function processFile(kind, file) {
    setBusy(true); setErr(""); setStatus(""); setProgress(1);
    try {
      const parsed = kind === "territory"
        ? await parseGeoFile(file, (p) => setProgress(Math.min(85, p)))
        : await parseSiteFile(file, (p) => setProgress(Math.min(85, p)));
      if (kind === "territory") await renderParsed(parsed); else await renderParsedSite(parsed);
      setStatus("Tersimpan lokal di perangkat ini."); setProgress(92);
      try {
        const email = await currentEmail();
        await setMapLayerStatus({ kind, fileName: file.name, period: parsed.period || null, count: parsed.count, total: parsed.total, email });
        await refreshStatus();
      } catch (se) { setErr("Tampil di peta, tapi gagal mencatat status: " + se.message); }
      setProgress(100);
    } catch (e) { setErr(e.message || "Gagal membaca berkas."); }
    finally { setTimeout(() => { setBusy(false); setProgress(0); }, 600); }
  }

  async function scanFolder(kind) {
    const handle = kind === "territory" ? territoryHandleRef.current : sitesHandleRef.current;
    const setFolder = kind === "territory" ? setTerritoryFolder : setSitesFolder;
    if (!handle) return [];
    try {
      const files = await listMatchingFiles(handle, kind === "territory" ? TERRITORY_EXT : SITE_EXT);
      setFolder((f) => ({ ...(f || {}), files, needsPermission: false }));
      return files;
    } catch (e) { setErr("Gagal membaca isi folder: " + (e.message || e)); return []; }
  }

  async function loadFromFolderFile(kind, fileEntry) {
    const setFolder = kind === "territory" ? setTerritoryFolder : setSitesFolder;
    try {
      const file = await fileEntry.handle.getFile();
      await processFile(kind, file);
      await setLastFile(kind, fileEntry.name);
      setFolder((f) => ({ ...(f || {}), activeFile: fileEntry.name }));
    } catch (e) { setErr("Gagal membaca file dari folder: " + (e.message || e)); }
  }

  // Klik "Hubungkan Folder" - HARUS dipanggil langsung dari user-gesture.
  async function connectFolder(kind) {
    if (!supportsFolderLink) return;
    setErr("");
    try {
      const dirHandle = await window.showDirectoryPicker();
      const handleRef = kind === "territory" ? territoryHandleRef : sitesHandleRef;
      const setFolder = kind === "territory" ? setTerritoryFolder : setSitesFolder;
      handleRef.current = dirHandle;
      await saveFolderHandle(kind, dirHandle, dirHandle.name);
      setFolder({ name: dirHandle.name, needsPermission: false, files: [], activeFile: null });
      const files = await scanFolder(kind);
      if (files.length) await loadFromFolderFile(kind, files[0]);
      else setErr(`Tidak ada file yang cocok di folder ini (format: ${kind === "territory" ? ".zip/.kml/.kmz/.geojson" : ".xlsx/.xls/.csv"}).`);
    } catch (e) { if (e?.name !== "AbortError") setErr("Gagal menghubungkan folder: " + (e.message || e)); }
  }

  // Klik "Berikan Izin Ulang" - HARUS dipanggil langsung dari user-gesture,
  // biasanya setelah sesi baru (logout/login) & browser sudah lupa izinnya.
  async function reauthorizeFolder(kind) {
    const handleRef = kind === "territory" ? territoryHandleRef : sitesHandleRef;
    const setFolder = kind === "territory" ? setTerritoryFolder : setSitesFolder;
    const handle = handleRef.current;
    if (!handle) return;
    const ok = await ensurePermission(handle);
    if (!ok) { setErr("Izin folder ditolak - data tidak bisa dibaca sampai izin diberikan."); return; }
    setFolder((f) => ({ ...(f || {}), needsPermission: false }));
    const files = await scanFolder(kind);
    const rec = await getFolderHandle(kind);
    const preferred = files.find((f2) => f2.name === rec?.lastFile) || files[0];
    if (preferred) await loadFromFolderFile(kind, preferred);
  }

  // Scan ulang folder yang SUDAH terhubung (mis. isi file periode yang sedang
  // aktif baru saja diganti) tanpa perlu connect folder dari nol. SENGAJA
  // memuat ulang periode yang sedang aktif (bukan lompat ke file terbaru) -
  // supaya "Refresh" tidak diam-diam mengganti pilihan periode user (§UX).
  async function refreshFolder(kind) {
    const current = kind === "territory" ? territoryFolder : sitesFolder;
    const files = await scanFolder(kind);
    if (!files.length) return;
    const same = files.find((f) => f.name === current?.activeFile);
    await loadFromFolderFile(kind, same || files[0]);
  }

  async function disconnectFolder(kind) {
    const handleRef = kind === "territory" ? territoryHandleRef : sitesHandleRef;
    const setFolder = kind === "territory" ? setTerritoryFolder : setSitesFolder;
    await clearFolderHandle(kind);
    handleRef.current = null;
    setFolder(null);
  }

  useEffect(() => {
    (async () => {
      // 1) Muat cache lokal (kalau ada) - cepat, tampil instan, satu-satunya sumber payload.
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
      try { setSites((await idbAllSites() || []).sort((a, b) => (b.ts || 0) - (a.ts || 0))); } catch { /* noop */ }

      // 2) Status organisasi (metadata saja) - TIDAK ada payload untuk dimuat balik;
      //    kalau device ini kosong, status dipakai untuk tampilkan "belum tersambung".
      await refreshStatus();

      // 3) Folder yang sudah pernah dihubungkan di perangkat ini (kalau ada) -
      //    cek izin TANPA meminta (aman di luar user-gesture); kalau izin masih
      //    berlaku, langsung scan+muat lagi. Kalau tidak, tampilkan status
      //    "perlu izin ulang" - TIDAK pernah minta izin otomatis/silent.
      if (supportsFolderLink) {
        try {
          const tRec = await getFolderHandle("territory");
          if (tRec?.handle) {
            territoryHandleRef.current = tRec.handle;
            const granted = await checkPermission(tRec.handle);
            setTerritoryFolder({ name: tRec.folderName, needsPermission: !granted, files: [], activeFile: tRec.lastFile });
            if (granted) await scanFolder("territory");
          }
        } catch { /* noop */ }
        try {
          const sRec = await getFolderHandle("sites");
          if (sRec?.handle) {
            sitesHandleRef.current = sRec.handle;
            const granted = await checkPermission(sRec.handle);
            setSitesFolder({ name: sRec.folderName, needsPermission: !granted, files: [], activeFile: sRec.lastFile });
            if (granted) await scanFolder("sites");
          }
        } catch { /* noop */ }
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fallback <input type=file> (browser tanpa File System Access API) ──
  async function onPickSite(ev) {
    const file = ev.target.files?.[0];
    if (ev.target) ev.target.value = "";
    if (!file) return;
    await processFile("sites", file);
  }
  async function onPick(ev) {
    const file = ev.target.files?.[0];
    if (ev.target) ev.target.value = "";
    if (!file) return;
    await processFile("territory", file);
  }

  const clearSites = async () => { await idbClearSites(); setSites([]); };
  const toggleLayer = async (id) => {
    setLayers((ls) => ls.map((l) => l.id === id ? { ...l, visible: !l.visible } : l));
    const l = layers.find((x) => x.id === id); if (l) await idbPut({ ...l, visible: !l.visible });
  };
  const removeLayer = async (id) => { await idbDelete(id); setLayers((ls) => ls.filter((l) => l.id !== id)); };
  const clearAll = async () => { await idbClear(); setLayers([]); };
  // Titik site yang ditampilkan (flatten dari record aktif)
  const siteData = sites.flatMap((r) => (r.visible !== false ? (r.sites || []) : []));
  return {
    fileRef, layers, layerStatus, busy, progress, status, err, onPick, toggleLayer, removeLayer, clearAll,
    siteFileRef, sites, siteData, onPickSite, clearSites,
    territoryFolder, sitesFolder, connectFolder, reauthorizeFolder, refreshFolder, disconnectFolder, pickFolderFile: loadFromFolderFile,
  };
}

// ── Baris status ringkas 1 kind ("connected" / "disconnected" / "none") ──────
// "connected"    = ada data di cache lokal perangkat INI (localCount > 0) - ini
//                  yang benar-benar menentukan apa yang tampil di peta, TERLEPAS
//                  dari ada/tidaknya status organisasi (mis. status baru dihapus
//                  tapi cache lokal browser belum ikut dibersihkan - kasus nyata
//                  yang bikin strip & peta kelihatan kontradiktif kalau dicek
//                  cuma dari statusRow).
// "disconnected" = TIDAK ada cache lokal, tapi organisasi pernah catat status -
//                  kasus paling umum: ganti laptop/browser, karena payload
//                  memang TIDAK PERNAH disimpan di server (§0.2).
// "none"         = benar-benar kosong (lokal maupun organisasi).
function fmtWhen(d) { if (!d) return ""; const x = new Date(d); return isNaN(x) ? "" : x.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
export function LayerStatusRow({ t, label, dotColor, localCount, localInfo, statusRow, canManage, onConnect, onClear, compact = false }) {
  const state = localCount > 0 ? "connected" : statusRow ? "disconnected" : "none";
  const color = state === "connected" ? C.success : state === "disconnected" ? C.warning : t.lo;
  const bg = state === "connected" ? `${C.success}12` : state === "disconnected" ? `${C.warning}14` : "transparent";
  const who = statusRow?.updated_by_email ? statusRow.updated_by_email.split("@")[0] : null;
  const localName = localInfo?.name ? `${localInfo.name}${localInfo.period ? ` · ${localInfo.period}` : ""}` : null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: compact ? "7px 9px" : "8px 10px", borderRadius: 9, background: bg, border: `1px solid ${state === "none" ? t.line : color + "33"}` }}>
      <span style={{ width: 7, height: 7, marginTop: 4, borderRadius: 99, background: state === "none" ? dotColor : color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: compact ? 10.5 : 11, color: t.mid, lineHeight: 1.45 }}>
        <b style={{ color: t.hi }}>{label}</b>
        {state === "connected" && (
          <> · <span style={{ color: C.success, fontWeight: 700 }}>Tersambung (perangkat ini)</span> - {statusRow ? <>{statusRow.period ? `${statusRow.period} · ` : ""}{statusRow.file_name}{who ? ` · ${who}` : ""} · {fmtWhen(statusRow.updated_at)}</> : <>{localName || "data lokal"} <i>(belum tercatat status organisasi)</i></>}</>
        )}
        {state === "disconnected" && <> · <span style={{ color: "#8a5b00", fontWeight: 700 }}>Belum tersambung di perangkat ini</span> - terakhir {statusRow.period ? `${statusRow.period} · ` : ""}<b>{statusRow.file_name}</b>{who ? ` oleh ${who}` : ""} ({fmtWhen(statusRow.updated_at)}). Pilih file yang sama untuk tampil di peta ini.</>}
        {state === "none" && <> · Belum ada data.</>}
      </div>
      {canManage && state !== "connected" && (
        <button onClick={onConnect} style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: "#fff", background: state === "disconnected" ? C.warning : "linear-gradient(135deg,#ED1C24,#C6168D)", border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
          Hubungkan
        </button>
      )}
      {canManage && state === "connected" && onClear && (
        <button onClick={onClear} title="Hapus data lokal dari perangkat ini" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, border: `1px solid ${C.error}40`, background: "#fff", color: C.error, cursor: "pointer" }}>
          <I name="trash" size={11} color={C.error} />
        </button>
      )}
    </div>
  );
}

// ── Panel kelola layer (dipakai modal & halaman penuh) ────────────────────────
// ── Jalur pengisian data (Hubungkan Folder ATAU fallback file-picker) ────────
// Tidak ada "upload" - connect folder cuma menyimpan REFERENSI folder secara
// lokal (lib/folderHandles.js), isi file tidak pernah dikirim ke server mana
// pun (§0.2). Dipakai untuk section Batas Wilayah & Titik Site (parameterized
// by `kind`) supaya perilakunya konsisten.
function ConnectSourceSection({ t, geo, kind, color, acceptAttr, gradient }) {
  const { busy, progress } = geo;
  const folder = kind === "territory" ? geo.territoryFolder : geo.sitesFolder;
  const fileRef = kind === "territory" ? geo.fileRef : geo.siteFileRef;
  const onPickFallback = kind === "territory" ? geo.onPick : geo.onPickSite;
  const hasLocal = kind === "territory" ? geo.layers.length > 0 : geo.siteData.length > 0;
  const btnBase = { width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 38, borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", opacity: busy ? 0.85 : 1, fontFamily: FONT };
  const primaryStyle = { border: "none", background: "linear-gradient(135deg,#ED1C24,#C6168D)", color: "#fff" };
  const outlineStyle = { border: `1px solid ${color}`, background: "transparent", color };

  if (!supportsFolderLink) {
    return (<>
      <input ref={fileRef} type="file" accept={acceptAttr} onChange={onPickFallback} style={{ display: "none" }} />
      <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...btnBase, ...(gradient ? primaryStyle : outlineStyle) }}>
        <I name="upload" size={15} color={gradient ? "#fff" : color} /> {busy ? `Memproses… ${progress}%` : (hasLocal ? "Perbarui berkas (perangkat ini)" : "Pilih berkas (perangkat ini)")}
      </button>
      <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, margin: "8px 0" }}>
        Browser ini tidak mendukung &ldquo;Hubungkan Folder&rdquo; (butuh Chrome/Edge) - pilih berkas manual, tetap diproses 100% lokal, tidak pernah dikirim ke server.
      </div>
    </>);
  }

  if (!folder) {
    return (<>
      <button onClick={() => geo.connectFolder(kind)} disabled={busy} style={{ ...btnBase, ...(gradient ? primaryStyle : outlineStyle) }}>
        <I name="folder" size={15} color={gradient ? "#fff" : color} /> {busy ? `Memproses… ${progress}%` : "Hubungkan Folder"}
      </button>
      <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, margin: "8px 0" }}>
        Pilih folder yang berisi berkas {kind === "territory" ? "batas wilayah (.zip/.kml/.kmz/.geojson)" : "titik site (.xlsx/.xls/.csv)"} - periode terdeteksi otomatis dari nama file, bisa diganti kapan saja setelah terhubung.
      </div>
    </>);
  }

  if (folder.needsPermission) {
    return (<>
      <div style={{ fontSize: 10.5, color: "#8a5b00", background: "#FFFDE7", border: "1px solid #F0E3B0", borderRadius: 9, padding: "8px 10px", marginBottom: 8, lineHeight: 1.5 }}>
        Folder <b>{folder.name}</b> pernah terhubung di perangkat ini, tapi izin browser perlu di-refresh (wajar setelah logout/login atau sesi baru).
      </div>
      <button onClick={() => geo.reauthorizeFolder(kind)} disabled={busy} style={{ ...btnBase, ...primaryStyle }}>
        <I name="shield" size={14} color="#fff" /> {busy ? `Memproses… ${progress}%` : "Berikan Izin Ulang"}
      </button>
    </>);
  }

  // Turunkan periode dari nama tiap file (murni tampilan - TIDAK disimpan di
  // mana pun selain hasil parse-nya sendiri, sesuai "yang disimpan hanya path
  // foldernya"). Urut: yang punya periode dulu (terbaru→terlama), sisanya
  // (nama tak terdeteksi) diurut by lastModified.
  const filesWithMeta = (folder.files || []).map((f) => ({ ...f, period: periodFromName(f.name), periodKey: periodKeyFromName(f.name) }));
  const sortedFiles = filesWithMeta.slice().sort((a, b) => {
    if (a.periodKey && b.periodKey) return b.periodKey.localeCompare(a.periodKey);
    if (a.periodKey || b.periodKey) return a.periodKey ? -1 : 1;
    return b.lastModified - a.lastModified;
  });
  const chevron = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>";

  return (<>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}14`, border: `1px solid ${color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <I name="folder" size={14} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={folder.name}>{folder.name}</div>
        <div style={{ fontSize: 9.5, color: t.lo }}>Folder tersambung</div>
      </div>
      <button onClick={() => geo.refreshFolder(kind)} disabled={busy} title="Refresh dari folder"
        style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: busy ? "default" : "pointer", flexShrink: 0 }}>
        <I name="refresh" size={13} color={t.mid} />
      </button>
      <button onClick={() => geo.disconnectFolder(kind)} disabled={busy} title="Putuskan folder"
        style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.error}30`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", color: C.error, cursor: busy ? "default" : "pointer", flexShrink: 0 }}>
        <I name="trash" size={13} color={C.error} />
      </button>
    </div>

    {busy && (
      <div style={{ height: 5, borderRadius: 99, background: t.hover, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ height: "100%", width: `${progress}%`, background: gradient ? "linear-gradient(90deg,#ED1C24,#C6168D)" : color, borderRadius: 99, transition: "width .2s ease" }} />
      </div>
    )}

    {sortedFiles.length > 0 ? (<>
      <div style={{ fontSize: 10, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5, display: "flex", alignItems: "center", gap: 5 }}>
        <I name="calendar" size={11} color={t.mid} /> Periode
      </div>
      <select
        value={folder.activeFile || ""}
        disabled={busy}
        onChange={(e) => { const f = sortedFiles.find((x) => x.name === e.target.value); if (f) geo.pickFolderFile(kind, f); }}
        style={{ width: "100%", padding: "8px 30px 8px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 700, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", cursor: busy ? "default" : "pointer", backgroundImage: `url("${chevron}")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", backgroundSize: 13 }}>
        {sortedFiles.map((f) => <option key={f.name} value={f.name}>{f.period || f.name}</option>)}
      </select>
      <div style={{ fontSize: 10, color: t.lo, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={folder.activeFile || ""}>
        {folder.activeFile ? <>Berkas: <b style={{ color: t.mid }}>{folder.activeFile}</b></> : "Belum ada berkas dimuat"}
      </div>
    </>) : (
      <div style={{ fontSize: 11, color: t.lo, padding: "6px 0" }}>
        Tidak ada berkas yang cocok di folder ini (format: {kind === "territory" ? ".zip/.kml/.kmz/.geojson" : ".xlsx/.xls/.csv"}).
      </div>
    )}
  </>);
}

export function LayerPanel({ t, geo, style, canManage = false }) {
  const { layers, layerStatus, status, err, sites, siteData } = geo;
  const siteCount = sites.reduce((n, r) => n + (r.count || (r.sites || []).length || 0), 0);
  const territoryStatus = layerStatus.find((s) => s.kind === "territory") || null;
  const sitesStatus = layerStatus.find((s) => s.kind === "sites") || null;
  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.16)", padding: 14, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <I name="layers" size={15} color={t.hi} />
        <div style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Batas Wilayah</div>
        {layers[0]?.count > 0 && <span style={{ fontSize: 9.5, fontWeight: 800, color: t.mid }}>{layers[0].count.toLocaleString("id-ID")} wilayah</span>}
      </div>
      {canManage ? (
        <ConnectSourceSection t={t} geo={geo} kind="territory" color="#ED1C24" acceptAttr=".zip,.kml,.kmz,.geojson,.json" gradient />
      ) : (
        <div style={{ fontSize: 10.5, color: t.lo, lineHeight: 1.55, margin: "2px 0 10px", display: "flex", alignItems: "flex-start", gap: 6 }}>
          <I name="shield" size={12} color={C.success} />
          <span>Mode <b>lihat saja</b>. Data batas wilayah & titik site dikelola oleh SPM Sumatera; Anda dapat menjelajah peta secara penuh.</span>
        </div>
      )}
      {status && !err && <div style={{ fontSize: 10.5, color: C.success, marginTop: 8 }}>{status}</div>}
      {err && <div style={{ fontSize: 11, color: C.error, background: C.errorL, border: `1px solid ${C.error}30`, borderRadius: 8, padding: "7px 9px", marginTop: 8 }}>{err}</div>}
      {canManage && (
        <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, margin: "10px 0" }}>
          <I name="shield" size={11} color={C.success} /> Isi file diproses & disimpan <b>100% lokal di perangkat ini</b> - tidak pernah dikirim ke server. Hanya nama file & referensi folder yang diingat, supaya sesi berikutnya tinggal beri izin ulang, bukan pilih ulang dari nol. Peta menampilkan wilayah <b>Sumatera</b>.
        </div>
      )}

      {/* ── Titik Site ─────────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${t.line}`, margin: "14px 0 10px" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span style={{ width: 11, height: 11, borderRadius: 99, background: SITE_COLOR, flexShrink: 0 }} />
        <div style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Titik Site</div>
        {siteCount > 0 && <span style={{ fontSize: 9.5, fontWeight: 800, color: SITE_COLOR }}>{siteCount.toLocaleString("id-ID")} titik</span>}
      </div>
      {canManage ? (
        <ConnectSourceSection t={t} geo={geo} kind="sites" color={SITE_COLOR} acceptAttr=".xlsb,.xlsx,.xls,.csv" />
      ) : (
        siteData.length === 0 && <div style={{ fontSize: 11, color: t.lo, padding: "2px 0 4px" }}>Belum ada titik site.</div>
      )}
      {canManage && (
        <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, margin: "8px 0" }}>
          Excel (.xlsb / .xlsx / .csv) berisi koordinat site - diproses <b>100% lokal</b>, tidak pernah dikirim ke server. Titik di luar Sumatera diabaikan.
        </div>
      )}
    </div>
  );
}

// ── Kartu peta (dashboard): preview → modal ───────────────────────────────────
export function MapCard({ t, dark, height = 260, canManage = false, activityPoints = [] }) {
  const boxRef = useRef(null), mapRef = useRef(null), fgRef = useRef(null), sitesFgRef = useRef(null), activitiesFgRef = useRef(null);
  const bigRef = useRef(null), bigMapRef = useRef(null), bigFgRef = useRef(null), bigSitesFgRef = useRef(null), bigActivitiesFgRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [boot, setBoot] = useState(0);
  const geo = useGeoLayers();
  const { layers, siteData } = geo;
  const layersRef = useRef(layers); layersRef.current = layers; // selalu terbaru (hindari race saat build async)
  const siteRef = useRef(siteData); siteRef.current = siteData;
  const activityRef = useRef(activityPoints); activityRef.current = activityPoints;

  // Bangun ulang sekali setelah layout dashboard benar-benar settle (meniru efek
  // toggle tema) - memastikan peta tampil di render pertama tanpa perlu di-toggle.
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
      mapRef.current = map; fgRef.current = null; sitesFgRef.current = null; activitiesFgRef.current = null;
      await paintOverlays(map, fgRef, layersRef.current, { expanded: false, appBg: t.appBg });
      paintSites(map, sitesFgRef, siteRef.current);
      paintActivities(map, activitiesFgRef, activityRef.current, { expanded: false });
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; fgRef.current = null; sitesFgRef.current = null; activitiesFgRef.current = null; } };
  }, [dark, boot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintOverlays(mapRef.current, fgRef, layers, { expanded: false, appBg: t.appBg }); }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintSites(mapRef.current, sitesFgRef, siteData); }, [siteData]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintActivities(mapRef.current, activitiesFgRef, activityPoints, { expanded: false }); }, [activityPoints]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    const onKey = (e) => { if (e.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    (async () => {
      if (!bigRef.current || bigMapRef.current) return;
      const map = await buildBaseMap(bigRef.current, { dark, expanded: true });
      if (!map) return; if (cancelled) { map.remove(); return; }
      bigMapRef.current = map; bigFgRef.current = null; bigSitesFgRef.current = null; bigActivitiesFgRef.current = null;
      await paintOverlays(map, bigFgRef, layersRef.current, { expanded: true, appBg: t.appBg });
      paintSites(map, bigSitesFgRef, siteRef.current);
      paintActivities(map, bigActivitiesFgRef, activityRef.current, { expanded: true });
    })();
    return () => { cancelled = true; window.removeEventListener("keydown", onKey); if (bigMapRef.current) { bigMapRef.current.remove(); bigMapRef.current = null; bigFgRef.current = null; bigSitesFgRef.current = null; bigActivitiesFgRef.current = null; } };
  }, [expanded, dark]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bigMapRef.current) paintOverlays(bigMapRef.current, bigFgRef, layers, { expanded: true, appBg: t.appBg }); }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bigMapRef.current) paintSites(bigMapRef.current, bigSitesFgRef, siteData); }, [siteData]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bigMapRef.current) paintActivities(bigMapRef.current, bigActivitiesFgRef, activityPoints, { expanded: true }); }, [activityPoints]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shortcut "connect ulang" langsung di dashboard - laptop/browser berbeda
  // berarti IndexedDB lokal kosong walau organisasi sudah pernah upload
  // (payload memang tidak pernah ke server, §0.2). Klik "Hubungkan" membuka
  // modal (LayerPanel di dalamnya sudah punya tombol upload yang berfungsi).
  const territoryStatus = geo.layerStatus.find((s) => s.kind === "territory") || null;
  const sitesStatus = geo.layerStatus.find((s) => s.kind === "sites") || null;
  const anyDisconnected = (territoryStatus && layers.length === 0) || (sitesStatus && siteData.length === 0);
  const showStrip = territoryStatus || sitesStatus || layers.length > 0 || siteData.length > 0;

  return (
    <>
      {showStrip && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
          <LayerStatusRow t={t} label="Batas Wilayah" dotColor={t.lo} localCount={layers.length} localInfo={layers[0]} statusRow={territoryStatus}
            canManage={canManage} onConnect={() => setExpanded(true)} onClear={geo.clearAll} compact />
          <LayerStatusRow t={t} label="Titik Site" dotColor={SITE_COLOR} localCount={siteData.length} localInfo={geo.sites[0]} statusRow={sitesStatus}
            canManage={canManage} onConnect={() => setExpanded(true)} onClear={geo.clearSites} compact />
        </div>
      )}
      <div style={{ position: "relative", width: "100%", height, borderRadius: 12, overflow: "hidden", border: `1px solid ${t.line}`, isolation: "isolate" }}>
        <div ref={boxRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />
        <MapLegend t={t} show={activityPoints.length > 0} />
        {layers.length > 0 && (
          <div style={{ position: "absolute", top: 10, left: 10, zIndex: 650, fontSize: 10, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#ED1C24,#C6168D)", borderRadius: 999, padding: "3px 9px" }}>{layers.length} batas wilayah</div>
        )}
        {!canManage && anyDisconnected && (
          <div style={{ position: "absolute", bottom: 12, right: 12, zIndex: 650, fontSize: 9.5, fontWeight: 700, color: "#8a5b00", background: "#FFFDE7", border: "1px solid #F0E3B0", borderRadius: 999, padding: "3px 10px" }}>
            Sebagian layer belum tersambung di perangkat ini
          </div>
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
            <MapLegend t={t} show={activityPoints.length > 0} />
            <LayerPanel t={t} geo={geo} canManage={canManage} style={{ position: "absolute", top: 56, right: 14, zIndex: 700, width: 264, maxHeight: "calc(100% - 76px)", overflowY: "auto" }} />
          </div>
        </div>
      )}
    </>
  );
}

// ── Peta penuh (halaman Map Intelligence) ─────────────────────────────────────
export default function MapFull({ t, dark, canManage = false, activityPoints = [] }) {
  const boxRef = useRef(null), mapRef = useRef(null), fgRef = useRef(null), sitesFgRef = useRef(null), activitiesFgRef = useRef(null);
  const geo = useGeoLayers();
  const { layers, siteData } = geo;
  const layersRef = useRef(layers); layersRef.current = layers;
  const siteRef = useRef(siteData); siteRef.current = siteData;
  const activityRef = useRef(activityPoints); activityRef.current = activityPoints;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!boxRef.current || mapRef.current) return;
      const map = await buildBaseMap(boxRef.current, { dark, expanded: true });
      if (!map) return; if (cancelled) { map.remove(); return; }
      mapRef.current = map; fgRef.current = null; sitesFgRef.current = null; activitiesFgRef.current = null;
      await paintOverlays(map, fgRef, layersRef.current, { expanded: true, appBg: t.appBg });
      paintSites(map, sitesFgRef, siteRef.current);
      paintActivities(map, activitiesFgRef, activityRef.current, { expanded: true });
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; fgRef.current = null; sitesFgRef.current = null; activitiesFgRef.current = null; } };
  }, [dark]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintOverlays(mapRef.current, fgRef, layers, { expanded: true, appBg: t.appBg }); }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintSites(mapRef.current, sitesFgRef, siteData); }, [siteData]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintActivities(mapRef.current, activitiesFgRef, activityPoints, { expanded: true }); }, [activityPoints]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0, borderRadius: 14, overflow: "hidden", border: `1px solid ${t.line}`, isolation: "isolate" }}>
      <div ref={boxRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />
      <MapLegend t={t} show={activityPoints.length > 0} />
      <LayerPanel t={t} geo={geo} canManage={canManage} style={{ position: "absolute", top: 14, right: 14, zIndex: 700, width: 280, maxHeight: "calc(100% - 28px)", overflowY: "auto" }} />
    </div>
  );
}
