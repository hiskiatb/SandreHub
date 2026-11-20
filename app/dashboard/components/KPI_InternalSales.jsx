"use client";
// KPI Internal Sales — dashboard skor KPI Internal Sales (HOR/HOA/DSO/DSP)
// dan KAM. Admin (SPM / internal IOH) upload file Excel bulanan
// "KPI INTERNAL SALES KAM - Closing"; yang dibaca HANYA sheet
// "INTERNAL SALES" dan "KPI_IS_KAM" (sheet besar lain diabaikan).
// Data disimpan per periode (YYYY-MM) di tabel public.kpi_is_data
// (lihat docs/sql/kpi_internal_sales.sql).
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "../../../lib/supabase";
import {
  Upload, Search, X, Download, Users, Award, AlertTriangle, TrendingUp,
  Loader2, ChevronDown, ChevronUp, Calendar, Briefcase, Info, Check,
} from "lucide-react";

let _xlsx = null;
async function getXLSX() {
  if (_xlsx) return _xlsx;
  _xlsx = await import("xlsx");
  return _xlsx;
}

const TABLE = "kpi_is_data";
const MONO = "'SF Mono','Fira Code','DM Mono',monospace";
const ROLE_ORDER = ["HOR", "HOA", "DSO", "DSP"];
const REGION_ORDER = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];
const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const SLABS = [
  { k: "s0", label: "0–30%",  test: (v) => v < 0.3 },
  { k: "s1", label: "30–60%", test: (v) => v >= 0.3 && v < 0.6 },
  { k: "s2", label: "60–80%", test: (v) => v >= 0.6 && v < 0.8 },
  { k: "s3", label: "≥80%",   test: (v) => v >= 0.8 },
];

// Parameter Internal Sales. `roles` = role yang parameter ini dihitung
// (sesuai file referensi Okt 2026: HOA pakai RGU GA Trade, DSO/DSP pakai
// SP Sell-in + Retailer Tagging; Trade Supply, DSE Prod, RGU GA FWA semua).
const PARAMS = [
  { k: "sellin", label: "SP Sell-in & Retailer Tagging", short: "SP Sell-in", roles: ["DSO", "DSP"] },
  { k: "rguga",  label: "RGU GA Trade",                  short: "RGU GA",     roles: ["HOA"] },
  { k: "trade",  label: "Trade Supply",                  short: "Trade Sup.", roles: ["HOA", "DSO", "DSP"] },
  { k: "dse",    label: "DSE Productivity",              short: "DSE Prod.",  roles: ["HOA", "DSO", "DSP"] },
  { k: "fwa",    label: "RGU GA FWA",                    short: "FWA",        roles: ["HOA", "DSO", "DSP"] },
];

// ─── Format helpers ───────────────────────────────────────────────────────────
const num = (v) => (typeof v === "number" && isFinite(v) ? v : (v == null || v === "" ? null : (isFinite(+v) ? +v : null)));
const pct = (v, dp = 1) => (v == null ? "–" : `${(v * 100).toFixed(dp)}%`);
const fmtN = (v) => {
  if (v == null) return "–";
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)} T`;
  if (a >= 1e9)  return `${(v / 1e9).toFixed(2)} M`;
  if (a >= 1e6)  return `${(v / 1e6).toFixed(1)} jt`;
  return Math.round(v).toLocaleString("id-ID");
};
const periodLabel = (p) => {
  if (!p) return "–";
  const [y, m] = p.split("-");
  return `${MONTHS_ID[(+m || 1) - 1]} ${y}`;
};
const toPeriod = (v) => {
  const s = String(v ?? "").replace(/\D/g, "");
  if (s.length >= 6) {
    const y = s.slice(0, 4), m = s.slice(4, 6);
    if (+y > 2000 && +m >= 1 && +m <= 12) return `${y}-${m}`;
  }
  return null;
};
const scoreColor = (t, v) => (v == null ? t.lo : v >= 1 ? t.green : v >= 0.8 ? t.yellow : t.red);
const scoreBg = (t, v) => (v == null ? "transparent" : v >= 1 ? t.greenBg : v >= 0.8 ? t.yellowBg : t.redBg);
const avg = (arr) => { const a = arr.filter((x) => x != null); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };

// ─── Excel parsing ────────────────────────────────────────────────────────────
function cellGetter(XLSX, ws) {
  return (r, c) => {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    return cell ? cell.v : null;
  };
}
const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase();

function findCell(get, maxR, maxC, pred) {
  for (let r = 0; r <= maxR; r++) for (let c = 0; c <= maxC; c++) if (pred(get(r, c), r, c)) return { r, c };
  return null;
}

function parseInternalSales(XLSX, ws) {
  const get = cellGetter(XLSX, ws);
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const hdr = findCell(get, 30, 15, (v, r, c) => norm(v) === "NIK" && norm(get(r, c + 1)) === "NAME");
  if (!hdr) throw new Error('Sheet "INTERNAL SALES": header NIK / NAME tidak ditemukan.');
  const H = hdr.r, C0 = hdr.c;
  // Periode (mis. 20261031) di atas header
  let period = null;
  for (let r = 0; r < H && !period; r++) for (let c = 0; c <= C0 + 3 && !period; c++) period = toPeriod(get(r, c));

  // Kolom grup (baris header) — urut kiri ke kanan
  const groups = [];
  for (let c = C0; c <= range.e.c; c++) {
    const v = get(H, c);
    if (typeof v === "string" && v.trim()) groups.push({ c, label: norm(v) });
  }
  const gStart = (pred) => groups.findIndex((g) => pred(g.label));
  const colOf = (key) => { const i = groups.findIndex((g) => g.label === key); return i >= 0 ? groups[i].c : -1; };
  const endOf = (i) => (i + 1 < groups.length ? groups[i + 1].c : range.e.c + 1);
  const subCols = (i) => {
    const out = {};
    if (i < 0) return out;
    for (let c = groups[i].c; c < endOf(i); c++) {
      const s = norm(get(H + 2, c));
      if (s && !(s in out)) out[s] = c;
    }
    return out;
  };
  const weightOf = (i) => {
    if (i < 0) return null;
    for (let c = groups[i].c + 1; c < endOf(i); c++) { const w = num(get(H, c)); if (w != null) return w; }
    return null;
  };

  const iSell  = gStart((l) => l.includes("SELLIN"));
  const iRg    = gStart((l) => l.includes("RGUGA TRADE") || l.includes("RGU GA TRADE"));
  const iTrade = gStart((l) => l.includes("TRADE SUPPLY"));
  const iDse   = gStart((l) => l.includes("DSE PROD"));
  const iFwa   = gStart((l) => l.includes("FWA"));
  const iBef   = gStart((l) => l.includes("BEFORE"));
  const iComp  = gStart((l) => l.includes("COMPLIANCE"));
  const iIdx   = gStart((l) => l === "INDEX");
  const iRev   = gStart((l) => l.includes("PREPAID REVENUE"));
  const iFin   = gStart((l) => l.includes("FINAL"));
  if (iFin < 0) throw new Error('Sheet "INTERNAL SALES": kolom FINAL SCORE tidak ditemukan.');

  const sc = { sell: subCols(iSell), rg: subCols(iRg), trade: subCols(iTrade), dse: subCols(iDse), fwa: subCols(iFwa), comp: subCols(iComp), rev: subCols(iRev) };
  // Grup SP Sell-in: Sellin SP (T/A/ACH), Retailer Tagging (T/A/ACH), ACH gabungan
  const s0 = iSell >= 0 ? groups[iSell].c : -1;
  const tAch = (o, key = "ACH") => o[key];
  const tgt = (o) => o.TARGET;
  const act = (o) => (o.ACT ?? o.ACTUAL);

  const weights = {
    sellin: weightOf(iSell), rguga: weightOf(iRg), trade: weightOf(iTrade), dse: weightOf(iDse), fwa: weightOf(iFwa),
  };

  const people = [];
  let blanks = 0;
  for (let r = H + 3; r <= range.e.r; r++) {
    const nik = get(r, C0), name = get(r, C0 + 1);
    if (!nik && !name) { if (++blanks >= 3) break; continue; }
    blanks = 0;
    if (!name) continue;
    const g = (c) => (c == null || c < 0 ? null : num(get(r, c)));
    const tri = (o) => ({ t: g(tgt(o)), a: g(act(o)), ach: g(tAch(o)) });
    people.push({
      nik: String(nik ?? "").trim(),
      name: String(name).trim(),
      role: norm(get(r, C0 + 2)),
      territory: String(get(r, C0 + 3) ?? "").trim(),
      region: norm(get(r, C0 + 4)),
      circle: norm(get(r, C0 + 5)),
      geo: norm(get(r, C0 + 6)),
      sellinSp: s0 >= 0 ? { t: g(s0), a: g(s0 + 1), ach: g(s0 + 2) } : null,
      tagging:  s0 >= 0 ? { t: g(s0 + 3), a: g(s0 + 4), ach: g(s0 + 5) } : null,
      sellin:   s0 >= 0 ? { ach: g(s0 + 6) } : null,
      rguga: tri(sc.rg),
      trade: tri(sc.trade),
      dse: { score: g(sc.dse["#SCORE"]), count: g(sc.dse["#DSE"]), ach: g(sc.dse.ACH) },
      fwa: tri(sc.fwa),
      before: iBef >= 0 ? g(groups[iBef].c) : null,
      visit: { t: g(sc.comp.TARGET), a: g(sc.comp.ACTUAL ?? sc.comp.ACT), score: g(sc.comp.SCORE) },
      index: iIdx >= 0 ? g(groups[iIdx].c) : null,
      rev: { t: g(sc.rev.TARGET), a: g(sc.rev.ACTUAL ?? sc.rev.ACT), score: g(sc.rev.SCORE) },
      final: g(groups[iFin].c),
    });
  }
  if (!people.length) throw new Error('Sheet "INTERNAL SALES": tidak ada baris data.');
  return { period, weights, people };
}

function parseKam(XLSX, ws) {
  const get = cellGetter(XLSX, ws);
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const sub = findCell(get, 30, 10, (v, r, c) => norm(v) === "NAME" && norm(get(r, c + 1)) === "ROLE");
  if (!sub) return { period: null, kam: [] };
  const S = sub.r, G = S - 1;
  let period = null;
  for (let r = 0; r < G && !period; r++) for (let c = 0; c <= sub.c + 3 && !period; c++) period = toPeriod(get(r, c));
  const groups = [];
  for (let c = sub.c; c <= range.e.c; c++) {
    const v = get(G, c);
    if (typeof v === "string" && v.trim() && norm(v) !== "NAMA PARAMETER") groups.push({ c, label: String(v).trim() });
  }
  const cols = groups.map((g, i) => {
    const end = i + 1 < groups.length ? groups[i + 1].c : range.e.c + 1;
    const o = {};
    for (let c = g.c; c < end; c++) { const s = norm(get(S, c)); if (s && !(s in o)) o[s] = c; }
    return { ...g, cols: o };
  });
  const fin = cols.find((g) => norm(g.label).includes("FINAL"));
  const params = cols.filter((g) => g !== fin);
  const totalCol = (() => { for (let c = 0; c < sub.c; c++) if (norm(get(S, c)) === "TOTAL SCORE") return c; return -1; })();
  const kam = [];
  for (let r = S + 1; r <= range.e.r; r++) {
    const name = get(r, sub.c);
    if (!name) break;
    const g = (c) => (c == null ? null : num(get(r, c)));
    kam.push({
      name: String(name).trim(),
      role: norm(get(r, sub.c + 1)),
      region: norm(get(r, sub.c + 2)),
      params: params.map((p) => ({
        label: p.label,
        t: g(p.cols.TARGET), a: g(p.cols.ACTUAL), mult: g(p.cols.MULTIPLIER),
        ach: g(p.cols.ACH), score: g(p.cols.SCORE), w: g(p.cols.WEIGHT), kpi: g(p.cols["KPI SCORE"]),
      })),
      final: fin ? g(fin.c) : (totalCol >= 0 ? g(totalCol) : null),
    });
  }
  return { period, kam };
}

async function parseWorkbook(file) {
  const XLSX = await getXLSX();
  const buf = await file.arrayBuffer();
  const names = ["INTERNAL SALES", "KPI_IS_KAM"];
  const wb = XLSX.read(buf, { type: "array", sheets: names, cellFormula: false, cellHTML: false, cellText: false, cellStyles: false });
  const pick = (want) => wb.SheetNames.find((n) => norm(n) === want);
  const isName = pick("INTERNAL SALES");
  if (!isName) throw new Error('Sheet "INTERNAL SALES" tidak ada di file ini.');
  const is = parseInternalSales(XLSX, wb.Sheets[isName]);
  const kamName = pick("KPI_IS_KAM");
  const km = kamName ? parseKam(XLSX, wb.Sheets[kamName]) : { period: null, kam: [] };
  const period = is.period || km.period || toPeriod(file.name);
  if (!period) throw new Error("Periode tidak terbaca dari file (mis. 20261031 di bawah judul sheet).");
  return { period, weights: is.weights, people: is.people, kam: km.kam };
}

// ─── Database ────────────────────────────────────────────────────────────────
const isMissingTable = (e) => /relation .* does not exist|could not find the table|schema cache|42P01|PGRST205/i.test(`${e?.message || ""} ${e?.code || ""}`);

async function dbListPeriods() {
  const { data, error } = await supabase.from(TABLE).select("period, file_name, uploaded_at, uploaded_by_name").order("period", { ascending: false });
  if (error) throw error;
  return data || [];
}
async function dbLoad(period) {
  const { data, error } = await supabase.from(TABLE).select("period, file_name, uploaded_at, uploaded_by_name, data").eq("period", period).maybeSingle();
  if (error) throw error;
  return data;
}
async function dbSave(row) {
  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: "period" });
  if (error) throw error;
}

// ─── Small UI pieces ─────────────────────────────────────────────────────────
function Card({ t, children, style }) {
  return <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, boxShadow: t.shadowSm, ...style }}>{children}</div>;
}
function SectionTitle({ t, children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${t.lineSoft}`, flexWrap: "wrap" }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: t.hi }}>{children}</div>
      {right}
    </div>
  );
}
function Stat({ t, icon, label, value, sub, color }) {
  return (
    <Card t={t} style={{ padding: "16px 18px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.mid, fontSize: 11.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
        <span style={{ color: color || t.mid, display: "flex" }}>{icon}</span>{label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || t.hi, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: t.lo, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}
function ScorePill({ t, v }) {
  return (
    <span style={{ display: "inline-block", minWidth: 58, textAlign: "right", padding: "3px 8px", borderRadius: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: scoreColor(t, v), background: scoreBg(t, v) }}>
      {pct(v)}
    </span>
  );
}
function Select({ t, value, onChange, options, label }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: t.mid }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ height: 34, borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, padding: "0 8px", fontFamily: "inherit" }}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function KPI_InternalSales({ t, d, profile, canUpload = false, regionFilter = null }) {
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState("");
  const [record, setRecord] = useState(null); // { period, file_name, uploaded_at, uploaded_by_name, data }
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("ringkasan");
  const [busy, setBusy] = useState(""); // pesan proses upload
  const [pending, setPending] = useState(null); // hasil parse yg belum disimpan
  const [toast, setToast] = useState("");
  const fileRef = useRef(null);

  const refreshPeriods = async (want) => {
    try {
      const list = await dbListPeriods();
      setPeriods(list);
      setTableMissing(false);
      const p = want && list.some((x) => x.period === want) ? want : list[0]?.period || "";
      setPeriod(p);
      if (!p) setRecord(null);
    } catch (e) {
      if (isMissingTable(e)) setTableMissing(true); else setErr(e?.message || String(e));
      setLoading(false);
    }
  };

  useEffect(() => { refreshPeriods(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!period) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    dbLoad(period)
      .then((row) => { if (alive) { setRecord(row); setErr(""); } })
      .catch((e) => { if (alive) setErr(e?.message || String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period]);

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 3500); return () => clearTimeout(id); }, [toast]);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr("");
    setBusy(`Membaca ${f.name}… (file besar bisa butuh 10–30 detik)`);
    // beri kesempatan UI menampilkan status sebelum parsing berat
    await new Promise((r) => setTimeout(r, 50));
    try {
      const data = await parseWorkbook(f);
      setPending({ fileName: f.name, data });
    } catch (ex) {
      setErr(ex?.message || String(ex));
    } finally {
      setBusy("");
    }
  };

  const savePending = async () => {
    if (!pending) return;
    setBusy("Menyimpan…");
    const row = {
      period: pending.data.period,
      file_name: pending.fileName,
      data: pending.data,
      uploaded_by: profile?.id || null,
      uploaded_by_name: profile?.full_name || profile?.email || null,
      uploaded_at: new Date().toISOString(),
    };
    try {
      await dbSave(row);
      setPending(null);
      setToast(`Data ${periodLabel(row.period)} tersimpan.`);
      await refreshPeriods(row.period);
      setRecord(row);
    } catch (ex) {
      if (isMissingTable(ex)) {
        setTableMissing(true);
        setErr("Tabel kpi_is_data belum dibuat di Supabase, jadi data belum bisa disimpan. Dashboard di bawah adalah pratinjau dari file yang baru diupload.");
      } else setErr(`Gagal menyimpan: ${ex?.message || ex}`);
    } finally { setBusy(""); }
  };

  // Data yang ditampilkan: pratinjau upload (jika ada) atau data periode terpilih
  const view = pending ? { ...pending.data, _preview: true, fileName: pending.fileName } : record?.data ? { ...record.data, fileName: record.file_name, uploadedAt: record.uploaded_at, uploadedBy: record.uploaded_by_name } : null;
  const scoped = useMemo(() => {
    if (!view) return null;
    const rf = regionFilter ? norm(regionFilter) : null;
    return {
      ...view,
      people: rf ? view.people.filter((p) => p.region === rf) : view.people,
      kam: rf ? (view.kam || []).filter((k) => k.region === rf) : (view.kam || []),
    };
  }, [view, regionFilter]);

  const periodOptions = periods.map((p) => ({ v: p.period, l: periodLabel(p.period) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, color: t.hi }}>
      {/* Header */}
      <Card t={t} style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: d ? "rgba(237,28,36,0.14)" : "rgba(237,28,36,0.08)", color: t.blue, display: "flex", alignItems: "center", justifyContent: "center" }}><Award size={18} /></div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>KPI Internal Sales</div>
                <div style={{ fontSize: 12.5, color: t.mid }}>
                  Skor KPI HOR, HOA, DSO, DSP &amp; KAM{regionFilter ? ` · ${regionFilter}` : " · Sumatera"}
                </div>
              </div>
            </div>
            {view && (
              <div style={{ fontSize: 12, color: t.lo, marginTop: 10, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Calendar size={12} /> Periode <b style={{ color: t.hi }}>{periodLabel(view.period)}</b>
                <span>· {view.fileName}</span>
                {view.uploadedAt && <span>· diupload {new Date(view.uploadedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}{view.uploadedBy ? ` oleh ${view.uploadedBy}` : ""}</span>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            {periodOptions.length > 0 && !pending && (
              <Select t={t} label="Periode" value={period} onChange={setPeriod} options={periodOptions} />
            )}
            {canUpload && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={onFile} style={{ display: "none" }} />
                <button onClick={() => fileRef.current?.click()} disabled={!!busy}
                  style={{ height: 34, display: "flex", alignItems: "center", gap: 7, padding: "0 14px", borderRadius: 8, border: "none", background: t.blue, color: "#fff", fontSize: 13, fontWeight: 600, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", opacity: busy ? 0.7 : 1 }}>
                  {busy ? <Loader2 size={14} className="spin" style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={14} />} Upload Excel
                </button>
              </>
            )}
          </div>
        </div>
        {busy && <div style={{ marginTop: 12, fontSize: 12.5, color: t.mid, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />{busy}</div>}
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      </Card>

      {/* Banner pratinjau */}
      {pending && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap", padding: "12px 16px", borderRadius: 10, border: `1px solid ${t.yellowBd}`, background: t.yellowBg, color: t.hi, fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Info size={15} color={t.yellow} />
            <span>Pratinjau <b>{periodLabel(pending.data.period)}</b>: {pending.data.people.length} Internal Sales, {pending.data.kam.length} KAM.
              {periods.some((p) => p.period === pending.data.period) ? " Data periode ini sudah ada dan akan ditimpa." : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setPending(null)} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Batal</button>
            <button onClick={savePending} disabled={!!busy} style={{ height: 32, padding: "0 14px", borderRadius: 8, border: "none", background: t.green, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}><Check size={14} /> Simpan &amp; Publish</button>
          </div>
        </div>
      )}

      {err && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "12px 16px", borderRadius: 10, background: t.redBg, color: t.red, fontSize: 13 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ flex: 1 }}>{err}</span>
          <button onClick={() => setErr("")} style={{ background: "none", border: "none", color: t.red, cursor: "pointer" }}><X size={14} /></button>
        </div>
      )}
      {tableMissing && !err && !pending && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: t.yellowBg, border: `1px solid ${t.yellowBd}`, fontSize: 13, color: t.hi }}>
          Tabel <code>kpi_is_data</code> belum dibuat di Supabase. {canUpload ? "Upload Excel tetap bisa untuk pratinjau, tapi belum bisa disimpan." : "Hubungi admin SPM."}
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 50, padding: "10px 16px", borderRadius: 10, background: t.green, color: "#fff", fontSize: 13, fontWeight: 600, boxShadow: t.shadowMd }}>{toast}</div>
      )}

      {loading && !pending ? (
        <Card t={t} style={{ padding: 40, textAlign: "center", color: t.mid, fontSize: 13 }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /><div style={{ marginTop: 8 }}>Memuat data…</div></Card>
      ) : !scoped ? (
        <Card t={t} style={{ padding: "48px 24px", textAlign: "center" }}>
          <FileEmpty t={t} canUpload={canUpload} onUpload={() => fileRef.current?.click()} />
        </Card>
      ) : (
        <>
          <Tabs t={t} tab={tab} setTab={setTab} />
          {tab === "ringkasan" && <Overview t={t} data={scoped} />}
          {tab === "ranking" && <Ranking t={t} data={scoped} />}
          {tab === "kam" && <KamView t={t} data={scoped} />}
        </>
      )}
    </div>
  );
}

function FileEmpty({ t, canUpload, onUpload }) {
  return (
    <div>
      <div style={{ width: 48, height: 48, margin: "0 auto", borderRadius: 12, background: t.hover, display: "flex", alignItems: "center", justifyContent: "center", color: t.mid }}><Upload size={20} /></div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 12 }}>Belum ada data KPI</div>
      <div style={{ fontSize: 13, color: t.mid, marginTop: 4, maxWidth: 440, marginInline: "auto" }}>
        {canUpload ? 'Upload file Excel "KPI INTERNAL SALES KAM - Closing". Yang dibaca hanya sheet INTERNAL SALES dan KPI_IS_KAM.' : "Data akan tampil setelah admin SPM mengupload file KPI bulan ini."}
      </div>
      {canUpload && (
        <button onClick={onUpload} style={{ marginTop: 16, height: 36, padding: "0 16px", borderRadius: 8, border: "none", background: t.blue, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 7 }}><Upload size={14} /> Upload Excel</button>
      )}
    </div>
  );
}

function Tabs({ t, tab, setTab }) {
  const items = [{ k: "ringkasan", l: "Ringkasan" }, { k: "ranking", l: "Ranking Internal Sales" }, { k: "kam", l: "KAM" }];
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${t.line}`, overflowX: "auto" }}>
      {items.map((i) => (
        <button key={i.k} onClick={() => setTab(i.k)}
          style={{ padding: "10px 14px", background: "none", border: "none", borderBottom: `2px solid ${tab === i.k ? t.blue : "transparent"}`, color: tab === i.k ? t.hi : t.mid, fontWeight: tab === i.k ? 700 : 500, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", marginBottom: -1 }}>
          {i.l}
        </button>
      ))}
    </div>
  );
}

// ─── Ringkasan ───────────────────────────────────────────────────────────────
function Overview({ t, data }) {
  const people = data.people;
  const roles = ROLE_ORDER.filter((r) => people.some((p) => p.role === r)).concat([...new Set(people.map((p) => p.role))].filter((r) => r && !ROLE_ORDER.includes(r)));
  const regions = REGION_ORDER.filter((r) => people.some((p) => p.region === r)).concat([...new Set(people.map((p) => p.region))].filter((r) => r && !REGION_ORDER.includes(r)));
  const finals = people.map((p) => p.final).filter((v) => v != null);
  const above = finals.filter((v) => v >= 0.8).length;
  const below = finals.length - above;
  const kamAbove = (data.kam || []).filter((k) => (k.final ?? 0) >= 0.8).length;

  const byRole = roles.map((r) => {
    const ps = people.filter((p) => p.role === r);
    const f = ps.map((p) => p.final).filter((v) => v != null);
    return {
      role: r, n: ps.length, avg: avg(f),
      above: f.filter((v) => v >= 0.8).length, below: f.filter((v) => v < 0.8).length,
      slabs: SLABS.map((s) => f.filter(s.test).length),
    };
  });
  const sorted = [...people].filter((p) => p.final != null).sort((a, b) => b.final - a.final);
  const top = sorted.slice(0, 10);
  const bottom = sorted.slice(-10).reverse();
  const slabColors = [t.red, "#F97316", t.yellow, t.green];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Stat t={t} icon={<Users size={14} />} label="Peserta Internal Sales" value={people.length.toLocaleString("id-ID")} sub={`+ ${(data.kam || []).length} KAM`} />
        <Stat t={t} icon={<TrendingUp size={14} />} label="Rata-rata Final Score" value={pct(avg(finals))} color={scoreColor(t, avg(finals))} />
        <Stat t={t} icon={<Award size={14} />} label="Skor ≥ 80%" value={above.toLocaleString("id-ID")} sub={finals.length ? `${pct(above / finals.length, 0)} dari peserta` : ""} color={t.green} />
        <Stat t={t} icon={<AlertTriangle size={14} />} label="Skor < 80%" value={below.toLocaleString("id-ID")} sub={finals.length ? `${pct(below / finals.length, 0)} dari peserta` : ""} color={t.red} />
        {(data.kam || []).length > 0 && <Stat t={t} icon={<Briefcase size={14} />} label="KAM ≥ 80%" value={`${kamAbove} / ${data.kam.length}`} />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <Card t={t}>
          <SectionTitle t={t}>Skor per Role</SectionTitle>
          <div style={{ overflowX: "auto" }}>
            <table style={tblStyle}>
              <thead><tr>{["Role", "Peserta", "Rata-rata", "< 80%", "≥ 80%"].map((h, i) => <th key={h} style={th(t, i > 0)}>{h}</th>)}</tr></thead>
              <tbody>
                {byRole.map((r) => (
                  <tr key={r.role}>
                    <td style={td(t)}><b>{r.role}</b></td>
                    <td style={td(t, true)}>{r.n}</td>
                    <td style={td(t, true)}><ScorePill t={t} v={r.avg} /></td>
                    <td style={{ ...td(t, true), color: r.below ? t.red : t.lo, fontWeight: 600 }}>{r.below}</td>
                    <td style={{ ...td(t, true), color: t.green, fontWeight: 600 }}>{r.above}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td(t), fontWeight: 700 }}>Total</td>
                  <td style={{ ...td(t, true), fontWeight: 700 }}>{people.length}</td>
                  <td style={td(t, true)}><ScorePill t={t} v={avg(finals)} /></td>
                  <td style={{ ...td(t, true), fontWeight: 700, color: t.red }}>{below}</td>
                  <td style={{ ...td(t, true), fontWeight: 700, color: t.green }}>{above}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card t={t}>
          <SectionTitle t={t} right={
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {SLABS.map((s, i) => <span key={s.k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: t.mid }}><span style={{ width: 9, height: 9, borderRadius: 2, background: slabColors[i] }} />{s.label}</span>)}
            </div>
          }>Sebaran Slab Final Score</SectionTitle>
          <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            {byRole.map((r) => {
              const tot = r.slabs.reduce((a, b) => a + b, 0) || 1;
              return (
                <div key={r.role}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                    <b>{r.role}</b><span style={{ color: t.lo }}>{r.slabs.map((v, i) => `${SLABS[i].label}: ${v}`).join(" · ")}</span>
                  </div>
                  <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", background: t.hover, gap: 2 }}>
                    {r.slabs.map((v, i) => v > 0 && <div key={i} title={`${SLABS[i].label}: ${v}`} style={{ width: `${(v / tot) * 100}%`, background: slabColors[i] }} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {regions.length > 0 && (
        <Card t={t}>
          <SectionTitle t={t}>Rata-rata Final Score per Region</SectionTitle>
          <div style={{ overflowX: "auto" }}>
            <table style={tblStyle}>
              <thead><tr><th style={th(t)}>Region</th>{roles.map((r) => <th key={r} style={th(t, true)}>{r}</th>)}<th style={th(t, true)}>Semua</th><th style={th(t, true)}>&lt; 80%</th></tr></thead>
              <tbody>
                {regions.map((rg) => {
                  const ps = people.filter((p) => p.region === rg);
                  return (
                    <tr key={rg}>
                      <td style={td(t)}><b>{rg}</b></td>
                      {roles.map((r) => { const v = avg(ps.filter((p) => p.role === r).map((p) => p.final)); return <td key={r} style={td(t, true)}>{v == null ? <span style={{ color: t.lo }}>–</span> : <ScorePill t={t} v={v} />}</td>; })}
                      <td style={td(t, true)}><ScorePill t={t} v={avg(ps.map((p) => p.final))} /></td>
                      <td style={{ ...td(t, true), color: t.red, fontWeight: 600 }}>{ps.filter((p) => p.final != null && p.final < 0.8).length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card t={t}>
        <SectionTitle t={t}>Rata-rata Achievement per Parameter</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={tblStyle}>
            <thead><tr><th style={th(t)}>Parameter</th><th style={th(t, true)}>Bobot</th>{roles.filter((r) => r !== "HOR").map((r) => <th key={r} style={th(t, true)}>{r}</th>)}</tr></thead>
            <tbody>
              {PARAMS.map((pm) => (
                <tr key={pm.k}>
                  <td style={td(t)}>{pm.label}</td>
                  <td style={{ ...td(t, true), fontFamily: MONO, color: t.mid }}>{data.weights?.[pm.k] != null ? pct(data.weights[pm.k], 0) : "–"}</td>
                  {roles.filter((r) => r !== "HOR").map((r) => {
                    if (!pm.roles.includes(r)) return <td key={r} style={{ ...td(t, true), color: t.lo, fontSize: 11.5 }}>tidak dihitung</td>;
                    const v = avg(people.filter((p) => p.role === r).map((p) => p[pm.k]?.ach));
                    return <td key={r} style={td(t, true)}><ScorePill t={t} v={v} /></td>;
                  })}
                </tr>
              ))}
              <tr>
                <td style={td(t)}>Compliance Visit (skor)</td><td style={td(t, true)} />
                {roles.filter((r) => r !== "HOR").map((r) => <td key={r} style={td(t, true)}><ScorePill t={t} v={avg(people.filter((p) => p.role === r).map((p) => p.visit?.score))} /></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <TopList t={t} title="Top 10" rows={top} />
        <TopList t={t} title="Bottom 10" rows={bottom} />
      </div>
    </div>
  );
}

function TopList({ t, title, rows }) {
  return (
    <Card t={t}>
      <SectionTitle t={t}>{title}</SectionTitle>
      <div>
        {rows.map((p, i) => (
          <div key={`${p.nik}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", borderTop: i ? `1px solid ${t.lineSoft}` : "none" }}>
            <span style={{ width: 20, fontSize: 12, color: t.lo, fontFamily: MONO }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              <div style={{ fontSize: 11.5, color: t.lo }}>{p.role} · {p.territory} · {p.region}</div>
            </div>
            <ScorePill t={t} v={p.final} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Ranking ─────────────────────────────────────────────────────────────────
const COLS = [
  { k: "rank",      l: "#",            num: true,  get: (p) => p._rank },
  { k: "name",      l: "Nama",         get: (p) => p.name },
  { k: "role",      l: "Role",         get: (p) => p.role },
  { k: "territory", l: "Territory",    get: (p) => p.territory },
  { k: "region",    l: "Region",       get: (p) => p.region },
  { k: "sellin",    l: "SP Sell-in",   num: true, ach: true, get: (p) => (PARAMS[0].roles.includes(p.role) ? p.sellin?.ach : null) },
  { k: "rguga",     l: "RGU GA",       num: true, ach: true, get: (p) => (PARAMS[1].roles.includes(p.role) ? p.rguga?.ach : null) },
  { k: "trade",     l: "Trade Sup.",   num: true, ach: true, get: (p) => p.trade?.ach },
  { k: "dse",       l: "DSE Prod.",    num: true, ach: true, get: (p) => p.dse?.ach },
  { k: "fwa",       l: "FWA",          num: true, ach: true, get: (p) => p.fwa?.ach },
  { k: "visit",     l: "Visit",        num: true, ach: true, get: (p) => p.visit?.score },
  { k: "final",     l: "Final Score",  num: true, ach: true, get: (p) => p.final },
];

function Ranking({ t, data }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("ALL");
  const [region, setRegion] = useState("ALL");
  const [terr, setTerr] = useState("ALL");
  const [geo, setGeo] = useState("ALL");
  const [band, setBand] = useState("ALL");
  const [sort, setSort] = useState({ k: "final", dir: -1 });
  const [sel, setSel] = useState(null);

  const ranked = useMemo(() => {
    const s = [...data.people].sort((a, b) => (b.final ?? -1) - (a.final ?? -1));
    return s.map((p, i) => ({ ...p, _rank: i + 1 }));
  }, [data.people]);

  const uniq = (f, base = ranked) => [...new Set(base.map(f).filter(Boolean))].sort();
  const roleOpts = ROLE_ORDER.filter((r) => ranked.some((p) => p.role === r));
  const regionOpts = uniq((p) => p.region);
  const terrOpts = uniq((p) => p.territory, ranked.filter((p) => (role === "ALL" || p.role === role) && (region === "ALL" || p.region === region)));
  const geoOpts = uniq((p) => p.geo);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const col = COLS.find((c) => c.k === sort.k) || COLS[COLS.length - 1];
    return ranked
      .filter((p) => (role === "ALL" || p.role === role) && (region === "ALL" || p.region === region) && (terr === "ALL" || p.territory === terr) && (geo === "ALL" || p.geo === geo))
      .filter((p) => band === "ALL" || (band === "lt80" ? (p.final ?? 0) < 0.8 : (p.final ?? 0) >= 0.8))
      .filter((p) => !qq || p.name.toLowerCase().includes(qq) || p.nik.toLowerCase().includes(qq) || p.territory.toLowerCase().includes(qq))
      .sort((a, b) => {
        const va = col.get(a), vb = col.get(b);
        if (col.num) return ((va ?? -Infinity) - (vb ?? -Infinity)) * sort.dir;
        return String(va ?? "").localeCompare(String(vb ?? "")) * sort.dir;
      });
  }, [ranked, q, role, region, terr, geo, band, sort]);

  const exportXlsx = async () => {
    const XLSX = await getXLSX();
    const out = rows.map((p) => ({
      Rank: p._rank, NIK: p.nik, Nama: p.name, Role: p.role, Territory: p.territory, Region: p.region, "Geo Cat": p.geo,
      "SP Sell-in Ach": PARAMS[0].roles.includes(p.role) ? p.sellin?.ach : null,
      "RGU GA Trade Ach": PARAMS[1].roles.includes(p.role) ? p.rguga?.ach : null,
      "Trade Supply Ach": p.trade?.ach, "DSE Prod Ach": p.dse?.ach, "RGU GA FWA Ach": p.fwa?.ach,
      "Score Before Comp": p.before, "Visit Target": p.visit?.t, "Visit Actual": p.visit?.a, "Visit Score": p.visit?.score,
      Index: p.index, "Final Score": p.final,
    }));
    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KPI Internal Sales");
    XLSX.writeFile(wb, `KPI_Internal_Sales_${data.period}.xlsx`);
  };

  const opt = (arr, all = "Semua") => [{ v: "ALL", l: all }, ...arr.map((x) => ({ v: x, l: x }))];

  return (
    <Card t={t}>
      <div style={{ padding: "14px 18px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", borderBottom: `1px solid ${t.lineSoft}` }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: t.mid }}>Cari</span>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 9, top: 10, color: t.lo }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama, NIK, atau territory"
              style={{ width: "100%", height: 34, borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, padding: "0 10px 0 30px", fontFamily: "inherit", outline: "none" }} />
          </div>
        </label>
        <Select t={t} label="Role" value={role} onChange={(v) => { setRole(v); setTerr("ALL"); }} options={opt(roleOpts)} />
        <Select t={t} label="Region" value={region} onChange={(v) => { setRegion(v); setTerr("ALL"); }} options={opt(regionOpts)} />
        <Select t={t} label="Territory" value={terr} onChange={setTerr} options={opt(terrOpts)} />
        <Select t={t} label="Urban / Rural" value={geo} onChange={setGeo} options={opt(geoOpts)} />
        <Select t={t} label="Skor" value={band} onChange={setBand} options={[{ v: "ALL", l: "Semua" }, { v: "lt80", l: "< 80%" }, { v: "ge80", l: "≥ 80%" }]} />
        <button onClick={exportXlsx} style={{ height: 34, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          <Download size={14} /> Export Excel
        </button>
      </div>
      <div style={{ padding: "8px 18px", fontSize: 12, color: t.lo }}>{rows.length} dari {ranked.length} orang · klik baris untuk rincian · “–” = parameter tidak dihitung untuk role tersebut</div>
      <div style={{ overflow: "auto", maxHeight: "70vh" }}>
        <table style={tblStyle}>
          <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
            <tr>
              {COLS.map((c) => (
                <th key={c.k} onClick={() => setSort((s) => ({ k: c.k, dir: s.k === c.k ? -s.dir : (c.num ? -1 : 1) }))}
                  style={{ ...th(t, c.num), cursor: "pointer", background: t.card, userSelect: "none" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{c.l}{sort.k === c.k && (sort.dir < 0 ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={`${p.nik}-${p._rank}`} onClick={() => setSel(p)} style={{ cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = t.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                {COLS.map((c) => {
                  const v = c.get(p);
                  if (c.k === "final") return <td key={c.k} style={td(t, true)}><ScorePill t={t} v={v} /></td>;
                  if (c.ach) return <td key={c.k} style={{ ...td(t, true), fontFamily: MONO, fontSize: 12, color: v == null ? t.lo : scoreColor(t, v) }}>{v == null ? "–" : pct(v)}</td>;
                  if (c.k === "name") return <td key={c.k} style={{ ...td(t), fontWeight: 600, whiteSpace: "nowrap" }}>{v}<div style={{ fontSize: 11, color: t.lo, fontWeight: 400 }}>{p.nik}</div></td>;
                  return <td key={c.k} style={{ ...td(t, c.num), whiteSpace: "nowrap", color: c.k === "rank" ? t.lo : t.hi }}>{v}</td>;
                })}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={COLS.length} style={{ ...td(t), textAlign: "center", color: t.lo, padding: 24 }}>Tidak ada data yang cocok.</td></tr>}
          </tbody>
        </table>
      </div>
      {sel && <PersonModal t={t} p={sel} weights={data.weights} onClose={() => setSel(null)} />}
    </Card>
  );
}

function PersonModal({ t, p, weights, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const rows = [];
  if (p.role !== "HOR") {
    if (PARAMS[0].roles.includes(p.role)) {
      rows.push({ l: "Sell-in SP", t: p.sellinSp?.t, a: p.sellinSp?.a, ach: p.sellinSp?.ach, sub: true });
      rows.push({ l: "Retailer Tagging", t: p.tagging?.t, a: p.tagging?.a, ach: p.tagging?.ach, sub: true });
      rows.push({ l: "SP Sell-in & Retailer Tagging", ach: p.sellin?.ach, w: weights?.sellin });
    }
    if (PARAMS[1].roles.includes(p.role)) rows.push({ l: "RGU GA Trade", t: p.rguga?.t, a: p.rguga?.a, ach: p.rguga?.ach, w: weights?.rguga });
    rows.push({ l: "Trade Supply", t: p.trade?.t, a: p.trade?.a, ach: p.trade?.ach, w: weights?.trade, money: true });
    rows.push({ l: "DSE Productivity", t: p.dse?.score, a: p.dse?.count, ach: p.dse?.ach, w: weights?.dse, tl: "#Score", al: "#DSE" });
    rows.push({ l: "RGU GA FWA", t: p.fwa?.t, a: p.fwa?.a, ach: p.fwa?.ach, w: weights?.fwa });
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(640px, 100%)", maxHeight: "90vh", overflow: "auto", background: t.card, borderRadius: 14, border: `1px solid ${t.line}`, boxShadow: t.shadowLg }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.lineSoft}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
            <div style={{ fontSize: 12.5, color: t.mid, marginTop: 2 }}>{p.nik} · {p.role} · {p.territory} · {p.region}{p.geo ? ` · ${p.geo}` : ""}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, color: t.mid, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Final Score</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: scoreColor(t, p.final) }}>{pct(p.final)}</div>
            <div style={{ fontSize: 11, color: t.lo }}>Rank #{p._rank}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.mid, cursor: "pointer", padding: 2 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "8px 0" }}>
          {rows.length > 0 && (
            <table style={tblStyle}>
              <thead><tr>{["Parameter", "Target", "Actual", "Ach", "Bobot"].map((h, i) => <th key={h} style={th(t, i > 0)}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...td(t), paddingLeft: r.sub ? 30 : 18, color: r.sub ? t.mid : t.hi, fontWeight: r.sub ? 400 : 600 }}>{r.l}</td>
                    <td style={{ ...td(t, true), fontFamily: MONO, fontSize: 12 }}>{r.t == null ? "" : r.tl ? r.t.toFixed(1) : fmtN(r.t)}</td>
                    <td style={{ ...td(t, true), fontFamily: MONO, fontSize: 12 }}>{r.a == null ? "" : fmtN(r.a)}</td>
                    <td style={td(t, true)}>{r.ach == null ? "–" : r.sub ? <span style={{ fontFamily: MONO, fontSize: 12, color: scoreColor(t, r.ach) }}>{pct(r.ach)}</span> : <ScorePill t={t} v={r.ach} />}</td>
                    <td style={{ ...td(t, true), fontFamily: MONO, fontSize: 12, color: t.mid }}>{r.w != null ? pct(r.w, 0) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, padding: "12px 18px" }}>
            {p.role !== "HOR" && <MiniStat t={t} l="Skor sebelum compliance" v={pct(p.before)} />}
            {p.role !== "HOR" && <MiniStat t={t} l="Compliance Visit" v={pct(p.visit?.score)} s={p.visit?.t != null ? `${fmtN(p.visit.a)} / ${fmtN(p.visit.t)} visit` : ""} />}
            {p.role !== "HOR" && <MiniStat t={t} l="Index" v={pct(p.index)} />}
            <MiniStat t={t} l="Prepaid Revenue Region" v={pct(p.rev?.score)} s={p.rev?.t != null ? `${fmtN(p.rev.a)} / ${fmtN(p.rev.t)}` : ""} />
          </div>
          {p.role === "HOR" && <div style={{ padding: "0 18px 14px", fontSize: 12, color: t.lo }}>HOR tidak memakai parameter individual di sheet ini; final score diambil langsung dari file.</div>}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ t, l, v, s }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 9, background: t.hover }}>
      <div style={{ fontSize: 11, color: t.mid }}>{l}</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{v}</div>
      {s && <div style={{ fontSize: 11, color: t.lo }}>{s}</div>}
    </div>
  );
}

// ─── KAM ─────────────────────────────────────────────────────────────────────
function KamView({ t, data }) {
  const kam = [...(data.kam || [])].sort((a, b) => (b.final ?? 0) - (a.final ?? 0));
  if (!kam.length) return <Card t={t} style={{ padding: 32, textAlign: "center", color: t.mid, fontSize: 13 }}>Tidak ada data KAM (sheet KPI_IS_KAM kosong atau tidak ada).</Card>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      {kam.map((k, i) => (
        <Card t={t} key={`${k.name}-${i}`}>
          <div style={{ padding: "16px 18px", display: "flex", gap: 12, alignItems: "flex-start", borderBottom: `1px solid ${t.lineSoft}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: t.lo, fontWeight: 600 }}>#{i + 1} · {k.role || "KAM"}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{k.name}</div>
              <div style={{ fontSize: 12.5, color: t.mid }}>{k.region}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10.5, color: t.mid, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Final Score</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: scoreColor(t, k.final) }}>{pct(k.final)}</div>
            </div>
          </div>
          <div style={{ padding: "10px 18px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {k.params.map((p, j) => {
              const money = (p.t ?? 0) > 1e6;
              return (
                <div key={j}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                    <span style={{ fontWeight: 600 }}>{p.label}</span>
                    <span style={{ color: t.mid, fontFamily: MONO, fontSize: 11.5 }}>bobot {pct(p.w, 0)} · KPI {pct(p.kpi)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: t.hover, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, ((p.ach ?? 0) / 1.3) * 100)}%`, height: "100%", background: scoreColor(t, p.ach) }} />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: scoreColor(t, p.ach), minWidth: 54, textAlign: "right" }}>{pct(p.ach)}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: t.lo, marginTop: 4 }}>
                    Target {money ? fmtN(p.t) : pct(p.t)} · Actual {money ? fmtN(p.a) : pct(p.a)}{p.mult != null ? ` · Multiplier ${p.mult}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Table styles ────────────────────────────────────────────────────────────
const tblStyle = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = (t, right) => ({ textAlign: right ? "right" : "left", padding: "9px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: t.mid, borderBottom: `1px solid ${t.line}`, whiteSpace: "nowrap" });
const td = (t, right) => ({ textAlign: right ? "right" : "left", padding: "8px 12px", borderBottom: `1px solid ${t.lineSoft}`, color: t.hi, verticalAlign: "middle", fontVariantNumeric: "tabular-nums" });
