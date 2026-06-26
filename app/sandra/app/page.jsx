"use client";
// Retired route. The old "Fitur sedang disiapkan" placeholder is gone —
// /sandra/app now forwards straight to the real dashboard.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function SandraAppRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard"); }, [router]);

  return (
    <div style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0A0B" }}>
      <Loader2 size={26} color="#32BCAD" style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
