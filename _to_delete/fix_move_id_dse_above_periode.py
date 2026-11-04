import os
path = os.path.expanduser("~/mnt/tracehub/app/dashboard/components/DSE_ProdAR.jsx")
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

# UPDATE (permintaan user - "untuk ID DSE pindahkan diatas periode status"):
# sebelumnya 2 kotak ID DSE (IM3/3ID) ada di DALAM tab "Informasi DSE"
# (infoBody), di bawah header popup + badge "Periode Status" + tab
# kategori - jadi kalau user pindah ke tab lain (Penjualan SP/Voucher/
# Saldo) id-nya ga keliatan sama sekali. Dipindah ke PALING ATAS popup
# (sebelum badge Periode Status & tab kategori), biar identitas DSE-nya
# SELALU keliatan apapun tab yg lagi aktif - cocok krn ID DSE itu
# informasi identitas tetap, bukan data per-kategori/per-tanggal.
old_block = '''        {/* UPDATE (permintaan user - "diatas nama dse ada ID DSE IM3 dan ID
            DSE 3ID"): 2 kode ini sebelumnya cuma nongol di chip header
            kartu list (collapsed) - skrg ditambah juga di DALAM popup
            detail, sbg 2 kotak read-only (bukan chip kecil lagi, biar
            selaras sama field2 lain di tab ini) persis di atas Nama DSE -
            titik warnanya SAMA PERSIS pola chip ID yg udah ada (amber=
            IM3, pink=3ID) biar konsisten. 3ID cuma dirender kalau DSE itu
            emang punya kodenya (ga semua DSE dual-ID). */}
        <div style={{ display: "grid", gridTemplateColumns: dse.dse_code_3id ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 14 }}>
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
'''
assert s.count(old_block) == 1
s = s.replace(old_block, "", 1)

old_header_start = '''    const editPopupPortal = cardOpen && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(15,23,32,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(ev) => { if (ev.target === ev.currentTarget) requestClosePopup(); }}>
          <div style={{ width: "92vw", maxWidth: 520, maxHeight: "88vh", background: t.card, borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,0.38)", display: "flex", flexDirection: "column", animation: "modalPopIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>'''
assert s.count(old_header_start) == 1
new_header_start = '''    const editPopupPortal = cardOpen && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(15,23,32,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(ev) => { if (ev.target === ev.currentTarget) requestClosePopup(); }}>
          <div style={{ width: "92vw", maxWidth: 520, maxHeight: "88vh", background: t.card, borderRadius: 20, boxShadow: "0 24px 70px rgba(0,0,0,0.38)", display: "flex", flexDirection: "column", animation: "modalPopIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
            {/* UPDATE (permintaan user - "untuk ID DSE pindahkan diatas
                periode status"): dipindah dari dalam tab "Informasi DSE"
                ke PALING ATAS popup (sebelum badge Periode Status & tab
                kategori) - identitas DSE (IM3/3ID) jadi SELALU keliatan
                apapun tab yg lagi aktif (Informasi/SP/Voucher/Saldo),
                ga ilang2 pas user pindah tab. 3ID cuma dirender kalau DSE
                itu emang punya kodenya (ga semua DSE dual-ID). */}
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${t.line}`, flexShrink: 0 }}>'''
assert s.count(new_header_start) == 0
s = s.replace(old_header_start, new_header_start, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)
print("OK move_id_dse_above_periode")
