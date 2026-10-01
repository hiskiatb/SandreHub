"use client";
/**
 * SitePickerSheet - bottom sheet cari+pilih site dari daftar `items`
 * ({site_id, site_name}). Dipusatkan di sini (sebelumnya duplikat lokal di
 * wizard Buat Plan) supaya alur "Tambah Site" bisa dipakai lagi di Isi
 * Laporan Actual dgn konsep yg SAMA PERSIS spt di form plan.
 */
import { useMemo, useRef, useState } from "react";
import { useVisualViewportBox } from "./useVisualViewportBox";
import { X, Search, SlidersHorizontal, ChevronUp, Star, Trash2 } from "lucide-react";
import { FF } from "./MobileShell";
import BottomSheet from "./BottomSheet";

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
  const [fokusKecamatan, setFokusKecamatan] = useState(""); // "" = belum pilih kecamatan fokus manapun
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

  const activeFilterCount = (branchFilter.size > 0 ? 1 : 0) + (lrsFilter.size > 0 ? 1 : 0) + (fokusKecamatan ? 1 : 0);
  // Label kecamatan fokus aktif, utk tag filter aktif di bawah - pakai opsi
  // yg sama persis dgn yg dirender di chip (nama | kabupaten).
  const fokusKecamatanLabel = fokusKecamatan
    ? (() => {
        const opt = fokusKecamatanOptions.find((o) => o.key === fokusKecamatan);
        if (!opt) return "";
        return opt.kabupaten ? `${opt.name} | ${opt.kabupaten}` : opt.name;
      })()
    : "";
  // Tag filter aktif - masing2 grup filter (Site LRS, Kecamatan Fokus) jadi
  // pill TERPISAH (bukan 1 kalimat panjang digabung " · " spt sebelumnya),
  // supaya tetap rapi/scannable walau KEDUA filter aktif bersamaan. Tiap tag
  // bawa `onClear` sendiri jadi "×"-nya cuma reset filter grup itu saja.
  const activeFilterTags = [
    branchFilter.size > 0 ? { key: "branch", label: `Branch: ${Array.from(branchFilter).join(", ")}`, onClear: () => setBranchFilter(new Set()) } : null,
    lrsFilter.size > 0 ? { key: "lrs", label: `Site LRS: ${Array.from(lrsFilter).join(", ")}`, onClear: () => setLrsFilter(new Set()) } : null,
    fokusKecamatanLabel ? { key: "fokus", label: `Kecamatan Fokus: ${fokusKecamatanLabel}`, onClear: () => setFokusKecamatan("") } : null,
  ].filter(Boolean);

  function toggleBranch(v) {
    setBranchFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
    setFiltersOpen(false);
  }
  function toggleLrs(v) {
    setLrsFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
    setFiltersOpen(false);
  }
  function resetFilters() {
    setBranchFilter(new Set());
    setLrsFilter(new Set());
    setFokusKecamatan("");
  }

  const filtered = dedupedItems.filter((s) => {
    if (q.trim()) {
      const query = q.toLowerCase();
      if (!s.site_id.toLowerCase().includes(query) && !(s.site_name || "").toLowerCase().includes(query)) return false;
    }
    if (branchFilter.size > 0 && !branchFilter.has((s.branch || "").trim())) return false;
    if (lrsFilter.size > 0 && !lrsFilter.has((s.site_lrs || "").trim())) return false;
    if (fokusKecamatan) {
      // Drill-down: HANYA site di kecamatan terpilih yg juga bertanda
      // kecamatan_fokus="YES" - bukan semua site di kecamatan itu (sesuai
      // permintaan "site pada kecamatan fokus yang ditandai"). Key sama
      // persis dgn yg dipakai fokusKecamatanOptions (kecamatan+kabupaten).
      const rawKecamatan = s.kecamatan || "";
      const name = rawKecamatan.includes("|") ? rawKecamatan.split("|")[0].trim() : rawKecamatan;
      const key = `${name}|${s.kabupaten || ""}`;
      if (key !== fokusKecamatan || (s.kecamatan_fokus || "").toUpperCase() !== "YES") return false;
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
      <div style={{ display: "flex", flexDirection: "column", maxHeight: Math.round(vv.height * 0.72) }}>
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

          {activeFilterCount > 0 && (
            <div style={{ marginTop: 10, padding: "8px 12px 10px", borderRadius: 10, background: ACCENT_BG }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  Filter aktif
                </div>
                <button
                  onClick={resetFilters}
                  style={{ flexShrink: 0, background: "none", border: "none", padding: 0, color: ACCENT, fontSize: 11.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}
                >
                  Hapus semua
                </button>
              </div>
              <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: 7 }}>
                {activeFilterTags.map((tag) => (
                  <div
                    key={tag.key}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8,
                      background: "#FFFFFF", color: ACCENT, fontSize: 11.5, fontWeight: 700, fontFamily: FF,
                      whiteSpace: "normal", wordBreak: "break-word", maxWidth: "100%",
                    }}
                  >
                    <span style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{tag.label}</span>
                    <button
                      type="button"
                      onClick={tag.onClear}
                      aria-label={`Hapus filter ${tag.label}`}
                      style={{ flexShrink: 0, background: "none", border: "none", padding: 0, margin: 0, color: ACCENT, fontSize: 13, fontWeight: 800, lineHeight: 1, cursor: "pointer" }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filtersOpen && (
            <div style={{ marginTop: 10, padding: 14, borderRadius: 16, background: "#F8F8FA", border: "1px solid #E9EAEE" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.04em" }}>Filter Site</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {activeFilterCount > 0 && (
                    <button onClick={resetFilters} style={{ background: "none", border: "none", padding: 0, color: ACCENT, fontSize: 11.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
                      Reset
                    </button>
                  )}
                  {/* Affordance eksplisit "^" utk menutup panel filter -
                      selain tombol SlidersHorizontal/ChevronUp yg sama di
                      search bar (yg juga berubah jadi ChevronUp saat
                      terbuka), ada tombol tutup khusus di sini spy jelas
                      TANPA harus scroll balik ke search bar. */}
                  <button
                    onClick={() => setFiltersOpen(false)}
                    aria-label="Tutup filter"
                    title="Tutup filter"
                    style={{ width: 24, height: 24, borderRadius: "50%", border: "none", background: "#ECEDF0", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                  >
                    <ChevronUp size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {branchOptions.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#5A5A68" }}>
                    Branch {branchFilter.size > 0 && <span style={{ color: ACCENT }}>({branchFilter.size} dipilih)</span>}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {branchOptions.map((v) => {
                      const active = branchFilter.has(v);
                      return (
                        <button key={v} onClick={() => toggleBranch(v)}
                          style={{
                            height: 30, padding: "0 13px", borderRadius: 999, border: `1.5px solid ${active ? ACCENT : "#E4E5EA"}`,
                            background: active ? ACCENT_BG : "#FFFFFF", color: active ? ACCENT : "#5A5A68",
                            fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                          }}>
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Divider tipis antara Branch & Site LRS - konsisten dgn
                  divider yg sudah ada antara Site LRS & Kecamatan Fokus. */}
              {branchOptions.length > 0 && lrsOptions.length > 0 && (
                <div style={{ marginTop: 14, height: 1, background: "#E9EAEE" }} />
              )}

              {lrsOptions.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#5A5A68" }}>
                    Site LRS {lrsFilter.size > 0 && <span style={{ color: ACCENT }}>({lrsFilter.size} dipilih)</span>}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {lrsOptions.map((v) => {
                      const active = lrsFilter.has(v);
                      return (
                        <button key={v} onClick={() => toggleLrs(v)}
                          style={{
                            height: 30, padding: "0 13px", borderRadius: 999, border: `1.5px solid ${active ? ACCENT : "#E4E5EA"}`,
                            background: active ? ACCENT_BG : "#FFFFFF", color: active ? ACCENT : "#5A5A68",
                            fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                          }}>
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Divider tipis antara Site LRS & Kecamatan Fokus - biar 2
                  subsection kelihatan terpisah jelas, bukan menyatu. */}
              {lrsOptions.length > 0 && fokusKecamatanOptions.length > 0 && (
                <div style={{ marginTop: 14, height: 1, background: "#E9EAEE" }} />
              )}

              {fokusKecamatanOptions.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "#5A5A68" }}>Kecamatan Fokus</div>
                  <div style={{ marginTop: 2, fontSize: 10.5, color: "#9A9AA6" }}>Pilih kecamatan utk lihat site fokus di dalamnya</div>
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 7 }}>
                    <button onClick={() => setFokusKecamatan("")}
                      style={{
                        height: 30, padding: "0 13px", borderRadius: 999, border: `1.5px solid ${!fokusKecamatan ? ACCENT : "#E4E5EA"}`,
                        background: !fokusKecamatan ? ACCENT_BG : "#FFFFFF", color: !fokusKecamatan ? ACCENT : "#5A5A68",
                        fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                      }}>
                      Semua
                    </button>
                    {fokusKecamatanOptions.map((opt) => {
                      const active = fokusKecamatan === opt.key;
                      const label = opt.kabupaten ? `${opt.name} | ${opt.kabupaten}` : opt.name;
                      return (
                        <button key={opt.key} onClick={() => { setFokusKecamatan(active ? "" : opt.key); setFiltersOpen(false); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 5, minHeight: 30, padding: "6px 13px", borderRadius: 999,
                            border: `1.5px solid ${active ? ACCENT : "#E4E5EA"}`,
                            background: active ? ACCENT_BG : "#FFFFFF", color: active ? ACCENT : "#5A5A68",
                            fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "normal",
                            maxWidth: "100%", wordBreak: "break-word", textAlign: "left",
                          }}>
                          <Star size={10} fill={active ? ACCENT : "none"} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
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
