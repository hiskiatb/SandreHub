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
//      Rewards. Read-only di sini - tombol "Bulk Upload" yg sebelumnya
//      ada di section ini DIHAPUS (permintaan user: duplikat dgn menu
//      terpisah "Upload Data Provided" di landing MDI P&L Report yg
//      memanggil komponen bulk-upload yg sama utk SEMUA Branch/Partner).
// Disimpan ke tabel `pnl_reports_v2` (terpisah dari pnl_reports V1),
// 1 baris per partner+branch+mpc_mp3+month+year.
import { useEffect, useMemo, useState, useCallback } from "react";
import { ArrowUpRight, Banknote, Gauge, Info, Lock, Save, ShieldCheck } from "lucide-react";
import supabase from "../../../lib/supabase";
import {
  FONT, GRAD, mk, V2Styles, NumInput, Card, Body, SecLabel, TH, FormHeader, SecHero,
  SubtotalBanner, FooterBar, LoadingBlock, toMonthInt, toYearInt, numOrZero, fmtIDR, fmtPct, ctxKeyOf,
} from "./PNL_V2Shared";

// 6 baris margin partner — id dipakai sebagai key kolom DB (margin_<id>
// utk IM3 dan margin_<id>_3id utk 3ID).
// Permintaan user ("menunya namanya Total Margin Penjualan, biar tidak
// berulang"): label per baris dipersingkat jadi cuma pembedanya saja -
// judul "Total Margin Penjualan" cukup ditulis SEKALI sbg section label
// di atas tabel (lihat SecLabel di PNL_FormPendapatanV2.jsx), bukan
// diulang di tiap baris. File lain (PivotSummary/SummaryV2) yg sebelumnya
// strip prefix "Total Margin Penjualan " dari label ini tetap aman -
// .replace() jadi no-op kalau prefix-nya memang sudah tidak ada.
export const MARGIN_ROWS = [
  { id: "sp0", label: "SP 0" },
  { id: "sp_ori", label: "SP ORI" },
  { id: "voucher0", label: "Voucher 0" },
  { id: "voucher_ori", label: "Voucher ORI" },
  { id: "saldo", label: "Saldo" },
  { id: "fwa", label: "FWA" },
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
  // BARU (permintaan user - "tambahkan KPI score di sebelah kanannya" +
  // "nanti diupload bersamaan dengan SLA Fee, TDS, dll" + "formatnya
  // persentase"): satu-satunya baris di sini yang nilainya PERSEN, bukan
  // Rupiah - ditandai isScore supaya DIKECUALIKAN dari semua penjumlahan
  // uang (totalDataProvided/summarizePendapatan) dan dari tabel
  // Komponen/Nominal (Rp) di bawah, tapi tetap ikut di alur upload/
  // download Bulk Upload Data Provided yang sama (array ini jg dipakai
  // generik oleh PNL_DataProvidedBulkUpload.jsx).
  { id: "kpi_score", label: "KPI Score (%)", isScore: true },
];

// Ringkasan pendapatan dari 1 baris pnl_reports_v2 - dipakai juga oleh
// PNL_SummaryV2.jsx supaya angkanya selalu sama dgn form ini.
export function summarizePendapatan(row) {
  let totalIm3 = 0, total3id = 0, totalDataProvided = 0;
  MARGIN_ROWS.forEach((r) => { totalIm3 += numOrZero(row?.[`margin_${r.id}`]); total3id += numOrZero(row?.[`margin_${r.id}_3id`]); });
  DATA_PROVIDED_ROWS.forEach((r) => { if (!r.isScore) totalDataProvided += numOrZero(row?.[r.id]); });
  const totalMargin = totalIm3 + total3id;
  const luarTemplate = numOrZero(row?.luar_template_amount);
  return { totalIm3, total3id, totalMargin, luarTemplate, totalDataProvided, grandTotal: totalMargin + luarTemplate + totalDataProvided };
}

const emptyMargin = () => Object.fromEntries(MARGIN_ROWS.map((r) => [r.id, { im3: 0, id3: 0 }]));
const emptyDataProvided = () => Object.fromEntries(DATA_PROVIDED_ROWS.map((r) => [r.id, 0]));

const LockNote = ({ children, t }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 99, border: `1px solid ${t.line}`, background: t.sub, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.mid, flexShrink: 0, whiteSpace: "nowrap" }}><Lock size={10} />{children}</span>
);

// BARU (permintaan user - "jelaskan yang diinput merupakan margin bukan
// total penjualan" + "tidak perlu ada kalkulator pembantu cukup diinfo
// secara jelas"): warna solid dipakai sbg badge kolom IM3/3ID - kontrasnya
// jauh lebih jelas drpd teks kuning/magenta tipis di atas putih, biar
// user langsung ngeh lagi ngisi kolom yang mana. Kalkulator bantu
// (Harga Jual − Harga Modal) SEMPAT dibikin tapi dicabut lagi atas
// permintaan user - cukup catatan teks penjelas di atas tabel (lihat di
// bawah). CATATAN: NumInput (PNL_V2Shared.jsx) sudah MEMANG tidak bisa
// menerima angka minus sama sekali (filternya `replace(/\D/g,"")` buang
// semua karakter non-digit termasuk "-"), jadi aturan "margin di sini
// tidak boleh minus" sudah otomatis terjaga dari sisi input - selisih
// minus (Harga Jual < Harga Modal) seharusnya dicatat di Marketing Cost
// (Form Pengeluaran), bukan di sini.
const MARGIN_COL_ACCENT = {
  im3: { solid: "#D97706" },
  id3: { solid: "#C6168D" },
};

export default function PNL_FormPendapatanV2({ theme, profile, activeContext, canEditPendapatan, setIsFormDirty, readOnly, masterData }) {
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
  const canSave = canEditIncome;
  // BARU (permintaan user - "kalo nominal diisi, keterangan menjadi
  // mandatory"): Nominal "Di Luar Template" > 0 tanpa Keterangan jadi
  // angka misterius yg sulit diaudit nanti - begitu Nominal diisi,
  // Keterangan wajib diisi juga sebelum form bisa disimpan.
  const luarTemplateNoteRequired = numOrZero(luarTemplateAmount) > 0 && !luarTemplateNote.trim();

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
    DATA_PROVIDED_ROWS.forEach((r) => { if (!r.isScore) dp += numOrZero(dataProvided[r.id]); });
    const luar = numOrZero(luarTemplateAmount);
    return { im3, id3, margin: im3 + id3, luar, partner: im3 + id3 + luar, dataProvided: dp };
  }, [margin, dataProvided, luarTemplateAmount]);

  const handleSave = async () => {
    if (!ctxKey) return;
    if (luarTemplateNoteRequired) {
      alert("Keterangan wajib diisi kalau Nominal \"Di Luar Template\" tidak kosong.");
      return;
    }
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
          <SecHero icon={Banknote} title="Form Pendapatan (Area Level)" t={t}>
            {!canEditIncome && <LockNote t={t}>Hanya lihat</LockNote>}
          </SecHero>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
            <Card t={t}><Body>
              <SecLabel t={t}>Total Margin Penjualan</SecLabel>
              {/* BARU (permintaan user - "jelaskan yang diinput merupakan
                  margin bukan total penjualan"): catatan tegas di atas
                  tabel - angka yg diisi di sini bukan omzet/nilai jual
                  kotor, tapi MARGIN (selisih Jual-Modal) yg sudah bersih. */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 14px", borderRadius: 9, background: t.blueBg, border: `1px solid ${t.blueBd}`, marginBottom: 16, fontSize: 12, color: t.mid, lineHeight: 1.55 }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: t.blue }} />
                <span><b style={{ color: t.hi }}>Yang diisi di sini adalah MARGIN, bukan total penjualan (omzet).</b> Margin = Harga Jual − Harga Modal. Nilai di kolom ini <b style={{ color: t.hi }}>tidak boleh minus</b> — kalau hasil hitungan Harga Jual − Harga Modal minus, itu artinya selisihnya dicatat sebagai <b style={{ color: t.hi }}>Marketing Cost</b> (di Form Pengeluaran), bukan di sini.</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 600 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${t.line}` }}>
                      <TH t={t}>Produk</TH>
                      <th style={{ padding: "7px 8px", width: 190, textAlign: "right" }}>
                        <span style={{ display: "inline-flex", padding: "3px 11px", borderRadius: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", background: MARGIN_COL_ACCENT.im3.solid, color: "#fff" }}>IM3</span>
                      </th>
                      <th style={{ padding: "7px 8px", width: 190, textAlign: "right" }}>
                        <span style={{ display: "inline-flex", padding: "3px 11px", borderRadius: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", background: MARGIN_COL_ACCENT.id3.solid, color: "#fff" }}>3ID</span>
                      </th>
                      <TH t={t} align="right" width={140}>Total</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {MARGIN_ROWS.map((r) => {
                      const rowTotal = numOrZero(margin[r.id]?.im3) + numOrZero(margin[r.id]?.id3);
                      return (
                        <tr key={r.id} className="v2row" style={{ borderBottom: `1px solid ${t.lineH}` }}>
                          <td style={{ padding: "9px 8px", fontWeight: 700, color: t.hi }}>{r.label}</td>
                          <td style={{ padding: "9px 6px", width: 190 }}>
                            <NumInput numericValue={margin[r.id]?.im3} readOnly={!canEditIncome}
                              onChange={(v) => { setMargin((p) => ({ ...p, [r.id]: { ...p[r.id], im3: v } })); markDirty(); }} />
                          </td>
                          <td style={{ padding: "9px 6px", width: 190 }}>
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

            <Card t={t} style={{ overflow: "hidden" }}>
              {/* FIX (permintaan user - "rapikan bagian ini menjadi sangat
                  bagus"): header diganti dari SecLabel polos (cuma garis
                  merah + teks) jadi icon-badge + judul + subteks penjelas,
                  dipisah garis tipis dari isi form - mengikuti gaya
                  SecHero yg sudah dipakai utk section "Data Provided" di
                  bawah, supaya section opsional/"di luar kebiasaan" ini
                  kelihatan beda & lebih jelas maksudnya drpd cuma label
                  generik. */}
              <div style={{ padding: "20px 24px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: t.blueBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Banknote size={17} color={t.blue} strokeWidth={2} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.hi, letterSpacing: "-0.01em" }}>Pendapatan Lain di Luar Template</div>
                  <div style={{ fontSize: 11.5, color: t.lo, marginTop: 1 }}>Pendapatan tambahan di luar kategori Margin Penjualan di atas (opsional)</div>
                </div>
              </div>
              <div style={{ height: 1, background: t.lineH }} />
              <Body style={{ paddingTop: 20 }}>
                {/* FIX (permintaan user - "apa keterangan nya dibawah ya
                    agar lebih rapi karena ini tinggi kolom kan beda"):
                    dulu Nominal & Keterangan sejajar 2 kolom - tinggi
                    textarea Keterangan (apalagi kalau isinya panjang,
                    jadi beberapa baris) bikin dua kolom itu ga rata/rapi.
                    Sekarang ditumpuk vertikal: Nominal di atas (lebar
                    dibatasi spy ga melebar penuh tanpa alasan), Keterangan
                    di bawah full width. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div style={{ maxWidth: 260 }}>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: t.mid, marginBottom: 6 }}>Nominal (Rp)</label>
                    <NumInput numericValue={luarTemplateAmount} readOnly={!canEditIncome}
                      onChange={(v) => { setLuarTemplateAmount(v); markDirty(); }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: t.mid, marginBottom: 6 }}>
                      Keterangan{numOrZero(luarTemplateAmount) > 0 && <span style={{ color: t.red }}> *</span>}
                    </label>
                    <textarea className="v2ta" rows={2} disabled={!canEditIncome} value={luarTemplateNote}
                      placeholder="Jelaskan pendapatan di luar template di atas..."
                      style={luarTemplateNoteRequired ? { borderColor: t.red, boxShadow: `0 0 0 3px ${t.redBg}` } : undefined}
                      onChange={(e) => { setLuarTemplateNote(e.target.value); markDirty(); }} />
                    {luarTemplateNoteRequired && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 11, fontWeight: 600, color: t.red }}>
                        <Info size={11} />Wajib diisi karena Nominal sudah diisi.
                      </div>
                    )}
                  </div>
                </div>
              </Body>
            </Card>

            <SubtotalBanner label={`Total Pendapatan Area ${activeContext?.branch || "—"}`} value={totals.partner} />
          </div>

          {/* ── Distribution Fee & Rewards (dulu "Data Provided (Area Level)") — diisi SPM ── */}
          {/* BARU (permintaan user - "tambahkan KPI score di sebelah
              kanannya, buat uinya bagus"): skor KPI area ini (persen,
              diupload bersamaan dengan SLA Fee/TDS/dll lewat Bulk Upload
              Data Provided yang sama) ditonjolkan sbg badge di header
              section, bukan baris tabel Rupiah biasa - lihat KPI_ROWS
              isScore di DATA_PROVIDED_ROWS. */}
          <SecHero icon={ShieldCheck} eyebrow="Diisi oleh SPM Sumatera" title="Distribution Fee & Rewards" t={t}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 11, background: "rgba(255,255,255,0.55)", border: `1px solid ${t.blueBd}`, flexShrink: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: GRAD, color: "#fff" }}><Gauge size={15} /></div>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.mid, lineHeight: 1 }}>KPI Score</div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", color: t.hi, lineHeight: 1.25 }}>{fmtPct(dataProvided.kpi_score)}</div>
              </div>
            </div>
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
                    {DATA_PROVIDED_ROWS.filter((r) => !r.isScore).map((r) => (
                      <tr key={r.id} className="v2row" style={{ borderBottom: `1px solid ${t.lineH}` }}>
                        <td style={{ padding: "9px 8px", fontWeight: 700, color: t.hi }}>{r.label}</td>
                        <td style={{ padding: "9px 8px", width: 220 }}>
                          <NumInput numericValue={dataProvided[r.id]} readOnly />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Body></Card>
            <SubtotalBanner label="Total Distribution Fee & Rewards" value={totals.dataProvided} />
          </div>

          {canSave && (
            <FooterBar t={t} d={d}>
              <button onClick={handleSave} disabled={saving || !dirty || luarTemplateNoteRequired} className="v2btn-p"><Save size={13} />{saving ? "Menyimpan..." : "Simpan"}</button>
            </FooterBar>
          )}
        </>
      )}
    </div>
  );
}
