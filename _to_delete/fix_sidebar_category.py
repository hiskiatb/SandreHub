import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

start_marker = '    const editPopupPortal = cardOpen && typeof document !== "undefined" && createPortal('
end_marker = '        document.body\n      );'

si = s.index(start_marker)
ei = s.index(end_marker, si) + len(end_marker)
old_block = s[si:ei]
assert s.count(old_block) == 1

new_block = '''    const editPopupPortal = cardOpen && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(15,23,32,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(ev) => { if (ev.target === ev.currentTarget) requestClosePopup(); }}>
          {/* UPDATE (permintaan user - "sepertinya desainya lebih bagus jika
              kategori itu menjadi sidebar"): layout popup diubah dari kolom
              tunggal (tab kategori grid 2x2 di ATAS body) jadi 2-KOLOM gaya
              sidebar - kategori (Informasi DSE/SP/Voucher/Saldo) sekarang
              jadi daftar vertikal MENEMPEL DI KIRI (pola sidebar umum), badan
              popup (badge Periode + tanggal + caption + field2) di kolom
              kanannya. Lebar popup dilebarkan dikit (520->600) biar sidebar
              ga bikin sempit kolom kanan. Kalau cuma 1 kategori (mode AR),
              sidebar ga dirender sama sekali (sama kayak sebelumnya
              sheetTabBar disembunyikan), kolom kanan auto full width. ID DSE
              & footer Batal/Simpan tetap FULL WIDTH ngelewatin sidebar
              (bukan ikut masuk ke kolom kanan), biar identitas & tombol aksi
              jelas berlaku utk SEMUA kategori, bukan cuma yg lagi aktif. */}
          <div style={{ width: "92vw", maxWidth: 600, maxHeight: "88vh", background: t.card, borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,0.38)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "modalPopIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
            <div style={{ padding: "16px 18px 0", flexShrink: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: dse.dse_code_3id ? "1fr 1fr" : "1fr", gap: 10 }}>
                <div>
                  <div style={labelStyle}>ID DSE (IM3)</div>
                  <div style={{ height: 34, padding: "0 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.sub, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: "#D97706", flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dse.dse_code}</span>
                  </div>
                </div>
                {dse.dse_code_3id && (
                  <div>
                    <div style={labelStyle}>ID DSE (3ID)</div>
                    <div style={{ height: 34, padding: "0 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.sub, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: "#BE185D", flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dse.dse_code_3id}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", flex: 1, minHeight: 0, marginTop: 14 }}>
              {sheetTabs.length > 1 && (
                <div style={{ width: 128, flexShrink: 0, borderRight: `1px solid ${t.line}`, background: t.sub, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 5, overflowY: "auto" }}>
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
                  })}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 18px 12px", flexShrink: 0 }}>
                  {!isAr ? (
                    <>
                      {(() => {
                        const periodLabelColor = sheetTab === "info" ? t.teal : sheetTab === "sp" ? t.red : sheetTab === "voucher" ? t.blue : t.amber;
                        const periodLabelBg = sheetTab === "info" ? t.tealBg : sheetTab === "sp" ? t.redBg : sheetTab === "voucher" ? t.blueBg : t.amberBg;
                        return (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, padding: "6px 10px", borderRadius: 10, background: periodLabelBg }}>
                            <span style={{ width: 5, height: 5, borderRadius: 999, background: periodLabelColor, flexShrink: 0 }} />
                            <span style={{ fontSize: 10, fontWeight: 800, color: periodLabelColor, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                              {sheetTab === "info" ? "Periode Status" : "Periode Penjualan"}
                            </span>
                          </div>
                        );
                      })()}
                      <div style={{ flex: 1, minWidth: 0 }}>{periodDateNavInline}</div>
                    </>
                  ) : <div style={{ flex: 1 }} />}
                </div>
                {!isAr && (
                  <div style={{ padding: "0 18px 10px", fontSize: 11, color: t.mid, lineHeight: 1.4 }}>
                    {sheetTab === "info"
                      ? "Data di bawah ini berlaku untuk tanggal yang dipilih di atas. Ganti tanggalnya kalau mau melihat/mengubah data di hari lain."
                      : "Angka penjualan di bawah ini khusus untuk tanggal yang dipilih di atas. Ganti tanggalnya kalau mau isi/lihat hari lain."}
                  </div>
                )}
                {periodSummaryBar}
                <div style={{ overflowY: "auto", padding: "0 18px 14px", flex: 1, borderTop: `1px solid ${t.line}` }}>
                  <div style={{ paddingTop: 14 }}>
                    {sheetBody}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${t.line}`, background: t.card, flexShrink: 0, display: "flex", gap: 8 }}>
              <button onClick={requestClosePopup} style={{ flex: readOnly ? undefined : 1, width: readOnly ? "100%" : undefined, height: 34, borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                Batal
              </button>
              {!readOnly && <div style={{ flex: 1 }}>{renderSaveButton(true, () => setCardOpen(false))}</div>}
            </div>
          </div>
        </div>,
        document.body
      );'''

assert s.count(new_block) == 0
s = s.replace(old_block, new_block, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK sidebar_category")
