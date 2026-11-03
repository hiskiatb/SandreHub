"use client";
/**
 * SDP2_CMS.jsx — SDP Management (Baru), "CMS Registrasi SDP".
 *
 * Tabel admin yang menampilkan SEMUA kolom yang diisi saat Registrasi SDP
 * (lihat DB_COLS di SDP_QuickForm.jsx) untuk SEMUA pengajuan (bukan cuma
 * "SDP Saya" seperti di SDP2_Home) - dipakai SPM/PIC Region/IOH untuk
 * memeriksa data mentah apa adanya, kolom per kolom, tanpa layout HQ yang
 * sudah disaring (beda dari SDP_Export yang cuma menampilkan subset kolom
 * sesuai format sheet HQ).
 *
 * UPDATE (permintaan user - "pastikan setiap kolom di headernya bisa
 * difilter, referensinya DSE Prod. & AR"): filter per-kolom dipindah dari
 * MFTS_TableFilter ke ExcelFilter.jsx - komponen Excel-style yang SAMA
 * PERSIS dipakai di DSE_ProdAR.jsx (popover draggable/resizable, Asc/Desc,
 * Search, checklist Select-All, Reset/Apply) - supaya konsisten & SETIAP
 * kolom (tanpa kecuali) punya tombol filter di headernya. Ditambah 3 kartu
 * ringkasan relevan di atas tabel (lihat StatTile).
 *
 * Scope data mengikuti pola yang sama dgn SDP_Export.jsx: SPM & IOH lihat
 * seluruh Sumatera, PIC Region cuma region miliknya.
 *
 * Props: { supabase, theme = "dark", profile, onExit }
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Loader2, AlertCircle, Search, RefreshCw, Inbox, Download, Check,
  ClipboardList, X, ChevronDown, UploadCloud, Lock, MapPin, FileMinus2, Shuffle,
} from "lucide-react";
import ExcelFilter from "./ExcelFilter";
import SDP2_Detail from "./SDP2_Detail";
import SDP_UploadTerritory from "./SDP_UploadTerritory";
import SDP2_GenericTable from "./SDP2_GenericTable";
import { SdpHeaderBanner, SDP_GRADIENT_CTA, SDP_GRADIENT_CTA_SHADOW } from "./SDP2_Shared";

const mk = (d) => ({
  card: d ? "#17171B" : "#FFFFFF", sub: d ? "#1D1D22" : "#F8F9FA", line: d ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)",
  hi: d ? "#F1F1F4" : "#0F1117", mid: d ? "#8A8A9C" : "#6B7280", lo: d ? "#4A4A5E" : "#A0A8B4", inp: d ? "#111114" : "#FFFFFF",
  head: d ? "#202028" : "#EEF1F5",
  teal: "#32BCAD", tealD: "#1A9E90", tealBg: d ? "rgba(50,188,173,.12)" : "rgba(26,158,144,.08)",
  blue: "#0A84FF", blueBg: d ? "rgba(10,132,255,.16)" : "rgba(10,132,255,.1)",
  amber: "#FFB020", amberBg: d ? "rgba(255,176,32,.14)" : "rgba(255,176,32,.09)",
  acc: "#ED1C24", accBg: d ? "rgba(237,28,36,.12)" : "rgba(237,28,36,.08)",
  red: "#ED1C24", redBg: d ? "rgba(237,28,36,.12)" : "rgba(237,28,36,.08)",
  sm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
  shadowSm: d ? "0 1px 4px rgba(0,0,0,.55)" : "0 1px 3px rgba(0,0,0,.06)",
});
const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

// SEMUA kolom yang diisi di sub-menu Registrasi SDP (form SDP_QuickForm +
// metadata pengirim/dokumen yang ikut tersimpan saat submit) - urutannya
// dikelompokkan supaya enak dibaca, TAPI tidak ada kolom yang disembunyikan
// seperti di SDP_Export (yang cuma menampilkan subset sesuai layout HQ).
// Kolom status/validasi HQ (circle_submit_status, hq_validation_status, dst)
// SENGAJA tidak ikut - itu diisi BELAKANGAN oleh HQ/BSM, bukan oleh pengisi
// form Registrasi SDP. SETIAP kolom di sini otomatis dapat tombol filter
// ExcelFilter di headernya (lihat render tabel di bawah) - tanpa kecuali.
const COLS = [
  // === 45 kolom sesuai urutan template Excel resmi "Simplified SDP
  // Registration Template" (sheet 01_SDP_Registration) — urutan & label di
  // sini SENGAJA dibuat persis sama dengan header template tersebut. ===
  ["sdp_id_new", "SDP ID (New)"], ["pairing_id", "Pairing ID"], ["brand", "Brand"],
  ["submission_month", "Submission Month"], ["submission_date", "Submission Date"],
  ["request_type", "Request Type"], ["registration_scope", "Registration Scope"],
  ["circle", "Circle"], ["region", "Region"], ["branch", "Branch"], ["sdp_name", "SDP Name"],
  ["partner_company_name", "Partner / Company Name"], ["customer_legal_name", "Customer Legal Name"],
  ["company_type", "Company Type"], ["status_company", "Status Company"],
  ["ktp_number", "KTP Number"], ["npwp_number", "NPWP Number"],
  ["pic_name_partner", "PIC Name Partner"], ["pic_phone_number", "PIC Phone Number"],
  ["msisdn_master_trx", "MSISDN Master TRX"], ["pic_email_partner", "PIC Email Partner"],
  ["email_pic_ioh", "Email PIC IOH"], ["kabupaten", "Kab/Kota"],
  ["kecamatan_coverage", "Kecamatan Coverage"], ["bill_to_address", "Bill To Address"],
  ["ship_to_address", "Ship To Address"], ["kode_pos", "Kode Pos"],
  ["need_sap_creation", "Need SAP Creation?"], ["need_oracle_creation", "Need Oracle Creation?"],
  ["hybrid_type", "Hybrid Type"], ["cse_name", "CSE Name"], ["cse_partner_id", "CSE Partner ID"],
  ["cse_number", "CSE Number"], ["bank_name", "Bank Name"], ["bank_branch_kcp", "Bank Branch / KCP"],
  ["bank_account_number", "Bank Account Number"], ["bank_account_name", "Bank Account Name"],
  ["commitment_fee_status", "Commitment Fee Status"],
  ["main_document_folder_link", "Main Document Folder Link"],
  ["branding_update_required", "Branding Update Required?"], ["branding_status", "Branding Status"],
  ["circle_submit_status", "Circle Submit Status"], ["hq_validation_status", "HQ Validation Status"],
  ["final_registration_status", "Final Registration Status"], ["remarks", "Remarks"],
  // === Kolom operasional tambahan DI LUAR template Excel (tetap dipakai
  // sistem - lat/long untuk pin peta, cycle_month sumber YYMM SDP ID, dst) -
  // diletakkan setelah 45 kolom template persis supaya CMS tetap menampilkan
  // SEMUA kolom (sesuai permintaan awal), tanpa mengubah urutan 45 kolom
  // resmi di atas. ===
  ["status", "Status (Sistem)"], ["cycle_month", "Bulan Siklus"],
  ["partner_territory", "Partner Territory"],
  ["latitude", "Latitude"], ["longitude", "Longitude"],
  ["latitude_gudang", "Latitude Gudang"], ["longitude_gudang", "Longitude Gudang"],
  ["submitted_by_name", "Submitted By"], ["submitter_role", "Role Pengirim"],
  ["submitter_brand", "Brand Pengirim"], ["submitter_branch", "Branch Pengirim"],
  ["submitter_cluster", "Cluster Pengirim"], ["submitter_region", "Region Pengirim"],
  ["ktp_file", "File KTP"], ["npwp_file", "File NPWP"], ["supporting_files", "Dokumen Pendukung"],
  ["created_at", "Dibuat"], ["updated_at", "Diupdate"],
];
const NUMERIC_KEYS = new Set(["latitude", "longitude", "latitude_gudang", "longitude_gudang"]);
const DATE_KEYS = new Set(["created_at", "updated_at", "submission_date"]);
// UPDATE (permintaan user - "hilangkan data partner/company name, ship to
// address, hybrid type - maksud saya data yg kita input backend namun
// kolomnya tetap ada"): 3 kolom ini TETAP ada di tabel (header + filter),
// tapi NILAI yang ditampilkan di tiap baris disembunyikan (jadi "—") -
// data aslinya TIDAK dihapus dari database, cuma tidak ditampilkan di sini.
const HIDDEN_VALUE_KEYS = new Set(["partner_company_name", "ship_to_address", "hybrid_type"]);

// UPDATE (permintaan user - "tambahkan juga untuk kolom Data Terminasi dan
// juga Data Rebordering, sesuai dengan kolom kolom yang ada di excel
// terlampir"): kolom & urutan di bawah ini SENGAJA dibuat persis sama dgn
// header sheet "02_Termination_Main"/"03_Rebordering_Kec_Detail" pada file
// "Simplified SDP Registration Template" - tabel `sdp_termination` &
// `sdp_rebordering` di database SUDAH match 1:1 dgn kolom-kolom ini
// (dibuat lebih dulu, cuma belum ada UI yang membacanya).
const COLS_TERMINASI = [
  ["submission_month", "Submission Month"], ["submission_date", "Submission Date"],
  ["circle", "Circle"], ["region", "Region"], ["area", "Area"], ["branch", "Branch"],
  ["micro_cluster", "Micro Cluster"], ["partner_territory", "Partner Territory"],
  ["sdp_type", "SDP TYPE"], ["sdp_code", "SDP Code"], ["sdp_name", "SDP Name"],
  ["lokasi_sdp", "Lokasi SDP"], ["num_kec", "# KEC"], ["termination_reason", "Termination Reason"],
  ["last_active_date", "Last Active Date"], ["effective_termination_date", "Effective Termination Date"],
  ["kecamatan_return_completed", "Kecamatan Return Completed?"],
  ["kecamatan_return_where", "Where the Kecamatan Return?"],
  ["circle_iom_link", "Circle IOM No./Link"], ["document_folder_link", "Document Folder Link"],
  ["approval_status", "Approval Status"], ["hq_validation_status", "HQ Validation Status"],
  ["final_status", "Final Status"], ["pic_circle", "PIC Circle"], ["pic_hq", "PIC HQ"],
  ["remarks", "Remarks"],
];
const COLS_REBORDERING = [
  ["circle", "Circle"], ["kecamatan", "Kecamatan"], ["kabupaten", "Kab/Kota"],
  ["rebordering_action", "Re-Bordering Action"], ["sdp_type", "SDP TYPE"],
  ["existing_sdp_id", "Existing SDP ID"], ["existing_sdp_name", "Existing SDP Name"],
  ["existing_partner_territory", "Existing Partner Territory"], ["existing_region", "Existing Region"],
  ["existing_branch", "Existing Branch"], ["existing_micro_cluster", "Existing Micro Cluster"],
  ["rebordering_to", "Re-Bordering to"], ["after_sdp_code", "AFTER SDP / MPx Code"],
  ["after_sdp_name", "AFTER SDP / MPx Name"], ["after_partner_territory", "AFTER Partner Territory"],
  ["after_region", "AFTER Region"], ["after_branch", "AFTER Branch"],
  ["after_micro_cluster", "AFTER Micro Cluster"], ["effective_date", "Effective Date"],
  ["approval_iom_link", "Approval / IOM Link"], ["mapping_status", "Mapping Status"],
  ["owner", "Owner"], ["remarks", "Remarks"],
];

// UPDATE (permintaan user - "di kanan ini ada Select Periode ini untuk
// Data October"): dropdown filter periode berdasarkan Submission Month
// (format "YYYY-MM", sama kayak cycle_month di SDP_QuickForm), default-nya
// bulan berjalan saat halaman dibuka.
const MONTH_LABELS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const currentYM = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const fmtYM = (ym) => {
  const m = String(ym || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym || "";
  return `${MONTH_LABELS_ID[parseInt(m[2], 10) - 1]} ${m[1]}`;
};

function fmtCell(key, v) {
  if (v == null || v === "") return "";
  // UPDATE (permintaan user - "untuk circle dibuat kapital semuanya
  // SUMATERA" -> "ini masih huruf kecil" nunjuk tabel Data SDP): tampilan
  // kolom Circle di-uppercase di sini juga (termasuk ikut ke Export .xlsx
  // krn fmtCell dipakai bareng) - nilai MENTAH (r.circle = "Sumatera") yg
  // dipakai utk filter/query TIDAK berubah, cuma label yg ditampilkan.
  if (key === "circle") return String(v).toUpperCase();
  if (key === "created_at" || key === "updated_at") {
    try { return new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }); } catch { return String(v); }
  }
  if (key === "submission_date") {
    try { return new Date(v).toLocaleDateString("id-ID", { dateStyle: "medium" }); } catch { return String(v); }
  }
  if (key === "supporting_files") {
    if (Array.isArray(v)) return `${v.length} file`;
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }
  return String(v);
}

// Kartu ringkasan putih + ikon chip - style SAMA PERSIS dgn StatTile di
// DSE_ProdAR.jsx, supaya konsisten lintas halaman SDP Management.
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

const emptyColFilters = () => Object.fromEntries(COLS.map(([k]) => [k, []]));

export default function SDP2_CMS({ supabase, theme = "dark", profile, onExit }) {
  const d = theme === "dark";
  const t = mk(d);
  const role = profile?.role ?? "";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [colFilters, setColFilters] = useState(emptyColFilters);
  // UPDATE (permintaan user - "ini set default Semua Periode dulu"):
  // default filter periode sekarang "" (Semua Periode), bukan bulan
  // berjalan - currentYM() tetap dipakai di periodOptions supaya opsi bulan
  // berjalan selalu ada biar gampang dipilih kalau mau.
  const [period, setPeriod] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, dir: null });
  const [openRow, setOpenRow] = useState(null);
  const [tab, setTab] = useState("sdp"); // sdp | registrasi | terminasi | rebordering | territory
  // UPDATE (permintaan user - "untuk data registrasi saat ini bukan data
  // registrasi, itu Data SDP, jadi registrasi adalah tabel yang dihasilkan
  // dari registrasi sesuai dengan bulan yang dipilih" + "kolomnya sama
  // dengan data SDP namun kalau di kelompokkan berdasarkan submitnya kapan
  // (submission Month)"): tab "Data Registrasi" terpisah dari "Data SDP" -
  // SAMA kolomnya (COLS, dipakai lagi persis), tapi cuma baris
  // request_type === "New" & DIKELOMPOKKAN per Submission Month (header grup
  // abu2 tiap bulan, terbaru dulu) lewat prop groupByKey di
  // SDP2_GenericTable. Dropdown periode di sini OPSIONAL (bukan wajib) -
  // kalau diisi, tinggal mempersempit ke 1 bulan saja (grup jadi cuma 1),
  // kalau "Semua Periode" semua bulan tetap tampil terkelompok rapi.
  const [regPeriod, setRegPeriod] = useState("");

  const load = async () => {
    setLoading(true); setErr("");
    try {
      // Scope SAMA PERSIS dgn SDP_Export.jsx: PIC Region → region-nya saja,
      // selain itu (SPM, IOH) → seluruh Sumatera. Ini CMS admin, bukan "SDP
      // Saya", jadi TIDAK difilter by submitted_by.
      let query = supabase.from("sdp_registration").select("*").order("created_at", { ascending: false }).limit(5000);
      if (role === "pic_region" && profile?.region) query = query.eq("region", profile.region);
      else query = query.eq("circle", "Sumatera");
      const { data, error } = await query;
      if (error) throw error;
      setRows(data || []);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [supabase, role, profile?.region]);

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);

  // Export SEMUA kolom (COLS) dari baris yg sedang tampil (sudah kena
  // search + filter) - sama persis library/caranya dgn SDP_Export.jsx
  // (dynamic import exceljs, bangun matrix, writeBuffer, download via Blob),
  // tapi memakai daftar kolom lengkap di sini, bukan layout HQ yg disaring.
  // Sengaja TETAP boleh export walau 0 baris (hasilnya file berisi header
  // kolom saja) - berguna sbg template kosong.
  const exportXlsx = async () => {
    setExporting(true); setExportMsg(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Registrasi SDP");
      const headerRow = ws.addRow(COLS.map(([, label]) => label));
      headerRow.font = { bold: true };
      filtered.forEach((r) => {
        ws.addRow(COLS.map(([key]) => fmtCell(key, r[key])));
      });
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.columns = COLS.map(([key]) => ({ width: Math.max(12, Math.min(32, key.length + 6)) }));
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CMS_Registrasi_SDP_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg({ type: "ok", text: `File .xlsx (${filtered.length.toLocaleString("id-ID")} baris, ${COLS.length} kolom) diunduh.` });
    } catch (e) {
      setExportMsg({ type: "err", text: "Gagal membuat file: " + (e.message || e) });
    } finally { setExporting(false); }
  };

  // Opsi periode: SEMUA submission_month yang ada di data + bulan berjalan
  // (supaya tetap ada opsi walau belum ada data bulan ini sama sekali),
  // urut terbaru dulu.
  const periodOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.submission_month).filter(Boolean));
    set.add(currentYM());
    return [...set].sort().reverse();
  }, [rows]);

  const byPeriod = useMemo(() => {
    if (!period) return rows;
    return rows.filter((r) => r.submission_month === period);
  }, [rows, period]);

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return byPeriod;
    return byPeriod.filter((r) =>
      `${r.sdp_name || ""} ${r.sdp_id_new || ""} ${r.partner_company_name || ""} ${r.branch || ""} ${r.submitted_by_name || ""} ${r.cse_name || ""}`
        .toLowerCase().includes(needle)
    );
  }, [byPeriod, q]);

  // Opsi checklist tiap ExcelFilter - distinct value dari `searched` (hasil
  // search, SEBELUM filter kolom lain diterapkan) - pola yg sama persis dgn
  // colOptions di DSE_ProdAR.jsx.
  const colOptions = useMemo(() => {
    const out = {};
    for (const [key] of COLS) {
      const seen = new Map(); // value(string) -> label
      for (const r of searched) {
        const raw = r[key];
        const value = raw == null ? "" : String(raw);
        if (!seen.has(value)) seen.set(value, fmtCell(key, raw) || "— Kosong —");
      }
      out[key] = [...seen.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label }));
    }
    return out;
  }, [searched]);

  const filtered = useMemo(() => {
    let out = searched.filter((r) =>
      COLS.every(([key]) => {
        const sel = colFilters[key];
        if (!sel || !sel.length) return true;
        const value = r[key] == null ? "" : String(r[key]);
        return sel.includes(value);
      })
    );
    if (sortConfig.key && sortConfig.dir) {
      const key = sortConfig.key;
      const dir = sortConfig.dir === "asc" ? 1 : -1;
      const numeric = NUMERIC_KEYS.has(key);
      const isDate = DATE_KEYS.has(key);
      out = [...out].sort((a, b) => {
        const va = a[key], vb = b[key];
        if (numeric) return ((va ?? -Infinity) - (vb ?? -Infinity)) * dir;
        if (isDate) return (new Date(va || 0).getTime() - new Date(vb || 0).getTime()) * dir;
        return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
      });
    }
    return out;
  }, [searched, colFilters, sortConfig]);

  const anyFilter = Object.values(colFilters).some((v) => v.length > 0);
  const resetAll = () => { setColFilters(emptyColFilters()); setSortConfig({ key: null, dir: null }); };

  // ── 3 kartu ringkasan relevan — dihitung dari SELURUH scope (rows), tidak
  // ikut berubah saat search/filter kolom diisi, supaya tetap jadi "angka
  // acuan" yang stabil di atas tabel yang sedang di-drill-down. ──
  const summary = useMemo(() => {
    const totalRegistrasi = byPeriod.length;
    return { totalRegistrasi };
  }, [byPeriod]);

  if (openRow) {
    return (
      <SDP2_Detail supabase={supabase} theme={theme} profile={profile} entry={openRow}
        onBack={() => { setOpenRow(null); load(); }} />
    );
  }

  return (
    <div style={{ fontFamily: FF, color: t.hi, width: "100%" }}>
      <button onClick={onExit} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: t.mid, fontFamily: FF, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 20 }}>
        <ArrowLeft size={15} /> Kembali
      </button>

      {/* UPDATE (permintaan user - "untuk button button ini haruysnya
          dibuatr diatas tabel masing masing sub menu karena treastmentnya
          akajn beda beda tergantung sub menu, buat disamping kolom
          pencarian"): tombol2 aksi (Hapus filter/Semua Periode/Muat ulang/
          Upload Data/Export .xlsx) DIPINDAH dari banner ke baris di atas
          tabel, sejajar kolom pencarian - khusus utk sub-menu "Data
          Registrasi" (lihat blok tab === "registrasi" di bawah), karena
          treatment-nya memang spesifik tab itu & ke depan tiap sub-menu
          (mis. "Data Territory") bisa punya tombolnya sendiri tanpa saling
          ganggu. Banner sekarang cuma judul/subjudul, bersih & seragam di
          semua sub-menu. */}
      <SdpHeaderBanner icon={ClipboardList}
        title={tab === "sdp" ? "Data SDP" : tab === "registrasi" ? "Data Registrasi" : tab === "terminasi" ? "Data Terminasi" : tab === "rebordering" ? "Data Rebordering" : "Data Territory"} />

      {/* Sub-menu: "Data SDP" (master, semua request type/periode), "Data
          Registrasi" (khusus request_type=New, dikelompokkan per Submission
          Month - permintaan user), "Data Terminasi", "Data Rebordering",
          "Data Territory". */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${t.line}`, marginBottom: 18, flexWrap: "wrap" }}>
        <button onClick={() => setTab("sdp")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 4px", marginRight: 18, background: "none", border: "none", borderBottom: tab === "sdp" ? `2px solid ${t.teal}` : "2px solid transparent", color: tab === "sdp" ? t.hi : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FF }}>
          <ClipboardList size={14} /> Data SDP
        </button>
        <button onClick={() => setTab("registrasi")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 4px", marginRight: 18, background: "none", border: "none", borderBottom: tab === "registrasi" ? `2px solid ${t.teal}` : "2px solid transparent", color: tab === "registrasi" ? t.hi : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FF }}>
          <ClipboardList size={14} /> Data Registrasi
        </button>
        {/* UPDATE (permintaan user - "tambahkan juga untuk kolom Data
            Terminasi dan juga Data Rebordering ... buat sebelum data
            territory, untuk data territory buat urutannya paling
            terakhir"): 2 tab baru, urutan DI ANTARA "Data Registrasi" dan
            "Data Territory" (Territory sekarang SENGAJA dipindah ke paling
            akhir). Sumber tabel: sdp_termination/sdp_rebordering (sudah ada
            di DB, kolomnya sudah match 1:1 dgn header Excel - lihat
            COLS_TERMINASI/COLS_REBORDERING di atas). */}
        <button onClick={() => setTab("terminasi")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 4px", marginRight: 18, background: "none", border: "none", borderBottom: tab === "terminasi" ? `2px solid ${t.teal}` : "2px solid transparent", color: tab === "terminasi" ? t.hi : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FF }}>
          <FileMinus2 size={14} /> Data Terminasi
        </button>
        <button onClick={() => setTab("rebordering")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 4px", marginRight: 18, background: "none", border: "none", borderBottom: tab === "rebordering" ? `2px solid ${t.teal}` : "2px solid transparent", color: tab === "rebordering" ? t.hi : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FF }}>
          <Shuffle size={14} /> Data Rebordering
        </button>
        {/* UPDATE (permintaan user - "tambahkan Data Territory, ini nanti
            sebagai acuan opsi kecamatan branch dll"): tab yang membungkus
            SDP_UploadTerritory.jsx (sudah ada, SPM-only) - data yang
            diimpor di sini mengisi tabel mc_cluster_mapping, yang jadi
            sumber RPC sdp_territory_combos() → opsi dropdown Circle/Region/
            Branch/Micro Cluster di form Registrasi SDP (lihat geoOptions di
            SDP_QuickForm.jsx). Dibatasi role SPM Sumatera saja, sama persis
            spt pembatasan aslinya di menu Archive. Urutan PALING TERAKHIR
            (permintaan user). */}
        {role === "spm_sumatera" && (
          <button onClick={() => setTab("territory")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 4px", marginRight: 18, background: "none", border: "none", borderBottom: tab === "territory" ? `2px solid ${t.teal}` : "2px solid transparent", color: tab === "territory" ? t.hi : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FF }}>
            <MapPin size={14} /> Data Territory
          </button>
        )}
      </div>

      {exportMsg && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: 10, marginBottom: 14, fontSize: 12.5, fontWeight: 600,
          background: exportMsg.type === "ok" ? t.tealBg : t.accBg, color: exportMsg.type === "ok" ? t.tealD : t.acc, border: `1px solid ${(exportMsg.type === "ok" ? t.tealD : t.acc)}44` }}>
          {exportMsg.type === "ok" ? <Check size={14} /> : <AlertCircle size={14} />} {exportMsg.text}
        </div>
      )}

      {tab === "sdp" && (
      <>
      {/* Ringkasan — 3 kartu, angka stabil dari seluruh scope (bukan hasil
          filter tabel di bawah), supaya tetap jadi acuan saat sedang
          drill-down lewat search/filter kolom. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatTile t={t} icon={<ClipboardList size={13} color={t.teal} />} label="Total SDP" value={summary.totalRegistrasi.toLocaleString("id-ID")} sub={role === "pic_region" ? "Region Anda" : "Seluruh Sumatera"} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 420 }}>
          <Search size={14} color={t.lo} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama SDP, SDP ID, partner, branch, pengirim…"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 36px", borderRadius: 12, border: `1px solid ${t.line}`, background: t.inp, color: t.hi, fontSize: 13.5, fontFamily: FF, outline: "none" }} />
        </div>

        {/* Tombol aksi khusus "Data Registrasi" — sejajar kolom pencarian
            (lihat update note di atas banner). */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {anyFilter && (
            <button onClick={resetAll} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${t.acc}44`, borderRadius: 9, background: t.accBg, cursor: "pointer", color: t.acc, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", padding: "8px 11px", fontFamily: FF }}>
              <X size={13} /> Hapus filter
            </button>
          )}
          <div style={{ position: "relative" }}>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} title="Filter periode (Submission Month)"
              style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", boxSizing: "border-box",
                padding: "8px 30px 8px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi,
                fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FF, outline: "none" }}>
              <option value="">Semua Periode</option>
              {periodOptions.map((ym) => <option key={ym} value={ym}>{fmtYM(ym)}</option>)}
            </select>
            <ChevronDown size={13} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
          </div>
          <button onClick={load} title="Muat ulang" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FF }}>
            <RefreshCw size={13} /> Muat ulang
          </button>
          {/* UPDATE (permintaan user - "tambahkan Upload Data nantinya ini
              akan mengisi data periode yang terpilih"): tombol placeholder
              dulu (belum ada alur upload-nya) - mengisi data utk periode
              yang sedang dipilih di dropdown "Select Periode" di sebelahnya.
              Dikunci ("Segera hadir") sampai alurnya dibangun, mengikuti
              pola kartu placeholder lain di modul ini (mis. "Terminasi
              SDP"/"Rebordering SDP" di SDP2_Home). */}
          <button type="button" disabled title={period ? `Segera hadir — akan mengisi data untuk periode ${fmtYM(period)}` : "Segera hadir — pilih periode dulu, lalu isi data untuk periode itu"}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: `1px dashed ${t.line}`, background: t.sub, color: t.lo, fontSize: 12.5, fontWeight: 700, cursor: "not-allowed", fontFamily: FF }}>
            <UploadCloud size={13} /> Upload Data <Lock size={10} style={{ marginLeft: -1 }} />
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
        // Tabel (header SEMUA kolom, masing2 dgn tombol filter ExcelFilter)
        // selalu ditampilkan di sini, termasuk saat belum ada data sama
        // sekali - baris "kosong" cuma jadi 1 baris placeholder DI DALAM
        // tabel (bukan menggantikan seluruh tabel), supaya daftar kolomnya
        // tetap kelihatan lengkap & bisa langsung dipakai walau datanya 0.
        <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, overflow: "hidden" }}>
          <div className="sdp-cms-scroll" style={{ overflow: "auto", maxHeight: "68vh" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "max-content", minWidth: "100%" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
                <tr style={{ background: t.head, color: t.mid }}>
                  <th style={{ padding: "9px 12px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", position: "sticky", left: 0, background: t.head, zIndex: 6 }}>Aksi</th>
                  {COLS.map(([key, label]) => (
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
                    <td colSpan={COLS.length + 1} style={{ padding: "36px 16px", textAlign: "center", color: t.mid, fontSize: 13 }}>
                      <Inbox size={18} color={t.lo} style={{ verticalAlign: "-3px", marginRight: 8 }} />
                      {q || anyFilter ? "Tidak ada yang cocok dengan pencarian/filter ini." : "Belum ada data registrasi - semua kolom di atas tetap ditampilkan."}
                    </td>
                  </tr>
                ) : filtered.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? t.sub : t.card, borderTop: `1px solid ${t.line}` }}>
                    <td style={{ padding: "7px 12px", whiteSpace: "nowrap", position: "sticky", left: 0, background: i % 2 ? t.sub : t.card }}>
                      <button onClick={() => setOpenRow(r)} style={{ border: `1px solid ${t.line}`, background: t.tealBg, color: t.tealD, borderRadius: 7, padding: "4px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FF }}>Lihat</button>
                    </td>
                    {COLS.map(([key]) => {
                      const raw = r[key];
                      const isLink = (key === "ktp_file" || key === "npwp_file" || key === "main_document_folder_link") && raw;
                      const hidden = HIDDEN_VALUE_KEYS.has(key);
                      return (
                        <td key={key} style={{ padding: "7px 12px", whiteSpace: "nowrap", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", color: t.hi }}>
                          {hidden ? (
                            <span style={{ color: t.lo }}>—</span>
                          ) : isLink ? (
                            <a href={String(raw)} target="_blank" rel="noreferrer" style={{ color: t.tealD, textDecoration: "underline" }}>Buka</a>
                          ) : (
                            fmtCell(key, raw) || <span style={{ color: t.lo }}>—</span>
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
      )}

      {tab === "registrasi" && (
        <SDP2_GenericTable supabase={supabase} theme={theme} profile={profile} role={role} t={t} d={d}
          tableName="sdp_registration" cols={COLS}
          externalRows={rows.filter((r) => r.request_type === "New" && (!regPeriod || r.submission_month === regPeriod))}
          onReload={load}
          groupByKey="submission_month" groupLabelFn={fmtYM}
          dateKeys={["created_at", "updated_at", "submission_date"]}
          linkKeys={["ktp_file", "npwp_file", "main_document_folder_link"]}
          searchKeys={["sdp_name", "sdp_id_new", "partner_company_name", "branch", "submitted_by_name", "cse_name"]}
          scopeRegionKey={null}
          statLabel="Total Registrasi (New)"
          statSub={role === "pic_region" ? "Region Anda" : "Seluruh Sumatera"}
          extraControls={
            <div style={{ position: "relative" }}>
              <select value={regPeriod} onChange={(e) => setRegPeriod(e.target.value)} title="Filter periode (opsional — Submission Month)"
                style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", boxSizing: "border-box",
                  padding: "8px 30px 8px 11px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.card, color: t.hi,
                  fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FF, outline: "none" }}>
                <option value="">Semua Periode</option>
                {periodOptions.map((ym) => <option key={ym} value={ym}>{fmtYM(ym)}</option>)}
              </select>
              <ChevronDown size={13} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: t.mid, pointerEvents: "none" }} />
            </div>
          }
          exportFileName="CMS_Registrasi_SDP" exportSheetName="Registrasi SDP"
          searchPlaceholder="Cari nama SDP, SDP ID, partner, branch, pengirim…"
          emptyLabel="Belum ada data registrasi (New) — semua kolom di atas tetap ditampilkan."
          icon={<ClipboardList size={13} color={t.teal} />} />
      )}

      {tab === "terminasi" && (
        <SDP2_GenericTable supabase={supabase} theme={theme} profile={profile} role={role} t={t} d={d}
          tableName="sdp_termination" cols={COLS_TERMINASI}
          dateKeys={["submission_date", "last_active_date", "effective_termination_date"]}
          linkKeys={["circle_iom_link", "document_folder_link"]}
          searchKeys={["sdp_name", "sdp_code", "branch", "termination_reason", "pic_circle", "pic_hq"]}
          scopeRegionKey="region"
          exportFileName="CMS_Terminasi_SDP" exportSheetName="Terminasi SDP"
          searchPlaceholder="Cari nama SDP, SDP Code, branch, alasan terminasi…"
          emptyLabel="Belum ada data terminasi — semua kolom di atas tetap ditampilkan."
          icon={<FileMinus2 size={13} color={t.acc} />} />
      )}

      {tab === "rebordering" && (
        <SDP2_GenericTable supabase={supabase} theme={theme} profile={profile} role={role} t={t} d={d}
          tableName="sdp_rebordering" cols={COLS_REBORDERING}
          dateKeys={["effective_date"]}
          linkKeys={["approval_iom_link"]}
          searchKeys={["kecamatan", "kabupaten", "existing_sdp_name", "after_sdp_name", "owner"]}
          scopeRegionKey={null}
          exportFileName="CMS_Rebordering_SDP" exportSheetName="Rebordering SDP"
          searchPlaceholder="Cari kecamatan, kab/kota, nama SDP existing/tujuan…"
          emptyLabel="Belum ada data rebordering — semua kolom di atas tetap ditampilkan."
          icon={<Shuffle size={13} color={t.blue} />} />
      )}

      {tab === "territory" && role === "spm_sumatera" && (
        <SDP_UploadTerritory supabase={supabase} theme={theme} profile={profile} />
      )}

      {/* UPDATE (permintaan user - "walaupun dia bisa di scroll, tidak perlu
          tampilkan scroll bar di paling kanan agar lebih rapi"): scrollbar
          tabel disembunyikan visualnya (cross-browser) - scroll (geser/
          drag/trackpad/keyboard) TETAP berfungsi normal, cuma bar-nya yang
          tidak digambar. */}
      <style>{`
        .spin{animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}
        .sdp-cms-scroll{scrollbar-width:none;-ms-overflow-style:none;}
        .sdp-cms-scroll::-webkit-scrollbar{display:none;}
      `}</style>
    </div>
  );
}
