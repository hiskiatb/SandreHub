p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

old_loading = '''  const loading = !masterLoaded || !levelConfigLoaded
    || (isDepoStep && depoCtxKey && depoLoadedKey !== depoCtxKey)
    || (isMcStep && mcCtxKey && mcLoadedKey !== mcCtxKey)
    || (isSdmStep && mcAllCtxKey && mcAllLoadedKey !== mcAllCtxKey)
    || (isSdmStep && areaCtxKey && areaLoadedKey !== areaCtxKey)
    || (isSdmStep && regionCtxKey && regionLoadedKey !== regionCtxKey)
    || (isSdmStep && partnerCtxKey && partnerLoadedKey !== partnerCtxKey);'''
new_loading = '''  const loading = !masterLoaded || !levelConfigLoaded
    || (isDepoStep && depoAllCtxKey && depoAllLoadedKey !== depoAllCtxKey)
    || (isMcStep && mcCtxKey && mcLoadedKey !== mcCtxKey)
    || (isSdmStep && mcAllCtxKey && mcAllLoadedKey !== mcAllCtxKey)
    || (isSdmStep && areaAllCtxKey && areaAllLoadedKey !== areaAllCtxKey)
    || (isSdmStep && regionAllCtxKey && regionAllLoadedKey !== regionAllCtxKey)
    || (isSdmStep && partnerCtxKey && partnerLoadedKey !== partnerCtxKey);'''
do(old_loading, new_loading, 1, "loading computation")

old_setters = '''  const setDepoItemValue = useCallback((id, field, v) => {
    setDepoValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setDepoDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setMcItemValue = useCallback((id, field, v) => {
    setMcValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setMcDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setMcAllItemValue = useCallback((mc, id, field, v) => {
    setMcAllValues((prev) => ({ ...prev, [mc]: { ...(prev[mc] || {}), [id]: { ...((prev[mc] || {})[id] || {}), [field]: v } } }));
    setMcAllDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setAreaItemValue = useCallback((id, field, v) => {
    setAreaValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setAreaDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setRegionItemValue = useCallback((id, field, v) => {
    setRegionValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setRegionDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setPartnerItemValue = useCallback((id, field, v) => {
    setPartnerValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setPartnerDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  // Router generik item SDM - otomatis arahkan ke state yg benar sesuai
  // level item itu (dari itemLevelMap), supaya 1 ItemTable SDM bisa
  // nampung item dari 5 level berbeda tanpa komponen terpisah per level.
  const setSdmItemValue = useCallback((id, field, v) => {
    const lvl = levelOfItem(id);
    if (lvl === "mc") setMcItemValue(id, field, v);
    else if (lvl === "area") setAreaItemValue(id, field, v);
    else if (lvl === "region") setRegionItemValue(id, field, v);
    else if (lvl === "partner") setPartnerItemValue(id, field, v);
    else setDepoItemValue(id, field, v);
  }, [levelOfItem, setMcItemValue, setAreaItemValue, setRegionItemValue, setPartnerItemValue, setDepoItemValue]);'''
new_setters = '''  const setDepoItemValue = useCallback((id, field, v) => {
    if (!selectedDepoId) return;
    setDepoAllValues((prev) => ({ ...prev, [selectedDepoId]: { ...(prev[selectedDepoId] || {}), [id]: { ...((prev[selectedDepoId] || {})[id] || {}), [field]: v } } }));
    setDepoAllDirty(true); setIsFormDirty?.(true);
  }, [selectedDepoId, setIsFormDirty]);
  const setMcItemValue = useCallback((id, field, v) => {
    setMcValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setMcDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setMcAllItemValue = useCallback((mc, id, field, v) => {
    setMcAllValues((prev) => ({ ...prev, [mc]: { ...(prev[mc] || {}), [id]: { ...((prev[mc] || {})[id] || {}), [field]: v } } }));
    setMcAllDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  // BARU (permintaan user - "sama seperti level mc sekarang ... untuk
  // level area/region/depo, harus masukkan semua entitas yg ada di
  // partner tersebut"): setter generik per-entitas utk Depo/Area/Region
  // - dipakai MultiEntityItemTable, 1 fungsi yg sama polanya dgn
  // setMcAllItemValue di atas.
  const setDepoAllItemValue = useCallback((depoId, id, field, v) => {
    setDepoAllValues((prev) => ({ ...prev, [depoId]: { ...(prev[depoId] || {}), [id]: { ...((prev[depoId] || {})[id] || {}), [field]: v } } }));
    setDepoAllDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setAreaAllItemValue = useCallback((branch, id, field, v) => {
    setAreaAllValues((prev) => ({ ...prev, [branch]: { ...(prev[branch] || {}), [id]: { ...((prev[branch] || {})[id] || {}), [field]: v } } }));
    setAreaAllDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setRegionAllItemValue = useCallback((region, id, field, v) => {
    setRegionAllValues((prev) => ({ ...prev, [region]: { ...(prev[region] || {}), [id]: { ...((prev[region] || {})[id] || {}), [field]: v } } }));
    setRegionAllDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setPartnerItemValue = useCallback((id, field, v) => {
    setPartnerValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setPartnerDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);'''
do(old_setters, new_setters, 1, "setters -> multi-entity")

old_sdmmerged = '''  const sdmValuesMerged = useMemo(() => {
    const out = {};
    itemsOf("SDM").forEach((it) => {
      const lvl = levelOfItem(it.id);
      if (lvl === "mc") {
        let sum = 0;
        Object.values(mcAllValues).forEach((v) => { sum += numOrZero(v?.[it.id]?.total); });
        if (sum) out[it.id] = { total: sum };
        return;
      }
      const src = lvl === "area" ? areaValues : lvl === "region" ? regionValues : lvl === "partner" ? partnerValues : depoValues;
      if (src[it.id]) out[it.id] = src[it.id];
    });
    return out;
  }, [levelOfItem, mcAllValues, areaValues, regionValues, partnerValues, depoValues]);'''
new_sdmmerged = '''  // BARU: level MC/Area/Region/Depo skrg multi-entitas (semua entitas di
  // bawah Partner) - total per item dijumlahkan dari SEMUA entitas pada
  // level itu (bukan cuma 1 entitas aktif spt dulu).
  const sdmValuesMerged = useMemo(() => {
    const sumAcross = (map, id) => {
      let sum = 0;
      Object.values(map).forEach((v) => { sum += numOrZero(v?.[id]?.total); });
      return sum;
    };
    const out = {};
    itemsOf("SDM").forEach((it) => {
      const lvl = levelOfItem(it.id);
      if (lvl === "partner") {
        if (partnerValues[it.id]) out[it.id] = partnerValues[it.id];
        return;
      }
      const map = lvl === "mc" ? mcAllValues : lvl === "area" ? areaAllValues : lvl === "region" ? regionAllValues : depoAllValues;
      const sum = sumAcross(map, it.id);
      if (sum) out[it.id] = { total: sum };
    });
    return out;
  }, [levelOfItem, mcAllValues, areaAllValues, regionAllValues, depoAllValues, partnerValues]);'''
do(old_sdmmerged, new_sdmmerged, 1, "sdmValuesMerged -> sum across entities")

open(p, "w").write(S["s"])
print("PATCH2C_OK")
