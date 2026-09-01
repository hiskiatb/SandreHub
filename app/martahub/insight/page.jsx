"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Menu "Performance Insight" sudah DISATUKAN ke dalam Productivity Analytics
// (satu menu, satu halaman - productivity trend + ranking cabang + catatan
// insight lapangan sekaligus) - route ini dipertahankan (bukan dihapus)
// supaya bookmark/link lama tidak 404, tapi langsung dialihkan.
export default function InsightRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/martahub/analytics"); }, [router]);
  return null;
}
