path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# BARU (permintaan user - "buat dengan versi terbaik dan profesional"):
# dibanding nebak/hitung total baris di depan (itu butuh query count()
# lintas banyak tanggal yg JUSTRU bisa balikin lagi ke masalah statement
# timeout yg baru diperbaiki), pola yg lazim dipakai produk2 serius
# (Google Takeout, Stripe export, dsb) utk export besar yg jumlah
# barisnya ga bisa diprediksi murah: tampilkan LIVE COUNTER baris yg
# UDAH kebawa sejauh ini, bukan cuma persentase tanggal yg diproses -
# user tetap dapat sinyal progress yg jujur & real-time tanpa nambah
# resiko query mahal baru.
do(
    '  const [exportProgress, setExportProgress] = useState({ active: false, label: "", current: 0, total: 0 });\n',
    '  const [exportProgress, setExportProgress] = useState({ active: false, label: "", current: 0, total: 0, rows: null });\n',
    label="state exportProgress tambah field rows",
)

do(
    '      setExportProgress({ active: true, label: "Mengambil data harian...", current: 0, total: rangeDates.length });\n',
    '      setExportProgress({ active: true, label: "Mengambil data harian...", current: 0, total: rangeDates.length, rows: 0 });\n',
    label="init progress rows=0",
)

do(
    '        setExportProgress({ active: true, label: "Mengambil data harian...", current: Math.min(bi + BATCH_DATES, rangeDates.length), total: rangeDates.length });\n',
    '        setExportProgress({ active: true, label: "Mengambil data harian...", current: Math.min(bi + BATCH_DATES, rangeDates.length), total: rangeDates.length, rows: allRows.length });\n',
    label="update progress rows per batch",
)

# Overlay: tampilkan live row counter (format ribuan, id-ID) persis di
# bawah progress bar tanggal, kalau field rows ada isinya (bukan null).
do(
    '            {exportProgress.total > 0 && (\n'
    '              <div style={{ width: "100%" }}>\n'
    '                <div style={{ width: "100%", height: 7, borderRadius: 999, background: t.sub, overflow: "hidden" }}>\n'
    '                  <div style={{ width: `${Math.min(100, Math.round((exportProgress.current / exportProgress.total) * 100))}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${t.teal}, #22d3ee)`, transition: "width 0.25s ease" }} />\n'
    '                </div>\n'
    '                <div style={{ fontSize: 10.5, color: t.lo, textAlign: "center", marginTop: 6 }}>{exportProgress.current} / {exportProgress.total}</div>\n'
    '              </div>\n'
    '            )}\n',

    '            {exportProgress.total > 0 && (\n'
    '              <div style={{ width: "100%" }}>\n'
    '                <div style={{ width: "100%", height: 7, borderRadius: 999, background: t.sub, overflow: "hidden" }}>\n'
    '                  <div style={{ width: `${Math.min(100, Math.round((exportProgress.current / exportProgress.total) * 100))}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${t.teal}, #22d3ee)`, transition: "width 0.25s ease" }} />\n'
    '                </div>\n'
    '                <div style={{ fontSize: 10.5, color: t.lo, textAlign: "center", marginTop: 6 }}>{exportProgress.current} / {exportProgress.total}</div>\n'
    '                {/* BARU: live counter baris yg udah kebawa sejauh ini -\n'
    '                    pola export data besar di produk serius (Google\n'
    '                    Takeout, dsb), jujur nunjukin progress real tanpa\n'
    '                    nebak total (nebak total butuh query count() lebar\n'
    '                    yg berisiko timeout lagi). */}\n'
    '                {exportProgress.rows != null && (\n'
    '                  <div style={{ fontSize: 11, fontWeight: 700, color: t.teal, textAlign: "center", marginTop: 8 }}>\n'
    '                    {exportProgress.rows.toLocaleString("id-ID")} baris terambil\n'
    '                  </div>\n'
    '                )}\n'
    '              </div>\n'
    '            )}\n',
    label="overlay tampilkan live row counter",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - live row counter ditambahkan ke progress export data harian")
