// app/api/report-merge/perf-recipients/route.js
// Smart Mail Sumatera > Performance Report: daftar penerima (To & Cc) per
// kategori. Dipakai untuk Head of Area (kategori "hoa"); MDI/SDP sekarang
// memakai sheet Master_Mapping di Excel yang diupload. Disimpan di rm_app_settings
// (key "perf_recipients_<kategori>", value = JSON array) supaya tidak perlu
// tabel baru. Tiap baris: { kunci, nama, to, cc }. Kunci = isi kolom kunci
// di Excel (Nama Sales / Nama MDI / ID SDP), dicocokkan tanpa beda huruf besar/kecil.
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../lib/reportMerge/auth";
import { getSetting, setSetting } from "../../../../lib/reportMerge/settings";

const KATEGORI = ["internal_sales", "mdi", "sdp", "hor", "hoa"]; // hor = Head of Region (kunci = region), hoa = Head of Area (kunci = area)
const EMAIL_RE = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

const normKunci = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ").toLowerCase();
const splitEmails = (s) => String(s == null ? "" : s).split(/[;,\s]+/).map((e) => e.trim()).filter(Boolean);

async function readKategori(supabaseAdmin, kategori) {
  const raw = await getSetting(supabaseAdmin, "perf_recipients_" + kategori);
  try {
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

export async function GET(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  try {
    const recipients = {};
    for (const k of KATEGORI) recipients[k] = await readKategori(auth.supabaseAdmin, k);
    return NextResponse.json({ ok: true, recipients });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

// PUT { kategori, rows: [{kunci, nama, to, cc}] } -> ganti seluruh daftar kategori itu.
export async function PUT(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const kategori = String(body.kategori || "");
  if (!KATEGORI.includes(kategori)) {
    return NextResponse.json({ ok: false, error: "Kategori tidak dikenal." }, { status: 400 });
  }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const seen = new Set();
  const clean = [];
  const errors = [];
  rows.forEach((r, i) => {
    const kunci = String((r && r.kunci) || "").trim().replace(/\s+/g, " ");
    if (!kunci) return; // baris kosong diabaikan
    const key = normKunci(kunci);
    if (seen.has(key)) { errors.push(`Baris ${i + 1}: kunci "${kunci}" dobel.`); return; }
    seen.add(key);
    const to = splitEmails(r.to);
    const cc = splitEmails(r.cc);
    const salah = [...to, ...cc].filter((e) => !EMAIL_RE.test(e));
    if (!to.length) errors.push(`Baris ${i + 1} (${kunci}): To masih kosong.`);
    if (salah.length) errors.push(`Baris ${i + 1} (${kunci}): email tidak valid ${salah.join(", ")}.`);
    clean.push({ kunci, nama: String((r && r.nama) || "").trim(), to: to.join("; "), cc: cc.join("; ") });
  });
  if (errors.length) {
    return NextResponse.json({ ok: false, error: errors.slice(0, 8).join("\n") + (errors.length > 8 ? `\n…dan ${errors.length - 8} lainnya.` : "") }, { status: 400 });
  }
  try {
    await setSetting(auth.supabaseAdmin, "perf_recipients_" + kategori, JSON.stringify(clean));
    return NextResponse.json({ ok: true, rows: clean });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
