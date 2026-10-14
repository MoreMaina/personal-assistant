"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import AppIcon from "@/app/components/AppIcon";

type SignOutButtonProps = {
  variant?: "icon" | "menu";
};

export default function SignOutButton({
  variant = "icon",
}: SignOutButtonProps) {
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
      className={
        variant === "menu"
          ? "app-utilities__action app-utilities__signout"
          : "topbar__icon-button"
      }
    >
      {loading ? (
        "…"
      ) : variant === "menu" ? (
        <>
          <AppIcon name="sign-out" size={18} />
          <span>Sign out</span>
        </>
      ) : (
        "↪"
      )}
    </button>
  );
}