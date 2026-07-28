"use client";
/**
 * SDP_BulkGrid.jsx — Fase 1
 * Grid editable (mirip spreadsheet) untuk registrasi SDP massal — jalur desktop
 * untuk CSE/PIC/SPM. Fitur:
 *  - Tempel dari Excel dengan dialog PEMETAAN KOLOM (header sumber → field kanonik).
 *  - Validasi inline (sel merah + alasan) via lib/sdp.
 *  - Kolom scope (circle/region) terkunci dari profil; branch dibatasi scope.
 *  - Bulan siklus 1 nilai untuk seluruh batch (sumber YYMM ID).
 *  - Simpan Draft (localStorage) & Kirim massal (hanya baris valid) — auto-generate
 *    SDP ID per baris via RPC, Hybrid → sepasang baris SDP/KSK.
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Plus, Trash2, ClipboardPaste, Save, Check, Loader2, AlertCircle, X,
} from "lucide-react";
import {
  SDP_LISTS, validateRegistrationRow, applyDerived, isHybridScope, isNewCreation, buildKecIndex,
} from "../../../lib/sdp";

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

// Kolom grid = field yang diisi manusia (kolom auto & HQ tidak ditampilkan).
const COLS = [
  { k: "brand", label: "Brand", enum: "brand", w: 90 },
  { k: "request_type", label: "Request Type", enum: "request_type", w: 130 },
  { k: "registration_scope", label: "Registration Scope", enum: "registration_scope", w: 150 },
  { k: "branch", label: "Branch", type: "branch", w: 140 },
  { k: "sdp_name", label: "SDP Name", w: 200 },
  { k: "partner_company_name", label: "Partner / Company", w: 200 },
  { k: "customer_legal_name", label: "Customer Legal Name", w: 200 },
  { k: "company_type", label: "Company Type", enum: "company_type", w: 140 },
  { k: "status_company", label: "Status Company", enum: "status_company", w: 130 },
  { k: "ktp_number", label: "KTP / NIK", w: 150 },
  { k: "npwp_number", label: "NPWP", w: 150 },
  { k: "kabupaten", label: "Kab/Kota", w: 140 },
  { k: "kecamatan_coverage", label: "Kecamatan Coverage", w: 170 },
  { k: "partner_territory", label: "Partner Territory", w: 150 },
  { k: "hybrid_type", label: "Hybrid Type", w: 130 },
  { k: "pairing_id", label: "Pairing ID", w: 140 },
  { k: "pic_name_partner", label: "PIC Name", w: 150 },
  { k: "pic_phone_number", label: "PIC Phone", w: 130 },
  { k: "pic_email_partner", label: "PIC Email", w: 180 },
  { k: "bank_name", label: "Bank Name", w: 140 },
  { k: "bank_account_number", label: "No. Rekening", w: 150 },
  { k: "bank_account_name", label: "Nama Rekening", w: 170 },
  { k: "commitment_fee_status", label: "Commitment Fee", enum: "commitment_fee_status", w: 150 },
  { k: "main_document_folder_link", label: "Folder Dokumen", w: 200 },
  { k: "remarks", label: "Remarks", w: 200 },
];

const DB_COLS = [
  "sdp_id_new", "pairing_id", "brand", "submission_month", "submission_date", "cycle_month",
  "request_type", "registration_scope", "circle", "region", "branch", "sdp_name",
  "partner_company_name", "customer_legal_name", "company_type", "status_company",
  "ktp_number", "npwp_number", "pic_name_partner", "pic_phone_number", "msisdn_master_trx",
  "pic_email_partner", "email_pic_ioh", "kabupaten", "kecamatan_coverage", "partner_territory",
  "bill_to_address", "ship_to_address", "kode_pos", "need_sap_creation", "need_oracle_creation",
  "hybrid_type", "cse_name", "cse_partner_id", "cse_number", "bank_name", "bank_branch_kcp",
  "bank_account_number", "bank_account_name", "commitment_fee_status", "main_document_folder_link",
  "branding_update_required", "branding_status", "remarks",
];

const uniq = (arr) => [...new Set(arr.filter((v) => v != null && String(v).trim() !== ""))].sort((a, b) => String(a).localeCompare(String(b)));
const emptyRow = () => ({});
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export default function SDP_BulkGrid({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role ?? "";
  const brandLock = role === "bsm" ? (profile?.bsm_brand || "") : "";
  const draftKey = `sdp_bulk_draft_${profile?.id || "anon"}`;

  const [combos, setCombos] = useState([]);
  const [territory, setTerritory] = useState([]);
  const [cycleMonth, setCycleMonth] = useState("");
  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  // Master geografi + Territory IOH (untuk dropdown Kecamatan/Kab).
  useEffect(() => {
    let on = true;
    (async () => {
      let tq = supabase.from("mf_territory").select("kec_id, mc_cluster, branch, region").eq("active", true);
      if (role === "cse_rse" && profile?.cluster) tq = tq.eq("mc_cluster", profile.cluster);
      else if (role === "bsm" && profile?.bsm_branch) tq = tq.eq("branch", profile.bsm_branch);
      else if (profile?.region) tq = tq.eq("region", profile.region);
      const [{ data: c }, { data: terr }] = await Promise.all([
        supabase.rpc("sdp_territory_combos"),
        tq.limit(20000),
      ]);
      if (!on) return;
      setCombos(c || []);
      setTerritory(terr || []);
    })();
    return () => { on = false; };
  }, [supabase, role, profile?.cluster, profile?.bsm_branch, profile?.region]);

  // Muat draft.
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && window.localStorage.getItem(draftKey);
      if (raw) { const p = JSON.parse(raw); if (p?.rows?.length) setRows(p.rows); if (p?.cycleMonth) setCycleMonth(p.cycleMonth); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const scopeFilter = useMemo(() => (r) => {
    if (role === "cse_rse" && profile?.cluster) return r.mc_cluster === profile.cluster;
    if (role === "bsm" && profile?.bsm_branch) return r.branch === profile.bsm_branch;
    if (profile?.region) return r.region === profile.region;
    return true;
  }, [role, profile?.cluster, profile?.bsm_branch, profile?.region]);

  const allowedBranches = useMemo(() => uniq(combos.filter(scopeFilter).map((r) => r.branch)), [combos, scopeFilter]);
  const kecIndex = useMemo(() => buildKecIndex(territory), [territory]);
  // Circle/region tetap dari profil (scope). Region ambil dari kombinasi jika kosong.
  const lockedRegion = profile?.region || uniq(combos.filter(scopeFilter).map((r) => r.region))[0] || "";

  const setCell = (i, k, v) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = () => setRows((p) => [...p, emptyRow()]);
  const delRow = (i) => setRows((p) => (p.length === 1 ? [emptyRow()] : p.filter((_, idx) => idx !== i)));

  // Bangun baris lengkap (isi scope + cycle) untuk validasi/simpan.
  const hydrate = (r) => ({
    ...r,
    brand: brandLock || r.brand,
    circle: "Sumatera",
    region: r.region || lockedRegion,
    cycle_month: cycleMonth,
    submission_month: cycleMonth,
  });

  const validity = useMemo(() => rows.map((r) => {
    const h = hydrate(r);
    const empty = COLS.every((c) => !h[c.k]);
    if (empty) return { skip: true, valid: false, errors: {} };
    const res = validateRegistrationRow(h);
    // Branch di luar scope → tolak.
    if (h.branch && allowedBranches.length && !allowedBranches.includes(h.branch)) {
      res.errors.branch = "Branch di luar wewenang Anda."; res.valid = false;
    }
    // Grid hanya untuk pembuatan baru; Update/Terminate lewat Form.
    if (h.request_type && !isNewCreation(h.request_type)) {
      res.errors.request_type = "Update/Terminate: pakai Form, bukan grid."; res.valid = false;
    }
    return { skip: false, ...res };
  }), [rows, cycleMonth, allowedBranches, lockedRegion, brandLock]);

  const stats = useMemo(() => {
    let valid = 0, invalid = 0, filled = 0;
    validity.forEach((v) => { if (v.skip) return; filled++; v.valid ? valid++ : invalid++; });
    return { valid, invalid, filled };
  }, [validity]);

  const saveDraft = () => {
    try { window.localStorage.setItem(draftKey, JSON.stringify({ rows, cycleMonth })); setMsg({ type: "ok", text: "Draft tersimpan di perangkat ini." }); }
    catch { setMsg({ type: "err", text: "Gagal menyimpan draft." }); }
  };

  // Tempel dari modal → set rows.
  const applyPaste = (mappedRows) => {
    setRows((p) => {
      const base = p.filter((r) => COLS.some((c) => r[c.k])); // buang baris kosong
      return [...base, ...mappedRows, emptyRow()];
    });
    setPasteOpen(false);
    setMsg({ type: "ok", text: `${mappedRows.length} baris ditempel. Periksa & lengkapi.` });
  };

  // Kirim massal.
  const submit = async () => {
    setMsg(null);
    if (!cycleMonth) { setMsg({ type: "err", text: "Isi Bulan Siklus dulu (di atas grid)." }); return; }
    const toSend = [];
    validity.forEach((v, i) => { if (!v.skip && v.valid) toSend.push(hydrate(rows[i])); });
    if (!toSend.length) { setMsg({ type: "err", text: "Tidak ada baris valid untuk dikirim." }); return; }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesi tidak ditemukan, login ulang.");

      const payloads = [];
      for (const row of toSend) {
        const genArgs = { p_brand: row.brand, p_scope: row.registration_scope, p_circle: row.circle, p_cycle_month: row.cycle_month };
        const { data: id1, error: e1 } = await supabase.rpc("generate_sdp_id", genArgs);
        if (e1) throw e1;
        let outRows = [{ ...row, sdp_id_new: id1 }];
        if (isHybridScope(row.registration_scope)) {
          const seq = parseInt(String(id1).slice(-2), 10);
          const otherBrand = String(row.brand).toUpperCase() === "IM3" ? "3ID" : "IM3";
          const { data: id2, error: e2 } = await supabase.rpc("generate_sdp_id", { ...genArgs, p_brand: otherBrand, p_seq: seq });
          if (e2) throw e2;
          outRows = [
            { ...row, sdp_id_new: id1, pairing_id: id2 },
            { ...row, brand: otherBrand, sdp_id_new: id2, pairing_id: id1 },
          ];
        }
        for (const r of outRows) {
          const r2 = applyDerived(r);
          const p = {};
          for (const k of DB_COLS) if (r2[k] !== undefined && r2[k] !== "") p[k] = r2[k];
          p.submitted_by = user.id;
          p.submitted_by_name = profile?.full_name || profile?.username || null;
          p.submitter_role = role;
          p.submitter_brand = r.brand || null;
          p.submitter_branch = profile?.bsm_branch || r.branch || null;
          p.submitter_cluster = profile?.cluster || null;
          p.submitter_region = r.region || null;
          p.status = "submitted";
          payloads.push(p);
        }
      }

      const { error } = await supabase.from("sdp_registration").insert(payloads);
      if (error) throw error;

      setMsg({ type: "ok", text: `${payloads.length} baris terkirim ke database.` });
      setRows([emptyRow()]);
      try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
    } catch (err) {
      setMsg({ type: "err", text: "Gagal mengirim: " + (err.message || err) });
    } finally { setSaving(false); }
  };

  const cell = (i, c) => {
    const err = validity[i]?.errors?.[c.k];
    const v = rows[i][c.k] ?? "";
    const base = {
      width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 6, fontSize: 12.5, fontFamily: FF,
      border: `1px solid ${err ? t.acc : "transparent"}`, background: err ? t.accBg : "transparent", color: t.hi, outline: "none",
    };
    if (c.enum) {
      const locked = c.k === "brand" && !!brandLock;
      return (
        <select value={locked ? brandLock : v} disabled={locked} title={err || ""} onChange={(e) => setCell(i, c.k, e.target.value)} style={{ ...base, cursor: locked ? "default" : "pointer" }}>
          <option value="">—</option>
          {(SDP_LISTS[c.enum] || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (c.type === "branch") {
      return (
        <select value={v} title={err || ""} onChange={(e) => setCell(i, c.k, e.target.value)} style={{ ...base, cursor: "pointer" }}>
          <option value="">—</option>
          {allowedBranches.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (c.k === "kabupaten") {
      return (
        <select value={v} title={err || ""} onChange={(e) => setCell(i, c.k, e.target.value)} style={{ ...base, cursor: "pointer" }}>
          <option value="">—</option>
          {kecIndex.kabupatens.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (c.k === "kecamatan_coverage") {
      const opts = kecIndex.kecamatanFor(rows[i].kabupaten);
      return (
        <select value={v} title={err || ""} onChange={(e) => { const kec = e.target.value; setRows((p) => p.map((r, idx) => (idx === i ? { ...r, kecamatan_coverage: kec, kabupaten: r.kabupaten || kecIndex.kabOf(kec) } : r))); }} style={{ ...base, cursor: "pointer" }}>
          <option value="">—</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
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

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>Registrasi SDP — Grid Massal</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>
            Tempel dari Excel atau isi manual. Circle <b>Sumatera</b>{lockedRegion ? ` · region ${lockedRegion}` : ""} terkunci; SDP ID otomatis saat kirim.
          </div>
        </div>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: t.mid }}>
          Bulan Siklus (target live)
          <input type="month" value={cycleMonth} onChange={(e) => setCycleMonth(e.target.value)}
            style={{ display: "block", marginTop: 4, padding: "8px 10px", borderRadius: 9, border: `1px solid ${cycleMonth ? t.line : t.acc}`, background: t.inp, color: t.hi, fontSize: 13, fontFamily: FF, outline: "none" }} />
        </label>
      </div>

      {/* Toolbar */}
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

      {/* Grid */}
      <div style={{ overflow: "auto", border: `1px solid ${t.line}`, borderRadius: 12, background: t.card, boxShadow: t.sm, maxHeight: "60vh" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 1400, width: "100%" }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, left: 0, zIndex: 3, background: t.head, padding: "8px 6px", fontSize: 11, fontWeight: 800, color: t.mid, width: 40, borderBottom: `1px solid ${t.line}` }}>#</th>
              {COLS.map((c) => (
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
                  {COLS.map((c) => (
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

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={submit} disabled={saving || !stats.valid} data-primary
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 11, border: "none", cursor: (saving || !stats.valid) ? "default" : "pointer", fontFamily: FF, fontSize: 14, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg, ${t.acc} 0%, ${t.mag} 100%)`, opacity: (saving || !stats.valid) ? 0.55 : 1 }}>
          {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />} Kirim {stats.valid ? `${stats.valid} baris` : ""}
        </button>
      </div>

      {pasteOpen && <PasteModal t={t} onClose={() => setPasteOpen(false)} onApply={applyPaste} />}
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

// ── Modal Tempel + Pemetaan Kolom ───────────────────────────────────────────────
function PasteModal({ t, onClose, onApply }) {
  const [text, setText] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [step, setStep] = useState("paste"); // paste | map
  const [grid, setGrid] = useState([]);       // 2D array sumber
  const [mapping, setMapping] = useState([]); // index kolom sumber → field key ("" = abaikan)

  const parse = () => {
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) return;
    const g = lines.map((l) => l.split("\t"));
    setGrid(g);
    // auto-map berdasarkan header (jika ada) atau urutan kolom grid
    const width = Math.max(...g.map((r) => r.length));
    const header = hasHeader ? g[0] : null;
    const guess = [];
    for (let ci = 0; ci < width; ci++) {
      let found = "";
      if (header && header[ci]) {
        const h = norm(header[ci]);
        const hit = COLS.find((c) => norm(c.label) === h || norm(c.k) === h || norm(c.label).includes(h) || h.includes(norm(c.k)));
        if (hit) found = hit.k;
      }
      if (!found && !header && COLS[ci]) found = COLS[ci].k; // tanpa header → posisi
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

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.md, width: "min(760px, 96vw)", maxHeight: "88vh", overflow: "auto", padding: 22, fontFamily: FF, color: t.hi }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Tempel dari Excel</div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: t.mid }}><X size={18} /></button>
        </div>

        {step === "paste" ? (
          <>
            <div style={{ fontSize: 12.5, color: t.mid, marginBottom: 8 }}>Salin blok sel dari Excel (Ctrl+C), lalu tempel (Ctrl+V) di kotak di bawah.</div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder="Tempel di sini…"
              style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 10, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 12.5, fontFamily: "monospace", outline: "none", resize: "vertical" }} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: t.mid, margin: "10px 0" }}>
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> Baris pertama adalah header kolom
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={onClose} style={ghost(t)}>Batal</button>
              <button onClick={parse} disabled={!text.trim()} style={solid(t, !text.trim())}>Lanjut: Petakan Kolom</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: t.mid, marginBottom: 12 }}>Cocokkan tiap kolom sumber ke field SDP. Kolom yang di-set “— abaikan —” tidak ditempel.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {mapping.map((fk, ci) => (
                <div key={ci} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 12, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: t.lo }}>Kol {ci + 1}:</span> {hasHeader && grid[0]?.[ci] ? grid[0][ci] : <i style={{ color: t.lo }}>(contoh: {grid[hasHeader ? 1 : 0]?.[ci] ?? "—"})</i>}
                  </div>
                  <select value={fk} onChange={(e) => setMapping((m) => m.map((x, idx) => (idx === ci ? e.target.value : x)))}
                    style={{ width: 220, padding: "7px 9px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 12.5, fontFamily: FF, cursor: "pointer" }}>
                    <option value="">— abaikan —</option>
                    {COLS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
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
  );
}

const ghost = (t) => ({ padding: "9px 16px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FF });
const solid = (t, dis) => ({ padding: "9px 16px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 13, fontWeight: 800, cursor: dis ? "default" : "pointer", fontFamily: FF, opacity: dis ? 0.5 : 1 });
