// app/api/smart-mail/[...path]/route.js
// Semua endpoint Smart Mail Sumatera (Partner SDP & Partner MDI) di SandraHub.
// Isi endpoint ada di lib/smartMail/server.js + mdi.js (salinan kode asli),
// file ini hanya meneruskan request:
//   /api/smart-mail/templates        -> '/api/templates'      (endpoint asli)
//   /api/smart-mail/mdi/send-emails  -> '/api/mdi/send-emails'
//   /api/smart-mail/upload-sdp       -> '/upload-sdp'
//   /api/smart-mail/downloads/x.pdf  -> '/downloads/x.pdf'
//   /api/smart-mail/approve-document -> '/approve-document'   (dibuka approver dari email)
// Akses: sama dengan Report Merge (lib/reportMerge/auth.js). Pengecualian:
// halaman approval & unduhan PDF, yang di aplikasi asli juga dibuka lewat
// link tanpa login (approver dari email, pratinjau PDF di tab baru). Halaman
// approval dilindungi token acak per pengajuan (lihat lib/smartMail/server.js).
import { NextResponse } from "next/server";
import { requireReportMergeAccess } from "../../../../lib/reportMerge/auth";
import app from "../../../../lib/smartMail/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PUBLIC = [/^\/approve-document$/, /^\/reject-document$/, /^\/submit-reject$/, /^\/downloads\/[^/]+$/];

async function handle(req, ctx) {
  const { path: parts = [] } = await ctx.params;
  const sub = "/" + parts.map(encodeURIComponent).join("/");
  const viaApi = app.match(req.method, "/api" + sub) ? "/api" + sub : null;
  const target = viaApi || sub;

  // Tombol "Mode Simulasi" di aplikasi memanggil approve-document TANPA token:
  // hanya boleh untuk pengguna yang login (link dari email selalu membawa token).
  const simulasi = target === "/approve-document" && req.method === "GET" && !new URL(req.url).searchParams.get("token");
  if (simulasi || !PUBLIC.some((re) => re.test(target))) {
    const auth = await requireReportMergeAccess(req);
    if (!auth.ok) return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
    return app.handle(req, target, { authed: true });
  }
  return app.handle(req, target);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
