import { notFound } from "next/navigation";

import RecomputeButton from "@/components/admin/RecomputeButton";
import {
  AliasAdminRow,
  MatchAdminRow,
  PlayerAdminRow,
  QuestionAdminRow,
  StageAdminRow,
} from "@/components/admin/rows";
import {
  getLegacyScores,
  getPlayers,
  getQuestions,
  getTournament,
  slotLabel,
} from "@/lib/data";
import { formatDateTime } from "@/lib/lock";
import { createClient, getProfile } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Administration — Karmine Cup" };

export default async function AdminPage() {
  const profile = await getProfile();

  // 404 plutôt que 403 : la page n'existe pas pour qui n'y a pas droit,
  // et aucune donnée d'administration n'entre dans la réponse.
  if (!profile?.is_admin) notFound();

  const supabase = await createClient();

  const [tournament, questions, players, legacy, profilesRes, auditRes] =
    await Promise.all([
      getTournament(),
      getQuestions(),
      getPlayers(),
      getLegacyScores(),
      supabase.from("profiles").select("*").order("display_name"),
      supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  const profiles = (profilesRes.data ?? []) as Profile[];
  const audit = (auditRes.data ?? []) as {
    id: number;
    action: string;
    payload: unknown;
    created_at: string;
    actor_id: string | null;
  }[];

  const profileNames = new Map(profiles.map((p) => [p.id, p.display_name]));
  const pickableStages = tournament.stages.filter((s) => s.is_pickable);

  const unlinked = legacy.filter((l) => l.claimed_by === null);
  const linked = legacy.filter((l) => l.claimed_by !== null);
  const unassignedPlayers = players.filter((p) => p.team_id === null);

  const missingDeadlines = tournament.matches.filter((m) => {
    const stage = tournament.stagesById.get(m.stage_id);
    return (
      stage?.is_pickable &&
      stage.is_open &&
      m.status === "pending" &&
      !m.locks_at &&
      !stage.locks_at
    );
  });

  return (
    <>
      <div className="hero">
        <div>
          <div className="ey">ORGANISATEUR</div>
          <h1 className="title">Administration</h1>
          <p>
            Publie les résultats : le bracket se remplit et les points se
            recalculent automatiquement. Chaque action est journalisée.
          </p>
        </div>
      </div>

      {missingDeadlines.length > 0 && (
        <div className="notice warn">
          <strong>{missingDeadlines.length} match(s) ouverts sans date limite.</strong>{" "}
          Les pronostics y resteront modifiables indéfiniment. Renseigne une date
          limite par match, ou une date limite de round.
        </div>
      )}

      {/* ------------------------------------------------------- rounds */}
      <section className="card" style={{ marginBottom: 20 }}>
        <div className="ey">ÉTAPE 1</div>
        <h2 className="title-sm">Rounds et barème</h2>
        <p className="sub">
          Un round fermé n&apos;accepte aucun pronostic. Modifier un barème
          recalcule immédiatement les points déjà attribués sur ce round.
        </p>

        {pickableStages.map((stage) => (
          <StageAdminRow
            key={stage.id}
            stage={stage}
            matchCount={tournament.matches.filter((m) => m.stage_id === stage.id).length}
          />
        ))}

        <div style={{ marginTop: 16 }}>
          <RecomputeButton />
        </div>
      </section>

      {/* ------------------------------------------------------- matchs */}
      <section className="card" style={{ marginBottom: 20 }}>
        <div className="ey">ÉTAPE 2</div>
        <h2 className="title-sm">Résultats et horaires</h2>
        <p className="sub">
          Publier un vainqueur remplit automatiquement les slots «&nbsp;à
          déterminer&nbsp;» du tour suivant.
        </p>

        {pickableStages.map((stage) => {
          const matches = tournament.matches.filter((m) => m.stage_id === stage.id);
          if (matches.length === 0) return null;

          return (
            <div key={stage.id} style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 18, color: "var(--purple)" }}>{stage.label}</h3>
              {matches.map((match) => (
                <MatchAdminRow
                  key={match.id}
                  match={match}
                  stage={stage}
                  teamA={match.team_a_id ? tournament.teamsById.get(match.team_a_id) ?? null : null}
                  teamB={match.team_b_id ? tournament.teamsById.get(match.team_b_id) ?? null : null}
                  slotA={slotLabel(match, "a", tournament)}
                  slotB={slotLabel(match, "b", tournament)}
                />
              ))}
            </div>
          );
        })}
      </section>

      {/* ---------------------------------------------------- questions */}
      <section className="card" style={{ marginBottom: 20 }}>
        <div className="ey">ÉTAPE 3</div>
        <h2 className="title-sm">Boule de cristal</h2>
        <p className="sub">
          Ouvre les questions du round en cours. Publier une bonne réponse
          verrouille la question et attribue les points.
        </p>

        {pickableStages.map((stage) => {
          const stageQuestions = questions.filter((q) => q.stage_id === stage.id);
          if (stageQuestions.length === 0) return null;

          return (
            <div key={stage.id} style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 18, color: "var(--purple)" }}>{stage.label}</h3>
              {stageQuestions.map((question) => (
                <QuestionAdminRow
                  key={question.id}
                  question={question}
                  stage={stage}
                  teams={tournament.teams}
                  players={players}
                />
              ))}
            </div>
          );
        })}
      </section>

      {/* ------------------------------------------------- alias Excel */}
      <section className="card" style={{ marginBottom: 20 }}>
        <div className="ey">ÉTAPE 4</div>
        <h2 className="title-sm">Rattachement des scores de poule</h2>
        <p className="sub">
          {unlinked.length} alias Excel sur {legacy.length} ne sont pas encore
          reliés à un compte Discord. Ils apparaissent quand même au classement —
          le rattachement leur permet de continuer à marquer des points.
        </p>

        <h3 style={{ fontSize: 16, marginTop: 16 }}>Non rattachés</h3>
        {unlinked.length === 0 ? (
          <p className="sub">Tout est rattaché.</p>
        ) : (
          unlinked.map((score) => (
            <AliasAdminRow key={score.alias} score={score} profiles={profiles} />
          ))
        )}

        {linked.length > 0 && (
          <>
            <h3 style={{ fontSize: 16, marginTop: 20 }}>Déjà rattachés</h3>
            {linked.map((score) => (
              <AliasAdminRow key={score.alias} score={score} profiles={profiles} />
            ))}
          </>
        )}
      </section>

      {/* ------------------------------------------------------- roster */}
      <section className="card" style={{ marginBottom: 20 }}>
        <div className="ey">FACULTATIF</div>
        <h2 className="title-sm">Roster des joueurs</h2>
        <p className="sub">
          {unassignedPlayers.length} joueur(s) sans équipe. Sans incidence sur les
          pronostics — c&apos;est un confort d&apos;affichage pour la boule de
          cristal.
        </p>

        {players.map((player) => (
          <PlayerAdminRow key={player.id} player={player} teams={tournament.teams} />
        ))}
      </section>

      {/* -------------------------------------------------------- audit */}
      <section className="card">
        <div className="ey">TRAÇABILITÉ</div>
        <h2 className="title-sm">Journal des actions</h2>

        {audit.length === 0 ? (
          <p className="sub">Aucune action enregistrée.</p>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Quand</th>
                  <th scope="col">Qui</th>
                  <th scope="col">Action</th>
                  <th scope="col">Détail</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id}>
                    <td className="dim">{formatDateTime(entry.created_at)}</td>
                    <td>{entry.actor_id ? profileNames.get(entry.actor_id) ?? "—" : "—"}</td>
                    <td>
                      <code>{entry.action}</code>
                    </td>
                    <td className="dim" style={{ fontSize: 11, whiteSpace: "normal" }}>
                      {JSON.stringify(entry.payload)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
