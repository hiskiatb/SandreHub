"use client";
/**
 * SDP_Drafts.jsx — inbox "Draft & Link".
 * Menampilkan draft server milik user, dikelompokkan:
 *   • Belum selesai       (status draft, belum dibagikan)
 *   • Dibagikan (link)     (shared, menunggu diisi) + countdown expiry
 *   • Dikirim balik        (status submitted → tinjau & finalkan)
 * Aksi: Lanjutkan/Tinjau (buka di form), Salin link, Hapus.
 *
 * Props: { supabase, theme, profile, onOpen(draft), onExit }
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Loader2, Link2, Copy, Trash2, Pencil, Clock, Inbox, FileText, CheckCircle2, AlertTriangle } from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;
const mk = (d) => ({
  card: d ? "#161618" : "#FFFFFF", sub: d ? "#1C1C20" : "#F6F7F9", line: d ? "#2A2A2F" : "#E4E7EC",
  hi: d ? "#F1F1F4" : "#17181C", mid: d ? "#8A8A96" : "#5B5B66", lo: d ? "#5A5A68" : "#98A2B3",
  green: d ? "#30D158" : "#1A9E5A", amber: d ? "#FFB020" : "#B7791F", blue: d ? "#0A84FF" : "#2563EB",
  red: "#E5484D", teal: "#1A9E90", mag: "#C6168D",
  sm: d ? "0 1px 3px rgba(0,0,0,.5)" : "0 1px 3px rgba(23,24,28,.06)",
});
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const shareUrl = (token) => (typeof window !== "undefined" ? window.location.origin : "") + "/isi/" + token;

function remaining(exp, now) {
  if (!exp) return { none: true };
  const ms = new Date(exp).getTime() - now;
  if (ms <= 0) return { expired: true, text: "Kedaluwarsa" };
  const h = Math.floor(ms / 3.6e6), d = Math.floor(h / 24), hh = h % 24, m = Math.floor((ms % 3.6e6) / 6e4);
  return { text: d > 0 ? `${d} hari ${hh} jam lagi` : h > 0 ? `${h} jam ${m} mnt lagi` : `${m} menit lagi`, soon: h < 12 };
}

export default function SDP_Drafts({ supabase, theme = "dark", profile, onOpen, onExit }) {
  const d = theme === "dark"; const t = mk(d);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(iv); }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabase.from("sdp_draft").select("*").order("updated_at", { ascending: false }).limit(300);
      if (error) throw error;
      setRows((data || []).filter((r) => r.status !== "finalized"));
    } catch (e) { setErr(e?.message || String(e)); setRows([]); }
    finally { setLoading(false); }
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const g = { submitted: [], shared: [], draft: [] };
    rows.forEach((r) => {
      if (r.status === "submitted") g.submitted.push(r);
      else if (r.shared) g.shared.push(r);
      else g.draft.push(r);
    });
    return g;
  }, [rows]);

  const del = async (r) => {
    setBusyId(r.id);
    try { await supabase.from("sdp_draft").delete().eq("id", r.id); await load(); }
    finally { setBusyId(null); }
  };
  const copy = async (r) => {
    try { await navigator.clipboard.writeText(shareUrl(r.token)); setCopied(r.id); setTimeout(() => setCopied(null), 1800); } catch { /* */ }
  };

  const Badge = ({ children, col }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99, fontSize: 11, fontWeight: 800, color: col, background: `${col}1A`, border: `1px solid ${col}33`, whiteSpace: "nowrap" }}>{children}</span>;

  const Row = ({ r, kind }) => {
    const rem = remaining(r.expires_at, now);
    return (
      <div style={{ padding: "13px 0", borderTop: `1px solid ${t.line}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>{r.label || r.payload?.sdp_name || r.payload?.partner_company_name || "Draft SDP"}</div>
            <div style={{ fontSize: 12, color: t.mid, marginTop: 2 }}>
              {r.payload?.brand ? `${r.payload.brand} · ` : ""}{r.submitter_cluster || r.submitter_branch || ""} · diperbarui {fmtDate(r.updated_at)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {kind === "shared" && (rem.expired
              ? <Badge col={t.red}><AlertTriangle size={12} /> Kedaluwarsa</Badge>
              : <Badge col={rem.soon ? t.amber : t.blue}><Clock size={12} /> {rem.text}</Badge>)}
            {kind === "submitted" && <Badge col={t.green}><CheckCircle2 size={12} /> Perlu ditinjau</Badge>}
            {kind === "draft" && <Badge col={t.mid}><FileText size={12} /> Draft</Badge>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => onOpen?.(r)} style={btn(t, "primary")}>
            <Pencil size={13} /> {kind === "submitted" ? "Tinjau & Finalkan" : "Lanjutkan"}
          </button>
          {r.shared && r.token && (
            <button onClick={() => copy(r)} style={btn(t)}>
              {copied === r.id ? <><CheckCircle2 size={13} color={t.green} /> Tersalin</> : <><Copy size={13} /> Salin link</>}
            </button>
          )}
          <button onClick={() => del(r)} disabled={busyId === r.id} style={btn(t, "danger")}>
            {busyId === r.id ? <Loader2 size={13} className="dspin" /> : <Trash2 size={13} />} Hapus
          </button>
        </div>
      </div>
    );
  };

  const Section = ({ icon, title, list, kind }) => (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.sm, padding: "6px 16px 14px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: t.mid, padding: "14px 0 4px" }}>{icon} {title} ({list.length})</div>
      {list.length === 0 ? <div style={{ fontSize: 13, color: t.mid, padding: "12px 0 6px" }}>Tidak ada.</div> : list.map((r) => <Row key={r.id} r={r} kind={kind} />)}
    </div>
  );

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4, display: "flex", alignItems: "center", gap: 8 }}><Inbox size={19} color={t.mid} /> Draft & Link</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 3 }}>Draft yang belum selesai, link isian yang dibagikan (dengan sisa waktu), dan isian yang dikirim balik untuk Anda finalkan.</div>
        </div>
        <button onClick={load} title="Muat ulang" style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${t.line}`, background: t.card, color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><RefreshCw size={15} /></button>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: t.mid }}><Loader2 size={22} className="dspin" /><div style={{ marginTop: 8, fontSize: 13 }}>Memuat…</div></div>
      ) : err ? (
        <div style={{ padding: "28px 20px", textAlign: "center", background: t.card, borderRadius: 14, border: `1px solid ${t.line}`, color: t.mid, fontSize: 13 }}>Gagal memuat: {err}</div>
      ) : (
        <>
          <Section icon={<CheckCircle2 size={14} color={t.green} />} title="Dikirim balik — tinjau & finalkan" list={groups.submitted} kind="submitted" />
          <Section icon={<Link2 size={14} color={t.blue} />} title="Dibagikan via link — menunggu diisi" list={groups.shared} kind="shared" />
          <Section icon={<FileText size={14} color={t.mid} />} title="Draft belum selesai" list={groups.draft} kind="draft" />
        </>
      )}
      <style>{`.dspin{animation:dsp 1s linear infinite}@keyframes dsp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function btn(t, variant) {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, cursor: "pointer", fontFamily: FF, fontSize: 12.5, fontWeight: 700, border: `1px solid ${t.line}`, background: t.card, color: t.hi };
  if (variant === "primary") return { ...base, border: "none", background: t.teal, color: "#fff" };
  if (variant === "danger") return { ...base, color: t.red, border: `1px solid ${t.red}44` };
  return base;
}
