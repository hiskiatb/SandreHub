import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "disini ada juga untuk toggle daily/full
# month"): popup form DSE sebelumnya ga punya cara ganti mode Daily/Full
# Month dari DALAM popup - cuma bisa dari toggle di header utama (di luar
# popup). Sekarang ditambah toggle pill yg SAMA PERSIS gayanya kayak
# toggle Daily/Full Month di header utama, ditaruh di title bar popup
# (sejajar sama tombol close), biar user bisa ganti mode tanpa nutup
# popup dulu. Disembunyikan di mode AR (AR emang dipaksa permanen Full
# Month, sama kayak toggle versi header utama).

# 1) tambah prop onSwitchPeriodMode ke signature DseInputRow
old1 = '''function DseInputRow({ t, isCardView, dse, entry, onEntryChange, onIdentityChange, identityEdit, onSave, saving, dirty, prevOutstanding, audit, onShowHistory, readOnly, mode, rank, isToday, entryDate, onPickDate, periodMode, periodSubtitle, profile, arMonth, runGuarded, statusEvents, hiddenCols = {} }) {'''
assert s.count(old1) == 1
new1 = '''function DseInputRow({ t, isCardView, dse, entry, onEntryChange, onIdentityChange, identityEdit, onSave, saving, dirty, prevOutstanding, audit, onShowHistory, readOnly, mode, rank, isToday, entryDate, onPickDate, onSwitchPeriodMode, periodMode, periodSubtitle, profile, arMonth, runGuarded, statusEvents, hiddenCols = {} }) {'''
s = s.replace(old1, new1, 1)

# 2) teruskan prop onSwitchPeriodMode di 2 call site (mobile card + desktop table)
old2 = '''                  periodMode={periodMode}
                  periodSubtitle={periodColumnSubtitle}
                  onPickDate={(iso) => runGuarded(() => { if (tab === "ar") setTab("input"); setPeriodMode("tanggal"); jumpToDay(iso); })}'''
assert s.count(old2) == 1
new2 = '''                  periodMode={periodMode}
                  periodSubtitle={periodColumnSubtitle}
                  onPickDate={(iso) => runGuarded(() => { if (tab === "ar") setTab("input"); setPeriodMode("tanggal"); jumpToDay(iso); })}
                  onSwitchPeriodMode={(m) => runGuarded(() => switchPeriodMode(m))}'''
assert s.count(old2) == 1
s = s.replace(old2, new2, 1)

old3 = '''                        periodMode={periodMode}
                        periodSubtitle={periodColumnSubtitle}
                        onPickDate={(iso) => runGuarded(() => { if (tab === "ar") setTab("input"); setPeriodMode("tanggal"); jumpToDay(iso); })}'''
assert s.count(old3) == 1
new3 = '''                        periodMode={periodMode}
                        periodSubtitle={periodColumnSubtitle}
                        onPickDate={(iso) => runGuarded(() => { if (tab === "ar") setTab("input"); setPeriodMode("tanggal"); jumpToDay(iso); })}
                        onSwitchPeriodMode={(m) => runGuarded(() => switchPeriodMode(m))}'''
assert s.count(old3) == 1
s = s.replace(old3, new3, 1)

# 3) render toggle pill di title bar popup, sejajar tombol close
old4 = '''            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Form Informasi &amp; Penjualan DSE</span>
              <button onClick={requestClosePopup} title="Tutup" style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                <X size={15} color={t.mid} />
              </button>
            </div>'''
assert s.count(old4) == 1
new4 = '''            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>Form Informasi &amp; Penjualan DSE</span>
              {!isAr && (
                <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 9, background: t.sub, flexShrink: 0 }}>
                  {[{ k: "tanggal", label: "Daily" }, { k: "bulan", label: "Full Month" }].map(({ k, label }) => (
                    <button key={k} onClick={() => onSwitchPeriodMode?.(k)}
                      style={{ height: 26, padding: "0 10px", borderRadius: 7, border: "none", background: periodMode === k ? t.card : "transparent", color: periodMode === k ? t.hi : t.mid, fontSize: 10.5, fontWeight: periodMode === k ? 700 : 600, cursor: "pointer", fontFamily: FONT, boxShadow: periodMode === k ? t.shadowSm : "none", whiteSpace: "nowrap", transition: "background 0.15s, box-shadow 0.15s" }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={requestClosePopup} title="Tutup" style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                <X size={15} color={t.mid} />
              </button>
            </div>'''
assert s.count(old4) == 1
s = s.replace(old4, new4, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK titlebar_toggle")
