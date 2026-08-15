"use client";

import { useState, useTransition } from "react";

import type { ActionResult } from "@/app/admin/actions";

/** Pendant d'AdminForm pour les actions sans formulaire. */
export default function ActionButton({
  action,
  label,
  pendingLabel,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await action()))}
      >
        {pending ? pendingLabel : label}
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
