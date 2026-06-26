"use client";
// Root page → redirect ke hub picker
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/login"); }, []);
  return null;
}
