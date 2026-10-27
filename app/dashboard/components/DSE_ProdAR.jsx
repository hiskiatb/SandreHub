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
  Search, RefreshCw, ChevronDown, ChevronUp, Wallet, TrendingUp, Calendar, Info,
  Pencil, Save, ListChecks, History, UserRoundCog, Database,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;
const PAGE_SIZE = 50;
const TABLE_BP = 860; // di bawah ini → tampilan card (mobile, fold, layar sempit)
const BRANDS = ["IM3", "3ID"];

const fmtID = (n) => Math.round(Number(n) || 0).toLocaleString("id-ID");
const fRaw = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const todayISO = () => new Date().toISOString().slice(0, 10);
const emptyEntry = () => ({ qty_sp: 0, nilai_sp: 0, qty_saldo: 0, nilai_saldo: 0, qty_voucher: 0, nilai_voucher: 0, ar_piutang: 0, catatan: "" });

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

function StatTile({ t, icon, label, value, sub }) {
  return (
    <div style={{ flex: "1 1 160px", minWidth: 150, borderRadius: 12, border: `1px solid ${t.line}`, background: t.card, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: t.mid, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 8 }}>
        {icon}{label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 800, color: t.hi, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: t.lo, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Satu panel input brand (IM3 / 3ID) di dalam kartu DSE ───────────────────
function BrandPanel({ t, brand, value, onChange, isCardView }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const numStyle = { width: "100%", height: 32, padding: "0 8px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
  const brandColor = brand === "IM3" ? "#ED1C24" : "#FDB813";
  return (
    <div style={{ flex: "1 1 240px", minWidth: isCardView ? "100%" : 240, borderRadius: 10, border: `1px solid ${t.line}`, background: t.sub, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: brandColor, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: t.hi }}>{brand}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 7 }}>
        <div>
          <div style={{ fontSize: 10, color: t.lo, marginBottom: 3 }}>Qty SP</div>
          <input type="number" value={value.qty_sp} onChange={(e) => set("qty_sp", e.target.value)} style={numStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: t.lo, marginBottom: 3 }}>Nilai SP</div>
          <input type="number" value={value.nilai_sp} onChange={(e) => set("nilai_sp", e.target.value)} style={numStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: t.lo, marginBottom: 3 }}>Qty Saldo</div>
          <input type="number" value={value.qty_saldo} onChange={(e) => set("qty_saldo", e.target.value)} style={numStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: t.lo, marginBottom: 3 }}>Nilai Saldo</div>
          <input type="number" value={value.nilai_saldo} onChange={(e) => set("nilai_saldo", e.target.value)} style={numStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: t.lo, marginBottom: 3 }}>Qty Voucher</div>
          <input type="number" value={value.qty_voucher} onChange={(e) => set("qty_voucher", e.target.value)} style={numStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: t.lo, marginBottom: 3 }}>Nilai Voucher</div>
          <input type="number" value={value.nilai_voucher} onChange={(e) => set("nilai_voucher", e.target.value)} style={numStyle} />
        </div>
      </div>
      <div style={{ marginBottom: 7 }}>
        <div style={{ fontSize: 10, color: t.lo, marginBottom: 3 }}>AR / Piutang</div>
        <input type="number" value={value.ar_piutang} onChange={(e) => set("ar_piutang", e.target.value)} style={numStyle} />
      </div>
      <div>
        <div style={{ fontSize: 10, color: t.lo, marginBottom: 3 }}>Catatan</div>
        <input type="text" value={value.catatan || ""} onChange={(e) => set("catatan", e.target.value)} placeholder="opsional" style={numStyle} />
      </div>
    </div>
  );
}

// ── Satu kartu per Kode DSE: identitas (editable) + 2 panel brand ──────────
function DseEntryCard({ t, isCardView, dse, entries, onEntryChange, onIdentityChange, onSave, saving, dirty }) {
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${dirty ? t.tealBd : t.line}`, background: t.card, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: t.hi }}>{dse.dse_code}</span>
            {dse.is_revoked && <span style={{ fontSize: 10, fontWeight: 700, color: t.red, background: t.redBg, borderRadius: 999, padding: "1px 7px" }}>Revoked</span>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px", minWidth: 140 }}>
              <div style={{ fontSize: 10, color: t.lo, marginBottom: 3 }}>Nama DSE</div>
              <input type="text" value={dse._ds_name ?? dse.ds_name ?? ""} onChange={(e) => onIdentityChange(dse.dse_code, "ds_name", e.target.value)}
                style={{ width: "100%", height: 30, padding: "0 8px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: "1 1 120px", minWidth: 110 }}>
              <div style={{ fontSize: 10, color: t.lo, marginBottom: 3 }}>MC</div>
              <input type="text" value={dse._mc ?? dse.mc ?? ""} onChange={(e) => onIdentityChange(dse.dse_code, "mc", e.target.value)}
                style={{ width: "100%", height: 30, padding: "0 8px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
        </div>
        <button onClick={() => onSave(dse.dse_code)} disabled={saving || !dirty}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, border: "none", background: dirty ? t.teal : t.inputBg, color: dirty ? "#fff" : t.lo, fontSize: 12, fontWeight: 700, cursor: dirty && !saving ? "pointer" : "default", opacity: saving ? 0.6 : 1, flexShrink: 0 }}>
          {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
          Simpan
        </button>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {BRANDS.map((b) => (
          <BrandPanel key={b} t={t} brand={b} isCardView={isCardView} value={entries[b] || emptyEntry()} onChange={(v) => onEntryChange(dse.dse_code, b, v)} />
        ))}
      </div>
    </div>
  );
}

export default function DSE_ProdAR({ theme, profile }) {
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
  const [entryDate, setEntryDate] = useState(todayISO());
  const [mcFilter, setMcFilter] = useState(""); // SPM saja: pilih MC yang mau diisi
  const [mcOptions, setMcOptions] = useState([]);
  const [dseList, setDseList] = useState([]);
  const [dseSearch, setDseSearch] = useState("");
  const [loadingDse, setLoadingDse] = useState(false);
  const [entries, setEntries] = useState({});     // { [dse_code]: { IM3: {...}, "3ID": {...} } }
  const [identity, setIdentity] = useState({});   // { [dse_code]: { ds_name, mc } }
  const [dirty, setDirty] = useState({});         // { [dse_code]: true }
  const [savingCode, setSavingCode] = useState(null);
  const [showImport, setShowImport] = useState(false);

  // SPM perlu pilih MC dulu (tidak otomatis dibatasi RLS); Admin MC langsung
  // terbatas lewat RLS jadi tidak perlu pilih.
  useEffect(() => {
    if (!isSPM) return;
    (async () => {
      const { data } = await supabase.from("mf_dse_database").select("mc").eq("is_revoked", false).not("mc", "is", null);
      const uniq = Array.from(new Set((data || []).map((r) => r.mc).filter(Boolean))).sort();
      setMcOptions(uniq);
    })();
  }, [isSPM]);

  const loadDseAndEntries = useCallback(async () => {
    setLoadingDse(true);
    try {
      let q = supabase.from("mf_dse_database").select("dse_code, ds_name, mc, branch, region, is_revoked").eq("is_revoked", false).order("dse_code", { ascending: true });
      if (isSPM) { if (!mcFilter) { setDseList([]); setLoadingDse(false); return; } q = q.eq("mc", mcFilter); }
      const { data: dses, error: e1 } = await q.limit(1000);
      if (e1) throw e1;
      setDseList(dses || []);

      const codes = (dses || []).map((r) => r.dse_code);
      if (codes.length) {
        const { data: prod, error: e2 } = await supabase.from("mf_dse_prod_ar").select("*").eq("tanggal", entryDate).in("dse_code", codes);
        if (e2) throw e2;
        const map = {};
        (prod || []).forEach((r) => {
          map[r.dse_code] = map[r.dse_code] || {};
          map[r.dse_code][r.brand] = { qty_sp: r.qty_sp, nilai_sp: r.nilai_sp, qty_saldo: r.qty_saldo, nilai_saldo: r.nilai_saldo, qty_voucher: r.qty_voucher, nilai_voucher: r.nilai_voucher, ar_piutang: r.ar_piutang, catatan: r.catatan || "" };
        });
        setEntries(map);
      } else {
        setEntries({});
      }
      setIdentity({});
      setDirty({});
    } catch (e) {
      showToast(e.message || "Gagal memuat daftar DSE.", "error");
    } finally {
      setLoadingDse(false);
    }
  }, [isSPM, mcFilter, entryDate]);

  useEffect(() => { loadDseAndEntries(); }, [loadDseAndEntries]);

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
      if (idEdit && (idEdit.ds_name !== undefined || idEdit.mc !== undefined)) {
        const payload = {};
        if (idEdit.ds_name !== undefined && idEdit.ds_name !== dse?.ds_name) payload.ds_name = idEdit.ds_name;
        if (idEdit.mc !== undefined && idEdit.mc !== dse?.mc) payload.mc = idEdit.mc;
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
        ar_piutang: fRaw(brandEntries[b].ar_piutang), catatan: brandEntries[b].catatan || null,
        uploaded_by: profile?.id || null,
      }));
      if (rowsToSave.length) {
        const { error } = await supabase.from("mf_dse_prod_ar").upsert(rowsToSave, { onConflict: "tanggal,dse_code,brand" });
        if (error) throw error;
      }
      setDirty((prev) => ({ ...prev, [code]: false }));
      showToast(`Data ${code} tersimpan.`, "ok");
    } catch (e) {
      showToast(e.message || "Gagal menyimpan.", "error");
    } finally {
      setSavingCode(null);
    }
  };

  const handleSaveAllDirty = async () => {
    const codes = Object.keys(dirty).filter((c) => dirty[c]);
    for (const c of codes) await handleSaveDse(c); // eslint-disable-line no-await-in-loop
  };

  const filteredDseList = dseList.filter((r) => {
    if (!dseSearch) return true;
    const s = dseSearch.toLowerCase();
    return r.dse_code?.toLowerCase().includes(s) || r.ds_name?.toLowerCase().includes(s);
  });

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
  const [totals, setTotals] = useState({ qty_sp: 0, nilai_sp: 0, qty_saldo: 0, nilai_saldo: 0, qty_voucher: 0, nilai_voucher: 0, ar_piutang: 0 });
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

      let tq = supabase.from("mf_dse_prod_ar").select("qty_sp,nilai_sp,qty_saldo,nilai_saldo,qty_voucher,nilai_voucher,ar_piutang");
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
        ar_piutang: a.ar_piutang + fRaw(r.ar_piutang),
      }), { qty_sp: 0, nilai_sp: 0, qty_saldo: 0, nilai_saldo: 0, qty_voucher: 0, nilai_voucher: 0, ar_piutang: 0 });
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
      const head = ["Tanggal", "Kode DSE", "Brand", "MC", "Branch", "Nama DS", "Nama DSE", "Qty SP", "Nilai SP", "Qty Saldo", "Nilai Saldo", "Qty Voucher", "Nilai Voucher", "AR/Piutang", "Catatan"];
      const body = (data || []).map((r) => [
        r.tanggal, r.dse_code, r.brand || "IM3", r.mc || "", r.branch || "", r.ds_name || "", r.dse_name || "",
        fRaw(r.qty_sp), fRaw(r.nilai_sp), fRaw(r.qty_saldo), fRaw(r.nilai_saldo), fRaw(r.qty_voucher), fRaw(r.nilai_voucher),
        fRaw(r.ar_piutang), r.catatan || "",
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

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <TrendingUp size={20} color={t.teal} />
        <div style={{ fontSize: 19, fontWeight: 800 }}>DSE Prod. & AR</div>
      </div>
      <div style={{ fontSize: 13, color: t.mid, marginBottom: 16 }}>
        Input harian produksi DSE (SP, Saldo, Voucher) per brand IM3 &amp; 3ID, plus AR/piutang — langsung per Kode DSE
        {isMPX && myMcNames.length === 1 ? ` di MC ${myMcNames[0]}` : isMPX && myMcNames.length > 1 ? ` di ${myMcNames.length} MC milik Anda (${myMcNames.join(", ")})` : ""}. Nama DSE dan MC bisa diperbarui langsung dari sini.
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
      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${t.line}` }}>
        {[
          { k: "input", label: "Input Harian", icon: ListChecks },
          { k: "riwayat", label: "Riwayat & Laporan", icon: History },
          ...(isSPM ? [{ k: "user-mgmt", label: "Mapping & User Management", icon: UserRoundCog }] : []),
          ...(isSPM ? [{ k: "dse-database", label: "Database DSE", icon: Database }] : []),
        ].map(({ k, label, icon: Icon }) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "none", border: "none", outline: "none", borderBottom: tab === k ? `2px solid ${t.teal}` : "2px solid transparent", color: tab === k ? t.teal : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, WebkitTapHighlightColor: "transparent" }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "dse-database" ? (
        <SDP_DseDatabase theme={theme} profile={profile} />
      ) : tab === "user-mgmt" ? (
        <AdminMcMapping theme={theme} />
      ) : tab === "input" ? (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
            <div style={{ minWidth: 160 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", marginBottom: 6 }}>Tanggal</div>
              <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} style={{ ...inputStyle, width: 170 }} />
            </div>
            {isSPM && (
              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", marginBottom: 6 }}>MC</div>
                <div style={{ position: "relative" }}>
                  <select value={mcFilter} onChange={(e) => setMcFilter(e.target.value)} style={{ ...inputStyle, width: 220, appearance: "none", cursor: "pointer" }}>
                    <option value="">— pilih MC —</option>
                    {mcOptions.map((mc) => <option key={mc} value={mc}>{mc}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: "absolute", right: 10, top: 12, color: t.lo, pointerEvents: "none" }} />
                </div>
              </div>
            )}
            <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", marginBottom: 6 }}>Cari DSE</div>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 12, top: 12, color: t.lo }} />
                <input value={dseSearch} onChange={(e) => setDseSearch(e.target.value)} placeholder="Kode DSE / Nama…" style={{ ...inputStyle, paddingLeft: 34 }} />
              </div>
            </div>
            <button onClick={loadDseAndEntries} title="Refresh" style={{ width: 38, height: 38, borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RefreshCw size={14} className={loadingDse ? "spin" : ""} />
            </button>
            {dirtyCount > 0 && (
              <button onClick={handleSaveAllDirty} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Save size={14} /> Simpan Semua ({dirtyCount})
              </button>
            )}
          </div>

          {isSPM && !mcFilter ? (
            <div style={{ padding: 28, textAlign: "center", color: t.mid, borderRadius: 12, border: `1px dashed ${t.line}` }}>Pilih MC dulu untuk mulai input.</div>
          ) : loadingDse ? (
            <div style={{ padding: 28, textAlign: "center", color: t.mid }}><Loader2 size={18} className="spin" /></div>
          ) : filteredDseList.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: t.mid, borderRadius: 12, border: `1px dashed ${t.line}` }}>Belum ada Kode DSE terdaftar untuk MC ini. Tambahkan dulu di menu Database DSE.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {filteredDseList.map((dse) => (
                <DseEntryCard key={dse.dse_code} t={t} isCardView={isCardView} dse={dse}
                  entries={entries[dse.dse_code] || {}}
                  onEntryChange={handleEntryChange}
                  onIdentityChange={handleIdentityChange}
                  onSave={handleSaveDse}
                  saving={savingCode === dse.dse_code}
                  dirty={!!dirty[dse.dse_code]} />
              ))}
            </div>
          )}

          {/* ── Import massal Excel (opsional, sekunder) ── */}
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
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.line}`, display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11.5, color: t.mid }}>AR / Piutang</span>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: fRaw(r.ar_piutang) > 0 ? t.amber : t.hi }}>Rp {fmtID(r.ar_piutang)}</span>
                    </div>
                    {r.catatan && <div style={{ marginTop: 6, fontSize: 11.5, color: t.mid, fontStyle: "italic" }}>{r.catatan}</div>}
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

      <style>{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
