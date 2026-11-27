"use client";
// Kelola Depo (Pengeluaran V2) — permintaan user ("ini harusnya isinya
// area / branch, bukan mc" -> "harusnya tambah DEPO dulu" -> "buat UI UX
// nya bagian ini menjadi sangat sangat bagus" -> "jadi gini drag and
// drop ke slotnya, misal Belum ada Depo di kanan, tambah depo baru,
// maka di kiri ada list MC nya"): sebelum isi OPEX/SDM di Form
// Pengeluaran V2, Partner wajib membuat minimal 1 Depo (grup District/MC
// buatan sendiri, bebas diubah kapan saja - 1 MC cuma boleh masuk 1
// Depo, lihat migration pnl_v2_depo / pnl_v2_depo_mc).
//
// MODEL BARU (drag & drop, menggantikan checkbox-picker lama): layout
// 2 kolom - KIRI daftar District yang BELUM masuk Depo manapun
// (dikelompokkan per Area, berupa kartu yang bisa diseret/draggable),
// KANAN daftar "slot" Depo (termasuk form tambah Depo baru di atasnya -
// Depo baru dibuat KOSONG, District-nya ditambahkan belakangan dengan
// cara diseret). Seret kartu District dari kiri -> jatuhkan ke salah
// satu kartu Depo di kanan utk memasukkannya; seret balik kartu District
// dari dalam Depo -> jatuhkan ke panel kiri utk melepaskannya. Aturan
// "1 Depo cuma boleh 1 Area" tetap berlaku - begitu Depo kedatangan
// District pertama, Area-nya "terkunci"; drop District dari Area lain
// ke Depo yg sudah terkunci akan ditolak dgn pesan error.
// Native HTML5 Drag & Drop (draggable/onDragStart/onDrop) - tidak pakai
// library tambahan, konsisten dgn PNL_SdmLevelConfig.jsx.
//
// Komponen ini dipakai EMBEDDED di dalam PNL_FormPengeluaranV2.jsx (baik
// sbg gate wajib saat belum ada Depo sama sekali, maupun sbg panel
// "Kelola Depo" yg dibuka lewat popup modal).
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, GripVertical, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import supabase from "../../../lib/supabase";
import { FONT } from "./PNL_V2Shared";

export default function PNL_DepoManager({ t, d, partnerName, depos, depoMcRows, mcList, editable, onChanged, onClose, embedded, contextBranch }) {
  const [newName, setNewName] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [err, setErr] = useState("");

  // Drag & drop state: `dragMc` = kode District yg lagi diseret,
  // `dragOverTarget` = id Depo (atau string "unassigned" utk panel kiri)
  // yg lagi di-hover sbg target drop - dipakai utk highlight visual.
  const [dragMc, setDragMc] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [busyMc, setBusyMc] = useState(null);

  // Depo yg baru saja dibuat (utk auto-scroll + highlight sebentar)
  const [freshDepoId, setFreshDepoId] = useState(null);
  const depoCardRefs = useRef({});

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
  // masuk ke Depo itu) - null kalau Depo masih kosong (Area bebas).
  const depoLockedBranch = useMemo(() => {
    const m = {};
    Object.entries(mcByDepo).forEach(([depoId, mcs]) => {
      m[depoId] = mcs.length > 0 ? (mcList?.find((x) => x.mc === mcs[0])?.branch || "") : null;
    });
    return m;
  }, [mcByDepo, mcList]);

  // District yg belum masuk Depo, dikelompokkan per Area - Area yg lagi
  // aktif di filter atas halaman (contextBranch) ditaruh paling atas
  // biar gampang ditemukan.
  const unassignedBranches = useMemo(() => {
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
  }, [unassigned, contextBranch]);

  // Begitu Depo baru muncul di props (setelah onChanged me-reload
  // master), scroll ke kartunya + highlight sebentar, biar user langsung
  // tahu ke mana harus menyeret District.
  useEffect(() => {
    if (!freshDepoId) return;
    let tmr;
    const t0 = setTimeout(() => {
      const stillThere = (depos || []).some((dp) => dp.id === freshDepoId);
      if (!stillThere) { setFreshDepoId(null); return; }
      const el = depoCardRefs.current[freshDepoId];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      tmr = setTimeout(() => setFreshDepoId(null), 4000);
    }, 0);
    return () => { clearTimeout(t0); clearTimeout(tmr); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshDepoId, depos]);

  // BARU: Depo dibuat KOSONG (tanpa wajib pilih District dulu) - District
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
      await onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal menghapus Depo.");
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

  // Pindahkan 1 District ke Depo tujuan (hasil drop) - divalidasi dulu
  // thdp aturan "1 Depo cuma boleh 1 Area": kalau Depo tujuan sudah
  // terkunci ke Area lain, tolak dgn pesan error, jangan dieksekusi.
  const assignMcToDepo = async (mc, depoId) => {
    const locked = depoLockedBranch[depoId];
    const mcBranch = branchOf(mc);
    if (locked && mcBranch && mcBranch !== locked) {
      setErr(`District "${mc}" (Area ${mcBranch}) tidak bisa dipindah ke Depo ini — Depo ini sudah terkunci ke Area "${locked}". 1 Depo cuma boleh berisi District dari 1 Area yang sama.`);
      return;
    }
    setBusyMc(mc); setErr("");
    try {
      const { error } = await supabase.from("pnl_v2_depo_mc").upsert({ mc, depo_id: depoId }, { onConflict: "mc" });
      if (error) throw error;
      await onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal memindahkan District.");
    } finally {
      setBusyMc(null);
    }
  };

  const handleDragStart = (e, mc) => {
    e.dataTransfer.setData("text/plain", mc);
    e.dataTransfer.effectAllowed = "move";
    setDragMc(mc);
  };
  const handleDragEnd = () => { setDragMc(null); setDragOverTarget(null); };
  const handleDropOnDepo = (e, depoId) => {
    e.preventDefault();
    const mc = e.dataTransfer.getData("text/plain") || dragMc;
    setDragOverTarget(null);
    if (mc) assignMcToDepo(mc, depoId);
    setDragMc(null);
  };
  const handleDropOnUnassigned = (e) => {
    e.preventDefault();
    const mc = e.dataTransfer.getData("text/plain") || dragMc;
    setDragOverTarget(null);
    if (mc && assignedMcSet.has(mc)) unassignMc(mc);
    setDragMc(null);
  };

  // Kartu District yg bisa diseret - dipakai di panel kiri (unassigned)
  // maupun di dalam tiap kartu Depo.
  const DragChip = ({ mc, variant }) => (
    <div
      draggable={editable}
      onDragStart={(e) => handleDragStart(e, mc)}
      onDragEnd={handleDragEnd}
      style={{
        display: "inline-flex", alignItems: "center", gap: variant === "pool" ? 5 : 6,
        padding: variant === "pool" ? "5px 10px" : "4px 6px 4px 10px", borderRadius: 999,
        fontSize: 11.5, fontWeight: 700,
        background: variant === "pool" ? t.card : t.sub, color: t.hi,
        border: `1px solid ${t.line}`, boxShadow: variant === "pool" ? t.sm : "none",
        cursor: editable ? "grab" : "default", userSelect: "none",
        opacity: dragMc === mc ? 0.35 : (busyMc === mc ? 0.6 : 1),
        transition: "opacity 0.1s",
      }}
    >
      {variant === "pool" && <GripVertical size={11} color={t.lo} style={{ flexShrink: 0 }} />}
      {mcLabel(mc)}
      {variant === "depo" && editable && (
        <button onClick={() => unassignMc(mc)} disabled={busyMc === mc} title="Lepas dari Depo"
          style={{ width: 16, height: 16, borderRadius: 999, background: t.redBg, border: "none", cursor: "pointer", color: t.red, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <X size={10} />
        </button>
      )}
    </div>
  );

  return (
    <div style={{ fontFamily: FONT, border: `1px solid ${t.line}`, borderRadius: 16, background: t.card, boxShadow: t.sm, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 22px", borderBottom: `1px solid ${t.line}`, background: d ? "linear-gradient(180deg, rgba(237,28,36,0.10), transparent)" : "linear-gradient(180deg, rgba(237,28,36,0.05), transparent)" }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#ED1C24,#C6168D)", color: "#fff", boxShadow: "0 6px 16px rgba(237,28,36,0.35)" }}>
          <Building2 size={21} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: t.hi, letterSpacing: "-0.02em" }}>Kelola Depo</div>
          <div style={{ fontSize: 12, color: t.mid, marginTop: 2, fontWeight: 500 }}>
            {(depos || []).length} Depo terdaftar{unassigned.length > 0 ? ` · ${unassigned.length} District belum masuk Depo` : " · semua District sudah terkelompok"}
          </div>
        </div>
        {!embedded && onClose && (
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 999, background: t.sub, border: `1px solid ${t.line}`, cursor: "pointer", color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={15} /></button>
        )}
      </div>

      <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
        {err && <div style={{ fontSize: 12, color: t.red, background: t.redBg, border: `1px solid ${t.redBd}`, borderRadius: 8, padding: "8px 12px" }}>{err}</div>}

        {editable && (
          <div style={{ fontSize: 11.5, color: t.mid, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <GripVertical size={14} color={t.lo} style={{ flexShrink: 0 }} />
            Seret kartu District dari kiri ke kartu Depo di kanan untuk mengelompokkannya. Seret balik ke kiri untuk melepaskannya.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: 16, alignItems: "start" }}>
          {/* ── KIRI: District yg belum masuk Depo manapun ── */}
          <div
            onDragOver={(e) => { if (!editable) return; e.preventDefault(); setDragOverTarget("unassigned"); }}
            onDragLeave={() => setDragOverTarget((c) => (c === "unassigned" ? null : c))}
            onDrop={editable ? handleDropOnUnassigned : undefined}
            style={{
              border: `1.5px dashed ${dragOverTarget === "unassigned" ? t.blue : t.line}`,
              borderRadius: 14, background: dragOverTarget === "unassigned" ? t.blueBg : t.sub,
              padding: 14, minHeight: 200, maxHeight: 580, overflowY: "auto",
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: t.mid, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
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
            )}
          </div>

          {/* ── KANAN: slot tiap Depo (+ form tambah Depo baru di atas) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {editable && (
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
            )}

            {(!depos || depos.length === 0) && (
              <div style={{ border: `1.5px dashed ${t.line}`, borderRadius: 14, padding: "30px 18px", textAlign: "center", color: t.lo, fontSize: 12.5 }}>
                Belum ada Depo.{editable ? " Buat Depo baru di atas, lalu seret District dari kiri ke sini." : " Hubungi admin Partner untuk membuat Depo."}
              </div>
            )}

            {(depos || []).map((dp) => {
              const mcs = mcByDepo[dp.id] || [];
              const isFresh = freshDepoId === dp.id;
              const lockedBranch = depoLockedBranch[dp.id];
              const isDropTarget = dragOverTarget === dp.id;
              return (
                <div
                  key={dp.id}
                  ref={(el) => { depoCardRefs.current[dp.id] = el; }}
                  onDragOver={(e) => { if (!editable) return; e.preventDefault(); setDragOverTarget(dp.id); }}
                  onDragLeave={() => setDragOverTarget((c) => (c === dp.id ? null : c))}
                  onDrop={editable ? (e) => handleDropOnDepo(e, dp.id) : undefined}
                  style={{
                    border: `1.5px ${isDropTarget ? "dashed" : "solid"} ${isDropTarget ? t.blue : (isFresh ? t.greenBd : t.line)}`,
                    borderLeft: `4px solid ${isFresh ? t.green : t.blue}`,
                    borderRadius: 14, padding: 16,
                    background: isDropTarget ? t.blueBg : t.card,
                    boxShadow: isFresh ? `0 0 0 3px ${t.greenBg}, ${t.sm}` : t.sm,
                    transition: "background 0.15s, border-color 0.15s, box-shadow 0.3s",
                    scrollMarginTop: 24,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    {renameId === dp.id ? (
                      <>
                        <input
                          autoFocus
                          value={renameVal}
                          onChange={(e) => setRenameVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveRename(dp.id); if (e.key === "Escape") setRenameId(null); }}
                          style={{ flex: 1, padding: "6px 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
                        />
                        <button onClick={() => saveRename(dp.id)} className="v2btn-g" style={{ padding: "5px 10px" }}>Simpan</button>
                      </>
                    ) : (
                      <>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                            <Building2 size={13} color={t.blue} style={{ flexShrink: 0 }} />
                            <div style={{ fontWeight: 800, fontSize: 14.5, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dp.depo_name}</div>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {lockedBranch && (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: t.blue, background: t.blueBg, border: `1px solid ${t.blueBd}`, borderRadius: 999, padding: "3px 9px" }}>
                                Area: {lockedBranch}
                              </span>
                            )}
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", background: t.blue, borderRadius: 999, padding: "3px 9px" }}>
                              {mcs.length} District
                            </span>
                          </div>
                        </div>
                        {editable && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, alignSelf: "flex-start" }}>
                            <button onClick={() => { setRenameId(dp.id); setRenameVal(dp.depo_name); }} title="Ubah nama" style={{ width: 30, height: 30, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 9, cursor: "pointer", color: t.mid, display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={13} /></button>
                            <button onClick={() => deleteDepo(dp.id, dp.depo_name)} title="Hapus Depo" style={{ width: 30, height: 30, background: t.redBg, border: `1px solid ${t.redBd}`, borderRadius: 9, cursor: "pointer", color: t.red, display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={13} /></button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {isFresh && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: t.green, marginBottom: 10 }}>
                      <Sparkles size={12} /> Depo baru dibuat — seret District dari kiri ke sini.
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex", flexWrap: "wrap", gap: 6, minHeight: 44,
                      border: `1px dashed ${t.lineH}`, borderRadius: 10, padding: 10,
                      alignItems: mcs.length === 0 ? "center" : "flex-start",
                      justifyContent: mcs.length === 0 ? "center" : "flex-start",
                    }}
                  >
                    {mcs.length === 0 && <span style={{ fontSize: 11.5, color: t.lo }}>Seret District ke sini</span>}
                    {mcs.map((mc) => <DragChip key={mc} mc={mc} variant="depo" />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
