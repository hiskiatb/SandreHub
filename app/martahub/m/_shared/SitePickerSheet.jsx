"use client";
/**
 * SitePickerSheet - bottom sheet cari+pilih site dari daftar `items`
 * ({site_id, site_name}). Dipusatkan di sini (sebelumnya duplikat lokal di
 * wizard Buat Plan) supaya alur "Tambah Site" bisa dipakai lagi di Isi
 * Laporan Actual dgn konsep yg SAMA PERSIS spt di form plan.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVisualViewportBox } from "./useVisualViewportBox";
import { X, Search, SlidersHorizontal, ChevronUp, Star, Trash2, Check, CalendarDays, MapPinned, Filter } from "lucide-react";
import { FF } from "./MobileShell";
import BottomSheet from "./BottomSheet";
import supabaseMarta from "../../../../lib/supabaseMarta";

const inputBase = { width: "100%", height: 48, padding: "0 14px 0 40px", borderRadius: 12, background: "#F6F7F9", border: "1.5px solid #ECEDF0", fontSize: 14, fontWeight: 500, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box" };

// Warna aksen "Fokus" - SAMA dgn merah brand yg sudah dipakai utk chip/
// toggle filter aktif di Filter Aktivitas (activities/page.jsx) dan pill
// status di seluruh app ini, supaya badge/filter baru di sini konsisten
// dgn bahasa visual yg sudah ada (bukan warna baru yg asing).
const ACCENT = "#ED1C24";
const ACCENT_BG = "#FDECEC";

// Vektor menara sinyal yang sama persis dgn ikon marker site di peta
// (SumatraMap.jsx), supaya konsisten: "site" selalu direpresentasikan
// dengan ikon menara ini di manapun muncul di app.
const SITE_TOWER_PATHS = [
  "M26.7,2.3c-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4c3.5,3.5,3.5,9.1,0,12.6c-0.4,0.4-0.4,1,0,1.4c0.2,0.2,0.5,0.3,0.7,0.3\n\t\ts0.5-0.1,0.7-0.3C31,13.5,31,6.5,26.7,2.3z",
  "M22,12.6c-0.4,0.4-0.4,1,0,1.4c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c1.1-1.1,1.7-2.5,1.6-4.1c0-1.5-0.7-3-1.8-4.1\n\t\tc-0.4-0.4-1-0.4-1.4,0s-0.4,1,0,1.4C23.3,8.7,23.4,11.2,22,12.6z",
  "M6.7,16.3c-3.5-3.5-3.5-9.1,0-12.6c0.4-0.4,0.4-1,0-1.4s-1-0.4-1.4,0C1,6.5,1,13.5,5.3,17.7C5.5,17.9,5.7,18,6,18\n\t\ts0.5-0.1,0.7-0.3C7.1,17.3,7.1,16.7,6.7,16.3z",
  "M8.8,14.2c0.2,0.2,0.5,0.3,0.7,0.3s0.5-0.1,0.7-0.3c0.4-0.4,0.4-1,0-1.4c-1.5-1.5-1.6-4-0.2-5.4c0.4-0.4,0.4-1,0-1.4\n\t\tS9,5.6,8.6,6C7.5,7.1,7,8.5,7,10.1C7,11.6,7.7,13.1,8.8,14.2z",
  "M24,28h-2.2l-4-15.6C18.5,11.9,19,11,19,10c0-1.7-1.3-3-3-3s-3,1.3-3,3c0,1,0.5,1.9,1.3,2.4l-4,15.6H8c-0.6,0-1,0.4-1,1\n\t\ts0.4,1,1,1h16c0.6,0,1-0.4,1-1S24.6,28,24,28z M17.6,20h-3.3l1.6-6.3L17.6,20z M13.9,22c0,0,0.1,0,0.1,0h4c0.1,0,0.1,0,0.1,0l1.6,6\n\t\th-7.4L13.9,22z",
];
function SiteTowerIcon({ size = 16, color = "#8A8A96" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill={color}>
      {SITE_TOWER_PATHS.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export default function SitePickerSheet({ items, onClose, onSelect, title = "Pilih Site", selectedItems, onRemove }) {
  const [q, setQ] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lrsFilter, setLrsFilter] = useState(() => new Set());
  const [branchFilter, setBranchFilter] = useState(() => new Set());
  const [fokusKecamatanFilter, setFokusKecamatanFilter] = useState(() => new Set()); // set kosong = "Semua Kecamatan" (belum ada yg dipilih)
  const [kecQuery, setKecQuery] = useState(""); // cari nama kecamatan/kabupaten di daftar "Kecamatan Fokus" (beda dari search box utama site, list ini bisa panjang per region)
  // Dedup by site_id - mh_sites kadang punya baris duplikat persis utk
  // site_id yg sama (data existing, bukan bug di sini), jangan sampai
  // muncul dobel di daftar pilihan.
  const dedupedItems = Array.from(new Map((items || []).map((s) => [s.site_id, s])).values());
  const dedupedSelected = Array.from(new Map((selectedItems || []).map((s) => [s.site_id, s])).values());

  // Opsi filter HANYA dihitung dari `items` yg diberikan pemanggil ke sheet
  // ini (sudah di-scope branch+brand+active sblm sampai sini, lihat
  // fetchScopeSites/StepLocation di activities/new/page.jsx) - jadi kalau
  // sheet ini dibuka utk satu branch tertentu (mis. "Tambah site lain" yg
  // sudah difilter MC yg sama), opsi filter ikut otomatis menyempit sesuai
  // itu, TANPA logika tambahan di sini yg perlu tahu soal multi-branch.
  // Opsi filter Branch - HANYA relevan kalau pool site ini digabung dari
  // >1 branch sekaligus (mis. "semua BME di region" di bulk-region plan
  // creation, lihat merge `branch_id` per site di activities/new/
  // page.jsx). Pakai field `branch` (nama branch, sudah ikut diselect di
  // fetchScopeSites/planData.js) - BUKAN `branch_id` (slug internal) -
  // supaya label chip langsung nama branch yg dikenal user.
  const branchOptions = useMemo(() => {
    const set = new Set();
    for (const s of dedupedItems) { const v = (s.branch || "").trim(); if (v) set.add(v); }
    return Array.from(set).sort();
  }, [dedupedItems]);
  const lrsOptions = useMemo(() => {
    const set = new Set();
    for (const s of dedupedItems) { const v = (s.site_lrs || "").trim(); if (v && v.toUpperCase() !== "NO") set.add(v); }
    return Array.from(set).sort();
  }, [dedupedItems]);
  // Kecamatan yg PUNYA setidaknya satu site kecamatan_fokus="YES" - inilah
  // yg dipilih dulu (drill-down), BUKAN semua kecamatan yg ada di `items`.
  // Di-dedupe pakai kecamatan+kabupaten (BUKAN nama kecamatan saja) - nama
  // kecamatan yg SAMA bisa muncul di kabupaten yg berbeda, konsisten dgn key
  // "<kecamatan_name>|<kabupaten>" yg sudah dipakai utk grouping kecamatan
  // unik di report/page.jsx. Dedupe cuma pakai nama bikin 2 kecamatan
  // berbeda ketuker jadi satu opsi filter (bug lama).
  const fokusKecamatanOptions = useMemo(() => {
    const map = new Map();
    for (const s of dedupedItems) {
      if ((s.kecamatan_fokus || "").toUpperCase() === "YES") {
        // `kecamatan` kadang sudah berformat "NAMA|KABUPATEN" sendiri
        // (format "Kecamatan Unik" di dataset ini) - kalau dipakai
        // mentah2 jadi `name`, nanti dobel dgn suffix " | kabupaten" yg
        // ditambahkan di label (contoh bug: "BAITURRAHMAN|KOTA BANDA
        // ACEH | KOTA BANDA ACEH"). Ambil cuma bagian nama-nya; kabupaten
        // tetap dari field `s.kabupaten` yg sudah ada sendiri.
        const rawKecamatan = s.kecamatan || "";
        const name = rawKecamatan.includes("|") ? rawKecamatan.split("|")[0].trim() : rawKecamatan;
        if (!name) continue;
        const kabupaten = s.kabupaten || "";
        const key = `${name}|${kabupaten}`;
        if (!map.has(key)) map.set(key, { key, name, kabupaten });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name) || a.kabupaten.localeCompare(b.kabupaten));
  }, [dedupedItems]);

  // Konteks site per kecamatan - permintaan user: badge jumlah activity
  // SAJA dirasa kurang lengkap (tidak jelas kecamatan ini sebenarnya py
  // berapa site, apalagi kenapa dia muncul sbg "Kecamatan Fokus"). Di sini
  // dihitung utk SEMUA kecamatan (bukan cuma yg berstatus fokus) dari
  // `dedupedItems`: total site di kecamatan itu + berapa di antaranya yg
  // ditandai kecamatan_fokus="YES" (alasan kecamatan ini muncul di list).
  const kecSiteStats = useMemo(() => {
    const map = new Map(); // key -> { total, fokus }
    for (const s of dedupedItems) {
      const rawKecamatan = s.kecamatan || "";
      const name = rawKecamatan.includes("|") ? rawKecamatan.split("|")[0].trim() : rawKecamatan;
      if (!name) continue;
      const key = `${name}|${s.kabupaten || ""}`;
      const cur = map.get(key) || { total: 0, fokus: 0 };
      cur.total += 1;
      if ((s.kecamatan_fokus || "").toUpperCase() === "YES") cur.fokus += 1;
      map.set(key, cur);
    }
    return map;
  }, [dedupedItems]);

  // Daftar kecamatan fokus yg BENAR2 ditampilkan - persempit lagi dgn
  // `kecQuery` (search box khusus di atas list ini, lihat render di bawah)
  // - cocok kalau nama ATAU kabupaten mengandung ketikan user, biar list
  // panjang (banyak kecamatan per region) tetap gampang dicari tanpa harus
  // scroll manual satu per satu.
  const filteredFokusKecamatanOptions = useMemo(() => {
    const query = kecQuery.trim().toLowerCase();
    if (!query) return fokusKecamatanOptions;
    return fokusKecamatanOptions.filter((o) => o.name.toLowerCase().includes(query) || (o.kabupaten || "").toLowerCase().includes(query));
  }, [fokusKecamatanOptions, kecQuery]);

  // Jumlah activity (Plan/event) bulan INI per kecamatan - dihitung dari
  // SEMUA site yg ada di kecamatan itu (bukan cuma site yg ditandai
  // kecamatan_fokus="YES" - biar angkanya mewakili "activity di kecamatan
  // ini" scr utuh, bukan cuma di site fokusnya saja), jadi user bisa lihat
  // sekilas kecamatan mana yg SUDAH digarap bulan ini vs yg masih kosong
  // sebelum memutuskan mau fokus kemana. RLS mh_activities (`mh_activities_
  // web_read`, qual=true) sudah membuka SELECT lintas scope - konsisten dgn
  // query lain yg sudah langsung select dari client di app ini, bukan
  // celah baru yg ditambahkan di sini.
  const [kecActivityCounts, setKecActivityCounts] = useState(null); // Map<kecKey, number> | null = belum selesai load
  const [kecCountsLoading, setKecCountsLoading] = useState(false);
  const monthLabel = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  }, []);
  useEffect(() => {
    if (!filtersOpen || fokusKecamatanOptions.length === 0 || kecActivityCounts !== null) return;
    let alive = true;
    // Peta site_id -> kunci kecamatan (nama|kabupaten), dari SEMUA site di
    // `dedupedItems` (bukan cuma yg kecamatan_fokus="YES") - site tanpa
    // data kecamatan dilewati (tidak bisa dikaitkan ke kecamatan manapun).
    const siteToKec = new Map();
    for (const s of dedupedItems) {
      const rawKecamatan = s.kecamatan || "";
      const name = rawKecamatan.includes("|") ? rawKecamatan.split("|")[0].trim() : rawKecamatan;
      if (!name || !s.site_id) continue;
      siteToKec.set(s.site_id, `${name}|${s.kabupaten || ""}`);
    }
    const siteIds = Array.from(siteToKec.keys());
    if (siteIds.length === 0) { queueMicrotask(() => { if (alive) setKecActivityCounts(new Map()); }); return; }
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
    (async () => {
      if (alive) setKecCountsLoading(true);
      try {
        const { data, error } = await supabaseMarta
          .from("mh_activities")
          .select("site_id")
          .in("site_id", siteIds)
          .gte("plan_date", monthStart)
          .lt("plan_date", monthEnd);
        if (error) throw error;
        const counts = new Map();
        for (const row of data || []) {
          const key = siteToKec.get(row.site_id);
          if (!key) continue;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        if (alive) setKecActivityCounts(counts);
      } catch {
        if (alive) setKecActivityCounts(new Map()); // gagal diam2 - badge jumlah cuma hiasan tambahan, jangan sampai bikin seluruh popup filter error
      } finally {
        if (alive) setKecCountsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [filtersOpen, fokusKecamatanOptions, dedupedItems, kecActivityCounts]);

  const activeFilterCount = (branchFilter.size > 0 ? 1 : 0) + (lrsFilter.size > 0 ? 1 : 0) + (fokusKecamatanFilter.size > 0 ? 1 : 0);
  // Tag filter aktif - PERMINTAAN USER: jangan digabung jadi 1 pill
  // panjang per grup (sblmnya "Kecamatan Fokus: A, B, C" numpuk jadi 1
  // pill raksasa 3 baris begitu pilih byk kecamatan) - skr tiap NILAI yg
  // dipilih (tiap branch, tiap tier LRS, tiap kecamatan) jadi pill-nya
  // SENDIRI2/terpisah, jadi tetap rapi & scannable brp pun byk yg aktif,
  // & "×"-nya cuma hapus 1 nilai itu doang (bukan reset 1 grup sekaligus).
  const fokusKecamatanTags = Array.from(fokusKecamatanFilter).map((key) => {
    const opt = fokusKecamatanOptions.find((o) => o.key === key);
    const value = opt ? (opt.kabupaten ? `${opt.name} | ${opt.kabupaten}` : opt.name) : key;
    return { key: `fokus-${key}`, group: "Kecamatan", value, onClear: () => toggleFokusKecamatan(key) };
  });
  const activeFilterTags = [
    ...Array.from(branchFilter).map((v) => ({ key: `branch-${v}`, group: "Branch", value: v, onClear: () => toggleBranch(v) })),
    ...Array.from(lrsFilter).map((v) => ({ key: `lrs-${v}`, group: "LRS", value: v, onClear: () => toggleLrs(v) })),
    ...fokusKecamatanTags,
  ];

  // CATATAN penting (permintaan user "bisa multiple filter"): sebelumnya
  // toggleBranch/toggleLrs manggil setFiltersOpen(false) tiap kali 1 chip
  // ditekan - jadi begitu pilih 1 opsi popup-nya lgs ketutup, otomatis
  // GA MUNGKIN pilih opsi ke-2 (padahal state-nya udah Set/multi-select).
  // Sama sekali bukan soal chip-nya, tapi efek sampingnya. FIX: toggle
  // SEMUA grup filter (Branch, Site LRS, Kecamatan Fokus) sekarang HANYA
  // update state-nya, popup TETAP terbuka - user bebas pilih sebanyak yg
  // dia mau, baru ketutup pas tekan "Batal"/"Terapkan" di footer.
  function toggleBranch(v) {
    setBranchFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }
  function toggleLrs(v) {
    setLrsFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }
  function toggleFokusKecamatan(key) {
    setFokusKecamatanFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function resetFilters() {
    setBranchFilter(new Set());
    setLrsFilter(new Set());
    setFokusKecamatanFilter(new Set());
  }

  const filtered = dedupedItems.filter((s) => {
    if (q.trim()) {
      const query = q.toLowerCase();
      if (!s.site_id.toLowerCase().includes(query) && !(s.site_name || "").toLowerCase().includes(query)) return false;
    }
    if (branchFilter.size > 0 && !branchFilter.has((s.branch || "").trim())) return false;
    if (lrsFilter.size > 0 && !lrsFilter.has((s.site_lrs || "").trim())) return false;
    if (fokusKecamatanFilter.size > 0) {
      // Drill-down: HANYA site di salah satu kecamatan terpilih (bisa lebih
      // dari satu skr - OR, bukan AND) yg juga bertanda kecamatan_fokus=
      // "YES" - bukan semua site di kecamatan itu (sesuai permintaan "site
      // pada kecamatan fokus yang ditandai"). Key sama persis dgn yg
      // dipakai fokusKecamatanOptions (kecamatan+kabupaten).
      const rawKecamatan = s.kecamatan || "";
      const name = rawKecamatan.includes("|") ? rawKecamatan.split("|")[0].trim() : rawKecamatan;
      const key = `${name}|${s.kabupaten || ""}`;
      if (!fokusKecamatanFilter.has(key) || (s.kecamatan_fokus || "").toUpperCase() !== "YES") return false;
    }
    return true;
  });
  // Dibangun di atas BottomSheet (_shared/BottomSheet.jsx) - primitif yg
  // sama dipakai semua sheet "muncul dari bawah" di app ini (animasi
  // masuk/keluar/drag konsisten). Search box perlu tetap kelihatan/nempel
  // di atas sementara HANYA daftar site yg discroll kalau panjang - itu
  // diatur SENDIRI di sini (bukan lewat BottomSheet, yg isinya generik),
  // pakai `useVisualViewportBox` yg sama supaya batas tinggi daftarnya juga
  // tetap pas walau keyboard virtual sedang muncul (bukan vh statis).
  const sheetRef = useRef(null);
  const vv = useVisualViewportBox();

  function selectAndClose(s) {
    sheetRef.current?.close(() => onSelect(s));
  }

  return (
    <BottomSheet ref={sheetRef} onClose={onClose}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", maxHeight: Math.round(vv.height * 0.72) }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 4px 10px" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#17181C", letterSpacing: -0.2 }}>{title}</div>
            <button
              onClick={() => sheetRef.current?.close(onClose)}
              aria-label="Tutup"
              style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "#F1F2F5", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <X size={15} strokeWidth={2.5} />
            </button>
          </div>
          {/* Site Terpilih - opsional, cuma render kalau pemanggil kasih
              selectedItems (mis. "Tambah Site" di Isi Laporan Actual yg
              sudah punya site actual sebelumnya). Pemanggil lain (pilih
              site utama tunggal di wizard Buat Plan/Pasang POSM) tidak
              kasih prop ini sama sekali, jadi section ini tidak pernah
              muncul di sana - backward compatible tanpa perubahan apapun
              di call site lain. Strip horizontal-scroll (bukan list
              vertikal) supaya tidak makan tinggi layar kalau site yg
              sudah dipilih banyak, konsisten dgn bahasa "chip" yg sudah
              dipakai di filter (Filter Site di bawah, Filter Aktivitas). */}
          {dedupedSelected.length > 0 && (
            <div style={{ marginBottom: 10, padding: "10px 10px 11px", borderRadius: 14, background: ACCENT_BG, border: `1px solid ${ACCENT}22` }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Site Terpilih ({dedupedSelected.length})
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
                {dedupedSelected.map((s) => (
                  <div key={s.site_id} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "6px 6px 6px 11px", borderRadius: 999, background: "#FFFFFF", border: "1.5px solid #FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", maxWidth: 220 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.site_id}{s.site_name ? ` · ${s.site_name}` : ""}
                    </span>
                    {onRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(s)}
                        aria-label={`Hapus ${s.site_id}`}
                        title="Hapus site ini"
                        style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", border: "none", background: "#FDECEC", color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <Search size={16} color="#9A9AA6" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari nama site atau Site ID…"
                style={inputBase}
              />
            </div>
            {/* Tombol filter - HANYA muncul kalau ada opsi utk difilter
                (branch/scope tanpa site LRS maupun kecamatan fokus tidak
                perlu tombol nganggur). Inline collapsible (bukan sheet
                terpisah spt Filter Aktivitas) krn ini SUDAH di dalam sheet
                yg terbuka - membuka sheet filter kedua di atasnya bakal
                terasa bertumpuk di layar kecil. */}
            {(branchOptions.length > 0 || lrsOptions.length > 0 || fokusKecamatanOptions.length > 0) && (
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                aria-label="Filter site"
                style={{
                  position: "relative", flexShrink: 0, width: 48, height: 48, borderRadius: 12, cursor: "pointer",
                  border: `1.5px solid ${filtersOpen || activeFilterCount > 0 ? ACCENT : "#ECEDF0"}`,
                  background: filtersOpen || activeFilterCount > 0 ? ACCENT_BG : "#F6F7F9",
                  color: filtersOpen || activeFilterCount > 0 ? ACCENT : "#5A5A68",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {filtersOpen ? <ChevronUp size={16} strokeWidth={2.5} /> : <SlidersHorizontal size={16} />}
                {activeFilterCount > 0 && (
                  <span style={{
                    position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 999,
                    background: ACCENT, color: "#fff", fontSize: 10, fontWeight: 800, fontFamily: FF,
                    display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
                  }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Chip filter aktif - versi "mewah" (permintaan user): dulu
              chip flat warna solid pink, sekarang kartu putih kecil dgn
              soft shadow + border tipis, label dipecah jadi 2 tingkat
              (kategori kecil abu2 uppercase di atas tombol X, nilai bold
              gelap di bawahnya) dipisah titik aksen merah kecil - kesan
              lebih premium/clean drpd 1 baris teks panjang di atas blok
              warna solid. Tiap chip tetap py tombol hapus bulat sendiri
              (hapus 1 nilai itu doang), & "Hapus semua" cuma muncul kalau
              aktif >1 chip. */}
          {activeFilterCount > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                {activeFilterTags.map((tag) => (
                  <div
                    key={tag.key}
                    style={{
                      display: "flex", alignItems: "center", gap: 9, padding: "7px 8px 7px 13px", borderRadius: 14,
                      background: "#FFFFFF", border: "1px solid #EFE0E1",
                      fontFamily: FF, maxWidth: "100%",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <Filter size={10} color={ACCENT} style={{ flexShrink: 0 }} />
                      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: "#ABABB8", textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.3 }}>
                          {tag.group}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#17181C", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word" }}>
                          {tag.value}
                        </span>
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={tag.onClear}
                      aria-label={`Hapus filter ${tag.group}: ${tag.value}`}
                      style={{ flexShrink: 0, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#F6F7F9", color: "#8A8A96", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, margin: 0, cursor: "pointer" }}
                    >
                      <X size={10} strokeWidth={3} />
                    </button>
                  </div>
                ))}
              {activeFilterTags.length > 1 && (
                <button
                  onClick={resetFilters}
                  style={{ flexShrink: 0, background: "none", border: "none", padding: "4px 2px", color: "#8A8A96", fontSize: 11, fontWeight: 700, fontFamily: FF, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
                >
                  Hapus semua
                </button>
              )}
            </div>
          )}

          {filtersOpen && createPortal(
            // Filter Site PERMINTAAN TERBARU: jangan lagi sliding card dari
            // bawah (BottomSheet) - user minta "pop up lepas" yg CENTER di
            // tengah layar dgn background menggelap (modal klasik, bukan
            // bottom sheet). AKAR MASALAH knp "position:fixed" tetap
            // kelihatan "terbungkus" di dalam card "Pilih Site" (bukan
            // bener2 center ke seluruh layar HP): BottomSheet (card induk
            // "Pilih Site") pakai CSS `transform` utk animasi slide-nya -
            // per spec CSS, ancestor dgn `transform` jadi containing block
            // BARU utk descendant `position:fixed`, jadi fixed-nya kita
            // justru "fixed" relatif ke card itu, BUKAN ke viewport asli.
            // FIX PASTI: portal-kan modal ini ke document.body (createPortal)
            // supaya DOM-nya keluar total dari tree BottomSheet yg
            // ketransform itu, baru position:fixed+vv.top/vv.height bisa
            // bener2 ngerujuk ke viewport layar HP, dicenter via flexbox.
            <div
              onClick={() => setFiltersOpen(false)}
              style={{
                position: "fixed", top: vv.top, left: 0, right: 0, height: vv.height, zIndex: 9999,
                display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                background: "rgba(23,24,28,0.62)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%", maxWidth: 420,
                  maxHeight: Math.round(vv.height * 0.85),
                  display: "flex", flexDirection: "column",
                  background: "#FFFFFF", borderRadius: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
                  padding: "22px 22px calc(env(safe-area-inset-bottom,0px) + 22px)",
                  fontFamily: FF,
                }}
              >
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#17181C" }}>Filter Site</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    {activeFilterCount > 0 && (
                      <button onClick={resetFilters} style={{ background: "none", border: "none", padding: 0, color: ACCENT, fontSize: 12, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
                        Reset Semua ({activeFilterCount})
                      </button>
                    )}
                    <button onClick={() => setFiltersOpen(false)} style={{ background: "#F6F7F9", border: "none", borderRadius: 999, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      <X size={15} color="#8A8A96" />
                    </button>
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, marginTop: 14, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", paddingRight: 2 }}>
                {branchOptions.length > 1 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      Branch {branchFilter.size > 0 && <span style={{ color: ACCENT }}>({branchFilter.size} dipilih)</span>}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {branchOptions.map((v) => {
                        const active = branchFilter.has(v);
                        return (
                          <button key={v} onClick={() => toggleBranch(v)}
                            style={{
                              padding: "9px 14px", borderRadius: 11, border: `1.5px solid ${active ? ACCENT : "#E9EAEE"}`,
                              background: active ? ACCENT_BG : "#F8F8FA", color: active ? ACCENT : "#5A5A68",
                              fontSize: 12, fontWeight: 800, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                            }}>
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Cuma 1 branch (scope akun memang terkunci ke situ) - bukan
                    pilihan sungguhan, jadi JANGAN dirender sbg tombol yg
                    kelihatan bisa ditoggle. Badge info statis, read-only. */}
                {branchOptions.length === 1 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em" }}>Branch</div>
                    <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 11, background: "#F8F8FA", border: "1.5px solid #E9EAEE", color: "#8A8A96", fontSize: 12, fontWeight: 800, fontFamily: FF }}>
                      {branchOptions[0]}
                    </div>
                  </div>
                )}

                {lrsOptions.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      Site LRS {lrsFilter.size > 0 && <span style={{ color: ACCENT }}>({lrsFilter.size} dipilih)</span>}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {lrsOptions.map((v) => {
                        const active = lrsFilter.has(v);
                        return (
                          <button key={v} onClick={() => toggleLrs(v)}
                            style={{
                              padding: "9px 14px", borderRadius: 11, border: `1.5px solid ${active ? ACCENT : "#E9EAEE"}`,
                              background: active ? ACCENT_BG : "#F8F8FA", color: active ? ACCENT : "#5A5A68",
                              fontSize: 12, fontWeight: 800, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                            }}>
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {fokusKecamatanOptions.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      Kecamatan Fokus {fokusKecamatanFilter.size > 0 && <span style={{ color: ACCENT }}>({fokusKecamatanFilter.size} dipilih)</span>}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11.5, color: "#9A9AA6", fontWeight: 600 }}>Bisa pilih lebih dari satu kecamatan sekaligus</div>

                    {/* Search box KHUSUS list kecamatan ini - gaya SAMA
                        dgn search box "Site" di Filter Aktivitas (kotak
                        abu2 flat dgn ikon kaca pembesar, bukan pill
                        terpisah). */}
                    {fokusKecamatanOptions.length > 5 && (
                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 7, height: 38, padding: "0 11px", borderRadius: 10, background: "#F8F8FA", border: "1px solid #E9EAEE" }}>
                        <Search size={13} color="#9A9AA6" />
                        <input value={kecQuery} onChange={(e) => setKecQuery(e.target.value)} placeholder="Cari kecamatan atau kabupaten…"
                          style={{ flex: 1, minWidth: 0, height: "100%", background: "transparent", border: "none", outline: "none", fontSize: 12.5, fontFamily: FF, color: "#17181C" }} />
                      </div>
                    )}

                    {/* List kecamatan - gaya SAMA dgn list "Site" di Filter
                        Aktivitas: 1 kotak bordered, baris dipisah hairline
                        (bukan kartu terpisah dgn gap), baris aktif ditandai
                        bg merah muda - lebih padat & konsisten drpd versi
                        chip-card bulat sebelumnya. GA pakai maxHeight+scroll
                        sendiri lagi di sini (versi sblmnya dibatasi 320px) -
                        skr card modal-nya sendiri sudah punya containing
                        block yg pasti (backdrop position:absolute+inset:0
                        nempel ke wrapper card "Pilih Site"), jadi body di
                        atas (flex:1+overflowY:auto) SUDAH scroll dgn benar
                        & penuh. Kasih list ini maxHeight sendiri lagi cuma
                        bikin area scroll kepotong sempit (nested scroll)
                        padahal body py ruang lebih luas yg nganggur -
                        biarkan dia ikut alur normal body yg nentuin
                        batas+scroll. */}
                    <div style={{ marginTop: 8, border: "1px solid #E9EAEE", borderRadius: 12 }}>
                      {/* "Semua Kecamatan" skr artinya "kosongkan semua
                          pilihan" (bukan salah satu opsi exclusive lagi) -
                          ditandai aktif kalau BELUM ada kecamatan dipilih
                          sama sekali, & klik dia = clear semua. */}
                      {!kecQuery.trim() && (
                        <button onClick={() => setFokusKecamatanFilter(new Set())}
                          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 13px", background: fokusKecamatanFilter.size === 0 ? ACCENT_BG : "#FFFFFF", border: "none", cursor: "pointer", fontFamily: FF, textAlign: "left" }}>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: fokusKecamatanFilter.size === 0 ? ACCENT : "#17181C" }}>
                            Semua Kecamatan <span style={{ fontWeight: 600, opacity: 0.75 }}>({fokusKecamatanOptions.length})</span>
                          </span>
                          {fokusKecamatanFilter.size === 0 && <Check size={15} strokeWidth={2.5} color={ACCENT} />}
                        </button>
                      )}
                      {filteredFokusKecamatanOptions.map((opt, i) => {
                        const active = fokusKecamatanFilter.has(opt.key);
                        const label = opt.kabupaten ? `${opt.name} | ${opt.kabupaten}` : opt.name;
                        const count = kecActivityCounts?.get(opt.key) || 0;
                        // Konteks site - permintaan user sebelumnya: badge
                        // jumlah activity SENDIRIAN dirasa kurang lengkap,
                        // perlu kelihatan juga ADA BERAPA site di kecamatan
                        // ini & berapa yg jadi ALASAN kecamatan ini masuk
                        // "Kecamatan Fokus".
                        const stats = kecSiteStats.get(opt.key) || { total: 0, fokus: 0 };
                        const showDivider = i > 0 || !kecQuery.trim();
                        return (
                          <button key={opt.key} onClick={() => toggleFokusKecamatan(opt.key)}
                            style={{
                              width: "100%", display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 13px",
                              background: active ? ACCENT_BG : "#FFFFFF", border: "none",
                              borderTop: showDivider ? "1px solid #F0F0F3" : "none", cursor: "pointer", fontFamily: FF, textAlign: "left",
                            }}>
                            <Star size={13} fill={active ? ACCENT : "none"} color={active ? ACCENT : "#C7C8D1"} style={{ flexShrink: 0, marginTop: 2 }} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 800, color: active ? ACCENT : "#17181C" }}>{label}</div>
                              <div style={{ marginTop: 3, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 10.5, fontWeight: 700, color: "#8A8A96" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <MapPinned size={10} />
                                  {stats.total} site{stats.fokus > 0 ? ` (${stats.fokus} fokus)` : ""}
                                </span>
                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <CalendarDays size={10} />
                                  {kecCountsLoading && kecActivityCounts === null ? "Memuat…" : `${count} activity · ${monthLabel}`}
                                </span>
                              </div>
                            </span>
                            {active && <Check size={15} strokeWidth={2.5} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />}
                          </button>
                        );
                      })}
                      {kecQuery.trim() && filteredFokusKecamatanOptions.length === 0 && (
                        <div style={{ padding: "16px 12px", textAlign: "center", fontSize: 12, color: "#8A8A96", fontWeight: 600 }}>
                          Tidak ada kecamatan yang cocok dengan &quot;{kecQuery.trim()}&quot;.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

                {/* Footer TETAP (flexShrink:0, lihat catatan besar di
                    pembuka wrapper flex column di atas) - jumlah hasil
                    live update + Reset/Terapkan, gaya SAMA PERSIS dgn
                    footer Filter Aktivitas. */}
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #F0F0F3" }}>
                  <div style={{ textAlign: "center", fontSize: 11.5, color: "#8A8A96", fontWeight: 600, marginBottom: 10 }}>
                    {filtered.length} site cocok dgn filter ini
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setFiltersOpen(false)}
                      style={{ flex: 1, height: 46, borderRadius: 12, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: "pointer" }}>
                      Batal
                    </button>
                    <button onClick={() => setFiltersOpen(false)}
                      style={{ flex: 1, height: 46, borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
                      Terapkan
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>

        <div style={{ marginTop: 10, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
          {filtered.length === 0 && (
            <div style={{ padding: "32px 0", textAlign: "center", color: "#8A8A96", fontSize: 12.5 }}>Tidak ada site cocok.</div>
          )}
          {filtered.map((s) => (
            <button
              key={s.site_id}
              onClick={() => selectAndClose(s)}
              style={{ width: "100%", textAlign: "left", padding: "14px 10px", borderRadius: 12, border: "none", background: "none", borderBottom: "1px solid #F0F0F3", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12 }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F6F7F9", border: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <SiteTowerIcon size={17} color="#8A8A96" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                {/* Judul: site_id | site_name. whiteSpace normal + break-word
                    supaya nama panjang WRAP, bukan dipotong ellipsis - sesuai
                    permintaan: jangan ada teks terpotong di baris site. */}
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#17181C", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                  <span style={{ flexShrink: 0 }}>{s.site_id}</span>
                  {s.site_name && (
                    <>
                      <span style={{ color: "#D8D9E0", flexShrink: 0 }}>|</span>
                      <span style={{ fontWeight: 600, color: "#5A5A68", whiteSpace: "normal", wordBreak: "break-word", minWidth: 0 }}>{s.site_name}</span>
                    </>
                  )}
                </div>
                {/* Baris badge: Fokus + tier Site LRS, satu row yg wrap
                    supaya kombinasi keduanya + judul panjang tetap rapi
                    tanpa overflow. */}
                {(() => {
                  const isFokus = (s.kecamatan_fokus || "").toUpperCase() === "YES";
                  const lrsRaw = (s.site_lrs || "").trim();
                  const lrsUpper = lrsRaw.toUpperCase();
                  const hasLrsBadge = lrsRaw && lrsUpper !== "NO";
                  // Palet per-tier - hijau utk tier positif, merah ACCENT
                  // (sama dgn warna brand yg sudah dipakai) utk tier yg perlu
                  // diwaspadai, abu netral utk status "LRS" polos.
                  const LRS_STYLES = {
                    PROFIT: { bg: "#E7F7EE", fg: "#1A8A4C" },
                    "ABOVE THRESHOLD": { bg: "#E7F7EE", fg: "#1A8A4C" },
                    LRS: { bg: "#F0F1F5", fg: "#5A5A68" },
                    "AT RISK": { bg: ACCENT_BG, fg: ACCENT },
                    "BELOW THRESHOLD": { bg: ACCENT_BG, fg: ACCENT },
                  };
                  const lrsStyle = LRS_STYLES[lrsUpper] || { bg: "#F0F1F5", fg: "#5A5A68" };
                  if (!isFokus && !hasLrsBadge) return null;
                  return (
                    <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                      {/* Remarks - site ini termasuk kecamatan fokus (mh_sites.
                          kecamatan_fokus="YES"), SAMA aturan/data dgn filter
                          "Kecamatan Fokus" di Filter Aktivitas (activities/
                          page.jsx) - dipertegas dgn badge di sini supaya
                          kelihatan langsung tanpa perlu buka filter dulu. */}
                      {isFokus && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 7,
                          background: ACCENT_BG, color: ACCENT, fontSize: 10.5, fontWeight: 800, fontFamily: FF, flexShrink: 0,
                        }}>
                          <Star size={9} fill={ACCENT} />
                          Fokus
                        </span>
                      )}
                      {/* Tier Site LRS (mh_sites.site_lrs) - sama datanya dgn
                          filter "Site LRS" di atas; "NO" dianggap "tanpa
                          badge" krn itu convention yg sama dgn chip filter. */}
                      {hasLrsBadge && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 7,
                          background: lrsStyle.bg, color: lrsStyle.fg, fontSize: 10.5, fontWeight: 800, fontFamily: FF,
                          flexShrink: 0, whiteSpace: "normal", wordBreak: "break-word",
                        }}>
                          {lrsRaw}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {(() => {
                  const sub = [s.kecamatan, s.mc].filter(Boolean).join(" · ");
                  return sub ? <div style={{ marginTop: 5, fontSize: 11.5, color: "#8A8A96", lineHeight: 1.4, whiteSpace: "normal", wordBreak: "break-word" }}>{sub}</div> : null;
                })()}
              </div>
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
