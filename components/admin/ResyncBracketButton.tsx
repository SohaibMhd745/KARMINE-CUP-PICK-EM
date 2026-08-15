"use client";

import ActionButton from "@/components/admin/ActionButton";
import { resyncBracket } from "@/app/admin/actions";

export default function ResyncBracketButton() {
  return (
    <ActionButton
      action={resyncBracket}
      label="Synchroniser le bracket"
      pendingLabel="Synchronisation…"
    />
  );
}
