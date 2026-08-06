"use client";
/**
 * CalendarPickerSheet — picker Plan Date berbasis kalender bulanan, padanan
 * `activity_calendar_sheet.dart` (Flutter): grid kalender custom (bukan
 * library), titik status di tanggal yang sudah punya plan (RPC
 * `mh_activity_calendar_for_me`, scoping hierarki server-side sama persis
 * dgn Flutter), dan panel detail aktivitas di tanggal yang dipilih —
 * supaya BME/RGE bisa lihat plan yang SUDAH ada sebelum menambah plan baru
 * di tanggal yang sama.
 *
 * Mendukung 3 mode (sinkron dgn `dateMode` di wizard): single/range/multi.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, Check, Loader2 } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { FF, BRAND } from "./MobileShell";
import { statusMeta, fmtDate } from "./activityUi";

const MONTH_NAMES_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// Prioritas warna titik saat 1 tanggal punya >1 aktivitas — status paling
// "butuh perhatian" menang, SAMA PERSIS dgn `_dotColor()` Flutter.
function dotColorForStatuses(statuses) {
  if (statuses.some((s) => s === "rejected" || s === "revision_needed" || s === "revision_actual")) return "#DC2626";
  if (statuses.some((s) => s === "plan_submitted" || s === "pending_validation")) return "#B45309";
  if (statuses.some((s) => s === "approved")) return "#15803D";
  return "#6B7280"; // draft / lainnya
}

function pad2(n) { return String(n).padStart(2, "0"); }
function toKey(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

/** Ekspansi satu activity ke semua tanggal yang relevan (single/range/multi
 * plan date) — dipakai utk bucket per-hari di kalender. */
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

/**
 * @param {{ mode: 'single'|'range'|'multi', initialDates: string[],
 *   onClose: () => void, onConfirm: (dates: string[]) => void }} props
 */
export default function CalendarPickerSheet({ mode, initialDates, onClose, onConfirm }) {
  const today = new Date();
  const firstSelected = initialDates?.find(Boolean);
  const [viewYear, setViewYear] = useState(firstSelected ? Number(firstSelected.slice(0, 4)) : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(firstSelected ? Number(firstSelected.slice(5, 7)) - 1 : today.getMonth());
  const [picked, setPicked] = useState((initialDates || []).filter(Boolean));
  const [byDate, setByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [detailDate, setDetailDate] = useState(firstSelected || null);

  // Muat aktivitas 6 minggu grid (termasuk ekor bulan sebelum/sesudah) supaya
  // titik status tetap akurat utk sel yg menampilkan tanggal bulan tetangga.
  const gridStart = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startOffset = first.getDay();
    return new Date(viewYear, viewMonth, 1 - startOffset);
  }, [viewYear, viewMonth]);
  const gridEnd = useMemo(() => { const d = new Date(gridStart); d.setDate(d.getDate() + 41); return d; }, [gridStart]);

  useEffect(() => {
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
        for (const a of data || []) {
          for (const key of activityDateKeys(a)) {
            (bucket[key] ||= []).push(a);
          }
        }
        if (alive) setByDate(bucket);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat kalender");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStart.getTime()]);

  const cells = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart); d.setDate(d.getDate() + i);
      arr.push({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), inMonth: d.getMonth() === viewMonth, key: toKey(d.getFullYear(), d.getMonth(), d.getDate()) });
    }
    return arr;
  }, [gridStart, viewMonth]);

  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  function changeMonth(delta) {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setViewMonth(m); setViewYear(y);
  }

  function pickCell(key) {
    setDetailDate(key);
    if (mode === "single") {
      setPicked([key]);
    } else if (mode === "range") {
      if (picked.length !== 1) { setPicked([key]); }
      else {
        const [a] = picked;
        setPicked(a <= key ? [a, key] : [key, a]);
      }
    } else {
      // multi
      setPicked((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key].sort());
    }
  }

  const rangeSet = useMemo(() => {
    if (mode !== "range" || picked.length !== 2) return null;
    const set = new Set();
    let d = new Date(picked[0] + "T00:00:00");
    const end = new Date(picked[1] + "T00:00:00");
    while (d <= end) { set.add(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
    return set;
  }, [mode, picked]);

  const isPicked = (key) => mode === "range" ? (rangeSet ? rangeSet.has(key) : picked.includes(key)) : picked.includes(key);
  const isEndpoint = (key) => mode === "range" && picked.includes(key);

  const detailActs = detailDate ? (byDate[detailDate] || []) : [];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "#F4F5F7", fontFamily: FF, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 14px) 18px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 11, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <X size={16} />
          </button>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Pilih Plan Date</div>
          <div style={{ width: 36 }} />
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
      <div style={{ padding: "16px 14px 0", flex: "0 0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {DOW.map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "#B0B0BA", padding: "4px 0" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginTop: 2 }}>
          {cells.map((c) => {
            const acts = byDate[c.key] || [];
            const sel = isPicked(c.key);
            const endpoint = isEndpoint(c.key);
            const isToday = c.key === todayKey;
            return (
              <button key={c.key} onClick={() => pickCell(c.key)}
                style={{
                  position: "relative", aspectRatio: "1", borderRadius: endpoint ? 12 : (sel && mode === "range" ? 4 : 12),
                  border: isToday && !sel ? "1.5px solid #ED1C24" : "1.5px solid transparent",
                  background: endpoint ? BRAND : sel ? "rgba(237,28,36,0.14)" : "transparent",
                  color: !c.inMonth ? "#D0D0D8" : endpoint ? "#fff" : "#17181C",
                  fontFamily: FF, fontSize: 13, fontWeight: endpoint ? 800 : 600, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                }}>
                <span>{c.d}</span>
                {acts.length > 0 && (
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: endpoint ? "#fff" : dotColorForStatuses(acts.map((a) => a.status)) }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, minHeight: 0, marginTop: 16, background: "#FFFFFF", borderRadius: "20px 20px 0 0", boxShadow: "0 -4px 20px rgba(23,24,28,0.06)", display: "flex", flexDirection: "column" }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 4px", flexShrink: 0 }} />

        <div style={{ padding: "8px 20px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>
            {detailDate ? fmtDate(detailDate) : "Pilih tanggal"}
          </div>
          {mode !== "single" && picked.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>
              {mode === "range"
                ? (picked.length === 2 ? `${fmtDate(picked[0])} – ${fmtDate(picked[1])} · ${rangeSet?.size || 0} hari` : "Pilih tanggal selesai")
                : `${picked.length} tanggal dipilih`}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px 12px" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
              <Loader2 size={18} color="#ED1C24" style={{ animation: "mspin .9s linear infinite" }} />
            </div>
          ) : err ? (
            <div style={{ fontSize: 11.5, color: "#C62828", fontWeight: 600 }}>{err}</div>
          ) : detailActs.length === 0 ? (
            <div style={{ fontSize: 11.5, color: "#B0B0BA", fontWeight: 600, padding: "6px 0" }}>
              Belum ada plan lain di tanggal ini.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {detailActs.map((a) => {
                const meta = statusMeta(a.status);
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 11, background: "#F7F7F9" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.event_name || "—"}</span>
                    <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>{meta.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: "10px 20px calc(env(safe-area-inset-bottom,0px) + 16px)", flexShrink: 0, borderTop: "1px solid #F0F0F3" }}>
          <button onClick={() => onConfirm(picked)} disabled={picked.length === 0 || (mode === "range" && picked.length < 2)}
            style={{
              width: "100%", height: 48, borderRadius: 13, border: "none", fontFamily: FF, fontSize: 13.5, fontWeight: 800, color: "#fff",
              cursor: picked.length === 0 ? "default" : "pointer",
              background: picked.length === 0 || (mode === "range" && picked.length < 2) ? "#D8D9E0" : BRAND,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            <Check size={16} /> Gunakan Tanggal Ini
          </button>
        </div>
      </div>
    </div>
  );
}
