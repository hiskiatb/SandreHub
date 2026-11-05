"use client";
/**
 * CombinedEmailExport.jsx — "Export & Upload Gabungan" (User Management)
 *
 * PERMINTAAN USER: "sediakan fitur export laporan yang bisa menandai role
 * yang dipilih misal admin mc dan admin area saya ingin export datanya
 * langsung di dalam excel yang sama, dan juga saya ingin dipisahkan untuk
 * masing masing region juga, dan ada fitur untuk upload kembali walau
 * sudah di breakdown per region, jadi untuk kasus saat ini jadi 6 sheet,
 * 3 sheet untuk admin mc yang dipisah per masing masing region, dan 3
 * sheet untuk admin area yang dipisahkan untuk region masing masing"
 * (diklarifikasi: ini soal fitur Download/Upload Daftar Email di dalam
 * User Management, bukan laporan data).
 *
 * Komponen ini BERDIRI SENDIRI (independen dari AdminMcMapping.jsx /
 * AdminAreaMapping.jsx - punya fetch & state sendiri saat tombol
 * Export/Upload diklik) supaya bisa gabungkan data KEDUA role sekaligus
 * jadi 1 file Excel, tiap role dipecah lagi jadi beberapa sheet per
 * Region (jumlah Region ikut data live di Database DSE, bukan di-hardcode
 * 3 - supaya tetap benar kalau nanti ada Region baru).
 *
 * Styling sheet (header merah/kuning, merge vertikal per MC/Area, border)
 * SENGAJA disamakan persis dengan handleDownloadEmails di AdminMcMapping.jsx
 * & AdminAreaMapping.jsx supaya hasilnya konsisten dgn export per-role yang
 * sudah ada - hanya beda di: 1 file berisi banyak sheet (bukan 1 sheet per
 * file), dan tiap sheet cuma isi baris utk 1 Region.
 *
 * Upload: terima balik file yg sama (multi-sheet, per Region, per role) -
 * cocokkan nama sheet via prefix "Admin MC"/"Admin Area" (case-insensitive)
 * utk tahu sheet itu diproses ke tabel mf_dse_admin_mc_emails atau
 * mf_dse_admin_area_emails. Validasi MC/Branch SAMA PERSIS aturan upload
 * per-role yang sudah ada (cuma MC/Branch yg SUDAH ADA, typo/tidak
 * ditemukan -> baris itu gagal, tidak bikin MC/Branch baru).
 */
import { useState, useRef } from "react";
import supabase from "../../../lib/supabase";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Upload, Loader2, Check, AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;

// Pecah 1 sel email yang berisi beberapa alamat (dipisah koma/titik-koma),
// masing2 boleh ada anotasi "(label)" - SAMA PERSIS dgn splitEmailCell di
// AdminMcMapping.jsx/AdminAreaMapping.jsx (duplikat sengaja, komponen ini
// berdiri sendiri tanpa impor silang).
function splitEmailCell(raw) {
  if (!raw) return [];
  const parts = String(raw).split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const m = p.match(/^(\S+@\S+?)\s*(?:\(([^)]*)\))?$/);
    if (m) {
      const email = m[1].trim().replace(/[.,;]+$/, "");
      const label = m[2] ? m[2].trim() : null;
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.push({ email: email.toLowerCase(), label });
    } else {
      const m2 = p.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (m2) out.push({ email: m2[0].toLowerCase(), label: null });
    }
  }
  return out;
}

function Toast({ msg, type, onClose }) {
  useState(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t); });
  const bg = type === "error" ? "#DC2626" : type === "warn" ? "#D97706" : "#16A34A";
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, left: 24, zIndex: 9999, display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", borderRadius: 10, background: bg, color: "#fff", fontSize: 13.5, fontWeight: 600, fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", maxWidth: 560, marginLeft: "auto" }}>
      {type === "error" ? <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
      <span style={{ flex: 1, whiteSpace: "pre-line" }}>{msg}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}><X size={14} /></button>
    </div>
  );
}

// Role yang punya fitur "Daftar Email" (Mapping & User Management) - cuma
// 2 ini sejauh ini (sejajar USER_MGMT_ROLES di page.jsx, tapi cuma yg
// `ready` & punya tabel emails-nya sendiri).
const EXPORT_ROLES = [
  { k: "finance_mpx", label: "Admin MC", sheetPrefix: "Admin MC" },
  { k: "admin_area", label: "Admin Area", sheetPrefix: "Admin Area" },
];

export default function CombinedEmailExport({ theme }) {
  const d = theme === "dark";
  const t = {
    card: d ? "#1A1A1D" : "#FFFFFF", sub: d ? "#202024" : "#F5F5F7",
    line: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)", hi: d ? "#F2F2F3" : "#1A1A1D",
    mid: d ? "#8A8A96" : "#5A5A68", lo: d ? "#5A5A68" : "#8A8A96",
    inputBd: d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)",
    teal: d ? "#32BCAD" : "#1A9E90", tealBg: d ? "rgba(50,188,173,0.10)" : "rgba(26,158,144,0.07)",
    shadowSm: d ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.07)",
  };

  const [open, setOpen] = useState(true);
  const [checkedRoles, setCheckedRoles] = useState({ finance_mpx: true, admin_area: true });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const toggleRole = (k) => setCheckedRoles((prev) => ({ ...prev, [k]: !prev[k] }));

  // ── Ambil data MENTAH (mapping + emails + referensi Database DSE) utk 1
  // role, dibangun persis sama logic displayRows/emailsByMc(Branch) di
  // AdminMcMapping.jsx/AdminAreaMapping.jsx - tapi langsung fetch fresh di
  // sini (komponen ini tidak share state dgn 2 komponen itu).
  const loadRoleData = async (roleKey) => {
    const isMc = roleKey === "finance_mpx";
    const codeField = isMc ? "mc" : "branch";
    const mappingTable = isMc ? "mf_dse_admin_mc_mapping" : "mf_dse_admin_area_mapping";
    const emailsTable = isMc ? "mf_dse_admin_mc_emails" : "mf_dse_admin_area_emails";

    const dseQuery = isMc
      ? supabase.from("mf_dse_database").select("region, branch, mc, circle").eq("is_revoked", false).not("mc", "is", null)
      : supabase.from("mf_dse_database").select("region, branch, circle").eq("is_revoked", false).not("branch", "is", null);
    const [{ data: dseRaw }, { data: mappingRows }, { data: emailRows }] = await Promise.all([
      dseQuery,
      supabase.from(mappingTable).select("*"),
      supabase.from(emailsTable).select("*"),
    ]);

    // dseRefMap: Map<code_lowercase, { code, region, circle, branch? }>
    const dseRefMap = new Map();
    (dseRaw || []).forEach((r) => {
      const code = isMc ? r.mc : r.branch;
      if (!code) return;
      const key = code.toLowerCase();
      if (!dseRefMap.has(key)) dseRefMap.set(key, { code, region: r.region, circle: r.circle, branch: isMc ? r.branch : undefined });
    });

    // emailsByCode: Map<code_lowercase, [{ email, label, active }]>
    const mappingById = new Map((mappingRows || []).map((m) => [m.id, m]));
    const emailsByCode = new Map();
    (emailRows || []).forEach((e) => {
      const mapping = mappingById.get(e.mapping_id);
      if (!mapping) return;
      const code = isMc ? mapping.mc : mapping.branch;
      if (!code) return;
      const key = code.toLowerCase();
      if (!emailsByCode.has(key)) emailsByCode.set(key, []);
      emailsByCode.get(key).push(e);
    });

    // displayRows: gabungan baris mapping tersimpan + code dari Database DSE
    // yg belum punya mapping - region/circle/branch SELALU di-override dari
    // dseRefMap kalau tersedia (sama aturan AdminMcMapping/AdminAreaMapping).
    const byCode = new Map();
    (mappingRows || []).forEach((r) => {
      const code = isMc ? r.mc : r.branch;
      if (code) byCode.set(code.toLowerCase(), { code, region: r.region, circle: r.circle, branch: isMc ? r.branch : code, full_name: r.full_name || "" });
    });
    dseRefMap.forEach((ref, key) => {
      if (byCode.has(key)) return;
      byCode.set(key, { code: ref.code, region: ref.region, circle: ref.circle, branch: isMc ? ref.branch : ref.code, full_name: "" });
    });
    const displayRows = Array.from(byCode.values()).map((r) => {
      const ref = dseRefMap.get(r.code.toLowerCase());
      return ref ? { ...r, region: ref.region, circle: ref.circle, branch: isMc ? ref.branch : r.branch } : r;
    }).sort((a, b) => a.code.localeCompare(b.code));

    return { isMc, codeField, mappingTable, emailsTable, dseRefMap, emailsByCode, displayRows };
  };

  // ── Bangun 1 worksheet (gaya SAMA PERSIS dgn handleDownloadEmails
  // per-role) utk baris displayRows yg region-nya cocok. ──────────────────
  const buildSheet = (ExcelJS, wb, sheetName, isMc, rowsForRegion, emailsByCode) => {
    const head = isMc
      ? ["Circle", "Region", "Area", "District", "#", "Nama Admin", "Email Admin"]
      : ["Circle", "Region", "Branch", "#", "Nama Admin", "Email Admin"];
    const mergeCols = isMc ? [1, 2, 3, 4] : [1, 2, 3];
    const lastCol = isMc ? 7 : 6;
    const goldFromCol = isMc ? 6 : 5;
    const MAX_SLOTS = 4;

    const blocks = [];
    rowsForRegion.forEach((r) => {
      const emails = (emailsByCode.get(r.code.toLowerCase()) || []).filter((e) => e.active !== false);
      const filledSlots = emails.slice(0, MAX_SLOTS).map((e) => ({ e, filled: true }));
      const emptySlots = Array.from({ length: Math.max(MAX_SLOTS - filledSlots.length, 0) }, () => ({ e: null, filled: false }));
      const slots = [...filledSlots, ...emptySlots];
      blocks.push({
        rowCount: slots.length,
        rows: slots.map((slot, i) => {
          const { e, filled } = slot;
          const base = isMc ? [r.circle || "", r.region || "", r.branch || "", r.code || ""] : [r.circle || "", r.region || "", r.code || ""];
          return [...base, i + 1, filled ? (e.label || r.full_name || `Admin ${i + 1}`) : "Kosong", filled ? (e.email || "") : "—"];
        }),
      });
    });
    const totalRows = blocks.reduce((n, b) => n + b.rowCount, 0);

    // Nama sheet Excel maks 31 karakter & tidak boleh ada :\/?*[]
    const safeName = sheetName.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
    const ws = wb.addWorksheet(safeName);
    ws.columns = isMc
      ? [{ width: 14 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 4 }, { width: 28 }, { width: 30 }]
      : [{ width: 14 }, { width: 18 }, { width: 22 }, { width: 4 }, { width: 28 }, { width: 30 }];
    const thinBorder = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    const RED = "FFC00000";
    const GOLD = "FFE8A33D";
    const headerRow = ws.addRow(head);
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colNumber < goldFromCol ? RED : GOLD } };
    });
    headerRow.height = 22;
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: lastCol } };

    if (totalRows === 0) {
      const emptyRow = ws.addRow(new Array(lastCol).fill(""));
      emptyRow.eachCell((cell) => { cell.border = thinBorder; });
    } else {
      blocks.forEach((block) => {
        const startRow = ws.rowCount + 1;
        block.rows.forEach((r) => {
          const row = ws.addRow(r);
          row.eachCell((cell) => { cell.border = thinBorder; });
        });
        const endRow = ws.rowCount;
        for (let col = mergeCols.length + 1; col <= lastCol; col++) {
          const topCell = ws.getCell(startRow, col);
          topCell.border = { ...topCell.border, top: { style: "medium" } };
          const bottomCell = ws.getCell(endRow, col);
          bottomCell.border = { ...bottomCell.border, bottom: { style: "medium" } };
        }
        const applyMergedBorder = (col) => {
          const cell = ws.getCell(startRow, col);
          cell.alignment = { vertical: "middle", horizontal: "left" };
          cell.border = { top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: "medium" } };
        };
        if (endRow > startRow) {
          mergeCols.forEach((col) => { ws.mergeCells(startRow, col, endRow, col); applyMergedBorder(col); });
        } else {
          mergeCols.forEach((col) => applyMergedBorder(col));
        }
      });
    }
    return totalRows;
  };

  const handleExport = async () => {
    const selected = EXPORT_ROLES.filter((r) => checkedRoles[r.k]);
    if (selected.length === 0) { setToast({ msg: "Pilih minimal 1 role (Admin MC / Admin Area) dulu.", type: "error" }); return; }
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      let sheetCount = 0, rowTotal = 0;
      for (const role of selected) {
        const { isMc, dseRefMap, emailsByCode, displayRows } = await loadRoleData(role.k);
        // Region diambil LIVE dari data (bukan hardcode) - urut alfabet
        // supaya konsisten & otomatis nambah kalau ada Region baru.
        const regions = Array.from(new Set(displayRows.map((r) => r.region).filter(Boolean))).sort();
        const noRegionRows = displayRows.filter((r) => !r.region);
        for (const region of regions) {
          const rowsForRegion = displayRows.filter((r) => r.region === region);
          const n = buildSheet(ExcelJS, wb, `${role.sheetPrefix} - ${region}`, isMc, rowsForRegion, emailsByCode);
          sheetCount++; rowTotal += n;
        }
        if (noRegionRows.length) {
          const n = buildSheet(ExcelJS, wb, `${role.sheetPrefix} - Lainnya`, isMc, noRegionRows, emailsByCode);
          sheetCount++; rowTotal += n;
        }
      }
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `User_Management_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({ msg: `Export selesai — ${sheetCount} sheet, ${rowTotal} baris total.`, type: "ok" });
    } catch (e) {
      setToast({ msg: e.message || "Gagal export.", type: "error" });
    } finally {
      setExporting(false);
    }
  };

  // ── Upload balik (multi-sheet, per Region, per role) ────────────────────
  // Sheet dikenali dari PREFIX nama sheetnya ("Admin MC ..." / "Admin Area
  // ..." - case-insensitive, jadi tetap kebaca walau sheet sempat di-rename
  // sedikit atau breakdown per Region-nya diubah manual). Sheet lain/tidak
  // dikenal dilewati & dilaporkan, tidak bikin proses gagal total.
  const processSheet = async (roleKey, sheetRowsRaw) => {
    const isMc = roleKey === "finance_mpx";
    const mappingTable = isMc ? "mf_dse_admin_mc_mapping" : "mf_dse_admin_area_mapping";
    const emailsTable = isMc ? "mf_dse_admin_mc_emails" : "mf_dse_admin_area_emails";
    const { dseRefMap, displayRows } = await loadRoleData(roleKey);

    const knownByKey = new Map();
    displayRows.forEach((r) => knownByKey.set(r.code.toLowerCase(), r.code));

    const header = sheetRowsRaw[0].map((h) => String(h || "").trim().toLowerCase());
    // FIX (audit - file export District/Area di-rename labelnya dari
    // "MC"/"Branch" jadi "District"/"Area" di Update 3, tapi regex upload
    // lama BELUM diupdate, jadi upload balik file hasil export sendiri
    // gagal "kolom wajib tidak ditemukan" - diperbaiki sekalian di sini,
    // regex-nya terima SEMUA label yg mungkin muncul di export.
    const idxCode = isMc
      ? header.findIndex((h) => /micro ?cluster|^mc$|district/.test(h))
      : header.findIndex((h) => /^branch$|area/.test(h));
    const idxLabel = header.findIndex((h) => /nama admin|label/.test(h));
    const idxEmail = header.findIndex((h) => /email/.test(h));
    if (idxCode === -1 || idxEmail === -1) {
      return { ok: false, error: `Kolom wajib (${isMc ? "District/MC" : "Branch/Area"} & Email) tidak ditemukan.` };
    }

    let addedCount = 0, skippedCount = 0, notFoundCount = 0, touched = 0;
    const notFoundSample = [];
    for (let i = 1; i < sheetRowsRaw.length; i++) {
      const line = sheetRowsRaw[i];
      const codeRaw = String(line[idxCode] || "").trim();
      if (!codeRaw) continue;
      const codeKey = codeRaw.toLowerCase();
      const code = knownByKey.get(codeKey);
      if (!code) { notFoundCount++; if (notFoundSample.length < 5) notFoundSample.push(codeRaw); continue; }
      const labelRaw = idxLabel >= 0 ? String(line[idxLabel] || "").trim() : "";
      const emailCell = String(line[idxEmail] || "").trim();
      if (!emailCell) continue;
      const pieces = splitEmailCell(emailCell);
      if (!pieces.length) { skippedCount++; continue; }

      // ensureMappingRow - sama logic AdminMcMapping/AdminAreaMapping:
      // upsert mapping row (circle/region dari dseRefMap) baru ambil id-nya.
      const ref = dseRefMap.get(codeKey);
      const payload = isMc
        ? { mc: code, active: true, circle: ref?.circle || null, region: ref?.region || null, branch: ref?.branch || null }
        : { branch: code, active: true, circle: ref?.circle || null, region: ref?.region || null };
      const { data: mapping, error: mapErr } = await supabase.from(mappingTable)
        .upsert(payload, { onConflict: isMc ? "mc" : "branch" }).select().single();
      if (mapErr) { skippedCount += pieces.length; continue; }
      touched++;
      for (const piece of pieces) {
        const label = pieces.length > 1 && piece.label ? piece.label.toUpperCase() : (labelRaw || piece.label || null);
        const { error } = await supabase.from(emailsTable)
          .upsert({ mapping_id: mapping.id, email: piece.email, label, active: true }, { onConflict: "mapping_id,email" })
          .select();
        if (error && String(error.code) !== "23505") { skippedCount++; continue; }
        addedCount++;
      }
    }
    return { ok: true, addedCount, skippedCount, notFoundCount, touched, notFoundSample };
  };

  const handleUploadFile = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      if (!wb.SheetNames.length) throw new Error("File kosong.");

      const summaryLines = [];
      let grandAdded = 0, grandNotFound = 0, sheetsSkipped = 0;
      for (const name of wb.SheetNames) {
        const lower = name.toLowerCase();
        const role = EXPORT_ROLES.find((r) => lower.startsWith(r.sheetPrefix.toLowerCase()));
        if (!role) { sheetsSkipped++; continue; }
        const ws = wb.Sheets[name];
        const rowsRaw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (!rowsRaw.length) { summaryLines.push(`"${name}": kosong, dilewati.`); continue; }
        const res = await processSheet(role.k, rowsRaw);
        if (!res.ok) { summaryLines.push(`"${name}": GAGAL — ${res.error}`); continue; }
        grandAdded += res.addedCount; grandNotFound += res.notFoundCount;
        const parts = [`${res.addedCount} email pada ${res.touched} ${role.k === "finance_mpx" ? "MC" : "Area"}`];
        if (res.skippedCount) parts.push(`${res.skippedCount} dilewati`);
        if (res.notFoundCount) parts.push(`${res.notFoundCount} tidak ditemukan (${res.notFoundSample.join(", ")}${res.notFoundCount > res.notFoundSample.length ? ", ..." : ""})`);
        summaryLines.push(`"${name}": ${parts.join(", ")}.`);
      }
      if (sheetsSkipped) summaryLines.push(`${sheetsSkipped} sheet tidak dikenali (nama harus diawali "Admin MC" atau "Admin Area"), dilewati.`);
      setToast({ msg: `Upload selesai.\n${summaryLines.join("\n")}`, type: grandNotFound ? "warn" : "ok" });
    } catch (e) {
      setToast({ msg: e.message || "Gagal mengupload file.", type: "error" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div style={{ fontFamily: FONT, color: t.hi, borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, marginBottom: 20, overflow: "hidden" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: 16, background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
        <FileSpreadsheet size={19} color={t.teal} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: t.hi }}>Export &amp; Upload Gabungan</div>
          <div style={{ fontSize: 12, color: t.mid, marginTop: 1 }}>Gabungkan Admin MC &amp; Admin Area dalam 1 file Excel, dipecah per Region per sheet.</div>
        </div>
        {open ? <ChevronUp size={16} color={t.lo} /> : <ChevronDown size={16} color={t.lo} />}
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {EXPORT_ROLES.map((r) => (
              <label key={r.k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: t.hi, cursor: "pointer" }}>
                <input type="checkbox" checked={!!checkedRoles[r.k]} onChange={() => toggleRole(r.k)} style={{ width: 16, height: 16, accentColor: t.teal, cursor: "pointer" }} />
                {r.label}
              </label>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button onClick={handleExport} disabled={exporting} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${t.teal}`, background: t.card, color: t.teal, fontSize: 12.5, fontWeight: 700, cursor: exporting ? "default" : "pointer", opacity: exporting ? 0.6 : 1 }}>
              {exporting ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />} {exporting ? "Membuat file…" : "Export Excel (per Region)"}
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={importing} style={{ display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${t.inputBd}`, background: t.sub, color: t.hi, fontSize: 12.5, fontWeight: 700, cursor: importing ? "default" : "pointer", opacity: importing ? 0.6 : 1 }}>
              {importing ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {importing ? "Mengupload…" : "Upload Excel"}
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => handleUploadFile(e.target.files?.[0])} />
          </div>
          <div style={{ fontSize: 11.5, color: t.mid, lineHeight: 1.5 }}>
            Export akan membuat 1 file Excel berisi beberapa sheet — 1 sheet per Region untuk setiap role yang dicentang. Upload menerima file dengan format yang sama (nama sheet harus diawali &quot;Admin MC&quot; atau &quot;Admin Area&quot;) — baris dengan MC/Branch yang tidak ditemukan akan dilewati, tidak membuat MC/Branch baru.
          </div>
        </div>
      )}
    </div>
  );
}
