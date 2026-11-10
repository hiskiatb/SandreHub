"use client";
/**
 * UserManagementSummaryModal.jsx — "Lihat Summary User Management"
 *
 * PERMINTAAN USER (awal): "buat summarynya untuk role admin MC, admin AREA,
 * berapa yang sudah ada minimal 1 alamat email, berapa yang sudah mulai
 * mengisi dari yang terdaftar, buat summary lengkapnya, dan ini langsung
 * sebutkan mc atau areanya, dibagi per region, buat dengan sangat rapi,
 * semua ini Lihat Summary User Management, baru muncul dashboard popupnya,
 * dan juga ini bisa full konteks ataupun daily untuk login hari ini dan
 * pengisian hari ini."
 *
 * UPDATE (permintaan user - "pisahkan informasi DSE sudah lengkap atau
 * belum, dan juga saya ingin tandai mana yang sudah mengisi penjualan
 * oktober november, jadi jangan hanya filter hari ini dan sepanjang waktu
 * bisa pilih full month / daily dan bisa pilih tanggal juga kalo daily"):
 *  1. Scope "Sepanjang Waktu"/"Hari Ini" DIGANTI TOTAL jadi period picker
 *     ala toolbar DSE_ProdAR: tab "Daily"/"Full Month" + nav "<" / label
 *     (klik utk buka date/month picker) / ">" - bisa cek status
 *     pengisian di TANGGAL atau BULAN manapun (bukan cuma hari ini vs
 *     ever lagi).
 *  2. "Informasi DSE" sekarang jadi SECTION TERPISAH per region (role MC
 *     saja - Informasi DSE bukan tanggung jawab Admin Area), dgn status
 *     Lengkap/Sebagian/Belum Diisi dihitung dari mf_dse_info_periods thd
 *     periode (bulan) yg dipilih, TERPISAH dari section Penjualan/AR biar
 *     ga ketuker ("mulai mengisi Penjualan" != "Informasi DSE lengkap").
 *
 * Definisi "mulai mengisi" (dari yang terdaftar emailnya), scoped ke
 * periode (tanggal exact utk Daily, bulan utk Full Month) yg dipilih:
 *  - Admin MC  -> MC itu punya minimal 1 baris di mf_dse_prod_ar (Penjualan
 *    DSE) ATAU di dso_piutang_items (AR DSO/DSP) PADA periode tsb.
 *  - Admin Area -> Branch itu punya minimal 1 baris (belum dihapus) di
 *    hoa_piutang_items (AR HoA) PADA periode tsb.
 * Informasi DSE "Lengkap" (role MC) -> SEMUA DSE aktif (non-revoked) di MC
 * itu punya snapshot di mf_dse_info_periods pada periode terpilih ATAU
 * periode SEBELUMNYA (snapshot "berlaku" sampai diupdate lagi - sama
 * persis semantik resolveInfoAsOf di DSE_ProdAR.jsx).
 * Login "pernah"/"pada periode" dari last_sign_in_at tiap email terdaftar,
 * lewat RPC mf_dse_admin_mc_email_login_status / _admin_area_ (khusus SPM).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import supabase from "../../../lib/supabase";
import {
  X, Loader2, Users, Mail, PenLine, LogIn, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Building2, CircleAlert, CircleCheck, CircleDot, Calendar, CalendarDays, Info,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const START_YEAR = 2026;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function pad2(n) { return String(n).padStart(2, "0"); }
function fmtDateLong(iso) {
  if (!iso) return "";
  const [y, m, dd] = iso.split("-").map(Number);
  return `${pad2(dd)} ${MONTH_NAMES[m - 1]} ${y}`;
}
function addDaysISO(iso, delta) {
  const dt = new Date(iso + "T00:00:00");
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function addMonths(monthStr, delta) {
  let [y, m] = monthStr.split("-").map(Number);
  m += delta;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${pad2(m)}`;
}
function getAvailableMonths() {
  const now = new Date();
  const out = [];
  for (let y = START_YEAR; y <= now.getFullYear() + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === now.getFullYear() + 1 && m > now.getMonth() + 2) continue;
      out.push({ year: y, month: m, key: `${y}-${pad2(m)}` });
    }
  }
  return out;
}

export default function UserManagementSummaryModal({ theme, onClose }) {
  const d = theme === "dark";
  const t = {
    card: d ? "#1A1A1D" : "#FFFFFF", sub: d ? "#202024" : "#F5F5F7", page: d ? "#111113" : "#FBFBF9",
    line: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)", hi: d ? "#F2F2F3" : "#1A1A1D",
    mid: d ? "#8A8A96" : "#5A5A68", lo: d ? "#5A5A68" : "#8A8A96",
    inputBg: d ? "#1E1E22" : "#F8F8FA", inputBd: d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)",
    teal: d ? "#32BCAD" : "#1A9E90", tealBg: d ? "rgba(50,188,173,0.12)" : "rgba(26,158,144,0.08)", tealBd: d ? "rgba(50,188,173,0.28)" : "rgba(26,158,144,0.20)",
    red: d ? "#F87171" : "#DC2626", redBg: d ? "rgba(248,113,113,0.12)" : "rgba(220,38,38,0.07)",
    amber: d ? "#FBBF24" : "#B45309", amberBg: d ? "rgba(251,191,36,0.12)" : "rgba(180,83,9,0.08)",
    shadowSm: d ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.07)",
  };

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [role, setRole] = useState("mc"); // "mc" | "area"
  const [periodMode, setPeriodMode] = useState("daily"); // "daily" | "month"
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedMonth, setSelectedMonth] = useState(todayISO().slice(0, 7));
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const periodBtnRef = useRef(null);
  const periodMenuRef = useRef(null);
  const [openRegions, setOpenRegions] = useState({});
  const [openBucket, setOpenBucket] = useState({});

  const [raw, setRaw] = useState(null); // { mcRegion, areaRegion, mcEmailsByMc, areaEmailsByBranch, prodRows, dsoRows, hoaRows, infoRows, dseRosterByMc, mcLoginByEmail, areaLoginByEmail }

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [
        { data: dseRows, error: dseErr },
        { data: mcMappingRows }, { data: mcEmailRows },
        { data: areaMappingRows }, { data: areaEmailRows },
        { data: prodRows }, { data: dsoRows }, { data: hoaRows },
        { data: infoRows },
      ] = await Promise.all([
        supabase.from("mf_dse_database").select("mc, branch, region, dse_code, is_revoked").not("mc", "is", null),
        supabase.from("mf_dse_admin_mc_mapping").select("id, mc, active"),
        supabase.from("mf_dse_admin_mc_emails").select("mapping_id, email, active"),
        supabase.from("mf_dse_admin_area_mapping").select("id, branch, active"),
        supabase.from("mf_dse_admin_area_emails").select("mapping_id, email, active"),
        supabase.from("mf_dse_prod_ar").select("mc, tanggal"),
        supabase.from("dso_piutang_items").select("mc, created_at"),
        supabase.from("hoa_piutang_items").select("branch, created_at").is("deleted_at", null),
        supabase.from("mf_dse_info_periods").select("dse_code, mc, period"),
      ]);
      if (dseErr) throw dseErr;

      const mcRegion = new Map();
      const areaRegion = new Map();
      const dseRosterByMc = new Map(); // mc_lower -> [dse_code,...] (non-revoked)
      (dseRows || []).forEach((r) => {
        if (r.mc) {
          const k = r.mc.toLowerCase();
          if (!mcRegion.has(k)) mcRegion.set(k, { mc: r.mc, region: r.region || "Lainnya" });
          if (!r.is_revoked) { if (!dseRosterByMc.has(k)) dseRosterByMc.set(k, []); dseRosterByMc.get(k).push(r.dse_code); }
        }
        if (r.branch) { const k = r.branch.toLowerCase(); if (!areaRegion.has(k)) areaRegion.set(k, { branch: r.branch, region: r.region || "Lainnya" }); }
      });

      const mcMapById = new Map((mcMappingRows || []).map((m) => [m.id, m]));
      const mcEmailsByMc = new Map();
      (mcEmailRows || []).forEach((e) => {
        if (e.active === false) return;
        const m = mcMapById.get(e.mapping_id);
        if (!m?.mc) return;
        const k = m.mc.toLowerCase();
        if (!mcEmailsByMc.has(k)) mcEmailsByMc.set(k, []);
        mcEmailsByMc.get(k).push(e.email);
      });
      const areaMapById = new Map((areaMappingRows || []).map((m) => [m.id, m]));
      const areaEmailsByBranch = new Map();
      (areaEmailRows || []).forEach((e) => {
        if (e.active === false) return;
        const m = areaMapById.get(e.mapping_id);
        if (!m?.branch) return;
        const k = m.branch.toLowerCase();
        if (!areaEmailsByBranch.has(k)) areaEmailsByBranch.set(k, []);
        areaEmailsByBranch.get(k).push(e.email);
      });

      const allMcEmails = Array.from(new Set(Array.from(mcEmailsByMc.values()).flat().filter(Boolean)));
      const allAreaEmails = Array.from(new Set(Array.from(areaEmailsByBranch.values()).flat().filter(Boolean)));
      const [{ data: mcLogin }, { data: areaLogin }] = await Promise.all([
        allMcEmails.length ? supabase.rpc("mf_dse_admin_mc_email_login_status", { p_emails: allMcEmails }) : Promise.resolve({ data: [] }),
        allAreaEmails.length ? supabase.rpc("mf_dse_admin_area_email_login_status", { p_emails: allAreaEmails }) : Promise.resolve({ data: [] }),
      ]);
      const mcLoginByEmail = new Map((mcLogin || []).map((r) => [r.email, r.last_sign_in_at]));
      const areaLoginByEmail = new Map((areaLogin || []).map((r) => [r.email, r.last_sign_in_at]));

      setRaw({
        mcRegion, areaRegion, mcEmailsByMc, areaEmailsByBranch,
        prodRows: prodRows || [], dsoRows: dsoRows || [], hoaRows: hoaRows || [],
        infoRows: infoRows || [], dseRosterByMc,
        mcLoginByEmail, areaLoginByEmail,
      });
    } catch (e) {
      setErr(e.message || "Gagal memuat summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!periodPickerOpen) return;
    const onClick = (ev) => {
      if (periodBtnRef.current?.contains(ev.target)) return;
      if (periodMenuRef.current?.contains(ev.target)) return;
      setPeriodPickerOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [periodPickerOpen]);

  // Periode efektif yg dipakai utk cek "mulai mengisi" (exact tanggal utk
  // Daily, bulan utk Full Month) & periode bulan utk Informasi DSE (SELALU
  // bulanan, apapun mode-nya - dari tanggal/bulan yg lagi dipilih).
  const effMonth = periodMode === "daily" ? selectedDate.slice(0, 7) : selectedMonth;
  const periodLabel = periodMode === "daily" ? fmtDateLong(selectedDate) : `${MONTH_NAMES[Number(selectedMonth.slice(5, 7)) - 1]} ${selectedMonth.slice(0, 4)}`;

  const current = useMemo(() => {
    if (!raw) return null;
    const matchesPeriod = (dateStr) => {
      if (!dateStr) return false;
      return periodMode === "daily" ? dateStr.slice(0, 10) === selectedDate : dateStr.slice(0, 7) === selectedMonth;
    };

    const mcFilled = new Set();
    raw.prodRows.forEach((r) => { if (r.mc && matchesPeriod(r.tanggal)) mcFilled.add(r.mc.toLowerCase()); });
    raw.dsoRows.forEach((r) => { if (r.mc && matchesPeriod(r.created_at)) mcFilled.add(r.mc.toLowerCase()); });
    const areaFilled = new Set();
    raw.hoaRows.forEach((r) => { if (r.branch && matchesPeriod(r.created_at)) areaFilled.add(r.branch.toLowerCase()); });

    // Informasi DSE: DSE terhitung "terisi" utk bulan efektif kalau punya
    // snapshot period <= effMonth (snapshot terakhir berlaku terus sampai
    // diupdate - sama spt resolveInfoAsOf di DSE_ProdAR.jsx).
    const infoFilledDseByMc = new Map(); // mc_lower -> Set(dse_code)
    raw.infoRows.forEach((r) => {
      if (!r.mc || !r.period || r.period > effMonth) return;
      const k = r.mc.toLowerCase();
      if (!infoFilledDseByMc.has(k)) infoFilledDseByMc.set(k, new Set());
      infoFilledDseByMc.get(k).add(r.dse_code);
    });

    const loginMatches = (ts) => {
      if (!ts) return false;
      return periodMode === "daily" ? ts.slice(0, 10) === selectedDate : ts.slice(0, 7) === selectedMonth;
    };

    const buildEntities = (universe, emailsByCode, filledSet, loginByEmail, codeField) =>
      Array.from(universe.values()).map((u) => {
        const code = u[codeField];
        const k = code.toLowerCase();
        const emails = emailsByCode.get(k) || [];
        const logins = emails.map((e) => loginByEmail.get(e.toLowerCase().trim())).filter(Boolean);
        const dseList = raw.dseRosterByMc.get(k) || [];
        const infoSet = infoFilledDseByMc.get(k) || new Set();
        const infoFilledCount = dseList.filter((c) => infoSet.has(c)).length;
        let infoStatus = "empty";
        if (dseList.length > 0 && infoFilledCount >= dseList.length) infoStatus = "full";
        else if (infoFilledCount > 0) infoStatus = "partial";
        return {
          code, region: u.region,
          hasEmail: emails.length > 0, emailCount: emails.length, emails,
          filled: filledSet.has(k),
          login: logins.some(loginMatches), loginEver: logins.length > 0,
          totalDse: dseList.length, infoFilledCount, infoStatus,
        };
      }).sort((a, b) => a.code.localeCompare(b.code));

    const mcEntities = buildEntities(raw.mcRegion, raw.mcEmailsByMc, mcFilled, raw.mcLoginByEmail, "mc");
    const areaEntities = buildEntities(raw.areaRegion, raw.areaEmailsByBranch, areaFilled, raw.areaLoginByEmail, "branch");

    const groupByRegion = (entities) => {
      const map = new Map();
      entities.forEach((e) => { if (!map.has(e.region)) map.set(e.region, []); map.get(e.region).push(e); });
      return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([region, items]) => ({ region, items }));
    };

    return {
      mc: { entities: mcEntities, byRegion: groupByRegion(mcEntities) },
      area: { entities: areaEntities, byRegion: groupByRegion(areaEntities) },
    };
  }, [raw, periodMode, selectedDate, selectedMonth, effMonth]);

  const roleData = current?.[role];
  const noun = role === "mc" ? "MC" : "Area";

  const totals = useMemo(() => {
    if (!roleData) return null;
    const list = roleData.entities;
    const base = {
      total: list.length,
      withEmail: list.filter((e) => e.hasEmail).length,
      noEmail: list.filter((e) => !e.hasEmail).length,
      filled: list.filter((e) => e.hasEmail && e.filled).length,
      notFilled: list.filter((e) => e.hasEmail && !e.filled).length,
      loggedIn: list.filter((e) => e.hasEmail && e.login).length,
    };
    if (role === "mc") {
      base.infoFull = list.filter((e) => e.infoStatus === "full").length;
      base.infoPartial = list.filter((e) => e.infoStatus === "partial").length;
      base.infoEmpty = list.filter((e) => e.infoStatus === "empty").length;
    }
    return base;
  }, [roleData, role]);

  const toggleBucket = (key) => setOpenBucket((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleRegion = (key) => setOpenRegions((prev) => ({ ...prev, [key]: !prev[key] }));

  const months = useMemo(() => getAvailableMonths(), []);
  const monthsByYear = useMemo(() => {
    const map = new Map();
    for (const m of months) { if (!map.has(m.year)) map.set(m.year, []); map.get(m.year).push(m); }
    return map;
  }, [months]);

  const goPrev = () => periodMode === "daily" ? setSelectedDate((v) => addDaysISO(v, -1)) : setSelectedMonth((v) => addMonths(v, -1));
  const goNext = () => periodMode === "daily" ? setSelectedDate((v) => addDaysISO(v, 1)) : setSelectedMonth((v) => addMonths(v, 1));
  const goToday = () => { setSelectedDate(todayISO()); setSelectedMonth(todayISO().slice(0, 7)); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9800, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 1360, maxHeight: "92vh", background: t.page, borderRadius: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: FONT }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: `1px solid ${t.line}`, background: t.card, flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: t.tealBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Users size={18} color={t.teal} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: t.hi }}>Summary User Management</div>
            <div style={{ fontSize: 12, color: t.mid, marginTop: 1 }}>Status pendaftaran, pengisian Penjualan/AR & Informasi DSE — per Region</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: t.sub, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
        </div>

        {/* Tabs & period picker */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${t.line}`, background: t.card, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, background: t.sub, borderRadius: 10, padding: 4 }}>
            {[{ k: "mc", label: "Admin MC" }, { k: "area", label: "Admin Area" }].map((r) => (
              <button key={r.k} onClick={() => setRole(r.k)}
                style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "none", background: role === r.k ? t.teal : "transparent", color: role === r.k ? "#fff" : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                {r.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 2, background: t.sub, borderRadius: 10, padding: 4 }}>
              {[{ k: "daily", label: "Daily" }, { k: "month", label: "Full Month" }].map((s) => (
                <button key={s.k} onClick={() => setPeriodMode(s.k)}
                  style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "none", background: periodMode === s.k ? t.card : "transparent", boxShadow: periodMode === s.k ? t.shadowSm : "none", color: periodMode === s.k ? t.hi : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  {s.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={goPrev} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={15} /></button>

              <div style={{ position: "relative" }}>
                <button ref={periodBtnRef} onClick={() => setPeriodPickerOpen((v) => !v)}
                  style={{ height: 34, display: "flex", alignItems: "center", gap: 7, padding: "0 13px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: "pointer", minWidth: 170, justifyContent: "center" }}>
                  {periodMode === "daily" ? <Calendar size={13} color={t.teal} /> : <CalendarDays size={13} color={t.teal} />}
                  {periodLabel}
                  <ChevronDown size={12} color={t.mid} />
                </button>
                {periodPickerOpen && (
                  <div ref={periodMenuRef} style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", zIndex: 300, width: periodMode === "daily" ? 220 : 260, background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.22)", padding: 10 }}>
                    {periodMode === "daily" ? (
                      <input type="date" value={selectedDate} onChange={(e) => { if (e.target.value) { setSelectedDate(e.target.value); setPeriodPickerOpen(false); } }}
                        style={{ width: "100%", border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }} />
                    ) : (
                      <div style={{ maxHeight: 280, overflowY: "auto" }}>
                        {[...monthsByYear.keys()].sort((a, b) => b - a).map((y) => (
                          <div key={y} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: t.mid, padding: "4px 4px" }}>{y}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                              {monthsByYear.get(y).map((m) => (
                                <button key={m.key} onClick={() => { setSelectedMonth(m.key); setPeriodPickerOpen(false); }}
                                  style={{ padding: "7px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, background: m.key === selectedMonth ? t.teal : t.sub, color: m.key === selectedMonth ? "#fff" : t.mid }}>
                                  {MONTH_NAMES[m.month - 1].slice(0, 3)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button onClick={goNext} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={15} /></button>
              <button onClick={goToday} style={{ height: 34, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.mid, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}>Hari Ini</button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: "center", color: t.mid }}><Loader2 size={20} className="spin" /></div>
          ) : err ? (
            <div style={{ padding: 30, textAlign: "center", color: t.red, fontSize: 13 }}>{err}</div>
          ) : (
            <>
              {/* Ringkasan total */}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${role === "mc" ? 6 : 5}, minmax(0, 1fr))`, gap: 14 }}>
                <StatCard t={t} icon={<Building2 size={18} color={t.hi} />} iconBg={t.sub} value={totals.total} label={`Total ${noun}`} />
                <StatCard t={t} icon={<Mail size={18} color={t.teal} />} iconBg={t.tealBg} value={`${totals.withEmail} / ${totals.total}`} label="Punya ≥1 Email" />
                <StatCard t={t} icon={<CircleAlert size={18} color={t.red} />} iconBg={t.redBg} value={totals.noEmail} label="Belum Ada Email" />
                <StatCard t={t} icon={<PenLine size={18} color={t.amber} />} iconBg={t.amberBg} value={`${totals.filled} / ${totals.withEmail}`} label={`Mengisi Penjualan/AR${periodMode === "daily" ? " (Tgl Ini)" : " (Bulan Ini)"}`} />
                <StatCard t={t} icon={<LogIn size={18} color={t.teal} />} iconBg={t.tealBg} value={`${totals.loggedIn} / ${totals.withEmail}`} label={`Login${periodMode === "daily" ? " (Tgl Ini)" : " (Bulan Ini)"}`} />
                {role === "mc" && <StatCard t={t} icon={<Info size={18} color={t.teal} />} iconBg={t.tealBg} value={`${totals.infoFull} / ${totals.total}`} label="Informasi DSE Lengkap" />}
              </div>

              {/* Per region */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, alignItems: "start" }}>
                {roleData.byRegion.map(({ region, items }) => {
                  const noEmailList = items.filter((e) => !e.hasEmail);
                  const notFilledList = items.filter((e) => e.hasEmail && !e.filled);
                  const activeList = items.filter((e) => e.hasEmail && e.filled);
                  const loginList = items.filter((e) => e.hasEmail && e.login);
                  const infoFullList = items.filter((e) => e.infoStatus === "full");
                  const infoPartialList = items.filter((e) => e.infoStatus === "partial");
                  const infoEmptyList = items.filter((e) => e.infoStatus === "empty");
                  const regionKey = `${role}|${region}`;
                  const regionOpen = openRegions[regionKey] !== false;
                  return (
                    <div key={region} style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
                      <button onClick={() => toggleRegion(regionKey)} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, padding: "13px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: FONT, textAlign: "left" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 800, color: t.hi, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{region}</div>
                          {regionOpen ? <ChevronUp size={15} color={t.lo} /> : <ChevronDown size={15} color={t.lo} />}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <Pill t={t} color={t.mid} bg={t.sub} label={`${items.length} ${noun}`} />
                          <Pill t={t} color={t.red} bg={t.redBg} label={`${noEmailList.length} belum ada email`} />
                          <Pill t={t} color={t.amber} bg={t.amberBg} label={`${notFilledList.length} belum isi`} />
                          <Pill t={t} color={t.teal} bg={t.tealBg} label={`${activeList.length} aktif isi`} />
                          {role === "mc" && <Pill t={t} color={t.teal} bg={t.tealBg} label={`${infoFullList.length} info lengkap`} />}
                        </div>
                      </button>
                      {regionOpen && (
                        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 800, color: t.lo, textTransform: "uppercase", letterSpacing: 0.4 }}>Penjualan DSE / AR</div>
                            <Bucket t={t} tone="red" icon={<CircleAlert size={14} color={t.red} />} title={`Belum Ada Email Terdaftar`} items={noEmailList} noun={noun}
                              bucketKey={`${regionKey}|noemail`} open={openBucket[`${regionKey}|noemail`]} onToggle={toggleBucket} renderExtra={() => null} />
                            <Bucket t={t} tone="amber" icon={<CircleDot size={14} color={t.amber} />} title={`Sudah Ada Email, Belum Mengisi (${periodLabel})`} items={notFilledList} noun={noun}
                              bucketKey={`${regionKey}|notfilled`} open={openBucket[`${regionKey}|notfilled`]} onToggle={toggleBucket}
                              renderExtra={(e) => <span style={{ color: t.lo, fontSize: 11.5 }}>{e.emailCount} email{e.loginEver ? " · pernah login" : " · belum pernah login"}</span>} />
                            <Bucket t={t} tone="teal" icon={<CircleCheck size={14} color={t.teal} />} title={`Aktif Mengisi (${periodLabel})`} items={activeList} noun={noun}
                              bucketKey={`${regionKey}|active`} open={openBucket[`${regionKey}|active`]} onToggle={toggleBucket}
                              renderExtra={(e) => <span style={{ color: t.lo, fontSize: 11.5 }}>{e.login ? "login periode ini" : e.loginEver ? "pernah login" : "belum pernah login"}</span>} />
                          </div>

                          {role === "mc" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px dashed ${t.line}`, paddingTop: 12 }}>
                              <div style={{ fontSize: 10.5, fontWeight: 800, color: t.lo, textTransform: "uppercase", letterSpacing: 0.4 }}>Informasi DSE — {MONTH_NAMES[Number(effMonth.slice(5, 7)) - 1]} {effMonth.slice(0, 4)}</div>
                              <Bucket t={t} tone="red" icon={<CircleAlert size={14} color={t.red} />} title="Belum Diisi Sama Sekali" items={infoEmptyList} noun={noun}
                                bucketKey={`${regionKey}|infoempty`} open={openBucket[`${regionKey}|infoempty`]} onToggle={toggleBucket}
                                renderExtra={(e) => <span style={{ color: t.lo, fontSize: 11.5 }}>0 / {e.totalDse} DSE</span>} />
                              <Bucket t={t} tone="amber" icon={<CircleDot size={14} color={t.amber} />} title="Sebagian Terisi" items={infoPartialList} noun={noun}
                                bucketKey={`${regionKey}|infopartial`} open={openBucket[`${regionKey}|infopartial`]} onToggle={toggleBucket}
                                renderExtra={(e) => <span style={{ color: t.lo, fontSize: 11.5 }}>{e.infoFilledCount} / {e.totalDse} DSE</span>} />
                              <Bucket t={t} tone="teal" icon={<CircleCheck size={14} color={t.teal} />} title="Lengkap Semua" items={infoFullList} noun={noun}
                                bucketKey={`${regionKey}|infofull`} open={openBucket[`${regionKey}|infofull`]} onToggle={toggleBucket}
                                renderExtra={(e) => <span style={{ color: t.lo, fontSize: 11.5 }}>{e.infoFilledCount} / {e.totalDse} DSE</span>} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ t, icon, iconBg, value, label }) {
  return (
    <div style={{ flex: "1 1 160px", minWidth: 150, borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{value}</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      </div>
    </div>
  );
}

function Pill({ t, color, bg, label }) {
  return <span style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 999, background: bg, color, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>;
}

function Bucket({ t, tone, icon, title, items, noun, bucketKey, open, onToggle, renderExtra }) {
  const toneColor = tone === "red" ? t.red : tone === "amber" ? t.amber : t.teal;
  const toneBg = tone === "red" ? t.redBg : tone === "amber" ? t.amberBg : t.tealBg;
  if (items.length === 0) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 10, background: t.sub, opacity: 0.6 }}>
      {icon}<span style={{ fontSize: 12.5, color: t.mid }}>{title} — tidak ada</span>
    </div>
  );
  return (
    <div style={{ borderRadius: 10, background: toneBg, overflow: "hidden" }}>
      <button onClick={() => onToggle(bucketKey)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: FONT, textAlign: "left" }}>
        {icon}
        <span style={{ fontSize: 12.5, fontWeight: 700, color: toneColor, flex: 1 }}>{title} ({items.length} {noun})</span>
        {open ? <ChevronUp size={13} color={toneColor} /> : <ChevronDown size={13} color={toneColor} />}
      </button>
      {open && (
        <div style={{ padding: "2px 12px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          {items.map((e) => (
            <div key={e.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.55)" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>{e.code}</span>
              {renderExtra(e)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
