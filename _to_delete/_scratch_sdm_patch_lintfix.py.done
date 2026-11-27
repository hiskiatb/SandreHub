p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

do(
    '  const depoValues = depoAllValues[selectedDepoId] || {};',
    '  const depoValues = useMemo(() => depoAllValues[selectedDepoId] || {}, [depoAllValues, selectedDepoId]);',
    1, "depoValues -> stable useMemo (fix exhaustive-deps warning)",
)

open(p, "w").write(S["s"])
print("LINTFIX_OK")
