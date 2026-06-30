"use client";

// ============================================================
// MFTS — Roster DSF (master per seat: terisi + vacant)
// Kolom seragam dengan roster Excel: BRAND · ID_DSF_IM3 · ID_DSF_3ID ·
// ID_STAFFINC · NAMA_DSF · MC · BRANCH · REGION · CIRCLE · ID_STAFFINC_TL ·
// NAMA_TL · STATUS. Filter ala-Excel (pilih semua / hapus) di tiap kolom.
// RESIGN → otomatis vacancy replacement (agency dari mapping).
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Plus, Search, RefreshCw, Loader2, X, Pencil, UserMinus, AlertTriangle, FilterX, Download, Upload, CheckCircle2,
} from "lucide-react";
import { passesRow, optionsFor, FilterTh, FilterMenu } from "./MFTS_TableFilter";
import MFTSProgress from "./MFTS_Progress";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA",
  line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  teal: "#32BCAD", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  green: "#1A9E90", greenBg: d ? "rgba(26,158,144,.12)" : "rgba(26,158,144,.08)", greenBd: d ? "rgba(26,158,144,.3)" : "rgba(26,158,144,.2)",
  red: "#ED1C24", redBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)", redBd: d ? "rgba(237,28,36,.25)" : "rgba(237,28,36,.18)",
  amber: "#D4A800", amberBg: d ? "rgba(255,203,5,.12)" : "rgba(212,168,0,.1)", amberBd: d ? "rgba(255,203,5,.3)" : "rgba(212,168,0,.25)",
  mag: "#C6168D", magBg: d ? "rgba(198,22,141,.14)" : "rgba(198,22,141,.08)", magBd: d ? "rgba(198,22,141,.35)" : "rgba(198,22,141,.2)",
  orange: "#E8830C", orangeBg: d ? "rgba(232,131,12,.14)" : "rgba(232,131,12,.09)", orangeBd: d ? "rgba(232,131,12,.35)" : "rgba(232,131,12,.22)",
  blue: d ? "#0A84FF" : "#2563EB", blueBg: d ? "rgba(10,132,255,.12)" : "rgba(37,99,235,.08)", blueBd: d ? "rgba(10,132,255,.3)" : "rgba(37,99,235,.2)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  md: d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const up = (s) => String(s || "").toUpperCase().trim();
const baseName = (n) => up(n).replace(/^(MC[- ]|CS[- ])/, "").trim();
const mcLabel = (c) => (c ? `MC-${baseName(c)}` : "");

// SEMUA kolom bisa difilter ala-Excel (tanpa terkecuali)
const FCOLS = [
  ["brand", "Brand"], ["id_im3", "ID_DSF_IM3"], ["id_3id", "ID_DSF_3ID"], ["id_staffinc", "ID_STAFFINC"],
  ["nama", "NAMA_DSF"], ["mc", "MC"], ["branch", "Branch"], ["region", "Region"], ["circle", "Circle"],
  ["id_tl", "ID_STAFFINC_TL"], ["nama_tl", "NAMA_TL"], ["status", "Status"],
];

function brandBadge(t, b) {
  const x = up(b);
  const m = x === "IM3" ? [t.mag, t.magBg, t.magBd] : x === "3ID" ? [t.orange, t.orangeBg, t.orangeBd] : x === "HYBRID" ? [t.blue, t.blueBg, t.blueBd] : [t.mid, "transparent", t.line];
  return <span style={{ fontSize: 10, fontWeight: 800, color: m[0], background: m[1], border: `1px solid ${m[2]}`, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap" }}>{b || "—"}</span>;
}
function statusBadge(t, s) {
  const m = s === "Terisi" ? [t.green, t.greenBg, t.greenBd] : s === "Vacant" ? [t.amber, t.amberBg, t.amberBd] : [t.red, t.redBg, t.redBd];
  return <span style={{ fontSize: 10, fontWeight: 800, color: m[0], background: m[1], border: `1px solid ${m[2]}`, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{s}</span>;
}

export default function MFTS_Manpower({ supabase, theme = "dark", profile, mtype, agencies = [], regions = [], agencyOf = {}, stages = [], scopeRegion = null, onVacancyCreated }) {
  const d = theme === "dark";
  const t = mk(d);
  const scope = scopeRegion ? up(scopeRegion) : null;

  const [loading, setLoading] = useState(true);
  const [list, setList] = useState([]);     // mf_manpower
  const [vacs, setVacs] = useState([]);     // open vacancies (seat vacant)
  const [circleByBase, setCircleByBase] = useState({});
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [showResign, setShowResign] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resigning, setResigning] = useState(null);
  const [filters, setFilters] = useState({});
  const [openCol, setOpenCol] = useState("");
  const [rect, setRect] = useState(null);
  const [info, setInfo] = useState("");
  const [uploading, setUploading] = useState(false);
  const [prog, setProg] = useState(null);
  const fileRef = useRef(null);

  async function load() {
    setLoading(true); setErr("");
    try {
      const [mp, vc, tc] = await Promise.all([
        supabase.from("mf_manpower").select("*, agency:mf_agencies(name)").eq("manpower_type", mtype).order("name"),
        supabase.from("mf_vacancies").select("id, seat_id, mc_cluster, brand, branch, area, region, status, manpower_type, current_stage_id, id_dsf_im3, id_dsf_3id, id_staffinc, id_staffinc_tl, nama_tl").eq("manpower_type", mtype),
        supabase.from("mf_territory_clusters").select("mc_cluster, circle").eq("manpower_type", mtype),
      ]);
      if (mp.error) throw new Error(mp.error.message);
      const cb = {}; for (const c of tc.data || []) { const b = baseName(c.mc_cluster); if (b && !cb[b]) cb[b] = c.circle || ""; }
      setCircleByBase(cb);
      setList(mp.data || []);
      setVacs((vc.data || []).filter((v) => !String(v.status || "").startsWith("closed")));
    } catch (e) { setErr(e.message || "Gagal memuat roster"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [mtype]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstStage = useMemo(() => [...stages].sort((a, b) => a.ord - b.ord)[0], [stages]);

  // Bangun baris roster: terisi (manpower real) + vacant (open vacancy)
  const roster = useMemo(() => {
    const out = [];
    for (const m of list) {
      if (up(m.name) === "VACANT") continue;                 // penanda kosong, bukan orang
      if (m.status === "resign" && !showResign) continue;
      out.push({
        brand: up(m.brand) === "HYBRID" ? "Hybrid" : (m.brand || ""),
        id_im3: m.id_dsf_im3 || "", id_3id: m.id_dsf_3id || "", id_staffinc: m.id_staffinc || "",
        nama: m.name || "", mc: mcLabel(m.mc_cluster), branch: m.branch || "", area: m.area || "", region: m.region || "",
        circle: m.circle || circleByBase[baseName(m.mc_cluster)] || "", id_tl: m.id_staffinc_tl || "", nama_tl: m.nama_tl || "",
        status: m.status === "resign" ? "Resign" : "Terisi", _mp: m, key: m.seat_id || `mp:${m.id}`,
      });
    }
    for (const v of vacs) {
      out.push({
        brand: up(v.brand) === "HYBRID" ? "Hybrid" : (v.brand || ""),
        id_im3: v.id_dsf_im3 || "", id_3id: v.id_dsf_3id || "", id_staffinc: v.id_staffinc || "", nama: "VACANT", mc: mcLabel(v.mc_cluster),
        branch: v.branch || "", area: v.area || "", region: v.region || "", circle: circleByBase[baseName(v.mc_cluster)] || "",
        id_tl: v.id_staffinc_tl || "", nama_tl: v.nama_tl || "", status: "Vacant", _mp: null, key: v.seat_id || "",
      });
    }
    // Urut: Region → Area → Branch → MC/Cluster → Brand
    return out.sort((a, b) =>
      up(a.region).localeCompare(up(b.region)) || up(a.area).localeCompare(up(b.area)) ||
      up(a.branch).localeCompare(up(b.branch)) || up(a.mc).localeCompare(up(b.mc)) ||
      up(a.brand).localeCompare(up(b.brand)));
  }, [list, vacs, circleByBase, showResign]);

  // Scope (L3) + pencarian teks bebas
  const searched = useMemo(() => {
    const term = q.trim().toLowerCase();
    return roster.filter((r) => {
      if (scope && up(r.region) !== scope) return false;
      if (!term) return true;
      return [r.nama, r.id_im3, r.id_3id, r.id_staffinc, r.mc, r.branch, r.region, r.nama_tl, r.id_tl]
        .some((x) => String(x || "").toLowerCase().includes(term));
    });
  }, [roster, q, scope]);

  const rows = useMemo(() => searched.filter((r) => passesRow(r, filters, FCOLS, null)), [searched, filters]);
  const anyFilter = FCOLS.some(([k]) => (filters[k] || []).length);

  const counts = useMemo(() => ({
    terisi: roster.filter((r) => r.status === "Terisi").length,
    vacant: roster.filter((r) => r.status === "Vacant").length,
    resign: roster.filter((r) => r.status === "Resign").length,
  }), [roster]);

  // RESIGN → vacancy replacement
  async function doResign(m, resignDate) {
    const now = new Date().toISOString();
    const upd = await supabase.from("mf_manpower").update({ status: "resign", resign_date: resignDate, updated_at: now }).eq("id", m.id);
    if (upd.error) throw new Error(upd.error.message);
    const mappedAgency = agencyOf[`${mtype}|${up(m.region)}`] || m.agency_id || null;
    const { data: vac, error: ve } = await supabase.from("mf_vacancies").insert({
      manpower_type: mtype, position: m.position || `${mtype} ${m.branch || m.region || ""}`.trim(),
      region: m.region || null, area: m.area || null, branch: m.branch || null, mc_cluster: m.mc_cluster || null, brand: m.brand || null,
      id_dsf_im3: m.id_dsf_im3 || null, id_dsf_3id: m.id_dsf_3id || null,   // ID lengket ke seat
      id_staffinc: m.id_staffinc || null, id_staffinc_tl: m.id_staffinc_tl || null, nama_tl: m.nama_tl || null,
      agency_id: mappedAgency, kind: "replacement", priority: "normal", status: "open",
      seat_id: m.seat_id || null, prev_employee_id: m.employee_id || null, open_date: resignDate, target_date: null,
      current_stage_id: firstStage?.id, current_owner: firstStage?.owner_default || "agency", last_event_at: now,
    }).select("id").single();
    if (ve) throw new Error(ve.message);
    await supabase.from("mf_vacancy_events").insert({
      vacancy_id: vac.id, from_stage_id: null, to_stage_id: firstStage?.id, owner: firstStage?.owner_default || "agency",
      note: `Vacancy dibuka (replacement — resign ${m.name || m.employee_id || ""})`,
      actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now,
    });
    await load();
    onVacancyCreated && (await onVacancyCreated());
  }

  // ---------- Excel roster: unduh (yang terlihat) + unggah balik ----------
  async function downloadRoster() {
    setErr(""); setInfo("");
    try {
      const out = rows.map((r) => ({
        key: r.key, brand: r.brand, id_im3: r.id_im3, id_3id: r.id_3id, id_staffinc: r.id_staffinc,
        nama_dsf: r.nama, mc: r.mc, branch: r.branch, region: r.region, circle: r.circle, id_tl: r.id_tl, nama_tl: r.nama_tl,
      }));
      if (out.length === 0) { setInfo("Tidak ada baris untuk diekspor."); return; }
      const res = await fetch("/api/mfts/roster-template", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: out, scope: scope || "" }) });
      if (!res.ok) throw new Error("Gagal membuat file Excel");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `roster_${mtype}${scope ? "_" + scope.replace(/\s+/g, "_") : ""}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      const vacant = out.filter((r) => up(r.nama_dsf) === "VACANT").length;
      setInfo(`Roster diunduh (${out.length} baris · ${vacant} VACANT). Isi NAMA_DSF/ID/TL lalu unggah balik.`);
    } catch (e) { setErr(e.message); }
  }

  async function onUploadRoster(ev) {
    const file = ev.target.files?.[0]; ev.target.value = "";
    if (!file) return;
    setUploading(true); setErr(""); setInfo("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const { data: allVac } = await supabase.from("mf_vacancies").select("id, seat_id, status, current_stage_id, id_dsf_im3, id_dsf_3id, id_staffinc, id_staffinc_tl, nama_tl").eq("manpower_type", mtype);
      const vacBySeat = Object.fromEntries((allVac || []).filter((v) => v.seat_id).map((v) => [v.seat_id, v]));
      const now = new Date().toISOString();
      let filled = 0, skipped = 0, closed = 0, failed = 0, reopened = 0, i = 0;
      for (const r of data) {
        i++; setProg({ done: i, total: data.length, label: "Menyimpan roster…" });
        const key = String(r["Key"] ?? r["key"] ?? "").trim();
        if (!key) continue;
        const id_im3 = String(r["ID_DSF_IM3"] ?? "").trim();
        const id_3id = String(r["ID_DSF_3ID"] ?? "").trim();
        const id_staffinc = String(r["ID_STAFFINC"] ?? "").trim();
        const nama = String(r["NAMA_DSF"] ?? "").trim();
        const id_tl = String(r["ID_STAFFINC_TL"] ?? "").trim();
        const nama_tl = String(r["NAMA_TL"] ?? "").trim();
        const isVacant = !nama || up(nama) === "VACANT";
        if (isVacant) {
          if (!key.startsWith("mp:")) {
            await supabase.from("mf_manpower").delete().eq("manpower_type", mtype).eq("seat_id", key);
            const v = vacBySeat[key];
            if (v) {
              const patch = { id_dsf_im3: id_im3 || null, id_dsf_3id: id_3id || null, id_staffinc: id_staffinc || null, id_staffinc_tl: id_tl || null, nama_tl: nama_tl || null, updated_at: now };
              if (String(v.status || "") === "closed_filled") {
                await supabase.from("mf_vacancy_events").insert({ vacancy_id: v.id, from_stage_id: v.current_stage_id, to_stage_id: v.current_stage_id, owner: "internal", note: "Seat dikosongkan kembali (VACANT) via roster", actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now });
                patch.status = "open"; patch.last_event_at = now; reopened++;
              }
              await supabase.from("mf_vacancies").update(patch).eq("id", v.id);
            }
          }
          skipped++; continue;
        }
        const brandRaw = up(r["BRAND"] ?? "");
        const brand = brandRaw === "HYBRID" ? "HYBRID" : (brandRaw || null);
        const region = String(r["REGION"] ?? "").trim() || null;
        const branch = String(r["BRANCH"] ?? "").trim() || null;
        const circle = String(r["CIRCLE"] ?? "").trim() || null;
        const isMp = key.startsWith("mp:");
        const agency_id = region ? (agencyOf[`${mtype}|${up(region)}`] || null) : null;
        const payload = { manpower_type: mtype, name: nama || null, brand, id_dsf_im3: id_im3 || null, id_dsf_3id: id_3id || null, id_staffinc: id_staffinc || null, id_staffinc_tl: id_tl || null, nama_tl: nama_tl || null, region, branch, circle, status: "active", agency_id, updated_at: now };
        let error;
        if (isMp) { ({ error } = await supabase.from("mf_manpower").update(payload).eq("id", key.slice(3))); }
        else { payload.seat_id = key; payload.mc_cluster = key.replace(/-DSF-\d+$/i, ""); ({ error } = await supabase.from("mf_manpower").upsert(payload, { onConflict: "manpower_type,seat_id" })); }
        if (error) { failed++; continue; }
        filled++;
        const v = vacBySeat[key];
        if (v && !String(v.status || "").startsWith("closed")) {
          await supabase.from("mf_vacancy_events").insert({ vacancy_id: v.id, from_stage_id: v.current_stage_id, to_stage_id: v.current_stage_id, owner: "internal", note: `Terisi via roster: ${nama || id_staffinc || "DSF"}`, actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null, actor_role: profile?.role || null, ts: now });
          const { error: ce } = await supabase.from("mf_vacancies").update({ status: "closed_filled", id_dsf_im3: id_im3 || v.id_dsf_im3 || null, id_dsf_3id: id_3id || v.id_dsf_3id || null, id_staffinc: id_staffinc || v.id_staffinc || null, id_staffinc_tl: id_tl || v.id_staffinc_tl || null, nama_tl: nama_tl || v.nama_tl || null, last_event_at: now, updated_at: now }).eq("id", v.id);
          if (!ce) closed++;
        }
      }
      await load();
      onVacancyCreated && (await onVacancyCreated());
      const parts = [`${filled} seat terisi`];
      if (closed) parts.push(`${closed} vacancy ditutup`);
      if (reopened) parts.push(`${reopened} dikosongkan kembali`);
      if (skipped) parts.push(`${skipped} tetap vacant`);
      if (failed) parts.push(`${failed} gagal (cek wewenang)`);
      setInfo(parts.join(" · "));
    } catch (e) { setErr("Gagal membaca Excel: " + (e.message || e)); }
    finally { setUploading(false); setProg(null); }
  }

  const card = { background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, boxShadow: t.sm };
  const COLS = [
    ["brand", "Brand"], ["id_im3", "ID_DSF_IM3"], ["id_3id", "ID_DSF_3ID"], ["id_staffinc", "ID_STAFFINC"],
    ["nama", "NAMA_DSF"], ["mc", "MC"], ["branch", "Branch"], ["region", "Region"], ["circle", "Circle"],
    ["id_tl", "ID_STAFFINC_TL"], ["nama_tl", "NAMA_TL"], ["status", "Status"],
  ];
  const filterable = new Set(FCOLS.map(([k]) => k));

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Roster {mtype === "GSE_AE" ? "GSE & AE" : mtype}</div>
        <div style={{ fontSize: 13, color: t.mid, marginTop: 2 }}>Detail per seat — terisi & vacant. Filter tiap kolom (pilih semua / hapus) seperti Excel.</div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: t.lo }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / ID / MC / branch…" style={{ ...inp(t), paddingLeft: 30, width: 260 }} />
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: t.green, background: t.greenBg, border: `1px solid ${t.greenBd}`, padding: "5px 10px", borderRadius: 999 }}>Terisi {counts.terisi}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, padding: "5px 10px", borderRadius: 999 }}>Vacant {counts.vacant}</span>
          <button onClick={() => setShowResign((v) => !v)} style={{ padding: "6px 11px", borderRadius: 999, border: `1px solid ${showResign ? t.red : t.line}`, background: showResign ? t.redBg : t.card, color: showResign ? t.red : t.mid, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FF }}>
            {showResign ? "Sembunyikan resign" : `Tampilkan resign (${counts.resign})`}
          </button>
          {anyFilter && <button onClick={() => { setFilters({}); setOpenCol(""); }} style={{ ...btn(t), background: t.redBg, color: t.red, borderColor: t.redBd }}><FilterX size={14} /> Hapus filter</button>}
          {anyFilter && <span style={{ fontSize: 11.5, color: t.mid }}>{rows.length} dari {searched.length} baris</span>}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={load} style={{ ...btn(t), background: t.sub }}><RefreshCw size={14} /> Muat ulang</button>
          <button onClick={downloadRoster} style={{ ...btn(t), background: t.sub }}><Download size={14} /> Unduh Excel</button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...btn(t), background: t.sub }}>
            {uploading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />} Unggah Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onUploadRoster} style={{ display: "none" }} />
          <button onClick={() => setEditing("new")} style={{ ...btn(t), background: t.teal, color: "#fff", borderColor: t.teal }}><Plus size={14} /> Manpower</button>
        </div>
      </div>

      {err && <div style={{ ...card, padding: 12, borderColor: t.redBd, background: t.redBg, color: t.red, marginBottom: 14, fontSize: 13 }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {err}</div>}
      {info && <div style={{ ...card, padding: 12, borderColor: t.tealBd, background: t.tealBg, color: t.teal, marginBottom: 14, fontSize: 13 }}><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> {info}</div>}
      <MFTSProgress t={t} prog={prog} />

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: t.sub, color: t.mid, textAlign: "left" }}>
                <th style={{ padding: "9px 8px", fontWeight: 800, fontSize: 11, textTransform: "uppercase", textAlign: "center", width: 68, minWidth: 68 }}>No.</th>
                {COLS.map(([k, label]) => (
                  filterable.has(k)
                    ? <FilterTh key={k} t={t} label={label} colKey={k} filters={filters} onOpen={(ck, r) => { setRect(r); setOpenCol(ck); }} />
                    : <th key={k} style={{ padding: "9px 12px", fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</th>
                ))}
                <th style={{ padding: "9px 12px", fontWeight: 800, fontSize: 11 }} />
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={COLS.length + 2} style={{ padding: 26, textAlign: "center", color: t.mid }}><Loader2 size={15} style={{ animation: "spin 1s linear infinite", verticalAlign: -2 }} /> Memuat…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={COLS.length + 2} style={{ padding: 26, textAlign: "center", color: t.lo }}>Tidak ada baris yang cocok.</td></tr>}
              {!loading && rows.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${t.line}`, background: r.status === "Vacant" ? t.amberBg : r.status === "Resign" ? t.redBg : "transparent", opacity: r.status === "Resign" ? 0.7 : 1 }}>
                  <td style={{ padding: "8px 8px", color: t.lo, fontWeight: 600, textAlign: "center" }}>{i + 1}</td>
                  <td style={{ padding: "8px 12px" }}>{brandBadge(t, r.brand)}</td>
                  <td style={{ padding: "8px 12px", color: t.mid }}>{r.id_im3 || "—"}</td>
                  <td style={{ padding: "8px 12px", color: t.mid }}>{r.id_3id || "—"}</td>
                  <td style={{ padding: "8px 12px", color: t.mid }}>{r.id_staffinc || "—"}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: r.status === "Vacant" ? t.amber : t.hi }}>{r.nama || "—"}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: t.hi }}>{r.mc || "—"}</td>
                  <td style={{ padding: "8px 12px", color: t.mid }}>{r.branch || "—"}</td>
                  <td style={{ padding: "8px 12px", color: t.mid }}>{r.region || "—"}</td>
                  <td style={{ padding: "8px 12px", color: t.mid }}>{r.circle || "—"}</td>
                  <td style={{ padding: "8px 12px", color: t.mid }}>{r.id_tl || "—"}</td>
                  <td style={{ padding: "8px 12px", color: t.mid }}>{r.nama_tl || "—"}</td>
                  <td style={{ padding: "8px 12px" }}>{statusBadge(t, r.status)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    {r._mp && r.status !== "Resign" && (
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button onClick={() => setEditing(r._mp)} title="Edit" style={iconBtn(t)}><Pencil size={14} /></button>
                        <button onClick={() => setResigning(r._mp)} title="Resign → buat vacancy" style={{ ...iconBtn(t), color: t.red, borderColor: t.redBd }}><UserMinus size={14} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openCol && (
        <FilterMenu t={t} rect={rect} label={(FCOLS.find(([k]) => k === openCol) || [, openCol])[1]}
          options={optionsFor(searched, filters, FCOLS, openCol)} selected={filters[openCol] || []}
          onChange={(arr) => setFilters((p) => ({ ...p, [openCol]: arr }))} onClose={() => { setOpenCol(""); setRect(null); }} />
      )}

      {editing && (
        <ManpowerForm t={t} supabase={supabase} profile={profile} mtype={mtype} regions={regions}
          agencies={agencies} agencyOf={agencyOf} scopeRegion={scope} initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)} onDone={async () => { setEditing(null); await load(); }} />
      )}
      {resigning && (
        <ResignModal t={t} m={resigning} agencies={agencies} mtype={mtype} agencyOf={agencyOf}
          onClose={() => setResigning(null)}
          onConfirm={async (date) => { await doResign(resigning, date); setResigning(null); }} />
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ---------- bits ---------- */
const btn = (t) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FF });
const iconBtn = (t) => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.mid, cursor: "pointer" });
const inp = (t) => ({ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" });
const lbl = (t) => ({ fontSize: 11, fontWeight: 700, color: t.mid, marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: "0.04em" });

function Modal({ t, title, onClose, children, footer, maxW = 520 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: maxW, background: t.card, borderRadius: 16, border: `1px solid ${t.line}`, boxShadow: t.md, fontFamily: FF, maxHeight: "92vh", overflowY: "auto" }}>
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

function ManpowerForm({ t, supabase, profile, mtype, regions, agencies, agencyOf, scopeRegion = null, initial, onClose, onDone }) {
  const [f, setF] = useState(() => ({
    employee_id: initial?.employee_id || "", seat_id: initial?.seat_id || "", name: initial?.name || "",
    id_dsf_im3: initial?.id_dsf_im3 || "", id_dsf_3id: initial?.id_dsf_3id || "", id_staffinc: initial?.id_staffinc || "",
    id_staffinc_tl: initial?.id_staffinc_tl || "", nama_tl: initial?.nama_tl || "", brand: initial?.brand || "",
    email_corp: initial?.email_corp || "", email_personal: initial?.email_personal || "", phone: initial?.phone || "",
    region: initial?.region || scopeRegion || "", area: initial?.area || "", branch: initial?.branch || "", circle: initial?.circle || "",
    position: initial?.position || "", agency_id: initial?.agency_id || "", pic_agency: initial?.pic_agency || "",
    join_date: initial?.join_date || "", status: initial?.status || "active",
  }));
  const [agencyTouched, setAgencyTouched] = useState(Boolean(initial?.agency_id));
  const [saving, setSaving] = useState(false);
  const [e, setE] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const mappedAgency = f.region ? (agencyOf[`${mtype}|${String(f.region).toUpperCase()}`] || "") : "";
  const effAgency = agencyTouched ? f.agency_id : (mappedAgency || f.agency_id);

  function onRegion(v) { setF((p) => ({ ...p, region: v, agency_id: agencyTouched ? p.agency_id : (agencyOf[`${mtype}|${String(v).toUpperCase()}`] || "") })); }

  async function save() {
    if (!f.name.trim()) { setE("Nama wajib diisi"); return; }
    setSaving(true); setE("");
    try {
      const now = new Date().toISOString();
      const payload = {
        manpower_type: mtype,
        employee_id: f.employee_id.trim() || null, seat_id: f.seat_id.trim() || null, name: f.name.trim(),
        id_dsf_im3: f.id_dsf_im3.trim() || null, id_dsf_3id: f.id_dsf_3id.trim() || null, id_staffinc: f.id_staffinc.trim() || null,
        id_staffinc_tl: f.id_staffinc_tl.trim() || null, nama_tl: f.nama_tl.trim() || null, brand: f.brand.trim() || null,
        email_corp: f.email_corp.trim() || null, email_personal: f.email_personal.trim() || null, phone: f.phone.trim() || null,
        region: f.region || null, area: f.area || null, branch: f.branch || null, circle: f.circle.trim() || null,
        position: f.position.trim() || null, agency_id: effAgency || null, pic_agency: f.pic_agency.trim() || null,
        join_date: f.join_date || null, status: f.status, updated_at: now,
      };
      let error;
      if (initial?.id) ({ error } = await supabase.from("mf_manpower").update(payload).eq("id", initial.id));
      else ({ error } = await supabase.from("mf_manpower").insert(payload));
      if (error) throw new Error(error.message);
      await onDone();
    } catch (err) { setE(err.message || "Gagal menyimpan"); setSaving(false); }
  }

  return (
    <Modal t={t} title={initial ? "Edit Manpower" : `Tambah Manpower · ${mtype === "GSE_AE" ? "GSE & AE" : mtype}`} onClose={onClose}
      footer={<>
        <button onClick={onClose} style={btn(t)}>Batal</button>
        <button disabled={saving} onClick={save} style={{ ...btn(t), background: t.teal, color: "#fff", borderColor: t.teal }}>{saving ? "Menyimpan…" : "Simpan"}</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {e && <div style={{ color: t.red, fontSize: 12, fontWeight: 600 }}>{e}</div>}
        <div><label style={lbl(t)}>Nama DSF *</label><input value={f.name} onChange={(ev) => set("name", ev.target.value)} style={inp(t)} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div><label style={lbl(t)}>ID_DSF_IM3</label><input value={f.id_dsf_im3} onChange={(ev) => set("id_dsf_im3", ev.target.value)} style={inp(t)} /></div>
          <div><label style={lbl(t)}>ID_DSF_3ID</label><input value={f.id_dsf_3id} onChange={(ev) => set("id_dsf_3id", ev.target.value)} style={inp(t)} /></div>
          <div><label style={lbl(t)}>ID_STAFFINC</label><input value={f.id_staffinc} onChange={(ev) => set("id_staffinc", ev.target.value)} style={inp(t)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div><label style={lbl(t)}>Brand</label>
            <select value={f.brand} onChange={(ev) => set("brand", ev.target.value)} style={inp(t)}>
              <option value="">—</option><option value="IM3">IM3</option><option value="3ID">3ID</option><option value="HYBRID">Hybrid</option>
            </select>
          </div>
          <div><label style={lbl(t)}>ID_STAFFINC_TL</label><input value={f.id_staffinc_tl} onChange={(ev) => set("id_staffinc_tl", ev.target.value)} style={inp(t)} /></div>
          <div><label style={lbl(t)}>NAMA_TL</label><input value={f.nama_tl} onChange={(ev) => set("nama_tl", ev.target.value)} style={inp(t)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div><label style={lbl(t)}>Seat / Kode</label><input value={f.seat_id} onChange={(ev) => set("seat_id", ev.target.value)} placeholder="opsional" style={inp(t)} /></div>
          <div><label style={lbl(t)}>Employee ID</label><input value={f.employee_id} onChange={(ev) => set("employee_id", ev.target.value)} style={inp(t)} /></div>
          <div><label style={lbl(t)}>No. HP</label><input value={f.phone} onChange={(ev) => set("phone", ev.target.value)} style={inp(t)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><label style={lbl(t)}>Email Corporate</label><input value={f.email_corp} onChange={(ev) => set("email_corp", ev.target.value)} style={inp(t)} /></div>
          <div><label style={lbl(t)}>Email Personal</label><input value={f.email_personal} onChange={(ev) => set("email_personal", ev.target.value)} style={inp(t)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          <div><label style={lbl(t)}>Region</label>
            <select value={f.region} disabled={!!scopeRegion} onChange={(ev) => onRegion(ev.target.value)} style={{ ...inp(t), opacity: scopeRegion ? 0.7 : 1 }}>
              <option value="">— pilih —</option>
              {(scopeRegion ? [scopeRegion] : regions).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div><label style={lbl(t)}>Area</label><input value={f.area} onChange={(ev) => set("area", ev.target.value)} style={inp(t)} /></div>
          <div><label style={lbl(t)}>Branch</label><input value={f.branch} onChange={(ev) => set("branch", ev.target.value)} style={inp(t)} /></div>
          <div><label style={lbl(t)}>Circle</label><input value={f.circle} onChange={(ev) => set("circle", ev.target.value)} style={inp(t)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><label style={lbl(t)}>Agency</label>
            <select value={effAgency} onChange={(ev) => { setAgencyTouched(true); set("agency_id", ev.target.value); }} style={inp(t)}>
              <option value="">— pilih —</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {!agencyTouched && mappedAgency && <div style={{ fontSize: 10.5, color: t.teal, marginTop: 4 }}>Otomatis dari mapping role × region</div>}
          </div>
          <div><label style={lbl(t)}>PIC Agency</label><input value={f.pic_agency} onChange={(ev) => set("pic_agency", ev.target.value)} style={inp(t)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><label style={lbl(t)}>Join Date</label><input type="date" value={f.join_date || ""} onChange={(ev) => set("join_date", ev.target.value)} style={inp(t)} /></div>
          <div><label style={lbl(t)}>Status</label>
            <select value={f.status} onChange={(ev) => set("status", ev.target.value)} style={inp(t)}>
              <option value="active">Aktif</option><option value="resign">Resign</option>
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ResignModal({ t, m, agencies, mtype, agencyOf, onClose, onConfirm }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [e, setE] = useState("");
  const mappedId = agencyOf[`${mtype}|${String(m.region).toUpperCase()}`] || m.agency_id || null;
  const agencyName = agencies.find((a) => a.id === mappedId)?.name || m.agency?.name || "—";

  return (
    <Modal t={t} title="Resign manpower" onClose={onClose} maxW={460}
      footer={<>
        <button onClick={onClose} style={btn(t)}>Batal</button>
        <button disabled={saving} onClick={async () => { setSaving(true); setE(""); try { await onConfirm(date); } catch (err) { setE(err.message || "Gagal"); setSaving(false); } }}
          style={{ ...btn(t), background: t.red, color: "#fff", borderColor: t.red }}>{saving ? "Memproses…" : "Resign & buat vacancy"}</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {e && <div style={{ color: t.red, fontSize: 12, fontWeight: 600 }}>{e}</div>}
        <div style={{ fontSize: 13, color: t.mid }}>
          <b style={{ color: t.hi }}>{m.name || m.employee_id}</b> akan ditandai <b style={{ color: t.red }}>Resign</b>, dan sistem otomatis membuat <b style={{ color: t.hi }}>vacancy replacement</b>.
        </div>
        <div><label style={lbl(t)}>Tanggal resign</label><input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} style={inp(t)} /></div>
        <div style={{ background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: 12, fontSize: 12.5, color: t.mid }}>
          <div style={{ fontWeight: 800, color: t.hi, marginBottom: 6, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Vacancy yang akan dibuat</div>
          <div>Lokasi: {[m.region, m.area, m.branch].filter(Boolean).join(" · ") || "—"}</div>
          <div>Agency (dari mapping): <b style={{ color: t.teal }}>{agencyName}</b></div>
        </div>
      </div>
    </Modal>
  );
}
