"use client";

import { useState } from "react";
import supabase from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleUpdate = async () => {
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      return setMessage(error.message);
    }

    setMessage("Password updated successfully!");
    setTimeout(() => router.push("/login"), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow w-96 space-y-4">
        <h1 className="text-xl font-bold">Reset Password</h1>

        <input
          type="password"
          placeholder="New password"
          className="w-full border p-3 rounded-lg"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button onClick={handleUpdate} className="w-full bg-blue-600 text-white py-3 rounded-lg">
          Update Password
        </button>

        {message && <p className="text-sm text-center">{message}</p>}
      </div>
    </div>
  );
}