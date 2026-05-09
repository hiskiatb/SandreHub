"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/supabase";
import { Mail, UserPlus, Trash2, AlertTriangle } from "lucide-react";

export default function CreateUserPage() {
  const [email, setEmail] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // DELETE STATE
  const [selectedUser, setSelectedUser] = useState(null);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase.from("profiles").select("*");
    setUsers(data || []);
  };

  // ================= CREATE =================
  const handleCreateUser = async () => {
    if (!email) return alert("Email is required");

    setLoading(true);

    const { error } = await supabase
      .from("profiles")
      .insert([{ email }]);

    setLoading(false);

    if (error) return alert(error.message);

    setEmail("");
    fetchUsers();
  };

  // ================= DELETE =================
  const handleDelete = async () => {
    if (!selectedUser) return;

    if (confirmText !== selectedUser.email) {
      return alert("Email does not match!");
    }

    setLoading(true);

    await supabase
      .from("profiles")
      .delete()
      .eq("id", selectedUser.id);

    setLoading(false);

    setSelectedUser(null);
    setConfirmText("");
    fetchUsers();
  };

  return (
    <div className="space-y-8">

      {/* TITLE */}
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <UserPlus size={24} />
        User Management
      </h1>

      {/* ================= CREATE USER ================= */}
      <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4 max-w-lg">

        <h2 className="font-semibold text-lg">
          Create New User
        </h2>

        <div className="flex items-center border rounded-lg px-3">
          <Mail size={18} className="text-gray-400" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
            className="w-full p-3 outline-none"
          />
        </div>

        <button
          onClick={handleCreateUser}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium"
        >
          {loading ? "Creating..." : "Create User"}
        </button>

      </div>

      {/* ================= USER TABLE ================= */}
      <div className="bg-white p-6 rounded-xl shadow-sm border">

        <h2 className="font-semibold text-lg mb-4">
          Existing Users
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">

            <thead className="text-left text-gray-500 border-b">
              <tr>
                <th className="py-2">Email</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b hover:bg-gray-50 transition"
                >
                  <td className="py-3">{user.email}</td>

                  <td className="py-3 text-right">
                    <button
                      onClick={() => setSelectedUser(user)}
                      className="text-red-600 hover:text-red-500 flex items-center gap-1 justify-end"
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>

          </table>
        </div>

      </div>

      {/* ================= DELETE MODAL ================= */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">

          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4 shadow-lg">

            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle />
              <h3 className="font-semibold text-lg">
                Delete User
              </h3>
            </div>

            <p className="text-sm text-gray-600">
              This action cannot be undone.  
              Please type the user's email to confirm.
            </p>

            <p className="text-sm font-medium">
              {selectedUser.email}
            </p>

            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type email to confirm..."
              className="w-full p-3 border rounded-lg"
            />

            <div className="flex justify-end gap-2">

              <button
                onClick={() => {
                  setSelectedUser(null);
                  setConfirmText("");
                }}
                className="px-4 py-2 rounded-lg border"
              >
                Cancel
              </button>

              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500"
              >
                Delete
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}