"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import supabase from "../../../lib/supabase";
import {
  Loader2, LogOut, Sun, Moon, Upload, Plus, Trash2,
  Search, ChevronLeft, ChevronRight, X, Check, AlertTriangle,
  MapPin, ArrowLeft, RefreshCw,
} from "lucide-react";
import { HubLogo } from "../../../components/HubLogo";

const TEAL = "#32BCAD";
const RED  = "#ED1C24";
const MAGA = "#C6168D";
const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

const mk = (d) => ({
  bg:     d ? "#0A0A0B" : "#F4F4F6",
  card:   d ? "#141417" : "#FFFFFF",
  card2:  d ? "#1A1A1E" : "#F8F8FA",
  line:   d ? "#22222A" : "#E4E2EA",
  hi:     d ? "#F0F0F2" : "#111116",
  mid:    d ? "#7A7A88" : "#5A5A68",
  lo:     d ? "#4A4A58" : "#C8C5D0",
  sub:    d ? "#1A1A1E" : "#F2F2F4",
  field:  d ? "rgba(255,255,255,0.05)" : "#F8F8FB",
  tealBg: d ? "rgba(50,188,173,0.10)" : "rgba(50,188,173,0.07)",
  tealBd: d ? "rgba(50,188,173,0.28)" : "rgba(50,188,173,0.20)",
});

const ADMIN_ROLES = ["spm_sumatera", "finance_mpx", "internal_ioh"];
const PAGE_SIZE = 50;

// ── Toast ──────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  const bg = type === "error" ? "#DC2626" : type === "warn" ? "#D97706" : "#16A34A";
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px", borderRadius: 12,
      background: bg, color: "#fff",
      fontSize: 13.5, fontWeight: 600, fontFamily: FONT,
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      maxWidth: 380, animation: "slideUp 0.2s ease",
    }}>
      {type === "error" ? <AlertTriangle size={15}/> : <Check size={15}/>}
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0 }}>
        <X size={14}/>
      </button>
    </div>
  );
}

// ── Delete confirm modal ───────────────────────────────────────────────────────
function DeleteModal({ row, onConfirm, onCancel, d }) {
  const t = mk(d);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{ background: t.card, borderRadius: 16, padding: 28, maxWidth: 380, width: "100%", border: `1px solid ${t.line}` }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: t.hi, marginBottom: 8 }}>Hapus Mapping?</div>
        <div style={{ fontSize: 13.5, color: t.mid, marginBottom: 20, lineHeight: 1.6 }}>
          <b style={{ color: t.hi }}>{row.mc}</b> / <b style={{ color: t.hi }}>{row.cluster}</b><br/>
          Branch: {row.branch} · {row.region}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
            Batal
          </button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: "#DC2626", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MappingPage() {
  const router  = useRouter();
  const [d, setD] = useState(true);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [token, setToken]       = useState(null);

  // ── Data state ──
  const [rows, setRows]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [regions, setRegions] = useState([]);
  const [branches, setBranches] = useState([]);

  // ── Add form state ──
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState({ circle: "SUMATERA", region: "", area: "", branch: "", mc: "", cluster: "" });
  const [addLoading, setAddLoading] = useState(false);

  // ── CSV upload state ──
  const [showUpload, setShowUpload] = useState(false);
  const [csvText, setCsvText]   = useState("");
  const [csvMode, setCsvMode]   = useState("upsert");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult]   = useState(null);
  const fileRef = useRef(null);

  // ── Delete state ──
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Toast ──
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "ok") => setToast({ msg, type });

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setD(localStorage.getItem("sh-theme") !== "light");
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/sandra/login"); return; }

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (!prof || !ADMIN_ROLES.includes(prof.role)) {
        router.replace("/dashboard");
        return;
      }
      setProfile(prof);
      setToken(session.access_token);
      setLoading(false);
    })();
  }, [router]);

  // ── Fetch rows ────────────────────────────────────────────────────────────
  const fetchRows = useCallback(async (pg = 1, srch = search, reg = filterRegion, br = filterBranch) => {
    setFetching(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: PAGE_SIZE });
      if (srch)  params.set("search", srch);
      if (reg)   params.set("region", reg);
      if (br)    params.set("branch", br);
      const res  = await fetch(`/api/mc-cluster?${params}`);
      const json = await res.json();
      setRows(json.data ?? []);
      setTotal(json.count ?? 0);
      setPage(pg);
    } finally {
      setFetching(false);
    }
  }, [search, filterRegion, filterBranch]);

  // ── Fetch filter options ──────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase
        .from("mc_cluster_mapping")
        .select("region, branch");
      if (data) {
        setRegions([...new Set(data.map(r => r.region))].sort());
        setBranches([...new Set(data.map(r => r.branch))].sort());
      }
    })();
  }, [profile]);

  useEffect(() => { if (profile) fetchRows(1); }, [profile]); // eslint-disable-line

  // Auto-fill area from region when typing
  useEffect(() => {
    if (addForm.region) setAddForm(f => ({ ...f, area: f.region }));
  }, [addForm.region]);

  const t = mk(d);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    fetchRows(1, searchInput, filterRegion, filterBranch);
  };

  const handleRegionFilter = (val) => {
    setFilterRegion(val);
    setFilterBranch("");
    fetchRows(1, search, val, "");
  };

  const handleBranchFilter = (val) => {
    setFilterBranch(val);
    fetchRows(1, search, filterRegion, val);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setAddLoading(true);
    try {
      const res = await fetch("/api/mc-cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(addForm),
      });
      const json = await res.json();
      if (!json.success) { showToast(json.message, "error"); return; }
      showToast("Berhasil ditambahkan!");
      setShowAdd(false);
      setAddForm({ circle: "SUMATERA", region: "", area: "", branch: "", mc: "", cluster: "" });
      fetchRows(1);
      // Refresh filter options
      const { data } = await supabase.from("mc_cluster_mapping").select("region, branch");
      if (data) {
        setRegions([...new Set(data.map(r => r.region))].sort());
        setBranches([...new Set(data.map(r => r.branch))].sort());
      }
    } finally {
      setAddLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file, "utf-8");
  };

  const handleUpload = async () => {
    if (!csvText.trim()) { showToast("Pilih file CSV terlebih dahulu.", "error"); return; }
    setUploadLoading(true);
    setUploadResult(null);
    try {
      const res = await fetch("/api/mc-cluster/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csv: csvText, mode: csvMode }),
      });
      const json = await res.json();
      setUploadResult(json);
      if (json.success) {
        showToast(json.message);
        fetchRows(1);
        // Refresh filter options
        const { data } = await supabase.from("mc_cluster_mapping").select("region, branch");
        if (data) {
          setRegions([...new Set(data.map(r => r.region))].sort());
          setBranches([...new Set(data.map(r => r.branch))].sort());
        }
      } else {
        showToast(json.message, "error");
      }
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/mc-cluster", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const json = await res.json();
      if (!json.success) { showToast(json.message, "error"); return; }
      showToast("Data berhasil dihapus.");
      setDeleteTarget(null);
      fetchRows(page);
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleTheme = () => {
    const n = !d; setD(n);
    localStorage.setItem("sh-theme", n ? "dark" : "light");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/sandra/login");
  };

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: d ? "#0A0A0B" : "#F4F4F6" }}>
      <Loader2 size={26} color={TEAL} style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Shared input style ─────────────────────────────────────────────────────
  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 9,
    border: `1px solid ${t.line}`, background: t.field,
    color: t.hi, fontSize: 13.5, fontFamily: FONT,
    outline: "none", boxSizing: "border-box",
  };
  const selectStyle = { ...inputStyle, cursor: "pointer" };
  const labelStyle  = { fontSize: 12, fontWeight: 600, color: t.mid, marginBottom: 4, display: "block" };

  return (
    <div style={{ minHeight: "100svh", fontFamily: FONT, background: t.bg, color: t.hi, WebkitFontSmoothing: "antialiased" }}>

      {/* Background mesh */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-15%", left: "-8%", width: "55vw", height: "55vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(237,28,36,0.05) 0%,transparent 70%)", filter: "blur(2px)" }} />
        <div style={{ position: "absolute", bottom: "-10%", right: "-5%", width: "45vw", height: "45vw", borderRadius: "50%", background: "radial-gradient(circle,rgba(198,22,141,0.04) 0%,transparent 70%)", filter: "blur(2px)" }} />
      </div>

      {/* Nav */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: `1px solid ${t.line}`, background: d ? "rgba(10,10,11,0.85)" : "rgba(244,244,246,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => router.push("/dashboard")} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.line}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
              <ArrowLeft size={14} />
            </button>
            <HubLogo variant="sandra" size={28} shadow inBox />
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.04em", color: t.hi, lineHeight: 1 }}>
              Sandra<span style={{ background: `linear-gradient(90deg,${RED},${MAGA})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Hub</span>
            </div>
            <div style={{ width: 1, height: 16, background: t.line, margin: "0 4px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 6, background: t.tealBg, border: `1px solid ${t.tealBd}` }}>
              <MapPin size={11} color={TEAL} strokeWidth={2.5} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: TEAL, letterSpacing: 0.2 }}>MC / Cluster Mapping</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={toggleTheme} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${t.line}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
              {d ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 5px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: `linear-gradient(135deg,${RED},${MAGA})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800 }}>
                {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.hi }}>{profile?.full_name}</div>
            </div>
            <button onClick={handleLogout} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${t.line}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi }}>MC / Cluster Mapping</div>
            <div style={{ fontSize: 13, color: t.mid, marginTop: 4 }}>
              {total.toLocaleString()} entri terdaftar · Mapping IM3 (MC) dan 3ID (Cluster) per branch
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setShowUpload(v => !v); setShowAdd(false); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: `1px solid ${t.line}`, background: showUpload ? t.tealBg : "transparent", color: showUpload ? TEAL : t.mid, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
              <Upload size={14} /> Upload CSV
            </button>
            <button onClick={() => { setShowAdd(v => !v); setShowUpload(false); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              <Plus size={14} /> Tambah
            </button>
          </div>
        </div>

        {/* ── CSV Upload panel ─────────────────────────────────────────────── */}
        {showUpload && (
          <div style={{ marginBottom: 20, padding: 20, borderRadius: 16, border: `1px solid ${t.line}`, background: t.card }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, marginBottom: 16 }}>Upload CSV</div>

            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={labelStyle}>File CSV</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{ padding: "20px 16px", borderRadius: 10, border: `2px dashed ${t.line}`, background: t.field, textAlign: "center", cursor: "pointer" }}
                >
                  <Upload size={20} color={t.lo} style={{ margin: "0 auto 8px" }} />
                  <div style={{ fontSize: 13, color: t.mid }}>
                    {csvText ? <span style={{ color: TEAL, fontWeight: 600 }}>✓ File dimuat ({csvText.split("\n").length - 1} baris)</span> : "Klik untuk pilih file .csv"}
                  </div>
                  <div style={{ fontSize: 11, color: t.lo, marginTop: 4 }}>Format: CIRCLE;REGION;AREA;BRANCH;MC;CLUSTER</div>
                  <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileChange} style={{ display: "none" }} />
                </div>
              </div>

              <div style={{ minWidth: 200 }}>
                <label style={labelStyle}>Mode Upload</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                  {[
                    { val: "upsert", label: "Upsert", desc: "Tambah baru + update yang sudah ada" },
                    { val: "replace", label: "Replace All", desc: "Hapus semua data lama, ganti dengan CSV baru" },
                  ].map(opt => (
                    <label key={opt.val} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                      <input type="radio" value={opt.val} checked={csvMode === opt.val} onChange={() => setCsvMode(opt.val)} style={{ marginTop: 3 }} />
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: t.hi }}>{opt.label}</div>
                        <div style={{ fontSize: 12, color: t.mid }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {csvMode === "replace" && (
                  <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertTriangle size={13} color="#DC2626" />
                    <span style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>Semua data lama akan dihapus!</span>
                  </div>
                )}
              </div>
            </div>

            {uploadResult && (
              <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: uploadResult.success ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)", border: `1px solid ${uploadResult.success ? "rgba(22,163,74,0.2)" : "rgba(220,38,38,0.2)"}` }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: uploadResult.success ? "#16A34A" : "#DC2626" }}>{uploadResult.message}</div>
                {uploadResult.errors?.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: t.mid }}>
                    {uploadResult.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                    {uploadResult.errors.length > 5 && <div>...dan {uploadResult.errors.length - 5} lainnya</div>}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleUpload}
                disabled={uploadLoading || !csvText}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: uploadLoading || !csvText ? "not-allowed" : "pointer", opacity: uploadLoading || !csvText ? 0.6 : 1, fontFamily: FONT }}
              >
                {uploadLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />}
                {uploadLoading ? "Mengupload..." : "Upload"}
              </button>
              <button onClick={() => { setShowUpload(false); setCsvText(""); setUploadResult(null); }} style={{ padding: "9px 16px", borderRadius: 10, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                Batal
              </button>
            </div>
          </div>
        )}

        {/* ── Add form panel ─────────────────────────────────────────────────── */}
        {showAdd && (
          <div style={{ marginBottom: 20, padding: 20, borderRadius: 16, border: `1px solid ${t.line}`, background: t.card }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.hi, marginBottom: 16 }}>Tambah MC / Cluster Baru</div>
            <form onSubmit={handleAddSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
                {[
                  { key: "circle",  label: "Circle",  ph: "SUMATERA" },
                  { key: "region",  label: "Region",  ph: "CENTRAL SUMATERA" },
                  { key: "area",    label: "Area",    ph: "Auto-filled dari Region" },
                  { key: "branch",  label: "Branch",  ph: "PEKANBARU" },
                  { key: "mc",      label: "MC (IM3)", ph: "MC-PEKANBARU" },
                  { key: "cluster", label: "Cluster (3ID)", ph: "CS PEKANBARU" },
                ].map(({ key, label, ph }) => (
                  <div key={key}>
                    <label style={labelStyle}>{label}</label>
                    <input
                      value={addForm[key]}
                      onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value.toUpperCase() }))}
                      placeholder={ph}
                      required
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={addLoading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: addLoading ? "not-allowed" : "pointer", opacity: addLoading ? 0.6 : 1, fontFamily: FONT }}>
                  {addLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />}
                  {addLoading ? "Menyimpan..." : "Simpan"}
                </button>
                <button type="button" onClick={() => setShowAdd(false)} style={{ padding: "9px 16px", borderRadius: 10, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                  Batal
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Filters ─────────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 6, flex: 1, minWidth: 200 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={14} color={t.lo} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Cari MC, Cluster, Branch, Region..."
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>
            <button type="submit" style={{ padding: "9px 14px", borderRadius: 9, border: "none", background: `linear-gradient(135deg,${RED},${MAGA})`, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              Cari
            </button>
            {(search || filterRegion || filterBranch) && (
              <button type="button" onClick={() => { setSearchInput(""); setSearch(""); setFilterRegion(""); setFilterBranch(""); fetchRows(1, "", "", ""); }} style={{ padding: "9px 10px", borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", color: t.mid, cursor: "pointer" }}>
                <X size={14} />
              </button>
            )}
          </form>

          <select value={filterRegion} onChange={e => handleRegionFilter(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 160 }}>
            <option value="">Semua Region</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <select value={filterBranch} onChange={e => handleBranchFilter(e.target.value)} style={{ ...selectStyle, width: "auto", minWidth: 160 }}>
            <option value="">Semua Branch</option>
            {(filterRegion ? branches : branches).map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          <button onClick={() => fetchRows(page)} style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: t.mid, cursor: "pointer" }}>
            <RefreshCw size={14} style={fetching ? { animation: "spin 1s linear infinite" } : {}} />
          </button>
        </div>

        {/* ── Table ───────────────────────────────────────────────────────────── */}
        <div style={{ borderRadius: 16, border: `1px solid ${t.line}`, overflow: "hidden", background: t.card }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1.5fr 1fr", gap: 0, padding: "11px 16px", borderBottom: `1px solid ${t.line}`, background: t.card2 }}>
            {["MC (IM3)", "Cluster (3ID)", "Branch", "Region", ""].map((h, i) => (
              <div key={i} style={{ fontSize: 11.5, fontWeight: 700, color: t.mid, letterSpacing: 0.3, textAlign: i === 4 ? "right" : "left" }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {fetching ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <Loader2 size={22} color={TEAL} style={{ animation: "spin 1s linear infinite", margin: "0 auto" }} />
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: t.mid, fontSize: 14 }}>
              {search || filterRegion || filterBranch ? "Tidak ada data yang cocok." : "Belum ada data mapping."}
            </div>
          ) : rows.map((row, idx) => (
            <div
              key={row.id}
              style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1.5fr 1fr", gap: 0, padding: "11px 16px", borderBottom: idx < rows.length - 1 ? `1px solid ${t.line}` : "none", transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = t.sub}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 5, background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.18)", fontSize: 10.5, fontWeight: 700, color: "#2563EB", letterSpacing: 0.2, flexShrink: 0 }}>IM3</span>
                <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 500 }}>{row.mc}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 5, background: "rgba(13,148,136,0.1)", border: "1px solid rgba(13,148,136,0.2)", fontSize: 10.5, fontWeight: 700, color: "#0D9488", letterSpacing: 0.2, flexShrink: 0 }}>3ID</span>
                <span style={{ fontSize: 13.5, color: t.hi, fontWeight: 500 }}>{row.cluster}</span>
              </div>
              <div style={{ fontSize: 13.5, color: t.mid, display: "flex", alignItems: "center" }}>{row.branch}</div>
              <div style={{ fontSize: 13, color: t.lo, display: "flex", alignItems: "center" }}>{row.region}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setDeleteTarget(row)}
                  style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid ${t.line}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: t.lo, cursor: "pointer" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#DC2626"; e.currentTarget.style.color = "#DC2626"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = t.line; e.currentTarget.style.color = t.lo; }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── Pagination ────────────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, color: t.mid }}>
              {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} dari {total.toLocaleString()}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => fetchRows(page - 1)} disabled={page === 1} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${t.line}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: page === 1 ? t.lo : t.mid, cursor: page === 1 ? "not-allowed" : "pointer" }}>
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button key={pg} onClick={() => fetchRows(pg)} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${pg === page ? TEAL : t.line}`, background: pg === page ? t.tealBg : "transparent", color: pg === page ? TEAL : t.mid, fontSize: 13.5, fontWeight: pg === page ? 700 : 500, cursor: "pointer" }}>
                    {pg}
                  </button>
                );
              })}
              <button onClick={() => fetchRows(page + 1)} disabled={page === totalPages} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${t.line}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: page === totalPages ? t.lo : t.mid, cursor: page === totalPages ? "not-allowed" : "pointer" }}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals & Toast */}
      {deleteTarget && (
        <DeleteModal
          row={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          d={d}
        />
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
        body { margin: 0 }
        button { cursor: pointer; font-family: inherit; transition: opacity 0.14s, transform 0.12s }
        button:hover:not(:disabled) { opacity: 0.82 }
        button:active:not(:disabled) { transform: scale(0.97) }
        input, select, textarea { font-family: inherit }
        input:focus, select:focus { outline: none; border-color: ${TEAL} !important }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes slideUp { from { transform: translateY(10px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
}
