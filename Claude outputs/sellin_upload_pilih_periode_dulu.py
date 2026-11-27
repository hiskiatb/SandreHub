path = "app/dashboard/components/AdminDseSellinCompare.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# BARU (permintaan user - "untuk data pembanding sebelum upload harusnya
# pilih periode dulu"): sebelumnya periode upload cuma DITEBAK dari nama
# sheet di file Excel (periodFromSheetName), user ga pernah secara
# eksplisit milih mau upload utk periode apa - rawan salah upload file utk
# bulan yg beda tanpa sadar. Sekarang ditambah dropdown pilih periode yg
# WAJIB diisi SEBELUM upload file, & begitu file ke-parse, periode yg
# kedetect dari file DICOCOKKAN ke periode yg dipilih user - kalau beda,
# upload ditolak dgn pesan jelas (bukan diam2 kepake periode dari file).
do(
    'export default function AdminDseSellinCompare({ theme, onUploaded }) {\n'
    '  const d = theme === "dark";\n'
    '  const t = useMemo(() => mk(d), [d]);\n'
    '\n'
    '  // ── State periode/data TERSIMPAN (dari database - tampilan final) ──\n'
    '  const [period, setPeriod] = useState("");\n',

    'export default function AdminDseSellinCompare({ theme, onUploaded, initialPeriod }) {\n'
    '  const d = theme === "dark";\n'
    '  const t = useMemo(() => mk(d), [d]);\n'
    '\n'
    '  // BARU: periode yg WAJIB dipilih user dulu SEBELUM upload file -\n'
    '  // default ikut periode yg lagi dibuka di layar (initialPeriod), tapi\n'
    '  // tetap bisa diganti user kalau mau upload utk bulan lain.\n'
    '  const todayPeriod = () => new Date().toISOString().slice(0, 7);\n'
    '  const [selectedPeriod, setSelectedPeriod] = useState(() => initialPeriod || todayPeriod());\n'
    '\n'
    '  // ── State periode/data TERSIMPAN (dari database - tampilan final) ──\n'
    '  const [period, setPeriod] = useState("");\n',
    label="tambah state selectedPeriod + param initialPeriod",
)

do(
    '      const p = periodFromSheetName(im3SheetName || tidSheetName);\n'
    '      if (!p) throw new Error("Tidak bisa membaca periode (YYYYMM) dari nama sheet.");\n',

    '      const p = periodFromSheetName(im3SheetName || tidSheetName);\n'
    '      if (!p) throw new Error("Tidak bisa membaca periode (YYYYMM) dari nama sheet.");\n'
    '      // BARU: cocokkan periode yg kedetect dari file ke periode yg\n'
    '      // sudah dipilih user di dropdown SEBELUM upload - kalau beda,\n'
    '      // tolak (jangan diam2 pakai periode dari file).\n'
    '      if (p !== selectedPeriod) {\n'
    '        const pLabel = `${MONTHS_ID[parseInt(p.slice(5, 7), 10) - 1]} ${p.slice(0, 4)}`;\n'
    '        const selLabel = `${MONTHS_ID[parseInt(selectedPeriod.slice(5, 7), 10) - 1]} ${selectedPeriod.slice(0, 4)}`;\n'
    '        throw new Error(`File ini isinya data periode ${pLabel}, tapi periode yg dipilih di atas ${selLabel}. Samakan dulu periodenya, atau ganti pilihan periode ke ${pLabel}.`);\n'
    '      }\n',
    label="validasi periode file vs selectedPeriod",
)

# UI: dropdown pilih periode, ditaruh di atas tombol "Upload File Excel" -
# input file ikut di-disable kalau belum ada periode kepilih (jaga2, walau
# default udah keisi).
do(
    '        <label style={{\n'
    '          display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderRadius: 10,\n'
    '          background: busy ? t.sub : "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)", color: busy ? t.mid : "#fff",\n'
    '          fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap",\n'
    '        }}>\n'
    '          {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}\n'
    '          {busy ? "Memproses..." : "Upload File Excel"}\n'
    '          <input type="file" accept=".xlsx,.xls" disabled={busy} style={{ display: "none" }}\n'
    '            onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }} />\n'
    '        </label>\n'
    '      </div>\n',

    '        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>\n'
    '          {/* BARU (permintaan user - "sebelum upload harusnya pilih\n'
    '              periode dulu"): dropdown periode WAJIB dipilih dulu -\n'
    '              periode file yg di-upload nanti dicocokkan ke sini. */}\n'
    '          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>\n'
    '            <span style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3 }}>Periode Upload</span>\n'
    '            <select value={selectedPeriod} disabled={busy} onChange={(e) => setSelectedPeriod(e.target.value)}\n'
    '              style={{ height: 40, padding: "0 10px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.sub, color: t.hi, fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: busy ? "default" : "pointer" }}>\n'
    '              {Array.from({ length: 18 }, (_, i) => {\n'
    '                const dt = new Date(); dt.setMonth(dt.getMonth() - 12 + i);\n'
    '                const v = dt.toISOString().slice(0, 7);\n'
    '                const label = `${MONTHS_ID[dt.getMonth()]} ${dt.getFullYear()}`;\n'
    '                return <option key={v} value={v}>{label}</option>;\n'
    '              })}\n'
    '            </select>\n'
    '          </div>\n'
    '          <label style={{\n'
    '            display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderRadius: 10,\n'
    '            background: busy ? t.sub : "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)", color: busy ? t.mid : "#fff",\n'
    '            fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap",\n'
    '          }}>\n'
    '            {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}\n'
    '            {busy ? "Memproses..." : "Upload File Excel"}\n'
    '            <input type="file" accept=".xlsx,.xls" disabled={busy} style={{ display: "none" }}\n'
    '              onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ""; }} />\n'
    '          </label>\n'
    '        </div>\n'
    '      </div>\n',
    label="UI dropdown periode upload",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - periode upload sekarang wajib dipilih dulu & divalidasi vs periode di file")
