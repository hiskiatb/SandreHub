path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# FIX (keluhan user - "kenapa saat di excel ditotal dia tidak balance,
# penjualan sp + voucher + saldo tidak balance dengan total penjualan excl
# fwa"): root cause - di LEVEL DSE, kolom "Penjualan SP/Voucher/Saldo" yg
# ditampilkan itu total SATU BULAN PENUH (x.nilaiSp dst), sedangkan kolom
# "Total Penjualan Excl FWA" yg disebelahnya itu DIBATASI sampai tanggal
# as-of upload Sell-in (x.totalExclFwaAsOf) - dua basis angka yg BEDA,
# makanya SP+Voucher+Saldo (basis sebulan penuh) ga pernah sama dgn Total
# (basis dibatasi as-of). Ini beda dgn level rollup (Partner/Region/Area/
# District) yg sudah BENER dari awal - di situ SP/Voucher/Saldo YANG
# DITAMPILKAN juga ikut dibatasi as-of (pakai asOfSp/asOfVoucher/asOfSaldo),
# jadi otomatis balance sama Total-nya.
# Fix: fetchDseLevelForExport sekarang itung as-of PER METRIK (asOfSp/
# asOfVoucher/asOfSaldo per DSE, bukan cuma dijumlah jadi 1 angka total),
# lalu kolom Penjualan SP/Voucher/Saldo di export (saat ada data
# pembanding) PAKAI angka as-of ini juga - SAMA PERSIS pola level rollup -
# supaya SP+Voucher+Saldo = Total Excl FWA, selalu balance.
do(
    '    let appAsOfByCode = {};\n'
    '    const capturedAsOf = hasUpload ? Object.values(uploadByCode)[0]?.as_of_dt : null;\n'
    '    if (hasUpload && capturedAsOf != null) {\n'
    '      const startISO = `${uploadPeriod}-01`;\n'
    '      const endISO = `${uploadPeriod}-${String(capturedAsOf).padStart(2, "0")}`;\n'
    '      const arRows = await fetchProdArPaged(codes, datesBetween(startISO, endISO), "dse_code, nilai_sp, nilai_voucher, nilai_saldo");\n'
    '      arRows.forEach((p) => {\n'
    '        const a = appAsOfByCode[p.dse_code] || (appAsOfByCode[p.dse_code] = 0);\n'
    '        appAsOfByCode[p.dse_code] = a + fRaw(p.nilai_sp) + fRaw(p.nilai_voucher) + fRaw(p.nilai_saldo);\n'
    '      });\n'
    '    }\n'
    '    const rows = (dses || []).map((r) => {\n'
    '      const n = byCode[r.dse_code];\n'
    '      const u = uploadByCode[r.dse_code];\n'
    '      const uploadTotal = u ? (fRaw(u.sellin_sp) + fRaw(u.sellin_vou) + fRaw(u.sellin_saldo)) : null;\n'
    '      const totalPenjualan = n.nilaiSp + n.nilaiFwa + n.nilaiVoucher + n.nilaiSaldo;\n'
    '      const totalExclFwaAsOf = hasUpload && u ? (appAsOfByCode[r.dse_code] ?? (n.nilaiSp + n.nilaiVoucher + n.nilaiSaldo)) : null;\n'
    '      return {\n'
    '        dse_code: r.dse_code, partner: r.mdi || "", region: r.region || "", branch: r.branch || "", mc: r.mc || "", nama: r.ds_name || "", status: r.dse_status || "",\n'
    '        nilaiSp: n.nilaiSp, nilaiFwa: n.nilaiFwa, nilaiVoucher: n.nilaiVoucher, nilaiSaldo: n.nilaiSaldo, totalPenjualan,\n'
    '        hasUpload, uploadTotal,\n'
    '        sellinSp: u ? fRaw(u.sellin_sp) : null, sellinVou: u ? fRaw(u.sellin_vou) : null, sellinSaldo: u ? fRaw(u.sellin_saldo) : null,\n'
    '        totalExclFwaAsOf,\n'
    '        selisih: hasUpload && u ? (totalExclFwaAsOf - uploadTotal) : null,\n'
    '      };\n'
    '    }).sort((a, b) => b.totalPenjualan - a.totalPenjualan);\n',

    '    let asOfSpByCode = {}, asOfVouByCode = {}, asOfSaldoByCode = {};\n'
    '    const capturedAsOf = hasUpload ? Object.values(uploadByCode)[0]?.as_of_dt : null;\n'
    '    if (hasUpload && capturedAsOf != null) {\n'
    '      const startISO = `${uploadPeriod}-01`;\n'
    '      const endISO = `${uploadPeriod}-${String(capturedAsOf).padStart(2, "0")}`;\n'
    '      const arRows = await fetchProdArPaged(codes, datesBetween(startISO, endISO), "dse_code, nilai_sp, nilai_voucher, nilai_saldo");\n'
    '      arRows.forEach((p) => {\n'
    '        asOfSpByCode[p.dse_code] = (asOfSpByCode[p.dse_code] || 0) + fRaw(p.nilai_sp);\n'
    '        asOfVouByCode[p.dse_code] = (asOfVouByCode[p.dse_code] || 0) + fRaw(p.nilai_voucher);\n'
    '        asOfSaldoByCode[p.dse_code] = (asOfSaldoByCode[p.dse_code] || 0) + fRaw(p.nilai_saldo);\n'
    '      });\n'
    '    }\n'
    '    const rows = (dses || []).map((r) => {\n'
    '      const n = byCode[r.dse_code];\n'
    '      const u = uploadByCode[r.dse_code];\n'
    '      const uploadTotal = u ? (fRaw(u.sellin_sp) + fRaw(u.sellin_vou) + fRaw(u.sellin_saldo)) : null;\n'
    '      const totalPenjualan = n.nilaiSp + n.nilaiFwa + n.nilaiVoucher + n.nilaiSaldo;\n'
    '      // BARU (fix "ga balance di excel"): SP/Voucher/Saldo yg DITAMPILKAN\n'
    '      // di kolom pembanding dibatasi as-of juga (SAMA kayak Total-nya),\n'
    '      // bukan total sebulan penuh - biar SP+Voucher+Saldo = Total Excl FWA.\n'
    '      const asOfSp = hasUpload && u ? (asOfSpByCode[r.dse_code] ?? n.nilaiSp) : null;\n'
    '      const asOfVoucher = hasUpload && u ? (asOfVouByCode[r.dse_code] ?? n.nilaiVoucher) : null;\n'
    '      const asOfSaldo = hasUpload && u ? (asOfSaldoByCode[r.dse_code] ?? n.nilaiSaldo) : null;\n'
    '      const totalExclFwaAsOf = hasUpload && u ? (asOfSp + asOfVoucher + asOfSaldo) : null;\n'
    '      return {\n'
    '        dse_code: r.dse_code, partner: r.mdi || "", region: r.region || "", branch: r.branch || "", mc: r.mc || "", nama: r.ds_name || "", status: r.dse_status || "",\n'
    '        nilaiSp: n.nilaiSp, nilaiFwa: n.nilaiFwa, nilaiVoucher: n.nilaiVoucher, nilaiSaldo: n.nilaiSaldo, totalPenjualan,\n'
    '        hasUpload, uploadTotal,\n'
    '        asOfSp, asOfVoucher, asOfSaldo,\n'
    '        sellinSp: u ? fRaw(u.sellin_sp) : null, sellinVou: u ? fRaw(u.sellin_vou) : null, sellinSaldo: u ? fRaw(u.sellin_saldo) : null,\n'
    '        totalExclFwaAsOf,\n'
    '        selisih: hasUpload && u ? (totalExclFwaAsOf - uploadTotal) : null,\n'
    '      };\n'
    '    }).sort((a, b) => b.totalPenjualan - a.totalPenjualan);\n',
    label="fetchDseLevelForExport pecah as-of per metrik",
)

# Site 3 (handleExportFullXlsx - sheet DSE): kolom Penjualan SP/Voucher/
# Saldo di mode compare sekarang pakai angka as-of (x.asOfSp dst) biar
# balance sama Total, SAMA PERSIS kolom Sell-in-nya yg juga as-of.
do(
    '      const bodyDse = dseRows.map((x, i) => includeCompare ? [\n'
    '        i + 1, x.dse_code, x.partner, x.region, x.branch, x.mc, x.nama, x.status,\n'
    '        x.nilaiSp, x.hasUpload && x.sellinSp != null ? x.sellinSp : "",\n'
    '        x.nilaiVoucher, x.hasUpload && x.sellinVou != null ? x.sellinVou : "",\n'
    '        x.nilaiSaldo, x.hasUpload && x.sellinSaldo != null ? x.sellinSaldo : "",\n'
    '        x.hasUpload ? (x.totalExclFwaAsOf ?? (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo)) : (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo),\n'
    '        x.hasUpload ? (x.uploadTotal ?? "") : "",\n'
    '        x.hasUpload ? (x.selisih ?? "") : "",\n'
    '      ] : [\n',

    '      const bodyDse = dseRows.map((x, i) => includeCompare ? [\n'
    '        i + 1, x.dse_code, x.partner, x.region, x.branch, x.mc, x.nama, x.status,\n'
    '        x.hasUpload ? (x.asOfSp ?? x.nilaiSp) : x.nilaiSp, x.hasUpload && x.sellinSp != null ? x.sellinSp : "",\n'
    '        x.hasUpload ? (x.asOfVoucher ?? x.nilaiVoucher) : x.nilaiVoucher, x.hasUpload && x.sellinVou != null ? x.sellinVou : "",\n'
    '        x.hasUpload ? (x.asOfSaldo ?? x.nilaiSaldo) : x.nilaiSaldo, x.hasUpload && x.sellinSaldo != null ? x.sellinSaldo : "",\n'
    '        x.hasUpload ? (x.totalExclFwaAsOf ?? (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo)) : (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo),\n'
    '        x.hasUpload ? (x.uploadTotal ?? "") : "",\n'
    '        x.hasUpload ? (x.selisih ?? "") : "",\n'
    '      ] : [\n',
    label="site3 bodyDse pakai asOf per metrik",
)

# Site 5 (handleExportSellinXlsx - roster DSE "Export Tampilan Saat Ini"):
# bug yg SAMA PERSIS - fix dgn pola yg SAMA (pecah as-of per metrik).
do(
    '        let appAsOfByCode = {};\n'
    '        const capturedAsOf = hasUpload ? Object.values(uploadByCode)[0]?.as_of_dt : null;\n'
    '        if (hasUpload && capturedAsOf != null) {\n'
    '          const startISO = `${uploadPeriod}-01`;\n'
    '          const endISO = `${uploadPeriod}-${String(capturedAsOf).padStart(2, "0")}`;\n'
    '          const arRows = await fetchProdArPaged(codes, datesBetween(startISO, endISO), "dse_code, nilai_sp, nilai_voucher, nilai_saldo");\n'
    '          arRows.forEach((p) => {\n'
    '            const a = appAsOfByCode[p.dse_code] || (appAsOfByCode[p.dse_code] = 0);\n'
    '            appAsOfByCode[p.dse_code] = a + fRaw(p.nilai_sp) + fRaw(p.nilai_voucher) + fRaw(p.nilai_saldo);\n'
    '          });\n'
    '        }\n',

    '        let asOfSpByCode = {}, asOfVouByCode = {}, asOfSaldoByCode = {};\n'
    '        const capturedAsOf = hasUpload ? Object.values(uploadByCode)[0]?.as_of_dt : null;\n'
    '        if (hasUpload && capturedAsOf != null) {\n'
    '          const startISO = `${uploadPeriod}-01`;\n'
    '          const endISO = `${uploadPeriod}-${String(capturedAsOf).padStart(2, "0")}`;\n'
    '          const arRows = await fetchProdArPaged(codes, datesBetween(startISO, endISO), "dse_code, nilai_sp, nilai_voucher, nilai_saldo");\n'
    '          arRows.forEach((p) => {\n'
    '            asOfSpByCode[p.dse_code] = (asOfSpByCode[p.dse_code] || 0) + fRaw(p.nilai_sp);\n'
    '            asOfVouByCode[p.dse_code] = (asOfVouByCode[p.dse_code] || 0) + fRaw(p.nilai_voucher);\n'
    '            asOfSaldoByCode[p.dse_code] = (asOfSaldoByCode[p.dse_code] || 0) + fRaw(p.nilai_saldo);\n'
    '          });\n'
    '        }\n',
    label="site5 pecah as-of per metrik",
)

do(
    '          const uploadTotal = u ? (fRaw(u.sellin_sp) + fRaw(u.sellin_vou) + fRaw(u.sellin_saldo)) : null;\n'
    '          const totalExclFwaAsOf = hasUpload && u ? (appAsOfByCode[x.r.dse_code] ?? (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo)) : null;\n'
    '          return [\n'
    '            i + 1, x.r.dse_code, x.partnerVal || "", x.regionVal || "", x.branchVal || "", x.mcVal || "", x.namaVal || "", x.statusVal || "",\n'
    '            x.nilaiSp, hasUpload && u ? fRaw(u.sellin_sp) : "",\n'
    '            x.nilaiVoucher, hasUpload && u ? fRaw(u.sellin_vou) : "",\n'
    '            x.nilaiSaldo, hasUpload && u ? fRaw(u.sellin_saldo) : "",\n'
    '            hasUpload ? (totalExclFwaAsOf ?? (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo)) : (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo),\n'
    '            hasUpload ? (uploadTotal ?? "") : "",\n'
    '            hasUpload && u ? (totalExclFwaAsOf - uploadTotal) : "",\n'
    '          ];\n',

    '          const uploadTotal = u ? (fRaw(u.sellin_sp) + fRaw(u.sellin_vou) + fRaw(u.sellin_saldo)) : null;\n'
    '          // BARU (fix "ga balance di excel"): SP/Voucher/Saldo yg\n'
    '          // DITAMPILKAN dibatasi as-of juga (SAMA kayak Total-nya), bukan\n'
    '          // total sebulan penuh - biar SP+Voucher+Saldo = Total Excl FWA.\n'
    '          const asOfSp = hasUpload && u ? (asOfSpByCode[x.r.dse_code] ?? x.nilaiSp) : null;\n'
    '          const asOfVoucher = hasUpload && u ? (asOfVouByCode[x.r.dse_code] ?? x.nilaiVoucher) : null;\n'
    '          const asOfSaldo = hasUpload && u ? (asOfSaldoByCode[x.r.dse_code] ?? x.nilaiSaldo) : null;\n'
    '          const totalExclFwaAsOf = hasUpload && u ? (asOfSp + asOfVoucher + asOfSaldo) : null;\n'
    '          return [\n'
    '            i + 1, x.r.dse_code, x.partnerVal || "", x.regionVal || "", x.branchVal || "", x.mcVal || "", x.namaVal || "", x.statusVal || "",\n'
    '            hasUpload && u ? asOfSp : x.nilaiSp, hasUpload && u ? fRaw(u.sellin_sp) : "",\n'
    '            hasUpload && u ? asOfVoucher : x.nilaiVoucher, hasUpload && u ? fRaw(u.sellin_vou) : "",\n'
    '            hasUpload && u ? asOfSaldo : x.nilaiSaldo, hasUpload && u ? fRaw(u.sellin_saldo) : "",\n'
    '            hasUpload ? (totalExclFwaAsOf ?? (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo)) : (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo),\n'
    '            hasUpload ? (uploadTotal ?? "") : "",\n'
    '            hasUpload && u ? (totalExclFwaAsOf - uploadTotal) : "",\n'
    '          ];\n',
    label="site5 body pakai asOf per metrik",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - level DSE sekarang balance (SP+Voucher+Saldo = Total Excl FWA) di 'Download Lengkap'")
