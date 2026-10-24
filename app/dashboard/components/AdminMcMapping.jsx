"use client";
/**
 * AdminMcMapping.jsx — "Mapping Admin MC"
 * Kelola daftar email Admin MC yang boleh login via OTP (tanpa password) dan
 * MC mana yang terpasang ke email itu. Dipakai oleh:
 *  - mf_dse_admin_mc_lookup (cek saat login)
 *  - mf_dse_admin_mc_login_apply (menerapkan role finance_mpx + partner_name
 *    ke profil setelah OTP berhasil)
 *
 * Satu email hanya bisa dipasang ke satu MC (unique index di database).
 * Hanya untuk role spm_sumatera (digate juga di page.jsx).
 */

import { useState, useEffect, useCallback } from "react";
import supabase from "../../../lib/supabase";
import {
  UserRoundCog, Plus, X, Check, AlertTriangle, Loader2, Search,
  RefreshCw, Trash2, Mail, ToggleLeft, ToggleRight,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const bg = type === "error" ? "#DC2626" : "#16A34A";
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, left: 24, zIndex: 9999, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: bg, color: "#fff", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", maxWidth: 480, marginLeft: "auto" }}>
      {type === "error" ? <AlertTriangle size={15} /> : <Check size={15} />}
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, display: "flex" }}><X size={14} /></button>
    </div>
  );
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
    shadowSm: d ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.07)",
  };

  const [rows, setRows] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "ok") => setToast({ msg, type });

  const [form, setForm] = useState({ email: "", mc: "", full_name: "" });
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setFetching(true);
    try {
      let q = supabase.from("mf_dse_admin_mc_mapping").select("*").order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      showToast(e.message || "Gagal memuat data.", "error");
    } finally {
      setFetching(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleAdd = async () => {
    const email = form.email.trim().toLowerCase();
    const mc = form.mc.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast("Masukkan email yang valid.", "error"); return; }
    if (!mc) { showToast("MC wajib diisi.", "error"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("mf_dse_admin_mc_mapping")
        .upsert({ email, mc, full_name: form.full_name.trim() || null, active: true }, { onConflict: "email" });
      if (error) throw error;
      showToast(`Admin MC ${email} → ${mc} tersimpan.`, "ok");
      setForm({ email: "", mc: "", full_name: "" });
      fetchRows();
    } catch (e) {
      showToast(e.message || "Gagal menyimpan.", "error");
    } finally {
      setSaving(false);
    }
  };

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
    if (!window.confirm(`Hapus mapping untuk ${row.email}?`)) return;
    try {
      const { error } = await supabase.from("mf_dse_admin_mc_mapping").delete().eq("id", row.id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showToast("Mapping dihapus.", "ok");
    } catch (e) {
      showToast(e.message || "Gagal menghapus.", "error");
    }
  };

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.email?.toLowerCase().includes(s) || r.mc?.toLowerCase().includes(s) || r.full_name?.toLowerCase().includes(s);
  });

  const inputStyle = { width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ fontFamily: FONT, color: t.hi }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <UserRoundCog size={20} color={t.teal} />
        <div style={{ fontSize: 19, fontWeight: 800 }}>Mapping Admin MC</div>
      </div>
      <div style={{ fontSize: 13, color: t.mid, marginBottom: 20 }}>
        Daftarkan email Admin MC di sini supaya mereka bisa login langsung dengan kode OTP ke email (tanpa kata sandi) di{" "}
        <b style={{ color: t.hi }}>Login sebagai Admin MC</b>. Setelah login, akses mereka otomatis terbatas ke MC yang dipasang di sini.
      </div>

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 14 }}>Tambah / Update Mapping</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 220px", minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", marginBottom: 6 }}>Email <span style={{ color: t.red }}>*</span></div>
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="adminmc@email.com" style={inputStyle} />
          </div>
          <div style={{ flex: "1 1 160px", minWidth: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", marginBottom: 6 }}>MC <span style={{ color: t.red }}>*</span></div>
            <input value={form.mc} onChange={(e) => setForm((f) => ({ ...f, mc: e.target.value }))} placeholder="MC-BATAM EAST" style={inputStyle} />
          </div>
          <div style={{ flex: "1 1 180px", minWidth: 160 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", marginBottom: 6 }}>Nama (opsional)</div>
            <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Nama Admin MC" style={inputStyle} />
          </div>
        </div>
        <button onClick={handleAdd} disabled={saving}
          style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: t.teal, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
          {saving ? "Menyimpan…" : "Simpan Mapping"}
        </button>
      </div>

      <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderBottom: `1px solid ${t.line}` }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari email / MC / nama…" style={{ ...inputStyle, paddingLeft: 34 }} />
          </div>
          <button onClick={fetchRows} title="Refresh" style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <RefreshCw size={14} className={fetching ? "spin" : ""} />
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: t.sub }}>
                {["EMAIL", "MC", "NAMA", "STATUS", ""].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: "9px 12px", color: t.mid, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fetching ? (
                <tr><td colSpan={5} style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={16} className="spin" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 28, textAlign: "center", color: t.mid }}>Belum ada mapping Admin MC.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${t.line}` }}>
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}><Mail size={12} color={t.lo} />{r.email}</td>
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontWeight: 700 }}>{r.mc}</td>
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: t.mid }}>{r.full_name || "-"}</td>
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                    <button onClick={() => toggleActive(r)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: r.active ? t.teal : t.lo, fontSize: 12, fontWeight: 700 }}>
                      {r.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      {r.active ? "Aktif" : "Nonaktif"}
                    </button>
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    <button onClick={() => handleDelete(r)} style={{ background: "none", border: "none", color: t.red, cursor: "pointer", display: "flex" }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
