p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 1) Urutan level SDM: Depo di ATAS District (MC) - sesuai hirarki asli
# (Partner > Region > Area > Depo > District/MC), permintaan user
# "depo itu diatas level mc".
do(
    'const SDM_LEVEL_ORDER = ["partner", "region", "area", "mc", "depo"];',
    'const SDM_LEVEL_ORDER = ["partner", "region", "area", "depo", "mc"];',
    1, "SDM_LEVEL_ORDER: depo di atas mc",
)

# 2) Label section District (MC) + tiap kartu District-nya skrg ikut
# menampilkan nama Depo asalnya (permintaan user - "pada level mc dia
# akan menampilkan itu mc dari depo mana").
do(
    '    if (lvl === "mc") return mcCodesInDepo.length ? `Semua District (${mcCodesInDepo.length})` : "—";',
    '    if (lvl === "mc") {\n      if (!mcCodesInDepo.length) return "—";\n      const depoNm = depos.find((dp) => dp.id === selectedDepoId)?.depo_name || "—";\n      return `Semua District (${mcCodesInDepo.length}) — Depo ${depoNm}`;\n    }',
    1, "sdmLevelEntityLabel(mc) -> tampilkan nama Depo asal",
)
do(
    'table = <MultiEntityItemTable items={items} entities={mcCodesInDepo.map((mc) => ({ key: mc, label: mc }))} valuesByEntity={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(lvl)} draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} emptyLabel="Depo ini belum punya District." t={t} />;',
    'table = <MultiEntityItemTable items={items} entities={mcCodesInDepo.map((mc) => ({ key: mc, label: mc, sublabel: depos.find((dp) => dp.id === selectedDepoId)?.depo_name }))} valuesByEntity={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(lvl)} draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} emptyLabel="Depo ini belum punya District." t={t} />;',
    1, "entities mc -> sertakan sublabel nama Depo",
)

# 3) MultiEntityItemTable: render sublabel (nama Depo) kecil di bawah
# label entitas kalau ada, supaya tiap kartu District jelas dari Depo
# mana asalnya.
old_card_label = '''                <div style={{ fontSize: 10, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={en.label}>{en.label}</div>'''
new_card_label = '''                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={en.label}>{en.label}</div>
                  {en.sublabel && <div style={{ fontSize: 9, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={en.sublabel}>Depo: {en.sublabel}</div>}
                </div>'''
do(old_card_label, new_card_label, 1, "MultiEntityItemTable: render sublabel Depo di tiap kartu District")

open(p, "w").write(S["s"])
print("ORDERFIX_OK")
