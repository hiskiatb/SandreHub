p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# FIX (permintaan user - "sama untuk ini juga harusnya semua district"):
# header Langkah 3 (Marketing Cost) masih pakai `mcControl` (1 dropdown
# pilih 1 District saja, + teks "District" dobel krn ScopeSelector-nya
# jg punya label sendiri), padahal section "Level MC" di bawahnya SUDAH
# menampilkan SEMUA District yg ada di Depo terpilih sekaligus (sama
# spt Langkah 1 Depo). Supaya linear/konsisten, `mcControl` dihapus -
# header jatuh balik ke daftar chip SEMUA District (prop `mcs`, sudah
# terisi `mcCodesInDepo` = semua District di Depo yg lagi aktif), sama
# persis pola di Langkah 1. `selectedMc`/ScopeSelector District itu
# sendiri TIDAK dihapus dari file - tetap dipakai Langkah 4 (Review)
# yg masih butuh 1 District terpilih.
do(
    '''                mcs={mcCodesInDepo}
                mcControl={<ScopeSelector label="District" value={selectedMc} onChange={setSelectedMc} options={mcOptions} t={t} compact />}
                totalLabel="Total Marketing Cost"''',
    '''                mcs={mcCodesInDepo}
                totalLabel="Total Marketing Cost"''',
    1, "Langkah3 StepHeroDepo: hapus mcControl, pakai chip semua District",
)

open(p, "w").write(S["s"])
print("DISTRICT3_OK")
