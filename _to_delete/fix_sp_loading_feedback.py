import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "perbaiki mengapa saat saya pindah pindah
# tanggal penjualan sp nya lambat tapi agar tidak ambigu tunjukkan
# animasi loading untuk data yang ditampilkan"): refetch data per-tanggal
# (loadDseAndEntries) emang sengaja TETAP nampilin baris lama apa adanya
# selama refetch background (lihat UPDATE sebelumnya soal `loadingDse` -
# itu utk fix bug popup "ketutup sendiri" krn unmount), TAPI efek
# sampingnya: field Penjualan SP/Voucher/Saldo di popup ini nunjukkin
# ANGKA LAMA tanpa indikasi apapun pas lagi refetch utk tanggal baru -
# user ga bisa bedain "data beneran kosong" vs "lagi loading data yg
# benar". Sekarang field input Penjualan (mode Daily, SP/Voucher/Saldo
# ketiganya lewat renderMoneyTab yg sama) dikasih overlay loading (spinner
# + teks) & di-disable sementara, SELAMA loadingDse true - popupnya
# sendiri TETAP ga di-unmount/ketutup (behavior fix sebelumnya ga
# disentuh), cuma field-nya yg ngasih sinyal jelas "lagi dimuat ulang".
old1 = '''              <div style={labelStyle}>Total Penjualan {label} (Rp) · {fmtDayMonthFull(entryDate)}</div>
              <MoneyInput t={t} disabled={readOnly} value={value} onChange={onChange} accent={color} big prefix="Rp" />
            </div>'''
assert s.count(old1) == 1
new1 = '''              <div style={labelStyle}>Total Penjualan {label} (Rp) · {fmtDayMonthFull(entryDate)}</div>
              <div style={{ position: "relative" }}>
                <MoneyInput t={t} disabled={readOnly || loadingDse} value={value} onChange={onChange} accent={color} big prefix="Rp" />
                {loadingDse && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: 11, background: t.card, opacity: 0.92, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <Loader2 size={15} className="spin" color={t.mid} />
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: t.mid }}>Memuat data tanggal ini&hellip;</span>
                  </div>
                )}
              </div>
            </div>'''
assert s.count(old1) == 1
s = s.replace(old1, new1, 1)

# Teruskan prop loadingDse ke DseInputRow (dipake di signature + 2 pemanggilan)
old2 = '''function DseInputRow({ t, isCardView, dse, entry, onEntryChange, onIdentityChange, identityEdit, onSave, saving, dirty, prevOutstanding, audit, onShowHistory, readOnly, mode, rank, isToday, entryDate, onPickDate, onSwitchPeriodMode, periodMode, periodSubtitle, profile, arMonth, runGuarded, statusEvents, hiddenCols = {} }) {'''
assert s.count(old2) == 1
new2 = '''function DseInputRow({ t, isCardView, dse, entry, onEntryChange, onIdentityChange, identityEdit, onSave, saving, dirty, prevOutstanding, audit, onShowHistory, readOnly, mode, rank, isToday, entryDate, onPickDate, onSwitchPeriodMode, periodMode, periodSubtitle, profile, arMonth, runGuarded, statusEvents, hiddenCols = {}, loadingDse }) {'''
assert s.count(old2) == 1
s = s.replace(old2, new2, 1)

old3 = '''                  periodMode={periodMode}
                  periodSubtitle={periodColumnSubtitle}
                  onPickDate={(iso) => runGuarded(() => { if (tab === "ar") setTab("input"); setPeriodMode("tanggal"); jumpToDay(iso); })}
                  onSwitchPeriodMode={(m) => runGuarded(() => switchPeriodMode(m))}'''
assert s.count(old3) == 1
new3 = '''                  periodMode={periodMode}
                  periodSubtitle={periodColumnSubtitle}
                  onPickDate={(iso) => runGuarded(() => { if (tab === "ar") setTab("input"); setPeriodMode("tanggal"); jumpToDay(iso); })}
                  onSwitchPeriodMode={(m) => runGuarded(() => switchPeriodMode(m))}
                  loadingDse={loadingDse}'''
assert s.count(old3) == 1
s = s.replace(old3, new3, 1)

old4 = '''                        periodMode={periodMode}
                        periodSubtitle={periodColumnSubtitle}
                        onPickDate={(iso) => runGuarded(() => { if (tab === "ar") setTab("input"); setPeriodMode("tanggal"); jumpToDay(iso); })}
                        onSwitchPeriodMode={(m) => runGuarded(() => switchPeriodMode(m))}'''
assert s.count(old4) == 1
new4 = '''                        periodMode={periodMode}
                        periodSubtitle={periodColumnSubtitle}
                        onPickDate={(iso) => runGuarded(() => { if (tab === "ar") setTab("input"); setPeriodMode("tanggal"); jumpToDay(iso); })}
                        onSwitchPeriodMode={(m) => runGuarded(() => switchPeriodMode(m))}
                        loadingDse={loadingDse}'''
assert s.count(old4) == 1
s = s.replace(old4, new4, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK sp_loading_feedback")
