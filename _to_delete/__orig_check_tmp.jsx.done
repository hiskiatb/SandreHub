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
import { useEffect, useMemo, useState, useCallback } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowRight, Building2, ChevronDown, Coins, FileText, Info, Megaphone, Save, Settings2, Users } from "lucide-react";
import supabase from "../../../lib/supabase";
import {
  FONT, mk, V2Styles, NumInput, Card, Body, SecLabel, TH, FormHeader, Stepper, SecHero,
  SubtotalBanner, SumRow, FooterBar, LoadingBlock, toMonthInt, toYearInt, numOrZero, fmtIDR,
} from "./PNL_V2Shared";
import PNL_DepoManager from "./PNL_DepoManager";

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
const itemsOf = (step, group) => PENGELUARAN_CATALOG.filter((it) => it.step === step && (!group || it.salesGroup === group));

// Tabel item 1 langkah - kolom: Sub-Kategori | Total (Rp). Kolom Qty
// DIHAPUS (permintaan user - "hilangkan qty ini, tidak perlu ada qty
// cukup amount") - field `qty` di data model dibiarkan ada di skema DB,
// cuma sudah ga ada input-nya lagi di sini (summarizePengeluaran() cuma
// pernah pakai field `total` utk semua perhitungan, jadi aman).
function ItemTable({ items, values, onChange, readOnly, showKategori, t }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 400 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            <TH t={t}>Sub-Kategori</TH>
            <TH t={t} align="right" width={190}>Total (Rp)</TH>
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
              <td style={{ padding: "9px 8px", width: 190, verticalAlign: "middle" }}>
                <NumInput numericValue={values[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(it.id, "total", v)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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


export default function PNL_FormPengeluaranV2({ theme, profile, activeContext, canEdit, setIsFormDirty, readOnly }) {
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

  // Dipilih user secara eksplisit (raw) - kalau belum pilih / pilihannya
  // sudah tidak valid lagi (Depo dihapus, dst), jatuh balik ke opsi
  // pertama. Diturunkan (useMemo), BUKAN disinkronkan via effect+setState,
  // supaya tidak kena larangan "set-state-in-effect".
  const [selectedDepoIdRaw, setSelectedDepoId] = useState("");
  const [selectedMcRaw, setSelectedMc] = useState("");
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

  // ── Nilai OPEX/SDM (per Depo) ────────────────────────────────────────
  const [depoValues, setDepoValues] = useState({});
  const [depoDirty, setDepoDirty] = useState(false);
  const [depoLoadedKey, setDepoLoadedKey] = useState(null);
  const depoCtxKey = (periodReady && selectedDepoId) ? `${selectedDepoId}|${monthInt}|${yearInt}` : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!depoCtxKey) { setDepoValues({}); setDepoLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_depo_v2").select("pengeluaran_data")
        .eq("depo_id", selectedDepoId).eq("month", monthInt).eq("year", yearInt).maybeSingle();
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load depo:", error.message);
      setDepoValues(data?.pengeluaran_data || {});
      setDepoDirty(false);
      setDepoLoadedKey(depoCtxKey);
    })();
    return () => { cancelled = true; };
  }, [depoCtxKey, selectedDepoId, monthInt, yearInt]);

  // ── Nilai MKT/COM (per District/mc) ──────────────────────────────────
  const [mcValues, setMcValues] = useState({});
  const [mcDirty, setMcDirty] = useState(false);
  const [mcLoadedKey, setMcLoadedKey] = useState(null);
  const mcCtxKey = (periodReady && selectedMc) ? `${selectedMc}|${monthInt}|${yearInt}` : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mcCtxKey) { setMcValues({}); setMcLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_mc_v2").select("pengeluaran_data")
        .eq("mc", selectedMc).eq("month", monthInt).eq("year", yearInt).maybeSingle();
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load mc:", error.message);
      setMcValues(data?.pengeluaran_data || {});
      setMcDirty(false);
      setMcLoadedKey(mcCtxKey);
    })();
    return () => { cancelled = true; };
  }, [mcCtxKey, selectedMc, monthInt, yearInt]);

  const isDepoStep = step === 1 || step === 2;
  const isMcStep = step === 3;
  const loading = !masterLoaded || (isDepoStep && depoCtxKey && depoLoadedKey !== depoCtxKey) || (isMcStep && mcCtxKey && mcLoadedKey !== mcCtxKey);

  const setDepoItemValue = useCallback((id, field, v) => {
    setDepoValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setDepoDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setMcItemValue = useCallback((id, field, v) => {
    setMcValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setMcDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);

  const depoSummary = useMemo(() => summarizePengeluaran(depoValues), [depoValues]);
  const mcSummary = useMemo(() => summarizePengeluaran(mcValues), [mcValues]);

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

  const saveDepo = async () => {
    if (!depoCtxKey) return;
    setSaving(true);
    try {
      const payload = {
        partner_name: partnerName,
        depo_id: selectedDepoId,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(depoValues, ["OPEX", "SDM", "COST OF MONEY"]),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("pnl_pengeluaran_depo_v2").upsert(payload, { onConflict: "depo_id,month,year" });
      if (error) throw error;
      setDepoDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan OPEX/SDM (Depo).");
    } finally {
      setSaving(false);
    }
  };

  const saveMc = async () => {
    if (!mcCtxKey) return;
    setSaving(true);
    try {
      const payload = {
        partner_name: partnerName,
        mc: selectedMc,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(mcValues, ["MARKETING COST"]),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("pnl_pengeluaran_mc_v2").upsert(payload, { onConflict: "mc,month,year" });
      if (error) throw error;
      setMcDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan Marketing/Cost of Money (District).");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => (isDepoStep ? saveDepo() : isMcStep ? saveMc() : Promise.all([saveDepo(), saveMc()]));
  const anyDirty = depoDirty || mcDirty;

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

  const depoTableProps = { values: depoValues, onChange: setDepoItemValue, readOnly: !editable || !selectedDepoId || depoNeedsMc, t };
  const mcTableProps = { values: mcValues, onChange: setMcItemValue, readOnly: !editable || !selectedMc, t };

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
      <FormHeader icon={ArrowDownLeft} title="Form Pengeluaran" activeContext={activeContext} readOnly={!editable} t={t}>
        {isDepoStep && !needsDepoGate && depoOptions.length > 0 && (
          <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact
            extra={editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" style={{ padding: "6px 10px", whiteSpace: "nowrap" }}><Settings2 size={12} /> Kelola Depo</button>} />
        )}
        {/* FIX (permintaan user - "buat ui yang luar biasa dan divider
            yang jelas antara depo dan mc"): dulu Depo + tombol "Kelola
            Depo" + District numpuk dlm 1 flex row rata tanpa pemisah
            apa pun - tombol "Kelola Depo" (yg sebenarnya bagian dari
            grup Depo) malah kelihatan motong di antara Depo & District,
            bikin ga jelas mana grup mana. Sekarang dibungkus 1 kartu
            dgn divider vertikal TEGAS antara grup "Depo" (select +
            tombol Kelola Depo jadi SATU kesatuan visual) dan grup
            "District (MC)". */}
        {isMcStep && depoOptions.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 14px", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact />
              {editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" style={{ padding: "6px 10px", whiteSpace: "nowrap" }}><Settings2 size={12} /> Kelola Depo</button>}
            </div>
            <div style={{ width: 1, alignSelf: "stretch", minHeight: 28, background: t.line, flexShrink: 0 }} />
            <ScopeSelector label="District (MC)" value={selectedMc} onChange={setSelectedMc} options={mcOptions} t={t} compact />
          </div>
        )}
      </FormHeader>

      {loading ? <LoadingBlock label="Memuat Form Pengeluaran V2..." t={t} /> : (
        <>
          <Stepper items={STEP_LABELS} step={step} setStep={setStep} t={t} d={d} />

          {step === 1 && (
            <>
              <SecHero icon={Building2} eyebrow="Langkah 1 dari 4" title="OPEX & Cost of Money" t={t} />
              {needsDepoGate ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 13, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>
                    Anda perlu menambahkan Depo terlebih dahulu sebelum bisa mengisi laporan OPEX, Cost of Money & SDM. Depo adalah kelompok District (MC) buatan Anda sendiri — bisa diubah kapan saja.
                  </div>
                  <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} embedded />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {showDepoManager && <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} onClose={() => setShowDepoManager(false)} />}
                  {depoNeedsMc && (
                    <div style={{ fontSize: 13, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>
                      Depo ini belum punya District. Tambahkan minimal 1 District lewat &ldquo;Kelola Depo&rdquo; di atas sebelum mengisi OPEX, Cost of Money & SDM-nya.
                    </div>
                  )}
                  <Card t={t}><Body><ItemTable items={itemsOf("OPEX")} showKategori {...depoTableProps} /></Body></Card>
                  <SubtotalBanner label="Total OPEX" value={depoSummary.totalOpex} />
                  <Card t={t}><Body><ItemTable items={itemsOf("COST OF MONEY")} showKategori {...depoTableProps} /></Body></Card>
                  <SubtotalBanner label="Total Cost of Money" value={depoSummary.totalCostOfMoney} />
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <SecHero icon={Users} eyebrow="Langkah 2 dari 4" title="SDM" t={t} />
              {needsDepoGate ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 13, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>
                    Anda perlu menambahkan Depo terlebih dahulu sebelum bisa mengisi laporan OPEX & SDM.
                  </div>
                  <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} embedded />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {showDepoManager && <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} onClose={() => setShowDepoManager(false)} />}
                  {depoNeedsMc && (
                    <div style={{ fontSize: 13, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>
                      Depo ini belum punya District. Tambahkan minimal 1 District lewat &ldquo;Kelola Depo&rdquo; di atas sebelum mengisi OPEX & SDM-nya.
                    </div>
                  )}
                  <Card t={t}><Body>
                    <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(depoSummary.totalSdmSales)}</span>}>HR Cost Sales</SecLabel>
                    <ItemTable items={itemsOf("SDM", "sales")} {...depoTableProps} />
                  </Body></Card>
                  <Card t={t}><Body>
                    <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(depoSummary.totalSdmNonSales)}</span>}>HR Cost Non Sales</SecLabel>
                    <ItemTable items={itemsOf("SDM", "non_sales")} {...depoTableProps} />
                  </Body></Card>
                  <SubtotalBanner label="Total SDM" value={depoSummary.totalSdm} />
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <SecHero icon={Megaphone} eyebrow="Langkah 3 dari 4" title="Marketing Cost" t={t} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card t={t}><Body><ItemTable items={itemsOf("MARKETING COST")} {...mcTableProps} /></Body></Card>
                <SubtotalBanner label="Total Marketing Cost" value={mcSummary.totalMarketing} />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <SecHero icon={FileText} eyebrow="Langkah 4 dari 4" title="Ringkasan Akhir" t={t} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card t={t}><Body>
                  <SecLabel t={t}>OPEX, Cost of Money & SDM — Depo: {depoOptions.find((o) => o.value === selectedDepoId)?.label || "—"}</SecLabel>
                  <SumRow icon={Building2} label="Total OPEX" value={depoSummary.totalOpex} bold t={t} />
                  <SumRow icon={Coins} label="Total Cost of Money" value={depoSummary.totalCostOfMoney} bold t={t} />
                  <SumRow icon={Users} label="Total SDM" value={depoSummary.totalSdm} bold t={t} />
                  <SumRow label="HR Cost Sales" value={depoSummary.totalSdmSales} indent t={t} />
                  <SumRow label="HR Cost Non Sales" value={depoSummary.totalSdmNonSales} indent t={t} />
                </Body></Card>
                <Card t={t}><Body>
                  <SecLabel t={t}>Marketing Cost — District: {mcOptions.find((o) => o.value === selectedMc)?.label || "—"}</SecLabel>
                  <SumRow icon={Megaphone} label="Total Marketing Cost" value={mcSummary.totalMarketing} bold t={t} />
                </Body></Card>
                <SubtotalBanner label="Grand Total Pengeluaran (Depo + District terpilih)" value={depoSummary.grandTotal + mcSummary.grandTotal} />
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
