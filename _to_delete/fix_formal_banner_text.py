import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "buat lebih formal dan mudah dimengerti"):
# teks banner dashed di mode Full Month (sebelumnya: "Untuk mengedit
# penjualan SP, gunakan menu Daily - pilih tanggalnya, lalu catat di
# sana.") diformalkan & dirapikan strukturnya jadi 1 kalimat utuh dgn
# urutan sebab-akibat yg lebih jelas.
old1 = '''<div style={{ fontSize: 11.5, color: t.mid, marginBottom: 8, lineHeight: 1.45 }}>Untuk mengubah data DSE (Nama, Status, Join Date), gunakan menu <b>Daily</b> - pilih tanggalnya, lalu ubah di sana.</div>'''
assert s.count(old1) == 1
new1 = '''<div style={{ fontSize: 11.5, color: t.mid, marginBottom: 8, lineHeight: 1.45 }}>Untuk mengubah data DSE (Nama, Status, atau Join Date), silakan beralih ke menu <b>Daily</b> dan pilih tanggal yang sesuai untuk melakukan perubahan.</div>'''
s = s.replace(old1, new1, 1)

old2 = '''<div style={{ fontSize: 11.5, color: t.mid, marginBottom: 8, lineHeight: 1.45 }}>Untuk mengedit penjualan <b>{label}</b>, gunakan menu <b>Daily</b> - pilih tanggalnya, lalu catat di sana.</div>'''
assert s.count(old2) == 1
new2 = '''<div style={{ fontSize: 11.5, color: t.mid, marginBottom: 8, lineHeight: 1.45 }}>Untuk mencatat atau mengubah data penjualan <b>{label}</b>, silakan beralih ke menu <b>Daily</b> dan pilih tanggal yang sesuai untuk mencatat data tersebut.</div>'''
s = s.replace(old2, new2, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK formal_banner_text")
