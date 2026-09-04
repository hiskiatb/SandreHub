"use client";
/**
 * /martahub/m/map - Peta lokasi (web mobile), padanan konsep "Peta" yang
 * sebelumnya di-mark SEGERA di Menu Home. Konsep visualnya SENGAJA disamakan
 * dgn "Activity Map" desktop (app/martahub/components/SumatraMap.jsx) yang
 * sudah terbukti jalan: basemap LocationIQ "streets" (satu provider dgn
 * search/reverse-geocode di seluruh MartaHub - lihat lib/locationiqTiles.js),
 * view+pan DIKUNCI ke batas Pulau Sumatera saja (maxBounds), dan ada
 * pencarian tempat (dibatasi ke Indonesia/area Sumatera lewat viewbox
 * LocationIQ, proxy via edge function `locationiq`).
 *
 * Dua layer, bisa ditoggle independen:
 *   - Event  → lokasi aktivitas/plan milik pengguna (mh_activities_for_me,
 *     kolom latitude/longitude - HANYA baris yg titiknya sudah terisi,
 *     mis. dari check-in atau lokasi rencana; yang belum ada koordinat
 *     tidak muncul di peta, bukan error).
 *   - POSMAT → lokasi instalasi POSM milik pengguna (RPC
 *     mh_md_list_my_installations, sudah self-scoped server-side ke
 *     assignment pengguna yg login - SAMA PERSIS pola RPC "for me" lain di
 *     app ini, jadi tidak perlu query tambahan utk scoping).
 * Tap pin di peta ATAU baris di daftar sama-sama membuka panel detail yang
 * sama, lengkap dgn tombol "Lihat Detail" ke halaman terkait.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Crosshair, ListChecks, PackageCheck, X, MapPin as MapPinIcon, Search } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { locationiqTileUrl, LOCATIONIQ_TILE_SUBDOMAINS, LOCATIONIQ_TILE_ATTRIBUTION, LOCATIONIQ_TILE_MAX_ZOOM } from "../../../../lib/locationiqTiles";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { loadLeaflet } from "../_shared/MapPickerSheet";
import { statusMeta, fmtDate } from "../_shared/activityUi";

const EVENT_COLOR = "#ED1C24";
const POSM_COLOR = "#B32E85";
// Batas Pulau Sumatera - SAMA PERSIS dgn SUMATRA_BOUNDS di SumatraMap.jsx
// (Activity Map desktop), supaya peta mobile ini tidak bisa di-pan/zoom-out
// sampai keluar pulau.
const SUMATRA_BOUNDS = [[-6.6, 94.4], [6.7, 107.1]];
const SUMATRA_VIEWBOX = "94.4,6.7,107.1,-6.6"; // left,top,right,bottom - utk batasi hasil pencarian Nominatim

function pinDivIcon(L, color, active) {
  return L.divIcon({
    className: "",
    html: `<div style="width:${active ? 34 : 28}px;height:${active ? 34 : 28}px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(17,17,20,0.28);border:2px solid #fff;"></div>`,
    iconSize: [active ? 34 : 28, active ? 34 : 28],
    iconAnchor: [active ? 17 : 14, active ? 34 : 28],
  });
}

export default function MartaMapPage() {
  const router = useRouter();
  const { loading: sessionLoading } = useMartaSession();
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [events, setEvents] = useState([]);
  const [posm, setPosm] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataErr, setDataErr] = useState("");
  const [showEvents, setShowEvents] = useState(true);
  const [showPosm, setShowPosm] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [locating, setLocating] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchDebounceRef = useRef(null);
  const searchReqId = useRef(0);

  // Data - dua sumber independen, best-effort (satu gagal tidak
  // menjatuhkan yang lain).
  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabaseMarta
          .rpc("mh_activities_for_me")
          .select("id,event_name,brand,status,plan_date,site_id,latitude,longitude")
          .order("plan_date", { ascending: false })
          .limit(300);
        if (error) throw error;
        if (alive) setEvents((data || []).filter((r) => r.latitude != null && r.longitude != null));
      } catch (e) {
        if (alive) setDataErr(e.message || "Gagal memuat lokasi aktivitas");
      }
    })();
    (async () => {
      try {
        const { data, error } = await supabaseMarta.rpc("mh_md_list_my_installations");
        if (error) throw error;
        if (alive) setPosm((data || []).filter((r) => r.latitude != null && r.longitude != null));
      } catch { /* best-effort */ }
      finally { if (alive) setDataLoading(false); }
    })();
    return () => { alive = false; };
  }, [sessionLoading]);

  // Init peta sekali - basemap tile.openstreetmap.org (gratis, tanpa API
  // key). Distandarkan ke LocationIQ (satu provider dgn search/geocode di
  // seluruh MartaHub). View+pan dikunci ke Sumatera lewat maxBounds.
  useEffect(() => {
    let alive = true;
    loadLeaflet().then((L) => {
      if (!alive || !mapDivRef.current || mapRef.current) return;
      const map = L.map(mapDivRef.current, {
        zoomControl: false, minZoom: 5, maxZoom: 19, maxBoundsViscosity: 1.0,
      }).fitBounds(SUMATRA_BOUNDS, { animate: false });
      map.setMaxBounds(SUMATRA_BOUNDS);
      L.tileLayer(locationiqTileUrl("streets"), {
        subdomains: LOCATIONIQ_TILE_SUBDOMAINS, maxZoom: LOCATIONIQ_TILE_MAX_ZOOM,
        attribution: LOCATIONIQ_TILE_ATTRIBUTION,
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      mapRef.current = map;
      setReady(true);
      setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 200);
    }).catch((e) => setLoadErr(e.message || "Gagal memuat peta"));
    return () => {
      alive = false;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Pencarian tempat - Nominatim, dibatasi ke Indonesia + viewbox Sumatera
  // (bounded=1) supaya hasil di luar pulau tidak muncul, sesuai konsep
  // "hanya Sumatera saja". Sebelumnya HANYA jalan lewat keydown "Enter" -
  // di banyak mobile browser/webview, keyboard virtual tidak selalu
  // mengirim event keydown "Enter" (apalagi saat autocomplete aktif),
  // sehingga suggestion tidak pernah muncul. Sekarang auto-search
  // di-debounce 450ms tiap kali user berhenti ngetik (Enter tetap didukung
  // utk trigger instan), + timeout 8dtk spy tidak macet kalau network lelet.
  useEffect(() => {
    const q = searchQ.trim();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (q.length < 3) { setSearchResults([]); return; }
    searchDebounceRef.current = setTimeout(() => runSearch(), 450);
    return () => clearTimeout(searchDebounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ]);

  async function runSearch() {
    const q = searchQ.trim();
    if (!q) { setSearchResults([]); return; }
    const reqId = ++searchReqId.current;
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      // Lewat edge function locationiq (proxy LocationIQ, token aman di
      // server) - bukan fetch langsung ke Nominatim dari browser, yg sering
      // diblokir/rate-limit di jaringan mobile shg suggestion tidak muncul.
      // Sumatra viewbox sudah dibatasi di sisi edge function.
      const { data, error } = await supabaseMarta.functions.invoke("locationiq", {
        body: { action: "autocomplete", q },
        signal: controller.signal,
      });
      if (reqId !== searchReqId.current) return;
      setSearchResults(error ? [] : (data?.results || []));
    } catch {
      if (reqId !== searchReqId.current) return;
      setSearchResults([]);
    } finally {
      clearTimeout(timer);
      if (reqId === searchReqId.current) setSearching(false);
    }
  }

  function pickSearchResult(r) {
    const lat = Number(r.lat), lng = Number(r.lon);
    mapRef.current?.setView([lat, lng], 15);
    setSearchResults([]);
    setSearchQ(r.display);
    setSearchFocused(false);
    setActiveId(null);
  }

  // Gabungan semua titik utk render marker + fit-bounds awal.
  const points = useMemo(() => {
    const evPts = showEvents ? events.map((e) => ({ kind: "event", id: `e-${e.id}`, lat: Number(e.latitude), lng: Number(e.longitude), title: e.event_name || "Aktivitas", sub: `${fmtDate(e.plan_date)}${e.site_id ? ` - ${e.site_id}` : ""}`, meta: statusMeta(e.status), raw: e })) : [];
    const psPts = showPosm ? posm.map((p) => ({ kind: "posm", id: `p-${p.id}`, lat: Number(p.latitude), lng: Number(p.longitude), title: p.activity_name || (p.mode === "street" ? "Street Branding" : "POSM Outlet"), sub: p.site_id || p.street_description || "-", raw: p })) : [];
    return [...evPts, ...psPts];
  }, [events, posm, showEvents, showPosm]);

  // Render ulang marker tiap kali daftar titik/layer aktif berubah.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let alive = true;
    loadLeaflet().then((L) => {
      if (!alive) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      points.forEach((pt) => {
        const color = pt.kind === "event" ? (pt.meta?.color || EVENT_COLOR) : POSM_COLOR;
        const marker = L.marker([pt.lat, pt.lng], { icon: pinDivIcon(L, color, pt.id === activeId) })
          .addTo(mapRef.current)
          .on("click", () => { setActiveId(pt.id); setSheetOpen(true); mapRef.current.panTo([pt.lat, pt.lng]); });
        markersRef.current.push(marker);
      });
      if (points.length > 0 && activeId == null) {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
        mapRef.current.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points, activeId]);

  function useMyLocation() {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 15); setLocating(false); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  function focusPoint(pt) {
    setActiveId(pt.id);
    mapRef.current?.setView([pt.lat, pt.lng], 16);
  }

  const activePoint = points.find((p) => p.id === activeId) || null;
  const totalCount = events.length + posm.length;

  if (sessionLoading) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  return (
    <MobileShell active="home">
      <div style={{ position: "fixed", inset: 0, top: 0, bottom: 0, fontFamily: FF }}>
        {/* Peta - full bleed di belakang semua overlay */}
        <div ref={mapDivRef} style={{ position: "absolute", inset: 0, background: "#E9EAEE" }} />

        {(!ready || loadErr) && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, background: "#F4F5F7" }}>
            {loadErr ? <div style={{ fontSize: 12.5, color: "#C62828", fontWeight: 600 }}>{loadErr}</div>
              : <Loader2 size={22} color="#ED1C24" style={{ animation: "mspin 1s linear infinite" }} />}
          </div>
        )}

        {/* Top bar - tombol kembali + pencarian tempat (dibatasi Sumatera) */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, padding: "calc(env(safe-area-inset-top,0px) + 14px) 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => router.push("/martahub/m")}
              style={{ width: 38, height: 38, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 10px rgba(23,24,28,0.1)", flexShrink: 0 }}>
              <ArrowLeft size={16} color="#5A5A68" />
            </button>
            <div style={{ flex: 1, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E4E5EA", boxShadow: "0 2px 10px rgba(23,24,28,0.1)" }}>
                <Search size={14} color="#9A9AA6" style={{ flexShrink: 0 }} />
                <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="Cari lokasi di Sumatera…"
                  style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontSize: 12.5, fontFamily: FF, color: "#17181C" }} />
                {searching ? <Loader2 size={13} color="#9A9AA6" style={{ animation: "mspin .9s linear infinite" }} />
                  : searchQ && <button onClick={() => { setSearchQ(""); setSearchResults([]); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}><X size={13} color="#B0B0BA" /></button>}
              </div>
              {searchFocused && searchResults.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 12, boxShadow: "0 8px 24px rgba(23,24,28,0.14)", maxHeight: 220, overflowY: "auto" }}>
                  {searchResults.map((r, i) => (
                    <button key={i} onClick={() => pickSearchResult(r)}
                      style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: i < searchResults.length - 1 ? "1px solid #F0F0F3" : "none", cursor: "pointer", fontSize: 11.5, color: "#3A3A44", lineHeight: 1.4, fontFamily: FF }}>
                      {r.display}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Layer toggle */}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <LayerChip active={showEvents} color={EVENT_COLOR} icon={ListChecks} label="Event" count={events.length} onClick={() => setShowEvents((v) => !v)} />
            <LayerChip active={showPosm} color={POSM_COLOR} icon={PackageCheck} label="POSMAT" count={posm.length} onClick={() => setShowPosm((v) => !v)} />
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", fontSize: 10.5, color: "#8A8A96", fontWeight: 700, background: "rgba(255,255,255,0.9)", borderRadius: 999, padding: "0 10px" }}>
              {dataLoading ? "Memuat…" : `${events.length + posm.length} titik`}
            </div>
          </div>

          {dataErr && (
            <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 11.5, fontWeight: 600 }}>{dataErr}</div>
          )}
        </div>

        {/* Tutup dropdown pencarian saat tap peta */}
        {searchFocused && (
          <div onClick={() => setSearchFocused(false)} style={{ position: "absolute", inset: 0, zIndex: 19 }} />
        )}

        {/* Titik kosong */}
        {ready && !dataLoading && totalCount === 0 && (
          <div style={{ position: "absolute", top: "42%", left: 20, right: 20, textAlign: "center", zIndex: 15 }}>
            <div style={{ background: "#FFFFFF", borderRadius: 16, padding: "18px 20px", boxShadow: "0 6px 20px rgba(23,24,28,0.1)", border: "1px dashed #D8D9E0" }}>
              <MapPinIcon size={20} color="#B0B0BA" style={{ margin: "0 auto" }} />
              <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "#3A3A44" }}>Belum ada titik lokasi</div>
              <div style={{ marginTop: 3, fontSize: 11, color: "#8A8A96" }}>Lokasi akan muncul setelah titik GPS aktivitas atau instalasi POSM dicatat.</div>
            </div>
          </div>
        )}

        {/* My location */}
        <button onClick={useMyLocation}
          style={{ position: "absolute", right: 14, bottom: sheetOpen ? 200 : 96, width: 42, height: 42, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E4E5EA", boxShadow: "0 2px 10px rgba(23,24,28,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 20, transition: "bottom .2s" }}>
          {locating ? <Loader2 size={17} color="#ED1C24" style={{ animation: "mspin .9s linear infinite" }} /> : <Crosshair size={17} color="#5A5A68" />}
        </button>

        {/* Tombol daftar - buka sheet berisi semua titik */}
        {totalCount > 0 && (
          <button onClick={() => setSheetOpen((v) => !v)}
            style={{ position: "absolute", left: 16, bottom: 96, height: 40, padding: "0 16px", borderRadius: 999, background: "#17181C", color: "#fff", border: "none", boxShadow: "0 4px 14px rgba(17,17,20,0.25)", display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: FF, zIndex: 20 }}>
            <ListChecks size={14} /> {sheetOpen ? "Tutup Daftar" : "Lihat Daftar"}
          </button>
        )}

        {/* Bottom sheet - daftar titik / detail titik aktif */}
        {sheetOpen && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 25, background: "#FFFFFF", borderRadius: "20px 20px 0 0", boxShadow: "0 -6px 24px rgba(23,24,28,0.14)", maxHeight: "52vh", display: "flex", flexDirection: "column" }}>
            <div style={{ width: 36, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 4px", flexShrink: 0 }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 18px 10px", flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C" }}>{activePoint ? "Detail Lokasi" : `Semua Titik (${points.length})`}</div>
              <button onClick={() => { setSheetOpen(false); setActiveId(null); }} style={{ width: 26, height: 26, borderRadius: "50%", background: "#F6F7F9", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={13} color="#8A8A96" />
              </button>
            </div>

            {activePoint ? (
              <div style={{ padding: "0 18px 20px" }}>
                <PointDetailCard pt={activePoint} onBack={() => setActiveId(null)} />
              </div>
            ) : (
              <div style={{ overflowY: "auto", padding: "0 14px 16px" }}>
                {points.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 10px", fontSize: 12, color: "#B0B0BA" }}>Tidak ada titik pada layer yang aktif.</div>
                ) : points.map((pt) => (
                  <PointRow key={pt.id} pt={pt} onClick={() => focusPoint(pt)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </MobileShell>
  );
}

function LayerChip({ active, color, icon: Icon, label, count, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px", borderRadius: 999,
        background: active ? color : "#FFFFFF", border: `1.5px solid ${active ? color : "#E4E5EA"}`,
        color: active ? "#fff" : "#5A5A68", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer",
        boxShadow: active ? `0 3px 10px ${color}40` : "0 2px 8px rgba(23,24,28,0.06)", transition: "background .15s,border-color .15s",
      }}>
      <Icon size={13} />
      {label}
      <span style={{ fontSize: 10.5, fontWeight: 800, opacity: active ? 0.9 : 0.6 }}>{count}</span>
    </button>
  );
}

function PointRow({ pt, onClick }) {
  const color = pt.kind === "event" ? (pt.meta?.color || EVENT_COLOR) : POSM_COLOR;
  return (
    <button onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 8px", background: "none", border: "none", borderBottom: "1px solid #F0F0F3", cursor: "pointer", textAlign: "left", fontFamily: FF }}>
      <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {pt.kind === "event" ? <ListChecks size={14} color={color} /> : <PackageCheck size={14} color={color} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pt.title}</div>
        <div style={{ marginTop: 1, fontSize: 11, color: "#8A8A96", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pt.sub}</div>
      </div>
    </button>
  );
}

function PointDetailCard({ pt }) {
  const color = pt.kind === "event" ? (pt.meta?.color || EVENT_COLOR) : POSM_COLOR;
  const router = useRouter();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 13, background: `linear-gradient(150deg, ${color}, ${color}CC)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 10px ${color}33` }}>
          {pt.kind === "event" ? <ListChecks size={18} color="#fff" /> : <PackageCheck size={18} color="#fff" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C" }}>{pt.title}</div>
          <div style={{ marginTop: 2, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>{pt.sub}</div>
        </div>
        {pt.meta && (
          <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: pt.meta.color, background: pt.meta.bg }}>{pt.meta.label}</span>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: 10.5, color: "#B0B0BA", fontVariantNumeric: "tabular-nums" }}>
        {pt.lat.toFixed(6)}, {pt.lng.toFixed(6)}
      </div>
      {pt.kind === "event" ? (
        <button onClick={() => router.push(`/martahub/m/activities/${pt.raw.id}`)}
          style={{ width: "100%", marginTop: 14, height: 44, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
          Lihat Detail Aktivitas
        </button>
      ) : (
        <button onClick={() => router.push("/martahub/m/posm")}
          style={{ width: "100%", marginTop: 14, height: 44, borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${POSM_COLOR}, ${POSM_COLOR}CC)`, color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
          Lihat Detail POSMAT
        </button>
      )}
    </div>
  );
}
