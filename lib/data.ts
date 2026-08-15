import { createClient } from "@/lib/supabase/server";
import type {
  Answer,
  LeaderboardRow,
  LegacyScore,
  Match,
  Pick,
  Question,
  Stage,
  Stream,
  Team,
  TournamentPlayer,
} from "@/lib/types";

/**
 * Le référentiel est minuscule (8 équipes, 21 matchs, 5 étapes) : on le
 * charge en entier et on assemble en mémoire. Cela évite les jointures
 * imbriquées PostgREST, ambiguës dès qu'une table a plusieurs clés
 * étrangères vers la même cible (`team_a_id`, `team_b_id`, `winner_team_id`).
 */
export interface TournamentData {
  stages: Stage[];
  matches: Match[];
  teams: Team[];
  teamsById: Map<number, Team>;
  stagesById: Map<number, Stage>;
  stagesByCode: Map<string, Stage>;
}

export async function getTournament(): Promise<TournamentData> {
  const supabase = await createClient();

  const [stagesRes, matchesRes, teamsRes] = await Promise.all([
    supabase.from("stages").select("*").order("order_index"),
    supabase.from("matches").select("*").order("order_index"),
    supabase.from("teams").select("*").order("group_name").order("seed"),
  ]);

  const stages = (stagesRes.data ?? []) as Stage[];
  const matches = (matchesRes.data ?? []) as Match[];
  const teams = (teamsRes.data ?? []) as Team[];

  return {
    stages,
    matches,
    teams,
    teamsById: new Map(teams.map((t) => [t.id, t])),
    stagesById: new Map(stages.map((s) => [s.id, s])),
    stagesByCode: new Map(stages.map((s) => [s.code, s])),
  };
}

export async function getMyPicks(userId: string | null): Promise<Map<number, Pick>> {
  if (!userId) return new Map();

  const supabase = await createClient();
  const { data } = await supabase.from("picks").select("*").eq("user_id", userId);

  return new Map(((data ?? []) as Pick[]).map((p) => [p.match_id, p]));
}

export async function getMyAnswers(
  userId: string | null,
): Promise<Map<number, Answer>> {
  if (!userId) return new Map();

  const supabase = await createClient();
  const { data } = await supabase.from("answers").select("*").eq("user_id", userId);

  return new Map(((data ?? []) as Answer[]).map((a) => [a.question_id, a]));
}

export async function getQuestions(): Promise<Question[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("questions")
    .select("*")
    .order("order_index");

  return (data ?? []) as Question[];
}

export async function getPlayers(): Promise<TournamentPlayer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tournament_players")
    .select("*")
    .order("ign");

  return (data ?? []) as TournamentPlayer[];
}

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leaderboard")
    .select("*")
    .order("position");

  return (data ?? []) as LeaderboardRow[];
}

export async function getStreams(): Promise<Stream[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("streams")
    .select("*")
    .eq("is_active", true)
    .order("order_index");

  return (data ?? []) as Stream[];
}

export async function getLegacyScores(): Promise<LegacyScore[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("legacy_scores")
    .select("*")
    .order("group_points", { ascending: false })
    .order("alias");

  return (data ?? []) as LegacyScore[];
}

export async function getSettings(): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value");

  return Object.fromEntries(
    ((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]),
  );
}

/** Classement d'une poule, calculé depuis les matchs joués. */
export interface Standing {
  team: Team;
  wins: number;
  losses: number;
}

export function computeStandings(
  data: TournamentData,
  groupName: string,
): Standing[] {
  const groupStage = data.stagesByCode.get("group");
  const teams = data.teams.filter((t) => t.group_name === groupName);
  const table = new Map<number, Standing>(
    teams.map((t) => [t.id, { team: t, wins: 0, losses: 0 }]),
  );

  for (const match of data.matches) {
    if (!groupStage || match.stage_id !== groupStage.id) continue;
    if (match.winner_team_id === null) continue;
    if (match.team_a_id === null || match.team_b_id === null) continue;
    if (!table.has(match.team_a_id) || !table.has(match.team_b_id)) continue;

    const loserId =
      match.winner_team_id === match.team_a_id ? match.team_b_id : match.team_a_id;

    table.get(match.winner_team_id)!.wins += 1;
    table.get(loserId)!.losses += 1;
  }

  return [...table.values()].sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses || a.team.name.localeCompare(b.team.name),
  );
}

/**
 * Libellé d'un slot encore inconnu : « Vainqueur du Quart de finale 1 ».
 * Remplace les « À DÉTERMINER » opaques du prototype.
 */
export function slotLabel(
  match: Match,
  slot: "a" | "b",
  data: TournamentData,
): string {
  const srcId = slot === "a" ? match.team_a_src_match : match.team_b_src_match;
  const srcType = slot === "a" ? match.team_a_src_type : match.team_b_src_type;

  if (!srcId || !srcType) return "À déterminer";

  const src = data.matches.find((m) => m.id === srcId);
  if (!src) return "À déterminer";

  const name = src.label ?? `Match ${src.order_index}`;
  return srcType === "winner" ? `Vainqueur — ${name}` : `Perdant — ${name}`;
}
