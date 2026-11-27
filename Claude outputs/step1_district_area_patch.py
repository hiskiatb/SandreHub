p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# FIX (permintaan user - "nah ini kan semua depo di area solok, jadi
# harusnya linear ke filter yang diatasnya semua depo"): header Langkah
# 1 (OPEX & Cost of Money) nunjukin District cuma dari 1 Depo yg lagi
# dipilih (`mcCodesInDepo`), padahal tabel "Level Depo" di bawahnya
# SUDAH menampilkan SEMUA Depo yg ada di Area aktif sekaligus (var
# `depos`, sudah difilter per-Area) - jadi daftar District di header jadi
# tidak konsisten/"tidak linear" dgn data yg sebenarnya ditampilkan.
# Ditambahkan `mcCodesInArea` = union District dari SEMUA Depo di Area
# aktif (bukan cuma 1 Depo terpilih), dipakai KHUSUS di header Langkah 1.
# `mcCodesInDepo` sendiri TIDAK diubah/dihapus - tetap dipakai apa
# adanya utk Langkah 3 (Marketing Cost) & `sdmRowReadOnly`, yg memang
# scope-nya per-Depo terpilih (bukan per-Area).
old_mccodes = "  const mcCodesInDepo = useMemo(() => mcListInSelectedDepo.map((m) => m.mc).sort(), [mcListInSelectedDepo]);"
new_mccodes = """  const mcCodesInDepo = useMemo(() => mcListInSelectedDepo.map((m) => m.mc).sort(), [mcListInSelectedDepo]);
  // Union District dari SEMUA Depo di Area aktif (linear dgn tabel
  // "Level Depo" Langkah 1 yg juga menampilkan semua Depo di Area ini).
  const mcCodesInArea = useMemo(() => {
    const depoIds = new Set(depos.map((dp) => dp.id));
    const mcIds = new Set((depoMcRows || []).filter((r) => depoIds.has(r.depo_id)).map((r) => r.mc));
    return mcList.filter((m) => mcIds.has(m.mc)).map((m) => m.mc).sort();
  }, [depos, depoMcRows, mcList]);"""
do(old_mccodes, new_mccodes, 1, "tambah mcCodesInArea")

do(
    '''                region={currentRegion} area={contextBranch}
                areaOptions={areaOptions} onAreaChange={editable ? onAreaChange : undefined}
                mcs={mcCodesInDepo}
                totalLabel="Total OPEX + Cost of Money"''',
    '''                region={currentRegion} area={contextBranch}
                areaOptions={areaOptions} onAreaChange={editable ? onAreaChange : undefined}
                mcs={mcCodesInArea}
                totalLabel="Total OPEX + Cost of Money"''',
    1, "Langkah1 StepHeroDepo mcs -> mcCodesInArea",
)

open(p, "w").write(S["s"])
print("DISTRICTAREA_OK")
