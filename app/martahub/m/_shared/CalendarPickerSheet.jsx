"use client";
/**
 * CalendarPickerSheet - picker Plan Date berbasis kalender bulanan, padanan
 * `activity_calendar_sheet.dart` (Flutter): grid kalender custom (bukan
 * library), titik status di tanggal yang sudah punya plan (RPC
 * `mh_activity_calendar_for_me`, scoping hierarki server-side sama persis
 * dgn Flutter, dipakai jg utk titik warna "sudah ada plan" di grid).
 *
 * TIDAK ADA LAGI mode Tunggal/Rentang/Beberapa yang harus dipilih manual -
 * pengguna TINGGAL TAP tanggal, seperti kalender kebanyakan (Google/Apple
 * Calendar). Logikanya otomatis lewat `groupContiguousDates()`
 * (_shared/planData.js): tanggal-tanggal yang BERDEKATAN otomatis
 * digambar & disimpan sebagai satu rentang menyambung, sedangkan tanggal
 * yang terpisah tetap jadi titik-titik individual. Tap tanggal yang sudah
 * terpilih untuk membatalkannya.
 *
 * Waktu SEKARANG WAJIB DIATUR PER TANGGAL, bukan satu waktu global utk semua
 * tanggal terpilih. Begitu >1 tanggal dipilih, di bawah grid langsung
 * muncul daftar (list ke bawah) - satu baris per tanggal terpilih, masing-
 * masing wajib diisi (Seharian, atau rentang jam via roda pemutar gaya
 * iOS). Ini supaya kalau BME/RGE berbeda punya beberapa activity plan di
 * tanggal yang sama, sisi TMV yang melihat kalender gabungan bisa
 * mengurutkan activity² tsb berdasarkan jam mulainya masing-masing -
 * rapi & tidak ambigu. Lihat `planData.js`: `syncTimesByDate()`,
 * `allDateTimesValid()`, `planTimeFields()`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, Check, Loader2 } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { FF, BRAND } from "./MobileShell";
import { fmtDate } from "./activityUi";
import { groupContiguousDates, syncTimesByDate, allDateTimesValid, DEFAULT_DATE_TIME } from "./planData";

const MONTH_NAMES_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const DOW_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
// MartaHub mobile mulai Agustus 2026 - kalender ini tidak perlu bisa mundur
// ke bulan sebelum itu (dipakai jg oleh page.jsx Home, disamakan di sana).
const LAUNCH_YEAR = 2026, LAUNCH_MONTH = 7;

// Prioritas warna titik saat 1 tanggal punya >1 aktivitas - status paling
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
 * plan date) - dipakai utk bucket per-hari di kalender (titik status). */
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

function shortDateLabel(key) {
  const d = new Date(key + "T00:00:00");
  return `${DOW_FULL[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MONTH_NAMES_FULL[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

/**
 * @param {{ initialDates: string[], initialTimesByDate?: Record<string,{isAllDay:boolean,startTime:string,endTime:string}>,
 *   onClose: () => void,
 *   onConfirm: (dates: string[], timesByDate: Record<string,{isAllDay:boolean,startTime:string,endTime:string}>) => void }} props
 */
export default function CalendarPickerSheet({ initialDates, initialTimesByDate, onClose, onConfirm }) {
  const today = new Date();
  const firstSelected = initialDates?.find(Boolean);
  const [viewYear, setViewYear] = useState(firstSelected ? Number(firstSelected.slice(0, 4)) : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(firstSelected ? Number(firstSelected.slice(5, 7)) - 1 : today.getMonth());
  const [picked, setPicked] = useState((initialDates || []).filter(Boolean));
  const [byDate, setByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Waktu PER TANGGAL - wajib terisi utk setiap tanggal terpilih, disinkron
  // otomatis tiap kali `picked` berubah (tanggal baru → default Seharian,
  // tanggal dibatalkan → dibuang dari peta).
  const [timesByDate, setTimesByDate] = useState(() => syncTimesByDate(picked, initialTimesByDate));
  useEffect(() => {
    setTimesByDate((prev) => syncTimesByDate(picked, prev));
  }, [picked]);
  // Baris tanggal mana + field jam mana (mulai/selesai) yg sedang membuka
  // roda pemutar - hanya satu yg terbuka sekaligus, gaya iOS date picker.
  const [editing, setEditing] = useState(null); // { date, field: 'start'|'end' } | null

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

  // MartaHub mobile mulai dipakai Agustus 2026 - jangan biarkan pengguna
  // mundur ke bulan sebelum itu (tidak ada plan yg mungkin ada di sana).
  const atLaunchMonth = viewYear === LAUNCH_YEAR && viewMonth === LAUNCH_MONTH;

  function changeMonth(delta) {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    if (y < LAUNCH_YEAR || (y === LAUNCH_YEAR && m < LAUNCH_MONTH)) return;
    setViewMonth(m); setViewYear(y);
  }

  // Tap tanggal → toggle pilih/batal, SAMA seperti kalender kebanyakan. Tidak
  // ada mode apa pun - grup rentang terbentuk otomatis dari keterdekatan.
  function pickCell(key) {
    setPicked((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key].sort());
  }

  function patchTime(date, patch) {
    setTimesByDate((prev) => ({ ...prev, [date]: { ...(prev[date] || DEFAULT_DATE_TIME), ...patch } }));
  }

  // Grup tanggal terpilih yang berdekatan → dipakai utk gaya visual "pil
  // menyambung" pada rentang, dan ringkasan di panel bawah.
  const groups = useMemo(() => groupContiguousDates(picked), [picked]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const sortedPicked = useMemo(() => [...picked].sort(), [picked]);

  // Posisi tiap tanggal terpilih dalam grupnya (start/mid/end/solo) - dipakai
  // utk gaya "pil" kalender: ujung bulat, tengah menyambung datar.
  const cellRole = useMemo(() => {
    const roles = {};
    for (const g of groups) {
      if (g.length === 1) { roles[g[0]] = "solo"; continue; }
      g.forEach((key, i) => {
        roles[key] = i === 0 ? "start" : i === g.length - 1 ? "end" : "mid";
      });
    }
    return roles;
  }, [groups]);

  const summary = useMemo(() => {
    if (picked.length === 0) return null;
    if (groups.length === 1) {
      const g = groups[0];
      return g.length === 1 ? fmtDate(g[0]) : `${fmtDate(g[0])} – ${fmtDate(g[g.length - 1])} · ${g.length} hari`;
    }
    return `${groups.length} rentang · ${picked.length} hari terpilih`;
  }, [picked, groups]);

  const allValid = allDateTimesValid(picked, timesByDate);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "#F4F5F7", fontFamily: FF, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 14px) 18px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 11, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <X size={16} />
          </button>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Pilih Plan Date</div>
          <div style={{ width: 36 }} />
        </div>
        <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>
          Ketuk tanggal utk memilih - berdekatan otomatis jadi rentang
        </div>

        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
          <button onClick={() => changeMonth(-1)} disabled={atLaunchMonth}
            style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: atLaunchMonth ? "default" : "pointer", color: atLaunchMonth ? "#D8D9E0" : "#5A5A68" }}>
            <ChevronLeft size={17} />
          </button>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>{MONTH_NAMES_FULL[viewMonth]} {viewYear}</div>
          <button onClick={() => changeMonth(1)} style={{ width: 34, height: 34, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: "16px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {DOW.map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "#B0B0BA", padding: "4px 0" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginTop: 2 }}>
          {cells.map((c) => {
            const acts = byDate[c.key] || [];
            const sel = pickedSet.has(c.key);
            const role = cellRole[c.key];
            const isToday = c.key === todayKey;
            // Pil menyambung: ujung awal/akhir bulat, tengah datar - kesan
            // "rentang" yang jelas walau tidak ada mode Rentang eksplisit.
            const radius = role === "mid" ? "0" : role === "start" ? "12px 4px 4px 12px" : role === "end" ? "4px 12px 12px 4px" : "12px";
            return (
              <button key={c.key} onClick={() => pickCell(c.key)}
                style={{
                  position: "relative", aspectRatio: "1", borderRadius: radius,
                  border: isToday && !sel ? "1.5px solid #ED1C24" : "1.5px solid transparent",
                  background: sel ? (role === "solo" ? BRAND : role === "mid" ? "rgba(237,28,36,0.16)" : BRAND) : "transparent",
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
        {picked.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#B45309" }} />
            <span style={{ fontSize: 10, color: "#8A8A96", fontWeight: 600 }}>Titik = sudah ada plan lain (punya siapa pun) di tanggal itu</span>
          </div>
        )}
      </div>

      {/* Daftar waktu per tanggal - MUNCUL LANGSUNG begini tanggal dipilih,
          menjadi list ke bawah, satu baris wajib per tanggal. Inilah yang
          dipakai sisi TMV nanti utk mengurutkan activity yang jatuh di
          tanggal sama dari beberapa BME/RGE berbeda. */}
      <div style={{ flex: 1, minHeight: 0, marginTop: 14, background: "#FFFFFF", borderRadius: "20px 20px 0 0", boxShadow: "0 -4px 20px rgba(23,24,28,0.06)", display: "flex", flexDirection: "column" }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "10px auto 4px", flexShrink: 0 }} />

        <div style={{ padding: "6px 20px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>
            {picked.length === 0 ? "Pilih tanggal dulu" : `Atur Waktu · ${picked.length} tanggal`}
          </div>
          {summary && <div style={{ marginTop: 2, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{summary}</div>}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px 12px" }}>
          {picked.length === 0 ? (
            <div style={{ fontSize: 11.5, color: "#B0B0BA", fontWeight: 600, padding: "24px 0", textAlign: "center" }}>
              Ketuk satu atau beberapa tanggal di kalender di atas.
            </div>
          ) : loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
              <Loader2 size={18} color="#ED1C24" style={{ animation: "mspin .9s linear infinite" }} />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sortedPicked.map((date) => (
                <DateTimeRow key={date}
                  date={date}
                  time={timesByDate[date] || DEFAULT_DATE_TIME}
                  otherCount={(byDate[date] || []).length}
                  editingField={editing?.date === date ? editing.field : null}
                  onToggleAllDay={(v) => { patchTime(date, { isAllDay: v }); setEditing(null); }}
                  onOpenField={(field) => setEditing((prev) => (prev?.date === date && prev.field === field) ? null : { date, field })}
                  onChangeStart={(v) => patchTime(date, { startTime: v })}
                  onChangeEnd={(v) => patchTime(date, { endTime: v })}
                />
              ))}
            </div>
          )}
          {err && <div style={{ marginTop: 10, fontSize: 11.5, color: "#C62828", fontWeight: 600 }}>{err}</div>}
        </div>

        <div style={{ padding: "10px 20px calc(env(safe-area-inset-bottom,0px) + 16px)", flexShrink: 0, borderTop: "1px solid #F0F0F3" }}>
          <button onClick={() => onConfirm(picked, timesByDate)} disabled={picked.length === 0 || !allValid}
            style={{
              width: "100%", height: 48, borderRadius: 13, border: "none", fontFamily: FF, fontSize: 13.5, fontWeight: 800, color: "#fff",
              cursor: (picked.length === 0 || !allValid) ? "default" : "pointer",
              background: (picked.length === 0 || !allValid) ? "#D8D9E0" : BRAND,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            <Check size={16} /> {picked.length > 1 ? "Gunakan Semua Tanggal & Waktu" : "Gunakan Tanggal & Waktu Ini"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════ Waktu per tanggal - satu baris compact ═══════════════

/** Satu baris = satu tanggal terpilih: label tanggal, toggle Seharian, dan
 * (kalau bukan seharian) pil Mulai/Berakhir yang membuka roda pemutar jam
 * gaya iOS PERSIS di bawah baris itu sendiri saat diketuk. Wajib diisi -
 * defaultnya Seharian supaya tetap valid tanpa harus disentuh, tapi begitu
 * pengguna pilih Rentang Jam, start<end jadi syarat. */
function DateTimeRow({ date, time, otherCount, editingField, onToggleAllDay, onOpenField, onChangeStart, onChangeEnd }) {
  const invalid = !time.isAllDay && (!time.startTime || !time.endTime || time.startTime >= time.endTime);
  return (
    <div style={{ border: `1.5px solid ${invalid ? "#F3C6C6" : "#ECEDF0"}`, borderRadius: 14, overflow: "hidden", background: "#FBFBFC" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 13px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{shortDateLabel(date)}</div>
          {otherCount > 0 && (
            <div style={{ marginTop: 2, fontSize: 10, color: "#B45309", fontWeight: 700 }}>{otherCount} plan lain sudah ada di tanggal ini</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8A8A96" }}>Seharian</span>
          <ToggleSwitch checked={time.isAllDay} onChange={onToggleAllDay} />
        </div>
      </div>

      {!time.isAllDay && (
        <div style={{ padding: "0 13px 12px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <button onClick={() => onOpenField("start")} style={{ flex: 1, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Mulai</div>
              <TimePill text={time.startTime.replace(":", ".")} active={editingField === "start"} />
            </button>
            {/* Simbol penghubung - disejajarkan ke tengah tinggi pil jam
                (bukan tengah seluruh kolom termasuk label) lewat
                alignItems:"flex-end" di baris + marginBottom setengah tinggi
                pil, supaya selalu pas walau ukuran font berubah. */}
            <div style={{ width: 10, height: 1.5, borderRadius: 1, background: "#D8D9E0", marginBottom: 13, flexShrink: 0 }} />
            <button onClick={() => onOpenField("end")} style={{ flex: 1, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Berakhir</div>
              <TimePill text={time.endTime.replace(":", ".")} active={editingField === "end"} danger={invalid} />
            </button>
          </div>
          {editingField === "start" && <WheelPicker value={time.startTime} onChange={onChangeStart} />}
          {editingField === "end" && <WheelPicker value={time.endTime} onChange={onChangeEnd} />}
          {invalid && <div style={{ marginTop: 6, fontSize: 10, color: "#DC2626", fontWeight: 700 }}>Jam mulai harus lebih awal dari jam selesai</div>}
        </div>
      )}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)}
      style={{ width: 42, height: 25, borderRadius: 999, border: "none", background: checked ? BRAND : "#D8D9E0", position: "relative", cursor: "pointer", padding: 0, flexShrink: 0, transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 2, left: checked ? 19 : 2, width: 21, height: 21, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(17,17,20,0.28)", transition: "left .15s" }} />
    </button>
  );
}

function TimePill({ text, active, danger }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums",
      color: danger ? "#DC2626" : active ? "#fff" : "#17181C",
      background: danger ? "rgba(220,38,38,0.10)" : active ? BRAND : "#EDEEF1",
      borderRadius: 999, padding: "6px 13px",
    }}>
      {text}
    </span>
  );
}

const WHEEL_ITEM_H = 36;
const WHEEL_PAD = 2; // baris kosong atas/bawah supaya item pertama/terakhir bisa nyampai tengah

function WheelColumn({ values, selected, onChange }) {
  const ref = useRef(null);
  const settleRef = useRef(null);
  const didInit = useRef(false);
  // Indeks terakhir yg sudah "digetarkan" - supaya getar cuma nyala SEKALI
  // per baris yg dilewati (bukan tiap event scroll, yg bisa berkali-kali
  // per baris), persis rasanya roda jam/menit di Jam/Alarm iPhone.
  const lastTickIdx = useRef(values.indexOf(selected));

  useEffect(() => {
    if (didInit.current || !ref.current) return;
    const idx = values.indexOf(selected);
    if (idx >= 0) ref.current.scrollTop = idx * WHEEL_ITEM_H;
    didInit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function snapTo(idx) {
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    ref.current?.scrollTo({ top: clamped * WHEEL_ITEM_H, behavior: "smooth" });
    onChange(values[clamped]);
  }

  function handleScroll() {
    if (!ref.current) return;
    // Getar tipis (3ms) SETIAP baris terlewati selagi menggulir - inilah
    // "tick" halus yg dirasakan, bukan cuma sekali di akhir. Catatan: Web
    // Vibration API hanya jalan di Android/Chrome, otomatis no-op di
    // Safari iOS (keterbatasan platform, bukan bug).
    const liveIdx = Math.round(ref.current.scrollTop / WHEEL_ITEM_H);
    if (liveIdx !== lastTickIdx.current) {
      lastTickIdx.current = liveIdx;
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(3);
    }
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      if (!ref.current) return;
      snapTo(Math.round(ref.current.scrollTop / WHEEL_ITEM_H));
    }, 110);
  }

  return (
    <div ref={ref} onScroll={handleScroll} className="mh-wheel-col"
      style={{ height: WHEEL_ITEM_H * (WHEEL_PAD * 2 + 1), width: 58, overflowY: "scroll", scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
      <style>{`.mh-wheel-col::-webkit-scrollbar{display:none;width:0;height:0}`}</style>
      <div style={{ height: WHEEL_ITEM_H * WHEEL_PAD }} />
      {values.map((v, i) => {
        const isSel = v === selected;
        return (
          <div key={v} onClick={() => snapTo(i)}
            style={{
              height: WHEEL_ITEM_H, scrollSnapAlign: "center", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: isSel ? 18 : 14.5, fontWeight: isSel ? 800 : 500, color: isSel ? "#17181C" : "#B0B0BA",
              fontVariantNumeric: "tabular-nums", cursor: "pointer", transition: "color .1s, font-size .1s",
            }}>
            {v}
          </div>
        );
      })}
      <div style={{ height: WHEEL_ITEM_H * WHEEL_PAD }} />
    </div>
  );
}

const WHEEL_HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const WHEEL_MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));

/** Roda pemutar jam:menit, padanan visual UIDatePicker iOS - bar abu-abu di
 * tengah menandai baris yg aktif dipilih, kedua kolom scroll independen. */
function WheelPicker({ value, onChange }) {
  const [h, m] = value.split(":");
  const centerTop = WHEEL_ITEM_H * WHEEL_PAD;
  return (
    <div style={{ position: "relative", marginTop: 10, padding: "4px 0 2px" }}>
      <div style={{ position: "absolute", top: 4 + centerTop, left: 6, right: 6, height: WHEEL_ITEM_H, borderRadius: 9, background: "#EDEEF1", zIndex: 0, pointerEvents: "none" }} />
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 2, position: "relative", zIndex: 1 }}>
        <WheelColumn values={WHEEL_HOURS} selected={h} onChange={(nh) => onChange(`${nh}:${m}`)} />
        <span style={{ fontSize: 16, fontWeight: 800, color: "#17181C", padding: "0 2px" }}>.</span>
        <WheelColumn values={WHEEL_MINUTES} selected={m} onChange={(nm) => onChange(`${h}:${nm}`)} />
      </div>
    </div>
  );
}
