"use client";
// Form Pengeluaran V2 — RESTRUKTUR (permintaan user - "jadi nanti yang
// login partner pada laporan pengeluaran harus mapping mc mc sesuai
// dengan depo masing masing ... untuk OPEX dan SDM itu di level depo,
// namun untuk mkt cost of money dan pengeluaran di luar template itu
// baru di level mc" + follow-up "harusnya tambah DEPO dulu"):
//   - Langkah OPEX & SDM: WAJIB pilih Depo (grup District buatan Partner
//     sendiri, lihat PNL_DepoManager.jsx) - kalau belum ada Depo sama
//     sekali, user WAJIB bikin Depo dulu sebelum bisa isi OPEX/SDM.
//     Disimpan ke tabel pnl_pengeluaran_depo_v2, keyed by depo_id+bulan+
//     tahun (1 baris per Depo per periode - independen dari Area yg
//     dipilih di landing page V2).
//   - Langkah MKT & COM: pilih District (mc) - tetap level District
//     seperti sebelumnya. Disimpan ke tabel pnl_pengeluaran_mc_v2, keyed
//     by mc+bulan+tahun.
//   - Langkah Review: gabungan ringkasan Depo (OPEX+SDM) yg lagi dipilih
//     DAN District (MKT+COM) yg lagi dipilih - dua konteks independen.
// Qty & Total (Rp) tetap terpisah, tidak dikalikan (klarifikasi user
// sebelumnya). Katalog item tetap sama (PENGELUARAN_CATALOG di bawah),
// hanya SUMBER DATA & KEY PENYIMPANANNYA yang berubah.
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowRight, Building2, ChevronDown, Coins, FileText, Globe2, GripVertical, Info, MapPin, Megaphone, MoreVertical, Save, Settings2, Users, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import supabase from "../../../lib/supabase";
import {
  FONT, mk, V2Styles, NumInput, Card, Body, SecLabel, TH, FormHeader, Stepper, SecHero,
  SubtotalBanner, SumRow, FooterBar, LoadingBlock, toMonthInt, toYearInt, numOrZero, fmtIDR,
} from "./PNL_V2Shared";
import PNL_DepoManager from "./PNL_DepoManager";
import { hasRole } from "./DSE_ProdAR";

// Katalog item persis dari spreadsheet acuan user.
export const PENGELUARAN_CATALOG = [
  { id: "infra_gedung",        step: "OPEX", kategori: "Gedung/Depo",           item: "Infrastruktur Gedung" },
  { id: "sewa_kendaraan",      step: "OPEX", kategori: "Kendaraan",             item: "Penyewaan Kendaraan" },
  { id: "listrik",             step: "OPEX", kategori: "Utilities",             item: "Listrik" },
  { id: "air",                 step: "OPEX", kategori: "Utilities",             item: "Air" },
  { id: "telko_it",            step: "OPEX", kategori: "Utilities",             item: "Telekomunikasi & IT" },
  { id: "logistik",            step: "OPEX", kategori: "Utilities",             item: "Logistik (Biaya Kirim barang, etc)" },
  { id: "asuransi_aset",       step: "OPEX", kategori: "Asuransi",              item: "Asuransi Aset" },
  { id: "lain_internal",       step: "OPEX", kategori: "Biaya Operasional Lain",item: "Lain-lain Internal" },

  { id: "remun_bm",            step: "SDM",  kategori: "HR Cost Sales",         item: "Remunerasi Business Manager", salesGroup: "sales" },
  { id: "remun_tss_spv",       step: "SDM",  kategori: "HR Cost Sales",         item: "Remunerasi TSS / SPV", salesGroup: "sales" },
  { id: "remun_gm",            step: "SDM",  kategori: "HR Cost Non Sales",     item: "Remunerasi General Manager", salesGroup: "non_sales" },
  { id: "remun_fm",            step: "SDM",  kategori: "HR Cost Non Sales",     item: "Remunerasi Finance Manager", salesGroup: "non_sales" },
  { id: "benefit_hrd",         step: "SDM",  kategori: "HR Cost Non Sales",     item: "Remunerasi HRD", salesGroup: "non_sales" },
  { id: "benefit_mis",         step: "SDM",  kategori: "HR Cost Non Sales",     item: "Remunerasi MIS", salesGroup: "non_sales" },
  { id: "benefit_finance",     step: "SDM",  kategori: "HR Cost Non Sales",     item: "Remunerasi Finance Staff", salesGroup: "non_sales" },
  { id: "benefit_md",          step: "SDM",  kategori: "HR Cost Non Sales",     item: "Remunerasi MD", salesGroup: "non_sales" },
  { id: "benefit_admin_wh",    step: "SDM",  kategori: "HR Cost Non Sales",     item: "Remunerasi Admin & Warehouse", salesGroup: "non_sales" },
  { id: "benefit_sales_lain",  step: "SDM",  kategori: "HR Cost Sales",         item: "Remunerasi Sales (Others)", salesGroup: "sales" },
  { id: "benefit_nonsales_lain", step: "SDM", kategori: "HR Cost Non Sales",    item: "Remunerasi Non-Sales (Others)", salesGroup: "non_sales" },
  { id: "perjalanan_dinas",    step: "SDM",  kategori: "HR Cost Non Sales",     item: "Perjalanan Dinas", salesGroup: "non_sales" },
  { id: "training",            step: "SDM",  kategori: "HR Cost Non Sales",     item: "Training", salesGroup: "non_sales" },

  // Permintaan user ("tidak perlu ada subtitle, cukup qty dan amount
  // juga utk wholeseller dan retail"): subtitle info dihapus & qtyOnly
  // dicabut - sekarang 2 item ini isi Qty + Total (Rp) spt item lain.
  { id: "mkt_wholeseller",     step: "MARKETING COST", kategori: "Marketing Cost", item: "Program Wholeseller" },
  { id: "mkt_retail",          step: "MARKETING COST", kategori: "Marketing Cost", item: "Program Retail" },
  { id: "mkt_event",           step: "MARKETING COST", kategori: "Marketing Cost", item: "Program Event" },
  { id: "mkt_lain_total",      step: "MARKETING COST", kategori: "Marketing Cost", item: "Mkt Lain (Total)" },

  { id: "biaya_administrasi",  step: "COST OF MONEY", kategori: "Cost of Money", item: "Biaya Administrasi" },
  { id: "bunga_pinjaman",      step: "COST OF MONEY", kategori: "Cost of Money", item: "Bunga Pinjaman Bank" },
];

// Ringkasan pengeluaran dari jsonb `pengeluaran_data` - dipakai form ini
// (langkah Review) DAN PNL_SummaryV2.jsx supaya angkanya selalu sama.
export function summarizePengeluaran(values) {
  let totalOpex = 0, totalSdmSales = 0, totalSdmNonSales = 0, totalMarketing = 0, totalCostOfMoney = 0;
  PENGELUARAN_CATALOG.forEach((it) => {
    const total = numOrZero(values?.[it.id]?.total);
    if (it.step === "OPEX") totalOpex += total;
    else if (it.step === "SDM") { if (it.salesGroup === "sales") totalSdmSales += total; else totalSdmNonSales += total; }
    else if (it.step === "MARKETING COST") totalMarketing += total;
    else if (it.step === "COST OF MONEY") totalCostOfMoney += total;
  });
  const totalSdm = totalSdmSales + totalSdmNonSales;
  return { totalOpex, totalSdmSales, totalSdmNonSales, totalSdm, totalMarketing, totalCostOfMoney, grandTotal: totalOpex + totalSdm + totalMarketing + totalCostOfMoney };
}

const STEP_LABELS = ["OPEX & COM", "SDM", "MKT", "Review"];
const SDM_LEVEL_ORDER = ["partner", "region", "area", "depo", "mc"];
const SDM_LEVEL_LABEL = { partner: "Level Partner", region: "Level Region", area: "Level Area", mc: "Level District (MC)", depo: "Level Depo" };
const itemsOf = (step, group) => PENGELUARAN_CATALOG.filter((it) => it.step === step && (!group || it.salesGroup === group));

// BARU (permintaan user - "harus ada tombol opsi untuk ubah level per
// sub kategori"): fallback drag-and-drop yg kadang ga ke-drag di
// webview - tombol titik tiga kecil di tiap item, klik buka daftar 5
// level, klik salah satu langsung pindah (pakai handler yg sama persis
// dgn drag-and-drop, moveSdmItemLevel).
const SDM_MENU_W = 196;
const SDM_MENU_H_EST = 46 + SDM_LEVEL_ORDER.length * 34;
function SdmLevelMenuButton({ currentLevel, onPick, t }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.min(r.left, window.innerWidth - SDM_MENU_W - 10);
      const top = Math.min(r.bottom + 4, window.innerHeight - SDM_MENU_H_EST - 10);
      setPos({ top: Math.max(10, top), left: Math.max(10, left) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div style={{ position: "relative", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        title="Pindahkan level"
        style={{ width: 22, height: 22, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: `1px solid ${open ? t.blueBd : "transparent"}`, background: open ? t.blueBg : "transparent", color: t.mid, cursor: "pointer" }}
      >
        <MoreVertical size={13} />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9000 }} />
          <div style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9001, width: SDM_MENU_W, background: t.card, border: `1px solid ${t.line}`, borderRadius: 10, boxShadow: "0 16px 40px rgba(0,0,0,0.28)", padding: 5 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: t.lo, textTransform: "uppercase", letterSpacing: 0.4, padding: "4px 7px 6px" }}>Pindahkan ke level</div>
            {SDM_LEVEL_ORDER.map((lvl) => {
              const isCurrent = lvl === currentLevel;
              return (
                <button
                  key={lvl}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => { onPick(lvl); setOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 8px", fontSize: 12.5, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? t.blue : t.hi, background: "transparent", border: "none", borderRadius: 6, cursor: isCurrent ? "default" : "pointer" }}
                  onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = t.hoverBg || t.blueBg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {SDM_LEVEL_LABEL[lvl]}{isCurrent ? " • sekarang" : ""}
                </button>
              );
            })}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// BARU (permintaan user - "untuk opex com dan mkt ini dia tipenya nama
// depo dibuat jadi header tabel dan nama mc jadi header tabel saja,
// tidak perlu dipisah per kotak kotak komponen"): tabel flat - baris =
// item, kolom = tiap entitas (Depo utk OPEX/Cost of Money, MC/District
// utk Marketing Cost), nama entitas jadi HEADER KOLOM. Entitasnya
// sedikit (Depo dlm 1 Area, District dlm 1 Depo) jadi aman tanpa perlu
// wrap jadi kartu spt di SDM.
function EntityColumnTable({ items, entities, valuesByEntity, onChange, readOnly, showKategori, emptyLabel, t }) {
  if (entities.length === 0) {
    return <div style={{ fontSize: 12.5, color: t.lo, padding: "10px 2px" }}>{emptyLabel || "Belum ada entitas."}</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 220 + entities.length * 168 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            <TH t={t}>Sub-Kategori</TH>
            {entities.map((en) => (
              <th key={en.key} style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, fontWeight: 800, color: t.hi, borderLeft: `2px solid ${t.line}`, whiteSpace: "nowrap" }}>{en.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="v2row" style={{ borderBottom: `1px solid ${t.lineH}` }}>
              <td style={{ padding: "9px 8px", verticalAlign: "middle" }}>
                <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
                {showKategori && <div style={{ fontSize: 11, color: t.lo, marginTop: 2 }}>{it.kategori}</div>}
                {it.info && <div style={{ fontSize: 11, color: t.mid, marginTop: 3, display: "flex", alignItems: "flex-start", gap: 5 }}><Info size={11} style={{ flexShrink: 0, marginTop: 2 }} />{it.info}</div>}
              </td>
              {entities.map((en) => (
                <td key={en.key} style={{ padding: "9px 8px", width: 160, verticalAlign: "middle", borderLeft: `1px solid ${t.lineH}` }}>
                  <NumInput numericValue={valuesByEntity[en.key]?.[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(en.key, it.id, "total", v)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Tabel item 1 langkah - kolom: Sub-Kategori | (Qty opsional) | Total
// (Rp). Kolom Qty sempat DIHAPUS total (permintaan user - "hilangkan
// qty ini, tidak perlu ada qty cukup amount"), lalu permintaan baru
// user ("tambahkan qtynya") minta Qty balik lagi KHUSUS utk step SDM
// level non-MC (Partner/Region/Area/Depo) di screenshot - biar 1 UX
// konsisten dgn McMultiItemTable (level District/MC) yg emang dari
// awal sudah ada kolom Qty + Total. Jadi kolom Qty di sini dibuat
// OPSIONAL lewat prop `showQty` - OPEX/Cost of Money/Marketing Cost
// (yg sebelumnya sengaja dihilangkan qty-nya) TIDAK ikut berubah,
// cuma 2 pemanggilan ItemTable utk SDM level non-MC yg diberi showQty.
function ItemTable({ items, values, onChange, readOnly, showKategori, showQty, draggable, onItemDragStart, movingLevelId, onMoveLevel, levelOfItem, t }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: showQty ? 480 : 400 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            <TH t={t}>Sub-Kategori</TH>
            {showQty && <TH t={t} align="right" width={90}>Qty</TH>}
            <TH t={t} align="right" width={190}>Total (Rp)</TH>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <motion.tr key={it.id} className="v2row"
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22, ease: "easeOut" }}
                draggable={!!draggable && movingLevelId !== it.id}
                onDragStart={draggable ? (e) => onItemDragStart(e, it.id) : undefined}
                style={{ borderBottom: `1px solid ${t.lineH}`, cursor: draggable ? (movingLevelId === it.id ? "wait" : "grab") : "default", opacity: movingLevelId === it.id ? 0.55 : 1 }}
              >
                <td style={{ padding: "9px 8px", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {draggable && <GripVertical size={14} color={t.lo} style={{ flexShrink: 0 }} />}
                    <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
                    {draggable && onMoveLevel && <SdmLevelMenuButton currentLevel={levelOfItem?.(it.id)} onPick={(lvl) => onMoveLevel(it.id, lvl)} t={t} />}
                  </div>
                  {showKategori && <div style={{ fontSize: 11, color: t.lo, marginTop: 2 }}>{it.kategori}</div>}
                  {it.info && <div style={{ fontSize: 11, color: t.mid, marginTop: 3, display: "flex", alignItems: "flex-start", gap: 5 }}><Info size={11} style={{ flexShrink: 0, marginTop: 2 }} />{it.info}</div>}
                </td>
                {showQty && (
                  <td style={{ padding: "9px 8px", width: 90, verticalAlign: "middle" }}>
                    <NumInput numericValue={values[it.id]?.qty} readOnly={readOnly} onChange={(v) => onChange(it.id, "qty", v)} />
                  </td>
                )}
                <td style={{ padding: "9px 8px", width: 190, verticalAlign: "middle" }}>
                  <NumInput numericValue={values[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(it.id, "total", v)} />
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}

// BARU (permintaan user - "bisakah jika ada tampilkan semua mc, untuk
// mempermudah pengisian oleh satu orang tanpa harus ganti ganti
// filternya"): item SDM level District (MC) sebelumnya diisi 1 MC pada
// satu waktu (harus gonta-ganti selector District). Sekarang semua
// District di bawah Depo yg aktif ditampilkan sekaligus sbg kolom -
// rows = item, kolom = tiap MC - supaya 1 orang bisa isi semua MC tanpa
// pindah-pindah filter.
// FIX (permintaan user - "kolom komponennya jangan lebar kali, dan
// kenapa ini tidak bisa discroll kiri kanan - buat dgn sangat bagus"):
// desain tabel lama (1 kolom Qty+Total per entitas, tabel makin lebar
// terus seiring jumlah Area/Region/Depo/MC) memaksa lebar tabel JAUH
// melebihi lebar layar dan bikin konten "terpotong" di kiri-kanan tanpa
// scrollbar yg berfungsi. Diganti total: tiap item SDM jadi 1 baris
// dgn judul di atas, lalu kartu kecil per-entitas yg di-WRAP otomatis
// (flex-wrap) - kartunya pindah baris sendiri kalau sudah penuh,
// BUKAN menambah lebar ke samping - jadi TIDAK PERNAH butuh scroll
// horizontal berapa pun banyaknya entitas, dan selalu rapi di lebar
// layar manapun.
function MultiEntityItemTable({ items, entities, valuesByEntity, onChange, readOnly, draggable, onItemDragStart, movingLevelId, onMoveLevel, levelOfItem, emptyLabel, t }) {
  if (entities.length === 0) {
    return <div style={{ fontSize: 12.5, color: t.lo, padding: "10px 2px" }}>{emptyLabel || "Belum ada entitas."}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <AnimatePresence initial={false}>
        {items.map((it, idx) => (
          <motion.div key={it.id} layout className="v2row"
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22, ease: "easeOut" }}
            draggable={!!draggable && movingLevelId !== it.id}
            onDragStart={draggable ? (e) => onItemDragStart(e, it.id) : undefined}
            style={{ padding: "10px 4px 12px", borderTop: idx === 0 ? "none" : `1px solid ${t.lineH}`, cursor: draggable ? (movingLevelId === it.id ? "wait" : "grab") : "default", opacity: movingLevelId === it.id ? 0.55 : 1 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {draggable && <GripVertical size={14} color={t.lo} style={{ flexShrink: 0 }} />}
              <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
              {draggable && onMoveLevel && <SdmLevelMenuButton currentLevel={levelOfItem?.(it.id)} onPick={(lvl) => onMoveLevel(it.id, lvl)} t={t} />}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {entities.map((en) => (
                <div key={en.key} style={{ flex: "1 1 200px", minWidth: 170, maxWidth: 260, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.lineH}`, background: t.bg2 || t.panel || "transparent" }}>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={en.label}>{en.label}</div>
                    {en.sublabel && <div style={{ fontSize: 9, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={en.sublabel}>Depo: {en.sublabel}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: "0 0 64px" }}>
                      <div style={{ fontSize: 9, color: t.lo, marginBottom: 2 }}>Qty</div>
                      <NumInput numericValue={valuesByEntity[en.key]?.[it.id]?.qty} readOnly={readOnly} onChange={(v) => onChange(en.key, it.id, "qty", v)} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, color: t.lo, marginBottom: 2 }}>Total (Rp)</div>
                      <NumInput numericValue={valuesByEntity[en.key]?.[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(en.key, it.id, "total", v)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// BARU: banner ringkas "Nama Depo + District di bawahnya" - ditaruh di
// atas tiap bagian yg datanya terikat ke 1 Depo aktif (OPEX/Cost of
// Money/SDM level Depo), supaya konteks selalu kelihatan tanpa scroll.
function StepHeroDepo({ icon: Icon, eyebrow, title, depoName, depoControl, region, regionControl, area, areaOptions, onAreaChange, areaControl, mcs, mcControl, totalLabel, totalValue, t }) {
  const showDepoRow = depoControl !== undefined || depoName !== undefined;
  return (
    <div style={{ padding: "14px 18px 16px", borderRadius: 14, border: `1px solid ${t.blueBd}`, background: t.blueBg, marginBottom: 18, boxShadow: t.sm }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#ED1C24,#C6168D)", color: "#fff" }}><Icon size={18} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: t.blue, marginBottom: 3 }}>{eyebrow}</div>}
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi, lineHeight: 1.2 }}>{title}</div>
        </div>
        {/* BARU (permintaan user - "di rata kanan ada total nya dalam
            Rp buat uinya sangat bagus"): total ringkas Langkah ini,
            rata kanan, nempel di baris judul yg sama - opsional lewat
            prop totalValue (dibiarkan undefined kalau pemanggil tidak
            butuh, spt Marketing Cost/Review yg masih pakai SecHero
            polos). */}
        {totalValue !== undefined && (
          <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 14 }}>
            {totalLabel && <div style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{totalLabel}</div>}
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtIDR(totalValue)}</div>
          </div>
        )}
      </div>
      {showDepoRow && (
        <>
          <div style={{ height: 1, background: t.blueBd, opacity: 0.6, margin: "14px 0 12px" }} />
          {/* FIX (permintaan user - "buat menjadi sangat bagus uinya
              karena nantinya ada 1 depo 4 mc"): sebelumnya selector
              Depo, tombol "Kelola Depo", badge jumlah District, DAN
              semua chip District numpuk jadi 1 baris flex-wrap yg sama
              - begitu District-nya banyak (4+), baris jadi penuh/sesak
              dan chip District keliatan "menempel" ke kontrol di
              depannya. Sekarang dipecah jadi 2 baris yg jelas di dalam
              kartu yg SAMA (bukan 2 container terpisah): baris atas =
              kontrol (selector Depo + Kelola Depo + badge jumlah), baris
              bawah = label "District" + daftar chip yg leluasa wrap
              sendiri - skalanya ga keliatan sesak walau MC-nya banyak. */}
          {/* FIX (permintaan user - "buat menjadi 2 x 2 di kolom 1 itu
              ada region dan area, di kolom 2 ada depo untuk tombol
              kelolanya itu icon only saja, dan dibawahnya adalah
              districtnya"): grid 2x2 - kolom 1 = Region (baris 1) +
              Area (baris 2), kolom 2 = Depo + tombol Kelola icon-only
              (baris 1) + District (baris 2). auto-fit supaya di layar
              sempit otomatis tumpuk jadi 1 kolom tanpa berantakan. */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(280px, 2fr)", gap: "12px 20px" }}>
            {/* Kolom 1 / Baris 1 — Region (info, tetap/tunggal per akun partner) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>Region</span>
              {regionControl || (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.inputBd}`, borderRadius: 8, padding: "7px 12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{region || "—"}</span>
              )}
            </div>

            {/* Kolom 2 / Baris 1 — Depo + tombol Kelola Depo (icon only) */}
            <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
              {depoControl || (
                <>
                  <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 8 }}>Depo</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: t.hi, textTransform: "uppercase" }}>{depoName || "—"}</span>
                </>
              )}
            </div>

            {/* Kolom 1 / Baris 2 — Area (dropdown fungsional) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>Area</span>
              {areaControl ? areaControl : areaOptions && areaOptions.length > 0 && onAreaChange ? (
                <div style={{ position: "relative", display: "inline-flex", flex: 1, minWidth: 0 }}>
                  <select
                    value={area || ""}
                    onChange={(e) => onAreaChange(e.target.value)}
                    title="Pilih Area"
                    style={{ appearance: "none", WebkitAppearance: "none", width: "100%", fontSize: 12.5, fontWeight: 700, color: t.hi, background: t.inputBg, border: `1px solid ${t.inputBd}`, borderRadius: 8, padding: "7px 28px 7px 10px", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <ChevronDown size={13} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
                </div>
              ) : (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.inputBd}`, borderRadius: 8, padding: "7px 12px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{area || "—"}</span>
              )}
            </div>

            {/* Kolom 2 / Baris 2 — District (daftar semua District di
                Depo utk Langkah 1/2, atau 1 dropdown pilih District utk
                Langkah 3/4 lewat prop mcControl - permintaan user:
                "perbaiki juga untuk 1-4 agar seragam"). */}
            <div style={{ display: "flex", alignItems: mcControl ? "center" : "flex-start", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0, marginTop: mcControl ? 0 : 7, whiteSpace: "nowrap" }}>District{!mcControl && mcs.length > 0 ? ` (${mcs.length})` : ""}</span>
              {mcControl ? mcControl : mcs.length === 0 ? (
                <div style={{ fontSize: 11.5, color: t.lo, marginTop: 5 }}>Belum ada District di Depo ini.</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 84, overflowY: "auto", paddingRight: 2 }}>
                  {mcs.map((m) => (
                    <span key={m} style={{ fontSize: 11, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.line}`, borderRadius: 999, padding: "5px 12px", boxShadow: t.sm }}>{m}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SdmFilterSelect({ value, onChange, options, allLabel, t }) {
  const hasFilter = !!value;
  return (
    <div style={{ position: "relative", display: "inline-flex", flex: 1, minWidth: 0 }}>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        title={allLabel}
        style={{ appearance: "none", WebkitAppearance: "none", width: "100%", fontSize: hasFilter ? 12.5 : 12, fontWeight: 700, color: t.hi, background: t.inputBg, border: `1px solid ${t.inputBd}`, borderRadius: 8, padding: hasFilter ? "7px 50px 7px 10px" : "7px 28px 7px 10px", cursor: "pointer", fontFamily: "inherit" }}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={13} style={{ position: "absolute", right: hasFilter ? 28 : 9, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
      {hasFilter && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Hapus filter - tampilkan semua"
          style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 5, border: "none", background: "transparent", color: t.lo, cursor: "pointer" }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// Selector generik (Depo / District) dipakai di header tiap langkah -
// user bebas ganti konteks tanpa keluar dari form.
// FIX (permintaan user - "ya lakukan hal yang sama", merujuk ke teknik
// FilterSelect di page.jsx): panah dropdown bawaan browser jaraknya ke
// border ga bisa dikontrol penuh lewat CSS (sebelumnya cuma ditambal
// pakai padding-right lebih lega). Sekarang panah bawaan DIMATIKAN total
// (appearance:none) dan diganti ikon ChevronDown yg digambar manual,
// diposisikan absolute dgn jarak tetap dari tepi kanan - hasilnya selalu
// presisi & konsisten di semua browser, sama persis spt FilterSelect.
function ScopeSelector({ label, value, onChange, options, t, extra, compact }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 10, flexWrap: compact ? "nowrap" : "wrap", marginBottom: compact ? 0 : 14, flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: compact ? t.blue : t.mid, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ position: "relative", display: "inline-flex" }}>
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ appearance: "none", WebkitAppearance: "none", padding: compact ? "6px 28px 6px 10px" : "7px 32px 7px 12px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: compact ? 12.5 : 13, fontWeight: 700, fontFamily: "inherit", minWidth: compact ? 160 : 220 }}
        >
          {options.length === 0 && <option value="">— Tidak ada —</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ position: "absolute", right: compact ? 9 : 11, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none", display: "flex" }}>
          <ChevronDown size={compact ? 13 : 14} />
        </div>
      </div>
      {extra}
    </div>
  );
}


export default function PNL_FormPengeluaranV2({ theme, profile, activeContext, canEdit, setIsFormDirty, readOnly, areaOptions, onAreaChange, periodControl }) {
  const d = theme === "dark";
  const t = useMemo(() => mk(d), [d]);
  const editable = !!canEdit && !readOnly;
  const partnerName = activeContext?.mpxName || "";
  // Permintaan user ("saat pilih mc disuruh pilih area lagi, harusnya
  // menyesuaikan filter area yang dipilih di atas"): Area/Cabang yg lagi
  // aktif di filter atas halaman, dioper ke PNL_DepoManager biar Depo yg
  // masih kosong otomatis ngikut Area itu - ga perlu nanya Area lagi.
  const contextBranch = activeContext?.branch || "";
  const monthInt = toMonthInt(activeContext?.month);
  const yearInt = toYearInt(activeContext?.year);
  const periodReady = !!(partnerName && monthInt && yearInt);

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // BARU (permintaan user - "tiap jabatan SDM levelnya beda: BM per
  // Area, TSS/SPV per MC, GM per Region, Finance Manager & HRD per
  // Partner, dst - defaultnya begitu tapi bisa dipindah per Partner
  // kalau kondisinya beda"): map item_id -> level, gabungan default
  // global (partner_name NULL) + override khusus partner ini kalau ada
  // (lihat tabel pnl_sdm_level_config). Dimuat sekali per partner,
  // independen dari periode/bulan yg dipilih.
  const [itemLevelMap, setItemLevelMap] = useState({});
  const [levelConfigLoaded, setLevelConfigLoaded] = useState(false);
  useEffect(() => {
    if (!partnerName) return;
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      setLevelConfigLoaded(false);
      const [{ data: globalRows, error: eG }, { data: ovRows, error: eO }] = await Promise.all([
        supabase.from("pnl_sdm_level_config").select("item_id, level").is("partner_name", null),
        supabase.from("pnl_sdm_level_config").select("item_id, level").eq("partner_name", partnerName),
      ]);
      if (cancelled) return;
      if (eG) console.error("[PNL_FormPengeluaranV2] gagal load pnl_sdm_level_config (global):", eG.message);
      if (eO) console.error("[PNL_FormPengeluaranV2] gagal load pnl_sdm_level_config (override):", eO.message);
      const map = {};
      (globalRows || []).forEach((r) => { map[r.item_id] = r.level; });
      (ovRows || []).forEach((r) => { map[r.item_id] = r.level; }); // override partner menang
      setItemLevelMap(map);
      setLevelConfigLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [partnerName]);
  const levelOfItem = useCallback((id) => itemLevelMap[id] || "depo", [itemLevelMap]);
  // BARU (permintaan user - "harusnya disini saja misal Business
  // Manager mau dipindah jadi level district"): pindah level item SDM
  // LANGSUNG dari layar ini, tidak perlu lagi ke halaman admin terpisah
  // "Pengaturan Level SDM". Disimpan sbg override KHUSUS Partner yg
  // sedang login (partner_name = partnerName) - default global (berlaku
  // Partner lain) tidak ikut berubah. Hanya role spm_sumatera yg boleh
  // (lihat canManageSdmLevel) - partner/admin biasa tetap read-only.
  const [movingLevelId, setMovingLevelId] = useState(null);
  const canManageSdmLevel = hasRole(profile, "spm_sumatera");
  const moveSdmItemLevel = useCallback(async (itemId, newLevel) => {
    if (!partnerName || levelOfItem(itemId) === newLevel) return;
    setMovingLevelId(itemId);
    const prevMap = itemLevelMap;
    setItemLevelMap((m) => ({ ...m, [itemId]: newLevel })); // optimistic
    try {
      const { error } = await supabase.from("pnl_sdm_level_config")
        .upsert({ item_id: itemId, partner_name: partnerName, level: newLevel, updated_at: new Date().toISOString() }, { onConflict: "item_id,partner_name" });
      if (error) throw error;
    } catch (e) {
      alert(e.message || "Gagal memindahkan level item SDM ini.");
      setItemLevelMap(prevMap); // rollback
    } finally {
      setMovingLevelId(null);
    }
  }, [partnerName, levelOfItem, itemLevelMap]);

  // ── Master data Partner ini: daftar District (mc) + Depo + mapping ──
  const [mcList, setMcList] = useState([]);
  const [deposAll, setDepos] = useState([]);
  const [depoMcRows, setDepoMcRows] = useState([]);
  const [masterLoaded, setMasterLoaded] = useState(false);
  const [showDepoManager, setShowDepoManager] = useState(false);

  const loadMaster = useCallback(async () => {
    if (!partnerName) return;
    // await microtask dulu supaya setMasterLoaded(false) TIDAK berjalan
    // sinkron dalam frame effect yg memanggil loadMaster() (hindari lint
    // react-hooks/set-state-in-effect - fungsi async yg setState sebelum
    // await pertama dianggap "sinkron" oleh compiler).
    await Promise.resolve();
    setMasterLoaded(false);
    const [{ data: dseRows }, { data: depoRows }, { data: dmRows }] = await Promise.all([
      supabase.from("mf_dse_database").select("mc, branch, region").eq("mdi", partnerName).eq("is_revoked", false).not("mc", "is", null),
      supabase.from("pnl_v2_depo").select("id, depo_name, active").eq("partner_name", partnerName).eq("active", true).order("depo_name"),
      supabase.from("pnl_v2_depo_mc").select("mc, depo_id"),
    ]);
    const seenMc = new Set();
    const mcs = [];
    (dseRows || []).forEach((r) => {
      if (seenMc.has(r.mc)) return;
      seenMc.add(r.mc);
      mcs.push({ mc: r.mc, branch: r.branch, region: r.region });
    });
    mcs.sort((a, b) => a.mc.localeCompare(b.mc));
    setMcList(mcs);
    setDepos(depoRows || []);
    // dmRows tidak difilter di server by partner (tabel ga ada kolom
    // partner_name) - filter di client supaya cuma MC milik partner ini.
    const mcSet = new Set(mcs.map((m) => m.mc));
    setDepoMcRows((dmRows || []).filter((r) => mcSet.has(r.mc)));
    setMasterLoaded(true);
  }, [partnerName]);

  useEffect(() => {
    // setTimeout(...,0) drpd panggil loadMaster() langsung - supaya
    // setState di dalamnya TIDAK dianggap "sinkron dalam effect" oleh
    // lint react-hooks/set-state-in-effect (loadMaster tetap dipakai
    // ulang manual sbg onChanged callback di PNL_DepoManager).
    const timer = setTimeout(() => { loadMaster(); }, 0);
    return () => clearTimeout(timer);
  }, [loadMaster]);

  // FIX (permintaan user - "depo ini unique per masing masing area, coba
  // perbaiki"): 1 Depo CUMA boleh berisi District dari 1 Area yg sama
  // (lihat PNL_DepoManager.jsx), tapi query Depo di atas ga difilter per
  // Area - jadi Depo milik Area LAIN dari partner yg sama ikut muncul
  // & bisa kepilih di form ini, padahal form ini scope-nya 1 Area aktif
  // saja (`contextBranch`). Di sini Depo disaring dulu: Depo yg sudah
  // punya District dicocokkan Area-nya ke `contextBranch`; Depo yg MASIH
  // KOSONG (belum ada District sama sekali, Area-nya belum "terkunci")
  // tetap ditampilkan - supaya user masih bisa lanjutin ngisi Depo yg
  // baru dibuat sebelum District-nya ditambahkan.
  const depoAreaOf = useMemo(() => {
    const m = {};
    (depoMcRows || []).forEach((r) => {
      if (m[r.depo_id]) return;
      const branch = mcList.find((x) => x.mc === r.mc)?.branch;
      if (branch) m[r.depo_id] = branch;
    });
    return m;
  }, [depoMcRows, mcList]);
  const depos = useMemo(
    () => deposAll.filter((dp) => {
      const area = depoAreaOf[dp.id];
      return !area || area === contextBranch;
    }),
    [deposAll, depoAreaOf, contextBranch],
  );

  // BARU: Region diturunkan otomatis dari Area yg lagi aktif (1 Area
  // pasti ikut 1 Region) - dipakai utk item SDM level Region (GM).
  const currentRegion = useMemo(() => mcList.find((m) => m.branch === contextBranch)?.region || "", [mcList, contextBranch]);

  // Dipilih user secara eksplisit (raw) - kalau belum pilih / pilihannya
  // sudah tidak valid lagi (Depo dihapus, dst), jatuh balik ke opsi
  // pertama. Diturunkan (useMemo), BUKAN disinkronkan via effect+setState,
  // supaya tidak kena larangan "set-state-in-effect".
  const [selectedDepoIdRaw, setSelectedDepoId] = useState("");
  const [selectedMcRaw, setSelectedMc] = useState("");
  // Filter TAMPILAN (bukan scope data - data section SDM ttp selalu
  // semua entitas) permintaan user: "ini harusnya tetap bisa dipilih,
  // namun dia ada pilihan langsung clear filter untuk menampilkan
  // semua". Kosong ("") = tidak difilter / tampilkan semua.
  const [sdmFilterRegion, setSdmFilterRegion] = useState("");
  const [sdmFilterArea, setSdmFilterArea] = useState("");
  const [sdmFilterDepoId, setSdmFilterDepoId] = useState("");
  const selectedDepoId = useMemo(
    () => (selectedDepoIdRaw && depos.some((dp) => dp.id === selectedDepoIdRaw)) ? selectedDepoIdRaw : (depos[0]?.id || ""),
    [selectedDepoIdRaw, depos],
  );

  // FIX (permintaan user - "jangan biarkan dia milih area disini, ubah
  // menjadi depo saja, jadi untuk area nya tetap mengikuti filter yang
  // atas saja, dan mc nya itu ada dari depo yang sudah didaftarkan"):
  // dulu District (MC) langkah Marketing Cost & Cost of Money
  // difilter manual lewat picker Area (branch) sendiri di sini - user
  // bisa pindah2 Area bebas, lepas dari filter Cabang/Area global di
  // atas halaman. Sekarang Area TIDAK bisa dipilih lagi di sini - ikut
  // `contextBranch` (filter Cabang/Area global) saja, dan District (MC)
  // yg ditawarkan cuma yg SUDAH terdaftar di Depo yg lagi aktif
  // (`selectedDepoId`, Depo yg sama dipakai jg di langkah OPEX/SDM) -
  // bukan lagi semua MC di Area tsb.
  const mcListInSelectedDepo = useMemo(() => {
    const mcIds = new Set((depoMcRows || []).filter((r) => r.depo_id === selectedDepoId).map((r) => r.mc));
    return mcList.filter((m) => mcIds.has(m.mc));
  }, [mcList, depoMcRows, selectedDepoId]);
  const selectedMc = useMemo(
    () => (selectedMcRaw && mcListInSelectedDepo.some((m) => m.mc === selectedMcRaw)) ? selectedMcRaw : (mcListInSelectedDepo[0]?.mc || ""),
    [selectedMcRaw, mcListInSelectedDepo],
  );

  // ── Nilai OPEX/SDM (SEMUA Depo milik Partner sekaligus) ──────────────
  // FIX (permintaan user - "untuk sdm saja kita akan buat konsepnya jadi
  // drag and drop semuanya ... sama seperti level mc sekarang ... jika
  // dia di level depo/area/region, harus masukkan semua entitas yg ada
  // di partner tersebut"): dulu cuma Depo yg lagi dipilih yg dimuat.
  // Sekarang SEMUA Depo milik Partner ini dimuat sekaligus (spt pola
  // mcAllValues) - `depoValues` (dipakai OPEX & Cost of Money Langkah 1)
  // jadi turunan dari map ini utk Depo yg lagi aktif, dan tabel
  // breakdown SDM level Depo pakai map yg SAMA utk semua Depo - 1
  // sumber data per Depo, tidak ada risiko saling timpa saat disimpan.
  const allDepoIds = useMemo(() => deposAll.map((dp) => dp.id), [deposAll]);
  const [depoAllValues, setDepoAllValues] = useState({});
  const [depoAllDirty, setDepoAllDirty] = useState(false);
  const [depoAllLoadedKey, setDepoAllLoadedKey] = useState(null);
  const depoAllCtxKey = (periodReady && allDepoIds.length > 0) ? `${allDepoIds.join(",")}|${monthInt}|${yearInt}` : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!depoAllCtxKey) { setDepoAllValues({}); setDepoAllLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_depo_v2").select("depo_id, pengeluaran_data")
        .in("depo_id", allDepoIds).eq("month", monthInt).eq("year", yearInt);
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load depo (semua):", error.message);
      const map = {};
      allDepoIds.forEach((id) => { map[id] = {}; });
      (data || []).forEach((r) => { map[r.depo_id] = r.pengeluaran_data || {}; });
      setDepoAllValues(map);
      setDepoAllDirty(false);
      setDepoAllLoadedKey(depoAllCtxKey);
    })();
    return () => { cancelled = true; };
  }, [depoAllCtxKey, allDepoIds, monthInt, yearInt]);
  const depoValues = useMemo(() => depoAllValues[selectedDepoId] || {}, [depoAllValues, selectedDepoId]);

  // BARU (permintaan user - "tampilkan semua mc, untuk mempermudah
  // pengisian oleh satu orang tanpa harus ganti ganti filternya" lalu
  // "khusus untuk sdm secara default dia akan menampilkan semua depo
  // yang ada, sehingga mc nya semua mc yang ada di partner tersebut"):
  // `mcCodesInDepo` (scoped ke Depo yg lagi dipilih) dipakai Marketing
  // Cost Langkah 3/4, TIDAK berubah. Khusus section SDM level District
  // di bawah ini, scope-nya di-WIDEN jadi SEMUA MC milik Partner ini
  // (semua Depo sekaligus, dari `mcList` yg sudah dimuat per-partner).
  const mcCodesInDepo = useMemo(() => mcListInSelectedDepo.map((m) => m.mc).sort(), [mcListInSelectedDepo]);
  // Union District dari SEMUA Depo di Area aktif (linear dgn tabel
  // "Level Depo" Langkah 1 yg juga menampilkan semua Depo di Area ini).
  const mcCodesInArea = useMemo(() => {
    const depoIds = new Set(depos.map((dp) => dp.id));
    const mcIds = new Set((depoMcRows || []).filter((r) => depoIds.has(r.depo_id)).map((r) => r.mc));
    return mcList.filter((m) => mcIds.has(m.mc)).map((m) => m.mc).sort();
  }, [depos, depoMcRows, mcList]);
  const allMcsInPartner = useMemo(() => mcList.map((m) => m.mc).sort(), [mcList]);
  // Nama Depo asal tiap MC (dari pnl_v2_depo_mc) - dipakai nunjukin
  // "Depo: ..." di tiap kartu District section SDM, krn skrg 1 section
  // bisa berisi District dari BANYAK Depo berbeda sekaligus.
  const depoNameOfMc = useMemo(() => {
    const map = {};
    (depoMcRows || []).forEach((r) => {
      if (map[r.mc]) return;
      const dp = deposAll.find((d) => d.id === r.depo_id);
      if (dp) map[r.mc] = dp.depo_name;
    });
    return map;
  }, [depoMcRows, deposAll]);
  const [mcAllValues, setMcAllValues] = useState({});
  const [mcAllDirty, setMcAllDirty] = useState(false);
  const [mcAllLoadedKey, setMcAllLoadedKey] = useState(null);
  const mcAllCtxKey = (periodReady && allMcsInPartner.length > 0) ? `${allMcsInPartner.join(",")}|${monthInt}|${yearInt}` : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mcAllCtxKey) { setMcAllValues({}); setMcAllLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_mc_v2").select("mc, pengeluaran_data")
        .in("mc", allMcsInPartner).eq("month", monthInt).eq("year", yearInt);
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load mc (semua):", error.message);
      const map = {};
      allMcsInPartner.forEach((mc) => { map[mc] = {}; });
      (data || []).forEach((r) => { map[r.mc] = r.pengeluaran_data || {}; });
      setMcAllValues(map);
      setMcAllDirty(false);
      setMcAllLoadedKey(mcAllCtxKey);
    })();
    return () => { cancelled = true; };
  }, [mcAllCtxKey, allMcsInPartner, monthInt, yearInt]);
  // `mcValues` (dipakai Marketing Cost Langkah 3 utk District yg lagi
  // "dipilih" + Review Langkah 4) skrg TURUNAN dari `mcAllValues` -
  // persis pola `depoValues` di atas, 1 sumber data per MC.
  const mcValues = useMemo(() => mcAllValues[selectedMc] || {}, [mcAllValues, selectedMc]);

  // ── Nilai SDM level Area/Region (SEMUA Area/Region milik Partner ini
  // sekaligus, bukan cuma yg lagi aktif - permintaan user: "jika dia di
  // level area, harus masukkan area-area yang ada di partner tersebut")
  const allAreas = useMemo(() => {
    const seen = new Set(); const list = [];
    mcList.forEach((m) => { if (m.branch && !seen.has(m.branch)) { seen.add(m.branch); list.push(m.branch); } });
    return list.sort((a, b) => a.localeCompare(b));
  }, [mcList]);
  const allRegions = useMemo(() => {
    const seen = new Set(); const list = [];
    mcList.forEach((m) => { if (m.region && !seen.has(m.region)) { seen.add(m.region); list.push(m.region); } });
    return list.sort((a, b) => a.localeCompare(b));
  }, [mcList]);

  const [areaAllValues, setAreaAllValues] = useState({});
  const [areaAllDirty, setAreaAllDirty] = useState(false);
  const [areaAllLoadedKey, setAreaAllLoadedKey] = useState(null);
  const areaAllCtxKey = (periodReady && allAreas.length > 0) ? `${allAreas.join(",")}|${monthInt}|${yearInt}` : null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!areaAllCtxKey) { setAreaAllValues({}); setAreaAllLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_area_v2").select("branch, pengeluaran_data")
        .eq("partner_name", partnerName).in("branch", allAreas).eq("month", monthInt).eq("year", yearInt);
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load area (semua):", error.message);
      const map = {};
      allAreas.forEach((b) => { map[b] = {}; });
      (data || []).forEach((r) => { map[r.branch] = r.pengeluaran_data || {}; });
      setAreaAllValues(map);
      setAreaAllDirty(false);
      setAreaAllLoadedKey(areaAllCtxKey);
    })();
    return () => { cancelled = true; };
  }, [areaAllCtxKey, partnerName, allAreas, monthInt, yearInt]);

  const [regionAllValues, setRegionAllValues] = useState({});
  const [regionAllDirty, setRegionAllDirty] = useState(false);
  const [regionAllLoadedKey, setRegionAllLoadedKey] = useState(null);
  const regionAllCtxKey = (periodReady && allRegions.length > 0) ? `${allRegions.join(",")}|${monthInt}|${yearInt}` : null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!regionAllCtxKey) { setRegionAllValues({}); setRegionAllLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_region_v2").select("region, pengeluaran_data")
        .eq("partner_name", partnerName).in("region", allRegions).eq("month", monthInt).eq("year", yearInt);
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load region (semua):", error.message);
      const map = {};
      allRegions.forEach((r) => { map[r] = {}; });
      (data || []).forEach((r) => { map[r.region] = r.pengeluaran_data || {}; });
      setRegionAllValues(map);
      setRegionAllDirty(false);
      setRegionAllLoadedKey(regionAllCtxKey);
    })();
    return () => { cancelled = true; };
  }, [regionAllCtxKey, partnerName, allRegions, monthInt, yearInt]);

  const [partnerValues, setPartnerValues] = useState({});
  const [partnerDirty, setPartnerDirty] = useState(false);
  const [partnerLoadedKey, setPartnerLoadedKey] = useState(null);
  const partnerCtxKey = periodReady ? `${partnerName}|${monthInt}|${yearInt}` : null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!partnerCtxKey) { setPartnerValues({}); setPartnerLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_partner_v2").select("pengeluaran_data")
        .eq("partner_name", partnerName).eq("month", monthInt).eq("year", yearInt).maybeSingle();
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load partner:", error.message);
      setPartnerValues(data?.pengeluaran_data || {});
      setPartnerDirty(false);
      setPartnerLoadedKey(partnerCtxKey);
    })();
    return () => { cancelled = true; };
  }, [partnerCtxKey, partnerName, monthInt, yearInt]);

  const isDepoStep = step === 1 || step === 2;
  const isMcStep = step === 3;
  const isSdmStep = step === 2;
  const loading = !masterLoaded || !levelConfigLoaded
    || (isDepoStep && depoAllCtxKey && depoAllLoadedKey !== depoAllCtxKey)
    || ((isMcStep || isSdmStep) && mcAllCtxKey && mcAllLoadedKey !== mcAllCtxKey)
    || (isSdmStep && areaAllCtxKey && areaAllLoadedKey !== areaAllCtxKey)
    || (isSdmStep && regionAllCtxKey && regionAllLoadedKey !== regionAllCtxKey)
    || (isSdmStep && partnerCtxKey && partnerLoadedKey !== partnerCtxKey);

  const setDepoItemValue = useCallback((id, field, v) => {
    if (!selectedDepoId) return;
    setDepoAllValues((prev) => ({ ...prev, [selectedDepoId]: { ...(prev[selectedDepoId] || {}), [id]: { ...((prev[selectedDepoId] || {})[id] || {}), [field]: v } } }));
    setDepoAllDirty(true); setIsFormDirty?.(true);
  }, [selectedDepoId, setIsFormDirty]);
  const setMcAllItemValue = useCallback((mc, id, field, v) => {
    setMcAllValues((prev) => ({ ...prev, [mc]: { ...(prev[mc] || {}), [id]: { ...((prev[mc] || {})[id] || {}), [field]: v } } }));
    setMcAllDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  // BARU (permintaan user - "sama seperti level mc sekarang ... untuk
  // level area/region/depo, harus masukkan semua entitas yg ada di
  // partner tersebut"): setter generik per-entitas utk Depo/Area/Region
  // - dipakai MultiEntityItemTable, 1 fungsi yg sama polanya dgn
  // setMcAllItemValue di atas.
  const setDepoAllItemValue = useCallback((depoId, id, field, v) => {
    setDepoAllValues((prev) => ({ ...prev, [depoId]: { ...(prev[depoId] || {}), [id]: { ...((prev[depoId] || {})[id] || {}), [field]: v } } }));
    setDepoAllDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setAreaAllItemValue = useCallback((branch, id, field, v) => {
    setAreaAllValues((prev) => ({ ...prev, [branch]: { ...(prev[branch] || {}), [id]: { ...((prev[branch] || {})[id] || {}), [field]: v } } }));
    setAreaAllDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setRegionAllItemValue = useCallback((region, id, field, v) => {
    setRegionAllValues((prev) => ({ ...prev, [region]: { ...(prev[region] || {}), [id]: { ...((prev[region] || {})[id] || {}), [field]: v } } }));
    setRegionAllDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setPartnerItemValue = useCallback((id, field, v) => {
    setPartnerValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setPartnerDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);

  const depoSummary = useMemo(() => summarizePengeluaran(depoValues), [depoValues]);
  const mcSummary = useMemo(() => summarizePengeluaran(mcValues), [mcValues]);
  // BARU (permintaan user - Langkah 1/3 skrg nampilin SEMUA Depo/District
  // sekaligus sbg kolom tabel): total OPEX/Cost of Money dijumlahkan dari
  // SEMUA Depo di Area yg aktif; total Marketing Cost dari SEMUA District
  // di Depo yg aktif - supaya angkanya konsisten sama apa yg keliatan &
  // bisa diisi di tabel.
  const areaDepoSummary = useMemo(() => {
    let totalOpex = 0, totalCostOfMoney = 0;
    const opexItems = itemsOf("OPEX"), comItems = itemsOf("COST OF MONEY");
    depos.forEach((dp) => {
      const v = depoAllValues[dp.id] || {};
      opexItems.forEach((it) => { totalOpex += numOrZero(v[it.id]?.total); });
      comItems.forEach((it) => { totalCostOfMoney += numOrZero(v[it.id]?.total); });
    });
    return { totalOpex, totalCostOfMoney };
  }, [depos, depoAllValues]);
  const depoMcSummary = useMemo(() => {
    let totalMarketing = 0;
    const mktItems = itemsOf("MARKETING COST");
    mcCodesInDepo.forEach((mc) => {
      const v = mcAllValues[mc] || {};
      mktItems.forEach((it) => { totalMarketing += numOrZero(v[it.id]?.total); });
    });
    return { totalMarketing };
  }, [mcCodesInDepo, mcAllValues]);
  // Nilai SDM gabungan dari 5 kemungkinan sumber (Depo/MC/Area/Region/
  // Partner) sesuai level tiap item - dipakai utk render tabel SDM &
  // hitung Total SDM yg benar (bukan cuma dari satu sumber).
  // BARU: level MC/Area/Region/Depo skrg multi-entitas (semua entitas di
  // bawah Partner) - total per item dijumlahkan dari SEMUA entitas pada
  // level itu (bukan cuma 1 entitas aktif spt dulu).
  const sdmValuesMerged = useMemo(() => {
    const sumAcross = (map, id) => {
      let sum = 0;
      Object.values(map).forEach((v) => { sum += numOrZero(v?.[id]?.total); });
      return sum;
    };
    const out = {};
    itemsOf("SDM").forEach((it) => {
      const lvl = levelOfItem(it.id);
      if (lvl === "partner") {
        if (partnerValues[it.id]) out[it.id] = partnerValues[it.id];
        return;
      }
      const map = lvl === "mc" ? mcAllValues : lvl === "area" ? areaAllValues : lvl === "region" ? regionAllValues : depoAllValues;
      const sum = sumAcross(map, it.id);
      if (sum) out[it.id] = { total: sum };
    });
    return out;
  }, [levelOfItem, mcAllValues, areaAllValues, regionAllValues, depoAllValues, partnerValues]);
  const sdmSummary = useMemo(() => summarizePengeluaran(sdmValuesMerged), [sdmValuesMerged]);

  const cleanValues = (values, steps) => {
    const cleaned = {};
    PENGELUARAN_CATALOG.forEach((it) => {
      if (!steps.includes(it.step)) return;
      const row = values[it.id];
      if (!row) return;
      const total = it.qtyOnly ? 0 : numOrZero(row.total), qty = numOrZero(row.qty);
      if (total || qty) cleaned[it.id] = { total, qty };
    });
    return cleaned;
  };

  // BARU: simpan OPEX/Cost of Money/SDM utk SEMUA Depo milik Partner ini
  // sekaligus (1 upsert banyak baris) - depoValues (OPEX & CoM Depo yg
  // lagi aktif) cuma turunan dari depoAllValues, jadi ikut tersimpan
  // benar dlm upsert ini tanpa risiko ketimpa data Depo lain.
  const saveDepoAll = async () => {
    if (!depoAllCtxKey || allDepoIds.length === 0) return;
    setSaving(true);
    try {
      const rows = allDepoIds.map((depoId) => ({
        partner_name: partnerName,
        depo_id: depoId,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(depoAllValues[depoId] || {}, ["OPEX", "SDM", "COST OF MONEY"]),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("pnl_pengeluaran_depo_v2").upsert(rows, { onConflict: "depo_id,month,year" });
      if (error) throw error;
      setDepoAllDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan OPEX/SDM (Depo).");
    } finally {
      setSaving(false);
    }
  };

  // BARU: simpan item SDM level District (MC) utk SEMUA MC di Depo ini
  // sekaligus (1 upsert banyak baris) - setiap baris tetap mempertahankan
  // field MARKETING COST milik MC tsb (ikut di-load bareng mcAllValues)
  // supaya tidak ketimpa kosong oleh langkah SDM ini.
  const saveMcAll = async () => {
    if (!mcAllCtxKey || allMcsInPartner.length === 0) return;
    setSaving(true);
    try {
      const rows = allMcsInPartner.map((mc) => ({
        partner_name: partnerName,
        mc,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: { ...cleanValues(mcAllValues[mc] || {}, ["MARKETING COST"]), ...cleanValues(mcAllValues[mc] || {}, ["SDM"]) },
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("pnl_pengeluaran_mc_v2").upsert(rows, { onConflict: "mc,month,year" });
      if (error) throw error;
      setMcAllDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan SDM (District/MC).");
    } finally {
      setSaving(false);
    }
  };

  // BARU: simpan SDM level Area/Region/Partner - tiap entitas 1 baris
  // per periode (bukan per Depo), supaya berlaku utk semua Depo di
  // bawahnya tanpa perlu diisi ulang.
  // BARU: simpan SDM level Area/Region utk SEMUA Area/Region milik
  // Partner ini sekaligus (1 upsert banyak baris per tabel).
  const saveAreaAll = async () => {
    if (!areaAllCtxKey || allAreas.length === 0) return;
    setSaving(true);
    try {
      const rows = allAreas.map((branch) => ({
        partner_name: partnerName,
        branch,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(areaAllValues[branch] || {}, ["SDM"]),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("pnl_pengeluaran_area_v2").upsert(rows, { onConflict: "partner_name,branch,month,year" });
      if (error) throw error;
      setAreaAllDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan SDM (Area).");
    } finally {
      setSaving(false);
    }
  };
  const saveRegionAll = async () => {
    if (!regionAllCtxKey || allRegions.length === 0) return;
    setSaving(true);
    try {
      const rows = allRegions.map((region) => ({
        partner_name: partnerName,
        region,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(regionAllValues[region] || {}, ["SDM"]),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("pnl_pengeluaran_region_v2").upsert(rows, { onConflict: "partner_name,region,month,year" });
      if (error) throw error;
      setRegionAllDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan SDM (Region).");
    } finally {
      setSaving(false);
    }
  };
  const savePartner = async () => {
    if (!partnerCtxKey) return;
    setSaving(true);
    try {
      const payload = {
        partner_name: partnerName,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(partnerValues, ["SDM"]),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("pnl_pengeluaran_partner_v2").upsert(payload, { onConflict: "partner_name,month,year" });
      if (error) throw error;
      setPartnerDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan SDM (Partner).");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (isSdmStep) return Promise.all([saveDepoAll(), saveMcAll(), saveAreaAll(), saveRegionAll(), savePartner()]);
    if (isDepoStep) return saveDepoAll();
    if (isMcStep) return saveMcAll();
    return Promise.all([saveDepoAll(), saveMcAll(), saveAreaAll(), saveRegionAll(), savePartner()]);
  };
  const anyDirty = depoAllDirty || mcAllDirty || areaAllDirty || regionAllDirty || partnerDirty;

  const depoOptions = depos.map((dp) => ({ value: dp.id, label: dp.depo_name }));
  const mcOptions = mcListInSelectedDepo.map((m) => ({ value: m.mc, label: m.mc }));

  // Permintaan user ("sebelum menambahkan district, tidak bisa melakukan
  // pengisian"): OPEX/SDM TIDAK boleh diisi kalau Depo yg sedang dipilih
  // masih 0 District (biar ga ada biaya "nyangkut" di Depo kosong) -
  // selain gate "belum ada Depo sama sekali" (needsDepoGate) yg sudah ada.
  const selectedDepoMcCount = useMemo(
    () => (depoMcRows || []).filter((r) => r.depo_id === selectedDepoId).length,
    [depoMcRows, selectedDepoId],
  );
  const depoNeedsMc = !!selectedDepoId && selectedDepoMcCount === 0;

  // FIX: Area/Region/Depo level SDM skrg multi-entitas (semua Area/
  // Region/Depo milik Partner), jadi read-only-nya ga lagi bergantung ke
  // 1 Area/Region/Depo aktif - cukup ada minimal 1 entitas di partner
  // ini.
  const sdmRowReadOnly = useCallback((lvl) => {
    if (!editable) return true;
    if (lvl === "depo") return allDepoIds.length === 0;
    if (lvl === "mc") return allMcsInPartner.length === 0;
    if (lvl === "area") return allAreas.length === 0;
    if (lvl === "region") return allRegions.length === 0;
    return false; // partner - selalu tersedia begitu partnerName diketahui
  }, [editable, allDepoIds, allMcsInPartner, allAreas, allRegions]);
  const itemsForSdmLevel = useCallback((lvl) => itemsOf("SDM").filter((it) => levelOfItem(it.id) === lvl), [levelOfItem]);
  const sdmRegionsFiltered = useMemo(() => (sdmFilterRegion ? allRegions.filter((r) => r === sdmFilterRegion) : allRegions), [allRegions, sdmFilterRegion]);
  const sdmAreasFiltered = useMemo(() => (sdmFilterArea ? allAreas.filter((a) => a === sdmFilterArea) : allAreas), [allAreas, sdmFilterArea]);
  const sdmDeposFiltered = useMemo(() => (sdmFilterDepoId ? deposAll.filter((dp) => dp.id === sdmFilterDepoId) : deposAll), [deposAll, sdmFilterDepoId]);
  const sdmMcsFiltered = useMemo(() => {
    if (!sdmFilterDepoId) return allMcsInPartner;
    const mcIds = new Set((depoMcRows || []).filter((r) => r.depo_id === sdmFilterDepoId).map((r) => r.mc));
    return allMcsInPartner.filter((mc) => mcIds.has(mc));
  }, [sdmFilterDepoId, allMcsInPartner, depoMcRows]);
  const sdmLevelEntityLabel = (lvl) => {
    if (lvl === "partner") return partnerName || "—";
    if (lvl === "region") return sdmRegionsFiltered.length ? (sdmFilterRegion || `Semua Region (${sdmRegionsFiltered.length})`) : "—";
    if (lvl === "area") return sdmAreasFiltered.length ? (sdmFilterArea || `Semua Area (${sdmAreasFiltered.length})`) : "—";
    if (lvl === "mc") return sdmMcsFiltered.length ? `${sdmFilterDepoId ? "District" : "Semua District"} (${sdmMcsFiltered.length})` : "—";
    if (sdmDeposFiltered.length === 0) return "—";
    return sdmFilterDepoId ? (deposAll.find((dp) => dp.id === sdmFilterDepoId)?.depo_name || "—") : `Semua Depo (${sdmDeposFiltered.length})`;
  };
  // ── Drag-and-drop item SDM antar level (ganti UI select lama) ────────
  const draggedItemIdRef = useRef(null);
  const [dragOverLevel, setDragOverLevel] = useState(null);
  const handleSdmItemDragStart = useCallback((e, itemId) => {
    draggedItemIdRef.current = itemId;
    try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", itemId); } catch { /* noop */ }
  }, []);
  const handleSdmLevelDragOver = useCallback((e, lvl) => {
    if (!canManageSdmLevel || !draggedItemIdRef.current) return;
    e.preventDefault();
    if (dragOverLevel !== lvl) setDragOverLevel(lvl);
  }, [canManageSdmLevel, dragOverLevel]);
  const handleSdmLevelDragLeave = useCallback((lvl) => {
    setDragOverLevel((cur) => (cur === lvl ? null : cur));
  }, []);
  const handleSdmLevelDrop = useCallback((e, lvl) => {
    e.preventDefault();
    const itemId = draggedItemIdRef.current;
    draggedItemIdRef.current = null;
    setDragOverLevel(null);
    if (itemId) moveSdmItemLevel(itemId, lvl);
  }, [moveSdmItemLevel]);
  const renderSdmLevelSection = (lvl) => {
    const items = itemsForSdmLevel(lvl);
    const subtotal = items.reduce((sum, it) => sum + numOrZero((sdmValuesMerged[it.id] || {}).total), 0);
    const isOver = dragOverLevel === lvl;
    let table;
    const dndCommon = { draggable: canManageSdmLevel, onItemDragStart: handleSdmItemDragStart, movingLevelId, onMoveLevel: canManageSdmLevel ? moveSdmItemLevel : undefined, levelOfItem, t };
    if (lvl === "partner") {
      table = <ItemTable items={items} values={partnerValues} onChange={setPartnerItemValue} readOnly={sdmRowReadOnly(lvl)} showQty showKategori {...dndCommon} />;
    } else if (lvl === "region") {
      table = <MultiEntityItemTable items={items} entities={sdmRegionsFiltered.map((r) => ({ key: r, label: r }))} valuesByEntity={regionAllValues} onChange={setRegionAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Region." {...dndCommon} />;
    } else if (lvl === "area") {
      table = <MultiEntityItemTable items={items} entities={sdmAreasFiltered.map((a) => ({ key: a, label: a }))} valuesByEntity={areaAllValues} onChange={setAreaAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Area." {...dndCommon} />;
    } else if (lvl === "mc") {
      table = <MultiEntityItemTable items={items} entities={sdmMcsFiltered.map((mc) => ({ key: mc, label: mc, sublabel: depoNameOfMc[mc] }))} valuesByEntity={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada District." {...dndCommon} />;
    } else {
      table = <MultiEntityItemTable items={items} entities={sdmDeposFiltered.map((dp) => ({ key: dp.id, label: dp.depo_name }))} valuesByEntity={depoAllValues} onChange={setDepoAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Depo." {...dndCommon} />;
    }
    return (
      <div
        key={lvl}
        onDragOver={(e) => handleSdmLevelDragOver(e, lvl)}
        onDragLeave={() => handleSdmLevelDragLeave(lvl)}
        onDrop={(e) => handleSdmLevelDrop(e, lvl)}
      >
        <Card t={t} style={isOver ? { outline: `2px dashed ${t.blue || t.hi}`, outlineOffset: -2, background: t.blueBg, transition: "background 0.12s, outline-color 0.12s" } : { transition: "background 0.12s, outline-color 0.12s" }}>
          <Body>
            <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(subtotal)}</span>}>
              {SDM_LEVEL_LABEL[lvl]} <span style={{ fontWeight: 500, color: t.lo }}>— {sdmLevelEntityLabel(lvl)}</span>
            </SecLabel>
            {items.length === 0 ? (
              <div style={{ fontSize: 12.5, color: t.lo, padding: "10px 2px" }}>
                Belum ada item di level ini.{canManageSdmLevel && " Seret (drag) item dari section lain ke sini untuk memindahkannya."}
              </div>
            ) : table}
          </Body>
        </Card>
      </div>
    );
  };
  const needsDepoGate = isDepoStep && masterLoaded && depos.length === 0;

  return (
    <div style={{ width: "100%", margin: "0 auto", paddingBottom: 80, fontFamily: FONT, WebkitFontSmoothing: "antialiased", color: t.hi }}>
      <V2Styles d={d} t={t} />
      {/* FIX (permintaan user - "pindahkan ini di atas stepper"): picker
          scope (Depo utk OPEX/SDM; Depo + District (MC) utk Marketing
          Cost/Cost of Money) SEMUA dipindah ke sini (di atas Stepper,
          nempel ke FormHeader) - sebelumnya picker Depo+District utk
          step 3/4 masih dirender terpisah DI DALAM body step tsb,
          sementara picker Depo utk step 1/2 sudah lebih dulu ada di
          sini, jadi letaknya ga konsisten antar step. */}
      {/* FIX (permintaan user - "perbaiki juga untuk 1-4 agar seragam"):
          panel Depo/District/Partner/Region/Area yg dulu nempel di sini
          (di atas Stepper) dihapus - skrg REDUNDAN krn tiap Langkah
          (1-4) sudah seragam punya kartu StepHeroDepo sendiri yg isinya
          persis sama (Depo, Region, Area, District). */}
      <FormHeader icon={ArrowDownLeft} title="Form Pengeluaran" activeContext={activeContext} readOnly={!editable} t={t} headerRight={periodControl} />

      {loading ? <LoadingBlock label="Memuat Form Pengeluaran V2..." t={t} /> : (
        <>
          <Stepper items={STEP_LABELS} step={step} setStep={setStep} t={t} d={d} />

          {step === 1 && (
            <>
              <StepHeroDepo
                icon={Building2} eyebrow="Langkah 1 dari 4" title="OPEX & Cost of Money"
                depoName={!needsDepoGate && selectedDepoId ? depos.find((dp) => dp.id === selectedDepoId)?.depo_name : undefined}
                depoControl={!needsDepoGate && depoOptions.length > 0 ? (
                  <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact
                    extra={editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" title="Kelola Depo" style={{ padding: "7px 9px", width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Settings2 size={13} /></button>} />
                ) : undefined}
                region={currentRegion} area={contextBranch}
                areaOptions={areaOptions} onAreaChange={editable ? onAreaChange : undefined}
                mcs={mcCodesInArea}
                totalLabel="Total OPEX + Cost of Money"
                totalValue={!needsDepoGate ? areaDepoSummary.totalOpex + areaDepoSummary.totalCostOfMoney : undefined}
                t={t}
              />
              {needsDepoGate ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 13, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>
                    Anda perlu menambahkan Depo terlebih dahulu sebelum bisa mengisi laporan OPEX, Cost of Money & SDM. Depo adalah kelompok District (MC) buatan Anda sendiri — bisa diubah kapan saja.
                  </div>
                  <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} embedded />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {showDepoManager && (
                    <div
                      onClick={() => setShowDepoManager(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
                    >
                      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 980, maxHeight: "88vh", overflowY: "auto", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
                        <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} onClose={() => setShowDepoManager(false)} />
                      </div>
                    </div>
                  )}
                  {depoNeedsMc && (
                    <div style={{ fontSize: 13, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>
                      Depo ini belum punya District. Tambahkan minimal 1 District lewat &ldquo;Kelola Depo&rdquo; di atas sebelum mengisi OPEX, Cost of Money & SDM-nya.
                    </div>
                  )}
                  {/* Permintaan user ("buat opex dalam satu container"): tabel
                      item OPEX + Total OPEX digabung jadi 1 Card yg sama -
                      sebelumnya Total OPEX dirender terpisah di luar Card
                      lewat SubtotalBanner (kotak gradient sendiri di bawah),
                      sekarang jadi baris penutup DI DALAM Card yg sama. */}
                  <Card t={t}><Body>
                    <SecLabel t={t}>Level Depo <span style={{ fontWeight: 500, color: t.lo }}>— {contextBranch || "Area ini"} ({depos.length})</span></SecLabel>
                    <EntityColumnTable items={itemsOf("OPEX")} entities={depos.map((dp) => ({ key: dp.id, label: dp.depo_name }))} valuesByEntity={depoAllValues} onChange={setDepoAllItemValue} readOnly={!editable || depos.length === 0} showKategori emptyLabel="Belum ada Depo di Area ini." t={t} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.line}` }}>
                      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: t.mid }}>Total OPEX</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(areaDepoSummary.totalOpex)}</span>
                    </div>
                  </Body></Card>
                  {/* Sama spt OPEX ("buat konsepnya seperti total cost of money"
                      -> dibalik: Cost of Money ikut disamakan spt OPEX) -
                      tabel item + Total Cost of Money digabung 1 Card. */}
                  <Card t={t}><Body>
                    <SecLabel t={t}>Level Depo <span style={{ fontWeight: 500, color: t.lo }}>— {contextBranch || "Area ini"} ({depos.length})</span></SecLabel>
                    <EntityColumnTable items={itemsOf("COST OF MONEY")} entities={depos.map((dp) => ({ key: dp.id, label: dp.depo_name }))} valuesByEntity={depoAllValues} onChange={setDepoAllItemValue} readOnly={!editable || depos.length === 0} showKategori emptyLabel="Belum ada Depo di Area ini." t={t} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.line}` }}>
                      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: t.mid }}>Total Cost of Money</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(areaDepoSummary.totalCostOfMoney)}</span>
                    </div>
                  </Body></Card>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <StepHeroDepo
                icon={Users} eyebrow="Langkah 2 dari 4" title="SDM"
                depoName={!needsDepoGate ? `Semua Depo (${allDepoIds.length})` : undefined}
                regionControl={!needsDepoGate ? (
                  <SdmFilterSelect value={sdmFilterRegion} onChange={setSdmFilterRegion} options={allRegions.map((r) => ({ value: r, label: r }))} allLabel={`Semua Region (${allRegions.length})`} t={t} />
                ) : undefined}
                areaControl={!needsDepoGate ? (
                  <SdmFilterSelect value={sdmFilterArea} onChange={setSdmFilterArea} options={allAreas.map((a) => ({ value: a, label: a }))} allLabel={`Semua Area (${allAreas.length})`} t={t} />
                ) : undefined}
                depoControl={!needsDepoGate ? (
                  <SdmFilterSelect value={sdmFilterDepoId} onChange={setSdmFilterDepoId} options={deposAll.map((dp) => ({ value: dp.id, label: dp.depo_name }))} allLabel={`Semua Depo (${allDepoIds.length})`} t={t} />
                ) : undefined}
                mcs={sdmMcsFiltered}
                totalLabel="Total SDM"
                totalValue={!needsDepoGate ? sdmSummary.totalSdm : undefined}
                t={t}
              />
              {!needsDepoGate && (
                <div style={{ fontSize: 11.5, color: t.mid, background: t.blueBg, border: `1px solid ${t.blueBd}`, borderRadius: 8, padding: "8px 12px", marginTop: -10, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <Info size={12} style={{ flexShrink: 0 }} />
                  SDM diisi sekaligus utk semua Region, Area, Depo & District milik partner ini. Selector Region/Area/Depo di atas HANYA menyaring tampilan di bawah - klik &ldquo;Semua ...&rdquo; atau ikon X utk kembali melihat semuanya.
                </div>
              )}
              {needsDepoGate ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 13, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>
                    Anda perlu menambahkan Depo terlebih dahulu sebelum bisa mengisi laporan OPEX & SDM.
                  </div>
                  <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} embedded />
                </div>
              ) : (
                // FIX (permintaan user - "kolom komponennya jangan lebar kali"):
                // breakout lebar pakai satuan viewport (vw) sebelumnya SALAH -
                // ga memperhitungkan sidebar di kiri, jadi kontennya malah
                // kegeser/kepotong tanpa scrollbar yg berfungsi. Dibalik ke
                // lebar normal mengikuti container halaman - sudah cukup
                // lega skrg krn kartu per-entitas di bawah sudah WRAP
                // otomatis, tidak lagi melebar terus sesuai jumlah entitas.
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {showDepoManager && (
                    <div
                      onClick={() => setShowDepoManager(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
                    >
                      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 980, maxHeight: "88vh", overflowY: "auto", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
                        <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} onClose={() => setShowDepoManager(false)} />
                      </div>
                    </div>
                  )}
                  {depoNeedsMc && (
                    <div style={{ fontSize: 13, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>
                      Depo ini belum punya District. Tambahkan minimal 1 District lewat &ldquo;Kelola Depo&rdquo; di atas sebelum mengisi OPEX & SDM-nya.
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                    <SubtotalBanner label="Total HR Cost Sales" value={sdmSummary.totalSdmSales} />
                    <SubtotalBanner label="Total HR Cost Non Sales" value={sdmSummary.totalSdmNonSales} />
                  </div>
                  {canManageSdmLevel && (
                    <div style={{ fontSize: 12, color: t.mid, display: "flex", alignItems: "center", gap: 6, padding: "2px 2px" }}>
                      <GripVertical size={13} /> Seret (drag) baris item ke salah satu section level di bawah untuk memindahkan levelnya.
                    </div>
                  )}
                  {SDM_LEVEL_ORDER.map((lvl) => renderSdmLevelSection(lvl))}
                  <SubtotalBanner label="Total SDM" value={sdmSummary.totalSdm} />
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <StepHeroDepo
                icon={Megaphone} eyebrow="Langkah 3 dari 4" title="Marketing Cost"
                depoName={!needsDepoGate && selectedDepoId ? depos.find((dp) => dp.id === selectedDepoId)?.depo_name : undefined}
                depoControl={!needsDepoGate && depoOptions.length > 0 ? (
                  <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact
                    extra={editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" title="Kelola Depo" style={{ padding: "7px 9px", width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Settings2 size={13} /></button>} />
                ) : undefined}
                region={currentRegion} area={contextBranch}
                areaOptions={areaOptions} onAreaChange={editable ? onAreaChange : undefined}
                mcs={mcCodesInDepo}
                totalLabel="Total Marketing Cost"
                totalValue={!needsDepoGate ? depoMcSummary.totalMarketing : undefined}
                t={t}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card t={t}><Body>
                  <SecLabel t={t}>Level District (MC) <span style={{ fontWeight: 500, color: t.lo }}>— {depos.find((dp) => dp.id === selectedDepoId)?.depo_name || "Depo ini"} ({mcCodesInDepo.length})</span></SecLabel>
                  <EntityColumnTable items={itemsOf("MARKETING COST")} entities={mcListInSelectedDepo.map((m) => ({ key: m.mc, label: m.mc }))} valuesByEntity={mcAllValues} onChange={setMcAllItemValue} readOnly={!editable || mcListInSelectedDepo.length === 0} emptyLabel="Belum ada District di Depo ini." t={t} />
                </Body></Card>
                <SubtotalBanner label="Total Marketing Cost" value={depoMcSummary.totalMarketing} />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <StepHeroDepo
                icon={FileText} eyebrow="Langkah 4 dari 4" title="Ringkasan Akhir"
                depoName={!needsDepoGate && selectedDepoId ? depos.find((dp) => dp.id === selectedDepoId)?.depo_name : undefined}
                depoControl={!needsDepoGate && depoOptions.length > 0 ? (
                  <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact
                    extra={editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" title="Kelola Depo" style={{ padding: "7px 9px", width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Settings2 size={13} /></button>} />
                ) : undefined}
                region={currentRegion} area={contextBranch}
                areaOptions={areaOptions} onAreaChange={editable ? onAreaChange : undefined}
                mcs={mcCodesInDepo}
                mcControl={<ScopeSelector label="District" value={selectedMc} onChange={setSelectedMc} options={mcOptions} t={t} compact />}
                totalLabel="Grand Total (Depo + District terpilih)"
                totalValue={!needsDepoGate ? depoSummary.totalOpex + depoSummary.totalCostOfMoney + sdmSummary.totalSdm + mcSummary.totalMarketing : undefined}
                t={t}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card t={t}><Body>
                  <SecLabel t={t}>OPEX, Cost of Money & SDM — Depo: {depoOptions.find((o) => o.value === selectedDepoId)?.label || "—"}</SecLabel>
                  <SumRow icon={Building2} label="Total OPEX" value={depoSummary.totalOpex} bold t={t} />
                  <SumRow icon={Coins} label="Total Cost of Money" value={depoSummary.totalCostOfMoney} bold t={t} />
                  <SumRow icon={Users} label="Total SDM" value={sdmSummary.totalSdm} bold t={t} />
                  <SumRow label="HR Cost Sales" value={sdmSummary.totalSdmSales} indent t={t} />
                  <SumRow label="HR Cost Non Sales" value={sdmSummary.totalSdmNonSales} indent t={t} />
                </Body></Card>
                <Card t={t}><Body>
                  <SecLabel t={t}>Marketing Cost — District: {mcOptions.find((o) => o.value === selectedMc)?.label || "—"}</SecLabel>
                  <SumRow icon={Megaphone} label="Total Marketing Cost" value={mcSummary.totalMarketing} bold t={t} />
                </Body></Card>
                <SubtotalBanner label="Grand Total Pengeluaran (Depo + District terpilih)" value={depoSummary.totalOpex + depoSummary.totalCostOfMoney + sdmSummary.totalSdm + mcSummary.totalMarketing} />
              </div>
            </>
          )}

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, color: t.lo, padding: "16px 2px 0" }}>
            <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Qty dan Total (Rp) diisi terpisah dan tidak dikalikan otomatis. OPEX, Cost of Money & SDM disimpan per Depo, Marketing Cost disimpan per District (MC).</span>
          </div>

          <FooterBar t={t} d={d}>
            {editable && step < 4 && !needsDepoGate && <button onClick={handleSave} disabled={saving || !anyDirty} className="v2btn-g"><Save size={13} />{saving ? "Menyimpan..." : "Simpan"}</button>}
            {step > 1 && <button onClick={() => setStep((s) => s - 1)} className="v2btn-g"><ArrowLeft size={13} />Kembali</button>}
            {step < 4
              ? <button onClick={() => setStep((s) => s + 1)} className="v2btn-p">Lanjut <ArrowRight size={13} /></button>
              : (editable && <button onClick={handleSave} disabled={saving || !anyDirty} className="v2btn-p"><Save size={13} />{saving ? "Menyimpan..." : "Simpan"}</button>)}
          </FooterBar>
        </>
      )}
    </div>
  );
}
