// POST { rows:[{key,posisi,cluster,branch,region,seat,stage,priority,agency,target,status,note}],
//        stages:[], priorities:[], statuses:[], agencies:[], scope }
// → .xlsx dengan kolom identitas TERKUNCI (Key/Posisi/Cluster/Cabang/Region/Seat) dan
//   kolom editable (Stage/Prioritas/Agency/Target Date/Status/Catatan) bersorot kuning.
//   Dropdown (data validation) Stage/Prioritas/Agency/Status mengacu ke sheet "ref" tersembunyi.
//   Pencocokan saat unggah balik memakai kolom Key (= vacancy id).
import ExcelJS from "exceljs";

export const runtime = "nodejs";

const HEAD = ["Key", "Posisi", "Cluster", "Cabang", "Region", "Seat ID", "Stage", "Prioritas", "Agency", "Target Date", "Status", "Catatan"];
const EDIT_FROM = 7; // kolom 7..12 editable

const colLetter = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const stages = (body?.stages || []).map(String);
  const priorities = (body?.priorities || ["Normal", "High", "Critical"]).map(String);
  const statuses = (body?.statuses || ["Open", "On-Hold", "Closed-Filled"]).map(String);
  const agencies = (body?.agencies || []).map(String);
  const scope = body?.scope ? String(body.scope) : "";

  const wb = new ExcelJS.Workbook();
  wb.creator = "SandraHub · MFTS";
  const ws = wb.addWorksheet("Vacancy", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });

  // Sheet referensi tersembunyi untuk dropdown
  const ref = wb.addWorksheet("ref", { state: "veryHidden" });
  const putCol = (arr, col) => arr.forEach((v, i) => { ref.getCell(i + 1, col).value = v; });
  putCol(stages, 1); putCol(priorities, 2); putCol(statuses, 3); putCol(agencies, 4);
  const rng = (col, len) => `ref!$${colLetter(col)}$1:$${colLetter(col)}$${Math.max(1, len)}`;

  ws.columns = [
    { width: 34 }, { width: 24 }, { width: 20 }, { width: 18 }, { width: 16 }, { width: 22 },
    { width: 24 }, { width: 12 }, { width: 22 }, { width: 14 }, { width: 16 }, { width: 30 },
  ];

  const h = ws.addRow(HEAD);
  h.height = 22;
  h.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A9E90" } };
    c.alignment = { vertical: "middle" };
    c.protection = { locked: true };
    c.border = { bottom: { style: "thin", color: { argb: "FF0E6F65" } } };
  });

  rows.forEach((r) => {
    const row = ws.addRow([
      r.key || "", r.posisi || "", r.cluster || "", r.branch || "", r.region || "", r.seat || "",
      r.stage || "", r.priority || "", r.agency || "", r.target || "", r.status || "", r.note || "",
    ]);
    row.eachCell((cell, col) => {
      cell.protection = { locked: col < EDIT_FROM };
      if (col === 1) cell.font = { color: { argb: "FF9AA0A6" }, size: 10 }; // Key abu-abu
      if (col >= EDIT_FROM) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8E1" } }; // sorot kuning
    });
    const rn = row.number;
    if (stages.length) ws.getCell(`G${rn}`).dataValidation = { type: "list", allowBlank: true, formulae: [rng(1, stages.length)] };
    if (priorities.length) ws.getCell(`H${rn}`).dataValidation = { type: "list", allowBlank: true, formulae: [rng(2, priorities.length)] };
    if (agencies.length) ws.getCell(`I${rn}`).dataValidation = { type: "list", allowBlank: true, formulae: [rng(4, agencies.length)] };
    if (statuses.length) ws.getCell(`K${rn}`).dataValidation = { type: "list", allowBlank: true, formulae: [rng(3, statuses.length)] };
    ws.getCell(`J${rn}`).numFmt = "yyyy-mm-dd";
  });

  ws.autoFilter = { from: { row: 1, column: 2 }, to: { row: 1, column: 12 } };

  await ws.protect("", {
    selectLockedCells: true, selectUnlockedCells: true,
    formatCells: false, formatColumns: false, formatRows: false,
    insertColumns: false, insertRows: false, deleteColumns: false, deleteRows: false,
    sort: true, autoFilter: true, pivotTables: false,
  });

  const buf = await wb.xlsx.writeBuffer();
  const fname = `vacancy${scope ? "_" + scope.replace(/\s+/g, "_") : ""}.xlsx`;
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}

function json(o, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }
