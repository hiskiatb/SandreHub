"use client";
// Menu "POSMAT Stock" (§7, §9) - kelola master jenis material, kuota stok
// bulanan per MD (carry-over tanpa batas), dan Target Terpasang (KPI per
// branch×brand). Web-only (dikonfirmasi §7: form web biasa) - pemakaian
// stok oleh MD sendiri (mengurangi saldo) adalah bagian MD Activities,
// Fase 5, BELUM dibangun di sini.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Package, Boxes, Target, ArrowLeft, Plus, Pencil, ShieldCheck, CheckCircle2, AlertTriangle, HelpCircle, PlayCircle, RefreshCw, Lock } from "lucide-react";
import MartaShell, { T } from "../components/MartaShell";
import { FolderConnectPanel } from "../components/FolderConnect";
import supabaseMarta from "../../../lib/supabaseMarta";
import { getMartaScope } from "../../../lib/martaScope";
import { readWorkbook, deriveTable } from "../../../lib/martaSiteImport";
import { useFolderConnection } from "../../../lib/useFolderConnection";

const VALIDITY_EXT = /\.(xlsx|xls|csv)$/i;

const CAN_MANAGE_ROLES = ["head", "tmv", "spm_sumatera", "admin"];
const VALIDITY_PURPOSE = "validity_msisdn";

const _norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function guessCol(columns, guesses) {
  for (const g of guesses) {
    const ng = _norm(g);
    const hit = columns.find((c) => _norm(c) === ng);
    if (hit) return hit;
  }
  for (const g of guesses) {
    const ng = _norm(g);
    if (ng.length < 3) continue;
    const hit = columns.find((c) => _norm(c).includes(ng));
    if (hit) return hit;
  }
  return "";
}
const brandLabel = (b) => (b === "tri" ? "3ID" : b === "im3" ? "IM3" : String(b || "-").toUpperCase());

export default function PosmatStockPage() {
  return (
    <MartaShell active="posmat" title="POSM Stock" subtitle="Jenis material, kuota stok per MD, dan Target Terpasang (§7).">
      {(ctx) => <Body email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

function Body({ email }) {
  const [scope, setScope] = useState(null);
  const [active, setActive] = useState(null); // null | 'types' | 'stock' | 'target' | 'validity'

  useEffect(() => { if (email) getMartaScope(email).then(setScope); }, [email]);
  const canManage = CAN_MANAGE_ROLES.includes(scope?.role);

  if (active === "types") return (<div><BackBtn onClick={() => setActive(null)} />
    <TypesView email={email} canManage={canManage} /></div>);
  if (active === "stock") return (<div><BackBtn onClick={() => setActive(null)} />
    <StockView email={email} canManage={canManage} scope={scope} /></div>);
  if (active === "target") return (<div><BackBtn onClick={() => setActive(null)} />
    <TargetView email={email} canManage={canManage} scope={scope} /></div>);
  if (active === "validity") return (<div><BackBtn onClick={() => setActive(null)} />
    <ValidityView email={email} canManage={canManage} scope={scope} /></div>);

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.hi, marginBottom: 3 }}>Pilih menu</div>
      <div style={{ fontSize: 13, color: T.mid, marginBottom: 18 }}>Pengelolaan material POSM, target pemasangan, dan Validity MSISDN.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <MenuCard icon={Package} label="Jenis Material" desc="Master jenis POSM - reusable (last-used) atau consumable (sekali pakai), satuan unit."
          onClick={() => setActive("types")} />
        <MenuCard icon={Boxes} label="Stok & Mutasi" desc="Tetapkan/top-up kuota bulanan per MD × jenis material, lihat saldo berjalan (carry-over tanpa batas)."
          onClick={() => setActive("stock")} />
        <MenuCard icon={Target} label="Target Terpasang" desc="KPI jumlah pemasangan per branch × brand per periode - terpisah dari kuota stok fisik."
          onClick={() => setActive("target")} />
        <MenuCard icon={ShieldCheck} label="Validity" desc="Cocokkan MSISDN yang disubmit di Activity Report terhadap data tervalidasi (raw lokal, §9.3)."
          onClick={() => setActive("validity")} />
      </div>
      {!canManage && scope && (
        <div style={{ ...note, marginTop: 16 }}>Mode lihat saja - hanya Head TMV, Brand TMV, atau SPM Sumatera yang dapat mengubah data di sini.</div>
      )}
    </div>
  );
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.mid, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16 }}>
      <ArrowLeft size={15} /> Kembali ke POSM Stock
    </button>
  );
}

function MenuCard({ icon: Icon, label, desc, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...card, cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 14, borderColor: hover ? "#D8DEE8" : T.line, boxShadow: hover ? "0 6px 18px rgba(0,0,0,.07)" : "none", transform: hover ? "translateY(-1px)" : "none", transition: "all .15s" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: "#FFF0F0", border: "1px solid #F6D9D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={20} color={T.primary} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.hi, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12.5, color: T.mid, lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. JENIS MATERIAL
// ═══════════════════════════════════════════════════════════════════════════
function TypesView({ email, canManage }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null=tutup, {}=baru, {...}=edit
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseMarta.rpc("mh_posmat_list_types");
    if (!error) setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.hi }}>Jenis Material</div>
        {canManage && <button onClick={() => setEditing({})} style={{ ...pbtn, marginLeft: "auto" }}><Plus size={15} /> Tambah</button>}
      </div>
      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: "#F7F9FC", color: T.mid }}>
            {["Nama", "Kategori", "Sifat Stok", "Satuan", "Status", ""].map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.lo }}>Belum ada jenis material.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                <td style={{ padding: "8px 12px", fontWeight: 700, color: T.hi }}>{r.name}</td>
                <td style={{ padding: "8px 12px", color: T.mid }}>{r.category || "-"}</td>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{ ...pill, color: r.stock_mode === "reusable" ? T.blue : T.primary, background: r.stock_mode === "reusable" ? T.blueBg : "#FFF0F0" }}>
                    {r.stock_mode === "reusable" ? "Reusable" : "Consumable"}
                  </span>
                </td>
                <td style={{ padding: "8px 12px", color: T.mid }}>{r.unit}</td>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{ ...pill, color: r.active ? T.success : T.lo, background: r.active ? T.successBg : "#F1F2F5" }}>{r.active ? "Aktif" : "Nonaktif"}</span>
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right" }}>
                  {canManage && <button onClick={() => setEditing(r)} style={iconBtn}><Pencil size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <TypeModal row={editing} email={email} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} onError={setErr} />
      )}
    </div>
  );
}

function TypeModal({ row, email, onClose, onSaved, onError }) {
  const isNew = !row.id;
  const [name, setName] = useState(row.name || "");
  const [category, setCategory] = useState(row.category || "");
  const [stockMode, setStockMode] = useState(row.stock_mode || "consumable");
  const [unit, setUnit] = useState(row.unit || "pcs");
  const [activeFlag, setActiveFlag] = useState(row.active ?? true);
  const [saving, setSaving] = useState(false);
  const canSave = name.trim() && !saving;

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabaseMarta.rpc("mh_posmat_upsert_type", {
        p_id: row.id || null, p_name: name.trim(), p_category: category.trim() || null,
        p_stock_mode: stockMode, p_unit: unit.trim() || "pcs", p_active: activeFlag, p_caller_email: email,
      });
      if (error) throw error;
      onSaved();
    } catch (e) { onError(e.message || "Gagal menyimpan"); onClose(); }
    finally { setSaving(false); }
  }

  return (
    <Modal onClose={onClose} title={isNew ? "Tambah Jenis Material" : "Edit Jenis Material"}>
      <Field label="Nama *"><input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Mis. Neon Box" /></Field>
      <Field label="Kategori"><input value={category} onChange={(e) => setCategory(e.target.value)} style={inp} placeholder="Mis. Branding" /></Field>
      <Field label="Sifat Stok">
        <select value={stockMode} onChange={(e) => setStockMode(e.target.value)} style={selectStyle}>
          <option value="consumable">Consumable (sekali pakai)</option>
          <option value="reusable">Reusable (berpindah, last-used)</option>
        </select>
      </Field>
      <Field label="Satuan"><input value={unit} onChange={(e) => setUnit(e.target.value)} style={inp} placeholder="pcs / set / roll" /></Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.mid, marginTop: 4 }}>
        <input type="checkbox" checked={activeFlag} onChange={(e) => setActiveFlag(e.target.checked)} /> Aktif (muncul di daftar pilihan MD)
      </label>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={btn}>Batal</button>
        <button onClick={save} disabled={!canSave} style={{ ...pbtn, ...(!canSave ? disabledPbtn : {}) }}>{saving ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  2. STOK & MUTASI
// ═══════════════════════════════════════════════════════════════════════════
// ✅ Stok jadi shared pool per Branch×Brand (bukan lagi per-MD individu) -
// sebelum ini top-up CUMA bisa ditarget ke assignment ber-role 'md', jadi
// BME/RGE/role lain TIDAK PERNAH bisa punya saldo sama sekali (akar masalah
// "BME tidak bisa isi POSMAT"). Sekarang siapa pun di branch×brand yg sama
// berbagi 1 pool, sejalan dgn Target Terpasang yg SUDAH branch×brand sejak
// awal.
function StockView({ email, canManage, scope }) {
  const [types, setTypes] = useState([]);
  const [combos, setCombos] = useState([]);
  const [overview, setOverview] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ branchId: "", brand: "", typeId: "", month: currentYYYYMM(), amount: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // Scope caller (Head TMV -> region sendiri, Brand TMV -> region+brand
  // sendiri) - SAMA PERSIS pola di assignments/page.jsx. SPM Sumatera/admin
  // unscoped (null = bebas milih branch manapun).
  const lockedRegion = scope && (scope.role === "head" || scope.role === "tmv") ? scope.region : null;
  const lockedBrand = scope && scope.role === "tmv" ? scope.brand : null;
  useEffect(() => {
    if (lockedBrand) setForm((f) => (f.brand ? f : { ...f, brand: lockedBrand }));
  }, [lockedBrand]);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, bb, o] = await Promise.all([
      supabaseMarta.rpc("mh_posmat_list_types"),
      supabaseMarta.rpc("mh_branch_brand_list"),
      supabaseMarta.rpc("mh_posmat_stock_overview"),
    ]);
    setTypes((t.data || []).filter((x) => x.active));
    setCombos(bb.data || []);
    setOverview(o.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const branchOptions = useMemo(() => {
    const seen = new Map();
    for (const c of combos) {
      if (!c.branch_id) continue;
      if (lockedRegion && c.region !== lockedRegion) continue;
      if (lockedBrand && c.brand !== lockedBrand) continue;
      if (!seen.has(c.branch_id)) seen.set(c.branch_id, c.branch);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [combos, lockedRegion, lockedBrand]);

  const canSubmit = form.branchId && form.brand && form.typeId && form.month && Number(form.amount) !== 0 && !Number.isNaN(Number(form.amount)) && !saving;

  async function submit() {
    setSaving(true); setErr(""); setOk("");
    try {
      const { error } = await supabaseMarta.rpc("mh_posmat_set_monthly_stock", {
        p_branch_id: form.branchId, p_brand: form.brand, p_posmat_type_id: form.typeId, p_month: form.month,
        p_amount: Number(form.amount), p_note: form.note.trim() || null, p_caller_email: email,
      });
      if (error) throw error;
      setOk("Top-up stok tersimpan.");
      setForm((f) => ({ ...f, amount: "", note: "" }));
      load();
    } catch (e) { setErr(e.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.hi, marginBottom: 3 }}>Stok & Mutasi</div>
      <div style={{ fontSize: 13, color: T.mid, marginBottom: 14 }}>Saldo milik BRANCH × BRAND (dibagikan bersama semua orang di sana, bukan per-individu) - bersifat carry-over tanpa batas, top-up menambah saldo berjalan, tidak mereset tiap bulan.</div>
      {lockedRegion && (
        <div style={{ ...note, marginBottom: 14 }}>Daftar branch dibatasi ke region <b>{lockedRegion}</b>{lockedBrand ? ` · brand ${brandLabel(lockedBrand)}` : ""} sesuai scope akun kamu.</div>
      )}

      {canManage && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Top-up Kuota</div>
          {err && <div style={{ ...note, marginBottom: 10, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
          {ok && <div style={{ ...note, marginBottom: 10, background: T.successBg, borderColor: T.success, color: "#155724" }}>{ok}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 10 }}>
            <Field label="Branch">
              <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))} style={selectStyle}>
                <option value="">- pilih branch -</option>
                {branchOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
            <Field label="Brand">
              {lockedBrand ? (
                <div style={{ ...inp, background: T.sub || "#F7F9FC", color: T.mid, cursor: "not-allowed", display: "flex", alignItems: "center", gap: 6 }}>
                  {brandLabel(lockedBrand)} <Lock size={12} />
                </div>
              ) : (
                <select value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} style={selectStyle}>
                  <option value="">- pilih brand -</option>
                  <option value="im3">IM3</option>
                  <option value="tri">3ID</option>
                </select>
              )}
            </Field>
            <Field label="Jenis Material">
              <select value={form.typeId} onChange={(e) => setForm((f) => ({ ...f, typeId: e.target.value }))} style={selectStyle}>
                <option value="">- pilih jenis -</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.unit})</option>)}
              </select>
            </Field>
            <Field label="Bulan"><input type="month" value={monthInputValue(form.month)} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value.replace("-", "") }))} style={inp} /></Field>
            <Field label="Jumlah (+/-)"><input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} style={inp} placeholder="Mis. 50" /></Field>
          </div>
          <Field label="Catatan"><input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} style={{ ...inp, marginTop: 6 }} placeholder="Opsional" /></Field>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={submit} disabled={!canSubmit} style={{ ...pbtn, ...(!canSubmit ? disabledPbtn : {}) }}>{saving ? "Menyimpan…" : "Simpan Top-up"}</button>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.line}`, fontWeight: 800, fontSize: 14 }}>Saldo Berjalan per Branch × Brand × Jenis Material</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: "#F7F9FC", color: T.mid }}>
            {["Branch", "Brand", "Jenis Material", "Top-up", "Terpakai", "Saldo"].map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
            {!loading && overview.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.lo }}>Belum ada stok tercatat.</td></tr>}
            {overview.map((r, i) => (
              <tr key={`${r.branch_id}-${r.brand}-${r.posmat_type_id}-${i}`} style={{ borderTop: `1px solid ${T.line}` }}>
                <td style={{ padding: "8px 12px", fontWeight: 700, color: T.hi }}>{r.branch_name || r.branch_id}</td>
                <td style={{ padding: "8px 12px", color: T.mid }}>{brandLabel(r.brand)}</td>
                <td style={{ padding: "8px 12px", color: T.mid }}>{r.type_name}</td>
                <td style={{ padding: "8px 12px", color: T.mid }}>{Number(r.total_topup).toLocaleString()} {r.unit}</td>
                <td style={{ padding: "8px 12px", color: T.mid }}>{Number(r.total_consumed).toLocaleString()} {r.unit}</td>
                <td style={{ padding: "8px 12px", fontWeight: 800, color: Number(r.balance) > 0 ? T.success : T.error }}>{Number(r.balance).toLocaleString()} {r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  3. TARGET TERPASANG
// ═══════════════════════════════════════════════════════════════════════════
function TargetView({ email, canManage, scope }) {
  const [combos, setCombos] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ branchId: "", brand: "", month: currentYYYYMM(), qty: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const lockedRegion = scope && (scope.role === "head" || scope.role === "tmv") ? scope.region : null;
  const lockedBrand = scope && scope.role === "tmv" ? scope.brand : null;
  useEffect(() => {
    if (lockedBrand) setForm((f) => (f.brand ? f : { ...f, brand: lockedBrand }));
  }, [lockedBrand]);

  const load = useCallback(async () => {
    setLoading(true);
    const [bb, tg] = await Promise.all([
      supabaseMarta.rpc("mh_branch_brand_list"),
      supabaseMarta.rpc("mh_posmat_list_targets"),
    ]);
    setCombos(bb.data || []);
    setTargets(tg.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const branchOptions = useMemo(() => {
    const seen = new Map();
    for (const c of combos) {
      if (!c.branch_id) continue;
      if (lockedRegion && c.region !== lockedRegion) continue;
      if (lockedBrand && c.brand !== lockedBrand) continue;
      if (!seen.has(c.branch_id)) seen.set(c.branch_id, c.branch);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [combos, lockedRegion, lockedBrand]);

  const canSubmit = form.branchId && form.brand && form.month && form.qty !== "" && !Number.isNaN(Number(form.qty)) && !saving;

  async function submit() {
    setSaving(true); setErr(""); setOk("");
    try {
      const branchName = branchOptions.find(([id]) => id === form.branchId)?.[1] || null;
      const { error } = await supabaseMarta.rpc("mh_posmat_set_target", {
        p_branch_id: form.branchId, p_branch_name: branchName, p_brand: form.brand, p_month: form.month,
        p_target_qty: Number(form.qty), p_note: form.note.trim() || null, p_caller_email: email,
      });
      if (error) throw error;
      setOk("Target tersimpan.");
      load();
    } catch (e) { setErr(e.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.hi, marginBottom: 3 }}>Target Terpasang</div>
      <div style={{ fontSize: 13, color: T.mid, marginBottom: 14 }}>KPI jumlah pemasangan per branch × brand per periode - terpisah dari saldo stok fisik.</div>
      {lockedRegion && (
        <div style={{ ...note, marginBottom: 14 }}>Daftar branch dibatasi ke region <b>{lockedRegion}</b>{lockedBrand ? ` · brand ${brandLabel(lockedBrand)}` : ""} sesuai scope akun kamu.</div>
      )}

      {canManage && (
        <div style={{ ...card, marginBottom: 14 }}>
          {err && <div style={{ ...note, marginBottom: 10, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
          {ok && <div style={{ ...note, marginBottom: 10, background: T.successBg, borderColor: T.success, color: "#155724" }}>{ok}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 10 }}>
            <Field label="Branch">
              <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))} style={selectStyle}>
                <option value="">- pilih branch -</option>
                {branchOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </Field>
            <Field label="Brand">
              {lockedBrand ? (
                <div style={{ ...inp, background: T.sub || "#F7F9FC", color: T.mid, cursor: "not-allowed", display: "flex", alignItems: "center", gap: 6 }}>
                  {brandLabel(lockedBrand)} <Lock size={12} />
                </div>
              ) : (
                <select value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} style={selectStyle}>
                  <option value="">- pilih brand -</option>
                  <option value="im3">IM3</option>
                  <option value="tri">3ID</option>
                </select>
              )}
            </Field>
            <Field label="Bulan"><input type="month" value={monthInputValue(form.month)} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value.replace("-", "") }))} style={inp} /></Field>
            <Field label="Target (jumlah)"><input type="number" min="0" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} style={inp} /></Field>
          </div>
          <Field label="Catatan"><input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} style={{ ...inp, marginTop: 6 }} placeholder="Opsional" /></Field>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={submit} disabled={!canSubmit} style={{ ...pbtn, ...(!canSubmit ? disabledPbtn : {}) }}>{saving ? "Menyimpan…" : "Simpan Target"}</button>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: "#F7F9FC", color: T.mid }}>
            {["Branch", "Brand", "Bulan", "Target", "Tercapai", "Diubah oleh"].map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
            {!loading && targets.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.lo }}>Belum ada target diset.</td></tr>}
            {targets.map((r) => {
              const achieved = Number(r.achieved_qty || 0);
              const met = r.target_qty > 0 && achieved >= r.target_qty;
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: T.hi }}>{r.branch_name || r.branch_id}</td>
                  <td style={{ padding: "8px 12px", color: T.mid }}>{brandLabel(r.brand)}</td>
                  <td style={{ padding: "8px 12px", color: T.mid }}>{monthLabel(r.month)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, color: T.hi }}>{r.target_qty}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 800, color: met ? T.success : T.mid }}>{achieved}{r.target_qty > 0 ? ` (${Math.round((achieved / r.target_qty) * 100)}%)` : ""}</td>
                  <td style={{ padding: "8px 12px", color: T.mid }}>{r.updated_by_name || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  4. VALIDITY MSISDN (§9.3) - cocokkan MSISDN yang disubmit di Activity
//  Report (DSF Sales Entry, §4.2 poin 7) terhadap file raw tervalidasi
//  (MSISDN/org_id) yang dipegang Head TMV/Brand TMV/SPM Sumatera secara
//  LOKAL - berkas mentah TIDAK PERNAH terkirim ke server (§0.2/§9.1), pola
//  IDENTIK dengan "Validasi Lokasi" (Fase 3): <input type=file> biasa,
//  metadata pemetaan kolom diingat via mh_local_folder_links (purpose
//  berbeda: 'validity_msisdn'). MSISDN adalah kunci pencocokan UTAMA;
//  org_id dicek sebagai atribut terpisah (§9.3) - kalau raw punya org_id
//  beda dari yang disubmit, hasilnya 'org_mismatch' + matched_org_id
//  (nilai yang seharusnya), BUKAN auto-correct (user/atasan yang koreksi
//  manual, keputusan spec eksplisit).
// ═══════════════════════════════════════════════════════════════════════════
function ValidityView({ email, canManage, scope }) {
  const [savedMapping, setSavedMapping] = useState(null);

  const [file, setFile] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState({ msisdn: "", org_id: "" });
  const [readErr, setReadErr] = useState("");
  const [savingMap, setSavingMap] = useState(false);

  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  // "Hubungkan Folder" - HANYA referensi folder yang diingat (IndexedDB
  // perangkat ini), isi file selalu dibaca ulang dari disk (§0.2).
  const folderSource = useFolderConnection(VALIDITY_PURPOSE, VALIDITY_EXT, onFile);

  const load = useCallback(async () => {
    if (!email) return;
    const { data: link } = await supabaseMarta.rpc("mh_get_folder_link", { p_purpose: VALIDITY_PURPOSE, p_caller_email: email });
    if (link && link.fileName) {
      setSavedMapping(link);
      if (link.columnMapping) setMapping((m) => ({ ...m, ...link.columnMapping }));
    }
    setLoadingRows(true);
    try {
      const { data, error } = await supabaseMarta.rpc("mh_msisdn_list_pending_reconcile");
      if (error) throw new Error(error.message);
      setRows(data || []);
    } catch (e) { setErr(e.message || "Gagal memuat data MSISDN"); }
    finally { setLoadingRows(false); }
  }, [email]);
  useEffect(() => { load(); }, [load]);

  async function onFile(f) {
    setFile(f); setMatrix(null); setReadErr(""); setHeaderIdx(0); setResult(null);
    if (!f) return;
    try {
      const parsed = await readWorkbook(f);
      setMatrix(parsed.matrix);
    } catch (e) { setReadErr(e.message || "Gagal membaca berkas."); }
  }

  const table = useMemo(() => (matrix ? deriveTable(matrix, headerIdx) : null), [matrix, headerIdx]);
  useEffect(() => {
    if (!table) return;
    setMapping((m) => ({
      msisdn: m.msisdn || guessCol(table.displayColumns, ["msisdn", "nomor", "no hp", "phone"]),
      org_id: m.org_id || guessCol(table.displayColumns, ["org id", "org_id", "id dsf", "dsf id"]),
    }));
  }, [table]);

  // Referensi msisdn -> org_id dari berkas raw yang sedang dimuat sesi ini.
  const referenceMap = useMemo(() => {
    if (!table || !mapping.msisdn) return null;
    const m = new Map();
    for (const r of table.rows) {
      const msisdn = String(r[mapping.msisdn] ?? "").trim();
      const orgId = mapping.org_id ? String(r[mapping.org_id] ?? "").trim() || null : null;
      if (msisdn) m.set(msisdn, orgId);
    }
    return m;
  }, [table, mapping]);

  async function saveMapping() {
    if (!file || !mapping.msisdn) return;
    setSavingMap(true);
    try {
      await supabaseMarta.rpc("mh_save_folder_link", {
        p_purpose: VALIDITY_PURPOSE, p_folder_name: null, p_file_name: file.name,
        p_column_mapping: mapping, p_caller_email: email,
      });
      setSavedMapping({ fileName: file.name, columnMapping: mapping, updatedAt: new Date().toISOString() });
    } catch (e) { setErr(e.message || "Gagal menyimpan mapping"); }
    finally { setSavingMap(false); }
  }

  // ── Pratinjau: 3 kemungkinan hasil (§9.3) - tidak ditemukan / valid / org_mismatch.
  const preview = useMemo(() => {
    if (!referenceMap) return [];
    return rows.map((r) => {
      const submitted = String(r.msisdn ?? "").trim();
      if (!referenceMap.has(submitted)) {
        return { ...r, newStatus: "not_found", matchedOrgId: null };
      }
      const rawOrgId = referenceMap.get(submitted);
      const same = String(rawOrgId || "").trim().toLowerCase() === String(r.org_id || "").trim().toLowerCase();
      return { ...r, newStatus: same ? "valid" : "org_mismatch", matchedOrgId: same ? null : rawOrgId };
    });
  }, [rows, referenceMap]);

  async function runReconcile() {
    if (!preview.length) return;
    setRunning(true); setErr(""); setResult(null);
    try {
      const payload = preview.map((p) => ({
        entry_id: p.id,
        status: p.newStatus,
        matched_org_id: p.matchedOrgId,
        note: p.newStatus === "org_mismatch" ? `org_id seharusnya: ${p.matchedOrgId}` : null,
      }));
      const { data, error } = await supabaseMarta.rpc("mh_msisdn_reconcile_batch", { p_results: payload, p_caller_email: email });
      if (error) throw new Error(error.message);
      const valid = preview.filter((p) => p.newStatus === "valid").length;
      const notFound = preview.filter((p) => p.newStatus === "not_found").length;
      setResult({ total: data ?? payload.length, valid, notFound, mismatch: payload.length - valid - notFound });
      await load();
    } catch (e) { setErr(e.message || "Gagal menjalankan rekonsiliasi"); }
    finally { setRunning(false); }
  }

  if (!canManage && scope) {
    return (
      <div style={note}>
        Sub-menu ini khusus Head TMV, Brand TMV, atau SPM Sumatera - role Anda saat ini ({scope.role || "tidak terdaftar"}) tidak memiliki akses menjalankan rekonsiliasi Validity.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1040 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.hi, marginBottom: -6 }}>Validity - Rekonsiliasi MSISDN</div>
      <div style={{ ...card, background: "linear-gradient(135deg,#FFF5F7,#FFFFFF)", borderColor: T.primaryBd }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <HelpCircle size={18} color={T.primaryD} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: T.mid, lineHeight: 1.6 }}>
            <b style={{ color: T.hi }}>§9.3:</b> mencocokkan MSISDN yang disubmit di Activity Report terhadap berkas raw tervalidasi (MSISDN + org_id) yang Anda muat dari berkas lokal - berkas ini TIDAK PERNAH terkirim ke server, hanya hasil pencocokan yang disimpan. MSISDN dipakai sebagai kunci pencocokan utama; org_id dicek terpisah - kalau tidak cocok, sistem menandai &ldquo;org_id seharusnya X&rdquo; sebagai catatan, BUKAN auto-koreksi.
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>1. Muat Berkas Raw Tervalidasi</div>
        <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 12 }}>
          Hubungkan folder berisi berkas MSISDN + org_id tervalidasi (.xlsx/.xls/.csv). {savedMapping?.fileName && (
            <span>Pemetaan kolom terakhir sudah diingat dari <b>{savedMapping.fileName}</b> - otomatis dipakai lagi untuk berkas baru.</span>
          )}
        </div>
        <FolderConnectPanel t={T} source={folderSource} color={T.primary} acceptAttr=".xlsx,.xls,.csv" extLabel=".xlsx/.xls/.csv" />
        {readErr && <div style={{ ...note, marginTop: 10, background: T.errorBg, borderColor: T.error, color: T.error }}>{readErr}</div>}

        {table && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: T.mid, textTransform: "uppercase", marginBottom: 8 }}>Petakan Kolom</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 10 }}>
              {[["msisdn", "MSISDN", true], ["org_id", "Org ID", false]].map(([k, label, required]) => (
                <label key={k} style={{ display: "block" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: T.hi, marginBottom: 5 }}>{label} {required && <span style={{ color: T.error }}>*</span>}</div>
                  <select value={mapping[k]} onChange={(e) => setMapping((m) => ({ ...m, [k]: e.target.value }))}
                    style={{ ...selectStyle, borderColor: required && !mapping[k] ? T.error : T.line }}>
                    <option value="">- pilih kolom -</option>
                    {table.displayColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={muted}>{referenceMap ? `${referenceMap.size.toLocaleString()} MSISDN siap dipakai.` : "Lengkapi kolom MSISDN dulu."}</span>
              <button onClick={saveMapping} disabled={savingMap || !referenceMap} style={{ ...btn, marginLeft: "auto", ...((savingMap || !referenceMap) ? disabledBtn : {}) }}>
                {savingMap ? "Menyimpan…" : "Ingat Pemetaan Ini"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>2. Jalankan Rekonsiliasi</div>
          <button onClick={load} style={{ ...linkBtn, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <RefreshCw size={13} /> Muat ulang
          </button>
        </div>
        <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 12 }}>
          {rows.length} MSISDN menunggu validasi (dari semua Activity Report - sub-menu ini belum discope per region/brand, lihat progress tracker).
        </div>

        {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
        {result && (
          <div style={{ ...note, marginBottom: 12, background: T.successBg, borderColor: T.success, color: "#155724" }}>
            Selesai - {result.total} MSISDN diproses: <b>{result.valid} tervalidasi</b>, <b>{result.mismatch} org_id tidak cocok</b>, <b>{result.notFound} tidak ditemukan</b>.
          </div>
        )}

        <div style={{ overflow: "auto", maxHeight: 420, border: `1px solid ${T.line}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: "#F7F9FC", color: T.mid }}>
                {["Activity", "Disubmit Oleh", "MSISDN", "Org ID Disubmit", "Status Baru (pratinjau)"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingRows && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
              {!loadingRows && rows.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: T.lo }}>Tidak ada MSISDN yang menunggu validasi.</td></tr>}
              {!loadingRows && preview.length === 0 && rows.length > 0 && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: T.lo }}>Muat berkas raw dulu (langkah 1) untuk melihat pratinjau.</td></tr>
              )}
              {preview.map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: T.hi }}>{p.activity_name || "-"}</td>
                  <td style={{ padding: "8px 12px", color: T.mid }}>{p.submitted_by_name || "-"}</td>
                  <td style={{ padding: "8px 12px", color: T.mid }}>{p.msisdn}</td>
                  <td style={{ padding: "8px 12px", color: T.mid }}>{p.org_id || "-"}</td>
                  <td style={{ padding: "8px 12px" }}><ValidityPill status={p.newStatus} matchedOrgId={p.matchedOrgId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={runReconcile} disabled={running || !preview.length}
            style={{ ...pbtn, ...((running || !preview.length) ? disabledPbtn : {}) }}>
            <PlayCircle size={15} /> {running ? "Memproses…" : `Jalankan Rekonsiliasi (${preview.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ValidityPill({ status, matchedOrgId }) {
  const map = {
    valid: { t: "Tervalidasi", c: T.success, bg: T.successBg, icon: <CheckCircle2 size={12} /> },
    not_found: { t: "Tidak Ditemukan", c: T.error, bg: T.errorBg, icon: <AlertTriangle size={12} /> },
    org_mismatch: { t: `Org ID salah${matchedOrgId ? ` (harusnya ${matchedOrgId})` : ""}`, c: "#8a5b00", bg: T.warningBg, icon: <AlertTriangle size={12} /> },
    pending: { t: "Menunggu Validasi", c: "#8a5b00", bg: T.warningBg, icon: <HelpCircle size={12} /> },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, color: s.c, background: s.bg, border: `1px solid ${s.c}33` }}>
      {s.icon} {s.t}
    </span>
  );
}

// ── Bits bersama ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, width: 420, maxWidth: "92vw", maxHeight: "86vh", overflow: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.hi, marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthInputValue(yyyymm) {
  if (!/^\d{6}$/.test(String(yyyymm || ""))) return "";
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
function monthLabel(yyyymm) {
  if (!/^\d{6}$/.test(String(yyyymm || ""))) return String(yyyymm || "-");
  return `${MONTH_NAMES[parseInt(yyyymm.slice(4, 6), 10) - 1]} ${yyyymm.slice(0, 4)}`;
}

const card = { background: "#FFFFFF", border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13 };
const note = { background: "#FFFDE7", border: `1px solid #F0E3B0`, color: "#7a5b00", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5 };
const btn = { padding: "8px 14px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1 };
const iconBtn = { ...btn, padding: "6px 8px" };
const GRAD = "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)";
const pbtn = { ...btn, background: GRAD, color: "#fff", border: "none", padding: "9px 16px" };
const disabledPbtn = { background: "#F1F2F5", color: T.lo, boxShadow: "none", cursor: "not-allowed" };
const pill = { fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, display: "inline-block" };
const CHEV = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>";
const inp = { padding: "8px 11px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, outline: "none", boxSizing: "border-box", width: "100%" };
const selectStyle = { ...inp, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", cursor: "pointer", backgroundImage: `url("${CHEV}")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 11px center", backgroundSize: "13px", paddingRight: 32 };
