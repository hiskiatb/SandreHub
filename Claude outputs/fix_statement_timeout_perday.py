path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# FIX (error user - "canceling statement due to statement timeout" pas
# export data harian rentang 1-25): root cause BUKAN volume data (tabel
# mf_dse_prod_ar cuma ~20rb baris), tapi RLS policy tabel ini berat (ada
# beberapa policy SELECT yg di-OR-kan, tiap row manggil function access-
# check sendiri2). Pagination .range()/OFFSET yg dipasang sebelumnya utk
# fix "data kepotong 2000 baris" butuh scan ULANG semua baris SEBELUM
# offset tiap kali ambil halaman berikutnya - utk query lintas banyak
# tanggal (hampir semua isi tabel ke-scan), RLS yg berat itu dievaluasi
# berkali-kali kuadratik sampai kena statement_timeout di DB.
# Solusi: pecah query PER TANGGAL (kolom tanggal ada index-nya, jauh lebih
# selektif) - per hari per chunk DSE jumlah barisnya kecil, hampir ga
# pernah butuh .range() sama sekali, dan RLS cuma dievaluasi utk baris yg
# beneran match hari itu, bukan hampir seisi tabel.
do(
    'const todayISO = () => new Date().toISOString().slice(0, 10);\n',
    'const todayISO = () => new Date().toISOString().slice(0, 10);\n'
    '// BARU: pecah rentang tanggal jadi array "YYYY-MM-DD" per hari -\n'
    '// dipakai query mf_dse_prod_ar PER TANGGAL (bukan gte/lte lintas\n'
    '// banyak hari sekaligus) supaya index tanggal kepake optimal & RLS\n'
    '// yg berat ga dievaluasi ke hampir seisi tabel.\n'
    'const datesBetween = (fromISO, toISO) => {\n'
    '  const out = [];\n'
    '  let d = new Date(fromISO + "T00:00:00Z");\n'
    '  const end = new Date(toISO + "T00:00:00Z");\n'
    '  while (d <= end) {\n'
    '    out.push(d.toISOString().slice(0, 10));\n'
    '    d = new Date(d.getTime() + 86400000);\n'
    '  }\n'
    '  return out;\n'
    '};\n'
    '// BARU: fetch mf_dse_prod_ar PER TANGGAL x per chunk DSE (chunkSize),\n'
    '// dgn .range() cuma sbg jaga2 kalau 1 hari+1 chunk somehow > pageSize\n'
    '// baris (jarang kejadian - lebih efisien drpd gte/lte lintas tanggal).\n'
    'const fetchProdArPaged = async (codes, dates, selectCols, chunkSize = 500, pageSize = 1000) => {\n'
    '  let all = [];\n'
    '  for (const dt of dates) {\n'
    '    for (let i = 0; i < codes.length; i += chunkSize) {\n'
    '      const chunk = codes.slice(i, i + chunkSize);\n'
    '      let from = 0;\n'
    '      while (true) {\n'
    '        const { data, error } = await supabase.from("mf_dse_prod_ar").select(selectCols)\n'
    '          .in("dse_code", chunk).eq("tanggal", dt).range(from, from + pageSize - 1);\n'
    '        if (error) throw error;\n'
    '        const batch = data || [];\n'
    '        all = all.concat(batch);\n'
    '        if (batch.length < pageSize) break;\n'
    '        from += pageSize;\n'
    '      }\n'
    '    }\n'
    '  }\n'
    '  return all;\n'
    '};\n',
    label="helper datesBetween + fetchProdArPaged",
)

# fetchLevelSummaryForExport: prod query utama -> pakai fetchProdArPaged per tanggal
do(
    '    for (let i = 0; i < codes.length; i += CHUNK) {\n'
    '      const chunk = codes.slice(i, i + CHUNK);\n'
    '      const PAGE_PROD = 1000;\n'
    '      let prod = [];\n'
    '      {\n'
    '        let pf = 0;\n'
    '        while (true) {\n'
    '          let prodQuery = supabase.from("mf_dse_prod_ar").select("dse_code, tanggal, nilai_sp, nilai_fwa, nilai_voucher, nilai_saldo").in("dse_code", chunk);\n'
    '          prodQuery = isRangeModeExport ? prodQuery.in("tanggal", sortedSelectedDates) : prodQuery.eq("tanggal", entryDate);\n'
    '          const { data: prodPage, error: e2 } = await prodQuery.range(pf, pf + PAGE_PROD - 1);\n'
    '          if (e2) throw e2;\n'
    '          const batch = prodPage || [];\n'
    '          prod = prod.concat(batch);\n'
    '          if (batch.length < PAGE_PROD) break;\n'
    '          pf += PAGE_PROD;\n'
    '        }\n'
    '      }\n'
    '      (prod || []).forEach((p) => {\n'
    '        const g = byGroup[groupOf[p.dse_code]];\n'
    '        if (!g) return;\n'
    '        g.nilaiSp += fRaw(p.nilai_sp); g.nilaiFwa += fRaw(p.nilai_fwa); g.nilaiVoucher += fRaw(p.nilai_voucher); g.nilaiSaldo += fRaw(p.nilai_saldo);\n'
    '      });\n'
    '    }\n',

    '    const prodDates = isRangeModeExport ? sortedSelectedDates : [entryDate];\n'
    '    const prod = await fetchProdArPaged(codes, prodDates, "dse_code, tanggal, nilai_sp, nilai_fwa, nilai_voucher, nilai_saldo");\n'
    '    prod.forEach((p) => {\n'
    '      const g = byGroup[groupOf[p.dse_code]];\n'
    '      if (!g) return;\n'
    '      g.nilaiSp += fRaw(p.nilai_sp); g.nilaiFwa += fRaw(p.nilai_fwa); g.nilaiVoucher += fRaw(p.nilai_voucher); g.nilaiSaldo += fRaw(p.nilai_saldo);\n'
    '    });\n',
    label="fetchLevelSummaryForExport prod per-tanggal",
)

# fetchDseLevelForExport: prod query utama -> pakai fetchProdArPaged per tanggal
do(
    '    for (let i = 0; i < codes.length; i += CHUNK) {\n'
    '      const chunk = codes.slice(i, i + CHUNK);\n'
    '      const PAGE_PROD = 1000;\n'
    '      let prod = [];\n'
    '      {\n'
    '        let pf = 0;\n'
    '        while (true) {\n'
    '          let prodQuery = supabase.from("mf_dse_prod_ar").select("dse_code, tanggal, nilai_sp, nilai_fwa, nilai_voucher, nilai_saldo").in("dse_code", chunk);\n'
    '          prodQuery = isRangeModeExport ? prodQuery.in("tanggal", sortedSelectedDates) : prodQuery.eq("tanggal", entryDate);\n'
    '          const { data: prodPage, error: e2 } = await prodQuery.range(pf, pf + PAGE_PROD - 1);\n'
    '          if (e2) throw e2;\n'
    '          const batch = prodPage || [];\n'
    '          prod = prod.concat(batch);\n'
    '          if (batch.length < PAGE_PROD) break;\n'
    '          pf += PAGE_PROD;\n'
    '        }\n'
    '      }\n'
    '      (prod || []).forEach((p) => {\n'
    '        const n = byCode[p.dse_code];\n'
    '        if (!n) return;\n'
    '        n.nilaiSp += fRaw(p.nilai_sp); n.nilaiFwa += fRaw(p.nilai_fwa); n.nilaiVoucher += fRaw(p.nilai_voucher); n.nilaiSaldo += fRaw(p.nilai_saldo);\n'
    '      });\n'
    '    }\n',

    '    const prodDates = isRangeModeExport ? sortedSelectedDates : [entryDate];\n'
    '    const prod = await fetchProdArPaged(codes, prodDates, "dse_code, tanggal, nilai_sp, nilai_fwa, nilai_voucher, nilai_saldo");\n'
    '    prod.forEach((p) => {\n'
    '      const n = byCode[p.dse_code];\n'
    '      if (!n) return;\n'
    '      n.nilaiSp += fRaw(p.nilai_sp); n.nilaiFwa += fRaw(p.nilai_fwa); n.nilaiVoucher += fRaw(p.nilai_voucher); n.nilaiSaldo += fRaw(p.nilai_saldo);\n'
    '    });\n',
    label="fetchDseLevelForExport prod per-tanggal",
)

# fetchLevelSummaryForExport: query "as of cutoff" (prod2) -> per tanggal
do(
    '      if (capturedAsOfUp != null) {\n'
    '        const cutoffAsOf = `${uploadPeriod}-${String(capturedAsOfUp).padStart(2, "0")}`;\n'
    '        for (let i = 0; i < codes.length; i += CHUNK) {\n'
    '          const chunk = codes.slice(i, i + CHUNK);\n'
    '          let prod2 = [];\n'
    '          {\n'
    '            let pf2 = 0;\n'
    '            const PAGE_PROD2 = 1000;\n'
    '            while (true) {\n'
    '              const { data: prod2Page, error: e3 } = await supabase.from("mf_dse_prod_ar")\n'
    '                .select("dse_code, tanggal, nilai_sp, nilai_voucher, nilai_saldo")\n'
    '                .in("dse_code", chunk).gte("tanggal", `${uploadPeriod}-01`).lte("tanggal", cutoffAsOf)\n'
    '                .range(pf2, pf2 + PAGE_PROD2 - 1);\n'
    '              if (e3) throw e3;\n'
    '              const batch2 = prod2Page || [];\n'
    '              prod2 = prod2.concat(batch2);\n'
    '              if (batch2.length < PAGE_PROD2) break;\n'
    '              pf2 += PAGE_PROD2;\n'
    '            }\n'
    '          }\n'
    '          (prod2 || []).forEach((p) => {\n'
    '            const g = byGroup[groupOf[p.dse_code]];\n'
    '            if (!g) return;\n'
    '            g.asOfSp += fRaw(p.nilai_sp); g.asOfVoucher += fRaw(p.nilai_voucher); g.asOfSaldo += fRaw(p.nilai_saldo);\n'
    '          });\n'
    '        }\n',

    '      if (capturedAsOfUp != null) {\n'
    '        const cutoffAsOf = `${uploadPeriod}-${String(capturedAsOfUp).padStart(2, "0")}`;\n'
    '        const prod2 = await fetchProdArPaged(codes, datesBetween(`${uploadPeriod}-01`, cutoffAsOf), "dse_code, tanggal, nilai_sp, nilai_voucher, nilai_saldo");\n'
    '        prod2.forEach((p) => {\n'
    '          const g = byGroup[groupOf[p.dse_code]];\n'
    '          if (!g) return;\n'
    '          g.asOfSp += fRaw(p.nilai_sp); g.asOfVoucher += fRaw(p.nilai_voucher); g.asOfSaldo += fRaw(p.nilai_saldo);\n'
    '        });\n',
    label="fetchLevelSummaryForExport prod2 per-tanggal",
)

# fetchDseLevelForExport: query "as of cutoff" (arRows) -> per tanggal
do(
    '    if (hasUpload && capturedAsOf != null) {\n'
    '      const startISO = `${uploadPeriod}-01`;\n'
    '      const endISO = `${uploadPeriod}-${String(capturedAsOf).padStart(2, "0")}`;\n'
    '      for (let i = 0; i < codes.length; i += CHUNK) {\n'
    '        const chunk = codes.slice(i, i + CHUNK);\n'
    '        let arRows = [];\n'
    '        {\n'
    '          let pf3 = 0;\n'
    '          const PAGE_PROD3 = 1000;\n'
    '          while (true) {\n'
    '            const { data: arRowsPage, error: e3 } = await supabase.from("mf_dse_prod_ar")\n'
    '              .select("dse_code, nilai_sp, nilai_voucher, nilai_saldo")\n'
    '              .in("dse_code", chunk).gte("tanggal", startISO).lte("tanggal", endISO)\n'
    '              .range(pf3, pf3 + PAGE_PROD3 - 1);\n'
    '            if (e3) throw e3;\n'
    '            const batch3 = arRowsPage || [];\n'
    '            arRows = arRows.concat(batch3);\n'
    '            if (batch3.length < PAGE_PROD3) break;\n'
    '            pf3 += PAGE_PROD3;\n'
    '          }\n'
    '        }\n'
    '        (arRows || []).forEach((p) => {\n'
    '          const a = appAsOfByCode[p.dse_code] || (appAsOfByCode[p.dse_code] = 0);\n'
    '          appAsOfByCode[p.dse_code] = a + fRaw(p.nilai_sp) + fRaw(p.nilai_voucher) + fRaw(p.nilai_saldo);\n'
    '        });\n'
    '      }\n',

    '    if (hasUpload && capturedAsOf != null) {\n'
    '      const startISO = `${uploadPeriod}-01`;\n'
    '      const endISO = `${uploadPeriod}-${String(capturedAsOf).padStart(2, "0")}`;\n'
    '      const arRows = await fetchProdArPaged(codes, datesBetween(startISO, endISO), "dse_code, nilai_sp, nilai_voucher, nilai_saldo");\n'
    '      arRows.forEach((p) => {\n'
    '        const a = appAsOfByCode[p.dse_code] || (appAsOfByCode[p.dse_code] = 0);\n'
    '        appAsOfByCode[p.dse_code] = a + fRaw(p.nilai_sp) + fRaw(p.nilai_voucher) + fRaw(p.nilai_saldo);\n'
    '      });\n',
    label="fetchDseLevelForExport arRows per-tanggal",
)

# handleExportDailyRange: query utama -> loop PER TANGGAL (bukan gte/lte
# lintas semua tanggal rentang) - ini yg kena bug user persis.
do(
    '      const CHUNK = 500;\n'
    '      const PAGE = 1000;\n'
    '      const MAX_EXPORT_ROWS = 1000000; // BARU (permintaan user - "jika lebih dari 1juta baris maka dia akan muncul notif dan akan download sesuai limit maksimal")\n'
    '      let allRows = [];\n'
    '      let truncated = false;\n'
    '      setExportProgress({ active: true, label: "Mengambil data harian...", current: 0, total: codes.length });\n'
    '      outerDailyFetch:\n'
    '      for (let i = 0; i < codes.length; i += CHUNK) {\n'
    '        const chunk = codes.slice(i, i + CHUNK);\n'
    '        let pf = 0;\n'
    '        while (true) {\n'
    '          const { data: prodPage, error: e2 } = await supabase.from("mf_dse_prod_ar")\n'
    '            .select("dse_code, tanggal, nilai_sp, nilai_fwa, nilai_voucher, nilai_saldo")\n'
    '            .in("dse_code", chunk).gte("tanggal", exportDailyFrom).lte("tanggal", exportDailyTo)\n'
    '            .range(pf, pf + PAGE - 1);\n'
    '          if (e2) throw e2;\n'
    '          const batch = prodPage || [];\n'
    '          // BARU: berhenti ambil data SEGERA begitu nyentuh limit -\n'
    '          // bukan fetch semua baru dipotong - jadi baris yg lewat\n'
    '          // limit TIDAK PERNAH masuk memori sama sekali.\n'
    '          if (allRows.length + batch.length > MAX_EXPORT_ROWS) {\n'
    '            allRows = allRows.concat(batch.slice(0, MAX_EXPORT_ROWS - allRows.length));\n'
    '            truncated = true;\n'
    '            break outerDailyFetch;\n'
    '          }\n'
    '          allRows = allRows.concat(batch);\n'
    '          if (batch.length < PAGE) break;\n'
    '          pf += PAGE;\n'
    '        }\n'
    '        setExportProgress({ active: true, label: "Mengambil data harian...", current: Math.min(i + CHUNK, codes.length), total: codes.length });\n'
    '      }\n'
    '      setExportProgress({ active: false, label: "", current: 0, total: 0 });\n',

    '      const CHUNK = 500;\n'
    '      const PAGE = 1000;\n'
    '      const MAX_EXPORT_ROWS = 1000000; // BARU (permintaan user - "jika lebih dari 1juta baris maka dia akan muncul notif dan akan download sesuai limit maksimal")\n'
    '      const rangeDates = datesBetween(exportDailyFrom, exportDailyTo);\n'
    '      let allRows = [];\n'
    '      let truncated = false;\n'
    '      setExportProgress({ active: true, label: "Mengambil data harian...", current: 0, total: rangeDates.length });\n'
    '      // FIX (error user - "canceling statement due to statement\n'
    '      // timeout" pas export rentang 1-25): query lintas BANYAK tanggal\n'
    '      // sekaligus (gte/lte) + .range() OFFSET di atasnya mahal banget\n'
    '      // krn RLS tabel ini berat - dipecah PER TANGGAL (kolom tanggal\n'
    '      // ada index-nya) supaya tiap query jauh lebih kecil & murah.\n'
    '      outerDailyFetch:\n'
    '      for (let di = 0; di < rangeDates.length; di++) {\n'
    '        const dt = rangeDates[di];\n'
    '        for (let i = 0; i < codes.length; i += CHUNK) {\n'
    '          const chunk = codes.slice(i, i + CHUNK);\n'
    '          let pf = 0;\n'
    '          while (true) {\n'
    '            const { data: prodPage, error: e2 } = await supabase.from("mf_dse_prod_ar")\n'
    '              .select("dse_code, tanggal, nilai_sp, nilai_fwa, nilai_voucher, nilai_saldo")\n'
    '              .in("dse_code", chunk).eq("tanggal", dt)\n'
    '              .range(pf, pf + PAGE - 1);\n'
    '            if (e2) throw e2;\n'
    '            const batch = prodPage || [];\n'
    '            // BARU: berhenti ambil data SEGERA begitu nyentuh limit -\n'
    '            // bukan fetch semua baru dipotong - jadi baris yg lewat\n'
    '            // limit TIDAK PERNAH masuk memori sama sekali.\n'
    '            if (allRows.length + batch.length > MAX_EXPORT_ROWS) {\n'
    '              allRows = allRows.concat(batch.slice(0, MAX_EXPORT_ROWS - allRows.length));\n'
    '              truncated = true;\n'
    '              break outerDailyFetch;\n'
    '            }\n'
    '            allRows = allRows.concat(batch);\n'
    '            if (batch.length < PAGE) break;\n'
    '            pf += PAGE;\n'
    '          }\n'
    '        }\n'
    '        setExportProgress({ active: true, label: `Mengambil data harian... (${dt})`, current: di + 1, total: rangeDates.length });\n'
    '      }\n'
    '      setExportProgress({ active: false, label: "", current: 0, total: 0 });\n',
    label="handleExportDailyRange per-tanggal + cap + progress",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - query export mf_dse_prod_ar dipecah PER TANGGAL (fix statement timeout)")
