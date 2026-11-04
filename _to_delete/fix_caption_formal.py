import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "rapikan bagian ini dan bahasanya lebih
# formal"): caption penjelasan di bawah badge Periode sebelumnya padding
# atasnya 0 (nempel ke divider baru di atasnya) + bahasanya agak santai
# ("kalau mau isi/lihat hari lain"). Sekarang: padding dibikin simetris
# (12px atas-bawah) + ditambah icon info kecil biar lebih rapi scr visual
# (bukan cuma teks polos ngambang), bahasanya diformalkan ("apabila Anda
# ingin ... pada hari lain").
old1 = '''                {!isAr && (
                  <div style={{ padding: "0 18px 10px", fontSize: 11.5, color: t.mid, lineHeight: 1.4 }}>
                    {sheetTab === "info"
                      ? "Data di bawah ini berlaku untuk tanggal yang dipilih di atas. Ganti tanggalnya kalau mau melihat/mengubah data di hari lain."
                      : "Angka penjualan di bawah ini khusus untuk tanggal yang dipilih di atas. Ganti tanggalnya kalau mau isi/lihat hari lain."}
                  </div>
                )}'''
assert s.count(old1) == 1
new1 = '''                {!isAr && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "12px 18px", fontSize: 11.5, color: t.mid, lineHeight: 1.5 }}>
                    <Info size={14} color={t.lo} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      {sheetTab === "info"
                        ? "Data di bawah ini berlaku untuk tanggal yang dipilih di atas. Ubah tanggal tersebut apabila Anda ingin melihat atau mengubah data pada hari lain."
                        : "Angka penjualan di bawah ini berlaku khusus untuk tanggal yang dipilih di atas. Ubah tanggal tersebut apabila Anda ingin mengisi atau melihat data pada hari lain."}
                    </span>
                  </div>
                )}'''
assert s.count(old1) == 1
s = s.replace(old1, new1, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK caption_formal")
