"use client";
/**
 * /martahub/m/profile - Profil BME/RGE (web mobile), padanan `profile_screen.dart`
 * di Flutter: identitas, informasi akun, scope penugasan, dan Keluar.
 *
 * REDESIGN TOTAL: sebelumnya halaman ini satu-satunya yg masih pakai bahasa
 * desain lama (header non-sticky polos, hero card gradient merah-magenta
 * penuh, border/shadow beda sendiri) - tidak senada dgn Beranda/Aktivitas/
 * Kalender yg semuanya sudah dirapikan ke bahasa desain yg SAMA (header
 * sticky glass-blur, kartu putih netral border #EDEDF1 + shadow tipis,
 * badge/pill solid utk brand & role, bukan lagi hero gradient besar).
 * Sekarang halaman ini ikut pola yg sama persis.
 *
 * Transfer MSISDN SENGAJA tidak lagi jadi baris menu di sini - permintaan
 * transfer yg ditujukan ke pengguna ini sudah masuk lewat inbox Notifikasi
 * (badge digabung di Home), jadi tidak perlu jalan pintas kedua di sini.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Mail, Building2, MapPin, Sparkles, User2, Pencil, Loader2, Save } from "lucide-react";
import supabaseMarta from "../../../../lib/supabaseMarta";
import MobileShell, { useMartaSession, ShellSpinner, FF, BRAND, updateCachedFullName, logMartaLogout } from "../_shared/MobileShell";
import { BRAND_DISPLAY } from "../_shared/planData";

const ROLE_LABEL = { bme_rge: "BME/RGE", tmv: "Brand TMV", head: "Head TMV", admin: "Admin", spm_sumatera: "SPM Sumatera" };
const BRAND_COLOR = { im3: "#F5CD46", tri: "#E23B86" };

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || name[0]?.toUpperCase() || "?";
}

export default function ProfilePage() {
  const router = useRouter();
  const { loading, email, userId, scope } = useMartaSession();
  // Nama yg baru saja diganti sendiri lewat EditNameSheet - override di atas
  // scope.fullName spy tampilan langsung ikut berubah tanpa nunggu re-fetch
  // scope penuh (mh_set_my_name sendiri sudah simpan ke server).
  const [nameOverride, setNameOverride] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const fullName = nameOverride ?? scope?.fullName;
  const brandKey = scope?.brand ? scope.brand.toLowerCase() : null;

  const signOut = async () => {
    await logMartaLogout();
    await supabaseMarta.auth.signOut();
    router.replace("/martahub/m/login");
  };

  if (loading) return <MobileShell active="profile"><ShellSpinner /></MobileShell>;

  return (
    <MobileShell active="profile">
      {/* Header STICKY dgn glass blur - SAMA PERSIS pola/nilai warna & blur
          dgn header Beranda/Aktivitas/Kalender, supaya Profil tidak lagi
          terasa spt halaman "beda aplikasi". */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20, maxWidth: 480, margin: "0 auto",
        padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 14px", fontFamily: FF,
        background: "rgba(244,245,247,0.86)", backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        borderBottom: "1px solid rgba(23,24,28,0.06)", boxShadow: "0 6px 20px rgba(23,24,28,0.05)",
      }}>
        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Profil Anda</div>
      </div>

      <div style={{ padding: "14px 20px calc(env(safe-area-inset-bottom,0px) + 24px)", fontFamily: FF }}>
        {/* Kartu identitas - dulu hero gradient merah-magenta penuh layar,
            SEKARANG kartu putih netral spt kartu2 lain (border #EDEDF1,
            shadow tipis) - avatar jadi satu-satunya aksen warna brand
            (lingkaran solid BRAND), bukan seluruh kartu diwarnai. */}
        <div style={{
          marginTop: 2, background: "#FFFFFF", borderRadius: 18, padding: "16px",
          border: "1px solid #EDEDF1", boxShadow: "0 2px 10px rgba(23,24,28,0.04), 0 1px 2px rgba(23,24,28,0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{
              width: 50, height: 50, borderRadius: "50%", background: BRAND, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, flexShrink: 0,
              boxShadow: "0 4px 10px rgba(237,28,36,0.22)",
            }}>
              {initials(fullName || email)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: "#17181C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fullName || "-"}</div>
              <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#8A8A96", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <Mail size={11} color="#B0B0BA" /> {email}
              </div>
            </div>
          </div>
        </div>

        <SectionCard title="Informasi Akun">
          <RowKV icon={<User2 size={13} />} label="Nama Lengkap" value={fullName || "-"} onEdit={() => setEditingName(true)} />
          <Divider />
          <RowKV icon={<Mail size={13} />} label="Email" value={email} />
          <Divider />
          <RowKV icon={<Sparkles size={13} />} label="Peran"
            valueNode={<RolePill label={ROLE_LABEL[scope?.role] || scope?.role || "-"} />} last />
        </SectionCard>

        {/* Scope info - authState sudah pasti 'active' di titik ini (lihat
            catatan redirect di useMartaSession, MobileShell.jsx). Brand
            SEKARANG pakai badge solid SAMA PERSIS spt di kartu aktivitas
            (kuning teks hitam utk IM3, magenta teks putih utk 3ID) - bukan
            lagi teks polos, biar identitas brand langsung kebaca. */}
        {(scope?.brand || scope?.branchName || scope?.region) && (
          <SectionCard title="Penugasan">
            {scope?.brand && (
              <>
                <RowKV icon={<Building2 size={13} />} label="Brand"
                  valueNode={
                    <span style={{
                      fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
                      background: BRAND_COLOR[brandKey] || "#8A8A96",
                      color: brandKey === "tri" ? "#FFFFFF" : "#17181C",
                    }}>
                      {brandKey === "tri" ? "3ID" : (BRAND_DISPLAY[scope.brand] || scope.brand.toUpperCase())}
                    </span>
                  } />
                <Divider />
              </>
            )}
            {scope?.branchName && (
              <>
                <RowKV icon={<MapPin size={13} />} label="Branch" value={scope.branchName} />
                <Divider />
              </>
            )}
            {scope?.region && <RowKV icon={<MapPin size={13} />} label="Region" value={scope.region} last />}
          </SectionCard>
        )}

        <button onClick={signOut}
          style={{ width: "100%", marginTop: 12, height: 48, borderRadius: 14, border: "1px solid #F7C6C9", background: "#FFF5F6", color: "#DC2626", fontSize: 13, fontWeight: 800, fontFamily: FF, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <LogOut size={15} /> Keluar
        </button>

        <div style={{ textAlign: "center", marginTop: 18, marginBottom: 6, fontSize: 10.5, color: "#C4C4CE", fontWeight: 600 }}>
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

function SectionCard({ title, children }) {
  return (
    <div style={{
      marginTop: 12, background: "#FFFFFF", borderRadius: 18, padding: "14px 15px",
      border: "1px solid #EDEDF1", boxShadow: "0 2px 10px rgba(23,24,28,0.04), 0 1px 2px rgba(23,24,28,0.03)",
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#B0B0BA", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#F0F0F3" }} />;
}

function RolePill({ label }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", background: "rgba(237,28,36,0.09)", color: "#ED1C24" }}>
      {label}
    </span>
  );
}

function RowKV({ icon, label, value, valueNode, onEdit, last }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: last ? "9px 0 2px" : "9px 0" }}>
      <span style={{ color: "#B0B0BA", display: "flex", flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span style={{ fontSize: 12, color: "#8A8A96", fontWeight: 600, flex: 1, marginTop: 1 }}>{label}</span>
      {valueNode ? valueNode : (
        <span style={{ fontSize: 12.5, color: "#17181C", fontWeight: 700, textAlign: "right", wordBreak: "break-word", maxWidth: onEdit ? "unset" : 190 }}>{value}</span>
      )}
      {onEdit && (
        <button onClick={onEdit} title="Ubah nama"
          style={{
            marginLeft: 2, width: 24, height: 24, borderRadius: 7, flexShrink: 0, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px solid #ECEDF0", background: "#F6F7F9", color: "#5A5A68",
          }}>
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

