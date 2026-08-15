"use server";

import { revalidatePath } from "next/cache";

import { createClient, getProfile } from "@/lib/supabase/server";
import { translateDbError } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Toutes les mutations admin passent par ici.
 *
 * La vérification `is_admin` est faite deux fois : ici pour un message
 * clair, et par la RLS Postgres qui, elle, fait autorité. Aucune clé
 * service_role n'est utilisée — un non-admin qui rejouerait cette action
 * serait refusé par la base.
 */
async function asAdmin<T>(
  action: string,
  fn: (
    supabase: Awaited<ReturnType<typeof createClient>>,
    actorId: string,
  ) => Promise<{ error: { message: string } | null; payload?: T }>,
  payloadForLog: Record<string, unknown>,
): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile?.is_admin) {
    return { ok: false, message: "Action réservée aux administrateurs." };
  }

  const supabase = await createClient();
  const { error } = await fn(supabase, profile.id);

  if (error) {
    return { ok: false, message: translateDbError(error) };
  }

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action,
    payload: payloadForLog,
  });

  revalidatePath("/", "layout");
  return { ok: true, message: "Enregistré." };
}

function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function intOrNull(form: FormData, key: string): number | null {
  const value = str(form, key);
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/* ------------------------------------------------------------- matchs */

export async function publishResult(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const matchId = Number(str(form, "match_id"));
  const winnerRaw = str(form, "winner_team_id");
  const winnerTeamId = winnerRaw === "" ? null : Number(winnerRaw);
  const status = str(form, "status") || "pending";

  if (!Number.isFinite(matchId)) {
    return { ok: false, message: "Match invalide." };
  }
  if (status === "done" && winnerTeamId === null) {
    return { ok: false, message: "Choisis le vainqueur avant de marquer le match terminé." };
  }

  return asAdmin(
    "publish_result",
    async (supabase) =>
      supabase
        .from("matches")
        .update({
          winner_team_id: winnerTeamId,
          score_a: intOrNull(form, "score_a"),
          score_b: intOrNull(form, "score_b"),
          status,
        })
        .eq("id", matchId),
    { match_id: matchId, winner_team_id: winnerTeamId, status },
  );
}

export async function updateMatchSchedule(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const matchId = Number(str(form, "match_id"));
  const scheduledAt = str(form, "scheduled_at") || null;
  const locksAt = str(form, "locks_at") || null;

  return asAdmin(
    "update_match_schedule",
    async (supabase) =>
      supabase
        .from("matches")
        .update({ scheduled_at: scheduledAt, locks_at: locksAt })
        .eq("id", matchId),
    { match_id: matchId, scheduled_at: scheduledAt, locks_at: locksAt },
  );
}

/* ------------------------------------------------------------- rounds */

export async function updateStage(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const stageId = Number(str(form, "stage_id"));
  const points = intOrNull(form, "points_per_correct") ?? 1;
  const isOpen = form.get("is_open") === "on";
  const locksAt = str(form, "locks_at") || null;

  if (points < 0) {
    return { ok: false, message: "Le barème ne peut pas être négatif." };
  }

  return asAdmin(
    "update_stage",
    async (supabase) =>
      supabase
        .from("stages")
        .update({ points_per_correct: points, is_open: isOpen, locks_at: locksAt })
        .eq("id", stageId),
    { stage_id: stageId, points_per_correct: points, is_open: isOpen, locks_at: locksAt },
  );
}

/* ---------------------------------------------------------- questions */

export async function updateQuestion(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const questionId = Number(str(form, "question_id"));
  const isOpen = form.get("is_open") === "on";
  const correctValue = str(form, "correct_value") || null;
  const points = intOrNull(form, "points") ?? 2;

  return asAdmin(
    "update_question",
    async (supabase) =>
      supabase
        .from("questions")
        .update({ is_open: isOpen, correct_value: correctValue, points })
        .eq("id", questionId),
    { question_id: questionId, is_open: isOpen, correct_value: correctValue, points },
  );
}

/* ------------------------------------------------- rattachement Excel */

/**
 * Arbitrage manuel : ne concerne que les cas où `auto_link_alias()` a
 * refusé de trancher (homonymes, alias en double, pseudo Discord
 * différent du nom de l'Excel).
 */
export async function linkAlias(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const alias = str(form, "alias");
  const userRaw = str(form, "claimed_by");
  const claimedBy = userRaw === "" ? null : userRaw;

  if (!alias) return { ok: false, message: "Alias manquant." };

  return asAdmin(
    "link_alias",
    async (supabase) =>
      supabase
        .from("legacy_scores")
        .update({
          claimed_by: claimedBy,
          // `admin` fige la décision humaine : une reprise automatique
          // ultérieure ne repassera pas dessus.
          claim_method: claimedBy === null ? null : "admin",
          claimed_at: claimedBy === null ? null : new Date().toISOString(),
        })
        .eq("alias", alias),
    { alias, claimed_by: claimedBy },
  );
}

const OUTCOME_LABELS: Record<string, string> = {
  linked: "rattaché(s)",
  already_linked: "déjà rattaché(s)",
  no_match: "sans correspondance",
  ambiguous_alias: "alias en double, à arbitrer",
  ambiguous_profile: "homonymes, à arbitrer",
  alias_taken: "alias déjà pris, à arbitrer",
};

/**
 * Repasse le rattachement automatique sur tous les comptes qui n'ont pas
 * encore d'alias. Utile après une correction de pseudo, ou pour les
 * comptes créés avant la mise en place du système.
 */
export async function autoLinkAliases(): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile?.is_admin) {
    return { ok: false, message: "Action réservée aux administrateurs." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("auto_link_all_aliases");

  if (error) {
    return { ok: false, message: translateDbError(error) };
  }

  const rows = (data ?? []) as { outcome: string; total: number }[];

  await supabase.from("audit_log").insert({
    actor_id: profile.id,
    action: "auto_link_all",
    payload: { result: rows },
  });

  revalidatePath("/", "layout");

  const linked = rows.find((r) => r.outcome === "linked")?.total ?? 0;
  const detail = rows
    .filter((r) => r.outcome !== "linked" && r.outcome !== "no_match")
    .map((r) => `${r.total} ${OUTCOME_LABELS[r.outcome] ?? r.outcome}`)
    .join(" · ");

  return {
    ok: true,
    message:
      linked === 0 && detail === ""
        ? "Aucun nouveau rattachement."
        : `${linked} rattachement(s) automatique(s).${detail ? ` Reste : ${detail}.` : ""}`,
  };
}

/* --------------------------------------------------------- roster */

export async function assignPlayerTeam(
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const playerId = Number(str(form, "player_id"));
  const teamRaw = str(form, "team_id");
  const teamId = teamRaw === "" ? null : Number(teamRaw);

  return asAdmin(
    "assign_player_team",
    async (supabase) =>
      supabase.from("tournament_players").update({ team_id: teamId }).eq("id", playerId),
    { player_id: playerId, team_id: teamId },
  );
}

/* ---------------------------------------------------------- rescoring */

export async function recomputeScores(): Promise<ActionResult> {
  return asAdmin(
    "recompute_scores",
    async (supabase) => {
      const { error } = await supabase.rpc("recompute_all_scores");
      return { error };
    },
    {},
  );
}
