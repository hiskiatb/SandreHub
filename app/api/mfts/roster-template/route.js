// POST { rows:[{key,brand,id_im3,id_3id,id_staffinc,nama_dsf,mc,branch,region,circle,id_tl,nama_tl}], scope }
// → .xlsx roster DSF. Kolom identitas (Key/Brand/MC/Branch/Region/Circle) TERKUNCI;
//   kolom isian DSF/TL (ID_DSF_IM3, ID_DSF_3ID, ID_STAFFINC, NAMA_DSF, ID_STAFFINC_TL, NAMA_TL)
//   bersorot kuning & bisa diedit. Pencocokan saat unggah balik via kolom Key (= seat_id).
//   Satu baris per seat (sesuai alokasi); seat vacant tetap muncul (kolom DSF kosong).
//   Hybrid = 1 baris (Brand "Hybrid"), ID_DSF_IM3 & ID_DSF_3ID terpisah → tidak double.
import ExcelJS from "exceljs";

export const runtime = "nodejs";

// urutan kolom sesuai permintaan (Key disisipkan paling depan utk matching)
const HEAD = ["Key", "BRAND", "ID_DSF_IM3", "ID_DSF_3ID", "ID_STAFFINC", "NAMA_DSF", "MC", "BRANCH", "REGION", "CIRCLE", "ID_STAFFINC_TL", "NAMA_TL"];
// kolom editable (1-based): ID_DSF_IM3(3), ID_DSF_3ID(4), ID_STAFFINC(5), NAMA_DSF(6), ID_STAFFINC_TL(11), NAMA_TL(12)
const EDITABLE = new Set([3, 4, 5, 6, 11, 12]);

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const scope = body?.scope ? String(body.scope) : "";

  const wb = new ExcelJS.Workbook();
  wb.creator = "SandraHub · MFTS";
  const ws = wb.addWorksheet("Roster DSF", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });

  ws.columns = [
    { width: 26 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 24 },
    { width: 22 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 24 },
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
      r.key || "", r.brand || "", r.id_im3 || "", r.id_3id || "", r.id_staffinc || "", r.nama_dsf || "",
      r.mc || "", r.branch || "", r.region || "", r.circle || "", r.id_tl || "", r.nama_tl || "",
    ]);
    row.eachCell((cell, col) => {
      const editable = EDITABLE.has(col);
      cell.protection = { locked: !editable };
      if (col === 1) cell.font = { color: { argb: "FF9AA0A6" }, size: 9 }; // Key abu-abu
      if (editable) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8E1" } }; // sorot kuning
    });
  });

  ws.autoFilter = { from: { row: 1, column: 2 }, to: { row: 1, column: 12 } };

  await ws.protect("", {
    selectLockedCells: true, selectUnlockedCells: true,
    formatCells: false, formatColumns: false, formatRows: false,
    insertColumns: false, insertRows: false, deleteColumns: false, deleteRows: false,
    sort: true, autoFilter: true, pivotTables: false,
  });

  const buf = await wb.xlsx.writeBuffer();
  const fname = `roster_DSF${scope ? "_" + scope.replace(/\s+/g, "_") : ""}.xlsx`;
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
