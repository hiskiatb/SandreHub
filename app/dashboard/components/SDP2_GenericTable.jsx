"use client";
/**
 * SDP2_GenericTable.jsx
 *
 * Tabel CMS generik, dipakai bareng oleh sub-menu "Data Terminasi" dan
 * "Data Rebordering" di SDP2_CMS.jsx (permintaan user - "tambahkan juga
 * untuk kolom Data Terminasi dan juga Data Rebordering, sesuai dengan
 * kolom kolom yang ada di excel terlampir") — supaya logic tabel (search,
 * ExcelFilter per kolom, sort, Export .xlsx, empty-state) TIDAK ditulis
 * ulang 2x, sama persis pola yang sudah ada di tabel "Data Registrasi"
 * (SDP2_CMS.jsx), cuma sumber tabel & daftar kolomnya beda-beda lewat
 * props — tabel sdp_termination & sdp_rebordering sudah ada di database
 * (dibuat lebih dulu, kolomnya sudah match 1:1 dgn header sheet
 * "02_Termination_Main"/"03_Rebordering_Kec_Detail" di file Excel
 * "Simplified SDP Registration Template"), cuma belum ada UI yang
 * membacanya — ini UI baca/filter/export-nya (belum ada form isi datanya,
 * itu di luar cakupan permintaan ini).
 *
 * Props:
 *   supabase, theme, profile, role
 *   tableName      — nama tabel Supabase (mis. "sdp_termination"). Diabaikan
 *                    kalau `externalRows` diisi (lihat di bawah).
 *   cols           — [[key, label], ...] urutan & label PERSIS header Excel
 *   dateKeys       — Set/array key yang diformat sbg tanggal (bukan datetime)
 *   linkKeys       — Set/array key yang ditampilkan sbg link "Buka" bila terisi
 *   searchKeys     — key yang ikut dicocokkan di kolom pencarian bebas
 *   scopeRegionKey — nama kolom region utk scoping role "pic_region" (null
 *                    = tabel ini tidak punya 1 kolom region tunggal, jadi
 *                    tidak di-scope per-region di sini)
 *   externalRows   — kalau diisi (array), komponen TIDAK fetch sendiri dari
 *                    `tableName` - dipakai utk tab "Data Registrasi" yang
 *                    sumbernya sudah difilter oleh parent (request_type=New
 *                    + periode terpilih) dari data sdp_registration yang
 *                    sama dgn tab "Data SDP", supaya tidak fetch 2x.
 *   onReload       — dipanggil saat tombol "Muat ulang" diklik ketika
 *                    `externalRows` dipakai (reload tanggung jawab parent).
 *   extraControls  — node tambahan yang disisipkan di baris tombol aksi,
 *                    SEBELUM "Hapus filter" (mis. dropdown periode wajib
 *                    utk tab "Data Registrasi").
 *   statLabel, statSub — override label/sub kartu ringkasan "Total Baris".
 *   groupByKey     — kalau diisi (mis. "submission_month"), baris di tabel
 *                    dikelompokkan per nilai kolom ini dengan baris header
 *                    abu-abu per grup (dgn jumlah baris) — dipakai tab
 *                    "Data Registrasi" utk "dikelompokkan berdasarkan
 *                    submission Month" sesuai permintaan user.
 *   groupLabelFn   — (value) => label tampilan grup (opsional, default
 *                    menampilkan value apa adanya / "— Tidak diketahui —").
 *   exportFileName, exportSheetName, searchPlaceholder, emptyLabel, icon
 */
import React, { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, Search, RefreshCw, Inbox, Download, X, Check } from "lucide-react";
import ExcelFilter from "./ExcelFilter";
import { SDP_GRADIENT_CTA, SDP_GRADIENT_CTA_SHADOW } from "./SDP2_Shared";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

function fmtCell(key, v, dateKeys) {
  if (v == null || v === "") return "";
  if (dateKeys.has(key)) {
    try { return new Date(v).toLocaleDateString("id-ID", { dateStyle: "medium" }); } catch { return String(v); }
  }
  return String(v);
}

function StatTile({ t, icon, label, value, sub }) {
  return (
    <div style={{ flex: "1 1 170px", minWidth: 160, borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, padding: "16px 17px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
        <div style={{ width: 27, height: 27, borderRadius: 8, background: t.sub, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </div>
        <span style={{ color: t.mid, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: t.hi, lineHeight: 1.15, letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: t.lo, marginTop: 3, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{sub}</div>}
    </div>
  );
}

export default function SDP2_GenericTable({
  supabase, theme = "dark", profile, role, t, d,
  tableName, cols, dateKeys = [], linkKeys = [], searchKeys = [],
  scopeRegionKey = null, exportFileName, exportSheetName, searchPlaceholder, emptyLabel, icon,
  externalRows = null, onReload = null, extraControls = null, statLabel = "Total Baris", statSub = null,
  groupByKey = null, groupLabelFn = null,
}) {
  const DATE_KEYS = useMemo(() => new Set(dateKeys), [dateKeys]);
  const LINK_KEYS = useMemo(() => new Set(linkKeys), [linkKeys]);
  const emptyColFilters = () => Object.fromEntries(cols.map(([k]) => [k, []]));
  const usingExternal = externalRows != null;

  const [fetchedRows, setFetchedRows] = useState([]);
  const [loading, setLoading] = useState(!usingExternal);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  const [sortConfig, setSortConfig] = useState({ key: null, dir: null });
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);

  const load = async () => {
    if (usingExternal) { onReload?.(); return; }
    setLoading(true); setErr("");
    try {
      let query = supabase.from(tableName).select("*").order("created_at", { ascending: false }).limit(5000);
      if (scopeRegionKey && role === "pic_region" && profile?.region) query = query.eq(scopeRegionKey, profile.region);
      const { data, error } = await query;
      if (error) throw error;
      setFetchedRows(data || []);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!usingExternal) load(); }, [supabase, tableName, role, profile?.region, usingExternal]);

  const rows = usingExternal ? externalRows : fetchedRows;

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    const keys = searchKeys.length ? searchKeys : cols.map(([k]) => k);
    return rows.filter((r) => keys.map((k) => r[k] || "").join(" ").toLowerCase().includes(needle));
  }, [rows, q, searchKeys, cols]);

  const colOptions = useMemo(() => {
    const out = {};
    for (const [key] of cols) {
      const seen = new Map();
      for (const r of searched) {
        const raw = r[key];
        const value = raw == null ? "" : String(raw);
        if (!seen.has(value)) seen.set(value, fmtCell(key, raw, DATE_KEYS) || "— Kosong —");
      }
      out[key] = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
    }
    return out;
  }, [searched, cols, DATE_KEYS]);

  const filtered = useMemo(() => {
    let out = searched.filter((r) =>
      cols.every(([key]) => {
        const sel = colFilters[key];
        if (!sel || !sel.length) return true;
        const value = r[key] == null ? "" : String(r[key]);
        return sel.includes(value);
      })
    );
    if (sortConfig.key && sortConfig.dir) {
      const key = sortConfig.key, dir = sortConfig.dir === "asc" ? 1 : -1, isDate = DATE_KEYS.has(key);
      out = [...out].sort((a, b) => {
        const va = a[key], vb = b[key];
        if (isDate) return (new Date(va || 0).getTime() - new Date(vb || 0).getTime()) * dir;
        return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
      });
    }
    return out;
  }, [searched, colFilters, sortConfig, cols, DATE_KEYS]);

  const groups = useMemo(() => {
    if (!groupByKey) return null;
    const map = new Map();
    for (const r of filtered) {
      const gv = r[groupByKey] == null ? "" : String(r[groupByKey]);
      if (!map.has(gv)) map.set(gv, []);
      map.get(gv).push(r);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered, groupByKey]);

  const anyFilter = Object.values(colFilters).some((v) => v.length > 0);
  const resetAll = () => { setColFilters(emptyColFilters()); setSortConfig({ key: null, dir: null }); };

  const exportXlsx = async () => {
    setExporting(true); setExportMsg(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(exportSheetName);
      const headerRow = ws.addRow(cols.map(([, label]) => label));
      headerRow.font = { bold: true };
      filtered.forEach((r) => { ws.addRow(cols.map(([key]) => fmtCell(key, r[key], DATE_KEYS))); });
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.columns = cols.map(([key]) => ({ width: Math.max(12, Math.min(32, key.length + 6)) }));
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${exportFileName}_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      setExportMsg({ type: "ok", text: `File .xlsx (${filtered.length.toLocaleString("id-ID")} baris, ${cols.length} kolom) diunduh.` });
    } catch (e) { setExportMsg({ type: "err", text: "Gagal membuat file: " + (e.message || e) }); }
    finally { setExporting(false); }
  };

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatTile t={t} icon={icon} label={statLabel} value={rows.length.toLocaleString("id-ID")} sub={statSub ?? (role === "pic_region" && scopeRegionKey ? "Region Anda" : "Seluruh Sumatera")} />
      </div>

      {exportMsg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 10, marginBottom: 14, fontSize: 12.5, fontWeight: 600,
          background: exportMsg.type === "ok" ? t.tealBg : t.accBg, color: exportMsg.type === "ok" ? t.tealD : t.acc, border: `1px solid ${(exportMsg.type === "ok" ? t.tealD : t.acc)}44` }}>
          {exportMsg.type === "ok" ? <Check size={14} /> : <AlertCircle size={14} />} {exportMsg.text}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 420 }}>
          <Search size={14} color={t.lo} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 36px", borderRadius: 12, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13.5, fontFamily: FF, outline: "none" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {extraControls}
          {anyFilter && (
            <button onClick={resetAll} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${t.acc}44`, borderRadius: 9, background: t.accBg, cursor: "pointer", color: t.acc, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", padding: "8px 11px", fontFamily: FF }}>
              <X size={13} /> Hapus filter
            </button>
          )}
          <button onClick={load} title="Muat ulang" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FF }}>
            <RefreshCw size={13} /> Muat ulang
          </button>
          <button onClick={exportXlsx} disabled={exporting} title="Export semua kolom yg sedang tampil ke .xlsx"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "none", background: SDP_GRADIENT_CTA, boxShadow: SDP_GRADIENT_CTA_SHADOW, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: exporting ? "default" : "pointer", opacity: exporting ? 0.75 : 1, fontFamily: FF }}>
            {exporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Export .xlsx
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: t.mid, display: "flex", alignItems: "center", gap: 8, padding: "20px 0" }}><Loader2 size={15} className="spin" /> Memuat…</div>
      ) : err ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.acc }}><AlertCircle size={15} /> {err}</div>
      ) : (
        <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden" }}>
          <div className="sdp-cms-scroll" style={{ overflow: "auto", maxHeight: "68vh" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "max-content", minWidth: "100%" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
                <tr style={{ background: t.head, color: t.mid }}>
                  {cols.map(([key, label]) => (
                    <th key={key} style={{ padding: "9px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{label}</span>
                        <ExcelFilter t={t} d={d} label={label}
                          options={colOptions[key] || []}
                          selected={colFilters[key] || []}
                          onApply={(vals) => setColFilters((f) => ({ ...f, [key]: vals }))}
                          onClear={() => setColFilters((f) => ({ ...f, [key]: [] }))}
                          sortDir={sortConfig.key === key ? sortConfig.dir : null}
                          onSort={(dir) => setSortConfig({ key, dir })} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={cols.length} style={{ padding: "36px 16px", textAlign: "center", color: t.mid, fontSize: 13 }}>
                      <Inbox size={18} color={t.lo} style={{ verticalAlign: "-3px", marginRight: 8 }} />
                      {q || anyFilter ? "Tidak ada yang cocok dengan pencarian/filter ini." : emptyLabel}
                    </td>
                  </tr>
                ) : groups ? (
                  groups.map(([gv, grows]) => (
                    <React.Fragment key={gv || "—"}>
                      <tr>
                        <td colSpan={cols.length} style={{ padding: "8px 12px", background: t.sub, borderTop: `1px solid ${t.line}`, fontSize: 11.5, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.03em", position: "sticky", left: 0 }}>
                          {(groupLabelFn ? groupLabelFn(gv) : (gv || "— Tidak diketahui —"))}
                          <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, marginLeft: 8, color: t.lo }}>({grows.length.toLocaleString("id-ID")} baris)</span>
                        </td>
                      </tr>
                      {grows.map((r, i) => (
                        <tr key={r.id} style={{ background: i % 2 ? t.sub : t.card, borderTop: `1px solid ${t.line}` }}>
                          {cols.map(([key]) => {
                            const raw = r[key];
                            const isLink = LINK_KEYS.has(key) && raw;
                            return (
                              <td key={key} style={{ padding: "7px 12px", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", color: t.hi }}>
                                {isLink ? (
                                  <a href={String(raw)} target="_blank" rel="noreferrer" style={{ color: t.tealD, textDecoration: "underline" }}>Buka</a>
                                ) : (
                                  fmtCell(key, raw, DATE_KEYS) || <span style={{ color: t.lo }}>—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                ) : filtered.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? t.sub : t.card, borderTop: `1px solid ${t.line}` }}>
                    {cols.map(([key]) => {
                      const raw = r[key];
                      const isLink = LINK_KEYS.has(key) && raw;
                      return (
                        <td key={key} style={{ padding: "7px 12px", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", color: t.hi }}>
                          {isLink ? (
                            <a href={String(raw)} target="_blank" rel="noreferrer" style={{ color: t.tealD, textDecoration: "underline" }}>Buka</a>
                          ) : (
                            fmtCell(key, raw, DATE_KEYS) || <span style={{ color: t.lo }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
