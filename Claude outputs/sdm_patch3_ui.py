p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

do(
    'import { useEffect, useMemo, useState, useCallback, Fragment } from "react";',
    'import { useEffect, useMemo, useState, useCallback, useRef, Fragment } from "react";',
    1, "add useRef import",
)

old_step2_body = '''                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {showDepoManager && (
                    <div
                      onClick={() => setShowDepoManager(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
                    >
                      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 980, maxHeight: "88vh", overflowY: "auto", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
                        <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} onClose={() => setShowDepoManager(false)} />
                      </div>
                    </div>
                  )}
                  {depoNeedsMc && (
                    <div style={{ fontSize: 13, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>
                      Depo ini belum punya District. Tambahkan minimal 1 District lewat &ldquo;Kelola Depo&rdquo; di atas sebelum mengisi OPEX & SDM-nya.
                    </div>
                  )}
                  <Card t={t}><Body>
                    <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(sdmSummary.totalSdmSales)}</span>}>HR Cost Sales</SecLabel>
                    {sdmGroupedSections("sales").map((g) => (
                      <div key={g.lvl} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, margin: "4px 2px" }}>
                          {SDM_LEVEL_LABEL[g.lvl]} — {sdmLevelEntityLabel(g.lvl)}
                        </div>
                        {g.lvl === "mc"
                          ? <McMultiItemTable items={g.items} mcs={mcListInSelectedDepo} valuesByMc={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(g.lvl)} canChangeLevel={canManageSdmLevel} levelOfItem={levelOfItem} onChangeLevel={moveSdmItemLevel} movingLevelId={movingLevelId} t={t} />
                          : <ItemTable items={g.items} values={sdmValuesMerged} onChange={setSdmItemValue} readOnly={sdmRowReadOnly(g.lvl)} showQty canChangeLevel={canManageSdmLevel} levelOfItem={levelOfItem} onChangeLevel={moveSdmItemLevel} movingLevelId={movingLevelId} t={t} />}
                      </div>
                    ))}
                  </Body></Card>
                  <Card t={t}><Body>
                    <SecLabel t={t} right={<span style={{ fontSize: 13, fontWeight: 700, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{fmtIDR(sdmSummary.totalSdmNonSales)}</span>}>HR Cost Non Sales</SecLabel>
                    {sdmGroupedSections("non_sales").map((g) => (
                      <div key={g.lvl} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, margin: "4px 2px" }}>
                          {SDM_LEVEL_LABEL[g.lvl]} — {sdmLevelEntityLabel(g.lvl)}
                        </div>
                        {g.lvl === "mc"
                          ? <McMultiItemTable items={g.items} mcs={mcListInSelectedDepo} valuesByMc={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(g.lvl)} canChangeLevel={canManageSdmLevel} levelOfItem={levelOfItem} onChangeLevel={moveSdmItemLevel} movingLevelId={movingLevelId} t={t} />
                          : <ItemTable items={g.items} values={sdmValuesMerged} onChange={setSdmItemValue} readOnly={sdmRowReadOnly(g.lvl)} showQty canChangeLevel={canManageSdmLevel} levelOfItem={levelOfItem} onChangeLevel={moveSdmItemLevel} movingLevelId={movingLevelId} t={t} />}
                      </div>
                    ))}
                  </Body></Card>
                  <SubtotalBanner label="Total SDM" value={sdmSummary.totalSdm} />
                </div>
              )}
            </>
          )}

          {step === 3 && ('''
new_step2_body = '''                // FIX (permintaan user - "lebarkan saja section ini agar lebih
                // luas"): khusus Langkah 2 (SDM) di-"breakout" dari batas lebar
                // halaman (maxWidth bersama di page.jsx), supaya 5 section
                // level-nya dapat ruang lebih lega - TANPA mengubah lebar
                // halaman utk tab Summary/Pendapatan/Pengeluaran lainnya.
                <div style={{ marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)", width: "100vw", display: "flex", justifyContent: "center" }}>
                <div style={{ width: "100%", maxWidth: 1360, padding: "0 20px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14 }}>
                  {showDepoManager && (
                    <div
                      onClick={() => setShowDepoManager(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
                    >
                      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 980, maxHeight: "88vh", overflowY: "auto", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
                        <PNL_DepoManager t={t} d={d} partnerName={partnerName} depos={depos} depoMcRows={depoMcRows} mcList={mcList} editable={editable} onChanged={loadMaster} contextBranch={contextBranch} onClose={() => setShowDepoManager(false)} />
                      </div>
                    </div>
                  )}
                  {depoNeedsMc && (
                    <div style={{ fontSize: 13, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>
                      Depo ini belum punya District. Tambahkan minimal 1 District lewat &ldquo;Kelola Depo&rdquo; di atas sebelum mengisi OPEX & SDM-nya.
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                    <SubtotalBanner label="Total HR Cost Sales" value={sdmSummary.totalSdmSales} />
                    <SubtotalBanner label="Total HR Cost Non Sales" value={sdmSummary.totalSdmNonSales} />
                  </div>
                  {canManageSdmLevel && (
                    <div style={{ fontSize: 12, color: t.mid, display: "flex", alignItems: "center", gap: 6, padding: "2px 2px" }}>
                      <GripVertical size={13} /> Seret (drag) baris item ke salah satu section level di bawah untuk memindahkan levelnya.
                    </div>
                  )}
                  {SDM_LEVEL_ORDER.map((lvl) => renderSdmLevelSection(lvl))}
                  <SubtotalBanner label="Total SDM" value={sdmSummary.totalSdm} />
                </div>
                </div>
              )}
            </>
          )}

          {step === 3 && ('''
do(old_step2_body, new_step2_body, 1, "step2 JSX -> 5 drag-and-drop level sections, widened")

open(p, "w").write(S["s"])
print("PATCH3_OK")
