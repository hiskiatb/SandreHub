"use client";
/**
 * PNL_AdminPanel.jsx
 * Halaman admin khusus role spm_sumatera.
 * Tabs:
 *  1. Role & Permissions — atur modul apa saja yang bisa diakses per role
 *  2. Access Codes       — daftar kode otoritas, tambah / nonaktifkan
 *  3. Partner Branches   — daftar branch, tambah / edit partner
 */

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import supabase from "../../../lib/supabase";
import {
  Shield, Key, Building2, Plus, Trash2, RotateCcw,
  Check, X, RefreshCw, Copy, ChevronDown, Search,
  CheckCircle2, XCircle, AlertCircle, Loader2,
  Eye, Edit3, Save, Globe, Users, Lock, Unlock,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL_ROLES = [
  { value: "spm_sumatera",         label: "SPM Sumatera",              region: null,              color: "#C6168D" },
  { value: "finance_mpx",          label: "Finance MPX",               region: null,              color: "#ED1C24" },
  { value: "internal_ioh",         label: "Internal IOH (Seluruh Sum.)",region: null,              color: "#32BCAD" },
  { value: "ioh_north_sumatera",   label: "IOH North Sumatera",        region: "NORTH SUMATERA",  color: "#3B82F6" },
  { value: "ioh_central_sumatera", label: "IOH Central Sumatera",      region: "CENTRAL SUMATERA",color: "#F59E0B" },
  { value: "ioh_south_sumatera",   label: "IOH South Sumatera",        region: "SOUTH SUMATERA",  color: "#10B981" },
];

const PERMISSION_COLS = [
  { key: "can_view_control_center",  label: "Control Center",  icon: "👁" },
  { key: "can_view_pivot_summary",   label: "Pivot Summary",   icon: "📊" },
  { key: "can_view_payout_tracker",  label: "Payout Tracker",  icon: "💳" },
  { key: "can_view_pnl_forms",       label: "Lihat Form P&L",  icon: "📄" },
  { key: "can_edit_pnl_forms",       label: "Edit Form P&L",   icon: "✏️" },
  { key: "can_disable_months",       label: "Nonaktifkan Bulan",icon: "🔒" },
  { key: "can_upload_payout",        label: "Upload Payout",   icon: "📤" },
];

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;

// ─── Design tokens ────────────────────────────────────────────────────────────
const tk = (d) => ({
  card:     d ? "#1A1A1D" : "#FFFFFF",
  sub:      d ? "#202024" : "#F5F5F7",
  hover:    d ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)",
  line:     d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)",
  lineH:    d ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
  hi:       d ? "#F2F2F3" : "#18181B",
  mid:      d ? "#8A8A96" : "#52525B",
  lo:       d ? "#4D4D58" : "#A1A1AA",
  inputBg:  d ? "rgba(255,255,255,0.05)" : "#FFFFFF",
  inputBd:  d ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.13)",
  shadow:   d ? "0 1px 3px rgba(0,0,0,0.5)" : "0 1px 3px rgba(0,0,0,0.07)",
  violet:   d ? "#A78BFA" : "#7C3AED",
  violetBg: d ? "rgba(167,139,250,0.12)" : "rgba(124,58,237,0.07)",
  violetBd: d ? "rgba(167,139,250,0.28)" : "rgba(124,58,237,0.18)",
  green:    d ? "#32BCAD" : "#1A9E90",
  greenBg:  d ? "rgba(50,188,173,0.13)" : "rgba(50,188,173,0.09)",
  greenBd:  d ? "rgba(50,188,173,0.30)" : "rgba(50,188,173,0.22)",
  amber:    d ? "#FFCB05" : "#C49A00",
  amberBg:  d ? "rgba(255,203,5,0.12)" : "rgba(255,203,5,0.09)",
  amberBd:  d ? "rgba(255,203,5,0.28)" : "rgba(255,203,5,0.22)",
  red:      d ? "#FF6B6B" : "#DC2626",
  redBg:    d ? "rgba(255,107,107,0.12)" : "rgba(220,38,38,0.07)",
  redBd:    d ? "rgba(255,107,107,0.28)" : "rgba(220,38,38,0.20)",
});

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((type, msg) => {
    setToast({ type, msg, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  }, []);
  return [toast, show];
}

function Toast({ toast, t, d }) {
  if (!toast) return null;
  const isOk = toast.type === "success";
  return typeof document !== "undefined" ? createPortal(
    <div style={{
      position: "fixed", top: 70, right: 16, zIndex: 99999,
      maxWidth: 320, padding: "11px 15px", borderRadius: 12,
      background: t.card, border: `1px solid ${isOk ? t.greenBd : t.redBd}`,
      boxShadow: d ? "0 12px 36px rgba(0,0,0,0.60)" : "0 12px 36px rgba(0,0,0,0.12)",
      display: "flex", alignItems: "center", gap: 10, fontFamily: FONT,
      animation: "slide-in .2s ease",
    }}>
      <style>{`@keyframes slide-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {isOk
        ? <CheckCircle2 size={16} style={{ color: t.green, flexShrink: 0 }} />
        : <AlertCircle size={16} style={{ color: t.red, flexShrink: 0 }} />}
      <span style={{ fontSize: 13, color: t.hi, fontWeight: 500 }}>{toast.msg}</span>
    </div>,
    document.body
  ) : null;
}

// ─── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({ open, title, body, confirmLabel = "Konfirmasi", danger, onConfirm, onCancel, t, d }) {
  if (!open) return null;
  return typeof document !== "undefined" ? createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 99998, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.60)", backdropFilter: "blur(6px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 28, maxWidth: 380, width: "90%", fontFamily: FONT, boxShadow: "0 20px 48px rgba(0,0,0,0.45)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: t.hi, marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: t.mid, lineHeight: 1.6, marginBottom: 22 }}>{body}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "9px 18px", borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT }}>Batal</button>
          <button onClick={onConfirm} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: danger ? t.red : t.violet, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;
}

// ─── Tab button ───────────────────────────────────────────────────────────────
function Tab({ icon: Icon, label, active, onClick, badge, t }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 7,
      padding: "9px 16px", borderRadius: 9, border: "none", cursor: "pointer",
      background: active ? t.violetBg : "transparent",
      color: active ? t.violet : t.mid,
      fontWeight: active ? 700 : 500, fontSize: 13.5, fontFamily: FONT,
      borderBottom: active ? `2px solid ${t.violet}` : "2px solid transparent",
      transition: "all .14s", position: "relative",
    }}>
      <Icon size={15} style={{ flexShrink: 0 }} />
      <span>{label}</span>
      {badge > 0 && (
        <span style={{ minWidth: 18, height: 18, borderRadius: 99, background: t.violet, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{badge}</span>
      )}
    </button>
  );
}

// ─── Toggle checkbox ──────────────────────────────────────────────────────────
function Toggle({ value, onChange, disabled, t }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={{
        width: 36, height: 20, borderRadius: 99,
        background: value ? t.green : t.line,
        border: "none", cursor: disabled ? "not-allowed" : "pointer",
        position: "relative", transition: "background .18s", flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        position: "absolute", top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: "50%",
        background: "#FFFFFF",
        transition: "left .18s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.20)",
      }} />
    </button>
  );
}

// ─── Section 1: Role Permissions ─────────────────────────────────────────────
function RolePermissionsSection({ t, d }) {
  const [perms, setPerms] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, showToast] = useToast();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("role_permissions").select("*");
      if (!error && data) {
        const map = {};
        data.forEach(r => { map[r.role] = r; });
        setPerms(map);
      }
      setLoading(false);
    })();
  }, []);

  const toggle = (role, key) => {
    // SPM always has all — protect it
    if (role === "spm_sumatera") return;
    setPerms(prev => ({
      ...prev,
      [role]: { ...prev[role], [key]: !prev[role]?.[key] },
    }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const role of Object.keys(perms)) {
        if (role === "spm_sumatera") continue;
        const row = perms[role];
        const { error } = await supabase
          .from("role_permissions")
          .upsert({
            role,
            can_view_control_center:  !!row.can_view_control_center,
            can_view_pivot_summary:   !!row.can_view_pivot_summary,
            can_view_payout_tracker:  !!row.can_view_payout_tracker,
            can_view_pnl_forms:       !!row.can_view_pnl_forms,
            can_edit_pnl_forms:       !!row.can_edit_pnl_forms,
            can_disable_months:       !!row.can_disable_months,
            can_upload_payout:        !!row.can_upload_payout,
            region_filter:            row.region_filter ?? null,
            updated_at:               new Date().toISOString(),
          }, { onConflict: "role" });
        if (error) throw error;
      }
      setDirty(false);
      showToast("success", "Permission berhasil disimpan");
    } catch (e) {
      showToast("error", e.message || "Gagal menyimpan");
    }
    setSaving(false);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 240, gap: 10, color: t.mid, fontFamily: FONT }}>
      <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 13 }}>Memuat permission…</span>
    </div>
  );

  return (
    <div>
      <Toast toast={toast} t={t} d={d} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.hi }}>Permission per Role</div>
          <div style={{ fontSize: 12, color: t.mid, marginTop: 3 }}>Toggle untuk mengatur modul mana yang dapat diakses setiap role.</div>
        </div>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 9, border: "none",
              background: t.violet, color: "#fff", cursor: "pointer",
              fontSize: 13, fontWeight: 700, fontFamily: FONT,
            }}
          >
            {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={13} />}
            Simpan Perubahan
          </button>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700, fontFamily: FONT }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${t.line}`, background: t.sub }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, minWidth: 180 }}>Role</th>
              {PERMISSION_COLS.map(col => (
                <th key={col.key} style={{ padding: "10px 10px", textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.mid, minWidth: 90 }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_ROLES.map((role, ri) => {
              const p = perms[role.value] || {};
              const isSPM = role.value === "spm_sumatera";
              return (
                <tr
                  key={role.value}
                  style={{ borderBottom: `1px solid ${t.lineH}`, background: ri % 2 === 0 ? "transparent" : t.hover }}
                >
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: "50%",
                        background: role.color, flexShrink: 0,
                      }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>{role.label}</div>
                        {role.region && <div style={{ fontSize: 10.5, color: t.lo, marginTop: 1 }}>{role.region}</div>}
                        {isSPM && <div style={{ fontSize: 10, color: t.violet, fontWeight: 600, marginTop: 1 }}>PENUH — tidak dapat diubah</div>}
                      </div>
                    </div>
                  </td>
                  {PERMISSION_COLS.map(col => (
                    <td key={col.key} style={{ padding: "12px 10px", textAlign: "center" }}>
                      {isSPM
                        ? <CheckCircle2 size={17} style={{ color: t.green }} />
                        : <Toggle value={!!p[col.key]} onChange={() => toggle(role.value, col.key)} t={t} />
                      }
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section 2: Access Codes ──────────────────────────────────────────────────
function generateCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function AccessCodesSection({ t, d }) {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [partnersList, setPartnersList] = useState([]);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("ALL");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", type: "finance_mpx", partner_name: "", is_active: true });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [copied, setCopied] = useState(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("access_codes").select("*").order("code");
    if (data) setCodes(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    (async () => {
      const { data } = await supabase.from("partner_branches").select("partner_name");
      if (data) setPartnersList([...new Set(data.map(x => x.partner_name))].sort());
    })();
  }, [load]);

  const filtered = useMemo(() => {
    return codes.filter(c => {
      if (filterRole !== "ALL" && c.type !== filterRole) return false;
      if (search && !c.code.toLowerCase().includes(search.toLowerCase()) && !(c.partner_name || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [codes, filterRole, search]);

  const handleAdd = async () => {
    if (!form.code) { showToast("error", "Kode tidak boleh kosong"); return; }
    if (!form.type) { showToast("error", "Role wajib dipilih"); return; }
    if (form.type === "finance_mpx" && !form.partner_name) { showToast("error", "Partner wajib dipilih untuk Finance MPX"); return; }
    setSaving(true);
    const { error } = await supabase.from("access_codes").insert({
      code: form.code.toUpperCase().trim(),
      type: form.type,
      partner_name: form.partner_name || null,
      is_active: form.is_active,
    });
    setSaving(false);
    if (error) { showToast("error", error.message); return; }
    showToast("success", `Kode ${form.code} berhasil ditambahkan`);
    setForm({ code: "", type: "finance_mpx", partner_name: "", is_active: true });
    setShowAdd(false);
    load();
  };

  const toggleActive = async (id, current) => {
    const { error } = await supabase.from("access_codes").update({ is_active: !current }).eq("id", id);
    if (error) { showToast("error", error.message); return; }
    showToast("success", `Kode ${!current ? "diaktifkan" : "dinonaktifkan"}`);
    load();
  };

  const deleteCode = async (id) => {
    const { error } = await supabase.from("access_codes").delete().eq("id", id);
    if (error) { showToast("error", error.message); return; }
    showToast("success", "Kode dihapus");
    setConfirm(null);
    load();
  };

  const copy = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  const inputStyle = {
    width: "100%", background: t.inputBg, border: `1px solid ${t.inputBd}`,
    borderRadius: 9, padding: "9px 12px", fontSize: 13, fontWeight: 500,
    color: t.hi, outline: "none", fontFamily: FONT, boxSizing: "border-box",
  };
  const selectStyle = { ...inputStyle, appearance: "none", WebkitAppearance: "none", cursor: "pointer" };

  return (
    <div>
      <Toast toast={toast} t={t} d={d} />
      <ConfirmModal
        open={!!confirm}
        title="Hapus Kode Otoritas"
        body={`Kode "${confirm?.code}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        danger
        onConfirm={() => deleteCode(confirm.id)}
        onCancel={() => setConfirm(null)}
        t={t} d={d}
      />

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "1 1 180px", minWidth: 160, border: `1px solid ${t.inputBd}`, borderRadius: 9, background: t.inputBg, height: 36, padding: "0 12px" }}>
          <Search size={14} style={{ color: t.mid, flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari kode atau partner…"
            style={{ flex: 1, background: "transparent", border: "none", fontSize: 13, color: t.hi, outline: "none", fontFamily: FONT }} />
        </div>
        <div style={{ position: "relative" }}>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 170, paddingRight: 30, height: 36, padding: "0 30px 0 12px" }}>
            <option value="ALL">Semua Role</option>
            {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
        </div>
        <button onClick={() => setShowAdd(s => !s)} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "0 16px", height: 36, borderRadius: 9,
          border: `1px solid ${t.violetBd}`, background: t.violetBg,
          color: t.violet, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT,
        }}>
          <Plus size={14} /> Tambah Kode
        </button>
        <button onClick={load} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${t.line}`, borderRadius: 9, background: "transparent", cursor: "pointer", color: t.mid }}>
          <RefreshCw size={14} />
        </button>
        <span style={{ fontSize: 12, color: t.lo }}>{filtered.length} kode</span>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ marginBottom: 18, padding: "18px 20px", borderRadius: 12, border: `1px solid ${t.violetBd}`, background: t.violetBg }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.violet, marginBottom: 14 }}>Tambah Kode Baru</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, marginBottom: 5 }}>Kode</label>
              <div style={{ display: "flex", gap: 7 }}>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="Masukkan atau generate" style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => setForm(f => ({ ...f, code: generateCode() }))}
                  title="Generate random"
                  style={{ padding: "9px 10px", borderRadius: 9, border: `1px solid ${t.violetBd}`, background: t.card, color: t.violet, cursor: "pointer", flexShrink: 0 }}>
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, marginBottom: 5 }}>Role</label>
              <div style={{ position: "relative" }}>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, partner_name: "" }))} style={selectStyle}>
                  {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
              </div>
            </div>
            {form.type === "finance_mpx" && (
              <div>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, marginBottom: 5 }}>Partner</label>
                <div style={{ position: "relative" }}>
                  <select value={form.partner_name} onChange={e => setForm(f => ({ ...f, partner_name: e.target.value }))} style={selectStyle}>
                    <option value="">— Pilih Partner —</option>
                    {partnersList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
                </div>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: t.mid, fontFamily: FONT }}>
                <Toggle value={form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} t={t} />
                Aktif
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleAdd} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: "none", background: t.violet, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT }}>
              {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />}
              Tambah
            </button>
            <button onClick={() => { setShowAdd(false); setForm({ code: "", type: "finance_mpx", partner_name: "", is_active: true }); }}
              style={{ padding: "9px 16px", borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, cursor: "pointer", fontSize: 13, fontFamily: FONT }}>
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 180, gap: 10, color: t.mid, fontFamily: FONT }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /><span style={{ fontSize: 13 }}>Memuat…</span>
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT }}>
            <thead>
              <tr style={{ background: t.sub, borderBottom: `1px solid ${t.line}` }}>
                {["Kode", "Role", "Partner", "Status", "Aksi"].map((h, i) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: i === 4 ? "center" : "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ padding: "48px 0", textAlign: "center", color: t.lo, fontSize: 13 }}>Tidak ada kode ditemukan</td></tr>
              )}
              {filtered.map((c, i) => {
                const roleInfo = ALL_ROLES.find(r => r.value === c.type);
                return (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${t.lineH}`, background: i % 2 === 0 ? "transparent" : t.hover }}>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <code style={{ fontFamily: "ui-monospace,monospace", fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", color: t.hi, background: t.sub, padding: "3px 8px", borderRadius: 5 }}>{c.code}</code>
                        <button onClick={() => copy(c.code)} style={{ background: "none", border: "none", cursor: "pointer", color: copied === c.code ? t.green : t.lo, padding: 0, display: "flex" }}>
                          {copied === c.code ? <Check size={13} /> : <Copy size={13} />}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                        background: roleInfo ? `${roleInfo.color}20` : t.sub,
                        color: roleInfo?.color || t.mid,
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: roleInfo?.color || t.lo }} />
                        {roleInfo?.label || c.type}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px", fontSize: 13, color: c.partner_name ? t.hi : t.lo, fontStyle: c.partner_name ? "normal" : "italic" }}>
                      {c.partner_name || "—"}
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <Toggle value={!!c.is_active} onChange={() => toggleActive(c.id, c.is_active)} t={t} />
                    </td>
                    <td style={{ padding: "11px 14px", textAlign: "center" }}>
                      <button onClick={() => setConfirm(c)} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${t.redBd}`, background: t.redBg, color: t.red, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Section 3: Partner Branches ─────────────────────────────────────────────
const REGIONS_LIST = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA", "ACEH", "RIAU", "KEPRI", "JAMBI", "BENGKULU", "LAMPUNG", "SUMBAR", "SUMSEL", "BABEL"];
const MPC_LIST = ["MPC", "MP3"];

function PartnerBranchesSection({ t, d }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRegion, setFilterRegion] = useState("ALL");
  const [filterType, setFilterType] = useState("ALL");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ partner_name: "", branch_name: "", mpc_mp3: "MPC", region: "NORTH SUMATERA" });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("partner_branches").select("*").order("partner_name").order("branch_name");
    if (data) setBranches(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return branches.filter(b => {
      if (filterRegion !== "ALL" && b.region !== filterRegion) return false;
      if (filterType !== "ALL" && b.mpc_mp3 !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!b.partner_name.toLowerCase().includes(q) && !b.branch_name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [branches, search, filterRegion, filterType]);

  const partnerCount = useMemo(() => new Set(filtered.map(b => b.partner_name)).size, [filtered]);

  const handleSave = async () => {
    if (!form.partner_name.trim()) { showToast("error", "Nama partner wajib diisi"); return; }
    if (!form.branch_name.trim()) { showToast("error", "Nama branch wajib diisi"); return; }
    setSaving(true);
    try {
      if (editId) {
        const { error } = await supabase.from("partner_branches").update({
          partner_name: form.partner_name.trim(),
          branch_name:  form.branch_name.trim(),
          mpc_mp3:      form.mpc_mp3,
          region:       form.region,
        }).eq("id", editId);
        if (error) throw error;
        showToast("success", "Branch berhasil diperbarui");
      } else {
        const { error } = await supabase.from("partner_branches").insert({
          partner_name: form.partner_name.trim(),
          branch_name:  form.branch_name.trim(),
          mpc_mp3:      form.mpc_mp3,
          region:       form.region,
        });
        if (error) throw error;
        showToast("success", "Branch berhasil ditambahkan");
      }
      setForm({ partner_name: "", branch_name: "", mpc_mp3: "MPC", region: "NORTH SUMATERA" });
      setShowAdd(false);
      setEditId(null);
      load();
    } catch (e) {
      showToast("error", e.message);
    }
    setSaving(false);
  };

  const startEdit = (b) => {
    setForm({ partner_name: b.partner_name, branch_name: b.branch_name, mpc_mp3: b.mpc_mp3, region: b.region });
    setEditId(b.id);
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    const { error } = await supabase.from("partner_branches").delete().eq("id", id);
    if (error) { showToast("error", error.message); return; }
    showToast("success", "Branch dihapus");
    setConfirm(null);
    load();
  };

  const inputStyle = {
    width: "100%", background: t.inputBg, border: `1px solid ${t.inputBd}`,
    borderRadius: 9, padding: "9px 12px", fontSize: 13, fontWeight: 500,
    color: t.hi, outline: "none", fontFamily: FONT, boxSizing: "border-box",
  };
  const selectStyle = { ...inputStyle, appearance: "none", WebkitAppearance: "none", cursor: "pointer" };

  const regionColors = {
    "NORTH SUMATERA":   "#3B82F6",
    "CENTRAL SUMATERA": "#F59E0B",
    "SOUTH SUMATERA":   "#10B981",
  };
  const getRegionColor = (r) => regionColors[r] || "#8A8A96";

  return (
    <div>
      <Toast toast={toast} t={t} d={d} />
      <ConfirmModal
        open={!!confirm}
        title="Hapus Branch"
        body={`Branch "${confirm?.branch_name}" dari partner "${confirm?.partner_name}" akan dihapus permanen.`}
        confirmLabel="Hapus"
        danger
        onConfirm={() => handleDelete(confirm.id)}
        onCancel={() => setConfirm(null)}
        t={t} d={d}
      />

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "1 1 180px", minWidth: 160, border: `1px solid ${t.inputBd}`, borderRadius: 9, background: t.inputBg, height: 36, padding: "0 12px" }}>
          <Search size={14} style={{ color: t.mid, flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari partner atau branch…"
            style={{ flex: 1, background: "transparent", border: "none", fontSize: 13, color: t.hi, outline: "none", fontFamily: FONT }} />
        </div>
        <div style={{ position: "relative" }}>
          <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 180, height: 36, padding: "0 30px 0 12px" }}>
            <option value="ALL">Semua Region</option>
            {[...new Set(branches.map(b => b.region))].sort().map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
        </div>
        <div style={{ position: "relative" }}>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 120, height: 36, padding: "0 30px 0 12px" }}>
            <option value="ALL">Semua Tipe</option>
            <option value="MPC">MPC</option>
            <option value="MP3">MP3</option>
          </select>
          <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
        </div>
        <button onClick={() => { setShowAdd(s => !s); setEditId(null); setForm({ partner_name: "", branch_name: "", mpc_mp3: "MPC", region: "NORTH SUMATERA" }); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px", height: 36, borderRadius: 9, border: `1px solid ${t.greenBd}`, background: t.greenBg, color: t.green, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT }}>
          <Plus size={14} /> Tambah Branch
        </button>
        <button onClick={load} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${t.line}`, borderRadius: 9, background: "transparent", cursor: "pointer", color: t.mid }}>
          <RefreshCw size={14} />
        </button>
        <span style={{ fontSize: 12, color: t.lo }}>{partnerCount} partner · {filtered.length} branch</span>
      </div>

      {/* Add / Edit form */}
      {showAdd && (
        <div style={{ marginBottom: 18, padding: "18px 20px", borderRadius: 12, border: `1px solid ${editId ? t.amberBd : t.greenBd}`, background: editId ? t.amberBg : t.greenBg }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: editId ? t.amber : t.green, marginBottom: 14 }}>
            {editId ? "Edit Branch" : "Tambah Branch Baru"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, marginBottom: 5 }}>Nama Partner</label>
              <input value={form.partner_name} onChange={e => setForm(f => ({ ...f, partner_name: e.target.value }))} placeholder="cth: PT Indosat Ooredoo" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, marginBottom: 5 }}>Nama Branch</label>
              <input value={form.branch_name} onChange={e => setForm(f => ({ ...f, branch_name: e.target.value }))} placeholder="cth: Kantor Medan" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, marginBottom: 5 }}>Tipe (MPC/MP3)</label>
              <div style={{ position: "relative" }}>
                <select value={form.mpc_mp3} onChange={e => setForm(f => ({ ...f, mpc_mp3: e.target.value }))} style={selectStyle}>
                  <option value="MPC">MPC</option>
                  <option value="MP3">MP3</option>
                </select>
                <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, marginBottom: 5 }}>Region</label>
              <div style={{ position: "relative" }}>
                <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} style={selectStyle}>
                  {REGIONS_LIST.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleSave} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: "none", background: editId ? t.amber : t.green, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT }}>
              {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={13} />}
              {editId ? "Simpan Perubahan" : "Tambah"}
            </button>
            <button onClick={() => { setShowAdd(false); setEditId(null); setForm({ partner_name: "", branch_name: "", mpc_mp3: "MPC", region: "NORTH SUMATERA" }); }}
              style={{ padding: "9px 16px", borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, cursor: "pointer", fontSize: 13, fontFamily: FONT }}>
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 180, gap: 10, color: t.mid, fontFamily: FONT }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /><span style={{ fontSize: 13 }}>Memuat…</span>
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT }}>
            <thead>
              <tr style={{ background: t.sub, borderBottom: `1px solid ${t.line}` }}>
                {["Partner", "Branch", "Tipe", "Region", "Aksi"].map((h, i) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: i === 4 ? "center" : "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ padding: "48px 0", textAlign: "center", color: t.lo, fontSize: 13 }}>Tidak ada branch ditemukan</td></tr>
              )}
              {filtered.map((b, i) => (
                <tr key={b.id} style={{ borderBottom: `1px solid ${t.lineH}`, background: i % 2 === 0 ? "transparent" : t.hover }}>
                  <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: t.hi, maxWidth: 200 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.partner_name}</div>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 13, color: t.mid, maxWidth: 200 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.branch_name}</div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: t.violetBg, color: t.violet, border: `1px solid ${t.violetBd}` }}>
                      {b.mpc_mp3}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{
                      padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                      background: `${getRegionColor(b.region)}20`,
                      color: getRegionColor(b.region),
                    }}>
                      {b.region}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 7, justifyContent: "center" }}>
                      <button onClick={() => startEdit(b)} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${t.amberBd}`, background: t.amberBg, color: t.amber, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <Edit3 size={12} />
                      </button>
                      <button onClick={() => setConfirm(b)} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${t.redBd}`, background: t.redBg, color: t.red, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PNL_AdminPanel({ theme, profile }) {
  const d = theme === "dark";
  const t = tk(d);
  const [tab, setTab] = useState("permissions");

  if (profile?.role !== "spm_sumatera") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 14, fontFamily: FONT, color: t.mid }}>
        <XCircle size={36} style={{ color: t.red }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: t.hi }}>Akses Ditolak</div>
        <div style={{ fontSize: 13 }}>Halaman ini hanya dapat diakses oleh role SPM Sumatera.</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT, WebkitFontSmoothing: "antialiased", color: t.hi }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ height: 20, width: 3, borderRadius: 2, background: t.violet }} />
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: t.violet }}>Admin Panel</div>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.035em", color: t.hi, marginBottom: 5 }}>Panel Administrasi</h1>
        <p style={{ fontSize: 14, color: t.mid }}>Kelola role, permission, kode otoritas, dan partner branches seluruh Sumatera.</p>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 24,
        borderBottom: `1px solid ${t.line}`, paddingBottom: 0,
      }}>
        <Tab icon={Shield}    label="Role & Permission" active={tab === "permissions"} onClick={() => setTab("permissions")} t={t} />
        <Tab icon={Key}       label="Kode Otoritas"     active={tab === "codes"}       onClick={() => setTab("codes")}       t={t} />
        <Tab icon={Building2} label="Partner Branches"  active={tab === "branches"}    onClick={() => setTab("branches")}    t={t} />
      </div>

      {/* Content */}
      <div style={{ background: t.card, borderRadius: 12, border: `1px solid ${t.line}`, padding: "22px 24px", boxShadow: t.shadow }}>
        {tab === "permissions" && <RolePermissionsSection t={t} d={d} />}
        {tab === "codes"       && <AccessCodesSection t={t} d={d} />}
        {tab === "branches"    && <PartnerBranchesSection t={t} d={d} />}
      </div>
    </div>
  );
}