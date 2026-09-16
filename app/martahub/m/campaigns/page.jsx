"use client";
/**
 * /martahub/m/campaigns - Kelola Campaign versi MOBILE. Sebelumnya
 * manajemen campaign ("Market Blitz Sabtu" dkk) cuma ada di CMS desktop
 * (/martahub/campaigns) - user minta bisa dibuat langsung dari mobile juga.
 *
 * Akses SAMA PERSIS dgn aturan yg sudah disepakati sebelumnya: SPM Sumatera
 * (semua region) & Head TMV (region sendiri saja) - BUKAN Brand TMV, BUKAN
 * BSM (BSM sejajar dgn BME/RGE, bukan di atasnya). Role lain yg nyasar ke
 * sini (deep link dsb) dikasih layar "tidak punya akses", bukan redirect
 * diam2 - RPC-nya sendiri (mh_campaign_upsert/delete) TETAP menolak di
 * server-side apa pun yg terjadi di client, jadi ini murni soal UX.
 *
 * Reuse RPC yg SAMA dgn CMS desktop (mh_campaigns_list_for_me,
 * mh_campaign_upsert, mh_campaign_delete, mh_campaign_compliance_report) -
 * TIDAK ada RPC baru, cuma tampilan mobile utk RPC yg sudah ada.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Megaphone, Pencil, Trash2, Users, X, Check, ChevronDown, Loader2 } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import { loadBranchMap } from "../../../../lib/martaScope";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND, NAV_HEIGHT } from "../_shared/MobileShell";
import { REGIONS, CATEGORIES } from "../_shared/planData";

function brandLabel(b) { return b === "tri" ? "3ID" : b === "im3" ? "IM3" : "Semua Brand"; }

// Filter periode (bulan) di header - SAMA PERSIS pola/kegunaannya dgn
// month picker di /martahub/m/report (filter berdasar plan_date campaign).
// "Semua" tetap jadi opsi paling atas. Daftar bulan mulai dari September
// 2026 (bulan fitur Campaign ini diluncurkan) TERUS KE DEPAN saja - TIDAK
// ada bulan sebelum itu (campaign yg sudah lewat/berjalan dari sana, bukan
// riwayat sebelum fitur ini ada) - beda dgn report Kecamatan Fokus yg
// memang butuh lihat bulan2 lampau.
const CAMPAIGN_START_YEAR = 2026, CAMPAIGN_START_MONTH = 8; // 8 = September (0-indexed)
const CAMPAIGN_MONTHS_AHEAD = 11; // rentang ke depan yg ditampilkan (~1 tahun berjalan)
function monthOptionsForCampaigns() {
  const start = new Date(CAMPAIGN_START_YEAR, CAMPAIGN_START_MONTH, 1);
  const now = new Date();
  const cursor = now < start ? start : now;
  const span = (cursor.getFullYear() - CAMPAIGN_START_YEAR) * 12 + (cursor.getMonth() - CAMPAIGN_START_MONTH) + CAMPAIGN_MONTHS_AHEAD;
  const opts = [{ key: "all", label: "Semua Bulan" }];
  for (let i = 0; i <= span; i++) {
    const d = new Date(CAMPAIGN_START_YEAR, CAMPAIGN_START_MONTH + i, 1);
    opts.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("id-ID", { month: "long", year: "numeric" }) });
  }
  return opts;
}

export default function CampaignsMobilePage() {
  const router = useRouter();
  const { loading: sessionLoading, email, scope } = useMartaSession();
  const canManage = scope?.role === "spm_sumatera" || scope?.role === "head";

  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null); // null | {} (baru) | {...campaign} (edit)
  const [saving, setSaving] = useState(false);
  const [compliance, setCompliance] = useState(null); // { campaign, rows }
  const months = monthOptionsForCampaigns();
  const [monthKey, setMonthKey] = useState("all");

  const load = useCallback(async () => {
    if (!email) return;
    setErr("");
    try {
      const { data, error } = await supabaseMarta.rpc("mh_campaigns_list_for_me", { p_caller_email: email });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(e.message || "Gagal memuat campaign");
      setRows([]);
    }
  }, [email]);

  useEffect(() => {
    if (sessionLoading || !canManage || !email) return;
    load();
  }, [sessionLoading, canManage, email, load]);

  async function onSave(f) {
    setSaving(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_campaign_upsert", {
        p_caller_email: email, p_id: f.id || null, p_name: f.name, p_keyword: f.keyword,
        p_plan_date: f.plan_date, p_region: scope?.role === "head" ? scope?.region : (f.region || null), p_brand: f.brand || null, p_status: f.status || "active",
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
    if (!confirm("Hapus campaign ini? Plan yang sudah dibuat & sudah ter-tag TIDAK ikut terhapus, cuma tag campaign-nya yang lepas.")) return;
    try {
      const { error } = await supabaseMarta.rpc("mh_campaign_delete", { p_caller_email: email, p_id: id });
      if (error) throw error;
      await load();
    } catch (e) {
      alert(e.message || "Gagal menghapus campaign");
    }
  }

  async function openCompliance(c) {
    setCompliance({ campaign: c, rows: null });
    try {
      const { data, error } = await supabaseMarta.rpc("mh_campaign_compliance_report", { p_caller_email: email, p_campaign_id: c.id });
      if (error) throw error;
      setCompliance({ campaign: c, rows: data || [] });
    } catch (e) {
      setCompliance({ campaign: c, rows: [], err: e.message || "Gagal memuat kepatuhan" });
    }
  }

  const visibleRows = monthKey === "all" ? rows : (rows || []).filter((c) => (c.plan_date || "").slice(0, 7) === monthKey);

  if (sessionLoading) {
    return <MobileShell active="home"><div style={{ padding: "60px 0" }}><ShellSpinner /></div></MobileShell>;
  }

  const fab = canManage ? (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: `calc(env(safe-area-inset-bottom,0px) + ${NAV_HEIGHT}px)`, zIndex: 35, pointerEvents: "none" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", position: "relative", height: 0 }}>
        <button onClick={() => setForm({})} aria-label="Buat Campaign"
          style={{
            pointerEvents: "auto", position: "absolute", right: 10, bottom: 10,
            display: "flex", alignItems: "center", gap: 7, padding: "13px 20px", borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.55)",
            background: BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer",
            boxShadow: [
              "0 1px 0 rgba(255,255,255,0.45) inset",
              "0 -6px 10px rgba(0,0,0,0.12) inset",
              "0 3px 8px rgba(17,17,20,0.20)",
              "0 16px 36px rgba(17,17,20,0.24)",
            ].join(", "),
          }}>
          <Plus size={16} strokeWidth={2.75} /> Buat Campaign
        </button>
      </div>
    </div>
  ) : null;

  return (
    <MobileShell active="home" fab={fab}>
      <div style={{
        position: "sticky", top: 0, zIndex: 20, maxWidth: 480, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top,0px) + 16px) 20px 14px", fontFamily: FF,
        background: "rgba(244,245,247,0.86)", backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
            <button onClick={() => router.push("/martahub/m")} aria-label="Kembali ke Beranda"
              style={{
                width: 34, height: 34, borderRadius: 11, background: "#FFFFFF", border: "1px solid #E9EAEE",
                boxShadow: "0 1px 4px rgba(23,24,28,0.06)", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#3A3A44", flexShrink: 0,
              }}>
              <ArrowLeft size={16} strokeWidth={2.4} />
            </button>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", color: "#17181C" }}>Kelola Campaign</div>
          </div>
          {canManage && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
                style={{
                  appearance: "none", WebkitAppearance: "none", background: "#F6F7F9", border: "1px solid #ECEDF0",
                  borderRadius: 999, padding: "8px 30px 8px 14px", fontSize: 12.5, fontWeight: 700, color: "#17181C",
                  fontFamily: FF, cursor: "pointer",
                }}>
                {months.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#8A8A96" }} />
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 20px 32px", fontFamily: FF }}>
        {!canManage ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <Megaphone size={30} color="#C7C8D1" />
            <div style={{ marginTop: 12, fontSize: 13.5, fontWeight: 700, color: "#8A8A96" }}>Menu ini khusus SPM Sumatera & Head TMV.</div>
          </div>
        ) : (
          <>
            {err && <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#FFEBEE", color: "#C62828", fontSize: 12.5, fontWeight: 600 }}>{err}</div>}

            {rows === null ? (
              <div style={{ padding: "40px 0" }}><ShellSpinner /></div>
            ) : visibleRows.length === 0 ? (
              // Gaya SAMA PERSIS dgn empty-state lain di app (mis. "Belum
              // ada aktivitas" di Beranda/Aktivitas) - kotak dashed polos,
              // ikon abu2 netral (BUKAN badge bulat berwarna), teks saja
              // TANPA tombol CTA kedua di dalamnya - aksi "buat" sudah ada
              // di tombol + header, jadi tombol duplikat di sini dihapus
              // spy tidak dobel & konsisten dgn pola empty-state lain.
              <div style={{ textAlign: "center", padding: "40px 20px", background: "#FFFFFF", border: "1px dashed #D8D9E0", borderRadius: 16 }}>
                <Megaphone size={22} color="#C7C8D1" style={{ marginBottom: 4 }} />
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "#3A3A44" }}>{monthKey === "all" ? "Belum ada campaign" : "Tidak ada campaign di bulan ini"}</div>
                <div style={{ marginTop: 3, fontSize: 11.5, color: "#8A8A96" }}>Tekan tombol &quot;Buat Campaign&quot; di bawah untuk membuat campaign baru.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleRows.map((c) => (
                  <div key={c.id} style={{ background: "#FFFFFF", border: "1px solid #EEEFF2", borderRadius: 16, padding: "14px 14px", boxShadow: "0 1px 4px rgba(23,24,28,0.04)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(237,28,36,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Megaphone size={17} color="#ED1C24" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#17181C" }}>{c.name}</span>
                          {c.status !== "active" && <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "#EEE", color: "#8A8A96" }}>ARSIP</span>}
                        </div>
                        <div style={{ marginTop: 3, fontSize: 11, color: "#8A8A96", fontFamily: "monospace", wordBreak: "break-word" }}>{c.keyword}...</div>
                        <div style={{ marginTop: 5, fontSize: 11, color: "#8A8A96" }}>
                          {new Date(c.plan_date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                          <br />{c.branch_name || c.region || "Semua Region"} · {brandLabel(c.brand)}
                          {c.default_categories?.length ? ` · ${c.default_categories.join(", ")}` : ""}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <ActionBtn icon={Users} label="Kepatuhan" onClick={() => openCompliance(c)} />
                      <ActionBtn icon={Pencil} label="Edit" onClick={() => setForm(c)} />
                      <ActionBtn icon={Trash2} label="Hapus" danger onClick={() => onDelete(c.id)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {form && <CampaignFormSheet form={form} role={scope?.role} region={scope?.region} saving={saving} onCancel={() => setForm(null)} onSave={onSave} />}
      {compliance && <ComplianceSheet state={compliance} onClose={() => setCompliance(null)} />}
    </MobileShell>
  );
}

function ActionBtn({ icon: Icon, label, danger, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 8px", borderRadius: 10,
      border: `1px solid ${danger ? "#F5C6C6" : "#E9EAEE"}`, background: "#FFFFFF", color: danger ? "#C62828" : "#3A3A44",
      fontSize: 11.5, fontWeight: 700, fontFamily: FF, cursor: "pointer",
    }}>
      <Icon size={13} /> {label}
    </button>
  );
}

function CampaignFormSheet({ form, role, region, saving, onCancel, onSave }) {
  const [name, setName] = useState(form.name || "");
  const [keyword, setKeyword] = useState(form.keyword || "");
  const [planDate, setPlanDate] = useState(form.plan_date || "");
  const [rowRegion, setRowRegion] = useState(form.region || "");
  const [brand, setBrand] = useState(form.brand || "");
  const [status, setStatus] = useState(form.status || "active");
  const [branchName, setBranchName] = useState(form.branch_name || "");
  const [defaultCategory, setDefaultCategory] = useState(form.default_categories?.[0] || "");
  const canPickRegion = role === "spm_sumatera";

  // Mode cakupan Branch - SAMA PERSIS logikanya dgn versi desktop CMS
  // (/martahub/campaigns) - "Semua Branch", "Per Region", atau "Branch
  // Spesifik" (role=head selalu terkunci ke region-nya sendiri, cuma 2
  // mode yg relevan).
  const [scopeMode, setScopeMode] = useState(() => (form.branch_name ? "branch" : (form.region || role === "head") ? "region" : "all"));
  const [branchMap, setBranchMap] = useState(null);
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
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", fontFamily: FF }} onClick={onCancel}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(17,17,20,0.45)" }} />
      <div onClick={(e) => e.stopPropagation()} style={{
        position: "relative", width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF",
        borderRadius: "22px 22px 0 0", padding: "18px 20px calc(env(safe-area-inset-bottom,0px) + 20px)",
        maxHeight: "88vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C" }}>{form.id ? "Edit Campaign" : "Campaign Baru"}</div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8A96" }}><X size={19} /></button>
        </div>

        <FormField label="Nama Campaign">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Market Blitz Sabtu" style={inputStyle} />
        </FormField>
        <FormField label="Keyword Awalan Nama Event (wajib)" hint="BME/RGE cukup ketik ini di AWAL nama event (besar/kecil bebas) - sisanya (Nama Branch + Brand) disusun otomatis.">
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Market Blitz Sabtu_" style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12.5 }} />
          {keyword.trim() && <div style={{ marginTop: 5, fontSize: 10.5, color: "#8A8A96" }}>Contoh hasil otomatis: <span style={{ fontFamily: "monospace" }}>{keyword.trim()}Nama Branch_IM3</span></div>}
        </FormField>
        <FormField label="Tanggal">
          <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} style={inputStyle} />
        </FormField>
        <FormField label="Activity Category (wajib)" hint="Ditentukan di sini - BME/RGE tidak pilih sendiri lagi, Step 1 Wizard mereka terkunci otomatis.">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setDefaultCategory(c)}
                style={{
                  padding: "7px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FF,
                  border: `1.5px solid ${defaultCategory === c ? "#ED1C24" : "#E9EAEE"}`,
                  background: defaultCategory === c ? "rgba(237,28,36,0.08)" : "#fff",
                  color: defaultCategory === c ? "#ED1C24" : "#5A5A68",
                }}>
                {c}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Cakupan Branch">
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {scopeModes.map((m) => (
              <button key={m.key} type="button" onClick={() => pickScopeMode(m.key)}
                style={{
                  flex: 1, padding: "8px 5px", borderRadius: 9, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FF, textAlign: "center",
                  border: `1.5px solid ${scopeMode === m.key ? "#ED1C24" : "#E9EAEE"}`,
                  background: scopeMode === m.key ? "rgba(237,28,36,0.08)" : "#fff",
                  color: scopeMode === m.key ? "#ED1C24" : "#5A5A68",
                }}>
                {m.label}
              </button>
            ))}
          </div>
          {canPickRegion && scopeMode !== "all" && (
            <div style={{ marginBottom: scopeMode === "branch" ? 8 : 0 }}>
              <SelectWrap value={rowRegion} onChange={(v) => { setRowRegion(v); setBranchName(""); }}>
                <option value="">Pilih Region...</option>
                {REGIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </SelectWrap>
            </div>
          )}
          {scopeMode === "branch" && (
            <SelectWrap value={branchName} onChange={setBranchName}>
              <option value="">{canPickRegion && !rowRegion ? "Pilih region dulu..." : "Pilih Branch..."}</option>
              {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
            </SelectWrap>
          )}
        </FormField>

        <FormField label="Brand">
          <SelectWrap value={brand} onChange={setBrand}>
            <option value="">Semua Brand</option>
            <option value="im3">IM3</option>
            <option value="tri">3ID</option>
          </SelectWrap>
        </FormField>
        <FormField label="Status">
          <SelectWrap value={status} onChange={setStatus}>
            <option value="active">Aktif</option>
            <option value="archived">Arsip</option>
          </SelectWrap>
        </FormField>

        <button
          disabled={saving || !name.trim() || !keyword.trim() || !planDate || !defaultCategory || (scopeMode === "branch" && !branchName)}
          onClick={() => onSave({
            id: form.id, name, keyword, plan_date: planDate,
            region: rowRegion, brand, status, branch_name: scopeMode === "branch" ? branchName : "",
            default_categories: defaultCategory ? [defaultCategory] : [],
          })}
          style={{
            width: "100%", marginTop: 6, padding: "13px 0", borderRadius: 14, border: "none", background: BRAND, color: "#fff",
            fontSize: 14, fontWeight: 800, fontFamily: FF, cursor: "pointer",
            opacity: saving || !name.trim() || !keyword.trim() || !planDate || !defaultCategory || (scopeMode === "branch" && !branchName) ? 0.5 : 1,
          }}>
          {saving ? "Menyimpan..." : "Simpan Campaign"}
        </button>
      </div>
    </div>
  );
}

function FormField({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#5A5A68", marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ marginTop: 4, fontSize: 10.5, color: "#A0A1AC" }}>{hint}</div>}
    </div>
  );
}
const inputStyle = { width: "100%", padding: "11px 13px", borderRadius: 12, border: "1px solid #E9EAEE", fontSize: 13.5, fontFamily: FF, boxSizing: "border-box", color: "#17181C" };

function SelectWrap({ value, onChange, children }) {
  return (
    <div style={{ position: "relative" }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, appearance: "none", WebkitAppearance: "none", paddingRight: 34, cursor: "pointer" }}>
        {children}
      </select>
      <ChevronDown size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#8A8A96" }} />
    </div>
  );
}

function ComplianceSheet({ state, onClose }) {
  const { campaign, rows, err } = state;
  const grouped = {};
  for (const r of rows || []) (grouped[r.branch_name] ||= []).push(r);
  const branches = Object.keys(grouped).sort();
  const totalDone = (rows || []).filter((r) => r.has_plan).length;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end", fontFamily: FF }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(17,17,20,0.45)" }} />
      <div onClick={(e) => e.stopPropagation()} style={{
        position: "relative", width: "100%", maxWidth: 480, margin: "0 auto", background: "#FFFFFF",
        borderRadius: "22px 22px 0 0", padding: "18px 20px calc(env(safe-area-inset-bottom,0px) + 20px)",
        maxHeight: "82vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C" }}>Kepatuhan - {campaign.name}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8A96" }}><X size={19} /></button>
        </div>
        {rows && <div style={{ fontSize: 12, color: "#8A8A96", marginBottom: 14 }}>{totalDone} / {rows.length} BME/RGE sudah submit plan.</div>}

        {err && <div style={{ padding: "10px 12px", borderRadius: 10, background: "#FFEBEE", color: "#C62828", fontSize: 12.5 }}>{err}</div>}
        {rows === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 30 }}><Loader2 size={18} color="#ED1C24" style={{ animation: "cmspin .9s linear infinite" }} /></div>
        ) : rows.length === 0 && !err ? (
          <div style={{ textAlign: "center", padding: 20, color: "#8A8A96", fontSize: 13 }}>Tidak ada BME/RGE dlm cakupan campaign ini.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {branches.map((b) => (
              <div key={b}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#17181C", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>{b}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {grouped[b].map((p) => (
                    <div key={p.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 10, background: p.has_plan ? "#E8F5E9" : "#F6F7F9" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#17181C" }}>{p.user_name} <span style={{ color: "#8A8A96", fontWeight: 500 }}>({brandLabel(p.brand)})</span></span>
                      {p.has_plan ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: "#2E7D32" }}><Check size={13} /> Sudah</span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#C62828" }}>Belum</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <style jsx>{`@keyframes cmspin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
