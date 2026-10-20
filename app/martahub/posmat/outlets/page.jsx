"use client";
// /martahub/posmat/outlets - Master Data "List Outlet POSM", KHUSUS fitur
// POSM (bukan reuse ao_outlets/Pendataan Outlet maupun mh_sites/List Site -
// keputusan user 2026-10: outlet whitelist + koordinat POSM harus sumber
// data sendiri). Dipakai alur baru Retailer Installment (rebuild dari 2
// foto flowchart, 2026-10):
//   - mobile: cari outlet lewat ID IM3 / ID 3ID / nama / kode (satu outlet
//     bisa punya KEDUA id brand sekaligus), lalu validasi radius GPS saat
//     submit laporan instalasi (di luar radius TETAP diterima & stok tetap
//     berkurang, tapi ditandai "submit di luar radius").
//   - RPC: mh_posm_outlets_upsert_batch (import/replace), mh_posm_outlets_search
//     & mh_posm_outlet_get (pencarian), mh_posm_get_radius/mh_posm_set_radius
//     (radius validasi, default 100m, disetel di halaman ini juga).
//
// Alur upload 3 tahap (SAMA POLA dgn Mapping Outlet POSM & List Site - parsing
// 100% di browser pakai SheetJS, tidak menyentuh DB sebelum tahap 3
// dikonfirmasi): (1) pilih file -> tampilkan grid RAW, user pilih baris
// header; (2) petakan kolom target (Outlet Code wajib, lainnya opsional,
// auto-tebak dari nama header tapi bisa diubah manual); (3) ringkasan +
// contoh baris, baru tekan "Import Sekarang". Upload MENGGANTI/meng-upsert
// baris dgn outlet_code yang sama (bukan replace total per periode, krn
// outlet_code adalah primary natural key - baris lama yang tidak ada di
// file baru TETAP aktif, bukan fitur ini).
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, ArrowLeft, Check, MapPin, Search, Settings2 } from "lucide-react";
import MartaShell, { T } from "../../components/MartaShell";
import { getMartaScope } from "../../../../lib/martaScope";
import {
  upsertPosmOutletsBatch, fetchPosmOutletsSummary, searchPosmOutlets, getPosmRadius, setPosmRadius,
} from "../../m/_shared/posmData";

const CAN_MANAGE_ROLES = ["head", "tmv", "spm_sumatera", "admin"];
const BATCH_SIZE = 1000;
const RAW_PREVIEW_ROWS = 12;
const PREVIEW_ROWS = 30;
const MAX_FILE_MB = 60;

// Field yang dipetakan & disimpan ke mh_posm_outlets. Outlet Code wajib
// (primary natural key utk upsert) - sisanya opsional supaya file apa pun
// (lengkap atau sebagian kolom saja) tetap bisa diimport.
const TARGET_FIELDS = [
  { key: "outlet_code", label: "Outlet Code", required: true, aliases: ["outlet code", "outlet_code", "kode outlet", "outlet id"] },
  { key: "outlet_id_im3", label: "ID Outlet IM3", required: false, aliases: ["id outlet im3", "outlet id im3", "im3 id", "id im3"] },
  { key: "outlet_id_3id", label: "ID Outlet 3ID", required: false, aliases: ["id outlet 3id", "outlet id 3id", "3id id", "id 3id", "id outlet tri"] },
  { key: "outlet_name", label: "Nama Outlet", required: false, aliases: ["outlet name", "nama outlet", "outlet_name"] },
  { key: "branch", label: "Branch", required: false, aliases: ["branch", "branch name", "branch_name"] },
  { key: "region", label: "Region", required: false, aliases: ["region", "region name"] },
  { key: "mc", label: "Micro Cluster (MC)", required: false, aliases: ["mc", "micro cluster", "micro_cluster_name"] },
  { key: "kecamatan", label: "Kecamatan", required: false, aliases: ["kecamatan", "kecamatan name"] },
  { key: "kabupaten", label: "Kabupaten", required: false, aliases: ["kabupaten", "kabupaten/kota", "kab/kota"] },
  { key: "latitude", label: "Latitude", required: false, aliases: ["latitude", "lat"] },
  { key: "longitude", label: "Longitude", required: false, aliases: ["longitude", "long", "lng"] },
];
const PREVIEW_COLS = ["outlet_code", "outlet_id_im3", "outlet_id_3id", "outlet_name", "branch", "mc", "latitude", "longitude"];

function norm(s) { return String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function slug(s) { return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function str(v) { return v == null ? null : (String(v).trim() || null); }
function num(v) { if (v == null || String(v).trim() === "") return null; const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; }
function currentYYYYMM() { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`; }

function guessMapping(columns) {
  const m = {};
  const used = new Set();
  for (const f of TARGET_FIELDS) {
    let best = "";
    for (const a of f.aliases) {
      const na = norm(a);
      const hit = columns.find((c) => !used.has(c) && norm(c) === na);
      if (hit) { best = hit; break; }
    }
    if (!best) {
      for (const a of f.aliases) {
        const na = norm(a);
        if (na.length < 3) continue;
        const hit = columns.find((c) => { if (used.has(c)) return false; const nc = norm(c); return nc.includes(na) || na.includes(nc); });
        if (hit) { best = hit; break; }
      }
    }
    m[f.key] = best;
    if (best) used.add(best);
  }
  return m;
}

async function readWorkbook(file) {
  const name = file?.name || "";
  if (!/\.(xlsx|xls|csv)$/i.test(name)) throw new Error("Format tidak didukung. Pakai .xlsx, .xls, atau .csv.");
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Berkas maksimal ${MAX_FILE_MB}MB.`);
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.SheetNames.find((s) => /outlet/i.test(s)) || wb.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null, blankrows: false });
  if (!matrix.length) throw new Error("Berkas tidak berisi data.");
  return { matrix };
}

function deriveTable(matrix, headerIdx) {
  const rawHeader = matrix[headerIdx] || [];
  const seen = {};
  const columns = rawHeader.map((c, i) => {
    let name = (c == null || String(c).trim() === "") ? `Kolom ${i + 1}` : String(c).trim();
    if (seen[name] != null) { seen[name] += 1; name = `${name} (${seen[name]})`; } else seen[name] = 0;
    return name;
  });
  const rows = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const arr = matrix[r] || [];
    const obj = {};
    let empty = true;
    for (let i = 0; i < columns.length; i++) {
      const v = arr[i] ?? null;
      obj[columns[i]] = v;
      if (v !== null && String(v).trim() !== "") empty = false;
    }
    if (!empty) rows.push(obj);
  }
  return { columns, rows };
}

function buildRows(rows, mapping) {
  const g = (r, key) => (mapping[key] ? r[mapping[key]] : null);
  const out = [];
  for (const r of rows) {
    const outlet_code = str(g(r, "outlet_code"));
    if (!outlet_code) continue;
    const branch = str(g(r, "branch"));
    out.push({
      outlet_code,
      outlet_id_im3: str(g(r, "outlet_id_im3")),
      outlet_id_3id: str(g(r, "outlet_id_3id")),
      outlet_name: str(g(r, "outlet_name")),
      branch_id: branch ? slug(branch) : null,
      branch_name: branch,
      region: str(g(r, "region")),
      mc: str(g(r, "mc")),
      kecamatan: str(g(r, "kecamatan")),
      kabupaten: str(g(r, "kabupaten")),
      latitude: num(g(r, "latitude")),
      longitude: num(g(r, "longitude")),
    });
  }
  return out;
}

export default function PosmOutletsPage() {
  return (
    <MartaShell active="master" title="List Outlet POSM" subtitle="Master data outlet whitelist khusus POSM - ID IM3/3ID, lokasi & koordinat.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const router = useRouter();
  const [scope, setScope] = useState(null);
  const [summary, setSummary] = useState(null);
  const [radius, setRadius] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showRadius, setShowRadius] = useState(false);

  useEffect(() => { if (email) getMartaScope(email).then(setScope); }, [email]);
  const canManage = CAN_MANAGE_ROLES.includes(scope?.role);

  const load = async () => {
    const [s, r] = await Promise.all([fetchPosmOutletsSummary().catch(() => null), getPosmRadius().catch(() => null)]);
    setSummary(Array.isArray(s) ? s[0] : s);
    setRadius(r);
  };
  useEffect(() => { load(); }, []);

  if (showUpload) {
    return <UploadWizard email={email} onClose={() => setShowUpload(false)} onImported={() => { setShowUpload(false); load(); }} />;
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <button onClick={() => router.push("/martahub/master")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.mid, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali ke Master Data
      </button>

      {!canManage && scope && <div style={{ ...note, marginBottom: 16 }}>Mode lihat saja - hanya Head TMV, Brand TMV, atau SPM Sumatera yang dapat mengubah data di sini.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ fontSize: 12.5, color: T.mid, marginBottom: 4 }}>Outlet Aktif</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.hi }}>{summary ? Number(summary.total_active || 0).toLocaleString() : "…"}</div>
          <div style={{ fontSize: 11.5, color: T.lo, marginTop: 4 }}>
            {summary?.branches ? `${summary.branches} branch` : "-"} {summary?.last_period ? `· terakhir upload periode ${summary.last_period}` : "· belum ada upload"}
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12.5, color: T.mid, marginBottom: 4 }}>Radius Validasi GPS</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: T.hi }}>{radius != null ? `${radius} m` : "…"}</div>
          <div style={{ fontSize: 11.5, color: T.lo, marginTop: 4 }}>Submit di luar radius ini tetap diterima & stok tetap berkurang, tapi ditandai "di luar radius".</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {canManage && <button onClick={() => setShowUpload(true)} style={pbtn}><Upload size={15} /> Upload List Outlet</button>}
        {canManage && <button onClick={() => setShowRadius(true)} style={btn}><Settings2 size={15} /> Atur Radius Validasi</button>}
      </div>

      <OutletSearchPanel />

      {showRadius && <RadiusModal email={email} current={radius} onClose={() => setShowRadius(false)} onSaved={(v) => { setRadius(v); setShowRadius(false); }} />}
    </div>
  );
}

function RadiusModal({ email, current, onClose, onSaved }) {
  const [value, setValue] = useState(current != null ? String(current) : "100");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) { setErr("Radius harus angka lebih besar dari 0."); return; }
    setSaving(true); setErr("");
    try {
      const r = await setPosmRadius(n, email);
      onSaved(r);
    } catch (e) { setErr(e.message || "Gagal menyimpan radius."); }
    finally { setSaving(false); }
  }

  return (
    <Modal onClose={onClose} title="Atur Radius Validasi GPS">
      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
      <div style={{ fontSize: 12.5, color: T.mid, marginBottom: 12, lineHeight: 1.5 }}>
        Saat BME/DSF submit laporan instalasi, jarak GPS ke koordinat outlet (dari List Outlet ini) dibandingkan dengan radius di bawah. Di dalam radius -&gt; status normal. Di luar radius -&gt; laporan TETAP diterima & stok TETAP berkurang, tapi ditandai "submit di luar radius" untuk ditinjau.
      </div>
      <Field label="Radius (meter) *">
        <input type="number" min="1" value={value} onChange={(e) => setValue(e.target.value)} style={inp} />
      </Field>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={btn}>Batal</button>
        <button onClick={save} disabled={saving} style={{ ...pbtn, ...(saving ? disabledPbtn : {}) }}>{saving ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </Modal>
  );
}

function OutletSearchPanel() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  function onChange(v) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!v.trim()) { setRows(null); return; }
      setLoading(true);
      try { setRows(await searchPosmOutlets(v.trim(), null, 50)); } catch { setRows([]); }
      finally { setLoading(false); }
    }, 350);
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 800, color: T.hi, marginBottom: 10 }}>Cari Outlet</div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={15} color={T.lo} style={{ position: "absolute", left: 10, top: 10 }} />
        <input value={q} onChange={(e) => onChange(e.target.value)} placeholder="Cari kode, ID IM3/3ID, atau nama outlet…" style={{ ...inp, paddingLeft: 32 }} />
      </div>
      {loading && <Spinner small label="Mencari…" />}
      {!loading && rows && rows.length === 0 && <div style={{ fontSize: 12.5, color: T.lo, padding: 10 }}>Tidak ditemukan.</div>}
      {!loading && rows && rows.length > 0 && (
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "auto", maxHeight: 360 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: "#F7F9FC", color: T.mid, position: "sticky", top: 0 }}>
              {["Outlet Code", "ID IM3", "ID 3ID", "Nama Outlet", "Branch", "Lat,Long"].map((h) => <th key={h} style={{ padding: "7px 10px", textAlign: "left" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "6px 10px", fontWeight: 700, color: T.hi }}>{r.outlet_code}</td>
                  <td style={{ padding: "6px 10px" }}>{r.outlet_id_im3 || "-"}</td>
                  <td style={{ padding: "6px 10px" }}>{r.outlet_id_3id || "-"}</td>
                  <td style={{ padding: "6px 10px" }}>{r.outlet_name || "-"}</td>
                  <td style={{ padding: "6px 10px", color: T.mid }}>{r.branch_name || "-"}</td>
                  <td style={{ padding: "6px 10px", color: T.lo }}>{r.latitude != null && r.longitude != null ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={11} />{r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</span>
                  ) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Wizard Upload (3 tahap: pilih header -> petakan kolom -> preview & import) ──
function UploadWizard({ email, onClose, onImported }) {
  const [step, setStep] = useState(1); // 1=file, 2=mapping, 3=preview
  const [fileName, setFileName] = useState("");
  const [matrix, setMatrix] = useState(null);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const table = useMemo(() => (matrix ? deriveTable(matrix, headerIdx) : null), [matrix, headerIdx]);
  const dbRows = useMemo(() => (table && mapping ? buildRows(table.rows, mapping) : []), [table, mapping]);
  const missingRequired = (TARGET_FIELDS.filter((f) => f.required && !mapping?.[f.key]));

  async function pickFile(f) {
    if (!f) return;
    setErr(""); setBusy(true); setFileName(f.name);
    try {
      const { matrix: m } = await readWorkbook(f);
      setMatrix(m);
      setHeaderIdx(0);
      setStep(1);
    } catch (e) { setErr(e.message || "Gagal membaca berkas."); setMatrix(null); }
    finally { setBusy(false); }
  }

  function toMapping() {
    const cols = deriveTable(matrix, headerIdx).columns;
    setMapping(guessMapping(cols));
    setStep(2);
  }

  async function doImport() {
    if (missingRequired.length) { setErr(`Kolom wajib belum dipetakan: ${missingRequired.map((f) => f.label).join(", ")}`); return; }
    if (!dbRows.length) { setErr("Tidak ada baris valid (Outlet Code wajib ada)."); return; }
    setBusy(true); setErr(""); setResult(null);
    try {
      const period = currentYYYYMM();
      let done = 0;
      for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
        const chunk = dbRows.slice(i, i + BATCH_SIZE);
        await upsertPosmOutletsBatch(chunk, period, email);
        done += chunk.length;
        setProgress(`Menyimpan ${done}/${dbRows.length} baris…`);
      }
      setResult({ rows: dbRows.length, period });
    } catch (e) { setErr(e.message || "Gagal mengimpor data."); }
    finally { setBusy(false); setProgress(""); }
  }

  if (result) {
    return (
      <div style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
        <CheckCircle2 size={40} color={T.success} style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 17, fontWeight: 800, color: T.hi, marginBottom: 6 }}>Import Berhasil</div>
        <div style={{ fontSize: 13, color: T.mid, marginBottom: 20 }}>{result.rows.toLocaleString()} baris outlet tersimpan (periode {result.period}).</div>
        <button onClick={onImported} style={pbtn}>Selesai</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <button onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.mid, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Batal, kembali
      </button>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.hi, marginBottom: 4 }}>Upload List Outlet POSM</div>
      <div style={{ fontSize: 12.5, color: T.mid, marginBottom: 16 }}>Tahap {step} dari 3 - {step === 1 ? "pilih berkas & baris header" : step === 2 ? "petakan kolom" : "periksa & import"}.</div>
      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}

      {step === 1 && (
        <div style={card}>
          {!matrix ? (
            <label style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, height: 160, border: `1.5px dashed ${T.line}`, borderRadius: 10, cursor: "pointer", background: "#F7F9FC" }}>
              {busy ? <Spinner label="Membaca berkas…" /> : (<>
                <Upload size={24} color={T.lo} />
                <span style={{ fontSize: 12.5, color: T.lo }}>Klik untuk pilih berkas (.xlsx, .xls, .csv - maks {MAX_FILE_MB}MB)</span>
              </>)}
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12.5, color: T.mid }}>
                <FileSpreadsheet size={15} /> {fileName} · {matrix.length} baris mentah
                <button onClick={() => { setMatrix(null); setFileName(""); }} style={{ ...linkBtn, marginLeft: "auto" }}>Ganti berkas</button>
              </div>
              <div style={{ fontSize: 12, color: T.mid, marginBottom: 6 }}>Klik baris yang berisi NAMA KOLOM (header):</div>
              <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "auto", maxHeight: 320 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                  <tbody>
                    {matrix.slice(0, RAW_PREVIEW_ROWS).map((row, ri) => (
                      <tr key={ri} onClick={() => setHeaderIdx(ri)} style={{ cursor: "pointer", background: ri === headerIdx ? "#FFF0F0" : (ri % 2 ? "#FAFBFC" : "#fff") }}>
                        <td style={{ padding: "5px 8px", borderRight: `1px solid ${T.line}`, color: T.lo, width: 28 }}>{ri === headerIdx ? <Check size={13} color={T.primary} /> : ri + 1}</td>
                        {(row || []).slice(0, 14).map((c, ci) => <td key={ci} style={{ padding: "5px 8px", borderRight: `1px solid ${T.line}`, whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{c == null ? "" : String(c)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={toMapping} style={pbtn}>Lanjut: Petakan Kolom</button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 2 && table && mapping && (
        <div style={card}>
          <div style={{ fontSize: 12, color: T.mid, marginBottom: 10 }}>Cocokkan kolom target dengan kolom di berkas kamu. Auto-tebak sudah dicoba - ubah manual kalau salah.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {TARGET_FIELDS.map((f) => (
              <Field key={f.key} label={f.label + (f.required ? " *" : "")}>
                <select value={mapping[f.key] || ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))} style={selectStyle}>
                  <option value="">— tidak dipetakan —</option>
                  {table.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            ))}
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => setStep(1)} style={btn}>Kembali</button>
            <button onClick={() => setStep(3)} disabled={missingRequired.length > 0} style={{ ...pbtn, ...(missingRequired.length ? disabledPbtn : {}) }}>Lanjut: Preview</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.hi, marginBottom: 4 }}>{dbRows.length.toLocaleString()} baris siap diimport</div>
          <div style={{ fontSize: 12, color: T.mid, marginBottom: 12 }}>Outlet dengan Outlet Code yang sudah ada akan DIPERBARUI (upsert); Outlet Code baru akan ditambahkan. Periode upload: {currentYYYYMM()}.</div>
          <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "auto", maxHeight: 340 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
              <thead><tr style={{ background: "#F7F9FC", color: T.mid, position: "sticky", top: 0 }}>
                {PREVIEW_COLS.map((c) => <th key={c} style={{ padding: "6px 9px", textAlign: "left" }}>{TARGET_FIELDS.find((f) => f.key === c)?.label || c}</th>)}
              </tr></thead>
              <tbody>
                {dbRows.slice(0, PREVIEW_ROWS).map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${T.line}` }}>
                    {PREVIEW_COLS.map((c) => <td key={c} style={{ padding: "5px 9px", whiteSpace: "nowrap" }}>{r[c] ?? "-"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={() => setStep(2)} disabled={busy} style={btn}>Kembali</button>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11.5, color: T.lo }}>{busy ? progress : ""}</span>
              <button onClick={doImport} disabled={busy} style={{ ...pbtn, ...(busy ? disabledPbtn : {}) }}>{busy ? <Loader2 size={14} style={{ animation: "mh-spin 1s linear infinite" }} /> : <Upload size={14} />} Import Sekarang</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner({ label, small }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.lo, fontSize: small ? 12 : 13, padding: small ? 6 : 20, justifyContent: "center" }}>
      <Loader2 size={small ? 14 : 18} style={{ animation: "mh-spin 1s linear infinite" }} /> {label}
      <style>{"@keyframes mh-spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}
function Field({ label, children }) { return <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, marginBottom: 5 }}>{label}</div>{children}</div>; }
function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,18,25,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 440, maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: T.hi, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

const card = { background: "#FFFFFF", border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13 };
const note = { background: "#FFFDE7", border: `1px solid #F0E3B0`, color: "#7a5b00", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5 };
const btn = { padding: "8px 14px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1 };
const GRAD = "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)";
const pbtn = { ...btn, background: GRAD, color: "#fff", border: "none", padding: "9px 16px" };
const disabledPbtn = { background: "#F1F2F5", color: T.lo, boxShadow: "none", cursor: "not-allowed" };
const linkBtn = { background: "none", border: "none", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 0 };
const inp = { padding: "8px 11px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, outline: "none", boxSizing: "border-box", width: "100%" };
const CHEV = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>";
const selectStyle = { ...inp, appearance: "none", backgroundImage: `url("${CHEV}")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center", paddingRight: 32, cursor: "pointer" };
