path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# 1) Tambah state baru: per-metrik as-of map (SP/Voucher/Saldo terpisah),
# supaya kolom Penjualan SP/Voucher/Saldo di layar bisa ikut tanggal
# pembanding (bukan cuma total gabungan yg sudah ada).
do(
    '  const [sellinAppAsOfByDseCode, setSellinAppAsOfByDseCode] = useState({});\n',
    '  const [sellinAppAsOfByDseCode, setSellinAppAsOfByDseCode] = useState({});\n'
    '  // BARU (permintaan user - "tanggal penjualan sp voucher dan saldo\n'
    '  // mengikuti tanggal pembanding saja"): map per-metrik (terpisah dari\n'
    '  // total gabungan di atas) supaya kolom SP/Voucher/Saldo di layar bisa\n'
    '  // ikut dibatasi ke tanggal as-of pembanding, sama seperti kolom Total.\n'
    '  const [sellinAppAsOfSpByDseCode, setSellinAppAsOfSpByDseCode] = useState({});\n'
    '  const [sellinAppAsOfVouByDseCode, setSellinAppAsOfVouByDseCode] = useState({});\n'
    '  const [sellinAppAsOfSaldoByDseCode, setSellinAppAsOfSaldoByDseCode] = useState({});\n',
    label="tambah state per-metrik asOf",
)

# 2) Reset branch di useEffect - reset state baru juga
do(
    '      setSellinUploadByDseCode({});\n'
    '      setSellinUploadRosterAvailable(false);\n'
    '      setSellinUploadRosterAsOfDt(null);\n'
    '      setSellinAppAsOfByDseCode({});\n'
    '      return;\n',
    '      setSellinUploadByDseCode({});\n'
    '      setSellinUploadRosterAvailable(false);\n'
    '      setSellinUploadRosterAsOfDt(null);\n'
    '      setSellinAppAsOfByDseCode({});\n'
    '      setSellinAppAsOfSpByDseCode({});\n'
    '      setSellinAppAsOfVouByDseCode({});\n'
    '      setSellinAppAsOfSaldoByDseCode({});\n'
    '      return;\n',
    label="reset state per-metrik asOf",
)

# 3) Ganti query arRows (unpaginated gte/lte - rawan statement timeout,
# bug class yg sama yg sudah diperbaiki di export) dgn fetchProdArPaged +
# datesBetween (per-tanggal, paralel), SEKALIAN pecah akumulasi jadi
# per-metrik (bukan 1 total gabungan) supaya SP/Voucher/Saldo di layar
# balance dgn Total persis seperti behaviour export yg baru diperbaiki.
do(
    '      let appAsOfMap = {};\n'
    '      if (capturedAsOf != null) {\n'
    '        const startISO = `${uploadPeriod}-01`;\n'
    '        const endISO = `${uploadPeriod}-${String(capturedAsOf).padStart(2, "0")}`;\n'
    '        for (let i = 0; i < codes.length; i += UP_CHUNK) {\n'
    '          const chunk = codes.slice(i, i + UP_CHUNK);\n'
    '          const { data: arRows, error: eAr } = await supabase\n'
    '            .from("mf_dse_prod_ar")\n'
    '            .select("dse_code, nilai_sp, nilai_voucher, nilai_saldo")\n'
    '            .in("dse_code", chunk).gte("tanggal", startISO).lte("tanggal", endISO);\n'
    '          if (eAr) { console.error("gagal muat mf_dse_prod_ar (as of upload, level DSE):", eAr); continue; }\n'
    '          (arRows || []).forEach((p) => {\n'
    '            const a = appAsOfMap[p.dse_code] || (appAsOfMap[p.dse_code] = 0);\n'
    '            appAsOfMap[p.dse_code] = a + fRaw(p.nilai_sp) + fRaw(p.nilai_voucher) + fRaw(p.nilai_saldo);\n'
    '          });\n'
    '        }\n'
    '      }\n'
    '      if (cancelled) return;\n'
    '      setSellinUploadByDseCode(map);\n'
    '      setSellinUploadRosterAvailable(anyRow);\n'
    '      setSellinUploadRosterAsOfDt(capturedAsOf);\n'
    '      setSellinAppAsOfByDseCode(appAsOfMap);\n',

    '      let appAsOfMap = {};\n'
    '      let appAsOfSpMap = {};\n'
    '      let appAsOfVouMap = {};\n'
    '      let appAsOfSaldoMap = {};\n'
    '      if (capturedAsOf != null) {\n'
    '        const startISO = `${uploadPeriod}-01`;\n'
    '        const endISO = `${uploadPeriod}-${String(capturedAsOf).padStart(2, "0")}`;\n'
    '        // Query per-tanggal + paralel (fetchProdArPaged) - bukan gte/lte\n'
    '        // lebar langsung, supaya tidak kena statement timeout gara2\n'
    '        // biaya evaluasi RLS yg membengkak di range tanggal lebar.\n'
    '        const arRows = await fetchProdArPaged(codes, datesBetween(startISO, endISO), "dse_code, nilai_sp, nilai_voucher, nilai_saldo");\n'
    '        (arRows || []).forEach((p) => {\n'
    '          const sp = fRaw(p.nilai_sp), vou = fRaw(p.nilai_voucher), sal = fRaw(p.nilai_saldo);\n'
    '          appAsOfMap[p.dse_code] = (appAsOfMap[p.dse_code] || 0) + sp + vou + sal;\n'
    '          appAsOfSpMap[p.dse_code] = (appAsOfSpMap[p.dse_code] || 0) + sp;\n'
    '          appAsOfVouMap[p.dse_code] = (appAsOfVouMap[p.dse_code] || 0) + vou;\n'
    '          appAsOfSaldoMap[p.dse_code] = (appAsOfSaldoMap[p.dse_code] || 0) + sal;\n'
    '        });\n'
    '      }\n'
    '      if (cancelled) return;\n'
    '      setSellinUploadByDseCode(map);\n'
    '      setSellinUploadRosterAvailable(anyRow);\n'
    '      setSellinUploadRosterAsOfDt(capturedAsOf);\n'
    '      setSellinAppAsOfByDseCode(appAsOfMap);\n'
    '      setSellinAppAsOfSpByDseCode(appAsOfSpMap);\n'
    '      setSellinAppAsOfVouByDseCode(appAsOfVouMap);\n'
    '      setSellinAppAsOfSaldoByDseCode(appAsOfSaldoMap);\n',
    label="ganti query arRows jadi per-tanggal paralel + pecah per-metrik",
)

# 4) Teruskan map baru ke DseInputRow (2 titik pemanggilan)
do(
    '                  sellinUpload={sellinUploadByDseCode[dse.dse_code]}\n'
    '                  sellinUploadAvailable={sellinUploadRosterAvailable}\n'
    '                  sellinAppAsOfTotal={sellinAppAsOfByDseCode[dse.dse_code]}\n',
    '                  sellinUpload={sellinUploadByDseCode[dse.dse_code]}\n'
    '                  sellinUploadAvailable={sellinUploadRosterAvailable}\n'
    '                  sellinAppAsOfTotal={sellinAppAsOfByDseCode[dse.dse_code]}\n'
    '                  sellinAppAsOfSp={sellinAppAsOfSpByDseCode[dse.dse_code]}\n'
    '                  sellinAppAsOfVou={sellinAppAsOfVouByDseCode[dse.dse_code]}\n'
    '                  sellinAppAsOfSaldo={sellinAppAsOfSaldoByDseCode[dse.dse_code]}\n',
    label="teruskan prop baru ke DseInputRow (card view)",
)
do(
    '                        sellinUpload={sellinUploadByDseCode[dse.dse_code]}\n'
    '                        sellinUploadAvailable={sellinUploadRosterAvailable}\n'
    '                        sellinAppAsOfTotal={sellinAppAsOfByDseCode[dse.dse_code]}\n',
    '                        sellinUpload={sellinUploadByDseCode[dse.dse_code]}\n'
    '                        sellinUploadAvailable={sellinUploadRosterAvailable}\n'
    '                        sellinAppAsOfTotal={sellinAppAsOfByDseCode[dse.dse_code]}\n'
    '                        sellinAppAsOfSp={sellinAppAsOfSpByDseCode[dse.dse_code]}\n'
    '                        sellinAppAsOfVou={sellinAppAsOfVouByDseCode[dse.dse_code]}\n'
    '                        sellinAppAsOfSaldo={sellinAppAsOfSaldoByDseCode[dse.dse_code]}\n',
    label="teruskan prop baru ke DseInputRow (table view)",
)

# 5) Signature DseInputRow - terima prop baru
do(
    'sellinUpload, sellinUploadAvailable, sellinAppAsOfTotal, compareRoster }) {',
    'sellinUpload, sellinUploadAvailable, sellinAppAsOfTotal, sellinAppAsOfSp, sellinAppAsOfVou, sellinAppAsOfSaldo, compareRoster }) {',
    label="signature DseInputRow terima prop baru",
)

# 6) Render: SP cell ikut as-of saat compare aktif & data tersedia
do(
    '          <td onClick={openPopupToTab("sp")} {...cellHoverHandlers} style={{ ...rowClickable, padding: "10px 12px", minWidth: 130, textAlign: "right", borderLeft: `2px solid ${t.line}`, background: t.redBg, fontWeight: 700, transition: "filter 0.1s, box-shadow 0.1s" }}>Rp {fmtID(e.nilai_sp)}</td>\n',
    '          <td onClick={openPopupToTab("sp")} {...cellHoverHandlers} style={{ ...rowClickable, padding: "10px 12px", minWidth: 130, textAlign: "right", borderLeft: `2px solid ${t.line}`, background: t.redBg, fontWeight: 700, transition: "filter 0.1s, box-shadow 0.1s" }}>Rp {fmtID(periodMode === "bulan" && compareRoster && sellinUploadAvailable && sellinUpload ? (sellinAppAsOfSp ?? e.nilai_sp) : e.nilai_sp)}</td>\n',
    label="SP cell ikut as-of saat compare aktif",
)

# 7) Render: Voucher cell
do(
    '          <td onClick={openPopupToTab("voucher")} {...cellHoverHandlers} style={{ ...rowClickable, padding: "10px 12px", minWidth: 130, textAlign: "right", background: t.blueBg, fontWeight: 700, transition: "filter 0.1s, box-shadow 0.1s" }}>Rp {fmtID(e.nilai_voucher)}</td>\n',
    '          <td onClick={openPopupToTab("voucher")} {...cellHoverHandlers} style={{ ...rowClickable, padding: "10px 12px", minWidth: 130, textAlign: "right", background: t.blueBg, fontWeight: 700, transition: "filter 0.1s, box-shadow 0.1s" }}>Rp {fmtID(periodMode === "bulan" && compareRoster && sellinUploadAvailable && sellinUpload ? (sellinAppAsOfVou ?? e.nilai_voucher) : e.nilai_voucher)}</td>\n',
    label="Voucher cell ikut as-of saat compare aktif",
)

# 8) Render: Saldo cell
do(
    '          <td onClick={openPopupToTab("saldo")} {...cellHoverHandlers} style={{ ...rowClickable, padding: "10px 12px", minWidth: 140, textAlign: "right", background: t.amberBg, fontWeight: 700, transition: "filter 0.1s, box-shadow 0.1s" }}>Rp {fmtID(e.nilai_saldo)}</td>\n',
    '          <td onClick={openPopupToTab("saldo")} {...cellHoverHandlers} style={{ ...rowClickable, padding: "10px 12px", minWidth: 140, textAlign: "right", background: t.amberBg, fontWeight: 700, transition: "filter 0.1s, box-shadow 0.1s" }}>Rp {fmtID(periodMode === "bulan" && compareRoster && sellinUploadAvailable && sellinUpload ? (sellinAppAsOfSaldo ?? e.nilai_saldo) : e.nilai_saldo)}</td>\n',
    label="Saldo cell ikut as-of saat compare aktif",
)

# 9) useMemo deps - tambah dependency baru biar kolom sort/filter yg
# turut memakai nilai ini (kalau ada) tetap konsisten saat data berubah.
do(
    '  }), [dseList, identity, entries, prevAr, arItemsAgg, statusEvents, sellinUploadByDseCode, sellinUploadRosterAvailable, sellinAppAsOfByDseCode]);\n',
    '  }), [dseList, identity, entries, prevAr, arItemsAgg, statusEvents, sellinUploadByDseCode, sellinUploadRosterAvailable, sellinAppAsOfByDseCode, sellinAppAsOfSpByDseCode, sellinAppAsOfVouByDseCode, sellinAppAsOfSaldoByDseCode]);\n',
    label="tambah dependency useMemo",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - SP/Voucher/Saldo di layar sekarang ikut tanggal pembanding saat compareRoster aktif")
