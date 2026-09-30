"use client";
/**
 * SitePickerSheet - bottom sheet cari+pilih site dari daftar `items`
 * ({site_id, site_name}). Dipusatkan di sini (sebelumnya duplikat lokal di
 * wizard Buat Plan) supaya alur "Tambah Site" bisa dipakai lagi di Isi
 * Laporan Actual dgn konsep yg SAMA PERSIS spt di form plan.
 */
import { useMemo, useRef, useState } from "react";
import { useVisualViewportBox } from "./useVisualViewportBox";
import { X, Search, SlidersHorizontal, Star } from "lucide-react";
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

export default function SitePickerSheet({ items, onClose, onSelect, title = "Pilih Site" }) {
  const [q, setQ] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lrsFilter, setLrsFilter] = useState(() => new Set());
  const [fokusKecamatan, setFokusKecamatan] = useState(""); // "" = belum pilih kecamatan fokus manapun
  // Dedup by site_id - mh_sites kadang punya baris duplikat persis utk
  // site_id yg sama (data existing, bukan bug di sini), jangan sampai
  // muncul dobel di daftar pilihan.
  const dedupedItems = Array.from(new Map((items || []).map((s) => [s.site_id, s])).values());

  // Opsi filter HANYA dihitung dari `items` yg diberikan pemanggil ke sheet
  // ini (sudah di-scope branch+brand+active sblm sampai sini, lihat
  // fetchScopeSites/StepLocation di activities/new/page.jsx) - jadi kalau
  // sheet ini dibuka utk satu branch tertentu (mis. "Tambah site lain" yg
  // sudah difilter MC yg sama), opsi filter ikut otomatis menyempit sesuai
  // itu, TANPA logika tambahan di sini yg perlu tahu soal multi-branch.
  const lrsOptions = useMemo(() => {
    const set = new Set();
    for (const s of dedupedItems) { const v = (s.site_lrs || "").trim(); if (v && v.toUpperCase() !== "NO") set.add(v); }
    return Array.from(set).sort();
  }, [dedupedItems]);
  // Kecamatan yg PUNYA setidaknya satu site kecamatan_fokus="YES" - inilah
  // yg dipilih dulu (drill-down), BUKAN semua kecamatan yg ada di `items`.
  const fokusKecamatanOptions = useMemo(() => {
    const set = new Set();
    for (const s of dedupedItems) {
      if ((s.kecamatan_fokus || "").toUpperCase() === "YES") {
        const name = s.kecamatan_name || s.kecamatan;
        if (name) set.add(name);
      }
    }
    return Array.from(set).sort();
  }, [dedupedItems]);

  const activeFilterCount = (lrsFilter.size > 0 ? 1 : 0) + (fokusKecamatan ? 1 : 0);

  function toggleLrs(v) {
    setLrsFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }
  function resetFilters() {
    setLrsFilter(new Set());
    setFokusKecamatan("");
  }

  const filtered = dedupedItems.filter((s) => {
    if (q.trim()) {
      const query = q.toLowerCase();
      if (!s.site_id.toLowerCase().includes(query) && !(s.site_name || "").toLowerCase().includes(query)) return false;
    }
    if (lrsFilter.size > 0 && !lrsFilter.has((s.site_lrs || "").trim())) return false;
    if (fokusKecamatan) {
      // Drill-down: HANYA site di kecamatan terpilih yg juga bertanda
      // kecamatan_fokus="YES" - bukan semua site di kecamatan itu (sesuai
      // permintaan "site pada kecamatan fokus yang ditandai").
      const name = s.kecamatan_name || s.kecamatan;
      if (name !== fokusKecamatan || (s.kecamatan_fokus || "").toUpperCase() !== "YES") return false;
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
            {(lrsOptions.length > 0 || fokusKecamatanOptions.length > 0) && (
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
                <SlidersHorizontal size={16} />
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

          {filtersOpen && (
            <div style={{ marginTop: 10, padding: "12px 12px 4px", borderRadius: 14, background: "#F8F8FA", border: "1px solid #E9EAEE" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: "0.03em" }}>Filter Site</div>
                {activeFilterCount > 0 && (
                  <button onClick={resetFilters} style={{ background: "none", border: "none", padding: 0, color: ACCENT, fontSize: 11.5, fontWeight: 800, fontFamily: FF, cursor: "pointer" }}>
                    Reset
                  </button>
                )}
              </div>

              {lrsOptions.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#5A5A68" }}>
                    Site LRS {lrsFilter.size > 0 ? `(${lrsFilter.size} dipilih)` : ""}
                  </div>
                  <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: 7, paddingBottom: 12 }}>
                    {lrsOptions.map((v) => {
                      const active = lrsFilter.has(v);
                      return (
                        <button key={v} onClick={() => toggleLrs(v)}
                          style={{
                            padding: "7px 12px", borderRadius: 999, border: `1.5px solid ${active ? ACCENT : "#E9EAEE"}`,
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

              {fokusKecamatanOptions.length > 0 && (
                <div style={{ marginTop: lrsOptions.length > 0 ? 0 : 10, paddingBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#5A5A68" }}>Kecamatan Fokus</div>
                  <div style={{ marginTop: 2, fontSize: 10.5, color: "#8A8A96" }}>Pilih kecamatan utk lihat site fokus di dalamnya</div>
                  <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: 7 }}>
                    <button onClick={() => setFokusKecamatan("")}
                      style={{
                        padding: "7px 12px", borderRadius: 999, border: `1.5px solid ${!fokusKecamatan ? ACCENT : "#E9EAEE"}`,
                        background: !fokusKecamatan ? ACCENT_BG : "#FFFFFF", color: !fokusKecamatan ? ACCENT : "#5A5A68",
                        fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                      }}>
                      Semua
                    </button>
                    {fokusKecamatanOptions.map((k) => {
                      const active = fokusKecamatan === k;
                      return (
                        <button key={k} onClick={() => setFokusKecamatan(active ? "" : k)}
                          style={{
                            display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 999,
                            border: `1.5px solid ${active ? ACCENT : "#E9EAEE"}`,
                            background: active ? ACCENT_BG : "#FFFFFF", color: active ? ACCENT : "#5A5A68",
                            fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer", whiteSpace: "nowrap",
                          }}>
                          <Star size={10} fill={active ? ACCENT : "none"} />
                          {k}
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
              style={{ width: "100%", textAlign: "left", padding: "12px 10px", borderRadius: 12, border: "none", background: "none", borderBottom: "1px solid #F0F0F3", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "#F6F7F9", border: "1px solid #ECEDF0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <SiteTowerIcon size={16} color="#8A8A96" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#17181C", display: "flex", alignItems: "baseline", gap: 6, overflow: "hidden" }}>
                  <span style={{ flexShrink: 0 }}>{s.site_id}</span>
                  {s.site_name && (
                    <>
                      <span style={{ color: "#D8D9E0", flexShrink: 0 }}>|</span>
                      <span style={{ fontWeight: 600, color: "#5A5A68", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.site_name}</span>
                    </>
                  )}
                </div>
                <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {(() => {
                    const sub = [s.kecamatan, s.mc].filter(Boolean).join(" - ");
                    return sub ? <div style={{ fontSize: 11.5, color: "#8A8A96", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div> : null;
                  })()}
                  {/* Remarks - site ini termasuk kecamatan fokus (mh_sites.
                      kecamatan_fokus="YES"), SAMA aturan/data dgn filter
                      "Kecamatan Fokus" di Filter Aktivitas (activities/
                      page.jsx) - dipertegas dgn badge di sini supaya
                      kelihatan langsung tanpa perlu buka filter dulu. */}
                  {(s.kecamatan_fokus || "").toUpperCase() === "YES" && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 7px", borderRadius: 999,
                      background: ACCENT_BG, color: ACCENT, fontSize: 10, fontWeight: 800, fontFamily: FF, flexShrink: 0,
                    }}>
                      <Star size={9} fill={ACCENT} />
                      Fokus
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
