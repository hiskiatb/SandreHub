"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
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
// Warna titik POSM - SAMA PERSIS dgn POSM_COLOR di mobile map
// (app/martahub/m/map/page.jsx) supaya konsisten lintas platform.
const POSM_COLOR = "#B32E85";
// Breakpoint responsif toolbar/legend/strip kartu peta (dashboard & full page).
const MAP_NARROW = 480;

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
// Kode administratif mentah (NO_PROV, Code_Uniqu, dst.) tidak berguna buat
// dibaca cepat saat hover - disembunyikan dari kartu, cukup tampil di popup
// "semua atribut" kalau nanti dibutuhkan (site sudah punya pola serupa).
const TERR_HIDE_RX = /^(no_|code_?uniqu|objectid|fid$|gid$|shape_)/i;
// Field bisnis yang paling relevan (dicek langsung dari DBF asli "Territory
// IOH...v2") - BRANCH/MC IOH/REGION lebih berguna buat tim daripada kode
// administratif BPS, jadi diprioritaskan tampil duluan kalau ada.
const TERR_PRIORITY_KEYS = ["KABKOT", "BRANCH", "MC IOH", "REGION", "AREA", "PROV"];
// Stabil per fitur - dipakai utk "mengingat" polygon mana yang sedang dipilih
// (klik) supaya sorotannya TETAP nempel walau datanya di-repaint (ganti
// filter/toggle layer). Code_Uniqu memang unik per baris di DBF aslinya.
function featKey(props) { return String((props && (props["Code_Uniqu"] ?? props["OBJECTID"] ?? props["FID"])) ?? JSON.stringify(props || {})); }

// Ringkasan wilayah utk panel kiri - HANYA field bisnis yang relevan
// (KABKOT/BRANCH/MC IOH/REGION/AREA/PROV), bukan lagi dump semua atribut
// mentah shapefile. Dipakai untuk cari field yang mana yang ADA di suatu
// feature (dipanggil dari komponen React TerritoryDetail, bukan string HTML
// lagi - supaya filter periode & jumlah site/activity/POSM bisa interaktif).
function territoryFields(props) {
  const title = featTitle(props);
  const titleKey = NAME_KEYS.find((k) => props[k] === title);
  return TERR_PRIORITY_KEYS.filter((k) => k !== titleKey && props[k] != null && props[k] !== "").map((k) => [k, props[k]]);
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
    // maxZoom dinaikkan (14→18) khusus supaya Map Intelligence penuh bisa
    // benar-benar zoom sampai level jalan - dibutuhkan utk cek kepadatan
    // site di sekitar satu titik sebelum bikin activity baru (permintaan
    // eksplisit: "jangan gimmick", peta harus bisa dipakai sungguhan).
    minZoom: 5, maxZoom: 18, maxBoundsViscosity: 1.0,
  });
  // maxBounds HANYA dikunci utk pratinjau kartu kecil di dashboard
  // (expanded=false) - Map Intelligence PENUH (expanded=true) sengaja TIDAK
  // dikunci ke Sumatera lagi, supaya peta bisa digeser/zoom bebas ke luar
  // (mis. sambil pakai pencarian alamat) - yang dibatasi ke Sumatera cuma
  // DATA yang ditampilkan (choropleth/titik), bukan area yang bisa dijelajah.
  if (!expanded) map.setMaxBounds(SUMATRA_BOUNDS);
  if (expanded) { map.fitBounds(SUMATRA_BOUNDS, { animate: false }); L.control.zoom({ position: "topright" }).addTo(map); }
  else map.setView([3.0, 98.9], 7);   // idle awal: Sumatera Utara (lokasi aktivitas)
  // Base map SELALU mulai "polos" (silhouette Sumatera abu-abu, bukan tile
  // jalan sungguhan) - tile OpenStreetMap/CARTO PENUH baru dipasang belakangan
  // lewat efek `mapStyle` di MapFull, HANYA saat user aktifkan tombol "Peta
  // Detail" (yang sendirinya hanya aktif kalau ada pin pencarian alamat) -
  // supaya tampilan awal & "Peta Sederhana" tetap ringan, tanpa request tile
  // jaringan yang tidak perlu.
  map.getContainer().style.background = dark ? "#1B2130" : "#E4E8EE";
  if (expanded) L.control.attribution({ position: "bottomright", prefix: false }).addTo(map);
  // invalidateSize DI-DEBOUNCE lewat 1 rAF berjalan (bukan ditumpuk 6x
  // setTimeout + ResizeObserver + IntersectionObserver semuanya memanggil
  // langsung) - sebelumnya saat modal di-resize (drag native), ResizeObserver
  // menembak puluhan event/detik dan tiap satu langsung invalidateSize+redraw
  // tile → inilah sumber "ngeglitch"/berat. Sekarang berapa pun event yang
  // masuk dalam 1 frame cuma menghasilkan SATU invalidateSize.
  let invalPending = false;
  const inval = () => {
    if (invalPending) return;
    invalPending = true;
    requestAnimationFrame(() => {
      invalPending = false;
      try { if (map._container && map._container.isConnected) map.invalidateSize({ animate: false }); } catch { /* removed */ }
    });
  };
  [80, 350, 900].forEach((ms) => setTimeout(inval, ms));
  // Recalibrate saat ukuran kontainer berubah…
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(inval);
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
// Ray-casting point-in-polygon sederhana (dipakai hit-test hover/klik
// kecamatan level MAP - lihat catatan di paintOverlays: pendekatan ini
// dipilih supaya hover/klik kecamatan TIDAK tergantung pada tumpukan
// (z-order) canvas renderer lain, mis. layer Site di atasnya).
function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const hit = (yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
function pointInGeometry(pt, geom) {
  for (const ring of outerRings(geom)) if (pointInRing(pt, ring)) return true;
  return false;
}
// Titik tengah kasar (rata-rata titik ring terluar TERBESAR, bukan centroid
// poligon presisi) - cukup akurat utk flyTo & posisi saran pencarian, tanpa
// perlu memuat Leaflet secara async.
function featureCentroid(geom) {
  const rings = outerRings(geom);
  if (!rings.length) return null;
  let best = rings[0];
  for (const r of rings) if (r.length > best.length) best = r;
  let x = 0, y = 0;
  for (const [lng, lat] of best) { x += lng; y += lat; }
  return { lat: y / best.length, lng: x / best.length };
}
async function paintOverlays(map, fgRef, layers, { expanded, appBg, featureFilter = null, selectedKeyRef = null, onSelectTerritory = null, interactiveAll = false }) {
  if (!map || !map._container) return;
  const L = (await import("leaflet")).default;
  if (fgRef.current) { try { map.removeLayer(fgRef.current); } catch { /* noop */ } fgRef.current = null; }
  const visible = (layers || []).filter((l) => l.visible !== false && l.geojson?.features?.length);
  if (!visible.length) return;
  const fg = L.featureGroup();
  // featureFilter (opsional) = predikat (props) => boolean, dari filter
  // Region/Branch/MC di halaman Map Intelligence - DIPAKAI LANGSUNG ke field
  // asli shapefile-nya sendiri (BRANCH/MC IOH/REGION). Kecamatan di luar
  // filter diredupkan NYARIS HILANG (bukan dihapus - supaya mask "lubang
  // Sumatera" tetap utuh & tidak bolong putih) sesuai permintaan "hilangkan
  // yang tidak dipilih".
  const baseStyle = (f, catKey) => {
    // interactive:false SENGAJA - deteksi hover/klik kecamatan TIDAK lagi
    // dipercayakan ke hit-test bawaan canvas renderer poligon ini sendiri
    // (lihat catatan besar di bawah soal kenapa), jadi layer ini murni utk
    // MENGGAMBAR saja; mouse-nya ditangani lewat listener level MAP.
    const base = { color: "#ffffff", weight: expanded ? 0.5 : 0.3, opacity: 0.55, fillColor: choroColor(f, catKey), fillOpacity: expanded ? 0.55 : 0.42, interactive: false };
    return featureFilter && !featureFilter(f.properties || {}) ? { ...base, opacity: 0.04, fillOpacity: 0.025 } : base;
  };
  const HOVER_STYLE = (base) => ({ ...base, weight: 2.6, color: "#C6168D", fillOpacity: Math.min(0.85, base.fillOpacity + 0.28) });
  const SELECTED_STYLE = (base) => ({ ...base, weight: 3.2, color: "#0D1117", fillOpacity: Math.min(0.92, base.fillOpacity + 0.35) });
  // Dulu tiap kecamatan bind Leaflet tooltip (kotak mengambang saat hover) -
  // ini sumber "ngeglitch"/delay yang dikeluhkan (fade-out tooltip lama
  // vs mouse pindah cepat ke poligon sebelah = tabrakan/lag). Sekarang hover
  // CUMA highlight border (murah, instan, tanpa DOM tooltip sama sekali).
  // Detail lengkap pindah ke KLIK → panel kiri (persist sampai diklik lagi/
  // ditutup) via onSelectTerritory + selectedKeyRef.
  const layerByKey = new Map();

  // Label ringan saat hover - dibuat sebagai SATU elemen DOM manual (bukan
  // L.Tooltip bawaan Leaflet) yang diposisikan ulang lewat mousemove. Dicoba
  // pakai bindTooltip() bawaan dulu tapi ternyata tidak konsisten muncul di
  // atas canvas renderer - jadi diganti pendekatan manual ini: lebih
  // predictable, instan (posisi via style langsung, tanpa animasi Leaflet).
  if (!map._mhHoverLabel) {
    const el = document.createElement("div");
    el.className = "mh-hover-lite";
    el.style.cssText = "position:absolute;z-index:660;pointer-events:none;display:none;transform:translate(-50%,-130%);white-space:nowrap;";
    map.getContainer().appendChild(el);
    map._mhHoverLabel = el;
  }
  const hoverEl = map._mhHoverLabel;
  const showHoverLabel = (latlng, text) => {
    hoverEl.textContent = text;
    hoverEl.style.display = "block";
    const pt = map.latLngToContainerPoint(latlng);
    hoverEl.style.left = `${pt.x}px`;
    hoverEl.style.top = `${pt.y}px`;
  };
  const hideHoverLabel = () => { hoverEl.style.display = "none"; };

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

  // Daftar fitur yang bisa di-hover/klik, dipakai hit-test manual level MAP
  // (bukan lewat event bawaan tiap layer canvas) - lihat catatan di bawah.
  const interactive = [];
  const choros = [];
  visible.forEach((l) => {
    const catKey = detectCatKey(l.geojson.features);
    const gj = L.geoJSON(l.geojson, {
      renderer: L.canvas({ padding: 0.3 }),
      style: (f) => baseStyle(f, catKey),
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 3, color: "#fff", weight: 0.8, fillColor: choroColor(f, catKey), fillOpacity: 0.85 }),
      onEachFeature: (f, layer) => {
        const fKey = featKey(f.properties || {});
        const base = baseStyle(f, catKey);
        // interactiveAll (mode fokus SATU kecamatan) = kecamatan lain tetap
        // bisa di-hover/klik meski diredupkan, supaya user bisa langsung
        // "berpindah" fokus dari satu kecamatan ke kecamatan lain lewat
        // hover/klik langsung - tidak perlu tutup panel dulu. Filter Region/
        // Branch/MC biasa TETAP mematikan interaktivitas yang tidak cocok
        // (perilaku lama, sengaja beda dari mode fokus).
        const isFiltered = !interactiveAll && featureFilter && !featureFilter(f.properties || {});
        layerByKey.set(fKey, { layer, base });
        if (selectedKeyRef && selectedKeyRef.current === fKey) { try { layer.setStyle(SELECTED_STYLE(base)); layer.bringToFront?.(); } catch { /* noop */ } }
        if (expanded && !isFiltered) {
          interactive.push({ fKey, base, layer, feature: f, bounds: layer.getBounds?.() });
        }
      },
    });
    fg.addLayer(gj);
    choros.push(gj);
  });
  fg.addTo(map);
  fgRef.current = fg;

  // ── Hit-test hover/klik kecamatan level MAP (bukan level layer) ────────────
  // Poligon wilayah digambar interactive:false karena canvas renderer-nya
  // BUKAN yang paling atas begitu layer Site aktif (Site di pane zIndex 640,
  // wilayah di overlayPane default ~400) - canvas Site menutupi SELURUH area
  // peta (bukan cuma di titiknya) sehingga event mouse ke canvas wilayah di
  // bawahnya tidak pernah sampai sama sekali. Ini akar masalah "hover/klik
  // kecamatan hilang begitu file site dikoneksikan". Solusinya: pindahkan
  // deteksi ke listener MAP-LEVEL (mousemove/click pada objek map, yang
  // selalu menerima event native lewat bubbling DOM apa pun canvas yang
  // menerimanya duluan - KECUALI kalau memang tepat kena marker site, yang
  // sengaja stop-propagation krn markernya sendiri interactive) + ray-casting
  // manual (pointInGeometry) utk menentukan kecamatan mana yang tertimpa.
  if (map._mhTerrMove) map.off("mousemove", map._mhTerrMove);
  if (map._mhTerrClick) map.off("click", map._mhTerrClick);
  let hoveredKey = null;
  const findHit = (latlng) => {
    const pt = [latlng.lng, latlng.lat];
    for (const it of interactive) {
      if (it.bounds && !it.bounds.contains(latlng)) continue;
      if (pointInGeometry(pt, it.feature.geometry)) return it;
    }
    return null;
  };
  const onMove = (e) => {
    const hit = findHit(e.latlng);
    const newKey = hit ? hit.fKey : null;
    if (newKey !== hoveredKey) {
      if (hoveredKey) { const prev = interactive.find((x) => x.fKey === hoveredKey); if (prev && selectedKeyRef?.current !== hoveredKey) { try { prev.layer.setStyle(prev.base); } catch { /* noop */ } } }
      if (hit && selectedKeyRef?.current !== newKey) { try { hit.layer.setStyle(HOVER_STYLE(hit.base)); hit.layer.bringToFront?.(); } catch { /* noop */ } }
      hoveredKey = newKey;
    }
    // Kecamatan yang SEDANG dipilih/difokuskan tidak perlu label hover lagi -
    // panel kiri sudah menampilkan namanya, dan di dalam kecamatan itu ada
    // kartu hover Site sendiri; kalau label kecamatan tetap muncul juga,
    // keduanya numpuk/dobel di layar (persis yang dikeluhkan). Kecamatan LAIN
    // (belum dipilih) tetap dapat label seperti biasa.
    if (hit && selectedKeyRef?.current === hit.fKey) hideHoverLabel();
    else if (hit) showHoverLabel(e.latlng, featTitle(hit.feature.properties || {}));
    else hideHoverLabel();
  };
  const onClick = (e) => {
    const hit = findHit(e.latlng);
    if (!hit) return;
    const prevKey = selectedKeyRef?.current;
    if (selectedKeyRef) selectedKeyRef.current = hit.fKey;
    if (prevKey && prevKey !== hit.fKey) { const prev = layerByKey.get(prevKey); if (prev) { try { prev.layer.setStyle(prev.base); } catch { /* noop */ } } }
    try { hit.layer.setStyle(SELECTED_STYLE(hit.base)); hit.layer.bringToFront?.(); } catch { /* noop */ }
    onSelectTerritory?.(hit.feature);
  };
  map.on("mousemove", onMove);
  map.on("click", onClick);
  map._mhTerrMove = onMove;
  map._mhTerrClick = onClick;

  // Fit HANYA ke wilayah (bukan mask dunia) agar tidak bentrok dengan maxBounds -
  // SEKALI SAJA per instance peta (map._mhFitted). Dulu ini jalan di SETIAP
  // repaint (termasuk saat sekadar klik pilih/batal kecamatan), jadi zoom yang
  // sudah difokuskan user (mis. lewat klik kecamatan / pencarian) selalu
  // "kereset" balik ke tampilan Sumatera penuh - itu akar keluhan "zoom-nya
  // tereset". Navigasi zoom SETELAHNYA sepenuhnya diserahkan ke flyTo/isolasi.
  if (expanded && !map._mhFitted) {
    try {
      let b = null;
      choros.forEach((g) => { try { const gb = g.getBounds(); if (gb && gb.isValid()) b = b ? b.extend(gb) : gb; } catch { /* noop */ } });
      if (b && b.isValid()) { map.fitBounds(b, { padding: [26, 26], animate: false }); map._mhFitted = true; }
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
  // Pratinjau dashboard (!expanded) SENGAJA dirender pakai titik canvas kecil
  // & polos (bukan marker DOM ber-cincin/tooltip) - datanya bisa ratusan-ribuan
  // titik yang saling berdekatan, jadi versi DOM yang lebih besar terlihat
  // menumpuk jadi gumpalan besar & berat. Canvas dot kecil tetap jelas
  // menunjukkan sebaran tanpa terasa "kotor"/dominan. Versi Map Intelligence
  // penuh (expanded) tetap pakai gaya lama (dot+cincin+tooltip) karena
  // datanya sudah tersaring per kecamatan/filter sehingga jauh lebih jarang.
  // Titik tipis (canvas, tanpa cincin/tooltip) dipakai baik di pratinjau
  // dashboard MAUPUN di Map Intelligence penuh saat titiknya masih SANGAT
  // BANYAK (mis. tampilan seluruh Sumatera, belum difokus ke satu
  // kecamatan) - gaya dot+cincin+tooltip yang lebih besar cuma dipakai kalau
  // datanya sudah tersaring jadi sedikit, supaya tidak
  // menumpuk jadi gumpalan "kotor" & berat spt sebelumnya.
  if (!expanded) {
    // Pratinjau dashboard (kartu kecil) - tetap titik canvas tipis & polos,
    // BUKAN target keluhan lag (peta ini kecil & bukan interaktif penuh).
    const renderer = L.canvas({ padding: 0.4, pane: "activityPane" });
    const pst = pointStyleForZoom(map.getZoom());
    points.forEach((p) => {
      const c = p.color || ACTIVITY_STATUS_COLOR[p.statusKey] || "#455A64";
      L.circleMarker([p.lat, p.lng], { renderer, pane: "activityPane", radius: pst.radius, weight: 0, fillColor: c, fillOpacity: pst.fillOpacity }).addTo(grp);
    });
    grp.addTo(map);
    ref.current = grp;
    return;
  }
  // Map Intelligence penuh - SELALU ikon (dot+cincin), tidak pernah titik
  // polos, tapi jumlah marker DOM dibatasi via clustering ruang-layar
  // (sama persis pola paintSites di atas) supaya tetap smooth walau
  // titiknya ribuan.
  const sz = 15;
  const dot = Math.max(4, Math.round(sz * 0.34));
  const iconFor = (c) => L.divIcon({
    className: "", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
    html: `<div style="position:relative;width:${sz}px;height:${sz}px">` +
      `<div style="position:absolute;inset:0;border-radius:50%;background:${c}1F;border:1.4px solid ${c}80"></div>` +
      `<div style="position:absolute;top:50%;left:50%;width:${dot}px;height:${dot}px;margin:${-dot / 2}px 0 0 ${-dot / 2}px;border-radius:50%;background:${c};box-shadow:0 0 0 1.6px #fff,0 1px 3px rgba(0,0,0,.35)"></div>` +
      `</div>`,
  });
  let markerLayer = null;
  const render = () => {
    if (markerLayer) { try { grp.removeLayer(markerLayer); } catch { /* noop */ } markerLayer = null; }
    const cellPx = Math.max(34, sz * 1.9);
    const clusters = clusterByScreen(L, map, points, cellPx);
    const g = L.layerGroup();
    clusters.forEach((cl) => {
      if (cl.count === 1) {
        const p = cl.items[0];
        const c = p.color || ACTIVITY_STATUS_COLOR[p.statusKey] || "#455A64";
        const m = L.marker([p.lat, p.lng], { icon: iconFor(c), pane: "activityPane" });
        const label = [esc(p.name || "Activity"), p.branch, p.status].filter(Boolean).join(" · ");
        m.bindTooltip(label, { direction: "top", offset: [0, -sz / 2] });
        g.addLayer(m);
      } else {
        const bubble = clusterBubbleHtml(cl.count, "#455A64");
        const m = L.marker([cl.lat, cl.lng], {
          pane: "activityPane", keyboard: false,
          icon: L.divIcon({ className: "mh-point-cluster", html: bubble.html, iconSize: [bubble.size, bubble.size], iconAnchor: [bubble.size / 2, bubble.size / 2] }),
        });
        m.on("click", () => {
          try {
            const bounds = L.latLngBounds(cl.items.map((p) => [p.lat, p.lng]));
            map.flyToBounds(bounds, { padding: [60, 60], maxZoom: Math.min(18, map.getZoom() + 4), duration: 0.6 });
          } catch { /* noop */ }
        });
        g.addLayer(m);
      }
    });
    grp.addLayer(g);
    markerLayer = g;
  };
  grp.addTo(map);
  ref.current = grp;
  render();
  if (map._mhActivityZoom) { map.off("zoomend", map._mhActivityZoom); map._mhActivityZoom = null; }
  map._mhActivityZoom = render;
  map.on("zoomend", render);
}

// ── Titik POSM - lokasi instalasi materi POSM (mh_md_installations,
// latitude/longitude) ────────────────────────────────────────────────────────
// Dioper dari luar via prop `posmPoints` (page.jsx query mh_md_installations
// terscope TMV lewat applyMartaScopeSlug, KARENA branch_id-nya slug text -
// beda dgn mh_activities yang uuid, lihat catatan di lib/martaScope.js) -
// komponen ini murni render, sama pola dgn paintActivities di atas.
async function paintPosm(map, ref, points, { expanded } = {}) {
  if (!map || !map._container) return;
  const L = (await import("leaflet")).default;
  if (ref.current) { try { map.removeLayer(ref.current); } catch { /* noop */ } ref.current = null; }
  if (!points || !points.length) return;
  if (!map.getPane("posmPane")) { map.createPane("posmPane"); map.getPane("posmPane").style.zIndex = 655; }
  const grp = L.layerGroup();
  // Pratinjau dashboard: canvas dot kecil polos, sama alasannya dgn Activity
  // di atas - hindari gumpalan besar & berat saat titiknya sangat banyak.
  // Sama alasannya dgn Activity di atas - fallback ke titik tipis kalau
  // datanya masih banyak, bukan cuma di pratinjau dashboard saja.
  if (!expanded) {
    // Pratinjau dashboard - sama alasannya dgn Activity di atas.
    const renderer = L.canvas({ padding: 0.4, pane: "posmPane" });
    const pst = pointStyleForZoom(map.getZoom());
    points.forEach((p) => {
      L.circleMarker([p.lat, p.lng], { renderer, pane: "posmPane", radius: pst.radius, weight: 0, fillColor: POSM_COLOR, fillOpacity: pst.fillOpacity }).addTo(grp);
    });
    grp.addTo(map);
    ref.current = grp;
    return;
  }
  // Map Intelligence penuh - SELALU ikon wajik (diamond), diclustering sama
  // spt Activity/Site di atas.
  const sz = 14;
  const dot = Math.max(4, Math.round(sz * 0.4));
  const c = POSM_COLOR;
  const icon = L.divIcon({
    className: "", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
    html: `<div style="position:relative;width:${sz}px;height:${sz}px;transform:rotate(45deg)">` +
      `<div style="position:absolute;inset:0;border-radius:3px;background:${c}22;border:1.4px solid ${c}85"></div>` +
      `<div style="position:absolute;top:50%;left:50%;width:${dot}px;height:${dot}px;margin:${-dot / 2}px 0 0 ${-dot / 2}px;border-radius:1.5px;background:${c};box-shadow:0 0 0 1.6px #fff,0 1px 3px rgba(0,0,0,.35)"></div>` +
      `</div>`,
  });
  let markerLayer = null;
  const render = () => {
    if (markerLayer) { try { grp.removeLayer(markerLayer); } catch { /* noop */ } markerLayer = null; }
    const cellPx = Math.max(32, sz * 1.9);
    const clusters = clusterByScreen(L, map, points, cellPx);
    const g = L.layerGroup();
    clusters.forEach((cl) => {
      if (cl.count === 1) {
        const p = cl.items[0];
        const m = L.marker([p.lat, p.lng], { icon, pane: "posmPane" });
        const label = [esc(p.name || "Instalasi POSM"), p.branch, p.mode].filter(Boolean).join(" · ");
        m.bindTooltip(label, { direction: "top", offset: [0, -sz / 2] });
        g.addLayer(m);
      } else {
        const bubble = clusterBubbleHtml(cl.count, POSM_COLOR);
        const m = L.marker([cl.lat, cl.lng], {
          pane: "posmPane", keyboard: false,
          icon: L.divIcon({ className: "mh-point-cluster", html: bubble.html, iconSize: [bubble.size, bubble.size], iconAnchor: [bubble.size / 2, bubble.size / 2] }),
        });
        m.on("click", () => {
          try {
            const bounds = L.latLngBounds(cl.items.map((p) => [p.lat, p.lng]));
            map.flyToBounds(bounds, { padding: [60, 60], maxZoom: Math.min(18, map.getZoom() + 4), duration: 0.6 });
          } catch { /* noop */ }
        });
        g.addLayer(m);
      }
    });
    grp.addLayer(g);
    markerLayer = g;
  };
  grp.addTo(map);
  ref.current = grp;
  render();
  if (map._mhPosmZoom) { map.off("zoomend", map._mhPosmZoom); map._mhPosmZoom = null; }
  map._mhPosmZoom = render;
  map.on("zoomend", render);
}

// ── "Lokasi Saya" - tombol locate, gaya titik biru ala Google Maps (dot +
// lingkaran akurasi berdenyut). Murni client-side (navigator.geolocation),
// tidak menyentuh server. Dipakai di toolbar kartu, halaman penuh, maupun
// modal expanded - satu fungsi render + satu fungsi locate dipakai bersama.
const MY_LOC_COLOR = "#1A73E8";
async function paintMyLocation(map, ref, lat, lng, accuracy) {
  if (!map || !map._container) return;
  const L = (await import("leaflet")).default;
  if (ref.current) { try { map.removeLayer(ref.current); } catch { /* noop */ } ref.current = null; }
  if (!map.getPane("myLocPane")) { map.createPane("myLocPane"); map.getPane("myLocPane").style.zIndex = 670; }
  const grp = L.layerGroup();
  if (accuracy && accuracy > 30) {
    grp.addLayer(L.circle([lat, lng], { pane: "myLocPane", radius: accuracy, color: MY_LOC_COLOR, weight: 1, opacity: 0.35, fillColor: MY_LOC_COLOR, fillOpacity: 0.09, interactive: false }));
  }
  const icon = L.divIcon({
    className: "", iconSize: [18, 18], iconAnchor: [9, 9],
    html: `<div style="position:relative;width:18px;height:18px">
      <div class="mh-myloc-pulse" style="position:absolute;inset:0;border-radius:50%;background:${MY_LOC_COLOR}"></div>
      <div style="position:absolute;top:50%;left:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:${MY_LOC_COLOR};border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
    </div>`,
  });
  grp.addLayer(L.marker([lat, lng], { icon, pane: "myLocPane", zIndexOffset: 1000 }).bindTooltip("Lokasi Anda", { direction: "top", offset: [0, -10] }));
  grp.addTo(map);
  ref.current = grp;
}
// Minta posisi browser lalu terbang ke sana + gambar titiknya. `setState`
// dipakai pemanggil utk kelola status tombol (locating/error) di UI.
function locateMe(map, ref, setState) {
  if (!map) return;
  if (!navigator.geolocation) { setState({ busy: false, err: "Perangkat/browser tidak mendukung geolokasi." }); return; }
  setState({ busy: true, err: "" });
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      await paintMyLocation(map, ref, latitude, longitude, accuracy);
      map.flyTo([latitude, longitude], Math.max(map.getZoom(), 14), { animate: true, duration: 0.8 });
      setState({ busy: false, err: "" });
    },
    (err) => {
      const msg = err.code === 1 ? "Izin lokasi ditolak - aktifkan lewat pengaturan browser." : "Gagal mengambil lokasi. Coba lagi.";
      setState({ busy: false, err: msg });
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
  );
}

// ── Site (titik) ──────────────────────────────────────────────────────────────
// Diganti dari pink/magenta (#EC008C) ke teal - supaya tidak bentrok secara
// visual dgn warna Activity (merah/oranye/hijau/biru) maupun POSM (magenta).
const SITE_COLOR = "#0E9488";

// Ikon menara BTS (network tower) - dipakai utk titik Site saat JUMLAHNYA
// SEDIKIT (lihat SITE_ICON_MAX di paintSites) - mis. saat satu kecamatan
// difokuskan, yang justru paling butuh ikon jelas/besar. Bulatan latar di
// belakang menara supaya tetap kebaca di atas warna apa pun. SENGAJA TIDAK
// pakai CSS `filter: drop-shadow` (mahal di-render per-elemen DOM, jadi
// sumber lag utama saat titiknya banyak) - dropbayangnya sudah "dibakar"
// langsung ke dalam SVG (elemen <circle> semi-transparan sedikit offset),
// jauh lebih murah karena SVG-nya sendiri statis (tidak perlu filter pass).
// Vektor menara sinyal dari SVG Repo (viewBox 0 0 32x32, sudah didesain
// terpusat di kotak itu sendiri) - path SOLID (fill), diwarnai lewat fill.
const SITE_TOWER_PATHS = [
  "M26.7,2.3c-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4c3.5,3.5,3.5,9.1,0,12.6c-0.4,0.4-0.4,1,0,1.4c0.2,0.2,0.5,0.3,0.7,0.3\n\t\ts0.5-0.1,0.7-0.3C31,13.5,31,6.5,26.7,2.3z",
  "M22,12.6c-0.4,0.4-0.4,1,0,1.4c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c1.1-1.1,1.7-2.5,1.6-4.1c0-1.5-0.7-3-1.8-4.1\n\t\tc-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4C23.3,8.7,23.4,11.2,22,12.6z",
  "M6.7,16.3c-3.5-3.5-3.5-9.1,0-12.6c0.4-0.4,0.4-1,0-1.4s-1-0.4-1.4,0C1,6.5,1,13.5,5.3,17.7C5.5,17.9,5.7,18,6,18\n\t\ts0.5-0.1,0.7-0.3C7.1,17.3,7.1,16.7,6.7,16.3z",
  "M8.8,14.2c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c0.4-0.4,0.4-1,0-1.4c-1.5-1.5-1.6-4-0.2-5.4c0.4-0.4,0.4-1,0-1.4\n\t\tS9,5.6,8.6,6C7.5,7.1,7,8.5,7,10.1C7,11.6,7.7,13.1,8.8,14.2z",
  "M24,28h-2.2l-4-15.6C18.5,11.9,19,11,19,10c0-1.7-1.3-3-3-3s-3,1.3-3,3c0,1,0.5,1.9,1.3,2.4l-4,15.6H8c-0.6,0-1,0.4-1,1\n\t\ts0.4,1,1,1h16c0.6,0,1-0.4,1-1S24.6,28,24,28z M17.6,20h-3.3l1.6-6.3L17.6,20z M13.9,22c0,0,0.1,0,0.1,0h4c0.1,0,0.1,0,0.1,0l1.6,6\n\t\th-7.4L13.9,22z",
];
function siteTowerIconHtml(size, color, selected) {
  // Belum dipilih: lingkaran putih, ikon teal. Sudah dipilih/diklik:
  // dibalik - lingkaran teal PENUH, ikon putih - supaya beda status
  // "terpilih"-nya langsung kebaca sekali lihat (bukan cuma cincin gelap).
  const ring = selected ? color : "#ffffff";
  const iconColor = selected ? "#ffffff" : color;
  const ringW = selected ? 3 : 8;
  // Ikonnya sendiri didesain di kotak 32x32 - dibungkus di dalam bulatan
  // latar 56x56 (offset +12 di tiap sisi, bukan cuma +4) supaya ada
  // whitespace yang jelas kelihatan antara ikon & tepi lingkaran, bukan
  // mepet, sekaligus tetap center sempurna di semua arah.
  return `<svg viewBox="0 0 56 56" width="${size}" height="${size}">
      <circle cx="28" cy="29.5" r="27" fill="rgba(13,17,23,.28)"/>
      <circle cx="28" cy="28" r="27" fill="${ring}" stroke="${selected ? "#0D1117" : color}" stroke-width="${ringW / 3.9}"/>
      <g transform="translate(12,12)" fill="${iconColor}">
        ${SITE_TOWER_PATHS.map((d) => `<path d="${d}"/>`).join("")}
      </g>
    </svg>`;
}
// Ukuran ikon/titik menyesuaikan zoom: tetap kebaca (tidak mini) bahkan saat
// jauh, dan jelas besar saat dekat/fokus satu kecamatan (permintaan eksplisit:
// "pastikan tidak terlalu kecil ikonnya" saat kecamatan difokuskan).
// `radius` dipakai jalur ringan (canvas dot, banyak titik), `size` dipakai
// jalur ikon menara (DOM, sedikit titik) - lihat SITE_ICON_MAX di paintSites.
// Style titik tipis (dot canvas) utk Activity/POSM - dipakai jalur !expanded
// MAUPUN jalur "titiknya sangat banyak" di Map Intelligence penuh (lihat
// clusterByScreen). Mengecil lagi khusus zoom rendah (tampilan seluruh
// Sumatera) karena di situ titiknya paling padat/berhimpitan sepanjang
// jalan - kalau radiusnya sama dgn zoom dekat, jadi kelihatan menggumpal
// tebal walau technically sudah "tipis". Tanpa stroke (weight 0) supaya
// tidak ada halo putih yg ikut menebalkan tampilan saat banyak titik
// saling menempel.
function pointStyleForZoom(z) {
  if (z <= 6)  return { radius: 1.5, fillOpacity: 0.7 };
  if (z <= 7)  return { radius: 1.8, fillOpacity: 0.75 };
  if (z <= 8)  return { radius: 2.2, fillOpacity: 0.82 };
  if (z <= 9)  return { radius: 2.6, fillOpacity: 0.87 };
  return { radius: 3.2, fillOpacity: 0.92 };
}

function siteStyleForZoom(z) {
  // Radius zoom-rendah (seluruh Sumatera, titik paling padat/berhimpitan
  // sepanjang jalan) diperkecil lagi supaya tidak menggumpal tebal saat
  // pertama kali buka Map Intelligence - langsung rapi dari awal, bukan
  // cuma setelah difokuskan ke satu kecamatan.
  if (z <= 6)  return { size: 15, radius: 1.6, weight: 0,   fillOpacity: 0.7 };
  if (z <= 7)  return { size: 17, radius: 2,   weight: 0,   fillOpacity: 0.75 };
  if (z <= 8)  return { size: 19, radius: 2.6, weight: 0,   fillOpacity: 0.82 };
  if (z <= 9)  return { size: 22, radius: 3.4, weight: 0.4, fillOpacity: 0.9 };
  if (z <= 11) return { size: 27, radius: 4.6, weight: 0.6, fillOpacity: 0.95 };
  return { size: 34, radius: 6.4, weight: 0.8, fillOpacity: 1 };
}
const rp = (v) => (v == null || v === "" || isNaN(+v)) ? null : "Rp " + Number(v).toLocaleString("id-ID");
// Kolom "CATEGORY (Month'YY)" di file List Site ganti nama tiap bulan (June,
// July, dst.) - dulu di-hardcode ke bulan tertentu sehingga berhenti cocok
// begitu file bulan berikutnya diupload (site kelihatan "polos" tanpa
// kategori). Sekarang dicari lewat regex, ikut bulan apa pun yang aktif.
function pickCategory(p) {
  if (!p) return null;
  if (p["CATEGORY"] != null && p["CATEGORY"] !== "") return p["CATEGORY"];
  const k = Object.keys(p).find((x) => /^category\s*\(/i.test(x));
  return k ? p[k] : null;
}

// Warna badge Traffic Category - makin "ramai" makin hijau, makin "sepi"
// makin merah, supaya sekali lihat langsung kebaca tanpa perlu baca teksnya.
function trafficTone(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("very high") || s.includes("sangat tinggi")) return { c: "#0F7B3D", bg: "#E3F5EA" };
  if (s.includes("high") || s.includes("tinggi"))            return { c: "#2E7D32", bg: "#EAF6EC" };
  if (s.includes("medium") || s.includes("sedang"))          return { c: "#B7791F", bg: "#FDF3DC" };
  if (s.includes("very low") || s.includes("sangat rendah")) return { c: "#B91C1C", bg: "#FBE7E7" };
  if (s.includes("low") || s.includes("rendah"))              return { c: "#C2410C", bg: "#FDECE1" };
  return { c: "#4A5568", bg: "#EEF1F6" };
}
// Ikon pin kecil dipakai di header popup site (SATU sumber SVG - dipakai
// baik view ringkas maupun full, supaya identitas visual popup konsisten).
const SITE_PIN_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.6 7-12A7 7 0 0 0 5 10c0 5.4 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/></svg>`;

function siteHeaderHtml(s, { withBack = false } = {}) {
  const id = s.id ? String(s.id) : null;
  return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:14px 44px 12px 16px;border-bottom:1px solid rgba(13,17,23,.07)">
      ${withBack
        ? `<button class="mh-site-back" title="Kembali" style="width:30px;height:30px;flex-shrink:0;border:none;border-radius:9px;background:#EEF1F6;color:#4A5568;display:flex;align-items:center;justify-content:center;cursor:pointer">
             <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
           </button>`
        : `<div style="width:32px;height:32px;flex-shrink:0;border-radius:10px;background:linear-gradient(135deg,${SITE_COLOR},#0B6E64);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 9px ${SITE_COLOR}55">${SITE_PIN_SVG}</div>`}
      <div style="min-width:0;flex:1">
        <div class="mh-row-val" title="${esc(s.name || id || "Site")}" style="font-weight:800;font-size:13.5px;color:#0D1117;line-height:1.3;text-align:left">${esc(s.name || id || "Site")}</div>
        ${id ? `<div style="margin-top:3px;display:inline-block;max-width:100%;font-size:10px;font-weight:700;color:#5A6B8C;background:#EEF1F6;border-radius:5px;padding:1.5px 6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.02em" class="mh-row-val">${esc(id)}</div>` : ""}
      </div>
    </div>`;
}

// Kunci identitas stabil per site (dipakai lacak pilihan yang "tertahan"
// lintas repaint - sama seperti featKey() untuk poligon wilayah).
function siteKey(s) {
  return String(s?.id || s?.name || JSON.stringify(s?.props || {}));
}

// Panel detail site UNTUK PANEL KIRI (bukan popup lagi) - gabungan ringkasan
// (branch/mc/category/tipe/traffic/target revenue) + SEMUA atribut mentah
// dalam SATU panel yang bisa discroll, tidak perlu tombol "lihat semua" /
// "kembali" bolak-balik lagi (root fix: popup lama gampang glitch krn ganti
// DOM tiap toggle ringkas↔full; panel kiri ini statis, cuma discroll).
// Kartu ringkas saat site di-HOVER (bukan panel lengkap - itu tetap lewat
// klik). Cukup Nama + Branch/MC/Category supaya langsung kebaca sekilas
// tanpa perlu klik dulu, tanpa membebani/nge-glitch (lihat catatan pemanggil).
function siteHoverHtml(s) {
  const p = s.props || {};
  const rows = [["Branch", p["BRANCH"]], ["MC", p["MC"]], ["Category", pickCategory(p)]]
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<div style="display:flex;gap:10px;justify-content:space-between;font-size:10.5px;padding:1.5px 0"><span style="color:#9AA7C2;font-weight:600">${esc(k)}</span><span style="color:#fff;font-weight:700">${esc(v)}</span></div>`)
    .join("");
  return `<div style="font-family:${FONT};min-width:130px">
    <div style="font-weight:800;font-size:11.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${esc(s.name || s.id || "Site")}</div>
    ${rows ? `<div style="margin-top:3px;padding-top:3px;border-top:1px solid rgba(255,255,255,.14)">${rows}</div>` : ""}
  </div>`;
}

function sitePanelHtml(s) {
  const p = s.props || {};
  const branch = p["BRANCH"], mc = p["MC"], tipe = p["Site Type"];
  const category = pickCategory(p);
  const traffic = p["Traffic Category"];
  const targetRev = rp(p["TARGET SITE REVENUE IOH"]);
  const tone = traffic ? trafficTone(traffic) : null;

  const plainRows = [["Branch", branch], ["MC", mc], ["Category", category]]
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v], i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;min-width:0;${i > 0 ? "border-top:1px solid rgba(13,17,23,.055)" : ""}">
        <span style="font-size:11px;color:#7B8BAD;font-weight:600;flex-shrink:0">${esc(k)}</span>
        <span class="mh-row-val" title="${esc(v)}" style="font-size:12px;font-weight:700;color:#0D1117;text-align:right;min-width:0;max-width:170px">${esc(v)}</span>
      </div>`).join("");

  const badgeRow = (tipe || traffic) ? `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;${plainRows ? "border-top:1px solid rgba(13,17,23,.055)" : ""}">
      <span style="font-size:11px;color:#7B8BAD;font-weight:600">Tipe · Traffic</span>
      <span style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end">
        ${tipe ? `<span style="font-size:9.5px;font-weight:800;letter-spacing:.02em;color:#3949AB;background:#E8EAF6;border-radius:99px;padding:2.5px 8px;white-space:nowrap">${esc(tipe)}</span>` : ""}
        ${traffic ? `<span style="font-size:9.5px;font-weight:800;letter-spacing:.02em;color:${tone.c};background:${tone.bg};border-radius:99px;padding:2.5px 8px;white-space:nowrap">${esc(traffic)}</span>` : ""}
      </span>
    </div>` : "";

  const revBlock = targetRev ? `
    <div style="margin-top:2px;padding-top:10px;border-top:1px solid rgba(13,17,23,.07);display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:11px;color:#7B8BAD;font-weight:600">Target Revenue</span>
      <span style="font-size:14px;font-weight:800;color:${SITE_COLOR};letter-spacing:-.01em">${esc(targetRev)}</span>
    </div>` : "";

  const entries = Object.entries(p).filter(([, v]) => v != null && v !== "");
  const rows = entries.map(([k, v], i) => `
    <div style="display:flex;gap:14px;justify-content:space-between;align-items:center;padding:7px 16px;min-width:0;${i % 2 === 1 ? "background:rgba(13,17,23,.025)" : ""}">
      <span style="font-size:10.5px;color:#7B8BAD;font-weight:600;flex-shrink:0">${esc(k)}</span>
      <span class="mh-row-val" title="${esc(v)}" style="font-size:11.5px;font-weight:700;color:#0D1117;text-align:right;min-width:0;max-width:190px">${esc(v)}</span>
    </div>`).join("");

  return `<div style="font-family:${FONT};padding:0 0 18px">
    ${siteHeaderHtml(s)}
    <div style="padding:6px 16px 2px">${plainRows}${badgeRow}${revBlock}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 16px 4px;margin-top:6px;border-top:1px solid rgba(13,17,23,.07)">
      <span style="font-size:9.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#7B8BAD">Semua Atribut</span>
      <span style="font-size:9.5px;font-weight:700;color:#7B8BAD">${entries.length} field</span>
    </div>
    <div style="padding-bottom:2px">${rows || `<div style="padding:14px 16px;font-size:11.5px;color:#7B8BAD">Tidak ada atribut.</div>`}</div>
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

// Ikon menara (DOM, L.divIcon) BAGUS secara visual tapi BERAT kalau ada
// ribuan sekaligus - tiap ikon = elemen DOM sendiri + reflow browser. Ini
// sumber lag parah yang dikeluhkan ("sangat berat, sangat ngelag"). User
// eksplisit minta: JANGAN PERNAH cuma titik polos, tetap pakai ikon (Site =
// menara, Activity/POSM = dot+cincin) walau di zoom rendah/seluruh Sumatera
// sekalipun. Solusinya BUKAN membatasi jumlah titik yang boleh pakai ikon
// (threshold lama, sudah dihapus), tapi CLUSTERING ruang-layar
// (clusterByScreen, lihat paintSites) - jumlah marker DOM yang benar-benar
// digambar selalu dibatasi oleh luas layar, bukan oleh banyaknya data.

// ── Clustering ruang-layar (screen-space) - pendekatan paling efisien utk
// "selalu tampil ikon, jangan pernah cuma titik" TANPA balik lag walau
// titiknya ribuan: dikelompokkan berdasarkan posisi PIKSEL (bukan lat/lng
// mentah) di zoom saat ini, jadi jumlah marker DOM yang benar-benar
// digambar selalu terbatas oleh luas layar ÷ ukuran sel (cellPx²), TIDAK
// pernah ikut membengkak walau data aslinya puluhan ribu titik. Makin
// zoom-in, sel makin "renggang" scr geografis → cluster otomatis pecah
// jadi makin kecil/individual - persis perilaku marker-cluster standar,
// tapi tanpa nambah library baru.
function clusterByScreen(L, map, arr, cellPx) {
  const buckets = new Map();
  for (const item of arr) {
    const px = map.project([item.lat, item.lng], map.getZoom());
    const gx = Math.round(px.x / cellPx), gy = Math.round(px.y / cellPx);
    const key = gx + "_" + gy;
    let b = buckets.get(key);
    if (!b) { b = { items: [], sx: 0, sy: 0 }; buckets.set(key, b); }
    b.items.push(item); b.sx += px.x; b.sy += px.y;
  }
  const out = [];
  for (const b of buckets.values()) {
    const n = b.items.length;
    const centerPx = L.point(b.sx / n, b.sy / n);
    const ll = map.unproject(centerPx, map.getZoom());
    out.push({ lat: ll.lat, lng: ll.lng, items: b.items, count: n });
  }
  return out;
}

// Bubble cluster (>1 titik dlm satu sel) - lingkaran warna solid + angka
// putih, ukurannya sedikit membesar mengikuti jumlah anggota (dibatasi biar
// tidak berlebihan). Klik → zoom masuk ke area cluster itu, yg otomatis
// memicu pecah jadi ikon individual/cluster lebih kecil begitu selesai zoom.
function clusterBubbleHtml(count, color) {
  const size = Math.max(30, Math.min(46, 26 + Math.log2(count) * 5));
  const fontSize = size >= 40 ? 13.5 : size >= 34 ? 12.5 : 11.5;
  return {
    size,
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;font-family:${FONT};font-weight:800;font-size:${fontSize}px;color:#fff">${count > 999 ? "999+" : count}</div>`,
  };
}

// ── Pin pencarian ALAMAT/JALAN (Nominatim) - draggable, label lat/lng-nya
// berubah LIVE saat digeser (tanpa perlu repaint React tiap frame - dipakai
// listener 'drag' murni utk update tooltip, baru laporkan balik posisi akhir
// ke React lewat 'dragend'), supaya bisa dipakai cek kepadatan site di
// sekitar SATU titik jalan sebelum bikin activity baru.
const ADDR_PIN_COLOR = "#5C6BC0";
function addressPinHtml() {
  return `<div style="width:30px;height:30px;transform:translate(-50%,-92%);filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35))">`
    + `<svg width="30" height="30" viewBox="0 0 24 24"><path d="M12 22s7.2-7.4 7.2-12.6A7.2 7.2 0 1 0 4.8 9.4C4.8 14.6 12 22 12 22z" fill="${ADDR_PIN_COLOR}" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="9.2" r="2.9" fill="#fff"/></svg>`
    + `</div>`;
}
async function paintAddressPoint(map, ref, point, onDrag) {
  if (!map || !map._container) return;
  if (ref.current) { try { map.removeLayer(ref.current); } catch { /* noop */ } ref.current = null; }
  if (!point || point.lat == null || point.lng == null) return;
  const L = (await import("leaflet")).default;
  const icon = L.divIcon({ className: "", html: addressPinHtml(), iconSize: [30, 30], iconAnchor: [15, 28] });
  const grp = L.layerGroup();
  const m = L.marker([point.lat, point.lng], { icon, draggable: true, keyboard: false, zIndexOffset: 3000 });
  const fmt = (lat, lng) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  m.bindTooltip(point.label || fmt(point.lat, point.lng), { permanent: true, direction: "top", offset: [0, -26], className: "mh-addr-tip" });
  m.on("drag", () => { const ll = m.getLatLng(); m.setTooltipContent(fmt(ll.lat, ll.lng)); });
  m.on("dragend", () => { const ll = m.getLatLng(); if (onDrag) onDrag({ lat: ll.lat, lng: ll.lng }); });
  grp.addLayer(m);
  grp.addTo(map);
  ref.current = grp;
}

// Klik titik site → panel kiri (bukan popup lagi, sama seperti kecamatan).
// Pilihan "tertahan" (persisten) lewat selectedIdRef, dipertahankan lintas
// repaint (filter/toggle layer) & lintas zoom (ukuran disesuaikan lagi).
async function paintSites(map, ref, siteArr, { outline = false, selectedIdRef = null, onSelectSite = null } = {}) {
  if (!map || !map._container) return;
  const L = (await import("leaflet")).default;
  if (ref.current) { try { map.removeLayer(ref.current); } catch { /* noop */ } ref.current = null; }
  if (!siteArr || !siteArr.length) return;
  if (!map.getPane("sitesPane")) { map.createPane("sitesPane"); map.getPane("sitesPane").style.zIndex = 640; }
  if (!map.getPane("siteOutlinePane")) { map.createPane("siteOutlinePane"); map.getPane("siteOutlinePane").style.zIndex = 635; }
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
  // Selalu render IKON menara, tidak pernah titik polos - tapi jumlah
  // marker DOM yg benar-benar digambar dibatasi lewat clustering ruang-
  // layar (clusterByScreen) di atas, bukan lewat threshold "banyak → jadi
  // titik" yang lama. Klik cluster (>1 titik dlm satu sel) → zoom masuk,
  // yg otomatis memecahnya jadi ikon individual saat sudah cukup renggang.
  const iconFor = (size, sel) => L.divIcon({
    className: "mh-site-tower-icon", html: siteTowerIconHtml(size, SITE_COLOR, sel),
    iconSize: [size, size], iconAnchor: [size / 2, size / 2],
  });
  // `grp` (dibuat di atas, sudah berisi outline hull kalau ada) TETAP jadi
  // ref.current sepanjang umur pemanggilan ini - supaya pemanggilan
  // paintSites berikutnya (data berubah) bisa membersihkan semuanya
  // (outline + marker) sekali jalan lewat map.removeLayer(ref.current) di
  // baris paling atas fungsi ini. render() (dipicu awal & tiap zoomend)
  // HANYA menukar sub-layer marker di dalam grp, tidak menyentuh outline.
  grp.addTo(map);
  ref.current = grp;
  let markerLayer = null;
  const render = () => {
    if (markerLayer) { try { grp.removeLayer(markerLayer); } catch { /* noop */ } markerLayer = null; }
    const st = siteStyleForZoom(map.getZoom());
    const cellPx = Math.max(40, st.size * 1.7);
    const clusters = clusterByScreen(L, map, siteArr, cellPx);
    const g = L.layerGroup();
    clusters.forEach((c) => {
      if (c.count === 1) {
        const s = c.items[0];
        const sKey = siteKey(s);
        const isSel = !!(selectedIdRef && selectedIdRef.current === sKey);
        const m = L.marker([s.lat, s.lng], { pane: "sitesPane", icon: iconFor(st.size, isSel), keyboard: false });
        m.bindTooltip(siteHoverHtml(s), { direction: "top", offset: [0, -st.size / 2 - 2], opacity: 1, className: "mh-site-hover", sticky: true });
        m.on("click", () => {
          if (selectedIdRef) selectedIdRef.current = sKey;
          try { m.setIcon(iconFor(siteStyleForZoom(map.getZoom()).size, true)); m.setZIndexOffset(1000); } catch { /* noop */ }
          onSelectSite?.(s);
        });
        g.addLayer(m);
      } else {
        const bubble = clusterBubbleHtml(c.count, SITE_COLOR);
        const m = L.marker([c.lat, c.lng], {
          pane: "sitesPane", keyboard: false,
          icon: L.divIcon({ className: "mh-site-cluster", html: bubble.html, iconSize: [bubble.size, bubble.size], iconAnchor: [bubble.size / 2, bubble.size / 2] }),
        });
        m.on("click", () => {
          try {
            const bounds = L.latLngBounds(c.items.map((s) => [s.lat, s.lng]));
            map.flyToBounds(bounds, { padding: [60, 60], maxZoom: Math.min(18, map.getZoom() + 4), duration: 0.6 });
          } catch { /* noop */ }
        });
        g.addLayer(m);
      }
    });
    grp.addLayer(g);
    markerLayer = g;
  };
  render();

  if (map._mhSiteZoom) { map.off("zoomend", map._mhSiteZoom); map._mhSiteZoom = null; }
  map._mhSiteZoom = render;
  map.on("zoomend", render);
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
    locate: <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" /></svg>,
    spinner: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 12a9 9 0 1 1-9-9" /></svg>,
    map: <svg style={s} viewBox="0 0 24 24" {...p}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>,
    search: <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  };
  return icons[name] || null;
}

// Legend Activity Map - status asli mh_activities (ganti "Produktivitas
// Tinggi/Sedang/Rendah" lama yang cuma cocok utk 10 pin contoh yang sudah
// dihapus). Disembunyikan otomatis kalau tidak ada titik activity sama sekali
// supaya tidak menampilkan legend kosong/menyesatkan.
function MapLegend({ t, show = true, showPosm = false, counts = null, style = null }) {
  if (!show && !showPosm && !counts) return null;
  return (
    <div className="mh-map-legend-box" style={{ position: "absolute", bottom: 12, left: 12, zIndex: 500, background: t.card, borderRadius: 10, padding: "9px 13px", display: "flex", flexDirection: "column", gap: 5, border: `1px solid ${t.line}`, boxShadow: "0 4px 16px rgba(0,0,0,0.14)", maxWidth: "min(60cqi,220px)", ...style }}>
      {counts && (
        <div className="mh-map-legend-item" style={{ fontWeight: 800, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: show || showPosm ? 3 : 0, paddingBottom: show || showPosm ? 4 : 0, borderBottom: show || showPosm ? `1px solid ${t.line}` : "none" }}>
          {counts.map((c, i) => (i > 0 ? " · " : "") + c).join("")}
        </div>
      )}
      {show && (<>
        <div className="mh-map-legend-title" style={{ fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Status Activity</div>
        {[["Approved", C.success], ["Menunggu", C.warning], ["Ditolak/Revisi", C.error]].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <div className="mh-map-legend-dot" style={{ width: 9, height: 9, borderRadius: "50%", background: c, flexShrink: 0 }} />
            <span className="mh-map-legend-item" style={{ color: t.mid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</span>
          </div>
        ))}
      </>)}
      {showPosm && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: show ? 3 : 0, minWidth: 0 }}>
          <div className="mh-map-legend-dot" style={{ width: 9, height: 9, transform: "rotate(45deg)", background: `${POSM_COLOR}30`, border: `1.5px solid ${POSM_COLOR}`, flexShrink: 0 }} />
          <span className="mh-map-legend-item" style={{ color: t.mid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Instalasi POSM</span>
        </div>
      )}
    </div>
  );
}

// ── Kartu ringkasan Activity/POSM/Site (menggantikan pill kecil "0 aktivitas
// · 0 POSM · 53 site") - tiap baris berikon & bisa DIKLIK untuk membuka
// dropdown daftar satu per satu, dengan kotak pencarian sendiri per kategori,
// supaya gampang cek satu-satu tanpa harus cari manual di peta. Klik satu
// item → peta terbang ke situ (Site juga sekalian buka panel detail kiri,
// SAMA seperti klik langsung di peta - jalur onSelectSite yang sama, cuma
// pintu masuknya lewat daftar ini). Berpindah antar kategori/antar item
// selalu membersihkan pencarian & TIDAK menutup dropdown, supaya user bisa
// klik beberapa item berturut-turut tanpa buka-tutup lagi tiap kali.
function StatIcon({ kind, size = 15, color = "currentColor" }) {
  const s = { width: size, height: size, flexShrink: 0 };
  if (kind === "activity") return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /></svg>;
  if (kind === "posm") return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" transform="rotate(45 12 12)" /></svg>;
  // site: pakai vektor menara sinyal yang sama dgn marker-nya sendiri, supaya
  // ikonnya konsisten antara kartu ringkasan & titik di peta.
  return <svg style={s} viewBox="0 0 32 32" fill={color}>{SITE_TOWER_PATHS.map((d, i) => <path key={i} d={d} />)}</svg>;
}
function MapStatsCard({ t, activities = [], posms = [], sites = [], onSelectActivity = null, onSelectPosm = null, onSelectSite = null, activeSiteKey = null, style = null, filterUi = null, layerToggle = null, searchUi = null, mapStyleUi = null, minimized = false, onToggleMinimize = null }) {
  const [openSection, setOpenSection] = useState(null); // 'activity' | 'posm' | 'site' | null
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState(null); // penanda item terakhir diklik, dipertahankan lintas kategori
  // Kartu tetap ditampilkan (utk filter-nya) walau hasil TIGA kategori
  // kosong semua - kalau tidak, user yang filternya kebetulan menghasilkan
  // 0 tidak akan bisa lihat/ubah filter sama sekali lagi (kartu "hilang").
  if (!filterUi && !layerToggle && !searchUi && !activities.length && !posms.length && !sites.length) return null;

  const SECTIONS = [
    { id: "activity", label: "Activity", color: "#C6168D", items: activities, sub: (p) => [p.branchName || p.branch, p.statusKey].filter(Boolean).join(" · "), onPick: onSelectActivity },
    { id: "posm", label: "POSM", color: POSM_COLOR, items: posms, sub: (p) => [p.branch, p.mode].filter(Boolean).join(" · "), onPick: onSelectPosm },
    { id: "site", label: "Site", color: SITE_COLOR, items: sites, sub: (s) => [s.props?.["BRANCH"], s.props?.["MC"]].filter(Boolean).join(" · "), onPick: onSelectSite, key: (s) => siteKey(s) },
  ];
  const total = activities.length + posms.length + sites.length;

  const toggle = (id) => { setQuery(""); setOpenSection((v) => (v === id ? null : id)); };

  const selSx = { width: "100%", height: 32, fontSize: 12, fontWeight: 700, color: t.hi, background: t.hover, border: `1px solid ${t.line}`, borderRadius: 8, padding: "0 26px 0 9px", fontFamily: FONT };

  return (
    <div className="mh-map-stats-card" style={{ position: "relative", zIndex: 720, background: t.card, borderRadius: 14, border: `1px solid ${t.line}`, boxShadow: "0 8px 26px rgba(0,0,0,0.18)", width: "min(88cqi, 320px)", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: FONT, ...style }}>
      <div style={{ padding: "12px 13px 10px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: 99, background: SITE_COLOR, flexShrink: 0 }} />
        <div style={{ fontSize: 12.5, fontWeight: 800, color: t.hi, flex: 1 }}>Konfigurasi & Filter</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.lo, background: t.hover, borderRadius: 999, padding: "2px 8px" }}>{total.toLocaleString("id-ID")}</div>
        <button onClick={() => onToggleMinimize && onToggleMinimize()} title={minimized ? "Buka kartu" : "Ciutkan kartu"}
          style={{ width: 24, height: 24, borderRadius: 7, border: `1px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer", flexShrink: 0 }}>
          <I name={minimized ? "expand" : "minus"} size={11} color={t.mid} />
        </button>
      </div>
      {minimized && layerToggle && (
        <div style={{ padding: "9px 13px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {layerToggle.items.map((c) => {
            const on = layerToggle.vis[c.id];
            return (
              <button key={c.id} onClick={() => layerToggle.onToggle(c.id)} title={on ? `Sembunyikan ${c.label}` : `Tampilkan ${c.label}`}
                style={{ display: "flex", alignItems: "center", gap: 4, height: 24, padding: "0 8px", borderRadius: 999, border: `1px solid ${on ? c.color + "55" : t.line}`, background: on ? c.color + "17" : "transparent", color: on ? c.color : t.lo, fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>
                <span style={{ width: 5, height: 5, borderRadius: 99, background: on ? c.color : t.lo }} /> {c.count.toLocaleString("id-ID")}
              </button>
            );
          })}
        </div>
      )}
      {/* Filter bertingkat Region → Branch → Micro Cluster - dipindah ke sini
          (sebelumnya toolbar terpisah di atas peta) supaya jadi satu panel
          terpadu dgn daftar Site/Activity/POSM di bawahnya. Bertingkat:
          pilih Region dulu → opsi Branch otomatis menyempit ke branch yg
          benar2 ada di region itu → pilih Branch → opsi MC ikut menyempit
          lagi. Memilih level yg lebih tinggi otomatis mengosongkan level di
          bawahnya (lihat setFilterRegion/setFilterBranch di map/page.jsx). */}
      {!minimized && (
      <>
      {/* Pencarian - dipindah ke sini (dari toolbar terpisah di atas peta),
          supaya kartu ini benar2 jadi SATU pusat konfigurasi & filter. Dua
          kolom terpisah: data internal (Site/Activity/POSM/Kecamatan) vs
          alamat/jalan sungguhan (Nominatim, hasilnya taruh pin di peta). */}
      {searchUi && (
        <div style={{ padding: "10px 13px", borderBottom: `1px solid ${t.line}`, display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: t.lo, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pencarian</span>
          <div style={{ position: "relative" }}>
            <input value={searchUi.searchQ}
              onChange={(e) => { searchUi.setSearchQ(e.target.value); searchUi.setShowSuggest(true); if (!e.target.value.trim()) searchUi.clearSearch(); }}
              onFocus={() => searchUi.setShowSuggest(true)}
              onBlur={() => setTimeout(() => searchUi.setShowSuggest(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter") searchUi.runSearch(); if (e.key === "Escape") searchUi.clearSearch(); }}
              placeholder="Site / Activity / POSM / Kecamatan…" style={{ ...selSx, paddingRight: 30 }} />
            <span style={{ position: "absolute", top: "50%", right: 9, transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}><I name="search" size={12} color={t.lo} /></span>
            {searchUi.showSuggest && searchUi.searchQ.trim() && searchUi.suggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, maxHeight: 260, overflowY: "auto", background: t.card, border: `1px solid ${t.line}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.20)", zIndex: 950 }}>
                {searchUi.suggestions.map((it, i) => {
                  const kc = (searchUi.kindStyle && searchUi.kindStyle[it.kind]) || { color: SITE_COLOR, label: it.kind };
                  return (
                    <div key={`${it.kind}-${it.name}-${i}`} onMouseDown={() => searchUi.pickSuggestion(it)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer", borderTop: i > 0 ? `1px solid ${t.line}` : "none" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = t.hover; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <span style={{ width: 7, height: 7, borderRadius: 99, background: kc.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: t.hi, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</span>
                      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: kc.color, background: `${kc.color}17`, borderRadius: 5, padding: "2px 5px", flexShrink: 0 }}>{kc.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {searchUi.searchErr && <div style={{ fontSize: 10.5, color: "#C62828", fontWeight: 600 }}>{searchUi.searchErr}</div>}
          <div style={{ position: "relative" }}>
            <input value={searchUi.addrQ}
              onChange={(e) => { searchUi.setAddrQ(e.target.value); searchUi.setShowAddrSuggest(true); if (!e.target.value.trim()) searchUi.clearAddress(); }}
              onFocus={() => searchUi.setShowAddrSuggest(true)}
              onBlur={() => setTimeout(() => searchUi.setShowAddrSuggest(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter" && searchUi.addrSuggestions[0]) searchUi.pickAddress(searchUi.addrSuggestions[0]); if (e.key === "Escape") searchUi.clearAddress(); }}
              placeholder="Alamat / nama jalan…" style={{ ...selSx, borderColor: searchUi.addrPoint ? "#5C6BC0" : t.line, paddingRight: searchUi.addrPoint ? 30 : 9 }} />
            {searchUi.addrPoint && (
              <button onClick={searchUi.clearAddress} title="Hapus pin alamat"
                style={{ position: "absolute", top: "50%", right: 6, transform: "translateY(-50%)", width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
                <I name="close" size={11} color={t.mid} />
              </button>
            )}
            {searchUi.showAddrSuggest && searchUi.addrQ.trim() && searchUi.addrSuggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, maxHeight: 240, overflowY: "auto", background: t.card, border: `1px solid ${t.line}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.20)", zIndex: 950 }}>
                {searchUi.addrSuggestions.map((it, i) => (
                  <div key={`addr-${i}`} onMouseDown={() => searchUi.pickAddress(it)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer", borderTop: i > 0 ? `1px solid ${t.line}` : "none" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = t.hover; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: "#5C6BC0", flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: t.hi, flex: 1, minWidth: 0 }}>{it.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Toggle tampilan dasar peta - bisa diklik KAPAN PUN (tidak
              dikunci ke ada/tidaknya pin alamat lagi), supaya selalu
              responsif; otomatis nyala begitu pin alamat baru dicari. */}
          {mapStyleUi && (
            <button onClick={() => mapStyleUi.setMapStyle((v) => (v === "detail" ? "plain" : "detail"))}
              title={mapStyleUi.mapStyle === "detail" ? "Kembali ke peta polos" : "Tampilkan tile peta jalan sungguhan"}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 32, borderRadius: 8, border: `1px solid ${mapStyleUi.mapStyle === "detail" ? "#5C6BC055" : t.line}`, background: mapStyleUi.mapStyle === "detail" ? "#5C6BC017" : t.hover, color: mapStyleUi.mapStyle === "detail" ? "#5C6BC0" : t.lo, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
              <I name="map" size={12} color={mapStyleUi.mapStyle === "detail" ? "#5C6BC0" : t.lo} /> {mapStyleUi.mapStyle === "detail" ? "Peta Detail Aktif" : "Tampilkan Peta Detail"}
            </button>
          )}
        </div>
      )}
      {/* Toggle tampil/sembunyi Wilayah/Site/Activity/POSM - dipindah ke
          SINI (dalam kartu Ringkasan Data), bukan lagi toolbar terpisah di
          atas peta, supaya jadi satu panel terpadu dgn filter & daftarnya. */}
      {layerToggle && (
        <div style={{ padding: "10px 13px", borderBottom: `1px solid ${t.line}`, display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: t.lo, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tampilkan di Peta</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {layerToggle.items.map((c) => {
              const on = layerToggle.vis[c.id];
              return (
                <button key={c.id} onClick={() => layerToggle.onToggle(c.id)}
                  title={on ? `Sembunyikan ${c.label}` : `Tampilkan ${c.label}`}
                  style={{ display: "flex", alignItems: "center", gap: 5, height: 27, padding: "0 9px", borderRadius: 999, border: `1px solid ${on ? c.color + "55" : t.line}`, background: on ? c.color + "17" : t.hover, color: on ? c.color : t.lo, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: on ? c.color : t.lo, flexShrink: 0 }} /> {c.label} · {c.count.toLocaleString("id-ID")}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {filterUi && (
        <div style={{ padding: "10px 13px", borderBottom: `1px solid ${t.line}`, display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: t.lo, textTransform: "uppercase", letterSpacing: "0.05em", flex: 1 }}>Filter Wilayah</span>
            {filterUi.hasFilter && (
              <button onClick={filterUi.clearFilter} title="Hapus semua filter"
                style={{ fontSize: 10.5, fontWeight: 700, color: t.lo, background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px" }}>
                Reset
              </button>
            )}
          </div>
          <select value={filterUi.filterRegion} onChange={(e) => filterUi.setFilterRegion(e.target.value)} style={selSx}>
            <option value="">1. Semua Region</option>
            {filterUi.regionList.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filterUi.filterBranch} onChange={(e) => filterUi.setFilterBranch(e.target.value)} style={selSx}>
            <option value="">2. Semua Branch</option>
            {filterUi.branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={filterUi.filterMc} onChange={(e) => filterUi.setFilterMc(e.target.value)} style={selSx}>
            <option value="">3. Semua Micro Cluster</option>
            {filterUi.mcOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}
      <div style={{ overflowY: "auto", minHeight: 0, flex: 1 }}>
        {SECTIONS.map((sec) => {
          if (!sec.items.length) return null;
          const open = openSection === sec.id;
          const q = query.trim().toLowerCase();
          const filtered = q ? sec.items.filter((it) => (it.name || "").toLowerCase().includes(q)) : sec.items;
          return (
            <div key={sec.id} style={{ borderBottom: `1px solid ${t.line}` }}>
              <button onClick={() => toggle(sec.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", border: "none", background: open ? `${sec.color}0F` : "transparent", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: `${sec.color}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <StatIcon kind={sec.id} size={15} color={sec.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>{sec.items.length.toLocaleString("id-ID")} {sec.label}</div>
                </div>
                <I name={open ? "minus" : "plus"} size={13} color={t.lo} />
              </button>
              {open && (
                <div style={{ padding: "0 13px 12px" }}>
                  <div style={{ position: "relative", marginBottom: 8 }}>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Cari ${sec.label.toLowerCase()}…`} autoFocus
                      style={{ width: "100%", height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.hover, color: t.hi, fontSize: 12, fontFamily: FONT }} />
                  </div>
                  <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                    {filtered.length === 0 && <div style={{ fontSize: 11.5, color: t.lo, padding: "6px 2px" }}>Tidak ada yang cocok.</div>}
                    {filtered.slice(0, 300).map((it, i) => {
                      const kkey = sec.key ? sec.key(it) : `${sec.id}-${it.name}-${it.lat}-${it.lng}-${i}`;
                      const isActive = activeKey === kkey || (sec.id === "site" && activeSiteKey && sec.key && sec.key(it) === activeSiteKey);
                      return (
                        <button key={kkey} onClick={() => { setActiveKey(kkey); sec.onPick?.(it); }}
                          style={{ display: "flex", flexDirection: "column", gap: 1, padding: "6px 8px", borderRadius: 7, border: "none", background: isActive ? `${sec.color}17` : "transparent", cursor: "pointer", textAlign: "left" }}
                          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = t.hover; }}
                          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? sec.color : t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name || "(tanpa nama)"}</span>
                          {sec.sub(it) && <span style={{ fontSize: 10, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sec.sub(it)}</span>}
                        </button>
                      );
                    })}
                    {filtered.length > 300 && <div style={{ fontSize: 10, color: t.lo, padding: "4px 2px" }}>+{filtered.length - 300} lainnya - persempit dgn pencarian.</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}

// ── Style responsif bersama (toolbar & legend menyusut rapi di layar sempit -
// dashboard mobile / kartu setengah lebar) + animasi skeleton loading peta.
// Inline style React SELALU menang atas CSS biasa, makanya ukuran toolbar
// btn/legend TIDAK di-hardcode inline lagi (lihat MapLegend & toolbar di
// bawah) - supaya media query di sini benar-benar bisa mengecilkannya.
function MapResponsiveStyle() {
  return (
    <style>{`
      /* ── Responsif berbasis LEBAR KARTU PETA ITU SENDIRI (container query),
         BUKAN lebar viewport/window. Ini perbaikan dari versi sebelumnya yg
         pakai @media + transform:scale - salah, karena kartu peta di dashboard
         bisa sempit (mis. 1 dari 3 kolom grid) walau layar/browser-nya lebar,
         jadi @media (lebar VIEWPORT) tidak pernah kepicu. .mh-map-container
         (dipasang di pembungkus kartu, halaman penuh, & modal expanded) diberi
         container-type supaya @container di bawah bereaksi thd lebar ELEMEN. */
      .mh-map-container{ container-type: inline-size; container-name: mhmap; }
      /* Label lat/lng pin pencarian alamat - kecil, mengambang persis di atas
         pin, ikut warna indigo pin-nya. */
      .mh-addr-tip{ background:#5C6BC0 !important; color:#fff !important; border:none !important; font-size:10px !important; font-weight:700 !important; padding:3px 7px !important; border-radius:6px !important; box-shadow:0 3px 10px rgba(0,0,0,0.25) !important; }
      .mh-addr-tip::before{ border-top-color:#5C6BC0 !important; }
      /* Peta Sederhana - kurangi kepadatan visual (Activity/POSM sudah
         disembunyikan lewat state; filter ini menenangkan warna tile/marker
         sisanya supaya kesan "ringan" konsisten). */
      .mh-map-simple .leaflet-tile-pane{ filter: saturate(.72) contrast(.96); }
      .mh-detail-panel::-webkit-scrollbar{ width:7px; }
      .mh-detail-panel::-webkit-scrollbar-thumb{ background:rgba(13,17,23,.16); border-radius:99px; }
      /* Label hover ringan kecamatan - elemen manual (bukan L.Tooltip), posisi
         diupdate langsung lewat style saat mousemove → instan, tanpa jeda
         walau kursor gerak cepat antar kecamatan. */
      .mh-hover-lite{ font:800 10.5px ${FONT}; padding:3px 8px; border-radius:6px; background:#0D1117; color:#fff; box-shadow:0 2px 8px rgba(0,0,0,.25); }
      /* Kartu hover site - dipakai via bindTooltip bawaan Leaflet (aman di
         sini, lihat catatan di paintSites), transisi fade DIPERCEPAT (bukan
         dimatikan total spt .mh-hover-lite) supaya tetap terasa halus. */
      .mh-site-hover{ background:#0D1117 !important; border:none !important; border-radius:10px !important; padding:8px 11px !important; box-shadow:0 6px 18px rgba(0,0,0,.32) !important; transition:opacity .08s linear !important; }
      .mh-site-hover::before{ border-top-color:#0D1117 !important; }

      .mh-map-toolbar-btn{ width:30px; height:30px; border-radius:8px; }
      .mh-map-legend-title{ font-size:9.5px; }
      .mh-map-legend-item{ font-size:10.5px; }
      .mh-map-strip-badge{ font-size:10px; padding:3px 9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:min(72cqi,260px); }

      @keyframes mh-map-skeleton { 0%{ background-position:-300px 0; } 100%{ background-position:300px 0; } }
      .mh-map-skeleton{
        position:absolute; inset:0; z-index:400;
        background-image:linear-gradient(90deg, rgba(120,140,180,0.10) 25%, rgba(120,140,180,0.22) 37%, rgba(120,140,180,0.10) 63%);
        background-size:600px 100%; animation:mh-map-skeleton 1.4s ease-in-out infinite;
        display:flex; align-items:center; justify-content:center;
      }
      @keyframes mh-myloc-pulse{ 0%{ transform:scale(1); opacity:.55; } 100%{ transform:scale(2.6); opacity:0; } }
      .mh-myloc-pulse{ animation:mh-myloc-pulse 1.6s ease-out infinite; }
      @keyframes mh-map-spin{ to{ transform:rotate(360deg); } }
      .mh-map-spin{ animation:mh-map-spin .8s linear infinite; }
      @media (prefers-reduced-motion: reduce){ .mh-map-skeleton, .mh-map-progress-shine, .mh-myloc-pulse, .mh-map-spin{ animation:none !important; } }

      /* Kartu SEMPIT (mis. 1/3 kolom dashboard) - toolbar & legend menyusut
         nyata (bukan cuma di-scale visual), semua teks tetap SATU BARIS. */
      @container mhmap (max-width: ${MAP_NARROW}px){
        .mh-map-toolbar{ gap:4px !important; }
        .mh-map-toolbar-btn{ width:26px !important; height:26px !important; border-radius:7px !important; }
        .mh-map-legend-box{ padding:7px 10px !important; gap:4px !important; max-width:44cqi; }
        .mh-map-legend-title{ font-size:8.5px !important; }
        .mh-map-legend-item{ font-size:9.5px !important; }
        .mh-map-legend-dot{ width:7px !important; height:7px !important; }
        .mh-map-strip-badge{ font-size:9px !important; padding:2px 7px !important; }
      }
      /* Kartu SANGAT sempit (mobile/kolom kecil) - legend jadi ikon ringkas. */
      @container mhmap (max-width: 300px){
        .mh-map-legend-title{ display:none; }
        .mh-map-legend-box{ padding:6px 8px !important; }
      }

      /* ── Tooltip Batas Wilayah (hover) - default Leaflet tooltip = kotak
         putih polos + border tipis + panah kecil, terasa "jadul". Diganti
         jadi kartu bulat lembut sekelas popup site, tanpa border/shadow
         bawaan browser. */
      .mh-territory-tip{ background:#fff !important; color:#0D1117 !important; border:none !important; border-radius:12px !important; box-shadow:0 14px 34px rgba(13,17,23,.20), 0 2px 8px rgba(13,17,23,.10) !important; padding:11px 13px !important; opacity:1 !important; }
      .mh-territory-tip::before{ display:none !important; }
      .mh-territory-tip.leaflet-tooltip-top::after{ content:""; position:absolute; left:50%; bottom:-6px; transform:translateX(-50%); border:6px solid transparent; border-top-color:#fff; }

      /* ── Popup Site - override default Leaflet supaya kartu putih terasa
         satu kesatuan desain (bukan bubble default browser): tanpa padding
         bawaan (konten sudah atur padding sendiri per section), sudut lebih
         membulat, shadow lebih lembut, tombol close & "tip" diselaraskan.
         Baris label/nilai DIPAKSA satu baris (ellipsis) - lihat .mh-row-val. */
      .mh-site-popup .leaflet-popup-content-wrapper{ padding:0; border-radius:16px; box-shadow:0 16px 40px rgba(13,17,23,.22), 0 2px 8px rgba(13,17,23,.10); overflow:hidden; }
      .mh-site-popup .leaflet-popup-content{ margin:0; width:auto !important; }
      .mh-site-popup .leaflet-popup-tip-container{ margin-top:-1px; }
      .mh-site-popup .leaflet-popup-tip{ box-shadow:0 4px 8px rgba(13,17,23,.08); }
      .mh-site-popup .leaflet-popup-close-button{ top:10px !important; right:10px !important; width:22px !important; height:22px !important; display:flex; align-items:center; justify-content:center; font-size:15px !important; font-weight:700; color:#7B8BAD !important; background:rgba(13,17,23,.05); border-radius:8px; transition:background .12s,color .12s; }
      .mh-site-popup .leaflet-popup-close-button:hover{ background:rgba(13,17,23,.10); color:#0D1117 !important; }
      .mh-row-val{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .mh-site-more:hover{ filter:brightness(1.05); }
      .mh-site-back:hover{ background:#E3E7EF !important; }

      /* ── Modal expanded - "tarik untuk perbesar/perkecil" pakai resize
         native browser (pojok kanan-bawah), bukan ukuran tetap - map di
         dalamnya sudah auto invalidateSize via ResizeObserver (buildBaseMap),
         jadi ukuran & tile peta selalu ikut menyesuaikan secara live. */
      .mh-map-resizable{ resize: both; overflow: auto; }
      .mh-map-resizable::-webkit-resizer{ background: transparent; }
      /* Mode gelap peta (tile OSM standar tidak punya varian gelap sendiri) -
         disimulasikan via filter CSS di tile img, bukan tileset terpisah,
         supaya tetap 1 provider gratis tanpa API key. */
      .mh-dark-tiles{ filter: invert(1) hue-rotate(180deg) brightness(0.96) contrast(0.92) saturate(0.85); }
    `}</style>
  );
}

// Overlay skeleton - tampil sampai basemap+data pertama selesai dipasang,
// supaya peta tidak terasa "kosong/belum diproses" saat pertama render.
function MapSkeleton({ t }) {
  return (
    <div className="mh-map-skeleton">
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 100, background: t.card, border: `1px solid ${t.line}`, boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
        <span style={{ width: 14, height: 14, borderRadius: "50%", borderWidth: 2, borderStyle: "solid", borderColor: t.line, borderTopColor: "#ED1C24", animation: "mh-map-spin .7s linear infinite" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: t.mid }}>Memuat peta…</span>
      </div>
      <style>{`@keyframes mh-map-spin{ to{ transform:rotate(360deg); } }`}</style>
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
  // Busy KHUSUS proses hubungkan/refresh/izin-ulang folder gabungan - dibedakan
  // dari `busy` (yang cuma nyala sesaat per-file di processFile lalu mati lagi
  // 600ms kemudian) supaya indikator loading tetap MENYALA TERUS dari awal klik
  // "Hubungkan Folder" sampai KEDUA jenis berkas (batas wilayah & titik site)
  // selesai diproses - tidak berkedip mati di antara keduanya.
  const [connecting, setConnecting] = useState(false);
  const [connectStage, setConnectStage] = useState("");

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

  // ── Hubungkan SATU folder untuk Batas Wilayah & Titik Site sekaligus ───────
  // Sebelumnya dua tombol "Hubungkan Folder" terpisah (satu per kind) -
  // membingungkan kalau kedua jenis berkas memang mau ditaruh di folder yang
  // SAMA (workflow user: satu folder rilis bulanan berisi .zip batas wilayah
  // + .xlsx titik site sekaligus). Sekarang cukup SATU kali pilih folder,
  // lalu di-scan otomatis utk KEDUA jenis ekstensi & KEDUA jenis periode -
  // penyimpanan referensi handle-nya tetap dua entri terpisah (kind
  // "territory"/"sites", lihat lib/folderHandles.js) supaya restore izin per
  // sesi berikutnya tetap bisa granular kalau ternyata izinnya lepas
  // sebelah, tapi dari sisi user cuma satu aksi "Hubungkan Folder".
  async function connectCombinedFolder() {
    if (!supportsFolderLink) { setErr("Browser ini tidak mendukung \"Hubungkan Folder\" - gunakan Chrome atau Edge terbaru."); return; }
    setErr(""); setConnecting(true); setConnectStage("Membuka folder…");
    try {
      const dirHandle = await window.showDirectoryPicker();
      territoryHandleRef.current = dirHandle;
      sitesHandleRef.current = dirHandle;
      setConnectStage("Menyimpan referensi folder…");
      await saveFolderHandle("territory", dirHandle, dirHandle.name);
      await saveFolderHandle("sites", dirHandle, dirHandle.name);
      setTerritoryFolder({ name: dirHandle.name, needsPermission: false, files: [], activeFile: null });
      setSitesFolder({ name: dirHandle.name, needsPermission: false, files: [], activeFile: null });
      setConnectStage("Memindai isi folder…");
      const [tFiles, sFiles] = await Promise.all([scanFolder("territory"), scanFolder("sites")]);
      if (tFiles.length) { setConnectStage("Memuat batas wilayah…"); await loadFromFolderFile("territory", tFiles[0]); }
      if (sFiles.length) { setConnectStage("Memuat titik site…"); await loadFromFolderFile("sites", sFiles[0]); }
      if (!tFiles.length && !sFiles.length) setErr("Tidak ada berkas batas wilayah (.zip/.kml/.kmz/.geojson) maupun titik site (.xlsx/.xls/.csv) yang cocok di folder ini.");
    } catch (e) {
      // Selalu tampilkan sesuatu - jangan biarkan klik terasa "tidak terjadi
      // apa-apa". AbortError dari showDirectoryPicker() BIASANYA berarti
      // dialog folder ditutup/dibatalkan (klik Cancel/Esc, atau jendela
      // kehilangan fokus pas dialog mau muncul) - bukan bug, tapi tetap perlu
      // dikabari, supaya user tahu klik-nya kedaftar dan tahu harus klik lagi.
      console.error("[MartaHub] connectCombinedFolder gagal:", e);
      if (e?.name === "AbortError") {
        // Dua kemungkinan: (1) user memang klik Cancel/Esc, ATAU (2) yang jauh
        // lebih sering - user MEMILIH folder tapi Chrome/Edge menolaknya
        // otomatis karena folder itu termasuk folder "sensitif" tingkat atas
        // (Desktop/Documents/Downloads/Music/Pictures/Videos atau folder home
        // itu sendiri) - browser sengaja memblokir akses langsung ke folder2
        // ini demi keamanan, walau user sudah klik "Buka"/"Pilih".
        setErr("Folder tidak bisa dihubungkan. Kalau Anda barusan memilih folder Desktop/Documents/Downloads (atau folder home) secara langsung, itu memang diblokir otomatis oleh browser demi keamanan - buat SUBFOLDER di dalamnya (mis. \"Documents/MartaHub Data\"), taruh berkas di situ, lalu hubungkan subfolder itu. Kalau Anda memang membatalkan dialognya, klik \"Hubungkan Folder\" lagi untuk mencoba ulang.");
      }
      else setErr("Gagal menghubungkan folder: " + (e?.message || String(e)));
    }
    finally { setConnecting(false); setConnectStage(""); }
  }
  async function reauthorizeCombined() {
    setConnecting(true); setConnectStage("Meminta izin akses…");
    try {
      const tHandle = territoryHandleRef.current, sHandle = sitesHandleRef.current;
      const okT = tHandle ? await ensurePermission(tHandle) : false;
      const okS = sHandle ? await ensurePermission(sHandle) : false;
      if (!okT && !okS) { setErr("Izin folder ditolak - data tidak bisa dibaca sampai izin diberikan."); return; }
      setTerritoryFolder((f) => (f ? { ...f, needsPermission: !okT } : f));
      setSitesFolder((f) => (f ? { ...f, needsPermission: !okS } : f));
      if (okT) {
        setConnectStage("Memindai batas wilayah…");
        const files = await scanFolder("territory");
        const rec = await getFolderHandle("territory");
        const pref = files.find((x) => x.name === rec?.lastFile) || files[0];
        if (pref) { setConnectStage("Memuat batas wilayah…"); await loadFromFolderFile("territory", pref); }
      }
      if (okS) {
        setConnectStage("Memindai titik site…");
        const files = await scanFolder("sites");
        const rec = await getFolderHandle("sites");
        const pref = files.find((x) => x.name === rec?.lastFile) || files[0];
        if (pref) { setConnectStage("Memuat titik site…"); await loadFromFolderFile("sites", pref); }
      }
    } catch (e) { console.error("[MartaHub] reauthorizeCombined gagal:", e); setErr("Gagal memberi izin ulang: " + (e?.message || String(e))); }
    finally { setConnecting(false); setConnectStage(""); }
  }
  async function refreshCombined() {
    setConnecting(true); setConnectStage("Memuat ulang folder…");
    try {
      if (territoryHandleRef.current) {
        const files = await scanFolder("territory");
        if (files.length) { const same = files.find((f) => f.name === territoryFolder?.activeFile); await loadFromFolderFile("territory", same || files[0]); }
      }
      if (sitesHandleRef.current) {
        const files = await scanFolder("sites");
        if (files.length) { const same = files.find((f) => f.name === sitesFolder?.activeFile); await loadFromFolderFile("sites", same || files[0]); }
      }
    } catch (e) { console.error("[MartaHub] refreshCombined gagal:", e); setErr("Gagal memuat ulang folder: " + (e?.message || String(e))); }
    finally { setConnecting(false); setConnectStage(""); }
  }
  async function disconnectCombined() {
    await clearFolderHandle("territory"); await clearFolderHandle("sites");
    territoryHandleRef.current = null; sitesHandleRef.current = null;
    setTerritoryFolder(null); setSitesFolder(null);
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
    connectCombinedFolder, reauthorizeCombined, refreshCombined, disconnectCombined, connecting, connectStage,
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
  const fullText =
    state === "connected"
      ? `Tersambung (perangkat ini) - ${statusRow ? `${statusRow.period ? `${statusRow.period} · ` : ""}${statusRow.file_name}${who ? ` · ${who}` : ""} · ${fmtWhen(statusRow.updated_at)}` : `${localName || "data lokal"} (belum tercatat status organisasi)`}`
      : state === "disconnected"
      ? `Belum tersambung di perangkat ini - terakhir ${statusRow.period ? `${statusRow.period} · ` : ""}${statusRow.file_name}${who ? ` oleh ${who}` : ""} (${fmtWhen(statusRow.updated_at)}). Pilih file yang sama untuk tampil di peta ini.`
      : "Belum ada data.";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: compact ? "7px 9px" : "8px 10px", borderRadius: 9, background: bg, border: `1px solid ${state === "none" ? t.line : color + "33"}` }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: state === "none" ? dotColor : color, flexShrink: 0 }} />
      <div title={`${label} · ${fullText}`} style={{ flex: 1, minWidth: 0, fontSize: compact ? 10.5 : 11, color: t.mid, lineHeight: 1.45, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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

  if (!folder) return null; // dgn folder-link: koneksi digabung, lihat ConnectCombinedFolder di bawah
  if (folder.needsPermission) return null; // idem - izin ulang digabung juga

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

  if (!sortedFiles.length) return null; // tidak ada berkas jenis ini di folder - section-nya disembunyikan (lihat ConnectCombinedFolder)

  return (<>
    {busy && (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: t.mid }}>
            {progress < 85 ? "Membaca & memproses berkas…" : progress < 100 ? "Menyimpan lokal…" : "Selesai"}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: gradient ? "#C6168D" : color, fontVariantNumeric: "tabular-nums" }}>{progress}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: t.hover, overflow: "hidden", position: "relative" }}>
          <div className="mh-map-progress-fill" style={{ height: "100%", width: `${progress}%`, background: gradient ? "linear-gradient(90deg,#ED1C24,#C6168D)" : color, borderRadius: 99, transition: "width .25s ease", position: "relative", overflow: "hidden" }}>
            <div className="mh-map-progress-shine" />
          </div>
        </div>
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

// Satu titik masuk untuk menghubungkan folder - satu tombol "Hubungkan Folder"
// otomatis mendeteksi & memuat BERKAS BATAS WILAYAH dan TITIK SITE sekaligus
// (semua periode yang tersedia di masing-masing), karena keduanya akan
// ditaruh di folder yang sama. Menggantikan dua tombol terpisah sebelumnya.
// Spinner kecil (border berputar) - dipakai di tombol & baris status selama
// proses menghubungkan/memuat folder berjalan, supaya klik "Hubungkan Folder"
// SELALU kelihatan langsung merespons, bukan diam tanpa tanda apa pun.
function Spinner({ size = 14, color = "#fff" }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", border: `2px solid ${color}55`, borderTopColor: color, display: "inline-block", animation: "mh-spin .7s linear infinite", flexShrink: 0 }} />
  );
}

function ConnectCombinedFolder({ t, geo, canManage }) {
  if (!canManage) return null;
  const { busy, progress, connecting, connectStage, territoryFolder, sitesFolder } = geo;
  const loading = busy || connecting;
  const btnBase = { width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: 38, borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading ? 0.9 : 1, fontFamily: FONT, border: "none", background: "linear-gradient(135deg,#ED1C24,#C6168D)", color: "#fff" };
  const stageLabel = connectStage || (busy ? (progress < 85 ? "Membaca & memproses berkas…" : progress < 100 ? "Menyimpan lokal…" : "Selesai") : "");

  if (!supportsFolderLink) {
    const fileRef = geo.fileRef;
    const hasLocal = geo.layers.length > 0 || geo.siteData.length > 0;
    return (<>
      <input ref={fileRef} type="file" accept=".zip,.kml,.kmz,.geojson,.json" onChange={geo.onPick} style={{ display: "none" }} />
      <button onClick={() => fileRef.current?.click()} disabled={loading} style={btnBase}>
        {loading ? <Spinner /> : <I name="upload" size={15} color="#fff" />} {loading ? (stageLabel || `Memproses… ${progress}%`) : (hasLocal ? "Perbarui berkas (perangkat ini)" : "Pilih berkas (perangkat ini)")}
      </button>
      <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, margin: "8px 0" }}>
        Browser ini tidak mendukung &ldquo;Hubungkan Folder&rdquo; (butuh Chrome/Edge) - pilih berkas batas wilayah / titik site satu per satu, tetap diproses 100% lokal.
      </div>
    </>);
  }

  const folder = territoryFolder || sitesFolder; // untuk nama folder & label umum
  const needsPermission = (territoryFolder?.needsPermission) || (sitesFolder?.needsPermission);

  if (folder && !needsPermission) return null; // sudah tersambung - chip path-nya pindah ke header, lihat FolderPathChip

  if (!folder) {
    return (<>
      <button onClick={geo.connectCombinedFolder} disabled={loading} style={btnBase}>
        {loading ? <Spinner /> : <I name="folder" size={15} color="#fff" />} {loading ? (stageLabel || "Menghubungkan…") : "Hubungkan Folder"}
      </button>
      <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, margin: "8px 0" }}>
        Pilih satu folder berisi berkas batas wilayah (.zip/.kml/.kmz/.geojson) &amp; titik site (.xlsx/.xls/.csv) - semua periode yang ditemukan otomatis terdeteksi. Diproses <b>100% lokal</b>, tidak pernah dikirim ke server.
      </div>
    </>);
  }

  // needsPermission
  return (<>
    <button onClick={geo.reauthorizeCombined} disabled={loading} style={btnBase}>
      {loading ? <Spinner /> : <I name="folder" size={15} color="#fff" />} {loading ? (stageLabel || "Memproses…") : "Berikan Izin Ulang"}
    </button>
    <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, margin: "8px 0" }}>
      Izin akses folder &ldquo;{folder.name}&rdquo; perlu dikonfirmasi ulang oleh browser.
    </div>
  </>);
}

// Chip path folder - ditaruh langsung di header section "Batas Wilayah" begitu
// folder sudah tersambung (path-nya sudah diingat, jadi tombol besar "Hubungkan
// Folder" tidak relevan lagi). Klik "Ganti" untuk buka folder-picker lagi
// (menimpa folder lama, otomatis scan ulang batas wilayah & titik site).
function FolderPathChip({ t, geo }) {
  if (!supportsFolderLink) return null;
  const { busy, territoryFolder, sitesFolder } = geo;
  const folder = territoryFolder || sitesFolder;
  if (!folder || folder.needsPermission) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, marginTop: 6, marginBottom: 4 }}>
      <I name="folder" size={12} color={t.lo} />
      <span title={folder.name} style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{folder.name}</span>
      <button onClick={geo.connectCombinedFolder} disabled={busy} title="Ganti folder"
        style={{ flexShrink: 0, height: 22, padding: "0 8px", borderRadius: 6, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, fontSize: 10, fontWeight: 700, cursor: busy ? "default" : "pointer" }}>
        Ganti
      </button>
      <button onClick={geo.refreshCombined} disabled={busy} title="Muat ulang folder"
        style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, border: `1px solid ${t.line}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer" }}>
        <I name="refresh" size={11} color={t.mid} />
      </button>
      <button onClick={geo.disconnectCombined} disabled={busy} title="Putuskan folder"
        style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, border: `1px solid ${C.error}40`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer" }}>
        <I name="close" size={11} color={C.error} />
      </button>
    </div>
  );
}

// Switch on/off kecil - dipakai LayerPanel utk aktif/nonaktifkan (sembunyikan
// tanpa memutus folder) layer Batas Wilayah / Titik Site langsung dari panel
// pengaturan, selain lewat chip toggle di toolbar atas peta.
function Switch({ on, onChange, color = "#2E7D32", title }) {
  return (
    <button onClick={onChange} title={title} role="switch" aria-checked={on}
      style={{ width: 34, height: 19, borderRadius: 99, border: "none", padding: 2, background: on ? color : "#D5DBE5", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", transition: "background .18s ease" }}>
      <span style={{ width: 15, height: 15, borderRadius: 99, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", transform: on ? "translateX(15px)" : "translateX(0)", transition: "transform .18s ease" }} />
    </button>
  );
}

export function LayerPanel({ t, geo, style, canManage = false, layerVis = null, onToggleLayer = null }) {
  const { layers, status, err, busy, connecting, connectStage } = geo;
  const loading = busy || connecting;
  const folderConnected = !!((geo.territoryFolder && !geo.territoryFolder.needsPermission) || (geo.sitesFolder && !geo.sitesFolder.needsPermission));
  // "Sudah tersambung & datanya benar-benar sudah masuk" - bukan cuma folder
  // baru dipilih. Kalau baru dipilih (needsPermission sudah false tapi proses
  // scan/parsing file masih berjalan, atau malah gagal), panel HARUS tetap
  // tampil supaya progress bar / pesan error kelihatan - kalau langsung
  // disembunyikan begitu folder dipilih, klik "Hubungkan Folder" terasa
  // seperti "tidak terjadi apa-apa" padahal sedang/gagal memuat di balik layar.
  const dataLoaded = geo.layers.length > 0 || geo.siteData.length > 0;

  // Begitu folder sudah tersambung DAN datanya sudah benar-benar termuat,
  // tidak ada lagi yang perlu diatur di sini - path-nya sudah diingat (chip
  // "Ganti"-nya pindah ke header MapFull), dan on/off layer sudah dikendalikan
  // lewat chip LAYER_CHIPS di toolbar peta - jadi card ini otomatis hilang,
  // tidak menumpuk kontrol yang sama dua kali.
  if (canManage && folderConnected && dataLoaded && !loading && !err) return null;

  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.16)", padding: 14, ...style }}>
      <style>{`
        @keyframes mh-map-shine { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
        .mh-map-progress-shine { position: absolute; inset: 0; width: 40%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent); animation: mh-map-shine 1.1s ease-in-out infinite; }
        @keyframes mh-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <I name="layers" size={15} color={t.hi} />
        <div style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Batas Wilayah</div>
        {layers[0]?.count > 0 && <span style={{ fontSize: 9.5, fontWeight: 800, color: t.mid }}>{layers[0].count.toLocaleString("id-ID")} wilayah</span>}
        {loading && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 800, color: "#C6168D" }}><Spinner size={10} color="#C6168D" /> Memproses…</span>}
      </div>
      {!canManage && (
        <div style={{ fontSize: 10.5, color: t.lo, lineHeight: 1.55, margin: "2px 0 10px", display: "flex", alignItems: "flex-start", gap: 6 }}>
          <I name="shield" size={12} color={C.success} />
          <span>Mode <b>lihat saja</b>. Data batas wilayah & titik site dikelola oleh SPM Sumatera; Anda dapat menjelajah peta secara penuh.</span>
        </div>
      )}

      {canManage && <ConnectCombinedFolder t={t} geo={geo} canManage={canManage} />}
      {canManage && folderConnected && loading && (
        <div style={{ margin: "4px 0 8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: t.mid }}>
              {connectStage || (geo.progress < 85 ? "Membaca & memproses berkas…" : geo.progress < 100 ? "Menyimpan lokal…" : "Selesai")}
            </span>
            {busy && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#C6168D", fontVariantNumeric: "tabular-nums" }}>{geo.progress}%</span>}
          </div>
          <div style={{ height: 6, borderRadius: 99, background: t.hover, overflow: "hidden", position: "relative" }}>
            <div className="mh-map-progress-fill" style={{ height: "100%", width: `${busy ? geo.progress : 100}%`, background: "linear-gradient(90deg,#ED1C24,#C6168D)", borderRadius: 99, transition: "width .25s ease", position: "relative", overflow: "hidden" }}>
              <div className="mh-map-progress-shine" />
            </div>
          </div>
        </div>
      )}
      {status && !err && <div style={{ fontSize: 10.5, color: C.success, marginTop: 8 }}>{status}</div>}
      {err && <div style={{ fontSize: 11, color: C.error, background: C.errorL, border: `1px solid ${C.error}30`, borderRadius: 8, padding: "7px 9px", marginTop: 8 }}>{err}</div>}
      {canManage && (
        <div style={{ fontSize: 10, color: t.lo, lineHeight: 1.55, margin: "10px 0" }}>
          <I name="shield" size={11} color={C.success} /> Isi file diproses & disimpan <b>100% lokal di perangkat ini</b> - tidak pernah dikirim ke server. Hanya nama file & referensi folder yang diingat, supaya sesi berikutnya tinggal beri izin ulang, bukan pilih ulang dari nol. Peta menampilkan wilayah <b>Sumatera</b>.
        </div>
      )}
    </div>
  );
}

// ── Panel detail kiri (wilayah / site) - satu komponen dipakai untuk keduanya,
// slide-in halus, "tertahan" (persisten) sampai user klik tutup / klik entitas
// lain. Menggantikan popup/tooltip lama sepenuhnya di Map Intelligence.
function DetailPanel({ t, open, onClose, children }) {
  return (
    <div
      className="mh-detail-panel"
      style={{
        position: "absolute", top: 0, left: 0, bottom: 0, zIndex: 800,
        width: "min(340px, 92cqi)", background: t.card, borderTopRightRadius: 14, borderBottomRightRadius: 14,
        borderRight: `1px solid ${t.line}`, boxShadow: "8px 0 28px rgba(0,0,0,0.20)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        transform: open ? "translateX(0)" : "translateX(-104%)",
        transition: "transform .34s cubic-bezier(.22,.9,.32,1), opacity .28s ease",
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
      }}
    >
      <button onClick={onClose} title="Tutup (keluar dari fokus kecamatan)"
        style={{ position: "absolute", top: 12, right: 12, zIndex: 2, width: 28, height: 28, borderRadius: 9, border: "none", background: "rgba(13,17,23,.07)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#4A5568" }}>
        <I name="close" size={14} />
      </button>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>{children}</div>
    </div>
  );
}

// ── Isi panel kiri saat kecamatan "difokuskan" (isolasi) - hanya field bisnis
// (KABKOT/BRANCH/MC IOH/REGION/AREA/PROV), plus jumlah Site/Activity/POSM di
// kecamatan itu (dihitung dari titik yang benar-benar jatuh di dalam poligon,
// lihat pointInGeometry), plus filter periode utk Activity/POSM.
function TerritoryDetail({ t, feature, counts, periodMonth, periodOptions, onPeriodChange }) {
  const props = feature?.properties || {};
  const title = featTitle(props);
  const fields = territoryFields(props);
  const statTile = (label, value, color) => (
    <div style={{ flex: 1, textAlign: "center", padding: "10px 6px", borderRadius: 10, background: `${color}12` }}>
      <div style={{ fontSize: 17, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: "#7B8BAD", marginTop: 2 }}>{label}</div>
    </div>
  );
  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "18px 40px 14px 18px", borderBottom: "1px solid rgba(13,17,23,.07)" }}>
        <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 10, background: "linear-gradient(135deg,#ED1C24,#C6168D)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 9px rgba(196,20,90,.35)" }}>
          <I name="locate" size={15} color="#fff" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div title={title} style={{ fontWeight: 800, fontSize: 14.5, color: "#0D1117", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div style={{ fontSize: 10.5, color: "#7B8BAD", fontWeight: 700, marginTop: 2 }}>Fokus Kecamatan</div>
        </div>
      </div>

      <div style={{ padding: "14px 18px 4px" }}>
        {fields.map(([k, v], i) => (
          <div key={k} style={{ display: "flex", gap: 14, justifyContent: "space-between", alignItems: "center", padding: "7px 0", minWidth: 0, borderTop: i > 0 ? "1px solid rgba(13,17,23,.055)" : "none" }}>
            <span style={{ fontSize: 10.5, color: "#7B8BAD", fontWeight: 700, flexShrink: 0, textTransform: "uppercase", letterSpacing: ".03em" }}>{k}</span>
            <span title={String(v)} style={{ fontSize: 12, fontWeight: 700, color: "#0D1117", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 170 }}>{String(v)}</span>
          </div>
        ))}
        {!fields.length && <div style={{ fontSize: 11.5, color: "#7B8BAD", padding: "6px 0" }}>Atribut wilayah tidak tersedia.</div>}
      </div>

      <div style={{ padding: "14px 18px 4px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "#7B8BAD" }}>Periode</span>
          <select value={periodMonth} onChange={(e) => onPeriodChange(e.target.value)}
            style={{ height: 27, fontSize: 10.5, fontWeight: 700, color: "#0D1117", background: "#EEF1F6", border: "none", borderRadius: 7, padding: "0 8px" }}>
            <option value="">Semua periode</option>
            {periodOptions.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {statTile("Site", counts.site, SITE_COLOR)}
          {statTile("Activity", counts.activity, "#C6168D")}
          {statTile("POSM", counts.posm, POSM_COLOR)}
        </div>
      </div>
    </div>
  );
}

// ── Kartu peta (dashboard): preview → modal ───────────────────────────────────
export function MapCard({ t, dark, height = 260, canManage = false, activityPoints = [], posmPoints = [], siteFilter = null }) {
  const router = useRouter();
  const boxRef = useRef(null), mapRef = useRef(null), fgRef = useRef(null), sitesFgRef = useRef(null), activitiesFgRef = useRef(null), posmFgRef = useRef(null), myLocRef = useRef(null);
  const [boot, setBoot] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [loc, setLoc] = useState({ busy: false, err: "" });
  const geo = useGeoLayers();
  const { layers, siteData: siteDataRaw } = geo;
  // siteFilter (opsional) = predikat (site) => boolean, dioper dari halaman
  // Map Intelligence berdasarkan filter Region/Branch/MC yang sedang dipilih -
  // titik site di-drawing memakai hasil filter ini, TANPA mengubah jumlah
  // "Titik Site" di status koneksi lokal (itu tetap total data lokal asli).
  const siteData = useMemo(() => (siteFilter ? siteDataRaw.filter(siteFilter) : siteDataRaw), [siteDataRaw, siteFilter]);
  const layersRef = useRef(layers); layersRef.current = layers; // selalu terbaru (hindari race saat build async)
  const siteRef = useRef(siteData); siteRef.current = siteData;
  const activityRef = useRef(activityPoints); activityRef.current = activityPoints;
  const posmRef = useRef(posmPoints); posmRef.current = posmPoints;

  // Kartu ini HANYA pratinjau ringkas di dashboard - dulu tombol "perbesar"
  // membuka modal peta besar sendiri (duplikat logic dari Map Intelligence,
  // gampang beda perilaku & jadi "gimmick"). Sekarang langsung PINDAH ke
  // /martahub/map (satu sumber kebenaran utk semua interaksi peta: filter,
  // layer, search, locate, dst.) - lebih ringan & konsisten.
  const goFull = useCallback(() => router.push("/martahub/map"), [router]);

  // Bangun ulang sekali setelah layout dashboard benar-benar settle (meniru efek
  // toggle tema) - memastikan peta tampil di render pertama tanpa perlu di-toggle.
  useEffect(() => {
    const id = setTimeout(() => setBoot((b) => b + 1), 350);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMapReady(false);
    (async () => {
      if (!boxRef.current || mapRef.current) return;
      const map = await buildBaseMap(boxRef.current, { dark, expanded: false, interactive: true });
      if (!map) return; if (cancelled) { map.remove(); return; }
      mapRef.current = map; fgRef.current = null; sitesFgRef.current = null; activitiesFgRef.current = null; posmFgRef.current = null;
      await paintOverlays(map, fgRef, layersRef.current, { expanded: false, appBg: t.appBg });
      paintSites(map, sitesFgRef, siteRef.current);
      paintActivities(map, activitiesFgRef, activityRef.current, { expanded: false });
      paintPosm(map, posmFgRef, posmRef.current, { expanded: false });
      // Pratinjau ini murni tampilan - klik apa pun langsung ke halaman penuh
      // (jangan biarkan orang "kerja" di peta mini yang fiturnya sengaja dikurangi).
      map.getContainer().style.cursor = "pointer";
      map.on("click", goFull);
      if (!cancelled) setMapReady(true);
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.off("click", goFull); mapRef.current.remove(); mapRef.current = null; fgRef.current = null; sitesFgRef.current = null; activitiesFgRef.current = null; posmFgRef.current = null; } };
  }, [dark, boot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintOverlays(mapRef.current, fgRef, layers, { expanded: false, appBg: t.appBg }); }, [layers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintSites(mapRef.current, sitesFgRef, siteData); }, [siteData]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintActivities(mapRef.current, activitiesFgRef, activityPoints, { expanded: false }); }, [activityPoints]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintPosm(mapRef.current, posmFgRef, posmPoints, { expanded: false }); }, [posmPoints]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shortcut "connect ulang" langsung di dashboard - laptop/browser berbeda
  // berarti IndexedDB lokal kosong walau organisasi sudah pernah upload
  // (payload memang tidak pernah ke server, §0.2). Klik "Hubungkan" langsung
  // ke Map Intelligence (panel kelola layer sudah lengkap di sana juga).
  return (
    <>
      <div className="mh-map-container" style={{ position: "relative", width: "100%", height, borderRadius: 12, overflow: "hidden", border: `1px solid ${t.line}`, isolation: "isolate" }}>
        <MapResponsiveStyle />
        <div ref={boxRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />
        {!mapReady && <MapSkeleton t={t} />}
        <MapLegend t={t} show={activityPoints.length > 0} showPosm={posmPoints.length > 0} />
        {layers.length > 0 && (
          <div className="mh-map-strip-badge" style={{ position: "absolute", top: 10, left: 10, zIndex: 650, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg,#ED1C24,#C6168D)", borderRadius: 999 }}>{layers.length} batas wilayah</div>
        )}
        {!canManage && anyDisconnected && (
          <div className="mh-map-strip-badge" style={{ position: "absolute", bottom: 12, right: 12, zIndex: 650, fontWeight: 700, color: "#8a5b00", background: "#FFFDE7", border: "1px solid #F0E3B0", borderRadius: 999 }}>
            Sebagian layer belum tersambung di perangkat ini
          </div>
        )}
        {loc.err && (
          <div className="mh-map-strip-badge" style={{ position: "absolute", bottom: 12, left: 12, zIndex: 650, fontWeight: 700, color: C.error, background: C.errorL, border: `1px solid ${C.error}30`, borderRadius: 999 }}>{loc.err}</div>
        )}
        {/* Toolbar: buka Map Intelligence · zoom · lokasi saya · full Sumatera */}
        <div className="mh-map-toolbar" style={{ position: "absolute", top: 10, right: 10, zIndex: 650, display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { ic: "expand", title: "Buka Map Intelligence", on: goFull },
            { ic: "plus", title: "Perbesar peta", on: (e) => { e.stopPropagation(); mapRef.current?.zoomIn(); } },
            { ic: "minus", title: "Perkecil peta", on: (e) => { e.stopPropagation(); mapRef.current?.zoomOut(); } },
            { ic: "locate", title: "Tarik ke lokasi saya", on: (e) => { e.stopPropagation(); locateMe(mapRef.current, myLocRef, setLoc); }, busy: loc.busy, active: true },
            { ic: "fit", title: "Tampilkan seluruh Sumatera", on: (e) => { e.stopPropagation(); mapRef.current?.fitBounds(SUMATRA_BOUNDS, { animate: true }); } },
          ].map((b) => (
            <button key={b.ic} className="mh-map-toolbar-btn" onClick={b.on} title={b.title} disabled={b.busy}
              style={{ background: t.card, border: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: b.active ? MY_LOC_COLOR : t.mid, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", cursor: b.busy ? "default" : "pointer" }}>
              {b.busy ? <span className="mh-map-spin" style={{ display: "flex" }}><I name="spinner" size={15} color={MY_LOC_COLOR} /></span> : <I name={b.ic} size={15} color={b.active ? MY_LOC_COLOR : t.mid} />}
            </button>
          ))}
        </div>
        <button onClick={goFull} className="mh-map-strip-badge" style={{ position: "absolute", bottom: 12, left: 12, zIndex: 650, display: loc.err ? "none" : "flex", alignItems: "center", gap: 5, fontWeight: 700, color: "#fff", background: "rgba(13,17,23,.62)", backdropFilter: "blur(4px)", border: "none", cursor: "pointer" }}>
          Buka Map Intelligence <I name="expand" size={11} color="#fff" />
        </button>
      </div>
    </>
  );
}

// ── Peta penuh (halaman Map Intelligence) ─────────────────────────────────────
export default function MapFull({ t, dark, canManage = false, activityPoints = [], posmPoints = [], siteFilter = null, flyTo = null, territoryFilter = null, onSitesChange = null, onTerritoryIndexChange = null, onTerritoryFacetsChange = null, focusTerritoryKey = null, groupMatch = null, filterUi = null, addressPoint = null, addressFlySeq = 0, onAddressPoint = null, searchUi = null }) {
  const boxRef = useRef(null), mapRef = useRef(null), fgRef = useRef(null), sitesFgRef = useRef(null), activitiesFgRef = useRef(null), posmFgRef = useRef(null), myLocRef = useRef(null), tileLayerRef = useRef(null), addrFgRef = useRef(null);
  const geo = useGeoLayers();
  const { layers, siteData: siteDataRaw } = geo;
  const siteData = useMemo(() => (siteFilter ? siteDataRaw.filter(siteFilter) : siteDataRaw), [siteDataRaw, siteFilter]);
  // Kirim daftar site (ringkas: id/nama/lat-lng) ke halaman pembungkus -
  // dipakai bikin saran otomatis pencarian yang mencakup Site (bukan cuma
  // Activity/POSM spt sebelumnya). Data site hidup di sini (IndexedDB lokal
  // via useGeoLayers), page.jsx tidak punya aksesnya sendiri.
  // PENTING: `siteData` (turunan useGeoLayers()) bisa berganti IDENTITAS
  // array di setiap render walau ISINYA sama persis - kalau effect ini
  // memanggil onSitesChange() setiap kali TANPA cek isi, itu men-trigger
  // setState di page.jsx → page.jsx render ulang → MapFull dapat props baru
  // → render ulang → siteData "berubah" lagi → panggil onSitesChange lagi →
  // ...berulang tanpa henti ("Maximum update depth exceeded"). Makanya di
  // sini WAJIB dibandingkan dulu pakai signature ringkas (bukan langsung
  // pakai identitas array `siteData` sbg pemicu keputusan kirim/tidak).
  const siteIdxSigRef = useRef("");
  useEffect(() => {
    if (!onSitesChange) return;
    const idx = siteData.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }));
    const sig = `${idx.length}|${idx[0]?.id || ""}|${idx[idx.length - 1]?.id || ""}`;
    if (sig === siteIdxSigRef.current) return;
    siteIdxSigRef.current = sig;
    onSitesChange(idx);
  }, [siteData, onSitesChange]);
  const [mapReady, setMapReady] = useState(false);
  const [boot, setBoot] = useState(0);
  const [loc, setLoc] = useState({ busy: false, err: "" });
  // ── Seleksi klik → panel kiri (wilayah/site) - "tertahan" (persisten) lewat
  // ref (bertahan lintas repaint total featureGroup), state `selected` cuma
  // dorong render panelnya. Klik kecamatan JUGA mengisolasi peta ke kecamatan
  // itu saja (isoFeature) - kecamatan lain diredupkan nyaris hilang & titik
  // Site/Activity/POSM di luar kecamatan itu disembunyikan, sampai tombol
  // "Tutup" di panel dipencet (closePanel keluar dari mode fokus).
  const selectedTerrKeyRef = useRef(null);
  const selectedSiteIdRef = useRef(null);
  const [selected, setSelected] = useState(null); // { type: 'territory'|'site', html? }
  const [isoFeature, setIsoFeature] = useState(null); // GeoJSON feature kecamatan yang sedang difokuskan
  const [periodMonth, setPeriodMonth] = useState(""); // "" = semua periode, atau "YYYY-MM"
  const [selVersion, setSelVersion] = useState(0);
  const selectTerritory = useCallback((feature) => {
    selectedSiteIdRef.current = null;
    setIsoFeature(feature);
    setSelected({ type: "territory" });
    setSelVersion((v) => v + 1);
  }, []);
  const selectSite = useCallback((s) => {
    // Selalu perbarui juga ref-nya di sini (bukan cuma di dalam handler klik
    // marker di paintSites) - supaya sumber pilihan APA PUN (klik langsung di
    // peta, ATAU klik dari daftar di MapStatsCard) selalu konsisten menandai
    // marker yang benar sebagai "terpilih" saat repaint berikutnya jalan.
    selectedSiteIdRef.current = siteKey(s);
    setSelected({ type: "site", html: sitePanelHtml(s) });
    setSelVersion((v) => v + 1);
  }, []);
  // Klik item Activity/POSM di MapStatsCard - peta "terbang" ke titiknya lalu
  // buka popup ringkas berisi nama+branch+status/mode (belum ada panel kiri
  // khusus utk Activity/POSM seperti Site/Kecamatan, jadi popup kecil sudah
  // cukup utk "cek satu-satu" sesuai permintaan).
  const focusMapPoint = useCallback(async (p, kind) => {
    if (!mapRef.current || p?.lat == null || p?.lng == null) return;
    const L = (await import("leaflet")).default;
    try { mapRef.current.flyTo([p.lat, p.lng], Math.max(mapRef.current.getZoom(), 15), { animate: true, duration: 0.7 }); } catch { /* noop */ }
    const title = kind === "activity" ? (p.name || "Activity") : (p.name || "Instalasi POSM");
    const sub = kind === "activity"
      ? [p.branchName || p.branch, p.statusKey].filter(Boolean).join(" · ")
      : [p.branch, p.mode].filter(Boolean).join(" · ");
    const html = `<div style="font-family:${FONT};min-width:120px"><div style="font-weight:800;font-size:12px;color:#0D1117">${esc(title)}</div>${sub ? `<div style="margin-top:2px;font-size:10.5px;color:#7B8BAD">${esc(sub)}</div>` : ""}</div>`;
    try { L.popup({ closeButton: true, maxWidth: 240, offset: [0, -6] }).setLatLng([p.lat, p.lng]).setContent(html).openOn(mapRef.current); } catch { /* noop */ }
  }, []);
  const focusActivity = useCallback((p) => focusMapPoint(p, "activity"), [focusMapPoint]);
  const focusPosm = useCallback((p) => focusMapPoint(p, "posm"), [focusMapPoint]);
  // Klik item Site di MapStatsCard - sama seperti klik marker-nya langsung:
  // terbang ke titiknya SEKALIGUS buka panel detail kiri (jalur onSelectSite
  // yang sama, cuma pintu masuknya lewat daftar, bukan klik di peta).
  const focusSite = useCallback((s) => {
    if (mapRef.current && s?.lat != null && s?.lng != null) {
      try { mapRef.current.flyTo([s.lat, s.lng], Math.max(mapRef.current.getZoom(), 15), { animate: true, duration: 0.7 }); } catch { /* noop */ }
    }
    selectSite(s);
  }, [selectSite]);
  const closePanel = useCallback(() => {
    selectedTerrKeyRef.current = null;
    selectedSiteIdRef.current = null;
    setIsoFeature(null);
    setSelected(null);
    setSelVersion((v) => v + 1);
  }, []);

  // Filter dropdown Region/Branch/MC (territoryFilter dari page.jsx) HARUS
  // selalu "menang" & langsung berefek begitu diklik - bahkan kalau saat itu
  // user sedang fokus ke satu kecamatan (isoFeature) atau sedang memilih satu
  // site. Sebelumnya kedua mode itu diam-diam MENGUNCI kamera & filter visual
  // (lihat effTerritoryFilter & efek flyTo di bawah - keduanya sengaja
  // mengabaikan territoryFilter selama isoFeature aktif), jadi klik filter
  // terasa "tidak terjadi apa-apa". Sekarang: begitu filter berubah (referensi
  // territoryFilter berubah, termasuk balik ke null saat direset), keluar
  // dulu dari mode fokus/pilihan sebelumnya, supaya filter yang baru diklik
  // langsung tereksekusi seperti menu lain, apa pun aktivitas yang sedang
  // berjalan di peta saat itu.
  const prevTerritoryFilterRef = useRef(territoryFilter);
  useEffect(() => {
    if (prevTerritoryFilterRef.current === territoryFilter) return;
    prevTerritoryFilterRef.current = territoryFilter;
    closePanel();
  }, [territoryFilter, closePanel]);
  // Peta Detail (semua layer, interaktif penuh) vs Peta Sederhana (fokus
  // wilayah + site saja, Activity/POSM disembunyikan sementara supaya tidak
  // ramai) - permintaan user: opsi tampilan simpel utk lihat sebaran cepat.
  // Toggle tampil/sembunyi tiap layer - independen dari filter Region/Branch/
  // MC (yang MENYARING data), ini murni ON/OFF tampilan supaya peta yang
  // ramai (4 layer sekaligus) bisa difokuskan sesuai kebutuhan saat itu.
  const [layerVis, setLayerVis] = useState({ activity: true, posm: true, site: false, territory: true });
  // Catatan: Wilayah (kecamatan) TETAP tampil default (bukan hide total spt
  // Site) - itu silhouette dasar peta sendiri (warna choropleth-nya), kalau
  // ikut disembunyikan defaultnya peta kelihatan kosong sama sekali/blank
  // saat pertama dibuka (tidak ada indikasi apa pun bahwa itu sebuah peta).
  // Site (titik individual, jauh lebih padat & berat) yang default hide.
  // Peta Sederhana (silhouette abu-abu) vs Peta Detail (tile jalan
  // OpenStreetMap/CARTO sungguhan) - tombolnya HANYA aktif kalau sedang ada
  // pin pencarian alamat (addressPoint), sesuai permintaan: peta detail baru
  // relevan begitu user memang sedang cek satu lokasi/jalan tertentu, bukan
  // dipasang terus-menerus (berat & tidak perlu saat idle lihat sebaran).
  const [mapStyle, setMapStyle] = useState("plain"); // "plain" | "detail"
  // Kartu "Ringkasan Data" diciutkan/dibuka - state-nya diangkat ke sini
  // (bukan lokal di MapStatsCard) supaya wrapper flex di JSX bisa ikut
  // menyesuaikan TINGGInya saat diciutkan (bug sebelumnya: wrapper tetap
  // flex:1 memenuhi kolom kanan walau isinya cuma header, kartu jadi
  // "kosong" tinggi terus). flex-basis auto & grow 0 saat diciutkan = kartu
  // benar2 menyusut ke tinggi header saja.
  const [statsMinimized, setStatsMinimized] = useState(false);
  const effLayerVis = layerVis;

  // ── Mode fokus kecamatan: saring titik yg BENAR-BENAR jatuh di dalam
  // poligonnya (ray-casting, sama seperti hit-test hover/klik di paintOverlays)
  // + filter periode (Activity pakai plan_date, POSM pakai created_at - lihat
  // field `date` yang dioper dari page.jsx). Kalau tidak sedang fokus,
  // dataset penuh dipakai apa adanya (perilaku lama, tidak berubah).
  const isoGeom = isoFeature?.geometry || null;
  const inPeriod = useCallback((d) => !periodMonth || (d || "").slice(0, 7) === periodMonth, [periodMonth]);
  const isoActivityPts = useMemo(() => {
    if (!isoGeom) return activityPoints;
    return activityPoints.filter((p) => inPeriod(p.date) && pointInGeometry([p.lng, p.lat], isoGeom));
  }, [activityPoints, isoGeom, inPeriod]);
  const isoPosmPts = useMemo(() => {
    if (!isoGeom) return posmPoints;
    return posmPoints.filter((p) => inPeriod(p.date) && pointInGeometry([p.lng, p.lat], isoGeom));
  }, [posmPoints, isoGeom, inPeriod]);
  const isoSitePts = useMemo(() => {
    if (!isoGeom) return siteData;
    return siteData.filter((s) => pointInGeometry([s.lng, s.lat], isoGeom));
  }, [siteData, isoGeom]);
  // Pilihan bulan utk dropdown periode - diturunkan dari data Activity/POSM
  // yang ADA (bukan hardcode), diurutkan terbaru dulu.
  const periodOptions = useMemo(() => {
    const set = new Set();
    activityPoints.forEach((p) => { if (p.date) set.add(String(p.date).slice(0, 7)); });
    posmPoints.forEach((p) => { if (p.date) set.add(String(p.date).slice(0, 7)); });
    return [...set].sort().reverse().map((key) => {
      const [y, m] = key.split("-").map(Number);
      const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      return { key, label: `${bulan[(m || 1) - 1]} ${y}` };
    });
  }, [activityPoints, posmPoints]);

  const visActivity = useMemo(() => (effLayerVis.activity ? isoActivityPts : []), [effLayerVis.activity, isoActivityPts]);
  const visPosm = useMemo(() => (effLayerVis.posm ? isoPosmPts : []), [effLayerVis.posm, isoPosmPts]);
  const visSite = useMemo(() => (effLayerVis.site ? isoSitePts : []), [effLayerVis.site, isoSitePts]);
  const visLayers = useMemo(() => (effLayerVis.territory ? layers : []), [effLayerVis.territory, layers]);
  const layersRef = useRef(visLayers); layersRef.current = visLayers;
  const siteRef = useRef(visSite); siteRef.current = visSite;
  const activityRef = useRef(visActivity); activityRef.current = visActivity;
  const posmRef = useRef(visPosm); posmRef.current = visPosm;
  // Featurefilter efektif ke poligon wilayah - urutan prioritas: fokus SATU
  // kecamatan (klik/pencarian nama kecamatan) > hasil pencarian Kab/Kot atau
  // MC IOH (groupMatch, bisa cocok BANYAK kecamatan) > filter dropdown
  // Region/Branch/MC biasa.
  const effTerritoryFilter = useMemo(() => {
    if (isoFeature) { const k = featKey(isoFeature.properties || {}); return (props) => featKey(props) === k; }
    if (groupMatch) { const norm = (v) => String(v || "").trim().toLowerCase(); const gv = norm(groupMatch.value); return (props) => norm(props[groupMatch.field]) === gv; }
    return territoryFilter;
  }, [isoFeature, groupMatch, territoryFilter]);
  const effTerritoryFilterRef = useRef(effTerritoryFilter); effTerritoryFilterRef.current = effTerritoryFilter;

  // ── Indeks pencarian Kecamatan/Kab-Kot/MC IOH - dibangun dari data batas
  // wilayah yang sudah dimuat (`layers`), dikirim ke page.jsx supaya bisa
  // digabung ke kotak pencarian bersama Site/Activity/POSM. Sama seperti
  // siteIndex di atas, dijaga pakai signature ringkas supaya TIDAK memicu
  // loop render tak berhenti.
  const territoryIndex = useMemo(() => {
    const kecList = [], kabMap = new Map(), mcMap = new Map();
    (layers || []).forEach((l) => (l.geojson?.features || []).forEach((f) => {
      const props = f.properties || {};
      const c = featureCentroid(f.geometry);
      if (!c) return;
      kecList.push({ kind: "Kecamatan", label: featTitle(props), key: featKey(props), lat: c.lat, lng: c.lng });
      const kab = props["KABKOT"];
      if (kab && !kabMap.has(kab)) kabMap.set(kab, { kind: "Kab/Kot", label: kab, field: "KABKOT", value: kab, lat: c.lat, lng: c.lng });
      const mc = props["MC IOH"];
      if (mc && !mcMap.has(mc)) mcMap.set(mc, { kind: "MC IOH", label: mc, field: "MC IOH", value: mc, lat: c.lat, lng: c.lng });
    }));
    return [...kecList, ...kabMap.values(), ...mcMap.values()];
  }, [layers]);
  const terrIdxSigRef = useRef("");
  useEffect(() => {
    if (!onTerritoryIndexChange) return;
    const sig = String(territoryIndex.length);
    if (sig === terrIdxSigRef.current) return;
    terrIdxSigRef.current = sig;
    onTerritoryIndexChange(territoryIndex);
  }, [territoryIndex, onTerritoryIndexChange]);

  // "Facet" Region/Branch/MC IOH - daftar kombinasi UNIK yang BENAR-BENAR ada
  // di berkas batas wilayah (shapefile) yang sedang dimuat, dipakai page.jsx
  // untuk mengisi pilihan dropdown filter Region/Branch/Micro Cluster LANGSUNG
  // dari sumber yang sama dengan poligonnya sendiri (bukan dari tabel
  // organisasi terpisah yang bisa beda ejaan/belum sinkron) - konsepnya sama
  // seperti Region yang sudah benar sebelumnya, sekarang berlaku jg utk
  // Branch & MC.
  const territoryFacets = useMemo(() => {
    const seen = new Set(); const rows = [];
    (layers || []).forEach((l) => (l.geojson?.features || []).forEach((f) => {
      const props = f.properties || {};
      const region = props["REGION"] || null, branch = props["BRANCH"] || null, mc = props["MC IOH"] || null;
      const key = `${region}|${branch}|${mc}`;
      if (seen.has(key)) return; seen.add(key);
      rows.push({ region, branch, mc });
    }));
    return rows;
  }, [layers]);
  const terrFacetsSigRef = useRef("");
  useEffect(() => {
    if (!onTerritoryFacetsChange) return;
    const sig = String(territoryFacets.length);
    if (sig === terrFacetsSigRef.current) return;
    terrFacetsSigRef.current = sig;
    onTerritoryFacetsChange(territoryFacets);
  }, [territoryFacets, onTerritoryFacetsChange]);

  // Pencarian memilih satu Kecamatan (bukan Kab/Kot atau MC) → fokuskan
  // persis seperti diklik langsung di peta (isolasi + panel kiri).
  const layersForFocusRef = useRef(layers); layersForFocusRef.current = layers;
  useEffect(() => {
    if (!focusTerritoryKey) return;
    for (const l of layersForFocusRef.current || []) {
      const f = (l.geojson?.features || []).find((ft) => featKey(ft.properties || {}) === focusTerritoryKey);
      if (f) { selectTerritory(f); break; }
    }
  }, [focusTerritoryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pencarian memilih Kab/Kot atau MC IOH (groupMatch, bisa banyak kecamatan)
  // → terbang ke gabungan batas semua kecamatan yang cocok (bukan cuma satu
  // titik), sorotan visualnya sendiri sudah ditangani effTerritoryFilter.
  useEffect(() => {
    if (!mapRef.current || !mapReady || !groupMatch) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const norm = (v) => String(v || "").trim().toLowerCase();
      const gv = norm(groupMatch.value);
      let b = null;
      (layers || []).forEach((l) => (l.geojson?.features || []).forEach((f) => {
        if (norm((f.properties || {})[groupMatch.field]) !== gv) return;
        try { const gb = L.geoJSON(f).getBounds(); if (gb.isValid()) b = b ? b.extend(gb) : gb; } catch { /* noop */ }
      }));
      if (b && b.isValid()) mapRef.current.flyToBounds(b, { padding: [56, 56], maxZoom: 13, duration: 0.9 });
    })();
  }, [groupMatch, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Halaman penuh (topbar + filter bar + area peta flex) baru betul-betul
  // "settle" ukurannya SETELAH render pertama - kalau peta dibangun tepat
  // saat container masih 0×0 (race umum di Next.js), Leaflet salah hitung
  // ukuran & tile-nya tidak pernah benar sampai ada trigger lain (makanya
  // dulu "cuma muncul kalau toggle dark/light" - toggle itu mengubah `dark`
  // dan memaksa peta dibangun ULANG saat layout sudah pasti settle). Sekarang
  // dipaksa membangun ulang SEKALI secara otomatis begitu layout settle,
  // sama seperti MapCard - jadi tidak perlu toggle apa pun lagi.
  useEffect(() => {
    const id = setTimeout(() => setBoot((b) => b + 1), 400);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMapReady(false);
    (async () => {
      if (!boxRef.current || mapRef.current) return;
      const map = await buildBaseMap(boxRef.current, { dark, expanded: true });
      if (!map) return; if (cancelled) { map.remove(); return; }
      mapRef.current = map; fgRef.current = null; sitesFgRef.current = null; activitiesFgRef.current = null; posmFgRef.current = null;
      // appBg TIDAK dioper lagi di sini (expanded=true) - dulu dipakai utk
      // "menutupi" area luar Sumatera dgn abu-abu polos senada background,
      // sekarang base map-nya tile OSM sungguhan jadi area luar Sumatera
      // (laut, pulau lain) harus tetap kelihatan tile-nya, bukan ketutup.
      await paintOverlays(map, fgRef, layersRef.current, { expanded: true, appBg: mapStyle === "plain" ? t.appBg : undefined, featureFilter: effTerritoryFilterRef.current, selectedKeyRef: selectedTerrKeyRef, onSelectTerritory: selectTerritory });
      paintSites(map, sitesFgRef, siteRef.current, { selectedIdRef: selectedSiteIdRef, onSelectSite: selectSite });
      paintActivities(map, activitiesFgRef, activityRef.current, { expanded: true });
      paintPosm(map, posmFgRef, posmRef.current, { expanded: true });
      if (!cancelled) setMapReady(true);
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; fgRef.current = null; sitesFgRef.current = null; activitiesFgRef.current = null; posmFgRef.current = null; tileLayerRef.current = null; addrFgRef.current = null; } };
  }, [dark, boot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter dropdown Region/Branch/MC (territoryFilter) dipilih TANPA lewat
  // pencarian nama → terbang ke gabungan batas SEMUA kecamatan yang cocok,
  // sama seperti groupMatch dari pencarian Kab/Kot/MC IOH - supaya outline
  // kecamatan yang lolos filter benar-benar "aktif" kelihatan di layar
  // (di-frame kamera-nya), bukan cuma diredupkan diam di tempat sementara
  // kamera tetap di posisi semula/ikut titik Activity-POSM yang belum tentu
  // mewakili seluruh wilayahnya (bisa kosong kalau region itu belum ada
  // titik Activity/POSM sama sekali).
  useEffect(() => {
    if (!mapRef.current || !mapReady || !territoryFilter || groupMatch || isoFeature) return;
    (async () => {
      const L = (await import("leaflet")).default;
      let b = null;
      (layers || []).forEach((l) => (l.geojson?.features || []).forEach((f) => {
        if (!territoryFilter(f.properties || {})) return;
        try { const gb = L.geoJSON(f).getBounds(); if (gb.isValid()) b = b ? b.extend(gb) : gb; } catch { /* noop */ }
      }));
      if (b && b.isValid()) mapRef.current.flyToBounds(b, { padding: [56, 56], maxZoom: 12, duration: 0.9 });
    })();
  }, [territoryFilter, mapReady, groupMatch, isoFeature, layers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Region/Branch/MC dipilih di filter bar → peta "berpindah" (flyTo) ke
  // wilayah itu, bukan cuma nyaring titik diam di tempat. `flyTo` dioper dari
  // page.jsx: null = tampilkan semua Sumatera, atau L.LatLngBounds-able array
  // titik hasil filter saat ini. Kalau territoryFilter aktif, efek di atas
  // yang mengambil alih kamera (batas kecamatan lebih representatif daripada
  // titik Activity/POSM saja) - efek ini hanya jalan utk reset ke Sumatera
  // saat filter dikosongkan lagi.
  useEffect(() => {
    if (!mapRef.current || !mapReady || isoFeature || territoryFilter) return; // saat fokus kecamatan / filter territory aktif, zoom diatur efek lain
    (async () => {
      const L = (await import("leaflet")).default;
      if (flyTo && flyTo.length) {
        const b = L.latLngBounds(flyTo.map((p) => [p.lat, p.lng]));
        if (b.isValid()) mapRef.current.flyToBounds(b, { padding: [48, 48], maxZoom: 13, duration: 1.1 });
      } else {
        mapRef.current.flyToBounds(SUMATRA_BOUNDS, { animate: true, duration: 1.1 });
      }
    })();
  }, [flyTo, mapReady, isoFeature, territoryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Klik kecamatan → peta "terbang" halus ke batas kecamatan itu SEKALI saat
  // fokus dimulai (bukan reset ke Sumatera penuh spt bug lama). Tutup fokus →
  // terbang balik ke seluruh Sumatera. Scale/zoom TIDAK ikut disentuh oleh
  // repaint filter/toggle layer lain selama fokus aktif (lihat _mhFitted).
  const wasIsoRef = useRef(false);
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    (async () => {
      const L = (await import("leaflet")).default;
      if (isoFeature) {
        try {
          const b = L.geoJSON(isoFeature).getBounds();
          if (b.isValid()) mapRef.current.flyToBounds(b, { padding: [64, 64], maxZoom: 14, duration: 0.9 });
        } catch { /* noop */ }
        wasIsoRef.current = true;
      } else if (wasIsoRef.current) {
        mapRef.current.flyToBounds(SUMATRA_BOUNDS, { animate: true, duration: 0.9 });
        wasIsoRef.current = false;
      }
    })();
  }, [isoFeature, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (mapRef.current) paintOverlays(mapRef.current, fgRef, visLayers, { expanded: true, appBg: mapStyle === "plain" ? t.appBg : undefined, featureFilter: effTerritoryFilter, selectedKeyRef: selectedTerrKeyRef, onSelectTerritory: selectTerritory, interactiveAll: !!isoFeature }); }, [visLayers, effTerritoryFilter, selVersion, isoFeature, mapStyle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintSites(mapRef.current, sitesFgRef, visSite, { selectedIdRef: selectedSiteIdRef, onSelectSite: selectSite }); }, [visSite, selVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintActivities(mapRef.current, activitiesFgRef, visActivity, { expanded: true }); }, [visActivity]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapRef.current) paintPosm(mapRef.current, posmFgRef, visPosm, { expanded: true }); }, [visPosm]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle "Peta Detail" (tile OSM/CARTO sungguhan) - dipasang/dicabut
  // LANGSUNG lewat layer terpisah (bukan rebuild seluruh peta), jadi ringan &
  // instan, tanpa nge-lag walau di-toggle bolak-balik.
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;
      const map = mapRef.current;
      if (tileLayerRef.current) { try { map.removeLayer(tileLayerRef.current); } catch { /* noop */ } tileLayerRef.current = null; }
      if (mapStyle === "detail") {
        const tileUrl = dark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        const layer = L.tileLayer(tileUrl, {
          maxZoom: 19, subdomains: dark ? "abcd" : "abc",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' + (dark ? ' &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' : ""),
        });
        layer.addTo(map);
        try { layer.bringToBack(); } catch { /* noop */ }
        tileLayerRef.current = layer;
        map.getContainer().style.background = "transparent";
      } else {
        map.getContainer().style.background = dark ? "#1B2130" : "#E4E8EE";
      }
    })();
    return () => { cancelled = true; };
  }, [mapStyle, dark, mapReady]);
  // Pin pencarian alamat digambar/dipindah tiap addressPoint berubah (baik
  // dari hasil pencarian baru MAUPUN dari update posisi setelah digeser).
  useEffect(() => { if (mapRef.current) paintAddressPoint(mapRef.current, addrFgRef, addressPoint, onAddressPoint); }, [addressPoint, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // Hasil pencarian alamat BARU (bukan sekadar geser pin) → terbang ke titik
  // itu & otomatis nyalakan Peta Detail (baru relevan begitu ada lokasi yang
  // sedang dicek). addressFlySeq sengaja counter TERPISAH dari addressPoint
  // supaya geser pin (dragend, memperbarui addressPoint juga) TIDAK memicu
  // kamera "melompat" balik ke posisi pin, hanya pencarian baru yang terbang.
  useEffect(() => {
    if (!mapRef.current || !mapReady || !addressPoint || !addressFlySeq) return;
    setMapStyle("detail");
    try { mapRef.current.flyTo([addressPoint.lat, addressPoint.lng], Math.max(mapRef.current.getZoom(), 16), { animate: true, duration: 0.8 }); } catch { /* noop */ }
  }, [addressFlySeq, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Jumlah kecamatan (bukan Kab/Kot atau MC IOH) - dipakai label chip
  // "Wilayah" supaya kelihatan ada berapa banyak sebelum ditampilkan.
  const kecamatanCount = useMemo(() => territoryIndex.filter((it) => it.kind === "Kecamatan").length, [territoryIndex]);
  const LAYER_CHIPS = [
    { id: "territory", label: "Wilayah", color: "#7C9CF2", count: kecamatanCount },
    { id: "site", label: "Site", color: SITE_COLOR, count: siteData.length },
    { id: "activity", label: "Activity", color: "#C6168D", count: activityPoints.length },
    { id: "posm", label: "POSM", color: POSM_COLOR, count: posmPoints.length },
  ];

  return (
    <div className="mh-map-container" style={{ position: "relative", width: "100%", height: "100%", minHeight: 0, borderRadius: 14, overflow: "hidden", border: `1px solid ${t.line}`, isolation: "isolate" }}>
      <MapResponsiveStyle />
      <div ref={boxRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />
      {!mapReady && <MapSkeleton t={t} />}
      <DetailPanel t={t} open={!!selected} onClose={closePanel}>
        {selected?.type === "site" && <div dangerouslySetInnerHTML={{ __html: selected.html || "" }} />}
        {selected?.type === "territory" && isoFeature && (
          <TerritoryDetail t={t} feature={isoFeature}
            counts={{ site: isoSitePts.length, activity: isoActivityPts.length, posm: isoPosmPts.length }}
            periodMonth={periodMonth} periodOptions={periodOptions} onPeriodChange={setPeriodMonth} />
        )}
      </DetailPanel>
      {/* Toolbar kiri-atas dihapus - semua kontrol (toggle layer, mode
          ringkas, gaya peta, filter, pencarian) sekarang terpusat di kartu
          "Konfigurasi & Filter" (kanan), sesuai permintaan: satu pusat
          konfigurasi, bukan tersebar di beberapa toolbar. */}
      {/* Kolom kanan: legend status + kartu ringkasan Activity/POSM/Site.
          Sengaja diletakkan di KANAN (bukan kiri-bawah lagi) supaya tetap
          terlihat & bisa dipakai walau sedang memilih/fokus satu kecamatan
          atau site - panel detail kiri (DetailPanel) hanya menutupi sisi
          kiri peta, jadi kolom ini tidak pernah tertutup olehnya. */}
      <div style={{ position: "absolute", top: 14, right: 14, bottom: 14, zIndex: 720, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto", flexShrink: 0 }}>
          <MapLegend t={t} show={visActivity.length > 0} showPosm={visPosm.length > 0} style={{ position: "relative", left: "auto", bottom: "auto", right: "auto" }} />
        </div>
        <div style={{ pointerEvents: "auto", flex: statsMinimized ? "0 0 auto" : "1 1 auto", minHeight: 0, maxHeight: "100%", display: "flex" }}>
          <MapStatsCard t={t} activities={visActivity} posms={visPosm} sites={visSite}
            onSelectActivity={focusActivity} onSelectPosm={focusPosm} onSelectSite={focusSite}
            activeSiteKey={selectedSiteIdRef.current} style={{ maxHeight: "100%" }} filterUi={filterUi}
            layerToggle={{ items: LAYER_CHIPS, vis: layerVis, onToggle: (id) => setLayerVis((v) => ({ ...v, [id]: !v[id] })) }}
            searchUi={searchUi} mapStyleUi={{ mapStyle, setMapStyle, addressPoint }}
            minimized={statsMinimized} onToggleMinimize={() => setStatsMinimized((v) => !v)} />
        </div>
      </div>
      {loc.err && (
        <div className="mh-map-strip-badge" style={{ position: "absolute", bottom: 14, left: 14, zIndex: 650, fontWeight: 700, color: C.error, background: C.errorL, border: `1px solid ${C.error}30`, borderRadius: 999 }}>{loc.err}</div>
      )}
      <button onClick={() => locateMe(mapRef.current, myLocRef, setLoc)} title="Tarik ke lokasi saya" disabled={loc.busy}
        style={{ position: "absolute", bottom: 14, right: 14, zIndex: 650, width: 40, height: 40, borderRadius: 12, background: t.card, border: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: MY_LOC_COLOR, boxShadow: "0 4px 14px rgba(0,0,0,0.18)", cursor: loc.busy ? "default" : "pointer" }}>
        {loc.busy ? <span className="mh-map-spin" style={{ display: "flex" }}><I name="spinner" size={18} color={MY_LOC_COLOR} /></span> : <I name="locate" size={18} color={MY_LOC_COLOR} />}
      </button>
      <LayerPanel t={t} geo={geo} canManage={canManage} layerVis={layerVis} onToggleLayer={(id) => setLayerVis((v) => ({ ...v, [id]: !v[id] }))} style={{ position: "absolute", top: 56, right: 14, zIndex: 700, width: 280, maxHeight: "calc(100% - 70px)", overflowY: "auto" }} />
    </div>
  );
}
