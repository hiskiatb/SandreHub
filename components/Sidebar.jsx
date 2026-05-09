"use client";

import { useRouter, usePathname } from "next/navigation";
import { LayoutDashboard, UserPlus } from "lucide-react";

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const menu = [
    {
      name: "Dashboard",
      path: "/admin",
      icon: LayoutDashboard,
    },
    {
      name: "Create User",
      path: "/admin/create-user",
      icon: UserPlus,
    },
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4 flex flex-col">

      <h1 className="text-xl font-bold mb-8 flex items-center gap-2">
        <span className="text-blue-600">●</span> Admin Panel
      </h1>

      <div className="space-y-2">
        {menu.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                pathname === item.path
                  ? "bg-blue-600 text-white"
                  : "hover:bg-gray-100"
              }`}
            >
              <Icon size={18} />
              <span>{item.name}</span>
            </button>
          );
        })}
      </div>

    </div>
  );
}