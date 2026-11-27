path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# FIX (keluhan user - "mengapa hanya sampai 1000 ya dsenya"): BUG YG SAMA
# PERSIS (Supabase/PostgREST default limit 1000 baris per query), kali ini
# di query LIST MASTER DSE (mf_dse_database) sendiri di 3 fungsi export -
# total DSE aktif+vacant+OJT di database ini 1085 (> 1000), jadi 85 DSE
# terakhir selalu kepotong diam2 krn query-nya ga di-paginate. Fix: helper
# fetchAllPaged() generik dgn .range() loop, dipakai gantiin 3 query
# "dses" yg sebelumnya cuma eq("is_revoked", false) tanpa pagination.
do(
    'const fetchProdArPaged = async (codes, dates, selectCols, chunkSize = 500, pageSize = 1000, concurrency = 6) => {\n',

    '// BARU: helper generik fetch SEMUA baris dari 1 tabel pakai .range()\n'
    '// pagination - dipakai utk query master DSE (mf_dse_database) di\n'
    '// export supaya ga kepotong diam2 kalau jumlah DSE > 1000 baris.\n'
    'const fetchAllPaged = async (buildQuery, pageSize = 1000) => {\n'
    '  let all = [];\n'
    '  let from = 0;\n'
    '  while (true) {\n'
    '    const { data, error } = await buildQuery().range(from, from + pageSize - 1);\n'
    '    if (error) throw error;\n'
    '    const batch = data || [];\n'
    '    all = all.concat(batch);\n'
    '    if (batch.length < pageSize) break;\n'
    '    from += pageSize;\n'
    '  }\n'
    '  return all;\n'
    '};\n'
    'const fetchProdArPaged = async (codes, dates, selectCols, chunkSize = 500, pageSize = 1000, concurrency = 6) => {\n',
    label="helper fetchAllPaged",
)

do(
    '  const fetchLevelSummaryForExport = async (lvl, includeCompare) => {\n'
    '    const { data: dses, error: e1 } = await supabase.from("mf_dse_database").select("dse_code, region, branch, mc, mdi, dse_status").eq("is_revoked", false);\n'
    '    if (e1) throw e1;\n',

    '  const fetchLevelSummaryForExport = async (lvl, includeCompare) => {\n'
    '    const dses = await fetchAllPaged(() => supabase.from("mf_dse_database").select("dse_code, region, branch, mc, mdi, dse_status").eq("is_revoked", false));\n',
    label="fetchLevelSummaryForExport dses paginated",
)

do(
    '  const fetchDseLevelForExport = async (includeCompare) => {\n'
    '    const { data: dses, error: e1 } = await supabase.from("mf_dse_database").select("dse_code, region, branch, mc, mdi, ds_name, dse_status").eq("is_revoked", false);\n'
    '    if (e1) throw e1;\n',

    '  const fetchDseLevelForExport = async (includeCompare) => {\n'
    '    const dses = await fetchAllPaged(() => supabase.from("mf_dse_database").select("dse_code, region, branch, mc, mdi, ds_name, dse_status").eq("is_revoked", false));\n',
    label="fetchDseLevelForExport dses paginated",
)

do(
    '      const { data: dses, error: e1 } = await supabase.from("mf_dse_database").select("dse_code, region, branch, mc, mdi, ds_name").eq("is_revoked", false);\n'
    '      if (e1) throw e1;\n'
    '      const metaByCode = {};\n',

    '      const dses = await fetchAllPaged(() => supabase.from("mf_dse_database").select("dse_code, region, branch, mc, mdi, ds_name").eq("is_revoked", false));\n'
    '      const metaByCode = {};\n',
    label="handleExportDailyRange dses paginated",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - query master DSE (mf_dse_database) di export sekarang di-paginate, ga kepotong di 1000 lagi")
