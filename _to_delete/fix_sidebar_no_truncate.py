import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "jangan biarkan ada text yang diringkas"):
# label sidebar kategori (mis. "Penjualan Voucher") masih kepotong jadi
# "Penjualan Vouch…" di layar sempit walau sidebar udah dilebarin -
# dipaksa 1 baris doang (whiteSpace nowrap + ellipsis). Sekarang label
# BOLEH wrap ke baris ke-2 (ga pernah dipotong/disingkat lagi), icon
# tombolnya di-align ke atas (bukan center) biar tetep sejajar rapi sama
# baris PERTAMA teks walau labelnya jadi 2 baris.
old1 = '''                      <button key={st.k} onClick={() => setSheetTab(st.k)}
                        style={{
                          position: "relative", overflow: "hidden",
                          display: "flex", alignItems: "center", gap: 9, padding: "10px 10px", borderRadius: 12,
                          border: `1px solid ${active ? `${tabColor}40` : "transparent"}`,
                          background: active ? tabBg : "transparent",
                          boxShadow: active ? `inset 3px 0 0 0 ${tabColor}, 0 3px 10px -4px ${tabColor}70` : "none",
                          color: active ? t.hi : t.mid, fontSize: 13, fontWeight: active ? 700 : 600, cursor: "pointer", fontFamily: FONT,
                          textAlign: "left", width: "100%", transition: "background 0.15s, box-shadow 0.15s, border-color 0.15s",
                        }}>
                        <div style={{ width: 26, height: 26, borderRadius: 8, background: active ? t.card : tabBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: active ? t.shadowSm : "none" }}>
                          <Icon size={13} color={tabColor} />
                        </div>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.label}</span>
                      </button>'''
assert s.count(old1) == 1
new1 = '''                      <button key={st.k} onClick={() => setSheetTab(st.k)}
                        style={{
                          position: "relative", overflow: "hidden",
                          display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 10px", borderRadius: 12,
                          border: `1px solid ${active ? `${tabColor}40` : "transparent"}`,
                          background: active ? tabBg : "transparent",
                          boxShadow: active ? `inset 3px 0 0 0 ${tabColor}, 0 3px 10px -4px ${tabColor}70` : "none",
                          color: active ? t.hi : t.mid, fontSize: 13, fontWeight: active ? 700 : 600, cursor: "pointer", fontFamily: FONT,
                          textAlign: "left", width: "100%", transition: "background 0.15s, box-shadow 0.15s, border-color 0.15s",
                        }}>
                        <div style={{ width: 26, height: 26, borderRadius: 8, background: active ? t.card : tabBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: active ? t.shadowSm : "none" }}>
                          <Icon size={13} color={tabColor} />
                        </div>
                        <span style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.3, paddingTop: 2 }}>{st.label}</span>
                      </button>'''
assert s.count(old1) == 1
s = s.replace(old1, new1, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK sidebar_no_truncate")
