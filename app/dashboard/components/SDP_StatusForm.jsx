"use client";
/**
 * SDP_StatusForm.jsx — v3 — pisah MITRA IM3 vs 3KIOSK per CSE
 * Manajemen Status Badan Usaha & Individual SDP Sumatera
 *
 * ROLES:
 *   spm_sumatera → super admin: dashboard, edit semua, verifikasi semua
 *   cse_leader   → edit & verifikasi SDP di clusternya (profile.cluster = "BANDA ACEH")
 *   sdp_user     → edit SDP sendiri + submit selesai (profile.sdp_id = "SDP1182")
 *
 * STATUS FLOW: BELUM → DRAFT → SELESAI → TERVERIFIKASI
 *
 * FORM TEMPLATES (2 berbeda):
 *   BADAN USAHA  → Nama Perusahaan, Email Owner, Email PIC
 *   INDIVIDUAL   → Nama Owner, NIK, No Ottocash, Alamat, Email Owner, Email PIC, No WA
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search, ChevronLeft, ChevronRight, Building2, User, MapPin,
  CheckCircle2, Clock, AlertCircle, X, Save, Send, ShieldCheck,
  Filter, RefreshCw, BarChart3, Users, Eye, Pencil, Phone,
  Mail, CreditCard, FileText, Hash, ChevronDown, ArrowUpRight,
  RotateCcw, Shield, Layers, List, BadgeCheck, Loader2,
  SlidersHorizontal, Activity, Flag, Globe, TrendingUp, Info,
  CheckSquare, Circle,
} from "lucide-react";

// ─── Theme ────────────────────────────────────────────────────────────────────
const mk = (d) => ({
  bg:      d ? "#0D0D0F" : "#F4F4F7",
  card:    d ? "#17171B" : "#FFFFFF",
  sub:     d ? "#1D1D22" : "#F8F8FA",
  line:    d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
  lineS:   d ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
  hi:      d ? "#F1F1F4" : "#141418",
  mid:     d ? "#8A8A9C" : "#52526E",
  lo:      d ? "#4A4A5E" : "#9898B0",
  acc:     "#ED1C24",
  accL:    d ? "rgba(237,28,36,0.13)" : "rgba(237,28,36,0.07)",
  accB:    d ? "rgba(237,28,36,0.28)" : "rgba(237,28,36,0.16)",
  G:       d ? "#30D158" : "#1A9E5A",  GL: d?"rgba(48,209,88,.13)":"rgba(26,158,90,.08)",  GB: d?"rgba(48,209,88,.30)":"rgba(26,158,90,.22)",
  A:       d ? "#FFD60A" : "#C08000",  AL: d?"rgba(255,214,10,.12)":"rgba(192,128,0,.08)", AB: d?"rgba(255,214,10,.28)":"rgba(192,128,0,.20)",
  R:       d ? "#FF453A" : "#DC2626",  RL: d?"rgba(255,69,58,.12)":"rgba(220,38,38,.08)",  RB: d?"rgba(255,69,58,.28)":"rgba(220,38,38,.20)",
  B:       d ? "#0A84FF" : "#0066CC",  BL: d?"rgba(10,132,255,.12)":"rgba(0,102,204,.08)", BB: d?"rgba(10,132,255,.28)":"rgba(0,102,204,.20)",
  P:       d ? "#BF5AF2" : "#8844CC",  PL: d?"rgba(191,90,242,.12)":"rgba(136,68,204,.08)",PB: d?"rgba(191,90,242,.28)":"rgba(136,68,204,.20)",
  // MITRA IM3 = teal tone, 3KIOSK = orange tone
  IM3:  d ? "#32BCAD" : "#1A9E90", IM3L: d ? "rgba(50,188,173,.13)" : "rgba(26,158,144,.08)", IM3B: d ? "rgba(50,188,173,.30)" : "rgba(26,158,144,.22)",
  K3:   d ? "#FF9F0A" : "#C06000", K3L:  d ? "rgba(255,159,10,.13)" : "rgba(192,96,0,.08)",   K3B:  d ? "rgba(255,159,10,.30)" : "rgba(192,96,0,.22)",
  iBg:     d ? "rgba(255,255,255,0.06)" : "#FFFFFF",
  iBd:     d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.11)",
  sm:      d ? "0 1px 4px rgba(0,0,0,.55)"   : "0 1px 3px rgba(0,0,0,.06)",
  md:      d ? "0 6px 20px rgba(0,0,0,.55)"  : "0 6px 18px rgba(0,0,0,.09)",
  lg:      d ? "0 20px 50px rgba(0,0,0,.72)" : "0 20px 48px rgba(0,0,0,.14)",
});

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// ─── Status config ────────────────────────────────────────────────────────────
const SC = {
  BELUM:         { label: "Belum Diisi",   col: "gray",  dot: "#6B7080", Icon: Clock },
  DRAFT:         { label: "Sedang Diisi",  col: "amber", dot: "#FFD60A", Icon: Pencil },
  SELESAI:       { label: "Selesai",       col: "blue",  dot: "#0A84FF", Icon: Send },
  TERVERIFIKASI: { label: "Terverifikasi", col: "green", dot: "#30D158", Icon: BadgeCheck },
};
const COL_MAP = { gray:"lo", green:"G", amber:"A", red:"R", blue:"B", purple:"P", acc:"acc" };

// ─── Cluster type helpers ─────────────────────────────────────────────────────
/**
 * Deteksi tipe SDP dari nama cluster penuh.
 * MC-xxx  → MITRA IM3
 * CS xxx  → 3KIOSK
 * Walaupun cluster_key sama (e.g. "BANDA ACEH"), MC- dan CS- adalah CSE berbeda.
 */
const clusterSdpType = (cluster) => {
  const c = (cluster || "").toUpperCase().trim();
  if (c.startsWith("MC-")) return "MITRA IM3";
  if (c.startsWith("CS ") || c.startsWith("CS-")) return "3KIOSK";
  return null;
};

/** Hilangkan prefix MC-/CS dari cluster untuk tampilan singkat */
const clusterLabel = (cluster) => {
  const c = (cluster || "").trim();
  return c.replace(/^(MC-|CS[-\s]+)/i, "").trim() || c;
};



// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDT = (iso) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
  catch { return iso; }
};
const fmtD = (iso) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}); }
  catch { return iso; }
};

// ─── Global CSS ───────────────────────────────────────────────────────────────
const G = ({ d, t }) => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&display=swap');
    *,*::before,*::after{box-sizing:border-box}
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-thumb{background:${d?"rgba(255,255,255,0.12)":"rgba(0,0,0,0.12)"};border-radius:99px}
    input,button,select,textarea{font-family:${FF};-webkit-font-smoothing:antialiased}
    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes slideR{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
    @keyframes pulse2{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.88)}}
    @keyframes spin{to{transform:rotate(360deg)}}

    .sdp-inp{
      width:100%;background:${t.iBg};border:1px solid ${t.iBd};border-radius:10px;
      padding:11px 13px;font-weight:500;color:${t.hi};outline:none;transition:.14s;
      font-size:15px;appearance:none;-webkit-appearance:none;
    }
    .sdp-inp:focus{border-color:#ED1C24;box-shadow:0 0 0 3px rgba(237,28,36,.13);}
    .sdp-inp::placeholder{color:${t.lo};font-weight:400;}
    .sdp-inp[disabled],.sdp-inp[readonly]{
      background:${d?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.025)"};
      opacity:.75;pointer-events:none;cursor:default;
    }
    .sdp-ta{
      width:100%;background:${t.iBg};border:1px solid ${t.iBd};border-radius:10px;
      padding:11px 13px;font-weight:500;color:${t.hi};outline:none;transition:.14s;
      font-size:15px;resize:vertical;min-height:88px;line-height:1.55;
    }
    .sdp-ta:focus{border-color:#ED1C24;box-shadow:0 0 0 3px rgba(237,28,36,.13);}
    .sdp-ta::placeholder{color:${t.lo};font-weight:400;}
    .sdp-ta[disabled],.sdp-ta[readonly]{
      background:${d?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.025)"};
      opacity:.75;pointer-events:none;
    }
    .sdp-sel{
      width:100%;background:${t.iBg};border:1px solid ${t.iBd};border-radius:10px;
      padding:11px 13px;font-weight:500;color:${t.hi};outline:none;cursor:pointer;
      font-size:15px;appearance:none;-webkit-appearance:none;
    }
    .sdp-sel:focus{border-color:#ED1C24;box-shadow:0 0 0 3px rgba(237,28,36,.13);}
    .sdp-sel option{background:${t.card};color:${t.hi};}

    .sbtn{display:inline-flex;align-items:center;gap:7px;border-radius:10px;border:none;
      cursor:pointer;font-family:${FF};font-weight:700;letter-spacing:-.005em;
      transition:.13s all;white-space:nowrap;flex-shrink:0;}
    .sbtn-sm{padding:8px 14px;font-size:12px;}
    .sbtn-md{padding:10px 18px;font-size:13px;}
    .sbtn-lg{padding:12px 22px;font-size:14px;}
    .sbtn-pri{background:linear-gradient(135deg,#ED1C24,#C6168D);color:#fff;box-shadow:0 2px 10px rgba(237,28,36,.26);}
    .sbtn-pri:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(237,28,36,.36);}
    .sbtn-ghost{background:${t.sub};border:1px solid ${t.line};color:${t.mid};}
    .sbtn-ghost:hover{border-color:${t.accB};color:${t.acc};}
    .sbtn-green{background:${t.GL};border:1px solid ${t.GB};color:${t.G};}
    .sbtn-green:hover{background:${t.G};color:#fff;border-color:${t.G};}
    .sbtn-blue{background:${t.BL};border:1px solid ${t.BB};color:${t.B};}
    .sbtn-blue:hover{background:${t.B};color:#fff;}
    .sbtn-red{background:${t.RL};border:1px solid ${t.RB};color:${t.R};}
    .sbtn-red:hover{background:${t.R};color:#fff;}
    .sbtn:disabled{opacity:.4;cursor:not-allowed;transform:none!important;box-shadow:none!important;}

    .chip{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;
      border:1px solid ${t.line};background:${t.sub};color:${t.mid};cursor:pointer;
      font-size:11.5px;font-weight:600;transition:.12s;white-space:nowrap;font-family:${FF};}
    .chip:hover{border-color:${t.accB};color:${t.acc};}
    .chip.on{border-color:${t.acc};background:${t.accL};color:${t.acc};}

    .sdp-card{background:${t.card};border:1px solid ${t.line};border-radius:14px;box-shadow:${t.sm};}
    .sdp-item{
      background:${t.card};border:1px solid ${t.line};border-radius:13px;
      cursor:pointer;transition:.15s;
    }
    .sdp-item:hover{border-color:${t.accB};transform:translateY(-1px);box-shadow:${t.md};}
    .sdp-item:active{transform:scale(.99);}

    .tr-row:hover>td{background:${d?"rgba(255,255,255,0.025)":"rgba(0,0,0,0.018)"}!important;}
    .lbl{display:block;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${t.mid};margin-bottom:5px;}

    /* Layout */
    @media(max-width:599px){
      .hide-sm{display:none!important;}
      .g2sm{grid-template-columns:1fr!important;}
      .g3sm{grid-template-columns:1fr!important;}
    }
    @media(min-width:600px){
      .show-only-sm{display:none!important;}
    }
  `}</style>
);

// ─── Badge ────────────────────────────────────────────────────────────────────
const Bdg = ({ c = "gray", children, xs }) => {
  const map = {
    gray:   ["rgba(120,120,140,.12)","rgba(120,120,140,.22)","#8A8A9C"],
    green:  [null,null,null,"GL","GB","G"],
    amber:  [null,null,null,"AL","AB","A"],
    red:    [null,null,null,"RL","RB","R"],
    blue:   [null,null,null,"BL","BB","B"],
    purple: [null,null,null,"PL","PB","P"],
    acc:    [null,null,null,"accL","accB","acc"],
  };
  const isGray = c === "gray";
  const s = isGray ? { bg:"rgba(120,120,140,.12)", bd:"rgba(120,120,140,.22)", tx:"#8A8A9C" }
    : { bg:`var(--${c[0]+(c.length>4?c.slice(0,2):c[0])}L)`, bd:`var(--${c[0]}B)`, tx:`var(--${c[0]})` };
  // Use CSS vars via inline style mapping
  const varBg = isGray ? "rgba(120,120,140,.12)" : `var(--${c}L)`;
  const varBd = isGray ? "rgba(120,120,140,.22)" : `var(--${c}B)`;
  const varTx = isGray ? "#8A8A9C"               : `var(--${c})`;
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",gap:3,whiteSpace:"nowrap",
      padding: xs ? "1px 6px" : "3px 8px",
      borderRadius:99, fontSize: xs ? 9 : 11, fontWeight:700,
      background:varBg, border:`1px solid ${varBd}`, color:varTx,
    }}>{children}</span>
  );
};

const StatusBdg = ({ s, xs }) => {
  const cfg = SC[s] || SC.BELUM;
  const Icon = cfg.Icon;
  const c = {BELUM:"gray",DRAFT:"amber",SELESAI:"blue",TERVERIFIKASI:"green"}[s]||"gray";
  return <Bdg c={c} xs={xs}><Icon size={xs?8:10}/>{cfg.label}</Bdg>;
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function SDP_StatusForm({ supabase, theme = "dark", profile }) {
  const d = theme === "dark";
  const t = mk(d);

  // inject CSS vars
  const cssVars = {
    "--G":t.G,"--GL":t.GL,"--GB":t.GB,
    "--A":t.A,"--AL":t.AL,"--AB":t.AB,
    "--R":t.R,"--RL":t.RL,"--RB":t.RB,
    "--B":t.B,"--BL":t.BL,"--BB":t.BB,
    "--P":t.P,"--PL":t.PL,"--PB":t.PB,
    "--acc":t.acc,"--accL":t.accL,"--accB":t.accB,
    "--greenL":t.GL,"--greenB":t.GB,"--green":t.G,
    "--IM3":t.IM3,"--IM3L":t.IM3L,"--IM3B":t.IM3B,
    "--K3":t.K3,"--K3L":t.K3L,"--K3B":t.K3B,
    "--amberL":t.AL,"--amberB":t.AB,"--amber":t.A,
    "--redL":t.RL,"--redB":t.RB,"--red":t.R,
    "--blueL":t.BL,"--blueB":t.BB,"--blue":t.B,
  };

  // ── Roles ─────────────────────────────────────────────────────────────────
  const role   = profile?.role || "sdp_user";
  const isSPM  = role === "spm_sumatera";
  const isCSE  = role === "cse_leader";
  const isSDP  = !isSPM && !isCSE;

  /**
   * KUNCI: profile.cluster menyimpan nama PENUH dengan prefix
   * "MC-BANDA ACEH" = CSE MITRA IM3 Banda Aceh
   * "CS BANDA ACEH" = CSE 3KIOSK Banda Aceh
   * Matching EXACT terhadap sdp_data.cluster (bukan cluster_key)
   */
  const myClusterFull = (profile?.cluster || "").trim().toUpperCase();  // "MC-BANDA ACEH"
  const myClusterType = clusterSdpType(myClusterFull);                  // "MITRA IM3" | "3KIOSK"
  const myClusterName = clusterLabel(myClusterFull);                    // "BANDA ACEH"
  const mySdpId       = profile?.sdp_id || "";
  const myName        = profile?.full_name || profile?.email || "User";

  // ── State ─────────────────────────────────────────────────────────────────
  const [view,    setView]    = useState(isSPM ? "dashboard" : "list");
  const [list,    setList]    = useState([]);
  const [sel,     setSel]     = useState(null);      // selected SDP
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({});
  const [dirty,   setDirty]   = useState(false);
  const [toast,   setToast]   = useState(null);
  const [confirm, setConfirm] = useState(null);      // "draft"|"submit"|"verify"|"reset"
  const [search,  setSearch]  = useState("");
  const [flt,     setFlt]     = useState({ area:"", branch:"", status_usaha:"", status_pengisian:"", sdp_type:"" });
  const [showFlt, setShowFlt] = useState(false);

  const toast$ = useCallback((type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4200);
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      let q = supabase.from("sdp_data").select("*").order("area").order("branch").order("cluster").order("name");
      if (isSDP && mySdpId) q = q.eq("sdp_id", mySdpId);
      const { data, error } = await q;
      if (error) throw error;
      setList(data || []);
    } catch(e) { toast$("error","Gagal memuat: " + e.message); }
    finally { setLoading(false); }
  }, [supabase, isSDP, mySdpId, toast$]);

  useEffect(() => { load(); }, [load]);

  // ── When selection changes, seed form ────────────────────────────────────
  useEffect(() => {
    if (!sel) return;
    setForm({
      nama_perusahaan_owner: sel.nama_perusahaan_owner || "",
      nik:                   sel.nik                   || "",
      no_account_ottocash:   sel.no_account_ottocash   || "",
      alamat:                sel.alamat                || "",
      email_owner:           sel.email_owner           || "",
      email_pic:             sel.email_pic             || "",
      no_whatsapp:           sel.no_whatsapp           || "",
      status_terminated:     sel.status_terminated     || "",
      catatan:               sel.catatan               || "",
    });
    setDirty(false);
  }, [sel]);

  // ── Access helpers ────────────────────────────────────────────────────────
  const canEdit = useCallback((sdp) => {
    if (!sdp) return false;
    if (isSPM) return true;
    if (isCSE) {
      // EXACT match: "MC-BANDA ACEH" != "CS BANDA ACEH"
      // CSE MITRA IM3 tidak bisa edit SDP 3KIOSK di cluster yang sama
      return (sdp.cluster || "").toUpperCase() === myClusterFull;
    }
    return sdp.sdp_id === mySdpId;
  }, [isSPM, isCSE, myClusterFull, mySdpId]);

  const canVerify = useCallback((sdp) => {
    if (!sdp || sdp.status_pengisian !== "SELESAI") return false;
    return isSPM || isCSE;
  }, [isSPM, isCSE]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = [...list];
    // CSE: exact match pada full cluster name (MC- vs CS- terpisah)
    if (isCSE && myClusterFull) {
      r = r.filter(s => (s.cluster || "").toUpperCase() === myClusterFull);
    }
    if (flt.area)             r = r.filter(s => s.area === flt.area);
    if (flt.branch)           r = r.filter(s => s.branch === flt.branch);
    if (flt.status_usaha)     r = r.filter(s => s.status_usaha === flt.status_usaha);
    if (flt.status_pengisian) r = r.filter(s => s.status_pengisian === flt.status_pengisian);
    if (flt.sdp_type)         r = r.filter(s => clusterSdpType(s.cluster) === flt.sdp_type);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.sdp_id?.toLowerCase().includes(q) ||
        s.cluster_key?.toLowerCase().includes(q) ||
        s.branch?.toLowerCase().includes(q) ||
        s.nama_perusahaan_owner?.toLowerCase().includes(q) ||
        s.cluster?.toLowerCase().includes(q)
      );
    }
    return r;
  }, [list, isCSE, myClusterFull, flt, search]);

  // ── Stats (based on scoped list for CSE, full for SPM) ───────────────────
  const scope = useMemo(() => {
    if (!isCSE || !myClusterFull) return list;
    // Exact match: CSE MITRA IM3 hanya lihat MC-xxx, CSE 3KIOSK hanya lihat CS xxx
    return list.filter(s => (s.cluster || "").toUpperCase() === myClusterFull);
  }, [list, isCSE, myClusterFull]);

  const stats = useMemo(() => ({
    total:    scope.length,
    belum:    scope.filter(s => s.status_pengisian === "BELUM").length,
    draft:    scope.filter(s => s.status_pengisian === "DRAFT").length,
    selesai:  scope.filter(s => s.status_pengisian === "SELESAI").length,
    verified: scope.filter(s => s.status_pengisian === "TERVERIFIKASI").length,
    bu:       scope.filter(s => s.status_usaha === "BADAN USAHA").length,
    ind:      scope.filter(s => s.status_usaha === "INDIVIDUAL").length,
    pct:      scope.length
      ? Math.round((scope.filter(s => ["SELESAI","TERVERIFIKASI"].includes(s.status_pengisian)).length / scope.length) * 100)
      : 0,
  }), [scope]);

  // ── Filter options ────────────────────────────────────────────────────────
  const opts = useMemo(() => ({
    areas:    [...new Set(list.map(s => s.area).filter(Boolean))].sort(),
    branches: [...new Set(list.filter(s => !flt.area || s.area === flt.area).map(s => s.branch).filter(Boolean))].sort(),
  }), [list, flt.area]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const doSave = useCallback(async (newStatus) => {
    if (!sel || !supabase) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        ...form,
        updated_by_name: myName,
        updated_at:      new Date().toISOString(),
        status_pengisian: newStatus,
      };
      if (newStatus === "SELESAI") {
        payload.submitted_at        = new Date().toISOString();
        payload.submitted_by        = user?.id;
        payload.submitted_by_name   = myName;
      }
      if (newStatus === "TERVERIFIKASI") {
        payload.verified_at         = new Date().toISOString();
        payload.verified_by         = user?.id;
        payload.verified_by_name    = myName;
      }
      const { error } = await supabase.from("sdp_data").update(payload).eq("id", sel.id);
      if (error) throw error;
      const updated = { ...sel, ...payload };
      setList(p => p.map(s => s.id === sel.id ? updated : s));
      setSel(updated);
      setDirty(false);
      setConfirm(null);
      const msgs = {
        DRAFT:         "Draft tersimpan",
        SELESAI:       "Data dikirim sebagai Selesai ✓",
        TERVERIFIKASI: "Data berhasil diverifikasi ✓",
      };
      toast$("success", msgs[newStatus] || "Tersimpan");
    } catch(e) { toast$("error","Gagal: " + e.message); }
    finally { setSaving(false); }
  }, [sel, supabase, form, myName, toast$]);

  const doReset = useCallback(async () => {
    if (!sel || !supabase) return;
    setSaving(true);
    try {
      const payload = { status_pengisian:"DRAFT", verified_at:null, verified_by:null, verified_by_name:null, updated_by_name:myName, updated_at:new Date().toISOString() };
      const { error } = await supabase.from("sdp_data").update(payload).eq("id", sel.id);
      if (error) throw error;
      const updated = { ...sel, ...payload };
      setList(p => p.map(s => s.id === sel.id ? updated : s));
      setSel(updated);
      setConfirm(null);
      toast$("success","Status direset ke Draft");
    } catch(e) { toast$("error","Gagal: " + e.message); }
    finally { setSaving(false); }
  }, [sel, supabase, myName, toast$]);

  const openDetail = (sdp) => { setSel(sdp); setView("detail"); };
  const goBack     = ()    => { setView(isSPM ? "list" : "list"); setSel(null); setDirty(false); };

  const isBU       = sel?.status_usaha === "BADAN USAHA";
  const selStatus  = sel?.status_pengisian || "BELUM";
  const isVerified = selStatus === "TERVERIFIKASI";
  const editable   = sel ? (canEdit(sel) && !isVerified) || (isSPM) : false;
  const selCanVerify = sel ? canVerify(sel) : false;

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD VIEW (SPM)
  // ─────────────────────────────────────────────────────────────────────────
  const DashView = () => {
    const byArea = useMemo(() => {
      const areas = [...new Set(list.map(s => s.area))].sort();
      return areas.map(area => {
        const L = list.filter(s => s.area === area);
        const done = L.filter(s => ["SELESAI","TERVERIFIKASI"].includes(s.status_pengisian)).length;
        return { area, total:L.length, verified:L.filter(s=>s.status_pengisian==="TERVERIFIKASI").length, selesai:L.filter(s=>s.status_pengisian==="SELESAI").length, draft:L.filter(s=>s.status_pengisian==="DRAFT").length, belum:L.filter(s=>s.status_pengisian==="BELUM").length, pct:L.length?Math.round(done/L.length*100):0 };
      });
    }, []);

    const byClusters = useMemo(() => {
      // Group by FULL cluster name — MC-BANDA ACEH dan CS BANDA ACEH adalah baris BERBEDA
      const fullClusters = [...new Set(list.map(s => s.cluster).filter(Boolean))].sort();
      return fullClusters.map(cluster => {
        const L = list.filter(s => s.cluster === cluster);
        const done = L.filter(s => ["SELESAI","TERVERIFIKASI"].includes(s.status_pengisian)).length;
        const sdpType = clusterSdpType(cluster);
        return {
          cluster,                       // "MC-BANDA ACEH" atau "CS BANDA ACEH"
          ck: clusterLabel(cluster),     // "BANDA ACEH"
          sdpType,                       // "MITRA IM3" | "3KIOSK"
          area: L[0]?.area||"", branch: L[0]?.branch||"",
          total: L.length,
          verified: L.filter(s=>s.status_pengisian==="TERVERIFIKASI").length,
          selesai:  L.filter(s=>s.status_pengisian==="SELESAI").length,
          belum:    L.filter(s=>s.status_pengisian==="BELUM").length,
          pct: L.length?Math.round(done/L.length*100):0,
        };
      }).sort((a,b) => a.pct - b.pct);
    }, []);

    const StatCard = ({ label, val, col, dot }) => (
      <div style={{ padding:"14px 16px", borderRadius:12, background:t.card, border:`1px solid ${t.line}`, boxShadow:t.sm }}>
        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:dot, boxShadow:`0 0 8px ${dot}60`, flexShrink:0 }}/>
          <span style={{ fontSize:10, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:t.mid }}>{label}</span>
        </div>
        <div style={{ fontSize:28, fontWeight:800, letterSpacing:"-.04em", color:t[col]||t.hi, fontVariantNumeric:"tabular-nums", lineHeight:1 }}>{val}</div>
      </div>
    );

    const pctColor = (pct) => pct>=80?t.G:pct>=50?t.A:t.R;

    return (
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {/* Stat cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:10 }}>
          <StatCard label="Total SDP"      val={stats.total}    col="hi"  dot="#8A8A9C"/>
          <StatCard label="Terverifikasi"  val={stats.verified} col="G"   dot={t.G}/>
          <StatCard label="Selesai"        val={stats.selesai}  col="B"   dot={t.B}/>
          <StatCard label="Sedang Diisi"   val={stats.draft}    col="A"   dot={t.A}/>
          <StatCard label="Belum Diisi"    val={stats.belum}    col="R"   dot={t.R}/>
        </div>

        {/* Overall progress */}
        <div style={{ padding:"16px 18px", borderRadius:12, background:t.card, border:`1px solid ${t.line}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <span style={{ fontSize:11, fontWeight:700, letterSpacing:".07em", textTransform:"uppercase", color:t.mid }}>Progress Keseluruhan</span>
            <span style={{ fontSize:22, fontWeight:800, letterSpacing:"-.03em", color:pctColor(stats.pct) }}>{stats.pct}%</span>
          </div>
          <div style={{ height:10, borderRadius:99, background:t.sub, overflow:"hidden" }}>
            <div style={{ height:"100%", borderRadius:99, width:`${stats.pct}%`, transition:"width .7s ease", background:`linear-gradient(90deg,${t.B},${t.G})` }}/>
          </div>
          <div style={{ display:"flex", gap:14, marginTop:8, flexWrap:"wrap" }}>
            {[{c:t.G,l:`${stats.verified} Terverifikasi`},{c:t.B,l:`${stats.selesai} Selesai`},{c:t.A,l:`${stats.draft} Sedang Diisi`},{c:t.R,l:`${stats.belum} Belum`}].map(x=>(
              <div key={x.l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:t.mid }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:x.c }}/>
                <span style={{ color:x.c, fontWeight:600 }}>{x.l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Per area */}
        <div style={{ padding:"16px 18px", borderRadius:12, background:t.card, border:`1px solid ${t.line}` }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:".07em", textTransform:"uppercase", color:t.mid, marginBottom:14 }}>Per Region</div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {byArea.map(a => (
              <div key={a.area}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:t.hi }}>{a.area}</span>
                    <span style={{ fontSize:11, color:t.lo }}>{a.total} SDP</span>
                  </div>
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    {a.verified>0&&<Bdg c="green" xs><BadgeCheck size={7}/>{a.verified}</Bdg>}
                    {a.selesai>0 &&<Bdg c="blue"  xs><Send size={7}/>{a.selesai}</Bdg>}
                    {a.belum>0   &&<Bdg c="red"   xs><Clock size={7}/>{a.belum}</Bdg>}
                    <span style={{ fontSize:12, fontWeight:800, color:pctColor(a.pct), minWidth:30, textAlign:"right" }}>{a.pct}%</span>
                  </div>
                </div>
                <div style={{ height:6, borderRadius:99, background:t.sub, overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:99, width:`${a.pct}%`, background:pctColor(a.pct), transition:"width .5s ease" }}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cluster table */}
        <div style={{ padding:"16px 18px", borderRadius:12, background:t.card, border:`1px solid ${t.line}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
            <div>
              <span style={{ fontSize:11, fontWeight:700, letterSpacing:".07em", textTransform:"uppercase", color:t.mid }}>Detail Per Cluster</span>
              <span style={{ fontSize:10, color:t.lo, marginLeft:8 }}>MITRA IM3 & 3KIOSK ditampilkan terpisah</span>
            </div>
            <Bdg c="red" xs><Clock size={7}/>{byClusters.filter(c=>c.belum>0).length} cluster belum selesai</Bdg>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:560 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${t.line}`, background:t.sub }}>
                  {["Cluster","Tipe","Region","Branch","Total","Terverif.","Selesai","Belum","Progress"].map((h,i)=>(
                    <th key={i} style={{ padding:"7px 10px", textAlign:i===0?"left":"center", fontSize:9, fontWeight:700, letterSpacing:".07em", textTransform:"uppercase", color:t.lo, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byClusters.map(c => (
                  <tr key={c.cluster} className="tr-row" style={{ borderBottom:`1px solid ${t.lineS}`, cursor:"pointer" }}
                    onClick={() => { setFlt(f=>({...f,branch:c.branch,sdp_type:c.sdpType||"",status_pengisian:""})); setView("list"); }}>
                    <td style={{ padding:"8px 10px", fontWeight:600, color:t.hi }}>{c.ck}</td>
                    <td style={{ padding:"8px 10px" }}>
                      {c.sdpType && <span style={{ fontSize:9, fontWeight:700, padding:"1px 7px", borderRadius:99, background:c.sdpType==="MITRA IM3"?t.IM3L:t.K3L, border:`1px solid ${c.sdpType==="MITRA IM3"?t.IM3B:t.K3B}`, color:c.sdpType==="MITRA IM3"?t.IM3:t.K3 }}>{c.sdpType}</span>}
                    </td>
                    <td style={{ padding:"8px 10px", textAlign:"center", color:t.mid, fontSize:11 }}>{c.area}</td>
                    <td style={{ padding:"8px 10px", textAlign:"center", color:t.mid, fontSize:11 }}>{c.branch}</td>
                    <td style={{ padding:"8px 10px", textAlign:"center", fontWeight:700 }}>{c.total}</td>
                    <td style={{ padding:"8px 10px", textAlign:"center" }}>{c.verified>0?<span style={{color:t.G,fontWeight:700}}>{c.verified}</span>:<span style={{color:t.lo}}>—</span>}</td>
                    <td style={{ padding:"8px 10px", textAlign:"center" }}>{c.selesai>0?<span style={{color:t.B,fontWeight:700}}>{c.selesai}</span>:<span style={{color:t.lo}}>—</span>}</td>
                    <td style={{ padding:"8px 10px", textAlign:"center" }}>{c.belum>0?<span style={{color:t.R,fontWeight:700}}>{c.belum}</span>:<span style={{color:t.G}}>✓</span>}</td>
                    <td style={{ padding:"8px 10px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center" }}>
                        <div style={{ width:48, height:4, borderRadius:99, background:t.sub, overflow:"hidden" }}>
                          <div style={{ height:"100%", background:pctColor(c.pct), width:`${c.pct}%` }}/>
                        </div>
                        <span style={{ fontSize:10, fontWeight:800, color:pctColor(c.pct), minWidth:28 }}>{c.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────────────────────────
  const ListView = () => (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {/* Status filter chips */}
      <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:2, flexWrap:"wrap" }}>
        {[
          { k:"", l:"Semua", n:filtered.length },
          { k:"TERVERIFIKASI", l:"Terverifikasi", n:filtered.filter(s=>s.status_pengisian==="TERVERIFIKASI").length },
          { k:"SELESAI",       l:"Selesai",       n:filtered.filter(s=>s.status_pengisian==="SELESAI").length },
          { k:"DRAFT",         l:"Draft",         n:filtered.filter(s=>s.status_pengisian==="DRAFT").length },
          { k:"BELUM",         l:"Belum",         n:filtered.filter(s=>s.status_pengisian==="BELUM").length },
        ].map(x => (
          <button key={x.k} onClick={() => setFlt(f=>({...f,status_pengisian:f.status_pengisian===x.k?"":x.k}))}
            className={`chip${flt.status_pengisian===x.k?" on":""}`}>
            <span style={{ fontVariantNumeric:"tabular-nums", fontWeight:800 }}>{x.n}</span>{x.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", padding:48, gap:10, color:t.mid }}>
          <Loader2 size={20} style={{ animation:"spin 1s linear infinite" }}/>
          <span style={{ fontSize:13, fontWeight:500 }}>Memuat data...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"48px 24px", gap:12, textAlign:"center" }}>
          <div style={{ width:56, height:56, borderRadius:14, background:t.sub, border:`1px solid ${t.line}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Search size={24} style={{ color:t.lo }}/>
          </div>
          <div style={{ fontSize:15, fontWeight:700, color:t.hi }}>Tidak ada data</div>
          <div style={{ fontSize:13, color:t.mid }}>Coba ubah filter atau kata pencarian</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map(sdp => {
            const isBU2 = sdp.status_usaha === "BADAN USAHA";
            const cfg   = SC[sdp.status_pengisian] || SC.BELUM;
            return (
              <div key={sdp.id} className="sdp-item" onClick={() => openDetail(sdp)}
                style={{ padding:"14px 16px" }}>
                <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                  {/* Icon */}
                  <div style={{
                    width:42, height:42, borderRadius:10, flexShrink:0,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    background: isBU2 ? t.BL : t.GL,
                    border:`1px solid ${isBU2 ? t.BB : t.GB}`,
                  }}>
                    {isBU2 ? <Building2 size={19} style={{ color:t.B }}/> : <User size={19} style={{ color:t.G }}/>}
                  </div>

                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:8, marginBottom:4 }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:t.hi, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sdp.name}</div>
                        <div style={{ fontSize:11, color:t.mid, marginTop:1 }}>{sdp.sdp_id} · <span style={{ color:t.lo }}>{sdp.type}</span></div>
                      </div>
                      <StatusBdg s={sdp.status_pengisian} xs/>
                    </div>

                    <div style={{ display:"flex", gap:5, flexWrap:"wrap", alignItems:"center" }}>
                      <Bdg c={isBU2?"blue":"green"} xs>{isBU2?<Building2 size={7}/>:<User size={7}/>}{isBU2?"Badan Usaha":"Individual"}</Bdg>
                      <span style={{ fontSize:10, color:t.lo, display:"flex", alignItems:"center", gap:2 }}>
                        <MapPin size={9}/>{sdp.cluster_key || sdp.cluster}
                      </span>
                      <span style={{ fontSize:10, color:t.lo }}>{sdp.branch}</span>
                      {sdp.status_terminated && <Bdg c="red" xs><Flag size={7}/>Terminated</Bdg>}
                    </div>

                    {sdp.nama_perusahaan_owner && (
                      <div style={{ fontSize:11, color:t.mid, marginTop:5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {isBU2?"Perusahaan":"Owner"}: <strong style={{ color:t.hi }}>{sdp.nama_perusahaan_owner}</strong>
                      </div>
                    )}
                  </div>
                  <ChevronRight size={15} style={{ color:t.lo, flexShrink:0, marginTop:4 }}/>
                </div>

                {/* Progress bar */}
                {sdp.status_pengisian !== "TERVERIFIKASI" && (
                  <div style={{ marginTop:10, height:3, borderRadius:99, background:t.sub, overflow:"hidden" }}>
                    <div style={{
                      height:"100%", borderRadius:99, background:cfg.dot, transition:"width .4s",
                      width: sdp.status_pengisian==="SELESAI"?"100%":sdp.status_pengisian==="DRAFT"?"55%":"0%",
                    }}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DETAIL / FORM VIEW
  // ─────────────────────────────────────────────────────────────────────────
  const DetailView = () => {
    if (!sel) return null;

    const RoField = ({ label, val, icon:Icon }) => !val ? null : (
      <div style={{ display:"flex", gap:9, alignItems:"flex-start" }}>
        {Icon && <Icon size={13} style={{ color:t.lo, flexShrink:0, marginTop:3 }}/>}
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:".07em", textTransform:"uppercase", color:t.lo }}>{label}</div>
          <div style={{ fontSize:12, fontWeight:600, color:t.mid, marginTop:1, wordBreak:"break-word" }}>{val}</div>
        </div>
      </div>
    );

    const Inp = ({ k, placeholder, type="text", ro=false }) => {
      const locked = ro || !editable;
      return (
        <input type={type} className="sdp-inp" value={form[k]||""} placeholder={placeholder}
          readOnly={locked}
          onChange={e => { if (!locked) { setForm(p=>({...p,[k]:e.target.value})); setDirty(true); }}}
          style={locked?{background:d?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.025)",opacity:.78}:{}}
        />
      );
    };
    const Ta = ({ k, placeholder }) => {
      const locked = !editable;
      return (
        <textarea className="sdp-ta" value={form[k]||""} placeholder={placeholder}
          readOnly={locked}
          onChange={e => { if (!locked) { setForm(p=>({...p,[k]:e.target.value})); setDirty(true); }}}
          style={locked?{opacity:.78}:{}}
        />
      );
    };
    const Sel2 = ({ k, opts2 }) => {
      const locked = !editable;
      return (
        <div style={{ position:"relative" }}>
          <select className="sdp-sel" value={form[k]||""} disabled={locked}
            onChange={e => { if (!locked) { setForm(p=>({...p,[k]:e.target.value})); setDirty(true); }}}
            style={locked?{opacity:.78,cursor:"default"}:{cursor:"pointer"}}>
            {opts2.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <ChevronDown size={13} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:t.lo }}/>
        </div>
      );
    };

    const formColor = isBU ? { l:t.BL, b:t.BB, tx:t.B, icon:Building2 } : { l:t.GL, b:t.GB, tx:t.G, icon:User };
    const FormIcon  = formColor.icon;

    return (
      <div style={{ display:"flex", flexDirection:"column", gap:14, paddingBottom:90 }}>

        {/* Header identity card */}
        <div style={{ padding:"16px", borderRadius:14, background:formColor.l, border:`1px solid ${formColor.b}` }}>
          <div style={{ display:"flex", gap:13, alignItems:"flex-start" }}>
            <div style={{ width:48, height:48, borderRadius:12, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:formColor.tx, color:"#fff", boxShadow:`0 4px 12px ${formColor.tx}44` }}>
              <FormIcon size={22}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:15, fontWeight:800, letterSpacing:"-.028em", color:t.hi, marginBottom:5, lineHeight:1.3 }}>{sel.name}</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                <StatusBdg s={selStatus} xs/>
                <Bdg c={isBU?"blue":"green"} xs>{isBU?<Building2 size={7}/>:<User size={7}/>}{isBU?"Badan Usaha":"Individual"}</Bdg>
                {sel.status_terminated && <Bdg c="red" xs><Flag size={7}/>Terminated</Bdg>}
              </div>
            </div>
          </div>
        </div>

        {/* Read-only info */}
        <div style={{ padding:"14px 16px", borderRadius:12, background:t.card, border:`1px solid ${t.line}` }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:t.mid, marginBottom:12 }}>Informasi SDP (Tidak dapat diedit)</div>
          <div className="g2sm" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <RoField label="SDP ID"    val={sel.sdp_id}                     icon={Hash}/>
            <RoField label="Tipe"      val={sel.type}                       icon={Layers}/>
            <RoField label="PT/TS ID"  val={sel.pt_name_ts_id}              icon={FileText}/>
            <RoField label="SDP Live"  val={sel.sdp_live}                   icon={Clock}/>
            <RoField label="Cluster"   val={sel.cluster_key||sel.cluster}   icon={Users}/>
            <RoField label="Branch"    val={sel.branch}                     icon={MapPin}/>
            <RoField label="Region"    val={sel.area}                       icon={Globe}/>
            <RoField label="Status Usaha" val={sel.status_usaha}            icon={Shield}/>
          </div>
        </div>

        {/* ── BADAN USAHA FORM ── */}
        {isBU && (
          <div style={{ padding:"16px", borderRadius:12, background:t.card, border:`1px solid ${t.BB}` }}>
            <div style={{ display:"flex", gap:9, alignItems:"center", marginBottom:16, padding:"10px 12px", borderRadius:9, background:t.BL, border:`1px solid ${t.BB}` }}>
              <Building2 size={16} style={{ color:t.B, flexShrink:0 }}/>
              <div>
                <div style={{ fontSize:11, fontWeight:800, letterSpacing:".01em", color:t.B }}>Template Badan Usaha</div>
                <div style={{ fontSize:10, color:t.mid, marginTop:1 }}>Isi data perusahaan/badan hukum pemilik SDP ini</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <label className="lbl">Nama Perusahaan / Badan Usaha <span style={{ color:t.acc }}>*</span></label>
                <Inp k="nama_perusahaan_owner" placeholder="PT / CV / Koperasi / Badan Usaha..."/>
              </div>
              <div>
                <label className="lbl">Email Owner / Mitra IM3 / 3Kiosk</label>
                <Inp k="email_owner" placeholder="email@perusahaan.com" type="email"/>
              </div>
              <div>
                <label className="lbl">Email PIC Mitra IM3 / 3Kiosk</label>
                <Inp k="email_pic" placeholder="pic.email@perusahaan.com"/>
              </div>
              <div>
                <label className="lbl">Status Terminated</label>
                <Sel2 k="status_terminated" opts2={[{v:"",l:"— Tidak Terminated —"},{v:"TERMINATED",l:"TERMINATED"}]}/>
              </div>
              <div>
                <label className="lbl">Catatan (opsional)</label>
                <Ta k="catatan" placeholder="Catatan untuk CSE atau SPM..."/>
              </div>
            </div>
          </div>
        )}

        {/* ── INDIVIDUAL FORM ── */}
        {!isBU && (
          <div style={{ padding:"16px", borderRadius:12, background:t.card, border:`1px solid ${t.GB}` }}>
            <div style={{ display:"flex", gap:9, alignItems:"center", marginBottom:16, padding:"10px 12px", borderRadius:9, background:t.GL, border:`1px solid ${t.GB}` }}>
              <User size={16} style={{ color:t.G, flexShrink:0 }}/>
              <div>
                <div style={{ fontSize:11, fontWeight:800, letterSpacing:".01em", color:t.G }}>Template Individual / Perorangan</div>
                <div style={{ fontSize:10, color:t.mid, marginTop:1 }}>Isi data pribadi pemilik / penanggung jawab SDP</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <label className="lbl">Nama Lengkap Owner <span style={{ color:t.acc }}>*</span></label>
                <Inp k="nama_perusahaan_owner" placeholder="Nama sesuai KTP..."/>
              </div>
              <div className="g2sm" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div>
                  <label className="lbl">NIK</label>
                  <Inp k="nik" placeholder="16 digit NIK..."/>
                </div>
                <div>
                  <label className="lbl">No. WhatsApp</label>
                  <Inp k="no_whatsapp" placeholder="62812xxxxxxxx..."/>
                </div>
              </div>
              <div>
                <label className="lbl">No. Akun Ottocash</label>
                <Inp k="no_account_ottocash" placeholder="Nomor akun Ottocash..."/>
              </div>
              <div>
                <label className="lbl">Alamat Lengkap <span style={{ color:t.acc }}>*</span></label>
                <Ta k="alamat" placeholder="Jl. Nama Jalan No.XX, Dusun/RT/RW, Desa/Kelurahan, Kecamatan, Kabupaten/Kota, Provinsi, Kode Pos..."/>
              </div>
              <div>
                <label className="lbl">Email Owner / Mitra IM3 / 3Kiosk</label>
                <Inp k="email_owner" placeholder="email@gmail.com" type="email"/>
              </div>
              <div>
                <label className="lbl">Email PIC Mitra IM3 / 3Kiosk</label>
                <Inp k="email_pic" placeholder="pic@email.com"/>
              </div>
              <div>
                <label className="lbl">Status Terminated</label>
                <Sel2 k="status_terminated" opts2={[{v:"",l:"— Tidak Terminated —"},{v:"TERMINATED",l:"TERMINATED"}]}/>
              </div>
              <div>
                <label className="lbl">Catatan (opsional)</label>
                <Ta k="catatan" placeholder="Catatan untuk CSE atau Tim SPM..."/>
              </div>
            </div>
          </div>
        )}

        {/* Riwayat */}
        {(sel.submitted_at || sel.verified_at || sel.updated_by_name) && (
          <div style={{ padding:"14px 16px", borderRadius:12, background:t.card, border:`1px solid ${t.line}` }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:t.mid, marginBottom:12 }}>Riwayat Perubahan</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {sel.verified_at && (
                <div style={{ display:"flex", gap:10 }}>
                  <div style={{ width:9, height:9, borderRadius:"50%", background:t.G, flexShrink:0, marginTop:4, boxShadow:`0 0 8px ${t.G}60` }}/>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:t.G }}>Terverifikasi</div>
                    <div style={{ fontSize:11, color:t.lo, marginTop:1 }}>{fmtDT(sel.verified_at)} · {sel.verified_by_name||"—"}</div>
                  </div>
                </div>
              )}
              {sel.submitted_at && (
                <div style={{ display:"flex", gap:10 }}>
                  <div style={{ width:9, height:9, borderRadius:"50%", background:t.B, flexShrink:0, marginTop:4, boxShadow:`0 0 8px ${t.B}60` }}/>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:t.B }}>Dikirim sebagai Selesai</div>
                    <div style={{ fontSize:11, color:t.lo, marginTop:1 }}>{fmtDT(sel.submitted_at)} · {sel.submitted_by_name||"—"}</div>
                  </div>
                </div>
              )}
              {sel.updated_by_name && (
                <div style={{ display:"flex", gap:10 }}>
                  <div style={{ width:9, height:9, borderRadius:"50%", background:t.A, flexShrink:0, marginTop:4 }}/>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:t.hi }}>Terakhir diupdate</div>
                    <div style={{ fontSize:11, color:t.lo, marginTop:1 }}>{fmtDT(sel.updated_at)} · {sel.updated_by_name}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SPM: reset button */}
        {isSPM && isVerified && (
          <button className="sbtn sbtn-sm sbtn-ghost" style={{ alignSelf:"flex-start" }} onClick={() => setConfirm("reset")}>
            <RotateCcw size={12}/>Reset ke Draft
          </button>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIRM MODAL
  // ─────────────────────────────────────────────────────────────────────────
  const ConfirmModal = () => {
    if (!confirm) return null;
    const cfgs = {
      draft:  { title:"Simpan Draft?",           desc:"Data disimpan sebagai draft, belum dikirim.",         icon:Save,       col:t.A,  fn:()=>doSave(selStatus==="BELUM"?"DRAFT":selStatus) },
      submit: { title:"Kirim sebagai Selesai?",  desc:"Data ditandai Selesai dan siap diverifikasi CSE/SPM.", icon:Send,       col:t.B,  fn:()=>doSave("SELESAI") },
      verify: { title:"Verifikasi Data?",         desc:"Data ditandai Terverifikasi. Pastikan semua isian sudah benar dan lengkap.", icon:BadgeCheck, col:t.G, fn:()=>doSave("TERVERIFIKASI") },
      reset:  { title:"Reset Verifikasi?",        desc:"Status kembali ke Draft. CSE/SDP perlu submit ulang.", icon:RotateCcw,  col:t.A,  fn:doReset },
    };
    const c = cfgs[confirm];
    if (!c) return null;
    const Icon = c.icon;
    return (
      <div style={{ position:"fixed", inset:0, zIndex:500, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:"0 0 0 0", background:"rgba(0,0,0,0.62)", backdropFilter:"blur(14px)" }}
        onClick={() => setConfirm(null)}>
        <div style={{ maxWidth:400, width:"100%", background:t.card, border:`1px solid ${t.line}`, borderRadius:"20px 20px 0 0", boxShadow:t.lg, padding:"6px 0 0", overflow:"hidden" }}
          onClick={e => e.stopPropagation()}>
          {/* Drag handle */}
          <div style={{ display:"flex", justifyContent:"center", padding:"8px 0 4px" }}>
            <div style={{ width:36, height:4, borderRadius:99, background:t.line }}/>
          </div>
          <div style={{ padding:"12px 24px 28px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
              <div style={{ width:44, height:44, borderRadius:11, background:c.col+"22", border:`1px solid ${c.col}44`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Icon size={20} style={{ color:c.col }}/>
              </div>
              <div>
                <div style={{ fontSize:16, fontWeight:800, letterSpacing:"-.025em", color:t.hi }}>{c.title}</div>
                <div style={{ fontSize:12, color:t.mid, marginTop:3, lineHeight:1.55 }}>{c.desc}</div>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button className="sbtn sbtn-lg" style={{ background:c.col, color:"#fff", justifyContent:"center", width:"100%" }} onClick={c.fn} disabled={saving}>
                {saving ? <Loader2 size={15} style={{ animation:"spin 1s linear infinite" }}/> : <Icon size={15}/>}
                {c.title}
              </button>
              <button className="sbtn sbtn-lg sbtn-ghost" style={{ justifyContent:"center", width:"100%" }} onClick={() => setConfirm(null)}>Batal</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ width:"100%", fontFamily:FF, color:t.hi, WebkitFontSmoothing:"antialiased", position:"relative", ...cssVars }}>
      <G d={d} t={t}/>
      <ConfirmModal/>

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:66, right:16, zIndex:999, maxWidth:318, background:t.card, border:`1px solid ${toast.type==="success"?t.GB:t.RB}`, borderRadius:13, boxShadow:t.lg, overflow:"hidden", animation:"fadeUp .17s ease" }}>
          <div style={{ display:"flex", gap:10, padding:"12px 14px", alignItems:"flex-start" }}>
            <div style={{ width:28, height:28, borderRadius:7, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:toast.type==="success"?t.G:t.R, color:"#fff" }}>
              {toast.type==="success"?<CheckCircle2 size={14}/>:<AlertCircle size={14}/>}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:700, color:t.hi }}>{toast.type==="success"?"Berhasil":"Gagal"}</div>
              <div style={{ fontSize:11, color:t.mid, marginTop:2, lineHeight:1.5 }}>{toast.msg}</div>
            </div>
            <button onClick={() => setToast(null)} style={{ background:"none", border:"none", cursor:"pointer", color:t.lo, padding:2 }}><X size={12}/></button>
          </div>
          <div style={{ height:2, background:toast.type==="success"?t.G:t.R, opacity:.8 }}/>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ marginBottom:16 }}>
        {view === "detail" && (
          <button onClick={goBack} style={{ display:"inline-flex", alignItems:"center", gap:5, background:"none", border:"none", cursor:"pointer", color:t.mid, fontSize:13, fontWeight:500, padding:"4px 0 12px", fontFamily:FF }}>
            <ChevronLeft size={15}/> Kembali ke Daftar
          </button>
        )}

        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:"linear-gradient(135deg,#ED1C24,#C6168D)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", flexShrink:0, boxShadow:"0 2px 10px rgba(237,28,36,.28)" }}>
              <Activity size={19}/>
            </div>
            <div>
              <h1 style={{ margin:0, fontSize:view==="detail"?15:18, fontWeight:800, letterSpacing:"-.035em", color:t.hi, lineHeight:1.2 }}>
                {view==="detail" ? sel?.name : "Status Badan Usaha & Individual"}
              </h1>
              <div style={{ fontSize:11, color:t.mid, marginTop:2 }}>
                {isSPM ? "Super Admin · Seluruh SDP Sumatera" : isCSE ? `CSE ${myClusterType || ""} · ${myClusterName}` : `SDP · ${mySdpId}`}
              </div>
            </div>
          </div>

          {view !== "detail" && (
            <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
              {isSPM && (
                <>
                  <button onClick={() => setView("dashboard")} className={`sbtn sbtn-sm ${view==="dashboard"?"sbtn-pri":"sbtn-ghost"}`}>
                    <BarChart3 size={13}/>Dashboard
                  </button>
                  <button onClick={() => setView("list")} className={`sbtn sbtn-sm ${view==="list"?"sbtn-pri":"sbtn-ghost"}`}>
                    <List size={13}/>Daftar
                  </button>
                </>
              )}
              <button onClick={load} disabled={loading} className="sbtn sbtn-sm sbtn-ghost">
                <RefreshCw size={13} style={loading?{animation:"spin 1s linear infinite"}:{}}/>
                <span className="hide-sm">Refresh</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── SEARCH + FILTER BAR (list view) ── */}
      {view === "list" && (
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          <div style={{ flex:1, position:"relative" }}>
            <Search size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:t.lo, pointerEvents:"none" }}/>
            <input className="sdp-inp" style={{ paddingLeft:36, borderRadius:10 }}
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={isCSE ? `Cari SDP ${myClusterType||""} di ${myClusterName}...` : "Cari nama, ID, cluster, branch..."}
            />
            {search && <button onClick={()=>setSearch("")} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:t.lo, padding:3, display:"flex" }}><X size={13}/></button>}
          </div>
          {(isSPM) && (
            <button onClick={() => setShowFlt(f=>!f)} className={`sbtn sbtn-sm ${showFlt?"sbtn-pri":"sbtn-ghost"}`}>
              <SlidersHorizontal size={13}/>
              <span className="hide-sm">Filter</span>
              {Object.values(flt).some(Boolean) && <div style={{ width:6, height:6, borderRadius:"50%", background:t.acc, marginLeft:2 }}/>}
            </button>
          )}
        </div>
      )}

      {/* Filter panel */}
      {view === "list" && showFlt && isSPM && (
        <div style={{ padding:"14px 16px", borderRadius:12, background:t.card, border:`1px solid ${t.line}`, marginBottom:12 }}>
          <div className="g2sm" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            <div>
              <label className="lbl">Region</label>
              <div style={{ position:"relative" }}>
                <select className="sdp-sel" value={flt.area} onChange={e => setFlt(f=>({...f,area:e.target.value,branch:""}))}>
                  <option value="">Semua Region</option>
                  {opts.areas.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <ChevronDown size={13} style={{ position:"absolute", right:11, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:t.lo }}/>
              </div>
            </div>
            <div>
              <label className="lbl">Branch</label>
              <div style={{ position:"relative" }}>
                <select className="sdp-sel" value={flt.branch} onChange={e => setFlt(f=>({...f,branch:e.target.value}))}>
                  <option value="">Semua Branch</option>
                  {opts.branches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <ChevronDown size={13} style={{ position:"absolute", right:11, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:t.lo }}/>
              </div>
            </div>
            <div>
              <label className="lbl">Status Usaha</label>
              <div style={{ position:"relative" }}>
                <select className="sdp-sel" value={flt.status_usaha} onChange={e => setFlt(f=>({...f,status_usaha:e.target.value}))}>
                  <option value="">Semua</option>
                  <option value="BADAN USAHA">Badan Usaha</option>
                  <option value="INDIVIDUAL">Individual</option>
                </select>
                <ChevronDown size={13} style={{ position:"absolute", right:11, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:t.lo }}/>
              </div>
            </div>
            <div>
              <label className="lbl">Tipe SDP (MC / CS)</label>
              <div style={{ position:"relative" }}>
                <select className="sdp-sel" value={flt.sdp_type} onChange={e => setFlt(f=>({...f,sdp_type:e.target.value}))}>
                  <option value="">Semua Tipe</option>
                  <option value="MITRA IM3">MITRA IM3 (MC-)</option>
                  <option value="3KIOSK">3KIOSK (CS)</option>
                </select>
                <ChevronDown size={13} style={{ position:"absolute", right:11, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color:t.lo }}/>
              </div>
            </div>
          </div>
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <button className="sbtn sbtn-sm sbtn-ghost" onClick={() => setFlt({area:"",branch:"",status_usaha:"",status_pengisian:"",sdp_type:""})}>
              <X size={11}/>Reset Filter
            </button>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      {view === "dashboard" && <DashView/>}
      {view === "list"      && <ListView/>}
      {view === "detail"    && <DetailView/>}

      {/* ── STICKY BOTTOM ACTION BAR (detail view) ── */}
      {view === "detail" && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:60, background:d?"rgba(13,13,15,0.96)":"rgba(255,255,255,0.96)", backdropFilter:"blur(22px)", WebkitBackdropFilter:"blur(22px)", borderTop:`1px solid ${t.line}`, padding:"10px 16px" }}>
          <div style={{ maxWidth:640, margin:"0 auto", display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end", alignItems:"center" }}>

            {/* Info untuk sdp/cse jika sudah verified */}
            {isVerified && !isSPM && (
              <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, fontSize:12, color:t.G, fontWeight:600 }}>
                <BadgeCheck size={14}/> Data telah diverifikasi
              </div>
            )}

            {/* Save draft */}
            {editable && dirty && !isVerified && (
              <button className="sbtn sbtn-md sbtn-ghost" onClick={() => setConfirm("draft")} disabled={saving}>
                {saving?<Loader2 size={13} style={{animation:"spin 1s linear infinite"}}/>:<Save size={13}/>}
                <span className="hide-sm">Draft</span>
              </button>
            )}

            {/* Submit sebagai Selesai (SDP/CSE) */}
            {editable && !isVerified && ["BELUM","DRAFT"].includes(selStatus) && (
              <button className="sbtn sbtn-md sbtn-blue" onClick={async () => { if (dirty) await doSave(selStatus==="BELUM"?"DRAFT":selStatus); setConfirm("submit"); }} disabled={saving}>
                <Send size={13}/>Tandai Selesai
              </button>
            )}

            {/* Verifikasi (CSE & SPM) */}
            {selCanVerify && (
              <button className="sbtn sbtn-md sbtn-green" onClick={() => setConfirm("verify")} disabled={saving}>
                <BadgeCheck size={13}/>Verifikasi Data
              </button>
            )}

            {/* SPM: save jika sudah verified */}
            {isSPM && isVerified && dirty && (
              <button className="sbtn sbtn-md sbtn-pri" onClick={() => doSave("TERVERIFIKASI")} disabled={saving}>
                {saving?<Loader2 size={13} style={{animation:"spin 1s linear infinite"}}/>:<ShieldCheck size={13}/>}
                Simpan Perubahan
              </button>
            )}

            {/* SPM: langsung verifikasi tanpa submit dulu */}
            {isSPM && !isVerified && selStatus !== "SELESAI" && editable && (
              <button className="sbtn sbtn-md sbtn-pri" onClick={() => setConfirm("verify")} disabled={saving}>
                <ShieldCheck size={13}/>Verifikasi (Admin)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}