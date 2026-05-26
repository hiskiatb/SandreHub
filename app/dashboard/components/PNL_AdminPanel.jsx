"use client";
/**
 * PNL_AdminPanel.jsx — v3
 * Fixes:
 *  - Tambah branch → auto-generate access code finance_mpx untuk partner tsb
 *  - Permission save diperbaiki: upsert dengan onConflict benar
 *  - Duplicate branch check SEBELUM insert (prevent unique constraint error)
 *  - Full responsive (mobile-first grid)
 *  - Access Codes sync realtime setelah tambah branch
 *  - Toast & error handling konsisten
 */

import React, {
  useState, useMemo, useEffect, useCallback, Fragment,
} from "react";
import { createPortal } from "react-dom";
import supabase from "../../../lib/supabase";
import {
  Shield, Key, Building2, Plus, Trash2, RotateCcw,
  Check, X, RefreshCw, Copy, ChevronDown, Search,
  CheckCircle2, XCircle, AlertCircle, Loader2,
  Edit3, Save, Zap,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL_ROLES = [
  { value: "spm_sumatera",         label: "SPM Sumatera",               color: "#C6168D" },
  { value: "finance_mpx",          label: "Finance MPX",                color: "#ED1C24" },
  { value: "internal_ioh",         label: "Internal IOH (Seluruh Sum.)", color: "#32BCAD" },
  { value: "ioh_north_sumatera",   label: "IOH North Sumatera",         color: "#3B82F6" },
  { value: "ioh_central_sumatera", label: "IOH Central Sumatera",       color: "#F59E0B" },
  { value: "ioh_south_sumatera",   label: "IOH South Sumatera",         color: "#10B981" },
];

const PERMISSION_COLS = [
  { key: "can_view_control_center",  label: "Control Center",    icon: "👁"  },
  { key: "can_view_pivot_summary",   label: "Pivot Summary",     icon: "📊" },
  { key: "can_view_payout_tracker",  label: "Payout Tracker",    icon: "💳" },
  { key: "can_view_pnl_forms",       label: "Lihat Form P&L",    icon: "📄" },
  { key: "can_edit_pnl_forms",       label: "Edit Form P&L",     icon: "✏️"  },
  { key: "can_disable_months",       label: "Nonaktifkan Bulan", icon: "🔒" },
  { key: "can_upload_payout",        label: "Upload Payout",     icon: "📤" },
];

const REGIONS_LIST = [
  "NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA",
  "ACEH", "RIAU", "KEPRI", "JAMBI", "BENGKULU", "LAMPUNG", "SUMBAR", "SUMSEL", "BABEL",
];

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace`;

// ─── Design tokens ────────────────────────────────────────────────────────────
const tk = (d) => ({
  bg:       d ? "#0F0F11" : "#F2F2F7",
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
  amber:    d ? "#FFCB05" : "#B58C00",
  amberBg:  d ? "rgba(255,203,5,0.12)" : "rgba(255,203,5,0.09)",
  amberBd:  d ? "rgba(255,203,5,0.28)" : "rgba(255,203,5,0.22)",
  red:      d ? "#FF6B6B" : "#DC2626",
  redBg:    d ? "rgba(255,107,107,0.12)" : "rgba(220,38,38,0.07)",
  redBd:    d ? "rgba(255,107,107,0.28)" : "rgba(220,38,38,0.20)",
  sky:      d ? "#38BDF8" : "#0369A1",
  skyBg:    d ? "rgba(56,189,248,0.12)" : "rgba(3,105,161,0.07)",
  skyBd:    d ? "rgba(56,189,248,0.28)" : "rgba(3,105,161,0.20)",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ─── Toast hook ───────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((type, msg) => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { type, msg, id }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }, []);
  return [toasts, show];
}

function ToastStack({ toasts, t, d }) {
  if (!toasts.length || typeof document === "undefined") return null;
  return createPortal(
    <div style={{
      position: "fixed", top: 68, right: 16, zIndex: 99999,
      display: "flex", flexDirection: "column", gap: 8, maxWidth: 340,
    }}>
      <style>{`@keyframes tIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {toasts.map(toast => {
        const ok = toast.type === "success";
        return (
          <div key={toast.id} style={{
            padding: "11px 15px", borderRadius: 12,
            background: t.card, border: `1px solid ${ok ? t.greenBd : t.redBd}`,
            boxShadow: d ? "0 12px 36px rgba(0,0,0,0.60)" : "0 8px 24px rgba(0,0,0,0.12)",
            display: "flex", alignItems: "center", gap: 10, fontFamily: FONT,
            animation: "tIn .2s ease",
          }}>
            {ok
              ? <CheckCircle2 size={15} style={{ color: t.green, flexShrink: 0 }} />
              : <AlertCircle  size={15} style={{ color: t.red,   flexShrink: 0 }} />}
            <span style={{ fontSize: 13, color: t.hi, fontWeight: 500 }}>{toast.msg}</span>
          </div>
        );
      })}
    </div>,
    document.body
  );
}

// ─── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({ open, title, body, confirmLabel = "Konfirmasi", danger, onConfirm, onCancel, t }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 99998,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: t.card, border: `1px solid ${t.line}`, borderRadius: 16,
        padding: "24px 24px 20px", maxWidth: 380, width: "100%",
        fontFamily: FONT, boxShadow: "0 20px 48px rgba(0,0,0,0.45)",
      }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: t.hi, marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: t.mid, lineHeight: 1.6, marginBottom: 22 }}>{body}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "9px 18px", borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT }}>
            Batal
          </button>
          <button onClick={onConfirm} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: danger ? t.red : t.violet, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ value, onChange, disabled, t }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      aria-checked={value}
      role="switch"
      style={{
        width: 38, height: 22, borderRadius: 99,
        background: value ? t.green : t.line,
        border: "none", cursor: disabled ? "not-allowed" : "pointer",
        position: "relative", transition: "background .18s", flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: value ? 19 : 3,
        width: 16, height: 16, borderRadius: "50%", background: "#FFFFFF",
        transition: "left .18s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }} />
    </button>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────
function Tab({ icon: Icon, label, active, onClick, t }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "9px 14px", borderRadius: "9px 9px 0 0",
      border: "none", cursor: "pointer",
      background: active ? t.card : "transparent",
      color: active ? t.violet : t.mid,
      fontWeight: active ? 700 : 500, fontSize: 13, fontFamily: FONT,
      borderBottom: active ? `2px solid ${t.violet}` : "2px solid transparent",
      transition: "all .14s", whiteSpace: "nowrap", flexShrink: 0,
    }}>
      <Icon size={14} style={{ flexShrink: 0 }} />
      <span>{label}</span>
    </button>
  );
}

// ─── Input / Select helpers ───────────────────────────────────────────────────
const makeInputStyle = (t) => ({
  width: "100%", background: t.inputBg, border: `1px solid ${t.inputBd}`,
  borderRadius: 9, padding: "9px 12px", fontSize: 13, fontWeight: 500,
  color: t.hi, outline: "none", fontFamily: FONT, boxSizing: "border-box",
  transition: "border-color .14s",
});
const makeSelectStyle = (t) => ({
  ...makeInputStyle(t),
  appearance: "none", WebkitAppearance: "none", cursor: "pointer",
  paddingRight: 32,
});

function SelectWrap({ children, t, style }) {
  return (
    <div style={{ position: "relative", ...style }}>
      {children}
      <ChevronDown size={12} style={{
        position: "absolute", right: 10, top: "50%",
        transform: "translateY(-50%)", color: t.lo, pointerEvents: "none",
      }} />
    </div>
  );
}

function FieldLabel({ children, t }) {
  return (
    <label style={{
      display: "block", fontSize: 10.5, fontWeight: 700,
      letterSpacing: "0.07em", textTransform: "uppercase",
      color: t.mid, marginBottom: 5,
    }}>
      {children}
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Role Permissions
// ═══════════════════════════════════════════════════════════════════════════════
function RolePermissionsSection({ t, d }) {
  const [perms,   setPerms]   = useState({});
  const [orig,    setOrig]    = useState({});
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [toasts,  showToast]  = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("role_permissions").select("*");
    if (error) {
      showToast("error", "Gagal memuat permission: " + error.message);
      setLoading(false);
      return;
    }

    const map = {};
    (data || []).forEach(r => { map[r.role] = { ...r }; });

    // Seed default entry for any role not yet in DB
    ALL_ROLES.forEach(r => {
      if (!map[r.value]) {
        map[r.value] = {
          role: r.value,
          can_view_control_center: r.value === "spm_sumatera",
          can_view_pivot_summary:  r.value === "spm_sumatera",
          can_view_payout_tracker: r.value === "spm_sumatera",
          can_view_pnl_forms:      r.value === "spm_sumatera",
          can_edit_pnl_forms:      r.value === "spm_sumatera",
          can_disable_months:      r.value === "spm_sumatera",
          can_upload_payout:       r.value === "spm_sumatera",
          region_filter: null,
          _isNew: true,
        };
      }
    });

    setPerms(JSON.parse(JSON.stringify(map)));
    setOrig(JSON.parse(JSON.stringify(map)));
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const dirty = JSON.stringify(perms) !== JSON.stringify(orig);

  const toggle = (role, key) => {
    if (role === "spm_sumatera") return;
    setPerms(prev => ({
      ...prev,
      [role]: { ...prev[role], [key]: !prev[role]?.[key] },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const rows = Object.values(perms)
        .filter(p => p.role !== "spm_sumatera")
        .map(p => ({
          role:                    p.role,
          can_view_control_center: !!p.can_view_control_center,
          can_view_pivot_summary:  !!p.can_view_pivot_summary,
          can_view_payout_tracker: !!p.can_view_payout_tracker,
          can_view_pnl_forms:      !!p.can_view_pnl_forms,
          can_edit_pnl_forms:      !!p.can_edit_pnl_forms,
          can_disable_months:      !!p.can_disable_months,
          can_upload_payout:       !!p.can_upload_payout,
          region_filter:           p.region_filter ?? null,
          updated_at:              new Date().toISOString(),
        }));

      const { error } = await supabase
        .from("role_permissions")
        .upsert(rows, { onConflict: "role" });

      if (error) throw error;
      showToast("success", "Permission berhasil disimpan");
      await load();
    } catch (e) {
      showToast("error", e.message || "Gagal menyimpan");
    }
    setSaving(false);
  };

  const reset = () => setPerms(JSON.parse(JSON.stringify(orig)));

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 240, gap: 10, color: t.mid, fontFamily: FONT }}>
      <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 13 }}>Memuat permission…</span>
    </div>
  );

  return (
    <div>
      <ToastStack toasts={toasts} t={t} d={d} />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.hi }}>Permission per Role</div>
          <div style={{ fontSize: 12, color: t.mid, marginTop: 3 }}>
            Toggle modul yang dapat diakses setiap role. SPM Sumatera selalu memiliki akses penuh.
          </div>
        </div>
        {dirty && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT }}>
              <RotateCcw size={13} /> Reset
            </button>
            <button onClick={save} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: "none", background: t.violet, color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT, opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={13} />}
              Simpan
            </button>
          </div>
        )}
      </div>

      {/* Responsive: table ≥700px, cards <700px */}
      <style>{`
        @media(max-width:700px){ .pt{display:none!important} .pc{display:flex!important} }
        @media(min-width:701px){ .pt{display:block!important} .pc{display:none!important} }
      `}</style>

      {/* Desktop table */}
      <div className="pt" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640, fontFamily: FONT }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${t.line}`, background: t.sub }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, minWidth: 180 }}>
                Role
              </th>
              {PERMISSION_COLS.map(col => (
                <th key={col.key} style={{ padding: "10px 8px", textAlign: "center", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: t.mid, minWidth: 80 }}>
                  <div style={{ fontSize: 15 }}>{col.icon}</div>
                  <div style={{ marginTop: 2 }}>{col.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_ROLES.map((role, ri) => {
              const p = perms[role.value] || {};
              const isSPM = role.value === "spm_sumatera";
              return (
                <tr key={role.value} style={{ borderBottom: `1px solid ${t.lineH}`, background: ri % 2 === 0 ? "transparent" : t.hover }}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: role.color, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>{role.label}</div>
                        {isSPM && <div style={{ fontSize: 10, color: t.violet, fontWeight: 600, marginTop: 1 }}>PENUH · tidak dapat diubah</div>}
                      </div>
                    </div>
                  </td>
                  {PERMISSION_COLS.map(col => (
                    <td key={col.key} style={{ padding: "12px 8px", textAlign: "center" }}>
                      {isSPM
                        ? <CheckCircle2 size={16} style={{ color: t.green }} />
                        : <Toggle value={!!p[col.key]} onChange={() => toggle(role.value, col.key)} t={t} />}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="pc" style={{ display: "none", flexDirection: "column", gap: 12 }}>
        {ALL_ROLES.map(role => {
          const p = perms[role.value] || {};
          const isSPM = role.value === "spm_sumatera";
          return (
            <div key={role.value} style={{ borderRadius: 10, border: `1px solid ${t.line}`, overflow: "hidden" }}>
              <div style={{ padding: "12px 14px", background: t.sub, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: role.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: t.hi, flex: 1 }}>{role.label}</span>
                {isSPM && <span style={{ fontSize: 10, color: t.violet, fontWeight: 700 }}>PENUH</span>}
              </div>
              <div>
                {PERMISSION_COLS.map((col, ci) => (
                  <div key={col.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: ci < PERMISSION_COLS.length - 1 ? `1px solid ${t.lineH}` : "none" }}>
                    <span style={{ fontSize: 13, color: t.mid }}>{col.icon} {col.label}</span>
                    {isSPM
                      ? <CheckCircle2 size={16} style={{ color: t.green }} />
                      : <Toggle value={!!p[col.key]} onChange={() => toggle(role.value, col.key)} t={t} />}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Access Codes
// ═══════════════════════════════════════════════════════════════════════════════
function AccessCodesSection({ t, d, refreshTrigger }) {
  const [codes,        setCodes]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [partnersList, setPartnersList] = useState([]);
  const [search,       setSearch]       = useState("");
  const [filterRole,   setFilterRole]   = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [showAdd,      setShowAdd]      = useState(false);
  const [form,         setForm]         = useState({ code: generateCode(), type: "finance_mpx", partner_name: "", is_active: true });
  const [saving,       setSaving]       = useState(false);
  const [confirm,      setConfirm]      = useState(null);
  const [copied,       setCopied]       = useState(null);
  const [toasts,       showToast]       = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [codesRes, partRes] = await Promise.all([
      supabase.from("access_codes").select("*").order("type").order("partner_name"),
      supabase.from("partner_branches").select("partner_name"),
    ]);
    if (codesRes.data) setCodes(codesRes.data);
    if (partRes.data)  setPartnersList([...new Set(partRes.data.map(x => x.partner_name))].sort());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  const filtered = useMemo(() => codes.filter(c => {
    if (filterRole   !== "ALL" && c.type !== filterRole)              return false;
    if (filterStatus !== "ALL" && String(c.is_active) !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.code?.toLowerCase().includes(q) && !(c.partner_name || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [codes, filterRole, filterStatus, search]);

  const handleAdd = async () => {
    if (!form.code.trim()) { showToast("error", "Kode tidak boleh kosong"); return; }
    if (!form.type)        { showToast("error", "Role wajib dipilih"); return; }
    if (form.type === "finance_mpx" && !form.partner_name) {
      showToast("error", "Partner wajib dipilih untuk Finance MPX"); return;
    }

    // Check duplicate code
    const { data: clash } = await supabase
      .from("access_codes")
      .select("id")
      .eq("code", form.code.toUpperCase().trim())
      .maybeSingle();
    if (clash) { showToast("error", `Kode "${form.code}" sudah digunakan`); return; }

    setSaving(true);
    const { error } = await supabase.from("access_codes").insert({
      code:         form.code.toUpperCase().trim(),
      type:         form.type,
      partner_name: form.partner_name || null,
      is_active:    form.is_active,
    });
    setSaving(false);
    if (error) { showToast("error", error.message); return; }
    showToast("success", `Kode ${form.code} berhasil ditambahkan`);
    setForm({ code: generateCode(), type: "finance_mpx", partner_name: "", is_active: true });
    setShowAdd(false);
    load();
  };

  const toggleActive = async (id, current) => {
    const { error } = await supabase.from("access_codes").update({ is_active: !current }).eq("id", id);
    if (error) { showToast("error", error.message); return; }
    setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: !current } : c));
  };

  const deleteCode = async (id) => {
    const { error } = await supabase.from("access_codes").delete().eq("id", id);
    if (error) { showToast("error", error.message); return; }
    showToast("success", "Kode dihapus");
    setConfirm(null);
    setCodes(prev => prev.filter(c => c.id !== id));
  };

  const copy = (code) => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  const inp = makeInputStyle(t);
  const sel = makeSelectStyle(t);

  return (
    <div>
      <ToastStack toasts={toasts} t={t} d={d} />
      <ConfirmModal
        open={!!confirm}
        title="Hapus Kode Otoritas"
        body={`Kode "${confirm?.code}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        danger
        onConfirm={() => deleteCode(confirm.id)}
        onCancel={() => setConfirm(null)}
        t={t}
      />

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "1 1 160px", minWidth: 140, border: `1px solid ${t.inputBd}`, borderRadius: 9, background: t.inputBg, height: 36, padding: "0 12px" }}>
          <Search size={13} style={{ color: t.mid, flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari kode / partner…"
            style={{ flex: 1, background: "transparent", border: "none", fontSize: 13, color: t.hi, outline: "none", fontFamily: FONT }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: t.lo, padding: 0, display: "flex" }}>
              <X size={12} />
            </button>
          )}
        </div>

        <SelectWrap t={t} style={{ minWidth: 160 }}>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ ...sel, height: 36, padding: "0 32px 0 12px" }}>
            <option value="ALL">Semua Role</option>
            {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </SelectWrap>

        <SelectWrap t={t} style={{ minWidth: 130 }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...sel, height: 36, padding: "0 32px 0 12px" }}>
            <option value="ALL">Semua Status</option>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </SelectWrap>

        <button
          onClick={() => { setShowAdd(s => !s); setForm({ code: generateCode(), type: "finance_mpx", partner_name: "", is_active: true }); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", height: 36, borderRadius: 9, border: `1px solid ${t.violetBd}`, background: t.violetBg, color: t.violet, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT, whiteSpace: "nowrap" }}
        >
          <Plus size={14} /> Tambah
        </button>
        <button onClick={load} title="Refresh" style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${t.line}`, borderRadius: 9, background: "transparent", cursor: "pointer", color: t.mid, flexShrink: 0 }}>
          <RefreshCw size={13} />
        </button>
        <span style={{ fontSize: 12, color: t.lo, whiteSpace: "nowrap" }}>{filtered.length} / {codes.length}</span>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ marginBottom: 18, padding: "18px 20px", borderRadius: 12, border: `1px solid ${t.violetBd}`, background: t.violetBg }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.violet, marginBottom: 14 }}>Tambah Kode Baru</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 14 }}>
            <div>
              <FieldLabel t={t}>Kode</FieldLabel>
              <div style={{ display: "flex", gap: 7 }}>
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, "") }))}
                  style={{ ...inp, flex: 1, fontFamily: MONO, letterSpacing: "0.08em" }}
                />
                <button onClick={() => setForm(f => ({ ...f, code: generateCode() }))} title="Generate ulang" style={{ padding: "9px 10px", borderRadius: 9, border: `1px solid ${t.violetBd}`, background: t.card, color: t.violet, cursor: "pointer", flexShrink: 0 }}>
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>
            <div>
              <FieldLabel t={t}>Role</FieldLabel>
              <SelectWrap t={t}>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value, partner_name: "" }))} style={sel}>
                  {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </SelectWrap>
            </div>
            {form.type === "finance_mpx" && (
              <div>
                <FieldLabel t={t}>Partner</FieldLabel>
                <SelectWrap t={t}>
                  <select value={form.partner_name} onChange={e => setForm(f => ({ ...f, partner_name: e.target.value }))} style={sel}>
                    <option value="">— Pilih Partner —</option>
                    {partnersList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </SelectWrap>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 13, color: t.mid, fontFamily: FONT }}>
                <Toggle value={form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} t={t} />
                Aktif saat dibuat
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleAdd} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: "none", background: t.violet, color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT, opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />} Tambah
            </button>
            <button onClick={() => setShowAdd(false)} style={{ padding: "9px 16px", borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, cursor: "pointer", fontSize: 13, fontFamily: FONT }}>Batal</button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 160, gap: 10, color: t.mid, fontFamily: FONT }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /><span style={{ fontSize: 13 }}>Memuat…</span>
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, minWidth: 500 }}>
              <thead>
                <tr style={{ background: t.sub, borderBottom: `1px solid ${t.line}` }}>
                  {["Kode", "Role", "Partner", "Status", "Aksi"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: i === 4 ? "center" : "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, whiteSpace: "nowrap" }}>{h}</th>
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
                          <code style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 700, letterSpacing: "0.08em", color: t.hi, background: t.sub, padding: "3px 8px", borderRadius: 5, opacity: c.is_active ? 1 : 0.45 }}>
                            {c.code}
                          </code>
                          <button onClick={() => copy(c.code)} style={{ background: "none", border: "none", cursor: "pointer", color: copied === c.code ? t.green : t.lo, padding: 0, display: "flex" }}>
                            {copied === c.code ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: roleInfo ? `${roleInfo.color}22` : t.sub, color: roleInfo?.color || t.mid }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: roleInfo?.color || t.lo }} />
                          {roleInfo?.label || c.type}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 13, color: c.partner_name ? t.hi : t.lo, fontStyle: c.partner_name ? "normal" : "italic", maxWidth: 180 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.partner_name || "—"}</div>
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
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Partner Branches
// ═══════════════════════════════════════════════════════════════════════════════
function PartnerBranchesSection({ t, d, onBranchAdded }) {
  const [branches,     setBranches]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [filterRegion, setFilterRegion] = useState("ALL");
  const [filterType,   setFilterType]   = useState("ALL");
  const [showAdd,      setShowAdd]      = useState(false);
  const [editId,       setEditId]       = useState(null);
  const [form,         setForm]         = useState({ partner_name: "", branch_name: "", mpc_mp3: "MPC", region: "NORTH SUMATERA" });
  const [saving,       setSaving]       = useState(false);
  const [confirm,      setConfirm]      = useState(null);
  const [toasts,       showToast]       = useToast();
  const [newCodes,     setNewCodes]     = useState([]); // [{partner_name, code, isNew}]

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("partner_branches")
      .select("*")
      .order("partner_name")
      .order("branch_name");
    if (error) showToast("error", "Gagal memuat: " + error.message);
    if (data)  setBranches(data);
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => branches.filter(b => {
    if (filterRegion !== "ALL" && b.region  !== filterRegion) return false;
    if (filterType   !== "ALL" && b.mpc_mp3 !== filterType)   return false;
    if (search) {
      const q = search.toLowerCase();
      if (!b.partner_name.toLowerCase().includes(q) && !b.branch_name.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [branches, search, filterRegion, filterType]);

  const partnerCount = useMemo(() => new Set(filtered.map(b => b.partner_name)).size, [filtered]);

  // ── Auto-generate access code for partner if none exists ──────────────────
  const ensurePartnerAccessCode = async (partnerName) => {
    const { data: existing } = await supabase
      .from("access_codes")
      .select("code")
      .eq("type", "finance_mpx")
      .eq("partner_name", partnerName)
      .limit(1);

    if (existing && existing.length > 0) {
      return { code: existing[0].code, isNew: false };
    }

    // Generate unique code with clash protection
    let code, attempts = 0;
    do {
      code = generateCode();
      const { data: clash } = await supabase.from("access_codes").select("id").eq("code", code).limit(1);
      if (!clash || clash.length === 0) break;
      attempts++;
    } while (attempts < 10);

    const { error } = await supabase.from("access_codes").insert({
      code,
      type: "finance_mpx",
      partner_name: partnerName,
      is_active: true,
    });
    if (error) throw new Error("Gagal buat kode otomatis: " + error.message);
    return { code, isNew: true };
  };

  // ── Check duplicate branch before insert ─────────────────────────────────
  const checkDuplicateBranch = async (partnerName, branchName) => {
    const { data } = await supabase
      .from("partner_branches")
      .select("id")
      .eq("partner_name", partnerName.trim())
      .eq("branch_name", branchName.trim())
      .maybeSingle();
    return !!data;
  };

  const handleSave = async () => {
    if (!form.partner_name.trim()) { showToast("error", "Nama partner wajib diisi"); return; }
    if (!form.branch_name.trim())  { showToast("error", "Nama branch wajib diisi");  return; }

    setSaving(true);
    try {
      if (editId) {
        // ── EDIT mode ────────────────────────────────────────────────────────
        // If partner_name or branch_name changed, check for duplicate
        const originalBranch = branches.find(b => b.id === editId);
        const partnerChanged = originalBranch?.partner_name !== form.partner_name.trim();
        const branchChanged  = originalBranch?.branch_name  !== form.branch_name.trim();

        if (partnerChanged || branchChanged) {
          const isDuplicate = await checkDuplicateBranch(form.partner_name, form.branch_name);
          if (isDuplicate) {
            showToast("error", `Branch "${form.branch_name.trim()}" sudah terdaftar untuk partner "${form.partner_name.trim()}"`);
            setSaving(false);
            return;
          }
        }

        const { error } = await supabase.from("partner_branches").update({
          partner_name: form.partner_name.trim(),
          branch_name:  form.branch_name.trim(),
          mpc_mp3:      form.mpc_mp3,
          region:       form.region,
        }).eq("id", editId);
        if (error) throw error;
        showToast("success", "Branch berhasil diperbarui");

      } else {
        // ── ADD mode — check duplicate first ─────────────────────────────────
        const isDuplicate = await checkDuplicateBranch(form.partner_name, form.branch_name);
        if (isDuplicate) {
          showToast("error", `Branch "${form.branch_name.trim()}" sudah terdaftar untuk partner "${form.partner_name.trim()}"`);
          setSaving(false);
          return;
        }

        // Insert branch
        const { error: branchErr } = await supabase.from("partner_branches").insert({
          partner_name: form.partner_name.trim(),
          branch_name:  form.branch_name.trim(),
          mpc_mp3:      form.mpc_mp3,
          region:       form.region,
        });
        if (branchErr) throw branchErr;

        // Auto-generate / retrieve access code
        const { code, isNew } = await ensurePartnerAccessCode(form.partner_name.trim());
        setNewCodes(prev => [...prev, { partner_name: form.partner_name.trim(), code, isNew }]);

        if (isNew) {
          showToast("success", `Branch ditambahkan · Kode otoritas baru: ${code}`);
        } else {
          showToast("success", `Branch ditambahkan · Kode partner sudah ada: ${code}`);
        }

        onBranchAdded?.(); // trigger Access Codes tab refresh
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
    setBranches(prev => prev.filter(b => b.id !== id));
  };

  const REGION_COLORS = { "NORTH SUMATERA": "#3B82F6", "CENTRAL SUMATERA": "#F59E0B", "SOUTH SUMATERA": "#10B981" };
  const regionColor = (r) => REGION_COLORS[r] || "#8A8A96";

  const inp = makeInputStyle(t);
  const sel = makeSelectStyle(t);

  return (
    <div>
      <ToastStack toasts={toasts} t={t} d={d} />
      <ConfirmModal
        open={!!confirm}
        title="Hapus Branch"
        body={`Branch "${confirm?.branch_name}" dari partner "${confirm?.partner_name}" akan dihapus permanen.`}
        confirmLabel="Hapus"
        danger
        onConfirm={() => handleDelete(confirm.id)}
        onCancel={() => setConfirm(null)}
        t={t}
      />

      {/* New access codes banner */}
      {newCodes.length > 0 && (
        <div style={{ marginBottom: 16, padding: "14px 16px", borderRadius: 12, border: `1px solid ${t.skyBd}`, background: t.skyBg }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <Zap size={14} style={{ color: t.sky }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: t.sky }}>Kode Otoritas Partner</span>
            <button onClick={() => setNewCodes([])} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: t.lo, display: "flex" }}>
              <X size={13} />
            </button>
          </div>
          {newCodes.map((nc, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: t.card, border: `1px solid ${t.skyBd}`, marginBottom: i < newCodes.length - 1 ? 6 : 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: t.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nc.partner_name}</div>
                {nc.isNew && <div style={{ fontSize: 10, color: t.sky, fontWeight: 600 }}>BARU digenerate</div>}
                {!nc.isNew && <div style={{ fontSize: 10, color: t.lo }}>Kode sudah ada sebelumnya</div>}
              </div>
              <code style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, letterSpacing: "0.1em", color: t.sky, background: t.skyBg, padding: "4px 10px", borderRadius: 6, flexShrink: 0 }}>
                {nc.code}
              </code>
              <button onClick={() => navigator.clipboard?.writeText(nc.code)} style={{ border: "none", background: "none", cursor: "pointer", color: t.lo, display: "flex", flexShrink: 0 }}>
                <Copy size={13} />
              </button>
            </div>
          ))}
          <div style={{ fontSize: 11, color: t.mid, marginTop: 8 }}>
            Berikan kode ini ke partner Finance MPX yang bersangkutan.
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flex: "1 1 160px", minWidth: 140, border: `1px solid ${t.inputBd}`, borderRadius: 9, background: t.inputBg, height: 36, padding: "0 12px" }}>
          <Search size={13} style={{ color: t.mid, flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari partner / branch…" style={{ flex: 1, background: "transparent", border: "none", fontSize: 13, color: t.hi, outline: "none", fontFamily: FONT }} />
          {search && <button onClick={() => setSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: t.lo, padding: 0, display: "flex" }}><X size={12} /></button>}
        </div>

        <SelectWrap t={t} style={{ minWidth: 170 }}>
          <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ ...sel, height: 36, padding: "0 32px 0 12px" }}>
            <option value="ALL">Semua Region</option>
            {[...new Set(branches.map(b => b.region))].sort().map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </SelectWrap>

        <SelectWrap t={t} style={{ minWidth: 120 }}>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...sel, height: 36, padding: "0 32px 0 12px" }}>
            <option value="ALL">Semua Tipe</option>
            <option value="MPC">MPC</option>
            <option value="MP3">MP3</option>
          </select>
        </SelectWrap>

        <button
          onClick={() => { setShowAdd(s => !s); setEditId(null); setForm({ partner_name: "", branch_name: "", mpc_mp3: "MPC", region: "NORTH SUMATERA" }); }}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", height: 36, borderRadius: 9, border: `1px solid ${t.greenBd}`, background: t.greenBg, color: t.green, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT, whiteSpace: "nowrap" }}
        >
          <Plus size={14} /> Tambah Branch
        </button>
        <button onClick={load} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${t.line}`, borderRadius: 9, background: "transparent", cursor: "pointer", color: t.mid, flexShrink: 0 }}>
          <RefreshCw size={13} />
        </button>
        <span style={{ fontSize: 12, color: t.lo, whiteSpace: "nowrap" }}>{partnerCount} partner · {filtered.length} branch</span>
      </div>

      {/* Add / Edit form */}
      {showAdd && (
        <div style={{ marginBottom: 18, padding: "18px 20px", borderRadius: 12, border: `1px solid ${editId ? t.amberBd : t.greenBd}`, background: editId ? t.amberBg : t.greenBg }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: editId ? t.amber : t.green, marginBottom: 4 }}>
            {editId ? "Edit Branch" : "Tambah Branch Baru"}
          </div>
          {!editId && (
            <div style={{ fontSize: 12, color: t.mid, marginBottom: 14, display: "flex", alignItems: "center", gap: 5 }}>
              <Zap size={12} style={{ color: t.sky }} />
              Kode otoritas Finance MPX akan digenerate otomatis jika partner belum memiliki kode.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 14 }}>
            <div>
              <FieldLabel t={t}>Nama Partner</FieldLabel>
              <input
                value={form.partner_name}
                onChange={e => setForm(f => ({ ...f, partner_name: e.target.value }))}
                placeholder="cth: PT Indosat Ooredoo"
                style={inp}
                list="partner-datalist"
              />
              <datalist id="partner-datalist">
                {[...new Set(branches.map(b => b.partner_name))].sort().map(p => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div>
              <FieldLabel t={t}>Nama Branch</FieldLabel>
              <input
                value={form.branch_name}
                onChange={e => setForm(f => ({ ...f, branch_name: e.target.value }))}
                placeholder="cth: Kantor Medan"
                style={inp}
              />
            </div>
            <div>
              <FieldLabel t={t}>Tipe (MPC / MP3)</FieldLabel>
              <SelectWrap t={t}>
                <select value={form.mpc_mp3} onChange={e => setForm(f => ({ ...f, mpc_mp3: e.target.value }))} style={sel}>
                  <option value="MPC">MPC</option>
                  <option value="MP3">MP3</option>
                </select>
              </SelectWrap>
            </div>
            <div>
              <FieldLabel t={t}>Region</FieldLabel>
              <SelectWrap t={t}>
                <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} style={sel}>
                  {REGIONS_LIST.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </SelectWrap>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9, border: "none", background: editId ? t.amber : t.green, color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={13} />}
              {editId ? "Simpan Perubahan" : "Tambah"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setEditId(null); setForm({ partner_name: "", branch_name: "", mpc_mp3: "MPC", region: "NORTH SUMATERA" }); }}
              style={{ padding: "9px 16px", borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, cursor: "pointer", fontSize: 13, fontFamily: FONT }}
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 160, gap: 10, color: t.mid, fontFamily: FONT }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /><span style={{ fontSize: 13 }}>Memuat…</span>
        </div>
      ) : (
        <div style={{ borderRadius: 12, border: `1px solid ${t.line}`, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, minWidth: 480 }}>
              <thead>
                <tr style={{ background: t.sub, borderBottom: `1px solid ${t.line}` }}>
                  {["Partner", "Branch", "Tipe", "Region", "Aksi"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: i === 4 ? "center" : "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: t.mid, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "48px 0", textAlign: "center", color: t.lo, fontSize: 13 }}>Tidak ada branch ditemukan</td></tr>
                )}
                {filtered.map((b, i) => (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${t.lineH}`, background: i % 2 === 0 ? "transparent" : t.hover }}>
                    <td style={{ padding: "11px 14px", maxWidth: 180 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.partner_name}</div>
                    </td>
                    <td style={{ padding: "11px 14px", maxWidth: 180 }}>
                      <div style={{ fontSize: 13, color: t.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.branch_name}</div>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: t.violetBg, color: t.violet, border: `1px solid ${t.violetBd}` }}>
                        {b.mpc_mp3}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: `${regionColor(b.region)}22`, color: regionColor(b.region) }}>
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
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
export default function PNL_AdminPanel({ theme, profile }) {
  const d = theme === "dark";
  const t = tk(d);
  const [tab, setTab] = useState("permissions");
  const [codeRefresh, setCodeRefresh] = useState(0);

  if (profile?.role !== "spm_sumatera") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 14, fontFamily: FONT, color: t.mid }}>
        <XCircle size={36} style={{ color: t.red }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: t.hi }}>Akses Ditolak</div>
        <div style={{ fontSize: 13 }}>Halaman ini hanya untuk role SPM Sumatera.</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT, WebkitFontSmoothing: "antialiased", color: t.hi }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        *, *::before, *::after { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <div style={{ height: 20, width: 3, borderRadius: 2, background: t.violet }} />
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: t.violet }}>
            Admin Panel
          </div>
        </div>
        <h1 style={{ fontSize: "clamp(20px,4vw,26px)", fontWeight: 800, letterSpacing: "-0.035em", color: t.hi, margin: "0 0 5px" }}>
          Panel Administrasi
        </h1>
        <p style={{ fontSize: 13.5, color: t.mid, margin: 0 }}>
          Kelola role, permission, kode otoritas, dan partner branches seluruh Sumatera.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${t.line}`, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <Tab icon={Shield}    label="Role & Permission" active={tab === "permissions"} onClick={() => setTab("permissions")} t={t} />
        <Tab icon={Key}       label="Kode Otoritas"     active={tab === "codes"}       onClick={() => setTab("codes")}       t={t} />
        <Tab icon={Building2} label="Partner Branches"  active={tab === "branches"}    onClick={() => setTab("branches")}    t={t} />
      </div>

      {/* Content */}
      <div style={{ background: t.card, borderRadius: "0 0 14px 14px", border: `1px solid ${t.line}`, borderTop: "none", padding: "clamp(14px,3vw,24px)", boxShadow: t.shadow }}>
        {tab === "permissions" && <RolePermissionsSection t={t} d={d} />}
        {tab === "codes"       && <AccessCodesSection     t={t} d={d} refreshTrigger={codeRefresh} />}
        {tab === "branches"    && <PartnerBranchesSection t={t} d={d} onBranchAdded={() => setCodeRefresh(c => c + 1)} />}
      </div>

      {/* RLS guidance */}
      <details style={{ marginTop: 18, fontSize: 12, color: t.lo, fontFamily: FONT }}>
        <summary style={{ cursor: "pointer", color: t.mid, fontWeight: 600, userSelect: "none" }}>
          Catatan Database &amp; RLS
        </summary>
        <div style={{ marginTop: 8, padding: "14px 16px", borderRadius: 8, background: t.sub, border: `1px solid ${t.line}`, lineHeight: 1.8 }}>
          <p style={{ margin: "0 0 8px", fontWeight: 700, color: t.hi }}>Jalankan di Supabase SQL Editor agar permission &amp; branch bisa tersimpan:</p>
          <pre style={{ fontFamily: MONO, fontSize: 11, color: t.mid, overflowX: "auto", margin: 0, whiteSpace: "pre-wrap" }}>{
`-- 1. Izinkan spm_sumatera upsert role_permissions
CREATE POLICY "spm_upsert_role_perms"
ON public.role_permissions FOR ALL
USING  ((auth.jwt() ->> 'user_role') = 'spm_sumatera')
WITH CHECK ((auth.jwt() ->> 'user_role') = 'spm_sumatera');

-- 2. Izinkan spm_sumatera kelola access_codes
CREATE POLICY "spm_manage_access_codes"
ON public.access_codes FOR ALL
USING  ((auth.jwt() ->> 'user_role') = 'spm_sumatera')
WITH CHECK ((auth.jwt() ->> 'user_role') = 'spm_sumatera');

-- 3. Izinkan spm_sumatera kelola partner_branches
CREATE POLICY "spm_manage_branches"
ON public.partner_branches FOR ALL
USING  ((auth.jwt() ->> 'user_role') = 'spm_sumatera')
WITH CHECK ((auth.jwt() ->> 'user_role') = 'spm_sumatera');`
          }</pre>
          <p style={{ margin: "10px 0 0", color: t.lo }}>
            Ganti <code style={{ fontFamily: MONO }}>{'auth.jwt() ->> \'user_role\''}</code> sesuai dengan nama claim JWT yang dipakai di project ini.
          </p>
        </div>
      </details>
    </div>
  );
}