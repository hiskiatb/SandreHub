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
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Loader2 } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, FF, BRAND, NAV_HEIGHT } from "../_shared/MobileShell";
// MonthYearPickerSheet dipakai ulang persis dari wizard Buat Plan (kalender
// di sana yg jadi acuan tampilan "persis seperti ini") - drpd duplikasi
// komponen wheel bulan/tahun di dua tempat.
import { MonthYearPickerSheet } from "../_shared/CalendarPickerSheet";
import { activityStage, fmtDate } from "../_shared/activityUi";

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

/** Jam mulai/selesai activity `a` KHUSUS di tanggal `dateKey` (bukan jam
 * global activity) - dipakai utk mengurutkan & menampilkan kartu jadwal
 * tanggal terpilih spy activity yang jamnya lebih pagi tampil lebih dulu,
 * konsisten dgn logic per-tanggal yg sama dipakai di
 * CalendarPickerSheet.jsx (otherActTimeLabel). */
function dayTimeInfo(a, dateKey) {
  let perDate = null;
  if (dateKey && a.plan_date_times) {
    try {
      const map = typeof a.plan_date_times === "string" ? JSON.parse(a.plan_date_times) : a.plan_date_times;
      perDate = map?.[dateKey] || null;
    } catch { /* biarkan null, fallback di bawah */ }
  }
  const isAllDay = perDate ? !!perDate.is_all_day : a.is_all_day !== false;
  const st = (perDate?.start_time || a.start_time || "").slice(0, 5);
  const et = (perDate?.end_time || a.end_time || "").slice(0, 5);
  if (isAllDay || !st || !et) return { isAllDay: true, start: null, end: null, sortKey: 24 * 60 };
  const [h, m] = st.split(":").map(Number);
  return { isAllDay: false, start: st.replace(":", "."), end: et.replace(":", "."), sortKey: h * 60 + (m || 0) };
}
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
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

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

  // Diurutkan berdasarkan jam mulai di tanggal terpilih (spy kartu-kartu ini
  // KELIHATAN spt jadwal/timeline sungguhan, bukan cuma daftar acak) -
  // activity "Seharian"/tanpa jam ditaruh PALING BAWAH krn tidak punya slot
  // waktu spesifik utk dijadikan acuan urutan.
  const dayActs = useMemo(
    () => [...(byDate[selected] || [])].sort((a, b) => dayTimeInfo(a, selected).sortKey - dayTimeInfo(b, selected).sortKey),
    [byDate, selected]
  );
  function selectDate(key) { setSelected(key); }

  const goCreatePlan = () => router.push(`/martahub/m/activities/new?date=${selected}`);
  const isSelectedToday = selected === todayKey;

  const fab = (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: `calc(env(safe-area-inset-bottom,0px) + ${NAV_HEIGHT}px)`, zIndex: 35, pointerEvents: "none" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", position: "relative", height: 0 }}>
        <button onClick={goCreatePlan} aria-label={dayActs.length === 0 ? "Buat Plan" : "Tambah Plan"}
          style={{
            pointerEvents: "auto", position: "absolute", right: 10, bottom: 10,
            display: "flex", alignItems: "center", gap: 7,
            // Gaya SAMA PERSIS dgn FAB "Buat Plan" di menu Aktivitas
            // (activities/page.jsx) - rim tipis semi-transparan + glossy
            // highlight inset + shadow netral dua lapis (bukan glow warna),
            // supaya konsisten di semua tempat FAB ini muncul.
            padding: "13px 20px", borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.55)",
            background: BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer",
            boxShadow: [
              "0 1px 0 rgba(255,255,255,0.45) inset",
              "0 -6px 10px rgba(0,0,0,0.12) inset",
              "0 3px 8px rgba(17,17,20,0.20)",
              "0 16px 36px rgba(17,17,20,0.24)",
            ].join(", "),
          }}>
          <Plus size={16} strokeWidth={2.75} /> {dayActs.length === 0 ? "Buat Plan" : "Tambah Plan"}
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
          {/* Header bulan/tahun - dibuat PERSIS spt di kalender wizard Buat
              Plan (_shared/CalendarPickerSheet.jsx): satu kapsul abu2
              menyatu isinya panah prev/next bulat putih + label bulan-tahun
              yg diketuk utk buka MonthYearPickerSheet (bkn cuma teks statis
              lagi), drpd 3 elemen lepas rata kiri-tengah-kanan spt
              sebelumnya. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 0 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2, background: "#F1F2F5", borderRadius: 999, padding: 4 }}>
              <button onClick={() => changeMonth(-1)}
                style={{ width: 32, height: 32, borderRadius: "50%", background: "#FFFFFF", border: "none", boxShadow: "0 1px 4px rgba(23,24,28,0.10)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#3A3A44" }}>
                <ChevronLeft size={16} strokeWidth={2.5} />
              </button>
              <button onClick={() => setMonthPickerOpen(true)}
                style={{ minWidth: 158, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: "none", border: "none", padding: "4px 6px", borderRadius: 8, cursor: "pointer" }}>
                <span style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: "#17181C", letterSpacing: -0.3 }}>
                  {MONTH_NAMES_FULL[viewMonth]} <span style={{ color: "#A9A9B4", fontWeight: 700 }}>{viewYear}</span>
                </span>
                <ChevronDown size={14} strokeWidth={2.5} color="#A9A9B4" />
              </button>
              <button onClick={() => changeMonth(1)}
                style={{ width: 32, height: 32, borderRadius: "50%", background: "#FFFFFF", border: "none", boxShadow: "0 1px 4px rgba(23,24,28,0.10)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#3A3A44" }}>
                <ChevronRight size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {DOW.map((d, i) => {
              const isTodayCol = i === today.getDay();
              return (
                <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: isTodayCol ? "#17181C" : "#B0B0BA", padding: "4px 0" }}>{d}</div>
              );
            })}
          </div>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}>
              <Loader2 size={20} color="#ED1C24" style={{ animation: "mspin .9s linear infinite" }} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginTop: 4 }}>
              {/* Sel tanggal PERSIS spt kalender wizard Buat Plan: lingkaran
                  penuh, SEMUA tanggal (bukan cuma yg terpilih) dikasih
                  latar lingkaran abu2 lembut, tanggal yg ada aktivitas
                  ditandai krem (bukan lagi dot kecil terpisah) - satu
                  bahasa visual yg sama dgn kalender pemilihan Plan Date,
                  bukan cuma bentuknya doang yg mirip. Ketuk tanggal di sini
                  TETAP cuma pilih tanggal & tampilkan detail aktivitasnya
                  di bawah (bukan langsung buat plan) - "Buat/Tambah Plan"
                  tetap lewat FAB terpisah spt sebelumnya. */}
              {cells.map((c) => {
                const acts = byDate[c.key] || [];
                const sel = c.key === selected;
                const isToday = c.key === todayKey;
                const hasPlan = acts.length > 0;
                const bg = sel ? BRAND : hasPlan ? "#FCEFC7" : c.inMonth ? "#F1F2F5" : "#F8F8FA";
                return (
                  <button key={c.key} onClick={() => selectDate(c.key)}
                    style={{
                      position: "relative", aspectRatio: "1", borderRadius: "50%",
                      border: isToday && !sel ? "1.5px solid #ED1C24" : "1.5px solid transparent",
                      background: bg,
                      boxShadow: sel ? "0 4px 10px rgba(237,28,36,0.30)" : "none",
                      color: !c.inMonth ? "#C7C7D0" : sel ? "#fff" : hasPlan ? "#8A6D1D" : "#4A4A54",
                      fontFamily: FF, fontSize: 13, fontWeight: sel || hasPlan || isToday ? 800 : 600, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "background 0.15s, color 0.15s",
                    }}>
                    {c.d}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {monthPickerOpen && (
          <MonthYearPickerSheet
            initialMonth={viewMonth}
            initialYear={viewYear}
            minYear={2020}
            minMonth={0}
            onConfirm={(y, m) => { setViewYear(y); setViewMonth(m); }}
            onClose={() => setMonthPickerOpen(false)}
          />
        )}
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
          // Timeline jadwal - kolom jam di kiri (jam mulai tebal, jam
          // selesai kecil di bawahnya, "Seharian" kalau tidak ada jam
          // spesifik) + garis vertikal bertitik yang menyambung antar
          // kartu, spy sekilas kelihatan "ini rangkaian jadwal hari itu"
          // persis spt tampilan agenda/kalender pada umumnya - bukan cuma
          // daftar kartu lepas berurutan.
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {dayActs.map((a, i) => {
              const stage = activityStage(a);
              const t = dayTimeInfo(a, selected);
              const branchLabel = branchBySite[a.site_id];
              const isLast = i === dayActs.length - 1;
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                  <div style={{ flexShrink: 0, width: 40, textAlign: "right", paddingTop: 3 }}>
                    {t.isAllDay ? (
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#8A8A96" }}>Seharian</div>
                    ) : (
                      <>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C", fontVariantNumeric: "tabular-nums" }}>{t.start}</div>
                        <div style={{ marginTop: 1, fontSize: 9.5, fontWeight: 700, color: "#B0B0BA", fontVariantNumeric: "tabular-nums" }}>{t.end}</div>
                      </>
                    )}
                  </div>

                  <div style={{ position: "relative", width: 14, flexShrink: 0 }}>
                    {!isLast && (
                      <div style={{ position: "absolute", left: "50%", top: 14, bottom: -10, width: 2, background: "#ECEDF0", transform: "translateX(-50%)" }} />
                    )}
                    <div style={{ position: "absolute", left: "50%", top: 10, width: 9, height: 9, borderRadius: "50%", background: stage.color, border: "2px solid #FFFFFF", boxShadow: "0 0 0 1px #ECEDF0", transform: "translateX(-50%)" }} />
                  </div>

                  <button onClick={() => router.push(`/martahub/m/activities/${a.id}`)}
                    style={{ position: "relative", textAlign: "left", flex: 1, minWidth: 0, background: "#FFFFFF", border: "1px solid #EDEDF1", borderRadius: 18, padding: "13px 16px", cursor: "pointer", fontFamily: FF, boxShadow: "0 2px 10px rgba(23,24,28,0.04), 0 1px 2px rgba(23,24,28,0.03)" }}>
                    <span style={{
                      position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                      width: 26, height: 26, borderRadius: 9, background: "#FFFFFF", border: "1px solid #E7E7EC",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <ChevronRight size={14} color="#5A5A68" />
                    </span>
                    <div style={{ paddingRight: 30 }}>
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
                      <div style={{ marginTop: 7 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: stage.color, background: stage.bg, whiteSpace: "nowrap" }}>
                          {stage.label}
                        </span>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </MobileShell>
  );
}
