"use client";
/**
 * DSE_ProdAR.jsx — "DSE Prod. & AR"
 *
 * Tab utama "Input Harian": Admin MC (role finance_mpx) langsung mengisi
 * produksi harian (SP, Saldo, Voucher) + AR/piutang per Kode DSE miliknya,
 * DIPISAH PER BRAND (IM3 & 3ID — satu Kode DSE bisa dual-brand). Nama DSE
 * dan MC juga bisa diedit langsung dari sini (ditulis ke mf_dse_database).
 * RLS otomatis membatasi Admin MC hanya ke DSE dengan mc = partner_name-nya.
 *
 * Tab "Riwayat": daftar + filter + export dari seluruh input yang tersimpan.
 *
 * Import massal dari Excel tetap tersedia sebagai opsi sekunder (collapsible)
 * di tab Input Harian, untuk backfill data lama — bukan cara utama input.
 *
 * Tabel: mf_dse_prod_ar (brand IM3/3ID, unique per tanggal+dse_code+brand).
 * Responsive: mobile (card), fold-screen, half-window & full-window desktop
 * — breakpoint diukur dari window.innerWidth.
 *
 * UPDATE (permintaan user - "mengapa belum pindah database dse ini", sama
 * seperti "Mapping Admin MC" sebelumnya): tab ke-4 "Database DSE" ditambahkan
 * di sini (isSPM saja) — dulu menu & DashCard TERPISAH di overview dashboard
 * ("Database DSE", render SDP_DseDatabase.jsx lewat view === "dse-database"
 * di page.jsx), sekarang dirender sbg tab di dalam halaman ini juga, supaya
 * semua pengelolaan data DSE (input harian, riwayat, mapping, & database DSE
 * itu sendiri) ada di satu tempat. Logic & tabel di database TIDAK berubah
 * sama sekali, cuma tempatnya di UI.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import AdminMcMapping from "./AdminMcMapping";
import SDP_DseDatabase from "./SDP_DseDatabase";
import {
  Upload, FileSpreadsheet, X, Check, AlertTriangle, Loader2, FileDown,
  Search, RefreshCw, ChevronDown, ChevronUp, ChevronRight, Wallet, TrendingUp, Calendar, Info,
  Pencil, Save, ListChecks, History, UserRoundCog, Database,
  Users, UserCheck, UserX, Ticket, CircleDollarSign, Clock, CalendarCheck2,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;
const PAGE_SIZE = 50;
const TABLE_BP = 860; // di bawah ini → tampilan card (mobile, fold, layar sempit)
const BRANDS = ["IM3", "3ID"];
// "BOTH" CUMA pilihan toggle di UI (bukan nilai kolom "brand" di DB - tabel
// mf_dse_prod_ar tetap selalu brand = "IM3" atau "3ID" per baris, lihat
// BRANDS di atas), dipakai utk nentuin "activeBrands" yg mau dirender.
// UPDATE (permintaan user - "ubah both menjadi IOH, dan menjadi paling
// kiri"): label "Both" -> "IOH" (brand induk, nyatuin IM3 & 3ID), posisinya
// plg kiri di toggle.
const BRAND_TOGGLE_OPTIONS = ["BOTH", "IM3", "3ID"];
// Warna identitas tiap brand (tetap sama persis dgn warna dot di toggle
// Brand) - dipakai utk nge-tint section penjualan per brand saat mode
// "Both" nampilin IM3 & 3ID sekaligus dalam satu kartu/baris DSE.
const BRAND_META = {
  IM3: { color: "#F5B700", bg: "rgba(245,183,0,0.09)", border: "rgba(245,183,0,0.35)" },
  "3ID": { color: "#C2187C", bg: "rgba(194,24,124,0.08)", border: "rgba(194,24,124,0.32)" },
};
// Fitur "Import Massal dari Excel" di tab Input Harian disembunyikan dari UI
// (permintaan user) tanpa menghapus kodenya — tinggal set true lagi kalau
// suatu saat perlu dinyalakan.
const SHOW_IMPORT_EXCEL = false;

const fmtID = (n) => Math.round(Number(n) || 0).toLocaleString("id-ID");
const fRaw = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const todayISO = () => new Date().toISOString().slice(0, 10);
const emptyEntry = () => ({ qty_sp: 0, nilai_sp: 0, qty_saldo: 0, nilai_saldo: 0, qty_voucher: 0, nilai_voucher: 0, ar_piutang: 0, ar_bayar: 0, catatan: "" });
// Format jam:menit lokal dari timestamptz, utk audit trail "Diperbarui HH:mm" per baris
const fmtTime = (iso) => { if (!iso) return ""; try { return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const fmtLongDate = (iso) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00"); return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`; };
// Dipakai di trigger Periode mode Daily (tanpa nama hari, lbh ringkas & muat
// di lebar box yg sama dgn label bulan "<Bulan> <Tahun>" mode Full Month).
const fmtDayMonth = (iso) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00"); return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`; };
const DAY_NAMES_SHORT = ["M", "S", "S", "R", "K", "J", "S"];
// Grid kalender 1 bulan (utk PeriodPicker Excel-style) — sel kosong di awal
// diisi "" (padding sblm tanggal 1 jatuh di hari apa), total selalu kelipatan 7.
const buildMonthGrid = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const numDays = new Date(y, m, 0).getDate();
  const cells = Array(first.getDay()).fill(null);
  for (let d = 1; d <= numDays; d++) cells.push(`${ym}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Kolom di file Excel (import massal, opsional) — header baris 1, longgar
const COLMAP = {
  tanggal: ["tanggal", "date"],
  dse_code: ["kode dse", "id dse", "dse code", "dse_code"],
  brand: ["brand", "merk"],
  qty_sp: ["qty sp", "jumlah sp"],
  nilai_sp: ["nilai sp", "value sp", "omzet sp"],
  qty_saldo: ["qty saldo", "jumlah saldo"],
  nilai_saldo: ["nilai saldo", "value saldo", "omzet saldo"],
  qty_voucher: ["qty voucher", "jumlah voucher"],
  nilai_voucher: ["nilai voucher", "value voucher", "omzet voucher"],
  ar_piutang: ["ar", "piutang", "ar piutang", "outstanding"],
  catatan: ["catatan", "keterangan", "notes"],
};

function normHeader(h) { return String(h || "").trim().toLowerCase(); }
function findCol(headers, aliases) { return headers.findIndex((h) => aliases.includes(normHeader(h))); }

function excelDateToISO(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF?.parse_date_code ? XLSX.SSF.parse_date_code(v) : null;
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;
  const m2 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  return null;
}

function normBrand(v) {
  const s = String(v || "").trim().toUpperCase();
  if (s === "3ID" || s.includes("3ID") || s.includes("TRI")) return "3ID";
  return "IM3";
}

function parseWorkbook(file, defaultMc) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (!aoa.length) { resolve({ error: "File kosong." }); return; }
        const headers = aoa[0];
        const col = {};
        for (const key of Object.keys(COLMAP)) col[key] = findCol(headers, COLMAP[key]);
        if (col.tanggal < 0 || col.dse_code < 0) {
          resolve({ error: `Kolom wajib tidak ditemukan. Pastikan ada kolom "Tanggal" dan "Kode DSE" di baris pertama.` });
          return;
        }
        const rows = [];
        const errors = [];
        for (let i = 1; i < aoa.length; i++) {
          const line = aoa[i];
          if (!line || line.every((c) => c === "" || c == null)) continue;
          const dseCode = String(line[col.dse_code] ?? "").trim();
          const tanggal = excelDateToISO(line[col.tanggal]);
          if (!dseCode) { errors.push(`Baris ${i + 1}: Kode DSE kosong.`); continue; }
          if (!tanggal) { errors.push(`Baris ${i + 1}: Tanggal tidak valid.`); continue; }
          rows.push({
            tanggal, dse_code: dseCode, mc: defaultMc || null,
            brand: col.brand >= 0 ? normBrand(line[col.brand]) : "IM3",
            qty_sp: fRaw(col.qty_sp >= 0 ? line[col.qty_sp] : 0),
            nilai_sp: fRaw(col.nilai_sp >= 0 ? line[col.nilai_sp] : 0),
            qty_saldo: fRaw(col.qty_saldo >= 0 ? line[col.qty_saldo] : 0),
            nilai_saldo: fRaw(col.nilai_saldo >= 0 ? line[col.nilai_saldo] : 0),
            qty_voucher: fRaw(col.qty_voucher >= 0 ? line[col.qty_voucher] : 0),
            nilai_voucher: fRaw(col.nilai_voucher >= 0 ? line[col.nilai_voucher] : 0),
            ar_piutang: fRaw(col.ar_piutang >= 0 ? line[col.ar_piutang] : 0),
            catatan: col.catatan >= 0 ? String(line[col.catatan] ?? "").trim() || null : null,
          });
        }
        resolve({ rows, errors, totalRows: rows.length });
      } catch (err) {
        resolve({ error: err.message || "Gagal membaca file." });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  const bg = type === "error" ? "#DC2626" : type === "warn" ? "#D97706" : "#16A34A";
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, left: 24, zIndex: 9999, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: bg, color: "#fff", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", maxWidth: 480, marginLeft: "auto" }}>
      {type === "error" ? <AlertTriangle size={15} /> : <Check size={15} />}
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, display: "flex" }}><X size={14} /></button>
    </div>
  );
}

// ── Label field yang enak dibaca utk popup Riwayat (lihat DseHistoryModal) —
// field_name mentah dari mf_dse_database_history (nama kolom DB) dipetakan
// ke label Indonesia yang sama dgn yang dipakai di form Upload Data/Database
// DSE, supaya konsisten.
const HISTORY_FIELD_LABEL = {
  _created: "Dibuat",
  dse_category: "DSE Category",
  dse_code_3id: "DSE Code 3ID",
  mdi: "MDI",
  pt_name: "PT",
  mc: "Micro Cluster",
  branch: "Branch",
  region: "Region",
  circle: "Circle",
  dse_status: "Status",
  ds_name: "Nama DSE",
  join_date: "Join Date",
};

// ── Popup Riwayat Perubahan per ID DSE — dibuka dgn klik ID DSE di tab Input
// Harian. Data dari mf_dse_database_history, yang diisi otomatis oleh DB
// trigger trg_mf_dse_database_log_changes tiap kali mf_dse_database
// di-INSERT/UPDATE (baik lewat Upload Data/wizard maupun edit identitas di
// sini) — jadi audit trail-nya menangkap SEMUA jalur perubahan, bukan cuma
// yang lewat UI ini.
// UPDATE (permintaan user - "pastikan semua perubahan tersimpan dengan aman
// dan setiap id memiliki log tersendiri" -> "log nya mulai dari perubahan
// identitas, penjualan masing2, dan juga AR, agar sangat jelas"): popup
// Riwayat skrg gabungin 2 sumber log per dse_code jadi SATU timeline,
// masing2 ditandain badge kategori yg jelas:
//  - IDENTITAS (teal)   <- mf_dse_database_history (udah ada dari dulu, per
//    field diff Nama/Status/Join Date/dll, trigger trg_mf_dse_database_log_changes)
//  - PENJUALAN <brand> (warna brand, lihat BRAND_META) <- mf_dse_prod_ar_history
//    (BARU, trigger trg_mf_dse_prod_ar_log_history di migration
//    "mf_dse_prod_ar_history" - mencatat snapshot nilai SEBELUM tiap kali
//    baris mf_dse_prod_ar di-UPDATE/DELETE: SP/Voucher/Saldo dipisah jelas
//    dari AR/Piutang & Catatan di card yg sama, biar gampang dibaca mana yg
//    penjualan mana yg piutang).
function DseHistoryModal({ t, dseCode, onClose }) {
  const [identityRows, setIdentityRows] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [names, setNames] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErrMsg("");
      try {
        const [{ data: idData, error: idErr }, { data: salesData, error: salesErr }] = await Promise.all([
          supabase.from("mf_dse_database_history").select("*").eq("dse_code", dseCode).order("changed_at", { ascending: false }).limit(150),
          supabase.from("mf_dse_prod_ar_history").select("*").eq("dse_code", dseCode).order("changed_at", { ascending: false }).limit(150),
        ]);
        if (idErr) throw idErr;
        if (salesErr) throw salesErr;
        if (!alive) return;
        setIdentityRows(idData || []);
        setSalesRows(salesData || []);
        const ids = Array.from(new Set([...(idData || []).map((r) => r.changed_by), ...(salesData || []).map((r) => r.changed_by)].filter(Boolean)));
        if (ids.length) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
          if (alive) setNames(Object.fromEntries((profs || []).map((p) => [p.id, p.full_name])));
        }
      } catch (e) {
        if (alive) setErrMsg(e.message || "Gagal memuat riwayat.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [dseCode]);

  // Gabung 2 sumber jadi 1 timeline terurut terbaru dulu, masing2 dikasih
  // tag `kind` ("identitas" | "sales") biar renderer tau cara nampilinnya.
  const timeline = useMemo(() => {
    const a = identityRows.map((r) => ({ kind: "identitas", key: `id-${r.id}`, changed_at: r.changed_at, changed_by: r.changed_by, r }));
    const b = salesRows.map((r) => ({ kind: "sales", key: `sales-${r.id}`, changed_at: r.changed_at, changed_by: r.changed_by, r }));
    return [...a, ...b].sort((x, y) => new Date(y.changed_at) - new Date(x.changed_at));
  }, [identityRows, salesRows]);

  const CategoryBadge = ({ label, color, bg }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, background: bg, fontSize: 10, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 0.3, flexShrink: 0 }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: color, flexShrink: 0 }} />
      {label}
    </span>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px", overflowY: "auto" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 560, background: t.card, borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.4)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: `1px solid ${t.line}` }}>
          <History size={16} color={t.teal} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>Riwayat Perubahan</div>
            <div style={{ fontSize: 11.5, color: t.mid }}>{dseCode} · identitas, penjualan &amp; AR</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={14} /></button>
        </div>
        <div style={{ maxHeight: "65vh", overflowY: "auto", padding: "8px 18px 18px" }}>
          {loading ? (
            <div style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={18} className="spin" /></div>
          ) : errMsg ? (
            <div style={{ padding: 20, textAlign: "center", color: t.red, fontSize: 12.5 }}>{errMsg}</div>
          ) : timeline.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: t.mid, fontSize: 12.5 }}>Belum ada riwayat perubahan.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {timeline.map((item) => {
                const r = item.r;
                if (item.kind === "identitas") {
                  return (
                    <div key={item.key} style={{ padding: "10px 0", borderBottom: `1px solid ${t.line}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                          <CategoryBadge label="Identitas" color={t.teal} bg={t.tealBg} />
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>{HISTORY_FIELD_LABEL[r.field_name] || r.field_name}</span>
                        </div>
                        <span style={{ fontSize: 10.5, color: t.lo, flexShrink: 0, whiteSpace: "nowrap" }}>{fmtTime(r.changed_at)}</span>
                      </div>
                      {r.field_name === "_created" ? (
                        <div style={{ fontSize: 12, color: t.mid }}>{r.new_value}</div>
                      ) : (
                        <div style={{ fontSize: 12, color: t.mid, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ color: t.red, textDecoration: "line-through" }}>{r.old_value || "(kosong)"}</span>
                          <span style={{ color: t.lo }}>→</span>
                          <span style={{ color: t.teal, fontWeight: 600 }}>{r.new_value || "(kosong)"}</span>
                        </div>
                      )}
                      {r.changed_by && <div style={{ fontSize: 10.5, color: t.lo, marginTop: 3 }}>oleh {names[r.changed_by] || "—"}</div>}
                    </div>
                  );
                }
                // kind === "sales": snapshot NILAI SEBELUM baris mf_dse_prod_ar
                // ini di-update/dihapus - Penjualan (SP/Voucher/Saldo) & AR/
                // Piutang dipisah jelas jadi 2 sub-blok dlm 1 kartu yg sama,
                // krn user minta "penjualan masing2, dan juga AR" dibedain.
                const meta = BRAND_META[r.brand] || { color: t.teal, bg: t.tealBg };
                return (
                  <div key={item.key} style={{ padding: "10px 0", borderBottom: `1px solid ${t.line}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flexWrap: "wrap" }}>
                        <CategoryBadge label={`Penjualan · ${r.brand}`} color={meta.color} bg={meta.bg} />
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: t.hi }}>{fmtLongDate(r.tanggal)}</span>
                      </div>
                      <span style={{ fontSize: 10.5, color: t.lo, flexShrink: 0, whiteSpace: "nowrap" }}>{r.change_type === "delete" ? "Dihapus" : "Diubah"} {fmtTime(r.changed_at)}</span>
                    </div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: t.lo, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 }}>Nilai sebelum perubahan — Penjualan</div>
                    <div style={{ fontSize: 12, color: t.mid, marginBottom: 7 }}>
                      SP: {fmtID(r.qty_sp || 0)} pcs · Rp {fmtID(r.nilai_sp || 0)} &nbsp;·&nbsp;
                      Voucher: {fmtID(r.qty_voucher || 0)} pcs · Rp {fmtID(r.nilai_voucher || 0)} &nbsp;·&nbsp;
                      Saldo: Rp {fmtID(r.nilai_saldo || 0)}
                    </div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: t.lo, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 3 }}>Nilai sebelum perubahan — AR / Piutang</div>
                    <div style={{ fontSize: 12, color: t.mid }}>
                      Piutang: Rp {fmtID(r.ar_piutang || 0)} &nbsp;·&nbsp; Bayar: Rp {fmtID(r.ar_bayar || 0)}
                      {r.catatan ? <> &nbsp;·&nbsp; Catatan: &ldquo;{r.catatan}&rdquo;</> : null}
                    </div>
                    {r.changed_by && <div style={{ fontSize: 10.5, color: t.lo, marginTop: 5 }}>oleh {names[r.changed_by] || "—"}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ t, icon, label, value, sub }) {
  return (
    <div style={{ flex: "1 1 160px", minWidth: 150, borderRadius: 12, border: `1px solid ${t.line}`, background: t.sub, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: t.mid, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 7 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: t.hi, lineHeight: 1.2, letterSpacing: -0.2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: t.lo, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{sub}</div>}
    </div>
  );
}

// ── Status DSE (Vacant / Interview / Active) ────────────────────────────────
// "" (Belum diisi) dipakai utk ID DSE baru hasil Upload Data yang belum
// pernah diisi status-nya manual (lihat migration mf_dse_database_status_no_default
// — kolom dse_status tidak lagi default "Active" supaya ID baru kelihatan
// kosong dulu, bukan sok-tahu dianggap Active).
const STATUS_OPTIONS = [
  { v: "", label: "— Belum diisi —", color: "#8A8A96", bg: "rgba(138,138,150,0.10)" },
  { v: "Active", label: "Active", color: "#16A34A", bg: "rgba(22,163,74,0.10)" },
  { v: "Interview", label: "Interview", color: "#D97706", bg: "rgba(217,119,6,0.10)" },
  { v: "Vacant", label: "Vacant", color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
];
const statusMetaOf = (v) => STATUS_OPTIONS.find((s) => s.v === v) || STATUS_OPTIONS[0];

// ── Input angka dgn pemisah ribuan ("1.234.567" saat tidak fokus, angka
// mentah saat sedang diketik) — dipakai utk semua kolom Qty/Rp supaya mudah
// dibaca tanpa harus menghitung nol manual, baik di tabel desktop maupun
// kartu mobile. ────────────────────────────────────────────────────────────
function MoneyInput({ t, value, onChange, align, disabled }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(""); // raw = digit mentah tanpa separator (dipakai utk hitung/simpan)
  // UPDATE (permintaan user - "pada saat angka dimasukkan langsung ada
  // decimal seperator"): dulu separator ribuan cuma muncul setelah blur,
  // sekarang langsung live saat mengetik juga (format raw dgn fmtID tiap
  // onChange, bukan cuma pas blur) - value yg disimpan/dikirim tetap angka
  // mentah (raw), cuma tampilannya yg diberi titik ribuan.
  const display = editing ? (raw === "" ? "" : fmtID(raw)) : (fRaw(value) ? fmtID(value) : "");
  return (
    <input
      type="text" inputMode="numeric" placeholder="0"
      value={display} readOnly={disabled} disabled={disabled}
      onFocus={() => { if (disabled) return; setEditing(true); setRaw(fRaw(value) ? String(fRaw(value)) : ""); }}
      onChange={(e) => { if (disabled) return; setRaw(e.target.value.replace(/[^\d]/g, "")); }}
      onBlur={() => { if (disabled) return; setEditing(false); onChange(raw === "" ? 0 : parseInt(raw, 10) || 0); }}
      style={{
        width: "100%", height: 34, padding: "0 10px", borderRadius: 7,
        border: `1px solid ${t.inputBd}`, background: disabled ? t.sub : t.inputBg, color: disabled ? t.mid : t.hi,
        fontSize: 12.5, fontFamily: FONT, outline: "none", boxSizing: "border-box",
        textAlign: align || "left", cursor: disabled ? "default" : "text",
      }}
    />
  );
}

// ── AR/Piutang — "masukkan nilai bayar, sisa dihitung otomatis" ────────────
// UPDATE (permintaan user - "agar simple dia bisa masukkan nilai bayar jadi
// berkurang aja utang saat ini"): Admin MC TIDAK lagi mengetik ulang angka
// tunggakan manual tiap hari. "Utang Saat Ini" ditampilkan read-only (hasil
// SISA tunggakan dari entry terakhir SEBELUM tanggal ini — lihat `prevAr` di
// loadDseAndEntries), lalu admin tinggal masukkan "Bayar". "Sisa Tunggakan"
// dihitung live = max(0, Utang Saat Ini − Bayar), itu yg tersimpan sbg
// ar_piutang hari ini (ar_bayar disimpan terpisah sbg histori pembayaran,
// jadi audit "siapa bayar berapa kapan" tetap bisa ditelusuri lewat tab
// Riwayat, bukan cuma angka sisa akhir).
function ArPiutangInput({ t, outstanding, bayar, onBayarChange, onConfirmSave, saving, readOnly }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(0);
  const sisaCurrent = Math.max(0, fRaw(outstanding) - fRaw(bayar));
  const lunasCurrent = sisaCurrent === 0;
  const sisaDraft = Math.max(0, fRaw(outstanding) - fRaw(draft));
  const lunasDraft = sisaDraft === 0;
  const labelStyle = { fontSize: 9.5, color: t.lo, marginBottom: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.2 };

  const openModal = () => { setDraft(bayar || 0); setOpen(true); };
  const confirm = () => {
    onBayarChange(draft);
    setOpen(false);
    if (onConfirmSave) onConfirmSave();
  };

  // UPDATE (permintaan user - "perbaiki agar setiap row tidak terlalu tinggi
  // untuk masing masing dse agar lebih compact"): dulu 3 elemen (AR Saat Ini
  // + badge Lunas/Sisa + tombol Catat AR) wrap jadi 3 baris krn masing2
  // dikasih flex basis lebar sendiri → baris tabel jadi tinggi. Sekarang satu
  // baris horizontal ringkas: angka AR polos (bukan dlm kotak terpisah) +
  // badge kecil + tombol ikon-saja (judul via title, bukan teks "Catat AR").
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
        <span title="AR Saat Ini" style={{ fontSize: 11.5, fontWeight: 600, color: t.mid, whiteSpace: "nowrap", flexShrink: 0 }}>
          Rp {fmtID(outstanding)}
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: lunasCurrent ? t.teal : t.red, background: lunasCurrent ? t.tealBg : t.redBg, borderRadius: 6, padding: "3px 8px", display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", flexShrink: 0 }}>
          {lunasCurrent && <Check size={9} />} {lunasCurrent ? "LUNAS" : `Sisa Rp ${fmtID(sisaCurrent)}`}
        </span>
        {!readOnly && (
          <button type="button" onClick={openModal} title="Catat AR" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, border: "none", background: t.teal, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <CircleDollarSign size={13} />
          </button>
        )}
      </div>

      {open && !readOnly && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setOpen(false)}>
          <div onClick={(ev) => ev.stopPropagation()} style={{ width: "100%", maxWidth: 360, borderRadius: 16, background: t.card, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", padding: 20, fontFamily: FONT }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.hi, display: "flex", alignItems: "center", gap: 7 }}>
                <CircleDollarSign size={16} color={t.teal} /> Catat Pembayaran AR
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: t.lo, cursor: "pointer", display: "flex" }}><X size={16} /></button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, background: t.sub, marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: t.mid }}>AR Saat Ini</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: t.hi }}>Rp {fmtID(outstanding)}</span>
            </div>

            <div style={labelStyle}>Jumlah Bayar</div>
            <MoneyInput t={t} value={draft} onChange={setDraft} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, background: lunasDraft ? t.tealBg : t.redBg, marginTop: 12 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: lunasDraft ? t.teal : t.red, display: "flex", alignItems: "center", gap: 4 }}>
                {lunasDraft && <Check size={12} />} {lunasDraft ? "LUNAS" : "SISA SETELAH BAYAR"}
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: lunasDraft ? t.teal : t.red }}>Rp {fmtID(sisaDraft)}</span>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setOpen(false)} style={{ flex: 1, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              <button type="button" onClick={confirm} disabled={saving} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Satu baris DSE: identitas (Status/Nama/Join Date, editable, SELALU satu
// per DSE) + penjualan per brand. "brands" biasanya cuma berisi 1 brand
// (toggle IM3 / 3ID di atas tabel) -> tampilan identik spt sebelumnya; kalau
// toggle-nya "Both", brands = ["IM3","3ID"] -> identitas tetap dirender SATU
// KALI, lalu di bawahnya 2 section penjualan bertint warna brand masing2
// (IM3 = emas, 3ID = magenta, lihat BRAND_META) supaya rapi & gampang
// dibedakan (permintaan user: "menampilkan nama dse baru penjualan im3 dan
// 3id beri warna dengan rapi"). Dirender sbg baris <table> di desktop, kartu
// di mobile (isCardView) — satu komponen, dua layout. ──────────────────────
function DseInputRow({ t, isCardView, dse, brands, showBrandCol, entries, onEntryChange, onIdentityChange, identityEdit, onSave, saving, dirty, prevOutstandings, audits, onShowHistory, readOnly }) {
  const [showMore, setShowMore] = useState(false);
  // UPDATE (permintaan user - filter per kolom termasuk kolom Brand): di
  // desktop, "brands" yg diterusin ke sini bisa DINARROW ke 1 brand doang
  // oleh filter kolom Brand, TAPI tabelnya tetap harus kebentuk sbg tabel
  // mode IOH (kolom Brand tetap ada, sel Nama/Status/Join Date tetap
  // rowSpan-style) - makanya "apakah ini tabel mode IOH" (showBrandCol)
  // dipisah dari "berapa baris brand yg BENERAN dirender" (brands.length).
  // showBrandCol default ke brands.length>1 kalau prop-nya ga dikirim
  // (dipakai kartu mobile, yg emang ga kena narrow filter Brand).
  const isDual = showBrandCol ?? (brands.length > 1);
  const status = identityEdit?.dse_status ?? dse.dse_status ?? "";
  const joinDate = identityEdit?.join_date ?? dse.join_date ?? "";
  const sm = statusMetaOf(status);
  // ID header: kalau tabel mode IOH (2 kemungkinan ID beda) pakai dse_code
  // (ID "utama"/IM3) sbg penanda baris; kalau cuma 1 brand aktif, ikut
  // brand itu spt sebelumnya (3ID -> dse_code_3id).
  const headerCode = isDual ? dse.dse_code : (brands[0] === "3ID" ? (dse.dse_code_3id || dse.dse_code) : dse.dse_code);

  const textInputStyle = { width: "100%", height: 34, padding: "0 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
  const selectStyle = { ...textInputStyle, cursor: "pointer", color: sm.color, fontWeight: 700, background: sm.bg, border: `1px solid ${sm.color}33`, appearance: "none", WebkitAppearance: "none", paddingRight: 28 };
  const labelStyle = { fontSize: 10, color: t.lo, marginBottom: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.2 };
  const StatusSelect = (
    <div style={{ position: "relative" }}>
      <select value={status} onChange={(ev) => onIdentityChange(dse.dse_code, "dse_status", ev.target.value)} style={selectStyle}>
        {STATUS_OPTIONS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
      </select>
      <ChevronDown size={13} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: sm.color, pointerEvents: "none" }} />
    </div>
  );

  // ── Derivasi per-brand (dipakai ulang di kartu & tabel) ──
  const brandData = brands.map((b) => {
    const e = entries?.[b] || emptyEntry();
    const totalPenjualan = fRaw(e.nilai_sp) + fRaw(e.nilai_voucher) + fRaw(e.nilai_saldo);
    const outstanding = fRaw(prevOutstandings?.[b]);
    const audit = audits?.[b];
    const displayCode = b === "3ID" ? (dse.dse_code_3id || dse.dse_code) : dse.dse_code;
    const setE = (patch) => onEntryChange(dse.dse_code, b, { ...e, ...patch });
    const handleBayarChange = (v) => onEntryChange(dse.dse_code, b, { ...e, ar_bayar: v, ar_piutang: Math.max(0, outstanding - fRaw(v)) });
    const AuditLine = audit ? (
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: t.lo }}>
        <Clock size={10} style={{ flexShrink: 0 }} />
        <span>Diperbarui {fmtTime(audit.updated_at || audit.uploaded_at)}{audit.by ? ` oleh ${audit.by}` : ""}</span>
      </div>
    ) : null;
    return { b, e, totalPenjualan, outstanding, displayCode, setE, handleBayarChange, AuditLine, meta: BRAND_META[b] };
  });

  // Blok penjualan SP/Voucher/Saldo + Total 1 brand (dipakai di kartu MAUPUN
  // tabel-desktop mode Both, krn mode Both desktop juga dirender sbg kartu
  // di dalam <td colSpan> - tabel kolom-per-kolom biasa jadi tidak muat utk
  // 2 brand sekaligus).
  // UPDATE (fix bug - "Encountered two children with the same key"):
  // SalesBlock & MoreBlock dipanggil berdampingan sbg SIBLING di dalam 1
  // wrapper yg sama di mode Both desktop (lihat di bawah: {SalesBlock(bd)}
  // lalu {MoreBlock(bd)}) - kalau dua2nya pakai key={bd.b} yg SAMA PERSIS,
  // React nganggep itu 2 key kembar. Dikasih suffix beda (-sales/-more)
  // supaya tetap unik di konteks manapun fungsi ini dipanggil.
  const SalesBlock = (bd) => (
    <div key={`${bd.b}-sales`} style={isDual ? { borderRadius: 12, border: `1px solid ${bd.meta.border}`, background: bd.meta.bg, padding: 10 } : undefined}>
      {isDual && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: bd.meta.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: bd.meta.color, letterSpacing: 0.3 }}>{bd.b}</span>
          <span style={{ fontSize: 10.5, color: t.lo, fontWeight: 600 }}>· ID {bd.displayCode}</span>
        </div>
      )}
      <div style={{ borderRadius: 9, background: t.redBg, padding: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: t.red, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>SP</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={labelStyle}>Qty SP Terjual (Pcs)</div>
            <MoneyInput t={t} disabled={readOnly} value={bd.e.qty_sp} onChange={(v) => bd.setE({ qty_sp: v })} />
          </div>
          <div>
            <div style={labelStyle}>Total Penjualan SP (Rp)</div>
            <MoneyInput t={t} disabled={readOnly} value={bd.e.nilai_sp} onChange={(v) => bd.setE({ nilai_sp: v })} />
          </div>
        </div>
      </div>
      <div style={{ borderRadius: 9, background: t.blueBg, padding: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>Voucher</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={labelStyle}>Qty Voucher Terjual (Pcs)</div>
            <MoneyInput t={t} disabled={readOnly} value={bd.e.qty_voucher} onChange={(v) => bd.setE({ qty_voucher: v })} />
          </div>
          <div>
            <div style={labelStyle}>Total Penjualan Voucher (Rp)</div>
            <MoneyInput t={t} disabled={readOnly} value={bd.e.nilai_voucher} onChange={(v) => bd.setE({ nilai_voucher: v })} />
          </div>
        </div>
      </div>
      <div style={{ borderRadius: 9, background: t.amberBg, padding: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: t.amber, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>Saldo MOBO</div>
        <div>
          <div style={labelStyle}>Total Penjualan Saldo MOBO (Rp)</div>
          <MoneyInput t={t} disabled={readOnly} value={bd.e.nilai_saldo} onChange={(v) => bd.setE({ nilai_saldo: v })} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 9, background: isDual ? "rgba(255,255,255,0.5)" : t.tealBg }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: isDual ? bd.meta.color : t.teal }}>TOTAL {bd.b}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: isDual ? bd.meta.color : t.teal }}>Rp {fmtID(bd.totalPenjualan)}</span>
      </div>
    </div>
  );

  // Blok AR/Piutang + Catatan 1 brand (bagian "showMore").
  const MoreBlock = (bd) => (
    <div key={`${bd.b}-more`} style={isDual ? { borderRadius: 10, border: `1px dashed ${bd.meta.border}`, padding: 9 } : { display: "flex", flexDirection: "column", gap: 8 }}>
      {isDual && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: bd.meta.color, flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, fontWeight: 800, color: bd.meta.color }}>{bd.b} — AR &amp; Catatan</span>
        </div>
      )}
      <div style={{ marginBottom: 8 }}>
        <div style={labelStyle}>AR / Piutang</div>
        <ArPiutangInput t={t} readOnly={readOnly} outstanding={bd.outstanding} bayar={bd.e.ar_bayar} onBayarChange={bd.handleBayarChange} onConfirmSave={() => onSave(dse.dse_code)} saving={saving} />
      </div>
      <div>
        <div style={labelStyle}>Catatan</div>
        <input type="text" disabled={readOnly} value={bd.e.catatan || ""} onChange={(ev) => bd.setE({ catatan: ev.target.value })} placeholder="opsional" style={textInputStyle} />
      </div>
      {bd.AuditLine && <div style={{ marginTop: 6, paddingTop: 6, borderTop: isDual ? "none" : `1px dashed ${t.sub}` }}>{bd.AuditLine}</div>}
    </div>
  );

  const anyAudit = brandData.some((bd) => bd.AuditLine);
  // UPDATE: dipakai spt helper function biasa (bukan component JSX
  // <SaveButton/>) supaya ga kena lint "components created during render"
  // (react-hooks/static-components) - dipanggil sbg {renderSaveButton()}.
  const renderSaveButton = (full) => !readOnly && (
    <button onClick={() => onSave(dse.dse_code)} disabled={saving || !dirty}
      style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 8, border: "none", background: dirty ? t.teal : t.inputBg, color: dirty ? "#fff" : t.lo, fontSize: 12, fontWeight: 700, cursor: dirty && !saving ? "pointer" : "default", opacity: saving ? 0.6 : 1, flexShrink: 0, width: full ? "100%" : undefined, justifyContent: full ? "center" : undefined }}>
      {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} Simpan
    </button>
  );

  if (isCardView) {
    return (
      <div style={{ borderRadius: 12, border: `1px solid ${dirty ? t.tealBd : t.line}`, background: t.card, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <button onClick={() => onShowHistory?.(dse.dse_code)} title="Lihat riwayat perubahan"
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 14, fontWeight: 800, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {headerCode}<History size={11} style={{ color: t.lo, flexShrink: 0 }} />
            </button>
            {dse.is_revoked && <span style={{ fontSize: 10, fontWeight: 700, color: t.red, background: t.redBg, borderRadius: 999, padding: "1px 7px", flexShrink: 0 }}>Revoked</span>}
          </div>
          {renderSaveButton()}
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={labelStyle}>Nama DSE</div>
          <input type="text" disabled={readOnly} value={identityEdit?.ds_name ?? dse.ds_name ?? ""} onChange={(ev) => onIdentityChange(dse.dse_code, "ds_name", ev.target.value)} style={textInputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div>
            <div style={labelStyle}>Status</div>
            {StatusSelect}
          </div>
          <div>
            <div style={labelStyle}>Join Date</div>
            <input type="date" disabled={readOnly} value={joinDate || ""} onChange={(ev) => onIdentityChange(dse.dse_code, "join_date", ev.target.value)} style={textInputStyle} />
          </div>
        </div>

        {/* Mode 1-brand: 1 blok penjualan polos (spt sebelumnya). Mode Both:
            2 blok bertint warna brand, ditumpuk, masing2 berlabel IM3/3ID. */}
        <div style={{ display: "flex", flexDirection: "column", gap: isDual ? 10 : 0, marginBottom: 8 }}>
          {brandData.map((bd) => SalesBlock(bd))}
        </div>

        <button onClick={() => setShowMore((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: t.mid, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>
          {showMore ? <ChevronUp size={12} /> : <ChevronDown size={12} />} AR/Piutang, MC &amp; Catatan
        </button>
        {showMore && (
          <div style={{ display: "flex", flexDirection: "column", gap: isDual ? 10 : 8, marginTop: 8 }}>
            {brandData.map((bd) => MoreBlock(bd))}
            <div>
              <div style={labelStyle}>MC</div>
              <input type="text" disabled={readOnly} value={identityEdit?.mc ?? dse.mc ?? ""} onChange={(ev) => onIdentityChange(dse.dse_code, "mc", ev.target.value)} style={textInputStyle} />
            </div>
            {!isDual && anyAudit && (
              <div style={{ paddingTop: 2, borderTop: `1px dashed ${t.sub}` }}>{brandData[0].AuditLine}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop: SELALU baris <table> biasa (permintaan user - "jangan buat
  // seperti ini terkesan terlalu banyak, tetap buat dalam bentuk tabel
  // saja" - nolak layout kartu lebar/colSpan yg dipakai sebelumnya utk mode
  // "IOH"/Both di desktop). Mode 1-brand = 1 baris spt biasa. Mode IOH/Both
  // (2 brand) = 2 baris tabel biasa bertumpuk per DSE (IM3 lalu 3ID), masih
  // dikelompokkan per section (tint SP/Voucher/Saldo) spt sebelumnya, cuma
  // kolom ID-nya dikasih titik warna brand biar gampang dibedakan baris mana
  // punya brand apa, & baris ke-2 (3ID) dikasih garis atas putus2 tipis spy
  // 2 baris yg sama DSE-nya tetap kebaca sbg 1 grup. ──
  const groupDivider = { borderLeft: `2px solid ${t.line}` };
  const spBg = t.redBg;
  const voucherBg = t.blueBg;
  const saldoBg = t.amberBg;
  const renderDesktopRow = (bd, i) => (
    <tr key={bd.b} style={{
      borderBottom: i === brandData.length - 1 ? `1px solid ${t.line}` : "none",
      borderTop: i > 0 ? `1px dashed ${t.line}` : "none",
      background: dirty ? t.tealBg : "transparent",
    }}>
      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800 }}>
          {i === 0 ? (
            <button onClick={() => onShowHistory?.(dse.dse_code)} title="Lihat riwayat perubahan"
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 800, fontSize: "inherit", color: t.hi, fontFamily: "inherit" }}>
              {headerCode}<History size={11} style={{ color: t.lo, flexShrink: 0 }} />
            </button>
          ) : (
            <span style={{ color: t.mid, fontWeight: 700 }}>{bd.displayCode}</span>
          )}
          {i === 0 && dse.is_revoked && <span style={{ fontSize: 9.5, fontWeight: 700, color: t.red, background: t.redBg, borderRadius: 999, padding: "1px 6px" }}>Revoked</span>}
        </div>
      </td>
      {/* UPDATE (permintaan user - "tambahkan kolom brand juga di atas, lalu
          kolomnya merge kalau pairingan, yg di-merge cuma Nama DSE/Status/
          Join Date, penjualan tetap dipisah per brand, khusus tampilan
          IOH"): kolom Brand (badge warna per baris) CUMA muncul di mode
          IOH/Both - di mode 1-brand kolom ini sama sekali ga dirender
          (match header yg jg ga nampilin "Brand" di mode itu). */}
      {isDual && (
        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 999, background: bd.meta.bg, border: `1px solid ${bd.meta.border}`, fontSize: 11, fontWeight: 800, color: bd.meta.color }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: bd.meta.color, flexShrink: 0 }} />
            {bd.b}
          </span>
        </td>
      )}
      {/* Nama DSE / Status / Join Date SELALU sama antar brand (satu DSE =
          satu identitas) - di mode IOH DIGABUNG (rowSpan = jumlah brand) jadi
          cuma dirender SEKALI di baris pertama (i===0); baris brand
          berikutnya ga punya <td> ini sama sekali (dilewatin browser krn
          udah ketutup rowSpan dari baris atasnya). Di mode 1-brand,
          rowSpan={1} = perilaku lama persis (tiap baris render sendiri,
          toh cuma ada 1 baris). */}
      {i === 0 && (
        <td rowSpan={brandData.length} style={{ padding: "10px 12px", minWidth: 160, verticalAlign: "top" }}>
          <input type="text" disabled={readOnly} value={identityEdit?.ds_name ?? dse.ds_name ?? ""} onChange={(ev) => onIdentityChange(dse.dse_code, "ds_name", ev.target.value)} style={textInputStyle} />
        </td>
      )}
      {i === 0 && (
        <td rowSpan={brandData.length} style={{ padding: "10px 12px", minWidth: 128, verticalAlign: "top" }}>
          {StatusSelect}
        </td>
      )}
      {i === 0 && (
        <td rowSpan={brandData.length} style={{ padding: "10px 12px", minWidth: 150, verticalAlign: "top" }}>
          <input type="date" disabled={readOnly} value={joinDate || ""} onChange={(ev) => onIdentityChange(dse.dse_code, "join_date", ev.target.value)} style={textInputStyle} />
        </td>
      )}
      <td style={{ padding: "10px 12px", minWidth: 110, ...groupDivider, background: spBg }}><MoneyInput t={t} disabled={readOnly} align="right" value={bd.e.qty_sp} onChange={(v) => bd.setE({ qty_sp: v })} /></td>
      <td style={{ padding: "10px 12px", minWidth: 130, background: spBg }}><MoneyInput t={t} disabled={readOnly} align="right" value={bd.e.nilai_sp} onChange={(v) => bd.setE({ nilai_sp: v })} /></td>
      <td style={{ padding: "10px 12px", minWidth: 110, ...groupDivider, background: voucherBg }}><MoneyInput t={t} disabled={readOnly} align="right" value={bd.e.qty_voucher} onChange={(v) => bd.setE({ qty_voucher: v })} /></td>
      <td style={{ padding: "10px 12px", minWidth: 130, background: voucherBg }}><MoneyInput t={t} disabled={readOnly} align="right" value={bd.e.nilai_voucher} onChange={(v) => bd.setE({ nilai_voucher: v })} /></td>
      <td style={{ padding: "10px 12px", minWidth: 140, ...groupDivider, background: saldoBg }}><MoneyInput t={t} disabled={readOnly} align="right" value={bd.e.nilai_saldo} onChange={(v) => bd.setE({ nilai_saldo: v })} /></td>
      <td style={{ padding: "10px 12px", minWidth: 130, textAlign: "right", fontWeight: 800, color: isDual ? bd.meta.color : t.teal, whiteSpace: "nowrap", ...groupDivider }}>Rp {fmtID(bd.totalPenjualan)}</td>
      <td style={{ padding: "10px 12px", minWidth: 330, ...groupDivider }}>
        <ArPiutangInput t={t} readOnly={readOnly} outstanding={bd.outstanding} bayar={bd.e.ar_bayar} onBayarChange={bd.handleBayarChange} onConfirmSave={() => onSave(dse.dse_code)} saving={saving} />
      </td>
      <td style={{ padding: "10px 12px", minWidth: 150 }}>
        <input type="text" disabled={readOnly} value={bd.e.catatan || ""} onChange={(ev) => bd.setE({ catatan: ev.target.value })} placeholder="opsional" style={textInputStyle} />
        {bd.AuditLine && <div style={{ marginTop: 4 }}>{bd.AuditLine}</div>}
      </td>
      <td style={{ padding: "10px 12px", textAlign: "right" }}>
        {i === 0 && renderSaveButton()}
      </td>
    </tr>
  );

  return brandData.map((bd, i) => renderDesktopRow(bd, i));
}

export default function DSE_ProdAR({ theme, profile, onBack }) {
  const d = theme === "dark";
  const t = {
    bg: d ? "#0F0F11" : "#F2F2F7", card: d ? "#1A1A1D" : "#FFFFFF", sub: d ? "#202024" : "#F5F5F7",
    line: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)", hi: d ? "#F2F2F3" : "#1A1A1D",
    mid: d ? "#8A8A96" : "#5A5A68", lo: d ? "#5A5A68" : "#8A8A96",
    inputBg: d ? "#1E1E22" : "#F8F8FA", inputBd: d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)",
    teal: d ? "#32BCAD" : "#1A9E90", tealBg: d ? "rgba(50,188,173,0.10)" : "rgba(26,158,144,0.07)", tealBd: d ? "rgba(50,188,173,0.28)" : "rgba(26,158,144,0.20)",
    red: d ? "#F87171" : "#DC2626", redBg: d ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)",
    amber: d ? "#FBBF24" : "#B45309", amberBg: d ? "rgba(251,191,36,0.10)" : "rgba(180,83,9,0.08)",
    blue: d ? "#60A5FA" : "#2563EB", blueBg: d ? "rgba(96,165,250,0.10)" : "rgba(37,99,235,0.07)",
    shadowSm: d ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.07)",
  };

  const isSPM = profile?.role === "spm_sumatera";
  const isMPX = profile?.role === "finance_mpx";

  // UPDATE (permintaan user - satu email Admin MC sekarang bisa dipasang ke
  // lebih dari 1 MC lewat mf_dse_admin_mc_mapping): dulu lockedMc cuma 1
  // string dari profile.partner_name (satu MC). Sekarang kita ambil daftar
  // LENGKAP MC milik Admin MC yang login lewat RPC mf_dse_admin_mc_my_mcs()
  // (akses datanya sendiri sudah dijamin RLS di level tabel, ini cuma utk
  // keperluan tampilan & target MC saat import Excel).
  const [myMcs, setMyMcs] = useState([]); // [{ mc, region, branch, full_name }]
  useEffect(() => {
    if (!isMPX) return;
    (async () => {
      const { data, error } = await supabase.rpc("mf_dse_admin_mc_my_mcs");
      if (!error && Array.isArray(data)) setMyMcs(data);
    })();
  }, [isMPX]);
  const myMcNames = useMemo(() => myMcs.map((r) => r.mc).filter(Boolean), [myMcs]);
  const lockedMc = isMPX ? (myMcNames[0] || profile?.partner_name || "") : "";
  const [mpxMcFilter, setMpxMcFilter] = useState(""); // Admin MC dgn >1 MC: pilih target import

  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isCardView = width < TABLE_BP;

  const [tab, setTab] = useState("input"); // input | riwayat
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "ok") => setToast({ msg, type });

  // ── Tab "Input Harian" ────────────────────────────────────────────────────
  // UPDATE (permintaan user - "konsepnya seperti di excel saja, jadi mulai
  // dari bulan, baru di bulan nya itu bisa select multiple tanggal, jadi
  // cukup satu [kontrol] saja"): toggle Tanggal/Periode yang lama DIGANTI
  // satu picker "Excel-style": pilih Bulan dulu, lalu centang satu atau
  // beberapa tanggal di bulan itu (kalender grid, klik = toggle, persis spt
  // filter tanggal di Excel). 1 tanggal dipilih -> mode edit harian biasa;
  // >1 tanggal -> mode akumulasi read-only (sama logicnya spt dulu, cuma
  // sumber tanggalnya sekarang array bebas, bukan cuma range awal..akhir).
  // UPDATE (permintaan user - "secara default dia memilih bulan saat ini",
  // nyontoh filter tanggal Excel yg defaultnya "Select All" bulan berjalan):
  // default-nya BUKAN cuma hari ini, tapi SEMUA tanggal bulan berjalan s.d.
  // hari ini (tanggal 1 s.d. hari ini) - otomatis masuk mode akumulasi.
  const [selectedDates, setSelectedDates] = useState(() => {
    const today = todayISO();
    const ym = today.slice(0, 7);
    const lastDay = Number(today.slice(8, 10));
    return Array.from({ length: lastDay }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
  }); // ["YYYY-MM-DD", ...], selalu >=1
  const [calViewMonth, setCalViewMonth] = useState(() => todayISO().slice(0, 7)); // "YYYY-MM" yg lagi dibuka di popover kalender Daily
  // UPDATE (permintaan user - "di kiri ada opsi Full Month / Daily, di
  // kanannya kalau Full Month ya dropdown bulan+tahun digabung spt
  // 'October 2026', kalau Daily cuma bisa pilih satu tanggal (geser kiri
  // kanan / klik tanggal buka kalender pilih 1 hari), animasi switch-nya
  // bagus"): "periodMode" skrg toggle EKSPLISIT 2 pilihan (bukan 2 kontrol
  // permanen lg). "bulan" -> selectedDates auto = semua tgl di calViewMonth.
  // "tanggal" -> selectedDates auto = [entryDate] (1 tanggal saja).
  const monthDatesUpTo = (ym) => {
    const lastDay = ym === todayISO().slice(0, 7)
      ? Number(todayISO().slice(8, 10))
      : new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
    return Array.from({ length: lastDay }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
  };
  const shiftDay = (iso, delta) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [periodMode, setPeriodMode] = useState("bulan"); // "bulan" | "tanggal"
  const jumpToMonth = (newYm) => { setCalViewMonth(newYm); setSelectedDates(monthDatesUpTo(newYm)); };
  const jumpToDay = (newIso) => {
    const capped = newIso > todayISO() ? todayISO() : newIso;
    setCalViewMonth(capped.slice(0, 7));
    setSelectedDates([capped]);
  };
  const switchPeriodMode = (mode) => {
    setPeriodMode(mode);
    if (mode === "bulan") {
      setSelectedDates(monthDatesUpTo(calViewMonth));
    } else {
      // UPDATE (permintaan user - "jika daily terpilih maka dia akan memilih
      // hari berjalan"): pindah ke Daily SELALU reset ke hari ini, bukan
      // nerusin tanggal lama yg mungkin udah ga relevan.
      setCalViewMonth(todayISO().slice(0, 7));
      setSelectedDates([todayISO()]);
    }
  };
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodRef = useRef(null);
  useEffect(() => {
    if (!periodOpen) return;
    const onClick = (e) => { if (periodRef.current && !periodRef.current.contains(e.target)) setPeriodOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [periodOpen]);
  const sortedSelectedDates = useMemo(() => [...selectedDates].sort(), [selectedDates]);
  const entryDate = sortedSelectedDates[0] || todayISO(); // tanggal aktif (mode Daily) / tanggal paling awal (mode Full Month)
  const rangeStart = sortedSelectedDates[0] || todayISO();
  const rangeEnd = sortedSelectedDates[sortedSelectedDates.length - 1] || todayISO();
  const isRangeMode = sortedSelectedDates.length > 1;
  // "as of" tanggal yg dipakai Mapping & User Management utk nampilin mapping
  // yg BERLAKU pada tanggal itu (pakai riwayat kalau tanggalnya di masa
  // lalu) — single mode: entryDate; multi mode: tanggal paling akhir dipilih.
  const mappingAsOfDate = isRangeMode ? rangeEnd : entryDate;
  // UPDATE (permintaan user - "selain mc bisa pilih branch region juga di
  // input manual"): selain MC, Region & Branch sekarang juga bisa dipilih
  // sbg filter sendiri (cascading: pilih Region -> opsi Branch menyempit ->
  // opsi MC menyempit). Ketiganya opsional & bisa dikombinasikan bebas.
  const [regionFilter, setRegionFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [partnerFilter, setPartnerFilter] = useState(""); // SPM saja: filter per Partner (mdi)
  const [mcFilter, setMcFilter] = useState(""); // SPM saja: pilih MC yang mau diisi
  const [brand, setBrand] = useState("IM3"); // toggle brand aktif - menentukan kolom penjualan mana yg diedit
  // "Both" -> render 2 baris (IM3 & 3ID) per DSE; selain itu cuma 1 baris sesuai brand aktif.
  const activeBrands = useMemo(() => (brand === "BOTH" ? BRANDS : [brand]), [brand]);
  const [dseMeta, setDseMeta] = useState([]); // [{region,branch,mc}] dari Database DSE - sumber opsi cascading di atas
  const [dseList, setDseList] = useState([]);
  const [dseSearch, setDseSearch] = useState("");
  // UPDATE (permintaan user - "tambahkan pemfilteran untuk setiap kolom
  // tanpa terkecuali"): filter PER KOLOM di tabel Input Harian desktop (baris
  // kedua di <thead>, di bawah label kolom) - terpisah dari kotak "Cari DSE"
  // yg sudah ada (dseSearch, cuma cari ID/Nama). Teks -> contains
  // case-insensitive. Status -> exact match (dropdown). Join Date -> rentang
  // dari/sampai. Kolom angka (Qty/Total SP, Voucher, Saldo, Total Penjualan,
  // AR) -> rentang min/max, dihitung dari NILAI YG SEDANG TAMPIL (termasuk
  // editan yg belum disimpan, & dijumlahkan lintas brand kalau mode IOH -
  // sama persis logic penjumlahan yg dipakai mcSummary/stat tile di atas).
  // Brand -> dropdown khusus mode IOH, narrow-in row set per DSE jadi cuma
  // nampilin 1 brand tertentu tanpa keluar dari mode IOH.
  const [colFilters, setColFilters] = useState({
    id: "", brand: "", nama: "", status: "", joinFrom: "", joinTo: "",
    qtySpMin: "", qtySpMax: "", totalSpMin: "", totalSpMax: "",
    qtyVoucherMin: "", qtyVoucherMax: "", totalVoucherMin: "", totalVoucherMax: "",
    saldoMin: "", saldoMax: "", totalPenjualanMin: "", totalPenjualanMax: "",
    arMin: "", arMax: "", catatan: "",
  });
  const setColFilter = (k, v) => setColFilters((prev) => ({ ...prev, [k]: v }));
  const resetColFilters = () => setColFilters({
    id: "", brand: "", nama: "", status: "", joinFrom: "", joinTo: "",
    qtySpMin: "", qtySpMax: "", totalSpMin: "", totalSpMax: "",
    qtyVoucherMin: "", qtyVoucherMax: "", totalVoucherMin: "", totalVoucherMax: "",
    saldoMin: "", saldoMax: "", totalPenjualanMin: "", totalPenjualanMax: "",
    arMin: "", arMax: "", catatan: "",
  });
  const anyColFilterActive = Object.values(colFilters).some((v) => v !== "");
  const [loadingDse, setLoadingDse] = useState(false);
  const [entries, setEntries] = useState({});     // { [dse_code]: { IM3: {...}, "3ID": {...} } }
  const [identity, setIdentity] = useState({});   // { [dse_code]: { ds_name, mc } }
  const [dirty, setDirty] = useState({});         // { [dse_code]: true }
  const [savingCode, setSavingCode] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [prevAr, setPrevAr] = useState({});       // { "dse_code|brand": lastOutstandingAmount }
  const [profilesMap, setProfilesMap] = useState({}); // { [uuid]: full_name }
  const [historyFor, setHistoryFor] = useState(null); // dse_code lagi dibuka popup riwayatnya, atau null

  // SPM perlu pilih Region/Branch/MC dulu (tidak otomatis dibatasi RLS);
  // Admin MC langsung terbatas lewat RLS jadi tidak perlu pilih. dseMeta
  // dipakai utk membangun opsi cascading Region -> Branch -> MC di bawah.
  useEffect(() => {
    if (!isSPM) return;
    (async () => {
      const { data } = await supabase.from("mf_dse_database").select("region, branch, mdi, mc").eq("is_revoked", false).not("mc", "is", null);
      setDseMeta(data || []);
    })();
  }, [isSPM]);

  // Urutan hierarki cascading: Partner -> Region -> Branch -> MC. Partner
  // DI ATAS Region (bukan di bawah) karena 1 Partner (mdi) bisa beroperasi
  // di beberapa Region sekaligus (cek data: "PT MARI KERJA BERSAMA" & "PT
  // SARANA PUTRA CEMERLANG" ada di NORTH + SOUTH SUMATERA, "PT TRIMINDO JAYA
  // MANDIRI" ada di CENTRAL + NORTH SUMATERA) — jadi opsi Partner TIDAK
  // boleh difilter oleh Region/Branch yang sedang dipilih, sementara opsi
  // Region/Branch/MC di bawahnya ikut menyempit kalau Partner dipilih.
  const partnerOptions = useMemo(() => Array.from(new Set(dseMeta.map((r) => r.mdi).filter(Boolean))).sort(), [dseMeta]);
  const regionOptions = useMemo(() => Array.from(new Set(
    dseMeta.filter((r) => !partnerFilter || r.mdi === partnerFilter).map((r) => r.region).filter(Boolean)
  )).sort(), [dseMeta, partnerFilter]);
  const branchOptions = useMemo(() => Array.from(new Set(
    dseMeta.filter((r) => (!partnerFilter || r.mdi === partnerFilter) && (!regionFilter || r.region === regionFilter)).map((r) => r.branch).filter(Boolean)
  )).sort(), [dseMeta, partnerFilter, regionFilter]);
  const mcOptions = useMemo(() => Array.from(new Set(
    dseMeta.filter((r) => (!partnerFilter || r.mdi === partnerFilter) && (!regionFilter || r.region === regionFilter) && (!branchFilter || r.branch === branchFilter)).map((r) => r.mc).filter(Boolean)
  )).sort(), [dseMeta, partnerFilter, regionFilter, branchFilter]);

  // ── Ringkasan per Region ("ALL Sumatera", tampilan default saat belum
  // pilih Region/Branch/MC sama sekali) — permintaan user: "secara default
  // pada region ALL sumatera, sehingga menampilkan angka per masing masing
  // region". Beda dgn tabel input (yg butuh Region/Branch/MC dipilih dulu
  // spy tidak menarik SELURUH roster DSE sekaligus utk diedit), ringkasan
  // ini cuma menjumlahkan angka — aman dimuat tanpa filter apa pun, lalu
  // klik salah satu Region utk drill-down ke tabel input region itu. ──
  const [regionSummary, setRegionSummary] = useState([]);
  const [loadingRegionSummary, setLoadingRegionSummary] = useState(false);
  const showAllRegions = isSPM && !regionFilter && !branchFilter && !partnerFilter && !mcFilter && !isRangeMode;
  const loadRegionSummary = useCallback(async () => {
    setLoadingRegionSummary(true);
    try {
      const { data: dses, error: e1 } = await supabase.from("mf_dse_database").select("dse_code, region, dse_status").eq("is_revoked", false);
      if (e1) throw e1;
      const regionOf = {};
      const byRegion = {};
      (dses || []).forEach((r) => {
        const key = r.region || "Belum Ada Region";
        regionOf[r.dse_code] = key;
        if (!byRegion[key]) byRegion[key] = { region: key, totalAlokasi: 0, totalActive: 0, qtySp: 0, nilaiSp: 0, qtyVoucher: 0, nilaiVoucher: 0, nilaiSaldo: 0, tunggakan: 0 };
        byRegion[key].totalAlokasi += 1;
        if (r.dse_status === "Active") byRegion[key].totalActive += 1;
      });
      const codes = (dses || []).map((r) => r.dse_code);
      if (codes.length) {
        // "Both" -> jumlahkan IM3 + 3ID sekaligus (ga difilter per-brand);
        // kalau cuma 1 brand aktif tetap difilter spt sebelumnya.
        let prodQ = supabase.from("mf_dse_prod_ar").select("dse_code, qty_sp, nilai_sp, qty_voucher, nilai_voucher, nilai_saldo, ar_piutang").eq("tanggal", entryDate).in("dse_code", codes);
        if (brand !== "BOTH") prodQ = prodQ.eq("brand", brand);
        const { data: prod, error: e2 } = await prodQ;
        if (e2) throw e2;
        (prod || []).forEach((p) => {
          const b = byRegion[regionOf[p.dse_code]];
          if (!b) return;
          b.qtySp += fRaw(p.qty_sp); b.nilaiSp += fRaw(p.nilai_sp);
          b.qtyVoucher += fRaw(p.qty_voucher); b.nilaiVoucher += fRaw(p.nilai_voucher);
          b.nilaiSaldo += fRaw(p.nilai_saldo); b.tunggakan += fRaw(p.ar_piutang);
        });
      }
      setRegionSummary(Object.values(byRegion).sort((a, b) => a.region.localeCompare(b.region)));
    } catch (e) {
      showToast(e.message || "Gagal memuat ringkasan per region.", "error");
    } finally {
      setLoadingRegionSummary(false);
    }
  }, [entryDate, brand]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (showAllRegions) loadRegionSummary(); }, [showAllRegions, loadRegionSummary]);

  const loadDseAndEntries = useCallback(async () => {
    setLoadingDse(true);
    try {
      let q = supabase.from("mf_dse_database").select("dse_code, dse_code_3id, ds_name, mc, branch, region, mdi, is_revoked, dse_status, join_date").eq("is_revoked", false).order("dse_code", { ascending: true });
      if (isSPM) {
        // Tanpa filter apa pun -> tampilkan akumulasi dari level tertinggi
        // (semua Partner/Region/Branch/MC), bukan kosong.
        if (regionFilter) q = q.eq("region", regionFilter);
        if (branchFilter) q = q.eq("branch", branchFilter);
        if (partnerFilter) q = q.eq("mdi", partnerFilter);
        if (mcFilter) q = q.eq("mc", mcFilter);
      }
      // Supabase caps a single request at 1000 rows -> paginate with
      // .range() so DSE lists past 1000 (ALL Sumatera akumulasi) aren't
      // silently truncated.
      const dses = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: pageData, error: eP } = await q.range(from, from + PAGE - 1);
        if (eP) throw eP;
        dses.push(...(pageData || []));
        if (!pageData || pageData.length < PAGE) break;
      }
      setDseList(dses);

      const codes = (dses || []).map((r) => r.dse_code);
      if (codes.length) {
        if (isRangeMode) {
          // Mode Periode: AKUMULASI tanggal-tanggal yg DICENTANG (bisa bolong,
          // tidak harus berurutan — spt filter tanggal di Excel). Qty/Nilai
          // SP/Voucher/Saldo -> dijumlahkan. AR/Piutang bukan nilai kumulatif
          // (dia saldo), jadi dipakai ar_piutang pada tanggal TERCENTANG yg
          // paling baru per dse_code+brand (bukan dijumlah).
          const { data: prod, error: e2 } = await supabase
            .from("mf_dse_prod_ar").select("*")
            .in("tanggal", sortedSelectedDates).in("dse_code", codes)
            .order("tanggal", { ascending: true });
          if (e2) throw e2;
          const map = {};
          const uploaderIds = new Set();
          (prod || []).forEach((r) => {
            map[r.dse_code] = map[r.dse_code] || {};
            const acc = map[r.dse_code][r.brand] || {
              qty_sp: 0, nilai_sp: 0, qty_saldo: 0, nilai_saldo: 0, qty_voucher: 0, nilai_voucher: 0,
              ar_piutang: 0, ar_bayar: 0, catatan: "", updated_at: r.updated_at, uploaded_at: r.uploaded_at, uploaded_by: r.uploaded_by,
            };
            acc.qty_sp += fRaw(r.qty_sp); acc.nilai_sp += fRaw(r.nilai_sp);
            acc.qty_saldo += fRaw(r.qty_saldo); acc.nilai_saldo += fRaw(r.nilai_saldo);
            acc.qty_voucher += fRaw(r.qty_voucher); acc.nilai_voucher += fRaw(r.nilai_voucher);
            acc.ar_bayar += fRaw(r.ar_bayar);
            acc.ar_piutang = r.ar_piutang; // selalu ditimpa -> baris terakhir (tanggal paling baru) yg menang
            acc.updated_at = r.updated_at; acc.uploaded_at = r.uploaded_at; acc.uploaded_by = r.uploaded_by;
            map[r.dse_code][r.brand] = acc;
            if (r.uploaded_by) uploaderIds.add(r.uploaded_by);
          });
          setEntries(map);
          setPrevAr({});
          if (uploaderIds.size) {
            const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(uploaderIds));
            const pm = {};
            (profs || []).forEach((p) => { pm[p.id] = p.full_name; });
            setProfilesMap(pm);
          } else {
            setProfilesMap({});
          }
          setIdentity({});
          setDirty({});
          return;
        }

        const { data: prod, error: e2 } = await supabase.from("mf_dse_prod_ar").select("*").eq("tanggal", entryDate).in("dse_code", codes);
        if (e2) throw e2;
        const map = {};
        const uploaderIds = new Set();
        (prod || []).forEach((r) => {
          map[r.dse_code] = map[r.dse_code] || {};
          map[r.dse_code][r.brand] = {
            qty_sp: r.qty_sp, nilai_sp: r.nilai_sp, qty_saldo: r.qty_saldo, nilai_saldo: r.nilai_saldo,
            qty_voucher: r.qty_voucher, nilai_voucher: r.nilai_voucher,
            ar_piutang: r.ar_piutang, ar_bayar: r.ar_bayar || 0, catatan: r.catatan || "",
            updated_at: r.updated_at, uploaded_at: r.uploaded_at, uploaded_by: r.uploaded_by,
          };
          if (r.uploaded_by) uploaderIds.add(r.uploaded_by);
        });
        setEntries(map);

        // Carry-forward: ambil ar_piutang terakhir SEBELUM entryDate per dse_code+brand,
        // untuk ditampilkan sebagai "Utang Saat Ini" (read-only) pada ArPiutangInput.
        const { data: prev, error: e3 } = await supabase
          .from("mf_dse_prod_ar")
          .select("dse_code, brand, ar_piutang, tanggal")
          .lt("tanggal", entryDate)
          .in("dse_code", codes)
          .order("tanggal", { ascending: false })
          .limit(5000);
        if (e3) throw e3;
        const prevMap = {};
        (prev || []).forEach((r) => {
          const key = `${r.dse_code}|${r.brand}`;
          if (!(key in prevMap)) prevMap[key] = fRaw(r.ar_piutang);
        });
        setPrevAr(prevMap);

        if (uploaderIds.size) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", Array.from(uploaderIds));
          const pm = {};
          (profs || []).forEach((p) => { pm[p.id] = p.full_name; });
          setProfilesMap(pm);
        } else {
          setProfilesMap({});
        }
      } else {
        setEntries({});
        setPrevAr({});
        setProfilesMap({});
      }
      setIdentity({});
      setDirty({});
    } catch (e) {
      showToast(e.message || "Gagal memuat daftar DSE.", "error");
    } finally {
      setLoadingDse(false);
    }
  }, [isSPM, regionFilter, branchFilter, partnerFilter, mcFilter, entryDate, isRangeMode, sortedSelectedDates]);

  useEffect(() => { loadDseAndEntries(); }, [loadDseAndEntries]);

  // Warn before closing/reloading the tab while there are unsaved edits.
  useEffect(() => {
    const anyDirty = Object.values(dirty).some(Boolean);
    if (!anyDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleEntryChange = (code, brand, val) => {
    setEntries((prev) => ({ ...prev, [code]: { ...prev[code], [brand]: val } }));
    setDirty((prev) => ({ ...prev, [code]: true }));
  };
  const handleIdentityChange = (code, field, val) => {
    setIdentity((prev) => ({ ...prev, [code]: { ...prev[code], [field]: val } }));
    setDirty((prev) => ({ ...prev, [code]: true }));
  };

  const handleSaveDse = async (code) => {
    setSavingCode(code);
    try {
      const dse = dseList.find((x) => x.dse_code === code);
      const idEdit = identity[code];
      if (idEdit && (idEdit.ds_name !== undefined || idEdit.mc !== undefined || idEdit.dse_status !== undefined || idEdit.join_date !== undefined)) {
        const payload = {};
        if (idEdit.ds_name !== undefined && idEdit.ds_name !== dse?.ds_name) payload.ds_name = idEdit.ds_name;
        if (idEdit.mc !== undefined && idEdit.mc !== dse?.mc) payload.mc = idEdit.mc;
        if (idEdit.dse_status !== undefined && idEdit.dse_status !== dse?.dse_status) payload.dse_status = idEdit.dse_status || null;
        if (idEdit.join_date !== undefined && idEdit.join_date !== dse?.join_date) payload.join_date = idEdit.join_date || null;
        if (Object.keys(payload).length) {
          const { error } = await supabase.from("mf_dse_database").update(payload).eq("dse_code", code);
          if (error) throw error;
        }
      }

      const brandEntries = entries[code] || {};
      const rowsToSave = BRANDS.filter((b) => brandEntries[b]).map((b) => ({
        tanggal: entryDate, dse_code: code, brand: b,
        mc: (idEdit?.mc ?? dse?.mc) || null,
        qty_sp: fRaw(brandEntries[b].qty_sp), nilai_sp: fRaw(brandEntries[b].nilai_sp),
        qty_saldo: fRaw(brandEntries[b].qty_saldo), nilai_saldo: fRaw(brandEntries[b].nilai_saldo),
        qty_voucher: fRaw(brandEntries[b].qty_voucher), nilai_voucher: fRaw(brandEntries[b].nilai_voucher),
        ar_piutang: fRaw(brandEntries[b].ar_piutang), ar_bayar: fRaw(brandEntries[b].ar_bayar), catatan: brandEntries[b].catatan || null,
        uploaded_by: profile?.id || null,
      }));
      if (rowsToSave.length) {
        const { error } = await supabase.from("mf_dse_prod_ar").upsert(rowsToSave, { onConflict: "tanggal,dse_code,brand" });
        if (error) throw error;
      }
      setDirty((prev) => ({ ...prev, [code]: false }));
      showToast(`Data ${code} tersimpan.`, "ok");
      return true;
    } catch (e) {
      showToast(e.message || "Gagal menyimpan.", "error");
      return false;
    } finally {
      setSavingCode(null);
    }
  };

  const handleSaveAllDirty = async () => {
    const codes = Object.keys(dirty).filter((c) => dirty[c]);
    const results = [];
    for (const c of codes) results.push(await handleSaveDse(c)); // eslint-disable-line no-await-in-loop
    const failCount = results.filter((r) => r === false).length;
    if (failCount === 0 && codes.length > 0) {
      showToast(`Semua perubahan tersimpan dengan aman (${codes.length} DSE).`, "ok");
    } else if (failCount > 0) {
      showToast(`${codes.length - failCount} dari ${codes.length} DSE tersimpan. ${failCount} gagal, silakan coba lagi.`, "error");
    }
    return failCount === 0;
  };

  // --- Unsaved-changes guard: any action that would discard in-progress edits
  // (switching tab, changing region/branch/partner/MC/brand filters, or
  // changing the period) must first confirm Save or Discard with the user.
  const [pendingGuardedAction, setPendingGuardedAction] = useState(null); // () => void
  const runGuarded = (action) => {
    if (Object.values(dirty).some(Boolean)) {
      setPendingGuardedAction(() => action);
    } else {
      action();
    }
  };
  const discardAllDirty = () => {
    setDirty({});
    setEntries({});
    setIdentity({});
    loadDseAndEntries();
  };
  const handleConfirmSave = async () => {
    const action = pendingGuardedAction;
    const ok = await handleSaveAllDirty();
    if (ok) {
      setPendingGuardedAction(null);
      if (action) action();
    }
  };
  const handleConfirmDiscard = () => {
    const action = pendingGuardedAction;
    discardAllDirty();
    setPendingGuardedAction(null);
    if (action) action();
  };

  const filteredDseList = useMemo(() => {
    const toNum = (v) => (v === "" || v === undefined || v === null ? null : Number(v));
    const inRange = (val, minRaw, maxRaw) => {
      const min = toNum(minRaw), max = toNum(maxRaw);
      if (min !== null && val < min) return false;
      if (max !== null && val > max) return false;
      return true;
    };
    return dseList.filter((r) => {
      if (dseSearch) {
        const s = dseSearch.toLowerCase();
        if (!(r.dse_code?.toLowerCase().includes(s) || r.dse_code_3id?.toLowerCase().includes(s) || r.ds_name?.toLowerCase().includes(s))) return false;
      }
      const idF = colFilters.id.trim().toLowerCase();
      if (idF && !(r.dse_code?.toLowerCase().includes(idF) || r.dse_code_3id?.toLowerCase().includes(idF))) return false;

      const namaF = colFilters.nama.trim().toLowerCase();
      if (namaF && !(identity[r.dse_code]?.ds_name ?? r.ds_name ?? "").toLowerCase().includes(namaF)) return false;

      const statusVal = identity[r.dse_code]?.dse_status ?? r.dse_status ?? "";
      if (colFilters.status && statusVal !== colFilters.status) return false;

      const joinVal = identity[r.dse_code]?.join_date ?? r.join_date ?? "";
      if (colFilters.joinFrom && (!joinVal || joinVal < colFilters.joinFrom)) return false;
      if (colFilters.joinTo && (!joinVal || joinVal > colFilters.joinTo)) return false;

      // Angka & Catatan: dihitung dari nilai yg LAGI TAMPIL (termasuk editan
      // belum tersimpan), dijumlahkan lintas activeBrands kalau mode IOH -
      // match persis logic di mcSummary/stat tile.
      let qtySp = 0, nilaiSp = 0, qtyVoucher = 0, nilaiVoucher = 0, nilaiSaldo = 0, ar = 0;
      let catatanMatch = !colFilters.catatan.trim();
      const catatanF = colFilters.catatan.trim().toLowerCase();
      for (const b of activeBrands) {
        const e = entries[r.dse_code]?.[b];
        if (e) {
          qtySp += fRaw(e.qty_sp); nilaiSp += fRaw(e.nilai_sp);
          qtyVoucher += fRaw(e.qty_voucher); nilaiVoucher += fRaw(e.nilai_voucher);
          nilaiSaldo += fRaw(e.nilai_saldo);
          if (catatanF && (e.catatan || "").toLowerCase().includes(catatanF)) catatanMatch = true;
        }
        ar += fRaw(prevAr[`${r.dse_code}|${b}`]);
      }
      const totalPenjualan = nilaiSp + nilaiVoucher + nilaiSaldo;
      if (!catatanMatch) return false;
      if (!inRange(qtySp, colFilters.qtySpMin, colFilters.qtySpMax)) return false;
      if (!inRange(nilaiSp, colFilters.totalSpMin, colFilters.totalSpMax)) return false;
      if (!inRange(qtyVoucher, colFilters.qtyVoucherMin, colFilters.qtyVoucherMax)) return false;
      if (!inRange(nilaiVoucher, colFilters.totalVoucherMin, colFilters.totalVoucherMax)) return false;
      if (!inRange(nilaiSaldo, colFilters.saldoMin, colFilters.saldoMax)) return false;
      if (!inRange(totalPenjualan, colFilters.totalPenjualanMin, colFilters.totalPenjualanMax)) return false;
      if (!inRange(ar, colFilters.arMin, colFilters.arMax)) return false;

      return true;
    });
  }, [dseList, dseSearch, colFilters, identity, entries, prevAr, activeBrands]);
  // Brand-column filter (mode IOH saja): narrow baris brand mana yg DIRENDER
  // per DSE tanpa keluar dari mode IOH (tabel tetap nampilin kolom Brand &
  // sel identitas yg di-rowSpan, cuma row IM3/3ID yg lain disembunyikan).
  const rowBrands = colFilters.brand && activeBrands.length > 1 ? [colFilters.brand] : activeBrands;

  // ── Ringkasan (summary cards) — di-scope ke MC yang sedang dipilih (lihat
  // `dseList`, bukan filteredDseList, supaya tetap utuh walau sedang mengetik
  // di kotak "Cari DSE") + brand & tanggal yang aktif saat ini. Status DSE
  // dan angka yg BARU DIEDIT (belum disimpan ke server) ikut dihitung di sini
  // juga - pakai `identity`/`entries` override yg sama dgn yg dipakai baris
  // tabel, supaya kartu ini langsung update real-time saat admin mengetik,
  // bukan baru berubah setelah tombol Simpan ditekan.
  // UPDATE (permintaan user): akumulasi per Branch & per Partner MENYUSUL -
  // utk sekarang summary-nya cuma per MC yg sedang dipilih di filter atas.
  const mcSummary = useMemo(() => {
    let totalActive = 0, totalVacant = 0, totalInterview = 0;
    let qtySp = 0, nilaiSp = 0, qtyVoucher = 0, nilaiVoucher = 0, nilaiSaldo = 0, tunggakan = 0;
    for (const dse of dseList) {
      const status = identity[dse.dse_code]?.dse_status ?? dse.dse_status ?? "";
      if (status === "Active") totalActive++;
      else if (status === "Vacant") totalVacant++;
      else if (status === "Interview") totalInterview++;
      // "Both" -> jumlahkan entry IM3 + 3ID sekaligus (activeBrands = [IM3, 3ID]);
      // kalau cuma 1 brand aktif, activeBrands cuma berisi brand itu spt sebelumnya.
      for (const b of activeBrands) {
        const e = entries[dse.dse_code]?.[b];
        if (e) {
          qtySp += fRaw(e.qty_sp); nilaiSp += fRaw(e.nilai_sp);
          qtyVoucher += fRaw(e.qty_voucher); nilaiVoucher += fRaw(e.nilai_voucher);
          nilaiSaldo += fRaw(e.nilai_saldo);
          tunggakan += fRaw(e.ar_piutang);
        }
      }
    }
    return { totalAlokasi: dseList.length, totalActive, totalVacant, totalInterview, qtySp, nilaiSp, qtyVoucher, nilaiVoucher, nilaiSaldo, tunggakan, totalPenjualan: nilaiSp + nilaiVoucher + nilaiSaldo };
  }, [dseList, identity, entries, activeBrands]);

  // ── Import massal Excel (opsional, sekunder) ──────────────────────────────
  const [staged, setStaged] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const onPickFile = async (fileList) => {
    const f = (fileList || [])[0];
    if (!f) return;
    const p = await parseWorkbook(f, isMPX ? (mpxMcFilter || lockedMc) : mcFilter);
    setStaged({ fileName: f.name, ...p });
    if (fileRef.current) fileRef.current.value = "";
  };
  const handleUpload = async () => {
    if (!staged || staged.error || !staged.rows?.length) return;
    setUploading(true);
    try {
      const payload = staged.rows.map((r) => ({ ...r, uploaded_by: profile?.id || null, source_file: staged.fileName }));
      const { error } = await supabase.from("mf_dse_prod_ar").upsert(payload, { onConflict: "tanggal,dse_code,brand" });
      if (error) throw error;
      showToast(`Berhasil disimpan — ${payload.length} baris.`, "ok");
      setStaged(null);
      loadDseAndEntries();
      fetchRiwayat(1, search);
    } catch (e) {
      showToast(e.message || "Gagal menyimpan data.", "error");
    } finally {
      setUploading(false);
    }
  };

  // ── Tab "Riwayat" ──────────────────────────────────────────────────────────
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [totals, setTotals] = useState({ qty_sp: 0, nilai_sp: 0, qty_saldo: 0, nilai_saldo: 0, qty_voucher: 0, nilai_voucher: 0, ar_piutang: 0, ar_bayar: 0 });
  const [exportLoading, setExportLoading] = useState(false);

  const fetchRiwayat = useCallback(async (pg = 1, srch = search) => {
    setFetching(true);
    try {
      let q = supabase.from("mf_dse_prod_ar").select("*", { count: "exact" })
        .order("tanggal", { ascending: false }).order("dse_code", { ascending: true });
      if (dateFrom) q = q.gte("tanggal", dateFrom);
      if (dateTo) q = q.lte("tanggal", dateTo);
      if (srch) {
        const s = srch.replace(/[%_]/g, "");
        q = q.or(`dse_code.ilike.%${s}%,mc.ilike.%${s}%,ds_name.ilike.%${s}%,branch.ilike.%${s}%`);
      }
      const from = (pg - 1) * PAGE_SIZE;
      const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      setRows(data || []);
      setTotal(count || 0);
      setPage(pg);

      let tq = supabase.from("mf_dse_prod_ar").select("qty_sp,nilai_sp,qty_saldo,nilai_saldo,qty_voucher,nilai_voucher,ar_piutang,ar_bayar");
      if (dateFrom) tq = tq.gte("tanggal", dateFrom);
      if (dateTo) tq = tq.lte("tanggal", dateTo);
      if (srch) {
        const s = srch.replace(/[%_]/g, "");
        tq = tq.or(`dse_code.ilike.%${s}%,mc.ilike.%${s}%,ds_name.ilike.%${s}%,branch.ilike.%${s}%`);
      }
      const { data: all } = await tq.limit(50000);
      const sum = (all || []).reduce((a, r) => ({
        qty_sp: a.qty_sp + fRaw(r.qty_sp), nilai_sp: a.nilai_sp + fRaw(r.nilai_sp),
        qty_saldo: a.qty_saldo + fRaw(r.qty_saldo), nilai_saldo: a.nilai_saldo + fRaw(r.nilai_saldo),
        qty_voucher: a.qty_voucher + fRaw(r.qty_voucher), nilai_voucher: a.nilai_voucher + fRaw(r.nilai_voucher),
        ar_piutang: a.ar_piutang + fRaw(r.ar_piutang), ar_bayar: a.ar_bayar + fRaw(r.ar_bayar),
      }), { qty_sp: 0, nilai_sp: 0, qty_saldo: 0, nilai_saldo: 0, qty_voucher: 0, nilai_voucher: 0, ar_piutang: 0, ar_bayar: 0 });
      setTotals(sum);
    } catch (e) {
      showToast(e.message || "Gagal memuat data.", "error");
    } finally {
      setFetching(false);
    }
  }, [search, dateFrom, dateTo]);

  useEffect(() => { if (tab === "riwayat") fetchRiwayat(1, search); }, [tab, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = setTimeout(() => { setSearch(searchInput); if (tab === "riwayat") fetchRiwayat(1, searchInput); }, 350);
    return () => clearTimeout(h);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async () => {
    setExportLoading(true);
    try {
      let q = supabase.from("mf_dse_prod_ar").select("*").order("tanggal", { ascending: false }).order("dse_code", { ascending: true });
      if (dateFrom) q = q.gte("tanggal", dateFrom);
      if (dateTo) q = q.lte("tanggal", dateTo);
      const { data, error } = await q.limit(50000);
      if (error) throw error;
      const head = ["Tanggal", "Kode DSE", "Brand", "MC", "Branch", "Nama DS", "Nama DSE", "Qty SP", "Nilai SP", "Qty Saldo", "Nilai Saldo", "Qty Voucher", "Nilai Voucher", "Bayar AR", "Sisa AR/Piutang", "Catatan", "Terakhir Diperbarui"];
      const body = (data || []).map((r) => [
        r.tanggal, r.dse_code, r.brand || "IM3", r.mc || "", r.branch || "", r.ds_name || "", r.dse_name || "",
        fRaw(r.qty_sp), fRaw(r.nilai_sp), fRaw(r.qty_saldo), fRaw(r.nilai_saldo), fRaw(r.qty_voucher), fRaw(r.nilai_voucher),
        fRaw(r.ar_bayar), fRaw(r.ar_piutang), r.catatan || "", r.updated_at || "",
      ]);
      const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "DSE Prod & AR");
      XLSX.writeFile(wb, `DSE_Prod_AR_${dateFrom || "semua"}_${dateTo || "semua"}.xlsx`);
      showToast(`Export selesai — ${body.length} baris.`, "ok");
    } catch (e) {
      showToast(e.message || "Gagal export.", "error");
    } finally {
      setExportLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inputStyle = { width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  return (
    <div style={{ fontFamily: FONT, color: t.hi }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {pendingGuardedAction && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 380, maxWidth: "90vw", background: t.card, border: `1px solid ${t.line}`, borderRadius: 14, padding: 22, boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.hi, marginBottom: 6 }}>Ada perubahan belum disimpan</div>
            <div style={{ fontSize: 13, color: t.mid, lineHeight: 1.5, marginBottom: 18 }}>
              Kamu punya {dirtyCount} DSE dengan perubahan yang belum disimpan. Simpan dulu sebelum lanjut, atau buang perubahannya?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={handleConfirmSave} style={{ height: 40, borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                Simpan &amp; Lanjutkan
              </button>
              <button onClick={handleConfirmDiscard} style={{ height: 40, borderRadius: 9, border: `1px solid ${t.line}`, background: "transparent", color: "#d14343", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                Buang Perubahan &amp; Lanjutkan
              </button>
              <button onClick={() => setPendingGuardedAction(null)} style={{ height: 40, borderRadius: 9, border: "none", background: "transparent", color: t.mid, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
      {historyFor && <DseHistoryModal t={t} dseCode={historyFor} onClose={() => setHistoryFor(null)} />}

      {/* ── Header ── permintaan user: "dse prod & ar tetap dibungkus
          container, di sebelah kirinya ada Periode — konsepnya seperti di
          Excel: mulai dari pilih Bulan, lalu di bulan itu bisa centang satu
          atau beberapa tanggal, jadi cukup satu kontrol saja, tapi UI-nya
          harus sangat rapi & mudah dipahami." Judul "DSE Prod. & AR" tetap
          dibungkus kartu (card) spt semula; di sebelah kirinya sekarang ada
          tombol Periode (trigger) yg membuka kalender 1-bulan dgn multi-
          select tanggal (klik tanggal = centang/un-centang), gantiin toggle
          Tanggal/Periode yg lama. ── */}
      {/* UPDATE (permintaan user - "titlenya di kiri, select periode di
          kanan, dibungkus dalam satu container yang sama agar
          proporsional"): judul & Periode sekarang SATU kartu yg sama
          (justify-content space-between), bukan 2 kartu terpisah lagi. ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, padding: "10px 16px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: t.tealBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Wallet size={17} color={t.teal} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3 }}>DSE Prod. &amp; AR</div>
        </div>

        {/* UPDATE (permintaan user - "tombol kiri kanannya dibungkus
            container terpisah, lebar pemilihan bulan/tanggal disamakan agar
            tidak berpindah-pindah saat toggle Full Month/Daily, Daily
            default ke hari berjalan, bisa pilih bulan juga di kalendernya,
            hapus kalimat 'Tanggal dipilih'"): skrg SELALU 3 kotak terpisah
            berdampingan — [◀ panah] [label, LEBAR TETAP utk kedua mode]
            [▶ panah] — strukturnya sama persis di kedua mode, cuma konten &
            handler di dalamnya yg beda, jadi toggle Full Month<->Daily ga
            bikin layout "loncat". Label center masih pakai .periodFade utk
            crossfade teks halus tiap ganti tanggal/bulan/mode. ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2, height: 44, padding: 3, borderRadius: 11, background: t.sub, flexShrink: 0 }}>
            {[{ k: "bulan", label: "Full Month" }, { k: "tanggal", label: "Daily" }].map(({ k, label }) => (
              <button key={k} onClick={() => runGuarded(() => switchPeriodMode(k))}
                style={{ height: 38, padding: "0 14px", borderRadius: 8, border: "none", outline: "none", background: periodMode === k ? t.card : "transparent", color: periodMode === k ? t.hi : t.mid, fontSize: 12.5, fontWeight: periodMode === k ? 700 : 600, cursor: "pointer", fontFamily: FONT, boxShadow: periodMode === k ? t.shadowSm : "none", transition: "background 0.2s, box-shadow 0.2s, color 0.2s", whiteSpace: "nowrap" }}>
                {label}
              </button>
            ))}
          </div>

          <div ref={periodRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => runGuarded(() => (periodMode === "bulan" ? jumpToMonth(shiftMonth(calViewMonth, -1)) : jumpToDay(shiftDay(entryDate, -1))))}
              style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} />
            </button>

            <button onClick={() => { if (periodMode === "tanggal") setPeriodOpen((v) => !v); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: 186, height: 36, borderRadius: 10, border: `1px solid ${periodOpen && periodMode === "tanggal" ? t.teal : t.inputBd}`, background: periodOpen && periodMode === "tanggal" ? t.tealBg : t.inputBg, cursor: periodMode === "tanggal" ? "pointer" : "default", fontFamily: FONT, outline: "none", flexShrink: 0 }}>
              <Calendar size={13} color={t.teal} style={{ flexShrink: 0 }} />
              <span key={periodMode === "bulan" ? calViewMonth : entryDate} className="periodFade" style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, whiteSpace: "nowrap" }}>
                {periodMode === "bulan" ? `${MONTH_NAMES[Number(calViewMonth.slice(5, 7)) - 1]} ${calViewMonth.slice(0, 4)}` : fmtDayMonth(entryDate)}
              </span>
              {/* UPDATE (permintaan user - "tambahkan arrow ke bawah agar tau
                  jika tanggalnya itu bisa di klik"): chevron kecil nunjukkin
                  ini bisa diklik (buka kalender) - cuma relevan di mode
                  Daily, di mode Full Month redup & ga bisa diklik (nav bulan
                  udah cukup lewat 2 panah kiri-kanan). */}
              <ChevronDown size={13} color={periodMode === "tanggal" ? t.lo : t.line} style={{ flexShrink: 0, transform: periodOpen && periodMode === "tanggal" ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>

            <button
              onClick={() => runGuarded(() => (periodMode === "bulan" ? jumpToMonth(shiftMonth(calViewMonth, 1)) : jumpToDay(shiftDay(entryDate, 1))))}
              disabled={periodMode === "bulan" ? calViewMonth >= todayISO().slice(0, 7) : entryDate >= todayISO()}
              style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: (periodMode === "bulan" ? calViewMonth >= todayISO().slice(0, 7) : entryDate >= todayISO()) ? t.line : t.mid, cursor: (periodMode === "bulan" ? calViewMonth >= todayISO().slice(0, 7) : entryDate >= todayISO()) ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
            </button>

            {periodOpen && periodMode === "tanggal" && (
              <div className="periodFade" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 300, width: 264, borderRadius: 16, border: `1px solid ${t.line}`, background: t.card, boxShadow: "0 16px 40px rgba(0,0,0,0.22)", padding: 14 }}>
                {/* Nav bulan di dalam kalender ini jg bisa dipakai utk "pilih bulan" (permintaan
                    user "pada saat membuka kalender bisa pilih bulan juga") - cuma pindah
                    tampilan kalender mini (calViewMonth), TIDAK ikut ganti entryDate sampai
                    user benar2 klik salah satu tanggalnya. */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <button onClick={() => setCalViewMonth(shiftMonth(calViewMonth, -1))} style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: t.sub, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronDown size={13} style={{ transform: "rotate(90deg)" }} />
                  </button>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>
                    {MONTH_NAMES[Number(calViewMonth.slice(5, 7)) - 1]} {calViewMonth.slice(0, 4)}
                  </div>
                  <button onClick={() => setCalViewMonth(shiftMonth(calViewMonth, 1))} disabled={calViewMonth >= todayISO().slice(0, 7)}
                    style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: t.sub, color: calViewMonth >= todayISO().slice(0, 7) ? t.line : t.mid, cursor: calViewMonth >= todayISO().slice(0, 7) ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ChevronDown size={13} style={{ transform: "rotate(-90deg)" }} />
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
                  {DAY_NAMES_SHORT.map((lbl, i) => (
                    <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: t.lo, padding: "4px 0" }}>{lbl}</div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                  {buildMonthGrid(calViewMonth).map((iso, i) => {
                    if (!iso) return <div key={i} />;
                    const isSelected = iso === entryDate;
                    const isToday = iso === todayISO();
                    const isFuture = iso > todayISO();
                    return (
                      <button key={iso} disabled={isFuture}
                        onClick={() => runGuarded(() => { jumpToDay(iso); setPeriodOpen(false); })}
                        title={isFuture ? "Tanggal belum tiba" : fmtLongDate(iso)}
                        style={{
                          aspectRatio: "1", borderRadius: 8, border: isToday && !isSelected ? `1.5px solid ${t.teal}` : "none",
                          background: isSelected ? t.teal : "transparent", color: isFuture ? t.line : isSelected ? "#fff" : t.hi,
                          fontSize: 12, fontWeight: isSelected || isToday ? 700 : 500, cursor: isFuture ? "default" : "pointer",
                          fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                        {Number(iso.slice(8, 10))}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ──
          UPDATE (permintaan user - "mapping admin mc itu seharusnya didalam
          dse prod, bukan menjadi menu terpisah, namanya user management" ->
          "harusnya nama sub menunya mapping dan user management"): tab
          ke-3 "Mapping & User Management" ditambahkan di sini, isSPM saja
          (sama spt pembatasan akses "Mapping Admin MC" sblmnya) - fitur
          kelola email Admin MC (AdminMcMapping.jsx) skrg dirender di dalam
          halaman DSE Prod. & AR ini, bukan menu/DashCard terpisah lagi
          (lihat page.jsx). */}
      <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 11, background: t.sub, marginBottom: 20 }}>
        {[
          { k: "input", label: "Penjualan DSE", icon: ListChecks }, // UPDATE (permintaan user - "ubah menu Input Harian menjadi Penjualan DSE"): label tab, key "input" tetap sama (ga perlu ubah logic lain)
          { k: "riwayat", label: "Riwayat & Laporan", icon: History },
          ...(isSPM ? [{ k: "user-mgmt", label: "Mapping & User Management", icon: UserRoundCog }] : []),
          ...(isSPM ? [{ k: "dse-database", label: "Database DSE", icon: Database }] : []),
        ].map(({ k, label, icon: Icon }) => (
          <button key={k} onClick={() => runGuarded(() => setTab(k))}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", outline: "none", background: tab === k ? t.card : "transparent", color: tab === k ? t.hi : t.mid, fontSize: 12.5, fontWeight: tab === k ? 700 : 600, cursor: "pointer", fontFamily: FONT, WebkitTapHighlightColor: "transparent", boxShadow: tab === k ? t.shadowSm : "none", transition: "background 0.15s, box-shadow 0.15s", whiteSpace: "nowrap" }}>
            <Icon size={13.5} color={tab === k ? t.teal : t.lo} /> {label}
          </button>
        ))}
      </div>

      {tab === "dse-database" ? (
        <SDP_DseDatabase theme={theme} profile={profile} />
      ) : tab === "user-mgmt" ? (
        <AdminMcMapping theme={theme}
          asOfDate={(isRangeMode || entryDate !== todayISO()) ? `${mappingAsOfDate}T23:59:59` : null}
          asOfLabel={isRangeMode ? `akhir periode ${fmtLongDate(rangeEnd)}` : fmtLongDate(entryDate)} />
      ) : tab === "input" ? (
        <>
          <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>Brand</div>
              {/* UPDATE (permintaan user - "tambahkan satu opsi lagi untuk
                  both brand", warna opsi "Both" pakai teal spt aksen lain di
                  halaman ini, bukan warna baru): opsi ke-3 "Both" ditambahin
                  di samping IM3/3ID. Kalau "Both" dipilih, tiap baris DSE di
                  tabel Input Harian dirender 2x (1 baris per brand) jadi bisa
                  isi IM3 & 3ID sekaligus tanpa gonta-ganti toggle. Lihat
                  "activeBrands" di bawah. */}
              <div style={{ display: "flex", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, padding: 3, height: 38, boxSizing: "border-box" }}>
                {BRAND_TOGGLE_OPTIONS.map((b) => {
                  const active = brand === b;
                  // Warna identitas brand: IM3 = kuning/gold, 3ID = magenta, Both = teal (aksen utama halaman)
                  const brandColor = b === "IM3" ? "#F5B700" : b === "3ID" ? "#C2187C" : t.teal;
                  const activeTextColor = b === "IM3" ? "#3D2E00" : "#fff"; // teks gelap di atas kuning supaya tetap kontras
                  return (
                    <button key={b} onClick={() => runGuarded(() => setBrand(b))}
                      style={{ display: "flex", alignItems: "center", gap: 6, height: "100%", padding: "0 16px", borderRadius: 7, border: "none", background: active ? brandColor : "transparent", color: active ? activeTextColor : t.mid, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: FONT, transition: "background 0.15s" }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: active ? activeTextColor : brandColor, flexShrink: 0 }} />
                      {b === "BOTH" ? "IOH" : b}
                    </button>
                  );
                })}
              </div>
            </div>
            {isSPM && (
              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>Partner</div>
                <div style={{ position: "relative" }}>
                  <select value={partnerFilter} onChange={(e) => { const v = e.target.value; runGuarded(() => { setPartnerFilter(v); setRegionFilter(""); setBranchFilter(""); setMcFilter(""); }); }} style={{ ...inputStyle, width: 180, appearance: "none", cursor: "pointer" }}>
                    <option value="">— semua Partner —</option>
                    {partnerOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: 10, top: 12, color: t.lo, pointerEvents: "none" }} />
                </div>
              </div>
            )}
            {isSPM && (
              <div style={{ minWidth: 170 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>Region</div>
                <div style={{ position: "relative" }}>
                  <select value={regionFilter} onChange={(e) => { const v = e.target.value; runGuarded(() => { setRegionFilter(v); setBranchFilter(""); setMcFilter(""); }); }} style={{ ...inputStyle, width: 170, appearance: "none", cursor: "pointer" }}>
                    <option value="">ALL Sumatera</option>
                    {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: 10, top: 12, color: t.lo, pointerEvents: "none" }} />
                </div>
              </div>
            )}
            {isSPM && (
              <div style={{ minWidth: 190 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>Branch</div>
                <div style={{ position: "relative" }}>
                  <select value={branchFilter} onChange={(e) => { const v = e.target.value; runGuarded(() => { setBranchFilter(v); setMcFilter(""); }); }} style={{ ...inputStyle, width: 190, appearance: "none", cursor: "pointer" }}>
                    <option value="">— semua Branch —</option>
                    {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: 10, top: 12, color: t.lo, pointerEvents: "none" }} />
                </div>
              </div>
            )}
            {isSPM && (
              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>MC</div>
                <div style={{ position: "relative" }}>
                  <select value={mcFilter} onChange={(e) => { const v = e.target.value; runGuarded(() => setMcFilter(v)); }} style={{ ...inputStyle, width: 220, appearance: "none", cursor: "pointer" }}>
                    <option value="">— semua MC —</option>
                    {mcOptions.map((mc) => <option key={mc} value={mc}>{mc}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: 10, top: 12, color: t.lo, pointerEvents: "none" }} />
                </div>
              </div>
            )}
            <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>Cari DSE</div>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
                <input value={dseSearch} onChange={(e) => setDseSearch(e.target.value)} placeholder="Kode DSE / Nama…" style={{ ...inputStyle, paddingLeft: 34 }} />
              </div>
            </div>
            <button onClick={() => runGuarded(loadDseAndEntries)} title="Refresh" style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RefreshCw size={14} className={loadingDse ? "spin" : ""} />
            </button>
            {!isRangeMode && dirtyCount > 0 && (
              <button onClick={handleSaveAllDirty} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Save size={14} /> Simpan Semua ({dirtyCount})
              </button>
            )}
          </div>
          </div>

          {/* ── Banner periode besar, persis di atas tabel — permintaan user:
              "tanggal ini seperti tidak terlihat, buat dia tepat juga diatas
              tabel agak besar agar tidak keliru bahwasanya ini penjualan
              periode yang dipilih". Selalu tampil (bukan cuma pas ringkasan
              muncul) supaya jelas data di bawahnya itu utk tanggal/periode
              apa. ── */}
          {!showAllRegions && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", borderRadius: 10, marginBottom: 14, background: t.tealBg }}>
              <CalendarCheck2 size={15} color={t.teal} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: t.teal, letterSpacing: -0.1 }}>
                {isRangeMode
                  ? `Akumulasi penjualan ${fmtLongDate(rangeStart)} — ${fmtLongDate(rangeEnd)}`
                  : `Penjualan ${fmtLongDate(entryDate)}${entryDate === todayISO() ? " · Hari ini" : ""}`}
                <span style={{ opacity: 0.65 }}> · Brand {brand}</span>
              </div>
              {isRangeMode && (
                <div style={{ fontSize: 11, fontWeight: 600, color: t.mid, marginLeft: "auto" }}>Mode baca saja — gunakan Tanggal untuk input</div>
              )}
            </div>
          )}

          {/* ── Ringkasan per MC yang sedang dipilih — akumulasi per Branch &
              per Partner menyusul, utk sekarang baru level MC. Ikut update
              real-time pas admin ngetik (belum tentu sudah ter-Simpan). ── */}
          {!showAllRegions && !loadingDse && dseList.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 10 }}>
                Ringkasan {mcFilter ? `MC ${mcFilter}` : partnerFilter ? `Partner ${partnerFilter}` : branchFilter ? `Branch ${branchFilter}` : regionFilter ? `Region ${regionFilter}` : "Semua Partner (ALL Sumatera)"} · {brand} · {entryDate}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <StatTile t={t} icon={<Users size={13} />} label="Total Alokasi DSE" value={fmtID(mcSummary.totalAlokasi)} />
                <StatTile t={t} icon={<UserCheck size={13} color={t.teal} />} label="Total DSE Active" value={fmtID(mcSummary.totalActive)} />
                <StatTile t={t} icon={<UserX size={13} color={t.red} />} label="Total DSE Vacant" value={fmtID(mcSummary.totalVacant)} sub={mcSummary.totalInterview ? `${fmtID(mcSummary.totalInterview)} Interview` : undefined} />
                <StatTile t={t} icon={<TrendingUp size={13} />} label="Penjualan SP" value={`${fmtID(mcSummary.qtySp)} pcs`} sub={`Rp ${fmtID(mcSummary.nilaiSp)}`} />
                <StatTile t={t} icon={<Ticket size={13} />} label="Penjualan Voucher" value={`${fmtID(mcSummary.qtyVoucher)} pcs`} sub={`Rp ${fmtID(mcSummary.nilaiVoucher)}`} />
                <StatTile t={t} icon={<Wallet size={13} />} label="Saldo MOBO" value={`Rp ${fmtID(mcSummary.nilaiSaldo)}`} />
                <StatTile t={t} icon={<CircleDollarSign size={13} color={t.teal} />} label="Total Penjualan" value={`Rp ${fmtID(mcSummary.totalPenjualan)}`} sub="SP + Voucher + Saldo" />
                <StatTile t={t} icon={<AlertTriangle size={13} color={t.amber} />} label="Total Tunggakan" value={`Rp ${fmtID(mcSummary.tunggakan)}`} sub="AR / Piutang" />
              </div>
            </div>
          )}

          {showAllRegions ? (
            loadingRegionSummary ? (
              <div style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={18} className="spin" /></div>
            ) : regionSummary.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: t.mid, borderRadius: 12, border: `1px dashed ${t.line}` }}>Belum ada data Region. Tambahkan dulu di menu Database DSE.</div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 10 }}>
                  Ringkasan per Region — ALL Sumatera · {brand} · {entryDate}
                </div>
                <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.9fr 1fr 1fr 1fr 1fr", gap: 0, padding: "11px 18px", background: t.sub, fontSize: 10.5, fontWeight: 600, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3 }}>
                    <div>Region</div>
                    <div style={{ textAlign: "right" }}>DSE Active</div>
                    <div style={{ textAlign: "right" }}>Qty SP</div>
                    <div style={{ textAlign: "right" }}>Nilai SP</div>
                    <div style={{ textAlign: "right" }}>Nilai Voucher</div>
                    <div style={{ textAlign: "right" }}>Saldo MOBO</div>
                    <div style={{ textAlign: "right" }}>Tunggakan</div>
                  </div>
                  {regionSummary.map((r, i) => (
                    <div key={r.region} onClick={() => setRegionFilter(r.region)} title={`Lihat detail Region ${r.region}`}
                      style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.9fr 1fr 1fr 1fr 1fr", gap: 0, padding: "14px 18px", borderTop: i === 0 ? "none" : `1px solid ${t.line}`, cursor: "pointer", fontSize: 13, fontVariantNumeric: "tabular-nums", transition: "background 0.12s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = t.sub; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                      <div style={{ fontWeight: 700, color: t.hi, display: "flex", alignItems: "center", gap: 7 }}>
                        {r.region}
                        <ChevronRight size={13} color={t.lo} style={{ flexShrink: 0 }} />
                      </div>
                      <div style={{ textAlign: "right", color: t.mid }}>{fmtID(r.totalActive)} / {fmtID(r.totalAlokasi)}</div>
                      <div style={{ textAlign: "right", color: t.mid }}>{fmtID(r.qtySp)} pcs</div>
                      <div style={{ textAlign: "right", fontWeight: 700 }}>Rp {fmtID(r.nilaiSp)}</div>
                      <div style={{ textAlign: "right", fontWeight: 700 }}>Rp {fmtID(r.nilaiVoucher)}</div>
                      <div style={{ textAlign: "right", fontWeight: 700 }}>Rp {fmtID(r.nilaiSaldo)}</div>
                      <div style={{ textAlign: "right", fontWeight: 700, color: r.tunggakan > 0 ? t.amber : t.mid }}>Rp {fmtID(r.tunggakan)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : loadingDse ? (
            <div style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={18} className="spin" /></div>
          ) : filteredDseList.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: t.mid, borderRadius: 12, border: `1px dashed ${t.line}` }}>Belum ada Kode DSE terdaftar untuk MC ini. Tambahkan dulu di menu Database DSE.</div>
          ) : isCardView ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {/* UPDATE (permintaan user - "tambahkan satu opsi lagi untuk
                  both brand", lalu dikoreksi - "jika dipilih both brand maka
                  saat pengisian itu menampilkan nama dse baru [lalu] penjualan
                  im3 dan 3id, beri warna dengan rapi"): 1 DSE = 1
                  kartu/baris, SELALU (identitas ga diduplikat). Kalau
                  brand === "BOTH", activeBrands = ["IM3","3ID"] diteruskan
                  sbg prop "brands" (array) ke DseInputRow, yg lalu merender
                  2 section penjualan bertint warna brand di DALAM kartu yg
                  sama (lihat SalesBlock/MoreBlock di DseInputRow). */}
              {filteredDseList.map((dse) => (
                <DseInputRow key={dse.dse_code} t={t} isCardView dse={dse} brands={activeBrands}
                  entries={entries[dse.dse_code] || {}}
                  onEntryChange={handleEntryChange}
                  onIdentityChange={handleIdentityChange}
                  identityEdit={identity[dse.dse_code]}
                  onSave={handleSaveDse}
                  saving={savingCode === dse.dse_code}
                  dirty={!!dirty[dse.dse_code]}
                  prevOutstandings={Object.fromEntries(activeBrands.map((b) => [b, prevAr[`${dse.dse_code}|${b}`]]))}
                  onShowHistory={setHistoryFor}
                  readOnly={isRangeMode}
                  audits={Object.fromEntries(activeBrands.map((b) => {
                    const be = entries[dse.dse_code]?.[b];
                    return [b, be?.updated_at || be?.uploaded_by ? { updated_at: be.updated_at, uploaded_at: be.uploaded_at, by: profilesMap[be.uploaded_by] } : null];
                  }))} />
              ))}
            </div>
          ) : (
            <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: t.sub }}>
                      {/* UPDATE (permintaan user - "tambahkan kolom brand
                          juga di atas, lalu kolomnya itu merge [rowSpan] kalau
                          memang pairingan, yg di-merge cuma Nama DSE/Status/
                          Join Date, penjualan tetap dipisah per brand, khusus
                          tampilan IOH"): kolom "Brand" cuma muncul di mode
                          IOH/Both (activeBrands.length > 1); mode 1-brand
                          header-nya tetap persis spt sebelumnya. */}
                      {(activeBrands.length > 1 ? ["ID DSE", "Brand", "Nama DSE", "Status", "Join Date", "Qty SP (Pcs)", "Total SP (Rp)", "Qty Voucher (Pcs)", "Total Voucher (Rp)", "Total Saldo MOBO (Rp)", "Total Penjualan (Rp)", "AR / Piutang (Utang · Bayar · Sisa)", "Catatan", ""] : ["ID DSE", "Nama DSE", "Status", "Join Date", "Qty SP (Pcs)", "Total SP (Rp)", "Qty Voucher (Pcs)", "Total Voucher (Rp)", "Total Saldo MOBO (Rp)", "Total Penjualan (Rp)", "AR / Piutang (Utang · Bayar · Sisa)", "Catatan", ""]).map((h, i) => {
                        const groupCols = activeBrands.length > 1 ? [5, 7, 9, 10, 11] : [4, 6, 8, 9, 10];
                        return (
                          <th key={i} style={{ textAlign: "left", padding: "10px 12px", color: t.mid, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}`, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.2, borderLeft: groupCols.includes(i) ? `2px solid ${t.line}` : "none" }}>{h}</th>
                        );
                      })}
                    </tr>
                    {/* UPDATE (permintaan user - "tambahkan pemfilteran untuk
                        setiap kolom tanpa terkecuali"): baris filter kedua di
                        bawah label kolom. 1 filter per kolom, ga ada yg
                        dilewatin (ID/Nama/Catatan = teks, Status = dropdown,
                        Join Date = rentang dari-sampai, kolom angka =
                        rentang min-max, Brand = dropdown khusus mode IOH,
                        kolom save (kolom plg kanan) dikasih tombol "Reset"
                        buat ngosongin semua filter kolom sekaligus). */}
                    <tr style={{ background: t.card }}>
                      {(activeBrands.length > 1
                        ? ["id", "brand", "nama", "status", "join", "qtySp", "totalSp", "qtyVoucher", "totalVoucher", "saldo", "totalPenjualan", "ar", "catatan", "reset"]
                        : ["id", "nama", "status", "join", "qtySp", "totalSp", "qtyVoucher", "totalVoucher", "saldo", "totalPenjualan", "ar", "catatan", "reset"]
                      ).map((key, i) => {
                        const groupCols = activeBrands.length > 1 ? [5, 7, 9, 10, 11] : [4, 6, 8, 9, 10];
                        const filterInputStyle = { width: "100%", height: 26, padding: "0 6px", borderRadius: 6, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 11, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
                        const numPairStyle = { display: "flex", alignItems: "center", gap: 3 };
                        let content = null;
                        if (key === "id") {
                          content = <input value={colFilters.id} onChange={(e) => setColFilter("id", e.target.value)} placeholder="cari…" style={filterInputStyle} />;
                        } else if (key === "brand") {
                          content = (
                            <select value={colFilters.brand} onChange={(e) => setColFilter("brand", e.target.value)} style={{ ...filterInputStyle, cursor: "pointer" }}>
                              <option value="">Semua</option>
                              {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                            </select>
                          );
                        } else if (key === "nama") {
                          content = <input value={colFilters.nama} onChange={(e) => setColFilter("nama", e.target.value)} placeholder="cari…" style={filterInputStyle} />;
                        } else if (key === "status") {
                          content = (
                            <select value={colFilters.status} onChange={(e) => setColFilter("status", e.target.value)} style={{ ...filterInputStyle, cursor: "pointer" }}>
                              <option value="">Semua</option>
                              {STATUS_OPTIONS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                            </select>
                          );
                        } else if (key === "join") {
                          content = (
                            <div style={numPairStyle}>
                              <input type="date" value={colFilters.joinFrom} onChange={(e) => setColFilter("joinFrom", e.target.value)} style={filterInputStyle} />
                              <input type="date" value={colFilters.joinTo} onChange={(e) => setColFilter("joinTo", e.target.value)} style={filterInputStyle} />
                            </div>
                          );
                        } else if (key === "catatan") {
                          content = <input value={colFilters.catatan} onChange={(e) => setColFilter("catatan", e.target.value)} placeholder="cari…" style={filterInputStyle} />;
                        } else if (key === "reset") {
                          content = anyColFilterActive ? (
                            <button onClick={resetColFilters} title="Hapus semua filter kolom"
                              style={{ display: "flex", alignItems: "center", gap: 4, height: 26, padding: "0 10px", borderRadius: 6, border: "none", background: t.redBg, color: t.red, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }}>
                              <X size={11} /> Reset
                            </button>
                          ) : null;
                        } else {
                          // Kolom angka: qtySp, totalSp, qtyVoucher, totalVoucher, saldo, totalPenjualan, ar
                          const minK = `${key}Min`, maxK = `${key}Max`;
                          content = (
                            <div style={numPairStyle}>
                              <input type="number" inputMode="decimal" value={colFilters[minK]} onChange={(e) => setColFilter(minK, e.target.value)} placeholder="min" style={filterInputStyle} />
                              <input type="number" inputMode="decimal" value={colFilters[maxK]} onChange={(e) => setColFilter(maxK, e.target.value)} placeholder="max" style={filterInputStyle} />
                            </div>
                          );
                        }
                        return (
                          <th key={i} style={{ padding: "6px 12px 10px", borderBottom: `1px solid ${t.line}`, borderLeft: groupCols.includes(i) ? `2px solid ${t.line}` : "none", minWidth: key === "join" || key.endsWith("totalVoucher") || key === "qtyVoucher" || key === "totalPenjualan" || key === "ar" || key === "saldo" || key === "qtySp" || key === "totalSp" ? 140 : undefined }}>
                            {content}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDseList.map((dse) => (
                      <DseInputRow key={dse.dse_code} t={t} isCardView={false} dse={dse} brands={rowBrands} showBrandCol={activeBrands.length > 1}
                        entries={entries[dse.dse_code] || {}}
                        onEntryChange={handleEntryChange}
                        onIdentityChange={handleIdentityChange}
                        identityEdit={identity[dse.dse_code]}
                        onSave={handleSaveDse}
                        saving={savingCode === dse.dse_code}
                        dirty={!!dirty[dse.dse_code]}
                        prevOutstandings={Object.fromEntries(activeBrands.map((b) => [b, prevAr[`${dse.dse_code}|${b}`]]))}
                        onShowHistory={setHistoryFor}
                        readOnly={isRangeMode}
                        audits={Object.fromEntries(activeBrands.map((b) => {
                          const be = entries[dse.dse_code]?.[b];
                          return [b, be?.updated_at || be?.uploaded_by ? { updated_at: be.updated_at, uploaded_at: be.uploaded_at, by: profilesMap[be.uploaded_by] } : null];
                        }))} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Import massal Excel (opsional, sekunder) ──
              UPDATE (permintaan user - "import massal juga dihilangkan saja"
              -> dikoreksi "sembunyikan fitur ini"): fitur ini DISEMBUNYIKAN
              dari UI (bukan dihapus kodenya) lewat SHOW_IMPORT_EXCEL = false
              di bawah, supaya gampang dinyalakan lagi nanti kalau perlu -
              semua state/handler/parser-nya tetap ada, cuma tidak dirender. */}
          {SHOW_IMPORT_EXCEL && (
          <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
            <button onClick={() => setShowImport((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: 16, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FONT }}>
              <FileSpreadsheet size={15} />
              <span style={{ fontSize: 13, fontWeight: 700, flex: 1, textAlign: "left" }}>Import Massal dari Excel (opsional — untuk isi data lama sekaligus)</span>
              {showImport ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {showImport && (
              <div style={{ padding: "0 16px 16px" }}>
                <div style={{ fontSize: 12, color: t.mid, marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ flex: 1, minWidth: 0, lineHeight: 1.55 }}>
                    Kolom wajib: <b style={{ color: t.hi }}>Tanggal</b>, <b style={{ color: t.hi }}>Kode DSE</b>. Kolom <b style={{ color: t.hi }}>Brand</b> opsional (IM3/3ID, default IM3 kalau kosong).
                    Baris dengan tanggal+kode+brand yang sama akan menimpa data yang sudah ada (bukan menumpuk).
                  </span>
                </div>
                {isMPX && myMcNames.length > 1 && (
                  <div style={{ marginBottom: 12, maxWidth: 260 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", marginBottom: 6 }}>Import untuk MC</div>
                    <select value={mpxMcFilter || myMcNames[0]} onChange={(e) => setMpxMcFilter(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                      {myMcNames.map((mc) => <option key={mc} value={mc}>{mc}</option>)}
                    </select>
                  </div>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", borderRadius: 9, border: `1px dashed ${t.tealBd}`, background: t.tealBg, color: t.teal, fontSize: 13, fontWeight: 700, cursor: "pointer", width: "fit-content" }}>
                  <Upload size={14} /> Pilih File…
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => onPickFile(e.target.files)} />
                </label>
                {staged && (
                  <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, border: `1px solid ${staged.error ? t.redBg : t.line}`, background: staged.error ? t.redBg : t.sub }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <FileSpreadsheet size={15} color={staged.error ? t.red : t.teal} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{staged.fileName}</div>
                        {staged.error ? (
                          <div style={{ fontSize: 12, color: t.red, marginTop: 2 }}>{staged.error}</div>
                        ) : (
                          <div style={{ fontSize: 12, color: t.mid, marginTop: 2 }}>
                            {staged.totalRows} baris valid
                            {staged.errors?.length > 0 && <span style={{ color: t.amber, fontWeight: 700 }}> — {staged.errors.length} baris dilewati</span>}
                          </div>
                        )}
                      </div>
                      <button onClick={() => setStaged(null)} style={{ background: "none", border: "none", color: t.lo, cursor: "pointer", flexShrink: 0 }}><X size={15} /></button>
                    </div>
                  </div>
                )}
                {staged && !staged.error && staged.rows?.length > 0 && (
                  <button onClick={handleUpload} disabled={uploading}
                    style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: t.teal, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: uploading ? "default" : "pointer", opacity: uploading ? 0.6 : 1 }}>
                    {uploading ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
                    {uploading ? "Menyimpan…" : `Simpan ${staged.rows.length} Baris`}
                  </button>
                )}
              </div>
            )}
          </div>
          )}
        </>
      ) : (
        <>
          {/* ── Ringkasan ── */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <StatTile t={t} icon={<TrendingUp size={13} />} label="SP" value={fmtID(totals.qty_sp)} sub={`Rp ${fmtID(totals.nilai_sp)}`} />
            <StatTile t={t} icon={<Wallet size={13} />} label="Saldo" value={fmtID(totals.qty_saldo)} sub={`Rp ${fmtID(totals.nilai_saldo)}`} />
            <StatTile t={t} icon={<TrendingUp size={13} />} label="Voucher" value={fmtID(totals.qty_voucher)} sub={`Rp ${fmtID(totals.nilai_voucher)}`} />
            <StatTile t={t} icon={<AlertTriangle size={13} />} label="AR / Piutang" value={`Rp ${fmtID(totals.ar_piutang)}`} sub="Total outstanding" />
          </div>

          <div style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: isCardView ? "column" : "row", alignItems: isCardView ? "stretch" : "center", gap: 10, padding: 16, borderBottom: `1px solid ${t.line}` }}>
              <div style={{ position: "relative", flex: isCardView ? "none" : 1, minWidth: isCardView ? 0 : 180 }}>
                <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
                <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Cari Kode DSE / MC / Nama…" style={{ ...inputStyle, paddingLeft: 34 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, width: isCardView ? "100%" : "auto" }}>
                <Calendar size={14} color={t.lo} style={{ flexShrink: 0 }} />
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...inputStyle, width: isCardView ? "100%" : 140, minWidth: 0 }} />
                <span style={{ color: t.mid, fontSize: 12, flexShrink: 0 }}>—</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...inputStyle, width: isCardView ? "100%" : 140, minWidth: 0 }} />
              </div>
              <div style={{ display: "flex", gap: 10, width: isCardView ? "100%" : "auto" }}>
                <button onClick={() => fetchRiwayat(page, search)} title="Refresh" style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <RefreshCw size={14} className={fetching ? "spin" : ""} />
                </button>
                <button onClick={handleExport} disabled={exportLoading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${t.tealBd}`, background: t.tealBg, color: t.teal, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: exportLoading ? 0.6 : 1, flexShrink: 0, flex: isCardView ? 1 : "none" }}>
                  {exportLoading ? <Loader2 size={14} className="spin" /> : <FileDown size={14} />}
                  Export
                </button>
              </div>
            </div>

            <div style={{ padding: "6px 16px", fontSize: 12, color: t.mid, borderBottom: `1px solid ${t.line}` }}>
              {total.toLocaleString("id-ID")} baris
            </div>

            {isCardView ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
                {fetching ? (
                  <div style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={16} className="spin" /></div>
                ) : rows.length === 0 ? (
                  <div style={{ padding: 28, textAlign: "center", color: t.mid }}>Belum ada data.</div>
                ) : rows.map((r) => (
                  <div key={r.id} style={{ borderRadius: 12, border: `1px solid ${t.line}`, background: t.sub, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
                          {r.dse_code}
                          <span style={{ fontSize: 10, fontWeight: 700, color: r.brand === "3ID" ? "#B8860B" : t.red, background: r.brand === "3ID" ? "rgba(253,184,19,0.15)" : "rgba(237,28,36,0.1)", borderRadius: 999, padding: "1px 7px" }}>{r.brand || "IM3"}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: t.mid }}>{r.mc || "-"} {r.branch ? `· ${r.branch}` : ""}</div>
                      </div>
                      <div style={{ fontSize: 11.5, color: t.mid, whiteSpace: "nowrap" }}>{r.tanggal}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 12 }}>
                      <div><div style={{ color: t.lo, fontSize: 10.5 }}>SP</div><div style={{ fontWeight: 700 }}>{fmtID(r.qty_sp)}</div><div style={{ color: t.mid }}>Rp {fmtID(r.nilai_sp)}</div></div>
                      <div><div style={{ color: t.lo, fontSize: 10.5 }}>SALDO</div><div style={{ fontWeight: 700 }}>{fmtID(r.qty_saldo)}</div><div style={{ color: t.mid }}>Rp {fmtID(r.nilai_saldo)}</div></div>
                      <div><div style={{ color: t.lo, fontSize: 10.5 }}>VOUCHER</div><div style={{ fontWeight: 700 }}>{fmtID(r.qty_voucher)}</div><div style={{ color: t.mid }}>Rp {fmtID(r.nilai_voucher)}</div></div>
                    </div>
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.line}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 11.5, color: t.mid }}>Bayar AR</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.teal }}>Rp {fmtID(r.ar_bayar || 0)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11.5, color: t.mid }}>Sisa AR / Piutang</span>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: fRaw(r.ar_piutang) > 0 ? t.amber : t.hi }}>Rp {fmtID(r.ar_piutang)}</span>
                    </div>
                    {r.catatan && <div style={{ marginTop: 6, fontSize: 11.5, color: t.mid, fontStyle: "italic" }}>{r.catatan}</div>}
                    {r.updated_at && <div style={{ marginTop: 4, fontSize: 10.5, color: t.lo, display: "flex", alignItems: "center", gap: 4 }}><Clock size={9} />Diperbarui {fmtTime(r.updated_at)}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: t.sub }}>
                      {["Tanggal", "Kode DSE", "Brand", "MC", "Branch", "Qty SP", "Nilai SP", "Qty Saldo", "Nilai Saldo", "Qty Voucher", "Nilai Voucher", "AR/Piutang", "Catatan"].map((h, i) => (
                        <th key={i} style={{ textAlign: i >= 5 ? "right" : "left", padding: "9px 12px", color: t.mid, fontWeight: 700, whiteSpace: "nowrap", borderBottom: `1px solid ${t.line}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fetching ? (
                      <tr><td colSpan={13} style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={16} className="spin" /></td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={13} style={{ padding: 28, textAlign: "center", color: t.mid }}>Belum ada data.</td></tr>
                    ) : rows.map((r) => (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${t.line}` }}>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.tanggal}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", fontWeight: 700 }}>{r.dse_code}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.brand || "IM3"}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.mc || "-"}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{r.branch || "-"}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtID(r.qty_sp)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtID(r.nilai_sp)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtID(r.qty_saldo)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtID(r.nilai_saldo)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtID(r.qty_voucher)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{fmtID(r.nilai_voucher)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: fRaw(r.ar_piutang) > 0 ? t.amber : t.hi }}>{fmtID(r.ar_piutang)}</td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: t.mid }}>{r.catatan || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: 14, borderTop: `1px solid ${t.line}` }}>
              <button onClick={() => fetchRiwayat(page - 1, search)} disabled={page <= 1} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.5 : 1 }}>Sebelumnya</button>
              <span style={{ fontSize: 12.5, color: t.mid }}>Halaman {page} / {totalPages}</span>
              <button onClick={() => fetchRiwayat(page + 1, search)} disabled={page >= totalPages} style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? 0.5 : 1 }}>Berikutnya</button>
            </div>
          </div>
        </>
      )}

      <style>{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } } .periodFade { animation: periodFade 0.22s cubic-bezier(0.16, 1, 0.3, 1); } @keyframes periodFade { from { opacity: 0; transform: translateY(-3px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
    </div>
  );
}
