path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# FIX (keluhan user - "mengapa sangat sangat lambat"): fix sebelumnya
# (pecah query per TANGGAL biar ga kena statement timeout) secara
# TIDAK SENGAJA bikin super lambat, krn tiap tanggal x tiap chunk DSE
# di-await SATU PER SATU berurutan (25 hari x 3 chunk = 75 round-trip
# network BERURUTAN per level - makanya "Memproses level Region..."
# nyangkut lama).
# Query per-tanggal TETAP perlu (itu yg nyelametin dari statement
# timeout, krn tiap query jadi kecil & murah), tapi TIDAK PERLU
# dijalankan satu2 berurutan - dijalankan PARALEL pakai worker pool
# kecil (concurrency dibatasi 6 biar ga overload koneksi) jauh lebih
# cepat TANPA balik ke query lebar yg bikin timeout.
do(
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

    'const fetchProdArPaged = async (codes, dates, selectCols, chunkSize = 500, pageSize = 1000, concurrency = 6) => {\n'
    '  const chunks = [];\n'
    '  for (let i = 0; i < codes.length; i += chunkSize) chunks.push(codes.slice(i, i + chunkSize));\n'
    '  const tasks = [];\n'
    '  for (const dt of dates) for (const chunk of chunks) tasks.push({ dt, chunk });\n'
    '  const results = new Array(tasks.length);\n'
    '  let nextIdx = 0;\n'
    '  const runOne = async (dt, chunk) => {\n'
    '    let from = 0;\n'
    '    let rows = [];\n'
    '    while (true) {\n'
    '      const { data, error } = await supabase.from("mf_dse_prod_ar").select(selectCols)\n'
    '        .in("dse_code", chunk).eq("tanggal", dt).range(from, from + pageSize - 1);\n'
    '      if (error) throw error;\n'
    '      const batch = data || [];\n'
    '      rows = rows.concat(batch);\n'
    '      if (batch.length < pageSize) break;\n'
    '      from += pageSize;\n'
    '    }\n'
    '    return rows;\n'
    '  };\n'
    '  const worker = async () => {\n'
    '    while (nextIdx < tasks.length) {\n'
    '      const myIdx = nextIdx++;\n'
    '      results[myIdx] = await runOne(tasks[myIdx].dt, tasks[myIdx].chunk);\n'
    '    }\n'
    '  };\n'
    '  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) || 1 }, () => worker()));\n'
    '  return results.flat();\n'
    '};\n',
    label="fetchProdArPaged jadi paralel (worker pool)",
)

# handleExportDailyRange juga punya loop manual sendiri (bukan pakai
# fetchProdArPaged) - sama2 dipercepat: tiap TANGGAL fetch semua chunk DSE
# PARALEL, dan beberapa TANGGAL sekaligus diproses PARALEL per batch
# (BATCH_DATES), bukan 1 per 1 berurutan.
do(
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
    '      }\n',

    '      const chunksList = [];\n'
    '      for (let i = 0; i < codes.length; i += CHUNK) chunksList.push(codes.slice(i, i + CHUNK));\n'
    '      // BARU (keluhan user - "mengapa sangat sangat lambat"): tiap\n'
    '      // tanggal x tiap chunk DSE di-fetch PARALEL (bukan 1-per-1\n'
    '      // berurutan), & beberapa tanggal sekaligus diproses per batch -\n'
    '      // query per tanggal tetap kecil & murah (ga kena statement\n'
    '      // timeout kayak sebelumnya), tapi jauh lebih cepat.\n'
    '      const BATCH_DATES = 5;\n'
    '      const fetchOneDate = async (dt) => {\n'
    '        const chunkResults = await Promise.all(chunksList.map(async (chunk) => {\n'
    '          let pf = 0;\n'
    '          let rows = [];\n'
    '          while (true) {\n'
    '            const { data: prodPage, error: e2 } = await supabase.from("mf_dse_prod_ar")\n'
    '              .select("dse_code, tanggal, nilai_sp, nilai_fwa, nilai_voucher, nilai_saldo")\n'
    '              .in("dse_code", chunk).eq("tanggal", dt)\n'
    '              .range(pf, pf + PAGE - 1);\n'
    '            if (e2) throw e2;\n'
    '            const batch = prodPage || [];\n'
    '            rows = rows.concat(batch);\n'
    '            if (batch.length < PAGE) break;\n'
    '            pf += PAGE;\n'
    '          }\n'
    '          return rows;\n'
    '        }));\n'
    '        return chunkResults.flat();\n'
    '      };\n'
    '      outerDailyFetch:\n'
    '      for (let bi = 0; bi < rangeDates.length; bi += BATCH_DATES) {\n'
    '        const dateBatch = rangeDates.slice(bi, bi + BATCH_DATES);\n'
    '        const batchResults = await Promise.all(dateBatch.map(fetchOneDate));\n'
    '        for (const rows of batchResults) {\n'
    '          // BARU: berhenti ambil data SEGERA begitu nyentuh limit -\n'
    '          // bukan fetch semua baru dipotong - jadi baris yg lewat\n'
    '          // limit TIDAK PERNAH masuk memori sama sekali.\n'
    '          if (allRows.length + rows.length > MAX_EXPORT_ROWS) {\n'
    '            allRows = allRows.concat(rows.slice(0, MAX_EXPORT_ROWS - allRows.length));\n'
    '            truncated = true;\n'
    '            break outerDailyFetch;\n'
    '          }\n'
    '          allRows = allRows.concat(rows);\n'
    '        }\n'
    '        setExportProgress({ active: true, label: "Mengambil data harian...", current: Math.min(bi + BATCH_DATES, rangeDates.length), total: rangeDates.length });\n'
    '      }\n',
    label="handleExportDailyRange loop jadi paralel per batch tanggal",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - fetchProdArPaged sekarang jalan paralel (concurrency 6), jauh lebih cepat")
