p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# ── 1) Komponen baru EntityColumnTable - KHUSUS Langkah 1 (OPEX & Cost
# of Money) dan Langkah 3 (Marketing Cost): permintaan user - "nama
# depo dibuat jadi header tabel dan nama mc jadi header tabel saja,
# tidak perlu dipisah per kotak kotak komponen". Beda dari
# MultiEntityItemTable (dipakai SDM - kartu per-entitas yg wrap, karena
# SDM bisa punya BANYAK entitas per level): di sini entitasnya cuma
# sedikit (Depo dlm 1 Area, atau MC dlm 1 Depo), jadi aman pakai tabel
# flat biasa - nama entitas jadi HEADER KOLOM, 1 kolom Total per
# entitas (OPEX/Cost of Money/Marketing Cost semuanya tanpa Qty).
sdm_menu_marker = "// Tabel item 1 langkah - kolom: Sub-Kategori | (Qty opsional) | Total"
entity_col_table = '''// BARU (permintaan user - "untuk opex com dan mkt ini dia tipenya nama
// depo dibuat jadi header tabel dan nama mc jadi header tabel saja,
// tidak perlu dipisah per kotak kotak komponen"): tabel flat - baris =
// item, kolom = tiap entitas (Depo utk OPEX/Cost of Money, MC/District
// utk Marketing Cost), nama entitas jadi HEADER KOLOM. Entitasnya
// sedikit (Depo dlm 1 Area, District dlm 1 Depo) jadi aman tanpa perlu
// wrap jadi kartu spt di SDM.
function EntityColumnTable({ items, entities, valuesByEntity, onChange, readOnly, showKategori, emptyLabel, t }) {
  if (entities.length === 0) {
    return <div style={{ fontSize: 12.5, color: t.lo, padding: "10px 2px" }}>{emptyLabel || "Belum ada entitas."}</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 220 + entities.length * 168 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            <TH t={t}>Sub-Kategori</TH>
            {entities.map((en) => (
              <th key={en.key} style={{ padding: "7px 10px", textAlign: "right", fontSize: 11, fontWeight: 800, color: t.hi, borderLeft: `2px solid ${t.line}`, whiteSpace: "nowrap" }}>{en.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="v2row" style={{ borderBottom: `1px solid ${t.lineH}` }}>
              <td style={{ padding: "9px 8px", verticalAlign: "middle" }}>
                <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
                {showKategori && <div style={{ fontSize: 11, color: t.lo, marginTop: 2 }}>{it.kategori}</div>}
                {it.info && <div style={{ fontSize: 11, color: t.mid, marginTop: 3, display: "flex", alignItems: "flex-start", gap: 5 }}><Info size={11} style={{ flexShrink: 0, marginTop: 2 }} />{it.info}</div>}
              </td>
              {entities.map((en) => (
                <td key={en.key} style={{ padding: "9px 8px", width: 160, verticalAlign: "middle", borderLeft: `1px solid ${t.lineH}` }}>
                  <NumInput numericValue={valuesByEntity[en.key]?.[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(en.key, it.id, "total", v)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

''' + sdm_menu_marker
do(sdm_menu_marker, entity_col_table, 1, "sisipkan EntityColumnTable sebelum ItemTable")

# ── 2) Hapus state single-entity mc lama (`mcValues`/`mcCtxKey`/
# `mcDirty`/`mcLoadedKey` + query-nya sendiri) - diganti jadi TURUNAN
# dari `mcAllValues` (yg udah dimuat utk SEMUA MC partner), persis pola
# `depoValues` yg sudah lebih dulu diturunkan dari `depoAllValues`. 1
# sumber data per MC, tidak ada lagi 2 state MC yg bisa saling beda.
old_mc_single = '''  // ── Nilai MKT/COM (per District/mc) ──────────────────────────────────
  const [mcValues, setMcValues] = useState({});
  const [mcDirty, setMcDirty] = useState(false);
  const [mcLoadedKey, setMcLoadedKey] = useState(null);
  const mcCtxKey = (periodReady && selectedMc) ? `${selectedMc}|${monthInt}|${yearInt}` : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mcCtxKey) { setMcValues({}); setMcLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_mc_v2").select("pengeluaran_data")
        .eq("mc", selectedMc).eq("month", monthInt).eq("year", yearInt).maybeSingle();
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load mc:", error.message);
      setMcValues(data?.pengeluaran_data || {});
      setMcDirty(false);
      setMcLoadedKey(mcCtxKey);
    })();
    return () => { cancelled = true; };
  }, [mcCtxKey, selectedMc, monthInt, yearInt]);

  // BARU (permintaan user - "tampilkan semua mc, untuk mempermudah'''
new_mc_single = '''  // BARU (permintaan user - "tampilkan semua mc, untuk mempermudah'''
do(old_mc_single, new_mc_single, 1, "hapus state single-entity mcValues lama")

old_mcall_tail = '''  }, [mcAllCtxKey, allMcsInPartner, monthInt, yearInt]);

  // ── Nilai SDM level Area/Region (SEMUA Area/Region milik Partner ini'''
new_mcall_tail = '''  }, [mcAllCtxKey, allMcsInPartner, monthInt, yearInt]);
  // `mcValues` (dipakai Marketing Cost Langkah 3 utk District yg lagi
  // "dipilih" + Review Langkah 4) skrg TURUNAN dari `mcAllValues` -
  // persis pola `depoValues` di atas, 1 sumber data per MC.
  const mcValues = useMemo(() => mcAllValues[selectedMc] || {}, [mcAllValues, selectedMc]);

  // ── Nilai SDM level Area/Region (SEMUA Area/Region milik Partner ini'''
do(old_mcall_tail, new_mcall_tail, 1, "mcValues -> turunan dari mcAllValues")

# ── 3) loading: ganti cek isMcStep yg lama (mcCtxKey/mcLoadedKey) jadi
# ikut mcAllCtxKey/mcAllLoadedKey (sama yg dipakai isSdmStep, krn skrg
# mcValues jg turunan dari situ).
old_loading_mc = """    || (isMcStep && mcCtxKey && mcLoadedKey !== mcCtxKey)
    || (isSdmStep && mcAllCtxKey && mcAllLoadedKey !== mcAllCtxKey)"""
new_loading_mc = """    || ((isMcStep || isSdmStep) && mcAllCtxKey && mcAllLoadedKey !== mcAllCtxKey)"""
do(old_loading_mc, new_loading_mc, 1, "loading: isMcStep pakai mcAllCtxKey")

# ── 4) setMcItemValue lama (nulis ke state mcValues yg udah dihapus) -
# dibuang total, District Langkah 3 skrg selalu lewat setMcAllItemValue
# (tabel multi-kolom), ga ada lagi input yg nulis ke 1 MC "tersirat".
old_setmcitem = '''  const setMcItemValue = useCallback((id, field, v) => {
    setMcValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: v } }));
    setMcDirty(true); setIsFormDirty?.(true);
  }, [setIsFormDirty]);
  const setMcAllItemValue = useCallback((mc, id, field, v) => {'''
new_setmcitem = '''  const setMcAllItemValue = useCallback((mc, id, field, v) => {'''
do(old_setmcitem, new_setmcitem, 1, "hapus setMcItemValue lama")

# ── 5) saveMc() single-entity lama dibuang - Langkah 3 skrg selalu
# simpan lewat saveMcAll() (sudah ada, dipakai jg oleh Langkah 2/SDM).
old_savemc = '''  const saveMc = async () => {
    if (!mcCtxKey) return;
    setSaving(true);
    try {
      const payload = {
        partner_name: partnerName,
        mc: selectedMc,
        month: monthInt,
        year: yearInt,
        user_id: profile?.id || null,
        pengeluaran_data: { ...cleanValues(mcValues, ["MARKETING COST"]), ...cleanValues(mcValues, ["SDM"]) },
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("pnl_pengeluaran_mc_v2").upsert(payload, { onConflict: "mc,month,year" });
      if (error) throw error;
      setMcDirty(false); setIsFormDirty?.(false);
    } catch (e) {
      alert(e.message || "Gagal menyimpan Marketing/Cost of Money (District).");
    } finally {
      setSaving(false);
    }
  };

  // BARU: simpan item SDM level District (MC) utk SEMUA MC di Depo ini'''
new_savemc = '''  // BARU: simpan item SDM level District (MC) utk SEMUA MC di Depo ini'''
do(old_savemc, new_savemc, 1, "hapus saveMc lama")

# ── 6) handleSave/anyDirty: pakai saveMcAll utk isMcStep juga, buang
# mcDirty (state udah ga ada).
old_handlesave = '''  const handleSave = () => {
    if (isSdmStep) return Promise.all([saveDepoAll(), saveMcAll(), saveAreaAll(), saveRegionAll(), savePartner()]);
    if (isDepoStep) return saveDepoAll();
    if (isMcStep) return saveMc();
    return Promise.all([saveDepoAll(), saveMc(), saveAreaAll(), saveRegionAll(), savePartner()]);
  };
  const anyDirty = depoAllDirty || mcDirty || mcAllDirty || areaAllDirty || regionAllDirty || partnerDirty;'''
new_handlesave = '''  const handleSave = () => {
    if (isSdmStep) return Promise.all([saveDepoAll(), saveMcAll(), saveAreaAll(), saveRegionAll(), savePartner()]);
    if (isDepoStep) return saveDepoAll();
    if (isMcStep) return saveMcAll();
    return Promise.all([saveDepoAll(), saveMcAll(), saveAreaAll(), saveRegionAll(), savePartner()]);
  };
  const anyDirty = depoAllDirty || mcAllDirty || areaAllDirty || regionAllDirty || partnerDirty;'''
do(old_handlesave, new_handlesave, 1, "handleSave/anyDirty -> saveMcAll")

# ── 7) Hapus depoTableProps/mcTableProps lama (dipakai ItemTable
# single-entity) - Langkah 1/3 skrg pakai EntityColumnTable langsung.
do(
    '  const depoTableProps = { values: depoValues, onChange: setDepoItemValue, readOnly: !editable || !selectedDepoId || depoNeedsMc, t };\n\n  // FIX: Area/Region/Depo level SDM skrg multi-entitas',
    '  // FIX: Area/Region/Depo level SDM skrg multi-entitas',
    1, "hapus depoTableProps",
)
do(
    '  const mcTableProps = { values: mcValues, onChange: setMcItemValue, readOnly: !editable || !selectedMc, t };\n\n  const needsDepoGate',
    '  const needsDepoGate',
    1, "hapus mcTableProps",
)

# ── 8) Total agregat BARU utk Langkah 1 (semua Depo di Area) & Langkah
# 3 (semua District di Depo) - krn tabelnya skrg nampilin banyak entitas
# sekaligus, total yg ditampilkan hrs ikut menjumlahkan semuanya (bukan
# cuma 1 Depo/District yg "lagi dipilih" spt sebelumnya). `depoSummary`/
# `mcSummary` (1 entitas) TETAP dipakai apa adanya di Langkah 4 (Review)
# - tidak diubah.
old_summaries = '''  const depoSummary = useMemo(() => summarizePengeluaran(depoValues), [depoValues]);
  const mcSummary = useMemo(() => summarizePengeluaran(mcValues), [mcValues]);'''
new_summaries = '''  const depoSummary = useMemo(() => summarizePengeluaran(depoValues), [depoValues]);
  const mcSummary = useMemo(() => summarizePengeluaran(mcValues), [mcValues]);
  // BARU (permintaan user - Langkah 1/3 skrg nampilin SEMUA Depo/District
  // sekaligus sbg kolom tabel): total OPEX/Cost of Money dijumlahkan dari
  // SEMUA Depo di Area yg aktif; total Marketing Cost dari SEMUA District
  // di Depo yg aktif - supaya angkanya konsisten sama apa yg keliatan &
  // bisa diisi di tabel.
  const areaDepoSummary = useMemo(() => {
    let totalOpex = 0, totalCostOfMoney = 0;
    const opexItems = itemsOf("OPEX"), comItems = itemsOf("COST OF MONEY");
    depos.forEach((dp) => {
      const v = depoAllValues[dp.id] || {};
      opexItems.forEach((it) => { totalOpex += numOrZero(v[it.id]?.total); });
      comItems.forEach((it) => { totalCostOfMoney += numOrZero(v[it.id]?.total); });
    });
    return { totalOpex, totalCostOfMoney };
  }, [depos, depoAllValues]);
  const depoMcSummary = useMemo(() => {
    let totalMarketing = 0;
    const mktItems = itemsOf("MARKETING COST");
    mcCodesInDepo.forEach((mc) => {
      const v = mcAllValues[mc] || {};
      mktItems.forEach((it) => { totalMarketing += numOrZero(v[it.id]?.total); });
    });
    return { totalMarketing };
  }, [mcCodesInDepo, mcAllValues]);'''
do(old_summaries, new_summaries, 1, "tambah areaDepoSummary + depoMcSummary")

# ── 9) Langkah 1 (OPEX & Cost of Money): header total + Card OPEX +
# Card Cost of Money pakai EntityColumnTable (entitas = Depo di Area yg
# aktif) + label "Level Depo" statis (TIDAK bisa dipindah - beda dari
# SDM). Total pakai areaDepoSummary (gabungan semua Depo).
old_step1_hero_total = '''                totalLabel="Total OPEX + Cost of Money"
                totalValue={!needsDepoGate ? depoSummary.totalOpex + depoSummary.totalCostOfMoney : undefined}'''
new_step1_hero_total = '''                totalLabel="Total OPEX + Cost of Money"
                totalValue={!needsDepoGate ? areaDepoSummary.totalOpex + areaDepoSummary.totalCostOfMoney : undefined}'''
do(old_step1_hero_total, new_step1_hero_total, 1, "step1 hero total -> areaDepoSummary")

old_opex_card = '''                  <Card t={t}><Body>
                    <ItemTable items={itemsOf("OPEX")} showKategori {...depoTableProps} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.line}` }}>
                      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: t.mid }}>Total OPEX</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(depoSummary.totalOpex)}</span>
                    </div>
                  </Body></Card>'''
new_opex_card = '''                  <Card t={t}><Body>
                    <SecLabel t={t}>Level Depo <span style={{ fontWeight: 500, color: t.lo }}>— {contextBranch || "Area ini"} ({depos.length})</span></SecLabel>
                    <EntityColumnTable items={itemsOf("OPEX")} entities={depos.map((dp) => ({ key: dp.id, label: dp.depo_name }))} valuesByEntity={depoAllValues} onChange={setDepoAllItemValue} readOnly={!editable || depos.length === 0} showKategori emptyLabel="Belum ada Depo di Area ini." t={t} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.line}` }}>
                      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: t.mid }}>Total OPEX</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(areaDepoSummary.totalOpex)}</span>
                    </div>
                  </Body></Card>'''
do(old_opex_card, new_opex_card, 1, "Card OPEX -> EntityColumnTable per Depo")

old_com_card = '''                  <Card t={t}><Body>
                    <ItemTable items={itemsOf("COST OF MONEY")} showKategori {...depoTableProps} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.line}` }}>
                      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: t.mid }}>Total Cost of Money</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(depoSummary.totalCostOfMoney)}</span>
                    </div>
                  </Body></Card>'''
new_com_card = '''                  <Card t={t}><Body>
                    <SecLabel t={t}>Level Depo <span style={{ fontWeight: 500, color: t.lo }}>— {contextBranch || "Area ini"} ({depos.length})</span></SecLabel>
                    <EntityColumnTable items={itemsOf("COST OF MONEY")} entities={depos.map((dp) => ({ key: dp.id, label: dp.depo_name }))} valuesByEntity={depoAllValues} onChange={setDepoAllItemValue} readOnly={!editable || depos.length === 0} showKategori emptyLabel="Belum ada Depo di Area ini." t={t} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.line}` }}>
                      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: t.mid }}>Total Cost of Money</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(areaDepoSummary.totalCostOfMoney)}</span>
                    </div>
                  </Body></Card>'''
do(old_com_card, new_com_card, 1, "Card Cost of Money -> EntityColumnTable per Depo")

# ── 10) Langkah 3 (Marketing Cost): header total + Card pakai
# EntityColumnTable (entitas = District/MC di Depo yg aktif) + label
# "Level MC" statis. Total pakai depoMcSummary (gabungan semua MC).
old_step3_hero_total = '''                totalLabel="Total Marketing Cost"
                totalValue={!needsDepoGate ? mcSummary.totalMarketing : undefined}'''
new_step3_hero_total = '''                totalLabel="Total Marketing Cost"
                totalValue={!needsDepoGate ? depoMcSummary.totalMarketing : undefined}'''
do(old_step3_hero_total, new_step3_hero_total, 1, "step3 hero total -> depoMcSummary")

old_mkt_card = '''              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card t={t}><Body><ItemTable items={itemsOf("MARKETING COST")} {...mcTableProps} /></Body></Card>
                <SubtotalBanner label="Total Marketing Cost" value={mcSummary.totalMarketing} />
              </div>'''
new_mkt_card = '''              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Card t={t}><Body>
                  <SecLabel t={t}>Level MC <span style={{ fontWeight: 500, color: t.lo }}>— {depos.find((dp) => dp.id === selectedDepoId)?.depo_name || "Depo ini"} ({mcCodesInDepo.length})</span></SecLabel>
                  <EntityColumnTable items={itemsOf("MARKETING COST")} entities={mcListInSelectedDepo.map((m) => ({ key: m.mc, label: m.mc }))} valuesByEntity={mcAllValues} onChange={setMcAllItemValue} readOnly={!editable || mcListInSelectedDepo.length === 0} emptyLabel="Belum ada District di Depo ini." t={t} />
                </Body></Card>
                <SubtotalBanner label="Total Marketing Cost" value={depoMcSummary.totalMarketing} />
              </div>'''
do(old_mkt_card, new_mkt_card, 1, "Card Marketing Cost -> EntityColumnTable per MC")

open(p, "w").write(S["s"])
print("A1_OK")
