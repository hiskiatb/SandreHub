"use client";
/**
 * /martahub/daily-targets - "Target Harian" (CMS desktop). Breakdown target
 * bulanan per Branch x MC x Kegiatan jadi target HARIAN, mengikuti format
 * kerja tim (Branch | MC | Kegiatan | TGT Bulan | Tgl 1..n | TGT MTD
 * otomatis). Terpisah total dari "Target Aktivitas" (mh_activity_target, di
 * Master Data) - itu target bulanan SP/FWA/Revenue resmi utk Achievement %
 * Dashboard, TIDAK diubah/disentuh oleh fitur ini.
 *
 * Model data:
 *  - mh_daily_target_categories: daftar "Kegiatan" (Event Besar, VA Kecamatan,
 *    dst) - bisa dikelola (tambah/edit/nonaktifkan) dari sini.
 *  - Branch x MC: TIDAK dikelola manual di sini - diambil LANGSUNG dari
 *    Master Data Site (mh_sites_monthly, fallback mh_sites aktif kalau bulan
 *    itu belum pernah diupload) via RPC mh_daily_target_mc_list(p_month),
 *    supaya breakdown MC per branch selalu sesuai data resmi utk bulan yg
 *    dipilih (tidak ada input manual MC yang bisa out-of-sync).
 *  - mh_daily_targets: satu baris per (branch_id, MC, Kegiatan, Bulan) -
 *    target_month + kolom `daily` (jsonb, {"1": 11, "2": 11, ...}) + TGT MTD
 *    dihitung client side (jumlah semua nilai harian yg terisi).
 *
 * Auto-breakdown: begitu TGT Bulan diisi/diubah, sisa hari BELUM TERLEWAT
 * (hari ini s/d akhir bulan) otomatis dibagi rata; hari yg SUDAH TERLEWAT di
 * bulan berjalan dan nilai yg sudah diisi manual TIDAK pernah ditimpa oleh
 * auto-split (jangan rusak yg sudah ada - hari yg lewat tetap diam).
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import MartaShell, { T } from "../components/MartaShell";
import supabaseMarta from "../../../lib/supabaseMarta";

const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function daysInMonth(month) {
  const y = +month.slice(0, 4), m = +month.slice(4, 6);
  return new Date(y, m, 0).getDate();
}
function monthLabel(month) {
  const y = +month.slice(0, 4), m = +month.slice(4, 6);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}
function isTodayOrFuture(month, day) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(+month.slice(0, 4), +month.slice(4, 6) - 1, day);
  return d.getTime() >= now.getTime();
}
function dowOf(month, day) {
  return new Date(+month.slice(0, 4), +month.slice(4, 6) - 1, day).getDay();
}

export default function DailyTargetsPage() {
  return (
    <MartaShell active="daily-targets" title="Target Harian" subtitle="Breakdown target bulanan per Branch x MC x Kegiatan jadi target harian.">
      {(ctx) => <Body email={ctx?.session?.user?.email} canManage={ctx?.canManage} />}
    </MartaShell>
  );
}

function Body({ email, canManage }) {
  const [mcRows, setMcRows] = useState([]); // [{branch_id,branch_name,mc}] - dari Master Data Site, per bulan
  const [cats, setCats] = useState([]); // [{id,name,sort_order,active}]
  const [month, setMonth] = useState(currentYYYYMM());
  const [existing, setExisting] = useState([]); // mh_daily_targets rows for this month
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [rows, setRows] = useState({}); // key(branchId|mc|catId) -> { target_month, daily:{day:val} }
  const [openBranch, setOpenBranch] = useState({}); // branchId -> bool
  const [catModal, setCatModal] = useState(null); // null | {} | {...cat}

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [mc, cc, dt] = await Promise.all([
        supabaseMarta.rpc("mh_daily_target_mc_list", { p_month: month }),
        supabaseMarta.rpc("mh_daily_target_categories_list"),
        supabaseMarta.rpc("mh_daily_targets_list", { p_month: month }),
      ]);
      if (mc.error) throw new Error(mc.error.message);
      setMcRows(mc.data || []);
      setCats((cc.data || []));
      setExisting(dt.data || []);
    } catch (e) { setErr(e.message || "Gagal memuat data"); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const activeCats = useMemo(() => cats.filter((c) => c.active !== false), [cats]);

  // Branch & MC SELALU mengikuti Master Data Site utk bulan yg dipilih
  // (mh_daily_target_mc_list) - tidak ada input manual di sini.
  const branches = useMemo(() => {
    const m = new Map();
    for (const r of mcRows) if (!m.has(r.branch_id)) m.set(r.branch_id, { id: r.branch_id, name: r.branch_name });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [mcRows]);
  const mcsByBranch = useMemo(() => {
    const m = new Map();
    for (const r of mcRows) { if (!m.has(r.branch_id)) m.set(r.branch_id, []); m.get(r.branch_id).push(r.mc); }
    return m;
  }, [mcRows]);

  // Prefill rows dari data tersimpan tiap ganti bulan.
  useEffect(() => {
    const next = {};
    for (const r of existing) {
      next[`${r.branch_id}|${r.mc}|${r.category_id}`] = {
        target_month: r.target_month ?? "",
        daily: { ...(r.daily || {}) },
      };
    }
    setRows(next);
  }, [existing]);

  function rowKey(branchId, mc, catId) { return `${branchId}|${mc}|${catId}`; }
  function getRow(branchId, mc, catId) { return rows[rowKey(branchId, mc, catId)] || { target_month: "", daily: {} }; }

  function setTargetMonth(branchId, mc, catId, value) {
    setRows((prev) => {
      const key = rowKey(branchId, mc, catId);
      const cur = prev[key] || { target_month: "", daily: {} };
      const nd = daysInMonth(month);
      // Auto-split HANYA ke hari ini s/d akhir bulan; hari yg sudah terlewat
      // dan hari yg sudah diisi manual sebelumnya tidak ditimpa.
      const futureDays = [];
      for (let d = 1; d <= nd; d++) if (isTodayOrFuture(month, d)) futureDays.push(d);
      const already = futureDays.filter((d) => cur.daily[String(d)] != null && cur.daily[String(d)] !== "");
      const toFill = futureDays.filter((d) => !already.includes(d));
      const n = Number(value);
      const alreadySum = already.reduce((s, d) => s + (Number(cur.daily[String(d)]) || 0), 0);
      const remaining = Number.isFinite(n) ? Math.max(0, n - alreadySum) : 0;
      const per = toFill.length ? Math.floor(remaining / toFill.length) : 0;
      const rem = toFill.length ? remaining - per * toFill.length : 0;
      const daily = { ...cur.daily };
      toFill.forEach((d, i) => { daily[String(d)] = per + (i < rem ? 1 : 0); });
      return { ...prev, [key]: { target_month: value, daily } };
    });
  }

  function setDay(branchId, mc, catId, day, value) {
    setRows((prev) => {
      const key = rowKey(branchId, mc, catId);
      const cur = prev[key] || { target_month: "", daily: {} };
      return { ...prev, [key]: { ...cur, daily: { ...cur.daily, [String(day)]: value === "" ? "" : Number(value) } } };
    });
  }

  function mtdOf(branchId, mc, catId) {
    const r = getRow(branchId, mc, catId);
    return Object.values(r.daily || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  }

  async function saveAll() {
    setSaving(true); setErr(""); setOk("");
    try {
      const payload = [];
      for (const branch of branches) {
        const list = mcsByBranch.get(branch.id) || [];
        for (const mc of list) {
          for (const cat of activeCats) {
            const key = rowKey(branch.id, mc, cat.id);
            const r = rows[key];
            if (!r || (r.target_month === "" && Object.keys(r.daily || {}).length === 0)) continue;
            const cleanDaily = {};
            for (const [d, v] of Object.entries(r.daily || {})) if (v !== "" && v != null) cleanDaily[d] = Number(v);
            payload.push({
              branch_id: branch.id, branch_name: branch.name, mc,
              category_id: cat.id, category_name: cat.name,
              month, target_month: r.target_month === "" ? null : Number(r.target_month),
              daily: cleanDaily, note: null,
            });
          }
        }
      }
      if (!payload.length) { setOk("Tidak ada perubahan untuk disimpan."); setSaving(false); return; }
      const { error } = await supabaseMarta.rpc("mh_daily_targets_upsert_batch", { p_rows: payload, p_caller_email: email });
      if (error) throw new Error(error.message);
      setOk(`Tersimpan ${payload.length} baris untuk ${monthLabel(month)}.`);
      await load();
    } catch (e) { setErr(e.message || "Gagal menyimpan target harian"); }
    finally { setSaving(false); }
  }

  const nd = daysInMonth(month);
  const days = useMemo(() => Array.from({ length: nd }, (_, i) => i + 1), [nd]);
  const monthInputVal = `${month.slice(0, 4)}-${month.slice(4, 6)}`;

  return (
    <div style={{ maxWidth: "100%", width: "100%" }}>
      {!canManage && <div style={note}>Mode lihat saja - hanya Head TMV / Brand TMV / SPM Sumatera / Admin yang bisa mengubah target harian.</div>}

      <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label>
          <div style={lbl}>Bulan</div>
          <input type="month" value={monthInputVal} onChange={(e) => setMonth(e.target.value.replace("-", ""))} style={{ ...inp, width: 170 }} />
        </label>
        <button onClick={() => setOpenBranch(Object.fromEntries(branches.map((b) => [b.id, true])))} style={sbtn}>Buka Semua Branch</button>
        <button onClick={() => setOpenBranch({})} style={sbtn}>Tutup Semua Branch</button>
        {canManage && (
          <>
            <button onClick={() => setCatModal({})} style={sbtn}><Plus size={13} /> Kegiatan</button>
            <div style={{ flex: 1 }} />
          </>
        )}
      </div>

      {err && <div style={{ ...note, marginBottom: 10, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
      {ok && <div style={{ ...note, marginBottom: 10, background: T.successBg, borderColor: T.success, color: "#155724" }}>{ok}</div>}

      {canManage && cats.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {cats.map((c) => (
            <span key={c.id} onClick={() => setCatModal(c)} style={{ ...pill, opacity: c.active === false ? 0.45 : 1, cursor: "pointer" }}>
              {c.name}{c.active === false ? " (nonaktif)" : ""}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: T.lo }}><Loader2 size={16} className="mh-spin" /> Memuat…</div>
      ) : (
        <div style={{ overflow: "auto", border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 14 }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "max-content", minWidth: "100%" }}>
            <thead>
              <tr style={{ background: "#0D1420" }}>
                <th style={{ ...th, color: "#fff", minWidth: 150 }}>Branch</th>
                <th style={{ ...th, color: "#fff", minWidth: 120 }}>MC</th>
                <th style={{ ...th, color: "#fff", minWidth: 150 }}>Kegiatan</th>
                <th style={{ ...th, color: "#fff", minWidth: 80 }}>TGT Bulan</th>
                {days.map((d) => {
                  const dow = dowOf(month, d);
                  return (
                    <th key={d} style={{ ...th, color: dow === 0 ? "#ff8a8a" : "#fff", minWidth: 46, textAlign: "center" }}>
                      {d}<div style={{ fontSize: 9, fontWeight: 500, opacity: 0.8 }}>{DAY_SHORT[dow]}</div>
                    </th>
                  );
                })}
                <th style={{ ...th, color: "#fff", minWidth: 80, background: "#1A2332" }}>TGT MTD</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((branch) => {
                const list = mcsByBranch.get(branch.id) || [];
                const isOpen = openBranch[branch.id] === true; // default TERTUTUP - grid 34 branch x MC x kegiatan terlalu berat kalau semua kebuka sekaligus
                return (
                  <BranchGroup key={branch.id} branch={branch} list={list} isOpen={isOpen}
                    onToggle={() => setOpenBranch((p) => ({ ...p, [branch.id]: !isOpen }))}>
                    {isOpen && list.length === 0 && (
                      <tr><td colSpan={4 + days.length + 1} style={{ padding: "8px 14px", color: T.lo, fontStyle: "italic" }}>
                        Tidak ada MC untuk branch ini di Master Data Site bulan {monthLabel(month)}.
                      </td></tr>
                    )}
                    {isOpen && list.map((mc) =>
                      activeCats.map((cat, ci) => {
                        const r = getRow(branch.id, mc, cat.id);
                        const mtd = mtdOf(branch.id, mc, cat.id);
                        return (
                          <tr key={`${mc}|${cat.id}`} style={{ borderTop: ci === 0 ? `2px solid ${T.line}` : `1px solid ${T.line}10` }}>
                            {ci === 0 && <td rowSpan={activeCats.length} style={{ ...td, fontWeight: 700, verticalAlign: "top", background: "#FAFBFD" }}>{branch.name}</td>}
                            {ci === 0 && (
                              <td rowSpan={activeCats.length} style={{ ...td, fontWeight: 700, verticalAlign: "top", background: "#FAFBFD" }}>
                                {mc}
                              </td>
                            )}
                            <td style={{ ...td, color: T.mid }}>{cat.name}</td>
                            <td style={{ ...td, padding: "3px 4px" }}>
                              <input disabled={!canManage} type="number" value={r.target_month} onChange={(e) => setTargetMonth(branch.id, mc, cat.id, e.target.value)}
                                style={{ ...cellInp, fontWeight: 700 }} placeholder="-" />
                            </td>
                            {days.map((d) => {
                              const dow = dowOf(month, d);
                              const past = !isTodayOrFuture(month, d);
                              return (
                                <td key={d} style={{ ...td, padding: "3px 2px", background: dow === 0 ? "#FFF3F3" : past ? "#FAFAFA" : undefined }}>
                                  <input disabled={!canManage} type="number" value={r.daily?.[String(d)] ?? ""} onChange={(e) => setDay(branch.id, mc, cat.id, d, e.target.value)}
                                    style={{ ...cellInp, color: dow === 0 ? "#c0392b" : T.hi, textAlign: "center" }} placeholder="-" />
                                </td>
                              );
                            })}
                            <td style={{ ...td, fontWeight: 700, textAlign: "center", background: "#F7F9FC" }}>{mtd || "-"}</td>
                          </tr>
                        );
                      })
                    )}
                  </BranchGroup>
                );
              })}
              {!branches.length && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: T.lo }}>Tidak ada branch di Master Data Site untuk bulan ini.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <button onClick={saveAll} disabled={saving || loading} style={pbtn}>
          {saving ? "Menyimpan…" : "Simpan Semua Target Harian"}
        </button>
      )}

      {catModal && <CategoryModal cat={catModal} email={email} onClose={() => setCatModal(null)} onSaved={() => { setCatModal(null); load(); }} />}
    </div>
  );
}

function BranchGroup({ branch, list, isOpen, onToggle, children }) {
  return (
    <>
      <tr style={{ background: "#EEF1F6" }}>
        <td colSpan={99} style={{ padding: "6px 14px", cursor: "pointer", fontWeight: 800, fontSize: 12, color: T.hi }} onClick={onToggle}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {branch.name} <span style={{ fontWeight: 500, color: T.lo }}>({list.length} MC)</span>
          </span>
        </td>
      </tr>
      {children}
    </>
  );
}

function CategoryModal({ cat, email, onClose, onSaved }) {
  const isNew = !cat.id;
  const [name, setName] = useState(cat.name || "");
  const [active, setActive] = useState(cat.active !== false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!name.trim()) { setErr("Nama kegiatan wajib diisi"); return; }
    setSaving(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_daily_target_categories_upsert", {
        p_id: cat.id || null, p_name: name.trim(), p_sort_order: cat.sort_order ?? 0, p_active: active, p_caller_email: email,
      });
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e) { setErr(e.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!confirm(`Hapus kegiatan "${cat.name}"? Semua target harian untuk kegiatan ini juga akan terhapus.`)) return;
    setSaving(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_daily_target_categories_delete", { p_id: cat.id, p_caller_email: email });
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e) { setErr(e.message || "Gagal menghapus"); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={isNew ? "Tambah Kegiatan" : "Edit Kegiatan"} onClose={onClose}>
      {err && <div style={{ ...note, marginBottom: 10, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
      <label style={{ display: "block", marginBottom: 10 }}>
        <div style={lbl}>Nama Kegiatan</div>
        <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="mis. Event Besar" />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 12.5 }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Aktif (muncul di grid Target Harian)
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        {!isNew ? <button onClick={remove} disabled={saving} style={{ ...sbtn, color: T.error, borderColor: T.error }}><Trash2 size={12} /> Hapus</button> : <span />}
        <button onClick={save} disabled={saving} style={pbtn}>{saving ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "4vh 20px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 22, width: 420, maxWidth: "94vw" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: "auto", color: T.mid }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const lbl = { fontSize: 11, fontWeight: 700, color: T.hi, marginBottom: 4 };
const note = { background: "#FFFDE7", border: `1px solid #F0E3B0`, color: "#7a5b00", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5, marginBottom: 14 };
const inp = { padding: "8px 11px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, outline: "none", boxSizing: "border-box", width: "100%" };
const cellInp = { width: 42, padding: "5px 3px", borderRadius: 6, border: `1px solid ${T.line}`, background: "#fff", fontSize: 11, outline: "none", boxSizing: "border-box" };
const th = { padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: 10.5, position: "sticky", top: 0 };
const td = { padding: "6px 10px", fontSize: 11.5 };
const pill = { display: "inline-block", padding: "4px 10px", borderRadius: 999, background: "#F1F2F5", color: T.hi, fontSize: 11, fontWeight: 600 };
const btnBase = { display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${T.line}`, borderRadius: 9, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer", background: "#fff", color: T.hi };
const sbtn = { ...btnBase };
const pbtn = { ...btnBase, background: "linear-gradient(135deg,#E30613,#B9050F)", color: "#fff", border: "none", padding: "9px 16px" };
