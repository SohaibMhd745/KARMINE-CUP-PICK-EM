"use client";

import { useEffect, useState } from "react";

import { formatCountdown } from "@/lib/lock";

/**
 * Compte à rebours vers la date limite.
 * Le premier rendu est vide pour éviter tout écart d'hydratation
 * (le serveur et le client n'ont jamais exactement la même horloge).
 */
export default function Countdown({
  target,
  onExpire,
}: {
  target: string;
  onExpire?: () => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const deadline = new Date(target).getTime();

    const tick = () => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0) onExpire?.();
      return left;
    };

    if (tick() <= 0) return;

    const id = setInterval(() => {
      if (tick() <= 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
    // `onExpire` est volontairement hors dépendances : le parent le
    // recrée à chaque rendu, ce qui relancerait l'intervalle en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (remaining === null) return null;
  if (remaining <= 0) return <span className="countdown urgent">verrouillé</span>;

  const urgent = remaining < 10 * 60 * 1000;

  return (
    <span className={`countdown${urgent ? " urgent" : ""}`}>
      {formatCountdown(remaining)}
    </span>
  );
}
