path = "$HOME_PLACEHOLDER/mnt/tracehub/app/dashboard/components/ExcelFilter.jsx"
import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/ExcelFilter.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "jangan ada teks yang tertutup"): opsi di daftar
# popup filter (mis. kolom ID DSE yg sekarang labelnya gabungan "IM3 / 3ID")
# sebelumnya dipotong pakai ellipsis ("ACEHBADA2101 / ACEHBAD...") krn
# overflow:hidden + whiteSpace:nowrap - teks panjang jadi ga kebaca penuh.
# Sekarang teks opsi boleh wrap ke baris berikutnya (ga dipotong lagi), &
# lebar default popup dilebarkan dikit (240 -> 260) biar label pendek masih
# muat 1 baris kaya biasa, cuma yg panjang yg wrap.
old1 = '''                <span style={{ fontSize: 12, color: t.hi, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.label}</span>'''
assert s.count(old1) == 1
new1 = '''                <span style={{ fontSize: 12, color: t.hi, fontWeight: 500, wordBreak: "break-word", lineHeight: 1.35 }}>{opt.label}</span>'''
s = s.replace(old1, new1, 1)

old2 = '''  const [size, setSize] = useState({ w: 240, h: 360 });'''
assert s.count(old2) == 1
new2 = '''  const [size, setSize] = useState({ w: 260, h: 360 });'''
s = s.replace(old2, new2, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK excelfilter_no_clip")
