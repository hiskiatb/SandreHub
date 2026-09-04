"use client";
/**
 * MapPickerSheet - picker peta interaktif (web mobile), padanan
 * `location_picker_screen.dart` di Flutter. Pakai Leaflet + tile OpenStreetMap
 * (TANPA API key, sama seperti alasan Flutter pakai flutter_map bukan
 * google_maps_flutter - lihat pubspec.yaml komentar). Pola "pin diam di
 * tengah, peta yang digeser" (bukan marker draggable), reverse-geocode via
 * Nominatim (gratis, tanpa key) di-debounce 500ms setelah peta berhenti
 * bergerak - SAMA PERSIS dgn `_onSettled()` Flutter.
 */
import { useEffect, useRef, useState } from "react";
import { X, Crosshair, Search, Check, Loader2, MapPin, Pencil, AlertTriangle, ChevronDown } from "lucide-react";
import { FF, BRAND } from "./MobileShell";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

let leafletLoadPromise = null;
export function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadPromise) return leafletLoadPromise;
  leafletLoadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS; script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Gagal memuat peta"));
    document.body.appendChild(script);
  });
  return leafletLoadPromise;
}

/**
 * @param {{ initialLat?: number, initialLng?: number, onClose: () => void,
 *   onConfirm: (r: {lat:number,lng:number,address:string|null}) => void }} props
 */
export default function MapPickerSheet({ initialLat, initialLng, onClose, onConfirm }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [center, setCenter] = useState({ lat: initialLat || -5.4, lng: initialLng || 105.27 }); // default: sekitar Lampung
  const [address, setAddress] = useState(null);
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const debounceRef = useRef(null);
  // `alive` dicek di SETIAP callback async (fetch/geolocation) sebelum
  // setState - sheet ini bisa ditutup (unmount) sementara request masih
  // di tengah jalan (fetch Nominatim/geolocation lambat), dan tanpa guard
  // ini React bakal warning "can't update state on unmounted component" +
  // berpotensi state nyasar. `geoReqId`/`searchReqId` mencegah race kondisi
  // laen: kalau peta digeser cepat 2x berturut-turut, respons request yg
  // LEBIH LAMA bisa nyampe belakangan & menimpa alamat dari request yg lebih
  // baru - id dicocokkan dulu sebelum commit ke state.
  const aliveRef = useRef(true);
  const geoReqId = useRef(0);
  const searchReqId = useRef(0);
  useEffect(() => () => { aliveRef.current = false; }, []);
  // Input manual longlat - jalur cadangan kalau titiknya susah ditemukan
  // dgn geser peta (mis. area tanpa jalan/landmark jelas di tile OSM, atau
  // DSF sudah punya angka longlat pasti dari sumber lain) - toggle-able,
  // TIDAK menggantikan peta, cuma pelengkap.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLatInput, setManualLatInput] = useState("");
  const [manualLngInput, setManualLngInput] = useState("");
  const [manualErr, setManualErr] = useState("");

  useEffect(() => {
    let alive = true;
    loadLeaflet().then((L) => {
      if (!alive || !mapDivRef.current || mapRef.current) return;
      const map = L.map(mapDivRef.current, { zoomControl: false }).setView([center.lat, center.lng], 16);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors", maxZoom: 19,
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      map.on("move", () => {
        const c = map.getCenter();
        setCenter({ lat: c.lat, lng: c.lng });
      });
      mapRef.current = map;
      setReady(true);
      reverseGeocode(center.lat, center.lng);
    }).catch((e) => setLoadErr(e.message || "Gagal memuat peta"));
    return () => {
      alive = false;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce 500ms setelah peta berhenti bergerak → reverse geocode, SAMA
  // dgn `_onSettled()` Flutter.
  useEffect(() => {
    if (!ready) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => reverseGeocode(center.lat, center.lng), 500);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, ready]);

  // Sebelumnya nyoba SAMPAI 4 level zoom SATU-SATU berurutan (await
  // bertahap) kalau level pertama kosong - itu yg bikin lama krn kadang
  // beneran nyampe 3-4 round-trip ke Nominatim sebelum dapat hasil/nyerah.
  // Sekarang cukup SATU request (zoom=17, "jalan"-level - lebih longgar
  // drpd 18/"bangunan persis" yg sering kosong di titik jalan kosong tanpa
  // nomor bangunan, spt kasus di screenshot), dan kalau `display_name`
  // kosong tapi field `address`-nya sendiri ADA isinya, langsung susun
  // fallback dari situ (road/suburb/kota) TANPA request kedua. Request
  // kedua HANYA dipanggil kalau yg pertama BENAR2 kosong sama sekali.
  async function reverseGeocode(lat, lng) {
    const reqId = ++geoReqId.current;
    setGeocoding(true);
    try {
      let found = await fetchGeocode(lat, lng, 17);
      if (!aliveRef.current || reqId !== geoReqId.current) return;
      if (!found) found = await fetchGeocode(lat, lng, 12); // fallback tunggal ke level kota - jarang kepakai
      if (!aliveRef.current || reqId !== geoReqId.current) return;
      setAddress(found);
    } catch {
      if (!aliveRef.current || reqId !== geoReqId.current) return;
      setAddress(null);
    } finally {
      if (aliveRef.current && reqId === geoReqId.current) setGeocoding(false);
    }
  }

  async function fetchGeocode(lat, lng, zoom) {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1`, {
      headers: { "Accept-Language": "id" },
    });
    const data = await res.json();
    const a = data?.address;
    const fallback = a && [a.road, a.suburb || a.village, a.city_district, a.city || a.town || a.county].filter(Boolean).join(", ");
    return data?.display_name || fallback || null;
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!aliveRef.current) return;
        const { latitude, longitude } = pos.coords;
        mapRef.current?.setView([latitude, longitude], 17);
        setCenter({ lat: latitude, lng: longitude });
        setLocating(false);
      },
      () => { if (aliveRef.current) setLocating(false); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  async function runSearch() {
    const q = searchQ.trim();
    if (!q) return;
    const reqId = ++searchReqId.current;
    setSearching(true); setSearchResults([]);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=id&limit=6`, {
        headers: { "Accept-Language": "id" },
      });
      const data = await res.json();
      if (!aliveRef.current || reqId !== searchReqId.current) return;
      setSearchResults(data || []);
    } catch {
      if (!aliveRef.current || reqId !== searchReqId.current) return;
      setSearchResults([]);
    } finally {
      if (aliveRef.current && reqId === searchReqId.current) setSearching(false);
    }
  }

  function pickResult(r) {
    const lat = Number(r.lat), lng = Number(r.lon);
    mapRef.current?.setView([lat, lng], 17);
    setCenter({ lat, lng });
    setAddress(r.display_name || null);
    setSearchResults([]);
    setSearchQ("");
  }

  function applyManualCoords() {
    const lat = Number(manualLatInput.replace(",", "."));
    const lng = Number(manualLngInput.replace(",", "."));
    if (!manualLatInput.trim() || !manualLngInput.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
      setManualErr("Latitude/longitude harus berupa angka.");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setManualErr("Nilai di luar rentang koordinat yang valid.");
      return;
    }
    setManualErr("");
    mapRef.current?.setView([lat, lng], 17);
    setCenter({ lat, lng });
    setManualOpen(false);
    setManualLatInput(""); setManualLngInput("");
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "#F4F5F7", fontFamily: FF, display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes pinDrop{0%{transform:translateY(-16px);opacity:0}100%{transform:translateY(0);opacity:1}}`}</style>
      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "calc(env(safe-area-inset-top,0px) + 12px) 14px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onClose}
            style={{ width: 38, height: 38, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(23,24,28,0.08)", flexShrink: 0 }}>
            <X size={17} color="#5A5A68" />
          </button>
          <div style={{ flex: 1, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E4E5EA", boxShadow: "0 2px 8px rgba(23,24,28,0.08)" }}>
              <Search size={14} color="#9A9AA6" style={{ flexShrink: 0 }} />
              <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Input nama jalan…"
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontSize: 12.5, fontFamily: FF, color: "#17181C" }} />
              {searching && <Loader2 size={13} color="#9A9AA6" style={{ animation: "mspin .9s linear infinite" }} />}
            </div>
            {searchResults.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "#FFFFFF", border: "1px solid #E4E5EA", borderRadius: 12, boxShadow: "0 8px 24px rgba(23,24,28,0.12)", maxHeight: 220, overflowY: "auto" }}>
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => pickResult(r)}
                    style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: i < searchResults.length - 1 ? "1px solid #F0F0F3" : "none", cursor: "pointer", fontSize: 11.5, color: "#3A3A44", lineHeight: 1.4 }}>
                    {r.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={mapDivRef} style={{ position: "absolute", inset: 0, background: "#E9EAEE" }} />
        {(!ready || loadErr) && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
            {loadErr ? (
              <div style={{ fontSize: 12.5, color: "#C62828", fontWeight: 600 }}>{loadErr}</div>
            ) : (
              <Loader2 size={22} color="#ED1C24" style={{ animation: "mspin 1s linear infinite" }} />
            )}
          </div>
        )}
        {/* Center pin - diam di tengah, peta yang digeser di bawahnya.
            Sebelumnya cuma ikon outline MapPin polos (kurang "nempel" scr
            visual krn transparan) - sekarang pin teardrop solid dgn gradient
            + white dot di tengah (bahasa marker peta yg umum/familiar),
            plus bayangan elips statis di titik tanahnya spy kesan "melayang
            di atas titik" kebaca jelas, dan sedikit animasi drop saat peta
            baru siap. */}
        {ready && (
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-100%)", pointerEvents: "none", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <svg width="42" height="54" viewBox="0 0 42 54" style={{ animation: "pinDrop 0.4s cubic-bezier(0.34,1.56,0.64,1)", filter: "drop-shadow(0 3px 6px rgba(220,38,38,0.35))" }}>
              <defs>
                <linearGradient id="mapPinGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F0384A" />
                  <stop offset="100%" stopColor="#C6151F" />
                </linearGradient>
              </defs>
              <path d="M21 2C11.6 2 4 9.6 4 19c0 12.6 15.2 30.6 16.3 31.9.4.5 1 .5 1.4 0C22.8 49.6 38 31.6 38 19 38 9.6 30.4 2 21 2z"
                fill="url(#mapPinGrad)" stroke="#fff" strokeWidth="2" />
              <circle cx="21" cy="19" r="7.5" fill="#fff" />
              <circle cx="21" cy="19" r="4" fill="#C6151F" />
            </svg>
            <div style={{ width: 14, height: 5, marginTop: -3, borderRadius: "50%", background: "rgba(23,24,28,0.28)", filter: "blur(1.5px)" }} />
          </div>
        )}
        {/* My location button - SENGAJA di kiri-bawah, BUKAN kanan-bawah -
            sebelumnya nempel PAS di titik yg sama dgn kontrol zoom Leaflet
            (`L.control.zoom({position:"bottomright"})` di atas), jadi dua
            tombol saling tindih/rebutan tempat di pojok yg sama. Sekarang
            keduanya di pojok terpisah, tidak akan pernah tabrakan. */}
        {ready && (
          <button onClick={useMyLocation} disabled={locating}
            style={{ position: "absolute", left: 12, bottom: 12, width: 44, height: 44, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E4E5EA", boxShadow: "0 2px 10px rgba(23,24,28,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: locating ? "default" : "pointer", zIndex: 6 }}>
            {locating ? <Loader2 size={18} color="#ED1C24" style={{ animation: "mspin .9s linear infinite" }} /> : <Crosshair size={18} color="#5A5A68" />}
          </button>
        )}
      </div>

      {/* Bottom confirm panel - dirapikan: kartu koordinat sendiri (bukan
          teks polos), status alamat dibedakan visual (netral/amber saat
          tidak ketemu, bukan cuma teks abu-abu biasa), + toggle "Input
          Manual" utk longlat kalau titiknya susah ditemukan lewat geser
          peta (mis. area tanpa landmark jelas di tile OSM). */}
      <div style={{ background: "#FFFFFF", borderRadius: "20px 20px 0 0", padding: "16px 18px calc(env(safe-area-inset-bottom,0px) + 16px)", boxShadow: "0 -4px 20px rgba(23,24,28,0.08)" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3 }}>Lokasi Terpilih</div>

        <div style={{
          marginTop: 8, display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 11px", borderRadius: 12,
          background: geocoding ? "#F6F7F9" : address ? "#F6F7F9" : "#FFF7ED",
          border: `1px solid ${geocoding ? "#EFEFF2" : address ? "#EFEFF2" : "#FED7AA"}`,
        }}>
          {geocoding ? (
            <Loader2 size={14} color="#B0B0BA" style={{ flexShrink: 0, marginTop: 1, animation: "mspin .9s linear infinite" }} />
          ) : address ? (
            <MapPin size={14} color="#5A5A68" style={{ flexShrink: 0, marginTop: 1 }} />
          ) : (
            <AlertTriangle size={14} color="#C2410C" style={{ flexShrink: 0, marginTop: 1 }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: geocoding ? "#B0B0BA" : address ? "#3A3A44" : "#9A3412" }}>
              {geocoding ? "Mencari alamat…" : (address || "Alamat tidak ditemukan - boleh dilanjut, isi manual di kolom Alamat nanti.")}
            </div>
            <div style={{ marginTop: 5, display: "inline-flex", fontSize: 10.5, fontWeight: 700, color: "#8A8A96", fontVariantNumeric: "tabular-nums", background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 7, padding: "2px 7px" }}>
              {center.lat.toFixed(6)}, {center.lng.toFixed(6)}
            </div>
          </div>
        </div>

        <button onClick={() => { setManualOpen((v) => !v); setManualErr(""); }}
          style={{
            width: "100%", marginTop: 9, height: 42, borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            border: `1.5px solid ${manualOpen ? "#ED1C24" : "#E4E5EA"}`, background: manualOpen ? "rgba(237,28,36,0.06)" : "#FFFFFF",
            color: manualOpen ? "#ED1C24" : "#5A5A68", fontSize: 12.5, fontWeight: 800, fontFamily: FF,
          }}>
          <Pencil size={13} /> {manualOpen ? "Tutup Input Manual" : "Input Koordinat Manual"}
        </button>

        {manualOpen && (
          <div style={{ marginTop: 10, padding: "11px 12px", borderRadius: 12, background: "#F6F7F9", border: "1px solid #ECEDF0" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 }}>Ketik Koordinat Manual</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={manualLatInput} onChange={(e) => setManualLatInput(e.target.value)} inputMode="decimal" placeholder="Latitude, mis. 3.595300"
                style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 10, border: "1.5px solid #E4E5EA", padding: "0 11px", fontSize: 12.5, fontFamily: FF, outline: "none", background: "#FFFFFF" }} />
              <input value={manualLngInput} onChange={(e) => setManualLngInput(e.target.value)} inputMode="decimal" placeholder="Longitude, mis. 98.672100"
                style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 10, border: "1.5px solid #E4E5EA", padding: "0 11px", fontSize: 12.5, fontFamily: FF, outline: "none", background: "#FFFFFF" }} />
            </div>
            {manualErr && <div style={{ marginTop: 7, fontSize: 11, color: "#DC2626", fontWeight: 600 }}>{manualErr}</div>}
            <button onClick={applyManualCoords}
              style={{ width: "100%", marginTop: 9, height: 40, borderRadius: 10, border: "none", background: "#17181C", color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <ChevronDown size={13} style={{ transform: "rotate(-90deg)" }} /> Arahkan Peta ke Titik Ini
            </button>
          </div>
        )}

        <button onClick={() => onConfirm({ lat: center.lat, lng: center.lng, address })} disabled={!ready}
          style={{ width: "100%", marginTop: 12, height: 48, borderRadius: 13, border: "none", cursor: ready ? "pointer" : "default", background: ready ? BRAND : "#D8D9E0", color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: ready ? "0 4px 14px rgba(17,17,20,0.11)" : "none" }}>
          <Check size={16} /> Gunakan Titik Ini
        </button>
      </div>
    </div>
  );
}
