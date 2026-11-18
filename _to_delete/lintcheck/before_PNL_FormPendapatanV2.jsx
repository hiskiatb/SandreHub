"use client";
// Form Pendapatan V2 — versi simplified dari PNL_FormPendapatan.jsx (V1),
// permintaan user: "MPX P&L Report V2 yang akan disederhanakan ... Form
// Pendapatan nya akan di simplify". Dua bagian dalam 1 form (lihat
// screenshot acuan user):
//   1) "Form Pendapatan (Area Level)" — diisi PARTNER (admin_mc/
//      finance_mpx/admin_area): 6 baris Total Margin Penjualan (SP 0,
//      SP ORI, Voucher 0, Voucher ORI, Saldo, FWA) + toggle "Pisah untuk
//      Income IM3 dan 3ID" (kalau aktif, tiap baris jadi 2 input
//      terpisah IM3 & 3ID) + 1 catatan teks bebas "Di Luar Template".
//      Angka di sini adalah MARGIN FINAL yang diketik langsung (bukan
//      qty x harga satuan spt V1).
//   2) "Data Provided (Area Level)" — diisi SPM SUMATERA (bukan
//      partner): SLA Fee, TDS, Sales Margin Otomatis, Sales Margin,
//      Tactical Program HQ/Circle/Region, Champion Rewards, Other
//      Rewards.
// Disimpan ke tabel baru `pnl_reports_v2` (terpisah dari pnl_reports V1),
// 1 baris per partner+branch+mpc_mp3+month+year (unique constraint sama
// pola dgn V1).
import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, Save, Info, ShieldCheck, Lock } from "lucide-react";
import supabase from "../../../lib/supabase";

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

// 6 baris margin partner — id dipakai sebagai key kolom DB (margin_<id>
// dan margin_<id>_3id).
const MARGIN_ROWS = [
  { id: "sp0", label: "Total Margin Penjualan SP 0" },
  { id: "sp_ori", label: "Total Margin Penjualan SP ORI" },
  { id: "voucher0", label: "Total Margin Penjualan Voucher 0" },
  { id: "voucher_ori", label: "Total Margin Penjualan Voucher ORI" },
  { id: "saldo", label: "Total Margin Penjualan Saldo" },
  { id: "fwa", label: "Total Margin Penjualan FWA" },
];

// 9 baris "Data Provided" — diisi SPM, bukan partner.
const DATA_PROVIDED_ROWS = [
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

const emptyMargin = () => Object.fromEntries(MARGIN_ROWS.map((r) => [r.id, { im3: "", id3: "" }]));
const emptyDataProvided = () => Object.fromEntries(DATA_PROVIDED_ROWS.map((r) => [r.id, ""]));

const numOrZero = (v) => { const n = Number(String(v ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const fmtIDR = (n) => "Rp " + numOrZero(n).toLocaleString("id-ID");

export default function PNL_FormPendapatanV2({ theme, profile, activeContext, canEditPendapatan, canEditDataProvided, setIsFormDirty, readOnly }) {
  const d = theme === "dark";
  const t = {
    card: d ? "#15191E" : "#fff", line: d ? "#262B33" : "#E7EAEE", hi: d ? "#F2F4F7" : "#101521",
    mid: d ? "#9AA2AE" : "#5B6472", lo: d ? "#6B7380" : "#8A93A1", headBg: d ? "#1B2027" : "#F7F8FA",
    shadowSm: d ? "none" : "0 1px 2px rgba(16,21,33,.04)", inputBg: d ? "#1B2027" : "#fff", inputBd: d ? "#2A3039" : "#DADFE6",
    lockBg: d ? "#1B2027" : "#F2F3F5",
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowId, setRowId] = useState(null);
  const [splitIm3, setSplitIm3] = useState(false);
  const [margin, setMargin] = useState(emptyMargin());
  const [luarTemplateNote, setLuarTemplateNote] = useState("");
  const [dataProvided, setDataProvided] = useState(emptyDataProvided());
  const [dirty, setDirty] = useState(false);

  const canEditIncome = canEditPendapatan && !readOnly;
  const canEditProvided = canEditDataProvided && !readOnly;

  const markDirty = useCallback(() => { setDirty(true); setIsFormDirty?.(true); }, [setIsFormDirty]);

  useEffect(() => {
    if (!activeContext?.mpxName || !activeContext?.branch || !activeContext?.month || !activeContext?.year) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("pnl_reports_v2")
        .select("*")
        .eq("partner_name", activeContext.mpxName)
        .eq("branch", activeContext.branch)
        .eq("mpc_mp3", activeContext.mpxType || "")
        .eq("month", activeContext.month)
        .eq("year", activeContext.year)
        .maybeSingle();
      if (cancelled) return;
      if (error) { console.error("[PNL_FormPendapatanV2] gagal load:", error.message); setLoading(false); return; }
      if (data) {
        setRowId(data.id);
        setSplitIm3(!!data.split_im3_3id);
        const m = emptyMargin();
        MARGIN_ROWS.forEach((r) => {
          m[r.id] = { im3: data[`margin_${r.id}`] ?? 0, id3: data[`margin_${r.id}_3id`] ?? 0 };
        });
        setMargin(m);
        setLuarTemplateNote(data.luar_template_note || "");
        const dp = emptyDataProvided();
        DATA_PROVIDED_ROWS.forEach((r) => { dp[r.id] = data[r.id] ?? 0; });
        setDataProvided(dp);
      } else {
        setRowId(null);
        setSplitIm3(false);
        setMargin(emptyMargin());
        setLuarTemplateNote("");
        setDataProvided(emptyDataProvided());
      }
      setDirty(false);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeContext?.mpxName, activeContext?.branch, activeContext?.mpxType, activeContext?.month, activeContext?.year]);

  const totalMargin = useMemo(() => {
    return MARGIN_ROWS.reduce((sum, r) => sum + numOrZero(margin[r.id]?.im3) + (splitIm3 ? numOrZero(margin[r.id]?.id3) : 0), 0);
  }, [margin, splitIm3]);

  const totalDataProvided = useMemo(() => DATA_PROVIDED_ROWS.reduce((sum, r) => sum + numOrZero(dataProvided[r.id]), 0), [dataProvided]);

  const handleSave = async () => {
    if (!activeContext?.mpxName || !activeContext?.branch) return;
    setSaving(true);
    try {
      const payload = {
        partner_name: activeContext.mpxName,
        branch: activeContext.branch,
        mpc_mp3: activeContext.mpxType || "",
        month: activeContext.month,
        year: activeContext.year,
        user_id: profile?.id || null,
        updated_at: new Date().toISOString(),
      };
      if (canEditIncome) {
        payload.split_im3_3id = splitIm3;
        MARGIN_ROWS.forEach((r) => {
          payload[`margin_${r.id}`] = numOrZero(margin[r.id]?.im3);
          payload[`margin_${r.id}_3id`] = splitIm3 ? numOrZero(margin[r.id]?.id3) : 0;
        });
        payload.luar_template_note = luarTemplateNote || null;
      }
      if (canEditProvided) {
        DATA_PROVIDED_ROWS.forEach((r) => { payload[r.id] = numOrZero(dataProvided[r.id]); });
      }
      const { data, error } = await supabase
        .from("pnl_reports_v2")
        .upsert(payload, { onConflict: "partner_name,branch,mpc_mp3,month,year" })
        .select().single();
      if (error) throw error;
      setRowId(data.id);
      setDirty(false);
      setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan Form Pendapatan V2.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.mid, fontSize: 13, padding: "40px 0", justifyContent: "center" }}><Loader2 size={16} className="spin" /> Memuat Form Pendapatan V2...</div>;
  }

  const inputStyle = (disabled) => ({
    width: "100%", height: 36, padding: "0 12px", borderRadius: 8, fontSize: 13, textAlign: "right", fontFamily: "inherit",
    border: `1px solid ${t.inputBd}`, background: disabled ? t.lockBg : t.inputBg, color: disabled ? t.lo : t.hi,
  });

  return (
    <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Form Pendapatan (Area Level) — diisi Partner ── */}
      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: t.hi }}>Form Pendapatan (Area Level)</div>
            <div style={{ fontSize: 11, color: t.mid, marginTop: 2 }}>{canEditIncome ? "Diisi oleh Partner." : "Hanya bisa diisi oleh Partner (Admin MC / Admin Area)."}</div>
          </div>
          {!canEditIncome && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: t.lo }}><Lock size={12} /> Read-only</span>}
        </div>
        <div style={{ padding: 18 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 12.5, color: t.hi, cursor: canEditIncome ? "pointer" : "default" }}>
            <input type="checkbox" checked={splitIm3} disabled={!canEditIncome}
              onChange={(e) => { setSplitIm3(e.target.checked); markDirty(); }} />
            Pisah untuk Income IM3 dan 3ID
          </label>

          <div style={{ display: "grid", gridTemplateColumns: splitIm3 ? "1.4fr 1fr 1fr" : "1.4fr 1fr", gap: "8px 10px", alignItems: "center" }}>
            {splitIm3 && (
              <>
                <div />
                <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", textAlign: "center" }}>IM3</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", textAlign: "center" }}>3ID</div>
              </>
            )}
            {MARGIN_ROWS.map((r) => (
              <>
                <div key={r.id + "-label"} style={{ fontSize: 12.5, color: t.hi, fontWeight: 600 }}>{r.label}</div>
                <input key={r.id + "-im3"} type="number" disabled={!canEditIncome} value={margin[r.id]?.im3 ?? ""} placeholder="0"
                  style={inputStyle(!canEditIncome)}
                  onChange={(e) => { setMargin((p) => ({ ...p, [r.id]: { ...p[r.id], im3: e.target.value } })); markDirty(); }} />
                {splitIm3 && (
                  <input key={r.id + "-3id"} type="number" disabled={!canEditIncome} value={margin[r.id]?.id3 ?? ""} placeholder="0"
                    style={inputStyle(!canEditIncome)}
                    onChange={(e) => { setMargin((p) => ({ ...p, [r.id]: { ...p[r.id], id3: e.target.value } })); markDirty(); }} />
                )}
              </>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: t.mid, marginBottom: 6 }}>Di Luar Template — Keterangan (dalam teks saja)</div>
            <textarea disabled={!canEditIncome} value={luarTemplateNote} rows={3}
              placeholder="Tuliskan di sini kalau ada pendapatan/catatan di luar template di atas..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 12.5, fontFamily: "inherit", resize: "vertical",
                border: `1px solid ${t.inputBd}`, background: !canEditIncome ? t.lockBg : t.inputBg, color: !canEditIncome ? t.lo : t.hi }}
              onChange={(e) => { setLuarTemplateNote(e.target.value); markDirty(); }} />
          </div>

          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", fontSize: 13, fontWeight: 700, color: t.hi }}>
            Total Margin Penjualan: <span style={{ marginLeft: 8 }}>{fmtIDR(totalMargin)}</span>
          </div>
        </div>
      </div>

      {/* ── Data Provided (Area Level) — diisi SPM ── */}
      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: t.hi, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={14} color={t.mid} /> Data Provided (Area Level)</div>
            <div style={{ fontSize: 11, color: t.mid, marginTop: 2 }}>{canEditProvided ? "Diisi oleh SPM Sumatera." : "Hanya bisa diisi oleh SPM Sumatera."}</div>
          </div>
          {!canEditProvided && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: t.lo }}><Lock size={12} /> Read-only</span>}
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "8px 10px", alignItems: "center" }}>
            {DATA_PROVIDED_ROWS.map((r) => (
              <>
                <div key={r.id + "-label"} style={{ fontSize: 12.5, color: t.hi, fontWeight: 600 }}>{r.label}</div>
                <input key={r.id + "-val"} type="number" disabled={!canEditProvided} value={dataProvided[r.id] ?? ""} placeholder="0"
                  style={inputStyle(!canEditProvided)}
                  onChange={(e) => { setDataProvided((p) => ({ ...p, [r.id]: e.target.value })); markDirty(); }} />
              </>
            ))}
          </div>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", fontSize: 13, fontWeight: 700, color: t.hi }}>
            Total Data Provided: <span style={{ marginLeft: 8 }}>{fmtIDR(totalDataProvided)}</span>
          </div>
        </div>
      </div>

      {(canEditIncome || canEditProvided) && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={handleSave} disabled={saving || !dirty}
            style={{ height: 40, padding: "0 20px", borderRadius: 9, border: "none", background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 7, cursor: saving || !dirty ? "default" : "pointer", opacity: saving || !dirty ? 0.6 : 1 }}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Simpan
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, color: t.lo, padding: "0 2px" }}>
        <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Form Pendapatan V2 ini terpisah dari MPX P&L Report (V1) — data tidak saling memengaruhi.</span>
      </div>
    </div>
  );
}
