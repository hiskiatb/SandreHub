"use client";
// Summary V2 — ringkasan Laba/Rugi untuk MPX P&L Report V2 (permintaan
// user: "style nya seperti P&L report v1, dan ada summarynya"). Hanya
// MEMBACA 1 baris pnl_reports_v2 (partner+branch+tipe+bulan+tahun) lalu
// menghitung:
//   Total Pendapatan  = Total Margin Penjualan (IM3 + 3ID) + Di Luar Template + Total Data Provided
//   Total Pengeluaran = OPEX + SDM (Sales + Non Sales) + Marketing Cost + Cost of Money
//   Laba / Rugi       = Total Pendapatan - Total Pengeluaran
// Rumus pendapatan/pengeluaran diambil dari summarizePendapatan /
// summarizePengeluaran di file form masing-masing supaya selalu sama.
import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, ArrowUpRight, ArrowDownLeft, Info } from "lucide-react";
import supabase from "../../../lib/supabase";
import { MARGIN_ROWS, DATA_PROVIDED_ROWS, summarizePendapatan } from "./PNL_FormPendapatanV2";
import { PENGELUARAN_CATALOG, summarizePengeluaran } from "./PNL_FormPengeluaranV2";
import {
  FONT, GRAD, mk, V2Styles, Card, Body, SecLabel, FormHeader, LoadingBlock,
  toMonthInt, toYearInt, numOrZero, fmtIDR, fmtPct, ctxKeyOf,
} from "./PNL_V2Shared";

const MetCard = ({ label, value, sub, color, t }) => (
  <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.sm, padding: "16px 18px", minWidth: 0 }}>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: t.mid }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.035em", color: color || t.hi, marginTop: 6, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: t.lo, marginTop: 3 }}>{sub}</div>}
  </div>
);

// 1 baris tabel P&L. kind: "data" (rincian) | "sub" (subtotal) | "total".
const TR = ({ label, amount, base, kind = "data", indent = 0, t }) => {
  const isTotal = kind === "total", isSub = kind === "sub";
  return (
    <tr className={isTotal ? undefined : "v2row"} style={{ borderBottom: `1px solid ${t.lineH}`, background: isTotal ? t.sub : "transparent" }}>
      <td style={{ padding: "10px 10px", paddingLeft: 10 + indent * 18, fontSize: 13, fontWeight: isTotal ? 800 : isSub ? 700 : 500, color: isTotal || isSub ? t.hi : t.mid }}>{label}</td>
      <td style={{ padding: "10px 10px", textAlign: "right", fontSize: 13, fontWeight: isTotal ? 800 : isSub ? 700 : 600, color: amount < 0 ? t.red : (isTotal || isSub ? t.hi : t.mid), fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtIDR(amount)}</td>
      <td style={{ padding: "10px 10px", textAlign: "right", fontSize: 12, color: t.lo, fontVariantNumeric: "tabular-nums", width: 80 }}>{base ? fmtPct((amount / base) * 100) : "—"}</td>
    </tr>
  );
};

const THead = ({ t }) => (
  <thead>
    <tr style={{ borderBottom: `1px solid ${t.line}` }}>
      {["Komponen", "Nominal", "% Pendapatan"].map((h, i) => (
        <th key={h} style={{ padding: "7px 10px", textAlign: i === 0 ? "left" : "right", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.lo }}>{h}</th>
      ))}
    </tr>
  </thead>
);

export default function PNL_SummaryV2({ theme, activeContext }) {
  const d = theme === "dark";
  const t = useMemo(() => mk(d), [d]);
  const ctxKey = ctxKeyOf(activeContext);
  const [loaded, setLoaded] = useState({ key: null, row: null });
  const loading = !!ctxKey && loaded.key !== ctxKey;
  const row = loaded.key === ctxKey ? loaded.row : null;

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
      if (error) console.error("[PNL_SummaryV2] gagal load:", error.message);
      setLoaded({ key: ctxKey, row: data || null });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxKey]);

  const inc = useMemo(() => summarizePendapatan(row), [row]);
  const exp = useMemo(() => summarizePengeluaran(row?.pengeluaran_data), [row]);
  const net = inc.grandTotal - exp.grandTotal;
  const base = inc.grandTotal;
  const peng = row?.pengeluaran_data || {};
  const itemTotal = (id) => numOrZero(peng[id]?.total);
  const stepItems = (step, group) => PENGELUARAN_CATALOG.filter((it) => it.step === step && !it.qtyOnly && (!group || it.salesGroup === group));

  return (
    <div style={{ width: "100%", margin: "0 auto", fontFamily: FONT, WebkitFontSmoothing: "antialiased", color: t.hi }}>
      <V2Styles d={d} t={t} />
      <FormHeader icon={LayoutGrid} title="Summary P&L" activeContext={activeContext} t={t} />

      {loading ? <LoadingBlock label="Memuat Summary V2..." t={t} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!row && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "12px 16px", borderRadius: 10, border: `1px solid ${t.amberBd}`, background: t.amberBg, color: t.amber, fontSize: 12, fontWeight: 600 }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Belum ada data untuk periode ini. Isi Form Pendapatan dan Form Pengeluaran terlebih dahulu.</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <MetCard label="Total Pendapatan" value={fmtIDR(inc.grandTotal)} sub="Margin + Luar Template + Data Provided" t={t} />
            <MetCard label="Total Pengeluaran" value={fmtIDR(exp.grandTotal)} sub={base ? `${fmtPct((exp.grandTotal / base) * 100)} dari pendapatan` : undefined} t={t} />
            <MetCard label="Margin Laba" value={base ? fmtPct((net / base) * 100) : "—"} sub="Laba / Rugi ÷ Pendapatan" color={net < 0 ? t.red : undefined} t={t} />
          </div>

          <div style={{ padding: "18px 22px", borderRadius: 12, background: net < 0 ? (d ? "#3A1416" : "#B91C1C") : GRAD, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, boxShadow: "0 4px 20px rgba(237,28,36,0.28)" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,0.85)" }}>{net < 0 ? "Rugi Bersih" : "Laba Bersih"}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 3 }}>Total Pendapatan − Total Pengeluaran</div>
            </div>
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em", color: "#fff", fontVariantNumeric: "tabular-nums" }}>{fmtIDR(net)}</span>
          </div>

          <Card t={t}><Body>
            <SecLabel t={t} right={<ArrowUpRight size={14} style={{ color: t.green }} />}>Pendapatan</SecLabel>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
                <THead t={t} />
                <tbody>
                  <TR label="Total Margin Penjualan" amount={inc.totalMargin} base={base} kind="sub" t={t} />
                  <TR label="IM3" amount={inc.totalIm3} base={base} indent={1} t={t} />
                  <TR label="3ID" amount={inc.total3id} base={base} indent={1} t={t} />
                  {MARGIN_ROWS.map((r) => (
                    <TR key={r.id} label={r.label.replace("Total Margin Penjualan ", "") + " (IM3 + 3ID)"} amount={numOrZero(row?.[`margin_${r.id}`]) + numOrZero(row?.[`margin_${r.id}_3id`])} base={base} indent={2} t={t} />
                  ))}
                  <TR label="Di Luar Template" amount={inc.luarTemplate} base={base} kind="sub" t={t} />
                  <TR label="Total Data Provided" amount={inc.totalDataProvided} base={base} kind="sub" t={t} />
                  {DATA_PROVIDED_ROWS.map((r) => (
                    <TR key={r.id} label={r.label} amount={numOrZero(row?.[r.id])} base={base} indent={1} t={t} />
                  ))}
                  <TR label="Total Pendapatan" amount={inc.grandTotal} base={base} kind="total" t={t} />
                </tbody>
              </table>
            </div>
            {row?.luar_template_note && (
              <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, fontSize: 12, color: t.mid }}>
                <span style={{ fontWeight: 700, color: t.hi }}>Keterangan di luar template: </span>{row.luar_template_note}
              </div>
            )}
          </Body></Card>

          <Card t={t}><Body>
            <SecLabel t={t} right={<ArrowDownLeft size={14} style={{ color: t.red }} />}>Pengeluaran</SecLabel>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
                <THead t={t} />
                <tbody>
                  <TR label="Total OPEX" amount={exp.totalOpex} base={base} kind="sub" t={t} />
                  {stepItems("OPEX").map((it) => <TR key={it.id} label={it.item} amount={itemTotal(it.id)} base={base} indent={1} t={t} />)}
                  <TR label="Total SDM" amount={exp.totalSdm} base={base} kind="sub" t={t} />
                  <TR label="HR Cost Sales" amount={exp.totalSdmSales} base={base} kind="sub" indent={1} t={t} />
                  {stepItems("SDM", "sales").map((it) => <TR key={it.id} label={it.item} amount={itemTotal(it.id)} base={base} indent={2} t={t} />)}
                  <TR label="HR Cost Non Sales" amount={exp.totalSdmNonSales} base={base} kind="sub" indent={1} t={t} />
                  {stepItems("SDM", "non_sales").map((it) => <TR key={it.id} label={it.item} amount={itemTotal(it.id)} base={base} indent={2} t={t} />)}
                  <TR label="Total Marketing Cost" amount={exp.totalMarketing} base={base} kind="sub" t={t} />
                  {stepItems("MARKETING COST").map((it) => <TR key={it.id} label={it.item} amount={itemTotal(it.id)} base={base} indent={1} t={t} />)}
                  <TR label="Total Cost of Money" amount={exp.totalCostOfMoney} base={base} kind="sub" t={t} />
                  {stepItems("COST OF MONEY").map((it) => <TR key={it.id} label={it.item} amount={itemTotal(it.id)} base={base} indent={1} t={t} />)}
                  <TR label="Total Pengeluaran" amount={exp.grandTotal} base={base} kind="total" t={t} />
                </tbody>
              </table>
            </div>
          </Body></Card>
        </div>
      )}
    </div>
  );
}
