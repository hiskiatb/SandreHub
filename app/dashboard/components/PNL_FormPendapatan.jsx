"use client";
/**
 * PNL_FormPendapatan.jsx
 *
 * - Lampiran PDF tersimpan di Supabase Storage (bucket: pnl-attachments)
 *   metadata-nya disimpan di kolom `attachments_pendapatan` (jsonb).
 * - Hanya menerima PDF, maksimal 20 MB per file, multiple.
 * - Custom SP & Voucher tersimpan di kolom `revenue_data` (jsonb).
 *
 * FIXES:
 * - Breakpoint tabel naik 720→860px agar mobile-cards muncul di half-window
 * - Hapus minWidth:620 dari kedua tabel (biang overflow)
 * - Kolom action naik 5%→8%, redistribusi lebar kolom lain
 * - .vc-add-btn tambah white-space:nowrap + flex-shrink:0
 * - Footer flex-wrap agar tombol tidak keluar box
 * - Breakpoint .gsf naik 900→960px
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import supabase from "../../../lib/supabase";
import { pushNotification } from "../../../lib/notificationService";
import {
  uploadMany, removeOne, signedUrl, validatePdf,
  ACCEPTED_EXT, fmtSize,
} from '../../../lib/pnlAttachments';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight, AlertCircle, CheckCircle2, Send, Upload, ShieldCheck,
  BarChart3, Zap, Layers, X, FileCheck, TrendingUp,
  Award, Banknote, Gift, Loader2,
  Save, ArrowRight, ArrowLeft, Clock, Plus, Trash2,
  Eye, Ban, Package, Sparkles,
} from 'lucide-react';

// ─── Formatters ───────────────────────────────────────────────────────────────
const formatIDR = (val) => {
  const v = val || 0, neg = v < 0;
  const s = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Math.abs(v));
  return neg ? `(${s})` : s;
};
const formatPct = (val) => (isFinite(val) && val !== 0) ? `${val.toFixed(2)}%` : '0.00%';
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
const FONT_STACK = `"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif`;
const MAX_CUSTOM_SP = 20;
const MAX_CUSTOM_VC = 20;

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg:       d ? '#0D0D0E' : '#F5F5F6',
  card:     d ? '#1A1A1D' : '#FFFFFF',
  sub:      d ? '#202024' : '#F2F2F4',
  hover:    d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
  line:     d ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)',
  lineH:    d ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  hi:       d ? '#F2F2F3' : '#18181B',
  mid:      d ? '#8A8A96' : '#52525B',
  lo:       d ? '#4D4D58' : '#A1A1AA',
  blue:     '#ED1C24',
  blueBg:   d ? 'rgba(237,28,36,0.12)' : 'rgba(237,28,36,0.07)',
  blueBd:   d ? 'rgba(237,28,36,0.28)' : 'rgba(237,28,36,0.20)',
  green:    d ? '#32BCAD' : '#1A9E90',
  greenBg:  d ? 'rgba(50,188,173,0.13)' : 'rgba(50,188,173,0.09)',
  greenBd:  d ? 'rgba(50,188,173,0.30)' : 'rgba(50,188,173,0.22)',
  amber:    d ? '#FFCB05' : '#C49A00',
  amberBg:  d ? 'rgba(255,203,5,0.12)' : 'rgba(255,203,5,0.09)',
  amberBd:  d ? 'rgba(255,203,5,0.28)' : 'rgba(255,203,5,0.22)',
  red:      d ? '#FF6B6B' : '#DC2626',
  redBg:    d ? 'rgba(255,107,107,0.12)' : 'rgba(220,38,38,0.07)',
  redBd:    d ? 'rgba(255,107,107,0.28)' : 'rgba(220,38,38,0.20)',
  magenta:  '#C6168D',
  magentaBg: d ? 'rgba(198,22,141,0.12)' : 'rgba(198,22,141,0.07)',
  magentaBd: d ? 'rgba(198,22,141,0.28)' : 'rgba(198,22,141,0.18)',
  violet:   d ? '#A78BFA' : '#7C3AED',
  violetBg: d ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.07)',
  violetBd: d ? 'rgba(167,139,250,0.28)' : 'rgba(124,58,237,0.18)',
  inputBg:  d ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
  inputBd:  d ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.13)',
  roBg:     d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
  roBd:     d ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
  sm:       d ? '0 1px 2px rgba(0,0,0,0.55)' : '0 1px 2px rgba(26,26,29,0.06)',
  md:       d ? '0 6px 18px rgba(0,0,0,0.50)' : '0 6px 18px rgba(26,26,29,0.09)',
  lg:       d ? '0 20px 48px rgba(0,0,0,0.65)' : '0 20px 48px rgba(26,26,29,0.14)',
  disabledBg:    d ? 'rgba(100,100,120,0.10)' : 'rgba(100,100,120,0.07)',
  disabledBd:    d ? 'rgba(100,100,120,0.22)' : 'rgba(100,100,120,0.18)',
  disabledColor: d ? '#7A7A8A' : '#7878A0',
});

// ─── LocalInput ───────────────────────────────────────────────────────────────
const LocalInput = React.memo(({ numericValue, onChange, style, placeholder, className, readOnly }) => {
  const [display, setDisplay] = useState(() => numericValue === 0 ? '' : toSep(numericValue));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDisplay(numericValue === 0 ? '' : toSep(numericValue)); }, [numericValue]);
  return (
    <input
      type="text" inputMode={readOnly ? 'text' : 'numeric'}
      placeholder={readOnly ? (numericValue === 0 ? '—' : undefined) : (placeholder ?? '0')}
      value={display}
      onChange={(e) => { if (readOnly) return; const raw = e.target.value.replace(/\D/g, ''); setDisplay(raw === '' ? '' : toSep(raw)); }}
      onFocus={() => { if (readOnly) return; focused.current = true; if (display === '0') setDisplay(''); }}
      onBlur={() => { if (readOnly) return; focused.current = false; const n = parseNum(display); setDisplay(n === 0 ? '' : toSep(n)); onChange?.(n); }}
      readOnly={readOnly} className={className}
      style={{ ...style, ...(readOnly ? { cursor: 'default', pointerEvents: 'none', userSelect: 'text', opacity: numericValue === 0 ? 0.38 : 0.82 } : {}) }}
    />
  );
});
LocalInput.displayName = 'LocalInput';

// ─── TextInput (for custom product name) ─────────────────────────────────────
const TextInput = React.memo(({ value, onChange, placeholder, className, readOnly, style }) => (
  <input
    type="text" value={value} placeholder={placeholder}
    onChange={(e) => { if (!readOnly) onChange?.(e.target.value); }}
    readOnly={readOnly} className={className}
    style={{ ...style, ...(readOnly ? { cursor: 'default', pointerEvents: 'none', opacity: 0.82 } : {}) }}
  />
));
TextInput.displayName = 'TextInput';

// ─── Global CSS ───────────────────────────────────────────────────────────────
const G = ({ d, t }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${d ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)'}; border-radius: 99px; }
    input { font-size: 16px !important; }
    .fpi {
      width: 100%; background: ${t.inputBg}; border: 1px solid ${t.inputBd};
      border-radius: 9px; padding: 10px 13px; font-weight: 600; color: ${t.hi};
      outline: none; transition: border-color 0.14s; font-family: inherit;
      letter-spacing: -0.01em; -webkit-font-smoothing: antialiased; box-sizing: border-box;
    }
    .fpi:focus { border-color: #ED1C24; box-shadow: 0 0 0 3px rgba(237,28,36,0.14); }
    .fpi::placeholder { color: ${t.lo}; font-weight: 400; }
    .fpi-c { text-align: center; }
    .fpi-sm { padding: 8px 8px; }
    .fpi-lg { font-size: 17px !important; font-weight: 700; padding: 13px; }
    .fpi-ro {
      width: 100%; background: ${t.roBg}; border: 1px solid ${t.roBd};
      border-radius: 9px; padding: 10px 13px; font-weight: 600; color: ${t.hi};
      font-family: inherit; letter-spacing: -0.01em; box-sizing: border-box;
      pointer-events: none; user-select: text; outline: none;
    }
    .fpi-ro-sm { padding: 8px 6px; text-align: center; }
    .fpi-ro-lg { font-size: 17px !important; font-weight: 700; padding: 13px; }
    .fpi-hpp {
      width: 100%; background: ${t.inputBg}; border: 1px solid ${t.inputBd};
      border-radius: 9px; padding: 8px 8px; font-weight: 600; color: ${t.hi};
      outline: none; transition: border-color 0.14s; font-family: inherit;
      font-size: 13px !important; box-sizing: border-box; text-align: right;
    }
    .fpi-hpp:focus { border-color: #ED1C24; box-shadow: 0 0 0 3px rgba(237,28,36,0.14); }
    .fpi-hpp::placeholder { color: ${t.lo}; font-weight: 400; font-size: 11px !important; }
    .fpi-hpp-ro {
      width: 100%; background: ${t.roBg}; border: 1px solid ${t.roBd};
      border-radius: 9px; padding: 8px 8px; font-weight: 500; color: ${t.lo};
      font-family: inherit; font-size: 13px !important; box-sizing: border-box;
      pointer-events: none; user-select: text; outline: none; text-align: right;
    }
    .fpi-name {
      width: 100%; background: ${t.inputBg}; border: 1px solid ${t.inputBd};
      border-radius: 9px; padding: 8px 8px; font-weight: 700; color: ${t.hi};
      outline: none; transition: border-color 0.14s; font-family: inherit;
      font-size: 13px !important; box-sizing: border-box; letter-spacing: -0.01em;
    }
    .fpi-name:focus { border-color: #ED1C24; box-shadow: 0 0 0 3px rgba(237,28,36,0.14); }
    .fpi-name::placeholder { color: ${t.lo}; font-weight: 400; font-size: 11px !important; }
    .custom-row-highlight:hover td { background: ${d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.018)'} !important; }
    .lbl { display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: ${t.mid}; margin-bottom: 6px; }

    /* ── TABLE / CARDS BREAKPOINT: 860px (naik dari 720px) ── */
    .vc-table { display: none; }
    .vc-cards { display: flex; flex-direction: column; gap: 8px; }
    @media (min-width: 860px) { .vc-table { display: block; } .vc-cards { display: none !important; } }

    @media (min-width: 580px) { .g2 { grid-template-columns: 1fr 1fr !important; } }

    /* ── .gsf breakpoint: 960px (naik dari 900px) ── */
    @media (min-width: 960px) { .g4sp { grid-template-columns: 1fr 1fr !important; } .gsf { grid-template-columns: 1fr 1fr !important; } }

    @keyframes fpbreathe { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.38; transform:scale(0.9); } }
    @keyframes fpspin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }

    /* ── FIX: tombol +2 tidak keluar box ── */
    .vc-add-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 9px; border-radius: 7px; border: 1px dashed ${t.blueBd};
      background: ${t.blueBg}; color: ${t.blue}; cursor: pointer;
      font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
      transition: all 0.14s; font-family: inherit;
      white-space: nowrap; flex-shrink: 0; min-width: 38px;
    }
    .vc-add-btn:hover { background: ${t.blue}; color: #fff; border-color: ${t.blue}; border-style: solid; }

    .vc-rm-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 7px; border: 1px solid ${t.line};
      background: transparent; color: ${t.red}; cursor: pointer;
      transition: all 0.14s; flex-shrink: 0; font-family: inherit;
    }
    .vc-rm-btn:hover { background: ${d ? 'rgba(255,107,107,0.10)' : 'rgba(220,38,38,0.08)'}; border-color: ${t.red}; }
    .vc-entry-tag {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 7px; border-radius: 99px;
      background: ${t.magentaBg}; color: ${t.magenta}; border: 1px solid ${t.magentaBd};
      font-size: 9px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
    }
    .custom-tag {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px 7px; border-radius: 99px; font-size: 9px; font-weight: 700;
      letter-spacing: 0.06em; text-transform: uppercase;
      background: ${d ? 'rgba(167,139,250,0.15)' : '#EDE9FE'};
      color: ${d ? '#A78BFA' : '#5B21B6'};
      border: 0.5px solid ${d ? 'rgba(167,139,250,0.35)' : '#C4B5FD'};
    }
    .fp-btn-primary {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 18px; border-radius: 9px;
      background: linear-gradient(135deg, #ED1C24 0%, #C6168D 100%);
      color: #fff; border: none; cursor: pointer; font-size: 12px;
      font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
      box-shadow: 0 2px 10px rgba(237,28,36,0.30); font-family: inherit; transition: all 0.14s;
      white-space: nowrap; flex-shrink: 0;
    }
    .fp-btn-primary:hover { box-shadow: 0 4px 18px rgba(237,28,36,0.42); transform: translateY(-1px); }
    .fp-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
    .fp-btn-ghost {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 13px; border-radius: 9px; border: 1px solid ${t.line};
      background: ${t.sub}; cursor: pointer; font-size: 12px;
      font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
      color: ${t.mid}; transition: all 0.13s; font-family: inherit;
      white-space: nowrap; flex-shrink: 0;
    }
    .fp-btn-ghost:hover { border-color: ${t.blue}; color: ${t.blue}; }
    .btn-add-custom {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 9px;
      border: 1.5px dashed ${t.violetBd};
      background: ${t.violetBg}; color: ${t.violet}; cursor: pointer;
      font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      transition: all 0.15s; font-family: inherit;
    }
    .btn-add-custom:hover { background: ${t.violet}; color: #fff; border-style: solid; transform: translateY(-1px); }
    .btn-add-custom:disabled { opacity: 0.38; cursor: not-allowed; transform: none; }
    .fin-tr:hover td { background: rgba(237,28,36,0.03) !important; }
  `}</style>
);

// ─── Primitives ───────────────────────────────────────────────────────────────
const Card = ({ children, t, style = {} }) => (
  <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.sm, ...style }}>{children}</div>
);
const Body = ({ children, style = {} }) => (
  <div style={{ padding: '18px 20px', ...style }}>{children}</div>
);
const SecLabel = ({ children, t }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
    <div style={{ width: 3, height: 13, borderRadius: 99, background: t.blue, flexShrink: 0 }} />
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.mid }}>{children}</span>
  </div>
);

function DisabledMonthOverlay({ month, t, d }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 16, padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: d ? 'rgba(100,100,120,0.14)' : 'rgba(100,100,120,0.09)', border: `1.5px solid ${t.disabledBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Ban size={28} style={{ color: t.disabledColor }} />
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em', color: t.hi, marginBottom: 8 }}>Bulan Dinonaktifkan</div>
        <div style={{ fontSize: 14, color: t.mid, lineHeight: 1.65, maxWidth: 340 }}>
          Bulan <strong style={{ color: t.hi }}>{month}</strong> untuk branch ini telah dinonaktifkan dari PNL Control Center.
        </div>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 99, background: d ? 'rgba(100,100,120,0.12)' : 'rgba(100,100,120,0.08)', border: `1px solid ${t.disabledBd}`, fontSize: 12, fontWeight: 600, color: t.disabledColor }}>
        Pilih bulan lain dari header untuk melanjutkan
      </div>
    </div>
  );
}

function Stepper({ step, setStep, t, d }) {
  const ITEMS = [{ s: 1, label: 'Produk' }, { s: 2, label: 'Sales Fee' }, { s: 3, label: 'Rewards' }, { s: 4, label: 'Review' }];
  const R = 34, pct = ((step - 1) / (ITEMS.length - 1)) * 100;
  return (
    <div style={{ paddingBottom: 36, paddingTop: 4 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ position: 'absolute', top: R / 2, left: R / 2, right: R / 2, height: 1, background: t.line, transform: 'translateY(-50%)', zIndex: 0 }} />
        <div style={{ position: 'absolute', top: R / 2, left: R / 2, height: 2, background: 'linear-gradient(90deg, #ED1C24, #C6168D)', width: `calc((100% - ${R}px) * ${pct / 100})`, transform: 'translateY(-50%)', borderRadius: 99, transition: 'width 0.3s ease', zIndex: 1 }} />
        {ITEMS.map(item => {
          const isActive = step === item.s, isPast = step > item.s;
          return (
            <div key={item.s} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: R }}>
              <button onClick={() => setStep(item.s)} style={{ width: R, height: R, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, border: `2px solid ${(isActive || isPast) ? '#ED1C24' : t.line}`, background: (isActive || isPast) ? 'linear-gradient(135deg,#ED1C24,#C6168D)' : (d ? '#1A1A1D' : '#FFFFFF'), color: (isActive || isPast) ? '#fff' : t.lo, cursor: 'pointer', outline: 'none', transition: 'all 0.2s', transform: isActive ? 'scale(1.10)' : 'scale(1)', boxShadow: isActive ? `0 0 0 4px rgba(237,28,36,0.15),0 3px 10px rgba(237,28,36,0.28)` : 'none', flexShrink: 0, fontFamily: 'inherit' }}>
                {isPast ? <CheckCircle2 size={15} strokeWidth={2.5} /> : item.s}
              </button>
              <span style={{ marginTop: 9, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isActive ? '#ED1C24' : t.lo, whiteSpace: 'nowrap', transition: 'color 0.2s' }}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SecHero({ icon: Icon, step, title, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 10, border: `1px solid ${t.blueBd}`, background: t.blueBg, marginBottom: 18, boxShadow: t.sm }}>
      <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#ED1C24,#C6168D)', color: '#fff' }}><Icon size={18} /></div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: t.blue, marginBottom: 3 }}>Langkah {step} dari 4</div>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', color: t.hi, lineHeight: 1.2 }}>{title}</div>
      </div>
    </div>
  );
}

// ─── TABLE HEAD CONFIG (kolom action naik 5%→8%) ─────────────────────────────
const TABLE_HEAD = [
  { h: 'Produk',     al: 'left',   w: '24%' },
  { h: 'HPP / unit', al: 'right',  w: '16%' },
  { h: 'Qty',        al: 'center', w: '13%' },
  { h: 'Retail',     al: 'right',  w: '16%' },
  { h: 'Margin',     al: 'right',  w: '23%' },
  { h: '',           al: 'center', w: '8%'  },
];

// ─── Standard Product Row (Desktop) ──────────────────────────────────────────
function ProductRowDesktop({ item, entryIdx, section, onUpdate, onAddEntry, onRemoveEntry, t, readOnly }) {
  const isE1 = entryIdx === 1;
  const qty      = isE1 ? item.qty      : item.qty2;
  const hRetail  = isE1 ? item.hRetail  : item.hRetail2;
  const margin   = isE1 ? item.margin   : item.margin2;
  const pctMg    = isE1 ? item.pctMargin : item.pctMargin2;
  if (readOnly && qty === 0 && hRetail === 0) return null;
  return (
    <tr className="fin-tr" style={{ borderBottom: `1px solid ${t.lineH}` }}>
      <td style={{ padding: '11px 10px', verticalAlign: 'middle' }}>
        <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>
          {item.name}
          {!isE1 && <span className="vc-entry-tag" style={{ marginLeft: 8 }}>Entry 2</span>}
        </div>
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        <input readOnly tabIndex={-1} value={new Intl.NumberFormat('id-ID').format(item.hPokok)} className="fpi-hpp-ro" style={{ fontFamily: 'inherit' }} />
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        <LocalInput numericValue={qty} onChange={v => onUpdate(section, item.id, isE1 ? 'qty' : 'qty2', v)} className={readOnly ? 'fpi fpi-ro fpi-c fpi-sm' : 'fpi fpi-c fpi-sm'} readOnly={readOnly} />
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        <LocalInput numericValue={hRetail} onChange={v => onUpdate(section, item.id, isE1 ? 'hRetail' : 'hRetail2', v)} className={readOnly ? 'fpi fpi-ro fpi-sm' : 'fpi fpi-sm'} readOnly={readOnly} />
      </td>
      <td style={{ padding: '11px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
        <div style={{ fontWeight: 700, color: margin < 0 ? t.red : qty > 0 ? t.green : t.lo, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          {qty > 0 ? formatIDR(margin) : '—'}
        </div>
        {qty > 0 && pctMg !== 0 && <div style={{ fontSize: 10, color: t.lo, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{formatPct(pctMg)}</div>}
      </td>
      {/* FIX: kolom action dengan overflow:hidden agar tombol tidak keluar */}
      <td style={{ padding: '11px 4px', textAlign: 'center', verticalAlign: 'middle', overflow: 'hidden' }}>
        {!readOnly && (isE1 ? (!item.hasEntry2 && <button className="vc-add-btn" onClick={() => onAddEntry(section, item.id)}><Plus size={11} /> 2</button>) : (<button className="vc-rm-btn" onClick={() => onRemoveEntry(section, item.id)}><Trash2 size={13} /></button>))}
      </td>
    </tr>
  );
}

// ─── Custom SP Row (Desktop) ─────────────────────────────────────────────────
function CustomSPRowDesktop({ item, onUpdate, onRemove, t, readOnly }) {
  const margin = (item.qty || 0) * ((item.hRetail || 0) - (item.hPokok || 0));
  const jual   = (item.qty || 0) * (item.hRetail || 0);
  const pct    = jual > 0 ? (margin / jual) * 100 : 0;
  if (readOnly && !item.qty && !item.hRetail) return null;
  return (
    <tr className="custom-row-highlight" style={{ borderBottom: `1px solid ${t.lineH}` }}>
      <td style={{ padding: '11px 10px', verticalAlign: 'middle' }}>
        {readOnly
          ? <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{item.name || '—'}</div>
          : <TextInput value={item.name} onChange={v => onUpdate(item.id, 'name', v)} placeholder="Nama produk..." className="fpi-name" readOnly={false} />
        }
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        {readOnly
          ? <input readOnly tabIndex={-1} value={new Intl.NumberFormat('id-ID').format(item.hPokok || 0)} className="fpi-hpp-ro" style={{ fontFamily: 'inherit' }} />
          : <LocalInput numericValue={item.hPokok} onChange={v => onUpdate(item.id, 'hPokok', v)} className="fpi-hpp" placeholder="HPP / unit" readOnly={false} />
        }
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        <LocalInput numericValue={item.qty} onChange={v => onUpdate(item.id, 'qty', v)} className={readOnly ? 'fpi fpi-ro fpi-c fpi-sm' : 'fpi fpi-c fpi-sm'} readOnly={readOnly} />
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        <LocalInput numericValue={item.hRetail} onChange={v => onUpdate(item.id, 'hRetail', v)} className={readOnly ? 'fpi fpi-ro fpi-sm' : 'fpi fpi-sm'} readOnly={readOnly} />
      </td>
      <td style={{ padding: '11px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
        <div style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: item.qty === 0 ? t.lo : margin < 0 ? t.red : t.green }}>
          {item.qty === 0 ? '—' : formatIDR(margin)}
        </div>
        {item.qty > 0 && pct !== 0 && <div style={{ fontSize: 10, color: t.lo, marginTop: 2 }}>{formatPct(pct)}</div>}
      </td>
      <td style={{ padding: '11px 4px', textAlign: 'center', verticalAlign: 'middle', overflow: 'hidden' }}>
        {!readOnly && <button className="vc-rm-btn" onClick={() => onRemove(item.id)}><Trash2 size={12} /></button>}
      </td>
    </tr>
  );
}

// ─── Custom SP Card (Mobile) ─────────────────────────────────────────────────
function CustomSPCardMobile({ item, onUpdate, onRemove, t, readOnly }) {
  const margin = (item.qty || 0) * ((item.hRetail || 0) - (item.hPokok || 0));
  if (readOnly && !item.qty && !item.hRetail && !item.name) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
      style={{ borderRadius: 10, border: `0.5px solid ${t.line}`, background: t.card, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '10px 12px' }}>
        <div>
          <MobLabel>Nama produk</MobLabel>
          {readOnly
            ? <div style={{ fontSize: 13, fontWeight: 600, color: t.hi, padding: '6px 0' }}>{item.name || '—'}</div>
            : <TextInput value={item.name} onChange={v => onUpdate(item.id, 'name', v)} placeholder="cth: SP 5GB" className="fpi-name" readOnly={false} />
          }
        </div>
        <div>
          <MobLabel>HPP / unit</MobLabel>
          {readOnly
            ? <input readOnly tabIndex={-1} value={new Intl.NumberFormat('id-ID').format(item.hPokok || 0)} className="fpi-hpp-ro" style={{ fontFamily: 'inherit', textAlign: 'right' }} />
            : <LocalInput numericValue={item.hPokok} onChange={v => onUpdate(item.id, 'hPokok', v)} className="fpi-hpp" placeholder="HPP / unit" readOnly={false} />
          }
        </div>
        <div>
          <MobLabel>Qty</MobLabel>
          <LocalInput numericValue={item.qty} onChange={v => onUpdate(item.id, 'qty', v)} className={readOnly ? 'fpi fpi-ro fpi-c fpi-sm' : 'fpi fpi-c fpi-sm'} readOnly={readOnly} />
        </div>
        <div>
          <MobLabel>Retail</MobLabel>
          <LocalInput numericValue={item.hRetail} onChange={v => onUpdate(item.id, 'hRetail', v)} className={readOnly ? 'fpi fpi-ro fpi-sm' : 'fpi fpi-sm'} readOnly={readOnly} />
        </div>
      </div>
      <div style={{ padding: '0 12px 8px', paddingTop: 6, borderTop: `0.5px solid ${t.lineH}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <MobMarginRow margin={margin} qty={item.qty} t={t} inline />
        {!readOnly && (
          <button className="vc-rm-btn" onClick={() => onRemove(item.id)} style={{ marginLeft: 12, flexShrink: 0 }}><Trash2 size={12} /></button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Shared mobile helpers ──────────────────────────────────────────────────
const MobLabel = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#8A8A96', marginBottom: 4 }}>{children}</div>
);

const MobMarginRow = ({ margin, qty, t, inline }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, ...(inline ? {} : { padding: '6px 0', borderTop: `0.5px solid ${t.lineH}`, marginTop: 4 }) }}>
    <span style={{ fontSize: 11, color: t.lo }}>Margin</span>
    <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: qty === 0 ? t.lo : margin < 0 ? t.red : t.green }}>
      {qty === 0 ? '—' : formatIDR(margin)}
    </span>
  </div>
);

function ProductCardMobile({ item, section, onUpdate, onAddEntry, onRemoveEntry, t, readOnly }) {
  const hasAnyData = item.qty > 0 || item.hRetail > 0 || item.qty2 > 0 || item.hRetail2 > 0;
  if (readOnly && !hasAnyData) return null;

  const grid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
  const cardStyle = { borderRadius: 10, border: `0.5px solid ${t.line}`, background: t.card, overflow: 'hidden', marginBottom: 0 };

  const renderBlock = (isE1) => {
    const qty    = isE1 ? item.qty     : item.qty2;
    const retail = isE1 ? item.hRetail : item.hRetail2;
    const margin = isE1 ? item.margin  : item.margin2;
    if (readOnly && qty === 0 && retail === 0) return null;
    return (
      <div key={isE1 ? 'e1' : 'e2'} style={{ ...(isE1 ? {} : { borderTop: `0.5px dashed ${t.magentaBd}`, background: t.magentaBg }) }}>
        {!isE1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px 0' }}>
            <span className="vc-entry-tag">Entry 2</span>
            {!readOnly && <button className="vc-rm-btn" onClick={() => onRemoveEntry(section, item.id)}><Trash2 size={12} /></button>}
          </div>
        )}
        <div style={{ ...grid, padding: '10px 12px' }}>
          <div>
            <MobLabel>Produk</MobLabel>
            <input readOnly tabIndex={-1} value={item.name}
              style={{ width: '100%', height: 32, padding: '0 8px', border: `0.5px solid ${t.roBd}`, borderRadius: 8, background: t.roBg, color: t.lo, fontSize: 12, fontWeight: 500, fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <div>
            <MobLabel>HPP / unit</MobLabel>
            <input readOnly tabIndex={-1} value={new Intl.NumberFormat('id-ID').format(item.hPokok)}
              style={{ width: '100%', height: 32, padding: '0 8px', border: `0.5px solid ${t.roBd}`, borderRadius: 8, background: t.roBg, color: t.lo, fontSize: 12, fontWeight: 500, fontFamily: 'inherit', textAlign: 'right', outline: 'none' }} />
          </div>
          <div>
            <MobLabel>Qty</MobLabel>
            <LocalInput numericValue={qty} onChange={v => onUpdate(section, item.id, isE1 ? 'qty' : 'qty2', v)}
              className={readOnly ? 'fpi fpi-ro fpi-c fpi-sm' : 'fpi fpi-c fpi-sm'} readOnly={readOnly} />
          </div>
          <div>
            <MobLabel>Retail</MobLabel>
            <LocalInput numericValue={retail} onChange={v => onUpdate(section, item.id, isE1 ? 'hRetail' : 'hRetail2', v)}
              className={readOnly ? 'fpi fpi-ro fpi-sm' : 'fpi fpi-sm'} readOnly={readOnly} />
          </div>
        </div>
        <div style={{ padding: '0 12px 10px' }}>
          <MobMarginRow margin={margin} qty={qty} t={t} />
        </div>
      </div>
    );
  };

  return (
    <div style={cardStyle}>
      {renderBlock(true)}
      {item.hasEntry2 && renderBlock(false)}
      {!readOnly && (
        <div style={{ padding: '6px 12px 8px', borderTop: `0.5px solid ${t.lineH}`, display: 'flex', justifyContent: 'flex-end' }}>
          {!item.hasEntry2
            ? <button className="vc-add-btn" onClick={() => onAddEntry(section, item.id)}><Plus size={11} /> Entry 2</button>
            : null
          }
        </div>
      )}
    </div>
  );
}

function SubtotalRow({ label, totalMargin, totalModal, totalJual, t }) {
  return (
    <tr><td colSpan={6} style={{ padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '10px 12px', background: t.greenBg, border: `1px solid ${t.greenBd}`, borderRadius: 8, margin: '6px 0' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.green }}>{label}</span>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {[{ l: 'Total Modal', v: formatIDR(totalModal) }, { l: 'Total Jual', v: formatIDR(totalJual) }, { l: 'Total Margin', v: formatIDR(totalMargin) }].map(s => (
            <div key={s.l} style={{ textAlign: 'right' }}><div style={{ fontSize: 9, fontWeight: 600, color: t.lo, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{s.l}</div><div style={{ fontSize: 13, fontWeight: 700, color: totalMargin < 0 ? t.red : t.green, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div></div>
          ))}
        </div>
      </div>
    </td></tr>
  );
}

function SubtotalCardMobile({ label, totalMargin, totalModal, totalJual, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: t.greenBg, border: `0.5px solid ${t.greenBd}`, borderRadius: 9 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.green }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: totalMargin < 0 ? t.red : t.green, fontVariantNumeric: 'tabular-nums' }}>{formatIDR(totalMargin)}</span>
    </div>
  );
}

function InfoChip({ label, value }) {
  return (
    <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.18)', minWidth: 96 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.68, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function SumRow({ icon: Icon, label, value, highlight, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: `1px solid ${t.lineH}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.blueBg }}><Icon size={14} style={{ color: t.blue }} /></div>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.mid, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: highlight ? t.green : value < 0 ? t.red : t.hi, fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>{formatIDR(value)}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
const FormPendapatan = ({
  onUpdate, theme, setIsFormDirty, activeContext, onSaveSuccess, readOnly = false,
  disabledMonths = new Set(),
  onMonthChange,
}) => {
  const [step, setStep]             = useState(1);
  const [showSubmit, setShowSubmit] = useState(false);
  const [isLoading, setIsLoading]   = useState(true);
  const [isSaving, setIsSaving]     = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploadingAtt, setUploadingAtt] = useState(false);
  const [drag, setDrag]             = useState(false);
  const [toast, setToast]           = useState({ show: false, type: 'success', msg: '' });
  const [reportStatus, setReportStatus] = useState({ isFinalized: false, finalizedAt: null, finalizedBy: null, validationNotes: null, updatedAt: null });

  const d = theme === 'dark';
  const t = mk(d);
  const toast$ = (type, msg) => { setToast({ show: true, type, msg }); setTimeout(() => setToast(p => ({ ...p, show: false })), 4000); };

  const currentMonth  = activeContext?.month ?? '';
  const monthDisabled = Boolean(currentMonth && disabledMonths.has(currentMonth));
  const effectiveReadOnly = readOnly || monthDisabled;

  // ── Default state factory ─────────────────────────────────────────────────
  const defaults = useCallback(() => ({
    sp: [
      { id: 'sp1', dbQty: 'qty_sp_3gb_im3', dbRetail: 'retail_sp_3gb_im3', dbQty2: 'qty_sp_3gb_im3_2', dbRetail2: 'retail_sp_3gb_im3_2', name: 'SP 3GB IM3', hPokok: 29000, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'sp2', dbQty: 'qty_sp_0_im3',   dbRetail: 'retail_sp_0_im3',   dbQty2: 'qty_sp_0_im3_2',   dbRetail2: 'retail_sp_0_im3_2',   name: 'SP 0 IM3',   hPokok: 10000, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'sp3', dbQty: 'qty_sp_kpk_3id', dbRetail: 'retail_sp_kpk_3id', dbQty2: 'qty_sp_kpk_3id_2', dbRetail2: 'retail_sp_kpk_3id_2', name: 'SP KPK 3ID', hPokok: 10000, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'sp4', dbQty: 'qty_sp_3gb_3id', dbRetail: 'retail_sp_3gb_3id', dbQty2: 'qty_sp_3gb_3id_2', dbRetail2: 'retail_sp_3gb_3id_2', name: 'SP 3GB 3ID', hPokok: 29000, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
    ],
    spCustom: [],
    vc: [
      { id: 'v1',  dbQty: 'qty_vc_0_im3',       dbRetail: 'retail_vc_0_im3',       dbQty2: 'qty_vc_0_im3_2',       dbRetail2: 'retail_vc_0_im3_2',       name: 'VC 0 IM3',       hPokok: 300,   hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v2',  dbQty: 'qty_vc_2_5gb',       dbRetail: 'retail_vc_2_5gb',       dbQty2: 'qty_vc_2_5gb_2',       dbRetail2: 'retail_vc_2_5gb_2',       name: 'VC 2.5GB',       hPokok: 12600, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v3',  dbQty: 'qty_vc_3gb_30',      dbRetail: 'retail_vc_3gb_30',      dbQty2: 'qty_vc_3gb_30_2',      dbRetail2: 'retail_vc_3gb_30_2',      name: 'VC 3GB/30',      hPokok: 19500, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v4',  dbQty: 'qty_vc_3_5gb_5d',    dbRetail: 'retail_vc_3_5gb_5d',    dbQty2: 'qty_vc_3_5gb_5d_2',    dbRetail2: 'retail_vc_3_5gb_5d_2',    name: 'VC 3.5GB/5D',    hPokok: 13750, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v5',  dbQty: 'qty_vc_5gb_5d',      dbRetail: 'retail_vc_5gb_5d',      dbQty2: 'qty_vc_5gb_5d_2',      dbRetail2: 'retail_vc_5gb_5d_2',      name: 'VC 5GB/5D',      hPokok: 16800, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v6',  dbQty: 'qty_vc_7gb_7d',      dbRetail: 'retail_vc_7gb_7d',      dbQty2: 'qty_vc_7gb_7d_2',      dbRetail2: 'retail_vc_7gb_7d_2',      name: 'VC 7GB/7D',      hPokok: 22400, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v7',  dbQty: 'qty_vc_fi_4gb',      dbRetail: 'retail_vc_fi_4gb',      dbQty2: 'qty_vc_fi_4gb_2',      dbRetail2: 'retail_vc_fi_4gb_2',      name: 'VC FI 4GB',      hPokok: 24500, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v8',  dbQty: 'qty_vc_fi_1_5gb_1d', dbRetail: 'retail_vc_fi_1_5gb_1d', dbQty2: 'qty_vc_fi_1_5gb_1d_2', dbRetail2: 'retail_vc_fi_1_5gb_1d_2', name: 'VC FI 1.5GB/1D', hPokok: 4500,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v9',  dbQty: 'qty_vc_fi_3gb_1d',   dbRetail: 'retail_vc_fi_3gb_1d',   dbQty2: 'qty_vc_fi_3gb_1d_2',   dbRetail2: 'retail_vc_fi_3gb_1d_2',   name: 'VC FI 3GB/1D',   hPokok: 6600,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v10', dbQty: 'qty_vc_fi_5gb_2d',   dbRetail: 'retail_vc_fi_5gb_2d',   dbQty2: 'qty_vc_fi_5gb_2d_2',   dbRetail2: 'retail_vc_fi_5gb_2d_2',   name: 'VC FI 5GB/2D',   hPokok: 8300,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v11', dbQty: 'qty_vc_fi_3gb_3d',   dbRetail: 'retail_vc_fi_3gb_3d',   dbQty2: 'qty_vc_fi_3gb_3d_2',   dbRetail2: 'retail_vc_fi_3gb_3d_2',   name: 'VC FI 3GB/3D',   hPokok: 11600, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v12', dbQty: 'qty_vc_fi_5gb_3d',   dbRetail: 'retail_vc_fi_5gb_3d',   dbQty2: 'qty_vc_fi_5gb_3d_2',   dbRetail2: 'retail_vc_fi_5gb_3d_2',   name: 'VC FI 5GB/3D',   hPokok: 12800, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v13', dbQty: 'qty_vc_fi_15gb_7d',  dbRetail: 'retail_vc_fi_15gb_7d',  dbQty2: 'qty_vc_fi_15gb_7d_2',  dbRetail2: 'retail_vc_fi_15gb_7d_2',  name: 'VC FI 15GB/7D',  hPokok: 27900, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v14', dbQty: 'qty_vc_0_3id',       dbRetail: 'retail_vc_0_3id',       dbQty2: 'qty_vc_0_3id_2',       dbRetail2: 'retail_vc_0_3id_2',       name: 'VC 0 3ID',       hPokok: 500,   hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
    ],
    vcCustom: [],
    mobo:          { modal: 0, jual: 0 },
    salesFee:      { realtimeMargin: 0, backMargin: 0, slaFee: 0, specialProgram: 0 },
    rewards:       { champions: 0, lainnya: 0 },
    partnerIncome: 0,
  }), []);

  const [data, setData] = useState(defaults);
  const fetched$ = useRef(false), prevCtx$ = useRef({});

  // ── Fetch from DB ─────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = { mpxName: activeContext?.mpxName, branch: activeContext?.branch, mpxType: activeContext?.mpxType, month: activeContext?.month, year: activeContext?.year };
    const same = Object.keys(ctx).every(k => prevCtx$.current[k] === ctx[k]);
    if (same && fetched$.current) return;
    if (monthDisabled) { setIsLoading(false); setData(defaults()); setAttachments([]); return; }
    (async () => {
      if (!ctx.mpxName || !ctx.branch) { setIsLoading(false); return; }
      setIsLoading(true);
      setAttachments([]);
      try {
        const { data: db, error } = await supabase.from('pnl_reports').select('*')
          .eq('partner_name', ctx.mpxName).eq('branch', ctx.branch)
          .eq('mpc_mp3', ctx.mpxType).eq('month', ctx.month).eq('year', ctx.year).maybeSingle();
        if (error) throw error;
        const s = defaults();
        if (db) {
          s.sp = s.sp.map(i => { const qty2 = db[i.dbQty2] ?? 0, hr2 = db[i.dbRetail2] ?? 0; return { ...i, qty: db[i.dbQty] ?? 0, hRetail: db[i.dbRetail] ?? 0, qty2, hRetail2: hr2, hasEntry2: qty2 > 0 || hr2 > 0 }; });
          const rd = db.revenue_data ?? {};
          if (Array.isArray(rd.sp_custom)) {
            s.spCustom = rd.sp_custom
              .filter(c => c.name || c.qty > 0 || c.hRetail > 0 || c.hPokok > 0)
              .map(c => ({ id: c.id ?? `csp_${Date.now()}_${Math.random()}`, name: c.name ?? '', hPokok: c.hPokok ?? 0, qty: c.qty ?? 0, hRetail: c.hRetail ?? 0, qty2: c.qty2 ?? 0, hRetail2: c.hRetail2 ?? 0, hasEntry2: c.hasEntry2 ?? false }));
          }
          s.vc = s.vc.map(i => { const qty2 = db[i.dbQty2] ?? 0, hr2 = db[i.dbRetail2] ?? 0; return { ...i, qty: db[i.dbQty] ?? 0, hRetail: db[i.dbRetail] ?? 0, qty2, hRetail2: hr2, hasEntry2: qty2 > 0 || hr2 > 0 }; });
          if (Array.isArray(rd.vc_custom)) {
            s.vcCustom = rd.vc_custom
              .filter(c => c.name || c.qty > 0 || c.hRetail > 0 || c.hPokok > 0)
              .map(c => ({ id: c.id ?? `cvc_${Date.now()}_${Math.random()}`, name: c.name ?? '', hPokok: c.hPokok ?? 0, qty: c.qty ?? 0, hRetail: c.hRetail ?? 0 }));
          }
          s.mobo          = { modal: db.mobo_modal ?? 0, jual: db.mobo_jual ?? 0 };
          s.salesFee      = { realtimeMargin: db.realtime_margin ?? 0, backMargin: db.back_margin ?? 0, slaFee: db.sla_fee ?? 0, specialProgram: db.special_program ?? 0 };
          s.rewards       = { champions: db.rewards_champions ?? 0, lainnya: db.rewards_lainnya ?? 0 };
          s.partnerIncome = db.partner_income ?? 0;
          setAttachments(Array.isArray(db.attachments_pendapatan) ? db.attachments_pendapatan : []);
          setReportStatus({ isFinalized: db.is_finalized ?? false, finalizedAt: db.finalized_at ?? null, finalizedBy: db.finalized_by ?? null, validationNotes: db.validation_notes ?? null, updatedAt: db.updated_at ?? null });
        }
        setData(s); prevCtx$.current = ctx; fetched$.current = true;
      } catch (e) { console.error('Fetch:', e.message); setData(defaults()); }
      finally { setIsLoading(false); setIsFormDirty?.(false); }
    })();
  }, [activeContext, defaults, setIsFormDirty, monthDisabled]);

  // ── Stats (memoized calculations) ─────────────────────────────────────────
  const stats = useMemo(() => {
    const calcItem = (i) => {
      const modal1 = (Number(i.qty)||0)*(Number(i.hPokok)||0), jual1 = (Number(i.qty)||0)*(Number(i.hRetail)||0), mg1 = jual1-modal1;
      const modal2 = (Number(i.qty2)||0)*(Number(i.hPokok)||0), jual2 = (Number(i.qty2)||0)*(Number(i.hRetail2)||0), mg2 = jual2-modal2;
      const totalModal=modal1+modal2, totalJual=jual1+jual2, totalMg=mg1+mg2;
      return { ...i, totalModal1:modal1, totalJual1:jual1, margin:mg1, pctMargin:jual1>0?(mg1/jual1)*100:0, totalModal2:modal2, totalJual2:jual2, margin2:mg2, pctMargin2:jual2>0?(mg2/jual2)*100:0, totalModal, totalJual, totalMargin:totalMg };
    };

    const spItems   = data.sp.map(calcItem);
    const sp = { items: spItems, totalModal: spItems.reduce((a,b)=>a+b.totalModal,0), totalJual: spItems.reduce((a,b)=>a+b.totalJual,0), totalMargin: spItems.reduce((a,b)=>a+b.totalMargin,0) };

    const customItems = data.spCustom.map(c => {
      const m1 = (c.qty||0)*((c.hRetail||0)-(c.hPokok||0));
      const m2 = (c.qty2||0)*((c.hRetail2||0)-(c.hPokok||0));
      const totalModal = (c.qty||0)*(c.hPokok||0) + (c.qty2||0)*(c.hPokok||0);
      const totalJual  = (c.qty||0)*(c.hRetail||0) + (c.qty2||0)*(c.hRetail2||0);
      return { ...c, margin1: m1, margin2: m2, totalModal, totalJual, totalMargin: m1+m2 };
    });
    const spCustomTotal = { totalModal: customItems.reduce((a,b)=>a+b.totalModal,0), totalJual: customItems.reduce((a,b)=>a+b.totalJual,0), totalMargin: customItems.reduce((a,b)=>a+b.totalMargin,0) };

    const spAllModal  = sp.totalModal  + spCustomTotal.totalModal;
    const spAllJual   = sp.totalJual   + spCustomTotal.totalJual;
    const spAllMargin = sp.totalMargin + spCustomTotal.totalMargin;

    const vcItems = data.vc.map(calcItem);
    const vc = { items: vcItems, totalModal: vcItems.reduce((a,b)=>a+b.totalModal,0), totalJual: vcItems.reduce((a,b)=>a+b.totalJual,0), totalMargin: vcItems.reduce((a,b)=>a+b.totalMargin,0) };

    const vcCustomItems = data.vcCustom.map(c => {
      const m = (c.qty||0)*((c.hRetail||0)-(c.hPokok||0));
      const totalModal = (c.qty||0)*(c.hPokok||0);
      const totalJual  = (c.qty||0)*(c.hRetail||0);
      return { ...c, totalModal, totalJual, totalMargin: m };
    });
    const vcCustomTotal = { totalModal: vcCustomItems.reduce((a,b)=>a+b.totalModal,0), totalJual: vcCustomItems.reduce((a,b)=>a+b.totalJual,0), totalMargin: vcCustomItems.reduce((a,b)=>a+b.totalMargin,0) };
    const vcAllModal  = vc.totalModal  + vcCustomTotal.totalModal;
    const vcAllJual   = vc.totalJual   + vcCustomTotal.totalJual;
    const vcAllMargin = vc.totalMargin + vcCustomTotal.totalMargin;

    const gtJual = spAllJual + vcAllJual;
    const gtMg   = spAllMargin + vcAllMargin;
    const gtPct  = gtJual > 0 ? (gtMg / gtJual) * 100 : 0;

    const upfront  = Number(data.mobo.modal) * 0.015;
    const sfMg     = Number(data.salesFee.realtimeMargin) + Number(data.salesFee.backMargin);
    const sfTotal  = upfront + sfMg + Number(data.salesFee.slaFee) + Number(data.salesFee.specialProgram);
    const rwTotal  = Number(data.rewards.champions) + Number(data.rewards.lainnya);
    const revenue  = gtMg + sfTotal + rwTotal + Number(data.partnerIncome);

    return { sp, spCustom: customItems, spCustomTotal, spAllModal, spAllJual, spAllMargin, vc, vcCustom: vcCustomItems, vcCustomTotal, vcAllModal, vcAllJual, vcAllMargin, gtMg, gtJual, gtPct, upfront, sfTotal, rwTotal, revenue };
  }, [data]);

  useEffect(() => { onUpdate?.(stats.revenue); }, [stats.revenue, onUpdate]);

  // ── Payload builder ───────────────────────────────────────────────────────
  const mkPayload = (fin, userId, notes) => {
    const spEntries = data.sp.reduce((acc,c) => ({ ...acc, [c.dbQty]:c.qty, [c.dbRetail]:c.hRetail, [c.dbQty2]:c.hasEntry2?c.qty2:0, [c.dbRetail2]:c.hasEntry2?c.hRetail2:0 }), {});
    const vcEntries = data.vc.reduce((acc,c) => ({ ...acc, [c.dbQty]:c.qty, [c.dbRetail]:c.hRetail, [c.dbQty2]:c.hasEntry2?c.qty2:0, [c.dbRetail2]:c.hasEntry2?c.hRetail2:0 }), {});
    const revenueData = {
      sp_custom: data.spCustom.filter(c => c.name || c.qty > 0 || c.hRetail > 0).map(c => ({ id: c.id, name: c.name, hPokok: c.hPokok, qty: c.qty, hRetail: c.hRetail, qty2: c.hasEntry2 ? c.qty2 : 0, hRetail2: c.hasEntry2 ? c.hRetail2 : 0, hasEntry2: c.hasEntry2 })),
      vc_custom: data.vcCustom.filter(c => c.name || c.qty > 0 || c.hRetail > 0).map(c => ({ id: c.id, name: c.name, hPokok: c.hPokok, qty: c.qty, hRetail: c.hRetail })),
    };
    return {
      user_id: userId, partner_name: activeContext.mpxName, branch: activeContext.branch,
      mpc_mp3: activeContext.mpxType, month: activeContext.month, year: activeContext.year,
      ...spEntries, ...vcEntries,
      mobo_modal: data.mobo.modal, mobo_jual: data.mobo.jual,
      realtime_margin: data.salesFee.realtimeMargin, back_margin: data.salesFee.backMargin,
      sla_fee: data.salesFee.slaFee, special_program: data.salesFee.specialProgram,
      rewards_champions: data.rewards.champions, rewards_lainnya: data.rewards.lainnya,
      partner_income: data.partnerIncome, grand_total_revenue: stats.revenue,
      revenue_data: revenueData,
      attachments_pendapatan: attachments,
      is_finalized: fin, finalized_at: fin ? new Date().toISOString() : null, finalized_by: fin ? userId : null,
      validation_notes: notes, updated_at: new Date().toISOString(),
    };
  };

  const validate = () => {
    if (monthDisabled)           { toast$('error', `Bulan ${currentMonth} telah dinonaktifkan`); return false; }
    if (!activeContext?.mpxName) { toast$('error', 'Nama Partner belum dipilih'); return false; }
    if (!activeContext?.branch)  { toast$('error', 'Kantor Cabang belum dipilih'); return false; }
    if (!activeContext?.mpxType) { toast$('error', 'Tipe MPC/MP3 belum tersedia'); return false; }
    if (!activeContext?.month)   { toast$('error', 'Bulan laporan belum dipilih'); return false; }
    if (!activeContext?.year)    { toast$('error', 'Tahun laporan belum dipilih'); return false; }
    return true;
  };

  const handleSaveDraft = async () => {
    if (readOnly || !validate()) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir.');
      const en = reportStatus.validationNotes ?? '';
      const marked = en.includes('pendapatan:draft') || en.includes('pendapatan:final');
      const notes = marked ? en : (en ? en + ',pendapatan:draft' : 'pendapatan:draft');
      const { error } = await supabase.from('pnl_reports').upsert(mkPayload(false, user.id, notes), { onConflict: 'partner_name,branch,mpc_mp3,month,year' });
      if (error) throw error;
      setReportStatus(p => ({ ...p, isFinalized: false, updatedAt: new Date().toISOString(), validationNotes: notes }));
      setIsFormDirty?.(false);
      toast$('success', 'Draft berhasil disimpan');
      await pushNotification(supabase, { type: "form_draft", form: "pendapatan", partner_name: activeContext.mpxName, branch: activeContext.branch, mpc_mp3: activeContext.mpxType, month: activeContext.month, year: activeContext.year, validation_notes: notes, triggered_by: user.id, triggered_name: user.user_metadata?.full_name ?? '' });
    } catch (err) { toast$('error', err.message || 'Gagal menyimpan draft'); }
    finally { setIsSaving(false); }
  };

  const handleSave = async () => {
    if (readOnly || !validate()) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir.');
      const en = reportStatus.validationNotes ?? '';
      let parts = en ? en.split(',').filter(p => p && !p.startsWith('pendapatan:')) : [];
      parts.push('pendapatan:final');
      const notes = parts.join(',');
      const { error } = await supabase.from('pnl_reports').upsert(mkPayload(true, user.id, notes), { onConflict: 'partner_name,branch,mpc_mp3,month,year' });
      if (error) throw error;
      const now = new Date().toISOString();
      setReportStatus({ isFinalized: true, finalizedAt: now, finalizedBy: user.id, validationNotes: notes, updatedAt: now });
      setIsFormDirty?.(false); setShowSubmit(false); onSaveSuccess?.();
      toast$('success', 'Laporan berhasil dikirim');
      const bothFinal = notes.includes('pendapatan:final') && notes.includes('pengeluaran:final');
      await pushNotification(supabase, { type: bothFinal ? "finalized" : "form_final", form: "pendapatan", partner_name: activeContext.mpxName, branch: activeContext.branch, mpc_mp3: activeContext.mpxType, month: activeContext.month, year: activeContext.year, validation_notes: notes, triggered_by: user.id, triggered_name: user.user_metadata?.full_name ?? '' });
    } catch (err) { toast$('error', err.message || 'Gagal menyimpan laporan'); }
    finally { setIsSaving(false); }
  };

  // ── Standard product update handlers ─────────────────────────────────────
  const updateVal = useCallback((section, id, field, val) => {
    if (effectiveReadOnly) return;
    setData(prev => {
      if (section === 'partnerIncome') return { ...prev, partnerIncome: val };
      if (Array.isArray(prev[section])) return { ...prev, [section]: prev[section].map(i => i.id === id ? { ...i, [field]: val } : i) };
      if (typeof prev[section] === 'object') return { ...prev, [section]: { ...prev[section], [field]: val } };
      return prev;
    });
    setIsFormDirty?.(true);
  }, [setIsFormDirty, effectiveReadOnly]);

  const addEntry = useCallback((section, id) => {
    if (effectiveReadOnly) return;
    setData(prev => ({ ...prev, [section]: prev[section].map(i => i.id === id ? { ...i, hasEntry2: true } : i) }));
    setIsFormDirty?.(true);
  }, [setIsFormDirty, effectiveReadOnly]);

  const removeEntry = useCallback((section, id) => {
    if (effectiveReadOnly) return;
    setData(prev => ({ ...prev, [section]: prev[section].map(i => i.id === id ? { ...i, hasEntry2: false, qty2: 0, hRetail2: 0 } : i) }));
    setIsFormDirty?.(true);
  }, [setIsFormDirty, effectiveReadOnly]);

  // ─── Lampiran (PDF only) ─────────────────────────────────────────────────
  const handlePickFiles = useCallback(async (fileList) => {
    if (effectiveReadOnly) return;
    if (!activeContext?.mpxName || !activeContext?.branch || !activeContext?.month || !activeContext?.year) {
      toast$('error', 'Lengkapi konteks partner/bulan dulu sebelum upload');
      return;
    }
    const arr = Array.from(fileList || []);
    if (!arr.length) return;

    const accepted = [], rejected = [];
    for (const f of arr) {
      const err = validatePdf(f);
      if (err) rejected.push(err); else accepted.push(f);
    }
    if (rejected.length) toast$('error', rejected.join(' · '));
    if (!accepted.length) return;

    setUploadingAtt(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir');
      const { ok, errors } = await uploadMany({
        files: accepted,
        partner:  activeContext.mpxName,
        branch:   activeContext.branch,
        year:     activeContext.year,
        month:    activeContext.month,
        category: 'pendapatan',
      });
      if (ok.length) {
        setAttachments(prev => [...prev, ...ok]);
        setIsFormDirty?.(true);
        toast$('success', `${ok.length} lampiran berhasil diunggah`);
      }
      if (errors.length) toast$('error', `${errors.length} file gagal: ${errors[0].message}`);
    } catch (e) {
      toast$('error', e.message);
    } finally {
      setUploadingAtt(false);
    }
  }, [effectiveReadOnly, activeContext, setIsFormDirty]);

  const handleRemoveAttachment = useCallback(async (path) => {
    if (effectiveReadOnly) return;
    try {
      await removeOne(path);
      setAttachments(prev => prev.filter(a => a.path !== path));
      setIsFormDirty?.(true);
      toast$('success', 'Lampiran dihapus');
    } catch (e) {
      toast$('error', 'Gagal menghapus: ' + e.message);
    }
  }, [effectiveReadOnly, setIsFormDirty]);

  const handleDownloadAttachment = useCallback(async (att) => {
    try {
      const url = await signedUrl(att.path, 60);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast$('error', 'Gagal membuka file: ' + e.message);
    }
  }, []);

  // ── Custom SP handlers ────────────────────────────────────────────────────
  const addCustomSP = useCallback(() => {
    if (effectiveReadOnly) return;
    if (data.spCustom.length >= MAX_CUSTOM_SP) { toast$('error', `Maksimal ${MAX_CUSTOM_SP} produk custom`); return; }
    const newItem = { id: `csp_${Date.now()}`, name: '', hPokok: 0, qty: 0, hRetail: 0, qty2: 0, hRetail2: 0, hasEntry2: false };
    setData(prev => ({ ...prev, spCustom: [...prev.spCustom, newItem] }));
    setIsFormDirty?.(true);
  }, [data.spCustom.length, effectiveReadOnly, setIsFormDirty]);

  const removeCustomSP = useCallback((id) => {
    if (effectiveReadOnly) return;
    setData(prev => ({ ...prev, spCustom: prev.spCustom.filter(c => c.id !== id) }));
    setIsFormDirty?.(true);
  }, [effectiveReadOnly, setIsFormDirty]);

  const updateCustomSP = useCallback((id, field, val) => {
    if (effectiveReadOnly) return;
    setData(prev => ({ ...prev, spCustom: prev.spCustom.map(c => c.id === id ? { ...c, [field]: val } : c) }));
    setIsFormDirty?.(true);
  }, [effectiveReadOnly, setIsFormDirty]);

  const addCustomVC = useCallback(() => {
    if (effectiveReadOnly) return;
    if (data.vcCustom.length >= MAX_CUSTOM_VC) { toast$('error', `Maksimal ${MAX_CUSTOM_VC} produk custom`); return; }
    const newItem = { id: `cvc_${Date.now()}`, name: '', hPokok: 0, qty: 0, hRetail: 0 };
    setData(prev => ({ ...prev, vcCustom: [...prev.vcCustom, newItem] }));
    setIsFormDirty?.(true);
  }, [data.vcCustom.length, effectiveReadOnly, setIsFormDirty]);

  const removeCustomVC = useCallback((id) => {
    if (effectiveReadOnly) return;
    setData(prev => ({ ...prev, vcCustom: prev.vcCustom.filter(c => c.id !== id) }));
    setIsFormDirty?.(true);
  }, [effectiveReadOnly, setIsFormDirty]);

  const updateCustomVC = useCallback((id, field, val) => {
    if (effectiveReadOnly) return;
    setData(prev => ({ ...prev, vcCustom: prev.vcCustom.map(c => c.id === id ? { ...c, [field]: val } : c) }));
    setIsFormDirty?.(true);
  }, [effectiveReadOnly, setIsFormDirty]);

  // ── Reusable table colgroup + thead ───────────────────────────────────────
  const TableColHead = () => (
    <>
      <colgroup>
        {TABLE_HEAD.map((c, i) => <col key={i} style={{ width: c.w }} />)}
      </colgroup>
      <thead>
        <tr style={{ borderBottom: `1px solid ${t.line}`, background: t.sub }}>
          {TABLE_HEAD.map((c, i) => (
            <th key={i} style={{ padding: '8px 10px', textAlign: c.al, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.mid }}>{c.h}</th>
          ))}
        </tr>
      </thead>
    </>
  );

  const TableSubHead = () => (
    <tr style={{ background: t.sub, borderTop: `0.5px solid ${t.line}`, borderBottom: `0.5px solid ${t.line}` }}>
      {TABLE_HEAD.map((c, i) => (
        <th key={i} style={{ padding: '6px 10px', textAlign: c.al, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.lo }}>{c.h}</th>
      ))}
    </tr>
  );

  const ctxMonth = activeContext?.month ?? '', ctxYear = activeContext?.year ?? '';
  const ctxType = activeContext?.mpxType ?? '', ctxName = activeContext?.mpxName ?? '', ctxBranch = activeContext?.branch ?? '';
  const notes = reportStatus.validationNotes ?? '';
  const hasPengeluaranFinal = notes.includes('pengeluaran:final');

  if (isLoading) return (
    <><G d={d} t={t} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 340, gap: 14, fontFamily: FONT_STACK }}>
        <div style={{ position: 'relative', width: 52, height: 52 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderTopColor: '#ED1C24', borderRightColor: '#C6168D', animation: 'spin 0.9s linear infinite' }} />
          <div style={{ position: 'absolute', inset: 8, borderRadius: 10, background: 'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fpbreathe 1.8s ease-in-out infinite', boxShadow: '0 4px 14px rgba(237,28,36,0.4)' }}><ArrowUpRight size={18} color="#fff" /></div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: t.mid }}>Memuat data...</span>
      </div>
    </>
  );

  return (
    <div style={{ width: '100%', margin: '0 auto', paddingBottom: 80, fontFamily: FONT_STACK, WebkitFontSmoothing: 'antialiased', color: t.hi }}>
      <G d={d} t={t} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 46, height: 46, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)', color: '#fff', boxShadow: '0 2px 10px rgba(237,28,36,0.30)' }}><ArrowUpRight size={25} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.035em', color: t.hi, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Form Pendapatan {ctxMonth} {ctxYear}</div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: t.mid, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[ctxType, ctxName, ctxBranch].filter(Boolean).join(' · ')}</div>
        </div>
        {monthDisabled
          ? <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, background: t.disabledBg, border: `1px solid ${t.disabledBd}`, color: t.disabledColor, fontSize: 11, fontWeight: 700, flexShrink: 0 }}><Ban size={12} /> Bulan Nonaktif</div>
          : readOnly ? <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99, background: t.amberBg, border: `1px solid ${t.amberBd}`, color: t.amber, fontSize: 11, fontWeight: 700, flexShrink: 0 }}><Eye size={12} /> Mode Lihat</div>
          : null}
      </div>

      {monthDisabled ? <DisabledMonthOverlay month={currentMonth} t={t} d={d} /> : (
        <>
          <Stepper step={step} setStep={setStep} t={t} d={d} />

          {/* Toast */}
          <AnimatePresence>
            {toast.show && (
              <motion.div initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97 }} transition={{ duration: 0.17 }}
                style={{ position: 'fixed', top: 66, right: 16, zIndex: 999, width: 316, maxWidth: 'calc(100vw - 32px)' }}>
                <div style={{ background: t.card, border: `1px solid ${toast.type === 'success' ? t.greenBd : t.redBd}`, borderRadius: 12, boxShadow: t.lg, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '13px 15px' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: toast.type === 'success' ? t.green : t.red, color: '#fff' }}>
                      {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>{toast.type === 'success' ? 'Berhasil' : 'Terjadi Kesalahan'}</div>
                      <div style={{ fontSize: 12, color: t.mid, marginTop: 3, lineHeight: 1.5 }}>{toast.msg}</div>
                    </div>
                    <button onClick={() => setToast(p => ({ ...p, show: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.lo, padding: 2 }}><X size={13} /></button>
                  </div>
                  <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: 4, ease: 'linear' }} style={{ height: 2, background: toast.type === 'success' ? t.green : t.red }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">

            {/* ══ STEP 1: PRODUK ══ */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.17 }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SecHero icon={Layers} step={1} title="Margin Produk" t={t} />

                {/* ── A. SP Standard ── */}
                <Card t={t}>
                  <Body>
                    <SecLabel t={t}>A. Starter Pack (SP) Regular</SecLabel>
                    {!effectiveReadOnly && (
                      <div style={{ fontSize: 11, color: t.lo, marginBottom: 14, lineHeight: 1.55 }}>
                        Produk bawaan sistem. Tap <strong style={{ color: t.blue }}>+2</strong> untuk harga retail kedua. Gunakan tombol di bawah untuk menambah produk SP baru.
                      </div>
                    )}

                    {/* Desktop table — minWidth dihapus, table-layout:fixed yang handle */}
                    <div className="vc-table">
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                        <TableColHead />
                        <tbody>
                          {stats.sp.items.map(item => (
                            <React.Fragment key={item.id}>
                              <ProductRowDesktop item={item} entryIdx={1} section="sp" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} />
                              {item.hasEntry2 && <ProductRowDesktop item={item} entryIdx={2} section="sp" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} />}
                            </React.Fragment>
                          ))}

                          {stats.spCustom.length > 0 && (
                            <>
                              <tr><td colSpan={6} style={{ padding: '4px 0 0', background: 'transparent' }} /></tr>
                              <TableSubHead />
                            </>
                          )}
                          <AnimatePresence>
                            {stats.spCustom.map(item => (
                              <CustomSPRowDesktop key={item.id} item={item} onUpdate={updateCustomSP} onRemove={removeCustomSP} t={t} readOnly={effectiveReadOnly} />
                            ))}
                          </AnimatePresence>

                          <SubtotalRow
                            label={`Subtotal SP${stats.spCustom.length > 0 ? ` (${stats.sp.items.length} bawaan + ${stats.spCustom.length} custom)` : ''}`}
                            totalMargin={stats.spAllMargin}
                            totalModal={stats.spAllModal}
                            totalJual={stats.spAllJual}
                            t={t}
                          />
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="vc-cards">
                      {stats.sp.items.map(item => (
                        <ProductCardMobile key={item.id} item={item} section="sp" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} />
                      ))}
                      {stats.spCustom.length > 0 && <div style={{ height: 4 }} />}
                      <AnimatePresence>
                        {stats.spCustom.map(item => (
                          <CustomSPCardMobile key={item.id} item={item} onUpdate={updateCustomSP} onRemove={removeCustomSP} t={t} readOnly={effectiveReadOnly} />
                        ))}
                      </AnimatePresence>
                      <SubtotalCardMobile
                        label={`Subtotal SP${stats.spCustom.length > 0 ? ` (+${stats.spCustom.length} custom)` : ''}`}
                        totalMargin={stats.spAllMargin}
                        totalModal={stats.spAllModal}
                        totalJual={stats.spAllJual}
                        t={t}
                      />
                    </div>

                    {!effectiveReadOnly && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px dashed ${t.violetBd}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: t.violetBg, border: `1px solid ${t.violetBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Package size={13} style={{ color: t.violet }} />
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>Produk SP Tambahan</div>
                              <div style={{ fontSize: 10, color: t.lo }}>Tambahkan produk SP di luar template bawaan · maks {MAX_CUSTOM_SP}</div>
                            </div>
                          </div>
                          <button className="btn-add-custom" onClick={addCustomSP} disabled={data.spCustom.length >= MAX_CUSTOM_SP}>
                            <Plus size={13} /> Tambah Produk
                            {data.spCustom.length > 0 && <span style={{ opacity: 0.65, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>({data.spCustom.length}/{MAX_CUSTOM_SP})</span>}
                          </button>
                        </div>
                      </div>
                    )}
                  </Body>
                </Card>

                {/* ── B. Voucher ── */}
                <Card t={t}>
                  <Body>
                    <SecLabel t={t}>B. Voucher Regular</SecLabel>
                    {!effectiveReadOnly && (<div style={{ fontSize: 11, color: t.lo, marginBottom: 14, lineHeight: 1.55 }}>Jika satu produk dijual dengan <strong style={{ color: t.mid }}>2 harga retail berbeda</strong>, tap tombol <strong style={{ color: t.blue }}>+2</strong>.</div>)}

                    {/* Desktop table — minWidth dihapus */}
                    <div className="vc-table">
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                        <TableColHead />
                        <tbody>
                          {stats.vc.items.map(item => (
                            <React.Fragment key={item.id}>
                              <ProductRowDesktop item={item} entryIdx={1} section="vc" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} />
                              {item.hasEntry2 && <ProductRowDesktop item={item} entryIdx={2} section="vc" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} />}
                            </React.Fragment>
                          ))}
                          {stats.vcCustom.length > 0 && (
                            <>
                              <tr><td colSpan={6} style={{ padding: '4px 0 0', background: 'transparent' }} /></tr>
                              <TableSubHead />
                            </>
                          )}
                          <AnimatePresence>
                            {stats.vcCustom.map(item => (
                              <CustomSPRowDesktop key={item.id} item={item} onUpdate={updateCustomVC} onRemove={removeCustomVC} t={t} readOnly={effectiveReadOnly} />
                            ))}
                          </AnimatePresence>
                          <SubtotalRow
                            label={`Subtotal Voucher${stats.vcCustom.length > 0 ? ` (${stats.vc.items.length} bawaan + ${stats.vcCustom.length} custom)` : ' Regular'}`}
                            totalMargin={stats.vcAllMargin}
                            totalModal={stats.vcAllModal}
                            totalJual={stats.vcAllJual}
                            t={t}
                          />
                        </tbody>
                      </table>
                    </div>

                    <div className="vc-cards">
                      {stats.vc.items.map(item => (
                        <ProductCardMobile key={item.id} item={item} section="vc" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} />
                      ))}
                      {stats.vcCustom.length > 0 && <div style={{ height: 4 }} />}
                      <AnimatePresence>
                        {stats.vcCustom.map(item => (
                          <CustomSPCardMobile key={item.id} item={item} onUpdate={updateCustomVC} onRemove={removeCustomVC} t={t} readOnly={effectiveReadOnly} />
                        ))}
                      </AnimatePresence>
                      <SubtotalCardMobile
                        label={`Subtotal Voucher${stats.vcCustom.length > 0 ? ` (+${stats.vcCustom.length} custom)` : ' Regular'}`}
                        totalMargin={stats.vcAllMargin}
                        totalModal={stats.vcAllModal}
                        totalJual={stats.vcAllJual}
                        t={t}
                      />
                    </div>

                    {!effectiveReadOnly && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px dashed ${t.violetBd}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 7, background: t.violetBg, border: `1px solid ${t.violetBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Package size={13} style={{ color: t.violet }} />
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>Voucher Tambahan</div>
                              <div style={{ fontSize: 10, color: t.lo }}>Tambahkan voucher di luar template bawaan · maks {MAX_CUSTOM_VC}</div>
                            </div>
                          </div>
                          <button className="btn-add-custom" onClick={addCustomVC} disabled={data.vcCustom.length >= MAX_CUSTOM_VC}>
                            <Plus size={13} /> Tambah Produk
                            {data.vcCustom.length > 0 && <span style={{ opacity: 0.65, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>({data.vcCustom.length}/{MAX_CUSTOM_VC})</span>}
                          </button>
                        </div>
                      </div>
                    )}
                  </Body>
                </Card>

                {/* ── C. Saldo MOBO ── */}
                <Card t={t}>
                  <Body>
                    <SecLabel t={t}>C. Saldo Mobo</SecLabel>
                    <div className="g2" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                      <div>
                        <label className="lbl">Total Modal Mobo</label>
                        <LocalInput numericValue={data.mobo.modal} onChange={v => updateVal('mobo', null, 'modal', v)} className={effectiveReadOnly ? 'fpi fpi-ro' : 'fpi'} readOnly={effectiveReadOnly} />
                      </div>
                      <div>
                        <label className="lbl">Total Penjualan Mobo</label>
                        <LocalInput numericValue={data.mobo.jual} onChange={v => updateVal('mobo', null, 'jual', v)} className={effectiveReadOnly ? 'fpi fpi-ro' : 'fpi'} readOnly={effectiveReadOnly} />
                      </div>
                    </div>
                    <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: t.sub, border: `1px solid ${t.lineH}`, fontSize: 11, color: t.lo }}>
                      Nilai Modal Mobo digunakan untuk perhitungan otomatis <strong>Upfront Discount 1.5%</strong> pada langkah Sales Fee.
                    </div>
                  </Body>
                </Card>

                {/* ── Grand total margin banner ── */}
                <div style={{ padding: '18px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)', color: '#fff', display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 20px rgba(237,28,36,0.28)' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', opacity: 0.76, marginBottom: 5 }}>Subtotal Margin Produk</div>
                    <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>{formatIDR(stats.gtMg)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                    <InfoChip label="SP" value={formatIDR(stats.spAllMargin)} />
                    {stats.spCustom.length > 0 && <InfoChip label={`SP +${stats.spCustom.length}`} value={formatIDR(stats.spCustomTotal.totalMargin)} />}
                    <InfoChip label="Voucher" value={formatIDR(stats.vcAllMargin)} />
                    {stats.vcCustom.length > 0 && <InfoChip label={`VC +${stats.vcCustom.length}`} value={formatIDR(stats.vcCustomTotal.totalMargin)} />}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ══ STEP 2: SALES FEE ══ */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.17 }} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                <SecHero icon={Zap} step={2} title="Sales Fee" t={t} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '15px 18px', borderRadius: 10, border: `1px solid ${t.greenBd}`, background: t.greenBg }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><div style={{ width: 34, height: 34, borderRadius: 8, background: t.green, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}><TrendingUp size={16} /></div><div><div style={{ fontSize: 13, fontWeight: 700, color: t.green }}>A. Upfront Discount</div><div style={{ fontSize: 11, color: t.mid, marginTop: 2 }}>1.5% dari Modal Mobo</div></div></div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: t.green, fontVariantNumeric: 'tabular-nums' }}>{formatIDR(stats.upfront)}</div>
                </div>
                <Card t={t}><Body><SecLabel t={t}>B. Sales Margin</SecLabel><div className="gsf" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 11 }}><div><label className="lbl">Realtime Margin</label><LocalInput numericValue={data.salesFee.realtimeMargin} onChange={v => updateVal('salesFee', null, 'realtimeMargin', v)} className={effectiveReadOnly ? 'fpi fpi-ro' : 'fpi'} readOnly={effectiveReadOnly} /></div><div><label className="lbl">Back Margin</label><LocalInput numericValue={data.salesFee.backMargin} onChange={v => updateVal('salesFee', null, 'backMargin', v)} className={effectiveReadOnly ? 'fpi fpi-ro' : 'fpi'} readOnly={effectiveReadOnly} /></div></div></Body></Card>
                <div className="gsf" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 11 }}>
                  <Card t={t}><Body><SecLabel t={t}>C. SLA Monthly Fee</SecLabel><LocalInput numericValue={data.salesFee.slaFee} onChange={v => updateVal('salesFee', null, 'slaFee', v)} className={effectiveReadOnly ? 'fpi fpi-ro' : 'fpi'} readOnly={effectiveReadOnly} /></Body></Card>
                  <Card t={t}><Body><SecLabel t={t}>D. Special Program</SecLabel><LocalInput numericValue={data.salesFee.specialProgram} onChange={v => updateVal('salesFee', null, 'specialProgram', v)} className={effectiveReadOnly ? 'fpi fpi-ro' : 'fpi'} readOnly={effectiveReadOnly} /></Body></Card>
                </div>
                <div style={{ padding: '15px 20px', borderRadius: 12, background: 'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, boxShadow: '0 4px 20px rgba(237,28,36,0.28)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Zap size={16} /></div><span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#fff' }}>Total Sales Fee</span></div>
                  <span style={{ fontSize: 26, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{formatIDR(stats.sfTotal)}</span>
                </div>
              </motion.div>
            )}

            {/* ══ STEP 3: REWARDS ══ */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.17 }}>
                <SecHero icon={Award} step={3} title="Hadiah & Reward" t={t} />
                <Card t={t} style={{ maxWidth: 540, margin: '0 auto' }}><Body>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {[{ label: 'A. Hadiah Champions Club', key: 'champions', val: data.rewards.champions }, { label: 'B. Hadiah Lainnya', key: 'lainnya', val: data.rewards.lainnya }].map(item => (
                      <div key={item.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}><label className="lbl" style={{ margin: 0 }}>{item.label}</label><span style={{ fontSize: 11, fontWeight: 600, color: t.green }}>{formatPct((Number(item.val) / (stats.rwTotal || 1)) * 100)}</span></div>
                        <LocalInput numericValue={item.val} onChange={v => updateVal('rewards', null, item.key, v)} className={effectiveReadOnly ? 'fpi fpi-ro fpi-ro-lg' : 'fpi fpi-lg'} readOnly={effectiveReadOnly} />
                      </div>
                    ))}
                    <div style={{ padding: '14px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><div style={{ width: 32, height: 32, borderRadius: 7, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Gift size={15} /></div><span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff' }}>Total Rewards</span></div>
                      <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{formatIDR(stats.rwTotal)}</span>
                    </div>
                  </div>
                </Body></Card>
              </motion.div>
            )}

            {/* ══ STEP 4: REVIEW ══ */}
            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.17 }}>
                <SecHero icon={ShieldCheck} step={4} title="Laporan Akhir" t={t} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>

                  {/* Partner Income & upload */}
                  <Card t={t}><Body>
                    <SecLabel t={t}>Pendapatan Partner</SecLabel>
                    <div style={{ padding: '14px 16px', borderRadius: 9, background: t.greenBg, border: `1px solid ${t.greenBd}`, marginBottom: 14 }}>
                      <label className="lbl" style={{ color: t.green, marginBottom: 7 }}>Input Manual (Luar Template)</label>
                      <LocalInput numericValue={data.partnerIncome} onChange={v => updateVal('partnerIncome', null, null, v)} readOnly={effectiveReadOnly}
                        style={{ fontSize: 24, fontWeight: 800, color: t.green, letterSpacing: '-0.04em', width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit', ...(effectiveReadOnly ? { cursor: 'default', pointerEvents: 'none' } : {}) }} />
                    </div>

                    {/* Upload PDF */}
                    <div
                      onDragOver={e => { e.preventDefault(); if (!effectiveReadOnly) setDrag(true); }}
                      onDragLeave={() => setDrag(false)}
                      onDrop={e => { e.preventDefault(); setDrag(false); if (!effectiveReadOnly) handlePickFiles(e.dataTransfer.files); }}
                      style={{ border: `1.5px dashed ${drag ? t.blue : t.line}`, borderRadius: 10, padding: '18px 14px', textAlign: 'center', background: drag ? t.blueBg : 'transparent', transition: 'all .15s', cursor: effectiveReadOnly ? 'default' : 'pointer', opacity: uploadingAtt ? 0.7 : 1 }}
                    >
                      {!effectiveReadOnly && (
                        <label htmlFor="fp-up" style={{ cursor: 'pointer', display: 'block' }}>
                          <input
                            type="file" id="fp-up"
                            multiple
                            accept={ACCEPTED_EXT + ',application/pdf'}
                            style={{ display: 'none' }}
                            onChange={e => { handlePickFiles(e.target.files); e.target.value = ''; }}
                            disabled={uploadingAtt}
                          />
                          {uploadingAtt
                            ? <><Loader2 size={22} style={{ color: t.blue, animation: 'fpspin 1s linear infinite', margin: '0 auto 8px' }} /><div style={{ fontSize: 12, color: t.mid }}>Mengunggah lampiran…</div></>
                            : <><Upload size={22} style={{ color: t.lo, margin: '0 auto 8px' }} /><div style={{ fontSize: 13, fontWeight: 700, color: t.mid }}>Upload Lampiran (PDF)</div><div style={{ fontSize: 11, color: t.lo, marginTop: 3 }}>Drag & drop atau klik · Maks 20 MB per file · Multiple</div></>
                          }
                        </label>
                      )}
                      {effectiveReadOnly && attachments.length === 0 && (
                        <div style={{ fontSize: 12, color: t.lo }}>Tidak ada lampiran</div>
                      )}
                    </div>

                    {/* Daftar lampiran tersimpan */}
                    {attachments.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.mid }}>
                          {attachments.length} Lampiran Tersimpan
                        </div>
                        <AnimatePresence>
                          {attachments.map(att => (
                            <motion.div
                              key={att.path}
                              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }}
                              transition={{ duration: 0.14 }}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.line}`, background: t.sub }}
                            >
                              <FileCheck size={16} style={{ color: t.green, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: t.hi, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</div>
                                <div style={{ fontSize: 10, color: t.lo, marginTop: 1 }}>{fmtSize(att.size)}{att.uploaded_at ? ` · ${fmtDate(att.uploaded_at)}` : ''}</div>
                              </div>
                              <button
                                onClick={() => handleDownloadAttachment(att)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.blue, fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6, fontFamily: 'inherit', flexShrink: 0 }}
                                title="Buka PDF"
                              >Lihat</button>
                              {!effectiveReadOnly && (
                                <button
                                  onClick={() => handleRemoveAttachment(att.path)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.lo, padding: 4, display: 'flex', flexShrink: 0 }}
                                  title="Hapus"
                                ><X size={14} /></button>
                              )}
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </Body></Card>

                  {/* Breakdown SP Custom */}
                  {stats.spCustom.length > 0 && (
                    <Card t={t}><Body>
                      <SecLabel t={t}>Produk SP Custom ({stats.spCustom.length} item)</SecLabel>
                      {stats.spCustom.map((c, i) => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${t.lineH}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="custom-tag" style={{ flexShrink: 0 }}><Sparkles size={7} />{i + 1}</span>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>{c.name || `Produk Custom ${i + 1}`}</div>
                              <div style={{ fontSize: 10, color: t.lo }}>Pokok: {formatIDR(c.hPokok)} · {c.qty + (c.hasEntry2 ? c.qty2 : 0)} unit</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: c.totalMargin < 0 ? t.red : t.green, fontVariantNumeric: 'tabular-nums' }}>{formatIDR(c.totalMargin)}</div>
                            <div style={{ fontSize: 10, color: t.lo }}>dari {formatIDR(c.totalJual)}</div>
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTop: `1px solid ${t.violetBd}` }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: t.violet }}>Total Custom SP</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: t.violet, fontVariantNumeric: 'tabular-nums' }}>{formatIDR(stats.spCustomTotal.totalMargin)}</span>
                      </div>
                    </Body></Card>
                  )}

                  {/* Breakdown VC Custom */}
                  {stats.vcCustom.length > 0 && (
                    <Card t={t}><Body>
                      <SecLabel t={t}>Voucher Custom ({stats.vcCustom.length} item)</SecLabel>
                      {stats.vcCustom.map((c2, i) => (
                        <div key={c2.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${t.lineH}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="custom-tag" style={{ flexShrink: 0 }}><Sparkles size={7} />{i + 1}</span>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>{c2.name || `Voucher Custom ${i + 1}`}</div>
                              <div style={{ fontSize: 10, color: t.lo }}>Pokok: {formatIDR(c2.hPokok)} · {c2.qty} unit</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: c2.totalMargin < 0 ? t.red : t.green, fontVariantNumeric: 'tabular-nums' }}>{formatIDR(c2.totalMargin)}</div>
                            <div style={{ fontSize: 10, color: t.lo }}>dari {formatIDR(c2.totalJual)}</div>
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTop: `1px solid ${t.violetBd}` }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: t.violet }}>Total Voucher Custom</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: t.violet, fontVariantNumeric: 'tabular-nums' }}>{formatIDR(stats.vcCustomTotal.totalMargin)}</span>
                      </div>
                    </Body></Card>
                  )}

                  {/* Breakdown margin */}
                  <Card t={t}><Body>
                    <SecLabel t={t}>Breakdown Margin Produk</SecLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      <SumRow icon={Layers} label={`SP Regular (${stats.sp.items.filter(i => i.qty > 0 || i.qty2 > 0).length} produk)`} value={stats.sp.totalMargin} t={t} />
                      {stats.spCustom.length > 0 && <SumRow icon={Package} label={`SP Custom (${stats.spCustom.length} produk)`} value={stats.spCustomTotal.totalMargin} t={t} />}
                      <SumRow icon={BarChart3} label={`Voucher Regular (${stats.vc.items.filter(i => i.qty > 0 || i.qty2 > 0).length} produk)`} value={stats.vc.totalMargin} t={t} />
                      {stats.vcCustom.length > 0 && <SumRow icon={Package} label={`Voucher Custom (${stats.vcCustom.length} produk)`} value={stats.vcCustomTotal.totalMargin} t={t} />}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 12, borderTop: `1.5px solid ${t.greenBd}` }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.green }}>Total Margin Produk</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: t.green, fontVariantNumeric: 'tabular-nums' }}>{formatIDR(stats.gtMg)}</span>
                      </div>
                    </div>
                  </Body></Card>

                  {/* Ringkasan struktur */}
                  <Card t={t}><Body>
                    <SecLabel t={t}>Ringkasan Struktur Pendapatan</SecLabel>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <SumRow icon={Layers} label="Margin Produk" value={stats.gtMg} t={t} />
                      <SumRow icon={Zap} label="Sales Fee" value={stats.sfTotal} t={t} />
                      <SumRow icon={Award} label="Rewards & Hadiah" value={stats.rwTotal} t={t} />
                      <SumRow icon={Banknote} label="Partner Income" value={data.partnerIncome} t={t} highlight />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 16, marginTop: 4, borderTop: `2px solid ${t.greenBd}` }}>
                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.green }}>Net Revenue</span>
                        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: stats.revenue < 0 ? t.red : t.green, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{formatIDR(stats.revenue)}</span>
                      </div>
                    </div>
                  </Body></Card>

                  {/* Finalized banner */}
                  <div style={{ padding: '34px 26px', borderRadius: 14, border: `1.5px solid ${t.greenBd}`, background: t.greenBg, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.green, marginBottom: 13 }}>Total Pendapatan Terakumulasi</div>
                    <div style={{ fontSize: 'clamp(26px,6vw,58px)', fontWeight: 800, letterSpacing: '-0.04em', color: stats.revenue < 0 ? t.red : t.green, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, marginBottom: 20, wordBreak: 'break-all' }}>{formatIDR(stats.revenue)}</div>
                    {reportStatus.isFinalized ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        {hasPengeluaranFinal
                          ? <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 99, background: t.green, color: '#fff', fontSize: 12, fontWeight: 700 }}><CheckCircle2 size={14} />Pendapatan &amp; Pengeluaran Tervalidasi</div>
                          : <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderRadius: 99, background: t.green, color: '#fff', fontSize: 12, fontWeight: 700 }}>
                              <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>1</div>
                              Laporan Pendapatan Tervalidasi
                            </div>
                        }
                        {reportStatus.finalizedAt && <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.mid }}><Clock size={12} style={{ color: t.lo }} />Difinalisasi: {fmtDate(reportStatus.finalizedAt)}</div>}
                        {hasPengeluaranFinal && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 99, background: t.magentaBg, border: `1px solid ${t.magentaBd}`, fontSize: 11, color: t.magenta, fontWeight: 600 }}><CheckCircle2 size={11} />Form Pengeluaran juga tervalidasi</div>}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 99, background: t.amberBg, border: `1px solid ${t.amberBd}`, color: t.amber, fontSize: 12, fontWeight: 700 }}><Clock size={14} />Belum Difinalisasi</div>
                        {reportStatus.updatedAt && <div style={{ fontSize: 11, color: t.mid }}>Draft tersimpan: {fmtDate(reportStatus.updatedAt)}</div>}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ── Fixed Footer — FIX: flex-wrap + gap kecil agar tidak overflow ── */}
      {!monthDisabled && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, borderTop: `1px solid ${t.line}`, background: d ? 'rgba(13,13,14,0.94)' : 'rgba(255,255,255,0.94)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', zIndex: 60, padding: '11px 16px' }}>
          <div style={{ width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            {!effectiveReadOnly && (
              <button onClick={handleSaveDraft} disabled={isSaving} className="fp-btn-ghost">
                {isSaving ? <><Loader2 size={13} style={{ animation: 'fpspin 1s linear infinite' }} />Simpan...</> : <><Save size={13} />Draft</>}
              </button>
            )}
            {step > 1 && <button onClick={() => setStep(s => s - 1)} className="fp-btn-ghost"><ArrowLeft size={13} />Kembali</button>}
            {step < 4
              ? <button onClick={() => setStep(s => s + 1)} className="fp-btn-primary">Lanjut <ArrowRight size={13} /></button>
              : !effectiveReadOnly && <button onClick={() => setShowSubmit(true)} disabled={isSaving} className="fp-btn-primary"><Send size={13} />Kirim</button>
            }
          </div>
        </div>
      )}

      {/* Submit Modal */}
      <AnimatePresence>
        {showSubmit && !effectiveReadOnly && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.74)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ duration: 0.14 }}
              style={{ maxWidth: 348, width: '100%', background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.lg, overflow: 'hidden' }}>
              <div style={{ padding: 28, textAlign: 'center' }}>
                <div style={{ width: 50, height: 50, borderRadius: 11, background: 'linear-gradient(135deg,#ED1C24,#C6168D)', margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 16px rgba(237,28,36,0.32)' }}><ShieldCheck size={22} /></div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', color: t.hi, marginBottom: 7 }}>Kirim Laporan?</div>
                <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.65, marginBottom: 14 }}>Total <strong style={{ color: t.green }}>{formatIDR(stats.revenue)}</strong> akan dikirim untuk proses audit.</div>
                {(stats.spCustom.length > 0 || stats.vcCustom.length > 0) && (
                  <div style={{ padding: '8px 12px', borderRadius: 8, background: t.violetBg, border: `1px solid ${t.violetBd}`, marginBottom: 8, fontSize: 11, color: t.violet, fontWeight: 600 }}>
                    <Sparkles size={10} style={{ display: 'inline', marginRight: 4 }} />{stats.spCustom.length} SP + {stats.vcCustom.length} VC custom disertakan
                  </div>
                )}
                {attachments.length > 0 && (
                  <div style={{ padding: '8px 12px', borderRadius: 8, background: t.blueBg, border: `1px solid ${t.blueBd}`, marginBottom: 14, fontSize: 11, color: t.blue, fontWeight: 600 }}>
                    <FileCheck size={10} style={{ display: 'inline', marginRight: 4 }} />{attachments.length} lampiran PDF tersimpan
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={handleSave} disabled={isSaving} className="fp-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 13 }}>{isSaving ? 'Menyimpan...' : 'Konfirmasi'}</button>
                  <button onClick={() => setShowSubmit(false)} className="fp-btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: 12, fontSize: 13 }}>Batal</button>
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