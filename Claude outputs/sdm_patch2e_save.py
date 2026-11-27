p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

old_savedepo = '''  const saveDepo = async () => {
    if (!depoCtxKey) return;
    setSaving(true);
    try {
      const payload = {
        partner_name: partnerName,
        depo_id: selectedDepoId,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(depoValues, ["OPEX", "SDM", "COST OF MONEY"]),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("pnl_pengeluaran_depo_v2").upsert(payload, { onConflict: "depo_id,month,year" });
      if (error) throw error;
      setDepoDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan OPEX/SDM (Depo).");
    } finally {
      setSaving(false);
    }
  };'''
new_savedepo = '''  // BARU: simpan OPEX/Cost of Money/SDM utk SEMUA Depo milik Partner ini
  // sekaligus (1 upsert banyak baris) - depoValues (OPEX & CoM Depo yg
  // lagi aktif) cuma turunan dari depoAllValues, jadi ikut tersimpan
  // benar dlm upsert ini tanpa risiko ketimpa data Depo lain.
  const saveDepoAll = async () => {
    if (!depoAllCtxKey || allDepoIds.length === 0) return;
    setSaving(true);
    try {
      const rows = allDepoIds.map((depoId) => ({
        partner_name: partnerName,
        depo_id: depoId,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(depoAllValues[depoId] || {}, ["OPEX", "SDM", "COST OF MONEY"]),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("pnl_pengeluaran_depo_v2").upsert(rows, { onConflict: "depo_id,month,year" });
      if (error) throw error;
      setDepoAllDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan OPEX/SDM (Depo).");
    } finally {
      setSaving(false);
    }
  };'''
do(old_savedepo, new_savedepo, 1, "saveDepo -> saveDepoAll")

old_savearearegion = '''  const saveArea = async () => {
    if (!areaCtxKey) return;
    setSaving(true);
    try {
      const payload = {
        partner_name: partnerName,
        branch: contextBranch,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(areaValues, ["SDM"]),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("pnl_pengeluaran_area_v2").upsert(payload, { onConflict: "partner_name,branch,month,year" });
      if (error) throw error;
      setAreaDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan SDM (Area).");
    } finally {
      setSaving(false);
    }
  };
  const saveRegion = async () => {
    if (!regionCtxKey) return;
    setSaving(true);
    try {
      const payload = {
        partner_name: partnerName,
        region: currentRegion,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(regionValues, ["SDM"]),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("pnl_pengeluaran_region_v2").upsert(payload, { onConflict: "partner_name,region,month,year" });
      if (error) throw error;
      setRegionDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan SDM (Region).");
    } finally {
      setSaving(false);
    }
  };'''
new_savearearegion = '''  // BARU: simpan SDM level Area/Region utk SEMUA Area/Region milik
  // Partner ini sekaligus (1 upsert banyak baris per tabel).
  const saveAreaAll = async () => {
    if (!areaAllCtxKey || allAreas.length === 0) return;
    setSaving(true);
    try {
      const rows = allAreas.map((branch) => ({
        partner_name: partnerName,
        branch,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(areaAllValues[branch] || {}, ["SDM"]),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("pnl_pengeluaran_area_v2").upsert(rows, { onConflict: "partner_name,branch,month,year" });
      if (error) throw error;
      setAreaAllDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan SDM (Area).");
    } finally {
      setSaving(false);
    }
  };
  const saveRegionAll = async () => {
    if (!regionAllCtxKey || allRegions.length === 0) return;
    setSaving(true);
    try {
      const rows = allRegions.map((region) => ({
        partner_name: partnerName,
        region,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: cleanValues(regionAllValues[region] || {}, ["SDM"]),
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("pnl_pengeluaran_region_v2").upsert(rows, { onConflict: "partner_name,region,month,year" });
      if (error) throw error;
      setRegionAllDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan SDM (Region).");
    } finally {
      setSaving(false);
    }
  };'''
do(old_savearearegion, new_savearearegion, 1, "saveArea/saveRegion -> saveAreaAll/saveRegionAll")

old_handlesave = '''  const handleSave = () => {
    if (isSdmStep) return Promise.all([saveDepo(), saveMcAll(), saveArea(), saveRegion(), savePartner()]);
    if (isDepoStep) return saveDepo();
    if (isMcStep) return saveMc();
    return Promise.all([saveDepo(), saveMc(), saveArea(), saveRegion(), savePartner()]);
  };
  const anyDirty = depoDirty || mcDirty || mcAllDirty || areaDirty || regionDirty || partnerDirty;'''
new_handlesave = '''  const handleSave = () => {
    if (isSdmStep) return Promise.all([saveDepoAll(), saveMcAll(), saveAreaAll(), saveRegionAll(), savePartner()]);
    if (isDepoStep) return saveDepoAll();
    if (isMcStep) return saveMc();
    return Promise.all([saveDepoAll(), saveMc(), saveAreaAll(), saveRegionAll(), savePartner()]);
  };
  const anyDirty = depoAllDirty || mcDirty || mcAllDirty || areaAllDirty || regionAllDirty || partnerDirty;'''
do(old_handlesave, new_handlesave, 1, "handleSave/anyDirty -> *All")

old_readonly = '''  const sdmRowReadOnly = useCallback((lvl) => {
    if (!editable) return true;
    if (lvl === "depo") return !selectedDepoId || depoNeedsMc;
    if (lvl === "mc") return mcCodesInDepo.length === 0;
    if (lvl === "area") return !contextBranch;
    if (lvl === "region") return !currentRegion;
    return false; // partner - selalu tersedia begitu partnerName diketahui
  }, [editable, selectedDepoId, depoNeedsMc, mcCodesInDepo, contextBranch, currentRegion]);
  const sdmGroupedSections = useCallback((group) => {
    const items = itemsOf("SDM", group);
    return SDM_LEVEL_ORDER.map((lvl) => ({ lvl, items: items.filter((it) => levelOfItem(it.id) === lvl) })).filter((g) => g.items.length > 0);
  }, [levelOfItem]);
  const sdmLevelEntityLabel = (lvl) => {
    if (lvl === "partner") return partnerName || "—";
    if (lvl === "region") return currentRegion || "—";
    if (lvl === "area") return contextBranch || "—";
    if (lvl === "mc") return mcCodesInDepo.length ? `Semua District (${mcCodesInDepo.length})` : "—";
    return depos.find((dp) => dp.id === selectedDepoId)?.depo_name || "—"; // depo
  };'''
new_readonly = '''  // FIX: Area/Region/Depo level SDM skrg multi-entitas (semua Area/
  // Region/Depo milik Partner), jadi read-only-nya ga lagi bergantung ke
  // 1 Area/Region/Depo aktif - cukup ada minimal 1 entitas di partner
  // ini.
  const sdmRowReadOnly = useCallback((lvl) => {
    if (!editable) return true;
    if (lvl === "depo") return allDepoIds.length === 0;
    if (lvl === "mc") return mcCodesInDepo.length === 0;
    if (lvl === "area") return allAreas.length === 0;
    if (lvl === "region") return allRegions.length === 0;
    return false; // partner - selalu tersedia begitu partnerName diketahui
  }, [editable, allDepoIds, mcCodesInDepo, allAreas, allRegions]);
  const itemsForSdmLevel = useCallback((lvl) => itemsOf("SDM").filter((it) => levelOfItem(it.id) === lvl), [levelOfItem]);
  const sdmLevelEntityLabel = (lvl) => {
    if (lvl === "partner") return partnerName || "—";
    if (lvl === "region") return allRegions.length ? `Semua Region (${allRegions.length})` : "—";
    if (lvl === "area") return allAreas.length ? `Semua Area (${allAreas.length})` : "—";
    if (lvl === "mc") return mcCodesInDepo.length ? `Semua District (${mcCodesInDepo.length})` : "—";
    return allDepoIds.length ? `Semua Depo (${allDepoIds.length})` : "—"; // depo
  };
  // ── Drag-and-drop item SDM antar level (ganti UI select lama) ────────
  const draggedItemIdRef = useRef(null);
  const [dragOverLevel, setDragOverLevel] = useState(null);
  const handleSdmItemDragStart = useCallback((e, itemId) => {
    draggedItemIdRef.current = itemId;
    try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", itemId); } catch { /* noop */ }
  }, []);
  const handleSdmLevelDragOver = useCallback((e, lvl) => {
    if (!canManageSdmLevel || !draggedItemIdRef.current) return;
    e.preventDefault();
    if (dragOverLevel !== lvl) setDragOverLevel(lvl);
  }, [canManageSdmLevel, dragOverLevel]);
  const handleSdmLevelDragLeave = useCallback((lvl) => {
    setDragOverLevel((cur) => (cur === lvl ? null : cur));
  }, []);
  const handleSdmLevelDrop = useCallback((e, lvl) => {
    e.preventDefault();
    const itemId = draggedItemIdRef.current;
    draggedItemIdRef.current = null;
    setDragOverLevel(null);
    if (itemId) moveSdmItemLevel(itemId, lvl);
  }, [moveSdmItemLevel]);
  const renderSdmLevelSection = (lvl) => {
    const items = itemsForSdmLevel(lvl);
    const subtotal = items.reduce((sum, it) => sum + numOrZero((sdmValuesMerged[it.id] || {}).total), 0);
    const isOver = dragOverLevel === lvl;
    let table;
    if (lvl === "partner") {
      table = <ItemTable items={items} values={partnerValues} onChange={setPartnerItemValue} readOnly={sdmRowReadOnly(lvl)} showQty showKategori draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} t={t} />;
    } else if (lvl === "region") {
      table = <MultiEntityItemTable items={items} entities={allRegions.map((r) => ({ key: r, label: r }))} valuesByEntity={regionAllValues} onChange={setRegionAllItemValue} readOnly={sdmRowReadOnly(lvl)} draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} emptyLabel="Belum ada Region." t={t} />;
    } else if (lvl === "area") {
      table = <MultiEntityItemTable items={items} entities={allAreas.map((a) => ({ key: a, label: a }))} valuesByEntity={areaAllValues} onChange={setAreaAllItemValue} readOnly={sdmRowReadOnly(lvl)} draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} emptyLabel="Belum ada Area." t={t} />;
    } else if (lvl === "mc") {
      table = <MultiEntityItemTable items={items} entities={mcCodesInDepo.map((mc) => ({ key: mc, label: mc }))} valuesByEntity={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(lvl)} draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} emptyLabel="Depo ini belum punya District." t={t} />;
    } else {
      table = <MultiEntityItemTable items={items} entities={deposAll.map((dp) => ({ key: dp.id, label: dp.depo_name }))} valuesByEntity={depoAllValues} onChange={setDepoAllItemValue} readOnly={sdmRowReadOnly(lvl)} draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} emptyLabel="Belum ada Depo." t={t} />;
    }
    return (
      <div
        key={lvl}
        onDragOver={(e) => handleSdmLevelDragOver(e, lvl)}
        onDragLeave={() => handleSdmLevelDragLeave(lvl)}
        onDrop={(e) => handleSdmLevelDrop(e, lvl)}
      >
        <Card t={t} style={isOver ? { outline: `2px dashed ${t.blue || t.hi}`, outlineOffset: -2, background: t.blueBg, transition: "background 0.12s, outline-color 0.12s" } : { transition: "background 0.12s, outline-color 0.12s" }}>
          <Body>
            <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(subtotal)}</span>}>
              {SDM_LEVEL_LABEL[lvl]} <span style={{ fontWeight: 500, color: t.lo }}>— {sdmLevelEntityLabel(lvl)}</span>
            </SecLabel>
            {items.length === 0 ? (
              <div style={{ fontSize: 12.5, color: t.lo, padding: "10px 2px" }}>
                Belum ada item di level ini.{canManageSdmLevel && " Seret (drag) item dari section lain ke sini untuk memindahkannya."}
              </div>
            ) : table}
          </Body>
        </Card>
      </div>
    );
  };'''
do(old_readonly, new_readonly, 1, "sdmRowReadOnly + drag-drop helpers + renderSdmLevelSection")

open(p, "w").write(S["s"])
print("PATCH2E_OK")
