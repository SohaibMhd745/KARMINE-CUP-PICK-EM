"use client";

import { CHAMPIONS } from "@/lib/champions";
import { isQuestionOpen } from "@/lib/lock";
import type { Question, Stage, Team, TournamentPlayer } from "@/lib/types";

export interface CrystalBallProps {
  questions: Question[];
  stage: Stage | undefined;
  teams: Team[];
  players: TournamentPlayer[];
  answers: Record<number, string>;
  savingIds: Set<number>;
  loggedIn: boolean;
  onAnswer: (questionId: number, value: string) => void;
}

function optionsFor(
  question: Question,
  teams: Team[],
  players: TournamentPlayer[],
): string[] {
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
      return [];
  }
}

export default function CrystalBall({
  questions,
  stage,
  teams,
  players,
  answers,
  savingIds,
  loggedIn,
  onAnswer,
}: CrystalBallProps) {
  if (questions.length === 0) {
    return (
      <p className="sub">
        Aucune question pour ce round — l&apos;organisateur peut en ouvrir à tout
        moment.
      </p>
    );
  }

  return (
    <>
      {questions.map((question) => {
        const open = isQuestionOpen(question, stage) && loggedIn;
        const value = answers[question.id] ?? "";
        const resolved = question.correct_value !== null;
        const correct =
          resolved && value !== "" &&
          value.trim().toLowerCase() === question.correct_value!.trim().toLowerCase();

        return (
          <div className="question" key={question.id}>
            <label htmlFor={`q-${question.id}`}>{question.label}</label>

            {question.kind === "number" ? (
              <input
                id={`q-${question.id}`}
                className="input"
                type="number"
                inputMode="numeric"
                value={value}
                disabled={!open || savingIds.has(question.id)}
                onChange={(e) => onAnswer(question.id, e.target.value)}
              />
            ) : (
              <select
                id={`q-${question.id}`}
                className="select"
                value={value}
                disabled={!open || savingIds.has(question.id)}
                onChange={(e) => onAnswer(question.id, e.target.value)}
              >
                <option value="">— Choisir —</option>
                {optionsFor(question, teams, players).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            <div className="qmeta">
              <span>
                {question.points} pt{question.points > 1 ? "s" : ""}
              </span>
              <span>
                {resolved ? (
                  <>
                    Réponse : <strong>{question.correct_value}</strong>
                    {value !== "" && (
                      <strong style={{ color: correct ? "var(--green)" : "var(--red)" }}>
                        {correct ? " ✓" : " ✕"}
                      </strong>
                    )}
                  </>
                ) : !loggedIn ? (
                  "Connecte-toi pour répondre"
                ) : !question.is_open ? (
                  "Pas encore ouverte"
                ) : open ? (
                  "Modifiable jusqu'à la date limite"
                ) : (
                  "Verrouillée"
                )}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
