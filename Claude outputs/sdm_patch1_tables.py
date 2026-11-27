p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 1) Import GripVertical (drag handle icon) - permintaan user: "untuk
#    sdm saja kita akan buat konsepnya jadi drag and drop semuanya".
old_import = '''import { ArrowDownLeft, ArrowLeft, ArrowRight, Building2, ChevronDown, Coins, FileText, Globe2, Info, MapPin, Megaphone, Save, Settings2, Users } from "lucide-react";'''
new_import = '''import { ArrowDownLeft, ArrowLeft, ArrowRight, Building2, ChevronDown, Coins, FileText, Globe2, GripVertical, Info, MapPin, Megaphone, Save, Settings2, Users } from "lucide-react";'''
do(old_import, new_import, 1, "import GripVertical")

# 2) ItemTable - ganti dropdown pindah-level jadi DRAG AND DROP (baris
#    bisa ditarik/drag, drop-nya ditangani oleh kontainer section level
#    di luar tabel ini). Dipakai utk level Partner (satu-satunya level
#    yg tetap 1 entitas, tidak perlu tabel multi-kolom).
old_itemtable = '''function ItemTable({ items, values, onChange, readOnly, showKategori, showQty, canChangeLevel, levelOfItem, onChangeLevel, movingLevelId, t }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: showQty ? 480 : 400 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            <TH t={t}>Sub-Kategori</TH>
            {showQty && <TH t={t} align="right" width={90}>Qty</TH>}
            <TH t={t} align="right" width={190}>Total (Rp)</TH>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="v2row" style={{ borderBottom: `1px solid ${t.lineH}` }}>
              <td style={{ padding: "9px 8px", verticalAlign: "middle" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
                  {canChangeLevel && (
                    <select
                      value={levelOfItem(it.id)}
                      disabled={movingLevelId === it.id}
                      onChange={(e) => onChangeLevel(it.id, e.target.value)}
                      title="Pindahkan level item ini"
                      style={{ fontSize: 10, fontWeight: 700, color: t.blue, background: t.blueBg, border: `1px solid ${t.blueBd}`, borderRadius: 999, padding: "2px 8px", cursor: movingLevelId === it.id ? "wait" : "pointer", opacity: movingLevelId === it.id ? 0.6 : 1 }}
                    >
                      {SDM_LEVEL_ORDER.map((lvl) => <option key={lvl} value={lvl}>{SDM_LEVEL_LABEL[lvl]}</option>)}
                    </select>
                  )}
                </div>
                {showKategori && <div style={{ fontSize: 11, color: t.lo, marginTop: 2 }}>{it.kategori}</div>}
                {it.info && <div style={{ fontSize: 11, color: t.mid, marginTop: 3, display: "flex", alignItems: "flex-start", gap: 5 }}><Info size={11} style={{ flexShrink: 0, marginTop: 2 }} />{it.info}</div>}
              </td>
              {showQty && (
                <td style={{ padding: "9px 8px", width: 90, verticalAlign: "middle" }}>
                  <NumInput numericValue={values[it.id]?.qty} readOnly={readOnly} onChange={(v) => onChange(it.id, "qty", v)} />
                </td>
              )}
              <td style={{ padding: "9px 8px", width: 190, verticalAlign: "middle" }}>
                <NumInput numericValue={values[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(it.id, "total", v)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}'''
new_itemtable = '''function ItemTable({ items, values, onChange, readOnly, showKategori, showQty, draggable, onItemDragStart, movingLevelId, t }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: showQty ? 480 : 400 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            <TH t={t}>Sub-Kategori</TH>
            {showQty && <TH t={t} align="right" width={90}>Qty</TH>}
            <TH t={t} align="right" width={190}>Total (Rp)</TH>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="v2row"
              draggable={!!draggable && movingLevelId !== it.id}
              onDragStart={draggable ? (e) => onItemDragStart(e, it.id) : undefined}
              style={{ borderBottom: `1px solid ${t.lineH}`, cursor: draggable ? (movingLevelId === it.id ? "wait" : "grab") : "default", opacity: movingLevelId === it.id ? 0.55 : 1 }}
            >
              <td style={{ padding: "9px 8px", verticalAlign: "middle" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {draggable && <GripVertical size={14} color={t.lo} style={{ flexShrink: 0 }} />}
                  <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
                </div>
                {showKategori && <div style={{ fontSize: 11, color: t.lo, marginTop: 2 }}>{it.kategori}</div>}
                {it.info && <div style={{ fontSize: 11, color: t.mid, marginTop: 3, display: "flex", alignItems: "flex-start", gap: 5 }}><Info size={11} style={{ flexShrink: 0, marginTop: 2 }} />{it.info}</div>}
              </td>
              {showQty && (
                <td style={{ padding: "9px 8px", width: 90, verticalAlign: "middle" }}>
                  <NumInput numericValue={values[it.id]?.qty} readOnly={readOnly} onChange={(v) => onChange(it.id, "qty", v)} />
                </td>
              )}
              <td style={{ padding: "9px 8px", width: 190, verticalAlign: "middle" }}>
                <NumInput numericValue={values[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(it.id, "total", v)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}'''
do(old_itemtable, new_itemtable, 1, "ItemTable drag-and-drop")

# 3) McMultiItemTable -> MultiEntityItemTable (generik, dipakai utk
#    SEMUA level yg butuh breakdown banyak entitas: MC/District,
#    Depo, Area, Region - permintaan user: "sama seperti level mc
#    sekarang ... gitu juga untuk business manager jika dia di level
#    area, harus masukkan area-area yang ada di partner tersebut").
#    `mcs` jadi `entities` ({key,label}), `valuesByMc` jadi
#    `valuesByEntity` (keyed by entity.key), level-picker dropdown
#    diganti drag and drop spt ItemTable di atas.
old_mcmulti_sig = '''function McMultiItemTable({ items, mcs, valuesByMc, onChange, readOnly, canChangeLevel, levelOfItem, onChangeLevel, movingLevelId, t }) {
  const thStyle = { padding: "7px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.lo };
  const groupBorder = `2px solid ${t.line}`;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 260 + mcs.length * (230 + MC_GROUP_GAP) }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ padding: "7px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.lo, verticalAlign: "bottom" }}>Sub-Kategori</th>
            {mcs.map((m, i) => (
              <th key={m.mc} colSpan={2} style={{ padding: `7px 10px 2px ${i === 0 ? 10 : 10 + MC_GROUP_GAP}px`, textAlign: "center", fontSize: 11, fontWeight: 800, color: t.hi, borderLeft: groupBorder, borderBottom: `1px solid ${t.lineH}` }}>{m.mc}</th>
            ))}
          </tr>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            {mcs.map((m, i) => (
              <Fragment key={m.mc}>
                <th style={{ ...thStyle, width: 80, borderLeft: groupBorder, paddingLeft: i === 0 ? 10 : 10 + MC_GROUP_GAP }}>Qty</th>
                <th style={{ ...thStyle, width: 150 }}>Total (Rp)</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="v2row" style={{ borderBottom: `1px solid ${t.lineH}` }}>
              <td style={{ padding: "9px 8px", verticalAlign: "middle" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
                  {canChangeLevel && (
                    <select
                      value={levelOfItem(it.id)}
                      disabled={movingLevelId === it.id}
                      onChange={(e) => onChangeLevel(it.id, e.target.value)}
                      title="Pindahkan level item ini"
                      style={{ fontSize: 10, fontWeight: 700, color: t.blue, background: t.blueBg, border: `1px solid ${t.blueBd}`, borderRadius: 999, padding: "2px 8px", cursor: movingLevelId === it.id ? "wait" : "pointer", opacity: movingLevelId === it.id ? 0.6 : 1 }}
                    >
                      {SDM_LEVEL_ORDER.map((lvl) => <option key={lvl} value={lvl}>{SDM_LEVEL_LABEL[lvl]}</option>)}
                    </select>
                  )}
                </div>
              </td>
              {mcs.map((m, i) => (
                <Fragment key={m.mc}>
                  <td style={{ padding: `9px 6px 9px ${i === 0 ? 10 : 10 + MC_GROUP_GAP}px`, width: 80, verticalAlign: "middle", borderLeft: `1px solid ${t.lineH}` }}>
                    <NumInput numericValue={valuesByMc[m.mc]?.[it.id]?.qty} readOnly={readOnly} onChange={(v) => onChange(m.mc, it.id, "qty", v)} />
                  </td>
                  <td style={{ padding: "9px 10px", width: 150, verticalAlign: "middle" }}>
                    <NumInput numericValue={valuesByMc[m.mc]?.[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(m.mc, it.id, "total", v)} />
                  </td>
                </Fragment>
              ))}
            </tr>
          ))}
          {mcs.length === 0 && (
            <tr><td colSpan={1} style={{ padding: "14px 8px", fontSize: 12, color: t.lo }}>Belum ada District (MC) di Depo ini.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}'''
new_mcmulti_sig = '''function MultiEntityItemTable({ items, entities, valuesByEntity, onChange, readOnly, draggable, onItemDragStart, movingLevelId, emptyLabel, t }) {
  const thStyle = { padding: "7px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.lo };
  const groupBorder = `2px solid ${t.line}`;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 260 + entities.length * (230 + MC_GROUP_GAP) }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ padding: "7px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.lo, verticalAlign: "bottom" }}>Sub-Kategori</th>
            {entities.map((en, i) => (
              <th key={en.key} colSpan={2} style={{ padding: `7px 10px 2px ${i === 0 ? 10 : 10 + MC_GROUP_GAP}px`, textAlign: "center", fontSize: 11, fontWeight: 800, color: t.hi, borderLeft: groupBorder, borderBottom: `1px solid ${t.lineH}` }}>{en.label}</th>
            ))}
          </tr>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            {entities.map((en, i) => (
              <Fragment key={en.key}>
                <th style={{ ...thStyle, width: 80, borderLeft: groupBorder, paddingLeft: i === 0 ? 10 : 10 + MC_GROUP_GAP }}>Qty</th>
                <th style={{ ...thStyle, width: 150 }}>Total (Rp)</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="v2row"
              draggable={!!draggable && movingLevelId !== it.id}
              onDragStart={draggable ? (e) => onItemDragStart(e, it.id) : undefined}
              style={{ borderBottom: `1px solid ${t.lineH}`, cursor: draggable ? (movingLevelId === it.id ? "wait" : "grab") : "default", opacity: movingLevelId === it.id ? 0.55 : 1 }}
            >
              <td style={{ padding: "9px 8px", verticalAlign: "middle" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {draggable && <GripVertical size={14} color={t.lo} style={{ flexShrink: 0 }} />}
                  <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
                </div>
              </td>
              {entities.map((en, i) => (
                <Fragment key={en.key}>
                  <td style={{ padding: `9px 6px 9px ${i === 0 ? 10 : 10 + MC_GROUP_GAP}px`, width: 80, verticalAlign: "middle", borderLeft: `1px solid ${t.lineH}` }}>
                    <NumInput numericValue={valuesByEntity[en.key]?.[it.id]?.qty} readOnly={readOnly} onChange={(v) => onChange(en.key, it.id, "qty", v)} />
                  </td>
                  <td style={{ padding: "9px 10px", width: 150, verticalAlign: "middle" }}>
                    <NumInput numericValue={valuesByEntity[en.key]?.[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(en.key, it.id, "total", v)} />
                  </td>
                </Fragment>
              ))}
            </tr>
          ))}
          {entities.length === 0 && (
            <tr><td colSpan={1} style={{ padding: "14px 8px", fontSize: 12, color: t.lo }}>{emptyLabel || "Belum ada entitas."}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}'''
do(old_mcmulti_sig, new_mcmulti_sig, 1, "McMultiItemTable -> MultiEntityItemTable")

open(p, "w").write(S["s"])
print("PATCH1_OK")
