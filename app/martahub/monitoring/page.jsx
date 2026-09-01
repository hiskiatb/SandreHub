"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Menu "Activity Monitoring" sudah DISATUKAN ke dalam Activity Plan (satu menu, satu
// tabel, bisa lihat semua + status + detail sekaligus) - route ini
// dipertahankan (bukan dihapus) supaya bookmark/link lama tidak 404, tapi
// langsung dialihkan ke tab yang sesuai di /martahub/activities.
export default function MonitoringRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/martahub/activities?tab=monitoring"); }, [router]);
  return null;
}
