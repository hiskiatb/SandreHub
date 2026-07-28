"use client";
/**
 * SDP_MapPicker.jsx — pemilih titik lokasi (Leaflet) yang dapat dipakai ulang.
 * Sama seperti picker di SDP_Edit: peta geser/klik, pin draggable, tombol
 * "Lokasi saya" (geolokasi), reverse-geocode alamat via edge function locationiq.
 *
 * Props: { t, supabase, lat, lng, onChange(la, ln), height = 240 }
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, Maximize2 } from "lucide-react";
import SDP_MapModal from "./SDP_MapModal";
import "leaflet/dist/leaflet.css";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const SUMATRA_FALLBACK = [0.5071, 101.4478];

export default function SDP_MapPicker({ t, supabase, lat, lng, onChange, onAddress, height = 240 }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [addr, setAddr] = useState("");
  const [locating, setLocating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const reverse = useCallback(async (la, ln) => {
    try {
      const { data } = await supabase.functions.invoke("locationiq", { body: { action: "reverse", lat: la, lon: ln } });
      const res = data?.result || data;
      const name = res?.display || data?.display_name || "";
      if (name) { setAddr(name); onAddress?.({ display: name, address: res?.address || null, lat: la, lng: ln }); }
    } catch { /* opsional */ }
  }, [supabase, onAddress]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const L = (await import("leaflet")).default;
      const el = elRef.current; if (!el || el._leaflet_id != null || !alive) return;
      const start = (lat != null && lng != null) ? [lat, lng] : SUMATRA_FALLBACK;
      const map = L.map(el, { center: start, zoom: (lat != null ? 16 : 6), zoomControl: true, attributionControl: false });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({ className: "", html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${t.brand || t.acc || "#ED1C24"};border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.4)"></div>`, iconSize: [26, 26], iconAnchor: [13, 26] });
      const marker = L.marker(start, { icon, draggable: true }).addTo(map);
      const set = (ll) => { const la = +ll.lat.toFixed(6), ln = +ll.lng.toFixed(6); onChange(la, ln); reverse(la, ln); };
      marker.on("dragend", () => set(marker.getLatLng()));
      map.on("click", (e) => { marker.setLatLng(e.latlng); set(e.latlng); });
      mapRef.current = map; markerRef.current = marker;
      if (lat != null && lng != null) reverse(lat, lng);
      setTimeout(() => map.invalidateSize(), 200);
    })();
    return () => { alive = false; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pindahkan pin & peta bila lat/lng di-set dari luar (mis. pilih dari autocomplete).
  useEffect(() => {
    const map = mapRef.current, marker = markerRef.current;
    if (!map || !marker || lat == null || lng == null) return;
    const c = marker.getLatLng();
    if (Math.abs(c.lat - lat) > 1e-6 || Math.abs(c.lng - lng) > 1e-6) {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], Math.max(map.getZoom() || 15, 16));
    }
  }, [lat, lng]);

  const useGps = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => {
      const la = +p.coords.latitude.toFixed(6), ln = +p.coords.longitude.toFixed(6);
      const map = mapRef.current, marker = markerRef.current;
      if (map && marker) { map.setView([la, ln], 16); marker.setLatLng([la, ln]); }
      onChange(la, ln); reverse(la, ln); setLocating(false);
    }, () => setLocating(false), { enableHighAccuracy: true, timeout: 12000 });
  };

  const line = t.line || "rgba(0,0,0,.1)";
  const brand = t.brand || t.acc || "#ED1C24";
  return (
    <div>
      <div style={{ position: "relative" }}>
        <div ref={elRef} style={{ height, borderRadius: 12, overflow: "hidden", border: `1px solid ${line}`, background: t.sub || "#f0f0f0" }} />
        <button onClick={() => setExpanded(true)} type="button" title="Perluas peta"
          style={{ position: "absolute", top: 8, right: 8, zIndex: 10, width: 36, height: 36, borderRadius: 10, border: `1px solid ${line}`, background: t.card || "#fff", color: t.hi || "#111", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,.22)" }}>
          <Maximize2 size={16} />
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={useGps} type="button" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: `1px solid ${line}`, background: t.card || "#fff", color: t.hi || "#111", fontFamily: FF, fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          {locating ? <Loader2 size={14} style={{ animation: "sp 1s linear infinite" }} /> : <Crosshair size={14} color={brand} />} Lokasi saya
        </button>
        <button onClick={() => setExpanded(true)} type="button" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: `1px solid ${line}`, background: t.card || "#fff", color: t.hi || "#111", fontFamily: FF, fontSize: 12.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          <Maximize2 size={14} color={brand} /> Perluas peta
        </button>
        <div style={{ fontSize: 11.5, color: t.mid || "#666", minWidth: 0 }}>
          {lat != null ? <span style={{ fontFamily: "monospace" }}>{lat}, {lng}</span> : <span style={{ color: t.lo || "#999" }}>Ketuk peta untuk memilih titik</span>}
          {addr && <div style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{addr}</div>}
        </div>
      </div>

      {expanded && (
        <SDP_MapModal t={t} supabase={supabase} lat={lat} lng={lng}
          onSave={(la, ln, address) => {
            onChange(la, ln);
            if (address) { setAddr(address); onAddress?.({ display: address, address: null, lat: la, lng: ln }); }
            const map = mapRef.current, marker = markerRef.current;
            if (map && marker) { marker.setLatLng([la, ln]); map.setView([la, ln], Math.max(map.getZoom() || 16, 16)); }
            setExpanded(false);
          }}
          onClose={() => setExpanded(false)} />
      )}
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
