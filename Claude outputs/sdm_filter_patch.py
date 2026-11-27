p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# ── 1) Import ikon X (tombol clear filter).
do(
    'import { ArrowDownLeft, ArrowLeft, ArrowRight, Building2, ChevronDown, Coins, FileText, Globe2, GripVertical, Info, MapPin, Megaphone, MoreVertical, Save, Settings2, Users } from "lucide-react";',
    'import { ArrowDownLeft, ArrowLeft, ArrowRight, Building2, ChevronDown, Coins, FileText, Globe2, GripVertical, Info, MapPin, Megaphone, MoreVertical, Save, Settings2, Users, X } from "lucide-react";',
    1, "import ikon X",
)

# ── 2) StepHeroDepo: tambah prop `regionControl` (mirror depoControl) -
# permintaan user: Region/Area/Depo di header SDM "harusnya tetap bisa
# dipilih, namun dia ada pilihan langsung clear filter". Kolom Region
# sebelumnya cuma teks statis (prop `region`) - skrg bisa diisi kontrol
# custom (select) via `regionControl`, fallback ke teks statis spt
# sebelumnya kalau prop ini tidak dikirim (Langkah 1/3/4 - tidak
# berubah).
do(
    'function StepHeroDepo({ icon: Icon, eyebrow, title, depoName, depoControl, region, area, areaOptions, onAreaChange, mcs, mcControl, totalLabel, totalValue, t }) {',
    'function StepHeroDepo({ icon: Icon, eyebrow, title, depoName, depoControl, region, regionControl, area, areaOptions, onAreaChange, mcs, mcControl, totalLabel, totalValue, t }) {',
    1, "StepHeroDepo: tambah prop regionControl",
)
do(
    '''            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>Region</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.inputBd}`, borderRadius: 8, padding: "7px 12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{region || "—"}</span>
            </div>''',
    '''            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>Region</span>
              {regionControl || (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.inputBd}`, borderRadius: 8, padding: "7px 12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{region || "—"}</span>
              )}
            </div>''',
    1, "Region: fallback ke regionControl",
)

# ── 3) Komponen SdmFilterSelect - select rapi dgn opsi "Semua ..." di
# atas (= clear filter) + tombol X kecil muncul pas lagi difilter.
# Dipakai utk filter TAMPILAN section Region/Area/Depo/District SDM -
# TIDAK mengubah scope data yg dimuat/disimpan (tetap semua entitas),
# cuma menyaring yg DITAMPILKAN biar user bisa fokus ke 1 entitas kalau
# mau, dan gampang balik ke "semua" lagi.
sdm_filter_component = '''
function SdmFilterSelect({ value, onChange, options, allLabel, t }) {
  const hasFilter = !!value;
  return (
    <div style={{ position: "relative", display: "inline-flex", flex: 1, minWidth: 0 }}>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        title={allLabel}
        style={{ appearance: "none", WebkitAppearance: "none", width: "100%", fontSize: hasFilter ? 12.5 : 12, fontWeight: 700, color: t.hi, background: t.inputBg, border: `1px solid ${t.inputBd}`, borderRadius: 8, padding: hasFilter ? "7px 50px 7px 10px" : "7px 28px 7px 10px", cursor: "pointer", fontFamily: "inherit" }}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={13} style={{ position: "absolute", right: hasFilter ? 28 : 9, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
      {hasFilter && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Hapus filter - tampilkan semua"
          style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 5, border: "none", background: "transparent", color: t.lo, cursor: "pointer" }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
'''
marker_filterselect = "// Selector generik (Depo / District) dipakai di header tiap langkah -"
do(
    marker_filterselect,
    sdm_filter_component.strip() + "\n\n" + marker_filterselect,
    1, "sisipkan komponen SdmFilterSelect",
)

# ── 4) State filter tampilan Region/Area/Depo utk section SDM (kosong =
# "Semua"/tidak difilter).
do(
    '  const [selectedMcRaw, setSelectedMc] = useState("");',
    '  const [selectedMcRaw, setSelectedMc] = useState("");\n  // Filter TAMPILAN (bukan scope data - data section SDM ttp selalu\n  // semua entitas) permintaan user: "ini harusnya tetap bisa dipilih,\n  // namun dia ada pilihan langsung clear filter untuk menampilkan\n  // semua". Kosong ("") = tidak difilter / tampilkan semua.\n  const [sdmFilterRegion, setSdmFilterRegion] = useState("");\n  const [sdmFilterArea, setSdmFilterArea] = useState("");\n  const [sdmFilterDepoId, setSdmFilterDepoId] = useState("");',
    1, "tambah state filter SDM",
)

# ── 5) Daftar entitas Region/Area/Depo/District ter-FILTER (dipakai
# ganti allRegions/allAreas/deposAll/allMcsInPartner KHUSUS di render
# section SDM) - kalau filter kosong, hasilnya = semua (sama spt
# sebelumnya).
old_entitylabel = '''  const sdmLevelEntityLabel = (lvl) => {
    if (lvl === "partner") return partnerName || "—";
    if (lvl === "region") return allRegions.length ? `Semua Region (${allRegions.length})` : "—";
    if (lvl === "area") return allAreas.length ? `Semua Area (${allAreas.length})` : "—";
    if (lvl === "mc") return allMcsInPartner.length ? `Semua District (${allMcsInPartner.length})` : "—";
    return allDepoIds.length ? `Semua Depo (${allDepoIds.length})` : "—"; // depo
  };'''
new_entitylabel = '''  const sdmRegionsFiltered = useMemo(() => (sdmFilterRegion ? allRegions.filter((r) => r === sdmFilterRegion) : allRegions), [allRegions, sdmFilterRegion]);
  const sdmAreasFiltered = useMemo(() => (sdmFilterArea ? allAreas.filter((a) => a === sdmFilterArea) : allAreas), [allAreas, sdmFilterArea]);
  const sdmDeposFiltered = useMemo(() => (sdmFilterDepoId ? deposAll.filter((dp) => dp.id === sdmFilterDepoId) : deposAll), [deposAll, sdmFilterDepoId]);
  const sdmMcsFiltered = useMemo(() => {
    if (!sdmFilterDepoId) return allMcsInPartner;
    const mcIds = new Set((depoMcRows || []).filter((r) => r.depo_id === sdmFilterDepoId).map((r) => r.mc));
    return allMcsInPartner.filter((mc) => mcIds.has(mc));
  }, [sdmFilterDepoId, allMcsInPartner, depoMcRows]);
  const sdmLevelEntityLabel = (lvl) => {
    if (lvl === "partner") return partnerName || "—";
    if (lvl === "region") return sdmRegionsFiltered.length ? (sdmFilterRegion || `Semua Region (${sdmRegionsFiltered.length})`) : "—";
    if (lvl === "area") return sdmAreasFiltered.length ? (sdmFilterArea || `Semua Area (${sdmAreasFiltered.length})`) : "—";
    if (lvl === "mc") return sdmMcsFiltered.length ? `${sdmFilterDepoId ? "District" : "Semua District"} (${sdmMcsFiltered.length})` : "—";
    if (sdmDeposFiltered.length === 0) return "—";
    return sdmFilterDepoId ? (deposAll.find((dp) => dp.id === sdmFilterDepoId)?.depo_name || "—") : `Semua Depo (${sdmDeposFiltered.length})`;
  };'''
do(old_entitylabel, new_entitylabel, 1, "sdmLevelEntityLabel -> pakai daftar terfilter")

# ── 6) renderSdmLevelSection: entities Region/Area/Depo/District pakai
# daftar terfilter di atas (default = semua, sama spt sebelumnya kalau
# filter kosong).
do(
    'table = <MultiEntityItemTable items={items} entities={allRegions.map((r) => ({ key: r, label: r }))} valuesByEntity={regionAllValues} onChange={setRegionAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Region." {...dndCommon} />;',
    'table = <MultiEntityItemTable items={items} entities={sdmRegionsFiltered.map((r) => ({ key: r, label: r }))} valuesByEntity={regionAllValues} onChange={setRegionAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Region." {...dndCommon} />;',
    1, "render region -> sdmRegionsFiltered",
)
do(
    'table = <MultiEntityItemTable items={items} entities={allAreas.map((a) => ({ key: a, label: a }))} valuesByEntity={areaAllValues} onChange={setAreaAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Area." {...dndCommon} />;',
    'table = <MultiEntityItemTable items={items} entities={sdmAreasFiltered.map((a) => ({ key: a, label: a }))} valuesByEntity={areaAllValues} onChange={setAreaAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Area." {...dndCommon} />;',
    1, "render area -> sdmAreasFiltered",
)
do(
    'table = <MultiEntityItemTable items={items} entities={allMcsInPartner.map((mc) => ({ key: mc, label: mc, sublabel: depoNameOfMc[mc] }))} valuesByEntity={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada District." {...dndCommon} />;',
    'table = <MultiEntityItemTable items={items} entities={sdmMcsFiltered.map((mc) => ({ key: mc, label: mc, sublabel: depoNameOfMc[mc] }))} valuesByEntity={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada District." {...dndCommon} />;',
    1, "render mc -> sdmMcsFiltered",
)
do(
    'table = <MultiEntityItemTable items={items} entities={deposAll.map((dp) => ({ key: dp.id, label: dp.depo_name }))} valuesByEntity={depoAllValues} onChange={setDepoAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Depo." {...dndCommon} />;',
    'table = <MultiEntityItemTable items={items} entities={sdmDeposFiltered.map((dp) => ({ key: dp.id, label: dp.depo_name }))} valuesByEntity={depoAllValues} onChange={setDepoAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Depo." {...dndCommon} />;',
    1, "render depo -> sdmDeposFiltered",
)

# ── 7) StepHeroDepo: tambah prop `areaControl` (mirror depoControl) -
# kolom Area tadinya cuma punya 1 mode select fungsional (areaOptions/
# onAreaChange, dipakai Langkah 1) tanpa opsi "Semua"/tombol clear.
# Langkah 2 (SDM) butuh versi dgn clear filter, jadi ditambahkan prop
# baru `areaControl` yg kalau diisi menggantikan select itu - Langkah 1
# tidak berubah krn tidak mengirim prop ini.
do(
    'function StepHeroDepo({ icon: Icon, eyebrow, title, depoName, depoControl, region, regionControl, area, areaOptions, onAreaChange, mcs, mcControl, totalLabel, totalValue, t }) {',
    'function StepHeroDepo({ icon: Icon, eyebrow, title, depoName, depoControl, region, regionControl, area, areaOptions, onAreaChange, areaControl, mcs, mcControl, totalLabel, totalValue, t }) {',
    1, "StepHeroDepo: tambah prop areaControl",
)
old_area_block = '''              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>Area</span>
              {areaOptions && areaOptions.length > 0 && onAreaChange ? ('''
new_area_block = '''              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>Area</span>
              {areaControl ? areaControl : areaOptions && areaOptions.length > 0 && onAreaChange ? ('''
do(old_area_block, new_area_block, 1, "Area: fallback ke areaControl")

# ── 8) Pasang SdmFilterSelect ke panggilan StepHeroDepo Langkah 2 (SDM)
# lewat regionControl/areaControl/depoControl, + mcs pakai daftar
# District terfilter (sdmMcsFiltered) biar chip-nya ikut nyempit kalau
# Depo difilter. Data yg dimuat/disimpan TIDAK berubah - ini cuma
# filter TAMPILAN section di bawahnya (lihat sdmRegionsFiltered dkk).
old_hero2_call = '''                icon={Users} eyebrow="Langkah 2 dari 4" title="SDM"
                depoName={!needsDepoGate ? `Semua Depo (${allDepoIds.length})` : undefined}
                region={allRegions.length ? `Semua Region (${allRegions.length})` : "—"}
                area={allAreas.length ? `Semua Area (${allAreas.length})` : "—"}
                mcs={allMcsInPartner}
                totalLabel="Total SDM"
                totalValue={!needsDepoGate ? sdmSummary.totalSdm : undefined}
                t={t}
              />'''
new_hero2_call = '''                icon={Users} eyebrow="Langkah 2 dari 4" title="SDM"
                depoName={!needsDepoGate ? `Semua Depo (${allDepoIds.length})` : undefined}
                regionControl={!needsDepoGate ? (
                  <SdmFilterSelect value={sdmFilterRegion} onChange={setSdmFilterRegion} options={allRegions.map((r) => ({ value: r, label: r }))} allLabel={`Semua Region (${allRegions.length})`} t={t} />
                ) : undefined}
                areaControl={!needsDepoGate ? (
                  <SdmFilterSelect value={sdmFilterArea} onChange={setSdmFilterArea} options={allAreas.map((a) => ({ value: a, label: a }))} allLabel={`Semua Area (${allAreas.length})`} t={t} />
                ) : undefined}
                depoControl={!needsDepoGate ? (
                  <SdmFilterSelect value={sdmFilterDepoId} onChange={setSdmFilterDepoId} options={deposAll.map((dp) => ({ value: dp.id, label: dp.depo_name }))} allLabel={`Semua Depo (${allDepoIds.length})`} t={t} />
                ) : undefined}
                mcs={sdmMcsFiltered}
                totalLabel="Total SDM"
                totalValue={!needsDepoGate ? sdmSummary.totalSdm : undefined}
                t={t}
              />'''
do(old_hero2_call, new_hero2_call, 1, "StepHeroDepo step2 -> pasang SdmFilterSelect + filter District")

# ── 9) Catatan info di bawah header step2 - sesuaikan teks krn sekarang
# selectornya BISA dipakai utk nyaring tampilan (bukan lagi cuma teks
# statis "Semua ...").
do(
    'SDM diisi sekaligus utk semua Region, Area, Depo & District milik partner ini - tidak terpengaruh filter Area di atas.',
    'SDM diisi sekaligus utk semua Region, Area, Depo & District milik partner ini. Selector Region/Area/Depo di atas HANYA menyaring tampilan di bawah - klik "Semua ..." atau ikon X utk kembali melihat semuanya.',
    1, "update teks info step2",
)

open(p, "w").write(S["s"])
print("B1_OK")
