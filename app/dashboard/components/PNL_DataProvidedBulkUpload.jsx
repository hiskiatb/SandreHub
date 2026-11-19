"use client";
// Bulk Upload "Data Provided" (Area Level) — permintaan user: "buat sistem
// untuk pengupload data yang kita provide, dan bisa download template
// bagaimana sbaiknya untuk bulk upload pertama kita pilih periode dulu".
// Dipakai EMBEDDED sbg modal dari PNL_FormPendapatanV2.jsx (tombol "Bulk
// Upload" di header section "Data Provided (Area Level)", cuma muncul
// utk role yg boleh isi Data Provided / SPM).
//
// Alur: 1) pilih Periode (bulan+tahun) dulu -> 2) download template
// (.xlsx, 1 baris per Partner+Branch dari masterData V2, kolom = 9
// komponen Data Provided, PRE-FILLED dgn nilai yg sudah tersimpan utk
// periode itu kalau ada) -> 3) isi templatenya di Excel -> 4) upload
// balik file-nya -> preview tiap baris (cocok/tidak cocok sama master
// data Partner+Branch) SEBELUM benar2 disimpan -> 5) konfirmasi simpan,
// upsert ke `pnl_reports_v2` HANYA kolom Data Provided (kolom
// margin/income punya Partner TIDAK ikut tersentuh sama sekali oleh
// fitur ini - beda domain permission).
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, ChevronLeft, Download, Loader2, Upload, X } from "lucide-react";
import supabase from "../../../lib/supabase";
import { FONT, MONTHS_ID, toMonthInt, toYearInt, numOrZero, fmtIDR } from "./PNL_V2Shared";

const START_YEAR = 2026;
const now = new Date();
const availableYears = (() => {
  const out = [];
  for (let y = START_YEAR; y <= now.getFullYear() + 1; y++) out.push(y);
  return out;
})();

function uniqueAreaRows(masterData) {
  // masterData V2: {partner_name, branch_name, region, mpc_mp3}. Dedup
  // per Partner+Branch (mpc_mp3 di V2 selalu kosong - lihat TypePill
  // "MDI" di PivotSummary/ControlCenter utk area level yg sama).
  const seen = new Set();
  const out = [];
  (masterData || []).forEach((r) => {
    const partner = (r.partner_name || "").trim();
    const branch = (r.branch_name || "").trim();
    if (!partner || !branch) return;
    const key = `${partner.toLowerCase()}|${branch.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ partner_name: partner, branch_name: branch, mpc_mp3: r.mpc_mp3 || "" });
  });
  out.sort((a, b) => a.partner_name.localeCompare(b.partner_name) || a.branch_name.localeCompare(b.branch_name));
  return out;
}

export default function PNL_DataProvidedBulkUpload({ t, d, masterData, dataProvidedRows, profile, onClose }) {
  const [step, setStep] = useState("period"); // "period" | "upload"
  const [month, setMonth] = useState(MONTHS_ID[now.getMonth()]);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [existingMap, setExistingMap] = useState({}); // key partner|branch -> row Data Provided values
  const [err, setErr] = useState("");

  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState(null); // null = belum ada file di-upload
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null); // { saved, skipped }

  const areaRows = useMemo(() => uniqueAreaRows(masterData), [masterData]);

  const goToUpload = async () => {
    setErr("");
    setLoadingExisting(true);
    try {
      const m = toMonthInt(month), y = toYearInt(year);
      const { data, error } = await supabase
        .from("pnl_reports_v2")
        .select(["partner_name", "branch", "mpc_mp3", ...dataProvidedRows.map((r) => r.id)].join(","))
        .eq("month", m).eq("year", y);
      if (error) throw error;
      const map = {};
      (data || []).forEach((row) => {
        const key = `${(row.partner_name || "").trim().toLowerCase()}|${(row.branch || "").trim().toLowerCase()}`;
        map[key] = row;
      });
      setExistingMap(map);
      setStep("upload");
      setParsedRows(null);
      setFileName("");
      setResult(null);
    } catch (e) {
      setErr(e.message || "Gagal memuat data Data Provided yang sudah tersimpan utk periode ini.");
    } finally {
      setLoadingExisting(false);
    }
  };

  const downloadTemplate = () => {
    const header = ["Partner", "Branch", ...dataProvidedRows.map((r) => r.label)];
    const rows = areaRows.map((a) => {
      const key = `${a.partner_name.toLowerCase()}|${a.branch_name.toLowerCase()}`;
      const existing = existingMap[key];
      return [a.partner_name, a.branch_name, ...dataProvidedRows.map((r) => numOrZero(existing?.[r.id]))];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = [{ wch: 28 }, { wch: 18 }, ...dataProvidedRows.map(() => ({ wch: 20 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Provided");
    XLSX.writeFile(wb, `template_data_provided_${month}_${year}.xlsx`);
  };

  const handleFile = (f) => {
    if (!f) return;
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      setErr("Format file tidak didukung — gunakan .xlsx, .xls, atau .csv (hasil download template di atas).");
      return;
    }
    setErr("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const areaByKey = Object.fromEntries(areaRows.map((a) => [`${a.partner_name.toLowerCase()}|${a.branch_name.toLowerCase()}`, a]));
        const seenKeys = new Set();
        const out = json.map((row, idx) => {
          const partner = String(row["Partner"] ?? "").trim();
          const branch = String(row["Branch"] ?? "").trim();
          const key = `${partner.toLowerCase()}|${branch.toLowerCase()}`;
          const area = areaByKey[key];
          const values = {};
          dataProvidedRows.forEach((r) => {
            // cari kolom berdasarkan label (case-insensitive) - header
            // template dikunci persis sama label DATA_PROVIDED_ROWS,
            // jadi cocokkan langsung by key Object dari sheet_to_json.
            const matchKey = Object.keys(row).find((k) => k.trim().toLowerCase() === r.label.trim().toLowerCase());
            values[r.id] = numOrZero(matchKey ? row[matchKey] : row[r.label]);
          });
          const existing = existingMap[key];
          const changed = !existing || dataProvidedRows.some((r) => numOrZero(existing[r.id]) !== values[r.id]);
          const duplicate = seenKeys.has(key);
          if (key !== "|") seenKeys.add(key);
          return {
            rowNo: idx + 2, // +2: baris 1 = header, data mulai baris 2
            partner_name: area ? area.partner_name : partner,
            branch_name: area ? area.branch_name : branch,
            mpc_mp3: area ? area.mpc_mp3 : "",
            values,
            matched: !!area && !!partner && !!branch,
            empty: !partner && !branch,
            duplicate,
            changed,
          };
        }).filter((r) => !r.empty);
        setParsedRows(out);
        setFileName(f.name);
        setResult(null);
      } catch (ex) {
        setErr("Gagal membaca file: " + (ex.message || "format tidak valid."));
      }
    };
    reader.readAsArrayBuffer(f);
  };

  const matchedRows = useMemo(() => (parsedRows || []).filter((r) => r.matched && !r.duplicate), [parsedRows]);
  const unmatchedCount = useMemo(() => (parsedRows || []).filter((r) => !r.matched).length, [parsedRows]);
  const duplicateCount = useMemo(() => (parsedRows || []).filter((r) => r.duplicate).length, [parsedRows]);

  const handleUpload = async () => {
    if (!matchedRows.length) return;
    setUploading(true);
    setErr("");
    try {
      const m = toMonthInt(month), y = toYearInt(year);
      const payloads = matchedRows.map((r) => ({
        partner_name: r.partner_name,
        branch: r.branch_name,
        mpc_mp3: r.mpc_mp3 || "",
        month: m,
        year: y,
        user_id: profile?.id || null,
        updated_at: new Date().toISOString(),
        ...Object.fromEntries(dataProvidedRows.map((dr) => [dr.id, r.values[dr.id]])),
      }));
      // upsert per-batch kecil (50 baris) biar aman dari limit payload,
      // konsisten sama pola fetchAllRows/paginated di modul lain -
      // jumlah Partner+Branch realistis jauh di bawah ini tapi tetap
      // di-batch utk jaga2.
      const BATCH = 50;
      for (let i = 0; i < payloads.length; i += BATCH) {
        const chunk = payloads.slice(i, i + BATCH);
        const { error } = await supabase.from("pnl_reports_v2").upsert(chunk, { onConflict: "partner_name,branch,mpc_mp3,month,year" });
        if (error) throw error;
      }
      setResult({ saved: payloads.length, skipped: unmatchedCount + duplicateCount });
    } catch (e) {
      setErr(e.message || "Gagal mengupload Data Provided.");
    } finally {
      setUploading(false);
    }
  };

  const selStyle = { appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: t.inputBg, border: `1px solid ${t.inputBd}`, borderRadius: 8, color: t.hi, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "9px 14px", cursor: "pointer" };
  const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 7, border: "none", borderRadius: 9, padding: "10px 16px", background: "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" };
  const btnGhost = { display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${t.line}`, borderRadius: 9, padding: "10px 16px", background: t.card, color: t.hi, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: FONT }}>
      <div style={{ width: "100%", maxWidth: 820, maxHeight: "92vh", overflow: "auto", background: t.card, borderRadius: 16, border: `1px solid ${t.line}`, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: `1px solid ${t.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Upload size={17} color={t.hi} />
            <div style={{ fontSize: 15.5, fontWeight: 800, color: t.hi }}>Bulk Upload Data Provided (Area Level)</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: t.mid, cursor: "pointer", borderRadius: 8 }}><X size={16} /></button>
        </div>

        <div style={{ padding: 22 }}>
          {err && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 9, background: t.redBg, color: t.red, fontSize: 12.5, fontWeight: 600, marginBottom: 16 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{err}
            </div>
          )}

          {step === "period" && (
            <>
              <div style={{ fontSize: 13, color: t.mid, marginBottom: 16, lineHeight: 1.5 }}>
                Pilih periode (bulan &amp; tahun) Data Provided yang mau di-bulk upload terlebih dahulu. Template yang di-download nanti otomatis sudah berisi semua Partner+Branch, dan kalau periode ini sudah pernah diisi sebagian, nilainya akan ikut terisi (bukan kosong) supaya tinggal dikoreksi.
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                <select value={month} onChange={(e) => setMonth(e.target.value)} style={selStyle}>
                  {MONTHS_ID.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={year} onChange={(e) => setYear(e.target.value)} style={selStyle}>
                  {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button onClick={goToUpload} disabled={loadingExisting} style={{ ...btnPrimary, opacity: loadingExisting ? 0.7 : 1 }}>
                {loadingExisting ? <Loader2 size={14} style={{ animation: "v2spin 0.8s linear infinite" }} /> : null} Lanjut ke Upload
              </button>
            </>
          )}

          {step === "upload" && (
            <>
              <button onClick={() => setStep("period")} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "none", color: t.mid, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 14 }}>
                <ChevronLeft size={13} /> Ganti Periode
              </button>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, marginBottom: 2 }}>Periode: {month} {year}</div>
              <div style={{ fontSize: 12, color: t.mid, marginBottom: 18 }}>{areaRows.length} Partner+Branch terdaftar di master data.</div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                <button onClick={downloadTemplate} style={btnGhost}><Download size={14} /> Download Template (.xlsx)</button>
                <label style={{ ...btnPrimary, cursor: "pointer" }}>
                  <Upload size={14} /> {fileName || "Pilih File Hasil Isi"}
                  <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
                </label>
              </div>

              {parsedRows && (
                <>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, fontSize: 12, fontWeight: 700 }}>
                    <span style={{ color: t.green }}>{matchedRows.length} baris cocok &amp; siap diupload</span>
                    {unmatchedCount > 0 && <span style={{ color: t.red }}>{unmatchedCount} baris Partner/Branch tidak ditemukan di master data</span>}
                    {duplicateCount > 0 && <span style={{ color: t.red }}>{duplicateCount} baris duplikat Partner+Branch (hanya kemunculan pertama dipakai)</span>}
                  </div>
                  <div style={{ maxHeight: 280, overflow: "auto", border: `1px solid ${t.line}`, borderRadius: 10, marginBottom: 18 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead style={{ position: "sticky", top: 0, background: t.card }}>
                        <tr style={{ borderBottom: `1px solid ${t.line}` }}>
                          <th style={{ textAlign: "left", padding: "8px 10px", color: t.mid }}>Baris</th>
                          <th style={{ textAlign: "left", padding: "8px 10px", color: t.mid }}>Partner</th>
                          <th style={{ textAlign: "left", padding: "8px 10px", color: t.mid }}>Branch</th>
                          <th style={{ textAlign: "right", padding: "8px 10px", color: t.mid }}>Total Data Provided</th>
                          <th style={{ textAlign: "left", padding: "8px 10px", color: t.mid }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.map((r, i) => {
                          const total = dataProvidedRows.reduce((s, dr) => s + numOrZero(r.values[dr.id]), 0);
                          const ok = r.matched && !r.duplicate;
                          return (
                            <tr key={i} style={{ borderBottom: `1px solid ${t.lineH}` }}>
                              <td style={{ padding: "7px 10px", color: t.mid }}>{r.rowNo}</td>
                              <td style={{ padding: "7px 10px", color: t.hi, fontWeight: 600 }}>{r.partner_name || "—"}</td>
                              <td style={{ padding: "7px 10px", color: t.hi }}>{r.branch_name || "—"}</td>
                              <td style={{ padding: "7px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtIDR(total)}</td>
                              <td style={{ padding: "7px 10px" }}>
                                {ok
                                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: t.green, fontWeight: 700 }}><CheckCircle2 size={12} />{r.changed ? "Siap (ada perubahan)" : "Siap (tidak berubah)"}</span>
                                  : <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: t.red, fontWeight: 700 }}><AlertTriangle size={12} />{r.duplicate ? "Duplikat" : "Tidak ditemukan"}</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {result ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderRadius: 10, background: t.greenBg, color: t.green, fontSize: 13, fontWeight: 700 }}>
                      <CheckCircle2 size={16} /> Berhasil upload {result.saved} baris Data Provided{result.skipped > 0 ? `, ${result.skipped} baris dilewati.` : "."}
                    </div>
                  ) : (
                    <button onClick={handleUpload} disabled={uploading || !matchedRows.length} style={{ ...btnPrimary, opacity: (uploading || !matchedRows.length) ? 0.6 : 1 }}>
                      {uploading ? <Loader2 size={14} style={{ animation: "v2spin 0.8s linear infinite" }} /> : <Upload size={14} />} Upload {matchedRows.length} Baris ke Database
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
