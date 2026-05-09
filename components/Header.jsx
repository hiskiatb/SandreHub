import { Bell, UserCircle } from "lucide-react";

export default function Header() {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">

      <h2 className="font-semibold text-lg">
        Admin Dashboard
      </h2>

      <div className="flex items-center gap-4">

        <Bell size={20} className="text-gray-500 cursor-pointer" />

        <div className="flex items-center gap-2">
          <UserCircle size={22} />
          <span className="text-sm text-gray-600">
            Admin
          </span>
        </div>

      </div>

    </div>
  );
}