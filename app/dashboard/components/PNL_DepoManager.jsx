"use client";
// Kelola Depo (Pengeluaran V2) — permintaan user ("ini harusnya isinya
// area / branch, bukan mc" -> lalu "harusnya tambah DEPO dulu"): sebelum
// isi OPEX/SDM di Form Pengeluaran V2, Partner wajib membuat minimal 1
// Depo (grup District/MC buatan sendiri, bebas diubah kapan saja - 1 MC
// cuma boleh masuk 1 Depo, lihat migration pnl_v2_depo / pnl_v2_depo_mc).
// Komponen ini dipakai EMBEDDED di dalam PNL_FormPengeluaranV2.jsx (baik
// sbg gate wajib saat belum ada Depo sama sekali, maupun sbg panel
// "Kelola Depo" yang bisa dibuka kapan saja).
//
// UX (permintaan user, "buat dengan sangat bagus"): setelah Depo dibuat,
// Partner langsung diarahkan (auto-scroll + highlight) utk memasukkan
// District ke Depo itu — bisa pilih BANYAK District sekaligus (centang),
// dan pilihannya SELALU cuma dari District yg belum masuk Depo manapun
// (1 District = 1 Depo). Begitu dipakai di satu Depo, otomatis hilang
// dari pilihan semua Depo lain (termasuk saat nambah Depo berikutnya).
//
// ATURAN BARU (permintaan user, "1 depo ga mungkin megang area/branch
// berbeda sekaligus"): 1 Depo CUMA boleh berisi District dari SATU Area
// (field `branch` di mf_dse_database, mis. "BATAM") yg sama. Begitu Depo
// sudah punya >=1 District, Area-nya "terkunci" ke Area District pertama
// itu - picker cuma akan menawarkan District tersisa dari Area yg sama.
// Kalau Depo masih kosong, user pilih Area dulu di picker sebelum bisa
// mencentang District-nya - KECUALI kalau partner/branch yg lagi aktif
// di filter atas halaman (`contextBranch`, prop dari activeContext.branch)
// sudah jelas Area-nya dan masih ada District tersisa di situ: langsung
// terkunci ke Area itu tanpa nanya lagi (permintaan user - "harusnya
// menyesuaikan filter area yang dipilih di atas saja jadi tinggal pilih
// mc saja").
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, Check, ChevronDown, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import supabase from "../../../lib/supabase";
import { FONT } from "./PNL_V2Shared";

export default function PNL_DepoManager({ t, d, partnerName, depos, depoMcRows, mcList, editable, onChanged, onClose, embedded, contextBranch }) {
  const [newName, setNewName] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [err, setErr] = useState("");

  // BARU (permintaan user - "pada saat menambahkan depo wajib pilih
  // minimal satu district / MC"): Area + District dipilih DI FORM
  // "Tambah Depo" itu sendiri, sebelum Depo-nya dibuat - bukan lagi
  // opsional sesudahnya. Depo baru cuma jadi dibuat kalau ada minimal
  // 1 District tercentang (lihat tombol "Tambahkan Depo" di bawah).
  const [newPickerBranch, setNewPickerBranch] = useState("");
  const [newPickerChecked, setNewPickerChecked] = useState(() => new Set());
  // BARU (permintaan user - "masukkan nama depo dulu baru klik lanjut
  // baru tampil mc tersisanya"): form "Tambah Depo Baru" dipecah jadi 2
  // langkah - isi Nama dulu lalu klik "Lanjut", BARU muncul picker
  // Area/District. Sebelumnya nama + picker District tampil bareng
  // sekaligus, yg bikin bingung.
  const [newFormStep, setNewFormStep] = useState(1);
  const [unassignedExpanded, setUnassignedExpanded] = useState(false);

  // Depo yg baru saja dibuat (utk auto-scroll + highlight + auto-buka picker)
  const [freshDepoId, setFreshDepoId] = useState(null);
  const depoCardRefs = useRef({});

  // Panel pilih-banyak-District per Depo: { [depoId]: Set<mc> }
  const [pickerOpenFor, setPickerOpenFor] = useState(null);
  const [pickerChecked, setPickerChecked] = useState(() => new Set());
  // Area yg dipilih user DI DALAM picker - cuma relevan saat Depo yg
  // sedang dibuka pickernya masih kosong (Area-nya belum terkunci).
  const [pickerBranch, setPickerBranch] = useState("");
  const [pickerBusy, setPickerBusy] = useState(false);
  const [busyMc, setBusyMc] = useState(null);

  const mcByDepo = useMemo(() => {
    const m = {};
    (depoMcRows || []).forEach((r) => { (m[r.depo_id] ||= []).push(r.mc); });
    return m;
  }, [depoMcRows]);

  const assignedMcSet = useMemo(() => new Set((depoMcRows || []).map((r) => r.mc)), [depoMcRows]);
  const unassigned = useMemo(() => (mcList || []).filter((m) => !assignedMcSet.has(m.mc)), [mcList, assignedMcSet]);
  const mcLabel = (mc) => mcList?.find((m) => m.mc === mc)?.mc || mc;
  const branchOf = (mc) => mcList?.find((m) => m.mc === mc)?.branch || "";

  // Area yg sudah "terkunci" utk tiap Depo (dari District pertama yg
  // masuk ke Depo itu) - null kalau Depo masih kosong (Area bebas dipilih).
  const depoLockedBranch = useMemo(() => {
    const m = {};
    Object.entries(mcByDepo).forEach(([depoId, mcs]) => {
      m[depoId] = mcs.length > 0 ? (mcList?.find((x) => x.mc === mcs[0])?.branch || "") : null;
    });
    return m;
  }, [mcByDepo, mcList]);

  // Area2 yg masih ada District tersisa (belum masuk Depo manapun) -
  // dipakai sbg pilihan Area di picker saat Depo masih kosong.
  const unassignedBranches = useMemo(() => {
    const seen = new Set();
    const list = [];
    unassigned.forEach((m) => {
      const b = m.branch || "(Tanpa Area)";
      if (seen.has(b)) return;
      seen.add(b);
      list.push(b);
    });
    return list.sort((a, b) => a.localeCompare(b));
  }, [unassigned]);

  // Area yg otomatis dipakai utk Depo yg MASIH KOSONG - ikut filter
  // Cabang/Area yg lagi aktif di atas halaman, asal masih ada District
  // tersisa di Area itu. Kalau tidak ada (mis. semua District di Area
  // itu sudah terpakai Depo lain, atau belum ada Cabang dipilih), jatuh
  // balik ke "" supaya user pilih Area manual spt biasa.
  const autoPickerBranch = (contextBranch && unassignedBranches.includes(contextBranch)) ? contextBranch : "";

  // Area & District yg dipilih di FORM "Tambah Depo" (sebelum Depo
  // dibuat) - sama konsepnya spt pickerCandidates/pickerBranch milik
  // Depo yg sudah ada, tapi dipisah krn belum ada depoId.
  const newBranchChosen = autoPickerBranch || newPickerBranch;
  const newCandidates = newBranchChosen ? unassigned.filter((m) => (m.branch || "(Tanpa Area)") === newBranchChosen) : [];
  const toggleNewPicked = (mc) => {
    setNewPickerChecked((prev) => {
      const next = new Set(prev);
      if (next.has(mc)) next.delete(mc); else next.add(mc);
      return next;
    });
  };
  const pickAllNewRemaining = () => setNewPickerChecked(new Set(newCandidates.map((m) => m.mc)));

  // Begitu Depo baru muncul di props (setelah onChanged me-reload master),
  // scroll ke kartunya + buka langsung panel pilih District (kalau masih
  // ada District tersisa utk dimasukkan).
  useEffect(() => {
    if (!freshDepoId) return;
    let tmr;
    const t0 = setTimeout(() => {
      const stillThere = (depos || []).some((dp) => dp.id === freshDepoId);
      if (!stillThere) { setFreshDepoId(null); return; }
      const el = depoCardRefs.current[freshDepoId];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (unassigned.length > 0) {
        setPickerOpenFor(freshDepoId);
        setPickerChecked(new Set());
        setPickerBranch(autoPickerBranch);
      }
      tmr = setTimeout(() => setFreshDepoId(null), 4000);
    }, 0);
    return () => { clearTimeout(t0); clearTimeout(tmr); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshDepoId, depos]);

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
      setNewPickerBranch("");
      setNewPickerChecked(new Set());
      setNewFormStep(1);
      await onChanged?.();
      if (depoId) setFreshDepoId(depoId);
    } catch (e) {
      setErr(e.message || "Gagal menambah Depo.");
    } finally {
      setSavingNew(false);
    }
  };

  const saveRename = async (id) => {
    const name = renameVal.trim();
    if (!name) { setRenameId(null); return; }
    setErr("");
    try {
      const { error } = await supabase.from("pnl_v2_depo").update({ depo_name: name }).eq("id", id);
      if (error) throw error;
      setRenameId(null);
      await onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal mengubah nama Depo.");
    }
  };

  const deleteDepo = async (id, name) => {
    if (!window.confirm(`Hapus Depo "${name}"? District yang tergabung akan jadi belum terkelompok.`)) return;
    setErr("");
    try {
      const { error } = await supabase.from("pnl_v2_depo").delete().eq("id", id);
      if (error) throw error;
      if (pickerOpenFor === id) { setPickerOpenFor(null); setPickerChecked(new Set()); }
      await onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal menghapus Depo.");
    }
  };

  const openPicker = (depoId) => {
    setPickerOpenFor((cur) => (cur === depoId ? null : depoId));
    setPickerChecked(new Set());
    setPickerBranch(autoPickerBranch);
  };

  const togglePicked = (mc) => {
    setPickerChecked((prev) => {
      const next = new Set(prev);
      if (next.has(mc)) next.delete(mc); else next.add(mc);
      return next;
    });
  };

  // Daftar District yg bisa dicentang utk Depo yg pickernya sedang
  // terbuka - kalau Depo sudah terkunci ke satu Area, cuma District
  // tersisa dari Area itu; kalau masih kosong, cuma District dari Area
  // yg lagi dipilih user di picker (pickerBranch).
  const pickerCandidates = (depoId) => {
    const locked = depoLockedBranch[depoId];
    const activeBranch = locked || pickerBranch;
    if (!activeBranch) return [];
    return unassigned.filter((m) => (m.branch || "(Tanpa Area)") === activeBranch);
  };

  const pickAllRemaining = (depoId) => setPickerChecked(new Set(pickerCandidates(depoId).map((m) => m.mc)));

  const confirmAddPicked = async (depoId) => {
    const mcs = Array.from(pickerChecked);
    if (mcs.length === 0) return;
    setPickerBusy(true); setErr("");
    try {
      const { error } = await supabase.from("pnl_v2_depo_mc")
        .upsert(mcs.map((mc) => ({ mc, depo_id: depoId })), { onConflict: "mc" });
      if (error) throw error;
      setPickerChecked(new Set());
      setPickerOpenFor(null);
      await onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal menambahkan District ke Depo.");
    } finally {
      setPickerBusy(false);
    }
  };

  const unassignMc = async (mc) => {
    setBusyMc(mc); setErr("");
    try {
      const { error } = await supabase.from("pnl_v2_depo_mc").delete().eq("mc", mc);
      if (error) throw error;
      await onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal melepas District dari Depo.");
    } finally {
      setBusyMc(null);
    }
  };

  return (
    <div style={{ fontFamily: FONT, border: `1px solid ${t.line}`, borderRadius: 12, background: t.card, boxShadow: t.sm }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${t.line}` }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#ED1C24,#C6168D)", color: "#fff" }}>
          <Building2 size={16} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 14.5, color: t.hi, flex: 1, letterSpacing: "-0.01em" }}>Kelola Depo</div>
        {!embedded && onClose && (
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: t.lo, padding: 4, display: "flex" }}><X size={16} /></button>
        )}
      </div>

      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div style={{ fontSize: 12, color: t.red, background: t.redBg, border: `1px solid ${t.redBd}`, borderRadius: 8, padding: "8px 12px" }}>{err}</div>}

        {editable && unassigned.length === 0 && (
          <div style={{ fontSize: 11.5, color: t.mid, padding: "4px 2px" }}>
            Semua District sudah masuk ke salah satu Depo — tidak ada District tersisa untuk membuat Depo baru.
          </div>
        )}

        {editable && unassigned.length > 0 && (
          <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, background: t.sub, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              Tambah Depo Baru
            </div>

            {/* BARU (permintaan user - "masukkan nama depo dulu baru
                klik lanjut baru tampil mc tersisanya"): Langkah 1 - cuma
                Nama Depo + tombol "Lanjut". Picker Area/District BELUM
                muncul sama sekali di sini - baru muncul di Langkah 2
                sesudah nama-nya dikonfirmasi. */}
            {newFormStep === 1 ? (
              <>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) setNewFormStep(2); }}
                  placeholder="Masukkan Nama Depo"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontFamily: "inherit" }}
                />
                <button onClick={() => setNewFormStep(2)} disabled={!newName.trim()} className="v2btn-p" style={{ width: "100%", justifyContent: "center", marginTop: 10 }}>
                  Lanjut <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <>
                {/* Langkah 2 - nama sudah dikunci, ditampilkan sbg label
                    + tombol "Ganti" utk balik ke Langkah 1 kalau mau
                    ubah nama lagi. */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.hi }}>{newName}</span>
                  <button onClick={() => setNewFormStep(1)} style={{ background: "none", border: "none", cursor: "pointer", color: t.blue, fontSize: 11.5, fontWeight: 700 }}>Ganti</button>
                </div>

                {/* FIX (permintaan user - "rapikan agar tidak terlihat
                    berantakan"): bagian Area + District dibungkus kartu
                    putih tersendiri (sama persis gaya panel picker
                    District utk Depo yg SUDAH ada di bawah - lihat
                    "pickerOpen" render) biar jelas kelihatan sbg satu
                    grup, bukan numpuk jadi satu blok abu-abu polos. */}
                <div style={{ border: `1px solid ${t.line}`, borderRadius: 8, background: t.card, padding: 10 }}>
                  {/* BARU (permintaan user - "pada saat menambahkan depo
                      wajib pilih minimal satu district / MC"): Area +
                      District WAJIB dipilih di sini dulu sebelum tombol
                      "Tambahkan Depo" bisa diklik - Depo kosong (tanpa
                      District) sudah tidak bisa dibuat lagi lewat form
                      ini. */}
                  {!autoPickerBranch && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                        Pilih Area — 1 Depo cuma boleh 1 Area
                      </div>
                      <div style={{ position: "relative" }}>
                        <select
                          value={newPickerBranch}
                          onChange={(e) => { setNewPickerBranch(e.target.value); setNewPickerChecked(new Set()); }}
                          style={{ width: "100%", appearance: "none", WebkitAppearance: "none", padding: "7px 30px 7px 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit" }}
                        >
                          <option value="">— Pilih Area —</option>
                          {unassignedBranches.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none", display: "flex" }}>
                          <ChevronDown size={13} />
                        </div>
                      </div>
                    </div>
                  )}
                  {autoPickerBranch && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                      Area: <span style={{ color: t.blue }}>{autoPickerBranch}</span>
                      <span style={{ fontWeight: 500, color: t.lo }}>(ikut filter Cabang di atas)</span>
                    </div>
                  )}

                  {newBranchChosen && (
                    newCandidates.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: t.mid, padding: "4px 2px" }}>Semua District di Area {newBranchChosen} sudah masuk ke salah satu Depo.</div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            Pilih minimal 1 District di Area {newBranchChosen} ({newCandidates.length})
                          </span>
                          <button onClick={pickAllNewRemaining} style={{ background: "none", border: "none", cursor: "pointer", color: t.blue, fontSize: 11, fontWeight: 700 }}>
                            Pilih semua
                          </button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto" }}>
                          {newCandidates.map((m) => {
                            const checked = newPickerChecked.has(m.mc);
                            return (
                              <label key={m.mc} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: checked ? t.blueBg : "transparent" }}>
                                <span style={{
                                  width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                                  border: `1.5px solid ${checked ? t.blue : t.inputBd}`, background: checked ? t.blue : "transparent",
                                }}>
                                  {checked && <Check size={11} color="#fff" strokeWidth={3} />}
                                </span>
                                <input type="checkbox" checked={checked} onChange={() => toggleNewPicked(m.mc)} style={{ display: "none" }} />
                                <span style={{ fontSize: 12.5, color: t.hi }}>{m.mc}</span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )
                  )}
                </div>

                <button onClick={addDepo} disabled={savingNew || !newName.trim() || newPickerChecked.size === 0} className="v2btn-p" style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>
                  <Plus size={14} /> {savingNew ? "Menambahkan..." : `Tambahkan Depo${newPickerChecked.size > 0 ? ` (${newPickerChecked.size} District)` : ""}`}
                </button>
              </>
            )}
          </div>
        )}

        {/* FIX (permintaan user - "rapikan agar tidak terlihat
            berantakan"): pesan ini dulu SELALU muncul di bawah form
            "Tambah Depo Baru" meski form itu sendiri sudah jelas (jadi
            kesannya aneh - "Belum ada Depo" nongol SETELAH form
            tambahnya). Sekarang cuma tampil utk user yg TIDAK editable
            (mis. viewer) yg sama sekali ga lihat form-nya - mereka yg
            perlu konteks kenapa daftar Depo kosong. */}
        {!editable && (!depos || depos.length === 0) && (
          <div style={{ fontSize: 12.5, color: t.mid, padding: "6px 2px" }}>
            Belum ada Depo. Hubungi admin Partner untuk membuat Depo.
          </div>
        )}

        {(depos || []).map((dp) => {
          const mcs = mcByDepo[dp.id] || [];
          const isFresh = freshDepoId === dp.id;
          const pickerOpen = pickerOpenFor === dp.id;
          const lockedBranch = depoLockedBranch[dp.id];
          const candidates = pickerOpen ? pickerCandidates(dp.id) : [];
          const branchChosen = lockedBranch || pickerBranch;
          // "tersisa utk Depo ini" - kalau sudah terkunci, cuma District
          // sisa dari Area itu; kalau belum, total semua District sisa
          // (Area-nya masih bebas dipilih).
          const remainingForThisDepo = lockedBranch
            ? unassigned.filter((m) => (m.branch || "(Tanpa Area)") === lockedBranch).length
            : unassigned.length;
          return (
            <div
              key={dp.id}
              ref={(el) => { depoCardRefs.current[dp.id] = el; }}
              style={{
                border: `1px solid ${isFresh ? t.greenBd : t.lineH}`,
                borderRadius: 10, padding: 14, background: t.sub,
                boxShadow: isFresh ? `0 0 0 3px ${t.greenBg}` : "none",
                transition: "box-shadow 0.3s, border-color 0.3s",
                scrollMarginTop: 24,
              }}
            >
              {/* FIX (permintaan user - "perbaiki total UI ini"): header
                  kartu dipecah jadi 2 baris - Nama + tombol aksi di baris
                  atas, badge Area/jumlah District di baris bawah.
                  Sebelumnya semua (nama, 2 badge, 2 ikon aksi) numpuk di
                  1 baris sempit, jadi padat & susah dibaca di layar
                  sempit. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isFresh ? 6 : 10 }}>
                {renameId === dp.id ? (
                  <>
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRename(dp.id); if (e.key === "Escape") setRenameId(null); }}
                      style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
                    />
                    <button onClick={() => saveRename(dp.id)} className="v2btn-g" style={{ padding: "5px 10px" }}>Simpan</button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: t.hi, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dp.depo_name}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {lockedBranch && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: t.blue, background: t.blueBg, border: `1px solid ${t.blueBd}`, borderRadius: 999, padding: "2px 8px" }}>
                            Area: {lockedBranch}
                          </span>
                        )}
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, background: t.card, border: `1px solid ${t.line}`, borderRadius: 999, padding: "2px 8px" }}>
                          {mcs.length} District
                        </span>
                      </div>
                    </div>
                    {editable && (
                      <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0, alignSelf: "flex-start" }}>
                        <button onClick={() => { setRenameId(dp.id); setRenameVal(dp.depo_name); }} title="Ubah nama" style={{ background: "none", border: "none", cursor: "pointer", color: t.mid, padding: 6, display: "flex" }}><Pencil size={13} /></button>
                        <button onClick={() => deleteDepo(dp.id, dp.depo_name)} title="Hapus Depo" style={{ background: "none", border: "none", cursor: "pointer", color: t.red, padding: 6, display: "flex" }}><Trash2 size={13} /></button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {isFresh && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: t.green, marginBottom: 10 }}>
                  <Sparkles size={12} /> Depo baru dibuat — sekarang tambahkan District-nya di bawah ini.
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: editable ? 10 : 0 }}>
                {mcs.length === 0 && <span style={{ fontSize: 11.5, color: t.lo }}>Belum ada District di Depo ini.</span>}
                {mcs.map((mc) => (
                  <span key={mc} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: t.blueBg, color: t.blue, border: `1px solid ${t.blueBd}` }}>
                    {mcLabel(mc)}
                    {editable && (
                      <button onClick={() => unassignMc(mc)} disabled={busyMc === mc} title="Lepas dari Depo" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "flex" }}><X size={11} /></button>
                    )}
                  </span>
                ))}
              </div>

              {editable && !pickerOpen && remainingForThisDepo > 0 && (
                <button onClick={() => openPicker(dp.id)} className="v2btn-g" style={{ width: "100%", justifyContent: "center", padding: "8px 10px" }}>
                  <Plus size={13} /> Tambahkan District ke Depo ini ({remainingForThisDepo} tersisa)
                </button>
              )}
              {editable && !pickerOpen && remainingForThisDepo === 0 && mcs.length === 0 && (
                <div style={{ fontSize: 11.5, color: t.mid, padding: "4px 2px" }}>Semua District sudah masuk ke salah satu Depo.</div>
              )}

              {editable && pickerOpen && (
                <div style={{ border: `1px solid ${t.line}`, borderRadius: 8, background: t.card, padding: 10 }}>
                  {!lockedBranch && !autoPickerBranch && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                        1. Pilih Area dulu — 1 Depo cuma boleh 1 Area
                      </div>
                      <div style={{ position: "relative" }}>
                        <select
                          value={pickerBranch}
                          onChange={(e) => { setPickerBranch(e.target.value); setPickerChecked(new Set()); }}
                          style={{ width: "100%", appearance: "none", WebkitAppearance: "none", padding: "7px 30px 7px 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit" }}
                        >
                          <option value="">— Pilih Area —</option>
                          {unassignedBranches.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none", display: "flex" }}>
                          <ChevronDown size={13} />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Area sudah ngikut filter Cabang yg aktif di atas halaman
                      (contextBranch) - ga perlu nanya lagi, tinggal centang
                      District-nya saja (permintaan user). */}
                  {!lockedBranch && autoPickerBranch && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.mid, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                      Area: <span style={{ color: t.blue }}>{autoPickerBranch}</span>
                      <span style={{ fontWeight: 500, color: t.lo }}>(ikut filter Cabang di atas)</span>
                    </div>
                  )}
                  {branchChosen && (
                    candidates.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: t.mid, padding: "4px 2px" }}>Semua District di Area {branchChosen} sudah masuk ke salah satu Depo.</div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {!lockedBranch && !autoPickerBranch ? "2. " : ""}Pilih District di Area {branchChosen} ({candidates.length})
                          </span>
                          <button onClick={() => pickAllRemaining(dp.id)} style={{ background: "none", border: "none", cursor: "pointer", color: t.blue, fontSize: 11, fontWeight: 700 }}>
                            Pilih semua
                          </button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
                          {candidates.map((m) => {
                            const checked = pickerChecked.has(m.mc);
                            return (
                              <label key={m.mc} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: checked ? t.blueBg : "transparent" }}>
                                <span style={{
                                  width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                                  border: `1.5px solid ${checked ? t.blue : t.inputBd}`, background: checked ? t.blue : "transparent",
                                }}>
                                  {checked && <Check size={11} color="#fff" strokeWidth={3} />}
                                </span>
                                <input type="checkbox" checked={checked} onChange={() => togglePicked(m.mc)} style={{ display: "none" }} />
                                <span style={{ fontSize: 12.5, color: t.hi }}>{m.mc}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => confirmAddPicked(dp.id)} disabled={pickerBusy || pickerChecked.size === 0} className="v2btn-p" style={{ flex: 1, justifyContent: "center" }}>
                            {pickerBusy ? "Menambahkan..." : `Tambahkan${pickerChecked.size > 0 ? ` (${pickerChecked.size})` : ""}`}
                          </button>
                          <button onClick={() => { setPickerOpenFor(null); setPickerChecked(new Set()); setPickerBranch(""); }} className="v2btn-g">Batal</button>
                        </div>
                      </>
                    )
                  )}
                  {!branchChosen && (
                    <button onClick={() => { setPickerOpenFor(null); setPickerChecked(new Set()); setPickerBranch(""); }} className="v2btn-g" style={{ width: "100%", justifyContent: "center" }}>Batal</button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* FIX (permintaan user - "mengapa ada ini" + "perbaiki total UI
            ini"): dulu baris ini cuma teks statis dgn ikon chevron yg
            kelihatan kayak bisa diklik tapi sebenarnya ga ngapa-ngapain -
            bikin bingung. Angka ini MEMANG valid (bukan bug): "Kelola
            Depo" cakupannya 1 PARTNER penuh (semua Area-nya), jadi kalau
            partner itu beroperasi di beberapa Area, District dari Area
            yg BELUM dibikinin Depo tetap keitung "belum masuk Depo
            manapun" meski Area yg lagi aktif di filter atas sudah
            lengkap. Sekarang chevron-nya beneran bisa diklik utk buka
            daftar District-nya per Area, biar langsung kelihatan Area
            mana yg belum ada Depo-nya. */}
        {unassigned.length > 0 && depos?.length > 0 && (
          <div style={{ border: `1px solid ${t.amberBd}`, borderRadius: 8, background: t.amberBg, overflow: "hidden" }}>
            <button
              onClick={() => setUnassignedExpanded((v) => !v)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: t.amber, fontFamily: "inherit", textAlign: "left" }}
            >
              <ChevronDown size={12} style={{ transform: unassignedExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
              {unassigned.length} District (di {unassignedBranches.length} Area) belum masuk Depo manapun.
            </button>
            {unassignedExpanded && (
              <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {unassignedBranches.map((b) => (
                  <div key={b}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{b}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {unassigned.filter((m) => (m.branch || "(Tanpa Area)") === b).map((m) => (
                        <span key={m.mc} style={{ fontSize: 11, fontWeight: 600, color: t.mid, background: t.card, border: `1px solid ${t.line}`, borderRadius: 999, padding: "2px 8px" }}>{m.mc}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
