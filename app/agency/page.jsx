"use client";

// ============================================================
// Agency Portal — MFTS
// Hanya untuk user role='agency'. RLS otomatis membatasi data ke
// agency milik user. Agency memajukan stage vacancy-nya saja.
//
// Desain: "action-first". Tiap seat = 1 kartu dengan aksi jelas.
// Update progres lewat 3 tombol besar: Lanjut / Ada kendala / Sudah join.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "../../lib/supabase";
import { HubLogo } from "../../components/HubLogo";
import {
  Briefcase, X, Loader2, LogOut, RefreshCw, AlertTriangle, Clock,
  CheckCircle2, Sun, Moon, UserCheck, FilterX, Search, ArrowRight, HelpCircle,
  Hourglass, MapPin, PartyPopper,
} from "lucide-react";
import { passesRow, optionsFor, FilterTh, FilterMenu } from "../dashboard/components/MFTS_TableFilter";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
const mk = (d) => ({
  bg: d ? "#0A0A0B" : "#F2F4F7", card: d ? "#141417" : "#FFFFFF", sub: d ? "#1C1C21" : "#F8F9FA",
  line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  teal: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  red: "#ED1C24", redBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)", redBd: d ? "rgba(237,28,36,.25)" : "rgba(237,28,36,.18)",
  amber: "#D4A800", amberBg: d ? "rgba(255,203,5,.12)" : "rgba(212,168,0,.1)", amberBd: d ? "rgba(255,203,5,.3)" : "rgba(212,168,0,.25)",
  blue: d ? "#0A84FF" : "#2563EB", blueBg: d ? "rgba(10,132,255,.12)" : "rgba(37,99,235,.08)", blueBd: d ? "rgba(10,132,255,.3)" : "rgba(37,99,235,.2)",
  green: "#1A9E90", orange: "#E8830C",
  md: d ? "0 6px 20px rgba(0,0,0,.55)" : "0 6px 18px rgba(0,0,0,.09)",
});
const daysSince = (x) => (x ? Math.floor((Date.now() - new Date(x).getTime()) / 86400000) : 0);
const ageTone = (t, n) => (n > 30 ? t.red : n > 14 ? t.orange : n > 7 ? t.amber : t.green);
const up = (s) => String(s || "").toUpperCase().trim();
const baseName = (n) => up(n).replace(/^(MC[- ]|CS[- ])/, "").trim();
const mcLabel = (c) => (c ? `MC-${baseName(c)}` : "");
const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const fmtPeriod = (p) => { const s = String(p || ""); if (s.length < 6) return "—"; const m = +s.slice(4, 6); return `${MONTHS_ID[m - 1] || "?"} ${s.slice(0, 4)}`; };
const isJoinedName = (s) => /joined/i.test(s || "");
function brandBadge(b) {
  const x = up(b);
  const c = x === "IM3" ? "#C6168D" : x === "3ID" ? "#E8830C" : x === "HYBRID" ? "#2563EB" : "#8A8A9C";
  return <span style={{ fontSize: 10, fontWeight: 800, color: c, border: `1px solid ${c}55`, background: `${c}18`, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap" }}>{b || "—"}</span>;
}

export default function AgencyPortal() {
  const router = useRouter();
  const [d, setD] = useState(true);
  const t = mk(d);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [agencyName, setAgencyName] = useState("");
  const [stages, setStages] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [vacancies, setVacancies] = useState([]);
  const [advancing, setAdvancing] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("vacancy"); // vacancy | manpower
  const [manpower, setManpower] = useState([]);
  const [q, setQ] = useState("");                 // pencarian kartu vacancy
  const [vacScope, setVacScope] = useState("todo"); // todo | all
  const [showHelp, setShowHelp] = useState(true);
  const [mpFilters, setMpFilters] = useState({}); const [mpOpenCol, setMpOpenCol] = useState(""); const [mpRect, setMpRect] = useState(null);

  useEffect(() => { setD(localStorage.getItem("hub-theme") !== "light"); }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/sandra/login?redirect=/agency"); return; }
      const { data: prof } = await supabase.from("profiles").select("*, agency:mf_agencies(name)").eq("id", session.user.id).maybeSingle();
      if (!prof || prof.role !== "agency") { router.replace("/dashboard"); return; }
      setProfile(prof);
      setAgencyName(prof.agency?.name || "Agency");
      setReady(true);
      await load();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setErr("");
    try {
      const [st, rc, vc, mp] = await Promise.all([
        supabase.from("mf_stages").select("*").order("ord"),
        supabase.from("mf_reason_codes").select("*").eq("active", true).order("id"),
        supabase.from("mf_vacancies").select("*").order("open_date", { ascending: true }),
        supabase.from("mf_manpower").select("*").eq("manpower_type", "DSF").eq("status", "active").order("name"),
      ]);
      if (vc.error) throw new Error(vc.error.message);
      setStages(st.data || []); setReasons(rc.data || []); setVacancies(vc.data || []); setManpower(mp.data || []);
    } catch (e) { setErr(e.message || "Gagal memuat data"); }
  }

  const stageById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);
  // 1 baris per SEAT: buang yang dibatalkan, dedupe per seat_id (anti-duplikat).
  const rows = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const v of vacancies) {
      if (String(v.status || "") === "closed_cancelled") continue;  // seat sudah tidak ada
      const key = v.seat_id || v.id;
      if (seen.has(key)) continue; seen.add(key);
      const stage = stageById[v.current_stage_id] || null;
      const age = daysSince(v.open_date); const idle = daysSince(v.last_event_at);
      const filled = String(v.status || "") === "closed_filled";
      const onHold = v.status === "on_hold";
      const overdue = !filled && !onHold && stage?.target_days != null && idle > stage.target_days;
      const waiting = !filled && isJoinedName(stage?.name); // Joined → menunggu verifikasi internal
      out.push({ ...v, stage, age, idle, filled, closed: filled, onHold, overdue, waiting });
    }
    return out;
  }, [vacancies, stageById]);
  const openRows = rows.filter((r) => !r.closed);
  const ac = {
    overdue: openRows.filter((r) => r.overdue).length,
    idle: openRows.filter((r) => !r.onHold && r.idle > 5).length,
    open: openRows.length,
    filled: rows.filter((r) => r.closed).length,
  };

  // "Perlu tindakan" = agency masih bisa berbuat sesuatu (bukan on-hold / bukan menunggu verifikasi).
  const needsAction = (r) => !r.onHold && !r.waiting && (r.overdue || r.idle > 5);
  const todoCount = openRows.filter(needsAction).length;

  // ---- Kartu Vacancy ----
  const vacList = useMemo(() => {
    const qq = up(q);
    let list = vacScope === "todo" ? openRows.filter(needsAction) : openRows;
    if (qq) list = list.filter((r) => [mcLabel(r.mc_cluster), r.position, r.region, r.branch, r.area, r.id_dsf_im3, r.id_dsf_3id, r.id_staffinc]
      .some((x) => up(x).includes(qq)));
    return [...list].sort((a, b) =>
      (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) ||
      (a.waiting ? 1 : 0) - (b.waiting ? 1 : 0) ||   // yang menunggu verifikasi ke bawah
      b.idle - a.idle || b.age - a.age);
  }, [openRows, q, vacScope]);

  // ---- Tab Manpower (roster DSF agency) ----
  const MP_FCOLS = [["fbrand", "Brand"], ["id_im3", "ID_DSF_IM3"], ["id_3id", "ID_DSF_3ID"], ["id_staffinc", "ID_STAFFINC"], ["nama", "NAMA_DSF"], ["fmc", "MC"], ["fbranch", "Branch"], ["fregion", "Region"], ["fcircle", "Circle"], ["id_tl", "ID_STAFFINC_TL"], ["nama_tl", "NAMA_TL"]];
  const mpView = useMemo(() => manpower.filter((m) => up(m.name) !== "VACANT").map((m) => ({
    brand: up(m.brand) === "HYBRID" ? "Hybrid" : (m.brand || ""), fbrand: up(m.brand) === "HYBRID" ? "Hybrid" : (m.brand || ""),
    id_im3: m.id_dsf_im3 || "", id_3id: m.id_dsf_3id || "", id_staffinc: m.id_staffinc || "", nama: m.name || "",
    mc: mcLabel(m.mc_cluster), fmc: mcLabel(m.mc_cluster), branch: m.branch || "", fbranch: m.branch || "",
    region: m.region || "", fregion: m.region || "", circle: m.circle || "", fcircle: m.circle || "",
    area: m.area || "", id_tl: m.id_staffinc_tl || "", nama_tl: m.nama_tl || "",
  })).sort((a, b) =>
    up(a.region).localeCompare(up(b.region)) || up(a.area).localeCompare(up(b.area)) ||
    up(a.fbranch).localeCompare(up(b.fbranch)) || up(a.fmc).localeCompare(up(b.fmc)) || up(a.fbrand).localeCompare(up(b.fbrand)),
  ), [manpower]);
  const mpRows = useMemo(() => mpView.filter((r) => passesRow(r, mpFilters, MP_FCOLS, null)), [mpView, mpFilters]); // eslint-disable-line
  const anyMpFilter = MP_FCOLS.some(([k]) => (mpFilters[k] || []).length);

  async function doAdvance(vac, { toStageId, reasonId = null, reasonText = "", note = "", identity = null }) {
    const to = stageById[toStageId]; const now = new Date().toISOString();
    const noteFinal = [reasonText ? `Lainnya: ${reasonText}` : "", note].filter(Boolean).join(" — ")
      || (identity?.joined_name ? `Joined diajukan: ${identity.joined_name}` : null);
    const { error: e1 } = await supabase.from("mf_vacancy_events").insert({
      vacancy_id: vac.id, from_stage_id: vac.current_stage_id, to_stage_id: toStageId,
      owner: to?.owner_default || "agency", reason_code_id: reasonId || null, note: noteFinal,
      actor: profile?.id || null, actor_name: profile?.full_name || profile?.email || null,
      actor_role: "agency", ts: now,
    });
    if (e1) throw new Error(e1.message);
    const patch = {
      current_stage_id: toStageId, current_owner: to?.owner_default || "agency",
      last_event_at: now, updated_at: now, status: to?.is_terminal ? "closed_filled" : "open",
    };
    if (identity) Object.assign(patch, identity); // simpan identitas joiner di seat (utk verifikasi internal)
    const { error: e2 } = await supabase.from("mf_vacancies").update(patch).eq("id", vac.id);
    if (e2) throw new Error(e2.message);
    await load();
  }

  async function logout() { await supabase.auth.signOut(); router.replace("/sandra/login"); }

  if (!ready) return (
    <div style={{ minHeight: "100svh", background: mk(true).bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 size={24} color="#ED1C24" style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const card = { background: t.card, border: `1px solid ${t.line}`, borderRadius: 14 };

  return (
    <div style={{ minHeight: "100svh", background: t.bg, fontFamily: FONT, color: t.hi }}>
      {/* Topbar */}
      <div style={{ borderBottom: `1px solid ${t.line}`, background: t.card, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1760, margin: "0 auto", padding: "12px clamp(16px, 3vw, 40px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <HubLogo variant="sandra" size={36} dark={d} inBox />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Pemenuhan Manpower</div>
              <div style={{ fontSize: 11.5, color: t.teal, fontWeight: 700 }}>{agencyName}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { const n = !d; setD(n); localStorage.setItem("hub-theme", n ? "dark" : "light"); }} style={iconBtn(t)}>{d ? <Sun size={15} /> : <Moon size={15} />}</button>
            <button onClick={load} style={iconBtn(t)} title="Muat ulang"><RefreshCw size={15} /></button>
            <button onClick={logout} style={{ ...btn(t), color: t.red, borderColor: t.redBd }}><LogOut size={14} /> Keluar</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1760, margin: "0 auto", padding: "22px clamp(16px, 3vw, 40px) 60px" }}>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Halo, {profile?.full_name || "PIC"} 👋</div>
        <div style={{ fontSize: 13.5, color: t.mid, marginBottom: 18 }}>Perbarui progres setiap posisi yang ditugaskan ke {agencyName}. Mulai dari yang <b style={{ color: t.hi }}>perlu tindakan</b> di bawah.</div>

        {err && <div style={{ ...card, padding: 14, borderColor: t.redBd, background: t.redBg, color: t.red, marginBottom: 16 }}>{err}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 18 }}>
          <Stat t={t} icon={<AlertTriangle size={16} />} tone={t.red} bg={t.redBg} bd={t.redBd} v={ac.overdue} l="Lewat SLA stage" />
          <Stat t={t} icon={<Clock size={16} />} tone={t.orange} bg={t.amberBg} bd={t.amberBd} v={ac.idle} l="Didiamkan > 5 hari" />
          <Stat t={t} icon={<Briefcase size={16} />} tone={t.teal} bg={t.tealBg} bd={t.tealBd} v={ac.open} l="Perlu diisi" />
          <Stat t={t} icon={<CheckCircle2 size={16} />} tone={t.green} bg={t.tealBg} bd={t.tealBd} v={ac.filled} l="Sudah terisi" />
        </div>

        {/* Tabs: Vacancy (perlu diproses) | Manpower (roster) */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: `1px solid ${t.line}` }}>
          {[["vacancy", "Posisi Kosong", <Briefcase key="b" size={14} />, ac.open], ["manpower", "Sudah Terisi", <UserCheck key="u" size={14} />, ac.filled]].map(([id, label, ic, n]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", background: "none", border: "none", borderBottom: `2px solid ${tab === id ? t.teal : "transparent"}`, color: tab === id ? t.hi : t.mid, fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: FONT, marginBottom: -1 }}>
              {ic} {label} <span style={{ fontSize: 11, fontWeight: 800, color: tab === id ? t.teal : t.lo }}>{n}</span>
            </button>
          ))}
        </div>

        {tab === "vacancy" && (
          <>
            {/* Panduan singkat */}
            {showHelp && (
              <div style={{ ...card, padding: "12px 14px", marginBottom: 14, background: t.blueBg, borderColor: t.blueBd, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <HelpCircle size={18} style={{ color: t.blue, flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12.5, color: t.hi, lineHeight: 1.6, flex: 1 }}>
                  <b>Cara pakai:</b> tiap kartu di bawah adalah satu posisi. Klik <b>Perbarui progres</b>, lalu pilih salah satu:
                  {" "}<b style={{ color: t.teal }}>Lanjut ke tahap berikut</b> jika ada kemajuan,
                  {" "}<b style={{ color: t.amber }}>Ada kendala</b> jika macet (tulis alasannya),
                  atau <b style={{ color: t.blue }}>Sudah join</b> jika kandidat sudah bergabung.
                </div>
                <button onClick={() => setShowHelp(false)} style={{ ...iconBtn(t), width: 26, height: 26, border: "none", background: "transparent", color: t.mid }}><X size={15} /></button>
              </div>
            )}

            {/* Kontrol: segmen + pencarian */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "inline-flex", background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: 3 }}>
                {[["todo", `Perlu tindakan (${todoCount})`], ["all", `Semua (${ac.open})`]].map(([id, label]) => (
                  <button key={id} onClick={() => setVacScope(id)}
                    style={{ padding: "7px 13px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
                      background: vacScope === id ? t.card : "transparent", color: vacScope === id ? t.hi : t.mid, boxShadow: vacScope === id ? t.md : "none" }}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
                <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: t.lo }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari MC, posisi, region, ID…"
                  style={{ ...inp(t), paddingLeft: 34 }} />
              </div>
            </div>

            {/* Grid kartu */}
            {vacList.length === 0 ? (
              <div style={{ ...card, padding: 40, textAlign: "center", color: t.mid }}>
                {q ? "Tidak ada posisi yang cocok dengan pencarian." :
                  vacScope === "todo"
                    ? <><PartyPopper size={22} style={{ color: t.teal, marginBottom: 8 }} /><div style={{ fontWeight: 700, color: t.hi }}>Semua aman 🎉</div><div style={{ fontSize: 12.5, marginTop: 3 }}>Tidak ada posisi yang perlu tindakan hari ini. Lihat “Semua” untuk daftar lengkap.</div></>
                    : "Belum ada posisi kosong."}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
                {vacList.map((r) => <SeatCard key={r.id} t={t} r={r} stages={stages} onUpdate={() => setAdvancing(r)} />)}
              </div>
            )}
          </>
        )}

        {tab === "manpower" && (
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span>Sudah Terisi <span style={{ color: t.mid, fontWeight: 500 }}>· DSF aktif</span></span>
              {anyMpFilter && <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 11.5, color: t.mid }}>{mpRows.length} dari {mpView.length}</span><button onClick={() => { setMpFilters({}); setMpOpenCol(""); }} style={{ ...btn(t), padding: "5px 10px", color: t.red, borderColor: t.redBd }}><FilterX size={13} /> Hapus filter</button></span>}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
                <thead><tr style={{ background: t.sub, color: t.mid, textAlign: "left" }}>
                  <th style={{ padding: "9px 8px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", textAlign: "center", width: 68, minWidth: 68 }}>No.</th>
                  {MP_FCOLS.map(([k, label]) => <FilterTh key={k} t={t} label={label} colKey={k} filters={mpFilters} onOpen={(ck, rc) => { setMpRect(rc); setMpOpenCol(ck); }} />)}
                </tr></thead>
                <tbody>
                  {mpRows.length === 0 && <tr><td colSpan={12} style={{ padding: 28, textAlign: "center", color: t.lo }}>{anyMpFilter ? "Tidak ada yang cocok dengan filter." : "Belum ada manpower terisi."}</td></tr>}
                  {mpRows.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${t.line}` }}>
                      <td style={{ padding: "8px 8px", color: t.lo, fontWeight: 600, textAlign: "center" }}>{i + 1}</td>
                      <td style={{ padding: "8px 12px" }}>{brandBadge(r.brand)}</td>
                      <td style={{ padding: "8px 12px", color: t.mid }}>{r.id_im3 || "—"}</td>
                      <td style={{ padding: "8px 12px", color: t.mid }}>{r.id_3id || "—"}</td>
                      <td style={{ padding: "8px 12px", color: t.mid }}>{r.id_staffinc || "—"}</td>
                      <td style={{ padding: "8px 12px", fontWeight: 700, color: t.hi }}>{r.nama || "—"}</td>
                      <td style={{ padding: "8px 12px", fontWeight: 600, color: t.hi }}>{r.mc || "—"}</td>
                      <td style={{ padding: "8px 12px", color: t.mid }}>{r.branch || "—"}</td>
                      <td style={{ padding: "8px 12px", color: t.mid }}>{r.region || "—"}</td>
                      <td style={{ padding: "8px 12px", color: t.mid }}>{r.circle || "—"}</td>
                      <td style={{ padding: "8px 12px", color: t.mid }}>{r.id_tl || "—"}</td>
                      <td style={{ padding: "8px 12px", color: t.mid }}>{r.nama_tl || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {mpOpenCol && <FilterMenu t={t} rect={mpRect} label={(MP_FCOLS.find(([k]) => k === mpOpenCol) || [, mpOpenCol])[1]} options={optionsFor(mpView, mpFilters, MP_FCOLS, mpOpenCol)} selected={mpFilters[mpOpenCol] || []} onChange={(arr) => setMpFilters((p) => ({ ...p, [mpOpenCol]: arr }))} onClose={() => { setMpOpenCol(""); setMpRect(null); }} />}
      </div>

      {advancing && <ActionSheet t={t} vac={advancing} stages={stages} reasons={reasons} onClose={() => setAdvancing(null)}
        onSubmit={async (payload) => { await doAdvance(advancing, payload); setAdvancing(null); }} />}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap');*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{margin:0}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

const btn = (t) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT });
const iconBtn = (t) => ({ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.mid, cursor: "pointer" });
const inp = (t) => ({ width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box" });
const lbl = (t) => ({ fontSize: 11, fontWeight: 700, color: t.mid, marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: "0.04em" });

function Stat({ t, icon, tone, bg, bd, v, l }) {
  return <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 14, padding: "14px 16px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: tone }}>{icon}<span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{v}</span></div>
    <div style={{ fontSize: 12, color: t.mid, marginTop: 6, fontWeight: 600 }}>{l}</div>
  </div>;
}

/* ---------- Kartu seat ---------- */
function SeatCard({ t, r, stages, onUpdate }) {
  const ordered = [...stages].sort((a, b) => a.ord - b.ord);
  const curOrd = r.stage?.ord ?? -1;
  const nextStage = ordered.find((s) => s.ord > curOrd && !s.is_terminal && !isJoinedName(s.name));

  // Baris status besar (langsung terbaca)
  let statusChip;
  if (r.onHold) statusChip = <Chip t={t} tone={t.mid} bg={t.sub} bd={t.line} icon={<Hourglass size={11} />} text="On-Hold (dijeda internal)" />;
  else if (r.waiting) statusChip = <Chip t={t} tone={t.blue} bg={t.blueBg} bd={t.blueBd} icon={<Clock size={11} />} text="Menunggu verifikasi internal" />;
  else if (r.overdue) statusChip = <Chip t={t} tone={t.red} bg={t.redBg} bd={t.redBd} icon={<AlertTriangle size={11} />} text="Lewat SLA — segera tindak" />;
  else if (r.idle > 5) statusChip = <Chip t={t} tone={t.orange} bg={t.amberBg} bd={t.amberBd} icon={<Clock size={11} />} text={`Didiamkan ${r.idle} hari`} />;
  else statusChip = <Chip t={t} tone={t.teal} bg={t.tealBg} bd={t.tealBd} icon={<CheckCircle2 size={11} />} text="Berjalan" />;

  const canAct = !r.onHold && !r.waiting;

  return (
    <div style={{ background: t.card, border: `1px solid ${r.overdue && canAct ? t.redBd : t.line}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {brandBadge(r.brand)}
        <span style={{ fontWeight: 800, fontSize: 15, color: t.hi }}>{mcLabel(r.mc_cluster) || r.position}</span>
      </div>
      <div style={{ fontSize: 12.5, color: t.mid, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <MapPin size={12} style={{ color: t.lo }} />
        {[r.region, r.branch].filter(Boolean).join(" · ") || "Lokasi —"}
        <span style={{ color: t.lo }}>·</span>
        <span>{fmtPeriod(r.target_period)}</span>
      </div>

      <div>{statusChip}</div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12, color: t.mid, borderTop: `1px solid ${t.line}`, paddingTop: 10 }}>
        <span>Tahap: <b style={{ color: t.hi }}>{r.stage?.name || "—"}</b></span>
        <span style={{ display: "inline-flex", gap: 10 }}>
          <span title="Umur seat">Umur <b style={{ color: ageTone(t, r.age) }}>{r.age}h</b></span>
          <span title="Lama tak ada update">Idle <b style={{ color: r.idle > 5 && canAct ? t.orange : t.lo }}>{r.idle}h</b></span>
        </span>
      </div>

      {canAct ? (
        <>
          {nextStage && <div style={{ fontSize: 11.5, color: t.lo }}>Berikutnya biasanya: <b style={{ color: t.mid }}>{nextStage.name}</b></div>}
          <button onClick={onUpdate} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.teal}`, background: t.teal, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
            Perbarui progres <ArrowRight size={15} />
          </button>
        </>
      ) : (
        <div style={{ fontSize: 11.5, color: t.lo, fontStyle: "italic" }}>
          {r.waiting ? "Tidak perlu tindakan — menunggu tim internal memverifikasi." : "Sedang dijeda oleh tim internal."}
        </div>
      )}
    </div>
  );
}

function Chip({ t, tone, bg, bd, icon, text }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, color: tone, background: bg, border: `1px solid ${bd}`, padding: "4px 9px", borderRadius: 999 }}>{icon}{text}</span>;
}

/* ---------- ActionSheet: 3 tombol besar ---------- */
function ActionSheet({ t, vac, stages, reasons, onClose, onSubmit }) {
  const ordered = [...stages].sort((a, b) => a.ord - b.ord);
  const curOrd = stages.find((s) => s.id === vac.current_stage_id)?.ord ?? -1;
  const joinStage = stages.find((s) => isJoinedName(s.name) && !s.is_terminal);
  const nextStage = ordered.find((s) => s.ord > curOrd && !s.is_terminal && !isJoinedName(s.name));
  const canJoin = joinStage && curOrd < (joinStage.ord ?? 999);

  const [choice, setChoice] = useState(null); // 'next' | 'block' | 'join'
  const [note, setNote] = useState("");
  const [reasonSel, setReasonSel] = useState("");   // "" | "<id>" | "__other__"
  const [reasonOther, setReasonOther] = useState("");
  const [idn, setIdn] = useState({
    joined_name: vac.joined_name || "", id_dsf_im3: vac.id_dsf_im3 || "", id_dsf_3id: vac.id_dsf_3id || "",
    id_staffinc: vac.id_staffinc || "", id_staffinc_tl: vac.id_staffinc_tl || "", nama_tl: vac.nama_tl || "",
  });
  const setI = (k, v) => setIdn((p) => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [e, setE] = useState("");
  const isHybrid = up(vac.brand) === "HYBRID";

  const ACTIONS = [
    nextStage && { id: "next", tone: t.teal, bg: t.tealBg, bd: t.tealBd, icon: <ArrowRight size={18} />, title: "Lanjut ke tahap berikut", sub: `Menuju: ${nextStage.name}` },
    canJoin && { id: "join", tone: t.blue, bg: t.blueBg, bd: t.blueBd, icon: <PartyPopper size={18} />, title: "Sudah join", sub: "Kandidat sudah bergabung — ajukan untuk verifikasi" },
    { id: "block", tone: t.amber, bg: t.amberBg, bd: t.amberBd, icon: <AlertTriangle size={18} />, title: "Ada kendala (macet)", sub: "Belum bisa lanjut — catat alasannya" },
  ].filter(Boolean);

  async function submit() {
    setE("");
    if (choice === "next") {
      setSaving(true);
      try { await onSubmit({ toStageId: nextStage.id, note: note.trim() }); }
      catch (err) { setE(err.message || "Gagal"); setSaving(false); }
      return;
    }
    if (choice === "join") {
      if (!idn.joined_name.trim()) { setE("Nama DSF wajib diisi saat menandai Sudah join."); return; }
      if (isHybrid && (!idn.id_dsf_im3.trim() || !idn.id_dsf_3id.trim())) { setE("Seat Hybrid: isi ID_DSF_IM3 dan ID_DSF_3ID."); return; }
      setSaving(true);
      try {
        await onSubmit({
          toStageId: joinStage.id, note: note.trim(),
          identity: {
            joined_name: idn.joined_name.trim() || null, id_dsf_im3: idn.id_dsf_im3.trim() || null, id_dsf_3id: idn.id_dsf_3id.trim() || null,
            id_staffinc: idn.id_staffinc.trim() || null, id_staffinc_tl: idn.id_staffinc_tl.trim() || null, nama_tl: idn.nama_tl.trim() || null,
          },
        });
      } catch (err) { setE(err.message || "Gagal"); setSaving(false); }
      return;
    }
    if (choice === "block") {
      const reasonId = reasonSel && reasonSel !== "__other__" ? Number(reasonSel) : null;
      const reasonText = reasonSel === "__other__" ? reasonOther.trim() : "";
      if (!reasonId && !reasonText) { setE("Pilih alasan kendalanya, atau tulis sendiri lewat “Lainnya…”."); return; }
      setSaving(true);
      try { await onSubmit({ toStageId: vac.current_stage_id, reasonId, reasonText, note: note.trim() }); }
      catch (err) { setE(err.message || "Gagal"); setSaving(false); }
      return;
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(ev) => ev.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: t.card, borderRadius: 16, border: `1px solid ${t.line}`, boxShadow: t.md, fontFamily: FONT, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 18px", borderBottom: `1px solid ${t.line}` }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Perbarui progres</div>
            <div style={{ fontSize: 12, color: t.mid, marginTop: 2 }}>{mcLabel(vac.mc_cluster) || vac.position} · tahap sekarang: <b style={{ color: t.hi }}>{stages.find((s) => s.id === vac.current_stage_id)?.name || "—"}</b></div>
          </div>
          <button onClick={onClose} style={{ ...iconBtn(t), width: 30, height: 30, border: "none", background: "transparent" }}><X size={18} /></button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          {e && <div style={{ color: t.red, fontSize: 12, fontWeight: 700, background: t.redBg, border: `1px solid ${t.redBd}`, borderRadius: 8, padding: "8px 10px" }}>{e}</div>}

          {/* 3 tombol besar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ACTIONS.map((a) => {
              const active = choice === a.id;
              return (
                <button key={a.id} onClick={() => { setChoice(a.id); setE(""); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", padding: "12px 14px", borderRadius: 12, cursor: "pointer", fontFamily: FONT,
                    border: `2px solid ${active ? a.tone : t.line}`, background: active ? a.bg : t.sub, transition: "all .12s ease" }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 10, background: a.bg, color: a.tone, flexShrink: 0 }}>{a.icon}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: active ? a.tone : t.hi }}>{a.title}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: t.mid, marginTop: 1 }}>{a.sub}</span>
                  </span>
                  {active && <CheckCircle2 size={18} style={{ color: a.tone }} />}
                </button>
              );
            })}
          </div>

          {/* Form kontekstual sesuai pilihan */}
          {choice === "join" && (
            <div style={{ border: `1px solid ${t.blueBd}`, background: t.blueBg, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: t.blue }}>Data DSF yang join (akan diverifikasi internal)</div>
              <div><label style={lbl(t)}>Nama DSF *</label><input value={idn.joined_name} onChange={(ev) => setI("joined_name", ev.target.value)} placeholder="Nama lengkap joiner" style={inp(t)} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><label style={lbl(t)}>ID_DSF_IM3{isHybrid ? " *" : ""}</label><input value={idn.id_dsf_im3} onChange={(ev) => setI("id_dsf_im3", ev.target.value)} style={inp(t)} /></div>
                <div><label style={lbl(t)}>ID_DSF_3ID{isHybrid ? " *" : ""}</label><input value={idn.id_dsf_3id} onChange={(ev) => setI("id_dsf_3id", ev.target.value)} style={inp(t)} /></div>
              </div>
              <div><label style={lbl(t)}>ID_STAFFINC</label><input value={idn.id_staffinc} onChange={(ev) => setI("id_staffinc", ev.target.value)} style={inp(t)} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><label style={lbl(t)}>ID_STAFFINC_TL</label><input value={idn.id_staffinc_tl} onChange={(ev) => setI("id_staffinc_tl", ev.target.value)} style={inp(t)} /></div>
                <div><label style={lbl(t)}>NAMA_TL</label><input value={idn.nama_tl} onChange={(ev) => setI("nama_tl", ev.target.value)} style={inp(t)} /></div>
              </div>
            </div>
          )}

          {choice === "block" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={lbl(t)}>Alasan kendala *</label>
              <select value={reasonSel} onChange={(ev) => setReasonSel(ev.target.value)} style={{ ...inp(t), borderColor: reasonSel ? t.line : t.amberBd }}>
                <option value="">— pilih alasan —</option>
                {reasons.map((r) => <option key={r.id} value={String(r.id)}>{r.label}</option>)}
                <option value="__other__">Lainnya… (tulis sendiri)</option>
              </select>
              {reasonSel === "__other__" && (
                <input autoFocus value={reasonOther} onChange={(ev) => setReasonOther(ev.target.value)} placeholder="Tulis kendala yang tidak ada di daftar…" style={inp(t)} />
              )}
              <div style={{ fontSize: 11, color: t.amber }}>Posisi tetap di tahap ini. Alasan tercatat agar tim internal bisa bantu.</div>
            </div>
          )}

          {choice && (
            <div><label style={lbl(t)}>Catatan (opsional)</label><textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={2} placeholder="Tambahan info bila perlu…" style={{ ...inp(t), resize: "vertical" }} /></div>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: `1px solid ${t.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={btn(t)}>Batal</button>
          <button disabled={saving || !choice} onClick={submit}
            style={{ ...btn(t), background: choice ? t.teal : t.sub, color: choice ? "#fff" : t.lo, borderColor: choice ? t.teal : t.line, cursor: choice ? "pointer" : "not-allowed" }}>
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
