"use client";

// ============================================================
// MFTS — Filter tabel ala-Excel (dipakai di SEMUA tab agar konsisten)
// - (Pilih Semua) di paling atas (check/uncheck semua)
// - TIDAK auto-apply: ada tombol "Terapkan" + "Bersihkan"
// - Popup bisa digeser (drag header) seperti Excel
// - Cascading: opsi kolom menyusut sesuai filter kolom lain
// ============================================================

import React, { useMemo, useRef, useState } from "react";
import { Filter, Check, Search, X, GripHorizontal, Minus } from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
export const fval = (r, k) => String(r?.[k] ?? "");
const NONE = " __none__"; // sentinel: tak ada yang lolos

// Baris lolos filter (abaikan kolom exceptKey untuk kalkulasi opsi cascading)
export function passesRow(row, filters, cols, exceptKey) {
  for (const [k] of cols) {
    if (k === exceptKey) continue;
    const sel = filters[k];
    if (sel && sel.length && !sel.includes(fval(row, k))) return false;
  }
  return true;
}

// Opsi untuk satu kolom = nilai distinct dari baris yang lolos filter kolom lain
export function optionsFor(rows, filters, cols, key) {
  const s = new Set();
  for (const r of rows) if (passesRow(r, filters, cols, key)) s.add(fval(r, key));
  for (const v of filters[key] || []) s.add(v);
  return [...s].filter((x) => x !== "" && x !== NONE).sort((a, b) => a.localeCompare(b));
}

// Header <th> dengan tombol filter
export function FilterTh({ t, label, colKey, filters, onOpen }) {
  const active = (filters[colKey] || []).length > 0;
  return (
    <th style={{ padding: "9px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {label}
        <button title="Filter"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onOpen(colKey, { left: r.left, top: r.bottom }); }}
          style={{ display: "inline-flex", border: "none", background: active ? t.tealBg : "transparent", color: active ? t.teal : t.lo, borderRadius: 6, padding: 3, cursor: "pointer" }}>
          <Filter size={12} />
        </button>
        {active && <span style={{ fontSize: 9, fontWeight: 800, color: t.teal }}>{(filters[colKey] || []).length}</span>}
      </span>
    </th>
  );
}

// Menu filter ala-Excel: (Pilih Semua) + daftar centang + Terapkan/Bersihkan + draggable
export function FilterMenu({ t, rect, label, options, selected, onChange, onClose }) {
  // draft = himpunan nilai yang dicentang (belum diterapkan)
  const initDraft = () => {
    if (!selected || selected.length === 0) return new Set(options);        // semua tercentang
    if (selected.length === 1 && selected[0] === NONE) return new Set();    // tak ada
    return new Set(selected.filter((v) => v !== NONE));
  };
  const [draft, setDraft] = useState(initDraft);
  const [s, setS] = useState("");
  const [pos, setPos] = useState(null); // {left, top} kalau sudah digeser

  const term = s.trim().toLowerCase();
  const visible = useMemo(() => options.filter((o) => !term || o.toLowerCase().includes(term)), [options, term]);
  const visAllOn = visible.length > 0 && visible.every((o) => draft.has(o));
  const visSomeOn = visible.some((o) => draft.has(o));

  const toggle = (o) => setDraft((prev) => { const n = new Set(prev); n.has(o) ? n.delete(o) : n.add(o); return n; });
  const toggleAll = () => setDraft((prev) => {
    const n = new Set(prev);
    if (visAllOn) visible.forEach((o) => n.delete(o));
    else visible.forEach((o) => n.add(o));
    return n;
  });

  const apply = () => {
    if (draft.size >= options.length) onChange([]);          // semua → tanpa filter
    else if (draft.size === 0) onChange([NONE]);             // tak ada → kosongkan tabel
    else onChange([...draft]);
    onClose();
  };
  const clearAll = () => { onChange([]); onClose(); };

  // posisi & drag
  const W = 252;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const baseLeft = rect ? Math.max(8, Math.min(rect.left, vw - W - 8)) : 80;
  const baseTop = rect ? rect.top + 4 : 80;
  const left = pos ? pos.left : baseLeft;
  const top = pos ? pos.top : baseTop;
  const dragStart = (e) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const base = { left, top };
    const move = (ev) => setPos({ left: Math.max(0, base.left + (ev.clientX - sx)), top: Math.max(0, base.top + (ev.clientY - sy)) });
    const upH = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", upH); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", upH);
  };

  const checkBox = (on, partial) => (
    <span style={{ flex: "0 0 16px", width: 16, height: 16, borderRadius: 4, border: `1px solid ${on || partial ? t.teal : t.line}`, background: on ? t.teal : partial ? t.tealBg : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      {on ? <Check size={11} color="#fff" /> : partial ? <Minus size={10} color={t.teal} /> : null}
    </span>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
      <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left, top, zIndex: 201, width: W, background: t.card, border: `1px solid ${t.line}`, borderRadius: 11, boxShadow: "0 12px 34px rgba(0,0,0,.4)", fontFamily: FF, textTransform: "none", userSelect: "none" }}>
        {/* Header draggable */}
        <div onMouseDown={dragStart} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: `1px solid ${t.line}`, cursor: "move", background: t.sub, borderRadius: "11px 11px 0 0" }}>
          <GripHorizontal size={14} style={{ color: t.lo }} />
          <span style={{ fontSize: 11.5, fontWeight: 800, color: t.hi, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Filter: {label}</span>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: t.mid, cursor: "pointer", display: "inline-flex" }}><X size={15} /></button>
        </div>

        <div style={{ padding: 9 }}>
          <div style={{ position: "relative", marginBottom: 7 }}>
            <Search size={12} style={{ position: "absolute", left: 8, top: 9, color: t.lo }} />
            <input autoFocus value={s} onChange={(e) => setS(e.target.value)} placeholder={`Cari ${label}…`} style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px 6px 24px", fontSize: 12, borderRadius: 8, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontFamily: FF, outline: "none" }} />
          </div>

          {/* (Pilih Semua) */}
          <label onClick={toggleAll} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 800, color: t.hi, borderBottom: `1px solid ${t.line}`, marginBottom: 4 }}>
            {checkBox(visAllOn, !visAllOn && visSomeOn)}
            <span>(Pilih Semua)</span>
          </label>

          <div style={{ maxHeight: 230, overflowY: "auto" }}>
            {visible.length === 0 && <div style={{ fontSize: 12, color: t.lo, padding: "8px 4px" }}>Tak ada opsi.</div>}
            {visible.map((o) => {
              const on = draft.has(o);
              return (
                <label key={o} onClick={() => toggle(o)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: t.hi }}>
                  {checkBox(on, false)}
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Footer: Bersihkan + Terapkan (tidak auto-apply) */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 10px", borderTop: `1px solid ${t.line}` }}>
          <button onClick={clearAll} style={{ padding: "7px 12px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.mid, cursor: "pointer", fontFamily: FF }}>Bersihkan</button>
          <button onClick={apply} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 800, borderRadius: 8, border: `1px solid ${t.teal}`, background: t.teal, color: "#fff", cursor: "pointer", fontFamily: FF }}>Terapkan</button>
        </div>
      </div>
    </>
  );
}
