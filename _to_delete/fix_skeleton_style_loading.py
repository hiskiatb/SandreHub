import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "maksud saya animasi loading seperti ini"
# [screenshot skeleton bar pulsing abu2, pola yg SAMA PERSIS dipakai di
# tabel list DSE saat loading]): overlay spinner+teks yg barusan ditambah
# diganti total jadi SKELETON BAR PULSING (pola `loadingPulse` yg SAMA
# PERSIS dgn skeleton di tabel list) - field Penjualan diganti SELURUHNYA
# (bukan overlay di atas input) jadi 1 kotak skeleton selama loadingDse,
# baru balik jadi <MoneyInput> beneran begitu data baru selesai dimuat.
old1 = '''              <div style={labelStyle}>Total Penjualan {label} (Rp) · {fmtDayMonthFull(entryDate)}</div>
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
new1 = '''              <div style={labelStyle}>Total Penjualan {label} (Rp) · {fmtDayMonthFull(entryDate)}</div>
              {loadingDse ? (
                <div style={{ width: "100%", height: 48, borderRadius: 11, border: `1px solid ${t.inputBd}`, background: t.sub, display: "flex", alignItems: "center", padding: "0 14px", boxSizing: "border-box" }}>
                  <NumSkeleton t={t} width="55%" height={17} />
                </div>
              ) : (
                <MoneyInput t={t} disabled={readOnly} value={value} onChange={onChange} accent={color} big prefix="Rp" />
              )}
            </div>'''
assert s.count(old1) == 1
s = s.replace(old1, new1, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK skeleton_style_loading")
