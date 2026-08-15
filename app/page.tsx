import Link from "next/link";

import RealtimeRefresh from "@/components/RealtimeRefresh";
import { getLeaderboard, getTournament } from "@/lib/data";
import { formatDateTime } from "@/lib/lock";
import { getProfile } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [profile, tournament, leaderboard] = await Promise.all([
    getProfile(),
    getTournament(),
    getLeaderboard(),
  ]);

  const openStages = tournament.stages.filter((s) => s.is_pickable && s.is_open);
  const top = leaderboard.slice(0, 5);
  const me = profile ? leaderboard.find((r) => r.user_id === profile.id) : undefined;

  const nextMatch = tournament.matches
    .filter((m) => m.status === "pending" && m.scheduled_at !== null)
    .sort(
      (a, b) =>
        new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime(),
    )[0];

  return (
    <>
      <RealtimeRefresh tables={["stages", "matches"]} />

      <div className="hero">
        <div>
          <div className="ey">PICK&apos;EM COMMUNAUTAIRE</div>
          <h1 className="hero-title" style={{ fontSize: "clamp(38px, 6vw, 76px)", lineHeight: 0.98, margin: "11px 0" }}>
            Prêt·e à faire
            <br />
            tes pronostics ?
          </h1>
          <p>
            Entre dans la compétition, suis les matchs et tente de deviner les
            moments qui feront l&apos;histoire de la Karmine Cup.
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="ey" style={{ color: "var(--cyan)" }}>
            {openStages.length > 0
              ? `${openStages.map((s) => s.label).join(" · ")} — ouvert`
              : "Pronostics fermés"}
          </div>
        </div>
      </div>

      <div className="layout">
        <div className="stack">
          <section className="card">
            <h2 className="title-sm">Comment ça marche</h2>
            <ol className="sub" style={{ paddingLeft: 20, lineHeight: 1.9 }}>
              <li>Connecte-toi avec Discord.</li>
              <li>
                À chaque round, choisis l&apos;équipe que tu vois se qualifier —
                modifiable jusqu&apos;à la date limite du match.
              </li>
              <li>
                Réponds aux questions bonus de la{" "}
                <strong>boule de cristal</strong> pour des points supplémentaires.
              </li>
              <li>
                Le round suivant s&apos;ouvre dès que l&apos;organisateur publie les
                résultats du précédent.
              </li>
            </ol>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <Link href="/pronostics" className="btn btn-primary">
                FAIRE MES PRONOSTICS
              </Link>
              <Link href="/reglement" className="btn">
                Règlement et barème
              </Link>
            </div>

            {nextMatch && (
              <div className="notice" style={{ marginBottom: 0 }}>
                Prochain match programmé :{" "}
                <strong>{nextMatch.label ?? `Match ${nextMatch.order_index}`}</strong> —{" "}
                {formatDateTime(nextMatch.scheduled_at)}.
              </div>
            )}
          </section>

          <section className="card">
            <div className="ey">ÉTAT DU TOURNOI</div>
            <h2 className="title-sm">Rounds</h2>
            {tournament.stages
              .filter((s) => s.is_pickable)
              .map((stage) => {
                const matches = tournament.matches.filter((m) => m.stage_id === stage.id);
                const done = matches.filter((m) => m.status === "done").length;

                return (
                  <div className="points" key={stage.id}>
                    <span>
                      {stage.label}{" "}
                      <span className={`pill ${stage.is_open ? "open" : "closed"}`}>
                        {stage.is_open ? "ouvert" : "fermé"}
                      </span>
                    </span>
                    <b style={{ color: "var(--muted)" }}>
                      {done}/{matches.length} joués · {stage.points_per_correct} pt
                      {stage.points_per_correct > 1 ? "s" : ""}
                    </b>
                  </div>
                );
              })}
          </section>
        </div>

        <aside className="card">
          <div className="ey">TOP 5</div>
          <h2 className="title-sm">Classement</h2>

          {top.length === 0 ? (
            <p className="sub">Classement vide.</p>
          ) : (
            top.map((row) => (
              <div className="points" key={row.user_id ?? `ghost:${row.legacy_alias}`}>
                <span>
                  <span className="rank">{row.position}.</span> {row.name}
                </span>
                <b>{row.total_points}</b>
              </div>
            ))
          )}

          {me && (
            <div className="notice" style={{ marginBottom: 0 }}>
              Ta position : <strong>#{me.position}</strong> avec{" "}
              <strong>{me.total_points} pt{me.total_points > 1 ? "s" : ""}</strong>.
            </div>
          )}

          <Link
            href="/classement"
            className="btn btn-block"
            style={{ marginTop: 14 }}
          >
            Voir tout le classement
          </Link>
        </aside>
      </div>
    </>
  );
}
