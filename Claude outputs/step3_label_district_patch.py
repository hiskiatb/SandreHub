p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# FIX (permintaan user - "dan perbaiki harusnya level district (MC)"):
# label section Langkah 3 masih "Level MC", padahal istilah yg dipakai
# konsisten di tempat lain (header "District", label SDM_LEVEL_LABEL.mc)
# adalah "Level District (MC)". Disamakan.
do(
    '<SecLabel t={t}>Level MC <span style={{ fontWeight: 500, color: t.lo }}>— {depos.find((dp) => dp.id === selectedDepoId)?.depo_name || "Depo ini"} ({mcCodesInDepo.length})</span></SecLabel>',
    '<SecLabel t={t}>Level District (MC) <span style={{ fontWeight: 500, color: t.lo }}>— {depos.find((dp) => dp.id === selectedDepoId)?.depo_name || "Depo ini"} ({mcCodesInDepo.length})</span></SecLabel>',
    1, "Langkah3 label Level MC -> Level District (MC)",
)

open(p, "w").write(S["s"])
print("LABEL3_OK")
