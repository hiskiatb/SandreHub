"use client";
/**
 * SDP_BulkTermReb.jsx — Grid Massal (paste dari Excel) untuk Termination &
 * Rebordering. Sama pola UX dengan SDP_BulkGrid (Registrasi Massal), versi
 * lebih sederhana: kolom di grid ini mengikuti 1:1 header sheet HQ
 * (02_Termination_Main / 03_Rebordering_Kec_Detail), tidak ada generate SDP
 * ID (SDP sudah ada, tinggal dirujuk apa adanya) & tidak ada hybrid pairing.
 *
 * Props: { supabase, theme = "dark", profile, onExit, kind: "termination" | "rebordering" }
 */
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, Plus, Trash2, ClipboardPaste, Save, Check, Loader2, AlertCircle, X,
} from "lucide-react";
import { SDP_LISTS } from "../../../lib/sdp";

const mk = (d) => ({
  bg: d ? "#0D0D0F" : "#F2F4F7", card: d ? "#17171B" : "#FFFFFF",
  sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  inp: d ? "#111114" : "#FFFFFF", head: d ? "#202028" : "#EEF1F5",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  mag: "#C6168D", acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.14)" : "rgba(237,28,36,.08)",
  ok: "#22C55E", okBg: d ? "rgba(34,197,94,.12)" : "rgba(22,163,74,.08)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md: d ? "0 10px 30px rgba(0,0,0,.6)" : "0 10px 28px rgba(0,0,0,.12)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

const chevronBg = (color, sizePx = 10, offsetPx = 12) => ({
  appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1L5 5L9 1' stroke='${encodeURIComponent(color)}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: `right ${offsetPx}px center`, backgroundSize: `${sizePx}px`,
});

// Kolom grid = header sheet HQ apa adanya (kolom milik HQ seperti HQ
// Validation Status / Final Status TIDAK ditampilkan — dibiarkan kosong).
const CONFIG = {
  termination: {
    table: "sdp_termination",
    title: "Termination — Grid Massal",
    hint: "Tempel dari sheet 02_Termination_Main. Isi SDP Code — data wilayah & partner otomatis ditarik dari data registrasi (sdp_master), tidak perlu diketik ulang.",
    required: ["circle", "branch", "sdp_code", "sdp_name", "termination_reason", "effective_termination_date"],
    lookupKey: "sdp_code",
    // Kolom ini ditarik otomatis dari sdp_master saat SDP Code dikenali —
    // tetap bisa diedit manual (fallback bila SDP belum ada di master/lookup gagal).
    derive: { sdp_name: "sdp_name", partner_territory: "pt_name", sdp_type: "sdp_type", region: "region", branch: "branch", area: "area", micro_cluster: "cluster" },
    cols: [
      { k: "circle", label: "Circle", enum: "circle", w: 110 },
      { k: "sdp_code", label: "SDP Code", w: 120 },
      { k: "region", label: "Region", derived: true, w: 130 },
      { k: "area", label: "Area", derived: true, w: 130 },
      { k: "branch", label: "Branch", derived: true, w: 140 },
      { k: "micro_cluster", label: "Micro Cluster", derived: true, w: 150 },
      { k: "partner_territory", label: "Partner Territory", derived: true, w: 150 },
      { k: "sdp_type", label: "SDP Type", enum: "brand", derived: true, w: 100 },
      { k: "sdp_name", label: "SDP Name", derived: true, w: 180 },
      { k: "lokasi_sdp", label: "Lokasi SDP", w: 160 },
      { k: "num_kec", label: "# KEC", w: 80 },
      { k: "termination_reason", label: "Termination Reason", enum: "termination_reason", w: 160 },
      { k: "last_active_date", label: "Last Active Date", w: 140 },
      { k: "effective_termination_date", label: "Effective Termination Date", w: 170 },
      { k: "kecamatan_return_completed", label: "Kec. Return Completed?", enum: "yes_no", w: 160 },
      { k: "kecamatan_return_where", label: "Where the Kec. Return?", enum: "return_kecamatan", w: 170 },
      { k: "circle_iom_link", label: "Circle IOM No./Link", w: 180 },
      { k: "document_folder_link", label: "Document Folder Link", w: 190 },
      { k: "pic_circle", label: "PIC Circle", w: 140 },
      { k: "pic_hq", label: "PIC HQ", w: 140 },
      { k: "remarks", label: "Remarks", w: 200 },
    ],
  },
  rebordering: {
    table: "sdp_rebordering",
    title: "Rebordering Kecamatan — Grid Massal",
    hint: "Tempel dari sheet 03_Rebordering_Kec_Detail. Isi Existing SDP ID — data SDP asal otomatis ditarik dari data registrasi (sdp_master); isi tujuan (AFTER) sesuai rencana pemindahan.",
    required: ["circle", "kecamatan", "existing_sdp_id", "rebordering_to", "after_sdp_code"],
    lookupKey: "existing_sdp_id",
    derive: { existing_sdp_name: "sdp_name", existing_partner_territory: "pt_name", sdp_type: "sdp_type", existing_region: "region", existing_branch: "branch", existing_micro_cluster: "cluster" },
    cols: [
      { k: "circle", label: "Circle", enum: "circle", w: 110 },
      { k: "kecamatan", label: "Kecamatan", w: 160 },
      { k: "kabupaten", label: "Kab/Kota", w: 140 },
      { k: "rebordering_action", label: "Re-Bordering Action", w: 170 },
      { k: "existing_sdp_id", label: "Existing SDP ID", w: 130 },
      { k: "sdp_type", label: "SDP Type", enum: "brand", derived: true, w: 100 },
      { k: "existing_sdp_name", label: "Existing SDP Name", derived: true, w: 180 },
      { k: "existing_partner_territory", label: "Existing Partner Territory", derived: true, w: 180 },
      { k: "existing_region", label: "Existing Region", derived: true, w: 140 },
      { k: "existing_branch", label: "Existing Branch", derived: true, w: 140 },
      { k: "existing_micro_cluster", label: "Existing Micro Cluster", derived: true, w: 160 },
      { k: "rebordering_to", label: "Re-Bordering to", w: 150 },
      { k: "after_sdp_code", label: "AFTER SDP / MPx Code", w: 160 },
      { k: "after_sdp_name", label: "AFTER SDP / MPx Name", w: 180 },
      { k: "after_partner_territory", label: "AFTER Partner Territory", w: 170 },
      { k: "after_region", label: "AFTER Region", w: 140 },
      { k: "after_branch", label: "AFTER Branch", w: 140 },
      { k: "after_micro_cluster", label: "AFTER Micro Cluster", w: 160 },
      { k: "effective_date", label: "Effective Date", w: 140 },
      { k: "approval_iom_link", label: "Approval / IOM Link", w: 180 },
      { k: "owner", label: "Owner", w: 140 },
      { k: "remarks", label: "Remarks", w: 200 },
    ],
  },
};

const uniq = (arr) => [...new Set(arr.filter((v) => v != null && String(v).trim() !== ""))].sort((a, b) => String(a).localeCompare(String(b)));
const emptyRow = () => ({});
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export default function SDP_BulkTermReb({ supabase, theme = "dark", profile, onExit, kind }) {
  const d = theme === "dark";
  const t = mk(d);
  const cfg = CONFIG[kind] || CONFIG.termination;
  const role = profile?.role ?? "";

  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [master, setMaster] = useState([]); // sdp_master (scoped) — sumber auto-fill

  // Muat draft — disimpan di server (status='draft' di tabel cfg.table), bukan
  // localStorage, supaya draft ikut akun & bisa dilanjut dari perangkat lain.
  useEffect(() => {
    let on = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from(cfg.table).select("*")
        .eq("submitted_by", user.id).eq("status", "draft").order("created_at", { ascending: true });
      if (!on || !data?.length) return;
      setRows(data.map((r) => ({ ...r, __draftId: r.id })));
    })();
    return () => { on = false; };
  }, [supabase, cfg.table]);

  // Data SDP yang sudah diregistrasi — dipakai untuk auto-isi kolom wilayah/partner
  // saat SDP Code / Existing SDP ID dikenali, supaya Circle tidak mengetik ulang
  // data yang sebenarnya sudah pernah dikumpulkan saat registrasi.
  useEffect(() => {
    let on = true;
    (async () => {
      let q = supabase.from("sdp_master").select("sdp_id, sdp_name, sdp_type, pt_name, region, branch, area, cluster");
      if (role === "cse_rse" && profile?.cluster) q = q.eq("cluster", profile.cluster);
      else if (role === "bsm" && profile?.bsm_branch) q = q.eq("branch", profile.bsm_branch);
      else if (profile?.region) q = q.eq("region", profile.region);
      const { data } = await q.limit(20000);
      if (on) setMaster(data || []);
    })();
    return () => { on = false; };
  }, [supabase, role, profile?.cluster, profile?.bsm_branch, profile?.region]);

  const masterIndex = useMemo(() => {
    const m = new Map();
    for (const s of master) if (s.sdp_id) m.set(String(s.sdp_id).trim().toUpperCase(), s);
    return m;
  }, [master]);

  // Terapkan hasil lookup sdp_master ke satu baris (mengisi kolom "derive").
  const applyLookup = (row) => {
    if (!cfg.derive || !cfg.lookupKey) return row;
    const key = String(row[cfg.lookupKey] || "").trim().toUpperCase();
    if (!key) return row;
    const s = masterIndex.get(key);
    if (!s) return row;
    const next = { ...row };
    for (const [rowKey, masterKey] of Object.entries(cfg.derive)) {
      if (s[masterKey] != null && s[masterKey] !== "") next[rowKey] = s[masterKey];
    }
    return next;
  };

  const setCell = (i, k, v) => setRows((p) => p.map((r, idx) => {
    if (idx !== i) return r;
    const next = { ...r, [k]: v };
    // Ubah key lookup (SDP Code / Existing SDP ID) → auto-isi kolom turunannya.
    return k === cfg.lookupKey ? applyLookup(next) : next;
  }));
  const addRow = () => setRows((p) => [...p, emptyRow()]);
  const delRow = (i) => setRows((p) => (p.length === 1 ? [emptyRow()] : p.filter((_, idx) => idx !== i)));

  const validity = useMemo(() => rows.map((r) => {
    const empty = cfg.cols.every((c) => !r[c.k]);
    if (empty) return { skip: true, valid: false, errors: {} };
    const errors = {};
    for (const rk of cfg.required) if (!r[rk]) errors[rk] = "Wajib diisi.";
    return { skip: false, valid: Object.keys(errors).length === 0, errors };
  }), [rows, cfg]);

  const stats = useMemo(() => {
    let valid = 0, invalid = 0, filled = 0;
    validity.forEach((v) => { if (v.skip) return; filled++; v.valid ? valid++ : invalid++; });
    return { valid, invalid, filled };
  }, [validity]);

  // Simpan Draft → ke server (status='draft'); baris yang sudah punya
  // __draftId di-update, baris baru di-insert (id-nya disimpan balik ke row).
  const saveDraft = async () => {
    setSaving(true); setMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesi tidak ditemukan, login ulang.");
      const filled = rows.map((r, i) => ({ r, i })).filter(({ r }) => cfg.cols.some((c) => r[c.k]));
      if (!filled.length) { setMsg({ type: "err", text: "Belum ada baris terisi untuk disimpan." }); return; }

      const idUpdates = [];
      for (const { r, i } of filled) {
        const p = {};
        for (const c of cfg.cols) if (r[c.k] !== undefined && r[c.k] !== "") p[c.k] = r[c.k];
        p.submitted_by = user.id;
        p.submitted_by_name = profile?.full_name || profile?.username || null;
        p.submitter_role = role;
        p.submitter_brand = profile?.bsm_brand || r.sdp_type || null;
        p.submitter_branch = profile?.bsm_branch || r.branch || r.existing_branch || r.after_branch || null;
        p.submitter_cluster = profile?.cluster || r.micro_cluster || r.existing_micro_cluster || null;
        p.submitter_region = r.region || r.existing_region || r.after_region || null;
        p.status = "draft";
        if (r.__draftId) {
          const { error } = await supabase.from(cfg.table).update(p).eq("id", r.__draftId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from(cfg.table).insert(p).select("id").single();
          if (error) throw error;
          idUpdates.push({ i, id: data.id });
        }
      }
      if (idUpdates.length) setRows((p) => p.map((r, idx) => {
        const hit = idUpdates.find((u) => u.i === idx);
        return hit ? { ...r, __draftId: hit.id } : r;
      }));
      setMsg({ type: "ok", text: `${filled.length} baris draft tersimpan ke server.` });
    } catch (err) {
      setMsg({ type: "err", text: "Gagal menyimpan draft: " + (err.message || err) });
    } finally { setSaving(false); }
  };

  const applyPaste = (mappedRows) => {
    const looked = mappedRows.map((r) => applyLookup(r));
    setRows((p) => {
      const base = p.filter((r) => cfg.cols.some((c) => r[c.k]));
      return [...base, ...looked, emptyRow()];
    });
    setPasteOpen(false);
    setMsg({ type: "ok", text: `${looked.length} baris ditempel. Kolom yang cocok dengan data registrasi terisi otomatis — periksa & lengkapi sisanya.` });
  };

  const submit = async () => {
    setMsg(null);
    const toSend = [];
    validity.forEach((v, i) => { if (!v.skip && v.valid) toSend.push(rows[i]); });
    if (!toSend.length) { setMsg({ type: "err", text: "Tidak ada baris valid untuk dikirim." }); return; }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesi tidak ditemukan, login ulang.");

      const payloads = toSend.map((row) => {
        const p = {};
        for (const c of cfg.cols) if (row[c.k] !== undefined && row[c.k] !== "") p[c.k] = row[c.k];
        p.submitted_by = user.id;
        p.submitted_by_name = profile?.full_name || profile?.username || null;
        p.submitter_role = role;
        p.submitter_brand = profile?.bsm_brand || row.sdp_type || null;
        p.submitter_branch = profile?.bsm_branch || row.branch || row.existing_branch || row.after_branch || null;
        p.submitter_cluster = profile?.cluster || row.micro_cluster || row.existing_micro_cluster || null;
        p.submitter_region = row.region || row.existing_region || row.after_region || null;
        p.status = "submitted";
        return p;
      });

      // Kirim per-chunk (aman untuk batch besar).
      const CHUNK = 300;
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const { error } = await supabase.from(cfg.table).insert(payloads.slice(i, i + CHUNK));
        if (error) throw error;
      }

      // Baris draft server yang sudah terkirim tidak perlu tersisa sebagai draft.
      const usedDraftIds = toSend.map((r) => r.__draftId).filter(Boolean);
      if (usedDraftIds.length) {
        try { await supabase.from(cfg.table).delete().in("id", usedDraftIds); } catch { /* ignore */ }
      }

      setMsg({ type: "ok", text: `${payloads.length} baris terkirim ke database.` });
      setRows([emptyRow()]);
    } catch (err) {
      setMsg({ type: "err", text: "Gagal mengirim: " + (err.message || err) });
    } finally { setSaving(false); }
  };

  const cell = (i, c) => {
    const err = validity[i]?.errors?.[c.k];
    const v = rows[i][c.k] ?? "";
    // Kolom "derive" yang sudah terisi otomatis dari sdp_master ditandai warna
    // teal lembut, supaya kelihatan mana yang auto vs yang perlu diisi manual.
    const autoFilled = c.derived && !!v && cfg.derive && Object.prototype.hasOwnProperty.call(cfg.derive, c.k);
    const base = {
      width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 6, fontSize: 12.5, fontFamily: FF,
      border: `1px solid ${err ? t.acc : (autoFilled ? t.tealBd : "transparent")}`, background: err ? t.accBg : (autoFilled ? t.tealBg : "transparent"), color: t.hi, outline: "none",
    };
    const baseSelect = { ...base, padding: "6px 22px 6px 8px", ...chevronBg(err ? t.acc : t.lo, 8, 7) };
    if (c.enum) {
      return (
        <select value={v} title={err || ""} onChange={(e) => setCell(i, c.k, e.target.value)} style={{ ...baseSelect, cursor: "pointer" }}>
          <option value="">—</option>
          {(SDP_LISTS[c.enum] || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return <input value={v} title={err || ""} onChange={(e) => setCell(i, c.k, e.target.value)} style={base} />;
  };

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>{cfg.title}</div>
        <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>{cfg.hint} SDP ID/kode dipakai apa adanya (tidak digenerate ulang).</div>
        {cfg.derive && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11, fontWeight: 700, color: t.tealD }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: t.tealBg, border: `1px solid ${t.tealBd}` }} />
            Kolom warna teal = otomatis terisi dari data registrasi
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Btn t={t} icon={ClipboardPaste} onClick={() => setPasteOpen(true)} accent>Tempel dari Excel</Btn>
        <Btn t={t} icon={Plus} onClick={addRow}>Tambah baris</Btn>
        <Btn t={t} icon={Save} onClick={saveDraft}>Simpan Draft</Btn>
        <div style={{ marginLeft: "auto", fontSize: 12, color: t.mid, display: "flex", gap: 12 }}>
          <span style={{ color: t.ok, fontWeight: 700 }}>{stats.valid} valid</span>
          <span style={{ color: stats.invalid ? t.acc : t.mid, fontWeight: 700 }}>{stats.invalid} invalid</span>
          <span>{stats.filled} terisi</span>
        </div>
      </div>

      {msg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 10, marginBottom: 12, fontSize: 12.5, fontWeight: 600,
          background: msg.type === "ok" ? t.okBg : t.accBg, color: msg.type === "ok" ? t.ok : t.acc, border: `1px solid ${(msg.type === "ok" ? t.ok : t.acc)}44` }}>
          {msg.type === "ok" ? <Check size={14} /> : <AlertCircle size={14} />} {msg.text}
        </div>
      )}

      <div style={{ position: "relative", borderRadius: 12, boxShadow: t.sm }}>
        <div style={{ overflow: "auto", border: `1px solid ${t.line}`, borderRadius: 12, background: t.card, maxHeight: "60vh" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 1400, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, left: 0, zIndex: 3, background: t.head, padding: "8px 6px", fontSize: 11, fontWeight: 800, color: t.mid, width: 40, borderBottom: `1px solid ${t.line}` }}>#</th>
              {cfg.cols.map((c) => (
                <th key={c.k} style={{ position: "sticky", top: 0, zIndex: 2, background: t.head, padding: "8px 8px", fontSize: 11, fontWeight: 800, color: t.mid, textAlign: "left", minWidth: c.w, borderBottom: `1px solid ${t.line}`, whiteSpace: "nowrap" }}>{c.label}</th>
              ))}
              <th style={{ position: "sticky", top: 0, zIndex: 2, background: t.head, borderBottom: `1px solid ${t.line}`, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const v = validity[i];
              const rowBad = v && !v.skip && !v.valid;
              return (
                <tr key={i} style={{ background: rowBad ? t.accBg : "transparent" }}>
                  <td style={{ position: "sticky", left: 0, zIndex: 1, background: rowBad ? t.accBg : t.card, padding: "4px 6px", fontSize: 11, color: t.lo, textAlign: "center", borderBottom: `1px solid ${t.line}` }}>{i + 1}</td>
                  {cfg.cols.map((c) => (
                    <td key={c.k} style={{ padding: "3px 4px", borderBottom: `1px solid ${t.line}` }}>{cell(i, c)}</td>
                  ))}
                  <td style={{ padding: "3px 4px", borderBottom: `1px solid ${t.line}`, textAlign: "center" }}>
                    <button onClick={() => delRow(i)} title="Hapus baris" style={{ border: "none", background: "none", cursor: "pointer", color: t.lo, display: "inline-flex" }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 28, pointerEvents: "none", borderRadius: "0 12px 12px 0", background: `linear-gradient(90deg, transparent, ${t.card})` }} />
        <div style={{ position: "absolute", bottom: 8, right: 10, fontSize: 10, fontWeight: 700, color: t.mid, background: t.card, border: `1px solid ${t.line}`, borderRadius: 99, padding: "2px 8px", pointerEvents: "none" }}>Geser untuk lihat kolom lain →</div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={submit} disabled={saving || !stats.valid} data-primary
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 11, border: "none", cursor: (saving || !stats.valid) ? "default" : "pointer", fontFamily: FF, fontSize: 14, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg, ${t.acc} 0%, ${t.mag} 100%)`, opacity: (saving || !stats.valid) ? 0.55 : 1 }}>
          {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />} Kirim {stats.valid ? `${stats.valid} baris` : ""}
        </button>
      </div>

      {pasteOpen && <PasteModal t={t} cols={cfg.cols} onClose={() => setPasteOpen(false)} onApply={applyPaste} />}
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Btn({ t, icon: Icon, onClick, children, accent }) {
  return (
    <button onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, cursor: "pointer", fontFamily: FF, fontSize: 12.5, fontWeight: 700,
        border: `1px solid ${accent ? t.tealBd : t.line}`, background: accent ? t.tealBg : t.sub, color: accent ? t.tealD : t.hi }}>
      <Icon size={14} /> {children}
    </button>
  );
}

function PasteModal({ t, cols, onClose, onApply }) {
  const [text, setText] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [step, setStep] = useState("paste");
  const [grid, setGrid] = useState([]);
  const [mapping, setMapping] = useState([]);

  const parse = () => {
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) return;
    const g = lines.map((l) => l.split("\t"));
    setGrid(g);
    const width = Math.max(...g.map((r) => r.length));
    const header = hasHeader ? g[0] : null;
    const guess = [];
    for (let ci = 0; ci < width; ci++) {
      let found = "";
      if (header && header[ci]) {
        const h = norm(header[ci]);
        const hit = cols.find((c) => norm(c.label) === h || norm(c.k) === h || norm(c.label).includes(h) || h.includes(norm(c.k)));
        if (hit) found = hit.k;
      }
      if (!found && !header && cols[ci]) found = cols[ci].k;
      guess.push(found);
    }
    setMapping(guess);
    setStep("map");
  };

  const apply = () => {
    const body = hasHeader ? grid.slice(1) : grid;
    const out = body.map((r) => {
      const o = {};
      mapping.forEach((fk, ci) => { if (fk && r[ci] != null && String(r[ci]).trim() !== "") o[fk] = String(r[ci]).trim(); });
      return o;
    }).filter((o) => Object.keys(o).length);
    onApply(out);
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal((
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,14,.55)", backdropFilter: "blur(2px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 14px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.md, width: "min(760px, 94vw)", maxWidth: "100%", maxHeight: "90vh", overflow: "auto", padding: "20px 22px 22px", fontFamily: FF, color: t.hi, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Tempel dari Excel</div>
            <div style={{ fontSize: 11.5, color: t.mid, marginTop: 1 }}>{step === "paste" ? "Langkah 1 dari 2 — tempel data" : "Langkah 2 dari 2 — cocokkan kolom"}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: t.sub, borderRadius: 9, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.mid, flexShrink: 0 }}><X size={16} /></button>
        </div>

        {step === "paste" ? (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px", borderRadius: 10, background: t.tealBg, border: `1px solid ${t.tealBd}`, marginBottom: 12 }}>
              <ClipboardPaste size={14} color={t.tealD} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: t.hi, lineHeight: 1.5 }}>Di Excel, blok sel yang mau ditempel → <b>Ctrl+C</b> (Cmd+C di Mac) → klik kotak di bawah → <b>Ctrl+V</b> (Cmd+V).</div>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder="Tempel data di sini…"
              style={{ width: "100%", boxSizing: "border-box", padding: 13, borderRadius: 12, border: `1.5px solid ${text.trim() ? t.tealBd : t.line}`, background: t.inp, color: t.hi, fontSize: 12.5, fontFamily: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace", outline: "none", resize: "vertical", lineHeight: 1.6, transition: "border-color .15s" }} />
            <button type="button" onClick={() => setHasHeader((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: "12px 0 4px", fontFamily: FF, width: "100%", textAlign: "left" }}>
              <span style={{ position: "relative", width: 34, height: 20, borderRadius: 99, background: hasHeader ? t.teal : t.line, flexShrink: 0, transition: "background .15s" }}>
                <span style={{ position: "absolute", top: 2, left: hasHeader ? 16 : 2, width: 16, height: 16, borderRadius: 99, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", transition: "left .15s" }} />
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: t.hi }}>Baris pertama adalah header kolom</span>
            </button>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={onClose} style={ghost(t)}>Batal</button>
              <button onClick={parse} disabled={!text.trim()} style={solid(t, !text.trim())}>Lanjut: Petakan Kolom</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: t.mid, marginBottom: 12 }}>Cocokkan tiap kolom sumber ke field. Kolom yang diset “— abaikan —” tidak ditempel.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, maxHeight: "48vh", overflow: "auto", paddingRight: 2 }}>
              {mapping.map((fk, ci) => (
                <div key={ci} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 10px", borderRadius: 10, background: fk ? t.tealBg : t.sub, border: `1px solid ${fk ? t.tealBd : t.line}` }}>
                  <div style={{ flex: "1 1 160px", minWidth: 0, fontSize: 12, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: t.lo, fontWeight: 700 }}>Kol {ci + 1}:</span> {hasHeader && grid[0]?.[ci] ? grid[0][ci] : <i style={{ color: t.lo }}>(contoh: {grid[hasHeader ? 1 : 0]?.[ci] ?? "—"})</i>}
                  </div>
                  <select value={fk} onChange={(e) => setMapping((m) => m.map((x, idx) => (idx === ci ? e.target.value : x)))}
                    style={{ flex: "1 1 180px", minWidth: 160, padding: "7px 30px 7px 9px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 12.5, fontFamily: FF, cursor: "pointer", ...chevronBg(t.mid) }}>
                    <option value="">— abaikan —</option>
                    {cols.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button onClick={() => setStep("paste")} style={ghost(t)}>← Kembali</button>
              <button onClick={apply} style={solid(t, false)}>Tempel {(hasHeader ? grid.length - 1 : grid.length)} baris</button>
            </div>
          </>
        )}
      </div>
    </div>
  ), document.body);
}

const ghost = (t) => ({ padding: "9px 16px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FF });
const solid = (t, dis) => ({ padding: "9px 16px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 13, fontWeight: 800, cursor: dis ? "default" : "pointer", fontFamily: FF, opacity: dis ? 0.5 : 1 });
