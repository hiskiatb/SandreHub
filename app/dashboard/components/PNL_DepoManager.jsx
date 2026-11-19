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
import { Building2, Check, ChevronDown, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import supabase from "../../../lib/supabase";
import { FONT } from "./PNL_V2Shared";

export default function PNL_DepoManager({ t, d, partnerName, depos, depoMcRows, mcList, editable, onChanged, onClose, embedded, contextBranch }) {
  const [newName, setNewName] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [err, setErr] = useState("");

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
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${t.line}` }}>
        <Building2 size={16} color={t.hi} />
        <div style={{ fontWeight: 800, fontSize: 14, color: t.hi, flex: 1 }}>Kelola Depo</div>
        {!embedded && onClose && (
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: t.lo, padding: 4 }}><X size={16} /></button>
        )}
      </div>

      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div style={{ fontSize: 12, color: t.red, background: t.redBg, border: `1px solid ${t.redBd}`, borderRadius: 8, padding: "8px 12px" }}>{err}</div>}

        {editable && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addDepo(); }}
              placeholder="Nama Depo baru (mis. Depo 1 - Pusat Kota)"
              style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontFamily: "inherit" }}
            />
            <button onClick={addDepo} disabled={savingNew || !newName.trim()} className="v2btn-p" style={{ whiteSpace: "nowrap" }}>
              <Plus size={14} /> {savingNew ? "Menambahkan..." : "Tambahkan Depo"}
            </button>
          </div>
        )}

        {(!depos || depos.length === 0) && (
          <div style={{ fontSize: 12.5, color: t.mid, padding: "6px 2px" }}>
            Belum ada Depo. {editable ? "Tambahkan Depo di atas untuk mulai mengelompokkan District." : "Hubungi admin Partner untuk membuat Depo."}
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
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: t.hi, flex: 1 }}>{dp.depo_name}</div>
                    {lockedBranch && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: t.blue, background: t.blueBg, border: `1px solid ${t.blueBd}`, borderRadius: 999, padding: "2px 8px" }}>
                        Area: {lockedBranch}
                      </span>
                    )}
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, background: t.card, border: `1px solid ${t.line}`, borderRadius: 999, padding: "2px 8px" }}>
                      {mcs.length} District
                    </span>
                    {editable && (
                      <>
                        <button onClick={() => { setRenameId(dp.id); setRenameVal(dp.depo_name); }} title="Ubah nama" style={{ background: "none", border: "none", cursor: "pointer", color: t.mid, padding: 4 }}><Pencil size={13} /></button>
                        <button onClick={() => deleteDepo(dp.id, dp.depo_name)} title="Hapus Depo" style={{ background: "none", border: "none", cursor: "pointer", color: t.red, padding: 4 }}><Trash2 size={13} /></button>
                      </>
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
                      <select
                        value={pickerBranch}
                        onChange={(e) => { setPickerBranch(e.target.value); setPickerChecked(new Set()); }}
                        style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit" }}
                      >
                        <option value="">— Pilih Area —</option>
                        {unassignedBranches.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
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

        {unassigned.length > 0 && depos?.length > 0 && (
          <div style={{ fontSize: 11.5, color: t.amber, display: "flex", alignItems: "center", gap: 6 }}>
            <ChevronDown size={12} /> {unassigned.length} District belum masuk Depo manapun.
          </div>
        )}
      </div>
    </div>
  );
}
