"use client";
/**
 * /martahub/branches - Kelola Cabang (baru). Sebelumnya mh_branches CUMA
 * dibaca (.select) di seluruh codebase - tidak ada satu pun layar utk
 * menambah/mengubah/menonaktifkan cabang, padahal RPC-nya sudah ada sejak
 * lama (mh_archive_branch/mh_unarchive_branch/mh_delete_branch/
 * mh_branch_usage) tanpa UI yang memanggilnya. mh_create_branch &
 * mh_update_branch baru ditambahkan (migrasi add_mh_create_update_branch)
 * khusus utk halaman ini, karena RLS mh_branches cuma izinkan SELECT -
 * insert/update langsung dari client akan ditolak tanpa RPC.
 *
 * Slug (dipakai mh_assignments.branch_id/mh_sites.branch_id utk mencocokkan
 * orang ke cabang) TIDAK disimpan sbg kolom sendiri - selalu diturunkan on
 * the fly dari `name` lewat toSlug() yang SAMA PERSIS dgn toSlug di
 * planData.js (app/martahub/m/_shared/planData.js) & toBranchSlug di
 * assignments/page.jsx. Jadi admin cukup isi nama cabang dgn benar, slug-nya
 * otomatis konsisten di semua tempat - detail ini sengaja TIDAK ditampilkan
 * di UI (murni detail internal, bukan sesuatu yg perlu dipikirkan admin).
 *
 * "Hapus" cabang via mh_delete_branch MEMBLOKIR keras kalau masih ada
 * aktivitas/micro-cluster terkait (lihat definisi RPC) - makanya aksi utama
 * di sini adalah Arsipkan (soft, mh_archive_branch/mh_unarchive_branch),
 * sama persis filosofi "soft revoke" yang sudah dipakai di User Management.
 * Hapus permanen cuma utk cabang yang baru dibuat & belum pernah dipakai
 * sama sekali (type-to-confirm nama, sesuai syarat p_confirm_name RPC).
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Plus, Pencil, Archive, ArchiveRestore, Trash2, AlertTriangle, Building2, Loader2, X } from "lucide-react";
import MartaShell, { T, FONT } from "../components/MartaShell";
import supabaseMarta from "../../../lib/supabaseMarta";

const REGIONS = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];
const GRAD = "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)";

// SAMA PERSIS dgn toSlug (planData.js) & toBranchSlug (assignments/page.jsx)
// - JANGAN diubah sendiri-sendiri, kalau salah satu berubah ketiganya harus
// ikut berubah supaya pencocokan branch_id (slug) tetap konsisten.
const toSlug = (name) => (name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");

// Format tanggal pendek "dd MMM yyyy" (id-ID) utk badge "Berlaku mulai" -
// effective_from disimpan sbg date polos (yyyy-mm-dd), parse manual (bukan
// `new Date(str)`) spy tidak kena geser timezone browser.
function formatDateID(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
const todayISO = () => new Date().toISOString().slice(0, 10);

const card = { background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13, fontFamily: FONT };
const btn = { padding: "8px 13px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1 };
const pbtn = { ...btn, background: GRAD, color: "#fff", border: "none", padding: "9px 16px" };
const inputStyle = { width: "100%", height: 38, padding: "0 12px", borderRadius: 9, border: `1.5px solid ${T.line}`, fontSize: 13, fontFamily: FONT, color: T.hi, background: "#fff", outline: "none", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: T.mid, display: "block", marginBottom: 5 };

export default function BranchesPage() {
  return (
    <MartaShell active="branches" title="Kelola Cabang" subtitle="Master data cabang (branch) per region - sumber tunggal dipakai User Management, Activity Plan, Map, dst.">
      {(ctx) => <BranchesBody canManage={ctx?.canManage} />}
    </MartaShell>
  );
}

export function BranchesBody({ canManage, period }) {
  // `period` (opsional, Date tgl-1-bulan) dioper dari AssignmentsPage spy
  // satu selector periode dipakai bersama tab Assignment & Cabang. Kalau
  // dipakai berdiri sendiri (route /martahub/branches lama), default ke
  // bulan berjalan - perilaku identik dgn sebelum tab ini disatukan.
  const effPeriod = period || new Date();
  const periodEndISO = new Date(effPeriod.getFullYear(), effPeriod.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [branches, setBranches] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [formState, setFormState] = useState(null); // null | { mode:"add" } | { mode:"edit", row }
  const [usageTarget, setUsageTarget] = useState(null); // row dipilih utk lihat usage/hapus

  const load = useCallback(async () => {
    setErr("");
    try {
      const { data, error } = await supabaseMarta.from("mh_branches").select("id,name,region,active,archived_at,created_at,effective_from").order("region").order("name");
      if (error) throw error;
      setBranches(data || []);
    } catch (e) { setErr(e.message || "Gagal memuat data cabang"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!branches) return [];
    const t = q.trim().toLowerCase();
    return branches.filter((b) => {
      if (!showInactive && !b.active) return false;
      if (regionFilter && b.region !== regionFilter) return false;
      if (t && !(b.name || "").toLowerCase().includes(t)) return false;
      return true;
    });
  }, [branches, q, regionFilter, showInactive]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const b of filtered) {
      if (!map.has(b.region)) map.set(b.region, []);
      map.get(b.region).push(b);
    }
    return REGIONS.filter((r) => map.has(r)).map((r) => ({ region: r, rows: map.get(r) }))
      .concat([...map.keys()].filter((r) => !REGIONS.includes(r)).map((r) => ({ region: r, rows: map.get(r) })));
  }, [filtered]);

  async function toggleActive(row) {
    try {
      if (row.active) await supabaseMarta.rpc("mh_archive_branch", { p_id: row.id });
      else await supabaseMarta.rpc("mh_unarchive_branch", { p_id: row.id });
      await load();
    } catch (e) { setErr(e.message || "Gagal mengubah status cabang"); }
  }

  return (
    <div>
      {err && (
        <div style={{ ...card, marginBottom: 14, borderColor: T.error, background: T.errorBg, color: T.error, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={15} /> {err}
        </div>
      )}

      <div style={{ ...card, marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: T.lo }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau kode cabang…"
            style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} style={{ ...inputStyle, width: 200, flex: "0 0 auto" }}>
          <option value="">Semua Region</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: T.mid, cursor: "pointer", flex: "0 0 auto" }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Tampilkan nonaktif
        </label>
        <div style={{ flex: 1 }} />
        {canManage && (
          <button style={pbtn} onClick={() => setFormState({ mode: "add" })}><Plus size={14} /> Tambah Cabang</button>
        )}
      </div>

      {branches === null ? (
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 8, color: T.mid }}>
          <Loader2 size={15} style={{ animation: "spin 0.8s linear infinite" }} /> Memuat…
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : grouped.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: T.mid, padding: 32 }}>Tidak ada cabang yang cocok.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {grouped.map(({ region, rows }) => (
            <div key={region} style={card}>
              <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: T.mid, marginBottom: 10 }}>
                {region} <span style={{ color: T.lo, fontWeight: 600 }}>· {rows.length} cabang</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {rows.map((b) => (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: `1px solid ${T.line}`, opacity: b.active ? 1 : 0.55 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: T.primaryBg, color: T.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Building2 size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: T.hi, fontSize: 13 }}>
                        {b.name}
                        {!b.active && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: T.mid, background: T.hover, padding: "1px 7px", borderRadius: 999 }}>NONAKTIF</span>}
                        {b.active && b.effective_from && b.effective_from > periodEndISO && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: T.blue, background: T.blueBg, padding: "1px 7px", borderRadius: 999 }}>
                            Belum terlihat di periode ini - berlaku mulai {formatDateID(b.effective_from)}
                          </span>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button style={btn} onClick={() => setFormState({ mode: "edit", row: b })} title="Edit"><Pencil size={13} /></button>
                        <button style={btn} onClick={() => toggleActive(b)} title={b.active ? "Arsipkan" : "Aktifkan kembali"}>
                          {b.active ? <Archive size={13} /> : <ArchiveRestore size={13} />}
                        </button>
                        <button style={{ ...btn, color: T.error }} onClick={() => setUsageTarget(b)} title="Hapus permanen"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {formState && (
        <BranchFormModal
          state={formState}
          onClose={() => setFormState(null)}
          onSaved={async () => { setFormState(null); await load(); }}
        />
      )}
      {usageTarget && (
        <DeleteBranchModal
          row={usageTarget}
          onClose={() => setUsageTarget(null)}
          onDeleted={async () => { setUsageTarget(null); await load(); }}
        />
      )}
    </div>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(13,17,23,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, boxShadow: "0 24px 60px rgba(0,0,0,0.25)", fontFamily: FONT }}>
        {children}
      </div>
    </div>
  );
}

function BranchFormModal({ state, onClose, onSaved }) {
  const editing = state.mode === "edit";
  const row = state.row;
  const [name, setName] = useState(row?.name || "");
  const [region, setRegion] = useState(row?.region || REGIONS[0]);
  const [effectiveFrom, setEffectiveFrom] = useState(row?.effective_from || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    if (!name.trim()) { setErr("Nama cabang wajib diisi."); return; }
    if (!region) { setErr("Region wajib dipilih."); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabaseMarta.rpc("mh_update_branch", { p_id: row.id, p_name: name.trim(), p_region: region, p_effective_from: effectiveFrom || null });
        if (error) throw error;
      } else {
        const { error } = await supabaseMarta.rpc("mh_create_branch", { p_name: name.trim(), p_region: region, p_effective_from: effectiveFrom || null });
        if (error) throw error;
      }
      await onSaved();
    } catch (e) {
      const msg = e.message || "Gagal menyimpan";
      setErr(msg.includes("duplicate key") && msg.includes("name") ? "Sudah ada cabang dengan nama ini." : msg);
    } finally { setSaving(false); }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.hi }}>{editing ? "Edit Cabang" : "Tambah Cabang"}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.mid, display: "flex" }}><X size={18} /></button>
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div style={{ padding: "9px 12px", borderRadius: 9, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600 }}>{err}</div>}
        <div>
          <label style={labelStyle}>Nama Cabang</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Bandar Lampung" style={inputStyle} autoFocus />
        </div>
        <div>
          <label style={labelStyle}>Region</label>
          <select value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle}>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Berlaku Mulai <span style={{ textTransform: "none", fontWeight: 500 }}>(opsional)</span></label>
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} style={inputStyle} />
          <div style={{ marginTop: 5, fontSize: 11, color: T.lo, lineHeight: 1.5 }}>
            Kosongkan jika cabang berlaku langsung. Diisi kalau cabang baru boleh ikut strukturisasi (User Management, laporan)
            mulai bulan tertentu - tidak akan terlihat untuk periode sebelum tanggal ini.
          </div>
        </div>
      </div>
      <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button style={btn} onClick={onClose} disabled={saving}>Batal</button>
        <button style={pbtn} onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : "Simpan"}
        </button>
      </div>
    </Overlay>
  );
}

function DeleteBranchModal({ row, onClose, onDeleted }) {
  const [usage, setUsage] = useState(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let on = true;
    supabaseMarta.rpc("mh_branch_usage", { p_id: row.id }).then(({ data, error }) => {
      if (!on) return;
      if (error) setErr(error.message);
      else setUsage((data || [])[0] || { activities: 0, micro_clusters: 0 });
    });
    return () => { on = false; };
  }, [row.id]);

  const blocked = usage && (Number(usage.activities) > 0 || Number(usage.micro_clusters) > 0);

  async function doDelete() {
    setErr("");
    if (confirmName.trim().toLowerCase() !== row.name.trim().toLowerCase()) {
      setErr("Nama konfirmasi tidak cocok."); return;
    }
    setDeleting(true);
    try {
      const { error } = await supabaseMarta.rpc("mh_delete_branch", { p_id: row.id, p_confirm_name: confirmName.trim() });
      if (error) throw error;
      await onDeleted();
    } catch (e) { setErr(e.message || "Gagal menghapus"); }
    finally { setDeleting(false); }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.error }}>Hapus Cabang Permanen</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.mid, display: "flex" }}><X size={18} /></button>
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        {err && <div style={{ padding: "9px 12px", borderRadius: 9, background: T.errorBg, color: T.error, fontSize: 12.5, fontWeight: 600 }}>{err}</div>}
        {usage === null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.mid, fontSize: 12.5 }}>
            <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Mengecek pemakaian…
          </div>
        ) : blocked ? (
          <div style={{ padding: "11px 13px", borderRadius: 10, background: T.warningBg, color: "#7a5b00", fontSize: 12.5, lineHeight: 1.5 }}>
            Tidak bisa dihapus: cabang <b>{row.name}</b> masih punya <b>{usage.activities}</b> aktivitas dan <b>{usage.micro_clusters}</b> micro-cluster terkait.
            Gunakan tombol <b>Arsipkan</b> di daftar untuk menyembunyikannya tanpa menghapus riwayat.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: T.mid, lineHeight: 1.5 }}>
              Tidak ada aktivitas/micro-cluster terkait - cabang ini aman dihapus permanen. Ketik <b>{row.name}</b> untuk konfirmasi.
            </div>
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={row.name} style={inputStyle} autoFocus />
          </>
        )}
      </div>
      <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button style={btn} onClick={onClose} disabled={deleting}>Batal</button>
        {!blocked && usage !== null && (
          <button style={{ ...pbtn, background: T.error }} onClick={doDelete} disabled={deleting || confirmName.trim().toLowerCase() !== row.name.trim().toLowerCase()}>
            {deleting ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : "Hapus Permanen"}
          </button>
        )}
      </div>
    </Overlay>
  );
}
