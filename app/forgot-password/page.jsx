"use client";

import { useState } from "react";
import supabase from "@/lib/supabase";
import { Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleReset = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "http://localhost:3000/reset-password",
    });

    if (error) return setMessage(error.message);

    setMessage("Check your email for reset link");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border rounded-2xl p-8 shadow-sm">

        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Reset Password
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter your email to receive reset link
        </p>

        <Input icon={<Mail size={16} />} placeholder="Email"
          value={email}
          onChange={setEmail}
        />

        <button
          onClick={handleReset}
          className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium"
        >
          Send Reset Link
        </button>

        {message && (
          <p className="text-sm text-center mt-4 text-gray-600">{message}</p>
        )}
      </div>
    </div>
  );
}

function Input({ icon, placeholder, value, onChange }) {
  return (
    <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 focus-within:ring-2 focus-within:ring-blue-500">
      <span className="text-gray-400">{icon}</span>
      <input
        className="w-full py-3 outline-none text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}