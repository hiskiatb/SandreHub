"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import supabase from "../../../lib/supabase";
import {
  Bell, X, CheckCircle2, Clock, ChevronDown, ChevronUp,
  RefreshCw, FileCheck, FilePen, Trash2, Circle
} from "lucide-react";

const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];
const monthOrder = (m) => MONTHS_ID.indexOf(m);

function parseNotes(notes) {
  const r = { pendapatan: null, pengeluaran: null };
  if (!notes) return r;
  notes.split(",").forEach(part => {
    const [k, v] = part.trim().split(":");
    if (k && v) r[k.trim()] = v.trim();
  });
  return r;
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return "";
  const diff = (Date.now() - d) / 1000;
  if (diff < 60)    return "Baru saja";
  if (diff < 3600)  return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return d.toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// Tambahkan masterData dan disabledMonthsMap di props
export default function NotificationBell({ t, d, isSPM, activeYear, masterData = [], disabledMonthsMap = new Map() }) {
  const [open,           setOpen]          = useState(false);
  const [tab,            setTab]           = useState("feed");
  const [notifs,         setNotifs]        = useState([]);
  const [reports,        setReports]       = useState([]);
  const [loading,        setLoading]       = useState(false);
  const [userId,         setUserId]        = useState(null);
  const [expandedMonth,  setExpandedMonth] = useState({});
  const [expandedType,   setExpandedType]  = useState({});
  const panelRef = useRef(null);

  // ── Get current user ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSPM) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, [isSPM]);

  // ── Fetch notifications ───────────────────────────────────────────────────
  const fetchNotifs = useCallback(async (bg = false) => {
    if (!isSPM) return;
    if (!bg) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pnl_notifications")
        .select("*")
        .eq("year", activeYear)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!error && data) setNotifs(data);
    } catch (e) { console.error("fetchNotifs:", e); }
    finally { if (!bg) setLoading(false); }
  }, [isSPM, activeYear]);

  // ── Fetch pnl_reports for summary tab ────────────────────────────────────
  const fetchReports = useCallback(async () => {
    if (!isSPM) return;
    try {
      const { data, error } = await supabase
        .from("pnl_reports")
        .select("partner_name,branch,mpc_mp3,month,year,is_finalized,updated_at,validation_notes")
        .eq("year", activeYear)
        .order("updated_at", { ascending: false });
      if (!error && data) setReports(data);
    } catch (e) { console.error("fetchReports:", e); }
  }, [isSPM, activeYear]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSPM) return;
    fetchNotifs(false);
    fetchReports();
  }, [isSPM, activeYear, fetchNotifs, fetchReports]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isSPM) return;

    const channelName = `notif_bell_${activeYear}_${Date.now()}`;

    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pnl_notifications" },
        (payload) => {
          if (String(payload.new?.year) !== String(activeYear)) return;
          setNotifs(prev => [payload.new, ...prev].slice(0, 100));
          fetchReports();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [isSPM, activeYear, fetchReports]);

  // ── Outside-click close ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // ── Mark all as read ──────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    if (!userId || !notifs.length) return;
    const unreadIds = notifs
      .filter(n => !(n.read_by || []).includes(userId))
      .map(n => n.id);
    if (!unreadIds.length) return;
    setNotifs(prev =>
      prev.map(n =>
        unreadIds.includes(n.id)
          ? { ...n, read_by: [...(n.read_by || []), userId] }
          : n
      )
    );
    await Promise.allSettled(
      unreadIds.map(id =>
        supabase.rpc("notif_mark_read", { notif_id: id, uid: userId })
      )
    );
  }, [userId, notifs]);

  const handleOpen = () => {
    setOpen(p => {
      if (!p) setTimeout(() => markAllRead(), 400);
      return !p;
    });
  };

  const clearAll = async () => {
    if (!confirm("Hapus semua riwayat notifikasi tahun ini?")) return;
    await supabase.from("pnl_notifications").delete().eq("year", activeYear);
    setNotifs([]);
  };

  // ── Unread count ──────────────────────────────────────────────────────────
  const unreadCount = useMemo(() => {
    if (!userId) return 0;
    return Math.min(
      notifs.filter(n => !(n.read_by || []).includes(userId)).length,
      99
    );
  }, [notifs, userId]);

  // ── Monthly summary — DIURUTKAN DARI TOTAL BRANCH AKTIF ──────────────────
  const monthlySummary = useMemo(() => {
    if (!masterData.length) return [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIdx = now.getMonth();

    // Tentukan bulan apa saja yang tersedia (Maksimal sampai bulan berjalan jika tahun ini)
    const maxMonthIdx = Number(activeYear) === currentYear ? currentMonthIdx : 11;
    const availableMonths = MONTHS_ID.slice(0, maxMonthIdx + 1);

    // Buat lookup cepat untuk laporan
    const reportMap = new Map();
    reports.forEach(r => {
      const key = `${r.partner_name}|${r.branch}|${r.mpc_mp3}|${r.month}`;
      if (!reportMap.has(key) || r.is_finalized) {
        reportMap.set(key, r);
      }
    });

    return availableMonths.map(month => {
      const byType = {};
      let totalActive = 0;
      let totalFinalized = 0;
      let totalDraft = 0;
      let totalEmpty = 0;

      masterData.forEach(branch => {
        const bType = branch.mpc_mp3 || "?";
        if (!byType[bType]) byType[bType] = { total: 0, finalized: 0, draft: 0, empty: 0, rows: [] };

        // 1. Cek apakah branch ini di-disable pada bulan ini
        const disableKey = `${branch.partner_name}|${branch.branch_name}|${branch.mpc_mp3}|${activeYear}`;
        const disabledSet = disabledMonthsMap.get(disableKey);
        if (disabledSet && disabledSet.has(month)) {
          return; // Skip, tidak dihitung dalam total aktif
        }

        totalActive++;
        byType[bType].total++;

        // 2. Cek status laporan
        const repKey = `${branch.partner_name}|${branch.branch_name}|${branch.mpc_mp3}|${month}`;
        const rep = reportMap.get(repKey);

        let status = "EMPTY";
        if (rep) {
          status = rep.is_finalized ? "FINALIZED" : "DRAFT";
        }

        if (status === "FINALIZED") {
          totalFinalized++;
          byType[bType].finalized++;
        } else if (status === "DRAFT") {
          totalDraft++;
          byType[bType].draft++;
        } else {
          totalEmpty++;
          byType[bType].empty++;
        }

        // Simpan baris untuk ditampikan di rincian
        byType[bType].rows.push({
          partner_name: branch.partner_name,
          branch: branch.branch_name,
          mpc_mp3: branch.mpc_mp3,
          is_finalized: status === "FINALIZED",
          is_draft: status === "DRAFT",
          is_empty: status === "EMPTY",
          updated_at: rep?.updated_at || null,
          validation_notes: rep?.validation_notes || null
        });
      });

      return {
        month,
        total: totalActive,
        finalized: totalFinalized,
        draft: totalDraft,
        empty: totalEmpty,
        byType
      };
    }).reverse(); // Descending (bulan paling baru di atas)
  }, [masterData, reports, activeYear, disabledMonthsMap]);

  // Dapatkan total seluruh draft untuk badge header
  const totalDraft = useMemo(() => {
    return monthlySummary.reduce((acc, curr) => acc + curr.draft, 0);
  }, [monthlySummary]);

  if (!isSPM) return null;

  // ── Style helpers ─────────────────────────────────────────────────────────
  const bgFor = (type) => ({
    finalized:  d ? "rgba(50,188,173,0.10)" : "rgba(50,188,173,0.07)",
    form_final: d ? "rgba(50,188,173,0.08)" : "rgba(50,188,173,0.05)",
    form_draft: d ? "rgba(255,203,5,0.10)"  : "rgba(255,203,5,0.07)",
  }[type] || "transparent");

  const bdFor = (type) => ({
    finalized:  "rgba(50,188,173,0.25)",
    form_final: "rgba(50,188,173,0.20)",
    form_draft: "rgba(255,203,5,0.28)",
  }[type] || t.line);

  const iconFor = (type) => {
    if (type === "finalized")  return <CheckCircle2 size={14} style={{ color: "#32BCAD" }} />;
    if (type === "form_final") return <FileCheck    size={14} style={{ color: "#32BCAD" }} />;
    if (type === "form_draft") return <FilePen      size={14} style={{ color: "#FFCB05" }} />;
    return <Clock size={14} style={{ color: t.mid }} />;
  };

  const labelFor = (item) => {
    const f = item.form
      ? item.form.charAt(0).toUpperCase() + item.form.slice(1)
      : "";
    if (item.type === "finalized") {
      const n = parseNotes(item.validation_notes);
      const parts = [];
      if (n.pendapatan  === "final") parts.push("Pendapatan ✓");
      if (n.pengeluaran === "final") parts.push("Pengeluaran ✓");
      return `Laporan difinalisasi${parts.length ? ` (${parts.join(", ")})` : ""}`;
    }
    if (item.type === "form_final") return `Laporan ${f} difinalisasi`;
    if (item.type === "form_draft") return `Laporan ${f} disimpan (draft)`;
    return "Update laporan";
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", flexShrink: 0 }} ref={panelRef}>

      {/* ── Bell button ── */}
      <button
        onClick={handleOpen}
        className="icon-btn"
        style={{
          width: 36, height: 36, position: "relative",
          background: open ? t.blueSoft : t.inputBg,
          borderColor: open ? t.blueBd : t.line,
          color: open ? t.blue : t.mid,
        }}
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -5, right: -5,
            minWidth: 17, height: 17, borderRadius: 99,
            background: "#ED1C24", color: "#fff",
            fontSize: 9, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 4px", lineHeight: 1,
            border: `2px solid ${d ? "#0D0D0E" : "#F5F5F6"}`,
            animation: "_nb_pop 0.25s ease",
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {/* ── Panel ── */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 410, maxWidth: "calc(100vw - 24px)",
          background: d ? "#161618" : "#FFFFFF",
          border: `1px solid ${t.line}`, borderRadius: 16,
          boxShadow: t.shadowLg, zIndex: 500, overflow: "hidden",
          display: "flex", flexDirection: "column", maxHeight: "84vh",
        }}>

          {/* Header */}
          <div style={{
            padding: "13px 16px 0",
            background: d ? "#111113" : "#F8F8FA",
            borderBottom: `1px solid ${t.line}`,
            flexShrink: 0,
          }}>
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bell size={14} style={{ color: t.blue }} />
                <span style={{
                  fontWeight: 700, fontSize: 13.5, color: t.hi, letterSpacing: "-0.01em",
                }}>
                  Notifikasi Laporan
                </span>
                {totalDraft > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                    background: "rgba(237,28,36,0.12)", color: "#ED1C24",
                    border: "1px solid rgba(237,28,36,0.25)",
                  }}>
                    {totalDraft} draft
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 5 }}>
                <button
                  onClick={() => { fetchNotifs(false); fetchReports(); }}
                  disabled={loading}
                  style={{
                    width: 26, height: 26, borderRadius: 7,
                    border: `1px solid ${t.line}`, background: "transparent",
                    cursor: "pointer", color: t.mid,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  <RefreshCw size={11} style={{ animation: loading ? "_nb_spin 1s linear infinite" : "none" }} />
                </button>
                {notifs.length > 0 && (
                  <button
                    onClick={clearAll}
                    title="Hapus semua riwayat"
                    style={{
                      width: 26, height: 26, borderRadius: 7,
                      border: `1px solid ${t.line}`, background: "transparent",
                      cursor: "pointer", color: t.mid,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    width: 26, height: 26, borderRadius: 7,
                    border: `1px solid ${t.line}`, background: "transparent",
                    cursor: "pointer", color: t.mid,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex" }}>
              {[
                { id: "feed",    label: "Aktivitas",       badge: notifs.length },
                { id: "summary", label: "Ringkasan Bulan", badge: null },
              ].map(tb => (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                  style={{
                    padding: "7px 14px", fontSize: 12.5,
                    fontWeight: tab === tb.id ? 700 : 500,
                    color: tab === tb.id ? t.blue : t.mid,
                    background: "transparent", border: "none", cursor: "pointer",
                    borderBottom: tab === tb.id ? `2px solid ${t.blue}` : "2px solid transparent",
                    display: "flex", alignItems: "center", gap: 6,
                    fontFamily: "inherit", transition: "color .14s",
                  }}
                >
                  {tb.label}
                  {tb.badge !== null && tb.badge > 0 && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                      background: tab === tb.id
                        ? `${t.blue}18`
                        : (d ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"),
                      color: tab === tb.id ? t.blue : t.mid,
                    }}>
                      {tb.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1 }}>

            {/* ══ FEED TAB ══ */}
            {tab === "feed" && (
              loading && notifs.length === 0 ? (
                <div style={{ padding: 28, textAlign: "center", color: t.mid, fontSize: 13 }}>
                  Memuat…
                </div>
              ) : notifs.length === 0 ? (
                <div style={{ padding: 36, textAlign: "center" }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: d ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                    border: `1px solid ${t.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 12px",
                  }}>
                    <Bell size={20} style={{ color: t.lo }} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: t.mid, marginBottom: 6 }}>
                    Belum ada aktivitas
                  </div>
                  <div style={{ fontSize: 12, color: t.lo, lineHeight: 1.65 }}>
                    Notifikasi muncul saat partner menyimpan<br />
                    atau memfinalisasi laporan PNL.
                  </div>
                </div>
              ) : notifs.map((item, i) => {
                const isUnread = userId && !(item.read_by || []).includes(userId);
                return (
                  <div
                    key={item.id || i}
                    style={{
                      padding: "11px 16px",
                      borderBottom: `1px solid ${t.line}`,
                      borderLeft: isUnread ? `3px solid ${bdFor(item.type)}` : "3px solid transparent",
                      background: isUnread ? bgFor(item.type) : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        background: bgFor(item.type), border: `1px solid ${bdFor(item.type)}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        marginTop: 1,
                      }}>
                        {iconFor(item.type)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12.5, fontWeight: isUnread ? 700 : 600,
                          color: t.hi, lineHeight: 1.4, marginBottom: 3,
                        }}>
                          {labelFor(item)}
                        </div>
                        <div style={{
                          fontSize: 11.5, color: t.mid,
                          display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap",
                        }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center",
                            padding: "1px 6px", borderRadius: 5,
                            background: item.mpc_mp3 === "MPC"
                              ? "rgba(50,188,173,0.12)"
                              : "rgba(198,22,141,0.10)",
                            color: item.mpc_mp3 === "MPC" ? "#32BCAD" : "#C6168D",
                            fontSize: 9.5, fontWeight: 700,
                          }}>
                            {item.mpc_mp3}
                          </span>
                          <strong style={{ color: t.hi, fontSize: 12 }}>{item.partner_name}</strong>
                          <span>·</span>
                          <span>{item.branch}</span>
                        </div>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 8,
                          marginTop: 5, flexWrap: "wrap",
                        }}>
                          <span style={{
                            fontSize: 10.5, fontWeight: 600, padding: "1px 7px", borderRadius: 99,
                            background: d ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
                            color: t.mid,
                          }}>
                            {item.month} {item.year}
                          </span>
                          <span style={{
                            fontSize: 10.5, color: t.lo,
                            display: "flex", alignItems: "center", gap: 3,
                          }}>
                            <Clock size={9} />{fmtTime(item.created_at)}
                          </span>
                          {item.triggered_name && (
                            <span style={{ fontSize: 10.5, color: t.lo }}>
                              oleh {item.triggered_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* ══ SUMMARY TAB ══ */}
            {tab === "summary" && (
              monthlySummary.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", color: t.mid, fontSize: 13 }}>
                  {loading ? "Memuat…" : `Belum ada master data terdaftar.`}
                </div>
              ) : monthlySummary.map(({ month, total, finalized, draft, empty, byType }) => {
                const pct    = total ? Math.round((finalized / total) * 100) : 0;
                const isExpM = !!expandedMonth[month];
                const allDone = (draft === 0 && empty === 0) && total > 0;

                return (
                  <div key={month} style={{ borderBottom: `1px solid ${t.line}` }}>

                    {/* ── Month row ── */}
                    <button
                      onClick={() => setExpandedMonth(p => ({ ...p, [month]: !p[month] }))}
                      style={{
                        width: "100%", padding: "12px 16px", border: "none", cursor: "pointer",
                        background: isExpM
                          ? (d ? "rgba(237,28,36,0.06)" : "rgba(237,28,36,0.04)")
                          : "transparent",
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between", gap: 12, fontFamily: "inherit",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                          background: allDone ? "#32BCAD" : (empty === total ? t.line : "#FFCB05"),
                        }} />
                        <span style={{ fontWeight: 700, fontSize: 13, color: t.hi }}>
                          {month} {activeYear}
                        </span>
                        {allDone && (
                          <span style={{
                            fontSize: 9.5, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                            background: "rgba(50,188,173,0.12)", color: "#32BCAD",
                            border: "1px solid rgba(50,188,173,0.25)",
                          }}>
                            Selesai ✓
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        {/* Progress bar */}
                        <div style={{
                          width: 60, height: 5, borderRadius: 3,
                          background: t.line, overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%", width: `${pct}%`, borderRadius: 3,
                            background: allDone ? "#32BCAD" : "#32BCAD",
                            transition: "width .4s",
                          }} />
                        </div>
                        {/* "X / Y branch" label */}
                        <span style={{
                          fontSize: 11.5, fontWeight: 700,
                          color: allDone ? "#32BCAD" : t.hi,
                          minWidth: 52, textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {finalized}/{total}
                          <span style={{
                            fontSize: 10, fontWeight: 400, color: t.lo, marginLeft: 3,
                          }}>
                            branch
                          </span>
                        </span>
                        {isExpM
                          ? <ChevronUp   size={13} style={{ color: t.lo }} />
                          : <ChevronDown size={13} style={{ color: t.lo }} />}
                      </div>
                    </button>

                    {/* ── Type breakdown ── */}
                    {isExpM && (
                      <div style={{ background: d ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)" }}>
                        {Object.entries(byType)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([type, tdata]) => {
                            const tkey   = `${month}|${type}`;
                            const isExpT = !!expandedType[tkey];
                            const tpct   = tdata.total
                              ? Math.round((tdata.finalized / tdata.total) * 100)
                              : 0;
                            const ac     = type === "MPC" ? "#32BCAD" : "#C6168D";
                            const tAllDone = (tdata.draft === 0 && tdata.empty === 0) && tdata.total > 0;

                            return (
                              <div key={type}>
                                <button
                                  onClick={() =>
                                    setExpandedType(p => ({ ...p, [tkey]: !p[tkey] }))
                                  }
                                  style={{
                                    width: "100%", padding: "9px 16px 9px 32px",
                                    border: "none", cursor: "pointer",
                                    background: isExpT
                                      ? (d ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)")
                                      : "transparent",
                                    borderBottom: `1px solid ${t.line}`,
                                    display: "flex", alignItems: "center",
                                    justifyContent: "space-between", gap: 10,
                                    fontFamily: "inherit",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, padding: "2px 8px",
                                      borderRadius: 6,
                                      background: type === "MPC"
                                        ? "rgba(50,188,173,0.13)"
                                        : "rgba(198,22,141,0.12)",
                                      color: ac,
                                      border: `1px solid ${ac}30`,
                                      letterSpacing: "0.06em",
                                    }}>
                                      {type}
                                    </span>
                                    {/* "X / Y branch" per type */}
                                    <span style={{ fontSize: 12, color: t.mid }}>
                                      <span style={{ color: t.hi, fontWeight: 700 }}>
                                        {tdata.finalized}
                                      </span>
                                      <span style={{ color: t.lo }}>
                                        /{tdata.total}
                                      </span>
                                      {" "}
                                      <span style={{ color: t.lo, fontSize: 11 }}>
                                        branch selesai
                                      </span>
                                    </span>
                                  </div>
                                  <div style={{
                                    display: "flex", alignItems: "center",
                                    gap: 8, flexShrink: 0,
                                  }}>
                                    <div style={{
                                      width: 40, height: 4, borderRadius: 2,
                                      background: t.line, overflow: "hidden",
                                    }}>
                                      <div style={{
                                        height: "100%", width: `${tpct}%`, borderRadius: 2,
                                        background: tAllDone ? "#32BCAD" : ac,
                                        transition: "width .4s",
                                      }} />
                                    </div>
                                    {tdata.draft > 0 && (
                                      <span style={{
                                        fontSize: 9.5, fontWeight: 600, padding: "1px 6px",
                                        borderRadius: 99,
                                        background: d
                                          ? "rgba(255,203,5,0.12)"
                                          : "rgba(255,203,5,0.10)",
                                        color: d ? "#ffe066" : "#8a6a00",
                                        border: "1px solid rgba(255,203,5,0.28)",
                                      }}>
                                        {tdata.draft} draft
                                      </span>
                                    )}
                                    {isExpT
                                      ? <ChevronUp   size={12} style={{ color: t.lo }} />
                                      : <ChevronDown size={12} style={{ color: t.lo }} />}
                                  </div>
                                </button>

                                {/* ── Branch list ── */}
                                {isExpT && (
                                  <div>
                                    {tdata.rows
                                      .sort((a, b) => {
                                        // Urutkan: Draft (0) -> Kosong (1) -> Final (2)
                                        const score = (r) => r.is_draft ? 0 : r.is_empty ? 1 : 2;
                                        if (score(a) !== score(b)) return score(a) - score(b);
                                        return a.partner_name.localeCompare(b.partner_name);
                                      })
                                      .map((row, ri) => {
                                        const notes = parseNotes(row.validation_notes);
                                        return (
                                          <div
                                            key={ri}
                                            style={{
                                              padding: "9px 16px 9px 48px",
                                              borderBottom: `1px solid ${t.line}`,
                                              display: "flex", alignItems: "flex-start",
                                              justifyContent: "space-between", gap: 12,
                                              background: row.is_finalized
                                                ? "transparent"
                                                : row.is_draft
                                                  ? (d ? "rgba(255,203,5,0.04)" : "rgba(255,203,5,0.03)")
                                                  : (d ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"),
                                            }}
                                          >
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                              <div style={{
                                                fontSize: 12, fontWeight: 600, color: t.hi,
                                                overflow: "hidden", textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                opacity: row.is_empty ? 0.6 : 1,
                                              }}>
                                                {row.partner_name}
                                              </div>
                                              <div style={{
                                                fontSize: 11, color: t.mid, marginTop: 2,
                                                display: "flex", alignItems: "center", gap: 4,
                                              }}>
                                                <StoreIcon size={9} style={{ flexShrink: 0 }} />
                                                {row.branch}
                                              </div>
                                              {/* Validation note pills */}
                                              {row.is_empty ? null : (
                                                <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
                                                  {["pendapatan", "pengeluaran"].map(form => {
                                                    const st = notes[form];
                                                    if (!st) return null;
                                                    const fin = st === "final";
                                                    return (
                                                      <span
                                                        key={form}
                                                        style={{
                                                          fontSize: 9.5, fontWeight: 600,
                                                          padding: "1px 7px", borderRadius: 5,
                                                          background: fin
                                                            ? "rgba(50,188,173,0.12)"
                                                            : "rgba(255,203,5,0.12)",
                                                          color: fin
                                                            ? "#32BCAD"
                                                            : (d ? "#ffe066" : "#8a6a00"),
                                                          border: `1px solid ${fin
                                                            ? "rgba(50,188,173,0.28)"
                                                            : "rgba(255,203,5,0.28)"}`,
                                                        }}
                                                      >
                                                        {form.charAt(0).toUpperCase() + form.slice(1)}: {st}
                                                      </span>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                            <div style={{ flexShrink: 0, textAlign: "right" }}>
                                              {row.is_finalized ? (
                                                <span style={{
                                                  fontSize: 9.5, fontWeight: 700, padding: "2px 8px",
                                                  borderRadius: 99,
                                                  background: "rgba(50,188,173,0.12)",
                                                  color: "#32BCAD",
                                                  border: "1px solid rgba(50,188,173,0.25)",
                                                  display: "flex", alignItems: "center", gap: 4,
                                                }}>
                                                  <CheckCircle2 size={9} />Final
                                                </span>
                                              ) : row.is_draft ? (
                                                <span style={{
                                                  fontSize: 9.5, fontWeight: 700, padding: "2px 8px",
                                                  borderRadius: 99,
                                                  background: d
                                                    ? "rgba(255,203,5,0.12)"
                                                    : "rgba(255,203,5,0.10)",
                                                  color: d ? "#ffe066" : "#8a6a00",
                                                  border: "1px solid rgba(255,203,5,0.28)",
                                                }}>Draft</span>
                                              ) : (
                                                <span style={{
                                                  fontSize: 9.5, fontWeight: 700, padding: "2px 8px",
                                                  borderRadius: 99,
                                                  background: "transparent",
                                                  color: t.lo,
                                                  border: `1px solid ${t.line}`,
                                                  display: "flex", alignItems: "center", gap: 4,
                                                }}>
                                                  <Circle size={9} />Kosong
                                                </span>
                                              )}
                                              {row.updated_at && (
                                                <div style={{ fontSize: 9.5, color: t.lo, marginTop: 3 }}>
                                                  {fmtTime(row.updated_at)}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 16px",
            borderTop: `1px solid ${t.line}`,
            background: d ? "#111113" : "#F8F8FA",
            display: "flex", alignItems: "center",
            justifyContent: "space-between", flexShrink: 0,
          }}>
            <span style={{ fontSize: 10.5, color: t.lo }}>
              {loading ? "Memperbarui…" : `${reports.length} laporan di database`}
            </span>
            <span style={{ fontSize: 10.5, color: t.lo }}>
              {notifs.length} aktivitas
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes _nb_spin { to { transform: rotate(360deg); } }
        @keyframes _nb_pop  {
          from { transform: scale(0.5); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Komponen ikon Store untuk Branch
function StoreIcon(props) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  );
}