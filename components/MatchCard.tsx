"use client";

import Countdown from "@/components/Countdown";
import TeamLogo from "@/components/TeamLogo";
import { effectiveLock, formatDateTime, lockState } from "@/lib/lock";
import type { LockReason, Match, Stage, Team } from "@/lib/types";

export interface MatchCardProps {
  match: Match;
  stage: Stage;
  teamA: Team | null;
  teamB: Team | null;
  /** Libellés de repli quand l'équipe n'est pas encore connue. */
  slotLabelA: string;
  slotLabelB: string;
  pickedTeamId: number | null;
  pointsAwarded: number | null;
  saving: boolean;
  onPick: (teamId: number) => void;
  onLockExpired: () => void;
}

function statusPill(match: Match, lock: LockReason) {
  if (match.status === "done") return <span className="pill done">Terminé</span>;
  if (match.status === "live") return <span className="pill live">En direct</span>;
  if (lock.kind === "open") return <span className="pill open">Ouvert</span>;
  return <span className="pill closed">Fermé</span>;
}

export default function MatchCard({
  match,
  stage,
  teamA,
  teamB,
  slotLabelA,
  slotLabelB,
  pickedTeamId,
  pointsAwarded,
  saving,
  onPick,
  onLockExpired,
}: MatchCardProps) {
  const lock = lockState(match, stage);
  const open = lock.kind === "open";
  const deadline = effectiveLock(match, stage);

  const slots: { team: Team | null; label: string; score: number | null }[] = [
    { team: teamA, label: slotLabelA, score: match.score_a },
    { team: teamB, label: slotLabelB, score: match.score_b },
  ];

  return (
    <article className={`matchbox${open ? "" : " locked"}`}>
      <header className="matchhead">
        <strong>{match.label ?? `Match ${match.order_index}`}</strong>
        <span>BO{match.best_of}</span>
        {statusPill(match, lock)}
        {open && deadline && (
          <span style={{ marginLeft: "auto" }}>
            <Countdown target={deadline} onExpire={onLockExpired} />
          </span>
        )}
      </header>

      {slots.map((slot, i) => {
        const isPicked = slot.team !== null && slot.team.id === pickedTeamId;
        const isWinner = slot.team !== null && slot.team.id === match.winner_team_id;
        const classes = [
          "team",
          slot.team ? "" : "tbd",
          isWinner ? "winner" : isPicked ? "selected" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={i}
            type="button"
            className={classes}
            disabled={!open || !slot.team || saving}
            onClick={() => slot.team && onPick(slot.team.id)}
            aria-pressed={isPicked}
          >
            <TeamLogo
              team={slot.team}
              fallbackText={slot.team ? slot.team.short_code : "?"}
              size={28}
            />
            <span style={{ fontWeight: 600 }}>{slot.team ? slot.team.name : slot.label}</span>
            <span className="flag">
              {isWinner
                ? `Vainqueur${slot.score !== null ? ` · ${slot.score}` : ""}`
                : isPicked
                  ? "Mon pronostic"
                  : open
                    ? "Choisir"
                    : ""}
            </span>
          </button>
        );
      })}

      <footer className="matchfoot">
        {!open && <span>{lock.message} </span>}

        {open && !pickedTeamId && <span>Choisis l&apos;équipe qui se qualifie. </span>}
        {open && pickedTeamId && (
          <span>Pronostic enregistré — modifiable jusqu&apos;à la date limite. </span>
        )}

        {match.status === "done" && pickedTeamId !== null && (
          <strong style={{ color: pointsAwarded ? "var(--green)" : "var(--red)" }}>
            {pointsAwarded
              ? `+${pointsAwarded} pt${pointsAwarded > 1 ? "s" : ""}`
              : "0 pt"}
          </strong>
        )}

        {match.status === "pending" && match.scheduled_at && (
          <span className="dim">· {formatDateTime(match.scheduled_at)}</span>
        )}
      </footer>
    </article>
  );
}
