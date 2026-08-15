import { notFound } from "next/navigation";

import AutoLinkButton from "@/components/admin/AutoLinkButton";
import RecomputeButton from "@/components/admin/RecomputeButton";
import {
  AliasAdminRow,
  MatchAdminRow,
  PlayerAdminRow,
  QuestionAdminRow,
  StageAdminRow,
} from "@/components/admin/rows";
import { buildAliasReport } from "@/lib/alias";
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

interface AuditEntry {
  id: number;
  action: string;
  payload: unknown;
  created_at: string;
  actor_id: string | null;
}

/** Motifs renvoyés par `auto_link_alias()` (migration 0002). */
const AUTO_LINK_LABELS: Record<string, string> = {
  linked: "rattaché",
  ambiguous_alias: "alias en double",
  ambiguous_profile: "homonymes",
  alias_taken: "alias déjà pris",
};

export default async function AdminPage() {
  const profile = await getProfile();

  // 404 plutôt que 403 : la page n'existe pas pour qui n'y a pas droit,
  // et aucune donnée d'administration n'entre dans la réponse.
  if (!profile?.is_admin) notFound();

  const supabase = await createClient();

  const [tournament, questions, players, legacy, profilesRes, auditRes, autoRes] =
    await Promise.all([
      getTournament(),
      getQuestions(),
      getPlayers(),
      getLegacyScores(),
      supabase.from("profiles").select("*").order("display_name"),
      // Les rattachements automatiques ont leur propre bloc : sans ce
      // filtre, une vague d'inscriptions noierait le journal des actions
      // d'organisation au pire moment.
      supabase
        .from("audit_log")
        .select("*")
        .neq("action", "auto_link_alias")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("audit_log")
        .select("*")
        .eq("action", "auto_link_alias")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

  const profiles = (profilesRes.data ?? []) as Profile[];
  const audit = (auditRes.data ?? []) as AuditEntry[];
  const autoLinks = (autoRes.data ?? []) as (AuditEntry & {
    payload: { display_name?: string; alias?: string; outcome?: string } | null;
  })[];

  const profileNames = new Map(profiles.map((p) => [p.id, p.display_name]));
  const pickableStages = tournament.stages.filter((s) => s.is_pickable);

  const unlinked = legacy.filter((l) => l.claimed_by === null);
  const linked = legacy.filter((l) => l.claimed_by !== null);
  const unassignedPlayers = players.filter((p) => p.team_id === null);

  // Rapport de rattachement : la base a déjà traité les cas certains,
  // on ne présente ici que ce qui demande un arbitrage humain.
  const report = buildAliasReport(legacy, profiles);
  const claimedAliasByProfile = new Map(
    linked.map((l) => [l.claimed_by as string, l.alias]),
  );

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
          Les alias de l&apos;Excel étant les pseudos Discord des participants,
          le rattachement se fait <strong>tout seul à l&apos;inscription</strong>{" "}
          — et de nouveau à chaque changement de pseudo. Tu n&apos;interviens que
          sur ce qui suit, où la machine a refusé de trancher plutôt que de
          risquer d&apos;attribuer des points au mauvais participant.
        </p>

        <p className="sub">
          <strong>
            {report.linkedAuto.length + report.linkedByAdmin.length} / {legacy.length}
          </strong>{" "}
          alias rattachés, dont {report.linkedAuto.length} automatiquement.{" "}
          {unlinked.length} en attente — ils figurent quand même au classement,
          marqués « non rattaché ».
        </p>

        <div style={{ margin: "14px 0" }}>
          <AutoLinkButton />
        </div>

        {report.toArbitrate.length > 0 && (
          <>
            <h3 style={{ fontSize: 16, marginTop: 20 }}>
              À arbitrer ({report.toArbitrate.length})
            </h3>
            <p className="sub" style={{ fontSize: 12 }}>
              Un compte inscrit ressemble à cet alias, sans correspondre
              exactement. Vérifie et valide.
            </p>
            {report.toArbitrate.map((review) => (
              <AliasAdminRow
                key={review.score.alias}
                score={review.score}
                profiles={profiles}
                suggestions={review.suggestions}
                twins={review.twins}
                claimedAliasByProfile={claimedAliasByProfile}
              />
            ))}
          </>
        )}

        {report.orphans.length > 0 && (
          <>
            <h3 style={{ fontSize: 16, marginTop: 20 }}>
              Sans correspondance ({report.orphans.length})
            </h3>
            <p className="sub" style={{ fontSize: 12 }}>
              Aucun compte inscrit ne ressemble à ces alias : leur propriétaire
              ne s&apos;est probablement pas encore connecté. Rien à faire — ils
              se rattacheront d&apos;eux-mêmes.
            </p>
            {report.orphans.map((review) => (
              <AliasAdminRow
                key={review.score.alias}
                score={review.score}
                profiles={profiles}
                twins={review.twins}
                claimedAliasByProfile={claimedAliasByProfile}
              />
            ))}
          </>
        )}

        {linked.length > 0 && (
          <>
            <h3 style={{ fontSize: 16, marginTop: 20 }}>
              Déjà rattachés ({linked.length})
            </h3>
            {[...report.linkedAuto, ...report.linkedByAdmin].map((score) => (
              <AliasAdminRow
                key={score.alias}
                score={score}
                profiles={profiles}
                claimedAliasByProfile={claimedAliasByProfile}
              />
            ))}
          </>
        )}

        {report.unmatchedProfiles.length > 0 && (
          <p className="sub" style={{ fontSize: 12, marginTop: 18 }}>
            {report.unmatchedProfiles.length} compte(s) inscrit(s) sans score de
            poule — normal pour qui n&apos;a pas participé à la phase de groupes.
          </p>
        )}

        {autoLinks.length > 0 && (
          <>
            <h3 style={{ fontSize: 16, marginTop: 20 }}>
              Derniers rattachements automatiques
            </h3>
            <div className="tablewrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Quand</th>
                    <th scope="col">Pseudo Discord</th>
                    <th scope="col">Alias</th>
                    <th scope="col">Résultat</th>
                  </tr>
                </thead>
                <tbody>
                  {autoLinks.map((entry) => (
                    <tr key={entry.id}>
                      <td className="dim">{formatDateTime(entry.created_at)}</td>
                      <td>{entry.payload?.display_name ?? "—"}</td>
                      <td>{entry.payload?.alias ?? "—"}</td>
                      <td>
                        <span
                          className={`pill ${
                            entry.payload?.outcome === "linked" ? "done" : "closed"
                          }`}
                        >
                          {AUTO_LINK_LABELS[entry.payload?.outcome ?? ""] ??
                            entry.payload?.outcome ??
                            "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                    <td>
                      {entry.actor_id
                        ? profileNames.get(entry.actor_id) ?? "—"
                        : "automatique"}
                    </td>
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
