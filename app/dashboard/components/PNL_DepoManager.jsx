"use client";
// Kelola Depo (Pengeluaran V2) — permintaan user ("ini harusnya isinya
// area / branch, bukan mc" -> lalu "harusnya tambah DEPO dulu"): sebelum
// isi OPEX/SDM di Form Pengeluaran V2, Partner wajib membuat minimal 1
// Depo (grup District/MC buatan sendiri, bebas diubah kapan saja - 1 MC
// cuma boleh masuk 1 Depo, lihat migration pnl_v2_depo / pnl_v2_depo_mc).
// Komponen ini dipakai EMBEDDED di dalam PNL_FormPengeluaranV2.jsx (baik
// sbg gate wajib saat belum ada Depo sama sekali, maupun sbg panel
// "Kelola Depo" yang bisa dibuka kapan saja).
import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import supabase from "../../../lib/supabase";
import { FONT } from "./PNL_V2Shared";

export default function PNL_DepoManager({ t, d, partnerName, depos, depoMcRows, mcList, editable, onChanged, onClose, embedded }) {
  const [newName, setNewName] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [busyMc, setBusyMc] = useState(null);
  const [err, setErr] = useState("");

  const mcByDepo = useMemo(() => {
    const m = {};
    (depoMcRows || []).forEach((r) => { (m[r.depo_id] ||= []).push(r.mc); });
    return m;
  }, [depoMcRows]);

  const assignedMcSet = useMemo(() => new Set((depoMcRows || []).map((r) => r.mc)), [depoMcRows]);
  const unassigned = useMemo(() => (mcList || []).filter((m) => !assignedMcSet.has(m.mc)), [mcList, assignedMcSet]);

  const addDepo = async () => {
    const name = newName.trim();
    if (!name) return;
    setSavingNew(true); setErr("");
    try {
      const { error } = await supabase.from("pnl_v2_depo").insert({ partner_name: partnerName, depo_name: name });
      if (error) throw error;
      setNewName("");
      await onChanged?.();
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
    if (!window.confirm(`Hapus Depo "${name}"? MC yang tergabung akan jadi belum terkelompok.`)) return;
    setErr("");
    try {
      const { error } = await supabase.from("pnl_v2_depo").delete().eq("id", id);
      if (error) throw error;
      await onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal menghapus Depo.");
    }
  };

  const assignMc = async (mc, depoId) => {
    setBusyMc(mc); setErr("");
    try {
      const { error } = await supabase.from("pnl_v2_depo_mc").upsert({ mc, depo_id: depoId }, { onConflict: "mc" });
      if (error) throw error;
      await onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal mengatur MC ke Depo.");
    } finally {
      setBusyMc(null);
    }
  };

  const unassignMc = async (mc) => {
    setBusyMc(mc); setErr("");
    try {
      const { error } = await supabase.from("pnl_v2_depo_mc").delete().eq("mc", mc);
      if (error) throw error;
      await onChanged?.();
    } catch (e) {
      setErr(e.message || "Gagal melepas MC dari Depo.");
    } finally {
      setBusyMc(null);
    }
  };

  const mcLabel = (mc) => mcList?.find((m) => m.mc === mc)?.branch || mc;

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
              <Plus size={14} /> Tambahkan Depo
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
          return (
            <div key={dp.id} style={{ border: `1px solid ${t.lineH}`, borderRadius: 10, padding: 14, background: t.sub }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
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
                    {editable && (
                      <>
                        <button onClick={() => { setRenameId(dp.id); setRenameVal(dp.depo_name); }} title="Ubah nama" style={{ background: "none", border: "none", cursor: "pointer", color: t.mid, padding: 4 }}><Pencil size={13} /></button>
                        <button onClick={() => deleteDepo(dp.id, dp.depo_name)} title="Hapus Depo" style={{ background: "none", border: "none", cursor: "pointer", color: t.red, padding: 4 }}><Trash2 size={13} /></button>
                      </>
                    )}
                  </>
                )}
              </div>

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

              {editable && unassigned.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) assignMc(e.target.value, dp.id); }}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: `1px solid ${t.inputBd}`, background: t.inputBg, color: t.mid, fontSize: 12, fontFamily: "inherit" }}
                >
                  <option value="">+ Tambahkan District ke Depo ini...</option>
                  {unassigned.map((m) => <option key={m.mc} value={m.mc}>{m.branch ? `${m.branch} (${m.mc})` : m.mc}</option>)}
                </select>
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
