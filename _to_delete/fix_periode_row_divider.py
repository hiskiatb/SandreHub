import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "ini juga tambahkan dividernya dan gap atas
# bawah seragam, kecilkan sedikit ukuran tanggalnya"): baris badge Periode
# Status/Penjualan + date-nav sebelumnya ga punya padding atas (0) tapi
# punya padding bawah (12px) - keliatan NEMPEL ke garis pembatas ID DSE
# di atasnya, ga simetris. Sekarang padding dibikin SERAGAM (14px atas &
# bawah) + ditambah divider (borderBottom) di bawahnya biar jadi 1 blok
# header yg jelas batasnya, konsisten sama pola divider lain di popup ini.
# Ukuran font tanggal jg dikecilin dikit (clamp 12-16px -> 11-14px).
old1 = '''                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 18px 12px", flexShrink: 0 }}>'''
assert s.count(old1) == 1
new1 = '''                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>'''
s = s.replace(old1, new1, 1)

old2 = '''            <span style={{ fontSize: "clamp(12px, 3.6vw, 16px)", fontWeight: 700, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{periodMode === "bulan" ? (periodSubtitle || fmtDayMonthFull(entryDate)) : fmtDayMonthFull(entryDate)}</span>'''
assert s.count(old2) == 1
new2 = '''            <span style={{ fontSize: "clamp(11px, 3.2vw, 14px)", fontWeight: 700, color: t.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{periodMode === "bulan" ? (periodSubtitle || fmtDayMonthFull(entryDate)) : fmtDayMonthFull(entryDate)}</span>'''
s = s.replace(old2, new2, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK periode_row_divider")
