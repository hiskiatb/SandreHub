"use client";
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
  Eye, Ban, Package, Sparkles, Info, Flag, Lock,
  Pencil, History, ChevronDown, ChevronUp,
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

// ─── HPP Constants ────────────────────────────────────────────────────────────
const FACTORY_HPP = {
  sp1: 29000, sp2: 10000, sp3: 10000, sp4: 29000,
  v1: 300,   v2: 12600, v3: 19500, v4: 13750,
  v5: 16800, v6: 22400, v7: 24500, v8: 4500,
  v9: 6600,  v10: 8300, v11: 11600, v12: 12800,
  v13: 27900, v14: 500,
};
const MONTH_NUM = {
  Januari:1, Februari:2, Maret:3, April:4, Mei:5, Juni:6,
  Juli:7, Agustus:8, September:9, Oktober:10, November:11, Desember:12,
};
const monthScore = (month, year) => Number(year) * 100 + (MONTH_NUM[month] ?? 0);
const applyOverrides = (products, overrides) =>
  products.map(p => overrides[p.id] ? { ...p, hPokok: overrides[p.id].hpp } : p);

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg: d ? '#0D0D0E' : '#F5F5F6', card: d ? '#1A1A1D' : '#FFFFFF',
  sub: d ? '#202024' : '#F2F2F4', hover: d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
  line: d ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)',
  lineH: d ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  hi: d ? '#F2F2F3' : '#18181B', mid: d ? '#8A8A96' : '#52525B', lo: d ? '#4D4D58' : '#A1A1AA',
  blue: '#ED1C24', blueBg: d ? 'rgba(237,28,36,0.12)' : 'rgba(237,28,36,0.07)',
  blueBd: d ? 'rgba(237,28,36,0.28)' : 'rgba(237,28,36,0.20)',
  green: d ? '#32BCAD' : '#1A9E90', greenBg: d ? 'rgba(50,188,173,0.13)' : 'rgba(50,188,173,0.09)',
  greenBd: d ? 'rgba(50,188,173,0.30)' : 'rgba(50,188,173,0.22)',
  amber: d ? '#FFCB05' : '#C49A00', amberBg: d ? 'rgba(255,203,5,0.12)' : 'rgba(255,203,5,0.09)',
  amberBd: d ? 'rgba(255,203,5,0.28)' : 'rgba(255,203,5,0.22)',
  red: d ? '#FF6B6B' : '#DC2626', redBg: d ? 'rgba(255,107,107,0.12)' : 'rgba(220,38,38,0.07)',
  redBd: d ? 'rgba(255,107,107,0.28)' : 'rgba(220,38,38,0.20)',
  magenta: '#C6168D', magentaBg: d ? 'rgba(198,22,141,0.12)' : 'rgba(198,22,141,0.07)',
  magentaBd: d ? 'rgba(198,22,141,0.28)' : 'rgba(198,22,141,0.18)',
  violet: d ? '#A78BFA' : '#7C3AED', violetBg: d ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.07)',
  violetBd: d ? 'rgba(167,139,250,0.28)' : 'rgba(124,58,237,0.18)',
  inputBg: d ? 'rgba(255,255,255,0.05)' : '#FFFFFF', inputBd: d ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.13)',
  roBg: d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)', roBd: d ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
  sm: d ? '0 1px 2px rgba(0,0,0,0.55)' : '0 1px 2px rgba(26,26,29,0.06)',
  md: d ? '0 6px 18px rgba(0,0,0,0.50)' : '0 6px 18px rgba(26,26,29,0.09)',
  lg: d ? '0 20px 48px rgba(0,0,0,0.65)' : '0 20px 48px rgba(26,26,29,0.14)',
  disabledBg: d ? 'rgba(100,100,120,0.10)' : 'rgba(100,100,120,0.07)',
  disabledBd: d ? 'rgba(100,100,120,0.22)' : 'rgba(100,100,120,0.18)',
  disabledColor: d ? '#7A7A8A' : '#7878A0',
  info: d ? '#60C8F0' : '#0284C7', infoBg: d ? 'rgba(96,200,240,0.10)' : 'rgba(2,132,199,0.07)',
  infoBd: d ? 'rgba(96,200,240,0.25)' : 'rgba(2,132,199,0.18)',
  spm: d ? '#A78BFA' : '#7C3AED', spmBg: d ? 'rgba(167,139,250,0.10)' : 'rgba(124,58,237,0.06)',
  spmBd: d ? 'rgba(167,139,250,0.26)' : 'rgba(124,58,237,0.18)',
});

// ─── LocalInput ───────────────────────────────────────────────────────────────
const LocalInput = React.memo(({ numericValue, onChange, style, placeholder, className, readOnly }) => {
  const [display, setDisplay] = useState(() => numericValue === 0 ? '' : toSep(numericValue));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDisplay(numericValue === 0 ? '' : toSep(numericValue)); }, [numericValue]);
  return (
    <input type="text" inputMode={readOnly ? 'text' : 'numeric'}
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

const TextInput = React.memo(({ value, onChange, placeholder, className, readOnly, style }) => (
  <input type="text" value={value} placeholder={placeholder}
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
    textarea { font-family: inherit; font-size: 14px; resize: vertical; }
    .fpi { width: 100%; background: ${t.inputBg}; border: 1px solid ${t.inputBd}; border-radius: 9px; padding: 10px 13px; font-weight: 600; color: ${t.hi}; outline: none; transition: border-color 0.14s; font-family: inherit; letter-spacing: -0.01em; -webkit-font-smoothing: antialiased; box-sizing: border-box; }
    .fpi:focus { border-color: #ED1C24; box-shadow: 0 0 0 3px rgba(237,28,36,0.14); }
    .fpi::placeholder { color: ${t.lo}; font-weight: 400; }
    .fpi-c { text-align: center; }
    .fpi-sm { padding: 8px 8px; }
    .fpi-lg { font-size: 17px !important; font-weight: 700; padding: 13px; }
    .fpi-ro { width: 100%; background: ${t.roBg}; border: 1px solid ${t.roBd}; border-radius: 9px; padding: 10px 13px; font-weight: 600; color: ${t.hi}; font-family: inherit; letter-spacing: -0.01em; box-sizing: border-box; pointer-events: none; user-select: text; outline: none; }
    .fpi-ro-sm { padding: 8px 6px; text-align: center; }
    .fpi-ro-lg { font-size: 17px !important; font-weight: 700; padding: 13px; }
    .fpi-hpp { width: 100%; background: ${t.inputBg}; border: 1px solid ${t.inputBd}; border-radius: 9px; padding: 8px 8px; font-weight: 600; color: ${t.hi}; outline: none; transition: border-color 0.14s; font-family: inherit; font-size: 13px !important; box-sizing: border-box; text-align: right; }
    .fpi-hpp:focus { border-color: #ED1C24; box-shadow: 0 0 0 3px rgba(237,28,36,0.14); }
    .fpi-hpp::placeholder { color: ${t.lo}; font-weight: 400; font-size: 11px !important; }
    .fpi-hpp-ro { width: 100%; background: ${t.roBg}; border: 1px solid ${t.roBd}; border-radius: 9px; padding: 8px 8px; font-weight: 500; color: ${t.lo}; font-family: inherit; font-size: 13px !important; box-sizing: border-box; pointer-events: none; user-select: text; outline: none; text-align: right; }
    .fpi-hpp-overridden { width: 100%; background: ${d ? 'rgba(50,188,173,0.12)' : 'rgba(50,188,173,0.08)'}; border: 1px solid ${d ? 'rgba(50,188,173,0.35)' : 'rgba(50,188,173,0.28)'}; border-radius: 9px; padding: 8px 8px; font-weight: 600; color: ${d ? '#32BCAD' : '#1A9E90'}; font-family: inherit; font-size: 13px !important; box-sizing: border-box; pointer-events: none; user-select: text; outline: none; text-align: right; }
    .fpi-hpp-modal { width: 100%; background: ${t.inputBg}; border: 1px solid ${t.inputBd}; border-radius: 8px; padding: 8px 10px; font-weight: 600; color: ${t.hi}; outline: none; transition: border-color 0.14s, background 0.14s; font-family: inherit; font-size: 13px !important; box-sizing: border-box; text-align: right; }
    .fpi-hpp-modal:focus { border-color: #32BCAD; box-shadow: 0 0 0 3px rgba(50,188,173,0.14); }
    .fpi-hpp-modal.changed { background: ${d ? 'rgba(255,203,5,0.10)' : 'rgba(255,203,5,0.09)'}; border-color: ${d ? 'rgba(255,203,5,0.40)' : 'rgba(255,203,5,0.45)'}; color: ${t.amber}; }
    .fpi-name { width: 100%; background: ${t.inputBg}; border: 1px solid ${t.inputBd}; border-radius: 9px; padding: 8px 8px; font-weight: 700; color: ${t.hi}; outline: none; transition: border-color 0.14s; font-family: inherit; font-size: 13px !important; box-sizing: border-box; letter-spacing: -0.01em; }
    .fpi-name:focus { border-color: #ED1C24; box-shadow: 0 0 0 3px rgba(237,28,36,0.14); }
    .fpi-name::placeholder { color: ${t.lo}; font-weight: 400; font-size: 11px !important; }
    .fpi-spm { width: 100%; background: ${t.spmBg}; border: 1px solid ${t.spmBd}; border-radius: 9px; padding: 10px 13px; font-weight: 600; color: ${t.hi}; outline: none; transition: border-color 0.14s; font-family: inherit; letter-spacing: -0.01em; box-sizing: border-box; }
    .fpi-spm:focus { border-color: ${t.spm}; box-shadow: 0 0 0 3px rgba(167,139,250,0.14); }
    .fpi-spm::placeholder { color: ${t.lo}; font-weight: 400; }
    .fpi-spm-ro { width: 100%; background: ${t.spmBg}; border: 1px solid ${t.spmBd}; border-radius: 9px; padding: 10px 13px; font-weight: 600; color: ${t.hi}; font-family: inherit; letter-spacing: -0.01em; box-sizing: border-box; pointer-events: none; user-select: text; outline: none; }
    .fpi-spm-ro-lg { font-size: 17px !important; font-weight: 700; padding: 13px; }
    .custom-row-highlight:hover td { background: ${d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.018)'} !important; }
    .lbl { display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: ${t.mid}; margin-bottom: 6px; }
    .vc-table { display: none; }
    .vc-cards { display: flex; flex-direction: column; gap: 8px; }
    @media (min-width: 860px) { .vc-table { display: block; } .vc-cards { display: none !important; } }
    @media (min-width: 580px) { .g2 { grid-template-columns: 1fr 1fr !important; } }
    @media (min-width: 960px) { .g4sp { grid-template-columns: 1fr 1fr !important; } .gsf { grid-template-columns: 1fr 1fr !important; } }
    @keyframes fpbreathe { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.38; transform:scale(0.9); } }
    @keyframes fpspin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    .vc-add-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 9px; border-radius: 7px; border: 1px dashed ${t.blueBd}; background: ${t.blueBg}; color: ${t.blue}; cursor: pointer; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; transition: all 0.14s; font-family: inherit; white-space: nowrap; flex-shrink: 0; min-width: 38px; }
    .vc-add-btn:hover { background: ${t.blue}; color: #fff; border-color: ${t.blue}; border-style: solid; }
    .vc-rm-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 7px; border: 1px solid ${t.line}; background: transparent; color: ${t.red}; cursor: pointer; transition: all 0.14s; flex-shrink: 0; font-family: inherit; }
    .vc-rm-btn:hover { background: ${d ? 'rgba(255,107,107,0.10)' : 'rgba(220,38,38,0.08)'}; border-color: ${t.red}; }
    .vc-entry-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 99px; background: ${t.magentaBg}; color: ${t.magenta}; border: 1px solid ${t.magentaBd}; font-size: 9px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
    .custom-tag { display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 99px; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; background: ${d ? 'rgba(167,139,250,0.15)' : '#EDE9FE'}; color: ${d ? '#A78BFA' : '#5B21B6'}; border: 0.5px solid ${d ? 'rgba(167,139,250,0.35)' : '#C4B5FD'}; }
    .fp-btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; border-radius: 9px; background: linear-gradient(135deg, #ED1C24 0%, #C6168D 100%); color: #fff; border: none; cursor: pointer; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; box-shadow: 0 2px 10px rgba(237,28,36,0.30); font-family: inherit; transition: all 0.14s; white-space: nowrap; flex-shrink: 0; }
    .fp-btn-primary:hover { box-shadow: 0 4px 18px rgba(237,28,36,0.42); transform: translateY(-1px); }
    .fp-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }
    .fp-btn-ghost { display: inline-flex; align-items: center; gap: 6px; padding: 9px 13px; border-radius: 9px; border: 1px solid ${t.line}; background: ${t.sub}; cursor: pointer; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: ${t.mid}; transition: all 0.13s; font-family: inherit; white-space: nowrap; flex-shrink: 0; }
    .fp-btn-ghost:hover { border-color: ${t.blue}; color: ${t.blue}; }
    .fp-btn-teal { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; border-radius: 9px; background: linear-gradient(135deg, #32BCAD 0%, #1A9E90 100%); color: #fff; border: none; cursor: pointer; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; box-shadow: 0 2px 10px rgba(50,188,173,0.28); font-family: inherit; transition: all 0.14s; white-space: nowrap; flex-shrink: 0; }
    .fp-btn-teal:hover { box-shadow: 0 4px 18px rgba(50,188,173,0.40); transform: translateY(-1px); }
    .fp-btn-teal:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
    .btn-add-custom { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 9px; border: 1.5px dashed ${t.violetBd}; background: ${t.violetBg}; color: ${t.violet}; cursor: pointer; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; transition: all 0.15s; font-family: inherit; }
    .btn-add-custom:hover { background: ${t.violet}; color: #fff; border-style: solid; transform: translateY(-1px); }
    .btn-add-custom:disabled { opacity: 0.38; cursor: not-allowed; transform: none; }
    .btn-report { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 7px; border: 1px solid ${t.redBd}; background: ${t.redBg}; color: ${t.red}; cursor: pointer; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; transition: all 0.13s; font-family: inherit; white-space: nowrap; }
    .btn-report:hover { background: ${t.red}; color: #fff; }
    .btn-edit-hpp { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; border: 1px solid ${d ? 'rgba(50,188,173,0.35)' : 'rgba(50,188,173,0.30)'}; background: ${d ? 'rgba(50,188,173,0.12)' : 'rgba(50,188,173,0.08)'}; color: ${d ? '#32BCAD' : '#1A9E90'}; cursor: pointer; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; transition: all 0.13s; font-family: inherit; white-space: nowrap; flex-shrink: 0; }
    .btn-edit-hpp:hover { background: #32BCAD; color: #fff; border-color: #32BCAD; }
    .hpp-override-tag { display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 99px; background: ${d ? 'rgba(50,188,173,0.14)' : 'rgba(50,188,173,0.10)'}; color: ${d ? '#32BCAD' : '#1A9E90'}; border: 1px solid ${d ? 'rgba(50,188,173,0.30)' : 'rgba(50,188,173,0.25)'}; font-size: 9px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; flex-shrink: 0; }
    .hpp-modal-row { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-bottom: 1px solid ${t.lineH}; }
    .hpp-section-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; border-bottom: 1px solid ${t.lineH}; cursor: pointer; padding: 12px 0; font-family: inherit; }
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

function SpmBadge({ t }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', background: t.spmBg, border: `1px solid ${t.spmBd}`, color: t.spm }}>
      <Lock size={8} />Diisi Tim SPM
    </span>
  );
}

function LastUpdatedInfo({ info, updatedAt, t }) {
  const dateStr = info?.at || updatedAt;
  if (!dateStr) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 10, color: t.lo }}>
      <Clock size={9} style={{ color: t.lo, flexShrink: 0 }} />
      <span>Terakhir diperbarui: <strong style={{ color: t.mid }}>{fmtDate(dateStr)}</strong>{info?.by && <span style={{ color: t.lo }}> · {info.by}</span>}</span>
    </div>
  );
}

function SpmField({ label, children, info, updatedAt, onReport, canReport, t }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 10, background: t.spmBg, border: `1px solid ${t.spmBd}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: t.spm, margin: 0 }}>{label}</label>
          <SpmBadge t={t} />
        </div>
        {canReport && (
          <button className="btn-report" onClick={onReport}><Flag size={9} />Laporkan</button>
        )}
      </div>
      {children}
      <LastUpdatedInfo info={info} updatedAt={updatedAt} t={t} />
    </div>
  );
}

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

const TABLE_HEAD = [
  { h: 'Produk', al: 'left', w: '24%' },
  { h: 'HPP / unit', al: 'right', w: '16%' },
  { h: 'Qty', al: 'center', w: '13%' },
  { h: 'Retail', al: 'right', w: '16%' },
  { h: 'Margin', al: 'right', w: '23%' },
  { h: '', al: 'center', w: '8%' },
];

function ProductRowDesktop({ item, entryIdx, section, onUpdate, onAddEntry, onRemoveEntry, t, readOnly, hppOverrides }) {
  const isE1 = entryIdx === 1;
  const qty = isE1 ? item.qty : item.qty2;
  const hRetail = isE1 ? item.hRetail : item.hRetail2;
  const margin = isE1 ? item.margin : item.margin2;
  const pctMg = isE1 ? item.pctMargin : item.pctMargin2;
  const isOverridden = Boolean(hppOverrides?.[item.id]);
  if (readOnly && qty === 0 && hRetail === 0) return null;
  return (
    <tr className="fin-tr" style={{ borderBottom: `1px solid ${t.lineH}` }}>
      <td style={{ padding: '11px 10px', verticalAlign: 'middle' }}>
        <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>
          {item.name}{!isE1 && <span className="vc-entry-tag" style={{ marginLeft: 8 }}>Entry 2</span>}
        </div>
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        <div style={{ position: 'relative' }}>
          <input readOnly tabIndex={-1}
            value={new Intl.NumberFormat('id-ID').format(item.hPokok)}
            className={isOverridden ? 'fpi-hpp-overridden' : 'fpi-hpp-ro'}
            style={{ fontFamily: 'inherit' }}
          />
          {isOverridden && (
            <div style={{ position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: '50%', background: '#32BCAD', border: '1.5px solid white', zIndex: 1 }} />
          )}
        </div>
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        <LocalInput numericValue={qty} onChange={v => onUpdate(section, item.id, isE1 ? 'qty' : 'qty2', v)} className={readOnly ? 'fpi fpi-ro fpi-c fpi-sm' : 'fpi fpi-c fpi-sm'} readOnly={readOnly} />
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        <LocalInput numericValue={hRetail} onChange={v => onUpdate(section, item.id, isE1 ? 'hRetail' : 'hRetail2', v)} className={readOnly ? 'fpi fpi-ro fpi-sm' : 'fpi fpi-sm'} readOnly={readOnly} />
      </td>
      <td style={{ padding: '11px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
        <div style={{ fontWeight: 700, color: margin < 0 ? t.red : qty > 0 ? t.green : t.lo, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{qty > 0 ? formatIDR(margin) : '—'}</div>
        {qty > 0 && pctMg !== 0 && <div style={{ fontSize: 10, color: t.lo, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{formatPct(pctMg)}</div>}
      </td>
      <td style={{ padding: '11px 4px', textAlign: 'center', verticalAlign: 'middle', overflow: 'hidden' }}>
        {!readOnly && (isE1 ? (!item.hasEntry2 && <button className="vc-add-btn" onClick={() => onAddEntry(section, item.id)}><Plus size={11} /> 2</button>) : (<button className="vc-rm-btn" onClick={() => onRemoveEntry(section, item.id)}><Trash2 size={13} /></button>))}
      </td>
    </tr>
  );
}

function CustomSPRowDesktop({ item, onUpdate, onRemove, t, readOnly }) {
  const margin = (item.qty || 0) * ((item.hRetail || 0) - (item.hPokok || 0));
  const jual = (item.qty || 0) * (item.hRetail || 0);
  const pct = jual > 0 ? (margin / jual) * 100 : 0;
  if (readOnly && !item.qty && !item.hRetail) return null;
  return (
    <tr className="custom-row-highlight" style={{ borderBottom: `1px solid ${t.lineH}` }}>
      <td style={{ padding: '11px 10px', verticalAlign: 'middle' }}>
        {readOnly ? <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{item.name || '—'}</div>
          : <TextInput value={item.name} onChange={v => onUpdate(item.id, 'name', v)} placeholder="Nama produk..." className="fpi-name" />}
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        {readOnly ? <input readOnly tabIndex={-1} value={new Intl.NumberFormat('id-ID').format(item.hPokok || 0)} className="fpi-hpp-ro" style={{ fontFamily: 'inherit' }} />
          : <LocalInput numericValue={item.hPokok} onChange={v => onUpdate(item.id, 'hPokok', v)} className="fpi-hpp" placeholder="HPP / unit" />}
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        <LocalInput numericValue={item.qty} onChange={v => onUpdate(item.id, 'qty', v)} className={readOnly ? 'fpi fpi-ro fpi-c fpi-sm' : 'fpi fpi-c fpi-sm'} readOnly={readOnly} />
      </td>
      <td style={{ padding: '11px 6px', verticalAlign: 'middle' }}>
        <LocalInput numericValue={item.hRetail} onChange={v => onUpdate(item.id, 'hRetail', v)} className={readOnly ? 'fpi fpi-ro fpi-sm' : 'fpi fpi-sm'} readOnly={readOnly} />
      </td>
      <td style={{ padding: '11px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
        <div style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: item.qty === 0 ? t.lo : margin < 0 ? t.red : t.green }}>{item.qty === 0 ? '—' : formatIDR(margin)}</div>
        {item.qty > 0 && pct !== 0 && <div style={{ fontSize: 10, color: t.lo, marginTop: 2 }}>{formatPct(pct)}</div>}
      </td>
      <td style={{ padding: '11px 4px', textAlign: 'center', verticalAlign: 'middle', overflow: 'hidden' }}>
        {!readOnly && <button className="vc-rm-btn" onClick={() => onRemove(item.id)}><Trash2 size={12} /></button>}
      </td>
    </tr>
  );
}

const MobLabel = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#8A8A96', marginBottom: 4 }}>{children}</div>
);
const MobMarginRow = ({ margin, qty, t, inline }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, ...(inline ? {} : { padding: '6px 0', borderTop: `0.5px solid ${t.lineH}`, marginTop: 4 }) }}>
    <span style={{ fontSize: 11, color: t.lo }}>Margin</span>
    <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: qty === 0 ? t.lo : margin < 0 ? t.red : t.green }}>{qty === 0 ? '—' : formatIDR(margin)}</span>
  </div>
);

function CustomSPCardMobile({ item, onUpdate, onRemove, t, readOnly }) {
  const margin = (item.qty || 0) * ((item.hRetail || 0) - (item.hPokok || 0));
  if (readOnly && !item.qty && !item.hRetail && !item.name) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
      style={{ borderRadius: 10, border: `0.5px solid ${t.line}`, background: t.card, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '10px 12px' }}>
        <div><MobLabel>Nama produk</MobLabel>
          {readOnly ? <div style={{ fontSize: 13, fontWeight: 600, color: t.hi, padding: '6px 0' }}>{item.name || '—'}</div>
            : <TextInput value={item.name} onChange={v => onUpdate(item.id, 'name', v)} placeholder="cth: SP 5GB" className="fpi-name" />}
        </div>
        <div><MobLabel>HPP / unit</MobLabel>
          {readOnly ? <input readOnly tabIndex={-1} value={new Intl.NumberFormat('id-ID').format(item.hPokok || 0)} className="fpi-hpp-ro" style={{ fontFamily: 'inherit', textAlign: 'right' }} />
            : <LocalInput numericValue={item.hPokok} onChange={v => onUpdate(item.id, 'hPokok', v)} className="fpi-hpp" placeholder="HPP / unit" />}
        </div>
        <div><MobLabel>Qty</MobLabel><LocalInput numericValue={item.qty} onChange={v => onUpdate(item.id, 'qty', v)} className={readOnly ? 'fpi fpi-ro fpi-c fpi-sm' : 'fpi fpi-c fpi-sm'} readOnly={readOnly} /></div>
        <div><MobLabel>Retail</MobLabel><LocalInput numericValue={item.hRetail} onChange={v => onUpdate(item.id, 'hRetail', v)} className={readOnly ? 'fpi fpi-ro fpi-sm' : 'fpi fpi-sm'} readOnly={readOnly} /></div>
      </div>
      <div style={{ padding: '0 12px 8px', paddingTop: 6, borderTop: `0.5px solid ${t.lineH}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <MobMarginRow margin={margin} qty={item.qty} t={t} inline />
        {!readOnly && <button className="vc-rm-btn" onClick={() => onRemove(item.id)} style={{ marginLeft: 12, flexShrink: 0 }}><Trash2 size={12} /></button>}
      </div>
    </motion.div>
  );
}

function ProductCardMobile({ item, section, onUpdate, onAddEntry, onRemoveEntry, t, readOnly, hppOverrides }) {
  const hasAnyData = item.qty > 0 || item.hRetail > 0 || item.qty2 > 0 || item.hRetail2 > 0;
  if (readOnly && !hasAnyData) return null;
  const isOverridden = Boolean(hppOverrides?.[item.id]);
  const grid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
  const cardStyle = { borderRadius: 10, border: `0.5px solid ${t.line}`, background: t.card, overflow: 'hidden', marginBottom: 0 };
  const renderBlock = (isE1) => {
    const qty = isE1 ? item.qty : item.qty2;
    const retail = isE1 ? item.hRetail : item.hRetail2;
    const margin = isE1 ? item.margin : item.margin2;
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
          <div><MobLabel>Produk</MobLabel><input readOnly tabIndex={-1} value={item.name} style={{ width: '100%', height: 32, padding: '0 8px', border: `0.5px solid ${t.roBd}`, borderRadius: 8, background: t.roBg, color: t.lo, fontSize: 12, fontWeight: 500, fontFamily: 'inherit', outline: 'none' }} /></div>
          <div>
            <MobLabel>HPP / unit</MobLabel>
            <div style={{ position: 'relative' }}>
              <input readOnly tabIndex={-1}
                value={new Intl.NumberFormat('id-ID').format(item.hPokok)}
                style={{ width: '100%', height: 32, padding: '0 8px', border: `0.5px solid ${isOverridden ? 'rgba(50,188,173,0.35)' : t.roBd}`, borderRadius: 8, background: isOverridden ? 'rgba(50,188,173,0.10)' : t.roBg, color: isOverridden ? '#32BCAD' : t.lo, fontSize: 12, fontWeight: isOverridden ? 600 : 500, fontFamily: 'inherit', textAlign: 'right', outline: 'none' }}
              />
              {isOverridden && <div style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: '#32BCAD', border: '1.5px solid white', zIndex: 1 }} />}
            </div>
          </div>
          <div><MobLabel>Qty</MobLabel><LocalInput numericValue={qty} onChange={v => onUpdate(section, item.id, isE1 ? 'qty' : 'qty2', v)} className={readOnly ? 'fpi fpi-ro fpi-c fpi-sm' : 'fpi fpi-c fpi-sm'} readOnly={readOnly} /></div>
          <div><MobLabel>Retail</MobLabel><LocalInput numericValue={retail} onChange={v => onUpdate(section, item.id, isE1 ? 'hRetail' : 'hRetail2', v)} className={readOnly ? 'fpi fpi-ro fpi-sm' : 'fpi fpi-sm'} readOnly={readOnly} /></div>
        </div>
        <div style={{ padding: '0 12px 10px' }}><MobMarginRow margin={margin} qty={qty} t={t} /></div>
      </div>
    );
  };
  return (
    <div style={cardStyle}>
      {renderBlock(true)}{item.hasEntry2 && renderBlock(false)}
      {!readOnly && (
        <div style={{ padding: '6px 12px 8px', borderTop: `0.5px solid ${t.lineH}`, display: 'flex', justifyContent: 'flex-end' }}>
          {!item.hasEntry2 && <button className="vc-add-btn" onClick={() => onAddEntry(section, item.id)}><Plus size={11} /> Entry 2</button>}
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

// ─── HPP Edit Modal ───────────────────────────────────────────────────────────
function HppEditModal({ data, hppDraft, setHppDraft, hppOverrides, hppSaving, onSave, onClose, t, d, activeContext }) {
  const [spOpen, setSpOpen] = useState(true);
  const [vcOpen, setVcOpen] = useState(true);

  const changedCount = useMemo(() =>
    [...data.sp, ...data.vc].filter(p => hppDraft[p.id] !== undefined && hppDraft[p.id] !== p.hPokok).length,
    [data.sp, data.vc, hppDraft]);

  const renderRow = (p) => {
    const isOverridden = Boolean(hppOverrides?.[p.id]);
    const override = hppOverrides?.[p.id];
    const draftVal = hppDraft[p.id] ?? p.hPokok;
    const isDraftChanged = draftVal !== p.hPokok;
    const factoryVal = FACTORY_HPP[p.id];
    return (
      <div key={p.id} className="hpp-modal-row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: t.hi, lineHeight: 1.3 }}>{p.name}</span>
            {isOverridden
              ? <span className="hpp-override-tag"><History size={8} />{override.effectiveMonth} {override.effectiveYear}</span>
              : <span style={{ fontSize: 9, color: t.lo, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Factory</span>}
            {isDraftChanged && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 6px', borderRadius: 99, background: t.amberBg, border: `1px solid ${t.amberBd}`, color: t.amber, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Diubah</span>}
          </div>
          {factoryVal !== undefined && (
            <div style={{ fontSize: 10, color: t.lo }}>
              Factory: {new Intl.NumberFormat('id-ID').format(factoryVal)}
              {isOverridden && <span style={{ marginLeft: 6 }}>· Saat ini: {new Intl.NumberFormat('id-ID').format(p.hPokok)}</span>}
            </div>
          )}
        </div>
        <div style={{ width: 128, flexShrink: 0 }}>
          <LocalInput
            numericValue={draftVal}
            onChange={v => setHppDraft(prev => ({ ...prev, [p.id]: v }))}
            className={`fpi-hpp-modal${isDraftChanged ? ' changed' : ''}`}
          />
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
      onClick={() => { if (!hppSaving) onClose(); }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 340 }}
        style={{ width: '100%', maxHeight: '90vh', background: t.card, borderRadius: '18px 18px 0 0', border: `1px solid ${t.line}`, boxShadow: t.lg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#32BCAD,#1A9E90)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}><Pencil size={18} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: t.hi, letterSpacing: '-0.02em' }}>Edit HPP Default</div>
              <div style={{ fontSize: 11, color: t.mid, marginTop: 2 }}>{activeContext?.month} {activeContext?.year} · berlaku bulan ini ke depan</div>
            </div>
            <button onClick={() => { if (!hppSaving) onClose(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.lo, padding: 4, display: 'flex' }}><X size={16} /></button>
          </div>
          <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 9, background: t.amberBg, border: `1px solid ${t.amberBd}`, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <History size={13} style={{ color: t.amber, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 11, color: t.amber, lineHeight: 1.55 }}>
              <strong>Cascade HPP:</strong> Harga yang ditetapkan untuk {activeContext?.month} {activeContext?.year} otomatis digunakan di semua bulan berikutnya hingga ada penetapan baru.
            </div>
          </div>
        </div>
        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
          <button className="hpp-section-toggle" onClick={() => setSpOpen(v => !v)}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.mid }}>Starter Pack (SP) · {data.sp.length} produk</span>
            {spOpen ? <ChevronUp size={14} style={{ color: t.lo }} /> : <ChevronDown size={14} style={{ color: t.lo }} />}
          </button>
          <AnimatePresence initial={false}>
            {spOpen && (
              <motion.div key="sp-body" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.17 }}>
                {data.sp.map(renderRow)}
              </motion.div>
            )}
          </AnimatePresence>
          <button className="hpp-section-toggle" onClick={() => setVcOpen(v => !v)} style={{ marginTop: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.mid }}>Voucher (VC) · {data.vc.length} produk</span>
            {vcOpen ? <ChevronUp size={14} style={{ color: t.lo }} /> : <ChevronDown size={14} style={{ color: t.lo }} />}
          </button>
          <AnimatePresence initial={false}>
            {vcOpen && (
              <motion.div key="vc-body" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.17 }}>
                {data.vc.map(renderRow)}
              </motion.div>
            )}
          </AnimatePresence>
          <div style={{ height: 16 }} />
        </div>
        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: changedCount > 0 ? t.amber : t.lo }}>
            {changedCount > 0 ? `${changedCount} produk diubah` : 'Belum ada perubahan'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { if (!hppSaving) onClose(); }} className="fp-btn-ghost" disabled={hppSaving}>Batal</button>
            <button onClick={onSave} className="fp-btn-teal" disabled={changedCount === 0 || hppSaving}>
              {hppSaving ? <><Loader2 size={13} style={{ animation: 'fpspin 1s linear infinite' }} />Menyimpan…</> : <><Pencil size={13} />Simpan HPP</>}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
const FormPendapatan = ({
  onUpdate, theme, setIsFormDirty, activeContext, onSaveSuccess, readOnly = false,
  disabledMonths = new Set(), onMonthChange, userRole = '',
}) => {
  const [step, setStep] = useState(1);
  const [showSubmit, setShowSubmit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploadingAtt, setUploadingAtt] = useState(false);
  const [drag, setDrag] = useState(false);
  const [toast, setToast] = useState({ show: false, type: 'success', msg: '' });
  const [reportStatus, setReportStatus] = useState({ isFinalized: false, finalizedAt: null, finalizedBy: null, validationNotes: null, updatedAt: null });
  const [spmFieldsInfo, setSpmFieldsInfo] = useState({ realtimeMargin: null, backMargin: null, slaFee: null, specialProgram: null, champions: null });
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportField, setReportField] = useState(null);
  const [reportMsg, setReportMsg] = useState('');
  const [reportSending, setReportSending] = useState(false);
  // HPP state
  const [hppOverrides, setHppOverrides] = useState({});
  const [showHppModal, setShowHppModal] = useState(false);
  const [hppDraft, setHppDraft] = useState({});
  const [hppSaving, setHppSaving] = useState(false);

  const d = theme === 'dark';
  const t = mk(d);
  const toast$ = (type, msg) => { setToast({ show: true, type, msg }); setTimeout(() => setToast(p => ({ ...p, show: false })), 4000); };
  const currentMonth = activeContext?.month ?? '';
  const monthDisabled = Boolean(currentMonth && disabledMonths.has(currentMonth));
  const effectiveReadOnly = readOnly || monthDisabled;
  const isSPMUser = userRole === 'spm_sumatera';
  const spmFieldReadOnly = effectiveReadOnly || !isSPMUser;
  const canReportDispute = !effectiveReadOnly && !isSPMUser && userRole === 'finance_mpx';
  const activeHppOverrideCount = Object.keys(hppOverrides).length;

  const defaults = useCallback(() => ({
    sp: [
      { id: 'sp1', dbQty: 'qty_sp_3gb_im3',  dbRetail: 'retail_sp_3gb_im3',  dbQty2: 'qty_sp_3gb_im3_2',  dbRetail2: 'retail_sp_3gb_im3_2',  name: 'SP 3GB IM3',  hPokok: FACTORY_HPP.sp1, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'sp2', dbQty: 'qty_sp_0_im3',     dbRetail: 'retail_sp_0_im3',     dbQty2: 'qty_sp_0_im3_2',     dbRetail2: 'retail_sp_0_im3_2',     name: 'SP 0 IM3',     hPokok: FACTORY_HPP.sp2, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'sp3', dbQty: 'qty_sp_kpk_3id',   dbRetail: 'retail_sp_kpk_3id',   dbQty2: 'qty_sp_kpk_3id_2',   dbRetail2: 'retail_sp_kpk_3id_2',   name: 'SP KPK 3ID',   hPokok: FACTORY_HPP.sp3, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'sp4', dbQty: 'qty_sp_3gb_3id',   dbRetail: 'retail_sp_3gb_3id',   dbQty2: 'qty_sp_3gb_3id_2',   dbRetail2: 'retail_sp_3gb_3id_2',   name: 'SP 3GB 3ID',   hPokok: FACTORY_HPP.sp4, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
    ],
    spCustom: [],
    vc: [
      { id: 'v1',  dbQty: 'qty_vc_0_im3',       dbRetail: 'retail_vc_0_im3',       dbQty2: 'qty_vc_0_im3_2',       dbRetail2: 'retail_vc_0_im3_2',       name: 'VC 0 IM3',       hPokok: FACTORY_HPP.v1,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v2',  dbQty: 'qty_vc_2_5gb',        dbRetail: 'retail_vc_2_5gb',        dbQty2: 'qty_vc_2_5gb_2',        dbRetail2: 'retail_vc_2_5gb_2',        name: 'VC 2.5GB',       hPokok: FACTORY_HPP.v2,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v3',  dbQty: 'qty_vc_3gb_30',       dbRetail: 'retail_vc_3gb_30',       dbQty2: 'qty_vc_3gb_30_2',       dbRetail2: 'retail_vc_3gb_30_2',       name: 'VC 3GB/30',      hPokok: FACTORY_HPP.v3,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v4',  dbQty: 'qty_vc_3_5gb_5d',     dbRetail: 'retail_vc_3_5gb_5d',     dbQty2: 'qty_vc_3_5gb_5d_2',     dbRetail2: 'retail_vc_3_5gb_5d_2',     name: 'VC 3.5GB/5D',    hPokok: FACTORY_HPP.v4,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v5',  dbQty: 'qty_vc_5gb_5d',       dbRetail: 'retail_vc_5gb_5d',       dbQty2: 'qty_vc_5gb_5d_2',       dbRetail2: 'retail_vc_5gb_5d_2',       name: 'VC 5GB/5D',      hPokok: FACTORY_HPP.v5,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v6',  dbQty: 'qty_vc_7gb_7d',       dbRetail: 'retail_vc_7gb_7d',       dbQty2: 'qty_vc_7gb_7d_2',       dbRetail2: 'retail_vc_7gb_7d_2',       name: 'VC 7GB/7D',      hPokok: FACTORY_HPP.v6,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v7',  dbQty: 'qty_vc_fi_4gb',       dbRetail: 'retail_vc_fi_4gb',       dbQty2: 'qty_vc_fi_4gb_2',       dbRetail2: 'retail_vc_fi_4gb_2',       name: 'VC FI 4GB',      hPokok: FACTORY_HPP.v7,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v8',  dbQty: 'qty_vc_fi_1_5gb_1d',  dbRetail: 'retail_vc_fi_1_5gb_1d',  dbQty2: 'qty_vc_fi_1_5gb_1d_2',  dbRetail2: 'retail_vc_fi_1_5gb_1d_2',  name: 'VC FI 1.5GB/1D', hPokok: FACTORY_HPP.v8,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v9',  dbQty: 'qty_vc_fi_3gb_1d',    dbRetail: 'retail_vc_fi_3gb_1d',    dbQty2: 'qty_vc_fi_3gb_1d_2',    dbRetail2: 'retail_vc_fi_3gb_1d_2',    name: 'VC FI 3GB/1D',   hPokok: FACTORY_HPP.v9,  hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v10', dbQty: 'qty_vc_fi_5gb_2d',    dbRetail: 'retail_vc_fi_5gb_2d',    dbQty2: 'qty_vc_fi_5gb_2d_2',    dbRetail2: 'retail_vc_fi_5gb_2d_2',    name: 'VC FI 5GB/2D',   hPokok: FACTORY_HPP.v10, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v11', dbQty: 'qty_vc_fi_3gb_3d',    dbRetail: 'retail_vc_fi_3gb_3d',    dbQty2: 'qty_vc_fi_3gb_3d_2',    dbRetail2: 'retail_vc_fi_3gb_3d_2',    name: 'VC FI 3GB/3D',   hPokok: FACTORY_HPP.v11, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v12', dbQty: 'qty_vc_fi_5gb_3d',    dbRetail: 'retail_vc_fi_5gb_3d',    dbQty2: 'qty_vc_fi_5gb_3d_2',    dbRetail2: 'retail_vc_fi_5gb_3d_2',    name: 'VC FI 5GB/3D',   hPokok: FACTORY_HPP.v12, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v13', dbQty: 'qty_vc_fi_15gb_7d',   dbRetail: 'retail_vc_fi_15gb_7d',   dbQty2: 'qty_vc_fi_15gb_7d_2',   dbRetail2: 'retail_vc_fi_15gb_7d_2',   name: 'VC FI 15GB/7D',  hPokok: FACTORY_HPP.v13, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
      { id: 'v14', dbQty: 'qty_vc_0_3id',        dbRetail: 'retail_vc_0_3id',        dbQty2: 'qty_vc_0_3id_2',        dbRetail2: 'retail_vc_0_3id_2',        name: 'VC 0 3ID',       hPokok: FACTORY_HPP.v14, hRetail: 0, qty: 0, hRetail2: 0, qty2: 0, hasEntry2: false },
    ],
    vcCustom: [],
    mobo: { modal: 0, jual: 0 },
    salesFee: { realtimeMargin: 0, backMargin: 0, slaFee: 0, specialProgram: 0 },
    rewards: { champions: 0, lainnya: 0 },
    partnerIncome: 0,
  }), []);

  const [data, setData] = useState(defaults);
  const fetched$ = useRef(false), prevCtx$ = useRef({});

  const applyHppToProducts = useCallback((products, overrides) =>
    products.map(p => overrides[p.id] ? { ...p, hPokok: overrides[p.id].hpp } : p), []);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = { mpxName: activeContext?.mpxName, branch: activeContext?.branch, mpxType: activeContext?.mpxType, month: activeContext?.month, year: activeContext?.year };
    const same = Object.keys(ctx).every(k => prevCtx$.current[k] === ctx[k]);
    if (same && fetched$.current) return;
    if (monthDisabled) { setIsLoading(false); setData(defaults()); setAttachments([]); return; }
    (async () => {
      if (!ctx.mpxName || !ctx.branch) { setIsLoading(false); return; }
      setIsLoading(true); setAttachments([]);
      setSpmFieldsInfo({ backMargin: null, slaFee: null, champions: null });
      setHppOverrides({});
      try {
        const { data: db, error } = await supabase.from('pnl_reports').select('*')
          .eq('partner_name', ctx.mpxName).eq('branch', ctx.branch)
          .eq('mpc_mp3', ctx.mpxType).eq('month', ctx.month).eq('year', ctx.year).maybeSingle();
        if (error) throw error;
        const s = defaults();
        if (db) {
          s.sp = s.sp.map(i => { const qty2 = db[i.dbQty2] ?? 0, hr2 = db[i.dbRetail2] ?? 0; return { ...i, qty: db[i.dbQty] ?? 0, hRetail: db[i.dbRetail] ?? 0, qty2, hRetail2: hr2, hasEntry2: qty2 > 0 || hr2 > 0 }; });
          const rd = db.revenue_data ?? {};
          if (Array.isArray(rd.sp_custom)) s.spCustom = rd.sp_custom.filter(c => c.name || c.qty > 0 || c.hRetail > 0 || c.hPokok > 0).map(c => ({ id: c.id ?? `csp_${Date.now()}_${Math.random()}`, name: c.name ?? '', hPokok: c.hPokok ?? 0, qty: c.qty ?? 0, hRetail: c.hRetail ?? 0, qty2: c.qty2 ?? 0, hRetail2: c.hRetail2 ?? 0, hasEntry2: c.hasEntry2 ?? false }));
          s.vc = s.vc.map(i => { const qty2 = db[i.dbQty2] ?? 0, hr2 = db[i.dbRetail2] ?? 0; return { ...i, qty: db[i.dbQty] ?? 0, hRetail: db[i.dbRetail] ?? 0, qty2, hRetail2: hr2, hasEntry2: qty2 > 0 || hr2 > 0 }; });
          if (Array.isArray(rd.vc_custom)) s.vcCustom = rd.vc_custom.filter(c => c.name || c.qty > 0 || c.hRetail > 0 || c.hPokok > 0).map(c => ({ id: c.id ?? `cvc_${Date.now()}_${Math.random()}`, name: c.name ?? '', hPokok: c.hPokok ?? 0, qty: c.qty ?? 0, hRetail: c.hRetail ?? 0 }));
          s.mobo = { modal: db.mobo_modal ?? 0, jual: db.mobo_jual ?? 0 };
          s.salesFee = { realtimeMargin: db.realtime_margin ?? 0, backMargin: db.back_margin ?? 0, slaFee: db.sla_fee ?? 0, specialProgram: db.special_program ?? 0 };
          s.rewards = { champions: db.rewards_champions ?? 0, lainnya: db.rewards_lainnya ?? 0 };
          s.partnerIncome = db.partner_income ?? 0;
          setAttachments(Array.isArray(db.attachments_pendapatan) ? db.attachments_pendapatan : []);
          setReportStatus({ isFinalized: db.is_finalized ?? false, finalizedAt: db.finalized_at ?? null, finalizedBy: db.finalized_by ?? null, validationNotes: db.validation_notes ?? null, updatedAt: db.updated_at ?? null });
        }

        // HPP cascade fetch
        try {
          const ctxScore = monthScore(ctx.month, ctx.year);
          const { data: hppRows } = await supabase.from('pnl_hpp_prices').select('*');
          let resolvedOverrides = {};
          if (hppRows?.length) {
            const byProduct = {};
            for (const row of hppRows) {
              const score = row.effective_year * 100 + row.effective_month_num;
              if (score <= ctxScore) {
                if (!byProduct[row.product_id] || score > byProduct[row.product_id].score)
                  byProduct[row.product_id] = { ...row, score };
              }
            }
            for (const [pid, row] of Object.entries(byProduct)) {
              resolvedOverrides[pid] = { hpp: row.hpp, effectiveMonth: row.effective_month, effectiveYear: row.effective_year, updatedBy: row.updated_by, updatedAt: row.updated_at };
            }
          }
          setHppOverrides(resolvedOverrides);
          s.sp = applyOverrides(s.sp, resolvedOverrides);
          s.vc = applyOverrides(s.vc, resolvedOverrides);
        } catch (hppErr) { console.warn('HPP fetch:', hppErr.message); }

        setData(s); prevCtx$.current = ctx; fetched$.current = true;

        // Import logs for SPM field info
        try {
          const pkStr = `${ctx.mpxName}|${ctx.branch}|${ctx.mpxType}|${ctx.month}|${ctx.year}`.toLowerCase();
          const { data: iLogs } = await supabase.from('pnl_import_logs').select('created_at, user_email, entries').order('created_at', { ascending: false }).limit(30);
          if (iLogs?.length) {
            let rtmInfo = null, backMarginInfo = null, slaInfo = null, spInfo = null, champInfo = null;
            for (const log of iLogs) {
              const entries = log.entries || [];
              const entry = entries.find(e => e.pk === pkStr);
              if (entry) {
                const changes = entry.changes || [];
                if (!rtmInfo && changes.some(c => c.field === 'realtime_margin')) rtmInfo = { at: log.created_at, by: log.user_email };
                if (!backMarginInfo && changes.some(c => c.field === 'back_margin')) backMarginInfo = { at: log.created_at, by: log.user_email };
                if (!slaInfo && changes.some(c => c.field === 'sla_fee')) slaInfo = { at: log.created_at, by: log.user_email };
                if (!spInfo && changes.some(c => c.field === 'special_program')) spInfo = { at: log.created_at, by: log.user_email };
                if (!champInfo && changes.some(c => c.field === 'rewards_champions')) champInfo = { at: log.created_at, by: log.user_email };
                if (rtmInfo && backMarginInfo && slaInfo && spInfo && champInfo) break;
              }
            }
            setSpmFieldsInfo({ realtimeMargin: rtmInfo, backMargin: backMarginInfo, slaFee: slaInfo, specialProgram: spInfo, champions: champInfo });
          }
        } catch (logErr) { console.warn('Import logs:', logErr.message); }

      } catch (e) { console.error('Fetch:', e.message); setData(defaults()); }
      finally { setIsLoading(false); setIsFormDirty?.(false); }
    })();
  }, [activeContext, defaults, setIsFormDirty, monthDisabled]);

  // ── HPP Handlers ──────────────────────────────────────────────────────────
  const openHppModal = useCallback(() => {
    const draft = {};
    for (const p of data.sp) draft[p.id] = p.hPokok;
    for (const p of data.vc) draft[p.id] = p.hPokok;
    setHppDraft(draft);
    setShowHppModal(true);
  }, [data.sp, data.vc]);

  const handleSaveHpp = useCallback(async () => {
    setHppSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir');
      const allProducts = [...data.sp, ...data.vc];
      const monthNum = MONTH_NUM[activeContext?.month] ?? 0;
      const rows = allProducts
        .filter(p => hppDraft[p.id] !== undefined && hppDraft[p.id] !== p.hPokok && hppDraft[p.id] > 0)
        .map(p => ({
          product_id: p.id, effective_month: activeContext.month, effective_month_num: monthNum,
          effective_year: Number(activeContext.year), hpp: hppDraft[p.id],
          updated_by: user.email ?? user.id, updated_at: new Date().toISOString(),
        }));
      if (!rows.length) { toast$('error', 'Tidak ada perubahan dari nilai saat ini'); return; }
      const { error } = await supabase.from('pnl_hpp_prices')
        .upsert(rows, { onConflict: 'product_id,effective_month_num,effective_year' });
      if (error) throw error;
      const newOverrides = { ...hppOverrides };
      for (const row of rows)
        newOverrides[row.product_id] = { hpp: row.hpp, effectiveMonth: row.effective_month, effectiveYear: row.effective_year, updatedBy: row.updated_by, updatedAt: row.updated_at };
      setHppOverrides(newOverrides);
      setData(prev => ({ ...prev, sp: applyHppToProducts(prev.sp, newOverrides), vc: applyHppToProducts(prev.vc, newOverrides) }));
      toast$('success', `HPP diperbarui untuk ${rows.length} produk (berlaku ${activeContext.month} ${activeContext.year} ke depan)`);
      setShowHppModal(false);
    } catch (e) { toast$('error', 'Gagal menyimpan HPP: ' + e.message); }
    finally { setHppSaving(false); }
  }, [data.sp, data.vc, hppDraft, hppOverrides, activeContext, applyHppToProducts]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const calcItem = (i) => {
      const modal1 = (Number(i.qty)||0)*(Number(i.hPokok)||0), jual1=(Number(i.qty)||0)*(Number(i.hRetail)||0), mg1=jual1-modal1;
      const modal2 = (Number(i.qty2)||0)*(Number(i.hPokok)||0), jual2=(Number(i.qty2)||0)*(Number(i.hRetail2)||0), mg2=jual2-modal2;
      const totalModal=modal1+modal2, totalJual=jual1+jual2;
      return { ...i, totalModal1:modal1,totalJual1:jual1,margin:mg1,pctMargin:jual1>0?(mg1/jual1)*100:0, totalModal2:modal2,totalJual2:jual2,margin2:mg2,pctMargin2:jual2>0?(mg2/jual2)*100:0, totalModal,totalJual,totalMargin:mg1+mg2 };
    };
    const spItems = data.sp.map(calcItem);
    const sp = { items:spItems, totalModal:spItems.reduce((a,b)=>a+b.totalModal,0), totalJual:spItems.reduce((a,b)=>a+b.totalJual,0), totalMargin:spItems.reduce((a,b)=>a+b.totalMargin,0) };
    const customItems = data.spCustom.map(c => {
      const m1=(c.qty||0)*((c.hRetail||0)-(c.hPokok||0)), m2=(c.qty2||0)*((c.hRetail2||0)-(c.hPokok||0));
      const totalModal=(c.qty||0)*(c.hPokok||0)+(c.qty2||0)*(c.hPokok||0), totalJual=(c.qty||0)*(c.hRetail||0)+(c.qty2||0)*(c.hRetail2||0);
      return { ...c, margin1:m1,margin2:m2,totalModal,totalJual,totalMargin:m1+m2 };
    });
    const spCustomTotal = { totalModal:customItems.reduce((a,b)=>a+b.totalModal,0), totalJual:customItems.reduce((a,b)=>a+b.totalJual,0), totalMargin:customItems.reduce((a,b)=>a+b.totalMargin,0) };
    const spAllModal=sp.totalModal+spCustomTotal.totalModal, spAllJual=sp.totalJual+spCustomTotal.totalJual, spAllMargin=sp.totalMargin+spCustomTotal.totalMargin;
    const vcItems = data.vc.map(calcItem);
    const vc = { items:vcItems, totalModal:vcItems.reduce((a,b)=>a+b.totalModal,0), totalJual:vcItems.reduce((a,b)=>a+b.totalJual,0), totalMargin:vcItems.reduce((a,b)=>a+b.totalMargin,0) };
    const vcCustomItems = data.vcCustom.map(c => {
      const m=(c.qty||0)*((c.hRetail||0)-(c.hPokok||0)), totalModal=(c.qty||0)*(c.hPokok||0), totalJual=(c.qty||0)*(c.hRetail||0);
      return { ...c,totalModal,totalJual,totalMargin:m };
    });
    const vcCustomTotal = { totalModal:vcCustomItems.reduce((a,b)=>a+b.totalModal,0), totalJual:vcCustomItems.reduce((a,b)=>a+b.totalJual,0), totalMargin:vcCustomItems.reduce((a,b)=>a+b.totalMargin,0) };
    const vcAllModal=vc.totalModal+vcCustomTotal.totalModal, vcAllJual=vc.totalJual+vcCustomTotal.totalJual, vcAllMargin=vc.totalMargin+vcCustomTotal.totalMargin;
    const gtJual=spAllJual+vcAllJual, gtMg=spAllMargin+vcAllMargin, gtPct=gtJual>0?(gtMg/gtJual)*100:0;
    const upfrontPotensi=Number(data.mobo.modal)*0.015, upfront=Number(data.mobo.jual)*0.015;
    const sfMg=Number(data.salesFee.realtimeMargin)+Number(data.salesFee.backMargin);
    const sfTotal=upfront+sfMg+Number(data.salesFee.slaFee)+Number(data.salesFee.specialProgram);
    const rwTotal=Number(data.rewards.champions)+Number(data.rewards.lainnya);
    const revenue=gtMg+sfTotal+rwTotal+Number(data.partnerIncome);
    return { sp,spCustom:customItems,spCustomTotal,spAllModal,spAllJual,spAllMargin, vc,vcCustom:vcCustomItems,vcCustomTotal,vcAllModal,vcAllJual,vcAllMargin, gtMg,gtJual,gtPct,upfront,upfrontPotensi,sfTotal,rwTotal,revenue };
  }, [data]);

  useEffect(() => { onUpdate?.(stats.revenue); }, [stats.revenue, onUpdate]);

  const mkPayload = (fin, userId, notes) => {
    const spEntries = data.sp.reduce((acc,c)=>({...acc,[c.dbQty]:c.qty,[c.dbRetail]:c.hRetail,[c.dbQty2]:c.hasEntry2?c.qty2:0,[c.dbRetail2]:c.hasEntry2?c.hRetail2:0}),{});
    const vcEntries = data.vc.reduce((acc,c)=>({...acc,[c.dbQty]:c.qty,[c.dbRetail]:c.hRetail,[c.dbQty2]:c.hasEntry2?c.qty2:0,[c.dbRetail2]:c.hasEntry2?c.hRetail2:0}),{});
    const revenueData = {
      sp_custom: data.spCustom.filter(c=>c.name||c.qty>0||c.hRetail>0).map(c=>({id:c.id,name:c.name,hPokok:c.hPokok,qty:c.qty,hRetail:c.hRetail,qty2:c.hasEntry2?c.qty2:0,hRetail2:c.hasEntry2?c.hRetail2:0,hasEntry2:c.hasEntry2})),
      vc_custom: data.vcCustom.filter(c=>c.name||c.qty>0||c.hRetail>0).map(c=>({id:c.id,name:c.name,hPokok:c.hPokok,qty:c.qty,hRetail:c.hRetail}))
    };
    return { user_id:userId, partner_name:activeContext.mpxName, branch:activeContext.branch, mpc_mp3:activeContext.mpxType, month:activeContext.month, year:activeContext.year, ...spEntries, ...vcEntries, mobo_modal:data.mobo.modal, mobo_jual:data.mobo.jual, realtime_margin:data.salesFee.realtimeMargin, back_margin:data.salesFee.backMargin, sla_fee:data.salesFee.slaFee, special_program:data.salesFee.specialProgram, rewards_champions:data.rewards.champions, rewards_lainnya:data.rewards.lainnya, partner_income:data.partnerIncome, grand_total_revenue:stats.revenue, revenue_data:revenueData, attachments_pendapatan:attachments, is_finalized:fin, finalized_at:fin?new Date().toISOString():null, finalized_by:fin?userId:null, validation_notes:notes, updated_at:new Date().toISOString() };
  };

  const validate = () => {
    if (monthDisabled)           { toast$('error',`Bulan ${currentMonth} telah dinonaktifkan`); return false; }
    if (!activeContext?.mpxName) { toast$('error','Nama Partner belum dipilih'); return false; }
    if (!activeContext?.branch)  { toast$('error','Kantor Cabang belum dipilih'); return false; }
    if (!activeContext?.mpxType) { toast$('error','Tipe MPC/MP3 belum tersedia'); return false; }
    if (!activeContext?.month)   { toast$('error','Bulan laporan belum dipilih'); return false; }
    if (!activeContext?.year)    { toast$('error','Tahun laporan belum dipilih'); return false; }
    return true;
  };

  // Kontribusi partner = total revenue tanpa field auto-isi Tim SPM
  // (Realtime/Back Margin, SLA, Tactical Program, Champions).
  const partnerPortion =
    stats.gtMg + stats.upfront +
    Number(data.rewards.lainnya || 0) + Number(data.partnerIncome || 0);

  const handleSaveDraft = async () => {
    if (readOnly || !validate()) return;
    // Partner tidak boleh menyimpan draft bila baru ada data auto-isi SPM saja.
    // (Tim SPM tetap boleh menyimpan field-nya sendiri.)
    if (!isSPMUser && partnerPortion <= 0) {
      toast$('error', 'Belum ada data pendapatan yang diisi. Isi minimal satu data sebelum menyimpan draft.');
      return;
    }
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir.');
      const en = reportStatus.validationNotes ?? '';
      const marked = en.includes('pendapatan:draft') || en.includes('pendapatan:final');
      const notes = marked ? en : (en ? en + ',pendapatan:draft' : 'pendapatan:draft');
      const { error } = await supabase.from('pnl_reports').upsert(mkPayload(false,user.id,notes),{onConflict:'partner_name,branch,mpc_mp3,month,year'});
      if (error) throw error;
      setReportStatus(p=>({...p,isFinalized:false,updatedAt:new Date().toISOString(),validationNotes:notes}));
      setIsFormDirty?.(false); toast$('success','Draft berhasil disimpan');
      await pushNotification(supabase,{type:'form_draft',form:'pendapatan',partner_name:activeContext.mpxName,branch:activeContext.branch,mpc_mp3:activeContext.mpxType,month:activeContext.month,year:activeContext.year,validation_notes:notes,triggered_by:user.id,triggered_name:user.user_metadata?.full_name??''});
    } catch (err) { toast$('error',err.message||'Gagal menyimpan draft'); }
    finally { setIsSaving(false); }
  };

  const handleSave = async () => {
    if (readOnly || !validate()) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir.');
      const en = reportStatus.validationNotes ?? '';
      let parts2 = en ? en.split(',').filter(p=>p&&!p.startsWith('pendapatan:')) : [];
      parts2.push('pendapatan:final');
      const notes = parts2.join(',');
      const { error } = await supabase.from('pnl_reports').upsert(mkPayload(true,user.id,notes),{onConflict:'partner_name,branch,mpc_mp3,month,year'});
      if (error) throw error;
      const now = new Date().toISOString();
      setReportStatus({isFinalized:true,finalizedAt:now,finalizedBy:user.id,validationNotes:notes,updatedAt:now});
      setIsFormDirty?.(false); setShowSubmit(false); onSaveSuccess?.();
      toast$('success','Laporan berhasil dikirim');
      const bothFinal = notes.includes('pendapatan:final') && notes.includes('pengeluaran:final');
      await pushNotification(supabase,{type:bothFinal?'finalized':'form_final',form:'pendapatan',partner_name:activeContext.mpxName,branch:activeContext.branch,mpc_mp3:activeContext.mpxType,month:activeContext.month,year:activeContext.year,validation_notes:notes,triggered_by:user.id,triggered_name:user.user_metadata?.full_name??''});
    } catch (err) { toast$('error',err.message||'Gagal menyimpan laporan'); }
    finally { setIsSaving(false); }
  };

  const handleReport = async () => {
    if (!reportMsg.trim() || !reportField) return;
    setReportSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir');
      const RMAP = { realtimeMargin:{label:'Realtime Margin',val:()=>data.salesFee.realtimeMargin}, backMargin:{label:'Back Margin',val:()=>data.salesFee.backMargin}, slaFee:{label:'SLA Monthly Fee',val:()=>data.salesFee.slaFee}, specialProgram:{label:'Tactical Program',val:()=>data.salesFee.specialProgram}, champions:{label:'Champions Reward',val:()=>data.rewards.champions} };
      const fieldLabel = RMAP[reportField].label, fieldValue = RMAP[reportField].val();
      await pushNotification(supabase,{type:'field_dispute',form:'pendapatan',partner_name:activeContext.mpxName,branch:activeContext.branch,mpc_mp3:activeContext.mpxType,month:activeContext.month,year:activeContext.year,dispute_field:fieldLabel,dispute_value:fieldValue,dispute_value_formatted:formatIDR(fieldValue),dispute_message:reportMsg.trim(),triggered_by:user.id,triggered_name:user.user_metadata?.full_name??'',triggered_email:user.email??''});
      toast$('success',`Laporan "${fieldLabel}" berhasil dikirim ke Tim SPM`);
      setShowReportModal(false); setReportMsg(''); setReportField(null);
    } catch (e) { toast$('error','Gagal mengirim laporan: '+e.message); }
    finally { setReportSending(false); }
  };

  const openReport = (field) => { setReportField(field); setReportMsg(''); setShowReportModal(true); };

  const updateVal = useCallback((section, id, field, val) => {
    if (effectiveReadOnly) return;
    if (!isSPMUser && (section==='salesFee'||(section==='rewards'&&field==='champions'))) return;
    setData(prev => {
      if (section==='partnerIncome') return {...prev,partnerIncome:val};
      if (Array.isArray(prev[section])) return {...prev,[section]:prev[section].map(i=>i.id===id?{...i,[field]:val}:i)};
      if (typeof prev[section]==='object') return {...prev,[section]:{...prev[section],[field]:val}};
      return prev;
    });
    setIsFormDirty?.(true);
  }, [setIsFormDirty, effectiveReadOnly, isSPMUser]);

  const addEntry = useCallback((section, id) => { if (effectiveReadOnly) return; setData(prev=>({...prev,[section]:prev[section].map(i=>i.id===id?{...i,hasEntry2:true}:i)})); setIsFormDirty?.(true); }, [setIsFormDirty, effectiveReadOnly]);
  const removeEntry = useCallback((section, id) => { if (effectiveReadOnly) return; setData(prev=>({...prev,[section]:prev[section].map(i=>i.id===id?{...i,hasEntry2:false,qty2:0,hRetail2:0}:i)})); setIsFormDirty?.(true); }, [setIsFormDirty, effectiveReadOnly]);

  const handlePickFiles = useCallback(async (fileList) => {
    if (effectiveReadOnly) return;
    if (!activeContext?.mpxName || !activeContext?.branch || !activeContext?.month || !activeContext?.year) { toast$('error','Lengkapi konteks partner/bulan dulu sebelum upload'); return; }
    const arr = Array.from(fileList||[]);
    if (!arr.length) return;
    const accepted=[], rejected=[];
    for (const f of arr) { const err=validatePdf(f); if (err) rejected.push(err); else accepted.push(f); }
    if (rejected.length) toast$('error',rejected.join(' · '));
    if (!accepted.length) return;
    setUploadingAtt(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesi berakhir');
      const { ok, errors } = await uploadMany({files:accepted,partner:activeContext.mpxName,branch:activeContext.branch,year:activeContext.year,month:activeContext.month,category:'pendapatan'});
      if (ok.length) { setAttachments(prev=>[...prev,...ok]); setIsFormDirty?.(true); toast$('success',`${ok.length} lampiran berhasil diunggah`); }
      if (errors.length) toast$('error',`${errors.length} file gagal: ${errors[0].message}`);
    } catch (e) { toast$('error',e.message); }
    finally { setUploadingAtt(false); }
  }, [effectiveReadOnly, activeContext, setIsFormDirty]);

  const handleRemoveAttachment = useCallback(async (path) => {
    if (effectiveReadOnly) return;
    try { await removeOne(path); setAttachments(prev=>prev.filter(a=>a.path!==path)); setIsFormDirty?.(true); toast$('success','Lampiran dihapus'); }
    catch (e) { toast$('error','Gagal menghapus: '+e.message); }
  }, [effectiveReadOnly, setIsFormDirty]);

  const handleDownloadAttachment = useCallback(async (att) => {
    try { const url = await signedUrl(att.path, 60); window.open(url,'_blank','noopener'); }
    catch (e) { toast$('error','Gagal membuka file: '+e.message); }
  }, []);

  const addCustomSP = useCallback(() => {
    if (effectiveReadOnly) return;
    if (data.spCustom.length>=MAX_CUSTOM_SP) { toast$('error',`Maksimal ${MAX_CUSTOM_SP} produk custom`); return; }
    setData(prev=>({...prev,spCustom:[...prev.spCustom,{id:`csp_${Date.now()}`,name:'',hPokok:0,qty:0,hRetail:0,qty2:0,hRetail2:0,hasEntry2:false}]})); setIsFormDirty?.(true);
  }, [data.spCustom.length, effectiveReadOnly, setIsFormDirty]);
  const removeCustomSP = useCallback((id)=>{if(effectiveReadOnly)return;setData(prev=>({...prev,spCustom:prev.spCustom.filter(c=>c.id!==id)}));setIsFormDirty?.(true);},[effectiveReadOnly,setIsFormDirty]);
  const updateCustomSP = useCallback((id,field,val)=>{if(effectiveReadOnly)return;setData(prev=>({...prev,spCustom:prev.spCustom.map(c=>c.id===id?{...c,[field]:val}:c)}));setIsFormDirty?.(true);},[effectiveReadOnly,setIsFormDirty]);
  const addCustomVC = useCallback(()=>{if(effectiveReadOnly)return;if(data.vcCustom.length>=MAX_CUSTOM_VC){toast$('error',`Maksimal ${MAX_CUSTOM_VC} produk custom`);return;}setData(prev=>({...prev,vcCustom:[...prev.vcCustom,{id:`cvc_${Date.now()}`,name:'',hPokok:0,qty:0,hRetail:0}]}));setIsFormDirty?.(true);},[data.vcCustom.length,effectiveReadOnly,setIsFormDirty]);
  const removeCustomVC = useCallback((id)=>{if(effectiveReadOnly)return;setData(prev=>({...prev,vcCustom:prev.vcCustom.filter(c=>c.id!==id)}));setIsFormDirty?.(true);},[effectiveReadOnly,setIsFormDirty]);
  const updateCustomVC = useCallback((id,field,val)=>{if(effectiveReadOnly)return;setData(prev=>({...prev,vcCustom:prev.vcCustom.map(c=>c.id===id?{...c,[field]:val}:c)}));setIsFormDirty?.(true);},[effectiveReadOnly,setIsFormDirty]);

  const TableColHead = () => (
    <><colgroup>{TABLE_HEAD.map((c,i)=><col key={i} style={{width:c.w}}/>)}</colgroup>
    <thead><tr style={{borderBottom:`1px solid ${t.line}`,background:t.sub}}>{TABLE_HEAD.map((c,i)=>(<th key={i} style={{padding:'8px 10px',textAlign:c.al,fontSize:10,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:t.mid}}>{c.h}</th>))}</tr></thead></>
  );
  const TableSubHead = () => (
    <tr style={{background:t.sub,borderTop:`0.5px solid ${t.line}`,borderBottom:`0.5px solid ${t.line}`}}>
      {TABLE_HEAD.map((c,i)=>(<th key={i} style={{padding:'6px 10px',textAlign:c.al,fontSize:10,fontWeight:600,letterSpacing:'0.07em',textTransform:'uppercase',color:t.lo}}>{c.h}</th>))}
    </tr>
  );

  const ctxMonth=activeContext?.month??'', ctxYear=activeContext?.year??'';
  const ctxType=activeContext?.mpxType??'', ctxName=activeContext?.mpxName??'', ctxBranch=activeContext?.branch??'';
  const notes=reportStatus.validationNotes??'', hasPengeluaranFinal=notes.includes('pengeluaran:final');
  const reportFieldLabel = reportField ? ({backMargin:'Back Margin',slaFee:'SLA Monthly Fee',champions:'Champions Reward'}[reportField]) : '';
  const reportFieldValue = reportField ? ({backMargin:()=>data.salesFee.backMargin,slaFee:()=>data.salesFee.slaFee,champions:()=>data.rewards.champions}[reportField]()) : 0;

  if (isLoading) return (
    <><G d={d} t={t} />
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:340,gap:14,fontFamily:FONT_STACK}}>
        <div style={{position:'relative',width:52,height:52}}>
          <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'2.5px solid transparent',borderTopColor:'#ED1C24',borderRightColor:'#C6168D',animation:'spin 0.9s linear infinite'}}/>
          <div style={{position:'absolute',inset:8,borderRadius:10,background:'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)',display:'flex',alignItems:'center',justifyContent:'center',animation:'fpbreathe 1.8s ease-in-out infinite'}}><ArrowUpRight size={18} color="#fff"/></div>
        </div>
        <span style={{fontSize:11,fontWeight:600,letterSpacing:'0.10em',textTransform:'uppercase',color:t.mid}}>Memuat data...</span>
      </div>
    </>
  );

  return (
    <div style={{width:'100%',margin:'0 auto',paddingBottom:80,fontFamily:FONT_STACK,WebkitFontSmoothing:'antialiased',color:t.hi}}>
      <G d={d} t={t}/>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:28}}>
        <div style={{width:46,height:46,borderRadius:10,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)',color:'#fff',boxShadow:'0 2px 10px rgba(237,28,36,0.30)'}}><ArrowUpRight size={25}/></div>
        <div style={{minWidth:0,flex:1}}>
          <div style={{fontSize:20,fontWeight:800,letterSpacing:'-0.035em',color:t.hi,lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Form Pendapatan {ctxMonth} {ctxYear}</div>
          <div style={{fontSize:12,fontWeight:600,letterSpacing:'0.02em',color:t.mid,marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{[ctxType,ctxName,ctxBranch].filter(Boolean).join(' · ')}</div>
        </div>
        {monthDisabled
          ? <div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:99,background:t.disabledBg,border:`1px solid ${t.disabledBd}`,color:t.disabledColor,fontSize:11,fontWeight:700,flexShrink:0}}><Ban size={12}/> Bulan Nonaktif</div>
          : readOnly ? <div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:99,background:t.amberBg,border:`1px solid ${t.amberBd}`,color:t.amber,fontSize:11,fontWeight:700,flexShrink:0}}><Eye size={12}/> Mode Lihat</div> : null}
      </div>

      {monthDisabled ? <DisabledMonthOverlay month={currentMonth} t={t} d={d}/> : (
        <>
          <Stepper step={step} setStep={setStep} t={t} d={d}/>

          {/* Toast */}
          <AnimatePresence>
            {toast.show && (
              <motion.div initial={{opacity:0,y:-12,scale:0.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-10,scale:0.97}} transition={{duration:0.17}}
                style={{position:'fixed',top:66,right:16,zIndex:999,width:316,maxWidth:'calc(100vw - 32px)'}}>
                <div style={{background:t.card,border:`1px solid ${toast.type==='success'?t.greenBd:t.redBd}`,borderRadius:12,boxShadow:t.lg,overflow:'hidden'}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:11,padding:'13px 15px'}}>
                    <div style={{width:30,height:30,borderRadius:7,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:toast.type==='success'?t.green:t.red,color:'#fff'}}>
                      {toast.type==='success'?<CheckCircle2 size={15}/>:<AlertCircle size={15}/>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:t.hi}}>{toast.type==='success'?'Berhasil':'Terjadi Kesalahan'}</div>
                      <div style={{fontSize:12,color:t.mid,marginTop:3,lineHeight:1.5}}>{toast.msg}</div>
                    </div>
                    <button onClick={()=>setToast(p=>({...p,show:false}))} style={{background:'none',border:'none',cursor:'pointer',color:t.lo,padding:2}}><X size={13}/></button>
                  </div>
                  <motion.div initial={{width:'100%'}} animate={{width:'0%'}} transition={{duration:4,ease:'linear'}} style={{height:2,background:toast.type==='success'?t.green:t.red}}/>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dispute Modal */}
          <AnimatePresence>
            {showReportModal && (
              <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:'rgba(0,0,0,0.72)',backdropFilter:'blur(16px)'}}
                onClick={()=>{if(!reportSending)setShowReportModal(false);}}>
                <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}} transition={{duration:0.15}}
                  style={{maxWidth:420,width:'100%',background:t.card,border:`1px solid ${t.redBd}`,borderRadius:16,boxShadow:t.lg,overflow:'hidden'}}
                  onClick={e=>e.stopPropagation()}>
                  <div style={{padding:'22px 24px 8px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
                      <div style={{width:40,height:40,borderRadius:10,background:t.redBg,border:`1px solid ${t.redBd}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}><Flag size={18} style={{color:t.red}}/></div>
                      <div>
                        <div style={{fontSize:15,fontWeight:700,color:t.hi,letterSpacing:'-0.02em'}}>Laporkan Nilai Tidak Sesuai</div>
                        <div style={{fontSize:11,color:t.mid,marginTop:2}}>Laporan akan dikirim ke Tim SPM Sumatera</div>
                      </div>
                    </div>
                    <div style={{padding:'11px 14px',borderRadius:9,background:t.spmBg,border:`1px solid ${t.spmBd}`,marginBottom:14}}>
                      <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.spm,marginBottom:4}}>Field yang Dilaporkan</div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span style={{fontSize:13,fontWeight:600,color:t.hi}}>{reportFieldLabel}</span>
                        <span style={{fontSize:14,fontWeight:700,color:t.spm,fontVariantNumeric:'tabular-nums'}}>{formatIDR(reportFieldValue)}</span>
                      </div>
                    </div>
                    <div style={{marginBottom:16}}>
                      <label style={{display:'block',fontSize:10,fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',color:t.mid,marginBottom:6}}>Alasan / Keterangan</label>
                      <textarea value={reportMsg} onChange={e=>setReportMsg(e.target.value)} placeholder={`Jelaskan mengapa nilai ${reportFieldLabel} ini tidak sesuai...`} rows={4} disabled={reportSending}
                        style={{width:'100%',background:t.inputBg,border:`1px solid ${t.inputBd}`,borderRadius:9,padding:'10px 13px',fontSize:13,color:t.hi,outline:'none',boxSizing:'border-box',lineHeight:1.55,transition:'border-color 0.14s'}}
                        onFocus={e=>{e.target.style.borderColor='#ED1C24';e.target.style.boxShadow='0 0 0 3px rgba(237,28,36,0.14)';}}
                        onBlur={e=>{e.target.style.borderColor=t.inputBd;e.target.style.boxShadow='none';}}/>
                      <div style={{fontSize:10,color:t.lo,marginTop:4}}>{reportMsg.trim().length} karakter · minimal 10 karakter</div>
                    </div>
                  </div>
                  <div style={{padding:'8px 24px 20px',display:'flex',gap:8}}>
                    <button onClick={()=>{if(!reportSending)setShowReportModal(false);}} className="fp-btn-ghost" style={{flex:1,justifyContent:'center'}} disabled={reportSending}>Batal</button>
                    <button onClick={handleReport} disabled={reportMsg.trim().length<10||reportSending} className="fp-btn-primary"
                      style={{flex:1,justifyContent:'center',background:reportSending?t.redBg:'linear-gradient(135deg,#DC2626,#B91C1C)',color:reportSending?t.red:'#fff',boxShadow:'none'}}>
                      {reportSending?<><Loader2 size={13} style={{animation:'fpspin 1s linear infinite'}}/>Mengirim…</>:<><Send size={13}/>Kirim Laporan</>}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* HPP Modal */}
          <AnimatePresence>
            {showHppModal && (
              <HppEditModal data={data} hppDraft={hppDraft} setHppDraft={setHppDraft} hppOverrides={hppOverrides} hppSaving={hppSaving} onSave={handleSaveHpp} onClose={()=>setShowHppModal(false)} t={t} d={d} activeContext={activeContext}/>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">

            {/* STEP 1 */}
            {step===1&&(
              <motion.div key="s1" initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.17}} style={{display:'flex',flexDirection:'column',gap:14}}>
                <SecHero icon={Layers} step={1} title="Margin Produk" t={t}/>

                {/* HPP Override Banner */}
                {(isSPMUser||activeHppOverrideCount>0)&&(
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10,padding:'12px 16px',borderRadius:10,background:t.greenBg,border:`1px solid ${t.greenBd}`}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:32,height:32,borderRadius:8,background:d?'#32BCAD':'#1A9E90',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}><Pencil size={14}/></div>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:d?'#32BCAD':'#1A9E90'}}>HPP Default Produk</div>
                        <div style={{fontSize:11,color:t.mid,marginTop:2}}>
                          {activeHppOverrideCount>0
                            ?<><span style={{color:d?'#32BCAD':'#1A9E90',fontWeight:600}}>{activeHppOverrideCount} produk</span> menggunakan HPP yang diset Tim SPM</>
                            :'Semua produk menggunakan HPP factory default'}
                        </div>
                      </div>
                    </div>
                    {isSPMUser&&!effectiveReadOnly&&(
                      <button className="btn-edit-hpp" onClick={openHppModal}>
                        <Pencil size={11}/> Edit HPP
                        {activeHppOverrideCount>0&&<span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:16,height:16,borderRadius:'50%',background:d?'#32BCAD':'#1A9E90',color:'#fff',fontSize:9,fontWeight:700,marginLeft:2}}>{activeHppOverrideCount}</span>}
                      </button>
                    )}
                  </div>
                )}

                {/* SP Card */}
                <Card t={t}><Body>
                  <SecLabel t={t}>A. Starter Pack (SP) Regular</SecLabel>
                  {!effectiveReadOnly&&<div style={{fontSize:11,color:t.lo,marginBottom:14,lineHeight:1.55}}>Produk bawaan sistem. Tap <strong style={{color:t.blue}}>+2</strong> untuk harga retail kedua.{activeHppOverrideCount>0&&<span style={{marginLeft:6,color:d?'#32BCAD':'#1A9E90'}}>· Sel HPP berwarna teal = menggunakan harga override Tim SPM.</span>}</div>}
                  <div className="vc-table">
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,tableLayout:'fixed'}}>
                      <TableColHead/>
                      <tbody>
                        {stats.sp.items.map(item=>(<React.Fragment key={item.id}><ProductRowDesktop item={item} entryIdx={1} section="sp" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} hppOverrides={hppOverrides}/>{item.hasEntry2&&<ProductRowDesktop item={item} entryIdx={2} section="sp" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} hppOverrides={hppOverrides}/>}</React.Fragment>))}
                        {stats.spCustom.length>0&&(<><tr><td colSpan={6} style={{padding:'4px 0 0',background:'transparent'}}/></tr><TableSubHead/></>)}
                        <AnimatePresence>{stats.spCustom.map(item=>(<CustomSPRowDesktop key={item.id} item={item} onUpdate={updateCustomSP} onRemove={removeCustomSP} t={t} readOnly={effectiveReadOnly}/>))}</AnimatePresence>
                        <SubtotalRow label={`Subtotal SP${stats.spCustom.length>0?` (${stats.sp.items.length} bawaan + ${stats.spCustom.length} custom)`:''}`} totalMargin={stats.spAllMargin} totalModal={stats.spAllModal} totalJual={stats.spAllJual} t={t}/>
                      </tbody>
                    </table>
                  </div>
                  <div className="vc-cards">
                    {stats.sp.items.map(item=>(<ProductCardMobile key={item.id} item={item} section="sp" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} hppOverrides={hppOverrides}/>))}
                    {stats.spCustom.length>0&&<div style={{height:4}}/>}
                    <AnimatePresence>{stats.spCustom.map(item=>(<CustomSPCardMobile key={item.id} item={item} onUpdate={updateCustomSP} onRemove={removeCustomSP} t={t} readOnly={effectiveReadOnly}/>))}</AnimatePresence>
                    <SubtotalCardMobile label={`Subtotal SP${stats.spCustom.length>0?` (+${stats.spCustom.length} custom)`:''}`} totalMargin={stats.spAllMargin} totalModal={stats.spAllModal} totalJual={stats.spAllJual} t={t}/>
                  </div>
                  {!effectiveReadOnly&&(
                    <div style={{marginTop:16,paddingTop:16,borderTop:`1px dashed ${t.violetBd}`}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:28,height:28,borderRadius:7,background:t.violetBg,border:`1px solid ${t.violetBd}`,display:'flex',alignItems:'center',justifyContent:'center'}}><Package size={13} style={{color:t.violet}}/></div>
                          <div><div style={{fontSize:12,fontWeight:700,color:t.hi}}>Produk SP Tambahan</div><div style={{fontSize:10,color:t.lo}}>Tambahkan produk SP di luar template bawaan · maks {MAX_CUSTOM_SP}</div></div>
                        </div>
                        <button className="btn-add-custom" onClick={addCustomSP} disabled={data.spCustom.length>=MAX_CUSTOM_SP}><Plus size={13}/> Tambah Produk{data.spCustom.length>0&&<span style={{opacity:0.65,fontWeight:400,textTransform:'none',letterSpacing:0}}>({data.spCustom.length}/{MAX_CUSTOM_SP})</span>}</button>
                      </div>
                    </div>
                  )}
                </Body></Card>

                {/* VC Card */}
                <Card t={t}><Body>
                  <SecLabel t={t}>B. Voucher Regular</SecLabel>
                  {!effectiveReadOnly&&<div style={{fontSize:11,color:t.lo,marginBottom:14,lineHeight:1.55}}>Jika satu produk dijual dengan <strong style={{color:t.mid}}>2 harga retail berbeda</strong>, tap tombol <strong style={{color:t.blue}}>+2</strong>.</div>}
                  <div className="vc-table">
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,tableLayout:'fixed'}}>
                      <TableColHead/>
                      <tbody>
                        {stats.vc.items.map(item=>(<React.Fragment key={item.id}><ProductRowDesktop item={item} entryIdx={1} section="vc" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} hppOverrides={hppOverrides}/>{item.hasEntry2&&<ProductRowDesktop item={item} entryIdx={2} section="vc" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} hppOverrides={hppOverrides}/>}</React.Fragment>))}
                        {stats.vcCustom.length>0&&(<><tr><td colSpan={6} style={{padding:'4px 0 0',background:'transparent'}}/></tr><TableSubHead/></>)}
                        <AnimatePresence>{stats.vcCustom.map(item=>(<CustomSPRowDesktop key={item.id} item={item} onUpdate={updateCustomVC} onRemove={removeCustomVC} t={t} readOnly={effectiveReadOnly}/>))}</AnimatePresence>
                        <SubtotalRow label={`Subtotal Voucher${stats.vcCustom.length>0?` (${stats.vc.items.length} bawaan + ${stats.vcCustom.length} custom)`:'  Regular'}`} totalMargin={stats.vcAllMargin} totalModal={stats.vcAllModal} totalJual={stats.vcAllJual} t={t}/>
                      </tbody>
                    </table>
                  </div>
                  <div className="vc-cards">
                    {stats.vc.items.map(item=>(<ProductCardMobile key={item.id} item={item} section="vc" onUpdate={updateVal} onAddEntry={addEntry} onRemoveEntry={removeEntry} t={t} readOnly={effectiveReadOnly} hppOverrides={hppOverrides}/>))}
                    {stats.vcCustom.length>0&&<div style={{height:4}}/>}
                    <AnimatePresence>{stats.vcCustom.map(item=>(<CustomSPCardMobile key={item.id} item={item} onUpdate={updateCustomVC} onRemove={removeCustomVC} t={t} readOnly={effectiveReadOnly}/>))}</AnimatePresence>
                    <SubtotalCardMobile label={`Subtotal Voucher${stats.vcCustom.length>0?` (+${stats.vcCustom.length} custom)`:'  Regular'}`} totalMargin={stats.vcAllMargin} totalModal={stats.vcAllModal} totalJual={stats.vcAllJual} t={t}/>
                  </div>
                  {!effectiveReadOnly&&(
                    <div style={{marginTop:16,paddingTop:16,borderTop:`1px dashed ${t.violetBd}`}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:28,height:28,borderRadius:7,background:t.violetBg,border:`1px solid ${t.violetBd}`,display:'flex',alignItems:'center',justifyContent:'center'}}><Package size={13} style={{color:t.violet}}/></div>
                          <div><div style={{fontSize:12,fontWeight:700,color:t.hi}}>Voucher Tambahan</div><div style={{fontSize:10,color:t.lo}}>Tambahkan voucher di luar template bawaan · maks {MAX_CUSTOM_VC}</div></div>
                        </div>
                        <button className="btn-add-custom" onClick={addCustomVC} disabled={data.vcCustom.length>=MAX_CUSTOM_VC}><Plus size={13}/> Tambah Produk{data.vcCustom.length>0&&<span style={{opacity:0.65,fontWeight:400,textTransform:'none',letterSpacing:0}}>({data.vcCustom.length}/{MAX_CUSTOM_VC})</span>}</button>
                      </div>
                    </div>
                  )}
                </Body></Card>

                {/* Saldo MOBO */}
                <Card t={t}><Body>
                  <SecLabel t={t}>C. Saldo Mobo</SecLabel>
                  <div className="g2" style={{display:'grid',gridTemplateColumns:'1fr',gap:14}}>
                    <div>
                      <label className="lbl">Total Alokasi Mobo</label>
                      <LocalInput numericValue={data.mobo.modal} onChange={v=>updateVal('mobo',null,'modal',v)} className={effectiveReadOnly?'fpi fpi-ro':'fpi'} readOnly={effectiveReadOnly}/>
                      <div style={{marginTop:5,fontSize:10,color:t.lo}}>Jumlah saldo mobo yang dialokasikan dari distributor.</div>
                    </div>
                    <div>
                      <label className="lbl">Total Penjualan Saldo ke Outlet</label>
                      <LocalInput numericValue={data.mobo.jual} onChange={v=>updateVal('mobo',null,'jual',v)} className={effectiveReadOnly?'fpi fpi-ro':'fpi'} readOnly={effectiveReadOnly}/>
                      <div style={{marginTop:5,fontSize:10,color:t.lo}}>Dasar perhitungan <strong style={{color:t.green}}>Upfront Discount 1.5%</strong> pada Sales Fee.</div>
                    </div>
                  </div>
                  <div style={{marginTop:14,padding:'12px 14px',borderRadius:9,background:t.infoBg,border:`1px solid ${t.infoBd}`,display:'flex',gap:10,alignItems:'flex-start'}}>
                    <Info size={14} style={{color:t.info,flexShrink:0,marginTop:1}}/>
                    <div style={{fontSize:11,color:t.mid,lineHeight:1.6}}><strong style={{color:t.info}}>Cara kerja Upfront Discount:</strong><br/>Nilai yang masuk ke Sales Fee dihitung dari <strong style={{color:t.hi}}>Penjualan Saldo ke Outlet × 1.5%</strong>. Lihat estimasi potensi di halaman <strong style={{color:t.hi}}>Sales Fee</strong>.</div>
                  </div>
                </Body></Card>

                {/* Grand total */}
                <div style={{padding:'18px 22px',borderRadius:12,background:'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)',color:'#fff',display:'flex',flexWrap:'wrap',gap:14,justifyContent:'space-between',alignItems:'center',boxShadow:'0 4px 20px rgba(237,28,36,0.28)'}}>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.10em',textTransform:'uppercase',opacity:0.76,marginBottom:5}}>Subtotal Margin Produk</div>
                    <div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.04em',fontVariantNumeric:'tabular-nums'}}>{formatIDR(stats.gtMg)}</div>
                  </div>
                  <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
                    <InfoChip label="SP" value={formatIDR(stats.spAllMargin)}/>
                    {stats.spCustom.length>0&&<InfoChip label={`SP +${stats.spCustom.length}`} value={formatIDR(stats.spCustomTotal.totalMargin)}/>}
                    <InfoChip label="Voucher" value={formatIDR(stats.vcAllMargin)}/>
                    {stats.vcCustom.length>0&&<InfoChip label={`VC +${stats.vcCustom.length}`} value={formatIDR(stats.vcCustomTotal.totalMargin)}/>}
                  </div>
                </div>
              </motion.div>
            )}

            {/* STEP 2 */}
            {step===2&&(
              <motion.div key="s2" initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.17}} style={{display:'flex',flexDirection:'column',gap:13}}>
                <SecHero icon={Zap} step={2} title="Sales Fee" t={t}/>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,padding:'14px 16px',borderRadius:10,border:`1px solid ${t.infoBd}`,background:t.infoBg}}>
                  <div style={{display:'flex',alignItems:'center',gap:11}}>
                    <div style={{width:34,height:34,borderRadius:8,background:t.info,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}><Info size={16}/></div>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:t.info}}>Potensi Upfront Discount</div>
                      <div style={{fontSize:11,color:t.mid,marginTop:2,lineHeight:1.5}}>1.5% × Total Alokasi Mobo ({formatIDR(data.mobo.modal)})<span style={{display:'inline-flex',alignItems:'center',gap:4,marginLeft:8,padding:'1px 7px',borderRadius:99,background:t.infoBg,border:`1px solid ${t.infoBd}`,fontSize:9,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:t.info}}>Info saja · tidak masuk total</span></div>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}><div style={{fontSize:20,fontWeight:800,color:t.info,fontVariantNumeric:'tabular-nums'}}>{formatIDR(stats.upfrontPotensi)}</div><div style={{fontSize:10,color:t.mid,marginTop:2}}>estimasi maksimal jika semua terjual</div></div>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,padding:'15px 18px',borderRadius:10,border:`1px solid ${t.greenBd}`,background:t.greenBg}}>
                  <div style={{display:'flex',alignItems:'center',gap:11}}>
                    <div style={{width:34,height:34,borderRadius:8,background:t.green,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}><TrendingUp size={16}/></div>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:t.green}}>A. Upfront Discount</div>
                      <div style={{fontSize:11,color:t.mid,marginTop:2,lineHeight:1.5}}>1.5% × Penjualan Saldo ke Outlet ({formatIDR(data.mobo.jual)})<span style={{display:'inline-flex',alignItems:'center',gap:4,marginLeft:8,padding:'1px 7px',borderRadius:99,background:t.greenBg,border:`1px solid ${t.greenBd}`,fontSize:9,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:t.green}}>Masuk total</span></div>
                    </div>
                  </div>
                  <div style={{fontSize:20,fontWeight:800,color:t.green,fontVariantNumeric:'tabular-nums'}}>{formatIDR(stats.upfront)}</div>
                </div>
                <Card t={t}><Body>
                  <SecLabel t={t}>B. Sales Margin</SecLabel>
                  <div style={{display:'flex',flexDirection:'column',gap:13}}>
                    <SpmField label="Realtime Margin" info={spmFieldsInfo.realtimeMargin} updatedAt={!spmFieldsInfo.realtimeMargin&&data.salesFee.realtimeMargin>0?reportStatus.updatedAt:null} canReport={canReportDispute} onReport={()=>openReport('realtimeMargin')} t={t}>
                      <LocalInput numericValue={data.salesFee.realtimeMargin} onChange={v=>updateVal('salesFee',null,'realtimeMargin',v)} className={spmFieldReadOnly?'fpi-spm fpi-spm-ro':'fpi-spm'} readOnly={spmFieldReadOnly}/>
                      {!isSPMUser&&!effectiveReadOnly&&<div style={{marginTop:6,fontSize:10,color:t.lo,lineHeight:1.5}}>Nilai ini diisi oleh Tim SPM Sumatera. Jika tidak sesuai, gunakan tombol <strong style={{color:t.red}}>Laporkan</strong>.</div>}
                    </SpmField>
                    <SpmField label="Back Margin" info={spmFieldsInfo.backMargin} updatedAt={!spmFieldsInfo.backMargin&&data.salesFee.backMargin>0?reportStatus.updatedAt:null} canReport={canReportDispute} onReport={()=>openReport('backMargin')} t={t}>
                      <LocalInput numericValue={data.salesFee.backMargin} onChange={v=>updateVal('salesFee',null,'backMargin',v)} className={spmFieldReadOnly?'fpi-spm fpi-spm-ro':'fpi-spm'} readOnly={spmFieldReadOnly}/>
                      {!isSPMUser&&!effectiveReadOnly&&<div style={{marginTop:6,fontSize:10,color:t.lo,lineHeight:1.5}}>Nilai ini diisi oleh Tim SPM Sumatera. Jika tidak sesuai, gunakan tombol <strong style={{color:t.red}}>Laporkan</strong>.</div>}
                    </SpmField>
                  </div>
                </Body></Card>
                <Card t={t}><Body>
                  <SpmField label="C. SLA Monthly Fee" info={spmFieldsInfo.slaFee} updatedAt={!spmFieldsInfo.slaFee&&data.salesFee.slaFee>0?reportStatus.updatedAt:null} canReport={canReportDispute} onReport={()=>openReport('slaFee')} t={t}>
                    <LocalInput numericValue={data.salesFee.slaFee} onChange={v=>updateVal('salesFee',null,'slaFee',v)} className={spmFieldReadOnly?'fpi-spm fpi-spm-ro':'fpi-spm'} readOnly={spmFieldReadOnly}/>
                    {!isSPMUser&&!effectiveReadOnly&&<div style={{marginTop:6,fontSize:10,color:t.lo,lineHeight:1.5}}>Nilai ini diisi oleh Tim SPM Sumatera. Jika tidak sesuai, gunakan tombol <strong style={{color:t.red}}>Laporkan</strong>.</div>}
                  </SpmField>
                </Body></Card>
                <Card t={t}><Body>
                  <SpmField label="D. Tactical Program" info={spmFieldsInfo.specialProgram} updatedAt={!spmFieldsInfo.specialProgram&&data.salesFee.specialProgram>0?reportStatus.updatedAt:null} canReport={canReportDispute} onReport={()=>openReport('specialProgram')} t={t}>
                    <LocalInput numericValue={data.salesFee.specialProgram} onChange={v=>updateVal('salesFee',null,'specialProgram',v)} className={spmFieldReadOnly?'fpi-spm fpi-spm-ro':'fpi-spm'} readOnly={spmFieldReadOnly}/>
                    {!isSPMUser&&!effectiveReadOnly&&<div style={{marginTop:6,fontSize:10,color:t.lo,lineHeight:1.5}}>Nilai ini diisi oleh Tim SPM Sumatera. Jika tidak sesuai, gunakan tombol <strong style={{color:t.red}}>Laporkan</strong>.</div>}
                  </SpmField>
                </Body></Card>
                <div style={{padding:'15px 20px',borderRadius:12,background:'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,boxShadow:'0 4px 20px rgba(237,28,36,0.28)'}}>
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:34,height:34,borderRadius:8,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}><Zap size={16}/></div>
                      <span style={{fontSize:12,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#fff'}}>Total Sales Fee</span>
                    </div>
                    <div style={{fontSize:10,color:'rgba(255,255,255,0.65)',paddingLeft:44}}>Upfront + Realtime + Back Margin + SLA Fee + Tactical Program</div>
                  </div>
                  <span style={{fontSize:26,fontWeight:800,color:'#fff',fontVariantNumeric:'tabular-nums'}}>{formatIDR(stats.sfTotal)}</span>
                </div>
              </motion.div>
            )}

            {/* STEP 3 */}
            {step===3&&(
              <motion.div key="s3" initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.17}}>
                <SecHero icon={Award} step={3} title="Hadiah & Reward" t={t}/>
                <Card t={t} style={{maxWidth:540,margin:'0 auto'}}><Body>
                  <div style={{display:'flex',flexDirection:'column',gap:18}}>
                    <SpmField label="A. Champions Reward" info={spmFieldsInfo.champions} updatedAt={!spmFieldsInfo.champions&&data.rewards.champions>0?reportStatus.updatedAt:null} canReport={canReportDispute} onReport={()=>openReport('champions')} t={t}>
                      <LocalInput numericValue={data.rewards.champions} onChange={v=>updateVal('rewards',null,'champions',v)} className={spmFieldReadOnly?'fpi-spm fpi-spm-ro fpi-spm-ro-lg':'fpi-spm fpi-spm-ro-lg'} readOnly={spmFieldReadOnly}/>
                      {!isSPMUser&&!effectiveReadOnly&&<div style={{marginTop:6,fontSize:10,color:t.lo,lineHeight:1.5}}>Nilai ini diisi oleh Tim SPM Sumatera. Jika tidak sesuai, gunakan tombol <strong style={{color:t.red}}>Laporkan</strong>.</div>}
                    </SpmField>
                    <div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7}}>
                        <label className="lbl" style={{margin:0}}>B. Hadiah Lainnya</label>
                        <span style={{fontSize:11,fontWeight:600,color:t.green}}>{formatPct((Number(data.rewards.lainnya)/(stats.rwTotal||1))*100)}</span>
                      </div>
                      <LocalInput numericValue={data.rewards.lainnya} onChange={v=>updateVal('rewards',null,'lainnya',v)} className={effectiveReadOnly?'fpi fpi-ro fpi-ro-lg':'fpi fpi-lg'} readOnly={effectiveReadOnly}/>
                    </div>
                    <div style={{padding:'14px 18px',borderRadius:10,background:'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{display:'flex',alignItems:'center',gap:9}}><div style={{width:32,height:32,borderRadius:7,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}><Gift size={15}/></div><span style={{fontSize:12,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:'#fff'}}>Total Rewards</span></div>
                      <span style={{fontSize:22,fontWeight:800,color:'#fff',fontVariantNumeric:'tabular-nums'}}>{formatIDR(stats.rwTotal)}</span>
                    </div>
                  </div>
                </Body></Card>
              </motion.div>
            )}

            {/* STEP 4 */}
            {step===4&&(
              <motion.div key="s4" initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.17}}>
                <SecHero icon={ShieldCheck} step={4} title="Laporan Akhir" t={t}/>
                <div style={{display:'flex',flexDirection:'column',gap:14,marginBottom:14}}>
                  <Card t={t}><Body>
                    <SecLabel t={t}>Pendapatan Partner</SecLabel>
                    <div style={{padding:'14px 16px',borderRadius:9,background:t.greenBg,border:`1px solid ${t.greenBd}`,marginBottom:14}}>
                      <label className="lbl" style={{color:t.green,marginBottom:7}}>Input Manual (Luar Template)</label>
                      <LocalInput numericValue={data.partnerIncome} onChange={v=>updateVal('partnerIncome',null,null,v)} readOnly={effectiveReadOnly}
                        style={{fontSize:24,fontWeight:800,color:t.green,letterSpacing:'-0.04em',width:'100%',background:'transparent',border:'none',outline:'none',fontFamily:'inherit',...(effectiveReadOnly?{cursor:'default',pointerEvents:'none'}:{})}}/>
                    </div>
                    <div onDragOver={e=>{e.preventDefault();if(!effectiveReadOnly)setDrag(true);}} onDragLeave={()=>setDrag(false)}
                      onDrop={e=>{e.preventDefault();setDrag(false);if(!effectiveReadOnly)handlePickFiles(e.dataTransfer.files);}}
                      style={{border:`1.5px dashed ${drag?t.blue:t.line}`,borderRadius:10,padding:'18px 14px',textAlign:'center',background:drag?t.blueBg:'transparent',transition:'all .15s',cursor:effectiveReadOnly?'default':'pointer',opacity:uploadingAtt?0.7:1}}>
                      {!effectiveReadOnly&&(
                        <label htmlFor="fp-up" style={{cursor:'pointer',display:'block'}}>
                          <input type="file" id="fp-up" multiple accept={ACCEPTED_EXT+',application/pdf'} style={{display:'none'}} onChange={e=>{handlePickFiles(e.target.files);e.target.value='';}} disabled={uploadingAtt}/>
                          {uploadingAtt
                            ?<><Loader2 size={22} style={{color:t.blue,animation:'fpspin 1s linear infinite',margin:'0 auto 8px'}}/><div style={{fontSize:12,color:t.mid}}>Mengunggah lampiran…</div></>
                            :<><Upload size={22} style={{color:t.lo,margin:'0 auto 8px'}}/><div style={{fontSize:13,fontWeight:700,color:t.mid}}>Upload Lampiran (PDF)</div><div style={{fontSize:11,color:t.lo,marginTop:3}}>Drag & drop atau klik · Maks 20 MB per file · Multiple</div></>}
                        </label>
                      )}
                      {effectiveReadOnly&&attachments.length===0&&<div style={{fontSize:12,color:t.lo}}>Tidak ada lampiran</div>}
                    </div>
                    {attachments.length>0&&(
                      <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:6}}>
                        <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.mid}}>{attachments.length} Lampiran Tersimpan</div>
                        <AnimatePresence>
                          {attachments.map(att=>(
                            <motion.div key={att.path} initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0,x:-8}} transition={{duration:0.14}}
                              style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:8,border:`1px solid ${t.line}`,background:t.sub}}>
                              <FileCheck size={16} style={{color:t.green,flexShrink:0}}/>
                              <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:t.hi,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{att.name}</div><div style={{fontSize:10,color:t.lo,marginTop:1}}>{fmtSize(att.size)}{att.uploaded_at?` · ${fmtDate(att.uploaded_at)}`:''}</div></div>
                              <button onClick={()=>handleDownloadAttachment(att)} style={{background:'none',border:'none',cursor:'pointer',color:t.blue,fontSize:11,fontWeight:700,padding:'4px 8px',borderRadius:6,fontFamily:'inherit',flexShrink:0}}>Lihat</button>
                              {!effectiveReadOnly&&<button onClick={()=>handleRemoveAttachment(att.path)} style={{background:'none',border:'none',cursor:'pointer',color:t.lo,padding:4,display:'flex',flexShrink:0}}><X size={14}/></button>}
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </Body></Card>

                  <Card t={t}><Body>
                    <SecLabel t={t}>Nilai Diisi Tim SPM</SecLabel>
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      {[{label:'Realtime Margin',value:data.salesFee.realtimeMargin,info:spmFieldsInfo.realtimeMargin,field:'realtimeMargin'},{label:'Back Margin',value:data.salesFee.backMargin,info:spmFieldsInfo.backMargin,field:'backMargin'},{label:'SLA Monthly Fee',value:data.salesFee.slaFee,info:spmFieldsInfo.slaFee,field:'slaFee'},{label:'Tactical Program',value:data.salesFee.specialProgram,info:spmFieldsInfo.specialProgram,field:'specialProgram'},{label:'Hadiah Champions Club',value:data.rewards.champions,info:spmFieldsInfo.champions,field:'champions'}].map(item=>(
                        <div key={item.field} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'11px 14px',borderRadius:9,background:t.spmBg,border:`1px solid ${t.spmBd}`}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:4}}><span style={{fontSize:12,fontWeight:600,color:t.hi}}>{item.label}</span><SpmBadge t={t}/></div>
                            <LastUpdatedInfo info={item.info} updatedAt={!item.info&&item.value>0?reportStatus.updatedAt:null} t={t}/>
                          </div>
                          <div style={{textAlign:'right',flexShrink:0}}>
                            <div style={{fontSize:15,fontWeight:700,color:item.value>0?t.green:t.lo,fontVariantNumeric:'tabular-nums'}}>{formatIDR(item.value)}</div>
                            {canReportDispute&&<button className="btn-report" style={{marginTop:6,fontSize:9}} onClick={()=>openReport(item.field)}><Flag size={8}/>Laporkan</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Body></Card>

                  {/* HPP Override Review */}
                  {activeHppOverrideCount>0&&(
                    <Card t={t}><Body>
                      <SecLabel t={t}>HPP Override Aktif ({activeHppOverrideCount} produk)</SecLabel>
                      <div style={{display:'flex',flexDirection:'column',gap:8}}>
                        {[...data.sp,...data.vc].filter(p=>hppOverrides[p.id]).map(p=>{
                          const ov=hppOverrides[p.id];
                          return(
                            <div key={p.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'9px 12px',borderRadius:9,background:t.greenBg,border:`1px solid ${t.greenBd}`}}>
                              <div>
                                <div style={{display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:12,fontWeight:600,color:t.hi}}>{p.name}</span><span className="hpp-override-tag"><History size={8}/>{ov.effectiveMonth} {ov.effectiveYear}</span></div>
                                {ov.updatedBy&&<div style={{fontSize:10,color:t.lo,marginTop:2}}>oleh {ov.updatedBy}</div>}
                              </div>
                              <div style={{textAlign:'right',flexShrink:0}}>
                                <div style={{fontSize:13,fontWeight:700,color:d?'#32BCAD':'#1A9E90',fontVariantNumeric:'tabular-nums'}}>{new Intl.NumberFormat('id-ID').format(p.hPokok)}</div>
                                {FACTORY_HPP[p.id]&&FACTORY_HPP[p.id]!==p.hPokok&&<div style={{fontSize:10,color:t.lo,textDecoration:'line-through'}}>{new Intl.NumberFormat('id-ID').format(FACTORY_HPP[p.id])}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Body></Card>
                  )}

                  {stats.spCustom.length>0&&(<Card t={t}><Body><SecLabel t={t}>Produk SP Custom ({stats.spCustom.length} item)</SecLabel>{stats.spCustom.map((c,i)=>(<div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 0',borderBottom:`1px solid ${t.lineH}`}}><div style={{display:'flex',alignItems:'center',gap:8}}><span className="custom-tag" style={{flexShrink:0}}><Sparkles size={7}/>{i+1}</span><div><div style={{fontSize:12,fontWeight:700,color:t.hi}}>{c.name||`Produk Custom ${i+1}`}</div><div style={{fontSize:10,color:t.lo}}>Pokok: {formatIDR(c.hPokok)} · {c.qty+(c.hasEntry2?c.qty2:0)} unit</div></div></div><div style={{textAlign:'right',flexShrink:0}}><div style={{fontSize:13,fontWeight:700,color:c.totalMargin<0?t.red:t.green,fontVariantNumeric:'tabular-nums'}}>{formatIDR(c.totalMargin)}</div><div style={{fontSize:10,color:t.lo}}>dari {formatIDR(c.totalJual)}</div></div></div>))}<div style={{display:'flex',justifyContent:'space-between',paddingTop:12,marginTop:4,borderTop:`1px solid ${t.violetBd}`}}><span style={{fontSize:11,fontWeight:700,color:t.violet}}>Total Custom SP</span><span style={{fontSize:14,fontWeight:700,color:t.violet,fontVariantNumeric:'tabular-nums'}}>{formatIDR(stats.spCustomTotal.totalMargin)}</span></div></Body></Card>)}
                  {stats.vcCustom.length>0&&(<Card t={t}><Body><SecLabel t={t}>Voucher Custom ({stats.vcCustom.length} item)</SecLabel>{stats.vcCustom.map((c2,i)=>(<div key={c2.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 0',borderBottom:`1px solid ${t.lineH}`}}><div style={{display:'flex',alignItems:'center',gap:8}}><span className="custom-tag" style={{flexShrink:0}}><Sparkles size={7}/>{i+1}</span><div><div style={{fontSize:12,fontWeight:700,color:t.hi}}>{c2.name||`Voucher Custom ${i+1}`}</div><div style={{fontSize:10,color:t.lo}}>Pokok: {formatIDR(c2.hPokok)} · {c2.qty} unit</div></div></div><div style={{textAlign:'right',flexShrink:0}}><div style={{fontSize:13,fontWeight:700,color:c2.totalMargin<0?t.red:t.green,fontVariantNumeric:'tabular-nums'}}>{formatIDR(c2.totalMargin)}</div><div style={{fontSize:10,color:t.lo}}>dari {formatIDR(c2.totalJual)}</div></div></div>))}<div style={{display:'flex',justifyContent:'space-between',paddingTop:12,marginTop:4,borderTop:`1px solid ${t.violetBd}`}}><span style={{fontSize:11,fontWeight:700,color:t.violet}}>Total Voucher Custom</span><span style={{fontSize:14,fontWeight:700,color:t.violet,fontVariantNumeric:'tabular-nums'}}>{formatIDR(stats.vcCustomTotal.totalMargin)}</span></div></Body></Card>)}

                  <Card t={t}><Body>
                    <SecLabel t={t}>Ringkasan Struktur Pendapatan</SecLabel>
                    <div style={{display:'flex',flexDirection:'column'}}>
                      <SumRow icon={Layers} label="Margin Produk" value={stats.gtMg} t={t}/>
                      <SumRow icon={Zap} label="Sales Fee" value={stats.sfTotal} t={t}/>
                      <SumRow icon={Award} label="Rewards & Hadiah" value={stats.rwTotal} t={t}/>
                      <SumRow icon={Banknote} label="Partner Income" value={data.partnerIncome} highlight t={t}/>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,paddingTop:16,marginTop:4,borderTop:`2px solid ${t.greenBd}`}}><span style={{fontSize:12,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:t.green}}>Net Revenue</span><span style={{fontSize:22,fontWeight:800,letterSpacing:'-0.04em',color:stats.revenue<0?t.red:t.green,fontVariantNumeric:'tabular-nums',textAlign:'right'}}>{formatIDR(stats.revenue)}</span></div>
                    </div>
                  </Body></Card>

                  <div style={{padding:'34px 26px',borderRadius:14,border:`1.5px solid ${t.greenBd}`,background:t.greenBg,textAlign:'center'}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:t.green,marginBottom:13}}>Total Pendapatan Terakumulasi</div>
                    <div style={{fontSize:'clamp(26px,6vw,58px)',fontWeight:800,letterSpacing:'-0.04em',color:stats.revenue<0?t.red:t.green,fontVariantNumeric:'tabular-nums',lineHeight:1.1,marginBottom:20,wordBreak:'break-all'}}>{formatIDR(stats.revenue)}</div>
                    {activeHppOverrideCount>0&&(
                      <div style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:99,background:t.greenBg,border:`1px solid ${t.greenBd}`,color:d?'#32BCAD':'#1A9E90',fontSize:10,fontWeight:600,marginBottom:12}}>
                        <Pencil size={9}/>{activeHppOverrideCount} produk menggunakan HPP override Tim SPM
                      </div>
                    )}
                    {reportStatus.isFinalized?(
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
                        {hasPengeluaranFinal
                          ?<div style={{display:'inline-flex',alignItems:'center',gap:7,padding:'8px 18px',borderRadius:99,background:t.green,color:'#fff',fontSize:12,fontWeight:700}}><CheckCircle2 size={14}/>Pendapatan &amp; Pengeluaran Tervalidasi</div>
                          :<div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'8px 18px',borderRadius:99,background:t.green,color:'#fff',fontSize:12,fontWeight:700}}><div style={{width:18,height:18,borderRadius:'50%',background:'rgba(255,255,255,0.30)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800}}>1</div>Laporan Pendapatan Tervalidasi</div>}
                        {reportStatus.finalizedAt&&<div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:t.mid}}><Clock size={12} style={{color:t.lo}}/>Difinalisasi: {fmtDate(reportStatus.finalizedAt)}</div>}
                        {hasPengeluaranFinal&&<div style={{display:'inline-flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:99,background:t.magentaBg,border:`1px solid ${t.magentaBd}`,fontSize:11,color:t.magenta,fontWeight:600}}><CheckCircle2 size={11}/>Form Pengeluaran juga tervalidasi</div>}
                      </div>
                    ):(
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                        <div style={{display:'inline-flex',alignItems:'center',gap:7,padding:'8px 18px',borderRadius:99,background:t.amberBg,border:`1px solid ${t.amberBd}`,color:t.amber,fontSize:12,fontWeight:700}}><Clock size={14}/>Belum Difinalisasi</div>
                        {reportStatus.updatedAt&&<div style={{fontSize:11,color:t.mid}}>Draft tersimpan: {fmtDate(reportStatus.updatedAt)}</div>}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Footer */}
      {!monthDisabled&&(
        <div style={{position:'fixed',bottom:0,left:0,right:0,borderTop:`1px solid ${t.line}`,background:d?'rgba(13,13,14,0.94)':'rgba(255,255,255,0.94)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',zIndex:60,padding:'11px 16px'}}>
          <div style={{width:'100%',margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,flexWrap:'wrap'}}>
            {!effectiveReadOnly&&<button onClick={handleSaveDraft} disabled={isSaving||(!isSPMUser&&partnerPortion<=0)} title={!isSPMUser&&partnerPortion<=0?'Isi minimal satu data pendapatan dulu':undefined} className="fp-btn-ghost">{isSaving?<><Loader2 size={13} style={{animation:'fpspin 1s linear infinite'}}/>Simpan...</>:<><Save size={13}/>Draft</>}</button>}
            {step>1&&<button onClick={()=>setStep(s=>s-1)} className="fp-btn-ghost"><ArrowLeft size={13}/>Kembali</button>}
            {step<4?<button onClick={()=>setStep(s=>s+1)} className="fp-btn-primary">Lanjut <ArrowRight size={13}/></button>
              :!effectiveReadOnly&&<button onClick={()=>setShowSubmit(true)} disabled={isSaving} className="fp-btn-primary"><Send size={13}/>Kirim</button>}
          </div>
        </div>
      )}

      {/* Submit Modal */}
      <AnimatePresence>
        {showSubmit&&!effectiveReadOnly&&(
          <div style={{position:'fixed',inset:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:'rgba(0,0,0,0.74)',backdropFilter:'blur(18px)',WebkitBackdropFilter:'blur(18px)'}}>
            <motion.div initial={{scale:0.96,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.96,opacity:0}} transition={{duration:0.14}}
              style={{maxWidth:348,width:'100%',background:t.card,border:`1px solid ${t.line}`,borderRadius:16,boxShadow:t.lg,overflow:'hidden'}}>
              <div style={{padding:28,textAlign:'center'}}>
                <div style={{width:50,height:50,borderRadius:11,background:'linear-gradient(135deg,#ED1C24,#C6168D)',margin:'0 auto 15px',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',boxShadow:'0 4px 16px rgba(237,28,36,0.32)'}}><ShieldCheck size={22}/></div>
                <div style={{fontSize:17,fontWeight:800,letterSpacing:'-0.03em',color:t.hi,marginBottom:7}}>Kirim Laporan?</div>
                <div style={{fontSize:13,color:t.mid,lineHeight:1.65,marginBottom:14}}>Total <strong style={{color:t.green}}>{formatIDR(stats.revenue)}</strong> akan dikirim untuk proses audit.</div>
                {(stats.spCustom.length>0||stats.vcCustom.length>0)&&<div style={{padding:'8px 12px',borderRadius:8,background:t.violetBg,border:`1px solid ${t.violetBd}`,marginBottom:8,fontSize:11,color:t.violet,fontWeight:600}}><Sparkles size={10} style={{display:'inline',marginRight:4}}/>{stats.spCustom.length} SP + {stats.vcCustom.length} VC custom disertakan</div>}
                {activeHppOverrideCount>0&&<div style={{padding:'8px 12px',borderRadius:8,background:t.greenBg,border:`1px solid ${t.greenBd}`,marginBottom:8,fontSize:11,color:d?'#32BCAD':'#1A9E90',fontWeight:600,display:'flex',alignItems:'center',gap:5}}><Pencil size={10}/>{activeHppOverrideCount} HPP produk menggunakan override Tim SPM</div>}
                {attachments.length>0&&<div style={{padding:'8px 12px',borderRadius:8,background:t.blueBg,border:`1px solid ${t.blueBd}`,marginBottom:14,fontSize:11,color:t.blue,fontWeight:600}}><FileCheck size={10} style={{display:'inline',marginRight:4}}/>{attachments.length} lampiran PDF tersimpan</div>}
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <button onClick={handleSave} disabled={isSaving} className="fp-btn-primary" style={{width:'100%',justifyContent:'center',padding:12,fontSize:13}}>{isSaving?'Menyimpan...':'Konfirmasi'}</button>
                  <button onClick={()=>setShowSubmit(false)} className="fp-btn-ghost" style={{width:'100%',justifyContent:'center',padding:12,fontSize:13}}>Batal</button>
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