"use client";
// BARU (permintaan user - "apakah memungkinkan semuanya menjadi drag and
// drop jadi ada level levelnya namun yang bisa digeser geser itu hanya
// yang di sdm"): halaman admin khusus role spm_sumatera utk atur level
// tiap item SDM (BM per Area, TSS/SPV per MC, GM per Region, dst - lihat
// PNL_FormPengeluaranV2.jsx) dengan cara drag & drop kartu item antar
// kolom level (Partner/Region/Area/District/Depo). Disimpan ke tabel
// pnl_sdm_level_config: partner_name NULL = default global (berlaku semua
// Partner), partner_name terisi = override khusus Partner itu saja.
// Native HTML5 Drag & Drop (draggable/onDragStart/onDrop) - tidak pakai
// library tambahan, konsisten dgn pola drop-file yg sudah ada di
// PNL_ImportWizard.jsx/DSE_ProdAR.jsx.
import { useEffect, useMemo, useState, useCallback } from "react";
import { Layers, RotateCcw, Loader2 } from "lucide-react";
import supabase from "../../../lib/supabase";
import { FONT, mk, V2Styles, Card, Body, LoadingBlock } from "./PNL_V2Shared";
import { PENGELUARAN_CATALOG } from "./PNL_FormPengeluaranV2";

const SDM_ITEMS = PENGELUARAN_CATALOG.filter((it) => it.step === "SDM");

const LEVELS = [
  { key: "partner", label: "Partner", sub: "1x per Partner" },
  { key: "region",  label: "Region",  sub: "1x per Region" },
  { key: "area",    label: "Area",    sub: "1x per Area" },
  { key: "mc",      label: "District (MC)", sub: "1x per MC" },
  { key: "depo",    label: "Depo",    sub: "1x per Depo" },
];

export default function PNL_SdmLevelConfig({ theme }) {
  const d = theme === "dark";
  const t = useMemo(() => mk(d), [d]);

  const [partners, setPartners] = useState([]);
  const [partnerFilter, setPartnerFilter] = useState(""); // "" = Default (global)
  const [defaultMap, setDefaultMap] = useState({});   // item_id -> level (partner_name NULL)
  const [overrideMap, setOverrideMap] = useState({}); // item_id -> level (partner_name = partnerFilter)
  const [loaded, setLoaded] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverLevel, setDragOverLevel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("mf_dse_database").select("mdi")
        .eq("is_revoked", false).not("mdi", "is", null);
      if (cancelled) return;
      if (error) { console.error("[PNL_SdmLevelConfig] gagal load daftar partner:", error.message); return; }
      const seen = new Set();
      const list = [];
      (data || []).forEach((r) => { if (r.mdi && !seen.has(r.mdi)) { seen.add(r.mdi); list.push(r.mdi); } });
      list.sort((a, b) => a.localeCompare(b));
      setPartners(list);
    })();
    return () => { cancelled = true; };
  }, []);

  const loadConfig = useCallback(async () => {
    await Promise.resolve();
    setLoaded(false);
    const [{ data: globalRows, error: eG }, { data: ovRows, error: eO }] = await Promise.all([
      supabase.from("pnl_sdm_level_config").select("item_id, level").is("partner_name", null),
      partnerFilter
        ? supabase.from("pnl_sdm_level_config").select("item_id, level").eq("partner_name", partnerFilter)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (eG) console.error("[PNL_SdmLevelConfig] gagal load default:", eG.message);
    if (eO) console.error("[PNL_SdmLevelConfig] gagal load override:", eO.message);
    const dMap = {};
    (globalRows || []).forEach((r) => { dMap[r.item_id] = r.level; });
    const oMap = {};
    (ovRows || []).forEach((r) => { oMap[r.item_id] = r.level; });
    setDefaultMap(dMap);
    setOverrideMap(oMap);
    setLoaded(true);
  }, [partnerFilter]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Level efektif yg lagi tampil per item: override (kalau sedang lihat
  // Partner tertentu & ada override-nya) -> fallback ke default global.
  const effectiveLevelOf = useCallback(
    (id) => (partnerFilter && overrideMap[id]) || defaultMap[id] || "depo",
    [partnerFilter, overrideMap, defaultMap],
  );

  const itemsByLevel = useMemo(() => {
    const out = {}; LEVELS.forEach((l) => { out[l.key] = []; });
    SDM_ITEMS.forEach((it) => { (out[effectiveLevelOf(it.id)] ||= []).push(it); });
    return out;
  }, [effectiveLevelOf]);

  const moveItem = async (itemId, newLevel) => {
    const prevEffective = effectiveLevelOf(itemId);
    if (prevEffective === newLevel) return;
    setSavingId(itemId);
    // Optimistic update dulu biar kartu langsung pindah, baru simpan.
    if (partnerFilter) setOverrideMap((m) => ({ ...m, [itemId]: newLevel }));
    else setDefaultMap((m) => ({ ...m, [itemId]: newLevel }));
    try {
      const { error } = await supabase.from("pnl_sdm_level_config")
        .upsert({ item_id: itemId, partner_name: partnerFilter || null, level: newLevel, updated_at: new Date().toISOString() }, { onConflict: "item_id,partner_name" });
      if (error) throw error;
    } catch (e) {
      alert(e.message || "Gagal menyimpan perubahan level.");
      loadConfig(); // rollback dgn reload ulang dari DB
    } finally {
      setSavingId(null);
    }
  };

  const resetOverride = async (itemId) => {
    if (!partnerFilter) return;
    setSavingId(itemId);
    setOverrideMap((m) => { const n = { ...m }; delete n[itemId]; return n; });
    try {
      const { error } = await supabase.from("pnl_sdm_level_config")
        .delete().eq("item_id", itemId).eq("partner_name", partnerFilter);
      if (error) throw error;
    } catch (e) {
      alert(e.message || "Gagal menghapus override.");
      loadConfig();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div style={{ width: "100%", margin: "0 auto", paddingBottom: 60, fontFamily: FONT, WebkitFontSmoothing: "antialiased", color: t.hi }}>
      <V2Styles d={d} t={t} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#ED1C24 0%,#C6168D 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Layers size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: t.hi }}>Pengaturan Level SDM</div>
            <div style={{ fontSize: 12, color: t.mid }}>Geser kartu item ke kolom level yang sesuai. Berlaku untuk pengisian Form Pengeluaran &rarr; SDM.</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.mid }}>Partner</span>
          <select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)}
            style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, fontFamily: "inherit", minWidth: 220 }}>
            <option value="">— Default (semua Partner) —</option>
            {partners.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: t.mid, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
        {partnerFilter
          ? <>Sedang atur <b style={{ color: t.hi }}>override khusus Partner {partnerFilter}</b>. Kartu bertanda <b style={{ color: "#ED1C24" }}>●</b> artinya sudah ada override; klik ikon reset pada kartu utk kembali ke default global.</>
          : <>Sedang atur <b style={{ color: t.hi }}>default global</b> — berlaku untuk semua Partner yang belum punya override sendiri.</>}
      </div>

      {!loaded ? <LoadingBlock label="Memuat konfigurasi level SDM..." t={t} /> : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${LEVELS.length}, minmax(190px, 1fr))`, gap: 12, overflowX: "auto" }}>
          {LEVELS.map((lvl) => (
            <div
              key={lvl.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverLevel(lvl.key); }}
              onDragLeave={() => setDragOverLevel((cur) => (cur === lvl.key ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverLevel(null);
                const itemId = e.dataTransfer.getData("text/plain") || dragId;
                if (itemId) moveItem(itemId, lvl.key);
                setDragId(null);
              }}
            >
              <Card t={t} style={{ minHeight: 420, border: dragOverLevel === lvl.key ? `2px dashed #ED1C24` : `1px solid ${t.line}`, background: dragOverLevel === lvl.key ? t.redBg : t.card }}>
                <Body style={{ padding: "14px 12px" }}>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: t.hi }}>{lvl.label}</div>
                    <div style={{ fontSize: 10.5, color: t.lo }}>{lvl.sub}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(itemsByLevel[lvl.key] || []).map((it) => {
                      const hasOverride = !!(partnerFilter && overrideMap[it.id]);
                      const isSaving = savingId === it.id;
                      return (
                        <div
                          key={it.id}
                          draggable
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", it.id); setDragId(it.id); }}
                          onDragEnd={() => setDragId(null)}
                          style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 8,
                            border: `1px solid ${hasOverride ? "#ED1C24" : t.line}`,
                            background: hasOverride ? t.redBg : t.sub,
                            cursor: "grab", fontSize: 12, fontWeight: 600, color: t.hi,
                            opacity: dragId === it.id ? 0.4 : isSaving ? 0.6 : 1,
                            transition: "opacity 0.1s",
                          }}
                          title={it.item}
                        >
                          <span style={{ flex: 1, lineHeight: 1.3 }}>{it.item}</span>
                          {isSaving && <Loader2 size={11} className="animate-spin" style={{ flexShrink: 0, color: t.mid }} />}
                          {!isSaving && hasOverride && (
                            <button onClick={() => resetOverride(it.id)} title="Kembalikan ke default global"
                              style={{ flexShrink: 0, border: "none", background: "transparent", cursor: "pointer", color: t.mid, padding: 2, display: "flex" }}>
                              <RotateCcw size={11} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {(itemsByLevel[lvl.key] || []).length === 0 && (
                      <div style={{ fontSize: 11, color: t.lo, textAlign: "center", padding: "18px 4px", border: `1px dashed ${t.line}`, borderRadius: 8 }}>
                        Lepaskan kartu di sini
                      </div>
                    )}
                  </div>
                </Body>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
