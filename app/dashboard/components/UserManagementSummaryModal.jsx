"use client";
/**
 * UserManagementSummaryModal.jsx — "Lihat Summary User Management"
 *
 * PERMINTAAN USER: "buat summarynya untuk role admin MC, admin AREA, berapa
 * yang sudah ada minimal 1 alamat email, berapa yang sudah mulai mengisi
 * dari yang terdaftar, buat summary lengkapnya, dan ini langsung sebutkan
 * mc atau areanya, dibagi per region, buat dengan sangat rapi, semua ini
 * Lihat Summary User Management, baru muncul dashboard popupnya, dan juga
 * ini bisa full konteks ataupun daily untuk login hari ini dan pengisian
 * hari ini."
 *
 * Komponen ini BERDIRI SENDIRI (fetch sendiri, tidak share state dgn
 * AdminMcMapping/AdminAreaMapping/CombinedEmailExport) - dibuka dari tombol
 * "Lihat Summary User Management" yang ditaruh di CombinedEmailExport.jsx
 * (satu-satunya tempat yang sudah "di atas" kedua role sekaligus).
 *
 * Definisi "mulai mengisi" (dari yang terdaftar emailnya):
 *  - Admin MC  -> MC itu punya minimal 1 baris di mf_dse_prod_ar (Penjualan
 *    DSE) ATAU di dso_piutang_items (AR DSO/DSP) - keduanya tanggung jawab
 *    Admin MC.
 *  - Admin Area -> Branch itu punya minimal 1 baris (belum dihapus) di
 *    hoa_piutang_items (AR HoA) - tanggung jawab utama Admin Area.
 * Mode "Hari Ini" mempersempit definisi di atas ke baris yang dibuat/
 * ditanggal-kan HARI INI saja (bukan sepanjang waktu).
 * Login "pernah"/"hari ini" dari last_sign_in_at tiap email terdaftar,
 * lewat RPC mf_dse_admin_mc_email_login_status / _admin_area_ (khusus SPM).
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import supabase from "../../../lib/supabase";
import {
  X, Loader2, Users, Mail, PenLine, LogIn, ChevronDown, ChevronUp,
  Building2, CircleAlert, CircleCheck, CircleDot,
} from "lucide-react";

const FONT = `"DM Sans",-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif`;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isTodayTs(ts) {
  if (!ts) return false;
  return new Date(ts).toISOString().slice(0, 10) === todayISO();
}

export default function UserManagementSummaryModal({ theme, onClose }) {
  const d = theme === "dark";
  const t = {
    card: d ? "#1A1A1D" : "#FFFFFF", sub: d ? "#202024" : "#F5F5F7", page: d ? "#111113" : "#FBFBF9",
    line: d ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)", hi: d ? "#F2F2F3" : "#1A1A1D",
    mid: d ? "#8A8A96" : "#5A5A68", lo: d ? "#5A5A68" : "#8A8A96",
    inputBg: d ? "#1E1E22" : "#F8F8FA", inputBd: d ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)",
    teal: d ? "#32BCAD" : "#1A9E90", tealBg: d ? "rgba(50,188,173,0.12)" : "rgba(26,158,144,0.08)",
    red: d ? "#F87171" : "#DC2626", redBg: d ? "rgba(248,113,113,0.12)" : "rgba(220,38,38,0.07)",
    amber: d ? "#FBBF24" : "#B45309", amberBg: d ? "rgba(251,191,36,0.12)" : "rgba(180,83,9,0.08)",
    shadowSm: d ? "0 1px 4px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.07)",
  };

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [role, setRole] = useState("mc"); // "mc" | "area"
  const [scope, setScope] = useState("full"); // "full" | "daily"
  const [openRegions, setOpenRegions] = useState({}); // region -> true/false (default collapsed per-bucket lists)
  const [openBucket, setOpenBucket] = useState({}); // `${region}|${role}|${bucketKey}` -> true/false

  const [data, setData] = useState(null); // { mc: {...}, area: {...} }

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const today = todayISO();

      const [
        { data: dseRows, error: dseErr },
        { data: mcMappingRows }, { data: mcEmailRows },
        { data: areaMappingRows }, { data: areaEmailRows },
        { data: prodRows }, { data: dsoRows }, { data: hoaRows },
      ] = await Promise.all([
        supabase.from("mf_dse_database").select("mc, branch, region").eq("is_revoked", false).not("mc", "is", null),
        supabase.from("mf_dse_admin_mc_mapping").select("id, mc, active"),
        supabase.from("mf_dse_admin_mc_emails").select("mapping_id, email, active"),
        supabase.from("mf_dse_admin_area_mapping").select("id, branch, active"),
        supabase.from("mf_dse_admin_area_emails").select("mapping_id, email, active"),
        supabase.from("mf_dse_prod_ar").select("mc, tanggal"),
        supabase.from("dso_piutang_items").select("mc, created_at"),
        supabase.from("hoa_piutang_items").select("branch, created_at").is("deleted_at", null),
      ]);
      if (dseErr) throw dseErr;

      // ── Universe MC & Area (dari Database DSE, sumber kebenaran region) ──
      const mcRegion = new Map(); // mc_lower -> { mc, region }
      const areaRegion = new Map(); // branch_lower -> { branch, region }
      (dseRows || []).forEach((r) => {
        if (r.mc) { const k = r.mc.toLowerCase(); if (!mcRegion.has(k)) mcRegion.set(k, { mc: r.mc, region: r.region || "Lainnya" }); }
        if (r.branch) { const k = r.branch.toLowerCase(); if (!areaRegion.has(k)) areaRegion.set(k, { branch: r.branch, region: r.region || "Lainnya" }); }
      });

      // ── Email per MC/Area (hanya slot aktif) ──
      const mcMapById = new Map((mcMappingRows || []).map((m) => [m.id, m]));
      const mcEmailsByMc = new Map(); // mc_lower -> [email,...]
      (mcEmailRows || []).forEach((e) => {
        if (e.active === false) return;
        const m = mcMapById.get(e.mapping_id);
        if (!m?.mc) return;
        const k = m.mc.toLowerCase();
        if (!mcEmailsByMc.has(k)) mcEmailsByMc.set(k, []);
        mcEmailsByMc.get(k).push(e.email);
      });
      const areaMapById = new Map((areaMappingRows || []).map((m) => [m.id, m]));
      const areaEmailsByBranch = new Map();
      (areaEmailRows || []).forEach((e) => {
        if (e.active === false) return;
        const m = areaMapById.get(e.mapping_id);
        if (!m?.branch) return;
        const k = m.branch.toLowerCase();
        if (!areaEmailsByBranch.has(k)) areaEmailsByBranch.set(k, []);
        areaEmailsByBranch.get(k).push(e.email);
      });

      // ── "Mulai mengisi": MC = Penjualan DSE (mf_dse_prod_ar) ATAU AR
      // DSO/DSP (dso_piutang_items). Area = AR HoA (hoa_piutang_items). ──
      const mcFilledEver = new Set(), mcFilledToday = new Set();
      (prodRows || []).forEach((r) => { if (!r.mc) return; const k = r.mc.toLowerCase(); mcFilledEver.add(k); if (r.tanggal === today) mcFilledToday.add(k); });
      (dsoRows || []).forEach((r) => { if (!r.mc) return; const k = r.mc.toLowerCase(); mcFilledEver.add(k); if ((r.created_at || "").slice(0, 10) === today) mcFilledToday.add(k); });
      const areaFilledEver = new Set(), areaFilledToday = new Set();
      (hoaRows || []).forEach((r) => { if (!r.branch) return; const k = r.branch.toLowerCase(); areaFilledEver.add(k); if ((r.created_at || "").slice(0, 10) === today) areaFilledToday.add(k); });

      // ── Status login tiap email terdaftar (RPC khusus SPM) ──
      const allMcEmails = Array.from(new Set(Array.from(mcEmailsByMc.values()).flat().filter(Boolean)));
      const allAreaEmails = Array.from(new Set(Array.from(areaEmailsByBranch.values()).flat().filter(Boolean)));
      const [{ data: mcLogin }, { data: areaLogin }] = await Promise.all([
        allMcEmails.length ? supabase.rpc("mf_dse_admin_mc_email_login_status", { p_emails: allMcEmails }) : Promise.resolve({ data: [] }),
        allAreaEmails.length ? supabase.rpc("mf_dse_admin_area_email_login_status", { p_emails: allAreaEmails }) : Promise.resolve({ data: [] }),
      ]);
      const mcLoginByEmail = new Map((mcLogin || []).map((r) => [r.email, r.last_sign_in_at]));
      const areaLoginByEmail = new Map((areaLogin || []).map((r) => [r.email, r.last_sign_in_at]));

      // ── Rakit per-entitas (MC/Area), dikelompokkan per Region ──
      const buildEntities = (universe, emailsByCode, filledEver, filledToday, loginByEmail, codeField) =>
        Array.from(universe.values()).map((u) => {
          const code = u[codeField];
          const k = code.toLowerCase();
          const emails = emailsByCode.get(k) || [];
          const logins = emails.map((e) => loginByEmail.get(e.toLowerCase().trim())).filter(Boolean);
          return {
            code, region: u.region,
            hasEmail: emails.length > 0, emailCount: emails.length, emails,
            filledEver: filledEver.has(k), filledToday: filledToday.has(k),
            loginEver: logins.length > 0, loginToday: logins.some(isTodayTs),
          };
        }).sort((a, b) => a.code.localeCompare(b.code));

      const mcEntities = buildEntities(mcRegion, mcEmailsByMc, mcFilledEver, mcFilledToday, mcLoginByEmail, "mc");
      const areaEntities = buildEntities(areaRegion, areaEmailsByBranch, areaFilledEver, areaFilledToday, areaLoginByEmail, "branch");

      const groupByRegion = (entities) => {
        const map = new Map();
        entities.forEach((e) => {
          if (!map.has(e.region)) map.set(e.region, []);
          map.get(e.region).push(e);
        });
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([region, items]) => ({ region, items }));
      };

      setData({
        mc: { entities: mcEntities, byRegion: groupByRegion(mcEntities) },
        area: { entities: areaEntities, byRegion: groupByRegion(areaEntities) },
      });
    } catch (e) {
      setErr(e.message || "Gagal memuat summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const current = data?.[role];
  const noun = role === "mc" ? "MC" : "Area";
  const filledLabel = "Mulai Mengisi";

  const totals = useMemo(() => {
    if (!current) return null;
    const list = current.entities;
    const filled = (e) => (scope === "full" ? e.filledEver : e.filledToday);
    const login = (e) => (scope === "full" ? e.loginEver : e.loginToday);
    return {
      total: list.length,
      withEmail: list.filter((e) => e.hasEmail).length,
      noEmail: list.filter((e) => !e.hasEmail).length,
      filled: list.filter((e) => e.hasEmail && filled(e)).length,
      notFilled: list.filter((e) => e.hasEmail && !filled(e)).length,
      loggedIn: list.filter((e) => e.hasEmail && login(e)).length,
    };
  }, [current, scope]);

  const toggleBucket = (key) => setOpenBucket((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleRegion = (key) => setOpenRegions((prev) => ({ ...prev, [key]: !prev[key] }));

  const filled = (e) => (scope === "full" ? e.filledEver : e.filledToday);
  const login = (e) => (scope === "full" ? e.loginEver : e.loginToday);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9800, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 1360, maxHeight: "92vh", background: t.page, borderRadius: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.45)", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: FONT }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: `1px solid ${t.line}`, background: t.card, flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: t.tealBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Users size={18} color={t.teal} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: t.hi }}>Summary User Management</div>
            <div style={{ fontSize: 12, color: t.mid, marginTop: 1 }}>Status pendaftaran, pengisian & login — Admin MC &amp; Admin Area, per Region</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: t.sub, color: t.mid, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
        </div>

        {/* Tabs & scope toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${t.line}`, background: t.card, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, background: t.sub, borderRadius: 10, padding: 4 }}>
            {[{ k: "mc", label: "Admin MC" }, { k: "area", label: "Admin Area" }].map((r) => (
              <button key={r.k} onClick={() => setRole(r.k)}
                style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "none", background: role === r.k ? t.teal : "transparent", color: role === r.k ? "#fff" : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                {r.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, background: t.sub, borderRadius: 10, padding: 4 }}>
            {[{ k: "full", label: "Sepanjang Waktu" }, { k: "daily", label: "Hari Ini" }].map((s) => (
              <button key={s.k} onClick={() => setScope(s.k)}
                style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "none", background: scope === s.k ? t.hi : "transparent", color: scope === s.k ? t.page : t.mid, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: "center", color: t.mid }}><Loader2 size={20} className="spin" /></div>
          ) : err ? (
            <div style={{ padding: 30, textAlign: "center", color: t.red, fontSize: 13 }}>{err}</div>
          ) : (
            <>
              {/* Ringkasan total */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14 }}>
                <StatCard t={t} icon={<Building2 size={18} color={t.hi} />} iconBg={t.sub} value={totals.total} label={`Total ${noun}`} />
                <StatCard t={t} icon={<Mail size={18} color={t.teal} />} iconBg={t.tealBg} value={`${totals.withEmail} / ${totals.total}`} label="Punya ≥1 Email" />
                <StatCard t={t} icon={<CircleAlert size={18} color={t.red} />} iconBg={t.redBg} value={totals.noEmail} label="Belum Ada Email" />
                <StatCard t={t} icon={<PenLine size={18} color={t.amber} />} iconBg={t.amberBg} value={`${totals.filled} / ${totals.withEmail}`} label={scope === "full" ? filledLabel : `${filledLabel} (Hari Ini)`} />
                <StatCard t={t} icon={<LogIn size={18} color={t.teal} />} iconBg={t.tealBg} value={`${totals.loggedIn} / ${totals.withEmail}`} label={scope === "full" ? "Pernah Login" : "Login Hari Ini"} />
              </div>

              {/* Per region */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, alignItems: "start" }}>
                {current.byRegion.map(({ region, items }) => {
                  const noEmailList = items.filter((e) => !e.hasEmail);
                  const notFilledList = items.filter((e) => e.hasEmail && !filled(e));
                  const activeList = items.filter((e) => e.hasEmail && filled(e));
                  const loginList = items.filter((e) => e.hasEmail && login(e));
                  const regionKey = `${role}|${region}`;
                  const regionOpen = openRegions[regionKey] !== false; // default terbuka
                  return (
                    <div key={region} style={{ borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, overflow: "hidden" }}>
                      <button onClick={() => toggleRegion(regionKey)} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, padding: "13px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: FONT, textAlign: "left" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 800, color: t.hi, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{region}</div>
                          {regionOpen ? <ChevronUp size={15} color={t.lo} /> : <ChevronDown size={15} color={t.lo} />}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <Pill t={t} color={t.mid} bg={t.sub} label={`${items.length} ${noun}`} />
                          <Pill t={t} color={t.red} bg={t.redBg} label={`${noEmailList.length} belum ada email`} />
                          <Pill t={t} color={t.amber} bg={t.amberBg} label={`${notFilledList.length} belum isi`} />
                          <Pill t={t} color={t.teal} bg={t.tealBg} label={`${activeList.length} aktif isi`} />
                          <Pill t={t} color={t.teal} bg={t.tealBg} label={`${loginList.length} ${scope === "full" ? "pernah login" : "login hari ini"}`} />
                        </div>
                      </button>
                      {regionOpen && (
                        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                          <Bucket t={t} tone="red" icon={<CircleAlert size={14} color={t.red} />} title={`Belum Ada Email Terdaftar`} items={noEmailList} noun={noun}
                            bucketKey={`${regionKey}|noemail`} open={openBucket[`${regionKey}|noemail`]} onToggle={toggleBucket} renderExtra={() => null} />
                          <Bucket t={t} tone="amber" icon={<CircleDot size={14} color={t.amber} />} title={`Sudah Ada Email, Belum Mengisi${scope === "daily" ? " (Hari Ini)" : ""}`} items={notFilledList} noun={noun}
                            bucketKey={`${regionKey}|notfilled`} open={openBucket[`${regionKey}|notfilled`]} onToggle={toggleBucket}
                            renderExtra={(e) => <span style={{ color: t.lo, fontSize: 11.5 }}>{e.emailCount} email{login(e) ? " · pernah login" : " · belum pernah login"}</span>} />
                          <Bucket t={t} tone="teal" icon={<CircleCheck size={14} color={t.teal} />} title={`Aktif Mengisi${scope === "daily" ? " (Hari Ini)" : ""}`} items={activeList} noun={noun}
                            bucketKey={`${regionKey}|active`} open={openBucket[`${regionKey}|active`]} onToggle={toggleBucket}
                            renderExtra={(e) => <span style={{ color: t.lo, fontSize: 11.5 }}>{login(e) ? "sudah login" : "belum pernah login"}</span>} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ t, icon, iconBg, value, label }) {
  return (
    <div style={{ flex: "1 1 160px", minWidth: 150, borderRadius: 14, border: `1px solid ${t.line}`, background: t.card, boxShadow: t.shadowSm, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 19, fontWeight: 800, color: t.hi, fontVariantNumeric: "tabular-nums" }}>{value}</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.mid, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
      </div>
    </div>
  );
}

function Pill({ t, color, bg, label }) {
  return <span style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 999, background: bg, color, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>;
}

function Bucket({ t, tone, icon, title, items, noun, bucketKey, open, onToggle, renderExtra }) {
  const toneColor = tone === "red" ? t.red : tone === "amber" ? t.amber : t.teal;
  const toneBg = tone === "red" ? t.redBg : tone === "amber" ? t.amberBg : t.tealBg;
  if (items.length === 0) return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 10, background: t.sub, opacity: 0.6 }}>
      {icon}<span style={{ fontSize: 12.5, color: t.mid }}>{title} — tidak ada</span>
    </div>
  );
  return (
    <div style={{ borderRadius: 10, background: toneBg, overflow: "hidden" }}>
      <button onClick={() => onToggle(bucketKey)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: FONT, textAlign: "left" }}>
        {icon}
        <span style={{ fontSize: 12.5, fontWeight: 700, color: toneColor, flex: 1 }}>{title} ({items.length} {noun})</span>
        {open ? <ChevronUp size={13} color={toneColor} /> : <ChevronDown size={13} color={toneColor} />}
      </button>
      {open && (
        <div style={{ padding: "2px 12px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          {items.map((e) => (
            <div key={e.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.55)" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: t.hi }}>{e.code}</span>
              {renderExtra(e)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
