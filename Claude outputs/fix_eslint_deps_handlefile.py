path = "app/dashboard/components/AdminDseSellinCompare.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# FIX eslint warning baru (react-hooks/exhaustive-deps) - handleFile
# sekarang baca selectedPeriod (buat validasi periode file vs pilihan
# user), jadi harus masuk dependency array useCallback-nya.
do(
    '      setErr(e.message || "Gagal membaca file.");\n'
    '      setParsing(false);\n'
    '      setProgress("");\n'
    '    }\n'
    '  }, []);\n',
    '      setErr(e.message || "Gagal membaca file.");\n'
    '      setParsing(false);\n'
    '      setProgress("");\n'
    '    }\n'
    '  }, [selectedPeriod]);\n',
    label="handleFile deps tambah selectedPeriod",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - dependency array handleFile diperbaiki")
