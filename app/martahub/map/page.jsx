"use client";
import { useState, useEffect, useMemo } from "react";
import { getMartaScope, applyMartaScope, applyMartaScopeSlug, loadBranchMap, loadSlugRegionMap } from "../../../lib/martaScope";
import { supabaseMarta } from "../../../lib/supabaseMarta";
import MartaShell from "../components/MartaShell";
import MapFull from "../components/SumatraMap";

// Sama seperti dashboard (app/martahub/page.jsx) - data mh_activities direset
// & mulai lagi dari Agustus 2026, jadi fetch peta di sini juga dibatasi dari
// titik yang sama (bukan rolling window dari hari ini).
const MIN_MONTH_KEY = "2026-08";

const mk = (d) => ({
  appBg: d ? "#0A0C10" : "#F0F4FA",
  surface: d ? "#111520" : "#FFFFFF",
  card: d ? "#141824" : "#FFFFFF",
  hover: d ? "#1A2030" : "#F0F4FA",
  line: d ? "#1E2435" : "#E3E8F0",
  hi: d ? "#E8EDF8" : "#0D1117",
  mid: d ? "#7B8BAD" : "#4A5568",
  lo: d ? "#4A5A7D" : "#7B8BAD",
});

// Warna & label per jenis saran pencarian - Kecamatan/Kab-Kot/MC IOH (batas
// wilayah) dibedakan dari Site/Activity/POSM supaya sekali lihat langsung
// kebaca sedang mencari apa. Dipakai di dalam kartu "Konfigurasi & Filter"
// (SumatraMap.jsx, MapStatsCard) lewat prop searchUi.kindStyle.
const SEARCH_KIND_STYLE = {
  Kecamatan: { color: "#7C9CF2", label: "Kecamatan" },
  "Kab/Kot": { color: "#3949AB", label: "Kab/Kot" },
  "MC IOH": { color: "#C6168D", label: "MC IOH" },
  Site: { color: "#0B8A7A", label: "Site" },
  Activity: { color: "#ED1C24", label: "Activity" },
  POSM: { color: "#F57F17", label: "POSM" },
};

function ThemeToggle({ dark, onToggle, t }) {
  return (
    <button onClick={onToggle} title="Ganti tema"
      style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${t.line}`, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
      {dark
        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.mid} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.2" y1="4.2" x2="5.6" y2="5.6" /><line x1="18.4" y1="18.4" x2="19.8" y2="19.8" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.2" y1="19.8" x2="5.6" y2="18.4" /><line x1="18.4" y1="5.6" x2="19.8" y2="4.2" /></svg>
        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.mid} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>}
    </button>
  );
}

// ── Konten Map Intelligence itu sendiri - dipisah dari default export supaya
// bisa dirender sbg children(ctx) milik <MartaShell>. MartaShell yang urus
// guard akses, sidebar navigasi (tetap bisa pindah ke menu lain langsung
// dari sini, tidak perlu klik "kembali" dulu), & profil/scope pengguna.
function MapIntelligenceBody({ ctx }) {
  const [dark, setDark] = useState(false);
  const [activityPoints, setActivityPoints] = useState([]); // {lat,lng,name,statusKey,branchId,branchName,region,mc}
  const [posmPoints, setPosmPoints] = useState([]);          // {lat,lng,name,branch,mode,region}
  const t = mk(dark);

  // ── Filter Region / Branch / MC (dipakai jg utk summary count di peta) ─────
  const [filterRegion, setFilterRegion] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [filterMc, setFilterMc] = useState("");
  // Region dari scope TMV - baru benar2 diterapkan ke filterRegion SETELAH
  // regionList (dari shapefile yang dihubungkan) tersedia, supaya ejaan/
  // casing-nya cocok persis dgn salah satu opsi dropdown (dicari case-
  // insensitive, bukan asal disamakan).
  const [pendingScopeRegion, setPendingScopeRegion] = useState(null);

  // ── Search cepat (Site / Activity / POSM / Kecamatan / Kab-Kot / MC IOH)
  // dgn saran otomatis → langsung terbang & "menandai" (highlight) hasilnya
  // di peta. siteIndex & territoryIndex dikirim balik dari MapFull (datanya
  // hidup di komponen itu - IndexedDB lokal utk site, layer batas wilayah
  // yang sudah dimuat utk territory - bukan di halaman ini).
  const [searchQ, setSearchQ] = useState("");
  const [searchHit, setSearchHit] = useState(null); // {lat,lng} titik terakhir dicari, dipakai sbg flyTo override
  const [searchErr, setSearchErr] = useState("");
  const [siteIndex, setSiteIndex] = useState([]); // [{id,name,lat,lng}]
  const [territoryIndex, setTerritoryIndex] = useState([]); // [{kind,label,key|field+value,lat,lng}]
  // Kombinasi Region/Branch/MC IOH UNIK yang benar-benar ada di berkas batas
  // wilayah (shapefile) yang sedang dimuat - dilaporkan balik oleh MapFull
  // (lihat territoryFacets di SumatraMap.jsx). Dipakai LANGSUNG utk mengisi
  // pilihan dropdown filter, supaya Branch & Micro Cluster konsepnya SAMA
  // dengan Region (sumbernya berkas yang dihubungkan, bukan tabel organisasi
  // terpisah yang ejaannya bisa beda/belum tentu sinkron).
  const [territoryFacets, setTerritoryFacets] = useState([]); // [{region,branch,mc}]
  const [showSuggest, setShowSuggest] = useState(false);
  // Hasil pencarian ALAMAT/JALAN sungguhan (bukan data internal kita) - via
  // Nominatim (OpenStreetMap), di-debounce, dibatasi wilayah Sumatera lewat
  // bounding box supaya hasilnya relevan, kolom TERPISAH dari pencarian data
  // internal di atas. Hasilnya taruh pin draggable di peta & otomatis bisa
  // dipakai menyalakan mode "Peta Detail" (tile jalan sungguhan).
  const [addrQ, setAddrQ] = useState("");
  const [addrSuggestions, setAddrSuggestions] = useState([]);
  const [showAddrSuggest, setShowAddrSuggest] = useState(false);
  const [addrPoint, setAddrPoint] = useState(null); // {lat,lng,label}
  const [addrFlySeq, setAddrFlySeq] = useState(0);   // naik cuma saat pencarian BARU (bukan saat geser pin)
  useEffect(() => {
    const q = addrQ.trim();
    if (q.length < 3) { setAddrSuggestions([]); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=id&viewbox=94.5,6.5,106.5,-6.5&bounded=1&limit=6`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        const rows = await res.json();
        if (cancelled) return;
        setAddrSuggestions((rows || []).map((r) => ({
          kind: "Alamat", name: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon),
        })));
      } catch { if (!cancelled) setAddrSuggestions([]); }
    }, 450);
    return () => { cancelled = true; clearTimeout(id); };
  }, [addrQ]);
  const pickAddress = (it) => {
    setAddrQ(it.name || "");
    setShowAddrSuggest(false);
    setAddrPoint({ lat: it.lat, lng: it.lng, label: it.name });
    setAddrFlySeq((n) => n + 1);
  };
  const clearAddress = () => { setAddrQ(""); setAddrSuggestions([]); setShowAddrSuggest(false); setAddrPoint(null); };
  // Pin digeser di peta → posisi baru dilaporkan balik ke sini (label lama
  // dipertahankan, cuma koordinatnya yang berubah) - TIDAK menaikkan
  // addrFlySeq, supaya kamera tidak "melompat" balik ke posisi pin sendiri.
  const onAddressDrag = (pos) => setAddrPoint((p) => (p ? { ...p, lat: pos.lat, lng: pos.lng } : p));
  // Hasil pencarian yang sedang "ditandai" di peta - satu kecamatan (fokus
  // penuh, isolasi) ATAU sekumpulan kecamatan senama Kab/Kot|MC IOH (dimming
  // ke yang cocok saja, tanpa isolasi tunggal).
  const [focusTerritoryKey, setFocusTerritoryKey] = useState(null);
  const [groupMatch, setGroupMatch] = useState(null); // {field,value}|null

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("hub-theme") : null;
    if (saved) setDark(saved !== "light");
    else if (typeof window !== "undefined") setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  // Data Activity/POSM - diambil begitu profil/scope pengguna (dari
  // MartaShell) tersedia, bukan lagi lewat guardMarta sendiri di halaman ini.
  useEffect(() => {
    const email = ctx?.profile?.email || ctx?.session?.user?.email;
    if (!email) return;
    (async () => {
      try {
        const sc = await getMartaScope(email);
        // Auto-scope wilayah: kalau yang login TMV (region tunggal, bukan
        // "semua"/unscoped), peta langsung terpotong ke region-nya sendiri
        // saat pertama buka - tidak perlu pilih manual dulu. Role yg
        // scope-nya "semua" (Head/Admin/SPM Sumatera) tetap default kosong
        // (lihat seluruh Sumatera dulu, spt sebelumnya).
        if (sc.found && !sc.unscoped && sc.region) setPendingScopeRegion(sc.region);

        // Titik Activity (mh_activities.branch_id = uuid mh_branches.id) &
        // Titik POSM (mh_md_installations.branch_id = slug text - scoping
        // beda jalur, lihat applyMartaScopeSlug di lib/martaScope.js), plus
        // peta branch (utk resolve nama & region) - SEMUA jalan PARALEL
        // (Promise.all), bukan berurutan, supaya peta tampil lebih cepat.
        const sinceISO = `${MIN_MONTH_KEY}-01`;
        let aq = supabaseMarta.from("mh_activities")
          .select("id,status,event_name,branch_id,mc,plan_date,latitude,longitude")
          .gte("plan_date", sinceISO).not("latitude", "is", null).not("longitude", "is", null)
          .order("plan_date", { ascending: false }).limit(1000);
        let pq = supabaseMarta.from("mh_md_installations")
          .select("id,mode,site_id,street_description,branch_id,brand,created_at,latitude,longitude")
          .not("latitude", "is", null).not("longitude", "is", null)
          .order("created_at", { ascending: false }).limit(1000);
        const [aqScoped, pqScoped, bMap, slugRegion] = await Promise.all([
          applyMartaScope(aq, sc), applyMartaScopeSlug(pq, sc), loadBranchMap(), loadSlugRegionMap(),
        ]);
        const [{ data: aRows, error: aErr }, { data: pRows, error: pErr }] = await Promise.all([aqScoped, pqScoped]);
        if (!aErr) setActivityPoints((aRows || []).map((r) => {
          const b = r.branch_id ? bMap.get(r.branch_id) : null;
          return {
            lat: r.latitude, lng: r.longitude, name: r.event_name || "Aktivitas", statusKey: r.status || "draft",
            branchId: r.branch_id || null, branchName: b?.name || null, region: b?.region || null, mc: r.mc || null,
            date: r.plan_date || null, // dipakai filter periode & suggestion pencarian
          };
        }));
        if (!pErr) setPosmPoints((pRows || []).map((r) => ({
          lat: r.latitude, lng: r.longitude,
          name: r.mode === "activity" ? "Instalasi POSM" : r.mode === "outlet" ? (r.site_id || "POSM Outlet") : (r.street_description || "Street Branding"),
          branch: r.branch_id ? r.branch_id.replace(/-/g, " ").toUpperCase() : null,
          mode: r.mode, region: r.branch_id ? slugRegion.get(r.branch_id) || null : null,
          date: r.created_at ? String(r.created_at).slice(0, 10) : null,
        })));
      } catch { /* best-effort - peta tetap tampil tanpa titik kalau gagal */ }
    })();
  }, [ctx?.profile?.email, ctx?.session?.user?.email]);

  const toggleTheme = () => { const n = !dark; setDark(n); if (typeof window !== "undefined") localStorage.setItem("hub-theme", n ? "dark" : "light"); };

  // ── Opsi dropdown & data ter-filter ─────────────────────────────────────────
  // Region, Branch, DAN Micro Cluster (MC IOH) semuanya sekarang diturunkan
  // LANGSUNG dari territoryFacets - kombinasi unik yang benar-benar ada di
  // berkas batas wilayah (shapefile) yang sedang dihubungkan.
  const norm = (v) => String(v || "").trim().toLowerCase();
  const regionList = useMemo(() => [...new Set(territoryFacets.map((f) => f.region).filter(Boolean))].sort(), [territoryFacets]);
  useEffect(() => {
    if (!pendingScopeRegion || filterRegion || regionList.length === 0) return;
    const match = regionList.find((r) => norm(r) === norm(pendingScopeRegion));
    setFilterRegion(match || pendingScopeRegion);
    setPendingScopeRegion(null);
  }, [pendingScopeRegion, regionList, filterRegion]);
  const branchOptions = useMemo(() => [...new Set(
    territoryFacets.filter((f) => (!filterRegion || norm(f.region) === norm(filterRegion)) && f.branch).map((f) => f.branch)
  )].sort(), [territoryFacets, filterRegion]);
  const mcOptions = useMemo(() => [...new Set(
    territoryFacets.filter((f) => (!filterRegion || norm(f.region) === norm(filterRegion)) && (!filterBranch || norm(f.branch) === norm(filterBranch)) && f.mc).map((f) => f.mc)
  )].sort(), [territoryFacets, filterRegion, filterBranch]);
  // Branch → Region, dipakai siteFilter di bawah (site tidak punya kolom
  // REGION sendiri, cuma BRANCH & MC) - sumbernya SAMA (territoryFacets).
  const branchNameToRegion = useMemo(() => { const m = new Map(); territoryFacets.forEach((f) => { if (f.branch) m.set(norm(f.branch), f.region); }); return m; }, [territoryFacets]);

  const filteredActivityPoints = useMemo(() => activityPoints.filter((p) =>
    (!filterRegion || norm(p.region) === norm(filterRegion)) && (!filterBranch || norm(p.branchName) === norm(filterBranch)) && (!filterMc || norm(p.mc) === norm(filterMc))
  ), [activityPoints, filterRegion, filterBranch, filterMc]);

  // POSM: branch_id di tabelnya SLUG TEXT (bukan uuid mh_branches), jadi hanya
  // bisa di-scope sampai level Region (lewat mh_sites.region). Filter
  // Branch/MC sengaja TIDAK diterapkan ke POSM supaya tidak menyembunyikan
  // data secara keliru.
  const filteredPosmPoints = useMemo(() => posmPoints.filter((p) => !filterRegion || norm(p.region) === norm(filterRegion)), [posmPoints, filterRegion]);

  // Titik Site (data lokal IndexedDB, dikelola SumatraMap sendiri) - filter
  // dioper sbg PREDIKAT ke MapFull (bukan array), karena datanya tidak hidup
  // di komponen ini. Property CSV/Excel site pakai key "BRANCH" & "MC".
  const siteFilter = useMemo(() => {
    if (!filterRegion && !filterBranch && !filterMc) return null;
    return (site) => {
      const p = site.props || {};
      if (filterBranch) { if (norm(p["BRANCH"]) !== norm(filterBranch)) return false; }
      else if (filterRegion) { if (branchNameToRegion.get(norm(p["BRANCH"])) == null || norm(branchNameToRegion.get(norm(p["BRANCH"]))) !== norm(filterRegion)) return false; }
      if (filterMc && norm(p["MC"]) !== norm(filterMc)) return false;
      return true;
    };
  }, [filterRegion, filterBranch, filterMc, branchNameToRegion]);

  // Outline Batas Wilayah - kecamatan yang cocok tetap warna penuh, yang
  // tidak cocok diredupkan (bukan dihilangkan, supaya konteks peta tetap utuh).
  const territoryFilter = useMemo(() => {
    if (!filterRegion && !filterBranch && !filterMc) return null;
    return (props) => {
      if (filterBranch) {
        if (norm(props["BRANCH"]) !== norm(filterBranch)) return false;
      } else if (filterRegion) {
        if (norm(props["REGION"]) !== norm(filterRegion)) return false;
      }
      if (filterMc && norm(props["MC IOH"]) !== norm(filterMc)) return false;
      return true;
    };
  }, [filterRegion, filterBranch, filterMc]);

  const hasFilter = !!(filterRegion || filterBranch || filterMc);
  const clearFilter = () => { setFilterRegion(""); setFilterBranch(""); setFilterMc(""); };

  // Region/Branch/MC dipilih → peta "berpindah" (flyTo) ke titik-titik yang
  // lolos filter itu. Pencarian nama (searchHit) menang atas filter kalau
  // keduanya aktif (paling spesifik). null = balik ke tampilan Sumatera.
  const flyTo = useMemo(() => {
    if (searchHit) return [searchHit];
    return hasFilter ? [...filteredActivityPoints, ...filteredPosmPoints] : null;
  }, [searchHit, hasFilter, filteredActivityPoints, filteredPosmPoints]);

  // Gabungan sumber pencarian: Site + Activity + POSM + Kecamatan/Kab-Kot/MC
  // IOH (batas wilayah), masing-masing dilabeli jenisnya.
  const searchPool = useMemo(() => [
    ...territoryIndex.map((it) => ({ ...it, name: it.label })),
    ...siteIndex.filter((s) => s.lat && s.lng).map((s) => ({ kind: "Site", name: s.name || s.id || "Site", lat: s.lat, lng: s.lng })),
    ...filteredActivityPoints.map((p) => ({ kind: "Activity", name: p.name, lat: p.lat, lng: p.lng })),
    ...filteredPosmPoints.map((p) => ({ kind: "POSM", name: p.name, lat: p.lat, lng: p.lng })),
  ], [territoryIndex, siteIndex, filteredActivityPoints, filteredPosmPoints]);

  const suggestions = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    return searchPool.filter((it) => (it.name || "").toLowerCase().includes(q)).slice(0, 8);
  }, [searchQ, searchPool]);

  // Pilih satu saran → "tandai" hasilnya di peta: Kecamatan → fokus/isolasi
  // penuh (spt diklik langsung); Kab/Kot atau MC IOH → sorot semua kecamatan
  // yang cocok (bisa lebih dari satu); Site/Activity/POSM → terbang ke
  // titiknya spt sebelumnya.
  const pickSuggestion = (it) => {
    setSearchQ(it.name || "");
    setSearchErr("");
    setShowSuggest(false);
    if (it.kind === "Kecamatan") {
      setGroupMatch(null);
      setFocusTerritoryKey(it.key);
      setSearchHit(null);
    } else if (it.kind === "Kab/Kot" || it.kind === "MC IOH") {
      setFocusTerritoryKey(null);
      setGroupMatch({ field: it.field, value: it.value });
      setSearchHit(null);
    } else {
      setFocusTerritoryKey(null);
      setGroupMatch(null);
      setSearchHit({ lat: it.lat, lng: it.lng });
    }
  };
  const runSearch = () => {
    const q = searchQ.trim().toLowerCase();
    setSearchErr("");
    setShowSuggest(false);
    if (!q) { setSearchHit(null); return; }
    const hit = searchPool.find((it) => (it.name || "").toLowerCase().includes(q));
    if (hit) pickSuggestion(hit);
    else { setSearchHit(null); setSearchErr("Tidak ditemukan di data yang sedang tampil."); }
  };
  const clearSearch = () => {
    setSearchQ(""); setSearchHit(null); setSearchErr(""); setShowSuggest(false);
    setFocusTerritoryKey(null); setGroupMatch(null);
  };

  // Semua kontrol pencarian internal - dioper SATU objek ke MapFull →
  // MapStatsCard, dirender di dalam kartu "Konfigurasi & Filter" (kanan),
  // bukan lagi toolbar terpisah di atas peta.
  const searchUi = {
    searchQ, setSearchQ, showSuggest, setShowSuggest, suggestions, pickSuggestion, runSearch, clearSearch, searchErr,
    addrQ, setAddrQ, showAddrSuggest, setShowAddrSuggest, addrSuggestions, pickAddress, clearAddress, addrPoint,
    kindStyle: SEARCH_KIND_STYLE,
  };

  return (
    <div style={{ position: "relative", margin: "-22px -26px -60px", height: "calc(100vh - 60px)", overflow: "hidden" }}>
      <MapFull t={t} dark={dark} canManage={!!ctx?.canManage} activityPoints={filteredActivityPoints} posmPoints={filteredPosmPoints} siteFilter={siteFilter} flyTo={flyTo} territoryFilter={territoryFilter} onSitesChange={setSiteIndex} onTerritoryIndexChange={setTerritoryIndex} onTerritoryFacetsChange={setTerritoryFacets} focusTerritoryKey={focusTerritoryKey} groupMatch={groupMatch}
        addressPoint={addrPoint} addressFlySeq={addrFlySeq} onAddressPoint={onAddressDrag}
        searchUi={searchUi}
        filterUi={{
          regionList, branchOptions, mcOptions,
          filterRegion, filterBranch, filterMc,
          setFilterRegion: (v) => { setFilterRegion(v); setFilterBranch(""); setFilterMc(""); },
          setFilterBranch: (v) => { setFilterBranch(v); setFilterMc(""); },
          setFilterMc,
          hasFilter, clearFilter,
        }} />
      <div style={{ position: "absolute", top: 14, left: 14, zIndex: 730 }}>
        <ThemeToggle dark={dark} onToggle={toggleTheme} t={t} />
      </div>
    </div>
  );
}

// Sidebar navigasi (MartaShell, sama seperti semua menu MartaHub lain) TETAP
// tampil di Map Intelligence - sebelumnya halaman ini full-screen sendiri
// dgn cuma tombol "kembali", sekarang bisa langsung pindah ke menu lain
// tanpa harus balik ke Dashboard dulu.
export default function MapIntelligencePage() {
  return (
    <MartaShell active="map" title="Map Intelligence">
      {(ctx) => <MapIntelligenceBody ctx={ctx} />}
    </MartaShell>
  );
}
