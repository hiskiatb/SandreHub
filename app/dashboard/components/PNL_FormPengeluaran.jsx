"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import supabase from "../../../lib/supabase";
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight, ArrowDownLeft, AlertCircle, CheckCircle2, Send, Upload, ShieldCheck,
  TrendingUp, Calculator, Banknote,
  Building2, Users, Megaphone, Coins,
  FileText, Loader2, X, FileCheck,
  ArrowRight, ArrowLeft, Save, Clock,
  ArrowUpDown
} from 'lucide-react';

// ─── UTILITIES ────────────────────────────────────────────────────────────────
const formatIDR = (val) => {
  const isNegative = val < 0;
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(Math.abs(val));
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
  return new Date(iso).toLocaleString('id-ID', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
};

// ─── DESIGN TOKENS — identik dengan FormPendapatan ───────────────────────────
const mk = (d) => ({
  bg:       d ? '#07090D'                       : '#F2F2F7',
  card:     d ? '#0D1019'                       : '#FFFFFF',
  sub:      d ? '#131826'                       : '#F5F5F8',
  pill:     d ? '#1A2030'                       : '#EEEEF3',
  line:     d ? 'rgba(255,255,255,0.07)'        : 'rgba(0,0,0,0.09)',
  lineH:    d ? 'rgba(255,255,255,0.045)'       : 'rgba(0,0,0,0.05)',
  hi:       d ? '#EEF0F5'                       : '#1A1A1E',
  mid:      d ? '#8892A4'                       : '#4B5563',
  lo:       d ? '#424D60'                       : '#9CA3AF',
  blue:     '#0A84FF',
  blueLight:d ? '#3DA0FF'                       : '#0070E0',
  blueBg:   d ? 'rgba(10,132,255,0.11)'         : 'rgba(10,132,255,0.07)',
  blueBd:   d ? 'rgba(10,132,255,0.26)'         : 'rgba(10,132,255,0.18)',
  green:    d ? '#2ED158'                       : '#16A34A',
  greenBg:  d ? 'rgba(46,209,88,0.10)'          : 'rgba(22,163,74,0.08)',
  greenBd:  d ? 'rgba(46,209,88,0.20)'          : 'rgba(22,163,74,0.16)',
  red:      d ? '#FF453A'                       : '#DC2626',
  inputBg:  d ? 'rgba(255,255,255,0.05)'        : '#FFFFFF',
  inputBd:  d ? 'rgba(255,255,255,0.09)'        : 'rgba(0,0,0,0.13)',
  sm:       d ? '0 1px 3px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.045)'
             : '0 1px 3px rgba(0,0,0,0.07),0 0 0 1px rgba(0,0,0,0.055)',
  md:       d ? '0 6px 20px rgba(0,0,0,0.45)'  : '0 6px 20px rgba(0,0,0,0.08)',
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
    .fpi {
      width: 100%; background: ${t.inputBg}; border: 1px solid ${t.inputBd};
      border-radius: 9px; padding: 10px 13px; font-size: 14px; font-weight: 600; color: ${t.hi};
      outline: none; transition: border-color 0.14s; font-family: inherit;
      letter-spacing: -0.01em; -webkit-font-smoothing: antialiased; box-sizing: border-box;
    }
    .fpi:focus { border-color: #0A84FF; box-shadow: 0 0 0 3px rgba(10,132,255,0.14); }
    .fpi::placeholder { color: ${t.lo}; font-weight: 400; }
    .fpi-c { text-align: center; }
    .fpi-lg { font-size: 17px; font-weight: 700; padding: 13px; }
    .lbl { display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: ${t.mid}; margin-bottom: 6px; }
    .erow:hover td { background: ${d ? 'rgba(10,132,255,0.04)' : 'rgba(10,132,255,0.028)'} !important; }
    @media (min-width: 640px) {
      .gsf2 { grid-template-columns: 1fr 1fr !important; }
    }
    @keyframes fpbreathe { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.38; transform:scale(0.9); } }
    @keyframes fpspin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
  `}</style>
);

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
const Card = ({ children, t, style = {} }) => (
  <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.sm, overflow: 'visible', ...style }}>
    {children}
  </div>
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

// ─── STEPPER 5-step — identik struktur FormPendapatan ─────────────────────────
function Stepper({ step, setStep, t, d }) {
  const ITEMS = [
    { s: 1, label: 'OPEX'   }, { s: 2, label: 'SDM'    },
    { s: 3, label: 'Mkt'    }, { s: 4, label: 'COM'    },
    { s: 5, label: 'Review' },
  ];
  const R   = 34;
  const pct = ((step - 1) / (ITEMS.length - 1)) * 100;
  return (
    <div style={{ paddingBottom: 36, paddingTop: 4 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ position: 'absolute', top: R / 2, left: R / 2, right: R / 2, height: 1, background: t.line, transform: 'translateY(-50%)', zIndex: 0 }} />
        <div style={{ position: 'absolute', top: R / 2, left: R / 2, height: 2, background: t.blue, width: `calc((100% - ${R}px) * ${pct / 100})`, transform: 'translateY(-50%)', borderRadius: 99, transition: 'width 0.3s ease', zIndex: 1 }} />
        {ITEMS.map((item) => {
          const isActive = step === item.s, isPast = step > item.s;
          return (
            <div key={item.s} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: R }}>
              <button onClick={() => setStep(item.s)} style={{
                width: R, height: R, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 12,
                border: `2px solid ${(isActive || isPast) ? t.blue : t.line}`,
                background: (isActive || isPast) ? t.blue : (d ? '#0D1019' : '#FFFFFF'),
                color: (isActive || isPast) ? '#fff' : t.lo,
                cursor: 'pointer', outline: 'none', transition: 'all 0.2s',
                transform: isActive ? 'scale(1.10)' : 'scale(1)',
                boxShadow: isActive ? `0 0 0 4px ${t.blueBg},0 3px 10px rgba(10,132,255,0.28)` : 'none',
                flexShrink: 0,
              }}>
                {isPast ? <CheckCircle2 size={15} strokeWidth={2.5} /> : item.s}
              </button>
              <span style={{ marginTop: 9, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isActive ? t.blue : t.lo, whiteSpace: 'nowrap', transition: 'color 0.2s' }}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SECTION HERO ─────────────────────────────────────────────────────────────
function SecHero({ icon: Icon, step, title, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 10, border: `1px solid ${t.line}`, background: t.card, marginBottom: 18, boxShadow: t.sm }}>
      <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.blueBg, color: t.blue, border: `1px solid ${t.blueBd}` }}>
        <Icon size={18} />
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: t.mid, marginBottom: 3 }}>
          Langkah {step} dari 5
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', color: t.hi, lineHeight: 1.2 }}>{title}</div>
      </div>
    </div>
  );
}

// ─── EXPENSE TABLE ────────────────────────────────────────────────────────────
function ExpenseTable({ items, sectionKey, onUpdate, t }) {
  return (
    <Card t={t}>
      <Body>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 460 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.line}` }}>
                {[
                  { h: 'Sub-Kategori', al: 'left',   w: null },
                  { h: 'Qty',          al: 'center', w: 68   },
                  { h: 'Harga Satuan', al: 'left',   w: 148  },
                  { h: 'Total',        al: 'right',  w: 130  },
                ].map(c => (
                  <th key={c.h} style={{ padding: '7px 10px', textAlign: c.al, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.lo, width: c.w ? `${c.w}px` : undefined }}>{c.h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="erow" style={{ borderBottom: `1px solid ${t.lineH}` }}>
                  <td style={{ padding: '9px 10px' }}>
                    <div style={{ fontWeight: 700, color: t.hi, letterSpacing: '-0.01em' }}>{item.name}</div>
                  </td>
                  <td style={{ padding: '9px 10px', width: 68 }}>
                    <LocalInput numericValue={item.qty} onChange={v => onUpdate(sectionKey, item.id, 'qty', v)} className="fpi fpi-c" />
                  </td>
                  <td style={{ padding: '9px 10px', width: 148 }}>
                    <LocalInput numericValue={item.price} onChange={v => onUpdate(sectionKey, item.id, 'price', v)} className="fpi" />
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: item.total > 0 ? t.blue : t.lo, fontVariantNumeric: 'tabular-nums' }}>
                      {formatIDR(item.total)}
                    </div>
                    {item.total > 0 && (
                      <div style={{ fontSize: 10, color: t.lo, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{formatPct(item.composition)}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Body>
    </Card>
  );
}

// ─── SUM ROW — desain identik Total Reward / Sales Fee di FormPendapatan ──────
function SumRow({ icon: Icon, label, value, highlight, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: `1px solid ${t.lineH}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.blueBg }}>
          <Icon size={14} style={{ color: t.blue }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.mid, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: highlight ? t.blue : value < 0 ? t.red : t.hi, fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>
        {formatIDR(value)}
      </span>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const FormPengeluaran = ({ onUpdate, theme, setIsFormDirty, activeContext, onSaveSuccess }) => {
  const [step, setStep]             = useState(1);
  const [showSubmit, setShowSubmit] = useState(false);
  const [isLoading, setIsLoading]   = useState(true);
  const [isSaving, setIsSaving]     = useState(false);
  const [file, setFile]             = useState(null);         // upload utama step 5
  const [mktFile, setMktFile]       = useState(null);         // upload marketing step 3
  const [drag, setDrag]             = useState(false);
  const [mktDrag, setMktDrag]       = useState(false);
  const [toast, setToast]           = useState({ show: false, type: 'success', msg: '' });
  // Status laporan dari DB
  const [reportStatus, setReportStatus] = useState({ isFinalized: false, finalizedAt: null, finalizedBy: null, validationNotes: null, updatedAt: null });

  const d = theme === 'dark';
  const t = mk(d);

  const toast$ = (type, msg) => {
    setToast({ show: true, type, msg });
    setTimeout(() => setToast(p => ({ ...p, show: false })), 4000);
  };

  // ── Default state ─────────────────────────────────────────────────────────
  const defaults = useCallback(() => ({
    opex: [
      { id:'o1', dbQty:'qty_opex_gedung',    dbPrice:'price_opex_gedung',    name:'Infrastruktur Gedung',  qty:0, price:0 },
      { id:'o2', dbQty:'qty_opex_kendaraan', dbPrice:'price_opex_kendaraan', name:'Penyewaan Kendaraan',   qty:0, price:0 },
      { id:'o3', dbQty:'qty_opex_listrik',   dbPrice:'price_opex_listrik',   name:'Listrik',               qty:0, price:0 },
      { id:'o4', dbQty:'qty_opex_air',       dbPrice:'price_opex_air',       name:'Air',                   qty:0, price:0 },
      { id:'o5', dbQty:'qty_opex_it',        dbPrice:'price_opex_it',        name:'Telekomunikasi & IT',   qty:0, price:0 },
      { id:'o6', dbQty:'qty_opex_logistik',  dbPrice:'price_opex_logistik',  name:'Logistik (Gudang)',     qty:0, price:0 },
      { id:'o7', dbQty:'qty_opex_asuransi',  dbPrice:'price_opex_asuransi',  name:'Asuransi Aset',         qty:0, price:0 },
      { id:'o8', dbQty:'qty_opex_lain',      dbPrice:'price_opex_lain',      name:'Lain-lain Internal',    qty:0, price:0 },
    ],
    sdm: [
  { id:'s1',  dbQty:'qty_sdm_bm',             dbPrice:'price_sdm_bm',             name:'Benefit BM',                  qty:0, price:0 },
  { id:'s2',  dbQty:'qty_sdm_tm',             dbPrice:'price_sdm_tm',             name:'Benefit TM',                  qty:0, price:0 },
  { id:'s3',  dbQty:'qty_sdm_om',             dbPrice:'price_sdm_om',             name:'Benefit Operational Manager', qty:0, price:0 },
  { id:'s4',  dbQty:'qty_sdm_gm',             dbPrice:'price_sdm_gm',             name:'Benefit GM',                  qty:0, price:0 },
  { id:'s5',  dbQty:'qty_sdm_hrd',            dbPrice:'price_sdm_hrd',            name:'Benefit HRD',                 qty:0, price:0 },
  { id:'s6',  dbQty:'qty_sdm_mis',            dbPrice:'price_sdm_mis',            name:'Benefit MIS',                 qty:0, price:0 },
  { id:'s7',  dbQty:'qty_sdm_som',            dbPrice:'price_sdm_som',            name:'Benefit SOM',                 qty:0, price:0 },
  { id:'s8',  dbQty:'qty_sdm_finance_spv',    dbPrice:'price_sdm_finance_spv',    name:'Benefit Finance SPV',         qty:0, price:0 },
  { id:'s9',  dbQty:'qty_sdm_finance_staff',  dbPrice:'price_sdm_finance_staff',  name:'Benefit Finance Staff',       qty:0, price:0 },
  { id:'s10', dbQty:'qty_sdm_ob',             dbPrice:'price_sdm_ob',             name:'Benefit OB',                  qty:0, price:0 },
  { id:'s11', dbQty:'qty_sdm_tss',            dbPrice:'price_sdm_tss',            name:'Territory Sales SPV',         qty:0, price:0 },

  { id:'s12', dbQty:'qty_sdm_admin',          dbPrice:'price_sdm_admin',          name:'Benefit Admin & WH',          qty:0, price:0 },
  { id:'s13', dbQty:'qty_sdm_finance',        dbPrice:'price_sdm_finance',        name:'Benefit Finance',             qty:0, price:0 },
  { id:'s14', dbQty:'qty_sdm_md',             dbPrice:'price_sdm_md',             name:'Benefit MD',                  qty:0, price:0 },
  { id:'s15', dbQty:'qty_sdm_ss',             dbPrice:'price_sdm_ss',             name:'Benefit Sales Support',       qty:0, price:0 },
  { id:'s16', dbQty:'qty_sdm_ops',            dbPrice:'price_sdm_ops',            name:'Operasional Staff',           qty:0, price:0 },
  { id:'s17', dbQty:'qty_sdm_dinas',          dbPrice:'price_sdm_dinas',          name:'Perjalanan Dinas',            qty:0, price:0 },
],
   marketing: [
  { id:'m1', dbQty:'qty_mkt_ws',        dbPrice:'price_mkt_ws',        name:'Program Wholeseller',              qty:0, price:0 },
  { id:'m2', dbQty:'qty_mkt_retail',    dbPrice:'price_mkt_retail',    name:'Program Retail',                   qty:0, price:0 },

  // TAMBAHAN BARU
  { id:'m25', dbQty:'qty_mkt_starter',  dbPrice:'price_mkt_starter',   name:'Diskon / Subsidi Starter Pack',    qty:0, price:0 },

  { id:'m3', dbQty:'qty_mkt_event',     dbPrice:'price_mkt_event',     name:'Program Event',                    qty:0, price:0 },
  { id:'m4', dbQty:'qty_mkt_lain',      dbPrice:'price_mkt_lain',      name:'Program Lain',                     qty:0, price:0 },
],
    com: [
      { id:'c1', dbQty:'qty_com_admin', dbPrice:'price_com_admin', name:'Biaya Administrasi',  qty:0, price:0 },
      { id:'c2', dbQty:'qty_com_bunga', dbPrice:'price_com_bunga', name:'Bunga Pinjaman Bank', qty:0, price:0 },
    ],
    partnerExpense: 0,
  }), []);

  const [data, setData] = useState(defaults);
  const fetched$        = useRef(false);
  const prevCtx$        = useRef({});

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = {
      mpxName: activeContext?.mpxName, branch: activeContext?.branch,
      mpxType: activeContext?.mpxType, month: activeContext?.month, year: activeContext?.year,
    };
    const same = prevCtx$.current.mpxName === ctx.mpxName && prevCtx$.current.branch === ctx.branch && prevCtx$.current.month === ctx.month && prevCtx$.current.year === ctx.year;
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
          s.opex            = s.opex.map(i => ({ ...i, qty: db[i.dbQty] ?? 0, price: db[i.dbPrice] ?? 0 }));
          s.sdm             = s.sdm.map(i => ({ ...i, qty: db[i.dbQty] ?? 0, price: db[i.dbPrice] ?? 0 }));
          s.marketing       = s.marketing.map(i => ({ ...i, qty: db[i.dbQty] ?? 0, price: db[i.dbPrice] ?? 0 }));
          s.com             = s.com.map(i => ({ ...i, qty: db[i.dbQty] ?? 0, price: db[i.dbPrice] ?? 0 }));
          s.partnerExpense  = db.partner_expense ?? 0;
          setReportStatus({
            isFinalized:     db.is_finalized    ?? false,
            finalizedAt:     db.finalized_at    ?? null,
            finalizedBy:     db.finalized_by    ?? null,
            validationNotes: db.validation_notes ?? null,
            updatedAt:       db.updated_at       ?? null,
          });
        }
        setData(s);
        prevCtx$.current = ctx;
        fetched$.current = true;
      } catch (e) {
        console.error('Fetch error:', e.message);
        setData(defaults());
      } finally {
        setIsLoading(false);
        setIsFormDirty?.(false);
      }
    })();
  }, [activeContext, defaults, setIsFormDirty]);

  // ── Calculations ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const calc = (list) => {
      const items = list.map(i => ({ ...i, total: (Number(i.qty)||0) * (Number(i.price)||0) }));
      const total = items.reduce((a, b) => a + b.total, 0);
      return { items: items.map(i => ({ ...i, composition: total > 0 ? (i.total / total) * 100 : 0 })), total };
    };
    const opex = calc(data.opex), sdm = calc(data.sdm), marketing = calc(data.marketing), com = calc(data.com);
    const grandTotal = opex.total + sdm.total + marketing.total + com.total + Number(data.partnerExpense || 0);
    return { opex, sdm, marketing, com, grandTotal };
  }, [data]);

  useEffect(() => { onUpdate?.(stats.grandTotal); }, [stats.grandTotal, onUpdate]);

  // ── Payload builder ───────────────────────────────────────────────────────
  const mkPayload = (fin, userId, notes) => ({
    user_id: userId, partner_name: activeContext.mpxName, branch: activeContext.branch,
    mpc_mp3: activeContext.mpxType, month: activeContext.month, year: activeContext.year,
    ...data.opex.reduce((a, c) => ({ ...a, [c.dbQty]: c.qty, [c.dbPrice]: c.price }), {}),
    ...data.sdm.reduce((a, c) => ({ ...a, [c.dbQty]: c.qty, [c.dbPrice]: c.price }), {}),
    ...data.marketing.reduce((a, c) => ({ ...a, [c.dbQty]: c.qty, [c.dbPrice]: c.price }), {}),
    ...data.com.reduce((a, c) => ({ ...a, [c.dbQty]: c.qty, [c.dbPrice]: c.price }), {}),
    partner_expense: data.partnerExpense, grand_total_pengeluaran: stats.grandTotal,
    is_finalized: fin,
    finalized_at: fin ? new Date().toISOString() : null,
    finalized_by: fin ? userId : null,
    validation_notes: notes,
    updated_at: new Date().toISOString(),
  });

  const validate = () => {
    if (!activeContext?.mpxName) { toast$('error', 'Nama Partner belum dipilih'); return false; }
    if (!activeContext?.branch)  { toast$('error', 'Kantor Cabang belum dipilih'); return false; }
    if (!activeContext?.mpxType) { toast$('error', 'Tipe MPC/MP3 belum tersedia'); return false; }
    if (!activeContext?.month)   { toast$('error', 'Bulan laporan belum dipilih'); return false; }
    if (!activeContext?.year)    { toast$('error', 'Tahun laporan belum dipilih'); return false; }
    return true;
  };

  // ── Save Draft ────────────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir.');
      // Baca notes lama jika sudah ada
      const existingNotes = reportStatus.validationNotes ?? '';
      // Tandai bahwa Pengeluaran sudah diisi sebagai draft
      const notes = existingNotes.includes('pengeluaran:draft') || existingNotes.includes('pengeluaran:final')
        ? existingNotes
        : (existingNotes ? existingNotes + ',pengeluaran:draft' : 'pengeluaran:draft');
      const { error } = await supabase.from('pnl_reports')
        .upsert(mkPayload(false, user.id, notes), { onConflict: 'partner_name,branch,mpc_mp3,month,year' });
      if (error) { console.error('UPSERT:', error); throw error; }
      setReportStatus(p => ({ ...p, isFinalized: false, updatedAt: new Date().toISOString(), validationNotes: notes }));
      setIsFormDirty?.(false);
      toast$('success', 'Draft pengeluaran berhasil disimpan');
    } catch (err) { toast$('error', err.message || 'Gagal menyimpan draft'); }
    finally { setIsSaving(false); }
  };

  // ── Save Final ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir.');
      // Tandai pengeluaran:final, pertahankan status pendapatan jika ada
      const existingNotes = reportStatus.validationNotes ?? '';
      let parts = existingNotes ? existingNotes.split(',').filter(p => p && !p.startsWith('pengeluaran:')) : [];
      parts.push('pengeluaran:final');
      const notes = parts.join(',');
      const { error } = await supabase.from('pnl_reports')
        .upsert(mkPayload(true, user.id, notes), { onConflict: 'partner_name,branch,mpc_mp3,month,year' });
      if (error) throw error;
      const now = new Date().toISOString();
      setReportStatus({ isFinalized: true, finalizedAt: now, finalizedBy: user.id, validationNotes: notes, updatedAt: now });
      setIsFormDirty?.(false);
      setShowSubmit(false);
      onSaveSuccess?.();
      toast$('success', 'Laporan pengeluaran berhasil disimpan');
    } catch (err) { toast$('error', err.message || 'Gagal menyimpan laporan'); }
    finally { setIsSaving(false); }
  };

const updateVal = useCallback((section, id, field, val) => {
  setData(prev => {
    if (section === 'partnerExpense') {
      return { ...prev, partnerExpense: val };
    }

    return {
      ...prev,
      [section]: prev[section].map(i => {
        if (i.id !== id) return i;

        const updated = { ...i, [field]: val };

        // Jika user isi harga satuan duluan
        // dan qty masih 0/kosong → otomatis qty jadi 1
        if (
          field === 'price' &&
          val > 0 &&
          (!updated.qty || updated.qty === 0)
        ) {
          updated.qty = 1;
        }

        return updated;
      }),
    };
  });

  setIsFormDirty?.(true);
}, [setIsFormDirty]);

  // ── Upload helper ─────────────────────────────────────────────────────────
  const UploadZone = ({ fileState, setFileState, dragState, setDragState, inputId, t }) => (
    <div
      onDragOver={e => { e.preventDefault(); setDragState(true); }}
      onDragLeave={() => setDragState(false)}
      onDrop={e => { e.preventDefault(); setDragState(false); setFileState(e.dataTransfer.files[0]); }}
      style={{ border: `1.5px dashed ${dragState ? t.blue : t.line}`, borderRadius: 10, padding: '18px 14px', textAlign: 'center', background: dragState ? t.blueBg : 'transparent', transition: 'all 0.15s', cursor: 'pointer' }}
    >
      {!fileState ? (
        <label htmlFor={inputId} style={{ cursor: 'pointer', display: 'block' }}>
          <input type="file" id={inputId} style={{ display: 'none' }} onChange={e => setFileState(e.target.files[0])} />
          <Upload size={22} style={{ color: t.lo, margin: '0 auto 8px' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: t.mid }}>Upload Lampiran</div>
          <div style={{ fontSize: 11, color: t.lo, marginTop: 3 }}>PDF atau Excel</div>
        </label>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
          <FileCheck size={22} style={{ color: t.blue }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: t.hi, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{fileState.name}</div>
          <button onClick={() => setFileState(null)} style={{ fontSize: 11, fontWeight: 600, color: t.red, background: 'none', border: 'none', cursor: 'pointer' }}>Hapus File</button>
        </div>
      )}
    </div>
  );

  // ── Subtotal Banner — desain identik blueBg seperti FormPendapatan ─────────
  const SubtotalBanner = ({ label, value }) => (
    <div style={{ padding: '15px 20px', borderRadius: 12, background: t.blueBg, border: `1px solid ${t.blueBd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: t.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <Calculator size={16} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.blue }}>{label}</span>
      </div>
      <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: t.blue, fontVariantNumeric: 'tabular-nums' }}>{formatIDR(value)}</span>
    </div>
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) return (
    <>
      <G d={d} t={t} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 340, gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: t.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fpbreathe 1.8s ease-in-out infinite' }}>
          <ArrowUpRight size={22} color="#fff" style={{ transform: 'rotate(180deg)' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: t.mid }}>Memuat data...</span>
      </div>
    </>
  );

  const ctxMonth = activeContext?.month ?? '', ctxYear = activeContext?.year ?? '';
  const ctxType  = activeContext?.mpxType ?? '', ctxName = activeContext?.mpxName ?? '', ctxBranch = activeContext?.branch ?? '';
  const titleLine    = `Form Pengeluaran ${ctxMonth} ${ctxYear}`;
  const subtitleLine = [ctxType, ctxName, ctxBranch].filter(Boolean).join(' - ');

  // ── Parse validationNotes untuk status ────────────────────────────────────
  const notes = reportStatus.validationNotes ?? '';
  const hasPendapatanFinal = notes.includes('pendapatan:final');
  const hasPengeluaranFinal = notes.includes('pengeluaran:final');

  return (
    <div style={{ width: '100%', margin: '0 auto', paddingBottom: 108, fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',system-ui,sans-serif", WebkitFontSmoothing: 'antialiased', color: t.hi }}>
      <G d={d} t={t} />

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <div style={{ width: 46, height: 46, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.blueBg, color: t.blue, border: `1px solid ${t.blueBd}` }}>
          <ArrowUpRight size={25} style={{ transform: 'rotate(180deg)' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.035em', color: t.hi, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleLine}</div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: t.mid, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitleLine}</div>
        </div>
      </div>

      {/* ── STEPPER ── */}
      <Stepper step={step} setStep={setStep} t={t} d={d} />

      {/* ── TOAST ── */}
      <AnimatePresence>
        {toast.show && (
          <motion.div initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97 }} transition={{ duration: 0.17 }}
            style={{ position: 'fixed', top: 66, right: 16, zIndex: 999, width: 316, maxWidth: 'calc(100vw - 32px)' }}>
            <div style={{ background: t.card, border: `1px solid ${toast.type === 'success' ? t.greenBd : t.line}`, borderRadius: 12, boxShadow: t.lg, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '13px 15px' }}>
                <div style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: toast.type === 'success' ? t.green : t.red, color: '#fff' }}>
                  {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, letterSpacing: '-0.01em' }}>{toast.type === 'success' ? 'Berhasil' : 'Terjadi Kesalahan'}</div>
                  <div style={{ fontSize: 12, color: t.mid, marginTop: 3, lineHeight: 1.5 }}>{toast.msg}</div>
                </div>
                <button onClick={() => setToast(p => ({ ...p, show: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.lo, padding: 2, flexShrink: 0 }}><X size={13} /></button>
              </div>
              <motion.div initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: 4, ease: 'linear' }} style={{ height: 2, background: toast.type === 'success' ? t.green : t.red }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ STEPS ══════════ */}
      <AnimatePresence mode="wait">

        {/* STEP 1 — OPEX */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.17 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SecHero icon={Building2} step={1} title="OPEX Branch" t={t} />
            <ExpenseTable items={stats.opex.items} sectionKey="opex" onUpdate={updateVal} t={t} />
            <SubtotalBanner label="Subtotal OPEX" value={stats.opex.total} />
          </motion.div>
        )}

        {/* STEP 2 — SDM */}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.17 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SecHero icon={Users} step={2} title="SDM Branch" t={t} />
            <ExpenseTable items={stats.sdm.items} sectionKey="sdm" onUpdate={updateVal} t={t} />
            <SubtotalBanner label="Subtotal SDM" value={stats.sdm.total} />
          </motion.div>
        )}

        {/* STEP 3 — MARKETING + upload untuk Program Lain */}
        {step === 3 && (
          <motion.div key="s3" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.17 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SecHero icon={Megaphone} step={3} title="Marketing" t={t} />
            <ExpenseTable items={stats.marketing.items} sectionKey="marketing" onUpdate={updateVal} t={t} />

            {/* Upload lampiran untuk Program Lain */}
            <Card t={t}>
              <Body>
                <SecLabel t={t}>Lampiran Program Lain</SecLabel>
                <p style={{ fontSize: 12, color: t.mid, marginBottom: 12, lineHeight: 1.6 }}>
                  Jika ada program marketing lainnya, unggah dokumen pendukung di sini (PDF atau Excel).
                </p>
                <UploadZone fileState={mktFile} setFileState={setMktFile} dragState={mktDrag} setDragState={setMktDrag} inputId="mkt-up" t={t} />
              </Body>
            </Card>
            <SubtotalBanner label="Subtotal Marketing" value={stats.marketing.total} />
          </motion.div>
        )}

        {/* STEP 4 — COM */}
        {step === 4 && (
          <motion.div key="s4" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.17 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SecHero icon={Coins} step={4} title="Cost of Money" t={t} />
            <ExpenseTable items={stats.com.items} sectionKey="com" onUpdate={updateVal} t={t} />
            <SubtotalBanner label="Subtotal Cost of Money" value={stats.com.total} />
          </motion.div>
        )}

        {/* STEP 5 — REVIEW — SATU KOLOM */}
        {step === 5 && (
          <motion.div key="s5" initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.17 }}>
            <SecHero icon={FileText} step={5} title="Ringkasan Akhir" t={t} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Partner Expense */}
              <Card t={t}>
                <Body>
                  <SecLabel t={t}>Pengeluaran Partner</SecLabel>
                  <div style={{ padding: '14px 16px', borderRadius: 9, background: t.blueBg, border: `1px solid ${t.blueBd}`, marginBottom: 14 }}>
                    <label className="lbl" style={{ color: t.blue, marginBottom: 7 }}>Nominal Luar Template</label>
                    <LocalInput
                      numericValue={data.partnerExpense}
                      onChange={v => updateVal('partnerExpense', null, null, v)}
                      style={{ fontSize: 24, fontWeight: 800, color: t.blue, letterSpacing: '-0.04em', width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>
                  {/* Upload lampiran audit */}
                  <UploadZone fileState={file} setFileState={setFile} dragState={drag} setDragState={setDrag} inputId="fp-exp-up" t={t} />
                </Body>
              </Card>

              {/* Ringkasan Struktur — SATU KOLOM seperti FormPendapatan step 4 */}
              <Card t={t}>
                <Body>
                  <SecLabel t={t}>Ringkasan Struktur</SecLabel>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <SumRow icon={Building2} label="OPEX Branch"     value={stats.opex.total}      t={t} />
                    <SumRow icon={Users}     label="SDM Branch"      value={stats.sdm.total}       t={t} />
                    <SumRow icon={Megaphone} label="Marketing"       value={stats.marketing.total} t={t} />
                    <SumRow icon={Coins}     label="Cost of Money"   value={stats.com.total}       t={t} />
                    <SumRow icon={Banknote}  label="Partner Expense" value={data.partnerExpense}   t={t} highlight />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 16, marginTop: 4, borderTop: `2px solid ${t.blueBd}` }}>
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.blue }}>Total Pengeluaran</span>
                      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: t.blue, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                        {formatIDR(stats.grandTotal)}
                      </span>
                    </div>
                  </div>
                </Body>
              </Card>

              {/* Grand total hero — status dari DB */}
              <div style={{ padding: '34px 26px', borderRadius: 14, border: `1.5px solid ${t.blueBd}`, background: t.blueBg, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.blue, marginBottom: 13, opacity: 0.88 }}>
                  Total Pengeluaran Terakumulasi
                </div>
                <div style={{ fontSize: 'clamp(26px,6vw,58px)', fontWeight: 800, letterSpacing: '-0.04em', color: t.blue, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, marginBottom: 20, wordBreak: 'break-all' }}>
                  {formatIDR(stats.grandTotal)}
                </div>

                {/* Status dinamis dari DB */}
                {reportStatus.isFinalized ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 99, background: t.green, color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
                      <CheckCircle2 size={14} />Laporan Pengeluaran Tervalidasi
                    </div>
                    {reportStatus.finalizedAt && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.mid }}>
                        <Clock size={12} style={{ color: t.lo }} />
                        Disimpan: {fmtDate(reportStatus.finalizedAt)}
                      </div>
                    )}
                    {/* Badge status pendapatan */}
                    {hasPendapatanFinal && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 99, background: t.greenBg, border: `1px solid ${t.greenBd}`, fontSize: 11, color: t.green, fontWeight: 600 }}>
                        <CheckCircle2 size={11} />Form Pendapatan juga tervalidasi
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 99, background: t.blue + '20', border: `1px solid ${t.blueBd}`, color: t.blue, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
                      <Clock size={14} />Belum Difinalisasi
                    </div>
                    {reportStatus.updatedAt && (
                      <div style={{ fontSize: 11, color: t.mid }}>
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

      {/* ── FOOTER NAV — identik FormPendapatan ── */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, borderTop: `1px solid ${t.line}`, background: d ? 'rgba(7,9,13,0.94)' : 'rgba(255,255,255,0.94)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', zIndex: 60, padding: '11px 20px' }}>
        <div style={{   width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexShrink: 0 }}>
            {/* Save Draft — identik FormPendapatan */}
            <button onClick={handleSaveDraft} disabled={isSaving} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9,
              border: `1px solid ${t.line}`, background: t.pill,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
              color: t.mid, opacity: isSaving ? 0.58 : 1, transition: 'all 0.13s',
            }}>
              {isSaving ? <><Loader2 size={13} style={{ animation: 'fpspin 1s linear infinite' }} />Simpan...</> : <><Save size={13} />Draft</>}
            </button>

            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, border: `1px solid ${t.line}`, background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: t.mid, transition: 'all 0.13s' }}>
                <ArrowLeft size={13} />Kembali
              </button>
            )}

            {step < 5 ? (
              <button onClick={() => setStep(s => s + 1)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 9, background: t.blue, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', boxShadow: `0 2px 10px rgba(10,132,255,${d ? 0.36 : 0.20})`, transition: 'all 0.13s' }}>
                Lanjut <ArrowRight size={13} />
              </button>
            ) : (
              <button onClick={() => setShowSubmit(true)} disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 9, background: t.blue, color: '#fff', border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', boxShadow: `0 2px 10px rgba(10,132,255,${d ? 0.36 : 0.20})` }}>
                <Send size={13} />Simpan Laporan
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── SUBMIT POPUP ── */}
      <AnimatePresence>
        {showSubmit && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.74)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ duration: 0.14 }}
              style={{ maxWidth: 360, width: '100%', background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.lg, overflow: 'hidden' }}>
              <div style={{ padding: 28, textAlign: 'center' }}>
                <div style={{ width: 50, height: 50, borderRadius: 11, background: t.blueBg, border: `1px solid ${t.blueBd}`, margin: '0 auto 15px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.blue }}>
                  <ShieldCheck size={22} />
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.03em', color: t.hi, marginBottom: 7 }}>Simpan Laporan?</div>
                <div style={{ background: t.sub, borderRadius: 10, padding: '13px 16px', marginBottom: 18, border: `1px solid ${t.line}`, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[{ l:'Partner', v:ctxName }, { l:'Cabang', v:ctxBranch }, { l:'Periode', v:`${ctxMonth} ${ctxYear}` }].map(r => (
                    <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 11, color: t.lo }}>{r.l}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: t.hi, textAlign: 'right' }}>{r.v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: `1px solid ${t.lineH}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: t.blue }}>Total Expense</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: t.blue, fontVariantNumeric: 'tabular-nums' }}>{formatIDR(stats.grandTotal)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={handleSave} disabled={isSaving} style={{ width: '100%', padding: 12, background: t.blue, color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.7 : 1 }}>
                    {isSaving ? 'Menyimpan...' : 'Konfirmasi & Simpan'}
                  </button>
                  <button onClick={() => setShowSubmit(false)} style={{ width: '100%', padding: 12, background: 'transparent', color: t.mid, border: `1px solid ${t.line}`, borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Batal
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FormPengeluaran;