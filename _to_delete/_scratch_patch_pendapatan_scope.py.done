p = "app/dashboard/components/PNL_FormPendapatanV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 1) Import icon tambahan utk bar Region/Area.
old_import_icons = '''import { ArrowUpRight, Banknote, Gauge, Info, Lock, Save, ShieldCheck } from "lucide-react";'''
new_import_icons = '''import { ArrowUpRight, Banknote, ChevronDown, Gauge, Globe2, Info, Lock, MapPin, Save, ShieldCheck } from "lucide-react";'''
do(old_import_icons, new_import_icons, 1, "import icons")

# 2) Signature - terima props Region/Area (permintaan user: "nanti untuk
#    pendapatan dia akan ada pemilihan region dan area di dalam form
#    pendapatan (area level) buat dengan ui yang sangat bagus juga"),
#    krn Region & Area sudah dihapus total dari chrome atas halaman.
old_sig = '''export default function PNL_FormPendapatanV2({ theme, profile, activeContext, canEditPendapatan, setIsFormDirty, readOnly, masterData }) {'''
new_sig = '''export default function PNL_FormPendapatanV2({ theme, profile, activeContext, canEditPendapatan, setIsFormDirty, readOnly, masterData, showRegionPicker, regionLabel, activeRegion, regionOptions, regionLocked, onRegionChange, areaOptions, onAreaChange }) {'''
do(old_sig, new_sig, 1, "component signature")

# 3) Bar Region + Area (Area Level) - diselipkan tepat di bawah banner
#    "Form Pendapatan (Area Level)", gaya pill konsisten dgn Form
#    Pengeluaran (StepHeroDepo) biar senada antar 2 form V2. Region
#    cuma tampil utk role yg memang bisa lintas Region (SPM/IOH) - kalau
#    partner biasa (Region-nya pada dasarnya tetap/tunggal), yg tampil
#    cukup Area.
old_sechero = '''          {/* ── Form Pendapatan (Area Level) — diisi Partner ── */}
          <SecHero icon={Banknote} title="Form Pendapatan (Area Level)" t={t}>
            {!canEditIncome && <LockNote t={t}>Hanya lihat</LockNote>}
          </SecHero>'''
new_sechero = '''          {/* ── Form Pendapatan (Area Level) — diisi Partner ── */}
          <SecHero icon={Banknote} title="Form Pendapatan (Area Level)" t={t}>
            {!canEditIncome && <LockNote t={t}>Hanya lihat</LockNote>}
          </SecHero>
          {/* BARU (permintaan user - "nanti untuk pendapatan dia akan
              ada pemilihan region dan area di dalam form pendapatan
              (area level) buat dengan ui yang sangat bagus juga"):
              Region (khusus role SPM/IOH yg lintas Region) & Area kini
              dipilih langsung dari sini, krn sudah hilang dari chrome
              atas halaman. */}
          {(showRegionPicker || (areaOptions && areaOptions.length > 0)) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "13px 16px", borderRadius: 12, border: `1px solid ${t.blueBd}`, background: t.blueBg, marginBottom: 16, boxShadow: t.sm }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: t.blue, textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 2 }}>Lingkup</span>
              {showRegionPicker && (
                <div style={{ position: "relative", display: "inline-flex" }}>
                  <select
                    value={activeRegion || ""}
                    disabled={!!regionLocked}
                    onChange={(e) => onRegionChange?.(e.target.value)}
                    title={regionLabel || "Region"}
                    style={{
                      appearance: "none", WebkitAppearance: "none",
                      fontSize: 11.5, fontWeight: 700, color: t.hi, background: t.card,
                      border: `1px solid ${t.line}`, borderRadius: 999, padding: "6px 28px 6px 30px",
                      cursor: regionLocked ? "default" : "pointer", fontFamily: "inherit", boxShadow: t.sm,
                      opacity: regionLocked ? 0.65 : 1,
                    }}
                  >
                    {(regionOptions || []).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <Globe2 size={12} color={t.blue} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  {!regionLocked && <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />}
                </div>
              )}
              {areaOptions && areaOptions.length > 0 && (
                <div style={{ position: "relative", display: "inline-flex" }}>
                  <select
                    value={activeContext?.branch || ""}
                    onChange={(e) => onAreaChange?.(e.target.value)}
                    title="Area"
                    style={{
                      appearance: "none", WebkitAppearance: "none",
                      fontSize: 11.5, fontWeight: 700, color: t.hi, background: t.card,
                      border: `1px solid ${t.line}`, borderRadius: 999, padding: "6px 28px 6px 30px",
                      cursor: "pointer", fontFamily: "inherit", boxShadow: t.sm,
                    }}
                  >
                    {!activeContext?.branch && <option value="" disabled>Pilih Area</option>}
                    {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <MapPin size={12} color={t.blue} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none" }} />
                </div>
              )}
            </div>
          )}'''
do(old_sechero, new_sechero, 1, "SecHero + scope bar")

open(p, "w").write(S["s"])
print("PATCH_PENDAPATAN_OK")
