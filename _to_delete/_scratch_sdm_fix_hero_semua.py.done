p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# FIX (permintaan user - "kan secara default dia menampilkan semuanya,
# disini juga keterangannya semua depo semua area semua region, jika
# itu sebelumnya adalah opsi"): header "hero" Langkah 2 (SDM) dulu
# nunjukin selector Depo/Area yg "aktif" (1 pilihan) - padahal section
# di bawahnya SKRG default menampilkan SEMUA Depo/Area/Region/District
# partner sekaligus, jadi selector itu jadi menyesatkan (keliatan kayak
# cuma Depo/Area itu yg lagi diisi, padahal semuanya ikut tampil &
# ikut tersimpan). Diganti jadi info statis "Semua ..." biar jujur
# sesuai apa yg beneran ditampilkan - selector Depo/Area yg fungsional
# TETAP ada di Langkah 1 (OPEX & CoM), tidak dihapus dari situ.
old_hero2 = '''              <StepHeroDepo
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
new_hero2 = '''              <StepHeroDepo
                icon={Users} eyebrow="Langkah 2 dari 4" title="SDM"
                depoName={!needsDepoGate ? `Semua Depo (${allDepoIds.length})` : undefined}
                region={allRegions.length ? `Semua Region (${allRegions.length})` : "—"}
                area={allAreas.length ? `Semua Area (${allAreas.length})` : "—"}
                mcs={allMcsInPartner}
                totalLabel="Total SDM"
                totalValue={!needsDepoGate ? sdmSummary.totalSdm : undefined}
                t={t}
              />
              {!needsDepoGate && (
                <div style={{ fontSize: 11.5, color: t.mid, background: t.blueBg, border: `1px solid ${t.blueBd}`, borderRadius: 8, padding: "8px 12px", marginTop: -10, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  <Info size={12} style={{ flexShrink: 0 }} />
                  SDM diisi sekaligus utk semua Region, Area, Depo & District milik partner ini - tidak terpengaruh filter Area di atas.
                </div>
              )}'''
do(old_hero2, new_hero2, 1, "StepHeroDepo step2 -> info statis Semua Region/Area/Depo/District")

open(p, "w").write(S["s"])
print("HEROFIX_OK")
