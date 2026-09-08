"use client";
// Import Plan Activity dari Excel (CMS) - lihat migrasi Supabase
// `add_plan_import_feature`. Parsing 100% di browser (lib `xlsx`, sudah
// dipakai lib/martaSiteImport.js utk import List Site) - file yg diunggah
// TIDAK PERNAH dikirim/disimpan ke Storage/DB, cuma diproses di memori tab
// ini lalu dibuang begitu baris hasil mapping sudah terkirim ke RPC
// mh_import_plan_batch (yg SUDAH dalam bentuk data, bukan file lagi).

import supabaseMarta from "./supabaseMarta";

export const MAX_FILE_BYTES = 150 * 1024 * 1024; // 150 MB
const ALLOWED = /\.(xlsx|xls|csv)$/i;
const CHUNK = 300; // baris per panggilan RPC - jaga payload tetap wajar utk file sangat besar

// Field tujuan di mh_activities (lewat RPC mh_import_plan_batch). Alamat &
// BME/RGE SENGAJA tidak ada di sini - alamat butuh konfirmasi GPS manual DSF
// (lihat gate di app/martahub/m/activities/[id]/submit/page.jsx), BME/RGE
// belum ada mapping akun jadi dibiarkan kosong sampai di-assign lewat User
// Management. Target_Rev (3 Bulan) JUGA sengaja tidak ada di sini - dihitung
// OTOMATIS oleh RPC mh_import_plan_batch dari target_sp/target_fwa/rebuy
// pakai rumus yg SAMA dgn sheet Excel (=((SP*35000*3)+(FWA*50000*3))+Rebuy),
// jadi user tidak perlu mapping kolom ini sama sekali.
//
// Field ACTUAL_* (opsional) - dipakai kalau file yg sama JUGA sudah punya
// hasil realisasi (historical backdoor), bukan cuma Target. BEDA dgn
// Target_Rev, Actual_Rev (3 Bulan) di sini diambil RAW APA ADANYA dari sel
// Excel (TIDAK dihitung ulang pakai rumus) - krn actual adalah angka yg
// SUDAH TERJADI/dilaporkan, bukan estimasi yg boleh disamakan formulanya.
// Per baris: kalau Cost Actual terisi (satu2nya kolom yg BENAR2 wajib di
// alur "Isi Laporan Actual" mobile), status activity itu langsung 'done'
// (dianggap sudah final, tidak masuk antrian validasi TMV/Head) - kalau
// Cost Actual kosong, activity itu TETAP berstatus normal "Menunggu Laporan"
// (plan_submitted) walau kolom actual lain terisi sebagian, supaya tidak ada
// data "actual" setengah jadi yg keliru dianggap laporan lengkap.
export const PLAN_TARGET_FIELDS = [
  { key: "event_name", label: "Event Name", required: true, guesses: ["event name", "nama event"] },
  { key: "brand", label: "Brand", required: true, guesses: ["brand"] },
  { key: "event_category", label: "Event Category", required: true, guesses: ["event category", "kategori event"] },
  { key: "network_category", label: "Network Category", required: true, guesses: ["network category"] },
  { key: "area_potential", label: "Area Potential", required: true, guesses: ["area potential"] },
  { key: "poi", label: "POI", required: false, guesses: ["poi"] },
  { key: "site_id", label: "Site ID", required: true, guesses: ["site id"] },
  { key: "plan_date", label: "Plan Date", required: true, guesses: ["plan date", "tanggal"] },
  { key: "target_sp", label: "Target SP", required: false, guesses: ["target_sp", "target sp"] },
  { key: "target_fwa", label: "Target FWA", required: false, guesses: ["target_fwa", "target fwa"] },
  { key: "target_rebuy_sp", label: "Target Rebuy SP", required: false, guesses: ["target_rebuy", "rebuy sp"] },
  { key: "target_rebuy_fwa", label: "Target Rebuy FWA", required: false, guesses: ["rebuy fwa"] },
  { key: "cost_estimate", label: "Cost Estimate", required: false, guesses: ["cost estimate"] },
  { key: "actual_sp", label: "Actual SP", required: false, guesses: ["actual_sp", "actual sp"] },
  { key: "actual_fwa", label: "Actual FWA", required: false, guesses: ["actual_fwa", "actual fwa"] },
  { key: "actual_rebuy_sp", label: "Actual Rebuy SP", required: false, guesses: ["actual_rebuy", "actual rebuy sp"] },
  { key: "actual_rebuy_fwa", label: "Actual Rebuy FWA", required: false, guesses: ["actual rebuy fwa"] },
  { key: "actual_rev_3m", label: "Actual Revenue (3 Bulan)", required: false, guesses: ["actual_rev", "actual revenue"] },
  { key: "cost_actual", label: "Cost Actual (isi = laporan Done)", required: false, guesses: ["cost actual"] },
  { key: "ket", label: "Keterangan", required: false, guesses: ["ket", "keterangan", "notes"] },
];

const _norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Auto-match "like" kolom header ke field tujuan - dipakai sbg tebakan
 * awal drag-and-drop (masih bisa digeser manual kalau salah tebak). */
export function guessPlanMapping(columns) {
  const m = {};
  const used = new Set();
  for (const f of PLAN_TARGET_FIELDS) {
    let best = "";
    for (const g of f.guesses) {
      const ng = _norm(g);
      const hit = columns.find((c) => !used.has(c) && _norm(c) === ng);
      if (hit) { best = hit; break; }
    }
    if (!best) {
      for (const g of f.guesses) {
        const ng = _norm(g);
        if (ng.length < 3) continue;
        const hit = columns.find((c) => {
          if (used.has(c)) return false;
          const nc = _norm(c);
          return nc.includes(ng) || ng.includes(nc);
        });
        if (hit) { best = hit; break; }
      }
    }
    m[f.key] = best;
    if (best) used.add(best);
  }
  return m;
}

/** Baca semua nama sheet di workbook (utk step "pilih sheet") - TIDAK
 * membaca isi baris dulu (lebih cepat utk file besar). */
export async function readWorkbookSheetNames(file) {
  const name = file?.name || "";
  if (!ALLOWED.test(name)) throw new Error("Format tidak didukung. Pakai .xlsx, .xls, atau .csv.");
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Ukuran file ${(file.size / 1048576).toFixed(1)} MB melebihi batas maksimal 150 MB.`);
  }
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  // SENGAJA TANPA cellDates:true - kalau opsi ini dipasang di sini (level
  // workbook), SEMUA sel bertipe Date di seluruh workbook otomatis
  // "dikonversi" SheetJS jadi objek Date JS saat file dibaca (nilai .v-nya
  // ketiban ganti dari angka serial asli ke objek Date), jadi getSheetMatrix()
  // di bawah TIDAK BISA LAGI ambil angka serial mentahnya (raw:true tetap
  // balikin objek Date, bukan angka) - itu penyebab pasti bug off-by-one-hari
  // (lihat catatan panjang di getSheetMatrix/excelSerialToIso). Tanpa opsi
  // ini, cell.v tetap angka serial asli, teks tampilan (dipakai matrix biasa
  // via raw:false+dateNF) TETAP kebentuk benar krn itu dari cell.w yg tidak
  // bergantung opsi cellDates sama sekali.
  const wb = XLSX.read(buf, { type: "array", bookSheets: false });
  if (!wb.SheetNames?.length) throw new Error("Berkas tidak berisi sheet apa pun.");
  return { workbook: wb, sheetNames: wb.SheetNames };
}

/** Ambil matriks mentah (baris x sel) satu sheet dari workbook yg sudah
 * dibaca readWorkbookSheetNames() - dipanggil ulang tiap kali user ganti
 * pilihan sheet, TANPA baca ulang file. */
export async function getSheetMatrix(workbook, sheetName) {
  const XLSX = await import("xlsx");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false, raw: false, dateNF: "yyyy-mm-dd" });
  if (!matrix.length) throw new Error("Sheet ini tidak berisi data.");
  // Matriks KEDUA, khusus sumber tanggal (Plan Date/Actual Date dsb): pakai
  // raw:true + cellDates:true supaya sel bertipe Date balik sbg objek Date
  // JS ASLI (dari nilai serial Excel-nya langsung), BUKAN teks hasil format
  // tampilan sel ("d-mmm-yy" -> "1-Sep-26", atau lebih parah "d-mmm" TANPA
  // tahun sama sekali -> "1-Sep" walau tahunnya SEBENARNYA ada di serial
  // number-nya). Baris/kolom-nya PERSIS align dgn `matrix` di atas (opsi
  // header/defval/blankrows sama, cuma raw & cellDates yg beda) - ditempel
  // sbg properti tersembunyi di array `matrix` (bukan index numerik) spy
  // dipanggil getSheetMatrix() TIDAK perlu ubah signature/return value di
  // semua caller yg sudah ada (masih array biasa spt sebelumnya).
  // PAKAI raw:true TANPA cellDates - balikin ANGKA serial Excel mentah
  // (bukan objek Date). Sempat dicoba pakai cellDates:true (SheetJS bikin
  // objek Date sendiri dari serial itu), TAPI ketahuan nyata di produksi:
  // 12 dari 384 baris file real (semua yg PERSIS tanggal 1 Sep) ke-import
  // mundur 1 hari jadi 31 Agustus - konversi serial->Date internal SheetJS
  // ternyata bisa punya noise floating-point sepersekian milidetik (serial
  // Excel disimpan sbg pecahan hari, bukan bilangan bulat persis, apalagi
  // kalau sel itu hasil rumus/drag-fill di Excel, bukan diketik manual) yg
  // bikin instant-nya "nyelip" ke SEBELUM tengah malam. Solusinya: kita
  // sendiri yg convert dari ANGKA serial (dibulatkan dulu ke integer -
  // hilangkan noise float-nya) ke Y/M/D, bukan percaya objek Date jadi dari
  // SheetJS. Lihat excelSerialToIso() di bawah.
  const rawNumericMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false, raw: true });
  Object.defineProperty(matrix, "__rawDates", { value: rawNumericMatrix, enumerable: false });
  return matrix;
}

// Excel serial date (hari sejak 1899-12-30, termasuk bug "1900 dianggap
// tahun kabisat" yg sudah bawaan format file Excel) -> "YYYY-MM-DD". Serial
// DIBULATKAN dulu ke integer SEBELUM dipakai hitung - ini kunci penghindar
// bug off-by-one-hari di atas (noise floating-point kecil di pecahan hari
// ke-buang duluan, jadi hasil akhirnya SELALU pas tengah malam UTC, tidak
// pernah "nyelip" ke hari sebelumnya krn efek zona waktu/pembulatan).
function excelSerialToIso(serial) {
  if (typeof serial !== "number" || !isFinite(serial) || serial <= 0) return null;
  const days = Math.round(serial) - 25569; // 25569 = jarak hari 1899-12-30 -> 1970-01-01 (epoch Unix)
  const d = new Date(days * 86400000);
  if (isNaN(d)) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Dari matriks + indeks baris header -> { columns, displayColumns, rows }.
 * Sama persis pola dgn lib/martaSiteImport.js (deriveTable) supaya
 * konsisten - baris di ATAS headerIdx (judul, ringkasan bulan, dll -
 * spt "MONTH : SEPTEMBER" di sheet North - Sept) diabaikan begitu saja. */
export function derivePlanTable(matrix, headerIdx = 0) {
  const rawHeader = matrix[headerIdx] || [];
  const seen = {};
  const columns = rawHeader.map((c, i) => {
    let name = (c == null || String(c).trim() === "") ? `Kolom ${i + 1}` : String(c).trim();
    if (seen[name] != null) { seen[name] += 1; name = `${name} (${seen[name]})`; } else seen[name] = 0;
    return name;
  });
  const rawDates = matrix.__rawDates;
  const rows = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const arr = matrix[r] || [];
    const obj = {};
    let empty = true;
    for (let i = 0; i < columns.length; i++) {
      const v = arr[i] ?? null;
      obj[columns[i]] = v;
      if (v !== null && String(v).trim() !== "") empty = false;
    }
    if (!empty) {
      if (rawDates && rawDates[r]) {
        Object.defineProperty(obj, "__rawRow", { value: rawDates[r], enumerable: false });
      }
      rows.push(obj);
    }
  }
  const displayColumns = columns.filter((c) => c && !/^kolom \d+$/i.test(c) && !/^unnamed/i.test(c));
  return { columns, displayColumns, rows };
}

// Format YYYY-MM-DD dari KOMPONEN TANGGAL LOKAL suatu Date - BUKAN lewat
// .toISOString() (itu konversi ke UTC dulu). Kalau browser/server yg
// menjalankan import ini timezone-nya di depan UTC (WIB = UTC+7), sebuah
// Date jam 00:00 tanggal 1 di lokal jadi jam 17:00 tanggal SEBELUMNYA di
// UTC - toISOString().slice(0,10) balikin tanggal yg mundur 1 hari (mis.
// Plan Date 1 September di Excel ke-import jadi 31 Agustus di DB, TANPA
// error apa pun). Sudah kejadian nyata - 12 baris impor sebelumnya
// (batch 8f3c8111.../76b186c9...) semuanya geser mundur 1 hari persis
// krn bug ini, sudah dikoreksi manual di database.
function fromLocalDateParts(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toIsoDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return fromLocalDateParts(v);
  const s = String(v).trim();
  // sudah "YYYY-MM-DD" atau "DD/MM/YYYY" dsb - coba parse langsung dulu
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/YYYY
  if (m2) return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  // Sel Excel bertipe Date TAPI number format-nya pakai singkatan bulan
  // (mis. "d-mmm-yy" -> teks "1-Sep-26") - dgn opsi sheet_to_json raw:false
  // yg dipakai getSheetMatrix(), SheetJS mengikuti number format ASLI sel
  // itu (dateNF cuma fallback utk sel TANPA format eksplisit), jadi hasilnya
  // BUKAN "yyyy-mm-dd" spt yg diharapkan meski tahunnya sebenarnya ADA (cuma
  // 2 digit). Ini beda dgn kasus "7-Sep" tanpa tahun sama sekali di bawah -
  // di sini tahunnya eksplisit ada, cuma perlu diuraikan manual krn regex
  // \d{4} di bawah tidak match "26" (2 digit).
  const MONTHS3 = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const m3 = s.match(/^(\d{1,2})-([A-Za-z]{3,})-(\d{2}|\d{4})$/); // D-MMM-YY atau D-MMM-YYYY
  if (m3) {
    const mon = MONTHS3[m3[2].slice(0, 3).toLowerCase()];
    if (mon) {
      const yr = m3[3].length === 2 ? 2000 + Number(m3[3]) : Number(m3[3]);
      return `${yr}-${String(mon).padStart(2, "0")}-${m3[1].padStart(2, "0")}`;
    }
  }
  // String tanpa tahun eksplisit (mis. sel Excel berformat teks "7-Sep",
  // bukan cell bertipe Date) - `new Date("7-Sep")` DIAM-DIAM default ke
  // tahun 2001 (quirk lawas parser tanggal browser/Node kalau tahunnya
  // tidak disebutkan), bikin plan_date ke-import dgn tahun ngawur tanpa
  // ada error/peringatan sama sekali. Sudah kejadian nyata juga - 16 baris
  // impor sebelumnya (batch 76b186c9...) kesimpan dgn tahun 2001, sudah
  // dikoreksi manual di database. Drpd nebak tahun mana yg dimaksud,
  // tolak & biarkan baris ini KE KARANTINA supaya ketahuan & Excel-nya
  // dibetulkan (isi Plan Date dgn tanggal lengkap termasuk tahun).
  if (!/\d{4}/.test(s)) return null;
  const d = new Date(s);
  if (!isNaN(d)) return fromLocalDateParts(d);
  return null;
}

/** Bangun baris siap kirim ke RPC mh_import_plan_batch dari rows mentah +
 * mapping kolom (hasil drag-and-drop). Baris yg SAMA SEKALI tidak ada
 * Event Name & Site ID dilewati (dianggap baris kosong/pemisah section di
 * Excel, bukan data event beneran). */
// Ambil objek Date ASLI (dari matriks raw:true+cellDates:true di
// getSheetMatrix) utk field bertipe tanggal, kalau ada - dipakai LEBIH
// DIUTAMAKAN drpd teks hasil format tampilan sel (lihat catatan panjang di
// getSheetMatrix), krn teks tampilan bisa kehilangan info tahun (format sel
// "d-mmm" tanpa tahun) walau nilai serial sel-nya sendiri tahunnya lengkap.
function rawDateFor(r, colName) {
  if (!colName) return null;
  const raw = r.__rawRow;
  if (!raw) return null;
  const idx = Object.keys(r).indexOf(colName);
  if (idx < 0) return null;
  const v = raw[idx];
  // Excel serial date (angka) - sel bertipe Date/Number dgn format tanggal.
  if (typeof v === "number") return excelSerialToIso(v);
  return null;
}

export function buildPlanRows(rows, mapping) {
  const g = (r, key) => (mapping[key] ? r[mapping[key]] : null);
  // rawDateFor() sudah balikin "YYYY-MM-DD" siap pakai (dari angka serial
  // Excel asli, dibulatkan ke integer) - LEBIH DIUTAMAKAN drpd teks hasil
  // format tampilan sel yg bisa hilang info tahun (lihat catatan panjang di
  // getSheetMatrix). Kalau kolom itu bukan angka (mis. file CSV yg sel
  // tanggalnya cuma teks biasa), fallback ke toIsoDate() thd teks spt biasa.
  const gDate = (r, key) => rawDateFor(r, mapping[key]) || toIsoDate(g(r, key));
  const out = [];
  for (const r of rows) {
    const eventName = g(r, "event_name");
    const siteId = g(r, "site_id");
    if ((eventName == null || String(eventName).trim() === "") && (siteId == null || String(siteId).trim() === "")) continue;
    out.push({
      event_name: eventName == null ? null : String(eventName).trim(),
      brand: g(r, "brand") == null ? null : String(g(r, "brand")).trim(),
      event_category: g(r, "event_category") == null ? null : String(g(r, "event_category")).trim(),
      network_category: g(r, "network_category") == null ? null : String(g(r, "network_category")).trim(),
      area_potential: g(r, "area_potential") == null ? null : String(g(r, "area_potential")).trim(),
      poi: g(r, "poi") == null ? null : String(g(r, "poi")).trim(),
      site_id: siteId == null ? null : String(siteId).trim(),
      plan_date: gDate(r, "plan_date"),
      target_sp: g(r, "target_sp"),
      target_fwa: g(r, "target_fwa"),
      target_rebuy_sp: g(r, "target_rebuy_sp"),
      target_rebuy_fwa: g(r, "target_rebuy_fwa"),
      // target_rev_3m TIDAK dikirim dari sini - dihitung otomatis di RPC
      // mh_import_plan_batch (rumus sama persis dgn sheet Excel), supaya
      // tidak ada 2 sumber kebenaran & user tidak perlu mapping manual.
      cost_estimate: g(r, "cost_estimate"),
      // Actual_* - opsional, RAW (actual_rev_3m TIDAK dihitung ulang di sini
      // atau di RPC - beda dgn target_rev_3m). Kalau baris ini tidak ada data
      // actual sama sekali di file (kolom2 ini tidak di-mapping), semuanya
      // null & activity tetap berstatus normal "Menunggu Laporan".
      actual_sp: g(r, "actual_sp"),
      actual_fwa: g(r, "actual_fwa"),
      actual_rebuy_sp: g(r, "actual_rebuy_sp"),
      actual_rebuy_fwa: g(r, "actual_rebuy_fwa"),
      actual_rev_3m: g(r, "actual_rev_3m"),
      cost_actual: g(r, "cost_actual"),
      ket: g(r, "ket") == null ? null : String(g(r, "ket")).trim(),
    });
  }
  return out;
}

/** Kirim baris hasil mapping ke RPC mh_import_plan_batch, dipecah per CHUNK
 * baris (file besar bisa ribuan baris - satu payload jsonb raksasa lebih
 * rawan timeout). Progress dilaporkan via onProgress(doneRows, totalRows). */
export async function runPlanImport(dbRows, { callerEmail, filename, sheetName }, onProgress) {
  const total = dbRows.length;
  let imported = 0, quarantined = 0, done = 0;
  const quarantinePreview = [];
  const batchIds = [];
  for (let i = 0; i < total; i += CHUNK) {
    const chunk = dbRows.slice(i, i + CHUNK);
    const { data, error } = await supabaseMarta.rpc("mh_import_plan_batch", {
      p_rows: chunk,
      p_caller_email: callerEmail,
      p_filename: filename || null,
      p_sheet_name: sheetName || null,
    });
    if (error) throw error;
    imported += data.imported || 0;
    quarantined += data.quarantined || 0;
    if (Array.isArray(data.quarantine_preview)) quarantinePreview.push(...data.quarantine_preview);
    if (data.batch_id) batchIds.push(data.batch_id);
    done += chunk.length;
    onProgress?.(done, total);
  }
  return { total, imported, quarantined, quarantinePreview, batchIds };
}

export async function fetchImportBatches() {
  const { data, error } = await supabaseMarta.rpc("mh_list_import_batches");
  if (error) throw error;
  return data || [];
}

export async function fetchImportQuarantine(batchId = null, onlyUnresolved = true) {
  const { data, error } = await supabaseMarta.rpc("mh_list_import_quarantine", { p_batch_id: batchId, p_only_unresolved: onlyUnresolved });
  if (error) throw error;
  return data || [];
}

export async function resolveImportQuarantine(id, callerEmail) {
  const { error } = await supabaseMarta.rpc("mh_resolve_import_quarantine", { p_id: id, p_caller_email: callerEmail });
  if (error) throw error;
}

/** Hapus PERMANEN sekumpulan baris karantina (beda dgn resolve/"Selesai
 * Dicek" yg cuma menandai) - dipakai tombol Hapus per baris & "Hapus Semua"
 * (bisa dikombinasikan dgn filter tanggal di UI). */
export async function deleteImportQuarantine(ids, callerEmail) {
  const { data, error } = await supabaseMarta.rpc("mh_delete_import_quarantine", { p_ids: ids, p_caller_email: callerEmail });
  if (error) throw error;
  return data;
}
