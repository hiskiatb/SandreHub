"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import supabase from "../../../lib/supabase";
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight, AlertCircle, CheckCircle2, Send, Upload, ShieldCheck,
  BarChart3, Zap, Layers, X, FileCheck, TrendingUp,
  Award, Banknote, Gift, Loader2,
  Save, ArrowRight, ArrowLeft, Clock, Plus, Trash2
} from 'lucide-react';

// ─── UTILITIES ────────────────────────────────────────────────────────────────
const formatIDR = (val) => {
  const isNegative = val < 0;
  const formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Math.abs(val));
  return isNegative ? `-${formatted}` : formatted;
};
const formatPct = (val) => isFinite(val) && val !== 0 ? `${val.toFixed(2)}%` : '0.00%';
const toSep = (val) => {
  if (val === undefined || val === null || val === '') return '';
  if (val === 0 || val === '0') return '0';
  return val.toString().replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};
const parseNum = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const n = Number(val.toString().replace(/\./g, ''));
  return isNaN(n) ? 0 : n;
};
const fmtDate = (iso) => {
  if (!iso) return null;
  return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg:       d ? '#07090D' : '#F2F2F7',
  card:     d ? '#0D1019' : '#FFFFFF',
  sub:      d ? '#131826' : '#F5F5F8',
  pill:     d ? '#1A2030' : '#EEEEF3',
  line:     d ? 'rgba(255,255,255,0.07)'  : 'rgba(0,0,0,0.09)',
  lineH:    d ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)',
  hi:       d ? '#EEF0F5' : '#1A1A1E',
  mid:      d ? '#8892A4' : '#4B5563',
  lo:       d ? '#424D60' : '#9CA3AF',
  blue:     '#0A84FF',
  blueBg:   d ? 'rgba(10,132,255,0.11)' : 'rgba(10,132,255,0.07)',
  blueBd:   d ? 'rgba(10,132,255,0.26)' : 'rgba(10,132,255,0.18)',
  green:    d ? '#2ED158' : '#16A34A',
  greenBg:  d ? 'rgba(46,209,88,0.10)' : 'rgba(22,163,74,0.08)',
  greenBd:  d ? 'rgba(46,209,88,0.20)' : 'rgba(22,163,74,0.16)',
  red:      d ? '#FF453A' : '#DC2626',
  inputBg:  d ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
  inputBd:  d ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.13)',
  sm:       d ? '0 1px 3px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.045)' : '0 1px 3px rgba(0,0,0,0.07),0 0 0 1px rgba(0,0,0,0.055)',
  md:       d ? '0 6px 20px rgba(0,0,0,0.45)' : '0 6px 20px rgba(0,0,0,0.08)',
  lg:       d ? '0 24px 60px rgba(0,0,0,0.65)' : '0 24px 60px rgba(0,0,0,0.12)',
});

// ─── LOCAL INPUT ──────────────────────────────────────────────────────────────
const LocalInput = React.memo(({ numericValue, onChange, style, placeholder, className }) => {
  const [display, setDisplay] = useState(() => numericValue === 0 ? '' : toSep(numericValue));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDisplay(numericValue === 0 ? '' : toSep(numericValue)); }, [numericValue]);
  const onFocus = () => { focused.current = true; if (display === '0') setDisplay(''); };
  const onBlur  = () => { focused.current = false; const n = parseNum(display); setDisplay(n === 0 ? '' : toSep(n)); onChange(n); };
  const onChangeFn = (e) => { const raw = e.target.value.replace(/\D/g, ''); setDisplay(raw === '' ? '' : toSep(raw)); };
  return (
    <input type="text" inputMode="numeric" placeholder={placeholder ?? '0'}
      value={display} onChange={onChangeFn} onFocus={onFocus} onBlur={onBlur}
      className={className} style={style} />
  );
});
LocalInput.displayName = 'LocalInput';

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────────
const G = ({ d, t }) => (
  <style>{`
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-thumb { background: ${d ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)'}; border-radius: 99px; }
    input { font-size: 16px !important; }
    .fpi {
      width: 100%; background: ${t.inputBg}; border: 1px solid ${t.inputBd};
      border-radius: 9px; padding: 10px 13px; font-weight: 600; color: ${t.hi};
      outline: none; transition: border-color 0.14s; font-family: inherit;
      letter-spacing: -0.01em; -webkit-font-smoothing: antialiased; box-sizing: border-box;
    }
    .fpi:focus { border-color: #0A84FF; box-shadow: 0 0 0 3px rgba(10,132,255,0.14); }
    .fpi::placeholder { color: ${t.lo}; font-weight: 400; }
    .fpi-c { text-align: center; }
    .fpi-sm { padding: 8px 6px; min-width: 65px;}
    .fpi-lg { font-size: 17px !important; font-weight: 700; padding: 13px; }
    .lbl { display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: ${t.mid}; margin-bottom: 6px; }
    .lbl-mini { font-size: 9px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: ${t.lo}; }
    .vc-table { display: none; }
    .vc-cards { display: flex; flex-direction: column; gap: 11px; }
    @media (min-width: 720px) {
      .vc-table { display: block; }
      .vc-cards { display: none; }
    }
    @media (min-width: 580px) { .g2 { grid-template-columns: 1fr 1fr !important; } }
    @media (min-width: 900px) { .g4sp { grid-template-columns: 1fr 1fr !important; } .gsf { grid-template-columns: 1fr 1fr !important; } }
    @keyframes fpbreathe { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.38; transform:scale(0.9); } }
    @keyframes fpspin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    .vc-add-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 9px; border-radius: 7px; border: 1px dashed ${t.blueBd};
      background: ${t.blueBg}; color: ${t.blue}; cursor: pointer;
      font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
      transition: all 0.14s;
    }
    .vc-add-btn:hover { background: ${t.blue}; color: #fff; border-color: ${t.blue}; border-style: solid; }
    .vc-rm-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 7px; border: 1px solid ${t.line};
      background: transparent; color: ${t.red}; cursor: pointer;
      transition: all 0.14s; flex-shrink: 0;
    }
    .vc-rm-btn:hover { background: ${d ? 'rgba(255,69,58,0.10)' : 'rgba(220,38,38,0.08)'}; border-color: ${t.red}; }
    .vc-entry-tag {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 7px; border-radius: 99px;
      background: ${t.blueBg}; color: ${t.blue}; border: 1px solid ${t.blueBd};
      font-size: 9px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
    }
  `}</style>
);

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
const Card = ({ children, t, style = {} }) => (
  <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.sm, overflow: 'visible', ...style }}>{children}</div>
);
const Body = ({ children, style = {} }) => (
  <div style={{ padding: '22px 24px', ...style }}>{children}</div>
);
const SecLabel = ({ children, t }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
    <div style={{ width: 3, height: 13, borderRadius: 99, background: t.blue, flexShrink: 0 }} />
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.mid }}>{children}</span>
  </div>
);

// ─── STEPPER ──────────────────────────────────────────────────────────────────
function Stepper({ step, setStep, t, d }) {
  const ITEMS = [{ s:1, label:'Produk' }, { s:2, label:'Sales Fee' }, { s:3, label:'Rewards' }, { s:4, label:'Review' }];
  const R = 34, pct = ((step - 1) / (ITEMS.length - 1)) * 100;
  return (
    <div style={{ paddingBottom: 36, paddingTop: 4 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ position: 'absolute', top: R/2, left: R/2, right: R/2, height: 1, background: t.line, transform: 'translateY(-50%)', zIndex: 0 }} />
        <div style={{ position: 'absolute', top: R/2, left: R/2, height: 2, background: t.blue, width: `calc((100% - ${R}px) * ${pct/100})`, transform: 'translateY(-50%)', borderRadius: 99, transition: 'width 0.3s ease', zIndex: 1 }} />
        {ITEMS.map(item => {
          const isActive = step === item.s, isPast = step > item.s;
          return (
            <div key={item.s} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: R }}>
              <button onClick={() => setStep(item.s)} style={{ width:R, height:R, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, border:`2px solid ${(isActive||isPast)?t.blue:t.line}`, background:(isActive||isPast)?t.blue:(d?'#0D1019':'#FFFFFF'), color:(isActive||isPast)?'#fff':t.lo, cursor:'pointer', outline:'none', transition:'all 0.2s', transform:isActive?'scale(1.10)':'scale(1)', boxShadow:isActive?`0 0 0 4px ${t.blueBg},0 3px 10px rgba(10,132,255,0.28)`:'none', flexShrink:0 }}>
                {isPast ? <CheckCircle2 size={15} strokeWidth={2.5} /> : item.s}
              </button>
              <span style={{ marginTop:9, fontSize:10, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:isActive?t.blue:t.lo, whiteSpace:'nowrap', transition:'color 0.2s' }}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SecHero({ icon: Icon, step, title, t }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', borderRadius:10, border:`1px solid ${t.line}`, background:t.card, marginBottom:18, boxShadow:t.sm }}>
      <div style={{ width:38, height:38, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:t.blueBg, color:t.blue, border:`1px solid ${t.blueBd}` }}><Icon size={18} /></div>
      <div>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.10em', textTransform:'uppercase', color:t.mid, marginBottom:3 }}>Langkah {step} dari 4</div>
        <div style={{ fontSize:17, fontWeight:800, letterSpacing:'-0.03em', color:t.hi, lineHeight:1.2 }}>{title}</div>
      </div>
    </div>
  );
}

// ─── SP CARD ─────────────────────────────────────────────────────────────────
function SPCard({ item, onUpdate, t }) {
  return (
    <div style={{ borderRadius:10, border:`1px solid ${t.line}`, background:t.sub, padding:'15px 17px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:13, fontWeight:700, color:t.hi, letterSpacing:'-0.01em' }}>{item.name}</span>
        <span style={{ fontSize:10, fontWeight:700, color:t.blue, letterSpacing:'0.04em', flexShrink:0, marginLeft:8 }}>{formatIDR(item.hPokok)}</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div><label className="lbl">Qty</label><LocalInput numericValue={item.qty} onChange={v=>onUpdate('sp',item.id,'qty',v)} className="fpi fpi-c" /></div>
        <div><label className="lbl">Retail</label><LocalInput numericValue={item.hRetail} onChange={v=>onUpdate('sp',item.id,'hRetail',v)} className="fpi" placeholder="Rp" /></div>
      </div>
      {item.qty > 0 && (
        <div style={{ marginTop:11, paddingTop:11, borderTop:`1px solid ${t.lineH}`, display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px 12px' }}>
          {[{ l:'Margin',v:formatIDR(item.margin),neg:item.margin<0 },{ l:'% Margin',v:formatPct(item.pctMargin),neg:item.pctMargin<0 },{ l:'Modal',v:formatIDR(item.totalModal) },{ l:'Komposisi',v:formatPct(item.komposisi) }].map(s=>(
            <div key={s.l}>
              <div style={{ fontSize:9, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:t.lo, marginBottom:2 }}>{s.l}</div>
              <div style={{ fontSize:12, fontWeight:700, color:s.neg?t.red:t.blue, fontVariantNumeric:'tabular-nums' }}>{s.v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── VOUCHER ROW (DESKTOP TABLE) ──────────────────────────────────────────────
function VCRowDesktop({ item, entryIdx, onUpdate, onRemoveEntry, onAddEntry, t }) {
  const hasEntry2 = item.hasEntry2;
  const isEntry1 = entryIdx === 1;
 // Lokasi: function VCRowDesktop
return (
  <tr style={{ borderBottom:`1px solid ${t.lineH}` }}>
    {/* Kolom Produk - 40% */}
    <td style={{ padding:'9px 10px', verticalAlign: 'middle', width: '40%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div>
          <div style={{ fontWeight:700, color:t.hi, letterSpacing:'-0.01em', fontSize: 13 }}>
            {item.name}
            {!isEntry1 && <span className="vc-entry-tag" style={{ marginLeft: 8 }}>Entry 2</span>}
          </div>
          <div style={{ fontSize:10, color:t.lo, marginTop:1 }}>Pokok: {formatIDR(item.hPokok)}</div>
        </div>
      </div>
    </td>

<td style={{ padding:'9px 4px', width: '18%' }}> {/* Padding dikecilkan ke 4px */}
  <LocalInput 
    numericValue={isEntry1 ? item.qty : item.qty2} 
    onChange={v=>onUpdate('vc', item.id, isEntry1 ? 'qty' : 'qty2', v)} 
    className="fpi fpi-c fpi-sm"
  />
</td>
<td style={{ padding:'9px 4px', width: '24%' }}>
  <LocalInput 
    numericValue={isEntry1 ? item.hRetail : item.hRetail2} 
    onChange={v=>onUpdate('vc', item.id, isEntry1 ? 'hRetail' : 'hRetail2', v)} 
    className="fpi fpi-sm"
  />
</td>

    {/* Kolom Margin - 18% */}
    <td style={{ padding:'9px 10px', textAlign:'right', whiteSpace:'nowrap', width: '18%' }}>
      <div style={{ fontWeight:700, color:(isEntry1?item.margin:item.margin2)<0?t.red:t.blue, fontVariantNumeric:'tabular-nums', fontSize: 13 }}>
        {formatIDR(isEntry1 ? item.margin : item.margin2)}
      </div>
      <div style={{ fontSize:10, color:t.lo, marginTop:1, fontVariantNumeric:'tabular-nums' }}>
        {formatPct(isEntry1 ? item.pctMargin : item.pctMargin2)}
      </div>
    </td>

    {/* Kolom Action - 5% */}
    <td style={{ padding:'9px 6px', width: '5%', textAlign: 'center' }}>
      {isEntry1 ? (
        !hasEntry2 && (
          <button className="vc-add-btn" onClick={() => onAddEntry(item.id)} title="Tambah entry kedua">
            <Plus size={11} /> 2
          </button>
        )
      ) : (
        <button className="vc-rm-btn" onClick={() => onRemoveEntry(item.id)} title="Hapus entry 2">
          <Trash2 size={13} />
        </button>
      )}
    </td>
  </tr>
);
}

// ─── VOUCHER CARD (MOBILE) ────────────────────────────────────────────────────
function VCCardMobile({ item, onUpdate, onAddEntry, onRemoveEntry, t }) {
  const renderEntry = (entryIdx) => {
    const isEntry1 = entryIdx === 1;
    const qty = isEntry1 ? item.qty : item.qty2;
    const hRetail = isEntry1 ? item.hRetail : item.hRetail2;
    const margin = isEntry1 ? item.margin : item.margin2;
    const pctMargin = isEntry1 ? item.pctMargin : item.pctMargin2;
    return (
      <div key={entryIdx} style={{
        padding: '12px 14px',
        borderRadius: 9,
        background: isEntry1 ? 'transparent' : t.blueBg,
        border: isEntry1 ? `1px solid ${t.lineH}` : `1px dashed ${t.blueBd}`,
        marginTop: isEntry1 ? 0 : 10,
      }}>
        {!isEntry1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span className="vc-entry-tag">Entry 2</span>
            <button className="vc-rm-btn" onClick={() => onRemoveEntry(item.id)}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
 {/* Cari grid di dalam renderEntry mobile */}
<div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 9 }}>
  <div>
    <div className="lbl-mini" style={{ marginBottom: 5 }}>Qty</div>
    <LocalInput numericValue={qty} onChange={v=>onUpdate('vc', item.id, isEntry1 ? 'qty' : 'qty2', v)} className="fpi fpi-c fpi-sm"/>
  </div>
  <div>
    <div className="lbl-mini" style={{ marginBottom: 5 }}>Retail</div>
    <LocalInput numericValue={hRetail} onChange={v=>onUpdate('vc', item.id, isEntry1 ? 'hRetail' : 'hRetail2', v)} className="fpi fpi-sm"/>
  </div>
</div>
        {qty > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 9, borderTop: `1px solid ${t.lineH}` }}>
            <div className="lbl-mini">Margin</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: margin < 0 ? t.red : t.blue, fontVariantNumeric: 'tabular-nums' }}>{formatIDR(margin)}</span>
              <span style={{ fontSize: 10, color: t.lo, fontVariantNumeric: 'tabular-nums' }}>{formatPct(pctMargin)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${t.line}`, background: t.sub, padding: '13px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, letterSpacing: '-0.01em' }}>{item.name}</div>
          <div style={{ fontSize: 10, color: t.lo, marginTop: 2 }}>Pokok: {formatIDR(item.hPokok)}</div>
        </div>
        {!item.hasEntry2 && (
          <button className="vc-add-btn" onClick={() => onAddEntry(item.id)}>
            <Plus size={11} /> Entry 2
          </button>
        )}
      </div>
      {renderEntry(1)}
      {item.hasEntry2 && renderEntry(2)}
    </div>
  );
}

// ─── INFO CHIP ────────────────────────────────────────────────────────────────
function InfoChip({ label, value }) {
  return (
    <div style={{ padding:'8px 14px', borderRadius:8, background:'rgba(0,0,0,0.18)', minWidth:96 }}>
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', opacity:0.68, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{value}</div>
    </div>
  );
}

function SumRow({ icon: Icon, label, value, highlight, t }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'12px 0', borderBottom:`1px solid ${t.lineH}` }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
        <div style={{ width:30, height:30, borderRadius:7, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:t.blueBg }}>
          <Icon size={14} style={{ color:t.blue }} />
        </div>
        <span style={{ fontSize:13, fontWeight:600, color:t.mid, letterSpacing:'0.01em', whiteSpace:'nowrap' }}>{label}</span>
      </div>
      <span style={{ fontSize:14, fontWeight:700, letterSpacing:'-0.02em', color:highlight?t.blue:value<0?t.red:t.hi, fontVariantNumeric:'tabular-nums', textAlign:'right', flexShrink:0 }}>
        {formatIDR(value)}
      </span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
const FormPendapatan = ({ onUpdate, theme, setIsFormDirty, activeContext, onSaveSuccess }) => {
  const [step, setStep]             = useState(1);
  const [showSubmit, setShowSubmit] = useState(false);
  const [isLoading, setIsLoading]   = useState(true);
  const [isSaving, setIsSaving]     = useState(false);
  const [file, setFile]             = useState(null);
  const [drag, setDrag]             = useState(false);
  const [toast, setToast]           = useState({ show: false, type: 'success', msg: '' });
  const [reportStatus, setReportStatus] = useState({ isFinalized: false, finalizedAt: null, finalizedBy: null, validationNotes: null, updatedAt: null });

  const d = theme === 'dark';
  const t = mk(d);

  const toast$ = (type, msg) => { setToast({ show: true, type, msg }); setTimeout(() => setToast(p => ({ ...p, show: false })), 4000); };

  // ── Default state ─────────────────────────────────────────────────────────
  const defaults = useCallback(() => ({
    sp: [
      { id:'sp1', dbQty:'qty_sp_3gb_im3', dbRetail:'retail_sp_3gb_im3', name:'SP 3GB IM3', hPokok:29000, hRetail:0, qty:0 },
      { id:'sp2', dbQty:'qty_sp_0_im3',   dbRetail:'retail_sp_0_im3',   name:'SP 0 IM3',   hPokok:10000, hRetail:0, qty:0 },
      { id:'sp3', dbQty:'qty_sp_kpk_3id', dbRetail:'retail_sp_kpk_3id', name:'SP KPK 3ID', hPokok:10000, hRetail:0, qty:0 },
      { id:'sp4', dbQty:'qty_sp_3gb_3id', dbRetail:'retail_sp_3gb_3id', name:'SP 3GB 3ID', hPokok:29000, hRetail:0, qty:0 },
    ],
    vc: [
      { id:'v1',  dbQty:'qty_vc_0_im3',          dbRetail:'retail_vc_0_im3',          dbQty2:'qty_vc_0_im3_2',          dbRetail2:'retail_vc_0_im3_2',          name:'VC 0 IM3',       hPokok:300,   hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v2',  dbQty:'qty_vc_2_5gb',          dbRetail:'retail_vc_2_5gb',          dbQty2:'qty_vc_2_5gb_2',          dbRetail2:'retail_vc_2_5gb_2',          name:'VC 2.5GB',       hPokok:12600, hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v3',  dbQty:'qty_vc_3gb_30',         dbRetail:'retail_vc_3gb_30',         dbQty2:'qty_vc_3gb_30_2',         dbRetail2:'retail_vc_3gb_30_2',         name:'VC 3GB/30',      hPokok:19500, hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v4',  dbQty:'qty_vc_3_5gb_5d',       dbRetail:'retail_vc_3_5gb_5d',       dbQty2:'qty_vc_3_5gb_5d_2',       dbRetail2:'retail_vc_3_5gb_5d_2',       name:'VC 3.5GB/5D',    hPokok:13750, hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v5',  dbQty:'qty_vc_5gb_5d',         dbRetail:'retail_vc_5gb_5d',         dbQty2:'qty_vc_5gb_5d_2',         dbRetail2:'retail_vc_5gb_5d_2',         name:'VC 5GB/5D',      hPokok:16800, hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v6',  dbQty:'qty_vc_7gb_7d',         dbRetail:'retail_vc_7gb_7d',         dbQty2:'qty_vc_7gb_7d_2',         dbRetail2:'retail_vc_7gb_7d_2',         name:'VC 7GB/7D',      hPokok:22400, hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v7',  dbQty:'qty_vc_fi_4gb',         dbRetail:'retail_vc_fi_4gb',         dbQty2:'qty_vc_fi_4gb_2',         dbRetail2:'retail_vc_fi_4gb_2',         name:'VC FI 4GB',      hPokok:24500, hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v8',  dbQty:'qty_vc_fi_1_5gb_1d',    dbRetail:'retail_vc_fi_1_5gb_1d',    dbQty2:'qty_vc_fi_1_5gb_1d_2',    dbRetail2:'retail_vc_fi_1_5gb_1d_2',    name:'VC FI 1.5GB/1D', hPokok:4500,  hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v9',  dbQty:'qty_vc_fi_3gb_1d',      dbRetail:'retail_vc_fi_3gb_1d',      dbQty2:'qty_vc_fi_3gb_1d_2',      dbRetail2:'retail_vc_fi_3gb_1d_2',      name:'VC FI 3GB/1D',   hPokok:6600,  hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v10', dbQty:'qty_vc_fi_5gb_2d',      dbRetail:'retail_vc_fi_5gb_2d',      dbQty2:'qty_vc_fi_5gb_2d_2',      dbRetail2:'retail_vc_fi_5gb_2d_2',      name:'VC FI 5GB/2D',   hPokok:8300,  hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v11', dbQty:'qty_vc_fi_3gb_3d',      dbRetail:'retail_vc_fi_3gb_3d',      dbQty2:'qty_vc_fi_3gb_3d_2',      dbRetail2:'retail_vc_fi_3gb_3d_2',      name:'VC FI 3GB/3D',   hPokok:11600, hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v12', dbQty:'qty_vc_fi_5gb_3d',      dbRetail:'retail_vc_fi_5gb_3d',      dbQty2:'qty_vc_fi_5gb_3d_2',      dbRetail2:'retail_vc_fi_5gb_3d_2',      name:'VC FI 5GB/3D',   hPokok:12800, hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v13', dbQty:'qty_vc_fi_15gb_7d',     dbRetail:'retail_vc_fi_15gb_7d',     dbQty2:'qty_vc_fi_15gb_7d_2',     dbRetail2:'retail_vc_fi_15gb_7d_2',     name:'VC FI 15GB/7D',  hPokok:27900, hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
      { id:'v14', dbQty:'qty_vc_0_3id',          dbRetail:'retail_vc_0_3id',          dbQty2:'qty_vc_0_3id_2',          dbRetail2:'retail_vc_0_3id_2',          name:'VC 0 3ID',       hPokok:500,   hRetail:0, qty:0, hRetail2:0, qty2:0, hasEntry2:false },
    ],
    mobo:          { modal: 0, jual: 0 },
    salesFee:      { realtimeMargin: 0, backMargin: 0, slaFee: 0, specialProgram: 0 },
    rewards:       { champions: 0, lainnya: 0 },
    partnerIncome: 0,
  }), []);

  const [data, setData] = useState(defaults);
  const fetched$ = useRef(false), prevCtx$ = useRef({});

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = { mpxName: activeContext?.mpxName, branch: activeContext?.branch, mpxType: activeContext?.mpxType, month: activeContext?.month, year: activeContext?.year };
    const same = prevCtx$.current.mpxName === ctx.mpxName && prevCtx$.current.branch === ctx.branch && prevCtx$.current.month === ctx.month && prevCtx$.current.year === ctx.year && prevCtx$.current.mpxType === ctx.mpxType;
    if (same && fetched$.current) return;
    (async () => {
      if (!ctx.mpxName || !ctx.branch) { setIsLoading(false); return; }
      setIsLoading(true);
      try {
        const { data: db, error } = await supabase.from('pnl_reports').select('*')
          .eq('partner_name', ctx.mpxName).eq('branch', ctx.branch)
          .eq('mpc_mp3', ctx.mpxType).eq('month', ctx.month).eq('year', ctx.year).maybeSingle();
        if (error) throw error;
        const s = defaults();
        if (db) {
          s.sp = s.sp.map(i => ({ ...i, qty: db[i.dbQty] ?? 0, hRetail: db[i.dbRetail] ?? 0 }));
          s.vc = s.vc.map(i => {
            const qty2     = db[i.dbQty2]    ?? 0;
            const hRetail2 = db[i.dbRetail2] ?? 0;
            return {
              ...i,
              qty:       db[i.dbQty]    ?? 0,
              hRetail:   db[i.dbRetail] ?? 0,
              qty2, hRetail2,
              hasEntry2: qty2 > 0 || hRetail2 > 0,
            };
          });
          s.mobo          = { modal: db.mobo_modal ?? 0, jual: db.mobo_jual ?? 0 };
          s.salesFee      = { realtimeMargin: db.realtime_margin ?? 0, backMargin: db.back_margin ?? 0, slaFee: db.sla_fee ?? 0, specialProgram: db.special_program ?? 0 };
          s.rewards       = { champions: db.rewards_champions ?? 0, lainnya: db.rewards_lainnya ?? 0 };
          s.partnerIncome = db.partner_income ?? 0;
          setReportStatus({
            isFinalized:     db.is_finalized     ?? false,
            finalizedAt:     db.finalized_at     ?? null,
            finalizedBy:     db.finalized_by     ?? null,
            validationNotes: db.validation_notes ?? null,
            updatedAt:       db.updated_at       ?? null,
          });
        }
        setData(s);
        prevCtx$.current = ctx;
        fetched$.current = true;
      } catch (e) { console.error('Fetch:', e.message); setData(defaults()); }
      finally { setIsLoading(false); setIsFormDirty?.(false); }
    })();
  }, [activeContext, defaults, setIsFormDirty]);

  // ── Calculations ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    // SP
    const spTotalQty = data.sp.reduce((a,b)=>a+(Number(b.qty)||0),0);
    const spItems = data.sp.map(i => {
      const modal = (Number(i.qty)||0)*(Number(i.hPokok)||0);
      const jual  = (Number(i.qty)||0)*(Number(i.hRetail)||0);
      const mg = jual - modal;
      return { ...i, totalModal: modal, totalJual: jual, margin: mg, pctMargin: jual>0?(mg/jual)*100:0, komposisi: spTotalQty>0?(Number(i.qty)/spTotalQty)*100:0 };
    });
    const sp = { items: spItems, totalModal: spItems.reduce((a,b)=>a+b.totalModal,0), totalJual: spItems.reduce((a,b)=>a+b.totalJual,0), totalMargin: spItems.reduce((a,b)=>a+b.margin,0) };

    // VC — gabung entry 1 + entry 2
    const vcTotalQty = data.vc.reduce((a,b) => a + (Number(b.qty)||0) + (Number(b.qty2)||0), 0);
    const vcItems = data.vc.map(i => {
      // Entry 1
      const modal1 = (Number(i.qty)||0)*(Number(i.hPokok)||0);
      const jual1  = (Number(i.qty)||0)*(Number(i.hRetail)||0);
      const mg1    = jual1 - modal1;
      // Entry 2
      const modal2 = (Number(i.qty2)||0)*(Number(i.hPokok)||0);
      const jual2  = (Number(i.qty2)||0)*(Number(i.hRetail2)||0);
      const mg2    = jual2 - modal2;
      // Combined
      const totalModal = modal1 + modal2;
      const totalJual  = jual1 + jual2;
      const totalMg    = mg1 + mg2;
      return {
        ...i,
        // Entry 1 stats
        totalModal1: modal1, totalJual1: jual1, margin: mg1, pctMargin: jual1>0?(mg1/jual1)*100:0,
        // Entry 2 stats
        totalModal2: modal2, totalJual2: jual2, margin2: mg2, pctMargin2: jual2>0?(mg2/jual2)*100:0,
        // Combined
        totalModal, totalJual, totalMargin: totalMg,
        pctMarginCombined: totalJual>0?(totalMg/totalJual)*100:0,
        komposisi: vcTotalQty>0?((Number(i.qty)+Number(i.qty2))/vcTotalQty)*100:0,
      };
    });
    const vc = { items: vcItems, totalModal: vcItems.reduce((a,b)=>a+b.totalModal,0), totalJual: vcItems.reduce((a,b)=>a+b.totalJual,0), totalMargin: vcItems.reduce((a,b)=>a+b.totalMargin,0) };

    const moboMg = Number(data.mobo.jual) - Number(data.mobo.modal);
    const moboPct = Number(data.mobo.jual) > 0 ? (moboMg/Number(data.mobo.jual))*100 : 0;
    const gtModal = sp.totalModal + vc.totalModal + Number(data.mobo.modal);
    const gtJual  = sp.totalJual  + vc.totalJual  + Number(data.mobo.jual);
    const gtMg    = sp.totalMargin + vc.totalMargin + moboMg;
    const gtPct   = gtJual > 0 ? (gtMg/gtJual)*100 : 0;
    const upfront = Number(data.mobo.modal) * 0.015;
    const sfMg    = Number(data.salesFee.realtimeMargin) + Number(data.salesFee.backMargin);
    const sfTotal = upfront + sfMg + Number(data.salesFee.slaFee) + Number(data.salesFee.specialProgram);
    const rwTotal = Number(data.rewards.champions) + Number(data.rewards.lainnya);
    const revenue = gtMg + sfTotal + rwTotal + Number(data.partnerIncome);
    return { sp, vc, moboMg, moboPct, gtModal, gtJual, gtMg, gtPct, upfront, sfMg, sfTotal, rwTotal, revenue };
  }, [data]);

  useEffect(() => { onUpdate?.(stats.revenue); }, [stats.revenue, onUpdate]);

  // ── Payload ───────────────────────────────────────────────────────────────
  const mkPayload = (fin, userId, notes) => {
    const vcEntries = data.vc.reduce((acc, c) => ({
      ...acc,
      [c.dbQty]:     c.qty,
      [c.dbRetail]:  c.hRetail,
      [c.dbQty2]:    c.hasEntry2 ? c.qty2     : 0,
      [c.dbRetail2]: c.hasEntry2 ? c.hRetail2 : 0,
    }), {});
    return {
      user_id: userId,
      partner_name: activeContext.mpxName, branch: activeContext.branch,
      mpc_mp3: activeContext.mpxType, month: activeContext.month, year: activeContext.year,
      ...data.sp.reduce((a,c) => ({ ...a, [c.dbQty]:c.qty, [c.dbRetail]:c.hRetail }), {}),
      ...vcEntries,
      mobo_modal: data.mobo.modal, mobo_jual: data.mobo.jual,
      realtime_margin: data.salesFee.realtimeMargin, back_margin: data.salesFee.backMargin,
      sla_fee: data.salesFee.slaFee, special_program: data.salesFee.specialProgram,
      rewards_champions: data.rewards.champions, rewards_lainnya: data.rewards.lainnya,
      partner_income: data.partnerIncome, grand_total_revenue: stats.revenue,
      is_finalized: fin,
      finalized_at: fin ? new Date().toISOString() : null,
      finalized_by: fin ? userId : null,
      validation_notes: notes,
      updated_at: new Date().toISOString(),
    };
  };

  const validate = () => {
    if (!activeContext?.mpxName) { toast$('error', 'Nama Partner belum dipilih'); return false; }
    if (!activeContext?.branch)  { toast$('error', 'Kantor Cabang belum dipilih'); return false; }
    if (!activeContext?.mpxType) { toast$('error', 'Tipe MPC/MP3 belum tersedia'); return false; }
    if (!activeContext?.month)   { toast$('error', 'Bulan laporan belum dipilih'); return false; }
    if (!activeContext?.year)    { toast$('error', 'Tahun laporan belum dipilih'); return false; }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir.');
      const existingNotes = reportStatus.validationNotes ?? '';
      const alreadyMarked = existingNotes.includes('pendapatan:draft') || existingNotes.includes('pendapatan:final');
      const notes = alreadyMarked ? existingNotes : (existingNotes ? existingNotes + ',pendapatan:draft' : 'pendapatan:draft');
      const { error } = await supabase.from('pnl_reports')
        .upsert(mkPayload(false, user.id, notes), { onConflict: 'partner_name,branch,mpc_mp3,month,year' });
      if (error) throw error;
      setReportStatus(p => ({ ...p, isFinalized: false, updatedAt: new Date().toISOString(), validationNotes: notes }));
      setIsFormDirty?.(false);
      toast$('success', 'Draft berhasil disimpan');
    } catch (err) { toast$('error', err.message || 'Gagal menyimpan draft'); }
    finally { setIsSaving(false); }
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir.');
      const existingNotes = reportStatus.validationNotes ?? '';
      let parts = existingNotes ? existingNotes.split(',').filter(p => p && !p.startsWith('pendapatan:')) : [];
      parts.push('pendapatan:final');
      const notes = parts.join(',');
      const { error } = await supabase.from('pnl_reports')
        .upsert(mkPayload(true, user.id, notes), { onConflict: 'partner_name,branch,mpc_mp3,month,year' });
      if (error) throw error;
      const now = new Date().toISOString();
      setReportStatus({ isFinalized: true, finalizedAt: now, finalizedBy: user.id, validationNotes: notes, updatedAt: now });
      setIsFormDirty?.(false);
      setShowSubmit(false);
      onSaveSuccess?.();
      toast$('success', 'Laporan berhasil dikirim');
    } catch (err) { toast$('error', err.message || 'Gagal menyimpan laporan'); }
    finally { setIsSaving(false); }
  };

  const updateVal = useCallback((section, id, field, val) => {
    setData(prev => {
      if (section === 'partnerIncome') return { ...prev, partnerIncome: val };
      if (Array.isArray(prev[section])) return { ...prev, [section]: prev[section].map(i => i.id === id ? { ...i, [field]: val } : i) };
      if (typeof prev[section] === 'object') return { ...prev, [section]: { ...prev[section], [field]: val } };
      return prev;
    });
    setIsFormDirty?.(true);
  }, [setIsFormDirty]);

  const addVcEntry = useCallback((id) => {
    setData(prev => ({ ...prev, vc: prev.vc.map(i => i.id === id ? { ...i, hasEntry2: true } : i) }));
    setIsFormDirty?.(true);
  }, [setIsFormDirty]);

  const removeVcEntry = useCallback((id) => {
    setData(prev => ({ ...prev, vc: prev.vc.map(i => i.id === id ? { ...i, hasEntry2: false, qty2: 0, hRetail2: 0 } : i) }));
    setIsFormDirty?.(true);
  }, [setIsFormDirty]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) return (
    <>
      <G d={d} t={t} />
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:340, gap:14 }}>
        <div style={{ width:46, height:46, borderRadius:12, background:t.blue, display:'flex', alignItems:'center', justifyContent:'center', animation:'fpbreathe 1.8s ease-in-out infinite' }}>
          <ArrowUpRight size={22} color="#fff" />
        </div>
        <span style={{ fontSize:11, fontWeight:600, letterSpacing:'0.09em', textTransform:'uppercase', color:t.mid }}>Memuat data...</span>
      </div>
    </>
  );

  const ctxMonth=activeContext?.month??'', ctxYear=activeContext?.year??'';
  const ctxType=activeContext?.mpxType??'', ctxName=activeContext?.mpxName??'', ctxBranch=activeContext?.branch??'';
  const titleLine = `Form Pendapatan ${ctxMonth} ${ctxYear}`;
  const subtitleLine = [ctxType, ctxName, ctxBranch].filter(Boolean).join(' - ');
  const notes = reportStatus.validationNotes ?? '';
  const hasPengeluaranFinal = notes.includes('pengeluaran:final');

  return (
    <div style={{ width: '100%', margin:'0 auto', paddingBottom:108, fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',system-ui,sans-serif", WebkitFontSmoothing:'antialiased', color:t.hi }}>
      <G d={d} t={t} />

      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:28 }}>
        <div style={{ width:46, height:46, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:t.blueBg, color:t.blue, border:`1px solid ${t.blueBd}` }}>
          <ArrowUpRight size={25} />
        </div>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.035em', color:t.hi, lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{titleLine}</div>
          <div style={{ fontSize:12, fontWeight:600, letterSpacing:'0.02em', color:t.mid, marginTop:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{subtitleLine}</div>
        </div>
      </div>

      <Stepper step={step} setStep={setStep} t={t} d={d} />

      <AnimatePresence>
        {toast.show && (
          <motion.div initial={{ opacity:0, y:-12, scale:0.97 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, y:-10, scale:0.97 }} transition={{ duration:0.17 }}
            style={{ position:'fixed', top:66, right:16, zIndex:999, width:316, maxWidth:'calc(100vw - 32px)' }}>
            <div style={{ background:t.card, border:`1px solid ${toast.type==='success'?t.greenBd:t.line}`, borderRadius:12, boxShadow:t.lg, overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:11, padding:'13px 15px' }}>
                <div style={{ width:30, height:30, borderRadius:7, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:toast.type==='success'?t.green:t.red, color:'#fff' }}>
                  {toast.type==='success'?<CheckCircle2 size={15}/>:<AlertCircle size={15}/>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:t.hi, letterSpacing:'-0.01em' }}>{toast.type==='success'?'Berhasil':'Terjadi Kesalahan'}</div>
                  <div style={{ fontSize:12, color:t.mid, marginTop:3, lineHeight:1.5 }}>{toast.msg}</div>
                </div>
                <button onClick={()=>setToast(p=>({...p,show:false}))} style={{ background:'none', border:'none', cursor:'pointer', color:t.lo, padding:2, flexShrink:0 }}><X size={13}/></button>
              </div>
              <motion.div initial={{ width:'100%' }} animate={{ width:'0%' }} transition={{ duration:4, ease:'linear' }} style={{ height:2, background:toast.type==='success'?t.green:t.red }}/>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">

        {/* STEP 1 — PRODUK */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity:0, y:7 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={{ duration:0.17 }} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <SecHero icon={Layers} step={1} title="Margin Produk" t={t} />

            <Card t={t}><Body>
              <SecLabel t={t}>A. Starter Pack (SP) Regular</SecLabel>
              <div className="g4sp" style={{ display:'grid', gridTemplateColumns:'1fr', gap:11 }}>
                {stats.sp.items.map(item => <SPCard key={item.id} item={item} onUpdate={updateVal} t={t} />)}
              </div>
            </Body></Card>

            <Card t={t}><Body>
              <SecLabel t={t}>B. Voucher Regular</SecLabel>
              <div style={{ fontSize: 11, color: t.lo, marginBottom: 14, lineHeight: 1.55 }}>
                Jika satu produk dijual dengan <strong style={{ color: t.mid }}>2 harga retail berbeda</strong>, tap tombol <strong style={{ color: t.blue }}>+2</strong> untuk menambahkan baris kedua.
              </div>

              {/* Desktop table */}
              <div className="vc-table" style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:520 }}>
<thead>
  <tr style={{ borderBottom:`1px solid ${t.line}` }}>
    {[
      { h: 'Produk', al: 'left',   w: '35%' }, // Turunkan dari 40% ke 35%
      { h: 'Qty',    al: 'center', w: '18%' }, // Naikkan dari 15% ke 18%
      { h: 'Retail', al: 'left',   w: '24%' }, // Naikkan dari 22% ke 24%
      { h: 'Margin', al: 'right',  w: '18%' },
      { h: '',       al: 'center', w: '5%'  },
    ].map((c, i) => (
      <th key={i} style={{ 
        padding: '7px 8px', 
        textAlign: c.al, 
        fontSize: 10, 
        fontWeight: 700, 
        letterSpacing: '0.05em', 
        color: t.lo, 
        width: c.w 
      }}>
        {c.h}
      </th>
    ))}
  </tr>
</thead>
                  <tbody>
                    {stats.vc.items.map(item => (
                      <React.Fragment key={item.id}>
                        <VCRowDesktop item={item} entryIdx={1} onUpdate={updateVal} onAddEntry={addVcEntry} onRemoveEntry={removeVcEntry} t={t}/>
                        {item.hasEntry2 && (
                          <VCRowDesktop item={item} entryIdx={2} onUpdate={updateVal} onAddEntry={addVcEntry} onRemoveEntry={removeVcEntry} t={t}/>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="vc-cards">
                {stats.vc.items.map(item => (
                  <VCCardMobile key={item.id} item={item} onUpdate={updateVal} onAddEntry={addVcEntry} onRemoveEntry={removeVcEntry} t={t}/>
                ))}
              </div>
            </Body></Card>

            {/* Mobo */}
            <Card t={t}><Body>
              <SecLabel t={t}>C. Saldo Mobo</SecLabel>
              <div className="g2" style={{ display:'grid', gridTemplateColumns:'1fr', gap:14 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
                  <div><label className="lbl">Total Modal Mobo</label><LocalInput numericValue={data.mobo.modal} onChange={v=>updateVal('mobo',null,'modal',v)} className="fpi"/></div>
                  <div><label className="lbl">Total Penjualan Mobo</label><LocalInput numericValue={data.mobo.jual} onChange={v=>updateVal('mobo',null,'jual',v)} className="fpi"/></div>
                </div>
                <div style={{ padding:'20px 22px', borderRadius:10, background:t.blueBg, border:`1px solid ${t.blueBd}`, display:'flex', flexDirection:'column', gap:14 }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.10em', textTransform:'uppercase', color:t.blue, marginBottom:6, opacity:0.88 }}>Mobo Margin</div>
                    <div style={{ fontSize:24, fontWeight:800, letterSpacing:'-0.04em', fontVariantNumeric:'tabular-nums', lineHeight:1, color:t.hi }}>{formatIDR(stats.moboMg)}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:12, borderTop:`1px solid ${t.blueBd}` }}>
                    <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:t.mid }}>Performance</span>
                    <span style={{ fontSize:18, fontWeight:800, color:t.blue, fontVariantNumeric:'tabular-nums' }}>{formatPct(stats.moboPct)}</span>
                  </div>
                </div>
              </div>
            </Body></Card>

            <div style={{ padding:'18px 22px', borderRadius:12, background:t.blue, color:'#fff', display:'flex', flexWrap:'wrap', gap:14, justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.10em', textTransform:'uppercase', opacity:0.76, marginBottom:5 }}>Subtotal Margin Produk</div>
                <div style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.04em', fontVariantNumeric:'tabular-nums' }}>{formatIDR(stats.gtMg)}</div>
              </div>
              <div style={{ display:'flex', gap:9, flexWrap:'wrap' }}>
                <InfoChip label="Total Modal" value={formatIDR(stats.gtModal)}/>
                <InfoChip label="Total Jual"  value={formatIDR(stats.gtJual)}/>
                <InfoChip label="Overall Margin" value={formatPct(stats.gtPct)}/>
              </div>
            </div>
          </motion.div>
        )}

        {/* STEP 2 — SALES FEE */}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity:0, y:7 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={{ duration:0.17 }} style={{ display:'flex', flexDirection:'column', gap:13 }}>
            <SecHero icon={Zap} step={2} title="Sales Fee" t={t} />

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12, padding:'15px 18px', borderRadius:10, border:`1px solid ${t.blueBd}`, background:t.blueBg }}>
              <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                <div style={{ width:34, height:34, borderRadius:8, background:t.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', flexShrink:0 }}><TrendingUp size={16}/></div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:t.blue, letterSpacing:'-0.01em' }}>A. Upfront Discount</div>
                  <div style={{ fontSize:11, color:t.mid, marginTop:2 }}>1.5% dari Modal Mobo</div>
                </div>
              </div>
              <div style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.03em', color:t.blue, fontVariantNumeric:'tabular-nums' }}>{formatIDR(stats.upfront)}</div>
            </div>

            <Card t={t}><Body>
              <SecLabel t={t}>B. Sales Margin (IM3)</SecLabel>
              <div className="gsf" style={{ display:'grid', gridTemplateColumns:'1fr', gap:11 }}>
                <div><label className="lbl">Realtime Margin</label><LocalInput numericValue={data.salesFee.realtimeMargin} onChange={v=>updateVal('salesFee',null,'realtimeMargin',v)} className="fpi"/></div>
                <div><label className="lbl">Back Margin</label><LocalInput numericValue={data.salesFee.backMargin} onChange={v=>updateVal('salesFee',null,'backMargin',v)} className="fpi"/></div>
              </div>
            </Body></Card>

            <div className="gsf" style={{ display:'grid', gridTemplateColumns:'1fr', gap:11 }}>
              <Card t={t}><Body><SecLabel t={t}>C. SLA Monthly Fee</SecLabel><LocalInput numericValue={data.salesFee.slaFee} onChange={v=>updateVal('salesFee',null,'slaFee',v)} className="fpi"/></Body></Card>
              <Card t={t}><Body><SecLabel t={t}>D. Special Program</SecLabel><LocalInput numericValue={data.salesFee.specialProgram} onChange={v=>updateVal('salesFee',null,'specialProgram',v)} className="fpi"/></Body></Card>
            </div>

            <div style={{ padding:'15px 20px', borderRadius:12, background:t.blueBg, border:`1px solid ${t.blueBd}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:8, background:t.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff' }}><Zap size={16}/></div>
                <span style={{ fontSize:12, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:t.blue }}>Total Sales Fee</span>
              </div>
              <span style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.04em', color:t.blue, fontVariantNumeric:'tabular-nums' }}>{formatIDR(stats.sfTotal)}</span>
            </div>
          </motion.div>
        )}

        {/* STEP 3 — REWARDS */}
        {step === 3 && (
          <motion.div key="s3" initial={{ opacity:0, y:7 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={{ duration:0.17 }}>
            <SecHero icon={Award} step={3} title="Hadiah & Reward" t={t} />
            <Card t={t} style={{ maxWidth:540, margin:'0 auto' }}><Body>
              <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
                {[
                  { label:'A. Hadiah Champions Club', key:'champions', val:data.rewards.champions },
                  { label:'B. Hadiah Lainnya',        key:'lainnya',   val:data.rewards.lainnya   },
                ].map(item=>(
                  <div key={item.key}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:7 }}>
                      <label className="lbl" style={{ margin:0 }}>{item.label}</label>
                      <span style={{ fontSize:11, fontWeight:600, color:t.blue }}>{formatPct((Number(item.val)/(stats.rwTotal||1))*100)}</span>
                    </div>
                    <LocalInput numericValue={item.val} onChange={v=>updateVal('rewards',null,item.key,v)} className="fpi fpi-lg"/>
                  </div>
                ))}
                <div style={{ padding:'14px 18px', borderRadius:10, background:t.blueBg, border:`1px solid ${t.blueBd}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                    <div style={{ width:32, height:32, borderRadius:7, background:t.blue, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff' }}><Gift size={15}/></div>
                    <span style={{ fontSize:12, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:t.blue }}>Total Rewards</span>
                  </div>
                  <span style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.04em', color:t.blue, fontVariantNumeric:'tabular-nums' }}>{formatIDR(stats.rwTotal)}</span>
                </div>
              </div>
            </Body></Card>
          </motion.div>
        )}

        {/* STEP 4 — REVIEW */}
        {step === 4 && (
          <motion.div key="s4" initial={{ opacity:0, y:7 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={{ duration:0.17 }}>
            <SecHero icon={ShieldCheck} step={4} title="Laporan Akhir" t={t} />
            <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:14 }}>

              <Card t={t}><Body>
                <SecLabel t={t}>Pendapatan Partner</SecLabel>
                <div style={{ padding:'14px 16px', borderRadius:9, background:t.blueBg, border:`1px solid ${t.blueBd}`, marginBottom:14 }}>
                  <label className="lbl" style={{ color:t.blue, marginBottom:7 }}>Input Manual (Luar Template)</label>
                  <LocalInput numericValue={data.partnerIncome} onChange={v=>updateVal('partnerIncome',null,null,v)} style={{ fontSize:24, fontWeight:800, color:t.blue, letterSpacing:'-0.04em', width:'100%', background:'transparent', border:'none', outline:'none', fontFamily:'inherit' }}/>
                </div>
                <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);setFile(e.dataTransfer.files[0]);}} style={{ border:`1.5px dashed ${drag?t.blue:t.line}`, borderRadius:10, padding:'20px 14px', textAlign:'center', background:drag?t.blueBg:'transparent', transition:'all 0.15s', cursor:'pointer' }}>
                  {!file ? (
                    <label htmlFor="fp-up" style={{ cursor:'pointer', display:'block' }}>
                      <input type="file" id="fp-up" style={{ display:'none' }} onChange={e=>setFile(e.target.files[0])}/>
                      <Upload size={24} style={{ color:t.lo, margin:'0 auto 9px' }}/>
                      <div style={{ fontSize:13, fontWeight:600, color:t.mid }}>Upload Lampiran</div>
                      <div style={{ fontSize:11, color:t.lo, marginTop:3 }}>PDF atau Excel</div>
                    </label>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:7 }}>
                      <FileCheck size={24} style={{ color:t.blue }}/>
                      <div style={{ fontSize:13, fontWeight:600, color:t.hi, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'100%' }}>{file.name}</div>
                      <button onClick={()=>setFile(null)} style={{ fontSize:11, fontWeight:600, color:t.red, background:'none', border:'none', cursor:'pointer' }}>Hapus File</button>
                    </div>
                  )}
                </div>
              </Body></Card>

              <Card t={t}><Body>
                <SecLabel t={t}>Ringkasan Struktur</SecLabel>
                <div style={{ display:'flex', flexDirection:'column' }}>
                  <SumRow icon={Layers}   label="Margin Produk"   value={stats.gtMg}         t={t}/>
                  <SumRow icon={Zap}      label="Sales Fee"        value={stats.sfTotal}      t={t}/>
                  <SumRow icon={Award}    label="Rewards & Hadiah" value={stats.rwTotal}      t={t}/>
                  <SumRow icon={Banknote} label="Partner Income"   value={data.partnerIncome} t={t} highlight/>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, paddingTop:16, marginTop:4, borderTop:`2px solid ${t.blueBd}` }}>
                    <span style={{ fontSize:12, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:t.blue }}>Net Revenue</span>
                    <span style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.04em', color:stats.revenue<0?t.red:t.blue, fontVariantNumeric:'tabular-nums', textAlign:'right' }}>{formatIDR(stats.revenue)}</span>
                  </div>
                </div>
              </Body></Card>

              <div style={{ padding:'34px 26px', borderRadius:14, border:`1.5px solid ${t.blueBd}`, background:t.blueBg, textAlign:'center' }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', color:t.blue, marginBottom:13, opacity:0.88 }}>
                  Total Pendapatan Terakumulasi
                </div>
                <div style={{ fontSize:'clamp(26px,6vw,58px)', fontWeight:800, letterSpacing:'-0.04em', color:stats.revenue<0?t.red:t.blue, fontVariantNumeric:'tabular-nums', lineHeight:1.1, marginBottom:20, wordBreak:'break-all' }}>
                  {formatIDR(stats.revenue)}
                </div>

                {reportStatus.isFinalized ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                    <div style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 18px', borderRadius:99, background:t.green, color:'#fff', fontSize:12, fontWeight:700, letterSpacing:'0.04em' }}>
                      <CheckCircle2 size={14}/>Laporan Pendapatan Tervalidasi
                    </div>
                    {reportStatus.finalizedAt && (
                      <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:t.mid }}>
                        <Clock size={12} style={{ color:t.lo }}/>
                        Difinalisasi: {fmtDate(reportStatus.finalizedAt)}
                      </div>
                    )}
                    {hasPengeluaranFinal && (
                      <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:99, background:t.greenBg, border:`1px solid ${t.greenBd}`, fontSize:11, color:t.green, fontWeight:600 }}>
                        <CheckCircle2 size={11}/>Form Pengeluaran juga tervalidasi
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                    <div style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 18px', borderRadius:99, background:t.blue+'20', border:`1px solid ${t.blueBd}`, color:t.blue, fontSize:12, fontWeight:700, letterSpacing:'0.04em' }}>
                      <Clock size={14}/>Belum Difinalisasi
                    </div>
                    {reportStatus.updatedAt && (
                      <div style={{ fontSize:11, color:t.mid }}>
                        Draft tersimpan: {fmtDate(reportStatus.updatedAt)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FOOTER NAV ── */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, borderTop:`1px solid ${t.line}`, background:d?'rgba(7,9,13,0.94)':'rgba(255,255,255,0.94)', backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)', zIndex:60, padding:'11px 20px' }}>
        <div style={{ width: '100%', margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginLeft:'auto' }}>
            <button onClick={handleSaveDraft} disabled={isSaving} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 13px', borderRadius:9, border:`1px solid ${t.line}`, background:t.pill, cursor:isSaving?'not-allowed':'pointer', fontSize:12, fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', color:t.mid, opacity:isSaving?0.58:1, transition:'all 0.13s' }}>
              {isSaving?<><Loader2 size={13} style={{ animation:'fpspin 1s linear infinite' }}/>Simpan...</>:<><Save size={13}/>Draft</>}
            </button>
            {step > 1 && (
              <button onClick={()=>setStep(s=>s-1)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 13px', borderRadius:9, border:`1px solid ${t.line}`, background:'transparent', cursor:'pointer', fontSize:12, fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', color:t.mid }}>
                <ArrowLeft size={13}/>Kembali
              </button>
            )}
            {step < 4 ? (
              <button onClick={()=>setStep(s=>s+1)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:9, background:t.blue, color:'#fff', border:'none', cursor:'pointer', fontSize:12, fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', boxShadow:`0 2px 10px rgba(10,132,255,${d?0.36:0.20})` }}>
                Lanjut <ArrowRight size={13}/>
              </button>
            ) : (
              <button onClick={()=>setShowSubmit(true)} disabled={isSaving} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:9, background:t.blue, color:'#fff', border:'none', cursor:isSaving?'not-allowed':'pointer', fontSize:12, fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', boxShadow:`0 2px 10px rgba(10,132,255,${d?0.36:0.20})` }}>
                <Send size={13}/>Kirim
              </button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSubmit && (
          <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:24, background:'rgba(0,0,0,0.74)', backdropFilter:'blur(18px)', WebkitBackdropFilter:'blur(18px)' }}>
            <motion.div initial={{ scale:0.96, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.96, opacity:0 }} transition={{ duration:0.14 }}
              style={{ maxWidth:348, width:'100%', background:t.card, border:`1px solid ${t.line}`, borderRadius:16, boxShadow:t.lg, overflow:'hidden' }}>
              <div style={{ padding:28, textAlign:'center' }}>
                <div style={{ width:50, height:50, borderRadius:11, background:t.blueBg, border:`1px solid ${t.blueBd}`, margin:'0 auto 15px', display:'flex', alignItems:'center', justifyContent:'center', color:t.blue }}><ShieldCheck size={22}/></div>
                <div style={{ fontSize:17, fontWeight:800, letterSpacing:'-0.03em', color:t.hi, marginBottom:7 }}>Kirim Laporan?</div>
                <div style={{ fontSize:13, color:t.mid, lineHeight:1.65, marginBottom:22 }}>
                  Total <strong style={{ color:t.blue, fontWeight:700 }}>{formatIDR(stats.revenue)}</strong> akan dikirim untuk proses audit.
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <button onClick={handleSave} disabled={isSaving} style={{ width:'100%', padding:12, background:t.blue, color:'#fff', border:'none', borderRadius:9, fontSize:13, fontWeight:700, cursor:isSaving?'not-allowed':'pointer', opacity:isSaving?0.7:1 }}>
                    {isSaving?'Menyimpan...':'Konfirmasi'}
                  </button>
                  <button onClick={()=>setShowSubmit(false)} style={{ width:'100%', padding:12, background:'transparent', color:t.mid, border:`1px solid ${t.line}`, borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>Batal</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FormPendapatan;