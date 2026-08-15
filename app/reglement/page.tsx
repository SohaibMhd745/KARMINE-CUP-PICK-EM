import { getQuestions, getSettings, getTournament } from "@/lib/data";
import { formatDateTime } from "@/lib/lock";

export const dynamic = "force-dynamic";

export const metadata = { title: "Règlement — Karmine Cup" };

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

export default async function ReglementPage() {
  const [tournament, questions, settings] = await Promise.all([
    getTournament(),
    getQuestions(),
    getSettings(),
  ]);

  const pickable = tournament.stages.filter((s) => s.is_pickable);

  return (
    <>
      <div className="hero">
        <div>
          <div className="ey">RÈGLES DU JEU</div>
          <h1 className="title">Règlement</h1>
          <p>
            Barème, dates limites et règle de départage. Des lots sont en jeu :
            tout est public et vérifiable.
          </p>
        </div>
      </div>

      <div className="layout">
        <div className="stack">
          <section className="card">
            <h2 className="title-sm">Barème</h2>
            <div className="tablewrap">
              <table className="table" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th scope="col">Round</th>
                    <th scope="col">Points par bon pronostic</th>
                    <th scope="col">Questions bonus</th>
                    <th scope="col">Date limite</th>
                  </tr>
                </thead>
                <tbody>
                  {pickable.map((stage) => {
                    const stageQuestions = questions.filter(
                      (q) => q.stage_id === stage.id,
                    );
                    const bonus = stageQuestions.reduce((sum, q) => sum + q.points, 0);

                    return (
                      <tr key={stage.id}>
                        <td>{stage.label}</td>
                        <td className="score">{stage.points_per_correct}</td>
                        <td>
                          {stageQuestions.length === 0 ? (
                            <span className="dim">—</span>
                          ) : (
                            `${stageQuestions.length} question${stageQuestions.length > 1 ? "s" : ""} · ${bonus} pts max`
                          )}
                        </td>
                        <td className="dim">
                          {stage.locks_at ? formatDateTime(stage.locks_at) : "à l'heure du match"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="sub" style={{ marginTop: 12 }}>
              Les points de la <strong>phase de groupe</strong> proviennent des
              sondages menés avant l&apos;ouverture du site ; ils sont repris tels
              quels au classement général.
            </p>
          </section>

          <section className="card">
            <h2 className="title-sm">Déroulement</h2>
            <ul className="sub" style={{ paddingLeft: 20, lineHeight: 1.9 }}>
              <li>
                Les rounds s&apos;ouvrent <strong>progressivement</strong> : tu
                pronostiques un round quand ses affiches sont connues, c&apos;est-à-dire
                dès que les résultats du round précédent sont publiés.
              </li>
              <li>
                Un pronostic est <strong>modifiable</strong> autant de fois que tu
                veux jusqu&apos;à la date limite du match.
              </li>
              <li>
                Passée la date limite, plus aucune modification n&apos;est possible.
                Ce verrou est appliqué par la base de données, pas par le site :
                il n&apos;est pas contournable.
              </li>
              <li>
                Un pronostic non renseigné vaut <strong>0 point</strong>. Aucun
                malus.
              </li>
            </ul>
          </section>

          <section className="card">
            <h2 className="title-sm">Départage</h2>
            <p className="sub">
              {text(
                settings.tiebreak,
                "En cas d'égalité au total : 1) le plus de points sur la finale, 2) le plus de points sur les play-offs, 3) le pronostic enregistré le plus tôt.",
              )}
            </p>
          </section>
        </div>

        <aside className="stack">
          <section className="card">
            <div className="ey">RÉCOMPENSES</div>
            <h2 className="title-sm">Lots</h2>
            <p className="sub">
              {text(
                settings.prizes,
                "Des lots récompensent le haut du classement général à l'issue de la grande finale.",
              )}
            </p>
          </section>

          <section className="card">
            <div className="ey">INTÉGRITÉ</div>
            <h2 className="title-sm">Comment on garantit l&apos;équité</h2>
            <ul className="sub" style={{ paddingLeft: 18, lineHeight: 1.8 }}>
              <li>Les pronostics d&apos;autrui restent invisibles jusqu&apos;au verrouillage.</li>
              <li>Les dates limites sont imposées côté serveur.</li>
              <li>Chaque action de l&apos;organisateur est journalisée.</li>
              <li>Le calcul des points est automatique et recalculable à l&apos;identique.</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
