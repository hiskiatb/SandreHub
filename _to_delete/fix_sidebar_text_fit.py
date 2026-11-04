import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "perbaiki pastikan desain lebih bagus, lebih
# rapi dan semua text sebaiknya terlihat dengan baik"): sidebar kategori yg
# baru ditambah (128px) KETERLALU SEMPIT - label "Informasi DSE"/"Penjualan
# Voucher"/"Penjualan Saldo" kepotong ellipsis ("Informasi D…", "Penjualan
# V…", "Penjualan S…"), ga kebaca penuh. Sidebar dilebarin (128->168px,
# padding lebih lega), font label dinaikin dikit (10.5->11) & BOLEH WRAP ke
# baris ke-2 (bukan dipotong ellipsis lagi) kalau masih kepanjangan di
# layar sempit, icon & gap jg dibesarin sedikit biar proporsinya pas.
# Popup dilebarin (600->640) biar kolom kanan ga ikut kegencet gara2
# sidebar lebih lebar.
old1 = '''          <div style={{ width: "92vw", maxWidth: 600, maxHeight: "88vh", background: t.card, borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,0.38)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalPopIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>'''
assert s.count(old1) == 1
new1 = '''          <div style={{ width: "92vw", maxWidth: 640, maxHeight: "88vh", background: t.card, borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,0.38)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalPopIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>'''
s = s.replace(old1, new1, 1)

old2 = '''                <div style={{ width: 128, flexShrink: 0, borderRight: `1px solid ${t.line}`, background: t.sub, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 5, overflowY: "auto" }}>
                  <div style={{ fontSize: 9, color: t.lo, marginBottom: 2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.2, padding: "0 6px" }}>Kategori</div>
                  {sheetTabs.map((st) => {
                    const active = sheetTab === st.k;
                    const Icon = st.icon;
                    const tabColor = st.color || t.teal;
                    const tabBg = st.bg || t.tealBg;
                    return (
                      <button key={st.k} onClick={() => setSheetTab(st.k)}
                        style={{
                          display: "flex", alignItems: "center", gap: 7, padding: "7px 7px", borderRadius: 8,
                          border: "none", borderLeft: `3px solid ${active ? tabColor : "transparent"}`,
                          background: active ? tabBg : "transparent",
                          color: active ? t.hi : t.mid, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                          textAlign: "left", width: "100%", transition: "background 0.15s, border-color 0.15s",
                        }}>
                        <div style={{ width: 20, height: 20, borderRadius: 6, background: active ? t.card : tabBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon size={11} color={tabColor} />
                        </div>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.label}</span>
                      </button>
                    );
                  })}'''
assert s.count(old2) == 1
new2 = '''                <div style={{ width: 168, flexShrink: 0, borderRight: `1px solid ${t.line}`, background: t.sub, padding: "12px 9px", display: "flex", flexDirection: "column", gap: 5, overflowY: "auto" }}>
                  <div style={{ fontSize: 9.5, color: t.lo, marginBottom: 3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, padding: "0 7px" }}>Kategori</div>
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
                          color: active ? t.hi : t.mid, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                          textAlign: "left", width: "100%", transition: "background 0.15s, border-color 0.15s",
                        }}>
                        <div style={{ width: 22, height: 22, borderRadius: 7, background: active ? t.card : tabBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon size={12} color={tabColor} />
                        </div>
                        <span style={{ whiteSpace: "normal", lineHeight: 1.25, wordBreak: "break-word" }}>{st.label}</span>
                      </button>
                    );
                  })}'''
assert s.count(old2) == 1
s = s.replace(old2, new2, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK sidebar_text_fit")
