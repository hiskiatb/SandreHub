"use client";
// Form Pengeluaran V2 — versi simplified dari PNL_FormPengeluaran.jsx (V1),
// sesuai katalog item (STEPS > KATEGORI > ITEM) yang diberikan user.
// TAMPILAN meniru V1 (permintaan user: "style nya seperti P&L report v1"):
// header gradien, stepper 5 langkah (OPEX > SDM > MKT > COM > Review),
// hero per langkah, kartu tabel, banner subtotal, footer navigasi.
// Tiap item bisa punya input Qty dan/atau Total (Rp) - keduanya
// independen, TIDAK dikalikan (klarifikasi user: "total nya saja lalu ada
// qtynya, ini tidak dikalikan karena angka ini sudah total yang disuruh
// input"). Kasus khusus:
//   - "Program Wholeseller" & "Program Retail" (Marketing Cost): tampilkan
//     teks keterangan sbg info READ-ONLY, user cuma isi Qty (tanpa Total).
//   - "Biaya Administrasi" (Cost of Money): Qty (jumlah SDM) lalu Total.
//   - STEPS "SDM" dipecah Sales vs Non-Sales (permintaan user: "ada
//     summary sales dan non sales").
// Disimpan sbg 1 kolom jsonb `pengeluaran_data` di tabel pnl_reports_v2:
// { [item_id]: { total: number, qty: number } } - katalog item TETAP di
// kode (bukan di DB), sama pola dgn FACTORY_HPP di V1.
import { useEffect, useMemo, useState, useCallback } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowRight, Building2, Coins, FileText, Info, Megaphone, Save, Users } from "lucide-react";
import supabase from "../../../lib/supabase";
import {
  FONT, mk, V2Styles, NumInput, Card, Body, SecLabel, TH, FormHeader, Stepper, SecHero,
  SubtotalBanner, SumRow, FooterBar, LoadingBlock, toMonthInt, toYearInt, numOrZero, fmtIDR, ctxKeyOf,
} from "./PNL_V2Shared";

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
  { id: "remun_fm",            step: "SDM",  kategori: "HR Cost Sales",         item: "Remunerasi Finance Manager", salesGroup: "sales" },
  { id: "remun_tss_spv",       step: "SDM",  kategori: "HR Cost Sales",         item: "Remunerasi TSS / SPV", salesGroup: "sales" },
  { id: "remun_gm",            step: "SDM",  kategori: "HR Cost Non Sales",     item: "Remunerasi General Manager", salesGroup: "non_sales" },
  { id: "benefit_hrd",         step: "SDM",  kategori: "HR Cost Non Sales",     item: "Benefit HRD", salesGroup: "non_sales" },
  { id: "benefit_mis",         step: "SDM",  kategori: "HR Cost Non Sales",     item: "Benefit MIS", salesGroup: "non_sales" },
  { id: "benefit_finance",     step: "SDM",  kategori: "HR Cost Non Sales",     item: "Benefit Finance Staff", salesGroup: "non_sales" },
  { id: "benefit_md",          step: "SDM",  kategori: "HR Cost Non Sales",     item: "Benefit MD", salesGroup: "non_sales" },
  { id: "benefit_admin_wh",    step: "SDM",  kategori: "HR Cost Non Sales",     item: "Benefit Admin & Warehouse", salesGroup: "non_sales" },
  { id: "benefit_sales_lain",  step: "SDM",  kategori: "HR Cost Sales",         item: "Benefit Sales (Others)", salesGroup: "sales" },
  { id: "benefit_nonsales_lain", step: "SDM", kategori: "HR Cost Non Sales",    item: "Benefit Non-Sales (Others)", salesGroup: "non_sales" },
  { id: "perjalanan_dinas",    step: "SDM",  kategori: "HR Cost Non Sales",     item: "Perjalanan Dinas", salesGroup: "non_sales" },
  { id: "training",            step: "SDM",  kategori: "HR Cost Non Sales",     item: "Training", salesGroup: "non_sales" },

  { id: "mkt_wholeseller",     step: "MARKETING COST", kategori: "Marketing Cost", item: "Program Wholeseller",
    info: "TRADE SUPPLY, SP SELLIN, ACQ REV DATA & RGU GA", qtyOnly: true },
  { id: "mkt_retail",          step: "MARKETING COST", kategori: "Marketing Cost", item: "Program Retail",
    info: "25% * 3%", qtyOnly: true },
  { id: "mkt_event",           step: "MARKETING COST", kategori: "Marketing Cost", item: "Program Event" },
  { id: "mkt_lain_total",      step: "MARKETING COST", kategori: "Marketing Cost", item: "Mkt Lain (Total)" },

  { id: "biaya_administrasi",  step: "COST OF MONEY", kategori: "Cost of Money", item: "Biaya Administrasi",
    info: "Untuk SDM - isi Qty (jumlah SDM) dulu, baru Total", qtyBeforeTotal: true },
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

const STEP_LABELS = ["OPEX", "SDM", "MKT", "COM", "Review"];
const itemsOf = (step, group) => PENGELUARAN_CATALOG.filter((it) => it.step === step && (!group || it.salesGroup === group));

// Tabel item 1 langkah - kolom: Sub-Kategori | Qty | Total (Rp).
function ItemTable({ items, values, onChange, readOnly, showKategori, t }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 460 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            <TH t={t}>Sub-Kategori</TH>
            <TH t={t} align="center" width={96}>Qty</TH>
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
              <td style={{ padding: "9px 6px", width: 96, verticalAlign: "middle" }}>
                <NumInput center numericValue={values[it.id]?.qty} readOnly={readOnly} onChange={(v) => onChange(it.id, "qty", v)} />
              </td>
              <td style={{ padding: "9px 8px", width: 190, verticalAlign: "middle" }}>
                {it.qtyOnly
                  ? <div style={{ textAlign: "right", color: t.lo, fontSize: 12 }}>Hanya Qty</div>
                  : <NumInput numericValue={values[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(it.id, "total", v)} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PNL_FormPengeluaranV2({ theme, profile, activeContext, canEdit, setIsFormDirty, readOnly }) {
  const d = theme === "dark";
  const t = useMemo(() => mk(d), [d]);
  const editable = !!canEdit && !readOnly;

  const ctxKey = ctxKeyOf(activeContext);
  const [loadedKey, setLoadedKey] = useState(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({}); // { [itemId]: { total, qty } }
  const [dirty, setDirty] = useState(false);
  const loading = !!ctxKey && loadedKey !== ctxKey;

  useEffect(() => {
    if (!ctxKey) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("pnl_reports_v2")
        .select("pengeluaran_data")
        .eq("partner_name", activeContext.mpxName)
        .eq("branch", activeContext.branch)
        .eq("mpc_mp3", activeContext.mpxType || "")
        .eq("month", toMonthInt(activeContext.month))
        .eq("year", toYearInt(activeContext.year))
        .maybeSingle();
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load:", error.message);
      setValues(data?.pengeluaran_data || {});
      setDirty(false);
      setStep(1);
      setLoadedKey(ctxKey);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxKey]);

  const setItemValue = useCallback((id, field, v) => {
    setValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);

  const summary = useMemo(() => summarizePengeluaran(values), [values]);

  const handleSave = async () => {
    if (!ctxKey) return;
    setSaving(true);
    try {
      const cleaned = {};
      PENGELUARAN_CATALOG.forEach((it) => {
        const row = values[it.id];
        if (!row) return;
        const total = it.qtyOnly ? 0 : numOrZero(row.total), qty = numOrZero(row.qty);
        if (total || qty) cleaned[it.id] = { total, qty };
      });
      const payload = {
        partner_name: activeContext.mpxName,
        branch: activeContext.branch,
        mpc_mp3: activeContext.mpxType || "",
        month: toMonthInt(activeContext.month),
        year: toYearInt(activeContext.year),
        user_id: profile?.id || null,
        pengeluaran_data: cleaned,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("pnl_reports_v2")
        .upsert(payload, { onConflict: "partner_name,branch,mpc_mp3,month,year" });
      if (error) throw error;
      setDirty(false);
      setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan Form Pengeluaran V2.");
    } finally {
      setSaving(false);
    }
  };

  const tableProps = { values, onChange: setItemValue, readOnly: !editable, t };

  return (
    <div style={{ width: "100%", margin: "0 auto", paddingBottom: 80, fontFamily: FONT, WebkitFontSmoothing: "antialiased", color: t.hi }}>
      <V2Styles d={d} t={t} />
      <FormHeader icon={ArrowDownLeft} title="Form Pengeluaran" activeContext={activeContext} readOnly={!editable} t={t} />

      {loading ? <LoadingBlock label="Memuat Form Pengeluaran V2..." t={t} /> : (
        <>
          <Stepper items={STEP_LABELS} step={step} setStep={setStep} t={t} d={d} />

          {step === 1 && (
            <>
              <SecHero icon={Building2} eyebrow="Langkah 1 dari 5" title="OPEX Branch" t={t} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card t={t}><Body><ItemTable items={itemsOf("OPEX")} showKategori {...tableProps} /></Body></Card>
                <SubtotalBanner label="Total OPEX" value={summary.totalOpex} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <SecHero icon={Users} eyebrow="Langkah 2 dari 5" title="SDM" t={t} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card t={t}><Body>
                  <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(summary.totalSdmSales)}</span>}>HR Cost Sales</SecLabel>
                  <ItemTable items={itemsOf("SDM", "sales")} {...tableProps} />
                </Body></Card>
                <Card t={t}><Body>
                  <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(summary.totalSdmNonSales)}</span>}>HR Cost Non Sales</SecLabel>
                  <ItemTable items={itemsOf("SDM", "non_sales")} {...tableProps} />
                </Body></Card>
                <SubtotalBanner label="Total SDM" value={summary.totalSdm} />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <SecHero icon={Megaphone} eyebrow="Langkah 3 dari 5" title="Marketing Cost" t={t} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card t={t}><Body><ItemTable items={itemsOf("MARKETING COST")} {...tableProps} /></Body></Card>
                <SubtotalBanner label="Total Marketing Cost" value={summary.totalMarketing} />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <SecHero icon={Coins} eyebrow="Langkah 4 dari 5" title="Cost of Money" t={t} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card t={t}><Body><ItemTable items={itemsOf("COST OF MONEY")} {...tableProps} /></Body></Card>
                <SubtotalBanner label="Total Cost of Money" value={summary.totalCostOfMoney} />
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <SecHero icon={FileText} eyebrow="Langkah 5 dari 5" title="Ringkasan Akhir" t={t} />
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card t={t}><Body>
                  <SecLabel t={t}>Ringkasan Pengeluaran</SecLabel>
                  <SumRow icon={Building2} label="Total OPEX" value={summary.totalOpex} bold t={t} />
                  <SumRow icon={Users} label="Total SDM" value={summary.totalSdm} bold t={t} />
                  <SumRow label="HR Cost Sales" value={summary.totalSdmSales} indent t={t} />
                  <SumRow label="HR Cost Non Sales" value={summary.totalSdmNonSales} indent t={t} />
                  <SumRow icon={Megaphone} label="Total Marketing Cost" value={summary.totalMarketing} bold t={t} />
                  <SumRow icon={Coins} label="Total Cost of Money" value={summary.totalCostOfMoney} bold t={t} />
                </Body></Card>
                <SubtotalBanner label="Grand Total Pengeluaran" value={summary.grandTotal} />
              </div>
            </>
          )}

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, color: t.lo, padding: "16px 2px 0" }}>
            <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Qty dan Total (Rp) diisi terpisah dan tidak dikalikan otomatis. Katalog item tetap — hubungi tim teknis untuk mengubahnya.</span>
          </div>

          <FooterBar t={t} d={d}>
            {editable && step < 5 && <button onClick={handleSave} disabled={saving || !dirty} className="v2btn-g"><Save size={13} />{saving ? "Menyimpan..." : "Simpan"}</button>}
            {step > 1 && <button onClick={() => setStep((s) => s - 1)} className="v2btn-g"><ArrowLeft size={13} />Kembali</button>}
            {step < 5
              ? <button onClick={() => setStep((s) => s + 1)} className="v2btn-p">Lanjut <ArrowRight size={13} /></button>
              : (editable && <button onClick={handleSave} disabled={saving || !dirty} className="v2btn-p"><Save size={13} />{saving ? "Menyimpan..." : "Simpan"}</button>)}
          </FooterBar>
        </>
      )}
    </div>
  );
}
