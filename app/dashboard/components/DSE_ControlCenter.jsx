"use client";
/**
 * DSE_ControlCenter.jsx — "Control Center" (sub-menu Prod & AR, khusus role spm_sumatera)
 *
 * Permintaan user (awal): "untuk pengisian DSE prod, atau penjualan DSE, di
 * level MC, jadi kita bisa pilih bulan nanti kita akan tracking hari demi
 * hari dalam bulan tersebut mc mana saja yang sudah mulai pengisian
 * penjualan, dan juga ada satu kolom untuk informasi dse, akan checklist
 * jika sudah dilengkapi semuanya, kuning jika belum sepenuhnya namun sudah
 * mulai isi, buat ui nya mirip dengan PNL control center bisa di hover
 * juga untuk menampilkan detail."
 *
 * UPDATE (permintaan user - "perbaiki ui nya secara total, seharusnya bisa
 * pilih region / di filter per partner juga"): versi awal nampilin SEMUA
 * ~175 District (MC) sbg 1 tabel flat panjang - ga kepakai (harus scroll
 * sangat jauh). Sekarang:
 *  - Filter bar (Partner/Agency, Region, Branch - cascading, Branch
 *    kefilter sesuai Region yg dipilih) + search tetap ada.
 *  - Baris dikelompokkan PER REGION (section header sendiri, bisa
 *    expand/collapse per region + tombol Expand All/Collapse All) biar ga
 *    nampilin ratusan baris sekaligus - defaultnya collapsed semua supaya
 *    user pilih dulu baru buka region yg relevan (atau tinggal filter).
 *  - "MDI" TIDAK dipakai sbg label - field roster `mdi` ditampilkan sbg
 *    "Partner"/"Agency" sesuai istilah IOH (bukan kata "MDI" yg ada di DB).
 *  - Polish visual: hero tile lebih ringkas, filter bar bergaya chip/
 *    dropdown konsisten t.teal, section header sticky, row lebih lega.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import supabase from "../../../lib/supabase";
import {
  Loader2, Layers, CheckCircle2, AlertTriangle, Circle, ChevronDown, ChevronRight,
  Search, CalendarDays, X, Building2, MapPin, ChevronsDown, ChevronsUp, Filter,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const START_YEAR = 2026;

function fmtID(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("id-ID");
}
function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}
function pad2(n) { return String(n).padStart(2, "0"); }

function getAvailableMonths() {
  const now = new Date();
  const out = [];
  for (let y = START_YEAR; y <= now.getFullYear() + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === now.getFullYear() + 1 && m > now.getMonth() + 2) continue;
      if (y === START_YEAR && m < 1) continue;
      out.push({ year: y, month: m, key: `${y}-${pad2(m)}` });
    }
  }
  return out;
}

function Select({ t, value, onChange, options, placeholder, icon: Icon }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {Icon && <Icon size={13} color={t.mid} style={{ position: "absolute", left: 10, pointerEvents: "none" }} />}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
          background: value ? t.tealBg : t.card, border: `1px solid ${value ? t.tealBd : t.line}`, borderRadius: 9,
          color: value ? t.teal : t.hi, fontFamily: "inherit", fontSize: 12.5, fontWeight: value ? 700 : 500,
          padding: Icon ? "8px 26px 8px 30px" : "8px 26px 8px 11px", cursor: "pointer", minWidth: 150, maxWidth: 220,
          outline: "none",
        }}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={12} color={t.mid} style={{ position: "absolute", right: 9, pointerEvents: "none" }} />
    </div>
  );
}

export default function DSE_ControlCenter({ theme, profile }) {
  const d = theme === "dark";
  const t = {
    bg: d ? "#0F0F11" : "#F2F2F7", card: d ? "#1A1A1D" : "#FFFFFF", sub: d ? "#202024" : "#F5F5F7",
    line: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)", hi: d ? "#F2F2F3" : "#1A1A1D",
    mid: d ? "#8A8A96" : "#5A5A68", lo: d ? "#5A5A68" : "#8A8A96",
    inputBg: d ? "#1E1E22" : "#F8F8FA", inputBd: d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)",
    teal: d ? "#32BCAD" : "#1A9E90", tealBg: d ? "rgba(50,188,173,0.10)" : "rgba(26,158,144,0.07)", tealBd: d ? "rgba(50,188,173,0.28)" : "rgba(26,158,144,0.20)",
    red: d ? "#F87171" : "#DC2626", redBg: d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)",
    amber: d ? "#FBBF24" : "#B45309", amberBg: d ? "rgba(251,191,36,0.10)" : "rgba(180,83,9,0.08)",
    blue: d ? "#60A5FA" : "#2563EB", blueBg: d ? "rgba(96,165,250,0.10)" : "rgba(37,99,235,0.07)",
    shadowSm: d ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.07)",
  };

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const monthBtnRef = useRef(null);
  const monthMenuRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState([]);
  const [prodRows, setProdRows] = useState([]);
  const [infoRows, setInfoRows] = useState([]);
  const [search, setSearch] = useState("");
  const [hover, setHover] = useState(null);

  // UPDATE (permintaan user - "seharusnya bisa pilih region / di filter
  // per partner juga"): filter cascading Partner -> Region -> Branch.
  // Istilah "Partner"/"Agency" dipakai di UI, BUKAN "MDI" (field DB `mdi`
  // tetap dipakai internal, cuma labelnya diganti sesuai preferensi user).
  const [partnerFilter, setPartnerFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [collapsedRegions, setCollapsedRegions] = useState(() => new Set());
  const [allCollapsed, setAllCollapsed] = useState(true);
  // UPDATE (permintaan user - "gampang jika kita ingin mengelompokkan mc
  // ini per partner, region, branch"): grouping sekarang BISA DIPILIH
  // (dulu hardcoded per Region saja) - toggle Partner/Region/Branch/Semua.
  const [groupBy, setGroupBy] = useState("region"); // "partner" | "region" | "branch" | "none"

  const periodKey = `${year}-${pad2(month)}`;
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const totalDays = daysInMonth(year, month);
  const monthStart = `${periodKey}-01`;
  const monthEnd = `${periodKey}-${pad2(totalDays)}`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const daysElapsed = isCurrentMonth ? now.getDate() : (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) ? totalDays : 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [rosterRes, prodRes, infoRes] = await Promise.all([
        supabase.from("mf_dse_database").select("dse_code, mc, branch, region, mdi, dse_status").or("is_revoked.is.null,is_revoked.eq.false"),
        supabase.from("mf_dse_prod_ar").select("mc, tanggal, nilai_sp, nilai_fwa, nilai_voucher, nilai_saldo, qty_sp, qty_voucher, qty_saldo").gte("tanggal", monthStart).lte("tanggal", monthEnd),
        supabase.from("mf_dse_info_periods").select("dse_code, mc").eq("period", periodKey),
      ]);
      if (cancelled) return;
      setRoster(Array.isArray(rosterRes.data) ? rosterRes.data : []);
      setProdRows(Array.isArray(prodRes.data) ? prodRes.data : []);
      setInfoRows(Array.isArray(infoRes.data) ? infoRes.data : []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [periodKey, monthStart, monthEnd]);

  const mcRows = useMemo(() => {
    const map = new Map();
    for (const r of roster) {
      if (!r.mc) continue;
      if (!map.has(r.mc)) map.set(r.mc, { mc: r.mc, branch: r.branch || "", region: r.region || "", partner: r.mdi || "", dseCodes: [], activeCount: 0, vacantCount: 0 });
      const row = map.get(r.mc);
      row.dseCodes.push(r.dse_code);
      if (String(r.dse_status || "").toLowerCase() === "vacant") row.vacantCount += 1;
      else row.activeCount += 1;
    }
    const prodByMc = new Map();
    for (const p of prodRows) {
      if (!p.mc) continue;
      if (!prodByMc.has(p.mc)) prodByMc.set(p.mc, new Map());
      const dayMap = prodByMc.get(p.mc);
      const day = Number(String(p.tanggal).slice(8, 10));
      if (!dayMap.has(day)) dayMap.set(day, { count: 0, sp: 0, fwa: 0, voucher: 0, saldo: 0 });
      const agg = dayMap.get(day);
      agg.count += 1;
      agg.sp += Number(p.nilai_sp) || 0;
      agg.fwa += Number(p.nilai_fwa) || 0;
      agg.voucher += Number(p.nilai_voucher) || 0;
      agg.saldo += Number(p.nilai_saldo) || 0;
    }
    const infoByMc = new Map();
    for (const i of infoRows) {
      if (!i.mc) continue;
      if (!infoByMc.has(i.mc)) infoByMc.set(i.mc, new Set());
      infoByMc.get(i.mc).add(i.dse_code);
    }

    const out = [];
    for (const row of map.values()) {
      const dayMap = prodByMc.get(row.mc) || new Map();
      const filledDays = dayMap.size;
      const infoSet = infoByMc.get(row.mc) || new Set();
      const totalDse = row.dseCodes.length;
      const infoFilled = row.dseCodes.filter((c) => infoSet.has(c)).length;
      let infoStatus = "empty";
      if (totalDse > 0 && infoFilled >= totalDse) infoStatus = "full";
      else if (infoFilled > 0) infoStatus = "partial";
      let salesStatus = "empty";
      if (filledDays >= daysElapsed && daysElapsed > 0) salesStatus = "full";
      else if (filledDays > 0) salesStatus = "partial";
      const totalPenjualan = [...dayMap.values()].reduce((s, a) => s + a.sp + a.fwa + a.voucher + a.saldo, 0);
      out.push({ ...row, dayMap, filledDays, infoFilled, totalDse, infoStatus, salesStatus, totalPenjualan });
    }
    out.sort((a, b) => a.mc.localeCompare(b.mc));
    return out;
  }, [roster, prodRows, infoRows, daysElapsed]);

  // Opsi filter - cascading: Region cuma nampilin yg cocok dgn Partner
  // terpilih, Branch cuma yg cocok dgn Partner+Region terpilih.
  const partnerOptions = useMemo(() => [...new Set(mcRows.map((r) => r.partner).filter(Boolean))].sort(), [mcRows]);
  const regionOptions = useMemo(() => {
    const base = partnerFilter ? mcRows.filter((r) => r.partner === partnerFilter) : mcRows;
    return [...new Set(base.map((r) => r.region).filter(Boolean))].sort();
  }, [mcRows, partnerFilter]);
  const branchOptions = useMemo(() => {
    let base = mcRows;
    if (partnerFilter) base = base.filter((r) => r.partner === partnerFilter);
    if (regionFilter) base = base.filter((r) => r.region === regionFilter);
    return [...new Set(base.map((r) => r.branch).filter(Boolean))].sort();
  }, [mcRows, partnerFilter, regionFilter]);

  // Reset filter turunan kalau filter induknya berubah & opsi lama jadi
  // tidak valid lagi (mis. ganti Partner, Region yg kepilih sebelumnya
  // bukan bagian dari Partner baru).
  useEffect(() => { if (regionFilter && !regionOptions.includes(regionFilter)) setRegionFilter(""); }, [regionOptions]); // eslint-disable-line
  useEffect(() => { if (branchFilter && !branchOptions.includes(branchFilter)) setBranchFilter(""); }, [branchOptions]); // eslint-disable-line

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mcRows.filter((r) => {
      if (partnerFilter && r.partner !== partnerFilter) return false;
      if (regionFilter && r.region !== regionFilter) return false;
      if (branchFilter && r.branch !== branchFilter) return false;
      if (q && !(r.mc.toLowerCase().includes(q) || r.branch.toLowerCase().includes(q) || r.region.toLowerCase().includes(q) || r.partner.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [mcRows, search, partnerFilter, regionFilter, branchFilter]);

  const totals = useMemo(() => {
    const totalMc = filteredRows.length;
    const salesFull = filteredRows.filter((r) => r.salesStatus === "full").length;
    const salesPartial = filteredRows.filter((r) => r.salesStatus === "partial").length;
    const infoFull = filteredRows.filter((r) => r.infoStatus === "full").length;
    const infoPartial = filteredRows.filter((r) => r.infoStatus === "partial").length;
    return { totalMc, salesFull, salesPartial, infoFull, infoPartial };
  }, [filteredRows]);

  // Kelompokkan hasil filter sesuai `groupBy` terpilih (Partner/Region/
  // Branch/Tanpa pengelompokan), biar ga nampilin ratusan baris District
  // sekaligus - tiap grup bisa expand/collapse. UPDATE (permintaan user -
  // "gampang jika kita ingin mengelompokkan mc ini per partner, region,
  // branch"): dulu hardcoded per Region, sekarang dipilih via groupBy.
  const GROUP_FIELD = { partner: "partner", region: "region", branch: "branch" };
  const GROUP_LABEL = { partner: "Partner", region: "Region", branch: "Branch" };
  // UPDATE (permintaan user - "urutkan dari pengisian terlengkap"): baris
  // District DALAM tiap grup sekarang diurutkan dari pengisian TERLENGKAP
  // dulu (Penjualan full > partial > kosong, lalu jumlah hari terisi,
  // lalu status Informasi DSE) - BUKAN lagi alfabetis. Nama grup (Partner/
  // Region/Branch) sendiri tetap alfabetis biar gampang dicari.
  const STATUS_RANK = { full: 2, partial: 1, empty: 0 };
  const sortByCompletion = (rows) => [...rows].sort((a, b) =>
    (STATUS_RANK[b.salesStatus] - STATUS_RANK[a.salesStatus]) ||
    (b.filledDays - a.filledDays) ||
    (STATUS_RANK[b.infoStatus] - STATUS_RANK[a.infoStatus]) ||
    (b.infoFilled - a.infoFilled) ||
    a.mc.localeCompare(b.mc)
  );
  const regionGroups = useMemo(() => {
    if (groupBy === "none") return [["__ALL__", sortByCompletion(filteredRows)]];
    const field = GROUP_FIELD[groupBy] || "region";
    const map = new Map();
    for (const r of filteredRows) {
      const key = r[field] || `(Tanpa ${GROUP_LABEL[groupBy]})`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, rows]) => [key, sortByCompletion(rows)]);
  }, [filteredRows, groupBy]);

  const activeFilterCount = [partnerFilter, regionFilter, branchFilter].filter(Boolean).length;

  const toggleRegion = (key) => {
    setCollapsedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const expandAll = () => { setCollapsedRegions(new Set()); setAllCollapsed(false); };
  const collapseAll = () => { setCollapsedRegions(new Set(regionGroups.map(([key]) => key))); setAllCollapsed(true); };

  // Default: semua region collapsed dulu (daftar region jadi ringkas),
  // kecuali hasil filter sudah menyempit ke <= 2 region (langsung dibuka
  // semua biar ga perlu klik lagi).
  useEffect(() => {
    if (regionGroups.length <= 2) {
      setCollapsedRegions(new Set());
    } else if (allCollapsed) {
      setCollapsedRegions(new Set(regionGroups.map(([key]) => key)));
    }
  }, [regionGroups.length === 0 ? "" : regionGroups.map(([k]) => k).join("|")]); // eslint-disable-line

  const months = useMemo(() => getAvailableMonths(), []);
  const monthsByYear = useMemo(() => {
    const map = new Map();
    for (const m of months) {
      if (!map.has(m.year)) map.set(m.year, []);
      map.get(m.year).push(m);
    }
    return map;
  }, [months]);

  useEffect(() => {
    if (!monthPickerOpen) return;
    const onClick = (ev) => {
      if (monthBtnRef.current?.contains(ev.target)) return;
      if (monthMenuRef.current?.contains(ev.target)) return;
      setMonthPickerOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [monthPickerOpen]);

  // UPDATE (permintaan user - "buat border yang rapi... pnl control
  // center itu sangat bagus"): badge harian sekarang SELALU punya border
  // tegas (dulu sel kosong nyaris invisible - border super tipis & warna
  // nyaris sama dgn background, keliatan berantakan). Pola badge persis
  // StatusCell PNL: kosong = outline tipis transparan, terisi = solid
  // teal dgn border lebih gelap, kontras jelas di kedua tema.
  const dayDotStyle = (agg) => {
    if (!agg) return { background: d ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)", border: `1.5px solid ${t.line}` };
    return { background: t.teal, border: `1.5px solid ${d ? "#1F8276" : "#147268"}` };
  };

  const StatusBadge = ({ status }) => {
    const cfg = status === "full"
      ? { color: t.teal, bg: t.tealBg, bd: t.tealBd, icon: CheckCircle2 }
      : status === "partial"
      ? { color: t.amber, bg: t.amberBg, bd: "rgba(251,191,36,0.3)", icon: AlertTriangle }
      : { color: t.lo, bg: t.sub, bd: t.line, icon: Circle };
    const Icon = cfg.icon;
    return (
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 999, background: cfg.bg, border: `1px solid ${cfg.bd}` }}>
        <Icon size={14} color={cfg.color} strokeWidth={2.4} />
      </div>
    );
  };

  const clearFilters = () => { setPartnerFilter(""); setRegionFilter(""); setBranchFilter(""); setSearch(""); };

  return (
    <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 16, padding: "0 2px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: t.tealBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Layers size={18} color={t.teal} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.hi, letterSpacing: -0.2 }}>Control Center — DSE Prod. & AR</div>
            <div style={{ fontSize: 12, color: t.mid, marginTop: 1 }}>Pantau pengisian penjualan harian & Informasi DSE per District (MC)</div>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <button ref={monthBtnRef} onClick={() => setMonthPickerOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 10, background: t.card, border: `1px solid ${t.line}`, color: t.hi, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: t.shadowSm }}>
            <CalendarDays size={14} color={t.teal} />
            {monthLabel}
            <ChevronRight size={12} style={{ transform: monthPickerOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", color: t.mid }} />
          </button>
          {monthPickerOpen && (
            <div ref={monthMenuRef} style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300, width: 260, maxHeight: 320, overflowY: "auto", background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.22)", padding: 8 }}>
              {[...monthsByYear.keys()].sort((a, b) => b - a).map((y) => (
                <div key={y} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: t.mid, padding: "4px 8px" }}>{y}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                    {monthsByYear.get(y).map((m) => (
                      <button key={m.key} onClick={() => { setYear(m.year); setMonth(m.month); setMonthPickerOpen(false); }}
                        style={{ padding: "7px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, background: (m.year === year && m.month === month) ? t.teal : t.sub, color: (m.year === year && m.month === month) ? "#fff" : t.mid }}>
                        {MONTH_NAMES[m.month - 1].slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* UPDATE (permintaan user - "buat sangat bagus ui nya... ada
          summary card yang sangat bagus jika kita ss"): hero stat tiles
          kecil2 DIGANTI 1 kartu ringkasan besar, gradient teal, dgn 2
          progress ring (Penjualan & Informasi DSE) + breakdown chip -
          didesain supaya enak di-screenshot (big numbers, kontras jelas,
          proporsional di light & dark mode). */}
      <SummaryHeroCard t={t} d={d} monthLabel={monthLabel} totals={totals} />

      {/* Filter bar */}
      <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 12, boxShadow: t.shadowSm, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: t.mid, fontSize: 11.5, fontWeight: 700, marginRight: 2 }}>
            <Layers size={12} /> Kelompokkan:
          </div>
          <div style={{ display: "flex", background: t.sub, border: `1px solid ${t.line}`, borderRadius: 9, padding: 3, gap: 2 }}>
            {[{ k: "partner", label: "Partner" }, { k: "region", label: "Region" }, { k: "branch", label: "Branch" }, { k: "none", label: "Tanpa" }].map((opt) => (
              <button key={opt.k} onClick={() => setGroupBy(opt.k)}
                style={{ border: "none", borderRadius: 7, padding: "6px 11px", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, cursor: "pointer", background: groupBy === opt.k ? t.teal : "transparent", color: groupBy === opt.k ? "#fff" : t.mid, transition: "background 0.12s" }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: t.mid, fontSize: 11.5, fontWeight: 700, marginRight: 2 }}>
            <Filter size={12} /> Filter:
          </div>
          <Select t={t} value={partnerFilter} onChange={setPartnerFilter} options={partnerOptions} placeholder="Semua Partner" icon={Building2} />
          <Select t={t} value={regionFilter} onChange={setRegionFilter} options={regionOptions} placeholder="Semua Region" icon={MapPin} />
          <Select t={t} value={branchFilter} onChange={setBranchFilter} options={branchOptions} placeholder="Semua Branch" icon={MapPin} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.inputBg, border: `1px solid ${t.inputBd}`, borderRadius: 9, padding: "7px 11px", flex: "1 1 200px", minWidth: 160, maxWidth: 280 }}>
            <Search size={13} color={t.mid} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari District / Branch / Region..."
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: t.hi, fontFamily: "inherit", fontSize: 12.5 }} />
            {search && <button onClick={() => setSearch("")} style={{ border: "none", background: "transparent", cursor: "pointer", color: t.mid, display: "flex" }}><X size={12} /></button>}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: t.redBg, color: t.red, borderRadius: 9, padding: "7px 11px", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              <X size={12} /> Reset ({activeFilterCount})
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={expandAll} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${t.line}`, background: t.sub, color: t.mid, borderRadius: 9, padding: "7px 11px", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
            <ChevronsDown size={12} /> Buka Semua
          </button>
          <button onClick={collapseAll} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${t.line}`, background: t.sub, color: t.mid, borderRadius: 9, padding: "7px 11px", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
            <ChevronsUp size={12} /> Tutup Semua
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 11, color: t.mid, borderTop: `1px solid ${t.line}`, paddingTop: 10 }}>
          <span style={{ fontWeight: 700, color: t.hi }}>Keterangan:</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: t.teal, display: "inline-block" }} /> Ada penjualan tercatat</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: t.sub, border: `1px solid ${t.line}`, display: "inline-block" }} /> Belum ada data</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={12} color={t.teal} /> Informasi DSE lengkap</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={12} color={t.amber} /> Sebagian terisi</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Circle size={12} color={t.lo} /> Belum diisi</span>
        </div>
      </div>

      {/* Grid grouped per Region */}
      <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 16, overflow: "hidden", boxShadow: t.shadowSm }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 48, color: t.mid, fontSize: 13 }}>
            <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} /> Memuat data...
          </div>
        ) : regionGroups.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: t.mid, fontSize: 13 }}>Tidak ada District yang cocok dengan filter ini.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 + totalDays * 26 }}>
              <thead>
                <tr style={{ background: t.sub }}>
                  <th style={{ position: "sticky", left: 0, zIndex: 3, background: t.sub, textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 800, color: t.mid, borderBottom: `1px solid ${t.line}`, borderRight: `1px solid ${t.line}`, minWidth: 220 }}>District (MC)</th>
                  {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => (
                    <th key={day} style={{ textAlign: "center", padding: "10px 2px", fontSize: 10, fontWeight: 700, color: day > daysElapsed && isCurrentMonth ? t.lo : t.mid, borderBottom: `1px solid ${t.line}`, borderRight: `1px solid ${t.line}`, width: 26, opacity: day > daysElapsed && isCurrentMonth ? 0.5 : 1 }}>{day}</th>
                  ))}
                  <th style={{ position: "sticky", right: 0, zIndex: 3, background: t.sub, textAlign: "center", padding: "10px 14px", fontSize: 11, fontWeight: 800, color: t.mid, borderBottom: `1px solid ${t.line}`, borderLeft: `1px solid ${t.line}`, minWidth: 130 }}>Informasi DSE</th>
                </tr>
              </thead>
              <tbody>
                {regionGroups.map(([regionKey, rows]) => {
                  const collapsed = collapsedRegions.has(regionKey);
                  const regionInfoFull = rows.filter((r) => r.infoStatus === "full").length;
                  const regionSalesFull = rows.filter((r) => r.salesStatus === "full").length;
                  return (
                    <RegionGroupRows key={regionKey} t={t} regionKey={regionKey} rows={rows} collapsed={collapsed}
                      onToggle={() => toggleRegion(regionKey)} totalDays={totalDays} daysElapsed={daysElapsed} isCurrentMonth={isCurrentMonth}
                      regionInfoFull={regionInfoFull} regionSalesFull={regionSalesFull}
                      dayDotStyle={dayDotStyle} StatusBadge={StatusBadge} setHover={setHover} />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {hover && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", zIndex: 500, top: Math.max(8, hover.rect.top - 10), left: Math.min(window.innerWidth - 280, Math.max(8, hover.rect.left - 110)), transform: "translateY(-100%)", pointerEvents: "none" }}>
          <div style={{ background: t.hi, color: d ? "#1A1A1D" : "#fff", borderRadius: 12, padding: "12px 14px", fontSize: 11.5, boxShadow: "0 12px 32px rgba(0,0,0,0.35)", minWidth: 210, maxWidth: 260 }}>
            {hover.kind === "day" ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 12.5 }}>{hover.mc}</div>
                  <div style={{ fontSize: 10.5, opacity: 0.65, fontWeight: 600, whiteSpace: "nowrap" }}>{hover.day} {MONTH_NAMES[month - 1]}</div>
                </div>
                {hover.agg ? (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {[
                        { label: "SP", value: hover.agg.sp },
                        { label: "FWA", value: hover.agg.fwa },
                        { label: "Voucher", value: hover.agg.voucher },
                        { label: "Saldo", value: hover.agg.saldo },
                      ].map((row) => (
                        <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, opacity: 0.88 }}>
                          <span>{row.label}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>Rp {fmtID(row.value)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.18)", margin: "8px 0" }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontWeight: 800, fontSize: 12 }}>Total Penjualan</span>
                      <span style={{ fontWeight: 800, fontSize: 12.5, color: "#5EEAD4", fontVariantNumeric: "tabular-nums" }}>Rp {fmtID(hover.agg.sp + hover.agg.fwa + hover.agg.voucher + hover.agg.saldo)}</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10, opacity: 0.6 }}>{hover.agg.count} DSE input hari ini</div>
                  </>
                ) : (
                  <div style={{ opacity: 0.8 }}>Belum ada entri penjualan.</div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{hover.mc} — Informasi DSE</div>
                <div style={{ opacity: 0.9 }}>{hover.row.infoFilled} / {hover.row.totalDse} DSE sudah diisi</div>
                <div style={{ opacity: 0.9, marginTop: 2 }}>Periode: {monthLabel}</div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ProgressRing({ t, pct, color, bg, size = 86, stroke = 9, label, value }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bg} strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{Math.round(pct)}%</div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.92)", textAlign: "center" }}>{label}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>{value}</div>
    </div>
  );
}

function SummaryHeroCard({ t, d, monthLabel, totals }) {
  const salesPct = totals.totalMc > 0 ? (totals.salesFull / totals.totalMc) * 100 : 0;
  const infoPct = totals.totalMc > 0 ? (totals.infoFull / totals.totalMc) * 100 : 0;
  const salesEmpty = Math.max(0, totals.totalMc - totals.salesFull - totals.salesPartial);
  const infoEmpty = Math.max(0, totals.totalMc - totals.infoFull - totals.infoPartial);
  const gradient = d
    ? "linear-gradient(135deg, #0F3D38 0%, #113A36 45%, #0B2B28 100%)"
    : "linear-gradient(135deg, #1A9E90 0%, #15837A 55%, #0E6961 100%)";
  return (
    <div style={{ position: "relative", borderRadius: 20, padding: "22px 24px", background: gradient, overflow: "hidden", boxShadow: "0 18px 44px rgba(16,110,100,0.28)" }}>
      <div style={{ position: "absolute", top: -60, right: -40, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
      <div style={{ position: "absolute", bottom: -70, left: -30, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 220, flex: "1 1 240px" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.4, textTransform: "uppercase" }}>Ringkasan — {monthLabel}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 3, letterSpacing: -0.4 }}>{fmtID(totals.totalMc)} District</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Penjualan Lengkap", value: totals.salesFull, tone: "#fff" },
              { label: "Penjualan Sebagian", value: totals.salesPartial, tone: "rgba(255,255,255,0.85)" },
              { label: "Penjualan Kosong", value: salesEmpty, tone: "rgba(255,255,255,0.65)" },
            ].map((row) => (
              <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: row.tone, flexShrink: 0 }} />
                <span style={{ color: "rgba(255,255,255,0.85)", flex: 1 }}>{row.label}</span>
                <span style={{ fontWeight: 800, color: "#fff" }}>{fmtID(row.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <ProgressRing t={t} pct={salesPct} color="#fff" bg="rgba(255,255,255,0.22)" label="Penjualan Harian" value={`${fmtID(totals.salesFull)} / ${fmtID(totals.totalMc)} District`} />
          <ProgressRing t={t} pct={infoPct} color="#FDE68A" bg="rgba(255,255,255,0.22)" label="Informasi DSE" value={`${fmtID(totals.infoFull)} / ${fmtID(totals.totalMc)} District`} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}>
          {[
            { label: "Info DSE Lengkap", value: totals.infoFull, tone: "#FDE68A" },
            { label: "Info DSE Sebagian", value: totals.infoPartial, tone: "rgba(255,255,255,0.85)" },
            { label: "Info DSE Kosong", value: infoEmpty, tone: "rgba(255,255,255,0.6)" },
          ].map((row) => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: row.tone, flexShrink: 0 }} />
              <span style={{ color: "rgba(255,255,255,0.85)", flex: 1 }}>{row.label}</span>
              <span style={{ fontWeight: 800, color: "#fff" }}>{fmtID(row.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RegionGroupRows({ t, regionKey, rows, collapsed, onToggle, totalDays, daysElapsed, isCurrentMonth, regionInfoFull, regionSalesFull, dayDotStyle, StatusBadge, setHover }) {
  const isFlat = regionKey === "__ALL__";
  return (
    <>
      {!isFlat && (
        <tr onClick={onToggle} style={{ cursor: "pointer", background: t.tealBg }}>
          <td colSpan={totalDays + 2} style={{ padding: "9px 14px", borderBottom: `1px solid ${t.tealBd}`, borderTop: `1px solid ${t.tealBd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {collapsed ? <ChevronRight size={13} color={t.teal} /> : <ChevronDown size={13} color={t.teal} />}
              <MapPin size={13} color={t.teal} />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: t.hi }}>{regionKey}</span>
              <span style={{ fontSize: 11, color: t.mid, fontWeight: 600 }}>({rows.length} District)</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: t.mid }}>Penjualan lengkap: <b style={{ color: t.teal }}>{regionSalesFull}/{rows.length}</b></span>
              <span style={{ fontSize: 10.5, color: t.mid }}>Info DSE lengkap: <b style={{ color: t.teal }}>{regionInfoFull}/{rows.length}</b></span>
            </div>
          </td>
        </tr>
      )}
      {(isFlat || !collapsed) && rows.map((row, idx) => {
        const rowBg = idx % 2 === 1 ? t.sub : t.card;
        return (
        <tr key={row.mc} style={{ background: rowBg }}>
          <td style={{ position: "sticky", left: 0, zIndex: 1, background: rowBg, padding: "9px 14px 9px 30px", borderBottom: `1px solid ${t.line}`, borderRight: `1px solid ${t.line}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>{row.mc}</div>
            <div style={{ fontSize: 10.5, color: t.mid, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{row.branch}{row.partner ? ` · ${row.partner}` : ""}</div>
          </td>
          {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
            const agg = row.dayMap.get(day);
            const future = isCurrentMonth && day > daysElapsed;
            return (
              <td key={day} style={{ textAlign: "center", padding: "7px 2px", borderBottom: `1px solid ${t.line}`, borderRight: `1px solid ${t.line}`, opacity: future ? 0.4 : 1 }}
                onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover({ kind: "day", mc: row.mc, day, agg, rect: r }); }}
                onMouseLeave={() => setHover(null)}>
                <span style={{ width: 18, height: 18, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "default", boxSizing: "border-box", ...dayDotStyle(agg) }} />
              </td>
            );
          })}
          <td style={{ position: "sticky", right: 0, zIndex: 1, background: rowBg, textAlign: "center", padding: "9px 14px", borderBottom: `1px solid ${t.line}`, borderLeft: `1px solid ${t.line}` }}
            onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover({ kind: "info", mc: row.mc, row, rect: r }); }}
            onMouseLeave={() => setHover(null)}>
            <StatusBadge status={row.infoStatus} />
          </td>
        </tr>
        );
      })}
    </>
  );
}
