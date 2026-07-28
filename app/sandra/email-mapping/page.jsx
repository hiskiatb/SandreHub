"use client";
/**
 * /sandra/email-mapping — admin "Update Mapping Email".
 * Mengelola sdp_login_map: email → role/brand/branch/cluster/region, untuk
 * login email-first SandraHub (fitur SDP dst). Tambah/edit/hapus + import/export
 * Excel. Hanya untuk admin (spm_sumatera / finance_mpx / internal_ioh).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import supabase from "../../../lib/supabase";
import { HubLogo } from "../../../components/HubLogo";
import {
  Loader2, ArrowLeft, Sun, Moon, Plus, Search, Upload, Download, FileSpreadsheet,
  Trash2, Pencil, Check, X, AlertTriangle, ShieldCheck, Mail,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const TEAL = "#32BCAD", RED = "#ED1C24", MAGA = "#C6168D";
const ADMIN_ROLES = ["spm_sumatera", "finance_mpx", "internal_ioh"];
const ROLES = [
  { v: "cse_rse", label: "CSE / RSE" }, { v: "bsm", label: "BSM" },
  { v: "pic_region", label: "PIC Region" }, { v: "spm_sumatera", label: "SPM Sumatera" },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.v, r.label]));
const EMPTY = { email: "", role: "cse_rse", brand: "", branch: "", cluster: "", region: "", full_name: "", active: true };

const mk = (d) => ({
  bg: d ? "#0A0A0B" : "#F4F4F6", card: d ? "#141417" : "#FFFFFF", card2: d ? "#1A1A1E" : "#F8F8FA",
  line: d ? "#22222A" : "#E4E2EA", hi: d ? "#F0F0F2" : "#111116", mid: d ? "#7A7A88" : "#5A5A68",
  lo: d ? "#4A4A58" : "#C8C5D0", sub: d ? "#1A1A1E" : "#F2F2F4", field: d ? "rgba(255,255,255,0.05)" : "#F8F8FB",
  tealBg: d ? "rgba(50,188,173,0.10)" : "rgba(50,188,173,0.07)", tealBd: d ? "rgba(50,188,173,0.28)" : "rgba(50,188,173,0.20)",
  redBd: d ? "rgba(248,113,113,0.3)" : "rgba(220,38,38,0.25)", red: d ? "#F87171" : "#DC2626",
});

function Toast({ msg, type, onClose }) {
  useEffect(() => { const x = setTimeout(onClose, 3800); return () => clearTimeout(x); }, [onClose]);
  const bg = type === "error" ? "#DC2626" : type === "warn" ? "#D97706" : "#16A34A";
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, background: bg, color: "#fff", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", maxWidth: 400 }}>
      {type === "error" ? <AlertTriangle size={15} /> : <Check size={15} />}<span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0 }}><X size={14} /></button>
    </div>
  );
}

export default function EmailMappingPage() {
  const router = useRouter();
  const [d, setD] = useState(true);
  const [gate, setGate] = useState("checking"); // checking | ok | denied
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // null | EMPTY-like (with id when edit)
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);
  const t = mk(d);
  const say = (msg, type = "ok") => setToast({ msg, type });

  useEffect(() => {
    setD(localStorage.getItem("hub-theme") !== "light");
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/sandra/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      if (!prof || !ADMIN_ROLES.includes(prof.role)) { setGate("denied"); return; }
      setGate("ok");
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("sdp_login_map").select("*").order("email").limit(5000);
    if (error) say("Gagal memuat: " + error.message, "error");
    setRows(data || []); setLoading(false);
  }, []);
  useEffect(() => { if (gate === "ok") load(); }, [gate, load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => `${r.email} ${r.role} ${r.brand} ${r.branch} ${r.cluster} ${r.region} ${r.full_name}`.toLowerCase().includes(s));
  }, [rows, q]);

  const emailMap = useMemo(() => { const m = new Map(); rows.forEach((r) => m.set(String(r.email).toLowerCase(), r)); return m; }, [rows]);

  const save = async () => {
    const e = editing;
    const email = (e.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say("Email tidak valid.", "error"); return; }
    if (!e.role) { say("Role wajib dipilih.", "error"); return; }
    const dup = emailMap.get(email);
    if (dup && dup.id !== e.id) { say("Email sudah ada di mapping.", "error"); return; }
    setSaving(true);
    const row = { email, role: e.role, brand: e.brand || null, branch: e.branch || null, cluster: e.cluster || null, region: e.region || null, full_name: e.full_name || null, active: e.active !== false, updated_at: new Date().toISOString() };
    let err;
    if (e.id) ({ error: err } = await supabase.from("sdp_login_map").update(row).eq("id", e.id));
    else ({ error: err } = await supabase.from("sdp_login_map").insert(row));
    setSaving(false);
    if (err) { say("Gagal menyimpan: " + err.message, "error"); return; }
    say(e.id ? "Mapping diperbarui." : "Email ditambahkan."); setEditing(null); load();
  };
  const del = async (r) => {
    if (!window.confirm(`Hapus mapping ${r.email}?`)) return;
    const { error } = await supabase.from("sdp_login_map").delete().eq("id", r.id);
    if (error) say("Gagal hapus: " + error.message, "error"); else { say("Mapping dihapus."); load(); }
  };
  const toggleActive = async (r) => {
    const { error } = await supabase.from("sdp_login_map").update({ active: !r.active, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) say("Gagal: " + error.message, "error"); else load();
  };

  // ── Import Excel ────────────────────────────────────────────────────────────
  const onImport = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const norm = (k) => String(k || "").trim().toLowerCase();
      const parsed = raw.map((r) => {
        const o = {}; Object.keys(r).forEach((k) => { o[norm(k)] = r[k]; });
        return {
          email: String(o.email || "").trim().toLowerCase(),
          role: String(o.role || "").trim(),
          brand: String(o.brand || "").trim() || null,
          branch: String(o.branch || "").trim() || null,
          cluster: String(o.cluster || "").trim() || null,
          region: String(o.region || "").trim() || null,
          full_name: String(o.full_name || o.nama || o.name || "").trim() || null,
        };
      }).filter((r) => r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
      const validRoles = new Set(ROLES.map((x) => x.v));
      const bad = parsed.filter((r) => !validRoles.has(r.role));
      const good = parsed.filter((r) => validRoles.has(r.role));
      if (good.length === 0) { say("Tidak ada baris valid (cek kolom email & role).", "error"); return; }

      const inserts = [], updates = [];
      good.forEach((r) => { const ex = emailMap.get(r.email); if (ex) updates.push({ id: ex.id, ...r, updated_at: new Date().toISOString() }); else inserts.push({ ...r, active: true }); });
      if (inserts.length) { const { error } = await supabase.from("sdp_login_map").insert(inserts); if (error) throw error; }
      for (const u of updates) { const { id, ...rest } = u; const { error } = await supabase.from("sdp_login_map").update(rest).eq("id", id); if (error) throw error; }
      say(`Import selesai: +${inserts.length} baru, ${updates.length} diperbarui${bad.length ? `, ${bad.length} dilewati (role tak dikenal)` : ""}.`, bad.length ? "warn" : "ok");
      load();
    } catch (e) { say("Gagal import: " + (e.message || e), "error"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  };
  const exportXlsx = () => {
    const aoa = [["email", "role", "brand", "branch", "cluster", "region", "full_name", "active"],
      ...rows.map((r) => [r.email, r.role, r.brand || "", r.branch || "", r.cluster || "", r.region || "", r.full_name || "", r.active ? "TRUE" : "FALSE"])];
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = aoa[0].map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "EmailMapping");
    XLSX.writeFile(wb, `Email_Mapping_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const template = () => {
    const aoa = [["email", "role", "brand", "branch", "cluster", "region", "full_name"],
      ["bsm.pekanbaru@ioh.co.id", "bsm", "IM3", "PEKANBARU", "", "CENTRAL SUMATERA", "Budi"],
      ["cse.karo@ioh.co.id", "cse_rse", "IM3", "MEDAN", "MC-KARO", "NORTH SUMATERA", "Ani"]];
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = aoa[0].map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Email_Mapping.xlsx");
  };

  const btn = (variant) => ({ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 10, cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 700, border: `1px solid ${t.line}`, background: variant === "primary" ? TEAL : t.card, color: variant === "primary" ? "#fff" : t.hi, ...(variant === "primary" ? { border: "none" } : {}) });
  const inp = { width: "100%", boxSizing: "border-box", height: 42, padding: "0 12px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.field, color: t.hi, fontSize: 14, fontFamily: FONT, outline: "none" };

  if (gate === "checking") return <FullLoader t={t} />;
  if (gate === "denied") return (
    <div style={{ minHeight: "100svh", fontFamily: FONT, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ textAlign: "center", color: t.mid }}>
        <ShieldCheck size={34} color={RED} style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 18, fontWeight: 800, color: t.hi }}>Akses ditolak</div>
        <div style={{ fontSize: 13.5, marginTop: 6 }}>Halaman ini hanya untuk admin (SPM/Finance/IOH).</div>
        <button onClick={() => router.push("/dashboard")} style={{ ...btn(), marginTop: 16 }}><ArrowLeft size={14} /> Ke Dashboard</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100svh", fontFamily: FONT, background: t.bg, color: t.hi, padding: "24px 18px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => router.push("/dashboard")} style={{ ...btn(), padding: "9px 12px" }}><ArrowLeft size={14} /></button>
            <HubLogo variant="sandra" size={40} inBox />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>Update Mapping Email</div>
              <div style={{ fontSize: 12.5, color: t.mid }}>Email login → role & branch untuk SandraHub (SDP dst)</div>
            </div>
          </div>
          <button onClick={() => { const n = !d; setD(n); localStorage.setItem("hub-theme", n ? "dark" : "light"); }} style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${t.line}`, background: t.card, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>{d ? <Sun size={15} /> : <Moon size={15} />}</button>
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.mid }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari email / role / branch…" style={{ ...inp, paddingLeft: 34 }} />
          </div>
          <button onClick={() => setEditing({ ...EMPTY })} style={btn("primary")}><Plus size={15} /> Tambah</button>
          <button onClick={() => fileRef.current?.click()} style={btn()}><Upload size={15} /> Import Excel</button>
          <button onClick={exportXlsx} style={btn()}><Download size={15} /> Export</button>
          <button onClick={template} style={btn()}><FileSpreadsheet size={15} /> Template</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => onImport(e.target.files?.[0])} />
        </div>

        {/* Table */}
        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, fontSize: 12.5, color: t.mid }}>{filtered.length} email terdaftar</div>
          {loading ? <div style={{ padding: 48, textAlign: "center", color: t.mid }}><Loader2 size={22} className="mspin" /></div>
            : filtered.length === 0 ? <div style={{ padding: 40, textAlign: "center", color: t.mid, fontSize: 13.5 }}>Belum ada mapping. Klik <b>Tambah</b> atau <b>Import Excel</b>.</div>
              : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ background: t.sub }}>
                      {["Email", "Role", "Brand", "Branch / Cluster", "Region", "Aktif", ""].map((h) => <th key={h} style={{ textAlign: h === "Aktif" || h === "" ? "center" : "left", padding: "10px 14px", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: t.mid, whiteSpace: "nowrap" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id} style={{ borderTop: `1px solid ${t.line}` }}>
                          <td style={{ padding: "10px 14px", fontWeight: 600, whiteSpace: "nowrap" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Mail size={13} color={t.lo} /> {r.email}</span></td>
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}><span style={{ fontSize: 11.5, fontWeight: 800, color: TEAL, background: t.tealBg, border: `1px solid ${t.tealBd}`, borderRadius: 7, padding: "3px 8px" }}>{ROLE_LABEL[r.role] || r.role}</span></td>
                          <td style={{ padding: "10px 14px", color: t.mid, whiteSpace: "nowrap" }}>{r.brand || "—"}</td>
                          <td style={{ padding: "10px 14px", color: t.mid, whiteSpace: "nowrap" }}>{[r.branch, r.cluster].filter(Boolean).join(" · ") || "—"}</td>
                          <td style={{ padding: "10px 14px", color: t.mid, whiteSpace: "nowrap" }}>{r.region || "—"}</td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            <button onClick={() => toggleActive(r)} title="Aktif/nonaktif" style={{ width: 34, height: 20, borderRadius: 99, border: "none", cursor: "pointer", background: r.active ? TEAL : t.lo, position: "relative", transition: "background .15s" }}>
                              <span style={{ position: "absolute", top: 2, left: r.active ? 16 : 2, width: 16, height: 16, borderRadius: 99, background: "#fff", transition: "left .15s" }} />
                            </button>
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", whiteSpace: "nowrap" }}>
                            <button onClick={() => setEditing({ ...r })} style={{ background: "none", border: "none", cursor: "pointer", color: t.mid, padding: 6 }}><Pencil size={15} /></button>
                            <button onClick={() => del(r)} style={{ background: "none", border: "none", cursor: "pointer", color: t.red, padding: 6 }}><Trash2 size={15} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </div>
        <div style={{ fontSize: 11.5, color: t.lo, marginTop: 12, lineHeight: 1.6 }}>
          Kolom Excel: <b>email, role, brand, branch, cluster, region, full_name</b>. Role valid: cse_rse, bsm, pic_region, spm_sumatera. Email yang sudah ada akan diperbarui. Role di luar mapping (mis. finance_mpx) tidak terpengaruh — login mereka tetap seperti biasa.
        </div>
      </div>

      {/* Modal tambah/edit */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: "0 20px 50px rgba(0,0,0,.4)", overflow: "hidden" }}>
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 15.5, fontWeight: 800 }}>{editing.id ? "Edit Mapping" : "Tambah Mapping Email"}</div>
              <button onClick={() => setEditing(null)} style={{ background: "none", border: "none", cursor: "pointer", color: t.mid }}><X size={18} /></button>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Wrap label="Email" full><input value={editing.email} onChange={(e) => setEditing((s) => ({ ...s, email: e.target.value }))} placeholder="nama@ioh.co.id" style={inp} /></Wrap>
              <Wrap label="Role"><select value={editing.role} onChange={(e) => setEditing((s) => ({ ...s, role: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>{ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}</select></Wrap>
              <Wrap label="Brand"><select value={editing.brand || ""} onChange={(e) => setEditing((s) => ({ ...s, brand: e.target.value }))} style={{ ...inp, cursor: "pointer" }}><option value="">—</option><option value="IM3">IM3</option><option value="3ID">3ID</option></select></Wrap>
              <Wrap label="Branch"><input value={editing.branch || ""} onChange={(e) => setEditing((s) => ({ ...s, branch: e.target.value }))} placeholder="PEKANBARU" style={inp} /></Wrap>
              <Wrap label="Cluster (CSE)"><input value={editing.cluster || ""} onChange={(e) => setEditing((s) => ({ ...s, cluster: e.target.value }))} placeholder="MC-KARO" style={inp} /></Wrap>
              <Wrap label="Region" full><input value={editing.region || ""} onChange={(e) => setEditing((s) => ({ ...s, region: e.target.value }))} placeholder="NORTH SUMATERA" style={inp} /></Wrap>
              <Wrap label="Nama (opsional)" full><input value={editing.full_name || ""} onChange={(e) => setEditing((s) => ({ ...s, full_name: e.target.value }))} style={inp} /></Wrap>
            </div>
            <div style={{ padding: "14px 18px", borderTop: `1px solid ${t.line}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setEditing(null)} style={btn()}>Batal</button>
              <button onClick={save} disabled={saving} style={btn("primary")}>{saving ? <Loader2 size={15} className="mspin" /> : <Check size={15} />} Simpan</button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <style>{`.mspin{animation:msp 1s linear infinite}@keyframes msp{to{transform:rotate(360deg)}} *{box-sizing:border-box}`}</style>
    </div>
  );

  function Wrap({ label, full, children }) {
    return <label style={{ display: "block", gridColumn: full ? "1 / -1" : "auto" }}><div style={{ fontSize: 11, fontWeight: 700, color: t.mid, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>{children}</label>;
  }
}

function FullLoader({ t }) {
  return <div style={{ minHeight: "100svh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 size={26} color={TEAL} className="mspin" /><style>{`.mspin{animation:msp 1s linear infinite}@keyframes msp{to{transform:rotate(360deg)}}`}</style></div>;
}
