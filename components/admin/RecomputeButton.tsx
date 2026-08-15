"use client";

import ActionButton from "@/components/admin/ActionButton";
import { recomputeScores } from "@/app/admin/actions";

export default function RecomputeButton() {
  return (
    <ActionButton
      action={recomputeScores}
      label="Recalculer tous les points"
      pendingLabel="Recalcul…"
    />
  );
}
