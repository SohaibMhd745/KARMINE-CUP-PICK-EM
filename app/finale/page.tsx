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

export const metadata = { title: "Grande finale — Karmine Cup" };

const FINAL_CODE = "r3";

export default async function FinalePage() {
  const profile = await getProfile();

  const [tournament, questions, players, myPicks, myAnswers] = await Promise.all([
    getTournament(),
    getQuestions(),
    getPlayers(),
    getMyPicks(profile?.id ?? null),
    getMyAnswers(profile?.id ?? null),
  ]);

  const finalStage = tournament.stagesByCode.get(FINAL_CODE);

  if (!finalStage) {
    return (
      <div className="card empty">
        La grande finale n&apos;est pas encore configurée.
      </div>
    );
  }

  const matches = tournament.matches.filter((m) => m.stage_id === finalStage.id);

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
          <div className="ey">GRANDE FINALE</div>
          <h1 className="title">La dernière prédiction.</h1>
          <p>
            La finale pèse plus lourd que les autres rounds :{" "}
            <strong>
              {finalStage.points_per_correct} pt
              {finalStage.points_per_correct > 1 ? "s" : ""}
            </strong>{" "}
            pour le bon vainqueur, plus les questions bonus.
          </p>
        </div>
      </div>

      <PicksBoard
        stages={[finalStage]}
        matches={matches}
        teams={tournament.teams}
        questions={questions}
        players={players}
        slotLabels={slotLabels}
        initialPicks={initialPicks}
        initialAnswers={initialAnswers}
        userId={profile?.id ?? null}
        onlyStageCode={FINAL_CODE}
      />
    </>
  );
}
