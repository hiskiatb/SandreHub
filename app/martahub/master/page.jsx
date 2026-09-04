"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Map as MapIcon, ChevronRight, ChevronDown, ArrowLeft, CheckCircle2, AlertTriangle, Clock, Network, Search, Store, UserCheck, UserX, Target as TargetIcon, Tag, Plus, Pencil, Calendar, Database } from "lucide-react";
import MartaShell, { T } from "../components/MartaShell";
import { useGeoLayers, LayerPanel } from "../components/SumatraMap";
import supabaseMarta from "../../../lib/supabaseMarta";
import { getMartaScope } from "../../../lib/martaScope";
import { nearestPriorTarget } from "../../../lib/activityTarget";
import {
  TARGET_FIELDS, readWorkbook, deriveTable, guessMapping, buildRows, runImport,
  fetchImportHistory, currentYYYYMM, monthLabel, MONTH_NAMES,
} from "../../../lib/martaSiteImport";
import { passesRow, optionsFor, FilterTh, FilterMenu } from "../../dashboard/components/MFTS_TableFilter";

export default function MasterDataPage() {
  return (
    <MartaShell active="master" title="Master Data" subtitle="Data bulanan MartaHub - List Site (branch BME/RGE) & Batas Wilayah.">
      {(ctx) => <Body canManage={ctx?.canManage} email={ctx?.session?.user?.email} />}
    </MartaShell>
  );
}

const mtT = { card: "#FFFFFF", line: T.line, hi: T.hi, mid: T.mid, lo: T.lo, hover: "#F0F4FA" };

function Body({ canManage, email }) {
  const router = useRouter();
  const geo = useGeoLayers();
  const [active, setActive] = useState(null); // null | 'site_data' | 'territory' | 'activity_target'
  const [history, setHistory] = useState([]);
  const [siteDataPeriod, setSiteDataPeriod] = useState(null); // period awal saat lompat dari Upload -> Data per Periode
  const currentMonth = currentYYYYMM();

  const loadHistory = useCallback(async () => { setHistory(await fetchImportHistory()); }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const uploadedThisMonth = history.some((h) => h.period === currentMonth);
  const latest = history[0] || null;

  if (active === "site_data") {
    return <SiteDataByPeriodView canManage={canManage} history={history} currentMonth={currentMonth}
      initialPeriod={siteDataPeriod} onBack={() => setActive(null)} onImported={loadHistory} />;
  }
  if (active === "territory") {
    return (
      <div>
        <BackBtn onClick={() => setActive(null)} />
        <div style={card}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>Batas Wilayah (Peta)</div>
          <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 12 }}>Unggah .zip (SHP), .kml, .kmz, atau .geojson.</div>
          <LayerPanel t={mtT} geo={geo} canManage={canManage} style={{ boxShadow: "none", maxWidth: 520 }} />
        </div>
      </div>
    );
  }
  if (active === "hierarchy") {
    return (
      <div>
        <BackBtn onClick={() => setActive(null)} />
        <HierarchyView />
      </div>
    );
  }
  if (active === "activity_target") {
    return <ActivityTargetView email={email} canManage={canManage} onBack={() => setActive(null)} />;
  }
  if (active === "sp_fwa_types") {
    return <SpFwaTypesView email={email} canManage={canManage} onBack={() => setActive(null)} />;
  }

  // ── Hub ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.hi, marginBottom: 3 }}>Pilih menu</div>
      <div style={{ fontSize: 13, color: T.mid, marginBottom: 18 }}>Data yang perlu diperbarui tiap bulan.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        <MenuCard
          icon={Database} label="Data Site (Branch BME/RGE)"
          desc={`Lihat & filter data List Site per periode (Site ID, Branch, Kabupaten, Kecamatan, dst) - upload data baru lewat tombol "+ Upload Data Site" di dalamnya.`}
          onClick={() => { setSiteDataPeriod(null); setActive("site_data"); }}
          status={
            uploadedThisMonth
              ? { ok: true, text: `Bulan ini (${monthLabel(currentMonth)}) sudah diupload` }
              : { ok: false, text: `Bulan ini (${monthLabel(currentMonth)}) belum diupload` }
          }
          sub={latest ? `Terakhir: ${monthLabel(latest.period)} · ${Number(latest.rows || 0).toLocaleString()} baris` : "Belum ada upload"}
        />
        <MenuCard
          icon={MapIcon} label="Batas Wilayah (Peta)"
          desc="Upload SHP / KML / GeoJSON batas wilayah untuk peta."
          onClick={() => setActive("territory")}
        />
        <MenuCard
          icon={Network} label="Struktur Branch & Brand"
          desc="Hirarki Region → Brand → Branch beserta akun (TMV / BME / RGE) yang termapping, plus status pengisian (Terisi/Kosong)."
          onClick={() => setActive("hierarchy")}
        />
        <MenuCard
          icon={TargetIcon} label="Target Aktivitas"
          desc="Target SP/FWA/Revenue per Branch × Brand × Bulan, ditetapkan TMV/Brand TMV - jadi acuan Achievement % di Dashboard."
          onClick={() => setActive("activity_target")}
        />
        <MenuCard
          icon={Tag} label="Jenis SP & FWA"
          desc="Master jenis SP & FWA beserta harga per unit - dipakai mobile utk menghitung Revenue otomatis dari MSISDN yang dicatat DSF/TL DSF/BME."
          onClick={() => setActive("sp_fwa_types")}
        />
        <MenuCard
          icon={Store} label="Mapping Outlet POSM"
          desc="Upload mapping Outlet-to-DSE bulanan per brand (IM3/3ID) - dipakai fitur Retailer Installment (mobile) utk pencarian outlet per Branch."
          onClick={() => router.push("/martahub/posmat/mapping")}
        />
      </div>
    </div>
  );
}

// ── Jenis SP & FWA - master jenis + harga per unit (Revenue otomatis mobile) ──
function SpFwaTypesView({ email, canManage, onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null=tutup, {}=baru, {...}=edit
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseMarta.rpc("mh_product_type_list");
    if (!error) setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: 1600, width: "100%" }}>
      <BackBtn onClick={onBack} />
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.hi }}>Jenis SP & FWA</div>
        {canManage && <button onClick={() => setEditing({})} style={{ ...pbtn, marginLeft: "auto" }}><Plus size={15} /> Tambah</button>}
      </div>
      <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 14 }}>
        Harga per unit di sini dipakai mobile utk menghitung <b>Revenue otomatis</b> saat DSF/TL DSF/BME mencatat MSISDN SP/FWA di Activity Report - bukan lagi angka manual.
      </div>
      {!canManage && <div style={{ ...note, marginBottom: 14 }}>Mode lihat saja - hanya Head TMV / Brand TMV / SPM Sumatera yang bisa mengubah jenis & harga.</div>}
      {err && <div style={{ ...note, marginBottom: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: "#F7F9FC", color: T.mid }}>
            {["Nama", "Kategori", "Brand", "Harga / Unit", "Status", ""].map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: T.lo }}>Belum ada jenis SP/FWA.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                <td style={{ padding: "8px 12px", fontWeight: 700, color: T.hi }}>{r.name}</td>
                <td style={{ padding: "8px 12px" }}>
                  <span style={{ ...pill, color: r.category === "fwa" ? T.blue : T.primary, background: r.category === "fwa" ? T.blueBg : "#FFF0F0" }}>
                    {r.category === "fwa" ? "FWA" : "SP"}
                  </span>
                </td>
                <td style={{ padding: "8px 12px", color: T.mid }}>{brandLabel(r.brand)}</td>
                <td style={{ padding: "8px 12px", color: T.hi, fontWeight: 700 }}>Rp {Number(r.unit_price || 0).toLocaleString("id-ID")}</td>
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
        <SpFwaTypeModal row={editing} email={email} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} onError={setErr} />
      )}
    </div>
  );
}

function SpFwaTypeModal({ row, email, onClose, onSaved, onError }) {
  const isNew = !row.id;
  const [category, setCategory] = useState(row.category || "sp");
  const [brand, setBrand] = useState(row.brand || "im3");
  const [name, setName] = useState(row.name || "");
  const [unitPrice, setUnitPrice] = useState(row.unit_price ?? "");
  const [activeFlag, setActiveFlag] = useState(row.active ?? true);
  const [saving, setSaving] = useState(false);
  const canSave = name.trim() && !saving;

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabaseMarta.rpc("mh_product_type_upsert", {
        p_id: row.id || null, p_category: category, p_brand: brand, p_name: name.trim(),
        p_unit_price: unitPrice === "" ? 0 : Number(unitPrice), p_active: activeFlag, p_caller_email: email,
      });
      if (error) throw error;
      onSaved();
    } catch (e) { onError(e.message || "Gagal menyimpan"); onClose(); }
    finally { setSaving(false); }
  }

  return (
    <Modal onClose={onClose} title={isNew ? "Tambah Jenis SP/FWA" : "Edit Jenis SP/FWA"}>
      <Field label="Kategori">
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          <option value="sp">SP</option>
          <option value="fwa">FWA</option>
        </select>
      </Field>
      <Field label="Brand">
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={selectStyle}>
          <option value="im3">IM3</option>
          <option value="tri">3ID</option>
        </select>
      </Field>
      <Field label="Nama *"><input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Mis. Perdana Reguler 10K" /></Field>
      <Field label="Harga per Unit (Rp)">
        <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} style={inp} placeholder="0" />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.mid, marginTop: 4 }}>
        <input type="checkbox" checked={activeFlag} onChange={(e) => setActiveFlag(e.target.checked)} /> Aktif (muncul di pilihan jenis saat mobile input Penjualan SP/FWA)
      </label>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={onClose} style={btn}>Batal</button>
        <button onClick={save} disabled={!canSave} style={{ ...pbtn, ...(!canSave ? disabledPbtn : {}) }}>{saving ? "Menyimpan…" : "Simpan"}</button>
      </div>
    </Modal>
  );
}

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

// ── Target Aktivitas - bulk-entry per Brand+Bulan, carry-forward otomatis ────
function ActivityTargetView({ email, canManage, onBack }) {
  const [scope, setScope] = useState(null);
  const [combos, setCombos] = useState([]);
  const [allTargets, setAllTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState("");
  const [month, setMonth] = useState(currentYYYYMM());
  const [rows, setRows] = useState({}); // branch_id -> { branchName, sp, fwa, revenue, carriedFrom }
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const sc = email ? await getMartaScope(email) : null;
    setScope(sc);
    const [bb, tg] = await Promise.all([
      supabaseMarta.rpc("mh_branch_brand_list"),
      supabaseMarta.rpc("mh_activity_list_targets"),
    ]);
    setCombos(bb.data || []);
    setAllTargets(tg.data || []);
    setLoading(false);
  }, [email]);
  useEffect(() => { load(); }, [load]);

  // Brand TMV -> discope ke region+brand-nya sendiri; Head TMV -> region saja;
  // SPM Sumatera/admin -> unscoped (pola sama halaman lain, lib/martaScope.js).
  const scopedCombos = useMemo(() => {
    if (!scope || scope.unscoped) return combos;
    return combos.filter((c) => (!scope.region || c.region === scope.region) && (!scope.brand || c.brand === scope.brand));
  }, [combos, scope]);

  const brandOptions = useMemo(() => [...new Set(scopedCombos.map((c) => c.brand))].sort(), [scopedCombos]);
  useEffect(() => { if (!brand && brandOptions.length) setBrand(brandOptions[0]); }, [brand, brandOptions]);

  const branches = useMemo(() => {
    const seen = new Map();
    for (const c of scopedCombos) if (c.brand === brand && !seen.has(c.branch_id)) seen.set(c.branch_id, c.branch);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [scopedCombos, brand]);

  // Prefill tiap ganti brand/bulan - carry-forward dari target bulan terdekat
  // sebelumnya kalau bulan ini belum pernah diset (lib/activityTarget.js,
  // dipakai ULANG persis sama oleh Dashboard utk hitung Achievement %).
  useEffect(() => {
    if (!brand || !month || !branches.length) { setRows({}); return; }
    const next = {};
    for (const [branchId, branchName] of branches) {
      const exact = allTargets.find((t) => t.branch_id === branchId && t.brand === brand && t.month === month);
      const effective = exact || nearestPriorTarget(allTargets, branchId, brand, month);
      next[branchId] = {
        branchName,
        sp: effective?.target_sp ?? "", fwa: effective?.target_fwa ?? "", revenue: effective?.target_revenue ?? "",
        carriedFrom: !exact && effective ? effective.month : null,
      };
    }
    setRows(next);
  }, [branches, brand, month, allTargets]);

  function setField(branchId, field, value) {
    setRows((r) => ({ ...r, [branchId]: { ...r[branchId], [field]: value } }));
  }

  async function saveAll() {
    setSaving(true); setErr(""); setOk("");
    try {
      const payload = Object.entries(rows).map(([branchId, r]) => ({
        branch_id: branchId, branch_name: r.branchName, brand, month,
        target_sp: r.sp === "" ? null : Number(r.sp),
        target_fwa: r.fwa === "" ? null : Number(r.fwa),
        target_revenue: r.revenue === "" ? null : Number(r.revenue),
        note: null,
      }));
      const { error } = await supabaseMarta.rpc("mh_activity_set_targets_batch", { p_rows: payload, p_caller_email: email });
      if (error) throw new Error(error.message);
      setOk(`Tersimpan ${payload.length} branch untuk ${monthLabel(month)}.`);
      await load();
    } catch (e) { setErr(e.message || "Gagal menyimpan target"); }
    finally { setSaving(false); }
  }

  const monthInputVal = `${month.slice(0, 4)}-${month.slice(4, 6)}`;
  const disabledPbtn = { background: "#F1F2F5", color: T.lo, boxShadow: "none", cursor: "not-allowed" };

  return (
    <div style={{ maxWidth: 1600, width: "100%" }}>
      <BackBtn onClick={onBack} />
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Target Aktivitas</div>
      <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 14 }}>
        Target resmi SP / FWA / Revenue per Branch × Brand × Bulan - jadi acuan <b>Achievement %</b> di Dashboard. Target per-event yang BME isi sendiri saat Create Plan tetap ada (alat bantu planning BME), tapi Achievement % resmi dihitung dari target di sini.
      </div>

      {!canManage ? (
        <div style={note}>Mode lihat saja - hanya Head TMV / Brand TMV / SPM Sumatera yang bisa mengubah target.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.hi, marginBottom: 4 }}>Brand</div>
              <select value={brand} onChange={(e) => setBrand(e.target.value)} style={{ ...selectStyle, width: 140 }} disabled={brandOptions.length <= 1}>
                {brandOptions.map((b) => <option key={b} value={b}>{b === "tri" ? "3ID" : b.toUpperCase()}</option>)}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.hi, marginBottom: 4 }}>Bulan</div>
              <input type="month" value={monthInputVal} onChange={(e) => setMonth(e.target.value.replace("-", ""))}
                style={{ ...inp, width: 170 }} />
            </label>
          </div>

          {err && <div style={{ ...note, marginBottom: 10, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
          {ok && <div style={{ ...note, marginBottom: 10, background: T.successBg, borderColor: T.success, color: "#155724" }}>{ok}</div>}

          <div style={{ overflow: "auto", border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "#F7F9FC" }}>
                  {["Branch", "Target SP", "Target FWA", "Target Revenue"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: T.mid, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: T.lo }}>Memuat…</td></tr>}
                {!loading && branches.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: T.lo }}>Tidak ada branch untuk brand ini dalam scope Anda.</td></tr>
                )}
                {!loading && branches.map(([branchId]) => {
                  const r = rows[branchId] || {};
                  return (
                    <tr key={branchId} style={{ borderTop: `1px solid ${T.line}` }}>
                      <td style={{ padding: "8px 12px", fontWeight: 700, color: T.hi, whiteSpace: "nowrap" }}>
                        {r.branchName}
                        {r.carriedFrom && (
                          <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: "#8a5b00", background: T.warningBg, borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap" }}>
                            disalin dari {monthLabel(r.carriedFrom)}
                          </span>
                        )}
                      </td>
                      {["sp", "fwa", "revenue"].map((f) => (
                        <td key={f} style={{ padding: "6px 10px" }}>
                          <input type="number" value={r[f] ?? ""} onChange={(e) => setField(branchId, f, e.target.value)}
                            style={{ ...inp, padding: "6px 9px" }} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button onClick={saveAll} disabled={saving || loading || !branches.length}
            style={{ ...pbtn }}>
            {saving ? "Menyimpan…" : `Simpan Semua (${branches.length} branch)`}
          </button>
        </>
      )}
    </div>
  );
}

function Spinner({ size = 13 }) {
  return (
    <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%",
      border: `2px solid ${T.primary}33`, borderTopColor: T.primary, animation: "mhSpin .7s linear infinite" }} />
  );
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.mid, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 16 }}>
      <ArrowLeft size={15} /> Kembali ke Master Data
    </button>
  );
}

function MenuCard({ icon: Icon, label, desc, onClick, status, sub }) {
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
        {status && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
              background: status.ok ? T.successBg : T.warningBg, color: status.ok ? T.success : "#8a5b00", border: `1px solid ${status.ok ? T.success + "40" : "#F0E3B0"}` }}>
              {status.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {status.text}
            </span>
            {sub && <span style={{ fontSize: 11.5, color: T.lo }}>{sub}</span>}
          </div>
        )}
      </div>
      <ChevronRight size={16} color={T.lo} style={{ marginTop: 4, flexShrink: 0 }} />
    </div>
  );
}

// ── Modal Upload Data Site (wizard: pilih bulan → upload → import) - dibuka
// dari tombol "+ Upload Data Site" di dalam view "Data Site", BUKAN menu
// terpisah lagi. ──
function UploadSiteModal({ canManage, history, currentMonth, onClose, onImported, onViewPeriod }) {
  const now = new Date();
  const years = [now.getFullYear() - 1, now.getFullYear()];
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const period = `${selYear}${String(selMonth).padStart(2, "0")}`;
  const [confirmed, setConfirmed] = useState(false);

  const uploadedSet = useMemo(() => new Set(history.map((h) => h.period)), [history]);
  const periodUploaded = uploadedSet.has(period);
  const isCurrent = period === currentMonth;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "4vh 20px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 22, width: 640, maxWidth: "94vw", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Upload Data Site</div>
          <button onClick={onClose} style={{ ...linkBtn, marginLeft: "auto", fontSize: 13 }}>✕ Tutup</button>
        </div>

        {/* Status bulan ini */}
        <div style={{ ...card, marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {uploadedSet.has(currentMonth) ? (
            <span style={{ ...statusPill, background: T.successBg, color: T.success, borderColor: T.success + "40" }}>
              <CheckCircle2 size={13} /> Bulan ini ({monthLabel(currentMonth)}) sudah diupload
            </span>
          ) : (
            <span style={{ ...statusPill, background: T.warningBg, color: "#8a5b00", borderColor: "#F0E3B0" }}>
              <AlertTriangle size={13} /> Bulan ini ({monthLabel(currentMonth)}) belum diupload
            </span>
          )}
          {history[0] && <span style={{ fontSize: 12, color: T.lo, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Clock size={12} /> Terakhir: {monthLabel(history[0].period)} · {new Date(history[0].uploaded_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
          </span>}
        </div>

        {canManage ? (
          <>
            {/* Step 1: pilih bulan */}
            {!confirmed ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>1. Pilih Bulan Data</div>
                <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 14 }}>Tentukan periode file List Site. Data disimpan per bulan; bulan yang sama akan ditimpa.</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={selMonth} onChange={(e) => setSelMonth(+e.target.value)} style={{ ...selectStyle, width: 150 }}>
                    {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <select value={selYear} onChange={(e) => setSelYear(+e.target.value)} style={{ ...selectStyle, width: 110 }}>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <button onClick={() => setConfirmed(true)} style={{ ...pbtn, marginLeft: "auto" }}>
                    Konfirmasi {monthLabel(period)} <ChevronRight size={15} />
                  </button>
                </div>
                {!isCurrent && (
                  <div style={{ ...note, marginTop: 12 }}>
                    {period < currentMonth ? "Periode historis" : "Periode mendatang"} - {monthLabel(period)}. Pastikan file memang untuk bulan ini.
                  </div>
                )}
                {periodUploaded && (
                  <div style={{ ...note, marginTop: 10, background: T.warningBg }}>Bulan {monthLabel(period)} sudah pernah diupload - import baru akan menimpa.</div>
                )}
              </>
            ) : (
              <UploadStep period={period} onChangePeriod={() => setConfirmed(false)}
                onDone={() => onImported?.()} onViewPeriod={(p) => { onViewPeriod?.(p); onClose(); }} />
            )}
          </>
        ) : (
          <div style={{ ...note }}>Mode lihat saja - hanya Admin yang dapat mengunggah.</div>
        )}
      </div>
    </div>
  );
}

// ── Step 2+3: upload file + mapping + import ─────────────────────────────────
function UploadStep({ period, onChangePeriod, onDone, onViewPeriod }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState({});
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const table = useMemo(() => (matrix ? deriveTable(matrix, headerIdx) : null), [matrix, headerIdx]);
  useEffect(() => { if (table) setMapping(guessMapping(table.displayColumns)); }, [table]);

  async function onFile(f) {
    setFile(f); setMatrix(null); setResult(null); setErr(""); setPct(0); setHeaderIdx(0);
    if (!f) return;
    setReading(true);
    try { const parsed = await readWorkbook(f); setMatrix(parsed.matrix); }
    catch (e) { setErr(e.message || "Gagal membaca berkas."); }
    finally { setReading(false); }
  }

  async function run() {
    if (!table || busy) return;
    setBusy(true); setErr(""); setResult(null); setPct(0); setMsg("Menyiapkan data…");
    try {
      const dbRows = buildRows(table.rows, mapping);
      const res = await runImport(dbRows, period, (p, m) => { setPct(p); if (m) setMsg(m); }, file?.name);
      setResult(res); onDone?.();
    } catch (e) { setErr(e.message || "Gagal mengimpor."); }
    finally { setBusy(false); }
  }

  const opts = table?.displayColumns || [];
  const fieldSelect = (f) => {
    const val = mapping[f.key] || "";
    return (
      <label key={f.key} style={{ display: "block" }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: T.hi, marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
          {f.label}{f.required && <span style={{ color: T.error }}>*</span>}
          {val && <span style={{ fontSize: 10, fontWeight: 700, color: T.success }}>✓</span>}
        </div>
        <select value={val} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))} style={{ ...selectStyle, borderColor: f.required && !val ? T.error : T.line }}>
          <option value="">- pilih kolom -</option>
          {opts.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
    );
  };

  const previewRows = matrix ? matrix.slice(0, 10) : [];
  const colCount = previewRows.reduce((m, r) => Math.max(m, (r || []).length), 0);
  const canImport = table && mapping.site_id && mapping.branch;

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "10px 14px",
        borderRadius: 11, background: "#FFF0F0", border: `1px solid #F6D9D9`,
      }}>
        <Calendar size={16} color={T.primary} />
        <div style={{ fontSize: 12.5, color: T.mid }}>
          Mengunggah untuk periode <b style={{ color: T.hi, fontSize: 13.5 }}>{monthLabel(period)}</b>
        </div>
        <button onClick={onChangePeriod} style={{ ...btn, marginLeft: "auto", padding: "6px 13px", fontSize: 12 }}>
          Ganti Periode
        </button>
      </div>

      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>2. Unggah, Preview & Petakan Kolom</div>
      <div style={{ color: T.mid, fontSize: 12.5, marginBottom: 12 }}>Lihat data dulu, tentukan baris header, lalu petakan kolom kunci. Seluruh kolom asli tetap disimpan utuh.</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input ref={inputRef} type="file" accept=".xlsb,.xlsx,.xls,.csv" disabled={busy || reading} onChange={(e) => onFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
        <button onClick={() => inputRef.current?.click()} disabled={busy || reading} style={btn}>{file ? "Ganti berkas" : "Pilih berkas…"}</button>
        {reading ? <span style={muted}>Membaca…</span> : file && <span style={muted}>{file.name} · {(file.size / 1048576).toFixed(1)} MB</span>}
      </div>

      {matrix && <>
        {/* Preview + pilih baris header */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: T.mid, textTransform: "uppercase", marginBottom: 5 }}>Preview & Baris Header</div>
          <div style={{ fontSize: 12, color: T.mid, marginBottom: 8 }}>Klik baris yang menjadi <b>header</b>. Baris di atasnya diabaikan; baris di bawahnya jadi data.</div>
          <div style={{ overflow: "auto", maxHeight: 250, border: `1px solid ${T.line}`, borderRadius: 10 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 11.5, whiteSpace: "nowrap" }}>
              <tbody>
                {previewRows.map((row, ri) => {
                  const isHeader = ri === headerIdx;
                  const skipped = ri < headerIdx;
                  return (
                    <tr key={ri} onClick={() => setHeaderIdx(ri)}
                      style={{ cursor: "pointer", background: isHeader ? "#FFF0F0" : skipped ? "#F5F6F8" : "#fff", opacity: skipped ? 0.55 : 1, borderTop: ri ? `1px solid ${T.line}` : "none" }}>
                      <td style={{ position: "sticky", left: 0, background: "inherit", padding: "6px 10px", fontWeight: 800, fontSize: 10.5, color: isHeader ? T.primary : T.lo, borderRight: `1px solid ${T.line}`, textAlign: "center", minWidth: 56 }}>
                        {isHeader ? "HEADER" : ri + 1}
                      </td>
                      {Array.from({ length: colCount }).map((_, ci) => {
                        const v = (row || [])[ci];
                        const s = v == null ? "" : String(v);
                        return <td key={ci} style={{ padding: "6px 10px", color: isHeader ? T.hi : T.mid, fontWeight: isHeader ? 700 : 400, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>{s.length > 22 ? s.slice(0, 22) + "…" : s}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: T.mid, marginTop: 8 }}>
            Header: baris <b>#{headerIdx + 1}</b> · <b>{(table?.rows.length || 0).toLocaleString()}</b> baris data dimuat · <b>{opts.length}</b> kolom terbaca.
          </div>
        </div>

        {/* Cocokkan kolom - semua field, auto-match dari header */}
        <div style={{ margin: "18px 0 3px", fontSize: 11.5, fontWeight: 800, color: T.mid, textTransform: "uppercase" }}>Cocokkan Kolom</div>
        <div style={{ fontSize: 12, color: T.mid, marginBottom: 6 }}>Kolom yang dibutuhkan dicocokkan otomatis dari header (pola “like” nama kolom). Ubah bila ada yang meleset. Semua kolom asli tetap disimpan.</div>
        <div style={{ ...note, marginBottom: 10 }}>Koordinat (Lat/Long) <b>sengaja tidak diimpor di sini</b> - data referensi lokasi dikelola lokal lewat menu <b>Batas Wilayah (Peta)</b> di Master Data atau <b>Validasi Lokasi</b>, tidak pernah lewat upload List Site ini.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 10 }}>
          {TARGET_FIELDS.map(fieldSelect)}
        </div>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
          {!canImport && <span style={{ fontSize: 12, color: T.error }}>Pilih kolom Site ID & Branch dulu.</span>}
          <button onClick={run} disabled={busy || !canImport} style={{ ...pbtn, ...((busy || !canImport) ? { background: "#F1F2F5", color: T.lo, boxShadow: "none" } : {}) }}>
            {busy ? "Mengimpor…" : <>Import {monthLabel(period)} <UploadCloud size={15} /></>}
          </button>
        </div>
      </>}

      {busy && (
        <div style={{ marginTop: 14 }}>
          <div style={{ height: 8, background: "#EEF1F6", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: T.primary, transition: "width .2s" }} />
          </div>
          <div style={{ fontSize: 12, color: T.mid, marginTop: 6 }}>{msg} ({pct}%)</div>
        </div>
      )}
      {err && <div style={{ ...note, marginTop: 12, background: T.errorBg, borderColor: T.error, color: T.error }}>{err}</div>}
      {result && (
        <div style={{ ...note, marginTop: 12, background: T.successBg, borderColor: T.success, color: "#155724", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span><b>Berhasil.</b> {monthLabel(result.month)} · {result.rows.toLocaleString()} baris · {result.branches} branch · {result.deactivated.toLocaleString()} site lama dinonaktifkan.</span>
          <button onClick={() => onViewPeriod?.(result.month)} style={{ ...btn, marginLeft: "auto", padding: "6px 13px", fontSize: 12, background: "#fff" }}>
            Lihat Data Periode Ini <ChevronRight size={13} />
          </button>
        </div>
      )}
    </>
  );
}

// Kolom tabel - nama yang disepakati (bukan nama kolom mentah).
const COLUMNS = [
  { key: "site_id", label: "Site ID", strong: true },
  { key: "site_name", label: "Site Name" },
  { key: "mc", label: "MC" },
  { key: "branch", label: "Branch" },
  { key: "region", label: "Region" },
  { key: "area", label: "Area" },
  { key: "circle", label: "Circle" },
  { key: "kabupaten", label: "Kabupaten" },
  { key: "kecamatan_name", label: "Kecamatan" },
  { key: "kecamatan", label: "Kecamatan Unik" },
];

const FCOLS = COLUMNS.map((c) => [c.key, c.label]);
const FT_T = { card: "#FFFFFF", line: T.line, sub: "#F5F6F9", hi: T.hi, mid: T.mid, lo: T.lo, teal: T.primary, tealBg: "#FFF0F0" };
const MAX_ROWS = 1000;

// ── Data Site per Periode - view TERPISAH dari upload, murni utk browse/filter
// data List Site yang sudah tersimpan per bulan (baca mh_sites_monthly). ──
function SiteDataByPeriodView({ canManage, history, currentMonth, initialPeriod, onBack, onImported }) {
  const periods = useMemo(() => {
    const set = new Set(history.map((h) => h.period));
    set.add(initialPeriod || currentMonth);
    return [...set].sort().reverse();
  }, [history, currentMonth, initialPeriod]);
  const [period, setPeriod] = useState(initialPeriod || history[0]?.period || currentMonth);
  const [showUpload, setShowUpload] = useState(false);
  const rowsForPeriod = history.find((h) => h.period === period)?.rows;

  return (
    <div style={{ maxWidth: 1600, width: "100%" }}>
      <BackBtn onClick={onBack} />
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "10px 14px",
        borderRadius: 11, background: "#FFF0F0", border: `1px solid #F6D9D9`, flexWrap: "wrap",
      }}>
        <Calendar size={16} color={T.primary} />
        <div style={{ fontSize: 12.5, color: T.mid }}>Menampilkan data periode</div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...selectStyle, width: 190, fontWeight: 700 }}>
          {periods.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}
        </select>
        {!history.some((h) => h.period === period) && (
          <span style={{ fontSize: 11.5, color: "#8a5b00" }}>Belum pernah diupload - tidak ada data.</span>
        )}
        {canManage && (
          <button onClick={() => setShowUpload(true)} style={{ ...pbtn, marginLeft: "auto", padding: "8px 14px", fontSize: 12.5 }}>
            <Plus size={14} /> Upload Data Site
          </button>
        )}
      </div>
      <SitesBrowser key={period} period={period} expectedTotal={rowsForPeriod} />

      {showUpload && (
        <UploadSiteModal canManage={canManage} history={history} currentMonth={currentMonth}
          onClose={() => setShowUpload(false)} onImported={onImported}
          onViewPeriod={(p) => setPeriod(p)} />
      )}
    </div>
  );
}

// ── Browser hasil - filter ala-Excel per kolom (konsep sama spt Pemenuhan Manpower) ──
function SitesBrowser({ period, expectedTotal }) {
  const [allSites, setAllSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(0);   // baris yang sudah terbaca (progress)
  const [filters, setFilters] = useState({});
  const [openCol, setOpenCol] = useState("");
  const [rect, setRect] = useState(null);
  const [showBranches, setShowBranches] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoaded(0);
    try {
      // PostgREST membatasi respons per-request (mis. 1000 baris), jadi muat
      // seluruh site secara bertahap (paginasi) agar 12.5k+ ikut terbaca.
      // Progres diperbarui tiap halaman agar pengguna melihat data mengalir.
      const PAGE = 1000;
      let all = [];
      for (let off = 0; off < 200000; off += PAGE) {
        const { data, error } = await supabaseMarta.rpc("mh_list_sites_by_period", { p_period: period, p_filters: {}, p_limit: PAGE, p_offset: off });
        if (error) break;
        const rows = data || [];
        all = all.concat(rows);
        setLoaded(all.length); // update progres per halaman
        if (rows.length < PAGE) break;
      }
      setAllSites(all);
    } finally { setLoading(false); }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  // Perkiraan progres: pakai jumlah baris import terakhir sebagai acuan bila ada.
  const est = Number(expectedTotal) || 0;
  const loadPct = !loading ? 100
    : est > 0 ? Math.min(99, Math.round((loaded / est) * 100))
    : null; // null → indeterminate (tak tahu total)

  const filtered = useMemo(() => allSites.filter((r) => passesRow(r, filters, FCOLS, null)), [allSites, filters]);
  const anyFilter = FCOLS.some(([k]) => (filters[k] || []).length);
  const shown = filtered.slice(0, MAX_ROWS);

  const uniq = (rows, k) => new Set(rows.map((r) => String(r[k] ?? "").trim()).filter(Boolean)).size;
  const stats = useMemo(() => [
    ["Site ID", filtered.length, "Site ID"], ["MC", uniq(filtered, "mc"), "MC"], ["Area", uniq(filtered, "area"), "Area"],
    ["Region", uniq(filtered, "region"), "Region"], ["Branch", uniq(filtered, "branch"), "Branch"],
    ["Kabupaten", uniq(filtered, "kabupaten"), "Kabupaten"], ["Kecamatan", uniq(filtered, "kecamatan_name"), "Kecamatan"],
    ["KEC. UNIK", uniq(filtered, "kecamatan"), "Kecamatan Unik"],
  ], [filtered]);

  const branchList = useMemo(() => {
    const m = new Map();
    for (const r of filtered) { const b = String(r.branch || "").trim(); if (!b) continue; m.set(b, (m.get(b) || 0) + 1); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <style>{`@keyframes mhSpin{to{transform:rotate(360deg)}}@keyframes mhIndet{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
      <div style={{ padding: "13px 16px", borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>Data Site & Branch</div>
        {loading && (
          <span style={{ fontSize: 11.5, color: T.primary, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Spinner /> Memuat {loaded.toLocaleString()}{est > 0 ? ` / ${est.toLocaleString()}` : ""} baris…
          </span>
        )}
        {!loading && anyFilter && <span style={{ fontSize: 11.5, color: T.mid }}>{filtered.length.toLocaleString()} dari {allSites.length.toLocaleString()} baris</span>}
        {!loading && anyFilter && <button onClick={() => setFilters({})} style={{ ...linkBtn, marginLeft: "auto", color: T.primary }}>Hapus semua filter</button>}
      </div>

      {/* Progress bar pemuatan data (determinate bila total diketahui) */}
      {loading && (
        <div style={{ height: 3, background: "#EEF1F6", overflow: "hidden", position: "relative" }}>
          {loadPct == null ? (
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, transparent, ${T.primary}, transparent)`, animation: "mhIndet 1.1s infinite" }} />
          ) : (
            <div style={{ width: `${loadPct}%`, height: "100%", background: GRAD, transition: "width .25s ease" }} />
          )}
        </div>
      )}

      {/* Ringkasan (mengikuti filter aktif) */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 1, background: T.line, borderBottom: `1px solid ${T.line}` }}>
        {stats.map(([label, val, full]) => (
          <div key={label} style={{ background: "#fff", padding: "12px 6px", textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: loading ? T.lo : T.hi, lineHeight: 1, whiteSpace: "nowrap" }}>
              {loading ? (label === "Site ID" ? loaded.toLocaleString() : "…") : Number(val || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.lo, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={full || label}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ borderBottom: `1px solid ${T.line}`, background: "#FAFBFD" }}>
        <button onClick={() => setShowBranches((v) => !v)} style={{ ...linkBtn, padding: "10px 16px", width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: T.mid, textTransform: "uppercase" }}>Branch ({branchList.length})</span>
          <span style={{ color: T.mid, fontSize: 12 }}>{showBranches ? "▾ sembunyikan" : "▸ tampilkan"}</span>
        </button>
        {showBranches && (
          <div style={{ padding: "0 16px 12px", display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {branchList.length === 0 && <span style={muted}>Belum ada data.</span>}
            {branchList.map(([name, count]) => (
              <span key={name} style={chip}>{name} <span style={{ color: T.mid, fontWeight: 500 }}>· {count.toLocaleString()}</span></span>
            ))}
          </div>
        )}
      </div>

      <div style={{ overflow: "auto", maxHeight: 520 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ background: "#F7F9FC", color: T.mid }}>
              {COLUMNS.map((c) => (
                <FilterTh key={c.key} t={FT_T} label={c.label} colKey={c.key} filters={filters}
                  onOpen={(ck, r) => { setRect(r); setOpenCol(ck); }} />
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={COLUMNS.length} style={{ padding: "34px 22px" }}>
                <div style={{ maxWidth: 320, margin: "0 auto", textAlign: "center" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: T.mid, fontSize: 12.5, fontWeight: 700 }}>
                    <Spinner /> Memuat data site…
                  </div>
                  <div style={{ height: 6, background: "#EEF1F6", borderRadius: 999, overflow: "hidden", marginTop: 12, position: "relative" }}>
                    {loadPct == null ? (
                      <div style={{ position: "absolute", top: 0, bottom: 0, width: "35%", background: GRAD, borderRadius: 999, animation: "mhIndet 1.1s infinite" }} />
                    ) : (
                      <div style={{ width: `${loadPct}%`, height: "100%", background: GRAD, borderRadius: 999, transition: "width .25s ease" }} />
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.lo, marginTop: 8 }}>
                    {loaded.toLocaleString()}{est > 0 ? ` / ${est.toLocaleString()}` : ""} baris{loadPct != null ? ` · ${loadPct}%` : ""}
                  </div>
                </div>
              </td></tr>
            )}
            {!loading && shown.length === 0 && <tr><td colSpan={COLUMNS.length} style={{ padding: 22, textAlign: "center", color: T.lo }}>Tidak ada data yang cocok.</td></tr>}
            {!loading && shown.map((s, i) => (
              <tr key={`${s.site_id}-${i}`} style={{ borderTop: `1px solid ${T.line}` }}>
                {COLUMNS.map((c) => { const v = s[c.key]; return <td key={c.key} style={{ padding: "8px 12px", color: c.strong ? T.hi : T.mid, fontWeight: c.strong ? 700 : 400 }}>{v == null || v === "" ? "-" : String(v)}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && filtered.length > MAX_ROWS && (
        <div style={{ padding: "8px 16px", fontSize: 11.5, color: T.lo, borderTop: `1px solid ${T.line}` }}>
          Menampilkan {MAX_ROWS.toLocaleString()} dari {filtered.length.toLocaleString()} baris - gunakan filter kolom untuk mempersempit.
        </div>
      )}

      {openCol && (
        <FilterMenu t={FT_T} rect={rect} label={COLUMNS.find((c) => c.key === openCol)?.label || openCol}
          options={optionsFor(allSites, filters, FCOLS, openCol)} selected={filters[openCol] || []}
          onChange={(vals) => setFilters((f) => ({ ...f, [openCol]: vals }))} onClose={() => setOpenCol("")} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  STRUKTUR BRANCH & BRAND - pohon Region → Brand → Branch + akun termapping.
//  Sumber struktur: mh_branch_brand_list. Akun: mh_list_assignments.
// ═══════════════════════════════════════════════════════════════════════════
const nb = (s) => String(s ?? "").trim().toLowerCase();       // normalize brand
const brandLabel = (b) => (b === "tri" ? "3ID" : b === "im3" ? "IM3" : String(b || "").toUpperCase());
const brandColor = (b) => (b === "tri" ? T.tri : T.im3);

function HierarchyView() {
  const [combos, setCombos] = useState([]);
  const [assigns, setAssigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bb, as] = await Promise.all([
        supabaseMarta.rpc("mh_branch_brand_list"),
        supabaseMarta.rpc("mh_list_assignments"),
      ]);
      setCombos(bb.data || []);
      setAssigns(as.data || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const heads = useMemo(() => assigns.filter((a) => a.role === "head"), [assigns]);

  // Bangun hirarki region → brand → branch, lampirkan akun.
  const tree = useMemo(() => {
    const norm = (s) => String(s ?? "").trim();
    const regions = new Map();
    const getRegion = (name) => {
      const key = name || "-";
      if (!regions.has(key)) regions.set(key, { region: key, brands: new Map() });
      return regions.get(key);
    };
    for (const c of combos) {
      if (!c.branch_id || !c.brand) continue;
      const region = norm(c.region) || "-";
      const brand = nb(c.brand);
      const rNode = getRegion(region);
      if (!rNode.brands.has(brand)) rNode.brands.set(brand, { brand, tmv: [], branches: new Map() });
      const brNode = rNode.brands.get(brand);
      if (!brNode.branches.has(c.branch_id))
        brNode.branches.set(c.branch_id, {
          branch_id: c.branch_id, branch: norm(c.branch) || c.branch_id, region, brand,
          bmeRge: [], sites: Number(c.sites ?? c.site_count ?? c.count ?? 0),
        });
    }
    for (const a of assigns) {
      const brand = nb(a.brand);
      if (a.role === "tmv") {
        const rNode = regions.get(norm(a.region) || "-"); if (!rNode) continue;
        const brNode = rNode.brands.get(brand); if (!brNode) continue;
        brNode.tmv.push(a);
      } else if (a.role === "bme_rge") {
        for (const rNode of regions.values()) {
          const brNode = rNode.brands.get(brand); if (!brNode) continue;
          const bn = brNode.branches.get(a.branch_id);
          if (bn) { bn.bmeRge.push(a); break; }
        }
      }
    }
    const t = q.trim().toLowerCase();
    let arr = [...regions.values()].map((r) => ({
      region: r.region,
      brands: [...r.brands.values()].map((b) => ({
        ...b, branches: [...b.branches.values()].sort((x, y) => x.branch.localeCompare(y.branch)),
      })).sort((x, y) => x.brand.localeCompare(y.brand)),
    })).sort((x, y) => x.region.localeCompare(y.region));
    if (t) {
      arr = arr.map((r) => ({
        region: r.region,
        brands: r.brands.map((b) => ({ ...b, branches: b.branches.filter((bn) => bn.branch.toLowerCase().includes(t)) }))
          .filter((b) => b.branches.length),
      })).filter((r) => r.brands.length);
    }
    return arr;
  }, [combos, assigns, q]);

  const summary = useMemo(() => {
    let branches = 0, filled = 0, empty = 0;
    const brandSet = new Set(), regionSet = new Set();
    for (const r of tree) {
      regionSet.add(r.region);
      for (const b of r.brands) {
        brandSet.add(b.brand);
        for (const bn of b.branches) {
          branches++;
          // BME & RGE fungsional sama → cukup ada minimal satu petugas lapangan.
          if (bn.bmeRge.length > 0) filled++; else empty++;
        }
      }
    }
    return { regions: regionSet.size, brands: brandSet.size, branches, filled, empty };
  }, [tree]);

  const toggle = (k) => setExpanded((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const allKeys = useMemo(() => {
    const ks = [];
    for (const r of tree) { ks.push("r:" + r.region); for (const b of r.brands) ks.push("b:" + r.region + ":" + b.brand); }
    return ks;
  }, [tree]);
  const allOpen = allKeys.length > 0 && allKeys.every((k) => expanded.has(k));

  return (
    <div style={{ maxWidth: 1600, width: "100%" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.hi, marginBottom: 3 }}>Struktur Branch & Brand</div>
      <div style={{ fontSize: 13, color: T.mid, marginBottom: 14 }}>Hirarki wilayah & pemetaan akun. Badge <b>Kosong</b> menandai branch×brand yang belum punya petugas lapangan. BME/RGE hanya label - fungsinya sama.</div>

      {heads.length > 0 && (
        <div style={{ ...card, marginBottom: 12, display: "flex", alignItems: "center", gap: 12, background: "linear-gradient(135deg,#FFF5F7,#FFFFFF)", borderColor: T.primaryBd }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: GRAD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Network size={19} color="#fff" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", color: T.primaryD, textTransform: "uppercase" }}>Head of Trade Marketing & Visibility</div>
            <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 6 }}>{heads.map((h) => <AccountChip key={h.id} a={h} />)}</div>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 1, background: T.line }}>
          {[["Region", summary.regions], ["Brand", summary.brands], ["Branch", summary.branches], ["Terisi", summary.filled, T.success], ["Kosong", summary.empty, T.error]].map(([label, val, col]) => (
            <div key={label} style={{ background: "#fff", padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: loading ? T.lo : (col || T.hi), lineHeight: 1 }}>{loading ? "…" : Number(val || 0).toLocaleString()}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.lo, marginTop: 4, textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: `1px solid ${T.line}`, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={15} color={T.lo} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari branch…" style={{ ...inp, paddingLeft: 32 }} />
          </div>
          <button onClick={() => setExpanded(allOpen ? new Set() : new Set(allKeys))} style={btn}>{allOpen ? "Tutup semua" : "Buka semua"}</button>
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        <style>{`@keyframes mhSpin{to{transform:rotate(360deg)}}`}</style>
        {loading && <div style={{ padding: 28, textAlign: "center", color: T.lo, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Spinner /> Memuat struktur…</div>}
        {!loading && tree.length === 0 && <div style={{ padding: 28, textAlign: "center", color: T.lo, fontSize: 13 }}>Belum ada data branch / brand.</div>}
        {!loading && tree.map((r, ri) => {
          const rKey = "r:" + r.region;
          const rOpen = expanded.has(rKey);
          const rBranches = r.brands.reduce((s, b) => s + b.branches.length, 0);
          return (
            <div key={r.region} style={{ borderTop: ri ? `1px solid ${T.line}` : "none" }}>
              <TreeRow depth={0} open={rOpen} onClick={() => toggle(rKey)} icon={<Store size={16} color={T.primary} />}
                title={r.region} meta={`${r.brands.length} brand · ${rBranches} branch`} />
              {rOpen && r.brands.map((b) => {
                const bKey = "b:" + r.region + ":" + b.brand;
                const bOpen = expanded.has(bKey);
                return (
                  <div key={b.brand}>
                    <TreeRow depth={1} open={bOpen} onClick={() => toggle(bKey)}
                      icon={<span style={{ ...brandTag, color: brandColor(b.brand), borderColor: brandColor(b.brand) + "55", background: brandColor(b.brand) + "14" }}>{brandLabel(b.brand)}</span>}
                      right={<>
                        {b.tmv.length > 0
                          ? <span style={{ fontSize: 11.5, color: T.mid }}>TMV: {b.tmv.map((t) => t.full_name || t.email).join(", ")}</span>
                          : <span style={tagWarn}>TMV belum ada</span>}
                        <span style={{ fontSize: 11.5, color: T.lo, marginLeft: 8 }}>{b.branches.length} branch</span>
                      </>} />
                    {bOpen && b.branches.map((bn) => <BranchRow key={bn.branch_id} bn={bn} />)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TreeRow({ depth = 0, open, onClick, icon, title, meta, right }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", paddingLeft: 14 + depth * 22, cursor: "pointer", background: hover ? "#F7F9FC" : "#fff", borderTop: depth ? `1px solid ${T.line}` : "none" }}>
      <span style={{ color: T.lo, display: "flex", transition: "transform .15s", transform: open ? "rotate(90deg)" : "none" }}><ChevronRight size={15} /></span>
      <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>
      {title && <span style={{ fontSize: 13.5, fontWeight: 700, color: T.hi }}>{title}</span>}
      {meta && <span style={{ fontSize: 11.5, color: T.mid }}>{meta}</span>}
      {right && <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>{right}</span>}
    </div>
  );
}

function BranchRow({ bn }) {
  // BME & RGE fungsional identik → cukup ada minimal satu petugas lapangan.
  // Label BME/RGE tetap ditampilkan sebagai remark per akun.
  const filled = bn.bmeRge.length > 0;
  const cov = filled
    ? { t: "Terisi", c: T.success, bg: T.successBg, icon: <UserCheck size={11} /> }
    : { t: "Kosong", c: T.error, bg: T.errorBg, icon: <UserX size={11} /> };
  return (
    <div style={{ padding: "10px 14px 12px 80px", borderTop: `1px solid ${T.line}`, background: "#FCFDFE" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.hi }}>{bn.branch}</span>
        {bn.sites > 0 && <span style={{ fontSize: 11, color: T.lo }}>· {bn.sites.toLocaleString()} site</span>}
        <span style={{ ...covPill, color: cov.c, background: cov.bg, borderColor: cov.c + "33", marginLeft: "auto" }}>{cov.icon} {cov.t}</span>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: T.lo, textTransform: "uppercase", letterSpacing: ".04em", alignSelf: "center" }}>Petugas Lapangan</span>
        {bn.bmeRge.length === 0
          ? <span style={{ fontSize: 11.5, color: T.lo, fontStyle: "italic" }}>- belum ada -</span>
          : <>
              {bn.bmeRge.map((a) => <AccountChip key={a.id} a={a} tag="BME/RGE" />)}
            </>}
      </div>
    </div>
  );
}

function AccountChip({ a, tag }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 999, padding: "3px 9px", color: T.hi }}>
      <span title={a.logged_in ? "Aktif" : "Menunggu login"} style={{ width: 7, height: 7, borderRadius: "50%", background: a.logged_in ? T.success : T.warning, flexShrink: 0 }} />
      {a.full_name || a.email}
      {tag && <span style={{ fontSize: 9, fontWeight: 800, color: T.mid, background: "#F1F3F7", borderRadius: 5, padding: "1px 5px", letterSpacing: ".03em" }}>{tag}</span>}
    </span>
  );
}

const brandTag = { fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 7, border: "1px solid" };
const tagWarn = { fontSize: 10.5, fontWeight: 800, color: "#8a5b00", background: "#FFFDE7", border: "1px solid #F0E3B0", borderRadius: 999, padding: "2px 8px" };
const covPill = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, padding: "2px 9px", borderRadius: 999, border: "1px solid" };

const card = { background: "#FFFFFF", border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, fontSize: 13 };
const note = { background: "#FFFDE7", border: `1px solid #F0E3B0`, color: "#7a5b00", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5 };
// Semua tombol: satu baris (nowrap), ikon rapi dengan gap.
const btn = { padding: "8px 14px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1 };
const iconBtn = { ...btn, padding: "6px 8px" };
const GRAD = "linear-gradient(135deg, #ED1C24 0%, #C6168D 100%)"; // gradasi primary
const pbtn = { ...btn, background: GRAD, color: "#fff", border: "none", padding: "9px 16px" };
const disabledPbtn = { background: "#F1F2F5", color: T.lo, boxShadow: "none", cursor: "not-allowed" };
const pill = { fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, display: "inline-block" };
const linkBtn = { background: "none", border: "none", color: T.hi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 0 };
const inp = { padding: "8px 11px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.hi, fontSize: 13, outline: "none", boxSizing: "border-box", width: "100%" };
// Semua dropdown: panah kustom dengan jarak rapi dari tepi (tidak mepet).
const CHEV = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>";
const selectStyle = { ...inp, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", cursor: "pointer", backgroundImage: `url("${CHEV}")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 11px center", backgroundSize: "13px", paddingRight: 32 };
const muted = { fontSize: 12.5, color: T.mid };
const chip = { fontSize: 12, fontWeight: 700, background: "#fff", border: `1px solid ${T.line}`, borderRadius: 999, padding: "4px 10px", color: T.hi };
const statusPill = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, padding: "5px 11px", borderRadius: 999, border: "1px solid" };
