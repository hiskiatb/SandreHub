"use client";
/**
 * LocationMapPreview - preview kecil "kita sedang di mana" utk satu titik
 * lat/lng, dipakai di form yang menangkap GPS (Retailer Installment,
 * dst). Pakai Leaflet + tile OpenStreetMap (pola sama persis dgn
 * MapPickerSheet.jsx - TANPA API key). Thumbnail statis (drag/zoom
 * dimatikan) - klik utk membesarkan jadi peta penuh yg interaktif.
 * Atribusi dibuat kecil & rapi (bukan kotak besar bawaan Leaflet).
 */
import { useEffect, useRef, useState } from "react";
import { X, ExternalLink, Maximize2 } from "lucide-react";
import { loadLeaflet } from "./MapPickerSheet";

function tinyAttribution(map, L) {
  const ctl = L.control({ position: "bottomright" });
  ctl.onAdd = () => {
    const div = L.DomUtil.create("div");
    div.style.cssText =
      "background:rgba(255,255,255,0.72);padding:1px 5px;border-radius:5px;font-size:8.5px;color:#8A8A94;font-weight:600;";
    div.innerHTML = "© OpenStreetMap";
    return div;
  };
  ctl.addTo(map);
}

function useLeafletMap({ lat, lng, interactive }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadLeaflet()
      .then((L) => {
        if (!alive || !divRef.current || mapRef.current) return;
        const map = L.map(divRef.current, {
          zoomControl: interactive,
          dragging: interactive,
          scrollWheelZoom: interactive,
          doubleClickZoom: interactive,
          boxZoom: interactive,
          keyboard: interactive,
          touchZoom: interactive,
          attributionControl: false,
        }).setView([lat, lng], interactive ? 17 : 16);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
        tinyAttribution(map, L);
        const icon = L.divIcon({
          className: "",
          html:
            '<div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:#22A85E;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
          iconSize: [30, 30],
          iconAnchor: [15, 28],
        });
        L.marker([lat, lng], { icon, interactive: false }).addTo(map);
        mapRef.current = map;
        setReady(true);
        if (interactive) setTimeout(() => map.invalidateSize(), 60);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { divRef, ready };
}

function ExpandedMap({ lat, lng, onClose }) {
  const { divRef, ready } = useLeafletMap({ lat, lng, interactive: true });
  const gmaps = `https://www.google.com/maps?q=${lat},${lng}`;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000" }}>
      <div ref={divRef} style={{ position: "absolute", inset: 0, background: "#E9EAEE" }} />
      {!ready && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12.5 }}>
          Memuat peta…
        </div>
      )}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 12px)", left: 14, right: 14, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
        <button onClick={onClose}
          style={{ width: 38, height: 38, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(23,24,28,0.18)" }}>
          <X size={17} color="#5A5A68" />
        </button>
        <a href={gmaps} target="_blank" rel="noreferrer"
          style={{ height: 38, padding: "0 14px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: "#3A3A44", textDecoration: "none", boxShadow: "0 2px 8px rgba(23,24,28,0.18)" }}>
          Google Maps <ExternalLink size={12} />
        </a>
      </div>
      <div style={{ position: "absolute", bottom: "calc(env(safe-area-inset-bottom,0px) + 14px)", left: 14, right: 14, textAlign: "center", zIndex: 5 }}>
        <span style={{ background: "rgba(255,255,255,0.92)", padding: "6px 12px", borderRadius: 10, fontSize: 10.5, fontWeight: 700, color: "#3A3A44", fontVariantNumeric: "tabular-nums", boxShadow: "0 2px 8px rgba(23,24,28,0.14)" }}>
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </span>
      </div>
    </div>
  );
}

export default function LocationMapPreview({ lat, lng, height = 150 }) {
  const [expanded, setExpanded] = useState(false);
  const { divRef, ready } = useLeafletMap({ lat, lng, interactive: false });

  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setExpanded(true)}
        style={{ position: "relative", width: "100%", height, borderRadius: 11, overflow: "hidden", border: "1px solid #ECEDF0", background: "#F0F0F3", padding: 0, cursor: "pointer", display: "block" }}
      >
        <div ref={divRef} style={{ position: "absolute", inset: 0 }} />
        {!ready && <div style={{ position: "absolute", inset: 0 }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.12) 100%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 8, bottom: 8, width: 26, height: 26, borderRadius: 8, background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(23,24,28,0.14)" }}>
          <Maximize2 size={12} color="#5A5A68" />
        </div>
      </button>
      {expanded && <ExpandedMap lat={lat} lng={lng} onClose={() => setExpanded(false)} />}
    </div>
  );
}
