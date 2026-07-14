"use client";
// ============================================================
// Kode Otoritas Saya (migrasi SandraHub cse_setup/bsm_setup) — Stage 4
// CSE/BSM klaim kode otoritas kapan saja + lihat kode yang dimiliki.
// RPC: lookup_cse_code/register_cse_code, lookup_bsm_code/register_bsm_code
// ============================================================

import React, { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, CheckCircle2, AlertTriangle, Loader2, MapPin, Store, RefreshCw, X } from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const mk = (d) => ({
  card: d ? "#161618" : "#FFFFFF", sub: d ? "#1C1C20" : "#F3F4F6", line: d ? "#2A2A2F" : "#E9EAEE",
  hi: d ? "#F1F1F4" : "#17181C", mid: d ? "#8A8A96" : "#61616C", lo: d ? "#5A5A68" : "#A2A2AD",
  brand: "#ED1C24", green: d ? "#30D158" : "#1A9E5A", amber: d ? "#FFB020" : "#B7791F", blue: d ? "#0A84FF" : "#2563EB",
  inputBg: d ? "#131315" : "#FFFFFF",
  sm: d ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06)",
  md: d ? "0 8px 24px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06), 0 10px 26px rgba(23,24,28,.05)",
});

export default function SDP_MyCodes({ supabase, theme = "light", profile }) {
  const d = theme === "dark"; const t = mk(d);
  const isBsm = profile?.role === "bsm";
  const roleKey = isBsm ? "bsm" : "cse_rse";

  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState(null);   // {code, area, branch, cluster, brand}
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("sales_access_codes").select("scope_value, brand, area, branch")
      .eq("user_id", profile.id).eq("role", roleKey).eq("is_registered", true).eq("is_active", true);
    setCodes(data || []); setLoading(false);
  }, [supabase, profile?.id, roleKey]);
  useEffect(() => { load(); }, [load]);

  const lookup = async () => {
    const c = code.trim().toUpperCase();
    if (!c) { setErr("Masukkan kode otoritas."); return; }
    setBusy(true); setErr(""); setOk("");
    try {
      const { data, error } = await supabase.rpc(isBsm ? "lookup_bsm_code" : "lookup_cse_code", { p_code: c });
      if (error) throw error;
      if (data?.success) setPreview({ code: c, ...(data.data || {}) });
      else setErr(data?.message || "Kode tidak valid.");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const register = async () => {
    const c = preview?.code; if (!c) return;
    setBusy(true); setErr("");
    try {
      const { data, error } = await supabase.rpc(isBsm ? "register_bsm_code" : "register_cse_code", { p_code: c });
      if (error) throw error;
      if (data?.success) { setOk(`Kode ${c} berhasil diklaim.`); setPreview(null); setCode(""); await load(); }
      else setErr(data?.message || "Gagal menyimpan kode.");
    } catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const inStyle = { fontFamily: FF, fontSize: 15, fontWeight: 700, letterSpacing: "0.04em", color: t.hi, background: t.inputBg, border: `1px solid ${t.line}`, borderRadius: 11, padding: "12px 13px", outline: "none", width: "100%", textTransform: "uppercase", boxSizing: "border-box" };

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Kode Otoritas Saya</div>
        <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>Klaim kode untuk {isBsm ? "branch" : "cluster"} yang Anda kelola. Kode dari admin SPM.</div>
      </div>

      {/* Klaim kode */}
      <div style={{ background: t.card, borderRadius: 18, padding: 18, boxShadow: t.md, maxWidth: 560, marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: t.hi, marginBottom: 7 }}>Masukkan kode otoritas</label>
        <div style={{ display: "flex", gap: 9 }}>
          <input value={code} onChange={(e) => { setCode(e.target.value); setPreview(null); }} onKeyDown={(e) => e.key === "Enter" && lookup()} placeholder="mis. CSE-XXXX" style={inStyle} />
          <button onClick={lookup} disabled={busy} style={{ width: 50, borderRadius: 11, border: "none", background: t.brand, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {busy && !preview ? <Loader2 size={18} className="mcspin" /> : <Plus size={19} />}
          </button>
        </div>

        {preview && (
          <div style={{ marginTop: 14, borderRadius: 14, border: `1px solid ${t.green}44`, background: `${t.green}0F`, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.green, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={14} /> Kode valid — konfirmasi klaim:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 13, color: t.hi, fontWeight: 600 }}>
              {preview.cluster && <span><span style={{ color: t.mid, fontWeight: 500 }}>Cluster:</span> {preview.cluster}</span>}
              {preview.brand && <span><span style={{ color: t.mid, fontWeight: 500 }}>Brand:</span> {preview.brand}</span>}
              {preview.branch && <span><span style={{ color: t.mid, fontWeight: 500 }}>Branch:</span> {preview.branch}</span>}
              {preview.area && <span><span style={{ color: t.mid, fontWeight: 500 }}>Area:</span> {preview.area}</span>}
            </div>
            <div style={{ display: "flex", gap: 9, marginTop: 13 }}>
              <button onClick={() => setPreview(null)} style={{ flex: 1, height: 44, borderRadius: 11, border: `1px solid ${t.line}`, background: t.card, color: t.mid, fontFamily: FF, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Batal</button>
              <button onClick={register} disabled={busy} style={{ flex: 1.4, height: 44, borderRadius: 11, border: "none", background: t.brand, color: "#fff", fontFamily: FF, fontSize: 13.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer" }}>
                {busy ? <Loader2 size={16} className="mcspin" /> : <KeyRound size={15} />} Klaim Kode
              </button>
            </div>
          </div>
        )}

        {err && <div style={{ marginTop: 12, display: "flex", gap: 8, padding: "10px 12px", borderRadius: 11, background: `${t.brand}12`, border: `1px solid ${t.brand}33`, color: t.brand, fontSize: 12.5, fontWeight: 600 }}><AlertTriangle size={15} />{err}</div>}
        {ok && <div style={{ marginTop: 12, display: "flex", gap: 8, padding: "10px 12px", borderRadius: 11, background: `${t.green}14`, border: `1px solid ${t.green}33`, color: t.green, fontSize: 12.5, fontWeight: 700 }}><CheckCircle2 size={15} />{ok}</div>}
      </div>

      {/* Daftar kode dimiliki */}
      <div style={{ background: t.card, borderRadius: 18, padding: "6px 18px 14px", boxShadow: t.md, maxWidth: 560 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 8px" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: t.lo }}>{isBsm ? "Branch" : "Cluster"} yang dikelola ({codes.length})</div>
          <button onClick={load} style={{ background: "none", border: "none", cursor: "pointer", color: t.mid, display: "flex" }}><RefreshCw size={14} /></button>
        </div>
        {loading ? (
          <div style={{ padding: 20, color: t.mid, fontSize: 13 }}><Loader2 size={16} className="mcspin" /> Memuat…</div>
        ) : codes.length === 0 ? (
          <div style={{ padding: "10px 0 8px", color: t.lo, fontSize: 13 }}>Belum ada kode diklaim. Masukkan kode di atas untuk mulai.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {codes.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: 12, background: t.sub }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: `${t.brand}12`, color: t.brand, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{isBsm ? <Store size={17} /> : <MapPin size={17} />}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: t.hi }}>{c.scope_value}</div>
                  <div style={{ fontSize: 12, color: t.mid }}>{[c.brand, c.branch, c.area].filter(Boolean).join(" · ") || "—"}</div>
                </div>
                <CheckCircle2 size={17} color={t.green} />
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`.mcspin{animation:mcsp 1s linear infinite}@keyframes mcsp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
