"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import CrystalBall from "@/components/CrystalBall";
import MatchCard from "@/components/MatchCard";
import Toast, { type ToastState } from "@/components/Toast";
import { lockState } from "@/lib/lock";
import { createClient } from "@/lib/supabase/client";
import { translateDbError } from "@/lib/types";
import type {
  Match,
  Question,
  Stage,
  Team,
  TournamentPlayer,
} from "@/lib/types";

export interface PicksBoardProps {
  stages: Stage[];
  matches: Match[];
  teams: Team[];
  questions: Question[];
  players: TournamentPlayer[];
  slotLabels: Record<number, { a: string; b: string }>;
  initialPicks: Record<number, { team_id: number; points: number }>;
  initialAnswers: Record<number, string>;
  userId: string | null;
  /** Restreint l'affichage à une seule étape (page Finale). */
  onlyStageCode?: string;
}

export default function PicksBoard({
  stages,
  matches,
  teams,
  questions,
  players,
  slotLabels,
  initialPicks,
  initialAnswers,
  userId,
  onlyStageCode,
}: PicksBoardProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const visibleStages = useMemo(
    () => (onlyStageCode ? stages.filter((s) => s.code === onlyStageCode) : stages),
    [stages, onlyStageCode],
  );

  // Onglet par défaut : le premier round ouvert, sinon le dernier round entamé.
  const defaultCode = useMemo(() => {
    const open = visibleStages.find((s) => s.is_open);
    if (open) return open.code;
    const withResults = [...visibleStages]
      .reverse()
      .find((s) => matches.some((m) => m.stage_id === s.id && m.status !== "pending"));
    return withResults?.code ?? visibleStages[0]?.code ?? "";
  }, [visibleStages, matches]);

  const [activeCode, setActiveCode] = useState(defaultCode);
  const [picks, setPicks] = useState(initialPicks);
  const [answers, setAnswers] = useState(initialAnswers);
  const [savingMatches, setSavingMatches] = useState<Set<number>>(new Set());
  const [savingQuestions, setSavingQuestions] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);

  // Resynchronisation quand le serveur renvoie des données fraîches
  // (router.refresh après un événement Realtime, ou navigation).
  const picksKey = JSON.stringify(initialPicks);
  const answersKey = JSON.stringify(initialAnswers);
  useEffect(() => setPicks(initialPicks), [picksKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setAnswers(initialAnswers), [answersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Le bracket se remplit en direct pour tout le monde : dès que
  // l'organisateur publie un résultat, les slots « À déterminer » se
  // résolvent et le round suivant s'ouvre sans rechargement.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 400);
  }, [router]);

  useEffect(() => {
    const channel = supabase
      .channel("bracket")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "stages" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "questions" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [supabase, scheduleRefresh]);

  const withSaving = (
    setter: typeof setSavingMatches,
    id: number,
    on: boolean,
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function handlePick(matchId: number, teamId: number) {
    if (!userId) {
      setToast({ text: "Connecte-toi avec Discord pour pronostiquer.", kind: "error" });
      return;
    }

    const previous = picks[matchId];
    setPicks((p) => ({ ...p, [matchId]: { team_id: teamId, points: 0 } }));
    withSaving(setSavingMatches, matchId, true);

    const { error } = await supabase
      .from("picks")
      .upsert(
        { user_id: userId, match_id: matchId, team_id: teamId },
        { onConflict: "user_id,match_id" },
      );

    withSaving(setSavingMatches, matchId, false);

    if (error) {
      // La base a refusé : on remet l'état d'avant, l'UI ne ment jamais.
      setPicks((p) => {
        const next = { ...p };
        if (previous) next[matchId] = previous;
        else delete next[matchId];
        return next;
      });
      setToast({ text: translateDbError(error), kind: "error" });
      router.refresh();
      return;
    }

    setToast({ text: "Pronostic enregistré.", kind: "ok" });
  }

  async function handleAnswer(questionId: number, value: string) {
    if (!userId) {
      setToast({ text: "Connecte-toi avec Discord pour répondre.", kind: "error" });
      return;
    }

    const previous = answers[questionId];
    setAnswers((a) => ({ ...a, [questionId]: value }));
    withSaving(setSavingQuestions, questionId, true);

    const { error } = value
      ? await supabase
          .from("answers")
          .upsert(
            { user_id: userId, question_id: questionId, value },
            { onConflict: "user_id,question_id" },
          )
      : await supabase
          .from("answers")
          .delete()
          .eq("user_id", userId)
          .eq("question_id", questionId);

    withSaving(setSavingQuestions, questionId, false);

    if (error) {
      setAnswers((a) => ({ ...a, [questionId]: previous ?? "" }));
      setToast({ text: translateDbError(error), kind: "error" });
      return;
    }

    setToast({ text: "Réponse enregistrée.", kind: "ok" });
  }

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const activeStage = visibleStages.find((s) => s.code === activeCode);
  const stageMatches = matches.filter((m) => m.stage_id === activeStage?.id);
  const stageQuestions = questions.filter((q) => q.stage_id === activeStage?.id);

  return (
    <>
      {!userId && (
        <div className="notice warn">
          Tu n&apos;es pas connecté·e. Tes pronostics ne seront pas enregistrés —
          connecte-toi avec Discord en haut de page.
        </div>
      )}

      {!onlyStageCode && (
        <div className="tabs" role="tablist">
          {visibleStages.map((stage) => {
            const total = matches.filter((m) => m.stage_id === stage.id).length;
            const done = matches.filter(
              (m) => m.stage_id === stage.id && picks[m.id],
            ).length;

            return (
              <button
                key={stage.code}
                type="button"
                role="tab"
                className={`tab${stage.code === activeCode ? " active" : ""}`}
                aria-selected={stage.code === activeCode}
                onClick={() => setActiveCode(stage.code)}
              >
                <strong>{stage.label.toUpperCase()}</strong>
                <small>
                  {stage.is_open ? `${done}/${total} pronostiqués` : "Fermé"} ·{" "}
                  {stage.points_per_correct} pt
                  {stage.points_per_correct > 1 ? "s" : ""}
                </small>
              </button>
            );
          })}
        </div>
      )}

      {!activeStage ? (
        <div className="card empty">Aucun round à afficher.</div>
      ) : (
        <div className="layout">
          <div className="card">
            <h2 className="title-sm">{activeStage.label}</h2>
            <p className="sub">
              Choisis l&apos;équipe qui se qualifie dans chaque match —{" "}
              {activeStage.points_per_correct} pt
              {activeStage.points_per_correct > 1 ? "s" : ""} par bon pronostic.
            </p>

            <div className="notice">
              L&apos;équipe choisie avance dans ton pronostic ; l&apos;autre est
              considérée comme éliminée. Tu peux modifier ton choix jusqu&apos;à la
              date limite du match.
            </div>

            {stageMatches.length === 0 ? (
              <div className="empty">Aucun match dans ce round.</div>
            ) : (
              <div className="matches">
                {stageMatches.map((match) => {
                  const pick = picks[match.id];
                  return (
                    <MatchCard
                      key={match.id}
                      match={match}
                      stage={activeStage}
                      teamA={match.team_a_id ? teamsById.get(match.team_a_id) ?? null : null}
                      teamB={match.team_b_id ? teamsById.get(match.team_b_id) ?? null : null}
                      slotLabelA={slotLabels[match.id]?.a ?? "À déterminer"}
                      slotLabelB={slotLabels[match.id]?.b ?? "À déterminer"}
                      pickedTeamId={pick?.team_id ?? null}
                      pointsAwarded={pick?.points ?? null}
                      saving={savingMatches.has(match.id)}
                      onPick={(teamId) => handlePick(match.id, teamId)}
                      onLockExpired={scheduleRefresh}
                    />
                  );
                })}
              </div>
            )}

            {stageMatches.length > 0 && (
              <p className="sub" style={{ marginTop: 16 }}>
                {lockSummary(stageMatches, activeStage)}
              </p>
            )}
          </div>

          <aside className="card">
            <div className="ey">BOULE DE CRISTAL</div>
            <h2 className="title-sm">Prédictions bonus</h2>
            <p className="sub">
              Des points en plus, indépendants du bracket. Chaque réponse est
              enregistrée immédiatement.
            </p>

            <CrystalBall
              questions={stageQuestions}
              stage={activeStage}
              teams={teams}
              players={players}
              answers={answers}
              savingIds={savingQuestions}
              loggedIn={Boolean(userId)}
              onAnswer={handleAnswer}
            />
          </aside>
        </div>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function lockSummary(matches: Match[], stage: Stage): string {
  const open = matches.filter((m) => lockState(m, stage).kind === "open").length;
  if (open === 0) return "Plus aucun match pronosticable dans ce round.";
  return `${open} match${open > 1 ? "s" : ""} encore ouvert${open > 1 ? "s" : ""} aux pronostics.`;
}
