"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import MartaShell, { T, FONT } from "../components/MartaShell";
import supabaseMarta, { MARTA_CONFIGURED } from "../../../lib/supabaseMarta";
import { getMartaScope } from "../../../lib/martaScope";

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const STATUS_COLOR = {
  draft: T.mid, submitted: T.warning, approved: T.success, rejected: T.error,
  completed: T.success, inProgress: T.warning,
};

function pad(n) { return String(n).padStart(2, "0"); }
function isoDate(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

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

  const firstDow = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const todayISO = new Date().toISOString().slice(0, 10);
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedEvents = selected ? (byDay.get(selected) || []) : [];

  return (
    <div>
      {!MARTA_CONFIGURED && <div style={{ ...card, borderColor: T.warning, background: T.warningBg, color: "#7a5b00", marginBottom: 16 }}>Supabase MartaHub belum dikonfigurasi / project paused.</div>}
      {err && <div style={{ ...card, borderColor: T.error, background: T.errorBg, color: T.error, marginBottom: 16 }}>{err}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="mh-btn" onClick={() => setCursor((c) => { const d = new Date(c.y, c.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
          style={{ ...navBtn }}>‹</button>
        <div style={{ fontSize: 16, fontWeight: 800, minWidth: 160, textAlign: "center" }}>{MONTH_NAMES[cursor.m]} {cursor.y}</div>
        <button className="mh-btn" onClick={() => setCursor((c) => { const d = new Date(c.y, c.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}
          style={{ ...navBtn }}>›</button>
        <button className="mh-btn" onClick={() => { const n = new Date(); setCursor({ y: n.getFullYear(), m: n.getMonth() }); }}
          style={{ ...navBtn, width: "auto", padding: "0 14px", fontSize: 12, fontWeight: 700 }}>Hari ini</button>
        <div style={{ marginLeft: "auto", fontSize: 12.5, color: T.mid }}>{rows.length} kegiatan bulan ini</div>
        {scope && !scope.unscoped && scope.found && (
          <span style={{ fontSize: 11, fontWeight: 700, color: T.mid, background: "#F0F4FA", border: `1px solid ${T.line}`, borderRadius: 100, padding: "3px 10px" }}>
            Scope: {scope.region || "-"} · {(scope.brand || "-").toUpperCase()}
          </span>
        )}
      </div>

      <div style={{ ...card, padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
          {DOW.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: T.lo, textTransform: "uppercase", padding: "4px 0" }}>{d}</div>)}
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: T.lo, fontSize: 13 }}>Memuat…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const iso = isoDate(cursor.y, cursor.m, d);
              const events = byDay.get(iso) || [];
              const isToday = iso === todayISO;
              const isSel = iso === selected;
              return (
                <div key={i} onClick={() => setSelected(events.length ? iso : null)}
                  style={{
                    minHeight: 72, borderRadius: 8, padding: "6px 6px", cursor: events.length ? "pointer" : "default",
                    border: `1.5px solid ${isSel ? T.primary : isToday ? T.primaryBd : T.line}`,
                    background: isSel ? T.primaryBg : isToday ? "#FFFBF5" : "#fff",
                  }}>
                  <div style={{ fontSize: 11.5, fontWeight: isToday ? 800 : 600, color: isToday ? T.primary : T.mid, marginBottom: 4 }}>{d}</div>
                  {events.slice(0, 2).map((e) => (
                    <div key={e.id} title={e.event_name} style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", background: STATUS_COLOR[e.status] || T.mid, borderRadius: 4, padding: "1px 5px", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.event_name || "Kegiatan"}
                    </div>
                  ))}
                  {events.length > 2 && <div style={{ fontSize: 9.5, color: T.lo, fontWeight: 700 }}>+{events.length - 2} lagi</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ ...card, marginTop: 14, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontWeight: 800, fontSize: 13.5 }}>Kegiatan {selected}</div>
          <div>
            {selectedEvents.map((e) => (
              <div key={e.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: STATUS_COLOR[e.status] || T.mid, borderRadius: 999, padding: "2px 9px" }}>{e.status || "draft"}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{e.event_name || "-"}</span>
                <span style={{ color: T.mid, fontSize: 12 }}>{e.mc || "-"} · {e.site_id || "-"}</span>
                {e.brand && <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: e.brand === "tri" ? T.tri : T.im3 }}>{e.brand === "tri" ? "3ID" : "IM3"}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, fontSize: 13 };
const navBtn = { width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT };
