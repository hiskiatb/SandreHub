"use client";
// Redirect permanent — /register → /sandra/register
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function RegisterRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/sandra/register"); }, []);
  return null;
}
