"use client";

import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

export default function AdminLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-100 text-gray-800">

      {/* SIDEBAR */}
      <Sidebar />

      {/* MAIN */}
      <div className="flex-1 flex flex-col">

        <Header />

        <main className="p-6">
          {children}
        </main>

      </div>

    </div>
  );
}