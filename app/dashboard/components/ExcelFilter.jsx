"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, Check, Filter, SortAsc, SortDesc, X } from "lucide-react";

/**
 * ExcelFilter - Apple Standard Edition
 * Logic: Chained Faceted Filtering
 */
export default function ExcelFilter({ 
  options = [], 
  selected = [], 
  onApply, 
  onClear, 
  sortDir, 
  onSort, 
  t, 
  d 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [tempSelected, setTempSelected] = useState(selected);
  
  // Window State
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 240, h: 360 });
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

      setPos({ x: targetX, y: targetY });
    }
    setIsOpen(!isOpen);
  };

  // Logic Sinkronisasi untuk Chained Filter
  // Jika options dari parent berubah (karena filter di kolom lain), 
  // kita tetap mempertahankan pilihan yang masih valid di dalam options baru.
  useEffect(() => {
    if (isOpen) {
      const validSelected = selected.filter(val => 
        options.some(opt => opt.value === val)
      );
      setTempSelected(validSelected);
    }
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
        setPos({ x: sPos.x + dx, y: sPos.y + dy });
      } else if (interaction.type === "resize") {
        let nW = sSize.w, nH = sSize.h, nX = sPos.x, nY = sPos.y;
        const dir = interaction.dir;

        if (dir.includes("e")) nW = Math.max(200, sSize.w + dx);
        if (dir.includes("s")) nH = Math.max(240, sSize.h + dy);
        if (dir.includes("w")) {
          const delta = Math.min(sSize.w - 200, dx);
          nW = sSize.w - delta; nX = sPos.x + delta;
        }
        if (dir.includes("n")) {
          const delta = Math.min(sSize.h - 240, dy);
          nH = sSize.h - delta; nY = sPos.y + delta;
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
        border: `0.5px solid ${d ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
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
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: interaction.type === "drag" ? "grabbing" : "default",
          background: d ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"
        }}
      >
        <button 
          onClick={() => setIsOpen(false)}
          className="mac-close"
          style={{
            width: 11, height: 11, borderRadius: "50%",
            background: "#FF5F57", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
          }}
        >
          <X size={7} color="rgba(0,0,0,0.6)" className="mac-icon" />
        </button>
        <span style={{ fontSize: 10, fontWeight: 700, color: t.lo, opacity: 0.6 }}>Filter</span>
        <div style={{ width: 11 }} />
      </div>

      <div style={{ padding: 12, flex: 1, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
        
        {/* Sort */}
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => onSort("asc")} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            padding: "6px", borderRadius: 6, border: "none", fontSize: 10, fontWeight: 600,
            background: sortDir === "asc" ? t.blue : d ? "rgba(255,255,255,0.1)" : "#E9E9EB",
            color: sortDir === "asc" ? "#fff" : t.hi, cursor: "pointer"
          }}>
            <SortAsc size={12}/> Asc
          </button>
          <button onClick={() => onSort("desc")} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            padding: "6px", borderRadius: 6, border: "none", fontSize: 10, fontWeight: 600,
            background: sortDir === "desc" ? t.blue : d ? "rgba(255,255,255,0.1)" : "#E9E9EB",
            color: sortDir === "desc" ? "#fff" : t.hi, cursor: "pointer"
          }}>
            <SortDesc size={12}/> Desc
          </button>
        </div>

        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "0 8px",
          height: 26, background: d ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", 
          borderRadius: 5, border: "0.5px solid rgba(0,0,0,0.05)"
        }}>
          <Search size={11} style={{ opacity: 0.4 }} />
          <input 
            placeholder="Search" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ background: "transparent", border: "none", outline: "none", color: t.hi, fontSize: 11, width: "100%" }}
          />
        </div>

        {/* Options List */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <label className="apple-item" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} style={{ display: "none" }} />
            <div style={{
              width: 14, height: 14, borderRadius: 3, 
              border: `1px solid ${isAllSelected ? t.blue : d ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}`,
              background: isAllSelected ? t.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {isAllSelected && <Check size={10} color="#fff" strokeWidth={4} />}
            </div>
            <span style={{ fontSize: 11, color: t.hi, fontWeight: 600 }}>Select All</span>
          </label>

          {filteredOptions.map(opt => {
            const isSelected = tempSelected.includes(opt.value);
            return (
              <label key={opt.value} className="apple-item" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={isSelected} onChange={() => setTempSelected(prev => isSelected ? prev.filter(v => v !== opt.value) : [...prev, opt.value])} style={{ display: "none" }} />
                <div style={{
                  width: 14, height: 14, borderRadius: 3, 
                  border: `1px solid ${isSelected ? t.blue : d ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}`,
                  background: isSelected ? t.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {isSelected && <Check size={10} color="#fff" strokeWidth={4} />}
                </div>
                <span style={{ fontSize: 11, color: t.hi }}>{opt.label}</span>
              </label>
            );
          })}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
          <button onClick={() => { onClear(); setIsOpen(false); }} style={{
            flex: 1, padding: "7px", borderRadius: 6, border: "none",
            background: d ? "rgba(255,255,255,0.1)" : "#E5E5EA", color: t.hi, fontSize: 11, fontWeight: 600, cursor: "pointer"
          }}>Reset</button>
          <button onClick={() => { onApply(tempSelected); setIsOpen(false); }} style={{
            flex: 1.8, padding: "7px", borderRadius: 6, border: "none",
            background: t.blue, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer"
          }}>Apply</button>
        </div>
      </div>

      {/* Resize Handles */}
      <div onMouseDown={e => onMouseDown(e, "resize", "n")} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, cursor: "n-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "s")} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, cursor: "s-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "w")} style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 4, cursor: "w-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "e")} style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 4, cursor: "e-resize" }} />
      <div onMouseDown={e => onMouseDown(e, "resize", "se")} style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, cursor: "se-resize" }} />

      <style>{`
        .apple-item:hover { background: ${d ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}; }
        .mac-icon { opacity: 0; }
        .mac-close:hover .mac-icon { opacity: 1; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(120,120,120,0.3); borderRadius: 10px; }
      `}</style>
    </div>
  ) : null;

  return (
    <>
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          ref={triggerRef}
          onClick={toggleOpen}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 5,
            border: `1px solid ${selected.length > 0 ? t.blue : d ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
            background: selected.length > 0 ? t.blueBg : "transparent",
            color: selected.length > 0 ? t.blue : t.lo,
            cursor: "pointer", transition: "all 0.1s"
          }}
        >
          <Filter size={12} strokeWidth={2.5} />
          {selected.length > 0 && (
            <div style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 12, height: 12, padding: "0 2px",
              background: t.blue, color: "#fff", borderRadius: 10,
              fontSize: 8, fontWeight: 900, display: "flex", 
              alignItems: "center", justifyContent: "center"
            }}>
              {selected.length}
            </div>
          )}
        </button>
      </div>

      {typeof document !== "undefined" && createPortal(dropdownContent, document.body)}
    </>
  );
}