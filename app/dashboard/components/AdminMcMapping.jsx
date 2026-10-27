"use client";
/**
 * AdminMcMapping.jsx — tab "Mapping & User Management" (di dalam DSE Prod. & AR)
 *
 * UPDATE (permintaan user - "mapping admin mc itu seharusnya didalam dse
 * prod, bukan menjadi menu terpisah, namanya user management" ->
 * "harusnya nama sub menunya mapping dan user management"): dulu ini
 * menu & DashCard TERPISAH ("Mapping Admin MC") di overview dashboard -
 * sekarang dirender sbg tab ke-3 di dalam DSE_ProdAR.jsx.
 *
 * UPDATE 2 (permintaan user - field: Region, Branch, MC, Nama Admin, Alamat
 * Email Admin; 1 email BOLEH dipasang ke lebih dari 1 MC, dan 1 MC BOLEH
 * punya lebih dari 1 email admin; kombinasi email+MC yang SAMA tidak boleh
 * dobel): kolom region & branch ditambahkan ke mf_dse_admin_mc_mapping,
 * unique constraint diganti dari UNIQUE(email) -> UNIQUE(email, mc).
 *
 * UPDATE 3 (permintaan user - "hilangkan bagian ini [form tambah manual],
 * download data, baru upload mapping"): form "Tambah Mapping Baru" manual
 * (dropdown Region/Branch/MC + input Email/Nama satu-satu) DIHAPUS. Diganti
 * alur: Download Data (export mapping yg sudah ada ke Excel, dipakai juga
 * sbg template) -> edit di Excel -> Upload Mapping (import massal). Upload
 * otomatis UPSERT per kombinasi email+MC: kombinasi yg sudah ada diperbarui,
 * yang belum ada ditambahkan. Update/tambah satu-satu tetap bisa lewat Excel
 * (download, ubah 1 baris, upload lagi) — tidak perlu form terpisah lagi.
 * Toggle status aktif/nonaktif & hapus baris tetap langsung dari tabel.
 *
 * Kelola daftar email Admin MC yang boleh login via OTP (tanpa password) dan
 * MC mana saja yang terpasang ke email itu. Dipakai oleh:
 *  - mf_dse_admin_mc_lookup (cek saat login — balikin SEMUA mc aktif)
 *  - mf_dse_admin_mc_login_apply (menerapkan role finance_mpx + partner_name
 *    gabungan ke profil setelah OTP berhasil)
 *  - mf_dse_admin_mc_has_access (dipakai RLS utk cek akses per-MC)
 *
 * UPDATE 4 (permintaan user): sempat ditambahkan section kedua "Upload
 * Mapping DSE (Partner/Branch/MC)" di sini juga, tapi lalu DIKEMBALIKAN —
 * fitur upload data DSE (Partner/Branch/MC/ID DSE) kini hanya ada di satu
 * tempat: tab "Database DSE" (SDP_DseDatabase.jsx), yang disederhanakan jadi
 * Download Data / Upload Data / Tabel. Tab ini tetap murni soal mapping
 * Admin MC (siapa yang boleh login sebagai Admin MC per MC).
 *
 * Hanya untuk role spm_sumatera (digate di DSE_ProdAR.jsx & page.jsx).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import {
  UserRoundCog, X, Check, AlertTriangle, Loader2, Search,
  RefreshCw, Trash2, Mail, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  Download, Upload, FileSpreadsheet, Info,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  const bg = type === "error" ? "#DC2626" : type === "warn" ? "#D97706" : "#16A34A";
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, left: 24, zIndex: 9999, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: bg, color: "#fff", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", maxWidth: 480, marginLeft: "auto" }}>
      {type === "error" ? <AlertTriangle size={15} /> : <Check size={15} />}
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, display: "flex" }}><X size={14} /></button>
    </div>
  );
}

// Kolom di file Excel (download/upload) — header baris 1, longgar (boleh beda urutan/huruf besar-kecil)
const COLMAP = {
  region: ["region"],
  branch: ["branch"],
  mc: ["mc"],
  full_name: ["nama admin", "nama", "full name", "full_name"],
  email: ["email admin", "alamat email admin", "email", "email_admin"],
  active: ["status", "active", "aktif"],
};

function normHeader(h) { return String(h || "").trim().toLowerCase(); }
function findCol(headers, aliases) { return headers.findIndex((h) => aliases.includes(normHeader(h))); }
function parseActive(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return true; // default aktif kalau kolom status kosong/tidak ada
  return !["nonaktif", "non aktif", "inactive", "false", "0", "no", "tidak"].includes(s);
}

function parseMappingWorkbook(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (!aoa.length) { resolve({ error: "File kosong." }); return; }
        const headers = aoa[0];
        const col = {};
        for (const key of Object.keys(COLMAP)) col[key] = findCol(headers, COLMAP[key]);
        if (col.mc < 0 || col.email < 0) {
          resolve({ error: `Kolom wajib tidak ditemukan. Pastikan ada kolom "MC" dan "Email Admin" di baris pertama.` });
          return;
        }
        const rows = [];
        const errors = [];
        const seenInFile = new Set();
        for (let i = 1; i < aoa.length; i++) {
          const line = aoa[i];
          if (!line || line.every((c) => c === "" || c == null)) continue;
          const email = String(line[col.email] ?? "").trim().toLowerCase();
          const mc = String(line[col.mc] ?? "").trim();
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`Baris ${i + 1}: email tidak valid.`); continue; }
          if (!mc) { errors.push(`Baris ${i + 1}: MC kosong.`); continue; }
          const key = `${email}|${mc.toLowerCase()}`;
          if (seenInFile.has(key)) { errors.push(`Baris ${i + 1}: kombinasi ${email} + ${mc} dobel di file ini (baris sebelumnya dipakai).`); continue; }
          seenInFile.add(key);
          rows.push({
            email, mc,
            region: col.region >= 0 ? (String(line[col.region] ?? "").trim() || null) : null,
            branch: col.branch >= 0 ? (String(line[col.branch] ?? "").trim() || null) : null,
            full_name: col.full_name >= 0 ? (String(line[col.full_name] ?? "").trim() || null) : null,
            active: col.active >= 0 ? parseActive(line[col.active]) : true,
          });
        }
        resolve({ rows, errors, totalRows: rows.length });
      } catch (err) {
        resolve({ error: err.message || "Gagal membaca file." });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export default function AdminMcMapping({ theme }) {
  const d = theme === "dark";
  const t = {
    card: d ? "#1A1A1D" : "#FFFFFF", sub: d ? "#202024" : "#F5F5F7",
    line: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)", hi: d ? "#F2F2F3" : "#1A1A1D",
    mid: d ? "#8A8A96" : "#5A5A68", lo: d ? "#5A5A68" : "#8A8A96",
    inputBg: d ? "#1E1E22" : "#F8F8FA", inputBd: d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)",
    teal: d ? "#32BCAD" : "#1A9E90", tealBg: d ? "rgba(50,188,173,0.10)" : "rgba(26,158,144,0.07)", tealBd: d ? "rgba(50,188,173,0.28)" : "rgba(26,158,144,0.20)",
    red: d ? "#F87171" : "#DC2626", redBg: d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)",
    amber: d ? "#FBBF24" : "#B45309", amberBg: d ? "rgba(251,191,36,0.10)" : "rgba(180,83,9,0.08)",
    shadowSm: d ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.07)",
  };

  const [rows, setRows] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "ok") => setToast({ msg, type });

  // Referensi MC asli dari mf_dse_database — dipakai cuma utk validasi ringan
  // (peringatan kalau MC di file upload tidak ditemukan di data DSE asli).
  const [refMcSet, setRefMcSet] = useState(new Set());
  const fetchRefData = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("mf_dse_database").select("mc").not("mc", "is", null);
      if (error) throw error;
      setRefMcSet(new Set((data || []).map((r) => String(r.mc).trim().toLowerCase())));
    } catch {
      // referensi gagal dimuat — upload tetap jalan, cuma tanpa peringatan MC tak dikenal
    }
  }, []);

  const fetchRows = useCallback(async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase.from("mf_dse_admin_mc_mapping").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      showToast(e.message || "Gagal memuat data.", "error");
    } finally {
      setFetching(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchRows(); fetchRefData(); }, []);

  const toggleActive = async (row) => {
    try {
      const { error } = await supabase.from("mf_dse_admin_mc_mapping").update({ active: !row.active }).eq("id", row.id);
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, active: !r.active } : r)));
    } catch (e) {
      showToast(e.message || "Gagal mengubah status.", "error");
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Hapus mapping ${row.email} → ${row.mc}?`)) return;
    try {
      const { error } = await supabase.from("mf_dse_admin_mc_mapping").delete().eq("id", row.id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showToast("Mapping dihapus.", "ok");
    } catch (e) {
      showToast(e.message || "Gagal menghapus.", "error");
    }
  };

  // ── Download Data (export + dipakai juga sbg template upload) ──────────────
  const handleDownload = () => {
    const head = ["Region", "Branch", "MC", "Nama Admin", "Email Admin", "Status"];
    const body = rows.map((r) => [r.region || "", r.branch || "", r.mc || "", r.full_name || "", r.email || "", r.active ? "Aktif" : "Nonaktif"]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...(body.length ? body : [["", "", "", "", "", ""]])]);
    ws["!cols"] = [{ wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 28 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mapping Admin MC");
    XLSX.writeFile(wb, `Mapping_Admin_MC_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`Data diunduh — ${rows.length} baris. File ini juga bisa dipakai sbg template upload.`, "ok");
  };

  // ── Upload Mapping (import massal, upsert per kombinasi email+MC) ──────────
  const [showUpload, setShowUpload] = useState(false);
  const [staged, setStaged] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const onPickFile = async (fileList) => {
    const f = (fileList || [])[0];
    if (!f) return;
    const p = await parseMappingWorkbook(f);
    if (!p.error && p.rows) {
      const unknownMc = refMcSet.size ? Array.from(new Set(p.rows.filter((r) => !refMcSet.has(r.mc.toLowerCase())).map((r) => r.mc))) : [];
      p.unknownMc = unknownMc;
      const existingKeys = new Set(rows.map((r) => `${r.email.toLowerCase()}|${r.mc.toLowerCase()}`));
      p.newCount = p.rows.filter((r) => !existingKeys.has(`${r.email}|${r.mc.toLowerCase()}`)).length;
      p.updateCount = p.rows.length - p.newCount;
    }
    setStaged({ fileName: f.name, ...p });
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!staged || staged.error || !staged.rows?.length) return;
    setUploading(true);
    try {
      const existingByKey = new Map(rows.map((r) => [`${r.email.toLowerCase()}|${r.mc.toLowerCase()}`, r]));
      const toInsert = [];
      const toUpdate = [];
      for (const r of staged.rows) {
        const key = `${r.email}|${r.mc.toLowerCase()}`;
        const match = existingByKey.get(key);
        if (match) toUpdate.push({ id: match.id, payload: { region: r.region, branch: r.branch, full_name: r.full_name, active: r.active } });
        else toInsert.push({ email: r.email, mc: r.mc, region: r.region, branch: r.branch, full_name: r.full_name, active: r.active });
      }
      if (toInsert.length) {
        const { error } = await supabase.from("mf_dse_admin_mc_mapping").insert(toInsert);
        if (error) throw error;
      }
      for (const u of toUpdate) {
        const { error } = await supabase.from("mf_dse_admin_mc_mapping").update(u.payload).eq("id", u.id); // eslint-disable-line no-await-in-loop
        if (error) throw error;
      }
      showToast(`Upload selesai — ${toInsert.length} baru, ${toUpdate.length} diperbarui.`, "ok");
      setStaged(null);
      fetchRows();
    } catch (e) {
      const dupMsg = e.code === "23505" || /duplicate key/i.test(e.message || "");
      showToast(dupMsg ? "Ada kombinasi email + MC yang sudah terdaftar — cek ulang file." : (e.message || "Gagal upload."), "error");
    } finally {
      setUploading(false);
    }
  };

  const emailMcCount = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => { const k = r.email?.toLowerCase(); if (!k) return; m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }, [rows]);
  const mcEmailCount = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => { const k = r.mc?.toLowerCase(); if (!k) return; m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.email?.toLowerCase().includes(s) || r.mc?.toLowerCase().includes(s) || r.full_name?.toLowerCase().includes(s)
      || r.region?.toLowerCase().includes(s) || r.branch?.toLowerCase().includes(s);
  });

  const inputStyle = { width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ fontFamily: FONT, color: t.hi }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <UserRoundCog size={20} color={t.teal} />
        <div style={{ fontSize: 19, fontWeight: 800 }}>Mapping & User Management</div>
      </div>
      <div style={{ fontSize: 13, color: t.mid, marginBottom: 20 }}>
        Daftarkan email Admin MC di sini supaya mereka bisa login langsung dengan kode OTP ke email (tanpa kata sandi) di{" "}
        <b style={{ color: t.hi }}>Login sebagai Admin MC</b>. Satu email bisa dipasang ke lebih dari satu MC (otomatis bisa akses semuanya),
        dan satu MC bisa punya lebih dari satu admin. Kelola lewat Excel: <b style={{ color: t.hi }}>Download Data</b> dulu, edit/tambah baris, lalu <b style={{ color: t.hi }}>Upload Mapping</b> lagi.
      </div>

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, flexWrap: "wrap" }}>
          <button onClick={handleDownload} style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <Download size={14} /> Download Data
          </button>
          <button onClick={() => setShowUpload((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <Upload size={14} /> Upload Mapping
            {showUpload ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {showUpload && (
          <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${t.line}` }}>
            <div style={{ fontSize: 12, color: t.mid, margin: "14px 0 12px", display: "flex", alignItems: "flex-start", gap: 6 }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1, minWidth: 0, lineHeight: 1.55 }}>
                Kolom wajib: <b style={{ color: t.hi }}>MC</b>, <b style={{ color: t.hi }}>Email Admin</b>. Kolom Region/Branch/Nama Admin/Status opsional.
                Kombinasi email+MC yang sudah ada akan <b style={{ color: t.hi }}>diperbarui</b>, yang belum ada akan <b style={{ color: t.hi }}>ditambahkan</b> — pakai file hasil Download Data sebagai template.
              </span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", borderRadius: 9, border: `1px dashed ${t.tealBd}`, background: t.tealBg, color: t.teal, fontSize: 13, fontWeight: 700, cursor: "pointer", width: "fit-content" }}>
              <FileSpreadsheet size={14} /> Pilih File…
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => onPickFile(e.target.files)} />
            </label>

            {staged && (
              <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, border: `1px solid ${staged.error ? t.redBg : t.line}`, background: staged.error ? t.redBg : t.sub }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <FileSpreadsheet size={15} color={staged.error ? t.red : t.teal} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staged.fileName}</div>
                    {staged.error ? (
                      <div style={{ fontSize: 12, color: t.red, marginTop: 2 }}>{staged.error}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: t.mid, marginTop: 2 }}>
                        {staged.totalRows} baris valid ({staged.newCount} baru, {staged.updateCount} diperbarui)
                        {staged.errors?.length ? `, ${staged.errors.length} baris dilewati` : ""}.
                      </div>
                    )}
                  </div>
                  {!staged.error && (
                    <button onClick={handleUpload} disabled={uploading || !staged.totalRows}
                      style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 8, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: uploading ? "default" : "pointer", opacity: uploading || !staged.totalRows ? 0.6 : 1, flexShrink: 0 }}>
                      {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
                      {uploading ? "Mengunggah…" : "Upload"}
                    </button>
                  )}
                  <button onClick={() => setStaged(null)} style={{ background: "none", border: "none", color: t.mid, cursor: "pointer", display: "flex", flexShrink: 0 }}><X size={15} /></button>
                </div>
                {!staged.error && staged.unknownMc?.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11.5, color: t.amber, background: t.amberBg, borderRadius: 8, padding: "7px 10px" }}>
                    MC tidak ditemukan di data DSE (tetap bisa diupload, tapi admin-nya belum akan melihat data apa pun sampai MC-nya benar): {staged.unknownMc.join(", ")}
                  </div>
                )}
                {staged.errors?.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11.5, color: t.mid, maxHeight: 120, overflowY: "auto" }}>
                    {staged.errors.slice(0, 20).map((e, i) => <div key={i}>{e}</div>)}
                    {staged.errors.length > 20 && <div>…dan {staged.errors.length - 20} lainnya.</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${t.line}` }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari email / MC / region / branch / nama…" style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <button onClick={fetchRows} title="Refresh" style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <RefreshCw size={14} className={fetching ? "spin" : ""} />
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: t.sub }}>
                {["REGION", "BRANCH", "MC", "NAMA ADMIN", "EMAIL", "STATUS", ""].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "9px 12px", color: t.mid, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={16} className="spin" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: t.mid }}>Belum ada mapping Admin MC. Download template lalu Upload Mapping untuk mulai.</td></tr>
              ) : filtered.map((r) => {
                const mcCount = emailMcCount.get(r.email?.toLowerCase()) || 1;
                const emailCount = mcEmailCount.get(r.mc?.toLowerCase()) || 1;
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${t.line}` }}>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: t.mid }}>{r.region || "-"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: t.mid }}>{r.branch || "-"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontWeight: 700 }}>
                      {r.mc}
                      {emailCount > 1 && (
                        <span title={`MC ini punya ${emailCount} admin`} style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: t.amber, background: t.amberBg, borderRadius: 6, padding: "1px 6px" }}>{emailCount} admin</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: t.mid }}>{r.full_name || "-"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                      <Mail size={12} color={t.lo} />{r.email}
                      {mcCount > 1 && (
                        <span title={`Email ini terpasang ke ${mcCount} MC`} style={{ fontSize: 10, fontWeight: 700, color: t.teal, background: t.tealBg, borderRadius: 6, padding: "1px 6px" }}>{mcCount} MC</span>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <button onClick={() => toggleActive(r)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: r.active ? t.teal : t.lo, fontSize: 12, fontWeight: 700 }}>
                        {r.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        {r.active ? "Aktif" : "Nonaktif"}
                      </button>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => handleDelete(r)} title="Hapus" style={{ background: "none", border: "none", color: t.red, cursor: "pointer", display: "inline-flex" }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
