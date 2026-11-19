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
 *  - mf_dse_admin_mc_login_apply (menerapkan role admin_partner_mdi + partner_name
 *    gabungan ke profil setelah OTP berhasil)
 *  - mf_dse_admin_mc_has_access (dipakai RLS utk cek akses per-MC)
 *
 * Hanya untuk role spm_sumatera (digate di DSE_ProdAR.jsx & page.jsx).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import { ensureRoleAccess, ensureRoleAccessBulk } from "./roleAccessSync";
import {
  UserRoundCog, X, Check, AlertTriangle, Loader2, Search,
  RefreshCw, Trash2, ToggleLeft, ToggleRight, Upload,
  Mail, Plus, ChevronDown, ChevronUp, Pencil, UserCheck,
} from "lucide-react";

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

export default function AdminMcMapping({ theme, asOfDate, asOfLabel, roleValue, roleOptions, onRoleChange }) {
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

  // UPDATE (permintaan user - "data circle dan MC itu sudah fixed, jadi
  // kita tidak bisa menambahnya, kita harus tambahkan manual untuk mc
  // baru, pilih branch yang sudah ada"): Circle/Region/Branch itu bukan
  // data bebas (lihat komentar EDITABLE_FIELDS di atas - sumbernya
  // Database DSE, dseRefMap). Tapi kalau ada MC yang BENERAN belum ada
  // sama sekali di Database DSE (MC baru), sebelumnya TIDAK ADA cara
  // menambahkannya ke tabel ini sama sekali (ensureMappingRow cuma bisa
  // jalan utk MC yg SUDAH ada di dseRefMap). Form "Tambah MC Baru" ini
  // mengisi celah itu: Circle/Region TETAP tidak diketik bebas - user
  // cuma pilih Branch yg SUDAH ada (dari Database DSE), Circle/Region-nya
  // otomatis ikut Branch itu (1 Branch = 1 Circle/Region yg sama,
  // persis spt yg sudah berlaku di Database DSE) - cuma nama MC yang
  // benar2 baru/manual.
  const branchOptions = useMemo(() => {
    const map = new Map();
    dseRefMap.forEach((ref) => {
      if (!ref.branch) return;
      const key = ref.branch.toLowerCase();
      if (!map.has(key)) map.set(key, { branch: ref.branch, region: ref.region, circle: ref.circle });
    });
    return Array.from(map.values()).sort((a, b) => a.branch.localeCompare(b.branch));
  }, [dseRefMap]);

  const [showAddMc, setShowAddMc] = useState(false);
  const [newMcBranch, setNewMcBranch] = useState("");
  const [newMcName, setNewMcName] = useState("");
  const [addMcBusy, setAddMcBusy] = useState(false);
  const handleAddNewMc = async () => {
    const mc = newMcName.trim().toUpperCase();
    if (!mc) { showToast("Nama MC wajib diisi.", "error"); return; }
    if (!newMcBranch) { showToast("Pilih Branch dulu.", "error"); return; }
    const mcKey = mc.toLowerCase();
    if (rows.some((r) => r.mc?.toLowerCase() === mcKey) || dseRefMap.has(mcKey)) {
      showToast(`MC "${mc}" sudah ada.`, "error");
      return;
    }
    const ref = branchOptions.find((b) => b.branch === newMcBranch);
    setAddMcBusy(true);
    try {
      const payload = { mc, active: true, circle: ref?.circle || null, region: ref?.region || null, branch: ref?.branch || null };
      const { data, error } = await supabase.from("mf_dse_admin_mc_mapping").upsert(payload, { onConflict: "mc" }).select().single();
      if (error) throw error;
      setRows((prev) => [...prev, data].sort((a, b) => (a.mc || "").localeCompare(b.mc || "")));
      showToast(`MC ${mc} ditambahkan.`, "ok");
      setShowAddMc(false);
      setNewMcBranch("");
      setNewMcName("");
    } catch (e) {
      showToast(e.message || "Gagal menambahkan MC.", "error");
    } finally {
      setAddMcBusy(false);
    }
  };

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
    // UPDATE (permintaan user - "nama admin ini tidak opsional
    // perbaiki"): dulu nama admin boleh dikosongin (fallback ke
    // full_name MC / "Admin N") - sekarang WAJIB diisi.
    const label = newLabel.trim().toUpperCase();
    if (!label) { showToast("Nama admin wajib diisi.", "error"); return; }
    setEmailBusy(true);
    try {
      const mapping = await ensureMappingRow(mc);
      const { data, error } = await supabase.from("mf_dse_admin_mc_emails")
        .insert({ mapping_id: mapping.id, email, label, active: true })
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
      // Jamin akun email ini (kalau sudah pernah daftar) langsung dapat
      // akses admin_mc - lihat komentar di roleAccessSync.js. Aman
      // dipanggil berulang & tidak menimpa role utama kalau akun itu
      // sudah admin_area dsb (ditambahkan sbg extra role, bukan overwrite).
      ensureRoleAccess(email, "admin_mc").catch((e) => console.error("[AdminMcMapping] ensureRoleAccess gagal:", e));
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
      const willBeActive = !emailRow.active;
      const { error } = await supabase.from("mf_dse_admin_mc_emails").update({ active: willBeActive }).eq("id", emailRow.id);
      if (error) throw error;
      setEmailsByMc((prev) => {
        const next = new Map(prev);
        const key = mc.toLowerCase();
        next.set(key, (next.get(key) || []).map((e) => (e.id === emailRow.id ? { ...e, active: willBeActive } : e)));
        return next;
      });
      if (willBeActive) ensureRoleAccess(emailRow.email, "admin_mc").catch((e) => console.error("[AdminMcMapping] ensureRoleAccess gagal:", e));
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
    // UPDATE (permintaan user - "nama admin ini tidak opsional
    // perbaiki"): dulu nama admin boleh dikosongin (fallback ke
    // full_name MC / "Admin N") - sekarang WAJIB diisi.
    const label = editDraftLabel.trim().toUpperCase();
    if (!label) { showToast("Nama admin wajib diisi.", "error"); return; }
    setEditBusy(true);
    try {
      const { data, error } = await supabase.from("mf_dse_admin_mc_emails")
        .update({ email, label })
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
      ensureRoleAccess(email, "admin_mc").catch((e) => console.error("[AdminMcMapping] ensureRoleAccess gagal:", e));
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

  // UPDATE (permintaan user - "dari total email terdaftar yang sudah
  // pernah login, berapa dari berapa"): summary card di atas tabel -
  // dihitung dari SEMUA slot email aktif (sama persis yang dirender
  // sbg baris berisi di tabel, bukan baris "Kosong") lintas SEMUA MC,
  // dicocokkan ke loginStatusByEmail utk tahu mana yang last_sign_in_at
  // -nya masih null (belum pernah login sama sekali). Cuma relevan utk
  // tampilan LIVE (isHistorical tidak punya data login status).
  const loginSummary = useMemo(() => {
    if (isHistorical) return null;
    let total = 0, loggedIn = 0, online = 0;
    emailsByMc.forEach((emails) => {
      emails.filter((e) => e.active !== false).forEach((e) => {
        total++;
        const ts = loginStatusByEmail.get(e.email?.toLowerCase());
        if (ts) {
          loggedIn++;
          if (Date.now() - new Date(ts).getTime() < ONLINE_WINDOW_MS) online++;
        }
      });
    });
    return { total, loggedIn, neverLoggedIn: total - loggedIn, online };
  }, [emailsByMc, loginStatusByEmail, isHistorical]);


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

  // ── Download/Upload Daftar Email (massal, terpisah dari master MC) —
  // UPDATE (permintaan user - "ketika download bentuknya akan seperti ini
  // juga"): bentuk file persis sama dgn tabel di layar - kolom Circle/
  // Region/Branch/MC/#/Nama Admin/Email Admin, dan tiap MC (mode LIVE)
  // selalu dapat 4 baris "slot" (terisi ATAU "Kosong"), sama persis
  // logic MAX_SLOTS di tbody. Historis tetap apa adanya (tidak dipaksa 4).
  // UPDATE 2 (permintaan user - "mc branch region circle itu di merge
  // untuk exportan excelnya, dan border bordernya dibuat rapi"): pindah
  // dari `xlsx` (SheetJS CE, tidak bisa styling/merge) ke `exceljs`
  // (sudah jadi dependency proyek ini - lihat SDP_Export.jsx) supaya bisa
  // merge cell Circle/Region/Branch/MC vertikal per-MC (persis rowSpan di
  // tabel layar) + kasih border tipis rapi ke SEMUA sel, bukan cuma AOA
  // polos tanpa style.
  const handleDownloadEmails = async () => {
    // UPDATE 3 (permintaan user - contoh screenshot header merah/kuning,
    // autofilter, border tebal per blok MC): header pakai label
    // Circle/Region/Area/District (konsisten dgn istilah yg sudah dipakai
    // di DSE_ProdAR.jsx - branch="Area", mc="District"), fill merah utk
    // Circle/Region/Area/District/#, kuning utk Nama Admin/Email Admin,
    // teks putih tebal, + autoFilter. Border antar blok MC dibuat lebih
    // tebal ("medium") persis seperti contoh, border dalam 1 blok tetap
    // tipis.
    const head = ["Circle", "Region", "Area", "District", "#", "Nama Admin", "Email Admin"];
    const MAX_SLOTS = 4;
    const mcBlocks = []; // { cells: [...], rowCount }
    displayRows.forEach((r) => {
      const key = r.mc?.toLowerCase();
      const emails = emailsByMc.get(key) || [];
      const rowEmails = isHistorical ? emails : emails.filter((e) => e.active !== false);
      let slots;
      if (isHistorical) {
        slots = (rowEmails.length ? rowEmails : [null]).map((e) => ({ e, filled: !!e }));
      } else {
        const filledSlots = rowEmails.slice(0, MAX_SLOTS).map((e) => ({ e, filled: true }));
        const emptySlots = Array.from({ length: Math.max(MAX_SLOTS - filledSlots.length, 0) }, () => ({ e: null, filled: false }));
        slots = [...filledSlots, ...emptySlots];
      }
      mcBlocks.push({
        rowCount: slots.length,
        rows: slots.map((slot, i) => {
          const { e, filled } = slot;
          return [
            r.circle || "",
            r.region || "",
            r.branch || "",
            r.mc || "",
            i + 1,
            filled ? (e.label || r.full_name || `Admin ${i + 1}`) : "Kosong",
            filled ? (e.email || "") : "—",
          ];
        }),
      });
    });
    const totalRows = mcBlocks.reduce((n, b) => n + b.rowCount, 0);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Daftar Email Admin MC");
    ws.columns = [
      { width: 14 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 4 }, { width: 28 }, { width: 30 },
    ];
    const thinBorder = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    const RED = "FFC00000";
    const GOLD = "FFE8A33D";
    const headerRow = ws.addRow(head);
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colNumber <= 5 ? RED : GOLD } };
    });
    headerRow.height = 22;
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };

    if (totalRows === 0) {
      const emptyRow = ws.addRow(["", "", "", "", "", "", ""]);
      emptyRow.eachCell((cell) => { cell.border = thinBorder; });
    } else {
      mcBlocks.forEach((block) => {
        const startRow = ws.rowCount + 1;
        block.rows.forEach((r) => {
          const row = ws.addRow(r);
          row.eachCell((cell) => { cell.border = thinBorder; });
        });
        const endRow = ws.rowCount;
        // UPDATE 3: border "medium" di tepi LUAR blok (atas blok ini &
        // kiri/kanan kolom E-G, krn A-D sudah kena tepi lewat merge di
        // bawah) - persis garis tebal pemisah antar-MC di contoh.
        for (let col = 5; col <= 7; col++) {
          const topCell = ws.getCell(startRow, col);
          topCell.border = { ...topCell.border, top: { style: "medium" } };
          const bottomCell = ws.getCell(endRow, col);
          bottomCell.border = { ...bottomCell.border, bottom: { style: "medium" } };
        }
        if (endRow > startRow) {
          // UPDATE 2: merge vertikal Circle/Region/Branch/MC (kolom A-D)
          // sepanjang slot MC itu - persis rowSpan di tabel layar.
          [1, 2, 3, 4].forEach((col) => {
            ws.mergeCells(startRow, col, endRow, col);
            const cell = ws.getCell(startRow, col);
            cell.alignment = { vertical: "middle", horizontal: "left" };
            cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
          });
        } else {
          [1, 2, 3, 4].forEach((col) => {
            const cell = ws.getCell(startRow, col);
            cell.alignment = { vertical: "middle", horizontal: "left" };
            cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
          });
        }
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Daftar_Email_Admin_MC_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Daftar email diunduh — ${totalRows} baris.`, "ok");
  };

  const emailFileRef = useRef(null);
  const [importingEmails, setImportingEmails] = useState(false);

  // UPDATE (permintaan user - "saat upload itu hanya bisa mc yang sudah
  // ada, jika ada penulisan mc yang berbeda maka row tersebut gagal"):
  // upload TIDAK BOLEH lagi membuat MC baru (ensureMappingRow dulu
  // upsert bebas - kalau penulisan MC di file beda/typo dari MC yang
  // sudah ada di sistem, malah bikin baris master baru yang salah).
  // Sekarang nama MC di tiap baris file dicocokkan (case-insensitive) ke
  // daftar MC yang SUDAH ADA (displayRows - gabungan Database DSE +
  // mapping tersimpan) - kalau tidak ketemu persis, baris itu digagalkan
  // (dihitung terpisah sbg mcNotFoundCount) dan TIDAK diproses sama
  // sekali. MC baru tetap harus lewat "Tambah MC Baru" dulu.
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
      // FIX (audit - header export "Daftar Email" di-rename jadi "District"
      // (lihat UPDATE 3 handleDownloadEmails di atas), tapi regex upload ini
      // belum ikut diupdate - upload balik file hasil export sendiri gagal
      // "kolom wajib tidak ditemukan". Regex sekarang terima "district" juga.
      const idxMc = header.findIndex((h) => /micro ?cluster|^mc$|district/.test(h));
      const idxLabel = header.findIndex((h) => /nama admin|label/.test(h));
      const idxEmail = header.findIndex((h) => /email/.test(h));
      if (idxMc === -1 || idxEmail === -1) {
        throw new Error('Kolom wajib tidak ditemukan. Pastikan ada kolom "Micro Cluster" dan "Alamat Email" (boleh berisi lebih dari 1 email dipisah koma).');
      }
      const knownMcByKey = new Map();
      displayRows.forEach((r) => { if (r.mc) knownMcByKey.set(r.mc.toLowerCase(), r.mc); });
      let addedCount = 0, skippedCount = 0, mcNotFoundCount = 0, mcTouched = 0;
      const touchedEmails = [];
      const notFoundSample = [];
      // BUG FIX (audit user - email di slot ke-2/3/4 "ngilang" dari upload):
      // kolom MC/District hasil Download di sini di-merge vertikal 4 baris
      // per MC (lihat handleDownloadEmails) - baris ke-2/3/4 beneran KOSONG
      // di data mentah SheetJS walau kelihatan "nyambung" secara visual.
      // Forward-fill dari baris terakhir yang terisi, supaya baris2 itu
      // tetap dikenali milik MC yang sama, bukan hilang diam2 lewat
      // `if (!mcRaw) continue` di bawah.
      let lastMc = "";
      for (let i = 1; i < rowsRaw.length; i++) {
        const line = rowsRaw[i];
        const mcCell = String(line[idxMc] || "").trim();
        if (mcCell) lastMc = mcCell;
        const mcRaw = mcCell || lastMc;
        if (!mcRaw) continue;
        const mcKey = mcRaw.toLowerCase();
        const mc = knownMcByKey.get(mcKey);
        if (!mc) {
          mcNotFoundCount++;
          if (notFoundSample.length < 5) notFoundSample.push(mcRaw);
          continue;
        }
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
          touchedEmails.push(piece.email);
        }
      }
      await fetchRows();
      if (touchedEmails.length) {
        ensureRoleAccessBulk(touchedEmails, "admin_mc").catch((e) => console.error("[AdminMcMapping] ensureRoleAccessBulk gagal:", e));
      }
      const parts = [`${addedCount} email diproses pada ${mcTouched} MC`];
      if (skippedCount) parts.push(`${skippedCount} baris dilewati`);
      if (mcNotFoundCount) parts.push(`${mcNotFoundCount} baris gagal (MC "${notFoundSample.join(", ")}"${mcNotFoundCount > notFoundSample.length ? ", ..." : ""} tidak ditemukan)`);
      showToast(`Upload selesai — ${parts.join(", ")}.`, mcNotFoundCount ? "warn" : "ok");
    } catch (e) {
      showToast(e.message || "Gagal mengupload daftar email.", "error");
    } finally {
      setImportingEmails(false);
      if (emailFileRef.current) emailFileRef.current.value = "";
    }
  };

  // ── Upload Mapping MASTER (Circle/Region/Branch/Nama Admin) — tetap
  // lewat PNL_ImportWizard (upsert per MC), email TIDAK lagi lewat sini. ──
const inputStyle = { width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
  const cellInputStyle = { width: "100%", height: 30, padding: "0 8px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };

  const emailPanelRow = emailPanelMc ? displayRows.find((r) => r.mc?.toLowerCase() === emailPanelMc.toLowerCase()) : null;
  const emailPanelList = emailPanelMc ? (emailsByMc.get(emailPanelMc.toLowerCase()) || []) : [];

  return (
    <div style={{ fontFamily: FONT, color: t.hi }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <UserRoundCog size={20} color={t.teal} />
            <div style={{ fontSize: 19, fontWeight: 800 }}>Mapping & User Management</div>
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
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nama admin"
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

      {/* ── Popover "Tambah MC Baru" - permintaan user "data circle dan mc
          itu sudah fixed, jadi kita tidak bisa menambahnya, kita harus
          tambahkan manual untuk mc baru, pilih branch yang sudah ada":
          Circle/Region TETAP ikut Branch yg dipilih (bukan diketik bebas),
          cuma nama MC yg manual/baru. */}
      {showAddMc && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(ev) => { if (ev.target === ev.currentTarget && !addMcBusy) setShowAddMc(false); }}>
          <div style={{ width: "100%", maxWidth: 420, background: d ? "#15151A" : "#FFFFFF", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Tambah MC Baru</div>
              <button onClick={() => !addMcBusy && setShowAddMc(false)} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: t.hi, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 12, color: t.mid, marginBottom: 14 }}>
              Circle & Region sudah tetap (ikut Database DSE) — pilih Branch yang sudah ada, lalu isi nama MC baru.
            </div>

            <div style={{ fontSize: 10.5, color: t.lo, marginBottom: 5 }}>Branch</div>
            <select value={newMcBranch} onChange={(ev) => setNewMcBranch(ev.target.value)}
              style={{ ...cellInputStyle, height: 36, marginBottom: 10, cursor: "pointer" }}>
              <option value="">— Pilih Branch —</option>
              {branchOptions.map((b) => (
                <option key={b.branch} value={b.branch}>{b.branch} ({b.region} · {b.circle})</option>
              ))}
            </select>

            <div style={{ fontSize: 10.5, color: t.lo, marginBottom: 5 }}>Nama MC baru</div>
            <input value={newMcName} onChange={(ev) => setNewMcName(ev.target.value)} placeholder="Contoh: MC-NAMA BARU"
              style={{ ...cellInputStyle, height: 36, marginBottom: 16 }} />

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }} />
              <button onClick={() => !addMcBusy && setShowAddMc(false)} disabled={addMcBusy}
                style={{ height: 36, padding: "0 12px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: "none", color: t.mid, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={handleAddNewMc} disabled={addMcBusy}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 7, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: addMcBusy ? "not-allowed" : "pointer" }}>
                {addMcBusy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Simpan
              </button>
            </div>
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
            <div style={{ fontSize: 10.5, color: t.lo, marginBottom: 5 }}>Nama admin</div>
            <input value={editDraftLabel} onChange={(ev) => setEditDraftLabel(ev.target.value)} placeholder="Nama admin"
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

      {/* UPDATE (permintaan user - "dari total email terdaftar yang
          sudah pernah login, berapa dari berapa"): summary card login -
          3 angka (Sudah login / Belum pernah login / Sedang online) dari
          total email yang terdaftar (slot aktif, lintas semua MC),
          persis rujukan loginSummary di atas. */}
      {loginSummary && loginSummary.total > 0 && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ flex: "1 1 200px", borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: t.tealBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <UserCheck size={20} color={t.teal} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{loginSummary.loggedIn} <span style={{ fontSize: 14, fontWeight: 600, color: t.mid }}>dari {loginSummary.total}</span></div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3 }}>Email sudah pernah login</div>
            </div>
          </div>
          <div style={{ flex: "1 1 200px", borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: t.amberBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle size={20} color={t.amber} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{loginSummary.neverLoggedIn} <span style={{ fontSize: 14, fontWeight: 600, color: t.mid }}>dari {loginSummary.total}</span></div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3 }}>Belum pernah login</div>
            </div>
          </div>
          <div style={{ flex: "1 1 200px", borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: t.tealBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ width: 11, height: 11, borderRadius: 999, background: t.teal }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{loginSummary.online}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3 }}>Sedang online sekarang</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, flexWrap: "wrap" }}>
          {roleOptions && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <select value={roleValue} onChange={(e) => onRoleChange?.(e.target.value)}
                style={{ appearance: "none", WebkitAppearance: "none", height: 38, padding: "0 32px 0 14px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                {/* UPDATE (permintaan user - "yang segera hadir tidak
                    perlu ditampilkan"): role yg belum ready (ready:false)
                    disembunyikan dari dropdown, bukan cuma dilabeli. */}
                {roleOptions.filter((r) => r.ready).map((r) => (
                  <option key={r.k} value={r.k}>{r.label}</option>
                ))}
              </select>
              <ChevronDown size={14} color={t.lo} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>
          )}
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 220 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari MC / circle / region / branch / nama admin / email…" style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <button onClick={fetchRows} title="Refresh" style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <RefreshCw size={14} className={fetching ? "spin" : ""} />
          </button>
          {!isHistorical && (
            <button onClick={() => setShowAddMc(true)} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              <Plus size={14} /> Tambah MC Baru
            </button>
          )}
          <button onClick={handleDownloadEmails} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${t.teal}`, background: t.card, color: t.teal, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
            <Mail size={14} /> Download
          </button>
          {!isHistorical && (
            <>
              <input ref={emailFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                onChange={(e) => handleUploadEmailsFile(e.target.files?.[0])} />
              <button onClick={() => emailFileRef.current?.click()} disabled={importingEmails}
                style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: importingEmails ? "not-allowed" : "pointer", opacity: importingEmails ? 0.7 : 1, whiteSpace: "nowrap", flexShrink: 0 }}>
                {importingEmails ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Upload
              </button>
            </>
          )}
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
                    CIRCLE
                  </th>
                  <th style={th}>
                    REGION
                  </th>
                  <th style={th}>
                    BRANCH
                  </th>
                  <th style={th}>
                    MC
                  </th>
                  <th style={th}>
                    #
                  </th>
                  <th style={th}>
                    NAMA ADMIN
                  </th>
                  <th style={th}>
                    EMAIL ADMIN
                  </th>
                  {/* UPDATE (permintaan user - "untuk kolom edit/tambah ini nama
                      kolomnya itu AKSI, dan pisahkan dengan sangat baik dan ui
                      yang sangat baik"): header kosong diberi nama "AKSI" +
                      divider (border kiri lebih tebal & background beda tipis)
                      spy jelas kepisah dari kolom data admin (Nama/Email) dan
                      dari kolom STATUS di sampingnya, bukan nyambung begitu
                      saja. */}
                  <th style={{ ...th, borderLeft: `2px solid ${t.line}`, background: t.sub2 || t.sub }}>AKSI</th>
                  <th style={{ ...th, borderLeft: `2px solid ${t.line}` }}>
                    STATUS
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
                  let slots, hiddenCount;
                  if (isHistorical) {
                    slots = (rowEmails.length ? rowEmails : [null]).map((e) => ({ e, filled: !!e }));
                    hiddenCount = 0;
                  } else {
                    const filledSlots = rowEmails.slice(0, MAX_SLOTS).map((e) => ({ e, filled: true }));
                    const emptySlots = Array.from({ length: Math.max(MAX_SLOTS - filledSlots.length, 0) }, () => ({ e: null, filled: false }));
                    slots = [...filledSlots, ...emptySlots];
                    hiddenCount = Math.max(rowEmails.length - MAX_SLOTS, 0);
                  }
                  const rowsOut = [];

                  slots.forEach((slot, i) => {
                    const { e, filled } = slot;
                    rowsOut.push(
                      <tr key={`${r.mc}-slot-${i}`} style={{ borderBottom: `1px solid ${t.line}` }}>
                        {/* UPDATE (permintaan user - "buat ini menjadi table biasa tanpa ada
                            merge"): Circle/Region/Branch/MC dulu di-merge (rowSpan) biar 1 MC
                            keliatan jadi 1 blok - sekarang DIHAPUS, nilainya diulang di SETIAP
                            baris slot (table biasa, tidak ada rowSpan sama sekali). */}
                        <td style={mcCellStyle}>{r.circle || "—"}</td>
                        <td style={mcCellStyle}>{r.region || "—"}</td>
                        <td style={mcCellStyle}>{r.branch || "—"}</td>
                        <td style={{ ...mcCellStyle, fontWeight: 800, color: t.hi }}>
                          {r.mc}
                          {isVirtual && i === 0 && <div title="MC ini belum punya mapping"><span style={{ display: "inline-block", marginTop: 4, fontSize: 9.5, fontWeight: 700, color: t.amber, background: t.amberBg, borderRadius: 6, padding: "1px 6px" }}>Baru</span></div>}
                        </td>
                        <td style={{ ...slotCellStyle, textAlign: "center" }}>
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            {filled ? (
                              <div style={{ width: 20, height: 20, borderRadius: 999, background: t.tealBg, color: t.teal, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                            ) : (
                              <div style={{ width: 20, height: 20, borderRadius: 999, border: `1px dashed ${t.inputBd}`, color: t.lo, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
                            )}
                          </div>
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
