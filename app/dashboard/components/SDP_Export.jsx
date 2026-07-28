"use client";
/**
 * SDP_Export.jsx — Fase 4
 * Export registrasi SDP → format spreadsheet HQ, untuk PIC Region & SPM Sumatera.
 * - Copy TSV (tempel langsung ke sheet HQ) & Download .xlsx (exceljs).
 * - Hanya kolom input manusia yang diisi; kolom formula/HQ dikosongkan.
 * - Scope Sumatera; filter periode & status (default: validated).
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Download, ClipboardCopy, Check, Loader2, AlertCircle, FileSpreadsheet, Filter,
} from "lucide-react";
import { HQ_LAYOUT_REGISTRATION, buildTSV, buildMatrix, fmtSubmissionMonth } from "../../../lib/sdp";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4", inp: d ? "#111114" : "#FFFFFF", head: d ? "#202028" : "#EEF1F5",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  mag: "#C6168D", acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)",
  ok: "#22C55E", okBg: d ? "rgba(34,197,94,.12)" : "rgba(22,163,74,.08)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const SUMATERA_REGIONS = ["North Sumatera", "Central Sumatera", "South Sumatera"];
const STATUS_OPTS = [["validated", "Validated (siap kirim HQ)"], ["submitted", "Submitted"], ["all", "Semua status"]];

export default function SDP_Export({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role ?? "";

  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState("validated");
  const [period, setPeriod] = useState("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        let q = supabase.from("sdp_registration").select("*").order("created_at", { ascending: false }).limit(5000);
        // Scope: PIC Region → region-nya; SPM → seluruh Sumatera.
        if (role === "pic_region" && profile?.region) q = q.eq("region", profile.region);
        else q = q.eq("circle", "Sumatera");
        const { data, error } = await q;
        if (error) throw error;
        if (on) setAll(data || []);
      } catch (e) { if (on) setErr(e.message || String(e)); }
      finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, [supabase, role, profile?.region]);

  const periods = useMemo(() => {
    const s = new Set();
    all.forEach((r) => { if (r.submission_month) s.add(r.submission_month); });
    return [...s].sort().reverse();
  }, [all]);

  const rows = useMemo(() => all.filter((r) => {
    if (status !== "all" && (r.status || "submitted") !== status) return false;
    if (period !== "all" && r.submission_month !== period) return false;
    return true;
  }), [all, status, period]);

  const copyTSV = async () => {
    if (!rows.length) { setMsg({ type: "err", text: "Tidak ada baris untuk di-export." }); return; }
    try {
      await navigator.clipboard.writeText(buildTSV(rows));
      setMsg({ type: "ok", text: `${rows.length} baris disalin. Tempel (Ctrl+V) di sheet 01_SDP_Registration HQ.` });
    } catch {
      setMsg({ type: "err", text: "Clipboard diblokir browser. Pakai Download .xlsx." });
    }
  };

  const downloadXlsx = async () => {
    if (!rows.length) { setMsg({ type: "err", text: "Tidak ada baris untuk di-export." }); return; }
    setBusy(true); setMsg(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("01_SDP_Registration");
      const matrix = buildMatrix(rows);
      matrix.forEach((r, i) => {
        const row = ws.addRow(r);
        if (i === 0) row.font = { bold: true };
      });
      ws.views = [{ state: "frozen", ySplit: 1 }];
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SDP_Registration_HQ_${period === "all" ? "all" : fmtSubmissionMonth(period)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ type: "ok", text: `File .xlsx (${rows.length} baris) diunduh.` });
    } catch (e) {
      setMsg({ type: "err", text: "Gagal membuat file: " + (e.message || e) });
    } finally { setBusy(false); }
  };

  const previewCols = HQ_LAYOUT_REGISTRATION.slice(0, 8);

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>Export ke Format HQ</div>
      <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2, marginBottom: 16 }}>
        Kolom mengikuti sheet <b>01_SDP_Registration</b> HQ. Kolom formula (Need SAP/Oracle, Final Status) &amp; kolom HQ sengaja dikosongkan agar tidak menimpa formula HQ saat di-paste.
      </div>

      {/* Filter */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: t.mid }}>Periode
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={selStyle(t)}>
            <option value="all">Semua periode</option>
            {periods.map((p) => <option key={p} value={p}>{fmtSubmissionMonth(p)}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: t.mid }}>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={selStyle(t)}>
            {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: t.mid, marginLeft: "auto" }}>
          <Filter size={14} /> <b style={{ color: t.hi }}>{rows.length}</b> baris siap export
        </div>
      </div>

      {msg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 10, marginBottom: 14, fontSize: 12.5, fontWeight: 600,
          background: msg.type === "ok" ? t.okBg : t.accBg, color: msg.type === "ok" ? t.ok : t.acc, border: `1px solid ${(msg.type === "ok" ? t.ok : t.acc)}44` }}>
          {msg.type === "ok" ? <Check size={14} /> : <AlertCircle size={14} />} {msg.text}
        </div>
      )}

      {/* Aksi */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <button onClick={copyTSV} disabled={loading || !rows.length} data-primary
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${t.acc} 0%, ${t.mag} 100%)`, color: "#fff", fontFamily: FF, fontSize: 13.5, fontWeight: 800, cursor: (loading || !rows.length) ? "default" : "pointer", opacity: (loading || !rows.length) ? 0.55 : 1 }}>
          <ClipboardCopy size={16} /> Copy (paste ke HQ)
        </button>
        <button onClick={downloadXlsx} disabled={busy || loading || !rows.length}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontFamily: FF, fontSize: 13.5, fontWeight: 800, cursor: (busy || loading || !rows.length) ? "default" : "pointer", opacity: (busy || loading || !rows.length) ? 0.6 : 1 }}>
          {busy ? <Loader2 size={16} className="spin" /> : <Download size={16} />} Download .xlsx
        </button>
      </div>

      {/* Preview */}
      {loading ? (
        <div style={{ fontSize: 13, color: t.mid, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={15} className="spin" /> Memuat data…</div>
      ) : err ? (
        <div style={{ fontSize: 13, color: t.acc }}>{err}</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", background: t.card, borderRadius: 14, border: `1px solid ${t.line}`, color: t.mid, fontSize: 13.5 }}>
          <FileSpreadsheet size={26} style={{ opacity: .5, marginBottom: 8 }} />
          <div>Belum ada baris dengan filter ini.</div>
        </div>
      ) : (
        <div style={{ overflow: "auto", border: `1px solid ${t.line}`, borderRadius: 12, background: t.card, boxShadow: t.sm, maxHeight: "48vh" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 900, width: "100%" }}>
            <thead>
              <tr>
                {previewCols.map((c) => <th key={c.header} style={{ position: "sticky", top: 0, background: t.head, padding: "8px 10px", textAlign: "left", fontSize: 10.5, fontWeight: 800, color: t.mid, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}` }}>{c.header}</th>)}
                <th style={{ position: "sticky", top: 0, background: t.head, padding: "8px 10px", fontSize: 10.5, color: t.lo, borderBottom: `1px solid ${t.line}` }}>… +{HQ_LAYOUT_REGISTRATION.length - previewCols.length} kolom</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 30).map((r, i) => (
                <tr key={r.id || i}>
                  {previewCols.map((c) => <td key={c.header} style={{ padding: "7px 10px", borderBottom: `1px solid ${t.line}`, whiteSpace: "nowrap", color: c.field ? t.hi : t.lo, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{c.field ? (c.fmt === "month" ? fmtSubmissionMonth(r[c.field]) : (r[c.field] ?? "")) : <i style={{ color: t.lo }}>(kosong)</i>}</td>)}
                  <td style={{ padding: "7px 10px", borderBottom: `1px solid ${t.line}`, color: t.lo }}>…</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 30 && <div style={{ padding: "8px 12px", fontSize: 11.5, color: t.mid, borderTop: `1px solid ${t.line}` }}>Menampilkan 30 dari {rows.length} baris. Export mencakup semuanya.</div>}
        </div>
      )}
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const selStyle = (t) => ({ display: "block", marginTop: 4, padding: "8px 10px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13, fontFamily: FF, outline: "none", cursor: "pointer", minWidth: 180 });
