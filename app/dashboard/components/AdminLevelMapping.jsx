"use client";
/**
 * AdminLevelMapping.jsx — tab "Mapping & User Management" generik untuk
 * role level non-Branch/MC: Partner Level (admin_partner, kolom pt_name),
 * Circle (admin_circle, kolom circle), Region Level (admin_region, kolom
 * region) — permintaan user: "Tambahkan Partner Level, Circle, Region
 * Level dari data dse itu juga, untuk partner dan region masing masing 6
 * user bisa ditambahkan, namun khusus untuk circle 10".
 *
 * Satu komponen dipakai utk ketiga role (parameterized lewat prop `col`/
 * `roleKey`/`label`/`maxSlots`/`searchPlaceholder`) - polanya SAMA PERSIS
 * AdminAreaMapping.jsx (mapping table + emails table, upsert per baris,
 * download/upload Excel daftar email, status login per-admin), BEDA di:
 *  1. Tidak ada picker hierarki 2-level ("pilih Region lalu ketik Branch")
 *     saat tambah baris baru - cukup ketik nilai <col> baru langsung
 *     (Partner/Circle/Region bukan nested di bawah level lain yang perlu
 *     dipilih dulu).
 *  2. MAX_SLOTS di sini BENERAN DIBATASI (addEmail menolak kalau sudah
 *     penuh) - beda dgn AdminAreaMapping/AdminMcMapping yang emailnya
 *     TIDAK dibatasi (MAX_SLOTS di situ cuma template kolom Excel).
 *
 * Tabel sumber per role: mf_dse_{roleKey}_mapping (per <col>, unique) +
 * mf_dse_{roleKey}_emails (banyak email per <col>, dibatasi maxSlots).
 * RPC terkait: mf_dse_{roleKey}_mapping_as_of (riwayat), serta
 * mf_dse_{roleKey}_lookup / _login_apply (dipanggil dari /sandra/login,
 * bukan dari komponen ini) dan mf_dse_{roleKey}_has_access* (dipakai RLS
 * tabel data inti - Database DSE, Prod&AR, DSO/HoA AR - scoped read-only
 * ke <col> yang di-assign ke email admin itu).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import { ensureRoleAccess, ensureRoleAccessBulk } from "./roleAccessSync";
import {
  UserRoundCog, X, Check, AlertTriangle, Loader2, Search,
  RefreshCw, Trash2, ToggleLeft, ToggleRight, Upload,
  Mail, Plus, ChevronDown, ChevronUp, Pencil,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;
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
  useEffect(() => { const tm = setTimeout(onClose, 4500); return () => clearTimeout(tm); }, [onClose]);
  const bg = type === "error" ? "#DC2626" : type === "warn" ? "#D97706" : "#16A34A";
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, left: 24, zIndex: 9999, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: bg, color: "#fff", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", maxWidth: 480, marginLeft: "auto" }}>
      {type === "error" ? <AlertTriangle size={15} /> : <Check size={15} />}
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, display: "flex" }}><X size={14} /></button>
    </div>
  );
}

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

export default function AdminLevelMapping({
  theme, asOfDate, asOfLabel, roleValue, roleOptions, onRoleChange,
  col, roleKey, label, maxSlots, searchPlaceholder,
}) {
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

  const mappingTable = `mf_dse_${roleKey}_mapping`;
  const emailsTable = `mf_dse_${roleKey}_emails`;
  const mappingAsOfRpc = `mf_dse_${roleKey}_mapping_as_of`;
  const emailLoginStatusRpc = `mf_dse_${roleKey}_email_login_status`;

  const [rows, setRows] = useState([]);
  const [emailsByKey, setEmailsByKey] = useState(new Map());
  const [loginStatusByEmail, setLoginStatusByEmail] = useState(new Map());
  const fetchLoginStatus = useCallback(async (emails) => {
    const uniq = Array.from(new Set((emails || []).map((e) => (e || "").toLowerCase().trim()).filter(Boolean)));
    if (uniq.length === 0) { setLoginStatusByEmail(new Map()); return; }
    try {
      const { data, error } = await supabase.rpc(emailLoginStatusRpc, { p_emails: uniq });
      if (error) throw error;
      const map = new Map((data || []).map((r) => [r.email, r.last_sign_in_at]));
      setLoginStatusByEmail(map);
    } catch {
      setLoginStatusByEmail(new Map());
    }
  }, [emailLoginStatusRpc]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "ok") => setToast({ msg, type });

  // Referensi distinct <col> dari mf_dse_database — dipakai utk menampilkan
  // baris "baru" (belum punya mapping sama sekali, siap diisi admin-nya).
  const [dseRefMap, setDseRefMap] = useState(new Map());
  const [fetchingRef, setFetchingRef] = useState(true);
  const fetchRefData = useCallback(async () => {
    setFetchingRef(true);
    try {
      const { data, error } = await supabase.from("mf_dse_database").select(col).not(col, "is", null);
      if (error) throw error;
      const map = new Map();
      (data || []).forEach((r) => {
        const val = r[col];
        if (!val) return;
        const key = String(val).trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, val);
      });
      setDseRefMap(map);
    } catch {
      // referensi gagal dimuat — tabel tetap jalan, cuma tanpa daftar baris baru otomatis
    } finally {
      setFetchingRef(false);
    }
  }, [col]);

  const isHistorical = !!asOfDate;

  const fetchRows = useCallback(async () => {
    setFetching(true);
    try {
      if (isHistorical) {
        const { data, error } = await supabase.rpc(mappingAsOfRpc, { p_as_of: asOfDate });
        if (error) throw error;
        const sorted = (data || []).slice().sort((a, b) => (a[col] || "").localeCompare(b[col] || ""));
        const byKey = new Map();
        sorted.forEach((r) => {
          byKey.set((r[col] || "").toLowerCase(), (r.emails || []).map((e, i) => ({ id: `h${i}`, mapping_id: null, email: e.email, label: e.label, active: true })));
        });
        setEmailsByKey(byKey);
        setRows(sorted);
        return sorted;
      }
      const [mapRes, emailRes] = await Promise.all([
        supabase.from(mappingTable).select("*").order(col, { ascending: true }),
        supabase.from(emailsTable).select("*").order("email", { ascending: true }),
      ]);
      if (mapRes.error) throw mapRes.error;
      if (emailRes.error) throw emailRes.error;
      const mapById = new Map((mapRes.data || []).map((m) => [m.id, m[col]]));
      const byKey = new Map();
      (emailRes.data || []).forEach((e) => {
        const val = mapById.get(e.mapping_id);
        if (!val) return;
        const key = val.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(e);
      });
      setEmailsByKey(byKey);
      setRows(mapRes.data || []);
      fetchLoginStatus((emailRes.data || []).map((e) => e.email));
      return mapRes.data || [];
    } catch (e) {
      showToast(e.message || "Gagal memuat data.", "error");
      return [];
    } finally {
      setFetching(false);
    }
  }, [isHistorical, asOfDate, fetchLoginStatus, col, mappingTable, emailsTable, mappingAsOfRpc]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchRows(); if (!isHistorical) fetchRefData(); else setFetchingRef(false); }, [fetchRows, fetchRefData, isHistorical]);

  const EDITABLE_FIELDS = ["full_name"];
  const ensureMappingRow = useCallback(async (val) => {
    const key = val.toLowerCase();
    const existing = rows.find((r) => r[col]?.toLowerCase() === key);
    if (existing?.id) return existing;
    const payload = { [col]: val, active: true };
    const { data, error } = await supabase.from(mappingTable).upsert(payload, { onConflict: col }).select().single();
    if (error) throw error;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === data.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = data; return next; }
      return [...prev, data].sort((a, b) => (a[col] || "").localeCompare(b[col] || ""));
    });
    return data;
  }, [rows, col, mappingTable]);

  // "Tambah <label> Baru" — cukup ketik nilai baru langsung (tidak ada
  // picker hierarki seperti AdminAreaMapping, krn Partner/Circle/Region
  // bukan nested di bawah level lain yg perlu dipilih dulu).
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowName, setNewRowName] = useState("");
  const [addRowBusy, setAddRowBusy] = useState(false);
  const handleAddNewRow = async () => {
    const val = newRowName.trim().toUpperCase();
    if (!val) { showToast(`Nama ${label} wajib diisi.`, "error"); return; }
    const key = val.toLowerCase();
    if (rows.some((r) => r[col]?.toLowerCase() === key) || dseRefMap.has(key)) {
      showToast(`${label} "${val}" sudah ada.`, "error");
      return;
    }
    setAddRowBusy(true);
    try {
      const payload = { [col]: val, active: true };
      const { data, error } = await supabase.from(mappingTable).upsert(payload, { onConflict: col }).select().single();
      if (error) throw error;
      setRows((prev) => [...prev, data].sort((a, b) => (a[col] || "").localeCompare(b[col] || "")));
      showToast(`${label} ${val} ditambahkan.`, "ok");
      setShowAddRow(false);
      setNewRowName("");
    } catch (e) {
      showToast(e.message || `Gagal menambahkan ${label}.`, "error");
    } finally {
      setAddRowBusy(false);
    }
  };

  const handleCellBlur = async (val, field, value) => {
    if (isHistorical) return;
    const key = val.toLowerCase();
    const existing = rows.find((r) => r[col]?.toLowerCase() === key);
    const trimmed = field === "full_name" ? value.trim().toUpperCase() : value.trim();
    if (existing && (existing[field] || "") === trimmed) return;
    const payload = { [col]: val, active: existing?.active ?? true };
    EDITABLE_FIELDS.forEach((f) => {
      payload[f] = f === field ? (trimmed || null) : (existing?.[f] || null);
    });
    setSavingKey(key);
    try {
      const { data, error } = await supabase.from(mappingTable).upsert(payload, { onConflict: col }).select().single();
      if (error) throw error;
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === data.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = data; return next; }
        return [...prev, data].sort((a, b) => (a[col] || "").localeCompare(b[col] || ""));
      });
    } catch (e) {
      showToast(e.message || "Gagal menyimpan.", "error");
    } finally {
      setSavingKey(null);
    }
  };
  const [savingKey, setSavingKey] = useState(null);

  // ── Kelola Email per-baris (popover) ────────────────────────────────
  const [emailPanelVal, setEmailPanelVal] = useState(null);
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const addEmail = async (val) => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("Masukkan email yang valid.", "error"); return; }
    const emailLabel = newLabel.trim().toUpperCase();
    if (!emailLabel) { showToast("Nama admin wajib diisi.", "error"); return; }
    const currentCount = (emailsByKey.get(val.toLowerCase()) || []).filter((e) => e.active !== false).length;
    if (currentCount >= maxSlots) { showToast(`Maksimal ${maxSlots} email admin untuk ${label} ini.`, "error"); return; }
    setEmailBusy(true);
    try {
      const mapping = await ensureMappingRow(val);
      const { data, error } = await supabase.from(emailsTable)
        .insert({ mapping_id: mapping.id, email, label: emailLabel, active: true })
        .select().single();
      if (error) {
        if (String(error.code) === "23505") throw new Error(`Email ini sudah terpasang di ${label} ini.`);
        throw error;
      }
      setEmailsByKey((prev) => {
        const next = new Map(prev);
        const key = val.toLowerCase();
        next.set(key, [...(next.get(key) || []), data]);
        return next;
      });
      setNewEmail(""); setNewLabel("");
      ensureRoleAccess(email, roleKey).catch((e) => console.error("[AdminLevelMapping] ensureRoleAccess gagal:", e));
      showToast(`Email ditambahkan ke ${val}.`, "ok");
    } catch (e) {
      showToast(e.message || "Gagal menambahkan email.", "error");
    } finally {
      setEmailBusy(false);
    }
  };

  const removeEmail = async (val, emailRow) => {
    if (!window.confirm(`Hapus ${emailRow.email} dari ${val}?`)) return;
    setEmailBusy(true);
    try {
      const { error } = await supabase.from(emailsTable).delete().eq("id", emailRow.id);
      if (error) throw error;
      setEmailsByKey((prev) => {
        const next = new Map(prev);
        const key = val.toLowerCase();
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

  const toggleEmailActive = async (val, emailRow) => {
    const willBeActive = !emailRow.active;
    if (willBeActive) {
      const currentCount = (emailsByKey.get(val.toLowerCase()) || []).filter((e) => e.active !== false).length;
      if (currentCount >= maxSlots) { showToast(`Maksimal ${maxSlots} email admin untuk ${label} ini.`, "error"); return; }
    }
    setEmailBusy(true);
    try {
      const { error } = await supabase.from(emailsTable).update({ active: willBeActive }).eq("id", emailRow.id);
      if (error) throw error;
      setEmailsByKey((prev) => {
        const next = new Map(prev);
        const key = val.toLowerCase();
        next.set(key, (next.get(key) || []).map((e) => (e.id === emailRow.id ? { ...e, active: willBeActive } : e)));
        return next;
      });
      if (willBeActive) ensureRoleAccess(emailRow.email, roleKey).catch((e) => console.error("[AdminLevelMapping] ensureRoleAccess gagal:", e));
    } catch (e) {
      showToast(e.message || "Gagal mengubah status email.", "error");
    } finally {
      setEmailBusy(false);
    }
  };

  const [editingEmailRow, setEditingEmailRow] = useState(null); // { val, row } | null
  const [editDraftEmail, setEditDraftEmail] = useState("");
  const [editDraftLabel, setEditDraftLabel] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const openEditEmail = (val, row) => {
    setEditingEmailRow({ val, row });
    setEditDraftEmail(row.email || "");
    setEditDraftLabel(row.label || "");
  };
  const saveEditEmail = async () => {
    if (!editingEmailRow) return;
    const email = editDraftEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("Masukkan email yang valid.", "error"); return; }
    const editLabel = editDraftLabel.trim().toUpperCase();
    if (!editLabel) { showToast("Nama admin wajib diisi.", "error"); return; }
    setEditBusy(true);
    try {
      const { data, error } = await supabase.from(emailsTable)
        .update({ email, label: editLabel })
        .eq("id", editingEmailRow.row.id).select().single();
      if (error) {
        if (String(error.code) === "23505") throw new Error(`Email ini sudah terpasang di ${label} ini.`);
        throw error;
      }
      setEmailsByKey((prev) => {
        const next = new Map(prev);
        const key = editingEmailRow.val.toLowerCase();
        next.set(key, (next.get(key) || []).map((x) => (x.id === data.id ? data : x)));
        return next;
      });
      ensureRoleAccess(email, roleKey).catch((e) => console.error("[AdminLevelMapping] ensureRoleAccess gagal:", e));
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
    await removeEmail(editingEmailRow.val, editingEmailRow.row);
    setEditingEmailRow(null);
  };

  // Baris yang ditampilkan = baris mapping yg sudah ada, DIGABUNG dgn nilai
  // <col> dari Database DSE yang BELUM punya mapping sama sekali.
  const displayRows = useMemo(() => {
    const byKey = new Map();
    rows.forEach((r) => { if (r[col]) byKey.set(r[col].toLowerCase(), r); });
    dseRefMap.forEach((val, key) => {
      if (byKey.has(key)) return;
      byKey.set(key, { id: null, [col]: val, full_name: "", active: true });
    });
    return Array.from(byKey.values()).sort((a, b) => (a[col] || "").localeCompare(b[col] || ""));
  }, [rows, dseRefMap, col]);

  const emailGroupKey = (val) => {
    const emails = emailsByKey.get(val?.toLowerCase()) || [];
    const active = emails.filter((e) => e.active !== false);
    if (active.length === 0) return null;
    return active.map((e) => e.email?.toLowerCase() || "").sort().join(",");
  };

  const filtered = displayRows
    .filter((r) => {
      if (!search) return true;
      const s = search.toLowerCase();
      const emails = emailsByKey.get(r[col]?.toLowerCase()) || [];
      return r[col]?.toLowerCase().includes(s) || r.full_name?.toLowerCase().includes(s)
        || emails.some((e) => e.email?.toLowerCase().includes(s) || e.label?.toLowerCase().includes(s));
    })
    .slice()
    .sort((a, b) => {
      const ka = emailGroupKey(a[col]);
      const kb = emailGroupKey(b[col]);
      if (ka === null && kb === null) return (a[col] || "").localeCompare(b[col] || "");
      if (ka === null) return 1;
      if (kb === null) return -1;
      return ka.localeCompare(kb) || (a[col] || "").localeCompare(b[col] || "");
    });

  // ── Download/Upload Daftar Email ────────────────────────────────────
  const handleDownloadEmails = async () => {
    const head = [label, "#", "Nama Admin", "Email Admin"];
    const blocks = [];
    displayRows.forEach((r) => {
      const key = r[col]?.toLowerCase();
      const emails = emailsByKey.get(key) || [];
      const rowEmails = isHistorical ? emails : emails.filter((e) => e.active !== false);
      let slots;
      if (isHistorical) {
        slots = (rowEmails.length ? rowEmails : [null]).map((e) => ({ e, filled: !!e }));
      } else {
        const filledSlots = rowEmails.slice(0, maxSlots).map((e) => ({ e, filled: true }));
        const emptySlots = Array.from({ length: Math.max(maxSlots - filledSlots.length, 0) }, () => ({ e: null, filled: false }));
        slots = [...filledSlots, ...emptySlots];
      }
      blocks.push({
        rowCount: slots.length,
        rows: slots.map((slot, i) => {
          const { e, filled } = slot;
          return [
            r[col] || "",
            i + 1,
            filled ? (e.label || r.full_name || `Admin ${i + 1}`) : "Kosong",
            filled ? (e.email || "") : "—",
          ];
        }),
      });
    });
    const totalRows = blocks.reduce((n, b) => n + b.rowCount, 0);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Daftar Email ${label}`.slice(0, 31));
    ws.columns = [{ width: 22 }, { width: 4 }, { width: 28 }, { width: 30 }];
    const thinBorder = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    const RED = "FFC00000";
    const GOLD = "FFE8A33D";
    const headerRow = ws.addRow(head);
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colNumber <= 2 ? RED : GOLD } };
    });
    headerRow.height = 22;
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };

    if (totalRows === 0) {
      const emptyRow = ws.addRow(["", "", "", ""]);
      emptyRow.eachCell((cell) => { cell.border = thinBorder; });
    } else {
      blocks.forEach((block) => {
        const startRow = ws.rowCount + 1;
        block.rows.forEach((r) => {
          const row = ws.addRow(r);
          row.eachCell((cell) => { cell.border = thinBorder; });
        });
        const endRow = ws.rowCount;
        for (let c = 2; c <= 4; c++) {
          const topCell = ws.getCell(startRow, c);
          topCell.border = { ...topCell.border, top: { style: "medium" } };
          const bottomCell = ws.getCell(endRow, c);
          bottomCell.border = { ...bottomCell.border, bottom: { style: "medium" } };
        }
        if (endRow > startRow) {
          ws.mergeCells(startRow, 1, endRow, 1);
          const cell = ws.getCell(startRow, 1);
          cell.alignment = { vertical: "middle", horizontal: "left" };
          cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
        } else {
          const cell = ws.getCell(startRow, 1);
          cell.alignment = { vertical: "middle", horizontal: "left" };
          cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
        }
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Daftar_Email_${label.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Daftar email diunduh — ${totalRows} baris.`, "ok");
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
      const idxKey = header.findIndex((h) => h === label.toLowerCase() || h === col);
      const idxLabel = header.findIndex((h) => /nama admin|label/.test(h));
      const idxEmail = header.findIndex((h) => /email/.test(h));
      if (idxKey === -1 || idxEmail === -1) {
        throw new Error(`Kolom wajib tidak ditemukan. Pastikan ada kolom "${label}" dan "Email Admin" (boleh berisi lebih dari 1 email dipisah koma).`);
      }
      const knownByKey = new Map();
      displayRows.forEach((r) => { if (r[col]) knownByKey.set(r[col].toLowerCase(), r[col]); });
      let addedCount = 0, skippedCount = 0, notFoundCount = 0, touched = 0, capSkipped = 0;
      const touchedEmails = [];
      const notFoundSample = [];
      let lastVal = "";
      for (let i = 1; i < rowsRaw.length; i++) {
        const line = rowsRaw[i];
        const cell = String(line[idxKey] || "").trim();
        if (cell) lastVal = cell;
        const raw = cell || lastVal;
        if (!raw) continue;
        const key = raw.toLowerCase();
        const val = knownByKey.get(key);
        if (!val) {
          notFoundCount++;
          if (notFoundSample.length < 5) notFoundSample.push(raw);
          continue;
        }
        const labelRaw = idxLabel >= 0 ? String(line[idxLabel] || "").trim() : "";
        const emailCell = String(line[idxEmail] || "").trim();
        if (!emailCell) continue;
        const pieces = splitEmailCell(emailCell);
        if (!pieces.length) { skippedCount++; continue; }
        const mapping = await ensureMappingRow(val);
        touched++;
        let currentCount = (emailsByKey.get(key) || []).filter((e) => e.active !== false).length;
        for (const piece of pieces) {
          if (currentCount >= maxSlots) { capSkipped++; continue; }
          const pieceLabel = pieces.length > 1 && piece.label ? piece.label.toUpperCase() : (labelRaw || piece.label || null);
          const { error } = await supabase.from(emailsTable)
            .upsert({ mapping_id: mapping.id, email: piece.email, label: pieceLabel, active: true }, { onConflict: "mapping_id,email" })
            .select();
          if (error && String(error.code) !== "23505") { skippedCount++; continue; }
          addedCount++;
          currentCount++;
          touchedEmails.push(piece.email);
        }
      }
      await fetchRows();
      if (touchedEmails.length) {
        ensureRoleAccessBulk(touchedEmails, roleKey).catch((e) => console.error("[AdminLevelMapping] ensureRoleAccessBulk gagal:", e));
      }
      const parts = [`${addedCount} email diproses pada ${touched} ${label}`];
      if (skippedCount) parts.push(`${skippedCount} baris dilewati`);
      if (capSkipped) parts.push(`${capSkipped} dilewati (sudah mencapai maksimal ${maxSlots})`);
      if (notFoundCount) parts.push(`${notFoundCount} baris gagal ("${notFoundSample.join(", ")}"${notFoundCount > notFoundSample.length ? ", ..." : ""} tidak ditemukan)`);
      showToast(`Upload selesai — ${parts.join(", ")}.`, notFoundCount ? "warn" : "ok");
    } catch (e) {
      showToast(e.message || "Gagal mengupload daftar email.", "error");
    } finally {
      setImportingEmails(false);
      if (emailFileRef.current) emailFileRef.current.value = "";
    }
  };

  const inputStyle = { width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
  const cellInputStyle = { width: "100%", height: 30, padding: "0 8px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };

  const emailPanelRow = emailPanelVal ? displayRows.find((r) => r[col]?.toLowerCase() === emailPanelVal.toLowerCase()) : null;
  const emailPanelList = emailPanelVal ? (emailsByKey.get(emailPanelVal.toLowerCase()) || []) : [];
  const emailPanelCount = emailPanelList.filter((e) => e.active !== false).length;

  return (
    <div style={{ fontFamily: FONT, color: t.hi }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <UserRoundCog size={20} color={t.teal} />
            <div style={{ fontSize: 19, fontWeight: 800 }}>Mapping & User Management — {label}</div>
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

      {/* ── Popover "Kelola Email" per baris ─────────────────────────── */}
      {emailPanelVal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setEmailPanelVal(null); }}>
          <div style={{ width: "100%", maxWidth: 480, background: d ? "#15151A" : "#FFFFFF", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", padding: 20, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Kelola Email — {emailPanelRow?.[col]}</div>
              <button onClick={() => setEmailPanelVal(null)} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: t.hi, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 12, color: t.mid, marginBottom: 14 }}>
              Semua email di bawah ini bisa login sebagai {label} untuk {emailPanelRow?.[col]}, dengan akses lihat data (read-only) scoped ke {label.toLowerCase()} ini. Maksimal {maxSlots} email ({emailPanelCount}/{maxSlots} terpakai).
            </div>

            {emailPanelList.length === 0 && (
              <div style={{ padding: "14px 0", textAlign: "center", color: t.mid, fontSize: 12.5 }}>Belum ada email admin utk {label} ini.</div>
            )}
            {emailPanelList.map((e, i) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${t.line}` }}>
                <div style={{ width: 24, height: 24, borderRadius: 999, background: t.tealBg, color: t.teal, fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {e.label && <div style={{ fontSize: 11.5, fontWeight: 700, color: t.hi }}>{e.label}</div>}
                  <div style={{ fontSize: e.label ? 11.5 : 13, fontWeight: e.label ? 500 : 700, color: e.label ? t.mid : t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.email}</div>
                </div>
                <button onClick={() => toggleEmailActive(emailPanelVal, e)} disabled={emailBusy} title={e.active ? "Aktif" : "Nonaktif"}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: e.active ? t.teal : t.lo, fontSize: 11, fontWeight: 700 }}>
                  {e.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                </button>
                <button onClick={() => removeEmail(emailPanelVal, e)} disabled={emailBusy} title="Hapus"
                  style={{ background: "none", border: "none", color: t.red, cursor: "pointer", display: "flex" }}><Trash2 size={14} /></button>
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@contoh.com"
                onKeyDown={(e) => e.key === "Enter" && addEmail(emailPanelVal)} style={{ ...cellInputStyle, height: 36, flex: 1.4 }} />
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nama admin"
                onKeyDown={(e) => e.key === "Enter" && addEmail(emailPanelVal)} style={{ ...cellInputStyle, height: 36, flex: 1 }} />
              <button onClick={() => addEmail(emailPanelVal)} disabled={emailBusy || emailPanelCount >= maxSlots}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 7, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: (emailBusy || emailPanelCount >= maxSlots) ? "not-allowed" : "pointer", flexShrink: 0, opacity: (emailBusy || emailPanelCount >= maxSlots) ? 0.6 : 1 }}>
                {emailBusy ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Tambah
              </button>
            </div>

            {!isHistorical && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${t.line}` }}>
                <div style={{ fontSize: 10.5, color: t.lo, marginBottom: 5 }}>Nama default (fallback kalau salah satu email di atas belum punya nama sendiri)</div>
                <input key={`${emailPanelVal}-fn-${emailPanelRow?.full_name || ""}`} defaultValue={emailPanelRow?.full_name || ""} placeholder={`Contoh: Admin ${label} ${emailPanelVal || ""}`}
                  onBlur={(ev) => handleCellBlur(emailPanelVal, "full_name", ev.target.value)} style={{ ...cellInputStyle, maxWidth: "100%" }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Popover "Tambah Baru" ────────────────────────────────────── */}
      {showAddRow && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(ev) => { if (ev.target === ev.currentTarget && !addRowBusy) setShowAddRow(false); }}>
          <div style={{ width: "100%", maxWidth: 420, background: d ? "#15151A" : "#FFFFFF", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Tambah {label} Baru</div>
              <button onClick={() => !addRowBusy && setShowAddRow(false)} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: t.hi, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 12, color: t.mid, marginBottom: 14 }}>
              Dipakai utk {label} yang BENERAN belum ada sama sekali di Database DSE.
            </div>

            <div style={{ fontSize: 10.5, color: t.lo, marginBottom: 5 }}>Nama {label} baru</div>
            <input value={newRowName} onChange={(ev) => setNewRowName(ev.target.value)} placeholder={`Contoh: NAMA ${label.toUpperCase()} BARU`}
              style={{ ...cellInputStyle, height: 36, marginBottom: 16 }} />

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }} />
              <button onClick={() => !addRowBusy && setShowAddRow(false)} disabled={addRowBusy}
                style={{ height: 36, padding: "0 12px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: "none", color: t.mid, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              <button onClick={handleAddNewRow} disabled={addRowBusy}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 7, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: addRowBusy ? "not-allowed" : "pointer" }}>
                {addRowBusy ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Simpan
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
              <div style={{ fontSize: 16, fontWeight: 800 }}>Edit Admin — {editingEmailRow.val}</div>
              <button onClick={() => setEditingEmailRow(null)} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: t.hi, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
            </div>
            <div style={{ fontSize: 12, color: t.mid, marginBottom: 14 }}>
              Ganti email atau nama admin ini, atau hapus sepenuhnya dari {editingEmailRow.val}.
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder || `Cari ${label} / nama admin / email…`} style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <button onClick={fetchRows} title="Refresh" style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <RefreshCw size={14} className={fetching ? "spin" : ""} />
          </button>
          {!isHistorical && (
            <button onClick={() => setShowAddRow(true)} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              <Plus size={14} /> Tambah {label} Baru
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
            Belum ada {label}. Tambahkan dulu di Database DSE, lalu isi admin-nya di sini.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              {(() => {
                const th = { textAlign: "left", padding: "10px 12px", fontSize: 10.5, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap", border: `1px solid ${t.line}` };
                return (
              <thead>
                <tr style={{ background: t.sub, borderBottom: `1px solid ${t.line}` }}>
                  <th style={th}>{label.toUpperCase()}</th>
                  <th style={th}>#</th>
                  <th style={th}>NAMA ADMIN</th>
                  <th style={th}>EMAIL ADMIN</th>
                  <th style={{ ...th, borderLeft: `2px solid ${t.line}` }}>AKSI</th>
                  <th style={{ ...th, borderLeft: `2px solid ${t.line}` }}>STATUS</th>
                </tr>
              </thead>
                ); })()}
              <tbody>
                {filtered.map((r) => {
                  const val = r[col];
                  const key = val?.toLowerCase();
                  const isVirtual = !r.id;
                  const emails = emailsByKey.get(key) || [];
                  const rowEmails = isHistorical ? emails : emails.filter((e) => e.active !== false);
                  const rowCellStyle = { padding: "10px 12px", border: `1px solid ${t.line}`, verticalAlign: "top", whiteSpace: "nowrap", background: isVirtual ? t.amberBg : undefined };
                  const slotCellStyle = { padding: "10px 12px", border: `1px solid ${t.line}`, whiteSpace: "nowrap" };

                  let slots, hiddenCount;
                  if (isHistorical) {
                    slots = (rowEmails.length ? rowEmails : [null]).map((e) => ({ e, filled: !!e }));
                    hiddenCount = 0;
                  } else {
                    const filledSlots = rowEmails.slice(0, maxSlots).map((e) => ({ e, filled: true }));
                    const emptySlots = Array.from({ length: Math.max(maxSlots - filledSlots.length, 0) }, () => ({ e: null, filled: false }));
                    slots = [...filledSlots, ...emptySlots];
                    hiddenCount = Math.max(rowEmails.length - maxSlots, 0);
                  }
                  const rowsOut = [];

                  slots.forEach((slot, i) => {
                    const { e, filled } = slot;
                    rowsOut.push(
                      <tr key={`${val}-slot-${i}`} style={{ borderBottom: `1px solid ${t.line}` }}>
                        <td style={{ ...rowCellStyle, fontWeight: 800, color: t.hi }}>
                          {val}
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
                              <button onClick={() => openEditEmail(val, e)} title="Edit admin ini"
                                style={{ display: "flex", alignItems: "center", gap: 5, background: t.teal, border: `1px solid ${t.teal}`, borderRadius: 7, padding: "4px 8px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: t.shadowSm }}>
                                <Pencil size={11} /> Edit
                              </button>
                            )
                          ) : (
                            !isHistorical && (
                              <button onClick={() => setEmailPanelVal(val)} title="Tambah admin"
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
                      <tr key={`${val}-more`} style={{ borderBottom: `1px solid ${t.line}` }}>
                        <td colSpan={6} style={{ padding: "8px 12px", border: `1px solid ${t.line}` }}>
                          <button onClick={() => setEmailPanelVal(val)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, color: t.teal, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
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
