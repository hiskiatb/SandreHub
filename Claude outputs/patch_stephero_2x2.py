p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 1) StepHeroDepo - kontrol bawah (Depo/Region/Area/District) jadi grid
#    2x2 yg rapi (permintaan user): kolom 1 = Region (baris 1) + Area
#    (baris 2), kolom 2 = Depo+tombol Kelola icon-only (baris 1) +
#    District (baris 2). Badge "X District" terpisah dihapus - jumlahnya
#    kini ikut di label "District (n)".
old_control_block = '''          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 8 }}>
              {depoControl || (
                <>
                  <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em" }}>Depo</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: t.hi, textTransform: "uppercase" }}>{depoName || "—"}</span>
                </>
              )}
              {/* BARU (permintaan user - "disini tampilkan juga Region
                  dan juga area nya, jadi pemilihan semua ada disini"):
                  konteks Region & Area (ikut filter Area aktif di atas
                  halaman, bukan dipilih di sini) ditampilkan sbg pill
                  info di baris kontrol yg sama - supaya semua konteks yg
                  relevan (Depo + Region + Area + jumlah District) ada
                  dalam 1 pandangan tanpa pindah-pindah lihat. */}
              {region && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, background: t.card, border: `1px solid ${t.line}`, borderRadius: 999, padding: "5px 11px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Globe2 size={11} color={t.blue} /> {region}
                </span>
              )}
              {areaOptions && areaOptions.length > 0 && onAreaChange ? (
                <div style={{ position: "relative", display: "inline-flex" }}>
                  <select
                    value={area || ""}
                    onChange={(e) => onAreaChange(e.target.value)}
                    title="Pilih Area"
                    style={{
                      appearance: "none", WebkitAppearance: "none",
                      fontSize: 10.5, fontWeight: 700, color: t.mid, background: t.card,
                      border: `1px solid ${t.line}`, borderRadius: 999, padding: "5px 26px 5px 28px",
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <MapPin size={11} color={t.blue} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  <ChevronDown size={11} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
                </div>
              ) : area ? (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, background: t.card, border: `1px solid ${t.line}`, borderRadius: 999, padding: "5px 11px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <MapPin size={11} color={t.blue} /> {area}
                </span>
              ) : null}
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", background: t.blue, borderRadius: 999, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <MapPin size={10.5} /> {mcs.length} District
              </span>
            </div>
            {mcs.length === 0 ? (
              <div style={{ fontSize: 11.5, color: t.lo, paddingLeft: 2 }}>Belum ada District di Depo ini.</div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0, marginTop: 6, whiteSpace: "nowrap" }}>District</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 112, overflowY: "auto", paddingRight: 2 }}>
                  {mcs.map((m) => (
                    <span key={m} style={{ fontSize: 11, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.line}`, borderRadius: 999, padding: "5px 12px", boxShadow: t.sm }}>{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>'''

new_control_block = '''          {/* FIX (permintaan user - "buat menjadi 2 x 2 di kolom 1 itu
              ada region dan area, di kolom 2 ada depo untuk tombol
              kelolanya itu icon only saja, dan dibawahnya adalah
              districtnya"): grid 2x2 - kolom 1 = Region (baris 1) +
              Area (baris 2), kolom 2 = Depo + tombol Kelola icon-only
              (baris 1) + District (baris 2). auto-fit supaya di layar
              sempit otomatis tumpuk jadi 1 kolom tanpa berantakan. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "12px 16px" }}>
            {/* Kolom 1 / Baris 1 — Region (info, tetap/tunggal per akun partner) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>Region</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.inputBd}`, borderRadius: 8, padding: "7px 12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{region || "—"}</span>
            </div>

            {/* Kolom 2 / Baris 1 — Depo + tombol Kelola Depo (icon only) */}
            <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
              {depoControl || (
                <>
                  <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 8 }}>Depo</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: t.hi, textTransform: "uppercase" }}>{depoName || "—"}</span>
                </>
              )}
            </div>

            {/* Kolom 1 / Baris 2 — Area (dropdown fungsional) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>Area</span>
              {areaOptions && areaOptions.length > 0 && onAreaChange ? (
                <div style={{ position: "relative", display: "inline-flex", flex: 1, minWidth: 0 }}>
                  <select
                    value={area || ""}
                    onChange={(e) => onAreaChange(e.target.value)}
                    title="Pilih Area"
                    style={{ appearance: "none", WebkitAppearance: "none", width: "100%", fontSize: 12.5, fontWeight: 700, color: t.hi, background: t.inputBg, border: `1px solid ${t.inputBd}`, borderRadius: 8, padding: "7px 28px 7px 10px", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <ChevronDown size={13} style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
                </div>
              ) : (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.inputBd}`, borderRadius: 8, padding: "7px 12px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{area || "—"}</span>
              )}
            </div>

            {/* Kolom 2 / Baris 2 — District */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0, marginTop: 7, whiteSpace: "nowrap" }}>District{mcs.length > 0 ? ` (${mcs.length})` : ""}</span>
              {mcs.length === 0 ? (
                <div style={{ fontSize: 11.5, color: t.lo, marginTop: 5 }}>Belum ada District di Depo ini.</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 84, overflowY: "auto", paddingRight: 2 }}>
                  {mcs.map((m) => (
                    <span key={m} style={{ fontSize: 11, fontWeight: 700, color: t.hi, background: t.card, border: `1px solid ${t.line}`, borderRadius: 999, padding: "5px 12px", boxShadow: t.sm }}>{m}</span>
                  ))}
                </div>
              )}
            </div>
          </div>'''
do(old_control_block, new_control_block, 1, "StepHeroDepo 2x2 grid")

# 2) Tombol "Kelola Depo" di pemanggilan Langkah 1 - jadi icon only
#    (permintaan user: "untuk tombol kelolanya itu icon only saja").
old_btn = '''                    extra={editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" style={{ padding: "6px 10px", whiteSpace: "nowrap" }}><Settings2 size={12} /> Kelola Depo</button>} />'''
new_btn = '''                    extra={editable && <button onClick={() => setShowDepoManager((s) => !s)} className="v2btn-g" title="Kelola Depo" style={{ padding: "7px 9px", width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Settings2 size={13} /></button>} />'''
do(old_btn, new_btn, 1, "Kelola Depo icon-only button")

open(p, "w").write(S["s"])
print("PATCH_2X2_OK")
