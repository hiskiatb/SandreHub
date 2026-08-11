"use client";
/**
 * /martahub/m/management - Management View versi mobile-web, KHUSUS role
 * spm_sumatera (satu-satunya role yang benar-benar melihat & mengelola
 * SELURUH Sumatera tanpa batas region/brand/cabang).
 *
 * Kenapa halaman terpisah dari Approval Center (/martahub/m/approval):
 * Approval Center itu soal MEMUTUSKAN plan/laporan yang masuk (aksinya
 * approve/revisi). Management View ini soal MEMANTAU & MENGELOLA seluruh
 * sistem secara total: ringkasan performa Sumatera, ranking tiap cabang,
 * dan tim BME/RGE (termasuk aksi EDIT penugasan) - sesuai permintaan
 * "tampilkan secara total, ada aksi edit juga".
 *
 * Sama seperti /martahub/m/approval, halaman ini memakai sesi MartaHub
 * (`supabaseMarta` via `useMartaSession()`), BUKAN sesi SandraHub - supaya
 * TIDAK jatuh ke jebakan `guardMarta()` desktop yang butuh sesi lain
 * (bug yang sama yang pernah bikin menu Approval mobile error).
 *
 * 3 tab:
 *   1. Ringkasan  - KPI Sumatera (Plan/Actual/Achievement/Cost Ratio),
 *      dipecah per cabang, bulan berjalan bisa diganti. Sumber data SAMA
 *      dgn kartu Achievement di Home (`mh_activities_for_me`, yang utk role
 *      unscoped/spm_sumatera memang sudah mengembalikan SEMUA baris
 *      Sumatera, bukan cuma milik sendiri).
 *   2. Leaderboard - ranking cabang/brand, query `mh_leaderboard_summary`
 *      (view yang sama dipakai /martahub/m/leaderboard), tanpa filter scope
 *      krn spm_sumatera memang harus lihat semua.
 *   3. Tim - daftar seluruh BME/RGE/dsb (`mh_list_assignments` RPC, tanpa
 *      filter - sudah mengembalikan semua utk role manapun yg memanggil,
 *      TAPI cuma spm_sumatera yang diberi tombol Edit/Hapus di sini) +
 *      antrean akun baru (`mh_profiles` status='pending'). Aksi EDIT lewat
 *      `mh_update_assignment`, Tolak Pending lewat `mh_dismiss_pending`,
 *      Hapus lewat `mh_delete_assignment` - RPC yang SAMA PERSIS dipakai
 *      desktop /martahub/assignments, supaya perilakunya konsisten.
 *
 * Sengaja TIDAK menyertakan form "Tambah Penugasan Baru" penuh (field
 * supervisor/dsf_org masih spesifik ke alur desktop yang lebih panjang) -
 * pembuatan penugasan baru tetap lewat desktop Assignments, di sini fokus
 * ke pemantauan + edit/hapus yang datanya sudah ada.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, LayoutDashboard, Trophy, Users, Target, CheckCircle2, Gauge, Wallet,
  Search, Pencil, Trash2, X, Check, Loader2, ChevronDown, UserX, Building2,
} from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { fmtInt } from "../_shared/activityUi";

const ACTIVITY_COLS = "id,event_name,brand,branch_id,plan_date,status,target_sp,actual_sp,cost_actual,actual_rev_3m";
const ROLE_LABEL = { spm_sumatera: "SPM Sumatera", head: "Head TMV", tmv: "Brand TMV", bme: "BME", rge: "RGE", tl_dsf: "TL DSF", dsf: "DSF", md: "MD", dse: "DSE", gse: "GSE", ae: "AE", promotor: "Promotor", cse_rse: "CSE/RSE", bsm: "BSM", admin: "Admin" };
const MONTH_NAMES_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const LAUNCH_YEAR = 2026, LAUNCH_MONTH = 7; // Agustus 2026 - sama dgn Home

function monthOptions() {
  const now = new Date();
  const launch = new Date(LAUNCH_YEAR, LAUNCH_MONTH, 1);
  const cursor = now < launch ? launch : now;
  const span = (cursor.getFullYear() - LAUNCH_YEAR) * 12 + (cursor.getMonth() - LAUNCH_MONTH);
  const opts = [];
  for (let i = 0; i <= span; i++) {
    const d = new Date(LAUNCH_YEAR, LAUNCH_MONTH + span - i, 1);
    opts.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${MONTH_NAMES_FULL[d.getMonth()]} ${d.getFullYear()}` });
  }
  return opts;
}

const TABS = [
  { key: "ringkasan", label: "Ringkasan", icon: LayoutDashboard },
  { key: "leaderboard", label: "Leaderboard", icon: Trophy },
  { key: "tim", label: "Tim", icon: Users },
];

export default function ManagementPage() {
  const router = useRouter();
  const { loading: sessionLoading, email, scope } = useMartaSession();
  const [tab, setTab] = useState("ringkasan");

  const isAllowed = !!(scope?.found && scope.role === "spm_sumatera");

  if (sessionLoading) return <MobileShell active="home"><ShellSpinner /></MobileShell>;

  if (!isAllowed) {
    return (
      <MobileShell active="home">
        <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px", fontFamily: FF }}>
          <button onClick={() => router.push("/martahub/m")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
            <ArrowLeft size={16} /> Beranda
          </button>
          <div style={{ marginTop: 60, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#3A3A44" }}>Halaman ini khusus SPM Sumatera</div>
            <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96" }}>Role Anda ({ROLE_LABEL[scope?.role] || scope?.role || "-"}) tidak punya akses ke Management View.</div>
          </div>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell active="home">
      <div style={{
        position: "sticky", top: 0, zIndex: 20, maxWidth: 480, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0",
        background: "rgba(244,245,247,0.86)", backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
      }}>
        <button onClick={() => router.push("/martahub/m")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
          <ArrowLeft size={16} /> Beranda
        </button>
        <div style={{ marginTop: 12, fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Management View</div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96" }}>Seluruh Sumatera - semua region, brand & cabang</div>

        <div style={{ display: "flex", gap: 8, marginTop: 14, paddingBottom: 12, overflowX: "auto" }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 999,
                  background: active ? "#17181C" : "#FFFFFF", border: `1px solid ${active ? "#17181C" : "#E9EAEE"}`,
                  color: active ? "#FFFFFF" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer",
                }}>
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "16px 20px 40px" }}>
        {tab === "ringkasan" && <RingkasanTab />}
        {tab === "leaderboard" && <LeaderboardTab />}
        {tab === "tim" && <TimTab callerEmail={email} />}
      </div>
    </MobileShell>
  );
}

// ═══════════════════════════════ Tab: Ringkasan ═══════════════════════════

function RingkasanTab() {
  const months = useMemo(monthOptions, []);
  const [monthKey, setMonthKey] = useState(months[0].key);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [branchMap, setBranchMap] = useState(() => new Map());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabaseMarta.rpc("mh_activities_for_me").select(ACTIVITY_COLS).limit(5000);
        if (error) throw error;
        if (alive) setRows(data || []);
      } catch (e) { if (alive) setErr(e.message || "Gagal memuat data"); }
    })();
    (async () => {
      try {
        const { data } = await supabaseMarta.from("mh_branches").select("id,name");
        if (alive && data) setBranchMap(new Map(data.map((b) => [b.id, b.name])));
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; };
  }, []);

  const monthRows = (rows || []).filter((r) => (r.plan_date || "").slice(0, 7) === monthKey);
  const targetSp = monthRows.reduce((s, r) => s + (r.target_sp || 0), 0);
  const actualSp = monthRows.reduce((s, r) => s + (r.actual_sp || 0), 0);
  const costTotal = monthRows.reduce((s, r) => s + (r.cost_actual || 0), 0);
  const revenueTotal = monthRows.reduce((s, r) => s + (r.actual_rev_3m || 0), 0);
  const achievementPct = targetSp > 0 ? Math.round((actualSp / targetSp) * 100) : 0;
  const productivityPct = costTotal > 0 ? Math.round((revenueTotal / costTotal) * 100) : null;
  const costRatioPct = revenueTotal > 0 ? Math.round((costTotal / revenueTotal) * 100) : null;
  const planCount = monthRows.length;
  const actualCount = monthRows.filter((r) => r.actual_sp != null).length;

  // Pecah per cabang - inilah "secara total" yg diminta: bukan cuma angka
  // Sumatera gabungan, tapi kelihatan cabang mana yg kontribusi/tertinggal.
  const perBranch = useMemo(() => {
    const map = new Map();
    for (const r of monthRows) {
      const key = r.branch_id || "-";
      if (!map.has(key)) map.set(key, { branchId: key, plan: 0, actual: 0, targetSp: 0, actualSp: 0 });
      const b = map.get(key);
      b.plan += 1;
      if (r.actual_sp != null) b.actual += 1;
      b.targetSp += r.target_sp || 0;
      b.actualSp += r.actual_sp || 0;
    }
    return Array.from(map.values())
      .map((b) => ({ ...b, name: branchMap.get(b.branchId) || b.branchId, pct: b.targetSp > 0 ? Math.round((b.actualSp / b.targetSp) * 100) : 0 }))
      .sort((a, b) => b.plan - a.plan);
  }, [monthRows, branchMap]);

  if (rows === null && !err) return <ShellSpinner />;

  return (
    <div>
      {err && <Notice color="#C62828" bg="#FDECEC">{err}</Notice>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <SimpleSelect value={monthKey} onChange={setMonthKey} options={months.map((m) => ({ value: m.key, label: m.label }))} />
      </div>

      <div style={{
        marginTop: 12, borderRadius: 22, padding: "20px 18px 18px",
        background: "linear-gradient(150deg,#38383E 0%,#4A4A50 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 8px 20px rgba(17,17,20,0.16), 0 2px 5px rgba(17,17,20,0.1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 5, height: 5, borderRadius: 99, background: "linear-gradient(135deg,#E63325,#EC1E79)" }} />
          <div style={{ fontSize: 10.5, fontWeight: 800, color: "rgba(255,255,255,0.6)", letterSpacing: 1, textTransform: "uppercase" }}>Achievement Sumatera</div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14 }}>
          <div style={{
            fontSize: 38, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1, fontVariantNumeric: "tabular-nums",
            background: "linear-gradient(120deg,#FFFFFF 0%,#F7D9E8 55%,#EC1E79 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>{achievementPct}%</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>dari target seluruh Sumatera</div>
        </div>
        <div style={{ display: "flex", marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.09)" }}>
          <QuadStat icon={Target} dot="#FFFFFF" label="Plan" value={fmtInt(planCount)} />
          <QuadDivider />
          <QuadStat icon={CheckCircle2} dot="#EC1E79" label="Actual" value={fmtInt(actualCount)} valueColor="#F286B4" />
          <QuadDivider />
          <QuadStat icon={Gauge} dot="#57C2AC" label="Produktivitas" value={productivityPct != null ? `${productivityPct}%` : "-"} valueColor="#7FD9C6" />
          <QuadDivider />
          <QuadStat icon={Wallet} dot="#F5CD46" label="Cost Ratio" value={costRatioPct != null ? `${costRatioPct}%` : "-"} valueColor="#F5CD46" />
        </div>
      </div>

      <div style={{ marginTop: 20, fontSize: 13.5, fontWeight: 800 }}>Per Cabang</div>
      {perBranch.length === 0 ? (
        <EmptyState text="Belum ada plan di bulan ini" />
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {perBranch.map((b) => (
            <div key={b.branchId} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(237,28,36,0.08)", color: "#ED1C24", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Building2 size={15} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                <div style={{ marginTop: 1, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{b.plan} plan · {b.actual} sudah lapor</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: b.pct >= 80 ? "#15803D" : b.pct >= 50 ? "#B45309" : "#DC2626", flexShrink: 0 }}>{b.pct}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuadStat({ label, value, valueColor, dot, icon: Icon }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ width: 22, height: 22, borderRadius: 8, margin: "0 auto 6px", background: `${dot}26`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={12} color={dot} strokeWidth={2.4} />
      </div>
      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: 0.2 }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 15.5, fontWeight: 800, color: valueColor || "#FFFFFF" }}>{value}</div>
    </div>
  );
}
function QuadDivider() { return <div style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.08)" }} />; }

// ═══════════════════════════════ Tab: Leaderboard ══════════════════════════

const LB_COLS = "id,user_id,user_name,branch_id,branch_name,region,brand,total_activities,achievement_pct,productivity_pct,geo_compliance,final_score";

function LeaderboardTab() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabaseMarta.from("mh_leaderboard_summary").select(LB_COLS).order("final_score", { ascending: false }).limit(300);
        if (error) throw error;
        if (alive) setRows(data || []);
      } catch (e) { if (alive) setErr(e.message || "Gagal memuat leaderboard"); }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = (rows || []).filter((r) => {
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return (r.user_name || "").toLowerCase().includes(t) || (r.branch_name || "").toLowerCase().includes(t) || (r.region || "").toLowerCase().includes(t);
  });

  if (rows === null && !err) return <ShellSpinner />;

  return (
    <div>
      {err && <Notice color="#C62828" bg="#FDECEC">{err}</Notice>}
      <SearchBox value={q} onChange={setQ} placeholder="Cari nama, cabang, atau region…" />
      {filtered.length === 0 ? (
        <EmptyState text="Tidak ada hasil" />
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((r, i) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 11, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 14, padding: "12px 14px" }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: i < 3 ? "#fff" : "#8A8A96",
                background: i === 0 ? "#F5CD46" : i === 1 ? "#B0B0BA" : i === 2 ? "#C97A3D" : "#F0F0F3",
              }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.user_name || "-"}</div>
                <div style={{ marginTop: 1, fontSize: 11, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.branch_name || "-"} · {(r.brand || "-").toUpperCase()} · {r.total_activities ?? 0} aktivitas
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C" }}>{r.final_score != null ? Math.round(r.final_score) : "-"}</div>
                <div style={{ fontSize: 9.5, color: "#B0B0BA", fontWeight: 700 }}>SKOR</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════ Tab: Tim ══════════════════════════════════

function TimTab({ callerEmail }) {
  const [rows, setRows] = useState(null);
  const [pending, setPending] = useState([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [{ data: a, error: e1 }, { data: p, error: e2 }] = await Promise.all([
        supabaseMarta.rpc("mh_list_assignments"),
        supabaseMarta.from("mh_profiles").select("id,email,full_name,status").eq("status", "pending"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setRows(a || []);
      setPending(p || []);
    } catch (e) { setErr(e.message || "Gagal memuat tim"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const roleOptions = useMemo(() => Array.from(new Set((rows || []).map((r) => r.role).filter(Boolean))).sort(), [rows]);
  const filtered = (rows || []).filter((r) => {
    if (roleFilter && r.role !== roleFilter) return false;
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return (r.full_name || "").toLowerCase().includes(t) || (r.email || "").toLowerCase().includes(t) || (r.branch_name || "").toLowerCase().includes(t);
  });

  async function dismissPending(id) {
    setBusyId(id);
    try {
      const { error } = await supabaseMarta.rpc("mh_dismiss_pending", { p_id: id, p_caller_email: callerEmail });
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message || "Gagal menolak akun"); }
    finally { setBusyId(null); }
  }

  async function deleteAssignment(id) {
    setBusyId(id);
    try {
      const { error } = await supabaseMarta.rpc("mh_delete_assignment", { p_id: id, p_caller_email: callerEmail });
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message || "Gagal menghapus penugasan"); }
    finally { setBusyId(null); }
  }

  if (rows === null && !err) return <ShellSpinner />;

  return (
    <div>
      {err && <Notice color="#C62828" bg="#FDECEC">{err}</Notice>}

      {pending.length > 0 && (
        <>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Akun Menunggu Aktivasi ({pending.length})</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FFFBF0", border: "1px solid #F5E0A8", borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.full_name || p.email}</div>
                  <div style={{ marginTop: 1, fontSize: 11, color: "#8A8A96" }}>{p.email}</div>
                </div>
                <button onClick={() => dismissPending(p.id)} disabled={busyId === p.id}
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 11px", borderRadius: 9, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#8A8A96", fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                  {busyId === p.id ? <Loader2 size={12} style={{ animation: "mspin .85s linear infinite" }} /> : <UserX size={12} />} Tolak
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: pending.length > 0 ? 20 : 0, fontSize: 13.5, fontWeight: 800 }}>Semua Tim ({rows?.length ?? 0})</div>
      <SearchBox value={q} onChange={setQ} placeholder="Cari nama, email, atau cabang…" />
      <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto" }}>
        <RoleChip active={!roleFilter} label="Semua" onClick={() => setRoleFilter("")} />
        {roleOptions.map((r) => <RoleChip key={r} active={roleFilter === r} label={ROLE_LABEL[r] || r} onClick={() => setRoleFilter(r)} />)}
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="Tidak ada hasil" />
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 14, padding: "12px 14px" }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: r.logged_in ? "#15803D" : "#B0B0BA",
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.full_name || r.email}</div>
                <div style={{ marginTop: 1, fontSize: 10.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ROLE_LABEL[r.role] || r.role} · {r.branch_name || r.region || "-"} · {(r.brand || "-").toUpperCase()}
                </div>
              </div>
              <button onClick={() => setEditRow(r)}
                style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, border: "1px solid #E4E5EA", background: "#F6F7F9", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Pencil size={13} />
              </button>
              <button onClick={() => deleteAssignment(r.id)} disabled={busyId === r.id}
                style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, border: "1px solid #F3C6C6", background: "#FDECEC", color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                {busyId === r.id ? <Loader2 size={12} style={{ animation: "mspin .85s linear infinite" }} /> : <Trash2 size={13} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {editRow && (
        <EditAssignmentSheet row={editRow} callerEmail={callerEmail} onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); load(); }} />
      )}
    </div>
  );
}

function RoleChip({ active, label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 999, background: active ? "#17181C" : "#F6F7F9", border: `1px solid ${active ? "#17181C" : "#E9EAEE"}`, color: active ? "#fff" : "#5A5A68", fontSize: 11, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
}

/** Sheet edit penugasan - RPC `mh_update_assignment` SAMA PERSIS dgn yg
 * dipakai desktop /martahub/assignments, cuma field yg paling sering
 * diubah dari mobile yg ditampilkan (role/branch/brand/region/mc). Field
 * lain (supervisor_assignment_id/dsf_org_id) dikirim apa adanya (tidak
 * diubah) supaya tidak merusak relasi yg sudah ada. */
function EditAssignmentSheet({ row, callerEmail, onClose, onSaved }) {
  const [role, setRole] = useState(row.role || "");
  const [region, setRegion] = useState(row.region || "");
  const [brand, setBrand] = useState(row.brand || "");
  const [branchId, setBranchId] = useState(row.branch_id || "");
  const [branchName, setBranchName] = useState(row.branch_name || "");
  const [mc, setMc] = useState(row.mc || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setSaving(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_update_assignment", {
        p_id: row.id, p_role: role || null, p_region: region || null, p_brand: brand || null,
        p_branch_id: branchId || null, p_branch_name: branchName || null, p_full_name: row.full_name || null,
        p_supervisor_assignment_id: row.supervisor_assignment_id || null, p_dsf_org_id: row.dsf_org_id || null,
        p_caller_email: callerEmail, p_mc: mc || null, p_email: row.email || null,
      });
      if (error) throw error;
      onSaved();
    } catch (e) { setErr(e.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  }

  return (
    <div onClick={() => !saving && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.45)", zIndex: 400, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom,0px) + 20px)", width: "100%", fontFamily: FF, maxHeight: "82vh", overflowY: "auto", boxShadow: "0 -10px 30px rgba(0,0,0,0.12)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C" }}>Edit Penugasan</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "#F6F7F9", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={14} /></button>
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: "#8A8A96" }}>{row.full_name || row.email}</div>

        <EditField label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value)} style={fieldInputStyle}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </EditField>
        <EditField label="Region"><input value={region} onChange={(e) => setRegion(e.target.value)} style={fieldInputStyle} placeholder="mis. lampung" /></EditField>
        <EditField label="Brand">
          <select value={brand} onChange={(e) => setBrand(e.target.value)} style={fieldInputStyle}>
            <option value="">-</option>
            <option value="im3">IM3</option>
            <option value="tri">Tri</option>
          </select>
        </EditField>
        <EditField label="Branch ID (slug)"><input value={branchId} onChange={(e) => setBranchId(e.target.value)} style={fieldInputStyle} placeholder="mis. bandar-lampung" /></EditField>
        <EditField label="Nama Cabang"><input value={branchName} onChange={(e) => setBranchName(e.target.value)} style={fieldInputStyle} placeholder="mis. Bandar Lampung" /></EditField>
        <EditField label="Micro Cluster"><input value={mc} onChange={(e) => setMc(e.target.value)} style={fieldInputStyle} /></EditField>

        {err && <div style={{ marginTop: 10, fontSize: 12, color: "#C62828" }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
            Batal
          </button>
          <button onClick={save} disabled={saving}
            style={{ flex: 1, height: 46, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer", opacity: saving ? 0.75 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {saving ? <Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> : <Check size={14} />} Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

const fieldInputStyle = { width: "100%", height: 44, padding: "0 12px", borderRadius: 11, border: "1.5px solid #ECEDF0", background: "#F6F7F9", fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" };

function EditField({ label, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ display: "block", marginBottom: 6, fontSize: 10.5, fontWeight: 700, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {children}
    </div>
  );
}

// ═══════════════════════════════ Shared bits ═══════════════════════════════

function SimpleSelect({ value, onChange, options }) {
  const selected = options.find((o) => o.value === value);
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34, padding: "8px 12px", borderRadius: 999, background: "#FFFFFF", border: "1px solid #E4E5EA" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#17181C", whiteSpace: "nowrap" }}>{selected?.label}</span>
        <ChevronDown size={12} color="#8A8A96" />
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: "none", cursor: "pointer", fontFamily: FF, fontSize: 16 }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E4E5EA" }}>
      <Search size={13} color="#9A9AA6" style={{ flexShrink: 0 }} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontSize: 12.5, fontFamily: FF, color: "#17181C" }} />
      {value && (
        <button onClick={() => onChange("")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}>
          <X size={13} color="#B0B0BA" />
        </button>
      )}
    </div>
  );
}

function Notice({ color, bg, children }) {
  return <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: bg, color, fontSize: 12, fontWeight: 600 }}>{children}</div>;
}

function EmptyState({ text }) {
  return (
    <div style={{ marginTop: 12, textAlign: "center", padding: "32px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>{text}</div>
    </div>
  );
}
