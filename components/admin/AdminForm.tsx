"use client";

import { useActionState } from "react";

import type { ActionResult } from "@/app/admin/actions";

export type AdminAction = (
  prev: ActionResult | null,
  form: FormData,
) => Promise<ActionResult>;

export default function AdminForm({
  action,
  submitLabel = "Enregistrer",
  children,
}: {
  action: AdminAction;
  submitLabel?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="adminrow">
      {children}

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "…" : submitLabel}
      </button>

      {state && (
        <span
          role="status"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: state.ok ? "var(--green)" : "var(--red)",
          }}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
