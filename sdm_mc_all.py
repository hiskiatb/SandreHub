import re, sys

path = "PNL_FormPengeluaranV2.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new, n)

# ── 1. Tambahkan komponen McMultiItemTable (module scope, setelah ItemTable) ──
do(
"""// Selector generik (Depo / District) dipakai di header tiap langkah -""",
"""// BARU (permintaan user - "bisakah jika ada tampilkan semua mc, untuk
// mempermudah pengisian oleh satu orang tanpa harus ganti ganti
// filternya"): item SDM level District (MC) sebelumnya diisi 1 MC pada
// satu waktu (harus gonta-ganti selector District). Sekarang semua
// District di bawah Depo yg aktif ditampilkan sekaligus sbg kolom -
// rows = item, kolom = tiap MC - supaya 1 orang bisa isi semua MC tanpa
// pindah-pindah filter.
function McMultiItemTable({ items, mcs, valuesByMc, onChange, readOnly, t }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 260 + mcs.length * 140 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            <TH t={t}>Sub-Kategori</TH>
            {mcs.map((m) => <TH key={m.mc} t={t} align="right" width={140}>{m.mc}</TH>)}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="v2row" style={{ borderBottom: `1px solid ${t.lineH}` }}>
              <td style={{ padding: "9px 8px", verticalAlign: "middle" }}>
                <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
              </td>
              {mcs.map((m) => (
                <td key={m.mc} style={{ padding: "9px 8px", width: 140, verticalAlign: "middle" }}>
                  <NumInput numericValue={valuesByMc[m.mc]?.[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(m.mc, it.id, "total", v)} />
                </td>
              ))}
            </tr>
          ))}
          {mcs.length === 0 && (
            <tr><td colSpan={1} style={{ padding: "14px 8px", fontSize: 12, color: t.lo }}>Belum ada District (MC) di Depo ini.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Selector generik (Depo / District) dipakai di header tiap langkah -""",
    label="insert McMultiItemTable",
)

# ── 2. Tambahkan state mcAllValues + mcCodesInDepo + load effect, setelah blok mcValues (MKT/COM) ──
do(
"""      setMcValues(data?.pengeluaran_data || {});
      setMcDirty(false);
      setMcLoadedKey(mcCtxKey);
    })();
    return () => { cancelled = true; };
  }, [mcCtxKey, selectedMc, monthInt, yearInt]);
""",
"""      setMcValues(data?.pengeluaran_data || {});
      setMcDirty(false);
      setMcLoadedKey(mcCtxKey);
    })();
    return () => { cancelled = true; };
  }, [mcCtxKey, selectedMc, monthInt, yearInt]);

  // BARU (permintaan user - "tampilkan semua mc, untuk mempermudah
  // pengisian oleh satu orang tanpa harus ganti ganti filternya"): item
  // SDM level District (MC) dimuat utk SEMUA District di bawah Depo yg
  // aktif sekaligus (bukan cuma `selectedMc`) - pakai tabel yg sama
  // (pnl_pengeluaran_mc_v2), cuma di-query utk banyak `mc` sekaligus.
  const mcCodesInDepo = useMemo(() => mcListInSelectedDepo.map((m) => m.mc).sort(), [mcListInSelectedDepo]);
  const [mcAllValues, setMcAllValues] = useState({});
  const [mcAllDirty, setMcAllDirty] = useState(false);
  const [mcAllLoadedKey, setMcAllLoadedKey] = useState(null);
  const mcAllCtxKey = (periodReady && mcCodesInDepo.length > 0) ? `${selectedDepoId}|${mcCodesInDepo.join(",")}|${monthInt}|${yearInt}` : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mcAllCtxKey) { setMcAllValues({}); setMcAllLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_mc_v2").select("mc, pengeluaran_data")
        .in("mc", mcCodesInDepo).eq("month", monthInt).eq("year", yearInt);
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load mc (semua):", error.message);
      const map = {};
      mcCodesInDepo.forEach((mc) => { map[mc] = {}; });
      (data || []).forEach((r) => { map[r.mc] = r.pengeluaran_data || {}; });
      setMcAllValues(map);
      setMcAllDirty(false);
      setMcAllLoadedKey(mcAllCtxKey);
    })();
    return () => { cancelled = true; };
  }, [mcAllCtxKey, mcCodesInDepo, monthInt, yearInt]);
""",
    label="insert mcAllValues state+effect",
)

# ── 3. Loading flag: ganti pengecekan mcCtxKey utk isSdmStep jadi mcAllCtxKey ──
do(
"""    || (isSdmStep && mcCtxKey && mcLoadedKey !== mcCtxKey)""",
"""    || (isSdmStep && mcAllCtxKey && mcAllLoadedKey !== mcAllCtxKey)""",
    label="loading flag mcAll",
)

# ── 4. Tambahkan setMcAllItemValue, setelah setMcItemValue ──
do(
"""  const setMcItemValue = useCallback((id, field, v) => {
    setMcValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setMcDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
""",
"""  const setMcItemValue = useCallback((id, field, v) => {
    setMcValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setMcDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setMcAllItemValue = useCallback((mc, id, field, v) => {
    setMcAllValues((prev) => ({ ...prev, [mc]: { ...(prev[mc] || {}), [id]: { ...((prev[mc] || {})[id] || {}), [field]: v } } }));
    setMcAllDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
""",
    label="insert setMcAllItemValue",
)

# ── 5. sdmValuesMerged: level "mc" dijumlah dari semua MC ──
do(
"""  const sdmValuesMerged = useMemo(() => {
    const out = {};
    itemsOf("SDM").forEach((it) => {
      const lvl = levelOfItem(it.id);
      const src = lvl === "mc" ? mcValues : lvl === "area" ? areaValues : lvl === "region" ? regionValues : lvl === "partner" ? partnerValues : depoValues;
      if (src[it.id]) out[it.id] = src[it.id];
    });
    return out;
  }, [levelOfItem, mcValues, areaValues, regionValues, partnerValues, depoValues]);""",
"""  const sdmValuesMerged = useMemo(() => {
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
  }, [levelOfItem, mcAllValues, areaValues, regionValues, partnerValues, depoValues]);""",
    label="sdmValuesMerged mc sum",
)

# ── 6. Tambahkan saveMcAll, setelah saveMc ──
do(
"""      const { error } = await supabase.from("pnl_pengeluaran_mc_v2").upsert(payload, { onConflict: "mc,month,year" });
      if (error) throw error;
      setMcDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan Marketing/Cost of Money (District).");
    } finally {
      setSaving(false);
    }
  };
""",
"""      const { error } = await supabase.from("pnl_pengeluaran_mc_v2").upsert(payload, { onConflict: "mc,month,year" });
      if (error) throw error;
      setMcDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan Marketing/Cost of Money (District).");
    } finally {
      setSaving(false);
    }
  };

  // BARU: simpan item SDM level District (MC) utk SEMUA MC di Depo ini
  // sekaligus (1 upsert banyak baris) - setiap baris tetap mempertahankan
  // field MARKETING COST milik MC tsb (ikut di-load bareng mcAllValues)
  // supaya tidak ketimpa kosong oleh langkah SDM ini.
  const saveMcAll = async () => {
    if (!mcAllCtxKey || mcCodesInDepo.length === 0) return;
    setSaving(true);
    try {
      const rows = mcCodesInDepo.map((mc) => ({
        partner_name: partnerName,
        mc,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: { ...cleanValues(mcAllValues[mc] || {}, ["MARKETING COST"]), ...cleanValues(mcAllValues[mc] || {}, ["SDM"]) },
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from("pnl_pengeluaran_mc_v2").upsert(rows, { onConflict: "mc,month,year" });
      if (error) throw error;
      setMcAllDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan SDM (District/MC).");
    } finally {
      setSaving(false);
    }
  };
""",
    label="insert saveMcAll",
)

# ── 7. handleSave + anyDirty ──
do(
"""  const handleSave = () => {
    if (isSdmStep) return Promise.all([saveDepo(), saveMc(), saveArea(), saveRegion(), savePartner()]);
    if (isDepoStep) return saveDepo();
    if (isMcStep) return saveMc();
    return Promise.all([saveDepo(), saveMc(), saveArea(), saveRegion(), savePartner()]);
  };
  const anyDirty = depoDirty || mcDirty || areaDirty || regionDirty || partnerDirty;""",
"""  const handleSave = () => {
    if (isSdmStep) return Promise.all([saveDepo(), saveMcAll(), saveArea(), saveRegion(), savePartner()]);
    if (isDepoStep) return saveDepo();
    if (isMcStep) return saveMc();
    return Promise.all([saveDepo(), saveMc(), saveArea(), saveRegion(), savePartner()]);
  };
  const anyDirty = depoDirty || mcDirty || mcAllDirty || areaDirty || regionDirty || partnerDirty;""",
    label="handleSave+anyDirty",
)

# ── 8. sdmRowReadOnly: level "mc" cek mcCodesInDepo, bukan selectedMc ──
do(
"""  const sdmRowReadOnly = useCallback((lvl) => {
    if (!editable) return true;
    if (lvl === "depo") return !selectedDepoId || depoNeedsMc;
    if (lvl === "mc") return !selectedMc;
    if (lvl === "area") return !contextBranch;
    if (lvl === "region") return !currentRegion;
    return false; // partner - selalu tersedia begitu partnerName diketahui
  }, [editable, selectedDepoId, depoNeedsMc, selectedMc, contextBranch, currentRegion]);""",
"""  const sdmRowReadOnly = useCallback((lvl) => {
    if (!editable) return true;
    if (lvl === "depo") return !selectedDepoId || depoNeedsMc;
    if (lvl === "mc") return mcCodesInDepo.length === 0;
    if (lvl === "area") return !contextBranch;
    if (lvl === "region") return !currentRegion;
    return false; // partner - selalu tersedia begitu partnerName diketahui
  }, [editable, selectedDepoId, depoNeedsMc, mcCodesInDepo, contextBranch, currentRegion]);""",
    label="sdmRowReadOnly mc",
)

# ── 9. sdmLevelEntityLabel: level "mc" tampilkan jumlah District, bukan 1 nama ──
do(
"""    if (lvl === "mc") return selectedMc || "—";
    return depos.find((dp) => dp.id === selectedDepoId)?.depo_name || "—"; // depo
  };""",
"""    if (lvl === "mc") return mcCodesInDepo.length ? `Semua District (${mcCodesInDepo.length})` : "—";
    return depos.find((dp) => dp.id === selectedDepoId)?.depo_name || "—"; // depo
  };""",
    label="sdmLevelEntityLabel mc",
)

# ── 10. FormHeader: District (MC) selector cuma utk langkah MKT/COM, tidak lagi utk SDM ──
do(
"""            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact />
                {editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" style={{ padding: "6px 10px", whiteSpace: "nowrap" }}><Settings2 size={12} /> Kelola Depo</button>}
              </div>
              <div style={{ width: 1, alignSelf: "stretch", minHeight: 28, background: t.line, flexShrink: 0 }} />
              <ScopeSelector label="District (MC)" value={selectedMc} onChange={setSelectedMc} options={mcOptions} t={t} compact />
            </div>""",
"""            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact />
                {editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" style={{ padding: "6px 10px", whiteSpace: "nowrap" }}><Settings2 size={12} /> Kelola Depo</button>}
              </div>
              {isMcStep && (
                <>
                  <div style={{ width: 1, alignSelf: "stretch", minHeight: 28, background: t.line, flexShrink: 0 }} />
                  <ScopeSelector label="District (MC)" value={selectedMc} onChange={setSelectedMc} options={mcOptions} t={t} compact />
                </>
              )}
            </div>""",
    label="FormHeader hide District selector on SDM step",
)

# ── 11. JSX render: pakai McMultiItemTable utk group level "mc" (sales & non_sales) ──
do(
"""                    {sdmGroupedSections("sales").map((g) => (
                      <div key={g.lvl} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, margin: "4px 2px" }}>
                          {SDM_LEVEL_LABEL[g.lvl]} — {sdmLevelEntityLabel(g.lvl)}
                        </div>
                        <ItemTable items={g.items} values={sdmValuesMerged} onChange={setSdmItemValue} readOnly={sdmRowReadOnly(g.lvl)} t={t} />
                      </div>
                    ))}""",
"""                    {sdmGroupedSections("sales").map((g) => (
                      <div key={g.lvl} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, margin: "4px 2px" }}>
                          {SDM_LEVEL_LABEL[g.lvl]} — {sdmLevelEntityLabel(g.lvl)}
                        </div>
                        {g.lvl === "mc"
                          ? <McMultiItemTable items={g.items} mcs={mcListInSelectedDepo} valuesByMc={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(g.lvl)} t={t} />
                          : <ItemTable items={g.items} values={sdmValuesMerged} onChange={setSdmItemValue} readOnly={sdmRowReadOnly(g.lvl)} t={t} />}
                      </div>
                    ))}""",
    label="JSX mc multi-table (sales)",
)

do(
"""                    {sdmGroupedSections("non_sales").map((g) => (
                      <div key={g.lvl} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, margin: "4px 2px" }}>
                          {SDM_LEVEL_LABEL[g.lvl]} — {sdmLevelEntityLabel(g.lvl)}
                        </div>
                        <ItemTable items={g.items} values={sdmValuesMerged} onChange={setSdmItemValue} readOnly={sdmRowReadOnly(g.lvl)} t={t} />
                      </div>
                    ))}""",
"""                    {sdmGroupedSections("non_sales").map((g) => (
                      <div key={g.lvl} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, margin: "4px 2px" }}>
                          {SDM_LEVEL_LABEL[g.lvl]} — {sdmLevelEntityLabel(g.lvl)}
                        </div>
                        {g.lvl === "mc"
                          ? <McMultiItemTable items={g.items} mcs={mcListInSelectedDepo} valuesByMc={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(g.lvl)} t={t} />
                          : <ItemTable items={g.items} values={sdmValuesMerged} onChange={setSdmItemValue} readOnly={sdmRowReadOnly(g.lvl)} t={t} />}
                      </div>
                    ))}""",
    label="JSX mc multi-table (non_sales)",
)

with open(path, "w", encoding="utf-8") as f:
    f.write(src)

print("OK: all patches applied")
