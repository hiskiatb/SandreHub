path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# FIX (bug report user - "bukannya datanya lebih dari 2000 baris ya"):
# Supabase/PostgREST default limit 1000 baris per query - query mf_dse_prod_ar
# di fetchLevelSummaryForExport & fetchDseLevelForExport (prod query utama)
# TIDAK pakai .range() pagination, jadi kepotong diam2 kalau rentang tanggal
# x jumlah DSE per chunk > 1000 baris. Ini muncul 2x identik di 2 fungsi -
# paginate pakai .range() loop sampai page < PAGE_PROD (artinya udah abis).
do(
    '      let prodQuery = supabase.from("mf_dse_prod_ar").select("dse_code, tanggal, nilai_sp, nilai_fwa, nilai_voucher, nilai_saldo").in("dse_code", chunk);\n'
    '      prodQuery = isRangeModeExport ? prodQuery.in("tanggal", sortedSelectedDates) : prodQuery.eq("tanggal", entryDate);\n'
    '      const { data: prod, error: e2 } = await prodQuery;\n'
    '      if (e2) throw e2;\n',

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
    '      }\n',
    n=2, label="prod query utama (2 fungsi)",
)

# FIX pagination yg sama utk query "as of cutoff" (prod2) di
# fetchLevelSummaryForExport - dipakai itung kolom Selisih.
do(
    '        for (let i = 0; i < codes.length; i += CHUNK) {\n'
    '          const chunk = codes.slice(i, i + CHUNK);\n'
    '          const { data: prod2, error: e3 } = await supabase.from("mf_dse_prod_ar")\n'
    '            .select("dse_code, tanggal, nilai_sp, nilai_voucher, nilai_saldo")\n'
    '            .in("dse_code", chunk).gte("tanggal", `${uploadPeriod}-01`).lte("tanggal", cutoffAsOf);\n'
    '          if (e3) throw e3;\n',

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
    '          }\n',
    label="prod2 asOf cutoff (fetchLevelSummaryForExport)",
)

# FIX pagination yg sama utk query "as of cutoff" (arRows) di
# fetchDseLevelForExport.
do(
    '      for (let i = 0; i < codes.length; i += CHUNK) {\n'
    '        const chunk = codes.slice(i, i + CHUNK);\n'
    '        const { data: arRows, error: e3 } = await supabase.from("mf_dse_prod_ar")\n'
    '          .select("dse_code, nilai_sp, nilai_voucher, nilai_saldo")\n'
    '          .in("dse_code", chunk).gte("tanggal", startISO).lte("tanggal", endISO);\n'
    '        if (e3) throw e3;\n',

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
    '        }\n',
    label="arRows asOf cutoff (fetchDseLevelForExport)",
)

# BARU: state progress export bersama (dipakai overlay animasi + oleh
# handleExportDailyRange & handleExportFullXlsx).
do(
    '  const [exportingDailyRange, setExportingDailyRange] = useState(false);\n',
    '  const [exportingDailyRange, setExportingDailyRange] = useState(false);\n'
    '  // BARU (permintaan user - "buat progress dan animasi yang sangat\n'
    '  // bagus saat export export data ini"): state progress bersama utk\n'
    '  // overlay animasi export (dipakai handleExportDailyRange &\n'
    '  // handleExportFullXlsx).\n'
    '  const [exportProgress, setExportProgress] = useState({ active: false, label: "", current: 0, total: 0 });\n',
    label="state exportProgress",
)

# FIX + BARU utama: query utama handleExportDailyRange (ini yg kena bug
# user, kepotong ~2000 baris) - sekarang di-paginate (.range()) SEKALIGUS
# early-stop begitu total baris udah capai MAX_EXPORT_ROWS (supaya BENERAN
# hemat memori, bukan fetch semua baru dipotong), + update progress per
# chunk DSE yg diproses.
do(
    '      const CHUNK = 500;\n'
    '      let allRows = [];\n'
    '      for (let i = 0; i < codes.length; i += CHUNK) {\n'
    '        const chunk = codes.slice(i, i + CHUNK);\n'
    '        const { data: prod, error: e2 } = await supabase.from("mf_dse_prod_ar")\n'
    '          .select("dse_code, tanggal, nilai_sp, nilai_fwa, nilai_voucher, nilai_saldo")\n'
    '          .in("dse_code", chunk).gte("tanggal", exportDailyFrom).lte("tanggal", exportDailyTo);\n'
    '        if (e2) throw e2;\n'
    '        allRows = allRows.concat(prod || []);\n'
    '      }\n'
    '      if (!allRows.length) {\n',

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
    '      setExportProgress({ active: false, label: "", current: 0, total: 0 });\n'
    '      if (truncated) {\n'
    '        showToast(`Data melebihi ${MAX_EXPORT_ROWS.toLocaleString("id-ID")} baris — download dibatasi sampai limit maksimal. Persempit rentang tanggal utk data lengkap.`, "error");\n'
    '      }\n'
    '      if (!allRows.length) {\n',
    label="handleExportDailyRange prod query + cap + progress",
)

# Reset progress overlay juga di "finally" handleExportDailyRange (jaga2
# kalau error di tengah jalan, overlay ga nyangkut nyala terus).
do(
    '      showToast(`Export selesai — ${body.length} baris.`, "ok");\n'
    '    } catch (e) {\n'
    '      showToast(e.message || "Gagal export data harian.", "error");\n'
    '    } finally {\n'
    '      setExportingDailyRange(false);\n'
    '    }\n'
    '  };\n'
    '  const handleExportFullXlsx',

    '      showToast(`Export selesai — ${body.length} baris.`, "ok");\n'
    '    } catch (e) {\n'
    '      setExportProgress({ active: false, label: "", current: 0, total: 0 });\n'
    '      showToast(e.message || "Gagal export data harian.", "error");\n'
    '    } finally {\n'
    '      setExportingDailyRange(false);\n'
    '    }\n'
    '  };\n'
    '  const handleExportFullXlsx',
    label="finally handleExportDailyRange",
)

# BARU: progress overlay utk handleExportFullXlsx (5 tahap: Partner,
# Region, Area, District, lalu DSE).
do(
    '      const wb = XLSX.utils.book_new();\n'
    '      const levelDefs = [\n'
    '        { lvl: "partner", sheet: "Partner", label: "Partner" },\n'
    '        { lvl: "region", sheet: "Region", label: "Region" },\n'
    '        { lvl: "branch", sheet: "Area", label: "Area" },\n'
    '        { lvl: "mc", sheet: "District", label: "District" },\n'
    '      ];\n'
    '      for (const { lvl, sheet, label } of levelDefs) {\n'
    '        const { rows, uploadAvailable } = await fetchLevelSummaryForExport(lvl, includeCompare);\n',

    '      const wb = XLSX.utils.book_new();\n'
    '      const levelDefs = [\n'
    '        { lvl: "partner", sheet: "Partner", label: "Partner" },\n'
    '        { lvl: "region", sheet: "Region", label: "Region" },\n'
    '        { lvl: "branch", sheet: "Area", label: "Area" },\n'
    '        { lvl: "mc", sheet: "District", label: "District" },\n'
    '      ];\n'
    '      const totalExportSteps = levelDefs.length + 1;\n'
    '      let exportStepIdx = 0;\n'
    '      setExportProgress({ active: true, label: "Menyiapkan export lengkap...", current: 0, total: totalExportSteps });\n'
    '      for (const { lvl, sheet, label } of levelDefs) {\n'
    '        setExportProgress({ active: true, label: `Memproses level ${label}...`, current: exportStepIdx, total: totalExportSteps });\n'
    '        const { rows, uploadAvailable } = await fetchLevelSummaryForExport(lvl, includeCompare);\n',
    label="full xlsx progress init",
)

do(
    '        XLSX.utils.book_append_sheet(wb, ws, sheet);\n'
    '      }\n'
    '      const dseRows = await fetchDseLevelForExport(includeCompare);\n',

    '        XLSX.utils.book_append_sheet(wb, ws, sheet);\n'
    '        exportStepIdx++;\n'
    '      }\n'
    '      setExportProgress({ active: true, label: "Memproses level DSE...", current: exportStepIdx, total: totalExportSteps });\n'
    '      const dseRows = await fetchDseLevelForExport(includeCompare);\n',
    label="full xlsx progress DSE step",
)

do(
    '      XLSX.writeFile(wb, `Lengkap_SemuaLevel_${periodeLabel}.xlsx`);\n'
    '      showToast(`Export lengkap selesai — 4 level + DSE.`, "ok");\n'
    '    } catch (e) {\n'
    '      showToast(e.message || "Gagal export lengkap.", "error");\n'
    '    } finally {\n'
    '      setExportingFullXlsx(false);\n'
    '    }\n'
    '  };\n',

    '      XLSX.writeFile(wb, `Lengkap_SemuaLevel_${periodeLabel}.xlsx`);\n'
    '      setExportProgress({ active: false, label: "", current: 0, total: 0 });\n'
    '      showToast(`Export lengkap selesai — 4 level + DSE.`, "ok");\n'
    '    } catch (e) {\n'
    '      setExportProgress({ active: false, label: "", current: 0, total: 0 });\n'
    '      showToast(e.message || "Gagal export lengkap.", "error");\n'
    '    } finally {\n'
    '      setExportingFullXlsx(false);\n'
    '    }\n'
    '  };\n',
    label="full xlsx progress reset + finally",
)

# BARU: overlay animasi progress export (portal ke document.body, spinner
# ring + progress bar gradient) - ikut pola createPortal file ini. Taruh
# persis setelah dropdown menu export supaya satu kelompok dgn fitur export.
do(
    '                  </div>,\n'
    '                  document.body\n'
    '                )}\n'
    '              </div>\n'
    '            )}\n'
    '          </div>\n'
    '        </>\n'
    '      )}\n',

    '                  </div>,\n'
    '                  document.body\n'
    '                )}\n'
    '              </div>\n'
    '            )}\n'
    '          </div>\n'
    '        </>\n'
    '      )}\n\n'
    '      {/* BARU (permintaan user - "buat progress dan animasi yang\n'
    '          sangat bagus saat export export data ini"): overlay progress\n'
    '          export (spinner ring + progress bar gradient), extend style\n'
    '          keyframes global yg udah ada (spin, modalPopIn, loadingFadeIn)\n'
    '          biar konsisten sama animasi lain di file ini. */}\n'
    '      {exportProgress.active && typeof document !== "undefined" && createPortal(\n'
    '        <div style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", animation: "loadingFadeIn 0.15s ease", fontFamily: FONT }}>\n'
    '          <div style={{ background: t.card, borderRadius: 14, padding: "26px 30px", minWidth: 260, maxWidth: 320, boxShadow: t.shadowMd || "0 12px 32px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animation: "modalPopIn 0.22s cubic-bezier(0.16,1,0.3,1)" }}>\n'
    '            <div style={{ position: "relative", width: 52, height: 52 }}>\n'
    '              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `4px solid ${t.line}` }} />\n'
    '              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "4px solid transparent", borderTopColor: t.teal, animation: "spin 0.9s linear infinite" }} />\n'
    '            </div>\n'
    '            <div style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, textAlign: "center" }}>{exportProgress.label || "Memproses export..."}</div>\n'
    '            {exportProgress.total > 0 && (\n'
    '              <div style={{ width: "100%" }}>\n'
    '                <div style={{ width: "100%", height: 7, borderRadius: 999, background: t.sub, overflow: "hidden" }}>\n'
    '                  <div style={{ width: `${Math.min(100, Math.round((exportProgress.current / exportProgress.total) * 100))}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${t.teal}, #22d3ee)`, transition: "width 0.25s ease" }} />\n'
    '                </div>\n'
    '                <div style={{ fontSize: 10.5, color: t.lo, textAlign: "center", marginTop: 6 }}>{exportProgress.current} / {exportProgress.total}</div>\n'
    '              </div>\n'
    '            )}\n'
    '          </div>\n'
    '        </div>,\n'
    '        document.body\n'
    '      )}\n',
    label="overlay progress export portal",
)

assert src != orig, "no changes applied"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK - pagination fix + MAX_EXPORT_ROWS cap + progress overlay berhasil di-patch")
