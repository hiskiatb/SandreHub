"use client";

// ============================================================
// MFTS — Alokasi Manpower per MC/Cluster (DSF = level MC/Cluster)
// Kolom: Brand · MC/Cluster · Branch · Area · Region · Kuota · …
// Brand ikut territory (IM3 / 3ID). Target diisi per cluster (atau
// massal via Excel terkunci, XLOOKUP-ready).
// Hybrid = MAPPING saja (1 MP pegang IM3 + 3ID), bisa di level
// circle / region / area / branch / cluster — tanpa input target.
// Edit ter-scope tingkatan (Sumatera = semua, Region = region-nya),
// ditegakkan juga oleh RLS.
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Loader2, RefreshCw, AlertTriangle, Lock, Layers, Sparkles, Search,
  Download, Upload, Link2, Plus, X, CheckCircle2, Filter, FilterX, Check, Trash2,
  CalendarClock, ChevronLeft, ChevronRight, Copy,
} from "lucide-react";
import { passesRow as passesRowX, optionsFor as optionsForX, FilterMenu as FilterMenuX } from "./MFTS_TableFilter";
import MFTSProgress from "./MFTS_Progress";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA",
  line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  teal: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  red: "#ED1C24", redBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)", redBd: d ? "rgba(237,28,36,.25)" : "rgba(237,28,36,.18)",
  amber: "#D4A800", amberBg: d ? "rgba(255,203,5,.12)" : "rgba(212,168,0,.1)", amberBd: d ? "rgba(255,203,5,.3)" : "rgba(212,168,0,.25)",
  green: "#1A9E90",
  mag: "#C6168D", magBg: d ? "rgba(198,22,141,.14)" : "rgba(198,22,141,.08)", magBd: d ? "rgba(198,22,141,.35)" : "rgba(198,22,141,.2)",
  orange: "#E8830C", orangeBg: d ? "rgba(232,131,12,.14)" : "rgba(232,131,12,.09)", orangeBd: d ? "rgba(232,131,12,.35)" : "rgba(232,131,12,.22)",
  blue: d ? "#0A84FF" : "#2563EB", blueBg: d ? "rgba(10,132,255,.12)" : "rgba(37,99,235,.08)", blueBd: d ? "rgba(10,132,255,.3)" : "rgba(37,99,235,.2)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const ROLE_REGION = { region_sfm_north: "NORTH SUMATERA", region_sfm_central: "CENTRAL SUMATERA", region_sfm_south: "SOUTH SUMATERA" };

// ---- Period (perencanaan bulanan) ----
const LOCK_START = "202606"; // sistem mulai Juni 2026 — bulan sebelumnya tak punya data
const ym = (dt) => `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}`;
const CUR_MONTH = ym(new Date());
const addMonths = (p, n) => { const y = +p.slice(0, 4), m = +p.slice(4, 6); return ym(new Date(y, m - 1 + n, 1)); };
const clampPeriod = (p) => (p < LOCK_START ? LOCK_START : p); // tak boleh sebelum start
// Cache level-modul: pertahankan period saat tab Alokasi di-unmount/remount
// (pindah tab → kembali) supaya tidak melompat balik ke default.
let PERIOD_CACHE = null;
const monthLabel = (p) => { const y = +p.slice(0, 4), m = +p.slice(4, 6); return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" }); };
const periodTag = (p) => (p === CUR_MONTH ? "bulan ini" : p === addMonths(CUR_MONTH, 1) ? "bulan depan" : p < CUR_MONTH ? "lampau" : "");

// kolom kategorikal yang bisa difilter ala-Excel
const FCOLS = [["brand", "Brand"], ["label", "MC / Cluster"], ["branch", "Branch"], ["area", "Area"], ["region", "Region"], ["fkuota", "Kuota"], ["fterisi", "Terisi"], ["fvac", "Vacancy"], ["fgap", "Gap"]];
const fval = (c, k) => String(c?.[k] ?? "");
const up = (s) => String(s || "").toUpperCase().trim();

// level scope hybrid
const SCOPE_LEVELS = [
  ["cluster", "MC / Cluster", "mc_cluster"],
  ["branch", "Branch", "branch"],
  ["area", "Area", "area"],
  ["region", "Region", "region"],
  ["circle", "Circle (Sumatera)", "circle"],
];
const SCOPE_LABEL = Object.fromEntries(SCOPE_LEVELS.map(([k, l]) => [k, l]));

// nama dasar cluster tanpa prefix brand: "MC-BATAM EAST"/"CS BATAM EAST" → "BATAM EAST"
const baseName = (n) => up(n).replace(/^(MC[- ]|CS[- ])/, "").trim();

function brandBadge(t, brand) {
  const b = up(brand);
  const m = b === "IM3" ? [t.mag, t.magBg, t.magBd, "IM3"]
    : b === "3ID" ? [t.orange, t.orangeBg, t.orangeBd, "3ID"]
    : b === "HYBRID" ? [t.blue, t.blueBg, t.blueBd, "Hybrid"]
    : [t.mid, "transparent", t.line, b || "—"];
  return <span style={{ fontSize: 10.5, fontWeight: 800, color: m[0], background: m[1], border: `1px solid ${m[2]}`, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{m[3]}</span>;
}

// cocokkan rule hybrid ke sebuah cluster (cluster-level dibandingkan per nama dasar → ikut pasangannya)
function matchRule(r, c) {
  const v = r.scope_value;
  switch (r.scope_level) {
    case "circle": return up(c.circle) === up(v) || up(v) === "SUMATERA" || up(v) === "ALL";
    case "region": return up(c.region) === up(v);
    case "area": return up(c.area) === up(v);
    case "branch": return up(c.branch) === up(v);
    case "cluster": return baseName(c.mc_cluster) === baseName(v);
    default: return false;
  }
}

export default function MFTS_Allocation({ supabase, theme = "dark", profile, mtype, scopeRegion = null, regions = [], agencyOf = {}, stages = [], onChanged }) {
  const d = theme === "dark"; const t = mk(d);
  const scope = scopeRegion ? up(scopeRegion) : null;
  const allAccess = ["spm_sumatera", "salesforce_mgmt_sumatera"].includes(profile?.role);
  const myRegion = ROLE_REGION[profile?.role] || null;
  const canEditRegion = (region) => allAccess || (myRegion && up(region) === myRegion);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [q, setQ] = useState("");
  const [clusters, setClusters] = useState([]);   // {mc_cluster, brand, region, area, branch, circle}
  // Default: rencanakan BULAN DEPAN (pemenuhan harus selesai sebelum bulan berjalan).
  const [period, setPeriod] = useState(() => PERIOD_CACHE || clampPeriod(addMonths(CUR_MONTH, 1)));
  useEffect(() => { PERIOD_CACHE = period; }, [period]); // ingat pilihan lintas remount
  const prevPeriod = useMemo(() => addMonths(period, -1), [period]);
  const [alloc, setAlloc] = useState({});          // mc_cluster -> alloc row (period terpilih)
  const [allocPrev, setAllocPrev] = useState({});  // mc_cluster -> alloc row (bulan sebelumnya, utk carry-forward)
  const [hybridRules, setHybridRules] = useState([]); // mf_hybrid_map
  const [filled, setFilled] = useState({});        // mc_cluster -> active count
  const [openVac, setOpenVac] = useState({});      // mc_cluster -> open vacancy count
  const [draft, setDraft] = useState({});          // mc_cluster -> string
  const [busy, setBusy] = useState("");
  const [filters, setFilters] = useState({});      // colKey -> array nilai terpilih
  const [openCol, setOpenCol] = useState("");
  const [openRect, setOpenRect] = useState(null);
  const [showHybrid, setShowHybrid] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [prog, setProg] = useState(null);
  const fileRef = useRef(null);

  const firstStage = useMemo(() => [...stages].sort((a, b) => a.ord - b.ord)[0], [stages]);
  const isHybrid = (c) => hybridRules.some((r) => matchRule(r, c));

  // Baris tampil: cluster hybrid (IM3 + 3ID) digabung jadi 1 baris brand "Hybrid",
  // dinamai dengan nama MC- (IM3). Cluster non-hybrid tetap terpisah per brand.
  const display = useMemo(() => {
    const out = []; const seen = new Set();
    for (const c of clusters) {
      if (isHybrid(c)) {
        const base = baseName(c.mc_cluster);
        if (seen.has(base)) continue; seen.add(base);
        const im3 = clusters.find((x) => baseName(x.mc_cluster) === base && x.brand === "IM3");
        const tri = clusters.find((x) => baseName(x.mc_cluster) === base && x.brand === "3ID");
        const geo = im3 || tri || c;
        // Kanonik DETERMINISTIK = "MC-<base>" — tidak tergantung brand mana yang
        // kebetulan ada bulan ini, agar alokasi & rule hybrid stabil lintas upload.
        const canonName = `MC-${base}`;
        const realMembers = [im3?.mc_cluster, tri?.mc_cluster].filter(Boolean);
        out.push({ key: canonName, mc_cluster: canonName, label: canonName, brand: "HYBRID", hybrid: true,
          region: geo.region, area: geo.area, branch: geo.branch,
          members: [...new Set([...realMembers, canonName])], pair: realMembers.length === 2 });
      } else {
        // Nama ditampilkan selalu "MC-<base>" (badge yang membedakan IM3/3ID);
        // key/mc_cluster tetap nama asli ("CS …"/"MC-…") agar cocok dgn data territory/manpower/vacancy.
        out.push({ key: c.mc_cluster, mc_cluster: c.mc_cluster, label: `MC-${baseName(c.mc_cluster)}`, brand: c.brand, hybrid: false,
          region: c.region, area: c.area, branch: c.branch, members: [c.mc_cluster], pair: false });
      }
    }
    // Urut dari cakupan terluas → tersempit: Region → Area → Branch → MC/Cluster → Brand
    return out.sort((a, b) =>
      up(a.region).localeCompare(up(b.region)) || up(a.area).localeCompare(up(b.area)) ||
      up(a.branch).localeCompare(up(b.branch)) || up(a.label).localeCompare(up(b.label)) ||
      up(a.brand).localeCompare(up(b.brand)));
  }, [clusters, hybridRules]); // eslint-disable-line react-hooks/exhaustive-deps
  const displayMap = useMemo(() => Object.fromEntries(display.map((r) => [r.mc_cluster, r])), [display]);
  // Cocokkan baris Excel via Brand + label "MC-" (hindari bentrok IM3/3ID base sama).
  const byLabel = useMemo(() => Object.fromEntries(display.map((r) => [`${up(r.brand)}|${up(r.label)}`, r])), [display]);
  const memFill = (row) => row.members.reduce((n, m) => n + (filled[m] || 0), 0);
  const memOpen = (row) => row.members.reduce((n, m) => n + (openVac[m] || 0), 0);
  // Target efektif untuk period terpilih: pakai angka period ini, kalau belum
  // pernah diisi → warisi (carry-forward) dari bulan sebelumnya.
  const effAlloc = (key) => (alloc[key]?.target_count) ?? (allocPrev[key]?.target_count) ?? 0;
  const isInherited = (key) => alloc[key] === undefined && allocPrev[key] !== undefined;

  async function load() {
    setLoading(true); setErr("");
    try {
      const [terr, al, hy, mp, vc] = await Promise.all([
        supabase.from("mf_territory_clusters").select("mc_cluster, brand, region, area, branch, circle").eq("manpower_type", mtype),
        supabase.from("mf_allocation").select("*").eq("manpower_type", mtype).in("period", [period, prevPeriod]),
        supabase.from("mf_hybrid_map").select("*").eq("manpower_type", mtype),
        supabase.from("mf_manpower").select("mc_cluster, name").eq("manpower_type", mtype).eq("status", "active"),
        supabase.from("mf_vacancies").select("mc_cluster, status, target_period").eq("manpower_type", mtype),
      ]);
      if (terr.error) throw new Error(terr.error.message);

      const cmap = new Map();
      for (const r of terr.data || []) {
        const c = String(r.mc_cluster || "").trim(); if (!c) continue;
        if (scope && up(r.region) !== scope) continue;
        if (!cmap.has(c)) cmap.set(c, { mc_cluster: c, brand: up(r.brand), region: r.region || "", area: r.area || "", branch: r.branch || "", circle: r.circle || "" });
      }
      setClusters([...cmap.values()].sort((a, b) => (a.brand + a.mc_cluster).localeCompare(b.brand + b.mc_cluster)));

      const alList = al.error ? [] : (al.data || []);
      setAlloc(Object.fromEntries(alList.filter((a) => a.period === period).map((a) => [a.mc_cluster, a])));
      setAllocPrev(Object.fromEntries(alList.filter((a) => a.period === prevPeriod).map((a) => [a.mc_cluster, a])));
      setHybridRules(hy.error ? [] : (hy.data || []));

      // "VACANT" = penanda kursi kosong, JANGAN dihitung sebagai terisi.
      const f = {}; for (const m of mp.data || []) { if (up(m.name) === "VACANT") continue; const c = m.mc_cluster; if (c) f[c] = (f[c] || 0) + 1; } setFilled(f);
      // Vacancy open dihitung GLOBAL per cluster (lintas period). Seat = pool
      // berkelanjutan, jadi target bulan berikutnya yang SAMA → gap 0 (tak ada
      // seat baru, tak duplikat); hanya PENAMBAHAN target yang membuat seat baru.
      const o = {};
      for (const v of vc.data || []) {
        if (String(v.status || "").startsWith("closed")) continue;
        const c = v.mc_cluster; if (c) o[c] = (o[c] || 0) + 1;
      }
      setOpenVac(o);
      setDraft({}); setFilters({}); setOpenCol("");
    } catch (e) { setErr(e.message || "Gagal memuat alokasi"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [mtype, scope, period]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveTarget(row) {
    const key = row.key;
    const val = Math.max(0, parseInt(draft[key], 10) || 0);
    // Tidak boleh menurunkan kuota di bawah jumlah yang SUDAH TERISI — DSF aktif
    // tidak bisa dihilangkan otomatis. Pindahkan/keluarkan DSF dulu.
    const filledN = memFill(row);
    if (val < filledN) {
      setErr(`Kuota ${val} untuk ${row.label} di bawah jumlah terisi (${filledN}). Pindahkan/keluarkan DSF lewat tab Manpower dulu sebelum mengurangi kuota.`);
      setDraft((p) => ({ ...p, [key]: String(effAlloc(key)) }));
      return;
    }
    setBusy(key); setErr("");
    try {
      const { error } = await supabase.from("mf_allocation").upsert({
        manpower_type: mtype, mc_cluster: key, period, brand: row.hybrid ? "HYBRID" : row.brand || null,
        region: row.region || null, area: row.area || null, branch: row.branch || null,
        target_count: val, created_by: profile?.id || null, updated_at: new Date().toISOString(),
      }, { onConflict: "manpower_type,mc_cluster,period" });
      if (error) throw new Error(error.message);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  }

  // Salin (materialkan) seluruh target warisan ke period terpilih, dalam wewenang scope.
  async function carryForwardAll() {
    setBusy("carry"); setErr(""); setInfo("");
    try {
      const now = new Date().toISOString();
      const payload = display
        .filter((r) => isInherited(r.key) && canEditRegion(r.region))
        .map((r) => ({
          manpower_type: mtype, mc_cluster: r.key, period, brand: r.hybrid ? "HYBRID" : r.brand || null,
          region: r.region || null, area: r.area || null, branch: r.branch || null,
          target_count: effAlloc(r.key), created_by: profile?.id || null, updated_at: now,
        }));
      if (payload.length === 0) { setInfo("Tidak ada target warisan yang perlu disalin."); setBusy(""); return; }
      for (let i = 0; i < payload.length; i += 500) {
        setProg({ done: Math.min(i + 500, payload.length), total: payload.length, label: "Menyalin target…" });
        const { error } = await supabase.from("mf_allocation").upsert(payload.slice(i, i + 500), { onConflict: "manpower_type,mc_cluster,period" });
        if (error) throw new Error(error.message);
      }
      await load();
      setInfo(`${payload.length} target disalin dari ${monthLabel(prevPeriod)} ke ${monthLabel(period)}.`);
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); setProg(null); }
  }

  // Inti pembuatan seat untuk satu row (tanpa reload) — dipakai single & massal.
  async function createSeats(row, gap) {
    if (gap <= 0) return 0;
    const key = row.key;
    const now = new Date().toISOString();
    const base = memFill(row) + memOpen(row);
    const region = up(row.region);
    const agencyId = agencyOf[`${mtype}|${region}`] || null;
    for (let i = 1; i <= gap; i++) {
      const seat = `${key}-${mtype}-${String(base + i).padStart(2, "0")}`;
      const { data: vac, error } = await supabase.from("mf_vacancies").insert({
        manpower_type: mtype, position: `${mtype} ${row.label || key}`, brand: row.hybrid ? "HYBRID" : row.brand || null,
        region: row.region || null, area: row.area || null, branch: row.branch || null,
        mc_cluster: key, agency_id: agencyId, kind: "new", priority: "normal", status: "open",
        target_period: period,
        seat_id: seat, current_stage_id: firstStage?.id, current_owner: firstStage?.owner_default || "agency", last_event_at: now,
      }).select("id").single();
      if (error) throw new Error(error.message);
      await supabase.from("mf_vacancy_events").insert({
        vacancy_id: vac.id, from_stage_id: null, to_stage_id: firstStage?.id, owner: firstStage?.owner_default || "agency",
        note: `Vacancy dibuka dari alokasi ${period} (seat ${seat}${row.hybrid ? " · hybrid IM3+3ID" : ""})`,
        actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now,
      });
    }
    return gap;
  }

  async function generate(row, gap) {
    if (gap <= 0) return;
    setBusy(row.key); setErr("");
    try { await createSeats(row, gap); await load(); onChanged && (await onChanged()); }
    catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  }

  // Batalkan N seat OPEN (kuota dikurangi) — prioritas: seat yang belum digarap
  // (masih di stage awal) lalu yang terbaru, agar yang sedang berproses tidak hilang.
  async function cancelSeats(row, n) {
    if (n <= 0) return;
    setBusy(row.key); setErr("");
    try {
      const now = new Date().toISOString();
      const { data: vlist, error } = await supabase.from("mf_vacancies")
        .select("id, current_stage_id, status, last_event_at, seat_id")
        .in("mc_cluster", row.members).eq("manpower_type", mtype);
      if (error) throw new Error(error.message);
      const openList = (vlist || []).filter((v) => !String(v.status || "").startsWith("closed"));
      const firstId = firstStage?.id;
      openList.sort((a, b) => {
        const af = a.current_stage_id === firstId ? 0 : 1, bf = b.current_stage_id === firstId ? 0 : 1;
        if (af !== bf) return af - bf;                                   // belum digarap dulu
        return new Date(b.last_event_at) - new Date(a.last_event_at);    // lalu terbaru
      });
      for (const v of openList.slice(0, n)) {
        await supabase.from("mf_vacancy_events").insert({
          vacancy_id: v.id, from_stage_id: v.current_stage_id, to_stage_id: v.current_stage_id, owner: "internal",
          note: `Seat dibatalkan — kuota ${row.label} dikurangi`,
          actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now,
        });
        await supabase.from("mf_vacancies").update({ status: "closed_cancelled", last_event_at: now, updated_at: now }).eq("id", v.id);
      }
      await load();
      onChanged && (await onChanged());
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  }

  // Buat seat untuk SEMUA cluster yang masih punya gap (dalam wewenang & filter aktif).
  async function generateAll() {
    const targets = rows
      .filter((r) => canEditRegion(r.region))
      .map((r) => ({ r, gap: Math.max(0, effAlloc(r.key) - memFill(r) - memOpen(r)) }))
      .filter((x) => x.gap > 0);
    if (!targets.length) return;
    setBusy("all"); setErr(""); setInfo("");
    try {
      let total = 0, i = 0;
      for (const { r, gap } of targets) {
        i++; setProg({ done: i, total: targets.length, label: `Membuat seat · ${monthLabel(period)}…` });
        total += await createSeats(r, gap);
      }
      await load();
      onChanged && (await onChanged());
      setInfo(`${total} seat dibuat untuk ${targets.length} cluster · ${monthLabel(period)}.`);
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); setProg(null); }
  }

  // ---------- Hybrid mapping ----------
  async function addHybridRule({ level, value }) {
    setBusy("hybrid"); setErr("");
    try {
      let region = null;
      if (level === "region") region = value;
      else if (level !== "circle") { const c = clusters.find((cc) => matchRule({ scope_level: level, scope_value: value }, cc)); region = c?.region || null; }
      const { error } = await supabase.from("mf_hybrid_map").upsert({
        manpower_type: mtype, scope_level: level, scope_value: value, region, created_by: profile?.id || null,
      }, { onConflict: "manpower_type,scope_level,scope_value" });
      if (error) throw new Error(error.message);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  }
  async function removeHybridRule(r) {
    setBusy("hyb-" + r.id); setErr("");
    try {
      const { error } = await supabase.from("mf_hybrid_map").delete().eq("id", r.id);
      if (error) throw new Error(error.message);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  }

  // ---------- Excel: unduh template terkunci ----------
  async function downloadTemplate() {
    setErr(""); setInfo("");
    try {
      const rows = display.map((r) => ({ brand: r.hybrid ? "Hybrid" : r.brand, mc_cluster: r.label, branch: r.branch, area: r.area, region: r.region, target: effAlloc(r.key) }));
      const res = await fetch("/api/mfts/allocation-template", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mtype, scope: scope || "", period }),
      });
      if (!res.ok) throw new Error("Gagal membuat file Excel");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `alokasi_${mtype}_${period}${scope ? "_" + scope.replace(/\s+/g, "_") : ""}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setInfo(`Template ${monthLabel(period)} diunduh (${rows.length} cluster). Hanya kolom Target yang bisa diisi.`);
    } catch (e) { setErr(e.message); }
  }

  // ---------- Excel: unggah balik → upsert target ----------
  async function onUpload(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    setUploading(true); setErr(""); setInfo("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
      let updated = 0, skipped = 0, outScope = 0, unknown = 0, i = 0;
      for (const r of data) {
        i++; setProg({ done: i, total: data.length, label: "Menyimpan target…" });
        const cluster = String(r["MC/Cluster"] ?? r["mc_cluster"] ?? "").trim();
        if (!cluster) continue;
        const brandX = up(r["Brand"] ?? r["brand"] ?? "");
        const row = byLabel[`${brandX}|${up(cluster)}`] || displayMap[cluster];
        if (!row) { unknown++; continue; }
        if (!canEditRegion(row.region)) { outScope++; continue; }
        const raw = r["Target"] ?? r["target"];
        if (raw === "" || raw == null) { skipped++; continue; }
        const val = Math.max(0, parseInt(raw, 10) || 0);
        if (effAlloc(row.key) === val && !isInherited(row.key)) { skipped++; continue; }
        const { error } = await supabase.from("mf_allocation").upsert({
          manpower_type: mtype, mc_cluster: row.key, period, brand: row.hybrid ? "HYBRID" : row.brand || null,
          region: row.region || null, area: row.area || null, branch: row.branch || null,
          target_count: val, created_by: profile?.id || null, updated_at: new Date().toISOString(),
        }, { onConflict: "manpower_type,mc_cluster,period" });
        if (error) { outScope++; } else { updated++; }
      }
      await load();
      const parts = [`${updated} target diperbarui`];
      if (skipped) parts.push(`${skipped} dilewati (tak berubah)`);
      if (outScope) parts.push(`${outScope} di luar wewenang`);
      if (unknown) parts.push(`${unknown} cluster tak dikenal`);
      setInfo(parts.join(" · "));
    } catch (e) { setErr("Gagal membaca Excel: " + (e.message || e)); }
    finally { setUploading(false); setProg(null); }
  }

  // ---------- filter ala-Excel (cascading) ----------
  // Tambah field numerik (Kuota/Terisi/Vacancy/Gap) agar kolom itu juga bisa difilter.
  const displayF = useMemo(() => display.map((r) => {
    const target = effAlloc(r.key), fill = memFill(r), open = memOpen(r);
    return { ...r, fkuota: String(target), fterisi: String(fill), fvac: String(open), fgap: String(Math.max(0, target - fill - open)) };
  }), [display, alloc, allocPrev, filled, openVac]); // eslint-disable-line react-hooks/exhaustive-deps
  const baseRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return displayF.filter((c) => !term || c.label.toLowerCase().includes(term) || c.mc_cluster.toLowerCase().includes(term) || String(c.branch).toLowerCase().includes(term) || String(c.brand).toLowerCase().includes(term) || (c.hybrid && "hybrid".includes(term)) || String(c.area).toLowerCase().includes(term) || String(c.region).toLowerCase().includes(term));
  }, [displayF, q]);
  const optionsForCol = (k) => optionsForX(baseRows, filters, FCOLS, k);
  const rows = useMemo(() => baseRows.filter((c) => passesRowX(c, filters, FCOLS, null)), [baseRows, filters]); // eslint-disable-line react-hooks/exhaustive-deps
  const anyFilter = FCOLS.some(([k]) => (filters[k] || []).length);
  const anyInherited = useMemo(() => display.some((r) => isInherited(r.key) && canEditRegion(r.region)), [display, alloc, allocPrev]); // eslint-disable-line react-hooks/exhaustive-deps
  const setColFilter = (k, arr) => setFilters((p) => ({ ...p, [k]: arr }));
  const clearFilters = () => { setFilters({}); setOpenCol(""); };

  const totals = useMemo(() => {
    let target = 0, fill = 0, open = 0;
    for (const r of display) { target += effAlloc(r.key); fill += memFill(r); open += memOpen(r); }
    return { target, fill, open, gap: Math.max(0, target - fill - open) };
  }, [display, alloc, allocPrev, filled, openVac]); // eslint-disable-line react-hooks/exhaustive-deps

  // Total seat yang masih perlu dibuat (gap) untuk baris terlihat & dalam wewenang.
  const pending = useMemo(() => {
    let seats = 0, clusters = 0;
    for (const r of rows) {
      if (!canEditRegion(r.region)) continue;
      const g = Math.max(0, effAlloc(r.key) - memFill(r) - memOpen(r));
      if (g > 0) { seats += g; clusters++; }
    }
    return { seats, clusters };
  }, [rows, alloc, allocPrev, filled, openVac]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = { background: t.card, border: `1px solid ${t.line}`, borderRadius: 14 };

  if (mtype !== "DSF") {
    return <div style={{ ...card, padding: 40, textAlign: "center", color: t.mid, fontFamily: FF }}>
      Alokasi untuk <b style={{ color: t.hi }}>{mtype === "GSE_AE" ? "GSE & AE" : mtype}</b> menyusul. Fase 1: <b style={{ color: t.hi }}>DSF</b> (level MC/Cluster).
    </div>;
  }

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}><Layers size={17} /> Alokasi DSF · MC/Cluster</div>
          <div style={{ fontSize: 13, color: t.mid, marginTop: 2 }}>Kuota DSF per MC/Cluster, <b style={{ color: t.hi }}>per bulan</b>. Rencanakan bulan depan lebih awal; target mewarisi bulan sebelumnya sampai diubah. Sistem membuat seat (vacancy) untuk kekurangannya.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {!allAccess && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: t.mid, background: t.sub, border: `1px solid ${t.line}`, padding: "4px 9px", borderRadius: 999 }}><Lock size={12} /> Edit: {myRegion || "—"}</span>}
          <button onClick={downloadTemplate} style={{ ...btn(t), background: t.sub }}><Download size={14} /> Unduh Excel</button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...btn(t), background: t.sub }}>
            {uploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />} Unggah Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onUpload} style={{ display: "none" }} />
          <button onClick={() => setShowHybrid(true)} style={{ ...btn(t), background: t.blueBg, color: t.blue, borderColor: t.blueBd }}>
            <Link2 size={14} /> Hybrid{hybridRules.length ? ` · ${hybridRules.length}` : ""}
          </button>
          <button onClick={load} style={{ ...btn(t), background: t.sub }}><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Period banner — menonjol & sticky supaya selalu jelas bulan mana yang sedang diedit */}
      <div style={{ position: "sticky", top: 0, zIndex: 6, marginBottom: 14, borderRadius: 13, border: `1.5px solid ${t.blueBd}`, background: t.blueBg, padding: "12px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", backdropFilter: "blur(6px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: t.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <CalendarClock size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sedang mengedit alokasi bulan</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 19, fontWeight: 800, color: t.hi, lineHeight: 1.1 }}>{monthLabel(period)}</span>
              {periodTag(period) && <span style={{ fontSize: 10, fontWeight: 800, color: period < CUR_MONTH ? t.amber : t.blue, background: t.card, border: `1px solid ${period < CUR_MONTH ? t.amberBd : t.blueBd}`, padding: "2px 8px", borderRadius: 999 }}>{periodTag(period)}</span>}
            </div>
          </div>
        </div>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setPeriod((p) => clampPeriod(addMonths(p, -1)))} disabled={period <= LOCK_START}
            title={period <= LOCK_START ? `Data mulai ${monthLabel(LOCK_START)}` : "Bulan sebelumnya"}
            style={{ ...btn(t), padding: "7px 9px", background: t.card, opacity: period <= LOCK_START ? 0.4 : 1, cursor: period <= LOCK_START ? "not-allowed" : "pointer" }}><ChevronLeft size={16} /></button>
          <button onClick={() => setPeriod((p) => addMonths(p, 1))} title="Bulan berikutnya" style={{ ...btn(t), padding: "7px 9px", background: t.card }}><ChevronRight size={16} /></button>
          {period !== clampPeriod(CUR_MONTH) && <button onClick={() => setPeriod(clampPeriod(CUR_MONTH))} style={{ ...btn(t), padding: "6px 11px", fontSize: 12, background: t.card }}>Bulan ini</button>}
          {period !== clampPeriod(addMonths(CUR_MONTH, 1)) && <button onClick={() => setPeriod(clampPeriod(addMonths(CUR_MONTH, 1)))} style={{ ...btn(t), padding: "6px 11px", fontSize: 12, background: t.card }}>Bulan depan</button>}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {anyInherited && (
            <button onClick={carryForwardAll} disabled={busy === "carry"} title={`Materialkan target warisan dari ${monthLabel(prevPeriod)}`}
              style={{ ...btn(t), padding: "8px 12px", background: t.card, color: t.blue, borderColor: t.blueBd }}>
              {busy === "carry" ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Copy size={13} />} Salin dari {monthLabel(prevPeriod)}
            </button>
          )}
          {pending.seats > 0 && (
            <button onClick={generateAll} disabled={busy === "all"} title={`Buat ${pending.seats} seat untuk ${pending.clusters} cluster sekaligus`}
              style={{ ...btn(t), padding: "8px 13px", background: t.teal, color: "#fff", borderColor: t.teal, fontWeight: 800 }}>
              {busy === "all" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={14} />} Buat semua seat · {pending.seats}
            </button>
          )}
        </div>
      </div>

      <MFTSProgress t={t} prog={prog} />
      {err && <div style={{ ...card, padding: 12, borderColor: t.redBd, background: t.redBg, color: t.red, marginBottom: 12, fontSize: 13 }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {err}</div>}
      {info && <div style={{ ...card, padding: 12, borderColor: t.tealBd, background: t.tealBg, color: t.teal, marginBottom: 12, fontSize: 13 }}><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> {info}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
        <Mini t={t} label="Total kuota" value={totals.target} tone={t.hi} />
        <Mini t={t} label="Terisi" value={totals.fill} tone={t.green} />
        <Mini t={t} label="Vacancy open" value={totals.open} tone={t.amber} />
        <Mini t={t} label="Belum dibuatkan seat" value={totals.gap} tone={t.red} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 340 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: t.lo }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari brand / cluster / branch…" style={{ ...inp(t), paddingLeft: 30 }} />
        </div>
        {anyFilter && (
          <>
            <span style={{ fontSize: 11.5, color: t.mid }}>{rows.length} dari {baseRows.length} baris</span>
            <button onClick={clearFilters} style={{ ...btn(t), background: t.redBg, color: t.red, borderColor: t.redBd }}><FilterX size={14} /> Hapus filter</button>
          </>
        )}
      </div>

      {loading ? (
        <div style={{ ...card, padding: 30, textAlign: "center", color: t.mid }}><Loader2 size={16} style={{ animation: "spin 1s linear infinite", verticalAlign: -2 }} /> Memuat…</div>
      ) : clusters.length === 0 ? (
        <div style={{ ...card, padding: 36, textAlign: "center", color: t.mid }}>
          Belum ada data MC/Cluster{scope ? ` untuk ${scope}` : ""}. Upload <b style={{ color: t.hi }}>IOH Territory</b> dulu di tab <b style={{ color: t.hi }}>Territory</b>.
        </div>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
              <thead><tr style={{ background: t.sub, color: t.mid, textAlign: "left" }}>
                <th style={{ padding: "9px 8px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", textAlign: "center", width: 68, minWidth: 68 }}>No.</th>
                {FCOLS.map(([k, label]) => {
                  const active = (filters[k] || []).length > 0;
                  return (
                    <th key={k} style={{ padding: "9px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {label}
                        <button title="Filter"
                          onClick={(e) => { if (openCol === k) { setOpenCol(""); } else { const r = e.currentTarget.getBoundingClientRect(); setOpenRect({ left: r.left, top: r.bottom }); setOpenCol(k); } }}
                          style={{ display: "inline-flex", border: "none", background: active ? t.tealBg : "transparent", color: active ? t.teal : t.lo, borderRadius: 6, padding: 3, cursor: "pointer" }}>
                          <Filter size={12} />
                        </button>
                        {active && <span style={{ fontSize: 9, fontWeight: 800, color: t.teal }}>{(filters[k] || []).length}</span>}
                      </span>
                    </th>
                  );
                })}
                <th style={{ padding: "9px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }} />
              </tr></thead>
              <tbody>
                {rows.map((row, idx) => {
                  const key = row.key;
                  const target = effAlloc(key);
                  const inherited = isInherited(key);
                  const fill = memFill(row); const open = memOpen(row);
                  const gap = Math.max(0, target - fill - open);
                  const excess = Math.max(0, fill + open - target);       // seat melebihi kuota
                  const overFilled = Math.max(0, fill - target);          // terisi > kuota → harus dipindahkan
                  const cancellable = Math.min(excess, open);             // hanya seat OPEN yang bisa dibatalkan
                  const editable = canEditRegion(row.region);
                  const dval = draft[key] !== undefined ? draft[key] : String(target);
                  return (
                    <tr key={key} style={{ borderTop: `1px solid ${t.line}` }}>
                      <td style={{ padding: "9px 8px", color: t.lo, fontWeight: 600, textAlign: "center" }}>{idx + 1}</td>
                      <td style={{ padding: "9px 12px" }}>{brandBadge(t, row.brand)}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: t.hi }}>{row.label}{row.hybrid && <span style={{ fontSize: 10.5, color: t.lo, fontWeight: 500, marginLeft: 6 }}>{row.pair ? "IM3+3ID" : "hybrid"}</span>}</td>
                      <td style={{ padding: "9px 12px", color: t.mid }}>{row.branch || "—"}</td>
                      <td style={{ padding: "9px 12px", color: t.mid }}>{row.area || "—"}</td>
                      <td style={{ padding: "9px 12px", color: t.mid }}>{row.region || "—"}</td>
                      <td style={{ padding: "9px 12px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <input type="number" min={0} value={dval} disabled={!editable || busy === key}
                            onChange={(e) => setDraft((p) => ({ ...p, [key]: e.target.value }))}
                            onBlur={() => { if ((draft[key] ?? String(target)) !== String(target)) saveTarget(row); }}
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                            title={inherited ? `Warisan dari ${monthLabel(prevPeriod)} — edit untuk mengunci bulan ini` : undefined}
                            style={{ ...inp(t), width: 62, padding: "6px 8px", textAlign: "center", opacity: editable ? 1 : 0.55, borderStyle: inherited ? "dashed" : "solid", color: inherited ? t.mid : t.hi }} />
                          {inherited && target > 0 && <span title="Warisan bulan lalu" style={{ fontSize: 9, fontWeight: 800, color: t.blue, background: t.blueBg, border: `1px solid ${t.blueBd}`, padding: "1px 5px", borderRadius: 999 }}>warisan</span>}
                        </span>
                      </td>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: t.green }}>{fill}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: t.amber }}>{open}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 800, color: gap > 0 ? t.red : excess > 0 ? t.amber : t.lo }}>
                        {gap > 0 ? gap : excess > 0 ? `+${excess}` : 0}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "right" }}>
                        {editable && gap > 0 && (
                          <button onClick={() => generate(row, gap)} disabled={busy === key}
                            style={{ ...btn(t), padding: "5px 10px", background: t.teal, color: "#fff", borderColor: t.teal }}>
                            {busy === key ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <><Sparkles size={12} /> Buat {gap} seat</>}
                          </button>
                        )}
                        {editable && gap === 0 && cancellable > 0 && (
                          <button onClick={() => cancelSeats(row, cancellable)} disabled={busy === key}
                            title={`Batalkan ${cancellable} seat open yang melebihi kuota`}
                            style={{ ...btn(t), padding: "5px 10px", background: t.redBg, color: t.red, borderColor: t.redBd }}>
                            {busy === key ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <><Trash2 size={12} /> Tutup {cancellable} seat</>}
                          </button>
                        )}
                        {overFilled > 0 && (
                          <span title="Terisi melebihi kuota — pindahkan/keluarkan DSF di tab Manpower" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: t.red, background: t.redBg, border: `1px solid ${t.redBd}`, padding: "3px 8px", borderRadius: 999 }}>
                            <AlertTriangle size={11} /> Terisi {fill} &gt; kuota {target}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={11} style={{ padding: 26, textAlign: "center", color: t.lo }}>Tidak ada cluster yang cocok.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openCol && (
        <FilterMenuX t={t} rect={openRect} label={(FCOLS.find(([k]) => k === openCol) || [, openCol])[1]}
          options={optionsForCol(openCol)} selected={filters[openCol] || []}
          onChange={(arr) => setColFilter(openCol, arr)} onClose={() => { setOpenCol(""); setOpenRect(null); }} />
      )}

      {showHybrid && (
        <HybridMapModal t={t} clusters={clusters} rules={hybridRules} allAccess={allAccess} myRegion={myRegion}
          canEditRegion={canEditRegion} busy={busy} onAdd={addHybridRule} onRemove={removeHybridRule} onClose={() => setShowHybrid(false)} />
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ---------- Hybrid mapping manager (tanpa target) ---------- */
function HybridMapModal({ t, clusters, rules, allAccess, myRegion, canEditRegion, busy, onAdd, onRemove, onClose }) {
  const levels = SCOPE_LEVELS.filter(([k]) => k !== "circle" || allAccess); // circle hanya admin Sumatera
  const [level, setLevel] = useState("branch");
  const [value, setValue] = useState("");

  const options = useMemo(() => {
    if (level === "circle") return [...new Set(clusters.map((c) => c.circle).filter(Boolean))];
    if (level === "cluster") return [...new Set(clusters.map((c) => `MC-${baseName(c.mc_cluster)}`))].sort(); // kanonik MC- (IM3 & 3ID ikut via baseName)
    const accessor = (SCOPE_LEVELS.find(([k]) => k === level) || [, , "mc_cluster"])[2];
    const vals = [...new Set(clusters.map((c) => c[accessor]).filter(Boolean))];
    return vals.sort((a, b) => String(a).localeCompare(String(b)));
  }, [level, clusters]);

  useEffect(() => { setValue(""); }, [level]);

  const dup = rules.some((r) => r.scope_level === level && up(r.scope_value) === up(value));
  const card = { background: t.card, border: `1px solid ${t.line}`, borderRadius: 12 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FF }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: t.card, borderRadius: 16, border: `1px solid ${t.line}`, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${t.line}` }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: t.hi, display: "flex", alignItems: "center", gap: 7 }}><Link2 size={15} /> Mapping Hybrid</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.mid, cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, color: t.mid, marginBottom: 14 }}>Tandai cakupan di mana <b style={{ color: t.blue }}>1 DSF memegang IM3 + 3ID</b> (hybrid). Ini hanya penanda mapping — <b>tanpa</b> kuota. Target tetap diisi per cluster di tabel alokasi.</div>

          {/* form tambah */}
          <div style={{ ...card, padding: 12, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 8, alignItems: "end" }}>
              <div>
                <label style={lbl(t)}>Level</label>
                <select value={level} onChange={(e) => setLevel(e.target.value)} style={inp(t)}>
                  {levels.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl(t)}>{SCOPE_LABEL[level]}</label>
                <select value={value} onChange={(e) => setValue(e.target.value)} style={inp(t)}>
                  <option value="">— pilih {SCOPE_LABEL[level].toLowerCase()} —</option>
                  {options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <button disabled={!value || dup || busy === "hybrid"} onClick={() => onAdd({ level, value })}
                style={{ ...btn(t), background: t.teal, color: "#fff", borderColor: t.teal, opacity: !value || dup ? 0.5 : 1, height: 38 }}>
                {busy === "hybrid" ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <><Plus size={13} /> Tambah</>}
              </button>
            </div>
            {dup && value && <div style={{ fontSize: 11.5, color: t.amber, marginTop: 8 }}>Rule untuk {SCOPE_LABEL[level].toLowerCase()} “{value}” sudah ada.</div>}
            {level === "circle" && <div style={{ fontSize: 11.5, color: t.lo, marginTop: 8 }}>Circle = seluruh Sumatera (lintas region), hanya admin Sumatera.</div>}
          </div>

          {/* daftar rule */}
          <div style={{ fontSize: 11, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Rule aktif ({rules.length})</div>
          {rules.length === 0 ? (
            <div style={{ ...card, padding: 22, textAlign: "center", color: t.lo, fontSize: 13 }}>Belum ada mapping hybrid.</div>
          ) : (
            <div style={{ ...card, overflow: "hidden" }}>
              {rules.map((r, i) => {
                const editable = r.scope_level === "circle" ? allAccess : canEditRegion(r.region);
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: i ? `1px solid ${t.line}` : "none" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, background: t.blueBg, border: `1px solid ${t.blueBd}`, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", whiteSpace: "nowrap" }}>{SCOPE_LABEL[r.scope_level] || r.scope_level}</span>
                    <span style={{ fontWeight: 700, color: t.hi, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.scope_value}</span>
                    {r.region && <span style={{ fontSize: 11, color: t.mid, whiteSpace: "nowrap" }}>{r.region}</span>}
                    {editable && (
                      <button onClick={() => onRemove(r)} disabled={busy === "hyb-" + r.id} title="Hapus rule"
                        style={{ ...btn(t), padding: "5px 9px", color: t.red, borderColor: t.redBd, background: t.redBg }}>
                        {busy === "hyb-" + r.id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={13} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${t.line}`, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btn(t)}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Filter ala-Excel (cascading) ---------- */
function FilterMenu({ t, rect, label, options, selected, onChange, onClose }) {
  const [s, setS] = useState("");
  const term = s.trim().toLowerCase();
  const visible = options.filter((o) => !term || o.toLowerCase().includes(term));
  const isChecked = (o) => (selected.length === 0 ? true : selected.includes(o));
  const toggle = (o) => {
    const base = selected.length ? [...selected] : [...options];
    const i = base.indexOf(o);
    if (i >= 0) base.splice(i, 1); else base.push(o);
    if (base.length === 0 || base.length === options.length) onChange([]);
    else onChange(base);
  };
  const W = 234;
  const left = rect ? Math.max(8, Math.min(rect.left, (typeof window !== "undefined" ? window.innerWidth : 1200) - W - 8)) : 80;
  const top = rect ? rect.top + 4 : 80;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
      <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", left, top, zIndex: 201, width: W, background: t.card, border: `1px solid ${t.line}`, borderRadius: 11, boxShadow: "0 10px 30px rgba(0,0,0,.35)", padding: 9, fontFamily: FF, textTransform: "none" }}>
        <div style={{ position: "relative", marginBottom: 7 }}>
          <Search size={12} style={{ position: "absolute", left: 8, top: 9, color: t.lo }} />
          <input autoFocus value={s} onChange={(e) => setS(e.target.value)} placeholder={`Cari ${label}…`} style={{ ...inp(t), padding: "6px 8px 6px 24px", fontSize: 12 }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, gap: 6 }}>
          <button onClick={() => onChange([])} style={miniLink(t)}>Pilih semua</button>
          {term && <button onClick={() => onChange(visible.slice())} style={miniLink(t)}>Hanya hasil cari</button>}
        </div>
        <div style={{ maxHeight: 230, overflowY: "auto" }}>
          {visible.length === 0 && <div style={{ fontSize: 12, color: t.lo, padding: "8px 4px" }}>Tak ada opsi.</div>}
          {visible.map((o) => (
            <label key={o} onClick={() => toggle(o)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: t.hi }}>
              <span style={{ flex: "0 0 16px", width: 16, height: 16, borderRadius: 4, border: `1px solid ${isChecked(o) ? t.teal : t.line}`, background: isChecked(o) ? t.teal : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {isChecked(o) && <Check size={11} color="#fff" />}
              </span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o}</span>
            </label>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 7, borderTop: `1px solid ${t.line}`, paddingTop: 7 }}>
          <button onClick={onClose} style={{ ...btn(t), padding: "5px 12px", fontSize: 12 }}>Tutup</button>
        </div>
      </div>
    </>
  );
}

const miniLink = (t) => ({ background: "none", border: "none", color: t.teal, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: FF });
const btn = (t) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FF });
const inp = (t) => ({ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" });
const lbl = (t) => ({ fontSize: 11, fontWeight: 700, color: t.mid, marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: "0.04em" });
function Mini({ t, label, value, tone }) {
  return <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 13, padding: "12px 14px" }}>
    <div style={{ fontSize: 24, fontWeight: 800, color: tone, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 11.5, color: t.mid, marginTop: 5, fontWeight: 600 }}>{label}</div>
  </div>;
}
