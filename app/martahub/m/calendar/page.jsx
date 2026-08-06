"use client";
/**
 * /martahub/m/calendar - Kalender aktivitas BME/RGE (web mobile), menggantikan
 * slot Leaderboard di bottom nav. Pilih tanggal → lihat plan yang sudah ada
 * di tanggal itu → langsung "Buat Plan" baru dgn tanggal tsb ter-prefill.
 * Data dari RPC `mh_activity_calendar_for_me` (scoping hierarki sama dgn
 * CalendarPickerSheet di wizard Create Plan - lihat _shared/CalendarPickerSheet.jsx).
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Loader2, MapPin } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, FF, BRAND } from "../_shared/MobileShell";
import { statusMeta, fmtDate, fmtInt } from "../_shared/activityUi";

const MONTH_NAMES_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function dotColorForStatuses(statuses) {
  if (statuses.some((s) => s === "rejected" || s === "revision_needed" || s === "revision_actual")) return "#DC2626";
  if (statuses.some((s) => s === "plan_submitted" || s === "pending_validation")) return "#B45309";
  if (statuses.some((s) => s === "approved")) return "#15803D";
  return "#6B7280";
}

function pad2(n) { return String(n).padStart(2, "0"); }
function toKey(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

function activityDateKeys(a) {
  if (a.plan_dates_multi) return a.plan_dates_multi.split(",").filter(Boolean).map((s) => s.trim());
  if (a.plan_date_start && a.plan_date_end && a.plan_date_start !== a.plan_date_end) {
    const keys = [];
    let d = new Date(a.plan_date_start + "T00:00:00");
    const end = new Date(a.plan_date_end + "T00:00:00");
    while (d <= end) { keys.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
    return keys;
  }
  return a.plan_date ? [a.plan_date] : [];
}

export default function CalendarPage() {
  const router = useRouter();
  const { loading: sessionLoading } = useMartaSession();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(toKey(today.getFullYear(), today.getMonth(), today.getDate()));
  const [byDate, setByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const gridStart = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    return new Date(viewYear, viewMonth, 1 - first.getDay());
  }, [viewYear, viewMonth]);
  const gridEnd = useMemo(() => { const d = new Date(gridStart); d.setDate(d.getDate() + 41); return d; }, [gridStart]);

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    setLoading(true); setErr("");
    (async () => {
      try {
        const { data, error } = await supabaseMarta.rpc("mh_activity_calendar_for_me", {
          p_period_start: gridStart.toISOString().slice(0, 10),
          p_period_end: gridEnd.toISOString().slice(0, 10),
        });
        if (error) throw error;
        const bucket = {};
        for (const a of data || []) for (const key of activityDateKeys(a)) (bucket[key] ||= []).push(a);
        if (alive) setByDate(bucket);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat kalender");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, gridStart.getTime()]);

  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart); d.setDate(d.getDate() + i);
      arr.push({ d: d.getDate(), inMonth: d.getMonth() === viewMonth, key: toKey(d.getFullYear(), d.getMonth(), d.getDate()) });
    }
    return arr;
  }, [gridStart, viewMonth]);

  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  function changeMonth(delta) {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setViewMonth(m); setViewYear(y);
  }

  const dayActs = byDate[selected] || [];
  const [expandedId, setExpandedId] = useState(null);
  function selectDate(key) { setSelected(key); setExpandedId(null); }

  return (
    <MobileShell active="calendar">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Kalender</div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>
          Lihat plan yang sudah dijadwalkan, lalu buat plan baru dari tanggal manapun.
        </div>

        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <button onClick={() => changeMonth(-1)} style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <ChevronLeft size={17} />
          </button>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>{MONTH_NAMES_FULL[viewMonth]} {viewYear}</div>
          <button onClick={() => changeMonth(1)} style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: "14px 14px 0" }}>
        <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 18, padding: "12px 8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {DOW.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "#B0B0BA", padding: "4px 0" }}>{d}</div>
            ))}
          </div>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}>
              <Loader2 size={20} color="#ED1C24" style={{ animation: "mspin .9s linear infinite" }} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginTop: 2 }}>
              {cells.map((c) => {
                const acts = byDate[c.key] || [];
                const sel = c.key === selected;
                const isToday = c.key === todayKey;
                return (
                  <button key={c.key} onClick={() => selectDate(c.key)}
                    style={{
                      position: "relative", aspectRatio: "1", borderRadius: 12,
                      border: isToday && !sel ? "1.5px solid #ED1C24" : "1.5px solid transparent",
                      background: sel ? BRAND : "transparent",
                      color: !c.inMonth ? "#D0D0D8" : sel ? "#fff" : "#17181C",
                      fontFamily: FF, fontSize: 13, fontWeight: sel ? 800 : 600, cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                    }}>
                    <span>{c.d}</span>
                    {acts.length > 0 && (
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: sel ? "#fff" : dotColorForStatuses(acts.map((a) => a.status)) }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {err && <div style={{ margin: "12px 20px 0", padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

      {/* Detail tanggal terpilih */}
      <div style={{ padding: "18px 20px 100px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C" }}>{fmtDate(selected)}</div>
          <span style={{ fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{dayActs.length} aktivitas</span>
        </div>

        {dayActs.length === 0 ? (
          <div style={{ marginTop: 12, textAlign: "center", padding: "32px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada plan di tanggal ini</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Ketuk "Buat Plan" untuk menjadwalkan aktivitas baru.</div>
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {dayActs.map((a) => {
              const meta = statusMeta(a.status);
              const open = expandedId === a.id;
              return (
                <div key={a.id} style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, overflow: "hidden", fontFamily: FF }}>
                  <button onClick={() => setExpandedId(open ? null : a.id)}
                    style={{ textAlign: "left", width: "100%", background: "none", border: "none", padding: "13px 14px", cursor: "pointer", fontFamily: FF }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.event_name || "-"}</div>
                        <div style={{ marginTop: 3, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>
                          {a.mc || "-"} {a.site_id ? `· ${a.site_id}` : ""} · Target {fmtInt(a.target_sp)}/{fmtInt(a.target_fwa)} SP/FWA
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>
                          {meta.label}
                        </span>
                        <ChevronDown size={15} color="#B0B0BA" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div style={{ padding: "0 14px 13px", borderTop: "1px solid #F0F0F3" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 11 }}>
                        <MapPin size={13} color="#8A8A96" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 12, color: "#5A5A68", fontWeight: 600, lineHeight: 1.4 }}>
                          {a.address || a.site_id || "Lokasi belum diisi"}
                        </span>
                      </div>
                      <button onClick={() => router.push(`/martahub/m/activities/${a.id}`)}
                        style={{ marginTop: 11, width: "100%", height: 38, borderRadius: 11, border: "1px solid #E4E5EA", background: "#F7F7F9", color: "#3A3A44", fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                        Lihat Detail Aktivitas
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB Buat Plan - tanggal terpilih ikut ter-prefill di wizard */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 96, zIndex: 45, pointerEvents: "none" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", justifyContent: "flex-end", padding: "0 20px" }}>
          <button onClick={() => router.push(`/martahub/m/activities/new?date=${selected}`)}
            style={{
              pointerEvents: "auto", display: "flex", alignItems: "center", gap: 8,
              padding: "14px 20px", borderRadius: 28, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer",
              boxShadow: "0 6px 16px rgba(17,17,20,0.10), 0 2px 4px rgba(17,17,20,0.06)",
            }}>
            <Plus size={18} /> Buat Plan
          </button>
        </div>
      </div>
    </MobileShell>
  );
}
