p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 4) Taruh periodControl (date picker) di baris kontrol FormHeader, rata
#    kanan - kalau ada scope block (Depo/District/SDM context khusus
#    Langkah 2-4), scope block di kiri & periodControl nempel di kanan
#    dalam baris yg sama (space-between); kalau tidak ada (Langkah 1),
#    periodControl sendirian rata kanan spt biasa.
old_children_open = '''        {(isMcStep || isSdmStep) && depoOptions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: isSdmStep ? 10 : 0, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: "10px 14px", width: isSdmStep ? "100%" : "auto" }}>'''
new_children_open = '''        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, width: "100%", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
        {(isMcStep || isSdmStep) && depoOptions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: isSdmStep ? 10 : 0, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: "10px 14px", width: isSdmStep ? "100%" : "auto" }}>'''
do(old_children_open, new_children_open, 1, "FormHeader children wrap open")

old_children_close = '''          </div>
        )}
      </FormHeader>'''
new_children_close = '''          </div>
        )}
        </div>
        {periodControl}
        </div>
      </FormHeader>'''
do(old_children_close, new_children_close, 1, "FormHeader children wrap close")

open(p, "w").write(S["s"])
print("PATCH_B_OK")
