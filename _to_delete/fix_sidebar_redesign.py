import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "redesign total bagian ini" [sidebar
# Kategori]): redesign menyeluruh item sidebar kategori -
# - Sidebar dilebarin (168->192px, popup ikut 640->664) biar label
#   "Penjualan Voucher" MUAT 1 BARIS (dulu wrap ke 2 baris & bikin tinggi
#   antar item ga rata/berantakan).
# - Indikator "aktif" diganti dari borderLeft 3px KOTAK (nabrak sudut
#   rounded si tombol, keliatan patah) jadi box-shadow INSET kiri yg
#   ngikutin border-radius tombol (overflow:hidden) - hasilnya aksen kiri
#   tetep rounded nyambung sama bentuk tombolnya, ga patah di sudut.
# - Ditambah border tipis warna kategori (bukan cuma background) + shadow
#   halus pas aktif, biar state terpilih keliatan lebih "nempel"/jelas.
# - Icon badge dibesarin dikit (22->26) + dapet shadow halus pas aktif.
# - Jarak antar item ditambah (5->7) + padding tombol lebih lega.
old1 = '''                <div style={{ width: 168, flexShrink: 0, borderRight: `1px solid ${t.line}`, background: t.sub, padding: "12px 9px", display: "flex", flexDirection: "column", gap: 5, overflowY: "auto" }}>
                  <div style={{ fontSize: 10, color: t.lo, marginBottom: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, padding: "0 7px" }}>Kategori</div>
                  {sheetTabs.map((st) => {
                    const active = sheetTab === st.k;
                    const Icon = st.icon;
                    const tabColor = st.color || t.teal;
                    const tabBg = st.bg || t.tealBg;
                    return (
                      <button key={st.k} onClick={() => setSheetTab(st.k)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "8px 7px", borderRadius: 9,
                          border: "none", borderLeft: `3px solid ${active ? tabColor : "transparent"}`,
                          background: active ? tabBg : "transparent",
                          color: active ? t.hi : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                          textAlign: "left", width: "100%", transition: "background 0.15s, border-color 0.15s",
                        }}>
                        <div style={{ width: 22, height: 22, borderRadius: 7, background: active ? t.card : tabBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon size={12} color={tabColor} />
                        </div>
                        <span style={{ whiteSpace: "normal", lineHeight: 1.25, wordBreak: "break-word" }}>{st.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}'''
assert s.count(old1) == 1
new1 = '''                <div style={{ width: 192, flexShrink: 0, borderRight: `1px solid ${t.line}`, background: t.sub, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 7, overflowY: "auto" }}>
                  <div style={{ fontSize: 10, color: t.lo, marginBottom: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, padding: "0 7px" }}>Kategori</div>
                  {sheetTabs.map((st) => {
                    const active = sheetTab === st.k;
                    const Icon = st.icon;
                    const tabColor = st.color || t.teal;
                    const tabBg = st.bg || t.tealBg;
                    return (
                      <button key={st.k} onClick={() => setSheetTab(st.k)}
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
                      </button>
                    );
                  })}
                </div>
              )}'''
assert s.count(old1) == 1
s = s.replace(old1, new1, 1)

old2 = '''          <div style={{ width: "92vw", maxWidth: 640, maxHeight: "88vh", background: t.card, borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,0.38)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalPopIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>'''
assert s.count(old2) == 1
new2 = '''          <div style={{ width: "92vw", maxWidth: 664, maxHeight: "88vh", background: t.card, borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,0.38)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalPopIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>'''
s = s.replace(old2, new2, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK sidebar_redesign")
