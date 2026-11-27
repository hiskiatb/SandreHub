p = "app/dashboard/page.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 3) FormPendapatanV2 skrg butuh pilih Region + Area SENDIRI (permintaan
#    user: "nanti untuk pendapatan dia akan ada pemilihan region dan area
#    di dalam form pendapatan, area level, buat dengan ui yang sangat
#    bagus juga") - krn Region/Area sudah tidak ada lagi di chrome atas.
old_pendapatan_call = '''                              <FormPendapatanV2
                                theme={theme}
                                profile={profile}
                                setIsFormDirty={isReadOnly ? undefined : setFormDirty}
                                readOnly={isReadOnly}
                                canEditPendapatan={isMPX || isAdminArea || isSPM}
                                activeContext={{ branch: activeBranch, month: activeMonth, year: activeYear, mpxName: activePartner, mpxType }}
                                masterData={masterData}
                              />'''
new_pendapatan_call = '''                              <FormPendapatanV2
                                theme={theme}
                                profile={profile}
                                setIsFormDirty={isReadOnly ? undefined : setFormDirty}
                                readOnly={isReadOnly}
                                canEditPendapatan={isMPX || isAdminArea || isSPM}
                                activeContext={{ branch: activeBranch, month: activeMonth, year: activeYear, mpxName: activePartner, mpxType }}
                                masterData={masterData}
                                showRegionPicker={isSPM || isIOHAny}
                                regionLabel={iohLockedRegion ? "Region (terkunci)" : (isIOHAny ? "Region View" : "Region")}
                                regionOptions={partnerRegions}
                                regionLocked={!!iohLockedRegion || partnerRegions.length <= 1}
                                onRegionChange={iohLockedRegion ? undefined : (v) => { setActiveRegion(v); setActiveBranch(""); }}
                                areaOptions={availableBranches}
                                onAreaChange={isReadOnly ? undefined : setActiveBranch}
                              />'''
do(old_pendapatan_call, new_pendapatan_call, 1, "FormPendapatanV2 call props")

# 4) FormPengeluaranV2 dapat tambahan periodControl (date picker month/
#    year) utk ditaruh di dalam container "Form Pengeluaran" sendiri
#    (permintaan user: "pilihan periode nya pindahkan ke kanan totle
#    form pengeluaran ... masuk ke dalam container agar lebih minimalis
#    dan rapi") - dibangun di sini (page.jsx) supaya style & state-nya
#    tetap satu sumber kebenaran dgn tab Summary/Pendapatan.
old_pengeluaran_call = '''                              <FormPengeluaranV2
                                theme={theme}
                                profile={profile}
                                setIsFormDirty={isReadOnly ? undefined : setFormDirty}
                                readOnly={isReadOnly}
                                canEdit={isMPX || isAdminArea || isSPM}
                                activeContext={{ branch: activeBranch, month: activeMonth, year: activeYear, mpxName: activePartner, mpxType }}
                                areaOptions={availableBranches}
                                onAreaChange={isReadOnly ? undefined : setActiveBranch}
                              />'''
new_pengeluaran_call = '''                              <FormPengeluaranV2
                                theme={theme}
                                profile={profile}
                                setIsFormDirty={isReadOnly ? undefined : setFormDirty}
                                readOnly={isReadOnly}
                                canEdit={isMPX || isAdminArea || isSPM}
                                activeContext={{ branch: activeBranch, month: activeMonth, year: activeYear, mpxName: activePartner, mpxType }}
                                areaOptions={availableBranches}
                                onAreaChange={isReadOnly ? undefined : setActiveBranch}
                                periodControl={(
                                  <div style={{ display: "flex", alignItems: "center", border: `1px solid ${t.inputBd}`, borderRadius: 8, background: t.inputBg, height: 34, overflow: "hidden", flexShrink: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", borderRight: `1px solid ${t.inputBd}`, height: "100%", position: "relative" }}>
                                      <Calendar size={12} style={{ color: t.blue, marginLeft: 10, flexShrink: 0 }} />
                                      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                        <select value={activeMonth} onChange={e => setActiveMonth(e.target.value)}
                                          style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: "transparent", border: "none", fontSize: 12.5, fontWeight: 600, color: t.hi, cursor: "pointer", paddingLeft: 6, paddingRight: 22, height: 34, fontFamily: "inherit" }}>
                                          {availableMonths.map(m => (
                                            <option key={m} value={m} disabled={activeContextDisabledMonths.has(m)}>{m}{activeContextDisabledMonths.has(m) ? " (nonaktif)" : ""}</option>
                                          ))}
                                        </select>
                                        <ChevronDown size={11} style={{ position: "absolute", right: 5, pointerEvents: "none", color: t.lo }} />
                                      </div>
                                    </div>
                                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                      <select value={activeYear} onChange={e => setActiveYear(e.target.value)}
                                        style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: "transparent", border: "none", fontSize: 12.5, fontWeight: 600, color: t.hi, cursor: "pointer", paddingLeft: 10, paddingRight: 26, height: 34, fontFamily: "inherit" }}>
                                        {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                                      </select>
                                      <ChevronDown size={11} style={{ position: "absolute", right: 8, pointerEvents: "none", color: t.lo }} />
                                    </div>
                                  </div>
                                )}
                              />'''
do(old_pengeluaran_call, new_pengeluaran_call, 1, "FormPengeluaranV2 call props")

open(p, "w").write(S["s"])
print("PATCH_CHROME_3_OK")
