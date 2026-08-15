"use client";

import { useState } from "react";
import Image from "next/image";
import { getTeamLogoUrl } from "@/lib/teams";
import type { Team } from "@/lib/types";

export interface TeamLogoProps {
  team: Team | { name?: string; short_code?: string; logo_url?: string | null } | string | null | undefined;
  fallbackText?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function TeamLogo({
  team,
  fallbackText,
  size = 26,
  className = "",
  style = {},
}: TeamLogoProps) {
  const [error, setError] = useState(false);
  const logoUrl = getTeamLogoUrl(team);

  const teamName =
    typeof team === "string"
      ? team
      : team?.name ?? "";

  const shortCode =
    fallbackText ??
    (typeof team === "string"
      ? team.slice(0, 3).toUpperCase()
      : team?.short_code ?? "?");

  if (!logoUrl || error) {
    return (
      <span
        className={`team-logo-fallback ${className}`}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          fontSize: Math.max(9, Math.floor(size * 0.38)),
          ...style,
        }}
        aria-hidden="true"
        title={teamName || shortCode}
      >
        {shortCode}
      </span>
    );
  }

  return (
    <span
      className={`team-logo-wrap ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        ...style,
      }}
      title={teamName || shortCode}
    >
      <Image
        src={logoUrl}
        alt={teamName ? `Logo ${teamName}` : "Logo équipe"}
        width={size * 2}
        height={size * 2}
        className="team-logo-img"
        onError={() => setError(true)}
        unoptimized
      />
    </span>
  );
}
