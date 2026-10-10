import { NextResponse } from "next/server";

// DEPRECATED - endpoint ini TIDAK dipakai lagi. Pembuatan/pencabutan akses
// akun "Marketing Sumatera (Program)" sekarang dilakukan LANGSUNG dari
// client (app/martahub/assignments/page.jsx, komponen ProgramAccountSlotRow)
// via supabase.auth.signUp() + RPC marta_admin_create_program_profile /
// update RLS biasa - SENGAJA tanpa service-role key (lihat migrasi
// marta_program_account_rpcs di project TraceHub). File ini dibiarkan ada
// (bukan dihapus) krn keterbatasan izin hapus file di lingkungan ini -
// responnya 410 Gone kalau masih ada yang memanggil rute lama ini.
function gone() {
  return NextResponse.json({ success: false, message: "Endpoint ini sudah tidak dipakai - lihat komentar di route.js." }, { status: 410 });
}
export async function GET() { return gone(); }
export async function POST() { return gone(); }
export async function DELETE() { return gone(); }
