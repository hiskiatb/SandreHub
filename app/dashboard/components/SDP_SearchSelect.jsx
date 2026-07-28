"use client";
/**
 * SDP_SearchSelect.jsx — dropdown dengan pencarian (single & multi).
 * Untuk daftar opsi panjang (mis. Kecamatan/Kab-Kota dari Territory IOH).
 *
 * Nilai berupa STRING:
 *  - single: satu nilai ("KECAMATAN A")
 *  - multi : dipisah koma ("KEC A, KEC B") → chips
 *
 * Props: { t, value, options, onChange, multi=false, placeholder, searchPlaceholder, disabled }
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Check, X } from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const toArr = (v) => Array.isArray(v) ? v : String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

export default function SDP_SearchSelect({ t, value, options = [], onChange, multi = false, placeholder = "— pilih —", searchPlaceholder = "Cari…", disabled = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef(null);
  const inpRef = useRef(null);

  const selected = multi ? toArr(value) : (value ? [String(value)] : []);
  const selectedSet = useMemo(() => new Set(selected), [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const arr = s ? options.filter((o) => String(o).toLowerCase().includes(s)) : options;
    return arr.slice(0, 400);
  }, [q, options]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setQ(""); } };
    document.addEventListener("mousedown", onDoc);
    setTimeout(() => inpRef.current?.focus(), 30);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (o) => {
    if (multi) {
      const set = new Set(selected);
      set.has(o) ? set.delete(o) : set.add(o);
      onChange([...set].join(", "));
    } else {
      onChange(o); setOpen(false); setQ("");
    }
  };
  const removeChip = (o, e) => { e.stopPropagation(); const set = new Set(selected); set.delete(o); onChange([...set].join(", ")); };

  const inpBase = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.inp || t.card, color: t.hi, fontSize: 14, fontFamily: FF, outline: "none" };

  return (
    <div ref={boxRef} style={{ position: "relative", zIndex: open ? 60 : undefined }}>
      {/* Trigger */}
      <div onClick={() => !disabled && setOpen((o) => !o)}
        style={{ ...inpBase, cursor: disabled ? "default" : "pointer", minHeight: 42, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", opacity: disabled ? 0.7 : 1 }}>
        {selected.length === 0 && <span style={{ color: t.lo || t.mid }}>{options.length ? placeholder : "— tidak ada data —"}</span>}
        {multi
          ? selected.map((o) => (
            <span key={o} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 7, background: t.tealBg || `${t.teal || "#1A9E90"}18`, color: t.tealD || t.teal || "#1A9E90", fontSize: 12.5, fontWeight: 700 }}>
              {o}<button onClick={(e) => removeChip(o, e)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", display: "flex", padding: 0 }}><X size={12} /></button>
            </span>
          ))
          : <span style={{ color: t.hi }}>{selected[0]}</span>}
        <ChevronDown size={15} color={t.mid} style={{ marginLeft: "auto", flexShrink: 0 }} />
      </div>

      {/* Panel */}
      {open && (
        <div style={{ position: "absolute", zIndex: 200, top: "calc(100% + 4px)", left: 0, right: 0, background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, boxShadow: t.md || "0 10px 26px rgba(0,0,0,.2)", overflow: "hidden" }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${t.line}`, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
            <input ref={inpRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
              style={{ ...inpBase, paddingLeft: 32 }} />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "14px 12px", fontSize: 13, color: t.mid, textAlign: "center" }}>Tidak ada hasil.</div>
            ) : filtered.map((o) => {
              const on = selectedSet.has(o);
              return (
                <div key={o} onClick={() => pick(o)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer", fontSize: 13.5, color: t.hi, background: on ? (t.tealBg || `${t.teal || "#1A9E90"}12`) : "transparent" }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = t.sub; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ width: 16, flexShrink: 0, color: t.tealD || t.teal || "#1A9E90" }}>{on && <Check size={14} />}</span>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{o}</span>
                </div>
              );
            })}
          </div>
          {multi && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderTop: `1px solid ${t.line}` }}>
              <span style={{ fontSize: 12, color: t.mid }}>{selected.length} dipilih</span>
              <button onClick={() => { setOpen(false); setQ(""); }} style={{ background: "none", border: `1px solid ${t.line}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: FF, fontSize: 12.5, fontWeight: 700, color: t.hi }}>Selesai</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
