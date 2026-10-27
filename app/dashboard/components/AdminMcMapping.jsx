"use client";
/**
 * AdminMcMapping.jsx — tab "Mapping & User Management" (di dalam DSE Prod. & AR)
 *
 * UPDATE (permintaan user - "mapping admin mc itu seharusnya didalam dse
 * prod, bukan menjadi menu terpisah, namanya user management" ->
 * "harusnya nama sub menunya mapping dan user management"): dulu ini
 * menu & DashCard TERPISAH ("Mapping Admin MC") di overview dashboard -
 * sekarang dirender sbg tab di dalam DSE_ProdAR.jsx.
 *
 * UPDATE 2 (permintaan user - field: Region, Branch, MC, Nama Admin, Alamat
 * Email Admin; 1 email BOLEH dipasang ke lebih dari 1 MC, dan 1 MC BOLEH
 * punya lebih dari 1 email admin): kolom region & branch ditambahkan ke
 * mf_dse_admin_mc_mapping, unique constraint UNIQUE(email, mc).
 *
 * UPDATE 3: form "Tambah Mapping Baru" manual DIHAPUS, diganti Download
 * Data (template) -> edit di Excel -> Upload Mapping (import massal).
 *
 * UPDATE 4 (permintaan user - "mapping & user management ini akan mengambil
 * dari data database dse yang cocok tiap bulannya"): sempat dicoba Region/
 * Branch/Circle SELALU diambil live dari Database DSE per MC (bukan dari
 * file) — KEMUDIAN DIBATALKAN di Update 6 di bawah.
 *
 * UPDATE 5 (permintaan user - error "Kolom wajib tidak ditemukan... Alamat
 * Email Admin" + "saya akan pilih untuk kolom kolomnya, pilih header sama
 * seperti database dse, dan juga untuk alamat email ini bisa kita put
 * belakangan saja di webnya"): upload widget manual (COLMAP/parse sendiri)
 * DIHAPUS, diganti PNL_ImportWizard (pilih file -> preview & pilih sheet ->
 * set baris header -> cocokkan kolom via dropdown), sama persis dgn pola
 * Database DSE. Skema tabel DIRESTRUKTUR dari "satu baris per email" jadi
 * "satu baris per MC" (kolom email_1/email_2, boleh kosong) supaya:
 *  (a) upload cukup wajib isi MC (email opsional di file), dan
 *  (b) field lain bisa diisi/diedit langsung di tabel web ini (inline edit,
 *      upsert per MC) tanpa perlu re-upload.
 *
 * UPDATE 6 (permintaan user - "jangan hanya micro cluster" / "langsung
 * masukkan saja disini, tidak perlu otomatis, kita mapping saja nama branch
 * region dan mc-nya"): live-lookup OTOMATIS dari Database DSE DIBATALKAN.
 * Circle/Region/Branch sekarang kolom BIASA — dicocokkan langsung dari file
 * upload (lewat PNL_ImportWizard, sama seperti MC/Nama Admin/Email) dan bisa
 * diedit manual langsung di tabel ini. dseRefMap (Database DSE) cuma dipakai
 * utk menampilkan daftar MC yang BELUM punya mapping sama sekali, supaya SPM
 * tahu MC mana yang perlu ditambahkan — bukan utk menimpa data yang sudah ada.
 *
 * Kelola daftar email Admin MC yang boleh login via OTP (tanpa password) dan
 * MC mana saja yang terpasang ke email itu. Dipakai oleh:
 *  - mf_dse_admin_mc_lookup (cek saat login — balikin SEMUA mc aktif)
 *  - mf_dse_admin_mc_login_apply (menerapkan role finance_mpx + partner_name
 *    gabungan ke profil setelah OTP berhasil)
 *  - mf_dse_admin_mc_has_access (dipakai RLS utk cek akses per-MC)
 *
 * Hanya untuk role spm_sumatera (digate di DSE_ProdAR.jsx & page.jsx).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import {
  UserRoundCog, X, Check, AlertTriangle, Loader2, Search,
  RefreshCw, Trash2, ToggleLeft, ToggleRight, Download, Upload,
} from "lucide-react";
import PNL_ImportWizard from "./PNL_ImportWizard";

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

// UPDATE 7 (permintaan user - "jika ada periode maka untuk semua data
// mapping & user management harus di set per periode juga"): saat Input
// Harian sedang menampilkan tanggal/periode di MASA LALU (bukan hari ini),
// tab ini sekarang ikut menampilkan mapping yang BERLAKU pada tanggal itu
// (bukan selalu mapping TERKINI) — lewat RPC mf_dse_admin_mc_mapping_as_of,
// yang baca tabel riwayat (mf_dse_admin_mc_mapping_history, diisi otomatis
// oleh trigger tiap mapping berubah). Mode historis ini READ-ONLY (tidak
// ada edit/upload/hapus — data masa lalu tidak boleh diubah), supaya logic
// "lagi ngedit tanggal berapa" tidak pernah ambigu.
export default function AdminMcMapping({ theme, asOfDate, asOfLabel }) {
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

  // Referensi dari mf_dse_database (Database DSE) — HANYA dipakai utk
  // menampilkan daftar MC yang BELUM punya baris mapping sama sekali
  // (baris "baru" siap diisi), bukan utk menimpa data mapping yang sudah
  // ada (lihat UPDATE 6 di atas). Kalau satu MC muncul di beberapa baris
  // Database DSE, dipakai kemunculan PERTAMA.
  const [dseRefMap, setDseRefMap] = useState(new Map());
  const fetchRefData = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("mf_dse_database").select("mc, region, branch, circle").not("mc", "is", null);
      if (error) throw error;
      const map = new Map();
      (data || []).forEach((r) => {
        const key = String(r.mc).trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, { mc: r.mc, region: r.region, branch: r.branch, circle: r.circle });
      });
      setDseRefMap(map);
    } catch {
      // referensi gagal dimuat — tabel tetap jalan, cuma tanpa lookup/peringatan MC tak dikenal
    }
  }, []);

  const isHistorical = !!asOfDate;

  const fetchRows = useCallback(async () => {
    setFetching(true);
    try {
      if (isHistorical) {
        const { data, error } = await supabase.rpc("mf_dse_admin_mc_mapping_as_of", { p_as_of: asOfDate });
        if (error) throw error;
        const sorted = (data || []).slice().sort((a, b) => (a.mc || "").localeCompare(b.mc || ""));
        setRows(sorted);
        return sorted;
      }
      const { data, error } = await supabase.from("mf_dse_admin_mc_mapping").select("*").order("mc", { ascending: true });
      if (error) throw error;
      setRows(data || []);
      return data || [];
    } catch (e) {
      showToast(e.message || "Gagal memuat data.", "error");
      return [];
    } finally {
      setFetching(false);
    }
  }, [isHistorical, asOfDate]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchRows(); if (!isHistorical) fetchRefData(); }, [fetchRows, fetchRefData, isHistorical]);

  const toggleActive = async (row) => {
    if (isHistorical) return;
    try {
      const { error } = await supabase.from("mf_dse_admin_mc_mapping").update({ active: !row.active }).eq("id", row.id);
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, active: !r.active } : r)));
    } catch (e) {
      showToast(e.message || "Gagal mengubah status.", "error");
    }
  };

  const handleDelete = async (row) => {
    if (isHistorical) return;
    if (!window.confirm(`Hapus mapping MC ${row.mc}?`)) return;
    try {
      const { error } = await supabase.from("mf_dse_admin_mc_mapping").delete().eq("id", row.id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showToast("Mapping dihapus.", "ok");
    } catch (e) {
      showToast(e.message || "Gagal menghapus.", "error");
    }
  };

  // ── Edit langsung di tabel (Circle / Region / Branch / Nama Admin / Email
  // Admin 1 / Email Admin 2) — UPSERT per MC (onConflict "mc"): kalau baris
  // utk MC itu belum ada (msh "virtual", dari Database DSE tapi belum ada
  // mapping-nya), otomatis dibuat. Field yg tidak diedit tetap pakai nilai
  // yang sudah tersimpan (tidak ada lagi override otomatis dari Database
  // DSE — lihat UPDATE 6 di atas). ──
  const [savingKey, setSavingKey] = useState(null);
  const EDITABLE_FIELDS = ["circle", "region", "branch", "full_name", "email_1", "email_2"];
  const handleCellBlur = async (mc, field, value) => {
    if (isHistorical) return;
    const key = mc.toLowerCase();
    const existing = rows.find((r) => r.mc?.toLowerCase() === key);
    const trimmed = value.trim();
    if (existing && (existing[field] || "") === trimmed) return; // tidak berubah
    const payload = { mc, active: existing?.active ?? true };
    EDITABLE_FIELDS.forEach((f) => {
      payload[f] = f === field ? (trimmed || null) : (existing?.[f] || null);
    });
    setSavingKey(key);
    try {
      const { data, error } = await supabase.from("mf_dse_admin_mc_mapping").upsert(payload, { onConflict: "mc" }).select().single();
      if (error) throw error;
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === data.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = data; return next; }
        return [...prev, data].sort((a, b) => (a.mc || "").localeCompare(b.mc || ""));
      });
    } catch (e) {
      showToast(e.message || "Gagal menyimpan.", "error");
    } finally {
      setSavingKey(null);
    }
  };

  // Baris yang ditampilkan = baris mapping yg sudah ada, DIGABUNG dgn MC dari
  // Database DSE yang BELUM punya mapping sama sekali (baris "kosong" siap
  // diisi langsung dari tabel ini, tanpa perlu upload dulu).
  const displayRows = useMemo(() => {
    const byMc = new Map();
    rows.forEach((r) => { if (r.mc) byMc.set(r.mc.toLowerCase(), r); });
    // MC dari Database DSE yang belum punya mapping sama sekali tetap
    // dimunculkan (baris "baru", region/branch/circle disarankan dari sana
    // sbg titik awal) supaya gampang dilengkapi — bukan utk menimpa baris
    // yang sudah ada.
    dseRefMap.forEach((ref, key) => {
      if (byMc.has(key)) return;
      byMc.set(key, { id: null, mc: ref.mc, region: ref.region, branch: ref.branch, circle: ref.circle, full_name: "", email_1: "", email_2: "", active: true });
    });
    return Array.from(byMc.values()).sort((a, b) => (a.mc || "").localeCompare(b.mc || ""));
  }, [rows, dseRefMap]);

  const filtered = displayRows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.mc?.toLowerCase().includes(s) || r.full_name?.toLowerCase().includes(s)
      || r.email_1?.toLowerCase().includes(s) || r.email_2?.toLowerCase().includes(s)
      || r.region?.toLowerCase().includes(s) || r.branch?.toLowerCase().includes(s) || r.circle?.toLowerCase().includes(s);
  });

  // ── Download Data (export + dipakai juga sbg template upload) ──────────────
  const handleDownload = () => {
    const head = ["Circle", "Region", "Branch", "Micro Cluster", "Nama Admin", "Alamat Email Admin 1", "Alamat Email Admin 2", "Status"];
    const body = displayRows.map((m) => [m.circle || "", m.region || "", m.branch || "", m.mc || "", m.full_name || "", m.email_1 || "", m.email_2 || "", m.active === false ? "Nonaktif" : "Aktif"]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...(body.length ? body : [["", "", "", "", "", "", "", ""]])]);
    ws["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 28 }, { wch: 28 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mapping Admin MC");
    XLSX.writeFile(wb, `Mapping_Admin_MC_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`Data diunduh — ${body.length} MC. File ini juga bisa dipakai sbg template upload.`, "ok");
  };

  // ── Upload Mapping — sekarang lewat PNL_ImportWizard (pilih file ->
  // preview data & pilih sheet -> set baris header -> cocokkan kolom lewat
  // dropdown -> upsert langsung ke mf_dse_admin_mc_mapping per MC), bukan
  // parse manual lagi. Lihat <PNL_ImportWizard formTypeProp="admin_mc_mapping"
  // lockTarget> di bawah; target sudah didefinisikan di FORM_DEFS wizard
  // dgn kolom: Micro Cluster (wajib), Circle, Region, Branch, Nama Admin,
  // Alamat Email Admin 1/2 (selain MC, semua opsional — bisa diisi/diedit
  // belakangan langsung di tabel ini).
  const [showWizard, setShowWizard] = useState(false);

  const inputStyle = { width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
  const cellInputStyle = { width: "100%", height: 30, padding: "0 8px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ fontFamily: FONT, color: t.hi }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <UserRoundCog size={20} color={t.teal} />
            <div style={{ fontSize: 19, fontWeight: 800 }}>Mapping & User Management</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={handleDownload} style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <Download size={14} /> Download Data
            </button>
            {!isHistorical && (
              <button onClick={() => setShowWizard(true)} style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Upload size={14} /> Upload Mapping
              </button>
            )}
          </div>
        </div>
        {isHistorical && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: `1px solid ${t.line}`, background: t.amberBg }}>
            <AlertTriangle size={15} color={t.amber} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: t.amber }}>
              Menampilkan mapping yang berlaku pada {asOfLabel || new Date(asOfDate).toLocaleDateString("id-ID")} (riwayat) — mode baca saja, tidak bisa diedit/diupload. Kembali ke Tanggal &ldquo;Hari Ini&rdquo; di tab Input Harian utk mengedit mapping terkini.
            </div>
          </div>
        )}
      </div>

      {showWizard && !isHistorical && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflowY: "auto" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowWizard(false); fetchRows(); } }}>
          <div style={{ width: "100%", maxWidth: 1040, background: d ? "#0E0E10" : "#F5F5F7", borderRadius: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", position: "relative", padding: 18 }}>
            <button onClick={() => { setShowWizard(false); fetchRows(); }}
              style={{ position: "absolute", top: 14, right: 14, zIndex: 10, width: 32, height: 32, borderRadius: 999, border: "none", background: d ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)", color: t.hi, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={16} />
            </button>
            <PNL_ImportWizard theme={theme} supabase={supabase} formTypeProp="admin_mc_mapping" lockTarget />
          </div>
        </div>
      )}

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${t.line}` }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari MC / circle / region / branch / nama / email…" style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <button onClick={fetchRows} title="Refresh" style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <RefreshCw size={14} className={fetching ? "spin" : ""} />
          </button>
        </div>

        <div style={{ padding: "8px 16px", fontSize: 11.5, color: t.mid, borderBottom: `1px solid ${t.line}` }}>
          Circle, Region, Branch, Nama Admin & Alamat Email bisa langsung diketik di tabel ini — tidak perlu upload ulang.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: t.sub }}>
                {["CIRCLE", "REGION", "BRANCH", "MC", "NAMA ADMIN", "EMAIL ADMIN 1", "EMAIL ADMIN 2", "STATUS", ""].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "9px 12px", color: t.mid, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={16} className="spin" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: t.mid }}>Belum ada MC. Tambahkan dulu di Database DSE, lalu isi admin-nya di sini.</td></tr>
              ) : filtered.map((r) => {
                const key = r.mc?.toLowerCase();
                const isVirtual = !r.id;
                return (
                  <tr key={r.mc} style={{ borderBottom: `1px solid ${t.line}`, opacity: isVirtual ? 0.85 : 1 }}>
                    <td style={{ padding: "6px 10px", minWidth: 110 }}>
                      <input key={`${r.mc}-ci-${r.circle || ""}`} defaultValue={r.circle || ""} placeholder="-"
                        onBlur={(e) => handleCellBlur(r.mc, "circle", e.target.value)} disabled={isHistorical} style={cellInputStyle} />
                    </td>
                    <td style={{ padding: "6px 10px", minWidth: 130 }}>
                      <input key={`${r.mc}-re-${r.region || ""}`} defaultValue={r.region || ""} placeholder="-"
                        onBlur={(e) => handleCellBlur(r.mc, "region", e.target.value)} disabled={isHistorical} style={cellInputStyle} />
                    </td>
                    <td style={{ padding: "6px 10px", minWidth: 130 }}>
                      <input key={`${r.mc}-br-${r.branch || ""}`} defaultValue={r.branch || ""} placeholder="-"
                        onBlur={(e) => handleCellBlur(r.mc, "branch", e.target.value)} disabled={isHistorical} style={cellInputStyle} />
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontWeight: 700 }}>
                      {r.mc}
                      {isVirtual && <span title="MC ini belum punya mapping — langsung isi di baris ini" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: t.amber, background: t.amberBg, borderRadius: 6, padding: "1px 6px" }}>baru</span>}
                    </td>
                    <td style={{ padding: "6px 10px", minWidth: 150 }}>
                      <input key={`${r.mc}-fn-${r.full_name || ""}`} defaultValue={r.full_name || ""} placeholder="—"
                        onBlur={(e) => handleCellBlur(r.mc, "full_name", e.target.value)} disabled={isHistorical} style={cellInputStyle} />
                    </td>
                    <td style={{ padding: "6px 10px", minWidth: 190 }}>
                      <input key={`${r.mc}-e1-${r.email_1 || ""}`} defaultValue={r.email_1 || ""} placeholder="Belum diisi"
                        onBlur={(e) => handleCellBlur(r.mc, "email_1", e.target.value)} disabled={isHistorical} style={cellInputStyle} />
                    </td>
                    <td style={{ padding: "6px 10px", minWidth: 190 }}>
                      <input key={`${r.mc}-e2-${r.email_2 || ""}`} defaultValue={r.email_2 || ""} placeholder="Belum diisi"
                        onBlur={(e) => handleCellBlur(r.mc, "email_2", e.target.value)} disabled={isHistorical} style={cellInputStyle} />
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {savingKey === key ? (
                        <Loader2 size={14} className="spin" color={t.mid} />
                      ) : isVirtual || isHistorical ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: r.active ? t.teal : t.lo }}>
                          {r.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          {isVirtual ? "—" : r.active ? "Aktif" : "Nonaktif"}
                        </span>
                      ) : (
                        <button onClick={() => toggleActive(r)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: r.active ? t.teal : t.lo, fontSize: 12, fontWeight: 700 }}>
                          {r.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          {r.active ? "Aktif" : "Nonaktif"}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {!isVirtual && !isHistorical && (
                        <button onClick={() => handleDelete(r)} title="Hapus" style={{ background: "none", border: "none", color: t.red, cursor: "pointer", display: "inline-flex" }}><Trash2 size={14} /></button>
                      )}
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
