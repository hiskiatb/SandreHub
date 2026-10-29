// Supabase Edge Function: ao-export-xlsx
//
// Builds the "Export Data" .xlsx for MartaHub's Pendataan Outlet CMS,
// server-side, so it no longer freezes the browser and is not bound to
// Vercel's serverless timeout. Triggered fire-and-forget from the Next.js
// client with { job_id }; writes progress + the final file to the
// `ao_export_jobs` row / `ao-exports` storage bucket, which the client polls.
//
// HISTORY - read before changing the photo-column logic below:
//
// 1) Embedded-bytes approach (original): downloaded each photo from
//    `ao-photos` storage and embedded the full-resolution JPEG bytes
//    directly into the workbook via `wb.addImage` / `ws.addImage`. ExcelJS
//    has no streaming writer - the ENTIRE workbook (every embedded image
//    buffer) must be resident in memory for the single final
//    `wb.xlsx.writeBuffer()` call. On a real 289-row / ~900-photo job the
//    isolate was killed by its MEMORY limit ("Memory limit exceeded"),
//    dying ~41s in - full-res camera photos are several MB each, so a few
//    hundred of them is a GB+ of image bytes. This capped the feature at a
//    small number of rows (MAX_ROWS_WITH_PHOTOS).
//
// 2) Thumbnail approach (2026-10-29, briefly tried, never deployed): resize
//    + re-encode every photo as a small JPEG thumbnail (ImageScript, pure
//    WASM, Deno-native) BEFORE embedding, so each embedded image was ~10-30KB
//    instead of multi-MB. This fixed the memory ceiling but was rejected by
//    the user - they want full, original photo quality in the export, not a
//    downscaled thumbnail, so trading quality for memory headroom was not
//    acceptable.
//
// 3) Formula-based approach (CURRENT, 2026-10-29): don't touch photo bytes
//    server-side AT ALL. Instead of embedding an image, write a live
//    `=IMAGE("https://...")` formula into the photo cell, pointing at the
//    photo's public Supabase Storage URL (same URL already used by the
//    "Link foto saja" mode's hyperlink cells). The spreadsheet application
//    itself (Excel or Google Sheets) fetches and renders the image when the
//    file is opened - this function never downloads, decodes, resizes or
//    embeds anything, so there is no per-photo memory cost and therefore no
//    row cap (MAX_ROWS_WITH_PHOTOS removed entirely). This is the approach
//    the user explicitly asked for after rejecting (2) above.
//
//    COMPATIBILITY CAVEAT (important, flagged to the user, not silently
//    assumed away): `=IMAGE(url)` is a native Google Sheets function and
//    has been supported there for years. Microsoft Excel only added an
//    equivalent `=IMAGE(source)` function to Excel for Microsoft 365
//    (subscription, auto-updating channel), rolled out starting ~2024. It
//    is NOT available in perpetual-license/non-subscription Excel (Excel
//    2019, Excel 2016, etc.), in fully offline installs that haven't
//    received that update, or in any non-Microsoft/non-Google tool that
//    opens .xlsx (LibreOffice Calc, Numbers, etc.) unless that tool
//    specifically implements the same function - none are known to as of
//    this writing. Opening this file in an unsupported app shows the
//    literal formula text or a #NAME? error instead of a photo. This also
//    requires the `ao-photos` storage bucket to be PUBLIC (confirmed true
//    for this project - see `select public from storage.buckets where
//    id='ao-photos'`) since Excel/Sheets' own fetcher cannot send a
//    Supabase auth header; if the bucket were ever made private, every
//    `=IMAGE()` cell would fail to load the photo (403).
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

// Lebar kolom & tinggi baris foto - dipakai baik utk mode embed lama maupun
// sbg ukuran render utk cell berisi formula =IMAGE() (Excel/Sheets me-render
// gambar hasil IMAGE() di dalam batas cell, jadi ukuran cell msh relevan).
const PHOTO_ROW_PT = 86;

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

// Escape sebuah URL supaya aman disisipkan di dalam string literal rumus
// Excel (cuma tanda kutip ganda yg perlu di-escape, dengan menggandakannya -
// sama spt aturan escaping string literal di formula Excel/Sheets).
function escapeForFormulaString(url: string): string {
  return url.replace(/"/g, '""');
}

// Kolom teks - urutan & label HARUS sinkron dgn TEXT_COLS_BEFORE_PHOTO /
// TEXT_COLS_AFTER_PHOTO di page.jsx.
const TEXT_COLS_BEFORE_PHOTO: [string, (r: any, extra: any) => any][] = [
  ["Submission ID",  (r) => r.id],
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

      // Tidak ada lagi cap jumlah baris: mode "dengan foto" sekarang hanya
      // menulis rumus =IMAGE(url) teks per cell (lihat komentar "Formula-
      // based approach" di atas file) - tidak ada download/decode/embed
      // byte gambar sama sekali, jadi tidak ada beban memori per foto.
      // ~1046+ baris x 4 kolom foto = ribuan cell rumus kecil, jauh di bawah
      // limit praktis worksheet xlsx (1,048,576 baris / 16,384 kolom) dan
      // tidak membebani memori isolate (cuma string, bukan byte gambar).

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Data Submission");

      const headers = [
        ...TEXT_COLS_BEFORE_PHOTO.map(([label]) => label),
        ...PHOTO_COLS.map(([label]) => label),
        ...TEXT_COLS_AFTER_PHOTO.map(([label]) => label),
      ];
      ws.addRow(headers).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.columns = headers.map((h) => ({
        width: PHOTO_COLS.some(([label]) => label === h)
          ? includePhotos
            ? 18
            : 16
          : Math.max(12, Math.min(28, h.length + 4)),
      }));

      const photoColStart = TEXT_COLS_BEFORE_PHOTO.length;
      let lastReportedPct = -1;

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
        void rowNumber; // tidak dipakai lagi (dulu dibutuhkan utk ws.addImage posisi tl/ext)

        PHOTO_COLS.forEach(([, getPhoto], colOffset) => {
          const p = getPhoto(r.photos);
          if (!p) return;
          const { data: pub } = supabase.storage.from(BUCKET_PHOTOS).getPublicUrl(p.storage_path);
          if (!pub?.publicUrl) return;
          const cell = row.getCell(photoColStart + colOffset + 1);

          if (!includePhotos) {
            cell.value = { text: "Lihat foto", hyperlink: pub.publicUrl };
            cell.font = { color: { argb: "FF1D4ED8" }, underline: true };
            cell.alignment = { vertical: "middle" };
          } else {
            // Rumus live =IMAGE(url) - lihat komentar "Formula-based
            // approach" di atas file utk alasan & caveat kompatibilitas
            // Excel vs Google Sheets.
            cell.value = {
              formula: `=IMAGE("${escapeForFormulaString(pub.publicUrl)}")`,
            };
            cell.alignment = { vertical: "middle", horizontal: "center" };
          }
        });

        const pct = Math.round(((i + 1) / allRows.length) * 95);
        if (pct !== lastReportedPct) {
          lastReportedPct = pct;
          await supabase
            .from("ao_export_jobs")
            .update({ processed_rows: i + 1, updated_at: new Date().toISOString() })
            .eq("id", job_id);
        }
      }

      const buf = await wb.xlsx.writeBuffer();
      const stamp = new Date().toISOString().slice(0, 10);
      const filePath = `${job_id}/MartaHub_DataSubmission${includePhotos ? "" : "_LinkFoto"}_${stamp}.xlsx`;

      const { error: upErr } = await supabase.storage.from(BUCKET_EXPORTS).upload(filePath, buf, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
      if (upErr) throw new Error(`upload exports: ${upErr.message}`);

      await supabase
        .from("ao_export_jobs")
        .update({
          status: "done",
          file_path: filePath,
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
