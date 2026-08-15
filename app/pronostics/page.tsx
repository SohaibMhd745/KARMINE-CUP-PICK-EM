import PicksBoard from "@/components/PicksBoard";
import {
  getMyAnswers,
  getMyPicks,
  getPlayers,
  getQuestions,
  getTournament,
  slotLabel,
} from "@/lib/data";
import { getProfile } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pronostics — Karmine Cup" };

export default async function PronosticsPage() {
  const profile = await getProfile();

  const [tournament, questions, players, myPicks, myAnswers] = await Promise.all([
    getTournament(),
    getQuestions(),
    getPlayers(),
    getMyPicks(profile?.id ?? null),
    getMyAnswers(profile?.id ?? null),
  ]);

  const pickableStages = tournament.stages.filter((s) => s.is_pickable);
  const stageIds = new Set(pickableStages.map((s) => s.id));
  const matches = tournament.matches.filter((m) => stageIds.has(m.stage_id));

  const slotLabels = Object.fromEntries(
    matches.map((m) => [
      m.id,
      { a: slotLabel(m, "a", tournament), b: slotLabel(m, "b", tournament) },
    ]),
  );

  const initialPicks = Object.fromEntries(
    [...myPicks.values()].map((p) => [
      p.match_id,
      { team_id: p.team_id, points: p.points },
    ]),
  );

  const initialAnswers = Object.fromEntries(
    [...myAnswers.values()].map((a) => [a.question_id, a.value]),
  );

  return (
    <>
      <div className="hero">
        <div>
          <div className="ey">PICK&apos;EM COMMUNAUTAIRE</div>
          <h1 className="hero-title title">Prêt·e à faire tes pronostics ?</h1>
          <p>
            Entre dans la compétition, suis les matchs et tente de deviner les
            moments qui feront l&apos;histoire de la Karmine Cup.
          </p>
        </div>
      </div>

      <PicksBoard
        stages={pickableStages}
        matches={matches}
        teams={tournament.teams}
        questions={questions}
        players={players}
        slotLabels={slotLabels}
        initialPicks={initialPicks}
        initialAnswers={initialAnswers}
        userId={profile?.id ?? null}
      />
    </>
  );
}
