import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "untuk full month ini ubah deskripsi untuk
# lebih mengarahkan untuk ubah ke menu daily untuk mengisi, dan angka
# penjualan berlaku untuk bulan terpilih itu tidak perlu lagi sepertinya"):
# caption amber ini sebelumnya SELALU pakai framing "...berlaku untuk
# tanggal terpilih" apapun periodMode-nya - di mode Full Month framing ini
# ga nyambung (ga ada "tanggal terpilih", yg ada "bulan terpilih", & field
# di mode ini emang read-only, bukan BISA diubah lewat ubah tanggal). Teks
# sekarang beda per periodMode: mode Daily tetap framing lama (arahkan
# ganti tanggal), mode Full Month framing BARU yg eksplisit ngarahin
# pindah ke menu Daily utk ngisi/ubah data (bukan lagi nyebut "berlaku
# utk bulan terpilih").
old1 = '''                    <span style={{ fontSize: 11.5, color: t.hi, lineHeight: 1.45 }}>
                      {sheetTab === "info"
                        ? "Data di bawah berlaku untuk tanggal terpilih. Ubah tanggal untuk melihat/mengubah data hari lain."
                        : "Angka penjualan berlaku untuk tanggal terpilih. Ubah tanggal untuk mengisi/melihat data hari lain."}
                    </span>'''
assert s.count(old1) == 1
new1 = '''                    <span style={{ fontSize: 11.5, color: t.hi, lineHeight: 1.45 }}>
                      {periodMode === "bulan"
                        ? (sheetTab === "info"
                            ? "Untuk mengisi atau mengubah data DSE, beralih ke menu Daily lalu pilih tanggalnya."
                            : "Untuk mengisi atau mengubah data penjualan, beralih ke menu Daily lalu pilih tanggalnya.")
                        : (sheetTab === "info"
                            ? "Data di bawah berlaku untuk tanggal terpilih. Ubah tanggal untuk melihat/mengubah data hari lain."
                            : "Angka penjualan berlaku untuk tanggal terpilih. Ubah tanggal untuk mengisi/melihat data hari lain.")}
                    </span>'''
assert s.count(old1) == 1
s = s.replace(old1, new1, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK bulanmode_caption")
