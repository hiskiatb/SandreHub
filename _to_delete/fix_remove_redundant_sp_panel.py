import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "cukup penjualan SP diatas yang ada iconnya
# sudah tidak perlu lagi"): sekarang udah ada judul section "Penjualan
# {label}" + tombol Riwayat persis di atasnya (row baru yg ditambah
# sebelumnya) - panel kotak ber-icon "Penjualan SP"/dst di bawahnya jadi
# DUPLIKAT judul yg sama persis, cuma beda gaya doang. Dihapus total.
old = '''          {/* UPDATE (permintaan user - "buat desain input penjualan
              menjadi lebih bagus"): header icon+judul+subtitle dulu
              ngambang di atas background polos putih, skrg dibungkus
              panel bertinta warna tab (pakai `bg` yg sama dgn warna icon
              box) - biar setiap tab SP/Voucher/Saldo punya identitas
              visual yg jelas begitu dibuka, bukan cuma beda di 1 icon
              kecil doang. */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, padding: "14px 14px", borderRadius: 14, background: bg }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: t.card, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: t.shadowSm }}>
              <Icon size={19} color={color} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: t.hi }}>Penjualan {label}</div>
              <div style={{ fontSize: 11, color: t.mid, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Penjualan {label}{periodSubtitle ? ` ${periodSubtitle}` : ""}</div>
            </div>
          </div>
'''
assert s.count(old) == 1
s = s.replace(old, "", 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK remove_redundant_sp_panel")
