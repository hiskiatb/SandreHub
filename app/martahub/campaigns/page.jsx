"use client";
/**
 * /martahub/campaigns - Kelola Campaign (CMS desktop). Campaign reusable
 * spt "Market Blitz Sabtu" - SPM Sumatera (semua region) & Head TMV (region
 * sendiri) bikin campaign dgn TEMPLATE nama event WAJIB (placeholder
 * {BRANCH}/{BRAND}, otomatis diganti sesuai branch/brand masing2 BME/RGE).
 *
 * Plan campaign TETAP lewat mh_activities biasa (draft/plan_submitted/
 * completed - siklus SAMA PERSIS dgn plan lain) - campaign_id cuma
 * "remarks/tag" yg di-AUTO-TAG server-side (trigger
 * _mh_activities_auto_tag_campaign, lihat migrasi add_mh_campaigns_table_
 * and_autotag) begitu event_name seseorang cocok PERSIS dgn template -
 * halaman ini TIDAK PERNAH menandai plan secara manual.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Megaphone, Plus, Pencil, Trash2, Loader2, X, Users, Check } from "lucide-react";
import MartaShell, { T, FONT, brandLabel } from "../components/MartaShell";
import supabaseMarta from "../../../lib/supabaseMarta";
import { loadBranchMap } from "../../../lib/martaScope";
import { CATEGORIES } from "../m/_shared/planData";

const REGIONS = ["NORTH SUMATERA", "CENTRAL SUMATERA", "SOUTH SUMATERA"];

export default function CampaignsPage() {
  return (
    <MartaShell active="campaigns" title="Kelola Campaign">
      {(ctx) => <Body callerEmail={ctx?.session?.user?.email} role={ctx?.profile?.role} region={ctx?.profile?.region} />}
    </MartaShell>
  );
}

function Body({ callerEmail, role, region }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null); // null | {} (baru) | {...campaign} (edit)
  const [saving, setSaving] = useState(false);
  const [compliance, setCompliance] = useState(null); // { campaign, rows }

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { data, error } = await supabaseMarta.rpc("mh_campaigns_list_for_me", { p_caller_email: callerEmail });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(e.message || "Gagal memuat campaign");
    } finally {
      setLoading(false);
    }
  }, [callerEmail]);
  useEffect(() => { if (callerEmail) load(); }, [callerEmail, load]);

  async function onSave(f) {
    setSaving(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_campaign_upsert", {
        p_caller_email: callerEmail, p_id: f.id || null, p_name: f.name, p_keyword: f.keyword,
        p_plan_date: f.plan_date, p_region: role === "head" ? region : (f.region || null), p_brand: f.brand || null, p_status: f.status || "active",
        p_branch_name: f.branch_name || null, p_default_categories: f.default_categories?.length ? f.default_categories : null,
      });
      if (error) throw error;
      setForm(null);
      await load();
    } catch (e) {
      setErr(e.message || "Gagal menyimpan campaign");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id) {
    if (!confirm("Hapus campaign ini? Plan yg sudah dibuat & sudah ter-tag TIDAK ikut terhapus, cuma tag campaign-nya yg lepas.")) return;
    try {
      const { error } = await supabaseMarta.rpc("mh_campaign_delete", { p_caller_email: callerEmail, p_id: id });
      if (error) throw error;
      await load();
    } catch (e) {
      alert(e.message || "Gagal menghapus campaign");
    }
  }

  async function openCompliance(c) {
    setCompliance({ campaign: c, rows: null });
    try {
      const { data, error } = await supabaseMarta.rpc("mh_campaign_compliance_report", { p_caller_email: callerEmail, p_campaign_id: c.id });
      if (error) throw error;
      setCompliance({ campaign: c, rows: data || [] });
    } catch (e) {
      setCompliance({ campaign: c, rows: [], err: e.message });
    }
  }

  return (
    <div style={{ fontFamily: FONT, maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: T.mid }}>
          Campaign reusable - format nama event wajib, auto-tag ke plan yg cocok formatnya. Placeholder: <code>{"{BRANCH}"}</code> & <code>{"{BRAND}"}</code>.
        </div>
        <button onClick={() => setForm({})} style={btnPrimary}>
          <Plus size={15} /> Campaign Baru
        </button>
      </div>

      {err && <div style={{ padding: "10px 12px", borderRadius: 10, background: T.errorBg, color: T.error, fontSize: 12.5, marginBottom: 14 }}>{err}</div>}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={20} color={T.primary} style={{ animation: "cspin .9s linear infinite" }} /></div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: T.lo, fontSize: 13 }}>Belum ada campaign.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((c) => (
            <div key={c.id} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: T.primaryBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Megaphone size={18} color={T.primary} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: T.hi }}>{c.name}</span>
                  {c.status !== "active" && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "#EEE", color: T.lo }}>ARSIP</span>}
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: T.mid, fontFamily: "monospace" }}>{c.keyword}...</div>
                <div style={{ marginTop: 4, fontSize: 11.5, color: T.lo }}>
                  {new Date(c.plan_date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                  {" · "}{c.branch_name || c.region || "Semua Region"}{" · "}{c.brand ? brandLabel(c.brand) : "Semua Brand"}
                  {c.default_categories?.length ? ` · ${c.default_categories.join(", ")}` : ""}
                  {c.created_by_name ? ` · dibuat oleh ${c.created_by_name}` : ""}
                </div>
              </div>
              <button onClick={() => openCompliance(c)} style={btnGhost}><Users size={14} /> Kepatuhan</button>
              <button onClick={() => setForm(c)} style={btnGhost}><Pencil size={14} /></button>
              <button onClick={() => onDelete(c.id)} style={{ ...btnGhost, color: T.error }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {form && (
        <CampaignForm form={form} role={role} region={region} saving={saving} onCancel={() => setForm(null)} onSave={onSave} />
      )}

      {compliance && (
        <ComplianceModal state={compliance} onClose={() => setCompliance(null)} />
      )}

      <style jsx>{`@keyframes cspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const btnPrimary = { display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, border: "none", background: T.primary, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT };
const btnGhost = { display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: "#fff", color: T.mid, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, flexShrink: 0 };

function CampaignForm({ form, role, region, saving, onCancel, onSave }) {
  const [name, setName] = useState(form.name || "");
  const [keyword, setKeyword] = useState(form.keyword || "");
  const [planDate, setPlanDate] = useState(form.plan_date || "");
  const [rowRegion, setRowRegion] = useState(form.region || "");
  const [brand, setBrand] = useState(form.brand || "");
  const [status, setStatus] = useState(form.status || "active");
  const [branchName, setBranchName] = useState(form.branch_name || "");
  const [defaultCategory, setDefaultCategory] = useState(form.default_categories?.[0] || "");

  const canPickRegion = role === "spm_sumatera" || role === "admin";
  // Mode cakupan Branch - "Semua Branch" (branchName kosong, cakupan cuma
  // dari Region+Brand di atas), "Per Region" (SAMA dgn "Semua Branch" scr
  // data - region sudah cukup jadi filter - beda cuma di UI label spy jelas
  // maksudnya "semua branch DI region itu"), atau "Branch Spesifik" (pilih
  // 1 branch persis). role=head SELALU dlm cakupan region-nya sendiri
  // (region terkunci di atas), jadi cuma 2 mode yg relevan utknya.
  const [scopeMode, setScopeMode] = useState(() => (form.branch_name ? "branch" : (form.region || role === "head") ? "region" : "all"));

  const [branchMap, setBranchMap] = useState(null); // Map(id -> {name, region}), null = belum dimuat
  useEffect(() => { loadBranchMap().then(setBranchMap); }, []);
  const branchOptions = useMemo(() => {
    if (!branchMap) return [];
    const effRegion = role === "head" ? region : rowRegion;
    const names = new Set();
    for (const b of branchMap.values()) {
      if (effRegion && b.region !== effRegion) continue;
      if (b.name) names.add(b.name);
    }
    return Array.from(names).sort();
  }, [branchMap, role, region, rowRegion]);

  const scopeModes = canPickRegion
    ? [{ key: "all", label: "Semua Branch" }, { key: "region", label: "Per Region" }, { key: "branch", label: "Branch Spesifik" }]
    : [{ key: "region", label: `Semua Branch di ${region}` }, { key: "branch", label: "Branch Spesifik" }];

  function pickScopeMode(m) {
    setScopeMode(m);
    if (m === "all") { setRowRegion(""); setBranchName(""); }
    if (m === "region") { setBranchName(""); if (role === "head") setRowRegion(region); }
    if (m === "branch") { if (role === "head") setRowRegion(region); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,20,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 22, width: 460, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.hi }}>{form.id ? "Edit Campaign" : "Campaign Baru"}</div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: T.lo }}><X size={18} /></button>
        </div>

        <Field label="Nama Campaign">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Market Blitz Sabtu" style={inputStyle} />
        </Field>
        <Field label="Keyword Awalan Nama Event (wajib)" hint="BME/RGE cukup ketik ini di AWAL nama event (besar/kecil bebas) - sisanya (Nama Branch + Brand) DISUSUN OTOMATIS, bukan diketik manual.">
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Market Blitz Sabtu_" style={{ ...inputStyle, fontFamily: "monospace" }} />
          {keyword.trim() && <div style={{ marginTop: 5, fontSize: 11, color: T.lo }}>Contoh hasil otomatis: <span style={{ fontFamily: "monospace" }}>{keyword.trim()}Nama Branch_IM3</span></div>}
        </Field>
        <Field label="Tanggal">
          <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} style={inputStyle} />
        </Field>

        <Field label="Activity Category (wajib)" hint="Ditentukan di sini - BME/RGE tidak pilih sendiri lagi, Step 1 Wizard mereka terkunci otomatis.">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setDefaultCategory(c)}
                style={{
                  padding: "7px 13px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                  border: `1.5px solid ${defaultCategory === c ? T.primary : T.line}`,
                  background: defaultCategory === c ? T.primaryBg : "#fff",
                  color: defaultCategory === c ? T.primary : T.mid,
                }}>
                {c}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Cakupan Branch">
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {scopeModes.map((m) => (
              <button key={m.key} type="button" onClick={() => pickScopeMode(m.key)}
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: 9, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT, textAlign: "center",
                  border: `1.5px solid ${scopeMode === m.key ? T.primary : T.line}`,
                  background: scopeMode === m.key ? T.primaryBg : "#fff",
                  color: scopeMode === m.key ? T.primary : T.mid,
                }}>
                {m.label}
              </button>
            ))}
          </div>
          {/* Region hanya bisa dipilih spm_sumatera/admin (head SELALU
              region sendiri, sudah terkunci) - tampil begitu mode BUKAN
              "Semua Branch" (baik "Per Region" maupun "Branch Spesifik"
              perlu tau region-nya, "Branch Spesifik" utk mempersempit
              pilihan branch di bawahnya). */}
          {canPickRegion && scopeMode !== "all" && (
            <select value={rowRegion} onChange={(e) => { setRowRegion(e.target.value); setBranchName(""); }} style={{ ...inputStyle, marginBottom: scopeMode === "branch" ? 8 : 0 }}>
              <option value="">Pilih Region...</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          {scopeMode === "branch" && (
            <select value={branchName} onChange={(e) => setBranchName(e.target.value)} style={inputStyle} disabled={canPickRegion && !rowRegion}>
              <option value="">{canPickRegion && !rowRegion ? "Pilih region dulu..." : "Pilih Branch..."}</option>
              {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
        </Field>

        <Field label="Brand">
          <select value={brand} onChange={(e) => setBrand(e.target.value)} style={inputStyle}>
            <option value="">Semua Brand</option>
            <option value="im3">IM3</option>
            <option value="tri">3ID</option>
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            <option value="active">Aktif</option>
            <option value="archived">Arsip</option>
          </select>
        </Field>

        <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={btnGhost}>Batal</button>
          <button
            disabled={saving || !name.trim() || !keyword.trim() || !planDate || !defaultCategory || (scopeMode === "branch" && !branchName)}
            onClick={() => onSave({
              id: form.id, name, keyword, plan_date: planDate,
              region: rowRegion, brand, status, branch_name: scopeMode === "branch" ? branchName : "",
              default_categories: defaultCategory ? [defaultCategory] : [],
            })}
            style={{ ...btnPrimary, opacity: saving || !name.trim() || !keyword.trim() || !planDate || !defaultCategory || (scopeMode === "branch" && !branchName) ? 0.5 : 1 }}>
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mid, marginBottom: 5 }}>{label}</div>
      {children}
      {hint && <div style={{ marginTop: 4, fontSize: 10.5, color: T.lo }}>{hint}</div>}
    </div>
  );
}
const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.line}`, fontSize: 13, fontFamily: FONT, boxSizing: "border-box" };

function ComplianceModal({ state, onClose }) {
  const { campaign, rows, err } = state;
  const grouped = {};
  for (const r of rows || []) (grouped[r.branch_name] ||= []).push(r);
  const branches = Object.keys(grouped).sort();
  const totalDone = (rows || []).filter((r) => r.has_plan).length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,20,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 22, width: 560, maxWidth: "100%", maxHeight: "80vh", overflowY: "auto", fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.hi }}>Kepatuhan - {campaign.name}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.lo }}><X size={18} /></button>
        </div>
        {rows && <div style={{ fontSize: 12.5, color: T.mid, marginBottom: 14 }}>{totalDone} / {rows.length} BME/RGE sudah submit plan.</div>}

        {err && <div style={{ padding: "10px 12px", borderRadius: 10, background: T.errorBg, color: T.error, fontSize: 12.5 }}>{err}</div>}
        {rows === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><Loader2 size={18} color={T.primary} style={{ animation: "cspin .9s linear infinite" }} /></div>
        ) : rows.length === 0 && !err ? (
          <div style={{ textAlign: "center", padding: 20, color: T.lo, fontSize: 13 }}>Tidak ada BME/RGE dlm cakupan campaign ini.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {branches.map((b) => (
              <div key={b}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: T.hi, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>{b}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {grouped[b].map((p) => (
                    <div key={p.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: 8, background: p.has_plan ? T.successBg : "#F6F7F9" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.hi }}>{p.user_name} <span style={{ color: T.lo, fontWeight: 500 }}>({brandLabel(p.brand)})</span></span>
                      {p.has_plan ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: T.success }}><Check size={13} /> Sudah</span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 800, color: T.error }}>Belum</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
