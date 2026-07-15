"use client";
/**
 * SDP_SubmissionForms.jsx — Form Registrasi / Terminasi / Rebordering SDP.
 * Menggantikan 3 Google Form. Data disimpan ke Supabase (sdp_registration,
 * sdp_termination, sdp_rebordering). Dropdown geografis dari master data
 * (mf_territory via RPC sdp_territory_combos) + SDP existing dari sdp_master.
 *
 * Scope per role:
 *   cse_rse  → cluster (profiles.cluster) × brand-nya
 *   bsm      → branch (bsm_branch) × brand (bsm_brand)
 *   pic_region / spm_sumatera → penuh
 *
 * Props: { supabase, theme = "dark", profile }
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ChevronRight, FilePlus2, FileMinus2, Shuffle,
  Check, Loader2, History, AlertCircle, UploadCloud, Paperclip, X, ExternalLink,
  MapPin, CalendarDays, Building2, Landmark, Users, ClipboardCheck, ArrowLeftRight,
} from "lucide-react";

const mk = (d) => ({
  bg: d ? "#0D0D0F" : "#F2F4F7", card: d ? "#17171B" : "#FFFFFF",
  sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  inp: d ? "#111114" : "#FFFFFF",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  blue: "#0A84FF", blueBg: d ? "rgba(10,132,255,.1)" : "rgba(37,99,235,.07)", blueBd: d ? "rgba(10,132,255,.25)" : "rgba(37,99,235,.18)",
  mag: "#C6168D", magBg: d ? "rgba(198,22,141,.12)" : "rgba(198,22,141,.07)", magBd: d ? "rgba(198,22,141,.3)" : "rgba(198,22,141,.18)",
  acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)", accBd: d ? "rgba(237,28,36,.25)" : "rgba(237,28,36,.18)",
  ok: "#22C55E", okBg: d ? "rgba(34,197,94,.12)" : "rgba(22,163,74,.08)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md: d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// geo dim → kolom di RPC combos
const GEOCOL = { brand: "brand", circle: "circle", region: "region", area: "area", branch: "branch", mc: "mc_cluster" };

// ── Definisi field per form ────────────────────────────────────────────────────
const REG_FIELDS = [
  { k: "sdp_id_new", label: "SDP ID (New)" },
  { k: "pairing_id", label: "Pairing ID" },
  { k: "brand", label: "Brand", type: "brand" },
  { k: "submission_month", label: "Submission Month", type: "month" },
  { k: "submission_date", label: "Submission Date", type: "date" },
  { k: "request_type", label: "Request Type" },
  { k: "registration_scope", label: "Registration Scope" },
  { k: "circle", label: "Circle", geo: "circle" },
  { k: "region", label: "Region", geo: "region" },
  { k: "branch", label: "Branch", geo: "branch" },
  { k: "sdp_name", label: "SDP Name" },
  { k: "partner_company_name", label: "Partner / Company Name" },
  { k: "customer_legal_name", label: "Customer Legal Name" },
  { k: "company_type", label: "Company Type" },
  { k: "status_company", label: "Status Company" },
  { k: "ktp_number", label: "KTP Number" },
  { k: "ktp_file", label: "Upload KTP (PDF)", type: "file" },
  { k: "npwp_number", label: "NPWP Number" },
  { k: "npwp_file", label: "Upload NPWP (PDF)", type: "file" },
  { k: "pic_name_partner", label: "PIC Name Partner" },
  { k: "pic_phone_number", label: "PIC Phone Number" },
  { k: "msisdn_master_trx", label: "MSISDN MASTER TRX" },
  { k: "pic_email_partner", label: "PIC Email Partner" },
  { k: "email_pic_ioh", label: "Email PIC IOH" },
  { k: "kabupaten", label: "Kab/Kota" },
  { k: "kecamatan_coverage", label: "Kecamatan Coverage" },
  { k: "partner_territory", label: "Partner Territory" },
  { k: "bill_to_address", label: "Bill To Address", type: "area" },
  { k: "ship_to_address", label: "Ship To Address", type: "area" },
  { k: "kode_pos", label: "Kode Pos" },
  { k: "need_sap_creation", label: "Need SAP Creation?", type: "yesno" },
  { k: "need_oracle_creation", label: "Need Oracle Creation?", type: "yesno" },
  { k: "hybrid_type", label: "Hybrid Type" },
  { k: "cse_name", label: "CSE Name" },
  { k: "cse_partner_id", label: "CSE Partner ID" },
  { k: "cse_number", label: "CSE Number" },
  { k: "bank_name", label: "Bank Name" },
  { k: "bank_branch_kcp", label: "Bank Branch / KCP" },
  { k: "bank_account_number", label: "Bank Account Number" },
  { k: "bank_account_name", label: "Bank Account Name" },
  { k: "commitment_fee_status", label: "Commitment Fee Status" },
  { k: "main_document_folder_link", label: "Main Document Folder Link" },
  { k: "branding_update_required", label: "Branding Update Required?", type: "yesno" },
  { k: "branding_status", label: "Branding Status" },
  { k: "circle_submit_status", label: "Circle Submit Status" },
  { k: "hq_validation_status", label: "HQ Validation Status" },
  { k: "final_registration_status", label: "Final Registration Status" },
  { k: "supporting_files", label: "Dokumen Pendukung (PDF — bisa lebih dari satu)", type: "files" },
  { k: "remarks", label: "Remarks", type: "area" },
];

const TERM_FIELDS = [
  { k: "submission_month", label: "Submission Month", type: "month" },
  { k: "submission_date", label: "Submission Date", type: "date" },
  { k: "circle", label: "Circle", geo: "circle" },
  { k: "region", label: "Region", geo: "region" },
  { k: "area", label: "Area", geo: "area" },
  { k: "branch", label: "Branch", geo: "branch" },
  { k: "micro_cluster", label: "Micro Cluster", geo: "mc" },
  { k: "partner_territory", label: "Partner Territory" },
  { k: "sdp_type", label: "SDP Type", type: "sdptype" },
  { k: "sdp_code", label: "SDP Code", type: "sdppick" },
  { k: "sdp_name", label: "SDP Name" },
  { k: "lokasi_sdp", label: "Lokasi SDP" },
  { k: "num_kec", label: "# KEC", type: "num" },
  { k: "termination_reason", label: "Termination Reason", type: "area" },
  { k: "last_active_date", label: "Last Active Date", type: "date" },
  { k: "effective_termination_date", label: "Effective Termination Date", type: "date" },
  { k: "kecamatan_return_completed", label: "Kecamatan Return Completed?", type: "yesno" },
  { k: "kecamatan_return_where", label: "Where the Kecamatan Return?" },
  { k: "circle_iom_link", label: "Circle IOM No./Link" },
  { k: "document_folder_link", label: "Document Folder Link" },
  { k: "approval_status", label: "Approval Status" },
  { k: "hq_validation_status", label: "HQ Validation Status" },
  { k: "final_status", label: "Final Status" },
  { k: "pic_circle", label: "PIC Circle" },
  { k: "pic_hq", label: "PIC HQ" },
  { k: "remarks", label: "Remarks", type: "area" },
];

const REB_FIELDS = [
  { k: "circle", label: "Circle", geo: "circle" },
  { k: "kecamatan", label: "Kecamatan" },
  { k: "kabupaten", label: "Kab/Kota" },
  { k: "rebordering_action", label: "Re-Bordering Action" },
  { k: "sdp_type", label: "SDP Type", type: "sdptype" },
  { k: "existing_sdp_id", label: "Existing SDP ID", type: "sdppick" },
  { k: "existing_sdp_name", label: "Existing SDP Name" },
  { k: "existing_partner_territory", label: "Existing Partner Territory" },
  { k: "existing_region", label: "Existing Region" },
  { k: "existing_branch", label: "Existing Branch" },
  { k: "existing_micro_cluster", label: "Existing Micro Cluster" },
  { k: "rebordering_to", label: "Re-Bordering to" },
  { k: "after_sdp_code", label: "AFTER SDP / MPx Code" },
  { k: "after_sdp_name", label: "AFTER SDP / MPx Name" },
  { k: "after_partner_territory", label: "AFTER Partner Territory" },
  { k: "after_region", label: "AFTER Region", geo: "region", group: "after" },
  { k: "after_branch", label: "AFTER Branch", geo: "branch", group: "after" },
  { k: "after_micro_cluster", label: "AFTER Micro Cluster", geo: "mc", group: "after" },
  { k: "effective_date", label: "Effective Date", type: "date" },
  { k: "approval_iom_link", label: "Approval / IOM Link" },
  { k: "mapping_status", label: "Mapping Status" },
  { k: "owner", label: "Owner" },
  { k: "remarks", label: "Remarks", type: "area" },
];

// ── Pengelompokan visual — biar formulir panjang tidak jadi satu grid
// raksasa yang memusingkan. Tiap section = kartu tersendiri berjudul.
// Field yang tidak masuk daftar keys manapun otomatis jatuh ke section
// terakhir ("Lainnya") supaya tidak ada yang hilang bila field bertambah.
function withSections(fields, sections) {
  const used = new Set();
  const out = sections.map((s) => {
    const items = fields.filter((f) => s.keys.includes(f.k));
    items.forEach((f) => used.add(f.k));
    return { ...s, fields: items };
  });
  const rest = fields.filter((f) => !used.has(f.k));
  if (rest.length) out.push({ id: "lainnya", title: "Lainnya", icon: ClipboardCheck, fields: rest });
  return out.filter((s) => s.fields.length > 0);
}

const REG_SECTIONS = [
  { id: "sdp", title: "Identitas SDP & Wilayah", icon: MapPin,
    keys: ["sdp_id_new", "brand", "sdp_name", "circle", "region", "branch", "kabupaten", "kecamatan_coverage", "partner_territory"] },
  { id: "info", title: "Info Registrasi", icon: CalendarDays,
    keys: ["pairing_id", "hybrid_type", "submission_month", "submission_date", "request_type", "registration_scope"] },
  { id: "partner", title: "Data Partner / Perusahaan", icon: Building2,
    keys: ["partner_company_name", "customer_legal_name", "company_type", "status_company", "ktp_number", "ktp_file", "npwp_number", "npwp_file", "bill_to_address", "ship_to_address", "kode_pos"] },
  { id: "bank", title: "Data Bank", icon: Landmark,
    keys: ["bank_name", "bank_branch_kcp", "bank_account_number", "bank_account_name", "commitment_fee_status"] },
  { id: "contact", title: "Kontak PIC & CSE", icon: Users,
    keys: ["pic_name_partner", "pic_phone_number", "msisdn_master_trx", "pic_email_partner", "email_pic_ioh", "cse_name", "cse_partner_id", "cse_number"] },
  { id: "approval", title: "Branding & Approval", icon: ClipboardCheck,
    keys: ["need_sap_creation", "need_oracle_creation", "branding_update_required", "branding_status", "main_document_folder_link", "circle_submit_status", "hq_validation_status", "final_registration_status", "supporting_files", "remarks"] },
];

const TERM_SECTIONS = [
  { id: "sdp", title: "Identitas SDP & Wilayah", icon: MapPin,
    keys: ["circle", "region", "area", "branch", "micro_cluster", "partner_territory", "sdp_type", "sdp_code", "sdp_name", "lokasi_sdp", "num_kec"] },
  { id: "info", title: "Info Pengajuan", icon: CalendarDays,
    keys: ["submission_month", "submission_date"] },
  { id: "terminate", title: "Detail Terminasi", icon: ClipboardCheck,
    keys: ["termination_reason", "last_active_date", "effective_termination_date", "kecamatan_return_completed", "kecamatan_return_where"] },
  { id: "approval", title: "Approval & Dokumen", icon: Users,
    keys: ["circle_iom_link", "document_folder_link", "approval_status", "hq_validation_status", "final_status", "pic_circle", "pic_hq", "remarks"] },
];

const REB_SECTIONS = [
  { id: "loc", title: "Lokasi & Jenis", icon: MapPin,
    keys: ["circle", "kecamatan", "kabupaten", "rebordering_action", "sdp_type"] },
  { id: "before", title: "SDP Sebelum (Existing)", icon: ArrowLeftRight,
    keys: ["existing_sdp_id", "existing_sdp_name", "existing_partner_territory", "existing_region", "existing_branch", "existing_micro_cluster"] },
  { id: "after", title: "SDP Sesudah (Tujuan)", icon: ArrowLeftRight,
    keys: ["rebordering_to", "after_sdp_code", "after_sdp_name", "after_partner_territory", "after_region", "after_branch", "after_micro_cluster", "effective_date"] },
  { id: "approval", title: "Approval", icon: ClipboardCheck,
    keys: ["approval_iom_link", "mapping_status", "owner", "remarks"] },
];

const FORMS = {
  registration: { table: "sdp_registration", title: "SDP Registration", icon: FilePlus2, accent: "teal", fields: REG_FIELDS, sections: withSections(REG_FIELDS, REG_SECTIONS) },
  termination: { table: "sdp_termination", title: "Termination", icon: FileMinus2, accent: "acc", fields: TERM_FIELDS, sections: withSections(TERM_FIELDS, TERM_SECTIONS) },
  rebordering: { table: "sdp_rebordering", title: "Rebordering Kecamatan", icon: Shuffle, accent: "mag", fields: REB_FIELDS, sections: withSections(REB_FIELDS, REB_SECTIONS) },
};

const uniq = (arr) => [...new Set(arr.filter((v) => v != null && String(v).trim() !== ""))].sort((a, b) => String(a).localeCompare(String(b)));

const BUCKET = "sdp-docs";
async function openDoc(supabase, path) {
  if (!path) return;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank");
}

export default function SDP_SubmissionForms({ supabase, theme = "dark", profile, onExit, initialFormType = null }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role ?? "";

  // initialFormType datang dari deep-link (mis. Quick Action "Register SDP" di dashboard
  // desktop) → langsung buka form yang dituju, skip halaman pilih jenis form.
  const [formType, setFormType] = useState(initialFormType && FORMS[initialFormType] ? initialFormType : null); // null | key of FORMS
  useEffect(() => {
    if (initialFormType && FORMS[initialFormType]) setFormType(initialFormType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFormType]);
  const [combos, setCombos] = useState([]);
  const [sdps, setSdps] = useState([]);            // sdp_master (scoped)
  const [loadingMaster, setLoadingMaster] = useState(true);

  // ── Master data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let on = true;
    (async () => {
      setLoadingMaster(true);
      const [{ data: c }, sdpRes] = await Promise.all([
        supabase.rpc("sdp_territory_combos"),
        (() => {
          let q = supabase.from("sdp_master").select("sdp_id, sdp_name, sdp_type, pt_name, region, branch, area, cluster")
            .order("period", { ascending: false });
          if (role === "cse_rse" && profile?.cluster) q = q.eq("cluster", profile.cluster);
          else if (role === "bsm" && profile?.bsm_branch) q = q.eq("branch", profile.bsm_branch);
          return q.limit(5000);
        })(),
      ]);
      if (!on) return;
      setCombos(c || []);
      // sdp_master punya satu baris per (sdp_id, periode) — dedupe supaya tiap
      // SDP hanya muncul sekali di dropdown (ambil data periode terbaru berkat
      // order period desc di atas).
      const seen = new Set();
      const dedupedSdps = (sdpRes.data || []).filter((s) => {
        if (!s.sdp_id || seen.has(s.sdp_id)) return false;
        seen.add(s.sdp_id); return true;
      });
      setSdps(dedupedSdps);
      setLoadingMaster(false);
    })();
    return () => { on = false; };
  }, [supabase, role, profile?.cluster, profile?.bsm_branch]);

  // Territory IOH (mc_cluster_mapping) tak menyimpan brand → scope geo:
  // CSE per cluster, BSM per branch. Brand dikunci lewat field Brand (di bawah).
  const scopeFilter = useMemo(() => (r) => {
    if (role === "cse_rse" && profile?.cluster) return r.mc_cluster === profile.cluster;
    if (role === "bsm" && profile?.bsm_branch) return r.branch === profile.bsm_branch;
    return true;
  }, [role, profile?.cluster, profile?.bsm_branch]);

  const sdpTypes = useMemo(() => uniq(sdps.map((s) => s.sdp_type)), [sdps]);

  if (formType) {
    const cfg = FORMS[formType];
    return (
      <FormView
        cfg={cfg} t={t} d={d} supabase={supabase} profile={profile} role={role}
        combos={combos} scopeFilter={scopeFilter} sdps={sdps} sdpTypes={sdpTypes}
        onBack={() => setFormType(null)}
      />
    );
  }

  // ── Landing: pilih jenis form ──────────────────────────────────────────────
  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      {onExit && (
        <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16 }}>
          <ArrowLeft size={15} /> Kembali ke Form SDP
        </button>
      )}
      <div style={{ marginBottom: 6, fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>Registrasi & Perubahan SDP</div>
      <div style={{ fontSize: 13, color: t.mid, marginBottom: 20 }}>
        Pilih jenis pengajuan. Kolom geografis mengikuti scope akun Anda
        {role === "cse_rse" ? ` (cluster ${profile?.cluster || "Anda"})` : role === "bsm" ? ` (branch ${profile?.bsm_branch || "Anda"})` : ""}.
      </div>
      {loadingMaster && <div style={{ fontSize: 13, color: t.mid, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={15} className="spin" /> Memuat master data…</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {Object.entries(FORMS).map(([key, f]) => {
          const Icon = f.icon;
          const col = f.accent === "teal" ? t.tealD : f.accent === "acc" ? t.acc : t.mag;
          const bg = f.accent === "teal" ? t.tealBg : f.accent === "acc" ? t.accBg : t.magBg;
          const bd = f.accent === "teal" ? t.tealBd : f.accent === "acc" ? t.accBd : t.magBd;
          return (
            <div key={key} onClick={() => setFormType(key)}
              style={{ padding: 20, borderRadius: 16, cursor: "pointer", background: t.card, border: `1px solid ${t.line}`, boxShadow: t.sm, transition: "all .15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = bd; e.currentTarget.style.boxShadow = t.md; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = t.line; e.currentTarget.style.boxShadow = t.sm; e.currentTarget.style.transform = "none"; }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, border: `1px solid ${bd}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Icon size={20} color={col} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontSize: 12.5, color: t.mid, lineHeight: 1.5 }}>{f.fields.length} kolom · isi & kirim langsung ke database</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, color: col, fontSize: 12.5, fontWeight: 700 }}>Buka form <ChevronRight size={14} /></div>
            </div>
          );
        })}
      </div>
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Form view ─────────────────────────────────────────────────────────────────
function FormView({ cfg, t, d, supabase, profile, role, combos, scopeFilter, sdps, sdpTypes, onBack }) {
  const [val, setVal] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // {type,text}
  const [tab, setTab] = useState("form"); // form | history
  const set = (k, v) => setVal((p) => ({ ...p, [k]: v }));

  const geoFields = cfg.fields.filter((f) => f.geo);

  // Brand: BSM terkunci ke bsm_brand-nya; role lain pilih bebas (IM3/3ID).
  const brandLock = role === "bsm" ? (profile?.bsm_brand || "") : "";
  useEffect(() => {
    if (brandLock && val.brand !== brandLock) setVal((p) => ({ ...p, brand: brandLock }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandLock]);

  // opsi geo (cascading dalam group + scope)
  const geoOptions = (field) => {
    const grp = field.group || "main";
    const rows = combos.filter(scopeFilter).filter((r) => {
      for (const gf of geoFields) {
        if (gf.k === field.k) continue;
        if ((gf.group || "main") !== grp) continue;
        const v = val[gf.k];
        if (v && r[GEOCOL[gf.geo]] !== v) return false;
      }
      return true;
    });
    return uniq(rows.map((r) => r[GEOCOL[field.geo]]));
  };

  // auto-isi field geo yang hanya punya 1 opsi (mis. terkunci scope)
  useEffect(() => {
    let changed = false; const next = { ...val };
    for (const f of geoFields) {
      const opts = geoOptions(f);
      if (opts.length === 1 && next[f.k] !== opts[0]) { next[f.k] = opts[0]; changed = true; }
      if (next[f.k] && opts.length > 0 && !opts.includes(next[f.k])) { next[f.k] = ""; changed = true; }
    }
    if (changed) setVal(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combos, JSON.stringify(geoFields.map((f) => val[f.k]))]);

  const pickSdp = (sdpId) => {
    const s = sdps.find((x) => String(x.sdp_id) === String(sdpId));
    if (cfg.table === "sdp_rebordering") {
      setVal((p) => ({ ...p, existing_sdp_id: sdpId, existing_sdp_name: s?.sdp_name || "", existing_partner_territory: s?.pt_name || "", existing_region: s?.region || "", existing_branch: s?.branch || "", existing_micro_cluster: s?.cluster || "", sdp_type: p.sdp_type || s?.sdp_type || "" }));
    } else { // termination
      setVal((p) => ({ ...p, sdp_code: sdpId, sdp_name: s?.sdp_name || "", partner_territory: s?.pt_name || "", sdp_type: s?.sdp_type || p.sdp_type || "" }));
    }
  };

  const submit = async () => {
    setMsg(null);
    // validasi minimal: minimal satu identifier terisi
    setSaving(true);
    try {
      const row = {};
      for (const f of cfg.fields) {
        let v = val[f.k];
        if (v === undefined || v === "") { row[f.k] = null; continue; }
        if (f.type === "num") v = Number(v);
        row[f.k] = v;
      }
      row.submitted_by_name = profile?.full_name || profile?.username || null;
      row.submitter_role = role;
      row.submitter_brand = profile?.bsm_brand || val.brand || null;
      row.submitter_branch = profile?.bsm_branch || val.branch || null;
      row.submitter_cluster = profile?.cluster || val.micro_cluster || null;
      row.submitter_region = val.region || null;
      const { error } = await supabase.from(cfg.table).insert(row);
      if (error) throw error;
      setMsg({ type: "ok", text: "Data berhasil dikirim." });
      setVal((p) => {
        // reset kecuali field geo terkunci scope
        const keep = {}; for (const f of geoFields) { const o = geoOptions(f); if (o.length === 1) keep[f.k] = p[f.k]; }
        return keep;
      });
    } catch (e) {
      setMsg({ type: "err", text: "Gagal menyimpan: " + (e.message || e) });
    } finally { setSaving(false); }
  };

  const col = cfg.accent === "teal" ? t.tealD : cfg.accent === "acc" ? t.acc : t.mag;

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>{cfg.title}</div>
        <div style={{ display: "flex", gap: 6, background: t.sub, padding: 4, borderRadius: 10, border: `1px solid ${t.line}` }}>
          {[["form", "Form"], ["history", "Riwayat"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: FF, fontSize: 12.5, fontWeight: 700, background: tab === k ? t.card : "transparent", color: tab === k ? t.hi : t.mid, boxShadow: tab === k ? t.sm : "none" }}>{l}</button>
          ))}
        </div>
      </div>

      {tab === "history" ? (
        <HistoryList cfg={cfg} t={t} supabase={supabase} profile={profile} />
      ) : (
        <>
          {msg && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600,
              background: msg.type === "ok" ? t.okBg : t.accBg, color: msg.type === "ok" ? t.ok : t.acc, border: `1px solid ${msg.type === "ok" ? t.ok : t.acc}44` }}>
              {msg.type === "ok" ? <Check size={15} /> : <AlertCircle size={15} />} {msg.text}
            </div>
          )}
          {/* Field dikelompokkan per section (kartu tersendiri) supaya formulir
              panjang tidak jadi satu grid raksasa yang memusingkan. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(cfg.sections?.length ? cfg.sections : [{ id: "all", title: cfg.title, fields: cfg.fields }]).map((sec) => {
              const SecIcon = sec.icon;
              return (
                <div key={sec.id} style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, padding: 20, boxShadow: t.sm }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
                    {SecIcon && (
                      <span style={{ width: 30, height: 30, borderRadius: 9, background: `${col}18`, border: `1px solid ${col}33`, color: col, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <SecIcon size={15} />
                      </span>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>{sec.title}</div>
                    <div style={{ fontSize: 11.5, color: t.mid, marginLeft: "auto" }}>{sec.fields.length} kolom</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {sec.fields.map((f) => (
                      <FieldInput key={f.k} f={f} t={t} value={val[f.k] ?? ""} onChange={(v) => set(f.k, v)}
                        geoOptions={f.geo ? geoOptions(f) : null} sdpTypes={sdpTypes} sdps={sdps} onPickSdp={pickSdp} col={col} brandLock={brandLock} supabase={supabase} />
                    ))}
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={submit} disabled={saving}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 22px", borderRadius: 10, border: "none", cursor: saving ? "default" : "pointer", fontFamily: FF, fontSize: 14, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg, ${t.acc} 0%, ${t.mag} 100%)`, opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />} Kirim
              </button>
            </div>
          </div>
        </>
      )}
      <style>{`.spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Satu input ────────────────────────────────────────────────────────────────
function FieldInput({ f, t, value, onChange, geoOptions, sdpTypes, sdps, onPickSdp, col, brandLock, supabase }) {
  const full = f.type === "area" || f.type === "file" || f.type === "files";
  const labelEl = (
    <div style={{ fontSize: 11.5, fontWeight: 700, color: t.mid, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.03em" }}>{f.label}</div>
  );
  const baseInp = {
    width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9,
    border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13, fontFamily: FF, outline: "none",
  };

  let control;
  if (f.geo) {
    const opts = geoOptions || [];
    const locked = opts.length <= 1 && opts.length > 0;
    control = (
      <select value={value} disabled={locked} onChange={(e) => onChange(e.target.value)} style={{ ...baseInp, cursor: locked ? "default" : "pointer", opacity: locked ? 0.85 : 1 }}>
        <option value="">{opts.length === 0 ? "— tidak ada data —" : "— pilih —"}</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (f.type === "brand") {
    const locked = !!brandLock;
    control = (
      <select value={locked ? brandLock : value} disabled={locked} onChange={(e) => onChange(e.target.value)} style={{ ...baseInp, cursor: locked ? "default" : "pointer", opacity: locked ? 0.85 : 1 }}>
        <option value="">— pilih —</option>
        <option value="IM3">IM3</option>
        <option value="3ID">3ID</option>
      </select>
    );
  } else if (f.type === "sdptype") {
    control = (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...baseInp, cursor: "pointer" }}>
        <option value="">— pilih —</option>
        {sdpTypes.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (f.type === "sdppick") {
    control = (
      <select value={value} onChange={(e) => onPickSdp(e.target.value)} style={{ ...baseInp, cursor: "pointer" }}>
        <option value="">— pilih SDP —</option>
        {sdps.map((s) => <option key={s.sdp_id} value={s.sdp_id}>{s.sdp_id} · {s.sdp_name}</option>)}
      </select>
    );
  } else if (f.type === "yesno") {
    control = (
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...baseInp, cursor: "pointer" }}>
        <option value="">— pilih —</option>
        <option value="Ya">Ya</option>
        <option value="Tidak">Tidak</option>
      </select>
    );
  } else if (f.type === "file" || f.type === "files") {
    control = <FileInput t={t} supabase={supabase} multiple={f.type === "files"} value={value} onChange={onChange} col={col} />;
  } else if (f.type === "area") {
    control = <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} style={{ ...baseInp, resize: "vertical" }} />;
  } else {
    const inpType = f.type === "date" ? "date" : f.type === "month" ? "month" : f.type === "num" ? "number" : "text";
    control = <input type={inpType} value={value} onChange={(e) => onChange(e.target.value)} style={baseInp} />;
  }

  return <label style={{ display: "block", gridColumn: full ? "1 / -1" : "auto" }}>{labelEl}{control}</label>;
}

// ── Upload PDF ke Supabase Storage (bucket privat) ─────────────────────────────
function FileInput({ t, supabase, multiple, value, onChange, col }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = React.useRef(null);
  const items = multiple
    ? (Array.isArray(value) ? value : [])
    : (value ? [{ name: String(value).split("/").pop().replace(/^\d+-\w+-/, ""), path: value }] : []);

  const handle = async (fileList) => {
    setErr(""); setBusy(true);
    try {
      const done = [];
      for (const file of Array.from(fileList)) {
        if (file.type !== "application/pdf") { setErr("Hanya file PDF yang diperbolehkan."); continue; }
        if (file.size > 10 * 1024 * 1024) { setErr("Ukuran maksimal 10 MB."); continue; }
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `registration/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
        if (error) throw error;
        done.push({ name: file.name, path });
      }
      if (multiple) onChange([...(Array.isArray(value) ? value : []), ...done]);
      else if (done[0]) onChange(done[0].path);
    } catch (e) { setErr("Gagal unggah: " + (e.message || e)); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const remove = (idx) => {
    if (multiple) onChange((Array.isArray(value) ? value : []).filter((_, i) => i !== idx));
    else onChange("");
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept="application/pdf" multiple={multiple} style={{ display: "none" }} onChange={(e) => handle(e.target.files)} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 9, border: `1px dashed ${t.line}`, background: t.sub, color: t.mid, fontSize: 12.5, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: FF }}>
        {busy ? <Loader2 size={14} className="spin" /> : <UploadCloud size={14} />}
        {busy ? "Mengunggah…" : multiple ? "Tambah PDF" : "Pilih PDF"}
      </button>
      {err && <div style={{ fontSize: 11.5, color: t.acc, marginTop: 6 }}>{err}</div>}
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {items.map((it, i) => (
            <div key={it.path} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: t.sub, border: `1px solid ${t.line}` }}>
              <Paperclip size={13} color={col} />
              <span style={{ flex: 1, fontSize: 12, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
              <button type="button" onClick={() => openDoc(supabase, it.path)} title="Lihat" style={{ border: "none", background: "none", cursor: "pointer", color: t.mid, display: "inline-flex" }}><ExternalLink size={13} /></button>
              <button type="button" onClick={() => remove(i)} title="Hapus" style={{ border: "none", background: "none", cursor: "pointer", color: t.acc, display: "inline-flex" }}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocBtn({ t, supabase, path, label }) {
  return (
    <button type="button" onClick={() => openDoc(supabase, path)}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 7, border: `1px solid ${t.line}`, background: t.sub, color: t.mid, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FF, whiteSpace: "nowrap" }}>
      <Paperclip size={11} /> {label}
    </button>
  );
}

// ── Riwayat submission milik user ──────────────────────────────────────────────
function HistoryList({ cfg, t, supabase, profile }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let on = true;
    supabase.from(cfg.table).select("*").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => { if (on) setRows(data || []); });
    return () => { on = false; };
  }, [cfg.table, supabase]);

  if (rows === null) return <div style={{ fontSize: 13, color: t.mid, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={15} className="spin" /> Memuat…</div>;
  if (rows.length === 0) return <div style={{ padding: 40, textAlign: "center", background: t.card, borderRadius: 16, border: `1px solid ${t.line}`, color: t.mid, fontSize: 13.5 }}><History size={26} style={{ opacity: .5, marginBottom: 8 }} /><div>Belum ada pengajuan.</div></div>;

  const primary = cfg.table === "sdp_registration" ? "sdp_name" : cfg.table === "sdp_termination" ? "sdp_name" : "existing_sdp_name";
  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, overflow: "hidden", boxShadow: t.sm }}>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i ? `1px solid ${t.line}` : "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r[primary] || r.sdp_code || r.existing_sdp_id || "—"}</div>
            <div style={{ fontSize: 11.5, color: t.mid }}>{[r.branch, r.region, r.brand].filter(Boolean).join(" · ") || "—"} · {new Date(r.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</div>
          </div>
          {cfg.table === "sdp_registration" && (r.ktp_file || r.npwp_file || (Array.isArray(r.supporting_files) && r.supporting_files.length > 0)) && (
            <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
              {r.ktp_file && <DocBtn t={t} supabase={supabase} path={r.ktp_file} label="KTP" />}
              {r.npwp_file && <DocBtn t={t} supabase={supabase} path={r.npwp_file} label="NPWP" />}
              {Array.isArray(r.supporting_files) && r.supporting_files.length > 0 && <DocBtn t={t} supabase={supabase} path={r.supporting_files[0].path} label={`Dok (${r.supporting_files.length})`} />}
            </div>
          )}
          <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: t.tealBg, color: t.tealD, border: `1px solid ${t.tealBd}`, whiteSpace: "nowrap" }}>{r.status || "submitted"}</span>
        </div>
      ))}
    </div>
  );
}
