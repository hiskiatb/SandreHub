"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Kelola Menu — kontrol ketersediaan sub-menu SandraHub per-role (khusus SPM).
// SPM dapat menandai sebuah menu "Dalam Pemeliharaan" untuk role tertentu; role
// itu tetap MELIHAT menunya, tapi saat dibuka muncul pemberitahuan maintenance.
// Menyimpan ke tabel public.app_menu_status (RLS: tulis khusus spm_sumatera).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { Wrench, CheckCircle2, ChevronDown, Info, Loader2 } from "lucide-react";

const FF = `"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif`;

const mk = (d) => ({
  card:   d ? "#1A1A1D" : "#FFFFFF",
  surface:d ? "#161618" : "#FFFFFF",
  hover:  d ? "#202024" : "#F0F0F2",
  line:   d ? "#2A2A2F" : "#E2E2E6",
  hi:     d ? "#F2F2F3" : "#1A1A1D",
  mid:    d ? "#8A8A96" : "#5A5A68",
  lo:     d ? "#5A5A68" : "#8A8A96",
  inputBg:d ? "#161618" : "#FFFFFF",
  green:  d ? "#30D158" : "#1A9E5A",
  greenBg:d ? "rgba(48,209,88,0.12)" : "rgba(26,158,90,0.08)",
  greenBd:d ? "rgba(48,209,88,0.30)" : "rgba(26,158,90,0.22)",
  amber:  d ? "#FFB020" : "#B7791F",
  amberBg:d ? "rgba(255,176,32,0.12)" : "rgba(183,121,31,0.08)",
  amberBd:d ? "rgba(255,176,32,0.32)" : "rgba(183,121,31,0.24)",
  mag:    "#C6168D",
});

// Katalog role yang bisa diatur (SPM tak diatur — selalu penuh).
const ROLE_CATALOG = [
  { role: "finance_mpx",             label: "Finance MPX" },
  { role: "internal_ioh",            label: "IOH Sumatera" },
  { role: "ioh_north_sumatera",      label: "IOH North Sumatera" },
  { role: "ioh_central_sumatera",    label: "IOH Central Sumatera" },
  { role: "ioh_south_sumatera",      label: "IOH South Sumatera" },
  { role: "cse_rse",                 label: "CSE / RSE" },
  { role: "bsm",                     label: "BSM" },
  { role: "pic_region",              label: "PIC Region" },
  { role: "salesforce_mgmt_sumatera",label: "Salesforce Mgmt Sumatera" },
  { role: "region_sfm_north",        label: "Region SFM North" },
  { role: "region_sfm_central",      label: "Region SFM Central" },
  { role: "region_sfm_south",        label: "Region SFM South" },
];

const MENU_CATALOG = [
  { key: "summary",        label: "Laporan P&L" },
  { key: "control-center", label: "PNL Control Center" },
  { key: "pivot-summary",  label: "Pivot P&L Summary" },
  { key: "payout-tracker", label: "Payout Tracker" },
  { key: "sdp-status",     label: "Form SDP" },
  { key: "mfts",           label: "Pemenuhan Manpower" },
];

// Cermin logika akses dashboard — cuma tampilkan menu yang memang dimiliki role.
const IOH  = new Set(["internal_ioh", "ioh_north_sumatera", "ioh_central_sumatera", "ioh_south_sumatera"]);
const SFM  = new Set(["salesforce_mgmt_sumatera", "region_sfm_north", "region_sfm_central", "region_sfm_south"]);
const SDPM = new Set(["cse_rse", "bsm", "pic_region"]);
function roleHasMenu(role, key) {
  const isIOH = IOH.has(role), isSFM = SFM.has(role), isMPX = role === "finance_mpx", isSDPM = SDPM.has(role);
  const canMonitor = isIOH || isMPX;
  const notSDP = !isSDPM;
  switch (key) {
    case "summary":        return notSDP;
    case "payout-tracker": return notSDP;
    case "control-center": return canMonitor;
    case "pivot-summary":  return canMonitor;
    case "sdp-status":     return isSDPM || isIOH;
    case "mfts":           return isIOH || isSFM;
    default:               return false;
  }
}

export default function MenuAccessManager({ supabase, theme = "dark", profile }) {
  const d = theme === "dark";
  const t = mk(d);
  const [role, setRole] = useState(ROLE_CATALOG[0].role);
  const [statusMap, setStatusMap] = useState(new Map()); // `${role}|${key}` -> { status, note }
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("app_menu_status").select("role, menu_key, status, note");
      if (!alive) return;
      if (error) setErr(error.message);
      const m = new Map();
      (data || []).forEach((r) => m.set(`${r.role}|${r.menu_key}`, { status: r.status, note: r.note || "" }));
      setStatusMap(m); setLoading(false);
    })();
    return () => { alive = false; };
  }, [supabase]);

  const menus = useMemo(() => MENU_CATALOG.filter((m) => roleHasMenu(role, m.key)), [role]);
  const cell = (key) => statusMap.get(`${role}|${key}`) || { status: "active", note: "" };

  async function persist(key, next) {
    setSavingKey(key); setSavedKey(""); setErr("");
    const row = {
      role, menu_key: key, status: next.status, note: next.note || null,
      updated_by: profile?.id || null, updated_by_email: profile?.email || null, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("app_menu_status").upsert(row, { onConflict: "role,menu_key" });
    setSavingKey("");
    if (error) { setErr(error.message); return; }
    setStatusMap((prev) => { const n = new Map(prev); n.set(`${role}|${key}`, { status: next.status, note: next.note || "" }); return n; });
    setSavedKey(key); setTimeout(() => setSavedKey((k) => (k === key ? "" : k)), 1600);
  }

  const setStatus = (key, status) => { const c = cell(key); persist(key, { status, note: c.note }); };
  const setNoteLocal = (key, note) => setStatusMap((prev) => { const n = new Map(prev); const c = prev.get(`${role}|${key}`) || { status: "active", note: "" }; n.set(`${role}|${key}`, { ...c, note }); return n; });
  const saveNote = (key) => { const c = cell(key); persist(key, { status: c.status, note: c.note }); };

  const roleLabel = ROLE_CATALOG.find((r) => r.role === role)?.label || role;
  const maintCount = menus.filter((m) => cell(m.key).status === "maintenance").length;

  return (
    <div style={{ fontFamily: FF, color: t.hi }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `${t.mag}1A`, border: `1px solid ${t.mag}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wrench size={16} color={t.mag} />
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Kelola Menu</div>
            <div style={{ fontSize: 13, color: t.mid, marginTop: 1 }}>Atur ketersediaan sub-menu tiap role. Menu yang dipelihara tetap terlihat, tapi menampilkan pemberitahuan.</div>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ display: "flex", gap: 9, padding: "11px 13px", borderRadius: 10, background: t.hover, border: `1px solid ${t.line}`, marginBottom: 18 }}>
        <Info size={15} color={t.mid} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: t.mid, lineHeight: 1.55 }}>
          Perubahan berlaku untuk role terpilih dan langsung tersimpan. Role <b>SPM Sumatera</b> selalu punya akses penuh dan tidak terpengaruh pemeliharaan.
        </div>
      </div>

      {/* Role selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: "0.05em" }}>Role</label>
        <div style={{ position: "relative" }}>
          <select value={role} onChange={(e) => setRole(e.target.value)}
            style={{ appearance: "none", WebkitAppearance: "none", padding: "9px 34px 9px 13px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.inputBg, color: t.hi, fontSize: 13.5, fontWeight: 600, fontFamily: FF, cursor: "pointer", minWidth: 240 }}>
            {ROLE_CATALOG.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
          </select>
          <ChevronDown size={15} color={t.mid} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
        </div>
        {maintCount > 0 && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: t.amber, background: t.amberBg, border: `1px solid ${t.amberBd}`, borderRadius: 999, padding: "3px 10px" }}>
            {maintCount} menu dipelihara
          </span>
        )}
      </div>

      {err && <div style={{ fontSize: 12, color: "#DC2626", marginBottom: 12 }}>{err}</div>}

      {/* Menu list */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.mid, fontSize: 13, padding: "20px 0" }}>
          <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Memuat pengaturan…
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : menus.length === 0 ? (
        <div style={{ fontSize: 13, color: t.mid, padding: "16px 0" }}>Role ini tidak memiliki sub-menu yang dapat diatur.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {menus.map((m) => {
            const c = cell(m.key);
            const isMaint = c.status === "maintenance";
            return (
              <div key={m.key} style={{ borderRadius: 12, border: `1px solid ${isMaint ? t.amberBd : t.line}`, background: isMaint ? t.amberBg : t.card, padding: 14, transition: "background .15s, border-color .15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{m.label}</div>
                    <div style={{ fontSize: 11.5, color: t.mid, marginTop: 2 }}>
                      {isMaint ? "Dalam pemeliharaan untuk role ini" : "Tersedia normal"}
                    </div>
                  </div>

                  {/* Segmented toggle */}
                  <div style={{ display: "inline-flex", padding: 3, gap: 3, borderRadius: 9, background: t.hover, border: `1px solid ${t.line}` }}>
                    {[
                      { v: "active", label: "Aktif", on: t.green, onBg: t.greenBg, onBd: t.greenBd, Icon: CheckCircle2 },
                      { v: "maintenance", label: "Pemeliharaan", on: t.amber, onBg: t.amberBg, onBd: t.amberBd, Icon: Wrench },
                    ].map((opt) => {
                      const active = c.status === opt.v;
                      return (
                        <button key={opt.v} onClick={() => !active && setStatus(m.key, opt.v)} disabled={savingKey === m.key}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 7, border: active ? `1px solid ${opt.onBd}` : "1px solid transparent", background: active ? opt.onBg : "transparent", color: active ? opt.on : t.mid, fontSize: 12, fontWeight: 700, fontFamily: FF, cursor: active ? "default" : "pointer" }}>
                          <opt.Icon size={13} /> {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ width: 74, textAlign: "right", fontSize: 11, fontWeight: 700 }}>
                    {savingKey === m.key ? <span style={{ color: t.mid }}>Menyimpan…</span>
                      : savedKey === m.key ? <span style={{ color: t.green }}>✓ Tersimpan</span> : null}
                  </div>
                </div>

                {/* Optional custom note (hanya saat maintenance) */}
                {isMaint && (
                  <div style={{ marginTop: 11 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: t.mid }}>Catatan untuk pengguna (opsional)</label>
                    <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
                      <input value={c.note} onChange={(e) => setNoteLocal(m.key, e.target.value)} onBlur={() => saveNote(m.key)}
                        placeholder="mis. Perkiraan selesai 5 Juli 2026, atau info tambahan…"
                        style={{ flex: 1, padding: "8px 11px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.inputBg, color: t.hi, fontSize: 12.5, fontFamily: FF, outline: "none" }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 11.5, color: t.lo }}>
        Ditinjau untuk role: <b style={{ color: t.mid }}>{roleLabel}</b>
      </div>
    </div>
  );
}
