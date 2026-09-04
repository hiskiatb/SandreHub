"use client";
/**
 * /martahub/m/activities/[id] - Halaman Detail Aktivitas penuh (web mobile).
 * Padanan `plan_detail_screen.dart` di Flutter: ringkasan plan, target vs
 * actual, galeri foto dokumentasi, daftar MSISDN per kategori, riwayat
 * approval/validasi/edit-request, dan multi-site.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, MapPin, Calendar, Tag, Image as ImageIcon, Phone,
  CheckCircle2, XCircle, Clock, FileText, ChevronRight, Trash2,
  CardSim, Router, Receipt, Pencil, MoreVertical, RefreshCw, Target,
} from "lucide-react";
import supabaseMarta from "../../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND } from "../../_shared/MobileShell";
import { fmtDate, fmtTimeLabel, fmtInt, fmtRp, isDraftIncomplete, activityStage } from "../../_shared/activityUi";
import { unsnake } from "../../_shared/planData";
import SiteTowerIcon from "../../_shared/SiteTowerIcon";
import { MetricTile, RebuyTile, RevenueCostBanner } from "../../_shared/MetricTiles";
import { fetchAuthedPhotoBlobUrl } from "../../_shared/mediaProxy";
import DeleteActivitySheet from "../../_shared/DeleteActivitySheet";

const BRAND_COLOR = { im3: "#F5CD46", tri: "#E23B86" };
const A_COLS = "id,event_name,event_category,event_categories,brand,mc,site_id,plan_date,plan_date_start,plan_date_end,plan_dates_multi,is_all_day,start_time,end_time,poi_type,network_category,area_potential,address,latitude,longitude,status,target_sp,target_fwa,target_rebuy_pulsa,target_rebuy_data,target_rev_3m,cost_estimate,expected_outcome,actual_sp,actual_fwa,actual_rebuy_pulsa,actual_rebuy_data,actual_rev_3m,cost_actual,insight,checkin_valid,checkin_distance,checkin_at,approved_by_name,approved_at,approval_notes,validation_status,validation_note,validated_at,override_status,override_by_name,override_at,override_note,created_at,created_by";

// Sama seperti syarat "siap diajukan" step Info + Lokasi di wizard Create
// Plan (new/page.jsx validateStep) - dipakai utk deteksi draft yang masih
// bolong (MC/site/POI/dst. belum diisi) supaya langsung dilempar ke wizard
// alih-alih ditampilkan sbg halaman detail read-only dulu.
export default function ActivityDetailPage() {
  const { id: activityId } = useParams();
  const router = useRouter();
  const { loading: sessionLoading, userId } = useMartaSession();
  const [a, setA] = useState(null);
  const [extraSites, setExtraSites] = useState([]);
  const [siteNames, setSiteNames] = useState({}); // site_id -> site_name (mh_sites), utk label di list gabungan
  const [branchLabel, setBranchLabel] = useState(""); // nama branch dari mh_sites (site_id utama), utk subtitle card judul
  // Judul di header sticky - defaultnya "Activity Detail", TAPI begitu judul
  // event di card di bawahnya sudah tergulung ke belakang header (tertutup),
  // otomatis berganti jadi nama event itu sendiri (spt title collapsing di
  // iOS/Gmail) - supaya konteks "activity mana yg sedang dilihat" tetap ada
  // walau sudah scroll jauh & card judul aslinya sudah tidak kelihatan.
  const eventTitleRef = useRef(null);
  const headerRef = useRef(null);
  const [showEventTitle, setShowEventTitle] = useState(false);
  // Tinggi bar aksi bawah (tombol Isi Laporan Actual/Check-in + opsional
  // Edit Plan) DIUKUR LANGSUNG (bukan angka tebakan tetap 130px spt
  // sebelumnya) - sebelumnya kalau kedua tombol (aksi utama + edit) sama2
  // muncul, tingginya bisa melebihi 130px shg card TERAKHIR (Estimasi
  // Revenue yg gelap) ketutup sebagian oleh bar & nyisain celah/terlihat
  // "menembus" di bawah. Dgn ResizeObserver, padding bawah konten SELALU
  // pas dgn tinggi bar aksi yg sebenarnya - responsive ke kombinasi tombol
  // apapun & ukuran layar apapun.
  const actionBarRef = useRef(null);
  const [actionBarH, setActionBarH] = useState(130);
  useEffect(() => {
    const el = actionBarRef.current;
    if (!el) { setActionBarH(0); return; }
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect?.height;
      if (h != null) setActionBarH(Math.ceil(h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  useEffect(() => {
    function onScroll() {
      const titleEl = eventTitleRef.current;
      const headerEl = headerRef.current;
      if (!titleEl || !headerEl) return;
      const headerBottom = headerEl.getBoundingClientRect().bottom;
      const titleBottom = titleEl.getBoundingClientRect().bottom;
      setShowEventTitle(titleBottom < headerBottom);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [a]);
  const [photos, setPhotos] = useState([]);
  const [entries, setEntries] = useState([]);
  const [editReqs, setEditReqs] = useState([]);
  const [err, setErr] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (sessionLoading || !activityId) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: act, error: e1 }, { data: sites }, { data: docs }, { data: sales }, { data: edits }] = await Promise.all([
          supabaseMarta.from("mh_activities").select(A_COLS).eq("id", activityId).single(),
          supabaseMarta.from("mh_activity_sites").select("site_id, is_primary").eq("activity_id", activityId).eq("is_primary", false),
          supabaseMarta.from("mh_documents").select("id, storage_path, file_type, created_at").eq("activity_id", activityId).order("created_at"),
          supabaseMarta.from("mh_dsf_sales_entries").select("id, category, msisdn, imei, validation_status, product_type_id").eq("activity_id", activityId).order("created_at"),
          supabaseMarta.from("mh_activity_edit_requests").select("id, status, reason, requested_by_name, decided_by_name, decision_notes, created_at, decided_at").eq("activity_id", activityId).order("created_at", { ascending: false }),
        ]);
        if (e1) throw e1;
        if (!alive) return;
        setA(act);
        setExtraSites((sites || []).map((s) => s.site_id));
        setEntries(sales || []);
        setEditReqs(edits || []);

        // Nama site (bukan cuma kode) - dipakai di list gabungan Site Utama +
        // Site Tambahan, biar bukan teks kode doang.
        const allSiteIds = Array.from(new Set([act?.site_id, ...(sites || []).map((s) => s.site_id)].filter(Boolean)));
        if (allSiteIds.length > 0) {
          const { data: siteRows } = await supabaseMarta.from("mh_sites").select("site_id,site_name,branch").in("site_id", allSiteIds);
          const map = {};
          (siteRows || []).forEach((s) => { map[s.site_id] = s.site_name; });
          if (alive) setSiteNames(map);
          const primaryBranch = (siteRows || []).find((s) => s.site_id === act?.site_id)?.branch;
          if (alive && primaryBranch) setBranchLabel(primaryBranch);
        }

        const photoDocs = (docs || []).filter((d) => d.file_type === "photo");
        if (photoDocs.length) {
          // Lewat proxy media-view (Google Drive kalau sudah dimirror, fallback
          // Storage kalau belum) - browser tidak pernah lihat link Drive-nya.
          const withUrls = await Promise.all(
            photoDocs.map(async (d) => {
              try {
                const url = await fetchAuthedPhotoBlobUrl("document", d.id);
                return { ...d, url };
              } catch {
                return { ...d, url: null };
              }
            })
          );
          if (alive) setPhotos(withUrls.filter((p) => p.url));
        }
      } catch (e) {
        if (alive) setErr(e.message || "Gagal memuat detail aktivitas");
      }
    })();
    return () => { alive = false; };
  }, [sessionLoading, activityId]);

  // Draft yang PUNYA SENDIRI & belum lengkap - jangan tampilkan halaman
  // detail read-only ini dulu (cuma bikin ekstra tap "Lanjutkan Plan" utk
  // sampai ke wizard), langsung lempar ke wizard edit supaya lanjut mengisi
  // dari step yang masih kurang. Dibatasi HANYA punya sendiri (`created_by
  // === userId`) - draft orang lain yang sedang ditinjau (mis. TMV lihat
  // draft BME dari Approval/Calendar) TETAP tampil sbg halaman detail biasa,
  // jangan dilempar paksa ke form edit yang bukan miliknya.
  const [redirectingToEdit, setRedirectingToEdit] = useState(false);
  useEffect(() => {
    if (!a || !userId || a.created_by !== userId || a.status !== "draft") return;
    if (isDraftIncomplete(a)) {
      setRedirectingToEdit(true);
      router.replace(`/martahub/m/activities/new?edit=${activityId}`);
    }
  }, [a, userId, activityId, router]);

  if (sessionLoading || (!a && !err) || redirectingToEdit) return <MobileShell active="activities" hideNav><ShellSpinner /></MobileShell>;

  if (err) {
    return (
      <MobileShell active="activities" hideNav>
        <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px" }}>
          <button onClick={() => router.back()} aria-label="Kembali"
            style={{ width: 34, height: 34, borderRadius: 11, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ marginTop: 16, padding: "10px 12px", borderRadius: 10, background: "#FDECEC", color: "#C62828", fontSize: 12, fontWeight: 600 }}>{err}</div>
        </div>
      </MobileShell>
    );
  }

  // SATU pill status yg SAMA PERSIS dgn kartu di daftar Aktivitas &
  // Beranda (activityStage di activityUi.js) - tidak ada lagi pill status
  // terpisah antar halaman yg bisa kelihatan beda/kontradiksi.
  const meta = activityStage(a);
  const categories = Array.isArray(a.event_categories) && a.event_categories.length ? a.event_categories : (a.event_category ? [a.event_category] : []);
  const dateLabel = planDateLabel(a);
  const spEntries = entries.filter((e) => e.category === "sp");
  const fwaEntries = entries.filter((e) => e.category === "fwa");
  // "Aktual" yg ditampilkan HANYA nomor yg sudah tervalidasi (validation_status
  // === 'valid') - nomor yg masih "menunggu validasi" belum dihitung ke
  // target actual, tapi tetap kelihatan statusnya (bukan hilang begitu saja).
  const spValid = spEntries.filter((e) => e.validation_status === "valid").length;
  const spPending = spEntries.filter((e) => e.validation_status === "pending").length;
  const fwaValid = fwaEntries.filter((e) => e.validation_status === "valid").length;
  const fwaPending = fwaEntries.filter((e) => e.validation_status === "pending").length;

  // Plan SEKARANG TIDAK PERLU approval TMV sebelum bisa dieksekusi - status
  // "plan_submitted" (atau "approved", utk plan lama dari sebelum perubahan
  // ini) sudah cukup, TIDAK perlu menunggu keputusan approver lagi. Yang
  // menentukan langkah berikutnya cuma TANGGAL EVENT-nya:
  //  - sebelum tanggalnya tiba → planning-nya MASIH BOLEH diedit (draft
  //    sesudah diajukan bukan berarti terkunci).
  //  - begitu tanggalnya tiba → langsung lanjut Check In/Isi Laporan Actual,
  //    tanpa menunggu approval apapun.
  const eventDate = earliestPlanDate(a);
  const eventArrived = eventDate ? eventDate <= new Date().toISOString().slice(0, 10) : false;
  // approved sekarang berarti "actual selesai & valid", bukan lagi
  // "plan disetujui" - gate approval plan sudah dihapus (lihat activityUi.js).
  const READY_STATUSES = new Set(["plan_submitted"]);
  let action = null;
  let editAction = null; // "Edit Plan" sekunder - masih boleh muncul berdampingan
  // sampai tanggal event tiba, spy plan tetap bisa dikoreksi sebelum hari-H.
  // Check In DIHAPUS - dulu wajib check-in dulu di lokasi sebelum bisa Isi
  // Laporan Actual, SEKARANG begitu tanggal event tiba langsung bisa Isi
  // Laporan Actual. Validasi "benar2 di lokasi" dipindah ke DALAM form
  // laporan itu sendiri lewat tombol "Perbaiki Titik GPS" (submit/page.jsx) -
  // kalau pengguna memang sedang di lokasi event, longlat bisa dikoreksi
  // persis di situ saat mengisi laporan, tanpa perlu langkah terpisah dulu.
  if (a.status === "revision_needed") action = { label: "Revisi Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${a.id}`) };
  else if (a.status === "draft") action = { label: "Lanjutkan Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${a.id}`) };
  else if (READY_STATUSES.has(a.status) && !eventArrived) action = { label: "Edit Plan", onTap: () => router.push(`/martahub/m/activities/new?edit=${a.id}`) };
  else if (READY_STATUSES.has(a.status) && eventArrived) action = { label: "Isi Laporan Actual", onTap: () => router.push(`/martahub/m/activities/${a.id}/submit`) };
  else if (a.status === "revision_actual") action = { label: "Revisi & Kirim Ulang", onTap: () => router.push(`/martahub/m/activities/${a.id}/submit`) };

  return (
    <MobileShell active="activities" hideNav>
      {/* Padding bawah digenapkan supaya card TERAKHIR selalu ada jarak
          napas dari action bar fixed di bawahnya (sebelumnya cuma 100px -
          kepotong/mentok begitu discroll penuh ke bawah krn action bar +
          prompt check-in + navbar total tingginya bisa >200px). */}
      {/* Padding bawah dipangkas ke maksimal ~ tinggi bar aksi bawah (tombol
          Check In/Edit Plan) saja - sebelumnya kebablasan (+220px) jadi ada
          jarak kosong raksasa sebelum bar aksi yg justru terasa aneh, bukan
          "napas" yang wajar. */}
      {/* Header halaman SEKARANG sticky dgn glass blur, senada persis dgn
          AppHeader di Beranda (position:sticky, background buram selalu
          aktif, border+shadow tipis di bawahnya) - bukan lagi teks "Kembali"
          polos yg ikut tergulung ke atas bareng konten. Tombol kembali jadi
          rounded-rectangle berlabel (bukan cuma ikon panah polos), judul
          halaman "Activity Detail" di tengah, & menu titik-tiga (dulu
          nangkring di dalam card di bawahnya) DIPINDAH ke sini juga -
          supaya selalu bisa diakses tanpa perlu scroll ke atas dulu. */}
      <div ref={headerRef} style={{
        position: "sticky", top: 0, zIndex: 20, maxWidth: 480, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top,0px) + 16px) 20px 12px",
        background: "rgba(244,245,247,0.86)", backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontFamily: FF,
      }}>
        <button onClick={() => router.back()} aria-label="Kembali"
          style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 11, background: "#FFFFFF", border: "1px solid #E4E5EA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A68" }}>
          <ArrowLeft size={16} />
        </button>
        {/* Begitu judul event asli (di card di bawah) sudah tergulung
            tertutup header, teks di sini otomatis berganti dari
            "Activity Detail" jadi nama event-nya - konteks tetap ada tanpa
            perlu scroll balik ke atas. */}
        <div style={{ flex: 1, textAlign: "center", fontSize: 14.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {showEventTitle ? (a.event_name || "-") : "Activity Detail"}
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setMenuOpen((v) => !v)} aria-label="Menu"
            style={{ width: 34, height: 34, borderRadius: 11, border: "1px solid #E4E5EA", background: menuOpen ? "#F0F0F3" : "#FFFFFF", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <MoreVertical size={17} />
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
              <div style={{ position: "absolute", top: 40, right: 0, zIndex: 50, minWidth: 190, background: "#FFFFFF", borderRadius: 14, border: "1px solid #E9EAEE", boxShadow: "0 12px 30px rgba(23,24,28,0.16)", padding: 10 }}>
                {/* Status pill DIHAPUS dari sini - sudah ada di kartu header
                    (satu status yg diakui, activityStage()), tidak perlu
                    diulang lagi di menu spy tidak terasa dobel. */}
                {userId && a.created_by === userId && a.actual_sp == null && a.status !== "approved" && (
                  <button onClick={() => { setMenuOpen(false); router.push(`/martahub/m/activities/new?edit=${a.id}`); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 6px", border: "none", background: "none", cursor: "pointer", fontFamily: FF, borderRadius: 9, color: "#3A3A44", fontSize: 12.5, fontWeight: 700 }}>
                    <Pencil size={14} /> Edit Plan
                  </button>
                )}

                {userId && a.created_by === userId && (
                  <>
                    <div style={{ height: 1, background: "#F0F0F3", margin: "10px 0 8px" }} />
                    <button onClick={() => { setMenuOpen(false); setShowDeleteSheet(true); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 6px", border: "none", background: "none", cursor: "pointer", fontFamily: FF, borderRadius: 9, color: "#DC2626", fontSize: 12.5, fontWeight: 700 }}>
                      <Trash2 size={14} /> Hapus Plan
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ padding: `4px 20px calc(env(safe-area-inset-bottom,0px) + ${actionBarH + 20}px)`, fontFamily: FF }}>
        {/* Header - dibungkus jadi satu kartu (bukan cuma flex row polos di
            atas background) supaya identitas event terasa lebih "utuh" &
            senada dgn gaya card section di bawahnya. Aksen warna kiri = warna
            status (konsisten dgn pola strip warna di kartu daftar). Status
            pill yg sebelumnya SELALU nangkring di kanan atas dipindah ke
            balik menu titik-tiga - tetap bisa dilihat kapan saja, header
            jadi lebih bersih & fokus ke judul event-nya. */}
        <div style={{
          marginTop: 14, background: "#FFFFFF", borderRadius: 18,
          padding: "15px 16px", border: "1px solid #EDEDF1",
          boxShadow: "0 2px 10px rgba(23,24,28,0.04), 0 1px 2px rgba(23,24,28,0.03)",
        }}>
          {/* Kartu header sekarang SAMA PERSIS bahasa desainnya dgn kartu
              aktivitas di Beranda/Aktivitas/Kalender - brand badge solid,
              Branch → MC, baris waktu ber-ikon Clock, & satu pill status
              (activityStage) - biar konsisten, bukan varian sendiri lagi. */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div ref={eventTitleRef} style={{ fontSize: 16, fontWeight: 800, color: "#17181C", lineHeight: 1.3 }}>{a.event_name || "-"}</div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {a.brand && (
                  <span style={{
                    flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap",
                    background: BRAND_COLOR[a.brand.toLowerCase()] || "#8A8A96",
                    color: a.brand.toLowerCase() === "tri" ? "#FFFFFF" : "#17181C",
                  }}>
                    {a.brand.toLowerCase() === "tri" ? "3ID" : "IM3"}
                  </span>
                )}
                <span style={{ fontSize: 11.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {[branchLabel, a.mc].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "4px 9px", borderRadius: 999, color: meta.color, background: meta.bg, whiteSpace: "nowrap" }}>
              {meta.label}
            </span>
          </div>

          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#5A5A68", fontWeight: 600 }}>
            <Clock size={12} color="#B0B0BA" style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDate(a.plan_date)} · {fmtTimeLabel(a)}</span>
          </div>
        </div>

        {(a.validation_note || a.override_note || a.approval_notes) && (
          <div style={{ marginTop: 14, padding: "11px 13px", borderRadius: 12, background: meta.bg, color: meta.color, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
            {a.validation_note || a.override_note || a.approval_notes}
          </div>
        )}

        {/* Info card - site TIDAK lagi disebut di sini sbg teks (Site
            Utama/Site Tambahan terpisah) - semua site sekarang satu list
            gabungan di section "Site" di bawah, lengkap dgn labelnya.
            Kategori event (Direct Selling/Open Booth/dst) SEKARANG DI SINI
            saja (baris "Kategori"), bukan lagi chip terpisah di atas header. */}
        <SectionCard title="Informasi Plan" icon={<Calendar size={13} />} accent="#2563EB">
          <div style={{ display: "flex", flexDirection: "column" }}>
            {categories.length > 0 && (
              <>
                <div style={{ padding: "7px 0" }}>
                  <div style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600 }}>Kategori</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {categories.map((c, i) => (
                      <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#2563EB", background: "rgba(37,99,235,0.08)", borderRadius: 999, padding: "4px 10px" }}>
                        <Tag size={11} /> {unsnake(c)}
                      </span>
                    ))}
                  </div>
                </div>
                <Divider />
              </>
            )}
            <RowKV label="Tanggal" value={dateLabel} />
            <Divider />
            <RowKV label="Waktu" value={a.is_all_day === false && a.start_time && a.end_time ? `${a.start_time.slice(0, 5)} – ${a.end_time.slice(0, 5)}` : "Seharian"} />
            <Divider />
            <RowKV label="Micro Cluster" value={a.mc || "-"} />
            <Divider />
            <RowKV label="POI" value={a.poi_type ? unsnake(a.poi_type) : "-"} />
            <Divider />
            <RowKV label="Kekuatan Sinyal" value={a.network_category ? unsnake(a.network_category) : "-"} />
            <Divider />
            <RowKV label="Potensi Area" value={a.area_potential ? unsnake(a.area_potential) : "-"} />
            {a.address && <><Divider /><RowKV label="Alamat" value={a.address} stacked /></>}
          </div>
        </SectionCard>

        {/* Site - satu list gabungan (Utama + Tambahan sekaligus), tiap
            baris berupa kartu dgn badge label + nama site, bukan cuma
            teks kode yg digabung koma spt sebelumnya. */}
        {a.site_id && (
          <SectionCard title={`Site (${extraSites.length + 1})`} icon={<SiteTowerIcon size={13} color="#7C3AED" />} accent="#7C3AED">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <SiteCard label="Site 1" siteId={a.site_id} siteName={siteNames[a.site_id]} />
              {extraSites.map((s, i) => <SiteCard key={s} label={`Site ${i + 2}`} siteId={s} siteName={siteNames[s]} />)}
            </div>
          </SectionCard>
        )}

        {/* Target vs Actual - grid tile berikon, senada dgn report tile di
            halaman Laporan Actual (CardSim/Router/Wallet/SignalHigh/Receipt) */}
        <SectionCard title="Target vs Actual" icon={<Target size={13} />} accent="#15803D">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <MetricTile icon={CardSim} accent="#DB2777" label="SP" target={fmtInt(a.target_sp)} actual={entries.length ? fmtInt(spValid) : (a.actual_sp == null ? "-" : fmtInt(a.actual_sp))} pending={spPending} />
            <MetricTile icon={Router} accent="#2563EB" label="FWA" target={fmtInt(a.target_fwa)} actual={entries.length ? fmtInt(fwaValid) : (a.actual_fwa == null ? "-" : fmtInt(a.actual_fwa))} pending={fwaPending} />
            {/* Rebuy SP & FWA digabung jadi SATU tile lebar penuh (spt Cost)
                - nilainya Rupiah yg lumayan panjang, dulu 2 tile sempit
                bikin angka kepotong/wrap berantakan. */}
            <div style={{ gridColumn: "1 / -1" }}>
              <RebuyTile
                spTarget={fmtRp(a.target_rebuy_pulsa)} spActual={a.actual_rebuy_pulsa == null ? "-" : fmtRp(a.actual_rebuy_pulsa)}
                fwaTarget={fmtRp(a.target_rebuy_data)} fwaActual={a.actual_rebuy_data == null ? "-" : fmtRp(a.actual_rebuy_data)}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <MetricTile icon={Receipt} accent="#7C3AED" label="Cost" target={fmtRp(a.cost_estimate)} actual={a.cost_actual == null ? "-" : fmtRp(a.cost_actual)} />
            </div>
          </div>
          {/* Estimasi Total Revenue & Cost Ratio - dihitung otomatis saat
              plan dibuat/diedit (lihat StepTarget di wizard Buat Plan) dari
              qty produk SP/FWA×harga master data + rebuy amount. Cost Ratio
              dihitung ulang di sini juga (bukan disimpan) supaya selalu
              cocok dgn cost_estimate/target_rev_3m TERBARU. */}
          <RevenueCostBanner
            revenueLabel={a.actual_rev_3m != null ? "Total Revenue Actual" : "Estimasi Total Revenue"}
            revenueValue={a.actual_rev_3m != null ? fmtRp(a.actual_rev_3m) : (a.target_rev_3m > 0 ? fmtRp(a.target_rev_3m) : "-")}
            costRatioValue={a.actual_rev_3m != null
              ? `${((Number(a.cost_actual ?? a.cost_estimate) || 0) / a.actual_rev_3m * 100).toFixed(1)}%`
              : (a.target_rev_3m > 0 ? `${((Number(a.cost_estimate) || 0) / a.target_rev_3m * 100).toFixed(1)}%` : "-")}
          />
          {a.insight && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0F0F3" }}>
              <div style={{ fontSize: 10, color: "#B0B0BA", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Insight</div>
              <div style={{ fontSize: 12.5, color: "#3A3A44", lineHeight: 1.55 }}>{a.insight}</div>
            </div>
          )}
        </SectionCard>

        {/* Photos */}
        {photos.length > 0 && (
          <SectionCard title={`Dokumentasi Foto (${photos.length})`} icon={<ImageIcon size={13} />} accent="#DB2777">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {photos.map((p) => (
                <button key={p.id} onClick={() => setLightbox(p.url)}
                  style={{ padding: 0, border: "none", cursor: "pointer", aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: "#F0F0F3" }}>
                  <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>
              ))}
            </div>
          </SectionCard>
        )}

        {/* MSISDN lists */}
        {(spEntries.length > 0 || fwaEntries.length > 0) && (
          <SectionCard title="Nomor Terdaftar" icon={<Phone size={13} />} accent="#0D9488">
            {spEntries.length > 0 && <MsisdnGroup label={`SP (${spEntries.length})`} list={spEntries} />}
            {fwaEntries.length > 0 && <MsisdnGroup label={`FWA (${fwaEntries.length})`} list={fwaEntries} />}
          </SectionCard>
        )}

        {/* History */}
        {editReqs.length > 0 && (
          <SectionCard title="Riwayat Pengajuan Revisi" icon={<FileText size={13} />} accent="#6B7280">
            {editReqs.map((r) => (
              <div key={r.id} style={{ padding: "9px 0", borderBottom: "1px solid #F0F0F3" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#17181C" }}>{r.requested_by_name || "-"}</div>
                  <EditReqBadge status={r.status} />
                </div>
                {r.reason && <div style={{ marginTop: 3, fontSize: 11.5, color: "#8A8A96" }}>{r.reason}</div>}
                <div style={{ marginTop: 3, fontSize: 10.5, color: "#B0B0BA" }}>{new Date(r.created_at).toLocaleString("id-ID")}</div>
                {r.decision_notes && (
                  <div style={{ marginTop: 5, fontSize: 11.5, color: "#5A5A68", background: "#F7F7F9", borderRadius: 8, padding: "6px 9px" }}>
                    {r.decided_by_name ? `${r.decided_by_name}: ` : ""}{r.decision_notes}
                  </div>
                )}
              </div>
            ))}
          </SectionCard>
        )}

        {(a.approved_by_name || a.override_by_name) && (
          <SectionCard title="Persetujuan" icon={<CheckCircle2 size={13} />} accent="#15803D">
            {a.approved_by_name && <RowKV label="Disetujui oleh" value={a.approved_by_name} />}
            {a.approved_at && <RowKV label="Tanggal" value={new Date(a.approved_at).toLocaleString("id-ID")} />}
            {a.override_by_name && <RowKV label="Override oleh" value={a.override_by_name} />}
          </SectionCard>
        )}

      </div>

      {/* Bar solid/opaque (blur frosted) - BUKAN lagi gradient yg mulai dari
          transparan (rgba(...,0)) - versi transparan sebelumnya bikin konten
          di baliknya (mis. kartu Estimasi Revenue yg gelap) keliatan
          "menembus" jadi kayak bayangan gelap nempel di atas navbar. Pola
          SAMA PERSIS dgn action bar wizard Buat Plan (new/page.jsx). */}
      {action && (
        // Halaman ini TIDAK punya bottom navbar (hideNav) - bar aksi ini
        // jadi satu2nya elemen fixed di bawah, jadi lengket persis di tepi
        // bawah layar (cuma dikurangi safe-area-inset-bottom), bukan lagi
        // "mengambang" di atas navbar yg sudah tidak ada.
        <div ref={actionBarRef} style={{
          position: "fixed", left: 0, right: 0, bottom: "env(safe-area-inset-bottom,0px)", zIndex: 45,
          background: "rgba(244,245,247,0.92)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 -4px 16px rgba(23,24,28,0.05)",
        }}>
          <div style={{ maxWidth: 480, margin: "0 auto", padding: "12px 20px 14px" }}>
            <button onClick={action.onTap}
              style={{ width: "100%", height: 50, borderRadius: 14, border: "none", cursor: "pointer", background: BRAND, color: "#fff", fontFamily: FF, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(17,17,20,0.11)" }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
                {action.label} <ChevronRight size={16} />
              </span>
            </button>
            {editAction && (
              <button onClick={editAction.onTap}
                style={{ width: "100%", marginTop: 9, height: 42, borderRadius: 13, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#3A3A44", fontSize: 12.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <Pencil size={13} /> {editAction.label}
              </button>
            )}
          </div>
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}

      {showDeleteSheet && (
        <DeleteActivitySheet
          activityId={activityId}
          activityName={a.event_name}
          onClose={() => setShowDeleteSheet(false)}
          onDeleted={() => router.replace("/martahub/m/activities")}
        />
      )}
    </MobileShell>
  );
}

function SectionCard({ title, icon, accent = "#5A5A68", children }) {
  return (
    <div style={{
      marginTop: 14, background: "#FFFFFF", border: "1px solid #EDEDF1", borderRadius: 20, padding: "16px",
      boxShadow: "0 6px 16px rgba(17,17,20,0.05), 0 1px 3px rgba(17,17,20,0.03)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 9, background: `${accent}1A`, color: accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, color: "#3A3A44" }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function Divider() { return <div style={{ height: 1, background: "#F0F0F3" }} />; }

// `stacked` - label di atas, value di bawah rata kiri (bukan sejajar
// kanan-kiri) - dipakai utk value yg bisa panjang/multi-baris (mis. Alamat),
// supaya tidak wrap berantakan sejajar dgn label di baris pertama saja.
function RowKV({ label, value, valueColor, stacked }) {
  if (stacked) {
    return (
      <div style={{ padding: "7px 0" }}>
        <div style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600 }}>{label}</div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: valueColor || "#17181C", fontWeight: 700, lineHeight: 1.5 }}>{value}</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, padding: "7px 0" }}>
      <div style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600, flexShrink: 0, minWidth: 96 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: valueColor || "#17181C", fontWeight: 700, textAlign: "right", flex: 1, minWidth: 0 }}>{value}</div>
    </div>
  );
}

/** Satu baris = satu kartu site (bukan teks polos) - badge label (Utama/
 * Site N) + kode site + nama site (kalau ada di `mh_sites`). */
function SiteCard({ label, siteId, siteName }) {
  // Semua site diperlakukan SAMA (tidak ada "Utama" vs lainnya - urutan
  // cuma urutan input, bukan prioritas), jadi label-nya SERAGAM "Site N"
  // dgn 1 gaya badge yg sama utk semua, bukan lagi site pertama dibedakan
  // (badge solid ungu) drpd site berikutnya (badge pudar).
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F8F8FA", border: "1px solid #EFEFF2", borderRadius: 13, padding: "9px 11px" }}>
      <span style={{
        flexShrink: 0, fontSize: 9.5, fontWeight: 800, borderRadius: 7, padding: "4px 9px",
        color: "#7C3AED", background: "rgba(124,58,237,0.12)",
      }}>{label}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#17181C" }}>{siteId}</div>
        {siteName && <div style={{ marginTop: 1, fontSize: 11, color: "#8A8A96", fontWeight: 600 }}>{siteName}</div>}
      </div>
    </div>
  );
}

function MsisdnGroup({ label, list }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>{label}</div>
      {list.map((e) => (
        <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F7F7F9" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C", fontVariantNumeric: "tabular-nums" }}>{e.msisdn}</div>
          <ValidationBadge status={e.validation_status} />
        </div>
      ))}
    </div>
  );
}

function ValidationBadge({ status }) {
  const map = {
    valid: { label: "Valid", color: "#15803D", bg: "rgba(21,128,61,0.10)" },
    pending: { label: "Menunggu Validasi", color: "#B45309", bg: "rgba(180,83,9,0.10)" },
    invalid: { label: "Tidak Valid", color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
    duplicate: { label: "Duplikat", color: "#DC2626", bg: "rgba(220,38,38,0.10)" },
  };
  const m = map[status] || { label: status || "-", color: "#6B7280", bg: "rgba(107,114,128,0.10)" };
  return <span style={{ fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, color: m.color, background: m.bg }}>{m.label}</span>;
}

function EditReqBadge({ status }) {
  const map = {
    pending: { label: "Menunggu", color: "#B45309", bg: "rgba(180,83,9,0.10)", icon: <Clock size={10} /> },
    approved: { label: "Disetujui", color: "#15803D", bg: "rgba(21,128,61,0.10)", icon: <CheckCircle2 size={10} /> },
    rejected: { label: "Ditolak", color: "#DC2626", bg: "rgba(220,38,38,0.10)", icon: <XCircle size={10} /> },
  };
  const m = map[status] || { label: status || "-", color: "#6B7280", bg: "rgba(107,114,128,0.10)", icon: null };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, color: m.color, background: m.bg }}>
      {m.icon} {m.label}
    </span>
  );
}

// Tanggal event PALING AWAL dari plan ini (single/rentang/multi) dlm
// bentuk string "YYYY-MM-DD" siap dibandingkan string biasa (`<=`) dgn hari
// ini - dipakai utk tahu apakah plan sudah "boleh dieksekusi" (Check In/Isi
// Laporan) atau MASIH tahap planning (edit).
function earliestPlanDate(a) {
  if (a.plan_dates_multi) {
    const parts = a.plan_dates_multi.split(",").filter(Boolean).sort();
    if (parts[0]) return parts[0];
  }
  return a.plan_date_start || a.plan_date || null;
}

function planDateLabel(a) {
  if (a.plan_dates_multi) {
    const parts = a.plan_dates_multi.split(",").filter(Boolean);
    return `${parts.length} tanggal (${fmtDate(parts[0])}${parts.length > 1 ? ` – ${fmtDate(parts[parts.length - 1])}` : ""})`;
  }
  if (a.plan_date_start && a.plan_date_end) return `${fmtDate(a.plan_date_start)} – ${fmtDate(a.plan_date_end)}`;
  return fmtDate(a.plan_date);
}
