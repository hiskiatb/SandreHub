"use client";
// Komponen & helper bersama untuk MPX P&L Report V2 (Summary V2, Form
// Pendapatan V2, Form Pengeluaran V2). Token warna, tipografi, kartu,
// stepper, dan banner di sini MENIRU tampilan P&L Report V1
// (PNL_FormPengeluaran.jsx) supaya V1 & V2 konsisten secara visual
// (permintaan user: "style nya seperti P&L report v1").
import React, { useState } from "react";
import { Calculator, CheckCircle2, Eye } from "lucide-react";

export const FONT = `"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif`;
export const GRAD = "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)";

// pnl_reports_v2.month & .year bertipe INTEGER, sedangkan activeContext
// (dipakai bersama V1) membawa NAMA bulan ("November") & year bisa string.
export const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
export const toMonthInt = (m) => {
  if (typeof m === "number") return m;
  const s = String(m ?? "").trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const i = MONTHS_ID.findIndex((n) => n.toLowerCase() === s.toLowerCase());
  return i >= 0 ? i + 1 : null;
};
export const toYearInt = (y) => { const n = parseInt(y, 10); return Number.isFinite(n) ? n : null; };
export const monthLabel = (m) => { const i = toMonthInt(m); return i ? MONTHS_ID[i - 1] : String(m ?? ""); };

export const numOrZero = (v) => { const n = Number(String(v ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };
export const fmtIDR = (n) => { const v = numOrZero(n); return (v < 0 ? "-Rp " : "Rp ") + Math.abs(v).toLocaleString("id-ID"); };
export const fmtPct = (v) => (!Number.isFinite(v) || !v) ? "—" : `${v.toFixed(1).replace(".", ",")}%`;
const toSep = (v) => { const s = String(v ?? "").replace(/\D/g, ""); return s === "" ? "" : s.replace(/\B(?=(\d{3})+(?!\d))/g, "."); };

// Kunci konteks (partner+branch+tipe+bulan+tahun) - null kalau belum lengkap.
export const ctxKeyOf = (c) => (c?.mpxName && c?.branch && c?.month && c?.year)
  ? [c.mpxName, c.branch, c.mpxType || "", toMonthInt(c.month), toYearInt(c.year)].join("|") : null;

export const mk = (d) => ({
  bg:d?'#0D0D0E':'#F5F5F6', card:d?'#1A1A1D':'#FFFFFF', sub:d?'#202024':'#F2F2F4',
  line:d?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.09)', lineH:d?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)',
  hi:d?'#F2F2F3':'#18181B', mid:d?'#8A8A96':'#52525B', lo:d?'#4D4D58':'#A1A1AA',
  blue:'#ED1C24', blueBg:d?'rgba(237,28,36,0.12)':'rgba(237,28,36,0.07)', blueBd:d?'rgba(237,28,36,0.28)':'rgba(237,28,36,0.20)',
  green:d?'#32BCAD':'#1A9E90', greenBg:d?'rgba(50,188,173,0.13)':'rgba(50,188,173,0.09)', greenBd:d?'rgba(50,188,173,0.30)':'rgba(50,188,173,0.22)',
  amber:d?'#FFCB05':'#C49A00', amberBg:d?'rgba(255,203,5,0.12)':'rgba(255,203,5,0.09)', amberBd:d?'rgba(255,203,5,0.28)':'rgba(255,203,5,0.22)',
  red:d?'#FF6B6B':'#DC2626', redBg:d?'rgba(255,107,107,0.12)':'rgba(220,38,38,0.07)', redBd:d?'rgba(255,107,107,0.28)':'rgba(220,38,38,0.20)',
  inputBg:d?'rgba(255,255,255,0.05)':'#FFFFFF', inputBd:d?'rgba(255,255,255,0.09)':'rgba(0,0,0,0.13)',
  roBg:d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.025)', roBd:d?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)',
  sm:d?'0 1px 2px rgba(0,0,0,0.55)':'0 1px 2px rgba(26,26,29,0.06)',
});

export const V2Styles = ({ d, t }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
    .v2i{width:100%;background:${t.inputBg};border:1px solid ${t.inputBd};border-radius:9px;padding:9px 12px;font-size:14px;font-weight:600;color:${t.hi};outline:none;transition:border-color 0.14s;font-family:inherit;letter-spacing:-0.01em;box-sizing:border-box;text-align:right;font-variant-numeric:tabular-nums}
    .v2i:focus{border-color:#ED1C24;box-shadow:0 0 0 3px rgba(237,28,36,0.14)} .v2i::placeholder{color:${t.lo};font-weight:400}
    .v2i-c{text-align:center}
    .v2i-ro{background:${t.roBg};border-color:${t.roBd};pointer-events:none;user-select:text}
    .v2ta{width:100%;background:${t.inputBg};border:1px solid ${t.inputBd};border-radius:9px;padding:10px 12px;font-size:13px;color:${t.hi};outline:none;font-family:inherit;box-sizing:border-box;resize:vertical}
    .v2ta:focus{border-color:#ED1C24;box-shadow:0 0 0 3px rgba(237,28,36,0.14)} .v2ta::placeholder{color:${t.lo}}
    .v2ta:disabled{background:${t.roBg};border-color:${t.roBd};color:${t.mid}}
    .v2row:hover td{background:rgba(237,28,36,0.03)!important}
    @keyframes v2spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
    .v2btn-p{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:9px;background:${GRAD};color:#fff;border:none;cursor:pointer;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;box-shadow:0 2px 10px rgba(237,28,36,0.30);font-family:inherit;transition:all 0.14s}
    .v2btn-p:hover{box-shadow:0 4px 18px rgba(237,28,36,0.42);transform:translateY(-1px)} .v2btn-p:disabled{opacity:0.55;cursor:not-allowed;transform:none;box-shadow:none}
    .v2btn-g{display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border-radius:9px;border:1px solid ${t.line};background:${t.sub};cursor:pointer;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${t.mid};transition:all 0.13s;font-family:inherit}
    .v2btn-g:hover{border-color:#ED1C24;color:#ED1C24} .v2btn-g:disabled{opacity:0.55;cursor:not-allowed}
  `}</style>
);

// Input angka dgn pemisah ribuan (1.250.000). Selama fokus menampilkan teks
// yang sedang diketik; di luar fokus selalu turunan dari numericValue.
export const NumInput = React.memo(function NumInput({ numericValue, onChange, readOnly, center, placeholder }) {
  const [editing, setEditing] = useState(null);
  const n = numOrZero(numericValue);
  const shown = editing !== null ? editing : (n === 0 ? "" : toSep(n));
  return (
    <input type="text" inputMode="numeric" value={shown} readOnly={readOnly}
      placeholder={readOnly ? "—" : (placeholder ?? "0")}
      className={`v2i${center ? " v2i-c" : ""}${readOnly ? " v2i-ro" : ""}`}
      onFocus={() => { if (!readOnly) setEditing(n === 0 ? "" : toSep(n)); }}
      onBlur={() => setEditing(null)}
      onChange={(e) => { if (readOnly) return; const raw = e.target.value.replace(/\D/g, ""); setEditing(toSep(raw)); onChange?.(raw === "" ? 0 : Number(raw)); }} />
  );
});

export const Card = ({ children, t, style = {} }) => <div style={{ borderRadius:12, border:`1px solid ${t.line}`, background:t.card, boxShadow:t.sm, ...style }}>{children}</div>;
export const Body = ({ children, style = {} }) => <div style={{ padding:'22px 24px', ...style }}>{children}</div>;
export const SecLabel = ({ children, t, right }) => (
  <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:16 }}>
    <div style={{ width:3, height:13, borderRadius:99, background:t.blue, flexShrink:0 }} />
    <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:t.mid, flex:1 }}>{children}</span>
    {right}
  </div>
);
export const TH = ({ children, t, align = "left", width }) => (
  <th style={{ padding:'7px 8px', width, textAlign:align, fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:t.lo }}>{children}</th>
);

export function FormHeader({ icon: Icon, title, activeContext, readOnly, t }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:28 }}>
      <div style={{ width:46, height:46, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:GRAD, color:'#fff', boxShadow:'0 2px 10px rgba(237,28,36,0.30)' }}><Icon size={25} /></div>
      <div style={{ minWidth:0, flex:1 }}>
        <div style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.035em', color:t.hi, lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title} {monthLabel(activeContext?.month)} {activeContext?.year}</div>
        <div style={{ fontSize:12, fontWeight:600, letterSpacing:'0.02em', color:t.mid, marginTop:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{[activeContext?.mpxType, activeContext?.mpxName, activeContext?.branch].filter(Boolean).join(' · ')}</div>
      </div>
      {readOnly && <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:99, background:t.amberBg, border:`1px solid ${t.amberBd}`, color:t.amber, fontSize:11, fontWeight:700, flexShrink:0, whiteSpace:'nowrap' }}><Eye size={12} /> Mode Lihat</div>}
    </div>
  );
}

export function Stepper({ items, step, setStep, t, d }) {
  const R = 34, pct = ((step - 1) / (items.length - 1)) * 100;
  return (
    <div style={{ paddingBottom:36, paddingTop:4 }}>
      <div style={{ position:'relative', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div style={{ position:'absolute', top:R/2, left:R/2, right:R/2, height:1, background:t.line, transform:'translateY(-50%)', zIndex:0 }} />
        <div style={{ position:'absolute', top:R/2, left:R/2, height:2, background:'linear-gradient(90deg,#ED1C24,#C6168D)', width:`calc((100% - ${R}px) * ${pct/100})`, transform:'translateY(-50%)', borderRadius:99, transition:'width 0.3s ease', zIndex:1 }} />
        {items.map((label, i) => {
          const s = i + 1, isA = step === s, isP = step > s;
          return (
            <div key={label} style={{ position:'relative', zIndex:2, display:'flex', flexDirection:'column', alignItems:'center', width:R }}>
              <button onClick={() => setStep(s)} style={{ width:R, height:R, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, border:`2px solid ${(isA||isP)?'#ED1C24':t.line}`, background:(isA||isP)?'linear-gradient(135deg,#ED1C24,#C6168D)':(d?'#1A1A1D':'#FFFFFF'), color:(isA||isP)?'#fff':t.lo, cursor:'pointer', outline:'none', transition:'all 0.2s', transform:isA?'scale(1.10)':'scale(1)', boxShadow:isA?'0 0 0 4px rgba(237,28,36,0.15),0 3px 10px rgba(237,28,36,0.28)':'none', flexShrink:0, fontFamily:'inherit' }}>
                {isP ? <CheckCircle2 size={15} strokeWidth={2.5} /> : s}
              </button>
              <span style={{ marginTop:9, fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:isA?'#ED1C24':t.lo, whiteSpace:'nowrap', transition:'color 0.2s' }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SecHero({ icon: Icon, eyebrow, title, t, children }) {
  return (
    <div style={{ padding:'14px 18px', borderRadius:10, border:`1px solid ${t.blueBd}`, background:t.blueBg, marginBottom:18, boxShadow:t.sm }}>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:38, height:38, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:GRAD, color:'#fff' }}><Icon size={18} /></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.10em', textTransform:'uppercase', color:t.blue, marginBottom:3 }}>{eyebrow}</div>
          <div style={{ fontSize:17, fontWeight:800, letterSpacing:'-0.03em', color:t.hi, lineHeight:1.2 }}>{title}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SubtotalBanner({ label, value }) {
  return (
    <div style={{ padding:'15px 20px', borderRadius:12, background:GRAD, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, boxShadow:'0 4px 20px rgba(237,28,36,0.28)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:34, height:34, borderRadius:8, background:'rgba(255,255,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff' }}><Calculator size={16} /></div>
        <span style={{ fontSize:12, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'#fff' }}>{label}</span>
      </div>
      <span style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.04em', color:'#fff', fontVariantNumeric:'tabular-nums' }}>{fmtIDR(value)}</span>
    </div>
  );
}

export function SumRow({ icon: Icon, label, value, bold, indent, t }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'12px 0', paddingLeft:indent?40:0, borderBottom:`1px solid ${t.lineH}` }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
        {Icon && <div style={{ width:30, height:30, borderRadius:7, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:t.blueBg }}><Icon size={14} style={{ color:t.blue }} /></div>}
        <span style={{ fontSize:13, fontWeight:bold?700:600, color:bold?t.hi:t.mid, whiteSpace:'nowrap' }}>{label}</span>
      </div>
      <span style={{ fontSize:14, fontWeight:700, letterSpacing:'-0.02em', color:value<0?t.red:t.hi, fontVariantNumeric:'tabular-nums', textAlign:'right', flexShrink:0 }}>{fmtIDR(value)}</span>
    </div>
  );
}

// Footer menempel di bawah layar (sama pola dgn FooterNav di V1).
export function FooterBar({ children, t, d }) {
  return (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, borderTop:`1px solid ${t.line}`, background:d?'rgba(13,13,14,0.94)':'rgba(255,255,255,0.94)', backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)', zIndex:60, padding:'11px 20px' }}>
      <div style={{ width:'100%', margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:10 }}>{children}</div>
    </div>
  );
}

export const LoadingBlock = ({ label, t }) => (
  <div style={{ display:'flex', alignItems:'center', gap:8, color:t.mid, fontSize:13, padding:'40px 0', justifyContent:'center', fontFamily:FONT }}>
    <span style={{ width:14, height:14, borderRadius:'50%', border:`2px solid ${t.line}`, borderTopColor:'#ED1C24', animation:'v2spin 0.8s linear infinite', display:'inline-block' }} /> {label}
  </div>
);
