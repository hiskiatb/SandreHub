"use client";

// Progress bar + persentase untuk operasi massal MFTS (upload/simpan/generate).
import React from "react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

export default function MFTSProgress({ t, prog }) {
  if (!prog) return null;
  const total = Math.max(0, prog.total || 0);
  const done = Math.min(total, Math.max(0, prog.done || 0));
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ background: t.card, border: `1px solid ${t.tealBd}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12, fontFamily: FF }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>{prog.label || "Memproses…"}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: t.teal }}>{pct}% · {done}/{total}</span>
      </div>
      <div style={{ height: 9, background: t.sub, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: t.teal, borderRadius: 999, transition: "width .15s ease" }} />
      </div>
    </div>
  );
}
