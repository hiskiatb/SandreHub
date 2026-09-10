// app/api/report-merge/draft-email/route.js
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../lib/reportMerge/auth";

const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const ANTHROPIC_MODEL = (process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001").trim();

export async function POST(req) {
  const auth = await requireReportMergeAccess(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({
      ok: false,
      error: "ANTHROPIC_API_KEY belum diisi di environment. Ambil API key dari console.anthropic.com/settings/keys.",
    }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const judul = String(body.judul || "").trim();
  const periode = String(body.periode || "").trim();
  const namaContoh = String(body.namaContoh || "Mitra").trim();
  const introSaatIni = String(body.intro || "").trim();
  const closingSaatIni = String(body.closing || "").trim();
  const instruksi = String(body.instruksi || "").trim();

  const systemPrompt =
    "Anda menulis paragraf pembuka & penutup email laporan bisnis berbahasa Indonesia, formal namun ramah, " +
    "untuk tim Sales Performance Management — Indosat Ooredoo Hutchison Circle Sumatera, dikirim ke mitra/kiosk. " +
    "ATURAN WAJIB — token placeholder berikut, jika relevan, HARUS ditulis PERSIS apa adanya (jangan diterjemahkan, " +
    "diubah, atau dihapus): {nama} {judul} {periode} {jumlah}. Jangan sertakan salam tanda tangan di luar yang " +
    'diminta. Jangan sertakan penjelasan apa pun di luar isi paragraf. Balas HANYA dengan JSON valid persis dalam ' +
    'bentuk {"intro":"...","closing":"..."} — tanpa markdown, tanpa teks lain.';

  const userPrompt = [
    `Judul laporan: ${judul || "(tidak diisi)"}`,
    `Periode: ${periode || "(tidak diisi)"}`,
    `Contoh nama penerima: ${namaContoh}`,
    "",
    `Draft pembuka saat ini:\n${introSaatIni || "(kosong)"}`,
    "",
    `Draft penutup saat ini:\n${closingSaatIni || "(kosong)"}`,
    "",
    instruksi
      ? `Instruksi dari pengguna untuk revisi ini: ${instruksi}`
      : "Tidak ada instruksi khusus — perbaiki/rapikan saja kualitas tulisannya.",
    "",
    "Tulis ulang paragraf pembuka dan penutup sesuai aturan di atas.",
  ].join("\n");

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      throw new Error((data.error && data.error.message) || `Anthropic API menolak (HTTP ${r.status}).`);
    }
    const raw = (data.content && data.content[0] && data.content[0].text) || "";
    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch (e) {
      throw new Error("Balasan AI tidak berupa JSON yang valid — coba lagi.");
    }
    if (!parsed.intro || !parsed.closing) {
      throw new Error("Balasan AI tidak lengkap (intro/closing kosong) — coba lagi.");
    }
    return NextResponse.json({ ok: true, intro: parsed.intro, closing: parsed.closing });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
