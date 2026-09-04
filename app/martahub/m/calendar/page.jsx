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
import { ChevronLeft, ChevronRight, Plus, Loader2, Clock } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, FF, BRAND, NAV_HEIGHT } from "../_shared/MobileShell";
import { activityStage, fmtDate, fmtTimeLabel } from "../_shared/activityUi";

const MONTH_NAMES_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BRAND_COLOR = { im3: "#F5CD46", tri: "#E23B86" };

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
  const [branchBySite, setBranchBySite] = useState({});
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

        const siteIds = Array.from(new Set((data || []).map((a) => a.site_id).filter(Boolean)));
        let branchMap = {};
        if (siteIds.length) {
          const { data: sites } = await supabaseMarta.from("mh_sites").select("site_id,branch").in("site_id", siteIds);
          for (const s of sites || []) branchMap[s.site_id] = s.branch;
        }

        if (alive) { setBranchBySite(branchMap); setByDate(bucket); }
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
  function selectDate(key) { setSelected(key); }

  const goCreatePlan = () => router.push(`/martahub/m/activities/new?date=${selected}`);
  const isSelectedToday = selected === todayKey;

  const fab = (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: `calc(env(safe-area-inset-bottom,0px) + ${NAV_HEIGHT}px)`, zIndex: 35, pointerEvents: "none" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", position: "relative", height: 0 }}>
        <button onClick={goCreatePlan} aria-label={dayActs.length === 0 ? "Buat Plan" : "Tambah Plan"}
          style={{
            pointerEvents: "auto", position: "absolute", right: 20, bottom: 20,
            display: "flex", alignItems: "center", gap: 7,
            padding: "13px 18px", borderRadius: 999, border: "none", background: BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer",
            boxShadow: "0 8px 20px rgba(17,17,20,0.22)",
          }}>
          <Plus size={16} /> {dayActs.length === 0 ? "Buat Plan" : "Tambah Plan"}
        </button>
      </div>
    </div>
  );

  return (
    <MobileShell active="calendar" fab={fab}>
      {/* Header STICKY - cuma judul, TANPA tombol Buat Plan lagi - sebelumnya
          ada dua tombol "Buat Plan" sekaligus di layar yg sama (satu di
          sini, satu lagi kontekstual di kartu detail tanggal di bawah),
          jadi terasa dobel/berantakan. Sekarang cukup SATU tombol
          kontekstual di kartu detail tanggal - sekalian jelas ke tanggal
          mana plan barunya akan dibuat. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20, maxWidth: 480, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 14px", fontFamily: FF,
        background: "rgba(244,245,247,0.86)", backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
      }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Kalender Aktivitas</div>
      </div>

      <div style={{ padding: "14px 20px 0", fontFamily: FF }}>
        {/* Kartu kalender - navigasi bulan SEKARANG jadi header kartu ini
            sendiri (dulu baris terpisah di luar, mengambang & nambah jarak
            kosong) supaya kalender terasa satu blok yang rapi. */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 18, padding: "12px 12px 14px", boxShadow: "0 4px 14px rgba(17,17,20,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button onClick={() => changeMonth(-1)} style={{ width: 30, height: 30, borderRadius: 9, background: "#F6F7F9", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
              <ChevronLeft size={16} />
            </button>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C" }}>{MONTH_NAMES_FULL[viewMonth]} {viewYear}</div>
            <button onClick={() => changeMonth(1)} style={{ width: 30, height: 30, borderRadius: 9, background: "#F6F7F9", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginTop: 14 }}>
            {DOW.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 800, color: "#B0B0BA", paddingBottom: 6 }}>{d}</div>
            ))}
          </div>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}>
              <Loader2 size={20} color="#ED1C24" style={{ animation: "mspin .9s linear infinite" }} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginTop: 4 }}>
              {cells.map((c) => {
                const acts = byDate[c.key] || [];
                const sel = c.key === selected;
                const isToday = c.key === todayKey;
                return (
                  <button key={c.key} onClick={() => selectDate(c.key)}
                    style={{
                      position: "relative", aspectRatio: "1 / 0.8", borderRadius: 11,
                      border: isToday && !sel ? "1.5px solid #ED1C24" : "1.5px solid transparent",
                      background: sel ? BRAND : "transparent",
                      color: !c.inMonth ? "#D0D0D8" : sel ? "#fff" : "#17181C",
                      fontFamily: FF, fontSize: 12.5, fontWeight: sel ? 800 : 600, cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                      transition: "background 0.15s, color 0.15s",
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

      {/* Detail tanggal terpilih - juga dibungkus 1 kartu, konsisten dgn
          kartu kalender di atasnya. */}
      <div style={{ padding: "14px 20px calc(env(safe-area-inset-bottom,0px) + 24px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            {/* Tanggal terpilih jadi fokus utama (lebih besar) - badge
                "HARI INI" TERPISAH sbg pill kecil berwarna brand (bukan
                menggantikan teks tanggal spt sebelumnya), supaya tetap
                jelas tanggal PERSIS berapa tanpa perlu menghitung sendiri. */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#17181C", letterSpacing: "-0.01em" }}>{fmtDate(selected)}</div>
              {isSelectedToday && (
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, padding: "3px 8px", borderRadius: 999, background: "rgba(237,28,36,0.10)", color: "#ED1C24", whiteSpace: "nowrap" }}>
                  HARI INI
                </span>
              )}
            </div>
            <div style={{ marginTop: 4, fontSize: 11.5, color: "#8A8A96", fontWeight: 600 }}>
              {dayActs.length === 0 ? "Belum ada aktivitas" : `${dayActs.length} aktivitas dijadwalkan`}
            </div>
          </div>
        </div>

        {dayActs.length === 0 ? (
          <div style={{ marginTop: 10, textAlign: "center", padding: "26px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Belum ada plan di tanggal ini</div>
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {dayActs.map((a) => {
              const stage = activityStage(a);
              const timeLabel = fmtTimeLabel(a);
              const branchLabel = branchBySite[a.site_id];
              return (
                <button key={a.id} onClick={() => router.push(`/martahub/m/activities/${a.id}`)}
                  style={{ position: "relative", textAlign: "left", width: "100%", background: "#FFFFFF", border: "1px solid #EDEDF1", borderRadius: 18, padding: "15px 16px", cursor: "pointer", fontFamily: FF, boxShadow: "0 2px 10px rgba(23,24,28,0.04), 0 1px 2px rgba(23,24,28,0.03)" }}>
                  <span style={{
                    position: "absolute", right: 16, bottom: 13,
                    width: 30, height: 30, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E7E7EC",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <ChevronRight size={15} color="#5A5A68" />
                  </span>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.event_name || "-"}</div>
                      <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        {a.brand && (
                          <span style={{
                            flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap",
                            background: BRAND_COLOR[a.brand.toLowerCase()] || "#8A8A96",
                            color: a.brand.toLowerCase() === "tri" ? "#FFFFFF" : "#17181C",
                          }}>
                            {a.brand.toLowerCase() === "tri" ? "3ID" : "IM3"}
                          </span>
                        )}
                        <span style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                          {[branchLabel, a.mc].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: stage.color, background: stage.bg, whiteSpace: "nowrap" }}>
                      {stage.label}
                    </span>
                  </div>

                  <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#5A5A68", fontWeight: 600, paddingRight: 28 }}>
                    <Clock size={12} color="#B0B0BA" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDate(a.plan_date)} · {timeLabel}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

    </MobileShell>
  );
}
