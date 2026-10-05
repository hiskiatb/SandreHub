"use client";
/**
 * SDP_DseDatabase.jsx
 * "Database DSE" — pilih Region (North/Central/South Sumatera), lalu upload
 * banyak file .txt sekaligus (format: header "NAMA HOA - N DS - M DSE -
 * BRANCH", lalu blok per DS "NAMA - HP - MC-<area> - K DSE", lalu baris per
 * DSE "KODE - HP - X desa - Y outlet"). Hasil parse digabung jadi satu tabel
 * (sheet "mf_dse_database" di Supabase) dan bisa di-export ke Excel.
 *
 * Dedup: upload ulang file utk HOA yang sama MENGGANTI (replace) seluruh
 * baris HOA itu di Region tsb, bukan menumpuk duplikat — lihat RPC
 * mf_dse_upload_hoa (delete-then-insert atomic, 1 panggilan per HOA).
 *
 * Hanya untuk role spm_sumatera (digate juga di page.jsx).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import {
  Upload, FileText, X, Check, AlertTriangle, Loader2, FileDown,
  Search, RefreshCw, Trash2, ChevronDown, Database, Globe,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;
const REGIONS = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];
const PAGE_SIZE = 50;

// "VACANT" (posisi blm terisi org) bukan nama/no.HP sungguhan — kalau nilainya
// cuma itu (apa pun hurufnya), perlakukan sbg kosong (biarkan NULL) drpd
// nyimpen teks "VACANT" literal ke kolom Nama DS / No. HP DS.
const blankIfVacant = (v) => {
  const s = (v || "").trim();
  return (!s || s.toUpperCase() === "VACANT") ? null : s;
};

// ── Parser: 1 file .txt → { hoaName, branch, totalDs, totalDse, rows[] } ───
// Sama persis logikanya dgn script Python yang dipakai utk validasi contoh
// tabel sebelumnya (parse.py) — porting 1:1 ke JS supaya hasilnya konsisten.
function parseDseFile(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const header = (lines[0] || "").trim();
  const hm = header.match(/^(.*?)\s+-\s+(\d+)\s*DS\s+-\s+(\d+)\s*DSE\s+-\s+(.*)$/i);
  if (!hm) {
    return { error: `Header tidak dikenali: "${header}". Format yang diharapkan: "NAMA HOA - N DS - M DSE - BRANCH".` };
  }
  const hoaName = hm[1].trim();
  const headerTotalDs = parseInt(hm[2], 10);
  const headerTotalDse = parseInt(hm[3], 10);
  const branch = hm[4].trim();

  const rows = [];
  let dsName = null, dsPhone = null, mc = null;
  const unmatched = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Field ke-2 (no. HP DS) kadang bukan angka — bisa kosong atau placeholder
    // teks spt "VACANT" (lihat BINJAI - GUSTI MANGGALA PRASETYA.txt: "VACANT -
    // VACANT - MC-STABAT - 6 DSE"), jadi tangkap sbg teks bebas (bukan \d*
    // saja), lalu dikosongkan lewat blankIfVacant() di bawah.
    //
    // PENTING: pemisah antar kolom di file ini SELALU " - " (ada spasi di
    // kedua sisi dash). Makanya separator di sini pakai \s+-\s+ (wajib
    // spasi), BUKAN \s*-\s* (dash boleh nempel) — supaya dash yang kebetulan
    // jadi BAGIAN dari Kode DSE itu sendiri (contoh nyata: "DSE-PIJAY2", dash
    // nempel tanpa spasi) tidak ikut kesalah-baca sbg pemisah kolom.
    const dm = line.match(/^(.*?)\s+-\s+(.*?)\s+-\s+MC-(.*?)\s+-\s+(\d+)\s*DSE$/i);
    if (dm) {
      dsName = blankIfVacant(dm[1]);
      dsPhone = blankIfVacant(dm[2]);
      mc = "MC-" + dm[3].trim();
      continue;
    }

    const em = line.match(/^(.*?)\s+-\s+(.*?)\s+-\s+(\d+)\s*desa\s+-\s+(\d+)\s*outlet$/i);
    if (em) {
      rows.push({
        ds_name: dsName,
        ds_phone: dsPhone,
        mc,
        dse_code: em[1].trim(),
        dse_phone: blankIfVacant(em[2]),
        jumlah_desa: parseInt(em[3], 10),
        jumlah_outlet: parseInt(em[4], 10),
      });
      continue;
    }
    unmatched.push(line);
  }

  // Kode/ID DSE kadang kebetulan ketulis sama 2x dalam 1 file sumber (human
  // error pas input). Tidak ada baris yang dibuang — semua tetap disimpan,
  // tapi baris2 yg ID DSE-nya dobel (termasuk kemunculan pertamanya) ditandai
  // dup_code = true supaya kelihatan jelas di kolom Remarks & bisa dicek.
  const codeCount = new Map();
  for (const r of rows) {
    const key = r.dse_code.toUpperCase();
    codeCount.set(key, (codeCount.get(key) || 0) + 1);
  }
  const duplicateCodes = [];
  for (const r of rows) {
    const key = r.dse_code.toUpperCase();
    r.dup_code = codeCount.get(key) > 1;
    if (r.dup_code) duplicateCodes.push(r.dse_code);
  }

  return {
    hoaName, branch, headerTotalDs, headerTotalDse, rows, unmatched, duplicateCodes,
    dsCount: new Set(rows.map((r) => r.ds_name || "(belum ada nama)")).size,
    incompleteCount: rows.filter((r) => !r.ds_name || !r.ds_phone || !r.mc || !r.dse_phone || r.dup_code).length,
  };
}

// Teks keterangan field mana saja yang masih kosong pada 1 baris — dipakai
// baik di kolom "Remarks" tabel maupun saat export Excel, supaya konsisten.
function buildRemarks(r) {
  const parts = [];
  const missing = [];
  if (!r.ds_name) missing.push("Nama DS");
  if (!r.ds_phone) missing.push("Nomor DS");
  if (!r.mc) missing.push("MC");
  if (!r.dse_phone) missing.push("Nomor DSE");
  if (missing.length) parts.push(`${missing.join(", ")} kosong`);
  if (r.dup_code || r.flag_duplicate_code) parts.push("ID DSE duplikat di file sumber");
  return parts.length ? parts.join(" · ") : "Lengkap";
}

function downloadXlsx(head, body, sheetName, filename) {
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);
  const bg = type === "error" ? "#DC2626" : type === "warn" ? "#D97706" : "#16A34A";
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px", borderRadius: 10,
      background: bg, color: "#fff", fontSize: 13.5, fontWeight: 600,
      fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      maxWidth: 420,
    }}>
      {type === "error" ? <AlertTriangle size={15} /> : <Check size={15} />}
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, display: "flex" }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ── Modal konfirmasi "Hapus Semua" ──────────────────────────────────────────
// Scope ikut filter Region yang lagi aktif di tabel (kalau "Semua Region",
// hapus BENAR-BENAR semua baris) — dikunci di belakang ketikan konfirmasi
// persis supaya tidak kepencet tidak sengaja.
function DeleteAllModal({ t, scopeLabel, confirmWord, onConfirm, onCancel, loading, rowCount }) {
  const [text, setText] = useState("");
  const match = text.trim().toUpperCase() === confirmWord;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: t.card, borderRadius: 14, padding: 26, maxWidth: 420, width: "100%", border: `1px solid ${t.line}`, fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <AlertTriangle size={18} color={t.red} />
          <div style={{ fontSize: 15.5, fontWeight: 800, color: t.hi }}>Hapus Semua Data?</div>
        </div>
        <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.6, marginBottom: 14 }}>
          Ini akan menghapus <b style={{ color: t.hi }}>{rowCount.toLocaleString("id-ID")} baris</b> dari{" "}
          <b style={{ color: t.hi }}>{scopeLabel}</b> secara permanen. Tindakan ini tidak bisa dibatalkan — upload ulang
          file .txt-nya kalau nanti ingin mengisi ulang dari awal.
        </div>
        <div style={{ fontSize: 12, color: t.mid, marginBottom: 6 }}>
          Ketik <b style={{ color: t.red }}>{confirmWord}</b> untuk konfirmasi:
        </div>
        <input value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder={confirmWord}
          style={{ width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13.5, fontFamily: FONT, outline: "none", marginBottom: 18, boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={loading}
            style={{ height: 38, padding: "0 16px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Batal
          </button>
          <button onClick={onConfirm} disabled={!match || loading}
            style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: t.red, color: "#fff", fontSize: 13, fontWeight: 700, cursor: match ? "pointer" : "not-allowed", opacity: match && !loading ? 1 : 0.5 }}>
            {loading ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
            Hapus Permanen
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SDP_DseDatabase({ theme, profile }) {
  const d = theme === "dark";
  const t = {
    bg:       d ? "#0F0F11" : "#F2F2F7",
    card:     d ? "#1A1A1D" : "#FFFFFF",
    sub:      d ? "#202024" : "#F5F5F7",
    line:     d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)",
    hi:       d ? "#F2F2F3" : "#1A1A1D",
    mid:      d ? "#8A8A96" : "#5A5A68",
    lo:       d ? "#5A5A68" : "#8A8A96",
    inputBg:  d ? "#1E1E22" : "#F8F8FA",
    inputBd:  d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)",
    teal:     d ? "#32BCAD" : "#1A9E90",
    tealBg:   d ? "rgba(50,188,173,0.10)" : "rgba(26,158,144,0.07)",
    tealBd:   d ? "rgba(50,188,173,0.28)" : "rgba(26,158,144,0.20)",
    red:      d ? "#F87171" : "#DC2626",
    redBg:    d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)",
    amber:    d ? "#FBBF24" : "#B45309",
    amberBg:  d ? "rgba(251,191,36,0.10)" : "rgba(180,83,9,0.08)",
    shadowSm: d ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.07)",
    hover:    d ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
  };

  const [region, setRegion] = useState("");
  const [staged, setStaged] = useState([]); // [{fileName, hoaName, branch, headerTotalDs, headerTotalDse, rows, unmatched, dsCount, error}]
  const [uploading, setUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null); // [{hoaName, inserted, deleted}]
  const fileRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "ok") => setToast({ msg, type });

  // ── Pilih file(s) → parse di browser, tampilkan preview sebelum disimpan ──
  const onPickFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const parsed = await Promise.all(files.map(async (f) => {
      const text = await f.text();
      const p = parseDseFile(text);
      return { fileName: f.name, ...p };
    }));
    setStaged((prev) => [...prev, ...parsed]);
    setUploadSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeStaged = (idx) => setStaged((prev) => prev.filter((_, i) => i !== idx));

  const validStaged = staged.filter((s) => !s.error);
  const totalDseStaged = validStaged.reduce((a, s) => a + s.rows.length, 0);

  // ── Simpan ke Supabase — 1 RPC per HOA (replace atomic, lihat migration) ──
  const handleUpload = async () => {
    if (!region) { showToast("Pilih Region dulu.", "warn"); return; }
    if (!validStaged.length) { showToast("Belum ada file valid yang diupload.", "warn"); return; }
    setUploading(true);
    const results = [];
    try {
      for (const s of validStaged) {
        const { data, error } = await supabase.rpc("mf_dse_upload_hoa", {
          p_region: region,
          p_branch: s.branch,
          p_hoa_name: s.hoaName,
          p_source_file: s.fileName,
          p_rows: s.rows,
        });
        if (error) {
          results.push({ hoaName: s.hoaName, error: error.message });
          continue;
        }
        const row = Array.isArray(data) ? data[0] : data;
        results.push({ hoaName: s.hoaName, branch: s.branch, inserted: row?.inserted_count ?? s.rows.length, deleted: row?.deleted_count ?? 0 });
      }
      setUploadSummary(results);
      const failed = results.filter((r) => r.error);
      if (failed.length) showToast(`${failed.length} HOA gagal disimpan — cek detail di bawah.`, "error");
      else showToast(`Berhasil disimpan: ${results.length} HOA, ${totalDseStaged} baris DSE.`, "ok");
      setStaged([]);
      setFilterRegion(region);
      fetchRows(1, search, region);
    } finally {
      setUploading(false);
    }
  };

  // ── Fetch tabel gabungan ───────────────────────────────────────────────────
  const [incompleteTotal, setIncompleteTotal] = useState(0);
  const fetchRows = useCallback(async (pg = 1, srch = search, reg = filterRegion) => {
    setFetching(true);
    try {
      let q = supabase.from("mf_dse_database")
        .select("*", { count: "exact" })
        .order("branch", { ascending: true })
        .order("hoa_name", { ascending: true })
        .order("ds_name", { ascending: true })
        .order("dse_code", { ascending: true });
      if (reg) q = q.eq("region", reg);
      if (srch) {
        const s = srch.replace(/[%_]/g, "");
        q = q.or(`hoa_name.ilike.%${s}%,ds_name.ilike.%${s}%,dse_code.ilike.%${s}%,branch.ilike.%${s}%,mc.ilike.%${s}%`);
      }
      const from = (pg - 1) * PAGE_SIZE;
      const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      setRows(data || []);
      setTotal(count || 0);
      setPage(pg);

      // Jumlah baris "belum lengkap" (ada kolom kontak kosong, biasanya bekas
      // placeholder "VACANT") utk scope filter yg sama — query count terpisah
      // supaya tetap akurat walau lagi lihat halaman lain.
      let iq = supabase.from("mf_dse_database").select("id", { count: "exact", head: true })
        .or("ds_name.is.null,ds_phone.is.null,mc.is.null,dse_phone.is.null,flag_duplicate_code.eq.true");
      if (reg) iq = iq.eq("region", reg);
      if (srch) {
        const s = srch.replace(/[%_]/g, "");
        iq = iq.or(`hoa_name.ilike.%${s}%,ds_name.ilike.%${s}%,dse_code.ilike.%${s}%,branch.ilike.%${s}%,mc.ilike.%${s}%`);
      }
      const { count: incCount } = await iq;
      setIncompleteTotal(incCount || 0);
    } catch (e) {
      showToast(e.message || "Gagal memuat data.", "error");
    } finally {
      setFetching(false);
    }
  }, [search, filterRegion]);

  useEffect(() => { fetchRows(1, search, filterRegion); }, [filterRegion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = setTimeout(() => { setSearch(searchInput); fetchRows(1, searchInput, filterRegion); }, 350);
    return () => clearTimeout(h);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export semua baris (scope filterRegion aktif, bukan cuma 1 page) ──────
  const handleExport = async () => {
    setExportLoading(true);
    try {
      let q = supabase.from("mf_dse_database").select("*")
        .order("branch", { ascending: true }).order("hoa_name", { ascending: true })
        .order("ds_name", { ascending: true }).order("dse_code", { ascending: true });
      if (filterRegion) q = q.eq("region", filterRegion);
      const { data, error } = await q.limit(50000);
      if (error) throw error;
      const head = ["REGION", "BRANCH", "HOA", "NAMA DS", "NOMOR DS", "MC", "ID DSE", "NOMOR DSE", "JUMLAH DESA", "JUMLAH OUTLET", "REMARKS", "FILE SUMBER", "DIUPLOAD"];
      const body = (data || []).map((r) => [
        r.region, r.branch, r.hoa_name, r.ds_name, r.ds_phone || "", r.mc || "",
        r.dse_code, r.dse_phone || "", r.jumlah_desa, r.jumlah_outlet, buildRemarks(r), r.source_file || "",
        r.uploaded_at ? new Date(r.uploaded_at).toLocaleString("id-ID") : "",
      ]);
      const fname = `Database_DSE_${filterRegion ? filterRegion.replace(/\s+/g, "_") : "Semua_Region"}.xlsx`;
      downloadXlsx(head, body, "Database DSE", fname);
      showToast(`Export selesai — ${body.length} baris.`, "ok");
    } catch (e) {
      showToast(e.message || "Gagal export.", "error");
    } finally {
      setExportLoading(false);
    }
  };

  // ── Hapus semua baris (scope = filterRegion aktif, atau benar2 semua kalau
  // "Semua Region" dipilih) — utk mulai ulang dari awal. Dikunci lewat modal
  // ketik-konfirmasi di DeleteAllModal, bukan 1x klik.
  const deleteScopeLabel = filterRegion ? `Region ${filterRegion}` : "SEMUA REGION";
  const deleteConfirmWord = filterRegion ? "HAPUS" : "HAPUS SEMUA";
  const [deleteScopeCount, setDeleteScopeCount] = useState(0);
  const openDeleteAll = async () => {
    // Hitung ulang jumlah baris utk scope HAPUS (region saja, abaikan search
    // box) supaya angka yg ditampilkan di modal akurat — beda dgn `total`
    // yang ikut kefilter search.
    let cq = supabase.from("mf_dse_database").select("id", { count: "exact", head: true });
    if (filterRegion) cq = cq.eq("region", filterRegion);
    const { count } = await cq;
    setDeleteScopeCount(count || 0);
    setShowDeleteAll(true);
  };
  const handleDeleteAll = async () => {
    setDeleteAllLoading(true);
    try {
      let q = supabase.from("mf_dse_database").delete();
      q = filterRegion ? q.eq("region", filterRegion) : q.not("id", "is", null); // guard: delete butuh WHERE eksplisit
      const { error } = await q;
      if (error) throw error;
      showToast(`Berhasil dihapus — ${deleteScopeLabel}.`, "ok");
      setShowDeleteAll(false);
      fetchRows(1, search, filterRegion);
    } catch (e) {
      showToast(e.message || "Gagal menghapus data.", "error");
    } finally {
      setDeleteAllLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const inputStyle = {
    width: "100%", height: 38, padding: "0 12px", borderRadius: 9,
    border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi,
    fontSize: 13.5, fontFamily: FONT, outline: "none",
  };

  return (
    <div style={{ fontFamily: FONT, color: t.hi }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {showDeleteAll && (
        <DeleteAllModal t={t} scopeLabel={deleteScopeLabel} confirmWord={deleteConfirmWord} rowCount={deleteScopeCount}
          loading={deleteAllLoading} onConfirm={handleDeleteAll} onCancel={() => setShowDeleteAll(false)} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Database size={20} color={t.teal} />
        <div style={{ fontSize: 19, fontWeight: 800 }}>Database DSE</div>
      </div>
      <div style={{ fontSize: 13, color: t.mid, marginBottom: 20 }}>
        Pilih Region, lalu upload beberapa file .txt sekaligus (format HOA → DS → DSE). Upload ulang file HOA yang sama akan
        mengganti data HOA tsb (tidak menumpuk duplikat).
      </div>

      {/* ── Step 1: Region + upload ── */}
      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>
              Region <span style={{ color: t.red }}>*</span>
            </div>
            <div style={{ position: "relative" }}>
              <select value={region} onChange={(e) => setRegion(e.target.value)}
                style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
                <option value="">— pilih Region —</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown size={14} style={{ position: "absolute", right: 12, top: 12, color: t.lo, pointerEvents: "none" }} />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>
              Upload File (.txt) — bisa banyak sekaligus
            </div>
            <label style={{
              display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", borderRadius: 9,
              border: `1px dashed ${t.tealBd}`, background: t.tealBg, color: t.teal, fontSize: 13, fontWeight: 700,
              cursor: region ? "pointer" : "not-allowed", opacity: region ? 1 : 0.5, width: "fit-content",
            }}>
              <Upload size={14} />
              Pilih File…
              <input ref={fileRef} type="file" accept=".txt" multiple disabled={!region} style={{ display: "none" }}
                onChange={(e) => onPickFiles(e.target.files)} />
            </label>
          </div>
        </div>

        {/* ── Preview file yang sudah dipilih ── */}
        {staged.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {staged.map((s, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10,
                border: `1px solid ${s.error ? t.redBg : t.line}`, background: s.error ? t.redBg : t.sub,
              }}>
                <FileText size={15} color={s.error ? t.red : t.teal} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.fileName}
                  </div>
                  {s.error ? (
                    <div style={{ fontSize: 12, color: t.red, marginTop: 2 }}>{s.error}</div>
                  ) : (
                    <div style={{ fontSize: 12, color: t.mid, marginTop: 2 }}>
                      HOA <b style={{ color: t.hi }}>{s.hoaName}</b> · Branch <b style={{ color: t.hi }}>{s.branch}</b> ·{" "}
                      {s.dsCount} DS (header: {s.headerTotalDs}) · {s.rows.length} DSE (header: {s.headerTotalDse})
                      {s.rows.length !== s.headerTotalDse && (
                        <span style={{ color: t.amber, fontWeight: 700 }}> — jumlah baris tidak cocok dgn header!</span>
                      )}
                      {s.incompleteCount > 0 && (
                        <span style={{ color: t.amber, fontWeight: 700 }}> — {s.incompleteCount} baris belum lengkap (kontak kosong/VACANT)</span>
                      )}
                      {s.unmatched?.length > 0 && (
                        <span style={{ color: t.amber, fontWeight: 700 }}> — {s.unmatched.length} baris tidak terbaca</span>
                      )}
                      {s.duplicateCodes?.length > 0 && (
                        <span style={{ color: t.red, fontWeight: 700 }}>
                          {" "}— {s.duplicateCodes.length} baris ID DSE duplikat di file ini (tetap disimpan semua, ditandai di Remarks): {s.duplicateCodes.join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => removeStaged(i)} style={{ background: "none", border: "none", color: t.lo, cursor: "pointer", flexShrink: 0 }}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {staged.length > 0 && (
          <button onClick={handleUpload} disabled={uploading || !validStaged.length}
            style={{
              display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 18px", borderRadius: 10,
              border: "none", background: t.teal, color: "#fff", fontSize: 13.5, fontWeight: 700,
              cursor: uploading ? "default" : "pointer", opacity: uploading || !validStaged.length ? 0.6 : 1,
            }}>
            {uploading ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
            {uploading ? "Menyimpan…" : `Simpan ${validStaged.length} HOA (${totalDseStaged} DSE) ke Database`}
          </button>
        )}

        {uploadSummary && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {uploadSummary.map((r, i) => (
              <div key={i} style={{ fontSize: 12.5, color: r.error ? t.red : t.mid }}>
                {r.error
                  ? `✕ ${r.hoaName}: ${r.error}`
                  : `✓ ${r.hoaName} (${r.branch}) — ${r.inserted} baris disimpan${r.deleted ? `, ${r.deleted} baris lama diganti` : ""}`}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Step 2: Tabel gabungan ── */}
      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${t.line}`, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari HOA / DS / ID DSE / Branch / MC…"
              style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <div style={{ position: "relative", minWidth: 190 }}>
            <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}
              style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
              <option value="">Semua Region</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <ChevronDown size={14} style={{ position: "absolute", right: 12, top: 12, color: t.lo, pointerEvents: "none" }} />
          </div>
          <button onClick={() => fetchRows(page, search, filterRegion)} title="Refresh"
            style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RefreshCw size={14} className={fetching ? "spin" : ""} />
          </button>
          <button onClick={handleExport} disabled={exportLoading}
            style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${t.tealBd}`, background: t.tealBg, color: t.teal, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: exportLoading ? 0.6 : 1 }}>
            {exportLoading ? <Loader2 size={14} className="spin" /> : <FileDown size={14} />}
            Export Excel
          </button>
          <button onClick={openDeleteAll} disabled={total === 0}
            title={filterRegion ? `Hapus semua data di Region ${filterRegion}` : "Hapus semua data di semua Region"}
            style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${t.redBg}`, background: t.redBg, color: t.red, fontSize: 13, fontWeight: 700, cursor: total === 0 ? "default" : "pointer", opacity: total === 0 ? 0.5 : 1 }}>
            <Trash2 size={14} />
            Hapus Semua
          </button>
        </div>

        <div style={{ padding: "6px 16px", fontSize: 12, color: t.mid, borderBottom: `1px solid ${t.line}` }}>
          {total.toLocaleString("id-ID")} baris DSE{filterRegion ? ` · Region ${filterRegion}` : " · seluruh Region"}
          {incompleteTotal > 0 && (
            <span style={{ color: t.amber, fontWeight: 700 }}> · {incompleteTotal.toLocaleString("id-ID")} baris belum lengkap</span>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: t.sub }}>
                {["", "REGION", "BRANCH", "HOA", "NAMA DS", "NOMOR DS", "MC", "ID DSE", "NOMOR DSE", "DESA", "OUTLET", "REMARKS"].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "9px 12px", color: t.mid, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                <tr><td colSpan={12} style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={16} className="spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 28, textAlign: "center", color: t.mid }}>Belum ada data. Upload file di atas untuk mulai.</td></tr>
              ) : rows.map((r) => {
                // Baris "belum lengkap" = ada field kontak yg masih kosong
                // (biasanya krn placeholder "VACANT" di file sumber — lihat
                // blankIfVacant() di parser). jumlah_desa/outlet selalu wajib
                // ada dari parser jadi tidak ikut dicek di sini.
                const incomplete = !r.ds_name || !r.ds_phone || !r.mc || !r.dse_phone || r.flag_duplicate_code;
                const remarks = buildRemarks(r);
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${t.line}`, background: incomplete ? t.amberBg : "transparent" }}>
                    <td style={{ padding: "8px 10px", textAlign: "center" }} title={incomplete ? "Ada kolom yang masih kosong" : "Lengkap"}>
                      {incomplete && <AlertTriangle size={13} color={t.amber} />}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.region}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.branch}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.hoa_name}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: r.ds_name ? t.hi : t.amber, fontStyle: r.ds_name ? "normal" : "italic" }}>{r.ds_name || "belum ada nama"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: r.ds_phone ? t.mid : t.amber, fontStyle: r.ds_phone ? "normal" : "italic" }}>{r.ds_phone || "kosong"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: r.mc ? t.hi : t.amber, fontStyle: r.mc ? "normal" : "italic" }}>{r.mc || "kosong"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontWeight: 700 }}>{r.dse_code}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: r.dse_phone ? t.mid : t.amber, fontStyle: r.dse_phone ? "normal" : "italic" }}>{r.dse_phone || "kosong"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{r.jumlah_desa}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{r.jumlah_outlet}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: incomplete ? t.amber : t.teal, fontWeight: 600 }}>{remarks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: 14, borderTop: `1px solid ${t.line}` }}>
          <button onClick={() => fetchRows(page - 1, search, filterRegion)} disabled={page <= 1}
            style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}>
            Sebelumnya
          </button>
          <span style={{ fontSize: 12.5, color: t.mid }}>Halaman {page} / {totalPages}</span>
          <button onClick={() => fetchRows(page + 1, search, filterRegion)} disabled={page >= totalPages}
            style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? 0.5 : 1 }}>
            Berikutnya
          </button>
        </div>
      </div>

      <style>{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
