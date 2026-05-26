"use client";

import ExcelFilter from "./ExcelFilter";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import supabase from "../../../lib/supabase";
import {
  Search, CheckCircle2, Circle,
  ChevronDown, X, AlertCircle, RotateCcw,
  CalendarRange, EyeOff, XCircle,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS      = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const START_YEAR  = 2026;

function getAvailableMonths() {
  const now    = new Date();
  const curY   = now.getFullYear();
  const curM   = now.getMonth();
  const result = [];
  for (let y = START_YEAR; y <= curY; y++) {
    const maxM = y === curY ? curM : 11;
    for (let m = 0; m <= maxM; m++) {
      result.push({ month: MONTHS[m], year: y, label: `${MONTHS[m]} ${y}`, short: `${MONTH_SHORT[m]} ${y}` });
    }
  }
  return result;
}

const tk = (d) => ({
  card:         d ? "#1A1A1D"                  : "#FFFFFF",
  thead:        d ? "#161618"                  : "#F2F2F4",
  row:          d ? "#111113"                  : "#FFFFFF",
  rowAlt:       d ? "#141416"                  : "#FAFAFA",
  rowHov:       d ? "rgba(237,28,36,0.07)"     : "rgba(237,28,36,0.04)",
  line:         d ? "rgba(255,255,255,0.07)"   : "rgba(0,0,0,0.09)",
  lineH:        d ? "rgba(255,255,255,0.04)"   : "rgba(0,0,0,0.05)",
  hi:           d ? "#F2F2F3"                  : "#18181B",
  mid:          d ? "#8A8A96"                  : "#52525B",
  lo:           d ? "#4D4D58"                  : "#A1A1AA",
  blue:         "#ED1C24",
  blueBg:       d ? "rgba(237,28,36,0.12)"     : "rgba(237,28,36,0.07)",
  blueBd:       d ? "rgba(237,28,36,0.28)"     : "rgba(237,28,36,0.20)",
  green:        d ? "#32BCAD"                  : "#1A9E90",
  greenBg:      d ? "rgba(50,188,173,0.13)"    : "rgba(50,188,173,0.09)",
  greenBd:      d ? "rgba(50,188,173,0.30)"    : "rgba(50,188,173,0.22)",
  amber:        d ? "#FFCB05"                  : "#C49A00",
  amberBg:      d ? "rgba(255,203,5,0.12)"     : "rgba(255,203,5,0.10)",
  amberBd:      d ? "rgba(255,203,5,0.28)"     : "rgba(255,203,5,0.22)",
  red:          d ? "#FF6B6B"                  : "#DC2626",
  redBg:        d ? "rgba(255,107,107,0.13)"   : "rgba(220,38,38,0.08)",
  redBd:        d ? "rgba(255,107,107,0.30)"   : "rgba(220,38,38,0.22)",
  magenta:      "#C6168D",
  magentaBg:    d ? "rgba(198,22,141,0.12)"    : "rgba(198,22,141,0.07)",
  magentaBd:    d ? "rgba(198,22,141,0.28)"    : "rgba(198,22,141,0.18)",
  inputBg:      d ? "rgba(255,255,255,0.05)"   : "#FFFFFF",
  inputBd:      d ? "rgba(255,255,255,0.09)"   : "rgba(0,0,0,0.12)",
  shadow:       d ? "0 1px 3px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.04)"
                  : "0 1px 3px rgba(0,0,0,0.07),0 0 0 1px rgba(0,0,0,0.05)",
  shadowLg:     d ? "0 16px 48px rgba(0,0,0,0.7)"   : "0 16px 48px rgba(0,0,0,0.13)",
  tipShadow:    d ? "0 8px 32px rgba(0,0,0,0.80),0 0 0 1px rgba(255,255,255,0.06)"
                  : "0 8px 32px rgba(0,0,0,0.16),0 0 0 1px rgba(0,0,0,0.06)",
});

const DISABLED_COLOR  = "#DC2626";
const DISABLED_BG     = (d) => d ? "rgba(220,38,38,0.10)" : "rgba(220,38,38,0.07)";
const DISABLED_BD     = (d) => d ? "rgba(220,38,38,0.28)" : "rgba(220,38,38,0.20)";

const makeLocalKey = (row, month, year) =>
  `${row.partner_name}|${row.branch_name}|${row.mpc_mp3}|${month}|${year}`;

function MonthPicker({ selected, onChange, t, d }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const panelRef = useRef(null);
  const available = useMemo(() => getAvailableMonths(), []);

  useEffect(() => {
    const h = (e) => {
      if (!ref.current?.contains(e.target) && !panelRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const allKeys    = available.map(a => `${a.month}|${a.year}`);
  const isAll      = selected.length === available.length;
  const hiddenCnt  = available.length - selected.length;

  const toggle = (key) => {
    if (selected.includes(key)) {
      if (selected.length <= 1) return;
      onChange(selected.filter(k => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  const selectAll   = () => onChange(allKeys);

  const dispLabel = () => {
    if (isAll) return "Semua Bulan";
    if (selected.length === 1) {
      const [m, y] = selected[0].split("|");
      return `${MONTH_SHORT[MONTHS.indexOf(m)]} ${y}`;
    }
    return `${selected.length} bulan dipilih`;
  };

  const byYear = useMemo(() => {
    const map = {};
    available.forEach(a => {
      if (!map[a.year]) map[a.year] = [];
      map[a.year].push(a);
    });
    return map;
  }, [available]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 14px", height: 40, borderRadius: 10,
          border: `1px solid ${!isAll ? t.blueBd : t.inputBd}`,
          background: !isAll ? t.blueBg : t.inputBg,
          cursor: "pointer", fontSize: 13, fontWeight: 600,
          color: !isAll ? t.blue : t.hi,
          transition: "all 0.15s", whiteSpace: "nowrap",
        }}
      >
        <CalendarRange size={15} style={{ flexShrink: 0 }} />
        <span>
          {dispLabel()}
          {hiddenCnt > 0 && (
            <span style={{
              marginLeft: 6, fontSize: 10, fontWeight: 700,
              background: t.amberBg, color: t.amber,
              border: `1px solid ${t.amberBd}`,
              borderRadius: 4, padding: "1px 5px",
            }}>{hiddenCnt} hidden</span>
          )}
        </span>
        <ChevronDown size={13} style={{ opacity: 0.6, marginLeft: 2 }} />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        (() => {
          const rect = ref.current?.getBoundingClientRect();
          if (!rect) return null;
          const W = 340;
          let left = rect.left;
          if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;

          return (
            <div
              ref={panelRef}
              onClick={e => e.stopPropagation()}
              style={{
                position: "fixed", top: rect.bottom + 6, left, width: W,
                background: d ? "#1A1A1D" : "#FFFFFF",
                border: `1px solid ${t.line}`, borderRadius: 14,
                boxShadow: t.shadowLg, zIndex: 99999, padding: 14,
                maxHeight: 480, overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>Filter Bulan Ditampilkan</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={selectAll} style={{
                    height: 24, padding: "0 9px", borderRadius: 6, cursor: "pointer",
                    border: `1px solid ${t.blueBd}`, background: t.blueBg,
                    fontSize: 10, fontWeight: 700, color: t.blue,
                  }}>Pilih Semua</button>
                  {!isAll && (
                    <button onClick={selectAll} style={{
                      height: 24, padding: "0 9px", borderRadius: 6, cursor: "pointer",
                      border: `1px solid ${t.line}`, background: "transparent",
                      fontSize: 10, fontWeight: 600, color: t.mid,
                      display: "flex", alignItems: "center", gap: 3,
                    }}>
                      <RotateCcw size={9} />Reset
                    </button>
                  )}
                </div>
              </div>

              {Object.entries(byYear).map(([year, months]) => (
                <div key={year} style={{ marginBottom: 14 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.10em",
                    textTransform: "uppercase", color: t.mid,
                    marginBottom: 7, paddingBottom: 5,
                    borderBottom: `1px solid ${t.line}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <span>{year}</span>
                    <button
                      onClick={() => {
                        const yearKeys = months.map(m => `${m.month}|${m.year}`);
                        const allYearSel = yearKeys.every(k => selected.includes(k));
                        if (allYearSel) {
                          const remaining = selected.filter(k => !yearKeys.includes(k));
                          if (remaining.length > 0) onChange(remaining);
                        } else {
                          const merged = [...new Set([...selected, ...yearKeys])];
                          onChange(merged);
                        }
                      }}
                      style={{
                        fontSize: 9, fontWeight: 600, color: t.lo, background: "none",
                        border: "none", cursor: "pointer", textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {months.every(m => selected.includes(`${m.month}|${m.year}`)) ? "Hapus" : "Pilih"} semua
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
                    {months.map(({ month, year: y }) => {
                      const key   = `${month}|${y}`;
                      const isSel = selected.includes(key);
                      return (
                        <button
                          key={key}
                          onClick={() => toggle(key)}
                          style={{
                            padding: "7px 4px", borderRadius: 7,
                            border: `1px solid ${isSel ? t.blueBd : t.line}`,
                            background: isSel ? t.blueBg : "transparent",
                            color: isSel ? t.blue : t.mid,
                            fontSize: 11, fontWeight: isSel ? 700 : 500,
                            cursor: "pointer", transition: "all 0.1s",
                            display: "flex", flexDirection: "column",
                            alignItems: "center", gap: 2, position: "relative",
                          }}
                        >
                          <span>{MONTH_SHORT[MONTHS.indexOf(month)]}</span>
                          {!isSel && (
                            <EyeOff size={8} style={{ position: "absolute", top: 3, right: 3, opacity: 0.35, color: t.lo }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div style={{
                paddingTop: 9, borderTop: `1px solid ${t.line}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 11, color: t.mid }}>
                  <strong style={{ color: t.hi }}>{selected.length}</strong> dari {available.length} bulan
                </span>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    fontSize: 11, fontWeight: 600, color: t.blue,
                    background: t.blueBg, border: `1px solid ${t.blueBd}`,
                    borderRadius: 7, padding: "4px 12px", cursor: "pointer",
                  }}
                >Selesai</button>
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}

function StatusCell({ statusInfo, t, d, dbDisabled, saving, onClick, onToggleDisabled, userRole }) {
  const { status, notes, updatedAt } = statusInfo || { status: "EMPTY", notes: null, updatedAt: null };
  const [tip, setTip] = useState(null);
  const btnRef        = useRef(null);
  const canDisable = userRole === "spm_sumatera";

  const fmt = (iso) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); }
    catch { return null; }
  };

  const hasNotes = Boolean(notes?.trim());

  const getConfig = () => {
    if (dbDisabled) return {
      bg:          DISABLED_BG(d),
      borderColor: DISABLED_BD(d),
      icon: saving
        ? <div style={{ width:12,height:12,borderRadius:"50%",border:"2px solid transparent",borderTopColor:DISABLED_COLOR,animation:"cc-spin 0.8s linear infinite" }}/>
        : <XCircle size={16} style={{ color: DISABLED_COLOR }} />,
      label: "Dinonaktifkan",
    };
    if (status === "FINALIZED") {
      const hasPendapatan = notes?.includes("pendapatan:final");
      const hasPengeluaran = notes?.includes("pengeluaran:final");
      const bothFinal = hasPendapatan && hasPengeluaran;
      return {
        bg:          `rgba(50,188,173,${d?0.15:0.10})`,
        borderColor: `rgba(50,188,173,${d?0.35:0.25})`,
        icon: bothFinal
          ? <CheckCircle2 size={17} style={{ color:"#32BCAD" }}/>
          : (
            <div style={{
              width: 17, height: 17, borderRadius: "50%",
              background: "#32BCAD",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800, color: "#fff", lineHeight: 1,
              flexShrink: 0,
            }}>1</div>
          ),
        label: "Finalized",
      };
    }
    if (status === "DRAFT") return {
      bg:          `rgba(255,203,5,${d?0.14:0.10})`,
      borderColor: `rgba(255,203,5,${d?0.35:0.25})`,
      icon:        <div style={{ width:9,height:9,borderRadius:"50%",background:"#FFCB05",boxShadow:"0 0 5px rgba(255,203,5,0.6)" }}/>,
      label:       "Draft",
    };
    return { bg:"transparent", borderColor:"transparent", icon:<Circle size={15} style={{ color:t.lo,opacity:0.4 }}/>, label:"Kosong" };
  };
  const c = getConfig();

  const showTip = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setTip({ x: rect.left + rect.width/2, y: rect.top });
  };
  const hideTip = () => setTip(null);

  const TOOLTIP_W = 240;
  const tooltipEl = tip && typeof document !== "undefined" && createPortal(
    (() => {
      const approxH = dbDisabled ? 88 : (hasNotes ? 150 : 94);
      const above   = tip.y > approxH + 12;
      const top     = above ? tip.y - approxH - 10 : tip.y + 40 + 6;
      let left      = tip.x - TOOLTIP_W/2;
      left = Math.max(8, Math.min(left, window.innerWidth - TOOLTIP_W - 8));
      const arrowL  = tip.x - left - 6;
      const bdColor = dbDisabled
        ? DISABLED_BD(d)
        : status === "FINALIZED" ? "rgba(50,188,173,0.35)"
        : status === "DRAFT"     ? "rgba(255,203,5,0.35)"
        : t.line;

      return (
        <div style={{ position:"fixed",top,left,width:TOOLTIP_W,background:d?"#1A1A1D":"#FFFFFF",border:`1px solid ${bdColor}`,borderRadius:10,boxShadow:t.tipShadow,padding:"10px 13px",zIndex:99999,pointerEvents:"none" }}>
          {above
            ? <div style={{ position:"absolute",top:"100%",left:Math.max(6,Math.min(arrowL,TOOLTIP_W-18)),width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderTop:`6px solid ${d?"#1A1A1D":"#FFFFFF"}` }}/>
            : <div style={{ position:"absolute",bottom:"100%",left:Math.max(6,Math.min(arrowL,TOOLTIP_W-18)),width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderBottom:`6px solid ${d?"#1A1A1D":"#FFFFFF"}` }}/>
          }
          {dbDisabled ? (
            <>
              <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:6 }}>
                <div style={{ display:"inline-flex",alignItems:"center",gap:5,padding:"2px 8px",borderRadius:5,background:DISABLED_BG(d),border:`1px solid ${DISABLED_BD(d)}` }}>
                  <XCircle size={9} style={{ color:DISABLED_COLOR }}/>
                  <span style={{ fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:DISABLED_COLOR }}>Dinonaktifkan</span>
                </div>
              </div>
              <div style={{ fontSize:11,color:t.lo,lineHeight:1.5,fontStyle:"italic" }}>Bulan ini dikecualikan dari kalkulasi progress untuk branch ini.</div>
              <div style={{ marginTop:7,paddingTop:7,borderTop:`1px solid ${t.line}`,fontSize:10.5,color:t.mid,display:"flex",alignItems:"center",gap:4 }}>
                {canDisable ? (
                  <><RotateCcw size={9}/> Klik kanan → aktifkan kembali</>
                ) : (
                  <><AlertCircle size={9}/> Hanya SPM Sumatera yang dapat mengubah status</>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:hasNotes?8:4 }}>
                {status !== "EMPTY" ? (
                  <div style={{ display:"inline-flex",alignItems:"center",gap:5,padding:"2px 8px",borderRadius:5,background:status==="FINALIZED"?"rgba(50,188,173,0.15)":"rgba(255,203,5,0.15)",border:`1px solid ${status==="FINALIZED"?"rgba(50,188,173,0.35)":"rgba(255,203,5,0.35)"}` }}>
                    {status==="FINALIZED"?<CheckCircle2 size={10} style={{ color:"#32BCAD" }}/>:<div style={{ width:6,height:6,borderRadius:"50%",background:"#FFCB05" }}/>}
                    <span style={{ fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:status==="FINALIZED"?"#32BCAD":"#C49A00" }}>{c.label}</span>
                  </div>
                ) : (
                  <span style={{ fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:t.lo }}>Kosong</span>
                )}
                {updatedAt && <span style={{ fontSize:10,color:t.lo,marginLeft:"auto" }}>{fmt(updatedAt)}</span>}
              </div>
              {hasNotes && (
                <div style={{ fontSize:11.5,color:d?"#D0D2D8":"#374151",lineHeight:1.5,borderTop:`1px solid ${t.line}`,paddingTop:7 }}>
                  <span style={{ fontSize:10,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",color:t.mid,display:"block",marginBottom:4 }}>Keterangan</span>
                  {notes}
                </div>
              )}
              {!hasNotes && status !== "EMPTY" && <div style={{ fontSize:10.5,color:t.lo,fontStyle:"italic" }}>Tidak ada keterangan tambahan</div>}
              <div style={{ marginTop:7,paddingTop:7,borderTop:`1px solid ${t.line}`,fontSize:10.5,color:t.lo,display:"flex",alignItems:"center",gap:4 }}>
                {canDisable ? (
                  <><XCircle size={9}/> Klik kanan → nonaktifkan bulan ini</>
                ) : (
                  <><AlertCircle size={9}/> Hanya SPM Sumatera yang dapat mengubah status</>
                )}
              </div>
            </>
          )}
        </div>
      );
    })(),
    document.body
  );

  return (
    <>
      <button
        ref={btnRef}
        onClick={e => { if (!dbDisabled && !saving) { e.stopPropagation(); onClick(e); } }}
        onContextMenu={e => {
          e.preventDefault();
          e.stopPropagation();
          hideTip();
          if (canDisable && !saving) {
            onToggleDisabled();
          }
        }}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
        style={{
          width:34,height:34,borderRadius:8,flexShrink:0,
          display:"flex",alignItems:"center",justifyContent:"center",
          backgroundColor: c.bg,
          backgroundImage: dbDisabled
            ? "repeating-linear-gradient(135deg,rgba(220,38,38,0.06) 0px,rgba(220,38,38,0.06) 1.5px,transparent 1.5px,transparent 8px)"
            : "none",
          border:`1px solid ${c.borderColor}`,
          cursor:dbDisabled?"not-allowed":saving?"wait":"pointer",
          transition:"opacity 0.12s",
          opacity: dbDisabled ? 0.70 : 1,
          position:"relative",
        }}
      >
        {c.icon}
        {!dbDisabled && hasNotes && status !== "EMPTY" && (
          <div style={{ position:"absolute",top:3,right:3,width:6,height:6,borderRadius:"50%",background:status==="FINALIZED"?"#32BCAD":"#FFCB05",border:`1.5px solid ${d?"#1A1A1D":"#FFFFFF"}`,boxShadow:`0 0 4px ${status==="FINALIZED"?"rgba(50,188,173,0.7)":"rgba(255,203,5,0.7)"}` }}/>
        )}
      </button>
      {tooltipEl}
      <style>{`@keyframes cc-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

function ConfirmDisableModal({ payload, onConfirm, onCancel, t, d }) {
  if (!payload) return null;
  const { row, month, year, isCurrentlyDisabled } = payload;
  const isDark = d;
  const accentColor = isCurrentlyDisabled ? "#32BCAD" : "#DC2626";
  const accentBg = isCurrentlyDisabled ? t.greenBg : "rgba(220,38,38,0.08)";

  return createPortal(
    <div
      style={{
        position:"fixed", inset:0, zIndex: 999999,
        background: isDark ? "rgba(0,0,0,0.8)" : "rgba(15, 23, 42, 0.45)",
        display:"flex", alignItems:"center", justifyContent:"center",
        backdropFilter:"blur(8px)", transition: "all 0.2s"
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: isDark ? "#1E1E22" : "#FFFFFF",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"}`,
          borderRadius: 20, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          padding: 0, maxWidth: 420, width: "95%", overflow: "hidden"
        }}
      >
        <div style={{ height: 6, background: accentColor }} />
        <div style={{ padding: "32px 32px 24px 32px" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: accentBg, display: "flex",
            alignItems: "center", justifyContent: "center",
            marginBottom: 20, margin: "0 auto 20px auto"
          }}>
            {isCurrentlyDisabled
              ? <RotateCcw size={28} style={{ color: accentColor }} />
              : <XCircle size={28} style={{ color: accentColor }} />
            }
          </div>
          <div style={{ textAlign: "center" }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: t.hi, marginBottom: 8, letterSpacing: "-0.02em" }}>
              {isCurrentlyDisabled ? "Aktifkan Laporan?" : "Nonaktifkan Laporan?"}
            </h3>
            <p style={{ fontSize: 14, color: t.mid, lineHeight: 1.5 }}>
              Anda akan mengubah status operasional untuk branch:
            </p>
            <div style={{
              marginTop: 16, padding: "12px", borderRadius: 12,
              background: isDark ? "rgba(255,255,255,0.03)" : "#F8FAFC",
              border: `1px solid ${t.line}`
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.hi }}>{row.branch_name}</div>
              <div style={{ fontSize: 12, color: t.lo, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {row.partner_name} • {month} {year}
              </div>
            </div>
          </div>
          <div style={{
            marginTop: 24, fontSize: 13, color: t.mid,
            textAlign: "center", lineHeight: 1.6, padding: "0 10px"
          }}>
            {isCurrentlyDisabled
              ? "Data akan kembali dihitung dalam akumulasi progress pencapaian tahunan."
              : "Branch ini akan diabaikan (X) dari perhitungan progress karena sedang tidak beroperasi pada periode ini."
            }
          </div>
        </div>
        <div style={{
          padding: "0 32px 32px 32px", display: "grid",
          gridTemplateColumns: "1fr 1fr", gap: 12
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 600,
              border: `1px solid ${t.line}`, background: "transparent",
              color: t.mid, cursor: "pointer", transition: "all 0.2s"
            }}
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700,
              border: "none", cursor: "pointer", color: "#FFFFFF",
              background: accentColor,
              boxShadow: `0 4px 12px ${isCurrentlyDisabled ? "rgba(50,188,173,0.3)" : "rgba(220,38,38,0.3)"}`
            }}
          >
            {isCurrentlyDisabled ? "Ya, Aktifkan" : "Ya, Nonaktifkan"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function PNLControlCenter({
  theme, masterData, activeYear, activeMonth,
  onOpenBranch, userRole,
}) {
  const d = theme === "dark";
  const t = tk(d);

  const availableMonths = useMemo(() => getAvailableMonths(), []);
  const allKeys         = useMemo(() => availableMonths.map(a => `${a.month}|${a.year}`), [availableMonths]);

  const [selectedKeys, setSelectedKeys] = useState(() => allKeys);

  useEffect(() => {
    setSelectedKeys(allKeys);
  }, [allKeys.join(",")]);

  const visibleCols = useMemo(() => {
    return availableMonths.filter(a => selectedKeys.includes(`${a.month}|${a.year}`));
  }, [availableMonths, selectedKeys]);

  const [dbDisabledMap,  setDbDisabledMap]  = useState(new Map());
  const [localDisabled,  setLocalDisabled]  = useState(new Set());
  const [savingKeys,     setSavingKeys]     = useState(new Set());
  const [confirmModal,   setConfirmModal]   = useState(null);

  const [statusMap, setStatusMap] = useState({});
  const [loading,   setLoading]   = useState(true);

  const [search,     setSearch]     = useState("");
  const [sortCol,    setSortCol]    = useState("partner");
  const [sortDir,    setSortDir]    = useState("asc");
  const [fType,      setFType]      = useState([]);
  const [fPartner,   setFPartner]   = useState([]);
  const [fBranch,    setFBranch]    = useState([]);
  const [fRegion,    setFRegion]    = useState([]);
  const [fDoneCount, setFDoneCount] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("pnl_reports")
        .select("partner_name,branch,mpc_mp3,month,year,is_finalized,validation_notes,finalized_at,updated_at")
        .eq("year", Number(activeYear));
      if (!error && data) {
        const map = {};
        data.forEach(item => {
          const key = `${item.partner_name}|${item.branch}|${item.mpc_mp3}|${item.month}|${item.year}`;
          map[key] = item;
        });
        setStatusMap(map);
      }
      setLoading(false);
    })();
  }, [activeYear]);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("pnl_disabled_months")
          .select("partner_name,branch_name,mpc_mp3,month,year");
        if (error) {
          if (error.code === "42P01") {
            console.warn("[pnl_disabled_months] Tabel belum dibuat.");
          } else {
            console.error("[pnl_disabled_months] Load error:", error.message);
          }
          return;
        }
        const map = new Map();
        (data || []).forEach(r => {
          const key = `${r.partner_name}|${r.branch_name}|${r.mpc_mp3}|${r.month}|${r.year}`;
          map.set(key, true);
        });
        setDbDisabledMap(map);
      } catch(e) {
        console.error("[pnl_disabled_months] Exception:", e?.message);
      }
    })();
  }, []);

  useEffect(() => {
    let channel;
    try {
      channel = supabase
        .channel("cc_disabled_months_all")
        .on("postgres_changes",
          { event: "*", schema: "public", table: "pnl_disabled_months" },
          (payload) => {
            const { eventType, new: n, old: o } = payload;
            setDbDisabledMap(prev => {
              const next = new Map(prev);
              if (eventType === "INSERT" && n) {
                const key = `${n.partner_name}|${n.branch_name}|${n.mpc_mp3}|${n.month}|${n.year}`;
                next.set(key, true);
                setLocalDisabled(p => { const s = new Set(p); s.delete(key); return s; });
              } else if (eventType === "DELETE" && o) {
                const key = `${o.partner_name}|${o.branch_name}|${o.mpc_mp3}|${o.month}|${o.year}`;
                next.delete(key);
                setLocalDisabled(p => { const s = new Set(p); s.delete(key); return s; });
              }
              return next;
            });
          }
        )
        .subscribe((status, err) => {
          if (err) console.warn("[pnl_disabled_months] Realtime:", err?.message);
        });
    } catch(e) {
      console.warn("[pnl_disabled_months] Realtime setup failed:", e?.message);
    }
    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  const isDbDisabled = useCallback((row, month, year) => {
    const key = `${row.partner_name}|${row.branch_name}|${row.mpc_mp3}|${month}|${year}`;
    return localDisabled.has(key) || dbDisabledMap.has(key);
  }, [localDisabled, dbDisabledMap]);

  const isSaving = useCallback((row, month, year) => {
    const key = `${row.partner_name}|${row.branch_name}|${row.mpc_mp3}|${month}|${year}`;
    return savingKeys.has(key);
  }, [savingKeys]);

  const handleToggleDisabled = useCallback((row, month, year) => {
    if (userRole !== "spm_sumatera") return;
    const key = `${row.partner_name}|${row.branch_name}|${row.mpc_mp3}|${month}|${year}`;
    const isCurrentlyDisabled = localDisabled.has(key) || dbDisabledMap.has(key);
    setConfirmModal({ row, month, year, isCurrentlyDisabled, key });
  }, [userRole, localDisabled, dbDisabledMap]);

  const handleConfirmDisable = useCallback(async () => {
    if (!confirmModal) return;
    const { row, month, year, isCurrentlyDisabled, key } = confirmModal;
    setConfirmModal(null);
    const yearNum = Number(year);
    setSavingKeys(prev => new Set([...prev, key]));
    if (isCurrentlyDisabled) {
      setLocalDisabled(prev => { const n = new Set(prev); n.delete(key); return n; });
      setDbDisabledMap(prev => { const n = new Map(prev); n.delete(key); return n; });
    } else {
      setLocalDisabled(prev => new Set([...prev, key]));
    }
    if (isCurrentlyDisabled) {
      const { error } = await supabase
        .from("pnl_disabled_months")
        .delete()
        .eq("partner_name", row.partner_name)
        .eq("branch_name",  row.branch_name)
        .eq("mpc_mp3",      row.mpc_mp3)
        .eq("month",        month)
        .eq("year",         yearNum);
      if (error) {
        console.error("Re-enable failed:", error);
        setDbDisabledMap(prev => { const n = new Map(prev); n.set(key, true); return n; });
        setLocalDisabled(prev => { const n = new Set(prev); n.delete(key); return n; });
      }
    } else {
      const { data: upserted, error } = await supabase
        .from("pnl_disabled_months")
        .upsert({
          partner_name: row.partner_name,
          branch_name:  row.branch_name,
          mpc_mp3:      row.mpc_mp3,
          month,
          year:         yearNum,
        }, { onConflict: "partner_name,branch_name,mpc_mp3,month,year" })
        .select();
      if (error) {
        console.error("Disable failed:", error);
        setLocalDisabled(prev => { const n = new Set(prev); n.delete(key); return n; });
      } else {
        setLocalDisabled(prev => { const n = new Set(prev); n.delete(key); return n; });
        setDbDisabledMap(prev => { const n = new Map(prev); n.set(key, true); return n; });
      }
    }
    setSavingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
  }, [confirmModal]);

  const getStatusInfo = useCallback((row, month, year) => {
    const key  = `${row.partner_name}|${row.branch_name}|${row.mpc_mp3}|${month}|${year}`;
    const item = statusMap[key];
    if (!item) return { status: "EMPTY", notes: null, updatedAt: null };
    return {
      status:    item.is_finalized ? "FINALIZED" : "DRAFT",
      notes:     item.validation_notes || null,
      updatedAt: item.finalized_at || item.updated_at || null,
    };
  }, [statusMap]);

  const clearFilters = () => { setSearch(""); setFType([]); setFRegion([]); setFPartner([]); setFBranch([]); setFDoneCount([]); };
  const hasFilter = Boolean(search || fType.length || fRegion.length || fPartner.length || fBranch.length || fDoneCount.length);

  // ── allRows: rangeStatuses/rangeDisabledMask dari availableMonths (semua bulan)
  //            visRange* dari visibleCols (bulan yang dipilih MonthPicker) ─────
  const allRows = useMemo(() =>
    masterData.map(row => {
      // rangeStatuses/rangeDisabledMask → semua availableMonths (untuk filter fDoneCount)
      const rangeStatuses     = availableMonths.map(a => getStatusInfo(row, a.month, a.year).status);
      const rangeDisabledMask = availableMonths.map(a => isDbDisabled(row, a.month, a.year));
      // vis* → hanya visibleCols (kolom tabel yang ditampilkan)
      const visStatusInfos    = visibleCols.map(a => getStatusInfo(row, a.month, a.year));
      const visDisabledMask   = visibleCols.map(a => isDbDisabled(row, a.month, a.year));
      const visSavingMask     = visibleCols.map(a => isSaving(row, a.month, a.year));
      // visRange* → STATUS di visibleCols → dipakai summary cards, progress bar, kolom Selesai
      const visRangeStatuses     = visibleCols.map(a => getStatusInfo(row, a.month, a.year).status);
      const visRangeDisabledMask = visibleCols.map(a => isDbDisabled(row, a.month, a.year));
      return { ...row, rangeStatuses, rangeDisabledMask, visStatusInfos, visDisabledMask, visSavingMask, visRangeStatuses, visRangeDisabledMask };
    }),
  [masterData, statusMap, dbDisabledMap, localDisabled, savingKeys, visibleCols, availableMonths, getStatusInfo, isDbDisabled, isSaving]);

  const typeOptions    = useMemo(() => [...new Set(masterData.map(r => r.mpc_mp3).filter(Boolean))].sort().map(v => ({ value:v, label:v })), [masterData]);
  const partnerOptions = useMemo(() => {
    let l = fType.length ? masterData.filter(r => fType.includes(r.mpc_mp3)) : masterData;
    return [...new Set(l.map(r => r.partner_name).filter(Boolean))].sort().map(v => ({ value:v, label:v }));
  }, [masterData, fType]);
  const branchOptions  = useMemo(() => {
    let l = masterData;
    if (fType.length)    l = l.filter(r => fType.includes(r.mpc_mp3));
    if (fPartner.length) l = l.filter(r => fPartner.includes(r.partner_name));
    return [...new Set(l.map(r => r.branch_name).filter(Boolean))].sort().map(v => ({ value:v, label:v }));
  }, [masterData, fType, fPartner]);
  const regionOptions  = useMemo(() => [...new Set(masterData.map(r => r.region).filter(Boolean))].sort().map(v => ({ value:v, label:v })), [masterData]);
  const doneCountOptions = useMemo(() => {
    const counts = [...new Set(allRows.map(r =>
      r.rangeStatuses.filter((s,i) => s==="FINALIZED" && !r.rangeDisabledMask[i]).length
    ))].sort((a,b) => a-b);
    return counts.map(c => ({ value:c, label:String(c) }));
  }, [allRows]);

  const rows = useMemo(() => {
    let list = allRows;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(r =>
        r.partner_name?.toLowerCase().includes(s) ||
        r.branch_name?.toLowerCase().includes(s)  ||
        r.mpc_mp3?.toLowerCase().includes(s)
      );
    }
    if (fType.length)      list = list.filter(r => fType.includes(r.mpc_mp3));
    if (fPartner.length)   list = list.filter(r => fPartner.includes(r.partner_name));
    if (fBranch.length)    list = list.filter(r => fBranch.includes(r.branch_name));
    if (fRegion.length)    list = list.filter(r => fRegion.includes(r.region));
    if (fDoneCount.length) {
      list = list.filter(r =>
        fDoneCount.includes(r.rangeStatuses.filter((s,i) => s==="FINALIZED" && !r.rangeDisabledMask[i]).length)
      );
    }
    list = [...list].sort((a,b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortCol === "type")    return dir * (a.mpc_mp3      ||"").localeCompare(b.mpc_mp3      ||"");
      if (sortCol === "partner") return dir * (a.partner_name ||"").localeCompare(b.partner_name ||"");
      if (sortCol === "branch")  return dir * (a.branch_name  ||"").localeCompare(b.branch_name  ||"");
      if (sortCol === "done") {
        // Sort kolom Selesai juga pakai visRange agar konsisten
        const av = a.visRangeStatuses.filter((s,i) => s==="FINALIZED" && !a.visRangeDisabledMask[i]).length;
        const bv = b.visRangeStatuses.filter((s,i) => s==="FINALIZED" && !b.visRangeDisabledMask[i]).length;
        return dir * (av - bv);
      }
      return 0;
    });
    return list;
  }, [allRows, search, fType, fPartner, fBranch, fRegion, fDoneCount, sortCol, sortDir]);

  // ── Stats: dihitung dari visRangeStatuses/visRangeDisabledMask
  //           → mengikuti range bulan yang dipilih di MonthPicker ────────────
  const totalCells    = rows.reduce((a,r) => a + r.visRangeDisabledMask.filter(v=>!v).length, 0);
  const finalCells    = rows.reduce((a,r) => a + r.visRangeStatuses.filter((s,i)=>s==="FINALIZED"&&!r.visRangeDisabledMask[i]).length, 0);
  const draftCells    = rows.reduce((a,r) => a + r.visRangeStatuses.filter((s,i)=>s==="DRAFT"&&!r.visRangeDisabledMask[i]).length, 0);
  const emptyCells    = totalCells - finalCells - draftCells;
  const totalDisabled = rows.reduce((a,r) => a + r.visRangeDisabledMask.filter(Boolean).length, 0);
  const pct           = totalCells > 0 ? Math.round((finalCells/totalCells)*100) : 0;

  const COL_FIXED = [72, 110, 190, 190, 72];
  const colWidths = [...COL_FIXED, ...visibleCols.map(() => 54)];

  const TH = ({ colIdx, sortKey, children, filterConfig }) => {
    const isActiveSort = sortCol === sortKey;
    return (
      <th style={{ position:"sticky",top:0,zIndex:20,width:colWidths[colIdx],minWidth:colWidths[colIdx],padding:"0 14px",height:42,textAlign:"left",fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:isActiveSort?t.blue:t.mid,background:t.thead,borderBottom:`1px solid ${t.line}`,borderRight:`1px solid ${t.lineH}`,whiteSpace:"nowrap",overflow:"visible" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",overflow:"visible" }}>
          <span style={{ overflow:"hidden",textOverflow:"ellipsis",marginRight:8 }}>{children}</span>
          {filterConfig && <ExcelFilter {...filterConfig} t={t} d={d} />}
        </div>
      </th>
    );
  };

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:22 }}>
      <ConfirmDisableModal payload={confirmModal} onConfirm={handleConfirmDisable} onCancel={()=>setConfirmModal(null)} t={t} d={d}/>

      {/* Title */}
      <div>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
          <div style={{ height:20,width:3,borderRadius:2,background:"linear-gradient(180deg,#ED1C24 0%,#C6168D 100%)" }}/>
          <div style={{ fontSize:10,fontWeight:700,letterSpacing:"0.16em",textTransform:"uppercase",color:"#ED1C24" }}>Laporan Tahun {activeYear}</div>
        </div>
        <h1 style={{ fontSize:28,fontWeight:800,letterSpacing:"-0.04em",color:t.hi,marginBottom:5 }}>PNL Control Center</h1>
        <p style={{ fontSize:14,color:t.mid }}>
          Data s.d. <strong style={{ color:t.hi,fontWeight:600 }}>{activeMonth} {activeYear}</strong>
          {" · "}{rows.length} branch aktif
          {totalDisabled>0 && <span style={{ marginLeft:8,color:DISABLED_COLOR,fontSize:12 }}>· {totalDisabled} sel dinonaktifkan</span>}
          {visibleCols.length < availableMonths.length && (
            <span style={{ marginLeft:8,color:t.amber,fontSize:12 }}>
              · menampilkan {visibleCols.length} dari {availableMonths.length} bulan
            </span>
          )}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { label:"Pencapaian",    value:`${pct}%`,    sub:`${finalCells} dari ${totalCells} laporan aktif`,   color:t.green,      bg:t.greenBg },
          { label:"Finalized",     value:finalCells,   sub:"laporan telah difinalisasi",                        color:t.green,      bg:t.greenBg },
          { label:"Draft",         value:draftCells,   sub:"laporan belum difinalisasi",                        color:t.amber,      bg:t.amberBg },
          { label:"Dinonaktifkan", value:totalDisabled,sub:"sel dikecualikan dari progress",                    color:DISABLED_COLOR,bg:d?"rgba(220,38,38,0.10)":"rgba(220,38,38,0.07)" },
        ].map(c => (
          <div key={c.label} style={{ padding:"18px 20px",borderRadius:12,border:`1px solid ${t.line}`,background:t.card,boxShadow:t.shadow }}>
            <div style={{ fontSize:11,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:t.mid,marginBottom:10 }}>{c.label}</div>
            <div style={{ fontSize:28,fontWeight:800,letterSpacing:"-0.04em",color:c.color,lineHeight:1 }}>{c.value}</div>
            <div style={{ fontSize:12,marginTop:7,fontWeight:500,color:t.mid }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ borderRadius:12,border:`1px solid ${t.line}`,background:t.card,padding:"16px 20px",boxShadow:t.shadow }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
          <span style={{ fontSize:13,fontWeight:600,color:t.mid }}>
            Progress {visibleCols.length < availableMonths.length ? `(${visibleCols.length} bulan dipilih)` : `keseluruhan ${activeYear}`}
          </span>
          <span style={{ fontSize:13,fontWeight:700,color:t.hi }}>{pct}%</span>
        </div>
        <div style={{ height:8,borderRadius:99,background:t.line,overflow:"hidden" }}>
          <div style={{ height:"100%",borderRadius:99,background:"linear-gradient(90deg,#32BCAD 0%,#1A9E90 100%)",width:`${pct}%`,transition:"width 0.6s ease",boxShadow:pct>0?"0 0 8px rgba(50,188,173,0.4)":"none" }}/>
        </div>
        <div style={{ display:"flex",justifyContent:"space-between",marginTop:8 }}>
          <span style={{ fontSize:11,color:t.lo }}>
            {finalCells} finalized · {draftCells} draft · {emptyCells} kosong
            {totalDisabled>0&&<span style={{ color:DISABLED_COLOR }}> · {totalDisabled} dinonaktifkan</span>}
          </span>
          <span style={{ fontSize:11,color:t.lo }}>{visibleCols.length} kolom ditampilkan</span>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,flex:"1 1 200px",minWidth:160,border:`1px solid ${t.inputBd}`,borderRadius:10,background:t.inputBg,height:40,padding:"0 14px" }}>
          <Search size={15} style={{ color:t.mid,flexShrink:0 }}/>
          <input
            placeholder="Cari partner, branch..."
            value={search} onChange={e=>setSearch(e.target.value)}
            style={{ flex:1,background:"transparent",border:"none",fontSize:13,fontWeight:500,color:t.hi,outline:"none",minWidth:0 }}
          />
        </div>
        <MonthPicker selected={selectedKeys} onChange={setSelectedKeys} t={t} d={d}/>
        {hasFilter && (
          <button onClick={clearFilters} style={{ display:"flex",alignItems:"center",gap:6,padding:"0 16px",height:40,borderRadius:10,background:d?"rgba(255,69,58,0.1)":"#FEE2E2",border:`1px solid ${d?"rgba(255,69,58,0.2)":"#FECACA"}`,cursor:"pointer",color:t.red,fontSize:13,fontWeight:600 }}>
            <X size={16} strokeWidth={2.5}/><span>Reset Filter</span>
          </button>
        )}
        <div style={{ marginLeft:"auto",fontSize:12,fontWeight:600,color:t.lo }}>{rows.length} Branch</div>
      </div>

      {/* Table */}
      <div style={{ borderRadius:12,border:`1px solid ${t.line}`,background:t.card,overflow:"hidden",boxShadow:t.shadow }}>
        <div style={{ display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",padding:"10px 18px",borderBottom:`1px solid ${t.line}`,background:t.thead }}>
          {[
            { label:"Finalized",     color:"#32BCAD",      dot:<CheckCircle2 size={12} style={{ color:"#32BCAD" }}/> },
            { label:"Draft",         color:"#C49A00",      dot:<div style={{ width:8,height:8,borderRadius:"50%",background:"#FFCB05",boxShadow:"0 0 4px rgba(255,203,5,0.6)" }}/> },
            { label:"Kosong",        color:t.lo,           dot:<Circle size={12} style={{ opacity:0.5,color:t.lo }}/> },
            { label:"Dinonaktifkan", color:DISABLED_COLOR, dot:<XCircle size={12} style={{ color:DISABLED_COLOR }}/> },
          ].map(l => (
            <div key={l.label} style={{ display:"flex",alignItems:"center",gap:5 }}>
              <span style={{ display:"flex" }}>{l.dot}</span>
              <span style={{ fontSize:11,fontWeight:600,color:t.mid }}>{l.label}</span>
            </div>
          ))}
          <div style={{ marginLeft:"auto",fontSize:11,color:t.lo }}>Hover → info · Klik → buka · Klik kanan → nonaktifkan</div>
        </div>

        {loading ? (
          <div style={{ height:280,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12 }}>
            <div style={{ position:"relative",width:40,height:40 }}>
              <div style={{ position:"absolute",inset:0,borderRadius:"50%",border:"2px solid transparent",borderTopColor:"#ED1C24",borderRightColor:"#C6168D",animation:"cc-spin 0.9s linear infinite" }}/>
            </div>
            <span style={{ fontSize:12,color:t.mid,fontWeight:500 }}>Memuat data…</span>
            <style>{`@keyframes cc-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ height:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10 }}>
            <AlertCircle size={26} style={{ color:t.lo }}/>
            <span style={{ fontSize:14,color:t.mid }}>Tidak ada data yang cocok</span>
            {hasFilter && <button onClick={clearFilters} style={{ fontSize:13,color:t.blue,background:"none",border:"none",cursor:"pointer",fontWeight:600 }}>Hapus semua filter</button>}
          </div>
        ) : (
          <div style={{ overflowX:"auto",overflowY:"auto",maxHeight:"60vh" }}>
            <table style={{ borderCollapse:"collapse",fontSize:13,tableLayout:"fixed",width:"max-content",minWidth:"100%" }}>
              <colgroup>{colWidths.map((w,i)=><col key={i} style={{ width:w }}/>)}</colgroup>
              <thead>
                <tr>
                  <TH colIdx={0} sortKey="type"    filterConfig={{ label:"Tipe",          options:typeOptions,    selected:fType,    onApply:setFType,    onClear:()=>setFType([]),    sortDir:sortCol==="type"?sortDir:null,    onSort:dir=>{setSortCol("type");setSortDir(dir);} }}>Tipe</TH>
                  <TH colIdx={1} sortKey="partner" filterConfig={{ label:"Partner",        options:partnerOptions, selected:fPartner, onApply:v=>{setFPartner(v);setFBranch([]);}, onClear:()=>{setFPartner([]);setFBranch([]);}, sortDir:sortCol==="partner"?sortDir:null, onSort:dir=>{setSortCol("partner");setSortDir(dir);} }}>Partner</TH>
                  <TH colIdx={2} sortKey="branch"  filterConfig={{ label:"Kantor Cabang",  options:branchOptions,  selected:fBranch,  onApply:setFBranch,  onClear:()=>setFBranch([]),  sortDir:sortCol==="branch"?sortDir:null,  onSort:dir=>{setSortCol("branch");setSortDir(dir);} }}>Kantor Cabang</TH>
                  <TH colIdx={3} sortKey="region"  filterConfig={{ label:"Region",         options:regionOptions,  selected:fRegion,  onApply:setFRegion,  onClear:()=>setFRegion([]),  sortDir:sortCol==="region"?sortDir:null,  onSort:dir=>{setSortCol("region");setSortDir(dir);} }}>Region</TH>
                  <TH colIdx={4} sortKey="done"    filterConfig={{ label:"Jumlah Selesai", options:doneCountOptions,selected:fDoneCount,onApply:setFDoneCount,onClear:()=>setFDoneCount([]),sortDir:sortCol==="done"?sortDir:null, onSort:dir=>{setSortCol("done");setSortDir(dir);} }}>Selesai</TH>
                  {visibleCols.map((col) => {
                    const isActive = col.month === activeMonth && String(col.year) === String(activeYear);
                    return (
                      <th key={`${col.month}|${col.year}`} style={{
                        position:"sticky",top:0,zIndex:11,
                        width:54,minWidth:54,padding:"0 2px",height:42,
                        textAlign:"center",fontSize:10,fontWeight:700,
                        letterSpacing:"0.04em",textTransform:"uppercase",
                        background:isActive?(d?"#200506":"#FFF5F5"):t.thead,
                        borderBottom:isActive?"2px solid #ED1C24":`1px solid ${t.line}`,
                        borderRight:`1px solid ${t.lineH}`,
                        whiteSpace:"nowrap",userSelect:"none",overflow:"hidden",
                      }}>
                        <div style={{ color:isActive?t.blue:t.mid, lineHeight:1.2 }}>
                          <div>{MONTH_SHORT[MONTHS.indexOf(col.month)]}</div>
                          <div style={{ fontSize:9, opacity:0.7 }}>{col.year}</div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  // finCount dan activeMonthCt menggunakan visRange agar konsisten dengan summary cards
                  const finCount      = row.visRangeStatuses.filter((s,i)=>s==="FINALIZED"&&!row.visRangeDisabledMask[i]).length;
                  const activeMonthCt = row.visRangeDisabledMask.filter(v=>!v).length;
                  const isEven        = idx%2===0;
                  const rowBg         = isEven ? t.row : t.rowAlt;
                  return (
                    <tr
                      key={`${row.partner_name}|${row.branch_name}|${row.mpc_mp3}`}
                      style={{ borderTop:`1px solid ${t.lineH}`,background:rowBg,transition:"background 0.12s" }}
                      onMouseEnter={e=>e.currentTarget.style.background=t.rowHov}
                      onMouseLeave={e=>e.currentTarget.style.background=rowBg}
                    >
                      <td style={{ padding:"9px 14px",borderRight:`1px solid ${t.lineH}`,overflow:"hidden" }}>
                        <span style={{ display:"inline-block",padding:"3px 8px",borderRadius:5,fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",background:t.magentaBg,color:t.magenta,border:`1px solid ${t.magentaBd}`,whiteSpace:"nowrap" }}>{row.mpc_mp3}</span>
                      </td>
                      <td style={{ padding:"9px 14px",borderRight:`1px solid ${t.lineH}`,overflow:"hidden" }}>
                        <div style={{ fontWeight:700,fontSize:13,color:t.hi,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",letterSpacing:"-0.01em" }}>{row.partner_name}</div>
                      </td>
                      <td style={{ padding:"9px 14px",borderRight:`1px solid ${t.lineH}`,overflow:"hidden" }}>
                        <div style={{ fontSize:12,color:t.mid,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{row.branch_name}</div>
                      </td>
                      <td style={{ padding:"9px 14px",borderRight:`1px solid ${t.lineH}`,overflow:"hidden" }}>
                        <div style={{ fontSize:12,color:t.mid,whiteSpace:"nowrap" }}>{row.region}</div>
                      </td>
                      <td style={{ padding:"9px 14px",textAlign:"center",borderRight:`1px solid ${t.lineH}` }}>
                        <span style={{ fontSize:13,fontWeight:700,color:finCount===activeMonthCt&&activeMonthCt>0?"#32BCAD":finCount>0?"#C49A00":t.lo }}>
                          {finCount}<span style={{ fontSize:11,fontWeight:500,color:t.lo }}>/{activeMonthCt}</span>
                        </span>
                      </td>
                      {visibleCols.map((col, mi) => {
                        const cellDisabled = row.visDisabledMask[mi];
                        const cellSaving   = row.visSavingMask[mi];
                        const isActive     = col.month===activeMonth && String(col.year)===String(activeYear);
                        return (
                          <td key={`${col.month}|${col.year}`} style={{
                            padding:"5px 3px",textAlign:"center",
                            borderRight:`1px solid ${t.lineH}`,
                            background: cellDisabled
                              ? (d?"rgba(220,38,38,0.06)":"rgba(220,38,38,0.04)")
                              : isActive
                                ? (d?"rgba(237,28,36,0.04)":"rgba(237,28,36,0.03)")
                                : undefined,
                          }}>
                            <div style={{ display:"flex",justifyContent:"center" }}>
                              <StatusCell
                                statusInfo={row.visStatusInfos[mi]}
                                t={t} d={d}
                                dbDisabled={cellDisabled}
                                saving={cellSaving}
                                userRole={userRole}
                                onClick={e => {
                                  e.stopPropagation();
                                  onOpenBranch({ partner_name:row.partner_name,branch_name:row.branch_name,mpc_mp3:row.mpc_mp3,month:col.month,year:col.year });
                                }}
                                onToggleDisabled={() => handleToggleDisabled(row, col.month, col.year)}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}