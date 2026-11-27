path = "PNL_DepoManager.jsx"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

def do(old, new, n=1, label=""):
    global src
    c = src.count(old)
    assert c == n, f"[{label}] expected {n} occurrence(s), found {c}"
    src = src.replace(old, new, n)

# ── 1. State baru: District yg "ditempel sementara" (staged) ke form
# Tambah Depo SEBELUM Depo-nya benar2 dibuat - permintaan user ("minimum
# 1 district atau MC untuk 1 depo baru") - Depo baru kini WAJIB sudah
# ada minimal 1 District yg di-drag ke kotak "Tambah Depo" dulu sebelum
# tombolnya bisa diklik. ──
do(
'''  // Depo yg baru saja dibuat (utk auto-scroll + highlight sebentar)
  const [freshDepoId, setFreshDepoId] = useState(null);
  const depoCardRefs = useRef({});''',
'''  // Depo yg baru saja dibuat (utk auto-scroll + highlight sebentar)
  const [freshDepoId, setFreshDepoId] = useState(null);
  const depoCardRefs = useRef({});

  // District yg sudah diseret ke kotak "Tambah Depo" tapi Depo-nya
  // belum dibuat (staged) - permintaan user ("minimum 1 district atau
  // mc untuk 1 depo baru"): tombol "Tambah Depo" baru aktif kalau set
  // ini tidak kosong, dan District-nya baru benar2 di-assign ke DB
  // begitu Depo-nya berhasil dibuat (lihat addDepo()).
  const [newPickerChecked, setNewPickerChecked] = useState(() => new Set());''',
    label="state newPickerChecked",
)

# ── 2. unassigned yg ditampilkan di panel kiri: District yg sudah
# di-stage ke "Tambah Depo" disembunyikan sementara dari pool (biar
# kelihatan "pindah" ke kotak staging, bukan muncul dobel). ──
do(
'''  const unassignedBranches = useMemo(() => {
    const seen = new Set();
    const list = [];
    unassigned.forEach((m) => {
      const b = m.branch || "(Tanpa Area)";
      if (seen.has(b)) return;
      seen.add(b);
      list.push(b);
    });
    list.sort((a, b) => a.localeCompare(b));
    if (contextBranch && list.includes(contextBranch)) {
      return [contextBranch, ...list.filter((b) => b !== contextBranch)];
    }
    return list;
  }, [unassigned, contextBranch]);''',
'''  const poolUnassigned = useMemo(() => unassigned.filter((m) => !newPickerChecked.has(m.mc)), [unassigned, newPickerChecked]);

  const unassignedBranches = useMemo(() => {
    const seen = new Set();
    const list = [];
    poolUnassigned.forEach((m) => {
      const b = m.branch || "(Tanpa Area)";
      if (seen.has(b)) return;
      seen.add(b);
      list.push(b);
    });
    list.sort((a, b) => a.localeCompare(b));
    if (contextBranch && list.includes(contextBranch)) {
      return [contextBranch, ...list.filter((b) => b !== contextBranch)];
    }
    return list;
  }, [poolUnassigned, contextBranch]);''',
    label="poolUnassigned + unassignedBranches",
)

# ── 3. addDepo: WAJIB minimal 1 District sudah di-stage, baru insert
# Depo + langsung upsert District yg di-stage ke Depo barunya sekaligus. ──
do(
'''  // BARU: Depo dibuat KOSONG (tanpa wajib pilih District dulu) - District
  // ditambahkan belakangan dgn cara diseret dari panel kiri.
  const addDepo = async () => {
    const name = newName.trim();
    if (!name) return;
    setSavingNew(true); setErr("");
    try {
      const { data, error } = await supabase.from("pnl_v2_depo")
        .insert({ partner_name: partnerName, depo_name: name })
        .select("id").single();
      if (error) throw error;
      setNewName("");
      await onChanged?.();
      if (data?.id) setFreshDepoId(data.id);
    } catch (e) {
      setErr(e.message || "Gagal menambah Depo.");
    } finally {
      setSavingNew(false);
    }
  };''',
'''  // FIX (permintaan user - "minimum 1 district atau mc untuk 1 depo
  // baru"): Depo baru WAJIB sudah punya minimal 1 District yg di-stage
  // (diseret ke kotak "Tambah Depo") - begitu Depo berhasil dibuat,
  // District yg di-stage langsung di-assign ke Depo itu dlm 1 alur.
  const addDepo = async () => {
    const name = newName.trim();
    const mcs = Array.from(newPickerChecked);
    if (!name || mcs.length === 0) return;
    setSavingNew(true); setErr("");
    try {
      const { data, error } = await supabase.from("pnl_v2_depo")
        .insert({ partner_name: partnerName, depo_name: name })
        .select("id").single();
      if (error) throw error;
      const depoId = data?.id;
      if (depoId) {
        const { error: mcErr } = await supabase.from("pnl_v2_depo_mc")
          .upsert(mcs.map((mc) => ({ mc, depo_id: depoId })), { onConflict: "mc" });
        if (mcErr) throw mcErr;
      }
      setNewName("");
      setNewPickerChecked(new Set());
      await onChanged?.();
      if (depoId) setFreshDepoId(depoId);
    } catch (e) {
      setErr(e.message || "Gagal menambah Depo.");
    } finally {
      setSavingNew(false);
    }
  };''',
    label="addDepo minimal 1 district",
)

# ── 4. Handler drop khusus ke kotak "Tambah Depo" (staging, Depo blm
# ada) - validasi "1 Area" jg berlaku di sini thdp District yg sudah
# di-stage sebelumnya. ──
do(
'''  const handleDropOnUnassigned = (e) => {
    e.preventDefault();
    const mc = e.dataTransfer.getData("text/plain") || dragMc;
    setDragOverTarget(null);
    if (mc && assignedMcSet.has(mc)) unassignMc(mc);
    setDragMc(null);
  };''',
'''  const handleDropOnUnassigned = (e) => {
    e.preventDefault();
    const mc = e.dataTransfer.getData("text/plain") || dragMc;
    setDragOverTarget(null);
    if (mc && assignedMcSet.has(mc)) unassignMc(mc);
    if (mc && newPickerChecked.has(mc)) setNewPickerChecked((prev) => { const n = new Set(prev); n.delete(mc); return n; });
    setDragMc(null);
  };
  const handleDropOnNewStaging = (e) => {
    e.preventDefault();
    const mc = e.dataTransfer.getData("text/plain") || dragMc;
    setDragOverTarget(null);
    setDragMc(null);
    if (!mc || assignedMcSet.has(mc)) return;
    const mcBranch = branchOf(mc);
    const stagedList = Array.from(newPickerChecked);
    const stagedBranch = stagedList.length > 0 ? branchOf(stagedList[0]) : null;
    if (stagedBranch && mcBranch && mcBranch !== stagedBranch) {
      setErr(`District "${mc}" (Area ${mcBranch}) tidak bisa digabung dengan District Area "${stagedBranch}" yang sudah dipilih untuk Depo baru ini — 1 Depo cuma boleh 1 Area.`);
      return;
    }
    setErr("");
    setNewPickerChecked((prev) => new Set(prev).add(mc));
  };
  const removeStagedNew = (mc) => setNewPickerChecked((prev) => { const n = new Set(prev); n.delete(mc); return n; });''',
    label="handleDropOnNewStaging",
)

# ── 5. Panel kiri: tampilkan poolUnassigned (bukan unassigned mentah),
# supaya District yg lagi di-stage "pindah" dari sini ke kotak kanan. ──
do(
'''            <div style={{ fontSize: 11, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              Belum Masuk Depo ({unassigned.length})
            </div>
            {unassigned.length === 0 ? (
              <div style={{ fontSize: 11.5, color: t.lo, padding: "8px 2px" }}>Semua District sudah masuk ke salah satu Depo.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {unassignedBranches.map((b) => (
                  <div key={b}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: t.lo, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{b}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {unassigned.filter((m) => (m.branch || "(Tanpa Area)") === b).map((m) => (
                        <DragChip key={m.mc} mc={m.mc} variant="pool" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}''',
'''            <div style={{ fontSize: 11, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              Belum Masuk Depo ({poolUnassigned.length})
            </div>
            {poolUnassigned.length === 0 ? (
              <div style={{ fontSize: 11.5, color: t.lo, padding: "8px 2px" }}>Semua District sudah masuk ke salah satu Depo.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {unassignedBranches.map((b) => (
                  <div key={b}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: t.lo, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{b}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {poolUnassigned.filter((m) => (m.branch || "(Tanpa Area)") === b).map((m) => (
                        <DragChip key={m.mc} mc={m.mc} variant="pool" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}''',
    label="panel kiri pakai poolUnassigned",
)

# ── 6. Kotak "Tambah Depo": jadi drop-zone staging + daftar chip District
# yg sudah dipilih + tombol nonaktif sampai minimal 1 District ada. ──
do(
'''            {editable && (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) addDepo(); }}
                  placeholder="Nama Depo baru..."
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${t.inputBd}`, background: t.card, color: t.hi, fontSize: 13, fontFamily: "inherit", boxShadow: t.sm }}
                />
                <button onClick={addDepo} disabled={savingNew || !newName.trim()} className="v2btn-p" style={{ padding: "10px 18px", borderRadius: 10, whiteSpace: "nowrap" }}>
                  <Plus size={14} /> {savingNew ? "Menambahkan..." : "Tambah Depo"}
                </button>
              </div>
            )}''',
'''            {editable && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverTarget("new"); }}
                onDragLeave={() => setDragOverTarget((c) => (c === "new" ? null : c))}
                onDrop={handleDropOnNewStaging}
                style={{
                  border: `1.5px dashed ${dragOverTarget === "new" ? t.blue : t.line}`,
                  borderRadius: 14, background: dragOverTarget === "new" ? t.blueBg : t.sub,
                  padding: 14, transition: "background 0.15s, border-color 0.15s",
                }}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newName.trim() && newPickerChecked.size > 0) addDepo(); }}
                    placeholder="Nama Depo baru..."
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${t.inputBd}`, background: t.card, color: t.hi, fontSize: 13, fontFamily: "inherit", boxShadow: t.sm }}
                  />
                  <button onClick={addDepo} disabled={savingNew || !newName.trim() || newPickerChecked.size === 0} className="v2btn-p" style={{ padding: "10px 18px", borderRadius: 10, whiteSpace: "nowrap" }}>
                    <Plus size={14} /> {savingNew ? "Menambahkan..." : `Tambah Depo${newPickerChecked.size > 0 ? ` (${newPickerChecked.size})` : ""}`}
                  </button>
                </div>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minHeight: 30 }}>
                  {newPickerChecked.size === 0 ? (
                    <span style={{ fontSize: 11.5, color: t.lo }}>Seret minimal 1 District dari kiri ke sini dulu sebelum membuat Depo.</span>
                  ) : (
                    Array.from(newPickerChecked).map((mc) => (
                      <span key={mc} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 6px 4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: t.card, color: t.hi, border: `1px solid ${t.line}`, boxShadow: t.sm }}>
                        {mcLabel(mc)}
                        <button onClick={() => removeStagedNew(mc)} title="Batalkan" style={{ width: 16, height: 16, borderRadius: 999, background: t.redBg, border: "none", cursor: "pointer", color: t.red, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={10} /></button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}''',
    label="kotak tambah depo jadi staging",
)

with open(path, "w", encoding="utf-8") as f:
    f.write(src)

print("OK: all patches applied")
