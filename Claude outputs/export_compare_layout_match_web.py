path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# UPDATE (permintaan user - "saat export disertai data pembanding, ikuti
# layout web: exclude FWA, tiap metrik langsung bersebelahan sama
# Sell-in-nya"): fetchDseLevelForExport ditambah field per-metrik Sell-in
# (sellinSp/sellinVou/sellinSaldo) & totalExclFwaAsOf (total Penjualan excl
# FWA yg DIBATASI sampai tanggal as-of upload) - sebelumnya cuma ada
# uploadTotal (jumlah) & selisih, sekarang dipecah per metrik biar bisa
# dipasangin kolom per kolom SAMA PERSIS pola tabel "Bandingkan Data" di
# layar (roster DSE).
do(
    '      return {\n'
    '        dse_code: r.dse_code, partner: r.mdi || "", region: r.region || "", branch: r.branch || "", mc: r.mc || "", nama: r.ds_name || "", status: r.dse_status || "",\n'
    '        nilaiSp: n.nilaiSp, nilaiFwa: n.nilaiFwa, nilaiVoucher: n.nilaiVoucher, nilaiSaldo: n.nilaiSaldo, totalPenjualan,\n'
    '        hasUpload, uploadTotal,\n'
    '        selisih: hasUpload && u ? ((appAsOfByCode[r.dse_code] ?? (n.nilaiSp + n.nilaiVoucher + n.nilaiSaldo)) - uploadTotal) : null,\n'
    '      };\n',

    '      const totalExclFwaAsOf = hasUpload && u ? (appAsOfByCode[r.dse_code] ?? (n.nilaiSp + n.nilaiVoucher + n.nilaiSaldo)) : null;\n'
    '      return {\n'
    '        dse_code: r.dse_code, partner: r.mdi || "", region: r.region || "", branch: r.branch || "", mc: r.mc || "", nama: r.ds_name || "", status: r.dse_status || "",\n'
    '        nilaiSp: n.nilaiSp, nilaiFwa: n.nilaiFwa, nilaiVoucher: n.nilaiVoucher, nilaiSaldo: n.nilaiSaldo, totalPenjualan,\n'
    '        hasUpload, uploadTotal,\n'
    '        sellinSp: u ? fRaw(u.sellin_sp) : null, sellinVou: u ? fRaw(u.sellin_vou) : null, sellinSaldo: u ? fRaw(u.sellin_saldo) : null,\n'
    '        totalExclFwaAsOf,\n'
    '        selisih: hasUpload && u ? (totalExclFwaAsOf - uploadTotal) : null,\n'
    '      };\n',
    label="fetchDseLevelForExport tambah field per-metrik sellin",
)

# Site 2 (handleExportFullXlsx - sheet Partner/Region/Area/District):
# layout pembanding diganti jadi berpasangan per metrik (exclude FWA),
# SAMA PERSIS tabel "Bandingkan Data" di layar (compareRollup).
do(
    '        const { rows, uploadAvailable } = await fetchLevelSummaryForExport(lvl, includeCompare);\n'
    '        const head = ["#", label, "DSE Active", "DSE Vacant", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)", ...(includeCompare ? ["Sellin Upload SP+Vou+Saldo (Rp)", "Selisih (Rp)"] : [])];\n'
    '        const body = rows.map((r, i) => [\n'
    '          i + 1, r.label, r.totalActive, r.totalVacant,\n'
    '          r.nilaiSp, r.nilaiFwa, r.nilaiVoucher, r.nilaiSaldo, r.nilaiSp + r.nilaiFwa + r.nilaiVoucher + r.nilaiSaldo,\n'
    '          ...(includeCompare ? [\n'
    '            uploadAvailable ? (r.uploadSp + r.uploadVou + r.uploadSaldo) : "",\n'
    '            uploadAvailable ? ((r.asOfSp + r.asOfVoucher + r.asOfSaldo) - (r.uploadSp + r.uploadVou + r.uploadSaldo)) : "",\n'
    '          ] : []),\n'
    '        ]);\n'
    '        const ws = buildXlsxSheet(head, body, [2, 3, 4, 5, 6, 7, 8, ...(includeCompare ? [9, 10] : [])]);\n',

    '        const { rows, uploadAvailable } = await fetchLevelSummaryForExport(lvl, includeCompare);\n'
    '        // UPDATE (permintaan user - "saat export disertai data\n'
    '        // pembanding, ikuti layout web: exclude FWA, tiap metrik\n'
    '        // langsung bersebelahan sama Sell-in-nya"): includeCompare ON\n'
    '        // -> kolom berpasangan per metrik (SP|Sell-in SP|Voucher|\n'
    '        // Sell-in Voucher|Saldo|Sell-in Saldo|Total Excl FWA|Total\n'
    '        // Sell-in|Selisih), FWA dikeluarkan - SAMA PERSIS tampilan\n'
    '        // tabel "Bandingkan Data" di layar. includeCompare OFF -> 5\n'
    '        // kolom original (SP/FWA/Voucher/Saldo/Total).\n'
    '        const head = includeCompare\n'
    '          ? ["#", label, "DSE Active", "DSE Vacant", "Penjualan SP (Rp)", "Sell-in SP (Rp)", "Penjualan Voucher (Rp)", "Sell-in Voucher (Rp)", "Penjualan Saldo (Rp)", "Sell-in Saldo (Rp)", "Total Penjualan Excl FWA (Rp)", "Total Sell-in (Rp)", "Selisih (Rp)"]\n'
    '          : ["#", label, "DSE Active", "DSE Vacant", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)"];\n'
    '        const body = rows.map((r, i) => includeCompare ? [\n'
    '          i + 1, r.label, r.totalActive, r.totalVacant,\n'
    '          uploadAvailable ? r.asOfSp : r.nilaiSp, uploadAvailable ? r.uploadSp : "",\n'
    '          uploadAvailable ? r.asOfVoucher : r.nilaiVoucher, uploadAvailable ? r.uploadVou : "",\n'
    '          uploadAvailable ? r.asOfSaldo : r.nilaiSaldo, uploadAvailable ? r.uploadSaldo : "",\n'
    '          uploadAvailable ? (r.asOfSp + r.asOfVoucher + r.asOfSaldo) : (r.nilaiSp + r.nilaiVoucher + r.nilaiSaldo),\n'
    '          uploadAvailable ? (r.uploadSp + r.uploadVou + r.uploadSaldo) : "",\n'
    '          uploadAvailable ? ((r.asOfSp + r.asOfVoucher + r.asOfSaldo) - (r.uploadSp + r.uploadVou + r.uploadSaldo)) : "",\n'
    '        ] : [\n'
    '          i + 1, r.label, r.totalActive, r.totalVacant,\n'
    '          r.nilaiSp, r.nilaiFwa, r.nilaiVoucher, r.nilaiSaldo, r.nilaiSp + r.nilaiFwa + r.nilaiVoucher + r.nilaiSaldo,\n'
    '        ]);\n'
    '        const ws = buildXlsxSheet(head, body, includeCompare ? [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [2, 3, 4, 5, 6, 7, 8]);\n',
    label="site2 levelDefs layout pembanding",
)

# Site 3 (handleExportFullXlsx - sheet DSE): layout pembanding diganti
# berpasangan per metrik juga, pakai field baru dari fetchDseLevelForExport.
do(
    '      const headDse = ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)", ...(includeCompare ? ["Sellin Upload SP+Vou+Saldo (Rp)", "Selisih (Rp)"] : [])];\n'
    '      const bodyDse = dseRows.map((x, i) => [\n'
    '        i + 1, x.dse_code, x.partner, x.region, x.branch, x.mc, x.nama, x.status,\n'
    '        x.nilaiSp, x.nilaiFwa, x.nilaiVoucher, x.nilaiSaldo, x.totalPenjualan,\n'
    '        ...(includeCompare ? [\n'
    '          x.hasUpload ? (x.uploadTotal ?? "") : "",\n'
    '          x.hasUpload ? (x.selisih ?? "") : "",\n'
    '        ] : []),\n'
    '      ]);\n'
    '      const wsDse = buildXlsxSheet(headDse, bodyDse, [8, 9, 10, 11, 12, ...(includeCompare ? [13, 14] : [])]);\n',

    '      const headDse = includeCompare\n'
    '        ? ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Penjualan SP (Rp)", "Sell-in SP (Rp)", "Penjualan Voucher (Rp)", "Sell-in Voucher (Rp)", "Penjualan Saldo (Rp)", "Sell-in Saldo (Rp)", "Total Penjualan Excl FWA (Rp)", "Total Sell-in (Rp)", "Selisih (Rp)"]\n'
    '        : ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)"];\n'
    '      const bodyDse = dseRows.map((x, i) => includeCompare ? [\n'
    '        i + 1, x.dse_code, x.partner, x.region, x.branch, x.mc, x.nama, x.status,\n'
    '        x.nilaiSp, x.hasUpload && x.sellinSp != null ? x.sellinSp : "",\n'
    '        x.nilaiVoucher, x.hasUpload && x.sellinVou != null ? x.sellinVou : "",\n'
    '        x.nilaiSaldo, x.hasUpload && x.sellinSaldo != null ? x.sellinSaldo : "",\n'
    '        x.hasUpload ? (x.totalExclFwaAsOf ?? (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo)) : (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo),\n'
    '        x.hasUpload ? (x.uploadTotal ?? "") : "",\n'
    '        x.hasUpload ? (x.selisih ?? "") : "",\n'
    '      ] : [\n'
    '        i + 1, x.dse_code, x.partner, x.region, x.branch, x.mc, x.nama, x.status,\n'
    '        x.nilaiSp, x.nilaiFwa, x.nilaiVoucher, x.nilaiSaldo, x.totalPenjualan,\n'
    '      ]);\n'
    '      const wsDse = buildXlsxSheet(headDse, bodyDse, includeCompare ? [8, 9, 10, 11, 12, 13, 14, 15, 16] : [8, 9, 10, 11, 12]);\n',
    label="site3 headDse/bodyDse layout pembanding",
)

# Site 4 (handleExportSellinXlsx - Ringkasan non-DSE): sama polanya kayak
# site2, pakai regionSummary/sellinUploadAvailable.
do(
    '        const head = ["#", summaryGroupLabel, "DSE Active", "DSE Vacant", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)", ...(includeCompare ? ["Sellin Upload SP+Vou+Saldo (Rp)", "Selisih (Rp)"] : [])];\n'
    '        const body = regionSummary.map((r, i) => [\n'
    '          i + 1, r.label, r.totalActive, r.totalVacant,\n'
    '          r.nilaiSp, r.nilaiFwa, r.nilaiVoucher, r.nilaiSaldo, r.nilaiSp + r.nilaiFwa + r.nilaiVoucher + r.nilaiSaldo,\n'
    '          ...(includeCompare ? [\n'
    '            sellinUploadAvailable ? (r.uploadSp + r.uploadVou + r.uploadSaldo) : "",\n'
    '            sellinUploadAvailable ? ((r.asOfSp + r.asOfVoucher + r.asOfSaldo) - (r.uploadSp + r.uploadVou + r.uploadSaldo)) : "",\n'
    '          ] : []),\n'
    '        ]);\n'
    '        const ws = buildXlsxSheet(head, body, [2, 3, 4, 5, 6, 7, 8, ...(includeCompare ? [9, 10] : [])]);\n',

    '        const head = includeCompare\n'
    '          ? ["#", summaryGroupLabel, "DSE Active", "DSE Vacant", "Penjualan SP (Rp)", "Sell-in SP (Rp)", "Penjualan Voucher (Rp)", "Sell-in Voucher (Rp)", "Penjualan Saldo (Rp)", "Sell-in Saldo (Rp)", "Total Penjualan Excl FWA (Rp)", "Total Sell-in (Rp)", "Selisih (Rp)"]\n'
    '          : ["#", summaryGroupLabel, "DSE Active", "DSE Vacant", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)"];\n'
    '        const body = regionSummary.map((r, i) => includeCompare ? [\n'
    '          i + 1, r.label, r.totalActive, r.totalVacant,\n'
    '          sellinUploadAvailable ? r.asOfSp : r.nilaiSp, sellinUploadAvailable ? r.uploadSp : "",\n'
    '          sellinUploadAvailable ? r.asOfVoucher : r.nilaiVoucher, sellinUploadAvailable ? r.uploadVou : "",\n'
    '          sellinUploadAvailable ? r.asOfSaldo : r.nilaiSaldo, sellinUploadAvailable ? r.uploadSaldo : "",\n'
    '          sellinUploadAvailable ? (r.asOfSp + r.asOfVoucher + r.asOfSaldo) : (r.nilaiSp + r.nilaiVoucher + r.nilaiSaldo),\n'
    '          sellinUploadAvailable ? (r.uploadSp + r.uploadVou + r.uploadSaldo) : "",\n'
    '          sellinUploadAvailable ? ((r.asOfSp + r.asOfVoucher + r.asOfSaldo) - (r.uploadSp + r.uploadVou + r.uploadSaldo)) : "",\n'
    '        ] : [\n'
    '          i + 1, r.label, r.totalActive, r.totalVacant,\n'
    '          r.nilaiSp, r.nilaiFwa, r.nilaiVoucher, r.nilaiSaldo, r.nilaiSp + r.nilaiFwa + r.nilaiVoucher + r.nilaiSaldo,\n'
    '        ]);\n'
    '        const ws = buildXlsxSheet(head, body, includeCompare ? [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [2, 3, 4, 5, 6, 7, 8]);\n',
    label="site4 ringkasan layout pembanding",
)

# Site 5 (handleExportSellinXlsx - roster DSE, "Export Tampilan Saat Ini"):
# sama pola berpasangan per metrik, SEKALIGUS bonus-fix pagination query
# arRows-nya (sebelumnya masih gte/lte lintas banyak tanggal tanpa
# fetchProdArPaged/datesBetween - potensi statement timeout yg sama kayak
# yg udah diperbaiki di fungsi lain).
do(
    '        const codes = rows.map((x) => x.r.dse_code).filter(Boolean);\n'
    '        let uploadByCode = {};\n'
    '        const uploadPeriod = calViewMonth.slice(0, 7);\n'
    '        const UP_CHUNK = 500;\n'
    '        if (codes.length && periodMode === "bulan" && includeCompare) {\n'
    '          for (let i = 0; i < codes.length; i += UP_CHUNK) {\n'
    '            const chunk = codes.slice(i, i + UP_CHUNK);\n'
    '            const { data: upRows } = await supabase.from("mf_dse_admin_sellin_upload")\n'
    '              .select("dse_code, sellin_sp, sellin_vou, sellin_saldo, as_of_dt")\n'
    '              .eq("period", uploadPeriod).eq("matched", true).in("dse_code", chunk);\n'
    '            (upRows || []).forEach((u) => { uploadByCode[u.dse_code] = u; });\n'
    '          }\n'
    '        }\n'
    '        const hasUpload = Object.keys(uploadByCode).length > 0;\n'
    '        // BARU: tau tanggal as_of upload -> tarik ULANG total SP+Voucher+\n'
    '        // Saldo (excl FWA) dari mf_dse_prod_ar tapi DIBATASI sampai\n'
    '        // tanggal itu (bukan bulan penuh sampai hari ini) - dipakai itung\n'
    '        // Selisih yg apple-to-apple sama Sellin Upload.\n'
    '        let appAsOfByCode = {};\n'
    '        const capturedAsOf = hasUpload ? Object.values(uploadByCode)[0]?.as_of_dt : null;\n'
    '        if (hasUpload && capturedAsOf != null) {\n'
    '          const startISO = `${uploadPeriod}-01`;\n'
    '          const endISO = `${uploadPeriod}-${String(capturedAsOf).padStart(2, "0")}`;\n'
    '          for (let i = 0; i < codes.length; i += UP_CHUNK) {\n'
    '            const chunk = codes.slice(i, i + UP_CHUNK);\n'
    '            const { data: arRows } = await supabase.from("mf_dse_prod_ar")\n'
    '              .select("dse_code, nilai_sp, nilai_voucher, nilai_saldo")\n'
    '              .in("dse_code", chunk).gte("tanggal", startISO).lte("tanggal", endISO);\n'
    '            (arRows || []).forEach((p) => {\n'
    '              const a = appAsOfByCode[p.dse_code] || (appAsOfByCode[p.dse_code] = 0);\n'
    '              appAsOfByCode[p.dse_code] = a + fRaw(p.nilai_sp) + fRaw(p.nilai_voucher) + fRaw(p.nilai_saldo);\n'
    '            });\n'
    '          }\n'
    '        }\n'
    '        const head = ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)", ...(includeCompare ? ["Sellin Upload SP+Vou+Saldo (Rp)", "Selisih (Rp)"] : [])];\n'
    '        const body = rows.map((x, i) => {\n'
    '          const u = uploadByCode[x.r.dse_code];\n'
    '          const uploadTotal = u ? (fRaw(u.sellin_sp) + fRaw(u.sellin_vou) + fRaw(u.sellin_saldo)) : null;\n'
    '          return [\n'
    '            i + 1, x.r.dse_code, x.partnerVal || "", x.regionVal || "", x.branchVal || "", x.mcVal || "", x.namaVal || "", x.statusVal || "",\n'
    '            x.nilaiSp, x.nilaiFwa, x.nilaiVoucher, x.nilaiSaldo, x.totalPenjualan,\n'
    '            ...(includeCompare ? [\n'
    '              hasUpload ? (uploadTotal ?? "") : "",\n'
    '              hasUpload && u ? ((appAsOfByCode[x.r.dse_code] ?? (x.nilaiSp + x.nilaiVoucher + x.nilaiSaldo)) - uploadTotal) : "",\n'
    '            ] : []),\n'
    '          ];\n'
    '        });\n'
    '        const ws = buildXlsxSheet(head, body, [8, 9, 10, 11, 12, ...(includeCompare ? [13, 14] : [])]);\n',

    '        const codes = rows.map((x) => x.r.dse_code).filter(Boolean);\n'
    '        let uploadByCode = {};\n'
    '        const uploadPeriod = calViewMonth.slice(0, 7);\n'
    '        const UP_CHUNK = 500;\n'
    '        // UPDATE: tombol "Export Tampilan Saat Ini" ini jalan di Daily\n'
    '        // MAUPUN Full Month (includeCompare bisa true di Daily juga),\n'
    '        // tapi konsep "data pembanding" cuma valid di Full Month - jadi\n'
    '        // layout berpasangan cuma dipakai kalau BENERAN mode bulan.\n'
    '        const showCompareDse = periodMode === "bulan" && includeCompare;\n'
    '        if (codes.length && showCompareDse) {\n'
    '          for (let i = 0; i < codes.length; i += UP_CHUNK) {\n'
    '            const chunk = codes.slice(i, i + UP_CHUNK);\n'
    '            const { data: upRows } = await supabase.from("mf_dse_admin_sellin_upload")\n'
    '              .select("dse_code, sellin_sp, sellin_vou, sellin_saldo, as_of_dt")\n'
    '              .eq("period", uploadPeriod).eq("matched", true).in("dse_code", chunk);\n'
    '            (upRows || []).forEach((u) => { uploadByCode[u.dse_code] = u; });\n'
    '          }\n'
    '        }\n'
    '        const hasUpload = Object.keys(uploadByCode).length > 0;\n'
    '        // BARU: tau tanggal as_of upload -> tarik ULANG total SP+Voucher+\n'
    '        // Saldo (excl FWA) dari mf_dse_prod_ar tapi DIBATASI sampai\n'
    '        // tanggal itu (bukan bulan penuh sampai hari ini) - dipakai itung\n'
    '        // Selisih yg apple-to-apple sama Sellin Upload. Query dipecah PER\n'
    '        // TANGGAL (fetchProdArPaged/datesBetween) - konsisten sama fix\n'
    '        // "statement timeout" di fungsi export lain, bukan gte/lte lebar.\n'
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
    '        }\n'
    '        // UPDATE (permintaan user - "ikuti layout web: exclude FWA,\n'
    '        // tiap metrik bersebelahan sama Sell-in-nya"): showCompareDse ON\n'
    '        // -> kolom berpasangan per metrik, FWA dikeluarkan (SAMA PERSIS\n'
    '        // tabel "Bandingkan Data" di layar). showCompareDse OFF -> tetap\n'
    '        // 5 kolom original.\n'
    '        const head = showCompareDse\n'
    '          ? ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Penjualan SP (Rp)", "Sell-in SP (Rp)", "Penjualan Voucher (Rp)", "Sell-in Voucher (Rp)", "Penjualan Saldo (Rp)", "Sell-in Saldo (Rp)", "Total Penjualan Excl FWA (Rp)", "Total Sell-in (Rp)", "Selisih (Rp)"]\n'
    '          : ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Penjualan SP (Rp)", "Penjualan FWA (Rp)", "Penjualan Voucher (Rp)", "Penjualan Saldo (Rp)", "Total Penjualan (Rp)"];\n'
    '        const body = rows.map((x, i) => {\n'
    '          const u = uploadByCode[x.r.dse_code];\n'
    '          if (!showCompareDse) {\n'
    '            return [\n'
    '              i + 1, x.r.dse_code, x.partnerVal || "", x.regionVal || "", x.branchVal || "", x.mcVal || "", x.namaVal || "", x.statusVal || "",\n'
    '              x.nilaiSp, x.nilaiFwa, x.nilaiVoucher, x.nilaiSaldo, x.totalPenjualan,\n'
    '            ];\n'
    '          }\n'
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
    '          ];\n'
    '        });\n'
    '        const ws = buildXlsxSheet(head, body, showCompareDse ? [8, 9, 10, 11, 12, 13, 14, 15, 16] : [8, 9, 10, 11, 12]);\n',
    label="site5 roster layout pembanding + bonus fix pagination arRows",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - layout export compare sekarang SAMA PERSIS tabel 'Bandingkan Data' di web (berpasangan per metrik, exclude FWA)")
