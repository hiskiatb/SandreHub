path = "/sessions/rcw-01mf3jhywgdbbt3tdbknwjzf/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx"
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "untuk id dse mengapa kita tidak bisa mencari id
# 3id, perbaiki"): opsi filter kolom "ID DSE" sebelumnya cuma dibangun dari
# dse_code (ID IM3) - label opsi = value = dse_code, jadi search box (yang
# match ke `label`, lihat ExcelFilter.jsx) ga akan pernah ketemu kalau user
# ngetik ID 3ID (dse_code_3id). Sekarang label-nya gabungan "IM3 / 3ID" biar
# search cocok ke KEDUA id, sementara value tetap dse_code (identitas unik
# yg dipakai utk filtering, ga berubah).
old1 = '''      id: uniq(enrichedDse.map((x) => x.r.dse_code)),'''
assert s.count(old1) == 1
new1 = '''      id: uniq(enrichedDse.map((x) => x.r.dse_code))
        .map((o) => {
          const match = enrichedDse.find((x) => x.r.dse_code === o.value);
          const id3id = match?.r?.dse_code_3id;
          return id3id ? { ...o, label: `${o.label} / ${id3id}` } : o;
        }),'''
assert s.count(old1) == 1 or True
s = s.replace(old1, new1, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK id_dse_search_3id")
