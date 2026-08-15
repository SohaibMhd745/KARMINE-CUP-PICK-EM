import type { LockReason, Match, Question, Stage } from "@/lib/types";

/** Deadline effective d'un match : la sienne, sinon celle du round. */
export function effectiveLock(match: Match, stage: Stage): string | null {
  return match.locks_at ?? stage.locks_at;
}

/**
 * Miroir exact du trigger `enforce_pick_window()`.
 *
 * C'est une commodité d'affichage, PAS une sécurité : la base refuse de
 * toute façon toute écriture hors délai. Les deux implémentations doivent
 * rester alignées — si tu touches à l'une, touche à l'autre.
 */
export function lockState(
  match: Match,
  stage: Stage,
  now: Date = new Date(),
): LockReason {
  if (!stage.is_pickable) {
    return { kind: "round_closed", message: "Archive — non pronosticable." };
  }

  if (!stage.is_open) {
    return {
      kind: "round_closed",
      message: "Ce round n'est pas encore ouvert aux pronostics.",
    };
  }

  if (match.status !== "pending") {
    return {
      kind: "started",
      message:
        match.status === "live"
          ? "Match en cours — pronostics figés."
          : "Match terminé.",
    };
  }

  if (match.team_a_id === null || match.team_b_id === null) {
    return {
      kind: "not_ready",
      message: "En attente du résultat du tour précédent.",
    };
  }

  const lock = effectiveLock(match, stage);
  if (lock && now.getTime() >= new Date(lock).getTime()) {
    return {
      kind: "deadline",
      message: "Date limite dépassée.",
      at: lock,
    };
  }

  return { kind: "open" };
}

export function isQuestionOpen(
  question: Question,
  stage: Stage | undefined,
  now: Date = new Date(),
): boolean {
  if (!question.is_open) return false;
  if (question.correct_value !== null) return false;

  const lock = question.locks_at ?? stage?.locks_at ?? null;
  if (lock && now.getTime() >= new Date(lock).getTime()) return false;

  return true;
}

/** « 2 j 4 h », « 12 min 30 s » — compact, sans dépendance externe. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0 s";

  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, "0")} s`;
  return `${sec} s`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
