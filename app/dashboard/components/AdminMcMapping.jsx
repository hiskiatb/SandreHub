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
  Mail, Plus, ChevronDown, ChevronUp, Pencil,
} from "lucide-react";
import PNL_ImportWizard from "./PNL_ImportWizard";
import ExcelFilter from "./ExcelFilter";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;

// Ambang "sedang online" — APROKSIMASI dari last_sign_in_at (bukan denyut
// presence asli, TraceHub belum punya sistem heartbeat). Login OTP admin
// MC biasanya langsung dipakai aktif sesaat setelah verifikasi, jadi
// jendela singkat ini cukup wajar menandakan "baru saja login/aktif".
const ONLINE_WINDOW_MS = 10 * 60 * 1000;

function formatLastActive(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** Status login 1 admin (per slot) — 3 kemungkinan (permintaan user):
 * "Sedang online" (hijau, dot berdenyut), "Terakhir aktif: X lalu"
 * (abu-abu), atau "Belum pernah login" (amber). `ts` = last_sign_in_at
 * dari loginStatusByEmail, bisa null kalau belum pernah ketemu/login. */
function loginStatusBadge(ts, t) {
  if (!ts) return { label: "Belum pernah login", color: t.amber, dot: false, cat: "never" };
  const online = Date.now() - new Date(ts).getTime() < ONLINE_WINDOW_MS;
  if (online) return { label: "Sedang online", color: t.teal, dot: true, cat: "online" };
  return { label: `Terakhir aktif: ${formatLastActive(ts)}`, color: t.lo, dot: false, cat: "active" };
}

// Daftar kategori status login, dipakai juga sbg opsi <ExcelFilter> kolom
// STATUS (permintaan user - "untuk status ini bisa difilter juga ya").
const STATUS_CATEGORIES = [
  { value: "online", label: "Sedang Online" },
  { value: "active", label: "Pernah Login" },
  { value: "never", label: "Belum Pernah Login" },
  { value: "riwayat", label: "Riwayat (Historis)" },
];

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
  // loginStatusByEmail: Map<email_lowercase, last_sign_in_at_iso | null> —
  // UPDATE (permintaan user - "untuk kolom status ini juga untuk keempat
  // slot, jika belum login atau terakhir aktif, sedang online"): status
  // login PER-ADMIN (bukan status aktif/nonaktif MC, yg sudah ada
  // sendiri). TraceHub belum punya sistem presence/heartbeat spt
  // MartaHub (lihat lib/martaPresence di project itu) - jadi "sedang
  // online" di sini cuma APROKSIMASI dari auth.users.last_sign_in_at yang
  // masih sangat baru (lihat ONLINE_WINDOW_MS), bukan denyut presence
  // asli. Diambil lewat RPC mf_dse_admin_mc_email_login_status (security
  // definer, auth.users tidak bisa diakses langsung dari client).
  const [loginStatusByEmail, setLoginStatusByEmail] = useState(new Map());
  const fetchLoginStatus = useCallback(async (emails) => {
    const uniq = Array.from(new Set((emails || []).map((e) => (e || "").toLowerCase().trim()).filter(Boolean)));
    if (uniq.length === 0) { setLoginStatusByEmail(new Map()); return; }
    try {
      const { data, error } = await supabase.rpc("mf_dse_admin_mc_email_login_status", { p_emails: uniq });
      if (error) throw error;
      const map = new Map((data || []).map((r) => [r.email, r.last_sign_in_at]));
      setLoginStatusByEmail(map);
    } catch {
      // gagal dimuat — tabel tetap jalan, badge status cuma fallback ke "Belum pernah login"
      setLoginStatusByEmail(new Map());
    }
  }, []);
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
      fetchLoginStatus((emailRes.data || []).map((e) => e.email));
      return mapRes.data || [];
    } catch (e) {
      showToast(e.message || "Gagal memuat data.", "error");
      return [];
    } finally {
      setFetching(false);
    }
  }, [isHistorical, asOfDate, fetchLoginStatus]);

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
  // UPDATE (permintaan user - "bukannya nilai dari circle region dan branch
  // ini statis ya" + "ini data yang sama yang digunakan pada dse, jangan
  // biarkan kita bisa ubah ubah"): Circle/Region/Branch DIBALIK lagi jadi
  // read-only, diambil OTOMATIS dari Database DSE (dseRefMap) - UPDATE 6 di
  // atas (manual/bebas diketik per baris) dibatalkan, karena nilai2 ini
  // SUDAH ada & statis per MC di Database DSE (sumber yang sama dipakai
  // DSE_ProdAR), jadi membiarkannya diketik ulang manual di sini cuma bikin
  // resiko typo/beda sendiri drpd sumber aslinya. Hanya "full_name" (Nama
  // Admin) yang masih field manual/editable - itu bukan data yang ada di
  // Database DSE.
  const EDITABLE_FIELDS = ["full_name"];
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
    // UPDATE (permintaan user - "penulisan nama itu wajib kapital semua"):
    // Nama Admin/full_name dipaksa UPPERCASE di sisi client juga (DB sudah
    // ada trigger normalize sbg jaring pengaman, tapi diterapkan di sini
    // juga biar langsung kelihatan benar di UI tanpa nunggu reload/refetch).
    const trimmed = field === "full_name" ? value.trim().toUpperCase() : value.trim();
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
        .insert({ mapping_id: mapping.id, email, label: newLabel.trim().toUpperCase() || null, active: true })
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

  // UPDATE (permintaan user - "untuk tombol hapus ubah menjadi tombol
  // edit, agar bisa ganti email atau hapus disitu"): tombol "Hapus" di
  // tiap slot admin (tabel utama) diganti "Edit" - buka popover kecil ini
  // yg bisa GANTI email/nama admin itu LANGSUNG, atau hapus dari situ
  // juga (bukan cuma hapus instan tanpa opsi edit spt sebelumnya).
  const [editingEmailRow, setEditingEmailRow] = useState(null); // { mc, row } | null
  const [editDraftEmail, setEditDraftEmail] = useState("");
  const [editDraftLabel, setEditDraftLabel] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const openEditEmail = (mc, row) => {
    setEditingEmailRow({ mc, row });
    setEditDraftEmail(row.email || "");
    setEditDraftLabel(row.label || "");
  };
  const saveEditEmail = async () => {
    if (!editingEmailRow) return;
    const email = editDraftEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("Masukkan email yang valid.", "error"); return; }
    setEditBusy(true);
    try {
      const { data, error } = await supabase.from("mf_dse_admin_mc_emails")
        .update({ email, label: editDraftLabel.trim().toUpperCase() || null })
        .eq("id", editingEmailRow.row.id).select().single();
      if (error) {
        if (String(error.code) === "23505") throw new Error("Email ini sudah terpasang di MC ini.");
        throw error;
      }
      setEmailsByMc((prev) => {
        const next = new Map(prev);
        const key = editingEmailRow.mc.toLowerCase();
        next.set(key, (next.get(key) || []).map((x) => (x.id === data.id ? data : x)));
        return next;
      });
      showToast("Admin diperbarui.", "ok");
      setEditingEmailRow(null);
    } catch (e) {
      showToast(e.message || "Gagal memperbarui admin.", "error");
    } finally {
      setEditBusy(false);
    }
  };
  const deleteFromEditEmail = async () => {
    if (!editingEmailRow) return;
    await removeEmail(editingEmailRow.mc, editingEmailRow.row);
    setEditingEmailRow(null);
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
    // UPDATE (permintaan user - "ini data yang sama yang digunakan pada
    // dse, jangan biarkan kita bisa ubah ubah"): Circle/Region/Branch yang
    // DITAMPILKAN selalu di-override dari dseRefMap (Database DSE, sumber
    // yang sama dipakai DSE_ProdAR) kalau tersedia - bukan dari nilai yang
    // (dulu) sempat diketik manual & tersimpan di mf_dse_admin_mc_mapping.
    // Fallback ke nilai tersimpan cuma kalau MC itu sudah tidak ada lagi di
    // Database DSE (dseRefMap kosong utk MC itu - mis. data historis/lama),
    // supaya baris lama tetap kebaca, bukan jadi kosong.
    return Array.from(byMc.values())
      .map((r) => {
        const ref = dseRefMap.get(r.mc?.toLowerCase());
        return ref ? { ...r, circle: ref.circle, region: ref.region, branch: ref.branch } : r;
      })
      .sort((a, b) => (a.mc || "").localeCompare(b.mc || ""));
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

  // UPDATE (permintaan user - "gunakan konsep filter yang sudah ada untuk
  // bisa filter kolom-kolom di user management ini"): dipakai <ExcelFilter>
  // yg SAMA PERSIS komponennya dgn yg sudah ada di tabel roster DSE
  // (DSE_ProdAR.jsx - Partner/Region/Area/District) - checklist per nilai
  // unik, bukan bikin filter baru dari nol. Target kolom: Circle/Region/
  // Branch/MC (persis analog Partner/Region/Area/District di sana) +
  // status Aktif/Nonaktif MC.
  const [colFilters, setColFilters] = useState({ circle: [], region: [], branch: [], mc: [], adminName: [], adminEmail: [], status: [], adminCount: [] });
  const setColFilter = (key, val) => setColFilters((prev) => ({ ...prev, [key]: val }));
  const resetColFilters = () => setColFilters({ circle: [], region: [], branch: [], mc: [], adminName: [], adminEmail: [], status: [], adminCount: [] });
  const anyColFilterActive = Object.values(colFilters).some((v) => v.length > 0);
  // UPDATE (fix: "semua filter belum bekerja dengan baik" - ExcelFilter.jsx
  // SELALU manggil onSort(...) pas tombol Asc/Desc/Reset diklik (lihat
  // ExcelFilter.jsx), tapi kolom2 di tabel ini belum ada yg nyambungin prop
  // onSort/sortDir sama sekali -> klik Asc/Desc/Reset di POPUP MANAPUN
  // crash ("onSort is not a function") dan bikin seluruh tabel "diem aja"
  // pas diklik. Tambah 1 sortConfig {key,dir} dipakai semua kolom, persis
  // pattern yg sudah ada di DSE_ProdAR.jsx.
  const [sortConfig, setSortConfig] = useState({ key: null, dir: null });
  const sortPropsFor = (key) => ({
    sortDir: sortConfig.key === key ? sortConfig.dir : null,
    onSort: (dir) => setSortConfig({ key, dir }),
  });
  // UPDATE (fix runtime error "o.label.toLowerCase" - ExcelFilter.jsx
  // (komponen yg sama dipakai DSE_ProdAR.jsx) expect options berbentuk
  // {value,label}, BUKAN array string polos - lihat uniqOpt() di
  // DSE_ProdAR.jsx, dipakai persis sama di sini).
  const uniqOpt = (vals) => Array.from(new Set(vals.filter(Boolean))).sort().map((v) => ({ value: v, label: v }));
  // UPDATE (permintaan user - "dan juga nama admin dan email admin juga
  // bisa difilter"): opsi utk 2 kolom ini diambil dari emailsByMc (per
  // ADMIN, bukan per MC spt Circle/Region/Branch/MC) - 1 MC bisa punya
  // banyak admin, jadi daftar nilai uniknya digabung dari SEMUA admin
  // aktif di SEMUA MC (nama pakai fallback full_name MC-nya, sama persis
  // logic yg dipakai nampilin nama admin di tabel).
  const adminFilterOptions = useMemo(() => {
    const names = new Set();
    const emails = new Set();
    displayRows.forEach((r) => {
      const list = emailsByMc.get(r.mc?.toLowerCase()) || [];
      const active = isHistorical ? list : list.filter((e) => e.active !== false);
      active.forEach((e, i) => {
        const nm = e.label || r.full_name || `Admin ${i + 1}`;
        if (nm) names.add(nm);
        if (e.email) emails.add(e.email);
      });
    });
    return { names: Array.from(names).sort(), emails: Array.from(emails).sort() };
  }, [displayRows, emailsByMc, isHistorical]);

  // UPDATE (permintaan user - "ini juga bisa filter bisa menampilkan mc
  // mana yang memiliki 0 admin, 1 admin, 2 admin, 3 admin, dst"): jumlah
  // admin AKTIF riil per MC (bukan dibatasi 4 slot tampilan tabel) -
  // dipakai sbg opsi <ExcelFilter> kolom "#", diurutkan NUMERIK (bukan
  // string) biar "10 Admin" tidak nongol sebelum "2 Admin".
  const adminCountPerMc = useMemo(() => {
    const map = new Map();
    displayRows.forEach((r) => {
      const list = emailsByMc.get(r.mc?.toLowerCase()) || [];
      const active = isHistorical ? list : list.filter((e) => e.active !== false);
      map.set(r.mc, active.length);
    });
    return map;
  }, [displayRows, emailsByMc, isHistorical]);
  const adminCountOptions = useMemo(() => {
    const counts = Array.from(new Set(displayRows.map((r) => adminCountPerMc.get(r.mc) ?? 0))).sort((a, b) => a - b);
    return counts.map((n) => ({ value: n, label: `${n} Admin` }));
  }, [displayRows, adminCountPerMc]);
  const colOptions = useMemo(() => ({
    circle: uniqOpt(displayRows.map((r) => r.circle)),
    region: uniqOpt(displayRows.map((r) => r.region)),
    branch: uniqOpt(displayRows.map((r) => r.branch)),
    mc: uniqOpt(displayRows.map((r) => r.mc)),
    adminName: uniqOpt(adminFilterOptions.names),
    adminEmail: uniqOpt(adminFilterOptions.emails),
    status: STATUS_CATEGORIES,
    adminCount: adminCountOptions,
  }), [displayRows, adminFilterOptions, adminCountOptions]);

  const filtered = displayRows
    .filter((r) => {
      if (colFilters.circle.length && !colFilters.circle.includes(r.circle)) return false;
      if (colFilters.region.length && !colFilters.region.includes(r.region)) return false;
      if (colFilters.branch.length && !colFilters.branch.includes(r.branch)) return false;
      if (colFilters.mc.length && !colFilters.mc.includes(r.mc)) return false;
      if (colFilters.adminName.length || colFilters.adminEmail.length) {
        const list = emailsByMc.get(r.mc?.toLowerCase()) || [];
        const active = isHistorical ? list : list.filter((e) => e.active !== false);
        if (colFilters.adminName.length) {
          const ok = active.some((e, i) => colFilters.adminName.includes(e.label || r.full_name || `Admin ${i + 1}`));
          if (!ok) return false;
        }
        if (colFilters.adminEmail.length) {
          const ok = active.some((e) => colFilters.adminEmail.includes(e.email));
          if (!ok) return false;
        }
      }
      if (colFilters.adminCount.length && !colFilters.adminCount.includes(adminCountPerMc.get(r.mc) ?? 0)) return false;
      if (colFilters.status.length) {
        const list = emailsByMc.get(r.mc?.toLowerCase()) || [];
        const active = isHistorical ? list : list.filter((e) => e.active !== false);
        const ok = active.some((e) => {
          const cat = isHistorical ? "riwayat" : loginStatusBadge(loginStatusByEmail.get((e.email || "").toLowerCase()), t).cat;
          return colFilters.status.includes(cat);
        });
        if (!ok) return false;
      }
      if (!search) return true;
      const s = search.toLowerCase();
      const emails = emailsByMc.get(r.mc?.toLowerCase()) || [];
      return r.mc?.toLowerCase().includes(s) || r.full_name?.toLowerCase().includes(s)
        || r.region?.toLowerCase().includes(s) || r.branch?.toLowerCase().includes(s) || r.circle?.toLowerCase().includes(s)
        || emails.some((e) => e.email?.toLowerCase().includes(s) || e.label?.toLowerCase().includes(s));
    })
    .slice()
    .sort((a, b) => {
      // UPDATE (permintaan user - klik Asc/Desc di popup filter kolom kini
      // beneran ngurutin tabel, bukan cuma crash): kalau user pilih sort
      // eksplisit di salah satu kolom, itu MENANG dibanding urutan default
      // (grouping per email yg sudah ada).
      if (sortConfig.key && sortConfig.dir) {
        const dir = sortConfig.dir === "asc" ? 1 : -1;
        const adminLabelFor = (r) => {
          const list = emailsByMc.get(r.mc?.toLowerCase()) || [];
          const active = isHistorical ? list : list.filter((e) => e.active !== false);
          const first = active[0];
          return first ? (first.label || r.full_name || "") : "";
        };
        const adminEmailFor = (r) => {
          const list = emailsByMc.get(r.mc?.toLowerCase()) || [];
          const active = isHistorical ? list : list.filter((e) => e.active !== false);
          return active[0]?.email || "";
        };
        const statusRankFor = (r) => {
          const list = emailsByMc.get(r.mc?.toLowerCase()) || [];
          const active = isHistorical ? list : list.filter((e) => e.active !== false);
          if (isHistorical) return 3;
          const cats = active.map((e) => loginStatusBadge(loginStatusByEmail.get((e.email || "").toLowerCase()), t).cat);
          if (cats.includes("online")) return 0;
          if (cats.includes("active")) return 1;
          return 2;
        };
        let va, vb;
        switch (sortConfig.key) {
          case "circle": va = a.circle || ""; vb = b.circle || ""; break;
          case "region": va = a.region || ""; vb = b.region || ""; break;
          case "branch": va = a.branch || ""; vb = b.branch || ""; break;
          case "mc": va = a.mc || ""; vb = b.mc || ""; break;
          case "adminCount": va = adminCountPerMc.get(a.mc) ?? 0; vb = adminCountPerMc.get(b.mc) ?? 0; break;
          case "adminName": va = adminLabelFor(a); vb = adminLabelFor(b); break;
          case "adminEmail": va = adminEmailFor(a); vb = adminEmailFor(b); break;
          case "status": va = statusRankFor(a); vb = statusRankFor(b); break;
          default: va = ""; vb = "";
        }
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
        return String(va).localeCompare(String(vb)) * dir;
      }
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
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <UserRoundCog size={20} color={t.teal} />
            <div style={{ fontSize: 19, fontWeight: 800 }}>Mapping & User Management</div>
          </div>
          {/* UPDATE (permintaan user - "buat bentuknya tabel"): tampilan
              kartu per-MC dikembalikan ke bentuk TABEL seperti semula,
              TAPI tetap menjaga keterbacaan utk MC yg punya banyak admin
              (permintaan sebelumnya) - lewat rowSpan: kolom
              Circle/Region/Branch/MC/Status/Aksi digabung 1 baris per MC,
              sedangkan Nama Admin & Email Admin tetap 1 BARIS SENDIRI per
              admin (bernomor), jadi "Nama Admin 1 / Email Admin 1, Nama
              Admin 2 / Email Admin 2 dst" tetap jelas terpisah tanpa
              numpuk dalam 1 sel. Toolbar tetap 2 kartu berlabel (Data MC
              vs Daftar Email) dari redesign sebelumnya - itu bukan bagian
              dari komplain "bentuk tabel", jadi dipertahankan. */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px", minWidth: 260, borderRadius: 12, border: `1px solid ${t.line}`, background: t.sub, padding: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Data MC <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>(Circle / Region / Branch / Nama Admin)</span></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={handleDownload} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  <Download size={14} /> Download Data MC
                </button>
                {!isHistorical && (
                  <button onClick={() => setShowWizard(true)} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    <Upload size={14} /> Upload Data MC
                  </button>
                )}
              </div>
            </div>
            <div style={{ flex: "1 1 260px", minWidth: 260, borderRadius: 12, border: `1px solid ${t.tealBd}`, background: t.tealBg, padding: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: t.teal, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Daftar Email Admin <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>(login OTP, per MC)</span></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={handleDownloadEmails} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${t.teal}`, background: t.card, color: t.teal, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  <Mail size={14} /> Download Daftar Email
                </button>
                {!isHistorical && (
                  <>
                    <input ref={emailFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                      onChange={(e) => handleUploadEmailsFile(e.target.files?.[0])} />
                    <button onClick={() => emailFileRef.current?.click()} disabled={importingEmails}
                      style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: importingEmails ? "not-allowed" : "pointer", opacity: importingEmails ? 0.7 : 1 }}>
                      {importingEmails ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Upload Daftar Email
                    </button>
                  </>
                )}
              </div>
            </div>
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
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 16px", fontSize: 11.5, color: t.mid, borderTop: `1px solid ${t.line}` }}>
            <Mail size={13} color={t.lo} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>1 MC boleh punya admin (email) sebanyak apapun — klik &ldquo;Kelola Email&rdquo; di baris MC, atau upload massal. Semua admin yang terpasang di 1 MC yang sama mengakses data District itu dengan persis sama (DSE, AR, dst) — tidak ada bedanya admin ke berapa yang login, semuanya setara.</span>
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
              Semua email di bawah ini bisa login sebagai Admin MC untuk {emailPanelRow?.mc}, dengan akses data yang SAMA PERSIS satu sama lain. Tidak ada batas jumlah email.
            </div>

            {emailPanelList.length === 0 && (
              <div style={{ padding: "14px 0", textAlign: "center", color: t.mid, fontSize: 12.5 }}>Belum ada email admin utk MC ini.</div>
            )}
            {emailPanelList.map((e, i) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${t.line}` }}>
                <div style={{ width: 24, height: 24, borderRadius: 999, background: t.tealBg, color: t.teal, fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {e.label && <div style={{ fontSize: 11.5, fontWeight: 700, color: t.hi }}>{e.label}</div>}
                  <div style={{ fontSize: e.label ? 11.5 : 13, fontWeight: e.label ? 500 : 700, color: e.label ? t.mid : t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.email}</div>
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
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nama admin (opsional)"
                onKeyDown={(e) => e.key === "Enter" && addEmail(emailPanelMc)} style={{ ...cellInputStyle, height: 36, flex: 1 }} />
              <button onClick={() => addEmail(emailPanelMc)} disabled={emailBusy}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 7, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: emailBusy ? "not-allowed" : "pointer", flexShrink: 0 }}>
                {emailBusy ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Tambah
              </button>
            </div>

            {/* UPDATE (permintaan user - "sederhanakan"): field "Nama default MC"
                (fallback full_name) dipindah ke sini dari tabel utama - dulu selalu
                tampil sbg 1 baris tambahan per MC di tabel (bikin numpuk), sekarang
                cuma muncul di popover ini, pas lagi ngurusin email MC itu juga. */}
            {!isHistorical && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${t.line}` }}>
                <div style={{ fontSize: 10.5, color: t.lo, marginBottom: 5 }}>Nama default MC (fallback kalau salah satu email di atas belum punya nama sendiri)</div>
                <input key={`${emailPanelMc}-fn-${emailPanelRow?.full_name || ""}`} defaultValue={emailPanelRow?.full_name || ""} placeholder="Contoh: Admin MC-Bungo"
                  onBlur={(ev) => handleCellBlur(emailPanelMc, "full_name", ev.target.value)} style={{ ...cellInputStyle, maxWidth: "100%" }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Popover "Edit" 1 admin (ganti dari tombol Hapus instan - permintaan
          user "ubah menjadi tombol edit, agar bisa ganti email atau hapus
          disitu") - bisa GANTI email/nama di sini, atau hapus dari sini juga. */}
      {editingEmailRow && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(ev) => { if (ev.target === ev.currentTarget) setEditingEmailRow(null); }}>
          <div style={{ width: "100%", maxWidth: 420, background: d ? "#15151A" : "#FFFFFF", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Edit Admin — {editingEmailRow.mc}</div>
              <button onClick={() => setEditingEmailRow(null)} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: t.hi, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 12, color: t.mid, marginBottom: 14 }}>
              Ganti email atau nama admin ini, atau hapus sepenuhnya dari {editingEmailRow.mc}.
            </div>

            <div style={{ fontSize: 10.5, color: t.lo, marginBottom: 5 }}>Email</div>
            <input value={editDraftEmail} onChange={(ev) => setEditDraftEmail(ev.target.value)} placeholder="email@contoh.com"
              style={{ ...cellInputStyle, height: 36, marginBottom: 10 }} />
            <div style={{ fontSize: 10.5, color: t.lo, marginBottom: 5 }}>Nama admin (opsional)</div>
            <input value={editDraftLabel} onChange={(ev) => setEditDraftLabel(ev.target.value)} placeholder="Nama admin (opsional)"
              style={{ ...cellInputStyle, height: 36, marginBottom: 16 }} />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={deleteFromEditEmail} disabled={editBusy}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 7, border: `1px solid ${t.red}`, background: "none", color: t.red, fontSize: 12.5, fontWeight: 700, cursor: editBusy ? "not-allowed" : "pointer" }}>
                <Trash2 size={13} /> Hapus
              </button>
              <div style={{ flex: 1 }} />
              <button onClick={() => setEditingEmailRow(null)} disabled={editBusy}
                style={{ height: 36, padding: "0 12px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: "none", color: t.mid, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={saveEditEmail} disabled={editBusy}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 7, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: editBusy ? "not-allowed" : "pointer" }}>
                {editBusy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari MC / circle / region / branch / nama admin / email…" style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <button onClick={fetchRows} title="Refresh" style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <RefreshCw size={14} className={fetching ? "spin" : ""} />
          </button>
        </div>
      </div>

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
        {fetching ? (
          <div style={{ padding: 40, textAlign: "center", color: t.mid }}><Loader2 size={18} className="spin" /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: t.mid, fontSize: 13 }}>
            Belum ada MC. Tambahkan dulu di Database DSE, lalu isi admin-nya di sini.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              {(() => {
                // UPDATE (permintaan user - "buat semuanya tidak wrap text buat
                // dengan rapi gridlinesnya"): style header kolom, dipakai semua
                // <th> di tabel ini — nowrap konsisten spy header & gridline rapi
                // walau lebar kolom pas-pasan (scroll horizontal, bukan wrap).
                const th = { textAlign: "left", padding: "10px 12px", fontSize: 10.5, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap", border: `1px solid ${t.line}` };
                return (
              <thead>
                <tr style={{ background: t.sub, borderBottom: `1px solid ${t.line}` }}>
                  <th style={th}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>CIRCLE
                      <ExcelFilter t={t} d={d} label="Circle" options={colOptions.circle} selected={colFilters.circle} onApply={(v) => setColFilter("circle", v)} onClear={() => setColFilter("circle", [])} {...sortPropsFor("circle")} />
                    </div>
                  </th>
                  <th style={th}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>REGION
                      <ExcelFilter t={t} d={d} label="Region" options={colOptions.region} selected={colFilters.region} onApply={(v) => setColFilter("region", v)} onClear={() => setColFilter("region", [])} {...sortPropsFor("region")} />
                    </div>
                  </th>
                  <th style={th}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>BRANCH
                      <ExcelFilter t={t} d={d} label="Branch" options={colOptions.branch} selected={colFilters.branch} onApply={(v) => setColFilter("branch", v)} onClear={() => setColFilter("branch", [])} {...sortPropsFor("branch")} />
                    </div>
                  </th>
                  <th style={th}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>MC
                      <ExcelFilter t={t} d={d} label="MC" options={colOptions.mc} selected={colFilters.mc} onApply={(v) => setColFilter("mc", v)} onClear={() => setColFilter("mc", [])} {...sortPropsFor("mc")} />
                    </div>
                  </th>
                  <th style={th}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>#
                      <ExcelFilter t={t} d={d} label="Jumlah Admin" options={colOptions.adminCount} selected={colFilters.adminCount} onApply={(v) => setColFilter("adminCount", v)} onClear={() => setColFilter("adminCount", [])} {...sortPropsFor("adminCount")} />
                    </div>
                  </th>
                  <th style={th}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>NAMA ADMIN
                      <ExcelFilter t={t} d={d} label="Nama Admin" options={colOptions.adminName} selected={colFilters.adminName} onApply={(v) => setColFilter("adminName", v)} onClear={() => setColFilter("adminName", [])} {...sortPropsFor("adminName")} />
                    </div>
                  </th>
                  <th style={th}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>EMAIL ADMIN
                      <ExcelFilter t={t} d={d} label="Email Admin" options={colOptions.adminEmail} selected={colFilters.adminEmail} onApply={(v) => setColFilter("adminEmail", v)} onClear={() => setColFilter("adminEmail", [])} {...sortPropsFor("adminEmail")} />
                    </div>
                  </th>
                  {/* UPDATE (permintaan user - "untuk kolom edit/tambah ini nama
                      kolomnya itu AKSI, dan pisahkan dengan sangat baik dan ui
                      yang sangat baik"): header kosong diberi nama "AKSI" +
                      divider (border kiri lebih tebal & background beda tipis)
                      spy jelas kepisah dari kolom data admin (Nama/Email) dan
                      dari kolom STATUS di sampingnya, bukan nyambung begitu
                      saja. STATUS skrg juga punya <ExcelFilter> sendiri
                      (checklist: Sedang Online / Pernah Login / Belum Pernah
                      Login / Riwayat). */}
                  <th style={{ ...th, borderLeft: `2px solid ${t.line}`, background: t.sub2 || t.sub }}>AKSI</th>
                  <th style={{ ...th, borderLeft: `2px solid ${t.line}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>STATUS
                      <ExcelFilter t={t} d={d} label="Status" options={colOptions.status} selected={colFilters.status} onApply={(v) => setColFilter("status", v)} onClear={() => setColFilter("status", [])} {...sortPropsFor("status")} />
                    </div>
                  </th>
                </tr>
              </thead>
                ); })()}
              <tbody>
                {filtered.map((r) => {
                  const key = r.mc?.toLowerCase();
                  const isVirtual = !r.id;
                  const emails = emailsByMc.get(key) || [];
                  const rowEmails = isHistorical ? emails : emails.filter((e) => e.active !== false);
                  const mcCellStyle = { padding: "10px 12px", border: `1px solid ${t.line}`, verticalAlign: "top", whiteSpace: "nowrap", background: isVirtual ? t.amberBg : undefined };
                  const slotCellStyle = { padding: "10px 12px", border: `1px solid ${t.line}`, whiteSpace: "nowrap" };

                  // UPDATE (permintaan user - "tombol hapus ada ketika email dan nama berisi, jika
                  // tidak tambah, jadi per mc ada 4 slot, mau itu dikosong atau tidak, di mc ke kiri
                  // di merge untuk 4 row buat dengan sangat rapi"): setiap MC (mode LIVE, bukan
                  // historis) SELALU punya persis 4 "slot" baris - slot terisi (ada email+nama)
                  // tampilkan tombol Hapus, slot kosong tampilkan tombol + Tambah (buka popover
                  // Kelola Email) - bukan Hapus. Kolom kiri (Circle/Region/Branch/MC/Status/Aksi
                  // MC) di-merge (rowSpan) PERSIS 4 baris terus, konsisten mau MC itu admin-nya 0
                  // ataupun penuh 4. Kalau admin > 4, 4 slot tetap terisi penuh + 1 baris ringkas
                  // "+N lainnya" di luar area merge (colSpan penuh) ngarahin ke Kelola Email -
                  // Historis (read-only, data masa lalu) TIDAK dipaksa 4 slot karena tidak bisa
                  // ditambah/dihapus - cukup tampilkan apa adanya.
                  const MAX_SLOTS = 4;
                  let slots, span, hiddenCount;
                  if (isHistorical) {
                    slots = (rowEmails.length ? rowEmails : [null]).map((e) => ({ e, filled: !!e }));
                    span = slots.length;
                    hiddenCount = 0;
                  } else {
                    const filledSlots = rowEmails.slice(0, MAX_SLOTS).map((e) => ({ e, filled: true }));
                    const emptySlots = Array.from({ length: Math.max(MAX_SLOTS - filledSlots.length, 0) }, () => ({ e: null, filled: false }));
                    slots = [...filledSlots, ...emptySlots];
                    span = MAX_SLOTS;
                    hiddenCount = Math.max(rowEmails.length - MAX_SLOTS, 0);
                  }
                  const rowsOut = [];

                  slots.forEach((slot, i) => {
                    const { e, filled } = slot;
                    rowsOut.push(
                      <tr key={`${r.mc}-slot-${i}`} style={{ borderBottom: `1px solid ${t.line}` }}>
                        {i === 0 && (
                          <>
                            <td rowSpan={span} style={mcCellStyle}>{r.circle || "—"}</td>
                            <td rowSpan={span} style={mcCellStyle}>{r.region || "—"}</td>
                            <td rowSpan={span} style={mcCellStyle}>{r.branch || "—"}</td>
                            <td rowSpan={span} style={{ ...mcCellStyle, fontWeight: 800, color: t.hi }}>
                              {r.mc}
                              {isVirtual && <div title="MC ini belum punya mapping"><span style={{ display: "inline-block", marginTop: 4, fontSize: 9.5, fontWeight: 700, color: t.amber, background: t.amberBg, borderRadius: 6, padding: "1px 6px" }}>Baru</span></div>}
                            </td>
                          </>
                        )}
                        <td style={slotCellStyle}>
                          {filled ? (
                            <div style={{ width: 20, height: 20, borderRadius: 999, background: t.tealBg, color: t.teal, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                          ) : (
                            <div style={{ width: 20, height: 20, borderRadius: 999, border: `1px dashed ${t.inputBd}`, color: t.lo, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                          )}
                        </td>
                        <td style={{ ...slotCellStyle, fontWeight: filled ? 700 : 500, color: filled ? t.hi : t.lo, fontStyle: filled ? "normal" : "italic" }}>
                          {filled ? (e.label || r.full_name || `Admin ${i + 1}`) : "Kosong"}
                        </td>
                        <td style={{ ...slotCellStyle, color: filled ? t.mid : t.lo }}>
                          {filled ? e.email : "—"}
                        </td>
                        <td style={{ ...slotCellStyle, borderLeft: `2px solid ${t.line}`, background: isVirtual ? undefined : (d ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.012)") }}>
                          {filled ? (
                            !isHistorical && (
                              <button onClick={() => openEditEmail(r.mc, e)} title="Edit admin ini"
                                style={{ display: "flex", alignItems: "center", gap: 5, background: t.teal, border: `1px solid ${t.teal}`, borderRadius: 7, padding: "4px 8px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: t.shadowSm }}>
                                <Pencil size={11} /> Edit
                              </button>
                            )
                          ) : (
                            !isHistorical && (
                              <button onClick={() => setEmailPanelMc(r.mc)} title="Tambah admin"
                                style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px dashed ${t.tealBd}`, borderRadius: 7, padding: "4px 8px", color: t.teal, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                                <Plus size={11} /> Tambah
                              </button>
                            )
                          )}
                        </td>
                        <td style={{ ...slotCellStyle, borderLeft: `2px solid ${t.line}` }}>
                          {/* UPDATE (permintaan user - "untuk kolom status ini juga untuk
                              keempat slot, jika belum login atau terakhir aktif, sedang
                              online"): status LOGIN per-admin (beda dari status aktif/nonaktif
                              MC, yg sekarang digabung ke kolom AKSI MC) - 1 badge per slot,
                              bukan digabung (merge) spt sebelumnya. */}
                          {filled && isHistorical ? (
                            <span style={{ fontSize: 11, color: t.lo, fontStyle: "italic" }}>riwayat</span>
                          ) : filled ? (() => {
                            const st = loginStatusBadge(loginStatusByEmail.get((e.email || "").toLowerCase()), t);
                            return (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: st.color, whiteSpace: "nowrap" }}>
                                {st.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.teal, flexShrink: 0 }} />}
                                {st.label}
                              </span>
                            );
                          })() : (
                            <span style={{ fontSize: 11, color: t.lo }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  });

                  if (hiddenCount > 0) {
                    rowsOut.push(
                      <tr key={`${r.mc}-more`} style={{ borderBottom: `1px solid ${t.line}` }}>
                        <td colSpan={9} style={{ padding: "8px 12px", border: `1px solid ${t.line}` }}>
                          <button onClick={() => setEmailPanelMc(r.mc)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, color: t.teal, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                            <Mail size={11} /> +{hiddenCount} admin lainnya — lihat semua di Kelola Email
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  return rowsOut;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
