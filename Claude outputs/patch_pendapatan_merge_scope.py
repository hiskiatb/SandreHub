p = "app/dashboard/components/PNL_FormPendapatanV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# FIX (permintaan user - "region dan area buat di dalam container yang
# sama dengan form pendapatan area level"): banner "Form Pendapatan
# (Area Level)" (SecHero) dan bar Region/Area (dulu 2 kotak terpisah)
# digabung jadi SATU container - gaya 2-baris (judul + divider +
# kontrol) persis spt StepHeroDepo di Form Pengeluaran, biar konsisten.
old_block = '''          {/* ── Form Pendapatan (Area Level) — diisi Partner ── */}
          <SecHero icon={Banknote} title="Form Pendapatan (Area Level)" t={t}>
            {!canEditIncome && <LockNote t={t}>Hanya lihat</LockNote>}
          </SecHero>
          {/* BARU (permintaan user - "nanti untuk pendapatan dia akan
              ada pemilihan region dan area di dalam form pendapatan
              (area level) buat dengan ui yang sangat bagus juga"):
              Region (khusus role SPM/IOH yg lintas Region) & Area kini
              dipilih langsung dari sini, krn sudah hilang dari chrome
              atas halaman. */}
          {(showRegionPicker || (areaOptions && areaOptions.length > 0)) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "13px 16px", borderRadius: 12, border: `1px solid ${t.blueBd}`, background: t.blueBg, marginBottom: 16, boxShadow: t.sm }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 2 }}>Lingkup</span>
              {showRegionPicker && (
                <div style={{ position: "relative", display: "inline-flex" }}>
                  <select
                    value={activeRegion || ""}
                    disabled={!!regionLocked}
                    onChange={(e) => onRegionChange?.(e.target.value)}
                    title={regionLabel || "Region"}
                    style={{
                      appearance: "none", WebkitAppearance: "none",
                      fontSize: 11.5, fontWeight: 700, color: t.hi, background: t.card,
                      border: `1px solid ${t.line}`, borderRadius: 999, padding: "6px 28px 6px 30px",
                      cursor: regionLocked ? "default" : "pointer", fontFamily: "inherit", boxShadow: t.sm,
                      opacity: regionLocked ? 0.65 : 1,
                    }}
                  >
                    {(regionOptions || []).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <Globe2 size={12} color={t.blue} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  {!regionLocked && <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />}
                </div>
              )}
              {areaOptions && areaOptions.length > 0 && (
                <div style={{ position: "relative", display: "inline-flex" }}>
                  <select
                    value={activeContext?.branch || ""}
                    onChange={(e) => onAreaChange?.(e.target.value)}
                    title="Area"
                    style={{
                      appearance: "none", WebkitAppearance: "none",
                      fontSize: 11.5, fontWeight: 700, color: t.hi, background: t.card,
                      border: `1px solid ${t.line}`, borderRadius: 999, padding: "6px 28px 6px 30px",
                      cursor: "pointer", fontFamily: "inherit", boxShadow: t.sm,
                    }}
                  >
                    {!activeContext?.branch && <option value="" disabled>Pilih Area</option>}
                    {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <MapPin size={12} color={t.blue} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
                </div>
              )}
            </div>
          )}'''
new_block = '''          {/* ── Form Pendapatan (Area Level) — diisi Partner ── */}
          {/* FIX (permintaan user - "region dan area buat di dalam
              container yang sama dengan form pendapatan area level"):
              banner judul + picker Region/Area digabung jadi SATU
              kartu (judul lalu divider lalu baris kontrol) - gaya sama
              persis dgn StepHeroDepo di Form Pengeluaran biar senada. */}
          <div style={{ padding: "14px 18px 16px", borderRadius: 10, border: `1px solid ${t.blueBd}`, background: t.blueBg, marginBottom: 18, boxShadow: t.sm }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: GRAD, color: "#fff" }}><Banknote size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.03em", color: t.hi, lineHeight: 1.2 }}>Form Pendapatan (Area Level)</div>
              </div>
              {!canEditIncome && <LockNote t={t}>Hanya lihat</LockNote>}
            </div>
            {(showRegionPicker || (areaOptions && areaOptions.length > 0)) && (
              <>
                <div style={{ height: 1, background: t.blueBd, opacity: 0.6, margin: "14px 0 12px" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 2 }}>Lingkup</span>
                  {showRegionPicker && (
                    <div style={{ position: "relative", display: "inline-flex" }}>
                      <select
                        value={activeRegion || ""}
                        disabled={!!regionLocked}
                        onChange={(e) => onRegionChange?.(e.target.value)}
                        title={regionLabel || "Region"}
                        style={{
                          appearance: "none", WebkitAppearance: "none",
                          fontSize: 11.5, fontWeight: 700, color: t.hi, background: t.card,
                          border: `1px solid ${t.line}`, borderRadius: 999, padding: "6px 28px 6px 30px",
                          cursor: regionLocked ? "default" : "pointer", fontFamily: "inherit", boxShadow: t.sm,
                          opacity: regionLocked ? 0.65 : 1,
                        }}
                      >
                        {(regionOptions || []).map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <Globe2 size={12} color={t.blue} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                      {!regionLocked && <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />}
                    </div>
                  )}
                  {areaOptions && areaOptions.length > 0 && (
                    <div style={{ position: "relative", display: "inline-flex" }}>
                      <select
                        value={activeContext?.branch || ""}
                        onChange={(e) => onAreaChange?.(e.target.value)}
                        title="Area"
                        style={{
                          appearance: "none", WebkitAppearance: "none",
                          fontSize: 11.5, fontWeight: 700, color: t.hi, background: t.card,
                          border: `1px solid ${t.line}`, borderRadius: 999, padding: "6px 28px 6px 30px",
                          cursor: "pointer", fontFamily: "inherit", boxShadow: t.sm,
                        }}
                      >
                        {!activeContext?.branch && <option value="" disabled>Pilih Area</option>}
                        {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <MapPin size={12} color={t.blue} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                      <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>'''
do(old_block, new_block, 1, "merge SecHero + scope bar into one card")

open(p, "w").write(S["s"])
print("PATCH_MERGE_OK")
