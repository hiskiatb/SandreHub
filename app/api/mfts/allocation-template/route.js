// POST { rows:[{brand,mc_cluster,branch,area,region,target}], mtype }
// → file .xlsx dengan kolom kunci TERKUNCI (sheet protected); hanya kolom
//   Target yang bisa diisi. Kolom "Key" (brand|mc_cluster) disediakan untuk
//   XLOOKUP dari file Excel sumber. Route ini hanya memformat data yang
//   sudah dikirim klien (scope sudah ditegakkan RLS saat klien mengambil data).
import ExcelJS from "exceljs";

export const runtime = "nodejs";

const HEAD = ["Key", "Brand", "MC/Cluster", "Branch", "Area", "Region", "Target"];

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const mtype = String(body?.mtype || "DSF");
  const scope = body?.scope ? String(body.scope) : "";
  const period = body?.period ? String(body.period) : "";

  const wb = new ExcelJS.Workbook();
  wb.creator = "SandraHub · MFTS";
  const ws = wb.addWorksheet(period ? `Alokasi ${period}` : "Alokasi", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });

  ws.columns = [
    { key: "key", width: 30 }, { key: "brand", width: 9 }, { key: "mc_cluster", width: 26 },
    { key: "branch", width: 18 }, { key: "area", width: 22 }, { key: "region", width: 18 }, { key: "target", width: 11 },
  ];

  // Header
  const h = ws.addRow(HEAD);
  h.height = 22;
  h.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A9E90" } };
    c.alignment = { vertical: "middle", horizontal: c.col === 7 ? "center" : "left" };
    c.protection = { locked: true };
    c.border = { bottom: { style: "thin", color: { argb: "FF0E6F65" } } };
  });

  rows.forEach((r) => {
    const brand = String(r.brand || "");
    const cluster = String(r.mc_cluster || "");
    const row = ws.addRow({
      key: `${brand}|${cluster}`, brand, mc_cluster: cluster,
      branch: r.branch || "", area: r.area || "", region: r.region || "",
      target: Number.isFinite(+r.target) ? +r.target : 0,
    });
    row.eachCell((cell, col) => {
      cell.protection = { locked: col !== 7 }; // hanya Target (kolom 7) yang bisa diedit
      if (col === 1) cell.font = { color: { argb: "FF9AA0A6" }, size: 10 }; // Key abu-abu
      if (col === 7) {
        cell.numFmt = "0";
        cell.alignment = { horizontal: "center" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8E1" } }; // sorot kuning lembut
        cell.dataValidation = {
          type: "whole", operator: "greaterThanOrEqual", formulae: [0],
          allowBlank: true, showErrorMessage: true, errorTitle: "Target tidak valid", error: "Isi angka bulat ≥ 0.",
        };
      }
    });
  });

  ws.autoFilter = { from: { row: 1, column: 2 }, to: { row: 1, column: 6 } };

  await ws.protect("", {
    selectLockedCells: true, selectUnlockedCells: true,
    formatCells: false, formatColumns: false, formatRows: false,
    insertColumns: false, insertRows: false, insertHyperlinks: false,
    deleteColumns: false, deleteRows: false, sort: true, autoFilter: true, pivotTables: false,
  });

  const buf = await wb.xlsx.writeBuffer();
  const fname = `alokasi_${mtype}${period ? "_" + period : ""}${scope ? "_" + scope.replace(/\s+/g, "_") : ""}.xlsx`;
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
