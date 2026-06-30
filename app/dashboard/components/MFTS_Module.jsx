"use client";

// ============================================================
// MFTS — Manpower Fulfillment Tracking System (Fase 1)
// Action Center (exception-first) + daftar Vacancy + Maju stage.
// Sumber kebenaran: tabel mf_* di Supabase (TraceHub).
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle, Clock, Plus, ChevronRight, X, PauseCircle, PlayCircle,
  CheckCircle2, Loader2, Flag, RefreshCw, Briefcase, Map as MapIcon, UserCheck, Lock, KeyRound, Layers,
  Download, Upload, FilterX,
} from "lucide-react";
import MFTS_Territory from "./MFTS_Territory";
import MFTS_Manpower from "./MFTS_Manpower";
import MFTS_AgencyCodes from "./MFTS_AgencyCodes";
import MFTS_Allocation from "./MFTS_Allocation";
import { passesRow, optionsFor, FilterTh, FilterMenu } from "./MFTS_TableFilter";
import MFTSProgress from "./MFTS_Progress";

const VAC_FCOLS = [["fbrand", "Brand"], ["fim3", "ID_DSF_IM3"], ["f3id", "ID_DSF_3ID"], ["fstaffinc", "ID_STAFFINC"], ["fnama", "NAMA_DSF"], ["fmc", "MC"], ["fbranch", "Branch"], ["fregion", "Region"], ["fcircle", "Circle"], ["ftlid", "ID_STAFFINC_TL"], ["ftlnama", "NAMA_TL"], ["fstage", "Stage"], ["fage", "Umur"], ["fidle", "Idle"]];

const mk = (d) => ({
  bg   : d ? "#0D0D0F" : "#F2F4F7",
  card : d ? "#17171B" : "#FFFFFF",
  sub  : d ? "#1D1D22" : "#F8F9FA",
  line : d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi   : d ? "#F1F1F4" : "#0F1117",
  mid  : d ? "#8A8A9C" : "#6B7280",
  lo   : d ? "#4A4A5E" : "#A0A8B4",
  teal : "#32BCAD", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  blue : d ? "#0A84FF" : "#2563EB", blueBg: d ? "rgba(10,132,255,.1)" : "rgba(37,99,235,.07)", blueBd: d ? "rgba(10,132,255,.25)" : "rgba(37,99,235,.18)",
  mag  : "#C6168D", magBg: d ? "rgba(198,22,141,.12)" : "rgba(198,22,141,.07)", magBd: d ? "rgba(198,22,141,.3)" : "rgba(198,22,141,.18)",
  amber: "#D4A800", amberBg: d ? "rgba(255,203,5,.12)" : "rgba(212,168,0,.1)", amberBd: d ? "rgba(255,203,5,.3)" : "rgba(212,168,0,.25)",
  red  : "#ED1C24", redBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)", redBd: d ? "rgba(237,28,36,.25)" : "rgba(237,28,36,.18)",
  green: "#1A9E90",
  orange: "#E8830C", orangeBg: d ? "rgba(232,131,12,.14)" : "rgba(232,131,12,.09)", orangeBd: d ? "rgba(232,131,12,.35)" : "rgba(232,131,12,.22)",
  sm   : d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md   : d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// 3 Region Salesforce Management Sumatera (sesuai IOH Territory)
const REGIONS = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];
// Tipe manpower sales — Fase 1 fokus DSF; lainnya disiapkan.
const MTYPES = [["DSF", "DSF", true], ["DSE", "DSE", false], ["GSE_AE", "GSE & AE", false]];

const daysSince = (d) => {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function ageTone(t, days) {
  if (days > 30) return t.red;
  if (days > 14) return t.orange;
  if (days > 7) return t.amber;
  return t.green;
}

export default function MFTS_Module({ supabase, theme = "dark", profile, scopeRegion = null }) {
  const d = theme === "dark";
  const t = mk(d);

  const isSpm = profile?.role === "spm_sumatera"; // super admin → boleh edit mapping
  const scope = scopeRegion ? String(scopeRegion).toUpperCase() : null; // L3 region scoping

  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [vacancies, setVacancies] = useState([]);
  const [mapping, setMapping] = useState([]);   // mf_agency_mapping
  const [err, setErr] = useState("");
  const [advancing, setAdvancing] = useState(null); // vacancy obj
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState("vacancy"); // vacancy | territory | mapping
  const [mtype, setMtype] = useState("DSF"); // DSF | DSE | GSE_AE (Fase 1: DSF)
  const [vacUploading, setVacUploading] = useState(false);
  const [vacInfo, setVacInfo] = useState("");
  const vacFileRef = useRef(null);
  const [vacFilters, setVacFilters] = useState({});
  const [vacOpenCol, setVacOpenCol] = useState("");
  const [vacRect, setVacRect] = useState(null);
  const [vacProg, setVacProg] = useState(null);
  const [circleByBase, setCircleByBase] = useState({});

  async function load() {
    setLoading(true); setErr("");
    try {
      const [st, ag, rc, vc, mp, tc] = await Promise.all([
        supabase.from("mf_stages").select("*").order("ord"),
        supabase.from("mf_agencies").select("*").eq("active", true).order("name"),
        supabase.from("mf_reason_codes").select("*").eq("active", true).order("id"),
        supabase.from("mf_vacancies").select("*, agency:mf_agencies(name)").order("open_date", { ascending: true }),
        supabase.from("mf_agency_mapping").select("*, agency:mf_agencies(name)"),
        supabase.from("mf_territory_clusters").select("mc_cluster, circle").eq("manpower_type", "DSF"),
      ]);
      if (st.error || vc.error) throw new Error(st.error?.message || vc.error?.message);
      const cb = {}; const bnm = (n) => String(n || "").toUpperCase().replace(/^(MC[- ]|CS[- ])/, "").trim();
      for (const c of tc.data || []) { const b = bnm(c.mc_cluster); if (b && !cb[b]) cb[b] = c.circle || ""; }
      setCircleByBase(cb);
      setStages(st.data || []);
      setAgencies(ag.data || []);
      setReasons(rc.data || []);
      setVacancies(vc.data || []);
      setMapping(mp.data || []);
    } catch (e) {
      setErr(e.message || "Gagal memuat data MFTS");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stageById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);
  // (manpower_type|region) → agency_id, untuk auto-assign agency saat buat vacancy
  const agencyOf = useMemo(
    () => Object.fromEntries(mapping.map((m) => [`${m.manpower_type}|${m.region}`, m.agency_id])),
    [mapping]
  );

  // Enrich vacancy: stage, age, daysInStage(=idle), overdue
  const rows = useMemo(() => {
    return vacancies.map((v) => {
      const stage = stageById[v.current_stage_id] || null;
      const age = daysSince(v.open_date);
      const idle = daysSince(v.last_event_at);
      const onHold = v.status === "on_hold";
      const closed = v.status?.startsWith("closed");
      const overdue = !onHold && !closed && stage?.target_days != null && idle > stage.target_days;
      return { ...v, stage, age, idle, onHold, closed, overdue };
    });
  }, [vacancies, stageById]);

  // Vacancy view di-scope ke tipe manpower aktif (DSF/DSE/GSE_AE) + region (L3)
  const viewRows = useMemo(
    () => rows.filter((r) =>
      (r.manpower_type || "DSF") === mtype &&
      (!scope || String(r.region || "").toUpperCase() === scope)
    ),
    [rows, mtype, scope]
  );
  // Vacancy tab = HANYA seat yang masih perlu dicari agency (belum terisi).
  // Yang sudah terisi (closed_filled) tidak ditampilkan di sini.
  async function saveVacField(id, patch) {
    await supabase.from("mf_vacancies").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    setVacancies((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }
  // Enrich vacancy utk filter ala-Excel (kolom kategorikal terstandar)
  const bn = (n) => String(n || "").toUpperCase().replace(/^(MC[- ]|CS[- ])/, "").trim();
  const vacView = useMemo(() => viewRows.filter((r) => !r.closed).map((r) => ({
    ...r,
    fbrand: r.brand ? (String(r.brand).toUpperCase() === "HYBRID" ? "Hybrid" : r.brand) : "",
    fmc: r.mc_cluster ? `MC-${bn(r.mc_cluster)}` : "",
    fim3: r.id_dsf_im3 || "", f3id: r.id_dsf_3id || "", fstaffinc: r.id_staffinc || "", fnama: "VACANT",
    fregion: r.region || "", fbranch: r.branch || r.area || "", fcircle: circleByBase[bn(r.mc_cluster)] || "",
    ftlid: r.id_staffinc_tl || "", ftlnama: r.nama_tl || "",
    fstage: r.closed ? "Closed" : r.onHold ? "On-Hold" : (r.stage?.name || ""),
    fage: `${r.age}h`, fidle: `${r.idle}h`,
  })).sort((a, b) => {
    const U = (x) => String(x || "").toUpperCase();
    return U(a.region).localeCompare(U(b.region)) || U(a.area).localeCompare(U(b.area)) ||
      U(a.branch).localeCompare(U(b.branch)) || U(a.fmc).localeCompare(U(b.fmc)) || U(a.fbrand).localeCompare(U(b.fbrand));
  }), [viewRows, circleByBase]);
  const vacRows = useMemo(() => vacView.filter((r) => passesRow(r, vacFilters, VAC_FCOLS, null)), [vacView, vacFilters]);
  const anyVacFilter = VAC_FCOLS.some(([k]) => (vacFilters[k] || []).length);

  const open = viewRows.filter((r) => !r.closed);
  const ac = {
    overSla: open.filter((r) => r.overdue).length,
    idle: open.filter((r) => !r.onHold && r.idle > 5).length,
    critical: open.filter((r) => r.priority === "critical").length,
    open: open.length,
  };

  // ---------- actions ----------
  async function doAdvance(vac, toStageId, reasonId, note, counters) {
    const to = stageById[toStageId];
    const owner = to?.owner_default || "agency";
    const now = new Date().toISOString();
    const ev = {
      vacancy_id: vac.id, from_stage_id: vac.current_stage_id, to_stage_id: toStageId,
      owner, reason_code_id: reasonId || null, note: note || null, counters: counters || null,
      actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now,
    };
    const { error: e1 } = await supabase.from("mf_vacancy_events").insert(ev);
    if (e1) throw new Error(e1.message);
    const patch = {
      current_stage_id: toStageId, current_owner: owner, last_event_at: now, updated_at: now,
      status: to?.is_terminal ? "closed_filled" : "open",
    };
    const { error: e2 } = await supabase.from("mf_vacancies").update(patch).eq("id", vac.id);
    if (e2) throw new Error(e2.message);
    await load();
  }

  async function toggleHold(vac) {
    const now = new Date().toISOString();
    const next = vac.status === "on_hold" ? "open" : "on_hold";
    await supabase.from("mf_vacancy_events").insert({
      vacancy_id: vac.id, from_stage_id: vac.current_stage_id, to_stage_id: vac.current_stage_id,
      owner: "internal", note: next === "on_hold" ? "On-Hold (jam dihentikan)" : "Resume",
      actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now,
    });
    await supabase.from("mf_vacancies").update({ status: next, last_event_at: now, updated_at: now }).eq("id", vac.id);
    await load();
  }

  // ---------- Verifikasi Joined (anti-gaming) ----------
  const joinedStage = useMemo(() => stages.find((s) => /joined/i.test(s.name) && !s.is_terminal), [stages]);
  const terminalStage = useMemo(() => stages.find((s) => s.is_terminal) || [...stages].sort((a, b) => (b.ord || 0) - (a.ord || 0))[0], [stages]);

  // Internal mengonfirmasi joiner → buat manpower (dari identitas di seat) + tutup vacancy.
  async function verifyJoin(vac) {
    const now = new Date().toISOString();
    setErr("");
    const agency_id = agencyOf[`${vac.manpower_type || "DSF"}|${String(vac.region || "").toUpperCase()}`] || vac.agency_id || null;
    const { error: me } = await supabase.from("mf_manpower").upsert({
      manpower_type: vac.manpower_type || "DSF", seat_id: vac.seat_id, mc_cluster: vac.mc_cluster,
      name: vac.joined_name || null, brand: vac.brand || null,
      id_dsf_im3: vac.id_dsf_im3 || null, id_dsf_3id: vac.id_dsf_3id || null, id_staffinc: vac.id_staffinc || null,
      id_staffinc_tl: vac.id_staffinc_tl || null, nama_tl: vac.nama_tl || null,
      region: vac.region || null, branch: vac.branch || null, area: vac.area || null, circle: circleByBase[bn(vac.mc_cluster)] || null,
      status: "active", agency_id, join_date: now.slice(0, 10), updated_at: now,
    }, { onConflict: "manpower_type,seat_id" });
    if (me) { setErr("Gagal buat manpower: " + me.message); return; }
    await supabase.from("mf_vacancy_events").insert({
      vacancy_id: vac.id, from_stage_id: vac.current_stage_id, to_stage_id: terminalStage?.id, owner: "internal",
      note: `Verified joined: ${vac.joined_name || vac.id_staffinc || ""}`,
      actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now,
    });
    await supabase.from("mf_vacancies").update({ current_stage_id: terminalStage?.id, current_owner: "internal", status: "closed_filled", last_event_at: now, updated_at: now }).eq("id", vac.id);
    await load();
  }

  // Internal menolak → kembalikan ke pipeline (Joining Prep / Searching) tanpa membuat manpower.
  async function rejectJoin(vac) {
    const now = new Date().toISOString();
    const back = stages.find((s) => /joining prep/i.test(s.name)) || stages.find((s) => /searching/i.test(s.name)) || [...stages].sort((a, b) => a.ord - b.ord)[0];
    await supabase.from("mf_vacancy_events").insert({
      vacancy_id: vac.id, from_stage_id: vac.current_stage_id, to_stage_id: back?.id, owner: "internal",
      note: "Verifikasi ditolak — dikembalikan ke pipeline", actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now,
    });
    await supabase.from("mf_vacancies").update({ current_stage_id: back?.id, current_owner: back?.owner_default || "agency", status: "open", last_event_at: now, updated_at: now }).eq("id", vac.id);
    await load();
  }

  // ---------- Roster DSF (Excel massal: download lengkap + write-back per seat) ----------
  const up = (s) => String(s || "").toUpperCase().trim();
  const baseName = (n) => up(n).replace(/^(MC[- ]|CS[- ])/, "").trim();

  async function downloadRoster() {
    setErr(""); setVacInfo("");
    try {
      const [{ data: mp }, { data: tc }] = await Promise.all([
        supabase.from("mf_manpower").select("*").eq("manpower_type", "DSF").eq("status", "active"),
        supabase.from("mf_territory_clusters").select("mc_cluster,circle").eq("manpower_type", "DSF"),
      ]);
      const circleByBase = {};
      for (const c of tc || []) { const b = baseName(c.mc_cluster); if (b && !circleByBase[b]) circleByBase[b] = c.circle || ""; }

      // Satu baris per SEAT: seat vacant (open vacancy) + seat terisi (manpower aktif).
      const seatMap = new Map();
      for (const v of vacancies) {
        if ((v.manpower_type || "DSF") !== "DSF") continue;
        if (scope && up(v.region) !== scope) continue;
        if (String(v.status || "").startsWith("closed")) continue;
        const k = v.seat_id; if (!k) continue;
        seatMap.set(k, { seat_id: k, brand: v.brand || "", mc: v.mc_cluster || "", branch: v.branch || "", region: v.region || "", circle: circleByBase[baseName(v.mc_cluster)] || "", vim3: v.id_dsf_im3 || "", v3id: v.id_dsf_3id || "", vstaffinc: v.id_staffinc || "", vtl: v.id_staffinc_tl || "", vnamatl: v.nama_tl || "", m: null });
      }
      for (const m of mp || []) {
        if (scope && up(m.region) !== scope) continue;
        const k = m.seat_id || `mp:${m.id}`;
        const prev = seatMap.get(k) || {};
        const real = up(m.name) !== "VACANT"; // "VACANT" = kursi kosong, bukan orang
        seatMap.set(k, { seat_id: k, brand: m.brand || prev.brand || "", mc: m.mc_cluster || prev.mc || "", branch: m.branch || prev.branch || "", region: m.region || prev.region || "", circle: m.circle || prev.circle || circleByBase[baseName(m.mc_cluster || prev.mc)] || "", m: real ? m : null });
      }
      const rows = [...seatMap.values()].map((s) => {
        const filled = !!s.m; // hanya orang nyata; vacant → kolom DSF kosong, NAMA = VACANT
        return {
          key: s.seat_id,
          brand: up(s.brand) === "HYBRID" ? "Hybrid" : s.brand,
          id_im3: filled ? (s.m.id_dsf_im3 || "") : (s.vim3 || ""), id_3id: filled ? (s.m.id_dsf_3id || "") : (s.v3id || ""), id_staffinc: filled ? (s.m.id_staffinc || "") : (s.vstaffinc || ""),
          nama_dsf: filled ? (s.m.name || "") : "VACANT",
          mc: s.mc ? `MC-${baseName(s.mc)}` : "",
          branch: s.branch || "", region: s.region || "", circle: s.circle || "",
          id_tl: filled ? (s.m.id_staffinc_tl || "") : (s.vtl || ""), nama_tl: filled ? (s.m.nama_tl || "") : (s.vnamatl || ""),
        };
      }).sort((a, b) => (a.mc + a.brand).localeCompare(b.mc + b.brand));
      if (rows.length === 0) { setVacInfo("Belum ada seat (alokasi/vacancy) untuk diekspor. Buat seat dulu di tab Alokasi."); return; }

      const res = await fetch("/api/mfts/roster-template", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, scope: scope || "" }),
      });
      if (!res.ok) throw new Error("Gagal membuat file Excel");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `roster_DSF${scope ? "_" + scope.replace(/\s+/g, "_") : ""}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      const vacant = rows.filter((r) => up(r.nama_dsf) === "VACANT").length;
      setVacInfo(`Roster diunduh: ${rows.length} seat (${vacant} VACANT). Isi NAMA_DSF untuk mengisi; biarkan "VACANT" jika kursi masih kosong. Lalu unggah balik.`);
    } catch (e) { setErr(e.message); }
  }

  async function onUploadRoster(ev) {
    const file = ev.target.files?.[0]; ev.target.value = "";
    if (!file) return;
    setVacUploading(true); setErr(""); setVacInfo("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const vacBySeat = Object.fromEntries(vacancies.filter((v) => v.seat_id).map((v) => [v.seat_id, v]));
      const now = new Date().toISOString();
      let filled = 0, skipped = 0, closed = 0, failed = 0, reopened = 0;
      let i = 0;
      for (const r of data) {
        i++; setVacProg({ done: i, total: data.length, label: "Menyimpan roster…" });
        const key = String(r["Key"] ?? r["key"] ?? "").trim();
        if (!key) continue;
        const id_im3 = String(r["ID_DSF_IM3"] ?? "").trim();
        const id_3id = String(r["ID_DSF_3ID"] ?? "").trim();
        const id_staffinc = String(r["ID_STAFFINC"] ?? "").trim();
        const nama = String(r["NAMA_DSF"] ?? "").trim();
        const id_tl = String(r["ID_STAFFINC_TL"] ?? "").trim();
        const nama_tl = String(r["NAMA_TL"] ?? "").trim();

        // Kursi dianggap TERISI hanya bila NAMA_DSF berisi nama nyata (bukan kosong/"VACANT").
        // Walau kolom lain (ID, dsb.) diisi, "VACANT" tetap vacant.
        const isVacant = !nama || up(nama) === "VACANT";
        if (isVacant) {
          if (!key.startsWith("mp:")) {
            // pastikan tidak ada manpower utk seat ini; jika sebelumnya sempat terisi, buka kembali vacancy-nya
            await supabase.from("mf_manpower").delete().eq("manpower_type", "DSF").eq("seat_id", key);
            const v = vacBySeat[key];
            if (v) {
              // ID DSF + STAFFINC + TL tetap LENGKET di seat walau vacant (boleh diganti / kosong)
              const patch = { id_dsf_im3: id_im3 || null, id_dsf_3id: id_3id || null, id_staffinc: id_staffinc || null, id_staffinc_tl: id_tl || null, nama_tl: nama_tl || null, updated_at: now };
              if (String(v.status || "") === "closed_filled") {
                await supabase.from("mf_vacancy_events").insert({
                  vacancy_id: v.id, from_stage_id: v.current_stage_id, to_stage_id: v.current_stage_id, owner: "internal",
                  note: "Seat dikosongkan kembali (VACANT) via roster",
                  actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now,
                });
                patch.status = "open"; patch.last_event_at = now; reopened++;
              }
              await supabase.from("mf_vacancies").update(patch).eq("id", v.id);
            }
          }
          skipped++;
          continue;
        }

        const brandRaw = up(r["BRAND"] ?? "");
        const brand = brandRaw === "HYBRID" ? "HYBRID" : (brandRaw || null);
        const region = String(r["REGION"] ?? "").trim() || null;
        const branch = String(r["BRANCH"] ?? "").trim() || null;
        const circle = String(r["CIRCLE"] ?? "").trim() || null;
        const isMp = key.startsWith("mp:");
        const agency_id = region ? (agencyOf[`DSF|${up(region)}`] || null) : null;
        const payload = {
          manpower_type: "DSF", name: nama || null, brand,
          id_dsf_im3: id_im3 || null, id_dsf_3id: id_3id || null, id_staffinc: id_staffinc || null,
          id_staffinc_tl: id_tl || null, nama_tl: nama_tl || null,
          region, branch, circle, status: "active", agency_id, updated_at: now,
        };
        let error;
        if (isMp) { ({ error } = await supabase.from("mf_manpower").update(payload).eq("id", key.slice(3))); }
        else {
          payload.seat_id = key;
          payload.mc_cluster = key.replace(/-DSF-\d+$/i, ""); // seat_id encode cluster asli
          ({ error } = await supabase.from("mf_manpower").upsert(payload, { onConflict: "manpower_type,seat_id" }));
        }
        if (error) { failed++; continue; }
        filled++;

        // Seat terisi → tutup vacancy-nya (jaga konsistensi gap alokasi)
        const v = vacBySeat[key];
        if (v && !String(v.status || "").startsWith("closed")) {
          await supabase.from("mf_vacancy_events").insert({
            vacancy_id: v.id, from_stage_id: v.current_stage_id, to_stage_id: v.current_stage_id, owner: "internal",
            note: `Terisi via roster: ${nama || id_staffinc || "DSF"}`,
            actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now,
          });
          const { error: ce } = await supabase.from("mf_vacancies").update({ status: "closed_filled", id_dsf_im3: id_im3 || v.id_dsf_im3 || null, id_dsf_3id: id_3id || v.id_dsf_3id || null, id_staffinc: id_staffinc || v.id_staffinc || null, id_staffinc_tl: id_tl || v.id_staffinc_tl || null, nama_tl: nama_tl || v.nama_tl || null, last_event_at: now, updated_at: now }).eq("id", v.id);
          if (!ce) closed++;
        }
      }
      await load();
      const parts = [`${filled} seat terisi`];
      if (closed) parts.push(`${closed} vacancy ditutup`);
      if (reopened) parts.push(`${reopened} dikosongkan kembali`);
      if (skipped) parts.push(`${skipped} tetap vacant`);
      if (failed) parts.push(`${failed} gagal (cek wewenang)`);
      setVacInfo(parts.join(" · "));
    } catch (e) { setErr("Gagal membaca Excel: " + (e.message || e)); }
    finally { setVacUploading(false); setVacProg(null); }
  }

  // ---------- UI ----------
  const card = { background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, boxShadow: t.sm };

  if (loading) {
    return (
      <div style={{ fontFamily: FF, color: t.mid, display: "flex", alignItems: "center", gap: 10, padding: 40 }}>
        <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Memuat MFTS…
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: t.teal }}>
            <Briefcase size={13} /> Manpower Fulfillment
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4 }}>Pemenuhan Manpower</div>
            {scope && <span style={{ fontSize: 11, fontWeight: 800, color: t.blue, background: t.blueBg, border: `1px solid ${t.blueBd}`, padding: "3px 10px", borderRadius: 999 }}>{scope}</span>}
          </div>
          <div style={{ fontSize: 13, color: t.mid, marginTop: 2 }}>{scope ? `Hanya menampilkan region ${scope}.` : "Posisi kosong, sedang digarap, macet di mana, dan harus didorong yang mana."}</div>
        </div>
        {tab === "vacancy" && mtype === "DSF" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={load} style={{ ...btn(t), background: t.sub }}><RefreshCw size={14} /> Muat ulang</button>
            <button onClick={downloadRoster} style={{ ...btn(t), background: t.sub }}><Download size={14} /> Unduh Roster</button>
            <button onClick={() => vacFileRef.current?.click()} disabled={vacUploading} style={{ ...btn(t), background: t.sub }}>
              {vacUploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />} Unggah Roster
            </button>
            <input ref={vacFileRef} type="file" accept=".xlsx,.xls" onChange={onUploadRoster} style={{ display: "none" }} />
            <button onClick={() => setAdding(true)} style={{ ...btn(t), background: t.teal, color: "#fff", borderColor: t.teal }}><Plus size={14} /> Vacancy</button>
          </div>
        )}
      </div>

      {/* Tabs utama: Vacancy | Territory | Mapping Agency */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, borderBottom: `1px solid ${t.line}` }}>
        {[["vacancy", "Vacancy", <Briefcase key="b" size={14} />], ["alokasi", "Alokasi", <Layers key="l" size={14} />], ["manpower", "Manpower", <UserCheck key="c" size={14} />], ["territory", "Territory", <MapIcon key="m" size={14} />], ["agency", "Kode Agency", <KeyRound key="k" size={14} />]].map(([id, label, ic]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", background: "none", border: "none", borderBottom: `2px solid ${tab === id ? t.teal : "transparent"}`, color: tab === id ? t.hi : t.mid, fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: FF, marginBottom: -1 }}>
            {ic} {label}
          </button>
        ))}
      </div>

      {tab === "territory" && <MFTS_Territory supabase={supabase} theme={theme} profile={profile} />}

      {tab === "agency" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <AgencyMappingView t={t} supabase={supabase} mapping={mapping} agencies={agencies}
            regions={REGIONS} mtypes={MTYPES} canEdit={isSpm} onSaved={load} />
          {isSpm && (
            <div style={{ borderTop: `1px solid ${t.line}`, paddingTop: 24 }}>
              <MFTS_AgencyCodes supabase={supabase} theme={theme} profile={profile} agencies={agencies} />
            </div>
          )}
        </div>
      )}

      {/* Sub-menu tipe manpower — dipakai oleh Vacancy, Alokasi & Manpower */}
      {(tab === "vacancy" || tab === "manpower" || tab === "alokasi") && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {MTYPES.map(([id, label, ready]) => (
            <button key={id} onClick={() => setMtype(id)}
              style={{ padding: "7px 14px", borderRadius: 999, border: `1px solid ${mtype === id ? t.teal : t.line}`, background: mtype === id ? t.tealBg : t.card, color: mtype === id ? t.teal : t.mid, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: FF }}>
              {label}{!ready && <span style={{ marginLeft: 6, fontSize: 9, color: t.lo }}>· segera</span>}
            </button>
          ))}
        </div>
      )}

      {tab === "alokasi" && (
        <MFTS_Allocation supabase={supabase} theme={theme} profile={profile} mtype={mtype}
          scopeRegion={scope} regions={REGIONS} agencyOf={agencyOf} stages={stages} onChanged={load} />
      )}

      {tab === "manpower" && (
        <MFTS_Manpower supabase={supabase} theme={theme} profile={profile} mtype={mtype}
          agencies={agencies} regions={REGIONS} agencyOf={agencyOf} stages={stages}
          scopeRegion={scope} onVacancyCreated={load} />
      )}

      {tab === "vacancy" && <>
      {mtype !== "DSF" ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: t.mid }}>
          Modul <b style={{ color: t.hi }}>{mtype === "GSE_AE" ? "GSE & AE" : mtype}</b> disiapkan untuk fase berikutnya. Fase 1 fokus ke <b style={{ color: t.hi }}>DSF</b>.
          <div style={{ fontSize: 12, marginTop: 8, color: t.lo }}>Mapping agency untuk role ini sudah bisa diatur di tab <b style={{ color: t.mid }}>Mapping Agency</b>.</div>
        </div>
      ) : (<>
      {err && <div style={{ ...card, padding: 14, borderColor: t.redBd, background: t.redBg, color: t.red, marginBottom: 16 }}>{err}</div>}

      {/* Action Center */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 18 }}>
        <AcCard t={t} icon={<AlertTriangle size={16} />} tone={t.red} bg={t.redBg} bd={t.redBd} value={ac.overSla} label="Vacancy lewat SLA stage" />
        <AcCard t={t} icon={<Clock size={16} />} tone={t.orange} bg={t.amberBg} bd={t.amberBd} value={ac.idle} label="Didiamkan > 5 hari (idle)" />
        <AcCard t={t} icon={<Flag size={16} />} tone={t.mag} bg={t.magBg} bd={t.magBd} value={ac.critical} label="Prioritas kritikal" />
        <AcCard t={t} icon={<Briefcase size={16} />} tone={t.teal} bg={t.tealBg} bd={t.tealBd} value={ac.open} label="Total vacancy aktif" />
      </div>

      <MFTSProgress t={t} prog={vacProg} />
      {vacInfo && <div style={{ ...card, padding: 12, borderColor: t.tealBd, background: t.tealBg, color: t.teal, marginBottom: 14, fontSize: 13 }}><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> {vacInfo}</div>}

      {/* Vacancy table */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span>Daftar Vacancy <span style={{ color: t.mid, fontWeight: 500 }}>· seat yang sedang digarap</span></span>
          {anyVacFilter && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11.5, color: t.mid, fontWeight: 500 }}>{vacRows.length} dari {vacView.length} baris</span>
              <button onClick={() => { setVacFilters({}); setVacOpenCol(""); }} style={{ ...btn(t), padding: "5px 10px", background: t.redBg, color: t.red, borderColor: t.redBd }}><FilterX size={13} /> Hapus filter</button>
            </span>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: t.sub, color: t.mid, textAlign: "left" }}>
                <th style={{ padding: "9px 8px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center", width: 68, minWidth: 68 }}>No.</th>
                {VAC_FCOLS.map(([k, label]) => <FilterTh key={k} t={t} label={label} colKey={k} filters={vacFilters} onOpen={(ck, rc) => { setVacRect(rc); setVacOpenCol(ck); }} />)}
                <th style={{ padding: "9px 12px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }} />
              </tr>
            </thead>
            <tbody>
              {vacRows.length === 0 && (
                <tr><td colSpan={VAC_FCOLS.length + 2} style={{ padding: 28, textAlign: "center", color: t.lo }}>{anyVacFilter ? "Tidak ada vacancy yang cocok dengan filter." : "Semua seat sudah terisi — tidak ada yang perlu dicari agency."}</td></tr>
              )}
              {vacRows.map((r, i) => {
                const editCell = (field, val, w = 92) => (
                  <td style={{ padding: "6px 8px" }}>
                    <input defaultValue={val || ""} placeholder="—" title={`${field} (boleh diisi/diganti)`}
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (val || "")) saveVacField(r.id, { [field]: v || null }); }}
                      style={{ width: w, padding: "5px 7px", borderRadius: 7, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 12, fontFamily: FF, outline: "none" }} />
                  </td>
                );
                return (
                <tr key={r.id} style={{ borderTop: `1px solid ${t.line}`, opacity: r.closed ? 0.55 : 1 }}>
                  <td style={{ padding: "10px 8px", color: t.lo, fontWeight: 600, textAlign: "center" }}>{i + 1}</td>
                  <td style={{ padding: "10px 12px" }}>{brandBadge(t, r.fbrand)}</td>
                  {editCell("id_dsf_im3", r.id_dsf_im3)}
                  {editCell("id_dsf_3id", r.id_dsf_3id)}
                  {editCell("id_staffinc", r.id_staffinc)}
                  <td style={{ padding: "10px 12px", fontWeight: 800 }}>
                    {r.current_stage_id === joinedStage?.id && r.joined_name
                      ? <span style={{ color: t.blue }} title="Diajukan agency, menunggu verifikasi">{r.joined_name} <span style={{ fontSize: 9, fontWeight: 800, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, padding: "1px 5px", borderRadius: 5 }}>VERIFIKASI</span></span>
                      : <span style={{ color: t.amber }}>VACANT</span>}
                    {r.kind === "new" && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: t.blue, background: t.blueBg, border: `1px solid ${t.blueBd}`, padding: "1px 5px", borderRadius: 5 }}>NEW</span>}
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: t.hi }}>{r.fmc || "—"}</td>
                  <td style={{ padding: "10px 12px", color: t.mid }}>{r.branch || r.area || "—"}</td>
                  <td style={{ padding: "10px 12px", color: t.mid }}>{r.region || "—"}</td>
                  <td style={{ padding: "10px 12px", color: t.mid }}>{r.fcircle || "—"}</td>
                  {editCell("id_staffinc_tl", r.id_staffinc_tl)}
                  {editCell("nama_tl", r.nama_tl, 130)}
                  <td style={{ padding: "10px 12px" }}>
                    {r.onHold ? <span style={{ color: t.mid, fontWeight: 700 }}>On-Hold</span>
                      : <span style={{ fontWeight: 700 }}>{r.stage?.name || "—"}{r.overdue && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: t.red, background: t.redBg, border: `1px solid ${t.redBd}`, padding: "1px 5px", borderRadius: 5 }}>OVER SLA</span>}</span>}
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 800, color: ageTone(t, r.age) }}>{r.age}h</td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: r.idle > 5 && !r.onHold ? t.orange : t.lo }}>{r.idle}h</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {!r.closed && (r.current_stage_id === joinedStage?.id ? (
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button onClick={() => verifyJoin(r)} title="Konfirmasi joiner → buat manpower & tutup seat" style={{ ...btn(t), padding: "5px 10px", background: t.teal, color: "#fff", borderColor: t.teal }}><CheckCircle2 size={13} /> Verifikasi</button>
                        <button onClick={() => rejectJoin(r)} title="Tolak → kembalikan ke pipeline" style={{ ...btn(t), padding: "5px 10px", color: t.red, borderColor: t.redBd }}>Tolak</button>
                      </div>
                    ) : (
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button onClick={() => toggleHold(r)} title={r.onHold ? "Lanjutkan" : "Tahan (On-Hold)"} style={iconBtn(t)}>
                          {r.onHold ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
                        </button>
                        {!r.onHold && (
                          <button onClick={() => setAdvancing(r)} style={{ ...btn(t), padding: "5px 10px", background: t.teal, color: "#fff", borderColor: t.teal }}>
                            Maju <ChevronRight size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {vacOpenCol && (
        <FilterMenu t={t} rect={vacRect} label={(VAC_FCOLS.find(([k]) => k === vacOpenCol) || [, vacOpenCol])[1]}
          options={optionsFor(vacView, vacFilters, VAC_FCOLS, vacOpenCol)} selected={vacFilters[vacOpenCol] || []}
          onChange={(arr) => setVacFilters((p) => ({ ...p, [vacOpenCol]: arr }))} onClose={() => { setVacOpenCol(""); setVacRect(null); }} />
      )}

      {advancing && (
        <AdvanceModal t={t} vac={advancing} stages={stages} reasons={reasons} onClose={() => setAdvancing(null)}
          onSubmit={async (toStageId, reasonId, note, counters) => { await doAdvance(advancing, toStageId, reasonId, note, counters); setAdvancing(null); }} />
      )}
      {adding && (
        <AddVacancyModal t={t} agencies={agencies} supabase={supabase} profile={profile} stages={stages}
          mtype={mtype} regions={REGIONS} agencyOf={agencyOf} scopeRegion={scope}
          onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await load(); }} />
      )}
      </>)}
      </>}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ---------- bits ---------- */
const btn = (t) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FF });
const iconBtn = (t) => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.mid, cursor: "pointer" });

function AcCard({ t, icon, tone, bg, bd, value, label }) {
  return (
    <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: tone }}>{icon}<span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{value}</span></div>
      <div style={{ fontSize: 12, color: t.mid, marginTop: 6, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function brandBadge(t, b) {
  const x = String(b || "").toUpperCase();
  const m = x === "IM3" ? [t.mag, t.magBg, t.magBd] : x === "3ID" ? [t.orange, t.orangeBg, t.orangeBd] : x === "HYBRID" ? [t.blue, t.blueBg, t.blueBd] : [t.mid, "transparent", t.line];
  return <span style={{ fontSize: 10, fontWeight: 800, color: m[0], background: m[1], border: `1px solid ${m[2]}`, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap" }}>{b || "—"}</span>;
}
function priorityBadge(t, p) {
  const m = { critical: [t.red, t.redBg, t.redBd, "Critical"], high: [t.orange, t.amberBg, t.amberBd, "High"], normal: [t.mid, "transparent", t.line, "Normal"] }[p] || [t.mid, "transparent", t.line, p];
  return <span style={{ fontSize: 10.5, fontWeight: 800, color: m[0], background: m[1], border: `1px solid ${m[2]}`, padding: "2px 8px", borderRadius: 999 }}>{m[3]}</span>;
}
function ownerBadge(t, o) {
  const internal = o === "internal";
  return <span style={{ fontSize: 10, fontWeight: 800, color: internal ? t.blue : t.teal, background: internal ? t.blueBg : t.tealBg, border: `1px solid ${internal ? t.blueBd : t.tealBd}`, padding: "2px 7px", borderRadius: 6 }}>{internal ? "Internal" : "Agency"}</span>;
}

function Modal({ t, title, onClose, children, footer }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: t.card, borderRadius: 16, border: `1px solid ${t.line}`, boxShadow: t.md, fontFamily: FF, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${t.line}` }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: t.hi }}>{title}</div>
          <button onClick={onClose} style={{ ...iconBtn(t), border: "none", background: "transparent" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
        {footer && <div style={{ padding: "12px 18px", borderTop: `1px solid ${t.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}

const inp = (t) => ({ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" });
const lbl = (t) => ({ fontSize: 11, fontWeight: 700, color: t.mid, marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: "0.04em" });

function AdvanceModal({ t, vac, stages, reasons, onClose, onSubmit }) {
  const ordered = [...stages].sort((a, b) => a.ord - b.ord);
  const curOrd = stages.find((s) => s.id === vac.current_stage_id)?.ord ?? 0;
  const nextStage = ordered.find((s) => s.ord > curOrd) || ordered[ordered.length - 1];
  const [toId, setToId] = useState(nextStage?.id);
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [c, setC] = useState({ sourced: "", interviewed: "", offered: "", declined: "" });
  const [saving, setSaving] = useState(false);

  return (
    <Modal t={t} title={`Maju stage — ${vac.position}`} onClose={onClose}
      footer={<>
        <button onClick={onClose} style={btn(t)}>Batal</button>
        <button disabled={saving} onClick={async () => { setSaving(true); try { const counters = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v) || 0])); await onSubmit(toId, reasonId ? Number(reasonId) : null, note, counters); } finally { setSaving(false); } }}
          style={{ ...btn(t), background: t.teal, color: "#fff", borderColor: t.teal }}>{saving ? "Menyimpan…" : "Simpan"}</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={lbl(t)}>Pindah ke stage</label>
          <select value={toId} onChange={(e) => setToId(Number(e.target.value))} style={inp(t)}>
            {ordered.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.owner_default === "internal" ? "Internal" : "Agency"})</option>)}
          </select>
        </div>
        <div>
          <label style={lbl(t)}>Alasan / blocker (opsional)</label>
          <select value={reasonId} onChange={(e) => setReasonId(e.target.value)} style={inp(t)}>
            <option value="">— tidak ada —</option>
            {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl(t)}>Kandidat (opsional)</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {["sourced", "interviewed", "offered", "declined"].map((k) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: t.lo, marginBottom: 3, textTransform: "capitalize" }}>{k}</div>
                <input type="number" value={c[k]} onChange={(e) => setC((p) => ({ ...p, [k]: e.target.value }))} style={{ ...inp(t), padding: "7px 8px", textAlign: "center" }} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <label style={lbl(t)}>Catatan (opsional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...inp(t), resize: "vertical" }} />
        </div>
      </div>
    </Modal>
  );
}

function AddVacancyModal({ t, agencies, supabase, profile, stages, mtype, regions, agencyOf, scopeRegion = null, onClose, onDone }) {
  const [f, setF] = useState({ position: "", region: scopeRegion || "", area: "", branch: "", agency_id: scopeRegion ? (agencyOf[`${mtype}|${scopeRegion}`] || "") : "", kind: "replacement", priority: "normal", target_date: "" });
  const [agencyTouched, setAgencyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [e, setE] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const firstStage = [...stages].sort((a, b) => a.ord - b.ord)[0];

  // Auto-resolve agency dari mapping (manpower_type × region) — kecuali user override manual.
  const mappedAgencyId = f.region ? (agencyOf[`${mtype}|${f.region}`] || "") : "";
  const effAgencyId = agencyTouched ? f.agency_id : mappedAgencyId;
  const mappedName = agencies.find((a) => a.id === mappedAgencyId)?.name;

  function onRegion(v) {
    setF((p) => ({ ...p, region: v }));
    if (!agencyTouched) setF((p) => ({ ...p, region: v, agency_id: agencyOf[`${mtype}|${v}`] || "" }));
  }

  async function save() {
    if (!f.position.trim()) { setE("Posisi wajib diisi"); return; }
    setSaving(true); setE("");
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase.from("mf_vacancies").insert({
        manpower_type: mtype,
        position: f.position.trim(), region: f.region || null, area: f.area || null, branch: f.branch || null,
        agency_id: effAgencyId || null, kind: f.kind, priority: f.priority,
        target_date: f.target_date || null, current_stage_id: firstStage?.id, current_owner: firstStage?.owner_default || "agency",
        last_event_at: now,
      }).select("id").single();
      if (error) throw new Error(error.message);
      await supabase.from("mf_vacancy_events").insert({
        vacancy_id: data.id, from_stage_id: null, to_stage_id: firstStage?.id, owner: firstStage?.owner_default || "agency",
        note: "Vacancy dibuka", actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now,
      });
      await onDone();
    } catch (err) { setE(err.message || "Gagal menyimpan"); setSaving(false); }
  }

  return (
    <Modal t={t} title={`Tambah Vacancy · ${mtype === "GSE_AE" ? "GSE & AE" : mtype}`} onClose={onClose}
      footer={<>
        <button onClick={onClose} style={btn(t)}>Batal</button>
        <button disabled={saving} onClick={save} style={{ ...btn(t), background: t.teal, color: "#fff", borderColor: t.teal }}>{saving ? "Menyimpan…" : "Simpan"}</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {e && <div style={{ color: t.red, fontSize: 12, fontWeight: 600 }}>{e}</div>}
        <div><label style={lbl(t)}>Posisi *</label><input value={f.position} onChange={(ev) => set("position", ev.target.value)} placeholder="mis. DSF IM3 Banda Aceh" style={inp(t)} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div><label style={lbl(t)}>Region</label>
            <select value={f.region} disabled={!!scopeRegion} onChange={(ev) => onRegion(ev.target.value)} style={{ ...inp(t), opacity: scopeRegion ? 0.7 : 1 }}>
              <option value="">— pilih —</option>
              {(scopeRegion ? [scopeRegion] : regions).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div><label style={lbl(t)}>Area</label><input value={f.area} onChange={(ev) => set("area", ev.target.value)} style={inp(t)} /></div>
          <div><label style={lbl(t)}>Branch</label><input value={f.branch} onChange={(ev) => set("branch", ev.target.value)} style={inp(t)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><label style={lbl(t)}>Agency</label>
            <select value={effAgencyId} onChange={(ev) => { setAgencyTouched(true); set("agency_id", ev.target.value); }} style={inp(t)}>
              <option value="">— pilih —</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {!agencyTouched && mappedName && <div style={{ fontSize: 10.5, color: t.teal, marginTop: 4 }}>Otomatis dari mapping: <b>{mappedName}</b></div>}
            {!agencyTouched && f.region && !mappedName && <div style={{ fontSize: 10.5, color: t.amber, marginTop: 4 }}>Belum ada mapping agency untuk {mtype} · {f.region}.</div>}
          </div>
          <div><label style={lbl(t)}>Jenis</label>
            <select value={f.kind} onChange={(ev) => set("kind", ev.target.value)} style={inp(t)}>
              <option value="replacement">Replacement</option>
              <option value="new">New Headcount</option>
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><label style={lbl(t)}>Prioritas</label>
            <select value={f.priority} onChange={(ev) => set("priority", ev.target.value)} style={inp(t)}>
              <option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option>
            </select>
          </div>
          <div><label style={lbl(t)}>Target tanggal</label><input type="date" value={f.target_date} onChange={(ev) => set("target_date", ev.target.value)} style={inp(t)} /></div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Mapping Agency (Role × Region → Agency) ---------- */
function AgencyMappingView({ t, supabase, mapping, agencies, regions, mtypes, canEdit, onSaved }) {
  const [busy, setBusy] = useState("");   // "${mtype}|${region}" yang sedang disimpan
  const [err, setErr] = useState("");
  const cur = useMemo(
    () => Object.fromEntries(mapping.map((m) => [`${m.manpower_type}|${m.region}`, m.agency_id])),
    [mapping]
  );

  async function setCell(mt, region, agencyId) {
    const key = `${mt}|${region}`;
    setBusy(key); setErr("");
    try {
      if (!agencyId) {
        const { error } = await supabase.from("mf_agency_mapping").delete().eq("manpower_type", mt).eq("region", region);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("mf_agency_mapping")
          .upsert({ manpower_type: mt, region, agency_id: agencyId }, { onConflict: "manpower_type,region" });
        if (error) throw new Error(error.message);
      }
      await onSaved();
    } catch (e) { setErr(e.message || "Gagal menyimpan mapping"); }
    finally { setBusy(""); }
  }

  const totalCells = mtypes.length * regions.length;
  const filled = mtypes.reduce((n, [mt]) => n + regions.filter((r) => cur[`${mt}|${r}`]).length, 0);
  const card = { background: t.card, border: `1px solid ${t.line}`, borderRadius: 14 };

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Mapping Agency</div>
          <div style={{ fontSize: 13, color: t.mid, marginTop: 2 }}>Tentukan agency pengisi untuk setiap <b>Role × Region</b>. Vacancy baru otomatis dialokasikan ke agency sesuai mapping ini.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: t.mid }}>{filled}/{totalCells} terisi</span>
          {!canEdit && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: t.mid, background: t.sub, border: `1px solid ${t.line}`, padding: "4px 9px", borderRadius: 999 }}><Lock size={12} /> Read-only</span>}
        </div>
      </div>

      {err && <div style={{ ...card, padding: 12, borderColor: t.redBd, background: t.redBg, color: t.red, marginBottom: 14, fontSize: 13 }}>{err}</div>}
      {!canEdit && <div style={{ fontSize: 12, color: t.lo, marginBottom: 12 }}>Hanya <b style={{ color: t.mid }}>spm_sumatera</b> yang dapat mengubah mapping.</div>}

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: t.sub, color: t.mid, textAlign: "left" }}>
                <th style={{ padding: "10px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>Role</th>
                {regions.map((r) => (
                  <th key={r} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mtypes.map(([mt, label]) => (
                <tr key={mt} style={{ borderTop: `1px solid ${t.line}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 800, color: t.hi, whiteSpace: "nowrap" }}>{label}</td>
                  {regions.map((r) => {
                    const key = `${mt}|${r}`;
                    const val = cur[key] || "";
                    return (
                      <td key={r} style={{ padding: "8px 12px", minWidth: 190 }}>
                        <div style={{ position: "relative" }}>
                          <select disabled={!canEdit || busy === key} value={val}
                            onChange={(ev) => setCell(mt, r, ev.target.value)}
                            style={{ ...inp(t), opacity: !canEdit ? 0.7 : 1, cursor: canEdit ? "pointer" : "default", borderColor: val ? t.tealBd : t.line }}>
                            <option value="">— belum diatur —</option>
                            {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          {busy === key && <Loader2 size={13} style={{ position: "absolute", right: 28, top: 11, animation: "spin 1s linear infinite", color: t.mid }} />}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: t.lo, marginTop: 10 }}>
        Mengubah mapping hanya memengaruhi vacancy <b>baru</b>. Vacancy yang sudah berjalan tetap memakai agency saat dibuka.
      </div>
    </div>
  );
}
