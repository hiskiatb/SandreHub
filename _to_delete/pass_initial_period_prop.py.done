path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# BARU: lempar periode yg lagi dibuka (calViewMonth) sbg default dropdown
# "Periode Upload" di modal AdminDseSellinCompare, biar nyambung sama
# konteks layar yg lagi dilihat user (tetap bisa diganti manual di modal).
do(
    '            <AdminDseSellinCompare theme={d ? "dark" : "light"} onUploaded={() => loadRegionSummary()} />\n',
    '            <AdminDseSellinCompare theme={d ? "dark" : "light"} onUploaded={() => loadRegionSummary()} initialPeriod={calViewMonth.slice(0, 7)} />\n',
    label="pass initialPeriod ke AdminDseSellinCompare",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - initialPeriod diteruskan ke modal upload")
