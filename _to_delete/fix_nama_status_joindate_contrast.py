import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "nama DSE, status terpilih dan juga join date
# dibuat kontras dengan baik"): 3 field ini sebelumnya kurang kontras -
# Join Date & Catatan pakai font REGULAR (fontWeight ga di-set = default
# 400) di size kecil (12.5) jadi keliatan tipis/pudar meski warnanya udah
# t.hi (gelap), Status select bordernya cuma alpha 20% (`${sm.color}33`)
# jadi batas kotaknya nyaris ga keliatan, Nama DSE displaynya jg size
# sama kecilnya. Sekarang:
# - textInputStyle (dipake bareng utk Join Date, input Catatan, & input
#   Nama di popup Isi/Ubah Nama): fontWeight 600 (dulu ga di-set/400) +
#   fontSize naik ke 13, biar teksnya SOLID bukan tipis.
# - selectStyle (Status, inherit dari textInputStyle di atas): border
#   alpha dinaikin 20%->38% (`${sm.color}61`) biar kotaknya jelas
#   kebatasnya, bukan cuma warna teks doang yg nunjukin dia "aktif".
# - Nilai Nama DSE (display read-only sebelum diedit): fontSize naik ke
#   13 match textInputStyle, biar levelnya samain.
old1 = '''  const textInputStyle = { width: "100%", height: 34, padding: "0 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
  const selectStyle = { ...textInputStyle, cursor: "pointer", color: sm.color, fontWeight: 700, background: sm.bg, border: `1px solid ${sm.color}33`, appearance: "none", WebkitAppearance: "none", paddingRight: 28 };'''
assert s.count(old1) == 1
new1 = '''  const textInputStyle = { width: "100%", height: 34, padding: "0 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 600, fontFamily: FONT, outline: "none", boxSizing: "border-box" };
  const selectStyle = { ...textInputStyle, cursor: "pointer", color: sm.color, fontWeight: 700, background: sm.bg, border: `1px solid ${sm.color}61`, appearance: "none", WebkitAppearance: "none", paddingRight: 28 };'''
s = s.replace(old1, new1, 1)

old2 = '''              <span style={{ fontSize: 12.5, fontWeight: namaVal ? 700 : 400, fontStyle: namaVal ? "normal" : "italic", color: namaVal ? t.hi : t.lo, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{namaVal || "Belum diisi"}</span>'''
assert s.count(old2) == 1
new2 = '''              <span style={{ fontSize: 13, fontWeight: namaVal ? 700 : 400, fontStyle: namaVal ? "normal" : "italic", color: namaVal ? t.hi : t.lo, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{namaVal || "Belum diisi"}</span>'''
s = s.replace(old2, new2, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK nama_status_joindate_contrast")
