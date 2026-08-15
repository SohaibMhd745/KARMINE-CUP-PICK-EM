import type { LegacyScore, Profile } from "@/lib/types";

/**
 * Rapprochement des alias du classement Excel avec les comptes Discord.
 *
 * ATTENTION — partage des rôles :
 *
 *   • Le rattachement qui FAIT AUTORITÉ est en base
 *     (`auto_link_alias()`, migration 0002). Il est déterministe, ne se
 *     déclenche que sur une correspondance exacte ou normalisée unique,
 *     et personne ne peut le contourner.
 *
 *   • Ce fichier ne sert QU'À SUGGÉRER. Il propose à l'organisateur des
 *     rapprochements approximatifs qu'il valide d'un clic. Une suggestion
 *     n'accorde aucun point tant qu'un humain n'a pas tranché — il y a des
 *     lots, un « à peu près » ne doit jamais s'appliquer tout seul.
 *
 * `normalizeAlias` reproduit `public.normalize_alias(text)` ; elle traite
 * un peu plus d'accents que la version SQL (NFD contre table de
 * correspondance). L'écart est sans conséquence : ici, un faux positif
 * n'est qu'une suggestion de plus dans la liste.
 */

const TEAM_PREFIX = /^\s*[[({<][^\])}>]*[\])}>]\s*/u;
const DISCRIMINATOR = /#\d{4}$/u;
const DECORATION = /[^\p{L}\p{N}]+/gu;

export function normalizeAlias(raw: string): string {
  return raw
    .replace(TEAM_PREFIX, "")
    .replace(DISCRIMINATOR, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(DECORATION, "");
}

/* --------------------------------------------------------- similarité */

function bigrams(value: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < value.length - 1; i += 1) {
    const gram = value.slice(i, i + 2);
    out.set(gram, (out.get(gram) ?? 0) + 1);
  }
  return out;
}

/** Coefficient de Dice sur les bigrammes : 0 = étranger, 1 = identique. */
function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const left = bigrams(a);
  const right = bigrams(b);
  let shared = 0;

  for (const [gram, count] of left) {
    shared += Math.min(count, right.get(gram) ?? 0);
  }

  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

export interface AliasSuggestion {
  profile: Profile;
  /** 0 → 1 */
  score: number;
  /** Motif lisible, affiché tel quel à l'organisateur. */
  reason: string;
}

const SHOW_FROM = 0.45;

/**
 * Comptes plausibles pour un alias resté orphelin, du plus au moins
 * probable. `taken` exclut les comptes qui portent déjà un autre alias :
 * `legacy_scores.claimed_by` est UNIQUE, les proposer serait un piège.
 */
export function suggestProfiles(
  alias: string,
  profiles: Profile[],
  taken: ReadonlySet<string>,
  limit = 4,
): AliasSuggestion[] {
  const target = normalizeAlias(alias);
  if (target === "") return [];

  const out: AliasSuggestion[] = [];

  for (const profile of profiles) {
    if (taken.has(profile.id)) continue;

    const candidate = normalizeAlias(profile.display_name);
    if (candidate === "") continue;

    if (candidate === target) {
      out.push({ profile, score: 1, reason: "pseudo identique" });
      continue;
    }

    // « ZEUB Camthalion » ⊃ « Camthalion » : préfixe d'équipe sans
    // crochets, que la normalisation ne peut pas deviner.
    const long = candidate.length >= target.length ? candidate : target;
    const short = candidate.length >= target.length ? target : candidate;

    if (short.length >= 4 && long.includes(short)) {
      out.push({ profile, score: 0.9, reason: "pseudo contenu dans l'alias" });
      continue;
    }

    const score = dice(candidate, target);
    if (score >= SHOW_FROM) {
      out.push({
        profile,
        score,
        reason: `ressemblance ${Math.round(score * 100)} %`,
      });
    }
  }

  return out
    .sort(
      (a, b) =>
        b.score - a.score || a.profile.display_name.localeCompare(b.profile.display_name),
    )
    .slice(0, limit);
}

/* ------------------------------------------------------- diagnostics */

export interface AliasReview {
  score: LegacyScore;
  suggestions: AliasSuggestion[];
  /** Autres alias qui se normalisent pareil : la machine refuse de trancher. */
  twins: string[];
}

export interface AliasReport {
  linkedAuto: LegacyScore[];
  linkedByAdmin: LegacyScore[];
  /** Orphelins avec au moins une piste — c'est là qu'un clic suffit. */
  toArbitrate: AliasReview[];
  /** Orphelins sans aucune piste : personne ne s'est encore inscrit. */
  orphans: AliasReview[];
  /** Comptes inscrits qui ne portent aucun score de poule. */
  unmatchedProfiles: Profile[];
}

export function buildAliasReport(
  scores: LegacyScore[],
  profiles: Profile[],
): AliasReport {
  const taken = new Set(
    scores.filter((s) => s.claimed_by !== null).map((s) => s.claimed_by as string),
  );

  const byNorm = new Map<string, string[]>();
  for (const score of scores) {
    const key = normalizeAlias(score.alias);
    if (key === "") continue;
    byNorm.set(key, [...(byNorm.get(key) ?? []), score.alias]);
  }

  const linkedAuto: LegacyScore[] = [];
  const linkedByAdmin: LegacyScore[] = [];
  const toArbitrate: AliasReview[] = [];
  const orphans: AliasReview[] = [];

  for (const score of scores) {
    if (score.claimed_by !== null) {
      (score.claim_method === "auto" ? linkedAuto : linkedByAdmin).push(score);
      continue;
    }

    const review: AliasReview = {
      score,
      suggestions: suggestProfiles(score.alias, profiles, taken),
      twins: (byNorm.get(normalizeAlias(score.alias)) ?? []).filter(
        (a) => a !== score.alias,
      ),
    };

    (review.suggestions.length > 0 ? toArbitrate : orphans).push(review);
  }

  const byPoints = (a: { score: LegacyScore }, b: { score: LegacyScore }) =>
    b.score.group_points - a.score.group_points ||
    a.score.alias.localeCompare(b.score.alias);

  toArbitrate.sort((a, b) => b.suggestions[0].score - a.suggestions[0].score || byPoints(a, b));
  orphans.sort(byPoints);

  return {
    linkedAuto,
    linkedByAdmin,
    toArbitrate,
    orphans,
    unmatchedProfiles: profiles.filter((p) => !taken.has(p.id)),
  };
}
