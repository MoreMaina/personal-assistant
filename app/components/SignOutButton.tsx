"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  const [loading, setLoading] =
    useState(false);

  async function handleSignOut() {
    setLoading(true);

    const supabase = createClient();

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      setLoading(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      aria-label="Sign out"
      title="Sign out"
      className="topbar__icon-button"
    >
      {loading ? "…" : "↪"}
    </button>
  );
}