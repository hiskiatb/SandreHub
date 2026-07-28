"use client";
/**
 * SDP_MapModal.jsx — pemilih titik lokasi layar-lebar (popup).
 * Peta besar + pencarian alamat + "Lokasi saya". Titik hanya diterapkan saat
 * menekan "Simpan Titik" (onSave); "Batalkan"/close/Esc menutup tanpa menyimpan.
 *
 * Props: { t, supabase, lat, lng, onSave(la, ln, address), onClose, title }
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, Crosshair, Check, Loader2, MapPin } from "lucide-react";
import SDP_AddressSearch from "./SDP_AddressSearch";
import "leaflet/dist/leaflet.css";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const FALLBACK = [0.5071, 101.4478]; // Sumatra tengah

export default function SDP_MapModal({ t, supabase, lat, lng, onSave, onClose, title = "Pilih Titik Lokasi" }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [pos, setPos] = useState(lat != null && lng != null ? [lat, lng] : null);
  const [addr, setAddr] = useState("");
  const [locating, setLocating] = useState(false);

  const reverse = useCallback(async (la, ln) => {
    try {
      const { data } = await supabase.functions.invoke("locationiq", { body: { action: "reverse", lat: la, lon: ln } });
      const res = data?.result || data;
      if (res?.display) setAddr(res.display);
    } catch { /* opsional */ }
  }, [supabase]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const L = (await import("leaflet")).default;
      const el = elRef.current;
      if (!el || el._leaflet_id != null || !alive) return;
      const start = pos || FALLBACK;
      const map = L.map(el, { center: start, zoom: pos ? 16 : 6, zoomControl: true, attributionControl: false });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19 }).addTo(map);
      const icon = L.divIcon({ className: "", html: `<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${t.brand || t.acc || "#ED1C24"};border:2.5px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.5)"></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
      const marker = L.marker(start, { icon, draggable: true }).addTo(map);
      const upd = (ll) => { const la = +ll.lat.toFixed(6), ln = +ll.lng.toFixed(6); setPos([la, ln]); reverse(la, ln); };
      marker.on("dragend", () => upd(marker.getLatLng()));
      map.on("click", (e) => { marker.setLatLng(e.latlng); upd(e.latlng); });
      mapRef.current = map; markerRef.current = marker;
      if (pos) reverse(pos[0], pos[1]);
      setTimeout(() => map.invalidateSize(), 160);
    })();
    return () => { alive = false; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc menutup.
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const moveTo = (la, ln, z = 17) => {
    setPos([la, ln]);
    const map = mapRef.current, marker = markerRef.current;
    if (map && marker) { marker.setLatLng([la, ln]); map.setView([la, ln], z); }
  };

  const useGps = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition((p) => {
      const la = +p.coords.latitude.toFixed(6), ln = +p.coords.longitude.toFixed(6);
      moveTo(la, ln, 17); reverse(la, ln); setLocating(false);
    }, () => setLocating(false), { enableHighAccuracy: true, timeout: 12000 });
  };

  const brand = t.brand || t.acc || "#ED1C24";
  const floatBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontFamily: FF, fontSize: 12.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.18)" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="sdp-pop" style={{ background: t.card, borderRadius: 18, width: "min(940px, 96vw)", height: "min(88vh, 780px)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: t.md || "0 20px 60px rgba(0,0,0,.5)", border: `1px solid ${t.line}` }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, background: t.tealBg || `${t.teal || "#1A9E90"}18`, color: t.tealD || t.teal || "#1A9E90", display: "flex", alignItems: "center", justifyContent: "center" }}><MapPin size={18} /></span>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: t.hi }}>{title}</div>
              <div style={{ fontSize: 12, color: t.mid }}>Geser peta, ketuk untuk menaruh pin, atau cari alamat.</div>
            </div>
          </div>
          <button onClick={onClose} title="Tutup (Esc)" style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${t.line}`, background: t.card, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={18} /></button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>
          <SDP_AddressSearch t={t} supabase={supabase} onSelect={(r) => { moveTo(r.lat, r.lon, 17); if (r.display) setAddr(r.display); }} placeholder="Cari alamat / tempat untuk lompat ke lokasi…" />
        </div>

        {/* Map */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <div ref={elRef} style={{ position: "absolute", inset: 0, background: t.sub || "#eee" }} />
          <button onClick={useGps} type="button" style={{ ...floatBtn, position: "absolute", left: 12, bottom: 12, zIndex: 12 }}>
            {locating ? <Loader2 size={14} style={{ animation: "sp 1s linear infinite" }} /> : <Crosshair size={14} color={brand} />} Lokasi saya
          </button>
          {addr && (
            <div style={{ position: "absolute", left: 12, right: 12, top: 12, zIndex: 12, padding: "9px 12px", borderRadius: 10, background: t.card, border: `1px solid ${t.line}`, boxShadow: "0 2px 10px rgba(0,0,0,.15)", fontSize: 12.5, color: t.hi, display: "flex", alignItems: "flex-start", gap: 7 }}>
              <MapPin size={14} color={brand} style={{ marginTop: 1, flexShrink: 0 }} />
              <span style={{ lineHeight: 1.4 }}>{addr}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderTop: `1px solid ${t.line}`, flexShrink: 0, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 100, fontSize: 12, color: t.mid }}>
            {pos ? <span style={{ fontFamily: "monospace" }}>{pos[0]}, {pos[1]}</span> : <span style={{ color: t.lo || t.mid }}>Belum ada titik dipilih</span>}
          </div>
          <button onClick={onClose} style={{ padding: "11px 20px", borderRadius: 11, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontFamily: FF, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Batalkan</button>
          <button onClick={() => pos && onSave(pos[0], pos[1], addr)} disabled={!pos} data-primary
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 22px", borderRadius: 11, border: "none", cursor: pos ? "pointer" : "default", fontFamily: FF, fontSize: 14, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg, ${t.acc || "#ED1C24"} 0%, ${t.mag || "#C6168D"} 100%)`, opacity: pos ? 1 : 0.5 }}>
            <Check size={16} /> Simpan Titik
          </button>
        </div>
      </div>
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
