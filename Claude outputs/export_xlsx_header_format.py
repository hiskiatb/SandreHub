path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# BARU (permintaan user - "perbaiki semua excel hasil downloadan, header
# nya juga menginformasikan yang baik, dan rapih semua kolom isinya tidak
# terpotong, dan semua angka formatnya number tidak perlu rp tapi number"):
# helper bersama dipakai SEMUA export xlsx di file ini -
# (a) lebar kolom di-auto-fit dari panjang isi/header (ga ada kolom
#     kepotong lagi),
# (b) kolom angka diformat number asli pakai number format cell
#     "#,##0" (pemisah ribuan sesuai Excel, BUKAN string "Rp..." yg
#     nempel di angkanya) - info satuan Rp cukup taruh di teks HEADER
#     kolom, bukan di tiap sel.
do(
    '  const fetchLevelSummaryForExport = async (lvl, includeCompare) => {\n',

    '  // BARU: helper bersama semua export xlsx - auto-fit lebar kolom +\n'
    '  // format number "#,##0" (ribuan, TANPA simbol Rp) di kolom angka.\n'
    '  const buildXlsxSheet = (head, body, numericCols = []) => {\n'
    '    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);\n'
    '    ws["!freeze"] = { xSplit: 0, ySplit: 1 };\n'
    '    ws["!cols"] = head.map((h, c) => {\n'
    '      let maxLen = String(h ?? "").length;\n'
    '      body.forEach((row) => {\n'
    '        const v = row[c];\n'
    '        const len = v == null ? 0 : String(v).length;\n'
    '        if (len > maxLen) maxLen = len;\n'
    '      });\n'
    '      return { wch: Math.max(10, Math.min(maxLen + 2, 42)) };\n'
    '    });\n'
    '    const numSet = new Set(numericCols);\n'
    '    body.forEach((row, r) => {\n'
    '      numSet.forEach((c) => {\n'
    '        const addr = XLSX.utils.encode_cell({ r: r + 1, c });\n'
    '        if (ws[addr] && typeof ws[addr].v === "number") ws[addr].z = "#,##0";\n'
    '      });\n'
    '    });\n'
    '    return ws;\n'
    '  };\n\n'
    '  const fetchLevelSummaryForExport = async (lvl, includeCompare) => {\n',
    label="helper buildXlsxSheet",
)

# Site 1: handleExportDailyRange ("Data Harian")
do(
    '      const head = ["#", "Tanggal", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Penjualan SP", "Penjualan FWA", "Penjualan Voucher", "Penjualan Saldo", "Total Penjualan"];\n'
    '      const body = allRows.map((p, i) => {\n'
    '        const m = metaByCode[p.dse_code] || {};\n'
    '        const sp = fRaw(p.nilai_sp), fwa = fRaw(p.nilai_fwa), vou = fRaw(p.nilai_voucher), sal = fRaw(p.nilai_saldo);\n'
    '        return [i + 1, p.tanggal, p.dse_code, m.mdi || "", m.region || "", m.branch || "", m.mc || "", m.ds_name || "", sp, fwa, vou, sal, sp + fwa + vou + sal];\n'
    '      });\n'
    '      const ws = XLSX.utils.aoa_to_sheet([head, ...body]);\n'
    '      ws["!freeze"] = { xSplit: 0, ySplit: 1 };\n'
    '      const wb = XLSX.utils.book_new();\n'
    '      XLSX.utils.book_append_sheet(wb, ws, "Data Harian");\n',

    '      const head = ["#", "Tanggal", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)"];\n'
    '      const body = allRows.map((p, i) => {\n'
    '        const m = metaByCode[p.dse_code] || {};\n'
    '        const sp = fRaw(p.nilai_sp), fwa = fRaw(p.nilai_fwa), vou = fRaw(p.nilai_voucher), sal = fRaw(p.nilai_saldo);\n'
    '        return [i + 1, p.tanggal, p.dse_code, m.mdi || "", m.region || "", m.branch || "", m.mc || "", m.ds_name || "", sp, fwa, vou, sal, sp + fwa + vou + sal];\n'
    '      });\n'
    '      const ws = buildXlsxSheet(head, body, [8, 9, 10, 11, 12]);\n'
    '      const wb = XLSX.utils.book_new();\n'
    '      XLSX.utils.book_append_sheet(wb, ws, "Data Harian");\n',
    label="site1 Data Harian",
)

# Site 2: handleExportFullXlsx - level rollup sheets (Partner/Region/Area/District)
do(
    '        const head = ["#", label, "DSE Active", "DSE Vacant", "Penjualan SP", "Penjualan FWA", "Penjualan Voucher", "Penjualan Saldo", "Total Penjualan", ...(includeCompare ? ["Sellin Upload (SP+Vou+Saldo)", "Selisih"] : [])];\n',
    '        const head = ["#", label, "DSE Active", "DSE Vacant", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)", ...(includeCompare ? ["Sellin Upload SP+Vou+Saldo (Rp)", "Selisih (Rp)"] : [])];\n',
    label="site2 head levelDefs",
)
do(
    '        const ws = XLSX.utils.aoa_to_sheet([head, ...body]);\n'
    '        ws["!freeze"] = { xSplit: 0, ySplit: 1 };\n'
    '        XLSX.utils.book_append_sheet(wb, ws, sheet);\n',
    '        const ws = buildXlsxSheet(head, body, [2, 3, 4, 5, 6, 7, 8, ...(includeCompare ? [9, 10] : [])]);\n'
    '        XLSX.utils.book_append_sheet(wb, ws, sheet);\n',
    label="site2 ws levelDefs",
)

# Site 3: handleExportFullXlsx - sheet DSE (headDse)
do(
    '      const headDse = ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Penjualan SP", "Penjualan FWA", "Penjualan Voucher", "Penjualan Saldo", "Total Penjualan", ...(includeCompare ? ["Sellin Upload (SP+Vou+Saldo)", "Selisih"] : [])];\n',
    '      const headDse = ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)", ...(includeCompare ? ["Sellin Upload SP+Vou+Saldo (Rp)", "Selisih (Rp)"] : [])];\n',
    label="site3 headDse",
)
do(
    '      const wsDse = XLSX.utils.aoa_to_sheet([headDse, ...bodyDse]);\n'
    '      wsDse["!freeze"] = { xSplit: 0, ySplit: 1 };\n'
    '      XLSX.utils.book_append_sheet(wb, wsDse, "DSE");\n',
    '      const wsDse = buildXlsxSheet(headDse, bodyDse, [8, 9, 10, 11, 12, ...(includeCompare ? [13, 14] : [])]);\n'
    '      XLSX.utils.book_append_sheet(wb, wsDse, "DSE");\n',
    label="site3 wsDse",
)

# Site 4: handleExportSellinXlsx - ringkasan (non-dse) "Export Tampilan Saat Ini"
do(
    '        const head = ["#", summaryGroupLabel, "DSE Active", "DSE Vacant", "Penjualan SP", "Penjualan FWA", "Penjualan Voucher", "Penjualan Saldo", "Total Penjualan", ...(includeCompare ? ["Sellin Upload (SP+Vou+Saldo)", "Selisih"] : [])];\n',
    '        const head = ["#", summaryGroupLabel, "DSE Active", "DSE Vacant", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)", ...(includeCompare ? ["Sellin Upload SP+Vou+Saldo (Rp)", "Selisih (Rp)"] : [])];\n',
    label="site4 head ringkasan",
)
do(
    '        const ws = XLSX.utils.aoa_to_sheet([head, ...body]);\n'
    '        ws["!freeze"] = { xSplit: 0, ySplit: 1 };\n'
    '        const wb = XLSX.utils.book_new();\n'
    '        XLSX.utils.book_append_sheet(wb, ws, summaryGroupLabel);\n'
    '        XLSX.writeFile(wb, `Ringkasan_${summaryGroupLabel}_${periodeLabel}.xlsx`);\n',
    '        const ws = buildXlsxSheet(head, body, [2, 3, 4, 5, 6, 7, 8, ...(includeCompare ? [9, 10] : [])]);\n'
    '        const wb = XLSX.utils.book_new();\n'
    '        XLSX.utils.book_append_sheet(wb, ws, summaryGroupLabel);\n'
    '        XLSX.writeFile(wb, `Ringkasan_${summaryGroupLabel}_${periodeLabel}.xlsx`);\n',
    label="site4 ws ringkasan",
)

# Site 5: handleExportSellinXlsx - roster DSE "Export Tampilan Saat Ini"
do(
    '        const head = ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Penjualan SP", "Penjualan FWA", "Penjualan Voucher", "Penjualan Saldo", "Total Penjualan", ...(includeCompare ? ["Sellin Upload (SP+Vou+Saldo)", "Selisih"] : [])];\n',
    '        const head = ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)", ...(includeCompare ? ["Sellin Upload SP+Vou+Saldo (Rp)", "Selisih (Rp)"] : [])];\n',
    label="site5 head roster",
)
do(
    '        const ws = XLSX.utils.aoa_to_sheet([head, ...body]);\n'
    '        ws["!freeze"] = { xSplit: 0, ySplit: 1 };\n'
    '        const wb = XLSX.utils.book_new();\n'
    '        XLSX.utils.book_append_sheet(wb, ws, "DSE");\n'
    '        XLSX.writeFile(wb, `Roster_DSE_${periodeLabel}.xlsx`);\n',
    '        const ws = buildXlsxSheet(head, body, [8, 9, 10, 11, 12, ...(includeCompare ? [13, 14] : [])]);\n'
    '        const wb = XLSX.utils.book_new();\n'
    '        XLSX.utils.book_append_sheet(wb, ws, "DSE");\n'
    '        XLSX.writeFile(wb, `Roster_DSE_${periodeLabel}.xlsx`);\n',
    label="site5 ws roster",
)

# Site 6: handleExport (tab Riwayat, "DSE Prod & AR")
do(
    '      const head = ["Tanggal", "Kode DSE", "District", "Area", "Nama DS", "Nama DSE", "Qty SP", "Nilai SP", "Nilai FWA", "Qty Saldo", "Nilai Saldo", "Qty Voucher", "Nilai Voucher", "Bayar AR", "Sisa AR/Piutang", "Catatan", "Terakhir Diperbarui"];\n',
    '      const head = ["Tanggal", "Kode DSE", "District", "Area", "Nama DS", "Nama DSE", "Qty SP", "Nilai SP (Rp)", "Nilai FWA (Rp)", "Qty Saldo", "Nilai Saldo (Rp)", "Qty Voucher", "Nilai Voucher (Rp)", "Bayar AR (Rp)", "Sisa AR/Piutang (Rp)", "Catatan", "Terakhir Diperbarui"];\n',
    label="site6 head riwayat",
)
do(
    '      const ws = XLSX.utils.aoa_to_sheet([head, ...body]);\n'
    '      ws["!freeze"] = { xSplit: 0, ySplit: 1 };\n'
    '      const wb = XLSX.utils.book_new();\n'
    '      XLSX.utils.book_append_sheet(wb, ws, "DSE Prod & AR");\n',
    '      const ws = buildXlsxSheet(head, body, [6, 7, 8, 9, 10, 11, 12, 13, 14]);\n'
    '      const wb = XLSX.utils.book_new();\n'
    '      XLSX.utils.book_append_sheet(wb, ws, "DSE Prod & AR");\n',
    label="site6 ws riwayat",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - semua 6 export xlsx dirapihkan: header lebih informatif (Rp) + auto-fit kolom + format number")
