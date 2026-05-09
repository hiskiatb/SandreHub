"use client";

import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

export default function AdminPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">

      <h1 className="text-2xl font-bold">
        Dashboard
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <div
          onClick={() => router.push("/admin/create-user")}
          className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md cursor-pointer transition flex items-center gap-4"
        >
          <div className="bg-blue-100 p-3 rounded-lg">
            <UserPlus className="text-blue-600" size={22} />
          </div>

          <div>
            <h2 className="text-lg font-semibold">
              Create New User
            </h2>
            <p className="text-gray-500 text-sm">
              Add new user into the system
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}