import AdminForm from "@/components/admin/AdminForm";
import DateTimeField from "@/components/admin/DateTimeField";
import {
  assignPlayerTeam,
  linkAlias,
  publishResult,
  updateMatchSchedule,
  updateQuestion,
  updateStage,
} from "@/app/admin/actions";
import type { AliasSuggestion } from "@/lib/alias";
import { CHAMPIONS } from "@/lib/champions";
import { formatDateTime } from "@/lib/lock";
import type {
  LegacyScore,
  Match,
  Profile,
  Question,
  Stage,
  Team,
  TournamentPlayer,
} from "@/lib/types";

/* ------------------------------------------------------------- matchs */

export function MatchAdminRow({
  match,
  stage,
  teamA,
  teamB,
  slotA,
  slotB,
}: {
  match: Match;
  stage: Stage;
  teamA: Team | null;
  teamB: Team | null;
  slotA: string;
  slotB: string;
}) {
  const ready = teamA !== null && teamB !== null;

  return (
    <div style={{ borderBottom: "1px solid var(--line)", padding: "14px 0" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong>{match.label ?? `Match ${match.order_index}`}</strong>
        <span className="dim" style={{ fontSize: 12 }}>
          {teamA?.name ?? slotA} vs {teamB?.name ?? slotB}
        </span>
        <span className={`pill ${match.status === "done" ? "done" : match.status === "live" ? "live" : "closed"}`}>
          {match.status}
        </span>
      </div>

      {!ready && (
        <p className="sub" style={{ fontSize: 12, margin: "6px 0 0" }}>
          Les deux équipes ne sont pas encore connues — publie d&apos;abord le tour
          précédent, le bracket se remplira automatiquement.
        </p>
      )}

      <AdminForm action={publishResult} submitLabel="Publier">
        <input type="hidden" name="match_id" value={match.id} />

        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--muted)" }}>
          Vainqueur
          <select
            name="winner_team_id"
            className="select"
            defaultValue={match.winner_team_id ?? ""}
            disabled={!ready}
            style={{ minWidth: 190 }}
          >
            <option value="">— aucun —</option>
            {teamA && <option value={teamA.id}>{teamA.name}</option>}
            {teamB && <option value={teamB.id}>{teamB.name}</option>}
          </select>
        </label>

        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--muted)" }}>
          Score {teamA?.short_code ?? "A"}
          <input
            type="number"
            name="score_a"
            className="input"
            min={0}
            defaultValue={match.score_a ?? ""}
            style={{ width: 80 }}
          />
        </label>

        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--muted)" }}>
          Score {teamB?.short_code ?? "B"}
          <input
            type="number"
            name="score_b"
            className="input"
            min={0}
            defaultValue={match.score_b ?? ""}
            style={{ width: 80 }}
          />
        </label>

        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--muted)" }}>
          Statut
          <select name="status" className="select" defaultValue={match.status} style={{ minWidth: 130 }}>
            <option value="pending">à venir (ouvert)</option>
            <option value="live">en direct (verrouille)</option>
            <option value="done">terminé</option>
          </select>
        </label>
      </AdminForm>

      <AdminForm action={updateMatchSchedule} submitLabel="Mettre à jour l'horaire">
        <input type="hidden" name="match_id" value={match.id} />
        <DateTimeField name="scheduled_at" defaultValue={match.scheduled_at} label="Heure du match" />
        <DateTimeField name="locks_at" defaultValue={match.locks_at} label="Date limite des pronostics" />
        <span className="dim" style={{ fontSize: 11 }}>
          {match.locks_at
            ? `Verrouillage : ${formatDateTime(match.locks_at)}`
            : stage.locks_at
              ? `Hérite du round : ${formatDateTime(stage.locks_at)}`
              : "⚠ Aucune date limite — les pronostics resteront ouverts."}
        </span>
      </AdminForm>
    </div>
  );
}

/* ------------------------------------------------------------- rounds */

export function StageAdminRow({ stage, matchCount }: { stage: Stage; matchCount: number }) {
  return (
    <AdminForm action={updateStage} submitLabel="Enregistrer">
      <input type="hidden" name="stage_id" value={stage.id} />

      <span className="grow">
        <strong>{stage.label}</strong>
        <br />
        <span className="dim" style={{ fontSize: 11 }}>
          {matchCount} match{matchCount > 1 ? "s" : ""} · bucket « {stage.bucket} »
        </span>
      </span>

      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
        <input type="checkbox" name="is_open" defaultChecked={stage.is_open} />
        Ouvert aux pronostics
      </label>

      <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--muted)" }}>
        Points / bon pronostic
        <input
          type="number"
          name="points_per_correct"
          className="input"
          min={0}
          defaultValue={stage.points_per_correct}
          style={{ width: 90 }}
        />
      </label>

      <DateTimeField
        name="locks_at"
        defaultValue={stage.locks_at}
        label="Date limite du round"
      />
    </AdminForm>
  );
}

/* ---------------------------------------------------------- questions */

function correctValueOptions(
  question: Question,
  teams: Team[],
  players: TournamentPlayer[],
): string[] | null {
  switch (question.kind) {
    case "team":
      return teams.map((t) => t.name);
    case "player":
      return players.map((p) => p.ign);
    case "champion":
      return [...CHAMPIONS];
    case "boolean":
      return ["Oui", "Non"];
    default:
      return null;
  }
}

export function QuestionAdminRow({
  question,
  stage,
  teams,
  players,
}: {
  question: Question;
  stage: Stage | undefined;
  teams: Team[];
  players: TournamentPlayer[];
}) {
  const options = correctValueOptions(question, teams, players);

  return (
    <AdminForm action={updateQuestion} submitLabel="Enregistrer">
      <input type="hidden" name="question_id" value={question.id} />

      <span className="grow">
        <strong style={{ fontSize: 13 }}>{question.label}</strong>
        <br />
        <span className="dim" style={{ fontSize: 11 }}>
          {stage?.label ?? "sans round"} · {question.kind}
        </span>
      </span>

      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
        <input type="checkbox" name="is_open" defaultChecked={question.is_open} />
        Ouverte
      </label>

      <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--muted)" }}>
        Points
        <input
          type="number"
          name="points"
          className="input"
          min={0}
          defaultValue={question.points}
          style={{ width: 80 }}
        />
      </label>

      <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--muted)" }}>
        Bonne réponse
        {options ? (
          <select
            name="correct_value"
            className="select"
            defaultValue={question.correct_value ?? ""}
            style={{ minWidth: 190 }}
          >
            <option value="">— non publiée —</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            name="correct_value"
            className="input"
            defaultValue={question.correct_value ?? ""}
            style={{ minWidth: 160 }}
          />
        )}
      </label>
    </AdminForm>
  );
}

/* ------------------------------------------------- rattachement Excel */

/**
 * Arbitrage d'un alias Excel.
 *
 * Les cas évidents sont déjà traités par `auto_link_alias()` en base :
 * cette ligne ne sert qu'aux refus de trancher. La suggestion la mieux
 * classée est présélectionnée — l'organisateur valide ou corrige, mais
 * rien ne s'applique sans son clic.
 */
export function AliasAdminRow({
  score,
  profiles,
  suggestions = [],
  twins = [],
  claimedAliasByProfile,
}: {
  score: LegacyScore;
  profiles: Profile[];
  suggestions?: AliasSuggestion[];
  twins?: string[];
  claimedAliasByProfile: Map<string, string>;
}) {
  const best = suggestions[0];
  const preselected = score.claimed_by ?? best?.profile.id ?? "";

  return (
    <div style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
      <AdminForm action={linkAlias} submitLabel="Rattacher">
        <input type="hidden" name="alias" value={score.alias} />

        <span className="grow">
          <strong style={{ fontSize: 13 }}>{score.alias}</strong>{" "}
          <span className="score">
            {score.group_points} pt{score.group_points > 1 ? "s" : ""}
          </span>
          {score.claim_method && (
            <span
              className="pill"
              style={{ marginLeft: 8, fontSize: 10 }}
              title={
                score.claim_method === "auto"
                  ? "Rattaché automatiquement sur correspondance du pseudo Discord"
                  : "Arbitré par un organisateur"
              }
            >
              {score.claim_method === "auto" ? "auto" : "manuel"}
            </span>
          )}
        </span>

        <select
          name="claimed_by"
          className="select"
          defaultValue={preselected}
          style={{ minWidth: 240 }}
        >
          <option value="">— non rattaché —</option>
          {profiles.map((p) => {
            const other = claimedAliasByProfile.get(p.id);
            const busy = other !== undefined && other !== score.alias;

            return (
              <option key={p.id} value={p.id} disabled={busy}>
                {p.display_name}
                {busy ? ` — déjà « ${other} »` : ""}
              </option>
            );
          })}
        </select>
      </AdminForm>

      {(best || twins.length > 0) && (
        <p className="sub" style={{ fontSize: 11, margin: "2px 0 0" }}>
          {best && (
            <>
              Proposé&nbsp;: <strong>{best.profile.display_name}</strong> ({best.reason})
              {suggestions.length > 1 && (
                <>
                  {" "}
                  · autres pistes&nbsp;:{" "}
                  {suggestions
                    .slice(1)
                    .map((s) => `${s.profile.display_name} (${s.reason})`)
                    .join(", ")}
                </>
              )}
            </>
          )}
          {best && twins.length > 0 && <br />}
          {twins.length > 0 && (
            <>
              ⚠ Le même pseudo apparaît aussi sous&nbsp;: {twins.join(", ")}. Un
              compte ne peut porter qu&apos;un seul alias — choisis lequel compte.
            </>
          )}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------- roster */

export function PlayerAdminRow({
  player,
  teams,
}: {
  player: TournamentPlayer;
  teams: Team[];
}) {
  return (
    <AdminForm action={assignPlayerTeam} submitLabel="Assigner">
      <input type="hidden" name="player_id" value={player.id} />

      <span className="grow">
        <strong style={{ fontSize: 13 }}>{player.ign}</strong>
      </span>

      <select
        name="team_id"
        className="select"
        defaultValue={player.team_id ?? ""}
        style={{ minWidth: 220 }}
      >
        <option value="">— sans équipe —</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </AdminForm>
  );
}
