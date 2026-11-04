import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

old1 = '''          <div style={{ width: "92vw", maxWidth: 640, maxHeight: "88vh", background: t.card, borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,0.38)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalPopIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
            <div style={{ padding: "16px 18px 0", flexShrink: 0 }}>'''
assert s.count(old1) == 1
new1 = '''          <div style={{ width: "92vw", maxWidth: 640, maxHeight: "88vh", background: t.card, borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,0.38)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalPopIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
            {/* UPDATE (permintaan user - "di atas tambahkan Form Informasi
                & Penjualan DSE baru dikanannya ada tombol close"): title
                bar paling atas popup - nama form + tombol close (X) biar
                user eksplisit tau ini form apa & ada cara jelas nutup
                popup tanpa harus scroll ke tombol Batal di bawah. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Form Informasi &amp; Penjualan DSE</span>
              <button onClick={requestClosePopup} title="Tutup" style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                <X size={15} color={t.mid} />
              </button>
            </div>
            <div style={{ padding: "16px 18px 0", flexShrink: 0 }}>'''
assert s.count(new1) == 0
s = s.replace(old1, new1, 1)

# UPDATE (permintaan user - "sejajar dengan tombol riwayat ada title
# submenu kategori yang terpilih"): baris yg sebelumnya cuma isi tombol
# "Riwayat"/"Riwayat Informasi" (nempel kanan doang) sekarang ditambah
# TITLE kategori yg lagi aktif di kirinya, SAMA PERSIS label di sidebar
# Kategori.
old2 = '''        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          {renderHistoryLink("info", "Riwayat Informasi")}
        </div>'''
assert s.count(old2) == 1
new2 = '''        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Informasi DSE</span>
          {renderHistoryLink("info", "Riwayat Informasi")}
        </div>'''
assert s.count(old2) == 1
s = s.replace(old2, new2, 1)

old3 = '''          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            {renderHistoryLink(tabKey, "Riwayat")}
          </div>'''
assert s.count(old3) == 1
new3 = '''          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>Penjualan {label}</span>
            {renderHistoryLink(tabKey, "Riwayat")}
          </div>'''
assert s.count(old3) == 1
s = s.replace(old3, new3, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK header_title_close2")
