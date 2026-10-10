import { NextResponse } from "next/server";

// DEPRECATED - endpoint ini TIDAK dipakai lagi. /marta/login sekarang
// memanggil RPC public marta_login_mode(p_email) langsung (SECURITY
// DEFINER, lihat migrasi marta_program_account_rpcs di project TraceHub) -
// SENGAJA tanpa service-role key. File ini dibiarkan ada (bukan dihapus)
// krn keterbatasan izin hapus file di lingkungan ini.
export async function GET() {
  return NextResponse.json({ mode: "password" }, { status: 410 });
}
