// lib/payoutDocGenerator.js
// Generate BAST & Surat Pemberitahuan (Notification Letter) Distribution Fee dari template Excel sederhana
// "MPX Document Template". Dokumen keluaran tetap bahasa Indonesia, mengikuti contoh resmi.
//  • Template: sheet "Instructions" (teks), "Partners" (1 baris per partner × tipe), "Branches" (1 baris per branch).
//    Header di baris 1 (nama kolom, tidak peka huruf besar/kecil), data mulai baris 2, kolom lain diabaikan.
//  • Dua format input (dideteksi otomatis):
//     – "Source Data SMS" (sheet BAST & LETTER, header BRAND/TYPE/PARTNER_NAME/BRANCH/…, 1 baris per branch);
//     – "MPX Document Template" lama (sheet Partners & Branches).
//  • Pajak dihitung ulang dari DPP: PPN = 11%, PPh23 = 2% (negatif), Total = DPP + PPN − PPh dari nilai mentah;
//    pembulatan half-up hanya saat tampil, total = jumlah nilai mentah lalu dibulatkan
//    (Total BAST = Total Transfer surat). Template lama: baris total DPP BAST = DPP Total.
//  • PDF: tiap halaman = letterhead (public/payout/letterhead-ioh.pdf) + teks Helvetica.
//    Tidak ada gambar tanda tangan — ruang tanda tangan dibiarkan kosong.

export const LETTERHEAD_URL = "/payout/letterhead-ioh.pdf";

export const DEFAULT_SIGNATORIES = {
  p1Name: "Rengga Permana",
  p1Title: "Head of Channel Operation Sumatera",
  p1Company: "PT INDOSAT,tbk.",
  letterSignerName: "David Ferdinand",
  letterSignerTitle: "SVP - Head of Sales & Distribution Circle Sumatra",
  letterSignerUnit: "Group Sales & Distribution Sumatera",
  city: "Medan",
};

// ── Format ─────────────────────────────────────────────────────────────────
const ID_MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// 635011179 → "Rp.635.011.179"; suffix=true → "Rp.635.011.179.-"; negatif → "-Rp.12.700.224"
// Pembulatan half-up (menjauhi nol) — hanya saat ditampilkan
export const roundHalfUp = (x) => { const v = Number(x) || 0; return Math.sign(v) * Math.round(Math.abs(v)); };

export function rupiah(n, suffix = false) {
  const r = roundHalfUp(n);
  const s = `Rp.${String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${suffix ? ".-" : ""}`;
  return r < 0 ? `-${s}` : s;
}

const str = (v) => (v == null ? "" : v instanceof Date ? v.toISOString() : String(v).replace(/\s+/g, " ").trim());
const numOrNull = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const ppnExact = (dpp) => (dpp * 11) / 12 * 0.12;
const pphExact = (dpp) => dpp * 0.02;

// Tanggal dari sel Excel: Date, serial number, "2026-09-11", "11/09/2026"
export function toDateValue(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), 12));
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30, 12) + v * 864e5);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12));
  return null;
}
// "11 September 2026" (nama bulan Indonesia)
export const idDate = (d) => `${d.getUTCDate()} ${ID_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

// Periode → { ym: "2026-08", month: 7, year: "2026", label: "Agustus 2026" }
export function parsePeriod(v) {
  let y = 0, mo = -1;
  const d = v instanceof Date || typeof v === "number" ? toDateValue(v) : null;
  if (d) { y = d.getUTCFullYear(); mo = d.getUTCMonth(); }
  else {
    const s = str(v).toLowerCase();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})/);
    if (m) { y = +m[1]; mo = +m[2] - 1; }
    else {
      m = s.match(/(\d{1,2})[-/.](\d{4})/);
      if (m) { y = +m[2]; mo = +m[1] - 1; }
      else {
        y = +((s.match(/(19|20)\d{2}/) || [])[0] || 0);
        mo = EN_MONTHS.findIndex((x) => s.includes(x) || s.includes(x.slice(0, 3)));
        if (mo < 0) mo = ID_MONTHS.findIndex((x) => s.includes(x.toLowerCase()));
      }
    }
  }
  if (!y || mo < 0 || mo > 11) return null;
  return { ym: `${y}-${String(mo + 1).padStart(2, "0")}`, month: mo, year: String(y), label: `${ID_MONTHS[mo]} ${y}` };
}

// Kata kunci periode di nama project PO: AUGUST2026 / AGUSTUS2026 / AUG 2026 / AGU-26 …
export function titleMatchesPeriod(title, per) {
  if (!per) return false;
  const s = String(title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const names = [EN_MONTHS[per.month], EN_MONTHS[per.month].slice(0, 3), ID_MONTHS[per.month].toLowerCase(), ID_MONTHS[per.month].toLowerCase().slice(0, 3)];
  return names.some((n) => s.includes(`${n}${per.year}`) || s.includes(`${n}${per.year.slice(2)}`));
}

// ── Template: kolom ────────────────────────────────────────────────────────
export const PARTNER_COLS = [
  "Type", "Partner", "Period", "Document Date", "Letter No", "Recipient Title", "Claim Deadline",
  "Signer Name", "Signer Title", "SLA", "Territory Development Support", "Tactical & TURS", "Sales Margin",
  "Other", "DPP Total", "PO Number", "Notes",
];
export const BRANCH_COLS = ["Type", "Partner", "Branch", "DPP"];
const REQUIRED = ["Type", "Partner", "Period", "Document Date", "Letter No", "Recipient Title", "Claim Deadline", "Signer Name", "Signer Title"];
const COMPONENTS = ["SLA", "Territory Development Support", "Tactical & TURS", "Sales Margin", "Other"];
export const INSTRUCTIONS = [
  "MPX Document Template — BAST & Notification Letter",
  "Fill one row per partner and type in 'Partners', and one row per branch in 'Branches'. Upload the file in Payout Tracker → Document Upload & Merge → Generate BAST & Letters.",
  "Type: MPC or MP3.",
  "Partner: company name exactly as on the PO (e.g. ULTIMA MULTIMEDIA JAYA, PT).",
  "Period: month of the fee as YYYY-MM (e.g. 2026-08). Printed as 'Agustus 2026'.",
  "Document Date: date printed on the BAST and the letter (Excel date).",
  "Letter No, Recipient Title (e.g. Mitra Pengelola Cluster / Master Partner 3), Claim Deadline (Excel date).",
  "Signer Name / Signer Title: the partner's signatory (PIHAK KEDUA on the BAST).",
  "SLA, Territory Development Support, Tactical & TURS, Sales Margin, Other: DPP components in rupiah (0 if none; Other is optional).",
  "DPP Total: optional. Leave empty to use the sum of the components; if filled, it must match within Rp 1.",
  "PO Number: optional. Fill it to attach the documents to that PO; otherwise the app matches by partner and amount.",
  "One row per branch: Type, Partner, Branch, DPP. Branch DPPs must add up to the DPP Total of that partner and type.",
  "The app calculates PPN (11/12 × 12%), PPh23 (2%) and totals. Do not add tax columns.",
];

const norm = (h) => String(h ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const pairKey = (type, partner) => `${String(type).toUpperCase()}|${String(partner).replace(/\s+/g, " ").trim().toUpperCase()}`;

// Baris sheet → objek { "Type": …, "Partner": … } berdasarkan header baris 1
function sheetObjects(XLSX, wb, name, cols) {
  const wsName = wb.SheetNames.find((n) => norm(n) === norm(name));
  if (!wsName) return null;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { header: 1, raw: true, defval: null });
  if (!rows.length) return [];
  const idx = {};
  rows[0].forEach((h, i) => { const c = cols.find((x) => norm(x) === norm(h)); if (c && idx[c] == null) idx[c] = i; });
  return rows.slice(1).map((r, n) => {
    const o = { _row: n + 2 };
    cols.forEach((c) => { o[c] = idx[c] == null ? null : r[idx[c]]; });
    return o;
  }).filter((o) => cols.some((c) => c !== "Notes" && o[c] != null && String(o[c]).trim() !== ""));
}

async function readWorkbook(data) {
  const mod = await import("xlsx");
  const XLSX = mod.default || mod;
  return { XLSX, wb: XLSX.read(data, { type: "array", cellDates: true }) };
}

// ── Template: parse & validasi ─────────────────────────────────────────────
// → [{ key, type, partner, period, per, dpp, poRef, letter, bast, errors[], warnings[], row }]
export async function parseTemplateWorkbook(data) {
  const { XLSX, wb } = await readWorkbook(data);
  const partners = sheetObjects(XLSX, wb, "Partners", PARTNER_COLS);
  const branches = sheetObjects(XLSX, wb, "Branches", BRANCH_COLS) || [];
  if (!partners) throw new Error('This is not an MPX Document Template (sheet "Partners" not found). Use "Download template" to get the correct format.');

  const byPair = new Map();
  branches.forEach((b) => {
    const k = pairKey(str(b.Type), str(b.Partner));
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(b);
  });

  const out = [];
  const seen = new Set();
  for (const r of partners) {
    const errors = [], warnings = [];
    const type = str(r.Type).toUpperCase();
    const partner = str(r.Partner);
    REQUIRED.forEach((c) => { if (r[c] == null || str(r[c]) === "") errors.push(`${c} is required.`); });
    if (type && !["MPC", "MP3"].includes(type)) errors.push(`Unknown Type "${r.Type}" (use MPC or MP3).`);
    const per = parsePeriod(r.Period);
    if (r.Period != null && str(r.Period) && !per) errors.push(`Period "${str(r.Period)}" is not valid (use YYYY-MM).`);
    const docDate = toDateValue(r["Document Date"]);
    if (r["Document Date"] != null && str(r["Document Date"]) && !docDate) errors.push("Document Date is not a valid date.");
    const deadline = toDateValue(r["Claim Deadline"]);
    if (r["Claim Deadline"] != null && str(r["Claim Deadline"]) && !deadline) errors.push("Claim Deadline is not a valid date.");

    const comp = {};
    COMPONENTS.forEach((c) => {
      const v = numOrNull(r[c]);
      if (r[c] != null && str(r[c]) !== "" && v == null) errors.push(`${c} is not a number.`);
      comp[c] = v || 0;
    });
    if (COMPONENTS.slice(0, 4).every((c) => r[c] == null || str(r[c]) === "")) errors.push("DPP components (SLA, Territory Development Support, Tactical & TURS, Sales Margin) are empty.");
    const sumComp = COMPONENTS.reduce((s, c) => s + comp[c], 0);
    const dppIn = numOrNull(r["DPP Total"]);
    const dpp = dppIn != null ? dppIn : Math.floor(sumComp);
    if (dppIn != null && Math.abs(dppIn - sumComp) > 1) warnings.push(`DPP Total ${rupiah(dppIn)} differs from the sum of components ${rupiah(sumComp)}.`);

    const key = pairKey(type, partner);
    if (seen.has(key)) errors.push(`Duplicate row for ${partner} ${type}.`);
    seen.add(key);

    const brRows = byPair.get(key) || [];
    const br = brRows.map((b) => {
      const d = numOrNull(b.DPP);
      if (!str(b.Branch)) errors.push(`Branches row ${b._row}: Branch name is empty.`);
      if (d == null) errors.push(`Branches row ${b._row}: DPP is empty or not a number.`);
      const dv = d || 0;
      return { name: str(b.Branch), dpp: dv, ppn: ppnExact(dv), pph: -pphExact(dv), total: dv + ppnExact(dv) - pphExact(dv) };
    });
    if (!brRows.length) errors.push(`No rows in "Branches" for ${partner || "this partner"} ${type}.`);
    const brSum = br.reduce((s, b) => s + b.dpp, 0);
    if (brRows.length && Math.abs(brSum - dpp) > 1) errors.push(`Branch DPPs add up to ${rupiah(brSum)} but DPP Total is ${rupiah(dpp)}.`);
    if (br.length > 4) warnings.push(`${br.length} branches — the BAST table may need a second page.`);

    const periodLabel = per?.label || "";
    const ppn = ppnExact(dpp);
    const pph = pphExact(dpp);
    const letter = {
      kind: "letter", type, partner, period: periodLabel,
      date: docDate ? idDate(docDate) : "", recipientTitle: str(r["Recipient Title"]), letterNo: str(r["Letter No"]),
      sla: comp.SLA, tds: comp["Territory Development Support"], tactical: comp["Tactical & TURS"],
      salesMargin: comp["Sales Margin"], other: comp.Other,
      dpp, branches: br.map((b) => b.name).filter(Boolean).join(", "),
      ppn, pph, total: dpp + ppn - pph,   // nilai mentah; dibulatkan saat tampil
      deadline: deadline ? idDate(deadline) : "",
    };
    const bast = {
      kind: "bast", type, partner, period: periodLabel,
      day: docDate ? String(docDate.getUTCDate()) : "", month: docDate ? String(docDate.getUTCMonth() + 1) : "", year: docDate ? String(docDate.getUTCFullYear()) : "",
      signerName: str(r["Signer Name"]), signerTitle: str(r["Signer Title"]),
      branches: br,
      totals: { dpp, ppn: br.reduce((s, b) => s + b.ppn, 0), pph: br.reduce((s, b) => s + b.pph, 0), total: br.reduce((s, b) => s + b.total, 0) },
    };
    const carry = {
      type, partner, letterNo: letter.letterNo, recipientTitle: letter.recipientTitle,
      signerName: bast.signerName, signerTitle: bast.signerTitle,
      docDay: docDate ? docDate.getUTCDate() : null, deadlineDay: deadline ? deadline.getUTCDate() : null,
      branchNames: br.map((b) => b.name).filter(Boolean),
    };
    out.push({ key, type, partner, period: periodLabel, per, dpp, poRef: str(r["PO Number"]), letter, bast, errors, warnings, row: r._row, carry });
  }
  // Branches tanpa baris Partners
  for (const [k, rows] of byPair) {
    if (!out.some((p) => p.key === k)) {
      out.push({ key: k, type: str(rows[0].Type).toUpperCase(), partner: str(rows[0].Partner), period: "", per: null, dpp: 0, poRef: "", letter: null, bast: null,
        errors: [`Branches rows ${rows.map((x) => x._row).join(", ")} have no matching row in "Partners".`], warnings: [], row: rows[0]._row });
    }
  }
  return out;
}

// ── Format "Source Data SMS" (sheet BAST & LETTER, header di baris ke-n) ─────
// PAYMENT_ID (kolom terakhir) opsional: kalau diisi, menimpa Payment ID otomatis
export const SMS_BAST_COLS = ["BRAND", "TYPE", "ID", "PARTNER_NAME", "BRANCH", "REGION", "REGION_NAMING", "EMAIL_TO", "EMAIL_CC", "DPP", "PPN", "PPH", "TOTAL", "OWNER", "JABATAN", "PAYMENT_ID"];
export const SMS_LETTER_COLS = ["BRAND", "TYPE", "ENTITY", "PARTNER_NAME", "BRANCH", "REGION", "REGION_NAMING", "EMAIL_TO", "EMAIL_CC", "SLA_Fee", "TDS", "SALES_MARGIN", "Distribution_Fee", "PPn", "PPh23", "Total_Transfer", "PAYMENT_ID"];

// Cari sheet yang header-nya memuat semua kolom wajib; header boleh di baris mana pun (≤ 15) dan mulai kolom mana pun
function findHeaderTable(XLSX, wb, must) {
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true });
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const hdr = (rows[i] || []).map((h) => String(h ?? "").trim().toUpperCase());
      if (must.every((m) => hdr.includes(m.toUpperCase()))) {
        const idx = {};
        hdr.forEach((h, c) => { if (h && idx[h] == null) idx[h] = c; });
        return { sheet: name, headerRow: i + 1, idx, rows: rows.slice(i + 1).map((r, n) => ({ r: r || [], rowNo: i + 2 + n })) };
      }
    }
  }
  return null;
}

export async function detectWorkbookFormat(data) {
  const { XLSX, wb } = await readWorkbook(data);
  if (findHeaderTable(XLSX, wb, ["PARTNER_NAME", "SLA_FEE"]) || findHeaderTable(XLSX, wb, ["PARTNER_NAME", "DPP", "OWNER"])) return "sms";
  if (wb.SheetNames.some((n) => norm(n) === "partners")) return "template";
  return "unknown";
}

// Parse format SMS → pasangan dasar (tanpa periode/tanggal/no surat; itu dari modal lewat finalizeSms)
export async function parseSmsWorkbook(data) {
  const { XLSX, wb } = await readWorkbook(data);
  const lt = findHeaderTable(XLSX, wb, ["PARTNER_NAME", "BRANCH", "SLA_FEE", "TDS", "SALES_MARGIN"]);
  const bt = findHeaderTable(XLSX, wb, ["PARTNER_NAME", "BRANCH", "DPP"]);
  if (!lt && !bt) throw new Error('No LETTER/BAST sheet found (expected headers such as PARTNER_NAME, BRANCH, SLA_Fee, TDS, SALES_MARGIN, DPP).');
  const map = new Map();
  const get = (type, partner) => {
    const k = pairKey(type, partner);
    if (!map.has(k)) map.set(k, { key: k, type: String(type).toUpperCase(), partner: str(partner), brand: "", paymentId: "", branchMap: new Map(), emailsTo: new Set(), emailsCc: new Set(), signerName: "", signerTitle: "", warnings: [], errors: [], hasLetter: false, hasBast: false });
    return map.get(k);
  };
  const branchOf = (p, name) => {
    const k = name.toUpperCase();
    if (!p.branchMap.has(k)) p.branchMap.set(k, { name, letter: null, bastDpp: null });
    return p.branchMap.get(k);
  };
  const addEmails = (set, v) => String(v ?? "").split(/[;,\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /@/.test(e)).forEach((e) => set.add(e));
  const numCell = (p, v, label, rowNo, sheet) => {
    if (v == null || v === "") return 0;
    const n = numOrNull(v);
    if (n == null) { p.warnings.push(`${sheet} row ${rowNo}: ${label} "${v}" is not a number (treated as 0).`); return 0; }
    return n;
  };
  const cell = (t, row, col) => { const i = t.idx[col.toUpperCase()]; return i == null ? null : row[i]; };
  const orphan = [];

  if (lt) for (const { r, rowNo } of lt.rows) {
    const partner = str(cell(lt, r, "PARTNER_NAME")), branch = str(cell(lt, r, "BRANCH")), type = str(cell(lt, r, "TYPE")).toUpperCase();
    if (!partner && !branch && !type) continue;
    if (!partner || !branch || !type) { orphan.push(`LETTER row ${rowNo}: ${!partner ? "partner" : !branch ? "branch" : "type"} is empty — row skipped.`); continue; }
    const p = get(type, partner);
    p.hasLetter = true;
    p.brand = p.brand || str(cell(lt, r, "BRAND"));
    p.paymentId = p.paymentId || str(cell(lt, r, "PAYMENT_ID")).toUpperCase();
    addEmails(p.emailsTo, cell(lt, r, "EMAIL_TO")); addEmails(p.emailsCc, cell(lt, r, "EMAIL_CC"));
    const b = branchOf(p, branch);
    const sla = numCell(p, cell(lt, r, "SLA_Fee"), "SLA_Fee", rowNo, "LETTER");
    const tds = numCell(p, cell(lt, r, "TDS"), "TDS", rowNo, "LETTER");
    const sm = numCell(p, cell(lt, r, "SALES_MARGIN"), "SALES_MARGIN", rowNo, "LETTER");
    b.letter = b.letter ? { sla: b.letter.sla + sla, tds: b.letter.tds + tds, sm: b.letter.sm + sm } : { sla, tds, sm };
  }
  if (bt) for (const { r, rowNo } of bt.rows) {
    const partner = str(cell(bt, r, "PARTNER_NAME")), branch = str(cell(bt, r, "BRANCH")), type = str(cell(bt, r, "TYPE")).toUpperCase();
    if (!partner && !branch && !type) continue;
    if (!partner || !branch || !type) { orphan.push(`BAST row ${rowNo}: ${!partner ? "partner" : !branch ? "branch" : "type"} is empty — row skipped.`); continue; }
    const p = get(type, partner);
    p.hasBast = true;
    p.brand = p.brand || str(cell(bt, r, "BRAND"));
    p.paymentId = p.paymentId || str(cell(bt, r, "PAYMENT_ID")).toUpperCase();
    addEmails(p.emailsTo, cell(bt, r, "EMAIL_TO")); addEmails(p.emailsCc, cell(bt, r, "EMAIL_CC"));
    p.signerName = p.signerName || str(cell(bt, r, "OWNER"));
    p.signerTitle = p.signerTitle || str(cell(bt, r, "JABATAN"));
    const b = branchOf(p, branch);
    b.bastDpp = (b.bastDpp || 0) + numCell(p, cell(bt, r, "DPP"), "DPP", rowNo, "BAST");
  }

  const pairs = [...map.values()].map((p) => {
    if (!["MPC", "MP3"].includes(p.type)) p.errors.push(`Unknown TYPE "${p.type}" (use MPC or MP3).`);
    if (!p.hasLetter) p.errors.push("No rows in the LETTER sheet for this partner and type — the Notification Letter cannot be built.");
    if (!p.hasBast) p.warnings.push("No rows in the BAST sheet — BAST uses DPP = SLA + TDS + Sales Margin from the LETTER sheet.");
    const branches = [...p.branchMap.values()].map((b) => {
      const comp = b.letter ? b.letter.sla + b.letter.tds + b.letter.sm : null;
      if (b.letter && b.bastDpp != null && Math.abs(b.bastDpp - comp) > 1) p.warnings.push(`${b.name}: BAST DPP ${rupiah(b.bastDpp)} ≠ SLA + TDS + Sales Margin ${rupiah(comp)} (LETTER value used).`);
      if (!b.letter && p.hasLetter) p.warnings.push(`${b.name}: only in the BAST sheet (no LETTER row).`);
      if (b.letter && b.bastDpp == null && p.hasBast) p.warnings.push(`${b.name}: only in the LETTER sheet (no BAST row).`);
      const dpp = comp != null ? comp : b.bastDpp || 0;
      return { name: b.name, dpp, sla: b.letter?.sla || 0, tds: b.letter?.tds || 0, sm: b.letter?.sm || 0 };
    });
    const sum = (k) => branches.reduce((s, b) => s + b[k], 0);
    return {
      format: "sms", key: p.key, type: p.type, brand: p.brand, partner: p.partner, paymentId: p.paymentId,
      branches, sla: sum("sla"), tds: sum("tds"), sm: sum("sm"), dpp: sum("dpp"),
      emailsTo: [...p.emailsTo], emailsCc: [...p.emailsCc],
      signerName: p.signerName, signerTitle: p.signerTitle,
      errors: p.errors, warnings: p.warnings,
    };
  });
  pairs.sort((a, b) => a.type.localeCompare(b.type) || a.partner.localeCompare(b.partner));
  return { pairs, notices: orphan };
}

export const DEFAULT_RECIPIENT = { MPC: "Mitra Pengelola Cluster", MP3: "Master Partner 3" };

// Lengkapi pasangan SMS dengan data dari modal: periode, tanggal dokumen, batas klaim, no surat, penerima, penanda tangan cadangan
export function finalizeSms(p, meta) {
  const per = meta.per || null;
  const period = per?.label || "";
  const signerName = p.signerName || meta.fallbackSigner?.[p.key]?.name || "";
  const signerTitle = p.signerTitle || meta.fallbackSigner?.[p.key]?.title || "";
  const d = meta.docDate, dl = meta.deadline;
  const branchRows = p.branches.map((b) => ({ name: b.name, dpp: b.dpp, ppn: ppnExact(b.dpp), pph: -pphExact(b.dpp), total: b.dpp + ppnExact(b.dpp) - pphExact(b.dpp) }));
  const sum = (k) => branchRows.reduce((s, b) => s + b[k], 0);
  const letter = {
    kind: "letter", format: "sms", hideTactical: true, type: p.type, partner: p.partner, period,
    date: d ? idDate(d) : "", recipientTitle: meta.recipientTitle?.[p.type] || DEFAULT_RECIPIENT[p.type] || "",
    letterNo: meta.letterNo || "",
    sla: p.sla, tds: p.tds, tactical: 0, salesMargin: p.sm, other: 0,
    dpp: p.dpp, branches: p.branches.map((b) => b.name).join(", "),
    ppn: ppnExact(p.dpp), pph: pphExact(p.dpp), total: p.dpp + ppnExact(p.dpp) - pphExact(p.dpp),
    deadline: dl ? idDate(dl) : "",
  };
  const bast = {
    kind: "bast", format: "sms", type: p.type, partner: p.partner, period,
    day: d ? String(d.getUTCDate()) : "", month: d ? String(d.getUTCMonth() + 1) : "", year: d ? String(d.getUTCFullYear()) : "",
    signerName, signerTitle, branches: branchRows,
    totals: { dpp: sum("dpp"), ppn: sum("ppn"), pph: sum("pph"), total: sum("total") },
  };
  const errors = [...p.errors];
  if (!per) errors.push("Choose a period.");
  if (!d) errors.push("Choose a document date.");
  if (!dl) errors.push("Choose a claim deadline.");
  if (!letter.letterNo) errors.push("Letter No is empty.");
  if (!signerName) errors.push("OWNER (partner signatory) is empty.");
  return { ...p, per, period, letter, bast, errors };
}

// Baca file template lama (untuk pre-fill): hanya data non-nominal
export async function readTemplateCarryOver(data) {
  if ((await detectWorkbookFormat(data)) === "sms") {
    const { pairs } = await parseSmsWorkbook(data);
    return {
      partners: pairs.map((p) => ({ type: p.type, partner: p.partner, brand: p.brand, signerName: p.signerName, signerTitle: p.signerTitle, emailTo: p.emailsTo.join("; "), emailCc: p.emailsCc.join("; ") })),
      branches: pairs.flatMap((p) => p.branches.map((b) => ({ type: p.type, partner: p.partner, branch: b.name }))),
    };
  }
  const { XLSX, wb } = await readWorkbook(data);
  const partners = sheetObjects(XLSX, wb, "Partners", PARTNER_COLS) || [];
  const branches = sheetObjects(XLSX, wb, "Branches", BRANCH_COLS) || [];
  return toCarryOver(partners, branches);
}

// Struktur carry-over: tanpa nominal; tanggal disimpan sebagai hari-dalam-bulan
export function toCarryOver(partners, branches) {
  const day = (v) => { const d = toDateValue(v); return d ? d.getUTCDate() : null; };
  return {
    partners: partners.map((r) => ({
      type: str(r.Type).toUpperCase(), partner: str(r.Partner), letterNo: str(r["Letter No"]),
      recipientTitle: str(r["Recipient Title"]), signerName: str(r["Signer Name"]), signerTitle: str(r["Signer Title"]),
      docDay: day(r["Document Date"]), deadlineDay: day(r["Claim Deadline"]),
    })).filter((r) => r.partner),
    branches: branches.map((b) => ({ type: str(b.Type).toUpperCase(), partner: str(b.Partner), branch: str(b.Branch) })).filter((b) => b.partner && b.branch),
  };
}

// Tanggal di bulan setelah periode, pada hari yang sama (dipotong ke akhir bulan)
export function dayInNextMonth(per, day) {
  if (!per || !day) return null;
  const y = +per.year + (per.month === 11 ? 1 : 0);
  const m = (per.month + 1) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last), 12));
}

// ── Template format SMS: tulis (exceljs) ────────────────────────────────────
// rows: [{ brand, type, partner, branch, emailTo, emailCc, owner, jabatan }] — 1 baris per partner × tipe × branch.
// Sheet "BAST" & "LETTER", judul di baris 1–2, header di baris 3 mulai kolom B (sama dengan file Source Data SMS).
export async function buildSmsTemplateWorkbook({ rows = [], periodLabel = "" } = {}) {
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "SandraHub Payout Tracker";
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const HEAD = fill("FF32BCAD"), FILL_ME = fill("FFFFF5C2"), PREFILLED = fill("FFEDEDED"), CALC = fill("FFE6F4F2");
  const border = { top: { style: "thin", color: { argb: "FFD0D0D0" } }, left: { style: "thin", color: { argb: "FFD0D0D0" } }, bottom: { style: "thin", color: { argb: "FFD0D0D0" } }, right: { style: "thin", color: { argb: "FFD0D0D0" } } };
  const HR = 3, FIRST = HR + 1;
  const extra = 60;                                   // baris kosong tambahan (dengan rumus) untuk partner baru
  const n = rows.length + extra;

  const sheet = (name, cols, widths, title) => {
    const ws = wb.addWorksheet(name);
    ws.getColumn(1).width = 2;
    cols.forEach((h, i) => { ws.getColumn(i + 2).width = widths[i] || 14; const c = ws.getCell(HR, i + 2); c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = HEAD; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = border; });
    ws.getRow(HR).height = 28;
    ws.getCell(1, 2).value = title; ws.getCell(1, 2).font = { bold: true, size: 13, color: { argb: "FFC6168D" } };
    ws.getCell(2, 2).value = "Yellow = please fill in · grey = pre-filled (editable) · green = calculated (do not edit). One row per partner, type and branch.";
    ws.getCell(2, 2).font = { italic: true, color: { argb: "FF666666" } };
    ws.views = [{ state: "frozen", ySplit: HR, xSplit: 0 }];
    return ws;
  };
  const col = (cols, h) => String.fromCharCode(66 + cols.indexOf(h)); // B = kolom pertama
  const listVal = (list) => ({ type: "list", allowBlank: true, formulae: [`"${list}"`], showErrorMessage: true, error: `Choose ${list.replace(",", " or ")}.` });

  // LETTER
  const L = sheet("LETTER", SMS_LETTER_COLS, [7, 7, 26, 34, 22, 10, 14, 30, 30, 16, 16, 16, 18, 16, 16, 18], `Notification Letter data${periodLabel ? ` — ${periodLabel}` : ""}`);
  const lc = (h) => col(SMS_LETTER_COLS, h);
  for (let i = 0; i < n; i++) {
    const r = FIRST + i, d = rows[i];
    const vals = d ? { BRAND: d.brand || (d.type === "MP3" ? "3ID" : d.type === "MPC" ? "IM3" : ""), TYPE: d.type, ENTITY: "MITRA DISTRIBUSI INDOSAT", PARTNER_NAME: d.partner, BRANCH: d.branch, EMAIL_TO: d.emailTo, EMAIL_CC: d.emailCc } : {};
    SMS_LETTER_COLS.forEach((h, ci) => {
      const c = L.getCell(r, ci + 2);
      const f = {
        Distribution_Fee: `SUM(${lc("SLA_Fee")}${r}:${lc("SALES_MARGIN")}${r})`,
        PPn: `${lc("Distribution_Fee")}${r}*11%`,
        PPh23: `${lc("Distribution_Fee")}${r}*-2%`,
        Total_Transfer: `SUM(${lc("Distribution_Fee")}${r}:${lc("PPh23")}${r})`,
      }[h];
      if (f) { c.value = { formula: f }; c.fill = CALC; c.numFmt = "#,##0"; c.border = border; return; }
      const v = vals[h];
      if (v != null && v !== "") c.value = v;
      if (["SLA_Fee", "TDS", "SALES_MARGIN"].includes(h)) { c.numFmt = "#,##0"; if (d) c.fill = FILL_ME; }
      else if (d) c.fill = v != null && v !== "" ? PREFILLED : (["TYPE", "PARTNER_NAME", "BRANCH"].includes(h) ? FILL_ME : undefined);
      if (d) c.border = border;
    });
    L.getCell(`${lc("TYPE")}${r}`).dataValidation = listVal("MPC,MP3");
    L.getCell(`${lc("BRAND")}${r}`).dataValidation = listVal("IM3,3ID");
  }

  // BAST — baris sejajar dengan LETTER; DPP = Distribution_Fee di LETTER
  const B = sheet("BAST", SMS_BAST_COLS, [7, 7, 6, 34, 22, 10, 14, 30, 30, 18, 16, 16, 18, 24, 14], `BAST data${periodLabel ? ` — ${periodLabel}` : ""}`);
  const bc = (h) => col(SMS_BAST_COLS, h);
  for (let i = 0; i < n; i++) {
    const r = FIRST + i, d = rows[i];
    const same = (h) => ({ formula: `IF(LETTER!${lc(h)}${r}="","",LETTER!${lc(h)}${r})` });
    SMS_BAST_COLS.forEach((h, ci) => {
      const c = B.getCell(r, ci + 2);
      const f = {
        DPP: `LETTER!${lc("Distribution_Fee")}${r}`,
        PPN: `${bc("DPP")}${r}*11%`,
        PPH: `${bc("DPP")}${r}*-2%`,
        TOTAL: `SUM(${bc("DPP")}${r}:${bc("PPH")}${r})`,
      }[h];
      if (f) { c.value = { formula: f }; c.fill = CALC; c.numFmt = "#,##0"; c.border = border; return; }
      if (["BRAND", "TYPE", "PARTNER_NAME", "BRANCH", "EMAIL_TO", "EMAIL_CC"].includes(h)) { c.value = same(h); c.fill = CALC; if (d) c.border = border; return; }
      const v = d ? { OWNER: d.owner, JABATAN: d.jabatan || (d.owner ? "Direktur" : "") }[h] : null;
      if (v != null && v !== "") c.value = v;
      if (d && (h === "OWNER" || h === "JABATAN")) { c.fill = v ? PREFILLED : FILL_ME; c.border = border; }
    });
  }
  wb.views = [{ activeTab: 0 }];
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ── Template: tulis (exceljs) ──────────────────────────────────────────────
// rows: [{ type, partner, period, docDate, letterNo, recipientTitle, deadline, signerName, signerTitle, dppTotal, poNumber, notes, prefilled:Set }]
// branches: [{ type, partner, branch }]
export async function buildTemplateWorkbook({ rows = [], branches = [] } = {}) {
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "SandraHub Payout Tracker";
  const HEAD = { type: "pattern", pattern: "solid", fgColor: { argb: "FF32BCAD" } };
  const FILL_ME = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF5C2" } };   // kuning muda: wajib diisi admin
  const PREFILLED = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } }; // abu-abu muda: terisi otomatis
  const border = { top: { style: "thin", color: { argb: "FFD0D0D0" } }, left: { style: "thin", color: { argb: "FFD0D0D0" } }, bottom: { style: "thin", color: { argb: "FFD0D0D0" } }, right: { style: "thin", color: { argb: "FFD0D0D0" } } };

  const ins = wb.addWorksheet("Instructions");
  ins.getColumn(1).width = 120;
  INSTRUCTIONS.forEach((t, i) => {
    const c = ins.getCell(i + 1, 1);
    c.value = t; c.alignment = { wrapText: true, vertical: "top" };
    if (i === 0) c.font = { bold: true, size: 14, color: { argb: "FFC6168D" } };
  });
  ins.getCell(INSTRUCTIONS.length + 2, 1).value = "Colour key: yellow = please fill in, grey = pre-filled by SandraHub (you can still edit).";
  ins.getCell(INSTRUCTIONS.length + 2, 1).font = { italic: true, color: { argb: "FF666666" } };

  const setupSheet = (ws, cols, widths) => {
    ws.columns = cols.map((h, i) => ({ header: h, key: h, width: widths[i] || 16 }));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const hr = ws.getRow(1);
    hr.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = HEAD; c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; c.border = border; });
    hr.height = 30;
  };
  const AMOUNT = new Set(["SLA", "Territory Development Support", "Tactical & TURS", "Sales Margin", "Other", "DPP Total", "DPP"]);
  const DATE = new Set(["Document Date", "Claim Deadline"]);
  const ADMIN_FILL = new Set(["SLA", "Territory Development Support", "Tactical & TURS", "Sales Margin", "Other"]);

  const ps = wb.addWorksheet("Partners");
  setupSheet(ps, PARTNER_COLS, [8, 36, 10, 14, 26, 24, 14, 22, 20, 16, 18, 16, 16, 14, 16, 16, 44]);
  const keyOf = { "Type": "type", "Partner": "partner", "Period": "period", "Document Date": "docDate", "Letter No": "letterNo", "Recipient Title": "recipientTitle", "Claim Deadline": "deadline", "Signer Name": "signerName", "Signer Title": "signerTitle", "DPP Total": "dppTotal", "PO Number": "poNumber", "Notes": "notes" };
  rows.forEach((r, i) => {
    const rowNo = i + 2;
    PARTNER_COLS.forEach((h, ci) => {
      const c = ps.getCell(rowNo, ci + 1);
      const k = keyOf[h];
      const v = k ? r[k] : null;
      if (v != null && v !== "") c.value = v instanceof Date ? v : v;
      if (h === "Notes") { c.font = { italic: true, color: { argb: "FF8A6A00" } }; c.alignment = { wrapText: true }; return; }
      const filled = v != null && v !== "";
      c.fill = ADMIN_FILL.has(h) || (!filled && h !== "PO Number" && h !== "DPP Total") ? FILL_ME : filled ? PREFILLED : undefined;
      if (!filled && (h === "PO Number" || h === "DPP Total") && r.notes) c.fill = FILL_ME;
      c.border = border;
    });
  });
  for (let rowNo = 2; rowNo <= Math.max(rows.length + 1, 2) + 200; rowNo++) {
    ps.getCell(rowNo, 1).dataValidation = { type: "list", allowBlank: true, formulae: ['"MPC,MP3"'], showErrorMessage: true, errorTitle: "Type", error: "Choose MPC or MP3." };
    PARTNER_COLS.forEach((h, ci) => {
      const c = ps.getCell(rowNo, ci + 1);
      if (AMOUNT.has(h)) c.numFmt = "#,##0";
      else if (DATE.has(h)) c.numFmt = "dd mmm yyyy";
      else if (h === "Period" || h === "PO Number" || h === "Letter No") c.numFmt = "@";
    });
  }

  const bs = wb.addWorksheet("Branches");
  setupSheet(bs, BRANCH_COLS, [8, 36, 26, 18]);
  branches.forEach((b, i) => {
    const rowNo = i + 2;
    [b.type, b.partner, b.branch, null].forEach((v, ci) => {
      const c = bs.getCell(rowNo, ci + 1);
      if (v != null && v !== "") c.value = v;
      c.fill = ci === 3 || v == null || v === "" ? FILL_ME : PREFILLED;
      c.border = border;
    });
  });
  for (let rowNo = 2; rowNo <= Math.max(branches.length + 1, 2) + 300; rowNo++) {
    bs.getCell(rowNo, 1).dataValidation = { type: "list", allowBlank: true, formulae: ['"MPC,MP3"'], showErrorMessage: true, errorTitle: "Type", error: "Choose MPC or MP3." };
    bs.getCell(rowNo, 4).numFmt = "#,##0";
  }
  wb.views = [{ activeTab: 1 }];
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// Dengan Payment ID: "BAST_<PaymentID>_<PARTNER>.pdf"; tanpa: format lama "BAST DF_<PARTNER>_<TYPE>.pdf"
export const bastFileName = (p) => (p.paymentId ? `BAST_${p.paymentId}_${p.partner}.pdf` : `BAST DF_${p.partner}_${p.type}.pdf`);
export const letterFileName = (p) => (p.paymentId ? `LETTER_${p.paymentId}_${p.partner}.pdf` : `LETTER_${p.partner}_${p.type}.pdf`);

// ── PDF ────────────────────────────────────────────────────────────────────
const A4 = [595.28, 841.89];
const L = 72, R = 523.28;       // margin kiri/kanan (sesuai contoh)
// Spasi teks isi surat (font 10 pt): line-height 1,45× dan jarak antar blok ±0,7× line-height
const LH = 14.5;                // jarak baseline antar baris dalam 1 paragraf / item
const BLOCK = 10;               // tambahan jarak antar blok (judul → paragraf → list → penutup)
const ITEM_GAP = 5;             // tambahan jarak antar item bernomor 1/2/3
const SUB_GAP = 1.5;            // tambahan jarak antar sub-bullet
const NUM_R = 97;               // kolom nomor (rata kanan)
const TXT1 = 103;               // awal teks item bernomor (& baris lanjutannya)
const BUL_X = 124;              // pusat bullet "o"
const TXT2 = 132;               // awal teks sub-bullet (& baris lanjutannya)
const GREY = [0.5, 0.5, 0.5];

let _lhCache = null;
export async function loadLetterhead() {
  if (_lhCache) return _lhCache;
  const res = await fetch(LETTERHEAD_URL);
  if (!res.ok) throw new Error("Letterhead template could not be loaded.");
  _lhCache = new Uint8Array(await res.arrayBuffer());
  return _lhCache;
}

// Helvetica (WinAnsi) — ganti karakter yang tidak didukung
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const clean = (s) => Array.from(String(s ?? "")).map((c) => {
  const code = c.charCodeAt(0);
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRA.includes(c) ? c : "?";
}).join("");

async function newDoc(letterhead, title) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(title); doc.setCreator("SandraHub Payout Tracker"); doc.setProducer("SandraHub");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const lh = letterhead ? (await doc.embedPdf(letterhead, [0]))[0] : null;
  const ink = rgb(0, 0, 0);
  const g = {
    doc, font, bold, rgb,
    addPage() {
      const p = doc.addPage(A4);
      if (lh) p.drawPage(lh, { x: 0, y: 0, width: A4[0], height: A4[1] });
      return p;
    },
    w: (s, f = font, size = 10) => f.widthOfTextAtSize(clean(s), size),
    text(p, s, x, y, { f = font, size = 10, color = ink } = {}) { p.drawText(clean(s), { x, y, size, font: f, color }); },
    center(p, s, cx, y, o = {}) { g.text(p, s, cx - g.w(s, o.f || font, o.size || 10) / 2, y, o); },
    right(p, s, rx, y, o = {}) { g.text(p, s, rx - g.w(s, o.f || font, o.size || 10), y, o); },
    wrap(s, maxW, f = font, size = 10) {
      const out = []; let line = "";
      for (const word of clean(s).split(/\s+/).filter(Boolean)) {
        const t = line ? `${line} ${word}` : word;
        if (g.w(t, f, size) <= maxW || !line) line = t; else { out.push(line); line = word; }
      }
      if (line) out.push(line);
      return out.length ? out : [""];
    },
    // Paragraf rata kiri-kanan (baris terakhir rata kiri). Return y baseline berikutnya.
    // Baris yang terlalu renggang (>3× spasi normal) tetap rata kiri supaya tidak "bolong".
    justify(p, s, x, y, maxW, lh, { f = font, size = 10, color = ink } = {}) {
      const lines = g.wrap(s, maxW, f, size);
      const space = f.widthOfTextAtSize(" ", size);
      lines.forEach((ln, i) => {
        const words = ln.split(" ");
        const last = i === lines.length - 1;
        const gap = words.length > 1 ? (maxW - words.reduce((a, w) => a + f.widthOfTextAtSize(w, size), 0)) / (words.length - 1) : 0;
        if (last || words.length < 2 || gap > space * 3) g.text(p, ln, x, y, { f, size, color });
        else {
          let cx = x;
          words.forEach((w) => { p.drawText(w, { x: cx, y, size, font: f, color }); cx += f.widthOfTextAtSize(w, size) + gap; });
        }
        y -= lh;
      });
      return y;
    },
    // kotak sel: border hitam tipis, fill opsional
    cell(p, x1, top, x2, h, fill) {
      p.drawRectangle({ x: x1, y: top - h, width: x2 - x1, height: h, borderColor: ink, borderWidth: 0.6, color: fill ? rgb(...fill) : undefined });
    },
  };
  return g;
}

// ── BAST ───────────────────────────────────────────────────────────────────
export async function buildBastPdf(bast, cfg = DEFAULT_SIGNATORIES, letterhead = null) {
  const c = { ...DEFAULT_SIGNATORIES, ...cfg };
  const g = await newDoc(letterhead, `BAST DF ${bast.partner} ${bast.type}`);
  const { bold, rgb } = g;
  let p = g.addPage();
  const cx = A4[0] / 2;

  g.center(p, "BERITA ACARA SERAH TERIMA", cx, 745.1, { f: bold, size: 11 });
  g.center(p, `${bast.type} DISTRIBUTION FEE - Periode ${bast.period}`, cx, 729.6, { f: bold, size: 11 });
  if (bast.paymentId) g.center(p, `Payment ID: ${bast.paymentId}`, cx, 717.6, { size: 8, color: g.rgb(0.35, 0.35, 0.4) });
  let y = 703.9;
  for (const ln of g.wrap(`Pada hari ini, ${bast.day} bulan ${bast.month} tahun ${bast.year}, yang bertanda tangan di bawah ini:`, R - L)) { g.text(p, ln, L, y); y -= 14.1; }

  const kv = (label, value, yy) => { g.text(p, label, 74.5, yy); g.text(p, `: ${value}`, 138.6, yy); };
  y = 677.2;
  g.text(p, "PIHAK PERTAMA", 74.5, y, { f: bold });
  kv("Nama", c.p1Name, y - 15.5); kv("Jabatan", c.p1Title, y - 31); kv("Perusahaan", c.p1Company, y - 46.5);
  y = 613.7;
  g.text(p, "PIHAK KEDUA", 74.5, y, { f: bold });
  kv("Nama", bast.signerName, y - 15.5); kv("Jabatan", bast.signerTitle, y - 31); kv("Perusahaan", bast.partner, y - 46.5);

  y = 540.4;
  g.text(p, "Dengan ini menyatakan bahwa:", L, y);
  y = 515.1;
  const items = [
    "PIHAK KEDUA telah melaksanakan kegiatan distribusi produk IOH periode dengan baik dan sesuai kesepakatan.",
    "PARA PIHAK telah melakukan serah terima atas pelaksanaan kegiatan distribusi produk IOH periode.",
  ];
  items.forEach((it, i) => {
    g.right(p, `${i + 1}.`, 97.5, y);
    g.wrap(it, R - 102).forEach((ln) => { g.text(p, ln, 102, y); y -= 14.1; });
  });
  y -= 11.2;
  g.text(p, "Rincian perolehan:", L, y);

  // Tabel rincian
  const X = [L, 150, 290, 363, 440, R];
  const rowH = 20.25;
  let top = y - 13.6;
  const heads = ["Branch", "Distribution Fee (DPP)", "Ppn", "Pph23", "Total"];
  heads.forEach((h, i) => { g.cell(p, X[i], top, X[i + 1], rowH, GREY); g.center(p, h, (X[i] + X[i + 1]) / 2, top - rowH + 6.75, { f: bold, color: rgb(1, 1, 1) }); });
  top -= rowH;
  for (const b of bast.branches) {
    for (let i = 0; i < 5; i++) g.cell(p, X[i], top, X[i + 1], rowH);
    const by = top - rowH + 6.75;
    g.text(p, b.name, 76.5, by);
    [b.dpp, b.ppn, b.pph, b.total].forEach((v, i) => g.right(p, rupiah(v), X[i + 2] - 4, by));
    top -= rowH;
  }
  // baris total (Branch + DPP digabung, tanpa label)
  g.cell(p, X[0], top, X[2], rowH);
  for (let i = 2; i < 5; i++) g.cell(p, X[i], top, X[i + 1], rowH);
  const t = bast.totals;
  [t.dpp, t.ppn, t.pph, t.total].forEach((v, i) => g.right(p, rupiah(v), X[i + 2] - 4, top - rowH + 6.75));
  top -= rowH;

  y = top - 21.95;
  for (const ln of g.wrap("Demikian Berita Acara Serah Terima ini dibuat dan dipergunakan sebagai pernyataan penyelesaian pekerjaan.", R - L)) { g.text(p, ln, L, y); y -= 14.1; }

  // Tanda tangan (tanpa gambar, ruang kosong untuk tanda tangan / e-sign): 2 kolom.
  // Blok tanda tangan selalu utuh: kalau tidak muat di atas footer, pindah seluruhnya ke halaman 2.
  const C1 = 180.5, C2 = 409.5;
  const SIGN_GAP = 62;          // ruang tanda tangan (~2,2 cm)
  const MIN_Y = 158;            // batas bawah aman di atas ornamen footer
  y -= 12.7;
  if (y - 15.5 - SIGN_GAP - 12 < MIN_Y) { p = g.addPage(); y = 744.7; }
  g.center(p, "PIHAK PERTAMA,", C1, y); g.center(p, "PIHAK KEDUA,", C2, y);
  y -= 15.5;
  g.center(p, c.p1Company, C1, y); g.center(p, bast.partner, C2, y);
  const ny = y - SIGN_GAP;
  g.center(p, c.p1Name, C1, ny); g.center(p, c.p1Title, C1, ny - 12);
  g.center(p, bast.signerName, C2, ny); g.center(p, bast.signerTitle, C2, ny - 12);

  return g.doc.save();
}

// ── Notification Letter ────────────────────────────────────────────────────
export async function buildLetterPdf(letter, cfg = DEFAULT_SIGNATORIES, letterhead = null) {
  const c = { ...DEFAULT_SIGNATORIES, ...cfg };
  const g = await newDoc(letterhead, `Surat Pemberitahuan ${letter.partner} ${letter.type}`);
  const { bold, font, rgb } = g;
  let p = g.addPage();
  const white = rgb(1, 1, 1);

  g.text(p, `${c.city}, ${letter.date}`, L, 746.2);
  g.text(p, "Kepada Yth ", L, 720.9);
  g.text(p, letter.recipientTitle, L + g.w("Kepada Yth "), 720.9, { f: bold });
  g.text(p, letter.partner, L, 706.8, { f: bold });
  g.text(p, "Di Tempat", L, 692.6);

  g.text(p, "No", 74.5, 665.9); g.text(p, `: ${letter.letterNo}`, 111.8, 665.9);
  if (letter.paymentId) g.right(p, `Payment ID: ${letter.paymentId}`, R, 665.9, { size: 8, color: rgb(0.35, 0.35, 0.4) });
  g.text(p, "Perihal", 74.5, 650.4); g.text(p, ":", 111.8, 650.4);
  let y = 650.4;
  g.wrap(`Surat Pemberitahuan Imbalan Jasa Distribution Fee Periode ${letter.period} ${letter.type} ${letter.partner}`, R - 117.9)
    .forEach((ln) => { g.text(p, ln, 117.9, y); y -= 12; });

  y -= 14.8;
  y = g.justify(p, `Berikut disampaikan Surat Pemberitahuan Imbalan Jasa Distribution Fee periode ${letter.period} dengan rincian sebagai berikut:`, L, y, R - L, 14.1);

  // Tabel 1 — DPP DISTRIBUTION FEE
  const rowH = 20.25;
  let top = y - 0.9;
  const headH = 43.25;
  g.cell(p, L, top, R, headH, GREY);
  [ "DPP DISTRIBUTION FEE", letter.partner, `Periode ${letter.period}` ].forEach((s, i) => g.center(p, s, (L + R) / 2, top - 12.7 - i * 12, { f: bold, color: white }));
  top -= headH;
  const T1 = [L, 353, R];
  const rows1 = [
    ["SLA", letter.sla],
    ["Territory Development Support", letter.tds],
    ...(!letter.hideTactical && roundHalfUp(letter.other) !== 0 ? [["Other", letter.other]] : []),
    ...(!letter.hideTactical ? [["Tactical & TURS", letter.tactical]] : []),
    ["Sales Margin", letter.salesMargin],
    ["Distribution Fee (sebelum pajak)", letter.dpp, true],
  ];
  for (const [lab, val, isBold] of rows1) {
    g.cell(p, T1[0], top, T1[1], rowH); g.cell(p, T1[1], top, T1[2], rowH);
    const by = top - rowH + 6.75;
    g.text(p, lab, 76.5, by, { f: isBold ? bold : font });
    g.right(p, rupiah(val, true), R - 4, by, { f: isBold ? bold : font });
    top -= rowH;
  }

  // Tabel 2 — DESKRIPSI | KETERANGAN / NILAI
  top -= 8.25;
  const T2 = [L, 186, R];
  g.cell(p, T2[0], top, T2[1], rowH, GREY); g.cell(p, T2[1], top, T2[2], rowH, GREY);
  g.center(p, "DESKRIPSI", (T2[0] + T2[1]) / 2, top - rowH + 6.75, { f: bold, color: white });
  g.center(p, "KETERANGAN / NILAI", (T2[1] + T2[2]) / 2, top - rowH + 6.75, { f: bold, color: white });
  top -= rowH;
  const valW = R - 4 - 190.5;
  const rows2 = [
    { label: ["Branch"], text: g.wrap(letter.branches, valW) },
    { label: ["Aktifitas"], text: g.wrap(`${letter.type} harus melakukan serangkaian proses dari mulai registrasi outlet (channel penjualan) sampai terselesaikannya proses penjualan ke retailer/reseller/outlet (seluruh kategori yang terdaftar di system/aplikasi milik INDOSAT tersebut sehingga produk INDOSAT terdistribusi ke pelanggan.`, valW) },
    { label: ["SLA"], text: ["Sesuai Tabel di atas"] },
    { label: ["Distribution Fee", "(sebelum pajak)"], amount: rupiah(letter.dpp, true) },
    { label: ["Ppn"], amount: rupiah(letter.ppn, true) },
    { label: ["Pph23 2%"], amount: rupiah(-letter.pph, true) },
    { label: ["Total Transfer"], amount: rupiah(letter.total, true), bold: true },
  ];
  for (const r of rows2) {
    const n = Math.max(r.label.length, r.text ? r.text.length : 1);
    const h = (n - 1) * 12 + rowH;
    g.cell(p, T2[0], top, T2[1], h); g.cell(p, T2[1], top, T2[2], h);
    const f = r.bold ? bold : font;
    const first = (lines) => top - (h - (lines - 1) * 12) / 2 - 3.4; // baris tunggal: baseline 6.75 di atas garis bawah
    r.label.forEach((ln, i) => g.text(p, ln, 76.5, first(r.label.length) - i * 12, { f }));
    if (r.text) r.text.forEach((ln, i) => g.text(p, ln, 190.5, first(r.text.length) - i * 12));
    if (r.amount) g.right(p, r.amount, R - 4, first(1), { f });
    top -= h;
  }

  // Halaman 2 — Ketentuan Klaim Pembayaran (spasi tetap: LH, BLOCK, ITEM_GAP, SUB_GAP; hanging indent)
  p = g.addPage();
  const head = "Ketentuan Klaim Pembayaran";
  y = 746.2;
  g.text(p, head, L, y, { f: bold });
  p.drawLine({ start: { x: L, y: y - 1.6 }, end: { x: L + g.w(head, bold), y: y - 1.6 }, thickness: 0.6, color: rgb(0, 0, 0) });
  y -= LH + BLOCK;
  y = g.justify(p, `Untuk melakukan klaim atas fee tersebut dimohon untuk menerbitkan invoice dengan batas akhir pada tanggal ${letter.deadline} jam 23:59 dengan memperhatikan beberapa hal berikut ini:`, L, y, R - L, LH);
  y -= BLOCK;
  const bullet = (yy) => p.drawCircle({ x: BUL_X, y: yy + 3.3, size: 1.9, borderColor: rgb(0, 0, 0), borderWidth: 0.6 });
  const list = [
    ["Proses invoicing dilakukan di sistem Coupa", []],
    ["Invoice dan Faktur Pajak harus memenuhi beberapa kriteria sebagai berikut:", [
      "Redaksi yang ditulis pada invoice adalah nilai total DPP.",
      "Dipotong PPh 23 sebesar 2%",
      "Mencantumkan nomor rekening perusahaan (bukan perorangan)",
      "Materai senilai 10,000, dibubuhi tandatangan dan stempel Perusahaan",
      "Mencantumkan ‘terbilang’ untuk nilai total.",
      "Nomor Invoice harus dituliskan di bawah QR code Faktur Pajak",
    ]],
    ["Dokumen yang diupload ke sistem Coupa adalah sebagai berikut:", [
      "Scan attachment 1: Invoice",
      "Scan attachment 2: Faktur pajak (nomor invoice harus dituliskan di bawah QR code Faktur Pajak), PO, BAST dan Surat Pemberitahuan Imbalan Jasa.",
    ]],
  ];
  list.forEach(([txt, subs], i) => {
    if (i > 0) y -= ITEM_GAP;
    g.right(p, `${i + 1}.`, NUM_R, y);
    g.wrap(txt, R - TXT1).forEach((ln) => { g.text(p, ln, TXT1, y); y -= LH; });   // baris lanjutan sejajar teks, bukan nomor
    subs.forEach((sub, k) => {
      if (k > 0) y -= SUB_GAP;
      bullet(y);
      g.wrap(sub, R - TXT2).forEach((ln) => { g.text(p, ln, TXT2, y); y -= LH; }); // hanging indent sejajar awal teks bullet
    });
  });
  y -= BLOCK;
  y = g.justify(p, "Demikian disampaikan, atas perhatian dan kerjasamanya diucapkan terima kasih.", L, y, R - L, LH);
  y -= BLOCK;
  // Blok penutup + tanda tangan dijaga utuh di satu halaman
  const SIGN_SPACE = 64;                             // ruang tanda tangan kosong (~2,3 cm)
  const blockH = LH + SIGN_SPACE + 2 * LH + 2 * LH;  // salam + ruang + nama/jabatan/unit + Cc
  if (y - blockH < 158) { p = g.addPage(); y = 746.2; }
  g.text(p, "Salam hormat,", L, y);
  y -= LH + SIGN_SPACE;
  g.text(p, c.letterSignerName, L, y);
  g.text(p, c.letterSignerTitle, L, y - LH);
  g.text(p, c.letterSignerUnit, L, y - 2 * LH);
  g.text(p, "Cc: Circle Head, HOR, HOS & HCO", L, y - 4 * LH);

  return g.doc.save();
}

// Gabungkan beberapa PDF jadi satu (untuk "Preview all" — tidak disimpan)
export async function mergePdfBytes(parts) {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  out.setTitle("BAST & Notification Letters — preview");
  for (const bytes of parts) {
    const src = await PDFDocument.load(bytes);
    (await out.copyPages(src, src.getPageIndices())).forEach((pg) => out.addPage(pg));
  }
  return out.save();
}
