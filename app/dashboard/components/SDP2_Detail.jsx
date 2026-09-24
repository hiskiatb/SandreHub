"use client";
/**
 * SDP2_Detail.jsx — SDP Management (Baru), detail satu SDP.
 * Tampilan baru: 1 stepper besar (bukan 5 kolom status), catatan revisi bila
 * ada, daftar dokumen + upload cepat. Untuk perbaikan data saat "Need
 * Revision", dipinjam form edit dari SDP_RegistrationDetail (sudah teruji,
 * termasuk validasi & RLS) — supaya tidak menulis ulang logic edit dari nol.
 *
 * Props: { supabase, theme = "dark", profile, entry, onBack }
 */
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, AlertCircle, FileText, ExternalLink, RefreshCw, UploadCloud, Pencil } from "lucide-react";
import { computeSdpProgress, SDP_STAGES } from "../../../lib/sdp/progress";
import { listSdpDocuments, openSdpDocument, retrySdpDocumentRelay, uploadSdpDocument } from "../../../lib/sdp/driveRelay";
import SDP_RegistrationDetail from "./SDP_RegistrationDetail";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  teal: "#32BCAD", tealD: "#1A9E90",
  amber: "#FFB020", amberBg: d ? "rgba(255,176,32,.14)" : "rgba(255,176,32,.09)",
  acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.12)" : "rgba(237,28,36,.08)",
  ok: "#22C55E", okBg: d ? "rgba(34,197,94,.14)" : "rgba(22,163,74,.09)",
  blue: "#0A84FF", blueBg: d ? "rgba(10,132,255,.12)" : "rgba(37,99,235,.08)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const TONE_COL = (t, tone) => ({ ok: t.ok, amber: t.amber, acc: t.acc, blue: t.blue }[tone] || t.mid);
const TONE_BG = (t, tone) => ({ ok: t.okBg, amber: t.amberBg, acc: t.accBg, blue: t.blueBg }[tone] || t.sub);

function BigStages({ t, stageIndex, tone, blocked }) {
  const col = TONE_COL(t, tone);
  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      {SDP_STAGES.map((s, i) => {
        const done = i < stageIndex || (i === stageIndex && stageIndex === 3);
        const active = i === stageIndex && stageIndex !== 3;
        const dotCol = done ? t.ok : active ? col : t.line;
        return (
          <React.Fragment key={s.key}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 68, flexShrink: 0 }}>
              <div style={{ width: 22, height: 22, borderRadius: 99, background: done || active ? dotCol : "transparent", border: `2px solid ${dotCol}`,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                {done && <div style={{ width: 7, height: 7, borderRadius: 99, background: "#fff" }} />}
                {active && blocked && <AlertCircle size={13} color="#fff" />}
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: active ? col : done ? t.hi : t.lo, marginTop: 6, textAlign: "center", lineHeight: 1.25 }}>{s.label}</div>
            </div>
            {i < SDP_STAGES.length - 1 && <div style={{ flex: 1, height: 2, background: i < stageIndex ? t.ok : t.line, marginTop: 10 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function SDP2_Detail({ supabase, theme = "dark", profile, entry, onBack }) {
  const d = theme === "dark";
  const t = mk(d);
  const fileInput = useRef(null);

  const [row, setRow] = useState(entry);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("sdp_registration").select("*").eq("id", entry.id).single();
    if (!error && data) setRow(data);
    setLoading(false);
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [entry.id]);

  useEffect(() => {
    if (!row?.sdp_id_new) { setDocs([]); return; }
    let alive = true;
    listSdpDocuments({ supabase, sdpId: row.sdp_id_new }).then((r) => { if (alive) setDocs(r); }).catch(() => { if (alive) setDocs([]); });
    return () => { alive = false; };
  }, [supabase, row?.sdp_id_new]);

  const doUpload = async (file) => {
    if (!file || !row?.sdp_id_new) return;
    setUploading(true); setMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await uploadSdpDocument({ supabase, sdpId: row.sdp_id_new, file, uploaderId: user?.id, uploaderName: profile?.full_name || profile?.name });
      const list = await listSdpDocuments({ supabase, sdpId: row.sdp_id_new });
      setDocs(list);
      setMsg({ type: "ok", text: "Dokumen berhasil diunggah." });
    } catch (e) { setMsg({ type: "err", text: "Gagal unggah: " + (e.message || e) }); }
    finally { setUploading(false); }
  };

  if (editing) {
    // Pinjam form edit yang sudah ada (validasi & RLS teruji) — begitu
    // selesai, kembali ke tampilan baru ini, bukan ke menu Archive.
    return (
      <SDP_RegistrationDetail supabase={supabase} theme={theme} profile={profile} entry={row}
        onBack={() => setEditing(false)} onChanged={(updated) => { setRow(updated); setEditing(false); }} />
    );
  }

  if (loading || !row) {
    return (
      <div style={{ fontFamily: FF, padding: 48, textAlign: "center", color: t.mid }}>
        <Loader2 size={20} className="spin" /><div style={{ marginTop: 8, fontSize: 13 }}>Memuat…</div>
        <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const prog = computeSdpProgress(row);

  return (
    <div style={{ fontFamily: FF, color: t.hi, width: "100%" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16 }}>
        <ArrowLeft size={15} /> Kembali ke SDP Saya
      </button>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.3 }}>{row.sdp_name || "(Belum ada nama)"}</div>
        <div style={{ fontSize: 12, fontFamily: "monospace", color: t.mid, marginTop: 3 }}>{row.sdp_id_new || "Draft"}{row.branch ? ` · ${row.branch}` : ""}</div>
      </div>

      {msg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", borderRadius: 10, marginBottom: 14, fontSize: 12.5, fontWeight: 600,
          background: msg.type === "ok" ? t.okBg : t.accBg, color: msg.type === "ok" ? t.ok : t.acc }}>
          {msg.text}
        </div>
      )}

      <div className="sdp2-detail-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 1fr)", gap: 16, alignItems: "start" }}>
        {/* Kolom kiri: progres + catatan revisi */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: "22px 22px 20px", boxShadow: t.sm }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 99, color: TONE_COL(t, prog.tone), background: TONE_BG(t, prog.tone) }}>{prog.headline}</span>
            </div>
            <BigStages t={t} stageIndex={prog.stageIndex} tone={prog.tone} blocked={prog.blocked} />
          </div>

          {prog.blocked && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px", borderRadius: 14, background: TONE_BG(t, prog.tone), border: `1px solid ${TONE_COL(t, prog.tone)}44` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AlertCircle size={15} color={TONE_COL(t, prog.tone)} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: TONE_COL(t, prog.tone) }}>Catatan HQ</div>
                  <div style={{ fontSize: 13, color: t.hi, marginTop: 2 }}>{prog.blockedNote}</div>
                </div>
              </div>
              <button onClick={() => setEditing(true)}
                style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 10, border: "none",
                  background: TONE_COL(t, prog.tone), color: "#fff", fontFamily: FF, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                <Pencil size={14} /> Perbaiki Data
              </button>
            </div>
          )}

          {!prog.blocked && (
            <button onClick={() => setEditing(true)}
              style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 17px", borderRadius: 11, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.sm, cursor: "pointer", color: t.hi, fontFamily: FF, fontSize: 12.5, fontWeight: 700 }}>
              <Pencil size={13} /> Lihat / ubah detail lengkap
            </button>
          )}
        </div>

        {/* Kolom kanan: dokumen — jadi panel sendiri, bukan ditumpuk ke bawah */}
        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: "6px 18px 16px", boxShadow: t.sm }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 10px", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: t.lo }}>
              <FileText size={13} /> Dokumen ({docs?.length ?? 0})
            </div>
            <button onClick={() => fileInput.current?.click()} disabled={uploading}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontFamily: FF, fontSize: 11.5, fontWeight: 700, cursor: uploading ? "default" : "pointer" }}>
              {uploading ? <Loader2 size={13} className="spin" /> : <UploadCloud size={13} />} Unggah
            </button>
            <input ref={fileInput} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); e.target.value = ""; }} />
          </div>
          {docs === null ? (
            <div style={{ fontSize: 12.5, color: t.mid, paddingBottom: 8 }}><Loader2 size={13} className="spin" style={{ verticalAlign: -2, marginRight: 6 }} />Memuat…</div>
          ) : docs.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.lo, paddingBottom: 8 }}>Belum ada dokumen diunggah.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8 }}>
              {docs.map((doc) => (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, background: t.sub, border: `1px solid ${t.line}` }}>
                  <FileText size={13} color={t.mid} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file_name}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 99, color: doc.status === "synced" ? t.ok : doc.status === "failed" ? t.acc : t.amber, background: `${doc.status === "synced" ? t.ok : doc.status === "failed" ? t.acc : t.amber}1A` }}>{doc.status}</span>
                  <button type="button" onClick={() => openSdpDocument({ supabase, storagePath: doc.storage_path })} style={{ border: "none", background: "none", cursor: "pointer", color: t.mid, display: "inline-flex" }}><ExternalLink size={13} /></button>
                  {doc.status === "failed" && (
                    <button type="button" onClick={() => retrySdpDocumentRelay({ supabase, doc }).then(() => listSdpDocuments({ supabase, sdpId: row.sdp_id_new }).then(setDocs))} style={{ border: "none", background: "none", cursor: "pointer", color: t.mid, display: "inline-flex" }}><RefreshCw size={13} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
        @media (max-width: 860px) {
          .sdp2-detail-grid{grid-template-columns:1fr !important;}
        }
      `}</style>
    </div>
  );
}
