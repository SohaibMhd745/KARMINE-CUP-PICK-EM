"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Rafraîchit la page dès qu'une des tables écoutées change.
 * Les événements sont regroupés (400 ms) : publier un résultat déclenche
 * plusieurs écritures en cascade via les triggers, inutile de re-rendre
 * autant de fois.
 */
export default function RealtimeRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tables.join(",");

  useEffect(() => {
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };

    let channel = supabase.channel(`refresh:${key}`);
    for (const table of key.split(",")) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        schedule,
      );
    }
    channel.subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [supabase, router, key]);

  return null;
}
