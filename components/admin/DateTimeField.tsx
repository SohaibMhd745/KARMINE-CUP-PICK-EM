"use client";

import { useEffect, useState } from "react";

/**
 * Saisie de date locale, transmise en ISO (UTC) au serveur.
 *
 * Sans cette conversion, `new Date("2026-08-15T20:30")` serait interprété
 * dans le fuseau du serveur — UTC sur Vercel — et toutes les deadlines
 * seraient décalées de deux heures en été.
 *
 * La valeur initiale est posée après montage : la calculer au rendu
 * serveur produirait une heure serveur, donc un écart d'hydratation.
 */
export default function DateTimeField({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: string | null;
  label: string;
}) {
  const [local, setLocal] = useState("");

  useEffect(() => {
    setLocal(defaultValue ? toLocalInputValue(defaultValue) : "");
  }, [defaultValue]);

  return (
    <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--muted)" }}>
      {label}
      <input
        type="datetime-local"
        className="input"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        style={{ minWidth: 200 }}
      />
      <input
        type="hidden"
        name={name}
        value={local ? new Date(local).toISOString() : ""}
      />
    </label>
  );
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
