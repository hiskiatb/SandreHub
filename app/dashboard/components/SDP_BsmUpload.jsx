"use client";
/**
 * SDP_BsmUpload.jsx
 * BSM: Upload Excel finalisasi bulanan → upsert ke sdp_monthly_data
 *
 * Excel format (header row 1):
 *   [0] ID  [1] SDP LIVE  [2] STATUS USAHA  [3] NAMA  [4] NIK
 *   [5] NO. ACCOUNT OTTOCASH  [6] ALAMAT  [7] EMAIL OWNER
 *   [8] EMAIL PIC (semicolon-sep)  [9] NO WHATSAPP  [10] STATUS KEMITRAAN
 *
 * STATUS KEMITRAAN mapping:
 *   ACTIVE              → is_terminate_next_month=false, terminate_date=null
 *   AKAN TERMINATE …    → is_terminate_next_month=true,  terminate_date=first of next month
 *   TERMINATED          → is_terminate_next_month=false, terminate_note='TERMINATED'
 */

import React, { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertTriangle,
  Loader2, RotateCcw, CalendarDays, ChevronDown, Info,
} from "lucide-react";

// ─── Theme ─────────────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg   : d ? "#0D0D0F" : "#F2F4F7",
  card : d ? "#17171B" : "#FFFFFF",
  sub  : d ? "#1D1D22" : "#F8F9FA",
  line : d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi   : d ? "#F1F1F4" : "#0F1117",
  mid  : d ? "#8A8A9C" : "#6B7280",
  lo   : d ? "#4A4A5E" : "#A0A8B4",
  teal : "#32BCAD",
  tealD: "#1A9E90",
  tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)",
  tealBd: d ? "rgba(50,188,173,.3)"  : "rgba(26,158,144,.2)",
  blue : d ? "#0A84FF" : "#2563EB",
  blueBg: d ? "rgba(10,132,255,.1)"  : "rgba(37,99,235,.07)",
  blueBd: d ? "rgba(10,132,255,.25)" : "rgba(37,99,235,.18)",
  green : "#22C55E",
  greenBg: d ? "rgba(34,197,94,.1)" : "rgba(34,197,94,.08)",
  greenBd: d ? "rgba(34,197,94,.25)": "rgba(34,197,94,.2)",
  amber : "#F59E0B",
  amberBg: d ? "rgba(245,158,11,.1)" : "rgba(245,158,11,.08)",
  amberBd: d ? "rgba(245,158,11,.25)": "rgba(245,158,11,.2)",
  red  : "#EF4444",
  redBg : d ? "rgba(239,68,68,.1)"  : "rgba(239,68,68,.07)",
  redBd : d ? "rgba(239,68,68,.25)" : "rgba(239,68,68,.18)",
  sm   : d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md   : d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// ─── Helpers ───────────────────────────────────────────────────────────────────
const MONTHS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function periodLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

/** First day of next month from "YYYY-MM" */
function nextMonthFirst(period) {
  const [y, m] = period.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return next;
}

function parseEmailArr(raw) {
  if (!raw) return [];
  return String(raw).split(";").map(s => s.trim()).filter(Boolean);
}

function mapStatus(statusKemitraan, period) {
  const s = String(statusKemitraan ?? "").trim().toUpperCase();
  if (s === "TERMINATED") {
    return { is_terminate_next_month: false, terminate_date: null, terminate_note: "TERMINATED" };
  }
  if (s.startsWith("AKAN TERMINATE")) {
    return {
      is_terminate_next_month: true,
      terminate_date: nextMonthFirst(period),
      terminate_note: String(statusKemitraan).trim(),
    };
  }
  // ACTIVE or anything else
  return { is_terminate_next_month: false, terminate_date: null, terminate_note: null };
}

function parseExcel(arrayBuffer, period) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array", cellDates: false });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Find header row — look for row containing "ID" in first cell
  const hdrIdx = rows.findIndex(r =>
    String(r?.[0] ?? "").trim().toUpperCase() === "ID"
  );
  const dataStart = hdrIdx >= 0 ? hdrIdx + 1 : 1;

  const records = [];
  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i];
    const sdp_id = String(r?.[0] ?? "").trim();
    if (!sdp_id) continue;

    const statusMap = mapStatus(r?.[10], period);
    const ottocash  = r?.[5] ? String(r[5]).replace(/\.0$/, "").trim() : null;

    records.push({
      sdp_id,
      period,
      status_usaha            : String(r?.[2] ?? "").trim() || null,
      nama_owner              : String(r?.[3] ?? "").trim() || null,
      nik                     : String(r?.[4] ?? "").trim() || null,
      no_ottocash             : ottocash || null,
      alamat                  : String(r?.[6] ?? "").trim() || null,
      email_owner             : String(r?.[7] ?? "").trim() || null,
      email_pic_list          : parseEmailArr(r?.[8]),
      no_whatsapp             : String(r?.[9] ?? "").trim() || null,
      ...statusMap,
      bsm_status              : "CONFIRMED",
      bsm_at                  : new Date().toISOString(),
      form_updated_by_role    : "bsm",
    });
  }
  return records;
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function Pill({ label, color, bg, bd, d }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700,
      color, background: bg, border: `1px solid ${bd}`,
    }}>{label}</span>
  );
}

function StatBox({ label, value, color, bg, bd }) {
  return (
    <div style={{
      flex: 1, padding: "10px 14px", borderRadius: 10,
      background: bg, border: `1px solid ${bd}`,
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color, opacity: 0.8 }}>{label}</div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function SDP_BsmUpload({ supabase, theme = "dark", profile }) {
  const d = theme === "dark";
  const t = mk(d);

  // Period picker: default to current YYYY-MM
  const now       = new Date();
  const curYear   = now.getFullYear();
  const curMonth  = now.getMonth() + 1; // 1-based
  const [year,  setYear]  = useState(curYear);
  const [month, setMonth] = useState(curMonth);
  const period = `${year}-${String(month).padStart(2, "0")}`;

  // File / parse state
  const [fileName, setFileName]   = useState(null);
  const [records,  setRecords]    = useState(null);   // parsed rows
  const [parseErr, setParseErr]   = useState(null);
  const [dragging, setDragging]   = useState(false);
  const fileRef = useRef(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);      // 0-100
  const [result,    setResult]    = useState(null);   // { ok, inserted, errors }

  // ── Parse handler ─────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setParseErr(null);
    setRecords(null);
    setResult(null);
    setFileName(file.name);
    try {
      const buf  = await file.arrayBuffer();
      const recs = parseExcel(buf, period);
      if (!recs.length) throw new Error("Tidak ada baris data ditemukan di file.");
      setRecords(recs);
    } catch (e) {
      setParseErr(e.message);
      setFileName(null);
    }
  }, [period]);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const reset = () => {
    setFileName(null); setRecords(null);
    setParseErr(null); setResult(null); setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  // Re-parse if period changes while file already loaded
  const changePeriod = (newYear, newMonth) => {
    setYear(newYear); setMonth(newMonth);
    setRecords(null); setFileName(null); setParseErr(null); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = records ? {
    total     : records.length,
    active    : records.filter(r => !r.is_terminate_next_month && !r.terminate_note).length,
    willTerm  : records.filter(r => r.is_terminate_next_month).length,
    terminated: records.filter(r => r.terminate_note === "TERMINATED").length,
  } : null;

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!records?.length) return;
    setUploading(true); setProgress(0); setResult(null);

    try {
      // 1. Create upload record
      const { data: uploadRow, error: upErr } = await supabase
        .from("sdp_monthly_uploads")
        .insert({
          period,
          uploaded_by : profile?.id ?? null,
          notes       : `BSM finalisasi upload — ${records.length} rows`,
        })
        .select("id")
        .single();

      if (upErr) throw upErr;
      const upload_id = uploadRow.id;

      // 2. Upsert in chunks of 50
      const CHUNK = 50;
      let errors   = 0;
      let inserted = 0;
      const errorDetails = [];

      for (let i = 0; i < records.length; i += CHUNK) {
        const chunk = records.slice(i, i + CHUNK).map(r => ({ ...r, upload_id }));
        const { error } = await supabase
          .from("sdp_monthly_data")
          .upsert(chunk, { onConflict: "sdp_id,period" });

        if (error) {
          errors += chunk.length;
          errorDetails.push(error.message);
          console.error("Upsert error chunk", i / CHUNK + 1, error);
        } else {
          inserted += chunk.length;
        }

        setProgress(Math.round(((i + chunk.length) / records.length) * 100));
      }

      setResult({
        ok: errors === 0,
        inserted,
        errors,
        message: errorDetails.length ? errorDetails[0] : null,
      });
    } catch (e) {
      console.error("Upload error:", e);
      setResult({ ok: false, inserted: 0, errors: records.length, message: e.message });
    } finally {
      setUploading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FF, color: t.hi, maxWidth: 820 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.4 }}>
          Upload Data Finalisasi BSM
        </div>
        <div style={{ fontSize: 13, color: t.mid, marginTop: 3 }}>
          Upload file Excel SDP yang sudah difinalisasi untuk memperbarui data bulan terpilih
        </div>
      </div>

      {/* ── Step 1: Period picker ─────────────────────────────────────── */}
      <div style={{
        background: t.card, border: `1px solid ${t.line}`,
        borderRadius: 14, padding: "18px 20px", marginBottom: 16,
        boxShadow: t.sm,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <CalendarDays size={15} color={t.teal} />
          <span style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>Pilih Periode</span>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* Month */}
          <div style={{ position: "relative" }}>
            <select
              value={month}
              onChange={e => changePeriod(year, parseInt(e.target.value, 10))}
              style={{
                appearance: "none", WebkitAppearance: "none",
                background: t.sub, border: `1px solid ${t.line}`,
                borderRadius: 8, padding: "8px 32px 8px 12px",
                color: t.hi, fontFamily: FF, fontSize: 13, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {MONTHS.map((m, i) => (
                <option key={i+1} value={i+1}>{m}</option>
              ))}
            </select>
            <ChevronDown size={13} color={t.mid} style={{
              position: "absolute", right: 10, top: "50%",
              transform: "translateY(-50%)", pointerEvents: "none",
            }} />
          </div>

          {/* Year */}
          <div style={{ position: "relative" }}>
            <select
              value={year}
              onChange={e => changePeriod(parseInt(e.target.value, 10), month)}
              style={{
                appearance: "none", WebkitAppearance: "none",
                background: t.sub, border: `1px solid ${t.line}`,
                borderRadius: 8, padding: "8px 32px 8px 12px",
                color: t.hi, fontFamily: FF, fontSize: 13, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {[curYear - 1, curYear, curYear + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <ChevronDown size={13} color={t.mid} style={{
              position: "absolute", right: 10, top: "50%",
              transform: "translateY(-50%)", pointerEvents: "none",
            }} />
          </div>

          <div style={{
            display: "flex", alignItems: "center",
            padding: "8px 14px", borderRadius: 8,
            background: t.tealBg, border: `1px solid ${t.tealBd}`,
            fontSize: 13, fontWeight: 700, color: t.teal,
          }}>
            {periodLabel(period)}
          </div>
        </div>
      </div>

      {/* ── Step 2: File upload ───────────────────────────────────────── */}
      {!records && !result && (
        <div style={{
          background: t.card, border: `1px solid ${t.line}`,
          borderRadius: 14, padding: "18px 20px", marginBottom: 16,
          boxShadow: t.sm,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <FileSpreadsheet size={15} color={t.blue} />
            <span style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>Upload File Excel</span>
          </div>

          {/* Info note */}
          <div style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            padding: "10px 14px", borderRadius: 9,
            background: t.blueBg, border: `1px solid ${t.blueBd}`,
            marginBottom: 16,
          }}>
            <Info size={14} color={t.blue} style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: t.blue, lineHeight: 1.5 }}>
              Format kolom: <strong>ID · STATUS USAHA · NAMA · NIK · OTTOCASH · ALAMAT · EMAIL OWNER · EMAIL PIC · NO WA · STATUS KEMITRAAN</strong>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? t.blue : t.line}`,
              borderRadius: 12,
              padding: "36px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? t.blueBg : t.sub,
              transition: "all .15s",
            }}
          >
            <Upload size={28} color={dragging ? t.blue : t.lo} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: dragging ? t.blue : t.hi, marginBottom: 4 }}>
              {dragging ? "Lepas file di sini" : "Drag & drop atau klik untuk upload"}
            </div>
            <div style={{ fontSize: 12, color: t.mid }}>
              Format .xlsx · kolom sesuai template finalisasi BSM
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onFileInput}
              style={{ display: "none" }}
            />
          </div>

          {parseErr && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: 9,
              background: t.redBg, border: `1px solid ${t.redBd}`,
              fontSize: 12, color: t.red,
            }}>
              ⚠ {parseErr}
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Preview & confirm ─────────────────────────────────── */}
      {records && !result && (
        <div style={{
          background: t.card, border: `1px solid ${t.line}`,
          borderRadius: 14, padding: "18px 20px", marginBottom: 16,
          boxShadow: t.sm,
        }}>
          {/* File info + reset */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FileSpreadsheet size={16} color={t.teal} />
              <span style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>{fileName}</span>
            </div>
            <button
              onClick={reset}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "none", border: `1px solid ${t.line}`,
                borderRadius: 7, padding: "5px 11px",
                fontSize: 12, fontWeight: 600, color: t.mid,
                cursor: "pointer", fontFamily: FF,
              }}
            >
              <RotateCcw size={12} /> Ganti File
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <StatBox label="Total SDP"      value={stats.total}     color={t.teal}  bg={t.tealBg}  bd={t.tealBd} />
            <StatBox label="Aktif"          value={stats.active}    color={t.green} bg={t.greenBg} bd={t.greenBd} />
            <StatBox label="Akan Terminate" value={stats.willTerm}  color={t.amber} bg={t.amberBg} bd={t.amberBd} />
            <StatBox label="Terminated"     value={stats.terminated}color={t.red}   bg={t.redBg}   bd={t.redBd} />
          </div>

          {/* Preview table */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.mid, marginBottom: 8 }}>
              Preview — {records.length} baris
            </div>
            <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 420, borderRadius: 9, border: `1px solid ${t.line}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr style={{ background: t.sub }}>
                    {["#","SDP ID","Status Usaha","Nama Owner","NIK","No WA","Status"].map(h => (
                      <th key={h} style={{
                        padding: "8px 10px", textAlign: "left",
                        color: t.mid, fontWeight: 700,
                        borderBottom: `1px solid ${t.line}`,
                        whiteSpace: "nowrap",
                        background: t.sub,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const statusColor = r.terminate_note === "TERMINATED"
                      ? t.red
                      : r.is_terminate_next_month
                        ? t.amber
                        : t.green;
                    const statusBg = r.terminate_note === "TERMINATED"
                      ? t.redBg
                      : r.is_terminate_next_month
                        ? t.amberBg
                        : t.greenBg;
                    const statusBd = r.terminate_note === "TERMINATED"
                      ? t.redBd
                      : r.is_terminate_next_month
                        ? t.amberBd
                        : t.greenBd;
                    const statusLabel = r.terminate_note === "TERMINATED"
                      ? "TERMINATED"
                      : r.is_terminate_next_month
                        ? "AKAN TERMINATE"
                        : "ACTIVE";
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${t.line}` }}>
                        <td style={{ padding: "7px 10px", color: t.lo, fontSize: 10 }}>{i + 1}</td>
                        <td style={{ padding: "7px 10px", color: t.hi, fontWeight: 600 }}>{r.sdp_id}</td>
                        <td style={{ padding: "7px 10px", color: t.mid }}>{r.status_usaha}</td>
                        <td style={{ padding: "7px 10px", color: t.mid, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nama_owner}</td>
                        <td style={{ padding: "7px 10px", color: t.lo, fontFamily: "monospace" }}>{r.nik}</td>
                        <td style={{ padding: "7px 10px", color: t.lo }}>{r.no_whatsapp}</td>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{
                            display: "inline-flex", padding: "2px 8px", borderRadius: 99,
                            fontSize: 10, fontWeight: 700,
                            color: statusColor, background: statusBg, border: `1px solid ${statusBd}`,
                          }}>{statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Confirm upload */}
          {uploading ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Loader2 size={14} color={t.teal} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: 13, color: t.teal, fontWeight: 600 }}>
                  Mengupload... {progress}%
                </span>
              </div>
              <div style={{ height: 6, background: t.line, borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 99,
                  background: t.teal,
                  width: `${progress}%`,
                  transition: "width .3s ease",
                }} />
              </div>
            </div>
          ) : (
            <button
              onClick={handleUpload}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: t.teal, border: "none", borderRadius: 10,
                padding: "11px 22px", cursor: "pointer",
                fontSize: 14, fontWeight: 700, color: "#fff",
                fontFamily: FF, letterSpacing: -0.2,
              }}
            >
              <Upload size={15} />
              Konfirmasi & Upload {records.length} SDP → Periode {periodLabel(period)}
            </button>
          )}
        </div>
      )}

      {/* ── Step 4: Result ────────────────────────────────────────────── */}
      {result && (
        <div style={{
          background: t.card, border: `1px solid ${result.ok ? t.tealBd : t.redBd}`,
          borderRadius: 14, padding: "22px 24px",
          boxShadow: t.sm,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            {result.ok
              ? <CheckCircle2 size={22} color={t.teal} />
              : <AlertTriangle size={22} color={t.red} />
            }
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: result.ok ? t.teal : t.red }}>
                {result.ok ? "Upload Berhasil" : "Upload Selesai dengan Error"}
              </div>
              <div style={{ fontSize: 12, color: t.mid, marginTop: 2 }}>
                Periode {periodLabel(period)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            <StatBox label="Berhasil diupdate" value={result.inserted} color={t.teal}  bg={t.tealBg}  bd={t.tealBd} />
            {result.errors > 0 && (
              <StatBox label="Gagal" value={result.errors} color={t.red} bg={t.redBg} bd={t.redBd} />
            )}
          </div>

          {result.message && (
            <div style={{
              padding: "9px 13px", borderRadius: 8,
              background: t.redBg, border: `1px solid ${t.redBd}`,
              fontSize: 12, color: t.red, marginBottom: 14,
            }}>
              {result.message}
            </div>
          )}

          <button
            onClick={reset}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: t.sub, border: `1px solid ${t.line}`,
              borderRadius: 9, padding: "9px 18px",
              fontSize: 13, fontWeight: 600, color: t.hi,
              cursor: "pointer", fontFamily: FF,
            }}
          >
            <RotateCcw size={13} /> Upload File Baru
          </button>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
