"use client";
/**
 * AdminAreaMapping.jsx — tab "Mapping & User Management" untuk role
 * "Admin Area" (admin_area).
 *
 * Sama persis pola AdminMcMapping.jsx (Admin MC / finance_mpx), TAPI
 * granularitas di level BRANCH (Area) - bukan MC (District). 1 admin
 * Area login & otomatis dapat akses ke SEMUA MC/District yang ada di
 * bawah Branch itu (lewat RLS mf_dse_admin_area_has_access(branch), by
 * Database DSE - bukan snapshot statis), bukan 1 MC spesifik saja.
 *
 * Tabel sumber: mf_dse_admin_area_mapping (per Branch, unique Branch) +
 * mf_dse_admin_area_emails (banyak email per Branch, login OTP).
 * RPC terkait:
 *  - mf_dse_admin_area_lookup (cek saat login — balikin SEMUA branch aktif)
 *  - mf_dse_admin_area_login_apply (menerapkan role admin_area + partner_name)
 *  - mf_dse_admin_area_mapping_as_of (riwayat per tanggal)
 *  - mf_dse_admin_area_email_login_status (status login per-admin)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import {
  UserRoundCog, X, Check, AlertTriangle, Loader2, Search,
  RefreshCw, Trash2, ToggleLeft, ToggleRight, Upload,
  Mail, Plus, ChevronDown, ChevronUp, Pencil,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;

// Ambang "sedang online" — APROKSIMASI dari last_sign_in_at (bukan denyut
// presence asli), sama persis pola AdminMcMapping.jsx.
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

// Pecah 1 sel email yang berisi beberapa alamat - sama persis pola
// AdminMcMapping.jsx.
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

export default function AdminAreaMapping({ theme, asOfDate, asOfLabel, roleValue, roleOptions, onRoleChange }) {
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
  // emailsByBranch: Map<branch_lowercase, Array<{id, mapping_id, email, label, active}>>
  const [emailsByBranch, setEmailsByBranch] = useState(new Map());
  const [loginStatusByEmail, setLoginStatusByEmail] = useState(new Map());
  const fetchLoginStatus = useCallback(async (emails) => {
    const uniq = Array.from(new Set((emails || []).map((e) => (e || "").toLowerCase().trim()).filter(Boolean)));
    if (uniq.length === 0) { setLoginStatusByEmail(new Map()); return; }
    try {
      const { data, error } = await supabase.rpc("mf_dse_admin_area_email_login_status", { p_emails: uniq });
      if (error) throw error;
      const map = new Map((data || []).map((r) => [r.email, r.last_sign_in_at]));
      setLoginStatusByEmail(map);
    } catch {
      setLoginStatusByEmail(new Map());
    }
  }, []);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "ok") => setToast({ msg, type });

  // Referensi dari mf_dse_database (Database DSE) — dipakai utk
  // menampilkan daftar Branch (Area) yang BELUM punya baris mapping sama
  // sekali (baris "baru" siap diisi), digabung per-Branch (bukan per-MC
  // seperti AdminMcMapping.jsx).
  const [dseRefMap, setDseRefMap] = useState(new Map());
  // UPDATE (permintaan user - "seharusnya diinformasikan jika datanya
  // masih loading"): displayRows gabungan `rows` (tabel mapping) DAN
  // `dseRefMap` (Database DSE) - dulu `fetching` cuma nunggu `rows`
  // selesai, jadi sempat kekosong sesaat ("Belum ada Area") padahal
  // dseRefMap-nya masih diambil. Sekarang ada state loading sendiri utk
  // referensi ini, digabung ke kondisi "fetching" di bawah.
  const [fetchingRef, setFetchingRef] = useState(true);
  const fetchRefData = useCallback(async () => {
    setFetchingRef(true);
    try {
      const { data, error } = await supabase.from("mf_dse_database").select("branch, region, circle").not("branch", "is", null);
      if (error) throw error;
      const map = new Map();
      (data || []).forEach((r) => {
        const key = String(r.branch).trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, { branch: r.branch, region: r.region, circle: r.circle });
      });
      setDseRefMap(map);
    } catch {
      // referensi gagal dimuat — tabel tetap jalan, cuma tanpa lookup Branch
    } finally {
      setFetchingRef(false);
    }
  }, []);

  const isHistorical = !!asOfDate;

  const fetchRows = useCallback(async () => {
    setFetching(true);
    try {
      if (isHistorical) {
        const { data, error } = await supabase.rpc("mf_dse_admin_area_mapping_as_of", { p_as_of: asOfDate });
        if (error) throw error;
        const sorted = (data || []).slice().sort((a, b) => (a.branch || "").localeCompare(b.branch || ""));
        const byBranch = new Map();
        sorted.forEach((r) => {
          byBranch.set((r.branch || "").toLowerCase(), (r.emails || []).map((e, i) => ({ id: `h${i}`, mapping_id: null, email: e.email, label: e.label, active: true })));
        });
        setEmailsByBranch(byBranch);
        setRows(sorted);
        return sorted;
      }
      const [mapRes, emailRes] = await Promise.all([
        supabase.from("mf_dse_admin_area_mapping").select("*").order("branch", { ascending: true }),
        supabase.from("mf_dse_admin_area_emails").select("*").order("email", { ascending: true }),
      ]);
      if (mapRes.error) throw mapRes.error;
      if (emailRes.error) throw emailRes.error;
      const mapById = new Map((mapRes.data || []).map((m) => [m.id, m.branch]));
      const byBranch = new Map();
      (emailRes.data || []).forEach((e) => {
        const branch = mapById.get(e.mapping_id);
        if (!branch) return;
        const key = branch.toLowerCase();
        if (!byBranch.has(key)) byBranch.set(key, []);
        byBranch.get(key).push(e);
      });
      setEmailsByBranch(byBranch);
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
  useEffect(() => { fetchRows(); if (!isHistorical) fetchRefData(); else setFetchingRef(false); }, [fetchRows, fetchRefData, isHistorical]);

  const EDITABLE_FIELDS = ["full_name"];
  const ensureMappingRow = useCallback(async (branch) => {
    const key = branch.toLowerCase();
    const existing = rows.find((r) => r.branch?.toLowerCase() === key);
    if (existing?.id) return existing;
    const ref = dseRefMap.get(key);
    const payload = { branch, active: true, circle: ref?.circle || null, region: ref?.region || null };
    const { data, error } = await supabase.from("mf_dse_admin_area_mapping").upsert(payload, { onConflict: "branch" }).select().single();
    if (error) throw error;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === data.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = data; return next; }
      return [...prev, data].sort((a, b) => (a.branch || "").localeCompare(b.branch || ""));
    });
    return data;
  }, [rows, dseRefMap]);

  // "Tambah Area Baru" - sama konsep dgn "Tambah MC Baru" di
  // AdminMcMapping.jsx, cuma 1 level lebih tinggi: Circle TETAP ikut
  // Region yg dipilih (dari Database DSE, bukan diketik bebas), cuma
  // nama Branch (Area) yg manual/baru - utk Area yg BENERAN belum ada
  // sama sekali di Database DSE.
  const regionOptions = useMemo(() => {
    const map = new Map();
    dseRefMap.forEach((ref) => {
      if (!ref.region) return;
      const key = ref.region.toLowerCase();
      if (!map.has(key)) map.set(key, { region: ref.region, circle: ref.circle });
    });
    return Array.from(map.values()).sort((a, b) => a.region.localeCompare(b.region));
  }, [dseRefMap]);

  const [showAddArea, setShowAddArea] = useState(false);
  const [newAreaRegion, setNewAreaRegion] = useState("");
  const [newAreaName, setNewAreaName] = useState("");
  const [addAreaBusy, setAddAreaBusy] = useState(false);
  const handleAddNewArea = async () => {
    const branch = newAreaName.trim().toUpperCase();
    if (!branch) { showToast("Nama Area (Branch) wajib diisi.", "error"); return; }
    if (!newAreaRegion) { showToast("Pilih Region dulu.", "error"); return; }
    const branchKey = branch.toLowerCase();
    if (rows.some((r) => r.branch?.toLowerCase() === branchKey) || dseRefMap.has(branchKey)) {
      showToast(`Area "${branch}" sudah ada.`, "error");
      return;
    }
    const ref = regionOptions.find((r) => r.region === newAreaRegion);
    setAddAreaBusy(true);
    try {
      const payload = { branch, active: true, circle: ref?.circle || null, region: ref?.region || null };
      const { data, error } = await supabase.from("mf_dse_admin_area_mapping").upsert(payload, { onConflict: "branch" }).select().single();
      if (error) throw error;
      setRows((prev) => [...prev, data].sort((a, b) => (a.branch || "").localeCompare(b.branch || "")));
      showToast(`Area ${branch} ditambahkan.`, "ok");
      setShowAddArea(false);
      setNewAreaRegion("");
      setNewAreaName("");
    } catch (e) {
      showToast(e.message || "Gagal menambahkan Area.", "error");
    } finally {
      setAddAreaBusy(false);
    }
  };

  const handleCellBlur = async (branch, field, value) => {
    if (isHistorical) return;
    const key = branch.toLowerCase();
    const existing = rows.find((r) => r.branch?.toLowerCase() === key);
    const trimmed = field === "full_name" ? value.trim().toUpperCase() : value.trim();
    if (existing && (existing[field] || "") === trimmed) return;
    const payload = { branch, active: existing?.active ?? true };
    EDITABLE_FIELDS.forEach((f) => {
      payload[f] = f === field ? (trimmed || null) : (existing?.[f] || null);
    });
    setSavingKey(key);
    try {
      const { data, error } = await supabase.from("mf_dse_admin_area_mapping").upsert(payload, { onConflict: "branch" }).select().single();
      if (error) throw error;
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === data.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = data; return next; }
        return [...prev, data].sort((a, b) => (a.branch || "").localeCompare(b.branch || ""));
      });
    } catch (e) {
      showToast(e.message || "Gagal menyimpan.", "error");
    } finally {
      setSavingKey(null);
    }
  };
  const [savingKey, setSavingKey] = useState(null);

  // ── Kelola Email per-Branch (popover) ───────────────────────────────
  const [emailPanelBranch, setEmailPanelBranch] = useState(null);
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const addEmail = async (branch) => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("Masukkan email yang valid.", "error"); return; }
    const label = newLabel.trim().toUpperCase();
    if (!label) { showToast("Nama admin wajib diisi.", "error"); return; }
    setEmailBusy(true);
    try {
      const mapping = await ensureMappingRow(branch);
      const { data, error } = await supabase.from("mf_dse_admin_area_emails")
        .insert({ mapping_id: mapping.id, email, label, active: true })
        .select().single();
      if (error) {
        if (String(error.code) === "23505") throw new Error("Email ini sudah terpasang di Area ini.");
        throw error;
      }
      setEmailsByBranch((prev) => {
        const next = new Map(prev);
        const key = branch.toLowerCase();
        next.set(key, [...(next.get(key) || []), data]);
        return next;
      });
      setNewEmail(""); setNewLabel("");
      showToast(`Email ditambahkan ke ${branch}.`, "ok");
    } catch (e) {
      showToast(e.message || "Gagal menambahkan email.", "error");
    } finally {
      setEmailBusy(false);
    }
  };

  const removeEmail = async (branch, emailRow) => {
    if (!window.confirm(`Hapus ${emailRow.email} dari ${branch}?`)) return;
    setEmailBusy(true);
    try {
      const { error } = await supabase.from("mf_dse_admin_area_emails").delete().eq("id", emailRow.id);
      if (error) throw error;
      setEmailsByBranch((prev) => {
        const next = new Map(prev);
        const key = branch.toLowerCase();
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

  const toggleEmailActive = async (branch, emailRow) => {
    setEmailBusy(true);
    try {
      const { error } = await supabase.from("mf_dse_admin_area_emails").update({ active: !emailRow.active }).eq("id", emailRow.id);
      if (error) throw error;
      setEmailsByBranch((prev) => {
        const next = new Map(prev);
        const key = branch.toLowerCase();
        next.set(key, (next.get(key) || []).map((e) => (e.id === emailRow.id ? { ...e, active: !e.active } : e)));
        return next;
      });
    } catch (e) {
      showToast(e.message || "Gagal mengubah status email.", "error");
    } finally {
      setEmailBusy(false);
    }
  };

  const [editingEmailRow, setEditingEmailRow] = useState(null); // { branch, row } | null
  const [editDraftEmail, setEditDraftEmail] = useState("");
  const [editDraftLabel, setEditDraftLabel] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const openEditEmail = (branch, row) => {
    setEditingEmailRow({ branch, row });
    setEditDraftEmail(row.email || "");
    setEditDraftLabel(row.label || "");
  };
  const saveEditEmail = async () => {
    if (!editingEmailRow) return;
    const email = editDraftEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("Masukkan email yang valid.", "error"); return; }
    const label = editDraftLabel.trim().toUpperCase();
    if (!label) { showToast("Nama admin wajib diisi.", "error"); return; }
    setEditBusy(true);
    try {
      const { data, error } = await supabase.from("mf_dse_admin_area_emails")
        .update({ email, label })
        .eq("id", editingEmailRow.row.id).select().single();
      if (error) {
        if (String(error.code) === "23505") throw new Error("Email ini sudah terpasang di Area ini.");
        throw error;
      }
      setEmailsByBranch((prev) => {
        const next = new Map(prev);
        const key = editingEmailRow.branch.toLowerCase();
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
    await removeEmail(editingEmailRow.branch, editingEmailRow.row);
    setEditingEmailRow(null);
  };

  // Baris yang ditampilkan = baris mapping yg sudah ada, DIGABUNG dgn
  // Branch dari Database DSE yang BELUM punya mapping sama sekali.
  const displayRows = useMemo(() => {
    const byBranch = new Map();
    rows.forEach((r) => { if (r.branch) byBranch.set(r.branch.toLowerCase(), r); });
    dseRefMap.forEach((ref, key) => {
      if (byBranch.has(key)) return;
      byBranch.set(key, { id: null, branch: ref.branch, region: ref.region, circle: ref.circle, full_name: "", active: true });
    });
    return Array.from(byBranch.values())
      .map((r) => {
        const ref = dseRefMap.get(r.branch?.toLowerCase());
        return ref ? { ...r, circle: ref.circle, region: ref.region } : r;
      })
      .sort((a, b) => (a.branch || "").localeCompare(b.branch || ""));
  }, [rows, dseRefMap]);

  const emailGroupKey = (branch) => {
    const emails = emailsByBranch.get(branch?.toLowerCase()) || [];
    const active = emails.filter((e) => e.active !== false);
    if (active.length === 0) return null;
    return active.map((e) => e.email?.toLowerCase() || "").sort().join(",");
  };

  const filtered = displayRows
    .filter((r) => {
      if (!search) return true;
      const s = search.toLowerCase();
      const emails = emailsByBranch.get(r.branch?.toLowerCase()) || [];
      return r.branch?.toLowerCase().includes(s) || r.full_name?.toLowerCase().includes(s)
        || r.region?.toLowerCase().includes(s) || r.circle?.toLowerCase().includes(s)
        || emails.some((e) => e.email?.toLowerCase().includes(s) || e.label?.toLowerCase().includes(s));
    })
    .slice()
    .sort((a, b) => {
      const ka = emailGroupKey(a.branch);
      const kb = emailGroupKey(b.branch);
      if (ka === null && kb === null) return (a.branch || "").localeCompare(b.branch || "");
      if (ka === null) return 1;
      if (kb === null) return -1;
      return ka.localeCompare(kb) || (a.branch || "").localeCompare(b.branch || "");
    });

  // ── Download/Upload Daftar Email — bentuk file sama dgn tabel di layar:
  // Circle/Region/Branch/#/Nama Admin/Email Admin, 4 baris slot per Area.
  // UPDATE (permintaan user - "untuk admin area juga seperti itu
  // stylenya"): sama persis gaya export AdminMcMapping.jsx - exceljs,
  // header merah (Circle/Region/Branch/#) & kuning (Nama Admin/Email
  // Admin) teks putih tebal + autoFilter, kolom Circle/Region/Branch
  // di-merge vertikal per Area, border tebal di tepi tiap blok Area.
  const handleDownloadEmails = async () => {
    const head = ["Circle", "Region", "Branch", "#", "Nama Admin", "Email Admin"];
    const MAX_SLOTS = 4;
    const areaBlocks = [];
    displayRows.forEach((r) => {
      const key = r.branch?.toLowerCase();
      const emails = emailsByBranch.get(key) || [];
      const rowEmails = isHistorical ? emails : emails.filter((e) => e.active !== false);
      let slots;
      if (isHistorical) {
        slots = (rowEmails.length ? rowEmails : [null]).map((e) => ({ e, filled: !!e }));
      } else {
        const filledSlots = rowEmails.slice(0, MAX_SLOTS).map((e) => ({ e, filled: true }));
        const emptySlots = Array.from({ length: Math.max(MAX_SLOTS - filledSlots.length, 0) }, () => ({ e: null, filled: false }));
        slots = [...filledSlots, ...emptySlots];
      }
      areaBlocks.push({
        rowCount: slots.length,
        rows: slots.map((slot, i) => {
          const { e, filled } = slot;
          return [
            r.circle || "",
            r.region || "",
            r.branch || "",
            i + 1,
            filled ? (e.label || r.full_name || `Admin ${i + 1}`) : "Kosong",
            filled ? (e.email || "") : "—",
          ];
        }),
      });
    });
    const totalRows = areaBlocks.reduce((n, b) => n + b.rowCount, 0);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Daftar Email Admin Area");
    ws.columns = [{ width: 14 }, { width: 18 }, { width: 22 }, { width: 4 }, { width: 28 }, { width: 30 }];
    const thinBorder = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    const RED = "FFC00000";
    const GOLD = "FFE8A33D";
    const headerRow = ws.addRow(head);
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colNumber <= 4 ? RED : GOLD } };
    });
    headerRow.height = 22;
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };

    if (totalRows === 0) {
      const emptyRow = ws.addRow(["", "", "", "", "", ""]);
      emptyRow.eachCell((cell) => { cell.border = thinBorder; });
    } else {
      areaBlocks.forEach((block) => {
        const startRow = ws.rowCount + 1;
        block.rows.forEach((r) => {
          const row = ws.addRow(r);
          row.eachCell((cell) => { cell.border = thinBorder; });
        });
        const endRow = ws.rowCount;
        for (let col = 4; col <= 6; col++) {
          const topCell = ws.getCell(startRow, col);
          topCell.border = { ...topCell.border, top: { style: "medium" } };
          const bottomCell = ws.getCell(endRow, col);
          bottomCell.border = { ...bottomCell.border, bottom: { style: "medium" } };
        }
        if (endRow > startRow) {
          [1, 2, 3].forEach((col) => {
            ws.mergeCells(startRow, col, endRow, col);
            const cell = ws.getCell(startRow, col);
            cell.alignment = { vertical: "middle", horizontal: "left" };
            cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
          });
        } else {
          [1, 2, 3].forEach((col) => {
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
    a.download = `Daftar_Email_Admin_Area_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Daftar email diunduh — ${totalRows} baris.`, "ok");
  };

  const emailFileRef = useRef(null);
  const [importingEmails, setImportingEmails] = useState(false);

  // Upload hanya menerima Branch (Area) yang SUDAH ADA (dari Database DSE
  // + mapping tersimpan) - sama aturan dgn AdminMcMapping.jsx: penulisan
  // Branch yang beda/typo bikin baris itu gagal, bukan bikin Area baru.
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
      const idxBranch = header.findIndex((h) => /^branch$|area/.test(h));
      const idxLabel = header.findIndex((h) => /nama admin|label/.test(h));
      const idxEmail = header.findIndex((h) => /email/.test(h));
      if (idxBranch === -1 || idxEmail === -1) {
        throw new Error('Kolom wajib tidak ditemukan. Pastikan ada kolom "Branch" dan "Email Admin" (boleh berisi lebih dari 1 email dipisah koma).');
      }
      const knownBranchByKey = new Map();
      displayRows.forEach((r) => { if (r.branch) knownBranchByKey.set(r.branch.toLowerCase(), r.branch); });
      let addedCount = 0, skippedCount = 0, branchNotFoundCount = 0, branchTouched = 0;
      const notFoundSample = [];
      // BUG FIX (audit user - email di slot ke-2/3/4 "ngilang" dari upload):
      // kolom Branch hasil Download di sini di-merge vertikal 4 baris per
      // Branch - baris ke-2/3/4 beneran KOSONG di data mentah SheetJS walau
      // kelihatan "nyambung" secara visual. Forward-fill dari baris
      // terakhir yang terisi, supaya baris2 itu tetap dikenali milik Branch
      // yang sama, bukan hilang diam2 lewat `if (!branchRaw) continue`.
      let lastBranch = "";
      for (let i = 1; i < rowsRaw.length; i++) {
        const line = rowsRaw[i];
        const branchCell = String(line[idxBranch] || "").trim();
        if (branchCell) lastBranch = branchCell;
        const branchRaw = branchCell || lastBranch;
        if (!branchRaw) continue;
        const branchKey = branchRaw.toLowerCase();
        const branch = knownBranchByKey.get(branchKey);
        if (!branch) {
          branchNotFoundCount++;
          if (notFoundSample.length < 5) notFoundSample.push(branchRaw);
          continue;
        }
        const labelRaw = idxLabel >= 0 ? String(line[idxLabel] || "").trim() : "";
        const emailCell = String(line[idxEmail] || "").trim();
        if (!emailCell) continue;
        const pieces = splitEmailCell(emailCell);
        if (!pieces.length) { skippedCount++; continue; }
        const mapping = await ensureMappingRow(branch);
        branchTouched++;
        for (const piece of pieces) {
          const label = pieces.length > 1 && piece.label ? piece.label.toUpperCase() : (labelRaw || piece.label || null);
          const { error } = await supabase.from("mf_dse_admin_area_emails")
            .upsert({ mapping_id: mapping.id, email: piece.email, label, active: true }, { onConflict: "mapping_id,email" })
            .select();
          if (error && String(error.code) !== "23505") { skippedCount++; continue; }
          addedCount++;
        }
      }
      await fetchRows();
      const parts = [`${addedCount} email diproses pada ${branchTouched} Area`];
      if (skippedCount) parts.push(`${skippedCount} baris dilewati`);
      if (branchNotFoundCount) parts.push(`${branchNotFoundCount} baris gagal (Area "${notFoundSample.join(", ")}"${branchNotFoundCount > notFoundSample.length ? ", ..." : ""} tidak ditemukan)`);
      showToast(`Upload selesai — ${parts.join(", ")}.`, branchNotFoundCount ? "warn" : "ok");
    } catch (e) {
      showToast(e.message || "Gagal mengupload daftar email.", "error");
    } finally {
      setImportingEmails(false);
      if (emailFileRef.current) emailFileRef.current.value = "";
    }
  };

  const inputStyle = { width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
  const cellInputStyle = { width: "100%", height: 30, padding: "0 8px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };

  const emailPanelRow = emailPanelBranch ? displayRows.find((r) => r.branch?.toLowerCase() === emailPanelBranch.toLowerCase()) : null;
  const emailPanelList = emailPanelBranch ? (emailsByBranch.get(emailPanelBranch.toLowerCase()) || []) : [];

  return (
    <div style={{ fontFamily: FONT, color: t.hi }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <UserRoundCog size={20} color={t.teal} />
            <div style={{ fontSize: 19, fontWeight: 800 }}>Mapping & User Management — Admin Area</div>
          </div>
        </div>
        {isHistorical && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: `1px solid ${t.line}`, background: t.amberBg }}>
            <AlertTriangle size={15} color={t.amber} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, fontWeight: 700, color: t.amber }}>
              Menampilkan mapping yang berlaku pada {asOfLabel || new Date(asOfDate).toLocaleDateString("id-ID")} (riwayat) — mode baca saja, tidak bisa diedit/diupload.
            </div>
          </div>
        )}
      </div>

      {/* ── Popover "Kelola Email" per Area ─────────────────────────── */}
      {emailPanelBranch && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setEmailPanelBranch(null); }}>
          <div style={{ width: "100%", maxWidth: 480, background: d ? "#15151A" : "#FFFFFF", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", padding: 20, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Kelola Email — {emailPanelRow?.branch}</div>
              <button onClick={() => setEmailPanelBranch(null)} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: t.hi, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 12, color: t.mid, marginBottom: 14 }}>
              Semua email di bawah ini bisa login sebagai Admin Area untuk {emailPanelRow?.branch}, dengan akses ke SEMUA MC/District di Area ini. Tidak ada batas jumlah email.
            </div>

            {emailPanelList.length === 0 && (
              <div style={{ padding: "14px 0", textAlign: "center", color: t.mid, fontSize: 12.5 }}>Belum ada email admin utk Area ini.</div>
            )}
            {emailPanelList.map((e, i) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${t.line}` }}>
                <div style={{ width: 24, height: 24, borderRadius: 999, background: t.tealBg, color: t.teal, fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {e.label && <div style={{ fontSize: 11.5, fontWeight: 700, color: t.hi }}>{e.label}</div>}
                  <div style={{ fontSize: e.label ? 11.5 : 13, fontWeight: e.label ? 500 : 700, color: e.label ? t.mid : t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.email}</div>
                </div>
                <button onClick={() => toggleEmailActive(emailPanelBranch, e)} disabled={emailBusy} title={e.active ? "Aktif" : "Nonaktif"}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: e.active ? t.teal : t.lo, fontSize: 11, fontWeight: 700 }}>
                  {e.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                </button>
                <button onClick={() => removeEmail(emailPanelBranch, e)} disabled={emailBusy} title="Hapus"
                  style={{ background: "none", border: "none", color: t.red, cursor: "pointer", display: "flex" }}><Trash2 size={14} /></button>
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@contoh.com"
                onKeyDown={(e) => e.key === "Enter" && addEmail(emailPanelBranch)} style={{ ...cellInputStyle, height: 36, flex: 1.4 }} />
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nama admin"
                onKeyDown={(e) => e.key === "Enter" && addEmail(emailPanelBranch)} style={{ ...cellInputStyle, height: 36, flex: 1 }} />
              <button onClick={() => addEmail(emailPanelBranch)} disabled={emailBusy}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 7, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: emailBusy ? "not-allowed" : "pointer", flexShrink: 0 }}>
                {emailBusy ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Tambah
              </button>
            </div>

            {!isHistorical && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${t.line}` }}>
                <div style={{ fontSize: 10.5, color: t.lo, marginBottom: 5 }}>Nama default Area (fallback kalau salah satu email di atas belum punya nama sendiri)</div>
                <input key={`${emailPanelBranch}-fn-${emailPanelRow?.full_name || ""}`} defaultValue={emailPanelRow?.full_name || ""} placeholder="Contoh: Admin Area Lhokseumawe"
                  onBlur={(ev) => handleCellBlur(emailPanelBranch, "full_name", ev.target.value)} style={{ ...cellInputStyle, maxWidth: "100%" }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Popover "Tambah Area Baru" ──────────────────────────────── */}
      {showAddArea && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(ev) => { if (ev.target === ev.currentTarget && !addAreaBusy) setShowAddArea(false); }}>
          <div style={{ width: "100%", maxWidth: 420, background: d ? "#15151A" : "#FFFFFF", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Tambah Area Baru</div>
              <button onClick={() => !addAreaBusy && setShowAddArea(false)} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: t.hi, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 12, color: t.mid, marginBottom: 14 }}>
              Circle sudah tetap (ikut Region yang dipilih, dari Database DSE) — pilih Region yang sudah ada, lalu isi nama Area (Branch) baru.
            </div>

            <div style={{ fontSize: 10.5, color: t.lo, marginBottom: 5 }}>Region</div>
            <select value={newAreaRegion} onChange={(ev) => setNewAreaRegion(ev.target.value)}
              style={{ ...cellInputStyle, height: 36, marginBottom: 10, cursor: "pointer" }}>
              <option value="">— Pilih Region —</option>
              {regionOptions.map((r) => (
                <option key={r.region} value={r.region}>{r.region} ({r.circle})</option>
              ))}
            </select>

            <div style={{ fontSize: 10.5, color: t.lo, marginBottom: 5 }}>Nama Area (Branch) baru</div>
            <input value={newAreaName} onChange={(ev) => setNewAreaName(ev.target.value)} placeholder="Contoh: NAMA AREA BARU"
              style={{ ...cellInputStyle, height: 36, marginBottom: 16 }} />

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }} />
              <button onClick={() => !addAreaBusy && setShowAddArea(false)} disabled={addAreaBusy}
                style={{ height: 36, padding: "0 12px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: "none", color: t.mid, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={handleAddNewArea} disabled={addAreaBusy}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 7, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: addAreaBusy ? "not-allowed" : "pointer" }}>
                {addAreaBusy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Popover "Edit" 1 admin ───────────────────────────────────── */}
      {editingEmailRow && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(ev) => { if (ev.target === ev.currentTarget) setEditingEmailRow(null); }}>
          <div style={{ width: "100%", maxWidth: 420, background: d ? "#15151A" : "#FFFFFF", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Edit Admin — {editingEmailRow.branch}</div>
              <button onClick={() => setEditingEmailRow(null)} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: t.hi, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 12, color: t.mid, marginBottom: 14 }}>
              Ganti email atau nama admin ini, atau hapus sepenuhnya dari {editingEmailRow.branch}.
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

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, flexWrap: "wrap" }}>
          {roleOptions && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <select value={roleValue} onChange={(e) => onRoleChange?.(e.target.value)}
                style={{ appearance: "none", WebkitAppearance: "none", height: 38, padding: "0 32px 0 14px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                {roleOptions.filter((r) => r.ready).map((r) => (
                  <option key={r.k} value={r.k}>{r.label}</option>
                ))}
              </select>
              <ChevronDown size={14} color={t.lo} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>
          )}
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 220 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari Area / circle / region / nama admin / email…" style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <button onClick={fetchRows} title="Refresh" style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <RefreshCw size={14} className={fetching ? "spin" : ""} />
          </button>
          {!isHistorical && (
            <button onClick={() => setShowAddArea(true)} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              <Plus size={14} /> Tambah Area Baru
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
        {fetching || fetchingRef ? (
          <div style={{ padding: 40, textAlign: "center", color: t.mid }}><Loader2 size={18} className="spin" /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: t.mid, fontSize: 13 }}>
            Belum ada Area. Tambahkan dulu di Database DSE, lalu isi admin-nya di sini.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              {(() => {
                const th = { textAlign: "left", padding: "10px 12px", fontSize: 10.5, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap", border: `1px solid ${t.line}` };
                return (
              <thead>
                <tr style={{ background: t.sub, borderBottom: `1px solid ${t.line}` }}>
                  <th style={th}>CIRCLE</th>
                  <th style={th}>REGION</th>
                  <th style={th}>BRANCH (AREA)</th>
                  <th style={th}>#</th>
                  <th style={th}>NAMA ADMIN</th>
                  <th style={th}>EMAIL ADMIN</th>
                  <th style={{ ...th, borderLeft: `2px solid ${t.line}`, background: t.sub2 || t.sub }}>AKSI</th>
                  <th style={{ ...th, borderLeft: `2px solid ${t.line}` }}>STATUS</th>
                </tr>
              </thead>
                ); })()}
              <tbody>
                {filtered.map((r) => {
                  const key = r.branch?.toLowerCase();
                  const isVirtual = !r.id;
                  const emails = emailsByBranch.get(key) || [];
                  const rowEmails = isHistorical ? emails : emails.filter((e) => e.active !== false);
                  const rowCellStyle = { padding: "10px 12px", border: `1px solid ${t.line}`, verticalAlign: "top", whiteSpace: "nowrap", background: isVirtual ? t.amberBg : undefined };
                  const slotCellStyle = { padding: "10px 12px", border: `1px solid ${t.line}`, whiteSpace: "nowrap" };

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
                      <tr key={`${r.branch}-slot-${i}`} style={{ borderBottom: `1px solid ${t.line}` }}>
                        <td style={rowCellStyle}>{r.circle || "—"}</td>
                        <td style={rowCellStyle}>{r.region || "—"}</td>
                        <td style={{ ...rowCellStyle, fontWeight: 800, color: t.hi }}>
                          {r.branch}
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
                              <button onClick={() => openEditEmail(r.branch, e)} title="Edit admin ini"
                                style={{ display: "flex", alignItems: "center", gap: 5, background: t.teal, border: `1px solid ${t.teal}`, borderRadius: 7, padding: "4px 8px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: t.shadowSm }}>
                                <Pencil size={11} /> Edit
                              </button>
                            )
                          ) : (
                            !isHistorical && (
                              <button onClick={() => setEmailPanelBranch(r.branch)} title="Tambah admin"
                                style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px dashed ${t.tealBd}`, borderRadius: 7, padding: "4px 8px", color: t.teal, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                                <Plus size={11} /> Tambah
                              </button>
                            )
                          )}
                        </td>
                        <td style={{ ...slotCellStyle, borderLeft: `2px solid ${t.line}` }}>
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
                      <tr key={`${r.branch}-more`} style={{ borderBottom: `1px solid ${t.line}` }}>
                        <td colSpan={8} style={{ padding: "8px 12px", border: `1px solid ${t.line}` }}>
                          <button onClick={() => setEmailPanelBranch(r.branch)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, color: t.teal, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
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
