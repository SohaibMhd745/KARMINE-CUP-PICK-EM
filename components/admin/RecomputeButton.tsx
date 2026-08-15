"use client";

import { useState, useTransition } from "react";

import { recomputeScores, type ActionResult } from "@/app/admin/actions";

export default function RecomputeButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() =>
          startTransition(async () => setResult(await recomputeScores()))
        }
      >
        {pending ? "Recalcul…" : "Recalculer tous les points"}
      </button>

      {result && (
        <span
          role="status"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: result.ok ? "var(--green)" : "var(--red)",
          }}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}
