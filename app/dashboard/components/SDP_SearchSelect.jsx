"use client";
/**
 * SDP_SearchSelect.jsx — dropdown dengan pencarian (single & multi).
 * Untuk daftar opsi panjang (mis. Kecamatan/Kab-Kota dari Data Site MartaHub).
 *
 * Nilai berupa STRING:
 *  - single: satu nilai ("KECAMATAN A")
 *  - multi : dipisah koma ("KEC A, KEC B") → chips
 *
 * Props: { t, value, options, onChange, multi=false, placeholder, searchPlaceholder, disabled, optionSub }
 *   optionSub(o): opsional — teks kecil abu-abu di kanan tiap opsi di panel
 *   (mis. nama Kab/Kota) supaya opsi yang namanya sama di area berbeda tetap
 *   bisa dibedakan tanpa mengubah value yang tersimpan.
 *
 * Panel otomatis membuka ke ATAS ("flip") kalau ruang di bawah trigger tidak
 * cukup (mis. field ada di dekat bawah layar/form panjang) — sebelumnya panel
 * selalu ke bawah dan bisa "lewat batas" (terpotong footer/viewport). Tinggi
 * panel juga dibatasi otomatis sesuai ruang yang benar-benar tersedia.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const toArr = (v) => Array.isArray(v) ? v : String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

export default function SDP_SearchSelect({ t, value, options = [], onChange, multi = false, placeholder = "— pilih —", searchPlaceholder = "Cari…", disabled = false, optionSub }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [openUp, setOpenUp] = useState(false);
  const [panelMaxH, setPanelMaxH] = useState(320);
  const boxRef = useRef(null);
  const inpRef = useRef(null);
  const teal = t.teal || "#1A9E90";
  const tealD = t.tealD || teal;
  const tealBg = t.tealBg || `${teal}18`;

  const selected = multi ? toArr(value) : (value ? [String(value)] : []);
  const selectedSet = useMemo(() => new Set(selected), [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const arr = s ? options.filter((o) => String(o).toLowerCase().includes(s)) : options;
    return arr.slice(0, 400);
  }, [q, options]);

  // Cari ancestor yang benar-benar membatasi (overflow-y auto/scroll/hidden,
  // mis. panel form yang scroll sendiri dengan footer tombol yang nempel di
  // bawah) — batas panel bukan tepi window, tapi tepi ancestor ini. overflow
  // TETAP memotong walau isinya belum melebihi tinggi kontainer saat ini
  // (jangan syaratkan scrollHeight > clientHeight — itu bug sebelumnya yang
  // bikin deteksi gagal di form pendek). Ambil ancestor PERTAMA yang ketemu
  // (paling dekat) — itu yang benar-benar memotong secara visual.
  const getClipRect = () => {
    let el = boxRef.current?.parentElement;
    while (el && el !== document.documentElement) {
      const cs = window.getComputedStyle(el);
      if (/(auto|scroll|hidden)/.test(cs.overflowY) || /(auto|scroll|hidden)/.test(cs.overflow)) {
        return el.getBoundingClientRect();
      }
      el = el.parentElement;
    }
    return { top: 0, bottom: window.innerHeight };
  };

  // Ukur ruang yang benar-benar tersedia tiap kali panel dibuka (dan saat
  // resize/scroll selagi terbuka) supaya panel tidak pernah lewat batas —
  // flip ke atas kalau ruang bawah sempit & ruang atas lebih luas, lalu cap
  // tinggi list-nya ke ruang itu (irisan antara ancestor scroll & viewport).
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = boxRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 10;
      const clip = getClipRect();
      const boundBottom = Math.min(window.innerHeight, clip.bottom);
      const boundTop = Math.max(0, clip.top);
      const spaceBelow = boundBottom - rect.bottom - margin;
      const spaceAbove = rect.top - boundTop - margin;
      const MIN_USABLE = 170;
      if (spaceBelow < MIN_USABLE && spaceAbove > spaceBelow) {
        setOpenUp(true);
        setPanelMaxH(Math.max(150, Math.min(340, spaceAbove)));
      } else {
        setOpenUp(false);
        setPanelMaxH(Math.max(150, Math.min(340, spaceBelow)));
      }
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setQ(""); } };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); setQ(""); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    setTimeout(() => inpRef.current?.focus(), 30);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
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
  const clearAll = (e) => { e.stopPropagation(); onChange(""); };

  const inpBase = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.inp || t.card, color: t.hi, fontSize: 14, fontFamily: FF, outline: "none" };

  // Kotak centang persegi ("tick square") — konsisten dgn pola filter lain di
  // app ini, dipakai utk single & multi supaya jelas mana yg sedang terpilih.
  const TickBox = ({ on }) => (
    <span style={{
      width: 18, height: 18, flexShrink: 0, borderRadius: 5.5, display: "flex", alignItems: "center", justifyContent: "center",
      background: on ? teal : (t.inp || t.card), border: `1.5px solid ${on ? teal : t.line}`, transition: "background .12s, border-color .12s",
    }}>
      {on && (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5L6.2 11.7L13 4.3" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );

  return (
    <div ref={boxRef} style={{ position: "relative", zIndex: open ? 60 : undefined, fontFamily: FF }}>
      {/* Trigger */}
      <div onClick={() => !disabled && setOpen((o) => !o)}
        style={{ ...inpBase, cursor: disabled ? "default" : "pointer", minHeight: 42, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", opacity: disabled ? 0.7 : 1, borderColor: open ? teal : t.line, boxShadow: open ? `0 0 0 3px ${teal}1f` : "none", transition: "border-color .12s, box-shadow .12s" }}>
        {selected.length === 0 && <span style={{ color: t.lo || t.mid }}>{options.length ? placeholder : "— tidak ada data —"}</span>}
        {multi
          ? selected.map((o) => (
            <span key={o} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 7, background: tealBg, color: tealD, fontSize: 12.5, fontWeight: 700, maxWidth: "100%" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{o}</span>
              <button onClick={(e) => removeChip(o, e)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", display: "flex", padding: 0, flexShrink: 0 }}><X size={12} /></button>
            </span>
          ))
          : <span style={{ color: t.hi }}>{selected[0]}</span>}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {multi && selected.length > 0 && (
            <button onClick={clearAll} title="Hapus semua" style={{ background: "none", border: "none", cursor: "pointer", color: t.lo || t.mid, display: "flex", padding: 0 }}><X size={13} /></button>
          )}
          <ChevronDown size={15} color={t.mid} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </span>
      </div>

      {/* Panel — flip ke atas otomatis kalau ruang bawah sempit */}
      {open && (
        <div style={{
          position: "absolute", zIndex: 200, left: 0, right: 0,
          ...(openUp ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }),
          display: "flex", flexDirection: "column", maxHeight: panelMaxH,
          background: t.card, border: `1px solid ${t.line}`, borderRadius: 14,
          boxShadow: t.md || "0 16px 34px rgba(0,0,0,.22)", overflow: "hidden",
        }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${t.line}`, position: "relative", flexShrink: 0 }}>
            <Search size={14} style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
            <input ref={inpRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
              style={{ ...inpBase, paddingLeft: 32, borderRadius: 8 }} />
          </div>

          <div style={{ overflowY: "auto", padding: "4px 6px", flex: 1, minHeight: 0 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "18px 12px", fontSize: 13, color: t.mid, textAlign: "center" }}>Tidak ada hasil.</div>
            ) : filtered.map((o) => {
              const on = selectedSet.has(o);
              const sub = optionSub ? optionSub(o) : null;
              return (
                <div key={o} onClick={() => pick(o)}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 8px", borderRadius: 9, cursor: "pointer", fontSize: 13.5, fontWeight: on ? 700 : 500, color: t.hi, background: on ? tealBg : "transparent", marginBottom: 1, transition: "background .1s" }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = t.sub; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                  <TickBox on={on} />
                  {/* Satu baris teks, format sama seperti Data Site MartaHub ("KECAMATAN | KABUPATEN")
                      — bukan badge terpisah supaya tidak kepotong saat kolom sempit. */}
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {o}{sub && <span style={{ color: t.lo || t.mid, fontWeight: 500 }}> | {sub}</span>}
                  </span>
                </div>
              );
            })}
          </div>

          {multi && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderTop: `1px solid ${t.line}`, flexShrink: 0, background: t.sub }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: t.mid }}>{selected.length} dipilih</span>
              <button onClick={() => { setOpen(false); setQ(""); }} style={{ background: teal, border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: FF, fontSize: 12.5, fontWeight: 700, color: "#fff" }}>Selesai</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
