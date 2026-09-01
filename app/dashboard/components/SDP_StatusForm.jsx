"use client";
/**
 * SDP_StatusForm.jsx — v5 — rebuild from scratch
 * Entry point untuk fitur SDP Status di SandraHub web.
 *
 * Struktur sub-menu:
 *   SPM Sumatera → Upload Territory IOH | Dashboard Status SDP | Mapping | Rekap Data
 *   [Roles lain] → TBD (dalam pengembangan)
 *
 * Props: { supabase, theme = "dark", profile }
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  UploadCloud, ChevronRight, ArrowLeft, Construction, Download, FilePlus2, ClipboardList, KeyRound,
  FileMinus2, Shuffle, Info, TableProperties, Eye, X, ShieldCheck, Inbox, Mail,
} from "lucide-react";
import SDP_UploadTerritory   from "./SDP_UploadTerritory";
import SDP_RekapCSE          from "./SDP_RekapCSE";
import SDP_SubmissionForms   from "./SDP_SubmissionForms";
import SDP_Field             from "./SDP_Field";
import SDP_Report            from "./SDP_Report";
import SDP_MyCodes           from "./SDP_MyCodes";
import SDP_Home              from "./SDP_Home";
import SDP_QuickForm         from "./SDP_QuickForm";
import SDP_BulkGrid          from "./SDP_BulkGrid";
import SDP_Export            from "./SDP_Export";
import SDP_BatchMonitor      from "./SDP_BatchMonitor";
import SDP_Summary           from "./SDP_Summary";
import SDP_Approval          from "./SDP_Approval";
import SDP_Drafts            from "./SDP_Drafts";

// ─── Theme ─────────────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg   : d ? "#0D0D0F" : "#F2F4F7",
  card : d ? "#17171B" : "#FFFFFF",
  sub  : d ? "#1D1D22" : "#F8F9FA",
  line : d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi   : d ? "#F1F1F4" : "#0F1117",
  mid  : d ? "#8A8A9C" : "#6B7280",
  lo   : d ? "#4A4A5E" : "#A0A8B4",
  teal : "#32BCAD",
  tealD: "#1A9E90",
  tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)",
  tealBd: d ? "rgba(50,188,173,.3)"  : "rgba(26,158,144,.2)",
  blue : d ? "#0A84FF" : "#2563EB",
  blueBg: d ? "rgba(10,132,255,.1)"  : "rgba(37,99,235,.07)",
  blueBd: d ? "rgba(10,132,255,.25)" : "rgba(37,99,235,.18)",
  mag  : "#C6168D",
  magBg: d ? "rgba(198,22,141,.12)"  : "rgba(198,22,141,.07)",
  magBd: d ? "rgba(198,22,141,.3)"   : "rgba(198,22,141,.18)",
  acc  : "#ED1C24",
  accBg: d ? "rgba(237,28,36,.1)"    : "rgba(237,28,36,.07)",
  accBd: d ? "rgba(237,28,36,.25)"   : "rgba(237,28,36,.18)",
  sm   : d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md   : d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// ─── Sub-menu definitions per role ────────────────────────────────────────────
// Satu tampilan "Data SDP" untuk SEMUA role (list → detail lengkap, termasuk
// peta lat/long, sama seperti CSE). Yang membedakan antar role hanyalah:
//   • cakupan data (scope query per role — cluster/branch/penuh)
//   • wewenang approval (CSE mengajukan, BSM/SPM/PIC Region menyetujui/menolak
//     atau langsung mengisi & menyelesaikan)
const MENUS = {
  spm_sumatera: [
    {
      id     : "upload_territory",
      icon   : UploadCloud,
      label  : "Upload Territory IOH",
      desc   : "Sinkronisasi data SDP Sumatera dari file Territory IOH bulanan",
      accent : "teal",
    },
  ],
  bsm: [],
  pic_region: [],
};

// Role IOH (monitoring, baca-saja) — tabel rekap tetap dipertahankan karena
// perannya murni memantau lintas region, bukan mengisi/menyetujui data.
const IOH_MONITOR_MENU = [
  {
    id     : "rekap",
    icon   : Download,
    label  : "Data SDP",
    desc   : "Pantau data SDP per periode — filter, detail & export Excel (baca-saja)",
    accent : "blue",
  },
];
["internal_ioh", "ioh_north_sumatera", "ioh_central_sumatera", "ioh_south_sumatera"].forEach((r) => { MENUS[r] = IOH_MONITOR_MENU; });

// Data SDP (list → detail lengkap + peta lat/long + approval) — sama untuk
// CSE, BSM, SPM Sumatera & PIC Region. Cakupan & tombol approval menyesuaikan role.
const FIELD_CARD = {
  id     : "field",
  icon   : ClipboardList,
  label  : "Data SDP",
  desc   : "Daftar SDP per periode — status, detail lengkap, peta lokasi & riwayat",
  accent : "blue",
};
const REPORT_CARD = {
  id     : "report",
  icon   : Download,
  label  : "Laporan",
  desc   : "Ringkasan progres pengisian per periode & per cluster",
  accent : "teal",
};
["cse_rse", "bsm", "spm_sumatera", "pic_region"].forEach((r) => { MENUS[r] = [FIELD_CARD, REPORT_CARD, ...(MENUS[r] || [])]; });

const MYCODES_CARD = {
  id     : "mycodes",
  icon   : KeyRound,
  label  : "Kode Otoritas",
  desc   : "Klaim & lihat kode cluster/branch yang Anda kelola",
  accent : "mag",
};
["cse_rse", "bsm"].forEach((r) => { MENUS[r] = [...(MENUS[r] || []), MYCODES_CARD]; });

// Approval registrasi: BSM menyetujui submission CSE (branch × brand) sebelum
// masuk data utama; CSE melihat status persetujuan submission-nya.
const APPROVAL_APPROVE_CARD = {
  id     : "approval",
  icon   : ShieldCheck,
  label  : "Approval SDP",
  desc   : "Setujui/tolak submission CSE: registrasi, terminate, rebordering & edit",
  accent : "acc",
};
const APPROVAL_STATUS_CARD = {
  id     : "approval",
  icon   : ShieldCheck,
  label  : "Status Approval",
  desc   : "Pantau status persetujuan submission Anda",
  accent : "blue",
};
["bsm"].forEach((r) => { MENUS[r] = [...(MENUS[r] || []), APPROVAL_APPROVE_CARD]; });
["cse_rse"].forEach((r) => { MENUS[r] = [...(MENUS[r] || []), APPROVAL_STATUS_CARD]; });

// Draft & Link — draft server, isian yang dibagikan via link (expiring), dan
// isian yang dikirim balik untuk difinalkan.
const DRAFTS_CARD = {
  id     : "drafts",
  icon   : Inbox,
  label  : "Draft & Link",
  desc   : "Draft belum selesai, link isian dibagikan (countdown), & kiriman balik",
  accent : "mag",
};
["cse_rse", "bsm", "pic_region", "spm_sumatera"].forEach((r) => { MENUS[r] = [...(MENUS[r] || []), DRAFTS_CARD]; });

// Admin (SPM): kelola mapping email → role/branch untuk login email-first.
const EMAIL_MAP_CARD = {
  id     : "email_mapping",
  icon   : Mail,
  label  : "Mapping Email Login",
  desc   : "Kelola email login → role & branch (import Excel)",
  accent : "blue",
};
["spm_sumatera"].forEach((r) => { MENUS[r] = [...(MENUS[r] || []), EMAIL_MAP_CARD]; });

// ── Tiga aksi utama SDP (scope otomatis per akun) ───────────────────────────
// Registrasi memakai FORM BARU (SDP ID otomatis + isi submitted_by). Form lama
// gabungan "Registrasi & Perubahan SDP" DISEMBUNYIKAN agar tidak membingungkan.
// Terminate & Rebordering tetap lewat SDP_SubmissionForms via deep-link jenis
// spesifik ("submission_forms:<jenis>") — tanpa memunculkan form registrasi lama.
const REGISTER_CARD = {
  id     : "quickform",
  icon   : FilePlus2,
  label  : "Registrasi & Perubahan SDP",
  desc   : "SDP baru atau update data — ramah HP, SDP ID otomatis",
  accent : "teal",
};
const TERMINATE_CARD = {
  id     : "submission_forms:termination",
  icon   : FileMinus2,
  label  : "Terminate SDP",
  desc   : "Akhiri kemitraan SDP existing",
  accent : "acc",
};
const REBORDER_CARD = {
  id     : "submission_forms:rebordering",
  icon   : Shuffle,
  label  : "Rebordering SDP",
  desc   : "Pindahkan cakupan kecamatan antar SDP",
  accent : "blue",
};
// Registrasi massal (grid) — opsi desktop, ditempatkan setelah 3 aksi utama.
const BULKGRID_CARD = {
  id     : "bulkgrid",
  icon   : ClipboardList,
  label  : "Registrasi Massal",
  desc   : "Tempel dari Excel & kirim banyak SDP sekaligus",
  accent : "mag",
};
["spm_sumatera", "cse_rse", "bsm", "pic_region"].forEach((r) => {
  MENUS[r] = [...(MENUS[r] || []), REGISTER_CARD, TERMINATE_CARD, REBORDER_CARD, BULKGRID_CARD];
});

// Monitor kelengkapan + Export ke format HQ — hanya PIC Region & SPM Sumatera.
const MONITOR_CARD = {
  id     : "monitor",
  icon   : ClipboardList,
  label  : "Monitor Kelengkapan",
  desc   : "Pantau progres pengisian per cluster/CSE",
  accent : "blue",
};
const SUMMARY_CARD = {
  id     : "summary",
  icon   : TableProperties,
  label  : "Ringkasan Siklus",
  desc   : "Rollup per region: Live · New · Terminate · Rebordering",
  accent : "blue",
};
const EXPORT_CARD = {
  id     : "export",
  icon   : Download,
  label  : "Export ke Format HQ",
  desc   : "Blok siap-paste ke spreadsheet HQ (Sumatera)",
  accent : "teal",
};
["pic_region", "spm_sumatera"].forEach((r) => {
  MENUS[r] = [...(MENUS[r] || []), SUMMARY_CARD, MONITOR_CARD, EXPORT_CARD];
});

// ─── Role badge ───────────────────────────────────────────────────────────────
function RoleBadge({ role, t }) {
  const cfg = {
    spm_sumatera  : { label: "SPM Sumatera",   color: t.mag,  bg: t.magBg,  bd: t.magBd  },
    bsm           : { label: "BSM",            color: t.teal, bg: t.tealBg, bd: t.tealBd },
    cse_rse       : { label: "CSE/RSE",        color: t.blue, bg: t.blueBg, bd: t.blueBd },
    pic_region    : { label: "PIC Region",     color: t.acc,  bg: t.accBg,  bd: t.accBd  },
  }[role] ?? { label: role, color: t.mid, bg: "transparent", bd: t.line };

  return (
    <span style={{
      display: "inline-block", padding: "3px 10px",
      borderRadius: 6, fontSize: 11.5, fontWeight: 700,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.bd}`,
      letterSpacing: 0.3,
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Menu card ────────────────────────────────────────────────────────────────
function MenuCard({ item, t, onClick }) {
  const [hover, setHover] = useState(false);
  const Icon = item.icon;
  const palette = {
    blue: { bg: t.blueBg, bd: t.blueBd, col: t.blue },
    mag : { bg: t.magBg,  bd: t.magBd,  col: t.mag  },
    acc : { bg: t.accBg,  bd: t.accBd,  col: t.acc  },
    teal: { bg: t.tealBg, bd: t.tealBd, col: t.tealD },
  };
  const pal = palette[item.accent] || palette.teal;
  const iconBg = pal.bg, iconBd = pal.bd, iconCol = pal.col;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: 20, borderRadius: 16, cursor: "pointer",
        background: t.card, border: `1px solid ${hover ? iconBd : t.line}`,
        boxShadow: hover ? t.md : t.sm,
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "all 0.15s ease",
        display: "flex", alignItems: "flex-start", gap: 16,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: iconBg, border: `1px solid ${iconBd}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={20} color={iconCol} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, marginBottom: 4, letterSpacing: -0.2 }}>
          {item.label}
        </div>
        <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.5 }}>
          {item.desc}
        </div>
      </div>
      <ChevronRight size={16} color={t.lo} style={{ marginTop: 4, flexShrink: 0 }} />
    </div>
  );
}

// ─── Role not configured stub ─────────────────────────────────────────────────
function ComingSoon({ role, t }) {
  return (
    <div style={{
      padding: "64px 32px", textAlign: "center",
      background: t.card, borderRadius: 16, border: `1px solid ${t.line}`,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, margin: "0 auto 20px",
        background: t.tealBg, border: `1px solid ${t.tealBd}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Construction size={24} color={t.tealD} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: t.hi, marginBottom: 8, letterSpacing: -0.3 }}>
        Fitur sedang disiapkan
      </div>
      <div style={{ fontSize: 13.5, color: t.mid, lineHeight: 1.6 }}>
        Menu SDP Status untuk role ini akan tersedia segera.
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SDP_StatusForm({ supabase, theme = "dark", profile: realProfile, readOnly = false, lockRegion = null, showOverviewBack = false, onBackToOverview }) {
  const d    = theme === "dark";
  const t    = mk(d);

  // ── Pratinjau lintas-role (khusus SPM Sumatera) ─────────────────────────────
  // SPM bisa "Lihat sebagai" PIC Region / BSM / CSE untuk mengecek tampilan &
  // alur tiap peran tanpa login-logout. Role + profil efektif di-override ke
  // seluruh UI SDP; scope opsional agar data ikut terisi realistis.
  const isSpm = realProfile?.role === "spm_sumatera";
  const [previewRole, setPreviewRole]   = useState("");   // "" = diri sendiri (SPM)
  const [previewScope, setPreviewScope] = useState("");   // cluster/branch/region terpilih
  const [previewBrand, setPreviewBrand] = useState("IM3"); // untuk BSM: branch × brand
  const [scopeOpts, setScopeOpts] = useState({ clusters: [], branches: [], regions: [] });

  useEffect(() => {
    if (!isSpm) return;
    let on = true;
    (async () => {
      const { data } = await supabase.from("sdp_master").select("cluster, branch, region").limit(5000);
      if (!on || !data) return;
      const uniq = (k) => [...new Set(data.map((r) => r[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
      setScopeOpts({ clusters: uniq("cluster"), branches: uniq("branch"), regions: uniq("region") });
    })();
    return () => { on = false; };
  }, [isSpm, supabase]);

  // Profil efektif yang mengalir ke seluruh UI (menu, dashboard, form).
  const profile = useMemo(() => {
    if (!isSpm || !previewRole) return realProfile;
    const p = { ...realProfile, role: previewRole };
    if (previewRole === "cse_rse")      { p.cluster = previewScope || null; p.bsm_branch = null; }
    else if (previewRole === "bsm")     { p.bsm_branch = previewScope || null; p.bsm_brand = previewBrand; p.cluster = null; }
    else if (previewRole === "pic_region") { p.region = previewScope || realProfile?.region || null; }
    return p;
  }, [isSpm, previewRole, previewScope, previewBrand, realProfile]);
  const role = profile?.role ?? "";

  // Scope untuk memuat data dashboard saat pratinjau (SDP_Home).
  const impersonate = (isSpm && previewRole) ? {
    role   : previewRole,
    cluster: previewRole === "cse_rse" ? (previewScope || null) : null,
    branch : previewRole === "bsm"     ? (previewScope || null) : null,
    brand  : previewRole === "bsm"     ? previewBrand : null,
    region : previewRole === "pic_region" ? (previewScope || null) : null,
  } : null;

  const PREVIEW_ROLES = [
    { v: "", label: "SPM Sumatera (Anda)" },
    { v: "pic_region", label: "PIC Region" },
    { v: "bsm", label: "BSM" },
    { v: "cse_rse", label: "CSE / RSE" },
  ];
  const scopeList  = previewRole === "cse_rse" ? scopeOpts.clusters : previewRole === "bsm" ? scopeOpts.branches : previewRole === "pic_region" ? scopeOpts.regions : [];
  const scopeLabel = previewRole === "cse_rse" ? "cluster" : previewRole === "bsm" ? "branch" : previewRole === "pic_region" ? "region" : "scope";

  const selStyle = { appearance: "none", fontFamily: FF, fontSize: 12.5, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.line}`, borderRadius: 8, padding: "7px 26px 7px 10px", cursor: "pointer" };
  const previewBar = isSpm ? (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderRadius: 12, marginBottom: 16, background: previewRole ? t.magBg : t.sub, border: `1px solid ${previewRole ? t.magBd : t.line}` }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: previewRole ? t.mag : t.mid }}>
        <Eye size={14} /> Lihat sebagai
      </span>
      <div style={{ position: "relative" }}>
        <select value={previewRole} onChange={(e) => { setPreviewRole(e.target.value); setPreviewScope(""); }} style={selStyle}>
          {PREVIEW_ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
        </select>
        <ChevronRight size={13} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: t.mid, pointerEvents: "none" }} />
      </div>
      {previewRole && scopeList.length > 0 && (
        <div style={{ position: "relative" }}>
          <select value={previewScope} onChange={(e) => setPreviewScope(e.target.value)} style={selStyle}>
            <option value="">— semua {scopeLabel} —</option>
            {scopeList.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronRight size={13} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: t.mid, pointerEvents: "none" }} />
        </div>
      )}
      {previewRole === "bsm" && (
        <div style={{ display: "inline-flex", background: t.card, border: `1px solid ${t.line}`, borderRadius: 8, padding: 2 }}>
          {["IM3", "3ID"].map((b) => (
            <button key={b} onClick={() => setPreviewBrand(b)} style={{
              border: "none", cursor: "pointer", fontFamily: FF, fontSize: 12, fontWeight: 800, padding: "5px 11px", borderRadius: 6,
              background: previewBrand === b ? (b === "IM3" ? t.accBg : t.blueBg) : "transparent",
              color: previewBrand === b ? (b === "IM3" ? t.acc : t.blue) : t.mid,
            }}>{b}</button>
          ))}
        </div>
      )}
      {previewRole && (
        <>
          <span style={{ fontSize: 11, fontWeight: 800, color: t.mag, background: t.card, border: `1px solid ${t.magBd}`, borderRadius: 6, padding: "3px 8px", letterSpacing: 0.3 }}>MODE PRATINJAU</span>
          <button onClick={() => { setPreviewRole(""); setPreviewScope(""); setActiveMenu(null); }} style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 12, fontWeight: 700 }}>
            <X size={13} /> Kembali ke tampilan saya
          </button>
        </>
      )}
    </div>
  ) : null;

  // Tombol keluar modul (ke Overview aplikasi) — HANYA di landing SDP, supaya
  // tidak menumpuk dengan tombol "Kembali" milik sub-view.
  const overviewBack = (showOverviewBack && onBackToOverview) ? (
    <button
      onClick={onBackToOverview}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "none", border: "none", cursor: "pointer",
        color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600,
        padding: 0, marginBottom: 18,
      }}
    >
      <ArrowLeft size={15} /> Kembali ke Overview
    </button>
  ) : null;

  const [activeMenu, setActiveMenu] = useState(null);   // null = sub-menu list
  const [subFormType, setSubFormType] = useState(null); // deep-link ke jenis form spesifik
  const [sdpPeriod, setSdpPeriod] = useState(null);     // periode dashboard, dipertahankan antar-navigasi
  const [draftToOpen, setDraftToOpen] = useState(null); // draft yang dibuka dari inbox → QuickForm

  const menus = MENUS[role] ?? null;
  const menuIds = useMemo(() => new Set((menus || []).map((m) => m.id)), [menus]);
  // Data SDP: satu tampilan (SDP_Field) untuk semua role yang ikut alur
  // pengisian/approval. IOH (monitoring lintas region) tetap pakai 'rekap'.
  const listMenuId = ["internal_ioh", "ioh_north_sumatera", "ioh_central_sumatera", "ioh_south_sumatera"].includes(role) ? "rekap" : "field";

  // Terima id biasa ("field") atau id majemuk "submission_forms:<jenis>" dari
  // Quick Action dashboard desktop, supaya bisa langsung membuka form yang dituju.
  const navigateTo = (id) => {
    if (id === "email_mapping") { if (typeof window !== "undefined") window.location.href = "/sandra/email-mapping"; return; }
    if (typeof id === "string" && id.startsWith("submission_forms:")) {
      setSubFormType(id.split(":")[1]);
      setActiveMenu("submission_forms");
    } else {
      setSubFormType(null);
      setActiveMenu(id);
    }
  };

  // Teks bantuan kontekstual per sub-view: "apa ini + langkah selanjutnya".
  const HELP = {
    field           : "Daftar SDP di wilayah Anda. Klik satu baris untuk lihat detail, status & lokasi. Langkah berikutnya: lengkapi SDP yang masih “Belum Lengkap”.",
    report          : "Ringkasan progres pengisian per periode & cluster — untuk tahu cluster mana yang perlu didorong.",
    mycodes         : "Klaim kode cluster/branch yang Anda kelola agar data SDP muncul di dashboard Anda.",
    upload_territory: "Unggah file Territory IOH bulanan sebagai acuan dropdown wilayah. Lakukan ini lebih dulu sebelum CSE mengisi SDP.",
    rekap           : "Pantau data SDP per periode (baca-saja). Gunakan filter lalu export Excel bila perlu.",
  };
  const subHeader = (key) => (
    <div style={{ marginBottom: 18 }}>
      <button
        onClick={() => setActiveMenu(null)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          color: t.mid, fontFamily: FF, fontSize: 12.5, fontWeight: 600,
          padding: 0, marginBottom: HELP[key] ? 10 : 0,
        }}
      >
        <ArrowLeft size={14} /> Form SDP
      </button>
      {HELP[key] && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 12px", borderRadius: 10, background: t.blueBg, border: `1px solid ${t.blueBd}` }}>
          <Info size={14} color={t.blue} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: t.mid, lineHeight: 1.5 }}>{HELP[key]}</div>
        </div>
      )}
    </div>
  );

  // ── Active sub-view ─────────────────────────────────────────────────────────
  if (activeMenu === "submission_forms") {
    // Back ditangani oleh komponen (landing → Form SDP, form → landing).
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        <SDP_SubmissionForms supabase={supabase} theme={theme} profile={profile} initialFormType={subFormType}
          onExit={() => { setActiveMenu(null); setSubFormType(null); }} />
      </div>
    );
  }

  if (activeMenu === "drafts") {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        <SDP_Drafts supabase={supabase} theme={theme} profile={profile}
          onOpen={(dr) => { setDraftToOpen(dr); setActiveMenu("quickform"); }}
          onExit={() => setActiveMenu(null)} />
      </div>
    );
  }

  if (activeMenu === "quickform") {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        <SDP_QuickForm supabase={supabase} theme={theme} profile={profile} initialDraft={draftToOpen}
          onExit={() => { setDraftToOpen(null); setActiveMenu(draftToOpen ? "drafts" : null); }} />
      </div>
    );
  }

  if (activeMenu === "bulkgrid") {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        <SDP_BulkGrid supabase={supabase} theme={theme} profile={profile} onExit={() => setActiveMenu(null)} />
      </div>
    );
  }

  if (activeMenu === "summary") {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        <SDP_Summary supabase={supabase} theme={theme} profile={profile} onExit={() => setActiveMenu(null)} />
      </div>
    );
  }

  if (activeMenu === "approval") {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        <SDP_Approval supabase={supabase} theme={theme} profile={profile} onExit={() => setActiveMenu(null)} />
      </div>
    );
  }

  if (activeMenu === "monitor") {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        <SDP_BatchMonitor supabase={supabase} theme={theme} profile={profile} onExit={() => setActiveMenu(null)} />
      </div>
    );
  }

  if (activeMenu === "export") {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        <SDP_Export supabase={supabase} theme={theme} profile={profile} onExit={() => setActiveMenu(null)} />
      </div>
    );
  }

  if (activeMenu === "field") {
    // Back & help ditangani DI DALAM SDP_Field (hanya di level daftar) supaya
    // saat masuk detail, tombol kembali tidak menumpuk/melompati daftar.
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        <SDP_Field supabase={supabase} theme={theme} profile={profile} readOnly={readOnly} lockRegion={lockRegion}
          onExit={() => setActiveMenu(null)} helpText={HELP.field}
          periodExt={sdpPeriod} setPeriodExt={setSdpPeriod} impersonate={impersonate} />
      </div>
    );
  }

  if (activeMenu === "report") {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        {subHeader("report")}
        <SDP_Report supabase={supabase} theme={theme} profile={profile} />
      </div>
    );
  }

  if (activeMenu === "mycodes") {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        {subHeader("mycodes")}
        <SDP_MyCodes supabase={supabase} theme={theme} profile={profile} />
      </div>
    );
  }

  if (activeMenu === "upload_territory") {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        {subHeader("upload_territory")}
        <SDP_UploadTerritory supabase={supabase} theme={theme} profile={profile} />
      </div>
    );
  }

  if (activeMenu === "rekap") {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        {subHeader("rekap")}
        <SDP_RekapCSE supabase={supabase} theme={theme} profile={profile} readOnly={readOnly} lockRegion={lockRegion} />
      </div>
    );
  }

  // ── Dashboard komprehensif (mobile: replika app; desktop: KPI + tabel + quick
  // actions) — untuk role yang punya menu Data SDP + Registrasi/Perubahan.
  if (["cse_rse", "bsm", "spm_sumatera", "pic_region"].includes(role)) {
    return (
      <div className="sdp-root sdp-view" style={{ fontFamily: FF }}>
        {overviewBack}
        {previewBar}
        <SDP_Home supabase={supabase} theme={theme} profile={profile} onNavigate={navigateTo}
          listMenuId={listMenuId} availableIds={menuIds} impersonate={impersonate}
          periodExt={sdpPeriod} setPeriodExt={setSdpPeriod} />
      </div>
    );
  }

  // ── Sub-menu list ───────────────────────────────────────────────────────────
  return (
    <div className="sdp-root sdp-view" style={{ fontFamily: FF, color: t.hi }}>
      {overviewBack}

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, color: t.hi }}>
          Form SDP
        </div>
        <div style={{ fontSize: 13, color: t.mid, marginTop: 3 }}>
          Pilih menu di bawah untuk melanjutkan
        </div>
      </div>

      {/* Menu grid or fallback */}
      {menus ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {menus.map(item => (
            <MenuCard
              key={item.id}
              item={item}
              t={t}
              onClick={() => navigateTo(item.id)}
            />
          ))}
        </div>
      ) : (
        <ComingSoon role={role} t={t} />
      )}
    </div>
  );
}
