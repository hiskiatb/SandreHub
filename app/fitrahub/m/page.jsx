"use client";
/**
 * /fitrahub/m - Beranda FitraHub (placeholder - fase pertama hanya berisi
 * User Management, lihat spec User Management di app/fitrahub/m/users).
 */
import { Users2, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import MobileShell, { useFitraSession, ShellSpinner, FF, ACCENT } from "./_shared/MobileShell";

export default function FitraHome() {
  const router = useRouter();
  const { loading, scope } = useFitraSession();

  if (loading) return <ShellSpinner />;

  return (
    <MobileShell active="home">
      <div style={{ padding: "calc(env(safe-area-inset-top,0px) + 20px) 20px 8px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A8A96" }}>FitraHub</div>
        <h1 style={{ marginTop: 4, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "#17181C" }}>
          Selamat datang di FitraHub
        </h1>
        <p style={{ marginTop: 6, fontSize: 13, color: "#6B6B76", lineHeight: 1.55 }}>
          Finance Sumatera Hub. Fitur yang tersedia saat ini: User Management.
        </p>
      </div>

      <div style={{ padding: "16px 20px" }}>
        <button
          onClick={() => router.push("/fitrahub/m/users")}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 14,
            padding: "18px 18px", borderRadius: 18, background: "#FFFFFF",
            border: "1px solid #E9EAEE", boxShadow: "0 2px 10px rgba(23,24,28,0.05)",
            cursor: "pointer", textAlign: "left", fontFamily: FF,
          }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(237,28,36,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Users2 size={20} color={ACCENT} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#17181C" }}>User Management</div>
            <div style={{ fontSize: 12, color: "#8A8A96", marginTop: 2 }}>Kelola akses &amp; role pengguna FitraHub</div>
          </div>
          <ArrowRight size={18} color="#C4C4CE" />
        </button>

        {scope?.role && (
          <div style={{ marginTop: 14, fontSize: 11.5, color: "#B0B0BA", textAlign: "center" }}>
            Masuk sebagai {scope.role === "superadmin" ? "Superadmin" : scope.role === "finance_admin" ? "Finance Admin" : "Staff"}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
