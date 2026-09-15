"use client";
/**
 * Presence realtime bersama ("sedang aktif") - dipakai CMS
 * (app/martahub/assignments/page.jsx) & mobile
 * (app/martahub/m/user-management/page.jsx) utk badge status login tiap
 * orang di User Management.
 *
 * SEBELUMNYA: tiap komponen (OrgHierarchyView, TeamView, SuperAdminSection,
 * dst) memanggil mh_list_presence() SEKALI saat halaman dibuka lalu tidak
 * pernah lagi - jadi kalau ada orang lain login/logout SELAGI halaman ini
 * terbuka, statusnya baru kelihatan setelah user menekan refresh manual.
 * Ambang "aktif 3 menit" (ACTIVE_WINDOW_MS di halaman masing2) juga tidak
 * pernah dihitung ulang scr berkala krn tidak ada yg memicu re-render, jadi
 * badge hijau bisa nyangkut terus walau orangnya sudah lama menutup app.
 *
 * Perbaikan di sini - SATU langganan realtime BERSAMA (pola modul-level sama
 * dgn _branchMapPromise di martaScope.js), bukan satu channel per komponen:
 *   1. Berlangganan ke tabel mh_presence (sudah ditambahkan ke publication
 *      supabase_realtime - lihat migrasi mh_presence_realtime_publication) -
 *      begitu SIAPA PUN mengirim heartbeat baru (tiap 45 detik selagi tab
 *      mereka terbuka & visible, lihat HB_INTERVAL_MS di MobileShell/
 *      MartaShell), semua layar yang sedang menampilkan badge presence
 *      langsung ter-update TANPA refresh.
 *   2. Detak berkala independen (murni client-side, TIDAK ada request
 *      jaringan) - supaya ambang "aktif" juga otomatis KEDALUWARSA di layar
 *      seiring waktu, walau tidak ada perubahan presence apa pun (mis. org
 *      lain menutup app-nya diam2 tanpa event terkirim).
 *
 * Best-effort penuh, sama spt pola realtime lain di app ini (channel guard
 * MobileShell dst): kalau subscribe/koneksi gagal (browser lama, jaringan
 * korporat yg block websocket, dll), fallback diam2 ke snapshot RPC
 * terakhir yg berhasil - TIDAK PERNAH melempar error yg mengganggu data lain
 * di halaman User Management.
 */
import { useEffect, useState } from "react";
import supabaseMarta from "./supabaseMarta";

// email(lowercase) → { last_seen_at, app } - satu peta dipakai bersama semua
// komponen/tab yang membuka hook ini, supaya cuma ADA SATU channel realtime
// per tab browser (bukan satu per komponen yang menampilkan presence).
let _presenceMap = new Map();
let _listeners = new Set();
let _channel = null;
let _seeded = false;

function notify() {
  for (const fn of Array.from(_listeners)) { try { fn(); } catch { /* noop - satu listener gagal tidak boleh menghentikan yg lain */ } }
}

function ensureChannel() {
  if (_channel) return;
  try {
    _channel = supabaseMarta
      .channel("mh-presence-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "mh_presence" }, (payload) => {
        const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) || null;
        if (!row?.email) return;
        const email = String(row.email).toLowerCase();
        if (payload.eventType === "DELETE") _presenceMap.delete(email);
        else _presenceMap.set(email, { last_seen_at: row.last_seen_at, app: row.app ?? null });
        notify();
      })
      .subscribe();
  } catch { /* realtime opsional - halaman tetap jalan pakai snapshot RPC awal */ }
}

async function seedOnce() {
  if (_seeded) return;
  _seeded = true;
  try {
    const { data, error } = await supabaseMarta.rpc("mh_list_presence");
    if (!error && data) {
      for (const r of data) if (r?.email) _presenceMap.set(String(r.email).toLowerCase(), { last_seen_at: r.last_seen_at, app: r.app ?? null });
      notify();
    }
  } catch { /* best-effort - kalau gagal, peta tetap kosong & akan dicoba lagi oleh subscriber berikutnya */ }
}

/**
 * Hook - kembalikan array {email,last_seen_at,app} TERKINI, bentuknya SAMA
 * PERSIS dgn hasil mh_list_presence() lama (drop-in replacement) supaya
 * mergePresence() yang sudah ada di tiap halaman tidak perlu diubah sama
 * sekali. Otomatis memicu re-render tiap ada perubahan realtime ATAU tiap
 * `tickMs` (default 15 detik) - biar ambang "aktif" ikut basi seiring waktu
 * walau tidak ada presence baru.
 */
export function useLivePresenceRows(tickMs = 15_000) {
  const [, setTick] = useState(0);

  useEffect(() => {
    seedOnce();
    ensureChannel();
    const listener = () => setTick((n) => n + 1);
    _listeners.add(listener);
    const t = setInterval(listener, tickMs);
    return () => { _listeners.delete(listener); clearInterval(t); };
  }, [tickMs]);

  const rows = [];
  for (const [email, v] of _presenceMap) rows.push({ email, last_seen_at: v.last_seen_at, app: v.app });
  return rows;
}
