"use client";

// ============================================================
// MFTS — Territory Mapping (master kecamatan x brand)
// Upload file IOH Territory (.xlsb/.xlsx), pilih kolom sendiri,
// generate breakdown 1 baris/kecamatan/brand, tandai BARU bulan ini,
// data lama tidak bergerak (first_seen_month dikunci).
// ============================================================

import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { UploadCloud, Loader2, CheckCircle2, Sparkles, Save, AlertTriangle, Filter, FileSpreadsheet } from "lucide-react";
import MFTSProgress from "./MFTS_Progress";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA",
  line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4",
  teal: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)", tealBd: d ? "rgba(50,188,173,.3)" : "rgba(26,158,144,.2)",
  amber: "#D4A800", amberBg: d ? "rgba(255,203,5,.14)" : "rgba(212,168,0,.12)", amberBd: d ? "rgba(255,203,5,.35)" : "rgba(212,168,0,.3)",
  mag: "#C6168D", magBg: d ? "rgba(198,22,141,.12)" : "rgba(198,22,141,.07)", magBd: d ? "rgba(198,22,141,.3)" : "rgba(198,22,141,.18)",
  blue: d ? "#0A84FF" : "#2563EB", blueBg: d ? "rgba(10,132,255,.12)" : "rgba(37,99,235,.08)", blueBd: d ? "rgba(10,132,255,.3)" : "rgba(37,99,235,.2)",
  red: "#ED1C24", redBg: d ? "rgba(237,28,36,.1)" : "rgba(237,28,36,.07)", redBd: d ? "rgba(237,28,36,.25)" : "rgba(237,28,36,.18)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

const colLetter = (i) => {
  let s = ""; i = Number(i);
  do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
  return s;
};
const curMonth = () => { const n = new Date(); return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}`; };

// Helper hybrid (selaras dengan MFTS_Allocation) — untuk deteksi cluster ter-hybrid
// yang berisiko terlepas saat upload territory bulan baru.
const up = (s) => String(s || "").toUpperCase().trim();
const baseName = (n) => up(n).replace(/^(MC[- ]|CS[- ])/, "").trim();
function matchHybrid(r, c) {
  const v = r.scope_value;
  switch (r.scope_level) {
    case "circle": return up(c.circle) === up(v) || up(v) === "SUMATERA" || up(v) === "ALL";
    case "region": return up(c.region) === up(v);
    case "area": return up(c.area) === up(v);
    case "branch": return up(c.branch) === up(v);
    case "cluster": return baseName(c.mc_cluster) === baseName(v);
    default: return false;
  }
}

// Tebak default berdasarkan nama sheet
const guessSheet = (sheets, key) => sheets.find((s) => s.toUpperCase().replace(/\s/g, "").includes(key)) || "";

export default function MFTS_Territory({ supabase, theme = "dark", profile }) {
  const d = theme === "dark";
  const t = mk(d);

  const [month, setMonth] = useState(curMonth());
  const [wb, setWb] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  // konfigurasi per brand (kolom selectable)
  const [cfg, setCfg] = useState({
    IM3: { sheet: "", headerRow: 0, kecCol: 2, mcCol: 17, branchCol: 18, areaCol: 19, regionCol: 20, circleCol: 21, circleFilter: "" },
    "3ID": { sheet: "", headerRow: 0, kecCol: 2, mcCol: 16, branchCol: 18, areaCol: 19, regionCol: 20, circleCol: 21, circleFilter: "" },
  });
  const [breakdown, setBreakdown] = useState(null); // {rows, newCount}
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [prog, setProg] = useState(null);

  function readFile(f) {
    if (!f) return;
    const okExt = /\.(xlsb|xlsx|xls)$/i.test(f.name || "");
    if (!okExt) { setErr("Format tidak didukung. Gunakan file .xlsb, .xlsx, atau .xls"); return; }
    setReading(true); setErr(""); setBreakdown(null); setDone("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const b = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
        setWb(b); setSheets(b.SheetNames); setFileName(f.name);
        setCfg((p) => ({
          IM3: { ...p.IM3, sheet: guessSheet(b.SheetNames, "IM3") || b.SheetNames[0] || "" },
          "3ID": { ...p["3ID"], sheet: guessSheet(b.SheetNames, "3ID") || b.SheetNames[0] || "" },
        }));
      } catch (e2) { setErr("Gagal membaca file: " + e2.message); }
      finally { setReading(false); }
    };
    reader.onerror = () => { setErr("Gagal membuka file"); setReading(false); };
    reader.readAsArrayBuffer(f);
  }

  function onFile(e) { readFile(e.target.files?.[0]); e.target.value = ""; }
  function onDrop(e) {
    e.preventDefault(); e.stopPropagation(); setDrag(false);
    readFile(e.dataTransfer.files?.[0]);
  }

  // header (untuk dropdown kolom) per brand
  const headersOf = (sheet, headerRow) => {
    if (!wb || !sheet || !wb.Sheets[sheet]) return [];
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" });
    return (aoa[headerRow] || []).map((h, i) => ({ i, label: String(h || "").trim() }));
  };

  const setBrandCfg = (brand, patch) => setCfg((p) => ({ ...p, [brand]: { ...p[brand], ...patch } }));

  // nilai unik pada satu kolom (untuk dropdown filter circle)
  const uniqueOf = (sheet, headerRow, col) => {
    if (!wb || !sheet || !wb.Sheets[sheet] || col == null) return [];
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" });
    const set = new Set();
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const v = String((aoa[r] || [])[col] ?? "").trim();
      if (v) set.add(v);
    }
    return [...set].sort();
  };

  function buildBrand(brand) {
    const c = cfg[brand];
    if (!wb || !c.sheet || !wb.Sheets[c.sheet]) return [];
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[c.sheet], { header: 1, defval: "" });
    const filt = (c.circleFilter || "").trim().toUpperCase();   // filter circle per brand (kosong = semua)
    const out = new Map(); // kec_id -> row (dedup)
    for (let r = c.headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const kec = String(row[c.kecCol] ?? "").trim();   // KEC-ID utuh (tidak dipecah)
      if (!kec) continue;
      const circle = String(row[c.circleCol] ?? "").trim();
      if (filt && circle.toUpperCase() !== filt) continue;   // filter circle
      // Rapikan spasi ganda agar nama cluster konsisten lintas bulan (cegah "cluster baru" palsu).
      const mc = String(row[c.mcCol] ?? "").trim().replace(/\s+/g, " ");
      const branch = String(row[c.branchCol] ?? "").trim();
      const area = String(row[c.areaCol] ?? "").trim();
      const region = String(row[c.regionCol] ?? "").trim();
      if (!out.has(kec)) out.set(kec, { brand, kec_id: kec, mc_cluster: mc, branch, area, region, circle });
    }
    return [...out.values()];
  }

  async function generate() {
    setErr(""); setDone("");
    try {
      const rowsIM3 = buildBrand("IM3");
      const rows3ID = buildBrand("3ID");
      const all = [...rowsIM3, ...rows3ID];
      if (all.length === 0) { setErr("Tidak ada baris terbaca — cek pilihan sheet/kolom."); return; }

      // existing (geo lengkap) utk diff + preserve-on-blank.
      // PENTING: Supabase membatasi 1000 baris/permintaan → WAJIB paginate,
      // kalau tidak, baris >1000 akan keliru terdeteksi "BARU" saat re-upload.
      const ex = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("mf_territory")
          .select("brand,kec_id,first_seen_month,mc_cluster,branch,area,region,circle")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        ex.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      const { data: hy } = await supabase.from("mf_hybrid_map").select("scope_level,scope_value").eq("manpower_type", "DSF");
      const exMap = new Map((ex || []).map((e) => [`${e.brand}|${e.kec_id}`, e]));
      const hyRules = hy || [];
      let newCount = 0;
      // Preserve-on-blank: nilai geo lama TIDAK ditimpa nilai kosong dari file baru.
      // Nilai baru yang non-kosong tetap menang (remap disengaja).
      const rows = all.map((r) => {
        const found = exMap.get(`${r.brand}|${r.kec_id}`);
        const isNew = !found;
        if (isNew) newCount++;
        return {
          ...r,
          mc_cluster: r.mc_cluster || found?.mc_cluster || "",
          branch: r.branch || found?.branch || "",
          area: r.area || found?.area || "",
          region: r.region || found?.region || "",
          circle: r.circle || found?.circle || "",
          isNew, first_seen_month: found?.first_seen_month || month,
          _old: found || null,
        };
      });

      // Diff level CLUSTER: identitas baris adalah brand|kec_id (kecamatan), jadi
      // upload ulang MC/CS bulan depan TIDAK pernah jadi "kecamatan baru". Di sini
      // kita juga hitung apakah ada nama cluster yang benar-benar baru, supaya bisa
      // dipastikan re-upload format terpisah = 0 cluster baru.
      const exClusters = new Set((ex || []).map((e) => `${e.brand}|${String(e.mc_cluster || "").trim().replace(/\s+/g, " ")}`));
      const newClusterSet = new Set();
      for (const r of rows) { const ck = `${r.brand}|${r.mc_cluster}`; if (r.mc_cluster && !exClusters.has(ck)) newClusterSet.add(ck); }
      const newClusters = [...newClusterSet];

      // Peringatan hybrid: cluster yang lama ter-hybrid tapi (a) jadi tak tercakup,
      // atau (b) field geo penentu berubah → mapping hybrid bisa terlepas.
      const warn = [];
      if (hyRules.length) {
        for (const r of rows) {
          if (!r._old) continue;
          const oldC = { region: r._old.region, area: r._old.area, branch: r._old.branch, mc_cluster: r._old.mc_cluster, circle: r._old.circle };
          const newC = { region: r.region, area: r.area, branch: r.branch, mc_cluster: r.mc_cluster, circle: r.circle };
          if (!hyRules.some((h) => matchHybrid(h, oldC))) continue;
          const nowHy = hyRules.some((h) => matchHybrid(h, newC));
          const changed = ["region", "area", "branch", "mc_cluster"].filter((f) => up(oldC[f]) !== up(newC[f]));
          if (!nowHy || changed.length) warn.push({ brand: r.brand, kec_id: r.kec_id, lost: !nowHy, changed, oldC, newC });
        }
      }
      setBreakdown({ rows, newCount, warn, newClusters });
    } catch (e) { setErr("Gagal generate: " + e.message); }
  }

  async function save() {
    if (!breakdown) return;
    setSaving(true); setErr(""); setDone("");
    try {
      const now = new Date().toISOString();
      const payload = breakdown.rows.map((r) => ({
        brand: r.brand, kec_id: r.kec_id, mc_cluster: r.mc_cluster,
        branch: r.branch || null, area: r.area || null, region: r.region || null,
        circle: r.circle || null,
        first_seen_month: r.first_seen_month, last_seen_month: month,
        active: true, updated_at: now,
      }));
      // batch upsert (preserve first_seen_month krn dikirim ulang utk yg lama)
      for (let i = 0; i < payload.length; i += 500) {
        setProg({ done: Math.min(i + 500, payload.length), total: payload.length, label: "Menyimpan territory…" });
        const { error } = await supabase.from("mf_territory").upsert(payload.slice(i, i + 500), { onConflict: "brand,kec_id" });
        if (error) throw new Error(error.message);
      }
      await supabase.from("mf_territory_uploads").insert({
        month, total: payload.length, new_count: breakdown.newCount,
        uploaded_by: profile?.id || null, uploaded_name: profile?.full_name || profile?.email || null,
      });

      // Normalisasi rule hybrid level cluster → kanonik "MC-<base>" agar tetap
      // konsisten & aman walau territory bulan berikutnya tetap terpisah MC/CS.
      let ruleFix = 0;
      try {
        const { data: hyAll } = await supabase.from("mf_hybrid_map")
          .select("id,scope_value").eq("manpower_type", "DSF").eq("scope_level", "cluster");
        const groups = {};
        for (const r of hyAll || []) { const canon = `MC-${baseName(r.scope_value)}`; (groups[canon] = groups[canon] || []).push(r); }
        for (const [canon, list] of Object.entries(groups)) {
          const keeper = list.find((r) => up(r.scope_value) === up(canon)) || list[0];
          for (const r of list) if (r.id !== keeper.id) { await supabase.from("mf_hybrid_map").delete().eq("id", r.id); ruleFix++; }
          if (up(keeper.scope_value) !== up(canon)) { await supabase.from("mf_hybrid_map").update({ scope_value: canon }).eq("id", keeper.id); ruleFix++; }
        }
      } catch { /* normalisasi best-effort, jangan gagalkan simpan */ }

      setDone(`Tersimpan: ${payload.length} baris (${breakdown.newCount} BARU bulan ${month})${ruleFix ? ` · ${ruleFix} rule hybrid dinormalkan ke MC-` : ""}.`);
    } catch (e) { setErr("Gagal menyimpan: " + e.message); }
    finally { setSaving(false); setProg(null); }
  }

  const card = { background: t.card, border: `1px solid ${t.line}`, borderRadius: 14 };
  const previewRows = useMemo(() => {
    if (!breakdown) return [];
    return onlyNew ? breakdown.rows.filter((r) => r.isNew) : breakdown.rows;
  }, [breakdown, onlyNew]);

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Territory Mapping</div>
        <div style={{ fontSize: 13, color: t.mid, marginTop: 2 }}>Upload file IOH Territory → breakdown per kecamatan (IM3 & 3ID). Yang baru bulan ini ditandai; data lama tidak berubah.</div>
      </div>

      {/* Upload + month */}
      <div style={{ ...card, padding: 16, marginBottom: 16, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "stretch" }}>
        {/* Dropzone — area klik & drag-drop yang jelas */}
        <div style={{ flex: "1 1 320px" }}>
          <div style={lbl(t)}>File Territory</div>
          <input ref={fileRef} type="file" accept=".xlsb,.xlsx,.xls" onChange={onFile} style={{ display: "none" }} />
          <div
            role="button" tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!drag) setDrag(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); }}
            onDrop={onDrop}
            style={{
              display: "flex", alignItems: "center", gap: 14, cursor: "pointer",
              padding: "16px 18px", borderRadius: 12,
              border: `2px dashed ${drag ? t.teal : fileName ? t.tealBd : t.line}`,
              background: drag ? t.tealBg : fileName ? t.tealBg : t.sub,
              transition: "all .15s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 10, background: t.card, border: `1px solid ${fileName ? t.tealBd : t.line}`, color: fileName ? t.teal : t.mid, flexShrink: 0 }}>
              {reading ? <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} /> : fileName ? <FileSpreadsheet size={22} /> : <UploadCloud size={22} />}
            </div>
            <div style={{ minWidth: 0 }}>
              {reading ? (
                <div style={{ fontSize: 13.5, fontWeight: 700, color: t.hi }}>Membaca file…</div>
              ) : fileName ? (
                <>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.teal, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</div>
                  <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2 }}>{sheets.length} sheet · klik untuk ganti file</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.hi }}>{drag ? "Lepaskan file di sini" : "Klik untuk pilih file, atau seret & lepas ke sini"}</div>
                  <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2 }}>Mendukung format .xlsb, .xlsx, .xls (file IOH Territory)</div>
                </>
              )}
            </div>
          </div>
        </div>
        <div style={{ width: 130, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={lbl(t)}>Bulan (YYYYMM)</div>
          <input value={month} onChange={(e) => setMonth(e.target.value.trim())} style={inp(t)} />
        </div>
      </div>

      {err && <div style={{ ...card, padding: 12, borderColor: t.redBd, background: t.redBg, color: t.red, marginBottom: 14, fontSize: 13 }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {err}</div>}
      <MFTSProgress t={t} prog={prog} />

      {/* Konfigurasi kolom per brand */}
      {sheets.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, marginBottom: 16 }}>
          {["IM3", "3ID"].map((brand) => {
            const c = cfg[brand];
            const headers = headersOf(c.sheet, c.headerRow);
            const accent = brand === "IM3" ? t.amber : t.mag;
            const accentBg = brand === "IM3" ? t.amberBg : t.magBg;
            const accentBd = brand === "IM3" ? t.amberBd : t.magBd;
            return (
              <div key={brand} style={{ ...card, padding: 16, borderColor: accentBd }}>
                <div style={{ display: "inline-block", fontSize: 12, fontWeight: 800, color: accent, background: accentBg, border: `1px solid ${accentBd}`, padding: "3px 10px", borderRadius: 999, marginBottom: 12 }}>{brand}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={lbl(t)}>Sheet</div>
                    <select value={c.sheet} onChange={(e) => setBrandCfg(brand, { sheet: e.target.value })} style={inp(t)}>
                      {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={lbl(t)}>Baris header</div>
                      <input type="number" min={1} value={c.headerRow + 1} onChange={(e) => setBrandCfg(brand, { headerRow: Math.max(0, (Number(e.target.value) || 1) - 1) })} style={inp(t)} />
                    </div>
                  </div>
                  <div>
                    <div style={lbl(t)}>Kolom Kec-ID</div>
                    <ColSelect t={t} headers={headers} value={c.kecCol} onChange={(v) => setBrandCfg(brand, { kecCol: v })} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={lbl(t)}>Kolom {brand === "IM3" ? "MC" : "Cluster"}</div>
                      <ColSelect t={t} headers={headers} value={c.mcCol} onChange={(v) => setBrandCfg(brand, { mcCol: v })} />
                    </div>
                    <div>
                      <div style={lbl(t)}>Kolom Branch</div>
                      <ColSelect t={t} headers={headers} value={c.branchCol} onChange={(v) => setBrandCfg(brand, { branchCol: v })} />
                    </div>
                    <div>
                      <div style={lbl(t)}>Kolom Area</div>
                      <ColSelect t={t} headers={headers} value={c.areaCol} onChange={(v) => setBrandCfg(brand, { areaCol: v })} />
                    </div>
                    <div>
                      <div style={lbl(t)}>Kolom Region</div>
                      <ColSelect t={t} headers={headers} value={c.regionCol} onChange={(v) => setBrandCfg(brand, { regionCol: v })} />
                    </div>
                    <div>
                      <div style={lbl(t)}>Kolom Circle</div>
                      <ColSelect t={t} headers={headers} value={c.circleCol} onChange={(v) => setBrandCfg(brand, { circleCol: v })} />
                    </div>
                    <div>
                      <div style={lbl(t)}>Filter Circle</div>
                      <select value={c.circleFilter} onChange={(e) => setBrandCfg(brand, { circleFilter: e.target.value })} style={inp(t)}>
                        <option value="">— semua circle —</option>
                        {uniqueOf(c.sheet, c.headerRow, c.circleCol).map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <SheetPreview t={t} wb={wb} sheet={c.sheet} headerRow={c.headerRow}
                  cols={{ kecCol: c.kecCol, mcCol: c.mcCol, branchCol: c.branchCol, areaCol: c.areaCol, regionCol: c.regionCol, circleCol: c.circleCol }}
                  accent={accent} accentBg={accentBg} mcLabel={brand === "IM3" ? "MC" : "Cluster"}
                  onPick={(field, col) => setBrandCfg(brand, { [field]: col })} />
              </div>
            );
          })}
        </div>
      )}

      {sheets.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={generate} style={{ ...btn(t), background: t.teal, color: "#fff", borderColor: t.teal }}>
            <Sparkles size={15} /> Generate Breakdown
          </button>
        </div>
      )}

      {/* Preview */}
      {breakdown && (
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              Breakdown · <span style={{ color: t.mid }}>{breakdown.rows.length} baris</span> · <span style={{ color: t.amber, fontWeight: 800 }}>{breakdown.newCount} kec. BARU</span>
              {breakdown.newClusters && (
                breakdown.newClusters.length === 0
                  ? <span style={{ color: t.teal, fontWeight: 800 }}> · 0 cluster baru ✓</span>
                  : <span style={{ color: t.amber, fontWeight: 800 }} title={breakdown.newClusters.slice(0, 50).join(", ")}> · {breakdown.newClusters.length} cluster baru</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setOnlyNew((v) => !v)} style={{ ...btn(t), background: onlyNew ? t.amberBg : t.sub, color: onlyNew ? t.amber : t.mid, borderColor: onlyNew ? t.amberBd : t.line }}>
                <Filter size={13} /> {onlyNew ? "Tampilkan semua" : "Hanya BARU"}
              </button>
              <button disabled={saving} onClick={save} style={{ ...btn(t), background: t.teal, color: "#fff", borderColor: t.teal }}>
                {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />} Simpan
              </button>
            </div>
          </div>
          {breakdown.warn && breakdown.warn.length > 0 && (
            <div style={{ padding: "11px 16px", background: t.amberBg, borderBottom: `1px solid ${t.amberBd}`, color: d ? t.amber : "#8a6d00", fontSize: 12.5 }}>
              <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <AlertTriangle size={14} /> {breakdown.warn.length} cluster ter-hybrid berisiko saat disimpan
              </div>
              <div style={{ color: t.mid, marginBottom: 6 }}>
                Mapping hybrid (mis. region <b>Central Sumatera</b>) bisa terlepas karena geo-nya berubah. Periksa dulu; data lama tidak akan ditimpa nilai kosong, hanya nilai baru yang benar-benar berbeda.
              </div>
              <div style={{ maxHeight: 120, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                {breakdown.warn.slice(0, 40).map((w, i) => (
                  <div key={i} style={{ fontSize: 11.5 }}>
                    <b style={{ color: w.brand === "IM3" ? t.amber : t.mag }}>{w.brand}</b> · {w.kec_id} —{" "}
                    {w.lost
                      ? <span style={{ color: t.red, fontWeight: 700 }}>akan kehilangan hybrid</span>
                      : <span>{w.changed.map((f) => `${f}: "${w.oldC[f] || "—"}" → "${w.newC[f] || "—"}"`).join(", ")}</span>}
                  </div>
                ))}
                {breakdown.warn.length > 40 && <div style={{ color: t.lo }}>…dan {breakdown.warn.length - 40} lainnya.</div>}
              </div>
            </div>
          )}
          {done && <div style={{ padding: "10px 16px", color: t.teal, fontSize: 13, fontWeight: 600, background: t.tealBg, borderBottom: `1px solid ${t.line}` }}><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> {done}</div>}
          <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
              <thead style={{ position: "sticky", top: 0 }}>
                <tr style={{ background: t.sub, color: t.mid, textAlign: "left" }}>
                  {["Brand", "Kec-ID", "MC / Cluster", "Branch", "Area", "Region", "Circle", "Status"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 1000).map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${t.line}`, background: r.isNew ? t.amberBg : "transparent" }}>
                    <td style={{ padding: "7px 12px", fontWeight: 700, color: r.brand === "IM3" ? t.amber : t.mag }}>{r.brand}</td>
                    <td style={{ padding: "7px 12px", color: t.hi, fontWeight: 600 }}>{r.kec_id}</td>
                    <td style={{ padding: "7px 12px", color: t.mid }}>{r.mc_cluster || "—"}</td>
                    <td style={{ padding: "7px 12px", color: t.mid }}>{r.branch || "—"}</td>
                    <td style={{ padding: "7px 12px", color: t.mid }}>{r.area || "—"}</td>
                    <td style={{ padding: "7px 12px", color: t.mid }}>{r.region || "—"}</td>
                    <td style={{ padding: "7px 12px", color: t.mid }}>{r.circle || "—"}</td>
                    <td style={{ padding: "7px 12px" }}>
                      {r.isNew
                        ? <span style={{ fontSize: 10, fontWeight: 800, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, padding: "2px 8px", borderRadius: 999 }}>BARU</span>
                        : <span style={{ fontSize: 11, color: t.lo }}>sejak {r.first_seen_month}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewRows.length > 1000 && <div style={{ padding: 10, textAlign: "center", color: t.lo, fontSize: 12 }}>Menampilkan 1000 dari {previewRows.length} baris (semua tetap disimpan).</div>}
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function SheetPreview({ t, wb, sheet, headerRow, cols: sel, accent, accentBg, mcLabel, onPick }) {
  const [mode, setMode] = useState("kecCol");
  if (!wb || !sheet || !wb.Sheets[sheet]) return null;
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "" });
  const ncols = Math.min(40, Math.max(0, ...aoa.slice(0, 40).map((r) => r.length)));
  const colIdx = Array.from({ length: ncols }, (_, i) => i);
  const header = aoa[headerRow] || [];
  const dataRows = aoa.slice(headerRow + 1, headerRow + 1 + 6);

  // definisi field: warna + label, urut dari terkecil
  const FIELDS = [
    { key: "kecCol", label: "Kec-ID", c: accent, bg: accentBg },
    { key: "mcCol", label: mcLabel, c: t.teal, bg: t.tealBg },
    { key: "branchCol", label: "Branch", c: t.blue, bg: t.blueBg },
    { key: "areaCol", label: "Area", c: "#E8830C", bg: "rgba(232,131,12,.14)" },
    { key: "regionCol", label: "Region", c: t.mag, bg: t.magBg },
    { key: "circleCol", label: "Circle", c: "#16A34A", bg: "rgba(22,163,74,.14)" },
  ];
  const byCol = {}; FIELDS.forEach((f) => { byCol[sel[f.key]] = f; });
  const fOf = (ci) => byCol[ci];

  const cell = (ci, txt, isHead) => {
    const f = fOf(ci);
    return (
      <td key={ci} style={{
        padding: "5px 9px", borderRight: `1px solid ${t.line}`, borderBottom: `1px solid ${t.line}`,
        background: f ? f.bg : isHead ? t.sub : "transparent",
        color: f ? t.hi : isHead ? t.mid : t.lo, fontWeight: isHead ? 700 : 500,
        maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{String(txt ?? "")}</td>
    );
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ ...lbl(t), margin: 0 }}>Preview — pilih jenis lalu klik judul kolom</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {FIELDS.map((f) => (
            <button key={f.key} onClick={() => setMode(f.key)} style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, cursor: "pointer", fontFamily: FF, border: `1px solid ${mode === f.key ? f.c : t.line}`, background: mode === f.key ? f.bg : "transparent", color: mode === f.key ? f.c : t.mid }}>{f.label}</button>
          ))}
        </div>
      </div>
      <div style={{ overflow: "auto", border: `1px solid ${t.line}`, borderRadius: 8, maxHeight: 230 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
          <thead style={{ position: "sticky", top: 0 }}>
            <tr>
              {colIdx.map((ci) => {
                const f = fOf(ci);
                return (
                  <th key={ci} onClick={() => onPick(mode, ci)} title="klik untuk pilih kolom ini"
                    style={{ padding: "5px 9px", cursor: "pointer", borderRight: `1px solid ${t.line}`, borderBottom: `2px solid ${f ? f.c : t.line}`, background: f ? f.bg : t.sub, color: f ? t.hi : t.mid, fontWeight: 800, whiteSpace: "nowrap" }}>
                    {colLetter(ci)}{f ? ` · ${f.label}` : ""}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr>{colIdx.map((ci) => cell(ci, header[ci], true))}</tr>
            {dataRows.map((r, ri) => <tr key={ri}>{colIdx.map((ci) => cell(ci, r[ci], false))}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColSelect({ t, headers, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} style={inp(t)}>
      {headers.length === 0 && <option value={value}>Kolom {colLetter(value)}</option>}
      {headers.map((h) => (
        <option key={h.i} value={h.i}>{colLetter(h.i)} — {h.label || "(kosong)"}</option>
      ))}
    </select>
  );
}

const inp = (t) => ({ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontFamily: FF, outline: "none", boxSizing: "border-box" });
const lbl = (t) => ({ fontSize: 11, fontWeight: 700, color: t.mid, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" });
const btn = (t) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FF });
