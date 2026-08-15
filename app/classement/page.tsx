import RealtimeRefresh from "@/components/RealtimeRefresh";
import { getLeaderboard } from "@/lib/data";
import { getProfile } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Classement — Karmine Cup" };

export default async function ClassementPage() {
  const [profile, rows] = await Promise.all([getProfile(), getLeaderboard()]);

  const unclaimed = rows.filter((r) => r.is_ghost).length;

  return (
    <>
      <RealtimeRefresh tables={["picks", "matches", "questions"]} />

      <div className="hero">
        <div>
          <div className="ey">CLASSEMENT GÉNÉRAL</div>
          <h1 className="title">Les visionnaires.</h1>
          <p>
            Points de poule (importés de l&apos;Excel) + play-offs + finale. Le
            classement se met à jour en direct dès qu&apos;un résultat est publié.
          </p>
        </div>
      </div>

      <div className="card">
        {unclaimed > 0 && (
          <div className="notice">
            {unclaimed} participant{unclaimed > 1 ? "s" : ""} de la phase de poule
            {unclaimed > 1 ? " ne sont" : " n'est"} pas encore rattaché
            {unclaimed > 1 ? "s" : ""} à un compte Discord. Leur score de poule est
            conservé ; connecte-toi et demande à l&apos;organisateur de faire le
            rapprochement pour continuer à marquer des points.
          </div>
        )}

        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Participant</th>
                <th scope="col">Groupe</th>
                <th scope="col">Play-offs</th>
                <th scope="col">Finale</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    Classement vide pour l&apos;instant.
                  </td>
                </tr>
              )}

              {rows.map((row) => {
                const isMe = profile !== null && row.user_id === profile.id;

                return (
                  <tr
                    key={row.user_id ?? `ghost:${row.legacy_alias}`}
                    className={isMe ? "me" : undefined}
                  >
                    <td className="rank">{row.position}</td>
                    <td className="name">
                      {row.avatar_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img className="avatar" src={row.avatar_url} alt="" />
                      )}
                      {row.name}
                      {isMe && <span className="ghost-tag">toi</span>}
                      {row.is_ghost && (
                        <span className="ghost-tag" title="Alias Excel non rattaché">
                          non rattaché
                        </span>
                      )}
                    </td>
                    <td>{row.group_points || <span className="dim">—</span>}</td>
                    <td>{row.playoff_points || <span className="dim">—</span>}</td>
                    <td>{row.final_points || <span className="dim">—</span>}</td>
                    <td className="score">{row.total_points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="sub" style={{ marginTop: 16 }}>
          Égalité au total ? Départage : le plus de points sur la finale, puis sur
          les play-offs, puis le pronostic enregistré le plus tôt.{" "}
          <a href="/reglement">Voir le règlement</a>.
        </p>
      </div>
    </>
  );
}
