p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 1) StepHeroDepo - tambah prop mcControl: kalau dioper, sel District
#    (kolom 2/baris 2) jadi SATU dropdown pilih District (dipakai
#    Langkah 3 Marketing Cost & Langkah 4 Ringkasan - keduanya scoped ke
#    1 District terpilih, bukan daftar semua District spt Langkah 1/2).
old_herosig = '''function StepHeroDepo({ icon: Icon, eyebrow, title, depoName, depoControl, region, area, areaOptions, onAreaChange, mcs, totalLabel, totalValue, t }) {'''
new_herosig = '''function StepHeroDepo({ icon: Icon, eyebrow, title, depoName, depoControl, region, area, areaOptions, onAreaChange, mcs, mcControl, totalLabel, totalValue, t }) {'''
do(old_herosig, new_herosig, 1, "StepHeroDepo signature mcControl")

old_district_cell = '''            {/* Kolom 2 / Baris 2 — District */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0, marginTop: 7, whiteSpace: "nowrap" }}>District{mcs.length > 0 ? ` (${mcs.length})` : ""}</span>
              {mcs.length === 0 ? (
                <div style={{ fontSize: 11.5, color: t.lo, marginTop: 5 }}>Belum ada District di Depo ini.</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 84, overflowY: "auto", paddingRight: 2 }}>
                  {mcs.map((m) => (
                    <span key={m} style={{ fontSize: 11, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.line}`, borderRadius: 999, padding: "5px 12px", boxShadow: t.sm }}>{m}</span>
                  ))}
                </div>
              )}
            </div>'''
new_district_cell = '''            {/* Kolom 2 / Baris 2 — District (daftar semua District di
                Depo utk Langkah 1/2, atau 1 dropdown pilih District utk
                Langkah 3/4 lewat prop mcControl - permintaan user:
                "perbaiki juga untuk 1-4 agar seragam"). */}
            <div style={{ display: "flex", alignItems: mcControl ? "center" : "flex-start", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0, marginTop: mcControl ? 0 : 7, whiteSpace: "nowrap" }}>District{!mcControl && mcs.length > 0 ? ` (${mcs.length})` : ""}</span>
              {mcControl ? mcControl : mcs.length === 0 ? (
                <div style={{ fontSize: 11.5, color: t.lo, marginTop: 5 }}>Belum ada District di Depo ini.</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 84, overflowY: "auto", paddingRight: 2 }}>
                  {mcs.map((m) => (
                    <span key={m} style={{ fontSize: 11, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.line}`, borderRadius: 999, padding: "5px 12px", boxShadow: t.sm }}>{m}</span>
                  ))}
                </div>
              )}
            </div>'''
do(old_district_cell, new_district_cell, 1, "District cell supports mcControl")

# 2) Langkah 2 (SDM) - samakan dgn Langkah 1: tambah depoControl (Depo +
#    tombol Kelola icon-only), Region & Area (dropdown fungsional).
old_step2 = '''              <StepHeroDepo
                icon={Users} eyebrow="Langkah 2 dari 4" title="SDM"
                depoName={!needsDepoGate && selectedDepoId ? depos.find((dp) => dp.id === selectedDepoId)?.depo_name : undefined}
                mcs={mcCodesInDepo}
                totalLabel="Total SDM"
                totalValue={!needsDepoGate ? sdmSummary.totalSdm : undefined}
                t={t}
              />'''
new_step2 = '''              <StepHeroDepo
                icon={Users} eyebrow="Langkah 2 dari 4" title="SDM"
                depoName={!needsDepoGate && selectedDepoId ? depos.find((dp) => dp.id === selectedDepoId)?.depo_name : undefined}
                depoControl={!needsDepoGate && depoOptions.length > 0 ? (
                  <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact
                    extra={editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" title="Kelola Depo" style={{ padding: "7px 9px", width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Settings2 size={13} /></button>} />
                ) : undefined}
                region={currentRegion} area={contextBranch}
                areaOptions={areaOptions} onAreaChange={editable ? onAreaChange : undefined}
                mcs={mcCodesInDepo}
                totalLabel="Total SDM"
                totalValue={!needsDepoGate ? sdmSummary.totalSdm : undefined}
                t={t}
              />'''
do(old_step2, new_step2, 1, "step2 StepHeroDepo uniform")

# 3) Langkah 3 (Marketing Cost) - dari SecHero polos jadi StepHeroDepo
#    yg sama gayanya (Depo+Region+Area+total), District-nya 1 dropdown
#    (mcControl) krn Marketing Cost memang diisi per 1 District.
old_step3 = '''              <SecHero icon={Megaphone} eyebrow="Langkah 3 dari 4" title="Marketing Cost" t={t} />'''
new_step3 = '''              <StepHeroDepo
                icon={Megaphone} eyebrow="Langkah 3 dari 4" title="Marketing Cost"
                depoName={!needsDepoGate && selectedDepoId ? depos.find((dp) => dp.id === selectedDepoId)?.depo_name : undefined}
                depoControl={!needsDepoGate && depoOptions.length > 0 ? (
                  <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact
                    extra={editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" title="Kelola Depo" style={{ padding: "7px 9px", width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Settings2 size={13} /></button>} />
                ) : undefined}
                region={currentRegion} area={contextBranch}
                areaOptions={areaOptions} onAreaChange={editable ? onAreaChange : undefined}
                mcs={mcCodesInDepo}
                mcControl={<ScopeSelector label="District" value={selectedMc} onChange={setSelectedMc} options={mcOptions} t={t} compact />}
                totalLabel="Total Marketing Cost"
                totalValue={!needsDepoGate ? mcSummary.totalMarketing : undefined}
                t={t}
              />'''
do(old_step3, new_step3, 1, "step3 StepHeroDepo uniform")

# 4) Langkah 4 (Ringkasan Akhir) - sama gayanya jg, District tetap 1
#    dropdown (scope Marketing Cost yg direview).
old_step4 = '''              <SecHero icon={FileText} eyebrow="Langkah 4 dari 4" title="Ringkasan Akhir" t={t} />'''
new_step4 = '''              <StepHeroDepo
                icon={FileText} eyebrow="Langkah 4 dari 4" title="Ringkasan Akhir"
                depoName={!needsDepoGate && selectedDepoId ? depos.find((dp) => dp.id === selectedDepoId)?.depo_name : undefined}
                depoControl={!needsDepoGate && depoOptions.length > 0 ? (
                  <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact
                    extra={editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" title="Kelola Depo" style={{ padding: "7px 9px", width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Settings2 size={13} /></button>} />
                ) : undefined}
                region={currentRegion} area={contextBranch}
                areaOptions={areaOptions} onAreaChange={editable ? onAreaChange : undefined}
                mcs={mcCodesInDepo}
                mcControl={<ScopeSelector label="District" value={selectedMc} onChange={setSelectedMc} options={mcOptions} t={t} compact />}
                totalLabel="Grand Total (Depo + District terpilih)"
                totalValue={!needsDepoGate ? depoSummary.totalOpex + depoSummary.totalCostOfMoney + sdmSummary.totalSdm + mcSummary.totalMarketing : undefined}
                t={t}
              />'''
do(old_step4, new_step4, 1, "step4 StepHeroDepo uniform")

# 5) FormHeader children (panel Depo/District/Partner/Region/Area di
#    ATAS Stepper) jadi REDUNDAN - semua info itu skrg sudah ada di
#    kartu StepHeroDepo tiap Langkah (1-4 seragam). Dihapus spy ga ada
#    info ganda/duplikat.
old_formheader = '''      <FormHeader icon={ArrowDownLeft} title="Form Pengeluaran" activeContext={activeContext} readOnly={!editable} t={t} headerRight={periodControl}>
        {/* Permintaan user ("kan awalnya di atas, pindahkan saja menjadi
            di sini, jadi dalam satu row yang sama"): selector Depo +
            tombol "Kelola Depo" khusus Langkah 1 (OPEX & Cost of Money)
            TIDAK lagi dirender di sini - sudah dipindah jadi satu baris
            bareng badge District di dalam kartu StepHeroDepo (lihat
            prop depoControl pada pemanggilannya di Langkah 1). */}
        {/* FIX (permintaan user - "buat ui yang luar biasa dan divider
            yang jelas antara depo dan mc"): dulu Depo + tombol "Kelola
            Depo" + District numpuk dlm 1 flex row rata tanpa pemisah
            apa pun - tombol "Kelola Depo" (yg sebenarnya bagian dari
            grup Depo) malah kelihatan motong di antara Depo & District,
            bikin ga jelas mana grup mana. Sekarang dibungkus 1 kartu
            dgn divider vertikal TEGAS antara grup "Depo" (select +
            tombol Kelola Depo jadi SATU kesatuan visual) dan grup
            "District (MC)". */}
        {(isMcStep || isSdmStep) && depoOptions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: isSdmStep ? 10 : 0, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: "10px 14px", width: isSdmStep ? "100%" : "auto" }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ScopeSelector label="Depo" value={selectedDepoId} onChange={setSelectedDepoId} options={depoOptions} t={t} compact />
                {editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" style={{ padding: "6px 10px", whiteSpace: "nowrap" }}><Settings2 size={12} /> Kelola Depo</button>}
              </div>
              {isMcStep && (
                <>
                  <div style={{ width: 1, alignSelf: "stretch", minHeight: 28, background: t.line, flexShrink: 0 }} />
                  <ScopeSelector label="District (MC)" value={selectedMc} onChange={setSelectedMc} options={mcOptions} t={t} compact />
                </>
              )}
            </div>
            {isSdmStep && (
              <>
                <div style={{ height: 1, background: t.line }} />
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { icon: Building2, label: "Partner", value: partnerName },
                    { icon: Globe2, label: "Region", value: currentRegion },
                    { icon: MapPin, label: "Area", value: contextBranch },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 8px", borderRadius: 999, background: t.card, border: `1px solid ${t.line}` }}>
                      <Icon size={12} color={t.blue} />
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: value ? t.hi : t.lo }}>{value || "—"}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </FormHeader>'''
new_formheader = '''      {/* FIX (permintaan user - "perbaiki juga untuk 1-4 agar seragam"):
          panel Depo/District/Partner/Region/Area yg dulu nempel di sini
          (di atas Stepper) dihapus - skrg REDUNDAN krn tiap Langkah
          (1-4) sudah seragam punya kartu StepHeroDepo sendiri yg isinya
          persis sama (Depo, Region, Area, District). */}
      <FormHeader icon={ArrowDownLeft} title="Form Pengeluaran" activeContext={activeContext} readOnly={!editable} t={t} headerRight={periodControl} />'''
do(old_formheader, new_formheader, 1, "remove redundant FormHeader scope panel")

open(p, "w").write(S["s"])
print("PATCH_UNIFORM_OK")
