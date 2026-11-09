import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "redundant, cukup 1 saja, dan ada tombol
# arahan tepat, Catat Penjualan SP"): di mode Full Month, caption amber di
# atas (baru ditambah) & banner dashed di bawah (udah ada dari awal, PUNYA
# tombol aksi "Catat Hari Ini") SAMA2 ngarahin pindah ke Daily - duplikat
# pesan. Caption amber SEKARANG CUMA muncul di mode Daily (banner dashed +
# tombolnya yg jadi SATU2NYA pengarah di mode Full Month, krn dia yg punya
# aksi konkret). Label tombolnya jg dibikin SPESIFIK per kategori (dulu
# generic "Catat Hari Ini" di semua kategori) - "Catat Penjualan SP/
# Voucher/Saldo" di tab penjualan, "Catat Informasi DSE" di tab Informasi.
old1 = '''                {!isAr && (
                  <div style={{ margin: "12px 18px 0", padding: "10px 12px", borderRadius: 10, background: t.amberBg, border: `1px solid ${t.amber}33`, display: "flex", alignItems: "flex-start", gap: 7 }}>
                    <Info size={14} color={t.amber} style={{ flexShrink: 0, marginTop: 1.5 }} />
                    <span style={{ fontSize: 11.5, color: t.hi, lineHeight: 1.45 }}>
                      {periodMode === "bulan"
                        ? (sheetTab === "info"
                            ? "Untuk mengisi atau mengubah data DSE, beralih ke menu Daily lalu pilih tanggalnya."
                            : "Untuk mengisi atau mengubah data penjualan, beralih ke menu Daily lalu pilih tanggalnya.")
                        : (sheetTab === "info"
                            ? "Data di bawah berlaku untuk tanggal terpilih. Ubah tanggal untuk melihat/mengubah data hari lain."
                            : "Angka penjualan berlaku untuk tanggal terpilih. Ubah tanggal untuk mengisi/melihat data hari lain.")}
                    </span>
                  </div>
                )}'''
assert s.count(old1) == 1
new1 = '''                {!isAr && periodMode !== "bulan" && (
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

old2 = '''            <button onClick={() => onPickDate?.(todayISO())}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, height: 34, borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              <Calendar size={14} /> Catat Hari Ini
            </button>'''
assert s.count(old2) == 1
new2 = '''            <button onClick={() => onPickDate?.(todayISO())}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, height: 34, borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              <Calendar size={14} /> Catat Informasi DSE
            </button>'''
assert s.count(old2) == 1
s = s.replace(old2, new2, 1)

old3 = '''                <button onClick={() => onPickDate?.(todayISO())}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, height: 34, borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  <Calendar size={14} /> Catat Hari Ini
                </button>'''
assert s.count(old3) == 1
new3 = '''                <button onClick={() => onPickDate?.(todayISO())}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, height: 34, borderRadius: 9, border: "none", background: t.teal, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                  <Calendar size={14} /> Catat Penjualan {label}
                </button>'''
assert s.count(old3) == 1
s = s.replace(old3, new3, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK remove_duplicate_bulan_notice")
