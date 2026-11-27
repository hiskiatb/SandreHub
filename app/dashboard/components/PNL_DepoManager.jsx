"use client";
// Kelola Depo (Pengeluaran V2) — model "RENCANA DULU, SIMPAN BELAKANGAN":
// semua perubahan (tambah Depo baru - bisa lebih dari 1 sekaligus, pindah-
// pindah District antar Depo, ganti nama, hapus) terjadi di state LOKAL
// (`draftDepos` + `draftAssign`) dulu - baru ditulis ke Supabase sekaligus
// saat tombol "Simpan Semua Perubahan" diklik. Tombol "Batalkan"
// mengembalikan ke kondisi tersimpan terakhir tanpa efek apa pun.
//
// BARU (permintaan user - "buat nama depo dan kolom mc tempat kita drag
// mc/district nya itu dalam satu container, dan tombol tambah depo itu
// gunanya untuk menambahkan depo selain yang satu ini"): tidak ada lagi
// kotak "staging" terpisah di atas sebelum Depo-nya benar2 "ada". Begitu
// dibuka, langsung tersedia 1 kartu Depo kosong siap pakai (kalau memang
// belum ada Depo sama sekali) - nama & kolom drop District-nya jadi SATU
// kartu yg sama persis dgn kartu Depo yg sudah tersimpan. Tombol
// "+ Tambah Depo" cuma menambah SATU kartu kosong lagi (utk Depo lain di
// luar yg sudah ada), kapan pun dibutuhkan, bisa dipanggil berkali-kali.
// Kartu kosong yg sama sekali belum disentuh (nama kosong & 0 District)
// diabaikan diam-diam saat Simpan - cuma dianggap error kalau SALAH SATU
// dari nama/District-nya sudah diisi tapi yang lain belum (lihat saveAll).
//
// KEAMANAN DATA: memindahkan District antar Depo di sini TIDAK PERNAH
// menyentuh data OPEX/SDM/Marketing yg sudah diisi, krn modelnya memang
// sudah terpisah - OPEX/SDM level Depo nempel ke `depo_id`-nya sendiri
// (independen dari District mana saja anggotanya), Marketing/Cost of
// Money & SDM level District nempel ke kode `mc`-nya sendiri (independen
// dari Depo mana yg menaunginya). Hapus Depo yg masih punya data OPEX/SDM
// tersimpan DITOLAK oleh database (foreign key) - dicegah di level data.
//
// Native HTML5 Drag & Drop, tidak pakai library tambahan.
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, GripVertical, Info, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2, X } from "lucide-react";
import supabase from "../../../lib/supabase";
import { FONT } from "./PNL_V2Shared";

export default function PNL_DepoManager({ t, d, partnerName, depos, depoMcRows, mcList, editable, onChanged, onClose, embedded, contextBranch }) {
  const [renameId, setRenameId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [dragMc, setDragMc] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);

  const [freshDepoId, setFreshDepoId] = useState(null);
  const depoCardRefs = useRef({});

  // "" = Semua Area (tampilkan District dari SEMUA Area milik Partner
  // ini sekaligus, dikelompokkan per Area) - default ikut Area yg lagi
  // aktif di filter halaman supaya tetap familiar, tapi user bebas ganti.
  const [areaFilter, setAreaFilter] = useState(contextBranch || "");
  // FIX (bug report user - "saat saya pilih di atas meulaboh yang bawah
  // bisa bandar lampung"): `useState(contextBranch || "")` CUMA jadi
  // nilai awal sekali pas komponen pertama kali dirender - kalau
  // Partner/Area di filter ATAS halaman diganti setelahnya (component
  // ini tidak remount, cuma re-render dgn props baru), areaFilter TIDAK
  // ikut sinkron dan nyisain pilihan Area dari Partner/Area SEBELUMNYA,
  // bahkan yg sudah sama sekali ga relevan (beda Partner). Fix: sinkron
  // ulang areaFilter ke contextBranch setiap kali Partner atau Area aktif
  // di filter atas berubah - dropdown di bawah tetap bisa diganti bebas
  // ke Area lain / "Semua Area" setelahnya, cuma DEFAULT-nya yg dijamin
  // selalu benar & ikut konteks yg aktif.
  useEffect(() => {
    // setTimeout(...,0) drpd panggil setAreaFilter langsung - supaya
    // TIDAK dianggap "setState sinkron dalam effect" oleh lint
    // react-hooks/set-state-in-effect (pola sama spt loadConfig di
    // PNL_SdmLevelConfig.jsx).
    const timer = setTimeout(() => { setAreaFilter(contextBranch || ""); }, 0);
    return () => clearTimeout(timer);
  }, [contextBranch, partnerName]);
  const allAreas = useMemo(() => {
    const seen = new Set();
    const list = [];
    (mcList || []).forEach((m) => {
      const b = m.branch || "";
      if (!b || seen.has(b)) return;
      seen.add(b);
      list.push(b);
    });
    list.sort((a, b) => a.localeCompare(b));
    return list;
  }, [mcList]);

  const makeBlankDraft = () => ({ id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, depo_name: "", isNew: true });

  const buildAssignFromProps = () => {
    const m = {};
    (depoMcRows || []).forEach((r) => { m[r.mc] = r.depo_id; });
    return m;
  };
  const buildDeposFromProps = () => (depos || []).map((dp) => ({ id: dp.id, depo_name: dp.depo_name, isNew: false }));

  // ── RENCANA (draft) lokal - sumber kebenaran utk tampilan. Kalau
  // Partner ini belum punya Depo sama sekali, langsung diisi 1 kartu
  // kosong siap pakai - user ga perlu klik apa pun dulu utk mulai. ──
  const [draftDepos, setDraftDepos] = useState(() => {
    const base = buildDeposFromProps();
    return base.length === 0 ? [makeBlankDraft()] : base;
  });
  const [draftAssign, setDraftAssign] = useState(buildAssignFromProps);
  const [pendingDeleteIds, setPendingDeleteIds] = useState(() => new Set());

  // Snapshot "kondisi tersimpan terakhir" - basis selisih saat Simpan,
  // dan titik kembali saat Batalkan. Diperbarui lagi setelah Simpan sukses.
  const [originalAssign, setOriginalAssign] = useState(buildAssignFromProps);
  const [originalNames, setOriginalNames] = useState(() => Object.fromEntries((depos || []).map((dp) => [dp.id, dp.depo_name])));

  const mcByDepo = useMemo(() => {
    const m = {};
    Object.entries(draftAssign).forEach(([mc, depoId]) => { if (depoId) (m[depoId] ||= []).push(mc); });
    return m;
  }, [draftAssign]);

  // Kartu baru dianggap "bermakna" (ikut dihitung dirty/disimpan) kalau
  // minimal salah satu dari nama atau District-nya sudah diisi - kartu
  // kosong total yg belum disentuh dianggap belum ada apa-apanya.
  const isMeaningfulNew = (dp) => dp.isNew && (dp.depo_name.trim() !== "" || (mcByDepo[dp.id] || []).length > 0);

  const dirty = useMemo(() => {
    if (pendingDeleteIds.size > 0) return true;
    if (draftDepos.some(isMeaningfulNew)) return true;
    if (draftDepos.some((dp) => !dp.isNew && dp.depo_name !== (originalNames[dp.id] ?? dp.depo_name))) return true;
    const allMc = new Set([...Object.keys(originalAssign), ...Object.keys(draftAssign)]);
    for (const mc of allMc) {
      if ((originalAssign[mc] || null) !== (draftAssign[mc] || null)) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftDepos, draftAssign, pendingDeleteIds, originalAssign, originalNames, mcByDepo]);

  const changeCounts = useMemo(() => {
    const newDepos = draftDepos.filter(isMeaningfulNew).length;
    const renamed = draftDepos.filter((dp) => !dp.isNew && dp.depo_name !== (originalNames[dp.id] ?? dp.depo_name)).length;
    let moved = 0;
    const allMc = new Set([...Object.keys(originalAssign), ...Object.keys(draftAssign)]);
    allMc.forEach((mc) => { if ((originalAssign[mc] || null) !== (draftAssign[mc] || null)) moved += 1; });
    return { newDepos, renamed, moved, deleted: pendingDeleteIds.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftDepos, draftAssign, pendingDeleteIds, originalAssign, originalNames, mcByDepo]);

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

  const unassigned = useMemo(
    () => (mcList || []).filter((m) => !assignedMcSet.has(m.mc) && (!areaFilter || m.branch === areaFilter)),
    [mcList, assignedMcSet, areaFilter],
  );

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
    if (areaFilter && list.includes(areaFilter)) {
      return [areaFilter, ...list.filter((b) => b !== areaFilter)];
    }
    return list;
  }, [unassigned, areaFilter]);

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

  // BARU: tombol "+ Tambah Depo" cuma menambah 1 kartu kosong lagi -
  // bukan Depo yg sedang dilihat ("depo ini"), tapi Depo TAMBAHAN.
  const addBlankDepoDraft = () => {
    const blank = makeBlankDraft();
    setDraftDepos((prev) => [...prev, blank]);
    setFreshDepoId(blank.id);
  };

  // Nama Depo baru diedit LANGSUNG di kartunya (live, tanpa tombol
  // konfirmasi terpisah) - selalu dipaksa UPPERCASE begitu diketik.
  const updateDraftDepoName = (id, name) => {
    setDraftDepos((prev) => prev.map((dp) => (dp.id === id ? { ...dp, depo_name: name.toUpperCase() } : dp)));
  };

  const saveRenameDraft = (id) => {
    const name = renameVal.trim().toUpperCase();
    if (!name) { setRenameId(null); return; }
    setDraftDepos((prev) => prev.map((dp) => (dp.id === id ? { ...dp, depo_name: name } : dp)));
    setRenameId(null);
  };

  const deleteDepoDraft = (id, name) => {
    const dpRef = draftDepos.find((dp) => dp.id === id);
    const isNew = dpRef?.isNew;
    // Kartu baru yg masih kosong total boleh dihapus tanpa konfirmasi -
    // belum ada apa pun yg bakal hilang.
    const needsConfirm = !isNew || isMeaningfulNew(dpRef);
    if (needsConfirm && !window.confirm(`Hapus Depo "${name || "(belum diberi nama)"}" dari rencana? District yang tergabung akan jadi belum terkelompok.${isNew ? "" : " Perubahan ini baru benar-benar terjadi setelah \"Simpan Semua Perubahan\" diklik."}`)) return;
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

  // Jaring pengaman: native HTML5 drag kadang ga sempat memicu "dragend"
  // di elemen sumbernya kalau elemen itu keburu pindah container pas
  // drop (umum terjadi di sini) - `mouseup` di window SELALU kepicu
  // begitu tombol mouse dilepas, jadi lebih bisa diandalkan.
  useEffect(() => {
    const clearDragState = () => { setDragMc(null); setDragOverTarget(null); };
    window.addEventListener("mouseup", clearDragState);
    window.addEventListener("dragend", clearDragState);
    window.addEventListener("drop", clearDragState);
    return () => {
      window.removeEventListener("mouseup", clearDragState);
      window.removeEventListener("dragend", clearDragState);
      window.removeEventListener("drop", clearDragState);
    };
  }, []);

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

  const resetDraft = () => {
    if (dirty && !window.confirm("Batalkan semua perubahan yang belum disimpan dan kembalikan ke kondisi terakhir tersimpan?")) return;
    const base = Object.entries(originalNames).map(([id, depo_name]) => ({ id, depo_name, isNew: false }));
    setDraftDepos(base.length === 0 ? [makeBlankDraft()] : base);
    setDraftAssign({ ...originalAssign });
    setPendingDeleteIds(new Set());
    setRenameId(null);
    setErr("");
  };

  const handleClose = () => {
    if (dirty && !window.confirm("Ada perubahan Kelola Depo yang belum disimpan. Tutup tanpa menyimpan?")) return;
    onClose?.();
  };

  // ── Simpan Semua Perubahan - di sini semuanya benar2 ditulis ke
  // Supabase, dalam 1 alur: insert Depo baru -> rename -> hapus yg
  // ditandai -> upsert/hapus selisih mapping pnl_v2_depo_mc. ──
  const saveAll = async () => {
    if (!dirty) return;

    // Validasi kelengkapan Depo baru: kartu kosong total (nama kosong &
    // 0 District) diabaikan diam2 - belum pernah "dipakai" sama sekali.
    // Tapi kalau SALAH SATU sudah diisi, keduanya WAJIB lengkap (aturan
    // "minimum 1 District utk 1 Depo baru").
    const incomplete = [];
    const newDeposToCreate = [];
    draftDepos.filter((dp) => dp.isNew).forEach((dp) => {
      const name = dp.depo_name.trim();
      const mcs = mcByDepo[dp.id] || [];
      if (!name && mcs.length === 0) return;
      if (!name) { incomplete.push(`Depo baru dengan ${mcs.length} District belum diberi nama`); return; }
      if (mcs.length === 0) { incomplete.push(`Depo "${name}" belum punya District (minimal 1)`); return; }
      newDeposToCreate.push(dp);
    });
    if (incomplete.length > 0) {
      setErr(`Lengkapi dulu sebelum menyimpan: ${incomplete.join("; ")}.`);
      return;
    }

    setSaving(true); setErr("");
    try {
      const idMap = {};
      for (const dp of newDeposToCreate) {
        const { data, error } = await supabase.from("pnl_v2_depo")
          .insert({ partner_name: partnerName, depo_name: dp.depo_name.trim() })
          .select("id").single();
        if (error) throw error;
        idMap[dp.id] = data.id;
      }
      for (const dp of draftDepos.filter((x) => !x.isNew && x.depo_name !== (originalNames[x.id] ?? x.depo_name))) {
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
      const allMc = new Set([...Object.keys(originalAssign), ...Object.keys(finalAssign)]);
      allMc.forEach((mc) => {
        const was = originalAssign[mc] || null;
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

      // Pindahkan rencana jadi "kondisi tersimpan terakhir" yg baru,
      // langsung pakai idMap hasil insert di atas (ga perlu nunggu props
      // ter-refresh dulu, timing-nya async). Kartu baru yg ga pernah
      // ikut dibuat (masih benar2 kosong) dibuang dari tampilan di sini.
      const newDraftDepos = draftDepos
        .filter((dp) => !dp.isNew || newDeposToCreate.includes(dp))
        .map((dp) => ({ id: idMap[dp.id] || dp.id, depo_name: dp.depo_name.trim(), isNew: false }));
      setDraftDepos(newDraftDepos.length > 0 ? newDraftDepos : [makeBlankDraft()]);
      setDraftAssign(finalAssign);
      setOriginalAssign(finalAssign);
      setOriginalNames(Object.fromEntries(newDraftDepos.map((dp) => [dp.id, dp.depo_name])));
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
          <div style={{ fontSize: 12, color: t.mid, marginTop: 4, fontWeight: 500 }}>
            {draftDepos.filter((dp) => !dp.isNew || isMeaningfulNew(dp)).length} Depo{dirty ? " · ada perubahan belum disimpan" : ""}
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
            Isi nama Depo langsung di kartunya, lalu seret District dari kiri ke kolom bawahnya. Pindahkan antar Depo kapan pun. Baru simpan di akhir lewat tombol &ldquo;Simpan Semua Perubahan&rdquo;.
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
              Belum Masuk Depo{areaFilter ? ` · ${areaFilter}` : " · Semua Area"} ({unassigned.length})
            </div>
            {unassigned.length === 0 ? (
              <div style={{ fontSize: 11.5, color: t.lo, padding: "8px 2px" }}>
                Semua District{areaFilter ? ` di Area ${areaFilter}` : ""} sudah masuk ke salah satu Depo di rencana.
              </div>
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

          {/* ── KANAN: 1 kartu per Depo - nama & kolom drop District jadi
              1 container yg sama (baik Depo baru maupun yg sudah ada).
              Tombol "+ Tambah Depo" cuma menambah 1 kartu kosong lagi. ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(allAreas.length > 0 || editable) && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 2 }}>
                {allAreas.length > 0 && (
                  <div style={{ position: "relative", display: "inline-flex" }}>
                    <select
                      value={areaFilter}
                      onChange={(e) => setAreaFilter(e.target.value)}
                      title="Pilih Area yang ditampilkan di kolom &ldquo;Belum Masuk Depo&rdquo;"
                      style={{
                        appearance: "none", WebkitAppearance: "none",
                        fontSize: 11.5, fontWeight: 700, color: t.hi, background: t.card,
                        border: `1px solid ${t.inputBd}`, borderRadius: 10, padding: "9px 30px 9px 14px",
                        cursor: "pointer", fontFamily: "inherit", boxShadow: t.sm,
                      }}
                    >
                      <option value="">Semua Area</option>
                      {allAreas.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <div style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: t.lo, pointerEvents: "none", display: "flex" }}>
                      <ChevronDown size={13} />
                    </div>
                  </div>
                )}
                {editable && (
                  <button onClick={addBlankDepoDraft} className="v2btn-g" style={{ padding: "9px 16px", borderRadius: 10 }}>
                    <Plus size={14} /> Tambah Depo
                  </button>
                )}
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
                    borderTopWidth: "1.5px",
                    borderRightWidth: "1.5px",
                    borderBottomWidth: "1.5px",
                    borderLeftWidth: "4px",
                    borderTopStyle: isDropTarget ? "dashed" : "solid",
                    borderRightStyle: isDropTarget ? "dashed" : "solid",
                    borderBottomStyle: isDropTarget ? "dashed" : "solid",
                    borderLeftStyle: "solid",
                    borderTopColor: isDropTarget ? t.blue : (isFresh ? t.greenBd : t.line),
                    borderRightColor: isDropTarget ? t.blue : (isFresh ? t.greenBd : t.line),
                    borderBottomColor: isDropTarget ? t.blue : (isFresh ? t.greenBd : t.line),
                    borderLeftColor: isFresh ? t.green : (dp.isNew ? t.amber : t.blue),
                    borderRadius: 14, padding: 16,
                    background: isDropTarget ? t.blueBg : t.card,
                    boxShadow: isFresh ? `0 0 0 3px ${t.greenBg}, ${t.sm}` : t.sm,
                    opacity: willDelete ? 0.5 : 1,
                    transition: "background 0.15s, border-color 0.15s, box-shadow 0.3s, opacity 0.2s",
                    scrollMarginTop: 24,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    {dp.isNew ? (
                      // Depo baru: nama diedit LANGSUNG di sini (live),
                      // ga ada mode "tampil vs edit" terpisah spt Depo
                      // yg sudah tersimpan - belum ada apa pun yg perlu
                      // "dikonfirmasi" selama belum Simpan.
                      <>
                        <Building2 size={14} color={t.amber} style={{ flexShrink: 0 }} />
                        <input
                          value={dp.depo_name}
                          onChange={(e) => updateDraftDepoName(dp.id, e.target.value)}
                          placeholder="Nama Depo baru..."
                          style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 14, fontWeight: 800, fontFamily: "inherit", textTransform: "uppercase" }}
                        />
                        <button onClick={() => deleteDepoDraft(dp.id, dp.depo_name)} title="Buang kartu Depo ini" style={{ width: 30, height: 30, background: t.redBg, border: `1px solid ${t.redBd}`, borderRadius: 9, cursor: "pointer", color: t.red, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Trash2 size={13} /></button>
                      </>
                    ) : renameId === dp.id ? (
                      <>
                        <input
                          autoFocus
                          value={renameVal}
                          onChange={(e) => setRenameVal(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveRenameDraft(dp.id); if (e.key === "Escape") setRenameId(null); }}
                          style={{ flex: 1, padding: "6px 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.hi, fontSize: 13, fontWeight: 700, fontFamily: "inherit", textTransform: "uppercase" }}
                        />
                        <button onClick={() => saveRenameDraft(dp.id)} className="v2btn-g" style={{ padding: "5px 10px" }}>OK</button>
                      </>
                    ) : (
                      <>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                            <Building2 size={13} color={t.blue} style={{ flexShrink: 0 }} />
                            <div style={{ fontWeight: 800, fontSize: 14.5, color: t.hi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "uppercase" }}>{dp.depo_name}</div>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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

                  {isFresh && isMeaningfulNew(dp) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: t.green, marginBottom: 10 }}>
                      <Sparkles size={12} /> Depo baru ditambahkan ke rencana — lengkapi nama & District-nya, lalu simpan di akhir.
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

        {/* ── Footer: Batalkan / Simpan Semua Perubahan ── */}
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
