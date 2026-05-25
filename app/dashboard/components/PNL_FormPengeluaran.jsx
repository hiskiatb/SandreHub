"use client";
/**
 * PNL_FormPengeluaran.jsx
 * Perubahan:
 * - Marketing "Program Lain" DYNAMIC (slot 1–10).
 *   slot 1 = kolom lama qty_mkt_lain_1/price_mkt_lain_1/label_mkt_lain_1 (data existing tetap)
 * - TAMPILAN DIPERBAIKI: badge "Tipe" ada di kolom tersendiri paling kiri,
 *   sehingga kolom Nama / Qty / Harga tetap rata untuk semua baris (statis & dinamis).
 * - Upload lampiran Marketing mendukung MULTIPLE FILES.
 * - Badge finalisasi: angka 1 jika hanya satu form final, centang jika keduanya.
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import supabase from "../../../lib/supabase";
import { pushNotification } from "../../../lib/notificationService";
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownLeft, AlertCircle, CheckCircle2, Send, Upload, ShieldCheck,
  Calculator, Banknote, Building2, Users, Megaphone, Coins,
  FileText, Loader2, X, FileCheck,
  ArrowRight, ArrowLeft, Save, Clock, Eye, History, Sparkles, RotateCcw, Ban,
  Plus, Trash2, Paperclip,
} from 'lucide-react';

const formatIDR = (val) => { const v=val||0,neg=v<0; const s=new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Math.abs(v)); return neg?`(${s})`:s; };
const formatPct = (val) => (isFinite(val)&&val!==0)?`${val.toFixed(2)}%`:'0.00%';
const toSep = (val) => { if(val===undefined||val===null||val==='')return''; if(val===0||val==='0')return'0'; return val.toString().replace(/\D/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.'); };
const parseNum = (val) => { if(typeof val==='number')return val; if(!val)return 0; const n=Number(val.toString().replace(/\./g,'')); return isNaN(n)?0:n; };
const fmtDate = (iso) => { if(!iso)return null; return new Date(iso).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); };
const fmtSize = (b) => b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(1)} MB`;
const getPrevMY = (month,year) => { const M=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']; const i=M.indexOf(month); if(i===-1)return{prevMonth:null,prevYear:null}; if(i===0)return{prevMonth:M[11],prevYear:String(Number(year)-1)}; return{prevMonth:M[i-1],prevYear:String(year)}; };
const FONT = `"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif`;
const MAX_LAIN = 10;
const lainDbQty   = (n) => `qty_mkt_lain_${n}`;
const lainDbPrice = (n) => `price_mkt_lain_${n}`;
const lainDbLabel = (n) => `label_mkt_lain_${n}`;

const mk = (d) => ({
  bg:d?'#0D0D0E':'#F5F5F6', card:d?'#1A1A1D':'#FFFFFF', sub:d?'#202024':'#F2F2F4',
  line:d?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.09)', lineH:d?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)',
  hi:d?'#F2F2F3':'#18181B', mid:d?'#8A8A96':'#52525B', lo:d?'#4D4D58':'#A1A1AA',
  blue:'#ED1C24', blueBg:d?'rgba(237,28,36,0.12)':'rgba(237,28,36,0.07)', blueBd:d?'rgba(237,28,36,0.28)':'rgba(237,28,36,0.20)',
  green:d?'#32BCAD':'#1A9E90', greenBg:d?'rgba(50,188,173,0.13)':'rgba(50,188,173,0.09)', greenBd:d?'rgba(50,188,173,0.30)':'rgba(50,188,173,0.22)',
  amber:d?'#FFCB05':'#C49A00', amberBg:d?'rgba(255,203,5,0.12)':'rgba(255,203,5,0.09)', amberBd:d?'rgba(255,203,5,0.28)':'rgba(255,203,5,0.22)',
  red:d?'#FF6B6B':'#DC2626', redBg:d?'rgba(255,107,107,0.12)':'rgba(220,38,38,0.07)', redBd:d?'rgba(255,107,107,0.28)':'rgba(220,38,38,0.20)',
  magenta:'#C6168D', magentaBg:d?'rgba(198,22,141,0.12)':'rgba(198,22,141,0.07)', magentaBd:d?'rgba(198,22,141,0.28)':'rgba(198,22,141,0.18)',
  violet:d?'#A78BFA':'#7C3AED', violetBg:d?'rgba(167,139,250,0.12)':'rgba(124,58,237,0.07)', violetBd:d?'rgba(167,139,250,0.28)':'rgba(124,58,237,0.18)',
  inputBg:d?'rgba(255,255,255,0.05)':'#FFFFFF', inputBd:d?'rgba(255,255,255,0.09)':'rgba(0,0,0,0.13)',
  roBg:d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.025)', roBd:d?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)',
  sm:d?'0 1px 2px rgba(0,0,0,0.55)':'0 1px 2px rgba(26,26,29,0.06)',
  lg:d?'0 20px 48px rgba(0,0,0,0.65)':'0 20px 48px rgba(26,26,29,0.14)',
  disabledBg:d?'rgba(100,100,120,0.10)':'rgba(100,100,120,0.07)',
  disabledBd:d?'rgba(100,100,120,0.22)':'rgba(100,100,120,0.18)',
  disabledColor:d?'#7A7A8A':'#7878A0',
});

// LocalInput
const LocalInput = React.memo(({ numericValue, onChange, style, placeholder, className, readOnly }) => {
  const [disp, setDisp] = useState(() => numericValue===0?'':toSep(numericValue));
  const f = useRef(false);
  useEffect(() => { if(!f.current) setDisp(numericValue===0?'':toSep(numericValue)); }, [numericValue]);
  return (
    <input type="text" inputMode={readOnly?'text':'numeric'} placeholder={readOnly?(numericValue===0?'—':undefined):(placeholder??'0')}
      value={disp} readOnly={readOnly} className={className}
      onFocus={() => { if(readOnly)return; f.current=true; if(disp==='0')setDisp(''); }}
      onBlur={() => { if(readOnly)return; f.current=false; const n=parseNum(disp); setDisp(n===0?'':toSep(n)); onChange?.(n); }}
      onChange={(e) => { if(readOnly)return; const r=e.target.value.replace(/\D/g,''); setDisp(r===''?'':toSep(r)); }}
      style={{ ...style, ...(readOnly?{cursor:'default',pointerEvents:'none',userSelect:'text',opacity:numericValue===0?0.38:0.82}:{}) }} />
  );
});
LocalInput.displayName = 'LocalInput';

const G = ({ d, t }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
    ::-webkit-scrollbar{width:5px;height:5px} ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:${d?'rgba(255,255,255,0.10)':'rgba(0,0,0,0.12)'};border-radius:99px}
    input{font-size:16px!important}
    .fpi{width:100%;background:${t.inputBg};border:1px solid ${t.inputBd};border-radius:9px;padding:10px 13px;font-weight:600;color:${t.hi};outline:none;transition:border-color 0.14s;font-family:inherit;letter-spacing:-0.01em;-webkit-font-smoothing:antialiased;box-sizing:border-box}
    .fpi:focus{border-color:#ED1C24;box-shadow:0 0 0 3px rgba(237,28,36,0.14)} .fpi::placeholder{color:${t.lo};font-weight:400}
    .fpi-c{text-align:center} .fpi-sm{padding:8px 6px}
    .fpi-ro{width:100%;background:${t.roBg};border:1px solid ${t.roBd};border-radius:9px;padding:10px 13px;font-weight:600;color:${t.hi};font-family:inherit;letter-spacing:-0.01em;box-sizing:border-box;pointer-events:none;user-select:text;outline:none}
    .fpi-ro-sm{padding:8px 6px;text-align:center}
    /* input nama program lain — tinggi sama dengan fpi-sm */
    .fname{width:100%;background:${t.inputBg};border:1px solid ${t.inputBd};border-radius:8px;padding:8px 10px;font-weight:600;color:${t.hi};outline:none;transition:border-color 0.14s;font-family:inherit;font-size:13px;box-sizing:border-box}
    .fname:focus{border-color:#ED1C24;box-shadow:0 0 0 3px rgba(237,28,36,0.14)} .fname::placeholder{color:${t.lo};font-weight:400}
    .lbl{display:block;font-size:10px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:${t.mid};margin-bottom:6px}
    .erow:hover td{background:rgba(237,28,36,0.03)!important}
    .erow-pf td{background:${d?'rgba(167,139,250,0.04)':'rgba(124,58,237,0.03)'}!important} .erow-pf:hover td{background:${d?'rgba(167,139,250,0.08)':'rgba(124,58,237,0.06)'}!important}
    .erow-lain td{background:${d?'rgba(237,28,36,0.025)':'rgba(237,28,36,0.015)'}!important} .erow-lain:hover td{background:${d?'rgba(237,28,36,0.06)':'rgba(237,28,36,0.04)'}!important}
    @keyframes fpbreathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.38;transform:scale(0.9)}}
    @keyframes fpspin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
    .btn-p{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:9px;background:linear-gradient(135deg,#ED1C24 0%,#C6168D 100%);color:#fff;border:none;cursor:pointer;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;box-shadow:0 2px 10px rgba(237,28,36,0.30);font-family:inherit;transition:all 0.14s}
    .btn-p:hover{box-shadow:0 4px 18px rgba(237,28,36,0.42);transform:translateY(-1px)} .btn-p:disabled{opacity:0.6;cursor:not-allowed;transform:none;box-shadow:none}
    .btn-g{display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border-radius:9px;border:1px solid ${t.line};background:${t.sub};cursor:pointer;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${t.mid};transition:all 0.13s;font-family:inherit}
    .btn-g:hover{border-color:#ED1C24;color:#ED1C24}
    .btn-af{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:7px;border:1px solid ${t.violetBd};background:${t.violetBg};color:${t.violet};cursor:pointer;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;font-family:inherit;transition:all 0.13s}
    .btn-af:hover{background:${d?'rgba(167,139,250,0.20)':'rgba(124,58,237,0.13)'};transform:translateY(-1px)} .btn-af:disabled{opacity:0.5;cursor:not-allowed;transform:none}
    .btn-rs{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:7px;border:1px solid ${t.amberBd};background:${t.amberBg};color:${t.amber};cursor:pointer;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;font-family:inherit;transition:all 0.13s}
    .btn-rs:hover{background:${d?'rgba(255,203,5,0.20)':'rgba(255,203,5,0.16)'}}
    .pf-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;background:${t.violetBg};border:1px solid ${t.violetBd};color:${t.violet};font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase}
    .btn-add-lain{display:inline-flex;align-items:center;gap:5px;padding:6px 13px;border-radius:8px;border:1px dashed ${t.blueBd};background:${t.blueBg};color:${t.blue};cursor:pointer;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;font-family:inherit;transition:all 0.14s}
    .btn-add-lain:hover{background:${t.blue};color:#fff;border-style:solid} .btn-add-lain:disabled{opacity:0.38;cursor:not-allowed}
    .btn-rm{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;border:1px solid ${t.line};background:transparent;color:${t.red};cursor:pointer;transition:all 0.13s;flex-shrink:0}
    .btn-rm:hover{background:${d?'rgba(255,107,107,0.12)':'rgba(220,38,38,0.08)'};border-color:${t.red}}
    .f-item{display:flex;align-items:center;gap:9px;padding:8px 12px;border-radius:8px;border:1px solid ${t.line};background:${t.sub};transition:border-color 0.13s}
    .f-item:hover{border-color:${t.blueBd}}
    .f-rm{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:5px;border:none;background:transparent;color:${t.lo};cursor:pointer;transition:all 0.13s;flex-shrink:0}
    .f-rm:hover{background:${t.redBg};color:${t.red}}
  `}</style>
);

const Card = ({ children, t, style={} }) => <div style={{ borderRadius:12, border:`1px solid ${t.line}`, background:t.card, boxShadow:t.sm, overflow:'visible', ...style }}>{children}</div>;
const Body = ({ children, style={} }) => <div style={{ padding:'22px 24px', ...style }}>{children}</div>;
const SecLabel = ({ children, t }) => (
  <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:16 }}>
    <div style={{ width:3, height:13, borderRadius:99, background:t.blue, flexShrink:0 }} />
    <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:t.mid }}>{children}</span>
  </div>
);

function DisabledMonthOverlay({ month, t, d }) {
  return (
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:320,gap:16,padding:'40px 24px',textAlign:'center' }}>
      <div style={{ width:64,height:64,borderRadius:16,background:d?'rgba(100,100,120,0.14)':'rgba(100,100,120,0.09)',border:`1.5px solid ${t.disabledBd}`,display:'flex',alignItems:'center',justifyContent:'center' }}>
        <Ban size={28} style={{ color:t.disabledColor }} />
      </div>
      <div>
        <div style={{ fontSize:18,fontWeight:800,letterSpacing:'-0.03em',color:t.hi,marginBottom:8 }}>Bulan Dinonaktifkan</div>
        <div style={{ fontSize:14,color:t.mid,lineHeight:1.65,maxWidth:340 }}>Bulan <strong style={{ color:t.hi }}>{month}</strong> telah dinonaktifkan dari PNL Control Center.</div>
      </div>
      <div style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:99,background:d?'rgba(100,100,120,0.12)':'rgba(100,100,120,0.08)',border:`1px solid ${t.disabledBd}`,fontSize:12,fontWeight:600,color:t.disabledColor }}>
        Pilih bulan lain dari header untuk melanjutkan
      </div>
    </div>
  );
}

function PrefillBanner({ prevMonth, prevYear, onReset, t }) {
  return (
    <motion.div initial={{ opacity:0,y:-6,scale:0.98 }} animate={{ opacity:1,y:0,scale:1 }} exit={{ opacity:0,y:-4 }} transition={{ duration:0.18 }}
      style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:'10px 14px',borderRadius:9,background:t.violetBg,border:`1px solid ${t.violetBd}`,marginBottom:10 }}>
      <div style={{ display:'flex',alignItems:'center',gap:8 }}>
        <Sparkles size={13} style={{ color:t.violet,flexShrink:0 }} />
        <span style={{ fontSize:11,fontWeight:600,color:t.violet }}>Data diisi otomatis dari <strong>{prevMonth} {prevYear}</strong> — bisa kamu edit langsung</span>
      </div>
      <button className="btn-rs" onClick={onReset}><RotateCcw size={10}/> Reset</button>
    </motion.div>
  );
}

function AutoFillButton({ isLoading, isPrefilled, onClick }) {
  if (isPrefilled) return null;
  return (
    <button className="btn-af" onClick={onClick} disabled={isLoading}>
      {isLoading?<><Loader2 size={10} style={{ animation:'fpspin 1s linear infinite' }}/>Memuat...</>:<><History size={10}/>Isi dari Bulan Lalu</>}
    </button>
  );
}

function Stepper({ step, setStep, t, d }) {
  const ITEMS = [{s:1,label:'OPEX'},{s:2,label:'SDM'},{s:3,label:'Mkt'},{s:4,label:'COM'},{s:5,label:'Review'}];
  const R=34, pct=((step-1)/(ITEMS.length-1))*100;
  return (
    <div style={{ paddingBottom:36,paddingTop:4 }}>
      <div style={{ position:'relative',display:'flex',alignItems:'flex-start',justifyContent:'space-between' }}>
        <div style={{ position:'absolute',top:R/2,left:R/2,right:R/2,height:1,background:t.line,transform:'translateY(-50%)',zIndex:0 }}/>
        <div style={{ position:'absolute',top:R/2,left:R/2,height:2,background:'linear-gradient(90deg,#ED1C24,#C6168D)',width:`calc((100% - ${R}px) * ${pct/100})`,transform:'translateY(-50%)',borderRadius:99,transition:'width 0.3s ease',zIndex:1 }}/>
        {ITEMS.map(item => {
          const isA=step===item.s, isP=step>item.s;
          return (
            <div key={item.s} style={{ position:'relative',zIndex:2,display:'flex',flexDirection:'column',alignItems:'center',width:R }}>
              <button onClick={()=>setStep(item.s)} style={{ width:R,height:R,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:12,border:`2px solid ${(isA||isP)?'#ED1C24':t.line}`,background:(isA||isP)?'linear-gradient(135deg,#ED1C24,#C6168D)':(d?'#1A1A1D':'#FFFFFF'),color:(isA||isP)?'#fff':t.lo,cursor:'pointer',outline:'none',transition:'all 0.2s',transform:isA?'scale(1.10)':'scale(1)',boxShadow:isA?`0 0 0 4px rgba(237,28,36,0.15),0 3px 10px rgba(237,28,36,0.28)`:'none',flexShrink:0,fontFamily:'inherit' }}>
                {isP?<CheckCircle2 size={15} strokeWidth={2.5}/>:item.s}
              </button>
              <span style={{ marginTop:9,fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:isA?'#ED1C24':t.lo,whiteSpace:'nowrap',transition:'color 0.2s' }}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SecHero({ icon:Icon, step, title, t, children }) {
  return (
    <div style={{ padding:'14px 18px',borderRadius:10,border:`1px solid ${t.blueBd}`,background:t.blueBg,marginBottom:18,boxShadow:t.sm }}>
      <div style={{ display:'flex',alignItems:'center',gap:14 }}>
        <div style={{ width:38,height:38,borderRadius:9,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#ED1C24,#C6168D)',color:'#fff' }}><Icon size={18}/></div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:10,fontWeight:700,letterSpacing:'0.10em',textTransform:'uppercase',color:t.blue,marginBottom:3 }}>Langkah {step} dari 5</div>
          <div style={{ fontSize:17,fontWeight:800,letterSpacing:'-0.03em',color:t.hi,lineHeight:1.2 }}>{title}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ExpenseTable — statis (OPEX / SDM / COM) tanpa kolom Tipe
function ExpenseTable({ items, sectionKey, onUpdate, t, readOnly, prefillKeys }) {
  const vis = readOnly ? items.filter(i=>i.total>0) : items;
  return (
    <Card t={t}><Body>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:460 }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${t.line}` }}>
              <th style={{ padding:'7px 10px',textAlign:'left',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.lo }}>Sub-Kategori</th>
              <th style={{ padding:'7px 6px',width:72,textAlign:'center',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.lo }}>Qty</th>
              <th style={{ padding:'7px 6px',width:148,textAlign:'left',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.lo }}>Harga Satuan</th>
              <th style={{ padding:'7px 10px',width:130,textAlign:'right',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.lo }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {vis.length===0
              ? <tr><td colSpan={4} style={{ padding:'18px 10px',textAlign:'center',color:t.lo,fontSize:12 }}>Tidak ada data untuk periode ini</td></tr>
              : vis.map(item => {
                const isPF = prefillKeys?.has(item.id);
                return (
                  <tr key={item.id} className={`erow${isPF?' erow-pf':''}`} style={{ borderBottom:`1px solid ${t.lineH}` }}>
                    <td style={{ padding:'9px 10px',verticalAlign:'middle' }}>
                      <div style={{ fontWeight:700,color:t.hi,fontSize:13 }}>{item.name}</div>
                      {isPF&&<div style={{ marginTop:3 }}><span className="pf-badge"><Sparkles size={7}/>Diisi otomatis</span></div>}
                    </td>
                    <td style={{ padding:'9px 6px',width:72,verticalAlign:'middle' }}>
                      <LocalInput numericValue={item.qty} onChange={v=>onUpdate(sectionKey,item.id,'qty',v)} className={readOnly?'fpi fpi-ro fpi-ro-sm':'fpi fpi-c fpi-sm'} readOnly={readOnly}/>
                    </td>
                    <td style={{ padding:'9px 6px',width:148,verticalAlign:'middle' }}>
                      <LocalInput numericValue={item.price} onChange={v=>onUpdate(sectionKey,item.id,'price',v)} className={readOnly?'fpi fpi-ro fpi-sm':'fpi fpi-sm'} readOnly={readOnly}/>
                    </td>
                    <td style={{ padding:'9px 10px',textAlign:'right',whiteSpace:'nowrap',verticalAlign:'middle' }}>
                      <div style={{ fontWeight:700,fontSize:13,color:item.total>0?t.green:t.lo,fontVariantNumeric:'tabular-nums' }}>{formatIDR(item.total)}</div>
                      {item.total>0&&<div style={{ fontSize:10,color:t.lo,marginTop:1,fontVariantNumeric:'tabular-nums' }}>{formatPct(item.composition)}</div>}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </Body></Card>
  );
}

// MarketingTable — ada kolom "Tipe" (56px) di kiri sebagai penanda
// Kolom: [Tipe 56px][Sub-Kategori/Nama flex][Qty 72px][Harga 148px][Total 120px][Aksi 36px]
// Badge ada di kolom Tipe, BUKAN di bawah nama → semua kolom lain RATA
function MarketingTable({ staticItems, lainItems, sectionKey, onUpdate, onUpdateLain, onAddLain, onRemoveLain, t, readOnly }) {
  const visS = readOnly ? staticItems.filter(i=>i.total>0) : staticItems;
  const visL = readOnly ? lainItems.filter(i=>i.total>0)   : lainItems;

  // Badge kecil di kolom Tipe
  const Badge = ({ label, color, bg, bd }) => (
    <div style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',padding:'3px 6px',borderRadius:6,background:bg,border:`1px solid ${bd}`,fontSize:9,fontWeight:800,letterSpacing:'0.06em',textTransform:'uppercase',color,lineHeight:1.2,whiteSpace:'nowrap' }}>
      {label}
    </div>
  );

  const TotalCell = ({ item }) => (
    <td style={{ padding:'9px 10px',width:120,textAlign:'right',whiteSpace:'nowrap',verticalAlign:'middle' }}>
      <div style={{ fontWeight:700,fontSize:13,color:item.total>0?t.green:t.lo,fontVariantNumeric:'tabular-nums' }}>{formatIDR(item.total)}</div>
      {item.total>0&&<div style={{ fontSize:10,color:t.lo,marginTop:1,fontVariantNumeric:'tabular-nums' }}>{formatPct(item.composition)}</div>}
    </td>
  );

  return (
    <Card t={t}><Body>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:520 }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${t.line}` }}>
              <th style={{ padding:'7px 6px',width:56,textAlign:'center',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.lo }}>Tipe</th>
              <th style={{ padding:'7px 10px',textAlign:'left',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.lo }}>Sub-Kategori</th>
              <th style={{ padding:'7px 6px',width:72,textAlign:'center',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.lo }}>Qty</th>
              <th style={{ padding:'7px 6px',width:148,textAlign:'left',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.lo }}>Harga Satuan</th>
              <th style={{ padding:'7px 10px',width:120,textAlign:'right',fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.lo }}>Total</th>
              <th style={{ width:36 }}/>
            </tr>
          </thead>
          <tbody>
            {/* Baris statis */}
            {visS.map(item => (
              <tr key={item.id} className="erow" style={{ borderBottom:`1px solid ${t.lineH}` }}>
                <td style={{ padding:'9px 6px',textAlign:'center',verticalAlign:'middle' }}>
                  <Badge label="Mkt" color={t.green} bg={t.greenBg} bd={t.greenBd}/>
                </td>
                <td style={{ padding:'9px 10px',verticalAlign:'middle' }}>
                  <div style={{ fontWeight:700,color:t.hi,fontSize:13 }}>{item.name}</div>
                </td>
                <td style={{ padding:'9px 6px',width:72,verticalAlign:'middle' }}>
                  <LocalInput numericValue={item.qty} onChange={v=>onUpdate(sectionKey,item.id,'qty',v)} className={readOnly?'fpi fpi-ro fpi-ro-sm':'fpi fpi-c fpi-sm'} readOnly={readOnly}/>
                </td>
                <td style={{ padding:'9px 6px',width:148,verticalAlign:'middle' }}>
                  <LocalInput numericValue={item.price} onChange={v=>onUpdate(sectionKey,item.id,'price',v)} className={readOnly?'fpi fpi-ro fpi-sm':'fpi fpi-sm'} readOnly={readOnly}/>
                </td>
                <TotalCell item={item}/>
                <td/>
              </tr>
            ))}

            {/* Divider */}
            {(visL.length>0||!readOnly) && (
              <tr>
                <td colSpan={6} style={{ padding:'10px 10px 4px' }}>
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <div style={{ flex:1,height:1,background:t.line }}/>
                    <span style={{ fontSize:10,fontWeight:700,letterSpacing:'0.09em',textTransform:'uppercase',color:t.blue,opacity:0.75,whiteSpace:'nowrap' }}>Program Lain</span>
                    <div style={{ flex:1,height:1,background:t.line }}/>
                  </div>
                </td>
              </tr>
            )}

            {/* Baris dinamis Program Lain */}
            {visL.map((item, idx) => (
              <tr key={item.id} className="erow erow-lain" style={{ borderBottom:`1px solid ${t.lineH}` }}>
                {/* Kolom Tipe: badge L1, L2, dst */}
                <td style={{ padding:'9px 6px',textAlign:'center',verticalAlign:'middle' }}>
                  <Badge label={`L${idx+1}`} color={t.blue} bg={t.blueBg} bd={t.blueBd}/>
                </td>
                {/* Kolom Nama: input atau text — TIDAK ada elemen tambahan di bawahnya */}
                <td style={{ padding:'9px 10px',verticalAlign:'middle' }}>
                  {readOnly
                    ? <div style={{ fontWeight:700,color:t.hi,fontSize:13 }}>{item.label||`Program Lain ${idx+1}`}</div>
                    : <input className="fname" type="text" value={item.label}
                        placeholder={`Nama program lain ${idx+1}...`}
                        onChange={e=>onUpdateLain(item.id,'label',e.target.value)}/>
                  }
                </td>
                <td style={{ padding:'9px 6px',width:72,verticalAlign:'middle' }}>
                  <LocalInput numericValue={item.qty} onChange={v=>onUpdateLain(item.id,'qty',v)} className={readOnly?'fpi fpi-ro fpi-ro-sm':'fpi fpi-c fpi-sm'} readOnly={readOnly}/>
                </td>
                <td style={{ padding:'9px 6px',width:148,verticalAlign:'middle' }}>
                  <LocalInput numericValue={item.price} onChange={v=>onUpdateLain(item.id,'price',v)} className={readOnly?'fpi fpi-ro fpi-sm':'fpi fpi-sm'} readOnly={readOnly}/>
                </td>
                <TotalCell item={item}/>
                <td style={{ padding:'9px 6px',textAlign:'center',verticalAlign:'middle' }}>
                  {!readOnly&&<button className="btn-rm" onClick={()=>onRemoveLain(item.id)}><Trash2 size={13}/></button>}
                </td>
              </tr>
            ))}

            {/* Tombol tambah */}
            {!readOnly&&(
              <tr>
                <td colSpan={6} style={{ padding:'8px 10px 10px' }}>
                  <button className="btn-add-lain" onClick={onAddLain} disabled={lainItems.length>=MAX_LAIN}>
                    <Plus size={12}/> Tambah Program Lain
                    {lainItems.length>=MAX_LAIN&&<span style={{ opacity:0.55,fontWeight:400,textTransform:'none',letterSpacing:0 }}>&nbsp;(maks {MAX_LAIN})</span>}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Body></Card>
  );
}

// MultiFileUpload
function MultiFileUpload({ files, setFiles, dragState, setDragState, inputId, t }) {
  const handleDrop = (e) => { e.preventDefault(); setDragState(false); const f=Array.from(e.dataTransfer.files); setFiles(p=>{const ex=new Set(p.map(f=>f.name+f.size)); return [...p,...f.filter(f=>!ex.has(f.name+f.size))]}); };
  const handleChange = (e) => { const f=Array.from(e.target.files); setFiles(p=>{const ex=new Set(p.map(f=>f.name+f.size)); return [...p,...f.filter(f=>!ex.has(f.name+f.size))]}); e.target.value=''; };
  const icon = (f) => f.type.includes('pdf')?'📄':f.type.includes('sheet')||f.name.endsWith('.xlsx')||f.name.endsWith('.xls')?'📊':f.type.includes('image')?'🖼️':'📎';
  return (
    <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
      <div onDragOver={e=>{e.preventDefault();setDragState(true)}} onDragLeave={()=>setDragState(false)} onDrop={handleDrop}
        style={{ border:`1.5px dashed ${dragState?t.blue:t.line}`,borderRadius:10,padding:'14px',textAlign:'center',background:dragState?t.blueBg:'transparent',transition:'all 0.15s',cursor:'pointer' }}>
        <label htmlFor={inputId} style={{ cursor:'pointer',display:'block' }}>
          <input type="file" id={inputId} multiple accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={handleChange}/>
          <Upload size={20} style={{ color:t.lo,margin:'0 auto 7px' }}/>
          <div style={{ fontSize:13,fontWeight:600,color:t.mid }}>{files.length>0?'Tambah File Lagi':'Upload Lampiran'}</div>
          <div style={{ fontSize:11,color:t.lo,marginTop:2 }}>PDF, Excel, Gambar · Bisa multiple · Drag & drop</div>
        </label>
      </div>
      {files.length>0&&(
        <div style={{ display:'flex',flexDirection:'column',gap:5 }}>
          <div style={{ fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:t.mid }}>{files.length} File Terlampir</div>
          <AnimatePresence>
            {files.map((file,idx)=>(
              <motion.div key={file.name+file.size+idx} initial={{ opacity:0,y:-5 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,x:-8 }} transition={{ duration:0.14 }} className="f-item">
                <span style={{ fontSize:15,flexShrink:0 }}>{icon(file)}</span>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:12,fontWeight:600,color:t.hi,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{file.name}</div>
                  <div style={{ fontSize:10,color:t.lo,marginTop:1 }}>{fmtSize(file.size)}</div>
                </div>
                <button className="f-rm" onClick={()=>setFiles(p=>p.filter((_,i)=>i!==idx))}><X size={13}/></button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function SubtotalBanner({ label, value, t }) {
  return (
    <div style={{ padding:'15px 20px',borderRadius:12,background:'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,boxShadow:'0 4px 20px rgba(237,28,36,0.28)' }}>
      <div style={{ display:'flex',alignItems:'center',gap:10 }}>
        <div style={{ width:34,height:34,borderRadius:8,background:'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff' }}><Calculator size={16}/></div>
        <span style={{ fontSize:12,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:'#fff' }}>{label}</span>
      </div>
      <span style={{ fontSize:26,fontWeight:800,letterSpacing:'-0.04em',color:'#fff',fontVariantNumeric:'tabular-nums' }}>{formatIDR(value)}</span>
    </div>
  );
}

function SumRow({ icon:Icon, label, value, highlight, t }) {
  return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'12px 0',borderBottom:`1px solid ${t.lineH}` }}>
      <div style={{ display:'flex',alignItems:'center',gap:10,minWidth:0 }}>
        <div style={{ width:30,height:30,borderRadius:7,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:t.blueBg }}><Icon size={14} style={{ color:t.blue }}/></div>
        <span style={{ fontSize:13,fontWeight:600,color:t.mid,letterSpacing:'0.01em',whiteSpace:'nowrap' }}>{label}</span>
      </div>
      <span style={{ fontSize:14,fontWeight:700,letterSpacing:'-0.02em',color:highlight?t.green:value<0?t.red:t.hi,fontVariantNumeric:'tabular-nums',textAlign:'right',flexShrink:0 }}>{formatIDR(value)}</span>
    </div>
  );
}

function FooterNav({ step, setStep, totalSteps=5, readOnly, isSaving, onDraft, onSubmit, t, d }) {
  return (
    <div style={{ position:'fixed',bottom:0,left:0,right:0,borderTop:`1px solid ${t.line}`,background:d?'rgba(13,13,14,0.94)':'rgba(255,255,255,0.94)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',zIndex:60,padding:'11px 20px' }}>
      <div style={{ width:'100%',margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'flex-end',gap:10 }}>
        {!readOnly&&<button onClick={onDraft} disabled={isSaving} className="btn-g">{isSaving?<><Loader2 size={13} style={{ animation:'fpspin 1s linear infinite' }}/>Simpan...</>:<><Save size={13}/>Draft</>}</button>}
        {step>1&&<button onClick={()=>setStep(s=>s-1)} className="btn-g"><ArrowLeft size={13}/>Kembali</button>}
        {step<totalSteps?<button onClick={()=>setStep(s=>s+1)} className="btn-p">Lanjut <ArrowRight size={13}/></button>:(!readOnly&&<button onClick={onSubmit} disabled={isSaving} className="btn-p"><Send size={13}/>Kirim</button>)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
const FormPengeluaran = ({
  onUpdate, theme, setIsFormDirty, activeContext, onSaveSuccess, readOnly=false,
  disabledMonths=new Set(), onMonthChange,
}) => {
  const [step,setStep]       = useState(1);
  const [showSubmit,setShowSubmit] = useState(false);
  const [isLoading,setIsLoading]   = useState(true);
  const [isSaving,setIsSaving]     = useState(false);
  const [files,setFiles]           = useState([]);
  const [mktFiles,setMktFiles]     = useState([]);
  const [drag,setDrag]             = useState(false);
  const [mktDrag,setMktDrag]       = useState(false);
  const [toast,setToast]           = useState({show:false,type:'success',msg:''});
  const [reportStatus,setReportStatus] = useState({isFinalized:false,finalizedAt:null,finalizedBy:null,validationNotes:null,updatedAt:null});
  const [prefillState,setPrefillState] = useState({
    opex:{loading:false,done:false,keys:new Set()},sdm:{loading:false,done:false,keys:new Set()},
    marketing:{loading:false,done:false,keys:new Set()},com:{loading:false,done:false,keys:new Set()},
  });
  const snap = useRef({});
  const d = theme==='dark', t = mk(d);
  const toast$ = (type,msg) => { setToast({show:true,type,msg}); setTimeout(()=>setToast(p=>({...p,show:false})),4000); };
  const currentMonth   = activeContext?.month??'';
  const monthDisabled  = Boolean(currentMonth&&disabledMonths.has(currentMonth));
  const effRO          = readOnly||monthDisabled;

  const defaults = useCallback(() => ({
    opex:[
      {id:'o1',dbQty:'qty_opex_gedung',   dbPrice:'price_opex_gedung',   name:'Infrastruktur Gedung',qty:0,price:0},
      {id:'o2',dbQty:'qty_opex_kendaraan',dbPrice:'price_opex_kendaraan',name:'Penyewaan Kendaraan', qty:0,price:0},
      {id:'o3',dbQty:'qty_opex_listrik',  dbPrice:'price_opex_listrik',  name:'Listrik',             qty:0,price:0},
      {id:'o4',dbQty:'qty_opex_air',      dbPrice:'price_opex_air',      name:'Air',                 qty:0,price:0},
      {id:'o5',dbQty:'qty_opex_it',       dbPrice:'price_opex_it',       name:'Telekomunikasi & IT', qty:0,price:0},
      {id:'o6',dbQty:'qty_opex_logistik', dbPrice:'price_opex_logistik', name:'Logistik (Gudang)',   qty:0,price:0},
      {id:'o7',dbQty:'qty_opex_asuransi', dbPrice:'price_opex_asuransi', name:'Asuransi Aset',       qty:0,price:0},
      {id:'o8',dbQty:'qty_opex_lain',     dbPrice:'price_opex_lain',     name:'Lain-lain Internal',  qty:0,price:0},
    ],
    sdm:[
      {id:'s1', dbQty:'qty_sdm_bm',              dbPrice:'price_sdm_bm',              name:'Benefit BM',                 qty:0,price:0},
      {id:'s2', dbQty:'qty_sdm_tm',              dbPrice:'price_sdm_tm',              name:'Benefit TM',                 qty:0,price:0},
      {id:'s3', dbQty:'qty_sdm_om',              dbPrice:'price_sdm_om',              name:'Benefit Operational Manager',qty:0,price:0},
      {id:'s4', dbQty:'qty_sdm_gm',              dbPrice:'price_sdm_gm',              name:'Benefit GM',                 qty:0,price:0},
      {id:'s5', dbQty:'qty_sdm_hrd',             dbPrice:'price_sdm_hrd',             name:'Benefit HRD',                qty:0,price:0},
      {id:'s6', dbQty:'qty_sdm_mis',             dbPrice:'price_sdm_mis',             name:'Benefit MIS',                qty:0,price:0},
      {id:'s7', dbQty:'qty_sdm_som',             dbPrice:'price_sdm_som',             name:'Benefit SOM',                qty:0,price:0},
      {id:'s8', dbQty:'qty_sdm_finance_spv',     dbPrice:'price_sdm_finance_spv',     name:'Benefit Finance SPV',        qty:0,price:0},
      {id:'s9', dbQty:'qty_sdm_finance_staff',   dbPrice:'price_sdm_finance_staff',   name:'Benefit Finance Staff',      qty:0,price:0},
      {id:'s10',dbQty:'qty_sdm_ob',              dbPrice:'price_sdm_ob',              name:'Benefit OB',                 qty:0,price:0},
      {id:'s11',dbQty:'qty_sdm_tss',             dbPrice:'price_sdm_tss',             name:'Territory Sales SPV',        qty:0,price:0},
      {id:'s12',dbQty:'qty_sdm_admin',           dbPrice:'price_sdm_admin',           name:'Benefit Admin & WH',         qty:0,price:0},
      {id:'s13',dbQty:'qty_sdm_finance',         dbPrice:'price_sdm_finance',         name:'Benefit Finance',            qty:0,price:0},
      {id:'s14',dbQty:'qty_sdm_md',              dbPrice:'price_sdm_md',              name:'Benefit MD',                 qty:0,price:0},
      {id:'s15',dbQty:'qty_sdm_ss',              dbPrice:'price_sdm_ss',              name:'Benefit Sales Support',      qty:0,price:0},
      {id:'s16',dbQty:'qty_sdm_ops',             dbPrice:'price_sdm_ops',             name:'Operasional Staff',          qty:0,price:0},
      {id:'s17',dbQty:'qty_sdm_dinas',           dbPrice:'price_sdm_dinas',           name:'Perjalanan Dinas',           qty:0,price:0},
      {id:'s18',dbQty:'qty_sdm_benefit_sales',   dbPrice:'price_sdm_benefit_sales',   name:'Benefit Sales',              qty:0,price:0},
      {id:'s19',dbQty:'qty_sdm_benefit_nonsales',dbPrice:'price_sdm_benefit_nonsales',name:'Benefit Non-Sales',          qty:0,price:0},
    ],
    marketing:[
      {id:'m1', dbQty:'qty_mkt_ws',     dbPrice:'price_mkt_ws',     name:'Program Wholeseller',          qty:0,price:0},
      {id:'m2', dbQty:'qty_mkt_retail', dbPrice:'price_mkt_retail', name:'Program Retail',               qty:0,price:0},
      {id:'m25',dbQty:'qty_mkt_starter',dbPrice:'price_mkt_starter',name:'Diskon / Subsidi Starter Pack',qty:0,price:0},
      {id:'m3', dbQty:'qty_mkt_event',  dbPrice:'price_mkt_event',  name:'Program Event',                qty:0,price:0},
    ],
    mktLain:[],
    com:[
      {id:'c1',dbQty:'qty_com_admin',dbPrice:'price_com_admin',name:'Biaya Administrasi', qty:0,price:0},
      {id:'c2',dbQty:'qty_com_bunga',dbPrice:'price_com_bunga',name:'Bunga Pinjaman Bank',qty:0,price:0},
    ],
    partnerExpense:0,
  }),[]);

  const [data,setData] = useState(defaults);
  const fetched$ = useRef(false), prevCtx$ = useRef({});

  useEffect(()=>{
    const ctx={mpxName:activeContext?.mpxName,branch:activeContext?.branch,mpxType:activeContext?.mpxType,month:activeContext?.month,year:activeContext?.year};
    const same=prevCtx$.current.mpxName===ctx.mpxName&&prevCtx$.current.branch===ctx.branch&&prevCtx$.current.month===ctx.month&&prevCtx$.current.year===ctx.year;
    if(same&&fetched$.current)return;
    setPrefillState({opex:{loading:false,done:false,keys:new Set()},sdm:{loading:false,done:false,keys:new Set()},marketing:{loading:false,done:false,keys:new Set()},com:{loading:false,done:false,keys:new Set()}});
    snap.current={};
    if(monthDisabled){setIsLoading(false);setData(defaults());return;}
    (async()=>{
      if(!ctx.mpxName||!ctx.branch){setIsLoading(false);return;}
      setIsLoading(true);
      try{
        const{data:db,error}=await supabase.from('pnl_reports').select('*')
          .eq('partner_name',ctx.mpxName).eq('branch',ctx.branch)
          .eq('mpc_mp3',ctx.mpxType).eq('month',ctx.month).eq('year',ctx.year).maybeSingle();
        if(error)throw error;
        const s=defaults();
        if(db){
          s.opex=s.opex.map(i=>({...i,qty:db[i.dbQty]??0,price:db[i.dbPrice]??0}));
          s.sdm=s.sdm.map(i=>({...i,qty:db[i.dbQty]??0,price:db[i.dbPrice]??0}));
          s.marketing=s.marketing.map(i=>({...i,qty:db[i.dbQty]??0,price:db[i.dbPrice]??0}));
          s.com=s.com.map(i=>({...i,qty:db[i.dbQty]??0,price:db[i.dbPrice]??0}));
          s.partnerExpense=db.partner_expense??0;
          const rows=[];
          for(let n=1;n<=MAX_LAIN;n++){
            const qty=db[lainDbQty(n)]??0, price=db[lainDbPrice(n)]??0, label=db[lainDbLabel(n)]??'';
            if(qty>0||price>0||label) rows.push({id:`lain_${n}`,slotN:n,label,qty,price});
          }
          s.mktLain=rows;
          setReportStatus({isFinalized:db.is_finalized??false,finalizedAt:db.finalized_at??null,finalizedBy:db.finalized_by??null,validationNotes:db.validation_notes??null,updatedAt:db.updated_at??null});
        }
        setData(s); prevCtx$.current=ctx; fetched$.current=true;
      }catch(e){console.error('Fetch:',e.message);setData(defaults());}
      finally{setIsLoading(false);setIsFormDirty?.(false);}
    })();
  },[activeContext,defaults,setIsFormDirty,monthDisabled]);

  const handleAutoFill = useCallback(async(sk)=>{
    if(effRO)return;
    const ctx=activeContext;
    if(!ctx?.mpxName||!ctx?.branch||!ctx?.month||!ctx?.year){toast$('error','Konteks belum lengkap');return;}
    const{prevMonth,prevYear}=getPrevMY(ctx.month,ctx.year);
    if(!prevMonth){toast$('error','Tidak dapat menentukan bulan sebelumnya');return;}
    setPrefillState(p=>({...p,[sk]:{...p[sk],loading:true}}));
    try{
      const{data:db,error}=await supabase.from('pnl_reports').select('*')
        .eq('partner_name',ctx.mpxName).eq('branch',ctx.branch)
        .eq('mpc_mp3',ctx.mpxType).eq('month',prevMonth).eq('year',prevYear).maybeSingle();
      if(error)throw error;
      if(!db){toast$('error',`Tidak ada data ${prevMonth} ${prevYear}`);setPrefillState(p=>({...p,[sk]:{...p[sk],loading:false}}));return;}
      setData(prev=>{
        if(sk==='marketing'){
          snap.current[sk]={static:[...prev.marketing.map(i=>({...i}))],lain:[...prev.mktLain]};
          const fk=new Set();
          const us=prev.marketing.map(i=>{const nq=db[i.dbQty]??0,np=db[i.dbPrice]??0;if(nq||np)fk.add(i.id);return{...i,qty:nq,price:np};});
          const lr=[];
          for(let n=1;n<=MAX_LAIN;n++){const qty=db[lainDbQty(n)]??0,price=db[lainDbPrice(n)]??0,label=db[lainDbLabel(n)]??'';if(qty>0||price>0||label)lr.push({id:`lain_${n}`,slotN:n,label,qty,price});}
          setPrefillState(p2=>({...p2,marketing:{loading:false,done:true,keys:fk}}));
          return{...prev,marketing:us,mktLain:lr};
        }
        snap.current[sk]=prev[sk].map(i=>({...i}));
        const fk=new Set();
        const upd=prev[sk].map(i=>{const nq=db[i.dbQty]??0,np=db[i.dbPrice]??0;if(nq||np)fk.add(i.id);return{...i,qty:nq,price:np};});
        setPrefillState(p2=>({...p2,[sk]:{loading:false,done:true,keys:fk}}));
        return{...prev,[sk]:upd};
      });
      setIsFormDirty?.(true);
      toast$('success',`Data ${sk.toUpperCase()} diisi dari ${prevMonth} ${prevYear}`);
    }catch(err){toast$('error',err.message||'Gagal');setPrefillState(p=>({...p,[sk]:{...p[sk],loading:false}}));}
  },[activeContext,effRO,setIsFormDirty]);

  const handleReset = useCallback((sk)=>{
    const s=snap.current[sk]; if(!s)return;
    if(sk==='marketing')setData(p=>({...p,marketing:s.static,mktLain:s.lain}));
    else setData(p=>({...p,[sk]:s}));
    setPrefillState(p=>({...p,[sk]:{loading:false,done:false,keys:new Set()}}));
    snap.current[sk]=undefined; setIsFormDirty?.(true);
  },[setIsFormDirty]);

  const stats = useMemo(()=>{
    const calc=(list)=>{const items=list.map(i=>({...i,total:(Number(i.qty)||0)*(Number(i.price)||0)}));const tot=items.reduce((a,b)=>a+b.total,0);return{items:items.map(i=>({...i,composition:tot>0?(i.total/tot)*100:0})),total:tot};};
    const opex=calc(data.opex),sdm=calc(data.sdm),mktS=calc(data.marketing),mktL=calc(data.mktLain),com=calc(data.com);
    const mktT=mktS.total+mktL.total;
    const grandTotal=opex.total+sdm.total+mktT+com.total+Number(data.partnerExpense||0);
    return{opex,sdm,mktStatic:mktS,mktLain:mktL,mktTotal:mktT,com,grandTotal};
  },[data]);

  useEffect(()=>{onUpdate?.(stats.grandTotal);},[stats.grandTotal,onUpdate]);

  const mkPayload=(fin,uid,notes)=>{
    const lp={};
    for(let n=1;n<=MAX_LAIN;n++){lp[lainDbQty(n)]=0;lp[lainDbPrice(n)]=0;lp[lainDbLabel(n)]='';}
    data.mktLain.forEach((item,idx)=>{const n=idx+1;if(n>MAX_LAIN)return;lp[lainDbQty(n)]=item.qty;lp[lainDbPrice(n)]=item.price;lp[lainDbLabel(n)]=item.label;});
    return{
      user_id:uid,partner_name:activeContext.mpxName,branch:activeContext.branch,mpc_mp3:activeContext.mpxType,month:activeContext.month,year:activeContext.year,
      ...data.opex.reduce((a,c)=>({...a,[c.dbQty]:c.qty,[c.dbPrice]:c.price}),{}),
      ...data.sdm.reduce((a,c)=>({...a,[c.dbQty]:c.qty,[c.dbPrice]:c.price}),{}),
      ...data.marketing.reduce((a,c)=>({...a,[c.dbQty]:c.qty,[c.dbPrice]:c.price}),{}),
      ...lp,...data.com.reduce((a,c)=>({...a,[c.dbQty]:c.qty,[c.dbPrice]:c.price}),{}),
      partner_expense:data.partnerExpense,grand_total_pengeluaran:stats.grandTotal,
      is_finalized:fin,finalized_at:fin?new Date().toISOString():null,finalized_by:fin?uid:null,
      validation_notes:notes,updated_at:new Date().toISOString(),
    };
  };

  const validate=()=>{
    if(monthDisabled){toast$('error',`Bulan ${currentMonth} telah dinonaktifkan`);return false;}
    if(!activeContext?.mpxName){toast$('error','Nama Partner belum dipilih');return false;}
    if(!activeContext?.branch){toast$('error','Kantor Cabang belum dipilih');return false;}
    if(!activeContext?.mpxType){toast$('error','Tipe MPC/MP3 belum tersedia');return false;}
    if(!activeContext?.month){toast$('error','Bulan laporan belum dipilih');return false;}
    if(!activeContext?.year){toast$('error','Tahun laporan belum dipilih');return false;}
    return true;
  };

  const handleSaveDraft=async()=>{
    if(effRO||!validate())return; setIsSaving(true);
    try{
      const{data:{user}}=await supabase.auth.getUser(); if(!user)throw new Error('Sesi berakhir.');
      const en=reportStatus.validationNotes??'';
      const notes=en.includes('pengeluaran:draft')||en.includes('pengeluaran:final')?en:(en?en+',pengeluaran:draft':'pengeluaran:draft');
      const{error}=await supabase.from('pnl_reports').upsert(mkPayload(false,user.id,notes),{onConflict:'partner_name,branch,mpc_mp3,month,year'});
      if(error)throw error;
      setReportStatus(p=>({...p,isFinalized:false,updatedAt:new Date().toISOString(),validationNotes:notes}));
      setIsFormDirty?.(false); toast$('success','Draft pengeluaran berhasil disimpan');
      await pushNotification(supabase,{type:"form_draft",form:"pengeluaran",partner_name:activeContext.mpxName,branch:activeContext.branch,mpc_mp3:activeContext.mpxType,month:activeContext.month,year:activeContext.year,validation_notes:notes,triggered_by:user.id,triggered_name:user.user_metadata?.full_name??''});
    }catch(err){toast$('error',err.message||'Gagal menyimpan draft');}
    finally{setIsSaving(false);}
  };

  const handleSave=async()=>{
    if(effRO||!validate())return; setIsSaving(true);
    try{
      const{data:{user}}=await supabase.auth.getUser(); if(!user)throw new Error('Sesi berakhir.');
      const en=reportStatus.validationNotes??'';
      let parts=en?en.split(',').filter(p=>p&&!p.startsWith('pengeluaran:')):[]; parts.push('pengeluaran:final');
      const notes=parts.join(',');
      const{error}=await supabase.from('pnl_reports').upsert(mkPayload(true,user.id,notes),{onConflict:'partner_name,branch,mpc_mp3,month,year'});
      if(error)throw error;
      const now=new Date().toISOString();
      setReportStatus({isFinalized:true,finalizedAt:now,finalizedBy:user.id,validationNotes:notes,updatedAt:now});
      setIsFormDirty?.(false);setShowSubmit(false);onSaveSuccess?.(); toast$('success','Laporan pengeluaran berhasil disimpan');
      const both=notes.includes('pendapatan:final')&&notes.includes('pengeluaran:final');
      await pushNotification(supabase,{type:both?"finalized":"form_final",form:"pengeluaran",partner_name:activeContext.mpxName,branch:activeContext.branch,mpc_mp3:activeContext.mpxType,month:activeContext.month,year:activeContext.year,validation_notes:notes,triggered_by:user.id,triggered_name:user.user_metadata?.full_name??''});
    }catch(err){toast$('error',err.message||'Gagal menyimpan laporan');}
    finally{setIsSaving(false);}
  };

  const updateVal=useCallback((sec,id,field,val)=>{
    if(effRO)return;
    setData(p=>{if(sec==='partnerExpense')return{...p,partnerExpense:val};return{...p,[sec]:p[sec].map(i=>{if(i.id!==id)return i;const u={...i,[field]:val};if(field==='price'&&val>0&&(!u.qty||u.qty===0))u.qty=1;return u;})};});
    setIsFormDirty?.(true);
  },[setIsFormDirty,effRO]);

  const updateLain=useCallback((id,field,val)=>{
    if(effRO)return;
    setData(p=>({...p,mktLain:p.mktLain.map(i=>{if(i.id!==id)return i;const u={...i,[field]:val};if(field==='price'&&val>0&&(!u.qty||u.qty===0))u.qty=1;return u;})}));
    setIsFormDirty?.(true);
  },[setIsFormDirty,effRO]);

  const addLain=useCallback(()=>{
    if(effRO)return;
    setData(p=>{if(p.mktLain.length>=MAX_LAIN)return p;const used=new Set(p.mktLain.map(i=>i.slotN));let n=1;while(used.has(n))n++;return{...p,mktLain:[...p.mktLain,{id:`lain_${n}`,slotN:n,label:'',qty:0,price:0}]};});
    setIsFormDirty?.(true);
  },[setIsFormDirty,effRO]);

  const removeLain=useCallback((id)=>{
    if(effRO)return;
    setData(p=>({...p,mktLain:p.mktLain.filter(i=>i.id!==id)}));
    setIsFormDirty?.(true);
  },[setIsFormDirty,effRO]);

  if(isLoading)return(
    <><G d={d} t={t}/>
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:340,gap:14,fontFamily:FONT }}>
        <div style={{ position:'relative',width:52,height:52 }}>
          <div style={{ position:'absolute',inset:0,borderRadius:'50%',border:'2.5px solid transparent',borderTopColor:'#ED1C24',borderRightColor:'#C6168D',animation:'spin 0.9s linear infinite' }}/>
          <div style={{ position:'absolute',inset:8,borderRadius:10,background:'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)',display:'flex',alignItems:'center',justifyContent:'center',animation:'fpbreathe 1.8s ease-in-out infinite',boxShadow:'0 4px 14px rgba(237,28,36,0.4)' }}><ArrowDownLeft size={18} color="#fff"/></div>
        </div>
        <span style={{ fontSize:11,fontWeight:600,letterSpacing:'0.10em',textTransform:'uppercase',color:t.mid }}>Memuat data...</span>
      </div>
    </>
  );

  const ctxMonth=activeContext?.month??'',ctxYear=activeContext?.year??'';
  const ctxType=activeContext?.mpxType??'',ctxName=activeContext?.mpxName??'',ctxBranch=activeContext?.branch??'';
  const notes=reportStatus.validationNotes??'';
  const hasPendFin=notes.includes('pendapatan:final'), hasPengFin=notes.includes('pengeluaran:final');
  const bothFin=hasPendFin&&hasPengFin;
  const{prevMonth,prevYear}=getPrevMY(ctxMonth,ctxYear);

  return(
    <div style={{ width:'100%',margin:'0 auto',paddingBottom:monthDisabled?0:80,fontFamily:FONT,WebkitFontSmoothing:'antialiased',color:t.hi }}>
      <G d={d} t={t}/>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',gap:14,marginBottom:28 }}>
        <div style={{ width:46,height:46,borderRadius:10,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)',color:'#fff',boxShadow:'0 2px 10px rgba(237,28,36,0.30)' }}><ArrowDownLeft size={25}/></div>
        <div style={{ minWidth:0,flex:1 }}>
          <div style={{ fontSize:20,fontWeight:800,letterSpacing:'-0.035em',color:t.hi,lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>Form Pengeluaran {ctxMonth} {ctxYear}</div>
          <div style={{ fontSize:12,fontWeight:600,letterSpacing:'0.02em',color:t.mid,marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{[ctxType,ctxName,ctxBranch].filter(Boolean).join(' · ')}</div>
        </div>
        {monthDisabled?(<div style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:99,background:t.disabledBg,border:`1px solid ${t.disabledBd}`,color:t.disabledColor,fontSize:11,fontWeight:700,flexShrink:0,whiteSpace:'nowrap' }}><Ban size={12}/> Bulan Nonaktif</div>)
        :readOnly?(<div style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:99,background:t.amberBg,border:`1px solid ${t.amberBd}`,color:t.amber,fontSize:11,fontWeight:700,flexShrink:0,whiteSpace:'nowrap' }}><Eye size={12}/> Mode Lihat</div>):null}
      </div>

      {monthDisabled?<DisabledMonthOverlay month={currentMonth} t={t} d={d}/>:(
        <>
          <Stepper step={step} setStep={setStep} t={t} d={d}/>
          {/* Toast */}
          <AnimatePresence>
            {toast.show&&(
              <motion.div initial={{ opacity:0,y:-12,scale:0.97 }} animate={{ opacity:1,y:0,scale:1 }} exit={{ opacity:0,y:-10,scale:0.97 }} transition={{ duration:0.17 }}
                style={{ position:'fixed',top:66,right:16,zIndex:999,width:316,maxWidth:'calc(100vw - 32px)' }}>
                <div style={{ background:t.card,border:`1px solid ${toast.type==='success'?t.greenBd:t.redBd}`,borderRadius:12,boxShadow:t.lg,overflow:'hidden' }}>
                  <div style={{ display:'flex',alignItems:'flex-start',gap:11,padding:'13px 15px' }}>
                    <div style={{ width:30,height:30,borderRadius:7,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:toast.type==='success'?t.green:t.red,color:'#fff' }}>{toast.type==='success'?<CheckCircle2 size={15}/>:<AlertCircle size={15}/>}</div>
                    <div style={{ flex:1,minWidth:0 }}><div style={{ fontSize:13,fontWeight:700,color:t.hi }}>{toast.type==='success'?'Berhasil':'Terjadi Kesalahan'}</div><div style={{ fontSize:12,color:t.mid,marginTop:3,lineHeight:1.5 }}>{toast.msg}</div></div>
                    <button onClick={()=>setToast(p=>({...p,show:false}))} style={{ background:'none',border:'none',cursor:'pointer',color:t.lo,padding:2 }}><X size={13}/></button>
                  </div>
                  <motion.div initial={{ width:'100%' }} animate={{ width:'0%' }} transition={{ duration:4,ease:'linear' }} style={{ height:2,background:toast.type==='success'?t.green:t.red }}/>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {step===1&&<motion.div key="s1" initial={{ opacity:0,y:7 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }} transition={{ duration:0.17 }} style={{ display:'flex',flexDirection:'column',gap:14 }}>
              <SecHero icon={Building2} step={1} title="OPEX Branch" t={t}>{!effRO&&<AutoFillButton isLoading={prefillState.opex.loading} isPrefilled={prefillState.opex.done} onClick={()=>handleAutoFill('opex')}/>}</SecHero>
              <AnimatePresence>{prefillState.opex.done&&!effRO&&<PrefillBanner prevMonth={prevMonth} prevYear={prevYear} onReset={()=>handleReset('opex')} t={t}/>}</AnimatePresence>
              <ExpenseTable items={stats.opex.items} sectionKey="opex" onUpdate={updateVal} t={t} readOnly={effRO} prefillKeys={prefillState.opex.done?prefillState.opex.keys:null}/>
              <SubtotalBanner label="Subtotal OPEX" value={stats.opex.total} t={t}/>
            </motion.div>}

            {step===2&&<motion.div key="s2" initial={{ opacity:0,y:7 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }} transition={{ duration:0.17 }} style={{ display:'flex',flexDirection:'column',gap:14 }}>
              <SecHero icon={Users} step={2} title="SDM Branch" t={t}>{!effRO&&<AutoFillButton isLoading={prefillState.sdm.loading} isPrefilled={prefillState.sdm.done} onClick={()=>handleAutoFill('sdm')}/>}</SecHero>
              <AnimatePresence>{prefillState.sdm.done&&!effRO&&<PrefillBanner prevMonth={prevMonth} prevYear={prevYear} onReset={()=>handleReset('sdm')} t={t}/>}</AnimatePresence>
              <ExpenseTable items={stats.sdm.items} sectionKey="sdm" onUpdate={updateVal} t={t} readOnly={effRO} prefillKeys={prefillState.sdm.done?prefillState.sdm.keys:null}/>
              <SubtotalBanner label="Subtotal SDM" value={stats.sdm.total} t={t}/>
            </motion.div>}

            {step===3&&<motion.div key="s3" initial={{ opacity:0,y:7 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }} transition={{ duration:0.17 }} style={{ display:'flex',flexDirection:'column',gap:14 }}>
              <SecHero icon={Megaphone} step={3} title="Marketing" t={t}>{!effRO&&<AutoFillButton isLoading={prefillState.marketing.loading} isPrefilled={prefillState.marketing.done} onClick={()=>handleAutoFill('marketing')}/>}</SecHero>
              <AnimatePresence>{prefillState.marketing.done&&!effRO&&<PrefillBanner prevMonth={prevMonth} prevYear={prevYear} onReset={()=>handleReset('marketing')} t={t}/>}</AnimatePresence>
              <MarketingTable staticItems={stats.mktStatic.items} lainItems={stats.mktLain.items} sectionKey="marketing" onUpdate={updateVal} onUpdateLain={updateLain} onAddLain={addLain} onRemoveLain={removeLain} t={t} readOnly={effRO}/>
              {!effRO&&<Card t={t}><Body>
                <SecLabel t={t}>Lampiran Program Lain</SecLabel>
                <p style={{ fontSize:12,color:t.mid,marginBottom:14,lineHeight:1.6 }}>Upload dokumen pendukung. Bisa upload <strong style={{ color:t.hi }}>beberapa file sekaligus</strong>.</p>
                <MultiFileUpload files={mktFiles} setFiles={setMktFiles} dragState={mktDrag} setDragState={setMktDrag} inputId="mkt-up" t={t}/>
              </Body></Card>}
              <SubtotalBanner label="Subtotal Marketing" value={stats.mktTotal} t={t}/>
            </motion.div>}

            {step===4&&<motion.div key="s4" initial={{ opacity:0,y:7 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }} transition={{ duration:0.17 }} style={{ display:'flex',flexDirection:'column',gap:14 }}>
              <SecHero icon={Coins} step={4} title="Cost of Money" t={t}>{!effRO&&<AutoFillButton isLoading={prefillState.com.loading} isPrefilled={prefillState.com.done} onClick={()=>handleAutoFill('com')}/>}</SecHero>
              <AnimatePresence>{prefillState.com.done&&!effRO&&<PrefillBanner prevMonth={prevMonth} prevYear={prevYear} onReset={()=>handleReset('com')} t={t}/>}</AnimatePresence>
              <ExpenseTable items={stats.com.items} sectionKey="com" onUpdate={updateVal} t={t} readOnly={effRO} prefillKeys={prefillState.com.done?prefillState.com.keys:null}/>
              <SubtotalBanner label="Subtotal Cost of Money" value={stats.com.total} t={t}/>
            </motion.div>}

            {step===5&&<motion.div key="s5" initial={{ opacity:0,y:7 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }} transition={{ duration:0.17 }}>
              <SecHero icon={FileText} step={5} title="Ringkasan Akhir" t={t}/>
              <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
                <Card t={t}><Body>
                  <SecLabel t={t}>Pengeluaran Partner</SecLabel>
                  <div style={{ padding:'14px 16px',borderRadius:9,background:t.greenBg,border:`1px solid ${t.greenBd}`,marginBottom:effRO?0:14 }}>
                    <label className="lbl" style={{ color:t.green,marginBottom:7 }}>Nominal Luar Template</label>
                    <LocalInput numericValue={data.partnerExpense} onChange={v=>updateVal('partnerExpense',null,null,v)} readOnly={effRO}
                      style={{ fontSize:24,fontWeight:800,color:t.green,letterSpacing:'-0.04em',width:'100%',background:'transparent',border:'none',outline:'none',fontFamily:'inherit',...(effRO?{cursor:'default',pointerEvents:'none'}:{}) }}/>
                  </div>
                  {!effRO&&<MultiFileUpload files={files} setFiles={setFiles} dragState={drag} setDragState={setDrag} inputId="fp-exp-up" t={t}/>}
                </Body></Card>
                <Card t={t}><Body>
                  <SecLabel t={t}>Ringkasan Struktur</SecLabel>
                  <div style={{ display:'flex',flexDirection:'column' }}>
                    <SumRow icon={Building2} label="OPEX Branch"     value={stats.opex.total}    t={t}/>
                    <SumRow icon={Users}     label="SDM Branch"      value={stats.sdm.total}     t={t}/>
                    <SumRow icon={Megaphone} label="Marketing"       value={stats.mktTotal}      t={t}/>
                    <SumRow icon={Coins}     label="Cost of Money"   value={stats.com.total}     t={t}/>
                    <SumRow icon={Banknote}  label="Partner Expense" value={data.partnerExpense} t={t} highlight/>
                    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,paddingTop:16,marginTop:4,borderTop:`2px solid ${t.greenBd}` }}>
                      <span style={{ fontSize:12,fontWeight:700,letterSpacing:'0.07em',textTransform:'uppercase',color:t.green }}>Total Pengeluaran</span>
                      <span style={{ fontSize:22,fontWeight:800,letterSpacing:'-0.04em',color:t.green,fontVariantNumeric:'tabular-nums',textAlign:'right' }}>{formatIDR(stats.grandTotal)}</span>
                    </div>
                  </div>
                </Body></Card>

                <div style={{ padding:'34px 26px',borderRadius:14,border:`1.5px solid ${t.greenBd}`,background:t.greenBg,textAlign:'center' }}>
                  <div style={{ fontSize:10,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:t.green,marginBottom:13 }}>Total Pengeluaran Terakumulasi</div>
                  <div style={{ fontSize:'clamp(26px,6vw,58px)',fontWeight:800,letterSpacing:'-0.04em',color:t.green,fontVariantNumeric:'tabular-nums',lineHeight:1.1,marginBottom:20,wordBreak:'break-all' }}>{formatIDR(stats.grandTotal)}</div>
                  {reportStatus.isFinalized?(
                    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:10 }}>
                      {bothFin?(
                        <div style={{ display:'inline-flex',alignItems:'center',gap:7,padding:'8px 18px',borderRadius:99,background:t.green,color:'#fff',fontSize:12,fontWeight:700 }}>
                          <CheckCircle2 size={14}/>Pendapatan &amp; Pengeluaran Tervalidasi
                        </div>
                      ):(
                        <div style={{ display:'inline-flex',alignItems:'center',gap:8,padding:'8px 18px',borderRadius:99,background:t.green,color:'#fff',fontSize:12,fontWeight:700 }}>
                          <div style={{ width:18,height:18,borderRadius:'50%',background:'rgba(255,255,255,0.30)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,lineHeight:1,flexShrink:0 }}>1</div>
                          Laporan Pengeluaran Tervalidasi
                        </div>
                      )}
                      {reportStatus.finalizedAt&&<div style={{ display:'flex',alignItems:'center',gap:5,fontSize:11,color:t.mid }}><Clock size={12} style={{ color:t.lo }}/>Difinalisasi: {fmtDate(reportStatus.finalizedAt)}</div>}
                      {hasPendFin&&<div style={{ display:'inline-flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:99,background:t.magentaBg,border:`1px solid ${t.magentaBd}`,fontSize:11,color:t.magenta,fontWeight:600 }}><CheckCircle2 size={11}/>Form Pendapatan juga tervalidasi</div>}
                    </div>
                  ):(
                    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:8 }}>
                      <div style={{ display:'inline-flex',alignItems:'center',gap:7,padding:'8px 18px',borderRadius:99,background:t.amberBg,border:`1px solid ${t.amberBd}`,color:t.amber,fontSize:12,fontWeight:700 }}><Clock size={14}/>Belum Difinalisasi</div>
                      {reportStatus.updatedAt&&<div style={{ fontSize:11,color:t.mid }}>Draft tersimpan: {fmtDate(reportStatus.updatedAt)}</div>}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>}
          </AnimatePresence>

          <FooterNav step={step} setStep={setStep} totalSteps={5} readOnly={effRO} isSaving={isSaving} onDraft={handleSaveDraft} onSubmit={()=>setShowSubmit(true)} t={t} d={d}/>
        </>
      )}

      {/* Submit Modal */}
      <AnimatePresence>
        {showSubmit&&!effRO&&(
          <div style={{ position:'fixed',inset:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:'rgba(0,0,0,0.74)',backdropFilter:'blur(18px)',WebkitBackdropFilter:'blur(18px)' }}>
            <motion.div initial={{ scale:0.96,opacity:0 }} animate={{ scale:1,opacity:1 }} exit={{ scale:0.96,opacity:0 }} transition={{ duration:0.14 }}
              style={{ maxWidth:348,width:'100%',background:t.card,border:`1px solid ${t.line}`,borderRadius:16,boxShadow:t.lg,overflow:'hidden' }}>
              <div style={{ padding:28,textAlign:'center' }}>
                <div style={{ width:50,height:50,borderRadius:11,background:'linear-gradient(135deg,#ED1C24,#C6168D)',margin:'0 auto 15px',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',boxShadow:'0 4px 16px rgba(237,28,36,0.32)' }}><ShieldCheck size={22}/></div>
                <div style={{ fontSize:17,fontWeight:800,letterSpacing:'-0.03em',color:t.hi,marginBottom:7 }}>Kirim Laporan?</div>
                <div style={{ background:t.sub,borderRadius:10,padding:'13px 16px',marginBottom:18,border:`1px solid ${t.line}`,textAlign:'left',display:'flex',flexDirection:'column',gap:8 }}>
                  {[{l:'Partner',v:ctxName},{l:'Cabang',v:ctxBranch},{l:'Periode',v:`${ctxMonth} ${ctxYear}`}].map(r=>(
                    <div key={r.l} style={{ display:'flex',justifyContent:'space-between',gap:8 }}>
                      <span style={{ fontSize:11,color:t.lo }}>{r.l}</span>
                      <span style={{ fontSize:11,fontWeight:700,color:t.hi,textAlign:'right' }}>{r.v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop:`1px solid ${t.lineH}`,paddingTop:8,display:'flex',justifyContent:'space-between',gap:8 }}>
                    <span style={{ fontSize:12,fontWeight:700,color:t.green }}>Total Expense</span>
                    <span style={{ fontSize:14,fontWeight:800,color:t.green,fontVariantNumeric:'tabular-nums' }}>{formatIDR(stats.grandTotal)}</span>
                  </div>
                  {(files.length+mktFiles.length)>0&&(
                    <div style={{ borderTop:`1px solid ${t.lineH}`,paddingTop:8,display:'flex',alignItems:'center',gap:6 }}>
                      <Paperclip size={11} style={{ color:t.lo,flexShrink:0 }}/>
                      <span style={{ fontSize:11,color:t.mid }}>{files.length+mktFiles.length} file terlampir</span>
                    </div>
                  )}
                </div>
                <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                  <button onClick={handleSave} disabled={isSaving} className="btn-p" style={{ width:'100%',justifyContent:'center',padding:12,fontSize:13 }}>{isSaving?'Menyimpan...':'Konfirmasi & Simpan'}</button>
                  <button onClick={()=>setShowSubmit(false)} className="btn-g" style={{ width:'100%',justifyContent:'center',padding:12,fontSize:13 }}>Batal</button>
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