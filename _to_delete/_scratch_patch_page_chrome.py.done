p = "app/dashboard/page.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 1) Hapus total baris filter Nama Partner/Region/Area/Tipe di atas tab
#    (permintaan user - "di bagian atas itu tidak perlu lagi ada opsi
#    untuk pilih region dan area, pemilihan nama partner dipindah ke
#    posisi pemilihan periode saat ini"). Region & Area dihilangkan
#    total (semua tab) - Area kini dipilih dari dalam Form Pengeluaran
#    (StepHeroDepo) & dalam Form Pendapatan sendiri; Region dipilih dari
#    dalam Form Pendapatan (permintaan user terpisah: "nanti untuk
#    pendapatan dia akan ada pemilihan region dan area di dalam form
#    pendapatan").
old_filter_row = '''                    {/* BARU (permintaan user - "region dan nama partner juga
                        buat diatas tombol summary/pendapatan/pengeluaran"):
                        filter Region + Nama Partner (+ Tipe kalau partner
                        punya >1 tipe MPC/MP3) dipindah dari sidebar ke
                        sini, baris horizontal persis di atas tab. */}
                    {/* FIX (permintaan user - "rapikan row pertama"): 4 field
                        (Nama Partner/Region/Area/Tipe) dulu punya
                        min/maxWidth beda2 (320/260/260/220) jadi lebarnya
                        timpang & kelihatan berantakan begitu wrap ke baris
                        baru di layar sempit - disamain semua jadi
                        min 200 / max 280 / basis 220px spy rapi sejajar. */}
                    <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                      {/* FIX (permintaan user - "lebarkan bagian nama
                          partner agar tidak ketutupan"): nama partner bisa
                          panjang (co: "PT INDOCEN SYSTEM TELECOMUNICATION")
                          & kepotong kalau samain lebar dgn Region/Area/Tipe
                          - dikasih porsi lebih lega (flex-grow 2x, maxWidth
                          lebih besar) drpd 3 field lainnya. */}
                      <div style={{ flex: "2 1 280px", minWidth: 240, maxWidth: 440 }}>
                        <FilterSelect label="Nama Partner" icon={<Building2 size={12} />} value={activePartner} displayValue={activePartner}
                          onChange={v => { setActivePartner(v); setActiveBranch(""); setActiveType("ALL"); }} t={t} d={d} disabled={isMPX}>
                          <option value="" disabled>Pilih Partner</option>
                          {filteredPartners.map(p => <option key={p} value={p} style={{ color: t.hi }}>{partnerOptionLabel(p)}</option>)}
                        </FilterSelect>
                      </div>
                      {(isSPM || isIOHAny) && (
                        <div style={{ flex: "1 1 220px", minWidth: 200, maxWidth: 280 }}>
                          <FilterSelect label={iohLockedRegion ? "Region (terkunci)" : (isIOHAny ? "Region View" : "Region")} icon={<Globe size={12} />} value={activeRegion}
                            onChange={v => {
                              if (iohLockedRegion) return;
                              // FIX (user - "harusnya tetap bisa dipilih
                              // regionnya ... tetap bisa otomatis akan
                              // pilih salah satu area di region baru yang
                              // dipilih"): partner multi-region - Region
                              // tetap bisa diganti TANPA clear Partner,
                              // cukup clear Cabang (auto-pick effect di
                              // atas akan milih cabang lain di region baru).
                              if (activePartner) { setActiveRegion(v); setActiveBranch(""); return; }
                              setActiveRegion(v); setActivePartner(""); setActiveBranch("");
                            }}
                            t={t} d={d} disabled={!!iohLockedRegion || (!!activePartner && partnerRegions.length <= 1)}>
                            {!activePartner && <option value="SUMATERA">Seluruh Sumatera</option>}
                            {(activePartner ? partnerRegions : regions).map(r => <option key={r} value={r}>{r}</option>)}
                          </FilterSelect>
                        </div>
                      )}
                      {/* BARU (permintaan user - "buat pemilihan area itu
                          di kanan pemilihan region, agar period picker
                          bisa tetap sebelah kanan row 2"): dropdown Area
                          dipindah dari row 2 (dulu di tengah, antara tab &
                          date picker) ke row 1, persis di kanan Region -
                          row 2 jadi cuma tab (kiri) + date picker (kanan)
                          lagi, rapi spt semula. */}
                      <div style={{ flex: "1 1 220px", minWidth: 200, maxWidth: 280 }}>
                        <FilterSelect label={activePartner ? (availableBranches.length > 1 ? "Area (pilih salah satu)" : "Area") : "Area (bisa pilih langsung)"}
                          icon={<Store size={12} />} value={activePartner ? activeBranch : ""} onChange={handleBranchPickerChange}
                          t={t} d={d} disabled={!activePartner && branchPickerGroups.length === 0}>
                          <option value="" disabled>Pilih Area</option>
                          {activePartner
                            ? (availableBranchGroups.length > 1
                                ? availableBranchGroups.map(g => (
                                    <optgroup key={g.region} label={g.region}>
                                      {g.branches.map(b => <option key={b} value={b}>{b}</option>)}
                                    </optgroup>
                                  ))
                                : availableBranches.map(b => <option key={b} value={b}>{b}</option>))
                            : branchPickerGroups.map(g => (
                                <optgroup key={g.region} label={g.region}>
                                  {g.items.map(it => (
                                    <option key={`${it.partner_name}${BRANCH_PICKER_SEP}${it.branch_name}`} value={`${it.partner_name}${BRANCH_PICKER_SEP}${it.branch_name}`}>
                                      {it.partner_name} — {it.branch_name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                        </FilterSelect>
                      </div>
                      {activePartner && availableTypes.length > 1 && (
                        <div style={{ flex: "1 1 220px", minWidth: 200, maxWidth: 280 }}>
                          <FilterSelect label="Tipe (MPC / MP3)" icon={<SlidersHorizontal size={12} />} value={activeType}
                            onChange={v => { setActiveType(v); setActiveBranch(""); }} t={t} d={d}>
                            <option value="ALL">Semua Tipe</option>
                            {availableTypes.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                          </FilterSelect>
                        </div>
                      )}
                    </div>

'''
do(old_filter_row, "", 1, "remove top filter row")

open(p, "w").write(S["s"])
print("PATCH_CHROME_1_OK")
