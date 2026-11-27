"use client";
// Kelola Depo (Pengeluaran V2) — RESTRUKTUR BESAR (permintaan user -
// "bisa juga kita susun dulu semuanya baru simpan di akhir, buat sangat
// mudah digunakan jadi bisa dibuatkan langsung untuk lebih dari 1 depo
// dan kita mapping dulu semuanya ke masing masing nama depo baru baru
// akhirnya kita simpan ... bisa pindahkan mapping dari depo 1 ke depo
// satunya lagi ... treatment jika datanya sudah berisi namun mc
// dipindah bagaimana, handle dengan sangat baik"):
//
// MODEL "RENCANA DULU, SIMPAN BELAKANGAN": semua perubahan (tambah Depo
// baru - bisa lebih dari 1 sekaligus, pindah-pindah District antar
// Depo, ganti nama Depo, hapus Depo) terjadi di state LOKAL (`draftDepos`
// + `draftAssign`) dulu - TIDAK langsung nulis ke Supabase. Baru begitu
// tombol "Simpan Semua Perubahan" diklik, semua perubahan dikirim ke DB
// sekaligus dalam 1 alur (insert Depo baru dulu -> ganti nama yg
// berubah -> hapus yg ditandai hapus -> upsert/hapus baris
// pnl_v2_depo_mc sesuai selisih mapping). Tombol "Batalkan" mengembalikan
// semuanya ke kondisi tersimpan terakhir tanpa nulis apa pun ke DB.
//
// KEAMANAN DATA (permintaan user eksplisit - "pastikan ini datanya
// tersimpan ... namun saat dikembalikan lagi datanya tetap sangat
// aman"): memindahkan District antar Depo di sini TIDAK PERNAH
// menyentuh data OPEX/SDM/Marketing yg sudah diisi di Form Pengeluaran,
// krn modelnya memang sudah terpisah:
//   - OPEX & SDM level Depo (pnl_pengeluaran_depo_v2) nempel ke
//     `depo_id` si DEPO itu sendiri - independen dari District mana
//     saja yg lagi jadi anggotanya. Pindahin District keluar/masuk Depo
//     TIDAK mengubah/menghapus angka yg sudah diisi di Depo itu.
//   - Marketing Cost/Cost of Money & SDM level District
//     (pnl_pengeluaran_mc_v2) nempel ke kode `mc` District itu sendiri -
//     independen dari Depo mana yg lagi menaunginya. Pindahin 1
//     District ke Depo lain TIDAK mengubah/menghapus angka yg sudah
//     diisi utk District itu - datanya ikut District-nya, bukan ikut
//     Depo-nya.
//   - Hapus Depo yg masih punya data OPEX/SDM tersimpan DITOLAK oleh
//     database (foreign key) - dicegah di level data, bukan cuma UI.
//
// Native HTML5 Drag & Drop, tidak pakai library tambahan.
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, GripVertical, Info, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2, X } from "lucide-react";
import supabase from "../../../lib/supabase";
import { FONT } from "./PNL_V2Shared";

export default function PNL_DepoManager({ t, d, partnerName, depos, depoMcRows, mcList, editable, onChanged, onClose, embedded, contextBranch }) {
  const [newName, setNewName] = useState("");
  const [renameId, setRenameId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // Drag & drop state.
  const [dragMc, setDragMc] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);

  // Depo yg baru ditambahkan ke RENCANA (belum tentu sudah tersimpan) -
  // dipakai utk auto-scroll + highlight sebentar.
  const [freshDepoId, setFreshDepoId] = useState(null);
  const depoCardRefs = useRef({});

  // District yg sudah diseret ke kotak "Tambah Depo" tapi Depo-nya belum
  // ditambahkan ke rencana - Depo baru WAJIB sudah ada minimal 1
  // District di sini dulu sebelum "Tambah ke Rencana" bisa diklik.
  const [newPickerChecked, setNewPickerChecked] = useState(() => new Set());

  // ── RENCANA (draft) lokal - sumber kebenaran utk tampilan, BUKAN
  // props `depos`/`depoMcRows` langsung. Diisi sekali dari props saat
  // komponen pertama kali dibuka (modal ini selalu di-mount ulang tiap
  // dibuka, lihat PNL_FormPengeluaranV2.jsx), dan disinkronkan ulang
  // manual setelah berhasil "Simpan Semua Perubahan". ──
  const buildAssignFromProps = () => {
    const m = {};
    (depoMcRows || []).forEach((r) => { m[r.mc] = r.depo_id; });
    return m;
  };
  const buildDeposFromProps = () => (depos || []).map((dp) => ({ id: dp.id, depo_name: dp.depo_name, isNew: false }));

  const [draftDepos, setDraftDepos] = useState(buildDeposFromProps);
  const [draftAssign, setDraftAssign] = useState(buildAssignFromProps);
  const [pendingDeleteIds, setPendingDeleteIds] = useState(() => new Set());

  // Snapshot "kondisi tersimpan terakhir" - dipakai sbg basis perhitungan
  // selisih (apa aja yg berubah) saat Simpan, dan sbg titik kembali saat
  // Batalkan. Diperbarui lagi setelah Simpan berhasil.
  const originalAssignRef = useRef(buildAssignFromProps());
  const originalNamesRef = useRef(Object.fromEntries((depos || []).map((dp) => [dp.id, dp.depo_name])));

  const dirty = useMemo(() => {
    if (pendingDeleteIds.size > 0) return true;
    if (draftDepos.some((dp) => dp.isNew)) return true;
    if (draftDepos.some((dp) => !dp.isNew && dp.depo_name !== (originalNamesRef.current[dp.id] ?? dp.depo_name))) return true;
    const allMc = new Set([...Object.keys(originalAssignRef.current), ...Object.keys(draftAssign)]);
    for (const mc of allMc) {
      if ((originalAssignRef.current[mc] || null) !== (draftAssign[mc] || null)) return true;
    }
    return false;
  }, [draftDepos, draftAssign, pendingDeleteIds]);

  const changeCounts = useMemo(() => {
    const newDepos = draftDepos.filter((dp) => dp.isNew).length;
    const renamed = draftDepos.filter((dp) => !dp.isNew && dp.depo_name !== (originalNamesRef.current[dp.id] ?? dp.depo_name)).length;
    let moved = 0;
    const allMc = new Set([...Object.keys(originalAssignRef.current), ...Object.keys(draftAssign)]);
    allMc.forEach((mc) => { if ((originalAssignRef.current[mc] || null) !== (draftAssign[mc] || null)) moved += 1; });
    return { newDepos, renamed, moved, deleted: pendingDeleteIds.size };
  }, [draftDepos, draftAssign, pendingDeleteIds]);

  const mcByDepo = useMemo(() => {
    const m = {};
    Object.entries(draftAssign).forEach(([mc, depoId]) => { if (depoId) (m[depoId] ||= []).push(mc); });
    return m;
  }, [draftAssign]);

  const assignedMcSet = useMemo(() => new Set(Object.keys(draftAssign).filter((mc) => draftAssign[mc])), [draftAssign]);
  const mcLabel = (mc) => mcList?.find((m) => m.mc === mc)?.mc || mc;
  const branchOf = (mc) => mcList?.find((m) => m.mc === mc)?.branch || "";

  const depoLockedBranch = useMemo(() => {
    const m = {};
    Object.entries(mcByDepo).forEach(([depoId, mcs]) => {
      m[depoId] = mcs.length > 0 ? (mcList?.find((x) => x.mc === mcs[0])?.branch || "") : null;
    });
    return m;
  }, [mcByDepo, mcList]);

  // District milik Partner ini yg BELUM masuk Depo manapun di RENCANA -
  // discoping ke Area yg lagi aktif di filter atas halaman (contextBranch)
  // kalau ada, krn District Area lain ga mungkin bisa di-drag ke Depo
  // yg sedang dikelola (beda Area).
  const unassigned = useMemo(
    () => (mcList || []).filter((m) => !assignedMcSet.has(m.mc) && (!contextBranch || m.branch === contextBranch)),
    [mcList, assignedMcSet, contextBranch],
  );
  const poolUnassigned = useMemo(() => unassigned.filter((m) => !newPickerChecked.has(m.mc)), [unassigned, newPickerChecked]);

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
  }, [poolUnassigned, contextBranch]);

  useEffect(() => {
    if (!freshDepoId) return;
    let tmr;
    const t0 = setTimeout(() => {
      const stillThere = draftDepos.some((dp) => dp.id === freshDepoId);
      if (!stillThere) { setFreshDepoId(null); return; }
      const el = depoCardRefs.current[freshDepoId];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      tmr = setTimeout(() => setFreshDepoId(null), 4000);
    }, 0);
    return () => { clearTimeout(t0); clearTimeout(tmr); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshDepoId]);

  // ── Semua aksi di bawah ini CUMA mengubah state lokal (draft) -
  // belum ada yg menyentuh Supabase sampai saveAll() dipanggil. ──

  const addDepoDraft = () => {
    const name = newName.trim();
    const mcs = Array.from(newPickerChecked);
    if (!name || mcs.length === 0) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setDraftDepos((prev) => [...prev, { id: tempId, depo_name: name, isNew: true }]);
    setDraftAssign((prev) => { const n = { ...prev }; mcs.forEach((mc) => { n[mc] = tempId; }); return n; });
    setNewName("");
    setNewPickerChecked(new Set());
    setErr("");
    setFreshDepoId(tempId);
  };

  const saveRenameDraft = (id) => {
    const name = renameVal.trim();
    if (!name) { setRenameId(null); return; }
    setDraftDepos((prev) => prev.map((dp) => (dp.id === id ? { ...dp, depo_name: name } : dp)));
    setRenameId(null);
  };

  const deleteDepoDraft = (id, name) => {
    const isNew = draftDepos.find((dp) => dp.id === id)?.isNew;
    if (!window.confirm(`Hapus Depo "${name}" dari rencana? District yang tergabung akan jadi belum terkelompok.${isNew ? "" : " Perubahan ini baru benar-benar terjadi setelah \"Simpan Semua Perubahan\" diklik."}`)) return;
    setDraftDepos((prev) => prev.filter((dp) => dp.id !== id));
    setDraftAssign((prev) => {
      const n = { ...prev };
      Object.keys(n).forEach((mc) => { if (n[mc] === id) delete n[mc]; });
      return n;
    });
    if (!isNew) setPendingDeleteIds((prev) => new Set(prev).add(id));
    if (renameId === id) setRenameId(null);
  };

  const unassignMc = (mc) => {
    setDraftAssign((prev) => { const n = { ...prev }; delete n[mc]; return n; });
  };

  // Pindahkan 1 District (hasil drop) ke Depo tujuan di RENCANA -
  // divalidasi dulu thdp aturan "1 Depo cuma boleh 1 Area" (dicek thdp
  // kondisi Depo tujuan DI DALAM RENCANA, termasuk Depo baru yg belum
  // tersimpan).
  const assignMcToDepo = (mc, depoId) => {
    const locked = depoLockedBranch[depoId];
    const mcBranch = branchOf(mc);
    if (locked && mcBranch && mcBranch !== locked) {
      setErr(`District "${mc}" (Area ${mcBranch}) tidak bisa dipindah ke Depo ini — Depo ini sudah terkunci ke Area "${locked}". 1 Depo cuma boleh berisi District dari 1 Area yang sama.`);
      return;
    }
    setErr("");
    setDraftAssign((prev) => ({ ...prev, [mc]: depoId }));
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
  const removeStagedNew = (mc) => setNewPickerChecked((prev) => { const n = new Set(prev); n.delete(mc); return n; });

  const resetDraft = () => {
    if (dirty && !window.confirm("Batalkan semua perubahan yang belum disimpan dan kembalikan ke kondisi terakhir tersimpan?")) return;
    setDraftDepos(Object.entries(originalNamesRef.current).map(([id, depo_name]) => ({ id, depo_name, isNew: false })));
    setDraftAssign({ ...originalAssignRef.current });
    setPendingDeleteIds(new Set());
    setNewPickerChecked(new Set());
    setRenameId(null);
    setErr("");
  };

  const handleClose = () => {
    if (dirty && !window.confirm("Ada perubahan Kelola Depo yang belum disimpan. Tutup tanpa menyimpan?")) return;
    onClose?.();
  };

  // ── Simpan Semua Perubahan - BARU di sini semuanya benar2 ditulis ke
  // Supabase, dalam 1 alur: insert Depo baru -> rename -> hapus yg
  // ditandai -> upsert/hapus selisih mapping pnl_v2_depo_mc. ──
  const saveAll = async () => {
    if (!dirty) return;
    setSaving(true); setErr("");
    try {
      const idMap = {};
      for (const dp of draftDepos.filter((x) => x.isNew)) {
        const { data, error } = await supabase.from("pnl_v2_depo")
          .insert({ partner_name: partnerName, depo_name: dp.depo_name })
          .select("id").single();
        if (error) throw error;
        idMap[dp.id] = data.id;
      }
      for (const dp of draftDepos.filter((x) => !x.isNew && x.depo_name !== (originalNamesRef.current[x.id] ?? x.depo_name))) {
        const { error } = await supabase.from("pnl_v2_depo").update({ depo_name: dp.depo_name }).eq("id", dp.id);
        if (error) throw error;
      }
      for (const id of pendingDeleteIds) {
        const { error } = await supabase.from("pnl_v2_depo").delete().eq("id", id);
        if (error) {
          if (error.code === "23503") {
            throw new Error("Satu atau lebih Depo yang dihapus di rencana tidak bisa dihapus karena sudah punya data OPEX/SDM tersimpan (ini sengaja dicegah demi keamanan data lama). Batalkan rencana, lalu cukup kosongkan District-nya / ganti namanya saja kalau Depo itu memang mau diganti.");
          }
          throw error;
        }
      }

      const finalAssign = {};
      Object.entries(draftAssign).forEach(([mc, depoId]) => { finalAssign[mc] = idMap[depoId] || depoId; });

      const toUpsert = [];
      const toDelete = [];
      const allMc = new Set([...Object.keys(originalAssignRef.current), ...Object.keys(finalAssign)]);
      allMc.forEach((mc) => {
        const was = originalAssignRef.current[mc] || null;
        const now = finalAssign[mc] || null;
        if (was === now) return;
        if (now) toUpsert.push({ mc, depo_id: now }); else toDelete.push(mc);
      });
      if (toUpsert.length > 0) {
        const { error } = await supabase.from("pnl_v2_depo_mc").upsert(toUpsert, { onConflict: "mc" });
        if (error) throw error;
      }
      for (const mc of toDelete) {
        const { error } = await supabase.from("pnl_v2_depo_mc").delete().eq("mc", mc);
        if (error) throw error;
      }

      // Pindahkan rencana jadi "kondisi tersimpan terakhir" yg baru -
      // tidak menunggu props ter-refresh (timing-nya async), langsung
      // pakai idMap hasil insert di atas supaya tampilan tetap konsisten.
      const newDraftDepos = draftDepos.map((dp) => ({ id: idMap[dp.id] || dp.id, depo_name: dp.depo_name, isNew: false }));
      setDraftDepos(newDraftDepos);
      setDraftAssign(finalAssign);
      originalAssignRef.current = finalAssign;
      originalNamesRef.current = Object.fromEntries(newDraftDepos.map((dp) => [dp.id, dp.depo_name]));
      setPendingDeleteIds(new Set());
      setFreshDepoId(null);
      await onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal menyimpan perubahan Kelola Depo.");
    } finally {
      setSaving(false);
    }
  };

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
        opacity: dragMc === mc ? 0.35 : 1,
        transition: "opacity 0.1s",
      }}
    >
      {variant === "pool" && <GripVertical size={11} color={t.lo} style={{ flexShrink: 0 }} />}
      {mcLabel(mc)}
      {variant === "depo" && editable && (
        <button onClick={() => unassignMc(mc)} title="Lepas dari Depo"
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
            {draftDepos.length} Depo{dirty ? " · ada perubahan belum disimpan" : ""}
          </div>
        </div>
        {!embedded && onClose && (
          <button onClick={handleClose} style={{ width: 34, height: 34, borderRadius: 999, background: t.sub, border: `1px solid ${t.line}`, cursor: "pointer", color: t.mid, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={15} /></button>
        )}
      </div>

      <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
        {err && <div style={{ fontSize: 12, color: t.red, background: t.redBg, border: `1px solid ${t.redBd}`, borderRadius: 8, padding: "8px 12px" }}>{err}</div>}

        {editable && (
          <div style={{ fontSize: 11.5, color: t.mid, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <GripVertical size={14} color={t.lo} style={{ flexShrink: 0 }} />
            Susun dulu sebebas-bebasnya — tambah beberapa Depo, seret District ke Depo yang sesuai, pindahkan antar Depo kapan pun. Baru simpan di akhir lewat tombol &ldquo;Simpan Semua Perubahan&rdquo;.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: 16, alignItems: "start" }}>
          {/* ── KIRI: District yg belum masuk Depo manapun di rencana ── */}
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
              Belum Masuk Depo ({poolUnassigned.length})
            </div>
            {poolUnassigned.length === 0 ? (
              <div style={{ fontSize: 11.5, color: t.lo, padding: "8px 2px" }}>Semua District sudah masuk ke salah satu Depo di rencana.</div>
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
            )}
          </div>

          {/* ── KANAN: slot tiap Depo (+ form tambah Depo baru di atas) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {editable && (
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
                    onKeyDown={(e) => { if (e.key === "Enter" && newName.trim() && newPickerChecked.size > 0) addDepoDraft(); }}
                    placeholder="Nama Depo baru..."
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${t.inputBd}`, background: t.card, color: t.hi, fontSize: 13, fontFamily: "inherit", boxShadow: t.sm }}
                  />
                  <button onClick={addDepoDraft} disabled={!newName.trim() || newPickerChecked.size === 0} className="v2btn-p" style={{ padding: "10px 18px", borderRadius: 10, whiteSpace: "nowrap" }}>
                    <Plus size={14} /> {`Tambah Depo${newPickerChecked.size > 0 ? ` (${newPickerChecked.size})` : ""}`}
                  </button>
                </div>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minHeight: 30 }}>
                  {newPickerChecked.size === 0 ? (
                    <span style={{ fontSize: 11.5, color: t.lo }}>Seret minimal 1 District dari kiri ke sini dulu sebelum menambah Depo ke rencana.</span>
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
            )}

            {draftDepos.length === 0 && (
              <div style={{ border: `1.5px dashed ${t.line}`, borderRadius: 14, padding: "30px 18px", textAlign: "center", color: t.lo, fontSize: 12.5 }}>
                Belum ada Depo di rencana.{editable ? " Tambah Depo baru di atas, lalu seret District dari kiri ke sini." : " Hubungi admin Partner untuk membuat Depo."}
              </div>
            )}

            {draftDepos.map((dp) => {
              const mcs = mcByDepo[dp.id] || [];
              const isFresh = freshDepoId === dp.id;
              const lockedBranch = depoLockedBranch[dp.id];
              const isDropTarget = dragOverTarget === dp.id;
              const willDelete = pendingDeleteIds.has(dp.id);
              return (
                <div
                  key={dp.id}
                  ref={(el) => { depoCardRefs.current[dp.id] = el; }}
                  onDragOver={(e) => { if (!editable) return; e.preventDefault(); setDragOverTarget(dp.id); }}
                  onDragLeave={() => setDragOverTarget((c) => (c === dp.id ? null : c))}
                  onDrop={editable ? (e) => handleDropOnDepo(e, dp.id) : undefined}
                  style={{
                    borderStyle: isDropTarget ? "dashed" : "solid",
                    borderWidth: "1.5px 1.5px 1.5px 4px",
                    borderColor: isDropTarget ? t.blue : (isFresh ? t.greenBd : t.line),
                    borderLeftColor: isFresh ? t.green : (dp.isNew ? t.amber : t.blue),
                    borderLeftStyle: "solid",
                    borderRadius: 14, padding: 16,
                    background: isDropTarget ? t.blueBg : t.card,
                    boxShadow: isFresh ? `0 0 0 3px ${t.greenBg}, ${t.sm}` : t.sm,
                    opacity: willDelete ? 0.5 : 1,
                    transition: "background 0.15s, border-color 0.15s, box-shadow 0.3s, opacity 0.2s",
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
                          onKeyDown={(e) => { if (e.key === "Enter") saveRenameDraft(dp.id); if (e.key === "Escape") setRenameId(null); }}
                          style={{ flex: 1, padding: "6px 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
                        />
                        <button onClick={() => saveRenameDraft(dp.id)} className="v2btn-g" style={{ padding: "5px 10px" }}>OK</button>
                      </>
                    ) : (
                      <>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                            <Building2 size={13} color={t.blue} style={{ flexShrink: 0 }} />
                            <div style={{ fontWeight: 800, fontSize: 14.5, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dp.depo_name}</div>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {dp.isNew && (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 999, padding: "3px 9px" }}>Belum disimpan</span>
                            )}
                            {willDelete && (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: t.red, background: t.redBg, border: `1px solid ${t.redBd}`, borderRadius: 999, padding: "3px 9px" }}>Akan dihapus</span>
                            )}
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
                        {editable && !willDelete && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, alignSelf: "flex-start" }}>
                            <button onClick={() => { setRenameId(dp.id); setRenameVal(dp.depo_name); }} title="Ubah nama" style={{ width: 30, height: 30, background: t.sub, border: `1px solid ${t.line}`, borderRadius: 9, cursor: "pointer", color: t.mid, display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={13} /></button>
                            <button onClick={() => deleteDepoDraft(dp.id, dp.depo_name)} title="Hapus Depo" style={{ width: 30, height: 30, background: t.redBg, border: `1px solid ${t.redBd}`, borderRadius: 9, cursor: "pointer", color: t.red, display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={13} /></button>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {isFresh && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: t.green, marginBottom: 10 }}>
                      <Sparkles size={12} /> Depo baru ditambahkan ke rencana — seret District lain ke sini kalau perlu, lalu simpan di akhir.
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

        {/* ── Footer: Batalkan / Simpan Semua Perubahan - BARU di sini
            semua rencana di atas benar2 ditulis ke database sekaligus. ── */}
        {editable && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingTop: 6, borderTop: `1px solid ${t.line}` }}>
            <div style={{ flex: 1, minWidth: 220, display: "flex", alignItems: "flex-start", gap: 7 }}>
              <Info size={13} color={t.lo} style={{ flexShrink: 0, marginTop: 1.5 }} />
              <span style={{ fontSize: 11, color: t.lo, lineHeight: 1.5 }}>
                Data OPEX/SDM/Marketing yang sudah diisi tetap aman walau District dipindah-pindah Depo di sini — data level Depo tetap menempel ke Depo-nya, data level District tetap menempel ke District-nya.
                {dirty && (
                  <> &nbsp;Belum disimpan: {[
                    changeCounts.newDepos > 0 && `${changeCounts.newDepos} Depo baru`,
                    changeCounts.renamed > 0 && `${changeCounts.renamed} ganti nama`,
                    changeCounts.moved > 0 && `${changeCounts.moved} District dipindah`,
                    changeCounts.deleted > 0 && `${changeCounts.deleted} Depo dihapus`,
                  ].filter(Boolean).join(", ")}.</>
                )}
              </span>
            </div>
            <button onClick={resetDraft} disabled={!dirty || saving} className="v2btn-g" style={{ padding: "9px 14px", borderRadius: 10, opacity: !dirty ? 0.5 : 1 }}>
              <RotateCcw size={13} /> Batalkan
            </button>
            <button onClick={saveAll} disabled={!dirty || saving} className="v2btn-p" style={{ padding: "9px 18px", borderRadius: 10, opacity: !dirty ? 0.6 : 1 }}>
              <Save size={14} /> {saving ? "Menyimpan..." : "Simpan Semua Perubahan"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
