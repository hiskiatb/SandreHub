p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

# ── 0) Import: tambah MoreVertical (tombol opsi ubah level) + motion/
# AnimatePresence (animasi perpindahan item antar section) - framer-
# motion/"motion" sudah jadi dependency project (dipakai di page.jsx).
do(
    'import { ArrowDownLeft, ArrowLeft, ArrowRight, Building2, ChevronDown, Coins, FileText, Globe2, GripVertical, Info, MapPin, Megaphone, Save, Settings2, Users } from "lucide-react";',
    'import { ArrowDownLeft, ArrowLeft, ArrowRight, Building2, ChevronDown, Coins, FileText, Globe2, GripVertical, Info, MapPin, Megaphone, MoreVertical, Save, Settings2, Users } from "lucide-react";\nimport { motion, AnimatePresence } from "framer-motion";',
    1, "import MoreVertical + framer-motion",
)

# ── 1) Komponen tombol opsi "Pindahkan Level" - FALLBACK dari drag &
# drop (permintaan user - "saat didrag ke atas section dia tidak naik
# sepertinya harus ada tombol opsi untuk ubah level per sub kategori
# namun tetap ui nya sangat bagus"). Drag-and-drop TETAP ada (kadang
# ga reliable di webview), tombol kecil ini jadi cara yg SELALU
# berhasil - popover ringkas daftar 5 level, klik langsung pindah.
sdm_menu_component = '''
// BARU (permintaan user - "harus ada tombol opsi untuk ubah level per
// sub kategori"): fallback drag-and-drop yg kadang ga ke-drag di
// webview - tombol titik tiga kecil di tiap item, klik buka daftar 5
// level, klik salah satu langsung pindah (pakai handler yg sama persis
// dgn drag-and-drop, moveSdmItemLevel).
function SdmLevelMenuButton({ currentLevel, onPick, t }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Pindahkan level"
        style={{ width: 22, height: 22, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: `1px solid ${open ? t.blueBd : "transparent"}`, background: open ? t.blueBg : "transparent", color: t.mid, cursor: "pointer" }}
      >
        <MoreVertical size={13} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 400 }} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 401, background: t.card, border: `1px solid ${t.line}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.20)", minWidth: 190, padding: 5 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: t.lo, textTransform: "uppercase", letterSpacing: 0.4, padding: "4px 7px 6px" }}>Pindahkan ke level</div>
            {SDM_LEVEL_ORDER.map((lvl) => {
              const isCurrent = lvl === currentLevel;
              return (
                <button
                  key={lvl}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => { onPick(lvl); setOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 8px", fontSize: 12.5, fontWeight: isCurrent ? 700 : 500, color: isCurrent ? t.blue : t.hi, background: "transparent", border: "none", borderRadius: 6, cursor: isCurrent ? "default" : "pointer" }}
                  onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = t.hoverBg || t.blueBg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {SDM_LEVEL_LABEL[lvl]}{isCurrent ? " • sekarang" : ""}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
'''
do(
    "// Tabel item 1 langkah - kolom: Sub-Kategori | (Qty opsional) | Total",
    sdm_menu_component.strip("\n") + "\n\n// Tabel item 1 langkah - kolom: Sub-Kategori | (Qty opsional) | Total",
    1, "sisipkan komponen SdmLevelMenuButton sebelum ItemTable",
)

# ── 2) ItemTable: tambah prop onMoveLevel/currentLevelOf (opsional),
# render SdmLevelMenuButton di sebelah grip, dan animasi
# masuk/keluar (fade+slide halus) tiap kali daftar item-nya berubah
# (pindah level) via framer-motion.
old_itemtable = '''function ItemTable({ items, values, onChange, readOnly, showKategori, showQty, draggable, onItemDragStart, movingLevelId, t }) {
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
new_itemtable = '''function ItemTable({ items, values, onChange, readOnly, showKategori, showQty, draggable, onItemDragStart, movingLevelId, onMoveLevel, levelOfItem, t }) {
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
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <motion.tr key={it.id} className="v2row"
                initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22, ease: "easeOut" }}
                draggable={!!draggable && movingLevelId !== it.id}
                onDragStart={draggable ? (e) => onItemDragStart(e, it.id) : undefined}
                style={{ borderBottom: `1px solid ${t.lineH}`, cursor: draggable ? (movingLevelId === it.id ? "wait" : "grab") : "default", opacity: movingLevelId === it.id ? 0.55 : 1 }}
              >
                <td style={{ padding: "9px 8px", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {draggable && <GripVertical size={14} color={t.lo} style={{ flexShrink: 0 }} />}
                    <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
                    {draggable && onMoveLevel && <SdmLevelMenuButton currentLevel={levelOfItem?.(it.id)} onPick={(lvl) => onMoveLevel(it.id, lvl)} t={t} />}
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
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}'''
do(old_itemtable, new_itemtable, 1, "ItemTable -> tombol level menu + animasi")

# ── 3) MultiEntityItemTable: sama - tambah tombol level menu + animasi.
old_multitable = '''function MultiEntityItemTable({ items, entities, valuesByEntity, onChange, readOnly, draggable, onItemDragStart, movingLevelId, emptyLabel, t }) {
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
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={en.label}>{en.label}</div>
                  {en.sublabel && <div style={{ fontSize: 9, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={en.sublabel}>Depo: {en.sublabel}</div>}
                </div>
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
new_multitable = '''function MultiEntityItemTable({ items, entities, valuesByEntity, onChange, readOnly, draggable, onItemDragStart, movingLevelId, onMoveLevel, levelOfItem, emptyLabel, t }) {
  if (entities.length === 0) {
    return <div style={{ fontSize: 12.5, color: t.lo, padding: "10px 2px" }}>{emptyLabel || "Belum ada entitas."}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <AnimatePresence initial={false}>
        {items.map((it, idx) => (
          <motion.div key={it.id} layout className="v2row"
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22, ease: "easeOut" }}
            draggable={!!draggable && movingLevelId !== it.id}
            onDragStart={draggable ? (e) => onItemDragStart(e, it.id) : undefined}
            style={{ padding: "10px 4px 12px", borderTop: idx === 0 ? "none" : `1px solid ${t.lineH}`, cursor: draggable ? (movingLevelId === it.id ? "wait" : "grab") : "default", opacity: movingLevelId === it.id ? 0.55 : 1 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {draggable && <GripVertical size={14} color={t.lo} style={{ flexShrink: 0 }} />}
              <div style={{ fontWeight: 700, color: t.hi, fontSize: 13 }}>{it.item}</div>
              {draggable && onMoveLevel && <SdmLevelMenuButton currentLevel={levelOfItem?.(it.id)} onPick={(lvl) => onMoveLevel(it.id, lvl)} t={t} />}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {entities.map((en) => (
                <div key={en.key} style={{ flex: "1 1 200px", minWidth: 170, maxWidth: 260, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.lineH}`, background: t.bg2 || t.panel || "transparent" }}>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={en.label}>{en.label}</div>
                    {en.sublabel && <div style={{ fontSize: 9, color: t.lo, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={en.sublabel}>Depo: {en.sublabel}</div>}
                  </div>
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
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}'''
do(old_multitable, new_multitable, 1, "MultiEntityItemTable -> tombol level menu + animasi")

# ── 4) Widen level MC: default tampilkan SEMUA MC yg ada di PARTNER
# (semua Depo), bukan cuma MC di Depo yg lagi dipilih (permintaan user
# - "khusus untuk sdm secara default dia akan menampilkan semua depo
# yang ada, sehingga mc nya semua mc yang ada di partner tersebut").
# `mcCodesInDepo` (scoped ke 1 Depo) TETAP dipakai apa adanya utk
# Marketing Cost Langkah 3/4 (tidak berubah) - mcAllValues/mcAllCtxKey
# di bawah ini KHUSUS dipakai section SDM level District, jadi aman
# di-widen tanpa pengaruh ke Langkah 3/4.
old_mc_state = '''  // BARU (permintaan user - "tampilkan semua mc, untuk mempermudah
  // pengisian oleh satu orang tanpa harus ganti ganti filternya"): item
  // SDM level District (MC) dimuat utk SEMUA District di bawah Depo yg
  // aktif sekaligus (bukan cuma `selectedMc`) - pakai tabel yg sama
  // (pnl_pengeluaran_mc_v2), cuma di-query utk banyak `mc` sekaligus.
  const mcCodesInDepo = useMemo(() => mcListInSelectedDepo.map((m) => m.mc).sort(), [mcListInSelectedDepo]);
  const [mcAllValues, setMcAllValues] = useState({});
  const [mcAllDirty, setMcAllDirty] = useState(false);
  const [mcAllLoadedKey, setMcAllLoadedKey] = useState(null);
  const mcAllCtxKey = (periodReady && mcCodesInDepo.length > 0) ? `${selectedDepoId}|${mcCodesInDepo.join(",")}|${monthInt}|${yearInt}` : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mcAllCtxKey) { setMcAllValues({}); setMcAllLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_mc_v2").select("mc, pengeluaran_data")
        .in("mc", mcCodesInDepo).eq("month", monthInt).eq("year", yearInt);
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load mc (semua):", error.message);
      const map = {};
      mcCodesInDepo.forEach((mc) => { map[mc] = {}; });
      (data || []).forEach((r) => { map[r.mc] = r.pengeluaran_data || {}; });
      setMcAllValues(map);
      setMcAllDirty(false);
      setMcAllLoadedKey(mcAllCtxKey);
    })();
    return () => { cancelled = true; };
  }, [mcAllCtxKey, mcCodesInDepo, monthInt, yearInt]);'''
new_mc_state = '''  // BARU (permintaan user - "tampilkan semua mc, untuk mempermudah
  // pengisian oleh satu orang tanpa harus ganti ganti filternya" lalu
  // "khusus untuk sdm secara default dia akan menampilkan semua depo
  // yang ada, sehingga mc nya semua mc yang ada di partner tersebut"):
  // `mcCodesInDepo` (scoped ke Depo yg lagi dipilih) dipakai Marketing
  // Cost Langkah 3/4, TIDAK berubah. Khusus section SDM level District
  // di bawah ini, scope-nya di-WIDEN jadi SEMUA MC milik Partner ini
  // (semua Depo sekaligus, dari `mcList` yg sudah dimuat per-partner).
  const mcCodesInDepo = useMemo(() => mcListInSelectedDepo.map((m) => m.mc).sort(), [mcListInSelectedDepo]);
  const allMcsInPartner = useMemo(() => mcList.map((m) => m.mc).sort(), [mcList]);
  // Nama Depo asal tiap MC (dari pnl_v2_depo_mc) - dipakai nunjukin
  // "Depo: ..." di tiap kartu District section SDM, krn skrg 1 section
  // bisa berisi District dari BANYAK Depo berbeda sekaligus.
  const depoNameOfMc = useMemo(() => {
    const map = {};
    (depoMcRows || []).forEach((r) => {
      if (map[r.mc]) return;
      const dp = deposAll.find((d) => d.id === r.depo_id);
      if (dp) map[r.mc] = dp.depo_name;
    });
    return map;
  }, [depoMcRows, deposAll]);
  const [mcAllValues, setMcAllValues] = useState({});
  const [mcAllDirty, setMcAllDirty] = useState(false);
  const [mcAllLoadedKey, setMcAllLoadedKey] = useState(null);
  const mcAllCtxKey = (periodReady && allMcsInPartner.length > 0) ? `${allMcsInPartner.join(",")}|${monthInt}|${yearInt}` : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mcAllCtxKey) { setMcAllValues({}); setMcAllLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_mc_v2").select("mc, pengeluaran_data")
        .in("mc", allMcsInPartner).eq("month", monthInt).eq("year", yearInt);
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load mc (semua):", error.message);
      const map = {};
      allMcsInPartner.forEach((mc) => { map[mc] = {}; });
      (data || []).forEach((r) => { map[r.mc] = r.pengeluaran_data || {}; });
      setMcAllValues(map);
      setMcAllDirty(false);
      setMcAllLoadedKey(mcAllCtxKey);
    })();
    return () => { cancelled = true; };
  }, [mcAllCtxKey, allMcsInPartner, monthInt, yearInt]);'''
do(old_mc_state, new_mc_state, 1, "widen mcAllValues jadi semua MC partner")

# ── 5) saveMcAll: ikut widen pakai allMcsInPartner.
old_savemcall = '''  const saveMcAll = async () => {
    if (!mcAllCtxKey || mcCodesInDepo.length === 0) return;
    setSaving(true);
    try {
      const rows = mcCodesInDepo.map((mc) => ({'''
new_savemcall = '''  const saveMcAll = async () => {
    if (!mcAllCtxKey || allMcsInPartner.length === 0) return;
    setSaving(true);
    try {
      const rows = allMcsInPartner.map((mc) => ({'''
do(old_savemcall, new_savemcall, 1, "saveMcAll -> pakai allMcsInPartner")

# ── 6) sdmRowReadOnly level mc: ikut widen.
do(
    '    if (lvl === "mc") return mcCodesInDepo.length === 0;',
    '    if (lvl === "mc") return allMcsInPartner.length === 0;',
    1, "sdmRowReadOnly mc -> allMcsInPartner",
)
do(
    '  }, [editable, allDepoIds, mcCodesInDepo, allAreas, allRegions]);',
    '  }, [editable, allDepoIds, allMcsInPartner, allAreas, allRegions]);',
    1, "sdmRowReadOnly deps -> allMcsInPartner",
)

# ── 7) sdmLevelEntityLabel(mc): skrg mencakup semua Depo, jadi tanpa
# nama 1 Depo spesifik lagi (nama Depo-nya ditampilkan per-kartu).
old_entitylabel_mc = '''    if (lvl === "mc") {
      if (!mcCodesInDepo.length) return "—";
      const depoNm = depos.find((dp) => dp.id === selectedDepoId)?.depo_name || "—";
      return `Semua District (${mcCodesInDepo.length}) — Depo ${depoNm}`;
    }'''
new_entitylabel_mc = '''    if (lvl === "mc") return allMcsInPartner.length ? `Semua District (${allMcsInPartner.length})` : "—";'''
do(old_entitylabel_mc, new_entitylabel_mc, 1, "sdmLevelEntityLabel(mc) -> semua partner")

# ── 8) renderSdmLevelSection: entities mc -> allMcsInPartner + sublabel
# nama Depo per-MC dari depoNameOfMc. Sertakan juga onMoveLevel/
# levelOfItem ke SEMUA pemanggilan ItemTable/MultiEntityItemTable di
# section SDM supaya tombol opsi "Pindahkan Level" muncul.
old_render = '''    if (lvl === "partner") {
      table = <ItemTable items={items} values={partnerValues} onChange={setPartnerItemValue} readOnly={sdmRowReadOnly(lvl)} showQty showKategori draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} t={t} />;
    } else if (lvl === "region") {
      table = <MultiEntityItemTable items={items} entities={allRegions.map((r) => ({ key: r, label: r }))} valuesByEntity={regionAllValues} onChange={setRegionAllItemValue} readOnly={sdmRowReadOnly(lvl)} draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} emptyLabel="Belum ada Region." t={t} />;
    } else if (lvl === "area") {
      table = <MultiEntityItemTable items={items} entities={allAreas.map((a) => ({ key: a, label: a }))} valuesByEntity={areaAllValues} onChange={setAreaAllItemValue} readOnly={sdmRowReadOnly(lvl)} draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} emptyLabel="Belum ada Area." t={t} />;
    } else if (lvl === "mc") {
      table = <MultiEntityItemTable items={items} entities={mcCodesInDepo.map((mc) => ({ key: mc, label: mc, sublabel: depos.find((dp) => dp.id === selectedDepoId)?.depo_name }))} valuesByEntity={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(lvl)} draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} emptyLabel="Depo ini belum punya District." t={t} />;
    } else {
      table = <MultiEntityItemTable items={items} entities={deposAll.map((dp) => ({ key: dp.id, label: dp.depo_name }))} valuesByEntity={depoAllValues} onChange={setDepoAllItemValue} readOnly={sdmRowReadOnly(lvl)} draggable={canManageSdmLevel} onItemDragStart={handleSdmItemDragStart} movingLevelId={movingLevelId} emptyLabel="Belum ada Depo." t={t} />;
    }'''
new_render = '''    const dndCommon = { draggable: canManageSdmLevel, onItemDragStart: handleSdmItemDragStart, movingLevelId, onMoveLevel: canManageSdmLevel ? moveSdmItemLevel : undefined, levelOfItem, t };
    if (lvl === "partner") {
      table = <ItemTable items={items} values={partnerValues} onChange={setPartnerItemValue} readOnly={sdmRowReadOnly(lvl)} showQty showKategori {...dndCommon} />;
    } else if (lvl === "region") {
      table = <MultiEntityItemTable items={items} entities={allRegions.map((r) => ({ key: r, label: r }))} valuesByEntity={regionAllValues} onChange={setRegionAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Region." {...dndCommon} />;
    } else if (lvl === "area") {
      table = <MultiEntityItemTable items={items} entities={allAreas.map((a) => ({ key: a, label: a }))} valuesByEntity={areaAllValues} onChange={setAreaAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Area." {...dndCommon} />;
    } else if (lvl === "mc") {
      table = <MultiEntityItemTable items={items} entities={allMcsInPartner.map((mc) => ({ key: mc, label: mc, sublabel: depoNameOfMc[mc] }))} valuesByEntity={mcAllValues} onChange={setMcAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada District." {...dndCommon} />;
    } else {
      table = <MultiEntityItemTable items={items} entities={deposAll.map((dp) => ({ key: dp.id, label: dp.depo_name }))} valuesByEntity={depoAllValues} onChange={setDepoAllItemValue} readOnly={sdmRowReadOnly(lvl)} emptyLabel="Belum ada Depo." {...dndCommon} />;
    }'''
do(old_render, new_render, 1, "renderSdmLevelSection -> entities mc semua partner + onMoveLevel di semua table")

open(p, "w").write(S["s"])
print("STEP4_OK")
