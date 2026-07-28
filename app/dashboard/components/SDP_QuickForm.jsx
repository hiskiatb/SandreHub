"use client";
/**
 * SDP_QuickForm.jsx — Fase 1
 * Form registrasi SDP per-satu, mobile-first, sebagai jalur utama CSE.
 * - Geo terkunci dari profil (scope cluster/branch).
 * - Validasi inline via lib/sdp.
 * - SDP ID di-generate otomatis via RPC generate_sdp_id (§10A);
 *   Hybrid IM3+3ID → dua baris berpasangan (SDP + KSK, seq sama).
 * - Insert mengisi submitted_by = auth.uid() (syarat RLS sdp_registration).
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Check, Loader2, AlertCircle, MapPin, CalendarDays,
  Building2, Users, ClipboardCheck, Sparkles, Info, ChevronDown, ChevronRight, ChevronLeft, Save, AlertTriangle, Store, Truck, Home, Link2,
} from "lucide-react";
import {
  SDP_LISTS, validateRegistrationRow, applyDerived,
  previewSdpId, isHybridScope, masterToPrefill, isNewCreation, dedupeSdps, buildKecIndex,
} from "../../../lib/sdp";
import SDP_MapPicker from "./SDP_MapPicker";
import SDP_SearchSelect from "./SDP_SearchSelect";
import SDP_AddressSearch from "./SDP_AddressSearch";

const mk = (d) => ({
  bg: d ? "#0D0D0F" : "#F2F4F7", card: d ? "#17171B" : "#FFFFFF",
  sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  inp: d ? "#111114" : "#FFFFFF",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  mag: "#C6168D", magBg: d ? "rgba(198,22,141,.12)" : "rgba(198,22,141,.07)", magBd: d ? "rgba(198,22,141,.3)" : "rgba(198,22,141,.18)",
  acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)",
  ok: "#22C55E", okBg: d ? "rgba(34,197,94,.12)" : "rgba(22,163,74,.08)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md: d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const GEOCOL = { circle: "circle", region: "region", branch: "branch" };

// Kolom nyata di tabel sdp_registration yang boleh di-insert dari form.
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
  "latitude", "longitude", "latitude_gudang", "longitude_gudang",
];

// Wizard bertahap — tiap langkah berisi sekelompok field. Kolom auto/HQ disembunyikan.
const STEPS = [
  { id: "jenis", title: "Jenis Pengajuan", icon: ClipboardCheck, intro: true, hint: "Pilih jenis pengajuan dulu — ini menentukan apakah perlu memilih SDP existing.",
    fields: [["request_type","Request Type","enum:request_type"],["registration_scope","Registration Scope","enum:registration_scope"],
             ["cycle_month","Bulan Siklus (target live)","month"],["submission_date","Tanggal Submit","date"],
             ["pairing_id","Pairing ID (auto jika Hybrid)"],["hybrid_type","Hybrid Type","enum:hybrid_type"]] },
  { id: "wilayah", title: "Wilayah & Brand", icon: MapPin, hint: "Scope wilayah & brand — dasar pembentukan SDP ID.",
    fields: [["brand","Brand","enum:brand"],["circle","Circle","geo"],["region","Region","geo"],["branch","Branch","geo"],
             ["kabupaten","Kab/Kota"],["kecamatan_coverage","Kecamatan Coverage"],["partner_territory","Partner Territory"],["sdp_name","SDP Name"]] },
  { id: "partner", title: "Data Partner", icon: Building2, hint: "Identitas & legalitas partner.",
    fields: [["partner_company_name","Partner / Company Name"],["customer_legal_name","Customer Legal Name"],
             ["company_type","Company Type","enum:company_type"],["status_company","Status Company","enum:status_company"],
             ["ktp_number","KTP / NIK"],["npwp_number","NPWP"]] },
  { id: "lokasi", title: "Lokasi & Alamat", icon: MapPin, hint: "Alamat & titik lokasi SDP di peta.", custom: true,
    fields: [["bill_to_address"],["ship_to_address"],["kode_pos"]] },
  { id: "kontak", title: "Kontak & Bank", icon: Users, hint: "PIC, CSE, dan rekening bank.",
    fields: [["pic_name_partner","PIC Name Partner"],["pic_phone_number","PIC Phone"],["msisdn_master_trx","MSISDN Master TRX"],
             ["pic_email_partner","Email PIC Partner"],["email_pic_ioh","Email PIC IOH"],["cse_name","CSE Name"],["cse_number","CSE Number"],
             ["bank_name","Bank Name"],["bank_branch_kcp","Bank Branch / KCP"],["bank_account_number","No. Rekening"],
             ["bank_account_name","Nama Rekening"],["commitment_fee_status","Commitment Fee Status","enum:commitment_fee_status"]] },
  { id: "review", title: "Dokumen & Kirim", icon: ClipboardCheck, hint: "Lampirkan dokumen, tinjau ringkasan, lalu kirim.", review: true,
    fields: [["main_document_folder_link","Link Folder OneDrive (Dokumen Partner)","link"],["remarks","Remarks","area"]] },
];
// Peta field → indeks step, agar submit bisa melompat ke step yang errornya.
const FIELD_STEP = {};
STEPS.forEach((s, i) => (s.fields || []).forEach(([k]) => { FIELD_STEP[k] = i; }));

const uniq = (arr) => [...new Set(arr.filter((v) => v != null && String(v).trim() !== ""))].sort((a, b) => String(a).localeCompare(String(b)));

export default function SDP_QuickForm({ supabase, theme = "dark", profile, onExit, initialDraft = null }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role ?? "";
  const brandLock = role === "bsm" ? (profile?.bsm_brand || "") : "";
  // Aksen "gudang" (amber) — sengaja beda tegas dari kartu SDP (teal) agar tak tertukar.
  const AMBER_BG = d ? "rgba(255,176,32,0.13)" : "rgba(255,176,32,0.11)";
  const AMBER_BD = d ? "rgba(255,176,32,0.34)" : "rgba(255,176,32,0.40)";
  const AMBER_FG = d ? "#FFC24B" : "#B7791F";

  const [combos, setCombos] = useState([]);
  const [sdps, setSdps] = useState([]);
  const [territory, setTerritory] = useState([]);
  const [existingSdpId, setExistingSdpId] = useState("");
  const [loadingMaster, setLoadingMaster] = useState(true);
  const [val, setVal] = useState({
    brand: brandLock || "", submission_date: new Date().toISOString().slice(0, 10),
    circle: "Sumatera", region: profile?.region || "",
    cse_name: profile?.full_name || profile?.username || "", email_pic_ioh: profile?.email || "",
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sameGudang, setSameGudang] = useState(true);
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const draftKey = `sdp_quickform_draft_${profile?.id || "anon"}`;
  // Draft server + berbagi link
  const [serverDraftId, setServerDraftId] = useState(initialDraft?.id || null);
  const [serverToken, setServerToken] = useState(initialDraft?.token || null);
  const [shareDays, setShareDays] = useState(2);
  const [sharedInfo, setSharedInfo] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);

  const set = (k, v) => { setVal((p) => ({ ...p, [k]: v })); setDirty(true); };

  // ── Draft (localStorage) & proteksi perubahan belum tersimpan ────────────────
  const saveDraft = (silent = false) => {
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ val, step, existingSdpId, sameGudang, ts: Date.now() }));
      setDirty(false);
      if (!silent) setMsg({ type: "ok", text: "Draft tersimpan di perangkat ini." });
    } catch { if (!silent) setMsg({ type: "err", text: "Gagal menyimpan draft." }); }
  };
  const handleLeave = () => { if (dirty) setConfirmLeave(true); else onExit(); };
  const discardAndExit = () => { try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ } setConfirmLeave(false); onExit(); };
  const saveAndExit = () => { saveDraft(true); setConfirmLeave(false); onExit(); };

  // ── Draft SERVER (sdp_draft) + Bagikan Link ─────────────────────────────────
  const buildDraftRow = () => ({
    created_by_name: profile?.full_name || profile?.username || null,
    submitter_role: role,
    submitter_cluster: profile?.cluster || null,
    submitter_branch: profile?.bsm_branch || val.branch || null,
    submitter_brand: brandLock || val.brand || null,
    submitter_region: val.region || null,
    label: val.sdp_name || val.partner_company_name || null,
    payload: { ...val, __existingSdpId: existingSdpId, __sameGudang: sameGudang },
    updated_at: new Date().toISOString(),
  });
  const saveServerDraft = async () => {
    setSavingDraft(true); setMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesi tidak ditemukan.");
      const row = buildDraftRow();
      let id = serverDraftId;
      if (id) {
        const { error } = await supabase.from("sdp_draft").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("sdp_draft").insert({ ...row, created_by: user.id, status: "draft" }).select("id, token").single();
        if (error) throw error;
        id = data.id; setServerDraftId(id); setServerToken(data.token);
      }
      setDirty(false);
      setMsg({ type: "ok", text: "Draft tersimpan di server." });
      return id;
    } catch (e) { setMsg({ type: "err", text: "Gagal simpan draft: " + (e.message || e) }); return null; }
    finally { setSavingDraft(false); }
  };
  const shareLink = async () => {
    const id = await saveServerDraft();
    if (!id) return;
    try {
      const expires = new Date(Date.now() + shareDays * 864e5).toISOString();
      const { data, error } = await supabase.from("sdp_draft").update({ shared: true, status: "assigned", expires_at: expires }).eq("id", id).select("token, expires_at").single();
      if (error) throw error;
      const url = (typeof window !== "undefined" ? window.location.origin : "") + "/isi/" + data.token;
      setServerToken(data.token);
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      setSharedInfo({ url, expires_at: data.expires_at });
      setMsg({ type: "ok", text: `Link disalin — berlaku ${shareDays} hari.` });
    } catch (e) { setMsg({ type: "err", text: "Gagal membuat link: " + (e.message || e) }); }
  };

  // Muat draft dari inbox (prioritas di atas localStorage).
  useEffect(() => {
    if (!initialDraft?.payload) return;
    const p = { ...initialDraft.payload };
    const ex = p.__existingSdpId; const sg = p.__sameGudang;
    delete p.__existingSdpId; delete p.__sameGudang;
    setVal(p);
    if (ex) setExistingSdpId(ex);
    if (typeof sg === "boolean") setSameGudang(sg);
    setServerDraftId(initialDraft.id); setServerToken(initialDraft.token || null);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft?.id]);

  // Muat draft yang tersimpan saat pertama membuka form (dilewati bila buka dari inbox).
  useEffect(() => {
    if (initialDraft?.id) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const dft = JSON.parse(raw);
        if (dft?.val) {
          setVal(dft.val);
          if (typeof dft.step === "number") setStep(dft.step);
          if (dft.existingSdpId) setExistingSdpId(dft.existingSdpId);
          if (typeof dft.sameGudang === "boolean") setSameGudang(dft.sameGudang);
          setDirty(false);
          setMsg({ type: "ok", text: "Draft sebelumnya dimuat." });
        }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Peringatkan saat refresh / menutup tab bila ada perubahan belum tersimpan.
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const lblStyle = { fontSize: 11, fontWeight: 700, color: t.mid, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" };
  const inStyle = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 14, fontFamily: FF, outline: "none" };

  // Master geografi + SDP existing (scope per role).
  useEffect(() => {
    let on = true;
    (async () => {
      setLoadingMaster(true);
      let sq = supabase.from("sdp_master")
        .select("sdp_id, sdp_name, sdp_type, pt_name, region, branch, area, cluster")
        .order("period", { ascending: false });
      if (role === "cse_rse" && profile?.cluster) sq = sq.eq("cluster", profile.cluster);
      else if (role === "bsm" && profile?.bsm_branch) sq = sq.eq("branch", profile.bsm_branch);
      else if (profile?.region) sq = sq.eq("region", profile.region);

      // Territory IOH → dropdown Kecamatan/Kab (scope per role).
      let tq = supabase.from("mf_territory").select("kec_id, mc_cluster, branch, region").eq("active", true);
      if (role === "cse_rse" && profile?.cluster) tq = tq.eq("mc_cluster", profile.cluster);
      else if (role === "bsm" && profile?.bsm_branch) tq = tq.eq("branch", profile.bsm_branch);
      else if (profile?.region) tq = tq.eq("region", profile.region);

      const [{ data: c }, { data: s }, { data: terr }] = await Promise.all([
        supabase.rpc("sdp_territory_combos"),
        sq.limit(5000),
        tq.limit(20000),
      ]);
      if (!on) return;
      setCombos(c || []);
      setSdps(dedupeSdps(s || []));
      setTerritory(terr || []);
      setLoadingMaster(false);
    })();
    return () => { on = false; };
  }, [supabase, role, profile?.cluster, profile?.bsm_branch, profile?.region]);

  // Pilih SDP existing → prefill field yang tersedia (untuk Update/Terminate/Remapping).
  const pickExisting = (sdpId) => {
    setExistingSdpId(sdpId);
    setDirty(true);
    const m = sdps.find((x) => String(x.sdp_id) === String(sdpId));
    if (!m) return;
    setVal((p) => ({
      ...p,
      ...masterToPrefill(m),
      request_type: isNewCreation(p.request_type) && !p.request_type ? "Update" : p.request_type,
    }));
  };

  const scopeFilter = useMemo(() => (r) => {
    if (role === "cse_rse" && profile?.cluster) return r.mc_cluster === profile.cluster;
    if (role === "bsm" && profile?.bsm_branch) return r.branch === profile.bsm_branch;
    if (profile?.region) return r.region === profile.region;
    return true;
  }, [role, profile?.cluster, profile?.bsm_branch, profile?.region]);

  const geoOptions = (field) => {
    const rows = combos.filter(scopeFilter).filter((r) => {
      for (const g of ["circle", "region", "branch"]) {
        if (g === field) continue;
        if (val[g] && r[GEOCOL[g]] !== val[g]) return false;
      }
      return true;
    });
    return uniq(rows.map((r) => r[GEOCOL[field]]));
  };

  // Auto-lock geo yang hanya punya 1 opsi.
  useEffect(() => {
    let changed = false; const next = { ...val };
    for (const g of ["circle", "region", "branch"]) {
      const opts = geoOptions(g);
      if (opts.length === 1 && next[g] !== opts[0]) { next[g] = opts[0]; changed = true; }
    }
    if (changed) setVal(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combos, val.circle, val.region, val.branch]);

  // Kunci brand BSM.
  useEffect(() => { if (brandLock && val.brand !== brandLock) set("brand", brandLock); /* eslint-disable-next-line */ }, [brandLock]);

  // Jenis pembuatan baru → tak perlu SDP existing; bersihkan pilihan lama.
  useEffect(() => { if (isNewCreation(val.request_type)) setExistingSdpId(""); }, [val.request_type]);

  const kecIndex = useMemo(() => buildKecIndex(territory), [territory]);

  const willGenerate = isNewCreation(val.request_type);
  const idPreview = willGenerate
    ? previewSdpId({ ...val, submission_month: val.cycle_month })
    : (existingSdpId || null);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async () => {
    setMsg(null);
    const row = { ...val, submission_month: val.cycle_month || val.submission_month };
    // Gudang sama dengan SDP → salin alamat & koordinat.
    if (sameGudang) { row.ship_to_address = row.bill_to_address || null; row.latitude_gudang = row.latitude ?? null; row.longitude_gudang = row.longitude ?? null; }
    const { valid, errors: errs } = validateRegistrationRow(row);
    setErrors(errs);
    if (!valid) {
      const firstKey = Object.keys(errs)[0];
      if (firstKey != null && FIELD_STEP[firstKey] != null) setStep(FIELD_STEP[firstKey]);
      setMsg({ type: "err", text: "Ada kolom wajib yang belum benar — cek tanda merah." });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesi tidak ditemukan, silakan login ulang.");

      let rows;
      if (isNewCreation(row.request_type)) {
        // Buat SDP baru → generate ID (+ pasangan Hybrid dengan seq sama).
        const genArgs = { p_brand: row.brand, p_scope: row.registration_scope, p_circle: row.circle, p_cycle_month: row.submission_month };
        const { data: id1, error: e1 } = await supabase.rpc("generate_sdp_id", genArgs);
        if (e1) throw e1;
        rows = [{ ...row, sdp_id_new: id1 }];
        if (isHybridScope(row.registration_scope)) {
          const seq = parseInt(String(id1).slice(-2), 10);
          const otherBrand = String(row.brand).toUpperCase() === "IM3" ? "3ID" : "IM3";
          const { data: id2, error: e2 } = await supabase.rpc("generate_sdp_id", { ...genArgs, p_brand: otherBrand, p_seq: seq });
          if (e2) throw e2;
          rows = [
            { ...row, brand: row.brand, sdp_id_new: id1, pairing_id: id2 },
            { ...row, brand: otherBrand, sdp_id_new: id2, pairing_id: id1 },
          ];
        }
      } else {
        // Update/Terminate/Remapping → pakai ID SDP existing (tidak generate baru).
        if (!existingSdpId) throw new Error("Pilih SDP existing dulu untuk Update/Terminate/Remapping.");
        rows = [{ ...row, sdp_id_new: existingSdpId }];
      }

      const payloads = rows.map((r) => {
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
        return p;
      });

      const { error } = await supabase.from("sdp_registration").insert(payloads);
      if (error) throw error;

      // Bila berasal dari draft server → tandai finalized (keluar dari inbox Draft & Link).
      if (serverDraftId) {
        try { await supabase.from("sdp_draft").update({ status: "finalized", finalized_at: new Date().toISOString() }).eq("id", serverDraftId); } catch { /* ignore */ }
        setServerDraftId(null); setServerToken(null); setSharedInfo(null);
      }

      const ids = rows.map((r) => r.sdp_id_new).join(" & ");
      setMsg({ type: "ok", text: `Tersimpan. SDP ID: ${ids}` });
      // Reset sebagian (pertahankan geo & identitas submitter).
      setVal((p) => ({
        brand: brandLock || "", submission_date: new Date().toISOString().slice(0, 10),
        circle: p.circle, region: p.region, branch: p.branch, cycle_month: p.cycle_month,
        cse_name: p.cse_name, email_pic_ioh: p.email_pic_ioh,
      }));
      setErrors({});
      setStep(0);
      setDirty(false);
      try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
    } catch (err) {
      setMsg({ type: "err", text: "Gagal menyimpan: " + (err.message || err) });
    } finally { setSaving(false); }
  };

  // Render satu field sebagai sel grid; area/link membentang penuh.
  const renderField = ([k, label, type]) => {
    const full = type === "area" || type === "link";
    const wrap = (node) => <div key={k} style={{ gridColumn: full ? "1 / -1" : "auto", minWidth: 0 }}>{node}</div>;
    if (k === "kabupaten") return wrap(
      <label style={{ display: "block" }}>
        <div style={lblStyle}>{label}</div>
        <SDP_SearchSelect t={t} value={val.kabupaten ?? ""} options={kecIndex.kabupatens}
          onChange={(v) => { setVal((p) => ({ ...p, kabupaten: v })); setDirty(true); }}
          placeholder="— pilih Kab/Kota —" searchPlaceholder="Cari kab/kota…" />
      </label>);
    if (k === "kecamatan_coverage") return wrap(
      <label style={{ display: "block" }}>
        <div style={lblStyle}>{label} <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, color: t.lo }}>· bisa banyak</span></div>
        <SDP_SearchSelect t={t} multi value={val.kecamatan_coverage ?? ""} options={kecIndex.kecamatanFor(val.kabupaten)}
          onChange={(v) => { setVal((p) => { const first = v.split(",")[0]?.trim(); return { ...p, kecamatan_coverage: v, kabupaten: p.kabupaten || (first ? kecIndex.kabOf(first) : "") }; }); setDirty(true); }}
          placeholder="— pilih kecamatan —" searchPlaceholder="Cari kecamatan…" />
      </label>);
    return wrap(
      <Field k={k} label={label} type={type} t={t} value={val[k] ?? ""}
        err={errors[k]} onChange={(v) => set(k, v)} options={null}
        geoOpts={type === "geo" ? geoOptions(k) : null}
        brandLock={k === "brand" ? brandLock : ""} />);
  };

  const cur = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div style={{ fontFamily: FF, color: t.hi, maxWidth: 880, margin: "0 auto", paddingBottom: 8 }}>
      {/* Header + SDP ID chip */}
      <button onClick={handleLeave} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}>
        <ArrowLeft size={15} /> Kembali
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>Registrasi &amp; Perubahan SDP</div>
          <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>Isi bertahap{profile?.cluster ? ` · cluster ${profile.cluster}` : profile?.region ? ` · region ${profile.region}` : ""}.</div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 10, background: t.tealBg, border: `1px solid ${t.tealBd}`, color: t.tealD, fontSize: 12.5, fontWeight: 800 }}>
          <Sparkles size={14} /> {willGenerate ? "SDP ID" : "SDP ID (existing)"}: <span style={{ fontFamily: "monospace" }}>{idPreview || "—"}</span>{willGenerate && isHybridScope(val.registration_scope) && idPreview ? " +KSK" : ""}
        </div>
      </div>

      {/* Toolbar: simpan ke server & bagikan link (expiring) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button onClick={saveServerDraft} disabled={savingDraft}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontFamily: FF, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          {savingDraft ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Simpan ke server
        </button>
        <span style={{ width: 1, height: 22, background: t.line }} />
        <span style={{ fontSize: 12, color: t.mid }}>Bagikan link, berlaku</span>
        <div style={{ position: "relative" }}>
          <select value={shareDays} onChange={(e) => setShareDays(+e.target.value)}
            style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", fontFamily: FF, fontSize: 12.5, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.line}`, borderRadius: 9, padding: "8px 26px 8px 10px", cursor: "pointer" }}>
            {[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n} hari</option>)}
          </select>
          <ChevronDown size={13} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
        </div>
        <button onClick={shareLink}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "none", background: t.mag, color: "#fff", fontFamily: FF, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
          <Link2 size={14} /> Bagikan &amp; Salin
        </button>
      </div>
      {sharedInfo && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 10, marginBottom: 14, background: t.magBg, border: `1px solid ${t.magBd}`, fontSize: 12, color: t.hi, flexWrap: "wrap" }}>
          <Link2 size={14} color={t.mag} />
          <span style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{sharedInfo.url}</span>
          <span style={{ color: t.mid }}>· berlaku sampai {new Date(sharedInfo.expires_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      )}

      {/* Stepper */}
      <div className="wz-steps">
        {STEPS.map((s, i) => {
          const done = i < step, active = i === step;
          const StepIcon = s.icon;
          return (
            <React.Fragment key={s.id}>
              <button onClick={() => setStep(i)} className="wz-step" title={s.title} aria-label={s.title}>
                <span className={`wz-dot${active ? " active" : done ? " done" : ""}`}>
                  {done ? <Check size={17} strokeWidth={3.25} className="wz-check" /> : <StepIcon size={14} />}
                </span>
                {active && <span className="wz-steplabel">{s.title}</span>}
              </button>
              {i < STEPS.length - 1 && <span className="wz-line"><i style={{ width: done ? "100%" : "0%" }} /></span>}
            </React.Fragment>
          );
        })}
      </div>

      {/* Kartu konten langkah */}
      <div key={step} className="sdp-fade" style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 20, boxShadow: t.sm }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: t.tealBg, border: `1px solid ${t.tealBd}`, color: t.tealD, display: "flex", alignItems: "center", justifyContent: "center" }}><cur.icon size={17} /></span>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>{cur.title}</div>
            <div style={{ fontSize: 12, color: t.mid, marginTop: 1 }}>{cur.hint}</div>
          </div>
        </div>

        {loadingMaster && step === 0 && <div style={{ fontSize: 12.5, color: t.mid, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={14} className="spin" /> Memuat master wilayah…</div>}

        {cur.intro ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Request Type sebagai pilihan besar */}
            <div>
              <div style={lblStyle}>Mau melakukan apa?</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SDP_LISTS.request_type.map((rt) => {
                  const on = val.request_type === rt;
                  return (
                    <button key={rt} type="button" onClick={() => set("request_type", rt)}
                      style={{ padding: "11px 18px", borderRadius: 11, cursor: "pointer", fontFamily: FF, fontSize: 14, fontWeight: 700,
                        border: `1.5px solid ${on ? t.acc : t.line}`, background: on ? t.accBg : t.inp, color: on ? t.acc : t.hi, transition: "all .16s ease" }}>
                      {rt}
                    </button>
                  );
                })}
              </div>
              {errors.request_type && <div style={{ fontSize: 11.5, color: t.acc, marginTop: 7 }}>{errors.request_type}</div>}
            </div>

            {/* Kontekstual — mengalir ke bawah sesuai jenis */}
            {val.request_type && (isNewCreation(val.request_type) ? (
              <div className="sdp-fade" style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", borderRadius: 12, background: t.tealBg, border: `1px solid ${t.tealBd}`, color: t.tealD, fontSize: 13, fontWeight: 700 }}>
                <Sparkles size={15} /> SDP baru — ID dibuat otomatis: <span style={{ fontFamily: "monospace" }}>{idPreview || "lengkapi Brand & Bulan Siklus"}</span>{isHybridScope(val.registration_scope) && idPreview ? " (+ pasangan KSK/SDP)" : ""}
              </div>
            ) : (
              <div style={{ padding: 14, borderRadius: 12, background: t.magBg, border: `1px solid ${t.magBd}`, position: "relative", zIndex: 5 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: t.mag, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.03em" }}>Pilih SDP yang akan di-{String(val.request_type).toLowerCase()} · wajib</div>
                <SDP_SearchSelect t={t}
                  value={existingSdpId ? ((sdps.find((s) => String(s.sdp_id) === String(existingSdpId)) || {}).sdp_name ? `${existingSdpId} · ${sdps.find((s) => String(s.sdp_id) === String(existingSdpId)).sdp_name}` : existingSdpId) : ""}
                  options={sdps.map((s) => `${s.sdp_id} · ${s.sdp_name}`)}
                  onChange={(v) => pickExisting(String(v).split(" · ")[0])}
                  placeholder="— cari & pilih SDP —" searchPlaceholder="Cari SDP ID / nama…" />
                {existingSdpId && <div style={{ fontSize: 11.5, color: t.mid, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}><Check size={13} color={t.ok} /> Data nama, partner &amp; wilayah terisi dari master — lanjut ke langkah berikut.</div>}
              </div>
            ))}

            {/* Scope, Hybrid & periode — field Hybrid muncul hanya bila scope Hybrid */}
            <div className="wz-grid">
              {cur.fields
                .filter(([k]) => k !== "request_type" && !(["pairing_id", "hybrid_type"].includes(k) && !isHybridScope(val.registration_scope)))
                .map(renderField)}
            </div>
          </div>
        ) : cur.custom ? (
          <div className="wz-loc">
            {/* Panel A — Alamat SDP (Bill To) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, border: `1px solid ${t.line}`, borderRadius: 12, padding: 14, background: t.sub }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: t.tealBg, border: `1px solid ${t.tealBd}`, color: t.tealD, display: "flex", alignItems: "center", justifyContent: "center" }}><Home size={15} /></span>
                <div><div style={{ fontSize: 13.5, fontWeight: 800 }}>Alamat SDP</div><div style={{ fontSize: 11, color: t.mid }}>Alamat & titik utama SDP · kolom HQ “Bill To”</div></div>
              </div>
              <div>
                <div style={lblStyle}>Cari alamat / tempat</div>
                <SDP_AddressSearch t={t} supabase={supabase} onSelect={(r) => {
                  setVal((p) => ({ ...p, bill_to_address: r.display || p.bill_to_address, kode_pos: (r.address && r.address.postcode) || p.kode_pos, latitude: r.lat, longitude: r.lon }));
                  setDirty(true);
                }} />
              </div>
              <SDP_MapPicker t={t} supabase={supabase} lat={val.latitude ?? null} lng={val.longitude ?? null} height={200}
                onChange={(la, ln) => { setVal((p) => ({ ...p, latitude: la, longitude: ln })); setDirty(true); }}
                onAddress={({ display, address }) => setVal((p) => ({ ...p, bill_to_address: p.bill_to_address || display, kode_pos: p.kode_pos || (address && address.postcode) || "" }))} />
              <label style={{ display: "block" }}>
                <div style={lblStyle}>Detail Alamat SDP</div>
                <textarea value={val.bill_to_address ?? ""} onChange={(e) => { set("bill_to_address", e.target.value); setDirty(true); }} rows={3} placeholder="Terisi dari pencarian/peta — bisa diedit" style={{ ...inStyle, resize: "vertical", background: t.inp }} />
              </label>
              <label style={{ display: "block", maxWidth: 200 }}>
                <div style={lblStyle}>Kode Pos</div>
                <input value={val.kode_pos ?? ""} onChange={(e) => { set("kode_pos", e.target.value); setDirty(true); }} inputMode="numeric" style={{ ...inStyle, background: t.inp }} />
              </label>
            </div>

            {/* Panel B — Alamat Pengiriman (Ship To) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, border: `1px solid ${t.line}`, borderRadius: 12, padding: 14, background: t.sub }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: t.magBg, border: `1px solid ${t.magBd}`, color: t.mag, display: "flex", alignItems: "center", justifyContent: "center" }}><Truck size={15} /></span>
                <div><div style={{ fontSize: 13.5, fontWeight: 800 }}>Alamat Pengiriman</div><div style={{ fontSize: 11, color: t.mid }}>Tujuan kirim barang · kolom HQ “Ship To”</div></div>
              </div>
              <div onClick={() => { setSameGudang((s) => !s); setDirty(true); }} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, border: `1.5px solid ${sameGudang ? t.acc : t.line}`, background: sameGudang ? t.acc : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{sameGudang && <Check size={14} color="#fff" />}</div>
                <span style={{ fontSize: 13, color: t.hi, fontWeight: 600 }}>Sama dengan alamat SDP</span>
              </div>
              {sameGudang ? (
                <div style={{ padding: "14px 14px", borderRadius: 10, background: t.card, border: `1px dashed ${t.line}`, fontSize: 12.5, color: t.mid, lineHeight: 1.55 }}>
                  Alamat & titik pengiriman <b>mengikuti Alamat SDP</b>. Matikan centang bila barang dikirim ke alamat berbeda (mis. gudang).
                </div>
              ) : (
                <>
                  <div>
                    <div style={lblStyle}>Cari alamat pengiriman</div>
                    <SDP_AddressSearch t={t} supabase={supabase} onSelect={(r) => {
                      setVal((p) => ({ ...p, ship_to_address: r.display || p.ship_to_address, latitude_gudang: r.lat, longitude_gudang: r.lon }));
                      setDirty(true);
                    }} />
                  </div>
                  <SDP_MapPicker t={t} supabase={supabase} lat={val.latitude_gudang ?? null} lng={val.longitude_gudang ?? null} height={200}
                    onChange={(la, ln) => { setVal((p) => ({ ...p, latitude_gudang: la, longitude_gudang: ln })); setDirty(true); }}
                    onAddress={({ display }) => setVal((p) => ({ ...p, ship_to_address: p.ship_to_address || display }))} />
                  <label style={{ display: "block" }}>
                    <div style={lblStyle}>Detail Alamat Pengiriman</div>
                    <textarea value={val.ship_to_address ?? ""} onChange={(e) => { set("ship_to_address", e.target.value); setDirty(true); }} rows={3} placeholder="Terisi dari pencarian/peta — bisa diedit" style={{ ...inStyle, resize: "vertical", background: t.inp }} />
                  </label>
                </>
              )}
            </div>
          </div>
        ) : cur.review ? (
          <>
            <div style={{ background: t.sub, border: `1px solid ${t.line}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Ringkasan</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px,1fr))", gap: "10px 18px" }}>
                {[
                  ["SDP ID", idPreview || "—"],
                  ["Brand", val.brand || "—"],
                  ["Request Type", val.request_type || "—"],
                  ["Scope", val.registration_scope || "—"],
                  ["Wilayah", [val.branch, val.region].filter(Boolean).join(" · ") || "—"],
                  ["Kab/Kota", val.kabupaten || "—"],
                  ["Kecamatan", (val.kecamatan_coverage ? String(val.kecamatan_coverage).split(",").filter((x) => x.trim()).length : 0) + " kecamatan"],
                  ["Partner", val.partner_company_name || "—"],
                  ["SDP Name", val.sdp_name || "—"],
                  ["Titik Lokasi", val.latitude != null ? "sudah dipilih" : "belum"],
                ].map(([kk, vv]) => (
                  <div key={kk}>
                    <div style={{ fontSize: 11, color: t.mid, fontWeight: 600 }}>{kk}</div>
                    <div style={{ fontSize: 13.5, color: t.hi, fontWeight: 700, marginTop: 1, wordBreak: "break-word" }}>{vv}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="wz-grid">{cur.fields.map(renderField)}</div>
          </>
        ) : (
          <div className="wz-grid">{cur.fields.map(renderField)}</div>
        )}
      </div>

      {msg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, marginTop: 14, fontSize: 13, fontWeight: 600,
          background: msg.type === "ok" ? t.okBg : t.accBg, color: msg.type === "ok" ? t.ok : t.acc, border: `1px solid ${(msg.type === "ok" ? t.ok : t.acc)}44` }}>
          {msg.type === "ok" ? <Check size={15} /> : <AlertCircle size={15} />} {msg.text}
        </div>
      )}

      {/* Footer navigasi */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => (step === 0 ? handleLeave() : setStep(step - 1))}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "11px 18px", borderRadius: 11, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontFamily: FF, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
          <ChevronLeft size={16} /> {step === 0 ? "Batal" : "Kembali"}
        </button>
        <button onClick={() => saveDraft()} title="Simpan sebagai draft (di perangkat ini)"
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 16px", borderRadius: 11, border: `1px solid ${dirty ? t.acc : t.line}`, background: t.card, color: dirty ? t.acc : t.mid, fontFamily: FF, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Save size={15} /> Simpan Draft{dirty ? <span style={{ width: 6, height: 6, borderRadius: 99, background: t.acc, display: "inline-block", marginLeft: 1 }} /> : null}
        </button>
        <div style={{ flex: 1, minWidth: 60, textAlign: "center", fontSize: 12, color: t.mid }}>Langkah {step + 1} dari {STEPS.length}{dirty ? " · belum disimpan" : ""}</div>
        {isLast ? (
          <button onClick={submit} disabled={saving} data-primary
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 22px", borderRadius: 11, border: "none", cursor: saving ? "default" : "pointer", fontFamily: FF, fontSize: 14, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg, ${t.acc} 0%, ${t.mag} 100%)`, opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />} {saving ? "Menyimpan…" : "Kirim Registrasi"}
          </button>
        ) : (
          <button onClick={() => setStep(step + 1)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "11px 22px", borderRadius: 11, border: "none", cursor: "pointer", fontFamily: FF, fontSize: 14, fontWeight: 800, color: "#fff", background: t.acc }}>
            Lanjut <ChevronRight size={16} />
          </button>
        )}
      </div>

      {/* Konfirmasi keluar bila ada perubahan belum tersimpan */}
      {confirmLeave && (
        <div onClick={() => setConfirmLeave(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} className="sdp-pop" style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, boxShadow: t.md, width: "min(430px, 94vw)", padding: 22, fontFamily: FF }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: t.accBg, color: t.acc, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><AlertTriangle size={20} /></span>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: t.hi }}>Perubahan belum disimpan</div>
            </div>
            <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.55, marginBottom: 18 }}>Ada isian yang belum disimpan. Simpan sebagai draft dulu supaya bisa dilanjutkan nanti, atau buang perubahannya?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={saveAndExit} data-primary style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 18px", borderRadius: 11, border: "none", cursor: "pointer", fontFamily: FF, fontSize: 14, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg, ${t.acc} 0%, ${t.mag} 100%)` }}>
                <Save size={16} /> Simpan Draft &amp; Keluar
              </button>
              <button onClick={discardAndExit} style={{ padding: "11px 18px", borderRadius: 11, border: `1px solid ${t.accBd || t.line}`, background: t.card, color: t.acc, fontFamily: FF, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                Buang Perubahan
              </button>
              <button onClick={() => setConfirmLeave(false)} style={{ padding: "11px 18px", borderRadius: 11, border: `1px solid ${t.line}`, background: t.card, color: t.mid, fontFamily: FF, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
                Batal, lanjut mengisi
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
        .wz-steps{display:flex;align-items:center;gap:10px;overflow:visible;padding:6px 2px 18px}
        .wz-step{display:inline-flex;align-items:center;gap:9px;background:none;border:none;cursor:pointer;font-family:${FF};padding:0;flex-shrink:0}
        .wz-dot{width:32px;height:32px;border-radius:99px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12.5px;background:${t.sub};color:${t.mid};border:1.5px solid ${t.line};transition:background .3s ease,color .3s ease,border-color .3s ease,transform .3s cubic-bezier(.34,1.56,.64,1)}
        .wz-step:hover .wz-dot{border-color:${t.acc}}
        .wz-dot.done{background:${t.okBg};color:${t.ok};border-color:${t.ok}}
        .wz-dot.active{background:${t.acc};color:#fff;border-color:${t.acc};transform:scale(1.08);box-shadow:0 4px 12px ${t.acc}40}
        .wz-check{animation:wzPop .4s cubic-bezier(.34,1.56,.64,1) both}
        @keyframes wzPop{0%{transform:scale(0) rotate(-25deg);opacity:0}60%{transform:scale(1.25) rotate(3deg)}100%{transform:scale(1) rotate(0);opacity:1}}
        .wz-steplabel{font-size:13px;font-weight:800;color:${t.hi};white-space:nowrap;animation:wzLabel .35s ease both}
        @keyframes wzLabel{from{opacity:0;transform:translateX(-5px)}to{opacity:1;transform:none}}
        .wz-line{position:relative;height:3px;flex:1;min-width:14px;border-radius:2px;background:${t.line};overflow:hidden}
        .wz-line>i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,${t.teal},${t.ok});border-radius:2px;transition:width .55s cubic-bezier(.22,.61,.36,1)}
        .wz-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 18px}
        .wz-loc{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
        @media(prefers-reduced-motion:reduce){.wz-check,.wz-steplabel{animation:none}.wz-line>i{transition:none}}
        @media(max-width:640px){.wz-grid{grid-template-columns:1fr}.wz-loc{grid-template-columns:1fr}}`}</style>
    </div>
  );
}

// ── Satu input (mobile, full width) ────────────────────────────────────────────
function Field({ k, label, type, t, value, err, onChange, geoOpts, options, brandLock }) {
  const base = {
    width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10,
    border: `1px solid ${err ? t.acc : t.line}`, background: t.inp, color: t.hi, fontSize: 14, fontFamily: FF, outline: "none",
  };
  // Semua <select> pakai appearance:none + chevron kustom di posisi yang sama
  // agar konsisten (panah native berbeda posisi antar-browser/OS).
  const selStyle = { ...base, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", paddingRight: 34, cursor: "pointer" };
  const wrapSel = (sel) => (
    <div style={{ position: "relative" }}>
      {sel}
      <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
    </div>
  );
  let control;
  if (options) {
    control = wrapSel(
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selStyle}>
        <option value="">{options.length ? "— pilih —" : "— tidak ada data —"}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (type === "geo") {
    const opts = geoOpts || [];
    const locked = opts.length <= 1 && opts.length > 0;
    control = wrapSel(
      <select value={value} disabled={locked} onChange={(e) => onChange(e.target.value)} style={{ ...selStyle, cursor: locked ? "default" : "pointer", opacity: locked ? 0.85 : 1 }}>
        <option value="">{opts.length === 0 ? "— tidak ada data —" : "— pilih —"}</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (type && type.startsWith("enum:")) {
    const listKey = type.split(":")[1];
    const locked = k === "brand" && !!brandLock;
    const opts = SDP_LISTS[listKey] || [];
    control = wrapSel(
      <select value={locked ? brandLock : value} disabled={locked} onChange={(e) => onChange(e.target.value)} style={{ ...selStyle, cursor: locked ? "default" : "pointer", opacity: locked ? 0.85 : 1 }}>
        <option value="">— pilih —</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (type === "area") {
    control = <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} style={{ ...base, resize: "vertical" }} />;
  } else if (type === "link") {
    control = (
      <>
        <input type="url" inputMode="url" value={value} placeholder="https://… (tempel link OneDrive yang disediakan)"
          onChange={(e) => onChange(e.target.value)} style={base} />
        <div style={{ fontSize: 11, color: t.mid, marginTop: 4, lineHeight: 1.45 }}>
          Tempel link folder <b>OneDrive</b> yang sudah disediakan — tidak perlu mengunggah file dari web.
        </div>
      </>
    );
  } else {
    const inpType = type === "date" ? "date" : type === "month" ? "month" : "text";
    control = <input type={inpType} value={value} onChange={(e) => onChange(e.target.value)} style={base} />;
  }
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: err ? t.acc : t.mid, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      {control}
      {err && <div style={{ fontSize: 11, color: t.acc, marginTop: 3 }}>{err}</div>}
    </label>
  );
}
