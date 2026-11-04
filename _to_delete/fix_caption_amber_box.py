import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "bungkus container kuning dan iconnya buat
# menjadi lebih rapi" + "ringkas ke dalam 2 line max saja"): caption info
# di bawah badge Periode sebelumnya cuma teks polos ngambang (ga ada
# container) & kepanjangan (3 baris). Sekarang dibungkus 1 box kuning/
# amber (background t.amberBg + border tipis t.amber, rounded) biar
# keliatan sbg catatan/notice yg jelas batasnya, icon-nya jg diwarnain
# amber match container-nya (dulu abu-abu polos). Teksnya diringkas biar
# muat maks 2 baris.
old1 = '''                {!isAr && (
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
new1 = '''                {!isAr && (
                  <div style={{ margin: "12px 18px 0", padding: "10px 12px", borderRadius: 10, background: t.amberBg, border: `1px solid ${t.amber}33`, display: "flex", alignItems: "flex-start", gap: 7 }}>
                    <Info size={14} color={t.amber} style={{ flexShrink: 0, marginTop: 1.5 }} />
                    <span style={{ fontSize: 11.5, color: t.hi, lineHeight: 1.45 }}>
                      {sheetTab === "info"
                        ? "Data di bawah berlaku untuk tanggal terpilih. Ubah tanggal untuk melihat/mengubah data hari lain."
                        : "Angka penjualan berlaku untuk tanggal terpilih. Ubah tanggal untuk mengisi/melihat data hari lain."}
                    </span>
                  </div>
                )}'''
assert s.count(old1) == 1
s = s.replace(old1, new1, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK caption_amber_box")
