"use client";
/**
 * SDP_InitialImport.jsx — Import Data Awal (khusus SPM Sumatera)
 *
 * Beda dari Registrasi Massal (SDP_BulkGrid): fitur ini untuk memuat data SDP
 * YANG SUDAH ADA di spreadsheet HQ (sheet 01_SDP_Registration, 45 kolom) sebagai
 * baseline awal sistem — SDP ID dipakai APA ADANYA dari file, TIDAK di-generate
 * ulang (beda dengan Registrasi Massal yang selalu bikin ID baru untuk SDP baru).
 *
 * Alur: SPM salin blok dari export HQ (lengkap dengan header 45 kolom asli) →
 * tempel → sistem otomatis memetakan berdasarkan nama header HQ (kolom formula/
 * milik HQ seperti Need SAP/Oracle, HQ Validation Status, dll otomatis dilewati
 * karena memang tidak diisi manusia) → SPM cek & lengkapi di grid → kirim.
 * Duplikat SDP ID (baik di batch yang sama maupun yang sudah ada di database)
 * dicegah sebelum kirim.
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useMemo, useState } from "react";
import {
  ArrowLeft, ClipboardPaste, Check, Loader2, AlertCircle, X, Info, Trash2, Database,
} from "lucide-react";
import { HQ_LAYOUT_REGISTRATION } from "../../../lib/sdp/hqExport";
import { toYYMM } from "../../../lib/sdp/idFormat";
import { needSap, needOracle } from "../../../lib/sdp/validation";

const mk = (d) => ({
  bg: d ? "#0D0D0F" : "#F2F4F7", card: d ? "#17171B" : "#FFFFFF",
  sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  inp: d ? "#111114" : "#FFFFFF", head: d ? "#202028" : "#EEF1F5",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  mag: "#C6168D", acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.14)" : "rgba(237,28,36,.08)",
  ok: "#22C55E", okBg: d ? "rgba(34,197,94,.12)" : "rgba(22,163,74,.08)",
  amber: "#D9A200", amberBg: d ? "rgba(217,162,0,.14)" : "rgba(217,162,0,.08)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md: d ? "0 10px 30px rgba(0,0,0,.6)" : "0 10px 28px rgba(0,0,0,.12)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// Chevron kustom via background-image, konsisten dengan dropdown lain di modul SDP.
const chevronBg = (color, sizePx = 10, offsetPx = 12) => ({
  appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1L5 5L9 1' stroke='${encodeURIComponent(color)}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: `right ${offsetPx}px center`, backgroundSize: `${sizePx}px`,
});

// Kolom yang diimpor = hanya field yang diisi manusia di HQ (field !== null);
// kolom formula/milik HQ (Need SAP/Oracle, HQ Validation Status, dst) dilewati
// otomatis — satu sumber kebenaran dengan lib/sdp/hqExport.js supaya tidak
// perlu didefinisikan ulang & selalu sinkron kalau layout HQ berubah.
const IMPORT_COLS = HQ_LAYOUT_REGISTRATION.filter((c) => c.field).map((c) => ({ k: c.field, label: c.header }));
const REQUIRED = ["sdp_id_new", "brand", "circle", "region", "branch", "sdp_name", "partner_company_name"];

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const emptyRow = () => ({});

export default function SDP_InitialImport({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role || "";

  const [rows, setRows] = useState([]);
  const [pasteOpen, setPasteOpen] = useState(true);
  const [dbDupes, setDbDupes] = useState(new Set());
  const [checkingDupes, setCheckingDupes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [progress, setProgress] = useState(null);

  const setCell = (i, k, val) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: val } : r)));
  const delRow = (i) => setRows((p) => p.filter((_, idx) => idx !== i));

  const dupesInBatch = useMemo(() => {
    const seen = new Map(); const dup = new Set();
    rows.forEach((r, i) => {
      const id = String(r.sdp_id_new || "").trim();
      if (!id) return;
      if (seen.has(id)) { dup.add(i); dup.add(seen.get(id)); } else seen.set(id, i);
    });
    return dup;
  }, [rows]);

  const validity = useMemo(() => rows.map((r, i) => {
    const empty = IMPORT_COLS.every((c) => !r[c.k]);
    if (empty) return { skip: true, valid: false, errors: {} };
    const errors = {};
    for (const k of REQUIRED) if (!String(r[k] || "").trim()) errors[k] = "Wajib diisi.";
    const id = String(r.sdp_id_new || "").trim();
    if (id && dupesInBatch.has(i)) errors.sdp_id_new = "SDP ID duplikat di batch ini.";
    if (id && dbDupes.has(id)) errors.sdp_id_new = "SDP ID sudah ada di database.";
    return { skip: false, valid: Object.keys(errors).length === 0, errors };
  }), [rows, dupesInBatch, dbDupes]);

  const stats = useMemo(() => {
    let valid = 0, invalid = 0, filled = 0;
    validity.forEach((v) => { if (v.skip) return; filled++; v.valid ? valid++ : invalid++; });
    return { valid, invalid, filled };
  }, [validity]);

  // Cek SDP ID yang sudah ada di database (sebelum kirim, supaya tidak kena
  // unique-violation) — dijalankan otomatis setiap kali baris berubah, dengan
  // debounce sederhana lewat tombol manual + setelah tempel.
  // Fitur ini hanya untuk SPM Sumatera — data historis lintas cluster/branch,
  // di luar wewenang role lain untuk menulis atas nama pihak lain. Dicek
  // SETELAH semua Hook di atas supaya urutan Hook tetap konsisten tiap render.
  if (role !== "spm_sumatera") {
    return (
      <div style={{ fontFamily: FF, color: t.hi }}>
        <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
          <ArrowLeft size={15} /> Kembali
        </button>
        <div style={{ padding: "36px 22px", textAlign: "center", background: t.card, borderRadius: 16, border: `1px solid ${t.line}` }}>
          <AlertCircle size={22} color={t.acc} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 700 }}>Khusus SPM Sumatera</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 4 }}>Import Data Awal memuat data historis lintas region — hanya SPM Sumatera yang berwenang menjalankannya.</div>
        </div>
      </div>
    );
  }

  const checkDupes = async () => {
    const ids = [...new Set(rows.map((r) => String(r.sdp_id_new || "").trim()).filter(Boolean))];
    if (!ids.length) { setDbDupes(new Set()); return; }
    setCheckingDupes(true);
    try {
      const { data, error } = await supabase.from("sdp_registration").select("sdp_id_new").in("sdp_id_new", ids);
      if (error) throw error;
      setDbDupes(new Set((data || []).map((r) => r.sdp_id_new)));
    } catch { /* biarkan; validasi DB tetap dicek ulang saat kirim */ }
    finally { setCheckingDupes(false); }
  };

  const applyPaste = (mappedRows) => {
    setRows((p) => {
      const base = p.filter((r) => IMPORT_COLS.some((c) => r[c.k]));
      return [...base, ...mappedRows];
    });
    setPasteOpen(false);
    setMsg({ type: "ok", text: `${mappedRows.length} baris ditempel. Memeriksa duplikat…` });
    setTimeout(checkDupes, 50);
  };

  const submit = async () => {
    setMsg(null);
    await checkDupes();
    const toSend = [];
    validity.forEach((v, i) => { if (!v.skip && v.valid) toSend.push(rows[i]); });
    if (!toSend.length) { setMsg({ type: "err", text: "Tidak ada baris valid untuk dikirim." }); return; }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesi tidak ditemukan, login ulang.");

      const payloads = toSend.map((r) => {
        const p = {};
        for (const c of IMPORT_COLS) if (r[c.k] !== undefined && r[c.k] !== "") p[c.k] = String(r[c.k]).trim();
        p.need_sap_creation = needSap(r.registration_scope);
        p.need_oracle_creation = needOracle(r.registration_scope);
        p.cycle_month = toYYMM(r.submission_month) || null;
        p.submitted_by = user.id;
        p.submitted_by_name = profile?.full_name || profile?.username || null;
        p.submitter_role = role;
        p.submitter_brand = r.brand || null;
        p.submitter_branch = r.branch || null;
        p.submitter_region = r.region || null;
        p.submitter_cluster = null;
        // Data historis dari HQ dianggap sudah valid/live — beda dari alur
        // submit baru (CSE/BSM) yang masih menunggu approval berjenjang.
        p.status = "validated";
        return p;
      });

      const CHUNK = 300;
      let sent = 0;
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const batch = payloads.slice(i, i + CHUNK);
        const { error } = await supabase.from("sdp_registration").insert(batch);
        if (error) throw new Error(`Gagal pada baris ${i + 1}–${i + batch.length}: ${error.message}`);
        sent += batch.length;
        setProgress({ sent, total: payloads.length });
      }

      setMsg({ type: "ok", text: `${sent} baris data awal berhasil diimpor.` });
      setRows((p) => p.filter((r) => !toSend.includes(r)));
    } catch (err) {
      setMsg({ type: "err", text: "Gagal mengimpor: " + (err.message || err) });
    } finally { setSaving(false); setProgress(null); }
  };

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>Import Data Awal</div>
        <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>
          Muat data SDP yang sudah terdaftar di spreadsheet HQ sebagai baseline sistem. SDP ID dipakai apa adanya (tidak dibuat baru).
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 13px", borderRadius: 12, background: t.tealBg, border: `1px solid ${t.tealBd}`, marginBottom: 10 }}>
        <Info size={14} color={t.tealD} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: t.hi, lineHeight: 1.6 }}>
          Salin blok data dari file export HQ <b>sheet 01_SDP_Registration</b> — sertakan baris header (45 kolom asli). Kolom formula/milik HQ (Need SAP/Oracle Creation, HQ Validation Status, Circle Submit Status, Final Registration Status) otomatis dilewati karena memang tidak diisi manusia.
        </div>
      </div>

      {/* Peringatan penting: import ini HANYA mengisi sdp_registration (arsip
          riwayat registrasi) — bukan sumber status dashboard. Tanpa catatan ini,
          SPM bisa bingung kenapa SDP yang baru diimpor masih "Belum Lengkap". */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 13px", borderRadius: 12, background: t.amberBg, border: `1px solid ${t.amber}40`, marginBottom: 14 }}>
        <AlertCircle size={14} color={t.amber} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: t.hi, lineHeight: 1.6 }}>
          <b>Import ini tidak mengubah status &ldquo;Belum Lengkap&rdquo; di dashboard.</b> Data yang ditempel di sini masuk ke arsip riwayat registrasi (<code>sdp_registration</code>) — status Selesai/Menunggu BSM/Belum Lengkap di Dashboard SDP dihitung dari sumber lain: roster SDP hasil <b>Upload Territory IOH</b> + status pengisian detail bulanan (<b>Data SDP</b>) per SDP itu sendiri. Kedua hal ini tetap perlu dilengkapi terpisah agar SDP tampil &ldquo;Selesai&rdquo;.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Btn t={t} icon={ClipboardPaste} onClick={() => setPasteOpen(true)} accent>Tempel dari Excel</Btn>
        {rows.length > 0 && (
          <Btn t={t} icon={Database} onClick={checkDupes} disabled={checkingDupes}>
            {checkingDupes ? "Mengecek…" : "Cek duplikat ke database"}
          </Btn>
        )}
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
          {progress && ` (${progress.sent}/${progress.total})`}
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ padding: "48px 20px", textAlign: "center", background: t.card, borderRadius: 16, border: `1px dashed ${t.line}` }}>
          <ClipboardPaste size={26} color={t.mid} style={{ marginBottom: 10, opacity: .6 }} />
          <div style={{ fontSize: 13.5, fontWeight: 700, color: t.hi }}>Belum ada data ditempel</div>
          <div style={{ fontSize: 12, color: t.mid, marginTop: 4 }}>Klik &ldquo;Tempel dari Excel&rdquo; untuk mulai.</div>
        </div>
      ) : (
        <div style={{ position: "relative", borderRadius: 12, boxShadow: t.sm }}>
          <div style={{ overflow: "auto", border: `1px solid ${t.line}`, borderRadius: 12, background: t.card, maxHeight: "58vh" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 1600, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, left: 0, zIndex: 3, background: t.head, padding: "8px 6px", fontSize: 11, fontWeight: 800, color: t.mid, width: 40, borderBottom: `1px solid ${t.line}` }}>#</th>
                  {IMPORT_COLS.map((c) => (
                    <th key={c.k} style={{ position: "sticky", top: 0, zIndex: 2, background: t.head, padding: "8px 8px", fontSize: 11, fontWeight: 800, color: t.mid, textAlign: "left", minWidth: 150, borderBottom: `1px solid ${t.line}`, whiteSpace: "nowrap" }}>
                    {c.label}{REQUIRED.includes(c.k) ? <span style={{ color: t.acc }}> *</span> : ""}
                    </th>
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
                      {IMPORT_COLS.map((c) => {
                        const err = v?.errors?.[c.k];
                        return (
                          <td key={c.k} style={{ padding: "3px 4px", borderBottom: `1px solid ${t.line}` }}>
                            <input value={r[c.k] ?? ""} title={err || ""} onChange={(e) => setCell(i, c.k, e.target.value)}
                              style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 6, fontSize: 12.5, fontFamily: FF,
                                border: `1px solid ${err ? t.acc : "transparent"}`, background: err ? t.accBg : "transparent", color: t.hi, outline: "none" }} />
                          </td>
                        );
                      })}
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
      )}

      {rows.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={submit} disabled={saving || !stats.valid} data-primary
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 11, border: "none", cursor: (saving || !stats.valid) ? "default" : "pointer", fontFamily: FF, fontSize: 14, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg, ${t.teal} 0%, ${t.tealD} 100%)`, opacity: (saving || !stats.valid) ? 0.55 : 1 }}>
            {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />} Import {stats.valid ? `${stats.valid} baris` : ""}
          </button>
        </div>
      )}

      {pasteOpen && <PasteModal t={t} onClose={() => setPasteOpen(false)} onApply={applyPaste} />}
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Btn({ t, icon: Icon, onClick, children, accent, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, cursor: disabled ? "default" : "pointer", fontFamily: FF, fontSize: 12.5, fontWeight: 700,
        border: `1px solid ${accent ? t.tealBd : t.line}`, background: accent ? t.tealBg : t.sub, color: accent ? t.tealD : t.hi, opacity: disabled ? .6 : 1 }}>
      <Icon size={14} /> {children}
    </button>
  );
}

// ── Modal Tempel — auto-map berdasarkan header HQ (45 kolom asli) ──────────
function PasteModal({ t, onClose, onApply }) {
  const [text, setText] = useState("");
  const [grid, setGrid] = useState([]);
  const [mapping, setMapping] = useState([]);
  const [step, setStep] = useState("paste");
  const [unmatched, setUnmatched] = useState(0);

  const parse = () => {
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) return;
    const g = lines.map((l) => l.split("\t"));
    setGrid(g);
    const header = g[0] || [];
    let miss = 0;
    const guess = header.map((h) => {
      const hn = norm(h);
      const hit = IMPORT_COLS.find((c) => norm(c.label) === hn) || IMPORT_COLS.find((c) => norm(c.label).includes(hn) || hn.includes(norm(c.label)));
      if (!hit) miss++;
      return hit ? hit.k : "";
    });
    setMapping(guess);
    setUnmatched(miss);
    setStep("map");
  };

  const apply = () => {
    const body = grid.slice(1);
    const out = body.map((r) => {
      const o = {};
      mapping.forEach((fk, ci) => { if (fk && r[ci] != null && String(r[ci]).trim() !== "") o[fk] = String(r[ci]).trim(); });
      return o;
    }).filter((o) => Object.keys(o).length);
    onApply(out);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,14,.55)", backdropFilter: "blur(2px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 14px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 18, boxShadow: t.md, width: "min(760px, 94vw)", maxWidth: "100%", maxHeight: "90vh", overflow: "auto", padding: "20px 22px 22px", fontFamily: FF, color: t.hi, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Tempel dari Excel — Data Awal</div>
            <div style={{ fontSize: 11.5, color: t.mid, marginTop: 1 }}>{step === "paste" ? "Langkah 1 dari 2 — tempel data (dengan header)" : "Langkah 2 dari 2 — cek pemetaan kolom"}</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: t.sub, borderRadius: 9, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: t.mid, flexShrink: 0 }}><X size={16} /></button>
        </div>

        {step === "paste" ? (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px", borderRadius: 10, background: t.tealBg, border: `1px solid ${t.tealBd}`, marginBottom: 12 }}>
              <ClipboardPaste size={14} color={t.tealD} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: t.hi, lineHeight: 1.5 }}>Salin dari sheet 01_SDP_Registration <b>termasuk baris header</b> → tempel di bawah. Header dipakai untuk mencocokkan otomatis ke kolom sistem.</div>
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder="Tempel data (dengan header) di sini…"
              style={{ width: "100%", boxSizing: "border-box", padding: 13, borderRadius: 12, border: `1.5px solid ${text.trim() ? t.tealBd : t.line}`, background: t.inp, color: t.hi, fontSize: 12.5, fontFamily: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace", outline: "none", resize: "vertical", lineHeight: 1.6 }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={onClose} style={ghost(t)}>Batal</button>
              <button onClick={parse} disabled={!text.trim()} style={solid(t, !text.trim())}>Lanjut: Cek Pemetaan</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: t.mid, marginBottom: 12 }}>
              {unmatched > 0
                ? `${unmatched} kolom sumber tidak cocok otomatis — biarkan "— abaikan —" atau petakan manual.`
                : `Semua kolom sumber cocok otomatis dengan header HQ.`}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, maxHeight: "48vh", overflow: "auto", paddingRight: 2 }}>
              {mapping.map((fk, ci) => (
                <div key={ci} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 10px", borderRadius: 10, background: fk ? t.tealBg : t.sub, border: `1px solid ${fk ? t.tealBd : t.line}` }}>
                  <div style={{ flex: "1 1 160px", minWidth: 0, fontSize: 12, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: t.lo, fontWeight: 700 }}>Kol {ci + 1}:</span> {grid[0]?.[ci] || <i style={{ color: t.lo }}>(kosong)</i>}
                  </div>
                  <select value={fk} onChange={(e) => setMapping((m) => m.map((x, idx) => (idx === ci ? e.target.value : x)))}
                    style={{ flex: "1 1 200px", minWidth: 170, padding: "7px 30px 7px 9px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 12.5, fontFamily: FF, cursor: "pointer", ...chevronBg(t.mid) }}>
                    <option value="">— abaikan —</option>
                    {IMPORT_COLS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button onClick={() => setStep("paste")} style={ghost(t)}>← Kembali</button>
              <button onClick={apply} style={solid(t, false)}>Tempel {grid.length - 1} baris</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const ghost = (t) => ({ padding: "9px 16px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FF });
const solid = (t, dis) => ({ padding: "9px 16px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 13, fontWeight: 800, cursor: dis ? "default" : "pointer", fontFamily: FF, opacity: dis ? 0.5 : 1 });
