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

/* ------------------------------------------------------------- propagation bracket */

const INITIAL_MATCH_SEEDS: {
  stageCode: string;
  orderIndex: number;
  teamAName: string;
  teamBName: string;
}[] = [
  { stageCode: "cross", orderIndex: 1, teamAName: "ZEUB", teamBName: "FEET AND FUN" },
  { stageCode: "cross", orderIndex: 2, teamAName: "DESTRUCTIVE CAPACITY", teamBName: "FULL TRUST" },
  { stageCode: "r1", orderIndex: 1, teamAName: "KANCEL CORP", teamBName: "WALL BREAKERS" },
  { stageCode: "r1", orderIndex: 2, teamAName: "KDAVRE CORP", teamBName: "GOONING CORP" },
];

/**
 * Propage les équipes qualifiées (vainqueurs / perdants) dans tout le bracket.
 * Fonctionne à la fois via la fonction RPC PostgreSQL si présente et via
 * un calcul direct en TypeScript pour garantir la cohérence immédiate.
 */
export async function propagateBracket(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  // 1. Tenter la procédure stockée PostgreSQL
  try {
    await supabase.rpc("propagate_all_brackets");
  } catch {
    // Si la migration 0004 n'est pas encore appliquée en base, on poursuit en TS
  }

  // 2. Récupérer les étapes, équipes et matchs
  const [{ data: stages }, { data: teams }, { data: matches }] = await Promise.all([
    supabase.from("stages").select("id, code, order_index"),
    supabase.from("teams").select("id, name"),
    supabase
      .from("matches")
      .select(
        "id, stage_id, order_index, team_a_id, team_b_id, team_a_src_match, team_a_src_type, team_b_src_match, team_b_src_type, winner_team_id, status",
      ),
  ]);

  if (!matches || !stages || !teams) return 0;

  const stagesById = new Map(stages.map((s) => [s.id, s]));
  const stagesByCode = new Map(stages.map((s) => [s.code, s]));
  const teamsByName = new Map(teams.map((t) => [t.name, t]));
  const matchesById = new Map(matches.map((m) => [m.id, m]));

  let updatedCount = 0;

  // 3. S'assurer que les matchs initiaux ont bien leurs équipes de départ
  for (const seed of INITIAL_MATCH_SEEDS) {
    const stage = stagesByCode.get(seed.stageCode);
    if (!stage) continue;

    const match = matches.find(
      (m) => m.stage_id === stage.id && m.order_index === seed.orderIndex,
    );
    if (!match) continue;

    const teamA = teamsByName.get(seed.teamAName);
    const teamB = teamsByName.get(seed.teamBName);

    const updatePayload: { team_a_id?: number; team_b_id?: number } = {};
    if (teamA && match.team_a_id !== teamA.id) {
      updatePayload.team_a_id = teamA.id;
      match.team_a_id = teamA.id;
    }
    if (teamB && match.team_b_id !== teamB.id) {
      updatePayload.team_b_id = teamB.id;
      match.team_b_id = teamB.id;
    }

    if (Object.keys(updatePayload).length > 0) {
      await supabase.from("matches").update(updatePayload).eq("id", match.id);
      updatedCount++;
    }
  }

  // 4. Cascade de propagation (jusqu'à 6 passes pour traverser tout le bracket)
  for (let pass = 0; pass < 6; pass++) {
    let changedInPass = false;

    for (const match of matches) {
      // Propagation slot A
      if (match.team_a_src_match && match.status === "pending") {
        const src = matchesById.get(match.team_a_src_match);
        if (src) {
          let expectedTeamId: number | null = null;
          if (src.winner_team_id) {
            const loserId =
              src.winner_team_id === src.team_a_id
                ? src.team_b_id
                : src.winner_team_id === src.team_b_id
                ? src.team_a_id
                : null;
            expectedTeamId =
              match.team_a_src_type === "winner" ? src.winner_team_id : loserId;
          }

          if (match.team_a_id !== expectedTeamId) {
            match.team_a_id = expectedTeamId;
            await supabase
              .from("matches")
              .update({ team_a_id: expectedTeamId })
              .eq("id", match.id);
            changedInPass = true;
            updatedCount++;
          }
        }
      }

      // Propagation slot B
      if (match.team_b_src_match && match.status === "pending") {
        const src = matchesById.get(match.team_b_src_match);
        if (src) {
          let expectedTeamId: number | null = null;
          if (src.winner_team_id) {
            const loserId =
              src.winner_team_id === src.team_a_id
                ? src.team_b_id
                : src.winner_team_id === src.team_b_id
                ? src.team_a_id
                : null;
            expectedTeamId =
              match.team_b_src_type === "winner" ? src.winner_team_id : loserId;
          }

          if (match.team_b_id !== expectedTeamId) {
            match.team_b_id = expectedTeamId;
            await supabase
              .from("matches")
              .update({ team_b_id: expectedTeamId })
              .eq("id", match.id);
            changedInPass = true;
            updatedCount++;
          }
        }
      }
    }

    if (!changedInPass) break;
  }

  return updatedCount;
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
    async (supabase) => {
      const { error } = await supabase
        .from("matches")
        .update({
          winner_team_id: winnerTeamId,
          score_a: intOrNull(form, "score_a"),
          score_b: intOrNull(form, "score_b"),
          status,
        })
        .eq("id", matchId);

      if (error) return { error };

      // Propage immédiatement les vainqueurs et perdants sur les matchs aval
      await propagateBracket(supabase);

      return { error: null };
    },
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

/* ---------------------------------------------------------- rescoring & bracket */

export async function resyncBracket(): Promise<ActionResult> {
  return asAdmin(
    "resync_bracket",
    async (supabase) => {
      const count = await propagateBracket(supabase);
      return { error: null, payload: { count } };
    },
    {},
  );
}

export async function recomputeScores(): Promise<ActionResult> {
  return asAdmin(
    "recompute_scores",
    async (supabase) => {
      await propagateBracket(supabase);
      const { error } = await supabase.rpc("recompute_all_scores");
      return { error };
    },
    {},
  );
}

