import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "fix golden ratio untuk memudahkan membaca nya
# dengan baik" -> klarifikasi: "proporsi ukuran font, semuanya"): ukuran
# font di "shell" popup form DSE (title bar, ID DSE box, sidebar Kategori,
# badge Periode, section title, caption, tombol footer) sebelumnya ga
# konsisten/asal (9.5, 10, 11, 11.5, 12.5, 13, 14.5 tercampur tanpa pola).
# Dirapikan jadi SATU skala bertingkat berbasis rasio emas (~1.27x /
# akar(phi) per tingkat, phi penuh antar tingkat ujung) biar hierarki
# baca-nya jelas & proporsional:
#   xs (10px)  = label mikro uppercase (labelStyle, badge Periode, "Kategori")
#   sm (11.5px)= teks sekunder (caption, tombol Riwayat)
#   base (13px)= teks utama (item sidebar kategori, nilai ID DSE, tombol
#                Batal/Simpan)
#   md (14.5px)= sub-judul section ("Informasi DSE"/"Penjualan SP")
#   lg (16px)  = judul popup ("Form Informasi & Penjualan DSE")

# 1) Judul popup: 14.5 -> 16 (lg)
old1 = '''              <span style={{ fontSize: 14.5, fontWeight: 800, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Form Informasi &amp; Penjualan DSE</span>'''
assert s.count(old1) == 1
new1 = '''              <span style={{ fontSize: 16, fontWeight: 800, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Form Informasi &amp; Penjualan DSE</span>'''
s = s.replace(old1, new1, 1)

# 2) Label "Kategori" di sidebar: 9.5 -> 10 (xs, samain sama labelStyle)
old2 = '''                  <div style={{ fontSize: 9.5, color: t.lo, marginBottom: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, padding: "0 7px" }}>Kategori</div>'''
assert s.count(old2) == 1
new2 = '''                  <div style={{ fontSize: 10, color: t.lo, marginBottom: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, padding: "0 7px" }}>Kategori</div>'''
s = s.replace(old2, new2, 1)

# 3) Item sidebar kategori (Informasi DSE/Penjualan SP/dst): 11 -> 13 (base)
old3 = '''                          color: active ? t.hi : t.mid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,'''
assert s.count(old3) == 1
new3 = '''                          color: active ? t.hi : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,'''
s = s.replace(old3, new3, 1)

# 4) Nilai ID DSE (IM3) & (3ID): 12.5 -> 13 (base)
old4 = '''                    <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dse.dse_code}</span>'''
assert s.count(old4) == 1
new4 = '''                    <span style={{ fontSize: 13, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dse.dse_code}</span>'''
s = s.replace(old4, new4, 1)

old5 = '''                      <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dse.dse_code_3id}</span>'''
assert s.count(old5) == 1
new5 = '''                      <span style={{ fontSize: 13, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dse.dse_code_3id}</span>'''
s = s.replace(old5, new5, 1)

# 5) Caption paragraf di bawah badge Periode: 11 -> 11.5 (sm)
old6 = '''                  <div style={{ padding: "0 18px 10px", fontSize: 11, color: t.mid, lineHeight: 1.4 }}>'''
assert s.count(old6) == 1
new6 = '''                  <div style={{ padding: "0 18px 10px", fontSize: 11.5, color: t.mid, lineHeight: 1.4 }}>'''
s = s.replace(old6, new6, 1)

# 6) Tombol footer Batal: 12.5 -> 13 (base) - target SPESIFIK tombol
# requestClosePopup di popup ini (pola ini dipakai jg di tempat lain di
# file, makanya old-string disertai `onClick={requestClosePopup}` biar
# cuma kena 1 instance).
old7 = '''              <button onClick={requestClosePopup} style={{ flex: readOnly ? undefined : 1, width: readOnly ? "100%" : undefined, height: 34, borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>'''
assert s.count(old7) == 1
new7 = '''              <button onClick={requestClosePopup} style={{ flex: readOnly ? undefined : 1, width: readOnly ? "100%" : undefined, height: 34, borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>'''
s = s.replace(old7, new7, 1)

# 7) Section title "Informasi DSE" / "Penjualan {label}" (sejajar tombol
# Riwayat): 13 -> 14.5 (md - 1 tingkat di atas base, biar jelas beda level
# sama item sidebar/nilai ID DSE yg base-nya 13 juga)
old8 = '''          <span style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Informasi DSE</span>'''
assert s.count(old8) == 1
new8 = '''          <span style={{ fontSize: 14.5, fontWeight: 800, color: t.hi }}>Informasi DSE</span>'''
s = s.replace(old8, new8, 1)

old9 = '''            <span style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Penjualan {label}</span>'''
assert s.count(old9) == 1
new9 = '''            <span style={{ fontSize: 14.5, fontWeight: 800, color: t.hi }}>Penjualan {label}</span>'''
s = s.replace(old9, new9, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK golden_ratio_font")
