"use client";
/**
 * /martahub/m/activities - Daftar aktivitas BME/RGE dengan tab filter status,
 * data dari `mh_activities_for_me()` (RPC scoping sama dgn app Flutter).
 */
import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Plus, MoreVertical, Trash2, CheckCircle2, AlertCircle, ChevronRight } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../_shared/MobileShell";
import { statusMeta, fmtDate, fmtInt, isDraftIncomplete } from "../_shared/activityUi";
import DeleteActivitySheet from "../_shared/DeleteActivitySheet";

// created_by + field2 wizard (poi_type, event_categories, plan_date_start,
// plan_dates_multi) ditambahkan supaya kartu daftar bisa (a) gerbang opsi
// hapus hanya utk pemilik plan, DAN (b) pakai definisi "draft belum lengkap"
// yg SAMA PERSIS dgn halaman detail (lihat isDraftIncomplete di activityUi.js).
const ACTIVITY_COLS = "id,event_name,brand,mc,site_id,event_category,event_categories,plan_date,plan_date_start,plan_dates_multi,poi_type,status,target_sp,target_fwa,actual_sp,actual_fwa,checkin_valid,validation_note,created_at,created_by";

const TABS = [
  { key: "all", label: "Semua" },
  { key: "draft", label: "Draft" },
  { key: "plan_submitted", label: "Menunggu Approval" },
  { key: "revision_needed", label: "Revisi" },
  { key: "approved", label: "Disetujui" },
  { key: "pending_validation", label: "Validasi" },
  { key: "revision_actual", label: "Revisi Report" },
];

function ActivitiesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openId = searchParams.get("open");
  const initialTab = searchParams.get("tab");
  const { loading, userId } = useMartaSession();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState(initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : "all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  // SATU state hapus dipakai baik dari kebab-menu kartu daftar maupun dari
  // tombol "Hapus Plan" di DetailSheet quick-view - keduanya cuma memicu
  // sheet konfirmasi yg sama (DeleteActivitySheet), bukan alur terpisah.
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name } | null

  useEffect(() => {
    if (loading) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabaseMarta
          .rpc("mh_activities_for_me")
          .select(ACTIVITY_COLS)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        if (alive) setRows(data || []);
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat aktivitas");
      }
    })();
    return () => { alive = false; };
  }, [loading]);

  useEffect(() => {
    if (openId && rows) setDetail(rows.find((r) => r.id === openId) || null);
  }, [openId, rows]);

  const counts = useMemo(() => {
    const c = { all: rows?.length || 0 };
    for (const r of rows || []) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows || [];
    if (tab !== "all") list = list.filter((r) => r.status === tab);
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((r) => (r.event_name || "").toLowerCase().includes(term) || (r.mc || "").toLowerCase().includes(term) || (r.site_id || "").toLowerCase().includes(term));
    return list;
  }, [rows, tab, q]);

  const draftIncompleteCount = useMemo(
    () => (rows || []).filter((r) => userId && r.created_by === userId && r.status === "draft" && isDraftIncomplete(r)).length,
    [rows, userId]
  );

  function requestDelete(r) {
    setDeleteTarget({ id: r.id, name: r.event_name });
  }

  function handleDeleted() {
    const id = deleteTarget?.id;
    setRows((prev) => (prev || []).filter((x) => x.id !== id));
    if (detail?.id === id) {
      setDetail(null);
      router.replace("/martahub/m/activities");
    }
    setDeleteTarget(null);
  }

  if (loading) return <MobileShell active="activities"><ShellSpinner /></MobileShell>;

  return (
    <MobileShell active="activities">
      {/* Header STICKY dgn glass blur - pola & nilai warna/blur SAMA PERSIS
          dgn header Beranda (app/martahub/m/page.jsx) & Management View,
          supaya bahasa desainnya konsisten antar layar mobile-web
          (sebelumnya cuma div biasa, jadi judul/search/tab ikut tergulung
          hilang begitu daftar aktivitasnya panjang). Search + tab filter
          disertakan sebagai bagian dari blok sticky karena keduanya juga
          navigasi, bukan konten yang perlu di-scroll bersama daftar. */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20, maxWidth: 480, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 12px",
        background: "rgba(244,245,247,0.86)", backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
      }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Aktivitas</div>
        <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: "#8A8A96", fontWeight: 500 }}>{counts.all} total aktivitas</span>
          {draftIncompleteCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: "#C2410C", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 999, padding: "3px 8px" }}>
              <AlertCircle size={11} /> {draftIncompleteCount} draft belum lengkap
            </span>
          )}
        </div>

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, height: 44, padding: "0 13px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #E9EAEE", marginTop: 14 }}>
          <Search size={15} color="#9A9AA6" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama event, MC, atau site…"
            style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 13.5, fontFamily: FF, color: "#17181C" }} />
          {q && (
            <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9A9AA6", display: "flex" }}>
              <X size={15} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            const n = counts[t.key] || 0;
            if (t.key !== "all" && n === 0) return null;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{
                  flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 999,
                  background: active ? "#17181C" : "#FFFFFF", border: `1px solid ${active ? "#17181C" : "#E9EAEE"}`,
                  color: active ? "#FFFFFF" : "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                }}>
                {t.label}
                <span style={{ fontSize: 10.5, fontWeight: 800, opacity: active ? 0.85 : 0.6 }}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "16px 20px 0" }}>
        {err && <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>}

        {rows === null && !err ? (
          <ShellSpinner />
        ) : filtered.length === 0 ? (
          <div style={{ marginTop: 4, textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>Tidak ada aktivitas</div>
            <div style={{ marginTop: 4, fontSize: 12, color: "#8A8A96" }}>Coba ganti filter atau kata kunci pencarian.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((r) => (
              <ActivityCard key={r.id} r={r} userId={userId}
                onOpen={() => router.push(`/martahub/m/activities/${r.id}`)}
                onRequestDelete={requestDelete} />
            ))}
          </div>
        )}
      </div>

      {detail && (
        <DetailSheet r={detail} userId={userId}
          onClose={() => { setDetail(null); router.replace("/martahub/m/activities"); }}
          onRequestDelete={requestDelete} />
      )}

      {deleteTarget && (
        <DeleteActivitySheet
          activityId={deleteTarget.id}
          activityName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 96, zIndex: 45, pointerEvents: "none" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", justifyContent: "flex-end", padding: "0 20px" }}>
          <button onClick={() => router.push("/martahub/m/activities/new")}
            style={{
              pointerEvents: "auto", display: "flex", alignItems: "center", gap: 8,
              padding: "14px 20px", borderRadius: 28, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer",
              boxShadow: "0 6px 16px rgba(17,17,20,0.10), 0 2px 4px rgba(17,17,20,0.06)",
            }}>
            <Plus size={18} /> Buat Plan
          </button>
        </div>
      </div>
    </MobileShell>
  );
}

function ActivityCard({ r, userId, onOpen, onRequestDelete }) {
  const meta = statusMeta(r.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwner = !!userId && r.created_by === userId;
  const isDraft = r.status === "draft";
  const incomplete = isDraft && isDraftIncomplete(r);
  const showNote = !!r.validation_note && (r.status === "revision_needed" || r.status === "revision_actual" || r.status === "rejected");

  return (
    <div style={{
      position: "relative", background: "#FFFFFF", borderRadius: 16, overflow: "hidden", fontFamily: FF,
      border: `1px solid ${incomplete ? "#FBD9B4" : "#E9EAEE"}`,
      boxShadow: "0 1px 3px rgba(23,24,28,0.05)",
    }}>
      {/* Aksen warna status di sisi kiri - identitas visual cepat tanpa harus
          baca pill teksnya dulu, pola umum di dashboard "enterprise". */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: meta.color }} />

      <button onClick={onOpen}
        style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "14px 15px 14px 19px", cursor: "pointer", fontFamily: FF }}>
        {/* paddingRight di SELURUH baris (bukan cuma kolom kiri) - sebelumnya
            cuma kolom teks kiri yg diberi jarak, jadi status pill di kanan
            masih mepet ke tepi kartu & bertabrakan dgn tombol kebab yg
            absolute di atasnya (dot-nya kepotong/numpuk di pill "Draft"). */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, paddingRight: isOwner ? 30 : 0 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {r.brand && (
                <span style={{
                  flexShrink: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.2,
                  color: r.brand.toLowerCase() === "tri" ? "#ED1C24" : "#F97316",
                  background: r.brand.toLowerCase() === "tri" ? "rgba(237,28,36,0.09)" : "rgba(249,115,22,0.09)",
                  padding: "2px 6px", borderRadius: 5,
                }}>
                  {r.brand.toLowerCase() === "tri" ? "3ID" : "IM3"}
                </span>
              )}
              <div style={{ fontSize: 14, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.event_name || "Plan Tanpa Nama"}
              </div>
            </div>
            <div style={{ marginTop: 4, fontSize: 11.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.mc || "-"} {r.site_id ? `· ${r.site_id}` : ""} · {fmtDate(r.plan_date)}
            </div>
          </div>
          <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>
            {meta.label}
          </span>
        </div>

        {isDraft ? (
          <div style={{
            marginTop: 11, display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 11,
            background: incomplete ? "#FFF7ED" : "#F0FBF6", border: `1px solid ${incomplete ? "#FED7AA" : "#BBF0D6"}`,
          }}>
            {incomplete ? <AlertCircle size={14} color="#C2410C" style={{ flexShrink: 0 }} /> : <CheckCircle2 size={14} color="#15803D" style={{ flexShrink: 0 }} />}
            <div style={{ fontSize: 11, fontWeight: 700, color: incomplete ? "#C2410C" : "#15803D", flex: 1 }}>
              {incomplete ? "Belum lengkap · lanjutkan pengisian" : "Lengkap · siap diajukan"}
            </div>
            <ChevronRight size={14} color={incomplete ? "#C2410C" : "#15803D"} style={{ flexShrink: 0 }} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 16, marginTop: 11, paddingTop: 11, borderTop: "1px solid #F0F0F3" }}>
            <MetricPair label="Target SP/FWA" value={`${fmtInt(r.target_sp)}/${fmtInt(r.target_fwa)}`} />
            <MetricPair label="Actual SP/FWA" value={r.actual_sp == null ? "-" : `${fmtInt(r.actual_sp)}/${fmtInt(r.actual_fwa)}`} />
          </div>
        )}

        {showNote && (
          <div style={{ marginTop: 9, fontSize: 10.5, color: meta.color, background: meta.bg, borderRadius: 9, padding: "7px 9px", fontWeight: 600, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {r.validation_note}
          </div>
        )}
      </button>

      {/* Kebab 3-titik - HANYA muncul utk pemilik plan sendiri, satu-satunya
          isinya "Hapus Plan" (sengaja tidak digabung aksi lain) supaya
          menekan tombol ini selalu berarti niat menghapus, bukan navigasi -
          mengurangi risiko salah klik sebelum sheet konfirmasi terbuka. */}
      {isOwner && (
        <button onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }} aria-label="Menu aktivitas"
          style={{
            position: "absolute", top: 12, right: 12, width: 27, height: 27, borderRadius: 8, border: "none",
            background: menuOpen ? "#EFEFF2" : "transparent", color: "#8A8A96", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
          <MoreVertical size={16} />
        </button>
      )}

      {menuOpen && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
          <div onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", top: 42, right: 12, zIndex: 40, minWidth: 168, background: "#FFFFFF", borderRadius: 13, border: "1px solid #E9EAEE", boxShadow: "0 12px 30px rgba(23,24,28,0.16)", overflow: "hidden" }}>
            <button onClick={() => { setMenuOpen(false); onRequestDelete(r); }}
              style={{ width: "100%", textAlign: "left", padding: "11px 13px", border: "none", background: "none", fontSize: 12.5, fontWeight: 700, color: "#DC2626", fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", gap: 9 }}>
              <Trash2 size={14} /> Hapus Plan
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MetricPair({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#B0B0BA", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#17181C", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DetailSheet({ r, userId, onClose, onRequestDelete }) {
  const router = useRouter();
  const meta = statusMeta(r.status);
  const isOwner = !!userId && r.created_by === userId;

  // Satu aksi kontekstual utama per status - mengikuti percabangan yang sama
  // dgn `_ActivityCard._buildBottom()` di Flutter (activity_list_screen.dart),
  // disederhanakan ke SATU tombol dominan per status alih-alih replikasi
  // penuh semua sub-kasus (mis. "plan belum lengkap" utk draft).
  //
  // Draft = belum diajukan/disetujui TMV - BELUM boleh langsung Check In
  // (sebelumnya disamakan dgn "approved", jadi plan yang masih draft/belum
  // selesai bisa check-in padahal belum tentu lengkap/disetujui). Aksi
  // utama draft sekarang melengkapi & mengajukan plan lewat wizard edit.
  let action = null;
  if (r.status === "revision_needed") {
    action = { label: "Revisi Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${r.id}`) };
  } else if (r.status === "draft") {
    action = { label: "Lanjutkan Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${r.id}`) };
  } else if (r.status === "approved") {
    if (r.checkin_valid == null) {
      action = { label: "Check In", onTap: () => router.push(`/martahub/m/activities/${r.id}/checkin`) };
    } else {
      action = { label: "Isi Laporan Actual", onTap: () => router.push(`/martahub/m/activities/${r.id}/submit`) };
    }
  } else if (r.status === "revision_actual") {
    action = { label: "Revisi & Kirim Ulang", onTap: () => router.push(`/martahub/m/activities/${r.id}/submit`) };
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,24,28,0.45)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF", borderRadius: "22px 22px 0 0", padding: "10px 22px calc(env(safe-area-inset-bottom,0px) + 22px)", fontFamily: FF }}>
        <div style={{ width: 40, height: 4, borderRadius: 3, background: "#E4E5EA", margin: "6px auto 16px" }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#17181C" }}>{r.event_name || "-"}</div>
          <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, padding: "5px 10px", borderRadius: 999, color: meta.color, background: meta.bg }}>{meta.label}</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 12.5, color: "#8A8A96", fontWeight: 600 }}>
          {r.mc || "-"} {r.site_id ? `· ${r.site_id}` : ""} · {fmtDate(r.plan_date)}
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 18, paddingTop: 16, borderTop: "1px solid #F0F0F3" }}>
          <MetricPair label="Target SP/FWA" value={`${fmtInt(r.target_sp)}/${fmtInt(r.target_fwa)}`} />
          <MetricPair label="Actual SP/FWA" value={r.actual_sp == null ? "-" : `${fmtInt(r.actual_sp)}/${fmtInt(r.actual_fwa)}`} />
        </div>
        {r.validation_note && (
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: meta.bg, color: meta.color, fontSize: 11.5, fontWeight: 600, lineHeight: 1.5 }}>
            {r.validation_note}
          </div>
        )}
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, height: 48, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13.5, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
            Tutup
          </button>
          {action && (
            <button onClick={action.onTap}
              style={{ flex: 1.4, height: 48, borderRadius: 12, border: "none", background: BRAND, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
              {action.label}
            </button>
          )}
        </div>

        {/* Hapus juga tersedia "di dalamnya" (quick-view sheet), bukan cuma
            dari kartu daftar - sesuai permintaan, tetap digerbang ke pemilik
            plan & tetap lewat DeleteActivitySheet yg sama (satu alur konfirmasi). */}
        {isOwner && (
          <button onClick={() => { onRequestDelete(r); onClose(); }}
            style={{ width: "100%", marginTop: 10, height: 44, borderRadius: 12, border: "1px solid #F7C6C9", background: "#FFF5F6", color: "#DC2626", fontSize: 12.5, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Trash2 size={14} /> Hapus Plan
          </button>
        )}
      </div>
    </div>
  );
}

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<MobileShell active="activities"><ShellSpinner /></MobileShell>}>
      <ActivitiesInner />
    </Suspense>
  );
}
