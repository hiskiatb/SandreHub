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
 * UPDATE 7 (permintaan user - "jika ada periode maka untuk semua data
 * mapping & user management harus di set per periode juga"): saat Input
 * Harian sedang menampilkan tanggal/periode di MASA LALU (bukan hari ini),
 * tab ini sekarang ikut menampilkan mapping yang BERLAKU pada tanggal itu
 * (bukan selalu mapping TERKINI) — lewat RPC mf_dse_admin_mc_mapping_as_of,
 * yang baca tabel riwayat (mf_dse_admin_mc_mapping_history, diisi otomatis
 * oleh trigger tiap mapping berubah). Mode historis ini READ-ONLY (tidak
 * ada edit/upload/hapus — data masa lalu tidak boleh diubah), supaya logic
 * "lagi ngedit tanggal berapa" tidak pernah ambigu.
 *
 * UPDATE 8 (permintaan user - "satu mc bisa jadi ada beberapa email" /
 * "jika semisal email yang sama bisa dimapping ke beberapa mc sekaligus,
 * berarti dia memiliki akses ke beberapa akses sekaligus, buat dengan
 * sangat rapih logicnya"): kolom email_1/email_2 (maks 2 email per MC)
 * DIHAPUS TOTAL dari mf_dse_admin_mc_mapping. Email sekarang relasi
 * many-to-many SEBENARNYA lewat tabel mf_dse_admin_mc_emails (1 baris per
 * pasangan MC+email) — 1 MC boleh punya email admin sebanyak apapun, dan
 * email yang sama tetap boleh dipasang ke banyak MC (otomatis dapat akses
 * gabungan ke semua MC itu — logic ini TIDAK berubah, cuma sumber datanya
 * dipindah). Kelola email per MC lewat tombol "Kelola Email" (popover per
 * baris, tambah/hapus email satu per satu), atau impor massal lewat
 * "Upload Daftar Email" (parser Excel terpisah di bawah, BUKAN lewat
 * PNL_ImportWizard — wizard itu cuma bisa upsert 1 baris per primary key
 * (mc), sedangkan email butuh banyak baris per mc, jadi logic-nya beda dan
 * sengaja dipisah supaya wizard generik yang dipakai form2 lain tidak
 * ikut berubah/berisiko).
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

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import {
  UserRoundCog, X, Check, AlertTriangle, Loader2, Search,
  RefreshCw, Trash2, ToggleLeft, ToggleRight, Download, Upload,
  Mail, Plus, ChevronDown, ChevronUp,
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

// Pecah 1 sel email yang berisi beberapa alamat (dipisah koma/titik-koma),
// masing2 boleh ada anotasi "(label)" di belakangnya — persis bentuk data
// riil yang pernah ditemukan ("admin1@x.com (saldo), admin2@x.com (3id)").
// Dipakai baik oleh parser upload massal maupun (tidak langsung) jadi acuan
// kenapa UI "Kelola Email" per-MC dibuat bisa menampung banyak baris.
function splitEmailCell(raw) {
  if (!raw) return [];
  const parts = String(raw).split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const m = p.match(/^(\S+@\S+?)\s*(?:\(([^)]*)\))?$/);
    if (m) {
      const email = m[1].trim().replace(/[.,;]+$/, "");
      const label = m[2] ? m[2].trim() : null;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.push({ email: email.toLowerCase(), label });
    } else {
      const m2 = p.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (m2) out.push({ email: m2[0].toLowerCase(), label: null });
    }
  }
  return out;
}

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
  // emailsByMc: Map<mc_lowercase, Array<{id, mapping_id, email, label, active}>>
  // — tidak selalu jadi mapping_id langsung karena baris "virtual" (MC dari
  // Database DSE yang belum ada mapping-nya) belum punya mapping_id.
  const [emailsByMc, setEmailsByMc] = useState(new Map());
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
        // mf_dse_admin_mc_mapping_as_of sekarang balikin kolom "emails"
        // (jsonb array {email,label}) langsung, bukan email_1/email_2 lagi
        // — hasil gabungan baris email LIVE + HISTORY yg berlaku pd tanggal
        // itu (lihat migrasi admin_mc_emails_normalize).
        const { data, error } = await supabase.rpc("mf_dse_admin_mc_mapping_as_of", { p_as_of: asOfDate });
        if (error) throw error;
        const sorted = (data || []).slice().sort((a, b) => (a.mc || "").localeCompare(b.mc || ""));
        const byMc = new Map();
        sorted.forEach((r) => {
          byMc.set((r.mc || "").toLowerCase(), (r.emails || []).map((e, i) => ({ id: `h${i}`, mapping_id: null, email: e.email, label: e.label, active: true })));
        });
        setEmailsByMc(byMc);
        setRows(sorted);
        return sorted;
      }
      const [mapRes, emailRes] = await Promise.all([
        supabase.from("mf_dse_admin_mc_mapping").select("*").order("mc", { ascending: true }),
        supabase.from("mf_dse_admin_mc_emails").select("*").order("email", { ascending: true }),
      ]);
      if (mapRes.error) throw mapRes.error;
      if (emailRes.error) throw emailRes.error;
      const mapById = new Map((mapRes.data || []).map((m) => [m.id, m.mc]));
      const byMc = new Map();
      (emailRes.data || []).forEach((e) => {
        const mc = mapById.get(e.mapping_id);
        if (!mc) return;
        const key = mc.toLowerCase();
        if (!byMc.has(key)) byMc.set(key, []);
        byMc.get(key).push(e);
      });
      setEmailsByMc(byMc);
      setRows(mapRes.data || []);
      return mapRes.data || [];
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
    if (!window.confirm(`Hapus mapping MC ${row.mc}? Semua email admin yang terpasang di MC ini juga akan terhapus.`)) return;
    try {
      const { error } = await supabase.from("mf_dse_admin_mc_mapping").delete().eq("id", row.id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showToast("Mapping dihapus.", "ok");
    } catch (e) {
      showToast(e.message || "Gagal menghapus.", "error");
    }
  };

  // ── Edit langsung di tabel (Circle / Region / Branch / Nama Admin) —
  // UPSERT per MC (onConflict "mc"): kalau baris utk MC itu belum ada (msh
  // "virtual", dari Database DSE tapi belum ada mapping-nya), otomatis
  // dibuat. Field yg tidak diedit tetap pakai nilai yang sudah tersimpan. ──
  const [savingKey, setSavingKey] = useState(null);
  const EDITABLE_FIELDS = ["circle", "region", "branch", "full_name"];
  const ensureMappingRow = useCallback(async (mc) => {
    const key = mc.toLowerCase();
    const existing = rows.find((r) => r.mc?.toLowerCase() === key);
    if (existing?.id) return existing;
    const ref = dseRefMap.get(key);
    const payload = { mc, active: true, circle: ref?.circle || null, region: ref?.region || null, branch: ref?.branch || null };
    const { data, error } = await supabase.from("mf_dse_admin_mc_mapping").upsert(payload, { onConflict: "mc" }).select().single();
    if (error) throw error;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === data.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = data; return next; }
      return [...prev, data].sort((a, b) => (a.mc || "").localeCompare(b.mc || ""));
    });
    return data;
  }, [rows, dseRefMap]);

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

  // ── Kelola Email per-MC (popover) — tambah/hapus email satu per satu,
  // tanpa batas jumlah. Baris "virtual" (belum ada mapping-nya) otomatis
  // dibuatkan baris mapping dulu (ensureMappingRow) sebelum email pertama
  // ditambahkan. ──────────────────────────────────────────────────────
  const [emailPanelMc, setEmailPanelMc] = useState(null); // mc string, null = tertutup
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const addEmail = async (mc) => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("Masukkan email yang valid.", "error"); return; }
    setEmailBusy(true);
    try {
      const mapping = await ensureMappingRow(mc);
      const { data, error } = await supabase.from("mf_dse_admin_mc_emails")
        .insert({ mapping_id: mapping.id, email, label: newLabel.trim() || null, active: true })
        .select().single();
      if (error) {
        if (String(error.code) === "23505") throw new Error("Email ini sudah terpasang di MC ini.");
        throw error;
      }
      setEmailsByMc((prev) => {
        const next = new Map(prev);
        const key = mc.toLowerCase();
        next.set(key, [...(next.get(key) || []), data]);
        return next;
      });
      setNewEmail(""); setNewLabel("");
      showToast(`Email ditambahkan ke ${mc}.`, "ok");
    } catch (e) {
      showToast(e.message || "Gagal menambahkan email.", "error");
    } finally {
      setEmailBusy(false);
    }
  };

  const removeEmail = async (mc, emailRow) => {
    if (!window.confirm(`Hapus ${emailRow.email} dari ${mc}?`)) return;
    setEmailBusy(true);
    try {
      const { error } = await supabase.from("mf_dse_admin_mc_emails").delete().eq("id", emailRow.id);
      if (error) throw error;
      setEmailsByMc((prev) => {
        const next = new Map(prev);
        const key = mc.toLowerCase();
        next.set(key, (next.get(key) || []).filter((e) => e.id !== emailRow.id));
        return next;
      });
      showToast("Email dihapus.", "ok");
    } catch (e) {
      showToast(e.message || "Gagal menghapus email.", "error");
    } finally {
      setEmailBusy(false);
    }
  };

  const toggleEmailActive = async (mc, emailRow) => {
    setEmailBusy(true);
    try {
      const { error } = await supabase.from("mf_dse_admin_mc_emails").update({ active: !emailRow.active }).eq("id", emailRow.id);
      if (error) throw error;
      setEmailsByMc((prev) => {
        const next = new Map(prev);
        const key = mc.toLowerCase();
        next.set(key, (next.get(key) || []).map((e) => (e.id === emailRow.id ? { ...e, active: !e.active } : e)));
        return next;
      });
    } catch (e) {
      showToast(e.message || "Gagal mengubah status email.", "error");
    } finally {
      setEmailBusy(false);
    }
  };

  // Baris yang ditampilkan = baris mapping yg sudah ada, DIGABUNG dgn MC dari
  // Database DSE yang BELUM punya mapping sama sekali (baris "kosong" siap
  // diisi langsung dari tabel ini, tanpa perlu upload dulu).
  const displayRows = useMemo(() => {
    const byMc = new Map();
    rows.forEach((r) => { if (r.mc) byMc.set(r.mc.toLowerCase(), r); });
    dseRefMap.forEach((ref, key) => {
      if (byMc.has(key)) return;
      byMc.set(key, { id: null, mc: ref.mc, region: ref.region, branch: ref.branch, circle: ref.circle, full_name: "", active: true });
    });
    return Array.from(byMc.values()).sort((a, b) => (a.mc || "").localeCompare(b.mc || ""));
  }, [rows, dseRefMap]);

  // UPDATE (permintaan user - "coba kelompokkan / rapatkan urutan yang
  // dalam satu email memiliki email yang sama"): 1 email boleh dipasang
  // ke BANYAK MC sekaligus (lihat komentar UPDATE 8 di atas) - tapi
  // selama ini baris2-nya tersebar sesuai urutan alfabet MC, jadi MC2
  // yang dipegang admin yang SAMA keliatan nyebar/ga nyambung di tabel.
  // Sekarang baris dikelompokkan per email (gabungan semua alamat email
  // yang terpasang di MC itu, diurutkan & digabung jadi 1 key per MC) -
  // grup diurutkan alfabet per key-nya supaya konsisten/predictable,
  // MC TANPA email sama sekali ditaruh di paling akhir (bukan baris
  // "kosong" nyelip di antara grup2 email), & di dalam 1 grup tetap
  // diurutkan alfabet per nama MC (stabil, sama kayak urutan lama).
  const emailGroupKey = (mc) => {
    const emails = emailsByMc.get(mc?.toLowerCase()) || [];
    const active = emails.filter((e) => e.active !== false);
    if (active.length === 0) return null;
    return active.map((e) => e.email?.toLowerCase() || "").sort().join(",");
  };

  const filtered = displayRows
    .filter((r) => {
      if (!search) return true;
      const s = search.toLowerCase();
      const emails = emailsByMc.get(r.mc?.toLowerCase()) || [];
      return r.mc?.toLowerCase().includes(s) || r.full_name?.toLowerCase().includes(s)
        || r.region?.toLowerCase().includes(s) || r.branch?.toLowerCase().includes(s) || r.circle?.toLowerCase().includes(s)
        || emails.some((e) => e.email?.toLowerCase().includes(s) || e.label?.toLowerCase().includes(s));
    })
    .slice()
    .sort((a, b) => {
      const ka = emailGroupKey(a.mc);
      const kb = emailGroupKey(b.mc);
      if (ka === null && kb === null) return (a.mc || "").localeCompare(b.mc || "");
      if (ka === null) return 1; // MC tanpa email -> selalu di akhir
      if (kb === null) return -1;
      return ka.localeCompare(kb) || (a.mc || "").localeCompare(b.mc || "");
    });

  // ── Download Data (export + dipakai juga sbg template upload massal
  // utk MASTER MC — Circle/Region/Branch/Nama Admin saja; email tidak lagi
  // dipasang di sini sejak UPDATE 8, lihat handleDownloadEmails) ──────────
  const handleDownload = () => {
    const head = ["Circle", "Region", "Branch", "Micro Cluster", "Nama Admin", "Status"];
    const body = displayRows.map((m) => [m.circle || "", m.region || "", m.branch || "", m.mc || "", m.full_name || "", m.active === false ? "Nonaktif" : "Aktif"]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...(body.length ? body : [["", "", "", "", "", ""]])]);
    ws["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mapping Admin MC");
    XLSX.writeFile(wb, `Mapping_Admin_MC_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`Data diunduh — ${body.length} MC. File ini juga bisa dipakai sbg template upload.`, "ok");
  };

  // ── Download/Upload Daftar Email (massal, terpisah dari master MC) —
  // bentuknya SATU BARIS PER EMAIL (sama seperti sumber data riil: Micro
  // Cluster, Nama Admin, Alamat Email), supaya 1 MC boleh muncul di banyak
  // baris (1 per email) — ini yg bikin tidak terbatas 2 email/MC lagi. ───
  const handleDownloadEmails = () => {
    const head = ["Micro Cluster", "Nama Admin / Label", "Alamat Email", "Status"];
    const body = [];
    displayRows.forEach((m) => {
      const emails = emailsByMc.get(m.mc?.toLowerCase()) || [];
      if (emails.length === 0) { body.push([m.mc || "", "", "", ""]); return; }
      emails.forEach((e) => body.push([m.mc || "", e.label || "", e.email || "", e.active === false ? "Nonaktif" : "Aktif"]));
    });
    const ws = XLSX.utils.aoa_to_sheet([head, ...(body.length ? body : [["", "", "", ""]])]);
    ws["!cols"] = [{ wch: 22 }, { wch: 28 }, { wch: 30 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daftar Email Admin MC");
    XLSX.writeFile(wb, `Daftar_Email_Admin_MC_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`Daftar email diunduh — ${body.length} baris. File ini juga bisa dipakai sbg template upload.`, "ok");
  };

  const emailFileRef = useRef(null);
  const [importingEmails, setImportingEmails] = useState(false);

  const handleUploadEmailsFile = async (file) => {
    if (!file) return;
    setImportingEmails(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rowsRaw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (!rowsRaw.length) throw new Error("File kosong.");
      const header = rowsRaw[0].map((h) => String(h || "").trim().toLowerCase());
      const idxMc = header.findIndex((h) => /micro ?cluster|^mc$/.test(h));
      const idxLabel = header.findIndex((h) => /nama admin|label/.test(h));
      const idxEmail = header.findIndex((h) => /email/.test(h));
      if (idxMc === -1 || idxEmail === -1) {
        throw new Error('Kolom wajib tidak ditemukan. Pastikan ada kolom "Micro Cluster" dan "Alamat Email" (boleh berisi lebih dari 1 email dipisah koma).');
      }
      let addedCount = 0, skippedCount = 0, mcTouched = 0;
      for (let i = 1; i < rowsRaw.length; i++) {
        const line = rowsRaw[i];
        const mc = String(line[idxMc] || "").trim();
        if (!mc) continue;
        const labelRaw = idxLabel >= 0 ? String(line[idxLabel] || "").trim() : "";
        const emailCell = String(line[idxEmail] || "").trim();
        if (!emailCell) continue;
        const pieces = splitEmailCell(emailCell);
        if (!pieces.length) { skippedCount++; continue; }
        const mapping = await ensureMappingRow(mc);
        mcTouched++;
        for (const piece of pieces) {
          const label = pieces.length > 1 && piece.label ? piece.label.toUpperCase() : (labelRaw || piece.label || null);
          const { error } = await supabase.from("mf_dse_admin_mc_emails")
            .upsert({ mapping_id: mapping.id, email: piece.email, label, active: true }, { onConflict: "mapping_id,email" })
            .select();
          if (error && String(error.code) !== "23505") { skippedCount++; continue; }
          addedCount++;
        }
      }
      await fetchRows();
      showToast(`Upload selesai — ${addedCount} email diproses pada ${mcTouched} MC${skippedCount ? `, ${skippedCount} baris dilewati` : ""}.`, "ok");
    } catch (e) {
      showToast(e.message || "Gagal mengupload daftar email.", "error");
    } finally {
      setImportingEmails(false);
      if (emailFileRef.current) emailFileRef.current.value = "";
    }
  };

  // ── Upload Mapping MASTER (Circle/Region/Branch/Nama Admin) — tetap
  // lewat PNL_ImportWizard (upsert per MC), email TIDAK lagi lewat sini. ──
  const [showWizard, setShowWizard] = useState(false);

  const inputStyle = { width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
  const cellInputStyle = { width: "100%", height: 30, padding: "0 8px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };

  const emailPanelRow = emailPanelMc ? displayRows.find((r) => r.mc?.toLowerCase() === emailPanelMc.toLowerCase()) : null;
  const emailPanelList = emailPanelMc ? (emailsByMc.get(emailPanelMc.toLowerCase()) || []) : [];

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
              <Download size={14} /> Download Data MC
            </button>
            {!isHistorical && (
              <button onClick={() => setShowWizard(true)} style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Upload size={14} /> Upload Data MC
              </button>
            )}
            <button onClick={handleDownloadEmails} style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: `1px solid ${t.tealBd}`, background: t.tealBg, color: t.teal, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <Mail size={14} /> Download Daftar Email
            </button>
            {!isHistorical && (
              <>
                <input ref={emailFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                  onChange={(e) => handleUploadEmailsFile(e.target.files?.[0])} />
                <button onClick={() => emailFileRef.current?.click()} disabled={importingEmails}
                  style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: importingEmails ? "not-allowed" : "pointer", opacity: importingEmails ? 0.7 : 1 }}>
                  {importingEmails ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Upload Daftar Email
                </button>
              </>
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
        {!isHistorical && (
          <div style={{ padding: "8px 16px", fontSize: 11.5, color: t.mid, borderTop: `1px solid ${t.line}` }}>
            1 MC boleh punya email admin sebanyak apapun (klik &ldquo;Kelola Email&rdquo; di baris MC, atau upload massal). 1 email yang sama boleh dipasang ke beberapa MC sekaligus — otomatis jadi akses gabungan ke semua MC itu saat login.
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

      {/* ── Popover "Kelola Email" per MC ─────────────────────────────── */}
      {emailPanelMc && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setEmailPanelMc(null); }}>
          <div style={{ width: "100%", maxWidth: 480, background: d ? "#15151A" : "#FFFFFF", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", padding: 20, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Kelola Email — {emailPanelRow?.mc}</div>
              <button onClick={() => setEmailPanelMc(null)} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: t.hi, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 12, color: t.mid, marginBottom: 14 }}>
              Semua email di bawah ini bisa login sebagai Admin MC untuk {emailPanelRow?.mc}. Tidak ada batas jumlah email.
            </div>

            {emailPanelList.length === 0 && (
              <div style={{ padding: "14px 0", textAlign: "center", color: t.mid, fontSize: 12.5 }}>Belum ada email admin utk MC ini.</div>
            )}
            {emailPanelList.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${t.line}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.email}</div>
                  {e.label && <div style={{ fontSize: 11, color: t.mid }}>{e.label}</div>}
                </div>
                <button onClick={() => toggleEmailActive(emailPanelMc, e)} disabled={emailBusy} title={e.active ? "Aktif" : "Nonaktif"}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: e.active ? t.teal : t.lo, fontSize: 11, fontWeight: 700 }}>
                  {e.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                </button>
                <button onClick={() => removeEmail(emailPanelMc, e)} disabled={emailBusy} title="Hapus"
                  style={{ background: "none", border: "none", color: t.red, cursor: "pointer", display: "flex" }}><Trash2 size={14} /></button>
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@contoh.com"
                onKeyDown={(e) => e.key === "Enter" && addEmail(emailPanelMc)} style={{ ...cellInputStyle, height: 36, flex: 1.4 }} />
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (opsional)"
                onKeyDown={(e) => e.key === "Enter" && addEmail(emailPanelMc)} style={{ ...cellInputStyle, height: 36, flex: 1 }} />
              <button onClick={() => addEmail(emailPanelMc)} disabled={emailBusy}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 7, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: emailBusy ? "not-allowed" : "pointer", flexShrink: 0 }}>
                {emailBusy ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Tambah
              </button>
            </div>
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
          Circle, Region, Branch & Nama Admin bisa langsung diketik di tabel ini — tidak perlu upload ulang.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: t.sub }}>
                {["CIRCLE", "REGION", "BRANCH", "MC", "NAMA ADMIN", "EMAIL ADMIN", "STATUS", ""].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "9px 12px", color: t.mid, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={16} className="spin" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: t.mid }}>Belum ada MC. Tambahkan dulu di Database DSE, lalu isi admin-nya di sini.</td></tr>
              ) : filtered.map((r) => {
                const key = r.mc?.toLowerCase();
                const isVirtual = !r.id;
                const emails = emailsByMc.get(key) || [];
                const activeEmails = emails.filter((e) => e.active !== false);
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
                    {/* UPDATE (permintaan user - "perbaiki harusnya langsung
                        tampilkan saja untuk email emailnya"): dulu kolom ini
                        cuma nampilin TOMBOL "N email — Kelola" (alamat email-
                        nya sendiri disembunyikan, harus diklik dulu baru
                        kebuka popover) - padahal mode historical (asOfDate)
                        di atas SUDAH nampilin alamat emailnya langsung
                        sebagai teks (lihat cabang `isHistorical` di atas,
                        TIDAK disentuh/tetap sama). Sekarang mode live
                        (editable) jg langsung nampilin daftar alamat email
                        apa adanya (sama persis pola `isHistorical`, baris
                        per email + label kalau ada) - tombol "Kelola Email"
                        TETAP ada (buat tambah/hapus email), tapi jadi link
                        kecil TERPISAH di bawah daftar, bukan satu2nya cara
                        buat tau email apa aja yang terpasang. */}
                    <td style={{ padding: "6px 10px", minWidth: 220 }}>
                      {isHistorical ? (
                        emails.length === 0 ? (
                          <span style={{ fontSize: 12, color: t.lo }}>—</span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {emails.map((e, i) => <span key={i} style={{ fontSize: 11.5, color: t.hi }}>{e.email}{e.label ? ` (${e.label})` : ""}</span>)}
                          </div>
                        )
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                          {activeEmails.length === 0 ? (
                            <span style={{ fontSize: 12, color: t.lo, fontStyle: "italic" }}>Belum ada email</span>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              {activeEmails.map((e, i) => (
                                <span key={i} style={{ fontSize: 11.5, color: t.hi, fontWeight: 600, wordBreak: "break-all" }}>
                                  {e.email}{e.label ? <span style={{ color: t.mid, fontWeight: 500 }}>{` (${e.label})`}</span> : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          <button onClick={() => setEmailPanelMc(r.mc)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, color: t.teal, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            <Mail size={10} /> {activeEmails.length === 0 ? "Tambah email" : "Kelola Email"}
                          </button>
                        </div>
                      )}
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
