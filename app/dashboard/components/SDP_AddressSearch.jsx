"use client";
/**
 * SDP_AddressSearch.jsx — autocomplete alamat ala e-commerce.
 * Ketik nama tempat/jalan → saran muncul (debounced) → pilih → onSelect(place).
 * Sumber: edge function `locationiq` (action:'autocomplete'), scoped Indonesia+Sumatera.
 *
 * onSelect menerima { display, lat, lon, address } (address = objek LocationIQ:
 * road, suburb, city, postcode, dst).
 *
 * Props: { t, supabase, onSelect, placeholder }
 */
import React, { useEffect, useRef, useState } from "react";
import { Search, Loader2, MapPin, X } from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

export default function SDP_AddressSearch({ t, supabase, onSelect, placeholder = "Cari alamat, jalan, atau tempat…" }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced autocomplete.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const s = q.trim();
    if (s.length < 3) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("locationiq", { body: { action: "autocomplete", q: s } });
        if (error) throw error;
        setResults(Array.isArray(data?.results) ? data.results : []);
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, supabase]);

  const pick = (r) => { onSelect?.(r); setQ(r.display || ""); setOpen(false); setResults([]); };
  const clear = () => { setQ(""); setResults([]); setOpen(false); };

  const inp = { width: "100%", boxSizing: "border-box", padding: "11px 38px 11px 38px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.inp || t.card, color: t.hi, fontSize: 14, fontFamily: FF, outline: "none" };

  return (
    <div ref={boxRef} style={{ position: "relative", zIndex: open ? 60 : undefined }}>
      <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)} placeholder={placeholder} style={inp} />
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }}>
        {loading ? <Loader2 size={15} color={t.mid} style={{ animation: "sp 1s linear infinite" }} />
          : q ? <button type="button" onClick={clear} style={{ border: "none", background: "none", cursor: "pointer", color: t.mid, display: "flex", padding: 0 }}><X size={15} /></button>
          : null}
      </span>

      {open && (q.trim().length >= 3) && (
        <div style={{ position: "absolute", zIndex: 200, top: "calc(100% + 4px)", left: 0, right: 0, background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, boxShadow: t.md || "0 10px 26px rgba(0,0,0,.2)", overflow: "hidden" }}>
          {results.length === 0 ? (
            <div style={{ padding: "14px 12px", fontSize: 13, color: t.mid, textAlign: "center" }}>{loading ? "Mencari…" : "Tidak ada hasil."}</div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {results.map((r, i) => (
                <div key={i} onClick={() => pick(r)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px", cursor: "pointer", borderTop: i ? `1px solid ${t.line}` : "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = t.sub)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <MapPin size={15} color={t.teal || "#1A9E90"} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: t.hi, lineHeight: 1.4 }}>{r.display}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
