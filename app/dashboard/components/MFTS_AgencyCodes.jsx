"use client";

// ============================================================
// MFTS — Kode Registrasi Agency (hanya spm_sumatera)
// spm generate kode per agency → PIC agency daftar pakai kode di
// /agency/register → akun otomatis terikat ke agency (RLS).
// ============================================================

import React, { useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, Copy, Check, Loader2, RefreshCw, X, Ban } from "lucide-react";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA",
  line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  teal: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  green: "#1A9E90", greenBg: d ? "rgba(26,158,144,.12)" : "rgba(26,158,144,.08)", greenBd: d ? "rgba(26,158,144,.3)" : "rgba(26,158,144,.2)",
  red: "#ED1C24", redBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)", redBd: d ? "rgba(237,28,36,.25)" : "rgba(237,28,36,.18)",
  amber: "#D4A800", amberBg: d ? "rgba(255,203,5,.12)" : "rgba(212,168,0,.1)", amberBd: d ? "rgba(255,203,5,.3)" : "rgba(212,168,0,.25)",
  md: d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const fmt = (x) => (x ? new Date(x).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const randCode = () => {
  const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const blk = () => Array.from({ length: 4 }, () => s[Math.floor(Math.random() * s.length)]).join("");
  return `AGN-${blk()}-${blk()}`;
};

export default function MFTS_AgencyCodes({ supabase, theme = "dark", profile, agencies = [] }) {
  const d = theme === "dark"; const t = mk(d);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState("");

  async function load() {
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabase.from("mf_agency_codes")
        .select("*, agency:mf_agencies(name)").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      setList(data || []);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const agencyName = useMemo(() => Object.fromEntries(agencies.map((a) => [a.id, a.name])), [agencies]);

  async function revoke(id) {
    await supabase.from("mf_agency_codes").update({ active: false }).eq("id", id);
    await load();
  }
  function copy(code) { navigator.clipboard?.writeText(code); setCopied(code); setTimeout(() => setCopied(""), 1500); }

  const card = { background: t.card, border: `1px solid ${t.line}`, borderRadius: 14 };

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}><KeyRound size={17} /> Kode Registrasi Agency</div>
          <div style={{ fontSize: 13, color: t.mid, marginTop: 2 }}>Buat kode untuk tiap agency. PIC agency mendaftar di <b style={{ color: t.hi }}>/agency/register</b> memakai kode ini.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={{ ...btn(t), background: t.sub }}><RefreshCw size={14} /> Muat ulang</button>
          <button onClick={() => setAdding(true)} style={{ ...btn(t), background: t.teal, color: "#fff", borderColor: t.teal }}><Plus size={14} /> Buat kode</button>
        </div>
      </div>

      {err && <div style={{ ...card, padding: 12, borderColor: t.redBd, background: t.redBg, color: t.red, marginBottom: 14, fontSize: 13 }}>{err}</div>}

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: t.sub, color: t.mid, textAlign: "left" }}>
                {["Kode", "Agency", "Catatan", "Status", "Dipakai", ""].map((h) => (
                  <th key={h} style={{ padding: "9px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: t.mid }}><Loader2 size={15} style={{ animation: "spin 1s linear infinite", verticalAlign: -2 }} /> Memuat…</td></tr>}
              {!loading && list.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: t.lo }}>Belum ada kode. Klik “Buat kode”.</td></tr>}
              {!loading && list.map((c) => (
                <tr key={c.id} style={{ borderTop: `1px solid ${t.line}`, opacity: c.active ? 1 : 0.6 }}>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ fontWeight: 800, letterSpacing: 1, color: t.hi }}>{c.code}</span>
                    <button onClick={() => copy(c.code)} title="Salin" style={{ ...iconBtn(t), width: 26, height: 26, marginLeft: 8, verticalAlign: -7 }}>
                      {copied === c.code ? <Check size={13} color={t.green} /> : <Copy size={13} />}
                    </button>
                  </td>
                  <td style={{ padding: "10px 12px", color: t.mid }}>{c.agency?.name || agencyName[c.agency_id] || "—"}</td>
                  <td style={{ padding: "10px 12px", color: t.mid }}>{c.label || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {c.used_at ? <span style={{ fontSize: 10.5, fontWeight: 800, color: t.mid, background: t.sub, border: `1px solid ${t.line}`, padding: "2px 8px", borderRadius: 999 }}>Terpakai</span>
                      : c.active ? <span style={{ fontSize: 10.5, fontWeight: 800, color: t.green, background: t.greenBg, border: `1px solid ${t.greenBd}`, padding: "2px 8px", borderRadius: 999 }}>Aktif</span>
                      : <span style={{ fontSize: 10.5, fontWeight: 800, color: t.red, background: t.redBg, border: `1px solid ${t.redBd}`, padding: "2px 8px", borderRadius: 999 }}>Nonaktif</span>}
                  </td>
                  <td style={{ padding: "10px 12px", color: t.mid }}>{c.used_by_email ? `${c.used_by_email} · ${fmt(c.used_at)}` : "—"}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {c.active && !c.used_at && <button onClick={() => revoke(c.id)} title="Nonaktifkan" style={{ ...iconBtn(t), color: t.red, borderColor: t.redBd }}><Ban size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adding && <AddCodeModal t={t} supabase={supabase} profile={profile} agencies={agencies}
        onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await load(); }} />}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const btn = (t) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FF });
const iconBtn = (t) => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.mid, cursor: "pointer" });
const inp = (t) => ({ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" });
const lbl = (t) => ({ fontSize: 11, fontWeight: 700, color: t.mid, marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: "0.04em" });

function AddCodeModal({ t, supabase, profile, agencies, onClose, onDone }) {
  const [agencyId, setAgencyId] = useState("");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState(randCode());
  const [saving, setSaving] = useState(false);
  const [e, setE] = useState("");

  async function save() {
    if (!agencyId) { setE("Pilih agency"); return; }
    setSaving(true); setE("");
    try {
      const { error } = await supabase.from("mf_agency_codes").insert({
        code: code.trim().toUpperCase(), agency_id: agencyId, label: label.trim() || null, created_by: profile?.id || null,
      });
      if (error) throw new Error(error.message);
      await onDone();
    } catch (err) { setE(err.message || "Gagal menyimpan"); setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(ev) => ev.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: t.card, borderRadius: 16, border: `1px solid ${t.line}`, boxShadow: t.md, fontFamily: FF }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${t.line}` }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Buat Kode Agency</div>
          <button onClick={onClose} style={{ ...iconBtn(t), border: "none", background: "transparent" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          {e && <div style={{ color: t.red, fontSize: 12, fontWeight: 600 }}>{e}</div>}
          <div><label style={lbl(t)}>Agency *</label>
            <select value={agencyId} onChange={(ev) => setAgencyId(ev.target.value)} style={inp(t)}>
              <option value="">— pilih —</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><label style={lbl(t)}>Catatan / PIC (opsional)</label><input value={label} onChange={(ev) => setLabel(ev.target.value)} placeholder="mis. PIC Staffinc Sumatera" style={inp(t)} /></div>
          <div><label style={lbl(t)}>Kode</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={code} onChange={(ev) => setCode(ev.target.value.toUpperCase())} style={{ ...inp(t), fontWeight: 800, letterSpacing: 1 }} />
              <button onClick={() => setCode(randCode())} style={{ ...btn(t), background: t.sub }}><RefreshCw size={13} /></button>
            </div>
          </div>
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${t.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={btn(t)}>Batal</button>
          <button disabled={saving} onClick={save} style={{ ...btn(t), background: t.teal, color: "#fff", borderColor: t.teal }}>{saving ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </div>
    </div>
  );
}
