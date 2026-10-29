// Supabase Edge Function: ao-export-xlsx
//
// Builds the "Export Data" .xlsx for MartaHub's Pendataan Outlet CMS,
// server-side, so it no longer freezes the browser and is not bound to
// Vercel's serverless timeout. Triggered fire-and-forget from the Next.js
// client with { job_id }; writes progress + the final file(s) to the
// `ao_export_jobs` row / `ao-exports` storage bucket, which the client polls.
//
// HISTORY - read before touching the photo-column logic below:
//
// 1) Embedded-bytes approach (original): downloaded each photo from
//    `ao-photos` storage and embedded the full-resolution JPEG bytes
//    directly into the workbook via `wb.addImage` / `ws.addImage`. ExcelJS
//    has no streaming writer - the ENTIRE workbook (every embedded image
//    buffer) must be resident in memory for the single final
//    `wb.xlsx.writeBuffer()` call. On a real 289-row / ~900-photo job the
//    isolate was killed by its MEMORY limit ("Memory limit exceeded"),
//    dying ~41s in. This capped the feature at a small number of rows
//    (MAX_ROWS_WITH_PHOTOS) in one file.
//
// 2) Thumbnail approach (briefly tried, never deployed): resize + re-encode
//    every photo as a small JPEG thumbnail before embedding. Fixed the
//    memory ceiling but was rejected by the user - they want the ORIGINAL
//    full-resolution photo bytes in the export, not a downscaled copy.
//
// 3) Formula-based approach (briefly live): wrote a live `=IMAGE("https://
//    ...")` formula into the photo cell instead of embedding anything -
//    zero per-photo memory cost, no row cap, but requires Excel 365 (online)
//    or Google Sheets to render, and needs internet access when the file is
//    opened. Rejected by the user - they want the real photo bytes sitting
//    inside the file itself, downloadable and viewable offline.
//
// 4) CURRENT (2026-10-29): embed the ORIGINAL full-resolution photo bytes
//    again (approach 1), but split the output across MULTIPLE .xlsx files
//    instead of one, so no single file's in-memory construction ever gets
//    close to the isolate's memory ceiling. This project's photos
//    aren't uniform in size (confirmed via storage.objects: ~861KB average,
//    up to 4.6MB, and that can drift as new photos are captured), so parts
//    are flushed by ACTUAL ACCUMULATED BYTES downloaded so far
//    (PART_BYTES_LIMIT), not by a guessed row count - this is what keeps it
//    safe regardless of how large any given batch of real photos turns out
//    to be. A secondary PART_ROWS_SAFETY_CAP also flushes a part if it has
//    accumulated a lot of rows with little/no photos (so a single part
//    can't grow unbounded just because its rows happen to have few images).
//    Supabase Edge Functions have a documented 256MB memory ceiling
//    (https://supabase.com/docs/guides/functions/limits) - PART_BYTES_LIMIT
//    is set far below that (see constant below) to leave headroom for
//    ExcelJS's own object graph, the zip/deflate buffers `writeBuffer()`
//    needs simultaneously, and photos already in flight (downloaded but not
//    yet embedded) when the limit is checked. Each finished part is
//    uploaded to storage and appended to `ao_export_jobs.file_parts`
//    IMMEDIATELY (not just at the very end), so the client can start
//    downloading earlier parts while later ones are still being built -
//    important since a large export can now legitimately produce several
//    GB across its parts and take a while.
//
// CORS FIX (2026-10-29): this function had no OPTIONS preflight handling and
// no Access-Control-Allow-* headers on any response, so the browser's CORS
// preflight failed and supabase-js surfaced "Failed to send a request to the
// Edge Function" client-side - the real POST never even went out. Copied the
// exact CORS header set/pattern already used by the `locationiq` function in
// this same project (see its CORS const + the `if (req.method === "OPTIONS")`
// branch) so this function behaves consistently with the rest of the
// codebase. No business logic below this point was changed.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import ExcelJS from "npm:exceljs@4.4.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET_PHOTOS = "ao-photos";
const BUCKET_EXPORTS = "ao-exports";
const PAGE_SIZE = 500; // halaman saat menarik baris dari ao_list_submissions

// Lebar kolom & tinggi baris foto.
const PHOTO_ROW_PT = 86;
const PHOTO_CELL_PX = 110; // ukuran TAMPIL di cell - independen dari resolusi asli file yg di-embed

// Ambang batas BYTE (bukan jumlah baris) utk memutuskan kapan 1 file .xlsx
// "bagian" ditutup & diupload, lalu mulai file baru. Lihat komentar
// "CURRENT" panjang di atas file utk kenapa ini byte-based, bukan row-based.
// Supabase Edge Functions punya limit memori 256MB (dokumentasi resmi) -
// 50MB foto mentah per bagian menyisakan margin besar (~5x) utk overhead
// ExcelJS, buffer kompresi zip `writeBuffer()`, dan foto yg sedang
// didownload (in-flight) saat ambang ini dicek.
const PART_BYTES_LIMIT = 50 * 1024 * 1024;
// Jaring pengaman sekunder: kalau baris2-nya kebetulan sedikit/tanpa foto,
// 1 bagian tetap ditutup setelah sekian baris supaya file tidak membesar
// tanpa batas (bukan soal memori, cuma kerapihan ukuran per file).
const PART_ROWS_SAFETY_CAP = 300;

// Sama persis dgn pola CORS yg dipakai `locationiq` di project ini.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", Connection: "keep-alive" },
  });
}

// Sama persis dgn tanggal/jam yg dihitung client-side (toLocaleDateString/
// toLocaleTimeString "id-ID"), tapi di-pin ke Asia/Jakarta krn edge function
// tidak punya timezone browser user.
function formatTanggalJam(createdAt: string) {
  const d = new Date(createdAt);
  const tanggal = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const jam = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return { tanggal, jam };
}

function findPhoto(photos: any[], jenis: string, urutan?: number) {
  if (!photos) return null;
  return (
    photos.find((p) => p.jenis === jenis && (urutan == null || p.urutan === urutan)) || null
  );
}

// ExcelJS `addImage` butuh salah satu dari 'jpeg' | 'png' | 'gif' - ditebak
// dari ekstensi storage_path, default ke 'jpeg' (mayoritas foto kamera di
// project ini) kalau ekstensinya tak dikenali / tak ada.
function guessImageExtension(storagePath: string): "jpeg" | "png" | "gif" {
  const m = /\.([a-z0-9]+)$/i.exec(storagePath || "");
  const ext = (m?.[1] || "").toLowerCase();
  if (ext === "png") return "png";
  if (ext === "gif") return "gif";
  return "jpeg"; // termasuk "jpg"
}

// Kolom teks - urutan & label HARUS sinkron dgn TEXT_COLS_BEFORE_PHOTO /
// TEXT_COLS_AFTER_PHOTO di page.jsx.
const TEXT_COLS_BEFORE_PHOTO: [string, (r: any, extra: any) => any][] = [
  ["Submission ID", (r) => r.id],
  ["Tanggal", (_r, extra) => extra.tanggal],
  ["Waktu", (_r, extra) => extra.jam],
  ["Nama Sender", (r) => r.nama_sender || ""],
  ["Nama Outlet", (r) => r.nama_outlet || ""],
  ["ID Outlet IM3", (r) => r.outlet_id_im3 || ""],
  ["ID Outlet 3ID", (r) => r.outlet_id_3id || ""],
  ["Branch", (r) => r.branch || ""],
  ["Kecamatan", (r) => r.district || ""],
  ["Nama DSE", (r) => r.dse_name || ""],
];

const PHOTO_COLS: [string, (photos: any[]) => any][] = [
  ["Foto Etalase 1", (photos) => findPhoto(photos, "etalase", 1)],
  ["Foto Etalase 2", (photos) => findPhoto(photos, "etalase", 2)],
  ["Foto Etalase 3", (photos) => findPhoto(photos, "etalase", 3)],
  ["Foto Tampak Depan", (photos) => findPhoto(photos, "tapak_depan")],
];

const TEXT_COLS_AFTER_PHOTO: [string, (r: any) => any][] = [
  ["Social Media", (r) => r.social_media || ""],
  ["Visibility Poster", (r) => r.vis_poster ?? ""],
  ["Visibility Shopblind", (r) => r.vis_shopblind ?? ""],
  ["Visibility Flagchain", (r) => r.vis_flagchain ?? ""],
  ["Visibility Table Mate / Tent Card", (r) => r.vis_tablemate ?? ""],
  ["Visibility Sticker Etalase", (r) => r.vis_sticker_etalase ?? ""],
  ["Visibility Score", (r) => r.visibility_score ?? ""],
  ["Varian SP IM3", (r) => r.sp_im3 || ""],
  ["Varian SP 3ID", (r) => r.sp_3id || ""],
  ["Varian Voucher IM3", (r) => r.voucher_im3 || ""],
  ["Varian Voucher 3ID", (r) => r.voucher_3id || ""],
  ["Availability Score", (r) => r.availability_score ?? ""],
  ["Completeness", (r) => r.completeness || ""],
  ["Status", (r) => r.status || ""],
  ["GPS Latitude", (r) => r.latitude ?? ""],
  ["GPS Longitude", (r) => r.longitude ?? ""],
  [
    "Jarak ke Outlet (m)",
    (r) => (r.distance_to_outlet_m == null ? "" : Math.round(r.distance_to_outlet_m)),
  ],
  ["Radius Score", (r) => (r.radius_score == null ? "" : r.radius_score)],
  ["Submitted At", (r) => r.created_at],
];

const HEADERS = [
  ...TEXT_COLS_BEFORE_PHOTO.map(([label]) => label),
  ...PHOTO_COLS.map(([label]) => label),
  ...TEXT_COLS_AFTER_PHOTO.map(([label]) => label),
];
const PHOTO_COL_START = TEXT_COLS_BEFORE_PHOTO.length;

// Bikin 1 workbook/worksheet "bagian" baru (header + lebar kolom) - dipakai
// di awal export & setiap kali bagian sebelumnya ditutup/diupload.
function newPartWorkbook(includePhotos: boolean) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data Submission");
  ws.addRow(HEADERS).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.columns = HEADERS.map((h) => ({
    width: PHOTO_COLS.some(([label]) => label === h)
      ? includePhotos ? 18 : 16
      : Math.max(12, Math.min(28, h.length + 4)),
  }));
  return { wb, ws };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let job_id: string | undefined;
  try {
    const body = await req.json();
    job_id = body?.job_id;
  } catch {
    // ignore - validated below
  }
  if (!job_id) return jsonResponse({ error: "job_id is required" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: job, error: jobErr } = await supabase
    .from("ao_export_jobs")
    .select("*")
    .eq("id", job_id)
    .single();
  if (jobErr || !job) return jsonResponse({ error: "job not found" }, 404);

  const params = job.params || {};
  const dateFrom = params.date_from ?? null;
  const dateTo = params.date_to ?? null;
  const search = params.search ?? null;
  const includePhotos = params.include_photos !== false; // default true

  const work = (async () => {
    const fileParts: { path: string; size_bytes: number; rows: number; row_from: number; row_to: number }[] = [];
    try {
      await supabase
        .from("ao_export_jobs")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", job_id);

      // Tarik SEMUA baris yg cocok filter, paging via p_limit/p_offset -
      // sama seperti CMS lakukan utk mengisi tabel Data Submission.
      const allRows: any[] = [];
      let offset = 0;
      // deno-lint-ignore no-constant-condition
      while (true) {
        const { data: page, error: pageErr } = await supabase.rpc("ao_list_submissions", {
          p_date_from: dateFrom,
          p_date_to: dateTo,
          p_search: search,
          p_limit: PAGE_SIZE,
          p_offset: offset,
        });
        if (pageErr) throw new Error(`ao_list_submissions: ${pageErr.message}`);
        if (!page || page.length === 0) break;
        allRows.push(...page);
        offset += PAGE_SIZE;
        if (page.length < PAGE_SIZE) break;
      }

      await supabase
        .from("ao_export_jobs")
        .update({ total_rows: allRows.length, updated_at: new Date().toISOString() })
        .eq("id", job_id);

      const stamp = new Date().toISOString().slice(0, 10);

      // Tidak ada lagi cap jumlah baris: mode "dengan foto" skrg embed byte
      // foto ASLI (resolusi penuh) lagi, tapi dipecah otomatis jadi
      // beberapa file .xlsx berbasis AKUMULASI BYTE foto yg sudah
      // didownload (PART_BYTES_LIMIT) - lihat komentar panjang "CURRENT" di
      // atas file. Mode "Link foto saja" (includePhotos=false) tidak
      // berubah - tetap 1 file, cuma hyperlink teks, tanpa download apa pun.
      let { wb, ws } = newPartWorkbook(includePhotos);
      let partIndex = 1;
      let partBytes = 0;
      let partRows = 0;
      let partRowFrom = 1; // 1-based index ke allRows utk baris pertama di bagian ini (belum di-flush)
      let lastReportedRows = -1; // throttle update processed_rows - jangan tulis DB di SETIAP baris (2000 baris = 2000 round-trip, bisa kena wall-clock limit)

      // Menutup bagian yg sedang dibangun: upload ke storage, catat
      // metadata-nya ke fileParts + update job row (inkremental - klien
      // bisa mulai download bagian ini begitu siap, walau bagian2
      // berikutnya masih diproses), lalu kembalikan jumlah baris yg baru
      // ditutup supaya caller bisa menghitung partRowFrom bagian berikutnya
      // sendiri (fungsi ini TIDAK menyentuh partRowFrom/partRows/partBytes
      // milik caller - caller yg reset setelah memanggil ini).
      async function flushPart(): Promise<number> {
        const rowsInThisPart = partRows;
        if (rowsInThisPart === 0) return 0; // tidak ada apa2 utk ditutup (misal allRows kosong)
        const buf = await wb.xlsx.writeBuffer();
        const suffix = includePhotos ? `_bagian${String(partIndex).padStart(3, "0")}` : "";
        const filePath = `${job_id}/MartaHub_DataSubmission${suffix}_${stamp}.xlsx`;
        const { error: upErr } = await supabase.storage.from(BUCKET_EXPORTS).upload(filePath, buf, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });
        if (upErr) throw new Error(`upload exports (bagian ${partIndex}): ${upErr.message}`);

        fileParts.push({
          path: filePath,
          size_bytes: buf.byteLength,
          rows: rowsInThisPart,
          row_from: partRowFrom,
          row_to: partRowFrom + rowsInThisPart - 1,
        });

        await supabase
          .from("ao_export_jobs")
          .update({
            file_parts: fileParts,
            processed_rows: partRowFrom + rowsInThisPart - 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);

        partIndex += 1;
        return rowsInThisPart;
      }

      for (let i = 0; i < allRows.length; i++) {
        const r = allRows[i];
        const { tanggal, jam } = formatTanggalJam(r.created_at);
        const extra = { tanggal, jam };
        const rowVals = [
          ...TEXT_COLS_BEFORE_PHOTO.map(([, get]) => get(r, extra)),
          ...PHOTO_COLS.map(() => ""),
          ...TEXT_COLS_AFTER_PHOTO.map(([, get]) => get(r)),
        ];
        const row = ws.addRow(rowVals);
        if (includePhotos) row.height = PHOTO_ROW_PT;
        const rowNumber = row.number;

        PHOTO_COLS.forEach(([, getPhoto], colOffset) => {
          const p = getPhoto(r.photos);
          if (!p) return;
          const { data: pub } = supabase.storage.from(BUCKET_PHOTOS).getPublicUrl(p.storage_path);
          if (!pub?.publicUrl) return;
          const cell = row.getCell(PHOTO_COL_START + colOffset + 1);
          if (!includePhotos) {
            cell.value = { text: pub.publicUrl, hyperlink: pub.publicUrl };
            cell.font = { color: { argb: "FF1D4ED8" }, underline: true };
            cell.alignment = { vertical: "middle" };
          }
        });

        if (includePhotos) {
          // Download + embed foto ASLI (resolusi penuh, tanpa resize) utk
          // baris ini. Max 4 foto/baris, didownload paralel (Promise.all) -
          // ini sudah dites aman: 1 baris sekaligus, bukan semua baris.
          await Promise.all(
            PHOTO_COLS.map(async ([, getPhoto], colOffset) => {
              const p = getPhoto(r.photos);
              if (!p) return;
              try {
                const { data: blob, error: dlErr } = await supabase.storage
                  .from(BUCKET_PHOTOS)
                  .download(p.storage_path);
                if (dlErr || !blob) return;
                const buf = await blob.arrayBuffer();
                partBytes += buf.byteLength;
                const imageId = wb.addImage({ buffer: buf, extension: guessImageExtension(p.storage_path) });
                const col0 = PHOTO_COL_START + colOffset;
                ws.addImage(imageId, {
                  tl: { col: col0 + 0.06, row: rowNumber - 1 + 0.06 },
                  ext: { width: PHOTO_CELL_PX, height: PHOTO_CELL_PX },
                  editAs: "oneCell",
                });
              } catch {
                // 1 foto gagal (download/decoding) jangan sampai gagalkan
                // baris/export lainnya - sama spt perilaku lama.
              }
            })
          );
        }

        partRows += 1;

        // Throttle: cuma tulis processed_rows ke DB kalau berubah >=1% dari
        // total, atau ini baris terakhir - bukan di setiap baris (lihat
        // komentar lastReportedRows di atas). flushPart() di bawah tetap
        // selalu menulis processed_rows yg akurat sendiri, jadi progress
        // yg ditampilkan ke user tidak pernah telat lebih dari 1 bagian.
        const sofar = partRowFrom - 1 + partRows;
        const step = Math.max(1, Math.floor(allRows.length / 100));
        if (sofar - lastReportedRows >= step || sofar === allRows.length) {
          lastReportedRows = sofar;
          await supabase
            .from("ao_export_jobs")
            .update({ processed_rows: sofar, updated_at: new Date().toISOString() })
            .eq("id", job_id);
        }

        // Ambang batas BYTE (bukan jumlah baris) - lihat komentar
        // PART_BYTES_LIMIT di atas file. Dicek SETELAH baris ini selesai
        // (tidak memotong baris di tengah foto-fotonya). Mode "Link foto
        // saja" (includePhotos=false) tidak men-download apa pun jadi
        // partBytes selalu 0 di sana - praktis cuma akan di-flush 1x di
        // akhir (baris terakhir), yaitu 1 file spt perilaku lama.
        const isLastRow = i === allRows.length - 1;
        const shouldFlush = isLastRow || (includePhotos && (partBytes >= PART_BYTES_LIMIT || partRows >= PART_ROWS_SAFETY_CAP));
        if (shouldFlush) {
          const flushedRows = await flushPart();
          partRowFrom += flushedRows;
          partBytes = 0;
          partRows = 0;
          if (!isLastRow) {
            // Bagian berikutnya butuh workbook baru - yg lama (dgn semua
            // buffer foto yg sudah ditulis) dibuang begitu variabel wb/ws
            // di-reassign, sehingga GC bisa membebaskan memorinya sebelum
            // bagian berikutnya mulai menumpuk foto baru.
            ({ wb, ws } = newPartWorkbook(includePhotos));
          }
        }
      }

      await supabase
        .from("ao_export_jobs")
        .update({
          status: "done",
          file_parts: fileParts,
          processed_rows: allRows.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id);
    } catch (e) {
      await supabase
        .from("ao_export_jobs")
        .update({
          status: "error",
          error_message: String(e?.message || e),
          file_parts: fileParts,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id);
    }
  })();

  // EdgeRuntime.waitUntil keeps the background work alive after the
  // response below is sent (fire-and-forget from the client's perspective).
  // @ts-ignore - global provided by the Supabase Edge Runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work);
  } else {
    await work;
  }

  return jsonResponse({ ok: true, job_id });
});
