p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 1) Signature - terima areaOptions/onAreaChange (Area kini beneran bisa
#    diganti dari sini, krn sudah hilang dari chrome atas - permintaan
#    user: "di bagian atas tidak perlu lagi ada opsi pilih area") dan
#    periodControl (date picker month/year yg dipindah ke sini dari atas
#    - permintaan user: "pilihan periode nya pindahkan ke kanan form
#    pengeluaran ... masuk ke dalam container").
old_sig = '''export default function PNL_FormPengeluaranV2({ theme, profile, activeContext, canEdit, setIsFormDirty, readOnly }) {'''
new_sig = '''export default function PNL_FormPengeluaranV2({ theme, profile, activeContext, canEdit, setIsFormDirty, readOnly, areaOptions, onAreaChange, periodControl }) {'''
do(old_sig, new_sig, 1, "component signature")

# 2) StepHeroDepo - area kini bisa jadi dropdown fungsional (bukan cuma
#    pill info) kalau dioper areaOptions+onAreaChange.
old_herosig = '''function StepHeroDepo({ icon: Icon, eyebrow, title, depoName, depoControl, region, area, mcs, totalLabel, totalValue, t }) {'''
new_herosig = '''function StepHeroDepo({ icon: Icon, eyebrow, title, depoName, depoControl, region, area, areaOptions, onAreaChange, mcs, totalLabel, totalValue, t }) {'''
do(old_herosig, new_herosig, 1, "StepHeroDepo signature")

old_area_pill = '''              {area && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, background: t.card, border: `1px solid ${t.line}`, borderRadius: 999, padding: "5px 11px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <MapPin size={11} color={t.blue} /> {area}
                </span>
              )}'''
new_area_pill = '''              {/* FIX (permintaan user - "di bagian atas tidak perlu lagi
                  ada opsi pilih area" + implikasinya: Area harus bisa
                  dipilih dari SINI sekarang): kalau dioper areaOptions +
                  onAreaChange, pill Area jadi dropdown fungsional - kalau
                  tidak (mis. dipanggil tanpa prop itu), tetap tampil
                  sbg pill info polos spt semula. */}
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
              ) : null}'''
do(old_area_pill, new_area_pill, 1, "StepHeroDepo area pill -> dropdown")

# 3) Step1 (OPEX & Cost of Money) - oper areaOptions/onAreaChange ke StepHeroDepo.
old_step1_call = '''      region={currentRegion} area={contextBranch}
      mcs={mcCodesInDepo}
      totalLabel="Total OPEX + Cost of Money"'''
new_step1_call = '''      region={currentRegion} area={contextBranch}
      areaOptions={areaOptions} onAreaChange={editable ? onAreaChange : undefined}
      mcs={mcCodesInDepo}
      totalLabel="Total OPEX + Cost of Money"'''
do(old_step1_call, new_step1_call, 1, "step1 StepHeroDepo call areaOptions")

open(p, "w").write(S["s"])
print("PATCH_A_OK")
