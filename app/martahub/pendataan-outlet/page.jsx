"use client";
/**
 * /martahub/pendataan-outlet — CMS Pendataan Outlet, 2 sub-tab (permintaan
 * user: "ada 2 sub menu untuk menampilkan datanya dan data outletnya"):
 *   1. Data Submission - hasil isian Mobile (sama seperti sebelumnya):
 *      search + filter tanggal, tabel submission, preview foto, download ZIP.
 *   2. Data Outlet - whitelist/master data outlet. Kolom yang disimpan:
 *      Region, Area, Branch, MC, Province, Kota/Kabupaten, Kecamatan, Desa,
 *      Outlet ID IM3, Outlet ID 3ID, Latitude, Longitude, DSE Name.
 *      Upload file TIDAK diasumsikan format kolomnya fix - setelah file
 *      dipilih, user melihat daftar header kolom dari Excel-nya & PAIRING
 *      sendiri tiap kolom ke field target (dropdown per kolom, auto-tebak
 *      dulu by nama header - user tinggal koreksi kalau meleset). Konsep
 *      yang sama dipakai-pun dengan "upload master data" lain di MartaHub
 *      (permintaan user: "nanti saya akan pairing kolomnya dari excel yang
 *      kita upload, konsepnya sama seperti upload master data"). Upload =
 *      REPLACE TOTAL (snapshot penuh, bukan delta) - lihat
 *      aoImportOutletMaster. Lookup ID Outlet di Mobile (ao_check_outlet)
 *      cocok ke ID IM3 ATAU ID 3ID.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronDown, ClipboardList, Download, Image as ImageIcon, Images, Link2, Loader2, Package, RefreshCw, Search, Store, Trash2, Upload, UploadCloud, X, XCircle } from "lucide-react";
import MartaShell, { T } from "../components/MartaShell";
import { readWorkbook, deriveTable } from "../../../lib/martaSiteImport";
import { passesRow, optionsFor, FilterTh, FilterMenu } from "../../dashboard/components/MFTS_TableFilter";
import {
  aoDeleteSubmissions, aoExportList, aoGetRadiusSetting, aoImportOutletMaster, aoListOutlets, aoListPhotos,
  aoListReferencePhotos, aoListSubmissions, aoPublicUrl, aoSetRadiusSetting,
  aoUpdateReferencePhotoLabel, aoUploadReferencePhoto,
} from "../../../lib/ao";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const BORDER = "#E4E2EA";
const MAX_OUTLET_ROWS = 1000; // batasi render tabel Data Outlet - export tetap full dari `filtered`

// Field target yang disimpan ke ao_outlets. Konsep pairing-nya SAMA PERSIS
// dgn "Upload Data Site" di Master Data (lihat lib/martaSiteImport.js +
// app/martahub/master/page.jsx) - preview mentah dulu, pilih baris header,
// baru cocokkan tiap kolom Excel ke field di sini (auto-tebak via "guesses",
// user tinggal koreksi kalau meleset). Beda dgn List Site: di sini Latitude
// & Longitude JUSTRU diimpor (permintaan user eksplisit), bukan dikecualikan.
const AO_TARGET_FIELDS = [
  { key: "region", label: "Region", guesses: ["region"] },
  { key: "area", label: "Area", guesses: ["area"] },
  { key: "branch", label: "Branch", guesses: ["branch"] },
  { key: "mc", label: "MC", guesses: ["mc", "micro cluster"] },
  { key: "province", label: "Province", guesses: ["province"] },
  { key: "city", label: "Kota/Kabupaten", guesses: ["city", "kota", "kabupaten", "kab/kota"] },
  { key: "district", label: "Kecamatan", guesses: ["district", "kecamatan"] },
  { key: "village", label: "Desa", guesses: ["village", "desa"] },
  { key: "outletIdIm3", label: "Outlet ID IM3", guesses: ["outlet id im3", "id im3"] },
  { key: "outletId3id", label: "Outlet ID 3ID", guesses: ["outlet id 3id", "id 3id"] },
  { key: "latitude", label: "Latitude", guesses: ["latitude", "lat"] },
  { key: "longitude", label: "Longitude", guesses: ["longitude", "long", "lng"] },
  { key: "dseName", label: "DS Name", guesses: ["ds name", "dse name"] },
  { key: "hoaName", label: "HOA Name", guesses: ["hoa name"] },
];

const _normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Auto-match "like" (pola sama dgn guessMapping di lib/martaSiteImport.js, tapi dgn field set outlet sendiri). */
function guessAoMapping(columns) {
  const m = {};
  const used = new Set();
  for (const f of AO_TARGET_FIELDS) {
    let best = "";
    for (const g of f.guesses) {
      const ng = _normKey(g);
      const hit = columns.find((c) => !used.has(c) && _normKey(c) === ng);
      if (hit) { best = hit; break; }
    }
    if (!best) {
      for (const g of f.guesses) {
        const ng = _normKey(g);
        if (ng.length < 3) continue;
        const hit = columns.find((c) => {
          if (used.has(c)) return false;
          const nc = _normKey(c);
          return nc.includes(ng) || ng.includes(nc);
        });
        if (hit) { best = hit; break; }
      }
    }
    m[f.key] = best;
    if (best) used.add(best);
  }
  return m;
}

/** Baris siap-impor dari tabel ter-parse + mapping kolom (key->nama kolom). */
function buildAoRows(tableRows, mapping) {
  return tableRows
    .map((row) => {
      const r = {};
      AO_TARGET_FIELDS.forEach((f) => { const col = mapping[f.key]; if (col) r[f.key] = row[col] ?? ""; });
      return r;
    })
    .filter((r) => String(r.outletIdIm3 ?? "").trim() || String(r.outletId3id ?? "").trim() || String(r.village ?? "").trim());
}

function Card({ children, style }) {
  return <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, ...style }}>{children}</div>;
}
function Btn({ children, onClick, disabled, variant = "primary", compact = false, ...rest }) {
  const base = { padding: compact ? "8px 12px" : "9px 16px", whiteSpace: "nowrap", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13, fontFamily: FONT, cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 7 };
  const styles = {
    primary: { background: disabled ? "#D8D6DF" : `linear-gradient(135deg, ${T.primary}, ${T.primaryD})`, color: "#fff" },
    ghost: { background: "#fff", color: T.hi, border: `1px solid ${BORDER}` },
    danger: { background: disabled ? "#D8D6DF" : "#DC2626", color: "#fff" },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...styles[variant] }} {...rest}>{children}</button>;
}

// Satu pilihan di menu "Export Data" (kartu dengan ikon, judul, penjelasan, badge).
function ExportOption({ icon, title, desc, badge, onClick }) {
  return (
    <button type="button" className="ao-exp-opt" onClick={onClick}>
      <span className="ao-exp-ico">{icon}</span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "left", whiteSpace: "normal" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: T.hi }}>{title}</span>
          <span className="ao-exp-badge">{badge}</span>
        </span>
        <span style={{ display: "block", fontSize: 12, color: T.lo, marginTop: 3, lineHeight: 1.45, fontWeight: 500, whiteSpace: "normal", overflowWrap: "anywhere" }}>{desc}</span>
      </span>
    </button>
  );
}

function TabBar({ tab, setTab }) {
  const tabs = [
    { key: "submission", label: "Data Submission", icon: <ClipboardList size={14} /> },
    { key: "outlet", label: "Data Outlet", icon: <Store size={14} /> },
    { key: "reference", label: "Foto Referensi", icon: <ImageIcon size={14} /> },
  ];
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${BORDER}` }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => setTab(t.key)}
          style={{
            display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", border: "none", background: "transparent",
            cursor: "pointer", fontFamily: FONT, fontSize: 13.5, fontWeight: 700,
            color: tab === t.key ? T.primary : T.lo,
            borderBottom: tab === t.key ? `2.5px solid ${T.primary}` : "2.5px solid transparent", marginBottom: -1,
          }}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  );
}

export default function PendataanOutletPage() {
  const [tab, setTab] = useState("submission");
  return (
    <MartaShell active="pendataan-outlet" title="Pendataan Outlet" subtitle="Submission dari Mobile & master data whitelist outlet.">
      {() => (
        <>
          <TabBar tab={tab} setTab={setTab} />
          {tab === "submission" && <SubmissionBody />}
          {tab === "outlet" && <OutletMasterBody />}
          {tab === "reference" && <ReferencePhotoBody />}
        </>
      )}
    </MartaShell>
  );
}

// ── Tab 1: Data Submission ──────────────────────────────────────────────────

// Kolom tabel Data Submission - hasil pendataan mobile + info outlet (via
// join ao_outlets di ao_list_submissions, matching 3 arah spt validasi
// submit: ID bisa IM3/3ID/id_outlet kanonik). Dibuat selaras CMS Result
// Download Template yg user berikan - field yg BELUM ada di form/DB
// (checkbox SP/Voucher, Availability Score, Completeness, Status) SENGAJA
// belum dimasukkan dulu (keputusan user: "tabel dulu pakai data existing").
const SUB_COLUMNS = [
  { key: "tanggal", label: "Tanggal" },
  { key: "jam", label: "Waktu" },
  { key: "nama_sender", label: "Nama Sender" },
  { key: "nama_outlet", label: "Nama Outlet" },
  { key: "outlet_id_im3", label: "ID Outlet IM3" },
  { key: "outlet_id_3id", label: "ID Outlet 3ID" },
  { key: "branch", label: "Branch" },
  { key: "district", label: "Kecamatan" },
  { key: "dse_name", label: "Nama DSE" },
  { key: "social_media", label: "Social Media" },
  { key: "foto_etalase_count", label: "Foto Etalase" },
  { key: "foto_tapak_count", label: "Foto Tampak" },
  // Availability (step baru di mobile - 4 checklist Ya/Tidak) + GPS - lihat
  // ao_list_submissions: availability_score/completeness/status dihitung
  // server-side persis definisi Download_Guide template.
  { key: "sp_im3", label: "Varian SP IM3" },
  { key: "sp_3id", label: "Varian SP 3ID" },
  { key: "voucher_im3", label: "Varian Voucher IM3" },
  { key: "voucher_3id", label: "Varian Voucher 3ID" },
  { key: "availability_score", label: "Availability Score" },
  { key: "completeness", label: "Completeness" },
  { key: "status", label: "Status" },
  { key: "latitude", label: "GPS Latitude" },
  { key: "longitude", label: "GPS Longitude" },
  // Jarak (meter, haversine) antara titik GPS saat sender ambil foto dgn
  // longlat outlet di master data (yg diupload admin lewat import
  // Outlet_Hybrid di CMS) - dihitung server-side di ao_list_submissions
  // (distance_to_outlet_m). NULL kalau GPS sender gagal atau outlet belum
  // punya longlat di master - ditampilkan "-" spt field kosong lainnya.
  { key: "distance_to_outlet_m", label: "Jarak ke Outlet (m)" },
  // 1/0 - apakah distance_to_outlet_m masih di dalam radius toleransi yg
  // di-set admin (lihat kontrol "Radius Toleransi" di atas tabel). NULL
  // kalau distance_to_outlet_m sendiri NULL (GPS/longlat outlet kosong).
  { key: "radius_score", label: "Radius Score" },
];
// Kolom yang bisa di-filter ala-Excel - yg kontinu/hampir unik per baris
// (tanggal/jam/jumlah foto/GPS/score) dikecualikan, dropdown filter jadi
// tidak berguna utk itu (sama alasan Lat/Long di Data Outlet).
const SUB_FCOLS = SUB_COLUMNS.filter((c) => !["foto_etalase_count", "foto_tapak_count", "availability_score", "latitude", "longitude", "distance_to_outlet_m", "radius_score"].includes(c.key)).map((c) => [c.key, c.label]);
const SUB_FT_T = { line: "#E4E2EA", hi: "#1A1A20", mid: "#4A5568", lo: "#767485", teal: "#ED1C24", tealBg: "#FFF0F0", card: "#FFFFFF", sub: "#F7F7FA" };

function SubmissionBody() {
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [zipping, setZipping] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Progress nyata utk Export .xlsx & Download ZIP: {kind, label, pct}
  const [job, setJob] = useState(null);
  // Menu pilihan Export Data (foto di dalam Excel / link foto saja)
  const [exportMenu, setExportMenu] = useState(false);
  const exportMenuRef = useRef(null);
  useEffect(() => {
    if (!exportMenu) return undefined;
    const onDown = (e) => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setExportMenu(false); };
    const onKey = (e) => { if (e.key === "Escape") setExportMenu(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [exportMenu]);
  const [preview, setPreview] = useState(null);
  const [previewPhotos, setPreviewPhotos] = useState([]);
  const [filters, setFilters] = useState({});
  const [openCol, setOpenCol] = useState("");
  const [rect, setRect] = useState(null);

  // Select-all + delete massal - Set berisi id submission yg dicentang.
  // Direset tiap kali hasil filter/search berubah (lihat useEffect bawah)
  // supaya gak ada centang "nyangkut" ke baris yg sudah gak kelihatan lagi
  // krn filter berubah.
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);

  // Radius toleransi (meter) utk "Radius Score" - setting bersama (bukan
  // per-browser) krn disimpan di DB (ao_settings), supaya semua admin CMS
  // lihat & pakai angka yg sama. radiusInput = draft yg lagi diketik admin
  // (belum tentu sudah disimpan) - dipisah dari radiusM (nilai AKTIF yg
  // dipakai server utk hitung radius_score di ao_list_submissions) supaya
  // mengetik tidak langsung keliatan "tersimpan" sebelum tombol Simpan diklik.
  const [radiusM, setRadiusM] = useState(null);
  const [radiusInput, setRadiusInput] = useState("");
  const [savingRadius, setSavingRadius] = useState(false);
  useEffect(() => {
    aoGetRadiusSetting().then((v) => { setRadiusM(v); setRadiusInput(String(v)); }).catch(() => {});
  }, []);
  const saveRadius = async () => {
    const n = Number(radiusInput);
    if (!n || n <= 0) { alert("Radius harus angka lebih besar dari 0."); return; }
    setSavingRadius(true);
    try {
      const saved = await aoSetRadiusSetting(n);
      setRadiusM(saved);
      setRadiusInput(String(saved));
      await load(); // radius_score di tabel yg sedang tampil harus ikut re-hitung
    } catch (e) {
      alert("Gagal menyimpan radius: " + (e.message || e));
    } finally { setSavingRadius(false); }
  };

  // Rentang tanggal tetap jadi filter SERVER (dataset submission relatif
  // kecil dibanding Data Outlet, jadi aman di-load penuh per rentang),
  // sisanya (search bebas + filter kolom ala-Excel) dihitung di client biar
  // bisa cascading & instant spt Data Outlet.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await aoListSubmissions({ dateFrom: dateFrom || null, dateTo: dateTo || null });
      setRawRows(list.map((s) => {
        const d = new Date(s.created_at);
        return {
          ...s,
          tanggal: d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }),
          jam: d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        };
      }));
    } finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const searched = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rawRows;
    return rawRows.filter((r) =>
      (r.nama_sender || "").toLowerCase().includes(s)
      || (r.nama_outlet || "").toLowerCase().includes(s)
      || (r.id_outlet || "").toLowerCase().includes(s)
      || (r.dse_name || "").toLowerCase().includes(s));
  }, [rawRows, search]);

  const filtered = useMemo(() => searched.filter((r) => passesRow(r, filters, SUB_FCOLS, null)), [searched, filters]);
  const anyFilter = SUB_FCOLS.some(([k]) => (filters[k] || []).length);

  // Reset centang begitu daftar yg tampil berubah (search/filter baru,
  // atau reload) - centang yg "nyangkut" ke baris yg sudah gak kelihatan
  // (tersaring keluar) bikin delete massal ngehapus baris yg gak keliatan
  // user, bahaya.
  useEffect(() => { setSelected(new Set()); }, [filtered.length === 0 ? "empty" : filtered.map((r) => r.id).join(",")]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(filtered.map((r) => r.id)));
  };
  const toggleSelectOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Konfirmasi hapus: tombol "Hapus" di toolbar HANYA membuka dialog konfirmasi
  // (tidak langsung menghapus). Kalau yg dihapus banyak / semua baris yg tampil,
  // user wajib mengetik "HAPUS" dulu supaya tidak terhapus tanpa sengaja.
  const [delConfirm, setDelConfirm] = useState(null); // null | { ids, requireType }
  const [delText, setDelText] = useState("");
  const deleteSelected = () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setDelText("");
    setDelConfirm({ ids, requireType: allSelected || ids.length >= 10 });
  };
  const closeDelConfirm = () => { if (!deleting) setDelConfirm(null); };
  const confirmDelete = async () => {
    if (!delConfirm || deleting) return;
    if (delConfirm.requireType && delText.trim().toUpperCase() !== "HAPUS") return;
    setDeleting(true);
    try {
      await aoDeleteSubmissions(delConfirm.ids);
      setSelected(new Set());
      setDelConfirm(null);
      await load();
    } catch (e) {
      alert("Gagal menghapus submission: " + (e.message || e));
    } finally {
      setDeleting(false);
    }
  };
  useEffect(() => {
    if (!delConfirm) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !deleting) setDelConfirm(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [delConfirm, deleting]);

  const uniq = (rows, k) => new Set(rows.map((r) => String(r[k] ?? "").trim()).filter(Boolean)).size;
  const sumCount = (rows, k) => rows.reduce((n, r) => n + Number(r[k] || 0), 0);
  const stats = useMemo(() => {
    const complete = filtered.filter((r) => r.completeness === "Complete").length;
    const avgScore = filtered.length ? (sumCount(filtered, "availability_score") / filtered.length) : 0;
    return [
      ["Submission", filtered.length, "Jumlah Submission"],
      ["Outlet", uniq(filtered, "id_outlet"), "Unique ID Outlet"],
      ["Sender", uniq(filtered, "nama_sender"), "Unique Nama Sender"],
      ["Branch", uniq(filtered, "branch"), "Unique Branch"],
      ["Kecamatan", uniq(filtered, "district"), "Unique Kecamatan"],
      ["DSE", uniq(filtered, "dse_name"), "Unique Nama DSE"],
      ["Foto Etalase", sumCount(filtered, "foto_etalase_count"), "Total Foto Etalase"],
      ["Foto Tampak", sumCount(filtered, "foto_tapak_count"), "Total Foto Tampak Depan"],
      ["Complete", complete, "Submission Complete"],
      ["Avg Score", avgScore.toFixed(1), "Rata-rata Availability Score (dari 4)"],
    ];
  }, [filtered]);

  const openPreview = async (row) => {
    setPreview(row); setPreviewPhotos([]);
    setPreviewPhotos(await aoListPhotos(row.id));
  };

  const downloadZip = async () => {
    setZipping(true);
    setJob({ kind: "zip", label: "Menyiapkan daftar foto...", pct: 0 });
    try {
      const list = await aoExportList({ dateFrom: dateFrom || null, dateTo: dateTo || null });
      if (!list.length) { alert("Tidak ada foto pada rentang tanggal ini."); return; }
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      // 0-80% = mengunduh foto (per file yg selesai), 80-100% = mengompres ZIP.
      let done = 0;
      setJob({ kind: "zip", label: `Mengunduh foto 0/${list.length}`, pct: 0 });
      await Promise.all(list.map(async (item) => {
        const res = await fetch(item.url);
        const blob = await res.blob();
        zip.file(item.filename, blob);
        done++;
        setJob({ kind: "zip", label: `Mengunduh foto ${done}/${list.length}`, pct: Math.round((done / list.length) * 80) });
      }));
      setJob({ kind: "zip", label: "Mengompres ZIP...", pct: 80 });
      let lastPct = -1;
      const blob = await zip.generateAsync({ type: "blob" }, (m) => {
        const pct = 80 + Math.round(m.percent * 0.2);
        if (pct !== lastPct) { lastPct = pct; setJob({ kind: "zip", label: "Mengompres ZIP...", pct }); }
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const tag = dateFrom || dateTo ? `_${dateFrom || "awal"}_${dateTo || "akhir"}` : "";
      a.download = `Foto Etalase dan Tampak Depan Outlet${tag}.zip`;
      a.click();
    } catch {
      alert("Gagal membuat file ZIP.");
    } finally { setZipping(false); setJob(null); }
  };

  // Export .xlsx - kolomnya mengikuti "Result Download" di template CMS yg
  // user berikan (URL foto per slot, bukan cuma jumlah foto, krn sheet yg
  // didownload dipakai sbg arsip/bukti, bukan cuma ringkasan tabel).
  // Kolom teks biasa (bukan foto) - urutan HARUS sinkron dgn PHOTO_COLS di
  // bawah (disisipkan di antara "Nama DSE" & "Social Media", persis posisi
  // 4 kolom foto yg lama).
  const TEXT_COLS_BEFORE_PHOTO = [
    ["Submission ID", (r) => r.id],
    ["Tanggal", (r) => r.tanggal],
    ["Waktu", (r) => r.jam],
    ["Nama Sender", (r) => r.nama_sender || ""],
    ["Nama Outlet", (r) => r.nama_outlet || ""],
    ["ID Outlet IM3", (r) => r.outlet_id_im3 || ""],
    ["ID Outlet 3ID", (r) => r.outlet_id_3id || ""],
    ["Branch", (r) => r.branch || ""],
    ["Kecamatan", (r) => r.district || ""],
    ["Nama DSE", (r) => r.dse_name || ""],
  ];
  const TEXT_COLS_AFTER_PHOTO = [
    ["Social Media", (r) => r.social_media || ""],
    ["Varian SP IM3", (r) => r.sp_im3 || ""],
    ["Varian SP 3ID", (r) => r.sp_3id || ""],
    ["Varian Voucher IM3", (r) => r.voucher_im3 || ""],
    ["Varian Voucher 3ID", (r) => r.voucher_3id || ""],
    ["Availability Score", (r) => r.availability_score ?? ""],
    ["Completeness", (r) => r.completeness || ""],
    ["Status", (r) => r.status || ""],
    ["GPS Latitude", (r) => r.latitude ?? ""],
    ["GPS Longitude", (r) => r.longitude ?? ""],
    ["Jarak ke Outlet (m)", (r) => (r.distance_to_outlet_m == null ? "" : Math.round(r.distance_to_outlet_m))],
    ["Radius Score", (r) => (r.radius_score == null ? "" : r.radius_score)],
    ["Submitted At", (r) => r.created_at],
  ];
  // 4 kolom foto - sekarang bener2 nampilin GAMBARnya langsung di cell
  // (bukan URL text lagi), supaya CMS-nya bisa dibuka & di-scroll sbg
  // "album foto" per outlet tanpa perlu klik tiap link satu2 - diminta
  // user krn tabel .xlsx yg lama cuma berisi link mentah.
  const PHOTO_COLS = [
    ["Foto Etalase 1", (r) => (r.photos || []).find((p) => p.jenis === "etalase" && p.urutan === 1)],
    ["Foto Etalase 2", (r) => (r.photos || []).find((p) => p.jenis === "etalase" && p.urutan === 2)],
    ["Foto Etalase 3", (r) => (r.photos || []).find((p) => p.jenis === "etalase" && p.urutan === 3)],
    ["Foto Tampak Depan", (r) => (r.photos || []).find((p) => p.jenis === "tapak_depan")],
  ];
  const PHOTO_CELL_PX = 110; // sisi kotak thumbnail (persegi) di dalam cell
  const PHOTO_ROW_PT = 86;   // tinggi baris (point) - kira2 pas utk thumbnail 110px

  // withPhotos=true  -> foto disematkan sbg gambar di dalam cell (lengkap, lebih lambat & file besar)
  // withPhotos=false -> kolom foto berisi hyperlink "Lihat foto" saja (cepat & file ringan)
  const exportXlsx = useCallback(async (withPhotos = true) => {
    setExportMenu(false);
    setExporting(true);
    setJob({ kind: "xlsx", label: "Menyiapkan file...", pct: 0 });
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Data Submission");

      const headers = [
        ...TEXT_COLS_BEFORE_PHOTO.map(([label]) => label),
        ...PHOTO_COLS.map(([label]) => label),
        ...TEXT_COLS_AFTER_PHOTO.map(([label]) => label),
      ];
      ws.addRow(headers).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.columns = headers.map((h) => ({
        width: PHOTO_COLS.some(([label]) => label === h) ? (withPhotos ? 18 : 16) : Math.max(12, Math.min(28, h.length + 4)),
      }));

      // Isi baris teks dulu (foto disisipkan belakangan per baris, setelah
      // byte-nya selesai di-fetch) - index kolom foto (0-based) dihitung
      // dari posisi TEXT_COLS_BEFORE_PHOTO.
      const photoColStart = TEXT_COLS_BEFORE_PHOTO.length; // 0-based index kolom foto pertama

      for (let i = 0; i < filtered.length; i++) {
        const r = filtered[i];
        const rowVals = [
          ...TEXT_COLS_BEFORE_PHOTO.map(([, get]) => get(r)),
          ...PHOTO_COLS.map(() => ""), // placeholder - diisi gambar, bukan teks
          ...TEXT_COLS_AFTER_PHOTO.map(([, get]) => get(r)),
        ];
        const row = ws.addRow(rowVals);
        if (withPhotos) row.height = PHOTO_ROW_PT;
        const rowNumber = row.number; // 1-based (header = baris 1)

        if (!withPhotos) {
          // Mode link: tidak ada fetch foto sama sekali - cukup hyperlink ke URL publik.
          PHOTO_COLS.forEach(([, getPhoto], colOffset) => {
            const p = getPhoto(r);
            if (!p) return;
            const url = aoPublicUrl(p.storage_path);
            if (!url) return;
            const cell = row.getCell(photoColStart + colOffset + 1);
            cell.value = { text: "Lihat foto", hyperlink: url };
            cell.font = { color: { argb: "FF1D4ED8" }, underline: true };
            cell.alignment = { vertical: "middle" };
          });
        } else
        // Download + tempel tiap foto yg ada di baris ini secara paralel.
        await Promise.all(PHOTO_COLS.map(async ([, getPhoto], colOffset) => {
          const p = getPhoto(r);
          if (!p) return;
          const url = aoPublicUrl(p.storage_path);
          if (!url) return;
          try {
            const res = await fetch(url);
            if (!res.ok) return;
            const buf = await res.arrayBuffer();
            const ext = /\.png($|\?)/i.test(p.storage_path) ? "png" : "jpeg";
            const imageId = wb.addImage({ buffer: buf, extension: ext });
            const col0 = photoColStart + colOffset; // 0-based kolom
            ws.addImage(imageId, {
              tl: { col: col0 + 0.06, row: (rowNumber - 1) + 0.06 },
              ext: { width: PHOTO_CELL_PX, height: PHOTO_CELL_PX },
              editAs: "oneCell",
            });
          } catch { /* 1 foto gagal di-fetch jangan sampai gagalkan export semua baris */ }
        }));
        // 0-95% = memproses baris + foto, 95-100% = menyusun file .xlsx
        setJob({ kind: "xlsx", label: `Memproses baris ${i + 1}/${filtered.length}`, pct: Math.round(((i + 1) / filtered.length) * 95) });
      }

      setJob({ kind: "xlsx", label: "Menyusun file .xlsx...", pct: 95 });
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `MartaHub_DataSubmission${withPhotos ? "" : "_LinkFoto"}_${stamp}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); setJob(null); }
  }, [filtered]);

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
      <style>{`
        .ao-tb-wrap { container-type: inline-size; }
        .ao-toolbar { padding: 12px 16px; border-bottom: 1px solid ${BORDER}; display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; }
        @container (max-width: 960px) { .ao-toolbar { flex-wrap: wrap; } }
        .ao-pill { display: flex; align-items: center; gap: 6px; padding: 0 10px; height: 38px; border-radius: 10px; border: 1px solid ${BORDER}; background: #fff; box-sizing: border-box; }
        .ao-pill:focus-within { border-color: ${T.primary}; box-shadow: 0 0 0 3px ${T.primaryBg}; }
        .ao-pill input { border: none; outline: none; background: transparent; font-size: 12.5px; font-family: ${FONT}; color: ${T.hi}; min-width: 0; }
        .ao-exp-menu { position: absolute; right: 0; top: calc(100% + 8px); width: 340px; z-index: 60; background: #fff; border: 1px solid ${BORDER}; border-radius: 14px; box-shadow: 0 18px 44px rgba(20,16,40,.16), 0 2px 8px rgba(20,16,40,.06); padding: 8px; animation: aoPop .14s ease-out; }
        @keyframes aoPop { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
        .ao-exp-opt { width: 100%; display: flex; gap: 12px; align-items: flex-start; padding: 11px 12px; border: 1px solid transparent; background: transparent; border-radius: 11px; cursor: pointer; font-family: ${FONT}; transition: background .12s, border-color .12s; white-space: normal; text-align: left; box-sizing: border-box; overflow: hidden; }
        .ao-exp-opt:hover { background: #F7F7FA; border-color: ${BORDER}; }
        .ao-exp-ico { width: 36px; height: 36px; flex: none; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: ${T.primaryBg}; color: ${T.primary}; }
        .ao-exp-badge { font-size: 10px; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; padding: 2px 7px; border-radius: 99px; background: #F7F7FA; color: ${T.mid}; border: 1px solid ${BORDER}; }
      `}</style>
      <div className="ao-tb-wrap">
      <div className="ao-toolbar">
        <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", marginRight: 2 }}>Data Submission</div>
        <div className="ao-pill" style={{ flex: "1 1 110px", minWidth: 96, maxWidth: 220 }}>
          <Search size={14} color={T.lo} style={{ flex: "none" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari outlet / sender..." style={{ width: "100%" }} />
        </div>
        <div className="ao-pill" style={{ flex: "none", padding: "0 6px" }}>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: 114 }} aria-label="Dari tanggal" />
          <span style={{ color: T.lo, fontSize: 11.5 }}>s/d</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: 114 }} aria-label="Sampai tanggal" />
        </div>
        {anyFilter && <button onClick={() => setFilters({})} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.primary, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>Hapus filter</button>}

        {/* Setting radius toleransi "Radius Score" - disimpan di DB
            (ao_settings) jadi berlaku global utk semua admin, bukan cuma
            browser ini. radiusInput cuma draft; radius_score di tabel baru
            ikut berubah setelah tombol Simpan diklik (load() dipanggil
            ulang supaya ao_list_submissions re-hitung pakai radius baru). */}
        <div className="ao-pill" style={{ flex: "none", background: "#F7F7FA", paddingRight: 5 }} title="Radius Toleransi (meter) utk Radius Score">
          <span style={{ fontSize: 11.5, color: T.lo, fontWeight: 700, whiteSpace: "nowrap" }}>Radius</span>
          <input type="number" min={1} value={radiusInput} onChange={(e) => setRadiusInput(e.target.value)} style={{ width: 44, fontWeight: 700 }} />
          <span style={{ fontSize: 11.5, color: T.lo }}>m</span>
          <button
            onClick={saveRadius}
            disabled={savingRadius || Number(radiusInput) === radiusM}
            style={{
              border: "none", borderRadius: 7, padding: "5px 9px", fontSize: 11.5, fontWeight: 800, fontFamily: FONT,
              cursor: savingRadius || Number(radiusInput) === radiusM ? "default" : "pointer",
              background: Number(radiusInput) === radiusM ? BORDER : T.primary, color: Number(radiusInput) === radiusM ? T.lo : "#fff",
            }}
          >
            {savingRadius ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : "Simpan"}
          </button>
        </div>

        {loading && (
          <span style={{ fontSize: 11.5, color: T.primary, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Memuat...
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flex: "none" }}>
          {selected.size > 0 && (
            <Btn compact variant="danger" onClick={deleteSelected} disabled={deleting}>
              {deleting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />} Hapus ({selected.size})
            </Btn>
          )}
          <Btn compact variant="ghost" onClick={load} title="Muat ulang" aria-label="Muat ulang"><RefreshCw size={13} /></Btn>

          {/* Export Data - pilih: foto di dalam Excel atau cukup link foto */}
          <div ref={exportMenuRef} style={{ position: "relative" }}>
            <Btn compact variant="ghost" onClick={() => setExportMenu((v) => !v)} disabled={filtered.length === 0 || exporting} aria-haspopup="menu" aria-expanded={exportMenu}>
              {exporting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={14} />}
              Export Data{exporting && job?.kind === "xlsx" ? ` ${job.pct}%` : ""}
              {!exporting && <ChevronDown size={13} style={{ transition: "transform .15s", transform: exportMenu ? "rotate(180deg)" : "none" }} />}
            </Btn>
            {exportMenu && (
              <div className="ao-exp-menu" role="menu">
                <div style={{ padding: "6px 10px 8px", fontSize: 11, fontWeight: 800, color: T.lo, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Export {filtered.length.toLocaleString("id-ID")} baris ke .xlsx
                </div>
                <ExportOption
                  icon={<Images size={18} />} badge="Lengkap" title="Dengan foto di Excel"
                  desc="Foto ditampilkan langsung di dalam cell. Proses lebih lama dan ukuran file lebih besar."
                  onClick={() => exportXlsx(true)}
                />
                <ExportOption
                  icon={<Link2 size={18} />} badge="Cepat" title="Link foto saja"
                  desc="Kolom foto berisi link yang bisa diklik. Proses cepat dan file ringan."
                  onClick={() => exportXlsx(false)}
                />
              </div>
            )}
          </div>

          <Btn compact onClick={downloadZip} disabled={zipping}>
            {zipping ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Package size={14} />}
            Download Foto (ZIP){zipping && job?.kind === "zip" ? ` ${job.pct}%` : ""}
          </Btn>
        </div>
      </div>
      </div>

      {/* Bar progress nyata utk Export .xlsx / Download ZIP */}
      {job && (
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${BORDER}`, background: T.sub }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: T.mid, marginBottom: 6 }}>
            <span>{job.kind === "zip" ? "Download Foto (ZIP)" : "Export Data"} - {job.label}</span>
            <span>{job.pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: BORDER, overflow: "hidden" }}>
            <div style={{ width: `${job.pct}%`, height: "100%", background: T.primary, transition: "width .2s" }} />
          </div>
        </div>
      )}

      {/* Ringkasan unique value per kolom (mengikuti filter + search aktif) */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 1, background: BORDER, borderBottom: `1px solid ${BORDER}` }}>
        {stats.map(([label, val, full]) => (
          <div key={label} style={{ background: "#fff", padding: "12px 6px", textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: loading ? T.lo : T.hi, lineHeight: 1, whiteSpace: "nowrap" }}>
              {loading ? "..." : (Number.isInteger(Number(val)) ? Number(val || 0).toLocaleString("id-ID") : String(val))}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.lo, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={full || label}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ overflow: "auto", maxHeight: 560 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ background: "#F7F9FC", color: T.lo }}>
              <th style={{ padding: "9px 10px", width: 1, textAlign: "center", verticalAlign: "middle" }}>
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                  style={{ display: "block", margin: "0 auto", width: 15, height: 15, cursor: "pointer" }} aria-label="Pilih semua" />
              </th>
              {SUB_COLUMNS.map((c) => (
                SUB_FCOLS.some(([k]) => k === c.key) ? (
                  <FilterTh key={c.key} t={SUB_FT_T} label={c.label} colKey={c.key} filters={filters}
                    onOpen={(ck, r) => { setRect(r); setOpenCol(ck); }} />
                ) : (
                  <th key={c.key} style={{ padding: "9px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.label}</th>
                )
              ))}
              <th style={{ padding: "9px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={SUB_COLUMNS.length + 2} style={{ padding: 34, textAlign: "center", color: T.lo }}>
                <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={SUB_COLUMNS.length + 2} style={{ padding: 34, textAlign: "center", color: T.lo, fontSize: 13 }}>
                {rawRows.length === 0 ? "Belum ada submission." : "Tidak ada data yang cocok filter/pencarian."}
              </td></tr>
            )}
            {!loading && filtered.map((s) => (
              <tr key={s.id} style={{ borderTop: `1px solid ${BORDER}`, background: selected.has(s.id) ? "#FEF2F2" : undefined }}>
                <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle" }}>
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelectOne(s.id)}
                    style={{ display: "block", margin: "0 auto", width: 15, height: 15, cursor: "pointer" }} aria-label={`Pilih ${s.nama_outlet || s.id_outlet || ""}`} />
                </td>
                {SUB_COLUMNS.map((c) => {
                  const v = s[c.key];
                  const mono = c.key === "outlet_id_im3" || c.key === "outlet_id_3id";
                  // Sebelumnya boolean Ya/Tidak - sekarang slab jumlah varian (text:
                  // "0-1"/"2-4"/"5++" utk SP, "0-2"/"3-5"/"6++" utk Voucher).
                  // Skor per slab dihitung server-side (lihat kolom
                  // availability_score), di sini cuma tampilkan slab apa
                  // adanya sbg badge netral.
                  const isSlab = ["sp_im3", "sp_3id", "voucher_im3", "voucher_3id"].includes(c.key);
                  let display = v == null || v === "" ? "-" : String(v);
                  let color = T.mid;
                  if (isSlab && v != null) { color = T.primary; }
                  if (c.key === "status") color = v === "Submitted" ? "#16A34A" : "#C2760C";
                  if (c.key === "completeness") color = v === "Complete" ? "#16A34A" : "#C2760C";
                  // Jarak ke outlet - tandai merah+bold kalau jauh (>200m,
                  // indikasi foto diambil bukan di lokasi outlet), hijau
                  // kalau dekat (<=50m), abu2 biasa kalau di antaranya.
                  if (c.key === "distance_to_outlet_m" && v != null) {
                    display = `${Math.round(v).toLocaleString("id-ID")} m`;
                    color = v > 200 ? "#DC2626" : v <= 50 ? "#16A34A" : T.mid;
                  }
                  if (c.key === "radius_score" && v != null) {
                    display = v === 1 ? "Dalam Radius" : "Di Luar Radius";
                    color = v === 1 ? "#16A34A" : "#DC2626";
                  }
                  return <td key={c.key} style={{ padding: "8px 12px", color, fontFamily: mono ? "monospace" : undefined, fontWeight: isSlab || c.key === "status" || c.key === "completeness" || c.key === "radius_score" ? 700 : undefined }}>{display}</td>;
                })}
                <td style={{ padding: "8px 12px" }}>
                  <Btn variant="ghost" onClick={() => openPreview(s)}>Lihat</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {delConfirm && (() => {
        const n = delConfirm.ids.length;
        const idSet = new Set(delConfirm.ids);
        const sample = rawRows.filter((r) => idSet.has(r.id)).slice(0, 5);
        const canDelete = !delConfirm.requireType || delText.trim().toUpperCase() === "HAPUS";
        return (
          <div onClick={closeDelConfirm} style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="ao-del-title"
              style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, boxShadow: "0 24px 60px rgba(20,16,40,.28)", overflow: "hidden", fontFamily: FONT }}>
              <div style={{ padding: "20px 22px 4px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 40, height: 40, flex: "none", borderRadius: 12, background: "#FEE2E2", color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Trash2 size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div id="ao-del-title" style={{ fontWeight: 800, fontSize: 16, color: T.hi }}>
                    Hapus {n.toLocaleString("id-ID")} submission{allSelected ? " (semua yang tampil)" : ""}?
                  </div>
                  <div style={{ fontSize: 13, color: T.mid, marginTop: 4, lineHeight: 1.5 }}>
                    Data submission beserta <b>semua fotonya</b> akan terhapus permanen dari database dan storage. Tindakan ini <b>tidak bisa dibatalkan</b>.
                  </div>
                </div>
              </div>
              {sample.length > 0 && (
                <div style={{ margin: "14px 22px 0", border: `1px solid ${BORDER}`, borderRadius: 10, background: "#F7F7FA", padding: "8px 12px" }}>
                  {sample.map((r) => (
                    <div key={r.id} style={{ fontSize: 12.5, color: T.mid, padding: "3px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <b style={{ color: T.hi }}>{r.nama_outlet || "-"}</b> · {r.id_outlet || "-"} · {r.tanggal}
                    </div>
                  ))}
                  {n > sample.length && <div style={{ fontSize: 12, color: T.lo, padding: "3px 0", fontWeight: 700 }}>+ {(n - sample.length).toLocaleString("id-ID")} lainnya</div>}
                </div>
              )}
              {delConfirm.requireType && (
                <div style={{ padding: "14px 22px 0" }}>
                  <label style={{ display: "block", fontSize: 12.5, color: T.mid, marginBottom: 6 }}>
                    Ketik <b style={{ color: "#DC2626", letterSpacing: ".04em" }}>HAPUS</b> untuk melanjutkan
                  </label>
                  <input autoFocus value={delText} onChange={(e) => setDelText(e.target.value)} disabled={deleting}
                    onKeyDown={(e) => { if (e.key === "Enter") confirmDelete(); }}
                    placeholder="HAPUS" autoComplete="off" spellCheck={false}
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${canDelete ? "#DC2626" : BORDER}`, fontSize: 14, fontWeight: 700, letterSpacing: ".06em", fontFamily: FONT, outline: "none" }} />
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "18px 22px 20px" }}>
                <Btn variant="ghost" onClick={closeDelConfirm} disabled={deleting}>Batal</Btn>
                <Btn variant="danger" onClick={confirmDelete} disabled={!canDelete || deleting}>
                  {deleting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />}
                  {deleting ? "Menghapus..." : `Hapus ${n.toLocaleString("id-ID")} Submission`}
                </Btn>
              </div>
            </div>
          </div>
        );
      })()}

      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 20, maxWidth: 520, width: "100%", maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{preview.nama_outlet}</div>
                <div style={{ fontSize: 12, color: T.lo }}>{preview.id_outlet} · {preview.nama_sender}</div>
                {(preview.branch || preview.district || preview.dse_name) && (
                  <div style={{ fontSize: 11.5, color: T.lo, marginTop: 2 }}>{[preview.branch, preview.district, preview.dse_name].filter(Boolean).join(" · ")}</div>
                )}
              </div>
              <button onClick={() => setPreview(null)} style={{ border: "none", background: "transparent", cursor: "pointer" }}><X size={18} /></button>
            </div>
            {preview.social_media && <div style={{ fontSize: 12.5, marginBottom: 10 }}>Social Media: {preview.social_media}</div>}
            {previewPhotos.length === 0 ? (
              <div style={{ color: T.lo, fontSize: 13 }}>Memuat foto...</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {previewPhotos.map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.jenis} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 9, border: `1px solid ${BORDER}` }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {openCol && (
        <FilterMenu t={SUB_FT_T} rect={rect} label={SUB_COLUMNS.find((c) => c.key === openCol)?.label || openCol}
          options={optionsFor(searched, filters, SUB_FCOLS, openCol)} selected={filters[openCol] || []}
          onChange={(vals) => setFilters((f) => ({ ...f, [openCol]: vals }))} onClose={() => setOpenCol("")} />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Tab 2: Data Outlet (master whitelist) ───────────────────────────────────

// Kolom tabel Data Outlet - cocok dgn field yang dipetakan user di pairing
// (AO_TARGET_FIELDS), BUKAN cuma 6 kolom seperti sebelumnya.
const OUTLET_COLUMNS = [
  { key: "region", label: "Region" },
  { key: "branch", label: "Branch" },
  { key: "mc", label: "MC" },
  { key: "province", label: "Province" },
  { key: "city", label: "Kota/Kabupaten" },
  { key: "district", label: "Kecamatan" },
  { key: "village", label: "Desa" },
  { key: "outlet_id_im3", label: "Outlet ID IM3" },
  { key: "outlet_id_3id", label: "Outlet ID 3ID" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
  { key: "dse_name", label: "DS Name" },
  { key: "hoa_name", label: "HOA Name" },
];
// Kolom yang bisa di-filter ala-Excel (FilterTh/FilterMenu) - Lat/Long
// dikecualikan krn nilainya hampir selalu unik per baris (filter dropdown
// jadi tidak berguna utk kolom kontinu seperti itu).
const AO_FCOLS = OUTLET_COLUMNS.filter((c) => c.key !== "latitude" && c.key !== "longitude").map((c) => [c.key, c.label]);
const AO_FT_T = { line: "#E4E2EA", hi: "#1A1A20", mid: "#4A5568", lo: "#767485", teal: "#ED1C24", tealBg: "#FFF0F0", card: "#FFFFFF", sub: "#F7F7FA" };

function OutletMasterBody() {
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({});
  const [openCol, setOpenCol] = useState("");
  const [rect, setRect] = useState(null);

  // Muat SEMUA baris (bisa belasan ribu) secara bertahap ke browser - sama
  // pola dgn SitesBrowser di Master Data - supaya filter ala-Excel & summary
  // unique-value bisa dihitung di client, bukan cuma 1 halaman server saja.
  const load = useCallback(async () => {
    setLoading(true); setLoaded(0);
    try {
      const PAGE = 1000;
      const seen = new Set();
      let all = [];
      for (let off = 0; off < 200000; off += PAGE) {
        const list = await aoListOutlets({ limit: PAGE, offset: off });
        // Dedupe by id - jaga2 kalau ordering RPC-nya (branch/district/
        // village + id tie-breaker) suatu saat tidak stabil lagi, baris yg
        // ke-load dobel di 2 halaman bikin React "duplicate key".
        for (const o of list) { if (!seen.has(o.id)) { seen.add(o.id); all.push(o); } }
        setLoaded(all.length);
        if (list.length < PAGE) break;
      }
      setAllRows(all);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => allRows.filter((r) => passesRow(r, filters, AO_FCOLS, null)), [allRows, filters]);
  const anyFilter = AO_FCOLS.some(([k]) => (filters[k] || []).length);

  const uniq = (rows, k) => new Set(rows.map((r) => String(r[k] ?? "").trim()).filter(Boolean)).size;
  const stats = useMemo(() => [
    ["Outlet", filtered.length, "Jumlah Baris"],
    ["Region", uniq(filtered, "region"), "Region"],
    ["Branch", uniq(filtered, "branch"), "Branch"],
    ["MC", uniq(filtered, "mc"), "MC"],
    ["Kabupaten", uniq(filtered, "city"), "Kota/Kabupaten"],
    ["Kecamatan", uniq(filtered, "district"), "Kecamatan"],
    ["Desa", uniq(filtered, "village"), "Desa"],
    ["ID IM3", uniq(filtered, "outlet_id_im3"), "Outlet ID IM3"],
    ["ID 3ID", uniq(filtered, "outlet_id_3id"), "Outlet ID 3ID"],
  ], [filtered]);

  const shown = filtered.slice(0, MAX_OUTLET_ROWS);

  const exportXlsx = useCallback(async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const data = filtered.map((r) => {
        const o = {};
        OUTLET_COLUMNS.forEach((c) => { o[c.label] = r[c.key] ?? ""; });
        return o;
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Data Outlet");
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `MartaHub_DataOutlet_${stamp}.xlsx`);
    } finally { setExporting(false); }
  }, [filtered]);

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "13px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>Data Outlet</div>
        {loading && (
          <span style={{ fontSize: 11.5, color: T.primary, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Memuat {loaded.toLocaleString("id-ID")} baris...
          </span>
        )}
        {!loading && anyFilter && <span style={{ fontSize: 11.5, color: T.lo }}>{filtered.length.toLocaleString("id-ID")} dari {allRows.length.toLocaleString("id-ID")} baris</span>}
        {!loading && anyFilter && <button onClick={() => setFilters({})} style={{ border: "none", background: "transparent", cursor: "pointer", color: T.primary, fontSize: 12, fontWeight: 700 }}>Hapus semua filter</button>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={load}><RefreshCw size={13} /></Btn>
          <Btn variant="ghost" onClick={exportXlsx} disabled={allRows.length === 0 || exporting}>
            {exporting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Download size={14} />} Export .xlsx
          </Btn>
          <Btn onClick={() => setShowImport(true)}><Upload size={14} /> Upload Data Outlet</Btn>
        </div>
      </div>

      {/* Ringkasan unique value per kolom (mengikuti filter aktif) */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 1, background: BORDER, borderBottom: `1px solid ${BORDER}` }}>
        {stats.map(([label, val, full]) => (
          <div key={label} style={{ background: "#fff", padding: "12px 6px", textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: loading ? T.lo : T.hi, lineHeight: 1, whiteSpace: "nowrap" }}>
              {loading ? "..." : (Number.isInteger(Number(val)) ? Number(val || 0).toLocaleString("id-ID") : String(val))}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.lo, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={full || label}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ overflow: "auto", maxHeight: 560 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ background: "#F7F9FC", color: T.lo }}>
              {OUTLET_COLUMNS.map((c) => (
                AO_FCOLS.some(([k]) => k === c.key) ? (
                  <FilterTh key={c.key} t={AO_FT_T} label={c.label} colKey={c.key} filters={filters}
                    onOpen={(ck, r) => { setRect(r); setOpenCol(ck); }} />
                ) : (
                  <th key={c.key} style={{ padding: "9px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.label}</th>
                )
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={OUTLET_COLUMNS.length} style={{ padding: 34, textAlign: "center", color: T.lo }}>
                <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              </td></tr>
            )}
            {!loading && shown.length === 0 && (
              <tr><td colSpan={OUTLET_COLUMNS.length} style={{ padding: 34, textAlign: "center", color: T.lo, fontSize: 13 }}>
                {allRows.length === 0 ? "Belum ada data outlet. Upload file di kanan atas." : "Tidak ada data yang cocok filter."}
              </td></tr>
            )}
            {!loading && shown.map((o, i) => (
              <tr key={`${o.id_outlet}-${i}`} style={{ borderTop: `1px solid ${BORDER}` }}>
                {OUTLET_COLUMNS.map((c) => {
                  const v = o[c.key];
                  const mono = c.key === "outlet_id_im3" || c.key === "outlet_id_3id" || c.key === "latitude" || c.key === "longitude";
                  return <td key={c.key} style={{ padding: "8px 12px", color: T.mid, fontFamily: mono ? "monospace" : undefined }}>{v == null || v === "" ? "-" : String(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && filtered.length > MAX_OUTLET_ROWS && (
        <div style={{ padding: "8px 16px", fontSize: 11.5, color: T.lo, borderTop: `1px solid ${BORDER}` }}>
          Menampilkan {MAX_OUTLET_ROWS.toLocaleString("id-ID")} dari {filtered.length.toLocaleString("id-ID")} baris - gunakan filter kolom untuk mempersempit (export tetap ikut semua baris terfilter).
        </div>
      )}

      {openCol && (
        <FilterMenu t={AO_FT_T} rect={rect} label={OUTLET_COLUMNS.find((c) => c.key === openCol)?.label || openCol}
          options={optionsFor(allRows, filters, AO_FCOLS, openCol)} selected={filters[openCol] || []}
          onChange={(vals) => setFilters((f) => ({ ...f, [openCol]: vals }))} onClose={() => setOpenCol("")} />
      )}

      {showImport && (
        <ImportOutletModal onClose={() => setShowImport(false)} onImported={load} />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Modal upload: preview mentah -> pilih baris header -> cocokkan kolom ───
// Pola/UX SAMA PERSIS dgn UploadStep di app/martahub/master/page.jsx (List
// Site), cuma field targetnya beda (AO_TARGET_FIELDS, termasuk Lat/Long).
function ImportOutletModal({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState({});
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // {done,total}
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const table = useMemo(() => (matrix ? deriveTable(matrix, headerIdx) : null), [matrix, headerIdx]);
  useEffect(() => { if (table) setMapping(guessAoMapping(table.displayColumns)); }, [table]);

  const onFile = async (f) => {
    setFile(f); setMatrix(null); setResult(null); setErr(""); setHeaderIdx(0);
    if (!f) return;
    setReading(true);
    try { const parsed = await readWorkbook(f); setMatrix(parsed.matrix); }
    catch (e) { setErr(e.message || "Gagal membaca berkas."); }
    finally { setReading(false); }
  };

  const run = async () => {
    if (!table || busy) return;
    setBusy(true); setErr(""); setResult(null); setProgress(null);
    try {
      const mapped = buildAoRows(table.rows, mapping);
      if (!mapped.length) { setErr("Tidak ada baris valid - cek pairing kolom (minimal Branch, Village, atau salah satu Outlet ID harus terisi)."); return; }
      const count = await aoImportOutletMaster(mapped, (done, t) => setProgress({ done, total: t }));
      setResult({ rows: count });
      onImported?.();
    } catch (e) {
      setErr(e.message || "Gagal mengimpor.");
    } finally { setBusy(false); setProgress(null); }
  };

  const opts = table?.displayColumns || [];
  const canImport = !!table;
  const previewRows = matrix ? matrix.slice(0, 10) : [];
  const colCount = previewRows.reduce((m, r) => Math.max(m, (r || []).length), 0);

  return (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "4vh 20px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 22, width: 720, maxWidth: "94vw", maxHeight: "90vh", overflow: "auto", fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Upload Data Outlet</div>
          <button onClick={() => !busy && onClose()} style={{ border: "none", background: "transparent", cursor: "pointer", marginLeft: "auto" }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: T.lo, marginBottom: 14 }}>Upload akan MENGGANTIKAN seluruh data outlet lama (snapshot penuh, bukan delta).</div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label>
            <input type="file" accept=".xlsb,.xlsx,.xls,.csv" disabled={busy || reading} onChange={(e) => onFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
            <span style={{ padding: "9px 16px", borderRadius: 10, border: `1px solid ${BORDER}`, fontWeight: 700, fontSize: 13, fontFamily: FONT, cursor: busy || reading ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, background: "#fff", color: T.hi }}>
              {file ? "Ganti berkas" : "Pilih berkas..."}
            </span>
          </label>
          {reading ? <span style={{ fontSize: 12, color: T.lo }}>Membaca...</span> : file && <span style={{ fontSize: 12, color: T.lo }}>{file.name} · {(file.size / 1048576).toFixed(1)} MB</span>}
        </div>

        {matrix && <>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: T.lo, textTransform: "uppercase", marginBottom: 5 }}>Preview &amp; Baris Header</div>
            <div style={{ fontSize: 12, color: T.lo, marginBottom: 8 }}>Klik baris yang menjadi <b>header</b>. Baris di atasnya diabaikan; baris di bawahnya jadi data.</div>
            <div style={{ overflow: "auto", maxHeight: 250, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 11.5, whiteSpace: "nowrap" }}>
                <tbody>
                  {previewRows.map((row, ri) => {
                    const isHeader = ri === headerIdx;
                    const skipped = ri < headerIdx;
                    return (
                      <tr key={ri} onClick={() => setHeaderIdx(ri)}
                        style={{ cursor: "pointer", background: isHeader ? "#FFF0F0" : skipped ? "#F5F6F8" : "#fff", opacity: skipped ? 0.55 : 1, borderTop: ri ? `1px solid ${BORDER}` : "none" }}>
                        <td style={{ position: "sticky", left: 0, background: "inherit", padding: "6px 10px", fontWeight: 800, fontSize: 10.5, color: isHeader ? T.primary : T.lo, borderRight: `1px solid ${BORDER}`, textAlign: "center", minWidth: 56 }}>
                          {isHeader ? "HEADER" : ri + 1}
                        </td>
                        {Array.from({ length: colCount }).map((_, ci) => {
                          const v = (row || [])[ci];
                          const s = v == null ? "" : String(v);
                          return <td key={ci} style={{ padding: "6px 10px", color: isHeader ? T.hi : T.mid, fontWeight: isHeader ? 700 : 400, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>{s.length > 22 ? s.slice(0, 22) + "\u2026" : s}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: T.lo, marginTop: 8 }}>
              Header: baris <b>#{headerIdx + 1}</b> · <b>{(table?.rows.length || 0).toLocaleString("id-ID")}</b> baris data dimuat · <b>{opts.length}</b> kolom terbaca.
            </div>
          </div>

          <div style={{ margin: "18px 0 3px", fontSize: 11.5, fontWeight: 800, color: T.lo, textTransform: "uppercase" }}>Cocokkan Kolom</div>
          <div style={{ fontSize: 12, color: T.lo, marginBottom: 10 }}>Kolom dicocokkan otomatis dari header. Ubah bila ada yang meleset. Semua kolom asli file tetap aman - cuma yang dipetakan di sini yang disimpan ke MartaHub.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 10 }}>
            {AO_TARGET_FIELDS.map((f) => {
              const val = mapping[f.key] || "";
              return (
                <label key={f.key} style={{ display: "block" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: T.hi, marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
                    {f.label}{f.required && <span style={{ color: T.error }}>*</span>}
                    {val && <span style={{ fontSize: 10, fontWeight: 700, color: T.success }}>✓</span>}
                  </div>
                  <select value={val} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                    style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, fontSize: 12.5, fontFamily: FONT, background: "#fff", border: `1px solid ${f.required && !val ? T.error : BORDER}` }}>
                    <option value="">- pilih kolom -</option>
                    {opts.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              );
            })}
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
            <Btn onClick={run} disabled={busy || !canImport}>
              {busy ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <UploadCloud size={14} />}
              {busy ? "Mengimpor..." : "Import Sekarang"}
            </Btn>
          </div>
        </>}

        {progress && (
          <div style={{ marginTop: 14 }}>
            <div style={{ height: 8, background: "#EEF1F6", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`, height: "100%", background: T.primary, transition: "width .2s" }} />
            </div>
            <div style={{ fontSize: 12, color: T.lo, marginTop: 6 }}>Mengimpor {progress.done.toLocaleString("id-ID")}/{progress.total.toLocaleString("id-ID")} baris...</div>
          </div>
        )}
        {err && (
          <div style={{ marginTop: 12, padding: "9px 11px", borderRadius: 9, fontSize: 12.5, background: T.errorBg, color: T.error }}>{err}</div>
        )}
        {result && (
          <div style={{ marginTop: 12, padding: "9px 11px", borderRadius: 9, fontSize: 12.5, background: T.successBg, color: T.success, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span><b>Berhasil.</b> {result.rows.toLocaleString("id-ID")} baris outlet diimpor (menggantikan data lama).</span>
            <Btn variant="ghost" onClick={onClose}>Tutup</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-tab "Foto Referensi" - upload contoh foto benar/salah utk Panduan
// Foto di Mobile (lihat PhotoGuide di app/marta/audit-outlet/isi/page.jsx).
// 1 slot "benar" + 3 slot "salah" (tiap "salah" dgn label alasan) per jenis
// foto, persis template "Panduan Foto Etalase/Tapak Depan Outlet" (4 foto). ─

const AO_REF_JENIS = [
  { key: "etalase", label: "Foto Etalase Outlet" },
  { key: "tapak_depan", label: "Foto Tampak Depan Outlet" },
];

function ReferencePhotoBody() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState("");
  const [labelDrafts, setLabelDrafts] = useState({});
  const [savingLabelKey, setSavingLabelKey] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await aoListReferencePhotos();
      setRows(data);
    } catch (e) {
      setErr(e.message || "Gagal memuat foto referensi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byKey = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => m.set(`${r.jenis}-${r.kind}-${r.urutan}`, r));
    return m;
  }, [rows]);

  const onPick = async (jenis, kind, urutan, file) => {
    const k = `${jenis}-${kind}-${urutan}`;
    setUploadingKey(k); setErr("");
    try {
      const existingLabel = byKey.get(k)?.label || "";
      await aoUploadReferencePhoto(jenis, kind, urutan, file, kind === "salah" ? existingLabel : null);
      await load();
    } catch (e) {
      setErr(e.message || "Gagal upload foto referensi");
    } finally {
      setUploadingKey("");
    }
  };

  const onLabelChange = (k, v) => setLabelDrafts((d) => ({ ...d, [k]: v }));

  const onSaveLabel = async (jenis, kind, urutan) => {
    const k = `${jenis}-${kind}-${urutan}`;
    const val = labelDrafts[k] ?? byKey.get(k)?.label ?? "";
    setSavingLabelKey(k); setErr("");
    try {
      await aoUpdateReferencePhotoLabel(jenis, kind, urutan, val);
      setLabelDrafts((d) => { const n = { ...d }; delete n[k]; return n; });
      await load();
    } catch (e) {
      setErr(e.message || "Gagal simpan label");
    } finally {
      setSavingLabelKey("");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card>
        <div style={{ fontSize: 12.5, color: T.lo, lineHeight: 1.65 }}>
          Foto referensi ini tampil sebagai Panduan Foto di form Mobile (tombol &quot;Lihat Panduan&quot; saat sender mengambil Foto Etalase & Foto Tampak Depan Outlet) — 1 contoh foto yang <b style={{ color: T.hi }}>benar</b> dan 3 contoh foto yang <b style={{ color: T.hi }}>salah</b> (masing-masing dengan alasan) per jenis foto, sesuai template panduan.
        </div>
      </Card>

      {loading && (
        <div style={{ fontSize: 12.5, color: T.primary, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Memuat foto referensi...
        </div>
      )}
      {err && (
        <div style={{ padding: "9px 11px", borderRadius: 9, fontSize: 12.5, background: T.errorBg, color: T.error }}>{err}</div>
      )}

      {!loading && AO_REF_JENIS.map((j) => (
        <Card key={j.key}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>{j.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <RefSlot jenis={j.key} kind="benar" urutan={1} row={byKey.get(`${j.key}-benar-1`)}
              uploading={uploadingKey === `${j.key}-benar-1`} onPick={onPick} />
            {[1, 2, 3].map((u) => {
              const k = `${j.key}-salah-${u}`;
              return (
                <RefSlot key={u} jenis={j.key} kind="salah" urutan={u} row={byKey.get(k)}
                  uploading={uploadingKey === k} onPick={onPick}
                  labelDraft={labelDrafts[k]} onLabelChange={(v) => onLabelChange(k, v)}
                  onSaveLabel={() => onSaveLabel(j.key, "salah", u)} savingLabel={savingLabelKey === k} />
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RefSlot({ jenis, kind, urutan, row, uploading, onPick, labelDraft, onLabelChange, onSaveLabel, savingLabel }) {
  const inputId = `ao-ref-${jenis}-${kind}-${urutan}`;
  const isBenar = kind === "benar";
  const currentLabel = labelDraft ?? row?.label ?? "";
  const labelChanged = labelDraft != null && labelDraft !== (row?.label ?? "");

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", aspectRatio: "4 / 3", background: "#F4F3F8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {row?.url ? (
          <img src={row.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <ImageIcon size={24} color={T.lo} />
        )}
        {uploading && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 size={18} color={T.primary} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}
        <div style={{
          position: "absolute", top: 7, left: 7, display: "flex", alignItems: "center", gap: 4, padding: "3px 8px",
          borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: "#fff",
          background: isBenar ? "rgba(46,125,50,0.92)" : "rgba(198,40,40,0.92)",
        }}>
          {isBenar ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
          {isBenar ? "Benar" : `Salah ${urutan}`}
        </div>
      </div>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {!isBenar && (
          <div style={{ display: "flex", gap: 6 }}>
            <input value={currentLabel} onChange={(e) => onLabelChange(e.target.value)} placeholder="Alasan salah (mis. Gelap / blur)"
              style={{ flex: 1, minWidth: 0, padding: "7px 9px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: FONT, outline: "none" }} />
            {labelChanged && (
              <button onClick={onSaveLabel} disabled={savingLabel} title="Simpan label"
                style={{ border: "none", background: T.primary, color: "#fff", borderRadius: 8, padding: "0 10px", cursor: savingLabel ? "not-allowed" : "pointer", display: "flex", alignItems: "center" }}>
                {savingLabel ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={13} />}
              </button>
            )}
          </div>
        )}
        <label htmlFor={inputId} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 8,
          border: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 700, color: T.hi, cursor: "pointer",
        }}>
          <Upload size={13} /> {row?.url ? "Ganti Foto" : "Upload Foto"}
        </label>
        <input id={inputId} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(jenis, kind, urutan, f); e.target.value = ""; }} />
      </div>
    </div>
  );
}
