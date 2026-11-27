path = "PNL_FormPengeluaranV2.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new, n)

# ── 1. Import Fragment dari react (dipakai di McMultiItemTable utk grup kolom Qty+Total per MC) ──
do(
'import { useEffect, useMemo, useState, useCallback } from "react";',
'import { useEffect, useMemo, useState, useCallback, Fragment } from "react";',
    label="import Fragment",
)

# ── 2. McMultiItemTable: tambahkan kolom Qty di samping Total (Rp) per MC
# (permintaan user - "tidak cuma amount namun ada qty nya per komponen
# dan jelas amount ini totalnya, dan qtynya") - header 2 baris: baris 1
# nama MC (colSpan 2), baris 2 label "Qty" / "Total (Rp)" per MC. TH
# shared component tidak forward rowSpan/colSpan, jadi header ditulis
# manual (th polos) biar presisi, style tetap konsisten dgn TH.
do(
"""function McMultiItemTable({ items, mcs, valuesByMc, onChange, readOnly, t }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 260 + mcs.length * 140 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            <TH t={t}>Sub-Kategori</TH>
            {mcs.map((m) => <TH key={m.mc} t={t} align="right" width={140}>{m.mc}</TH>)}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="v2row" style={{ borderBottom: `1px solid ${t.lineH}` }}>
              <td style={{ padding: "9px 8px", verticalAlign: "middle" }}>
                <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
              </td>
              {mcs.map((m) => (
                <td key={m.mc} style={{ padding: "9px 8px", width: 140, verticalAlign: "middle" }}>
                  <NumInput numericValue={valuesByMc[m.mc]?.[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(m.mc, it.id, "total", v)} />
                </td>
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
}""",
"""function McMultiItemTable({ items, mcs, valuesByMc, onChange, readOnly, t }) {
  const thStyle = { padding: "7px 8px", textAlign: "right", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.lo };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 260 + mcs.length * 230 }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ padding: "7px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: t.lo, verticalAlign: "bottom" }}>Sub-Kategori</th>
            {mcs.map((m) => (
              <th key={m.mc} colSpan={2} style={{ padding: "7px 8px 2px", textAlign: "center", fontSize: 11, fontWeight: 800, color: t.hi, borderLeft: `1px solid ${t.line}`, borderBottom: `1px solid ${t.lineH}` }}>{m.mc}</th>
            ))}
          </tr>
          <tr style={{ borderBottom: `1px solid ${t.line}` }}>
            {mcs.map((m) => (
              <Fragment key={m.mc}>
                <th style={{ ...thStyle, width: 80, borderLeft: `1px solid ${t.line}` }}>Qty</th>
                <th style={{ ...thStyle, width: 150 }}>Total (Rp)</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="v2row" style={{ borderBottom: `1px solid ${t.lineH}` }}>
              <td style={{ padding: "9px 8px", verticalAlign: "middle" }}>
                <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
              </td>
              {mcs.map((m) => (
                <Fragment key={m.mc}>
                  <td style={{ padding: "9px 4px", width: 80, verticalAlign: "middle", borderLeft: `1px solid ${t.lineH}` }}>
                    <NumInput numericValue={valuesByMc[m.mc]?.[it.id]?.qty} readOnly={readOnly} onChange={(v) => onChange(m.mc, it.id, "qty", v)} />
                  </td>
                  <td style={{ padding: "9px 8px", width: 150, verticalAlign: "middle" }}>
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
}""",
    label="McMultiItemTable qty+total columns",
)

with open(path, "w", encoding="utf-8") as f:
    f.write(src)

print("OK: patches applied")
