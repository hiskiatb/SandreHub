p = "app/dashboard/page.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 2) Slot kanan baris tab (dulu cuma date picker) sekarang diisi Nama
#    Partner (+ Tipe kalau ada >1) - persis posisi date picker lama
#    (permintaan user: "pemilihan nama partner dipindah ke posisi
#    pemilihan periode saat ini"). Date picker sendiri TETAP tampil di
#    sini utk tab Summary & Pendapatan (areanya belum punya container
#    sendiri utk nampung date picker), tapi DISEMBUNYIKAN khusus di tab
#    Pengeluaran krn di situ date picker-nya pindah masuk ke dalam
#    container "Form Pengeluaran" (lihat prop periodControl yg dioper ke
#    FormPengeluaranV2 di bawah) - permintaan user: "pilihan periode nya
#    pindahkan ke kanan totle form pengeluaran ... masuk ke dalam
#    container agar lebih minimalis dan rapi".
old_date_block = '''                      {/* BARU (permintaan user - "buat pemilihan area itu
                          di kanan pemilihan region, agar period picker
                          bisa tetap sebelah kanan row 2"): dropdown Area
                          pindah ke row 1 (lihat di atas, persis di kanan
                          Region) - row 2 ini sekarang cuma tab (kiri) +
                          date picker (kanan), justifyContent:"space-between"
                          otomatis menaruh date picker rata kanan lagi. */}
                      <div style={{ display: "flex", alignItems: "center", border: `1px solid ${t.inputBd}`, borderRadius: 8, background: t.inputBg, height: 36, overflow: "hidden", flexShrink: 0, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", borderRight: `1px solid ${t.inputBd}`, height: "100%", position: "relative", minWidth: 0 }}>
                          <Calendar size={13} style={{ color: t.blue, marginLeft: 11, flexShrink: 0 }} />
                          <div style={{ position: "relative", display: "flex", alignItems: "center", minWidth: 0 }}>
                            <select value={activeMonth} onChange={e => setActiveMonth(e.target.value)}
                              style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: "transparent", border: "none", fontSize: 13.5, fontWeight: 500, color: t.hi, cursor: "pointer", paddingLeft: 7, paddingRight: 24, height: 36, fontFamily: "inherit", minWidth: 0 }}>
                              {availableMonths.map(m => (
                                <option key={m} value={m} disabled={activeContextDisabledMonths.has(m)}>{m}{activeContextDisabledMonths.has(m) ? " (nonaktif)" : ""}</option>
                              ))}
                            </select>
                            <ChevronDown size={12} style={{ position: "absolute", right: 6, pointerEvents: "none", color: t.lo }} />
                          </div>
                        </div>
                        <div style={{ position: "relative", display: "flex", alignItems: "center", minWidth: 0 }}>
                          <select value={activeYear} onChange={e => setActiveYear(e.target.value)} style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: "transparent", border: "none", fontSize: 13.5, fontWeight: 500, color: t.hi, cursor: "pointer", paddingLeft: 12, paddingRight: 28, height: 36, fontFamily: "inherit", minWidth: 0 }}>
                            {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                          </select>
                          <ChevronDown size={12} style={{ position: "absolute", right: 9, pointerEvents: "none", color: t.lo }} />
                        </div>
                      </div>
                    </div>'''

new_date_block = '''                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        {/* BARU (permintaan user - "pemilihan nama partner
                            dipindah ke posisi pemilihan periode saat
                            ini"): pill Nama Partner (+ Tipe kalau partner
                            punya >1 tipe MPC/MP3), gaya sama persis dgn
                            pill date picker di sebelahnya biar senada. */}
                        <div style={{ display: "flex", alignItems: "center", border: `1px solid ${t.inputBd}`, borderRadius: 8, background: t.inputBg, height: 36, overflow: "hidden", flexShrink: 0, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", borderRight: (activePartner && availableTypes.length > 1) ? `1px solid ${t.inputBd}` : "none", height: "100%", position: "relative", minWidth: 0 }}>
                            <Building2 size={13} style={{ color: t.blue, marginLeft: 11, flexShrink: 0 }} />
                            <div style={{ position: "relative", display: "flex", alignItems: "center", minWidth: 0 }}>
                              <select value={activePartner} disabled={isMPX}
                                onChange={e => { setActivePartner(e.target.value); setActiveBranch(""); setActiveType("ALL"); }}
                                style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: "transparent", border: "none", fontSize: 13.5, fontWeight: 600, color: t.hi, cursor: isMPX ? "default" : "pointer", paddingLeft: 7, paddingRight: 24, height: 36, fontFamily: "inherit", minWidth: 0, maxWidth: 230, textOverflow: "ellipsis" }}>
                                <option value="" disabled>Pilih Partner</option>
                                {filteredPartners.map(pn => <option key={pn} value={pn}>{partnerOptionLabel(pn)}</option>)}
                              </select>
                              {!isMPX && <ChevronDown size={12} style={{ position: "absolute", right: 6, pointerEvents: "none", color: t.lo }} />}
                            </div>
                          </div>
                          {activePartner && availableTypes.length > 1 && (
                            <div style={{ position: "relative", display: "flex", alignItems: "center", minWidth: 0 }}>
                              <select value={activeType} onChange={e => { setActiveType(e.target.value); setActiveBranch(""); }}
                                style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: "transparent", border: "none", fontSize: 13.5, fontWeight: 500, color: t.hi, cursor: "pointer", paddingLeft: 12, paddingRight: 28, height: 36, fontFamily: "inherit", minWidth: 0 }}>
                                <option value="ALL">Semua Tipe</option>
                                {availableTypes.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                              </select>
                              <ChevronDown size={12} style={{ position: "absolute", right: 9, pointerEvents: "none", color: t.lo }} />
                            </div>
                          )}
                        </div>
                        {view !== "pengeluaran-v2" && (
                          <div style={{ display: "flex", alignItems: "center", border: `1px solid ${t.inputBd}`, borderRadius: 8, background: t.inputBg, height: 36, overflow: "hidden", flexShrink: 0, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", borderRight: `1px solid ${t.inputBd}`, height: "100%", position: "relative", minWidth: 0 }}>
                              <Calendar size={13} style={{ color: t.blue, marginLeft: 11, flexShrink: 0 }} />
                              <div style={{ position: "relative", display: "flex", alignItems: "center", minWidth: 0 }}>
                                <select value={activeMonth} onChange={e => setActiveMonth(e.target.value)}
                                  style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: "transparent", border: "none", fontSize: 13.5, fontWeight: 500, color: t.hi, cursor: "pointer", paddingLeft: 7, paddingRight: 24, height: 36, fontFamily: "inherit", minWidth: 0 }}>
                                  {availableMonths.map(m => (
                                    <option key={m} value={m} disabled={activeContextDisabledMonths.has(m)}>{m}{activeContextDisabledMonths.has(m) ? " (nonaktif)" : ""}</option>
                                  ))}
                                </select>
                                <ChevronDown size={12} style={{ position: "absolute", right: 6, pointerEvents: "none", color: t.lo }} />
                              </div>
                            </div>
                            <div style={{ position: "relative", display: "flex", alignItems: "center", minWidth: 0 }}>
                              <select value={activeYear} onChange={e => setActiveYear(e.target.value)} style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: "transparent", border: "none", fontSize: 13.5, fontWeight: 500, color: t.hi, cursor: "pointer", paddingLeft: 12, paddingRight: 28, height: 36, fontFamily: "inherit", minWidth: 0 }}>
                                {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                              </select>
                              <ChevronDown size={12} style={{ position: "absolute", right: 9, pointerEvents: "none", color: t.lo }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>'''
do(old_date_block, new_date_block, 1, "tab-row right slot")

open(p, "w").write(S["s"])
print("PATCH_CHROME_2_OK")
