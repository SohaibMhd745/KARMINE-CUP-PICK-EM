"use client";

import ActionButton from "@/components/admin/ActionButton";
import { autoLinkAliases } from "@/app/admin/actions";

export default function AutoLinkButton() {
  return (
    <ActionButton
      action={autoLinkAliases}
      label="Relancer le rattachement automatique"
      pendingLabel="Rattachement…"
    />
  );
}
