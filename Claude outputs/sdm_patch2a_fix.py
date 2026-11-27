p = "app/dashboard/components/PNL_FormPengeluaranV2.jsx"
s = open(p).read()
S = {"s": s}
def do(old, new, n, label):
    c = S["s"].count(old)
    assert c == n, f"{label}: expected {n}, got {c}"
    S["s"] = S["s"].replace(old, new)

old_depo_state = '''  // ── Nilai OPEX/SDM (per Depo) ────────────────────────────────────────
  const [depoValues, setDepoValues] = useState({});
  const [depoDirty, setDepoDirty] = useState(false);
  const [depoLoadedKey, setDepoLoadedKey] = useState(null);
  const depoCtxKey = (periodReady && selectedDepoId) ? `${selectedDepoId}|${monthInt}|${yearInt}` : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!depoCtxKey) { setDepoValues({}); setDepoLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_depo_v2").select("pengeluaran_data")
        .eq("depo_id", selectedDepoId).eq("month", monthInt).eq("year", yearInt).maybeSingle();
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load depo:", error.message);
      setDepoValues(data?.pengeluaran_data || {});
      setDepoDirty(false);
      setDepoLoadedKey(depoCtxKey);
    })();
    return () => { cancelled = true; };
  }, [depoCtxKey, selectedDepoId, monthInt, yearInt]);'''
new_depo_state = '''  // ── Nilai OPEX/SDM (SEMUA Depo milik Partner sekaligus) ──────────────
  // FIX (permintaan user - "untuk sdm saja kita akan buat konsepnya jadi
  // drag and drop semuanya ... sama seperti level mc sekarang ... jika
  // dia di level depo/area/region, harus masukkan semua entitas yg ada
  // di partner tersebut"): dulu cuma Depo yg lagi dipilih yg dimuat.
  // Sekarang SEMUA Depo milik Partner ini dimuat sekaligus (spt pola
  // mcAllValues) - `depoValues` (dipakai OPEX & Cost of Money Langkah 1)
  // jadi turunan dari map ini utk Depo yg lagi aktif, dan tabel
  // breakdown SDM level Depo pakai map yg SAMA utk semua Depo - 1
  // sumber data per Depo, tidak ada risiko saling timpa saat disimpan.
  const allDepoIds = useMemo(() => deposAll.map((dp) => dp.id), [deposAll]);
  const [depoAllValues, setDepoAllValues] = useState({});
  const [depoAllDirty, setDepoAllDirty] = useState(false);
  const [depoAllLoadedKey, setDepoAllLoadedKey] = useState(null);
  const depoAllCtxKey = (periodReady && allDepoIds.length > 0) ? `${allDepoIds.join(",")}|${monthInt}|${yearInt}` : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!depoAllCtxKey) { setDepoAllValues({}); setDepoAllLoadedKey(null); return; }
      const { data, error } = await supabase.from("pnl_pengeluaran_depo_v2").select("depo_id, pengeluaran_data")
        .in("depo_id", allDepoIds).eq("month", monthInt).eq("year", yearInt);
      if (cancelled) return;
      if (error) console.error("[PNL_FormPengeluaranV2] gagal load depo (semua):", error.message);
      const map = {};
      allDepoIds.forEach((id) => { map[id] = {}; });
      (data || []).forEach((r) => { map[r.depo_id] = r.pengeluaran_data || {}; });
      setDepoAllValues(map);
      setDepoAllDirty(false);
      setDepoAllLoadedKey(depoAllCtxKey);
    })();
    return () => { cancelled = true; };
  }, [depoAllCtxKey, allDepoIds, monthInt, yearInt]);
  const depoValues = depoAllValues[selectedDepoId] || {};'''
do(old_depo_state, new_depo_state, 1, "depoValues -> depoAllValues (fix: previously not applied)")

open(p, "w").write(S["s"])
print("PATCH2A_FIX_OK")
