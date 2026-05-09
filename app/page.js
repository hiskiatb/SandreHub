"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Langsung arahkan ke halaman login saat komponen dimuat
    router.replace("/login");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {/* Loading spinner minimalis sesuai tema Premium */}
        <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold tracking-widest text-gray-400 uppercase">
          Redirecting to Login...
        </p>
      </div>
    </div>
  );
}