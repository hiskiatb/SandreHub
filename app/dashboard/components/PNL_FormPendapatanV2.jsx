"use client";
// Form Pendapatan V2 — versi simplified dari PNL_FormPendapatan.jsx (V1),
// permintaan user: "MPX P&L Report V2 yang akan disederhanakan ... Form
// Pendapatan nya akan di simplify". TAMPILAN meniru V1 (permintaan user:
// "style nya seperti P&L report v1"). Dua bagian dalam 1 form:
//   1) "Form Pendapatan (Area Level)" — diisi PARTNER (admin_mc/
//      admin_partner_mdi/admin_area): 6 baris Total Margin Penjualan (SP 0,
//      SP ORI, Voucher 0, Voucher ORI, Saldo, FWA), tiap baris SELALU 2
//      input terpisah IM3 & 3ID (toggle "Pisah untuk Income IM3 dan
//      3ID" dihapus atas permintaan user) + blok "Di Luar Template" berisi
//      NOMINAL (luar_template_amount) dan KETERANGAN teks
//      (luar_template_note) - permintaan user: "ini ada amount dan
//      keterangan". Nominal ini ikut dijumlahkan ke Total Pendapatan
//      (baris tersendiri, di luar Total Margin Penjualan). Angka di sini adalah MARGIN FINAL yang diketik langsung
//      (bukan qty x harga satuan spt V1).
//   2) "Data Provided (Area Level)" — diisi SPM SUMATERA (bukan
//      partner): SLA Fee, TDS, Sales Margin Otomatis, Sales Margin,
//      Tactical Program HQ/Circle/Region, Champion Rewards, Other
//      Rewards.
// Disimpan ke tabel `pnl_reports_v2` (terpisah dari pnl_reports V1),
// 1 baris per partner+branch+mpc_mp3+month+year.
import { useEffect, useMemo, useState, useCallback } from "react";
import { ArrowUpRight, Banknote, Info, Lock, Save, ShieldCheck } from "lucide-react";
import supabase from "../../../lib/supabase";
import {
  FONT, mk, V2Styles, NumInput, Card, Body, SecLabel, TH, FormHeader, SecHero,
  SubtotalBanner, FooterBar, LoadingBlock, toMonthInt, toYearInt, numOrZero, fmtIDR, ctxKeyOf,
} from "./PNL_V2Shared";

// 6 baris margin partner — id dipakai sebagai key kolom DB (margin_<id>
// utk IM3 dan margin_<id>_3id utk 3ID).
export const MARGIN_ROWS = [
  { id: "sp0", label: "Total Margin Penjualan SP 0" },
  { id: "sp_ori", label: "Total Margin Penjualan SP ORI" },
  { id: "voucher0", label: "Total Margin Penjualan Voucher 0" },
  { id: "voucher_ori", label: "Total Margin Penjualan Voucher ORI" },
  { id: "saldo", label: "Total Margin Penjualan Saldo" },
  { id: "fwa", label: "Total Margin Penjualan FWA" },
];

// 9 baris "Data Provided" — diisi SPM, bukan partner.
export const DATA_PROVIDED_ROWS = [
  { id: "sla_fee", label: "SLA Fee" },
  { id: "tds", label: "TDS" },
  { id: "sales_margin_otomatis", label: "Sales Margin Otomatis" },
  { id: "sales_margin", label: "Sales Margin" },
  { id: "tactical_program_hq", label: "Tactical Program HQ" },
  { id: "tactical_program_circle", label: "Tactical Program Circle" },
  { id: "tactical_program_region", label: "Tactical Program Region" },
  { id: "champion_rewards", label: "Champion Rewards" },
  { id: "other_rewards", label: "Other Rewards" },
];

// Ringkasan pendapatan dari 1 baris pnl_reports_v2 - dipakai juga oleh
// PNL_SummaryV2.jsx supaya angkanya selalu sama dgn form ini.
export function summarizePendapatan(row) {
  let totalIm3 = 0, total3id = 0, totalDataProvided = 0;
  MARGIN_ROWS.forEach((r) => { totalIm3 += numOrZero(row?.[`margin_${r.id}`]); total3id += numOrZero(row?.[`margin_${r.id}_3id`]); });
  DATA_PROVIDED_ROWS.forEach((r) => { totalDataProvided += numOrZero(row?.[r.id]); });
  const totalMargin = totalIm3 + total3id;
  const luarTemplate = numOrZero(row?.luar_template_amount);
  return { totalIm3, total3id, totalMargin, luarTemplate, totalDataProvided, grandTotal: totalMargin + luarTemplate + totalDataProvided };
}

const emptyMargin = () => Object.fromEntries(MARGIN_ROWS.map((r) => [r.id, { im3: 0, id3: 0 }]));
const emptyDataProvided = () => Object.fromEntries(DATA_PROVIDED_ROWS.map((r) => [r.id, 0]));

const LockNote = ({ children, t }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, border: `1px solid ${t.line}`, background: t.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.mid, flexShrink: 0, whiteSpace: "nowrap" }}><Lock size={10} />{children}</span>
);

export default function PNL_FormPendapatanV2({ theme, profile, activeContext, canEditPendapatan, canEditDataProvided, setIsFormDirty, readOnly }) {
  const d = theme === "dark";
  const t = useMemo(() => mk(d), [d]);

  const ctxKey = ctxKeyOf(activeContext);
  const [loadedKey, setLoadedKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [margin, setMargin] = useState(emptyMargin);
  const [luarTemplateAmount, setLuarTemplateAmount] = useState(0);
  const [luarTemplateNote, setLuarTemplateNote] = useState("");
  const [dataProvided, setDataProvided] = useState(emptyDataProvided);
  const [dirty, setDirty] = useState(false);
  const loading = !!ctxKey && loadedKey !== ctxKey;

  const canEditIncome = !!canEditPendapatan && !readOnly;
  const canEditProvided = !!canEditDataProvided && !readOnly;
  const canSave = canEditIncome || canEditProvided;

  const markDirty = useCallback(() => { setDirty(true); setIsFormDirty?.(true); }, [setIsFormDirty]);

  useEffect(() => {
    if (!ctxKey) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("pnl_reports_v2")
        .select("*")
        .eq("partner_name", activeContext.mpxName)
        .eq("branch", activeContext.branch)
        .eq("mpc_mp3", activeContext.mpxType || "")
        .eq("month", toMonthInt(activeContext.month))
        .eq("year", toYearInt(activeContext.year))
        .maybeSingle();
      if (cancelled) return;
      if (error) console.error("[PNL_FormPendapatanV2] gagal load:", error.message);
      const m = emptyMargin(), dp = emptyDataProvided();
      if (data) {
        MARGIN_ROWS.forEach((r) => { m[r.id] = { im3: numOrZero(data[`margin_${r.id}`]), id3: numOrZero(data[`margin_${r.id}_3id`]) }; });
        DATA_PROVIDED_ROWS.forEach((r) => { dp[r.id] = numOrZero(data[r.id]); });
      }
      setMargin(m);
      setDataProvided(dp);
      setLuarTemplateAmount(numOrZero(data?.luar_template_amount));
      setLuarTemplateNote(data?.luar_template_note || "");
      setDirty(false);
      setLoadedKey(ctxKey);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxKey]);

  const totals = useMemo(() => {
    let im3 = 0, id3 = 0, dp = 0;
    MARGIN_ROWS.forEach((r) => { im3 += numOrZero(margin[r.id]?.im3); id3 += numOrZero(margin[r.id]?.id3); });
    DATA_PROVIDED_ROWS.forEach((r) => { dp += numOrZero(dataProvided[r.id]); });
    const luar = numOrZero(luarTemplateAmount);
    return { im3, id3, margin: im3 + id3, luar, partner: im3 + id3 + luar, dataProvided: dp };
  }, [margin, dataProvided, luarTemplateAmount]);

  const handleSave = async () => {
    if (!ctxKey) return;
    setSaving(true);
    try {
      const payload = {
        partner_name: activeContext.mpxName,
        branch: activeContext.branch,
        mpc_mp3: activeContext.mpxType || "",
        month: toMonthInt(activeContext.month),
        year: toYearInt(activeContext.year),
        user_id: profile?.id || null,
        updated_at: new Date().toISOString(),
      };
      if (canEditIncome) {
        payload.split_im3_3id = true; // IM3 & 3ID selalu dipisah
        MARGIN_ROWS.forEach((r) => {
          payload[`margin_${r.id}`] = numOrZero(margin[r.id]?.im3);
          payload[`margin_${r.id}_3id`] = numOrZero(margin[r.id]?.id3);
        });
        payload.luar_template_amount = numOrZero(luarTemplateAmount);
        payload.luar_template_note = luarTemplateNote || null;
      }
      if (canEditProvided) {
        DATA_PROVIDED_ROWS.forEach((r) => { payload[r.id] = numOrZero(dataProvided[r.id]); });
      }
      const { error } = await supabase
        .from("pnl_reports_v2")
        .upsert(payload, { onConflict: "partner_name,branch,mpc_mp3,month,year" });
      if (error) throw error;
      setDirty(false);
      setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan Form Pendapatan V2.");
    } finally {
      setSaving(false);
    }
  };

  const rowTotalStyle = (v) => ({ fontWeight: 700, fontSize: 13, color: v > 0 ? t.green : t.lo, fontVariantNumeric: "tabular-nums", textAlign: "right", whiteSpace: "nowrap" });

  return (
    <div style={{ width: "100%", margin: "0 auto", paddingBottom: canSave ? 80 : 0, fontFamily: FONT, WebkitFontSmoothing: "antialiased", color: t.hi }}>
      <V2Styles d={d} t={t} />
      <FormHeader icon={ArrowUpRight} title="Form Pendapatan" activeContext={activeContext} readOnly={!canSave} t={t} />

      {loading ? <LoadingBlock label="Memuat Form Pendapatan V2..." t={t} /> : (
        <>
          {/* ── Form Pendapatan (Area Level) — diisi Partner ── */}
          <SecHero icon={Banknote} eyebrow="Diisi oleh Partner (Admin MC / Admin Area)" title="Form Pendapatan (Area Level)" t={t}>
            {!canEditIncome && <LockNote t={t}>Hanya lihat</LockNote>}
          </SecHero>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
            <Card t={t}><Body>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${t.line}` }}>
                      <TH t={t}>Produk</TH>
                      <TH t={t} align="right" width={170}>IM3</TH>
                      <TH t={t} align="right" width={170}>3ID</TH>
                      <TH t={t} align="right" width={140}>Total</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {MARGIN_ROWS.map((r) => {
                      const rowTotal = numOrZero(margin[r.id]?.im3) + numOrZero(margin[r.id]?.id3);
                      return (
                        <tr key={r.id} className="v2row" style={{ borderBottom: `1px solid ${t.lineH}` }}>
                          <td style={{ padding: "9px 8px", fontWeight: 700, color: t.hi }}>{r.label}</td>
                          <td style={{ padding: "9px 6px", width: 170 }}>
                            <NumInput numericValue={margin[r.id]?.im3} readOnly={!canEditIncome}
                              onChange={(v) => { setMargin((p) => ({ ...p, [r.id]: { ...p[r.id], im3: v } })); markDirty(); }} />
                          </td>
                          <td style={{ padding: "9px 6px", width: 170 }}>
                            <NumInput numericValue={margin[r.id]?.id3} readOnly={!canEditIncome}
                              onChange={(v) => { setMargin((p) => ({ ...p, [r.id]: { ...p[r.id], id3: v } })); markDirty(); }} />
                          </td>
                          <td style={{ padding: "9px 8px", width: 140 }}><div style={rowTotalStyle(rowTotal)}>{fmtIDR(rowTotal)}</div></td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td style={{ padding: "12px 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid }}>Subtotal</td>
                      <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(totals.im3)}</td>
                      <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(totals.id3)}</td>
                      <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(totals.margin)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Body></Card>

            <Card t={t}><Body>
              <SecLabel t={t}>Di Luar Template</SecLabel>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 240px) 1fr", gap: 14, alignItems: "start" }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: t.mid, marginBottom: 6 }}>Nominal (Rp)</label>
                  <NumInput numericValue={luarTemplateAmount} readOnly={!canEditIncome}
                    onChange={(v) => { setLuarTemplateAmount(v); markDirty(); }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: t.mid, marginBottom: 6 }}>Keterangan</label>
                  <textarea className="v2ta" rows={2} disabled={!canEditIncome} value={luarTemplateNote}
                    placeholder="Jelaskan pendapatan di luar template di atas..."
                    onChange={(e) => { setLuarTemplateNote(e.target.value); markDirty(); }} />
                </div>
              </div>
            </Body></Card>

            <SubtotalBanner label="Total Pendapatan Partner" value={totals.partner} />
          </div>

          {/* ── Data Provided (Area Level) — diisi SPM ── */}
          <SecHero icon={ShieldCheck} eyebrow="Diisi oleh SPM Sumatera" title="Data Provided (Area Level)" t={t}>
            {!canEditProvided && <LockNote t={t}>Hanya lihat</LockNote>}
          </SecHero>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Card t={t}><Body>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 380 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${t.line}` }}>
                      <TH t={t}>Komponen</TH>
                      <TH t={t} align="right" width={220}>Nominal (Rp)</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {DATA_PROVIDED_ROWS.map((r) => (
                      <tr key={r.id} className="v2row" style={{ borderBottom: `1px solid ${t.lineH}` }}>
                        <td style={{ padding: "9px 8px", fontWeight: 700, color: t.hi }}>{r.label}</td>
                        <td style={{ padding: "9px 8px", width: 220 }}>
                          <NumInput numericValue={dataProvided[r.id]} readOnly={!canEditProvided}
                            onChange={(v) => { setDataProvided((p) => ({ ...p, [r.id]: v })); markDirty(); }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Body></Card>
            <SubtotalBanner label="Total Data Provided" value={totals.dataProvided} />
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, color: t.lo, padding: "16px 2px 0" }}>
            <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Form Pendapatan V2 ini terpisah dari MPX P&L Report (V1) — data tidak saling memengaruhi.</span>
          </div>

          {canSave && (
            <FooterBar t={t} d={d}>
              <button onClick={handleSave} disabled={saving || !dirty} className="v2btn-p"><Save size={13} />{saving ? "Menyimpan..." : "Simpan"}</button>
            </FooterBar>
          )}
        </>
      )}
    </div>
  );
}
