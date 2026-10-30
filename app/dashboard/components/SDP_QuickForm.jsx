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
 * Props: { supabase, theme = "dark", profile, onExit, initialDraft, lockRequestType }
 *   lockRequestType: kunci Request Type ke satu nilai (mis. "New") dan
 *   sembunyikan pilihan "Mau melakukan apa?" — dipakai oleh SDP2_Home agar
 *   menu "Registrasi SDP" khusus untuk pendaftaran baru, tidak bercampur
 *   dengan Update/Terminate/Remapping/Hybrid Pairing yang membingungkan di
 *   sana. Form induk (Archive) tetap memanggil tanpa prop ini → tak berubah.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, Check, Loader2, AlertCircle, MapPin,
  Building2, Users, ClipboardCheck, Sparkles, Info, ChevronDown, ChevronRight, ChevronLeft, Save, AlertTriangle, Store, Truck, Home, Link2,
} from "lucide-react";
import {
  SDP_LISTS, validateRegistrationRow, applyDerived,
  previewSdpId, isHybridScope, masterToPrefill, isNewCreation, dedupeSdps, buildKecIndex,
} from "../../../lib/sdp";
import SDP_MapPicker from "./SDP_MapPicker";
import SDP_SearchSelect from "./SDP_SearchSelect";
import SDP_AddressSearch from "./SDP_AddressSearch";
import { UploadCloud, FileText, X as XIcon, FileCheck2, ShieldCheck } from "lucide-react";
import { uploadSdpDocument, sdpDriveFolderUrl } from "../../../lib/sdp/driveRelay";
import { supabaseMarta } from "../../../lib/supabaseMarta";

// Dokumen wajib mengikuti tabel requirement resmi SDP Operation SOP —
// diunggah LANGSUNG ke database kita (Storage bucket `sdp-docs` + tabel
// `sdp_documents`), BUKAN lagi berupa link folder eksternal. Kategori
// disisipkan di nama file supaya tetap bisa dibedakan tanpa kolom skema baru.
//
//   Dokumen                                            Requirement
//   ───────────────────────────────────────────────── ──────────────────────
//   KTP                                                 Mandatory
//   NPWP                                                Mandatory
//   Akta Pendirian                                       Mandatory untuk badan usaha
//   NIB                                                  Mandatory jika tersedia
//   SIUP + SKDP + TDP                                    Pengganti NIB jika NIB tidak tersedia
//   Bank Account Number & Name                           Mandatory
//   SPPKP                                                Mandatory
//   PKS                                                  Mandatory
//   Supplier Form / ABAC / LOI / Authorized Personnel    Jika diperlukan (opsional - section terpisah di bawah)
//
// `req` & `reqTone` = label badge + warna yang dipakai DocumentChecklist agar
// setiap baris menampilkan requirement-nya persis seperti tabel di atas.
const DOC_SLOTS = [
  { key: "ktp", label: "KTP", sub: "Penanggung Jawab", req: "Mandatory", reqTone: "acc" },
  { key: "npwp", label: "NPWP", sub: "Perusahaan", req: "Mandatory", reqTone: "acc" },
  { key: "akta", label: "Akta Pendirian", conditional: "badan_usaha", req: "Mandatory · Badan Usaha", reqTone: "amber" },
  { key: "legalitas", label: "NIB", req: "Mandatory jika tersedia", reqTone: "acc",
    either: { key: "siup", label: "SIUP + SKDP + TDP", req: "Pengganti NIB jika NIB tidak tersedia", reqTone: "blue" } },
  { key: "rekening", label: "Bank Account Number & Name", sub: "Buku Tabungan / No. Rekening", req: "Mandatory", reqTone: "acc" },
  { key: "sppkp", label: "SPPKP", req: "Mandatory", reqTone: "acc" },
  { key: "pks", label: "PKS", sub: "Perjanjian Kerja Sama", req: "Mandatory", reqTone: "acc" },
];
// Slot aktif tergantung jenis partner — badan usaha vs perorangan. Dokumen
// "Jika diperlukan" (Supplier Form/ABAC/LOI/Authorized Personnel) BUKAN slot
// wajib di sini — itu ditampilkan terpisah sbg upload opsional bebas di
// DocumentChecklist (section "Dokumen Pendukung Lainnya").
const activeDocSlots = (val) => DOC_SLOTS.filter((s) =>
  s.conditional !== "badan_usaha" || (val.company_type && val.company_type !== "Individual"));

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
const GEOCOL = { circle: "circle", region: "region", branch: "branch", micro_cluster: "mc_cluster" };

// Kolom nyata di tabel sdp_registration yang boleh di-insert dari form.
const DB_COLS = [
  "sdp_id_new", "pairing_id", "brand", "submission_month", "submission_date", "cycle_month",
  "request_type", "registration_scope", "circle", "region", "branch", "sdp_name",
  "partner_company_name", "customer_legal_name", "company_type", "status_company",
  "ktp_number", "npwp_number", "pic_name_partner", "pic_phone_number", "msisdn_master_trx",
  "pic_email_partner", "email_pic_ioh", "kabupaten", "kecamatan_coverage", "partner_territory",
  "bill_to_address", "ship_to_address", "kode_pos", "need_sap_creation", "need_oracle_creation",
  "hybrid_type", "cse_name", "cse_partner_id", "cse_number", "bank_name", "bank_branch_kcp",
  "bank_account_number", "bank_account_name", "commitment_fee_status",
  "branding_update_required", "branding_status", "remarks",
  "latitude", "longitude", "latitude_gudang", "longitude_gudang",
];

// Wizard bertahap — tiap langkah berisi sekelompok field. Kolom auto/HQ disembunyikan.
const STEPS = [
  { id: "jenis", title: "Jenis Pengajuan", icon: ClipboardCheck, intro: true, hint: "Pilih jenis pengajuan dulu — ini menentukan apakah perlu memilih SDP existing.",
    // Urutan field persis mengikuti kolom template Excel: Pairing ID(1) →
    // Submission Date(4) → Request Type(5) → Registration Scope(6) →
    // Hybrid Type(27). "Bulan Siklus" (cycle_month) BUKAN kolom Excel —
    // ditaruh berdekatan dgn Submission Date karena sama-sama field periode.
    fields: [["pairing_id","Pairing ID (auto jika Hybrid)"],["submission_date","Tanggal Submit","date"],
             ["cycle_month","Bulan Siklus (target live)","month"],
             ["request_type","Request Type","enum:request_type"],["registration_scope","Registration Scope","enum:registration_scope"],
             ["hybrid_type","Hybrid Type","enum:hybrid_type"]] },
  { id: "wilayah", title: "Wilayah & Brand", icon: MapPin, hint: "Scope wilayah & brand — dasar pembentukan SDP ID.",
    // Urutan Excel: Brand(2) → Circle(7) → Region(8) → Branch(9) → SDP
    // Name(10) → Kab/Kota(22) → Kecamatan Coverage(23). Micro Cluster &
    // Partner Territory BUKAN kolom Excel — ditaruh berdekatan dgn
    // Branch/Kecamatan karena sama-sama scope wilayah.
    fields: [["brand","Brand","enum:brand"],["circle","Circle","geo"],["region","Region","geo"],["branch","Branch","geo"],["micro_cluster","Micro Cluster","geo"],
             ["sdp_name","SDP Name"],["kabupaten","Kab/Kota"],["kecamatan_coverage","Kecamatan Coverage"],["partner_territory","Partner Territory"]] },
  { id: "partner", title: "Data Partner", icon: Building2, hint: "Identitas & legalitas partner.",
    fields: [["partner_company_name","Partner / Company Name"],["customer_legal_name","Customer Legal Name"],
             ["company_type","Company Type","enum:company_type"],["status_company","Status Company","enum:status_company"],
             ["ktp_number","KTP / NIK"],["npwp_number","NPWP"]] },
  { id: "lokasi", title: "Lokasi & Alamat", icon: MapPin, hint: "Alamat & titik lokasi SDP di peta.", custom: true,
    fields: [["bill_to_address"],["ship_to_address"],["kode_pos"]] },
  { id: "kontak", title: "Kontak & Bank", icon: Users, hint: "PIC, CSE, dan rekening bank.",
    // Urutan Excel: PIC Name(18) → PIC Phone(19) → MSISDN(20) → PIC
    // Email(21) → Email PIC IOH(22) → CSE Name(31) → CSE Partner ID(32) →
    // CSE Number(33) → Bank Name(34) → Bank Branch/KCP(35) → Bank Account
    // Number(36) → Bank Account Name(37) → Commitment Fee Status(38).
    // CATATAN: "CSE Partner ID" ADALAH kolom resmi Excel/DB (cse_partner_id)
    // tapi SEBELUMNYA tidak pernah punya field input di form ini — jadi tak
    // bisa diisi lewat Registrasi SDP sama sekali. Ditambahkan di sini.
    fields: [["pic_name_partner","PIC Name Partner"],["pic_phone_number","PIC Phone"],["msisdn_master_trx","MSISDN Master TRX"],
             ["pic_email_partner","Email PIC Partner"],["email_pic_ioh","Email PIC IOH"],["cse_name","CSE Name"],
             ["cse_partner_id","CSE Partner ID"],["cse_number","CSE Number"],
             ["bank_name","Bank Name"],["bank_branch_kcp","Bank Branch / KCP"],["bank_account_number","No. Rekening"],
             ["bank_account_name","Nama Rekening"],["commitment_fee_status","Commitment Fee Status","enum:commitment_fee_status"]] },
  { id: "review", title: "Dokumen & Kirim", icon: ClipboardCheck, hint: "Lampirkan dokumen wajib, tinjau ringkasan, lalu kirim.", review: true,
    fields: [["remarks","Remarks","area"]] },
];
// Peta field → indeks step, agar submit bisa melompat ke step yang errornya.
const FIELD_STEP = {};
STEPS.forEach((s, i) => (s.fields || []).forEach(([k]) => { FIELD_STEP[k] = i; }));

const uniq = (arr) => [...new Set(arr.filter((v) => v != null && String(v).trim() !== ""))].sort((a, b) => String(a).localeCompare(String(b)));

export default function SDP_QuickForm({ supabase, theme = "dark", profile, onExit, initialDraft = null, lockRequestType = null }) {
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
    request_type: lockRequestType || "",
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sameGudang, setSameGudang] = useState(true);
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Footer navigasi (Kembali/Simpan Draft/Lanjut) di-portal keluar dari area
  // scroll ".content-pad" (lihat app/dashboard/page.jsx) ke dalam <main> yang
  // sama tempat <header> dirender — supaya PERSIS seperti header: nempel
  // full-width di tepi (atas utk header, bawah utk footer ini), TIDAK ikut
  // ter-scroll, dan TIDAK tertutup padding ".content-pad". Kalau elemen
  // target belum ketemu (SSR / render pertama), fallback render inline biasa
  // di posisi lama supaya tidak pernah hilang sama sekali.
  const [footerPortalEl, setFooterPortalEl] = useState(null);
  useEffect(() => {
    const mainEl = document.querySelector(".content-pad")?.parentElement || null;
    setFooterPortalEl(mainEl);
  }, []);
  const draftKey = `sdp_quickform_draft_${profile?.id || "anon"}`;
  // Draft server + berbagi link
  const [serverDraftId, setServerDraftId] = useState(initialDraft?.id || null);
  const [serverToken, setServerToken] = useState(initialDraft?.token || null);
  const [shareDays, setShareDays] = useState(2);
  const [sharedInfo, setSharedInfo] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  // Dokumen yang dipilih user tapi BELUM diupload — sengaja disimpan terpisah
  // dari `val` (tidak ikut ke-serialize ke localStorage draft), karena File
  // object tidak bisa di-JSON.stringify. Upload ke database (Storage + tabel
  // sdp_documents) baru terjadi saat submit(), setelah SDP ID final tersedia
  // (path = SDP/<id>) — bukan lagi link folder eksternal.
  // requiredDocs: { [docKey]: File }  ·  extraDocs: File[] (dokumen pendukung lain)
  const [requiredDocs, setRequiredDocs] = useState({});
  const [extraDocs, setExtraDocs] = useState([]);
  const [docUploadMsg, setDocUploadMsg] = useState(null);
  const docSlots = activeDocSlots(val);
  const requiredDocsFilled = docSlots.filter((s) => requiredDocs[s.key]).length;
  const requiredDocsComplete = requiredDocsFilled === docSlots.length;

  const set = (k, v) => { setVal((p) => ({ ...p, [k]: v })); setDirty(true); };

  // ── Draft cadangan lokal (localStorage) — instan & bekerja offline, tapi
  // hanya terbaca dari perangkat/browser yang sama. Draft "resmi" yang bisa
  // dilanjutkan dari perangkat lain ada di saveServerDraft() / sdp_draft di
  // bawah — itu yang dipakai tombol "Simpan Draft" utama (saveDraftEverywhere).
  const saveDraft = (silent = false) => {
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ val, step, existingSdpId, sameGudang, ts: Date.now() }));
      setDirty(false);
      if (!silent) setMsg({ type: "ok", text: "Draft tersimpan di perangkat ini." });
    } catch { if (!silent) setMsg({ type: "err", text: "Gagal menyimpan draft." }); }
  };
  const handleLeave = () => { if (dirty) setConfirmLeave(true); else onExit(); };
  const discardAndExit = () => { try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ } setConfirmLeave(false); onExit(); };

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
  // Tombol "Simpan Draft" utama — sebelumnya cuma menulis ke localStorage
  // (device-only), sekarang draft disimpan ke database (`sdp_draft`) supaya
  // bisa dilanjutkan dari perangkat lain / setelah cache browser hilang.
  // localStorage tetap ditulis diam-diam sebagai cadangan instan bila offline.
  const saveDraftEverywhere = async () => {
    saveDraft(true);
    return saveServerDraft();
  };
  const saveAndExit = async () => { await saveDraftEverywhere(); setConfirmLeave(false); onExit(); };
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
      // PENTING: region cuma dipakai utk scope role "pic_region" — pola yang
      // SAMA dipakai di semua modul SDP lain (SDP_Evaluation, SDP_BatchMonitor,
      // SDP_ActionTracker, dst: `role === "pic_region" && profile?.region`).
      // Sebelumnya di sini kondisinya `else if (profile?.region)` TANPA cek
      // role — jadi role apa pun yang kebetulan punya profile.region terisi
      // (termasuk "spm_sumatera", yang seharusnya UNSCOPED / lihat "Seluruh
      // Sumatera") ikut ke-filter ke 1 region saja. Itu penyebab akun SPM
      // Sumatera cuma melihat data 1 region (mis. Sumatera Utara) alih-alih
      // seluruh Sumatera.
      if (role === "cse_rse" && profile?.cluster) sq = sq.eq("cluster", profile.cluster);
      else if (role === "bsm" && profile?.bsm_branch) sq = sq.eq("branch", profile.bsm_branch);
      else if (role === "pic_region" && profile?.region) sq = sq.eq("region", profile.region);

      // Data Site MartaHub (mh_sites) → dropdown Kecamatan/Kab (scope per role).
      // Sebelumnya pakai mf_territory (master lama, kurang lengkap/akurat per
      // site) — sekarang mengacu ke data site MartaHub yang sama dipakai tim
      // lapangan (mh_sites.kabupaten/kecamatan_name), lewat project Supabase
      // MartaHub (supabaseMarta), anon read-only.
      let tq = supabaseMarta.from("mh_sites").select("kecamatan, kabupaten, mc, branch, region").eq("active", true);
      if (role === "cse_rse" && profile?.cluster) tq = tq.eq("mc", profile.cluster);
      else if (role === "bsm" && profile?.bsm_branch) tq = tq.eq("branch", profile.bsm_branch);
      else if (role === "pic_region" && profile?.region) tq = tq.eq("region", profile.region);

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
    if (role === "pic_region" && profile?.region) return r.region === profile.region;
    return true;
  }, [role, profile?.cluster, profile?.bsm_branch, profile?.region]);

  // Rantai cascading Circle → Region → Branch → Micro Cluster. Micro Cluster
  // ditambahkan supaya Kab/Kota & Kecamatan Coverage di bawahnya bisa dipersempit
  // per-MC (satu Branch bisa punya banyak MC dengan kab/kota berbeda-beda).
  const GEO_CHAIN = ["circle", "region", "branch", "micro_cluster"];
  const geoOptions = (field) => {
    const rows = combos.filter(scopeFilter).filter((r) => {
      for (const g of GEO_CHAIN) {
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
    for (const g of GEO_CHAIN) {
      const opts = geoOptions(g);
      if (opts.length === 1 && next[g] !== opts[0]) { next[g] = opts[0]; changed = true; }
    }
    if (changed) setVal(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combos, val.circle, val.region, val.branch, val.micro_cluster]);

  // Kunci brand BSM.
  useEffect(() => { if (brandLock && val.brand !== brandLock) set("brand", brandLock); /* eslint-disable-next-line */ }, [brandLock]);

  // Jenis pembuatan baru → tak perlu SDP existing; bersihkan pilihan lama.
  useEffect(() => { if (isNewCreation(val.request_type)) setExistingSdpId(""); }, [val.request_type]);

  // Kab/Kota & Kecamatan Coverage dipersempit berjenjang: Branch → Region →
  // Micro Cluster, sesuai filter yang SUDAH dipilih user di atas (mh_sites
  // punya kolom branch/region/mc per baris site) — jadi kalau Region diisi
  // "North Sumatera" misalnya, hitungan kecamatan unik di bawah otomatis
  // mengikuti scope itu. Kolom `kecamatan` di mh_sites (CMS MartaHub, lihat
  // "KECAMATAN UNIK" di Data Site) SUDAH berupa pasangan unik
  // "KECAMATAN|KABUPATEN" per baris — PERSIS format kec_id yang dipakai
  // buildKecIndex, jadi dipakai apa adanya (JANGAN digabung ulang dengan
  // kabupaten, itu bug sebelumnya yang bikin ID unik-nya rusak/dobel).
  const scopedTerritory = useMemo(() => {
    let rows = territory;
    if (val.branch) rows = rows.filter((r) => r.branch === val.branch);
    else if (val.region) rows = rows.filter((r) => r.region === val.region);
    if (val.micro_cluster) rows = rows.filter((r) => r.mc === val.micro_cluster);
    return rows;
  }, [territory, val.region, val.branch, val.micro_cluster]);
  const kecIndex = useMemo(() => buildKecIndex(
    scopedTerritory.map((r) => ({ kec_id: r.kecamatan || "" }))
  ), [scopedTerritory]);

  // Label + jumlah kecamatan unik utk scope filter yang aktif saat ini —
  // dipakai sbg summary crosscheck di bawah field Kecamatan Coverage.
  // PENTING: hitung dari NILAI KOMPOSIT "kecamatan" (kecIndex.kecamatanFor
  // dedupe berdasarkan NAMA kecamatan saja lewat parseKecId, jadi 2 kecamatan
  // bernama sama di kab berbeda akan ke-collapse jadi 1 — beda dgn definisi
  // "Kecamatan Unik" di CMS Data Site MartaHub, yang menghitung unik per
  // pasangan "KECAMATAN|KABUPATEN" apa adanya). Dihitung langsung dari baris
  // scopedTerritory (bukan lewat kecIndex) supaya angkanya PERSIS sama dengan
  // kolom "KEC. UNIK" di CMS untuk scope yang sama.
  //
  // CATATAN: "territory" itu sendiri SUDAH di-scope dari server (lihat query
  // mh_sites di atas) sesuai akun yg login — cse_rse dibatasi ke MC-nya, bsm
  // ke branch-nya, dan role lain (termasuk BU/region) ke profile?.region-nya.
  // Jadi walau tidak ada filter Region/Branch/MC yg dipilih MANUAL di form
  // ini, angkanya TETAP hanya mencakup scope akun tsb, bukan seluruh Indonesia
  // — makanya bisa jauh lebih kecil dari total "KEC. UNIK" global di CMS
  // (yg tidak difilter akun sama sekali). Supaya jujur & bisa di-crosscheck,
  // label & angka di bawah harus menyebut scope AKUN itu juga, bukan cuma
  // filter manual yg dipilih.
  const kecAccountScopeLabel =
    (role === "cse_rse" && profile?.cluster) ? `MC ${profile.cluster} (scope akun Anda)`
    : (role === "bsm" && profile?.bsm_branch) ? `Branch ${profile.bsm_branch} (scope akun Anda)`
    : (role === "pic_region" && profile?.region) ? `Region ${profile.region} (scope akun Anda)`
    : null;
  const kecManualScopeLabel = [
    val.branch ? `Branch ${val.branch}` : (val.region ? `Region ${val.region}` : null),
    val.micro_cluster ? `MC ${val.micro_cluster}` : null,
  ].filter(Boolean).join(" · ");
  const kecScopeLabel = kecManualScopeLabel || kecAccountScopeLabel || "seluruh Sumatera";
  const kecTotalInScope = useMemo(
    () => new Set(scopedTerritory.map((r) => r.kecamatan).filter(Boolean)).size,
    [scopedTerritory]
  );
  const kecTotalInKab = useMemo(() => {
    if (!val.kabupaten) return null;
    return new Set(scopedTerritory.filter((r) => r.kabupaten === val.kabupaten).map((r) => r.kecamatan).filter(Boolean)).size;
  }, [scopedTerritory, val.kabupaten]);

  const willGenerate = isNewCreation(val.request_type);
  const idPreview = willGenerate
    ? previewSdpId({ ...val, submission_month: val.cycle_month })
    : (existingSdpId || null);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async () => {
    setMsg(null);
    const row = {
      ...val, submission_month: val.cycle_month || val.submission_month,
      // lockRequestType (menu "Registrasi SDP"): Tanggal Submit tidak lagi
      // diisi manual — dicatat otomatis sebagai tanggal saat data ini benar-
      // benar dikirim, bukan tanggal form dibuka.
      ...(lockRequestType ? { submission_date: new Date().toISOString().slice(0, 10) } : null),
    };
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
    // Dokumen wajib harus lengkap sebelum submit, khusus pembuatan SDP baru
    // (Update/Terminate/Remapping tidak selalu butuh legalitas ulang).
    if (isNewCreation(row.request_type) && !requiredDocsComplete) {
      setStep(FIELD_STEP.remarks ?? STEPS.length - 1);
      setMsg({ type: "err", text: `Lengkapi dulu ${docSlots.length - requiredDocsFilled} dokumen wajib yang belum diunggah.` });
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
        // Lifecycle sesuai SDP Operation SOP — 3 dimensi terpisah, bukan satu
        // kolom `status` tunggal (lihat docs/sql/sdp_fase1_lifecycle_migration.sql):
        // Circle baru saja submit → HQ belum meninjau → status akhir masih Draft.
        p.circle_submit_status = "Submitted";
        p.hq_validation_status = "Not Reviewed";
        p.final_registration_status = "Draft";
        p.status = "submitted"; // kompatibilitas kode lama yang belum di-migrasi
        return p;
      });

      const { error } = await supabase.from("sdp_registration").insert(payloads);
      if (error) throw error;

      // Simpan dokumen yang dipilih user LANGSUNG ke database kita (Storage
      // bucket `sdp-docs` + tabel `sdp_documents`) — baru bisa jalan di sini
      // karena sdp_id_new pasti ada setelah insert sukses. File disimpan dengan
      // nama berprefiks kategori (mis. "KTP Penanggung Jawab — ktp.pdf") supaya
      // tetap bisa dikenali per jenis dokumen tanpa kolom skema tambahan.
      // Relay ke Drive tetap berjalan sebagai salinan cadangan otomatis;
      // sumber kebenarannya sekarang database, bukan link folder eksternal.
      // Best-effort: kalau relay ke Drive gagal, dokumen TETAP aman tersimpan
      // di database — tinggal retry dari halaman Data SDP.
      const docsToUpload = [
        ...docSlots.filter((s) => requiredDocs[s.key]).map((s) => ({ file: requiredDocs[s.key].file, label: requiredDocs[s.key].label || s.label })),
        ...extraDocs.map((file) => ({ file, label: "Dokumen Pendukung" })),
      ];
      if (docsToUpload.length) {
        const targetSdpId = rows[0].sdp_id_new;
        setDocUploadMsg({ type: "ok", text: `Menyimpan ${docsToUpload.length} dokumen ke database…` });
        let okCount = 0;
        let lastFolderId = null;
        for (const { file, label } of docsToUpload) {
          try {
            const named = new File([file], `${label} — ${file.name}`, { type: file.type });
            const res = await uploadSdpDocument({
              supabase, sdpId: targetSdpId, file: named,
              uploaderId: user.id, uploaderName: profile?.full_name || profile?.username || null,
            });
            if (res) { okCount += 1; lastFolderId = res.drive_folder_id || lastFolderId; }
          } catch { /* tersimpan di Storage tapi gagal dicatat — tidak menggagalkan submit */ }
        }
        const folderUrl = sdpDriveFolderUrl(lastFolderId);
        setDocUploadMsg(okCount === docsToUpload.length
          ? { type: "ok", text: `${okCount} dokumen tersimpan di database (SDP/${targetSdpId}).`, folderUrl }
          : { type: "err", text: `${okCount}/${docsToUpload.length} dokumen berhasil tersimpan — sisanya bisa di-retry dari halaman Data SDP.`, folderUrl });
        setRequiredDocs({}); setExtraDocs([]);
      }

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
    // "SDP ID" otomatis — ukuran/style box disamakan persis dgn Field lain
    // (base style: w-100%, padding 11px 12px, radius 10, border, border-box)
    // tapi non-interaktif (readonly, bukan <input>/<select>) krn nilainya
    // cuma preview hasil generate_sdp_id, ga boleh diedit manual.
    if (k === "sdp_id_preview") return wrap(
      <label style={{ display: "block" }}>
        <div style={lblStyle}>{label}</div>
        <div style={{
          width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10,
          border: `1px solid ${t.line}`, background: t.sub, color: idPreview ? t.hi : t.lo,
          fontSize: 14, fontFamily: FF, fontWeight: idPreview ? 700 : 500, display: "flex", alignItems: "center", gap: 6, minHeight: 42,
        }}>
          <Sparkles size={13} color={t.tealD} style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {idPreview || "—"}{willGenerate && isHybridScope(val.registration_scope) && idPreview ? " +KSK" : ""}
          </span>
        </div>
      </label>);
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
        {/* TIDAK lagi auto-isi Kab/Kota dari pilihan pertama — sebelumnya itu
            langsung mempersempit daftar ke 1 kab setelah klik pertama,
            sehingga kecamatan dari kab lain "hilang" & tidak bisa dipilih
            (kelihatan seperti error saat mau pilih lebih dari satu). Kab/Kota
            sekarang murni filter opsional yang diatur manual oleh user. */}
        <SDP_SearchSelect t={t} multi value={val.kecamatan_coverage ?? ""} options={kecIndex.kecamatanFor(val.kabupaten)}
          optionSub={(o) => kecIndex.kabOf(o)}
          onChange={(v) => { setVal((p) => ({ ...p, kecamatan_coverage: v })); setDirty(true); }}
          placeholder="— pilih kecamatan —" searchPlaceholder="Cari kecamatan…" />
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: t.lo, marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, background: t.tealBg, color: t.tealD, fontWeight: 700 }}>
            {val.kabupaten ? kecTotalInKab : kecTotalInScope} kecamatan unik
          </span>
          <span>{val.kabupaten ? <>di Kab/Kota <strong style={{ color: t.mid }}>{val.kabupaten}</strong> ({kecScopeLabel}) — kosongkan Kab/Kota untuk lihat semua.</> : <>tersedia di {kecScopeLabel} — dari Data Site MartaHub terbaru.</>}</span>
        </div>
      </label>);
    return wrap(
      <Field k={k} label={label} type={type} t={t} value={val[k] ?? ""}
        err={errors[k]} onChange={(v) => set(k, v)} options={null}
        geoOpts={type === "geo" ? geoOptions(k) : null}
        brandLock={k === "brand" ? brandLock : ""} />);
  };

  // Saat request_type dikunci (mis. dari menu "Registrasi SDP" → khusus
  // New), langkah pertama tidak perlu lagi menawarkan pilihan New/Update/
  // Terminate/Remapping/Hybrid Pairing. Brand & Circle juga dipindah ke
  // langkah pertama ini (dari langkah "Wilayah & Brand") supaya begitu
  // langkah pertama selesai diisi, SDP ID langsung bisa dibentuk dan
  // ditampilkan — tidak perlu pindah langkah dulu baru ID muncul.
  const stepsForForm = lockRequestType
    ? STEPS.map((s, i) => {
        if (i === 0) {
          return {
            ...s, title: "Scope & Brand", hint: "Isi ini dulu — begitu lengkap, SDP ID langsung dibuatkan otomatis di bawah.",
            // Urutan Excel: Brand(2) → Registration Scope(6) → Circle(7) →
            // Hybrid Type(27). cycle_month = extra (bukan kolom Excel).
            // UPDATE (permintaan user - "id jangan buat disini, tapi
            // sejajar dengan kolom brand ... ukurannya sama dengan kolom
            // brand dan lainnya"): field semu "sdp_id_preview" disisipkan
            // tepat setelah brand, jadi di grid 2-kolom dia SATU BARIS
            // dengan Brand (bukan lagi chip terpisah di header). Field ini
            // readonly (auto-generated), ditangani khusus di renderField().
            fields: [
              ["brand","Brand","enum:brand"],
              ["sdp_id_preview","SDP ID","readonly"],
              ["registration_scope","Registration Scope","enum:registration_scope"],
              ["circle","Circle","geo"],
              ["cycle_month","Bulan Siklus (target live)","month"],
              ["hybrid_type","Hybrid Type","enum:hybrid_type"],
            ],
          };
        }
        if (i === 1) {
          return {
            ...s, title: "Wilayah Operasional", hint: "Detail wilayah & nama SDP — Brand dan Circle sudah diisi di langkah sebelumnya.",
            // Urutan Excel: Region(8) → Branch(9) → SDP Name(10) →
            // Kab/Kota(22) → Kecamatan Coverage(23). Micro Cluster & Partner
            // Territory = extra (bukan kolom Excel).
            fields: [["region","Region","geo"],["branch","Branch","geo"],["micro_cluster","Micro Cluster","geo"],
                     ["sdp_name","SDP Name"],["kabupaten","Kab/Kota"],["kecamatan_coverage","Kecamatan Coverage"],["partner_territory","Partner Territory"]],
          };
        }
        return s;
      })
    : STEPS;
  const cur = stepsForForm[step];
  const isLast = step === stepsForForm.length - 1;

  return (
    <div style={{ fontFamily: FF, color: t.hi, maxWidth: 880, margin: "0 auto", paddingBottom: 8 }}>
      {/* Header + SDP ID chip.
          UPDATE (permintaan user - "tombol simpan draft diatas sejajar
          tombol kembali yang di atas"): tombol "Simpan Draft" (sama fungsi
          persis spt yg di footer - saveDraftEverywhere) sekarang juga
          muncul di sini, SEJAJAR (satu baris, kiri-kanan) dgn tombol
          Kembali paling atas. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={handleLeave}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: t.card, border: `1px solid ${t.line}`, borderRadius: 10,
            cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 12.5, fontWeight: 700, padding: "8px 14px", boxShadow: t.sm,
            transition: "border-color .15s ease, color .15s ease" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = t.acc; e.currentTarget.style.color = t.acc; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = t.line; e.currentTarget.style.color = t.mid; }}>
          <ArrowLeft size={14} /> Kembali
        </button>
        <button onClick={saveDraftEverywhere} disabled={savingDraft} title="Simpan draft ke server — bisa dilanjutkan dari perangkat lain"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 10, border: `1px solid ${dirty ? t.acc : t.line}`, background: dirty ? t.accBg : t.card, color: dirty ? t.acc : t.mid, fontFamily: FF, fontSize: 12.5, fontWeight: 700, cursor: savingDraft ? "default" : "pointer", boxShadow: t.sm }}>
          {savingDraft ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Simpan Draft{dirty ? <span style={{ width: 5, height: 5, borderRadius: 99, background: t.acc, display: "inline-block", marginLeft: 1 }} /> : null}
        </button>
      </div>
      {/* UPDATE (permintaan user - "id jangan buat disini, tapi sejajar
          dengan kolom brand"): chip SDP ID di header DIHAPUS - sekarang
          jadi field readonly di dalam grid step "Scope & Brand", sebaris
          dgn Brand (lihat renderField -> k === "sdp_id_preview"). */}
      <div style={{ marginBottom: 16 }}>
        {/* UPDATE (permintaan user - "ubah menu registrasi SDP menjadi
            Form SDP, nanti tidak hanya registrasi"): judul form disamakan
            dgn nama menunya. */}
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>{lockRequestType ? "Form SDP" : "Registrasi & Perubahan SDP"}</div>
      </div>

      {/* Toolbar: simpan ke server & bagikan link (expiring) — fitur untuk
          alur lama (Archive) yang bisa dikerjakan lintas orang/perangkat via
          link. Disembunyikan di menu "Registrasi SDP" (lockRequestType):
          satu tombol "Simpan Draft" di footer sudah cukup dan sudah
          menyimpan ke server juga, jadi dua tombol simpan sekaligus di sini
          hanya bikin bingung. */}
      {!lockRequestType && (
        <>
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
        </>
      )}

      {/* Stepper */}
      <div className="wz-steps">
        {stepsForForm.map((s, i) => {
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
              {i < stepsForForm.length - 1 && <span className="wz-line"><i style={{ width: done ? "100%" : "0%" }} /></span>}
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
          </div>
        </div>

        {loadingMaster && step === 0 && <div style={{ fontSize: 12.5, color: t.mid, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={14} className="spin" /> Memuat master wilayah…</div>}

        {cur.intro ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Request Type sebagai pilihan besar — disembunyikan bila dikunci
                (mis. menu "Registrasi SDP" khusus New), supaya tidak
                menampilkan opsi Update/Terminate/Remapping/Hybrid Pairing
                yang tidak relevan di sana. */}
            {!lockRequestType && (
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
            )}

            {/* Kontekstual — mengalir ke bawah sesuai jenis */}
            {val.request_type && (isNewCreation(val.request_type) ? null : (
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

            {/* Konfirmasi ID — muncul begitu Brand + Circle + Bulan Siklus
                lengkap, jadi user langsung tahu ID SDP-nya tanpa pindah
                langkah. Lebih besar & tegas dari notice di atas. */}
            {val.request_type && isNewCreation(val.request_type) && (
              <div className="sdp-fade" style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 14,
                background: idPreview ? t.tealBg : t.sub, border: `1.5px solid ${idPreview ? t.tealBd : t.line}` }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: idPreview ? t.tealD : t.line, color: idPreview ? "#06231F" : t.lo, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={18} />
                </span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: idPreview ? t.tealD : t.mid, textTransform: "uppercase", letterSpacing: "0.05em" }}>SDP ID</div>
                  {idPreview ? (
                    <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: t.hi, marginTop: 2 }}>
                      {idPreview}{isHybridScope(val.registration_scope) ? <span style={{ fontSize: 12.5, fontWeight: 700, color: t.mid, fontFamily: FF }}> {" "}+ pasangan KSK/SDP otomatis</span> : null}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: t.mid, marginTop: 2 }}>Lengkapi Registration Scope, Brand, Circle &amp; Bulan Siklus di atas untuk melihat ID.</div>
                  )}
                </div>
              </div>
            )}
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
                <SDP_AddressSearch t={t} supabase={supabase} nearLat={val.latitude ?? null} nearLng={val.longitude ?? null} onSelect={(r) => {
                  setVal((p) => ({ ...p, bill_to_address: r.displayFull || r.display || p.bill_to_address, kode_pos: (r.address && r.address.postcode) || p.kode_pos, latitude: r.lat, longitude: r.lon }));
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
                    <SDP_AddressSearch t={t} supabase={supabase} nearLat={val.latitude_gudang ?? null} nearLng={val.longitude_gudang ?? null} onSelect={(r) => {
                      setVal((p) => ({ ...p, ship_to_address: r.displayFull || r.display || p.ship_to_address, latitude_gudang: r.lat, longitude_gudang: r.lon }));
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
            <DocumentChecklist
              t={t} slots={docSlots} required={requiredDocs} setRequired={setRequiredDocs}
              extra={extraDocs} setExtra={setExtraDocs}
              filled={requiredDocsFilled} complete={requiredDocsComplete}
              enforce={isNewCreation(val.request_type)} docUploadMsg={docUploadMsg} />
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

      {/* Footer navigasi (Kembali/Simpan Draft/Lanjut) — DI-PORTAL ke luar
          area scroll, dirender ke dalam <main> yang sama dengan <header>
          (lihat footerPortalEl di atas). Hasilnya: bar putih full-width yang
          nempel rata di TEPI BAWAH layar — PERSIS seperti header yg nempel
          di tepi atas — bukan cuma "sticky" di dalam kolom form yang sempit.
          footerBar didefinisikan sebagai variabel supaya bisa dipakai dua
          cara: lewat portal (kalau target ketemu) atau fallback inline biasa
          di bawah form (kalau portal target belum/tidak ketemu). */}
      {(() => {
        // UPDATE (permintaan user - "redesign total" footer navigasi form,
        // arah "minimalis & subtle"): progress bar lebih tipis & warna
        // netral (bukan gradient teal->ok mencolok), tombol "Lanjut"/"Kirim
        // Registrasi" ga lagi solid besar + glow shadow - sekarang border
        // tipis + bg soft (accBg), font weight dikurangi, shadow dihapus.
        // Tombol Kembali/Simpan Draft juga dikecilkan biar proporsional.
        // UPDATE (permintaan user - "hilangkan saja progress bar, dan satu
        // line saja simpan draft, kembali, lanjutkan"): progress bar
        // dihapus total, footer sekarang cuma 1 baris flex berisi
        // Kembali/Batal (kiri), Langkah X/6 + Simpan Draft (tengah), dan
        // Lanjut/Kirim Registrasi (kanan) — label section tujuan tetap
        // dipertahankan sbg sub-teks kecil di tombol Kembali/Lanjut.
        // UPDATE (permintaan user - screenshot nunjukin footer sebelumnya
        // "berantakan" di mobile, 1-baris-semua bikin tombol Kembali/Lanjut
        // numpuk sama floating chat widget; dikasih contoh referensi:
        // tombol "Lanjut" full-width solid gradient besar, simple, ga ada
        // sub-label/teks tambahan nempel di tombolnya): footer sekarang 2
        // baris - baris atas kecil & ringkas (Kembali, Langkah X/6, Simpan
        // Draft), baris bawah tombol Lanjut/Kirim Registrasi FULL WIDTH
        // gradient persis gaya referensi. Sub-label nama section DIHAPUS
        // dari tombol (balik ke permintaan sebelum ini) karena itu yg bikin
        // tombol melebar & overlap di layar sempit.
        const footerBar = (
          <div style={{
            flexShrink: 0, width: "100%", boxSizing: "border-box",
            padding: "10px 20px calc(10px + env(safe-area-inset-bottom, 0px))",
            background: d ? "rgba(17,17,19,0.92)" : "rgba(255,255,255,0.92)",
            borderTop: `1px solid ${t.line}`, backdropFilter: "blur(24px)", zIndex: 40, position: "relative",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ maxWidth: 880, margin: "0 auto", width: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10 }}>

              {/* UPDATE (permintaan user - "hilangkan bagian ini", nunjuk
                  baris Batal/Langkah X/6/Simpan Draft di footer): baris itu
                  DIHAPUS - sudah redundan krn "Kembali" & "Simpan Draft"
                  sekarang ada di header atas form (sejajar). Footer tinggal
                  tombol utama full width di bawah ini saja. */}
              {isLast ? (
                <button onClick={submit} disabled={saving} data-primary
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "15px 22px", borderRadius: 13, border: "none", cursor: saving ? "default" : "pointer", fontFamily: FF, fontSize: 15, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg, ${t.acc} 0%, ${t.mag} 100%)`, opacity: saving ? 0.7 : 1, boxShadow: `0 8px 18px ${t.acc}33` }}>
                  {saving ? <Loader2 size={18} className="spin" /> : <Check size={18} />} {saving ? "Menyimpan…" : "Kirim Registrasi"}
                </button>
              ) : (
                <button onClick={() => setStep(step + 1)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "15px 22px", borderRadius: 13, border: "none", cursor: "pointer", fontFamily: FF, fontSize: 15, fontWeight: 800, color: "#fff", background: `linear-gradient(135deg, ${t.acc} 0%, ${t.mag} 100%)`, boxShadow: `0 8px 18px ${t.acc}33` }}>
                  Lanjut <ChevronRight size={18} />
                </button>
              )}
            </div>
          </div>
        );
        return footerPortalEl ? createPortal(footerBar, footerPortalEl) : footerBar;
      })()}

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

// ── Bulan Siklus (month+year) — native <input type="month"> seringkali
// render aneh (format tanggal OS/browser, placeholder "----"), jadi diganti
// picker custom: geser ← → utk ganti bulan cepat, atau klik buat buka
// popover grid 12 bulan + navigasi tahun (bulan & tahun digabung jadi satu
// kontrol, bukan dua field terpisah). Value tetap string "YYYY-MM" (sama
// persis format native month input) supaya toYYMM()/validasi lain di
// lib/sdp tidak perlu diubah sama sekali.
const MONTH_LABELS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const parseYM = (v) => {
  const m = String(v || "").match(/^(\d{4})-(\d{2})$/);
  return m ? { y: parseInt(m[1], 10), m: parseInt(m[2], 10) } : null;
};
const fmtYM = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

// UPDATE (permintaan user - "ini tidak perlu uitambahn gunakan sistem
// bulan dan tahun"): popover kalender custom (grid 12 bulan + navigasi
// tahun) DIHAPUS. Diganti 2 <select> NATIVE biasa — Bulan & Tahun — sama
// kayak <select> field lain di form ini (appearance:none + chevron
// custom). Value tetap string "YYYY-MM" jadi toYYMM()/validasi lain di
// lib/sdp tidak perlu diubah sama sekali.
const YEAR_RANGE = (() => {
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now - 1; y <= now + 3; y++) years.push(y);
  return years;
})();

function MonthPicker({ value, onChange, t, err }) {
  const parsed = parseYM(value);
  // UPDATE (permintaan user - "setelah di klik, muncul bekas outline" di
  // select Bulan/Tahun): outline default browser dimatikan (outline:none),
  // diganti border lebih tegas pas focus (pakai warna acc) supaya tetap
  // ada penanda fokus tapi rapi, bukan kotak outline bawaan OS.
  // UPDATE (permintaan user - "arrow ke bawah itu di dalam box masing
  // masing jangan terlalu rapat sisi"): paddingRight select diperbesar
  // (34px, sama kayak <select> lain di Field component) & posisi chevron
  // digeser dari right:10 -> right:12, jadi ada jarak yg cukup dari tepi
  // kanan box, ga nempel sisi lagi.
  // UPDATE (permintaan user, ronde 2 - "masih terlalu rapat ke kanan"):
  // akar masalahnya boxSizing ga di-set (default content-box), jadi lebar
  // select BENERAN lebih lebar drpd div pembungkusnya (flex:1) karena
  // padding+border nambah di LUAR itu - bikin chevron (absolute, relatif
  // ke div pembungkus) ketutup/kepepet oleh tepi select yg sebenarnya
  // meluber. Field lain (base style, lihat Field component di bawah) UDAH
  // pakai boxSizing:"border-box" - di sini disamakan.
  const selStyle = {
    flex: 1, minWidth: 0, boxSizing: "border-box", width: "100%",
    appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
    padding: "0 34px 0 12px", height: 42, borderRadius: 10, border: `1px solid ${err ? t.acc : t.line}`,
    background: t.inp, color: parsed ? t.hi : t.lo, fontFamily: FF, fontSize: 14, fontWeight: parsed ? 700 : 500, cursor: "pointer",
    outline: "none", WebkitTapHighlightColor: "transparent",
  };
  const wrap = (sel) => (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      {sel}
      <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
    </div>
  );

  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
      {wrap(
        <select value={parsed?.m || ""} onChange={(e) => onChange(fmtYM(parsed?.y || new Date().getFullYear(), parseInt(e.target.value, 10)))} style={selStyle}>
          <option value="" disabled>— bulan —</option>
          {MONTH_LABELS.map((lab, i) => <option key={lab} value={i + 1}>{lab}</option>)}
        </select>
      )}
      {wrap(
        <select value={parsed?.y || ""} onChange={(e) => onChange(fmtYM(parseInt(e.target.value, 10), parsed?.m || new Date().getMonth() + 1))} style={selStyle}>
          <option value="" disabled>— tahun —</option>
          {YEAR_RANGE.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      )}
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
  const wrapSel = (sel, hideArrow = false) => (
    <div style={{ position: "relative" }}>
      {sel}
      {!hideArrow && <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />}
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
    // "Circle" SELALU dikunci ke "Sumatera" — seluruh sistem ini memang
    // khusus operasional Sumatera, jadi field ini tak perlu (dan tak boleh)
    // bisa dipilih/diubah sama sekali, berapa pun jumlah opsi yg kebetulan
    // ada di master data. Field geo lain tetap auto-lock hanya saat opsinya
    // memang cuma 1 (perilaku lama, tidak berubah).
    const circleForced = k === "circle";
    const locked = circleForced || (opts.length <= 1 && opts.length > 0);
    const shownValue = circleForced ? "Sumatera" : value;
    control = wrapSel(
      <select value={shownValue} disabled={locked} onChange={(e) => onChange(e.target.value)} style={{ ...selStyle, cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.7 : 1, background: locked ? t.sub : t.inp, paddingRight: circleForced ? 12 : selStyle.paddingRight }}>
        <option value="">{opts.length === 0 && !circleForced ? "— tidak ada data —" : "— pilih —"}</option>
        {(circleForced ? ["Sumatera"] : opts).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>,
      circleForced
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
  } else if (type === "month") {
    control = <MonthPicker value={value} onChange={onChange} t={t} err={err} />;
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
    const inpType = type === "date" ? "date" : "text";
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

// ── Checklist dokumen wajib — upload langsung ke database (bukan link) ─────
// Didesain ulang supaya requirement tiap dokumen (Mandatory / Mandatory utk
// badan usaha / Mandatory jika tersedia / Pengganti NIB) kelihatan jelas
// sebagai badge warna, dengan progress ring + status per baris yang rapi.
// File sungguhan baru dikirim ke Storage/tabel sdp_documents saat "Kirim
// Registrasi" ditekan (submit()), setelah SDP ID final tersedia.
// Badge warna requirement per baris — pakai warna mentah (bukan t.d/dark-mode
// aware) supaya tetap kebaca jelas di kedua tema tanpa perlu prop tambahan.
const REQ_TONE = (t) => ({
  acc: { fg: t.acc, bg: t.accBg, bd: `${t.acc}44` },
  amber: { fg: "#FFB020", bg: "rgba(255,176,32,.12)", bd: "#FFB02055" },
  blue: { fg: "#0A84FF", bg: "rgba(10,132,255,.13)", bd: "#0A84FF55" },
  mid: { fg: t.mid, bg: t.sub, bd: t.line },
});
function ReqBadge({ t, tone, children }) {
  const c = REQ_TONE(t)[tone] || REQ_TONE(t).mid;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 800, letterSpacing: "0.02em", color: c.fg, background: c.bg, border: `1px solid ${c.bd}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
function DocumentChecklist({ t, slots, required, setRequired, extra, setExtra, filled, complete, enforce, docUploadMsg }) {
  const total = slots.length;
  const pct = total ? Math.round((filled / total) * 100) : 100;
  const r = 20, circumference = 2 * Math.PI * r;
  return (
    <div style={{ background: t.sub, border: `1px solid ${t.line}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      {/* Header — progress ring + judul + counter, bukan cuma bar tipis */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: 48, height: 48, flexShrink: 0 }}>
          <svg width="48" height="48" viewBox="0 0 48 48" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="24" cy="24" r={r} fill="none" stroke={t.line} strokeWidth="5" />
            <circle cx="24" cy="24" r={r} fill="none" stroke={complete ? t.ok : t.acc} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={circumference - (pct / 100) * circumference}
              style={{ transition: "stroke-dashoffset .4s ease" }} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: complete ? t.ok : t.hi }}>
            {pct}%
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <ShieldCheck size={15} color={complete ? t.ok : t.mid} />
            <div style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Dokumen Wajib</div>
            <span style={{ fontSize: 12, fontWeight: 800, color: complete ? t.ok : t.mid }}>· {filled}/{total} lengkap</span>
          </div>
          <div style={{ fontSize: 11.5, color: t.lo, marginTop: 2, lineHeight: 1.5 }}>
            Unggah file aslinya di sini — tersimpan langsung ke database{enforce ? ", wajib lengkap untuk SDP baru" : ""}.
          </div>
        </div>
      </div>

      {/* Header kolom ala tabel — "Dokumen" | "Requirement", biar jelas ini
          mengikuti tabel requirement resmi. */}
      <div style={{ display: "flex", padding: "0 12px 6px", fontSize: 10, fontWeight: 800, color: t.lo, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <span style={{ flex: 1 }}>Dokumen</span>
        <span>Requirement</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {slots.map((s) => {
          const entry = required[s.key]; // { file, label }
          const setFile = (file, label) => setRequired((p) => ({ ...p, [s.key]: { file, label } }));
          const clear = () => setRequired((p) => { const n = { ...p }; delete n[s.key]; return n; });
          const done = !!entry;
          return (
            <div key={s.key} style={{
              display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: 11, background: t.card,
              border: `1px solid ${done ? (t.tealBd || t.tealD) : t.line}`, boxShadow: done ? `0 0 0 1px ${t.tealBd || "transparent"} inset` : "none",
              transition: "border-color .15s ease",
            }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: done ? t.okBg : t.sub, color: done ? t.ok : t.lo, border: `1px solid ${done ? t.ok : t.line}` }}>
                {done ? <Check size={15} strokeWidth={3} /> : <FileText size={14} />}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>{done ? entry.label : s.label}</span>
                  {!done && <ReqBadge t={t} tone={s.reqTone}>{s.req}</ReqBadge>}
                </div>
                {done ? (
                  <div style={{ fontSize: 11, color: t.mid, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.file.name}</div>
                ) : s.sub ? (
                  <div style={{ fontSize: 11, color: t.lo, marginTop: 2 }}>{s.sub}</div>
                ) : s.either ? (
                  <div style={{ fontSize: 11, color: t.lo, marginTop: 2 }}>atau unggah <b style={{ color: t.mid }}>{s.either.label}</b></div>
                ) : null}
              </div>

              {done ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8, border: `1px dashed ${t.line}`, background: t.sub, color: t.mid, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                    <FileCheck2 size={13} /> Ganti
                    <input type="file" style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f, entry.label); e.target.value = ""; }} />
                  </label>
                  <button type="button" onClick={clear}
                    style={{ display: "inline-flex", border: "none", background: "transparent", color: t.mid, cursor: "pointer", padding: 2, flexShrink: 0 }}><XIcon size={14} /></button>
                </div>
              ) : s.either ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, border: `1px dashed ${t.acc}66`, background: t.accBg, color: t.acc, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      <UploadCloud size={13} /> {s.label}
                      <input type="file" style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f, s.label); e.target.value = ""; }} />
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, border: `1px dashed ${t.line}`, background: t.sub, color: t.mid, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      <UploadCloud size={13} /> {s.either.label}
                      <input type="file" style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f, s.either.label); e.target.value = ""; }} />
                    </label>
                  </div>
                  <ReqBadge t={t} tone={s.either.reqTone}>{s.either.req}</ReqBadge>
                </div>
              ) : (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: `1px dashed ${t.acc}66`, background: t.accBg, color: t.acc, fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  <UploadCloud size={13} /> Pilih File
                  <input type="file" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f, s.label); e.target.value = ""; }} />
                </label>
              )}
            </div>
          );
        })}
      </div>

      {/* Dokumen pendukung "jika diperlukan" — opsional, section visual
          terpisah & lebih lembut (bukan merah) supaya jelas tidak wajib. */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px dashed ${t.line}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: t.card, color: t.lo, border: `1px solid ${t.line}` }}>
              <FileText size={13} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: t.hi }}>Supplier Form / ABAC / LOI / Authorized Personnel</span>
                <ReqBadge t={t} tone="mid">Jika diperlukan</ReqBadge>
              </div>
              <div style={{ fontSize: 10.5, color: t.lo, marginTop: 1 }}>Opsional — hanya bila diminta finance/procurement/compliance.</div>
            </div>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, border: `1px dashed ${t.line}`, background: t.card, color: t.mid, fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
            <UploadCloud size={13} /> Tambah File
            <input type="file" multiple style={{ display: "none" }}
              onChange={(e) => { setExtra((p) => [...p, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
          </label>
        </div>
        {extra.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {extra.map((file, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: t.hi, padding: "7px 10px", borderRadius: 8, background: t.card, border: `1px solid ${t.line}` }}>
                <FileText size={13} color={t.mid} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                <button type="button" onClick={() => setExtra((p) => p.filter((_, idx) => idx !== i))}
                  style={{ display: "inline-flex", border: "none", background: "transparent", color: t.mid, cursor: "pointer", padding: 2 }}><XIcon size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {docUploadMsg && (
        <div style={{ fontSize: 11.5, color: docUploadMsg.type === "err" ? t.acc : t.mid, marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{docUploadMsg.text}</span>
          {docUploadMsg.folderUrl && (
            <a href={docUploadMsg.folderUrl} target="_blank" rel="noreferrer" style={{ color: t.blue, fontWeight: 700, textDecoration: "none" }}>Lihat salinan Drive →</a>
          )}
        </div>
      )}
    </div>
  );
}
