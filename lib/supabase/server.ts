import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Profile } from "@/lib/types";

/**
 * Client Supabase côté serveur, porteur de la session de l'utilisateur.
 * Toutes les requêtes passent par la RLS : il n'existe aucun chemin
 * privilégié dans l'application (la clé service_role n'y est jamais chargée).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: CookieOptions }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component : le rafraîchissement de
            // session est déjà pris en charge par le middleware.
          }
        },
      },
    },
  );
}

/** Profil de l'utilisateur connecté, ou null. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, discord_id, display_name, avatar_url, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
}
