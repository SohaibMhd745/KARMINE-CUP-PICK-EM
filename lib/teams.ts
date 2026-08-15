import type { Team } from "@/lib/types";

/**
 * Mapping statique des logos d'équipes situés dans /assets/teams/.
 * Supporte les noms, abréviations (short codes) et slugs normalisés.
 */
export const TEAM_LOGOS: Record<string, string> = {
  // Kancel Corp
  "kancel_corp": "/assets/teams/kancel_corp.jpg",
  "kancel corp": "/assets/teams/kancel_corp.jpg",
  "kan": "/assets/teams/kancel_corp.jpg",

  // Gooning Corp
  "gooning_corp": "/assets/teams/gooning_corp.jpg",
  "gooning corp": "/assets/teams/gooning_corp.jpg",
  "goo": "/assets/teams/gooning_corp.jpg",

  // Zeub
  "zeub": "/assets/teams/zeub.jpg",
  "zeu": "/assets/teams/zeub.jpg",

  // Full Trust
  "full_trust": "/assets/teams/full_trust.jpg",
  "full trust": "/assets/teams/full_trust.jpg",
  "ful": "/assets/teams/full_trust.jpg",

  // Kdavre Corp
  "kdavre_corp": "/assets/teams/kdavre_corp.jpg",
  "kdavre corp": "/assets/teams/kdavre_corp.jpg",
  "kda": "/assets/teams/kdavre_corp.jpg",

  // Wall Breakers
  "wall_breakers": "/assets/teams/wall_breakers.jpg",
  "wall breakers": "/assets/teams/wall_breakers.jpg",
  "wal": "/assets/teams/wall_breakers.jpg",

  // Destructive Capacity
  "destructive_capacity": "/assets/teams/destructive_capacity.jpg",
  "destructive capacity": "/assets/teams/destructive_capacity.jpg",
  "des": "/assets/teams/destructive_capacity.jpg",

  // Feet and Fun
  "feet_and_fun": "/assets/teams/feet_and_fun.jpg",
  "feet and fun": "/assets/teams/feet_and_fun.jpg",
  "feet & fun": "/assets/teams/feet_and_fun.jpg",
  "fee": "/assets/teams/feet_and_fun.jpg",
};

/**
 * Résout l'URL du logo pour une équipe donnée avec fallback intelligent
 * sur l'URL en base, le short_code ou le nom.
 */
export function getTeamLogoUrl(
  team: Team | { name?: string; short_code?: string; logo_url?: string | null } | string | null | undefined
): string | null {
  if (!team) return null;

  if (typeof team === "string") {
    const key = team.trim().toLowerCase();
    return TEAM_LOGOS[key] ?? null;
  }

  if (team.logo_url && team.logo_url.trim().length > 0) {
    return team.logo_url;
  }

  if (team.short_code) {
    const byCode = TEAM_LOGOS[team.short_code.trim().toLowerCase()];
    if (byCode) return byCode;
  }

  if (team.name) {
    const byName = TEAM_LOGOS[team.name.trim().toLowerCase()];
    if (byName) return byName;
  }

  return null;
}
