"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, Check, Filter, SortAsc, SortDesc, X } from "lucide-react";

/**
 * ExcelFilter - Apple Standard Edition
 * Logic: Chained Faceted Filtering
 */
// UPDATE (permintaan user - "jangan biarkan ada lebih dari 1 popup filter
// sekaligus yang terbuka"): dulu tiap ExcelFilter 100% independen (isOpen
// state lokal doang) - gampang kebuka bareng > 1 kalau user klik cepat
// pindah2 ikon filter kolom, numpuk saling tutupin kaya screenshot user.
// Sekarang pakai 1 custom DOM event global ("mfts-filter-popup-open") -
// instance manapun yg baru dibuka BROADCAST id uniknya sendiri, semua
// instance LAIN yg lagi kebuka (termasuk StatusAgeFilterMenu/RankMetricMenu
// di DSE_ProdAR.jsx yg dengerin event yg SAMA) langsung nutup diri.
const FILTER_POPUP_OPEN_EVENT = "mfts-filter-popup-open";
let filterPopupIdSeq = 0;

export default function ExcelFilter({
  options = [],
  selected = [],
  onApply,
  onClear,
  sortDir,
  onSort,
  label,
  t,
  d
}) {
  const [isOpen, setIsOpen] = useState(false);
  const instanceIdRef = useRef(null);
  if (instanceIdRef.current === null) instanceIdRef.current = `ef-${++filterPopupIdSeq}`;
  useEffect(() => {
    const onOtherOpen = (ev) => {
      if (ev.detail !== instanceIdRef.current) setIsOpen(false);
    };
    window.addEventListener(FILTER_POPUP_OPEN_EVENT, onOtherOpen);
    return () => window.removeEventListener(FILTER_POPUP_OPEN_EVENT, onOtherOpen);
  }, []);
  const [searchTerm, setSearchTerm] = useState("");
  const [tempSelected, setTempSelected] = useState(selected);
  
  // Window State
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 260, h: 360 });
  const [interaction, setInteraction] = useState({ type: null, dir: null });
  
  const startState = useRef(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  const appleFont = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif";

  const toggleOpen = () => {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Kalkulasi posisi agar tetap di dalam viewport
      let targetX = rect.left;
      let targetY = rect.bottom + 6;

      if (targetX + size.w > window.innerWidth) {
        targetX = window.innerWidth - size.w - 16;
      }
      if (targetY + size.h > window.innerHeight) {
        targetY = rect.top - size.h - 6;
      }
      // UPDATE (permintaan user - "untuk semua popup filter ini, tidak
      // boleh lewat batas layar browser"): dua penyesuaian di atas
      // (geser kiri kalau kepotong kanan, flip ke atas kalau kepotong
      // bawah) ga pernah dijamin HASIL AKHIRNYA tetap di dalam viewport -
      // kalau tombol filternya deket banget sama tepi (mis. kolom paling
      // kiri/atas tabel), popup bisa tetep kepotong/nongol di luar layar
      // ke arah SEBALIKNYA (kepotong atas/kiri, kayak screenshot user).
      // Clamp terakhir ini maksa posisi akhir SELALU full di dalam
      // viewport (margin aman 8px tiap sisi), apapun ukuran/posisi
      // tombol pemicunya.
      targetX = Math.max(8, Math.min(targetX, window.innerWidth - size.w - 8));
      targetY = Math.max(8, Math.min(targetY, window.innerHeight - size.h - 8));

      setPos({ x: targetX, y: targetY });
    }
    if (!isOpen) window.dispatchEvent(new CustomEvent(FILTER_POPUP_OPEN_EVENT, { detail: instanceIdRef.current }));
    setIsOpen(!isOpen);
  };

  // UPDATE (fix: "tombol Apply hilang" - ternyata bukan hilang, tapi
  // posisi popup cuma dihitung SEKALI pas toggleOpen() diklik, dan ga
  // pernah dihitung ULANG kalau ukuran jendela/viewport berubah SESUDAH
  // popup ini kebuka (mis. user buka DevTools, yg otomatis bikin lebar
  // window Chrome menyempit) - popup ttp "nempel" di koordinat lama,
  // jadi sebagian tombolnya (Apply) kebawa ke luar area yg skrg
  // kelihatan, meski elemen-nya sendiri tetap ada & berfungsi normal.
  // Reposisi otomatis (clamp ulang) tiap kali window di-resize SELAGI
  // popup ini kebuka.
  useEffect(() => {
    if (!isOpen) return;
    const reclamp = () => {
      setPos((prev) => ({
        x: Math.max(8, Math.min(prev.x, window.innerWidth - size.w - 8)),
        y: Math.max(8, Math.min(prev.y, window.innerHeight - size.h - 8)),
      }));
    };
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [isOpen, size.w, size.h]);

  // Logic Sinkronisasi untuk Chained Filter
  // Jika options dari parent berubah (karena filter di kolom lain), 
  // kita tetap mempertahankan pilihan yang masih valid di dalam options baru.
  // UPDATE (fix: "diklik salah satu tidak terjadi apa apa" - checkbox yg
  // BARU DICENTANG langsung balik kosong lagi): effect ini tadinya jalan
  // ulang tiap kali REFERENCE `options`/`selected` berubah selama popup
  // masih terbuka (bukan cuma pas baru dibuka) - kalau parent (tabel)
  // re-render karena ALASAN LAIN APAPUN sementara popup ini kebuka (fetch
  // lain selesai, state lain berubah, dll) dan itu bikin `options`/
  // `selected` dapet REFERENCE baru (walau ISI-nya sama persis, umum
  // terjadi krn useMemo/array baru di parent), effect ini langsung
  // RESET tempSelected balik ke `selected` yg lama (kosong) - PERSIS SE-
  // DETIK setelah user klik centang, jadi KELIATANNYA "diklik ga ngapa-
  // ngapain" padahal sebenernya sempet ke-centang terus langsung ke-reset
  // lagi oleh effect ini sendiri. Sekarang sinkronisasi cuma jalan pas
  // popup BARU TRANSISI dari TERTUTUP -> TERBUKA (pelacakan via ref),
  // bukan tiap kali reference options/selected berubah selagi kebuka.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const validSelected = selected.filter(val => 
        options.some(opt => opt.value === val)
      );
      setTempSelected(validSelected);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, options, selected]);

  const onMouseDown = (e, type, dir = null) => {
    e.stopPropagation();
    setInteraction({ type, dir });
    startState.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      pos: { ...pos },
      size: { ...size }
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!interaction.type || !startState.current) return;
      const { mouseX, mouseY, pos: sPos, size: sSize } = startState.current;
      const dx = e.clientX - mouseX;
      const dy = e.clientY - mouseY;

      if (interaction.type === "drag") {
        let nX = sPos.x + dx, nY = sPos.y + dy;
        // Clamp drag: popup selalu full keliatan di dalam viewport (margin 8px).
        nX = Math.max(8, Math.min(nX, window.innerWidth - sSize.w - 8));
        nY = Math.max(8, Math.min(nY, window.innerHeight - sSize.h - 8));
        setPos({ x: nX, y: nY });
      } else if (interaction.type === "resize") {
        let nW = sSize.w, nH = sSize.h, nX = sPos.x, nY = sPos.y;
        const dir = interaction.dir;

        if (dir.includes("e")) nW = Math.max(200, Math.min(sSize.w + dx, window.innerWidth - sPos.x - 8));
        if (dir.includes("s")) nH = Math.max(240, Math.min(sSize.h + dy, window.innerHeight - sPos.y - 8));
        if (dir.includes("w")) {
          const delta = Math.min(sSize.w - 200, dx);
          nW = sSize.w - delta; nX = sPos.x + delta;
          if (nX < 8) { nW -= (8 - nX); nX = 8; }
        }
        if (dir.includes("n")) {
          const delta = Math.min(sSize.h - 240, dy);
          nH = sSize.h - delta; nY = sPos.y + delta;
          if (nY < 8) { nH -= (8 - nY); nY = 8; }
        }
        setPos({ x: nX, y: nY });
        setSize({ w: nW, h: nH });
      }
    };

    const stop = () => setInteraction({ type: null, dir: null });
    if (interaction.type) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", stop);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stop);
    };
  }, [interaction]);

  const filteredOptions = useMemo(() => 
    options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase())), 
  [options, searchTerm]);

  const isAllSelected = filteredOptions.length > 0 && 
    filteredOptions.every(opt => tempSelected.includes(opt.value));

  const handleSelectAll = () => {
    if (isAllSelected) {
      // Hapus hanya yang ada di filteredOptions saat ini
      const toRemove = filteredOptions.map(o => o.value);
      setTempSelected(prev => prev.filter(v => !toRemove.includes(v)));
    } else {
      // Tambahkan yang ada di filteredOptions
      const toAdd = filteredOptions.map(o => o.value);
      setTempSelected(prev => [...new Set([...prev, ...toAdd])]);
    }
  };

  const dropdownContent = isOpen ? (
    <div 
      style={{
        position: "fixed",
        top: pos.y,
        left: pos.x,
        width: size.w,
        height: size.h,
        background: d ? "rgba(35, 35, 35, 0.8)" : "rgba(255, 255, 255, 0.85)",
        backdropFilter: "blur(40px) saturate(210%) brightness(1.05)",
        WebkitBackdropFilter: "blur(40px) saturate(210%) brightness(1.05)",
        border: `1px solid ${d ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.16)"}`,
        borderRadius: 10,
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.4)",
        zIndex: 2147483647,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: appleFont,
        userSelect: interaction.type ? "none" : "auto"
      }}
    >
      {/* Header / Grab Handle */}
      <div
        onMouseDown={(e) => onMouseDown(e, "drag")}
        style={{
          padding: "11px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          cursor: interaction.type === "drag" ? "grabbing" : "default",
          background: d ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.035)",
          borderBottom: `1px solid ${d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}`,
        }}
      >
        <button
          onClick={() => setIsOpen(false)}
          className="mac-close"
          style={{
            width: 11, height: 11, borderRadius: "50%",
            background: "#FF5F57", border: "none", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
          }}
        >
          <X size={7} color="rgba(0,0,0,0.6)" className="mac-icon" />
        </button>
        <span style={{ fontSize: 12, fontWeight: 800, color: t.hi, letterSpacing: -0.1, flex: 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label || "Filter"}</span>
        <div style={{ width: 11, flexShrink: 0 }} />
      </div>

      <div style={{ padding: 12, flex: 1, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>

        {/* Sort */}
        {/* UPDATE (permintaan user - "mengapa sort ini tidak bisa di
            clear ya"): dulu Asc/Desc cuma bisa SALING GANTI (klik Desc
            pas Asc aktif -> pindah ke Desc), tapi ga ada cara matiin sort
            sepenuhnya dari popup ini - klik tombol yg LAGI AKTIF ga
            ngapa2in (selalu manggil onSort("asc"/"desc") apa adanya,
            ga ngecek status sendiri). Sekarang klik ulang tombol yg
            udah aktif = toggle OFF (onSort(null), balik ke urutan
            default/no-sort). */}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => onSort(sortDir === "asc" ? null : "asc")} title={sortDir === "asc" ? "Klik lagi utk hapus urutan" : undefined} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: "7px", borderRadius: 7, border: `1px solid ${sortDir === "asc" ? t.blue : d ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)"}`, fontSize: 11, fontWeight: 700,
            background: sortDir === "asc" ? t.blue : d ? "rgba(255,255,255,0.06)" : "#F2F2F4",
            color: sortDir === "asc" ? "#fff" : t.hi, cursor: "pointer"
          }}>
            <SortAsc size={13}/> Asc
          </button>
          <button onClick={() => onSort(sortDir === "desc" ? null : "desc")} title={sortDir === "desc" ? "Klik lagi utk hapus urutan" : undefined} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            padding: "7px", borderRadius: 7, border: `1px solid ${sortDir === "desc" ? t.blue : d ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)"}`, fontSize: 11, fontWeight: 700,
            background: sortDir === "desc" ? t.blue : d ? "rgba(255,255,255,0.06)" : "#F2F2F4",
            color: sortDir === "desc" ? "#fff" : t.hi, cursor: "pointer"
          }}>
            <SortDesc size={13}/> Desc
          </button>
        </div>

        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7, padding: "0 9px",
          height: 29, background: d ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.045)",
          borderRadius: 7, border: `1px solid ${d ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.09)"}`
        }}>
          <Search size={12} style={{ color: t.mid, flexShrink: 0 }} />
          <input
            placeholder="Cari…" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ background: "transparent", border: "none", outline: "none", color: t.hi, fontSize: 12, fontWeight: 500, width: "100%" }}
          />
        </div>

        {/* Options List */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <label className="apple-item" onMouseDown={(e) => e.preventDefault()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 5, cursor: "pointer", userSelect: "none", WebkitUserSelect: "none" }}>
            <input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} style={{ display: "none" }} />
            <div style={{
              width: 15, height: 15, borderRadius: 4, flexShrink: 0,
              border: `1.5px solid ${isAllSelected ? t.blue : d ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.32)"}`,
              background: isAllSelected ? t.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {isAllSelected && <Check size={10} color="#fff" strokeWidth={4} />}
            </div>
            <span style={{ fontSize: 12, color: t.hi, fontWeight: 700 }}>Pilih Semua</span>
          </label>

          {filteredOptions.length === 0 && (
            <div style={{ padding: "14px 8px", textAlign: "center", fontSize: 11.5, color: t.mid }}>Tidak ada hasil</div>
          )}

          {filteredOptions.map(opt => {
            const isSelected = tempSelected.includes(opt.value);
            return (
              <label key={opt.value} className="apple-item" onMouseDown={(e) => e.preventDefault()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 5, cursor: "pointer", userSelect: "none", WebkitUserSelect: "none" }}>
                <input type="checkbox" checked={isSelected} onChange={() => setTempSelected(prev => isSelected ? prev.filter(v => v !== opt.value) : [...prev, opt.value])} style={{ display: "none" }} />
                <div style={{
                  width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                  border: `1.5px solid ${isSelected ? t.blue : d ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.32)"}`,
                  background: isSelected ? t.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {isSelected && <Check size={10} color="#fff" strokeWidth={4} />}
                </div>
                <span style={{ fontSize: 12, color: t.hi, fontWeight: 500, wordBreak: "break-word", lineHeight: 1.35 }}>{opt.label}</span>
              </label>
            );
          })}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
          <button onClick={() => { onClear(); onSort(null); setIsOpen(false); }} style={{
            flex: 1, padding: "8px", borderRadius: 7, border: `1px solid ${d ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)"}`,
            background: d ? "rgba(255,255,255,0.07)" : "#EFEFF1", color: t.hi, fontSize: 11.5, fontWeight: 700, cursor: "pointer"
          }}>Reset</button>
          <button onClick={() => { onApply(tempSelected); setIsOpen(false); }} style={{
            flex: 1.8, padding: "8px", borderRadius: 7, border: "none",
            background: t.blue, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer"
          }}>Apply</button>
        </div>
      </div>

      {/* Resize Handles - edge hit-area diperbesar (4px -> 8px) & ditambah
          handle di KEEMPAT pojok (dulu cuma "se") biar resize gampang digrab */}
      <div onMouseDown={e => onMouseDown(e, "resize", "n")} style={{ position: "absolute", top: -2, left: 12, right: 12, height: 8, cursor: "n-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "s")} style={{ position: "absolute", bottom: -2, left: 12, right: 12, height: 8, cursor: "s-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "w")} style={{ position: "absolute", top: 12, bottom: 12, left: -2, width: 8, cursor: "w-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "e")} style={{ position: "absolute", top: 12, bottom: 12, right: -2, width: 8, cursor: "e-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "nw")} style={{ position: "absolute", top: -2, left: -2, width: 14, height: 14, cursor: "nw-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "ne")} style={{ position: "absolute", top: -2, right: -2, width: 14, height: 14, cursor: "ne-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "sw")} style={{ position: "absolute", bottom: -2, left: -2, width: 14, height: 14, cursor: "sw-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "se")} style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, cursor: "se-resize" }} />

      <style>{`
        .apple-item:hover { background: ${d ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}; }
        .mac-icon { opacity: 0; }
        .mac-close:hover .mac-icon { opacity: 1; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(120,120,120,0.3); borderRadius: 10px; }
      `}</style>
    </div>
  ) : null;

  // UPDATE (permintaan user - "disini juga ada penanda jika ada sort yang
  // aktif"): tombol trigger ini dulu CUMA nandain filter checklist aktif
  // (badge angka) - sort (Asc/Desc) yg aktif TANPA checklist apapun
  // (mis. cuma klik Asc doang, ga centang nilai apa2) ga kelihatan sama
  // sekali dari luar popup, padahal tabel beneran keurutin. `sortDir`
  // sekarang ikut dihitung sbg "aktif" buat border/warna tombol, dan kalau
  // TIDAK ada filter checklist (selected.length===0) tapi sort aktif,
  // badge-nya nampilin icon panah kecil (bukan angka) biar beda jelas
  // sama badge jumlah filter.
  const hasFilter = selected.length > 0;
  const hasSort = !!sortDir;
  const isActive = hasFilter || hasSort;
  return (
    <>
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          ref={triggerRef}
          onClick={toggleOpen}
          title={hasSort ? `Terurut ${sortDir === "asc" ? "A-Z" : "Z-A"}` : undefined}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 5,
            border: `1px solid ${isActive ? t.blue : d ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
            background: isActive ? t.blueBg : "transparent",
            color: isActive ? t.blue : t.lo,
            cursor: "pointer", transition: "all 0.1s"
          }}
        >
          <Filter size={12} strokeWidth={2.5} />
          {hasFilter ? (
            <div style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 12, height: 12, padding: "0 2px",
              background: t.blue, color: "#fff", borderRadius: 10,
              fontSize: 8, fontWeight: 900, display: "flex", 
              alignItems: "center", justifyContent: "center"
            }}>
              {selected.length}
            </div>
          ) : hasSort && (
            <div style={{
              position: "absolute", top: -4, right: -4,
              width: 12, height: 12,
              background: t.blue, color: "#fff", borderRadius: 999,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {sortDir === "asc" ? <SortAsc size={8} strokeWidth={3} /> : <SortDesc size={8} strokeWidth={3} />}
            </div>
          )}
        </button>
      </div>

      {typeof document !== "undefined" && createPortal(dropdownContent, document.body)}
    </>
  );
}