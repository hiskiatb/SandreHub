path = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# 1) State konfigurasi level SDM (per-item, bisa di-override per partner -
# lihat tabel pnl_sdm_level_config) - dimuat sekali per partner, independen
# dari periode.
do(
    '  const [step, setStep] = useState(1);\n'
    '  const [saving, setSaving] = useState(false);\n'
    '\n'
    '  // ── Master data Partner ini: daftar District (mc) + Depo + mapping ──\n',

    '  const [step, setStep] = useState(1);\n'
    '  const [saving, setSaving] = useState(false);\n'
    '\n'
    '  // BARU (permintaan user - "tiap jabatan SDM levelnya beda: BM per\n'
    '  // Area, TSS/SPV per MC, GM per Region, Finance Manager & HRD per\n'
    '  // Partner, dst - defaultnya begitu tapi bisa dipindah per Partner\n'
    '  // kalau kondisinya beda"): map item_id -> level, gabungan default\n'
    '  // global (partner_name NULL) + override khusus partner ini kalau ada\n'
    '  // (lihat tabel pnl_sdm_level_config). Dimuat sekali per partner,\n'
    '  // independen dari periode/bulan yg dipilih.\n'
    '  const [itemLevelMap, setItemLevelMap] = useState({});\n'
    '  const [levelConfigLoaded, setLevelConfigLoaded] = useState(false);\n'
    '  useEffect(() => {\n'
    '    if (!partnerName) return;\n'
    '    let cancelled = false;\n'
    '    (async () => {\n'
    '      await Promise.resolve();\n'
    '      setLevelConfigLoaded(false);\n'
    '      const [{ data: globalRows, error: eG }, { data: ovRows, error: eO }] = await Promise.all([\n'
    '        supabase.from("pnl_sdm_level_config").select("item_id, level").is("partner_name", null),\n'
    '        supabase.from("pnl_sdm_level_config").select("item_id, level").eq("partner_name", partnerName),\n'
    '      ]);\n'
    '      if (cancelled) return;\n'
    '      if (eG) console.error("[PNL_FormPengeluaranV2] gagal load pnl_sdm_level_config (global):", eG.message);\n'
    '      if (eO) console.error("[PNL_FormPengeluaranV2] gagal load pnl_sdm_level_config (override):", eO.message);\n'
    '      const map = {};\n'
    '      (globalRows || []).forEach((r) => { map[r.item_id] = r.level; });\n'
    '      (ovRows || []).forEach((r) => { map[r.item_id] = r.level; }); // override partner menang\n'
    '      setItemLevelMap(map);\n'
    '      setLevelConfigLoaded(true);\n'
    '    })();\n'
    '    return () => { cancelled = true; };\n'
    '  }, [partnerName]);\n'
    '  const levelOfItem = useCallback((id) => itemLevelMap[id] || "depo", [itemLevelMap]);\n'
    '\n'
    '  // ── Master data Partner ini: daftar District (mc) + Depo + mapping ──\n',
    label="state+effect itemLevelMap",
)

# 2) Turunan Region dari Area (contextBranch) yg lagi aktif - 1 Area pasti
# ikut 1 Region, jadi tinggal cari dari mcList yg sudah ada (branch==Area).
do(
    '  const depos = useMemo(\n'
    '    () => deposAll.filter((dp) => {\n'
    '      const area = depoAreaOf[dp.id];\n'
    '      return !area || area === contextBranch;\n'
    '    }),\n'
    '    [deposAll, depoAreaOf, contextBranch],\n'
    '  );\n',

    '  const depos = useMemo(\n'
    '    () => deposAll.filter((dp) => {\n'
    '      const area = depoAreaOf[dp.id];\n'
    '      return !area || area === contextBranch;\n'
    '    }),\n'
    '    [deposAll, depoAreaOf, contextBranch],\n'
    '  );\n'
    '\n'
    '  // BARU: Region diturunkan otomatis dari Area yg lagi aktif (1 Area\n'
    '  // pasti ikut 1 Region) - dipakai utk item SDM level Region (GM).\n'
    '  const currentRegion = useMemo(() => mcList.find((m) => m.branch === contextBranch)?.region || "", [mcList, contextBranch]);\n',
    label="currentRegion",
)

# 3) State+load effect SDM level Area/Region/Partner (pola identik mcValues
# yg sudah ada - 1 baris per entitas per periode, BUKAN per Depo, supaya
# tidak diisi ulang tiap pindah Depo yg masih 1 Area/Region/Partner sama).
do(
    '  }, [mcCtxKey, selectedMc, monthInt, yearInt]);\n'
    '\n'
    '  const isDepoStep = step === 1 || step === 2;\n'
    '  const isMcStep = step === 3;\n'
    '  const loading = !masterLoaded || (isDepoStep && depoCtxKey && depoLoadedKey !== depoCtxKey) || (isMcStep && mcCtxKey && mcLoadedKey !== mcCtxKey);\n',

    '  }, [mcCtxKey, selectedMc, monthInt, yearInt]);\n'
    '\n'
    '  // ── Nilai SDM level Area/Region/Partner (1 baris per entitas per\n'
    '  // periode - BUKAN per Depo, supaya tidak diisi ulang tiap pindah Depo\n'
    '  // yg masih 1 Area/Region/Partner yg sama) ───────────────────────────\n'
    '  const [areaValues, setAreaValues] = useState({});\n'
    '  const [areaDirty, setAreaDirty] = useState(false);\n'
    '  const [areaLoadedKey, setAreaLoadedKey] = useState(null);\n'
    '  const areaCtxKey = (periodReady && contextBranch) ? `${contextBranch}|${monthInt}|${yearInt}` : null;\n'
    '  useEffect(() => {\n'
    '    let cancelled = false;\n'
    '    (async () => {\n'
    '      if (!areaCtxKey) { setAreaValues({}); setAreaLoadedKey(null); return; }\n'
    '      const { data, error } = await supabase.from("pnl_pengeluaran_area_v2").select("pengeluaran_data")\n'
    '        .eq("partner_name", partnerName).eq("branch", contextBranch).eq("month", monthInt).eq("year", yearInt).maybeSingle();\n'
    '      if (cancelled) return;\n'
    '      if (error) console.error("[PNL_FormPengeluaranV2] gagal load area:", error.message);\n'
    '      setAreaValues(data?.pengeluaran_data || {});\n'
    '      setAreaDirty(false);\n'
    '      setAreaLoadedKey(areaCtxKey);\n'
    '    })();\n'
    '    return () => { cancelled = true; };\n'
    '  }, [areaCtxKey, partnerName, contextBranch, monthInt, yearInt]);\n'
    '\n'
    '  const [regionValues, setRegionValues] = useState({});\n'
    '  const [regionDirty, setRegionDirty] = useState(false);\n'
    '  const [regionLoadedKey, setRegionLoadedKey] = useState(null);\n'
    '  const regionCtxKey = (periodReady && currentRegion) ? `${currentRegion}|${monthInt}|${yearInt}` : null;\n'
    '  useEffect(() => {\n'
    '    let cancelled = false;\n'
    '    (async () => {\n'
    '      if (!regionCtxKey) { setRegionValues({}); setRegionLoadedKey(null); return; }\n'
    '      const { data, error } = await supabase.from("pnl_pengeluaran_region_v2").select("pengeluaran_data")\n'
    '        .eq("partner_name", partnerName).eq("region", currentRegion).eq("month", monthInt).eq("year", yearInt).maybeSingle();\n'
    '      if (cancelled) return;\n'
    '      if (error) console.error("[PNL_FormPengeluaranV2] gagal load region:", error.message);\n'
    '      setRegionValues(data?.pengeluaran_data || {});\n'
    '      setRegionDirty(false);\n'
    '      setRegionLoadedKey(regionCtxKey);\n'
    '    })();\n'
    '    return () => { cancelled = true; };\n'
    '  }, [regionCtxKey, partnerName, currentRegion, monthInt, yearInt]);\n'
    '\n'
    '  const [partnerValues, setPartnerValues] = useState({});\n'
    '  const [partnerDirty, setPartnerDirty] = useState(false);\n'
    '  const [partnerLoadedKey, setPartnerLoadedKey] = useState(null);\n'
    '  const partnerCtxKey = periodReady ? `${partnerName}|${monthInt}|${yearInt}` : null;\n'
    '  useEffect(() => {\n'
    '    let cancelled = false;\n'
    '    (async () => {\n'
    '      if (!partnerCtxKey) { setPartnerValues({}); setPartnerLoadedKey(null); return; }\n'
    '      const { data, error } = await supabase.from("pnl_pengeluaran_partner_v2").select("pengeluaran_data")\n'
    '        .eq("partner_name", partnerName).eq("month", monthInt).eq("year", yearInt).maybeSingle();\n'
    '      if (cancelled) return;\n'
    '      if (error) console.error("[PNL_FormPengeluaranV2] gagal load partner:", error.message);\n'
    '      setPartnerValues(data?.pengeluaran_data || {});\n'
    '      setPartnerDirty(false);\n'
    '      setPartnerLoadedKey(partnerCtxKey);\n'
    '    })();\n'
    '    return () => { cancelled = true; };\n'
    '  }, [partnerCtxKey, partnerName, monthInt, yearInt]);\n'
    '\n'
    '  const isDepoStep = step === 1 || step === 2;\n'
    '  const isMcStep = step === 3;\n'
    '  const isSdmStep = step === 2;\n'
    '  const loading = !masterLoaded || !levelConfigLoaded\n'
    '    || (isDepoStep && depoCtxKey && depoLoadedKey !== depoCtxKey)\n'
    '    || (isMcStep && mcCtxKey && mcLoadedKey !== mcCtxKey)\n'
    '    || (isSdmStep && mcCtxKey && mcLoadedKey !== mcCtxKey)\n'
    '    || (isSdmStep && areaCtxKey && areaLoadedKey !== areaCtxKey)\n'
    '    || (isSdmStep && regionCtxKey && regionLoadedKey !== regionCtxKey)\n'
    '    || (isSdmStep && partnerCtxKey && partnerLoadedKey !== partnerCtxKey);\n',
    label="state+effect area/region/partner + loading",
)

# 4) Setter per-level (area/region/partner) + router generik setSdmItemValue
# yg otomatis arahkan ke state yg benar berdasarkan level item tsb.
do(
    '  const setMcItemValue = useCallback((id, field, v) => {\n'
    '    setMcValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));\n'
    '    setMcDirty(true); setIsFormDirty?.(true);\n'
    '  }, [setIsFormDirty]);\n',

    '  const setMcItemValue = useCallback((id, field, v) => {\n'
    '    setMcValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));\n'
    '    setMcDirty(true); setIsFormDirty?.(true);\n'
    '  }, [setIsFormDirty]);\n'
    '  const setAreaItemValue = useCallback((id, field, v) => {\n'
    '    setAreaValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));\n'
    '    setAreaDirty(true); setIsFormDirty?.(true);\n'
    '  }, [setIsFormDirty]);\n'
    '  const setRegionItemValue = useCallback((id, field, v) => {\n'
    '    setRegionValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));\n'
    '    setRegionDirty(true); setIsFormDirty?.(true);\n'
    '  }, [setIsFormDirty]);\n'
    '  const setPartnerItemValue = useCallback((id, field, v) => {\n'
    '    setPartnerValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));\n'
    '    setPartnerDirty(true); setIsFormDirty?.(true);\n'
    '  }, [setIsFormDirty]);\n'
    '  // Router generik item SDM - otomatis arahkan ke state yg benar sesuai\n'
    '  // level item itu (dari itemLevelMap), supaya 1 ItemTable SDM bisa\n'
    '  // nampung item dari 5 level berbeda tanpa komponen terpisah per level.\n'
    '  const setSdmItemValue = useCallback((id, field, v) => {\n'
    '    const lvl = levelOfItem(id);\n'
    '    if (lvl === "mc") setMcItemValue(id, field, v);\n'
    '    else if (lvl === "area") setAreaItemValue(id, field, v);\n'
    '    else if (lvl === "region") setRegionItemValue(id, field, v);\n'
    '    else if (lvl === "partner") setPartnerItemValue(id, field, v);\n'
    '    else setDepoItemValue(id, field, v);\n'
    '  }, [levelOfItem, setMcItemValue, setAreaItemValue, setRegionItemValue, setPartnerItemValue, setDepoItemValue]);\n',
    label="setter area/region/partner + router setSdmItemValue",
)

# 5) Nilai SDM gabungan (ambil dari sumber yg benar sesuai level tiap item)
# + summary SDM yg benar (total gabungan 5 level, bukan cuma dari Depo).
do(
    '  const depoSummary = useMemo(() => summarizePengeluaran(depoValues), [depoValues]);\n'
    '  const mcSummary = useMemo(() => summarizePengeluaran(mcValues), [mcValues]);\n',

    '  const depoSummary = useMemo(() => summarizePengeluaran(depoValues), [depoValues]);\n'
    '  const mcSummary = useMemo(() => summarizePengeluaran(mcValues), [mcValues]);\n'
    '  // Nilai SDM gabungan dari 5 kemungkinan sumber (Depo/MC/Area/Region/\n'
    '  // Partner) sesuai level tiap item - dipakai utk render tabel SDM &\n'
    '  // hitung Total SDM yg benar (bukan cuma dari satu sumber).\n'
    '  const sdmValuesMerged = useMemo(() => {\n'
    '    const out = {};\n'
    '    itemsOf("SDM").forEach((it) => {\n'
    '      const lvl = levelOfItem(it.id);\n'
    '      const src = lvl === "mc" ? mcValues : lvl === "area" ? areaValues : lvl === "region" ? regionValues : lvl === "partner" ? partnerValues : depoValues;\n'
    '      if (src[it.id]) out[it.id] = src[it.id];\n'
    '    });\n'
    '    return out;\n'
    '  }, [levelOfItem, mcValues, areaValues, regionValues, partnerValues, depoValues]);\n'
    '  const sdmSummary = useMemo(() => summarizePengeluaran(sdmValuesMerged), [sdmValuesMerged]);\n'
    '  const sdmRowReadOnly = useCallback((lvl) => {\n'
    '    if (!editable) return true;\n'
    '    if (lvl === "depo") return !selectedDepoId || depoNeedsMc;\n'
    '    if (lvl === "mc") return !selectedMc;\n'
    '    if (lvl === "area") return !contextBranch;\n'
    '    if (lvl === "region") return !currentRegion;\n'
    '    return false; // partner - selalu tersedia begitu partnerName diketahui\n'
    '  }, [editable, selectedDepoId, depoNeedsMc, selectedMc, contextBranch, currentRegion]);\n'
    '  const SDM_LEVEL_ORDER = ["partner", "region", "area", "mc", "depo"];\n'
    '  const SDM_LEVEL_LABEL = { partner: "Level Partner", region: "Level Region", area: "Level Area", mc: "Level District (MC)", depo: "Level Depo" };\n'
    '  const sdmGroupedSections = useCallback((group) => {\n'
    '    const items = itemsOf("SDM", group);\n'
    '    return SDM_LEVEL_ORDER.map((lvl) => ({ lvl, items: items.filter((it) => levelOfItem(it.id) === lvl) })).filter((g) => g.items.length > 0);\n'
    '  }, [levelOfItem]);\n'
    '  const sdmLevelEntityLabel = (lvl) => {\n'
    '    if (lvl === "partner") return partnerName || "—";\n'
    '    if (lvl === "region") return currentRegion || "—";\n'
    '    if (lvl === "area") return contextBranch || "—";\n'
    '    if (lvl === "mc") return selectedMc || "—";\n'
    '    return depos.find((dp) => dp.id === selectedDepoId)?.depo_name || "—"; // depo\n'
    '  };\n',
    label="sdmValuesMerged + sdmSummary + grouping helpers",
)

# 6) Fungsi simpan Area/Region/Partner (pola identik saveMc) - ditaruh
# tepat setelah saveMc.
do(
    '  const saveMc = async () => {\n'
    '    if (!mcCtxKey) return;\n'
    '    setSaving(true);\n'
    '    try {\n'
    '      const payload = {\n'
    '        partner_name: partnerName,\n'
    '        mc: selectedMc,\n'
    '        month: monthInt,\n'
    '        year: yearInt,\n'
    '        user_id: profile?.id || null,\n'
    '        pengeluaran_data: cleanValues(mcValues, ["MARKETING COST"]),\n'
    '        updated_at: new Date().toISOString(),\n'
    '      };\n'
    '      const { error } = await supabase.from("pnl_pengeluaran_mc_v2").upsert(payload, { onConflict: "mc,month,year" });\n'
    '      if (error) throw error;\n'
    '      setMcDirty(false); setIsFormDirty?.(false);\n'
    '    } catch (e) {\n'
    '      alert(e.message || "Gagal menyimpan Marketing/Cost of Money (District).");\n'
    '    } finally {\n'
    '      setSaving(false);\n'
    '    }\n'
    '  };\n'
    '\n'
    '  const handleSave = () => (isDepoStep ? saveDepo() : isMcStep ? saveMc() : Promise.all([saveDepo(), saveMc()]));\n'
    '  const anyDirty = depoDirty || mcDirty;\n',

    '  const saveMc = async () => {\n'
    '    if (!mcCtxKey) return;\n'
    '    setSaving(true);\n'
    '    try {\n'
    '      const payload = {\n'
    '        partner_name: partnerName,\n'
    '        mc: selectedMc,\n'
    '        month: monthInt,\n'
    '        year: yearInt,\n'
    '        user_id: profile?.id || null,\n'
    '        pengeluaran_data: { ...cleanValues(mcValues, ["MARKETING COST"]), ...cleanValues(mcValues, ["SDM"]) },\n'
    '        updated_at: new Date().toISOString(),\n'
    '      };\n'
    '      const { error } = await supabase.from("pnl_pengeluaran_mc_v2").upsert(payload, { onConflict: "mc,month,year" });\n'
    '      if (error) throw error;\n'
    '      setMcDirty(false); setIsFormDirty?.(false);\n'
    '    } catch (e) {\n'
    '      alert(e.message || "Gagal menyimpan Marketing/Cost of Money (District).");\n'
    '    } finally {\n'
    '      setSaving(false);\n'
    '    }\n'
    '  };\n'
    '\n'
    '  // BARU: simpan SDM level Area/Region/Partner - tiap entitas 1 baris\n'
    '  // per periode (bukan per Depo), supaya berlaku utk semua Depo di\n'
    '  // bawahnya tanpa perlu diisi ulang.\n'
    '  const saveArea = async () => {\n'
    '    if (!areaCtxKey) return;\n'
    '    setSaving(true);\n'
    '    try {\n'
    '      const payload = {\n'
    '        partner_name: partnerName,\n'
    '        branch: contextBranch,\n'
    '        month: monthInt,\n'
    '        year: yearInt,\n'
    '        user_id: profile?.id || null,\n'
    '        pengeluaran_data: cleanValues(areaValues, ["SDM"]),\n'
    '        updated_at: new Date().toISOString(),\n'
    '      };\n'
    '      const { error } = await supabase.from("pnl_pengeluaran_area_v2").upsert(payload, { onConflict: "partner_name,branch,month,year" });\n'
    '      if (error) throw error;\n'
    '      setAreaDirty(false); setIsFormDirty?.(false);\n'
    '    } catch (e) {\n'
    '      alert(e.message || "Gagal menyimpan SDM (Area).");\n'
    '    } finally {\n'
    '      setSaving(false);\n'
    '    }\n'
    '  };\n'
    '  const saveRegion = async () => {\n'
    '    if (!regionCtxKey) return;\n'
    '    setSaving(true);\n'
    '    try {\n'
    '      const payload = {\n'
    '        partner_name: partnerName,\n'
    '        region: currentRegion,\n'
    '        month: monthInt,\n'
    '        year: yearInt,\n'
    '        user_id: profile?.id || null,\n'
    '        pengeluaran_data: cleanValues(regionValues, ["SDM"]),\n'
    '        updated_at: new Date().toISOString(),\n'
    '      };\n'
    '      const { error } = await supabase.from("pnl_pengeluaran_region_v2").upsert(payload, { onConflict: "partner_name,region,month,year" });\n'
    '      if (error) throw error;\n'
    '      setRegionDirty(false); setIsFormDirty?.(false);\n'
    '    } catch (e) {\n'
    '      alert(e.message || "Gagal menyimpan SDM (Region).");\n'
    '    } finally {\n'
    '      setSaving(false);\n'
    '    }\n'
    '  };\n'
    '  const savePartner = async () => {\n'
    '    if (!partnerCtxKey) return;\n'
    '    setSaving(true);\n'
    '    try {\n'
    '      const payload = {\n'
    '        partner_name: partnerName,\n'
    '        month: monthInt,\n'
    '        year: yearInt,\n'
    '        user_id: profile?.id || null,\n'
    '        pengeluaran_data: cleanValues(partnerValues, ["SDM"]),\n'
    '        updated_at: new Date().toISOString(),\n'
    '      };\n'
    '      const { error } = await supabase.from("pnl_pengeluaran_partner_v2").upsert(payload, { onConflict: "partner_name,month,year" });\n'
    '      if (error) throw error;\n'
    '      setPartnerDirty(false); setIsFormDirty?.(false);\n'
    '    } catch (e) {\n'
    '      alert(e.message || "Gagal menyimpan SDM (Partner).");\n'
    '    } finally {\n'
    '      setSaving(false);\n'
    '    }\n'
    '  };\n'
    '\n'
    '  const handleSave = () => {\n'
    '    if (isSdmStep) return Promise.all([saveDepo(), saveMc(), saveArea(), saveRegion(), savePartner()]);\n'
    '    if (isDepoStep) return saveDepo();\n'
    '    if (isMcStep) return saveMc();\n'
    '    return Promise.all([saveDepo(), saveMc(), saveArea(), saveRegion(), savePartner()]);\n'
    '  };\n'
    '  const anyDirty = depoDirty || mcDirty || areaDirty || regionDirty || partnerDirty;\n',
    label="saveArea/saveRegion/savePartner + handleSave + anyDirty",
)

# 7) Header: selector District (MC) yg sebelumnya cuma muncul di step MKT
# (step 3), sekarang MUNCUL JUGA di step SDM (step 2) - dipakai utk tahu
# item level MC sedang diisi utk MC yg mana. Plus baris info kecil
# Partner/Region/Area yg lagi aktif (jawaban "biar tetap mudah dipakai" -
# user langsung tahu konteks level atas tanpa harus pindah layar).
do(
    '        {isMcStep && depoOptions.length > 0 && (\n'
    '          <div style={{ display: "flex", alignItems: "center", background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 14px", flexWrap: "wrap", gap: 12 }}>\n'
    '            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>\n'
    '              <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact />\n'
    '              {editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" style={{ padding: "6px 10px", whiteSpace: "nowrap" }}><Settings2 size={12} /> Kelola Depo</button>}\n'
    '            </div>\n'
    '            <div style={{ width: 1, alignSelf: "stretch", minHeight: 28, background: t.line, flexShrink: 0 }} />\n'
    '            <ScopeSelector label="District (MC)" value={selectedMc} onChange={setSelectedMc} options={mcOptions} t={t} compact />\n'
    '          </div>\n'
    '        )}\n',

    '        {(isMcStep || isSdmStep) && depoOptions.length > 0 && (\n'
    '          <div style={{ display: "flex", alignItems: "center", background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 14px", flexWrap: "wrap", gap: 12 }}>\n'
    '            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>\n'
    '              <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact />\n'
    '              {editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" style={{ padding: "6px 10px", whiteSpace: "nowrap" }}><Settings2 size={12} /> Kelola Depo</button>}\n'
    '            </div>\n'
    '            <div style={{ width: 1, alignSelf: "stretch", minHeight: 28, background: t.line, flexShrink: 0 }} />\n'
    '            <ScopeSelector label="District (MC)" value={selectedMc} onChange={setSelectedMc} options={mcOptions} t={t} compact />\n'
    '            {isSdmStep && (\n'
    '              <span style={{ fontSize: 11.5, color: t.mid, fontWeight: 600 }}>\n'
    '                Partner <b style={{ color: t.hi }}>{partnerName || "—"}</b> · Region <b style={{ color: t.hi }}>{currentRegion || "—"}</b> · Area <b style={{ color: t.hi }}>{contextBranch || "—"}</b>\n'
    '              </span>\n'
    '            )}\n'
    '          </div>\n'
    '        )}\n',
    label="header: MC selector juga di step SDM + info Partner/Region/Area",
)

# 8) Body step 2 (SDM) - sebelumnya 1 ItemTable flat per grup (sales/non-
# sales). Sekarang dipecah per level (Partner/Region/Area/MC/Depo) di
# dalam grup yg sama, masing-masing dikasih label kecil entitasnya -
# supaya user tetap paham field itu "nempel" ke mana tanpa nambah step.
do(
    '                  <Card t={t}><Body>\n'
    '                    <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(depoSummary.totalSdmSales)}</span>}>HR Cost Sales</SecLabel>\n'
    '                    <ItemTable items={itemsOf("SDM", "sales")} {...depoTableProps} />\n'
    '                  </Body></Card>\n'
    '                  <Card t={t}><Body>\n'
    '                    <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(depoSummary.totalSdmNonSales)}</span>}>HR Cost Non Sales</SecLabel>\n'
    '                    <ItemTable items={itemsOf("SDM", "non_sales")} {...depoTableProps} />\n'
    '                  </Body></Card>\n'
    '                  <SubtotalBanner label="Total SDM" value={depoSummary.totalSdm} />\n',

    '                  <Card t={t}><Body>\n'
    '                    <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(sdmSummary.totalSdmSales)}</span>}>HR Cost Sales</SecLabel>\n'
    '                    {sdmGroupedSections("sales").map((g) => (\n'
    '                      <div key={g.lvl} style={{ marginBottom: 10 }}>\n'
    '                        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, margin: "4px 2px" }}>\n'
    '                          {SDM_LEVEL_LABEL[g.lvl]} — {sdmLevelEntityLabel(g.lvl)}\n'
    '                        </div>\n'
    '                        <ItemTable items={g.items} values={sdmValuesMerged} onChange={setSdmItemValue} readOnly={sdmRowReadOnly(g.lvl)} t={t} />\n'
    '                      </div>\n'
    '                    ))}\n'
    '                  </Body></Card>\n'
    '                  <Card t={t}><Body>\n'
    '                    <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(sdmSummary.totalSdmNonSales)}</span>}>HR Cost Non Sales</SecLabel>\n'
    '                    {sdmGroupedSections("non_sales").map((g) => (\n'
    '                      <div key={g.lvl} style={{ marginBottom: 10 }}>\n'
    '                        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, margin: "4px 2px" }}>\n'
    '                          {SDM_LEVEL_LABEL[g.lvl]} — {sdmLevelEntityLabel(g.lvl)}\n'
    '                        </div>\n'
    '                        <ItemTable items={g.items} values={sdmValuesMerged} onChange={setSdmItemValue} readOnly={sdmRowReadOnly(g.lvl)} t={t} />\n'
    '                      </div>\n'
    '                    ))}\n'
    '                  </Body></Card>\n'
    '                  <SubtotalBanner label="Total SDM" value={sdmSummary.totalSdm} />\n',
    label="body step 2 SDM - grouped per level",
)

# 9) Review (step 4) - total SDM & grand total dari sdmSummary (gabungan
# 5 level), BUKAN lagi dari depoSummary saja (yg sekarang cuma mewakili
# item SDM level Depo).
do(
    '                  <SumRow icon={Users} label="Total SDM" value={depoSummary.totalSdm} bold t={t} />\n'
    '                  <SumRow label="HR Cost Sales" value={depoSummary.totalSdmSales} indent t={t} />\n'
    '                  <SumRow label="HR Cost Non Sales" value={depoSummary.totalSdmNonSales} indent t={t} />\n',

    '                  <SumRow icon={Users} label="Total SDM" value={sdmSummary.totalSdm} bold t={t} />\n'
    '                  <SumRow label="HR Cost Sales" value={sdmSummary.totalSdmSales} indent t={t} />\n'
    '                  <SumRow label="HR Cost Non Sales" value={sdmSummary.totalSdmNonSales} indent t={t} />\n',
    label="review: total SDM dari sdmSummary",
)
do(
    '                <SubtotalBanner label="Grand Total Pengeluaran (Depo + District terpilih)" value={depoSummary.grandTotal + mcSummary.grandTotal} />\n',
    '                <SubtotalBanner label="Grand Total Pengeluaran (Depo + District terpilih)" value={depoSummary.totalOpex + depoSummary.totalCostOfMoney + sdmSummary.totalSdm + mcSummary.totalMarketing} />\n',
    label="review: grand total tanpa double count SDM",
)

assert src != orig, "no changes applied (checkpoint 1)"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK checkpoint 1 - state & helper SDM multi-level berhasil disisipkan")
