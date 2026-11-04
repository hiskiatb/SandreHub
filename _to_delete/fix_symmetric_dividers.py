import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "pisahkan divider menjadi simetris dan enak
# dilihat"): sebelumnya ada 1 garis pemisah horizontal di DALAM kolom
# kanan doang (borderTop sblm area scroll body) yg CUMA selebar kolom
# kanan - ga nyambung/sejajar sama 2 garis horizontal lain (bawah title
# bar & atas footer) yg selebar PENUH popup (nembus sidebar jg). Hasilnya
# keliatan "bolong"/ga simetris - sidebar ga punya garis horizontal yg
# sejajar. Garis itu DIHAPUS, diganti 1 garis horizontal FULL WIDTH
# persis di bawah box ID DSE (sebelum baris Sidebar+Konten dimulai) -
# sekarang SEMUA garis horizontal (bawah title, bawah ID DSE, atas
# footer) sama2 selebar penuh popup, simetris & konsisten.
old1 = '''            <div style={{ padding: "16px 18px 0", flexShrink: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: dse.dse_code_3id ? "1fr 1fr" : "1fr", gap: 10 }}>'''
assert s.count(old1) == 1
new1 = '''            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: dse.dse_code_3id ? "1fr 1fr" : "1fr", gap: 10 }}>'''
s = s.replace(old1, new1, 1)

old2 = '''            <div style={{ display: "flex", flex: 1, minHeight: 0, marginTop: 14 }}>'''
assert s.count(old2) == 1
new2 = '''            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>'''
s = s.replace(old2, new2, 1)

old3 = '''                <div style={{ overflowY: "auto", padding: "0 18px 14px", flex: 1, borderTop: `1px solid ${t.line}` }}>
                  <div style={{ paddingTop: 14 }}>
                    {sheetBody}
                  </div>
                </div>'''
assert s.count(old3) == 1
new3 = '''                <div style={{ overflowY: "auto", padding: "0 18px 14px", flex: 1 }}>
                  {sheetBody}
                </div>'''
s = s.replace(old3, new3, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK symmetric_dividers")
