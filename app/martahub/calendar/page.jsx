"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import MartaShell, { T, FONT, brandLabel } from "../components/MartaShell";
import { ActivityDetailModal, deriveStatusInfo } from "../components/ActivityDetail";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope } from "../../../lib/martaScope";

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAY_NAMES_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// Legend warna - dipakai utk chip status di dalam sel kalender & di baris
// legend header. Warna & label SATU sumber kebenaran dgn deriveStatusInfo()
// (diimpor dari ActivityDetail.jsx, sama persis dgn Activity Plan & mobile),
// jadi sel kalender TIDAK LAGI mewarnai berdasar `status` mentah sendiri
// (bug lama: activity plan_submitted yg plan_date-nya sudah lewat tetap
// tampil biru "Plan Diajukan" di grid padahal daftar di bawahnya sudah
// benar menampilkan merah "Menunggu Laporan" - sekarang keduanya konsisten
// krn sama-sama lewat deriveStatusInfo()).
const LEGEND = [
  { label: "Draft", color: T.mid },
  { label: "Terjadwal", color: T.blue },
  { label: "Berlangsung", color: T.warning },
  { label: "Menunggu Laporan", color: T.error },
  { label: "Selesai", color: T.success },
];

function pad(n) { return String(n).padStart(2, "0"); }
function isoDate(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function fmtDayLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DAY_NAMES_FULL[dow]}, ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

export default function CalendarPage() {
  return (
    <MartaShell active="calendar" title="Calendar" subtitle="Jadwal rencana kegiatan per bulan.">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [scope, setScope] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [hoverDay, setHoverDay] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const sc = email ? await getMartaScope(email) : null;
      setScope(sc);
      const start = isoDate(cursor.y, cursor.m, 1);
      const lastDay = new Date(cursor.y, cursor.m + 1, 0).getDate();
      const end = isoDate(cursor.y, cursor.m, lastDay);
      // Visibilitas hierarki penuh §1.1a - scoping SEPENUHNYA di server lewat
      // RPC `mh_activity_calendar_for_email` (pola sama dgn Geo Compliance),
      // BUKAN lagi `applyMartaScope` (yang cuma tahu region×brand, tidak tahu
      // konsep subtree TL DSF/DSF/MD di bawah BME/RGE - lihat §4). Head/TMV
      // sudah benar semula lewat applyMartaScope; RPC ini meneruskan aturan
      // yang sama untuk mereka SEKALIGUS menambah subtree utk BME/RGE/TL DSF.
      if (!email) { setRows([]); setSelected(null); return; }
      const { data, error } = await supabaseMarta.rpc("mh_activity_calendar_for_email", {
        p_caller_email: email,
        p_period_start: start,
        p_period_end: end,
      });
      if (error) throw new Error(error.message);
      setRows(data || []);
      setSelected(null);
    } catch (e) { setErr(e.message || "Gagal memuat"); }
    finally { setLoading(false); }
  }, [email, cursor.y, cursor.m]);
  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const d = (r.plan_date || "").slice(0, 10);
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(r);
    }
    return m;
  }, [rows]);

  // Ringkasan status bulan ini (dipakai di strip legend/stat header) -
  // dihitung dari deriveStatusInfo() per baris supaya angkanya SELALU
  // sinkron dgn warna/label yg dipakai di grid & panel hari terpilih.
  const monthStats = useMemo(() => {
    const byColor = new Map();
    for (const r of rows) {
      const [, color] = deriveStatusInfo(r);
      byColor.set(color, (byColor.get(color) || 0) + 1);
    }
    return LEGEND.map((l) => ({ ...l, count: byColor.get(l.color) || 0 }));
  }, [rows]);

  const firstDow = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const todayISO = new Date().toISOString().slice(0, 10);
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedEvents = selected ? (byDay.get(selected) || []) : [];

  return (
    <div style={{ minWidth: 0, maxWidth: "100%", overflowX: "hidden" }}>
      {!MARTA_CONFIGURED && <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>Supabase MartaHub belum dikonfigurasi / project paused.</div>}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      {/* Header - navigasi bulan (kiri), lalu strip legend/stat status
          bulan ini (kanan), scope badge menyusul kalau ada. Sebelumnya
          cuma ada teks "N kegiatan bulan ini" polos - sekarang breakdown
          per status ikut ditampilkan (angka + dot warna), jadi user bisa
          langsung lihat berapa yg masih "Menunggu Laporan" dst tanpa harus
          klik satu-satu hari. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="mh-btn" onClick={() => setCursor((c) => { const d = new Date(c.y, c.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
            style={navBtn} aria-label="Bulan sebelumnya">‹</button>
          <div style={{ fontSize: 17, fontWeight: 800, minWidth: 168, textAlign: "center", color: T.hi }}>{MONTH_NAMES[cursor.m]} {cursor.y}</div>
          <button className="mh-btn" onClick={() => setCursor((c) => { const d = new Date(c.y, c.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
            style={navBtn} aria-label="Bulan berikutnya">›</button>
          <button className="mh-btn" onClick={() => { const n = new Date(); setCursor({ y: n.getFullYear(), m: n.getMonth() }); }}
            style={{ ...navBtn, width: "auto", padding: "0 14px", fontSize: 12, fontWeight: 700 }}>Hari ini</button>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {monthStats.map((s) => (
              <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.mid, fontWeight: 700 }}>
                <i style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, display: "inline-block", flexShrink: 0 }} />
                {s.label} <b style={{ color: T.hi }}>{s.count}</b>
              </span>
            ))}
          </div>
          {scope && !scope.unscoped && scope.found && (
            <span style={{ fontSize: 11, fontWeight: 700, color: T.mid, background: "#F0F4FA", border: `1px solid ${T.line}`, borderRadius: 100, padding: "3px 10px", whiteSpace: "nowrap" }}>
              Scope: {scope.region || "-"} · {brandLabel(scope.brand)}
            </span>
          )}
        </div>
      </div>

      <div style={{ ...card, padding: 16, boxShadow: "0 1px 3px rgba(16,24,40,0.04)", minWidth: 0, boxSizing: "border-box" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 8, marginBottom: 8, width: "100%", boxSizing: "border-box" }}>
          {DOW.map((d, i) => (
            <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: (i === 0 || i === 6) ? T.primary : T.lo, textTransform: "uppercase", padding: "4px 0", letterSpacing: "0.03em" }}>{d}</div>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: 56, textAlign: "center", color: T.lo, fontSize: 13 }}>
            <div className="mh-ad-skel" style={{ height: 320, borderRadius: 10 }} />
            <style>{"@keyframes mh-cal-pulse{0%,100%{opacity:.55}50%{opacity:1}}"}</style>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 8, width: "100%", boxSizing: "border-box" }}>
            {cells.map((d, i) => {
              if (d === null) return <div key={i} style={{ minHeight: 100, minWidth: 0, borderRadius: 10, background: "#FAFBFD" }} />;
              const iso = isoDate(cursor.y, cursor.m, d);
              const events = byDay.get(iso) || [];
              const isToday = iso === todayISO;
              const isSel = iso === selected;
              const isWeekend = i % 7 === 0 || i % 7 === 6;
              const isHover = hoverDay === iso;
              const visible = events.slice(0, 3);
              const restCount = events.length - visible.length;
              return (
                <div key={i} onClick={() => setSelected(events.length ? iso : null)}
                  onMouseEnter={() => setHoverDay(iso)} onMouseLeave={() => setHoverDay((h) => (h === iso ? null : h))}
                  style={{
                    minHeight: 100, minWidth: 0, borderRadius: 10, padding: "8px 8px", cursor: events.length ? "pointer" : "default",
                    display: "flex", flexDirection: "column", gap: 3, overflow: "hidden",
                    border: `1.5px solid ${isSel ? T.primary : isToday ? T.primaryBd : T.line}`,
                    background: isSel ? T.primaryBg : isWeekend ? "#FAFBFD" : "#fff",
                    boxShadow: isHover && events.length ? "0 4px 12px rgba(16,24,40,0.08)" : "none",
                    transition: "box-shadow .15s ease, border-color .15s ease",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {isToday ? (
                      <span style={{ width: 20, height: 20, borderRadius: "50%", background: T.primary, color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{d}</span>
                    ) : (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: isWeekend ? T.primary : T.mid, padding: "0 2px" }}>{d}</span>
                    )}
                    {events.length > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: T.lo }}>{events.length}</span>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {visible.map((e) => {
                      const [, color] = deriveStatusInfo(e);
                      return (
                        <div key={e.id} title={e.event_name} style={{
                          fontSize: 9.5, fontWeight: 700, color: T.hi, background: `${color}14`,
                          borderLeft: `3px solid ${color}`, borderRadius: 4, padding: "2px 6px",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {e.event_name || "Kegiatan"}
                        </div>
                      );
                    })}
                    {restCount > 0 && (
                      <div style={{ fontSize: 9.5, color: T.lo, fontWeight: 800, padding: "0 2px" }}>+{restCount} lagi</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ ...card, marginTop: 14, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: T.hi }}>{fmtDayLong(selected)}</div>
              <div style={{ fontSize: 11.5, color: T.lo, fontWeight: 700, marginTop: 1 }}>{selectedEvents.length} kegiatan</div>
            </div>
            <button className="mh-btn" onClick={() => setSelected(null)} aria-label="Tutup"
              style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", color: T.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
          </div>
          <div>
            {selectedEvents.map((e) => {
              const [label, color] = deriveStatusInfo(e);
              const isTri = String(e.brand || "").toLowerCase() === "tri";
              return (
                <div key={e.id} onClick={() => setDetailId(e.id)}
                  style={{ padding: "11px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                  onMouseEnter={(ev) => { ev.currentTarget.style.background = "#F7F9FC"; }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: color || T.mid, borderRadius: 999, padding: "3px 10px", flexShrink: 0 }}>{label}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: T.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.event_name || "-"}</span>
                  <span style={{ color: T.lo, fontSize: 12, flexShrink: 0 }}>{e.mc || "-"} · {e.site_id || "-"}</span>
                  {e.brand && (
                    <span style={{
                      marginLeft: "auto", fontSize: 10.5, fontWeight: 800, flexShrink: 0,
                      color: isTri ? T.tri : T.im3, background: isTri ? `${T.tri}14` : `${T.im3}14`,
                      borderRadius: 6, padding: "2px 8px",
                    }}>{brandLabel(e.brand)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {detailId && (
        <ActivityDetailModal id={detailId} onClose={() => setDetailId(null)} email={email}
          canDelete={scope?.role === "spm_sumatera"}
          canMarkRevision={["admin", "head", "tmv", "spm_sumatera"].includes(scope?.role)}
          onRevised={() => load()}
          onDeleted={() => { setDetailId(null); load(); }} />
      )}
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const navBtn = { width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT };
