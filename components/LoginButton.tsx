"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export default function LoginButton({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setBusy(false);
      alert(`Connexion impossible : ${error.message}`);
    }
  }

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
    setBusy(false);
  }

  if (!profile) {
    return (
      <button
        type="button"
        className="btn btn-primary"
        onClick={signIn}
        disabled={busy}
      >
        {busy ? "…" : "SE CONNECTER AVEC DISCORD"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn"
      onClick={signOut}
      disabled={busy}
      title="Se déconnecter"
    >
      {profile.avatar_url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img className="avatar" src={profile.avatar_url} alt="" />
      )}
      <span>{profile.display_name}</span>
    </button>
  );
}
