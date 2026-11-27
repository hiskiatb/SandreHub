path = "app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
orig = src

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new)

# 1) Helper module-level baru: fetch & agregasi ar_piutang_items/payments
# (atau dso_piutang_*/hoa_piutang_* - generik lewat parameter) PER-CODE,
# dipaginasi (.range()) per chunk 500 kode - supaya aman dari limit
# default 1000 baris Supabase (bug class yg sama yg sudah berkali2
# diperbaiki di export Penjualan sebelumnya).
do(
    "  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) || 1 }, () => worker()));\n"
    "  return results.flat();\n"
    "};\n",

    "  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) || 1 }, () => worker()));\n"
    "  return results.flat();\n"
    "};\n"
    "\n"
    "// BARU (permintaan user - \"buat agar untuk ar dse hoa dso dsp semuanya\n"
    "// bisa di export juga\"): fetch+agregasi item piutang (ar_piutang_items,\n"
    "// dso_piutang_items, atau hoa_piutang_items - generik lewat parameter\n"
    "// itemsTable/paymentsTable/codeField) PER-KODE, dipaginasi (.range())\n"
    "// per chunk 500 kode - mencegah limit default 1000 baris Supabase kalau\n"
    "// 1 chunk kode punya lebih dari 1000 baris item piutang. Return:\n"
    "// { [code]: { totalPiutang, totalDibayar, lunas, jatuhTempo, keterangan } }\n"
    "// - sama persis bentuk `arItemsAgg` yg sudah ada, supaya export & tampilan\n"
    "// layar selalu konsisten.\n"
    "const fetchPiutangAggByCode = async (itemsTable, paymentsTable, codeField, codes, chunkSize = 500, pageSize = 1000) => {\n"
    "  const chunks = [];\n"
    "  for (let i = 0; i < codes.length; i += chunkSize) chunks.push(codes.slice(i, i + chunkSize));\n"
    "  const agg = {};\n"
    "  for (const chunk of chunks) {\n"
    "    let from = 0;\n"
    "    while (true) {\n"
    "      const { data, error } = await supabase.from(itemsTable)\n"
    "        .select(`${codeField}, total, jatuh_tempo, catatan, ${paymentsTable}(nominal, deleted_at)`)\n"
    "        .in(codeField, chunk).is(\"deleted_at\", null).range(from, from + pageSize - 1);\n"
    "      if (error) throw error;\n"
    "      const batch = data || [];\n"
    "      batch.forEach((it) => {\n"
    "        const code = it[codeField];\n"
    "        const a = agg[code] || (agg[code] = { totalPiutang: 0, totalDibayar: 0, unpaid: [] });\n"
    "        const total = fRaw(it.total);\n"
    "        const paid = (it[paymentsTable] || []).filter((p) => !p.deleted_at).reduce((s, p) => s + fRaw(p.nominal), 0);\n"
    "        a.totalPiutang += total;\n"
    "        a.totalDibayar += paid;\n"
    "        if (paid < total) a.unpaid.push({ jatuh_tempo: it.jatuh_tempo, catatan: it.catatan });\n"
    "      });\n"
    "      if (batch.length < pageSize) break;\n"
    "      from += pageSize;\n"
    "    }\n"
    "  }\n"
    "  const out = {};\n"
    "  Object.keys(agg).forEach((code) => {\n"
    "    const a = agg[code];\n"
    "    const nearest = a.unpaid.filter((u) => u.jatuh_tempo).sort((x, y) => new Date(x.jatuh_tempo) - new Date(y.jatuh_tempo))[0] || null;\n"
    "    out[code] = {\n"
    "      totalPiutang: a.totalPiutang, totalDibayar: a.totalDibayar,\n"
    "      lunas: a.unpaid.length === 0,\n"
    "      jatuhTempo: nearest?.jatuh_tempo || \"\",\n"
    "      keterangan: nearest?.catatan || \"\",\n"
    "    };\n"
    "  });\n"
    "  return out;\n"
    "};\n",
    label="helper fetchPiutangAggByCode",
)

# 2) Fetch functions + export handlers + state baru utk AR DSE, disisipkan
# sebelum blok "Download Lengkap" Penjualan yg sudah ada.
do(
    '  // BARU: "Download Lengkap" - 1 file xlsx isi 5 sheet (Partner, Region,\n'
    '  // Area, District, DSE) sekaligus, masing2 full (ga kepengaruh filter/\n'
    '  // level yg lagi dibuka di layar).\n'
    '  const [exportingFullXlsx, setExportingFullXlsx] = useState(false);\n',

    '  // BARU (permintaan user - "buat agar untuk ar dse hoa dso dsp semuanya\n'
    '  // bisa di export juga"): fetch rollup Partner/Region/Area/District utk\n'
    '  // export AR - `scoped=true` ikut filter drill-down yg lagi aktif di\n'
    '  // layar (dipakai "Export Tampilan Saat Ini"), `scoped=false` full semua\n'
    '  // DSE (dipakai "Download Lengkap", SAMA konvensi dgn export Penjualan).\n'
    '  const fetchArLevelSummaryForExport = async (lvl, scoped = false) => {\n'
    '    const buildDseQuery = () => {\n'
    '      let q = supabase.from("mf_dse_database").select("dse_code, region, branch, mc, mdi, dse_status").eq("is_revoked", false);\n'
    '      if (scoped) {\n'
    '        if (partnerFilter) q = q.eq("mdi", partnerFilter);\n'
    '        if (regionFilter) q = q.eq("region", regionFilter);\n'
    '        if (branchFilter) q = q.eq("branch", branchFilter);\n'
    '        if (mcFilter) q = q.eq("mc", mcFilter);\n'
    '      }\n'
    '      return q;\n'
    '    };\n'
    '    const dses = await fetchAllPaged(buildDseQuery);\n'
    '    const emptyLabelMap = { partner: "Belum Ada Partner", region: "Belum Ada Region", branch: "Belum Ada Area", mc: "Belum Ada District" };\n'
    '    const emptyLabel = emptyLabelMap[lvl] || "Belum Ada Region";\n'
    '    const groupOf = {}; const byGroup = {};\n'
    '    (dses || []).forEach((r) => {\n'
    '      const key = lvl === "partner" ? (r.mdi || emptyLabel) : lvl === "branch" ? (r.branch || emptyLabel) : lvl === "mc" ? (r.mc || emptyLabel) : (r.region || emptyLabel);\n'
    '      groupOf[r.dse_code] = key;\n'
    '      if (!byGroup[key]) byGroup[key] = { key, totalDse: 0, totalPiutang: 0, totalDibayar: 0, lunasCount: 0, belumLunasCount: 0, nearestJatuhTempo: null };\n'
    '      byGroup[key].totalDse += 1;\n'
    '    });\n'
    '    const codes = (dses || []).map((r) => r.dse_code);\n'
    '    const agg = codes.length ? await fetchPiutangAggByCode("ar_piutang_items", "ar_piutang_payments", "dse_code", codes) : {};\n'
    '    codes.forEach((code) => {\n'
    '      const g = byGroup[groupOf[code]];\n'
    '      if (!g) return;\n'
    '      const a = agg[code];\n'
    '      if (!a) { g.lunasCount += 1; return; }\n'
    '      g.totalPiutang += a.totalPiutang; g.totalDibayar += a.totalDibayar;\n'
    '      if (a.lunas) g.lunasCount += 1; else g.belumLunasCount += 1;\n'
    '      if (!a.lunas && a.jatuhTempo && (!g.nearestJatuhTempo || a.jatuhTempo < g.nearestJatuhTempo)) g.nearestJatuhTempo = a.jatuhTempo;\n'
    '    });\n'
    '    return Object.values(byGroup).sort((x, y) => (y.totalPiutang - y.totalDibayar) - (x.totalPiutang - x.totalDibayar));\n'
    '  };\n'
    '\n'
    '  // BARU: fetch per-DSE (level "DSE") utk export AR "Download Lengkap" -\n'
    '  // full semua DSE (ga kepengaruh filter layar, sama konvensi export\n'
    '  // Penjualan). Export "Tampilan Saat Ini" level DSE pakai data yg SUDAH\n'
    '  // ada di layar (columnFilteredDse) - ga perlu fetch ulang.\n'
    '  const fetchArDseLevelForExport = async () => {\n'
    '    const dses = await fetchAllPaged(() => supabase.from("mf_dse_database").select("dse_code, mdi, region, branch, mc, ds_name, dse_status").eq("is_revoked", false));\n'
    '    const codes = (dses || []).map((r) => r.dse_code);\n'
    '    const agg = codes.length ? await fetchPiutangAggByCode("ar_piutang_items", "ar_piutang_payments", "dse_code", codes) : {};\n'
    '    return (dses || []).map((r) => {\n'
    '      const a = agg[r.dse_code];\n'
    '      const totalPiutang = a ? a.totalPiutang : 0;\n'
    '      const totalDibayar = a ? a.totalDibayar : 0;\n'
    '      return {\n'
    '        dse_code: r.dse_code, partner: r.mdi || "", region: r.region || "", branch: r.branch || "", mc: r.mc || "", nama: r.ds_name || "", status: r.dse_status || "",\n'
    '        totalPiutang, totalDibayar, sisaPiutang: totalPiutang - totalDibayar,\n'
    '        statusLabel: a ? (a.lunas ? "Lunas" : "Belum Lunas") : "Lunas",\n'
    '        jatuhTempo: a?.jatuhTempo || "", keterangan: a?.keterangan || "",\n'
    '      };\n'
    '    }).sort((x, y) => y.sisaPiutang - x.sisaPiutang);\n'
    '  };\n'
    '\n'
    '  const [exportingArXlsx, setExportingArXlsx] = useState(false);\n'
    '  const [exportingArFullXlsx, setExportingArFullXlsx] = useState(false);\n'
    '\n'
    '  // BARU: "Export Tampilan Saat Ini" utk tab AR - level rollup pakai\n'
    '  // fetchArLevelSummaryForExport(lvl, scoped=true) (ikut filter drill-\n'
    '  // down aktif), level DSE pakai columnFilteredDse (data yg sudah\n'
    '  // tampil di layar, sudah difilter search/kolom).\n'
    '  const handleExportArXlsx = async () => {\n'
    '    setExportMenuOpen(false);\n'
    '    setExportingArXlsx(true);\n'
    '    try {\n'
    '      const periodeLabel = `${MONTH_NAMES[Number(calViewMonth.slice(5, 7)) - 1]}_${calViewMonth.slice(0, 4)}`;\n'
    '      const wb = XLSX.utils.book_new();\n'
    '      if (summaryGroupBy !== "dse") {\n'
    '        const rows = await fetchArLevelSummaryForExport(summaryGroupBy, true);\n'
    '        const head = ["#", summaryGroupLabel, "Jumlah DSE", "DSE Lunas", "DSE Belum Lunas", "Total Piutang (Rp)", "Total Dibayar (Rp)", "Sisa Piutang (Rp)", "Jatuh Tempo Terdekat"];\n'
    '        const body = rows.map((g, i) => [\n'
    '          i + 1, g.key, g.totalDse, g.lunasCount, g.belumLunasCount, g.totalPiutang, g.totalDibayar, g.totalPiutang - g.totalDibayar,\n'
    '          g.nearestJatuhTempo ? fmtDayMonth(g.nearestJatuhTempo) : "-",\n'
    '        ]);\n'
    '        const ws = buildXlsxSheet(head, body, [2, 3, 4, 5, 6, 7]);\n'
    '        XLSX.utils.book_append_sheet(wb, ws, summaryGroupLabel);\n'
    '        XLSX.writeFile(wb, `AR_${summaryGroupLabel}_${periodeLabel}.xlsx`);\n'
    '        showToast(`Export AR selesai — ${body.length} baris.`, "ok");\n'
    '      } else {\n'
    '        const rows = columnFilteredDse.filter((x) => {\n'
    '          if (!dseSearch) return true;\n'
    '          const s = dseSearch.toLowerCase();\n'
    '          const r = x.r;\n'
    '          return r.dse_code?.toLowerCase().includes(s) || r.dse_code_3id?.toLowerCase().includes(s) || r.ds_name?.toLowerCase().includes(s);\n'
    '        });\n'
    '        const head = ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Total Piutang (Rp)", "Total Dibayar (Rp)", "Sisa Piutang (Rp)", "Status Piutang", "Jatuh Tempo", "Keterangan"];\n'
    '        const body = rows.map((x, i) => [\n'
    '          i + 1, x.r.dse_code, x.partnerVal || "", x.regionVal || "", x.branchVal || "", x.mcVal || "", x.namaVal || "", x.statusVal || "",\n'
    '          x.totalPiutangVal, x.totalDibayarVal, x.totalPiutangVal - x.totalDibayarVal,\n'
    '          x.arStatusVal === "lunas" ? "Lunas" : "Belum Lunas", x.jatuhTempoVal ? fmtDayMonth(x.jatuhTempoVal) : "-", x.arKeteranganVal || "",\n'
    '        ]);\n'
    '        const ws = buildXlsxSheet(head, body, [8, 9, 10]);\n'
    '        XLSX.utils.book_append_sheet(wb, ws, "DSE");\n'
    '        XLSX.writeFile(wb, `AR_DSE_${periodeLabel}.xlsx`);\n'
    '        showToast(`Export AR selesai — ${body.length} baris.`, "ok");\n'
    '      }\n'
    '    } catch (e) {\n'
    '      showToast(e.message || "Gagal export AR.", "error");\n'
    '    } finally {\n'
    '      setExportingArXlsx(false);\n'
    '    }\n'
    '  };\n'
    '\n'
    '  // BARU: "Download Lengkap" AR - 1 file xlsx isi 5 sheet (Partner,\n'
    '  // Region, Area, District, DSE), full semua DSE (ga kepengaruh filter\n'
    '  // layar) - konsep & konvensi file SAMA PERSIS handleExportFullXlsx\n'
    '  // (Penjualan), cuma kolomnya Piutang bukan Penjualan.\n'
    '  const handleExportArFullXlsx = async () => {\n'
    '    setExportMenuOpen(false);\n'
    '    setExportingArFullXlsx(true);\n'
    '    try {\n'
    '      const periodeLabel = `${MONTH_NAMES[Number(calViewMonth.slice(5, 7)) - 1]}_${calViewMonth.slice(0, 4)}`;\n'
    '      const wb = XLSX.utils.book_new();\n'
    '      const levelDefs = [\n'
    '        { lvl: "partner", sheet: "Partner", label: "Partner" },\n'
    '        { lvl: "region", sheet: "Region", label: "Region" },\n'
    '        { lvl: "branch", sheet: "Area", label: "Area" },\n'
    '        { lvl: "mc", sheet: "District", label: "District" },\n'
    '      ];\n'
    '      const totalExportSteps = levelDefs.length + 1;\n'
    '      let exportStepIdx = 0;\n'
    '      setExportProgress({ active: true, label: "Menyiapkan export AR lengkap...", current: 0, total: totalExportSteps });\n'
    '      for (const { lvl, sheet, label } of levelDefs) {\n'
    '        setExportProgress({ active: true, label: `Memproses AR level ${label}...`, current: exportStepIdx, total: totalExportSteps });\n'
    '        const rows = await fetchArLevelSummaryForExport(lvl, false);\n'
    '        const head = ["#", label, "Jumlah DSE", "DSE Lunas", "DSE Belum Lunas", "Total Piutang (Rp)", "Total Dibayar (Rp)", "Sisa Piutang (Rp)", "Jatuh Tempo Terdekat"];\n'
    '        const body = rows.map((g, i) => [\n'
    '          i + 1, g.key, g.totalDse, g.lunasCount, g.belumLunasCount, g.totalPiutang, g.totalDibayar, g.totalPiutang - g.totalDibayar,\n'
    '          g.nearestJatuhTempo ? fmtDayMonth(g.nearestJatuhTempo) : "-",\n'
    '        ]);\n'
    '        const ws = buildXlsxSheet(head, body, [2, 3, 4, 5, 6, 7]);\n'
    '        XLSX.utils.book_append_sheet(wb, ws, sheet);\n'
    '        exportStepIdx++;\n'
    '      }\n'
    '      setExportProgress({ active: true, label: "Memproses AR level DSE...", current: exportStepIdx, total: totalExportSteps });\n'
    '      const dseRows = await fetchArDseLevelForExport();\n'
    '      const headDse = ["#", "Kode DSE", "Partner", "Region", "Area", "District", "Nama DSE", "Status", "Total Piutang (Rp)", "Total Dibayar (Rp)", "Sisa Piutang (Rp)", "Status Piutang", "Jatuh Tempo", "Keterangan"];\n'
    '      const bodyDse = dseRows.map((x, i) => [\n'
    '        i + 1, x.dse_code, x.partner, x.region, x.branch, x.mc, x.nama, x.status,\n'
    '        x.totalPiutang, x.totalDibayar, x.sisaPiutang, x.statusLabel, x.jatuhTempo ? fmtDayMonth(x.jatuhTempo) : "-", x.keterangan,\n'
    '      ]);\n'
    '      const wsDse = buildXlsxSheet(headDse, bodyDse, [8, 9, 10]);\n'
    '      XLSX.utils.book_append_sheet(wb, wsDse, "DSE");\n'
    '      XLSX.writeFile(wb, `AR_Lengkap_SemuaLevel_${periodeLabel}.xlsx`);\n'
    '      setExportProgress({ active: false, label: "", current: 0, total: 0 });\n'
    '      showToast(`Export AR lengkap selesai — 4 level + DSE.`, "ok");\n'
    '    } catch (e) {\n'
    '      setExportProgress({ active: false, label: "", current: 0, total: 0 });\n'
    '      showToast(e.message || "Gagal export AR lengkap.", "error");\n'
    '    } finally {\n'
    '      setExportingArFullXlsx(false);\n'
    '    }\n'
    '  };\n'
    '\n'
    '  // BARU: "Download Lengkap" - 1 file xlsx isi 5 sheet (Partner, Region,\n'
    '  // Area, District, DSE) sekaligus, masing2 full (ga kepengaruh filter/\n'
    '  // level yg lagi dibuka di layar).\n'
    '  const [exportingFullXlsx, setExportingFullXlsx] = useState(false);\n',
    label="fetch AR + handlers + state",
)

# 3) UI toolbar: tombol Export XLSX sekarang MUNCUL JUGA di tab AR (bukan
# cuma tab "input"/Penjualan). Dropdown-nya lebih simpel drpd Penjualan
# (ga ada opsi compare/upload data pembanding - ga relevan utk piutang,
# & ga ada mode harian krn ar_piutang_items bukan data per-tanggal).
do(
    '            {tab === "input" && (\n',
    '            {tab === "ar" && (\n'
    '              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>\n'
    '                <button ref={exportBtnRef} onClick={toggleExportMenu} disabled={exportingArXlsx || exportingArFullXlsx} title="Export ke Excel - pilih tampilan saat ini atau lengkap semua level"\n'
    '                  style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${exportMenuOpen ? t.teal : t.inputBd}`, background: t.inputBg, color: t.mid, fontSize: 11.5, fontWeight: 700, cursor: (exportingArXlsx || exportingArFullXlsx) ? "default" : "pointer", fontFamily: FONT, whiteSpace: "nowrap", opacity: (exportingArXlsx || exportingArFullXlsx) ? 0.6 : 1 }}>\n'
    '                  {(exportingArXlsx || exportingArFullXlsx) ? <Loader2 size={13} className="spin" /> : <FileDown size={13} />} {width >= 700 && "Export XLSX"} <ChevronDown size={12} />\n'
    '                </button>\n'
    '                {exportMenuOpen && typeof document !== "undefined" && createPortal(\n'
    '                  <div ref={exportMenuRef} style={{ position: "fixed", left: exportMenuPos.x, top: exportMenuPos.y, width: 270, borderRadius: 10, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowMd || "0 8px 24px rgba(0,0,0,0.18)", padding: 4, zIndex: 9999, fontFamily: FONT }}>\n'
    '                    <button onClick={handleExportArXlsx} style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 1, padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT }}\n'
    '                      onMouseEnter={(e) => { e.currentTarget.style.background = t.sub; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>\n'
    '                      <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>Export Tampilan Saat Ini</span>\n'
    '                      <span style={{ fontSize: 10.5, color: t.lo }}>Cuma level {summaryGroupLabel} yg lagi dibuka</span>\n'
    '                    </button>\n'
    '                    <div style={{ height: 1, background: t.line, margin: "2px 0" }} />\n'
    '                    <button onClick={handleExportArFullXlsx} style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 1, padding: "8px 10px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", fontFamily: FONT }}\n'
    '                      onMouseEnter={(e) => { e.currentTarget.style.background = t.sub; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>\n'
    '                      <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>Download Lengkap (Semua Level)</span>\n'
    '                      <span style={{ fontSize: 10.5, color: t.lo }}>1 file, 5 sheet: Partner, Region, Area, District, DSE</span>\n'
    '                    </button>\n'
    '                  </div>,\n'
    '                  document.body\n'
    '                )}\n'
    '              </div>\n'
    '            )}\n'
    '            {tab === "input" && (\n',
    label="UI tombol export tab AR",
)

assert src != orig, "no changes applied (checkpoint 1)"
with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("OK checkpoint 1 - helper fetchPiutangAggByCode berhasil disisipkan")
