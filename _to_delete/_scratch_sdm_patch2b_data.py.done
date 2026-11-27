p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 2) Area & Region: dari satu entitas aktif jadi MULTI-ENTITAS (semua
#    Area / Region milik Partner ini, diturunkan dari mcList).
old_area_region_state = '''  // ── Nilai SDM level Area/Region/Partner (1 baris per entitas per
  // periode - BUKAN per Depo, supaya tidak diisi ulang tiap pindah Depo
  // yg masih 1 Area/Region/Partner yg sama) ───────────────────────────
  const [areaValues, setAreaValues] = useState({});
  const [areaDirty, setAreaDirty] = useState(false);
  const [areaLoadedKey, setAreaLoadedKey] = useState(null);
  const areaCtxKey = (periodReady && contextBranch) ? `${contextBranch}|${monthInt}|${yearInt}` : null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!areaCtxKey) { setAreaValues({}); setAreaLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_area_v2").select("pengeluaran_data")
        .eq("partner_name", partnerName).eq("branch", contextBranch).eq("month", monthInt).eq("year", yearInt).maybeSingle();
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load area:", error.message);
      setAreaValues(data?.pengeluaran_data || {});
      setAreaDirty(false);
      setAreaLoadedKey(areaCtxKey);
    })();
    return () => { cancelled = true; };
  }, [areaCtxKey, partnerName, contextBranch, monthInt, yearInt]);

  const [regionValues, setRegionValues] = useState({});
  const [regionDirty, setRegionDirty] = useState(false);
  const [regionLoadedKey, setRegionLoadedKey] = useState(null);
  const regionCtxKey = (periodReady && currentRegion) ? `${currentRegion}|${monthInt}|${yearInt}` : null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!regionCtxKey) { setRegionValues({}); setRegionLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_region_v2").select("pengeluaran_data")
        .eq("partner_name", partnerName).eq("region", currentRegion).eq("month", monthInt).eq("year", yearInt).maybeSingle();
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load region:", error.message);
      setRegionValues(data?.pengeluaran_data || {});
      setRegionDirty(false);
      setRegionLoadedKey(regionCtxKey);
    })();
    return () => { cancelled = true; };
  }, [regionCtxKey, partnerName, currentRegion, monthInt, yearInt]);'''
new_area_region_state = '''  // ── Nilai SDM level Area/Region (SEMUA Area/Region milik Partner ini
  // sekaligus, bukan cuma yg lagi aktif - permintaan user: "jika dia di
  // level area, harus masukkan area-area yang ada di partner tersebut")
  const allAreas = useMemo(() => {
    const seen = new Set(); const list = [];
    mcList.forEach((m) => { if (m.branch && !seen.has(m.branch)) { seen.add(m.branch); list.push(m.branch); } });
    return list.sort((a, b) => a.localeCompare(b));
  }, [mcList]);
  const allRegions = useMemo(() => {
    const seen = new Set(); const list = [];
    mcList.forEach((m) => { if (m.region && !seen.has(m.region)) { seen.add(m.region); list.push(m.region); } });
    return list.sort((a, b) => a.localeCompare(b));
  }, [mcList]);

  const [areaAllValues, setAreaAllValues] = useState({});
  const [areaAllDirty, setAreaAllDirty] = useState(false);
  const [areaAllLoadedKey, setAreaAllLoadedKey] = useState(null);
  const areaAllCtxKey = (periodReady && allAreas.length > 0) ? `${allAreas.join(",")}|${monthInt}|${yearInt}` : null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!areaAllCtxKey) { setAreaAllValues({}); setAreaAllLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_area_v2").select("branch, pengeluaran_data")
        .eq("partner_name", partnerName).in("branch", allAreas).eq("month", monthInt).eq("year", yearInt);
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load area (semua):", error.message);
      const map = {};
      allAreas.forEach((b) => { map[b] = {}; });
      (data || []).forEach((r) => { map[r.branch] = r.pengeluaran_data || {}; });
      setAreaAllValues(map);
      setAreaAllDirty(false);
      setAreaAllLoadedKey(areaAllCtxKey);
    })();
    return () => { cancelled = true; };
  }, [areaAllCtxKey, partnerName, allAreas, monthInt, yearInt]);

  const [regionAllValues, setRegionAllValues] = useState({});
  const [regionAllDirty, setRegionAllDirty] = useState(false);
  const [regionAllLoadedKey, setRegionAllLoadedKey] = useState(null);
  const regionAllCtxKey = (periodReady && allRegions.length > 0) ? `${allRegions.join(",")}|${monthInt}|${yearInt}` : null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!regionAllCtxKey) { setRegionAllValues({}); setRegionAllLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_region_v2").select("region, pengeluaran_data")
        .eq("partner_name", partnerName).in("region", allRegions).eq("month", monthInt).eq("year", yearInt);
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load region (semua):", error.message);
      const map = {};
      allRegions.forEach((r) => { map[r] = {}; });
      (data || []).forEach((r) => { map[r.region] = r.pengeluaran_data || {}; });
      setRegionAllValues(map);
      setRegionAllDirty(false);
      setRegionAllLoadedKey(regionAllCtxKey);
    })();
    return () => { cancelled = true; };
  }, [regionAllCtxKey, partnerName, allRegions, monthInt, yearInt]);'''
do(old_area_region_state, new_area_region_state, 1, "areaValues/regionValues -> multi")

open(p, "w").write(S["s"])
print("PATCH2B_OK")
