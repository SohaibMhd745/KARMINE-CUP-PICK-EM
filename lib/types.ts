// Types applicatifs, alignés sur supabase/migrations/0001_init.sql.

export type StageBucket = "group" | "playoffs" | "final";
export type MatchStatus = "pending" | "live" | "done";
export type SlotSource = "winner" | "loser";
export type QuestionKind = "team" | "player" | "champion" | "boolean" | "number";

export interface Team {
  id: number;
  name: string;
  short_code: string;
  group_name: string | null;
  seed: number | null;
  logo_url: string | null;
}

export interface Stage {
  id: number;
  code: string;
  label: string;
  bucket: StageBucket;
  order_index: number;
  points_per_correct: number;
  is_pickable: boolean;
  is_open: boolean;
  opens_at: string | null;
  locks_at: string | null;
}

export interface Match {
  id: number;
  stage_id: number;
  order_index: number;
  label: string | null;
  best_of: number;
  team_a_id: number | null;
  team_b_id: number | null;
  team_a_src_match: number | null;
  team_a_src_type: SlotSource | null;
  team_b_src_match: number | null;
  team_b_src_type: SlotSource | null;
  scheduled_at: string | null;
  locks_at: string | null;
  status: MatchStatus;
  winner_team_id: number | null;
  score_a: number | null;
  score_b: number | null;
}

export interface Pick {
  id: number;
  user_id: string;
  match_id: number;
  team_id: number;
  points: number;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: number;
  stage_id: number | null;
  code: string;
  label: string;
  kind: QuestionKind;
  points: number;
  order_index: number;
  is_open: boolean;
  locks_at: string | null;
  correct_value: string | null;
}

export interface Answer {
  id: number;
  user_id: string;
  question_id: number;
  value: string;
  points: number;
}

export interface Profile {
  id: string;
  discord_id: string | null;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
}

export interface LegacyScore {
  alias: string;
  group_points: number;
  claimed_by: string | null;
}

export interface TournamentPlayer {
  id: number;
  team_id: number | null;
  ign: string;
}

export interface Stream {
  id: number;
  display_name: string;
  url: string;
  order_index: number;
  is_active: boolean;
}

export interface LeaderboardRow {
  user_id: string | null;
  name: string;
  avatar_url: string | null;
  legacy_alias: string | null;
  /** true = alias Excel pas encore rattaché à un compte Discord */
  is_ghost: boolean;
  group_points: number;
  playoff_points: number;
  final_points: number;
  total_points: number;
  first_pick_at: string | null;
  position: number;
}

/** Raison pour laquelle un match n'est pas pronosticable, à afficher tel quel. */
export type LockReason =
  | { kind: "open" }
  | { kind: "not_ready"; message: string }
  | { kind: "round_closed"; message: string }
  | { kind: "deadline"; message: string; at: string }
  | { kind: "started"; message: string };

/** Messages d'erreur renvoyés par les triggers Postgres, traduits pour l'UI. */
export const DB_ERROR_MESSAGES: Record<string, string> = {
  PICKS_LOCKED: "Trop tard — la date limite de ce match est dépassée.",
  MATCH_STARTED: "Le match a commencé, les pronostics sont figés.",
  MATCH_NOT_READY: "Les deux équipes ne sont pas encore connues.",
  ROUND_CLOSED: "Ce round n'est pas encore ouvert aux pronostics.",
  STAGE_NOT_PICKABLE: "Cette étape est une archive, elle ne se pronostique pas.",
  INVALID_TEAM: "Cette équipe ne participe pas à ce match.",
  QUESTION_CLOSED: "Cette question n'est pas ouverte.",
  QUESTION_RESOLVED: "La réponse a déjà été publiée.",
  ANSWERS_LOCKED: "Trop tard — la date limite de cette question est dépassée.",
  FORBIDDEN_ADMIN_CHANGE: "Seul un administrateur peut modifier les droits admin.",
  FORBIDDEN_IDENTITY_CHANGE: "Identité Discord non modifiable.",
  FORBIDDEN: "Action réservée aux administrateurs.",
};

export function translateDbError(error: { message?: string } | null): string {
  if (!error?.message) return "Une erreur est survenue.";
  for (const [code, message] of Object.entries(DB_ERROR_MESSAGES)) {
    if (error.message.includes(code)) return message;
  }
  return error.message;
}
