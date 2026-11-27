p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# 1) Ganti total MultiEntityItemTable: dari <table> lebar yg wajib
#    discroll horizontal (minWidth tumbuh terus seiring jumlah entitas)
#    jadi kartu per-entitas yg WRAP otomatis (flex-wrap) - TIDAK PERNAH
#    butuh scroll horizontal berapa pun banyaknya Area/Region/Depo/MC,
#    karena kartunya pindah ke baris baru, bukan nambah lebar ke samping.
old_table = '''// Jarak antar grup kolom per-MC (permintaan user - "rapikan semua
// antar mc jangan terlalu rapat"): tiap grup MC dipisahkan garis
// pembatas yg lebih tebal DAN padding ekstra di kiri-kanannya, supaya
// mata ga ketuker2 kolom Qty/Total MC yg satu dgn MC sebelahnya.
const MC_GROUP_GAP = 22;
function MultiEntityItemTable({ items, entities, valuesByEntity, onChange, readOnly, draggable, onItemDragStart, movingLevelId, emptyLabel, t }) {
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
new_table = '''// FIX (permintaan user - "kolom komponennya jangan lebar kali, dan
// kenapa ini tidak bisa discroll kiri kanan - buat dgn sangat bagus"):
// desain tabel lama (1 kolom Qty+Total per entitas, tabel makin lebar
// terus seiring jumlah Area/Region/Depo/MC) memaksa lebar tabel JAUH
// melebihi lebar layar dan bikin konten "terpotong" di kiri-kanan tanpa
// scrollbar yg berfungsi. Diganti total: tiap item SDM jadi 1 baris
// dgn judul di atas, lalu kartu kecil per-entitas yg di-WRAP otomatis
// (flex-wrap) - kartunya pindah baris sendiri kalau sudah penuh,
// BUKAN menambah lebar ke samping - jadi TIDAK PERNAH butuh scroll
// horizontal berapa pun banyaknya entitas, dan selalu rapi di lebar
// layar manapun.
function MultiEntityItemTable({ items, entities, valuesByEntity, onChange, readOnly, draggable, onItemDragStart, movingLevelId, emptyLabel, t }) {
  if (entities.length === 0) {
    return <div style={{ fontSize: 12.5, color: t.lo, padding: "10px 2px" }}>{emptyLabel || "Belum ada entitas."}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((it, idx) => (
        <div key={it.id} className="v2row"
          draggable={!!draggable && movingLevelId !== it.id}
          onDragStart={draggable ? (e) => onItemDragStart(e, it.id) : undefined}
          style={{ padding: "10px 4px 12px", borderTop: idx === 0 ? "none" : `1px solid ${t.lineH}`, cursor: draggable ? (movingLevelId === it.id ? "wait" : "grab") : "default", opacity: movingLevelId === it.id ? 0.55 : 1 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {draggable && <GripVertical size={14} color={t.lo} style={{ flexShrink: 0 }} />}
            <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {entities.map((en) => (
              <div key={en.key} style={{ flex: "1 1 200px", minWidth: 170, maxWidth: 260, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.lineH}`, background: t.bg2 || t.panel || "transparent" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={en.label}>{en.label}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: "0 0 64px" }}>
                    <div style={{ fontSize: 9, color: t.lo, marginBottom: 2 }}>Qty</div>
                    <NumInput numericValue={valuesByEntity[en.key]?.[it.id]?.qty} readOnly={readOnly} onChange={(v) => onChange(en.key, it.id, "qty", v)} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: t.lo, marginBottom: 2 }}>Total (Rp)</div>
                    <NumInput numericValue={valuesByEntity[en.key]?.[it.id]?.total} readOnly={readOnly} onChange={(v) => onChange(en.key, it.id, "total", v)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}'''
do(old_table, new_table, 1, "MultiEntityItemTable -> flex-wrap cards (no horizontal scroll)")

# 2) Buang breakout viewport (calc(50% - 50vw)/100vw) yg SALAH (ga
#    memperhitungkan sidebar - bikin konten malah kepotong/kegeser tanpa
#    scrollbar). Diganti balik ke lebar normal mengikuti container
#    halaman (920px) - lebih dari cukup skrg krn tabel sudah tidak lagi
#    melebar sesuai jumlah entitas (lihat fix di atas).
old_breakout = '''                // FIX (permintaan user - "lebarkan saja section ini agar lebih
                // luas"): khusus Langkah 2 (SDM) di-"breakout" dari batas lebar
                // halaman (maxWidth bersama di page.jsx), supaya 5 section
                // level-nya dapat ruang lebih lega - TANPA mengubah lebar
                // halaman utk tab Summary/Pendapatan/Pengeluaran lainnya.
                <div style={{ marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)", width: "100vw", display: "flex", justifyContent: "center" }}>
                <div style={{ width: "100%", maxWidth: 1360, padding: "0 20px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14 }}>'''
new_breakout = '''                // FIX (permintaan user - "kolom komponennya jangan lebar kali"):
                // breakout lebar pakai satuan viewport (vw) sebelumnya SALAH -
                // ga memperhitungkan sidebar di kiri, jadi kontennya malah
                // kegeser/kepotong tanpa scrollbar yg berfungsi. Dibalik ke
                // lebar normal mengikuti container halaman - sudah cukup
                // lega skrg krn kartu per-entitas di bawah sudah WRAP
                // otomatis, tidak lagi melebar terus sesuai jumlah entitas.
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>'''
do(old_breakout, new_breakout, 1, "remove vw breakout -> normal width flow")

old_breakout_close = '''                  {SDM_LEVEL_ORDER.map((lvl) => renderSdmLevelSection(lvl))}
                  <SubtotalBanner label="Total SDM" value={sdmSummary.totalSdm} />
                </div>
                </div>
              )}
            </>
          )}

          {step === 3 && ('''
new_breakout_close = '''                  {SDM_LEVEL_ORDER.map((lvl) => renderSdmLevelSection(lvl))}
                  <SubtotalBanner label="Total SDM" value={sdmSummary.totalSdm} />
                </div>
              )}
            </>
          )}

          {step === 3 && ('''
do(old_breakout_close, new_breakout_close, 1, "remove extra closing div from breakout wrapper")

# 3) Fragment tidak lagi dipakai setelah MultiEntityItemTable diganti -
#    buang dari import biar ga kena no-unused-vars.
do(
    'import { useEffect, useMemo, useState, useCallback, useRef, Fragment } from "react";',
    'import { useEffect, useMemo, useState, useCallback, useRef } from "react";',
    1, "remove unused Fragment import",
)

open(p, "w").write(S["s"])
print("FIXWIDTH_OK")
