"use client";
// Import Plan Activity dari Excel - fitur permanen CMS: upload .xlsx (maks
// 150MB, TIDAK disimpan ke Storage/DB - cuma diproses di memori tab ini) ->
// pilih sheet -> mapping kolom via drag-and-drop -> baris valid masuk sbg
// activity plan_source='cms_import' status langsung 'plan_submitted', baris
// yg gagal (mis. Site ID tak ketemu di master) masuk Karantina utk dicek
// manual (BUKAN ditolak diam-diam). Lihat migrasi Supabase
// `add_plan_import_feature` & lib/martaPlanImport.js.
import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Loader2, Inbox, RotateCcw, X, GripVertical } from "lucide-react";
import MartaShell, { T, FONT } from "../../components/MartaShell";
import {
  PLAN_TARGET_FIELDS, guessPlanMapping, readWorkbookSheetNames, getSheetMatrix,
  derivePlanTable, buildPlanRows, runPlanImport, fetchImportBatches, fetchImportQuarantine, resolveImportQuarantine,
  deleteImportQuarantine,
} from "../../../../lib/martaPlanImport";

const STEPS = ["Upload", "Pilih Sheet", "Konfirmasi Header", "Mapping Kolom", "Preview & Kirim"];

export default function ImportPlanPage() {
  return (
    <MartaShell active="activities" title="Import Plan dari Excel" subtitle="Masukkan banyak activity plan sekaligus dari file Excel - upload, pilih sheet, petakan kolom (drag & drop), lalu kirim.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  // Klik "Lihat Karantina" di satu baris Riwayat Import -> fokuskan panel
  // Karantina ke batch itu saja (lihat prop focusBatchId di QuarantineSection).
  const [focusBatchId, setFocusBatchId] = useState(null);

  const [file, setFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [sheetName, setSheetName] = useState("");
  const [reading, setReading] = useState(false);
  const [readErr, setReadErr] = useState("");

  const [matrix, setMatrix] = useState(null);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState({});

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null); // {done,total}
  const [result, setResult] = useState(null);
  const [runErr, setRunErr] = useState("");

  const table = useMemo(() => (matrix ? derivePlanTable(matrix, headerIdx) : null), [matrix, headerIdx]);
  useEffect(() => { if (table) setMapping(guessPlanMapping(table.displayColumns)); }, [table]);

  async function onFile(f) {
    setFile(f); setWorkbook(null); setSheetNames([]); setSheetName(""); setMatrix(null); setResult(null); setReadErr("");
    if (!f) return;
    setReading(true);
    try {
      const { workbook: wb, sheetNames: names } = await readWorkbookSheetNames(f);
      setWorkbook(wb); setSheetNames(names);
      setStep(1);
    } catch (e) {
      setReadErr(e.message || "Gagal membaca berkas.");
    } finally {
      setReading(false);
    }
  }

  async function pickSheet(name) {
    setSheetName(name); setReading(true); setReadErr(""); setMatrix(null); setHeaderIdx(0);
    try {
      const m = await getSheetMatrix(workbook, name);
      setMatrix(m);
      // Tebak baris header: baris pertama yg salah satu selnya cocok "no"/"no."
      // (kolom nomor urut, hampir selalu ada di sheet spt ini) - kalau tidak
      // ketemu, default baris pertama (bisa digeser manual).
      let guess = 0;
      for (let r = 0; r < Math.min(m.length, 10); r++) {
        const row = m[r] || [];
        if (row.some((c) => /^no\.?$/i.test(String(c || "").trim()))) { guess = r; break; }
      }
      setHeaderIdx(guess);
      setStep(2);
    } catch (e) {
      setReadErr(e.message || "Gagal membaca sheet.");
    } finally {
      setReading(false);
    }
  }

  function setMap(fieldKey, columnName) {
    setMapping((m) => ({ ...m, [fieldKey]: columnName }));
  }
  function unmap(fieldKey) {
    setMapping((m) => ({ ...m, [fieldKey]: "" }));
  }

  const requiredMissing = PLAN_TARGET_FIELDS.filter((f) => f.required && !mapping[f.key]);
  const canPreview = table && requiredMissing.length === 0;

  async function runImport() {
    if (!table || !email) return;
    setRunning(true); setRunErr(""); setResult(null); setProgress({ done: 0, total: 0 });
    try {
      const dbRows = buildPlanRows(table.rows, mapping);
      setProgress({ done: 0, total: dbRows.length });
      const res = await runPlanImport(dbRows, { callerEmail: email, filename: file?.name, sheetName }, (done, total) => setProgress({ done, total }));
      setResult(res);
      setStep(3);
    } catch (e) {
      setRunErr(e.message || "Gagal mengirim data import.");
    } finally {
      setRunning(false);
    }
  }

  function resetAll() {
    setFile(null); setWorkbook(null); setSheetNames([]); setSheetName("");
    setMatrix(null); setHeaderIdx(0); setMapping({}); setResult(null); setRunErr(""); setProgress(null);
    setStep(0);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 980 }}>
      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <UploadCard file={file} reading={reading} readErr={readErr} onFile={onFile} />
      )}

      {step === 1 && (
        <SheetPickCard sheetNames={sheetNames} sheetName={sheetName} reading={reading} readErr={readErr}
          onPick={pickSheet} onBack={() => setStep(0)} />
      )}

      {step === 2 && matrix && (
        <HeaderConfirmCard
          matrix={matrix} headerIdx={headerIdx} setHeaderIdx={setHeaderIdx}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && table && (
        <MappingCard
          table={table} headerIdx={headerIdx}
          mapping={mapping} setMap={setMap} unmap={unmap}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
          canNext={canPreview}
          requiredMissing={requiredMissing}
        />
      )}

      {step === 4 && !result && (
        <PreviewCard
          table={table} mapping={mapping}
          running={running} progress={progress} runErr={runErr}
          onBack={() => setStep(3)}
          onRun={runImport}
        />
      )}

      {step === 4 && result && (
        <ResultCard result={result} onReset={resetAll} onGoActivities={() => router.push("/martahub/activities")} />
      )}

      <ImportHistorySection onViewQuarantine={(batchId) => setFocusBatchId(batchId)} />
      <QuarantineSection email={email} focusBatchId={focusBatchId} onClearFocus={() => setFocusBatchId(null)} />
    </div>
  );
}

function Stepper({ steps, current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 800, flexShrink: 0,
              background: i < current ? T.success : i === current ? T.primary : "#fff",
              color: i <= current ? "#fff" : T.lo,
              border: i <= current ? "none" : `1.5px solid ${T.line}`,
            }}>
              {i < current ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: i === current ? T.hi : T.lo, whiteSpace: "nowrap" }}>{s}</div>
          </div>
          {i < steps.length - 1 && <div style={{ flex: 1, height: 1.5, background: i < current ? T.success : T.line, margin: "0 12px" }} />}
        </div>
      ))}
    </div>
  );
}

function card(extra) {
  return { background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 22, ...extra };
}
const btnPrimary = {
  padding: "10px 18px", borderRadius: 10, border: "none", cursor: "pointer",
  background: "linear-gradient(90deg, #ED1C24 0%, #C6168D 100%)", color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: FONT,
  display: "inline-flex", alignItems: "center", gap: 6,
};
const btnGhost = {
  padding: "10px 16px", borderRadius: 10, border: `1.5px solid ${T.line}`, cursor: "pointer",
  background: "#fff", color: T.mid, fontWeight: 700, fontSize: 13, fontFamily: FONT,
  display: "inline-flex", alignItems: "center", gap: 6,
};

function UploadCard({ file, reading, readErr, onFile }) {
  const [drag, setDrag] = useState(false);
  return (
    <div style={card()}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        style={{
          border: `2px dashed ${drag ? T.primary : T.line}`, borderRadius: 12, padding: "44px 20px",
          textAlign: "center", background: drag ? T.primaryBg : "#FAFBFD", transition: "all .15s",
        }}
      >
        <UploadCloud size={30} color={drag ? T.primary : T.lo} style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 14, fontWeight: 800, color: T.hi, marginBottom: 4 }}>Seret file Excel ke sini, atau klik utk pilih</div>
        <div style={{ fontSize: 12, color: T.lo, marginBottom: 16 }}>.xlsx / .xls / .csv - maksimal 150 MB. File TIDAK disimpan, cuma diproses sekali pakai.</div>
        <label style={{ ...btnPrimary, cursor: "pointer" }}>
          {reading ? <Loader2 size={14} className="mh-spin" /> : <FileSpreadsheet size={14} />}
          {reading ? "Membaca…" : "Pilih Berkas"}
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} disabled={reading}
            onChange={(e) => onFile(e.target.files?.[0] || null)} />
        </label>
        {file && !reading && <div style={{ marginTop: 12, fontSize: 12, color: T.mid }}>{file.name} · {(file.size / 1048576).toFixed(1)} MB</div>}
      </div>
      {readErr && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600 }}>{readErr}</div>}
      <style>{`@keyframes mh-spin{to{transform:rotate(360deg)}} .mh-spin{animation:mh-spin .8s linear infinite}`}</style>
    </div>
  );
}

function SheetPickCard({ sheetNames, sheetName, reading, readErr, onPick, onBack }) {
  return (
    <div style={card()}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Pilih Sheet</div>
      <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 16 }}>File ini punya {sheetNames.length} sheet. Pilih sheet yang mau diimport (mis. "North - Sept").</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, maxHeight: 320, overflowY: "auto" }}>
        {sheetNames.map((name) => (
          <button key={name} onClick={() => onPick(name)} disabled={reading}
            style={{
              textAlign: "left", padding: "11px 14px", borderRadius: 10, cursor: "pointer",
              border: `1.5px solid ${sheetName === name ? T.primary : T.line}`,
              background: sheetName === name ? T.primaryBg : "#fff",
              fontSize: 12.5, fontWeight: 700, color: T.hi, fontFamily: FONT,
              display: "flex", alignItems: "center", gap: 8,
            }}>
            <FileSpreadsheet size={14} color={sheetName === name ? T.primary : T.lo} />
            {name}
            {reading && sheetName === name && <Loader2 size={13} className="mh-spin" style={{ marginLeft: "auto" }} />}
          </button>
        ))}
      </div>
      {readErr && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600 }}>{readErr}</div>}
      <div style={{ marginTop: 18 }}>
        <button onClick={onBack} style={btnGhost}><ArrowLeft size={14} /> Kembali</button>
      </div>
    </div>
  );
}

// ── Konfirmasi Header - step WAJIB sebelum mapping, supaya fitur ini tetap
// aman kalau template Excel-nya berubah suatu saat (baris header pindah,
// ada baris judul/ringkasan tambahan di atas, dst). Tebakan otomatis (cari
// baris yg ada sel "No"/"No.") sudah dipilihkan, tapi user HARUS melihat
// preview mentah & mengonfirmasi/mengubahnya secara eksplisit sebelum lanjut
// - tidak diam-diam dipercaya begitu saja.
function HeaderConfirmCard({ matrix, headerIdx, setHeaderIdx, onBack, onNext }) {
  const maxRows = Math.min(matrix.length, 15);
  const maxCols = Math.min(Math.max(...matrix.slice(0, maxRows).map((r) => (r || []).length)) || 0, 14);
  const headerRow = matrix[headerIdx] || [];
  const filledHeaderCells = headerRow.filter((c) => c != null && String(c).trim() !== "").length;

  return (
    <div style={card()}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Konfirmasi Baris Header</div>
      <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 6 }}>
        Klik baris yang berisi nama-nama kolom (Event Name, Brand, Target_SP, dst). Sistem sudah menebak baris yang paling mungkin, tapi <b>pastikan dulu sebelum lanjut</b> -
        kalau template Excel berubah (baris judul/ringkasan bertambah, urutan baris beda), mapping kolom di step berikutnya bisa salah total kalau baris header di sini salah pilih.
      </div>
      <div style={{ marginBottom: 14, padding: "9px 12px", borderRadius: 9, background: T.primaryBg, color: T.primary, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        <CheckCircle2 size={14} />
        Baris terpilih: <b>Baris {headerIdx + 1}</b> ({filledHeaderCells} kolom terisi nama)
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 10, maxHeight: 420, overflowY: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11.5, minWidth: "100%" }}>
          <tbody>
            {matrix.slice(0, maxRows).map((row, i) => {
              const isSelected = i === headerIdx;
              return (
                <tr key={i} onClick={() => setHeaderIdx(i)}
                  style={{ cursor: "pointer", background: isSelected ? T.primaryBg : (i % 2 ? "#FAFBFD" : "#fff") }}>
                  <td style={{ padding: "6px 10px", borderBottom: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}`, position: "sticky", left: 0, background: isSelected ? T.primaryBg : (i % 2 ? "#FAFBFD" : "#fff"), fontWeight: 800, color: isSelected ? T.primary : T.lo, whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="radio" checked={isSelected} onChange={() => setHeaderIdx(i)} onClick={(e) => e.stopPropagation()} />
                      Baris {i + 1}
                    </div>
                  </td>
                  {Array.from({ length: maxCols }).map((_, ci) => (
                    <td key={ci} style={{ padding: "6px 10px", borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap", color: isSelected ? T.hi : T.mid, fontWeight: isSelected ? 700 : 500, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row?.[ci] != null && String(row[ci]).trim() !== "" ? String(row[ci]) : <span style={{ color: T.line }}>-</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <button onClick={onBack} style={btnGhost}><ArrowLeft size={14} /> Kembali</button>
        <button onClick={onNext} style={btnPrimary}>
          Lanjut ke Mapping Kolom <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Mapping drag-and-drop: kolom terdeteksi di sheet (chip, bisa diseret) di
// kiri; field tujuan (drop zone) di kanan. Seret chip ke kotak field utk
// memetakan; klik "x" di kotak utk lepas. Field wajib ditandai *. Baris
// header SUDAH dikonfirmasi di step sebelumnya (Konfirmasi Header) - di sini
// cuma ditampilkan sbg info + tombol "Ubah" (balik ke step itu) supaya tidak
// ada 2 kontrol beda tempat utk hal yg sama.
function MappingCard({ table, headerIdx, mapping, setMap, unmap, onBack, onNext, canNext, requiredMissing }) {
  const [dragCol, setDragCol] = useState(null);
  const mappedCols = new Set(Object.values(mapping).filter(Boolean));
  const previewRows = table.rows.slice(0, 5);

  return (
    <div style={card()}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Mapping Kolom (Drag & Drop)</div>
          <div style={{ color: T.mid, fontSize: 12.5 }}>Seret nama kolom di kiri ke kotak field yang sesuai di kanan.</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.mid, fontWeight: 700 }}>
          Baris Header: <span style={{ color: T.hi }}>Baris {headerIdx + 1}</span>
          <button onClick={onBack} style={{ ...btnGhost, padding: "5px 10px", fontSize: 11.5 }}>Ubah</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.lo, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
            Kolom di Sheet ({table.displayColumns.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 480, overflowY: "auto", paddingRight: 4 }}>
            {table.displayColumns.map((col) => {
              const used = mappedCols.has(col);
              return (
                <div key={col} draggable
                  onDragStart={() => setDragCol(col)}
                  onDragEnd={() => setDragCol(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 9,
                    border: `1.5px solid ${used ? T.successBg : T.line}`, background: used ? "#F3FBF4" : "#fff",
                    fontSize: 12, fontWeight: 700, color: used ? T.success : T.hi, cursor: "grab", userSelect: "none",
                  }}>
                  <GripVertical size={13} color={T.lo} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col}</span>
                  {used && <CheckCircle2 size={13} color={T.success} style={{ marginLeft: "auto", flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.lo, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
            Field Tujuan
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {PLAN_TARGET_FIELDS.map((f) => {
              const val = mapping[f.key] || "";
              return (
                <div key={f.key}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (dragCol) setMap(f.key, dragCol); }}
                  style={{
                    padding: "10px 12px", borderRadius: 10, minHeight: 56,
                    border: `1.5px dashed ${val ? T.success : (f.required ? "#F3B8B8" : T.line)}`,
                    background: val ? "#F3FBF4" : "#FAFBFD",
                  }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: T.lo, marginBottom: 4 }}>
                    {f.label}{f.required && <span style={{ color: T.error }}> *</span>}
                  </div>
                  {val ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: T.hi }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{val}</span>
                      <button onClick={() => unmap(f.key)} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: T.lo, display: "flex" }}>
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11.5, color: T.lo }}>Seret kolom ke sini…</div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: T.lo }}>
            Alamat & BME/RGE sengaja tidak ada di daftar - alamat menunggu konfirmasi GPS oleh DSF, BME/RGE menunggu di-assign lewat User Management.
          </div>
        </div>
      </div>

      {previewRows.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.lo, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
            Preview {previewRows.length} baris pertama ({table.rows.length} baris data terdeteksi)
          </div>
          <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 10 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: T.hover }}>
                  {table.displayColumns.slice(0, 8).map((c) => (
                    <th key={c} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 800, color: T.mid, whiteSpace: "nowrap", borderBottom: `1px solid ${T.line}` }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i}>
                    {table.displayColumns.slice(0, 8).map((c) => (
                      <td key={c} style={{ padding: "7px 10px", color: T.hi, whiteSpace: "nowrap", borderBottom: `1px solid ${T.line}` }}>{String(r[c] ?? "-")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {requiredMissing.length > 0 && (
        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: T.warningBg, color: "#8A6200", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={14} /> Field wajib belum dipetakan: {requiredMissing.map((f) => f.label).join(", ")}
        </div>
      )}

      <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
        <button onClick={onBack} style={btnGhost}><ArrowLeft size={14} /> Kembali</button>
        <button onClick={onNext} disabled={!canNext} style={{ ...btnPrimary, opacity: canNext ? 1 : 0.5, cursor: canNext ? "pointer" : "not-allowed" }}>
          Lanjut ke Preview <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function PreviewCard({ table, mapping, running, progress, runErr, onBack, onRun }) {
  const dbRows = useMemo(() => buildPlanRows(table.rows, mapping), [table, mapping]);
  return (
    <div style={card()}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Preview & Kirim</div>
      <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 16 }}>
        {dbRows.length} baris siap dikirim. Baris valid langsung berstatus <b>Plan Diajukan</b>; baris yg gagal (mis. Site ID tak ketemu di master) masuk Karantina, TIDAK ditolak diam-diam.
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        <StatBox label="Baris Siap Kirim" value={dbRows.length} color={T.blue} />
        <StatBox label="Field Terpetakan" value={`${PLAN_TARGET_FIELDS.filter((f) => mapping[f.key]).length}/${PLAN_TARGET_FIELDS.length}`} color={T.mid} />
      </div>

      {running && progress && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: T.mid, marginBottom: 6 }}>Mengirim… {progress.done}/{progress.total} baris</div>
          <div style={{ height: 8, borderRadius: 5, background: T.hover, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: "linear-gradient(90deg, #ED1C24 0%, #C6168D 100%)", transition: "width .2s" }} />
          </div>
        </div>
      )}

      {runErr && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600 }}>{runErr}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} disabled={running} style={btnGhost}><ArrowLeft size={14} /> Kembali ke Mapping</button>
        <button onClick={onRun} disabled={running || dbRows.length === 0} style={{ ...btnPrimary, opacity: running ? 0.7 : 1 }}>
          {running ? <Loader2 size={14} className="mh-spin" /> : <UploadCloud size={14} />}
          {running ? "Mengirim…" : `Kirim ${dbRows.length} Baris`}
        </button>
      </div>
      <style>{`@keyframes mh-spin{to{transform:rotate(360deg)}} .mh-spin{animation:mh-spin .8s linear infinite}`}</style>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ flex: 1, padding: "14px 16px", borderRadius: 10, border: `1px solid ${T.line}`, background: "#FAFBFD" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: T.lo, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || T.hi }}>{value}</div>
    </div>
  );
}

function ResultCard({ result, onReset, onGoActivities }) {
  return (
    <div style={card()}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: T.successBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle2 size={20} color={T.success} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Import Selesai</div>
          <div style={{ fontSize: 12, color: T.mid }}>{result.total} baris diproses.</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
        <StatBox label="Berhasil Diimport" value={result.imported} color={T.success} />
        <StatBox label="Masuk Karantina" value={result.quarantined} color={result.quarantined > 0 ? T.warning : T.mid} />
      </div>

      {result.quarantinePreview?.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.lo, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
            Baris yang Masuk Karantina
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${T.line}`, borderRadius: 10 }}>
            {result.quarantinePreview.map((q, i) => (
              <div key={i} style={{ padding: "9px 12px", borderBottom: i < result.quarantinePreview.length - 1 ? `1px solid ${T.line}` : "none", fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: T.hi }}>Baris #{q.row_number} · {q.event_name || "(tanpa nama)"} {q.site_id ? `· ${q.site_id}` : ""}</div>
                <div style={{ color: T.warning, marginTop: 2 }}>{q.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onReset} style={btnGhost}><RotateCcw size={14} /> Import File Lain</button>
        <button onClick={onGoActivities} style={btnPrimary}>Lihat Activity Plan <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}

// ── Karantina: daftar SEMUA baris gagal import (lintas batch) yg belum
// ditandai selesai dicek - permanen, bukan cuma muncul sekali abis import.
// Label tanggal lokal (bukan UTC) - dipakai buat kunci grup filter "per
// tanggal" supaya baris yg masuk larut malam WIB tetap kehitung di hari yg
// benar menurut jam lokal, bukan potong hari UTC.
function localDateKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localDateLabel(iso) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

// ── Riwayat Import - log SEMUA sesi upload (bukan cuma yg masuk karantina),
// persis spt kartu "Import Selesai" yg tampil sesaat setelah submit, tapi
// permanen & bisa dilihat lagi kapan saja (mis. cek siapa upload apa tgl
// berapa, atau sekedar susun ulang kronologi kalau ada pertanyaan dari
// lapangan). Sumber: mh_plan_import_batches lewat mh_list_import_batches
// (RPC yg sudah ada, dipakai juga oleh QuarantineSection & Rollback).
function ImportHistorySection({ onViewQuarantine }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setBatches(await fetchImportBatches()); }
    catch { /* best-effort */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const dateOptions = useMemo(() => {
    const m = new Map();
    for (const b of batches) m.set(localDateKey(b.created_at), (m.get(localDateKey(b.created_at)) || 0) + 1);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [batches]);

  const term = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    let list = batches;
    if (dateFilter) list = list.filter((b) => localDateKey(b.created_at) === dateFilter);
    if (term) list = list.filter((b) => (b.filename || "").toLowerCase().includes(term) || (b.sheet_name || "").toLowerCase().includes(term) || (b.created_by_email || "").toLowerCase().includes(term));
    return list;
  }, [batches, dateFilter, term]);

  return (
    <div style={card()}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <RotateCcw size={16} color={T.primary} />
        <div style={{ fontWeight: 800, fontSize: 15 }}>Riwayat Import ({filtered.length}{dateFilter || term ? ` / ${batches.length}` : ""})</div>
        {batches.length > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama file / sheet / pengupload…"
              style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 12, fontFamily: FONT, color: T.hi, width: 220 }} />
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 12, fontFamily: FONT, color: T.hi }}>
              <option value="">Semua Tanggal ({batches.length})</option>
              {dateOptions.map(([key, n]) => (
                <option key={key} value={key}>{localDateLabel(batches.find((b) => localDateKey(b.created_at) === key).created_at)} ({n})</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 14 }}>
        Log setiap sesi Import Plan dari Excel - siapa, kapan, file & sheet apa, berapa baris berhasil vs masuk karantina.
      </div>

      {loading ? (
        <div style={{ fontSize: 12.5, color: T.lo, padding: "10px 0" }}>Memuat…</div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 12.5, color: T.lo, padding: "10px 0" }}>
          {batches.length === 0 ? "Belum ada riwayat import." : "Tidak ada riwayat pada filter saat ini."}
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${T.line}`, borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ background: T.hover }}>
                {["Tanggal", "File", "Sheet", "Diupload Oleh", "Total Baris", "Berhasil", "Karantina", ""].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 800, color: T.mid, whiteSpace: "nowrap", borderBottom: `1px solid ${T.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td style={{ padding: "8px 10px", color: T.mid, whiteSpace: "nowrap" }}>
                    {new Date(b.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={{ padding: "8px 10px", color: T.hi, fontWeight: 700, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.filename || "-"}>{b.filename || "-"}</td>
                  <td style={{ padding: "8px 10px", color: T.mid, whiteSpace: "nowrap" }}>{b.sheet_name || "-"}</td>
                  <td style={{ padding: "8px 10px", color: T.mid, whiteSpace: "nowrap" }}>{b.created_by_email || "-"}</td>
                  <td style={{ padding: "8px 10px", color: T.hi, fontWeight: 700 }}>{b.total_rows ?? 0}</td>
                  <td style={{ padding: "8px 10px", color: T.success, fontWeight: 700 }}>{b.imported_count ?? 0}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: (b.quarantined_count || 0) > 0 ? T.warning : T.lo }}>{b.quarantined_count ?? 0}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {(b.quarantined_count || 0) > 0 && (
                      <button onClick={() => onViewQuarantine(b.id)}
                        style={{ ...btnGhost, padding: "5px 10px", fontSize: 11 }}>
                        Lihat Karantina
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function QuarantineSection({ email, focusBatchId, onClearFocus }) {
  const [rows, setRows] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [dateFilter, setDateFilter] = useState(""); // "" = semua tanggal
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkErr, setBulkErr] = useState("");

  // focusBatchId (dari klik "Lihat Karantina" di Riwayat Import) mempersempit
  // fetch ke SATU batch itu saja - reset filter tanggal supaya tidak
  // nyampur dgn scope batch yg lagi difokuskan.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, b] = await Promise.all([fetchImportQuarantine(focusBatchId || null, true), fetchImportBatches()]);
      setRows(q); setBatches(b);
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, [focusBatchId]);
  useEffect(() => { setDateFilter(""); load(); }, [load]);

  async function resolve(id) {
    setBusyId(id);
    try { await resolveImportQuarantine(id, email); await load(); }
    catch { /* best-effort */ }
    finally { setBusyId(null); }
  }

  async function deleteOne(id) {
    setBusyId(id);
    try { await deleteImportQuarantine([id], email); await load(); }
    catch { /* best-effort */ }
    finally { setBusyId(null); }
  }

  const batchMap = useMemo(() => Object.fromEntries(batches.map((b) => [b.id, b])), [batches]);

  // Daftar tanggal yg tersedia utk filter - diurutkan terbaru dulu, plus
  // jumlah baris per tanggal (biar kelihatan langsung mana yg paling ramai).
  const dateOptions = useMemo(() => {
    const m = new Map();
    for (const q of rows) {
      const key = localDateKey(q.created_at);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!dateFilter) return rows;
    return rows.filter((q) => localDateKey(q.created_at) === dateFilter);
  }, [rows, dateFilter]);

  async function deleteAllFiltered() {
    setBulkBusy(true); setBulkErr("");
    try {
      await deleteImportQuarantine(filteredRows.map((q) => q.id), email);
      setShowBulkConfirm(false);
      await load();
    } catch (ex) { setBulkErr(ex.message || "Gagal menghapus"); }
    finally { setBulkBusy(false); }
  }

  return (
    <div style={card()}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <Inbox size={16} color={T.warning} />
        <div style={{ fontWeight: 800, fontSize: 15 }}>Karantina Import ({filteredRows.length}{dateFilter ? ` / ${rows.length}` : ""})</div>
        {focusBatchId && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px 3px 10px", borderRadius: 999, background: T.primaryBg, color: T.primary, fontSize: 11, fontWeight: 700 }}>
            Fokus 1 Batch
            <button onClick={onClearFocus} title="Kembali lihat semua batch" style={{ border: "none", background: "none", cursor: "pointer", color: T.primary, display: "flex", padding: 0 }}>
              <X size={12} />
            </button>
          </div>
        )}

        {rows.length > 0 && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.line}`, fontSize: 12, fontFamily: FONT, color: T.hi }}>
              <option value="">Semua Tanggal ({rows.length})</option>
              {dateOptions.map(([key, n]) => (
                <option key={key} value={key}>{localDateLabel(rows.find((q) => localDateKey(q.created_at) === key).created_at)} ({n})</option>
              ))}
            </select>
            {filteredRows.length > 0 && (
              <button onClick={() => { setBulkErr(""); setShowBulkConfirm(true); }} disabled={bulkBusy}
                style={{ ...btnGhost, padding: "6px 12px", fontSize: 11.5, color: T.error, borderColor: "#F3B8B8" }}>
                <X size={12} /> Hapus Semua{dateFilter ? " (Tanggal Ini)" : ""}
              </button>
            )}
          </div>
        )}
      </div>
      <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 14 }}>
        Baris dari import sebelumnya yang gagal masuk (lintas file/sheet) & belum ditandai selesai dicek. Filter per tanggal upload di kanan atas.
      </div>

      {loading ? (
        <div style={{ fontSize: 12.5, color: T.lo, padding: "10px 0" }}>Memuat…</div>
      ) : filteredRows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: T.lo, padding: "10px 0" }}>
          {rows.length === 0 ? "Tidak ada baris karantina yang belum dicek. 🎉" : "Tidak ada baris karantina pada tanggal ini."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto" }}>
          {filteredRows.map((q) => {
            const b = batchMap[q.batch_id];
            return (
              <div key={q.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${T.line}`, background: "#FAFBFD" }}>
                <AlertTriangle size={15} color={T.warning} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.hi }}>
                    Baris #{q.row_number} · {q.raw_row?.event_name || "(tanpa nama)"} {q.raw_row?.site_id ? `· ${q.raw_row.site_id}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A6200", marginTop: 2 }}>{q.reason}</div>
                  <div style={{ fontSize: 10.5, color: T.lo, marginTop: 3 }}>
                    {b ? `${b.filename || "-"} · sheet "${b.sheet_name || "-"}"` : ""} · {new Date(q.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => resolve(q.id)} disabled={busyId === q.id}
                    style={{ ...btnGhost, padding: "6px 12px", fontSize: 11.5 }}>
                    {busyId === q.id ? <Loader2 size={12} className="mh-spin" /> : <CheckCircle2 size={12} />} Selesai Dicek
                  </button>
                  <button onClick={() => deleteOne(q.id)} disabled={busyId === q.id}
                    title="Hapus permanen baris karantina ini"
                    style={{ ...btnGhost, padding: "6px 10px", fontSize: 11.5, color: T.error, borderColor: "#F3B8B8" }}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showBulkConfirm && (
        <div onClick={() => !bulkBusy && setShowBulkConfirm(false)} style={{ position: "fixed", inset: 0, background: "rgba(10,12,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "100%", background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 24px 64px rgba(13,17,23,0.22)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
              <AlertTriangle size={18} color={T.error} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 14.5, color: T.hi }}>Hapus {filteredRows.length} Baris Karantina</div>
                <div style={{ fontSize: 12, color: T.lo, marginTop: 3 }}>
                  {dateFilter ? `Semua baris karantina pada ${localDateLabel(filteredRows[0]?.created_at)}` : "Semua baris karantina yang belum dicek"} akan dihapus permanen. Data asal di file Excel TIDAK berubah - kalau masih diperlukan, cukup import ulang.
                </div>
              </div>
            </div>
            {bulkErr && <div style={{ fontSize: 12, color: T.error, marginBottom: 12, background: T.errorBg, padding: "8px 10px", borderRadius: 8 }}>{bulkErr}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowBulkConfirm(false)} disabled={bulkBusy} style={btnGhost}>Batal</button>
              <button onClick={deleteAllFiltered} disabled={bulkBusy}
                style={{ padding: "9px 16px", borderRadius: 9, border: "none", fontSize: 12.5, fontWeight: 700, background: T.error, color: "#fff", cursor: bulkBusy ? "default" : "pointer", opacity: bulkBusy ? 0.7 : 1 }}>
                {bulkBusy ? "Menghapus…" : `Ya, Hapus ${filteredRows.length} Baris`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes mh-spin{to{transform:rotate(360deg)}} .mh-spin{animation:mh-spin .8s linear infinite}`}</style>
    </div>
  );
}
