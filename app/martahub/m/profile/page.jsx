"use client";
/**
 * /martahub/m/profile - Profil BME/RGE (web mobile), padanan `profile_screen.dart`
 * di Flutter: identitas, informasi akun, scope penugasan, dan Keluar.
 *
 * Transfer MSISDN SENGAJA tidak lagi jadi baris menu di sini - permintaan
 * transfer yg ditujukan ke pengguna ini sudah masuk lewat inbox Notifikasi
 * (badge digabung di Home), jadi tidak perlu jalan pintas kedua di sini.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, Mail, Building2, MapPin, Sparkles, Target, TrendingUp, ChevronRight, Hash, User2, Pencil, Loader2, Save } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND, updateCachedFullName } from "../_shared/MobileShell";
import { fmtInt } from "../_shared/activityUi";
import { BRAND_DISPLAY } from "../_shared/planData";

const ROLE_LABEL = { bme: "BME", rge: "RGE", tmv: "Brand TMV", head: "Head TMV", admin: "Admin", spm_sumatera: "SPM Sumatera" };

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || name[0]?.toUpperCase() || "?";
}

export default function ProfilePage() {
  const router = useRouter();
  const { loading, email, userId, scope } = useMartaSession();
  const [stats, setStats] = useState(null);
  // Nama yg baru saja diganti sendiri lewat EditNameSheet - override di atas
  // scope.fullName spy tampilan langsung ikut berubah tanpa nunggu re-fetch
  // scope penuh (mh_set_my_name sendiri sudah simpan ke server).
  const [nameOverride, setNameOverride] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const fullName = nameOverride ?? scope?.fullName;

  useEffect(() => {
    if (loading || !userId) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabaseMarta.from("mh_leaderboard_summary").select("total_activities, achievement_pct, final_score").eq("user_id", userId).maybeSingle();
        if (alive) setStats(data || null);
      } catch { /* best-effort */ }
    })();
    return () => { alive = false; };
  }, [loading, userId]);

  const signOut = async () => {
    await logMartaLogout();
    await supabaseMarta.auth.signOut();
    router.replace("/martahub/m/login");
  };

  if (loading) return <MobileShell active="profile"><ShellSpinner /></MobileShell>;

  return (
    <MobileShell active="profile">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 0", fontFamily: FF }}>
        <BackBar router={router} />

        {/* Header card */}
        <div style={{ marginTop: 16, borderRadius: 20, background: BRAND, padding: "22px 20px", color: "#fff", boxShadow: "0 8px 20px rgba(17,17,20,0.14), 0 2px 5px rgba(17,17,20,0.08)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: -30, top: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,0.18)", border: "2px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
              {initials(fullName || email)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName || "-"}</div>
              <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, opacity: 0.9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <Mail size={11} /> {email}
              </div>
            </div>
          </div>
          {stats && (
            <div style={{ display: "flex", gap: 20, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
              <MiniStat icon={Sparkles} label="Aktivitas" value={fmtInt(stats.total_activities)} />
              <MiniStat icon={Target} label="Capaian" value={`${Math.round(stats.achievement_pct || 0)}%`} />
              <MiniStat icon={TrendingUp} label="Skor" value={fmtInt(Math.round(stats.final_score || 0))} />
            </div>
          )}
        </div>

        {/* Informasi akun - identitas dasar, terpisah dari scope penugasan
            di bawahnya supaya tidak tercampur "siapa saya" vs "di mana saya
            ditugaskan". */}
        <SectionCard title="Informasi Akun">
          <RowKV icon={<User2 size={13} />} label="Nama Lengkap" value={fullName || "-"}
            onEdit={() => setEditingName(true)} />
          <RowKV icon={<Mail size={13} />} label="Email" value={email} />
          <RowKV icon={<Sparkles size={13} />} label="Peran" value={ROLE_LABEL[scope?.role] || scope?.role || "-"} />
        </SectionCard>

        {/* Scope info - authState sudah pasti 'active' di titik ini (lihat
            catatan redirect di useMartaSession, MobileShell.jsx). */}
        {(scope?.brand || scope?.branchName || scope?.region) && (
          <SectionCard title="Penugasan">
            {scope?.brand && <RowKV icon={<Building2 size={13} />} label="BRAND" value={BRAND_DISPLAY[scope.brand] || scope.brand.toUpperCase()} />}
            {scope?.branchName && <RowKV icon={<MapPin size={13} />} label="BRANCH" value={scope.branchName} />}
            {scope?.region && <RowKV icon={<MapPin size={13} />} label="Region" value={scope.region} />}
          </SectionCard>
        )}

        <div style={{ marginTop: 14, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 12px rgba(17,17,20,0.04)" }}>
          <MenuRow icon={<Hash size={16} />} label="Semua Aktivitas" onTap={() => router.push("/martahub/m/activities")} last />
        </div>

        <button onClick={signOut}
          style={{ width: "100%", marginTop: 14, height: 48, borderRadius: 14, border: "1px solid #F7C6C9", background: "#FFF5F6", color: "#DC2626", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(220,38,38,0.06)" }}>
          <LogOut size={15} /> Keluar
        </button>

        <div style={{ textAlign: "center", marginTop: 18, marginBottom: 30, fontSize: 10.5, color: "#C4C4CE", fontWeight: 600 }}>
          MartaHub · IOH Sumatera
        </div>
      </div>

      {editingName && (
        <EditNameSheet currentName={fullName}
          onClose={() => setEditingName(false)}
          onSaved={(newName) => { setNameOverride(newName); updateCachedFullName(newName); setEditingName(false); }} />
      )}
    </MobileShell>
  );
}

function BackBar({ router }) {
  return (
    <button onClick={() => router.push("/martahub/m")}
      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#5A5A68", fontSize: 12.5, fontWeight: 700, fontFamily: FF, padding: 0 }}>
      <ArrowLeft size={16} /> Beranda
    </button>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, opacity: 0.85 }}>
        <Icon size={11} />
        <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={{ marginTop: 14, background: "#FFFFFF", border: "1px solid #E9EAEE", borderRadius: 16, padding: "14px 15px", boxShadow: "0 4px 12px rgba(17,17,20,0.04)" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#8A8A96", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function RowKV({ icon, label, value, onEdit }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0" }}>
      <span style={{ color: "#8A8A96", display: "flex" }}>{icon}</span>
      <span style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: "#17181C", fontWeight: 700 }}>{value}</span>
      {onEdit && (
        <button onClick={onEdit} title="Ubah nama"
          style={{ marginLeft: 2, width: 24, height: 24, borderRadius: 7, border: "1px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <Pencil size={11} />
        </button>
      )}
    </div>
  );
}

/** Bottom sheet ganti nama sendiri - dipanggil dari baris "Nama Lengkap" di
 * Informasi Akun. Lewat RPC mh_set_my_name (SECURITY DEFINER) yg SUDAH ada
 * di server: update mh_profiles.full_name milik user ybs + ikut update
 * mh_assignments.full_name utk semua baris dgn email yg sama - jadi nama di
 * SEMUA posisi/role dia (kalau lebih dari satu) ikut ganti, tanpa memindah
 * atau menghapus assignment/role apa pun. */
function EditNameSheet({ currentName, onClose, onSaved }) {
  const [name, setName] = useState(currentName || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) { setErr("Nama tidak boleh kosong."); return; }
    setSaving(true); setErr("");
    try {
      const { error } = await supabaseMarta.rpc("mh_set_my_name", { p_name: trimmed });
      if (error) throw error;
      onSaved(trimmed.toUpperCase());
    } catch (e) { setErr(e.message || "Gagal menyimpan nama"); setSaving(false); }
  }

  return (
    <div onClick={saving ? undefined : onClose} style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.5)", zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#FFFFFF", borderRadius: "20px 20px 0 0", padding: "20px 20px calc(env(safe-area-inset-bottom,0px) + 20px)", fontFamily: FF, boxShadow: "0 -10px 30px rgba(0,0,0,0.14)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "#E4E5EA", margin: "0 auto 16px" }} />
        <div style={{ width: 48, height: 48, borderRadius: 14, background: "#F6F7F9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
          <User2 size={21} color="#5A5A68" />
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#17181C", textAlign: "center" }}>Ubah Nama Lengkap</div>
        <div style={{ marginTop: 5, fontSize: 12, color: "#8A8A96", textAlign: "center", lineHeight: 1.5 }}>
          Nama baru berlaku di semua posisi/role Anda - email, role, Branch & data lain tetap sama.
        </div>

        <div style={{ marginTop: 18 }}>
          <input value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="NAMA LENGKAP" disabled={saving} autoFocus
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{ width: "100%", height: 50, padding: "0 14px", borderRadius: 13, border: "1.5px solid #ECEDF0", background: "#F6F7F9", fontSize: 14, fontWeight: 600, color: "#17181C", fontFamily: FF, outline: "none", boxSizing: "border-box", textTransform: "uppercase" }} />
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 12, color: "#C62828", textAlign: "center", fontWeight: 600 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, height: 48, borderRadius: 13, border: "1px solid #E4E5EA", background: "#FFFFFF", color: "#5A5A68", fontSize: 13, fontWeight: 700, fontFamily: FF, cursor: saving ? "default" : "pointer" }}>
            Batal
          </button>
          <button onClick={submit} disabled={saving}
            style={{ flex: 1, height: 48, borderRadius: 13, border: "none", background: BRAND, color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: saving ? "default" : "pointer", opacity: saving ? 0.75 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {saving ? <Loader2 size={14} style={{ animation: "mspin .85s linear infinite" }} /> : <Save size={14} />} Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuRow({ icon, label, onTap, last }) {
  return (
    <button onClick={onTap}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "14px 15px", background: "none", border: "none", borderBottom: last ? "none" : "1px solid #F0F0F3", cursor: "pointer", fontFamily: FF }}>
      <span style={{ color: "#5A5A68", display: "flex" }}>{icon}</span>
      <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 700, color: "#17181C" }}>{label}</span>
      <ChevronRight size={16} color="#C4C4CE" />
    </button>
  );
}
