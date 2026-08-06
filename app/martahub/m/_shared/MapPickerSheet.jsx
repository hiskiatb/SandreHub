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
import { X, Crosshair, Search, Check, Loader2, MapPin } from "lucide-react";
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

  async function reverseGeocode(lat, lng) {
    setGeocoding(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`, {
        headers: { "Accept-Language": "id" },
      });
      const data = await res.json();
      setAddress(data?.display_name || null);
    } catch {
      setAddress(null);
    } finally {
      setGeocoding(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current?.setView([latitude, longitude], 17);
        setCenter({ lat: latitude, lng: longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  async function runSearch() {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true); setSearchResults([]);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=id&limit=6`, {
        headers: { "Accept-Language": "id" },
      });
      const data = await res.json();
      setSearchResults(data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
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

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "#F4F5F7", fontFamily: FF, display: "flex", flexDirection: "column" }}>
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
                placeholder="Cari alamat atau tempat…"
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
        {/* Center pin - diam di tengah, peta yang digeser di bawahnya */}
        {ready && (
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-100%)", pointerEvents: "none", zIndex: 5 }}>
            <MapPin size={38} color="#ED1C24" fill="#ED1C24" fillOpacity={0.15} strokeWidth={2.2} />
          </div>
        )}
        {/* My location button */}
        {ready && (
          <button onClick={useMyLocation} disabled={locating}
            style={{ position: "absolute", right: 12, bottom: 12, width: 42, height: 42, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E4E5EA", boxShadow: "0 2px 10px rgba(23,24,28,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 6 }}>
            {locating ? <Loader2 size={17} color="#ED1C24" style={{ animation: "mspin .9s linear infinite" }} /> : <Crosshair size={17} color="#5A5A68" />}
          </button>
        )}
      </div>

      {/* Bottom confirm panel */}
      <div style={{ background: "#FFFFFF", borderRadius: "20px 20px 0 0", padding: "16px 18px calc(env(safe-area-inset-bottom,0px) + 16px)", boxShadow: "0 -4px 20px rgba(23,24,28,0.08)" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3 }}>Lokasi Terpilih</div>
        <div style={{ marginTop: 5, fontSize: 12.5, color: "#3A3A44", fontWeight: 600, lineHeight: 1.5, minHeight: 34 }}>
          {geocoding ? <span style={{ color: "#B0B0BA" }}>Mencari alamat…</span> : (address || "Alamat tidak ditemukan")}
        </div>
        <div style={{ marginTop: 4, fontSize: 10.5, color: "#B0B0BA", fontVariantNumeric: "tabular-nums" }}>
          {center.lat.toFixed(6)}, {center.lng.toFixed(6)}
        </div>
        <button onClick={() => onConfirm({ lat: center.lat, lng: center.lng, address })} disabled={!ready}
          style={{ width: "100%", marginTop: 12, height: 48, borderRadius: 13, border: "none", cursor: ready ? "pointer" : "default", background: ready ? BRAND : "#D8D9E0", color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Check size={16} /> Gunakan Titik Ini
        </button>
      </div>
    </div>
  );
}
