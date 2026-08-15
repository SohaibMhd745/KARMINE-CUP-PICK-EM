import { computeStandings, getTournament } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata = { title: "Phase de groupe — Karmine Cup" };

export default async function GroupesPage() {
  const tournament = await getTournament();
  const groupStage = tournament.stagesByCode.get("group");

  const groupNames = [
    ...new Set(
      tournament.teams.map((t) => t.group_name).filter((g): g is string => Boolean(g)),
    ),
  ].sort();

  const groupMatches = groupStage
    ? tournament.matches.filter((m) => m.stage_id === groupStage.id)
    : [];

  return (
    <>
      <div className="hero">
        <div>
          <div className="ey">ARCHIVE</div>
          <h1 className="title">Phase de groupe</h1>
          <p>
            Résultats des groupes SYLVARIS et KARMINEA. Cette phase est terminée :
            elle n&apos;est plus pronosticable, mais les points marqués comptent au
            classement général.
          </p>
        </div>
      </div>

      <div className="groups">
        {groupNames.map((name) => {
          const standings = computeStandings(tournament, name);
          const teamIds = new Set(standings.map((s) => s.team.id));
          const matches = groupMatches.filter(
            (m) => m.team_a_id !== null && teamIds.has(m.team_a_id),
          );

          return (
            <section className="group" key={name}>
              <h3>GROUPE {name}</h3>

              <table className="standings">
                <tbody>
                  {standings.map((s, i) => (
                    <tr key={s.team.id}>
                      <td>
                        <strong>{i + 1}.</strong> {s.team.name}
                      </td>
                      <td>
                        {s.wins}V — {s.losses}D
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {matches.map((match) => {
                const a = match.team_a_id ? tournament.teamsById.get(match.team_a_id) : null;
                const b = match.team_b_id ? tournament.teamsById.get(match.team_b_id) : null;
                const winner = match.winner_team_id
                  ? tournament.teamsById.get(match.winner_team_id)
                  : null;

                return (
                  <div className="grouprow" key={match.id}>
                    <b>
                      {a?.name ?? "?"} vs {b?.name ?? "?"}
                    </b>
                    <span>
                      {winner ? `Vainqueur : ${winner.name}` : "Résultat inconnu"}
                    </span>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}
